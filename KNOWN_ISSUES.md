# Known Issues & Fixes Applied

1. ✅ Location-specific section filtering
2. ✅ Conditional logic with section context
3. ✅ Disease frame data synchronization
4. ✅ Frame validation with red warning
5. ✅ Clear button resets UHID/Video
6. ✅ UHID change warns only for unsaved changes
7. ✅ Previous UHID selection restored on cancel
8. ✅ `loadedCsvText` shared via `06-state.js` (was duplicated/lost between `17-csv-upload.js` and `19-voice.js`)
9. ✅ `voiceScheduleSync()` wired to `renderReport()` (was defined but never called)
10. ✅ Disease-location validation in `models.py` (LLM could place diseases under wrong locations)
11. ✅ Matrix region auto-select on voice update (e.g., "Antrum" auto-selected when "Antrum - Posterior Wall" set by LLM)
12. ✅ New disease auto-opens in details pane (voice update now detects newly added diseases)
13. ✅ Batcher flush on stop (last sentence no longer lost when stopping dictation)
14. ✅ Sentences report PDF rendering (html2canvas requires element in normal document flow, not positioned off-viewport)
15. ✅ Settings panel with dark mode, study type, and display mode
16. ✅ Prospective mode with patient demographics (UHID, Name, Gender, Age, Indication)
17. ✅ Portrait display mode with disease-first interaction model
18. ✅ Dark mode via CSS overrides (avoids touching JS rendering functions)
19. ✅ Multi-location disease support in portrait mode (e.g., Ulcer added separately to Stomach and Duodenum)
20. ✅ Colonoscopy support with 9 location columns and Rectum sub-locations
21. ✅ Procedure type toggle (endoscopy/colonoscopy) with localStorage persistence
22. ✅ CSV auto-load on page start (server `/api/csv` + file:// fallback)
23. ✅ CSV file input moved to settings panel
24. ✅ Centralized config.yaml — all hardcoded constants (locations, sublocations, matrices, ASR/LLM config, titles, FPS, voice commands, filler words, debounce) moved to config.yaml as single source of truth for both JS and Python
