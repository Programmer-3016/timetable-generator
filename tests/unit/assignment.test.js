/**
 * @file tests/unit/assignment.test.js
 * @description Tests for schedulerCanAssign and schedulerPickTeacherForSlot
 *   from core/scheduler/assignment.js.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Builds a minimal context for schedulerCanAssign with sensible defaults. */
function makeAssignCtx(overrides = {}) {
  return {
    key: "A",
    short: "MATH",
    day: 0,
    col: 0,
    opts: {},
    classesPerDay: 6,
    fillerShortsByClass: { A: new Set(["PT", "LIB"]) },
    teacherForShort: { A: { MATH: "Dr. A" } },
    teacherForShortGlobal: {},
    isLabShortFor: () => false,
    isAdjacentToSameSubjectLab: () => false,
    keys: ["A"],
    schedules: { A: [[null, null, null, null, null, null]] },
    getTeachersForCell: () => [],
    getShortTeacherList: () => [],
    teacherClashKey: (t) => (t || "").trim().toLowerCase(),
    getTargetForShort: () => 5,
    countOccurrences: () => 0,
    teacherAssignedPerDayByClass: { A: [{}] },
    teacherFirstPeriodCount: {},
    teacherMinutes: {},
    minsPerPeriod: 50,
    TEACHER_MAX_HOURS: 1500,
    teacherTheoryCountByClass: { A: {} },
    TEACHER_THEORY_MAX: 10,
    lunchClassIndex: 3,
    isMainShort: () => true,
    mainPostLunchCountByClass: { A: {} },
    ...overrides,
  };
}

// ─── schedulerCanAssign ──────────────────────────────────────────────────────

describe("schedulerCanAssign", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerCanAssign).toBe("function");
  });

  test("returns true for a basic unconstrained assignment", () => {
    expect(schedulerCanAssign(makeAssignCtx())).toBe(true);
  });

  test("rejects when cross-class teacher clash exists", () => {
    const ctx = makeAssignCtx({
      keys: ["A", "B"],
      schedules: {
        A: [[null, null, null, null, null, null]],
        B: [["PHY", null, null, null, null, null]],
      },
      teacherForShort: { A: { MATH: "Dr. A" }, B: { PHY: "Dr. A" } },
      getTeachersForCell: (key, short) => {
        if (key === "B" && short === "PHY") return ["Dr. A"];
        return [];
      },
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("allows assignment when cross-class clash is with different teacher", () => {
    const ctx = makeAssignCtx({
      keys: ["A", "B"],
      schedules: {
        A: [[null, null, null, null, null, null]],
        B: [["PHY", null, null, null, null, null]],
      },
      teacherForShort: { A: { MATH: "Dr. A" }, B: { PHY: "Dr. B" } },
      getTeachersForCell: (key, short) => {
        if (key === "B" && short === "PHY") return ["Dr. B"];
        return [];
      },
    });
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("allows cross-class clash when ignoreCrossClassClash opt is set", () => {
    const ctx = makeAssignCtx({
      keys: ["A", "B"],
      schedules: {
        A: [[null, null, null, null, null, null]],
        B: [["PHY", null, null, null, null, null]],
      },
      teacherForShort: { A: { MATH: "Dr. A" }, B: { PHY: "Dr. A" } },
      getTeachersForCell: (key, short) => {
        if (key === "B" && short === "PHY") return ["Dr. A"];
        return [];
      },
      opts: { ignoreCrossClassClash: true },
    });
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("rejects when filler target cap is exceeded", () => {
    const ctx = makeAssignCtx({
      short: "PT",
      getTargetForShort: () => 2,
      countOccurrences: () => 2,
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("allows filler below cap", () => {
    const ctx = makeAssignCtx({
      short: "PT",
      getTargetForShort: () => 3,
      countOccurrences: () => 1,
    });
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("rejects when per-day per-class cap (3) is exceeded", () => {
    const ctx = makeAssignCtx({
      teacherAssignedPerDayByClass: { A: [{ "Dr. A": 3 }] },
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("allows per-day cap violation with allowOverPerDayByClassCap", () => {
    const ctx = makeAssignCtx({
      teacherAssignedPerDayByClass: { A: [{ "Dr. A": 3 }] },
      opts: { allowOverPerDayByClassCap: true },
    });
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("rejects first period cap (3)", () => {
    const ctx = makeAssignCtx({
      col: 0,
      teacherFirstPeriodCount: { "Dr. A": 3 },
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("rejects weekly minutes cap exceeded", () => {
    const ctx = makeAssignCtx({
      teacherMinutes: { "Dr. A": 1480 },
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("rejects theory cap per class exceeded", () => {
    const ctx = makeAssignCtx({
      teacherTheoryCountByClass: { A: { "Dr. A": 10 } },
      TEACHER_THEORY_MAX: 10,
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("allows theory cap when fillerShort (cap check skipped)", () => {
    const ctx = makeAssignCtx({
      short: "PT",
      teacherTheoryCountByClass: { A: { "Dr. A": 10 } },
      TEACHER_THEORY_MAX: 10,
    });
    // filler short should have been rejected by filler target cap
    // but the theory cap check itself is skipped for fillers
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("rejects post-lunch main subject limit", () => {
    const ctx = makeAssignCtx({
      col: 4,
      lunchClassIndex: 3,
      mainPostLunchCountByClass: { A: { MATH: 2 } },
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("allows post-lunch main with allowMoreThanOneMainPostLunch", () => {
    const ctx = makeAssignCtx({
      col: 4,
      lunchClassIndex: 3,
      mainPostLunchCountByClass: { A: { MATH: 2 } },
      opts: { allowMoreThanOneMainPostLunch: true },
    });
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("ultraRelaxed bypasses most caps", () => {
    const ctx = makeAssignCtx({
      col: 0,
      teacherFirstPeriodCount: { "Dr. A": 10 },
      teacherMinutes: { "Dr. A": 9999 },
      teacherTheoryCountByClass: { A: { "Dr. A": 99 } },
      mainPostLunchCountByClass: { A: { MATH: 99 } },
      teacherAssignedPerDayByClass: { A: [{ "Dr. A": 99 }] },
      opts: { ultraRelaxed: true },
    });
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("allows when no teacher is assigned (teacher null/empty)", () => {
    const ctx = makeAssignCtx({
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
    });
    expect(schedulerCanAssign(ctx)).toBe(true);
  });

  test("rejects adjacent same-subject lab when not a lab and not allowNoTeacher", () => {
    const ctx = makeAssignCtx({
      isAdjacentToSameSubjectLab: () => true,
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("strictFillersLastTwo rejects non-filler in last slots", () => {
    window.strictFillersLastTwo = true;
    try {
      const ctx = makeAssignCtx({
        col: 5,
        classesPerDay: 6,
        short: "MATH",
      });
      expect(schedulerCanAssign(ctx)).toBe(false);
    } finally {
      window.strictFillersLastTwo = false;
    }
  });

  test("strictFillersLastTwo allows filler in last slots", () => {
    window.strictFillersLastTwo = true;
    try {
      const ctx = makeAssignCtx({
        col: 5,
        classesPerDay: 6,
        short: "PT",
      });
      expect(schedulerCanAssign(ctx)).toBe(true);
    } finally {
      window.strictFillersLastTwo = false;
    }
  });

  test("uses teacherOverride when provided", () => {
    const ctx = makeAssignCtx({
      teacherForShort: { A: { MATH: "Dr. A" } },
      teacherAssignedPerDayByClass: { A: [{ "Dr. Override": 3 }] },
      opts: { teacherOverride: "Dr. Override" },
    });
    // Dr. Override has 3 per-day, should fail
    expect(schedulerCanAssign(ctx)).toBe(false);
  });

  test("lab short uses getShortTeacherList for clash detection", () => {
    const ctx = makeAssignCtx({
      short: "CSLAB",
      keys: ["A", "B"],
      schedules: {
        A: [[null, null, null, null, null, null]],
        B: [["PHY", null, null, null, null, null]],
      },
      isLabShortFor: (k, s) => k === "A" && s === "CSLAB",
      getShortTeacherList: (k, s) =>
        k === "A" && s === "CSLAB" ? ["Dr. X"] : [],
      teacherForShort: { A: {}, B: { PHY: "Dr. X" } },
      getTeachersForCell: (key, short) => {
        if (key === "B" && short === "PHY") return ["Dr. X"];
        return [];
      },
    });
    expect(schedulerCanAssign(ctx)).toBe(false);
  });
});

// ─── schedulerPickTeacherForSlot ─────────────────────────────────────────────

describe("schedulerPickTeacherForSlot", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPickTeacherForSlot).toBe("function");
  });

  test("returns teacher from single-entry list", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: { A: { MATH: ["Dr. A"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("Dr. A");
  });

  test("returns null when no candidates pass canAssign", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: { A: { MATH: ["Dr. A"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => false,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBeNull();
  });

  test("picks teacher with fewer minutes (lower workload)", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: { A: { MATH: ["Dr. A", "Dr. B"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: { "Dr. A": 300, "Dr. B": 100 },
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("Dr. B");
  });

  test("falls back to teacherForShort when list is empty", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: {},
      teacherForShort: { A: { MATH: "Dr. Fallback" } },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("Dr. Fallback");
  });

  test("falls back to teacherForShortGlobal when class-level missing", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: {},
      teacherForShort: { A: {} },
      teacherForShortGlobal: { MATH: "Global Teacher" },
      canAssign: () => true,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("Global Teacher");
  });

  test("returns null when no candidates exist at all", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: {},
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBeNull();
  });

  test("allowNoTeacher adds empty-string candidate", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      opts: { allowNoTeacher: true },
      teacherListForShort: {},
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("");
  });

  test("prefers real teacher over empty-string when both pass canAssign", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      opts: { allowNoTeacher: true },
      teacherListForShort: { A: { MATH: ["Dr. A"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("Dr. A");
  });

  test("tie-breaks on name when other scores equal", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: { A: { MATH: ["Dr. Z", "Dr. A"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: {},
      teacherAssignedPerDayByClass: { A: [{}] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("Dr. A");
  });

  test("tie-breaks on per-day count when minutes equal", () => {
    const result = schedulerPickTeacherForSlot({
      key: "A",
      short: "MATH",
      day: 0,
      col: 0,
      teacherListForShort: { A: { MATH: ["Dr. A", "Dr. B"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      canAssign: () => true,
      teacherMinutes: { "Dr. A": 100, "Dr. B": 100 },
      teacherAssignedPerDayByClass: { A: [{ "Dr. A": 2, "Dr. B": 0 }] },
      teacherTheoryCountByClass: { A: {} },
    });
    expect(result).toBe("Dr. B");
  });
});
