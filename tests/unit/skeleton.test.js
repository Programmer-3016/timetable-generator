/**
 * @file tests/unit/skeleton.test.js
 * @description Unit tests for ui/skeleton.js: skeleton HTML generation,
 *   show/hide helpers, and the generateTimetable wrapper.
 */

const fs = require("fs");
const path = require("path");

/* ═══════════════════════════════════════════════════════
   Section: EXPOSE PRIVATE FUNCTIONS
═══════════════════════════════════════════════════════ */

// skeleton.js is an IIFE — its internal functions are not globally accessible.
// We strip the IIFE wrapper and auto-init, then eval the body so that
// buildSkeletonHTML, showSkeletons, clearSkeletons, installSkeleton become globals.
(function exposeSkeletonInternals() {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/js/ui/skeleton.js"), "utf-8"
  );
  let code = src
    .replace(/^[\s\S]*?\(function\s*\(\)\s*\{\s*"use strict";/, "")
    .replace(/\n\s*\/\/\s*generate\.js is guaranteed[\s\S]*$/, "");
  const indirectEval = eval;
  indirectEval(code);
})();

/* ═══════════════════════════════════════════════════════
   Section: TEST HELPERS
═══════════════════════════════════════════════════════ */

/**
 * Build the DOM elements that showSkeletons() expects.
 * @param {string[]} keys  - CLASS_KEYS entries (e.g. ["A","B"]).
 * @param {number}   slots - Number of period columns.
 * @param {number}   days  - Number of day rows.
 */
function buildSkeletonDOM(keys, slots, days) {
  keys = keys || [];
  slots = slots || 4;
  days = days || 3;

  global.CLASS_KEYS = keys;

  var classCountInput = document.createElement("input");
  classCountInput.id = "classCount";
  classCountInput.value = String(keys.length);
  document.body.appendChild(classCountInput);

  var slotsInput = document.createElement("input");
  slotsInput.id = "slots";
  slotsInput.value = String(slots);
  document.body.appendChild(slotsInput);

  var daysInput = document.createElement("input");
  daysInput.id = "days";
  daysInput.value = String(days);
  document.body.appendChild(daysInput);

  keys.forEach(function (k) {
    var block = document.createElement("div");
    block.id = "class" + k + "Block";
    document.body.appendChild(block);

    var tDiv = document.createElement("div");
    tDiv.id = "timetable" + k;
    document.body.appendChild(tDiv);
  });
}

/* ═══════════════════════════════════════════════════════
   Section: buildSkeletonHTML
═══════════════════════════════════════════════════════ */

describe("buildSkeletonHTML", () => {
  /* ───────────────────────────────────────────────────
     Subsection: HTML STRUCTURE
  ─────────────────────────────────────────────────── */

  test("generates HTML with correct structural elements", () => {
    var html = buildSkeletonHTML(3, 2);
    var div = document.createElement("div");
    div.innerHTML = html;

    expect(div.querySelector(".skeleton-wrap")).not.toBeNull();
    expect(div.querySelector(".skeleton-table")).not.toBeNull();
    expect(div.querySelector(".skeleton-title-bar")).not.toBeNull();
    expect(div.querySelector(".skeleton-generating-label")).not.toBeNull();
    expect(div.querySelector("thead")).not.toBeNull();
    expect(div.querySelector("tbody")).not.toBeNull();
  });

  /* ───────────────────────────────────────────────────
     Subsection: ROW AND CELL COUNTS
  ─────────────────────────────────────────────────── */

  test("creates correct number of skeleton rows and cells", () => {
    var html = buildSkeletonHTML(4, 3);
    var div = document.createElement("div");
    div.innerHTML = html;

    // thead: 1 header row with (1 day-label + cols) th elements
    expect(div.querySelectorAll("thead th").length).toBe(5);

    // tbody: one row per day, each with (1 day-label + cols) td elements
    var rows = div.querySelectorAll("tbody tr");
    expect(rows.length).toBe(3);
    rows.forEach(function (row) {
      expect(row.querySelectorAll("td").length).toBe(5);
    });
  });

  test("skeleton-bar spans appear inside header and body cells", () => {
    var html = buildSkeletonHTML(2, 1);
    var div = document.createElement("div");
    div.innerHTML = html;

    div.querySelectorAll("thead th").forEach(function (th) {
      expect(th.querySelector(".skeleton-bar")).not.toBeNull();
    });
    div.querySelectorAll("tbody td").forEach(function (td) {
      expect(td.querySelector(".skeleton-bar")).not.toBeNull();
    });
  });

  /* ───────────────────────────────────────────────────
     Subsection: EDGE CASES
  ─────────────────────────────────────────────────── */

  test("zero periods produces header with only the day-label column", () => {
    var html = buildSkeletonHTML(0, 3);
    var div = document.createElement("div");
    div.innerHTML = html;

    expect(div.querySelectorAll("thead th").length).toBe(1);

    var rows = div.querySelectorAll("tbody tr");
    expect(rows.length).toBe(3);
    rows.forEach(function (row) {
      expect(row.querySelectorAll("td").length).toBe(1);
    });
  });

  test("zero rows produces header but empty tbody", () => {
    var html = buildSkeletonHTML(4, 0);
    var div = document.createElement("div");
    div.innerHTML = html;

    expect(div.querySelectorAll("thead th").length).toBe(5);
    expect(div.querySelectorAll("tbody tr").length).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: clearSkeletons
═══════════════════════════════════════════════════════ */

describe("clearSkeletons", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  /* ───────────────────────────────────────────────────
     Subsection: FADE-OUT AND CLASS REMOVAL
  ─────────────────────────────────────────────────── */

  test("adds fade-out class and removes active class after timeout", () => {
    var el = document.createElement("div");
    el.id = "skel1";
    el.classList.add("tt-skeleton-active");
    el.innerHTML = "<div class='skeleton-wrap'></div>";
    document.body.appendChild(el);

    clearSkeletons(["skel1"]);

    expect(el.querySelector(".skeleton-wrap").classList.contains("skeleton-fade-out")).toBe(true);
    expect(el.classList.contains("tt-skeleton-active")).toBe(true);

    jest.advanceTimersByTime(450);
    expect(el.classList.contains("tt-skeleton-active")).toBe(false);
  });

  test("removes class immediately when no skeleton-wrap is present", () => {
    var el = document.createElement("div");
    el.id = "noWrap";
    el.classList.add("tt-skeleton-active");
    document.body.appendChild(el);

    clearSkeletons(["noWrap"]);
    expect(el.classList.contains("tt-skeleton-active")).toBe(false);
  });

  /* ───────────────────────────────────────────────────
     Subsection: MISSING CONTAINERS
  ─────────────────────────────────────────────────── */

  test("handles missing DOM elements gracefully", () => {
    expect(function () { clearSkeletons(["nonexistent"]); }).not.toThrow();
  });

  test("handles null or undefined ids gracefully", () => {
    expect(function () { clearSkeletons(null); }).not.toThrow();
    expect(function () { clearSkeletons(undefined); }).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════
   Section: installSkeleton
═══════════════════════════════════════════════════════ */

describe("installSkeleton", () => {
  var savedGenerateTimetable;

  beforeEach(() => {
    document.body.innerHTML = "";
    savedGenerateTimetable = window.generateTimetable;
  });

  afterEach(() => {
    window.generateTimetable = savedGenerateTimetable;
    document.body.innerHTML = "";
  });

  /* ───────────────────────────────────────────────────
     Subsection: WRAPPING
  ─────────────────────────────────────────────────── */

  test("wraps window.generateTimetable with skeleton shim", () => {
    var mock = jest.fn();
    window.generateTimetable = mock;
    installSkeleton();

    expect(window.generateTimetable).not.toBe(mock);
    expect(window.generateTimetable.name).toBe("generateTimetableWithSkeleton");
  });

  test("inserts skeleton into correct timetable container", () => {
    jest.useFakeTimers();
    var mock = jest.fn();
    window.generateTimetable = mock;
    buildSkeletonDOM(["A"], 4, 3);

    installSkeleton();
    window.generateTimetable();

    var tDiv = document.getElementById("timetableA");
    expect(tDiv.querySelector(".skeleton-wrap")).not.toBeNull();
    expect(tDiv.classList.contains("tt-skeleton-active")).toBe(true);

    jest.useRealTimers();
  });

  test("does nothing when generateTimetable is not defined", () => {
    window.generateTimetable = undefined;
    expect(function () { installSkeleton(); }).not.toThrow();
  });

  /* ───────────────────────────────────────────────────
     Subsection: MISSING CONTAINERS
  ─────────────────────────────────────────────────── */

  test("skeleton shim does not throw when DOM containers are missing", () => {
    jest.useFakeTimers();
    var mock = jest.fn();
    window.generateTimetable = mock;
    global.CLASS_KEYS = ["Z"];

    var classCountInput = document.createElement("input");
    classCountInput.id = "classCount";
    classCountInput.value = "1";
    document.body.appendChild(classCountInput);

    installSkeleton();
    expect(function () { window.generateTimetable(); }).not.toThrow();

    jest.runAllTimers();
    expect(mock).toHaveBeenCalled();

    jest.useRealTimers();
  });
});

/* ═══════════════════════════════════════════════════════
   Section: generateTimetableWithSkeleton
═══════════════════════════════════════════════════════ */

describe("generateTimetableWithSkeleton", () => {
  var savedGenerateTimetable;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "";
    savedGenerateTimetable = window.generateTimetable;
    buildSkeletonDOM([], 4, 3);
  });

  afterEach(() => {
    window.generateTimetable = savedGenerateTimetable;
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  /* ───────────────────────────────────────────────────
     Subsection: DEFERRED ORIGINAL CALL
  ─────────────────────────────────────────────────── */

  test("calls the real generateTimetable after showing skeletons", () => {
    var mock = jest.fn();
    window.generateTimetable = mock;
    installSkeleton();

    window.generateTimetable();
    expect(mock).not.toHaveBeenCalled();

    jest.runAllTimers();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test("passes options through to the original generateTimetable", () => {
    var mock = jest.fn();
    window.generateTimetable = mock;
    installSkeleton();

    window.generateTimetable({ custom: 42 });
    jest.runAllTimers();

    expect(mock).toHaveBeenCalledWith({ custom: 42 });
  });

  /* ───────────────────────────────────────────────────
     Subsection: __runImmediate BYPASS
  ─────────────────────────────────────────────────── */

  test("__runImmediate flag bypasses skeleton shim entirely", () => {
    var mock = jest.fn();
    window.generateTimetable = mock;
    installSkeleton();

    window.generateTimetable({ __runImmediate: true });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  /* ───────────────────────────────────────────────────
     Subsection: CLEANUP
  ─────────────────────────────────────────────────── */

  test("clears skeletons after the original function completes", () => {
    document.body.innerHTML = "";
    buildSkeletonDOM(["B"], 2, 2);

    var mock = jest.fn();
    window.generateTimetable = mock;
    installSkeleton();

    window.generateTimetable();

    var tDiv = document.getElementById("timetableB");
    expect(tDiv.classList.contains("tt-skeleton-active")).toBe(true);

    jest.runAllTimers();
    expect(tDiv.classList.contains("tt-skeleton-active")).toBe(false);
  });
});
