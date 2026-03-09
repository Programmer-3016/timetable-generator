/**
 * @module ui/keyboard-shortcuts.js
 * @description Global keyboard shortcuts. Purely additive — no existing handlers modified.
 */

// Section: GLOBAL KEYBOARD SHORTCUTS

document.addEventListener("keydown", function (e) {
  // Ctrl+G or Cmd+G → Generate
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
    e.preventDefault();
    if (typeof validateAndGenerate === "function") {
      validateAndGenerate();
    } else if (typeof generateTimetable === "function") {
      generateTimetable();
    }
    return;
  }

  // Ctrl+Z → Undo swap (only if timetables tab is active)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
    const timetablesTab = document.querySelector('.tab-btn[data-tab="timetables"]');
    const isActive = timetablesTab && timetablesTab.classList.contains("tab-btn--active");
    if (isActive && typeof undoTimetableSwap === "function") {
      e.preventDefault();
      undoTimetableSwap();
      return;
    }
    // Don't preventDefault if not on timetables tab — let normal undo work in textareas
  }

  // Ctrl+Shift+Z → Redo swap
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
    const timetablesTab = document.querySelector('.tab-btn[data-tab="timetables"]');
    const isActive = timetablesTab && timetablesTab.classList.contains("tab-btn--active");
    if (isActive && typeof redoTimetableSwap === "function") {
      e.preventDefault();
      redoTimetableSwap();
      return;
    }
  }

  // Left/Right arrows → Pager navigation (only when Inputs tab is active and not typing in a field)
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const active = document.activeElement;
    const isTyping = active && (
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT" ||
      active.isContentEditable
    );
    if (!isTyping) {
      const inputsTab = document.querySelector('.tab-btn[data-tab="inputs"]');
      const isInputsActive = inputsTab && inputsTab.classList.contains("tab-btn--active");
      if (isInputsActive) {
        const btn = document.getElementById(
          e.key === "ArrowLeft" ? "inputsPrev" : "inputsNext"
        );
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
          return;
        }
      }
    }
  }

  // Escape → Close overlay/modal
  if (e.key === "Escape") {

    // Close quick fill modal if open
    const qfOverlay = document.getElementById("quickFillOverlay");
    if (qfOverlay && qfOverlay.style.display !== "none" && qfOverlay.style.display !== "") {
      qfOverlay.style.display = "none";
      return;
    }

    // Close teacher name review modal if open
    const tnrOverlay = document.getElementById("teacherNameReviewOverlay");
    if (tnrOverlay && tnrOverlay.style.display !== "none" && tnrOverlay.style.display !== "") {
      tnrOverlay.style.display = "none";
      return;
    }
  }
});
