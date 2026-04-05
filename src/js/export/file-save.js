// @ts-check
/* exported exportFacultyPDF, exportAllFacultyPDF, getClassBlockElement, exportLabJPG, exportLabPDF */

/**
 * @module export/file-save.js
 * @description File naming and save target utilities for all export modes.
 */

/* ═══════════════════════════════════════════════════════
   Section: EXPORT FUNCTIONS
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   Section: FILE UTILITIES
═══════════════════════════════════════════════════════ */

/**
 * Sanitizes a filename by removing illegal characters and collapsing whitespace.
 * @param {string} name - Raw filename to sanitize
 * @param {string} [fallbackBase="download"] - Fallback name if input is empty
 * @returns {string} Safe filename string
 */
function sanitizeDownloadFilename(name, fallbackBase = "download") {
  const base = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, "_")
    .replace(/\s+/g, "_");
  return base || fallbackBase;
}

/**
 * Ensures the filename ends with the specified file extension.
 * @param {string} filename - Filename to check
 * @param {string} extension - Desired extension (without leading dot)
 * @returns {string} Filename with the correct extension appended
 */
function ensureFilenameExtension(filename, extension) {
  const cleanName = sanitizeDownloadFilename(filename);
  const cleanExt = String(extension || "")
    .replace(/^\.+/, "")
    .toLowerCase();
  if (!cleanExt) return cleanName;
  if (cleanName.toLowerCase().endsWith(`.${cleanExt}`)) return cleanName;
  return `${cleanName}.${cleanExt}`;
}

/* ═══════════════════════════════════════════════════════
   Section: BLOB CONVERSION
═══════════════════════════════════════════════════════ */

/**
 * Converts an HTMLCanvasElement to a Blob via toBlob, wrapped in a Promise.
 * @param {HTMLCanvasElement} canvas - Source canvas element
 * @param {string} [type="image/jpeg"] - MIME type for the output blob
 * @param {number} [quality=0.98] - Encoding quality (0-1)
 * @returns {Promise<Blob>} Resolves with the canvas content as a Blob
 */
function canvasToBlob(canvas, type = "image/jpeg", quality = 0.98) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob returned null."));
        },
        type,
        quality
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Triggers a browser download for the given Blob by creating a temporary anchor element.
 * @param {Blob} blob - File content to download
 * @param {string} filename - Suggested download filename
 */
function triggerBlobDownload(blob, filename) {
  const safeName = sanitizeDownloadFilename(filename);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000); // 30s delay to ensure download completes
}

/**
 * Creates a save target that triggers a browser download for the given filename.
 * @param {string} suggestedFilename - Suggested name for the downloaded file
 * @param {{mimeType?: string, description?: string}} [options={}] - Optional MIME type and description
 * @returns {Promise<{cancelled: boolean, save: (blob: Blob) => Promise<void>}>} Save target object
 */
async function createFileSaveTarget(suggestedFilename, options = {}) {
  const safeName = sanitizeDownloadFilename(suggestedFilename);
  return {
    cancelled: false,
    async save(blob) {
      triggerBlobDownload(blob, safeName);
    },
  };
}

/**
 * Returns the faculty select element.
 * @returns {HTMLSelectElement|null}
 */
function getFacultySelectElement() {
  return /** @type {HTMLSelectElement | null} */ (document.getElementById("facultySelect"));
}

/**
 * Returns the rendered faculty timetable table element.
 * @returns {HTMLElement|null}
 */
function getRenderedFacultyTable() {
  const container = /** @type {HTMLElement | null} */ (document.getElementById("facultyTT"));
  if (!container) return null;
  return /** @type {HTMLElement | null} */ (container.querySelector("table"));
}

/**
 * Returns faculty display names available for export.
 * @returns {string[]}
 */
function getFacultyExportNames() {
  const select = getFacultySelectElement();
  if (!select) return [];
  return Array.from(select.options || [])
    .map((option) => String(option.value || "").trim())
    .filter(Boolean);
}

/**
 * Chooses an appropriate PDF page format for a faculty timetable table.
 * @param {HTMLElement} table
 * @returns {{format: "a4"|"a3", targetWidthPx: number}}
 */
function decideFacultyPdfFormat(table) {
  const headerCount = table.querySelectorAll("thead th").length;
  return headerCount >= 9 ?
    { format: "a3", targetWidthPx: 1500 } :
    { format: "a4", targetWidthPx: 1100 };
}

/**
 * Captures the currently rendered faculty timetable table for PDF export.
 * @param {HTMLElement} table
 * @param {{format: "a4"|"a3", targetWidthPx: number}} pick
 * @returns {Promise<HTMLCanvasElement>}
 */
async function captureFacultyPdfCanvas(table, pick) {
  return withTempWidth(table, pick.targetWidthPx, () =>
    html2canvas(table, {
      scale: 3.0,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: pick.targetWidthPx,
    })
  );
}

/**
 * Adds a captured timetable canvas to a PDF page.
 * @param {any} pdf
 * @param {[number, number]} fmt
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
function addCanvasToLandscapePdf(pdf, fmt, canvas) {
  const pxToMm = (px) => (px * 25.4) / 96;
  const margin = 10;
  const cwmm = pxToMm(canvas.width);
  const chmm = pxToMm(canvas.height);
  const scale = Math.min(
    (fmt[0] - margin * 2) / cwmm,
    (fmt[1] - margin * 2) / chmm
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
  pdf.addImage(imgData, "JPEG", margin, margin, drawW, drawH, undefined, "FAST");

  try {
    flat.width = 0;
    flat.height = 0;
  } catch {
    // Ignore flat-canvas cleanup failures after page render.
  }
}

/**
 * Exports the currently selected faculty timetable as a PDF document.
 * @async
 * @returns {Promise<void>}
 */
async function exportFacultyPDF() {
  const sel = getFacultySelectElement();
  const teacher = sel ? sel.value : "";
  if (!teacher) {
    showToast("Select a faculty first.", {
      type: "warn"
    });
    return;
  }
  const table = getRenderedFacultyTable();
  if (!table) {
    showToast("No timetable to export.", {
      type: "warn"
    });
    return;
  }
  const pick = decideFacultyPdfFormat(table);
  const pdfName = ensureFilenameExtension(
    `${teacher}-timetable`,
    "pdf"
  );
  const saveTarget = await createFileSaveTarget(pdfName, {
    mimeType: "application/pdf",
    description: "PDF document",
  });
  if (saveTarget.cancelled) return;

  await withStickyDisabled(async () => {
    const jsPDFCtor = await ensureJsPDFCtor();
    const canvas = await captureFacultyPdfCanvas(table, pick);
    /** @type {[number, number]} */
    const fmt = pick.format === "a3" ? [420, 297] : [297, 210];
    const pdf = new (/** @type {any} */ (jsPDFCtor))({
      orientation: "landscape",
      unit: "mm",
      format: fmt,
      compress: true,
    });
    addCanvasToLandscapePdf(pdf, fmt, canvas);

    const pdfBlob = pdf.output("blob");
    await saveTarget.save(pdfBlob);

    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      // Ignore canvas cleanup failures after export completes.
    }
  });
}

/**
 * Exports all faculty timetables into a single multi-page PDF document.
 * @async
 * @returns {Promise<void>}
 */
async function exportAllFacultyPDF() {
  const facultyNames = getFacultyExportNames();
  if (!facultyNames.length) {
    showToast("No faculty timetables to export.", {
      type: "warn"
    });
    return;
  }

  const select = getFacultySelectElement();
  const previousSelection = select ? String(select.value || "").trim() : "";
  const pdfName = ensureFilenameExtension(
    `All-Faculty-Timetables-${new Date().toISOString().replace(/[:\.]/g, "-")}`,
    "pdf"
  );
  const saveTarget = await createFileSaveTarget(pdfName, {
    mimeType: "application/pdf",
    description: "PDF document",
  });
  if (saveTarget.cancelled) return;

  await withStickyDisabled(async () => {
    const jsPDFCtor = await ensureJsPDFCtor();
    /** @type {Array<{ teacher: string, canvas: HTMLCanvasElement, format: "a4"|"a3" }>} */
    const captures = [];

    try {
      for (const teacher of facultyNames) {
        if (select) select.value = teacher;
        if (typeof renderFacultyTimetable === "function") {
          renderFacultyTimetable(teacher);
        }
        const table = getRenderedFacultyTable();
        if (!table) continue;
        const pick = decideFacultyPdfFormat(table);
        const canvas = await captureFacultyPdfCanvas(table, pick);
        captures.push({
          teacher,
          canvas,
          format: pick.format,
        });
      }
    } finally {
      if (select) {
        select.value = previousSelection;
      }
      if (typeof renderFacultyTimetable === "function") {
        if (previousSelection) {
          renderFacultyTimetable(previousSelection);
        } else if (typeof renderFacultyEmptyState === "function") {
          renderFacultyEmptyState();
        }
      }
    }

    if (!captures.length) {
      showToast("No faculty timetable to export.", {
        type: "warn"
      });
      return;
    }

    /** @type {[number, number]} */
    const fmt = captures.some((item) => item.format === "a3") ? [420, 297] : [297, 210];
    const pdf = new (/** @type {any} */ (jsPDFCtor))({
      orientation: "landscape",
      unit: "mm",
      format: fmt,
      compress: true,
    });

    captures.forEach((item, index) => {
      if (index > 0) {
        pdf.addPage(fmt, "landscape");
      }
      addCanvasToLandscapePdf(pdf, fmt, item.canvas);
    });

    const pdfBlob = pdf.output("blob");
    await saveTarget.save(pdfBlob);

    try {
      captures.forEach((item) => {
        item.canvas.width = 0;
        item.canvas.height = 0;
      });
    } catch {
      // Ignore canvas cleanup failures after export completes.
    }
  });
}

/**
 * Temporarily sets an element's width for capture, then restores original styles.
 * @param {HTMLElement} el - Element to resize
 * @param {number} px - Temporary width in pixels
 * @param {Function} fn - Callback to execute at the temporary width
 * @returns {*} The return value of fn
 */
function withTempWidth(el, px, fn) {
  const prevW = el.style.width,
    prevMaxW = el.style.maxWidth,
    prevM = el.style.margin;
  el.style.width = px + "px";
  el.style.maxWidth = "none";
  el.style.margin = "0 auto";
  try {
    return fn();
  } finally {
    el.style.width = prevW;
    el.style.maxWidth = prevMaxW;
    el.style.margin = prevM;
  }
}

/**
 * Returns the DOM element for a class timetable block by its key.
 * @param {string} classKey - The class identifier
 * @returns {HTMLElement|null} The class block element, or null if not found
 */
function getClassBlockElement(classKey) {
  if (!classKey) return null;
  return document.getElementById(`class${classKey}Block`);
}

/**
 * Returns the currently rendered lab export nodes.
 * Falls back to the lab panel itself when per-lab wrappers are not present yet.
 * @returns {HTMLElement[]}
 */
function getLabExportNodes() {
  const panel = /** @type {HTMLElement|null} */ (document.getElementById("labPanel"));
  if (!panel) return [];
  const labNodes = Array.from(
    /** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll(".lab-table-wrap"))
  );
  return labNodes.length ? labNodes : [panel];
}

/**
 * Chooses a PDF page format and target width based on lab table column count.
 * @param {HTMLElement[]} labNodes
 * @returns {{format: "a4"|"a3", targetWidthPx: number}}
 */
function decideLabPdfFormatAndWidth(labNodes) {
  let maxCols = 0;
  labNodes.forEach((node) => {
    const table = node.querySelector("table");
    const cols = table ? table.querySelectorAll("thead th").length : 0;
    if (cols > maxCols) maxCols = cols;
  });
  if (maxCols >= 11) {
    return {
      format: "a3",
      targetWidthPx: 1600,
    };
  }
  return {
    format: "a4",
    targetWidthPx: 1100,
  };
}

/**
 * Captures a lab section at a fixed export width.
 * @param {HTMLElement} node
 * @param {number} targetWidthPx
 * @returns {Promise<HTMLCanvasElement>}
 */
async function captureLabExportCanvas(node, targetWidthPx) {
  return withTempWidth(node, targetWidthPx, () =>
    html2canvas(node, {
      scale: 3.0,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: targetWidthPx,
    })
  );
}

/**
 * Lazily loads the jsPDF constructor if it is not already available.
 * @returns {Promise<Function>}
 */
async function ensureJsPDFCtor() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  throw new Error("jsPDF failed to load");
}

/**
 * Exports all lab timetable sections as a single combined JPG image.
 * @async
 * @returns {Promise<void>}
 */
async function exportLabJPG() {
  if (!generated) {
    showToast("Generate timetable first.", {
      type: "warn"
    });
    return;
  }
  try {
    renderLabTimetables();
  } catch {
    // Export can continue using the currently rendered lab panel.
  }
  const labNodes = getLabExportNodes();
  if (!labNodes.length) {
    showToast("No lab timetable to export.", {
      type: "warn"
    });
    return;
  }
  const safeName = ensureFilenameExtension(
    `Labs-${new Date().toISOString().replace(/[:\.]/g, "-")}`,
    "jpg"
  );
  const saveTarget = await createFileSaveTarget(safeName, {
    mimeType: "image/jpeg",
    description: "JPEG image",
  });
  if (saveTarget.cancelled) return;

  await withStickyDisabled(async () => {
    const pick = decideLabPdfFormatAndWidth(labNodes);
    const captures = [];
    for (const node of labNodes) {
      const canvas = await captureLabExportCanvas(/** @type {HTMLElement} */ (node), pick.targetWidthPx);
      captures.push({
        canvas
      });
    }

    if (!captures.length) return;

    try {
      const spacer = 18; // space between lab sections
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
      let y = 0;
      for (let i = 0; i < captures.length; i++) {
        const {
          canvas
        } = captures[i];
        const x = Math.floor((maxW - canvas.width) / 2);
        ctx.drawImage(canvas, x, y);
        y += canvas.height;
        if (i < captures.length - 1) {
          y += spacer;
          ctx.fillStyle = "#f3f4f6";
          ctx.fillRect(20, y - Math.floor(spacer / 2), maxW - 40, 1);
          ctx.fillStyle = "#ffffff";
        }
      }
      const blob = await canvasToBlob(out, "image/jpeg", 0.98);
      await saveTarget.save(blob);

      try {
        captures.forEach((c) => {
          c.canvas.width = 0;
          c.canvas.height = 0;
        });
        out.width = 0;
        out.height = 0;
      } catch {
        // Ignore canvas cleanup failures after export completes.
      }
    } catch (e) {
      try {
        const c = captures[0];
        const blob = await canvasToBlob(c.canvas, "image/jpeg", 0.98);
        await saveTarget.save(blob);
      } catch {
        // Ignore fallback export failure; caller already handled the main error path.
      }
    }
  });
}

/**
 * Exports all lab timetable sections as a multi-page PDF document.
 * @async
 * @returns {Promise<void>}
 */
async function exportLabPDF() {
  if (!generated) {
    showToast("Generate timetable first.", {
      type: "warn"
    });
    return;
  }
  try {
    renderLabTimetables();
  } catch {
    // Export can continue using the currently rendered lab panel.
  }

  const labNodes = getLabExportNodes();
  if (!labNodes.length) {
    showToast("No lab timetable to export.", {
      type: "warn"
    });
    return;
  }

  const pdfName = ensureFilenameExtension(
    `Labs_PDF-${new Date().toISOString().replace(/[:\.]/g, "-")}`,
    "pdf"
  );
  const saveTarget = await createFileSaveTarget(pdfName, {
    mimeType: "application/pdf",
    description: "PDF document",
  });
  if (saveTarget.cancelled) return;

  await withStickyDisabled(async () => {
    const pick = decideLabPdfFormatAndWidth(labNodes);
    const jsPDFCtor = await ensureJsPDFCtor();
    const captures = [];

    for (const node of labNodes) {
      try {
        const canvas = await captureLabExportCanvas(/** @type {HTMLElement} */ (node), pick.targetWidthPx);
        captures.push({ canvas });
      } catch (e) {
        console.warn("[Export] PDF capture failed for lab section", e);
      }
    }

    if (!captures.length) {
      showToast("Capture failed.", {
        type: "error"
      });
      return;
    }

    const pxToMm = (px) => (px * 25.4) / 96;
    const margin = 10;
    const pdfFormat = pick.format === "a3" ? "a3" : "a4";
    const fmt = pdfFormat === "a3" ? [420, 297] : [297, 210];
    const pdf = new (/** @type {any} */ (jsPDFCtor))({
      orientation: "landscape",
      unit: "mm",
      format: fmt,
      compress: true,
    });

    for (let idx = 0; idx < captures.length; idx++) {
      const { canvas } = captures[idx];
      if (idx > 0) pdf.addPage(fmt, "landscape");

      const cwmm = pxToMm(canvas.width);
      const chmm = pxToMm(canvas.height);
      const scale = Math.min(
        (fmt[0] - margin * 2) / cwmm,
        (fmt[1] - margin * 2) / chmm
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
      pdf.addImage(imgData, "JPEG", margin, margin, drawW, drawH, undefined, "FAST");

      try {
        flat.width = 0;
        flat.height = 0;
      } catch {
        // Ignore flat-canvas cleanup failures after page render.
      }
    }

    const pdfBlob = pdf.output("blob");
    await saveTarget.save(pdfBlob);

    try {
      captures.forEach((item) => {
        item.canvas.width = 0;
        item.canvas.height = 0;
      });
    } catch {
      // Ignore canvas cleanup failures after export completes.
    }
  });
}
