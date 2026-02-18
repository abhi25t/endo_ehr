/* ---------- Settings: dark mode, study type, display mode ---------- */

/* ── Dark mode ── */

function toggleDarkMode() {
  darkMode = !darkMode;
  document.body.classList.toggle('dark', darkMode);

  const toggle = document.getElementById('darkModeToggle');
  if (toggle) {
    toggle.classList.toggle('active', darkMode);
    toggle.classList.toggle('bg-blue-600', darkMode);
    toggle.classList.toggle('bg-gray-300', !darkMode);
  }

  // Also style the settings panel itself
  const panel = document.getElementById('settingsPanel');
  if (panel) {
    panel.classList.toggle('bg-gray-800', darkMode);
    panel.classList.toggle('bg-white', !darkMode);
    panel.classList.toggle('border-gray-600', darkMode);
    panel.querySelectorAll('.text-gray-700').forEach(el => {
      // handled by body.dark CSS overrides
    });
  }

  localStorage.setItem('ehr_darkMode', darkMode ? '1' : '0');
}

/* ── Study type ── */

function applyStudyType(type) {
  studyType = type;

  const retroEl = document.getElementById('retroControls');
  const prospEl = document.getElementById('prospControls');
  if (retroEl) retroEl.classList.toggle('hidden', type === 'prospective');
  if (prospEl) prospEl.classList.toggle('hidden', type === 'retrospective');

  // Hide/show disease-level frame controls in details pane
  const diseaseFrameBar = document.getElementById('diseaseFrameBar');
  if (diseaseFrameBar) diseaseFrameBar.classList.toggle('hidden', type === 'prospective');

  // Update radio buttons to match
  document.querySelectorAll('input[name="studyType"]').forEach(r => {
    r.checked = (r.value === type);
  });

  localStorage.setItem('ehr_studyType', type);
}

/* ── Display mode ── */

function applyDisplayMode(mode) {
  const prev = displayMode;
  displayMode = mode;

  // Update radio buttons
  document.querySelectorAll('input[name="displayMode"]').forEach(r => {
    r.checked = (r.value === mode);
  });

  if (mode === 'portrait') {
    _switchToPortrait();
  } else if (prev === 'portrait') {
    _switchToLandscape();
  }
}

function _switchToPortrait() {
  const mainLayout = document.getElementById('mainLayout');
  const leftPane = document.getElementById('leftPane');
  const rightPane = document.getElementById('rightPane');
  const diseaseGridCard = document.getElementById('diseaseGridCard');
  const diseaseColumnsGrid = document.getElementById('diseaseColumnsGrid');
  const sublocSection = document.getElementById('sublocSection');
  const detailsCard = document.getElementById('detailsCard');

  // Hide the entire disease grid card (columns + sublocation are moved out)
  if (diseaseGridCard) diseaseGridCard.classList.add('hidden');

  // Create center pane
  let centerPane = document.getElementById('centerPane');
  if (!centerPane) {
    centerPane = document.createElement('div');
    centerPane.id = 'centerPane';
    centerPane.className = 'space-y-4 min-w-0';
    mainLayout.insertBefore(centerPane, rightPane);
  }

  // Create location pills
  let locPills = document.getElementById('locationPills');
  if (!locPills) {
    locPills = document.createElement('div');
    locPills.id = 'locationPills';
    locPills.className = 'bg-white p-4 rounded shadow flex gap-3 flex-wrap';

    ['Esophagus', 'GE Junction', 'Stomach', 'Duodenum'].forEach(loc => {
      const pill = document.createElement('button');
      pill.className = 'pill';
      pill.textContent = loc;
      pill.dataset.loc = loc;
      pill.onclick = () => onPortraitLocationPillClick(loc);
      locPills.appendChild(pill);
    });

    centerPane.appendChild(locPills);
  }

  // Move sublocation section to center pane
  if (sublocSection) centerPane.appendChild(sublocSection);

  // Move details card to center pane
  if (detailsCard) centerPane.appendChild(detailsCard);

  // Set grid layout on main
  mainLayout.style.display = 'grid';
  mainLayout.style.gridTemplateColumns = '20% 1fr 15%';
  mainLayout.style.gap = '1rem';

  // Left pane: narrow disease list
  leftPane.style.width = '100%';
  leftPane.classList.remove('w-3/4');

  // Right pane: sticky report
  rightPane.style.width = '100%';
  rightPane.classList.remove('w-1/4');
  rightPane.style.position = 'sticky';
  rightPane.style.top = '1rem';
  rightPane.style.maxHeight = 'calc(100vh - 2rem)';
  rightPane.style.overflowY = 'auto';
  rightPane.style.alignSelf = 'start';

  // Render portrait disease list
  populateColumns();
}

function _switchToLandscape() {
  const mainLayout = document.getElementById('mainLayout');
  const leftPane = document.getElementById('leftPane');
  const rightPane = document.getElementById('rightPane');
  const diseaseGridCard = document.getElementById('diseaseGridCard');
  const diseaseColumnsGrid = document.getElementById('diseaseColumnsGrid');
  const sublocSection = document.getElementById('sublocSection');
  const detailsCard = document.getElementById('detailsCard');

  // Show the disease grid card again
  if (diseaseGridCard) diseaseGridCard.classList.remove('hidden');

  // Move sublocation back into diseaseGridCard
  if (sublocSection && diseaseGridCard) diseaseGridCard.appendChild(sublocSection);

  // Move details card back to left pane
  if (detailsCard && leftPane) leftPane.appendChild(detailsCard);

  // Remove center pane and location pills
  const centerPane = document.getElementById('centerPane');
  if (centerPane) centerPane.remove();

  // Remove portrait disease list
  const portraitList = document.getElementById('portraitDiseaseList');
  if (portraitList) portraitList.remove();

  // Reset layout styles
  mainLayout.style.display = '';
  mainLayout.style.gridTemplateColumns = '';
  mainLayout.style.gap = '';

  leftPane.style.width = '';
  leftPane.classList.add('w-3/4');

  rightPane.style.width = '';
  rightPane.classList.add('w-1/4');
  rightPane.style.position = '';
  rightPane.style.top = '';
  rightPane.style.maxHeight = '';
  rightPane.style.overflowY = '';
  rightPane.style.alignSelf = '';

  // Reset portrait state
  portraitSelectedDisease = null;

  // Re-render normal columns
  populateColumns();
  renderSubLocChips();
}

/* ── Portrait location pill click ── */

function onPortraitLocationPillClick(loc) {
  if (portraitSelectedDisease) {
    const def = DISEASES[portraitSelectedDisease];
    if (!def) return;
    const locs = Object.keys(def.locations);

    // Only act if disease applies to this location
    if (!locs.includes(loc)) return;

    // Add or open the disease at this location
    selectedMainLoc = loc;
    addOrOpenDisease(loc, portraitSelectedDisease);
    renderSubLocChips();
    refreshPortraitHighlights();
    updatePortraitLocationPills();
  } else {
    // No disease focused — just switch sublocation view
    selectedMainLoc = loc;
    renderSubLocChips();
    updatePortraitLocationPills();
  }
}

/* ── Update portrait location pill states ── */

function updatePortraitLocationPills() {
  const pills = document.querySelectorAll('#locationPills .pill');
  if (!pills.length) return;

  // Get applicable locations for the focused or active disease
  let applicableLocs = [];
  const dn = portraitSelectedDisease || (active && active.disease);
  if (dn && DISEASES[dn]) {
    applicableLocs = Object.keys(DISEASES[dn].locations);
  }

  pills.forEach(btn => {
    const loc = btn.dataset.loc;
    const hasDisease = applicableLocs.length === 0 || applicableLocs.includes(loc);
    const isCurrent = !!(active && active.loc === loc);

    // Grey out inapplicable locations
    btn.classList.toggle('portrait-greyed', !hasDisease);
    btn.disabled = !hasDisease;

    // Highlight the current active location
    btn.classList.toggle('pill-selected', isCurrent && hasDisease);
  });
}

/* ── Prospective patient input listeners ── */

function _wireProspectiveInputs() {
  const fields = {
    'prospUhid': 'uhid',
    'prospPatientName': 'patientName',
    'prospGender': 'gender',
    'prospAge': 'age',
    'prospIndication': 'indication'
  };

  Object.entries(fields).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el) {
      el.addEventListener('input', () => {
        prospectivePatient[key] = el.value;
      });
    }
  });
}

/* ── Settings panel init ── */

(function initSettings() {
  const gearBtn = document.getElementById('settingsGearBtn');
  const panel = document.getElementById('settingsPanel');

  // Toggle settings panel
  if (gearBtn && panel) {
    gearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== gearBtn) {
        panel.classList.add('hidden');
      }
    });
  }

  // Dark mode toggle
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', toggleDarkMode);
  }

  // Study type radios
  document.querySelectorAll('input[name="studyType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) applyStudyType(radio.value);
    });
  });

  // Display mode radios
  document.querySelectorAll('input[name="displayMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) applyDisplayMode(radio.value);
    });
  });

  // Prospective input listeners
  _wireProspectiveInputs();

  // Restore saved settings from localStorage
  if (localStorage.getItem('ehr_darkMode') === '1') {
    toggleDarkMode();
  }

  const savedStudy = localStorage.getItem('ehr_studyType');
  if (savedStudy && savedStudy !== 'retrospective') {
    applyStudyType(savedStudy);
  }

  // Display mode is NOT persisted — always starts in landscape
})();
