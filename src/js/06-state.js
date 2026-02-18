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
let lastSavedReportState = null;
let previousUhidSelection = '';
