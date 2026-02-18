# AIG Endoscopy EHR Prototype

## Project Overview

A modular HTML prototype for an Endoscopy Electronic Health Record (EHR) system with hierarchical menus. Built for use on large desktop monitors with ample screen real estate. Uses Tailwind CSS for styling and vanilla JavaScript.

## Tech Stack

- **Modular JavaScript** — 18 source files in `src/js/`, built into a single distributable HTML
- **Tailwind CSS** via CDN (`https://cdn.tailwindcss.com`)
- **jsPDF** for PDF generation (`https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`)
- **File System Access API** for folder operations (Chrome/Edge)
- **Python build script** (`build.py`) — inlines JS modules into a single HTML for distribution

## File Structure

```
project/
├── build.py                    # Build script: src/ → Endo_EHR.html
├── Endo_EHR.html               # Built distributable (double-click to open)
├── EGD_Heirarchial_Menu_*.csv  # Disease/section definitions
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
        └── 18-init.js               # Init IIFE
```

## Development Workflow

- **Edit** source files in `src/js/` and `src/Endo_EHR.html`
- **Test during dev**: Open `src/Endo_EHR.html` directly in browser (works with file://)
- **Build for distribution**: Run `python3 build.py` → produces `Endo_EHR.html` in project root
- **Distribute**: Give users the built `Endo_EHR.html` — single file, double-click to open

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

## Retrospective Video Analysis Controls

Located below the main heading:

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
6. **CSV File Input** - Load disease definitions

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

## Testing Checklist

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
