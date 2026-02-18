/* ---------- hint helper (multiline + images, strip filenames, size from name) ---------- */
function createHintElement(text){
  const wrapper = document.createElement("div");
  wrapper.className = "text-xs italic text-gray-500 mb-1";

  const imgRegex = /([A-Za-z0-9_.\-\/]+?\.(?:png|jpe?g|webp))/ig;
  const imgs = [];
  let m;

  while ((m = imgRegex.exec(text)) !== null) {
    imgs.push(m[1]);
  }

  // remove filenames from the hint text
  let cleanedText = text.replace(imgRegex, "");
  cleanedText = cleanedText
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if(cleanedText){
    const textDiv = document.createElement("div");
    textDiv.className = "whitespace-pre-line";
    textDiv.textContent = cleanedText;
    wrapper.appendChild(textDiv);
  }

  if (imgs.length) {
    const imgRow = document.createElement("div");
    imgRow.className = "mt-1 flex flex-wrap gap-2";
    imgs.forEach(fname => {
      const img = document.createElement("img");
      img.src = "pictures/" + fname;
      img.alt = fname;

      const sizeMatch = fname.match(/_(\d+)x(\d+)\.(?:png|jpe?g|webp)$/i);
      if(sizeMatch){
        img.width  = parseInt(sizeMatch[1],10);
        img.height = parseInt(sizeMatch[2],10);
      } else {
        img.style.maxHeight = "360px";
        img.style.maxWidth  = "100%";
      }

      img.className = "border rounded";
      imgRow.appendChild(img);
    });
    wrapper.appendChild(imgRow);
  }

  return wrapper;
}
