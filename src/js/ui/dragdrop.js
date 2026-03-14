/* exported enableDragAndDrop */

/**
 * @module ui/dragdrop.js
 * @description Drag-and-drop swap with clash-safe validation.
 */

// Section: DRAG-AND-DROP CELL SWAP

const MAX_SWAP_HISTORY = 120;
let gSwapUndoStack = [];
let gSwapRedoStack = [];
let gPostSwapRefreshTimer = null;

// Section: VIEW REFRESH

/**
 * Debounced refresh of report, faculty, and lab views after a swap.
 */
function refreshViewsAfterScheduleShift() {
  if (gPostSwapRefreshTimer) clearTimeout(gPostSwapRefreshTimer);
  gPostSwapRefreshTimer = setTimeout(() => {
    gPostSwapRefreshTimer = null;
    try {
      if (typeof buildAndRenderReport === "function") {
        buildAndRenderReport();
      }
    } catch (e) {
      console.error("report refresh after swap failed:", e);
    }
    try {
      if (typeof buildFacultyPanel === "function") {
        const facultySelect = document.getElementById("facultySelect");
        const selectedFaculty = facultySelect ? facultySelect.value : "";
        buildFacultyPanel();
        if (
          selectedFaculty &&
          facultySelect &&
          Array.from(facultySelect.options || []).some(
            (opt) => opt.value === selectedFaculty
          )
        ) {
          facultySelect.value = selectedFaculty;
          if (typeof renderFacultyTimetable === "function") {
            renderFacultyTimetable(selectedFaculty);
          }
        }
      }
    } catch (e) {
      console.error("faculty refresh after swap failed:", e);
    }
    try {
      if (typeof renderLabTimetables === "function") {
        renderLabTimetables();
      }
    } catch (e) {
      console.error("lab panel refresh after swap failed:", e);
    }

  }, 0);
}

// Section: TEACHER RESOLUTION

/**
 * Splits and deduplicates a teacher string into a normalized array.
 * @param {string} input - Comma/pipe/slash-separated teacher names.
 * @returns {string[]}
 */
function normalizeTeacherList(input) {
  return Array.from(
    new Set(
      String(input || "")
      .split(/[,|/]+/)
      .map((t) => String(t || "").trim())
      .filter(Boolean)
    )
  );
}

/**
 * Returns the teacher list for a subject from global subject data.
 * @param {string} key - Class key (e.g. "A").
 * @param {string} short - Subject short form.
 * @returns {string[]}
 */
function getSubjectTeachersForCell(key, short) {
  const subj = gSubjectByShort?.[key]?.[short] || {};
  const list = Array.isArray(subj.teachers) ?
    subj.teachers
    .map((t) => String(t || "").trim())
    .filter(Boolean) :
    [];
  if (list.length) return Array.from(new Set(list));
  const one = String(subj.teacher || "").trim();
  return one ? [one] : [];
}

/**
 * Checks if a subject represents a lab based on its short form or name.
 * @param {string} key - Class key.
 * @param {string} short - Subject short form.
 * @returns {boolean}
 */
function isLabCellByShort(key, short) {
  const subj = gSubjectByShort?.[key]?.[short] || {};
  return /\blab\b/i.test(short || "") || /\blab\b/i.test(subj.subject || "");
}

/**
 * Resolves the teacher list for a DOM cell element.
 * @param {HTMLElement} cell - The .subject-cell DOM element.
 * @returns {string[]}
 */
function getCellTeacherList(cell) {
  if (!cell) return [];
  const key = String(cell.dataset.key || "").trim();
  const short = String(cell.dataset.short || "").trim();
  if (!key || !short) return [];

  const subjectTeachers = getSubjectTeachersForCell(key, short);
  if (isLabCellByShort(key, short) && subjectTeachers.length) {
    return subjectTeachers;
  }

  const fromCell = normalizeTeacherList(cell.dataset.teacher || "");
  if (fromCell.length) return fromCell;
  if (subjectTeachers.length) return [subjectTeachers[0]];

  const fallback = String(gTeacherForShort?.[key]?.[short] || "").trim();
  return fallback ? [fallback] : [];
}

/**
 * Resolves the teacher list for a slot by class key, day, and column.
 * @param {string} key - Class key.
 * @param {number} day - Day index.
 * @param {number} col - Column (period) index.
 * @returns {string[]}
 */
function getSlotTeacherList(key, day, col) {
  const short = gSchedules?.[key]?.[day]?.[col] || "";
  if (!short) return [];
  const cell = document.querySelector(
    `.subject-cell[data-key="${key}"][data-day="${day}"][data-col="${col}"]`
  );
  if (cell) return getCellTeacherList(cell);

  const subjectTeachers = getSubjectTeachersForCell(key, short);
  if (isLabCellByShort(key, short) && subjectTeachers.length) {
    return subjectTeachers;
  }
  if (subjectTeachers.length) return [subjectTeachers[0]];

  const fallback = String(gTeacherForShort?.[key]?.[short] || "").trim();
  return fallback ? [fallback] : [];
}

// Section: SWAP STATE MANAGEMENT

/**
 * Captures the current state of a cell for undo/redo history.
 * @param {HTMLElement} cell - The .subject-cell DOM element.
 * @returns {Object|null} Serialized cell state, or null if invalid.
 */
function captureSwapCellState(cell) {
  if (!cell) return null;
  const key = cell.dataset.key || "";
  const day = parseInt(cell.dataset.day || "-1", 10);
  const col = parseInt(cell.dataset.col || "-1", 10);
  if (!key || day < 0 || col < 0) return null;
  return {
    key,
    day,
    col,
    text: cell.textContent || "",
    title: cell.getAttribute("title") || "",
    teacher: cell.dataset.teacher || "",
    short: cell.dataset.short || "",
    scheduleShort: gSchedules[key]?.[day]?.[col] || "",
  };
}

/**
 * Finds the DOM cell matching a captured swap state.
 * @param {Object} state - Swap state from captureSwapCellState.
 * @returns {HTMLElement|null}
 */
function findSwapCell(state) {
  if (!state) return null;
  return document.querySelector(
    `.subject-cell[data-key="${state.key}"][data-day="${state.day}"][data-col="${state.col}"]`
  );
}

/**
 * Restores a cell to a previously captured state.
 * @param {Object} state - Swap state to apply.
 * @returns {HTMLElement|null} The updated cell, or null.
 */
function applySwapCellState(state) {
  const cell = findSwapCell(state);
  if (!cell || !state) return null;
  cell.textContent = state.text || "";
  if (state.title) cell.setAttribute("title", state.title);
  else cell.removeAttribute("title");

  if (state.teacher) cell.dataset.teacher = state.teacher;
  else delete cell.dataset.teacher;

  if (state.short) cell.dataset.short = state.short;
  else delete cell.dataset.short;

  if (gSchedules[state.key] && gSchedules[state.key][state.day]) {
    gSchedules[state.key][state.day][state.col] = state.scheduleShort || "";
  }
  return cell;
}

/**
 * Applies a CSS flash animation to swapped cells.
 * @param {HTMLElement[]} cells - Array of cell elements to flash.
 * @param {string} className - CSS class for the flash effect.
 */
function flashSwapCells(cells, className) {
  (cells || []).forEach((c) => {
    if (!c) return;
    c.classList.remove("swap-flash", "swap-error");
    void c.offsetWidth;
    c.classList.add(className);
    setTimeout(() => c.classList.remove(className), 600); // matches CSS transition duration
  });
}

// Section: SWAP HISTORY

/**
 * Pushes a swap entry onto the undo stack and clears redo stack.
 * @param {Object} entry - Swap history entry with before/after states.
 */
function pushSwapHistory(entry) {
  if (!entry) return;
  gSwapUndoStack.push(entry);
  if (gSwapUndoStack.length > MAX_SWAP_HISTORY) gSwapUndoStack.shift();
  gSwapRedoStack = [];
  updateDragSwapControls();
}

/**
 * Enables/disables the undo and redo buttons based on stack state.
 */
function updateDragSwapControls() {
  const undoBtn = document.getElementById("swapUndoBtn");
  const redoBtn = document.getElementById("swapRedoBtn");
  if (undoBtn) undoBtn.disabled = gSwapUndoStack.length === 0;
  if (redoBtn) redoBtn.disabled = gSwapRedoStack.length === 0;
}

/**
 * Clears both undo and redo stacks and updates button state.
 */
function resetDragSwapHistory() {
  gSwapUndoStack = [];
  gSwapRedoStack = [];
  updateDragSwapControls();
}

/**
 * Undoes the last timetable swap and pushes it to the redo stack.
 */
function undoTimetableSwap() {
  const entry = gSwapUndoStack.pop();
  if (!entry) {
    showToast("No swap to undo.", {
      type: "warn",
      duration: 1500
    });
    updateDragSwapControls();
    return;
  }
  const a = applySwapCellState(entry.before?.a);
  const b = applySwapCellState(entry.before?.b);
  flashSwapCells([a, b], "swap-flash");
  gSwapRedoStack.push(entry);
  updateDragSwapControls();
  refreshViewsAfterScheduleShift();
}

/**
 * Redoes a previously undone timetable swap.
 */
function redoTimetableSwap() {
  const entry = gSwapRedoStack.pop();
  if (!entry) {
    showToast("No swap to redo.", {
      type: "warn",
      duration: 1500
    });
    updateDragSwapControls();
    return;
  }
  const a = applySwapCellState(entry.after?.a);
  const b = applySwapCellState(entry.after?.b);
  flashSwapCells([a, b], "swap-flash");
  gSwapUndoStack.push(entry);
  if (gSwapUndoStack.length > MAX_SWAP_HISTORY) gSwapUndoStack.shift();
  updateDragSwapControls();
  refreshViewsAfterScheduleShift();
}

window.undoTimetableSwap = undoTimetableSwap;
window.redoTimetableSwap = redoTimetableSwap;

// Section: DRAG AND DROP BINDING

/**
 * Binds drag-and-drop swap handlers to all subject cells.
 */
function enableDragAndDrop() {
  let dragSource = null;
  resetDragSwapHistory();

  document.querySelectorAll(".subject-cell").forEach((cell) => {
    if (!cell.dataset.short) return;
    if (cell.dataset.dndBound === "1") return;
    cell.dataset.dndBound = "1";
    cell.setAttribute("draggable", "true");

    cell.addEventListener("dragstart", (e) => {
      dragSource = cell;
      cell.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", cell.dataset.short);
    });

    cell.addEventListener("dragend", () => {
      cell.classList.remove("dragging");
      document.querySelectorAll(".drag-over").forEach((c) =>
        c.classList.remove("drag-over")
      );
      dragSource = null;
    });

    cell.addEventListener("dragover", (e) => {
      if (!dragSource || dragSource === cell) return;
      if (
        cell.dataset.key !== dragSource.dataset.key ||
        cell.dataset.day !== dragSource.dataset.day
      ) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      cell.classList.add("drag-over");
    });

    cell.addEventListener("dragleave", () => {
      cell.classList.remove("drag-over");
    });

    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      cell.classList.remove("drag-over");
      if (!dragSource || dragSource === cell) return;

      const key = cell.dataset.key;
      const day = parseInt(cell.dataset.day, 10);
      const colA = parseInt(dragSource.dataset.col, 10);
      const colB = parseInt(cell.dataset.col, 10);

      if (key !== dragSource.dataset.key || day !== parseInt(dragSource.dataset.day, 10)) return;

      const shortA = gSchedules[key]?.[day]?.[colA] || "";
      const shortB = gSchedules[key]?.[day]?.[colB] || "";
      const teacherListA = getCellTeacherList(dragSource);
      const teacherListB = getCellTeacherList(cell);

      /**
       * Checks if any teacher has a clash at the target column in another class.
       * @param {string[]} teachers - Teacher names to check.
       * @param {number} targetCol - Column to check for clashes.
       * @param {string} excludeKey - Class key to exclude from search.
       * @returns {string} Clashing teacher name, or empty string.
       */
      function findClashAt(teachers, targetCol, excludeKey) {
        const foldedTeachers = Array.from(
          new Set(
            (teachers || [])
            .map((t) => canonicalTeacherName(t))
            .filter(Boolean)
            .map((canon) =>
              (gCanonFoldMap && gCanonFoldMap[canon]) || canon
            )
            .filter(Boolean)
          )
        );
        if (!foldedTeachers.length) return "";
        for (const otherKey of gEnabledKeys) {
          if (otherKey === excludeKey) continue;
          const otherTeachers = getSlotTeacherList(otherKey, day, targetCol);
          for (const otherTeacher of otherTeachers) {
            const canonOther = canonicalTeacherName(otherTeacher);
            const foldedOther =
              (gCanonFoldMap && gCanonFoldMap[canonOther]) || canonOther;
            if (foldedOther && foldedTeachers.includes(foldedOther)) {
              return otherTeacher;
            }
          }
        }
        return "";
      }

      const clashTeacherA = findClashAt(teacherListA, colB, key);
      const clashTeacherB = findClashAt(teacherListB, colA, key);
      const clashA = !!clashTeacherA;
      const clashB = !!clashTeacherB;

      if (clashA || clashB) {
        flashSwapCells([dragSource, cell], "swap-error");
        const clashTeacher = clashTeacherA || clashTeacherB || "Teacher";
        cell.setAttribute("title", `Swap blocked: ${clashTeacher} has a clash in another class`);
        setTimeout(() => {
          const short = cell.dataset.short || "";
          const subj = gSubjectByShort[key]?.[short];
          const teachers = getCellTeacherList(cell).join(", ");
          if (subj?.subject) {
            cell.setAttribute(
              "title",
              `${subj.subject}${teachers ? ` \u2014 ${teachers}` : ""}`
            );
          } else {
            cell.setAttribute("title", teachers || "");
          }
        }, 2000);
        return;
      }

      const beforeA = captureSwapCellState(dragSource);
      const beforeB = captureSwapCellState(cell);

      gSchedules[key][day][colA] = shortB;
      gSchedules[key][day][colB] = shortA;

      const tmpText = dragSource.textContent;
      const tmpTitle = dragSource.getAttribute("title");
      const tmpTeacher = dragSource.dataset.teacher;
      const tmpShort = dragSource.dataset.short;

      dragSource.textContent = cell.textContent;
      dragSource.setAttribute("title", cell.getAttribute("title") || "");
      dragSource.dataset.teacher = cell.dataset.teacher;
      dragSource.dataset.short = cell.dataset.short;

      cell.textContent = tmpText;
      cell.setAttribute("title", tmpTitle || "");
      cell.dataset.teacher = tmpTeacher;
      cell.dataset.short = tmpShort;

      flashSwapCells([dragSource, cell], "swap-flash");

      const afterA = captureSwapCellState(dragSource);
      const afterB = captureSwapCellState(cell);
      pushSwapHistory({
        before: {
          a: beforeA,
          b: beforeB
        },
        after: {
          a: afterA,
          b: afterB
        }
      });
      refreshViewsAfterScheduleShift();
    });
  });
}
