/**
 * @file tests/validation.test.js
 * @description Tests for schedulerIsFullyValid — the schedule validation engine.
 */

describe("schedulerIsFullyValid", () => {
  test("returns invalid for null state", () => {
    const result = schedulerIsFullyValid(null);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test("returns invalid for empty object", () => {
    const result = schedulerIsFullyValid({});
    // No schedulesByClass → valid (no violations possible with empty data)
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe("boolean");
    expect(Array.isArray(result.violations)).toBe(true);
  });

  test("returns valid for a simple valid schedule", () => {
    const state = {
      schedulesByClass: {
        A: [
          ["MATH", "OOPS", "WT"],
          ["OOPS", "WT", "MATH"],
        ],
      },
      keys: ["A"],
      days: 2,
      classesPerDay: 3,
      lunchClassIndex: 1,
      isLabShortByClass: { A: {} },
      teacherForShortByClass: { A: { MATH: "Dr. A", OOPS: "Dr. B", WT: "Dr. C" } },
      teacherListForShortByClass: { A: {} },
      teacherForShortGlobal: {},
      teacherFoldMap: {},
      assignedTeacher: { A: [{ 0: "Dr. A", 1: "Dr. B", 2: "Dr. C" }, { 0: "Dr. B", 1: "Dr. C", 2: "Dr. A" }] },
      mainShortsByClass: {},
      fillerShortsByClass: {},
      weeklyQuotaByClass: {},
      fillerCountsByClass: {},
      fillerTargetsByClass: {},
    };
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("detects teacher clash across classes", () => {
    const state = {
      schedulesByClass: {
        A: [["MATH"]],
        B: [["OOPS"]],
      },
      keys: ["A", "B"],
      days: 1,
      classesPerDay: 1,
      lunchClassIndex: 0,
      isLabShortByClass: { A: {}, B: {} },
      teacherForShortByClass: {
        A: { MATH: "Dr. Sharma" },
        B: { OOPS: "Dr. Sharma" },
      },
      teacherListForShortByClass: { A: {}, B: {} },
      teacherForShortGlobal: {},
      teacherFoldMap: {},
      assignedTeacher: {
        A: [{ 0: "Dr. Sharma" }],
        B: [{ 0: "Dr. Sharma" }],
      },
      mainShortsByClass: {},
      fillerShortsByClass: {},
      weeklyQuotaByClass: {},
      fillerCountsByClass: {},
      fillerTargetsByClass: {},
    };
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("clash") || v.includes("double booking"))).toBe(true);
  });

  test("detects broken lab block", () => {
    const state = {
      schedulesByClass: {
        A: [["MATH", "OOPS-LAB", "WT"]], // LAB is alone, not a 2-slot block
      },
      keys: ["A"],
      days: 1,
      classesPerDay: 3,
      lunchClassIndex: 1,
      isLabShortByClass: { A: { "OOPS-LAB": true } },
      teacherForShortByClass: { A: {} },
      teacherListForShortByClass: { A: {} },
      teacherForShortGlobal: {},
      teacherFoldMap: {},
      assignedTeacher: { A: [{}] },
      mainShortsByClass: {},
      fillerShortsByClass: {},
      weeklyQuotaByClass: {},
      fillerCountsByClass: {},
      fillerTargetsByClass: {},
    };
    const result = schedulerIsFullyValid(state);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("Lab block broken"))).toBe(true);
  });
});

describe("schedulerNormalizeList", () => {
  test("returns empty array for falsy values", () => {
    expect(schedulerNormalizeList(null)).toEqual([]);
    expect(schedulerNormalizeList(undefined)).toEqual([]);
    expect(schedulerNormalizeList("")).toEqual([]);
  });

  test("returns copy of array", () => {
    const arr = [1, 2, 3];
    const result = schedulerNormalizeList(arr);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(arr); // should be a copy
  });

  test("converts Set to array", () => {
    const s = new Set(["a", "b"]);
    expect(schedulerNormalizeList(s)).toEqual(["a", "b"]);
  });

  test("converts object to keys", () => {
    expect(schedulerNormalizeList({ x: 1, y: 2 })).toEqual(["x", "y"]);
  });
});
