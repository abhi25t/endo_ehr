/* ---------- right-hand report ---------- */
function renderReport(){
  const rc = document.getElementById("reportContent");
  rc.innerHTML = "";

  Object.keys(report).forEach(loc => {
    const blk = document.createElement("div");
    blk.className = "border rounded bg-gray-50 p-2";

    const h = document.createElement("div");
    h.className = "text-blue-700 font-semibold mb-2";
    h.textContent = loc;
    blk.appendChild(h);

    Object.keys(report[loc].diseases).forEach(dn => {
      const e = report[loc].diseases[dn];

      const card = document.createElement("div");
      card.className = "bg-white p-3 rounded border relative";

      const close = document.createElement("button");
      close.className = "absolute right-2 top-2 text-red-500";
      close.textContent = "x";
      close.onclick = () => {
        delete report[loc].diseases[dn];
        if(!Object.keys(report[loc].diseases).length) delete report[loc];
        if(active && active.loc === loc && active.disease === dn){
          active = null;
          document.getElementById("detailsCard").classList.add("hidden");
        }
        renderReport();
        populateColumns();
        renderSubLocChips();
      };
      card.appendChild(close);

      const title = document.createElement("a");
      title.href = "#";
      title.className = "font-semibold text-sm";
      title.textContent = dn;
      title.onclick = e2 => {
        e2.preventDefault();
        openDetails(loc, dn);
        populateColumns();
      };
      card.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "text-xs text-gray-600 mt-1";
      const subs = Array.isArray(e.sublocations) ? e.sublocations : [];
      meta.innerHTML = "<strong>Sub-Locations:</strong> " + (subs.length ? subs.join(", ") : "\u2014");
      card.appendChild(meta);

      // Show disease frame info if available
      if (e.startFrame !== null && e.startFrame !== undefined &&
          e.endFrame !== null && e.endFrame !== undefined) {
        const frameMeta = document.createElement("div");
        frameMeta.className = "text-xs text-gray-600 mt-1";
        const frameCount = e.endFrame - e.startFrame + 1;
        const duration = (frameCount / FPS).toFixed(2);
        let frameText = `<strong>Frames:</strong> ${e.startFrame} - ${e.endFrame} (${frameCount} frames, ${duration} sec)`;
        if (e.segmentationFrame !== null && e.segmentationFrame !== undefined) {
          frameText += ` | <strong>Seg:</strong> ${e.segmentationFrame}`;
        }
        frameMeta.innerHTML = frameText;
        card.appendChild(frameMeta);
      }

      const ul = document.createElement("ul");
      ul.className = "list-disc pl-5 mt-2 text-xs text-gray-700";

      let any = false;
      Object.keys(e.sections || {}).forEach(sn => {
        const s = e.sections[sn];
        const hasAttrs = s.attrs && Object.keys(s.attrs).length > 0;

        // Check if inputs have actual filled values (not just empty groups)
        const hasFilledInputs = (s.inputs || []).some(i => {
          if(i.type === "group"){
            return groupHasAnyValue(i);
          } else {
            return (i.label || i.value || "").trim() !== "";
          }
        });

        // Check if subsections have actual content
        const hasFilledSubs = Object.keys(s.subsections || {}).some(subn => {
          const sub = s.subsections[subn];
          const subHasAttrs = sub.attrs && Object.keys(sub.attrs).length > 0;
          const subHasFilledInputs = (sub.inputs || []).some(i => {
            if(i.type === "group"){
              return groupHasAnyValue(i);
            } else {
              return (i.label || i.value || "").trim() !== "";
            }
          });
          return subHasAttrs || subHasFilledInputs;
        });

        if(!(hasAttrs || hasFilledInputs || hasFilledSubs)) return;

        const sli = document.createElement("li");
        sli.textContent = sn;

        const subul = document.createElement("ul");
        subul.className = "list-disc pl-6";

        // plain attribute pills
        Object.keys(s.attrs || {}).forEach(a => {
          const li = document.createElement("li");
          li.textContent = a;
          subul.appendChild(li);
        });

        // section inputs - only show if they have values
        (s.inputs || []).forEach(i => {
          let txt = "";
          if(i.type === "group"){
            txt = renderGroupLabel(i);
          } else {
            txt = (i.label || i.value || "").trim();
          }
          if(!txt) return;
          const li = document.createElement("li");
          li.textContent = txt;
          subul.appendChild(li);
        });

        // subsections - only show if they have actual content
        Object.keys(s.subsections || {}).forEach(subn => {
          const sub = s.subsections[subn];

          // Check if this subsection has any actual content
          const subHasAttrs = sub.attrs && Object.keys(sub.attrs).length > 0;
          const subHasFilledInputs = (sub.inputs || []).some(i => {
            if(i.type === "group"){
              return groupHasAnyValue(i);
            } else {
              return (i.label || i.value || "").trim() !== "";
            }
          });

          if(!subHasAttrs && !subHasFilledInputs) return; // Skip empty subsections

          const subli = document.createElement("li");
          subli.textContent = subn;

          const ssubul = document.createElement("ul");
          ssubul.className = "list-disc pl-6";

          Object.keys(sub.attrs || {}).forEach(a => {
            const li = document.createElement("li");
            li.textContent = a;
            ssubul.appendChild(li);
          });

          (sub.inputs || []).forEach(i => {
            let txt = "";
            if(i.type === "group"){
              txt = renderGroupLabel(i);
            } else {
              txt = (i.label || i.value || "").trim();
            }
            if(!txt) return;
            const li = document.createElement("li");
            li.textContent = txt;
            ssubul.appendChild(li);
          });

          if(ssubul.children.length) subli.appendChild(ssubul);
          subul.appendChild(subli);
        });

        if(subul.children.length){
          sli.appendChild(subul);
          ul.appendChild(sli);
          any = true;
        }
      });

      if(e.comments){
        const cli = document.createElement("li");
        cli.textContent = "Comments: " + e.comments;
        ul.appendChild(cli);
        any = true;
      }

      if(any) card.appendChild(ul);
      blk.appendChild(card);
    });

    rc.appendChild(blk);
  });

  refreshLeftHighlights();
  if (typeof voiceScheduleSync === "function") voiceScheduleSync();
}
