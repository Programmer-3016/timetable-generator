/**
 * @file tests/scenarios/regression.test.js
 * @description End-to-end regression scenarios for scheduler stabilization sprint 1.
 */

const {
  schedulerScenarioFixtures,
} = require("../helpers/scheduler-fixtures");
const {
  runSchedulerScenario,
  assertHealthyScheduleResult,
} = require("../helpers/scheduler-scenarios");

/**
 * Counts how many times a short appears in a class schedule grid.
 * @param {Array<Array<string|null>>} grid - Schedule matrix for one class.
 * @param {string} short - Subject short code.
 * @returns {number} Count of matching slots.
 */
function countShort(grid, short) {
  return (grid || []).reduce((sum, row) => (
    sum + (row || []).filter((cell) => cell === short).length
  ), 0);
}

/**
 * Builds a deterministic seed series from a base seed.
 * @param {number} baseSeed
 * @param {number} count
 * @returns {number[]}
 */
function buildSeedSeries(baseSeed, count) {
  return Array.from({ length: count }, (_, index) =>
    resolveGenerationSeed(baseSeed, index)
  );
}

/**
 * Finds the first healthy result for a scenario inside a fixed seed series.
 * @param {Object} fixture
 * @param {number[]} seeds
 * @returns {{ seed: number, result: ReturnType<typeof runSchedulerScenario> }|null}
 */
function findFirstHealthyScenarioRun(fixture, seeds) {
  for (const seed of seeds) {
    const result = runSchedulerScenario({
      ...fixture,
      seed,
    });
    if (result.validation && result.validation.healthy) {
      return { seed, result };
    }
  }
  return null;
}

describe("Scheduler regression scenarios", () => {
  test("healthy shared-teacher scenario is publishable and clash-free after compaction", () => {
    const result = runSchedulerScenario(
      schedulerScenarioFixtures.healthySharedTeacherLoad
    );

    expect(assertHealthyScheduleResult(result)).toBe(true);
    expect(result.validation.healthy).toBe(true);
    expect(result.unresolvedClashes).toEqual([]);
    expect(result.compactionReport.totalIssues).toBe(0);
  });

  test("lab scheduling near lunch keeps lab blocks intact", () => {
    const result = runSchedulerScenario(
      schedulerScenarioFixtures.healthyLabNearLunch
    );

    expect(assertHealthyScheduleResult(result)).toBe(true);
    expect(
      result.validation.violations.some((line) => /lab block broken/i.test(line))
    ).toBe(false);
  });

  test("fixed-slot teacher conflict remains unhealthy and surfaces unresolved clashes", () => {
    const result = runSchedulerScenario(
      schedulerScenarioFixtures.impossibleFixedTeacherConflict
    );

    expect(result.validation.valid).toBe(false);
    expect(result.unresolvedClashes.length).toBeGreaterThan(0);
    expect(result.compactionReport.totalIssues).toBeGreaterThan(0);
    expect(() => assertHealthyScheduleResult(result)).toThrow(
      /unhealthy schedule result/i
    );
  });

  test("quota exactness holds for main subjects in a healthy scenario", () => {
    const result = runSchedulerScenario(
      schedulerScenarioFixtures.healthySharedTeacherLoad
    );

    expect(assertHealthyScheduleResult(result)).toBe(true);
    const state = result.state;
    Object.entries(schedulerScenarioFixtures.healthySharedTeacherLoad.mainShortsByClass)
      .forEach(([key, shorts]) => {
        shorts.forEach((short) => {
          expect(
            countShort(result.schedules[key], short)
          ).toBe(state.weeklyQuotaByClass[key][short]);
        });
      });
  });

  test("teacherless fillers stay in the allowed late-day slots for the fixed-slot scenario", () => {
    const result = runSchedulerScenario(
      schedulerScenarioFixtures.healthyTeacherlessFillers
    );

    expect(assertHealthyScheduleResult(result)).toBe(true);
    const allowedStart = 2;
    result.schedules.A.forEach((row) => {
      row.forEach((short, col) => {
        if (short === "PT" || short === "LIB") {
          expect(col).toBeGreaterThanOrEqual(allowedStart);
        }
      });
    });
  });

  test("same seed produces the same schedule in the shared-teacher scenario", () => {
    const first = runSchedulerScenario(
      schedulerScenarioFixtures.healthySharedTeacherLoad
    );
    const second = runSchedulerScenario(
      schedulerScenarioFixtures.healthySharedTeacherLoad
    );

    expect(first.seed).toBe(second.seed);
    expect(first.schedules).toEqual(second.schedules);
  });

  test("stale unresolved clashes are cleared before the next scheduler run", () => {
    const bad = runSchedulerScenario(
      schedulerScenarioFixtures.impossibleFixedTeacherConflict
    );
    expect(bad.unresolvedClashes.length).toBeGreaterThan(0);

    const good = runSchedulerScenario(
      schedulerScenarioFixtures.healthySharedTeacherLoad
    );
    expect(good.unresolvedClashes).toEqual([]);
    expect(assertHealthyScheduleResult(good)).toBe(true);
  });

  test("real 16-class snapshot normalizes to the expected scheduler shape", () => {
    const fixture = schedulerScenarioFixtures.realSixteenClassAktuSnapshot;

    expect(fixture.enabledKeys).toHaveLength(16);
    expect(fixture.labCapacity).toBe(5);
    expect(fixture.days).toBe(5);
    expect(fixture.periodTimings.filter((entry) => entry.type === "class")).toHaveLength(8);
    expect(fixture.pairsByClass.A.length).toBeGreaterThan(0);
    expect(fixture.pairsByClass.P.length).toBeGreaterThan(0);
  });

  test("real 16-class snapshot finds at least one healthy schedule within strict retry seed space", () => {
    const fixture = schedulerScenarioFixtures.realSixteenClassAktuSnapshot;
    const seedSeries = buildSeedSeries(864417187, 16);
    const healthyRun = findFirstHealthyScenarioRun(fixture, seedSeries);

    expect(healthyRun).not.toBeNull();
    expect(assertHealthyScheduleResult(healthyRun.result)).toBe(true);
  });

  test("real 16-class snapshot with low lab capacity surfaces room pressure instead of silently passing", () => {
    const baseFixture = schedulerScenarioFixtures.realSixteenClassAktuSnapshot;
    const seedSeries = buildSeedSeries(864417187, 16);
    const lowLabFailures = seedSeries
      .map((seed) =>
        runSchedulerScenario({
          ...baseFixture,
          labCapacity: 3,
          seed,
        })
      )
      .filter((result) => !result.validation?.healthy);

    expect(lowLabFailures.length).toBeGreaterThan(0);
    expect(
      lowLabFailures.some((result) =>
        (result.validation?.violations || []).some((line) =>
          /lab room\s+\d+.*double[- ]?book/i.test(line)
        )
      )
    ).toBe(true);
  });
});

describe("Schedule acceptance helper", () => {
  test("fails when unresolved clashes remain", () => {
    expect(() =>
      assertHealthyScheduleResult({
        validation: { valid: false, violations: ["Teacher clash"] },
        unresolvedClashes: [{ teacher: "T1" }],
        compactionReport: { totalIssues: 0 },
      })
    ).toThrow(/unresolved clashes/i);
  });

  test("fails when compaction issues remain", () => {
    expect(() =>
      assertHealthyScheduleResult({
        validation: { valid: true, violations: [] },
        unresolvedClashes: [],
        compactionReport: { totalIssues: 2 },
      })
    ).toThrow(/compaction issues/i);
  });
});
