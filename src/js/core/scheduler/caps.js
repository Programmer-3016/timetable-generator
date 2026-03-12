/* exported schedulerEnsureTeacherPrePostBucket, schedulerGetFillerTotal, schedulerGetFillerCap, schedulerGetFillerSubjectCap */

/**
 * @module core/scheduler/caps.js
 * @description Small cap/bucket helpers used across scheduler passes.
 *
 * Note:
 * - Extracted from core/scheduler.js without behavior changes.
 */

function schedulerEnsureTeacherPrePostBucket({
  teacherPrePostByClass,
  classKey,
  teacher,
}) {
  if (!teacherPrePostByClass[classKey][teacher]) {
    teacherPrePostByClass[classKey][teacher] = {
      pre: 0,
      post: 0,
    };
  }
  return teacherPrePostByClass[classKey][teacher];
}

// Section: FILLER CAPACITY QUERIES

/**
 * @description Returns the total number of filler slots assigned for a class.
 * @param {Object} params
 * @param {Object} params.fillerCountsByClass - Filler counts keyed by class.
 * @param {string} params.classKey - Target class identifier.
 * @returns {number} Sum of all filler counts for the class.
 */
function schedulerGetFillerTotal({ fillerCountsByClass, classKey }) {
  const counts = fillerCountsByClass[classKey] || {};
  return Object.values(counts).reduce((a, b) => a + (b || 0), 0);
}

/**
 * @description Returns the overall filler capacity for a class.
 * @param {Object} params
 * @param {Object} params.fillerCapacityByClass - Capacity map keyed by class.
 * @param {string} params.classKey - Target class identifier.
 * @param {number} params.defaultCap - Fallback capacity.
 * @returns {number} Filler capacity for the class.
 */
function schedulerGetFillerCap({
  fillerCapacityByClass,
  classKey,
  defaultCap,
}) {
  return fillerCapacityByClass[classKey] ?? defaultCap;
}

/**
 * @description Returns the per-subject filler capacity for a class.
 * @param {Object} params
 * @param {Object} params.fillerPerSubjectCapByClass - Per-subject cap map keyed by class.
 * @param {string} params.classKey - Target class identifier.
 * @param {number} params.defaultCap - Fallback cap.
 * @returns {number} Per-subject filler capacity.
 */
function schedulerGetFillerSubjectCap({
  fillerPerSubjectCapByClass,
  classKey,
  defaultCap,
}) {
  return fillerPerSubjectCapByClass[classKey] ?? defaultCap;
}
