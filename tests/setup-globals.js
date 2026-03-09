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
global.reportData = [];

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

// Load validation and scoring (extracted from engine.js)
loadScript("src/js/core/scheduler/validation.js");
loadScript("src/js/core/scheduler/scoring.js");

// Load parser
loadScript("src/js/core/parser.js");
