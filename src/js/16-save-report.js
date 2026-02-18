/* ---------- clear and save ---------- */

document.getElementById("clearReport").onclick = () => {
  if(!confirm("Clear entire report?")) return;
  report = {};
  active = null;
  document.getElementById("detailsCard").classList.add("hidden");
  document.getElementById("startFrame").value = "";
  document.getElementById("endFrame").value = "";
  document.getElementById("segmentationFrame").value = "";
  document.getElementById("overallRemarks").value = "";

  // Also clear UHID and Video selections
  document.getElementById("uhidSelect").value = "";
  document.getElementById("videoSelect").innerHTML = '<option value="">-- Select Video --</option>';
  document.getElementById("videoSelect").disabled = true;
  previousUhidSelection = ""; // Reset the previous selection tracker

  // Reset saved state since report is now empty
  lastSavedReportState = JSON.stringify(report);

  // Reset PII state
  piiEnabled = false;
  updatePiiButtonState();

  updateFrameCalculations();
  renderReport();
  populateColumns();
  renderSubLocChips();
  document.getElementById("csvNote").textContent = "Report cleared.";
};

// Save JSON and PDF with retrospective data
document.getElementById("saveJSON").onclick = async () => {
  const uhid = document.getElementById('uhidSelect').value;
  const video = document.getElementById('videoSelect').value;
  const startFrame = document.getElementById('startFrame').value;
  const endFrame = document.getElementById('endFrame').value;
  const segmentationFrame = document.getElementById('segmentationFrame').value;

  // Check for missing required fields and warn user
  const missingFields = [];
  if (!video) missingFields.push('Video');
  if (!startFrame) missingFields.push('Start Frame');
  if (!endFrame) missingFields.push('End Frame');

  // Check for invalid frame range (end < start)
  const startFrameNum = parseInt(startFrame, 10) || 0;
  const endFrameNum = parseInt(endFrame, 10) || 0;
  const hasFrameInput = startFrameNum > 0 || endFrameNum > 0;
  const isInvalidFrameRange = hasFrameInput && (endFrameNum < startFrameNum);

  if (isInvalidFrameRange) {
    const proceed = confirm(`Warning: Invalid frame range detected!\nEnd Frame (${endFrameNum}) is less than Start Frame (${startFrameNum}).\n\nDo you still want to save?`);
    if (!proceed) {
      return; // User cancelled
    }
  } else if (missingFields.length > 0) {
    const proceed = confirm(`Warning: The following fields are not filled:\n- ${missingFields.join('\n- ')}\n\nDo you still want to save?`);
    if (!proceed) {
      return; // User cancelled
    }
  }

  // Build output object with retrospective metadata
  const out = {
    __retroMeta: {
      uhid: uhid || null,
      video: video || null,
      startFrame: startFrame ? parseInt(startFrame, 10) : null,
      endFrame: endFrame ? parseInt(endFrame, 10) : null,
      segmentationFrame: segmentationFrame ? parseInt(segmentationFrame, 10) : null,
      pii: piiEnabled,
      csvFile: loadedCsvFilename || null,
      savedAt: new Date().toISOString()
    },
    __meta: active ? { lastActive: active } : null,
    report: JSON.parse(JSON.stringify(report || {})),
    overallRemarks: document.getElementById('overallRemarks').value || ""
  };

  log('Saving report with retro metadata:', out.__retroMeta);

  // Update last saved state
  lastSavedReportState = JSON.stringify(report);

  // Generate filename base
  const timestamp = generateTimestamp();
  const filenameBase = uhid ? `${uhid}_${timestamp}` : `report_${timestamp}`;
  const jsonFilename = `${filenameBase}.json`;
  const pdfFilename = `${filenameBase}.pdf`;

  // Generate PDF blob
  let pdfBlob;
  try {
    pdfBlob = generatePDF(out, pdfFilename);
    log('PDF generated successfully');
  } catch (err) {
    logError('Error generating PDF:', err);
    alert('Error generating PDF: ' + err.message);
  }

  // Try to save to UHID folder if File System Access API is available
  if (retroData.uhidFolderHandles && retroData.uhidFolderHandles[uhid]) {
    try {
      const folderHandle = retroData.uhidFolderHandles[uhid];

      // Save JSON
      const jsonFileHandle = await folderHandle.getFileHandle(jsonFilename, { create: true });
      const jsonWritable = await jsonFileHandle.createWritable();
      await jsonWritable.write(JSON.stringify(out, null, 2));
      await jsonWritable.close();
      log('JSON saved to UHID folder:', jsonFilename);

      // Save PDF
      if (pdfBlob) {
        const pdfFileHandle = await folderHandle.getFileHandle(pdfFilename, { create: true });
        const pdfWritable = await pdfFileHandle.createWritable();
        await pdfWritable.write(pdfBlob);
        await pdfWritable.close();
        log('PDF saved to UHID folder:', pdfFilename);
      }

      // Update JSON count in dropdown
      updateUhidJsonCount(uhid);

      document.getElementById('csvNote').textContent = `Saved: ${jsonFilename} and ${pdfFilename} to ${uhid} folder`;
      return;
    } catch (err) {
      logWarn('Could not save to UHID folder, falling back to download:', err);
    }
  }

  // Fallback: Download the files
  // Download JSON
  const jsonBlob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const jsonLink = document.createElement("a");
  jsonLink.href = jsonUrl;
  jsonLink.download = jsonFilename;
  jsonLink.click();
  URL.revokeObjectURL(jsonUrl);

  // Update JSON count in dropdown (even for downloads, to keep track)
  if (uhid) {
    updateUhidJsonCount(uhid);
  }

  // Download PDF
  if (pdfBlob) {
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const pdfLink = document.createElement("a");
    pdfLink.href = pdfUrl;
    pdfLink.download = pdfFilename;
    setTimeout(() => {
      pdfLink.click();
      URL.revokeObjectURL(pdfUrl);
    }, 100); // Small delay to ensure both downloads trigger
  }

  document.getElementById('csvNote').textContent = `Downloaded: ${jsonFilename} and ${pdfFilename}`;
  log('Files download initiated');
};
