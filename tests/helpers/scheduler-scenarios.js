/**
 * @file tests/helpers/scheduler-scenarios.js
 * @description Shared harness utilities for scheduler regression scenarios.
 */

/**
 * Deep-clones serializable values used by scheduler fixtures/results.
 * @param {*} value - Value to clone.
 * @returns {*} Cloned value.
 */
function cloneSerializable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Converts scenario map values to per-class Sets keyed by enabled class keys.
 * @param {Object<string, Array<string>|Set<string>>} value - Raw map from fixture.
 * @param {string[]} enabledKeys - Class keys in the scenario.
 * @returns {Object<string, Set<string>>} Normalized Set map.
 */
function normalizeSetMap(value, enabledKeys) {
  const out = {};
  enabledKeys.forEach((key) => {
    const raw = value && value[key];
    if (raw instanceof Set) {
      out[key] = new Set(Array.from(raw));
      return;
    }
    out[key] = new Set(Array.isArray(raw) ? raw.filter(Boolean) : []);
  });
  return out;
}

/**
 * Resets globals that the scheduler mutates during a test run.
 * @returns {void}
 */
function resetSchedulerRuntime() {
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
}

/**
 * Stubs DOM methods that the engine expects during tests.
 * @returns {void}
 */
function stubScenarioDOM() {
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

/**
 * Normalizes a raw regression fixture into scheduler engine input.
 * @param {Object} fixture - Raw regression fixture.
 * @returns {Object} Normalized scheduler input.
 */
function normalizeScenarioFixture(fixture) {
  const enabledKeys = Array.isArray(fixture.enabledKeys) ?
    fixture.enabledKeys.slice() :
    [];
  return {
    periodTimings: cloneSerializable(fixture.periodTimings || []),
    days: fixture.days,
    enabledKeys,
    pairsByClass: cloneSerializable(fixture.pairsByClass || {}),
    mainShortsByClass: normalizeSetMap(fixture.mainShortsByClass || {}, enabledKeys),
    fillerShortsByClass: normalizeSetMap(
      fixture.fillerShortsByClass || {},
      enabledKeys
    ),
    fillerCreditsByClass: cloneSerializable(fixture.fillerCreditsByClass || {}),
    fixedSlotsByClass: cloneSerializable(fixture.fixedSlotsByClass || {}),
    labCapacity: Number.isFinite(fixture.labCapacity) ? Number(fixture.labCapacity) : undefined,
    seed: fixture.seed,
  };
}

/**
 * Runs the full scheduler engine for one regression scenario and returns its diagnostics.
 * @param {Object} fixture - Raw regression fixture.
 * @returns {{ schedules: Object, validation: Object|null, unresolvedClashes: Array<Object>, compactionReport: Object|null, seed: number|undefined, state: Object|null }}
 */
function runSchedulerScenario(fixture) {
  const scenario = normalizeScenarioFixture(fixture);

  resetSchedulerRuntime();
  stubScenarioDOM();
  global.periodTimings = scenario.periodTimings;

  schedulerRenderMultiClassesEngine({
    pairsByClass: scenario.pairsByClass,
    days: scenario.days,
    defaultDuration: 50,
    enabledKeys: scenario.enabledKeys,
    fillerShortsByClass: scenario.fillerShortsByClass,
    fillerCreditsByClass: scenario.fillerCreditsByClass,
    mainShortsByClass: scenario.mainShortsByClass,
    fixedSlotsByClass: scenario.fixedSlotsByClass,
    labCapacity: scenario.labCapacity,
    seed: scenario.seed,
  });

  return {
    schedules: cloneSerializable(gSchedules),
    validation: cloneSerializable(window.__ttLastValidation || null),
    unresolvedClashes: cloneSerializable(window.__ttUnresolvedClashes || []),
    compactionReport: cloneSerializable(window.__ttPostLunchCompactReport || null),
    seed: window.__ttLastSeed,
    state: cloneSerializable(window.__ttLastScheduleState || null),
  };
}

/**
 * Throws when a schedule result is not healthy enough to publish.
 * @param {Object} result - Result object from runSchedulerScenario().
 * @returns {true} True when the result is healthy.
 */
function assertHealthyScheduleResult(result) {
  const failures = [];
  const validation = result && result.validation;
  const unresolvedClashes =
    result && Array.isArray(result.unresolvedClashes) ?
    result.unresolvedClashes :
    [];
  const compactionIssues =
    result &&
    result.compactionReport &&
    Number.isFinite(result.compactionReport.totalIssues) ?
    result.compactionReport.totalIssues :
    0;

  if (!validation) {
    failures.push("missing validation result");
  } else if (!validation.valid) {
    const joined = Array.isArray(validation.violations) && validation.violations.length ?
      validation.violations.join(" | ") :
      "unknown validation failure";
    failures.push(`validation invalid: ${joined}`);
  }
  if (unresolvedClashes.length) {
    failures.push(`unresolved clashes: ${unresolvedClashes.length}`);
  }
  if (compactionIssues > 0) {
    failures.push(`compaction issues: ${compactionIssues}`);
  }

  if (failures.length) {
    throw new Error(`Unhealthy schedule result: ${failures.join("; ")}`);
  }
  return true;
}

module.exports = {
  normalizeScenarioFixture,
  runSchedulerScenario,
  assertHealthyScheduleResult,
};
