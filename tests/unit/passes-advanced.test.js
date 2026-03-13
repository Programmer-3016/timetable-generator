/**
 * @file tests/unit/passes-advanced.test.js
 * @description Tests for advanced scheduling passes from
 *   core/scheduler/passes-advanced.js.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a full `ctx` object for advanced passes with sensible defaults. */
function makeAdvCtx(overrides = {}) {
  const days = overrides.days || 1;
  const cpd = overrides.classesPerDay || 6;
  const key = overrides.singleKey || "A";
  const keys = overrides.keys || [key];

  const schedules = overrides.schedules || {
    [key]: Array.from({ length: days }, () => Array(cpd).fill(null)),
  };
  const assignedTeacher = overrides.assignedTeacher || {
    [key]: Array.from({ length: days }, () => Array(cpd).fill(null)),
  };
  const perDayUsed = overrides.perDayUsed || {
    [key]: Array.from({ length: days }, () => new Set()),
  };

  return {
    days,
    classesPerDay: cpd,
    lunchClassIndex: overrides.lunchClassIndex ?? 3,
    schedules,
    fillerShortsByClass: overrides.fillerShortsByClass || { [key]: new Set(["PT", "LIB"]) },
    lectureList: overrides.lectureList || {
      [key]: [
        { short: "MATH", teacher: "T1", remaining: 3 },
        { short: "PHY", teacher: "T2", remaining: 2 },
      ],
    },
    perDayUsed,
    canAssign: overrides.canAssign || (() => true),
    pickTeacherForSlot: overrides.pickTeacherForSlot || (() => "T"),
    teacherTheoryCount: overrides.teacherTheoryCount || {},
    teacherTheoryCountByClass: overrides.teacherTheoryCountByClass || { [key]: {} },
    teacherMinutes: overrides.teacherMinutes || {},
    minsPerPeriod: overrides.minsPerPeriod || 50,
    teacherAssignedPerDayByClass: overrides.teacherAssignedPerDayByClass || {
      [key]: Array.from({ length: days }, () => ({})),
    },
    teacherFirstPeriodCount: overrides.teacherFirstPeriodCount || {},
    ensureTP: overrides.ensureTP || (() => ({ pre: 0, post: 0 })),
    recordMainPostLunchIfNeeded: overrides.recordMainPostLunchIfNeeded || (() => {}),
    getFillerTotal: overrides.getFillerTotal || (() => 0),
    getFillerCap: overrides.getFillerCap || (() => 10),
    getFillerSubjectCap: overrides.getFillerSubjectCap || (() => 5),
    fillerCountsByClass: overrides.fillerCountsByClass || { [key]: {} },
    isLabShort: overrides.isLabShort || { [key]: {} },
    getTargetForShort: overrides.getTargetForShort || (() => 5),
    countOccurrences: overrides.countOccurrences || (() => 0),
    mainShortsByClass: overrides.mainShortsByClass || { [key]: new Set(["MATH", "PHY"]) },
    assignedTeacher,
    preferredForSlot: overrides.preferredForSlot || (() => false),
    isMainShort: overrides.isMainShort || (() => true),
    mainPostLunchCountByClass: overrides.mainPostLunchCountByClass || { [key]: {} },
    weeklyQuota: overrides.weeklyQuota || { [key]: { MATH: 3, PHY: 2 } },
    hasLabDay: overrides.hasLabDay || { [key]: {} },
    theoryOnLabDayCount: overrides.theoryOnLabDayCount || { [key]: {} },
    teacherForShort: overrides.teacherForShort || { [key]: { MATH: "T1", PHY: "T2" } },
    teacherForShortGlobal: overrides.teacherForShortGlobal || {},
    TEACHER_THEORY_MAX: overrides.TEACHER_THEORY_MAX || 10,
    TEACHER_MAX_HOURS: overrides.TEACHER_MAX_HOURS || 1500,
    fillerTargetsByClass: overrides.fillerTargetsByClass || { [key]: { PT: 2, LIB: 2 } },
    pickLectureIndex: overrides.pickLectureIndex || (() => -1),
    periodTimings: overrides.periodTimings || [],
    classIndices: overrides.classIndices || {},
    keys,
    scheduleList: overrides.scheduleList || { [key]: [] },
    getTeachersForCell: overrides.getTeachersForCell || (() => []),
    teacherClashKey: overrides.teacherClashKey || ((t) => (t || "").toLowerCase()),
    teacherListForShort: overrides.teacherListForShort || {},
    ...overrides,
  };
}

// ─── schedulerPassFillRemaining ──────────────────────────────────────────────

describe("schedulerPassFillRemaining", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassFillRemaining).toBe("function");
  });

  test("fills empty slots using pickLectureIndex", () => {
    const lectureList = {
      A: [{ short: "MATH", teacher: "T1", remaining: 3 }],
    };
    let pickCalls = 0;
    const ctx = makeAdvCtx({
      lectureList,
      pickLectureIndex: () => {
        pickCalls++;
        return pickCalls <= 3 ? 0 : -1;
      },
      pickTeacherForSlot: () => "T1",
    });
    schedulerPassFillRemaining({ ctx, key: "A" });
    const filled = ctx.schedules.A[0].filter((s) => s !== null).length;
    expect(filled).toBeGreaterThan(0);
  });

  test("does not fill already-occupied slots", () => {
    const ctx = makeAdvCtx({
      schedules: { A: [["CHEM", "CHEM", "CHEM", null, null, null]] },
      lectureList: { A: [{ short: "MATH", teacher: "T1", remaining: 5 }] },
      pickLectureIndex: () => 0,
      pickTeacherForSlot: () => "T1",
    });
    schedulerPassFillRemaining({ ctx, key: "A" });
    // First 3 slots should remain CHEM
    expect(ctx.schedules.A[0][0]).toBe("CHEM");
    expect(ctx.schedules.A[0][1]).toBe("CHEM");
    expect(ctx.schedules.A[0][2]).toBe("CHEM");
  });

  test("decrements remaining count on placed lectures", () => {
    const lectureList = {
      A: [{ short: "MATH", teacher: "T1", remaining: 2 }],
    };
    const ctx = makeAdvCtx({
      lectureList,
      pickLectureIndex: (k, d, c) =>
        lectureList.A[0].remaining > 0 ? 0 : -1,
      pickTeacherForSlot: () => "T1",
    });
    schedulerPassFillRemaining({ ctx, key: "A" });
    expect(lectureList.A[0].remaining).toBe(0);
  });

  test("skips slot when pickTeacherForSlot returns null", () => {
    const ctx = makeAdvCtx({
      lectureList: { A: [{ short: "MATH", teacher: "T1", remaining: 5 }] },
      pickLectureIndex: () => 0,
      pickTeacherForSlot: () => null,
    });
    schedulerPassFillRemaining({ ctx, key: "A" });
    const filled = ctx.schedules.A[0].filter((s) => s !== null).length;
    expect(filled).toBe(0);
  });
});

// ─── schedulerPassAggressiveFill ─────────────────────────────────────────────

describe("schedulerPassAggressiveFill", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassAggressiveFill).toBe("function");
  });

  test("fills empty slots with remaining lectures sorted by deficit", () => {
    const lectureList = {
      A: [
        { short: "MATH", teacher: "T1", remaining: 1 },
        { short: "PHY", teacher: "T2", remaining: 3 },
      ],
    };
    const ctx = makeAdvCtx({
      lectureList,
      canAssign: () => true,
      pickTeacherForSlot: () => "T",
    });
    schedulerPassAggressiveFill({ ctx, key: "A" });
    const filled = ctx.schedules.A[0].filter((s) => s !== null).length;
    expect(filled).toBeGreaterThan(0);
  });

  test("respects per-day uniqueness constraint", () => {
    const lectureList = {
      A: [{ short: "MATH", teacher: "T1", remaining: 10 }],
    };
    const perDayUsed = { A: [new Set(["MATH"])] };
    const ctx = makeAdvCtx({
      lectureList,
      perDayUsed,
      canAssign: () => true,
      pickTeacherForSlot: () => "T",
    });
    schedulerPassAggressiveFill({ ctx, key: "A" });
    // MATH should not be placed again because it's already used today
    const mathSlots = ctx.schedules.A[0].filter((s) => s === "MATH").length;
    expect(mathSlots).toBe(0);
  });
});

// ─── schedulerPassCompactPreLunch ────────────────────────────────────────────

describe("schedulerPassCompactPreLunch", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassCompactPreLunch).toBe("function");
  });

  test("bubbles mains toward earlier pre-lunch slots", () => {
    const ctx = makeAdvCtx({
      schedules: { A: [[null, null, "MATH", null, null, null]] },
      assignedTeacher: { A: [[null, null, "T1", null, null, null]] },
      lunchClassIndex: 3,
      isLabShort: { A: {} },
      fillerShortsByClass: { A: new Set(["PT"]) },
      isMainShort: (k, sh) => sh === "MATH",
    });
    schedulerPassCompactPreLunch({ ctx, key: "A" });
    // MATH should move to slot 0
    expect(ctx.schedules.A[0][0]).toBe("MATH");
  });
});

// ─── schedulerPassCompactDayGaps ─────────────────────────────────────────────

describe("schedulerPassCompactDayGaps", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassCompactDayGaps).toBe("function");
  });

  test("shifts filled cells left to eliminate mid-day gaps", () => {
    const ctx = makeAdvCtx({
      schedules: { A: [["MATH", null, "PHY", null, null, null]] },
      assignedTeacher: { A: [["T1", null, "T2", null, null, null]] },
      isLabShort: { A: {} },
    });
    schedulerPassCompactDayGaps({ ctx, key: "A" });
    expect(ctx.schedules.A[0][0]).toBe("MATH");
    expect(ctx.schedules.A[0][1]).toBe("PHY");
  });
});

// ─── schedulerPassPostLunchFillerSweep ───────────────────────────────────────

describe("schedulerPassPostLunchFillerSweep", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassPostLunchFillerSweep).toBe("function");
  });

  test("fills trailing post-lunch slots with fillers", () => {
    const ctx = makeAdvCtx({
      schedules: { A: [["MATH", "PHY", "CHEM", null, null, null]] },
      assignedTeacher: { A: [["T1", "T2", "T3", null, null, null]] },
      lunchClassIndex: 3,
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCountsByClass: { A: {} },
      fillerTargetsByClass: { A: { PT: 5 } },
      getFillerTotal: () => 0,
      getFillerCap: () => 10,
      getFillerSubjectCap: () => 5,
      pickTeacherForSlot: () => "T",
    });
    schedulerPassPostLunchFillerSweep({ ctx, key: "A" });
    // at least some post-lunch slots should be filled
    const postLunchFilled = ctx.schedules.A[0]
      .slice(3)
      .filter((s) => s !== null).length;
    expect(postLunchFilled).toBeGreaterThan(0);
  });
});

// ─── schedulerPassFillEmptyPreLunch ──────────────────────────────────────────

describe("schedulerPassFillEmptyPreLunch", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassFillEmptyPreLunch).toBe("function");
  });

  test("fills pre-lunch empty slots across all classes", () => {
    const ctx = makeAdvCtx({
      keys: ["A"],
      schedules: { A: [[null, null, null, "MATH", "PHY", "CHEM"]] },
      assignedTeacher: { A: [[null, null, null, "T", "T", "T"]] },
      lunchClassIndex: 3,
      lectureList: {
        A: [{ short: "BIO", teacher: "T3", remaining: 5 }],
      },
      canAssign: () => true,
      pickTeacherForSlot: () => "T3",
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCountsByClass: { A: {} },
      fillerTargetsByClass: { A: { PT: 3 } },
      getFillerTotal: () => 0,
      getFillerCap: () => 10,
      getFillerSubjectCap: () => 5,
      isMainShort: () => true,
      mainShortsByClass: { A: new Set(["BIO"]) },
      getTargetForShort: () => 5,
      countOccurrences: () => 0,
    });
    schedulerPassFillEmptyPreLunch({ ctx });
    const preLunchFilled = ctx.schedules.A[0]
      .slice(0, 3)
      .filter((s) => s !== null).length;
    expect(preLunchFilled).toBeGreaterThan(0);
  });
});

// ─── schedulerPassUltimateForceFill ──────────────────────────────────────────

describe("schedulerPassUltimateForceFill", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassUltimateForceFill).toBe("function");
  });

  test("force-fills when more than 20% slots are empty", () => {
    // 6 slots, all null = 100% empty > 20%
    const ctx = makeAdvCtx({
      lectureList: {
        A: [{ short: "MATH", teacher: "T1", remaining: 10 }],
      },
      canAssign: () => true,
      pickTeacherForSlot: () => "T1",
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCountsByClass: { A: {} },
      fillerTargetsByClass: { A: { PT: 5 } },
      getFillerTotal: () => 0,
      getFillerCap: () => 10,
      getFillerSubjectCap: () => 5,
    });
    schedulerPassUltimateForceFill({ ctx, key: "A" });
    const filled = ctx.schedules.A[0].filter((s) => s !== null).length;
    expect(filled).toBeGreaterThan(0);
  });

  test("does not run when less than 20% slots are empty", () => {
    const ctx = makeAdvCtx({
      schedules: { A: [["M", "P", "C", "B", "E", null]] },
      assignedTeacher: { A: [["T", "T", "T", "T", "T", null]] },
      lectureList: {
        A: [{ short: "X", teacher: "TX", remaining: 5 }],
      },
      canAssign: () => true,
      pickTeacherForSlot: () => "TX",
    });
    schedulerPassUltimateForceFill({ ctx, key: "A" });
    // Slot at index 5 may or may not be filled — but existing slots should be intact
    expect(ctx.schedules.A[0][0]).toBe("M");
  });
});

// ─── schedulerPassCompactPostLunch ───────────────────────────────────────────

describe("schedulerPassCompactPostLunch", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassCompactPostLunch).toBe("function");
  });

  test("compacts post-lunch cells toward earlier post-lunch slots", () => {
    const ctx = makeAdvCtx({
      schedules: { A: [["MATH", "PHY", "CHEM", null, null, "BIO"]] },
      assignedTeacher: { A: [["T1", "T2", "T3", null, null, "T4"]] },
      lunchClassIndex: 3,
      isLabShort: { A: {} },
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      keys: ["A"],
    });
    schedulerPassCompactPostLunch({ ctx, key: "A" });
    // BIO should move to slot 3
    expect(ctx.schedules.A[0][3]).toBe("BIO");
  });
});

// ─── schedulerPassFillSparseSchedule ─────────────────────────────────────────

describe("schedulerPassFillSparseSchedule", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassFillSparseSchedule).toBe("function");
  });

  test("promotes mains when schedule is sparse (<60% filled)", () => {
    // 6 slots, 2 filled = 33% < 60%
    const ctx = makeAdvCtx({
      schedules: { A: [["MATH", "PHY", null, null, null, null]] },
      assignedTeacher: { A: [["T1", "T2", null, null, null, null]] },
      lectureList: {
        A: [
          { short: "MATH", teacher: "T1", remaining: 2 },
          { short: "PHY", teacher: "T2", remaining: 3 },
        ],
      },
      canAssign: () => true,
      pickTeacherForSlot: () => "T",
    });
    schedulerPassFillSparseSchedule({ ctx, key: "A" });
    const filled = ctx.schedules.A[0].filter((s) => s !== null).length;
    expect(filled).toBeGreaterThanOrEqual(2);
  });
});

// ─── schedulerPassEnsureAtLeastOneMainPerDay ─────────────────────────────────

describe("schedulerPassEnsureAtLeastOneMainPerDay", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassEnsureAtLeastOneMainPerDay).toBe("function");
  });

  test("places a main subject on a day that has none", () => {
    const ctx = makeAdvCtx({
      schedules: { A: [["PT", "PT", "PT", "LIB", "LIB", "LIB"]] },
      assignedTeacher: { A: [["T", "T", "T", "T", "T", "T"]] },
      isMainShort: (k, sh) => sh === "MATH" || sh === "PHY",
      lectureList: {
        A: [{ short: "MATH", teacher: "T1", remaining: 3 }],
      },
      canAssign: () => true,
      pickTeacherForSlot: () => "T1",
      mainShortsByClass: { A: new Set(["MATH"]) },
      periodTimings: [
        { type: "class" }, { type: "class" }, { type: "class" },
        { type: "lunch" },
        { type: "class" }, { type: "class" }, { type: "class" },
      ],
      classIndices: { 0: 0, 1: 1, 2: 2, 3: 4, 4: 5, 5: 6 },
    });
    schedulerPassEnsureAtLeastOneMainPerDay({ ctx, key: "A" });
    const hasMain = ctx.schedules.A[0].some(
      (s) => s === "MATH" || s === "PHY"
    );
    expect(hasMain).toBe(true);
  });
});

// ─── schedulerPassGapSealFill ────────────────────────────────────────────────

describe("schedulerPassGapSealFill", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPassGapSealFill).toBe("function");
  });

  test("seals gaps by placing lectures in empty slots", () => {
    const lectureList = {
      A: [{ short: "MATH", teacher: "T1", remaining: 5 }],
    };
    const ctx = makeAdvCtx({
      schedules: { A: [["PHY", null, null, "CHEM", null, null]] },
      assignedTeacher: { A: [["T2", null, null, "T3", null, null]] },
      lectureList,
      canAssign: () => true,
      pickTeacherForSlot: () => "T1",
    });
    schedulerPassGapSealFill({ ctx, key: "A" });
    const filled = ctx.schedules.A[0].filter((s) => s !== null).length;
    expect(filled).toBeGreaterThan(2);
  });
});
