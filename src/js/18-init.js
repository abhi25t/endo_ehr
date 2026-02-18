/* ---------- init ---------- */
(function init(){
  populateColumns();
  renderSubLocChips();
  updateFrameCalculations(); // Initialize frame count display
  tryLoadDefaultRetroVideos(); // Try to load default retro_videos folder
})();
