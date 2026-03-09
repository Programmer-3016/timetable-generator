/**
 * @module core/scheduler/bootstrap.js
 * @description Bootstrap helpers for scheduler initialization.
 *
 * Note:
 * - Extracted from core/scheduler.js without behavior changes.
 */

// Section: TEACHER MAP BUILDING

function schedulerBuildTeacherFoldMapFromData({
  data,
  buildTeacherFoldMapFromRawNames,
}) {
  const names = [];
  data.forEach(({ pairs }) => {
    (pairs || []).forEach((p) => {
      if (p.teacher && p.teacher.trim()) names.push(p.teacher);
      if (Array.isArray(p.teachers)) {
        p.teachers.forEach((t) => {
          if (t && t.trim()) names.push(t);
        });
      }
    });
  });
  return buildTeacherFoldMapFromRawNames(names);
}

/**
 * @description Builds a global short→teacher map; only shorts with exactly one teacher are included.
 * @param {Object} params
 * @param {Array} params.data - Class data entries, each containing subject pairs.
 * @returns {Object} Map of short code to unique teacher name.
 */
function schedulerBuildGlobalTeacherForShort({ data }) {
  const teacherForShortGlobal = {};
  const shortToTeachers = {};
  data.forEach(({ pairs }) => {
    (pairs || []).forEach((p) => {
      const sh = p.short;
      if (!shortToTeachers[sh]) shortToTeachers[sh] = new Set();
      if (p.teacher) shortToTeachers[sh].add(p.teacher);
    });
  });
  Object.entries(shortToTeachers).forEach(([sh, set]) => {
    if (set.size === 1) teacherForShortGlobal[sh] = Array.from(set)[0];
  });
  return teacherForShortGlobal;
}

// Section: LAB CAPACITY

/**
 * @description Reads lab capacity from the DOM; falls back to a default if unavailable.
 * @param {Object} [params]
 * @param {number} [params.defaultCapacity=3] - Default capacity when DOM value is missing.
 * @returns {number} Lab capacity value.
 */
function schedulerReadLabCapacityFromDom({ defaultCapacity = 3 } = {}) {
  try {
    const v = parseInt(document.getElementById("labCount")?.value, 10);
    return Number.isFinite(v) && v > 0 ? v : defaultCapacity;
  } catch (_e) {
    return defaultCapacity;
  }
}

// Section: FILLER CAPACITY

/**
 * @description Computes total and per-subject filler capacity for a class.
 * @param {Object} params - Class key, filler shorts, quotas, and slot configuration.
 * @returns {{ totalFillerCap: number, perSubjectFillerCap: number }}
 */
function schedulerComputeFillerCapacityForClass({
  classKey,
  fillerShortsByClass,
  lectureList,
  weeklyQuota,
  pairsByClass,
  isLabPair,
  fillerTargetsByClass,
  totalSlotsPerClass,
  minWeeklyCap,
  perSubjectCap,
}) {
  const set =
    (fillerShortsByClass && fillerShortsByClass[classKey]) || new Set();
  const fillerCount = set.size;
  if (!fillerCount) {
    return {
      totalFillerCap: 0,
      perSubjectFillerCap: 0,
    };
  }

  // Total weekly lecture slots targeted for this class
  const lectureTargetTotal = (lectureList[classKey] || []).reduce(
    (sum, s) => sum + ((weeklyQuota[classKey] && weeklyQuota[classKey][s.short]) || 0),
    0
  );
  // Subject–teacher pairs assigned to this class
  const classPairs = (pairsByClass && pairsByClass[classKey]) || [];
  const labTeachers = new Set();
  classPairs.forEach((p) => {
    if (!isLabPair(p)) return;
    const t = (p.teacher || "").trim(); // normalized teacher name
    labTeachers.add(t || `__${p.short}`);
  });
  const estimatedLabSlots = labTeachers.size * 2;
  const declaredFillerTargetTotal = Object.values(
    fillerTargetsByClass[classKey] || {}
  ).reduce((a, b) => a + (b || 0), 0);
  const requiredFillerSlots = Math.max(
    0,
    totalSlotsPerClass - lectureTargetTotal - estimatedLabSlots
  );
  const totalFillerCap = Math.max(
    minWeeklyCap,
    declaredFillerTargetTotal,
    requiredFillerSlots
  );
  return {
    totalFillerCap,
    perSubjectFillerCap: perSubjectCap,
  };
}
