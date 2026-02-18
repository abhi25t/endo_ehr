"""
LLM Caller — Uses Gemini 2.5 Flash to update EHR JSON from voice transcripts.

Single-shot calls: sends schema + current report + transcript each time.
Returns updated report JSON with {report, overallRemarks}.
"""

import json
import logging

import vertexai
from google.auth import default
from vertexai.generative_models import GenerativeModel, GenerationConfig

log = logging.getLogger("ehr-voice")

# ── Config ──
LLM_LOCATION = "us-central1"
LLM_MODEL = "gemini-2.5-flash"

# ── Lazy init ──
_model = None


def _get_model() -> GenerativeModel:
    global _model
    if _model is None:
        creds, project_id = default()
        vertexai.init(project=project_id, location=LLM_LOCATION)
        _model = GenerativeModel(LLM_MODEL)
        log.info("Gemini model initialized: %s @ %s", LLM_MODEL, LLM_LOCATION)
    return _model


# ── System Prompt ──

SYSTEM_PROMPT = """\
You are assisting with filling a structured endoscopy EHR (Electronic Health Record) during a live procedure.

You will receive:
1. A SCHEMA defining all valid diseases, locations, sections, subsections, and attribute values
2. The CURRENT STATE of the report (may be empty or partially filled)
3. A TRANSCRIPT of what the doctor just dictated

YOUR TASK: Update the report JSON based on the transcript.

RULES:
- Only use disease names, sections, attributes that exist in the schema
- Each disease must go under a valid location (check disease's "locations" array in schema)
- For single-select sections (multi: false): set only ONE attribute to true, set others to false/remove
- For multi-select sections (multi: true): multiple attributes can be true simultaneously
- Sublocations for Stomach/Duodenum use "Region - Option" format (e.g., "Antrum - Lesser Curvature")
- Sublocations for Esophagus/GE Junction are plain strings (e.g., "Lower", "Z-line")
- PRESERVE all existing data the doctor did not mention or change
- Handle corrections: "Correction:", "No I meant...", "Change that to...", "Actually it's..."
  → Override the relevant field, don't add new entries
- "Remove/Delete [disease]" → remove that disease entirely from report
- If the doctor mentions "overall" remarks or general observations not tied to a specific
  disease, put them in the "overallRemarks" field. Append to existing remarks, don't replace.
- For input fields with patterns like "Measured: int_box mm", fill the values array with the
  spoken numbers. E.g., doctor says "size is 15 mm" → values: ["15"]

GARBAGE FILTERING — CRITICAL:
- Only update the report based on statements clearly about the CURRENT endoscopy procedure
- Text in non-Latin script (Devanagari, Telugu, etc.) = side conversation → IGNORE entirely
- Code-switched sentences (Hindi/Telugu with English medical terms): only extract if the
  medical terms clearly describe a CURRENT finding
- IGNORE discussions about OTHER patients or old cases, even with medical terms.
  Cues: past tense ("he had", "she was"), other patients ("remember patient X",
  "that case from last week"), comparative ("we should compare", "similar to")
- IGNORE side conversations, gossip, or non-medical chatter entirely
- When in doubt whether speech is about the current procedure → return report UNCHANGED
- It is better to miss a finding (doctor can repeat) than to add incorrect data

OUTPUT FORMAT — return ONLY this JSON structure:
{
  "report": {
    "<LocationName>": {
      "diseases": {
        "<DiseaseName>": {
          "sublocations": ["..."],
          "sections": {
            "<SectionName>": {
              "attrs": { "<AttributeName>": true },
              "inputs": [],
              "subsections": {
                "<SubsectionName>": {
                  "attrs": { "<AttributeName>": true },
                  "inputs": []
                }
              }
            }
          },
          "comments": ""
        }
      }
    }
  },
  "overallRemarks": "..."
}

Return ONLY valid JSON. No markdown, no explanation, no code fences.
"""


def _build_prompt(schema: dict, current_report: dict, overall_remarks: str, transcript: str) -> str:
    """Build the user prompt with schema, current state, and transcript."""
    parts = []

    parts.append("=== SCHEMA ===")
    parts.append(json.dumps(schema, separators=(",", ":"), ensure_ascii=False))

    parts.append("\n=== CURRENT REPORT STATE ===")
    current_state = {
        "report": current_report or {},
        "overallRemarks": overall_remarks or "",
    }
    parts.append(json.dumps(current_state, separators=(",", ":"), ensure_ascii=False))

    parts.append("\n=== TRANSCRIPT ===")
    parts.append(transcript)

    parts.append("\n=== INSTRUCTION ===")
    parts.append("Update the report based on the transcript. Return the complete updated JSON.")

    return "\n".join(parts)


async def call_llm(
    schema: dict,
    current_report: dict,
    overall_remarks: str,
    transcript: str,
) -> dict | None:
    """
    Call Gemini to update EHR report from transcript.

    Returns:
        dict with {"report": {...}, "overallRemarks": "..."} or None on failure.
    """
    model = _get_model()

    user_prompt = _build_prompt(schema, current_report, overall_remarks, transcript)

    generation_config = GenerationConfig(
        temperature=0.1,
        max_output_tokens=8192,
        response_mime_type="application/json",
    )

    log.info("LLM call: transcript=%r (%d chars)", transcript[:80], len(transcript))

    try:
        response = await model.generate_content_async(
            [SYSTEM_PROMPT, user_prompt],
            generation_config=generation_config,
        )

        if not response.text:
            log.warning("LLM returned empty response")
            return None

        result = json.loads(response.text)

        if not isinstance(result, dict):
            log.warning("LLM returned non-dict: %s", type(result))
            return None

        # Ensure expected keys exist
        if "report" not in result:
            # Maybe LLM returned report at top level
            if any(k in result for k in ("Esophagus", "GE Junction", "Stomach", "Duodenum")):
                result = {"report": result, "overallRemarks": overall_remarks or ""}
            else:
                log.warning("LLM response missing 'report' key")
                return None

        if "overallRemarks" not in result:
            result["overallRemarks"] = overall_remarks or ""

        log.info("LLM response: %d locations", len(result.get("report", {})))
        return result

    except json.JSONDecodeError as e:
        log.warning("LLM response not valid JSON: %s", e)
        return None
    except Exception as e:
        log.exception("LLM call failed")
        raise


# ── Sentences Report ──

SENTENCES_REPORT_PROMPT = """\
You are an expert endoscopy report writer. You will receive structured JSON data \
from a hospital's endoscopy EHR system.

Convert it into crisp, typical sentences using the standard jargon of an \
endoscopy report. Use words which doctors typically use such as "suspected", \
"noted", "seen", "revealed", "appeared", "suggestive of", etc.

RULES:
- Do NOT use bullet points. Use sentences only.
- Use appropriate headings for locations, organs, and diseases.
- Group findings by anatomical location.
- Be concise but medically precise.
- Include all sublocations, attributes, and relevant details from the JSON.
- If overall remarks exist, include them at the end.

FORMAT your output as HTML:
- <h2> for anatomical locations (Esophagus, GE Junction, Stomach, Duodenum)
- <h3> for disease/finding names
- <p> for descriptive sentences
- Use <strong> for emphasis on key findings
- Use <em> for qualifiers like "suspected", "possible"
- Do NOT wrap in ```html code fences. Return raw HTML only.
"""


async def generate_sentences_report(report_json: dict) -> str | None:
    """
    Call Gemini to convert structured EHR JSON into natural language sentences.

    Args:
        report_json: The report data (report, overallRemarks, optionally __retroMeta)

    Returns:
        HTML string with formatted sentences report, or None on failure.
    """
    model = _get_model()

    user_prompt = json.dumps(report_json, indent=2, ensure_ascii=False)

    generation_config = GenerationConfig(
        temperature=0.3,
        max_output_tokens=8192,
    )

    log.info("Sentences report LLM call: %d chars input", len(user_prompt))

    try:
        response = await model.generate_content_async(
            [SENTENCES_REPORT_PROMPT, user_prompt],
            generation_config=generation_config,
        )

        if not response.text:
            log.warning("Sentences report: LLM returned empty response")
            return None

        log.info("Sentences report generated: %d chars", len(response.text))
        return response.text

    except Exception:
        log.exception("Sentences report LLM call failed")
        raise
