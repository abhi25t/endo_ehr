/* ---------- CSV upload, sample, and JSON file load ---------- */

document.getElementById("csvFile").addEventListener("change", e => {
  const f = e.target.files[0];
  if(!f) {
    logWarn('No file selected for CSV upload');
    return;
  }
  log('Loading CSV file:', f.name, 'size:', f.size, 'bytes');

  // Track the CSV filename
  loadedCsvFilename = f.name;

  const r = new FileReader();
  r.onerror = () => {
    logError('Failed to read CSV file:', r.error);
    document.getElementById("csvNote").textContent = "Error reading file!";
    alert("Could not read the CSV file. Please try again.");
  };
  r.onload = () => {
    try {
      log('CSV file read complete, parsing...');
      const rows = parseCSV(r.result);
      if(rows.length === 0){
        logWarn('CSV parsing returned no valid rows');
        document.getElementById("csvNote").textContent = "Warning: No data found in CSV!";
        return;
      }
      buildFromCSV(rows);
      populateColumns();
      renderSubLocChips();
      renderReport();
      document.getElementById("csvNote").textContent = "CSV loaded (" + rows.length + " rows) - " + f.name;
      log('CSV loaded successfully');
    } catch(err) {
      logError('Error processing CSV:', err);
      document.getElementById("csvNote").textContent = "Error processing CSV!";
      alert("Could not process the CSV file: " + err.message);
    }
  };
  r.readAsText(f);
});

document.getElementById("loadSample").onclick = () => {
  log('Loading sample CSV data');
  const sample = `Diagnosis,Section,Subsection,Default_Sub_Location,Conditional_on,Multi_Attribute,Default_Attr,Section_Hint,Subsection_Hint,Esophagus,GE Junction,Stomach,Duodenum,Attribute1,Attribute2,Attribute3
Suspected Barrett's Esophagus,Biopsy taken,,Lower,,single,Yes,Biopsy taken for suspected Barrett's.\nThis can be multiline.,,x,,,,"Yes","No",
Suspected Barrett's Esophagus,Texture,,Lower,,multi,,Describe the texture.\nbarrett_texture_800x400.jpg,,x,,,,"Velvety","Granular","Irregular surface pattern"
Suspected Barrett's Esophagus,Prague Classification,,Lower,,single,,Enter Prague C/M length.,,x,,,,"Range(0,10)","Range(0,10)",
Caustic Injury,Substance Type,,Upper,,single,,Type of substance ingested.,,x,,,,"acid","alkali","oxidizer"
Caustic Injury,Time_since_ingestion,,Upper,,single,,Time elapsed since ingestion.,,x,,,,"int_box mm from alphanum_box",,
Tumor Sample,Size,,Upper,,single,,Enter size.,,x,x,x,x,"float_box cm",,
Simple Distance,Distance from incisors,,Upper,,single,,Distance only.,,x,,,,"int_box",,
`;
  const rows = parseCSV(sample);
  buildFromCSV(rows);
  populateColumns();
  renderSubLocChips();
  renderReport();
  document.getElementById("csvNote").textContent = "Sample loaded.";
  log('Sample CSV loaded');
};

// Load saved JSON via file picker
const jsonFileInput = document.getElementById("jsonFile");
document.getElementById("loadSavedJSON").onclick = () => jsonFileInput.click();

jsonFileInput.addEventListener("change", ev => {
  const f = ev.target.files[0];
  if(!f) {
    logWarn('No file selected for JSON load');
    return;
  }
  log('Loading JSON file:', f.name);
  const reader = new FileReader();
  reader.onerror = () => {
    logError('Failed to read JSON file:', reader.error);
    alert("Could not read the JSON file. Please try again.");
  };
  reader.onload = () => {
    loadJsonFromText(reader.result, f.name, true);
  };
  reader.readAsText(f);
  ev.target.value = "";
});
