/* ---------- JSON load (unified) ---------- */
// restoreUhidVideo: when true (manual file load), also restores UHID/video dropdowns
// when false (auto-load from UHID folder), skips UHID/video restoration
function loadJsonFromText(text, filename, restoreUhidVideo) {
  try {
    const parsedAll = JSON.parse(text);
    if (typeof parsedAll !== "object" || parsedAll === null)
      throw new Error("Invalid JSON structure");

    // Handle retrospective metadata
    if (parsedAll.__retroMeta) {
      const retroMeta = parsedAll.__retroMeta;
      log('Found retrospective metadata:', retroMeta);

      // Restore UHID and video selection (only for manual file load)
      if (restoreUhidVideo && retroMeta.uhid) {
        const uhidSelect = document.getElementById('uhidSelect');
        // Check if UHID exists in dropdown, if not add it
        let uhidOption = Array.from(uhidSelect.options).find(opt => opt.value === retroMeta.uhid);
        if (!uhidOption) {
          uhidOption = document.createElement('option');
          uhidOption.value = retroMeta.uhid;
          uhidOption.textContent = retroMeta.uhid;
          uhidSelect.appendChild(uhidOption);
          // Also add to retroData
          if (!retroData.uhidList.includes(retroMeta.uhid)) {
            retroData.uhidList.push(retroMeta.uhid);
          }
          if (!retroData.videosByUhid[retroMeta.uhid]) {
            retroData.videosByUhid[retroMeta.uhid] = [];
          }
        }
        uhidSelect.value = retroMeta.uhid;
      }

      // Restore video selection
      if (retroMeta.video) {
        const videoSelect = document.getElementById('videoSelect');
        let videoOption = Array.from(videoSelect.options).find(opt => opt.value === retroMeta.video);
        if (!videoOption) {
          videoOption = document.createElement('option');
          videoOption.value = retroMeta.video;
          videoOption.textContent = retroMeta.video;
          videoSelect.appendChild(videoOption);
          // Also add to retroData when doing manual load
          if (restoreUhidVideo && retroMeta.uhid) {
            if (!retroData.videosByUhid[retroMeta.uhid]) {
              retroData.videosByUhid[retroMeta.uhid] = [];
            }
            if (!retroData.videosByUhid[retroMeta.uhid].includes(retroMeta.video)) {
              retroData.videosByUhid[retroMeta.uhid].push(retroMeta.video);
            }
          }
        }
        videoSelect.value = retroMeta.video;
        videoSelect.disabled = false;
      }

      // Restore frame range
      if (retroMeta.startFrame !== null && retroMeta.startFrame !== undefined) {
        document.getElementById('startFrame').value = retroMeta.startFrame;
      }
      if (retroMeta.endFrame !== null && retroMeta.endFrame !== undefined) {
        document.getElementById('endFrame').value = retroMeta.endFrame;
      }
      if (retroMeta.segmentationFrame !== null && retroMeta.segmentationFrame !== undefined) {
        document.getElementById('segmentationFrame').value = retroMeta.segmentationFrame;
      }

      // Restore PII state
      if (retroMeta.pii !== null && retroMeta.pii !== undefined) {
        piiEnabled = retroMeta.pii;
        updatePiiButtonState();
      }

      updateFrameCalculations();
    }

    // Handle lastActive metadata
    let lastActive = null;
    if (parsedAll.__meta && parsedAll.__meta.lastActive) {
      lastActive = parsedAll.__meta.lastActive;
      log('Found lastActive in JSON:', lastActive);
    }

    // Handle overall remarks
    if (parsedAll.overallRemarks) {
      document.getElementById('overallRemarks').value = parsedAll.overallRemarks;
    }

    // Get report data (handle both old and new format)
    if (parsedAll.report) {
      report = parsedAll.report;
    } else {
      const tempReport = {...parsedAll};
      delete tempReport.__retroMeta;
      delete tempReport.__meta;
      delete tempReport.overallRemarks;
      report = tempReport;
    }

    // Normalize sublocations
    Object.keys(report).forEach(loc => {
      const ds = report[loc].diseases || {};
      Object.keys(ds).forEach(dn => {
        const d = ds[dn];
        if (Array.isArray(d.sublocations)) {
        } else if (typeof d.sublocation === "string" && d.sublocation) {
          d.sublocations = [d.sublocation];
          delete d.sublocation;
        } else {
          d.sublocations = d.sublocations || [];
        }
      });
    });

    if (lastActive &&
        report[lastActive.loc] &&
        report[lastActive.loc].diseases &&
        report[lastActive.loc].diseases[lastActive.disease]) {
      active = { loc: lastActive.loc, disease: lastActive.disease };
    } else {
      active = null;
      const locKeys = Object.keys(report);
      for (const loc of locKeys) {
        const ds = report[loc].diseases || {};
        const dk = Object.keys(ds);
        if (dk.length) {
          active = { loc, disease: dk[0] };
          break;
        }
      }
    }

    if (active) selectedMainLoc = active.loc;

    populateColumns();
    renderSubLocChips();
    renderReport();

    if (active) {
      openDetails(active.loc, active.disease);
    } else {
      document.getElementById("detailsCard").classList.add("hidden");
    }

    // Mark the loaded report as "saved" so changing UHID won't warn unnecessarily
    lastSavedReportState = JSON.stringify(report);

    document.getElementById("csvNote").textContent = `Loaded: ${filename}`;
    log('JSON loaded successfully:', filename);
  } catch (err) {
    logError('Error parsing JSON:', err);
    alert("Could not load JSON file: " + err.message);
  }
}
