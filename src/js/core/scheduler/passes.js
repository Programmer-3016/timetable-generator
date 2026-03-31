// @ts-check
/* exported schedulerPlaceLabBlock, schedulerPlaceInitialLabsAcrossClasses, schedulerClampMainsToTarget, schedulerResolveFinalTeacherClashes, schedulerRepairLabRoomConflicts */

/**
 * @module core/scheduler/passes.js
 * @description Pass-layer helpers extracted from scheduler core.
 *
 * Note:
 * - Extracted from core/scheduler.js without behavior changes.
 */

/* ═══════════════════════════════════════════════════════
   Section: LAB PLACEMENT
═══════════════════════════════════════════════════════ */

/**
 * Places a 2-period lab block for a class on a given day.
 * @param {Object} opts - Destructured options object.
 * @param {string} opts.key - Class identifier key.
 * @param {string} opts.label - Subject label for the lab block.
 * @param {number} opts.day - Day index to place the lab block on.
 * @param {Object} opts.labPeriodsUsedPerDay - Lab periods used per day per class.
 * @param {Function} opts.getShortTeacherList - Returns teachers for a given class and label.
 * @param {Object} opts.teacherAssignedPerDayByClass - Teacher assignments per day per class.
 * @param {Object} opts.teacherMinutes - Total minutes assigned to each teacher.
 * @param {number} opts.minsPerPeriod - Duration of one period in minutes.
 * @param {number} opts.TEACHER_MAX_HOURS - Maximum allowed teacher minutes.
 * @param {number} opts.classesPerDay - Number of periods per day.
 * @param {number} opts.lunchClassIndex - Period index of the lunch break.
 * @param {Object} opts.labPrePostBlocksByClass - Pre/post lab block constraints per class.
 * @param {Object} opts.labStartCountsByClass - Count of lab starts per slot per class.
 * @param {Object} opts.labsAtSlot - Labs scheduled at each slot.
 * @param {Object} opts.labsInUse - Set of labs currently in use at each slot.
 * @param {number} opts.LAB_CAPACITY - Maximum concurrent labs per slot.
 * @param {Object} opts.schedules - Schedule grid (class → day → period).
 * @param {string[]} opts.keys - Array of all class keys.
 * @param {Function} opts.getTeachersForCell - Returns teachers assigned to a schedule cell.
 * @param {Function} opts.teacherClashKey - Returns canonical clash key for a teacher.
 * @param {Object} opts.assignedTeacher - Assigned teachers per cell.
 * @param {Object} opts.labNumberAssigned - Assigned lab numbers per cell.
 * @param {number[]} opts.labsBlocksPerDayAcross - Lab block counts per day across all classes.
 * @param {Object} opts.teacherLabBlocks - Lab block counts per teacher.
 * @param {Object} opts.teacherLabMinutes - Lab minutes per teacher.
 * @param {Object} opts.teacherFirstPeriodCount - First-period assignment counts per teacher.
 * @param {Function} opts.ensureTP - Ensures teacher presence tracking is initialized.
 * @returns {boolean} True if a lab block was successfully placed.
 */
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
 * @param {Object} opts - Destructured options object.
 * @param {Array} opts.data - Array of class data entries with key and pairs.
 * @param {Function} opts.isLabPair - Predicate returning true if a pair is a lab pair.
 * @param {number} opts.days - Number of days in the week.
 * @param {string[]} opts.keys - Array of all class keys.
 * @param {number[]} opts.labsBlocksPerDayAcross - Lab block counts per day across all classes.
 * @param {Function} opts.placeLabBlock - Callback to place a single lab block.
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

/* ═══════════════════════════════════════════════════════
   Section: MAIN SUBJECT CLAMPING
═══════════════════════════════════════════════════════ */

/**
 * Clamps each main subject's weekly count to its target, replacing excess
 * occurrences with fillers or under-target alternative mains.
 * @param {Object} opts - Destructured options object.
 * @param {string[]} opts.keys - Array of all class keys.
 * @param {Object} opts.mainShortsByClass - Set of main subject shorts per class.
 * @param {Object} opts.fillerShortsByClass - Set of filler subject shorts per class.
 * @param {Object} opts.weeklyQuota - Weekly quota map per class.
 * @param {number} opts.days - Number of days in the week.
 * @param {number} opts.classesPerDay - Number of periods per day.
 * @param {Object} opts.schedules - Schedule grid (class → day → period).
 * @param {Object} opts.isLabShort - Map indicating whether a short is a lab subject per class.
 * @param {Function} opts.getTargetForShort - Returns the target count for a subject short.
 * @param {Function} opts.pickTeacherForSlot - Picks a suitable teacher for a given slot.
 * @param {Object} opts.assignedTeacher - Assigned teachers per cell.
 * @param {Function} opts.getTeachersForCell - Returns teachers assigned to a schedule cell.
 * @param {Function} opts.teacherClashKey - Returns canonical clash key for a teacher.
 * @returns {boolean} True if any schedule change was made.
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
  getTeachersForCell,
  teacherClashKey,
}) {
  /** Returns true if assigning `teacher` to `key` at `(day, col)` clashes with another class. */
  function wouldClash(key, teacher, day, col) {
    if (!teacher || !teacherClashKey) return false;
    const ck = teacherClashKey(teacher);
    if (!ck) return false;
    for (const ok of keys) {
      if (ok === key) continue;
      const osh = schedules[ok]?.[day]?.[col];
      if (!osh) continue;
      const oTeachers = getTeachersForCell ? getTeachersForCell(ok, osh, day, col) : [];
      for (const ot of oTeachers) {
        if (teacherClashKey(ot) === ck) return true;
      }
    }
    return false;
  }
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
          if (wouldClash(key, teacher, d, p)) continue;
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
            if (wouldClash(key, teacher, d, p)) continue;
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

/* ═══════════════════════════════════════════════════════
   Section: TEACHER CLASH RESOLUTION
═══════════════════════════════════════════════════════ */

/**
 * Resolves remaining teacher clashes across all classes by reassigning teachers,
 * swapping to under-target subjects, or falling back to fillers.
 * @param {Object} opts - Destructured options object.
 * @param {number} opts.days - Number of days in the week.
 * @param {number} opts.classesPerDay - Number of periods per day.
 * @param {string[]} opts.keys - Array of all class keys.
 * @param {Object} opts.schedules - Schedule grid (class → day → period).
 * @param {Function} opts.getTeachersForCell - Returns teachers assigned to a schedule cell.
 * @param {Function} opts.teacherClashKey - Returns canonical clash key for a teacher.
 * @param {Function} opts.pickTeacherForSlot - Picks a suitable teacher for a given slot.
 * @param {Object} opts.assignedTeacher - Assigned teachers per cell.
 * @param {Object} opts.lectureList - List of lecture entries per class.
 * @param {Function} opts.getTargetForShort - Returns the target count for a subject short.
 * @param {Function} opts.countOccurrences - Counts current occurrences of a subject in a class.
 * @param {Function} opts.isMainShort - Returns true if a short is a main subject for a class.
 * @param {Object} opts.fillerShortsByClass - Set of filler subject shorts per class.
 * @param {Object} opts.fillerTargetsByClass - Target counts for filler subjects per class.
 * @param {Object} opts.fillerCountsByClass - Current counts for filler subjects per class.
 * @param {Object} opts.isLabShort - Map indicating whether a short is a lab subject per class.
 * @param {Object} [opts.fixedSlotsByClass={}] - Imported fixed slots keyed by class.
 * @param {Array} opts.unresolvedClashes - Array to collect unresolved clash records.
 * @returns {boolean} True if any schedule change was made.
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
  fixedSlotsByClass = {},
  unresolvedClashes,
}) {
  let changed = false;
  const isExplicitFixedTeacherCell = (key, day, col, short) => {
    const locks = Array.isArray(fixedSlotsByClass?.[key]) ? fixedSlotsByClass[key] : [];
    return locks.some((lock) => {
      const fixedTeacher = String(lock?.teacher || "").trim();
      const fixedShort = String(lock?.short || "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
      return (
        Number(lock?.day) === day &&
        Number(lock?.slot) === col &&
        fixedShort === short &&
        fixedTeacher &&
        !/^not\s*mentioned$/i.test(fixedTeacher)
      );
    });
  };
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
          // Instead, try to fix the OTHER clashing entry (arr[0]).
          if (isLabCell) {
            const other = arr[0];
            const otherIsLab =
              !!(isLabShort && isLabShort[other.key] && isLabShort[other.key][other.short]);
            // Try reassigning arr[0]'s teacher first
            if (!otherIsLab) {
              const altOther = pickTeacherForSlot(other.key, other.short, d, c, {
                allowNoTeacher: false,
                allowOverClassCap: true,
                allowOverPerDayByClassCap: true,
                allowMoreThanOneMainPostLunch: true,
                ultraRelaxed: true,
              });
              if (altOther !== null) {
                assignedTeacher[other.key][d][c] = altOther;
                fixed = true;
                changed = true;
              }
            }
            // Cross-day swap for arr[0]: try moving the OTHER class's cell to a non-clashing slot
            if (!fixed && !otherIsLab) {
              const otherKey = other.key;
              const otherShort = other.short;
              for (let d2 = 0; d2 < days && !fixed; d2++) {
                for (let c2 = 0; c2 < classesPerDay && !fixed; c2++) {
                  if (d2 === d && c2 === c) continue;
                  const swapShort = schedules[otherKey]?.[d2]?.[c2];
                  if (!swapShort || swapShort === otherShort) continue;
                  if (isLabShort?.[otherKey]?.[swapShort]) continue;
                  // Would otherShort's teacher be clash-free at (d2, c2)?
                  const otherTeacherNew = pickTeacherForSlot(otherKey, otherShort, d2, c2, {
                    allowNoTeacher: false,
                    allowOverClassCap: true,
                    allowOverPerDayByClassCap: true,
                    ultraRelaxed: true,
                  });
                  if (otherTeacherNew === null) continue;
                  // Can swapShort get a teacher at (d, c) without clashing?
                  const swapTeacher = pickTeacherForSlot(otherKey, swapShort, d, c, {
                    allowNoTeacher: false,
                    allowOverClassCap: true,
                    allowOverPerDayByClassCap: true,
                    ultraRelaxed: true,
                  });
                  if (swapTeacher === null) continue;
                  schedules[otherKey][d][c] = swapShort;
                  schedules[otherKey][d2][c2] = otherShort;
                  assignedTeacher[otherKey][d][c] = swapTeacher;
                  assignedTeacher[otherKey][d2][c2] = otherTeacherNew;
                  fixed = true;
                  changed = true;
                }
              }
            }
            if (!fixed && unresolvedClashes) {
              unresolvedClashes.push({
                day: d, col: c, key, short, teacher: arr[i].teacher,
                reason: "lab_cell_no_alt_teacher",
              });
            }
            continue;
          }

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
          if (fixed) continue;

          // Try reassigning arr[0]'s teacher
          if (!fixed) {
            const other = arr[0];
            const altOther = pickTeacherForSlot(other.key, other.short, d, c, {
              allowNoTeacher: false,
              allowOverClassCap: true,
              allowOverPerDayByClassCap: true,
              allowMoreThanOneMainPostLunch: true,
              ultraRelaxed: true,
            });
            if (altOther !== null) {
              assignedTeacher[other.key][d][c] = altOther;
              fixed = true;
              changed = true;
            }
          }

          // Cross-day swap: find another slot with a non-clashing subject to swap with
          if (!fixed && !(isLabShort?.[key]?.[short])) {
            for (let d2 = 0; d2 < days && !fixed; d2++) {
              for (let c2 = 0; c2 < classesPerDay && !fixed; c2++) {
                if (d2 === d && c2 === c) continue;
                const otherShort = schedules[key]?.[d2]?.[c2];
                if (!otherShort || otherShort === short) continue;
                if (isLabShort?.[key]?.[otherShort]) continue;
                // Can we get a valid teacher for otherShort at (d, c)?
                const otherTeacher = pickTeacherForSlot(key, otherShort, d, c, {
                  allowNoTeacher: false,
                  allowOverClassCap: true,
                  allowOverPerDayByClassCap: true,
                  ultraRelaxed: true,
                });
                if (otherTeacher === null) continue;
                // Can we get a valid teacher for short at (d2, c2)?
                const myTeacher = pickTeacherForSlot(key, short, d2, c2, {
                  allowNoTeacher: false,
                  allowOverClassCap: true,
                  allowOverPerDayByClassCap: true,
                  ultraRelaxed: true,
                });
                if (myTeacher === null) continue;
                // Swap
                schedules[key][d][c] = otherShort;
                schedules[key][d2][c2] = short;
                assignedTeacher[key][d][c] = otherTeacher;
                assignedTeacher[key][d2][c2] = myTeacher;
                fixed = true;
                changed = true;
              }
            }
          }

          // Cross-day swap for arr[0] as last resort
          if (!fixed) {
            const other = arr[0];
            const otherIsLab =
              !!(isLabShort && isLabShort[other.key] && isLabShort[other.key][other.short]);
            if (!otherIsLab) {
              const otherKey = other.key;
              const otherShort = other.short;
              for (let d2 = 0; d2 < days && !fixed; d2++) {
                for (let c2 = 0; c2 < classesPerDay && !fixed; c2++) {
                  if (d2 === d && c2 === c) continue;
                  const swapShort = schedules[otherKey]?.[d2]?.[c2];
                  if (!swapShort || swapShort === otherShort) continue;
                  if (isLabShort?.[otherKey]?.[swapShort]) continue;
                  const otherTeacherNew = pickTeacherForSlot(otherKey, otherShort, d2, c2, {
                    allowNoTeacher: false,
                    allowOverClassCap: true,
                    allowOverPerDayByClassCap: true,
                    ultraRelaxed: true,
                  });
                  if (otherTeacherNew === null) continue;
                  const swapTeacher = pickTeacherForSlot(otherKey, swapShort, d, c, {
                    allowNoTeacher: false,
                    allowOverClassCap: true,
                    allowOverPerDayByClassCap: true,
                    ultraRelaxed: true,
                  });
                  if (swapTeacher === null) continue;
                  schedules[otherKey][d][c] = swapShort;
                  schedules[otherKey][d2][c2] = otherShort;
                  assignedTeacher[otherKey][d][c] = swapTeacher;
                  assignedTeacher[otherKey][d2][c2] = otherTeacherNew;
                  fixed = true;
                  changed = true;
                }
              }
            }
          }

          if (!fixed && unresolvedClashes) {
            if (
              !(isLabShort?.[key]?.[short]) &&
              !isExplicitFixedTeacherCell(key, d, c, short)
            ) {
              assignedTeacher[key][d][c] = "";
              fixed = true;
              changed = true;
            }
          }

          if (!fixed && unresolvedClashes) {
            unresolvedClashes.push({
              day: d, col: c, key, short, teacher: arr[i].teacher,
              reason: keepCurrentMain ? "main_at_target_no_replacement" : "all_strategies_exhausted",
            });
          }
        }
      });
    }
  }
  return changed;
}

/**
 * Repairs final lab-room conflicts by reassigning one conflicting lab block
 * to another free room that is available for the whole block.
 * @param {Object} params - Strict conflict repair parameters.
 * @param {number} params.days - Number of schedule days.
 * @param {number} params.classesPerDay - Number of periods per day.
 * @param {string[]} params.keys - Enabled class keys.
 * @param {Object} params.schedules - Published schedules by class.
 * @param {Object} params.isLabShort - Lab-short lookup per class.
 * @param {Object} params.labNumberAssigned - Assigned lab room numbers.
 * @param {number} params.LAB_CAPACITY - Maximum room count.
 * @returns {boolean} True when at least one conflicting block was repaired.
 */
function schedulerRepairLabRoomConflicts({
  days,
  classesPerDay,
  keys,
  schedules,
  isLabShort,
  labNumberAssigned,
  LAB_CAPACITY,
}) {
  const handledBlocks = new Set();
  let changed = false;

  const getBlockCols = (key, day, col, short) => {
    const row = schedules?.[key]?.[day];
    if (!Array.isArray(row) || !short) return [col];
    if (col > 0 && row[col - 1] === short) return [col - 1, col];
    if (col + 1 < classesPerDay && row[col + 1] === short) return [col, col + 1];
    return [col];
  };

  const isRoomFreeForBlock = (room, day, blockCols, ignoreKey) => {
    for (const dc of blockCols) {
      for (const otherKey of keys) {
        if (otherKey === ignoreKey) continue;
        const otherShort = schedules?.[otherKey]?.[day]?.[dc] || null;
        if (
          !otherShort ||
          !(isLabShort?.[otherKey] && isLabShort[otherKey][otherShort])
        ) {
          continue;
        }
        const otherRoom = labNumberAssigned?.[otherKey]?.[day]?.[dc];
        if (otherRoom === null || otherRoom === undefined || otherRoom === "") continue;
        if (String(otherRoom) === String(room)) return false;
      }
    }
    return true;
  };

  for (let d = 0; d < days; d++) {
    for (let c = 0; c < classesPerDay; c++) {
      const byRoom = {};
      keys.forEach((key) => {
        const short = schedules?.[key]?.[d]?.[c] || null;
        if (!short || !(isLabShort?.[key] && isLabShort[key][short])) return;
        const room = labNumberAssigned?.[key]?.[d]?.[c];
        if (room === null || room === undefined || room === "") return;
        const roomKey = String(room);
        if (!byRoom[roomKey]) byRoom[roomKey] = [];
        byRoom[roomKey].push({ key, short, room });
      });

      Object.values(byRoom).forEach((entries) => {
        if (!entries || entries.length <= 1) return;
        for (let i = 1; i < entries.length; i++) {
          const item = entries[i];
          const blockCols = getBlockCols(item.key, d, c, item.short);
          const blockId = `${item.key}|${d}|${blockCols[0]}|${item.short}`;
          if (handledBlocks.has(blockId)) continue;
          handledBlocks.add(blockId);

          let replacementRoom = null;
          for (let room = 1; room <= LAB_CAPACITY; room++) {
            if (String(room) === String(item.room)) continue;
            if (isRoomFreeForBlock(room, d, blockCols, item.key)) {
              replacementRoom = room;
              break;
            }
          }
          if (replacementRoom === null) continue;
          blockCols.forEach((dc) => {
            if (labNumberAssigned?.[item.key]?.[d]) {
              labNumberAssigned[item.key][d][dc] = replacementRoom;
            }
          });
          changed = true;
        }
      });
    }
  }

  return changed;
}
