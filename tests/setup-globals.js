/**
 * @file tests/setup-globals.js
 * @description Load source files into the global scope for Jest testing.
 * Since the project uses global functions (no ES modules), we need to
 * evaluate source files so their function declarations become globals.
 */

const fs = require("fs");
const path = require("path");

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
loadScript("src/js/core/scheduler/teacher-helpers.js");
loadScript("src/js/core/scheduler/counts.js");
loadScript("src/js/core/scheduler/caps.js");
loadScript("src/js/core/scheduler/selection.js");
loadScript("src/js/core/scheduler/validation.js");
loadScript("src/js/core/scheduler/scoring.js");
loadScript("src/js/core/scheduler/assignment.js");
loadScript("src/js/core/scheduler/passes.js");
loadScript("src/js/core/scheduler/passes-advanced.js");
loadScript("src/js/core/scheduler/state.js");
loadScript("src/js/core/scheduler/bootstrap.js");
loadScript("src/js/core/scheduler/publish.js");
loadScript("src/js/core/scheduler/render.js");
loadScript("src/js/core/scheduler/engine.js");
loadScript("src/js/core/generate.js");
