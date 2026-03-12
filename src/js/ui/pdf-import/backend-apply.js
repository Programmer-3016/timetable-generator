/* exported applyBackendImportData */

/**
 * @module ui/pdf-import/backend-apply.js
 * @description Adapter to map backend JSON payload into existing frontend apply pipeline.
 */

// Section: NORMALIZATION HELPERS

function backendImportNormalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

/**
 * @description Clamps a value to an integer within [min, max], returning fallback if invalid.
 * @param {*} value - Value to clamp.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @param {number} fallback - Default when value is not finite.
 * @returns {number} Clamped integer.
 */
function backendImportClampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return Math.max(min, Math.min(max, rounded));
}

/**
 * @description Normalizes a clock string to "HH:MM" format for review, returning fallback on failure.
 * @param {string} value - Raw time string.
 * @param {string} [fallback="09:00"] - Fallback time if parsing fails.
 * @returns {string} Normalized "HH:MM" string.
 */
function backendImportNormalizeClockForReview(value, fallback = "09:00") {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * @description Normalizes all backend import settings with safe clamped defaults for review.
 * @param {Object} settings - Raw settings from backend payload.
 * @returns {Object} Normalized settings object.
 */
function backendImportNormalizeSettingsForReview(settings) {
  const src =
    settings && typeof settings === "object" && !Array.isArray(settings) ?
    settings :
    {};
  const slots = backendImportClampInt(src.slots, 1, 12, 8);
  const normalized = {
    startTime: backendImportNormalizeClockForReview(src.startTime, "09:00"),
    slots,
    days: backendImportClampInt(src.days, 1, 7, 5),
    duration: backendImportClampInt(src.duration, 30, 120, 50),
    lunchPeriod: backendImportClampInt(src.lunchPeriod, 1, Math.max(1, slots - 1), 4),
    lunchDuration: backendImportClampInt(src.lunchDuration, 20, 180, 40),
  };
  const labCount = Number(src.labCount);
  if (Number.isFinite(labCount) && labCount > 0) {
    normalized.labCount = backendImportClampInt(labCount, 1, 20, 5);
  }
  return normalized;
}

/**
 * @description Normalizes and deduplicates fixed-slot entries from backend data.
 * @param {Array} list - Raw fixed slot entries.
 * @returns {Array<Object>} Cleaned and deduplicated entries.
 */
function backendImportNormalizeFixedSlots(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  list.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const day = Number(entry.day);
    const slot = Number(entry.slot);
    const short = String(entry.short || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!Number.isFinite(day) || !Number.isFinite(slot) || !short) return;
    const dayInt = Math.max(0, Math.floor(day));
    const slotInt = Math.max(0, Math.floor(slot));
    const teacher = String(entry.teacher || "").trim();
    const key = `${dayInt}|${slotInt}|${short}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      day: dayInt,
      slot: slotInt,
      short,
      teacher,
    });
  });
  return out;
}

/**
 * @description Normalizes a single backend class entry into the internal apply format.
 * @param {Object} cls - Raw class object from backend.
 * @param {number} index - Zero-based class index for default labeling.
 * @returns {Object} Normalized class entry with subjects, mains, fillers, LTP, and fixedSlots.
 */
function backendImportNormalizeClassEntry(cls, index) {
  const normalizedSubjects = backendImportNormalizeStringList(cls?.subjects);
  const normalizedMains = backendImportNormalizeStringList(cls?.mains);
  const normalizedFillers = backendImportNormalizeStringList(cls?.fillers);
  const fixedSlots = backendImportNormalizeFixedSlots(cls?.fixedSlots);
  const normalizedSubjectsWithGaps = backendImportBuildSubjectsWithGaps(
    normalizedSubjects,
    normalizedMains,
    normalizedFillers
  );

  return {
    label:
      typeof cls?.label === "string" ? cls.label : `Class ${index + 1}`,
    subjects: normalizedSubjectsWithGaps,
    mains: normalizedMains.join(", "),
    fillers: normalizedFillers.join(", "),
    ltpByShort:
      cls &&
      typeof cls.ltpByShort === "object" &&
      !Array.isArray(cls.ltpByShort)
        ? cls.ltpByShort
        : {},
    fixedSlots,
  };
}

/**
 * @description Groups subject lines into mains, labs, and fillers with blank-line separators.
 * @param {string[]} subjects - All subject lines.
 * @param {string[]} mains - Main subject short codes.
 * @param {string[]} fillers - Filler subject short codes.
 * @returns {string} Grouped subjects text.
 */
function backendImportBuildSubjectsWithGaps(subjects, mains, fillers) {
  if (!subjects.length) return "";

  const mainsSet = new Set(mains.map((item) => item.trim().toUpperCase()));
  const fillersSet = new Set(fillers.map((item) => item.trim().toUpperCase()));

  const mainLines = [];
  const labLines = [];
  const fillerLines = [];

  for (const line of subjects) {
    const short = String(line.split(" - ")[0] || "")
      .trim()
      .toUpperCase();
    if (mainsSet.has(short)) {
      mainLines.push(line);
    } else if (fillersSet.has(short)) {
      fillerLines.push(line);
    } else {
      labLines.push(line);
    }
  }

  const chunks = [];
  if (mainLines.length) chunks.push(mainLines.join("\n"));
  if (labLines.length) chunks.push(labLines.join("\n"));
  if (fillerLines.length) chunks.push(fillerLines.join("\n"));
  return chunks.join("\n\n");
}

// Section: DATA APPLICATION

/**
 * @description Applies backend import data to the timetable form after optional teacher name review.
 * @param {Object} backendData - Backend response data with classes and settings.
 * @returns {Promise<boolean>} True if data was successfully applied.
 */
async function applyBackendImportData(backendData) {
  const rawClasses =
    backendData && Array.isArray(backendData.classes)
      ? backendData.classes
      : [];
  if (!rawClasses.length) return false;

  const mappedClasses = rawClasses.map((cls, idx) =>
    backendImportNormalizeClassEntry(cls, idx)
  );
  const mappedSettings =
    backendData &&
    backendData.settings &&
    typeof backendData.settings === "object" &&
    !Array.isArray(backendData.settings)
      ? backendData.settings
      : {};
  const reviewedSettings = backendImportNormalizeSettingsForReview(
    mappedSettings
  );

  let classesForApply = mappedClasses;
  if (typeof pdfImportReviewTeacherNamesAfterImport === "function") {
    const reviewResult = await pdfImportReviewTeacherNamesAfterImport(
      mappedClasses
    );
    classesForApply = reviewResult.classes || mappedClasses;
  }

  // Reuse existing form apply utility to keep input-fill behavior consistent.
  return pdfImportApplyParsedData({
    classes: classesForApply,
    settings: reviewedSettings,
  });
}
