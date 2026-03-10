/**
 * @file tests/unit/input-validator.test.js
 * @description Tests for validateInputsBeforeGenerate — pre-generation input checks.
 */

/**
 * Helper: creates a minimal DOM with the inputs that validateInputsBeforeGenerate reads.
 * @param {{ slots?: number, days?: number, duration?: number, classCount?: number, pairs?: Object<string,string> }} opts
 */
function setupValidatorDOM({
  slots = 6,
  days = 5,
  duration = 50,
  classCount = 1,
  pairs = {},
} = {}) {
  // Clear body
  document.body.innerHTML = "";

  // Create numeric inputs
  const slotsEl = document.createElement("input");
  slotsEl.id = "slots";
  slotsEl.value = String(slots);
  document.body.appendChild(slotsEl);

  const daysEl = document.createElement("input");
  daysEl.id = "days";
  daysEl.value = String(days);
  document.body.appendChild(daysEl);

  const durationEl = document.createElement("input");
  durationEl.id = "duration";
  durationEl.value = String(duration);
  document.body.appendChild(durationEl);

  const classCountEl = document.createElement("input");
  classCountEl.id = "classCount";
  classCountEl.value = String(classCount);
  document.body.appendChild(classCountEl);

  // Create textareas for each class
  Object.entries(pairs).forEach(([key, text]) => {
    const textarea = document.createElement("textarea");
    textarea.id = `pairs${key}`;
    textarea.value = text;
    document.body.appendChild(textarea);
  });
}

// ─── validateInputsBeforeGenerate ───────────────────────────────────────────

describe("validateInputsBeforeGenerate", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("is defined as a function", () => {
    expect(typeof validateInputsBeforeGenerate).toBe("function");
  });

  test("returns valid for correct inputs", () => {
    setupValidatorDOM({
      slots: 6,
      days: 5,
      duration: 50,
      classCount: 1,
      pairs: { A: "MATH - Mathematics - Dr. Kumar - 4\nPHY - Physics - Dr. Singh - 3" },
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects invalid number of periods (0)", () => {
    setupValidatorDOM({
      slots: 0,
      days: 5,
      duration: 50,
      classCount: 1,
      pairs: { A: "MATH - Mathematics - Dr. Kumar - 4" },
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /period/i.test(e))).toBe(true);
  });

  test("rejects invalid number of days (0)", () => {
    setupValidatorDOM({
      slots: 6,
      days: 0,
      duration: 50,
      classCount: 1,
      pairs: { A: "MATH - Mathematics - Dr. Kumar - 4" },
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /day/i.test(e))).toBe(true);
  });

  test("rejects too-short period duration (< 10 min)", () => {
    setupValidatorDOM({
      slots: 6,
      days: 5,
      duration: 5,
      classCount: 1,
      pairs: { A: "MATH - Mathematics - Dr. Kumar - 4" },
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /duration/i.test(e))).toBe(true);
  });

  test("rejects when no subjects entered", () => {
    setupValidatorDOM({
      slots: 6,
      days: 5,
      duration: 50,
      classCount: 1,
      pairs: {}, // no textarea at all
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /no subjects/i.test(e))).toBe(true);
  });

  test("rejects when total credits exceed available slots", () => {
    // 2 slots × 1 day = 2 available, but credits sum to 7
    setupValidatorDOM({
      slots: 2,
      days: 1,
      duration: 50,
      classCount: 1,
      pairs: { A: "MATH - Mathematics - Dr. Kumar - 4\nPHY - Physics - Dr. Singh - 3" },
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /exceed|credits/i.test(e))).toBe(true);
  });

  test("accepts when total credits fit available slots", () => {
    // 6 slots × 5 days = 30 available, credits = 4 + 3 = 7
    setupValidatorDOM({
      slots: 6,
      days: 5,
      duration: 50,
      classCount: 1,
      pairs: { A: "MATH - Mathematics - Dr. Kumar - 4\nPHY - Physics - Dr. Singh - 3" },
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(true);
  });

  test("handles empty textarea (blank class) — still rejects no subjects", () => {
    setupValidatorDOM({
      slots: 6,
      days: 5,
      duration: 50,
      classCount: 1,
      pairs: { A: "" }, // textarea exists but is empty
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /no subjects/i.test(e))).toBe(true);
  });

  test("handles multiple classes correctly", () => {
    setupValidatorDOM({
      slots: 6,
      days: 5,
      duration: 50,
      classCount: 2,
      pairs: {
        A: "MATH - Mathematics - Dr. Kumar - 4",
        B: "PHY - Physics - Dr. Singh - 3",
      },
    });
    const result = validateInputsBeforeGenerate();
    expect(result.valid).toBe(true);
  });

  test("returns errors array even when valid", () => {
    setupValidatorDOM({
      slots: 6,
      days: 5,
      duration: 50,
      classCount: 1,
      pairs: { A: "MATH - Mathematics - Dr. Kumar - 4" },
    });
    const result = validateInputsBeforeGenerate();
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
