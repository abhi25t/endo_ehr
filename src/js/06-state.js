/* ---------- mutable global state ---------- */
let DISEASES = {};
let report = {};
let active = null;
let selectedMainLoc = 'Esophagus';

let retroData = {
  uhidList: [],
  videosByUhid: {},
  jsonCountByUhid: {},
  uhidFolderHandles: {},
  rootFolderHandle: null
};

let piiEnabled = false;
let loadedCsvFilename = null;
let loadedCsvText = null;
let lastSavedReportState = null;
let previousUhidSelection = '';

/* ---------- settings state ---------- */
let darkMode = false;
let studyType = 'retrospective';    // 'retrospective' | 'prospective'
let displayMode = 'landscape';       // 'landscape' | 'portrait'
let prospectivePatient = { uhid: '', patientName: '', gender: '', age: '', indication: '' };
let portraitSelectedDisease = null;   // disease name focused in portrait mode (before location chosen)
