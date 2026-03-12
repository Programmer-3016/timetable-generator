/* exported schedulerGetAssignedTeacherValue, schedulerGetShortTeacherList, schedulerIsLabShortFor, schedulerGetTeachersForCell, schedulerGetTeacherForCell, schedulerSameSubjectCode, schedulerIsAdjacentToSameSubjectLab */

/**
 * @module core/scheduler/teacher-helpers.js
 * @description Teacher lookup and adjacency utility helpers for scheduler.
 *
 * Note:
 * - Extracted from core/scheduler.js without changing scheduling behavior.
 */

function schedulerGetAssignedTeacherValue({ assignedTeacher, key, day, col }) {
  if (!assignedTeacher[key] || !assignedTeacher[key][day]) return undefined;
  return assignedTeacher[key][day][col];
}

// Section: TEACHER LIST RESOLUTION

/**
 * @description Returns a deduplicated list of teachers for a subject short in a class.
 * @param {Object} params
 * @param {Object} params.teacherListForShort - Per-class teacher list map.
 * @param {Object} params.teacherForShort - Per-class single-teacher fallback map.
 * @param {Object} params.teacherForShortGlobal - Global single-teacher fallback map.
 * @param {string} params.key - Class identifier.
 * @param {string} params.short - Subject short code.
 * @returns {string[]} Teacher names for the given short.
 */
function schedulerGetShortTeacherList({
  teacherListForShort,
  teacherForShort,
  teacherForShortGlobal,
  key,
  short,
}) {
  const list =
    (teacherListForShort[key] && teacherListForShort[key][short]) || [];
  // Trimmed, non-empty teacher names
  const cleaned = (list || [])
    .map((t) => String(t || "").trim())
    .filter(Boolean);
  if (cleaned.length) return Array.from(new Set(cleaned));
  const fallback =
    (teacherForShort[key] && teacherForShort[key][short]) ||
    teacherForShortGlobal[short] ||
    "";
  return fallback ? [fallback] : [];
}

// Section: LAB DETECTION

/**
 * @description Checks whether a subject short represents a lab for a given class.
 * @param {Object} params
 * @param {Object} params.subjectByShort - Per-class subject lookup map.
 * @param {string} params.key - Class identifier.
 * @param {string} params.short - Subject short code.
 * @returns {boolean} True if the short is a lab subject.
 */
function schedulerIsLabShortFor({ subjectByShort, key, short }) {
  const subj =
    (subjectByShort[key] && subjectByShort[key][short]) || null;
  if (!subj) return /lab/i.test(short || "");
  return /lab/i.test(short || "") || /lab/i.test(subj.subject || "");
}

/**
 * @description Returns the teacher list for a specific timetable cell, considering labs and fallbacks.
 * @param {Object} params - Cell coordinates plus teacher/lab lookup helpers.
 * @returns {string[]} Teacher names for the cell.
 */
function schedulerGetTeachersForCell({
  key,
  short,
  day,
  col,
  isLabShortFor,
  getShortTeacherList,
  getAssignedTeacherValue,
  teacherForShort,
  teacherForShortGlobal,
}) {
  if (!short) return [];
  if (isLabShortFor(key, short)) {
    return getShortTeacherList(key, short);
  }
  const assigned = getAssignedTeacherValue(key, day, col);
  if (assigned !== undefined) {
    const t = assigned === null ? "" : String(assigned || "").trim();
    return t ? [t] : [];
  }
  const fallback =
    (teacherForShort[key] && teacherForShort[key][short]) ||
    teacherForShortGlobal[short] ||
    "";
  return fallback ? [fallback] : [];
}

/**
 * @description Returns the primary teacher for a specific timetable cell.
 * @param {Object} params
 * @param {Function} params.getTeachersForCell - Teacher list resolver.
 * @param {string} params.key - Class identifier.
 * @param {string} params.short - Subject short code.
 * @param {number} params.day - Day index.
 * @param {number} params.col - Period column index.
 * @returns {string|null} Primary teacher name, or null if none.
 */
function schedulerGetTeacherForCell({ getTeachersForCell, key, short, day, col }) {
  const list = getTeachersForCell(key, short, day, col);
  return list.length ? list[0] : null;
}

// Section: ADJACENCY CHECKS

/**
 * @description Normalizes a subject name for adjacency comparison by removing "lab" and non-alphanumeric chars.
 * @param {string} s - Subject name or short code.
 * @returns {string} Lowercased, stripped string.
 */
function schedulerNormalizeForAdjacency(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/\blab\b/g, "") // drop the word 'lab'
    .replace(/[^a-z0-9]/g, "") // drop spaces, dashes, etc.
    .trim();
}

/**
 * @description Checks if two subject codes refer to the same subject after adjacency normalization.
 * @param {string} a - First subject code.
 * @param {string} b - Second subject code.
 * @returns {boolean} True if the normalized codes match.
 */
function schedulerSameSubjectCode(a, b) {
  return schedulerNormalizeForAdjacency(a) === schedulerNormalizeForAdjacency(b);
}

/**
 * @description Checks if a cell is adjacent to a two-slot lab block of the same subject.
 * @param {Object} params - Schedule grid, comparison function, and cell coordinates.
 * @returns {boolean} True if an adjacent same-subject lab block exists.
 */
function schedulerIsAdjacentToSameSubjectLab({
  schedules,
  sameSubjectCode,
  key,
  day,
  col,
  short,
}) {
  if (col - 2 >= 0) {
    const a = schedules[key][day][col - 2];
    const b = schedules[key][day][col - 1];
    if (a && b && a === b && sameSubjectCode(a, short)) return true;
  }
  if (col + 2 < schedules[key][day].length) {
    const a = schedules[key][day][col + 1];
    const b = schedules[key][day][col + 2];
    if (a && b && a === b && sameSubjectCode(a, short)) return true;
  }
  return false;
}
