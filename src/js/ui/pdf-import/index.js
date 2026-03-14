/**
 * @module ui/pdf-import/index.js
 * @description UI binding for PDF import button/input workflow.
 */

const USE_BACKEND_IMPORT = true;
// Configure via environment or override for production deployment
const BACKEND_IMPORT_URL =
  (typeof IMPORT_API_URL !== "undefined" && IMPORT_API_URL) ||
  "http://127.0.0.1:8001/api/import/process";
const BACKEND_TIMEOUT_MS = 300000;
const BACKEND_APPLY_SCRIPT_SRC = "src/js/ui/pdf-import/backend-apply.js";
const IMPORT_ERROR_MODAL_ID = "backendImportErrorOverlay";

let backendApplyLoadPromise = null;

function callOptionalGenerationAnimation(methodName, ...args) {
  const fn = typeof window !== "undefined" ? window[methodName] : undefined;
  if (typeof fn === "function") {
    fn(...args);
  }
}

// Section: ERROR MODAL

/**
 * @description Displays a modal dialog with an error title and message for import failures.
 * @param {string} title - Modal title text.
 * @param {string} message - Error message body.
 */
function showImportErrorModal(title, message) {
  const prev = document.getElementById(IMPORT_ERROR_MODAL_ID);
  if (prev) prev.remove();

  const overlay = document.createElement("div");
  overlay.id = IMPORT_ERROR_MODAL_ID;
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(17,24,39,0.56)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "99999";
  overlay.style.padding = "16px";

  const card = document.createElement("div");
  card.style.width = "min(520px, 100%)";
  card.style.background = "#ffffff";
  card.style.border = "1px solid #d1d5db";
  card.style.borderRadius = "12px";
  card.style.boxShadow = "0 20px 60px rgba(0,0,0,0.2)";
  card.style.padding = "16px";

  const h3 = document.createElement("h3");
  h3.textContent = title || "Import Error";
  h3.style.margin = "0 0 8px";
  h3.style.fontSize = "20px";
  h3.style.color = "#111827";

  const p = document.createElement("p");
  p.textContent = message || "Unable to complete PDF import.";
  p.style.margin = "0";
  p.style.fontSize = "14px";
  p.style.lineHeight = "1.45";
  p.style.color = "#374151";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.marginTop = "14px";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "OK";
  okBtn.className = "primary";
  okBtn.style.minWidth = "84px";

  const close = () => { // Removes the modal and cleans up event listeners
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };
  const onKeyDown = (event) => { // Handles Escape key to close the error modal
    if (event.key === "Escape") close();
  };

  okBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", onKeyDown);

  actions.appendChild(okBtn);
  card.appendChild(h3);
  card.appendChild(p);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

/**
 * @description Toggles the import button between busy/disabled and idle states.
 * @param {HTMLButtonElement} importBtn - The import button element.
 * @param {boolean} busy - Whether to show the busy state.
 * @param {string} [busyText="Processing..."] - Text to display while busy.
 */
function setImportProcessing(importBtn, busy, busyText = "Processing...") {
  if (!importBtn) return;
  if (busy) {
    if (!importBtn.dataset.originalText) {
      importBtn.dataset.originalText = importBtn.textContent || "Import PDF";
    }
    importBtn.disabled = true;
    importBtn.textContent = busyText;
    callOptionalGenerationAnimation("showGenerationAnimation", 0, busyText);
    return;
  }
  importBtn.disabled = false;
  importBtn.textContent = importBtn.dataset.originalText || "Import PDF";
  delete importBtn.dataset.originalText;
  callOptionalGenerationAnimation("hideGenerationAnimation");
}

// Section: VALIDATION HELPERS

/**
 * @description Checks if a value is a plain object (not null or Array).
 * @param {*} value - Value to check.
 * @returns {boolean} True if plain object.
 */
function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * @description Returns true if the array is missing or contains null, undefined, non-string, or empty items.
 * @param {Array} arr - Array to validate.
 * @returns {boolean} True if invalid.
 */
function isInvalidStringArray(arr) {
  if (!Array.isArray(arr)) return true;
  return arr.some(
    (item) =>
      item === null ||
      item === undefined ||
      typeof item !== "string" ||
      item.trim() === ""
  );
}

/**
 * @description Validates the structure and content of a backend import response payload.
 * @param {Object} payload - Raw backend response object.
 * @returns {{ ok: boolean, type?: string, message?: string, data?: Object }} Validation result.
 */
function validateBackendImportPayload(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, type: "invalid_format" };
  }
  if (payload.success !== true) {
    if (payload.success === false) {
      const backendMessage = String(payload.message || "").trim();
      return {
        ok: false,
        type: "backend_reject",
        message: backendMessage || "Import was rejected by backend.",
      };
    }
    return { ok: false, type: "invalid_format" };
  }
  if (!isPlainObject(payload.data) || !Array.isArray(payload.data.classes)) {
    return { ok: false, type: "invalid_format" };
  }

  const classes = payload.data.classes;
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    if (!isPlainObject(cls)) return { ok: false, type: "invalid_format" };
    if (typeof cls.label !== "string") return { ok: false, type: "malformed_class_data" };
    if (!Array.isArray(cls.subjects) || !Array.isArray(cls.mains) || !Array.isArray(cls.fillers)) {
      return { ok: false, type: "malformed_class_data" };
    }
    if (
      isInvalidStringArray(cls.subjects) ||
      isInvalidStringArray(cls.mains) ||
      isInvalidStringArray(cls.fillers)
    ) {
      return { ok: false, type: "malformed_class_data" };
    }
    if (cls.ltpByShort !== undefined && !isPlainObject(cls.ltpByShort)) {
      return { ok: false, type: "invalid_format" };
    }
  }
  return {
    ok: true,
    data: payload.data,
  };
}

/**
 * @description Lazy-loads the backend-apply script and resolves when the apply function is available.
 * @returns {Promise<void>} Resolves when backend apply module is ready.
 */
function ensureBackendApplyLoaded() {
  if (typeof window.applyBackendImportData === "function") {
    return Promise.resolve();
  }
  if (backendApplyLoadPromise) return backendApplyLoadPromise;

  backendApplyLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = BACKEND_APPLY_SCRIPT_SRC;
    script.async = false;
    script.onload = () => {
      if (typeof window.applyBackendImportData !== "function") {
        reject(new Error("backend-apply module loaded but apply function missing"));
        return;
      }
      resolve();
    };
    script.onerror = () => {
      reject(new Error("failed to load backend-apply module"));
    };
    document.body.appendChild(script);
  }).catch((error) => {
    backendApplyLoadPromise = null;
    throw error;
  });

  return backendApplyLoadPromise;
}

/**
 * @description Reads a fetch response body as JSON, throwing on invalid JSON.
 * @param {Response} response - Fetch Response object.
 * @returns {Promise<Object|null>} Parsed JSON or null if body is empty.
 */
async function readJsonResponseSafely(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON_RESPONSE");
  }
}

// Section: BACKEND IMPORT FLOW

/**
 * @description Runs the full backend PDF import flow: upload, validate, review, and apply.
 * @param {File} file - The PDF file to import.
 * @param {HTMLButtonElement} importBtn - The import button element.
 */
async function runBackendImportFlow(file, importBtn) {
  setImportProcessing(importBtn, true, "Processing PDF via backend...");
  try {
    await ensureBackendApplyLoaded();

    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, BACKEND_TIMEOUT_MS);

    let response;
    try {
      // Backend must enable CORS middleware for cross-origin frontend access.
      response = await fetch(BACKEND_IMPORT_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
    } catch (error) {
      if (didTimeout) {
        showImportErrorModal(
          "Backend Request Timed Out",
          "Backend took too long to respond. Please try again."
        );
      } else {
        showImportErrorModal(
          "Backend Connection Failed",
          "Unable to connect to backend service. Ensure the backend server is running and CORS is enabled."
        );
      }
      return;
    } finally {
      clearTimeout(timeoutId);
    }

    let payload;
    try {
      payload = await readJsonResponseSafely(response);
    } catch (error) {
      showImportErrorModal(
        "Invalid Backend Response",
        "Backend returned unexpected data format. Please check backend implementation."
      );
      return;
    }

    if (!response.ok) {
      const msg = String(payload?.message || "").trim();
      showImportErrorModal(
        "Import Failed",
        msg || `Backend request failed with status ${response.status}.`
      );
      return;
    }

    const validation = validateBackendImportPayload(payload);
    if (!validation.ok) {
      if (validation.type === "backend_reject") {
        showImportErrorModal("Import Blocked", validation.message);
      } else if (validation.type === "malformed_class_data") {
        showImportErrorModal(
          "Invalid Backend Response",
          "Backend returned unexpected or malformed class data."
        );
      } else {
        showImportErrorModal(
          "Invalid Backend Response",
          "Backend returned unexpected data format. Please check backend implementation."
        );
      }
      return;
    }

    setImportProcessing(importBtn, true, "Applying imported data to input table...");
    const applied = await window.applyBackendImportData(validation.data);
    if (!applied) {
      showImportErrorModal(
        "Import Failed",
        "Backend data was received but could not be applied to input fields."
      );
      return;
    }

    showToast(
      `Imported ${validation.data.classes.length} classes from backend. Review inputs, then click Generate.`,
      {
        type: "success",
        duration: 4600,
      }
    );
  } catch (error) {
    console.error("Backend PDF import failed:", error);
    showImportErrorModal(
      "Import Failed",
      "Unexpected error during backend import. Please try again."
    );
  } finally {
    setImportProcessing(importBtn, false);
  }
}

// Section: LEGACY IMPORT FLOW

/**
 * @description Runs the legacy client-side PDF import flow: parse, review teachers, and apply.
 * @param {File} file - The PDF file to import.
 * @param {HTMLButtonElement} importBtn - The import button element.
 */
async function runLegacyImportFlow(file, importBtn) {
  setImportProcessing(importBtn, true, "Reading PDF and preparing class inputs...");
  try {
    const parsed = await pdfImportProcessFile(file);
    const quality = parsed.quality || {
      ok: true,
      issues: [],
      warnings: [],
      summary: "",
    };

    if (!quality.ok) {
      const firstIssues = (quality.issues || []).slice(0, 2).join(" | "); // First two quality issues for error toast display
      console.warn("PDF import quality gate blocked apply:", quality);
      showToast(
        `Import blocked: ${firstIssues || "unreliable PDF parse detected"}. Try another text-based timetable PDF.`,
        {
          type: "error",
          duration: 5200,
        }
      );
      return;
    }

    if (!parsed.classes.length) {
      showToast(
        "No class/subject data found in this PDF. Use a text-based timetable PDF.",
        {
          type: "error",
          duration: 4200
        }
      );
      return;
    }

    if ((quality.warnings || []).length) {
      showToast(
        `Import warnings: ${(quality.warnings || []).slice(0, 2).join(" | ")}`,
        {
          type: "warn",
          duration: 3800,
        }
      );
    }

    callOptionalGenerationAnimation("hideGenerationAnimation");
    let reviewResult = {
      shown: false,
      classes: parsed.classes || []
    };
    if (typeof pdfImportReviewTeacherNamesAfterImport === "function") {
      reviewResult = await pdfImportReviewTeacherNamesAfterImport(
        parsed.classes || []
      );
    }
    const parsedForApply = {
      ...parsed,
      classes: reviewResult.classes || parsed.classes || [],
    };

    setImportProcessing(importBtn, true, "Applying imported data to input table...");
    const applied = await pdfImportApplyParsedData(parsedForApply);
    if (!applied) {
      showToast("PDF parsed but could not fill form fields.", {
        type: "error"
      });
      return;
    }

    if (reviewResult.shown && !reviewResult.skipped) {
      showToast(
        `Teacher review applied: ${reviewResult.mergedCount || 0} merged, ${
          reviewResult.separateCount || 0
        } kept separate.`,
        {
          type: "info",
          duration: 3200
        }
      );
    }
    showToast(
      `Imported ${parsedForApply.classes.length} classes from PDF. Review inputs, then click Generate.`,
      {
        type: "success",
        duration: 4600
      }
    );
  } catch (error) {
    console.error("PDF import failed:", error);
    const errText = String(error?.message || "").trim();
    const msg = /ocr|scanned pdf/i.test(errText) ?
      errText :
      "PDF import failed. Try another text-based PDF file.";
    showToast(msg, {
      type: "error",
      duration: 4200
    });
  } finally {
    setImportProcessing(importBtn, false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const importBtn = document.getElementById("importPdfBtn");
  const importInput = document.getElementById("importPdfInput");
  if (!importBtn || !importInput) return;

  importBtn.addEventListener("click", () => {
    importInput.click();
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      showToast("Please select a PDF file.", {
        type: "warn"
      });
      importInput.value = "";
      return;
    }

    try {
      if (USE_BACKEND_IMPORT) {
        await runBackendImportFlow(file, importBtn);
      } else {
        await runLegacyImportFlow(file, importBtn);
      }
    } finally {
      importInput.value = "";
    }
  });
});
