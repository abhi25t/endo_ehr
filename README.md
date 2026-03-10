# Endoscopy & Colonoscopy EHR

A real-time, voice-powered Electronic Health Record system for endoscopy and colonoscopy procedures. Doctors speak naturally during procedures while the app listens, understands, and fills in structured medical findings automatically.

---

## Why This Exists

During an endoscopy or colonoscopy, the doctor's hands are occupied holding the scope and instruments. Typing findings into an EHR is impossible in real time. The current workflow forces doctors to either:

- **Dictate to a human assistant** who manually fills forms (error-prone, needs trained staff)
- **Write reports after the procedure** from memory (details lost, time wasted)

This project eliminates both problems. The doctor simply **speaks** what they see — *"There is a 2cm ulcer in the antrum, lesser curvature, Forrest 2B"* — and the system:

1. Transcribes speech using **Google Cloud Speech-to-Text** (Chirp3 model, optimized for Indian-accented English with Hindi code-switching)
2. Interprets the medical meaning using **Google Gemini 2.5 Flash** LLM
3. Maps findings to the correct structured fields in real time
4. Updates the on-screen EHR form automatically

The result is a **complete, structured endoscopy report** generated during the procedure with zero typing.

---

## Key Features

### Voice-Driven EHR
- Real-time speech-to-text with medical vocabulary optimization
- LLM-powered interpretation maps natural speech to structured EHR fields
- Voice commands: pause/resume dictation, corrections, disease removal
- Two-layer garbage filtering (pre-LLM + LLM prompt) ignores side conversations

### Structured Disease Reporting
- Hierarchical menu system: **Location** > **Disease** > **Sub-location** > **Sections** > **Attributes**
- Endoscopy: 4 locations (Esophagus, GE Junction, Stomach, Duodenum)
- Colonoscopy: 9 locations (Terminal Ileum, IC Valve, Caecum, Ascending Colon, Transverse Colon, Descending Colon, Sigmoid, Rectum, Anal Canal)
- Sub-location matrices for Stomach (Antrum, Incisura, Body, Fundus with wall positions) and Duodenum (D1-D4 with wall positions)
- Conditional visibility: sections appear/hide based on other selections
- Default attributes auto-applied from CSV definitions

### Flexible Display Modes
- **Landscape mode** — standard desktop layout (75/25 split) for workstations
- **Portrait mode** — optimized 3-column layout for a 1080x1920 portrait TV placed next to the endoscopy monitor, with disease-first interaction model and sticky report pane

### Prospective & Retrospective Studies
- **Prospective mode** — for live procedures: patient demographics (UHID, Name, Gender, Age, Indication) with no video controls
- **Retrospective mode** — for video review: folder-based video management, frame-level annotations, UHID tracking

### Report Generation
- **Structured PDF** — auto-generated with patient info, findings hierarchy, frame references
- **Sentences Report** — Gemini LLM converts structured data into natural-language prose, editable in a rich text editor (Quill.js) before PDF export
- **JSON export** — full report with metadata for downstream systems

### Dark Mode
- Full dark theme for dimly-lit endoscopy suites

### Procedure Type Toggle
- Switch between **Endoscopy** and **Colonoscopy** in settings
- Each procedure type uses different CSV location columns
- Colonoscopy is portrait-only (optimized for the 9-location workflow)
- CSV auto-loads on page start via server API (manual upload still available in settings)

---

## Architecture

```
                    Browser (Chrome)                         Python Backend (FastAPI)
                    ================                         =======================

                    Microphone
                      |
                      v
                    AudioWorklet (16kHz PCM)
                      |
                      v
              WebSocket binary frames ───────────────>  /ws/voice endpoint
                                                             |
                                                   +---------+---------+
                                                   |                   |
                                                   v                   v
                                            ASR Bridge           Transcript
                                         (Google STT v2,         Batcher
                                          Chirp3 model,        (1.5s debounce)
                                          phrase hints)              |
                                                   |                 v
                                                   v           LLM Caller
                                            transcript        (Gemini 2.5 Flash)
                                             results               |
                                                                   v
              WebSocket text frame  <─────────────────  Updated report JSON
                      |                                 (Pydantic-validated)
                      v
              applyVoiceUpdate()
                      |
         +------------+------------+
         |            |            |
         v            v            v
   Update Report  Render UI   Open Details
```

---

## Quick Start

### Option 1: Manual EHR (no voice, no server)

```bash
# Just open the built HTML file in Chrome/Edge
open Endo_EHR.html
```

The CSV auto-loads when served. Open the file, then click diseases and fill attributes manually.

### Option 2: Voice-Enabled Mode

```bash
# Install dependencies
pip install -r requirements.txt

# Set up Google Cloud credentials
export GOOGLE_APPLICATION_CREDENTIALS=path/to/your-key.json

# Generate SSL certificate (one-time, needed for intranet/microphone access)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=YOUR_IP"

# Start the server (auto-detects cert.pem/key.pem for HTTPS)
python server.py

# Open in Chrome
# https://YOUR_IP:8000  (accept self-signed cert warning)
# http://localhost:8000  (also works for local-only use)
```

1. Edit `config.yaml` to set your CSV file, SSL paths, and default settings
2. CSV auto-loads on start (or load manually from settings)
3. Select Endoscopy or Colonoscopy in settings
4. Click **Start Dictation**
5. Speak findings naturally — the report fills itself

> **Intranet access**: With SSL enabled, other machines on your network can use voice dictation at `https://SERVER_IP:8000`. Without SSL, microphone access only works on `localhost`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript (21 modules), Tailwind CSS, jsPDF, Quill.js, html2pdf.js |
| Audio | AudioWorklet (16kHz PCM), WebSocket binary streaming |
| Backend | FastAPI + Uvicorn (Python) |
| Speech-to-Text | Google Cloud Speech-to-Text v2 (Chirp3), medical phrase hints |
| LLM | Google Vertex AI Gemini 2.5 Flash |
| Validation | Pydantic v2 (enforces EHR schema on LLM output) |

### Why Vanilla JS?

The app is distributed as a **single HTML file** (`Endo_EHR.html`). Doctors double-click it to open — no install, no npm, no build tools on their machines. The build script (`build.py`) inlines all 21 JS modules into one file. This is critical for deployment in hospital environments where IT restrictions prevent installing software.

---

## Configuration

Edit `config.yaml` in the project root — it is the **single source of truth** for all configuration, including locations, sublocations, matrices, ASR/LLM settings, voice commands, and UI defaults:

```yaml
ssl:
  cert: cert.pem
  key: key.pem

csv_file: "EHR_Menu - 20260226.csv"

defaults:
  procedure_type: endoscopy            # endoscopy | colonoscopy
  dark_mode: false
  study_type: retrospective            # retrospective | prospective
  display_mode: landscape              # landscape | portrait

titles:
  endoscopy: "AIG Endoscopy Report"
  colonoscopy: "AIG Colonoscopy Report"

video:
  fps: 25
  extensions: [".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm"]

asr:                                   # Google Cloud Speech-to-Text
  location: asia-southeast1
  model: chirp_3
  language_codes: ["en-IN", "hi-IN"]
  sample_rate: 16000

llm:                                   # Google Vertex AI Gemini
  location: us-central1
  model: gemini-2.5-flash
  voice_temperature: 0.1
  sentences_temperature: 0.3

voice:
  debounce_seconds: 1.5
  filler_words: ["um", "uh", "ah", "okay", "ok", "so", "like", "yeah", "yes", "hmm", "hm"]
  commands:
    pause: ["pause dictation", "stop recording", "pause"]
    resume: ["resume dictation", "start recording", "resume"]
    capture_photo: ["capture photo", "take photo", "take picture", "take a photo"]

endoscopy:                             # Locations & sublocations
  locations: [Esophagus, GE Junction, Stomach, Duodenum]
  sublocations:
    Esophagus: [Cricopharynx, Upper, Middle, Lower, Whole esophagus, Anastomosis]
    # ... (see config.yaml for full structure including matrices)

colonoscopy:
  locations: [Terminal Ileum, IC Valve, Caecum, ..., Rectum, Anal Canal]
  sublocations:
    Rectum: [Anterior wall, Posterior wall, Right Lateral wall, Left Lateral wall]
    # other locations: []
```

All fields are optional — missing values use hardcoded defaults. Settings priority: **config.yaml < localStorage < user interaction**. The server serves frontend config via `GET /api/config`; Python modules receive backend config via function parameters. Both JS and Python share the same location/sublocation definitions from config.yaml, eliminating duplication.

---

## Disease Definition CSV

The EHR structure is entirely driven by a CSV file, making it customizable without code changes:

| Column | Purpose |
|--------|---------|
| `Diagnosis` | Disease/finding name |
| `Section` / `Subsection` | Hierarchical attribute grouping |
| `Esophagus`, `GE Junction`, `Stomach`, `Duodenum` | Endoscopy location applicability (`x` marks) |
| `Terminal Ileum`, `IC Valve`, `Caecum`, ... `Anal Canal` | Colonoscopy location applicability (`x` marks) |
| `Multi_Attribute` | Single-select vs multi-select |
| `Default_Attr` | Pre-selected attribute |
| `Conditional_on` | Show/hide based on other selections |
| `Attribute1`–`AttributeN` | Available options |

Special attribute types: `int_box`, `float_box`, `alphanum_box`, `Range(start,end)`.

---

## Project Structure

```
endo_ehr/
├── Endo_EHR.html            # Built distributable (double-click to open)
├── config.yaml              # Single source of truth: SSL, CSV, ASR/LLM, voice, locations, titles
├── build.py                 # Inlines src/js/*.js into single HTML
├── server.py                # FastAPI: serves app + WebSocket voice endpoint
├── asr_bridge.py            # Google STT v2 streaming bridge
├── llm_caller.py            # Gemini 2.5 Flash: transcript → EHR JSON
├── schema_builder.py        # CSV → LLM-readable schema
├── models.py                # Pydantic validation of LLM output
├── endoscopy_phraseset.txt  # ASR medical vocabulary hints
│
└── src/
    ├── Endo_EHR.html        # Dev HTML (with <script src> tags)
    └── js/
        ├── 01-debug.js          # Logging utilities
        ├── 02-csv-parser.js     # CSV → disease model
        ├── 03-hint-helpers.js   # Hint image rendering
        ├── 04-input-helpers.js  # Input field utilities
        ├── 05-constants.js      # Locations, sublocations, matrices, titles, FPS (defaults overridden by /api/config)
        ├── 06-state.js          # All mutable global state
        ├── 07-conditional-logic.js  # Conditional visibility
        ├── 08-disease-columns.js    # Disease list rendering
        ├── 09-sublocation-ui.js     # Sub-location pills/matrices
        ├── 10-disease-management.js # Disease add/open/frame logic
        ├── 11-details-pane.js       # Disease details rendering
        ├── 12-report-pane.js        # Report pane rendering
        ├── 13-retro-video.js        # Video folder/UHID management
        ├── 14-json-io.js            # JSON load/restore
        ├── 15-pdf-generation.js     # jsPDF report generation
        ├── 16-save-report.js        # Save/clear handlers
        ├── 17-csv-upload.js         # CSV file loading, auto-load
        ├── 18-init.js               # App initialization
        ├── 19-voice.js              # Voice dictation pipeline
        ├── 20-sentences-report.js   # LLM prose report + Quill editor
        └── 21-settings.js           # Settings: dark mode, display, study type, procedure type
```

---

## Development

```bash
# Edit source files in src/js/ and src/Endo_EHR.html
# Test by opening src/Endo_EHR.html in browser

# Build distributable
python3 build.py
# → Produces Endo_EHR.html (single file, ~146KB)
```

---

## Requirements

### Manual EHR Mode
- Chrome or Edge browser (File System Access API for folder operations)

### Voice Mode
- Python 3.9+
- Google Cloud project with Speech-to-Text v2 and Vertex AI APIs enabled
- Service account key with appropriate permissions
- Chrome browser (microphone access requires HTTPS or localhost)
- OpenSSL (for generating self-signed certificate for intranet use)

---

## License

Internal project — not for production use.
