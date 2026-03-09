/**
 * @module export/bulk.js
 * @description Bulk JPG/PDF export for all class timetable blocks.
 */

// Section: BULK EXPORT (ALL CLASSES)

// Section: COMBINED JPG EXPORT

/**
 * Captures all visible class timetable blocks and composites them into a single JPG image for download.
 * @async
 * @returns {Promise<void>}
 */
async function exportAllTimetablesAsOneJPG() {
  if (!generated) {
    showToast("Generate timetable first.", {
      type: "warn"
    });
    return;
  }
  // Class keys that have a rendered timetable table
  const keys = (gEnabledKeys || []).filter((k) =>
    document.querySelector(`#timetable${k} table`)
  );
  if (!keys.length) {
    showToast("No class timetables to export.", {
      type: "warn"
    });
    return;
  }
  const pick = decidePdfFormatAndWidth(keys);
  const baseName = ensureFilenameExtension(
    `All_Classes-${new Date().toISOString().replace(/[:\.]/g, "-")}`,
    "jpg"
  );
  const saveTarget = await createFileSaveTarget(baseName, {
    mimeType: "image/jpeg",
    description: "JPEG image",
  });
  if (saveTarget.cancelled) return;

  await withStickyDisabled(async () => {
    // step: capture each class block as an html2canvas snapshot
    const captures = [];
    for (const k of keys) {
      const el = getClassBlockElement(k);
      if (!el) continue;
      const subjInfo = el.querySelector(`[id^=subjectInfo${k}Block]`);
      let prevDisplay = null;
      if (
        subjInfo &&
        subjInfo.style &&
        subjInfo.style.display === "none"
      ) {
        prevDisplay = subjInfo.style.display;
        subjInfo.style.display = "block";
      }
      try {
        const canvas = await withTempWidth(el, pick.targetWidthPx, () =>
          html2canvas(el, {
            scale: 2.0, // slightly lower scale for reliability
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false,
          })
        );
        captures.push({
          key: k,
          canvas
        });
      } catch (e) { console.warn("[Export] JPG capture failed for class", k, e); } finally {
        if (subjInfo && prevDisplay !== null)
          subjInfo.style.display = prevDisplay;
      }
    }
    if (!captures.length) {
      showToast("Capture failed.", {
        type: "error"
      });
      return;
    }
    // step: composite all captured canvases into one tall image
    try {
      const spacer = 24; // space between class blocks
      const maxW = Math.max(...captures.map((c) => c.canvas.width));
      const totalH = captures.reduce(
        (h, c, i) => h + c.canvas.height + (i ? spacer : 0),
        0
      );
      const out = document.createElement("canvas");
      out.width = maxW;
      out.height = totalH;
      const ctx = out.getContext("2d", {
        willReadFrequently: true
      });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
      // step: draw each capture and separator lines
      let y = 0;
      for (let i = 0; i < captures.length; i++) {
        const {
          canvas
        } = captures[i];
        const x = Math.floor((maxW - canvas.width) / 2);
        ctx.drawImage(canvas, x, y);
        y += canvas.height;
        if (i < captures.length - 1) {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillRect(20, y + Math.floor(spacer / 2), maxW - 40, 1);
          y += spacer;
          ctx.fillStyle = "#ffffff";
        }
      }
      // step: convert final canvas to blob and clean up
      const blob = await canvasToBlob(out, "image/jpeg", 0.98);
      await saveTarget.save(blob);
      try {
        captures.forEach((c) => {
          c.canvas.width = 0;
          c.canvas.height = 0;
        });
        out.width = 0;
        out.height = 0;
      } catch (e) { console.warn("[Export] canvas cleanup error", e); }
    } catch (e) {
      try {
        const first = captures[0];
        const blob = await canvasToBlob(first.canvas, "image/jpeg", 0.98);
        await saveTarget.save(blob);
      } catch (e) { console.warn("[Export] JPG fallback save failed", e); }
    }
  });
}

// Section: PDF EXPORT

/**
 * Exports all class timetable blocks as a multi-page PDF document.
 * @async
 * @returns {Promise<void>}
 */
async function exportAllTimetablesAsPDF() {
  if (!generated) {
    showToast("Generate timetable first.", {
      type: "warn"
    });
    return;
  }
  // Class keys that have a rendered timetable table
  const keys = (gEnabledKeys || []).filter((k) =>
    document.querySelector(`#timetable${k} table`)
  );
  if (!keys.length) {
    showToast("No class timetables to export.", {
      type: "warn"
    });
    return;
  }
  const pdfName = ensureFilenameExtension(
    `All_Classes_PDF-${new Date().toISOString().replace(/[:\.]/g, "-")}`,
    "pdf"
  );
  const saveTarget = await createFileSaveTarget(pdfName, {
    mimeType: "application/pdf",
    description: "PDF document",
  });
  if (saveTarget.cancelled) return;

  // Section: JSPDF LOADER

  /**
   * Lazily loads the jsPDF library from CDN if not already available.
   * @async
   * @returns {Promise<Function>} The jsPDF constructor
   */
  async function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF; // legacy global
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    throw new Error("jsPDF failed to load");
  }
  await withStickyDisabled(async () => {
    const jsPDFCtor = await ensureJsPDF();
    const captures = [];
    for (const k of keys) {
      const el = getClassBlockElement(k);
      if (!el) continue;
      const subjInfo = el.querySelector(`[id^=subjectInfo${k}Block]`);
      let prevDisplay = null;
      if (
        subjInfo &&
        subjInfo.style &&
        subjInfo.style.display === "none"
      ) {
        prevDisplay = subjInfo.style.display;
        subjInfo.style.display = "block";
      }
      try {
        const canvas = await withTempWidth(el, 1300, () =>
          html2canvas(el, {
            scale: 2.0,
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false,
          })
        );
        captures.push({
          key: k,
          canvas
        });
      } catch (e) { console.warn("[Export] PDF capture failed for class", k, e); } finally {
        if (subjInfo && prevDisplay !== null)
          subjInfo.style.display = prevDisplay;
      }
    }
    if (!captures.length) {
      showToast("Capture failed.", {
        type: "error"
      });
      return;
    }
    /** Converts CSS pixels to millimeters (approximate). */
    const pxToMm = (px) => (px * 25.4) / 96; // approximate CSS px to mm
    const margin = 10; // mm
    const fmt = {
      w: 297,
      h: 420
    }; // A3 portrait
    const pdf = new jsPDFCtor({
      orientation: "p",
      unit: "mm",
      format: "a3",
    });
    for (let idx = 0; idx < captures.length; idx++) {
      if (idx > 0) pdf.addPage();
      const {
        canvas,
        key
      } = captures[idx];
      const cwmm = pxToMm(canvas.width);
      const chmm = pxToMm(canvas.height);
      let scale = Math.min(
        (fmt.w - margin * 2) / cwmm,
        (fmt.h - margin * 2) / chmm
      );
      const drawW = cwmm * scale;
      const drawH = chmm * scale;
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext("2d", {
        willReadFrequently: true
      });
      fctx.fillStyle = "#ffffff";
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);
      const imgData = flat.toDataURL("image/jpeg", 0.95);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(margin, margin, drawW, drawH, "F");
      // Display label for the current class, used as the PDF page title
      const label = (gClassLabels && gClassLabels[key]) || `Class ${key}`;
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.text(label, margin, margin - 2, {
        baseline: "bottom"
      });
      pdf.addImage(imgData, "JPEG", margin, margin, drawW, drawH);
    }
    const pdfBlob = pdf.output("blob");
    await saveTarget.save(pdfBlob);
    try {
      captures.forEach((c) => {
        c.canvas.width = 0;
        c.canvas.height = 0;
      });
    } catch (e) { console.warn("[Export] PDF canvas cleanup error", e); }
  });
}
