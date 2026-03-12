/* exported schedulerScoreCandidateObjective */

/**
 * @module core/scheduler/scoring.js
 * @description Quality scoring function for generated schedules — evaluates gap distribution,
 *   subject clustering, teacher load balance, and constraint satisfaction.
 */

// Section: SCHEDULE SCORING

function schedulerScoreCandidateObjective(scheduleState, validationResult = null) {
  const state =
    scheduleState ||
    (typeof window !== "undefined" ? window.__ttLastScheduleState : null);
  if (!state || !state.schedulesByClass) return -100;

  const validation = validationResult || schedulerIsFullyValid(state);
  const schedulesByClass = state.schedulesByClass || {};
  const keys =
    Array.isArray(state.keys) && state.keys.length ?
    state.keys.slice() :
    Object.keys(schedulesByClass);
  const days = Number.isFinite(state.days) ? state.days : 0;
  const classesPerDay = Number.isFinite(state.classesPerDay) ? state.classesPerDay : 0;
  const lunchClassIndex = Number.isFinite(state.lunchClassIndex) ?
    state.lunchClassIndex :
    Math.floor(classesPerDay / 2);
  const mainShortsByClass = state.mainShortsByClass || {};
  const isLabShortByClass = state.isLabShortByClass || {};
  const fillerShortsByClass = state.fillerShortsByClass || {};

  let score = 0;
  if (!validation.valid) score -= 100;

  // +10 balanced teacher load
  const loadByTeacher = {};
  keys.forEach((key) => {
    for (let d = 0; d < days; d++) {
      for (let c = 0; c < classesPerDay; c++) {
        const short =
          schedulesByClass[key] &&
          schedulesByClass[key][d] &&
          schedulesByClass[key][d][c] ?
          schedulesByClass[key][d][c] :
          null;
        if (!short) continue;
        const teachers = schedulerGetTeachersForValidationCell(state, key, short, d, c);
        teachers.forEach((teacher) => {
          const tk = schedulerTeacherValidationKey(state, teacher);
          if (!tk) return;
          loadByTeacher[tk] = (loadByTeacher[tk] || 0) + 1;
        });
      }
    }
  });
  const teacherLoads = Object.values(loadByTeacher);
  if (teacherLoads.length <= 1) {
    score += 10;
  } else {
    const mean = teacherLoads.reduce((a, b) => a + b, 0) / teacherLoads.length;
    const variance =
      teacherLoads.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) /
      teacherLoads.length;
    const stdDev = Math.sqrt(variance);
    const normalized = mean > 0 ? Math.max(0, 1 - stdDev / mean) : 0;
    score += 10 * normalized;
  }

  // +10 no consecutive 3 mains
  let tripleMainViolations = 0;
  keys.forEach((key) => {
    const mainSet = new Set(schedulerNormalizeList(mainShortsByClass[key]).filter(Boolean));
    const fillerSet = new Set(schedulerNormalizeList(fillerShortsByClass[key]).filter(Boolean));
    for (let d = 0; d < days; d++) {
      for (let c = 0; c + 2 < classesPerDay; c++) {
        const a = schedulesByClass[key]?.[d]?.[c] || null;
        const b = schedulesByClass[key]?.[d]?.[c + 1] || null;
        const e = schedulesByClass[key]?.[d]?.[c + 2] || null;
        // Returns true if the short is a main (non-filler, non-lab) subject
        const isMain = (short) =>
          !!(
            short &&
            !fillerSet.has(short) &&
            !(isLabShortByClass[key] && isLabShortByClass[key][short]) &&
            (mainSet.size ? mainSet.has(short) : true)
          );
        if (isMain(a) && isMain(b) && isMain(e)) tripleMainViolations++;
      }
    }
  });
  score += tripleMainViolations === 0 ? 10 : Math.max(0, 10 - tripleMainViolations * 2);

  // +5 even post-lunch distribution
  let distributionScore = 0;
  if (keys.length) {
    let normalizedSum = 0;
    keys.forEach((key) => {
      const counts = [];
      for (let d = 0; d < days; d++) {
        let occupied = 0;
        for (let c = lunchClassIndex; c < classesPerDay; c++) {
          if (schedulesByClass[key]?.[d]?.[c]) occupied++;
        }
        counts.push(occupied);
      }
      if (!counts.length) return;
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance =
        counts.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) /
        counts.length;
      const normalized = Math.max(0, 1 - variance / Math.max(1, classesPerDay));
      normalizedSum += normalized;
    });
    distributionScore = (normalizedSum / Math.max(1, keys.length)) * 5;
  }
  score += distributionScore;

  return Number(score.toFixed(4));
}
