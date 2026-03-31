/**
 * @file tests/setup-globals.js
 * @description Load source files into the global scope for Jest testing.
 * Since the project uses global functions (no ES modules), we need to
 * evaluate source files so their function declarations become globals.
 */

const fs = require("fs");
const path = require("path");

/* ═══════════════════════════════════════════════════════
   Section: BROWSER GLOBAL STUBS
═══════════════════════════════════════════════════════ */

// Stub browser-only globals that source files may reference
global.window = global;
global.showToast = function () {};
global.generated = false;
global.periodTimings = [];
global.gSchedules = {};
global.gEnabledKeys = [];
global.gClassLabels = {};
global.gSubjectByShort = {};
global.gWeeklyQuotaByClass = {};
global.gCanonFoldMap = {};
global.CLASS_KEYS = [];
global.gFillerLabelsByClass = {};
global.aggregateStats = {};
global.daysOfWeek = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
global.reportData = [];
global.gTeacherForShort = {};
global.gTeacherDisplayByCanon = {};
global.subjectTeacherPairsByClass = {};
global.gLabNumberAssigned = {};
global.renderLabUsage = function () {};

/* ═══════════════════════════════════════════════════════
   Section: HELPER STUBS
═══════════════════════════════════════════════════════ */

// Stub helpers.js functions that validation/scoring depend on
global.canonicalTeacherName = function (name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
};

global.normalizeTeacherName = function (name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
};

global.resolveTeacherAliasCanonical = function (name) {
  return name;
};

/* ═══════════════════════════════════════════════════════
   Section: SCRIPT LOADING
═══════════════════════════════════════════════════════ */

// Load source files by eval'ing them so function declarations become global
function loadScript(relPath) {
  const fullPath = path.resolve(__dirname, "..", relPath);
  const code = fs.readFileSync(fullPath, "utf-8");
  // Use indirect eval to evaluate in global scope
  const indirectEval = eval;
  indirectEval(code);
}

// Load helpers first (provides utility functions used by other modules)
loadScript("src/js/core/helpers.js");

// Update CLASS_KEYS with real generated values now that helpers.js is loaded
if (typeof generateClassKeys === "function") {
  global.CLASS_KEYS = generateClassKeys(50);
}

// Load parser, input validator, and scheduler modules
loadScript("src/js/core/parser.js");
loadScript("src/js/core/input-validator.js");
loadScript("src/js/core/generation-layout.js");
loadScript("src/js/core/runtime-state.js");
loadScript("src/js/core/scheduler/teacher-helpers.js");
loadScript("src/js/core/scheduler/counts.js");
loadScript("src/js/core/scheduler/caps.js");
loadScript("src/js/core/scheduler/selection.js");
loadScript("src/js/core/scheduler/validation.js");
loadScript("src/js/core/scheduler/scoring.js");
loadScript("src/js/core/scheduler/assignment.js");
loadScript("src/js/core/scheduler/passes.js");
loadScript("src/js/core/scheduler/passes-advanced.js");
loadScript("src/js/core/scheduler/engine-scheduling.js");
loadScript("src/js/core/scheduler/engine-compaction.js");
loadScript("src/js/core/scheduler/state.js");
loadScript("src/js/core/scheduler/bootstrap.js");
loadScript("src/js/core/scheduler/publish.js");
loadScript("src/js/core/scheduler/render.js");
loadScript("src/js/core/scheduler/engine.js");
loadScript("src/js/core/generate.js");

/* ═══════════════════════════════════════════════════════
   Section: UI MODULE LOADING
═══════════════════════════════════════════════════════ */

// Stub DOM elements that UI modules expect during initialization
if (!global.localStorage || typeof global.localStorage.getItem !== "function") {
  global.localStorage = {
    _store: {},
    getItem(key) { return this._store[key] || null; },
    setItem(key, val) { this._store[key] = String(val); },
    removeItem(key) { delete this._store[key]; },
    clear() { this._store = {}; },
  };
}

// Load UI modules (order matters — some depend on others)
// Wrapped in try-catch because some modules run code on load (IIFEs,
// event listeners) that may fail if expected DOM elements are missing.
function safeLoadScript(relPath) {
  try {
    loadScript(relPath);
  } catch (_e) {
    // Module skipped — DOM elements it expects are not present yet
  }
}

safeLoadScript("src/js/ui/tabs.js");
safeLoadScript("src/js/ui/sidebar-toolbar.js");
safeLoadScript("src/js/ui/keyboard-shortcuts.js");
safeLoadScript("src/js/ui/skeleton.js");
safeLoadScript("src/js/ui/dragdrop.js");
safeLoadScript("src/js/ui/teacher-cell-utils.js");
safeLoadScript("src/js/ui/faculty-panel.js");
safeLoadScript("src/js/versioning/version-store.js");
safeLoadScript("src/js/versioning/version-ui.js");
