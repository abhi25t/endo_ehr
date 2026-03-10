/* ---------- constants (defaults, overridden by /api/config) ---------- */

// Location columns for each procedure type
let ENDO_LOCATIONS = ['Esophagus', 'GE Junction', 'Stomach', 'Duodenum'];
let COLONO_LOCATIONS = [
  'Terminal Ileum', 'IC Valve', 'Caecum', 'Ascending Colon',
  'Transverse Colon', 'Descending Colon', 'Sigmoid', 'Rectum', 'Anal Canal'
];

function getLocationsForProcedure(type) {
  return (type || procedureType) === 'colonoscopy' ? COLONO_LOCATIONS : ENDO_LOCATIONS;
}

// Endoscopy sub-locations
let SUBLOCATIONS = {
  'Esophagus':['Cricopharynx','Upper','Middle','Lower','Whole esophagus','Anastomosis'],
  'GE Junction':['Z-line','Hiatal hernia','Diaphragmatic pinch'],
  'Stomach': null, // Stomach uses matrix layout - see STOMACH_SUBLOC_MATRIX
  'Duodenum': null // Duodenum uses matrix layout - see DUODENUM_SUBLOC_MATRIX
};

// Colonoscopy sub-locations (only Rectum has sub-locations)
let COLONO_SUBLOCATIONS = {
  'Terminal Ileum': [],
  'IC Valve': [],
  'Caecum': [],
  'Ascending Colon': [],
  'Transverse Colon': [],
  'Descending Colon': [],
  'Sigmoid': [],
  'Rectum': ['Anterior wall', 'Posterior wall', 'Right Lateral wall', 'Left Lateral wall'],
  'Anal Canal': []
};

function getSublocationsForLocation(loc) {
  if (SUBLOCATIONS[loc] !== undefined) return SUBLOCATIONS[loc];
  if (COLONO_SUBLOCATIONS[loc] !== undefined) return COLONO_SUBLOCATIONS[loc];
  return [];
}

// Stomach sub-location matrix structure
let STOMACH_SUBLOC_MATRIX = [
  { region: 'Antrum', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Incisura', isHeading: false, options: ['Lesser Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Lower Body', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Middle Upper Body', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Fundus', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Other', isHeading: true, options: ['Whole Stomach', 'Whole Body', 'Cardia', 'Prepyloric region', 'Pylorus', 'Anastomosis'] }
];

// Duodenum sub-location matrix structure
let DUODENUM_SUBLOC_MATRIX = [
  { region: 'D1 Bulb', isHeading: false, options: ['Anterior wall', 'Posterior wall', 'Superior wall', 'Inferior wall', 'Entire'] },
  { region: 'D2', isHeading: false, options: ['Ampullary region', 'Medial wall', 'Lateral wall', 'Inferior wall', 'Superior wall', 'Entire'] },
  { region: 'Other', isHeading: true, options: ['D1-D2 junction', 'D3', 'D4', 'Anastomosis', 'Major papilla', 'Minor papilla'] }
];

// Video file extensions (case-insensitive)
let VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
let FPS = 25; // Frames per second for duration calculation

// Page titles (configurable)
let PAGE_TITLES = {
  endoscopy: 'AIG Endoscopy Report',
  colonoscopy: 'AIG Colonoscopy Report'
};

// Extra matrices loaded from config (for locations beyond Stomach/Duodenum)
let EXTRA_MATRICES = {};

/**
 * Apply config from /api/config response. Called from 21-settings.js on page load.
 */
function _applyConfig(cfg) {
  if (!cfg) return;

  // Titles
  if (cfg.titles) {
    if (cfg.titles.endoscopy) PAGE_TITLES.endoscopy = cfg.titles.endoscopy;
    if (cfg.titles.colonoscopy) PAGE_TITLES.colonoscopy = cfg.titles.colonoscopy;
  }

  // Video
  if (cfg.video) {
    if (typeof cfg.video.fps === 'number') FPS = cfg.video.fps;
    if (Array.isArray(cfg.video.extensions)) VIDEO_EXTENSIONS = cfg.video.extensions;
  }

  // Endoscopy locations & sublocations
  if (cfg.endoscopy) {
    if (Array.isArray(cfg.endoscopy.locations)) ENDO_LOCATIONS = cfg.endoscopy.locations;
    if (cfg.endoscopy.sublocations) {
      SUBLOCATIONS = {};
      for (const [loc, sublocs] of Object.entries(cfg.endoscopy.sublocations)) {
        SUBLOCATIONS[loc] = sublocs;
      }
    }
    if (cfg.endoscopy.matrices) {
      // Apply known matrices (Stomach, Duodenum) and store extras
      for (const [loc, matrix] of Object.entries(cfg.endoscopy.matrices)) {
        if (loc === 'Stomach') {
          STOMACH_SUBLOC_MATRIX = matrix;
        } else if (loc === 'Duodenum') {
          DUODENUM_SUBLOC_MATRIX = matrix;
        } else {
          EXTRA_MATRICES[loc] = matrix;
        }
      }
    }
  }

  // Colonoscopy locations & sublocations
  if (cfg.colonoscopy) {
    if (Array.isArray(cfg.colonoscopy.locations)) COLONO_LOCATIONS = cfg.colonoscopy.locations;
    if (cfg.colonoscopy.sublocations) {
      COLONO_SUBLOCATIONS = {};
      for (const [loc, sublocs] of Object.entries(cfg.colonoscopy.sublocations)) {
        COLONO_SUBLOCATIONS[loc] = sublocs;
      }
    }
    if (cfg.colonoscopy.matrices) {
      for (const [loc, matrix] of Object.entries(cfg.colonoscopy.matrices)) {
        EXTRA_MATRICES[loc] = matrix;
      }
    }
  }

  log('Config applied — locations:', ENDO_LOCATIONS, COLONO_LOCATIONS,
      'FPS:', FPS, 'titles:', PAGE_TITLES);
}
