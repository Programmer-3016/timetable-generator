// @ts-check
/* exported schedulerRenderMultiClassesEngine */

/**
 * @module core/scheduler/engine.js
 * @description Core scheduling engine (renderMultiClasses).
 * Dependencies: validation.js, scoring.js must be loaded before this file.
 */


/**
 * Core multi-class scheduling engine that builds complete timetables.
 * @param {Object} params - Destructured configuration object.
 * @param {Object} params.pairsByClass - Subject-teacher pairs grouped by class key.
 * @param {number} params.days - Number of days in the schedule week.
 * @param {number} params.defaultDuration - Default period duration in minutes.
 * @param {string[]} params.enabledKeys - Class keys enabled for scheduling.
 * @param {Object} params.fillerShortsByClass - Sets of filler short codes per class.
 * @param {Object} params.fillerCreditsByClass - Credit-based filler targets per class.
 * @param {Object} params.mainShortsByClass - Sets of main subject shorts per class.
 * @param {Object} params.fixedSlotsByClass - Pre-assigned fixed slots per class.
 * @param {*} [params.seed] - Optional RNG seed for deterministic scheduling.
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

  /* ═══════════════════════════════════════════════════════
     Section: CONFIGURATION & UTILITY HELPERS
  ═══════════════════════════════════════════════════════ */

  /**
   * Checks if a subject pair is a lab by testing its short/subject name.
   * @param {Object} pair - Subject-teacher pair object.
   * @returns {boolean} True if the pair represents a lab.
   */
  const isLab = (pair) =>
    /lab/i.test(pair.short) || /lab/i.test(pair.subject);
  /**
   * Checks whether the given value is a callable function.
   * @param {*} fn - Value to test.
   * @returns {boolean} True if fn is a function.
   */
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
  /* ═══════════════════════════════════════════════════════
     Section: TEACHER RESOLUTION
  ═══════════════════════════════════════════════════════ */

  /**
   * Returns the canonical fold-map key for a teacher name, used for clash detection.
   * @param {string} name - Raw teacher name.
   * @returns {string} Canonical key or empty string if unresolvable.
   */
  const teacherClashKey = (name) => {
    const t = String(name || "").trim();
    if (!t || /^not\s*mentioned$/i.test(t)) return "";
    const canon = canonicalTeacherName(t);
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
  /**
   * Checks whether a subject short code belongs to the main (non-filler) set for a class.
   * @param {string} k - Class identifier.
   * @param {string} sh - Subject short code.
   * @returns {boolean} True if the short belongs to the main set.
   */
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
  /**
   * Ensures a pre/post-lunch tracking bucket exists for the given teacher in a class.
   * @param {string} k - Class identifier.
   * @param {string} t - Teacher name.
   * @returns {Object} The pre/post tracking bucket for the teacher.
   */
  const ensureTP = (k, t) =>
    schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass,
      classKey: k,
      teacher: t,
    });
  /**
   * Returns the total number of filler slots already assigned for a class.
   * @param {string} k - Class identifier.
   * @returns {number} Total filler count for the class.
   */
  const getFillerTotal = (k) =>
    schedulerGetFillerTotal({
      fillerCountsByClass,
      classKey: k,
    });
  /**
   * Returns the maximum weekly filler capacity for a class.
   * @param {string} k - Class identifier.
   * @returns {number} Maximum weekly filler slots for the class.
   */
  const getFillerCap = (k) =>
    schedulerGetFillerCap({
      fillerCapacityByClass,
      classKey: k,
      defaultCap: MAX_FILLERS_PER_WEEK,
    });
  /**
   * Returns the per-subject filler cap for a class.
   * @param {string} k - Class identifier.
   * @returns {number} Maximum filler slots per subject for the class.
   */
  const getFillerSubjectCap = (k) =>
    schedulerGetFillerSubjectCap({
      fillerPerSubjectCapByClass,
      classKey: k,
      defaultCap: MAX_FILLERS_PER_SUBJECT_PER_WEEK,
    });
  /**
   * Gets the teacher already assigned to a specific day/col slot for a class.
   * @param {string} key - Class identifier.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @returns {string|null} Assigned teacher name or null.
   */
  const getAssignedTeacherValue = (key, day, col) =>
    schedulerGetAssignedTeacherValue({
      assignedTeacher,
      key,
      day,
      col,
    });
  /**
   * Returns the list of eligible teachers for a given subject short in a class.
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @returns {string[]} List of eligible teacher names.
   */
  const getShortTeacherList = (key, short) =>
    schedulerGetShortTeacherList({
      teacherListForShort,
      teacherForShort,
      teacherForShortGlobal,
      key,
      short,
    });
  /**
   * Checks whether a subject short code represents a lab for a given class.
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @returns {boolean} True if the short is a lab subject.
   */
  const isLabShortFor = (key, short) =>
    schedulerIsLabShortFor({
      subjectByShort,
      key,
      short,
    });
  /**
   * Returns all teachers associated with a cell (class/day/col), considering lab multi-teacher.
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @returns {string[]} Array of teacher names for the cell.
   */
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
  /**
   * Returns the primary teacher for a cell (first from the teachers list).
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @returns {string|null} Primary teacher name or null.
   */
  const getTeacherForCell = (key, short, day, col) =>
    schedulerGetTeacherForCell({
      getTeachersForCell,
      key,
      short,
      day,
      col,
    });
  /**
   * Checks if two short codes refer to the same base subject.
   * @param {string} a - First subject short code.
   * @param {string} b - Second subject short code.
   * @returns {boolean} True if both refer to the same subject.
   */
  const sameSubjectCode = (a, b) => schedulerSameSubjectCode(a, b);
  const postLunchCompactDebugByClass = {};
  /**
   * Checks if a slot is adjacent to a lab block of the same subject (prevents double-stacking).
   * @param {string} key - Class identifier.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @param {string} short - Subject short code.
   * @returns {boolean} True if adjacent to a same-subject lab block.
   */
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

  /* ═══════════════════════════════════════════════════════
     Section: SLOT ASSIGNMENT & VALIDATION
  ═══════════════════════════════════════════════════════ */

  /**
   * Increments the post-lunch main-subject counter if the slot is after lunch.
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @param {number} col - Period column index.
   */
  function recordMainPostLunchIfNeeded(key, short, col) {
    if (col < lunchClassIndex) return;
    if (!isMainShort(key, short)) return;
    mainPostLunchCountByClass[key][short] =
      (mainPostLunchCountByClass[key][short] || 0) + 1;
  }

  /**
   * Selects the best available teacher for a subject at a specific day/slot,
   * respecting clash, minute-cap, and per-class theory limits.
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @param {Object} [opts={}] - Assignment constraint options.
   * @returns {string|null} Selected teacher name or null if none available.
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
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @param {Object} [opts={}] - Assignment constraint options.
   * @returns {boolean} True if the assignment is valid.
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
      getShortTeacherList,
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

  /* ═══════════════════════════════════════════════════════
     Section: LAB PLACEMENT
  ═══════════════════════════════════════════════════════ */

  /**
   * Places a 2-period lab block on the given day for a class, choosing the best
   * start slot while respecting lab capacity, teacher clashes, and pre/post balance.
   * @param {string} key - Class identifier.
   * @param {string} label - Lab subject short code.
   * @param {number} day - Day index.
   * @returns {boolean} True if the lab block was successfully placed.
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

  /**
   * Checks if a teacher is shared across multiple classes (common faculty).
   * @param {string} key - Class identifier.
   * @param {string} teacher - Teacher name.
   * @returns {boolean} True if the teacher teaches in other classes too.
   */
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

  /**
   * Determines if a teacher should prefer a pre- or post-lunch slot for a given class.
   * @param {string} key - Class identifier.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @param {string} teacher - Teacher name.
   * @returns {boolean} True if the teacher is preferred for this slot.
   */
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

  /* ═══════════════════════════════════════════════════════
     Section: FILLER & GAP MANAGEMENT
  ═══════════════════════════════════════════════════════ */

  /**
   * Attempts to replace post-lunch filler slots with main lectures from teachers
   * who are below the per-class theory maximum.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any swaps were made.
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
   * @param {string} key - Class identifier.
   * @param {number} day - Day index.
   * @param {number} col - Period column index.
   * @returns {number} Index into the lecture list, or -1 if none found.
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

  /* ═══════════════════════════════════════════════════════
     Section: MAIN SUBJECT SCHEDULING PASSES
  ═══════════════════════════════════════════════════════ */

    /**
     * Builds a shared context object for all advanced scheduling passes.
     * @returns {Object} Context object containing all scheduling state and helpers.
     */
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
    teacherClashKey,
    getTeachersForCell,
    getTeacherForCell,
    getShortTeacherList,
    teacherLabBlocks,
    teacherLabMinutes,
    teacherPrePostByClass,
    teacherListForShort,
    importedFixedSlotsByClass,
    subjectByShort,
  });
/**
 * Attempts to place remaining unscheduled lectures into empty slots.
 * @param {string} key - Class identifier.
 */
function fillRemaining(key) {
    if (!hasFn(schedulerPassFillRemaining)) return false;
    return schedulerPassFillRemaining({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) fillRemaining(k);

  /**
   * Aggressively fills any remaining empty slots, relaxing constraints.
   * @param {string} key - Class identifier.
   */
  function aggressiveFill(key) {
    if (!hasFn(schedulerPassAggressiveFill)) return false;
    return schedulerPassAggressiveFill({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) aggressiveFill(k);

  /**
   * Sweeps post-lunch slots to place filler subjects where gaps remain.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any fillers were placed.
   */
  function postLunchFillerSweep(key) {
    if (!hasFn(schedulerPassPostLunchFillerSweep)) return false;
    return schedulerPassPostLunchFillerSweep({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) postLunchFillerSweep(k);

  /**
   * Places lectures from teachers who are below the per-class theory max
   * into any remaining empty slots.
   * @param {string} key - Class identifier.
   */
  function boostTeachers(key) {
    if (!hasFn(schedulerBoostTeachers)) return;
    schedulerBoostTeachers({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) boostTeachers(k);
  for (const k of keys) boostTeachersBySwappingFillers(k);

  /**
   * Fills mid-schedule gaps to produce a compact timetable with no holes.
   * @param {string} key - Class identifier.
   */
  function gapSealFill(key) {
    if (!hasFn(schedulerPassGapSealFill)) return false;
    return schedulerPassGapSealFill({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) gapSealFill(k);

  /**
   * Final pass to fix empty first-post-lunch (P5) slots.
   * @param {string} key - Class identifier.
   */
  function finalPostLunchGapFix(key) {
    if (!hasFn(schedulerPassFinalPostLunchGapFix)) return false;
    return schedulerPassFinalPostLunchGapFix({ ctx: getAdvancedPassCtx(), key });
  }

  /**
   * Ensures every teacher with remaining lectures appears at least once each day,
   * swapping out fillers if necessary.
   * @param {string} key - Class identifier.
   */
  function ensureDailyTeacherPresence(key) {
    if (!hasFn(schedulerEnsureDailyTeacherPresence)) return;
    schedulerEnsureDailyTeacherPresence({ ctx: getAdvancedPassCtx(), key });
  }

  /**
   * Fills any remaining empty post-lunch gaps with eligible lectures or fillers.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any gaps were filled.
   */
  function fillPostLunchGaps(key) {
    if (!hasFn(schedulerPassFillPostLunchGaps)) return false;
    return schedulerPassFillPostLunchGaps({ ctx: getAdvancedPassCtx(), key });
  }

  /**
   * Ensures each main subject reaches its weekly target of 5 lectures.
   * @param {string} key - Class identifier.
   */
  function ensureSubjectDailyFive(key) {
    if (!hasFn(schedulerPassEnsureSubjectDailyFive)) return false;
    return schedulerPassEnsureSubjectDailyFive({ ctx: getAdvancedPassCtx(), key });
  }

  /**
   * Guarantees at least one main-subject lecture is present every day.
   * @param {string} key - Class identifier.
   */
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
     * @param {string} key - Class identifier.
     */
    function forceMainToFive(key) {
      if (!hasFn(schedulerForceMainToFive)) return;
      schedulerForceMainToFive({ ctx: getAdvancedPassCtx(), key });
    }
    for (const k of keys) forceMainToFive(k);

    /**
     * Last-resort pass: relocates other main subjects to different days/slots
     * to free room for subjects that still haven't met their weekly target.
     * @param {string} key - Class identifier.
     */
    function finalizeSubjectFiveByRelocatingOtherMain(key) {
      if (!hasFn(schedulerFinalizeSubjectFive)) return;
      schedulerFinalizeSubjectFive({ ctx: getAdvancedPassCtx(), key });
    }
    for (const k of keys) finalizeSubjectFiveByRelocatingOtherMain(k);

    /**
     * Places a filler in the first post-lunch slot (P5) if it remains empty and filler budget allows.
     * @param {string} key - Class identifier.
     */
    function emergencyP5FillerIfNeeded(key) {
      if (!hasFn(schedulerEmergencyP5Filler)) return;
      schedulerEmergencyP5Filler({ ctx: getAdvancedPassCtx(), key });
    }
    for (const k of keys) emergencyP5FillerIfNeeded(k);

    /**
     * Sweeps every empty slot in the schedule and fills it with the best-fit filler,
     * guaranteeing zero gaps in the final timetable.
     * @param {string} key - Class identifier.
     */
    function absoluteNoGapSweep(key) {
      if (!hasFn(schedulerAbsoluteNoGapSweep)) return;
      schedulerAbsoluteNoGapSweep({ ctx: getAdvancedPassCtx(), key });
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

  /* ═══════════════════════════════════════════════════════
     Section: COMPACTION & POST-PROCESSING
  ═══════════════════════════════════════════════════════ */

  /**
   * Rebuilds all tracking maps (teacher minutes, theory counts, filler counts, etc.)
   * from the current state of the schedules array. Called after major mutations.
   */
  function rebuildTrackingFromSchedule() {
    if (!hasFn(schedulerRebuildTracking)) return;
    schedulerRebuildTracking({ ctx: getAdvancedPassCtx() });
  }

  rebuildTrackingFromSchedule();

  /**
   * Counts how many times a subject short appears across all days/slots for a class.
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @returns {number} Total occurrences of the subject in the class schedule.
   */
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
   * @param {string} key - Class identifier.
   */
  function boostMainSubjectsOnLabDays(key) {
    if (!hasFn(schedulerBoostMainOnLabDays)) return;
    schedulerBoostMainOnLabDays({ ctx: getAdvancedPassCtx(), key });
  }

  /**
   * Emergency fallback: if a class schedule is completely empty, fills it with round-robin mains.
   * @param {string} key - Class identifier.
   */
  function emergencyFillIfCompletelyEmpty(key) {
    if (!hasFn(schedulerEmergencyFillEmpty)) return;
    schedulerEmergencyFillEmpty({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) boostMainSubjectsOnLabDays(k);
  for (const k of keys) emergencyFillIfCompletelyEmpty(k);

  /**
   * Fills sparse schedules that still have many empty slots after normal passes.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any slots were filled.
   */
  function fillSparseSchedule(key) {
    if (!hasFn(schedulerPassFillSparseSchedule)) return false;
    return schedulerPassFillSparseSchedule({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) fillSparseSchedule(k);

  /**
   * Ultimate force-fill: plugs any remaining empty slots with maximum relaxation.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any slots were force-filled.
   */
  function ultimateForceFill(key) {
    if (!hasFn(schedulerPassUltimateForceFill)) return false;
    return schedulerPassUltimateForceFill({ ctx: getAdvancedPassCtx(), key });
  }
  for (const k of keys) ultimateForceFill(k);

  /**
   * Returns the weekly quota target for a subject short (defaults to 5).
   * @param {string} key - Class identifier.
   * @param {string} short - Subject short code.
   * @returns {number} Weekly lecture target for the subject.
   */
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
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any changes were made.
   */
  function enforceMainTargetsForClass(key) {
    if (!hasFn(schedulerEnforceMainTargets)) return false;
    return schedulerEnforceMainTargets({ ctx: getAdvancedPassCtx(), key });
  }

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const k of keys) {
      if (enforceMainTargetsForClass(k)) changed = true;
    }
    if (!changed) break;
    rebuildTrackingFromSchedule();
  }

  /**
   * Swaps post-lunch main subjects into pre-lunch slots for better distribution.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any promotions were made.
   */
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
   * @returns {boolean} True if any clashes were resolved.
   */
  const unresolvedClashes = [];
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
      unresolvedClashes,
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

  /**
   * Fills empty pre-lunch slots that were skipped by earlier passes.
   * @returns {boolean} True if any slots were filled.
   */
  function fillEmptyPreLunch() {
    if (!hasFn(schedulerPassFillEmptyPreLunch)) return false;
    return schedulerPassFillEmptyPreLunch({ ctx: getAdvancedPassCtx() });
  }
  for (let pass = 0; pass < 3; pass++) {
    if (!fillEmptyPreLunch()) break;
    rebuildTrackingFromSchedule();
  }

  /**
   * Removes excess main-subject occurrences that exceed their weekly quota target.
   * @returns {boolean} True if any excess occurrences were removed.
   */
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
      getTeachersForCell,
      teacherClashKey,
    });
  }
  for (let pass = 0; pass < 3; pass++) {
    if (!clampMainsToTarget()) break;
    rebuildTrackingFromSchedule();
  }

  /**
   * Compacts post-lunch slots by shifting subjects earlier to eliminate mid-gap holes.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any slots were compacted.
   */
  function compactPostLunch(key) {
    if (!hasFn(schedulerPassCompactPostLunch)) return false;
    return schedulerPassCompactPostLunch({ ctx: getAdvancedPassCtx(), key });
  }
  /**
   * Compacts pre-lunch slots by shifting subjects to close interior gaps.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any slots were compacted.
   */
  function compactPreLunch(key) {
    if (!hasFn(schedulerPassCompactPreLunch)) return false;
    return schedulerPassCompactPreLunch({ ctx: getAdvancedPassCtx(), key });
  }
  /**
   * Combines pre- and post-lunch compaction to close all intra-day gaps.
   * @param {string} key - Class identifier.
   * @returns {boolean} True if any gaps were closed.
   */
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
   * @returns {boolean} True if any filler adjustments were made.
   */
  function enforceClassOneFillerTargets() {
    if (!hasFn(schedulerEnforceClassOneFillerTargets)) return false;
    return schedulerEnforceClassOneFillerTargets({ ctx: getAdvancedPassCtx() });
  }
  for (let pass = 0; pass < 2; pass++) {
    if (!enforceClassOneFillerTargets()) break;
    rebuildTrackingFromSchedule();
  }

  /* ═══════════════════════════════════════════════════════
     Section: FIXED SLOT ENFORCEMENT
  ═══════════════════════════════════════════════════════ */

  /**
   * Locks imported fixed slots into the schedule, overriding whatever was
   * previously placed and assigning the specified teacher.
   * @returns {boolean} True if any fixed slots were enforced.
   */
  function enforceImportedFixedSlots() {
    if (!hasFn(schedulerEnforceFixedSlots)) return false;
    return schedulerEnforceFixedSlots({ ctx: getAdvancedPassCtx() });
  }
  for (let pass = 0; pass < 2; pass++) {
    if (!enforceImportedFixedSlots()) break;
    rebuildTrackingFromSchedule();
  }

  // Final convergence loop — interleaves clash resolution with quota enforcement.
  // The clash resolver can displace mains (causing 4/5), and quota enforcement can
  // re-introduce clashes, so we iterate until both are stable.
  rebuildTrackingFromSchedule();
  for (let _conv = 0; _conv < 6; _conv++) {
    let anyChange = false;
    // 1. Resolve clashes
    for (let _fc = 0; _fc < 3; _fc++) {
      if (!resolveFinalTeacherClashes()) break;
      anyChange = true;
    }
    // 2. Re-enforce main targets (fixes 4/5 under-counts)
    rebuildTrackingFromSchedule();
    for (const k of keys) {
      if (enforceMainTargetsForClass(k)) anyChange = true;
    }
    // 3. Re-clamp excess mains (fixes 6/5 over-counts)
    rebuildTrackingFromSchedule();
    if (clampMainsToTarget()) {
      anyChange = true;
      rebuildTrackingFromSchedule();
    }
    if (!anyChange) break;
    rebuildTrackingFromSchedule();
  }

  // Surface unresolved clashes for the validation report.
  if (unresolvedClashes.length) {
    try {
      window.__ttUnresolvedClashes = unresolvedClashes;
      console.warn(
        `Scheduler: ${unresolvedClashes.length} unresolved teacher clash(es):`,
        unresolvedClashes
      );
    } catch {
      // Reporting is debug-only.
    }
  }

  /**
   * Validates the final post-lunch compaction: checks for mid-gap issues,
   * split lab blocks, and remaining cross-class teacher clashes.
   */
  function validatePostLunchCompaction() {
    if (!hasFn(schedulerValidateCompaction)) return;
    schedulerValidateCompaction({ ctx: getAdvancedPassCtx() });
  }

  validatePostLunchCompaction();

  /* ═══════════════════════════════════════════════════════
     Section: DOM RENDERING
  ═══════════════════════════════════════════════════════ */

  /**
   * Renders the finalized schedule for a class into the timetable DOM table.
   * @param {string} key - Class identifier.
   */
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
