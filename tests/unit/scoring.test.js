/**
 * @file tests/unit/scoring.test.js
 * @description Tests for schedulerScoreCandidateObjective — the quality scoring function.
 */

describe("schedulerScoreCandidateObjective", () => {
  test("returns negative score for null state", () => {
    const score = schedulerScoreCandidateObjective(null);
    expect(score).toBeLessThan(0);
  });

  test("returns negative score for invalid state", () => {
    const score = schedulerScoreCandidateObjective({});
    expect(score).toBeLessThan(0);
  });

  test("returns positive score for valid simple schedule", () => {
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
      assignedTeacher: {
        A: [
          { 0: "Dr. A", 1: "Dr. B", 2: "Dr. C" },
          { 0: "Dr. B", 1: "Dr. C", 2: "Dr. A" },
        ],
      },
      mainShortsByClass: { A: ["MATH", "OOPS", "WT"] },
      fillerShortsByClass: { A: [] },
      weeklyQuotaByClass: { A: { MATH: 2, OOPS: 2, WT: 2 } },
      fillerCountsByClass: {},
      fillerTargetsByClass: {},
    };
    const score = schedulerScoreCandidateObjective(state);
    expect(score).toBeGreaterThan(0);
  });

  test("score is a number with 4 decimal precision", () => {
    const state = {
      schedulesByClass: { A: [["X"]] },
      keys: ["A"],
      days: 1,
      classesPerDay: 1,
      lunchClassIndex: 0,
      isLabShortByClass: { A: {} },
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
    const score = schedulerScoreCandidateObjective(state);
    expect(typeof score).toBe("number");
    expect(Number.isFinite(score)).toBe(true);
  });
});
