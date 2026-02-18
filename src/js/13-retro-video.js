/* ---------- Retrospective Video Analysis ---------- */

function isVideoFile(filename) {
  const lowerName = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

function isJsonFile(filename) {
  return filename.toLowerCase().endsWith('.json');
}

// Check if report has any data
function isReportEmpty() {
  if (!report || Object.keys(report).length === 0) return true;

  // Check if any location has diseases
  for (const loc of Object.keys(report)) {
    const diseases = report[loc].diseases || {};
    if (Object.keys(diseases).length > 0) return false;
  }
  return true;
}

// PII toggle handler
document.getElementById('piiToggle').addEventListener('click', function() {
  piiEnabled = !piiEnabled;
  if (piiEnabled) {
    this.classList.remove('bg-white', 'text-orange-600');
    this.classList.add('bg-orange-500', 'text-white');
  } else {
    this.classList.remove('bg-orange-500', 'text-white');
    this.classList.add('bg-white', 'text-orange-600');
  }
  log('PII toggled:', piiEnabled);
});

// Update PII button visual state
function updatePiiButtonState() {
  const btn = document.getElementById('piiToggle');
  if (piiEnabled) {
    btn.classList.remove('bg-white', 'text-orange-600');
    btn.classList.add('bg-orange-500', 'text-white');
  } else {
    btn.classList.remove('bg-orange-500', 'text-white');
    btn.classList.add('bg-white', 'text-orange-600');
  }
}

// Calculate and update frame count and duration
function updateFrameCalculations() {
  const startFrame = parseInt(document.getElementById('startFrame').value, 10) || 0;
  const endFrame = parseInt(document.getElementById('endFrame').value, 10) || 0;

  const frameCountEl = document.getElementById('frameCount');
  const durationEl = document.getElementById('durationSec');

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

// Clear frame inputs and calculations
function clearFrameInputs() {
  document.getElementById('startFrame').value = '';
  document.getElementById('endFrame').value = '';
  document.getElementById('segmentationFrame').value = '';
  updateFrameCalculations();
}

// Add event listeners for frame input changes
document.getElementById('startFrame').addEventListener('input', updateFrameCalculations);
document.getElementById('endFrame').addEventListener('input', updateFrameCalculations);

// Load folder from directory handle (reusable function)
async function loadFolderFromHandle(dirHandle) {
  retroData.rootFolderHandle = dirHandle;
  retroData.uhidList = [];
  retroData.videosByUhid = {};
  retroData.jsonCountByUhid = {};
  retroData.uhidFolderHandles = {};

  const uhidSelect = document.getElementById('uhidSelect');
  uhidSelect.innerHTML = '<option value="">-- Select UHID --</option>';

  // Iterate through UHID folders
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const uhid = entry.name;
      retroData.uhidList.push(uhid);
      retroData.uhidFolderHandles[uhid] = entry;
      retroData.videosByUhid[uhid] = [];
      retroData.jsonCountByUhid[uhid] = 0;

      // Get video files and count JSON files in this UHID folder
      for await (const fileEntry of entry.values()) {
        if (fileEntry.kind === 'file') {
          if (isVideoFile(fileEntry.name)) {
            retroData.videosByUhid[uhid].push(fileEntry.name);
          } else if (isJsonFile(fileEntry.name)) {
            retroData.jsonCountByUhid[uhid]++;
          }
        }
      }

      // Add UHID to dropdown with JSON count in parenthesis and color coding
      const option = document.createElement('option');
      option.value = uhid;
      const jsonCount = retroData.jsonCountByUhid[uhid];
      option.textContent = `${uhid} (${jsonCount})`;

      // Color code based on JSON count: black=0, blue=1, red=>1
      if (jsonCount === 0) {
        option.style.color = 'black';
      } else if (jsonCount === 1) {
        option.style.color = 'blue';
      } else {
        option.style.color = 'red';
      }

      uhidSelect.appendChild(option);
    }
  }

  // Sort UHIDs alphabetically
  retroData.uhidList.sort();

  // Re-sort dropdown options
  const options = Array.from(uhidSelect.options).slice(1); // Skip first "Select" option
  options.sort((a, b) => a.value.localeCompare(b.value));
  options.forEach(opt => uhidSelect.appendChild(opt));

  document.getElementById('csvNote').textContent = `Loaded ${retroData.uhidList.length} UHID folders from "${dirHandle.name}"`;
  log('Loaded UHID folders:', retroData.uhidList.length);
}

// Update JSON count for a specific UHID in the dropdown
function updateUhidJsonCount(uhid) {
  if (!uhid || !retroData.jsonCountByUhid.hasOwnProperty(uhid)) return;

  retroData.jsonCountByUhid[uhid]++;

  const uhidSelect = document.getElementById('uhidSelect');
  const option = Array.from(uhidSelect.options).find(opt => opt.value === uhid);
  if (option) {
    const jsonCount = retroData.jsonCountByUhid[uhid];
    option.textContent = `${uhid} (${jsonCount})`;

    // Update color coding
    if (jsonCount === 0) {
      option.style.color = 'black';
    } else if (jsonCount === 1) {
      option.style.color = 'blue';
    } else {
      option.style.color = 'red';
    }
  }
}

// Try to load default retro_videos folder on page load
async function tryLoadDefaultRetroVideos() {
  // Note: Due to browser security, we cannot auto-load a folder without user interaction
  // But we can try to use a previously granted permission if available
  log('Checking for default retro_videos folder...');
  document.getElementById('csvNote').textContent = 'Click "Load Videos Folder" to select the retro_videos folder, or load a CSV file.';
}

// Load Videos Folder button handler
document.getElementById('loadVideoFolder').addEventListener('click', async function() {
  if (!('showDirectoryPicker' in window)) {
    alert('Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.');
    return;
  }

  try {
    log('Opening folder picker for retro_videos...');
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });

    await loadFolderFromHandle(dirHandle);

  } catch (err) {
    if (err.name === 'AbortError') {
      log('Folder selection cancelled by user');
    } else {
      logError('Error loading videos folder:', err);
      alert('Error loading folder: ' + err.message);
    }
  }
});

// Reload folder when UHID dropdown is clicked (to refresh JSON counts)
document.getElementById('uhidSelect').addEventListener('click', async function() {
  if (retroData.rootFolderHandle) {
    log('Reloading folder on UHID dropdown click...');
    const currentUhid = this.value; // Remember current selection
    await loadFolderFromHandle(retroData.rootFolderHandle);

    // Restore selection if it still exists
    if (currentUhid && retroData.uhidList.includes(currentUhid)) {
      this.value = currentUhid;
    }
    // Update previousUhidSelection after reload to ensure it's correct
    previousUhidSelection = this.value;
  }
});

// Check if report has unsaved changes
function hasUnsavedChanges() {
  if (isReportEmpty()) return false;
  const currentState = JSON.stringify(report);
  return currentState !== lastSavedReportState;
}

// Store previous selection when dropdown gets focus (before click handler runs)
document.getElementById('uhidSelect').addEventListener('mousedown', function() {
  // Capture the value before any click processing happens
  previousUhidSelection = this.value;
  log('Captured previousUhidSelection on mousedown:', previousUhidSelection);
});

// Handle UHID selection change
document.getElementById('uhidSelect').addEventListener('change', async function(event) {
  const uhid = this.value;
  const videoSelect = document.getElementById('videoSelect');

  // Check for unsaved changes before switching
  if (hasUnsavedChanges()) {
    const proceed = confirm('You have unsaved data in the report. Changing UHID will clear it. Do you want to continue?');
    if (!proceed) {
      // Revert to previous selection
      log('Reverting to previousUhidSelection:', previousUhidSelection);
      this.value = previousUhidSelection;
      return;
    }
  }

  // Update previous selection to current
  previousUhidSelection = uhid;

  // Clear video dropdown
  videoSelect.innerHTML = '<option value="">-- Select Video --</option>';

  // Clear frame inputs when UHID changes
  clearFrameInputs();

  // Reset PII state
  piiEnabled = false;
  updatePiiButtonState();

  // Clear the brown text (csvNote) when UHID changes
  document.getElementById('csvNote').textContent = '';

  // Clear the report section and related data when UHID changes
  report = {};
  active = null;
  document.getElementById("detailsCard").classList.add("hidden");
  document.getElementById("overallRemarks").value = "";
  renderReport();
  populateColumns();
  renderSubLocChips();

  if (!uhid) {
    videoSelect.disabled = true;
    return;
  }

  // Populate videos for selected UHID
  const videos = retroData.videosByUhid[uhid] || [];
  videos.forEach(video => {
    const option = document.createElement('option');
    option.value = video;
    option.textContent = video;
    videoSelect.appendChild(option);
  });

  videoSelect.disabled = videos.length === 0;

  // Auto-select video if there's only one
  if (videos.length === 1) {
    videoSelect.value = videos[0];
    log('Auto-selected single video:', videos[0]);
  }

  log('UHID selected:', uhid, 'Videos available:', videos.length);

  // Load the latest modified JSON from this UHID folder
  await loadLatestJsonFromUhid(uhid);
});

// Load the latest modified JSON file from a UHID folder
async function loadLatestJsonFromUhid(uhid) {
  if (!retroData.uhidFolderHandles || !retroData.uhidFolderHandles[uhid]) {
    log('No folder handle for UHID:', uhid);
    return;
  }

  try {
    const folderHandle = retroData.uhidFolderHandles[uhid];
    let latestFile = null;
    let latestTime = 0;

    // Find the most recently modified JSON file
    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const file = await entry.getFile();
          if (file.lastModified > latestTime) {
            latestTime = file.lastModified;
            latestFile = file;
          }
        } catch (err) {
          logWarn('Could not get file info for:', entry.name, err);
        }
      }
    }

    if (latestFile) {
      log('Loading latest JSON file:', latestFile.name);
      const text = await latestFile.text();
      loadJsonFromText(text, latestFile.name, false);
    } else {
      log('No JSON files found in UHID folder:', uhid);
    }
  } catch (err) {
    logError('Error loading latest JSON from UHID folder:', err);
  }
}

// Handle Video selection change - clear frame inputs
document.getElementById('videoSelect').addEventListener('change', function() {
  clearFrameInputs();
  log('Video selected:', this.value);
});
