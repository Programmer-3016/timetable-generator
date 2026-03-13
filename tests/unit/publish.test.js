/**
 * @file tests/unit/publish.test.js
 * @description Tests for scheduler/publish.js: aggregate stats and published state.
 */

// ─── schedulerMergeTeacherAggregateStats ─────────────────────────────────────

describe("schedulerMergeTeacherAggregateStats", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerMergeTeacherAggregateStats).toBe("function");
  });

  test("aggregates theory counts from data teachers", () => {
    const stats = {};
    schedulerMergeTeacherAggregateStats({
      data: [{ pairs: [{ teacher: "T1", short: "MATH" }] }],
      teacherTheoryCount: { T1: 5 },
      teacherLabBlocks: {},
      teacherMinutes: {},
      teacherFirstPeriodCount: {},
      aggregateStats: stats,
      normalizeTeacherName: (t) => t.toLowerCase(),
    });
    expect(stats.t1.theory).toBe(5);
    expect(stats.t1.display).toBe("T1");
  });

  test("aggregates lab blocks and minutes", () => {
    const stats = {};
    schedulerMergeTeacherAggregateStats({
      data: [{ pairs: [{ teacher: "T1", short: "CS" }] }],
      teacherTheoryCount: {},
      teacherLabBlocks: { T1: 3 },
      teacherMinutes: { T1: 180 },
      teacherFirstPeriodCount: { T1: 2 },
      aggregateStats: stats,
      normalizeTeacherName: (t) => t,
    });
    expect(stats.T1.labs).toBe(3);
    expect(stats.T1.minutes).toBe(180);
    expect(stats.T1.first).toBe(2);
  });

  test("merges stats from multiple data entries", () => {
    const stats = {};
    const normalize = (t) => t.toUpperCase();
    schedulerMergeTeacherAggregateStats({
      data: [
        { pairs: [{ teacher: "t1", short: "MATH" }] },
        { pairs: [{ teacher: "T1", short: "PHY" }] },
      ],
      teacherTheoryCount: { t1: 2, T1: 3 },
      teacherLabBlocks: {},
      teacherMinutes: {},
      teacherFirstPeriodCount: {},
      aggregateStats: stats,
      normalizeTeacherName: normalize,
    });
    expect(stats.T1.theory).toBe(5);
  });

  test("picks longer display name", () => {
    const stats = {};
    schedulerMergeTeacherAggregateStats({
      data: [
        { pairs: [{ teacher: "T", short: "A" }] },
        { pairs: [{ teacher: "Teacher", short: "B" }] },
      ],
      teacherTheoryCount: {},
      teacherLabBlocks: {},
      teacherMinutes: {},
      teacherFirstPeriodCount: {},
      aggregateStats: stats,
      normalizeTeacherName: () => "key",
    });
    expect(stats.key.display).toBe("Teacher");
  });

  test("includes teachers from stat objects not in data", () => {
    const stats = {};
    schedulerMergeTeacherAggregateStats({
      data: [{ pairs: [] }],
      teacherTheoryCount: { "External": 4 },
      teacherLabBlocks: {},
      teacherMinutes: {},
      teacherFirstPeriodCount: {},
      aggregateStats: stats,
      normalizeTeacherName: (t) => t,
    });
    expect(stats.External.theory).toBe(4);
  });

  test("includes teachers from teachers array", () => {
    const stats = {};
    schedulerMergeTeacherAggregateStats({
      data: [
        {
          pairs: [
            { short: "CS", teacher: "T1", teachers: ["T2", "T3"] },
          ],
        },
      ],
      teacherTheoryCount: { T1: 1, T2: 2, T3: 3 },
      teacherLabBlocks: {},
      teacherMinutes: {},
      teacherFirstPeriodCount: {},
      aggregateStats: stats,
      normalizeTeacherName: (t) => t,
    });
    expect(stats.T1.theory).toBe(1);
    expect(stats.T2.theory).toBe(2);
    expect(stats.T3.theory).toBe(3);
  });

  test("initializes zeroed stats for teacher with no counts", () => {
    const stats = {};
    schedulerMergeTeacherAggregateStats({
      data: [{ pairs: [{ teacher: "NewTeacher", short: "ART" }] }],
      teacherTheoryCount: {},
      teacherLabBlocks: {},
      teacherMinutes: {},
      teacherFirstPeriodCount: {},
      aggregateStats: stats,
      normalizeTeacherName: (t) => t,
    });
    expect(stats.NewTeacher).toEqual({
      display: "NewTeacher",
      theory: 0,
      labs: 0,
      minutes: 0,
      first: 0,
    });
  });
});

// ─── schedulerBuildPublishedState ────────────────────────────────────────────

describe("schedulerBuildPublishedState", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerBuildPublishedState).toBe("function");
  });

  test("packages schedules per class", () => {
    const schedules = { A: [["MATH"]], B: [["PHY"]] };
    const result = schedulerBuildPublishedState({
      keys: ["A", "B"],
      schedules,
      teacherForShort: { A: {}, B: {} },
      subjectByShort: { A: {}, B: {} },
      labsAtSlot: {},
      assignedTeacher: {},
      labNumberAssigned: {},
      fillerShortsByClass: {},
    });
    expect(result.schedulesByClass.A).toEqual([["MATH"]]);
    expect(result.schedulesByClass.B).toEqual([["PHY"]]);
  });

  test("copies enabledKeys as a new array", () => {
    const keys = ["A", "B"];
    const result = schedulerBuildPublishedState({
      keys,
      schedules: { A: [], B: [] },
      teacherForShort: { A: {}, B: {} },
      subjectByShort: { A: {}, B: {} },
      labsAtSlot: {},
      assignedTeacher: {},
      labNumberAssigned: {},
      fillerShortsByClass: {},
    });
    expect(result.enabledKeys).toEqual(["A", "B"]);
    expect(result.enabledKeys).not.toBe(keys);
  });

  test("includes labsAtSlot and assignedTeacher", () => {
    const labsAtSlot = { A: { "0-0": true } };
    const assignedTeacher = { A: [["T1"]] };
    const result = schedulerBuildPublishedState({
      keys: ["A"],
      schedules: { A: [] },
      teacherForShort: { A: {} },
      subjectByShort: { A: {} },
      labsAtSlot,
      assignedTeacher,
      labNumberAssigned: {},
      fillerShortsByClass: {},
    });
    expect(result.labsAtSlot).toBe(labsAtSlot);
    expect(result.assignedTeacher).toBe(assignedTeacher);
  });

  test("defaults fillerShortsByClass to empty object", () => {
    const result = schedulerBuildPublishedState({
      keys: [],
      schedules: {},
      teacherForShort: {},
      subjectByShort: {},
      labsAtSlot: {},
      assignedTeacher: {},
      labNumberAssigned: {},
      fillerShortsByClass: null,
    });
    expect(result.fillerShortsByClass).toEqual({});
  });

  test("only includes classes from keys", () => {
    const result = schedulerBuildPublishedState({
      keys: ["A"],
      schedules: { A: [["MATH"]], B: [["PHY"]] },
      teacherForShort: { A: {}, B: {} },
      subjectByShort: { A: {}, B: {} },
      labsAtSlot: {},
      assignedTeacher: {},
      labNumberAssigned: {},
      fillerShortsByClass: {},
    });
    expect(result.schedulesByClass.A).toBeDefined();
    expect(result.schedulesByClass.B).toBeUndefined();
  });
});
