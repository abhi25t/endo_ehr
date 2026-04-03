# Voice-Based HCI (Human-Computer Interaction)

This document covers the voice dictation system — a voice-based HCI layer added on top of the manual EHR. The doctor speaks into a microphone, and the system automatically fills the EHR form via: Microphone → ASR (Google Cloud STT Chirp3) → LLM (Gemini 2.5 Flash) → automatic form update.

**Requires server mode** (`python server.py`). Not available in standalone file:// mode.

## Architecture

```
Browser (Chrome)                          Python Backend (FastAPI)
================                          =======================

Microphone
  → AudioWorklet (16kHz PCM Int16)
  → WebSocket binary frames ──────────→  WebSocket handler (/ws/voice)
                                              │
                                              ├─→ audio_queue (asyncio.Queue)
                                              │       │
                                              │       ▼
                                              │   ASR Bridge (background thread)
                                              │     Google Cloud STT v2 streaming
                                              │     Chirp3 model, phrase hints
                                              │       │
                                              │       ▼ transcript results
                                              │   transcript_queue (asyncio.Queue)
                                              │       │
                                              │       ▼
                                              │   Transcript Batcher
                                              │     (debounce 1.5s, accumulate finals)
                                              │       │
                                              │       ▼
                                              │   LLM Caller
                                              │     Gemini 2.5 Flash (single-shot)
                                              │     schema + current_report + transcript
                                              │       │
                                              │       ▼ updated report JSON
  ← WebSocket text frame ←───────────────────┘

applyVoiceUpdate(report)
  → report = newReport
  → populateColumns()
  → renderSubLocChips()
  → renderReport()
  → openDetails() (preserve active disease)
```

## Pipeline Components

| Component | File | Purpose |
|-----------|------|---------|
| WebSocket Server | `server.py` | FastAPI app, serves frontend, WebSocket lifecycle management |
| Session State | `server.py:SessionState` | Per-connection state: queues, report, schema, pause flag |
| Transcript Batcher | `server.py:transcript_batcher()` | Debounce 1.5s, accumulate finals, pre-LLM filtering |
| ASR Bridge | `asr_bridge.py` | Async→sync queue bridge, STT thread, auto-restart on 5min timeout |
| LLM Caller | `llm_caller.py` | Gemini prompt construction, response parsing, lazy init |
| Schema Builder | `schema_builder.py` | CSV → canonical schema JSON for LLM context |
| Pydantic Models | `models.py` | EHRReport, DiseaseEntry, SectionEntry validation |
| Frontend Voice | `src/js/19-voice.js` | Audio capture, WebSocket client, applyVoiceUpdate(), UI |

## Voice Command Keywords

Voice commands (pause, resume, capture photo) are configured in `config.yaml` → `voice.commands`. Detected pre-LLM: Pause stops LLM calls (ASR continues); Resume restarts LLM pipeline; Capture Photo is a stub.

## Two-Layer Garbage Filtering

1. **Pre-LLM (server.py)**: Skip transcripts with <2 meaningful words after removing filler words (configurable via `config.yaml` → `voice.filler_words`). Also intercepts voice commands before LLM.
2. **LLM Prompt**: Instructs Gemini to ignore non-medical chatter, past-tense references to other patients, non-Latin script (Hindi/Telugu side conversations), and return report unchanged when in doubt.

## WebSocket Protocol

**Client → Server:**

| Frame | Format | Purpose |
|-------|--------|---------|
| Text | `{"type":"init", "csv_text":"...", "report":{...}, "procedure_type":"endoscopy"}` | Initialize session with CSV, current report, and procedure type |
| Binary | Raw PCM Int16 bytes (16kHz mono) | Audio data from microphone |
| Text | `{"type":"report_state", "report":{...}}` | Sync after manual UI edit |
| Text | `{"type":"stop"}` | End dictation session |

**Server → Client:**

| Type | Fields | Purpose |
|------|--------|---------|
| `status` | `{asr, llm, paused}` | State indicators |
| `interim_transcript` | `{text}` | Partial ASR result (display only, gray italic) |
| `final_transcript` | `{text}` | Final ASR result (shown in black) |
| `report_update` | `{report, overallRemarks}` | Updated report from LLM |
| `capture_photo` | — | Photo capture command |
| `error` | `{message}` | Error notification |
| `info` | `{message}` | Informational (e.g., "ASR stream restarted") |

## ASR & LLM Configuration

- ASR settings (model, languages, sample rate, phrase hints) are configured in `config.yaml` → `asr`. Phrase hints loaded from `endoscopy_phraseset.txt`; auto-restarts on 5-minute STT stream timeout.
- LLM settings (model, temperatures, token limits) are configured in `config.yaml` → `llm`. Uses `application/json` constrained decoding for voice; single-shot prompt with schema + report + transcript.

## EHR Schema (for LLM context, generated by schema_builder.py)

The schema varies by procedure type. `build_schema(csv_text, procedure_type)` takes a `procedure_type` parameter (`"endoscopy"` or `"colonoscopy"`) to select the appropriate location columns from the CSV.

**Endoscopy example:**
```json
{
  "locations": ["Esophagus", "GE Junction", "Stomach", "Duodenum"],
  "sublocations": {
    "Esophagus": ["Cricopharynx", "Upper", "Middle", ...],
    "Stomach": {
      "Antrum": ["Lesser Curvature", ...],
      "_standalone": ["Whole Stomach", ...]
    }
  },
  "diseases": {
    "Gastric Ulcer": {
      "locations": ["Stomach"],
      "default_sublocation": "",
      "sections": {
        "Number": { "multi": false, "attributes": ["Single", "Multiple (2-5)", ...] },
        "Forrest Classification": { "multi": false, "attributes": [...] }
      }
    }
  }
}
```

**Colonoscopy example:**
```json
{
  "locations": ["Terminal Ileum", "IC Valve", "Caecum", "Ascending Colon", "Transverse Colon", "Descending Colon", "Sigmoid", "Rectum", "Anal Canal"],
  "sublocations": {
    "Rectum": ["Anterior wall", "Posterior wall", "Right Lateral wall", "Left Lateral wall"]
  },
  "diseases": {
    "Polyp": {
      "locations": ["Caecum", "Ascending Colon", "Transverse Colon", ...],
      "default_sublocation": "",
      "sections": { ... }
    }
  }
}
```

## Pydantic Models (models.py)

```
EHRReport
├── report: dict[str, LocationEntry]    # Keys: location names
│   └── LocationEntry
│       └── diseases: dict[str, DiseaseEntry]
│           └── DiseaseEntry
│               ├── sublocations: list[str]
│               ├── sections: dict[str, SectionEntry]
│               │   └── SectionEntry
│               │       ├── attrs: dict[str, bool]
│               │       ├── inputs: list[InputGroup]
│               │       └── subsections: dict[str, SubsectionEntry]
│               ├── comments: str
│               └── startFrame/endFrame/segmentationFrame: Optional[int]
└── overallRemarks: str
```

Validation pipeline: Parse JSON → Pydantic model_validate → strip invalid locations → validate disease names against schema → validate disease-location compatibility (e.g., reject "Esophageal Varices" under "Stomach") → remove hallucinated/misplaced diseases.

## Manual Edit Sync

When the user makes manual edits while voice is active:
- `renderReport()` calls `voiceScheduleSync()` at the end (if voice module loaded)
- `voiceScheduleSync()` debounces (500ms) and sends `report_state` message to backend
- Backend updates `session.current_report` so next LLM call uses fresh state

## CSV Text Flow for Voice

`loadedCsvText` (global in `06-state.js`) stores raw CSV text for the backend:
- Set by `17-csv-upload.js` in both file upload handler and sample loader
- Sent to backend in the WebSocket `init` message by `19-voice.js`
- Backend uses it to build the EHR schema via `schema_builder.py`

## Voice Update (applyVoiceUpdate)

Lightweight version of `loadJsonFromText()` for real-time LLM updates:
- Does NOT touch `__retroMeta` (UHID, video, frames, PII stay unchanged during dictation)
- Does NOT update `lastSavedReportState` (report remains "unsaved")
- DOES validate disease names against loaded `DISEASES` object
- DOES normalize sublocations (same logic as `loadJsonFromText()`)
- DOES auto-add matrix region names when "Region - Option" sublocations are present (e.g., adds "Antrum" when "Antrum - Posterior Wall" exists)
- DOES detect newly added diseases and switch `active` to the latest one (so details pane opens automatically)
- DOES preserve currently active disease if no new diseases were added
- Calls `populateColumns()`, `renderSubLocChips()`, `renderReport()`, `openDetails()`

## Batcher Flush on Stop

- When dictation stops, the `finally` block sends `{"flush": True}` to the transcript queue
- Batcher handles flush by breaking the debounce loop and processing remaining accumulated text
- Server waits up to 15s for the batcher to finish (including final LLM call) before cleanup
- Ensures the last spoken sentence is always processed

## Sentences Report

Converts structured EHR JSON into natural-language prose via Gemini, displayed in a Quill.js rich text editor:

1. Doctor clicks **"Generate Sentences Report"** button (below Overall Remarks)
2. Modal opens with loading spinner → `POST /api/generate-report` calls Gemini
3. Gemini returns HTML with `<h2>` locations, `<h3>` diseases, `<p>` sentences
4. Quill.js editor loads the HTML with Gmail-style toolbar (bold, italic, underline, headings, lists)
5. Doctor reviews/edits → clicks **"Submit and Create PDF Report"** → html2pdf.js generates A4 PDF
6. Requires server mode (not available in file:// mode)

## Key Voice Functions

| Function | Module | Purpose |
|----------|--------|---------|
| `applyVoiceUpdate(data)` | `19-voice` | Apply LLM-produced report update to UI |
| `_voiceStart()` / `_voiceStop()` | `19-voice` | Start/stop dictation (audio + WebSocket) |
| `voiceScheduleSync()` | `19-voice` | Debounced sync of manual edits to backend |
| `build_schema(csv_text, procedure_type, config)` | `schema_builder` | CSV → canonical EHR schema dict (filtered by procedure type, locations from config) |
| `call_llm(schema, report, remarks, transcript, procedure_type, llm_config)` | `llm_caller` | Gemini call to update EHR from transcript |
| `validate_llm_response(data, schema)` | `models` | Pydantic validation of LLM output |
| `run_asr_bridge(ws, session, asr_config)` | `asr_bridge` | Main ASR entry point (async task) |
| `transcript_batcher(ws, session)` | `server` | Debounce + batch finals → LLM calls |
| `generate_sentences_report(json, llm_config)` | `llm_caller` | Gemini call to convert EHR JSON → prose HTML |
| `_sentencesGenerate()` | `20-sentences-report` | Main handler: modal + API call + Quill init |
| `_sentencesGeneratePdf()` | `20-sentences-report` | html2pdf.js PDF generation from Quill content |

## ASR Phrase Hints

`endoscopy_phraseset.txt` contains manually curated medical phrases (one per line, alphabetically sorted) that help Google Cloud STT recognize endoscopy jargon. The file was initially generated from the CSV but is now maintained by hand.

- Edit the file directly to add/remove phrases
- Google API limit: 1200 phrases per PhraseSet
- `server.py` loads the file on each dictation session start

## Testing Scripts

```bash
# Test Google Cloud STT (requires mic + Google credentials)
python stream_test_mic.py

# Test Gemini API connectivity
python gemini_test.py

# Generate EHR schema JSON from CSV (for inspection)
python schema_builder.py "EHR_Menu - 20260224.csv"
```

## Voice Dictation Testing Checklist

- [ ] `python server.py` → app loads at http://localhost:8000
- [ ] Existing app works identically when served via FastAPI
- [ ] Voice button disabled when no CSV loaded / when opened via file://
- [ ] Voice button enabled after CSV load on HTTP
- [ ] Click "Start Dictation" → mic permission prompt → "Listening..." status
- [ ] Partial transcripts appear gray italic in transcript bar
- [ ] Final transcripts appear in black
- [ ] After ~2s debounce, "AI Processing..." appears
- [ ] Report updates automatically from voice (diseases, sublocations, attributes)
- [ ] Corrections work: "Correction, it's lesser curvature" overrides previous
- [ ] "Remove [disease]" removes it from report
- [ ] "Pause dictation" → shows PAUSED, stops LLM calls, ASR still runs
- [ ] "Resume dictation" → resumes LLM pipeline
- [ ] "Capture photo" → toast notification (stub)
- [ ] Click "Stop Dictation" → mic releases, button returns to green
- [ ] Manual pill clicks during voice session sync to backend
- [ ] Save button works normally with voice-entered data

### Sentences Report Checklist

- [ ] Button visible below Overall Remarks
- [ ] Click with empty report → alert, no modal
- [ ] Click with findings → modal opens with loading spinner
- [ ] Gemini generates prose → Quill editor appears with formatted text
- [ ] Toolbar works: bold, italic, underline, headings, lists
- [ ] Text is editable in Quill editor
- [ ] "Submit and Create PDF Report" → PDF downloads
- [ ] PDF has title, formatted content, readable layout
- [ ] Modal closes via X button, ESC key, or backdrop click
