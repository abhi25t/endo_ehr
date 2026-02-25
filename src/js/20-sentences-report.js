/* ---------- Sentences Report (LLM → Rich Text → PDF) ---------- */

// ── Build report payload ──

function _sentencesBuildPayload() {
  if (studyType === 'prospective') {
    return {
      __prospMeta: {
        uhid: prospectivePatient.uhid || null,
        patientName: prospectivePatient.patientName || null,
        gender: prospectivePatient.gender || null,
        age: prospectivePatient.age || null,
        indication: prospectivePatient.indication || null,
        csvFile: loadedCsvFilename || null,
      },
      report: JSON.parse(JSON.stringify(report || {})),
      overallRemarks: document.getElementById('overallRemarks').value || "",
    };
  }

  const uhid = document.getElementById('uhidSelect').value;
  const video = document.getElementById('videoSelect').value;
  const startFrame = document.getElementById('startFrame').value;
  const endFrame = document.getElementById('endFrame').value;
  const segFrame = document.getElementById('segmentationFrame').value;

  return {
    __retroMeta: {
      uhid: uhid || null,
      video: video || null,
      startFrame: startFrame ? parseInt(startFrame, 10) : null,
      endFrame: endFrame ? parseInt(endFrame, 10) : null,
      segmentationFrame: segFrame ? parseInt(segFrame, 10) : null,
      pii: piiEnabled,
      csvFile: loadedCsvFilename || null,
    },
    report: JSON.parse(JSON.stringify(report || {})),
    overallRemarks: document.getElementById('overallRemarks').value || "",
  };
}

// ── API call ──

async function _sentencesCallApi(reportData) {
  const resp = await fetch('/api/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_data: reportData }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'HTTP ' + resp.status);
  }

  const data = await resp.json();
  return data.html;
}

// ── Modal ──

let _sentencesQuill = null;

function _sentencesCreateModal() {
  const existing = document.getElementById('sentencesModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sentencesModal';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';

  const modal = document.createElement('div');
  modal.className = 'bg-white rounded-lg shadow-2xl flex flex-col';
  modal.style.cssText = 'width: 80vw; height: 85vh; max-width: 1200px;';

  // Header
  const header = document.createElement('div');
  header.className = 'flex justify-between items-center px-6 py-4 border-b shrink-0';
  header.innerHTML =
    '<h2 class="text-xl font-bold text-gray-800">' + (procedureType === 'colonoscopy' ? 'Colonoscopy' : 'Endoscopy') + ' Sentences Report</h2>' +
    '<button id="sentencesCloseBtn" class="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>';
  modal.appendChild(header);

  // Loading state
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'sentencesLoading';
  loadingDiv.className = 'flex-1 flex items-center justify-center';
  loadingDiv.innerHTML =
    '<div class="text-center">' +
    '<div class="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>' +
    '<p class="text-gray-600 text-lg">Generating report with AI...</p>' +
    '<p class="text-gray-400 text-sm mt-2">This may take a few seconds</p>' +
    '</div>';
  modal.appendChild(loadingDiv);

  // Editor wrapper (hidden initially)
  const editorWrapper = document.createElement('div');
  editorWrapper.id = 'sentencesEditorWrapper';
  editorWrapper.className = 'flex-1 flex flex-col hidden overflow-hidden';

  const editorContainer = document.createElement('div');
  editorContainer.id = 'sentencesEditor';
  editorContainer.className = 'flex-1 overflow-y-auto';
  editorWrapper.appendChild(editorContainer);

  modal.appendChild(editorWrapper);

  // Footer
  const footer = document.createElement('div');
  footer.id = 'sentencesFooter';
  footer.className = 'px-6 py-4 border-t flex justify-end gap-3 hidden shrink-0';
  footer.innerHTML =
    '<button id="sentencesPdfBtn" ' +
    'class="bg-green-600 text-white px-6 py-2 rounded font-semibold hover:bg-green-700">' +
    'Submit and Create PDF Report</button>';
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close handlers
  document.getElementById('sentencesCloseBtn').onclick = _sentencesCloseModal;
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _sentencesCloseModal();
  });

  overlay._escHandler = function(e) {
    if (e.key === 'Escape') _sentencesCloseModal();
  };
  document.addEventListener('keydown', overlay._escHandler);

  return overlay;
}

function _sentencesInitQuill(htmlContent) {
  var loading = document.getElementById('sentencesLoading');
  var editorWrapper = document.getElementById('sentencesEditorWrapper');
  var footer = document.getElementById('sentencesFooter');

  loading.classList.add('hidden');
  editorWrapper.classList.remove('hidden');
  footer.classList.remove('hidden');

  _sentencesQuill = new Quill('#sentencesEditor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['clean'],
      ],
    },
  });

  // Strip code fences if Gemini wraps output
  var cleaned = htmlContent;
  cleaned = cleaned.replace(/^```html?\s*/i, '');
  cleaned = cleaned.replace(/\s*```\s*$/, '');

  _sentencesQuill.root.innerHTML = cleaned;

  document.getElementById('sentencesPdfBtn').onclick = _sentencesGeneratePdf;
}

function _sentencesCloseModal() {
  var modal = document.getElementById('sentencesModal');
  if (modal) {
    document.removeEventListener('keydown', modal._escHandler);
    modal.remove();
  }
  _sentencesQuill = null;
}

// ── PDF generation from rich text ──

async function _sentencesGeneratePdf() {
  if (!_sentencesQuill) return;

  var btn = document.getElementById('sentencesPdfBtn');
  btn.disabled = true;
  btn.textContent = 'Generating PDF...';

  try {
    // Create a temporary container with print styling
    var printDiv = document.createElement('div');
    printDiv.style.cssText =
      'padding: 20px; font-family: "Times New Roman", serif; font-size: 12pt; ' +
      'line-height: 1.6; color: #000; max-width: 700px;';

    // Title
    var title = document.createElement('h1');
    title.style.cssText = 'text-align: center; color: #1e40af; font-size: 18pt; margin-bottom: 16px;';
    title.textContent = procedureType === 'colonoscopy' ? 'AIG Colonoscopy Report' : 'AIG Endoscopy Report';
    printDiv.appendChild(title);

    // Quill content
    var content = document.createElement('div');
    content.innerHTML = _sentencesQuill.root.innerHTML;

    // Style headings and paragraphs for PDF
    content.querySelectorAll('h1').forEach(function(el) { el.style.cssText = 'font-size: 18pt; font-weight: bold; margin-top: 12px;'; });
    content.querySelectorAll('h2').forEach(function(el) { el.style.cssText = 'font-size: 15pt; font-weight: bold; margin-top: 10px; color: #1e40af;'; });
    content.querySelectorAll('h3').forEach(function(el) { el.style.cssText = 'font-size: 13pt; font-weight: bold; margin-top: 8px;'; });
    content.querySelectorAll('p').forEach(function(el) { el.style.cssText = 'margin-bottom: 6px;'; });

    printDiv.appendChild(content);

    // Append to body (modal overlay covers viewport so user won't see it)
    // Must NOT use position:fixed or z-index:-1 — html2canvas can't render those
    printDiv.style.width = '700px';
    document.body.appendChild(printDiv);

    var timestamp = generateTimestamp();
    var uhid = (studyType === 'prospective') ? prospectivePatient.uhid : document.getElementById('uhidSelect').value;
    var filenameBase = uhid ? uhid + '_sentences_' + timestamp : 'sentences_report_' + timestamp;

    var opt = {
      margin: [15, 15, 15, 15],
      filename: filenameBase + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    await html2pdf().set(opt).from(printDiv).save();

    document.body.removeChild(printDiv);

    btn.textContent = 'PDF Downloaded!';
    setTimeout(function() {
      btn.disabled = false;
      btn.textContent = 'Submit and Create PDF Report';
    }, 2000);

    log('Sentences report PDF generated:', filenameBase + '.pdf');
  } catch (err) {
    logError('Sentences PDF error:', err);
    alert('Error generating PDF: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Submit and Create PDF Report';
  }
}

// ── Main handler ──

async function _sentencesGenerate() {
  if (!report || Object.keys(report).length === 0) {
    alert('No report data to generate from. Add findings first.');
    return;
  }

  var isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if (!isHttp) {
    alert('Generate Sentences Report requires the server (python server.py). Not available in file:// mode.');
    return;
  }

  var btn = document.getElementById('generateSentencesReport');
  btn.disabled = true;

  _sentencesCreateModal();

  try {
    var payload = _sentencesBuildPayload();
    var html = await _sentencesCallApi(payload);
    _sentencesInitQuill(html);
  } catch (err) {
    logError('Sentences report error:', err);
    _sentencesCloseModal();
    alert('Error generating sentences report: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ── Init ──

(function initSentencesReport() {
  var btn = document.getElementById('generateSentencesReport');
  if (btn) {
    btn.addEventListener('click', _sentencesGenerate);
  }
})();
