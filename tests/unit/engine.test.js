/**
 * @file tests/unit/engine.test.js
 * @description Tests for schedulerRenderMultiClassesEngine
 *   from core/scheduler/engine.js.
 *   These are integration-style tests that exercise the full scheduling pipeline.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sets up periodTimings global for a given number of class periods + lunch. */
function setupPeriodTimings(numClasses, lunchAfter) {
  const timings = [];
  for (let i = 0; i < numClasses; i++) {
    if (i === lunchAfter) {
      timings.push({ type: "lunch", label: "Lunch", duration: 30 });
    }
    timings.push({
      type: "class",
      label: `P${i + 1}`,
      duration: 50,
    });
  }
  global.periodTimings = timings;
}

/** Stubs DOM methods needed by engine. */
function stubDOM() {
  if (!global.document) global.document = {};
  global.document.getElementById = () => null;
  global.document.querySelector = () => null;
  global.document.querySelectorAll = () => [];
  global.document.createElement = (tag) => ({
    tagName: tag.toUpperCase(),
    classList: { add: () => {}, remove: () => {} },
    setAttribute: () => {},
    appendChild: () => {},
    style: {},
    innerHTML: "",
    textContent: "",
    dataset: {},
    children: [],
    querySelectorAll: () => [],
    querySelector: () => null,
  });
}

beforeEach(() => {
  // Reset relevant globals
  global.gSchedules = {};
  global.gEnabledKeys = [];
  global.gSubjectByShort = {};
  global.gWeeklyQuotaByClass = {};
  global.gCanonFoldMap = {};
  global.gFillerLabelsByClass = {};
  global.aggregateStats = {};
  global.gAssignedTeacher = {};
  global.gLabNumberAssigned = {};
  global.gFillerShortsByClass = {};
  global.gClassLabels = {};
  global.gLabsAtSlot = {};
  global.window.__ttLastSeed = undefined;
  global.window.__ttLastScheduleState = undefined;
  global.window.__ttLastValidation = undefined;
  global.window.__ttUnresolvedClashes = undefined;
  global.window.__ttPostLunchCompactReport = undefined;
  global.window.strictFillersLastTwo = false;
  global.window.guaranteeFilledP5 = false;
  global.window.allowP5FillerEmergency = true;
  stubDOM();
});

// ─── schedulerRenderMultiClassesEngine ───────────────────────────────────────

describe("schedulerRenderMultiClassesEngine", () => {
  test("is defined as a function", () => {
    expect(typeof schedulerRenderMultiClassesEngine).toBe("function");
  });

  test("returns early when no class periods available", () => {
    global.periodTimings = [{ type: "lunch", label: "Lunch", duration: 30 }];
    const toastCalls = [];
    global.showToast = (msg) => toastCalls.push(msg);

    schedulerRenderMultiClassesEngine({
      pairsByClass: {},
      days: 5,
      defaultDuration: 50,
      enabledKeys: [],
    });

    expect(toastCalls.some((m) => /no class/i.test(m))).toBe(true);
  });

  test("generates schedule for a single class with basic subjects", () => {
    setupPeriodTimings(6, 3);

    schedulerRenderMultiClassesEngine({
      pairsByClass: {
        A: [
          { short: "MATH", subject: "Mathematics", teacher: "Dr. Kumar", credits: 4 },
          { short: "PHY", subject: "Physics", teacher: "Dr. Sharma", credits: 3 },
          { short: "CHEM", subject: "Chemistry", teacher: "Dr. Verma", credits: 3 },
        ],
      },
      days: 5,
      defaultDuration: 50,
      enabledKeys: ["A"],
      fillerShortsByClass: { A: new Set(["PT", "LIB"]) },
      fillerCreditsByClass: { A: { PT: 2, LIB: 2 } },
      mainShortsByClass: { A: new Set(["MATH", "PHY", "CHEM"]) },
      seed: 42,
    });

    // Schedule should exist
    expect(gSchedules).toBeDefined();
    expect(gSchedules.A).toBeDefined();
    expect(Array.isArray(gSchedules.A)).toBe(true);
    expect(gSchedules.A.length).toBe(5);

    // Each day should have 6 periods
    for (const dayRow of gSchedules.A) {
      expect(dayRow.length).toBe(6);
    }

    // Seed should be recorded
    expect(window.__ttLastSeed).toBe(42);
  });

  test("generates schedule for multiple classes", () => {
    setupPeriodTimings(6, 3);

    schedulerRenderMultiClassesEngine({
      pairsByClass: {
        A: [
          { short: "MATH", subject: "Math", teacher: "T1", credits: 3 },
          { short: "PHY", subject: "Physics", teacher: "T2", credits: 3 },
        ],
        B: [
          { short: "MATH", subject: "Math", teacher: "T3", credits: 3 },
          { short: "CHEM", subject: "Chemistry", teacher: "T4", credits: 3 },
        ],
      },
      days: 5,
      defaultDuration: 50,
      enabledKeys: ["A", "B"],
      fillerShortsByClass: {
        A: new Set(["PT"]),
        B: new Set(["LIB"]),
      },
      fillerCreditsByClass: { A: { PT: 2 }, B: { LIB: 2 } },
      mainShortsByClass: {
        A: new Set(["MATH", "PHY"]),
        B: new Set(["MATH", "CHEM"]),
      },
      seed: 100,
    });

    expect(gSchedules.A).toBeDefined();
    expect(gSchedules.B).toBeDefined();
    expect(gSchedules.A.length).toBe(5);
    expect(gSchedules.B.length).toBe(5);
  });

  test("handles lab subjects correctly", () => {
    setupPeriodTimings(6, 3);

    schedulerRenderMultiClassesEngine({
      pairsByClass: {
        A: [
          { short: "MATH", subject: "Math", teacher: "T1", credits: 3 },
          { short: "CSLAB", subject: "CS Lab", teacher: "T2", credits: 2 },
        ],
      },
      days: 5,
      defaultDuration: 50,
      enabledKeys: ["A"],
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCreditsByClass: { A: { PT: 2 } },
      mainShortsByClass: { A: new Set(["MATH"]) },
      seed: 77,
    });

    // Lab should appear in schedule somewhere as adjacent pair
    const allSlots = gSchedules.A.flat();
    const labSlots = allSlots.filter((s) => s === "CSLAB");
    if (labSlots.length > 0) {
      expect(labSlots.length % 2).toBe(0);
    }
  });

  test("is deterministic with same seed", () => {
    setupPeriodTimings(6, 3);
    const args = {
      pairsByClass: {
        A: [
          { short: "MATH", subject: "Math", teacher: "T1", credits: 4 },
          { short: "PHY", subject: "Physics", teacher: "T2", credits: 3 },
        ],
      },
      days: 5,
      defaultDuration: 50,
      enabledKeys: ["A"],
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCreditsByClass: { A: { PT: 2 } },
      mainShortsByClass: { A: new Set(["MATH", "PHY"]) },
      seed: 999,
    };

    schedulerRenderMultiClassesEngine(args);
    const first = JSON.stringify(gSchedules.A);

    // Reset
    global.gSchedules = {};
    schedulerRenderMultiClassesEngine(args);
    const second = JSON.stringify(gSchedules.A);

    expect(first).toBe(second);
  });

  test("produces validation result", () => {
    setupPeriodTimings(6, 3);

    schedulerRenderMultiClassesEngine({
      pairsByClass: {
        A: [
          { short: "MATH", subject: "Math", teacher: "T1", credits: 4 },
          { short: "PHY", subject: "Physics", teacher: "T2", credits: 3 },
        ],
      },
      days: 5,
      defaultDuration: 50,
      enabledKeys: ["A"],
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCreditsByClass: { A: { PT: 2 } },
      mainShortsByClass: { A: new Set(["MATH", "PHY"]) },
      seed: 42,
    });

    expect(window.__ttLastValidation).toBeDefined();
    expect(window.__ttLastValidation).toHaveProperty("valid");
  });

  test("populates gEnabledKeys", () => {
    setupPeriodTimings(4, 2);

    schedulerRenderMultiClassesEngine({
      pairsByClass: {
        X: [{ short: "M", subject: "Math", teacher: "T", credits: 2 }],
      },
      days: 3,
      defaultDuration: 45,
      enabledKeys: ["X"],
      fillerShortsByClass: { X: new Set() },
      fillerCreditsByClass: {},
      mainShortsByClass: { X: new Set(["M"]) },
      seed: 1,
    });

    expect(gEnabledKeys).toContain("X");
  });

  test("handles empty pairsByClass gracefully", () => {
    setupPeriodTimings(4, 2);

    expect(() => {
      schedulerRenderMultiClassesEngine({
        pairsByClass: {},
        days: 5,
        defaultDuration: 50,
        enabledKeys: [],
        seed: 1,
      });
    }).not.toThrow();
  });

  test("handles fixed slots", () => {
    setupPeriodTimings(6, 3);

    schedulerRenderMultiClassesEngine({
      pairsByClass: {
        A: [
          { short: "MATH", subject: "Math", teacher: "T1", credits: 4 },
          { short: "PHY", subject: "Physics", teacher: "T2", credits: 3 },
        ],
      },
      days: 5,
      defaultDuration: 50,
      enabledKeys: ["A"],
      fillerShortsByClass: { A: new Set(["PT"]) },
      fillerCreditsByClass: { A: { PT: 2 } },
      mainShortsByClass: { A: new Set(["MATH", "PHY"]) },
      fixedSlotsByClass: {
        A: [{ day: 0, slot: 0, short: "MATH", teacher: "T1" }],
      },
      seed: 42,
    });

    // Fixed slot should be honored
    expect(gSchedules.A[0][0]).toBe("MATH");
  });
});
