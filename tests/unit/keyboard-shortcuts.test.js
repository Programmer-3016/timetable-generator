/**
 * @file tests/unit/keyboard-shortcuts.test.js
 * @description Unit tests for ui/keyboard-shortcuts.js: global keyboard shortcuts
 *   including Ctrl+G generate, Ctrl+Z undo/redo swap, arrow pager navigation,
 *   and Escape overlay dismissal.
 */

/* ═══════════════════════════════════════════════════════
   Section: DOM SETUP & TEARDOWN
═══════════════════════════════════════════════════════ */

/**
 * Build the DOM elements that keyboard-shortcuts.js queries:
 * tab buttons, pager buttons, and overlay elements.
 */
function buildShortcutDOM() {
  // Tab buttons
  ["inputs", "timetables"].forEach(function (name) {
    var btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.setAttribute("data-tab", name);
    document.body.appendChild(btn);
  });

  // Pager buttons for inputs tab
  var prevBtn = document.createElement("button");
  prevBtn.id = "inputsPrev";
  document.body.appendChild(prevBtn);

  var nextBtn = document.createElement("button");
  nextBtn.id = "inputsNext";
  document.body.appendChild(nextBtn);

  // Quick fill overlay
  var qfOverlay = document.createElement("div");
  qfOverlay.id = "quickFillOverlay";
  qfOverlay.style.display = "none";
  document.body.appendChild(qfOverlay);

  // Teacher name review overlay
  var tnrOverlay = document.createElement("div");
  tnrOverlay.id = "teacherNameReviewOverlay";
  tnrOverlay.style.display = "none";
  document.body.appendChild(tnrOverlay);
}

/** Helper to dispatch a keydown event on document */
function fireKey(key, opts) {
  var options = Object.assign({ key: key, bubbles: true }, opts || {});
  var event = new KeyboardEvent("keydown", options);
  document.dispatchEvent(event);
}

/** Activate a tab by adding the active class to its button */
function activateTab(name) {
  var btn = document.querySelector('.tab-btn[data-tab="' + name + '"]');
  if (btn) btn.classList.add("tab-btn--active");
}

/** Deactivate all tab buttons */
function deactivateAllTabs() {
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.classList.remove("tab-btn--active");
  });
}

beforeEach(function () {
  document.body.innerHTML = "";
  buildShortcutDOM();

  // Reset global function mocks
  global.validateAndGenerate = jest.fn();
  global.generateTimetable = jest.fn();
  global.undoTimetableSwap = jest.fn();
  global.redoTimetableSwap = jest.fn();
});

afterEach(function () {
  delete global.validateAndGenerate;
  delete global.generateTimetable;
  delete global.undoTimetableSwap;
  delete global.redoTimetableSwap;
});

/* ═══════════════════════════════════════════════════════
   Section: Ctrl+G — GENERATE
═══════════════════════════════════════════════════════ */

describe("Ctrl+G → Generate", function () {
  test("calls validateAndGenerate when available", function () {
    fireKey("g", { ctrlKey: true });
    expect(global.validateAndGenerate).toHaveBeenCalledTimes(1);
    expect(global.generateTimetable).not.toHaveBeenCalled();
  });

  test("falls back to generateTimetable when validateAndGenerate is absent", function () {
    delete global.validateAndGenerate;
    fireKey("g", { ctrlKey: true });
    expect(global.generateTimetable).toHaveBeenCalledTimes(1);
  });

  test("works with metaKey (Cmd+G)", function () {
    fireKey("g", { metaKey: true });
    expect(global.validateAndGenerate).toHaveBeenCalledTimes(1);
  });

  test("works with uppercase G", function () {
    fireKey("G", { ctrlKey: true });
    expect(global.validateAndGenerate).toHaveBeenCalledTimes(1);
  });

  test("does not trigger without modifier", function () {
    fireKey("g");
    expect(global.validateAndGenerate).not.toHaveBeenCalled();
    expect(global.generateTimetable).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════
   Section: Ctrl+Z — UNDO SWAP
═══════════════════════════════════════════════════════ */

describe("Ctrl+Z → Undo swap", function () {
  test("calls undoTimetableSwap when timetables tab is active", function () {
    activateTab("timetables");
    fireKey("z", { ctrlKey: true });
    expect(global.undoTimetableSwap).toHaveBeenCalledTimes(1);
  });

  test("does not call undoTimetableSwap when timetables tab is inactive", function () {
    deactivateAllTabs();
    activateTab("inputs");
    fireKey("z", { ctrlKey: true });
    expect(global.undoTimetableSwap).not.toHaveBeenCalled();
  });

  test("works with metaKey (Cmd+Z)", function () {
    activateTab("timetables");
    fireKey("z", { metaKey: true });
    expect(global.undoTimetableSwap).toHaveBeenCalledTimes(1);
  });

  test("does not fire when shiftKey is also held", function () {
    activateTab("timetables");
    fireKey("z", { ctrlKey: true, shiftKey: true });
    expect(global.undoTimetableSwap).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════
   Section: Ctrl+Shift+Z — REDO SWAP
═══════════════════════════════════════════════════════ */

describe("Ctrl+Shift+Z → Redo swap", function () {
  test("calls redoTimetableSwap when timetables tab is active", function () {
    activateTab("timetables");
    fireKey("z", { ctrlKey: true, shiftKey: true });
    expect(global.redoTimetableSwap).toHaveBeenCalledTimes(1);
  });

  test("does not call redoTimetableSwap when timetables tab is inactive", function () {
    deactivateAllTabs();
    fireKey("z", { ctrlKey: true, shiftKey: true });
    expect(global.redoTimetableSwap).not.toHaveBeenCalled();
  });

  test("works with metaKey (Cmd+Shift+Z)", function () {
    activateTab("timetables");
    fireKey("z", { metaKey: true, shiftKey: true });
    expect(global.redoTimetableSwap).toHaveBeenCalledTimes(1);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: ARROW KEYS — PAGER NAVIGATION
═══════════════════════════════════════════════════════ */

describe("Arrow keys → Pager navigation", function () {
  // ─────────────────────────────────────────────────────
  //   ArrowLeft / ArrowRight on inputs tab
  // ─────────────────────────────────────────────────────

  test("ArrowLeft clicks inputsPrev when inputs tab is active", function () {
    activateTab("inputs");
    var prevBtn = document.getElementById("inputsPrev");
    var spy = jest.spyOn(prevBtn, "click");
    fireKey("ArrowLeft");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("ArrowRight clicks inputsNext when inputs tab is active", function () {
    activateTab("inputs");
    var nextBtn = document.getElementById("inputsNext");
    var spy = jest.spyOn(nextBtn, "click");
    fireKey("ArrowRight");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("does not click pager when inputs tab is inactive", function () {
    deactivateAllTabs();
    activateTab("timetables");
    var prevSpy = jest.spyOn(document.getElementById("inputsPrev"), "click");
    var nextSpy = jest.spyOn(document.getElementById("inputsNext"), "click");
    fireKey("ArrowLeft");
    fireKey("ArrowRight");
    expect(prevSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  test("does not click pager when button is disabled", function () {
    activateTab("inputs");
    var prevBtn = document.getElementById("inputsPrev");
    prevBtn.disabled = true;
    var spy = jest.spyOn(prevBtn, "click");
    fireKey("ArrowLeft");
    expect(spy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────
  //   Suppressed when focus is in a text field
  // ─────────────────────────────────────────────────────

  test("does not click pager when focus is in an INPUT", function () {
    activateTab("inputs");
    var input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    var spy = jest.spyOn(document.getElementById("inputsPrev"), "click");
    fireKey("ArrowLeft");
    expect(spy).not.toHaveBeenCalled();
  });

  test("does not click pager when focus is in a TEXTAREA", function () {
    activateTab("inputs");
    var textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    var spy = jest.spyOn(document.getElementById("inputsNext"), "click");
    fireKey("ArrowRight");
    expect(spy).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════
   Section: ESCAPE — OVERLAY DISMISSAL
═══════════════════════════════════════════════════════ */

describe("Escape → Close overlay", function () {
  test("closes quickFillOverlay when visible", function () {
    var overlay = document.getElementById("quickFillOverlay");
    overlay.style.display = "block";
    fireKey("Escape");
    expect(overlay.style.display).toBe("none");
  });

  test("closes teacherNameReviewOverlay when visible", function () {
    var overlay = document.getElementById("teacherNameReviewOverlay");
    overlay.style.display = "flex";
    fireKey("Escape");
    expect(overlay.style.display).toBe("none");
  });

  test("closes quickFillOverlay first if both are visible", function () {
    var qf = document.getElementById("quickFillOverlay");
    var tnr = document.getElementById("teacherNameReviewOverlay");
    qf.style.display = "block";
    tnr.style.display = "flex";
    fireKey("Escape");
    expect(qf.style.display).toBe("none");
    // Teacher overlay remains open (priority order)
    expect(tnr.style.display).toBe("flex");
  });

  test("does nothing when overlays are hidden", function () {
    var qf = document.getElementById("quickFillOverlay");
    var tnr = document.getElementById("teacherNameReviewOverlay");
    qf.style.display = "none";
    tnr.style.display = "none";
    fireKey("Escape");
    expect(qf.style.display).toBe("none");
    expect(tnr.style.display).toBe("none");
  });
});
