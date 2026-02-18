/* ---------- PDF generation ---------- */

// Generate timestamp for filename
function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}`;
}

// Generate PDF from report data
function generatePDF(data, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let yPos = 20;
  const leftMargin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - 30;
  const lineHeight = 6;

  // Helper function to add text with word wrap and page break handling
  function addText(text, fontSize = 10, isBold = false, indent = 0) {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');

    const lines = doc.splitTextToSize(text, maxWidth - indent);
    lines.forEach(line => {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, leftMargin + indent, yPos);
      yPos += lineHeight;
    });
  }

  // Helper to add a horizontal line
  function addLine() {
    if (yPos > 280) {
      doc.addPage();
      yPos = 20;
    }
    doc.setDrawColor(200, 200, 200);
    doc.line(leftMargin, yPos, pageWidth - leftMargin, yPos);
    yPos += 4;
  }

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175); // Blue color
  doc.text('AIG Endoscopy Report', pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;
  doc.setTextColor(0, 0, 0); // Reset to black

  // Retrospective metadata
  if (data.__retroMeta) {
    const meta = data.__retroMeta;
    addLine();
    addText('Video Information', 12, true);
    yPos += 2;

    if (meta.uhid) addText(`UHID: ${meta.uhid}`, 10, false, 5);
    if (meta.video) addText(`Video: ${meta.video}`, 10, false, 5);
    if (meta.startFrame !== null && meta.endFrame !== null) {
      const frameCount = meta.endFrame - meta.startFrame + 1;
      const duration = (frameCount / FPS).toFixed(2);
      addText(`Frame Range: ${meta.startFrame} - ${meta.endFrame}`, 10, false, 5);
      addText(`# Frames: ${frameCount}  |  Duration: ${duration} sec (at ${FPS} fps)`, 10, false, 5);
    }
    if (meta.segmentationFrame !== null && meta.segmentationFrame !== undefined) {
      addText(`Segmentation Frame: ${meta.segmentationFrame}`, 10, false, 5);
    }
    if (meta.pii !== null && meta.pii !== undefined) {
      addText(`PII: ${meta.pii ? 'Yes' : 'No'}`, 10, false, 5);
    }
    if (meta.csvFile) {
      addText(`CSV File: ${meta.csvFile}`, 10, false, 5);
    }
    if (meta.savedAt) {
      const savedDate = new Date(meta.savedAt).toLocaleString();
      addText(`Saved: ${savedDate}`, 10, false, 5);
    }
    yPos += 4;
  }

  // Report content
  const reportData = data.report || {};

  Object.keys(reportData).forEach(location => {
    const locData = reportData[location];
    const diseases = locData.diseases || {};

    if (Object.keys(diseases).length === 0) return;

    addLine();
    addText(location, 14, true);
    yPos += 2;

    Object.keys(diseases).forEach(diseaseName => {
      const disease = diseases[diseaseName];

      // Disease name
      addText(`\u2022 ${diseaseName}`, 11, true, 3);

      // Sub-locations
      const sublocs = disease.sublocations || [];
      if (sublocs.length > 0) {
        addText(`Sub-Location: ${sublocs.join(', ')}`, 10, false, 8);
      }

      // Disease-level frame info
      if (disease.startFrame !== null && disease.startFrame !== undefined &&
          disease.endFrame !== null && disease.endFrame !== undefined) {
        const frameCount = disease.endFrame - disease.startFrame + 1;
        const duration = (frameCount / FPS).toFixed(2);
        addText(`Frames: ${disease.startFrame} - ${disease.endFrame} (${frameCount} frames, ${duration} sec)`, 10, false, 8);
        if (disease.segmentationFrame !== null && disease.segmentationFrame !== undefined) {
          addText(`Segmentation Frame: ${disease.segmentationFrame}`, 10, false, 8);
        }
      }

      // Sections
      const sections = disease.sections || {};
      Object.keys(sections).forEach(sectionName => {
        const section = sections[sectionName];

        // Check if section has content
        const hasAttrs = section.attrs && Object.keys(section.attrs).length > 0;
        const hasFilledInputs = (section.inputs || []).some(i => {
          if (i.type === 'group') return groupHasAnyValue(i);
          return (i.label || i.value || '').trim() !== '';
        });
        const hasFilledSubs = Object.keys(section.subsections || {}).some(subName => {
          const sub = section.subsections[subName];
          const subHasAttrs = sub.attrs && Object.keys(sub.attrs).length > 0;
          const subHasInputs = (sub.inputs || []).some(i => {
            if (i.type === 'group') return groupHasAnyValue(i);
            return (i.label || i.value || '').trim() !== '';
          });
          return subHasAttrs || subHasInputs;
        });

        if (!hasAttrs && !hasFilledInputs && !hasFilledSubs) return;

        addText(`${sectionName}:`, 10, true, 8);

        // Section attributes
        Object.keys(section.attrs || {}).forEach(attr => {
          addText(`- ${attr}`, 10, false, 12);
        });

        // Section inputs
        (section.inputs || []).forEach(input => {
          let txt = '';
          if (input.type === 'group') {
            txt = renderGroupLabel(input);
          } else {
            txt = (input.label || input.value || '').trim();
          }
          if (txt) addText(`- ${txt}`, 10, false, 12);
        });

        // Subsections
        Object.keys(section.subsections || {}).forEach(subName => {
          const sub = section.subsections[subName];
          const subHasAttrs = sub.attrs && Object.keys(sub.attrs).length > 0;
          const subHasInputs = (sub.inputs || []).some(i => {
            if (i.type === 'group') return groupHasAnyValue(i);
            return (i.label || i.value || '').trim() !== '';
          });

          if (!subHasAttrs && !subHasInputs) return;

          addText(`${subName}:`, 10, false, 12);

          Object.keys(sub.attrs || {}).forEach(attr => {
            addText(`- ${attr}`, 10, false, 16);
          });

          (sub.inputs || []).forEach(input => {
            let txt = '';
            if (input.type === 'group') {
              txt = renderGroupLabel(input);
            } else {
              txt = (input.label || input.value || '').trim();
            }
            if (txt) addText(`- ${txt}`, 10, false, 16);
          });
        });
      });

      // Comments
      if (disease.comments) {
        addText(`Comments: ${disease.comments}`, 10, false, 8);
      }

      yPos += 3;
    });
  });

  // Overall remarks
  if (data.overallRemarks) {
    addLine();
    addText('Overall Remarks', 12, true);
    yPos += 2;
    addText(data.overallRemarks, 10, false, 5);
  }

  // Save PDF
  return doc.output('blob');
}
