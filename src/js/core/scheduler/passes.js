/* exported schedulerPlaceLabBlock, schedulerPlaceInitialLabsAcrossClasses, schedulerClampMainsToTarget, schedulerResolveFinalTeacherClashes */

/**
 * @module core/scheduler/passes.js
 * @description Pass-layer helpers extracted from scheduler core.
 *
 * Note:
 * - Extracted from core/scheduler.js without behavior changes.
 */

// Section: LAB PLACEMENT

function schedulerPlaceLabBlock({
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
}) {
  if (labPeriodsUsedPerDay[key][day] >= 2) return false;
  const labTeachers = getShortTeacherList(key, label);
  if (!labTeachers.length) return false;
  for (const teacher of labTeachers) {
    if ((teacherAssignedPerDayByClass[key][day][teacher] || 0) >= 3) return false;
    if ((teacherMinutes[teacher] || 0) + 2 * minsPerPeriod > TEACHER_MAX_HOURS)
      return false;
  }

  const allowedStarts = [];
  for (let s = 0; s < classesPerDay - 1; s++) {
    if (s === lunchClassIndex - 1) continue; // exclude cross-lunch start
    allowedStarts.push(s);
  }
  const preBlocks = labPrePostBlocksByClass[key].pre;
  const postBlocks = labPrePostBlocksByClass[key].post;
  allowedStarts.sort((a, b) => {
    const aSidePost = a >= lunchClassIndex;
    const bSidePost = b >= lunchClassIndex;
    if (preBlocks !== postBlocks && aSidePost !== bSidePost) {
      const favorPost = postBlocks < preBlocks; // need more post
      if (favorPost) return aSidePost ? -1 : 1;
      const favorPre = preBlocks < postBlocks; // need more pre
      if (favorPre) return aSidePost ? 1 : -1;
    }
    const ua = labStartCountsByClass[key][a] || 0;
    const ub = labStartCountsByClass[key][b] || 0;
    if (ua !== ub) return ua - ub; // fewer previous starts first
    // total lab-slot load across both periods for candidate start a
    const la = (labsAtSlot[day][a] || 0) + (labsAtSlot[day][a + 1] || 0);
    // total lab-slot load across both periods for candidate start b
    const lb = (labsAtSlot[day][b] || 0) + (labsAtSlot[day][b + 1] || 0);
    if (la !== lb) return la - lb;
    return a - b; // earlier start as final tiebreaker
  });

  for (const c of allowedStarts) {
    if (schedules[key][day][c] === null && schedules[key][day][c + 1] === null) {
      const prevCol = c - 1;
      if (
        prevCol >= 0 &&
        schedules[key][day][prevCol] &&
        schedules[key][day][prevCol] === label
      ) {
        continue;
      }
      const nextCol = c + 2;
      if (
        nextCol < classesPerDay &&
        schedules[key][day][nextCol] &&
        schedules[key][day][nextCol] === label
      ) {
        continue;
      }

      let clash = false;
      for (const ok of keys) {
        if (ok === key) continue;
        const o1 = schedules[ok][day][c];
        const o2 = schedules[ok][day][c + 1];
        const ot1List = o1 ? getTeachersForCell(ok, o1, day, c) : [];
        const ot2List = o2 ? getTeachersForCell(ok, o2, day, c + 1) : [];
        for (const teacher of labTeachers) {
          const ca = teacherClashKey(teacher);
          if (!ca) continue;
          const c1Hit = ot1List.some((t) => {
            const cb = teacherClashKey(t);
            return cb && cb === ca;
          });
          const c2Hit = ot2List.some((t) => {
            const cb = teacherClashKey(t);
            return cb && cb === ca;
          });
          if (c1Hit || c2Hit) {
            clash = true;
            break;
          }
        }
        if (clash) break;
      }
      if (clash) continue;
      if (labsAtSlot[day][c] >= LAB_CAPACITY) continue;
      if (labsAtSlot[day][c + 1] >= LAB_CAPACITY) continue;

      let chosenLab = null;
      const candidates = [];
      for (let num = 1; num <= LAB_CAPACITY; num++) {
        if (!labsInUse[day][c].has(num) && !labsInUse[day][c + 1].has(num)) {
          candidates.push(num);
        }
      }
      if (candidates.length) {
        /** Returns the total usage count of a specific lab number across all days and slots. */
        const usageFor = (labNum) => {
          let u = 0;
          for (let dd = 0; dd < labsInUse.length; dd++) {
            for (let ss = 0; ss < labsInUse[dd].length; ss++) {
              if (labsInUse[dd][ss].has(labNum)) u++;
            }
          }
          return u;
        };
        candidates.sort((a, b) => {
          const ua = usageFor(a);
          const ub = usageFor(b);
          if (ua !== ub) return ua - ub; // prefer least used
          return a - b; // tie-breaker: lower number
        });
        chosenLab = candidates[0];
      }
      if (!chosenLab) continue; // no room available consistently across both periods

      const primaryTeacher = labTeachers[0] || "";
      schedules[key][day][c] = label;
      schedules[key][day][c + 1] = label;
      assignedTeacher[key][day][c] = primaryTeacher;
      assignedTeacher[key][day][c + 1] = primaryTeacher;
      labNumberAssigned[key][day][c] = chosenLab;
      labNumberAssigned[key][day][c + 1] = chosenLab;
      labPeriodsUsedPerDay[key][day] += 2;
      labsAtSlot[day][c]++;
      labsAtSlot[day][c + 1]++;
      labsInUse[day][c].add(chosenLab);
      labsInUse[day][c + 1].add(chosenLab);
      labsBlocksPerDayAcross[day]++;
      labStartCountsByClass[key][c] = (labStartCountsByClass[key][c] || 0) + 1;
      if (c >= lunchClassIndex) labPrePostBlocksByClass[key].post++;
      else labPrePostBlocksByClass[key].pre++;
      labTeachers.forEach((teacher) => {
        teacherMinutes[teacher] = (teacherMinutes[teacher] || 0) + 2 * minsPerPeriod;
        teacherLabBlocks[teacher] = (teacherLabBlocks[teacher] || 0) + 1;
        teacherLabMinutes[teacher] =
          (teacherLabMinutes[teacher] || 0) + 2 * minsPerPeriod;
        if (c === 0) {
          teacherFirstPeriodCount[teacher] =
            (teacherFirstPeriodCount[teacher] || 0) + 1;
        }
        teacherAssignedPerDayByClass[key][day][teacher] =
          (teacherAssignedPerDayByClass[key][day][teacher] || 0) + 1;
        const tp = ensureTP(key, teacher);
        const pre1 = c < lunchClassIndex;
        const pre2 = c + 1 < lunchClassIndex;
        tp.pre += (pre1 ? 1 : 0) + (pre2 ? 1 : 0);
        tp.post += (pre1 ? 0 : 1) + (pre2 ? 0 : 1);
      });
      return true;
    }
  }
  return false;
}

/**
 * Places initial lab blocks across all classes, distributing them evenly
 * across days by choosing days with the fewest existing lab blocks first.
 */
function schedulerPlaceInitialLabsAcrossClasses({
  data,
  isLabPair,
  days,
  keys,
  labsBlocksPerDayAcross,
  placeLabBlock,
}) {
  data.forEach(({ key, pairs }) => {
    const labEntries = pairs.filter((p) => isLabPair(p));
    const teacherLabShort = {};
    labEntries.forEach((p) => {
      if (!teacherLabShort[p.teacher]) teacherLabShort[p.teacher] = p.short;
    });
    const classOffset = Math.max(0, keys.indexOf(key));

    /** Returns day indices sorted by fewest lab blocks, with class-offset tiebreaker. */
    function dayOrder() {
      return Array.from({ length: days }, (_, i) => i).sort((a, b) => {
        if (labsBlocksPerDayAcross[a] !== labsBlocksPerDayAcross[b]) {
          return labsBlocksPerDayAcross[a] - labsBlocksPerDayAcross[b];
        }
        // rotated offset for even distribution across classes
        const ra = (a - classOffset + days) % days;
        const rb = (b - classOffset + days) % days;
        return ra - rb;
      });
    }

    Object.entries(teacherLabShort).forEach(([, short]) => {
      let placed = false;
      const order = dayOrder();
      for (const d of order) {
        if (placed) break;
        placed = placeLabBlock(key, short, d);
      }
    });
  });
}

// Section: MAIN SUBJECT CLAMPING

/**
 * Clamps each main subject's weekly count to its target, replacing excess
 * occurrences with fillers or under-target alternative mains.
 */
function schedulerClampMainsToTarget({
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
}) {
  let changed = false;
  for (const key of keys) {
    // set of main (non-filler, non-lab) subject shorts for this class
    const mainSet = (mainShortsByClass && mainShortsByClass[key]) || new Set();
    const fillerSet =
      (fillerShortsByClass && fillerShortsByClass[key]) || new Set();
    // weekly quota map for the current class
    const quotaObj = (weeklyQuota && weeklyQuota[key]) || {};
    const effectiveMainSet = new Set(
      Array.from(mainSet || []).filter(Boolean)
    );
    Object.keys(quotaObj).forEach((sh) => {
      if (!sh) return;
      if (fillerSet.has(sh)) return;
      if (isLabShort[key] && isLabShort[key][sh]) return;
      const target = getTargetForShort(key, sh);
      if (Number.isFinite(target) && target > 0) {
        effectiveMainSet.add(sh);
      }
    });
    // Final safety: if any non-lab/non-filler short exists in schedule matrix,
    // clamp it too (guards against config list drift in higher class counts).
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < classesPerDay; p++) {
        const sh = schedules[key][d][p];
        if (!sh) continue;
        if (fillerSet.has(sh)) continue;
        if (isLabShort[key] && isLabShort[key][sh]) continue;
        const target = getTargetForShort(key, sh);
        if (Number.isFinite(target) && target > 0) {
          effectiveMainSet.add(sh);
        }
      }
    }

    const countByShort = {};
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < classesPerDay; p++) {
        const sh = schedules[key][d][p];
        if (sh) countByShort[sh] = (countByShort[sh] || 0) + 1;
      }
    }

    for (const sh of effectiveMainSet) {
      if (isLabShort[key] && isLabShort[key][sh]) continue;
      const target = getTargetForShort(key, sh);
      // number of placements above the target that need to be removed
      let excess = (countByShort[sh] || 0) - target;
      if (excess <= 0) continue;

      const slots = [];
      for (let d = 0; d < days; d++) {
        for (let p = 0; p < classesPerDay; p++) {
          if (schedules[key][d][p] === sh) {
            slots.push({ d, p });
          }
        }
      }
      slots.sort((a, b) => b.p - a.p || b.d - a.d);

      for (let i = 0; i < excess && i < slots.length; i++) {
        const { d, p } = slots[i];
        let replaced = false;
        for (const filler of fillerSet) {
          const teacher = pickTeacherForSlot(key, filler, d, p, {
            allowNoTeacher: true,
            allowOverClassCap: true,
            allowOverPerDayByClassCap: true,
            ultraRelaxed: true,
          });
          if (teacher === null) continue;
          schedules[key][d][p] = filler;
          assignedTeacher[key][d][p] = teacher;
          countByShort[filler] = (countByShort[filler] || 0) + 1;
          replaced = true;
          break;
        }
        if (!replaced) {
          for (const altMain of effectiveMainSet) {
            if (altMain === sh) continue;
            if (isLabShort[key] && isLabShort[key][altMain]) continue;
            const altTarget = getTargetForShort(key, altMain);
            if ((countByShort[altMain] || 0) >= altTarget) continue;
            const teacher = pickTeacherForSlot(key, altMain, d, p, {
              allowNoTeacher: true,
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
              allowMoreThanOneMainPostLunch: true,
              ultraRelaxed: true,
            });
            if (teacher === null) continue;
            schedules[key][d][p] = altMain;
            assignedTeacher[key][d][p] = teacher;
            countByShort[altMain] = (countByShort[altMain] || 0) + 1;
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          // Last-resort clamp: keep main within target even if no filler/alt-main
          // replacement is feasible under current constraints.
          schedules[key][d][p] = null;
          assignedTeacher[key][d][p] = null;
          replaced = true;
        }
        if (replaced) {
          countByShort[sh] = Math.max(0, (countByShort[sh] || 0) - 1);
          changed = true;
        }
      }
    }
  }
  return changed;
}

// Section: TEACHER CLASH RESOLUTION

/**
 * Resolves remaining teacher clashes across all classes by reassigning teachers,
 * swapping to under-target subjects, or falling back to fillers.
 */
function schedulerResolveFinalTeacherClashes({
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
}) {
  let changed = false;
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < classesPerDay; c++) {
      const byTeacher = {};
      for (const key of keys) {
        const short = schedules[key][d][c];
        if (!short) continue;
        const teachers = getTeachersForCell(key, short, d, c);
        for (const teacher of teachers) {
          const canon = teacherClashKey(teacher);
          if (!canon) continue;
          if (!byTeacher[canon]) byTeacher[canon] = [];
          byTeacher[canon].push({
            key,
            short,
            teacher,
          });
        }
      }
      Object.values(byTeacher).forEach((arr) => {
        if (!arr || arr.length <= 1) return;
        for (let i = 1; i < arr.length; i++) {
          const { key, short } = arr[i];
          const isLabCell =
            !!(isLabShort && isLabShort[key] && isLabShort[key][short]);
          let fixed = false;

          const alt = pickTeacherForSlot(key, short, d, c, {
            allowNoTeacher: false,
            allowOverClassCap: true,
            allowOverPerDayByClassCap: true,
            allowMoreThanOneMainPostLunch: true,
            ultraRelaxed: true,
          });
          if (alt !== null) {
            assignedTeacher[key][d][c] = alt;
            fixed = true;
            changed = true;
          }
          if (fixed) continue;
          // Never replace a lab subject cell with another short here, otherwise
          // we can break mandatory 2-slot lab blocks.
          if (isLabCell) continue;

          // subjects whose current count is below their target, sorted by largest deficit first
          const underTargetMains = (lectureList[key] || [])
            .filter((s) => {
              if (!s || !s.short || s.short === short) return false;
              const target = getTargetForShort(key, s.short);
              const have = countOccurrences(key, s.short);
              return have < target;
            })
            .sort((a, b) => {
              const ta = getTargetForShort(key, a.short);
              const tb = getTargetForShort(key, b.short);
              const da = ta - countOccurrences(key, a.short);
              const db = tb - countOccurrences(key, b.short);
              return db - da;
            });
          for (const cand of underTargetMains) {
            const chosen = pickTeacherForSlot(key, cand.short, d, c, {
              allowNoTeacher: false,
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
              allowMoreThanOneMainPostLunch: true,
              ultraRelaxed: true,
            });
            if (!chosen) continue;
            schedules[key][d][c] = cand.short;
            assignedTeacher[key][d][c] = chosen;
            fixed = true;
            changed = true;
            break;
          }
          if (fixed) continue;

          // all other subjects (excluding current), sorted by most over-target first
          const altMains = (lectureList[key] || [])
            .filter((s) => s && s.short && s.short !== short)
            .sort((a, b) => {
              const sa =
                countOccurrences(key, a.short) - getTargetForShort(key, a.short);
              const sb =
                countOccurrences(key, b.short) - getTargetForShort(key, b.short);
              return sb - sa;
            });
          for (const cand of altMains) {
            const chosen = pickTeacherForSlot(key, cand.short, d, c, {
              allowNoTeacher: false,
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
              allowMoreThanOneMainPostLunch: true,
              ultraRelaxed: true,
            });
            if (!chosen) continue;
            schedules[key][d][c] = cand.short;
            assignedTeacher[key][d][c] = chosen;
            fixed = true;
            changed = true;
            break;
          }
          if (fixed) continue;

          const shortTarget = getTargetForShort(key, short);
          const shortCount = countOccurrences(key, short);
          const keepCurrentMain = isMainShort(key, short) && shortCount <= shortTarget;

          const fillers = Array.from(
            (fillerShortsByClass && fillerShortsByClass[key]) || []
          );
          fillers.sort((a, b) => {
            const ta =
              (fillerTargetsByClass[key] && fillerTargetsByClass[key][a]) || 0;
            const tb =
              (fillerTargetsByClass[key] && fillerTargetsByClass[key][b]) || 0;
            const ca =
              (fillerCountsByClass[key] && fillerCountsByClass[key][a]) || 0;
            const cb =
              (fillerCountsByClass[key] && fillerCountsByClass[key][b]) || 0;
            return tb - cb - (ta - ca);
          });
          for (const f of fillers) {
            const chosen = pickTeacherForSlot(key, f, d, c, {
              allowNoTeacher: true,
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
              ultraRelaxed: true,
            });
            if (chosen === null) continue;
            schedules[key][d][c] = f;
            assignedTeacher[key][d][c] = chosen;
            fixed = true;
            changed = true;
            break;
          }
          if (!fixed && keepCurrentMain) {
            continue;
          }
        }
      });
    }
  }
  return changed;
}
