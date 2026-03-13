/**
 * @file tests/unit/passes.test.js
 * @description Tests for schedulerPlaceLabBlock, schedulerPlaceInitialLabsAcrossClasses,
 *   schedulerClampMainsToTarget, and schedulerResolveFinalTeacherClashes
 *   from core/scheduler/passes.js.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a 2D schedule grid (days × classesPerDay) filled with null. */
function makeGrid(days, classesPerDay) {
  return Array.from({ length: days }, () =>
    Array.from({ length: classesPerDay }, () => null)
  );
}

/** Creates a 2D assigned-teacher grid matching schedule dimensions. */
function makeTeacherGrid(days, classesPerDay) {
  return makeGrid(days, classesPerDay);
}

/** Creates labsAtSlot: days × classesPerDay of 0. */
function makeLabsAtSlot(days, classesPerDay) {
  return Array.from({ length: days }, () =>
    Array.from({ length: classesPerDay }, () => 0)
  );
}

/** Creates labsInUse: days × classesPerDay of empty Set. */
function makeLabsInUse(days, classesPerDay) {
  return Array.from({ length: days }, () =>
    Array.from({ length: classesPerDay }, () => new Set())
  );
}

/** Creates a per-day teacher assignment tracker: days × empty objects. */
function makeTeacherPerDay(days) {
  return Array.from({ length: days }, () => ({}));
}

// ─── schedulerPlaceLabBlock ──────────────────────────────────────────────────

describe("schedulerPlaceLabBlock", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPlaceLabBlock).toBe("function");
  });

  test("places a lab in two adjacent empty slots", () => {
    const days = 1;
    const cpd = 6;
    const schedules = { A: makeGrid(days, cpd) };
    const assignedTeacher = { A: makeTeacherGrid(days, cpd) };
    const labNumberAssigned = { A: makeGrid(days, cpd) };
    const labsAtSlot = makeLabsAtSlot(days, cpd);
    const labsInUse = makeLabsInUse(days, cpd);

    const result = schedulerPlaceLabBlock({
      key: "A",
      label: "CSLAB",
      day: 0,
      labPeriodsUsedPerDay: { A: [0] },
      getShortTeacherList: () => ["Dr. Lab"],
      teacherAssignedPerDayByClass: { A: makeTeacherPerDay(days) },
      teacherMinutes: {},
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
      classesPerDay: cpd,
      lunchClassIndex: 3,
      labPrePostBlocksByClass: { A: { pre: 0, post: 0 } },
      labStartCountsByClass: { A: {} },
      labsAtSlot,
      labsInUse,
      LAB_CAPACITY: 3,
      schedules,
      keys: ["A"],
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      assignedTeacher,
      labNumberAssigned,
      labsBlocksPerDayAcross: [0],
      teacherLabBlocks: {},
      teacherLabMinutes: {},
      teacherFirstPeriodCount: {},
      ensureTP: (k, t) => ({ pre: 0, post: 0 }),
    });

    expect(result).toBe(true);
    // Lab should occupy 2 adjacent slots
    const row = schedules.A[0];
    const labPositions = row
      .map((v, i) => (v === "CSLAB" ? i : -1))
      .filter((i) => i >= 0);
    expect(labPositions.length).toBe(2);
    expect(labPositions[1] - labPositions[0]).toBe(1);
  });

  test("returns false when labPeriodsUsedPerDay already at 2", () => {
    const result = schedulerPlaceLabBlock({
      key: "A",
      label: "CSLAB",
      day: 0,
      labPeriodsUsedPerDay: { A: [2] },
      getShortTeacherList: () => ["Dr. Lab"],
      teacherAssignedPerDayByClass: { A: makeTeacherPerDay(1) },
      teacherMinutes: {},
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
      classesPerDay: 6,
      lunchClassIndex: 3,
      labPrePostBlocksByClass: { A: { pre: 0, post: 0 } },
      labStartCountsByClass: { A: {} },
      labsAtSlot: makeLabsAtSlot(1, 6),
      labsInUse: makeLabsInUse(1, 6),
      LAB_CAPACITY: 3,
      schedules: { A: makeGrid(1, 6) },
      keys: ["A"],
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      assignedTeacher: { A: makeTeacherGrid(1, 6) },
      labNumberAssigned: { A: makeGrid(1, 6) },
      labsBlocksPerDayAcross: [0],
      teacherLabBlocks: {},
      teacherLabMinutes: {},
      teacherFirstPeriodCount: {},
      ensureTP: () => ({ pre: 0, post: 0 }),
    });
    expect(result).toBe(false);
  });

  test("returns false when no teacher list available", () => {
    const result = schedulerPlaceLabBlock({
      key: "A",
      label: "CSLAB",
      day: 0,
      labPeriodsUsedPerDay: { A: [0] },
      getShortTeacherList: () => [],
      teacherAssignedPerDayByClass: { A: makeTeacherPerDay(1) },
      teacherMinutes: {},
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
      classesPerDay: 6,
      lunchClassIndex: 3,
      labPrePostBlocksByClass: { A: { pre: 0, post: 0 } },
      labStartCountsByClass: { A: {} },
      labsAtSlot: makeLabsAtSlot(1, 6),
      labsInUse: makeLabsInUse(1, 6),
      LAB_CAPACITY: 3,
      schedules: { A: makeGrid(1, 6) },
      keys: ["A"],
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      assignedTeacher: { A: makeTeacherGrid(1, 6) },
      labNumberAssigned: { A: makeGrid(1, 6) },
      labsBlocksPerDayAcross: [0],
      teacherLabBlocks: {},
      teacherLabMinutes: {},
      teacherFirstPeriodCount: {},
      ensureTP: () => ({ pre: 0, post: 0 }),
    });
    expect(result).toBe(false);
  });

  test("returns false when teacher exceeds weekly minutes cap", () => {
    const result = schedulerPlaceLabBlock({
      key: "A",
      label: "CSLAB",
      day: 0,
      labPeriodsUsedPerDay: { A: [0] },
      getShortTeacherList: () => ["Dr. Lab"],
      teacherAssignedPerDayByClass: { A: makeTeacherPerDay(1) },
      teacherMinutes: { "Dr. Lab": 1450 },
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
      classesPerDay: 6,
      lunchClassIndex: 3,
      labPrePostBlocksByClass: { A: { pre: 0, post: 0 } },
      labStartCountsByClass: { A: {} },
      labsAtSlot: makeLabsAtSlot(1, 6),
      labsInUse: makeLabsInUse(1, 6),
      LAB_CAPACITY: 3,
      schedules: { A: makeGrid(1, 6) },
      keys: ["A"],
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      assignedTeacher: { A: makeTeacherGrid(1, 6) },
      labNumberAssigned: { A: makeGrid(1, 6) },
      labsBlocksPerDayAcross: [0],
      teacherLabBlocks: {},
      teacherLabMinutes: {},
      teacherFirstPeriodCount: {},
      ensureTP: () => ({ pre: 0, post: 0 }),
    });
    expect(result).toBe(false);
  });

  test("does not place lab across lunch boundary", () => {
    const cpd = 6;
    const lunchIdx = 3;
    const schedules = { A: makeGrid(1, cpd) };
    // fill all slots except the cross-lunch pair (2,3)
    schedules.A[0][0] = "X";
    schedules.A[0][1] = "X";
    schedules.A[0][4] = "X";
    schedules.A[0][5] = "X";
    // only empty pair is (2,3) which crosses lunch

    const result = schedulerPlaceLabBlock({
      key: "A",
      label: "CSLAB",
      day: 0,
      labPeriodsUsedPerDay: { A: [0] },
      getShortTeacherList: () => ["Dr. Lab"],
      teacherAssignedPerDayByClass: { A: makeTeacherPerDay(1) },
      teacherMinutes: {},
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
      classesPerDay: cpd,
      lunchClassIndex: lunchIdx,
      labPrePostBlocksByClass: { A: { pre: 0, post: 0 } },
      labStartCountsByClass: { A: {} },
      labsAtSlot: makeLabsAtSlot(1, cpd),
      labsInUse: makeLabsInUse(1, cpd),
      LAB_CAPACITY: 3,
      schedules,
      keys: ["A"],
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      assignedTeacher: { A: makeTeacherGrid(1, cpd) },
      labNumberAssigned: { A: makeGrid(1, cpd) },
      labsBlocksPerDayAcross: [0],
      teacherLabBlocks: {},
      teacherLabMinutes: {},
      teacherFirstPeriodCount: {},
      ensureTP: () => ({ pre: 0, post: 0 }),
    });
    expect(result).toBe(false);
  });

  test("assigns lab number and increments counters correctly", () => {
    const schedules = { A: makeGrid(1, 6) };
    const assignedTeacher = { A: makeTeacherGrid(1, 6) };
    const labNumberAssigned = { A: makeGrid(1, 6) };
    const labsAtSlot = makeLabsAtSlot(1, 6);
    const labsInUse = makeLabsInUse(1, 6);
    const labPeriodsUsedPerDay = { A: [0] };
    const labsBlocksPerDayAcross = [0];
    const teacherMinutes = {};
    const teacherLabBlocks = {};
    const teacherLabMinutes = {};

    schedulerPlaceLabBlock({
      key: "A",
      label: "CSLAB",
      day: 0,
      labPeriodsUsedPerDay,
      getShortTeacherList: () => ["Dr. Lab"],
      teacherAssignedPerDayByClass: { A: makeTeacherPerDay(1) },
      teacherMinutes,
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
      classesPerDay: 6,
      lunchClassIndex: 3,
      labPrePostBlocksByClass: { A: { pre: 0, post: 0 } },
      labStartCountsByClass: { A: {} },
      labsAtSlot,
      labsInUse,
      LAB_CAPACITY: 3,
      schedules,
      keys: ["A"],
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      assignedTeacher,
      labNumberAssigned,
      labsBlocksPerDayAcross,
      teacherLabBlocks,
      teacherLabMinutes,
      teacherFirstPeriodCount: {},
      ensureTP: () => ({ pre: 0, post: 0 }),
    });

    expect(labPeriodsUsedPerDay.A[0]).toBe(2);
    expect(labsBlocksPerDayAcross[0]).toBe(1);
    expect(teacherMinutes["Dr. Lab"]).toBe(100);
    expect(teacherLabBlocks["Dr. Lab"]).toBe(1);
    expect(teacherLabMinutes["Dr. Lab"]).toBe(100);
    // Lab number should be assigned (1-based)
    const pos = schedules.A[0].indexOf("CSLAB");
    expect(labNumberAssigned.A[0][pos]).toBeGreaterThanOrEqual(1);
    expect(labNumberAssigned.A[0][pos + 1]).toBe(labNumberAssigned.A[0][pos]);
  });

  test("rejects lab when teacher clashes with other class at candidate slot", () => {
    const cpd = 6;
    const schedules = {
      A: makeGrid(1, cpd),
      B: makeGrid(1, cpd),
    };
    schedules.B[0][0] = "PHY";
    schedules.B[0][1] = "PHY";

    const result = schedulerPlaceLabBlock({
      key: "A",
      label: "CSLAB",
      day: 0,
      labPeriodsUsedPerDay: { A: [0] },
      getShortTeacherList: () => ["Dr. Shared"],
      teacherAssignedPerDayByClass: { A: makeTeacherPerDay(1) },
      teacherMinutes: {},
      minsPerPeriod: 50,
      TEACHER_MAX_HOURS: 1500,
      classesPerDay: cpd,
      lunchClassIndex: 3,
      labPrePostBlocksByClass: { A: { pre: 0, post: 0 } },
      labStartCountsByClass: { A: {} },
      labsAtSlot: makeLabsAtSlot(1, cpd),
      labsInUse: makeLabsInUse(1, cpd),
      LAB_CAPACITY: 3,
      schedules,
      keys: ["A", "B"],
      getTeachersForCell: (key, short, day, col) => {
        if (key === "B") return ["Dr. Shared"];
        return [];
      },
      teacherClashKey: (t) => (t || "").toLowerCase(),
      assignedTeacher: { A: makeTeacherGrid(1, cpd), B: makeTeacherGrid(1, cpd) },
      labNumberAssigned: { A: makeGrid(1, cpd) },
      labsBlocksPerDayAcross: [0],
      teacherLabBlocks: {},
      teacherLabMinutes: {},
      teacherFirstPeriodCount: {},
      ensureTP: () => ({ pre: 0, post: 0 }),
    });

    // All slots where B has Dr. Shared should be skipped; lab may still place
    // in non-clashing slots (3,4) or (4,5)
    const labSlots = schedules.A[0].filter((v) => v === "CSLAB");
    if (result) {
      expect(labSlots.length).toBe(2);
      // verify they don't overlap with B's occupied slots
      const labStart = schedules.A[0].indexOf("CSLAB");
      expect(labStart).toBeGreaterThanOrEqual(2);
    }
  });
});

// ─── schedulerPlaceInitialLabsAcrossClasses ──────────────────────────────────

describe("schedulerPlaceInitialLabsAcrossClasses", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerPlaceInitialLabsAcrossClasses).toBe("function");
  });

  test("calls placeLabBlock for each lab entry", () => {
    const calls = [];
    schedulerPlaceInitialLabsAcrossClasses({
      data: [
        {
          key: "A",
          pairs: [
            { short: "CSLAB", teacher: "Dr. Lab", subject: "CS Lab" },
            { short: "MATH", teacher: "Dr. M", subject: "Mathematics" },
          ],
        },
      ],
      isLabPair: (p) => /lab/i.test(p.short),
      days: 5,
      keys: ["A"],
      labsBlocksPerDayAcross: [0, 0, 0, 0, 0],
      placeLabBlock: (key, short, day) => {
        calls.push({ key, short, day });
        return true;
      },
    });
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].key).toBe("A");
    expect(calls[0].short).toBe("CSLAB");
  });

  test("distributes labs across days with fewest blocks", () => {
    const placedDays = [];
    schedulerPlaceInitialLabsAcrossClasses({
      data: [
        {
          key: "A",
          pairs: [
            { short: "LAB1", teacher: "T1", subject: "Lab 1" },
            { short: "LAB2", teacher: "T2", subject: "Lab 2" },
          ],
        },
      ],
      isLabPair: (p) => /lab/i.test(p.short),
      days: 5,
      keys: ["A"],
      labsBlocksPerDayAcross: [3, 0, 1, 0, 2],
      placeLabBlock: (key, short, day) => {
        placedDays.push(day);
        return true;
      },
    });
    // First lab should go to day with fewest blocks (day 1 or 3)
    expect([1, 3]).toContain(placedDays[0]);
  });
});

// ─── schedulerClampMainsToTarget ─────────────────────────────────────────────

describe("schedulerClampMainsToTarget", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerClampMainsToTarget).toBe("function");
  });

  test("returns false when all subjects are at target", () => {
    const schedules = { A: [["MATH", "PHY", "CHEM", null, null, null]] };
    const result = schedulerClampMainsToTarget({
      keys: ["A"],
      mainShortsByClass: { A: new Set(["MATH", "PHY", "CHEM"]) },
      fillerShortsByClass: { A: new Set(["PT"]) },
      weeklyQuota: { A: { MATH: 1, PHY: 1, CHEM: 1 } },
      days: 1,
      classesPerDay: 6,
      schedules,
      isLabShort: { A: {} },
      getTargetForShort: (k, sh) => ({ MATH: 1, PHY: 1, CHEM: 1 }[sh] || 5),
      pickTeacherForSlot: () => "T",
      assignedTeacher: { A: [[null, null, null, null, null, null]] },
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
    });
    expect(result).toBe(false);
  });

  test("clamps excess main subject occurrences", () => {
    const schedules = {
      A: [["MATH", "MATH", "MATH", "PHY", null, null]],
    };
    const assignedTeacher = { A: [[null, null, null, null, null, null]] };
    const result = schedulerClampMainsToTarget({
      keys: ["A"],
      mainShortsByClass: { A: new Set(["MATH", "PHY"]) },
      fillerShortsByClass: { A: new Set(["PT"]) },
      weeklyQuota: { A: { MATH: 1, PHY: 1 } },
      days: 1,
      classesPerDay: 6,
      schedules,
      isLabShort: { A: {} },
      getTargetForShort: (k, sh) => ({ MATH: 1, PHY: 1 }[sh] || 5),
      pickTeacherForSlot: () => "T",
      assignedTeacher,
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
    });
    expect(result).toBe(true);
    const mathCount = schedules.A[0].filter((s) => s === "MATH").length;
    expect(mathCount).toBe(1);
  });

  test("replaces excess mains with fillers", () => {
    const schedules = {
      A: [["MATH", "MATH", "MATH", null, null, null]],
    };
    const assignedTeacher = { A: [["T", "T", "T", null, null, null]] };
    schedulerClampMainsToTarget({
      keys: ["A"],
      mainShortsByClass: { A: new Set(["MATH"]) },
      fillerShortsByClass: { A: new Set(["PT"]) },
      weeklyQuota: { A: { MATH: 1 } },
      days: 1,
      classesPerDay: 6,
      schedules,
      isLabShort: { A: {} },
      getTargetForShort: (k, sh) => (sh === "MATH" ? 1 : 5),
      pickTeacherForSlot: () => "T",
      assignedTeacher,
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
    });
    const fillerCount = schedules.A[0].filter((s) => s === "PT").length;
    expect(fillerCount).toBeGreaterThanOrEqual(1);
  });

  test("nulls slot as last resort when no replacement found", () => {
    const schedules = {
      A: [["MATH", "MATH", "MATH", null, null, null]],
    };
    const assignedTeacher = { A: [["T", "T", "T", null, null, null]] };
    schedulerClampMainsToTarget({
      keys: ["A"],
      mainShortsByClass: { A: new Set(["MATH"]) },
      fillerShortsByClass: { A: new Set() },
      weeklyQuota: { A: { MATH: 1 } },
      days: 1,
      classesPerDay: 6,
      schedules,
      isLabShort: { A: {} },
      getTargetForShort: (k, sh) => (sh === "MATH" ? 1 : 5),
      pickTeacherForSlot: () => null,
      assignedTeacher,
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
    });
    const mathCount = schedules.A[0].filter((s) => s === "MATH").length;
    expect(mathCount).toBe(1);
  });

  test("does not clamp lab subjects", () => {
    const schedules = {
      A: [["CSLAB", "CSLAB", "MATH", null, null, null]],
    };
    const assignedTeacher = { A: [["T", "T", "T", null, null, null]] };
    schedulerClampMainsToTarget({
      keys: ["A"],
      mainShortsByClass: { A: new Set(["MATH"]) },
      fillerShortsByClass: { A: new Set(["PT"]) },
      weeklyQuota: { A: { MATH: 1, CSLAB: 1 } },
      days: 1,
      classesPerDay: 6,
      schedules,
      isLabShort: { A: { CSLAB: true } },
      getTargetForShort: (k, sh) => 1,
      pickTeacherForSlot: () => "T",
      assignedTeacher,
      getTeachersForCell: () => [],
      teacherClashKey: (t) => (t || "").toLowerCase(),
    });
    const labCount = schedules.A[0].filter((s) => s === "CSLAB").length;
    expect(labCount).toBe(2);
  });
});

// ─── schedulerResolveFinalTeacherClashes ──────────────────────────────────────

describe("schedulerResolveFinalTeacherClashes", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerResolveFinalTeacherClashes).toBe("function");
  });

  test("returns false when no clashes exist", () => {
    const result = schedulerResolveFinalTeacherClashes({
      days: 1,
      classesPerDay: 3,
      keys: ["A", "B"],
      schedules: {
        A: [["MATH", "PHY", null]],
        B: [["CHEM", "BIO", null]],
      },
      getTeachersForCell: (key, short) => {
        const map = {
          A: { MATH: "T1", PHY: "T2" },
          B: { CHEM: "T3", BIO: "T4" },
        };
        return [map[key]?.[short] || ""];
      },
      teacherClashKey: (t) => (t || "").toLowerCase(),
      pickTeacherForSlot: () => "Alt",
      assignedTeacher: {
        A: [[null, null, null]],
        B: [[null, null, null]],
      },
      lectureList: { A: [], B: [] },
      getTargetForShort: () => 5,
      countOccurrences: () => 1,
      isMainShort: () => true,
      fillerShortsByClass: { A: new Set(), B: new Set() },
      fillerTargetsByClass: {},
      fillerCountsByClass: {},
      isLabShort: {},
      unresolvedClashes: [],
    });
    expect(result).toBe(false);
  });

  test("resolves clash by reassigning teacher", () => {
    const assignedTeacher = {
      A: [["Dr. Shared", null, null]],
      B: [["Dr. Shared", null, null]],
    };
    const result = schedulerResolveFinalTeacherClashes({
      days: 1,
      classesPerDay: 3,
      keys: ["A", "B"],
      schedules: {
        A: [["MATH", null, null]],
        B: [["PHY", null, null]],
      },
      getTeachersForCell: (key, short, day, col) => {
        return [assignedTeacher[key][day][col] || ""];
      },
      teacherClashKey: (t) => (t || "").trim().toLowerCase(),
      pickTeacherForSlot: (key) => (key === "B" ? "Dr. Alt" : null),
      assignedTeacher,
      lectureList: { A: [], B: [] },
      getTargetForShort: () => 5,
      countOccurrences: () => 1,
      isMainShort: () => true,
      fillerShortsByClass: { A: new Set(), B: new Set() },
      fillerTargetsByClass: {},
      fillerCountsByClass: {},
      isLabShort: {},
      unresolvedClashes: [],
    });
    expect(result).toBe(true);
    expect(assignedTeacher.B[0][0]).toBe("Dr. Alt");
  });

  test("logs unresolved clash when all strategies fail", () => {
    const unresolved = [];
    schedulerResolveFinalTeacherClashes({
      days: 1,
      classesPerDay: 1,
      keys: ["A", "B"],
      schedules: {
        A: [["MATH"]],
        B: [["PHY"]],
      },
      getTeachersForCell: () => ["Dr. Shared"],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      pickTeacherForSlot: () => null,
      assignedTeacher: {
        A: [["Dr. Shared"]],
        B: [["Dr. Shared"]],
      },
      lectureList: { A: [], B: [] },
      getTargetForShort: () => 5,
      countOccurrences: () => 1,
      isMainShort: () => true,
      fillerShortsByClass: { A: new Set(), B: new Set() },
      fillerTargetsByClass: {},
      fillerCountsByClass: {},
      isLabShort: {},
      unresolvedClashes: unresolved,
    });
    expect(unresolved.length).toBeGreaterThanOrEqual(1);
    expect(unresolved[0]).toHaveProperty("reason");
  });

  test("does not replace lab cells with other subjects", () => {
    const schedules = {
      A: [["CSLAB"]],
      B: [["PHY"]],
    };
    const assignedTeacher = {
      A: [["Dr. Shared"]],
      B: [["Dr. Shared"]],
    };
    const unresolved = [];
    schedulerResolveFinalTeacherClashes({
      days: 1,
      classesPerDay: 1,
      keys: ["A", "B"],
      schedules,
      getTeachersForCell: () => ["Dr. Shared"],
      teacherClashKey: (t) => (t || "").toLowerCase(),
      pickTeacherForSlot: () => null,
      assignedTeacher,
      lectureList: { A: [], B: [] },
      getTargetForShort: () => 5,
      countOccurrences: () => 1,
      isMainShort: () => true,
      fillerShortsByClass: { A: new Set(), B: new Set() },
      fillerTargetsByClass: {},
      fillerCountsByClass: {},
      isLabShort: { A: { CSLAB: true } },
      unresolvedClashes: unresolved,
    });
    // Lab cell should still be intact
    expect(schedules.A[0][0]).toBe("CSLAB");
  });
});
