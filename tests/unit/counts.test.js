/**
 * @file tests/unit/counts.test.js
 * @description Tests for scheduler/counts.js: occurrence counting and target lookups.
 */

// ─── schedulerCountOccurrences ───────────────────────────────────────────────

describe("schedulerCountOccurrences", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerCountOccurrences).toBe("function");
  });

  test("counts occurrences of a short across all days and periods", () => {
    const result = schedulerCountOccurrences({
      schedules: {
        A: [
          ["MATH", "PHY", "MATH"],
          ["CHEM", "MATH", "PHY"],
        ],
      },
      days: 2,
      classesPerDay: 3,
      key: "A",
      short: "MATH",
    });
    expect(result).toBe(3);
  });

  test("returns 0 when short is not present", () => {
    const result = schedulerCountOccurrences({
      schedules: { A: [["MATH", "PHY", "CHEM"]] },
      days: 1,
      classesPerDay: 3,
      key: "A",
      short: "BIO",
    });
    expect(result).toBe(0);
  });

  test("handles null slots (does not count them)", () => {
    const result = schedulerCountOccurrences({
      schedules: { A: [[null, "MATH", null, "MATH", null]] },
      days: 1,
      classesPerDay: 5,
      key: "A",
      short: "MATH",
    });
    expect(result).toBe(2);
  });

  test("counts across 5 days", () => {
    const schedules = {
      A: [
        ["MATH"], ["MATH"], ["PHY"], ["MATH"], ["MATH"],
      ],
    };
    const result = schedulerCountOccurrences({
      schedules,
      days: 5,
      classesPerDay: 1,
      key: "A",
      short: "MATH",
    });
    expect(result).toBe(4);
  });

  test("uses strict equality (does not match substrings)", () => {
    const result = schedulerCountOccurrences({
      schedules: { A: [["MATH", "MATH LAB", "MATHEMATICS"]] },
      days: 1,
      classesPerDay: 3,
      key: "A",
      short: "MATH",
    });
    expect(result).toBe(1);
  });

  test("returns 0 for empty schedule", () => {
    const result = schedulerCountOccurrences({
      schedules: { A: [] },
      days: 0,
      classesPerDay: 6,
      key: "A",
      short: "MATH",
    });
    expect(result).toBe(0);
  });
});

// ─── schedulerGetTargetForShort ──────────────────────────────────────────────

describe("schedulerGetTargetForShort", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerGetTargetForShort).toBe("function");
  });

  test("returns quota value when present", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: { A: { MATH: 6 } },
      key: "A",
      short: "MATH",
    });
    expect(result).toBe(6);
  });

  test("returns defaultTarget when quota is missing for short", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: { A: {} },
      key: "A",
      short: "MATH",
      defaultTarget: 5,
    });
    expect(result).toBe(5);
  });

  test("returns defaultTarget when quota is missing for class", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: {},
      key: "A",
      short: "MATH",
      defaultTarget: 5,
    });
    expect(result).toBe(5);
  });

  test("defaults to 5 when defaultTarget not provided", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: {},
      key: "A",
      short: "MATH",
    });
    expect(result).toBe(5);
  });

  test("returns defaultTarget when quota is 0", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: { A: { MATH: 0 } },
      key: "A",
      short: "MATH",
      defaultTarget: 5,
    });
    expect(result).toBe(5);
  });

  test("returns defaultTarget when quota is negative", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: { A: { MATH: -3 } },
      key: "A",
      short: "MATH",
      defaultTarget: 5,
    });
    expect(result).toBe(5);
  });

  test("returns defaultTarget when quota is NaN", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: { A: { MATH: NaN } },
      key: "A",
      short: "MATH",
      defaultTarget: 5,
    });
    expect(result).toBe(5);
  });

  test("returns quota value of 1 (valid positive)", () => {
    const result = schedulerGetTargetForShort({
      weeklyQuota: { A: { MATH: 1 } },
      key: "A",
      short: "MATH",
      defaultTarget: 5,
    });
    expect(result).toBe(1);
  });
});
