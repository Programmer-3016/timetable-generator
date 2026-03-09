/**
 * @module core/scheduler/assignment.js
 * @description Assignment-layer helpers for scheduling decisions.
 *
 * Note:
 * - Extracted from core/scheduler.js without behavior changes.
 */

function schedulerPickTeacherForSlot({
  key,
  short,
  day,
  col,
  opts = {},
  teacherListForShort,
  teacherForShort,
  teacherForShortGlobal,
  canAssign,
  teacherMinutes,
  teacherAssignedPerDayByClass,
  teacherTheoryCountByClass,
}) {
  const { allowNoTeacher = false, ...assignOpts } = opts;
  const list =
    (teacherListForShort[key] && teacherListForShort[key][short]) || [];
  // step: build candidate teacher list from per-class or global maps
  const baseCandidates = list.length
    ? list.slice()
    : [
        (teacherForShort[key] && teacherForShort[key][short]) ||
          teacherForShortGlobal[short] ||
          null,
      ];
  const candidates = baseCandidates.filter((t) => t !== undefined && t !== null);
  if (allowNoTeacher) candidates.push("");
  if (!candidates.length) return null;
  let best = null;
  candidates.forEach((t) => {
    if (!t && !allowNoTeacher) return;
    if (
      !canAssign(key, short, day, col, {
        ...assignOpts,
        teacherOverride: t || null,
        allowNoTeacher,
      })
    )
      return;
    // step: score candidate on workload and pick the best via tie-breaking
    const score = {
      noTeacher: t ? 0 : 1,
      minutes: teacherMinutes[t] || 0,
      perDay: teacherAssignedPerDayByClass[key][day][t] || 0,
      theoryClass: teacherTheoryCountByClass[key][t] || 0,
      name: t || "",
    };
    if (!best) {
      best = { teacher: t, score };
      return;
    }
    const b = best.score;
    if (
      score.noTeacher < b.noTeacher ||
      (score.noTeacher === b.noTeacher && score.minutes < b.minutes) ||
      (score.noTeacher === b.noTeacher &&
        score.minutes === b.minutes &&
        score.perDay < b.perDay) ||
      (score.noTeacher === b.noTeacher &&
        score.minutes === b.minutes &&
        score.perDay === b.perDay &&
        score.theoryClass < b.theoryClass) ||
      (score.noTeacher === b.noTeacher &&
        score.minutes === b.minutes &&
        score.perDay === b.perDay &&
        score.theoryClass === b.theoryClass &&
        score.name < b.name)
    ) {
      best = { teacher: t, score };
    }
  });
  return best ? best.teacher : null;
}

// Section: ASSIGNMENT VALIDATION

/**
 * @description Checks whether a subject can be assigned to a specific slot without violating constraints.
 * @param {Object} params - Class/slot info, constraint caps, teacher maps, and relaxation flags.
 * @returns {boolean} True if the assignment is permissible.
 */
function schedulerCanAssign({
  key,
  short,
  day,
  col,
  opts = {},
  classesPerDay,
  fillerShortsByClass,
  teacherForShort,
  teacherForShortGlobal,
  isLabShortFor,
  isAdjacentToSameSubjectLab,
  keys,
  schedules,
  getTeachersForCell,
  teacherClashKey,
  getTargetForShort,
  countOccurrences,
  teacherAssignedPerDayByClass,
  teacherFirstPeriodCount,
  teacherMinutes,
  minsPerPeriod,
  TEACHER_MAX_HOURS,
  teacherTheoryCountByClass,
  TEACHER_THEORY_MAX,
  lunchClassIndex,
  isMainShort,
  mainPostLunchCountByClass,
}) {
  const {
    allowOverClassCap = false,
    allowNoTeacher = false,
    allowOverPerDayByClassCap = false,
    allowMoreThanOneMainPostLunch = false,
    ultraRelaxed = false, // final fallback loosens most constraints
    ignoreCrossClassClash = false,
    teacherOverride = undefined,
  } = opts;

  // Short-circuit helper; always returns false (reason param aids debugging)
  const failWith = (_reason) => false;

  // step: enforce strict-fillers-only in last two slots if enabled
  if (window.strictFillersLastTwo === true) {
    const lastTwoStart = Math.max(0, classesPerDay - 2);
    if (col >= lastTwoStart) {
      const fillersForClass =
        (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
      if (!fillersForClass.has(short)) return failWith("strictFillersLastTwo");
    }
  }
  const teacher =
    teacherOverride !== undefined
      ? teacherOverride
      : (teacherForShort[key] && teacherForShort[key][short]) ||
        teacherForShortGlobal[short];
  if (!allowNoTeacher && !isLabShortFor(key, short)) {
    if (isAdjacentToSameSubjectLab(key, day, col, short))
      return failWith("isAdjacentToSameSubjectLab");
  }
  // step: detect cross-class teacher clashes in the same slot
  if (!ignoreCrossClassClash) {
    for (const otherKey of keys) {
      if (otherKey === key) continue;
      if (!schedules[otherKey] || !schedules[otherKey][day]) continue;
      const otherShort = schedules[otherKey][day][col];
      if (!otherShort) continue;
      const otherTeachers = getTeachersForCell(otherKey, otherShort, day, col);
      const ca = teacherClashKey(teacher);
      if (!ca) continue;
      for (const otherTeacher of otherTeachers) {
        const cb = teacherClashKey(otherTeacher);
        if (cb && ca === cb) {
          return failWith("Cross-class teacher clash");
        }
      }
    }
  }
  const fillersForClassCap =
    (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
  const isFillerShortForCap = fillersForClassCap.has(short);
  if (isFillerShortForCap) {
    const fillerTarget = getTargetForShort(key, short);
    if (countOccurrences(key, short) >= fillerTarget) {
      return failWith("Filler target cap");
    }
  }
  // step: check per-day, first-period, weekly-minutes, and theory caps
  if (!teacher) return true; // allow scheduling when teacher is omitted
  if (!allowOverPerDayByClassCap && !ultraRelaxed) {
    if ((teacherAssignedPerDayByClass[key][day][teacher] || 0) >= 3)
      return failWith("Per-class per-day max 3 assignments");
  }
  if (!ultraRelaxed) {
    if (col === 0 && (teacherFirstPeriodCount[teacher] || 0) >= 3)
      return failWith("First period cap");
  }
  if (!ultraRelaxed) {
    if ((teacherMinutes[teacher] || 0) + minsPerPeriod > TEACHER_MAX_HOURS)
      return failWith("Weekly minutes cap");
  }
  if (!isFillerShortForCap && !allowOverClassCap && !ultraRelaxed) {
    if ((teacherTheoryCountByClass[key][teacher] || 0) >= TEACHER_THEORY_MAX)
      return failWith("Theory cap (per class)");
  }
  if (!ultraRelaxed) {
    if (
      col >= lunchClassIndex &&
      isMainShort(key, short) &&
      !allowMoreThanOneMainPostLunch
    ) {
      if ((mainPostLunchCountByClass[key][short] || 0) >= 2)
        return failWith("Post-lunch limit");
    }
  }
  return true;
}
