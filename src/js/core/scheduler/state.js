/* exported schedulerCreateTeacherTheoryCountByClass, schedulerCreateClassContainers, schedulerPopulateClassSubjectMapsAndQuotas, schedulerBuildFillerTargetsAndCounts, schedulerMergeFillerTargetsIntoWeeklyQuota */

/**
 * @module core/scheduler/state.js
 * @description Scheduler state/container initialization helpers.
 *
 * Note:
 * - Extracted from core/scheduler.js without behavior changes.
 */

// Section: CLASS CONTAINER SETUP

function schedulerCreateTeacherTheoryCountByClass({ keys }) {
  const teacherTheoryCountByClass = {};
  keys.forEach((k) => {
    teacherTheoryCountByClass[k] = {};
  });
  return teacherTheoryCountByClass;
}

/**
 * @description Creates empty per-class container objects (schedules, teachers, quotas, etc.).
 * @param {Object} params
 * @param {string[]} params.keys - Class identifiers.
 * @param {number} params.days - Number of scheduling days.
 * @param {number} params.classesPerDay - Periods per day.
 * @returns {Object} Initialized container maps keyed by class.
 */
function schedulerCreateClassContainers({ keys, days, classesPerDay }) {
  const schedules = {};
  const assignedTeacher = {};
  const perDayUsed = {};
  const labPeriodsUsedPerDay = {};
  const subjectByShort = {};
  const teacherForShort = {};
  const teacherListForShort = {};
  const isLabShort = {};
  const weeklyQuota = {};
  const lectureList = {};
  const hasLabDay = {};
  const theoryOnLabDayCount = {};

  keys.forEach((k) => {
    schedules[k] = Array.from({ length: days }, () =>
      Array(classesPerDay).fill(null)
    );
    assignedTeacher[k] = Array.from({ length: days }, () =>
      Array(classesPerDay).fill(null)
    );
    perDayUsed[k] = Array.from({ length: days }, () => new Set());
    labPeriodsUsedPerDay[k] = Array.from({ length: days }, () => 0);
    subjectByShort[k] = {};
    teacherForShort[k] = {};
    teacherListForShort[k] = {};
    isLabShort[k] = {};
    weeklyQuota[k] = {};
    lectureList[k] = [];
    hasLabDay[k] = Array.from({ length: days }, () => false);
    theoryOnLabDayCount[k] = Array.from({ length: days }, () => 0);
  });

  return {
    schedules,
    assignedTeacher,
    perDayUsed,
    labPeriodsUsedPerDay,
    subjectByShort,
    teacherForShort,
    teacherListForShort,
    isLabShort,
    weeklyQuota,
    lectureList,
    hasLabDay,
    theoryOnLabDayCount,
  };
}

// Section: SUBJECT MAP POPULATION

/**
 * @description Populates per-class subject maps, teacher lookups, weekly quotas, and lecture lists.
 * @param {Object} params - Data array, subject/teacher maps, filler shorts, and lab predicate.
 */
function schedulerPopulateClassSubjectMapsAndQuotas({
  data,
  subjectByShort,
  teacherForShort,
  teacherListForShort,
  isLabShort,
  weeklyQuota,
  lectureList,
  fillerShortsByClass,
  isLabPair,
}) {
  // Returns true if the pair has at least one usable (non-placeholder) teacher
  const hasUsableTeacherForPair = (pair) => {
    const list = Array.isArray(pair?.teachers) ?
      pair.teachers
      .map((t) => String(t || "").trim())
      .filter((t) => t && !/^not\s*mentioned$/i.test(t)) :
      [];
    if (list.length) return true;
    const one = String(pair?.teacher || "").trim();
    return !!(one && !/^not\s*mentioned$/i.test(one));
  };

  data.forEach(({ key, pairs }) => {
    subjectByShort[key] = Object.fromEntries(
      pairs.map((p) => [p.short, p])
    );
    teacherForShort[key] = Object.fromEntries(
      pairs.map((p) => [p.short, p.teacher])
    );
    teacherListForShort[key] = Object.fromEntries(
      pairs.map((p) => [
        p.short,
        p.teachers || (p.teacher ? [p.teacher] : []),
      ])
    );
    isLabShort[key] = Object.fromEntries(
      pairs.map((p) => [p.short, isLabPair(p)])
    );
    const fillerSetLocal =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    // Enforce filler policy for non-lab subjects that have no usable teacher.
    const nonLabShortHasTeacher = {};
    const nonLabShorts = new Set();
    (pairs || []).forEach((p) => {
      if (!p || !p.short || isLabPair(p)) return;
      nonLabShorts.add(p.short);
      if (hasUsableTeacherForPair(p)) nonLabShortHasTeacher[p.short] = true;
    });
    nonLabShorts.forEach((short) => {
      if (!nonLabShortHasTeacher[short]) fillerSetLocal.add(short);
    });

    const lectureSubjectsRaw = pairs.filter(
      (p) => !isLabPair(p) && !fillerSetLocal.has(p.short)
    );
    // Duplicate short lines can inflate remaining quota and cause 6/5, 7/5.
    // Keep a single canonical lecture entry per short (last definition wins).
    const lectureByShort = new Map();
    lectureSubjectsRaw.forEach((p) => {
      if (!p || !p.short) return;
      lectureByShort.set(p.short, p);
    });
    const lectureSubjects = Array.from(lectureByShort.values());
    lectureSubjects.forEach((p) => {
      const target =
        typeof p.credits === "number" && Number.isFinite(p.credits) ?
        p.credits + 1 :
        5;
      weeklyQuota[key][p.short] = target;
    });
    lectureList[key] = lectureSubjects.map((p) => ({
      short: p.short,
      teachers: (teacherListForShort[key] &&
          teacherListForShort[key][p.short]) ||
        (p.teacher ? [p.teacher] : []),
      teacher: ((teacherListForShort[key] &&
          teacherListForShort[key][p.short] &&
          teacherListForShort[key][p.short][0]) ||
        p.teacher ||
        "") + "",
      remaining: weeklyQuota[key][p.short],
    }));
  });
}

// Section: FILLER TARGETS

/**
 * @description Builds per-class filler target and count maps from filler short sets.
 * @param {Object} params
 * @param {string[]} params.keys - Class identifiers.
 * @param {Object} params.fillerShortsByClass - Sets of filler short codes per class.
 * @param {Object} params.fillerCreditsByClass - Credit values for fillers.
 * @returns {{ fillerTargetsByClass: Object, fillerCountsByClass: Object }}
 */
function schedulerBuildFillerTargetsAndCounts({
  keys,
  fillerShortsByClass,
  fillerCreditsByClass,
}) {
  const fillerTargetsByClass = {};
  const fillerCountsByClass = {};
  keys.forEach((k) => {
    const set =
      (fillerShortsByClass && fillerShortsByClass[k]) || new Set();
    fillerTargetsByClass[k] = {};
    fillerCountsByClass[k] = {};
    for (const f of set) {
      let target = 2;
      fillerTargetsByClass[k][f] = target;
      fillerCountsByClass[k][f] = 0;
    }
  });

  return {
    fillerTargetsByClass,
    fillerCountsByClass,
  };
}

/**
 * @description Merges filler targets into the weekly quota maps so fillers participate in scheduling.
 * @param {Object} params
 * @param {string[]} params.keys - Class identifiers.
 * @param {Object} params.fillerTargetsByClass - Filler target counts per class.
 * @param {Object} params.weeklyQuota - Weekly quota maps to merge into.
 */
function schedulerMergeFillerTargetsIntoWeeklyQuota({
  keys,
  fillerTargetsByClass,
  weeklyQuota,
}) {
  keys.forEach((k) => {
    const t = fillerTargetsByClass[k] || {};
    weeklyQuota[k] = weeklyQuota[k] || {};
    Object.keys(t).forEach((f) => {
      weeklyQuota[k][f] = t[f];
    });
  });
}
