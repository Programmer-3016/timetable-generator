/**
 * @module core/scheduler/passes-advanced.js
 * @description Advanced fill/balance pass helpers extracted from scheduler core.
 *
 * Note:
 * - Logic is copied from src/js/core/scheduler.js without behavior changes.
 */

// Section: AGGRESSIVE FILL PASS

function schedulerPassFillRemaining({ ctx, key }) {
  const {
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
    keys,
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    for (let d = 0; d < days; d++) {
      for (let c = 0; c < classesPerDay; c++) {
        if (schedules[key][d][c] !== null) continue;
        const idx = pickLectureIndex(key, d, c);
        if (idx !== -1) {
          const pick = lectureList[key][idx];
          const chosen = pickTeacherForSlot(key, pick.short, d, c, {
            allowNoTeacher: false,
          });
          if (chosen === null) continue;
          schedules[key][d][c] = pick.short;
          assignedTeacher[key][d][c] = chosen;
          perDayUsed[key][d].add(pick.short);
          pick.remaining--;
          const t = chosen;
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
        }
      }
    }

}

/** Aggressively fills empty slots by trying remaining lectures first, then filler subjects ranked by deficit. */
function schedulerPassAggressiveFill({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const fillerShorts = fillerShortsByClass[key] || new Set();
    const fillerPerDayCount = Array.from({
      length: days
    }, () => ({}));
    for (let d = 0; d < days; d++) {
      for (let c = 0; c < classesPerDay; c++) {
        if (schedules[key][d][c] !== null) continue;
        // step: build sorted candidate list from lectures with remaining quota
        const candidates = lectureList[key]
          .map((s, i) => ({
            ...s,
            i
          }))
          .filter(
            (s) =>
            s.remaining > 0 &&
            !perDayUsed[key][d].has(s.short) &&
            canAssign(key, s.short, d, c)
          )
          .sort((a, b) => b.remaining - a.remaining);
        let pick = candidates[0];
        // step: try filler subjects when no regular lecture candidate is available
        if (!pick) {
          const fillerWindowStart = Math.max(0, classesPerDay - 2);
          if (
            !pick &&
            fillerShorts.size &&
            c >= fillerWindowStart &&
            getFillerTotal(key) < getFillerCap(key)
          ) {
            const targets = fillerTargetsByClass[key] || {};
            const counts = fillerCountsByClass[key] || {};
            const ranked = Array.from(fillerShorts)
              .map((f) => ({
                f,
                deficit: (targets[f] || 0) - (counts[f] || 0),
                perDay: fillerPerDayCount[d][f] || 0,
              }))
              .filter((x) => (fillerPerDayCount[d][x.f] || 0) < 2)
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
                teacherForShort[key][f] ||
                teacherForShortGlobal[f] ||
                null;
              if (
                !canAssign(key, f, d, c, {
                  allowOverClassCap: true,
                  allowNoTeacher: !tF,
                })
              )
                continue;
              pick = {
                short: f,
                teacher: tF,
                i: -1
              };
              break;
            }
          }
          if (!pick) continue;
        }
        // step: assign chosen subject to the slot and pick a teacher
        schedules[key][d][c] = pick.short;
        const chosen = pickTeacherForSlot(key, pick.short, d, c, {
          allowNoTeacher: fillerShorts.has(pick.short),
        });
        if (chosen === null && !fillerShorts.has(pick.short)) {
          schedules[key][d][c] = null;
          continue;
        }
        assignedTeacher[key][d][c] = chosen;
        if (!fillerShorts.has(pick.short))
          perDayUsed[key][d].add(pick.short);
        if (pick.i !== -1) lectureList[key][pick.i].remaining--;
        // step: update teacher workload counters (theory, minutes, first-period)
        const t = chosen;
        if (t) {
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
        }
        if (fillerShorts.has(pick.short)) {
          fillerCountsByClass[key][pick.short] =
            (fillerCountsByClass[key][pick.short] || 0) + 1;
          fillerPerDayCount[d][pick.short] =
            (fillerPerDayCount[d][pick.short] || 0) + 1;
        }
      }
    }

}

// Section: POST-LUNCH FILLER SWEEP

/** Sweeps post-lunch trailing slots and fills them with filler subjects, ranked by target deficit. */
function schedulerPassPostLunchFillerSweep({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const fillerShorts = fillerShortsByClass[key] || new Set();
    if (!fillerShorts || fillerShorts.size === 0) return;
    const fillerPerDayCount = Array.from({
      length: days
    }, () => ({}));
    for (let d = 0; d < days; d++) {
      const fillerWindowStart = Math.max(0, classesPerDay - 2);
      for (let c = fillerWindowStart; c < classesPerDay; c++) {
        if (schedules[key][d][c] !== null) continue;
        if (getFillerTotal(key) >= getFillerCap(key)) break;
        const targets = fillerTargetsByClass[key] || {};
        const counts = fillerCountsByClass[key] || {};
        const ranked = Array.from(fillerShorts)
          .map((f) => ({
            f,
            deficit: (targets[f] || 0) - (counts[f] || 0),
            perDay: fillerPerDayCount[d][f] || 0,
          }))
          .filter((x) => (fillerPerDayCount[d][x.f] || 0) < 2)
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
          const chosen = pickTeacherForSlot(key, f, d, c, {
            allowNoTeacher: true,
            allowOverClassCap: true,
          });
          if (chosen === null) continue;
          schedules[key][d][c] = f;
          assignedTeacher[key][d][c] = chosen;
          if (chosen) {
            teacherMinutes[chosen] =
              (teacherMinutes[chosen] || 0) + minsPerPeriod;
            if (c === 0)
              teacherFirstPeriodCount[chosen] =
              (teacherFirstPeriodCount[chosen] || 0) + 1;
            teacherAssignedPerDayByClass[key][d][chosen] =
              (teacherAssignedPerDayByClass[key][d][chosen] || 0) + 1;
            ensureTP(key, chosen)[c < lunchClassIndex ? "pre" : "post"]++;
          }
          fillerCountsByClass[key][f] =
            (fillerCountsByClass[key][f] || 0) + 1;
          fillerPerDayCount[d][f] = (fillerPerDayCount[d][f] || 0) + 1;
          break; // move to next slot
        }
      }
    }

}

// Section: GAP SEAL PASS

/** Seals remaining schedule gaps by placing available lectures, relaxing constraints for the first post-lunch slot. */
function schedulerPassGapSealFill({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    for (let d = 0; d < days; d++) {
      for (let c = 0; c < classesPerDay; c++) {
        if (schedules[key][d][c] !== null) continue;
        let candidates = lectureList[key]
          .map((s, i) => ({
            ...s,
            i
          }))
          .filter(
            (s) =>
            s.remaining > 0 &&
            !perDayUsed[key][d].has(s.short) &&
            canAssign(key, s.short, d, c, {
              allowOverClassCap: true
            })
          )
          .sort((a, b) => b.remaining - a.remaining);
        let pick = candidates[0];
        if (!pick) {
          const isFirstPostLunch = c === lunchClassIndex; // e.g., P5 when lunch is after P4
          if (isFirstPostLunch) {
            candidates = lectureList[key]
              .map((s, i) => ({
                ...s,
                i
              }))
              .filter(
                (s) =>
                s.remaining > 0 &&
                !perDayUsed[key][d].has(s.short) &&
                canAssign(key, s.short, d, c, {
                  allowOverClassCap: true,
                  allowOverPerDayByClassCap: true,
                })
              )
              .sort((a, b) => b.remaining - a.remaining);
            pick = candidates[0] || null;
          }
        }
        if (!pick) continue; // leave as gap if still no one fits
        schedules[key][d][c] = pick.short;
        const chosen = pickTeacherForSlot(key, pick.short, d, c, {
          allowOverClassCap: true,
        });
        if (chosen === null) {
          schedules[key][d][c] = null;
          continue;
        }
        assignedTeacher[key][d][c] = chosen;
        perDayUsed[key][d].add(pick.short);
        lectureList[key][pick.i].remaining--;
        const t = chosen;
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
      }
    }

}

// Section: POST-LUNCH GAP FIX

/**
 * Final fix pass for post-lunch gaps: moves theory subjects from late slots
 * into the first post-lunch period, back-filling vacated slots with fillers.
 */
function schedulerPassFinalPostLunchGapFix({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const fillerShorts = fillerShortsByClass[key] || new Set();
    const fillerWindowStart = Math.max(0, classesPerDay - 2);

    /** Attempts to refill a single vacated slot with a remaining lecture or filler subject. */
    function tryRefillSlot(day, col) {
      // step: find highest-remaining lecture that passes standard assignment checks
      let list = lectureList[key]
        .map((s, i) => ({
          ...s,
          i
        }))
        .filter(
          (s) =>
          s.remaining > 0 &&
          !perDayUsed[key][day].has(s.short) &&
          canAssign(key, s.short, day, col, {
            allowOverClassCap: true
          })
        )
        .sort((a, b) => b.remaining - a.remaining);
      let pick = list[0] || null;
      // step: fallback — relax per-day-by-class cap and retry candidate search
      if (!pick) {
        list = lectureList[key]
          .map((s, i) => ({
            ...s,
            i
          }))
          .filter(
            (s) =>
            s.remaining > 0 &&
            !perDayUsed[key][day].has(s.short) &&
            canAssign(key, s.short, day, col, {
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
            })
          )
          .sort((a, b) => b.remaining - a.remaining);
        pick = list[0] || null;
      }
      // step: assign chosen lecture and update all teacher/schedule counters
      if (pick) {
        const chosen = pickTeacherForSlot(key, pick.short, day, col, {
          allowOverClassCap: true,
          allowOverPerDayByClassCap: true,
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
        return true;
      }
      // step: try placing a filler subject in trailing (post-lunch) window slots
      const fillerWindowStartLocal = Math.max(0, classesPerDay - 2);
      if (
        col >= fillerWindowStartLocal &&
        fillerShorts.size &&
        getFillerTotal(key) < getFillerCap(key)
      ) {
        const targets = fillerTargetsByClass[key] || {};
        const counts = fillerCountsByClass[key] || {};
        const ranked = Array.from(fillerShorts)
          .map((f) => ({
            f,
            deficit: (targets[f] || 0) - (counts[f] || 0),
            perDay: schedules[key][day]
              .slice(fillerWindowStartLocal)
              .filter((x) => x === f).length,
          }))
          .filter((x) => x.perDay < 2)
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
          const already = schedules[key][day]
            .slice(fillerWindowStartLocal)
            .filter((x) => x === f).length;
          if (already >= 2) continue;
          if ((counts[f] || 0) >= getFillerSubjectCap(key))
            continue;
          const tF =
            teacherForShort[key][f] || teacherForShortGlobal[f] || null;
          if (
            !canAssign(key, f, day, col, {
              allowOverClassCap: true,
              allowNoTeacher: !tF,
            })
          )
            continue;
          const chosen = pickTeacherForSlot(key, f, day, col, {
            allowNoTeacher: true,
            allowOverClassCap: true,
          });
          if (chosen === null) continue;
          schedules[key][day][col] = f;
          assignedTeacher[key][day][col] = chosen;
          if (chosen) {
            teacherMinutes[chosen] =
              (teacherMinutes[chosen] || 0) + minsPerPeriod;
            if (col === 0)
              teacherFirstPeriodCount[chosen] =
              (teacherFirstPeriodCount[chosen] || 0) + 1;
            teacherAssignedPerDayByClass[key][day][chosen] =
              (teacherAssignedPerDayByClass[key][day][chosen] || 0) + 1;
            ensureTP(key, chosen)[
              col < lunchClassIndex ? "pre" : "post"
            ]++;
          }
          if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
          fillerCountsByClass[key][f] =
            (fillerCountsByClass[key][f] || 0) + 1;
          return true;
        }
      }
      // step: pre-lunch filler fallback when post-lunch window was not eligible
      if (
        col < lunchClassIndex &&
        fillerShorts.size &&
        getFillerTotal(key) < getFillerCap(key)
      ) {
        const targets = fillerTargetsByClass[key] || {};
        const counts = fillerCountsByClass[key] || {};
        const ranked = Array.from(fillerShorts)
          .map((f) => ({
            f,
            deficit: (targets[f] || 0) - (counts[f] || 0),
          }))
          .sort((a, b) => b.deficit - a.deficit);
        for (const {
            f
          }
          of ranked) {
          if ((counts[f] || 0) >= getFillerSubjectCap(key))
            continue;
          const tF =
            teacherForShort[key][f] || teacherForShortGlobal[f] || null;
          if (
            !canAssign(key, f, day, col, {
              allowOverClassCap: true,
              allowNoTeacher: !tF,
            })
          )
            continue;
          const chosen = pickTeacherForSlot(key, f, day, col, {
            allowNoTeacher: true,
            allowOverClassCap: true,
          });
          if (chosen === null) continue;
          schedules[key][day][col] = f;
          assignedTeacher[key][day][col] = chosen;
          if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
          fillerCountsByClass[key][f] =
            (fillerCountsByClass[key][f] || 0) + 1;
          if (chosen) {
            teacherMinutes[chosen] =
              (teacherMinutes[chosen] || 0) + minsPerPeriod;
            teacherAssignedPerDayByClass[key][day][chosen] =
              (teacherAssignedPerDayByClass[key][day][chosen] || 0) + 1;
            ensureTP(key, chosen)["pre"]++;
          }
          return true;
        }
      }
      return false;
    }

    for (let d = 0; d < days; d++) {
      const p5 = lunchClassIndex; // first slot after lunch
      if (schedules[key][d][p5] !== null) continue;

      let moved = false;
      for (let c = fillerWindowStart; c < classesPerDay; c++) {
        const short = schedules[key][d][c];
        if (!short) continue;
        if (isLabShort[key][short]) continue; // skip labs
        if (fillerShorts.has(short)) continue; // skip fillers
        if (
          !canAssign(key, short, d, p5, {
            allowOverClassCap: true,
            allowOverPerDayByClassCap: true,
          })
        )
          continue;
        const movedTeacher =
          assignedTeacher[key][d][c] === undefined ?
          null :
          assignedTeacher[key][d][c];
        schedules[key][d][c] = null;
        schedules[key][d][p5] = short;
        assignedTeacher[key][d][p5] = movedTeacher;
        assignedTeacher[key][d][c] = null;
        moved = true;
        break;
      }

      if (!moved) {
        const cols = Array.from({
            length: classesPerDay
          },
          (_, i) => i
        ).filter((i) => i !== p5);
        cols.sort((a, b) => {
          const ap = a < lunchClassIndex ? 0 : 1;
          const bp = b < lunchClassIndex ? 0 : 1;
          if (ap !== bp) return bp - ap; // post-lunch first
          return b - a; // later first
        });
        for (const c of cols) {
          if (periodTimings[classIndices[c]].type !== "class") continue;
          const short = schedules[key][d][c];
          if (!short) continue;
          if (isLabShort[key][short]) continue;
          if (fillerShorts.has(short)) continue;
          if (
            !canAssign(key, short, d, p5, {
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
            })
          )
            continue;
          const movedTeacher =
            assignedTeacher[key][d][c] === undefined ?
            null :
            assignedTeacher[key][d][c];
          schedules[key][d][c] = null;
          schedules[key][d][p5] = short;
          assignedTeacher[key][d][p5] = movedTeacher;
          assignedTeacher[key][d][c] = null;
          const ok = tryRefillSlot(d, c);
          if (ok) {
            if (c < lunchClassIndex) {
              recordMainPostLunchIfNeeded(key, short, p5);
            }
            moved = true;
            break;
          }
          schedules[key][d][p5] = null;
          schedules[key][d][c] = short;
        }
      }
    }

}

/** Fills remaining null post-lunch slots with filler subjects ranked by target deficit. */
function schedulerPassFillPostLunchGaps({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const fillerShorts =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    if (!fillerShorts.size) return;
    const fillerStart = lunchClassIndex;
    for (let d = 0; d < days; d++) {
      for (let c = fillerStart; c < classesPerDay; c++) {
        if (schedules[key][d][c] !== null) continue;
        let placed = false;
        /** Tries to place the highest-deficit filler into the current post-lunch slot. */
        const tryPlace = (ignoreCap = false) => {
          const targets = fillerTargetsByClass[key] || {};
          const counts = fillerCountsByClass[key] || {};
          const ranked = Array.from(fillerShorts)
            .map((f) => ({
              f,
              deficit: (targets[f] || 0) - (counts[f] || 0),
              perDay: schedules[key][d]
                .slice(Math.max(0, classesPerDay - 2))
                .filter((x) => x === f).length,
            }))
            .filter((x) => x.perDay < 2)
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
            if (getFillerTotal(key) >= getFillerCap(key)) break;
            if ((counts[f] || 0) >= getFillerSubjectCap(key))
              continue;
            const chosen = pickTeacherForSlot(key, f, d, c, {
              allowNoTeacher: true,
              allowOverClassCap: true,
            });
            if (chosen === null) continue;
            schedules[key][d][c] = f;
            assignedTeacher[key][d][c] = chosen;
            if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
            fillerCountsByClass[key][f] =
              (fillerCountsByClass[key][f] || 0) + 1;
            if (chosen) {
              teacherMinutes[chosen] =
                (teacherMinutes[chosen] || 0) + minsPerPeriod;
            }
            placed = true;
            break;
          }
          return placed;
        };
        if (tryPlace(false)) continue; // placed
        tryPlace(true);
      }
    }

}

// Section: DAILY SUBJECT ENFORCEMENT

/**
 * Ensures every subject with remaining lectures is placed at least once per day,
 * displacing fillers if necessary to meet daily coverage.
 */
function schedulerPassEnsureSubjectDailyFive({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const fillerShorts =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    /** Returns true if the short is a main (non-filler, non-lab) subject. */
    const isMain = (sh) =>
      sh && !fillerShorts.has(sh) && !isLabShort[key][sh];
    const fillerStart = Math.max(lunchClassIndex + 1, classesPerDay - 2);
    const subjects = lectureList[key].map((s, i) => ({
      ...s,
      i
    }));
    for (let sIdx = 0; sIdx < subjects.length; sIdx++) {
      let subj = subjects[sIdx];
      let guard = 0;
      while (subj.remaining > 0 && guard < days * 2) {
        guard++;
        let placedDay = -1;
        for (let d = 0; d < days; d++) {
          if (perDayUsed[key][d].has(subj.short)) continue; // 1/day rule
          // step: scan pre-lunch slots for an empty assignable position
          let done = false;
          for (let c = 0; c < lunchClassIndex; c++) {
            if (periodTimings[classIndices[c]].type !== "class") continue;
            if (schedules[key][d][c] !== null) continue;
            if (!canAssign(key, subj.short, d, c) && !canAssign(key, subj.short, d, c, {
                allowOverPerDayByClassCap: true
              })) continue;

            schedules[key][d][c] = subj.short;
            perDayUsed[key][d].add(subj.short);
            lectureList[key][subj.i].remaining--;
            const t = subj.teacher;
            if (t !== undefined) assignedTeacher[key][d][c] = t;
            if (t) {
              teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
              teacherTheoryCountByClass[key][t] = (teacherTheoryCountByClass[key][t] || 0) + 1;
              teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
              if (c === 0) teacherFirstPeriodCount[t] = (teacherFirstPeriodCount[t] || 0) + 1;
              teacherAssignedPerDayByClass[key][d][t] = (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
              ensureTP(key, t)[c < lunchClassIndex ? "pre" : "post"]++;
            }
            placedDay = d;
            done = true;
            break;
          }
          if (done) break;
          // step: try the first post-lunch slot if no pre-lunch slot worked
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
            lectureList[key][subj.i].remaining--;
            const t = subj.teacher;
            if (t !== undefined) assignedTeacher[key][d][p5] = t;
            teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
            teacherTheoryCountByClass[key][t] =
              (teacherTheoryCountByClass[key][t] || 0) + 1;
            teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
            teacherAssignedPerDayByClass[key][d][t] =
              (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
            ensureTP(key, t)["post"]++;
            recordMainPostLunchIfNeeded(key, subj.short, p5);
            placedDay = d;
            break;
          }
          // step: evict a trailing filler and replace with this subject
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
            if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
            if (fillerCountsByClass[key][fsh])
              fillerCountsByClass[key][fsh]--;
            schedules[key][d][c] = subj.short;
            perDayUsed[key][d].add(subj.short);
            lectureList[key][subj.i].remaining--;
            const t = subj.teacher;
            if (t !== undefined) assignedTeacher[key][d][c] = t;
            teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
            teacherTheoryCountByClass[key][t] =
              (teacherTheoryCountByClass[key][t] || 0) + 1;
            teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
            teacherAssignedPerDayByClass[key][d][t] =
              (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
            ensureTP(key, t)["post"]++;
            recordMainPostLunchIfNeeded(key, subj.short, c);
            placedDay = d;
            break;
          }
          if (placedDay !== -1) break;
        }
        if (placedDay === -1) break; // no more legal placements available for this subject
        subj = lectureList[key][subj.i]; // refresh remaining
      }
    }

}

/** Guarantees every day has at least one main subject, placing into empty or filler-occupied slots. */
function schedulerPassEnsureAtLeastOneMainPerDay({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const fillerShorts =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    /** Returns true if the short is a main (non-filler, non-lab) subject. */
    const isMain = (sh) =>
      sh && !fillerShorts.has(sh) && !isLabShort[key][sh];
    const fillerStart = Math.max(lunchClassIndex + 1, classesPerDay - 2);
    for (let d = 0; d < days; d++) {
      // step: check if this day already has at least one main subject
      let hasMain = false;
      for (let c = 0; c < classesPerDay && !hasMain; c++) {
        const sh = schedules[key][d][c];
        if (isMain(sh)) hasMain = true;
      }
      if (hasMain) continue;
      // step: try placing a main lecture in an empty pre-lunch slot
      let placed = false;
      for (let c = 0; c < lunchClassIndex && !placed; c++) {
        if (periodTimings[classIndices[c]].type !== "class") continue;
        if (schedules[key][d][c] !== null) continue;
        const idx =
          lectureList[key]
          .map((s, i) => ({
            ...s,
            i
          }))
          .filter(
            (s) =>
            s.remaining > 0 &&
            !perDayUsed[key][d].has(s.short) &&
            canAssign(key, s.short, d, c)
          )
          .sort((a, b) => b.remaining - a.remaining)[0]?.i ?? -1;
        if (idx !== -1) {
          const pick = lectureList[key][idx];
          schedules[key][d][c] = pick.short;
          perDayUsed[key][d].add(pick.short);
          lectureList[key][idx].remaining--;
          const t = pick.teacher;
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
          placed = true;
        }
      }
      if (placed) continue;
      // step: try the first post-lunch slot as an alternative placement
      const p5 = lunchClassIndex;
      if (p5 < classesPerDay && schedules[key][d][p5] === null) {
        const idx =
          lectureList[key]
          .map((s, i) => ({
            ...s,
            i
          }))
          .filter(
            (s) =>
            s.remaining > 0 &&
            !perDayUsed[key][d].has(s.short) &&
            canAssign(key, s.short, d, p5)
          )
          .sort((a, b) => b.remaining - a.remaining)[0]?.i ?? -1;
        if (idx !== -1) {
          const pick = lectureList[key][idx];
          schedules[key][d][p5] = pick.short;
          perDayUsed[key][d].add(pick.short);
          lectureList[key][idx].remaining--;
          const t = pick.teacher;
          teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
          teacherTheoryCountByClass[key][t] =
            (teacherTheoryCountByClass[key][t] || 0) + 1;
          teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
          teacherAssignedPerDayByClass[key][d][t] =
            (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
          ensureTP(key, t)["post"]++;
          recordMainPostLunchIfNeeded(key, pick.short, p5);
          continue;
        }
      }
      // step: evict a trailing filler and replace it with a main lecture
      for (let c = fillerStart; c < classesPerDay; c++) {
        const fsh = schedules[key][d][c];
        if (!fsh || !fillerShorts.has(fsh)) continue;
        const idx =
          lectureList[key]
          .map((s, i) => ({
            ...s,
            i
          }))
          .filter(
            (s) =>
            s.remaining > 0 &&
            !perDayUsed[key][d].has(s.short) &&
            canAssign(key, s.short, d, c)
          )
          .sort((a, b) => b.remaining - a.remaining)[0]?.i ?? -1;
        if (idx === -1) continue;
        schedules[key][d][c] = null;
        if (!fillerCountsByClass[key]) fillerCountsByClass[key] = {};
        if (fillerCountsByClass[key][fsh])
          fillerCountsByClass[key][fsh]--;
        const pick = lectureList[key][idx];
        schedules[key][d][c] = pick.short;
        perDayUsed[key][d].add(pick.short);
        lectureList[key][idx].remaining--;
        const t = pick.teacher;
        teacherTheoryCount[t] = (teacherTheoryCount[t] || 0) + 1;
        teacherTheoryCountByClass[key][t] =
          (teacherTheoryCountByClass[key][t] || 0) + 1;
        teacherMinutes[t] = (teacherMinutes[t] || 0) + minsPerPeriod;
        teacherAssignedPerDayByClass[key][d][t] =
          (teacherAssignedPerDayByClass[key][d][t] || 0) + 1;
        ensureTP(key, t)["post"]++;
        recordMainPostLunchIfNeeded(key, pick.short, c);
        break;
      }
    }

}

// Section: SPARSE SCHEDULE RECOVERY

/**
 * Detects sparse schedules (<60% filled or any main below 4 occurrences)
 * and force-promotes mains into empty, filler, or over-represented main slots.
 */
function schedulerPassFillSparseSchedule({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const totalSlots = days * classesPerDay;
    const mainSet =
      (mainShortsByClass && mainShortsByClass[key]) || new Set();
    if (!mainSet.size) {
      Object.keys(weeklyQuota[key] || {}).forEach((sh) => {
        if (
          fillerShortsByClass &&
          fillerShortsByClass[key] &&
          fillerShortsByClass[key].has(sh)
        )
          return;
        if (isLabShort[key] && isLabShort[key][sh]) return;
        if ((weeklyQuota[key][sh] || 0) >= 5) {
          if (!mainShortsByClass[key]) mainShortsByClass[key] = new Set();
          mainShortsByClass[key].add(sh);
        }
      });
    }
    const mains = Array.from(
      (mainShortsByClass && mainShortsByClass[key]) || []
    );
    if (!mains.length) return; // nothing to promote
    let filledCount = 0;
    for (let d = 0; d < days; d++)
      for (let p = 0; p < classesPerDay; p++)
        if (schedules[key][d][p] !== null) filledCount++;
    /** Counts how many times a given short appears in the current class schedule. */
    const countOcc = (sh) => {
      let c = 0;
      for (let d = 0; d < days; d++)
        for (let p = 0; p < classesPerDay; p++)
          if (schedules[key][d][p] === sh) c++;
      return c;
    };
    const sparse =
      filledCount < totalSlots * 0.6 ||
      mains.some((m) => countOcc(m) < 4);
    if (!sparse) return;
    mains.sort((a, b) => countOcc(a) - countOcc(b));
    const fillerSet =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    const emptySlots = [];
    const fillerSlots = [];
    const replaceableMainSlots = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < classesPerDay; p++) {
        const cur = schedules[key][d][p];
        if (cur === null) emptySlots.push({
          d,
          p
        });
        else if (fillerSet.has(cur)) fillerSlots.push({
          d,
          p
        });
        else if (mainSet.has(cur) && countOcc(cur) > 5)
          replaceableMainSlots.push({
            d,
            p
          });
      }
    }
    const slotBuckets = [emptySlots, fillerSlots, replaceableMainSlots];
    for (const mShort of mains) {
      while (countOcc(mShort) < 5) {
        let placed = false;
        for (const bucket of slotBuckets) {
          while (bucket.length) {
            const {
              d,
              p
            } = bucket.shift();
            const teacher =
              (teacherForShort[key] && teacherForShort[key][mShort]) ||
              teacherForShortGlobal[mShort] ||
              null;
            if (
              !canAssign(key, mShort, d, p, {
                allowOverClassCap: true,
                allowNoTeacher: !teacher,
              })
            )
              continue;
            schedules[key][d][p] = mShort;
            if (teacher) {
              teacherTheoryCount[teacher] =
                (teacherTheoryCount[teacher] || 0) + 1;
              teacherTheoryCountByClass[key][teacher] =
                (teacherTheoryCountByClass[key][teacher] || 0) + 1;
              teacherMinutes[teacher] =
                (teacherMinutes[teacher] || 0) + minsPerPeriod;
            }
            placed = true;
            break;
          }
          if (placed) break;
        }
        if (!placed) break; // no more slots to promote
      }
    }

}

/**
 * Last-resort force fill: when >20% of slots are empty, cycles through
 * mains and fillers to fill every remaining gap with relaxed constraints.
 */
function schedulerPassUltimateForceFill({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const empties = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < classesPerDay; p++) {
        if (schedules[key][d][p] === null) empties.push({
          d,
          p
        });
      }
    }
    if (!empties.length) return;
    // step: exit early if empty count is below the 20% sparsity threshold
    const threshold = Math.ceil(days * classesPerDay * 0.2);
    if (empties.length <= threshold) return; // not sparse enough for force fill
    const mainSet =
      (mainShortsByClass && mainShortsByClass[key]) || new Set();
    if (!mainSet.size) {
      Object.keys(weeklyQuota[key] || {}).forEach((sh) => {
        if (
          fillerShortsByClass &&
          fillerShortsByClass[key] &&
          fillerShortsByClass[key].has(sh)
        )
          return;
        if (isLabShort[key] && isLabShort[key][sh]) return;
        if ((weeklyQuota[key][sh] || 0) >= 5) {
          if (!mainShortsByClass[key]) mainShortsByClass[key] = new Set();
          mainShortsByClass[key].add(sh);
        }
      });
    }
    const mains = Array.from(
      (mainShortsByClass && mainShortsByClass[key]) || []
    );
    const fillers = Array.from(
      (fillerShortsByClass && fillerShortsByClass[key]) || []
    );
    if (!mains.length && !fillers.length) return;
    /** Counts how many times a given short appears in the current class schedule. */
    const countOcc = (sh) => {
      let c = 0;
      for (let d = 0; d < days; d++)
        for (let p = 0; p < classesPerDay; p++)
          if (schedules[key][d][p] === sh) c++;
      return c;
    };
    // step: sort mains by frequency (least-placed first) for balanced distribution
    mains.sort((a, b) => countOcc(a) - countOcc(b));
    let mi = 0,
      fi = 0;
    // step: cycle through empty slots, trying mains first then fillers
    for (const {
        d,
        p
      }
      of empties) {
      let placed = false;
      for (
        let attempt = 0; attempt < mains.length && !placed; attempt++
      ) {
        const pick = mains[(mi + attempt) % mains.length];
        if (!pick) break;
        if (
          !canAssign(key, pick, d, p, {
            allowNoTeacher: true,
            allowOverClassCap: true,
            allowOverPerDayByClassCap: true,
            allowMoreThanOneMainPostLunch: true,
          })
        )
          continue;
        schedules[key][d][p] = pick;
        mi = (mi + 1) % Math.max(1, mains.length);
        placed = true;
      }
      // step: fallback to filler subjects when no main can be assigned
      if (!placed && fillers.length) {
        const fillShort = fillers[fi % fillers.length];
        if (
          canAssign(key, fillShort, d, p, {
            allowNoTeacher: true,
            allowOverClassCap: true,
            allowOverPerDayByClassCap: true,
          })
        ) {
          schedules[key][d][p] = fillShort;
          fi++;
          placed = true;
        }
      }
    }

}

// Section: MAIN PROMOTION & PRE-LUNCH FILL

/**
 * Swaps main subjects from post-lunch into pre-lunch filler slots,
 * improving schedule balance by keeping academic subjects before lunch.
 */
function schedulerPassPromoteMainsBeforeLunch({ ctx, key }) {
  const {
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
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    const fillerSet =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    if (!fillerSet.size) return false;

    let changed = false;
    for (let d = 0; d < days; d++) {
      const preFillerCols = [];
      for (let pre = 0; pre < lunchClassIndex; pre++) {
        const sh = schedules[key][d][pre];
        if (sh && fillerSet.has(sh)) preFillerCols.push(pre);
      }
      if (!preFillerCols.length) continue;

      for (let post = lunchClassIndex; post < classesPerDay; post++) {
        const mainShort = schedules[key][d][post];
        if (!mainShort || !isMainShort(key, mainShort)) continue;

        let swapped = false;
        for (let i = 0; i < preFillerCols.length; i++) {
          const pre = preFillerCols[i];
          const fillerShort = schedules[key][d][pre];
          if (!fillerShort || !fillerSet.has(fillerShort)) continue;

          const mainTeacher = pickTeacherForSlot(key, mainShort, d, pre, {
            allowNoTeacher: false,
            allowOverClassCap: true,
            allowOverPerDayByClassCap: true,
            allowMoreThanOneMainPostLunch: true,
          });
          if (mainTeacher === null) continue;

          const fillerTeacher = pickTeacherForSlot(
            key,
            fillerShort,
            d,
            post, {
              allowNoTeacher: true,
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
            }
          );
          if (fillerTeacher === null) continue;

          schedules[key][d][pre] = mainShort;
          assignedTeacher[key][d][pre] = mainTeacher;
          schedules[key][d][post] = fillerShort;
          assignedTeacher[key][d][post] = fillerTeacher;
          preFillerCols.splice(i, 1);
          changed = true;
          swapped = true;
          break;
        }
        if (!swapped) continue;
      }
    }
    return changed;

}

/** Fills remaining empty pre-lunch slots across all classes with under-target mains or fillers. */
function schedulerPassFillEmptyPreLunch({ ctx }) {
  const {
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
    keys,
    pickLectureIndex,
    periodTimings,
    classIndices,
  } = ctx;

    let changed = false;
    for (const key of keys) {
      const mainSet =
        (mainShortsByClass && mainShortsByClass[key]) || new Set();
      const fillerSet =
        (fillerShortsByClass && fillerShortsByClass[key]) || new Set();

      const countByShort = {};
      for (let d = 0; d < days; d++) {
        for (let p = 0; p < classesPerDay; p++) {
          const sh = schedules[key][d][p];
          if (sh) countByShort[sh] = (countByShort[sh] || 0) + 1;
        }
      }

      for (let d = 0; d < days; d++) {
        for (let p = 0; p < lunchClassIndex; p++) {
          if (schedules[key][d][p] !== null) continue;

          let placed = false;
          const mainList = Array.from(mainSet)
            .filter((sh) => !(isLabShort[key] && isLabShort[key][sh]))
            .filter((sh) => {
              const target = getTargetForShort(key, sh);
              return (countByShort[sh] || 0) < target;
            })
            .sort((a, b) => (countByShort[a] || 0) - (countByShort[b] || 0));

          for (const sh of mainList) {
            const teacher = pickTeacherForSlot(key, sh, d, p, {
              allowNoTeacher: true,
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
              allowMoreThanOneMainPostLunch: true,
              ultraRelaxed: true,
            });
            if (teacher === null) continue;
            schedules[key][d][p] = sh;
            assignedTeacher[key][d][p] = teacher;
            countByShort[sh] = (countByShort[sh] || 0) + 1;
            placed = true;
            changed = true;
            break;
          }

          if (!placed) {
            const fillerList = Array.from(fillerSet);
            for (const sh of fillerList) {
              const teacher = pickTeacherForSlot(key, sh, d, p, {
                allowNoTeacher: true,
                allowOverClassCap: true,
                allowOverPerDayByClassCap: true,
                ultraRelaxed: true,
              });
              if (teacher === null) continue;
              schedules[key][d][p] = sh;
              assignedTeacher[key][d][p] = teacher;
              countByShort[sh] = (countByShort[sh] || 0) + 1;
              placed = true;
              changed = true;
              break;
            }
          }
        }
      }
    }
    return changed;

}

// Section: COMPACTION PASSES

/**
 * Compacts post-lunch schedule by bubble-sorting mains/labs toward earlier
 * post-lunch slots and pushing gaps/fillers toward the end of the day.
 */
function schedulerPassCompactPostLunch({ ctx, key }) {
  const {
    days,
    classesPerDay,
    lunchClassIndex,
    schedules,
    fillerShortsByClass,
    canAssign,
    pickTeacherForSlot,
    assignedTeacher,
    isLabShort,
    postLunchCompactDebugByClass,
  } = ctx;

  const fillerSet =
    (fillerShortsByClass && fillerShortsByClass[key]) || new Set();

  /** Checks whether a given short is a lab subject for the current class. */
  const isLabCell = (short) =>
    !!(short && isLabShort && isLabShort[key] && isLabShort[key][short]);
  /** Returns sort-priority bucket: 0 = main/lab, 1 = filler, 2 = empty. */
  const bucketOf = (short) => {
    if (!short) return 2; // gaps at end
    if (fillerSet.has(short)) return 1; // fillers after mains/labs
    return 0; // mains/labs first
  };
  const relaxedOpts = {
    allowOverClassCap: true,
    allowOverPerDayByClassCap: true,
    allowMoreThanOneMainPostLunch: true,
    ultraRelaxed: true,
  };
  /** Resolves a teacher for the given short/slot, preferring the original teacher if still valid. */
  const resolveTeacherFor = (short, day, col, preferredTeacher) => {
    if (
      preferredTeacher !== undefined &&
      preferredTeacher !== null &&
      preferredTeacher !== ""
    ) {
      if (
        canAssign(key, short, day, col, {
          ...relaxedOpts,
          allowNoTeacher: false,
          teacherOverride: preferredTeacher,
        })
      ) {
        return preferredTeacher;
      }
    }
    return pickTeacherForSlot(key, short, day, col, {
      ...relaxedOpts,
      allowNoTeacher: true,
    });
  };

  let changed = false;
  const debug = {
    passRuns: 1,
    labLockedCells: 0,
    moveAttempts: 0,
    moveApplied: 0,
    moveReverted: 0,
    noCandidate: 0,
  };
  for (let d = 0; d < days; d++) {
    for (let c = lunchClassIndex; c < classesPerDay; c++) {
      const currentShort = schedules[key][d][c];
      if (isLabCell(currentShort)) {
        debug.labLockedCells++;
        continue; // keep lab cells fixed to avoid split
      }

      const currentBucket = bucketOf(currentShort);
      let bestIdx = -1;
      let bestBucket = currentBucket;

      for (let j = c + 1; j < classesPerDay; j++) {
        const candShort = schedules[key][d][j];
        if (isLabCell(candShort)) continue;
        const b = bucketOf(candShort);
        if (b < bestBucket) {
          bestBucket = b;
          bestIdx = j;
          if (b === 0) break;
        }
      }

      if (bestIdx < 0) {
        debug.noCandidate++;
        continue;
      }
      debug.moveAttempts++;

      const rightShort = schedules[key][d][bestIdx];
      const rightTeacher =
        assignedTeacher &&
        assignedTeacher[key] &&
        assignedTeacher[key][d] &&
        assignedTeacher[key][d][bestIdx] !== undefined
          ? assignedTeacher[key][d][bestIdx]
          : null;

      if (!rightShort) continue;

      const leftTeacher =
        assignedTeacher &&
        assignedTeacher[key] &&
        assignedTeacher[key][d] &&
        assignedTeacher[key][d][c] !== undefined
          ? assignedTeacher[key][d][c]
          : null;

      if (currentShort === null) {
        schedules[key][d][bestIdx] = null;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][bestIdx] = null;
        }

        const chosenRight = resolveTeacherFor(rightShort, d, c, rightTeacher);
        if (chosenRight !== null) {
          schedules[key][d][c] = rightShort;
          if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
            assignedTeacher[key][d][c] = chosenRight;
          }
          changed = true;
          debug.moveApplied++;
          continue;
        }

        schedules[key][d][bestIdx] = rightShort;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][bestIdx] = rightTeacher;
        }
        debug.moveReverted++;
        continue;
      }

      schedules[key][d][c] = null;
      schedules[key][d][bestIdx] = null;
      if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
        assignedTeacher[key][d][c] = null;
        assignedTeacher[key][d][bestIdx] = null;
      }

      const chosenRight = resolveTeacherFor(rightShort, d, c, rightTeacher);
      const chosenLeft =
        chosenRight !== null ?
        resolveTeacherFor(currentShort, d, bestIdx, leftTeacher) :
        null;

      if (chosenRight !== null && chosenLeft !== null) {
        schedules[key][d][c] = rightShort;
        schedules[key][d][bestIdx] = currentShort;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][c] = chosenRight;
          assignedTeacher[key][d][bestIdx] = chosenLeft;
        }
        changed = true;
        debug.moveApplied++;
      } else {
        schedules[key][d][c] = currentShort;
        schedules[key][d][bestIdx] = rightShort;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][c] = leftTeacher;
          assignedTeacher[key][d][bestIdx] = rightTeacher;
        }
        debug.moveReverted++;
      }
    }
  }

  if (postLunchCompactDebugByClass) {
    const prev = postLunchCompactDebugByClass[key] || {
      passRuns: 0,
      labLockedCells: 0,
      moveAttempts: 0,
      moveApplied: 0,
      moveReverted: 0,
      noCandidate: 0,
    };
    postLunchCompactDebugByClass[key] = {
      passRuns: prev.passRuns + debug.passRuns,
      labLockedCells: prev.labLockedCells + debug.labLockedCells,
      moveAttempts: prev.moveAttempts + debug.moveAttempts,
      moveApplied: prev.moveApplied + debug.moveApplied,
      moveReverted: prev.moveReverted + debug.moveReverted,
      noCandidate: prev.noCandidate + debug.noCandidate,
    };
  }

  return changed;
}

/** Compacts the pre-lunch portion of the schedule by bubbling mains/labs toward earlier slots. */
function schedulerPassCompactPreLunch({ ctx, key }) {
  const {
    days,
    lunchClassIndex,
    schedules,
    fillerShortsByClass,
    canAssign,
    pickTeacherForSlot,
    assignedTeacher,
    isLabShort,
  } = ctx;

  if (!Number.isFinite(lunchClassIndex) || lunchClassIndex <= 1) return false;

  const fillerSet =
    (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
  /** Checks whether a given short is a lab subject for the current class. */
  const isLabCell = (short) =>
    !!(short && isLabShort && isLabShort[key] && isLabShort[key][short]);
  /** Returns sort-priority bucket: 0 = main/lab, 1 = filler, 2 = empty. */
  const bucketOf = (short) => {
    if (!short) return 2;
    if (fillerSet.has(short)) return 1;
    return 0;
  };
  const relaxedOpts = {
    allowOverClassCap: true,
    allowOverPerDayByClassCap: true,
    allowMoreThanOneMainPostLunch: true,
    ultraRelaxed: true,
  };
  /** Resolves a teacher for the given short/slot, preferring the original teacher if still valid. */
  const resolveTeacherFor = (short, day, col, preferredTeacher) => {
    if (
      preferredTeacher !== undefined &&
      preferredTeacher !== null &&
      preferredTeacher !== ""
    ) {
      if (
        canAssign(key, short, day, col, {
          ...relaxedOpts,
          allowNoTeacher: false,
          teacherOverride: preferredTeacher,
        })
      ) {
        return preferredTeacher;
      }
    }
    return pickTeacherForSlot(key, short, day, col, {
      ...relaxedOpts,
      allowNoTeacher: true,
    });
  };

  let changed = false;
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < lunchClassIndex; c++) {
      const currentShort = schedules[key][d][c];
      if (isLabCell(currentShort)) continue;

      const currentBucket = bucketOf(currentShort);
      let bestIdx = -1;
      let bestBucket = currentBucket;

      for (let j = c + 1; j < lunchClassIndex; j++) {
        const candShort = schedules[key][d][j];
        if (isLabCell(candShort)) continue;
        const b = bucketOf(candShort);
        if (b < bestBucket) {
          bestBucket = b;
          bestIdx = j;
          if (b === 0) break;
        }
      }

      if (bestIdx < 0) continue;

      const rightShort = schedules[key][d][bestIdx];
      const rightTeacher =
        assignedTeacher &&
        assignedTeacher[key] &&
        assignedTeacher[key][d] &&
        assignedTeacher[key][d][bestIdx] !== undefined
          ? assignedTeacher[key][d][bestIdx]
          : null;

      if (!rightShort) continue;

      const leftTeacher =
        assignedTeacher &&
        assignedTeacher[key] &&
        assignedTeacher[key][d] &&
        assignedTeacher[key][d][c] !== undefined
          ? assignedTeacher[key][d][c]
          : null;

      if (currentShort === null) {
        schedules[key][d][bestIdx] = null;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][bestIdx] = null;
        }

        const chosenRight = resolveTeacherFor(rightShort, d, c, rightTeacher);
        if (chosenRight !== null) {
          schedules[key][d][c] = rightShort;
          if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
            assignedTeacher[key][d][c] = chosenRight;
          }
          changed = true;
          continue;
        }

        schedules[key][d][bestIdx] = rightShort;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][bestIdx] = rightTeacher;
        }
        continue;
      }

      schedules[key][d][c] = null;
      schedules[key][d][bestIdx] = null;
      if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
        assignedTeacher[key][d][c] = null;
        assignedTeacher[key][d][bestIdx] = null;
      }

      const chosenRight = resolveTeacherFor(rightShort, d, c, rightTeacher);
      const chosenLeft =
        chosenRight !== null ?
        resolveTeacherFor(currentShort, d, bestIdx, leftTeacher) :
        null;

      if (chosenRight !== null && chosenLeft !== null) {
        schedules[key][d][c] = rightShort;
        schedules[key][d][bestIdx] = currentShort;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][c] = chosenRight;
          assignedTeacher[key][d][bestIdx] = chosenLeft;
        }
        changed = true;
      } else {
        schedules[key][d][c] = currentShort;
        schedules[key][d][bestIdx] = rightShort;
        if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
          assignedTeacher[key][d][c] = leftTeacher;
          assignedTeacher[key][d][bestIdx] = rightTeacher;
        }
      }
    }
  }

  return changed;
}

/** Compacts the full-day schedule by shifting filled cells left to eliminate mid-day gaps, preserving lab block integrity. */
function schedulerPassCompactDayGaps({ ctx, key }) {
  const {
    days,
    classesPerDay,
    schedules,
    fillerShortsByClass,
    canAssign,
    pickTeacherForSlot,
    assignedTeacher,
    isLabShort,
    labNumberAssigned,
  } = ctx;

  const fillerSet =
    (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
  /** Checks whether a given short is a lab subject for the current class. */
  const isLabCell = (short) =>
    !!(short && isLabShort && isLabShort[key] && isLabShort[key][short]);
  /** Returns sort-priority bucket: 0 = main/lab, 1 = filler, 2 = empty. */
  const bucketOf = (short) => {
    if (!short) return 2;
    if (fillerSet.has(short)) return 1;
    return 0;
  };
  const relaxedOpts = {
    allowOverClassCap: true,
    allowOverPerDayByClassCap: true,
    allowMoreThanOneMainPostLunch: true,
    ultraRelaxed: true,
  };
  /** Resolves a teacher for the given short/slot, preferring the original teacher if still valid. */
  const resolveTeacherFor = (short, day, col, preferredTeacher) => {
    if (
      preferredTeacher !== undefined &&
      preferredTeacher !== null &&
      preferredTeacher !== ""
    ) {
      if (
        canAssign(key, short, day, col, {
          ...relaxedOpts,
          allowNoTeacher: false,
          teacherOverride: preferredTeacher,
        })
      ) {
        return preferredTeacher;
      }
    }
    return pickTeacherForSlot(key, short, day, col, {
      ...relaxedOpts,
      allowNoTeacher: true,
    });
  };

  let changed = false;
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < classesPerDay; c++) {
      if (schedules[key][d][c] !== null) continue;

      const candidates = [];
      for (let j = c + 1; j < classesPerDay; j++) {
        const short = schedules[key][d][j];
        if (!short) continue;
        const isLab = isLabCell(short);
        if (isLab) {
          // Keep lab blocks intact: operate from block start only.
          if (j > 0 && schedules[key][d][j - 1] === short) continue;
          const hasRight = j + 1 < classesPerDay && schedules[key][d][j + 1] === short;
          if (hasRight) {
            if (c + 1 >= classesPerDay) continue;
            // Allow one-step left shift of a lab block (e.g., P7-P8 -> P6-P7):
            // destination second cell may overlap current block start at `j`.
            if (c + 1 < j && schedules[key][d][c + 1] !== null) continue;
            candidates.push({
              col: j,
              short,
              bucket: bucketOf(short),
              size: 2,
            });
            continue;
          }
        }
        candidates.push({
          col: j,
          short,
          bucket: bucketOf(short),
          size: 1,
        });
      }
      if (!candidates.length) continue;
      candidates.sort(
        (a, b) => a.bucket - b.bucket || b.size - a.size || a.col - b.col
      );

      let moved = false;
      for (const cand of candidates) {
        const fromCol = cand.col;
        const short = cand.short;
        const isDouble = cand.size === 2;
        const sourceCols = isDouble ? [fromCol, fromCol + 1] : [fromCol];
        const destCols = isDouble ? [c, c + 1] : [c];
        const preferredTeachers = sourceCols.map((sc) =>
          assignedTeacher &&
          assignedTeacher[key] &&
          assignedTeacher[key][d] &&
          assignedTeacher[key][d][sc] !== undefined
            ? assignedTeacher[key][d][sc]
            : null
        );
        const sourceRooms = sourceCols.map((sc) =>
          labNumberAssigned &&
          labNumberAssigned[key] &&
          labNumberAssigned[key][d] &&
          labNumberAssigned[key][d][sc] !== undefined
            ? labNumberAssigned[key][d][sc]
            : null
        );

        sourceCols.forEach((sc) => {
          schedules[key][d][sc] = null;
          if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
            assignedTeacher[key][d][sc] = null;
          }
          if (labNumberAssigned && labNumberAssigned[key] && labNumberAssigned[key][d]) {
            labNumberAssigned[key][d][sc] = null;
          }
        });

        const chosenTeachers = [];
        let feasible = true;
        for (let i = 0; i < destCols.length; i++) {
          const chosen = resolveTeacherFor(
            short,
            d,
            destCols[i],
            preferredTeachers[i] ?? preferredTeachers[0]
          );
          if (chosen === null) {
            feasible = false;
            break;
          }
          chosenTeachers.push(chosen);
        }

        if (feasible) {
          destCols.forEach((dc, idx) => {
            schedules[key][d][dc] = short;
            if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
              assignedTeacher[key][d][dc] = chosenTeachers[idx];
            }
            if (labNumberAssigned && labNumberAssigned[key] && labNumberAssigned[key][d]) {
              const room =
                sourceRooms[idx] !== null && sourceRooms[idx] !== undefined ?
                sourceRooms[idx] :
                sourceRooms[0];
              labNumberAssigned[key][d][dc] = room ?? null;
            }
          });
          changed = true;
          moved = true;
          break;
        }

        sourceCols.forEach((sc, idx) => {
          schedules[key][d][sc] = short;
          if (assignedTeacher && assignedTeacher[key] && assignedTeacher[key][d]) {
            assignedTeacher[key][d][sc] = preferredTeachers[idx];
          }
          if (labNumberAssigned && labNumberAssigned[key] && labNumberAssigned[key][d]) {
            labNumberAssigned[key][d][sc] = sourceRooms[idx];
          }
        });
      }

      if (!moved) continue;
    }
  }

  return changed;
}
