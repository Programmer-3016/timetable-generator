/* exported renderMultiClasses */

/**
 * @module core/scheduler.js
 * @description Scheduler orchestrator bridge preserving render API.
 *
 * Note:
 * - Heavy scheduling engine logic now lives in `core/scheduler/engine.js`.
 * - This bridge keeps existing callers unchanged (`renderMultiClasses`).
 */

// Section: SCHEDULER BRIDGE

/** Delegates multi-class rendering to the scheduler engine. */
function renderMultiClasses(params) {
  return schedulerRenderMultiClassesEngine(params);
}

// Preserve existing global API contract.
window.renderMultiClasses = renderMultiClasses;
