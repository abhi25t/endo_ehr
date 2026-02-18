/* ---------- Left columns (diseases) ---------- */
function populateColumns(){
  if (displayMode === 'portrait') { populateColumnsPortrait(); return; }

  ["col-esophagus","col-gejunction","col-stomach","col-duodenum"].forEach(id => {
    document.getElementById(id).innerHTML = "";
  });

  Object.keys(DISEASES).forEach(name => {
    const def = DISEASES[name];
    Object.keys(def.locations).forEach(loc => {
      const colId =
        loc === "Esophagus" ? "col-esophagus" :
        loc === "GE Junction" ? "col-gejunction" :
        loc === "Stomach" ? "col-stomach" : "col-duodenum";

      const btn = document.createElement("button");
      btn.className = "left-disease";
      btn.textContent = name;
      btn.dataset.loc = loc;
      btn.dataset.disease = name;

      btn.onclick = () => {
        selectedMainLoc = loc;
        addOrOpenDisease(loc, name);
        refreshLeftHighlights();
      };

      document.getElementById(colId).appendChild(btn);
    });
  });

  refreshLeftHighlights();
}

function refreshLeftHighlights(){
  if (displayMode === 'portrait') { refreshPortraitHighlights(); return; }

  document.querySelectorAll(".left-disease").forEach(btn => {
    const loc = btn.dataset.loc;
    const dn  = btn.dataset.disease;
    const inReport = !!(report[loc] && report[loc].diseases && report[loc].diseases[dn]);
    const isActive = !!(active && active.loc === loc && active.disease === dn);
    btn.classList.toggle("selected", inReport || isActive);
  });
}

/* ---------- Portrait mode: single-column disease list ---------- */

function populateColumnsPortrait(){
  const leftPane = document.getElementById('leftPane');
  if (!leftPane) return;

  // Get or create the portrait disease list container
  let list = document.getElementById('portraitDiseaseList');
  if (!list) {
    list = document.createElement('div');
    list.id = 'portraitDiseaseList';
    list.className = 'bg-white p-3 rounded shadow space-y-1 overflow-y-auto';
    list.style.maxHeight = '85vh';
    leftPane.insertBefore(list, leftPane.firstChild);
  }
  list.innerHTML = '';

  // Deduplicate: show each disease once
  const seen = new Set();
  Object.keys(DISEASES).forEach(name => {
    if (seen.has(name)) return;
    seen.add(name);

    const def = DISEASES[name];
    const locs = Object.keys(def.locations);

    const btn = document.createElement('button');
    btn.className = 'left-disease text-sm';
    btn.textContent = name;
    btn.dataset.disease = name;
    btn.dataset.locs = JSON.stringify(locs);

    // Highlight if in report
    const inReport = locs.some(l =>
      report[l] && report[l].diseases && report[l].diseases[name]
    );
    const isActive = !!(active && locs.includes(active.loc) && active.disease === name);
    if (inReport || isActive) btn.classList.add('selected');

    // Focus ring if this is the portrait-focused disease (not yet in report)
    if (portraitSelectedDisease === name && !inReport) {
      btn.classList.add('portrait-focused');
    }

    btn.onclick = () => {
      portraitSelectedDisease = name;

      // If disease is already in report, open existing instance
      const existingLoc = locs.find(l =>
        report[l] && report[l].diseases && report[l].diseases[name]
      );
      if (existingLoc) {
        selectedMainLoc = existingLoc;
        openDetails(existingLoc, name);
        renderSubLocChips();
        refreshPortraitHighlights();
        if (typeof updatePortraitLocationPills === 'function') updatePortraitLocationPills();
        return;
      }

      // Single-location disease: auto-add immediately
      if (locs.length === 1) {
        selectedMainLoc = locs[0];
        addOrOpenDisease(locs[0], name);
        renderSubLocChips();
        refreshPortraitHighlights();
        if (typeof updatePortraitLocationPills === 'function') updatePortraitLocationPills();
        return;
      }

      // Multi-location disease: just focus it, update location pills, wait for pill click
      refreshPortraitHighlights();
      if (typeof updatePortraitLocationPills === 'function') updatePortraitLocationPills();
    };

    list.appendChild(btn);
  });
}

function refreshPortraitHighlights(){
  const buttons = document.querySelectorAll('#portraitDiseaseList .left-disease');
  buttons.forEach(btn => {
    const name = btn.dataset.disease;
    const locs = JSON.parse(btn.dataset.locs || '[]');

    const inReport = locs.some(l =>
      report[l] && report[l].diseases && report[l].diseases[name]
    );
    const isActive = !!(active && locs.includes(active.loc) && active.disease === name);
    btn.classList.toggle('selected', inReport || isActive);

    // Focus ring for the currently focused disease (not yet in report)
    btn.classList.toggle('portrait-focused',
      portraitSelectedDisease === name && !inReport && !isActive);
  });
}
