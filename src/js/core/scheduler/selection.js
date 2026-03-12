/* exported schedulerIsCommonFor, schedulerPreferredForSlot, schedulerPickLectureIndex */

/**
 * @module core/scheduler/selection.js
 * @description Slot/lecture selection helpers used by scheduler core.
 */

const schedulerSelectionFallbackRng = createSeededRandom(
  (Date.now() ^ 0x7f4a7c15) >>> 0
);

// Section: SLOT SELECTION HELPERS

/**
 * @description Checks if a teacher is shared across multiple classes (common teacher).
 * @param {Object} params
 * @param {string[]} params.keys - All class identifiers.
 * @param {Object} params.teacherSet - Per-class teacher sets.
 * @param {string} params.key - Current class identifier.
 * @param {string} params.teacher - Teacher name to check.
 * @returns {boolean} True if the teacher teaches in another class.
 */
function schedulerIsCommonFor({ keys, teacherSet, key, teacher }) {
  if (!teacher) return false;
  return keys.some(
    (k) => k !== key && teacherSet[k] && teacherSet[k].has(teacher)
  );
}

/**
 * @description Determines if a slot is preferred for a common teacher based on class index and time of day.
 * @param {Object} params - Keys, lunch index, cell coordinates, and teacher info.
 * @returns {boolean} True if the slot is preferred for load-balancing common teachers.
 */
function schedulerPreferredForSlot({
  keys,
  lunchClassIndex,
  key,
  day,
  col,
  teacher,
  isCommonFor,
}) {
  const pre = col < lunchClassIndex;
  const post = !pre;
  if (!isCommonFor(key, teacher)) return false;
  const classIdx = Math.max(0, keys.indexOf(key));
  if (classIdx === 0) return pre;
  if (classIdx === 1) return post;
  if (classIdx % 3 === 2) return day % 2 === 0 ? pre : post; // alternate
  return classIdx % 2 === 0 ? pre : post;
}

/**
 * @description Picks the best lecture index from the remaining list for a given slot using scoring heuristics.
 * @param {Object} params - Lecture list, slot info, constraints, and RNG function.
 * @returns {number} Index into the lecture list, or -1 if none qualifies.
 */
function schedulerPickLectureIndex({
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
  randomFn,
}) {
  const list = lectureList[key];
  let bestIdx = -1;
  let bestScore = Infinity;
  const rng =
    typeof randomFn === "function" ? randomFn : schedulerSelectionFallbackRng;
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
    const rnd = rng() * 0.2;
    const score =
      imbalanceAfter + pref + preLunchBias + quotaBias + p5Penalty + rnd;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}
