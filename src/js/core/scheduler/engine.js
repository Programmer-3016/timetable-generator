/* exported schedulerRenderMultiClassesEngine */

/**
 * @module core/scheduler/engine.js
 * @description Core scheduling engine (renderMultiClasses).
 * Dependencies: validation.js, scoring.js must be loaded before this file.
 */


function schedulerRenderMultiClassesEngine({
  pairsByClass = {},
  days,
  defaultDuration,
  enabledKeys = [],
  fillerShortsByClass = {},
  fillerCreditsByClass = {},
  mainShortsByClass = {},
  fixedSlotsByClass = {},
  seed = undefined,
}) {
  const classIndices = periodTimings
    .map((p, i) => (p.type === "class" ? i : -1))
    .filter((i) => i !== -1);
  const classesPerDay = classIndices.length;
  if (classesPerDay === 0) {
    showToast("No class periods available to schedule.", {
      type: "warn"
    });
    return;
  }

  // Section: CONFIGURATION & UTILITY HELPERS

  /** Checks if a subject pair is a lab by testing its short/subject name. */
  const isLab = (pair) =>
    /lab/i.test(pair.short) || /lab/i.test(pair.subject);
  /** Checks whether the given value is a callable function. */
  const hasFn = (fn) => typeof fn === "function";

  /** Computes the class-period index at which lunch occurs (IIFE). */
  const lunchClassIndex = (() => {
    let classCount = 0;
    for (let i = 0; i < periodTimings.length; i++) {
      if (periodTimings[i].type === "lunch") return classCount;
      if (periodTimings[i].type === "class") classCount++;
    }
    return classCount; // no lunch
  })();

  const data = enabledKeys.map((k) => ({
    key: k,
    pairs: pairsByClass[k] || [],
  }));
  const keys = data.map((d) => d.key);
  const importedFixedSlotsByClass = {};
  keys.forEach((k) => {
    const raw =
      fixedSlotsByClass && Array.isArray(fixedSlotsByClass[k]) ?
      fixedSlotsByClass[k] :
      [];
    const cleaned = [];
    const seen = new Set();
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const day = Number(entry.day);
      const slot = Number(entry.slot);
      const short = String(entry.short || "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
      const teacher = String(entry.teacher || "").trim();
      if (!Number.isFinite(day) || !Number.isFinite(slot) || !short) return;
      const dayInt = Math.max(0, Math.floor(day));
      const slotInt = Math.max(0, Math.floor(slot));
      const dedupeKey = `${dayInt}|${slotInt}|${short}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      cleaned.push({
        day: dayInt,
        slot: slotInt,
        short,
        teacher,
      });
    });
    importedFixedSlotsByClass[k] = cleaned;
  });
  const resolvedSeed = Number.isFinite(seed) ?
    (seed >>> 0) :
    ((Date.now() ^
      ((keys.length & 0xff) << 24) ^
      ((days & 0xff) << 16) ^
      ((classesPerDay & 0xff) << 8)) >>>
      0);
  const seededRandom = createSeededRandom(resolvedSeed);
  try {
    window.__ttLastSeed = resolvedSeed;
  } catch (_e) {
    // Seed tracking is best-effort debug metadata only.
  }
  const teacherFoldMapLocal = schedulerBuildTeacherFoldMapFromData({
    data,
    buildTeacherFoldMapFromRawNames,
  });
  // Section: TEACHER RESOLUTION

  /** Returns the canonical fold-map key for a teacher name, used for clash detection. */
  const teacherClashKey = (name) => {
    const canon = canonicalTeacherName(name);
    if (!canon) return "";
    return teacherFoldMapLocal[canon] || canon;
  };
  gCanonFoldMap = {
    ...teacherFoldMapLocal
  };

  const teacherMinutes = {};
  const teacherTheoryCount = {}; // total across classes
  const teacherTheoryCountByClass = schedulerCreateTeacherTheoryCountByClass({
    keys,
  }); // per-class caps
  const teacherFirstPeriodCount = {};
  const teacherLabBlocks = {};
  const teacherLabMinutes = {};
  const {
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
  } = schedulerCreateClassContainers({
    keys,
    days,
    classesPerDay,
  });
  /** Checks whether a subject short code belongs to the main (non-filler) set for a class. */
  const isMainShort = (k, sh) =>
    !!(
      mainShortsByClass &&
      mainShortsByClass[k] &&
      mainShortsByClass[k].has(sh)
    );
  const teacherForShortGlobal = {};
  schedulerPopulateClassSubjectMapsAndQuotas({
    data,
    subjectByShort,
    teacherForShort,
    teacherListForShort,
    isLabShort,
    weeklyQuota,
    lectureList,
    fillerShortsByClass,
    isLabPair: isLab,
  });
  const {
    fillerTargetsByClass,
    fillerCountsByClass
  } = schedulerBuildFillerTargetsAndCounts({
    keys,
    fillerShortsByClass,
    fillerCreditsByClass,
  });
  schedulerMergeFillerTargetsIntoWeeklyQuota({
    keys,
    fillerTargetsByClass,
    weeklyQuota,
  });
  Object.assign(
    teacherForShortGlobal,
    schedulerBuildGlobalTeacherForShort({
      data,
    })
  );
  gWeeklyQuotaByClass = {};
  Object.keys(weeklyQuota).forEach((k) => {
    gWeeklyQuotaByClass[k] = weeklyQuota[k];
  });

  const minsPerPeriod = defaultDuration;
  const TEACHER_MAX_HOURS = 18 * 60;
  const TEACHER_THEORY_MAX = 5; // per class
  const LAB_CAPACITY = schedulerReadLabCapacityFromDom({
    defaultCapacity: 3,
  });
  const MAX_FILLERS_PER_WEEK = 2;
  const MAX_FILLERS_PER_SUBJECT_PER_WEEK = 2;
  const fillerCapacityByClass = {};
  const fillerPerSubjectCapByClass = {};
  const totalSlotsPerClass = days * classesPerDay;
  keys.forEach((k) => {
    const caps = schedulerComputeFillerCapacityForClass({
      classKey: k,
      fillerShortsByClass,
      lectureList,
      weeklyQuota,
      pairsByClass,
      isLabPair: isLab,
      fillerTargetsByClass,
      totalSlotsPerClass,
      minWeeklyCap: MAX_FILLERS_PER_WEEK,
      // Keep per-filler subject cap strict as per current 2/2 policy.
      perSubjectCap: MAX_FILLERS_PER_SUBJECT_PER_WEEK,
    });
    fillerCapacityByClass[k] = caps.totalFillerCap;
    fillerPerSubjectCapByClass[k] = caps.perSubjectFillerCap;
  });
  const labsAtSlot = Array.from({
      length: days
    }, () =>
    Array(classesPerDay).fill(0)
  );
  const labsInUse = Array.from({
      length: days
    }, () =>
    Array.from({
      length: classesPerDay
    }, () => new Set())
  );
  const labNumberAssigned = {};
  keys.forEach((k) => {
    labNumberAssigned[k] = Array.from({
        length: days
      }, () =>
      Array(classesPerDay).fill(null)
    );
  });
  const labsBlocksPerDayAcross = Array.from({
    length: days
  }, () => 0);
  const teacherAssignedPerDayByClass = {};
  keys.forEach((k) => {
    teacherAssignedPerDayByClass[k] = Array.from({
        length: days
      },
      () => ({})
    );
  });
  const labStartCountsByClass = {};
  keys.forEach((k) => {
    labStartCountsByClass[k] = Array(classesPerDay).fill(0);
  });
  const labPrePostBlocksByClass = {};
  keys.forEach((k) => {
    labPrePostBlocksByClass[k] = {
      pre: 0,
      post: 0
    };
  });
  const teacherPrePostByClass = {};
  keys.forEach((k) => {
    teacherPrePostByClass[k] = {};
  });
  /** Ensures a pre/post-lunch tracking bucket exists for the given teacher in a class. */
  const ensureTP = (k, t) =>
    schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass,
      classKey: k,
      teacher: t,
    });
  /** Returns the total number of filler slots already assigned for a class. */
  const getFillerTotal = (k) =>
    schedulerGetFillerTotal({
      fillerCountsByClass,
      classKey: k,
    });
  /** Returns the maximum weekly filler capacity for a class. */
  const getFillerCap = (k) =>
    schedulerGetFillerCap({
      fillerCapacityByClass,
      classKey: k,
      defaultCap: MAX_FILLERS_PER_WEEK,
    });
  /** Returns the per-subject filler cap for a class. */
  const getFillerSubjectCap = (k) =>
    schedulerGetFillerSubjectCap({
      fillerPerSubjectCapByClass,
      classKey: k,
      defaultCap: MAX_FILLERS_PER_SUBJECT_PER_WEEK,
    });
  /** Gets the teacher already assigned to a specific day/col slot for a class. */
  const getAssignedTeacherValue = (key, day, col) =>
    schedulerGetAssignedTeacherValue({
      assignedTeacher,
      key,
      day,
      col,
    });
  /** Returns the list of eligible teachers for a given subject short in a class. */
  const getShortTeacherList = (key, short) =>
    schedulerGetShortTeacherList({
      teacherListForShort,
      teacherForShort,
      teacherForShortGlobal,
      key,
      short,
    });
  /** Checks whether a subject short code represents a lab for a given class. */
  const isLabShortFor = (key, short) =>
    schedulerIsLabShortFor({
      subjectByShort,
      key,
      short,
    });
  /** Returns all teachers associated with a cell (class/day/col), considering lab multi-teacher. */
  const getTeachersForCell = (key, short, day, col) =>
    schedulerGetTeachersForCell({
      key,
      short,
      day,
      col,
      isLabShortFor,
      getShortTeacherList,
      getAssignedTeacherValue,
      teacherForShort,
      teacherForShortGlobal,
    });
  /** Returns the primary teacher for a cell (first from the teachers list). */
  const getTeacherForCell = (key, short, day, col) =>
    schedulerGetTeacherForCell({
      getTeachersForCell,
      key,
      short,
      day,
      col,
    });
  /** Checks if two short codes refer to the same base subject. */
  const sameSubjectCode = (a, b) => schedulerSameSubjectCode(a, b);
  const postLunchCompactDebugByClass = {};
  /** Checks if a slot is adjacent to a lab block of the same subject (prevents double-stacking). */
  const isAdjacentToSameSubjectLab = (key, day, col, short) =>
    schedulerIsAdjacentToSameSubjectLab({
      schedules,
      sameSubjectCode,
      key,
      day,
      col,
      short,
    });
  const mainPostLunchCountByClass = {};
  keys.forEach((k) => (mainPostLunchCountByClass[k] = {}));

  // Section: SLOT ASSIGNMENT & VALIDATION

  /** Increments the post-lunch main-subject counter if the slot is after lunch. */
  function recordMainPostLunchIfNeeded(key, short, col) {
    if (col < lunchClassIndex) return;
    if (!isMainShort(key, short)) return;
    mainPostLunchCountByClass[key][short] =
      (mainPostLunchCountByClass[key][short] || 0) + 1;
  }

  /**
   * Selects the best available teacher for a subject at a specific day/slot,
   * respecting clash, minute-cap, and per-class theory limits.
   */
  function pickTeacherForSlot(key, short, day, col, opts = {}) {
    return schedulerPickTeacherForSlot({
      key,
      short,
      day,
      col,
      opts,
      teacherListForShort,
      teacherForShort,
      teacherForShortGlobal,
      canAssign,
      teacherMinutes,
      teacherAssignedPerDayByClass,
      teacherTheoryCountByClass,
    });
  }

  /**
   * Returns whether a subject can be assigned to a specific slot, checking
   * teacher clashes, adjacency, filler caps, theory limits, and quota constraints.
   */
  function canAssign(key, short, day, col, opts = {}) {
    return schedulerCanAssign({
      key,
      short,
      day,
      col,
      opts,
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
    });
  }

  // Section: LAB PLACEMENT

  /**
   * Places a 2-period lab block on the given day for a class, choosing the best
   * start slot while respecting lab capacity, teacher clashes, and pre/post balance.
   */
  function placeLabBlock(key, label, day) {
    return schedulerPlaceLabBlock({
      key,
      label,
      day,
      labPeriodsUsedPerDay,
      getShortTeacherList,
      teacherAssignedPerDayByClass,
      teacherMinutes,
      minsPerPeriod,
      TEACHER_MAX_HOURS,
      classesPerDay,
      lunchClassIndex,
      labPrePostBlocksByClass,
      labStartCountsByClass,
      labsAtSlot,
      labsInUse,
      LAB_CAPACITY,
      schedules,
      keys,
      getTeachersForCell,
      teacherClashKey,
      assignedTeacher,
      labNumberAssigned,
      labsBlocksPerDayAcross,
      teacherLabBlocks,
      teacherLabMinutes,
      teacherFirstPeriodCount,
      ensureTP,
    });
  }

  schedulerPlaceInitialLabsAcrossClasses({
    data,
    isLabPair: isLab,
    days,
    keys,
    labsBlocksPerDayAcross,
    placeLabBlock,
  });

  const teacherSet = {};
  data.forEach(({
    key,
    pairs
  }) => {
    teacherSet[key] = new Set((pairs || []).map((p) => p.teacher));
  });

  /** Checks if a teacher is shared across multiple classes (common faculty). */
  function isCommonFor(key, teacher) {
    if (typeof schedulerIsCommonFor === "function") {
      return schedulerIsCommonFor({
        keys,
        teacherSet,
        key,
        teacher,
      });
    }
    if (!teacher) return false;
    return keys.some(
      (k) => k !== key && teacherSet[k] && teacherSet[k].has(teacher)
    );
  }

  /** Determines if a teacher should prefer a pre- or post-lunch slot for a given class. */
  function preferredForSlot(key, day, col, teacher) {
    if (typeof schedulerPreferredForSlot === "function") {
      return schedulerPreferredForSlot({
        keys,
        lunchClassIndex,
        key,
        day,
        col,
        teacher,
        isCommonFor,
      });
    }
    const pre = col < lunchClassIndex;
    const post = !pre;
    if (!isCommonFor(key, teacher)) return false;
    const classIdx = Math.max(0, keys.indexOf(key));
    if (classIdx === 0) return pre;
    if (classIdx === 1) return post;
    if (classIdx % 3 === 2) return day % 2 === 0 ? pre : post;
    return classIdx % 2 === 0 ? pre : post;
  }

  // Section: FILLER & GAP MANAGEMENT

  /**
   * Attempts to replace post-lunch filler slots with main lectures from teachers
   * who are below the per-class theory maximum.
   */
  function boostTeachersBySwappingFillers(key) {
    const fillerShorts =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    const list = lectureList[key];
    const below = Object.entries(teacherTheoryCountByClass[key])
      .filter(([, cnt]) => (cnt || 0) < TEACHER_THEORY_MAX)
      .map(([t]) => t);
    if (!below.length) return false;
    let changed = false;
    const fillerStart = Math.max(lunchClassIndex, classesPerDay - 2);
    for (let d = 0; d < days; d++) {
      for (let c = fillerStart; c < classesPerDay; c++) {
        const cur = schedules[key][d][c];
        if (!cur || !fillerShorts.has(cur)) continue;
        for (const t of below) {
          let idx = list.findIndex(
            (s) =>
            s.remaining > 0 &&
            s.teacher === t &&
            !perDayUsed[key][d].has(s.short) &&
            canAssign(key, s.short, d, c)
          );
          if (idx === -1) {
            idx = list.findIndex(
              (s) =>
              s.remaining > 0 &&
              s.teacher === t &&
              !perDayUsed[key][d].has(s.short) &&
              canAssign(key, s.short, d, c, {
                allowOverPerDayByClassCap: true,
              })
            );
          }
          if (idx === -1) continue;
          schedules[key][d][c] = null;
          if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
          if (fillerCountsByClass[key][cur])
            fillerCountsByClass[key][cur]--;
          const pick = list[idx];
          schedules[key][d][c] = pick.short;
          perDayUsed[key][d].add(pick.short);
          list[idx].remaining--;
          teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
          teacherTheoryCountByClass[key][t] =
            (teacherTheoryCountByClass[key][t] || 0) + 1;
          teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
          teacherAssignedPerDayByClass[key][d][t] =
            (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
          ensureTP(key, t)[c < lunchClassIndex ? "pre" : "post"]++;
          changed = true;
          break; // move to next slot
        }
      }
    }
    return changed;
  }
  (function noteTeacherlessFillers() {
    const lines = [];
    for (const k of keys) {
      const fillers =
        (fillerShortsByClass && fillerShortsByClass[k]) || new Set();
      if (!fillers.size) continue;
      const teacherless = [];
      for (const f of fillers) {
        const t =
          (teacherForShort[k] && teacherForShort[k][f]) ||
          teacherForShortGlobal[f];
        if (!t) teacherless.push(f);
      }
      if (teacherless.length)
        lines.push(`${k}: ${teacherless.join(", ")}`);
    }
    if (lines.length) {
      try {
        console.info(
          "Teacherless fillers (allowed; placed only in last two periods):\n" +
          lines.join("\n")
        );
      } catch {
        // Ignore console availability issues in restricted runtimes.
      }
    }
  })();

  /**
   * Scores and picks the best lecture index for a class/day/slot,
   * balancing pre/post-lunch teacher presence, quota, and main-subject priority.
   */
  function pickLectureIndex(key, day, col) {
    if (typeof schedulerPickLectureIndex === "function") {
      return schedulerPickLectureIndex({
        lectureList,
        key,
        day,
        col,
        lunchClassIndex,
        classesPerDay,
        perDayUsed,
        canAssign,
        ensureTP,
        isMainShort,
        preferredForSlot,
        randomFn: seededRandom,
      });
    }
    const list = lectureList[key];
    let bestIdx = -1;
    let bestScore = Infinity;
    const isPre = col < lunchClassIndex;
    const isFirstPostLunch = col === lunchClassIndex;
    const p5PenaltyBase =
      isFirstPostLunch && lunchClassIndex + 1 < classesPerDay ? 0.8 : 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.remaining <= 0) continue;
      if (perDayUsed[key][day].has(s.short)) continue;
      if (!canAssign(key, s.short, day, col)) continue;
      const t = s.teacher;
      const tp = ensureTP(key, t);
      const imbalanceAfter = Math.abs(
        tp.pre + (isPre ? 1 : 0) - tp.post - (isPre ? 0 : 1)
      );
      const pref = preferredForSlot(key, day, col, t) ? -0.25 : 0;
      const preLunchBias = isPre
        ? isMainShort(key, s.short)
          ? -0.65
          : -0.25
        : isMainShort(key, s.short)
          ? 0.55
          : 0.15;
      const quotaBias = -0.6 * s.remaining;
      const p5Penalty = p5PenaltyBase;
      const rnd = seededRandom() * 0.2;
      const score =
        imbalanceAfter + pref + preLunchBias + quotaBias + p5Penalty + rnd;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  // Main scheduling loop: iterate every day/slot and fill lectures across classes
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < classesPerDay; c++) {
      if (periodTimings[classIndices[c]].type !== "class") continue;
      // Rotate class order per slot to distribute priority fairly
      const rot = (d * classesPerDay + c) % Math.max(1, keys.length);
      const classOrder = keys
        .slice(rot)
        .concat(keys.slice(0, rot));
      for (const k of classOrder) {
        if (schedules[k][d][c] === null) {
          const idx = pickLectureIndex(k, d, c);
          if (idx !== -1) {
            const pick = lectureList[k][idx];
            const chosen = pickTeacherForSlot(k, pick.short, d, c, {
              allowNoTeacher: false,
            });
            if (chosen === null) continue;
            schedules[k][d][c] = pick.short;
            assignedTeacher[k][d][c] = chosen;
            perDayUsed[k][d].add(pick.short);
            pick.remaining--;
            const t = chosen;
            teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
            teacherTheoryCountByClass[k][t] =
              (teacherTheoryCountByClass[k][t] || 0) + 1;
            teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
            if (c === 0)
              teacherFirstPeriodCount[t] =
              (teacherFirstPeriodCount[t] || 0) + 1;
            teacherAssignedPerDayByClass[k][d][t] =
              (teacherAssignedPerDayByClass[k][d][t] || 0) + 1;
            ensureTP(k, t)[c < lunchClassIndex ? "pre" : "post"]++;
            recordMainPostLunchIfNeeded(k, pick.short, c);
          }
        }
      }
    }
  }

  // Section: MAIN SUBJECT SCHEDULING PASSES

    /** Builds a shared context object for all advanced scheduling passes. */
    const getAdvancedPassCtx = () => ({
    days,
    classesPerDay,
    lunchClassIndex,
    schedules,
    fillerShortsByClass,
    lectureList,
    perDayUsed,
    canAssign,
    pickTeacherForSlot,
    teacherTheoryCount,
    teacherTheoryCountByClass,
    teacherMinutes,
    minsPerPeriod,
    teacherAssignedPerDayByClass,
    teacherFirstPeriodCount,
    ensureTP,
    recordMainPostLunchIfNeeded,
    getFillerTotal,
    getFillerCap,
    getFillerSubjectCap,
    fillerCountsByClass,
    isLabShort,
    getTargetForShort,
    countOccurrences,
    mainShortsByClass,
    assignedTeacher,
    preferredForSlot,
    isMainShort,
    mainPostLunchCountByClass,
    weeklyQuota,
    hasLabDay,
    theoryOnLabDayCount,
    teacherForShort,
    teacherForShortGlobal,
    TEACHER_THEORY_MAX,
    fillerTargetsByClass,
    labNumberAssigned,
    keys,
    pickLectureIndex,
    periodTimings,
    classIndices,
    postLunchCompactDebugByClass,
  });
/** Attempts to place remaining unscheduled lectures into empty slots. */
function fillRemaining(key) {
    if (!hasFn(schedulerPassFillRemaining)) return false;
    return schedulerPassFillRemaining({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) fillRemaining(k);

  /** Aggressively fills any remaining empty slots, relaxing constraints. */
  function aggressiveFill(key) {
    if (!hasFn(schedulerPassAggressiveFill)) return false;
    return schedulerPassAggressiveFill({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) aggressiveFill(k);

  /** Sweeps post-lunch slots to place filler subjects where gaps remain. */
  function postLunchFillerSweep(key) {
    if (!hasFn(schedulerPassPostLunchFillerSweep)) return false;
    return schedulerPassPostLunchFillerSweep({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) postLunchFillerSweep(k);

  /**
   * Places lectures from teachers who are below the per-class theory max
   * into any remaining empty slots.
   */
  function boostTeachers(key) {
    const list = lectureList[key];
    const below = Object.entries(teacherTheoryCountByClass[key])
      .filter(([, cnt]) => (cnt || 0) < TEACHER_THEORY_MAX)
      .map(([t]) => t);
    if (!below.length) return;
    for (let d = 0; d < days; d++) {
      for (let c = 0; c < classesPerDay; c++) {
        if (schedules[key][d][c] !== null) continue;
        for (const t of below) {
          const idx = list.findIndex(
            (s) =>
            s.remaining > 0 &&
            s.teachers?.includes?.(t) &&
            !perDayUsed[key][d].has(s.short) &&
            canAssign(key, s.short, d, c, {
              teacherOverride: t
            })
          );
          if (idx !== -1) {
            const pick = list[idx];
            const chosen = t;
            schedules[key][d][c] = pick.short;
            assignedTeacher[key][d][c] = chosen;
            perDayUsed[key][d].add(pick.short);
            list[idx].remaining--;
            teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
            teacherTheoryCountByClass[key][t] =
              (teacherTheoryCountByClass[key][t] || 0) + 1;
            teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
            if (c === 0)
              teacherFirstPeriodCount[t] =
              (teacherFirstPeriodCount[t] || 0) + 1;
            teacherAssignedPerDayByClass[key][d][t] =
              (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
            ensureTP(key, t)[c < lunchClassIndex ? "pre" : "post"]++;
            recordMainPostLunchIfNeeded(key, pick.short, c);
            break;
          }
        }
      }
    }
  }
  for (const k of keys) boostTeachers(k);
  for (const k of keys) boostTeachersBySwappingFillers(k);

  /** Fills mid-schedule gaps to produce a compact timetable with no holes. */
  function gapSealFill(key) {
    if (!hasFn(schedulerPassGapSealFill)) return false;
    return schedulerPassGapSealFill({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) gapSealFill(k);

  /** Final pass to fix empty first-post-lunch (P5) slots. */
  function finalPostLunchGapFix(key) {
    if (!hasFn(schedulerPassFinalPostLunchGapFix)) return false;
    return schedulerPassFinalPostLunchGapFix({ ctx: getAdvancedPassCtx(), key });
  }

  /**
   * Ensures every teacher with remaining lectures appears at least once each day,
   * swapping out fillers if necessary.
   */
  function ensureDailyTeacherPresence(key) {
    const fillerShorts =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    const byT = {};
    lectureList[key].forEach((s, i) => {
      if (!s.teacher || !s.teacher.trim()) return; // skip teacherless subjects for daily presence
      if (!byT[s.teacher]) byT[s.teacher] = [];
      byT[s.teacher].push({
        short: s.short,
        i
      });
    });
    const teachers = Object.keys(byT);

    /** Returns true if the teacher already has a main (non-filler, non-lab) lecture on the given day. */
    function hasMainLecture(day, teacher) {
      for (let c = 0; c < classesPerDay; c++) {
        const sh = schedules[key][day][c];
        if (!sh) continue;
        if (fillerShorts.has(sh)) continue;
        if (isLabShort[key][sh]) continue;
        const t = getTeacherForCell(key, sh, day, c);
        if (t && t === teacher) return true;
      }
      return false;
    }

    /** Places a lecture pick at the specified day/col, updating all tracking structures. */
    function placeAt(day, col, pick) {
      const chosen = pickTeacherForSlot(key, pick.short, day, col, {
        allowNoTeacher: false,
      });
      if (chosen === null) return false;
      schedules[key][day][col] = pick.short;
      assignedTeacher[key][day][col] = chosen;
      perDayUsed[key][day].add(pick.short);
      lectureList[key][pick.i].remaining--;
      const t = chosen;
      teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
      teacherTheoryCountByClass[key][t] =
        (teacherTheoryCountByClass[key][t] || 0) + 1;
      teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
      if (col === 0)
        teacherFirstPeriodCount[t] =
        (teacherFirstPeriodCount[t] || 0) + 1;
      teacherAssignedPerDayByClass[key][day][t] =
        (teacherAssignedPerDayByClass[key][day][t] || 0) + 1;
      ensureTP(key, t)[col < lunchClassIndex ? "pre" : "post"]++;
      recordMainPostLunchIfNeeded(key, pick.short, col);
      return true;
    }
    // step: iterate each day/teacher pair to ensure at least one main lecture
    for (let d = 0; d < days; d++) {
      for (const t of teachers) {
        if (hasMainLecture(d, t)) continue;
        const idx = lectureList[key].findIndex(
          (s) =>
          s.teacher === t &&
          s.remaining > 0 &&
          !perDayUsed[key][d].has(s.short)
        );
        if (idx === -1) continue; // nothing left to place for this teacher
        const cand = lectureList[key][idx];
        // step: try placing in an empty pre-lunch slot
        let placed = false;
        for (let c = 0; c < lunchClassIndex; c++) {
          if (periodTimings[classIndices[c]].type !== "class") continue;
          if (schedules[key][d][c] !== null) continue;
          if (!canAssign(key, cand.short, d, c)) continue;
          placeAt(d, c, {
            ...cand,
            i: idx
          });
          placed = true;
          break;
        }
        if (placed) continue;
        // step: try placing in P5 (first post-lunch slot)
        const p5 = lunchClassIndex;
        if (
          p5 < classesPerDay &&
          schedules[key][d][p5] === null &&
          canAssign(key, cand.short, d, p5)
        ) {
          placeAt(d, p5, {
            ...cand,
            i: idx
          });
          continue;
        }
        // step: displace fillers in tail periods to make room
        const fillerStart = Math.max(0, classesPerDay - 2);
        for (let c = fillerStart; c < classesPerDay; c++) {
          const fsh = schedules[key][d][c];
          if (!fsh || !fillerShorts.has(fsh)) continue;
          schedules[key][d][c] = null;
          if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
          if (fillerCountsByClass[key][fsh])
            fillerCountsByClass[key][fsh]--;
          if (fillerCountsByClass[key][fsh] < 0)
            fillerCountsByClass[key][fsh] = 0;
          if (canAssign(key, cand.short, d, c)) {
            placeAt(d, c, {
              ...cand,
              i: idx
            });
            placed = true;
            break;
          } else {
            schedules[key][d][c] = fsh;
            fillerCountsByClass[key][fsh] =
              (fillerCountsByClass[key][fsh] || 0) + 1;
          }
        }
      }
    }
  }

  /** Fills any remaining empty post-lunch gaps with eligible lectures or fillers. */
  function fillPostLunchGaps(key) {
    if (!hasFn(schedulerPassFillPostLunchGaps)) return false;
    return schedulerPassFillPostLunchGaps({ ctx: getAdvancedPassCtx(), key });
  }

  /** Ensures each main subject reaches its weekly target of 5 lectures. */
  function ensureSubjectDailyFive(key) {
    if (!hasFn(schedulerPassEnsureSubjectDailyFive)) return false;
    return schedulerPassEnsureSubjectDailyFive({ ctx: getAdvancedPassCtx(), key });
  }

  /** Guarantees at least one main-subject lecture is present every day. */
  function ensureAtLeastOneMainPerDay(key) {
    if (!hasFn(schedulerPassEnsureAtLeastOneMainPerDay)) return false;
    return schedulerPassEnsureAtLeastOneMainPerDay({ ctx: getAdvancedPassCtx(), key });
  }
  if (window.guaranteeFilledP5 !== false) {
    for (const k of keys) finalPostLunchGapFix(k);
    for (const k of keys) ensureDailyTeacherPresence(k);
    for (const k of keys) ensureSubjectDailyFive(k);
    for (const k of keys) fillPostLunchGaps(k);
    for (const k of keys) postLunchFillerSweep(k);
    for (const k of keys) ensureAtLeastOneMainPerDay(k);
    {
      let changed = true;
      let attempts = 0;
      while (changed && attempts < 5) {
        changed = false;
        for (const k of keys) {
          if (boostTeachersBySwappingFillers(k)) changed = true;
        }
        attempts++;
      }
    }

    /**
     * Force-places main subjects until they hit their weekly quota,
     * displacing fillers and using relaxed constraints as needed.
     */
    function forceMainToFive(key) {
      const fillerShorts =
        (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
      const list = lectureList[key];
      const subjects = list
        .map((s, i) => ({
          ...s,
          i
        }))
        .filter((s) => s.remaining > 0);
      for (let sIdx = 0; sIdx < subjects.length; sIdx++) {
        const subjIndex = subjects[sIdx].i;
        let subj = lectureList[key][subjIndex];
        if (!subj || typeof subj.remaining !== "number") continue;
        let guard = 0;
        while (subj.remaining > 0 && guard < days * 3) {
          guard++;
          let placedDay = -1;
          for (let d = 0; d < days; d++) {
            if (perDayUsed[key][d].has(subj.short)) continue; // enforce 1 per day
            let placed = false;
            // step: scan empty pre-lunch slots for placement
            for (let c = 0; c < lunchClassIndex; c++) {
              if (periodTimings[classIndices[c]].type !== "class")
                continue;
              if (schedules[key][d][c] !== null) continue;
              if (
                !canAssign(key, subj.short, d, c) &&
                !canAssign(key, subj.short, d, c, {
                  allowOverPerDayByClassCap: true,
                })
              )
                continue;
              schedules[key][d][c] = subj.short;
              perDayUsed[key][d].add(subj.short);
              subj.remaining--;
              const t = subj.teacher;
              if (t !== undefined) assignedTeacher[key][d][c] = t;
              teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
              teacherTheoryCountByClass[key][t] =
                (teacherTheoryCountByClass[key][t] || 0) + 1;
              teacherMinutes[t] =
                (teacherMinutes[t] || 0) + minsPerPeriod;
              teacherAssignedPerDayByClass[key][d][t] =
                (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
              ensureTP(key, t)[c < lunchClassIndex ? "pre" : "post"]++;
              placedDay = d;
              placed = true;
              break;
            }
            if (placed) break;
            // step: try placing in P5 (first post-lunch slot)
            const p5 = lunchClassIndex;
            if (
              p5 < classesPerDay &&
              schedules[key][d][p5] === null &&
              (canAssign(key, subj.short, d, p5) ||
                canAssign(key, subj.short, d, p5, {
                  allowOverPerDayByClassCap: true,
                }))
            ) {
              schedules[key][d][p5] = subj.short;
              perDayUsed[key][d].add(subj.short);
              subj.remaining--;
              const t = subj.teacher;
              if (t !== undefined) assignedTeacher[key][d][p5] = t;
              teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
              teacherTheoryCountByClass[key][t] =
                (teacherTheoryCountByClass[key][t] || 0) + 1;
              teacherMinutes[t] =
                (teacherMinutes[t] || 0) + minsPerPeriod;
              teacherAssignedPerDayByClass[key][d][t] =
                (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
              ensureTP(key, t)["post"]++;
              recordMainPostLunchIfNeeded(key, subj.short, p5);
              placedDay = d;
              break;
            }
            // step: displace existing filler at P5 to make room for main subject
            if (p5 < classesPerDay) {
              const cur = schedules[key][d][p5];
              if (cur && fillerShorts.has(cur)) {
                if (
                  canAssign(key, subj.short, d, p5) ||
                  canAssign(key, subj.short, d, p5, {
                    allowOverPerDayByClassCap: true,
                  })
                ) {
                  schedules[key][d][p5] = null;
                  if (!fillerCountsByClass[key])
                    fillerCountsByClass[key] = {};
                  if (fillerCountsByClass[key][cur])
                    fillerCountsByClass[key][cur]--;
                  if ((fillerCountsByClass[key][cur] || 0) < 0)
                    fillerCountsByClass[key][cur] = 0;
                  schedules[key][d][p5] = subj.short;
                  perDayUsed[key][d].add(subj.short);
                  subj.remaining--;
                  const t = subj.teacher;
                  if (t !== undefined) assignedTeacher[key][d][p5] = t;
                  teacherTheoryCount[t] =
                    (teacherTheoryCount[t] || 0) + 1;
                  teacherTheoryCountByClass[key][t] =
                    (teacherTheoryCountByClass[key][t] || 0) + 1;
                  teacherMinutes[t] =
                    (teacherMinutes[t] || 0) + minsPerPeriod;
                  teacherAssignedPerDayByClass[key][d][t] =
                    (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
                  ensureTP(key, t)["post"]++;
                  recordMainPostLunchIfNeeded(key, subj.short, p5);
                  placedDay = d;
                  break;
                }
              }
            }
            // step: displace fillers in last two post-lunch periods
            const fillerStart = Math.max(
              lunchClassIndex + 1,
              classesPerDay - 2
            );
            for (let c = fillerStart; c < classesPerDay; c++) {
              const fsh = schedules[key][d][c];
              if (!fsh || !fillerShorts.has(fsh)) continue;
              if (
                !canAssign(key, subj.short, d, c) &&
                !canAssign(key, subj.short, d, c, {
                  allowOverPerDayByClassCap: true,
                })
              )
                continue;
              schedules[key][d][c] = null;
              if (!fillerCountsByClass[key])
                fillerCountsByClass[key] = {};
              if (fillerCountsByClass[key][fsh])
                fillerCountsByClass[key][fsh]--;
              if ((fillerCountsByClass[key][fsh] || 0) < 0)
                fillerCountsByClass[key][fsh] = 0;
              schedules[key][d][c] = subj.short;
              perDayUsed[key][d].add(subj.short);
              subj.remaining--;
              const t = subj.teacher;
              if (t !== undefined) assignedTeacher[key][d][c] = t;
              teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
              teacherTheoryCountByClass[key][t] =
                (teacherTheoryCountByClass[key][t] || 0) + 1;
              teacherMinutes[t] =
                (teacherMinutes[t] || 0) + minsPerPeriod;
              teacherAssignedPerDayByClass[key][d][t] =
                (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
              ensureTP(key, t)["post"]++;
              recordMainPostLunchIfNeeded(key, subj.short, c);
              placedDay = d;
              break;
            }
            // step: retry filler displacement with fully relaxed constraints
            if (placedDay === -1) {
              for (let c = fillerStart; c < classesPerDay; c++) {
                const fsh2 = schedules[key][d][c];
                if (!fsh2 || !fillerShorts.has(fsh2)) continue;
                if (
                  !canAssign(key, subj.short, d, c, {
                    allowOverPerDayByClassCap: true,
                    allowMoreThanOneMainPostLunch: true,
                  })
                )
                  continue;
                schedules[key][d][c] = null;
                if (!fillerCountsByClass[key])
                  fillerCountsByClass[key] = {};
                if (fillerCountsByClass[key][fsh2])
                  fillerCountsByClass[key][fsh2]--;
                if ((fillerCountsByClass[key][fsh2] || 0) < 0)
                  fillerCountsByClass[key][fsh2] = 0;
                schedules[key][d][c] = subj.short;
                perDayUsed[key][d].add(subj.short);
                subj.remaining--;
                const t = subj.teacher;
                if (t !== undefined) assignedTeacher[key][d][c] = t;
                teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
                teacherTheoryCountByClass[key][t] =
                  (teacherTheoryCountByClass[key][t] || 0) + 1;
                teacherMinutes[t] =
                  (teacherMinutes[t] || 0) + minsPerPeriod;
                teacherAssignedPerDayByClass[key][d][t] =
                  (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
                ensureTP(key, t)["post"]++;
                recordMainPostLunchIfNeeded(key, subj.short, c);
                placedDay = d;
                break;
              }
            }
            if (placedDay !== -1) break;
          }
          if (placedDay === -1) break;
          subj = lectureList[key][subjIndex]; // refresh remaining pointer
          if (!subj || typeof subj.remaining !== "number") break;
        }
      }
    }
    for (const k of keys) forceMainToFive(k);

    /**
     * Last-resort pass: relocates other main subjects to different days/slots
     * to free room for subjects that still haven't met their weekly target.
     */
    function finalizeSubjectFiveByRelocatingOtherMain(key) {
      const fillerShorts =
        (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
      if (!fillerShorts.size) return;
      const list = lectureList[key];
      const subjects = list
        .map((s, i) => ({
          ...s,
          i
        }))
        .filter((s) => s.remaining > 0);
      if (!subjects.length) return;
      /** Local override: checks if a short is a main (non-filler, non-lab) subject. */
      const isMainShort = (sh) =>
        sh && !fillerShorts.has(sh) && !isLabShort[key][sh];
      // step: iterate deficit subjects, scanning days/slots in reverse
      for (let sIdx = 0; sIdx < subjects.length; sIdx++) {
        let subj = lectureList[key][subjects[sIdx].i];
        let guard = 0;
        while (subj.remaining > 0 && guard < 3) {
          guard++;
          let placed = false;
          for (let d = days - 1; d >= 0 && !placed; d--) {
            if (perDayUsed[key][d].has(subj.short)) continue; // enforce 1/day rule
            for (
              let c = classesPerDay - 1; c >= lunchClassIndex && !placed; c--
            ) {
              if (periodTimings[classIndices[c]].type !== "class")
                continue;
              if (schedules[key][d][c] === null) {
                let canPlaceHere = canAssign(key, subj.short, d, c, {
                  allowOverPerDayByClassCap: true,
                  allowMoreThanOneMainPostLunch: true,
                  allowOverClassCap: true,
                });
                // step: check for teacher clash in other classes at this slot
                if (!canPlaceHere) {
                  const subjTeacher =
                    (teacherForShort[key] &&
                      teacherForShort[key][subj.short]) ||
                    teacherForShortGlobal[subj.short] ||
                    null;
                  if (subjTeacher) {
                    const subjTeacherCanon = teacherClashKey(subjTeacher);
                    if (subjTeacherCanon) {
                      for (const otherKey of keys) {
                        if (otherKey === key) continue;
                        const otherShort =
                          schedules[otherKey]?.[d]?.[c] || null;
                        if (!otherShort) continue;
                        const otherTeachers = getTeachersForCell(
                          otherKey,
                          otherShort,
                          d,
                          c
                        );
                        const clashTeacher = otherTeachers.find((t) => {
                          const canon = teacherClashKey(t);
                          return canon && canon === subjTeacherCanon;
                        });
                        if (
                          clashTeacher
                        ) {
                          const otherFillers =
                            (fillerShortsByClass &&
                              fillerShortsByClass[otherKey]) ||
                            new Set();
                          let movedOther = false;
                          /** Tries to move a clashing subject into a filler slot on day d2. */
                          const tryRelocateIn = (d2) => {
                            for (
                              let c2 = classesPerDay - 1; c2 >= lunchClassIndex; c2--
                            ) {
                              const curF = schedules[otherKey][d2][c2];
                              if (!curF || !otherFillers.has(curF))
                                continue;
                              if (perDayUsed[otherKey][d2].has(otherShort))
                                continue;
                              if (
                                canAssign(otherKey, otherShort, d2, c2, {
                                  allowOverClassCap: true,
                                  allowOverPerDayByClassCap: true,
                                  allowMoreThanOneMainPostLunch: true,
                                })
                              ) {
                                if (!fillerCountsByClass[otherKey])
                                  fillerCountsByClass[otherKey] = {};
                                if (fillerCountsByClass[otherKey][curF])
                                  fillerCountsByClass[otherKey][curF]--;
                                if (
                                  (fillerCountsByClass[otherKey][curF] ||
                                    0) < 0
                                )
                                  fillerCountsByClass[otherKey][curF] = 0;
                                schedules[otherKey][d2][c2] = otherShort;
                                perDayUsed[otherKey][d2].add(otherShort);
                                teacherAssignedPerDayByClass[otherKey][d2][
                                    clashTeacher
                                  ] =
                                  (teacherAssignedPerDayByClass[otherKey][
                                    d2
                                  ][clashTeacher] || 0) + 1;
                                ensureTP(otherKey, clashTeacher)[
                                  c2 < lunchClassIndex ? "pre" : "post"
                                ]++;
                                schedules[otherKey][d][c] = null;
                                movedOther = true;
                                return true;
                              }
                            }
                            return false;
                          };
                          if (!tryRelocateIn(d)) {
                            for (
                              let d2 = days - 1; d2 >= 0 && !movedOther; d2--
                            ) {
                              if (d2 === d) continue;
                              tryRelocateIn(d2);
                            }
                          }
                          if (movedOther) {
                            canPlaceHere = canAssign(
                              key,
                              subj.short,
                              d,
                              c, {
                                allowOverPerDayByClassCap: true,
                                allowMoreThanOneMainPostLunch: true,
                                allowOverClassCap: true,
                              }
                            );
                          }
                          break; // only one conflicting class possible per slot/teacher
                        }
                      }
                    }
                  }
                }
                // step: place subject in empty slot and update tracking
                if (canPlaceHere) {
                  schedules[key][d][c] = subj.short;
                  perDayUsed[key][d].add(subj.short);
                  lectureList[key][subjects[sIdx].i].remaining--;
                  const t = subj.teacher;
                  if (t !== undefined) assignedTeacher[key][d][c] = t;
                  if (t) {
                    teacherTheoryCount[t] =
                      (teacherTheoryCount[t] || 0) + 1;
                    teacherTheoryCountByClass[key][t] =
                      (teacherTheoryCountByClass[key][t] || 0) + 1;
                    teacherMinutes[t] =
                      (teacherMinutes[t] || 0) + minsPerPeriod;
                    if (c === 0)
                      teacherFirstPeriodCount[t] =
                      (teacherFirstPeriodCount[t] || 0) + 1;
                    teacherAssignedPerDayByClass[key][d][t] =
                      (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
                    ensureTP(key, t)[
                      c < lunchClassIndex ? "pre" : "post"
                    ]++;
                  }
                  recordMainPostLunchIfNeeded(key, subj.short, c);
                  placed = true;
                  break;
                }
              }
              if (placed) break;
              // step: try relocating existing main subject to free this slot
              const occ = schedules[key][d][c];
              if (!occ || !isMainShort(occ)) continue; // skip labs/fillers
              const occTeacher =
                (teacherForShort[key] && teacherForShort[key][occ]) ||
                teacherForShortGlobal[occ] ||
                null;
              // step: scan for a filler slot to relocate the existing main into
              let relocated = false;
              for (let d2 = days - 1; d2 >= 0 && !relocated; d2--) {
                for (
                  let c2 = classesPerDay - 1; c2 >= lunchClassIndex && !relocated; c2--
                ) {
                  if (d2 === d && c2 === c) continue; // don't target the same cell
                  const curF = schedules[key][d2][c2];
                  if (!curF || !fillerShorts.has(curF)) continue;
                  if (perDayUsed[key][d2] && perDayUsed[key][d2].has(occ))
                    continue;
                  if (
                    canAssign(key, occ, d2, c2, {
                      allowOverClassCap: true,
                      allowOverPerDayByClassCap: true,
                      allowMoreThanOneMainPostLunch: true,
                    }) &&
                    canAssign(key, subj.short, d, c, {
                      allowOverPerDayByClassCap: true,
                      allowMoreThanOneMainPostLunch: true,
                      allowOverClassCap: true,
                    })
                  ) {
                    if (!fillerCountsByClass[key])
                      fillerCountsByClass[key] = {};
                    if (fillerCountsByClass[key][curF])
                      fillerCountsByClass[key][curF]--;
                    if ((fillerCountsByClass[key][curF] || 0) < 0)
                      fillerCountsByClass[key][curF] = 0;
                    schedules[key][d2][c2] = occ;
                    perDayUsed[key][d2].add(occ);
                    if (occTeacher) {
                      teacherAssignedPerDayByClass[key][d][occTeacher] =
                        Math.max(
                          0,
                          (teacherAssignedPerDayByClass[key][d][
                            occTeacher
                          ] || 1) - 1
                        );
                      teacherAssignedPerDayByClass[key][d2][occTeacher] =
                        (teacherAssignedPerDayByClass[key][d2][
                          occTeacher
                        ] || 0) + 1;
                      ensureTP(key, occTeacher)[
                        c2 < lunchClassIndex ? "pre" : "post"
                      ]++;
                    }
                    schedules[key][d][c] = null;
                    // step: place deficit subject in the freed slot
                    schedules[key][d][c] = subj.short;
                    perDayUsed[key][d].add(subj.short);
                    lectureList[key][subjects[sIdx].i].remaining--;
                    const t = subj.teacher;
                    if (t !== undefined) assignedTeacher[key][d][c] = t;
                    if (t) {
                      teacherTheoryCount[t] =
                        (teacherTheoryCount[t] || 0) + 1;
                      teacherTheoryCountByClass[key][t] =
                        (teacherTheoryCountByClass[key][t] || 0) + 1;
                      teacherMinutes[t] =
                        (teacherMinutes[t] || 0) + minsPerPeriod;
                      if (c === 0)
                        teacherFirstPeriodCount[t] =
                        (teacherFirstPeriodCount[t] || 0) + 1;
                      teacherAssignedPerDayByClass[key][d][t] =
                        (teacherAssignedPerDayByClass[key][d][t] || 0) +
                        1;
                      ensureTP(key, t)[
                        c < lunchClassIndex ? "pre" : "post"
                      ]++;
                    }
                    recordMainPostLunchIfNeeded(key, subj.short, c);
                    relocated = true;
                    placed = true;
                    break;
                  }
                }
              }
            }
          }
          if (!placed) break; // can't help this subject further
          subj = lectureList[key][subjects[sIdx].i];
        }
      }
    }
    for (const k of keys) finalizeSubjectFiveByRelocatingOtherMain(k);

    /** Places a filler in the first post-lunch slot (P5) if it remains empty and filler budget allows. */
    function emergencyP5FillerIfNeeded(key) {
      if (window.allowP5FillerEmergency === false) return;
      const fillerShorts =
        (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
      if (!fillerShorts.size) return;
      const p5 = lunchClassIndex;
      for (let d = 0; d < days; d++) {
        if (p5 >= classesPerDay) continue;
        if (schedules[key][d][p5] !== null) continue; // already filled by a lecture
        if (getFillerTotal(key) >= getFillerCap(key)) break;
        const targets = fillerTargetsByClass[key] || {};
        const counts = fillerCountsByClass[key] || {};
        const ranked = Array.from(fillerShorts)
          .map((f) => ({
            f,
            deficit: (targets[f] || 0) - (counts[f] || 0),
            perDay: schedules[key][d].filter((x) => x === f).length,
          }))
          .sort((a, b) => {
            if (b.deficit !== a.deficit) return b.deficit - a.deficit;
            if (a.perDay !== b.perDay) return a.perDay - b.perDay;
            const aIsAR = a.f === "AR";
            const bIsAR = b.f === "AR";
            if (aIsAR && !bIsAR) return -1;
            if (!aIsAR && bIsAR) return 1;
            return 0;
          });
        for (const {
            f
          }
          of ranked) {
          if ((counts[f] || 0) >= getFillerSubjectCap(key))
            continue;
          const tF =
            (teacherForShort[key] && teacherForShort[key][f]) ||
            teacherForShortGlobal[f] ||
            null;
          if (
            !canAssign(key, f, d, p5, {
              allowOverClassCap: true,
              allowNoTeacher: !tF,
            })
          )
            continue;
          schedules[key][d][p5] = f;
          if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
          fillerCountsByClass[key][f] =
            (fillerCountsByClass[key][f] || 0) + 1;
          if (tF) {
            teacherMinutes[tF] =
              (teacherMinutes[tF] || 0) + minsPerPeriod;
            teacherAssignedPerDayByClass[key][d][tF] =
              (teacherAssignedPerDayByClass[key][d][tF] || 0) + 1;
            ensureTP(key, tF)[p5 < lunchClassIndex ? "pre" : "post"]++;
          }
          break;
        }
      }
    }
    for (const k of keys) emergencyP5FillerIfNeeded(k);

    /**
     * Sweeps every empty slot in the schedule and fills it with the best-fit filler,
     * guaranteeing zero gaps in the final timetable.
     */
    function absoluteNoGapSweep(key) {
      const fillerShorts =
        (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
      if (!fillerShorts.size) return;
      // step: collect all empty slots across the schedule
      const allGaps = [];
      for (let d = 0; d < days; d++) {
        for (let c = 0; c < classesPerDay; c++) {
          if (schedules[key][d][c] === null) allGaps.push({
            d,
            c
          });
        }
      }
      if (!allGaps.length) return;
      // step: sort gaps — prioritize post-lunch, then by slot position
      allGaps.sort((a, b) => {
        const ap = a.c < lunchClassIndex ? 0 : 1;
        const bp = b.c < lunchClassIndex ? 0 : 1;
        if (ap !== bp) return bp - ap;
        if (ap === 1) return a.c - b.c; // later post-lunch first (P7->P5)
        return b.c - a.c; // later pre-lunch first
      });
      let usedOverflow = false;
      for (const {
          d,
          c
        }
        of allGaps) {
        if (schedules[key][d][c] !== null) continue;
        const targets = fillerTargetsByClass[key] || {};
        const counts = fillerCountsByClass[key] || {};
        // step: rank fillers by deficit and daily spread
        const ranked = Array.from(fillerShorts)
          .map((f) => ({
            f,
            deficit: (targets[f] || 0) - (counts[f] || 0),
            perDay: schedules[key][d].filter((x) => x === f).length,
          }))
          .sort((a, b) => {
            if (b.deficit !== a.deficit) return b.deficit - a.deficit;
            if (a.perDay !== b.perDay) return a.perDay - b.perDay;
            const aIsAR = a.f === "AR";
            const bIsAR = b.f === "AR";
            if (aIsAR && !bIsAR) return -1;
            if (!aIsAR && bIsAR) return 1;
            return 0;
          });
        // step: pick first filler that fits within cap and constraints
        for (const {
            f
          }
          of ranked) {
          if ((counts[f] || 0) >= getFillerSubjectCap(key))
            continue;
          const totalNow = getFillerTotal(key);
          const canUse =
            totalNow < getFillerCap(key) ||
            (!usedOverflow && totalNow === getFillerCap(key));
          if (!canUse) break;
          const tF =
            teacherForShort[key][f] || teacherForShortGlobal[f] || null;
          if (
            !canAssign(key, f, d, c, {
              allowOverClassCap: true,
              allowNoTeacher: !tF,
            })
          )
            continue;
          schedules[key][d][c] = f;
          if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
          fillerCountsByClass[key][f] =
            (fillerCountsByClass[key][f] || 0) + 1;
          if (tF) {
            teacherMinutes[tF] =
              (teacherMinutes[tF] || 0) + minsPerPeriod;
          }
          if (getFillerTotal(key) > getFillerCap(key))
            usedOverflow = true;
          break;
        }
      }
    }
    for (const k of keys) absoluteNoGapSweep(k);
  } else {
    for (const k of keys) ensureDailyTeacherPresence(k);
    for (const k of keys) ensureSubjectDailyFive(k);
    for (const k of keys) fillPostLunchGaps(k);
    for (const k of keys) postLunchFillerSweep(k);
    for (const k of keys) ensureAtLeastOneMainPerDay(k);
    {
      let changed = true;
      let attempts = 0;
      while (changed && attempts < 5) {
        changed = false;
        for (const k of keys) {
          if (boostTeachersBySwappingFillers(k)) changed = true;
        }
        attempts++;
      }
    }
  }

  // Section: COMPACTION & POST-PROCESSING

  /**
   * Rebuilds all tracking maps (teacher minutes, theory counts, filler counts, etc.)
   * from the current state of the schedules array. Called after major mutations.
   */
  function rebuildTrackingFromSchedule() {
    // step: clear all teacher-level aggregate counters
    Object.keys(teacherTheoryCount || {}).forEach((t) => {
      delete teacherTheoryCount[t];
    });
    Object.keys(teacherMinutes || {}).forEach((t) => {
      delete teacherMinutes[t];
    });
    Object.keys(teacherFirstPeriodCount || {}).forEach((t) => {
      delete teacherFirstPeriodCount[t];
    });
    Object.keys(teacherLabBlocks || {}).forEach((t) => {
      delete teacherLabBlocks[t];
    });
    Object.keys(teacherLabMinutes || {}).forEach((t) => {
      delete teacherLabMinutes[t];
    });

    // step: reset per-class tracking arrays and maps
    keys.forEach((k) => {
      teacherTheoryCountByClass[k] = {};
      teacherPrePostByClass[k] = {};
      mainPostLunchCountByClass[k] = {};
      perDayUsed[k] = Array.from({
        length: days
      }, () => new Set());
      teacherAssignedPerDayByClass[k] = Array.from({
          length: days
        },
        () => ({})
      );
      hasLabDay[k] = Array.from({
        length: days
      }, () => false);
      theoryOnLabDayCount[k] = Array.from({
        length: days
      }, () => 0);
      fillerCountsByClass[k] = fillerCountsByClass[k] || {};
      Object.keys(fillerCountsByClass[k]).forEach((f) => {
        fillerCountsByClass[k][f] = 0;
      });
    });

    /** Checks if a teacher is in the allowed list for a subject short in a class. */
    function isTeacherAllowedForShort(key, short, teacher) {
      if (!teacher) return false;
      const canonTeacher = canonicalTeacherName(teacher);
      if (!canonTeacher) return false;
      const list =
        (teacherListForShort[key] && teacherListForShort[key][short]) || [];
      if (list.length) {
        return list.some(
          (t) => canonicalTeacherName(t || "") === canonTeacher
        );
      }
      const fallback =
        (teacherForShort[key] && teacherForShort[key][short]) ||
        teacherForShortGlobal[short] ||
        "";
      return canonicalTeacherName(fallback) === canonTeacher;
    }

    /** Returns the first eligible teacher for a subject short (fallback lookup). */
    function fallbackTeacherForShort(key, short) {
      const list =
        (teacherListForShort[key] && teacherListForShort[key][short]) || [];
      if (list.length) return list[0] || null;
      return (
        (teacherForShort[key] && teacherForShort[key][short]) ||
        teacherForShortGlobal[short] ||
        null
      );
    }

    // step: scan every cell and rebuild teacher/filler/lab tracking
    keys.forEach((k) => {
      const fillerSet =
        (fillerShortsByClass && fillerShortsByClass[k]) || new Set();
      for (let d = 0; d < days; d++) {
        for (let p = 0; p < classesPerDay; p++) {
          const short = schedules[k][d][p];
          if (!short) continue;

          const isLabCell = !!(isLabShort[k] && isLabShort[k][short]);
          const isFillerCell = fillerSet.has(short);
          const existingTeacherRaw =
            assignedTeacher[k] &&
            assignedTeacher[k][d] &&
            assignedTeacher[k][d][p];
          const existingTeacher =
            existingTeacherRaw === undefined ? null : existingTeacherRaw;
          // step: resolve teacher — validate against allowed list or fall back
          let teacher = existingTeacher;
          if (isFillerCell && existingTeacher === "") {
            teacher = "";
          } else if (!isTeacherAllowedForShort(k, short, teacher)) {
            teacher = fallbackTeacherForShort(k, short);
          }

          if (assignedTeacher[k] && assignedTeacher[k][d]) {
            assignedTeacher[k][d][p] =
              teacher === undefined ? null : teacher;
          }

          // step: update tracking for lab cells (minutes, blocks, pre/post counts)
          if (isLabCell) {
            const labTeachers = getShortTeacherList(k, short);
            labTeachers.forEach((t) => {
              teacherMinutes[t] =
                (teacherMinutes[t] || 0) + minsPerPeriod;
              teacherAssignedPerDayByClass[k][d][t] =
                (teacherAssignedPerDayByClass[k][d][t] || 0) + 1;
              ensureTP(k, t)[p < lunchClassIndex ? "pre" : "post"]++;
              if (p === 0) {
                teacherFirstPeriodCount[t] =
                  (teacherFirstPeriodCount[t] || 0) + 1;
              }
            });

            hasLabDay[k][d] = true;
            const prev = p > 0 ? schedules[k][d][p - 1] : null;
            const startsLabBlock = !(prev && prev === short && isLabShort[k] && isLabShort[k][prev]);
            if (startsLabBlock) {
              labTeachers.forEach((t) => {
                teacherLabBlocks[t] = (teacherLabBlocks[t] || 0) + 1;
                teacherLabMinutes[t] =
                  (teacherLabMinutes[t] || 0) + 2 * minsPerPeriod;
              });
            }
            continue;
          }

          // step: update tracking for regular theory cells
          if (teacher) {
            teacherMinutes[teacher] =
              (teacherMinutes[teacher] || 0) + minsPerPeriod;
            teacherAssignedPerDayByClass[k][d][teacher] =
              (teacherAssignedPerDayByClass[k][d][teacher] || 0) + 1;
            ensureTP(k, teacher)[p < lunchClassIndex ? "pre" : "post"]++;
            if (p === 0) {
              teacherFirstPeriodCount[teacher] =
                (teacherFirstPeriodCount[teacher] || 0) + 1;
            }
          }

          if (isFillerCell) {
            fillerCountsByClass[k][short] =
              (fillerCountsByClass[k][short] || 0) + 1;
            continue;
          }

          perDayUsed[k][d].add(short);
          if (teacher) {
            teacherTheoryCount[teacher] =
              (teacherTheoryCount[teacher] || 0) + 1;
            teacherTheoryCountByClass[k][teacher] =
              (teacherTheoryCountByClass[k][teacher] || 0) + 1;
          }
          recordMainPostLunchIfNeeded(k, short, p);
        }
      }
    });

    keys.forEach((k) => {
      for (let d = 0; d < days; d++) {
        if (!hasLabDay[k][d]) continue;
        let theory = 0;
        for (let p = 0; p < classesPerDay; p++) {
          const short = schedules[k][d][p];
          if (!short) continue;
          const isLabCell = !!(isLabShort[k] && isLabShort[k][short]);
          const isFillerCell =
            (fillerShortsByClass &&
              fillerShortsByClass[k] &&
              fillerShortsByClass[k].has(short)) ||
            false;
          if (!isLabCell && !isFillerCell) theory++;
        }
        theoryOnLabDayCount[k][d] = theory;
      }
    });
  }

  rebuildTrackingFromSchedule();

  /** Counts how many times a subject short appears across all days/slots for a class. */
  function countOccurrences(key, short) {
    return schedulerCountOccurrences({
      schedules,
      days,
      classesPerDay,
      key,
      short,
    });
  }

  /**
   * On days that have labs but no theory lectures, places main subjects
   * to ensure they reach the target of 5 weekly lectures.
   */
  function boostMainSubjectsOnLabDays(key) {
    const mainSet =
      (mainShortsByClass && mainShortsByClass[key]) || new Set();
    if (!mainSet.size) return;
    const fillerSet =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    Object.keys(weeklyQuota[key] || {}).forEach((short) => {
      if (!mainSet.has(short)) return;
      const target = weeklyQuota[key][short] || 0;
      if (target < 5) return;
      let placed = countOccurrences(key, short);
      if (placed >= 5) return; // already satisfied
      const teacher =
        (teacherForShort[key] && teacherForShort[key][short]) ||
        teacherForShortGlobal[short] ||
        null;
      for (let d = 0; d < days && placed < 5; d++) {
        if (!hasLabDay[key][d]) continue;
        if (theoryOnLabDayCount[key][d] > 0) continue;
        const slotOrder = Array.from({
            length: classesPerDay
          },
          (_, i) => i
        ).sort((a, b) => {
          const ap = a < lunchClassIndex ? 0 : 1;
          const bp = b < lunchClassIndex ? 0 : 1;
          if (ap !== bp) return bp - ap; // post-lunch first
          return a - b;
        });
        for (const p of slotOrder) {
          const cur = schedules[key][d][p];
          if (cur && !fillerSet.has(cur)) continue;
          if (cur && isLabShort[key] && isLabShort[key][cur]) continue;
          if (
            !canAssign(key, short, d, p, {
              allowOverClassCap: true,
              allowNoTeacher: !teacher,
            })
          )
            continue;
          schedules[key][d][p] = short;
          teacherTheoryCount[teacher] =
            (teacherTheoryCount[teacher] || 0) + 1;
          teacherTheoryCountByClass[key][teacher] =
            (teacherTheoryCountByClass[key][teacher] || 0) + 1;
          theoryOnLabDayCount[key][d] =
            (theoryOnLabDayCount[key][d] || 0) + 1;
          if (cur && fillerSet.has(cur)) {
            fillerCountsByClass[key][cur] = Math.max(
              0,
              (fillerCountsByClass[key][cur] || 1) - 1
            );
          }
          placed++;
          break;
        }
      }
      if (placed < 5) {
        for (let d = 0; d < days && placed < 5; d++) {
          for (let p = 0; p < classesPerDay && placed < 5; p++) {
            const cur = schedules[key][d][p];
            if (cur && !fillerSet.has(cur)) continue; // only fillers or empty
            if (cur && isLabShort[key] && isLabShort[key][cur]) continue; // don't override lab
            if (
              !canAssign(key, short, d, p, {
                allowOverClassCap: true,
                allowNoTeacher: !teacher,
              })
            )
              continue;
            schedules[key][d][p] = short;
            teacherTheoryCount[teacher] =
              (teacherTheoryCount[teacher] || 0) + 1;
            teacherTheoryCountByClass[key][teacher] =
              (teacherTheoryCountByClass[key][teacher] || 0) + 1;
            if (cur && fillerSet.has(cur)) {
              fillerCountsByClass[key][cur] = Math.max(
                0,
                (fillerCountsByClass[key][cur] || 1) - 1
              );
            }
            placed++;
          }
        }
      }
    });
  }

  /** Emergency fallback: if a class schedule is completely empty, fills it with round-robin mains. */
  function emergencyFillIfCompletelyEmpty(key) {
    let any = false;
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < classesPerDay; p++) {
        if (schedules[key][d][p]) {
          any = true;
          break;
        }
      }
      if (any) break;
    }
    if (any) return; // not empty
    const mainsArr = Array.from(
      (mainShortsByClass && mainShortsByClass[key]) || []
    );
    let idx = 0;
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < classesPerDay; p++) {
        schedules[key][d][p] = mainsArr.length ?
          mainsArr[idx % mainsArr.length] :
          "FILL";
        idx++;
      }
    }
  }
  for (const k of keys) boostMainSubjectsOnLabDays(k);
  for (const k of keys) emergencyFillIfCompletelyEmpty(k);

  /** Fills sparse schedules that still have many empty slots after normal passes. */
  function fillSparseSchedule(key) {
    if (!hasFn(schedulerPassFillSparseSchedule)) return false;
    return schedulerPassFillSparseSchedule({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) fillSparseSchedule(k);

  /** Ultimate force-fill: plugs any remaining empty slots with maximum relaxation. */
  function ultimateForceFill(key) {
    if (!hasFn(schedulerPassUltimateForceFill)) return false;
    return schedulerPassUltimateForceFill({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) ultimateForceFill(k);

  /** Returns the weekly quota target for a subject short (defaults to 5). */
  function getTargetForShort(key, short) {
    return schedulerGetTargetForShort({
      weeklyQuota,
      key,
      short,
      defaultTarget: 5,
    });
  }

  /**
   * Iteratively enforces weekly targets for all main subjects in a class,
   * replacing fillers or over-quota subjects as needed.
   */
  function enforceMainTargetsForClass(key) {
    const mainSet =
      (mainShortsByClass && mainShortsByClass[key]) || new Set();
    if (!mainSet.size) return false;

    const mains = Array.from(mainSet).filter(
      (short) => short && !(isLabShort[key] && isLabShort[key][short])
    );
    if (!mains.length) return false;

    const fillerSet =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    const countByShort = {};
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < classesPerDay; p++) {
        const sh = schedules[key][d][p];
        if (!sh) continue;
        countByShort[sh] = (countByShort[sh] || 0) + 1;
      }
    }

    /** Returns true if the subject short already appears on the given day. */
    const dayHasShort = (day, short) => {
      for (let p = 0; p < classesPerDay; p++) {
        if (schedules[key][day][p] === short) return true;
      }
      return false;
    };
    /** Returns true if the slot can be overwritten (empty, filler, or over-quota subject). */
    const canReplaceAt = (day, col, targetShort) => {
      const cur = schedules[key][day][col];
      if (cur === targetShort) return false;
      if (cur && isLabShort[key] && isLabShort[key][cur]) return false;
      if (cur === null) return true;
      if (fillerSet.has(cur)) return true;
      const curTarget = getTargetForShort(key, cur);
      return (countByShort[cur] || 0) > curTarget;
    };

    // step: iterative enforcement loop — find subjects with largest deficit
    let changed = false;
    for (let guard = 0; guard < days * classesPerDay * 4; guard++) {
      const needs = mains
        .map((short) => ({
          short,
          deficit: getTargetForShort(key, short) - (countByShort[short] || 0),
        }))
        .filter((m) => m.deficit > 0)
        .sort(
          (a, b) =>
          b.deficit - a.deficit ||
          (countByShort[a.short] || 0) - (countByShort[b.short] || 0)
        );
      if (!needs.length) break;

      let placedOne = false;
      for (const need of needs) {
        // step: build candidate slots — try without day-duplicates first, then allow
        for (const allowDuplicateDay of [false, true]) {
          const candidates = [];
          for (let d = 0; d < days; d++) {
            if (!allowDuplicateDay && dayHasShort(d, need.short)) continue;
            for (let p = 0; p < classesPerDay; p++) {
              if (!canReplaceAt(d, p, need.short)) continue;
              const chosen = pickTeacherForSlot(key, need.short, d, p, {
                allowNoTeacher: false,
                allowOverClassCap: true,
                allowOverPerDayByClassCap: true,
                allowMoreThanOneMainPostLunch: true,
                ultraRelaxed: true,
              });
              const chosenFinal = chosen !== null ? chosen :
                pickTeacherForSlot(key, need.short, d, p, {
                  allowNoTeacher: true,
                  allowOverClassCap: true,
                  allowOverPerDayByClassCap: true,
                  allowMoreThanOneMainPostLunch: true,
                  ultraRelaxed: true,
                });
              if (chosenFinal === null) continue;
              const cur = schedules[key][d][p];
              const bucket =
                cur === null ? 0 : fillerSet.has(cur) ? 1 : 2;
              candidates.push({
                d,
                p,
                chosen: chosenFinal,
                cur,
                bucket,
                postLunchPenalty: p < lunchClassIndex ? 0 : 1,
              });
            }
          }
          if (!candidates.length) continue;
          // step: sort candidates (empty > filler > over-quota, prefer pre-lunch)
          candidates.sort(
            (a, b) =>
            (a.chosen === "" ? 1 : 0) - (b.chosen === "" ? 1 : 0) ||
            a.bucket - b.bucket ||
            a.postLunchPenalty - b.postLunchPenalty ||
            a.d - b.d ||
            a.p - b.p
          );
          // step: apply best candidate — update schedule and subject counts
          const pick = candidates[0];
          const prev = schedules[key][pick.d][pick.p];
          if (prev) {
            countByShort[prev] = Math.max(0, (countByShort[prev] || 0) - 1);
          }
          schedules[key][pick.d][pick.p] = need.short;
          assignedTeacher[key][pick.d][pick.p] = pick.chosen;
          countByShort[need.short] = (countByShort[need.short] || 0) + 1;
          changed = true;
          placedOne = true;
          break;
        }
        if (placedOne) break;
      }
      if (!placedOne) break;
    }
    return changed;
  }

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const k of keys) {
      if (enforceMainTargetsForClass(k)) changed = true;
    }
    if (!changed) break;
    rebuildTrackingFromSchedule();
  }

  /** Swaps post-lunch main subjects into pre-lunch slots for better distribution. */
  function promoteMainsBeforeLunch(key) {
    if (!hasFn(schedulerPassPromoteMainsBeforeLunch)) return false;
    return schedulerPassPromoteMainsBeforeLunch({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) {
    for (let pass = 0; pass < 3; pass++) {
      if (!promoteMainsBeforeLunch(k)) break;
    }
  }

  /**
   * Detects and resolves cross-class teacher clashes where the same teacher
   * is scheduled in two classes at the same day/slot.
   */
  function resolveFinalTeacherClashes() {
    return schedulerResolveFinalTeacherClashes({
      days,
      classesPerDay,
      keys,
      schedules,
      getTeachersForCell,
      teacherClashKey,
      pickTeacherForSlot,
      assignedTeacher,
      lectureList,
      getTargetForShort,
      countOccurrences,
      isMainShort,
      fillerShortsByClass,
      fillerTargetsByClass,
      fillerCountsByClass,
      isLabShort,
    });
  }
  for (let pass = 0; pass < 4; pass++) {
    if (!resolveFinalTeacherClashes()) break;
  }
  rebuildTrackingFromSchedule();

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const k of keys) {
      if (enforceMainTargetsForClass(k)) changed = true;
    }
    if (resolveFinalTeacherClashes()) changed = true;
    for (const k of keys) {
      if (promoteMainsBeforeLunch(k)) changed = true;
    }
    rebuildTrackingFromSchedule();
    if (!changed) break;
  }

  /** Fills empty pre-lunch slots that were skipped by earlier passes. */
  function fillEmptyPreLunch() {
    if (!hasFn(schedulerPassFillEmptyPreLunch)) return false;
    return schedulerPassFillEmptyPreLunch({ ctx: getAdvancedPassCtx() });
  }
  for (let pass = 0; pass < 3; pass++) {
    if (!fillEmptyPreLunch()) break;
    rebuildTrackingFromSchedule();
  }

  /** Removes excess main-subject occurrences that exceed their weekly quota target. */
  function clampMainsToTarget() {
    return schedulerClampMainsToTarget({
      keys,
      mainShortsByClass,
      fillerShortsByClass,
      weeklyQuota,
      days,
      classesPerDay,
      schedules,
      isLabShort,
      getTargetForShort,
      pickTeacherForSlot,
      assignedTeacher,
    });
  }
  for (let pass = 0; pass < 3; pass++) {
    if (!clampMainsToTarget()) break;
    rebuildTrackingFromSchedule();
  }

  /** Compacts post-lunch slots by shifting subjects earlier to eliminate mid-gap holes. */
  function compactPostLunch(key) {
    if (!hasFn(schedulerPassCompactPostLunch)) return false;
    return schedulerPassCompactPostLunch({ ctx: getAdvancedPassCtx(), key });
  }
  /** Compacts pre-lunch slots by shifting subjects to close interior gaps. */
  function compactPreLunch(key) {
    if (!hasFn(schedulerPassCompactPreLunch)) return false;
    return schedulerPassCompactPreLunch({ ctx: getAdvancedPassCtx(), key });
  }
  /** Combines pre- and post-lunch compaction to close all intra-day gaps. */
  function compactDayGaps(key) {
    if (!hasFn(schedulerPassCompactDayGaps)) return false;
    return schedulerPassCompactDayGaps({ ctx: getAdvancedPassCtx(), key });
  }
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const k of keys) {
      if (compactPreLunch(k)) changed = true;
      if (compactPostLunch(k)) changed = true;
    }
    if (!changed) break;
    rebuildTrackingFromSchedule();
  }
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const k of keys) {
      if (compactDayGaps(k)) changed = true;
    }
    if (!changed) break;
    rebuildTrackingFromSchedule();
  }

  /**
   * Enforces filler targets specifically for the first class (Class 1),
   * ensuring each filler subject reaches its credit-based weekly target.
   */
  function enforceClassOneFillerTargets() {
    const classOneKey = keys[0];
    if (!classOneKey) return false;

    const fillerSet =
      (fillerShortsByClass && fillerShortsByClass[classOneKey]) || new Set();
    if (!fillerSet.size) return false;

    const targets =
      (fillerTargetsByClass && fillerTargetsByClass[classOneKey]) || {};
    const countByShort = {};
    for (let d = 0; d < days; d++) {
      for (let c = 0; c < classesPerDay; c++) {
        const sh = schedules[classOneKey]?.[d]?.[c] || null;
        if (!sh) continue;
        countByShort[sh] = (countByShort[sh] || 0) + 1;
      }
    }

    const fillerWindowStart = Math.max(0, classesPerDay - 2);
    /** Builds a ranked list of candidate slots where a filler can be placed or swapped in. */
    const buildCandidates = (fillerShort) => {
      const candidates = [];
      for (let d = 0; d < days; d++) {
        for (let c = fillerWindowStart; c < classesPerDay; c++) {
          const cur = schedules[classOneKey][d][c];
          if (!cur) {
            const chosen = pickTeacherForSlot(
              classOneKey,
              fillerShort,
              d,
              c,
              {
                allowNoTeacher: true,
                allowOverClassCap: true,
                allowOverPerDayByClassCap: true,
                allowMoreThanOneMainPostLunch: true,
                ultraRelaxed: true,
              }
            );
            if (chosen === null) continue;
            candidates.push({
              d,
              c,
              chosen,
              bucket: 0,
            });
            continue;
          }
          if (cur === fillerShort) continue;
          if (isLabShort[classOneKey] && isLabShort[classOneKey][cur]) continue;

          let bucket = -1;
          if (fillerSet.has(cur)) {
            const curTarget = Number.isFinite(targets[cur]) ? targets[cur] : 0;
            if ((countByShort[cur] || 0) <= curTarget) continue;
            bucket = 1;
          } else {
            const curTarget = getTargetForShort(classOneKey, cur);
            if ((countByShort[cur] || 0) <= curTarget) continue;
            bucket = 2;
          }

          const chosen = pickTeacherForSlot(classOneKey, fillerShort, d, c, {
            allowNoTeacher: true,
            allowOverClassCap: true,
            allowOverPerDayByClassCap: true,
            allowMoreThanOneMainPostLunch: true,
            ultraRelaxed: true,
          });
          if (chosen === null) continue;
          candidates.push({
            d,
            c,
            chosen,
            bucket,
          });
        }
      }
      candidates.sort(
        (a, b) => a.bucket - b.bucket || a.d - b.d || a.c - b.c
      );
      return candidates;
    };

    const deficits = Array.from(fillerSet)
      .map((short) => {
        const target = Number.isFinite(targets[short]) ? targets[short] : 0;
        const have = countByShort[short] || 0;
        return {
          short,
          target,
          have,
          deficit: target - have,
        };
      })
      .filter((item) => item.target > 0 && item.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit || a.short.localeCompare(b.short));

    let changed = false;
    deficits.forEach((item) => {
      let need = item.deficit;
      while (need > 0) {
        const candidates = buildCandidates(item.short);
        if (!candidates.length) break;
        const pick = candidates[0];
        const prev = schedules[classOneKey][pick.d][pick.c];
        if (prev) {
          countByShort[prev] = Math.max(0, (countByShort[prev] || 0) - 1);
        }
        schedules[classOneKey][pick.d][pick.c] = item.short;
        assignedTeacher[classOneKey][pick.d][pick.c] = pick.chosen;
        countByShort[item.short] = (countByShort[item.short] || 0) + 1;
        need--;
        changed = true;
      }
    });

    return changed;
  }
  for (let pass = 0; pass < 2; pass++) {
    if (!enforceClassOneFillerTargets()) break;
    rebuildTrackingFromSchedule();
  }

  // Section: FIXED SLOT ENFORCEMENT

  /**
   * Locks imported fixed slots into the schedule, overriding whatever was
   * previously placed and assigning the specified teacher.
   */
  function enforceImportedFixedSlots() {
    let changed = false;
    keys.forEach((key) => {
      const locks =
        (importedFixedSlotsByClass && importedFixedSlotsByClass[key]) || [];
      if (!locks.length) return;
      const byShort = subjectByShort[key] || {};
      locks.forEach((lock) => {
        const day = Number(lock.day);
        const slot = Number(lock.slot);
        const short = String(lock.short || "")
          .toUpperCase()
          .replace(/\s+/g, " ")
          .trim();
        if (!Number.isFinite(day) || !Number.isFinite(slot) || !short) return;
        if (day < 0 || day >= days || slot < 0 || slot >= classesPerDay) return;
        if (!byShort[short]) return;

        const prev = schedules[key][day][slot];
        if (prev === short) {
          const fixedTeacher = String(lock.teacher || "").trim();
          if (fixedTeacher && !/^not\s*mentioned$/i.test(fixedTeacher)) {
            assignedTeacher[key][day][slot] = fixedTeacher;
            changed = true;
          }
          return;
        }

        schedules[key][day][slot] = short;
        const fixedTeacher = String(lock.teacher || "").trim();
        const fallbackTeacher =
          (teacherForShort[key] && teacherForShort[key][short]) ||
          teacherForShortGlobal[short] ||
          null;
        assignedTeacher[key][day][slot] =
          fixedTeacher && !/^not\s*mentioned$/i.test(fixedTeacher) ?
          fixedTeacher :
          fallbackTeacher;
        changed = true;
      });
    });
    return changed;
  }
  for (let pass = 0; pass < 2; pass++) {
    if (!enforceImportedFixedSlots()) break;
    rebuildTrackingFromSchedule();
  }

  /**
   * Validates the final post-lunch compaction: checks for mid-gap issues,
   * split lab blocks, and remaining cross-class teacher clashes.
   */
  function validatePostLunchCompaction() {
    const issues = [];

    for (const key of keys) {
      for (let d = 0; d < days; d++) {
        // Among movable post-lunch cells (non-lab), gaps should stay at end.
        let seenGap = false;
        for (let c = lunchClassIndex; c < classesPerDay; c++) {
          const sh = schedules[key][d][c];
          if (sh && isLabShort[key] && isLabShort[key][sh]) continue;
          if (!sh) {
            seenGap = true;
            continue;
          }
          if (seenGap) {
            issues.push({
              type: "mid_gap_post_lunch",
              key,
              day: d,
              col: c,
              short: sh,
            });
            break;
          }
        }

        // Lab cell must remain adjacent to same short at least on one side.
        for (let c = 0; c < classesPerDay; c++) {
          const sh = schedules[key][d][c];
          if (!sh || !(isLabShort[key] && isLabShort[key][sh])) continue;
          const prevSame = c > 0 && schedules[key][d][c - 1] === sh;
          const nextSame = c + 1 < classesPerDay && schedules[key][d][c + 1] === sh;
          if (!prevSame && !nextSame) {
            issues.push({
              type: "lab_split",
              key,
              day: d,
              col: c,
              short: sh,
            });
          }
        }
      }
    }

    // Cross-class teacher clashes on post-lunch slots.
    for (let d = 0; d < days; d++) {
      for (let c = lunchClassIndex; c < classesPerDay; c++) {
        const byTeacher = {};
        for (const k of keys) {
          const sh = schedules[k]?.[d]?.[c] || null;
          if (!sh) continue;
          const teachers = getTeachersForCell(k, sh, d, c);
          teachers.forEach((t) => {
            const tk = teacherClashKey(t);
            if (!tk) return;
            if (!byTeacher[tk]) byTeacher[tk] = [];
            byTeacher[tk].push({ key: k, short: sh, teacher: t });
          });
        }
        Object.entries(byTeacher).forEach(([tk, slots]) => {
          if (!slots || slots.length <= 1) return;
          const classes = new Set(slots.map((s) => s.key));
          if (classes.size <= 1) return;
          issues.push({
            type: "teacher_clash_post_lunch",
            day: d,
            col: c,
            teacherKey: tk,
            slots,
          });
        });
      }
    }

    const summary = {
      totalIssues: issues.length,
      byType: issues.reduce((acc, it) => {
        const t = it.type || "unknown";
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {}),
      compactDebugByClass: postLunchCompactDebugByClass,
      sampleIssues: issues.slice(0, 10),
    };

    try {
      window.__ttPostLunchCompactReport = summary;
    } catch {
      // Compact-pass reporting is debug-only.
    }
    try {
      console.info("Post-lunch compaction summary:", summary);
      if (issues.length) {
        console.warn(
          "Post-lunch compaction validation issues (sample):",
          summary.sampleIssues
        );
      }
    } catch {
      // Ignore console/reporting failures.
    }
  }

  validatePostLunchCompaction();

  // Section: DOM RENDERING

  /** Renders the finalized schedule for a class into the timetable DOM table. */
  function renderClassToDOM(key) {
    schedulerRenderClassToDOM({
      key,
      days,
      periodTimings,
      schedules,
      subjectByShort,
      getTeacherForCell,
      isLabShort,
      labNumberAssigned,
      fillerLabelsByClass: gFillerLabelsByClass,
    });
  }
  for (const k of keys) renderClassToDOM(k);

  schedulerMergeTeacherAggregateStats({
    data,
    teacherTheoryCount,
    teacherLabBlocks,
    teacherMinutes,
    teacherFirstPeriodCount,
    aggregateStats,
    normalizeTeacherName,
  });
  const publishedState = schedulerBuildPublishedState({
    keys,
    schedules,
    teacherForShort,
    subjectByShort,
    labsAtSlot,
    assignedTeacher,
    labNumberAssigned,
    fillerShortsByClass,
  });
  const strictSnapshot = {
    seed: resolvedSeed,
    keys: keys.slice(),
    days,
    classesPerDay,
    lunchClassIndex,
    schedulesByClass: publishedState.schedulesByClass,
    assignedTeacher: publishedState.assignedTeacher,
    labNumberAssigned: publishedState.labNumberAssigned,
    teacherForShortByClass: publishedState.teacherForShortByClass,
    teacherForShortGlobal: {
      ...teacherForShortGlobal,
    },
    teacherListForShortByClass: schedulerBuildTeacherListSnapshot(
      teacherListForShort,
      keys
    ),
    isLabShortByClass: (() => {
      const out = {};
      keys.forEach((k) => {
        out[k] = {
          ...(isLabShort[k] || {}),
        };
      });
      return out;
    })(),
    weeklyQuotaByClass: JSON.parse(JSON.stringify(weeklyQuota || {})),
    mainShortsByClass: schedulerBuildSetMapSnapshot(mainShortsByClass, keys),
    fillerShortsByClass: schedulerBuildSetMapSnapshot(fillerShortsByClass, keys),
    fixedSlotsByClass: JSON.parse(JSON.stringify(importedFixedSlotsByClass || {})),
    fillerTargetsByClass: JSON.parse(JSON.stringify(fillerTargetsByClass || {})),
    fillerCountsByClass: JSON.parse(JSON.stringify(fillerCountsByClass || {})),
    teacherFoldMap: {
      ...teacherFoldMapLocal,
    },
  };
  try {
    window.__ttLastScheduleState = strictSnapshot;
    window.__ttLastValidation = schedulerIsFullyValid(strictSnapshot);
  } catch (_e) {
    // Snapshot publication is diagnostic only.
  }
  gSchedules = publishedState.schedulesByClass;
  gTeacherForShort = publishedState.teacherForShortByClass;
  gSubjectByShort = publishedState.subjectByShortByClass;
  gEnabledKeys = publishedState.enabledKeys;
  gLabsAtSlot = publishedState.labsAtSlot;
  window.gAssignedTeacher = publishedState.assignedTeacher;
  window.gLabNumberAssigned = publishedState.labNumberAssigned;
  gFillerShortsByClass = publishedState.fillerShortsByClass;
}
