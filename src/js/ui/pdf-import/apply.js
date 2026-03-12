/* exported pdfImportApplyParsedData, pdfImportProcessFile */

/**
 * @module ui/pdf-import/apply.js
 * @description Apply parsed import payload into existing timetable input fields.
 */

// Section: IMPORT HELPERS

function pdfImportSetInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );
  el.dispatchEvent(
    new Event("change", {
      bubbles: true
    })
  );
  return true;
}

/**
 * @description Waits for class input rows to appear in the DOM up to a polling timeout.
 * @param {number} classCount - Number of class rows expected.
 * @returns {Promise<boolean>} True if the expected row appeared.
 */
async function pdfImportEnsureRows(classCount) {
  const safeCount = Math.min(CLASS_KEYS.length, Math.max(1, classCount));
  const key = CLASS_KEYS[safeCount - 1];
  const expectedId = `class${key}Label`;
  for (let i = 0; i < 40; i++) {
    if (document.getElementById(expectedId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return false;
}

/**
 * @description Normalizes an imported subject pair line to strict "short - subject - teacher" format.
 * @param {string} line - Raw subject pair line.
 * @returns {string} Normalized line.
 */
function pdfImportNormalizeImportedPairLine(line) {
  const raw = String(line || "");
  if (!raw.trim()) return raw;

  const parts = raw.split(/\s+-\s+/).map((p) => String(p || "").trim());
  if (parts.length < 3) return raw.trim();

  const short = parts[0];
  const teacher = parts[parts.length - 1];
  let subject = parts.slice(1, parts.length - 1).join(" ");

  // Keep import rows in strict "short - subject - teacher" shape and
  // avoid delimiter-like dashes inside subject text.
  subject = subject
    .replace(/(?<=\w)\s*-\s*(?=\w)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${short} - ${subject} - ${teacher}`;
}

/**
 * @description Reads the first non-empty string value from settings using an ordered list of key names.
 * @param {Object} settings - Settings object to read from.
 * @param {string[]} keys - Ordered list of candidate keys.
 * @returns {string} The first matching value or empty string.
 */
function pdfImportReadStringSetting(settings, keys = []) {
  const src =
    settings && typeof settings === "object" && !Array.isArray(settings) ?
    settings :
    {};
  for (const key of keys) {
    if (!key) continue;
    const value = src[key];
    if (value === undefined || value === null) continue;
    const txt = String(value).trim();
    if (txt) return txt;
  }
  return "";
}

/**
 * @description Reads a numeric setting value from settings, returning null if absent or non-numeric.
 * @param {Object} settings - Settings object.
 * @param {string[]} keys - Ordered list of candidate keys.
 * @returns {number|null} Parsed number or null.
 */
function pdfImportReadNumberSetting(settings, keys = []) {
  const raw = pdfImportReadStringSetting(settings, keys);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

/**
 * @description Normalizes a clock time string (12h or 24h) to "HH:MM" 24-hour format.
 * @param {string} value - Raw time string (e.g., "9:30 AM", "14:00").
 * @returns {string} Normalized "HH:MM" string or empty string on failure.
 */
function pdfImportNormalizeClock(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!m) return "";
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const mer = (m[3] || "").toUpperCase(); // Meridiem indicator (AM/PM), uppercased
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  if (mm < 0 || mm > 59) return "";
  if (mer) {
    if (hh < 1 || hh > 12) return "";
    if (mer === "AM" && hh === 12) hh = 0;
    if (mer === "PM" && hh !== 12) hh += 12;
  } else if (hh < 0 || hh > 23) {
    return "";
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Section: SETTINGS RESOLUTION

/**
 * @description Resolves and validates timetable settings from raw import data with clamping.
 * @param {Object} rawSettings - Raw settings from PDF or backend.
 * @returns {Object} Resolved settings with validated fields.
 */
function pdfImportResolveSettings(rawSettings) {
  const settings =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ?
    rawSettings :
    {};
  const resolved = {};

  const startTimeRaw = pdfImportReadStringSetting(settings, [
    "startTime",
    "start_time",
    "dayStartTime",
    "day_start_time",
  ]);
  const startTime = pdfImportNormalizeClock(startTimeRaw);
  if (startTime) resolved.startTime = startTime;

  const days = pdfImportReadNumberSetting(settings, [
    "days",
    "dayCount",
    "day_count",
    "numberOfDays",
    "number_of_days",
  ]);
  if (Number.isFinite(days) && days > 0) {
    resolved.days = Math.max(1, Math.min(7, Math.round(days)));
  }

  const slots = pdfImportReadNumberSetting(settings, [
    "slots",
    "periods",
    "periodCount",
    "period_count",
    "numberOfPeriods",
    "number_of_periods",
  ]);
  if (Number.isFinite(slots) && slots > 0) {
    resolved.slots = Math.max(1, Math.min(12, Math.round(slots)));
  }

  const duration = pdfImportReadNumberSetting(settings, [
    "duration",
    "periodDuration",
    "period_duration",
    "defaultDuration",
    "default_duration",
  ]);
  if (Number.isFinite(duration) && duration > 0) {
    resolved.duration = Math.max(30, Math.min(120, Math.round(duration)));
  }

  const lunchPeriod = pdfImportReadNumberSetting(settings, [
    "lunchPeriod",
    "lunch_period",
    "lunchAfterPeriod",
    "lunch_after_period",
    "lunchAfter",
    "lunch_after",
  ]);
  if (Number.isFinite(lunchPeriod) && lunchPeriod > 0) {
    const rounded = Math.round(lunchPeriod);
    const maxLunchPeriod = Number.isFinite(resolved.slots) ?
      Math.max(1, resolved.slots - 1) :
      11;
    resolved.lunchPeriod = Math.max(1, Math.min(maxLunchPeriod, rounded));
  }

  const lunchDuration = pdfImportReadNumberSetting(settings, [
    "lunchDuration",
    "lunch_duration",
    "lunchDurationMin",
    "lunch_duration_min",
  ]);
  if (Number.isFinite(lunchDuration) && lunchDuration > 0) {
    resolved.lunchDuration = Math.max(
      20,
      Math.min(180, Math.round(lunchDuration))
    );
  }

  const labCount = pdfImportReadNumberSetting(settings, [
    "labCount",
    "lab_count",
    "labs",
    "labRooms",
    "lab_rooms",
  ]);
  if (Number.isFinite(labCount) && labCount > 0) {
    resolved.labCount = Math.max(1, Math.min(20, Math.round(labCount)));
  }

  return resolved;
}

/**
 * @description Normalizes and deduplicates a list of fixed-slot entries.
 * @param {Array} rawList - Raw fixed slot entries with day, slot, short, and teacher.
 * @returns {Array<Object>} Deduplicated normalized entries.
 */
function pdfImportNormalizeFixedSlots(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  const seen = new Set();
  rawList.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const dayRaw = Number(entry.day);
    const slotRaw = Number(entry.slot);
    const short = pdfImportNormalizeShort(entry.short || "");
    if (!Number.isFinite(dayRaw) || !Number.isFinite(slotRaw) || !short) return;
    const day = Math.max(0, Math.floor(dayRaw));
    const slot = Math.max(0, Math.floor(slotRaw));
    const teacher = String(entry.teacher || "").trim();
    const dedupeKey = `${day}|${slot}|${short}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push({
      day,
      slot,
      short,
      teacher,
    });
  });
  return out;
}

// Section: DATA APPLICATION

/**
 * @description Applies parsed import data (classes and settings) to the timetable input form.
 * @param {Object} parsed - Parsed import payload with classes and settings.
 * @returns {Promise<boolean>} True if data was successfully applied.
 */
async function pdfImportApplyParsedData(parsed) {
  const classes = (parsed && parsed.classes) || []; // Array of class payloads from parsed import data
  if (!classes.length) return false;

  const safeClassCount = Math.min(CLASS_KEYS.length, classes.length);
  pdfImportSetInputValue("classCount", String(safeClassCount));
  await pdfImportEnsureRows(safeClassCount);

  const settings = pdfImportResolveSettings(parsed.settings || {});
  if (settings.days) pdfImportSetInputValue("days", String(settings.days));
  if (settings.startTime) pdfImportSetInputValue("startTime", settings.startTime);
  if (settings.slots) pdfImportSetInputValue("slots", String(settings.slots));
  if (Number.isFinite(settings.duration))
    pdfImportSetInputValue("duration", String(settings.duration));
  if (Number.isFinite(settings.lunchPeriod))
    pdfImportSetInputValue("lunchPeriod", String(settings.lunchPeriod));
  if (Number.isFinite(settings.lunchDuration))
    pdfImportSetInputValue("lunchDuration", String(settings.lunchDuration));
  if (Number.isFinite(settings.labCount))
    pdfImportSetInputValue("labCount", String(settings.labCount));

  // Reset import-derived LTP map before applying fresh PDF data.
  gImportedLtpByClass = {};
  gImportedFixedSlotsByClass = {};

  for (let i = 0; i < safeClassCount; i++) {
    const key = CLASS_KEYS[i];
    const cls = classes[i];
    const rawLtpMap =
      cls && typeof cls.ltpByShort === "object" && cls.ltpByShort ?
      cls.ltpByShort :
      {};
    const classLtpMap = {};
    Object.entries(rawLtpMap).forEach(([shortRaw, meta]) => {
      const short = pdfImportNormalizeShort(shortRaw);
      const ltp = pdfImportNormalizeLtpTriplet(meta?.ltp || meta || "");
      if (!short || !ltp) return;
      classLtpMap[short] = {
        ltp,
        subjectKey: pdfImportNormalizeLine(meta?.subjectKey || "").toLowerCase(),
      };
    });
    gImportedLtpByClass[key] = classLtpMap;
    gImportedFixedSlotsByClass[key] = pdfImportNormalizeFixedSlots(
      cls && cls.fixedSlots
    );

    pdfImportSetInputValue(`class${key}Label`, cls.label || `Class ${i + 1}`);
    const pairsId = i === 0 ? "pairs" : `pairs${key}`;
    const fillerId = i === 0 ? "fillerShorts" : `fillerShorts${key}`;
    const mainId = i === 0 ? "mainShorts" : `mainShorts${key}`;
    const sanitizedSubjects = String(cls.subjects || "")
      .split(/\r?\n/)
      .map((line) => pdfImportNormalizeImportedPairLine(line))
      .join("\n");
    pdfImportSetInputValue(pairsId, sanitizedSubjects);
    pdfImportSetInputValue(fillerId, cls.fillers || "");
    pdfImportSetInputValue(mainId, cls.mains || "");
  }
  return true;
}

/**
 * @description Processes a PDF file end-to-end: extracts lines, builds class payloads, assesses quality, and detects settings.
 * @param {File} file - The PDF file to import.
 * @returns {Promise<Object>} Result with lines, classes, settings, and quality assessment.
 */
async function pdfImportProcessFile(file) {
  const lines = await pdfImportExtractPdfLines(file);
  const classes = pdfImportBuildClassPayloads(
    lines
  );
  const quality = pdfImportAssessImportQuality(lines, classes);
  const settings = {
    ...pdfImportDetectTimingSettings(lines),
    days: pdfImportDetectDays(lines) || null,
    labCount: pdfImportDetectLabCount(lines) || null,
  };
  return {
    lines,
    classes,
    settings,
    quality,
  };
}
