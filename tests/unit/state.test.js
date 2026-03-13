/**
 * @file tests/unit/state.test.js
 * @description Tests for scheduler/state.js — container initialization,
 *   subject map population, filler targets, and quota merging.
 */

// ─── schedulerCreateTeacherTheoryCountByClass ────────────────────────────────

describe("schedulerCreateTeacherTheoryCountByClass", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerCreateTeacherTheoryCountByClass).toBe("function");
  });

  test("creates empty object for each key", () => {
    const result = schedulerCreateTeacherTheoryCountByClass({ keys: ["A", "B"] });
    expect(result).toEqual({ A: {}, B: {} });
  });

  test("returns empty object for no keys", () => {
    const result = schedulerCreateTeacherTheoryCountByClass({ keys: [] });
    expect(result).toEqual({});
  });
});

// ─── schedulerCreateClassContainers ──────────────────────────────────────────

describe("schedulerCreateClassContainers", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerCreateClassContainers).toBe("function");
  });

  test("creates all expected container keys", () => {
    const result = schedulerCreateClassContainers({
      keys: ["A"],
      days: 5,
      classesPerDay: 6,
    });
    expect(result).toHaveProperty("schedules");
    expect(result).toHaveProperty("assignedTeacher");
    expect(result).toHaveProperty("perDayUsed");
    expect(result).toHaveProperty("labPeriodsUsedPerDay");
    expect(result).toHaveProperty("subjectByShort");
    expect(result).toHaveProperty("teacherForShort");
    expect(result).toHaveProperty("teacherListForShort");
    expect(result).toHaveProperty("isLabShort");
    expect(result).toHaveProperty("weeklyQuota");
    expect(result).toHaveProperty("lectureList");
    expect(result).toHaveProperty("hasLabDay");
    expect(result).toHaveProperty("theoryOnLabDayCount");
  });

  test("creates schedule grid with correct dimensions", () => {
    const result = schedulerCreateClassContainers({
      keys: ["A"],
      days: 3,
      classesPerDay: 4,
    });
    expect(result.schedules.A.length).toBe(3);
    expect(result.schedules.A[0].length).toBe(4);
    expect(result.schedules.A[0].every((v) => v === null)).toBe(true);
  });

  test("creates assigned teacher grid matching schedule dimensions", () => {
    const result = schedulerCreateClassContainers({
      keys: ["A"],
      days: 2,
      classesPerDay: 5,
    });
    expect(result.assignedTeacher.A.length).toBe(2);
    expect(result.assignedTeacher.A[0].length).toBe(5);
  });

  test("creates containers for multiple keys", () => {
    const result = schedulerCreateClassContainers({
      keys: ["A", "B", "C"],
      days: 5,
      classesPerDay: 6,
    });
    expect(Object.keys(result.schedules)).toEqual(["A", "B", "C"]);
    expect(Object.keys(result.assignedTeacher)).toEqual(["A", "B", "C"]);
    expect(result.lectureList.A).toEqual([]);
    expect(result.lectureList.B).toEqual([]);
  });

  test("perDayUsed contains Sets for each day", () => {
    const result = schedulerCreateClassContainers({
      keys: ["A"],
      days: 3,
      classesPerDay: 4,
    });
    expect(result.perDayUsed.A.length).toBe(3);
    expect(result.perDayUsed.A[0]).toBeInstanceOf(Set);
  });

  test("labPeriodsUsedPerDay initialized to 0", () => {
    const result = schedulerCreateClassContainers({
      keys: ["A"],
      days: 5,
      classesPerDay: 6,
    });
    expect(result.labPeriodsUsedPerDay.A).toEqual([0, 0, 0, 0, 0]);
  });

  test("hasLabDay initialized to false for each day", () => {
    const result = schedulerCreateClassContainers({
      keys: ["A"],
      days: 3,
      classesPerDay: 4,
    });
    expect(result.hasLabDay.A).toEqual([false, false, false]);
  });
});

// ─── schedulerPopulateClassSubjectMapsAndQuotas ──────────────────────────────

describe("schedulerPopulateClassSubjectMapsAndQuotas", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPopulateClassSubjectMapsAndQuotas).toBe("function");
  });

  test("populates subjectByShort for each class", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Mathematics", teacher: "Dr. A", credits: 4 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set() },
      isLabPair: (p) => /lab/i.test(p.short),
    });

    expect(subjectByShort.A.MATH).toBeDefined();
    expect(subjectByShort.A.MATH.subject).toBe("Mathematics");
  });

  test("populates teacherForShort correctly", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "Dr. Kumar", credits: 3 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set() },
      isLabPair: () => false,
    });

    expect(teacherForShort.A.MATH).toBe("Dr. Kumar");
  });

  test("sets weeklyQuota as credits + 1", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "T", credits: 3 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set() },
      isLabPair: () => false,
    });

    expect(weeklyQuota.A.MATH).toBe(4);
  });

  test("builds lectureList with remaining count", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "T1", credits: 4 },
            { short: "PHY", subject: "Physics", teacher: "T2", credits: 3 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set() },
      isLabPair: () => false,
    });

    expect(lectureList.A.length).toBe(2);
    expect(lectureList.A[0].short).toBe("MATH");
    expect(lectureList.A[0].remaining).toBe(5);
    expect(lectureList.A[1].short).toBe("PHY");
    expect(lectureList.A[1].remaining).toBe(4);
  });

  test("excludes filler shorts from lectureList", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "T", credits: 3 },
            { short: "PT", subject: "PT", teacher: "T2", credits: 1 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set(["PT"]) },
      isLabPair: () => false,
    });

    expect(lectureList.A.length).toBe(1);
    expect(lectureList.A[0].short).toBe("MATH");
  });

  test("excludes lab pairs from lectureList", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "T", credits: 3 },
            { short: "CSLAB", subject: "CS Lab", teacher: "T2", credits: 2 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set() },
      isLabPair: (p) => /lab/i.test(p.short),
    });

    expect(lectureList.A.length).toBe(1);
    expect(lectureList.A[0].short).toBe("MATH");
  });

  test("marks isLabShort correctly", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "T", credits: 3 },
            { short: "CSLAB", subject: "CS Lab", teacher: "T2", credits: 2 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set() },
      isLabPair: (p) => /lab/i.test(p.short),
    });

    expect(isLabShort.A.CSLAB).toBe(true);
    expect(isLabShort.A.MATH).toBe(false);
  });

  test("demotes teacherless non-lab subjects to fillers", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };
    const fillerShortsByClass = { A: new Set() };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "T", credits: 3 },
            { short: "ART", subject: "Art", teacher: "Not Mentioned", credits: 1 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass,
      isLabPair: () => false,
    });

    expect(fillerShortsByClass.A.has("ART")).toBe(true);
    // ART should NOT be in lecture list since it became a filler
    expect(lectureList.A.some((l) => l.short === "ART")).toBe(false);
  });

  test("deduplicates lecture entries (last definition wins)", () => {
    const subjectByShort = { A: {} };
    const teacherForShort = { A: {} };
    const teacherListForShort = { A: {} };
    const isLabShort = { A: {} };
    const weeklyQuota = { A: {} };
    const lectureList = { A: [] };

    schedulerPopulateClassSubjectMapsAndQuotas({
      data: [
        {
          key: "A",
          pairs: [
            { short: "MATH", subject: "Math", teacher: "T1", credits: 3 },
            { short: "MATH", subject: "Math", teacher: "T2", credits: 4 },
          ],
        },
      ],
      subjectByShort,
      teacherForShort,
      teacherListForShort,
      isLabShort,
      weeklyQuota,
      lectureList,
      fillerShortsByClass: { A: new Set() },
      isLabPair: () => false,
    });

    expect(lectureList.A.length).toBe(1);
    expect(weeklyQuota.A.MATH).toBe(5); // credits=4 → 4+1=5
  });
});

// ─── schedulerBuildFillerTargetsAndCounts ─────────────────────────────────────

describe("schedulerBuildFillerTargetsAndCounts", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerBuildFillerTargetsAndCounts).toBe("function");
  });

  test("builds targets with default value of 2 per filler", () => {
    const result = schedulerBuildFillerTargetsAndCounts({
      keys: ["A"],
      fillerShortsByClass: { A: new Set(["PT", "LIB"]) },
      fillerCreditsByClass: {},
    });

    expect(result.fillerTargetsByClass.A.PT).toBe(2);
    expect(result.fillerTargetsByClass.A.LIB).toBe(2);
  });

  test("initializes counts to 0", () => {
    const result = schedulerBuildFillerTargetsAndCounts({
      keys: ["A"],
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCreditsByClass: {},
    });

    expect(result.fillerCountsByClass.A.PT).toBe(0);
  });

  test("handles empty filler set", () => {
    const result = schedulerBuildFillerTargetsAndCounts({
      keys: ["A"],
      fillerShortsByClass: { A: new Set() },
      fillerCreditsByClass: {},
    });

    expect(result.fillerTargetsByClass.A).toEqual({});
    expect(result.fillerCountsByClass.A).toEqual({});
  });

  test("handles multiple classes", () => {
    const result = schedulerBuildFillerTargetsAndCounts({
      keys: ["A", "B"],
      fillerShortsByClass: {
        A: new Set(["PT"]),
        B: new Set(["LIB", "AR"]),
      },
      fillerCreditsByClass: {},
    });

    expect(Object.keys(result.fillerTargetsByClass.A)).toEqual(["PT"]);
    expect(Object.keys(result.fillerTargetsByClass.B).sort()).toEqual(["AR", "LIB"]);
  });
});

// ─── schedulerMergeFillerTargetsIntoWeeklyQuota ──────────────────────────────

describe("schedulerMergeFillerTargetsIntoWeeklyQuota", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerMergeFillerTargetsIntoWeeklyQuota).toBe("function");
  });

  test("merges filler targets into existing quota", () => {
    const weeklyQuota = { A: { MATH: 5 } };
    schedulerMergeFillerTargetsIntoWeeklyQuota({
      keys: ["A"],
      fillerTargetsByClass: { A: { PT: 2, LIB: 2 } },
      weeklyQuota,
    });

    expect(weeklyQuota.A.MATH).toBe(5);
    expect(weeklyQuota.A.PT).toBe(2);
    expect(weeklyQuota.A.LIB).toBe(2);
  });

  test("creates quota object if missing", () => {
    const weeklyQuota = {};
    schedulerMergeFillerTargetsIntoWeeklyQuota({
      keys: ["A"],
      fillerTargetsByClass: { A: { PT: 2 } },
      weeklyQuota,
    });

    expect(weeklyQuota.A.PT).toBe(2);
  });

  test("overwrites existing filler quota with new target", () => {
    const weeklyQuota = { A: { PT: 10 } };
    schedulerMergeFillerTargetsIntoWeeklyQuota({
      keys: ["A"],
      fillerTargetsByClass: { A: { PT: 2 } },
      weeklyQuota,
    });

    expect(weeklyQuota.A.PT).toBe(2);
  });

  test("handles empty fillerTargets gracefully", () => {
    const weeklyQuota = { A: { MATH: 5 } };
    schedulerMergeFillerTargetsIntoWeeklyQuota({
      keys: ["A"],
      fillerTargetsByClass: { A: {} },
      weeklyQuota,
    });

    expect(weeklyQuota.A.MATH).toBe(5);
  });
});
