/* ---------- Voice dictation module ---------- */

/*
 * Handles:
 *  - WebSocket connection to backend (ws://host/ws/voice)
 *  - Audio capture via AudioWorklet (16kHz PCM Int16)
 *  - Receiving transcript + report updates from backend
 *  - applyVoiceUpdate() to update UI from LLM-produced report JSON
 *  - Voice toggle button, transcript bar, status indicator
 */

// ── State ──

let voiceWs = null;            // WebSocket instance
let voiceAudioCtx = null;      // AudioContext (16kHz)
let voiceMediaStream = null;   // getUserMedia stream
let voiceActive = false;       // Dictation running

// ── applyVoiceUpdate ──

/**
 * Apply a voice-dictated report update to the UI.
 *
 * This is a lightweight version of loadJsonFromText() that:
 *  - Does NOT touch __retroMeta (UHID, video, frames, PII)
 *  - Does NOT update lastSavedReportState (keeps "unsaved" status)
 *  - DOES validate disease names against loaded DISEASES
 *  - DOES normalize sublocations
 *  - DOES preserve the currently active disease if it still exists
 *  - DOES call populateColumns(), renderSubLocChips(), renderReport(), openDetails()
 *
 * @param {object} data - { report: {...}, overallRemarks: "..." }
 */
function applyVoiceUpdate(data) {
  if (!data || typeof data !== "object") return;

  const newReport = data.report || {};
  const newRemarks = data.overallRemarks;

  // Validate disease names against loaded DISEASES
  const validDiseases = new Set(Object.keys(DISEASES));

  Object.keys(newReport).forEach(loc => {
    const locEntry = newReport[loc];
    if (!locEntry || !locEntry.diseases) return;
    Object.keys(locEntry.diseases).forEach(dn => {
      if (validDiseases.size > 0 && !validDiseases.has(dn)) {
        log("applyVoiceUpdate: removing unknown disease:", dn);
        delete locEntry.diseases[dn];
      }
    });
    // Remove empty locations
    if (!Object.keys(locEntry.diseases).length) {
      delete newReport[loc];
    }
  });

  // Normalize sublocations (same logic as loadJsonFromText)
  Object.keys(newReport).forEach(loc => {
    const ds = newReport[loc].diseases || {};
    Object.keys(ds).forEach(dn => {
      const d = ds[dn];
      if (Array.isArray(d.sublocations)) {
        // already good
      } else if (typeof d.sublocation === "string" && d.sublocation) {
        d.sublocations = [d.sublocation];
        delete d.sublocation;
      } else {
        d.sublocations = d.sublocations || [];
      }
      // Auto-add region names for matrix sublocations (e.g., "Antrum" for "Antrum - Posterior Wall")
      const toAdd = [];
      d.sublocations.forEach(s => {
        const dash = s.indexOf(' - ');
        if (dash > 0) {
          const region = s.substring(0, dash);
          if (!d.sublocations.includes(region) && !toAdd.includes(region)) {
            toAdd.push(region);
          }
        }
      });
      if (toAdd.length) d.sublocations.push(...toAdd);
    });
  });

  // Collect old disease set before replacing report
  const oldDiseases = new Set();
  Object.keys(report || {}).forEach(loc => {
    Object.keys((report[loc] || {}).diseases || {}).forEach(dn => {
      oldDiseases.add(loc + "::" + dn);
    });
  });

  // Apply to global state
  report = newReport;

  // Update overallRemarks if provided
  if (newRemarks !== undefined && newRemarks !== null) {
    document.getElementById("overallRemarks").value = newRemarks;
  }

  // Find newly added diseases
  let newestDisease = null;
  Object.keys(report).forEach(loc => {
    Object.keys((report[loc] || {}).diseases || {}).forEach(dn => {
      if (!oldDiseases.has(loc + "::" + dn)) {
        newestDisease = { loc, disease: dn };
      }
    });
  });

  // Switch to newest disease if one was added, otherwise preserve active
  if (newestDisease) {
    active = newestDisease;
  } else if (active && report[active.loc] &&
      report[active.loc].diseases &&
      report[active.loc].diseases[active.disease]) {
    // active is still valid — keep it
  } else {
    // Find first available disease
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

  // Re-render UI
  populateColumns();
  renderSubLocChips();
  renderReport();

  if (active) {
    openDetails(active.loc, active.disease);
  } else {
    document.getElementById("detailsCard").classList.add("hidden");
  }

  log("applyVoiceUpdate: report applied");
}

// ── WebSocket ──

function _voiceWsUrl() {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  return proto + "//" + loc.host + "/ws/voice";
}

function _voiceConnect() {
  if (voiceWs) return;

  const url = _voiceWsUrl();
  log("Voice WS connecting:", url);

  voiceWs = new WebSocket(url);

  voiceWs.onopen = () => {
    log("Voice WS connected");
    _voiceSetStatus("Connecting...");

    // Send init message with CSV and current report state
    const initMsg = {
      type: "init",
      csv_text: loadedCsvText || "",
      report: report,
      overallRemarks: document.getElementById("overallRemarks").value || "",
      procedure_type: procedureType || "endoscopy",
    };
    voiceWs.send(JSON.stringify(initMsg));
  };

  voiceWs.onmessage = (evt) => {
    let data;
    try {
      data = JSON.parse(evt.data);
    } catch (e) {
      logError("Voice WS bad JSON:", e);
      return;
    }
    _voiceHandleMessage(data);
  };

  voiceWs.onerror = (e) => {
    logError("Voice WS error:", e);
  };

  voiceWs.onclose = () => {
    log("Voice WS closed");
    voiceWs = null;
    if (voiceActive) {
      _voiceStop();
      _voiceSetStatus("Disconnected");
    }
  };
}

function _voiceDisconnect() {
  if (voiceWs) {
    try {
      voiceWs.send(JSON.stringify({ type: "stop" }));
    } catch (e) { /* ignore */ }
    voiceWs.close();
    voiceWs = null;
  }
}

function _voiceHandleMessage(data) {
  switch (data.type) {
    case "status":
      if (data.asr) _voiceSetStatus("Listening...");
      if (data.llm === "processing") _voiceSetStatus("AI Processing...");
      if (data.llm === "idle") _voiceSetStatus("Listening...");
      if (data.paused === true) {
        _voiceSetStatus("Paused");
        _voiceSetTranscript("PAUSED - say \"Resume dictation\" to continue", "paused");
      }
      if (data.paused === false) {
        _voiceSetStatus("Listening...");
      }
      break;

    case "interim_transcript":
      _voiceSetTranscript(data.text, "interim");
      break;

    case "final_transcript":
      _voiceSetTranscript(data.text, "final");
      break;

    case "report_update":
      applyVoiceUpdate(data);
      break;

    case "capture_photo":
      log("Capture photo command received (stub)");
      _voiceShowToast("Photo capture (not yet implemented)");
      break;

    case "error":
      logWarn("Voice error:", data.message);
      _voiceShowToast("Error: " + data.message);
      break;

    case "info":
      log("Voice info:", data.message);
      break;
  }
}

// Send current report state to backend (after manual UI edits)
function _voiceSyncReportState() {
  if (!voiceWs || voiceWs.readyState !== WebSocket.OPEN) return;
  voiceWs.send(JSON.stringify({
    type: "report_state",
    report: report,
    overallRemarks: document.getElementById("overallRemarks").value || "",
  }));
}

// ── Audio Capture ──

const VOICE_WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const float32 = input[0];
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
`;

async function _voiceStartAudio() {
  try {
    voiceMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    voiceAudioCtx = new AudioContext({ sampleRate: 16000 });

    // Load worklet from inline Blob URL
    const blob = new Blob([VOICE_WORKLET_CODE], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);
    await voiceAudioCtx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const source = voiceAudioCtx.createMediaStreamSource(voiceMediaStream);
    const workletNode = new AudioWorkletNode(voiceAudioCtx, "pcm-processor");

    workletNode.port.onmessage = (evt) => {
      if (voiceWs && voiceWs.readyState === WebSocket.OPEN) {
        voiceWs.send(evt.data); // ArrayBuffer of Int16 PCM
      }
    };

    source.connect(workletNode);
    workletNode.connect(voiceAudioCtx.destination); // needed for worklet to run

    log("Voice audio capture started (16kHz)");
  } catch (err) {
    logError("Voice audio error:", err);
    _voiceShowToast("Microphone error: " + err.message);
    throw err;
  }
}

function _voiceStopAudio() {
  if (voiceAudioCtx) {
    voiceAudioCtx.close().catch(() => {});
    voiceAudioCtx = null;
  }
  if (voiceMediaStream) {
    voiceMediaStream.getTracks().forEach(t => t.stop());
    voiceMediaStream = null;
  }
}

// ── Start / Stop ──

async function _voiceStart() {
  if (voiceActive) return;

  const btn = document.getElementById("voiceToggle");
  btn.disabled = true;
  btn.textContent = "Starting...";

  try {
    _voiceConnect();
    await _voiceStartAudio();
    voiceActive = true;
    btn.textContent = "Stop Dictation";
    btn.classList.remove("bg-green-600", "hover:bg-green-700");
    btn.classList.add("bg-red-600", "hover:bg-red-700");
    _voiceSetStatus("Listening...");
    document.getElementById("voiceTranscriptBar").classList.remove("hidden");
  } catch (err) {
    _voiceDisconnect();
    _voiceStopAudio();
    btn.textContent = "Start Dictation";
    _voiceSetStatus("");
  } finally {
    btn.disabled = false;
  }
}

function _voiceStop() {
  voiceActive = false;
  _voiceStopAudio();
  _voiceDisconnect();

  const btn = document.getElementById("voiceToggle");
  btn.textContent = "Start Dictation";
  btn.classList.remove("bg-red-600", "hover:bg-red-700");
  btn.classList.add("bg-green-600", "hover:bg-green-700");
  _voiceSetStatus("");
  document.getElementById("voiceTranscriptBar").classList.add("hidden");
}

// ── UI Helpers ──

function _voiceSetStatus(text) {
  const el = document.getElementById("voiceStatus");
  if (el) el.textContent = text;
}

function _voiceSetTranscript(text, mode) {
  const el = document.getElementById("voiceTranscriptText");
  if (!el) return;
  el.textContent = text;
  el.className = "text-sm truncate ";
  if (mode === "interim") {
    el.className += "text-gray-400 italic";
  } else if (mode === "paused") {
    el.className += "text-orange-600 font-semibold";
  } else {
    el.className += "text-gray-800";
  }
}

function _voiceShowToast(msg) {
  const bar = document.getElementById("voiceTranscriptText");
  if (bar) {
    bar.textContent = msg;
    bar.className = "text-sm truncate text-orange-600";
    setTimeout(() => {
      if (bar.textContent === msg) bar.textContent = "";
    }, 4000);
  }
}

function _voiceCheckEnabled() {
  const btn = document.getElementById("voiceToggle");
  if (!btn) return;

  // Disable if: no CSV loaded, file:// protocol, no getUserMedia
  const isHttp = window.location.protocol === "http:" || window.location.protocol === "https:";
  const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasCsv = Object.keys(DISEASES).length > 0;

  const enabled = isHttp && hasMic && hasCsv;
  btn.disabled = !enabled;

  if (!isHttp) {
    btn.title = "Voice requires HTTP (use python server.py)";
  } else if (!hasMic) {
    btn.title = "Microphone not available";
  } else if (!hasCsv) {
    btn.title = "Load CSV first";
  } else {
    btn.title = "";
  }
}

// ── Manual Edit Sync ──
// Debounced sync: called from renderReport() to send state to backend
let _voiceSyncTimer = null;
function voiceScheduleSync() {
  if (!voiceActive) return;
  clearTimeout(_voiceSyncTimer);
  _voiceSyncTimer = setTimeout(() => {
    _voiceSyncReportState();
  }, 500);
}

// ── Init ──

(function initVoice() {
  const btn = document.getElementById("voiceToggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (voiceActive) {
      _voiceStop();
    } else {
      _voiceStart();
    }
  });

  // Check enabled state initially and when CSV loads
  _voiceCheckEnabled();

  // Re-check enabled state when CSV loads (loadedCsvText stored in 17-csv-upload.js)
  const csvInput = document.getElementById("csvFile");
  if (csvInput) {
    csvInput.addEventListener("change", () => setTimeout(_voiceCheckEnabled, 100));
  }
  const sampleBtn = document.getElementById("loadSample");
  if (sampleBtn) {
    sampleBtn.addEventListener("click", () => setTimeout(_voiceCheckEnabled, 100));
  }
})();
