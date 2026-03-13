/**
 * @file tests/unit/teacher-helpers.test.js
 * @description Tests for scheduler/teacher-helpers.js — teacher lookups,
 *   lab detection, adjacency checks, and subject code normalization.
 */

// ─── schedulerIsRealTeacher ──────────────────────────────────────────────────

describe("schedulerIsRealTeacher", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerIsRealTeacher).toBe("function");
  });

  test("returns true for a normal teacher name", () => {
    expect(schedulerIsRealTeacher("Dr. Kumar")).toBe(true);
  });

  test("returns false for empty string", () => {
    expect(schedulerIsRealTeacher("")).toBe(false);
  });

  test("returns false for null/undefined", () => {
    expect(schedulerIsRealTeacher(null)).toBe(false);
    expect(schedulerIsRealTeacher(undefined)).toBe(false);
  });

  test("returns false for 'Not Mentioned'", () => {
    expect(schedulerIsRealTeacher("Not Mentioned")).toBe(false);
  });

  test("returns false for 'not mentioned' (case-insensitive)", () => {
    expect(schedulerIsRealTeacher("not mentioned")).toBe(false);
    expect(schedulerIsRealTeacher("NOT MENTIONED")).toBe(false);
    expect(schedulerIsRealTeacher("Not  Mentioned")).toBe(false);
  });

  test("returns false for whitespace-only string", () => {
    expect(schedulerIsRealTeacher("   ")).toBe(false);
  });

  test("returns true for names containing 'not' as substring", () => {
    expect(schedulerIsRealTeacher("Notley Smith")).toBe(true);
  });
});

// ─── schedulerGetAssignedTeacherValue ────────────────────────────────────────

describe("schedulerGetAssignedTeacherValue", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetAssignedTeacherValue).toBe("function");
  });

  test("returns the teacher at a valid position", () => {
    const result = schedulerGetAssignedTeacherValue({
      assignedTeacher: { A: [["Dr. X", "Dr. Y"]] },
      key: "A",
      day: 0,
      col: 1,
    });
    expect(result).toBe("Dr. Y");
  });

  test("returns undefined when key is missing", () => {
    const result = schedulerGetAssignedTeacherValue({
      assignedTeacher: {},
      key: "A",
      day: 0,
      col: 0,
    });
    expect(result).toBeUndefined();
  });

  test("returns undefined when day is missing", () => {
    const result = schedulerGetAssignedTeacherValue({
      assignedTeacher: { A: [] },
      key: "A",
      day: 5,
      col: 0,
    });
    expect(result).toBeUndefined();
  });

  test("returns null when slot has null teacher", () => {
    const result = schedulerGetAssignedTeacherValue({
      assignedTeacher: { A: [[null, "Dr. X"]] },
      key: "A",
      day: 0,
      col: 0,
    });
    expect(result).toBeNull();
  });
});

// ─── schedulerGetShortTeacherList ────────────────────────────────────────────

describe("schedulerGetShortTeacherList", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetShortTeacherList).toBe("function");
  });

  test("returns teacher list from teacherListForShort", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: { A: { MATH: ["Dr. A", "Dr. B"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual(["Dr. A", "Dr. B"]);
  });

  test("deduplicates teacher list", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: { A: { MATH: ["Dr. A", "Dr. A", "Dr. B"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual(["Dr. A", "Dr. B"]);
  });

  test("filters out 'Not Mentioned' from list", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: { A: { MATH: ["Dr. A", "Not Mentioned"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual(["Dr. A"]);
  });

  test("filters out empty strings and null from list", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: { A: { MATH: ["", null, "Dr. A"] } },
      teacherForShort: { A: {} },
      teacherForShortGlobal: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual(["Dr. A"]);
  });

  test("falls back to teacherForShort when list is empty", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: { A: {} },
      teacherForShort: { A: { MATH: "Dr. Fallback" } },
      teacherForShortGlobal: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual(["Dr. Fallback"]);
  });

  test("falls back to teacherForShortGlobal", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: { A: {} },
      teacherForShort: { A: {} },
      teacherForShortGlobal: { MATH: "Global T" },
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual(["Global T"]);
  });

  test("returns empty array when all fallbacks are 'Not Mentioned'", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: { A: {} },
      teacherForShort: { A: { MATH: "Not Mentioned" } },
      teacherForShortGlobal: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual([]);
  });

  test("returns empty array when no data at all", () => {
    const result = schedulerGetShortTeacherList({
      teacherListForShort: {},
      teacherForShort: {},
      teacherForShortGlobal: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toEqual([]);
  });
});

// ─── schedulerIsLabShortFor ──────────────────────────────────────────────────

describe("schedulerIsLabShortFor", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerIsLabShortFor).toBe("function");
  });

  test("detects lab via short code containing 'lab'", () => {
    expect(
      schedulerIsLabShortFor({ subjectByShort: { A: {} }, key: "A", short: "CSLAB" })
    ).toBe(true);
  });

  test("detects lab via subject name containing 'lab'", () => {
    expect(
      schedulerIsLabShortFor({
        subjectByShort: { A: { CS: { subject: "Computer Lab" } } },
        key: "A",
        short: "CS",
      })
    ).toBe(true);
  });

  test("returns false for non-lab subject", () => {
    expect(
      schedulerIsLabShortFor({
        subjectByShort: { A: { MATH: { subject: "Mathematics" } } },
        key: "A",
        short: "MATH",
      })
    ).toBe(false);
  });

  test("case-insensitive lab detection", () => {
    expect(
      schedulerIsLabShortFor({ subjectByShort: { A: {} }, key: "A", short: "csLAB" })
    ).toBe(true);
    expect(
      schedulerIsLabShortFor({ subjectByShort: { A: {} }, key: "A", short: "Lab1" })
    ).toBe(true);
  });

  test("returns false for null/empty short", () => {
    expect(
      schedulerIsLabShortFor({ subjectByShort: { A: {} }, key: "A", short: "" })
    ).toBe(false);
    expect(
      schedulerIsLabShortFor({ subjectByShort: { A: {} }, key: "A", short: null })
    ).toBe(false);
  });
});

// ─── schedulerGetTeachersForCell ──────────────────────────────────────────────

describe("schedulerGetTeachersForCell", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetTeachersForCell).toBe("function");
  });

  test("returns empty array for null/empty short", () => {
    expect(
      schedulerGetTeachersForCell({
        key: "A", short: null, day: 0, col: 0,
        isLabShortFor: () => false,
        getShortTeacherList: () => [],
        getAssignedTeacherValue: () => undefined,
        teacherForShort: {}, teacherForShortGlobal: {},
      })
    ).toEqual([]);
  });

  test("returns lab teacher list for lab subjects", () => {
    expect(
      schedulerGetTeachersForCell({
        key: "A", short: "CSLAB", day: 0, col: 0,
        isLabShortFor: (k, s) => s === "CSLAB",
        getShortTeacherList: () => ["Dr. Lab1", "Dr. Lab2"],
        getAssignedTeacherValue: () => undefined,
        teacherForShort: {}, teacherForShortGlobal: {},
      })
    ).toEqual(["Dr. Lab1", "Dr. Lab2"]);
  });

  test("returns assigned teacher for non-lab", () => {
    expect(
      schedulerGetTeachersForCell({
        key: "A", short: "MATH", day: 0, col: 0,
        isLabShortFor: () => false,
        getShortTeacherList: () => [],
        getAssignedTeacherValue: () => "Dr. Assigned",
        teacherForShort: {}, teacherForShortGlobal: {},
      })
    ).toEqual(["Dr. Assigned"]);
  });

  test("returns empty when assigned teacher is null", () => {
    expect(
      schedulerGetTeachersForCell({
        key: "A", short: "MATH", day: 0, col: 0,
        isLabShortFor: () => false,
        getShortTeacherList: () => [],
        getAssignedTeacherValue: () => null,
        teacherForShort: {}, teacherForShortGlobal: {},
      })
    ).toEqual([]);
  });

  test("falls back to teacherForShort when no assignment", () => {
    expect(
      schedulerGetTeachersForCell({
        key: "A", short: "MATH", day: 0, col: 0,
        isLabShortFor: () => false,
        getShortTeacherList: () => [],
        getAssignedTeacherValue: () => undefined,
        teacherForShort: { A: { MATH: "Dr. Map" } },
        teacherForShortGlobal: {},
      })
    ).toEqual(["Dr. Map"]);
  });

  test("falls back to teacherForShortGlobal", () => {
    expect(
      schedulerGetTeachersForCell({
        key: "A", short: "MATH", day: 0, col: 0,
        isLabShortFor: () => false,
        getShortTeacherList: () => [],
        getAssignedTeacherValue: () => undefined,
        teacherForShort: { A: {} },
        teacherForShortGlobal: { MATH: "Dr. Global" },
      })
    ).toEqual(["Dr. Global"]);
  });

  test("filters 'Not Mentioned' from assigned teacher", () => {
    expect(
      schedulerGetTeachersForCell({
        key: "A", short: "MATH", day: 0, col: 0,
        isLabShortFor: () => false,
        getShortTeacherList: () => [],
        getAssignedTeacherValue: () => "Not Mentioned",
        teacherForShort: {}, teacherForShortGlobal: {},
      })
    ).toEqual([]);
  });
});

// ─── schedulerGetTeacherForCell ──────────────────────────────────────────────

describe("schedulerGetTeacherForCell", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetTeacherForCell).toBe("function");
  });

  test("returns first teacher from list", () => {
    expect(
      schedulerGetTeacherForCell({
        getTeachersForCell: () => ["Dr. A", "Dr. B"],
        key: "A", short: "M", day: 0, col: 0,
      })
    ).toBe("Dr. A");
  });

  test("returns null when list is empty", () => {
    expect(
      schedulerGetTeacherForCell({
        getTeachersForCell: () => [],
        key: "A", short: "M", day: 0, col: 0,
      })
    ).toBeNull();
  });
});

// ─── schedulerSameSubjectCode ────────────────────────────────────────────────

describe("schedulerSameSubjectCode", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerSameSubjectCode).toBe("function");
  });

  test("matches identical codes", () => {
    expect(schedulerSameSubjectCode("MATH", "MATH")).toBe(true);
  });

  test("matches case-insensitively", () => {
    expect(schedulerSameSubjectCode("Math", "MATH")).toBe(true);
  });

  test("matches theory and lab versions of same subject", () => {
    expect(schedulerSameSubjectCode("CS", "CS LAB")).toBe(true);
    expect(schedulerSameSubjectCode("CS-LAB", "CS")).toBe(true);
  });

  test("does not match different subjects", () => {
    expect(schedulerSameSubjectCode("MATH", "PHY")).toBe(false);
  });

  test("handles null/empty inputs", () => {
    expect(schedulerSameSubjectCode("", "")).toBe(true);
    expect(schedulerSameSubjectCode(null, null)).toBe(true);
    expect(schedulerSameSubjectCode("MATH", "")).toBe(false);
  });
});

// ─── schedulerIsAdjacentToSameSubjectLab ─────────────────────────────────────

describe("schedulerIsAdjacentToSameSubjectLab", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerIsAdjacentToSameSubjectLab).toBe("function");
  });

  test("detects lab block on the left (col-2, col-1)", () => {
    expect(
      schedulerIsAdjacentToSameSubjectLab({
        schedules: { A: [["CS LAB", "CS LAB", "CS", null, null, null]] },
        sameSubjectCode: schedulerSameSubjectCode,
        key: "A", day: 0, col: 2, short: "CS",
      })
    ).toBe(true);
  });

  test("detects lab block on the right (col+1, col+2)", () => {
    expect(
      schedulerIsAdjacentToSameSubjectLab({
        schedules: { A: [[null, "CS", "CS LAB", "CS LAB", null, null]] },
        sameSubjectCode: schedulerSameSubjectCode,
        key: "A", day: 0, col: 1, short: "CS",
      })
    ).toBe(true);
  });

  test("returns false when no adjacent lab block", () => {
    expect(
      schedulerIsAdjacentToSameSubjectLab({
        schedules: { A: [["MATH", "CS", "PHY", "CHEM", null, null]] },
        sameSubjectCode: schedulerSameSubjectCode,
        key: "A", day: 0, col: 1, short: "CS",
      })
    ).toBe(false);
  });

  test("returns false when adjacent pair is different subject", () => {
    expect(
      schedulerIsAdjacentToSameSubjectLab({
        schedules: { A: [["PHY LAB", "PHY LAB", "CS", null, null, null]] },
        sameSubjectCode: schedulerSameSubjectCode,
        key: "A", day: 0, col: 2, short: "CS",
      })
    ).toBe(false);
  });

  test("returns false when adjacent pair is not same (a !== b)", () => {
    expect(
      schedulerIsAdjacentToSameSubjectLab({
        schedules: { A: [["CS LAB", "MATH", "CS", null, null, null]] },
        sameSubjectCode: schedulerSameSubjectCode,
        key: "A", day: 0, col: 2, short: "CS",
      })
    ).toBe(false);
  });

  test("handles edge col=0 (no left check possible)", () => {
    expect(
      schedulerIsAdjacentToSameSubjectLab({
        schedules: { A: [["CS", "CS LAB", "CS LAB", null, null, null]] },
        sameSubjectCode: schedulerSameSubjectCode,
        key: "A", day: 0, col: 0, short: "CS",
      })
    ).toBe(true);
  });

  test("handles edge col=last (no right check possible)", () => {
    expect(
      schedulerIsAdjacentToSameSubjectLab({
        schedules: { A: [[null, null, null, "CS LAB", "CS LAB", "CS"]] },
        sameSubjectCode: schedulerSameSubjectCode,
        key: "A", day: 0, col: 5, short: "CS",
      })
    ).toBe(true);
  });
});
