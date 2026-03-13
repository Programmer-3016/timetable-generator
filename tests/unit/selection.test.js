/**
 * @file tests/unit/selection.test.js
 * @description Tests for scheduler/selection.js: common-teacher, slot preference, lecture picking.
 */

// ─── schedulerIsCommonFor ────────────────────────────────────────────────────

describe("schedulerIsCommonFor", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerIsCommonFor).toBe("function");
  });

  test("returns true when teacher teaches in another class", () => {
    const result = schedulerIsCommonFor({
      keys: ["A", "B"],
      teacherSet: { A: new Set(["T1"]), B: new Set(["T1", "T2"]) },
      key: "A",
      teacher: "T1",
    });
    expect(result).toBe(true);
  });

  test("returns false when teacher is only in current class", () => {
    const result = schedulerIsCommonFor({
      keys: ["A", "B"],
      teacherSet: { A: new Set(["T1"]), B: new Set(["T2"]) },
      key: "A",
      teacher: "T1",
    });
    expect(result).toBe(false);
  });

  test("returns false for null/empty teacher", () => {
    expect(
      schedulerIsCommonFor({
        keys: ["A", "B"],
        teacherSet: { A: new Set(), B: new Set() },
        key: "A",
        teacher: "",
      })
    ).toBe(false);
    expect(
      schedulerIsCommonFor({
        keys: ["A"],
        teacherSet: { A: new Set() },
        key: "A",
        teacher: null,
      })
    ).toBe(false);
  });

  test("returns false with single class", () => {
    const result = schedulerIsCommonFor({
      keys: ["A"],
      teacherSet: { A: new Set(["T1"]) },
      key: "A",
      teacher: "T1",
    });
    expect(result).toBe(false);
  });

  test("detects common teacher across 3+ classes", () => {
    const result = schedulerIsCommonFor({
      keys: ["A", "B", "C"],
      teacherSet: {
        A: new Set(["T1"]),
        B: new Set(["T2"]),
        C: new Set(["T1"]),
      },
      key: "A",
      teacher: "T1",
    });
    expect(result).toBe(true);
  });
});

// ─── schedulerPreferredForSlot ───────────────────────────────────────────────

describe("schedulerPreferredForSlot", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPreferredForSlot).toBe("function");
  });

  test("returns false when teacher is not common", () => {
    const result = schedulerPreferredForSlot({
      keys: ["A", "B"],
      lunchClassIndex: 3,
      key: "A",
      day: 0,
      col: 0,
      teacher: "T1",
      isCommonFor: () => false,
    });
    expect(result).toBe(false);
  });

  test("classIdx=0: prefers pre-lunch slots", () => {
    const result = schedulerPreferredForSlot({
      keys: ["A", "B"],
      lunchClassIndex: 3,
      key: "A",
      day: 0,
      col: 1,
      teacher: "T1",
      isCommonFor: () => true,
    });
    expect(result).toBe(true);
  });

  test("classIdx=0: does not prefer post-lunch slots", () => {
    const result = schedulerPreferredForSlot({
      keys: ["A", "B"],
      lunchClassIndex: 3,
      key: "A",
      day: 0,
      col: 4,
      teacher: "T1",
      isCommonFor: () => true,
    });
    expect(result).toBe(false);
  });

  test("classIdx=1: prefers post-lunch slots", () => {
    const result = schedulerPreferredForSlot({
      keys: ["A", "B"],
      lunchClassIndex: 3,
      key: "B",
      day: 0,
      col: 4,
      teacher: "T1",
      isCommonFor: () => true,
    });
    expect(result).toBe(true);
  });

  test("classIdx=1: does not prefer pre-lunch slots", () => {
    const result = schedulerPreferredForSlot({
      keys: ["A", "B"],
      lunchClassIndex: 3,
      key: "B",
      day: 0,
      col: 1,
      teacher: "T1",
      isCommonFor: () => true,
    });
    expect(result).toBe(false);
  });
});

// ─── schedulerPickLectureIndex ───────────────────────────────────────────────

describe("schedulerPickLectureIndex", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPickLectureIndex).toBe("function");
  });

  test("returns -1 when lecture list is empty", () => {
    const result = schedulerPickLectureIndex({
      lectureList: { A: [] },
      key: "A",
      day: 0,
      col: 0,
      lunchClassIndex: 3,
      classesPerDay: 6,
      perDayUsed: { A: [new Set()] },
      canAssign: () => true,
      ensureTP: () => ({ pre: 0, post: 0 }),
      isMainShort: () => true,
      preferredForSlot: () => false,
      randomFn: () => 0.5,
    });
    expect(result).toBe(-1);
  });

  test("returns -1 when all lectures have remaining=0", () => {
    const result = schedulerPickLectureIndex({
      lectureList: {
        A: [
          { short: "MATH", teacher: "T1", remaining: 0 },
          { short: "PHY", teacher: "T2", remaining: 0 },
        ],
      },
      key: "A",
      day: 0,
      col: 0,
      lunchClassIndex: 3,
      classesPerDay: 6,
      perDayUsed: { A: [new Set()] },
      canAssign: () => true,
      ensureTP: () => ({ pre: 0, post: 0 }),
      isMainShort: () => true,
      preferredForSlot: () => false,
      randomFn: () => 0.5,
    });
    expect(result).toBe(-1);
  });

  test("skips lectures already used today", () => {
    const result = schedulerPickLectureIndex({
      lectureList: {
        A: [
          { short: "MATH", teacher: "T1", remaining: 3 },
          { short: "PHY", teacher: "T2", remaining: 3 },
        ],
      },
      key: "A",
      day: 0,
      col: 0,
      lunchClassIndex: 3,
      classesPerDay: 6,
      perDayUsed: { A: [new Set(["MATH"])] },
      canAssign: () => true,
      ensureTP: () => ({ pre: 0, post: 0 }),
      isMainShort: () => true,
      preferredForSlot: () => false,
      randomFn: () => 0,
    });
    expect(result).toBe(1); // PHY at index 1
  });

  test("skips lectures that canAssign rejects", () => {
    const result = schedulerPickLectureIndex({
      lectureList: {
        A: [
          { short: "MATH", teacher: "T1", remaining: 3 },
          { short: "PHY", teacher: "T2", remaining: 3 },
        ],
      },
      key: "A",
      day: 0,
      col: 0,
      lunchClassIndex: 3,
      classesPerDay: 6,
      perDayUsed: { A: [new Set()] },
      canAssign: (k, s) => s !== "MATH",
      ensureTP: () => ({ pre: 0, post: 0 }),
      isMainShort: () => true,
      preferredForSlot: () => false,
      randomFn: () => 0,
    });
    expect(result).toBe(1);
  });

  test("picks lecture with highest remaining quota (more negative quotaBias)", () => {
    const result = schedulerPickLectureIndex({
      lectureList: {
        A: [
          { short: "MATH", teacher: "T1", remaining: 1 },
          { short: "PHY", teacher: "T2", remaining: 5 },
        ],
      },
      key: "A",
      day: 0,
      col: 0,
      lunchClassIndex: 3,
      classesPerDay: 6,
      perDayUsed: { A: [new Set()] },
      canAssign: () => true,
      ensureTP: () => ({ pre: 0, post: 0 }),
      isMainShort: () => true,
      preferredForSlot: () => false,
      randomFn: () => 0,
    });
    expect(result).toBe(1); // PHY has higher remaining
  });

  test("uses fallback RNG when randomFn is not provided", () => {
    const result = schedulerPickLectureIndex({
      lectureList: {
        A: [{ short: "MATH", teacher: "T1", remaining: 3 }],
      },
      key: "A",
      day: 0,
      col: 0,
      lunchClassIndex: 3,
      classesPerDay: 6,
      perDayUsed: { A: [new Set()] },
      canAssign: () => true,
      ensureTP: () => ({ pre: 0, post: 0 }),
      isMainShort: () => true,
      preferredForSlot: () => false,
    });
    expect(result).toBe(0);
  });
});
