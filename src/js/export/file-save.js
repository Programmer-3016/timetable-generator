/**
 * @module export/file-save.js
 * @description File naming and save target utilities for all export modes.
 */

// Section: EXPORT FUNCTIONS

// Section: FILE UTILITIES

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

// Section: BLOB CONVERSION

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
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const ENABLE_NATIVE_SAVE_PICKER = false;

/**
 * Creates a save target using the native File System Access API when available, falling back to anchor-based download.
 * @async
 * @param {string} suggestedFilename - Default filename for the save dialog
 * @param {Object} [options] - Save options
 * @param {string} [options.mimeType] - MIME type of the file
 * @param {string} [options.description] - Human-readable file type description
 * @returns {Promise<{cancelled: boolean, save: Function}>} Save target object
 */
async function createFileSaveTarget(suggestedFilename, options = {}) {
  const safeName = sanitizeDownloadFilename(suggestedFilename);
  const mimeType = options.mimeType || "";
  const description = options.description || "Exported file";
  if (
    ENABLE_NATIVE_SAVE_PICKER &&
    typeof window.showSaveFilePicker === "function"
  ) {
    try {
      const pickerOptions = {
        suggestedName: safeName
      };
      if (mimeType) {
        pickerOptions.types = [{
          description,
          accept: {
            [mimeType]: [`.${safeName.split(".").pop()}`],
          },
        }, ];
      }
      const handle = await window.showSaveFilePicker(pickerOptions);
      return {
        cancelled: false,
        async save(blob) {
          try {
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          } catch (error) {
            throw error;
          }
        },
      };
    } catch (error) {
      if (error && error.name === "AbortError") {
        return {
          cancelled: true,
          async save() {}
        };
      }
    }
  }
  return {
    cancelled: false,
    async save(blob) {
      triggerBlobDownload(blob, safeName);
    },
  };
}

/**
 * Exports the currently selected faculty timetable as a high-resolution JPG image.
 * @async
 * @returns {Promise<void>}
 */
async function exportFacultyJPG() {
  const sel = document.getElementById("facultySelect");
  const teacher = sel ? sel.value : "";
  if (!teacher) {
    showToast("Select a faculty first.", {
      type: "warn"
    });
    return;
  }
  const container = document.getElementById("facultyTT");
  if (!container) return;
  const table = container.querySelector("table");
  if (!table) {
    showToast("No timetable to export.", {
      type: "warn"
    });
    return;
  }
  const filename = ensureFilenameExtension(
    `${teacher}-timetable`,
    "jpg"
  );
  const saveTarget = await createFileSaveTarget(filename, {
    mimeType: "image/jpeg",
    description: "JPEG image",
  });
  if (saveTarget.cancelled) return;

  await withStickyDisabled(async () => {
    const canvas = await html2canvas(table, {
      scale: 3.0,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.98);
    await saveTarget.save(blob);
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {}
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
  } catch {}
  const panel = document.getElementById("labPanel");
  if (!panel) {
    showToast("No lab timetable to export.", {
      type: "warn"
    });
    return;
  }
  const labNodes = Array.from(panel.querySelectorAll(".lab-table-wrap"));
  if (!labNodes.length) {
    labNodes.push(panel);
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
    const pick = {
      targetWidthPx: 1100
    };
    const captures = [];
    for (const node of labNodes) {
      const canvas = await (async () =>
        withTempWidth(node, pick.targetWidthPx, () =>
          html2canvas(node, {
            scale: 3.0,
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false,
          })
        ))();
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
      } catch {}
    } catch (e) {
      try {
        const c = captures[0];
        const blob = await canvasToBlob(c.canvas, "image/jpeg", 0.98);
        await saveTarget.save(blob);
      } catch {}
    }
  });
}
