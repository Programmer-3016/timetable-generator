/**
 * @file tests/unit/caps.test.js
 * @description Tests for scheduler/caps.js: bucket/cap helpers.
 */

// ─── schedulerEnsureTeacherPrePostBucket ─────────────────────────────────────

describe("schedulerEnsureTeacherPrePostBucket", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerEnsureTeacherPrePostBucket).toBe("function");
  });

  test("creates a new bucket when teacher entry does not exist", () => {
    const map = { A: {} };
    const bucket = schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass: map,
      classKey: "A",
      teacher: "Mr. X",
    });
    expect(bucket).toEqual({ pre: 0, post: 0 });
    expect(map.A["Mr. X"]).toBe(bucket);
  });

  test("returns existing bucket without overwriting", () => {
    const existing = { pre: 3, post: 2 };
    const map = { A: { "Mr. X": existing } };
    const bucket = schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass: map,
      classKey: "A",
      teacher: "Mr. X",
    });
    expect(bucket).toBe(existing);
    expect(bucket.pre).toBe(3);
    expect(bucket.post).toBe(2);
  });

  test("handles multiple teachers independently", () => {
    const map = { A: {} };
    const b1 = schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass: map,
      classKey: "A",
      teacher: "T1",
    });
    const b2 = schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass: map,
      classKey: "A",
      teacher: "T2",
    });
    expect(b1).not.toBe(b2);
    expect(Object.keys(map.A)).toEqual(["T1", "T2"]);
  });

  test("handles multiple classes independently", () => {
    const map = { A: {}, B: {} };
    schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass: map,
      classKey: "A",
      teacher: "T1",
    });
    schedulerEnsureTeacherPrePostBucket({
      teacherPrePostByClass: map,
      classKey: "B",
      teacher: "T1",
    });
    expect(map.A.T1).toEqual({ pre: 0, post: 0 });
    expect(map.B.T1).toEqual({ pre: 0, post: 0 });
    expect(map.A.T1).not.toBe(map.B.T1);
  });
});

// ─── schedulerGetFillerTotal ─────────────────────────────────────────────────

describe("schedulerGetFillerTotal", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetFillerTotal).toBe("function");
  });

  test("sums all filler counts for a class", () => {
    const result = schedulerGetFillerTotal({
      fillerCountsByClass: { A: { PT: 3, YOGA: 2, LIB: 1 } },
      classKey: "A",
    });
    expect(result).toBe(6);
  });

  test("returns 0 when class has no fillers", () => {
    const result = schedulerGetFillerTotal({
      fillerCountsByClass: { A: {} },
      classKey: "A",
    });
    expect(result).toBe(0);
  });

  test("returns 0 when class key is missing", () => {
    const result = schedulerGetFillerTotal({
      fillerCountsByClass: {},
      classKey: "A",
    });
    expect(result).toBe(0);
  });

  test("handles null/falsy values in counts", () => {
    const result = schedulerGetFillerTotal({
      fillerCountsByClass: { A: { PT: 3, YOGA: null, LIB: 0 } },
      classKey: "A",
    });
    expect(result).toBe(3);
  });

  test("handles single filler", () => {
    const result = schedulerGetFillerTotal({
      fillerCountsByClass: { A: { PT: 7 } },
      classKey: "A",
    });
    expect(result).toBe(7);
  });
});

// ─── schedulerGetFillerCap ───────────────────────────────────────────────────

describe("schedulerGetFillerCap", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetFillerCap).toBe("function");
  });

  test("returns capacity from map when present", () => {
    const result = schedulerGetFillerCap({
      fillerCapacityByClass: { A: 10 },
      classKey: "A",
      defaultCap: 5,
    });
    expect(result).toBe(10);
  });

  test("returns defaultCap when class is not in map", () => {
    const result = schedulerGetFillerCap({
      fillerCapacityByClass: {},
      classKey: "A",
      defaultCap: 5,
    });
    expect(result).toBe(5);
  });

  test("returns 0 capacity (not default) when explicitly set to 0", () => {
    const result = schedulerGetFillerCap({
      fillerCapacityByClass: { A: 0 },
      classKey: "A",
      defaultCap: 5,
    });
    expect(result).toBe(0);
  });

  test("returns defaultCap when value is null", () => {
    const result = schedulerGetFillerCap({
      fillerCapacityByClass: { A: null },
      classKey: "A",
      defaultCap: 5,
    });
    expect(result).toBe(5);
  });

  test("returns defaultCap when value is undefined", () => {
    const result = schedulerGetFillerCap({
      fillerCapacityByClass: { A: undefined },
      classKey: "A",
      defaultCap: 5,
    });
    expect(result).toBe(5);
  });
});

// ─── schedulerGetFillerSubjectCap ────────────────────────────────────────────

describe("schedulerGetFillerSubjectCap", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetFillerSubjectCap).toBe("function");
  });

  test("returns per-subject cap when present", () => {
    const result = schedulerGetFillerSubjectCap({
      fillerPerSubjectCapByClass: { A: 3 },
      classKey: "A",
      defaultCap: 2,
    });
    expect(result).toBe(3);
  });

  test("returns defaultCap when missing", () => {
    const result = schedulerGetFillerSubjectCap({
      fillerPerSubjectCapByClass: {},
      classKey: "A",
      defaultCap: 2,
    });
    expect(result).toBe(2);
  });

  test("returns 0 when explicitly set to 0", () => {
    const result = schedulerGetFillerSubjectCap({
      fillerPerSubjectCapByClass: { A: 0 },
      classKey: "A",
      defaultCap: 2,
    });
    expect(result).toBe(0);
  });
});
