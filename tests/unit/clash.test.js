/**
 * @file tests/unit/clash.test.js
 * @description Comprehensive tests for clash detection and schedule validation
 *   in schedulerIsFullyValid — covers teacher clashes, lab conflicts, quota checks,
 *   and structural integrity.
 */

// ─── Helper: builds a minimal valid state ────────────────────────────────────

/**
 * Creates a minimal schedule state for testing.
 * @param {Object} overrides - Properties to merge into the base state.
 * @returns {Object} Schedule state object.
 */
function makeState(overrides = {}) {
  return {
    schedulesByClass: {},
    keys: [],
    days: 0,
    classesPerDay: 0,
    lunchClassIndex: 0,
    isLabShortByClass: {},
    teacherForShortByClass: {},
    teacherListForShortByClass: {},
    teacherForShortGlobal: {},
    teacherFoldMap: {},
    assignedTeacher: {},
    mainShortsByClass: {},
    fillerShortsByClass: {},
    weeklyQuotaByClass: {},
    fillerCountsByClass: {},
    fillerTargetsByClass: {},
    ...overrides,
  };
}

// ─── Cross-class teacher clash detection ─────────────────────────────────────

describe("Teacher clash detection (cross-class)", () => {
  test("no clash when different teachers teach at same slot", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["MATH"]],
        B: [["PHY"]],
      },
      keys: ["A", "B"],
      days: 1,
      classesPerDay: 1,
      teacherForShortByClass: {
        A: { MATH: "Dr. Kumar" },
        B: { PHY: "Dr. Singh" },
      },
      assignedTeacher: {
        A: [{ 0: "Dr. Kumar" }],
        B: [{ 0: "Dr. Singh" }],
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("detects clash when same teacher is in 2 classes at same slot", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["MATH"]],
        B: [["PHY"]],
      },
      keys: ["A", "B"],
      days: 1,
      classesPerDay: 1,
      teacherForShortByClass: {
        A: { MATH: "Dr. Sharma" },
        B: { PHY: "Dr. Sharma" },
      },
      assignedTeacher: {
        A: [{ 0: "Dr. Sharma" }],
        B: [{ 0: "Dr. Sharma" }],
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /clash|double booking/i.test(v))).toBe(true);
  });

  test("no clash when same teacher teaches in different slots", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["MATH", ""]],
        B: [["", "PHY"]],
      },
      keys: ["A", "B"],
      days: 1,
      classesPerDay: 2,
      teacherForShortByClass: {
        A: { MATH: "Dr. Sharma" },
        B: { PHY: "Dr. Sharma" },
      },
      assignedTeacher: {
        A: [{ 0: "Dr. Sharma", 1: "" }],
        B: [{ 0: "", 1: "Dr. Sharma" }],
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(true);
  });

  test("detects clash across 3+ classes at same slot", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["MATH"]],
        B: [["PHY"]],
        C: [["CHEM"]],
      },
      keys: ["A", "B", "C"],
      days: 1,
      classesPerDay: 1,
      teacherForShortByClass: {
        A: { MATH: "Dr. X" },
        B: { PHY: "Dr. X" },
        C: { CHEM: "Dr. X" },
      },
      assignedTeacher: {
        A: [{ 0: "Dr. X" }],
        B: [{ 0: "Dr. X" }],
        C: [{ 0: "Dr. X" }],
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /clash|double booking/i.test(v))).toBe(true);
  });

  test("clashes on different days are independent", () => {
    // Day 1: both have Dr. A (clash). Day 2: different teachers (no clash)
    const state = makeState({
      schedulesByClass: {
        A: [["MATH"], ["PHY"]],
        B: [["CHEM"], ["BIO"]],
      },
      keys: ["A", "B"],
      days: 2,
      classesPerDay: 1,
      teacherForShortByClass: {
        A: { MATH: "Dr. A", PHY: "Dr. B" },
        B: { CHEM: "Dr. A", BIO: "Dr. C" },
      },
      assignedTeacher: {
        A: [{ 0: "Dr. A" }, { 0: "Dr. B" }],
        B: [{ 0: "Dr. A" }, { 0: "Dr. C" }],
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    // Only Day 1 should have a clash
    const clashViolations = result.violations.filter((v) => /clash|double booking/i.test(v));
    expect(clashViolations.length).toBeGreaterThan(0);
    expect(clashViolations.some((v) => /Day 1/i.test(v))).toBe(true);
  });
});

// ─── Lab block integrity ────────────────────────────────────────────────────

describe("Lab block integrity", () => {
  test("valid: lab occupies 2 adjacent slots", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["OS-LAB", "OS-LAB", "MATH"]],
      },
      keys: ["A"],
      days: 1,
      classesPerDay: 3,
      lunchClassIndex: 1,
      isLabShortByClass: { A: { "OS-LAB": true } },
      teacherForShortByClass: { A: { "OS-LAB": "Dr. A", MATH: "Dr. B" } },
      assignedTeacher: { A: [{ 0: "Dr. A", 1: "Dr. A", 2: "Dr. B" }] },
    });
    const result = schedulerIsFullyValid(state);
    const labViolations = result.violations.filter((v) => /lab block broken/i.test(v));
    expect(labViolations).toHaveLength(0);
  });

  test("invalid: orphan lab cell (only 1 slot)", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["MATH", "OS-LAB", "PHY"]],
      },
      keys: ["A"],
      days: 1,
      classesPerDay: 3,
      lunchClassIndex: 1,
      isLabShortByClass: { A: { "OS-LAB": true } },
      teacherForShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /Lab block broken/i.test(v))).toBe(true);
  });

  test("invalid: lab split across lunch boundary", () => {
    // lunchClassIndex = 2 means lunch is between slot 1 and slot 2
    const state = makeState({
      schedulesByClass: {
        A: [["MATH", "OS-LAB", "OS-LAB", "PHY"]],
      },
      keys: ["A"],
      days: 1,
      classesPerDay: 4,
      lunchClassIndex: 2,
      isLabShortByClass: { A: { "OS-LAB": true } },
      teacherForShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /Lab split across lunch/i.test(v))).toBe(true);
  });

  test("multiple lab subjects — each must have paired slots", () => {
    // OS-LAB correct (slots 0-1), DB-LAB broken (only slot 3)
    const state = makeState({
      schedulesByClass: {
        A: [["OS-LAB", "OS-LAB", "MATH", "DB-LAB", "PHY"]],
      },
      keys: ["A"],
      days: 1,
      classesPerDay: 5,
      lunchClassIndex: 2,
      isLabShortByClass: { A: { "OS-LAB": true, "DB-LAB": true } },
      teacherForShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    const labViolations = result.violations.filter((v) => /Lab block broken/i.test(v));
    // Only DB-LAB should be broken
    expect(labViolations.length).toBeGreaterThanOrEqual(1);
    expect(labViolations.some((v) => v.includes("DB-LAB"))).toBe(true);
  });
});

// ─── Lab room double-booking ─────────────────────────────────────────────────

describe("Lab room double-booking", () => {
  test("no conflict when different rooms assigned", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["OS-LAB", "OS-LAB"]],
        B: [["DB-LAB", "DB-LAB"]],
      },
      keys: ["A", "B"],
      days: 1,
      classesPerDay: 2,
      isLabShortByClass: {
        A: { "OS-LAB": true },
        B: { "DB-LAB": true },
      },
      labNumberAssigned: {
        A: { 0: { 0: "Lab1", 1: "Lab1" } },
        B: { 0: { 0: "Lab2", 1: "Lab2" } },
      },
      teacherForShortByClass: { A: { "OS-LAB": "Dr. A" }, B: { "DB-LAB": "Dr. B" } },
      assignedTeacher: {
        A: [{ 0: "Dr. A", 1: "Dr. A" }],
        B: [{ 0: "Dr. B", 1: "Dr. B" }],
      },
    });
    const result = schedulerIsFullyValid(state);
    const labRoomViolations = result.violations.filter((v) => /lab room.*double/i.test(v));
    expect(labRoomViolations).toHaveLength(0);
  });

  test("detects conflict when same room assigned to 2 classes at same slot", () => {
    const state = makeState({
      schedulesByClass: {
        A: [["OS-LAB", "OS-LAB"]],
        B: [["DB-LAB", "DB-LAB"]],
      },
      keys: ["A", "B"],
      days: 1,
      classesPerDay: 2,
      isLabShortByClass: {
        A: { "OS-LAB": true },
        B: { "DB-LAB": true },
      },
      labNumberAssigned: {
        A: { 0: { 0: "Lab1", 1: "Lab1" } },
        B: { 0: { 0: "Lab1", 1: "Lab1" } }, // same room!
      },
      teacherForShortByClass: { A: { "OS-LAB": "Dr. A" }, B: { "DB-LAB": "Dr. B" } },
      assignedTeacher: {
        A: [{ 0: "Dr. A", 1: "Dr. A" }],
        B: [{ 0: "Dr. B", 1: "Dr. B" }],
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /lab room.*double/i.test(v))).toBe(true);
  });
});

// ─── Weekly quota validation ─────────────────────────────────────────────────

describe("Weekly quota (main subject credit fulfillment)", () => {
  test("valid when all main subjects meet their target", () => {
    // Target: MATH=2, PHY=2. Schedule has 2 of each.
    const state = makeState({
      schedulesByClass: {
        A: [
          ["MATH", "PHY"],
          ["PHY", "MATH"],
        ],
      },
      keys: ["A"],
      days: 2,
      classesPerDay: 2,
      mainShortsByClass: { A: ["MATH", "PHY"] },
      weeklyQuotaByClass: { A: { MATH: 2, PHY: 2 } },
      teacherForShortByClass: { A: { MATH: "Dr. A", PHY: "Dr. B" } },
      assignedTeacher: {
        A: [
          { 0: "Dr. A", 1: "Dr. B" },
          { 0: "Dr. B", 1: "Dr. A" },
        ],
      },
    });
    const result = schedulerIsFullyValid(state);
    const quotaViolations = result.violations.filter((v) => /quota unmet/i.test(v));
    expect(quotaViolations).toHaveLength(0);
  });

  test("violation when main subject count < target", () => {
    // Target: MATH=3, but only 1 occurrence in schedule
    const state = makeState({
      schedulesByClass: {
        A: [["MATH"]],
      },
      keys: ["A"],
      days: 1,
      classesPerDay: 1,
      mainShortsByClass: { A: ["MATH"] },
      weeklyQuotaByClass: { A: { MATH: 3 } },
      teacherForShortByClass: { A: { MATH: "Dr. A" } },
      assignedTeacher: { A: [{ 0: "Dr. A" }] },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.violations.some((v) => /quota unmet.*MATH.*1\/3/i.test(v))).toBe(true);
  });
});

// ─── Filler count integrity ─────────────────────────────────────────────────

describe("Filler count integrity", () => {
  test("no violation when filler counts are within target", () => {
    const state = makeState({
      schedulesByClass: { A: [["LIB"]] },
      keys: ["A"],
      days: 1,
      classesPerDay: 1,
      fillerCountsByClass: { A: { LIB: 1 } },
      fillerTargetsByClass: { A: { LIB: 2 } },
      teacherForShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
    });
    const result = schedulerIsFullyValid(state);
    const fillerViolations = result.violations.filter((v) => /filler/i.test(v));
    expect(fillerViolations).toHaveLength(0);
  });

  test("violation when filler has negative count", () => {
    const state = makeState({
      schedulesByClass: { A: [[]] },
      keys: ["A"],
      days: 1,
      classesPerDay: 0,
      fillerCountsByClass: { A: { LIB: -1 } },
      fillerTargetsByClass: { A: { LIB: 2 } },
      teacherForShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.violations.some((v) => /negative filler/i.test(v))).toBe(true);
  });

  test("violation when filler exceeds target", () => {
    const state = makeState({
      schedulesByClass: { A: [["LIB", "LIB", "LIB"]] },
      keys: ["A"],
      days: 1,
      classesPerDay: 3,
      fillerCountsByClass: { A: { LIB: 3 } },
      fillerTargetsByClass: { A: { LIB: 1 } },
      teacherForShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.violations.some((v) => /filler over-quota/i.test(v))).toBe(true);
  });
});

// ─── Structural integrity ────────────────────────────────────────────────────

describe("Structural integrity", () => {
  test("detects missing schedule matrix", () => {
    const state = makeState({
      schedulesByClass: { A: null },
      keys: ["A"],
      days: 1,
      classesPerDay: 1,
    });
    const result = schedulerIsFullyValid(state);
    expect(result.violations.some((v) => /matrix missing/i.test(v))).toBe(true);
  });

  test("detects missing row for a day", () => {
    const state = makeState({
      schedulesByClass: { A: [null] },
      keys: ["A"],
      days: 1,
      classesPerDay: 1,
    });
    const result = schedulerIsFullyValid(state);
    expect(result.violations.some((v) => /row missing/i.test(v))).toBe(true);
  });

  test("returns valid=false for null state", () => {
    const result = schedulerIsFullyValid(null);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test("handles empty schedule (no classes) gracefully", () => {
    const state = makeState({
      schedulesByClass: {},
      keys: [],
      days: 0,
      classesPerDay: 0,
    });
    const result = schedulerIsFullyValid(state);
    // Empty schedule has no violations
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

// ─── Utility: schedulerNormalizeList ─────────────────────────────────────────

describe("schedulerNormalizeList (extended)", () => {
  test("handles nested null values", () => {
    expect(schedulerNormalizeList(false)).toEqual([]);
    expect(schedulerNormalizeList(0)).toEqual([]);
  });

  test("handles string input gracefully", () => {
    // String is not array/set/object, so should return []
    expect(schedulerNormalizeList("abc")).toEqual([]);
  });

  test("handles Set with mixed types", () => {
    const s = new Set([1, "two", null, undefined]);
    const result = schedulerNormalizeList(s);
    expect(result).toContain(1);
    expect(result).toContain("two");
    expect(result).toHaveLength(4);
  });
});

// ─── Utility: schedulerBuildSetMapSnapshot ───────────────────────────────────

describe("schedulerBuildSetMapSnapshot", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerBuildSetMapSnapshot).toBe("function");
  });

  test("returns object with empty arrays for missing keys", () => {
    const result = schedulerBuildSetMapSnapshot({}, ["A", "B"]);
    expect(result.A).toEqual([]);
    expect(result.B).toEqual([]);
  });

  test("converts Set values to arrays", () => {
    const source = { A: new Set(["MATH", "PHY"]) };
    const result = schedulerBuildSetMapSnapshot(source, ["A"]);
    expect(result.A).toContain("MATH");
    expect(result.A).toContain("PHY");
  });

  test("filters out falsy values", () => {
    const source = { A: ["MATH", null, "", "PHY", undefined] };
    const result = schedulerBuildSetMapSnapshot(source, ["A"]);
    expect(result.A).toEqual(["MATH", "PHY"]);
  });
});

// ─── Utility: schedulerBuildTeacherListSnapshot ──────────────────────────────

describe("schedulerBuildTeacherListSnapshot", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerBuildTeacherListSnapshot).toBe("function");
  });

  test("produces normalized teacher lists per short", () => {
    const source = {
      A: { MATH: ["Dr. Kumar", "  Dr. Singh  "] },
    };
    const result = schedulerBuildTeacherListSnapshot(source, ["A"]);
    expect(result.A.MATH).toEqual(["Dr. Kumar", "Dr. Singh"]);
  });

  test("returns empty object for missing class key", () => {
    const result = schedulerBuildTeacherListSnapshot({}, ["A"]);
    expect(result.A).toEqual({});
  });
});

// ─── Utility: schedulerTeacherValidationKey ──────────────────────────────────

describe("schedulerTeacherValidationKey", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerTeacherValidationKey).toBe("function");
  });

  test("returns canonical name when no fold map", () => {
    const state = { teacherFoldMap: {} };
    const key = schedulerTeacherValidationKey(state, "Dr. Kumar");
    expect(key).toBe(canonicalTeacherName("Dr. Kumar"));
  });

  test("applies fold map to resolve aliases", () => {
    const canon = canonicalTeacherName("Dr. Kumar");
    const state = { teacherFoldMap: { [canon]: "master_kumar" } };
    const key = schedulerTeacherValidationKey(state, "Dr. Kumar");
    expect(key).toBe("master_kumar");
  });

  test("returns empty string for empty teacher", () => {
    const state = { teacherFoldMap: {} };
    expect(schedulerTeacherValidationKey(state, "")).toBe("");
    expect(schedulerTeacherValidationKey(state, null)).toBe("");
  });
});

// ─── Utility: schedulerGetTeachersForValidationCell ──────────────────────────

describe("schedulerGetTeachersForValidationCell", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetTeachersForValidationCell).toBe("function");
  });

  test("returns assigned teacher for normal subject", () => {
    const state = {
      isLabShortByClass: { A: {} },
      assignedTeacher: { A: [{ 0: "Dr. Kumar" }] },
      teacherForShortByClass: { A: { MATH: "Dr. Kumar" } },
    };
    const teachers = schedulerGetTeachersForValidationCell(state, "A", "MATH", 0, 0);
    expect(teachers).toEqual(["Dr. Kumar"]);
  });

  test("returns empty for null/empty short", () => {
    const state = {
      isLabShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
    };
    expect(schedulerGetTeachersForValidationCell(state, "A", "", 0, 0)).toEqual([]);
    expect(schedulerGetTeachersForValidationCell(state, "A", null, 0, 0)).toEqual([]);
  });

  test("returns teacher list for lab subjects", () => {
    const state = {
      isLabShortByClass: { A: { "OS-LAB": true } },
      teacherListForShortByClass: { A: { "OS-LAB": ["Dr. A", "Dr. B"] } },
      assignedTeacher: { A: [{}] },
    };
    const teachers = schedulerGetTeachersForValidationCell(state, "A", "OS-LAB", 0, 0);
    expect(teachers).toContain("Dr. A");
    expect(teachers).toContain("Dr. B");
  });

  test("falls back to teacherForShortByClass when no assigned teacher", () => {
    const state = {
      isLabShortByClass: { A: {} },
      assignedTeacher: { A: [{}] }, // no specific assignment at col 0
      teacherForShortByClass: { A: { MATH: "Dr. Fallback" } },
    };
    const teachers = schedulerGetTeachersForValidationCell(state, "A", "MATH", 0, 0);
    expect(teachers).toEqual(["Dr. Fallback"]);
  });

  test("falls back to teacherForShortGlobal when class-level not found", () => {
    const state = {
      isLabShortByClass: { A: {} },
      assignedTeacher: { A: [{}] },
      teacherForShortByClass: { A: {} },
      teacherForShortGlobal: { MATH: "Dr. Global" },
    };
    const teachers = schedulerGetTeachersForValidationCell(state, "A", "MATH", 0, 0);
    expect(teachers).toEqual(["Dr. Global"]);
  });
});

// ─── Complex multi-day multi-class scenarios ─────────────────────────────────

describe("Complex multi-day scenarios", () => {
  test("full week schedule with no clashes passes validation", () => {
    const state = makeState({
      schedulesByClass: {
        A: [
          ["MATH", "PHY", "CHEM"],
          ["PHY", "CHEM", "MATH"],
          ["CHEM", "MATH", "PHY"],
        ],
        B: [
          ["BIO", "ENG", "CS"],
          ["ENG", "CS", "BIO"],
          ["CS", "BIO", "ENG"],
        ],
      },
      keys: ["A", "B"],
      days: 3,
      classesPerDay: 3,
      lunchClassIndex: 1,
      teacherForShortByClass: {
        A: { MATH: "Dr. A", PHY: "Dr. B", CHEM: "Dr. C" },
        B: { BIO: "Dr. D", ENG: "Dr. E", CS: "Dr. F" },
      },
      assignedTeacher: {
        A: [
          { 0: "Dr. A", 1: "Dr. B", 2: "Dr. C" },
          { 0: "Dr. B", 1: "Dr. C", 2: "Dr. A" },
          { 0: "Dr. C", 1: "Dr. A", 2: "Dr. B" },
        ],
        B: [
          { 0: "Dr. D", 1: "Dr. E", 2: "Dr. F" },
          { 0: "Dr. E", 1: "Dr. F", 2: "Dr. D" },
          { 0: "Dr. F", 1: "Dr. D", 2: "Dr. E" },
        ],
      },
      mainShortsByClass: {
        A: ["MATH", "PHY", "CHEM"],
        B: ["BIO", "ENG", "CS"],
      },
      weeklyQuotaByClass: {
        A: { MATH: 3, PHY: 3, CHEM: 3 },
        B: { BIO: 3, ENG: 3, CS: 3 },
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("detects single clash in otherwise valid complex schedule", () => {
    // Both A and B have Dr. A at Day 1, Slot 0
    const state = makeState({
      schedulesByClass: {
        A: [
          ["MATH", "PHY"],
          ["PHY", "MATH"],
        ],
        B: [
          ["BIO", "ENG"],
          ["ENG", "BIO"],
        ],
      },
      keys: ["A", "B"],
      days: 2,
      classesPerDay: 2,
      lunchClassIndex: 1,
      teacherForShortByClass: {
        A: { MATH: "Dr. A", PHY: "Dr. B" },
        B: { BIO: "Dr. A", ENG: "Dr. C" }, // Dr. A clash at Day 1 Slot 0
      },
      assignedTeacher: {
        A: [
          { 0: "Dr. A", 1: "Dr. B" },
          { 0: "Dr. B", 1: "Dr. A" },
        ],
        B: [
          { 0: "Dr. A", 1: "Dr. C" }, // clash here!
          { 0: "Dr. C", 1: "Dr. A" },
        ],
      },
      mainShortsByClass: {
        A: ["MATH", "PHY"],
        B: ["BIO", "ENG"],
      },
      weeklyQuotaByClass: {
        A: { MATH: 2, PHY: 2 },
        B: { BIO: 2, ENG: 2 },
      },
    });
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    const clashesDay1 = result.violations.filter((v) => /Day 1.*Slot 1/i.test(v) && /clash|double/i.test(v));
    expect(clashesDay1.length).toBeGreaterThan(0);
  });
});
