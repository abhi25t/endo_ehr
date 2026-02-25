# Endoscopy & Colonoscopy EHR Prototype

## Project Overview

A modular HTML prototype for an Endoscopy and Colonoscopy Electronic Health Record (EHR) system with hierarchical menus and **real-time voice dictation**. Supports both upper GI endoscopy (4 locations: Esophagus, GE Junction, Stomach, Duodenum) and colonoscopy (9 locations: Terminal Ileum through Anal Canal), switchable via a procedure type toggle in settings. Built for use on large desktop monitors with ample screen real estate. Uses Tailwind CSS for styling, vanilla JavaScript for the frontend, and a Python (FastAPI) backend for voice-to-EHR automation.

The app has two modes:
- **Standalone mode**: Open `Endo_EHR.html` directly in browser (file://). Voice features disabled, EHR works as a manual click-based form.
- **Voice mode**: Run `python server.py` → open `http://localhost:8000`. Enables real-time voice dictation via microphone → Google Cloud Speech-to-Text (Chirp3) → Gemini 2.5 Flash LLM → automatic EHR form filling.

## Tech Stack

### Frontend
- **Modular JavaScript** — 21 source files in `src/js/`, built into a single distributable HTML
- **Tailwind CSS** via CDN (`https://cdn.tailwindcss.com`)
- **jsPDF** for structured PDF generation (`https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`)
- **Quill.js** rich text editor for sentences report (`https://cdn.quilljs.com/1.3.7/quill.min.js`)
- **html2pdf.js** for sentences report PDF (`https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js`)
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
├── EHR_Menu - YYYYMMDD.csv     # Disease/section definitions
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
        ├── 05-constants.js     # ENDO_LOCATIONS, COLONO_LOCATIONS, COLONO_SUBLOCATIONS, SUBLOCATIONS, STOMACH/DUODENUM matrices, getLocationsForProcedure(), getSublocationsForLocation(), VIDEO_EXTENSIONS, FPS
        ├── 06-state.js         # All mutable globals (DISEASES, report, active, retroData, loadedCsvText, procedureType, settings state, etc.)
        ├── 07-conditional-logic.js  # evaluateSingleCondition(), evaluateConditional()
        ├── 08-disease-columns.js    # populateColumns(), refreshLeftHighlights(), portrait variants
        ├── 09-sublocation-ui.js     # renderSubLocChips(), renderSublocMatrix(), toggle functions
        ├── 10-disease-management.js # addOrOpenDisease(), openDetails(), frame data handlers
        ├── 11-details-pane.js       # renderDetailsSections(), renderRow(), renderInputAttribute(), makePill()
        ├── 12-report-pane.js        # renderReport() + voiceScheduleSync() hook
        ├── 13-retro-video.js        # Video folder loading, UHID/video selection, frame calc, PII
        ├── 14-json-io.js            # loadJsonFromText() (unified JSON loader)
        ├── 15-pdf-generation.js     # generateTimestamp(), generatePDF()
        ├── 16-save-report.js        # Save and Clear button handlers
        ├── 17-csv-upload.js         # CSV file handler (stores loadedCsvText), sample loader, JSON file load, autoLoadCsv()
        ├── 18-init.js               # Init IIFE
        ├── 19-voice.js             # Voice dictation: audio capture, WebSocket, applyVoiceUpdate(), UI
        ├── 20-sentences-report.js  # Sentences report: Gemini → Quill rich text editor → PDF via html2pdf.js
        └── 21-settings.js         # Settings panel: procedure type (endo/colono), dark mode, study type (retro/prosp), display mode (landscape/portrait)
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
5. CSV auto-loads on start → Click "Start Dictation" → speak into microphone
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
| Frontend Settings | `src/js/21-settings.js` | Dark mode, study type, display mode, portrait layout, localStorage |

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

### ASR Configuration

- **Location**: `asia-southeast1`
- **Model**: `chirp_3`
- **Languages**: `["en-IN", "hi-IN"]` (Chirp3 max 2 language codes)
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
- `renderReport()` calls `voiceScheduleSync()` at the end (if voice module loaded)
- `voiceScheduleSync()` debounces (500ms) and sends `report_state` message to backend
- Backend updates `session.current_report` so next LLM call uses fresh state

### CSV Text Flow for Voice

`loadedCsvText` (global in `06-state.js`) stores raw CSV text for the backend:
- Set by `17-csv-upload.js` in both file upload handler and sample loader
- Sent to backend in the WebSocket `init` message by `19-voice.js`
- Backend uses it to build the EHR schema via `schema_builder.py`

## Layout Structure

### Main Layout — Landscape Mode (75/25 Split)
- **Left Pane (75%)** `#leftPane`: Diagnosis section
- **Right Pane (25%)** `#rightPane`: Report section
- Portrait mode uses a different 20/65/15 three-column layout (see Settings Panel → Portrait Layout)

### Left Pane Components

1. **Top Section - Location Grid**
   - **Endoscopy (landscape)**: 4-column grid — Esophagus | GE Junction | Stomach | Duodenum
   - **Colonoscopy (portrait only)**: 9 location pills — Terminal Ileum | IC Valve | Caecum | Ascending Colon | Transverse Colon | Descending Colon | Sigmoid | Rectum | Anal Canal
   - Each column/pill shows applicable diseases from CSV

2. **Sub-Location Section**
   - Dynamic based on selected location
   - Multi-select pills (click to toggle)
   - **Esophagus**: Simple pill list (Cricopharynx, Upper, Middle, Lower, Whole esophagus, Anastomosis)
   - **GE Junction**: Simple pill list (Z-line, Hiatal hernia, Diaphragmatic pinch)
   - **Stomach**: Matrix layout (see below)
   - **Duodenum**: Matrix layout (see below)
   - **Rectum** (colonoscopy): Simple pill list (Anterior wall, Posterior wall, Right Lateral wall, Left Lateral wall)
   - **Other colonoscopy locations** (Terminal Ileum, IC Valve, Caecum, Ascending Colon, Transverse Colon, Descending Colon, Sigmoid, Anal Canal): No sub-locations

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

### Colonoscopy Locations (Portrait Mode Only)

| Location | Sub-Locations |
|----------|--------------|
| Terminal Ileum | (none) |
| IC Valve | (none) |
| Caecum | (none) |
| Ascending Colon | (none) |
| Transverse Colon | (none) |
| Descending Colon | (none) |
| Sigmoid | (none) |
| Rectum | Anterior wall, Posterior wall, Right Lateral wall, Left Lateral wall |
| Anal Canal | (none) |

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

## Settings Panel

A gear button (&#9881;) at the top-right corner opens a settings dropdown with four options:

### Procedure Type: Endoscopy vs Colonoscopy
- **Endoscopy** (default): 4 upper GI locations (Esophagus, GE Junction, Stomach, Duodenum)
- **Colonoscopy**: 9 lower GI locations (Terminal Ileum, IC Valve, Caecum, Ascending Colon, Transverse Colon, Descending Colon, Sigmoid, Rectum, Anal Canal)
- Colonoscopy forces portrait layout (landscape radio disabled)
- Switching procedure type clears the current report
- CSV is re-parsed with the new procedure-type location columns
- Persisted in `localStorage` key `ehr_procedureType`

### Dark Mode
- Toggle with crescent moon icon (&#9790;)
- Implemented via CSS overrides on `body.dark` class (not Tailwind `dark:` prefix)
- Overrides `.bg-white`, `.bg-gray-100`, `.text-gray-*`, `.border-*`, `.pill`, `.left-disease`, inputs, textareas, selects
- Also styles Quill editor toolbar/container for sentences report modal
- Persisted in `localStorage` key `ehr_darkMode`

### Study Type: Retrospective vs Prospective
- **Retrospective** (default): Shows `#retroControls` — Load Videos Folder, UHID dropdown, Video dropdown, Frame inputs, PII toggle
- **Prospective**: Shows `#prospControls` — 5 text fields: UHID (`#prospUhid`), Patient Name (`#prospPatientName`), Gender (`#prospGender`), Age (`#prospAge`), Indication (`#prospIndication`)
- Shared controls (Voice + CSV) in `#sharedControls` are always visible in both modes
- Disease-specific frame controls (`#diseaseFrameBar`) hidden in prospective mode
- Prospective data saved as `__prospMeta` in JSON (vs `__retroMeta` for retrospective)
- `__prospMeta` includes: uhid, patientName, gender, age, indication, csvFile, savedAt
- PDF generation renders "Patient Information" section for prospective data
- Sentences report payload includes `__prospMeta` when in prospective mode
- `loadJsonFromText()` auto-switches to prospective mode when loading JSON with `__prospMeta`
- Persisted in `localStorage` key `ehr_studyType`

### Display Mode: Landscape vs Portrait
- **Landscape** (default): Original 75/25 two-pane layout with 4-column disease grid
- **Portrait**: Three-column layout (20% / 65% / 15%) for 1080x1920 portrait TV
- Display mode is NOT persisted — always starts in landscape
- **Note**: Landscape is disabled when colonoscopy is selected (colonoscopy requires portrait mode due to 9 locations)

#### Portrait Layout Structure

| Column | Width | Content |
|--------|-------|---------|
| Left (20%) | `#leftPane` → `#portraitDiseaseList` | Single-column deduplicated disease list |
| Center (65%) | `#centerPane` (dynamically created) | Location pills + Sub-location + Details |
| Right (15%) | `#rightPane` (sticky) | Report pane (always visible during scroll) |

#### Portrait Interaction Model (Disease-First)

The portrait mode uses a **disease-first** interaction model (opposite of landscape):

1. **Click disease in left panel** → location pills update:
   - Inapplicable locations are greyed out (`.portrait-greyed`)
   - If disease has only 1 applicable location → auto-adds to report immediately
   - If disease has multiple applicable locations → shows focus ring (`.portrait-focused`), waits for location pill click
   - If disease is already in report → opens existing instance
2. **Click location pill** → if a disease is focused:
   - Adds the disease under that location via `addOrOpenDisease()`
   - Sets `selectedMainLoc`, renders sublocation chips, opens details
   - Clicking another applicable location pill adds a NEW instance of the same disease under that location
3. **State variable**: `portraitSelectedDisease` (string|null) — the disease currently focused before location is chosen

#### Portrait DOM Manipulation (in `21-settings.js`)

When switching to portrait:
1. `#diseaseGridCard` is hidden (4-column grid)
2. `#centerPane` is created between leftPane and rightPane
3. `#locationPills` (location buttons: 4 for endoscopy, 9 for colonoscopy) dynamically generated from `getLocationsForProcedure()` inside centerPane
4. `#sublocSection` moved from diseaseGridCard → centerPane
5. `#detailsCard` moved from leftPane → centerPane
6. `#mainLayout` switches from `display: flex` to `display: grid; grid-template-columns: 20% 1fr 15%`
7. `#rightPane` made sticky (`position: sticky; top: 1rem; max-height: calc(100vh - 2rem)`)
8. `populateColumnsPortrait()` renders the single-column disease list

When switching back to landscape: all DOM moves are reversed, centerPane is removed.

## Control Bars

The control area below the heading is split into three sections:

### `#retroControls` (Retrospective only)
1. **Load Videos Folder** button - Opens folder picker
2. **UHID Dropdown** - Shows patient folders with JSON count
   - Color coding: Black (0 JSONs), Blue (1 JSON), Red (>1 JSONs)
   - Re-loads folder on click to refresh counts
3. **Video Dropdown** - Shows videos in selected UHID folder
   - Auto-selects if only one video exists
4. **Frame Inputs**: Start Frame, End Frame, # Frames, Duration, Segmentation Frame
5. **PII Toggle** - Orange pill for marking PII content

### `#prospControls` (Prospective only, hidden by default)
5 text inputs: UHID, Patient Name, Gender, Age, Indication

### `#sharedControls` (Always visible)
1. **Voice Dictation Toggle** - Green "Start Dictation" / Red "Stop Dictation" button
   - Disabled when: no CSV loaded, file:// protocol, no getUserMedia
   - Status indicator next to button: "Listening...", "AI Processing...", "Paused", "Disconnected"
2. **Transcript Bar** - Below controls, hidden until dictation starts
   - Partial transcripts in gray italic, final transcripts in black

**Note**: CSV auto-loads on page start via `autoLoadCsv()` (fetches from server `/api/csv` in HTTP mode, or uses built-in sample for file:// mode). Manual CSV upload is available in the settings panel.

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
| Esophagus, GE Junction, Stomach, Duodenum | "x" marks applicability (endoscopy locations) |
| Terminal Ileum, IC Valve, Caecum, Ascending Colon, Transverse Colon, Descending Colon, Sigmoid, Rectum, Anal Canal | "x" marks applicability (colonoscopy locations) |
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
- DOES auto-add matrix region names when "Region - Option" sublocations are present (e.g., adds "Antrum" when "Antrum - Posterior Wall" exists)
- DOES detect newly added diseases and switch `active` to the latest one (so details pane opens automatically)
- DOES preserve currently active disease if no new diseases were added
- Calls `populateColumns()`, `renderSubLocChips()`, `renderReport()`, `openDetails()`

### Batcher Flush on Stop
- When dictation stops, the `finally` block sends `{"flush": True}` to the transcript queue
- Batcher handles flush by breaking the debounce loop and processing remaining accumulated text
- Server waits up to 15s for the batcher to finish (including final LLM call) before cleanup
- Ensures the last spoken sentence is always processed

## Data Model

### Report Structure
```javascript
{
  // Retrospective mode:
  __retroMeta: {
    uhid: string,
    video: string,
    startFrame: number,
    endFrame: number,
    segmentationFrame: number,
    pii: boolean,
    procedureType: string,
    csvFile: string,
    savedAt: ISO timestamp
  },
  // OR Prospective mode:
  __prospMeta: {
    uhid: string,
    patientName: string,
    gender: string,
    age: string,
    indication: string,
    procedureType: string,
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

Validation pipeline: Parse JSON → Pydantic model_validate → strip invalid locations → validate disease names against schema → validate disease-location compatibility (e.g., reject "Esophageal Varices" under "Stomach") → remove hallucinated/misplaced diseases.

## CSS Classes

### Pills
- `.pill` - Base pill style
- `.pill-selected` - Selected state (blue background)
- `.attr-pill` - Attribute pill variant
- `.pill.portrait-greyed` - Greyed out location pill (inapplicable for selected disease)

### Disease Items
- `.left-disease` - Disease button in location columns
- `.left-disease.selected` - Selected/in-report state
- `.left-disease.portrait-greyed` - Greyed out disease (portrait mode, inapplicable location)
- `.left-disease.portrait-focused` - Focused disease awaiting location selection (blue ring)

### Layout
- `.loc-column` - Location column container (min-height: 320px, max-height: 420px, overflow: auto)

### Dark Mode
- `body.dark` - Dark mode active (applied to `<body>`)
- All Tailwind utility overrides under `body.dark` selector (e.g., `body.dark .bg-white`)
- `.toggle-switch` / `.toggle-knob` - Custom toggle switch for dark mode

## Known Issues & Fixes Applied

1. ✅ Location-specific section filtering
2. ✅ Conditional logic with section context
3. ✅ Disease frame data synchronization
4. ✅ Frame validation with red warning
5. ✅ Clear button resets UHID/Video
6. ✅ UHID change warns only for unsaved changes
7. ✅ Previous UHID selection restored on cancel
8. ✅ `loadedCsvText` shared via `06-state.js` (was duplicated/lost between `17-csv-upload.js` and `19-voice.js`)
9. ✅ `voiceScheduleSync()` wired to `renderReport()` (was defined but never called)
10. ✅ Disease-location validation in `models.py` (LLM could place diseases under wrong locations)
11. ✅ Matrix region auto-select on voice update (e.g., "Antrum" auto-selected when "Antrum - Posterior Wall" set by LLM)
12. ✅ New disease auto-opens in details pane (voice update now detects newly added diseases)
13. ✅ Batcher flush on stop (last sentence no longer lost when stopping dictation)
14. ✅ Sentences report PDF rendering (html2canvas requires element in normal document flow, not positioned off-viewport)
15. ✅ Settings panel with dark mode, study type, and display mode
16. ✅ Prospective mode with patient demographics (UHID, Name, Gender, Age, Indication)
17. ✅ Portrait display mode with disease-first interaction model
18. ✅ Dark mode via CSS overrides (avoids touching JS rendering functions)
19. ✅ Multi-location disease support in portrait mode (e.g., Ulcer added separately to Stomach and Duodenum)
20. ✅ Colonoscopy support with 9 location columns and Rectum sub-locations
21. ✅ Procedure type toggle (endoscopy/colonoscopy) with localStorage persistence
22. ✅ CSV auto-load on page start (server `/api/csv` + file:// fallback)
23. ✅ CSV file input moved to settings panel

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
| `build_schema(csv_text, procedure_type)` | `schema_builder` | CSV → canonical EHR schema dict (filtered by procedure type) |
| `call_llm(schema, report, remarks, transcript, procedure_type)` | `llm_caller` | Gemini call to update EHR from transcript |
| `validate_llm_response(data, schema)` | `models` | Pydantic validation of LLM output |
| `run_asr_bridge(ws, session)` | `asr_bridge` | Main ASR entry point (async task) |
| `transcript_batcher(ws, session)` | `server` | Debounce + batch finals → LLM calls |
| `generate_sentences_report(json)` | `llm_caller` | Gemini call to convert EHR JSON → prose HTML |
| `_sentencesGenerate()` | `20-sentences-report` | Main handler: modal + API call + Quill init |
| `_sentencesGeneratePdf()` | `20-sentences-report` | html2pdf.js PDF generation from Quill content |
| `toggleDarkMode()` | `21-settings` | Toggle dark mode on/off, update CSS class + localStorage |
| `applyStudyType(type)` | `21-settings` | Switch between retrospective/prospective, show/hide control bars |
| `applyDisplayMode(mode)` | `21-settings` | Switch between landscape/portrait, DOM rearrangement |
| `populateColumnsPortrait()` | `08-disease-columns` | Render single-column deduplicated disease list for portrait |
| `refreshPortraitHighlights()` | `08-disease-columns` | Update disease button states in portrait mode |
| `onPortraitLocationPillClick(loc)` | `21-settings` | Handle location pill click in portrait mode |
| `updatePortraitLocationPills()` | `21-settings` | Update location pill greying/highlighting based on active disease |
| `applyProcedureType(type)` | `21-settings` | Switch endoscopy/colonoscopy, rebuild diseases, force portrait for colono |
| `autoLoadCsv()` | `17-csv-upload` | Auto-fetch CSV on page load (server API or file://) |
| `getLocationsForProcedure()` | `05-constants` | Return location array for current procedure type |
| `getSublocationsForLocation(loc)` | `05-constants` | Return sub-location array for a given location |

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
python schema_builder.py "EHR_Menu - 20260224.csv"
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

### Settings Panel
- [ ] Gear icon visible top-right corner
- [ ] Click opens dropdown, click outside closes it
- [ ] Dark mode toggle → all backgrounds/text/pills invert correctly
- [ ] Dark mode persists across page reload (localStorage)
- [ ] Study type: Retrospective → retro controls visible, prospective hidden
- [ ] Study type: Prospective → 5 patient text fields visible, retro controls hidden
- [ ] Disease frame bar in details pane hidden in prospective mode
- [ ] Study type persists across page reload (localStorage)
- [ ] Display mode: Portrait → 3-column layout with disease list, center area, sticky report
- [ ] Display mode: Landscape → restores original 75/25 layout

### Portrait Mode
- [ ] Disease list shows each disease once (deduplicated)
- [ ] Click single-location disease → auto-adds to report, location pill highlighted
- [ ] Click multi-location disease → focus ring shown, location pills update (inapplicable greyed)
- [ ] Click applicable location pill → disease added under that location
- [ ] Click another applicable location pill → NEW instance added under that location
- [ ] Both instances visible in report pane
- [ ] Click disease already in report → opens existing instance
- [ ] Report pane stays visible while scrolling (sticky)

### Prospective Mode
- [ ] Fill in UHID, Patient Name, Gender, Age, Indication
- [ ] Save → JSON has `__prospMeta` with patient info
- [ ] PDF shows "Patient Information" section
- [ ] Load saved prospective JSON → auto-switches to prospective mode, fields restore
- [ ] Clear → prospective fields cleared
- [ ] Sentences report includes prospective patient data in payload
- [ ] Sentences PDF uses prospective UHID in filename

### Sentences Report
- [ ] Button visible below Overall Remarks
- [ ] Click with empty report → alert, no modal
- [ ] Click with findings → modal opens with loading spinner
- [ ] Gemini generates prose → Quill editor appears with formatted text
- [ ] Toolbar works: bold, italic, underline, headings, lists
- [ ] Text is editable in Quill editor
- [ ] "Submit and Create PDF Report" → PDF downloads
- [ ] PDF has title, formatted content, readable layout
- [ ] Modal closes via X button, ESC key, or backdrop click

### Colonoscopy Mode
- [ ] Toggle to Colonoscopy in settings → report clears, portrait forces
- [ ] 9 location pills appear (Terminal Ileum through Anal Canal)
- [ ] Only colonoscopy-applicable diseases shown
- [ ] Click Rectum → 4 sublocation pills appear
- [ ] Other colonoscopy locations → no sublocation pills
- [ ] Landscape radio disabled when colonoscopy selected
- [ ] Toggle back to Endoscopy → landscape enabled, 4 columns restored
- [ ] Procedure type persists across page reload
- [ ] Save JSON → procedureType in metadata
- [ ] Load colonoscopy JSON → auto-switches to colonoscopy mode

### CSV Auto-Load
- [ ] Server mode: CSV auto-loads on page start
- [ ] CSV file input available in settings panel
- [ ] Manual CSV upload still works from settings

### Sentences Report

Converts structured EHR JSON into natural-language prose via Gemini, displayed in a Quill.js rich text editor:

1. Doctor clicks **"Generate Sentences Report"** button (below Overall Remarks)
2. Modal opens with loading spinner → `POST /api/generate-report` calls Gemini
3. Gemini returns HTML with `<h2>` locations, `<h3>` diseases, `<p>` sentences
4. Quill.js editor loads the HTML with Gmail-style toolbar (bold, italic, underline, headings, lists)
5. Doctor reviews/edits → clicks **"Submit and Create PDF Report"** → html2pdf.js generates A4 PDF
6. Requires server mode (not available in file:// mode)

## Future Features (Not Yet Implemented)

1. **Upload to DB**: Backend API to push finalized reports to a database
3. **Photo Captioning Mode**: Voice input for photo captions instead of EHR fields
4. **Load Saved JSON by Voice**: "Load previous report" voice command
5. **Per-disease Schema Filtering**: Send only relevant disease schema to LLM (cost optimization)
