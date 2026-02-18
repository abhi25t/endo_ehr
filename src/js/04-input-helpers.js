/* ---------- helpers for multi-input attributes ---------- */
function parseAttributePattern(attrStr){
  log('Parsing attribute pattern:', attrStr);

  // First, split by whitespace
  const rawTokens = attrStr.trim().split(/\s+/);
  const result = [];

  rawTokens.forEach(tok => {
    // Check if this token contains multiple box types (e.g., "int_box:int_box" or "int_box/int_box")
    // We need to split these into separate tokens while preserving the separator
    const boxPattern = /(int_box|float_box|alphanum_box)/gi;
    const matches = tok.match(boxPattern);

    if(matches && matches.length > 1){
      // Token contains multiple input boxes - need to split it
      const splitRegex = /(int_box|float_box|alphanum_box)/gi;
      const splitParts = tok.split(splitRegex);

      splitParts.forEach((part, idx) => {
        if(!part) return; // Skip empty parts

        const lower = part.toLowerCase();
        if(lower === "int_box"){
          result.push({ type: "int_box" });
        } else if(lower === "float_box"){
          result.push({ type: "float_box" });
        } else if(lower === "alphanum_box"){
          result.push({ type: "alphanum_box" });
        } else if(part.trim()){
          // This is a separator like ":" or "/"
          result.push({ type: "text", value: part });
        }
      });
    } else {
      // Single token - process normally
      const lower = tok.toLowerCase();
      if(lower === "int_box"){
        result.push({ type: "int_box" });
      } else if(lower === "float_box"){
        result.push({ type: "float_box" });
      } else if(lower === "alphanum_box"){
        result.push({ type: "alphanum_box" });
      } else {
        result.push({ type: "text", value: tok });
      }
    }
  });

  log('Parsed pattern result:', result);
  return result;
}

function groupHasAnyValue(group){
  if(!group || !Array.isArray(group.pattern) || !Array.isArray(group.values)) return false;
  for(let i=0;i<group.pattern.length;i++){
    const t = group.pattern[i];
    if(t.type === "int_box" || t.type === "float_box" || t.type === "alphanum_box"){
      const v = group.values[i];
      if(v && v.toString().trim() !== ""){
        return true;
      }
    }
  }
  return false;
}

function renderGroupLabel(group){
  if(!group || !Array.isArray(group.pattern)) return "";
  const vals = Array.isArray(group.values) ? group.values : [];

  // Show group only if any box has non-empty value
  if(!groupHasAnyValue(group)) return "";

  const txt = group.pattern.map((t,idx)=>{
    if(t.type === "text") return t.value;
    if(t.type === "int_box" || t.type === "float_box" || t.type === "alphanum_box"){
      return vals[idx] || "";
    }
    return "";
  }).join(" ");

  return txt.replace(/\s+/g," ").trim();
}
