// @ts-check
/* exported isReportableTeacherName, resolvePublishedTeacherCandidatesForCell, buildPublishedTeacherDisplayMap */

/**
 * @module ui/teacher-cell-utils.js
 * @description Shared teacher/cell resolution helpers used by report and faculty views.
 */

/**
 * Checks whether a teacher name is usable in published report/faculty views.
 * @param {string} name
 * @returns {boolean}
 */
function isReportableTeacherName(name) {
  const text = String(name || "").trim();
  if (!text) return false;
  if (/^not\s*mentioned$/i.test(text)) return false;
  return true;
}

/**
 * Resolves the teacher candidates for a published timetable cell while respecting explicit blank assignments.
 * @param {{ key: string, day: number, col: number, short: string, subj?: Object, teacherForShortByClass?: Object, assignedTeacherByClass?: Object }} params
 * @returns {string[]}
 */
function resolvePublishedTeacherCandidatesForCell({
  key,
  day,
  col,
  short,
  subj = null,
  teacherForShortByClass = gTeacherForShort,
  assignedTeacherByClass = window.gAssignedTeacher,
}) {
  const subject = subj || gSubjectByShort?.[key]?.[short] || {};
  const isLabCell =
    /\blab\b/i.test(short || "") || /\blab\b/i.test(subject?.subject || "");
  const configured = Array.isArray(subject?.teachers) ?
    subject.teachers.filter((t) => isReportableTeacherName(t)) :
    [];

  if (isLabCell && configured.length) return configured.slice();

  let teacher = teacherForShortByClass?.[key]?.[short] || "";
  let hasExplicitAssignedTeacher = false;
  if (
    assignedTeacherByClass &&
    assignedTeacherByClass[key] &&
    assignedTeacherByClass[key][day]
  ) {
    const assigned = assignedTeacherByClass[key][day][col];
    if (assigned !== undefined) {
      hasExplicitAssignedTeacher = true;
      teacher = assigned === null ? "" : assigned;
    }
  }

  if (isReportableTeacherName(teacher)) return [String(teacher).trim()];
  if (!hasExplicitAssignedTeacher && configured.length) return [configured[0]];
  return [];
}

/**
 * Builds the canonical teacher-display map used by faculty/report views.
 * @returns {Map<string, string>}
 */
function buildPublishedTeacherDisplayMap() {
  const canonToDisplay = new Map();

  if (Array.isArray(reportData) && reportData.length) {
    Array.from(new Set(reportData.map((row) => row.teacher).filter(Boolean))).forEach((teacher) => {
      const canonical = canonicalTeacherName(teacher);
      if (!canonical) return;
      const master =
        gCanonFoldMap && gCanonFoldMap[canonical] ?
          gCanonFoldMap[canonical] :
          canonical;
      const previous = canonToDisplay.get(master) || "";
      if (teacher.length > previous.length) canonToDisplay.set(master, teacher);
    });
    return canonToDisplay;
  }

  const pushTeacher = (teacher) => {
    const text = String(teacher || "").trim();
    if (!isReportableTeacherName(text)) return;
    const canonical = canonicalTeacherName(text);
    if (!canonical) return;
    const master =
      gCanonFoldMap && gCanonFoldMap[canonical] ?
        gCanonFoldMap[canonical] :
        canonical;
    const previous = canonToDisplay.get(master) || "";
    if (text.length > previous.length) canonToDisplay.set(master, text);
  };

  (gEnabledKeys || []).forEach((key) => {
    const pairs = subjectTeacherPairsByClass?.[key] || [];
    pairs.forEach((pair) => {
      pushTeacher(pair?.teacher);
      if (Array.isArray(pair?.teachers)) {
        pair.teachers.forEach(pushTeacher);
      }
    });
  });

  return canonToDisplay;
}
