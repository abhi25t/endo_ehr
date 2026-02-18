/* ---------- Left columns (diseases) ---------- */
function populateColumns(){
  ["col-esophagus","col-gejunction","col-stomach","col-duodenum"].forEach(id => {
    document.getElementById(id).innerHTML = "";
  });

  Object.keys(DISEASES).forEach(name => {
    const def = DISEASES[name];
    Object.keys(def.locations).forEach(loc => {
      const colId =
        loc === "Esophagus" ? "col-esophagus" :
        loc === "GE Junction" ? "col-gejunction" :
        loc === "Stomach" ? "col-stomach" : "col-duodenum";

      const btn = document.createElement("button");
      btn.className = "left-disease";
      btn.textContent = name;
      btn.dataset.loc = loc;
      btn.dataset.disease = name;

      btn.onclick = () => {
        selectedMainLoc = loc;
        addOrOpenDisease(loc, name);
        refreshLeftHighlights();
      };

      document.getElementById(colId).appendChild(btn);
    });
  });

  refreshLeftHighlights();
}

function refreshLeftHighlights(){
  document.querySelectorAll(".left-disease").forEach(btn => {
    const loc = btn.dataset.loc;
    const dn  = btn.dataset.disease;
    const inReport = !!(report[loc] && report[loc].diseases && report[loc].diseases[dn]);
    const isActive = !!(active && active.loc === loc && active.disease === dn);
    btn.classList.toggle("selected", inReport || isActive);
  });
}
