/**
 * @module core/scheduler/validation.js
 * @description Schedule validation engine — checks for teacher clashes, credit fulfilment,
 *   lab room conflicts, period caps, and overall constraint satisfaction.
 */

// Section: SCHEDULE VALIDATION

function schedulerNormalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.slice();
  if (value instanceof Set) return Array.from(value);
  if (typeof value === "object") return Object.keys(value);
  return [];
}

// Section: SNAPSHOT BUILDERS

/**
 * @description Creates a plain-object snapshot of a Set/Object/Array map for the given keys.
 * @param {Object} source - Source map (values may be Sets, Arrays, or Objects).
 * @param {string[]} keys - Keys to include in the snapshot.
 * @returns {Object} Snapshot with each key mapped to a filtered array.
 */
function schedulerBuildSetMapSnapshot(source = {}, keys = []) {
  const out = {};
  (keys || []).forEach((k) => {
    out[k] = schedulerNormalizeList(source && source[k]).filter(Boolean);
  });
  return out;
}

/**
 * @description Creates a snapshot of teacher lists per short per class, normalized and trimmed.
 * @param {Object} source - Nested map (class → short → teacher list).
 * @param {string[]} keys - Class keys to include.
 * @returns {Object} Snapshot of teacher lists keyed by class then short.
 */
function schedulerBuildTeacherListSnapshot(source = {}, keys = []) {
  const out = {};
  (keys || []).forEach((k) => {
    out[k] = {};
    const byShort = (source && source[k]) || {}; // short→teachers map for this class
    Object.keys(byShort).forEach((short) => {
      out[k][short] = schedulerNormalizeList(byShort[short])
        .map((t) => String(t || "").trim())
        .filter(Boolean);
    });
  });
  return out;
}

// Section: VALIDATION KEY HELPERS

/**
 * @description Returns the canonical clash-detection key for a teacher name.
 * @param {Object} state - Schedule state containing the teacher fold map.
 * @param {string} teacher - Raw teacher name.
 * @returns {string} Canonical key for teacher collision checks.
 */
function schedulerTeacherValidationKey(state, teacher) {
  const canon = canonicalTeacherName(teacher);
  if (!canon) return "";
  const foldMap =
    state && state.teacherFoldMap && typeof state.teacherFoldMap === "object" ?
    state.teacherFoldMap :
    {};
  return foldMap[canon] || canon;
}

/**
 * @description Resolves the teacher list for a cell during validation, using state snapshots.
 * @param {Object} state - Schedule validation state.
 * @param {string} key - Class identifier.
 * @param {string} short - Subject short code.
 * @param {number} day - Day index.
 * @param {number} col - Period column index.
 * @returns {string[]} Teacher names occupying the cell.
 */
function schedulerGetTeachersForValidationCell(state, key, short, day, col) {
  if (!short) return [];
  const isLab =
    !!(state?.isLabShortByClass &&
      state.isLabShortByClass[key] &&
      state.isLabShortByClass[key][short]);
  if (isLab) {
    const list =
      (state?.teacherListForShortByClass &&
        state.teacherListForShortByClass[key] &&
        state.teacherListForShortByClass[key][short]) ||
      [];
    const cleaned = list
      .map((t) => String(t || "").trim())
      .filter(Boolean);
    if (cleaned.length) return Array.from(new Set(cleaned));
  }
  const assigned =
    state?.assignedTeacher &&
    state.assignedTeacher[key] &&
    state.assignedTeacher[key][day] ?
    state.assignedTeacher[key][day][col] :
    undefined;
  if (assigned !== undefined && assigned !== null && String(assigned).trim()) {
    return [String(assigned).trim()];
  }
  const fallback =
    (state?.teacherForShortByClass &&
      state.teacherForShortByClass[key] &&
      state.teacherForShortByClass[key][short]) ||
    (state?.teacherForShortGlobal && state.teacherForShortGlobal[short]) ||
    "";
  return fallback ? [String(fallback).trim()] : [];
}

// Section: FULL VALIDATION

/**
 * @description Performs full constraint validation on a completed schedule state.
 * @param {Object} scheduleState - The schedule state to validate.
 * @returns {{ valid: boolean, violations: string[] }} Validation result with violation messages.
 */
function schedulerIsFullyValid(scheduleState) {
  const state =
    scheduleState ||
    (typeof window !== "undefined" ? window.__ttLastScheduleState : null);
  const violations = [];
  const seen = new Set();
  // Deduplicates and records a validation violation message
  const pushViolation = (msg) => {
    const text = String(msg || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    violations.push(text);
  };

  if (!state || typeof state !== "object") {
    return {
      valid: false,
      violations: ["Missing schedule state for strict validation"],
    };
  }

  const schedulesByClass =
    state.schedulesByClass && typeof state.schedulesByClass === "object" ?
    state.schedulesByClass :
    {};
  const keys =
    Array.isArray(state.keys) && state.keys.length ?
    state.keys.slice() :
    Object.keys(schedulesByClass);
  const days =
    Number.isFinite(state.days) && state.days > 0 ?
    state.days :
    Math.max(
      0,
      ...keys.map((k) =>
        Array.isArray(schedulesByClass[k]) ? schedulesByClass[k].length : 0
      )
    );
  const classesPerDay =
    Number.isFinite(state.classesPerDay) && state.classesPerDay > 0 ?
    state.classesPerDay :
    Math.max(
      0,
      ...keys.map((k) => {
        const byDay = schedulesByClass[k];
        if (!Array.isArray(byDay) || !byDay.length) return 0;
        return byDay.reduce(
          (mx, row) => Math.max(mx, Array.isArray(row) ? row.length : 0),
          0
        );
      })
    );
  const lunchClassIndex =
    Number.isFinite(state.lunchClassIndex) &&
    state.lunchClassIndex >= 0 &&
    state.lunchClassIndex <= classesPerDay ?
    state.lunchClassIndex :
    Math.floor(classesPerDay / 2);

  // Counts how many times a short appears in the schedule for a class
  const countOccurrences = (classKey, short) => {
    let count = 0;
    const byDay = schedulesByClass[classKey] || [];
    for (let d = 0; d < days; d++) {
      const row = byDay[d] || [];
      for (let c = 0; c < classesPerDay; c++) {
        if (row[c] === short) count++;
      }
    }
    return count;
  };

  // (4) Structural single-subject-per-slot integrity.
  keys.forEach((key) => {
    const byDay = schedulesByClass[key];
    if (!Array.isArray(byDay)) {
      pushViolation(`Class ${key}: schedule matrix missing`);
      return;
    }
    for (let d = 0; d < days; d++) {
      const row = byDay[d];
      if (!Array.isArray(row)) {
        pushViolation(`Class ${key} Day ${d + 1}: row missing`);
        continue;
      }
      for (let c = 0; c < classesPerDay; c++) {
        const cell = row[c];
        if (Array.isArray(cell) && cell.length > 1) {
          pushViolation(
            `Class ${key} Day ${d + 1} Slot ${c + 1}: multiple subjects assigned`
          );
        }
        if (cell !== null && cell !== undefined && typeof cell !== "string") {
          pushViolation(
            `Class ${key} Day ${d + 1} Slot ${c + 1}: invalid cell payload`
          );
        }
      }
    }
  });

  // (1) + (6) Teacher cross-class/double booking checks.
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < classesPerDay; c++) {
      const byTeacher = {};
      keys.forEach((key) => {
        const short =
          schedulesByClass[key] &&
          schedulesByClass[key][d] &&
          schedulesByClass[key][d][c] ?
          schedulesByClass[key][d][c] :
          null;
        if (!short) return;
        const teachers = schedulerGetTeachersForValidationCell(
          state,
          key,
          short,
          d,
          c
        );
        teachers.forEach((teacher) => {
          const tk = schedulerTeacherValidationKey(state, teacher);
          if (!tk) return;
          if (!byTeacher[tk]) byTeacher[tk] = [];
          byTeacher[tk].push({
            key,
            short,
            teacher,
          });
        });
      });
      Object.entries(byTeacher).forEach(([tk, slots]) => {
        if (!slots || slots.length <= 1) return;
        const classSet = new Set(slots.map((s) => s.key));
        if (classSet.size <= 1) return;
        const classes = Array.from(classSet).join(", ");
        pushViolation(
          `Teacher clash (cross-class) on Day ${d + 1} Slot ${c + 1} for "${tk}" across classes: ${classes}`
        );
        pushViolation(
          `Teacher double booking on Day ${d + 1} Slot ${c + 1} for "${tk}"`
        );
      });
    }
  }

  // (2) Lab split across lunch boundary.
  if (lunchClassIndex > 0 && lunchClassIndex < classesPerDay) {
    keys.forEach((key) => {
      for (let d = 0; d < days; d++) {
        const row = schedulesByClass[key] && schedulesByClass[key][d];
        if (!Array.isArray(row)) continue;
        const left = row[lunchClassIndex - 1];
        const right = row[lunchClassIndex];
        const isLabLeft =
          !!(state?.isLabShortByClass &&
            state.isLabShortByClass[key] &&
            state.isLabShortByClass[key][left]);
        if (left && right && left === right && isLabLeft) {
          pushViolation(
            `Lab split across lunch in Class ${key} Day ${d + 1} around slots ${lunchClassIndex}/${lunchClassIndex + 1}`
          );
        }
      }
    });
  }

  // Lab blocks must remain adjacent 2-slot blocks (no orphan lab cells).
  keys.forEach((key) => {
    for (let d = 0; d < days; d++) {
      const row = schedulesByClass[key] && schedulesByClass[key][d];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < classesPerDay; c++) {
        const short = row[c];
        const isLabCell =
          !!(short &&
            state?.isLabShortByClass &&
            state.isLabShortByClass[key] &&
            state.isLabShortByClass[key][short]);
        if (!isLabCell) continue;
        const prevSame = c > 0 && row[c - 1] === short;
        const nextSame = c + 1 < classesPerDay && row[c + 1] === short;
        if (!prevSame && !nextSame) {
          pushViolation(
            `Lab block broken in Class ${key} Day ${d + 1} Slot ${c + 1} (${short})`
          );
        }
      }
    }
  });

  // (3) Lab room double-booking at same day/slot.
  for (let d = 0; d < days; d++) {
    for (let c = 0; c < classesPerDay; c++) {
      const roomToClass = {};
      keys.forEach((key) => {
        const short =
          schedulesByClass[key] &&
          schedulesByClass[key][d] &&
          schedulesByClass[key][d][c] ?
          schedulesByClass[key][d][c] :
          null;
        const isLabCell =
          !!(short &&
            state?.isLabShortByClass &&
            state.isLabShortByClass[key] &&
            state.isLabShortByClass[key][short]);
        if (!isLabCell) return;
        const roomNo =
          state?.labNumberAssigned &&
          state.labNumberAssigned[key] &&
          state.labNumberAssigned[key][d] ?
          state.labNumberAssigned[key][d][c] :
          null;
        if (roomNo === null || roomNo === undefined || roomNo === "") return;
        const roomKey = String(roomNo);
        if (!roomToClass[roomKey]) {
          roomToClass[roomKey] = key;
          return;
        }
        if (roomToClass[roomKey] !== key) {
          pushViolation(
            `Lab room ${roomKey} double-booked on Day ${d + 1} Slot ${c + 1} in classes ${roomToClass[roomKey]} and ${key}`
          );
        }
      });
    }
  }

  // (5) Main weekly quota not met.
  const weeklyQuotaByClass =
    state.weeklyQuotaByClass && typeof state.weeklyQuotaByClass === "object" ?
    state.weeklyQuotaByClass :
    {};
  const mainShortsByClass =
    state.mainShortsByClass && typeof state.mainShortsByClass === "object" ?
    state.mainShortsByClass :
    {};
  const fillerShortsByClass =
    state.fillerShortsByClass && typeof state.fillerShortsByClass === "object" ?
    state.fillerShortsByClass :
    {};
  keys.forEach((key) => {
    let mainList = schedulerNormalizeList(mainShortsByClass[key]).filter(Boolean);
    if (!mainList.length) {
      const quotaObj = weeklyQuotaByClass[key] || {};
      const fillerSet = new Set(
        schedulerNormalizeList(fillerShortsByClass[key]).filter(Boolean)
      );
      mainList = Object.keys(quotaObj).filter((short) => {
        const target = quotaObj[short];
        return (
          Number.isFinite(target) &&
          target >= 5 &&
          !fillerSet.has(short) &&
          !(state?.isLabShortByClass &&
            state.isLabShortByClass[key] &&
            state.isLabShortByClass[key][short])
        );
      });
    }
    mainList.forEach((short) => {
      const target =
        weeklyQuotaByClass[key] &&
        Number.isFinite(weeklyQuotaByClass[key][short]) ?
        weeklyQuotaByClass[key][short] :
        0;
      if (!target || target <= 0) return;
      const have = countOccurrences(key, short);
      if (have < target) {
        pushViolation(
          `Main quota unmet for Class ${key}, ${short}: ${have}/${target}`
        );
      }
    });
  });

  // (7) Filler count integrity.
  const fillerCountsByClass =
    state.fillerCountsByClass && typeof state.fillerCountsByClass === "object" ?
    state.fillerCountsByClass :
    {};
  const fillerTargetsByClass =
    state.fillerTargetsByClass && typeof state.fillerTargetsByClass === "object" ?
    state.fillerTargetsByClass :
    {};
  keys.forEach((key) => {
    const targets = fillerTargetsByClass[key] || {};
    const counts = fillerCountsByClass[key] || {};
    const allShorts = new Set(
      Object.keys(targets).concat(Object.keys(counts))
    );
    allShorts.forEach((short) => {
      const hasTarget = Number.isFinite(targets[short]);
      const target = hasTarget ? targets[short] : 0;
      const stored = Number((counts || {})[short] || 0);
      if (stored < 0) {
        pushViolation(
          `Negative filler count for Class ${key}, ${short}: ${stored}`
        );
      }
      if (hasTarget && target >= 0 && stored > target) {
        pushViolation(
          `Filler over-quota (stored) for Class ${key}, ${short}: ${stored}/${target}`
        );
      }
      const actual = countOccurrences(key, short);
      if (hasTarget && target >= 0 && actual > target) {
        pushViolation(
          `Filler over-quota (actual) for Class ${key}, ${short}: ${actual}/${target}`
        );
      }
    });
  });

  return {
    valid: violations.length === 0,
    violations,
  };
}
