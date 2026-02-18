/* ---------- Debug Logging ---------- */
const DEBUG = true; // Set to false to disable console logging
function log(...args) {
  if (DEBUG) console.log('[EHR Debug]', ...args);
}
function logError(...args) {
  console.error('[EHR Error]', ...args);
}
function logWarn(...args) {
  console.warn('[EHR Warning]', ...args);
}
