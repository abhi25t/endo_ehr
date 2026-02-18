/* ---------- disease add/open ---------- */
function addOrOpenDisease(loc, disease){
  log('Adding/opening disease:', disease, 'at location:', loc);
  if(!report[loc]) report[loc] = { diseases: {} };

  const isNewDisease = !report[loc].diseases[disease];

  if(isNewDisease){
    report[loc].diseases[disease] = {
      sections: {},
      comments: "",
      sublocations: []
    };
    const def = DISEASES[disease] && DISEASES[disease].default_subloc;
    if(def){
      report[loc].diseases[disease].sublocations = [def];
      log('Applied default sub-location:', def);
    }

    // Apply default attributes for all sections and subsections
    applyDefaultAttributes(disease, report[loc].diseases[disease]);
  }
  openDetails(loc, disease);
  renderReport();
  refreshLeftHighlights();
}

/* ---------- Apply default attributes to a newly added disease ---------- */
function applyDefaultAttributes(diseaseName, diseaseReport){
  const diseaseDef = DISEASES[diseaseName];
  if(!diseaseDef || !diseaseDef.sections) return;

  log('Applying default attributes for:', diseaseName);

  Object.keys(diseaseDef.sections).forEach(secName => {
    const secDef = diseaseDef.sections[secName];

    // Apply section-level defaults
    if(secDef.default_attrs && secDef.default_attrs.length > 0){
      if(!diseaseReport.sections[secName]){
        diseaseReport.sections[secName] = { attrs: {}, inputs: [], subsections: {} };
      }
      if(!diseaseReport.sections[secName].attrs){
        diseaseReport.sections[secName].attrs = {};
      }
      secDef.default_attrs.forEach(attr => {
        diseaseReport.sections[secName].attrs[attr] = true;
        log('Applied default section attr:', secName, '->', attr);
      });
    }

    // Apply subsection-level defaults
    Object.keys(secDef.subsections || {}).forEach(subName => {
      const subDef = secDef.subsections[subName];
      if(subDef.default_attrs && subDef.default_attrs.length > 0){
        if(!diseaseReport.sections[secName]){
          diseaseReport.sections[secName] = { attrs: {}, inputs: [], subsections: {} };
        }
        if(!diseaseReport.sections[secName].subsections[subName]){
          diseaseReport.sections[secName].subsections[subName] = { attrs: {}, inputs: [] };
        }
        if(!diseaseReport.sections[secName].subsections[subName].attrs){
          diseaseReport.sections[secName].subsections[subName].attrs = {};
        }
        subDef.default_attrs.forEach(attr => {
          diseaseReport.sections[secName].subsections[subName].attrs[attr] = true;
          log('Applied default subsection attr:', secName, '->', subName, '->', attr);
        });
      }
    });
  });
}

function openDetails(loc, disease){
  if(!report[loc] || !report[loc].diseases[disease]) return;
  active = { loc, disease };
  selectedMainLoc = loc;

  document.getElementById("detailsCard").classList.remove("hidden");
  document.getElementById("detailsTitle").textContent = disease;

  renderSubLocChips();
  updateDetailsSubtitle();
  renderDetailsSections(disease);

  // Load disease-specific frame data - proper null/undefined handling
  const diseaseData = report[loc].diseases[disease];

  // Initialize frame fields if they don't exist
  if(diseaseData.startFrame === undefined) diseaseData.startFrame = null;
  if(diseaseData.endFrame === undefined) diseaseData.endFrame = null;
  if(diseaseData.segmentationFrame === undefined) diseaseData.segmentationFrame = null;

  // Set input values - use empty string for null/undefined, otherwise use the value
  document.getElementById("diseaseStartFrame").value =
    (diseaseData.startFrame !== null && diseaseData.startFrame !== undefined) ? diseaseData.startFrame : "";
  document.getElementById("diseaseEndFrame").value =
    (diseaseData.endFrame !== null && diseaseData.endFrame !== undefined) ? diseaseData.endFrame : "";
  document.getElementById("diseaseSegmentationFrame").value =
    (diseaseData.segmentationFrame !== null && diseaseData.segmentationFrame !== undefined) ? diseaseData.segmentationFrame : "";

  updateDiseaseFrameCalculations();

  document.getElementById("diseaseComments").value =
    report[loc].diseases[disease].comments || "";
}

// Calculate and update disease-specific frame count and duration
function updateDiseaseFrameCalculations() {
  const startFrame = parseInt(document.getElementById('diseaseStartFrame').value, 10) || 0;
  const endFrame = parseInt(document.getElementById('diseaseEndFrame').value, 10) || 0;

  const frameCountEl = document.getElementById('diseaseFrameCount');
  const durationEl = document.getElementById('diseaseDurationSec');

  // Check if we have valid inputs (at least one non-zero)
  const hasInput = startFrame > 0 || endFrame > 0;

  if (!hasInput) {
    frameCountEl.textContent = '0';
    frameCountEl.classList.remove('text-red-600');
    durationEl.textContent = '0.00';
    durationEl.classList.remove('text-red-600');
    return;
  }

  // Calculate frame count (can be negative if invalid)
  const frameCount = endFrame - startFrame + 1;
  const duration = frameCount / FPS;

  frameCountEl.textContent = frameCount;
  durationEl.textContent = duration.toFixed(2);

  // Show negative frame counts in red
  if (frameCount <= 0) {
    frameCountEl.classList.add('text-red-600');
    durationEl.classList.add('text-red-600');
  } else {
    frameCountEl.classList.remove('text-red-600');
    durationEl.classList.remove('text-red-600');
  }
}

// Save disease frame data when inputs change
function saveDiseaseFrameData() {
  if (!active) return;
  const diseaseData = report[active.loc].diseases[active.disease];

  const startFrame = document.getElementById('diseaseStartFrame').value;
  const endFrame = document.getElementById('diseaseEndFrame').value;
  const segFrame = document.getElementById('diseaseSegmentationFrame').value;

  diseaseData.startFrame = startFrame ? parseInt(startFrame, 10) : null;
  diseaseData.endFrame = endFrame ? parseInt(endFrame, 10) : null;
  diseaseData.segmentationFrame = segFrame ? parseInt(segFrame, 10) : null;

  updateDiseaseFrameCalculations();
  renderReport();
}

// Add event listeners for disease frame inputs
document.getElementById('diseaseStartFrame').addEventListener('input', saveDiseaseFrameData);
document.getElementById('diseaseEndFrame').addEventListener('input', saveDiseaseFrameData);
document.getElementById('diseaseSegmentationFrame').addEventListener('input', saveDiseaseFrameData);
