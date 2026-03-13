/**
 * @file tests/unit/bootstrap.test.js
 * @description Tests for scheduler/bootstrap.js: teacher maps, lab capacity, filler capacity.
 */

// ─── schedulerBuildTeacherFoldMapFromData ────────────────────────────────────

describe("schedulerBuildTeacherFoldMapFromData", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerBuildTeacherFoldMapFromData).toBe("function");
  });

  test("extracts teacher names and passes to buildTeacherFoldMapFromRawNames", () => {
    const captured = [];
    const mockBuilder = (names) => {
      captured.push(...names);
      return { map: true };
    };
    const result = schedulerBuildTeacherFoldMapFromData({
      data: [
        { pairs: [{ teacher: "Dr. Smith", short: "MATH" }] },
        { pairs: [{ teacher: "Prof. Jones", short: "PHY" }] },
      ],
      buildTeacherFoldMapFromRawNames: mockBuilder,
    });
    expect(captured).toEqual(["Dr. Smith", "Prof. Jones"]);
    expect(result).toEqual({ map: true });
  });

  test("extracts from teachers array as well", () => {
    const captured = [];
    const mockBuilder = (names) => {
      captured.push(...names);
      return {};
    };
    schedulerBuildTeacherFoldMapFromData({
      data: [
        {
          pairs: [
            { teacher: "T1", short: "CS", teachers: ["T2", "T3"] },
          ],
        },
      ],
      buildTeacherFoldMapFromRawNames: mockBuilder,
    });
    expect(captured).toEqual(["T1", "T2", "T3"]);
  });

  test("skips empty/whitespace teacher names", () => {
    const captured = [];
    const mockBuilder = (names) => {
      captured.push(...names);
      return {};
    };
    schedulerBuildTeacherFoldMapFromData({
      data: [
        {
          pairs: [
            { teacher: "", short: "CS" },
            { teacher: "  ", short: "PHY" },
            { teacher: "Valid", short: "MATH" },
          ],
        },
      ],
      buildTeacherFoldMapFromRawNames: mockBuilder,
    });
    expect(captured).toEqual(["Valid"]);
  });

  test("handles data with no pairs", () => {
    const mockBuilder = (names) => ({ count: names.length });
    const result = schedulerBuildTeacherFoldMapFromData({
      data: [{ pairs: [] }],
      buildTeacherFoldMapFromRawNames: mockBuilder,
    });
    expect(result).toEqual({ count: 0 });
  });
});

// ─── schedulerBuildGlobalTeacherForShort ─────────────────────────────────────

describe("schedulerBuildGlobalTeacherForShort", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerBuildGlobalTeacherForShort).toBe("function");
  });

  test("maps short to teacher when exactly one teacher", () => {
    const result = schedulerBuildGlobalTeacherForShort({
      data: [
        { pairs: [{ short: "MATH", teacher: "T1" }] },
        { pairs: [{ short: "MATH", teacher: "T1" }] },
      ],
    });
    expect(result.MATH).toBe("T1");
  });

  test("excludes short with multiple teachers", () => {
    const result = schedulerBuildGlobalTeacherForShort({
      data: [
        { pairs: [{ short: "MATH", teacher: "T1" }] },
        { pairs: [{ short: "MATH", teacher: "T2" }] },
      ],
    });
    expect(result.MATH).toBeUndefined();
  });

  test("handles multiple shorts independently", () => {
    const result = schedulerBuildGlobalTeacherForShort({
      data: [
        {
          pairs: [
            { short: "MATH", teacher: "T1" },
            { short: "PHY", teacher: "T2" },
          ],
        },
      ],
    });
    expect(result.MATH).toBe("T1");
    expect(result.PHY).toBe("T2");
  });

  test("returns empty object for no data", () => {
    const result = schedulerBuildGlobalTeacherForShort({ data: [] });
    expect(result).toEqual({});
  });

  test("returns empty when no teacher is provided", () => {
    const result = schedulerBuildGlobalTeacherForShort({
      data: [{ pairs: [{ short: "MATH" }] }],
    });
    expect(result).toEqual({});
  });
});

// ─── schedulerReadLabCapacityFromDom ────────────────────────────────────────

describe("schedulerReadLabCapacityFromDom", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerReadLabCapacityFromDom).toBe("function");
  });

  test("returns defaultCapacity when DOM element is missing", () => {
    const result = schedulerReadLabCapacityFromDom({ defaultCapacity: 4 });
    expect(result).toBe(4);
  });

  test("defaults to 3 when no argument provided", () => {
    const result = schedulerReadLabCapacityFromDom();
    expect(result).toBe(3);
  });

  test("reads value from DOM element", () => {
    const el = document.createElement("input");
    el.id = "labCount";
    el.value = "5";
    document.body.appendChild(el);
    try {
      const result = schedulerReadLabCapacityFromDom();
      expect(result).toBe(5);
    } finally {
      document.body.removeChild(el);
    }
  });

  test("returns defaultCapacity when DOM value is not a number", () => {
    const el = document.createElement("input");
    el.id = "labCount";
    el.value = "abc";
    document.body.appendChild(el);
    try {
      const result = schedulerReadLabCapacityFromDom({ defaultCapacity: 3 });
      expect(result).toBe(3);
    } finally {
      document.body.removeChild(el);
    }
  });

  test("returns defaultCapacity when DOM value is 0", () => {
    const el = document.createElement("input");
    el.id = "labCount";
    el.value = "0";
    document.body.appendChild(el);
    try {
      const result = schedulerReadLabCapacityFromDom({ defaultCapacity: 3 });
      expect(result).toBe(3);
    } finally {
      document.body.removeChild(el);
    }
  });
});

// ─── schedulerComputeFillerCapacityForClass ──────────────────────────────────

describe("schedulerComputeFillerCapacityForClass", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerComputeFillerCapacityForClass).toBe("function");
  });

  test("returns zero caps when no fillers exist", () => {
    const result = schedulerComputeFillerCapacityForClass({
      classKey: "A",
      fillerShortsByClass: { A: new Set() },
      lectureList: { A: [] },
      weeklyQuota: { A: {} },
      pairsByClass: { A: [] },
      isLabPair: () => false,
      fillerTargetsByClass: { A: {} },
      totalSlotsPerClass: 30,
      minWeeklyCap: 5,
      perSubjectCap: 3,
    });
    expect(result.totalFillerCap).toBe(0);
    expect(result.perSubjectFillerCap).toBe(0);
  });

  test("returns perSubjectCap as perSubjectFillerCap", () => {
    const result = schedulerComputeFillerCapacityForClass({
      classKey: "A",
      fillerShortsByClass: { A: new Set(["PT"]) },
      lectureList: { A: [] },
      weeklyQuota: { A: {} },
      pairsByClass: { A: [] },
      isLabPair: () => false,
      fillerTargetsByClass: { A: {} },
      totalSlotsPerClass: 30,
      minWeeklyCap: 5,
      perSubjectCap: 7,
    });
    expect(result.perSubjectFillerCap).toBe(7);
  });

  test("totalFillerCap is at least minWeeklyCap", () => {
    const result = schedulerComputeFillerCapacityForClass({
      classKey: "A",
      fillerShortsByClass: { A: new Set(["PT"]) },
      lectureList: { A: [] },
      weeklyQuota: { A: {} },
      pairsByClass: { A: [] },
      isLabPair: () => false,
      fillerTargetsByClass: { A: {} },
      totalSlotsPerClass: 30,
      minWeeklyCap: 10,
      perSubjectCap: 3,
    });
    expect(result.totalFillerCap).toBeGreaterThanOrEqual(10);
  });

  test("totalFillerCap is at least the declared filler targets total", () => {
    const result = schedulerComputeFillerCapacityForClass({
      classKey: "A",
      fillerShortsByClass: { A: new Set(["PT", "YOGA"]) },
      lectureList: { A: [] },
      weeklyQuota: { A: {} },
      pairsByClass: { A: [] },
      isLabPair: () => false,
      fillerTargetsByClass: { A: { PT: 3, YOGA: 4 } },
      totalSlotsPerClass: 30,
      minWeeklyCap: 1,
      perSubjectCap: 3,
    });
    expect(result.totalFillerCap).toBeGreaterThanOrEqual(7);
  });

  test("accounts for lecture slots and lab slots in capacity", () => {
    const result = schedulerComputeFillerCapacityForClass({
      classKey: "A",
      fillerShortsByClass: { A: new Set(["PT"]) },
      lectureList: {
        A: [{ short: "MATH", remaining: 5 }],
      },
      weeklyQuota: { A: { MATH: 5 } },
      pairsByClass: {
        A: [{ short: "CS LAB", teacher: "T1" }],
      },
      isLabPair: (p) => p.short.includes("LAB"),
      fillerTargetsByClass: { A: {} },
      totalSlotsPerClass: 30,
      minWeeklyCap: 1,
      perSubjectCap: 3,
    });
    // 30 total - 5 lectures - 2 lab slots = 23 required filler
    expect(result.totalFillerCap).toBeGreaterThanOrEqual(23);
  });

  test("handles missing fillerShortsByClass for class", () => {
    const result = schedulerComputeFillerCapacityForClass({
      classKey: "A",
      fillerShortsByClass: {},
      lectureList: { A: [] },
      weeklyQuota: { A: {} },
      pairsByClass: { A: [] },
      isLabPair: () => false,
      fillerTargetsByClass: { A: {} },
      totalSlotsPerClass: 30,
      minWeeklyCap: 5,
      perSubjectCap: 3,
    });
    expect(result.totalFillerCap).toBe(0);
    expect(result.perSubjectFillerCap).toBe(0);
  });
});
