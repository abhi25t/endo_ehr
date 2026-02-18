/* ---------- details pane ---------- */
function renderDetailsSections(diseaseName){
  const container = document.getElementById("detailsSections");
  container.innerHTML = "";
  const defs = (DISEASES[diseaseName] && DISEASES[diseaseName].sections) || {};

  Object.keys(defs).forEach(secName => {
    const secDef = defs[secName];

    const box = document.createElement("div");
    box.className = "p-3 border rounded";

    const title = document.createElement("div");
    title.className = "font-semibold mb-1";
    const secMeta = secDef.multi ? "Multi-select" : "Single selection only";
    title.innerHTML = `${secName} <span class="italic text-xs text-gray-500">(${secMeta})</span>`;
    box.appendChild(title);

    if(secDef.hint){
      box.appendChild(createHintElement(secDef.hint));
    }

    // Track if section has any visible content
    let sectionHasVisibleContent = false;

    // Render section-level rows (those without subsection)
    // Filter by location - only show rows that have "x" for the current location
    (secDef.rows || [])
      .filter(r => !(r["Subsection"] || "").trim())
      .forEach(r => {
        // Check if this row applies to the current location
        if(!isX(r[selectedMainLoc])) return;
        // Pass section context to conditional evaluation
        if(!evaluateConditional(r["Conditional_on"], secName)) return;
        box.appendChild(renderRow(r, secName, null));
        sectionHasVisibleContent = true;
      });

    // Render subsections
    Object.keys(secDef.subsections || {}).forEach(subName => {
      const subDef = secDef.subsections[subName];

      // First check if any rows in this subsection pass their conditionals AND location filter
      const visibleRows = (subDef.rows || []).filter(r => {
        // Check location applicability first
        if(!isX(r[selectedMainLoc])) return false;
        // Then check conditional with section context
        return evaluateConditional(r["Conditional_on"], secName);
      });

      // If no rows are visible, don't render this subsection at all
      if (visibleRows.length === 0) return;

      const subBox = document.createElement("div");
      subBox.className = "mt-3 p-2 border rounded bg-gray-50";

      const st = document.createElement("div");
      st.className = "font-semibold text-sm mb-1";
      const subMeta = subDef.multi ? "Multi-select" : "Single selection only";
      st.innerHTML = `${subName} <span class="italic text-xs text-gray-500">(${subMeta})</span>`;
      subBox.appendChild(st);

      if(subDef.hint){
        subBox.appendChild(createHintElement(subDef.hint));
      }

      visibleRows.forEach(r => {
        subBox.appendChild(renderRow(r, secName, subName));
      });

      box.appendChild(subBox);
      sectionHasVisibleContent = true;
    });

    // Only add the section box if it has any visible content (rows or subsections)
    if (sectionHasVisibleContent) {
      container.appendChild(box);
    }
  });

  document.getElementById("diseaseComments").oninput = e => {
    if(!active) return;
    report[active.loc].diseases[active.disease].comments = e.target.value;
    renderReport();
  };
}

/* ---------- row rendering (supports multi input boxes) ---------- */
function renderRow(row, secName, subName){
  const wrap = document.createElement("div");
  wrap.className = "mt-2";

  const attrs = Object.keys(row)
    .filter(k => /^Attribute/i.test(k))
    .map(k => row[k])
    .filter(v => v && v.trim());

  const multi = isMultiFlag(row["Multi_Attribute"]);

  attrs.forEach(attrStr => {
    if(/^Range\(/i.test(attrStr)){
      (expandRangeToken(attrStr) || []).forEach(x => {
        wrap.appendChild(makePill(x, secName, subName, multi));
      });
      return;
    }

    if(/int_box|float_box|alphanum_box/i.test(attrStr)){
      wrap.appendChild(renderInputAttribute(attrStr, secName, subName));
    } else {
      wrap.appendChild(makePill(attrStr, secName, subName, multi));
    }
  });

  return wrap;
}

/* ---------- multi-input attribute renderer (lazy group, skip empty) ---------- */
function renderInputAttribute(attrStr, secName, subName){
  const wrap = document.createElement("div");
  wrap.className = "flex items-center flex-wrap gap-2 mt-2";

  const pattern = parseAttributePattern(attrStr);

  if(!active) return wrap;
  const model = report[active.loc].diseases[active.disease];

  if(!model.sections[secName])
    model.sections[secName] = { attrs:{}, inputs:[], subsections:{} };

  let inputsRef;
  if(subName){
    if(!model.sections[secName].subsections[subName])
      model.sections[secName].subsections[subName] = { attrs:{}, inputs:[] };
    inputsRef = model.sections[secName].subsections[subName].inputs;
  } else {
    inputsRef = model.sections[secName].inputs;
  }
  if(!Array.isArray(inputsRef)){
    inputsRef = [];
    if(subName){
      model.sections[secName].subsections[subName].inputs = inputsRef;
    } else {
      model.sections[secName].inputs = inputsRef;
    }
  }

  // Try to find existing group for this attribute (same rawKey)
  let group = inputsRef.find(i => i.type === "group" && i.rawKey === attrStr) || null;

  // Align pattern & values if group exists
  if(group){
    group.pattern = pattern;
    if(!Array.isArray(group.values)) group.values = [];
    if(group.values.length < pattern.length){
      group.values = group.values.concat(
        new Array(pattern.length - group.values.length).fill("")
      );
    } else if(group.values.length > pattern.length){
      group.values = group.values.slice(0, pattern.length);
    }
  }

  pattern.forEach((tok, idx) => {
    if(tok.type === "text"){
      const span = document.createElement("span");
      span.className = "text-sm";
      span.textContent = tok.value;
      wrap.appendChild(span);
    } else {
      const input = document.createElement("input");

      // Set input type based on token type
      if(tok.type === "int_box"){
        input.type = "number";
        input.step = "1";
        input.min = "0";
        input.className = "border rounded p-1 w-20"; // Narrow width for integers
      } else if(tok.type === "float_box"){
        input.type = "number";
        input.step = "0.1";
        input.min = "0";
        input.className = "border rounded p-1 w-24"; // Medium width for floats
      } else if(tok.type === "alphanum_box"){
        input.type = "text";
        input.className = "border rounded p-1 w-48"; // Wider for alphanumeric
      }

      // Pre-fill from existing group if present
      if(group && Array.isArray(group.values)){
        input.value = group.values[idx] || "";
      }

      input.oninput = () => {
        const val = input.value.trim();

        // Ensure up-to-date model refs inside handler
        let currentModel = report[active.loc].diseases[active.disease];
        if(!currentModel.sections[secName])
          currentModel.sections[secName] = { attrs:{}, inputs:[], subsections:{} };

        let currentInputs;
        if(subName){
          if(!currentModel.sections[secName].subsections[subName])
            currentModel.sections[secName].subsections[subName] = { attrs:{}, inputs:[] };
          currentInputs = currentModel.sections[secName].subsections[subName].inputs;
        } else {
          currentInputs = currentModel.sections[secName].inputs;
        }
        if(!Array.isArray(currentInputs)){
          currentInputs = [];
          if(subName){
            currentModel.sections[secName].subsections[subName].inputs = currentInputs;
          } else {
            currentModel.sections[secName].inputs = currentInputs;
          }
        }

        // Lazily create group only when there is some non-empty value
        if(!group){
          group = {
            type: "group",
            rawKey: attrStr,
            pattern: pattern,
            values: new Array(pattern.length).fill("")
          };
          currentInputs.push(group);
        }

        group.values[idx] = val;

        // If no values at all, remove group
        if(!groupHasAnyValue(group)){
          const pos = currentInputs.indexOf(group);
          if(pos >= 0){
            currentInputs.splice(pos, 1);
          }
          group = null;
        }

        renderReport();
      };

      wrap.appendChild(input);
    }
  });

  return wrap;
}

/* ---------- attribute pill ---------- */
function makePill(attr, secName, subName, multi){
  const btn = document.createElement("button");
  btn.className = "attr-pill";
  btn.textContent = attr;

  const m = active && report[active.loc] && report[active.loc].diseases[active.disease];
  if(m){
    const ref = subName
      ? m.sections[secName]?.subsections?.[subName]?.attrs
      : m.sections[secName]?.attrs;
    if(ref && ref[attr]) btn.classList.add("selected");
  }

  btn.onclick = () => {
    if(!active) return;
    const model = report[active.loc].diseases[active.disease];
    if(!model.sections[secName])
      model.sections[secName] = { attrs:{}, inputs:[], subsections:{} };

    if(subName){
      if(!model.sections[secName].subsections[subName])
        model.sections[secName].subsections[subName] = { attrs:{}, inputs:[] };
      const t = model.sections[secName].subsections[subName].attrs;
      if(multi){
        // Multi-select: toggle the attribute
        if(t[attr]) delete t[attr]; else t[attr] = true;
      } else {
        // Single-select: if already selected, deselect; otherwise select this one only
        if(t[attr]){
          delete t[attr]; // Toggle off if already selected
        } else {
          Object.keys(t).forEach(k => delete t[k]); // Clear others
          t[attr] = true;
        }
      }
    } else {
      const t = model.sections[secName].attrs;
      if(multi){
        // Multi-select: toggle the attribute
        if(t[attr]) delete t[attr]; else t[attr] = true;
      } else {
        // Single-select: if already selected, deselect; otherwise select this one only
        if(t[attr]){
          delete t[attr]; // Toggle off if already selected
        } else {
          Object.keys(t).forEach(k => delete t[k]); // Clear others
          t[attr] = true;
        }
      }
    }

    renderDetailsSections(active.disease);
    renderReport();
    refreshLeftHighlights();
  };

  return btn;
}
