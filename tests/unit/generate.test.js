/**
 * @file tests/unit/generate.test.js
 * @description Tests for core/generate.js pure helpers.
 */

/* ═══════════════════════════════════════════════════════
   Section: formatTime
═══════════════════════════════════════════════════════ */

describe("formatTime", () => {
  test("is defined as a function", () => {
    expect(typeof formatTime).toBe("function");
  });

  test("formats midnight as 00:00", () => {
    expect(formatTime(new Date(2024, 0, 1, 0, 0))).toBe("00:00");
  });

  test("formats noon as 12:00", () => {
    expect(formatTime(new Date(2024, 0, 1, 12, 0))).toBe("12:00");
  });

  test("pads single-digit hours", () => {
    expect(formatTime(new Date(2024, 0, 1, 9, 30))).toBe("09:30");
  });

  test("pads single-digit minutes", () => {
    expect(formatTime(new Date(2024, 0, 1, 14, 5))).toBe("14:05");
  });

  test("handles 23:59", () => {
    expect(formatTime(new Date(2024, 0, 1, 23, 59))).toBe("23:59");
  });

  test("handles 00:01", () => {
    expect(formatTime(new Date(2024, 0, 1, 0, 1))).toBe("00:01");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: resolveGenerationSeed
═══════════════════════════════════════════════════════ */

describe("resolveGenerationSeed", () => {
  test("is defined as a function", () => {
    expect(typeof resolveGenerationSeed).toBe("function");
  });

  test("returns a number", () => {
    expect(typeof resolveGenerationSeed(42)).toBe("number");
  });

  test("returns an unsigned 32-bit integer (0 to 2^32-1)", () => {
    const seed = resolveGenerationSeed(12345, 3);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("is deterministic for same inputs", () => {
    const a = resolveGenerationSeed(100, 5);
    const b = resolveGenerationSeed(100, 5);
    expect(a).toBe(b);
  });

  test("different attemptIndex produces different seed", () => {
    const a = resolveGenerationSeed(42, 0);
    const b = resolveGenerationSeed(42, 1);
    expect(a).not.toBe(b);
  });

  test("different baseSeed produces different seed", () => {
    const a = resolveGenerationSeed(1, 0);
    const b = resolveGenerationSeed(2, 0);
    expect(a).not.toBe(b);
  });

  test("attemptIndex defaults to 0", () => {
    const a = resolveGenerationSeed(42);
    const b = resolveGenerationSeed(42, 0);
    expect(a).toBe(b);
  });

  test("handles baseSeed = 0", () => {
    const seed = resolveGenerationSeed(0, 0);
    expect(seed).toBe(0);
  });

  test("handles large baseSeed", () => {
    const seed = resolveGenerationSeed(0xFFFFFFFF, 0);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("handles negative baseSeed via unsigned shift", () => {
    const seed = resolveGenerationSeed(-1, 0);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("handles non-finite baseSeed (NaN) by deriving from Date.now", () => {
    const seed = resolveGenerationSeed(NaN, 0);
    expect(typeof seed).toBe("number");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  test("handles Infinity baseSeed by deriving from Date.now", () => {
    const seed = resolveGenerationSeed(Infinity, 0);
    expect(typeof seed).toBe("number");
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  test("produces good distribution across attempts", () => {
    const seeds = new Set();
    for (let i = 0; i < 100; i++) {
      seeds.add(resolveGenerationSeed(42, i));
    }
    // at least 95 unique seeds out of 100
    expect(seeds.size).toBeGreaterThanOrEqual(95);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: buildGenerationAttemptMetrics
═══════════════════════════════════════════════════════ */

describe("buildGenerationAttemptMetrics", () => {
  test("is defined as a function", () => {
    expect(typeof buildGenerationAttemptMetrics).toBe("function");
  });

  test("counts unresolved clashes, compaction issues, and teacher clash violations separately", () => {
    const metrics = buildGenerationAttemptMetrics({
      validation: {
        valid: false,
        healthy: false,
        unresolvedClashCount: 2,
        compactionIssueCount: 1,
        violations: [
          "Teacher clash: T1 is double-booked on Monday P1",
          "Unresolved teacher clashes remain (2)",
          "Post-lunch compaction issues remain (1)",
          "Main quota unmet for CS in class A",
        ],
      },
      objectiveScore: 7.5,
    });

    expect(metrics.healthy).toBe(false);
    expect(metrics.unresolvedClashCount).toBe(2);
    expect(metrics.compactionIssueCount).toBe(1);
    expect(metrics.teacherClashViolationCount).toBe(1);
    expect(metrics.otherViolationCount).toBe(1);
    expect(metrics.totalViolationCount).toBe(4);
    expect(metrics.objectiveScore).toBe(7.5);
  });

  test("falls back to runtime diagnostics when report counts are missing", () => {
    const metrics = buildGenerationAttemptMetrics({
      validation: {
        valid: false,
        violations: ["Teacher clash: T2 is double-booked"],
      },
      unresolvedClashes: [{}, {}],
      compactionReport: { totalIssues: 3 },
      objectiveScore: 1,
    });

    expect(metrics.unresolvedClashCount).toBe(2);
    expect(metrics.compactionIssueCount).toBe(3);
    expect(metrics.teacherClashViolationCount).toBe(1);
    expect(metrics.otherViolationCount).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: isGenerationCandidateBetter
═══════════════════════════════════════════════════════ */

describe("isGenerationCandidateBetter", () => {
  test("is defined as a function", () => {
    expect(typeof isGenerationCandidateBetter).toBe("function");
  });

  test("prefers healthy attempts over unhealthy ones", () => {
    const healthy = {
      healthy: true,
      unresolvedClashCount: 0,
      compactionIssueCount: 0,
      teacherClashViolationCount: 0,
      otherViolationCount: 0,
      totalViolationCount: 0,
      objectiveScore: 1,
    };
    const unhealthy = {
      healthy: false,
      unresolvedClashCount: 0,
      compactionIssueCount: 0,
      teacherClashViolationCount: 0,
      otherViolationCount: 0,
      totalViolationCount: 0,
      objectiveScore: 99,
    };

    expect(isGenerationCandidateBetter(healthy, unhealthy)).toBe(true);
    expect(isGenerationCandidateBetter(unhealthy, healthy)).toBe(false);
  });

  test("prefers fewer unresolved clashes before objective score", () => {
    const safer = {
      healthy: false,
      unresolvedClashCount: 0,
      compactionIssueCount: 0,
      teacherClashViolationCount: 1,
      otherViolationCount: 2,
      totalViolationCount: 3,
      objectiveScore: 5,
    };
    const riskier = {
      healthy: false,
      unresolvedClashCount: 2,
      compactionIssueCount: 0,
      teacherClashViolationCount: 0,
      otherViolationCount: 0,
      totalViolationCount: 2,
      objectiveScore: 50,
    };

    expect(isGenerationCandidateBetter(safer, riskier)).toBe(true);
    expect(isGenerationCandidateBetter(riskier, safer)).toBe(false);
  });

  test("uses objective score only as a final tie-breaker", () => {
    const betterScore = {
      healthy: false,
      unresolvedClashCount: 0,
      compactionIssueCount: 0,
      teacherClashViolationCount: 0,
      otherViolationCount: 1,
      totalViolationCount: 1,
      objectiveScore: 12,
    };
    const worseScore = {
      healthy: false,
      unresolvedClashCount: 0,
      compactionIssueCount: 0,
      teacherClashViolationCount: 0,
      otherViolationCount: 1,
      totalViolationCount: 1,
      objectiveScore: 3,
    };

    expect(isGenerationCandidateBetter(betterScore, worseScore)).toBe(true);
    expect(isGenerationCandidateBetter(worseScore, betterScore)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: generateTimetable
═══════════════════════════════════════════════════════ */

describe("generateTimetable", () => {
  let originalRenderMultiClasses;
  let originalShowToast;
  let originalBuildAndRenderReport;
  let originalBuildFacultyPanel;
  let originalRenderLabTimetables;
  let originalBuildToolbar;
  let originalEnableDragAndDrop;
  let originalSwitchTab;
  let originalOnVersionAutoSave;
  let originalImportedFixedSlotsByClass;
  let originalSchedulerRenderClassToDOM;
  let originalGenerated;

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="slots" value="4" />
      <input id="days" value="5" />
      <input id="startTime" value="09:05" />
      <input id="duration" value="50" />
      <input id="lunchPeriod" value="2" />
      <input id="lunchDuration" value="40" />
      <input id="labCount" value="5" />
      <input id="classCount" value="1" />
      <textarea id="pairs">MATH - Mathematics - T1\nPHY - Physics - T2</textarea>
      <input id="fillerShorts" value="PT" />
      <input id="mainShorts" value="MATH, PHY" />
      <div id="timetableWrap"></div>
    `;

    originalRenderMultiClasses = global.renderMultiClasses;
    originalShowToast = global.showToast;
    originalBuildAndRenderReport = global.buildAndRenderReport;
    originalBuildFacultyPanel = global.buildFacultyPanel;
    originalRenderLabTimetables = global.renderLabTimetables;
    originalBuildToolbar = global.buildToolbar;
    originalEnableDragAndDrop = global.enableDragAndDrop;
    originalSwitchTab = global.switchTab;
    originalOnVersionAutoSave = global.onVersionAutoSave;
    originalImportedFixedSlotsByClass = global.gImportedFixedSlotsByClass;
    originalSchedulerRenderClassToDOM = global.schedulerRenderClassToDOM;
    originalGenerated = global.generated;

    global.CLASS_KEYS = ["A"];
    global.showToast = () => {};
    global.buildAndRenderReport = () => {};
    global.buildFacultyPanel = () => {};
    global.renderLabTimetables = () => {};
    global.buildToolbar = () => {};
    global.enableDragAndDrop = () => {};
    global.switchTab = () => {};
    global.onVersionAutoSave = () => {};
    global.gImportedFixedSlotsByClass = {};
    global.generated = false;
    global.window.__ttGenerationRunning = false;
    global.window.__ttGenerationPending = false;
  });

  afterEach(() => {
    global.renderMultiClasses = originalRenderMultiClasses;
    global.showToast = originalShowToast;
    global.buildAndRenderReport = originalBuildAndRenderReport;
    global.buildFacultyPanel = originalBuildFacultyPanel;
    global.renderLabTimetables = originalRenderLabTimetables;
    global.buildToolbar = originalBuildToolbar;
    global.enableDragAndDrop = originalEnableDragAndDrop;
    global.switchTab = originalSwitchTab;
    global.onVersionAutoSave = originalOnVersionAutoSave;
    global.gImportedFixedSlotsByClass = originalImportedFixedSlotsByClass;
    global.schedulerRenderClassToDOM = originalSchedulerRenderClassToDOM;
    global.generated = originalGenerated;
    document.body.innerHTML = "";
  });

  test("passes the sidebar labCount to renderMultiClasses", () => {
    const calls = [];
    global.renderMultiClasses = (params) => {
      calls.push(params);
      window.__ttLastSeed = params.seed;
      window.__ttLastScheduleState = {};
      window.__ttUnresolvedClashes = [];
      window.__ttPostLunchCompactReport = { totalIssues: 0 };
      window.__ttLastValidation = {
        valid: true,
        healthy: true,
        violations: [],
      };
    };

    generateTimetable({
      __runImmediate: true,
      seed: 1234,
      maxAttempts: 1,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].labCapacity).toBe(5);
  });

  test("warns and skips version auto-save when low lab capacity still leaves room conflicts", () => {
    const toastCalls = [];
    let autoSaveCalls = 0;

    global.showToast = (message, options) => {
      toastCalls.push({
        message,
        options,
      });
    };
    global.onVersionAutoSave = () => {
      autoSaveCalls += 1;
    };
    global.renderMultiClasses = (params) => {
      window.__ttLastSeed = params.seed;
      window.__ttLastScheduleState = {};
      window.__ttUnresolvedClashes = [];
      window.__ttPostLunchCompactReport = { totalIssues: 0 };
      window.__ttLastValidation = {
        valid: false,
        healthy: false,
        unresolvedClashCount: 0,
        compactionIssueCount: 0,
        violations: [
          "Lab room 2 double-booked on Day 5 Slot 5 in classes E and F",
          "Lab room 2 double-booked on Day 5 Slot 6 in classes E and F",
        ],
      };
    };

    generateTimetable({
      __runImmediate: true,
      seed: 1234,
      maxAttempts: 1,
    });

    expect(autoSaveCalls).toBe(0);
    expect(global.generated).toBe(false);
    expect(window.__ttStrictGenerationMeta.accepted).toBe(false);
    expect(window.__ttStrictGenerationMeta.savedToVersions).toBe(false);
    expect(
      toastCalls.some((entry) =>
        /could not generate a valid timetable with 5 lab rooms/i.test(
          String(entry.message || "")
        )
      )
    ).toBe(true);
    expect(
      toastCalls.some((entry) =>
        /this run was not saved to versions/i.test(String(entry.message || ""))
      )
    ).toBe(true);
  });

  test("restores the previous accepted schedule when a new strict run is invalid", () => {
    const previousSnapshot = {
      seed: 4242,
      keys: ["A"],
      days: 5,
      classesPerDay: 4,
      lunchClassIndex: 2,
      schedulesByClass: {
        A: Array.from({ length: 5 }, () => ["MATH", "PHY", null, null]),
      },
      teacherForShortByClass: {
        A: {
          MATH: "T1",
          PHY: "T2",
        },
      },
      subjectByShortByClass: {
        A: {
          MATH: { subject: "Mathematics" },
          PHY: { subject: "Physics" },
        },
      },
      assignedTeacher: {
        A: Array.from({ length: 5 }, () => [undefined, undefined, undefined, undefined]),
      },
      labNumberAssigned: {
        A: Array.from({ length: 5 }, () => [null, null, null, null]),
      },
      fillerShortsByClass: { A: {} },
      weeklyQuotaByClass: { A: {} },
      isLabShortByClass: { A: {} },
    };
    const previousValidation = {
      valid: true,
      healthy: true,
      violations: [],
      unresolvedClashCount: 0,
      compactionIssueCount: 0,
    };
    const expectedRestoredSnapshot = JSON.parse(JSON.stringify(previousSnapshot));
    const reportSpy = jest.fn();
    const facultySpy = jest.fn();
    const labsSpy = jest.fn();
    const renderClassSpy = jest.fn();

    global.buildAndRenderReport = reportSpy;
    global.buildFacultyPanel = facultySpy;
    global.renderLabTimetables = labsSpy;
    global.schedulerRenderClassToDOM = renderClassSpy;
    global.generated = true;
    global.gClassLabels = { A: "Class A" };
    global.window.__ttLastScheduleState = JSON.parse(JSON.stringify(previousSnapshot));
    global.window.__ttLastValidation = { ...previousValidation };
    global.window.__ttUnresolvedClashes = [];
    global.window.__ttPostLunchCompactReport = { totalIssues: 0 };
    global.window.__ttLastSeed = previousSnapshot.seed;

    global.renderMultiClasses = (params) => {
      window.__ttLastSeed = params.seed;
      window.__ttLastScheduleState = {
        seed: params.seed,
        keys: ["A"],
        days: 5,
        classesPerDay: 4,
        schedulesByClass: {
          A: Array.from({ length: 5 }, () => ["BAD", null, null, null]),
        },
      };
      window.__ttUnresolvedClashes = [];
      window.__ttPostLunchCompactReport = { totalIssues: 0 };
      window.__ttLastValidation = {
        valid: false,
        healthy: false,
        unresolvedClashCount: 0,
        compactionIssueCount: 0,
        violations: [
          'Teacher double booking on Day 1 Slot 1 for "t1"',
        ],
      };
    };

    generateTimetable({
      __runImmediate: true,
      seed: 1234,
      maxAttempts: 1,
    });

    expect(window.__ttStrictGenerationMeta.accepted).toBe(false);
    expect(window.__ttStrictGenerationMeta.restoredPreviousAccepted).toBe(true);
    expect(global.generated).toBe(true);
    expect(window.__ttLastScheduleState).toEqual(expectedRestoredSnapshot);
    expect(window.__ttLastValidation).toEqual(previousValidation);
    expect(renderClassSpy).toHaveBeenCalled();
    expect(reportSpy).toHaveBeenCalled();
    expect(facultySpy).toHaveBeenCalled();
    expect(labsSpy).toHaveBeenCalled();
  });
});
