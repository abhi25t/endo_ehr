/* ---------- Sub-location chips (multi-select) ---------- */
function renderSubLocChips(){
  const el = document.getElementById("subloc-chips");
  el.innerHTML = "";

  let current = [];
  if(active && report[active.loc] && report[active.loc].diseases[active.disease]){
    const d = report[active.loc].diseases[active.disease];
    if(Array.isArray(d.sublocations)) current = d.sublocations;
  }

  // Special matrix layout for Stomach
  if(selectedMainLoc === 'Stomach'){
    renderSublocMatrix(el, current, STOMACH_SUBLOC_MATRIX);
    return;
  }

  // Special matrix layout for Duodenum
  if(selectedMainLoc === 'Duodenum'){
    renderSublocMatrix(el, current, DUODENUM_SUBLOC_MATRIX);
    return;
  }

  // Standard pill layout for other locations
  const options = getSublocationsForLocation(selectedMainLoc) || [];

  options.forEach(s => {
    const chip = document.createElement("button");
    chip.className = "pill";
    chip.textContent = s;

    if(current.includes(s)) chip.classList.add("pill-selected");

    chip.onclick = () => {
      if(!active || !report[active.loc] || !report[active.loc].diseases[active.disease]) return;
      const disease = report[active.loc].diseases[active.disease];
      if(!Array.isArray(disease.sublocations)) disease.sublocations = [];

      const idx = disease.sublocations.indexOf(s);
      if(idx >= 0){
        disease.sublocations.splice(idx,1);
        chip.classList.remove("pill-selected");
      } else {
        disease.sublocations.push(s);
        chip.classList.add("pill-selected");
      }

      updateDetailsSubtitle();
      renderReport();
      refreshLeftHighlights();
    };

    el.appendChild(chip);
  });
}

/* ---------- Sub-location matrix (for Stomach and Duodenum) ---------- */
function renderSublocMatrix(container, currentSelections, matrixDef){
  // Create a table-like grid for the matrix
  const table = document.createElement("div");
  table.className = "w-full";

  matrixDef.forEach((row, rowIdx) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 last:border-b-0";

    // First column - region name (pill or heading)
    const regionCell = document.createElement("div");
    regionCell.className = "w-36 flex-shrink-0";

    if(row.isHeading){
      // Just a text heading for "Other" row
      const heading = document.createElement("span");
      heading.className = "font-medium text-gray-700 text-sm";
      heading.textContent = row.region;
      regionCell.appendChild(heading);
    } else {
      // Selectable pill for region
      const regionPill = document.createElement("button");
      regionPill.className = "pill w-full text-center";
      regionPill.textContent = row.region;
      regionPill.dataset.region = row.region;
      regionPill.dataset.rowIdx = rowIdx;

      if(currentSelections.includes(row.region)){
        regionPill.classList.add("pill-selected");
      }

      regionPill.onclick = () => {
        toggleMatrixRegion(row.region);
      };

      regionCell.appendChild(regionPill);
    }

    rowDiv.appendChild(regionCell);

    // Second column - options
    const optionsCell = document.createElement("div");
    optionsCell.className = "flex flex-wrap gap-2";

    row.options.forEach(opt => {
      // Create compound key for storage: "Region - Option" (except for Other row)
      const storageKey = row.isHeading ? opt : `${row.region} - ${opt}`;

      const optPill = document.createElement("button");
      optPill.className = "pill";
      optPill.textContent = opt;
      optPill.dataset.region = row.region;
      optPill.dataset.option = opt;
      optPill.dataset.storageKey = storageKey;
      optPill.dataset.isHeading = row.isHeading;

      if(currentSelections.includes(storageKey)){
        optPill.classList.add("pill-selected");
      }

      optPill.onclick = () => {
        toggleMatrixOption(row.region, opt, storageKey, row.isHeading);
      };

      optionsCell.appendChild(optPill);
    });

    rowDiv.appendChild(optionsCell);
    table.appendChild(rowDiv);
  });

  container.appendChild(table);
}

function toggleMatrixRegion(region){
  if(!active || !report[active.loc] || !report[active.loc].diseases[active.disease]) return;
  const disease = report[active.loc].diseases[active.disease];
  if(!Array.isArray(disease.sublocations)) disease.sublocations = [];

  const idx = disease.sublocations.indexOf(region);
  if(idx >= 0){
    // Deselecting region - also remove all its options
    disease.sublocations.splice(idx, 1);
    // Remove all "Region - Option" entries for this region
    disease.sublocations = disease.sublocations.filter(s => !s.startsWith(region + ' - '));
  } else {
    disease.sublocations.push(region);
  }

  updateDetailsSubtitle();
  renderReport();
  renderSubLocChips(); // Re-render to update UI
  refreshLeftHighlights();
}

function toggleMatrixOption(region, option, storageKey, isHeading){
  if(!active || !report[active.loc] || !report[active.loc].diseases[active.disease]) return;
  const disease = report[active.loc].diseases[active.disease];
  if(!Array.isArray(disease.sublocations)) disease.sublocations = [];

  const idx = disease.sublocations.indexOf(storageKey);
  if(idx >= 0){
    // Deselecting option
    disease.sublocations.splice(idx, 1);

    // If not a heading row, check if any other options for this region are still selected
    // If none, also deselect the region
    if(!isHeading){
      const hasOtherOptions = disease.sublocations.some(s => s.startsWith(region + ' - '));
      if(!hasOtherOptions){
        const regionIdx = disease.sublocations.indexOf(region);
        if(regionIdx >= 0){
          disease.sublocations.splice(regionIdx, 1);
        }
      }
    }
  } else {
    // Selecting option
    disease.sublocations.push(storageKey);

    // If not a heading row, auto-select the region if not already selected
    if(!isHeading && !disease.sublocations.includes(region)){
      disease.sublocations.push(region);
    }
  }

  updateDetailsSubtitle();
  renderReport();
  renderSubLocChips(); // Re-render to update UI
  refreshLeftHighlights();
}

function updateDetailsSubtitle(){
  const el = document.getElementById("detailsSubTitle");
  if(!active || !report[active.loc] || !report[active.loc].diseases[active.disease]){
    el.textContent = "";
    return;
  }
  const d = report[active.loc].diseases[active.disease];
  const subs = Array.isArray(d.sublocations) ? d.sublocations : [];
  el.textContent = "Sub-Locations: " + (subs.length ? subs.join(", ") : "\u2014");
}
