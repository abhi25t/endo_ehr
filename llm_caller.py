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

# ── Defaults (overridden by llm_config dict passed to call_llm / generate_sentences_report) ──
_DEFAULT_LLM_LOCATION = "us-central1"
_DEFAULT_LLM_MODEL = "gemini-2.5-flash"
_DEFAULT_VOICE_TEMP = 0.1
_DEFAULT_VOICE_MAX_TOKENS = 8192
_DEFAULT_SENTENCES_TEMP = 0.3
_DEFAULT_SENTENCES_MAX_TOKENS = 8192

# ── Lazy init ──
_model = None
_init_location = None
_init_model_name = None


def _get_model(llm_config: dict | None = None) -> GenerativeModel:
    global _model, _init_location, _init_model_name
    cfg = llm_config or {}
    location = cfg.get("location", _DEFAULT_LLM_LOCATION)
    model_name = cfg.get("model", _DEFAULT_LLM_MODEL)

    # Re-init if config changed
    if _model is None or location != _init_location or model_name != _init_model_name:
        creds, project_id = default()
        vertexai.init(project=project_id, location=location)
        _model = GenerativeModel(model_name)
        _init_location = location
        _init_model_name = model_name
        log.info("Gemini model initialized: %s @ %s", model_name, location)
    return _model


# ── System Prompt ──

_SYSTEM_PROMPT_TEMPLATE = """\
You are assisting with filling a structured {procedure} EHR (Electronic Health Record) during a live procedure.

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
- Sublocations use the format defined in the schema. For matrix-based locations they use "Region - Option" format (e.g., "Antrum - Lesser Curvature"). For simple locations they are plain strings.
- PRESERVE all existing data the doctor did not mention or change
- Handle corrections: "Correction:", "No I meant...", "Change that to...", "Actually it's..."
  → Override the relevant field, don't add new entries
- "Remove/Delete [disease]" → remove that disease entirely from report
- If the doctor mentions "overall" remarks or general observations not tied to a specific
  disease, put them in the "overallRemarks" field. Append to existing remarks, don't replace.
- For input fields with patterns like "Measured: int_box mm", fill the values array with the
  spoken numbers. E.g., doctor says "size is 15 mm" → values: ["15"]

GARBAGE FILTERING — CRITICAL:
- Only update the report based on statements clearly about the CURRENT {procedure} procedure
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
{{
  "report": {{
    "<LocationName>": {{
      "diseases": {{
        "<DiseaseName>": {{
          "sublocations": ["..."],
          "sections": {{
            "<SectionName>": {{
              "attrs": {{ "<AttributeName>": true }},
              "inputs": [],
              "subsections": {{
                "<SubsectionName>": {{
                  "attrs": {{ "<AttributeName>": true }},
                  "inputs": []
                }}
              }}
            }}
          }},
          "comments": ""
        }}
      }}
    }}
  }},
  "overallRemarks": "..."
}}

Return ONLY valid JSON. No markdown, no explanation, no code fences.
"""

def _get_system_prompt(procedure_type: str = "endoscopy") -> str:
    return _SYSTEM_PROMPT_TEMPLATE.format(procedure=procedure_type)


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
    procedure_type: str = "endoscopy",
    llm_config: dict | None = None,
) -> dict | None:
    """
    Call Gemini to update EHR report from transcript.

    Returns:
        dict with {"report": {...}, "overallRemarks": "..."} or None on failure.
    """
    cfg = llm_config or {}
    model = _get_model(llm_config)

    system_prompt = _get_system_prompt(procedure_type)
    user_prompt = _build_prompt(schema, current_report, overall_remarks, transcript)

    generation_config = GenerationConfig(
        temperature=cfg.get("voice_temperature", _DEFAULT_VOICE_TEMP),
        max_output_tokens=cfg.get("voice_max_tokens", _DEFAULT_VOICE_MAX_TOKENS),
        response_mime_type="application/json",
    )

    log.info("LLM call: transcript=%r (%d chars)", transcript[:80], len(transcript))

    try:
        response = await model.generate_content_async(
            [system_prompt, user_prompt],
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
            # Maybe LLM returned report at top level — check for known location names
            valid_locs = set(schema.get("locations", []))
            if any(k in result for k in valid_locs):
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
You are an expert endoscopy/colonoscopy report writer. You will receive structured JSON data \
from a hospital's EHR system.

Convert it into crisp, typical sentences using the standard jargon of an \
endoscopy or colonoscopy report as appropriate. Use words which doctors typically use such as \
"suspected", "noted", "seen", "revealed", "appeared", "suggestive of", etc.

RULES:
- Do NOT use bullet points. Use sentences only.
- Use appropriate headings for locations, organs, and diseases.
- Group findings by anatomical location.
- Be concise but medically precise.
- Include all sublocations, attributes, and relevant details from the JSON.
- If overall remarks exist, include them at the end.

FORMAT your output as HTML:
- <h2> for anatomical locations
- <h3> for disease/finding names
- <p> for descriptive sentences
- Use <strong> for emphasis on key findings
- Use <em> for qualifiers like "suspected", "possible"
- Do NOT wrap in ```html code fences. Return raw HTML only.
"""


async def generate_sentences_report(report_json: dict,
                                    llm_config: dict | None = None) -> str | None:
    """
    Call Gemini to convert structured EHR JSON into natural language sentences.

    Args:
        report_json: The report data (report, overallRemarks, optionally __retroMeta)
        llm_config: Optional LLM configuration dict from config.yaml

    Returns:
        HTML string with formatted sentences report, or None on failure.
    """
    cfg = llm_config or {}
    model = _get_model(llm_config)

    user_prompt = json.dumps(report_json, indent=2, ensure_ascii=False)

    generation_config = GenerationConfig(
        temperature=cfg.get("sentences_temperature", _DEFAULT_SENTENCES_TEMP),
        max_output_tokens=cfg.get("sentences_max_tokens", _DEFAULT_SENTENCES_MAX_TOKENS),
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
