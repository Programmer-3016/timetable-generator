/* exported schedulerCountOccurrences, schedulerGetTargetForShort */

/**
 * @module core/scheduler/counts.js
 * @description Count and target lookup helpers for scheduler passes.
 *
 * Note:
 * - Extracted from core/scheduler.js without behavior changes.
 */

function schedulerCountOccurrences({
  schedules,
  days,
  classesPerDay,
  key,
  short,
}) {
  let count = 0;
  for (let d = 0; d < days; d++) {
    for (let p = 0; p < classesPerDay; p++) {
      if (schedules[key][d][p] === short) count++;
    }
  }
  return count;
}

// Section: QUOTA LOOKUPS

/**
 * @description Returns the weekly target count for a subject short in a class.
 * @param {Object} params
 * @param {Object} params.weeklyQuota - Nested quota map (class → short → target).
 * @param {string} params.key - Class identifier.
 * @param {string} params.short - Subject short code.
 * @param {number} [params.defaultTarget=5] - Fallback target if quota is missing.
 * @returns {number} Target number of weekly slots.
 */
function schedulerGetTargetForShort({
  weeklyQuota,
  key,
  short,
  defaultTarget = 5,
}) {
  const q = weeklyQuota[key] && weeklyQuota[key][short];
  return Number.isFinite(q) && q > 0 ? q : defaultTarget;
}
