# UI Layout & Frontend Reference

This document covers the frontend UI structure, layout modes, settings panel, control bars, interactive behaviors, CSS classes, and testing checklists for the Endoscopy/Colonoscopy EHR.

**Key source files**: `src/js/08-disease-columns.js`, `src/js/09-sublocation-ui.js`, `src/js/10-disease-management.js`, `src/js/11-details-pane.js`, `src/js/12-report-pane.js`, `src/js/21-settings.js`. Styling: Tailwind CSS + `body.dark` overrides in `src/Endo_EHR.html`.

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
   - Dynamic based on selected location; multi-select pills (click to toggle)
   - Some locations use simple pill lists, others (Stomach, Duodenum) use matrix layout
   - All sublocation values defined in `config.yaml` → `endoscopy.sublocations` / `colonoscopy.sublocations`

3. **Details Section**
   - Appears when a disease is selected
   - Shows sections/subsections from CSV
   - Disease-specific frame inputs (Start Frame, End Frame, Segmentation Frame)
   - Additional Comments text box

### Sub-Location Matrices

Matrix structures for Stomach and Duodenum are defined in `config.yaml` → `endoscopy.matrices`. See config.yaml for full region/option details.

**Matrix Behavior**: Selecting an option in column 2 auto-selects the region pill in column 1. Deselecting all options for a region auto-deselects the region.

### Colonoscopy Locations (Portrait Mode Only)

Colonoscopy locations and sublocations are defined in `config.yaml` → `colonoscopy`. Only Rectum has sublocations.

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
