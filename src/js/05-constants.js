/* ---------- constants ---------- */

// Location columns for each procedure type
const ENDO_LOCATIONS = ['Esophagus', 'GE Junction', 'Stomach', 'Duodenum'];
const COLONO_LOCATIONS = [
  'Terminal Ileum', 'IC Valve', 'Caecum', 'Ascending Colon',
  'Transverse Colon', 'Descending Colon', 'Sigmoid', 'Rectum', 'Anal Canal'
];

function getLocationsForProcedure(type) {
  return (type || procedureType) === 'colonoscopy' ? COLONO_LOCATIONS : ENDO_LOCATIONS;
}

// Endoscopy sub-locations
const SUBLOCATIONS = {
  'Esophagus':['Cricopharynx','Upper','Middle','Lower','Whole esophagus','Anastomosis'],
  'GE Junction':['Z-line','Hiatal hernia','Diaphragmatic pinch'],
  'Stomach': null, // Stomach uses matrix layout - see STOMACH_SUBLOC_MATRIX
  'Duodenum': null // Duodenum uses matrix layout - see DUODENUM_SUBLOC_MATRIX
};

// Colonoscopy sub-locations (only Rectum has sub-locations)
const COLONO_SUBLOCATIONS = {
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
const STOMACH_SUBLOC_MATRIX = [
  { region: 'Antrum', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Incisura', isHeading: false, options: ['Lesser Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Lower Body', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Middle Upper Body', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Fundus', isHeading: false, options: ['Lesser Curvature', 'Greater Curvature', 'Posterior Wall', 'Anterior Wall', 'Entire'] },
  { region: 'Other', isHeading: true, options: ['Whole Stomach', 'Whole Body', 'Cardia', 'Prepyloric region', 'Pylorus', 'Anastomosis'] }
];

// Duodenum sub-location matrix structure
const DUODENUM_SUBLOC_MATRIX = [
  { region: 'D1 Bulb', isHeading: false, options: ['Anterior wall', 'Posterior wall', 'Superior wall', 'Inferior wall', 'Entire'] },
  { region: 'D2', isHeading: false, options: ['Ampullary region', 'Medial wall', 'Lateral wall', 'Inferior wall', 'Superior wall', 'Entire'] },
  { region: 'Other', isHeading: true, options: ['D1-D2 junction', 'D3', 'D4', 'Anastomosis', 'Major papilla', 'Minor papilla'] }
];

// Video file extensions (case-insensitive)
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
const FPS = 25; // Frames per second for duration calculation
