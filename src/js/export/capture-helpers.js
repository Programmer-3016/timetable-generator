/**
 * @module export/capture-helpers.js
 * @description Capture formatting helpers for PNG/PDF exports.
 */

// Section: PDF/JPG EXPORT HELPERS

/**
 * Determines the PDF page format and target capture width based on table column count.
 * @param {string[]} keys - Class keys to inspect for column count
 * @returns {{format: string, targetWidthPx: number}} Page format and capture width in pixels
 */
function decidePdfFormatAndWidth(keys) {
  let maxCols = 0;
  keys.forEach((k) => {
    const ths = document.querySelectorAll(
      `#timetable${k} table thead tr th`
    );
    if (ths && ths.length > maxCols) maxCols = ths.length;
  });
  if (maxCols >= 11) {
    return {
      format: "a3",
      targetWidthPx: 1600
    };
  }
  return {
    format: "a4",
    targetWidthPx: 1100
  };
}

/**
 * Temporarily disables sticky positioning and normalizes styles for reliable HTML-to-canvas capture.
 * @param {Function} fn - Callback to execute while export styles are active
 * @returns {*} The return value of fn (supports async)
 */
function withStickyDisabled(fn) {
  const style = document.createElement("style");
  style.id = "export-temp-style";
  style.textContent = `
    /* Force full opacity for everything in timetable while exporting */
    .timetable-area, .timetable-area * { opacity: 1 !important; filter: none !important; box-shadow: none !important; }
    .timetable-area thead th,
    .timetable-area tbody td:first-child,
    .timetable-area thead th:first-child {
      position: static !important;
      left: auto !important;
      z-index: auto !important;
    }
    /* Stronger borders/contrast during capture */
    .timetable-area table { border: 3px solid #000 !important; }
    .timetable-area th, .timetable-area td {
      border: 1.5px solid #222 !important;
      color: #000 !important;
      background: #ffffff !important;
      font-weight: 600 !important;
    }
    /* Remove zebra background for higher clarity */
    .timetable-area table tbody tr:nth-child(even) td { background: #ffffff !important; }
    /* Keep lunch visible but slightly stronger */
    .timetable-area .break { background: #fff1a6 !important; color: #6b5800 !important; }
    /* Make subject cells bold and dark */
    .timetable-area .subject-cell { color: #000 !important; font-weight: 700 !important; }
    /* Hide visual layout-only lines to keep export clean */
    body.fullwide #timetableWrap::before { display: none !important; }
    .class-block::after { display: none !important; }
  `;
  document.head.appendChild(style);
  let result;
  try {
    result = fn();
  } catch (e) {
    try {
      style.remove();
    } catch {}
    throw e;
  }
  // Removes the temporary export stylesheet after capture completes
  const finalize = () => {
    try {
      style.remove();
    } catch {}
  };
  if (result && typeof result.then === "function") {
    return result.finally(finalize);
  }
  finalize();
  return result;
}
