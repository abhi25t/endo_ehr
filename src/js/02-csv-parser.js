/* ---------- CSV parsing ---------- */
function parseCSV(text){
  log('Starting CSV parse, text length:', text.length);

  if (!text || typeof text !== 'string') {
    logError('Invalid CSV input: text is empty or not a string');
    return [];
  }

  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];
    if(ch === '"'){
      if(inQuotes && text[i+1] === '"'){ cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if(!inQuotes && (ch === "\r" || ch === "\n")){
      if(ch === "\r" && text[i+1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    if(!inQuotes && ch === ","){
      row.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if(cur !== "" || row.length){
    row.push(cur);
    rows.push(row);
  }
  if(!rows.length) {
    logWarn('CSV parsing resulted in no rows');
    return [];
  }

  const headers = rows[0].map(h => (h || "").trim());
  log('CSV headers found:', headers);

  // Validate required headers
  const requiredHeaders = ['Diagnosis', 'Section'];
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    logError('CSV missing required headers:', missingHeaders);
  }

  const result = rows.slice(1)
    .filter(r => r.some(c => (c || "").trim()))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h || ("col"+idx)] = (r[idx] || "").trim();
      });
      return obj;
    });

  log('CSV parsing complete. Rows parsed:', result.length);
  return result;
}

function expandRangeToken(t){
  const m = t.match(/^Range\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
  if(!m) return null;
  const start = parseInt(m[1],10);
  const end   = parseInt(m[2],10);
  const arr = [];
  for(let i=start;i<end;i++) arr.push(""+i);
  return arr;
}

function isX(v){ return v && (""+v).toLowerCase().includes("x"); }
function isMultiFlag(v){
  if(!v) return false;
  const s = (""+v).toLowerCase();
  return s.includes("x") || s.includes("yes") || s.includes("multi");
}

/* ---------- Build DISEASES model from CSV ---------- */
function buildFromCSV(rows){
  log('Building DISEASES model from', rows.length, 'rows');
  DISEASES = {};
  rows.forEach(r => {
    const d = (r["Diagnosis"] || "").trim();
    if(!d) return;

    if(!DISEASES[d]){
      DISEASES[d] = {
        sections: {},
        locations: {},
        default_subloc: (r["Default_Sub_Location"] || "").trim()
      };
    }

    getLocationsForProcedure().forEach(loc => {
      if(isX(r[loc])) DISEASES[d].locations[loc] = true;
    });

    const sec = (r["Section"] || "General").trim();
    const sub = (r["Subsection"] || "").trim();
    const secHint = (r["Section_Hint"] || "").trim();
    const subHint = (r["Subsection_Hint"] || "").trim();
    const multi = isMultiFlag(r["Multi_Attribute"]);
    const defaultAttr = (r["Default_Attr"] || "").trim();

    if(!DISEASES[d].sections[sec]){
      DISEASES[d].sections[sec] = {
        rows: [],
        subsections: {},
        multi: false,
        hint: secHint || "",
        default_attrs: []
      };
    } else if(secHint && !DISEASES[d].sections[sec].hint){
      DISEASES[d].sections[sec].hint = secHint;
    }

    const secDef = DISEASES[d].sections[sec];

    if(!sub){
      secDef.rows.push(r);
      if(multi) secDef.multi = true;
      // Store default attribute for section level
      if(defaultAttr && !secDef.default_attrs.includes(defaultAttr)){
        secDef.default_attrs.push(defaultAttr);
      }
    } else {
      if(!secDef.subsections[sub]){
        secDef.subsections[sub] = {
          rows: [],
          multi: false,
          hint: subHint || "",
          default_attrs: []
        };
      } else if(subHint && !secDef.subsections[sub].hint){
        secDef.subsections[sub].hint = subHint;
      }
      secDef.subsections[sub].rows.push(r);
      if(multi) secDef.subsections[sub].multi = true;
      // Store default attribute for subsection level
      if(defaultAttr && !secDef.subsections[sub].default_attrs.includes(defaultAttr)){
        secDef.subsections[sub].default_attrs.push(defaultAttr);
      }
    }
  });

  // Prune diseases with no applicable locations for current procedure type
  Object.keys(DISEASES).forEach(d => {
    if (Object.keys(DISEASES[d].locations).length === 0) {
      delete DISEASES[d];
    }
  });

  log('DISEASES model built with', Object.keys(DISEASES).length, 'diseases');

  // Re-check voice button enabled state (DISEASES now populated)
  if (typeof _voiceCheckEnabled === 'function') _voiceCheckEnabled();
}
