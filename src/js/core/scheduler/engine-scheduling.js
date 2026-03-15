/* exported schedulerBoostTeachers, schedulerEnsureDailyTeacherPresence, schedulerForceMainToFive, schedulerFinalizeSubjectFive, schedulerEmergencyP5Filler, schedulerAbsoluteNoGapSweep, schedulerEmergencyFillEmpty */

/**
 * @module core/scheduler/engine-scheduling.js
 * @description Late-stage scheduling passes: teacher boosting, daily presence
 *   enforcement, subject-five finalization, gap sweeping, and emergency fill.
 */

/* ═══════════════════════════════════════════════════════
   Section: TEACHER BOOSTING
═══════════════════════════════════════════════════════ */

/**
 * Places lectures from teachers who are below the per-class theory max
 * into any remaining empty slots.
 */
function schedulerBoostTeachers({ ctx, key }) {
  const {
    lectureList, teacherTheoryCountByClass, TEACHER_THEORY_MAX, days,
    classesPerDay, schedules, canAssign, perDayUsed, assignedTeacher,
    teacherTheoryCount, teacherMinutes, minsPerPeriod, teacherFirstPeriodCount,
    teacherAssignedPerDayByClass, ensureTP, lunchClassIndex,
    recordMainPostLunchIfNeeded,
  } = ctx;
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

/* ═══════════════════════════════════════════════════════
   Section: DAILY TEACHER PRESENCE
═══════════════════════════════════════════════════════ */

/**
 * Ensures every teacher with remaining lectures appears at least once each day,
 * swapping out fillers if necessary.
 */
function schedulerEnsureDailyTeacherPresence({ ctx, key }) {
  const {
    fillerShortsByClass, lectureList, days, classesPerDay, schedules,
    isLabShort, getTeacherForCell, pickTeacherForSlot, canAssign, perDayUsed,
    assignedTeacher, teacherTheoryCount, teacherTheoryCountByClass,
    teacherMinutes, minsPerPeriod, teacherFirstPeriodCount,
    teacherAssignedPerDayByClass, ensureTP, lunchClassIndex,
    recordMainPostLunchIfNeeded, fillerCountsByClass, periodTimings,
    classIndices,
  } = ctx;
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

/* ═══════════════════════════════════════════════════════
   Section: FORCE MAIN TO FIVE
═══════════════════════════════════════════════════════ */

/**
 * Force-places main subjects until they hit their weekly quota,
 * displacing fillers and using relaxed constraints as needed.
 */
function schedulerForceMainToFive({ ctx, key }) {
  const {
    fillerShortsByClass, lectureList, days, classesPerDay, schedules,
    perDayUsed, canAssign, assignedTeacher, teacherTheoryCount,
    teacherTheoryCountByClass, teacherMinutes, minsPerPeriod,
    teacherAssignedPerDayByClass, ensureTP, lunchClassIndex,
    recordMainPostLunchIfNeeded, fillerCountsByClass, periodTimings,
    classIndices,
  } = ctx;
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
            !canAssign(key, subj.short, d, c, { teacherOverride: subj.teacher }) &&
            !canAssign(key, subj.short, d, c, {
              allowOverPerDayByClassCap: true,
              teacherOverride: subj.teacher,
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
          (canAssign(key, subj.short, d, p5, { teacherOverride: subj.teacher }) ||
            canAssign(key, subj.short, d, p5, {
              allowOverPerDayByClassCap: true,
              teacherOverride: subj.teacher,
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
              canAssign(key, subj.short, d, p5, { teacherOverride: subj.teacher }) ||
              canAssign(key, subj.short, d, p5, {
                allowOverPerDayByClassCap: true,
                teacherOverride: subj.teacher,
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
            !canAssign(key, subj.short, d, c, { teacherOverride: subj.teacher }) &&
            !canAssign(key, subj.short, d, c, {
              allowOverPerDayByClassCap: true,
              teacherOverride: subj.teacher,
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
                teacherOverride: subj.teacher,
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

/* ═══════════════════════════════════════════════════════
   Section: FINALIZE SUBJECT FIVE
═══════════════════════════════════════════════════════ */

/**
 * Last-resort pass: relocates other main subjects to different days/slots
 * to free room for subjects that still haven't met their weekly target.
 */
function schedulerFinalizeSubjectFive({ ctx, key }) {
  const {
    fillerShortsByClass, lectureList, isLabShort, days, classesPerDay,
    schedules, perDayUsed, canAssign, assignedTeacher, teacherTheoryCount,
    teacherTheoryCountByClass, teacherMinutes, minsPerPeriod,
    teacherFirstPeriodCount, teacherAssignedPerDayByClass, ensureTP,
    lunchClassIndex, recordMainPostLunchIfNeeded, fillerCountsByClass,
    teacherForShort, teacherForShortGlobal, teacherClashKey,
    getTeachersForCell, keys, periodTimings, classIndices,
  } = ctx;
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
              teacherOverride: subj.teacher,
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
                              teacherOverride: clashTeacher,
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
                            assignedTeacher[otherKey][d2][c2] = clashTeacher;
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
                            teacherOverride: subj.teacher,
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
                  teacherOverride: occTeacher,
                }) &&
                canAssign(key, subj.short, d, c, {
                  allowOverPerDayByClassCap: true,
                  allowMoreThanOneMainPostLunch: true,
                  allowOverClassCap: true,
                  teacherOverride: subj.teacher,
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
                  assignedTeacher[key][d2][c2] = occTeacher;
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

/* ═══════════════════════════════════════════════════════
   Section: EMERGENCY P5 FILLER
═══════════════════════════════════════════════════════ */

/** Places a filler in the first post-lunch slot (P5) if it remains empty and filler budget allows. */
function schedulerEmergencyP5Filler({ ctx, key }) {
  const {
    fillerShortsByClass, lunchClassIndex, days, classesPerDay, schedules,
    getFillerTotal, getFillerCap, fillerTargetsByClass, fillerCountsByClass,
    getFillerSubjectCap, teacherForShort, teacherForShortGlobal, canAssign,
    assignedTeacher, teacherMinutes, minsPerPeriod,
    teacherAssignedPerDayByClass, ensureTP,
  } = ctx;
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
          teacherOverride: tF,
        })
      )
        continue;
      schedules[key][d][p5] = f;
      if (tF) assignedTeacher[key][d][p5] = tF;
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

/* ═══════════════════════════════════════════════════════
   Section: ABSOLUTE NO-GAP SWEEP
═══════════════════════════════════════════════════════ */

/**
 * Sweeps every empty slot in the schedule and fills it with the best-fit filler,
 * guaranteeing zero gaps in the final timetable.
 */
function schedulerAbsoluteNoGapSweep({ ctx, key }) {
  const {
    fillerShortsByClass, days, classesPerDay, schedules, lunchClassIndex,
    fillerTargetsByClass, fillerCountsByClass, getFillerSubjectCap,
    getFillerTotal, getFillerCap, teacherForShort, teacherForShortGlobal,
    canAssign, assignedTeacher, teacherMinutes, minsPerPeriod,
  } = ctx;
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
          teacherOverride: tF,
        })
      )
        continue;
      schedules[key][d][c] = f;
      if (tF) assignedTeacher[key][d][c] = tF;
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

/* ═══════════════════════════════════════════════════════
   Section: EMERGENCY FILL EMPTY
═══════════════════════════════════════════════════════ */

/** Emergency fallback: if a class schedule is completely empty, fills it with round-robin mains. */
function schedulerEmergencyFillEmpty({ ctx, key }) {
  const {
    days, classesPerDay, schedules, mainShortsByClass, teacherForShort,
    teacherForShortGlobal, assignedTeacher,
  } = ctx;
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
      const short = mainsArr.length ?
        mainsArr[idx % mainsArr.length] :
        "FILL";
      const teacher = short !== "FILL" ?
        ((teacherForShort[key] && teacherForShort[key][short]) ||
          teacherForShortGlobal[short] ||
          null) :
        null;
      schedules[key][d][p] = short;
      if (teacher) assignedTeacher[key][d][p] = teacher;
      idx++;
    }
  }
}
