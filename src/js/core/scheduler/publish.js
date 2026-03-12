/* exported schedulerMergeTeacherAggregateStats, schedulerBuildPublishedState */

/**
 * @module core/scheduler/publish.js
 * @description Post-schedule helpers for aggregate teacher stats and global state publish.
 *
 * Note:
 * - Extracted from core/scheduler.js without scheduling-logic changes.
 */

function schedulerMergeTeacherAggregateStats({
  data,
  teacherTheoryCount,
  teacherLabBlocks,
  teacherMinutes,
  teacherFirstPeriodCount,
  aggregateStats,
  normalizeTeacherName,
}) {
  const allTeachers = new Set();
  data.forEach(({ pairs }) =>
    pairs.forEach((p) => {
      if (p.teacher && p.teacher.trim()) allTeachers.add(p.teacher);
      if (Array.isArray(p.teachers)) {
        p.teachers.forEach((t) => {
          if (t && t.trim()) allTeachers.add(t);
        });
      }
    })
  );
  [
    teacherTheoryCount,
    teacherLabBlocks,
    teacherMinutes,
    teacherFirstPeriodCount,
  ].forEach((obj) => {
    Object.keys(obj || {}).forEach((t) => {
      if (t && t.trim()) allTeachers.add(t);
    });
  });
  allTeachers.forEach((t) => {
    const k = normalizeTeacherName(t);
    if (!aggregateStats[k])
      aggregateStats[k] = {
        display: t,
        theory: 0,
        labs: 0,
        minutes: 0,
        first: 0,
      };
    if (
      t &&
      aggregateStats[k].display &&
      t.length > aggregateStats[k].display.length
    ) {
      aggregateStats[k].display = t;
    }
    const labBlocks = teacherLabBlocks[t] || 0;
    const rawMins = teacherMinutes[t] || 0; // includes labs as 2 periods worth
    aggregateStats[k].theory += teacherTheoryCount[t] || 0;
    aggregateStats[k].labs += labBlocks;
    aggregateStats[k].minutes += rawMins;
    aggregateStats[k].first += teacherFirstPeriodCount[t] || 0;
  });
}

// Section: STATE PUBLISHING

/**
 * @description Packages per-class schedule data into a published state object for downstream consumers.
 * @param {Object} params - Class keys, schedules, teacher/subject maps, lab info, and filler shorts.
 * @returns {Object} Published state snapshot.
 */
function schedulerBuildPublishedState({
  keys,
  schedules,
  teacherForShort,
  subjectByShort,
  labsAtSlot,
  assignedTeacher,
  labNumberAssigned,
  fillerShortsByClass,
}) {
  const schedulesByClass = {};
  const teacherForShortByClass = {};
  const subjectByShortByClass = {};
  keys.forEach((k) => {
    schedulesByClass[k] = schedules[k];
    teacherForShortByClass[k] = teacherForShort[k];
    subjectByShortByClass[k] = subjectByShort[k];
  });

  return {
    schedulesByClass,
    teacherForShortByClass,
    subjectByShortByClass,
    enabledKeys: keys.slice(),
    labsAtSlot,
    assignedTeacher,
    labNumberAssigned,
    fillerShortsByClass: fillerShortsByClass || {},
  };
}
