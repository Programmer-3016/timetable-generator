/* exported schedulerRebuildTracking, schedulerBoostMainOnLabDays, schedulerEnforceMainTargets, schedulerEnforceClassOneFillerTargets, schedulerValidateCompaction, schedulerEnforceFixedSlots */

/**
 * Rebuilds all tracking maps (teacher minutes, theory counts, filler counts, etc.)
 * from the current state of the schedules array. Called after major mutations.
 */
function schedulerRebuildTracking({ ctx }) {
  const {
    teacherTheoryCount, teacherMinutes, teacherFirstPeriodCount,
    teacherLabBlocks, teacherLabMinutes, keys, teacherTheoryCountByClass,
    teacherPrePostByClass, mainPostLunchCountByClass, days, perDayUsed,
    teacherAssignedPerDayByClass, hasLabDay, theoryOnLabDayCount,
    fillerCountsByClass, teacherListForShort, teacherForShort,
    teacherForShortGlobal, isLabShort, fillerShortsByClass, classesPerDay,
    schedules, assignedTeacher, getShortTeacherList, minsPerPeriod, ensureTP,
    lunchClassIndex, recordMainPostLunchIfNeeded,
  } = ctx;
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

/**
 * On days that have labs but no theory lectures, places main subjects
 * to ensure they reach the target of 5 weekly lectures.
 */
function schedulerBoostMainOnLabDays({ ctx, key }) {
  const {
    mainShortsByClass, fillerShortsByClass, weeklyQuota, countOccurrences,
    teacherForShort, teacherForShortGlobal, days, hasLabDay,
    theoryOnLabDayCount, classesPerDay, lunchClassIndex, schedules,
    isLabShort, canAssign, assignedTeacher, teacherTheoryCount,
    teacherTheoryCountByClass, fillerCountsByClass,
  } = ctx;
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
            teacherOverride: teacher,
          })
        )
          continue;
        schedules[key][d][p] = short;
        if (teacher) assignedTeacher[key][d][p] = teacher;
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
              teacherOverride: teacher,
            })
          )
            continue;
          schedules[key][d][p] = short;
          if (teacher) assignedTeacher[key][d][p] = teacher;
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

/**
 * Iteratively enforces weekly targets for all main subjects in a class,
 * replacing fillers or over-quota subjects as needed.
 */
function schedulerEnforceMainTargets({ ctx, key }) {
  const {
    mainShortsByClass, isLabShort, fillerShortsByClass, days, classesPerDay,
    schedules, getTargetForShort, pickTeacherForSlot, keys, teacherClashKey,
    getTeachersForCell, assignedTeacher, lunchClassIndex,
  } = ctx;
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
  /** Returns true if assigning `teacher` to `key` at `(day, col)` clashes with another class. */
  const wouldClashAt = (teacher, day, col) => {
    if (!teacher) return false;
    const ck = teacherClashKey(teacher);
    if (!ck) return false;
    for (const ok of keys) {
      if (ok === key) continue;
      const osh = schedules[ok]?.[day]?.[col];
      if (!osh) continue;
      const oTeachers = getTeachersForCell(ok, osh, day, col);
      for (const ot of oTeachers) {
        if (teacherClashKey(ot) === ck) return true;
      }
    }
    return false;
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
            if (wouldClashAt(chosenFinal, d, p)) continue;
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

/**
 * Enforces filler targets specifically for the first class (Class 1),
 * ensuring each filler subject reaches its credit-based weekly target.
 */
function schedulerEnforceClassOneFillerTargets({ ctx }) {
  const {
    keys, fillerShortsByClass, fillerTargetsByClass, days, classesPerDay,
    schedules, isLabShort, getTargetForShort, pickTeacherForSlot,
    teacherClashKey, getTeachersForCell, assignedTeacher,
  } = ctx;
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
  /** Returns true if assigning `teacher` to classOneKey at `(day, col)` clashes with another class. */
  const wouldClashForClassOne = (teacher, day, col) => {
    if (!teacher) return false;
    const ck = teacherClashKey(teacher);
    if (!ck) return false;
    for (const ok of keys) {
      if (ok === classOneKey) continue;
      const osh = schedules[ok]?.[day]?.[col];
      if (!osh) continue;
      const oTeachers = getTeachersForCell(ok, osh, day, col);
      for (const ot of oTeachers) {
        if (teacherClashKey(ot) === ck) return true;
      }
    }
    return false;
  };
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
          if (wouldClashForClassOne(chosen, d, c)) continue;
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
        if (wouldClashForClassOne(chosen, d, c)) continue;
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

/**
 * Validates the final post-lunch compaction: checks for mid-gap issues,
 * split lab blocks, and remaining cross-class teacher clashes.
 */
function schedulerValidateCompaction({ ctx }) {
  const {
    keys, days, classesPerDay, lunchClassIndex, schedules, isLabShort,
    getTeachersForCell, teacherClashKey, postLunchCompactDebugByClass,
  } = ctx;
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

  // Cross-class teacher clashes on ALL slots.
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < classesPerDay; c++) {
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
          type: "teacher_clash",
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

/**
 * Locks imported fixed slots into the schedule, overriding whatever was
 * previously placed and assigning the specified teacher.
 */
function schedulerEnforceFixedSlots({ ctx }) {
  const {
    keys, importedFixedSlotsByClass, subjectByShort, days, classesPerDay,
    schedules, assignedTeacher, teacherForShort, teacherForShortGlobal,
    teacherClashKey, getTeachersForCell, pickTeacherForSlot,
  } = ctx;
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
      let chosenTeacher =
        fixedTeacher && !/^not\s*mentioned$/i.test(fixedTeacher) ?
        fixedTeacher :
        fallbackTeacher;
      // If the chosen teacher clashes with another class, try an alternate.
      if (chosenTeacher) {
        const ck = teacherClashKey(chosenTeacher);
        let hasClash = false;
        if (ck) {
          for (const ok of keys) {
            if (ok === key) continue;
            const osh = schedules[ok]?.[day]?.[slot];
            if (!osh) continue;
            const oTeachers = getTeachersForCell(ok, osh, day, slot);
            if (oTeachers.some((t) => teacherClashKey(t) === ck)) {
              hasClash = true;
              break;
            }
          }
        }
        if (hasClash) {
          const alt = pickTeacherForSlot(key, short, day, slot, {
            ultraRelaxed: true,
            allowNoTeacher: true,
          });
          if (alt !== null) chosenTeacher = alt;
        }
      }
      assignedTeacher[key][day][slot] = chosenTeacher;
      changed = true;
    });
  });
  return changed;
}
