# AIG Endoscopy EHR Prototype

## Project Overview

A modular HTML prototype for an Endoscopy Electronic Health Record (EHR) system with hierarchical menus and **real-time voice dictation**. Built for use on large desktop monitors with ample screen real estate. Uses Tailwind CSS for styling, vanilla JavaScript for the frontend, and a Python (FastAPI) backend for voice-to-EHR automation.

The app has two modes:
- **Standalone mode**: Open `Endo_EHR.html` directly in browser (file://). Voice features disabled, EHR works as a manual click-based form.
- **Voice mode**: Run `python server.py` → open `http://localhost:8000`. Enables real-time voice dictation via microphone → Google Cloud Speech-to-Text (Chirp3) → Gemini 2.5 Flash LLM → automatic EHR form filling.

## Tech Stack

### Frontend
- **Modular JavaScript** — 19 source files in `src/js/`, built into a single distributable HTML
- **Tailwind CSS** via CDN (`https://cdn.tailwindcss.com`)
- **jsPDF** for PDF generation (`https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`)
- **File System Access API** for folder operations (Chrome/Edge)
- **AudioWorklet** for 16kHz PCM audio capture (inline Blob URL, no external worklet file)
- **WebSocket** client for real-time communication with backend
- **Python build script** (`build.py`) — inlines JS modules into a single HTML for distribution

### Backend (Voice Pipeline)
- **FastAPI** + **Uvicorn** — serves frontend and WebSocket endpoint
- **Google Cloud Speech-to-Text v2** (Chirp3 model) — streaming ASR with medical phrase hints
- **Google Vertex AI Gemini 2.5 Flash** — LLM for transcript → EHR JSON updates
- **Pydantic v2** — validates LLM output against EHR schema before sending to frontend

## File Structure

```
project/
├── build.py                    # Build script: src/ → Endo_EHR.html
├── Endo_EHR.html               # Built distributable (double-click to open)
├── EGD_Heirarchial_Menu_*.csv  # Disease/section definitions
├── pipelines_figma.png         # Architecture diagram (voice pipeline design)
│
├── server.py                   # FastAPI backend: serves frontend + WebSocket voice endpoint
├── asr_bridge.py               # Google Cloud STT v2 streaming bridge (async/thread)
├── llm_caller.py               # Gemini 2.5 Flash: transcript → EHR JSON updates
├── schema_builder.py           # CSV → EHR schema JSON for LLM context
├── models.py                   # Pydantic models for EHR report validation
├── endoscopy_phraseset.txt     # Manually curated ASR phrase hints (one per line)
├── requirements.txt            # Python dependencies
│
├── stream_test_mic.py          # Test script: verify Google Cloud STT with local mic
├── gemini_test.py              # Test script: verify Gemini API connectivity
│
├── pictures/                   # Hint images referenced in CSV
│   └── *.png, *.jpg, *.webp
├── retro_videos/               # Retrospective video analysis folder
│   └── {UHID}/                 # Patient folders named by UHID
│       ├── *.mp4, *.avi, etc.  # Video files
│       └── *.json, *.pdf       # Saved reports
└── src/
    ├── Endo_EHR.html           # Dev version (with <script src> tags)
    └── js/
        ├── 01-debug.js         # DEBUG flag, log(), logError(), logWarn()
        ├── 02-csv-parser.js    # parseCSV(), expandRangeToken(), isX(), isMultiFlag(), buildFromCSV()
        ├── 03-hint-helpers.js  # createHintElement()
        ├── 04-input-helpers.js # parseAttributePattern(), groupHasAnyValue(), renderGroupLabel()
        ├── 05-constants.js     # SUBLOCATIONS, STOMACH/DUODENUM matrices, VIDEO_EXTENSIONS, FPS
        ├── 06-state.js         # All mutable globals (DISEASES, report, active, retroData, etc.)
        ├── 07-conditional-logic.js  # evaluateSingleCondition(), evaluateConditional()
        ├── 08-disease-columns.js    # populateColumns(), refreshLeftHighlights()
        ├── 09-sublocation-ui.js     # renderSubLocChips(), renderSublocMatrix(), toggle functions
        ├── 10-disease-management.js # addOrOpenDisease(), openDetails(), frame data handlers
        ├── 11-details-pane.js       # renderDetailsSections(), renderRow(), renderInputAttribute(), makePill()
        ├── 12-report-pane.js        # renderReport()
        ├── 13-retro-video.js        # Video folder loading, UHID/video selection, frame calc, PII
        ├── 14-json-io.js            # loadJsonFromText() (unified JSON loader)
        ├── 15-pdf-generation.js     # generateTimestamp(), generatePDF()
        ├── 16-save-report.js        # Save and Clear button handlers
        ├── 17-csv-upload.js         # CSV file handler, sample loader, JSON file load handler
        ├── 18-init.js               # Init IIFE
        └── 19-voice.js             # Voice dictation: audio capture, WebSocket, applyVoiceUpdate(), UI
```

## Development Workflow

### Manual EHR (no voice)
- **Edit** source files in `src/js/` and `src/Endo_EHR.html`
- **Test during dev**: Open `src/Endo_EHR.html` directly in browser (works with file://)
- **Build for distribution**: Run `python3 build.py` → produces `Endo_EHR.html` in project root
- **Distribute**: Give users the built `Endo_EHR.html` — single file, double-click to open

### Voice-Enabled Mode
1. Install Python dependencies: `pip install -r requirements.txt`
2. Set up Google Cloud credentials: `export GOOGLE_APPLICATION_CREDENTIALS=<your-key.json>`
3. Start backend: `python server.py` (default port 8000, `--port N` for custom)
4. Open `http://localhost:8000` in Chrome
5. Load CSV → Click "Start Dictation" → speak into microphone
6. Voice features require HTTP (not file://) due to `getUserMedia` secure context requirement

## Voice Dictation Architecture

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

### Voice Pipeline Components

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

### Voice Command Keywords (Pre-LLM Detection)

| Command | Trigger Phrases | Action |
|---------|----------------|--------|
| Pause | "pause dictation", "stop recording", "pause" | Stop sending finals to LLM; ASR continues for display |
| Resume | "resume dictation", "start recording", "resume" | Resume LLM pipeline |
| Capture Photo | "capture photo", "take photo", "take picture" | Dummy stub (logs to console) |

### Two-Layer Garbage Filtering

1. **Pre-LLM (server.py)**: Skip transcripts with <2 meaningful words after removing filler ("um", "uh", "okay", etc.). Also intercepts voice commands before LLM.
2. **LLM Prompt**: Instructs Gemini to ignore non-medical chatter, past-tense references to other patients, non-Latin script (Hindi/Telugu side conversations), and return report unchanged when in doubt.

### WebSocket Protocol

**Client → Server:**

| Frame | Format | Purpose |
|-------|--------|---------|
| Text | `{"type":"init", "csv_text":"...", "report":{...}}` | Initialize session with CSV and current report |
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

### ASR Configuration

- **Location**: `asia-southeast1`
- **Model**: `chirp_3`
- **Languages**: `["en-IN", "hi-IN", "te-IN"]`
- **Sample rate**: 16kHz mono PCM Int16
- **Phrase hints**: Loaded from `endoscopy_phraseset.txt` (manually curated), max 1200 per PhraseSet, boost=5.0
- **Auto-restart**: On 5-minute STT stream timeout (OutOfRange exception)

### LLM Configuration

- **Location**: `us-central1`
- **Model**: `gemini-2.5-flash`
- **Temperature**: 0.1
- **Max output tokens**: 8192
- **Response format**: `application/json` (constrained decoding)
- **Prompt strategy**: Single-shot with schema + current report state + transcript each call

### Manual Edit Sync

When the user makes manual edits while voice is active:
- `voiceScheduleSync()` debounces (500ms) and sends `report_state` message to backend
- Backend updates `session.current_report` so next LLM call uses fresh state

## Layout Structure

### Main Layout (70/30 Split)
- **Left Pane (70%)**: Diagnosis section
- **Right Pane (30%)**: Report section

### Left Pane Components

1. **Top Section - Location Grid (1x4)**
   - Esophagus | GE Junction | Stomach | Duodenum
   - Each column shows applicable diseases from CSV

2. **Sub-Location Section**
   - Dynamic based on selected location
   - Multi-select pills (click to toggle)
   - **Esophagus**: Simple pill list (Cricopharynx, Upper, Middle, Lower, Whole esophagus, Anastomosis)
   - **GE Junction**: Simple pill list (Z-line, Hiatal hernia, Diaphragmatic pinch)
   - **Stomach**: Matrix layout (see below)
   - **Duodenum**: Matrix layout (see below)

3. **Details Section**
   - Appears when a disease is selected
   - Shows sections/subsections from CSV
   - Disease-specific frame inputs (Start Frame, End Frame, Segmentation Frame)
   - Additional Comments text box

### Stomach Sub-Location Matrix

| Region | Options |
|--------|---------|
| Antrum (pill) | Lesser Curvature, Greater Curvature, Posterior Wall, Anterior Wall, Entire |
| Incisura (pill) | Lesser Curvature, Posterior Wall, Anterior Wall, Entire |
| Lower Body (pill) | Lesser Curvature, Greater Curvature, Posterior Wall, Anterior Wall, Entire |
| Middle Upper Body (pill) | Lesser Curvature, Greater Curvature, Posterior Wall, Anterior Wall, Entire |
| Fundus (pill) | Lesser Curvature, Greater Curvature, Posterior Wall, Anterior Wall, Entire |
| Other (heading) | Whole Stomach, Whole Body, Cardia, Prepyloric region, Pylorus, Anastomosis |

### Duodenum Sub-Location Matrix

| Region | Options |
|--------|---------|
| D1 Bulb (pill) | Anterior wall, Posterior wall, Superior wall, Inferior wall, Entire |
| D2 (pill) | Ampullary region, Medial wall, Lateral wall, Inferior wall, Superior wall, Entire |
| Other (heading) | D1-D2 junction, D3, D4, Anastomosis, Major papilla, Minor papilla |

**Matrix Behavior**: Selecting an option in column 2 auto-selects the region pill in column 1. Deselecting all options for a region auto-deselects the region.

### Right Pane Components

1. **Report Header**
   - Save button (green)
   - Load Saved JSON button (blue)
   - Clear button (red)

2. **Report Content**
   - Grouped by location (no duplicate location headers)
   - Each disease card shows:
     - Disease name (clickable to open details)
     - X button to remove
     - Sub-locations
     - Frame info (if available)
     - Selected sections/attributes

3. **Overall Remarks**
   - Text area at bottom (not included in disease reports)

## Retrospective Analysis & Voice Controls

Located below the main heading in a single control bar:

1. **Load Videos Folder** button - Opens folder picker
2. **UHID Dropdown** - Shows patient folders with JSON count
   - Color coding: Black (0 JSONs), Blue (1 JSON), Red (>1 JSONs)
   - Re-loads folder on click to refresh counts
3. **Video Dropdown** - Shows videos in selected UHID folder
   - Auto-selects if only one video exists
4. **Frame Inputs**:
   - Start Frame (integer)
   - End Frame (integer)
   - \# Frames (calculated: end - start + 1)
   - Duration (calculated: frames / 25 fps)
   - Segmentation Frame (integer)
5. **PII Toggle** - Orange pill for marking PII content
6. **Voice Dictation Toggle** - Green "Start Dictation" / Red "Stop Dictation" button
   - Disabled when: no CSV loaded, file:// protocol, no getUserMedia
   - Status indicator next to button: "Listening...", "AI Processing...", "Paused", "Disconnected"
7. **Transcript Bar** - Below controls, hidden until dictation starts
   - Partial transcripts in gray italic
   - Final transcripts in black
   - "PAUSED" in orange when voice paused
8. **CSV File Input** - Load disease definitions (right-aligned)

## CSV Format

The CSV defines diseases, sections, subsections, and attributes.

### Key Columns

| Column | Purpose |
|--------|---------|
| Diagnosis | Disease/finding name |
| Section | Section name in Details pane |
| Subsection | Subsection name (optional) |
| Section_Hint | Hint text/images for section |
| Subsection_Hint | Hint text for subsection |
| Esophagus, GE Junction, Stomach, Duodenum | "x" marks applicability |
| Default_Sub_Location | Auto-selected sub-location |
| Conditional_on | Visibility condition |
| Multi_Attribute | "x" for multi-select, empty for single |
| Default_Attr | Default selected attribute |
| Attribute1-N | Attribute options |

### Special Attribute Types

- `int_box` - Integer input (narrow)
- `float_box` - Decimal input (medium width)
- `alphanum_box` - Text input (wide)
- `Range(start,end)` - Generates options start to end-1

### Conditional Logic

Format: `Subsection(Name=Value)` or `Section(Name=Value)`
- Supports `AND` and `OR` operators
- Example: `Subsection(Seen=Yes)` - shows only if "Seen" subsection has "Yes" selected

### Hint Images

- Referenced in Section_Hint/Subsection_Hint columns
- Filename patterns: `image_name_WIDTHxHEIGHT.ext`
- Stored in `pictures/` folder
- Supported: png, jpg, jpeg, webp

## Key Behaviors

### Disease Selection
1. Click disease in location column → adds to report
2. Disease details pane opens
3. Default sub-location applied (if defined in CSV)
4. Default attributes applied (if defined)

### Location-Specific Filtering
- Sections/subsections only show if they have "x" for the current location
- Example: SIEWERT Classification only shows for GE Junction

### Unsaved Changes Warning
- Warns when changing UHID with unsaved report data
- Uses `hasUnsavedChanges()` to compare against last saved state
- Cancel reverts to previous UHID selection

### Frame Validation
- Negative frame counts shown in red
- Warning when saving with End Frame < Start Frame

### Save Functionality
- Saves JSON + PDF to UHID folder (if File System API available)
- Falls back to browser download
- Filename: `{UHID}_{YYYYMMDD}_{HHMM}.json/pdf`
- Includes metadata: UHID, video, frames, PII, CSV filename, timestamp

### Load JSON
- Auto-loads latest JSON when UHID selected
- Manual load via "Load Saved JSON" button
- Restores: report data, frame inputs, PII state, last active disease

### Voice Update (applyVoiceUpdate)
- Lightweight version of `loadJsonFromText()` for real-time LLM updates
- Does NOT touch `__retroMeta` (UHID, video, frames, PII stay unchanged during dictation)
- Does NOT update `lastSavedReportState` (report remains "unsaved")
- DOES validate disease names against loaded `DISEASES` object
- DOES normalize sublocations (same logic as `loadJsonFromText()`)
- DOES preserve currently active disease if it still exists in updated report
- Calls `populateColumns()`, `renderSubLocChips()`, `renderReport()`, `openDetails()`

## Data Model

### Report Structure
```javascript
{
  __retroMeta: {
    uhid: string,
    video: string,
    startFrame: number,
    endFrame: number,
    segmentationFrame: number,
    pii: boolean,
    csvFile: string,
    savedAt: ISO timestamp
  },
  __meta: {
    lastActive: { loc: string, disease: string }
  },
  report: {
    [location]: {
      diseases: {
        [diseaseName]: {
          sublocations: string[],
          sections: {
            [sectionName]: {
              attrs: { [attrName]: true },
              inputs: [{ type: "group", rawKey, pattern, values }],
              subsections: {
                [subsectionName]: {
                  attrs: { [attrName]: true },
                  inputs: [...]
                }
              }
            }
          },
          comments: string,
          startFrame: number,
          endFrame: number,
          segmentationFrame: number
        }
      }
    }
  },
  overallRemarks: string
}
```

### EHR Schema (for LLM context, generated by schema_builder.py)
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

### Pydantic Models (models.py)

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

Validation pipeline: Parse JSON → Pydantic model_validate → strip invalid locations → validate disease names against schema → remove hallucinated diseases.

## CSS Classes

### Pills
- `.pill` - Base pill style
- `.pill-selected` - Selected state (blue background)
- `.attr-pill` - Attribute pill variant

### Disease Items
- `.left-disease` - Disease button in location columns
- `.left-disease.selected` - Selected/in-report state

### Layout
- `.loc-column` - Location column container (min-height: 320px, max-height: 420px, overflow: auto)

## Known Issues & Fixes Applied

1. ✅ Location-specific section filtering
2. ✅ Conditional logic with section context
3. ✅ Disease frame data synchronization
4. ✅ Frame validation with red warning
5. ✅ Clear button resets UHID/Video
6. ✅ UHID change warns only for unsaved changes
7. ✅ Previous UHID selection restored on cancel

## Development Notes

### Debug Logging
```javascript
const DEBUG = true; // Set to false to disable
log(...args)      // General logging
logWarn(...args)  // Warnings
logError(...args) // Errors
```

Backend logging: Python `logging` module, logger name `"ehr-voice"`, level INFO.

### Key Functions

| Function | Module | Purpose |
|----------|--------|---------|
| `parseCSV(text)` | `02-csv-parser` | Parse CSV with quote handling |
| `buildFromCSV(rows)` | `02-csv-parser` | Build DISEASES model from CSV |
| `populateColumns()` | `08-disease-columns` | Render disease lists in location columns |
| `renderSubLocChips()` | `09-sublocation-ui` | Render sub-location pills/matrix |
| `renderSublocMatrix()` | `09-sublocation-ui` | Generic matrix renderer for Stomach/Duodenum |
| `renderDetailsSections()` | `11-details-pane` | Render disease details with location filtering |
| `evaluateConditional()` | `07-conditional-logic` | Evaluate visibility conditions |
| `renderReport()` | `12-report-pane` | Render right-side report pane |
| `openDetails()` | `10-disease-management` | Open disease in details pane |
| `addOrOpenDisease()` | `10-disease-management` | Add disease to report or open existing |
| `loadJsonFromText()` | `14-json-io` | Parse and restore JSON report (unified) |
| `generatePDF()` | `15-pdf-generation` | Generate PDF from report data |
| `updateFrameCalculations()` | `13-retro-video` | Calculate frame count and duration |
| `hasUnsavedChanges()` | `13-retro-video` | Check if report differs from last save |
| `applyVoiceUpdate(data)` | `19-voice` | Apply LLM-produced report update to UI |
| `_voiceStart()` / `_voiceStop()` | `19-voice` | Start/stop dictation (audio + WebSocket) |
| `voiceScheduleSync()` | `19-voice` | Debounced sync of manual edits to backend |
| `build_schema(csv_text)` | `schema_builder` | CSV → canonical EHR schema dict |
| `call_llm(schema, report, remarks, transcript)` | `llm_caller` | Gemini call to update EHR from transcript |
| `validate_llm_response(data, schema)` | `models` | Pydantic validation of LLM output |
| `run_asr_bridge(ws, session)` | `asr_bridge` | Main ASR entry point (async task) |
| `transcript_batcher(ws, session)` | `server` | Debounce + batch finals → LLM calls |

### Adding New Matrix Locations

1. Set location to `null` in `SUBLOCATIONS` (`src/js/05-constants.js`)
2. Create matrix constant (e.g., `NEW_SUBLOC_MATRIX`) in same file
3. Add condition in `renderSubLocChips()` (`src/js/09-sublocation-ui.js`):
   ```javascript
   if(selectedMainLoc === 'NewLocation'){
     renderSublocMatrix(el, current, NEW_SUBLOC_MATRIX);
     return;
   }
   ```

### Matrix Row Format
```javascript
{
  region: 'RegionName',      // First column text
  isHeading: false,          // true = text only, false = selectable pill
  options: ['Opt1', 'Opt2']  // Second column pills
}
```

### Running Test Scripts

```bash
# Test Google Cloud STT (requires mic + Google credentials)
python stream_test_mic.py

# Test Gemini API connectivity
python gemini_test.py
```

### Schema Builder CLI

```bash
# Generate EHR schema JSON from CSV (for inspection)
python schema_builder.py EGD_Heirarchial_Menu-20260214.csv
```

### ASR Phrase Hints

`endoscopy_phraseset.txt` contains manually curated medical phrases (one per line, alphabetically sorted) that help Google Cloud STT recognize endoscopy jargon. The file was initially generated from the CSV but is now maintained by hand.

- Edit the file directly to add/remove phrases
- Google API limit: 1200 phrases per PhraseSet
- `server.py` loads the file on each dictation session start

## Testing Checklist

### Manual EHR
- [ ] Load CSV file
- [ ] Select disease from each location
- [ ] Verify location-specific sections appear/hide correctly
- [ ] Test conditional subsections (e.g., Glycogen Acanthosis → Seen=Yes)
- [ ] Test Stomach matrix auto-selection
- [ ] Test Duodenum matrix auto-selection
- [ ] Save JSON to UHID folder
- [ ] Load saved JSON
- [ ] Verify frame validation (red for invalid)
- [ ] Test UHID change warning with unsaved data
- [ ] Test Clear button resets everything
- [ ] Verify PDF generation

### Voice Dictation
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

## Future Features (Not Yet Implemented)

1. **Create Sentences Report**: Gemini generates natural language narrative from structured EHR JSON
2. **Upload to DB**: Backend API to push finalized reports to a database
3. **Photo Captioning Mode**: Voice input for photo captions instead of EHR fields
4. **Load Saved JSON by Voice**: "Load previous report" voice command
5. **Per-disease Schema Filtering**: Send only relevant disease schema to LLM (cost optimization)
