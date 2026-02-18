/* ---------- conditional logic ---------- */
// Evaluate a single condition with section context for proper subsection matching
function evaluateSingleCondition(cond, sectionContext){
  if(!cond || !cond.trim()) return true;
  const s = cond.trim();

  const locMatch = s.match(/^Location\(\s*Main\s*=\s*(.+?)\s*\)$/i);
  if(locMatch) return selectedMainLoc === locMatch[1];

  const secMatch = s.match(/^Section\(\s*([^=]+?)\s*=\s*(.+?)\s*\)$/i);
  if(secMatch){
    if(!active) return false;
    const m = report[active.loc] && report[active.loc].diseases[active.disease];
    if(!m) return false;
    const secName = secMatch[1].trim();
    const attrValue = secMatch[2].trim();
    const sec = m.sections[secName];
    if(!sec) return false;

    // Check section-level attrs first
    if(sec.attrs && sec.attrs[attrValue]){
      log('Section condition matched in section attrs:', secName, '=', attrValue);
      return true;
    }

    // Also check all subsection attrs within that specific section
    if(sec.subsections){
      for(const subName of Object.keys(sec.subsections)){
        const sub = sec.subsections[subName];
        if(sub.attrs && sub.attrs[attrValue]){
          log('Section condition matched in subsection attrs:', secName, '->', subName, '=', attrValue);
          return true;
        }
      }
    }

    return false;
  }

  const subMatch = s.match(/^Subsection\(\s*([^=]+?)\s*=\s*(.+?)\s*\)$/i);
  if(subMatch){
    if(!active) return false;
    const m = report[active.loc] && report[active.loc].diseases[active.disease];
    if(!m) return false;
    const subName = subMatch[1].trim();
    const val = subMatch[2].trim();

    // If we have a section context, search within that section first
    if(sectionContext && m.sections[sectionContext]){
      const sec = m.sections[sectionContext];
      if(sec.subsections && sec.subsections[subName] &&
         sec.subsections[subName].attrs &&
         sec.subsections[subName].attrs[val]){
        log('Subsection condition matched in context section:', sectionContext, '->', subName, '=', val);
        return true;
      }
    }

    // Fallback: search all sections (for backward compatibility)
    return Object.values(m.sections || {}).some(sec =>
      sec.subsections && sec.subsections[subName] &&
      sec.subsections[subName].attrs &&
      sec.subsections[subName].attrs[val]
    );
  }

  log('Condition not recognized:', s);
  return false;
}

// Evaluate conditional with optional section context
function evaluateConditional(cond, sectionContext){
  if(!cond || !cond.trim()) return true;
  const s = cond.trim();

  // Check for OR conditions (split by " OR " - case insensitive)
  if(/\sOR\s/i.test(s)){
    const orParts = s.split(/\sOR\s/i);
    log('Evaluating OR condition with', orParts.length, 'parts');
    return orParts.some(part => evaluateConditional(part.trim(), sectionContext));
  }

  // Check for AND conditions (split by " AND " - case insensitive)
  if(/\sAND\s/i.test(s)){
    const andParts = s.split(/\sAND\s/i);
    log('Evaluating AND condition with', andParts.length, 'parts');
    return andParts.every(part => evaluateConditional(part.trim(), sectionContext));
  }

  // Single condition - evaluate directly with section context
  return evaluateSingleCondition(s, sectionContext);
}
