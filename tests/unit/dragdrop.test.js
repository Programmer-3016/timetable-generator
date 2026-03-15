/**
 * @file tests/unit/dragdrop.test.js
 * @description Unit tests for ui/dragdrop.js: drag-and-drop cell swap,
 *   undo/redo history management, visual feedback, and validation.
 */

/* ═══════════════════════════════════════════════════════
   Section: MOCK HELPERS
═══════════════════════════════════════════════════════ */

/**
 * Creates a mock DataTransfer instance.
 * @returns {Object}
 */
function createMockDataTransfer() {
  const store = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    setData(type, val) { store[type] = val; },
    getData(type) { return store[type] || ""; },
  };
}

/**
 * Creates a mock DragEvent with the given type and dataTransfer.
 * @param {string} type - Event type (dragstart, drop, etc.)
 * @param {Object} [dt] - DataTransfer mock.
 * @returns {DragEvent}
 */
function createDragEvent(type, dt) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.dataTransfer = dt || createMockDataTransfer();
  return /** @type {DragEvent} */ (event);
}

/* ═══════════════════════════════════════════════════════
   Section: DOM SETUP & TEARDOWN
═══════════════════════════════════════════════════════ */

beforeEach(() => {
  jest.useFakeTimers();

  document.body.innerHTML = "";

  // ── Undo / Redo buttons ──────────────────────────
  const undoBtn = document.createElement("button");
  undoBtn.id = "swapUndoBtn";
  document.body.appendChild(undoBtn);

  const redoBtn = document.createElement("button");
  redoBtn.id = "swapRedoBtn";
  document.body.appendChild(redoBtn);

  // ── Global state ─────────────────────────────────
  global.gSchedules = { A: [["M", "P", "C"]] };
  global.gEnabledKeys = ["A"];
  global.gSubjectByShort = {
    A: {
      M: { subject: "Math", teacher: "Dr. A" },
      P: { subject: "Physics", teacher: "Dr. B" },
      C: { subject: "Chemistry", teacher: "Dr. C" },
    },
  };
  global.gTeacherForShort = { A: { M: "Dr. A", P: "Dr. B", C: "Dr. C" } };
  global.gCanonFoldMap = {};

  // ── Timetable row with subject cells ─────────────
  const table = document.createElement("table");
  const row = document.createElement("tr");

  ["M", "P", "C"].forEach((short, col) => {
    const td = document.createElement("td");
    td.className = "subject-cell";
    td.textContent = short;
    td.dataset.key = "A";
    td.dataset.day = "0";
    td.dataset.col = String(col);
    td.dataset.short = short;
    td.dataset.teacher = global.gSubjectByShort.A[short].teacher;
    td.setAttribute("title", global.gSubjectByShort.A[short].subject);
    row.appendChild(td);
  });
  table.appendChild(row);
  document.body.appendChild(table);
});

afterEach(() => {
  jest.useRealTimers();
});

/* ═══════════════════════════════════════════════════════
   Section: enableDragAndDrop
═══════════════════════════════════════════════════════ */

describe("enableDragAndDrop", () => {
  test("makes subject cells draggable", () => {
    enableDragAndDrop();
    const cells = document.querySelectorAll(".subject-cell");
    cells.forEach((cell) => {
      expect(cell.getAttribute("draggable")).toBe("true");
      expect(cell.dataset.dndBound).toBe("1");
    });
  });
});

/* ═══════════════════════════════════════════════════════
   Section: DRAG START
═══════════════════════════════════════════════════════ */

describe("drag start", () => {
  test("sets correct data on dataTransfer", () => {
    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const dt = createMockDataTransfer();
    const event = createDragEvent("dragstart", dt);
    cellM.dispatchEvent(event);

    expect(dt.getData("text/plain")).toBe("M");
    expect(dt.effectAllowed).toBe("move");
    expect(cellM.classList.contains("dragging")).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: DROP – VALID TARGET
═══════════════════════════════════════════════════════ */

describe("drop on valid target", () => {
  test("swaps cell content between same-class same-day cells", () => {
    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const cellP = document.querySelector('.subject-cell[data-col="1"]');

    // Drag start on M
    const dtStart = createMockDataTransfer();
    cellM.dispatchEvent(createDragEvent("dragstart", dtStart));

    // Dragover on P to allow drop
    const overEvt = createDragEvent("dragover", createMockDataTransfer());
    cellP.dispatchEvent(overEvt);

    // Drop on P
    cellP.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));

    // Content should be swapped
    expect(cellM.textContent).toBe("P");
    expect(cellP.textContent).toBe("M");
    expect(cellM.dataset.short).toBe("P");
    expect(cellP.dataset.short).toBe("M");
    // Schedule array should reflect the swap
    expect(global.gSchedules.A[0][0]).toBe("P");
    expect(global.gSchedules.A[0][1]).toBe("M");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: DROP – INVALID TARGET
═══════════════════════════════════════════════════════ */

describe("drop on invalid target", () => {
  test("rejects drop when target has different class key", () => {
    // Add a cell with a different class key
    const alien = document.createElement("td");
    alien.className = "subject-cell";
    alien.textContent = "X";
    alien.dataset.key = "B";
    alien.dataset.day = "0";
    alien.dataset.col = "0";
    alien.dataset.short = "X";
    document.body.appendChild(alien);

    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-key="A"][data-col="0"]');

    cellM.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));
    alien.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));

    // Nothing should change
    expect(cellM.textContent).toBe("M");
    expect(alien.textContent).toBe("X");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: UNDO / REDO
═══════════════════════════════════════════════════════ */

describe("undo after swap", () => {
  test("restores original state", () => {
    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const cellP = document.querySelector('.subject-cell[data-col="1"]');

    // Perform swap
    cellM.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("dragover", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));

    // Verify swap happened
    expect(cellM.textContent).toBe("P");

    // Undo
    undoTimetableSwap();
    jest.runAllTimers();

    expect(cellM.textContent).toBe("M");
    expect(cellP.textContent).toBe("P");
    expect(global.gSchedules.A[0][0]).toBe("M");
    expect(global.gSchedules.A[0][1]).toBe("P");
  });
});

describe("redo after undo", () => {
  test("re-applies the swap", () => {
    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const cellP = document.querySelector('.subject-cell[data-col="1"]');

    // Swap, undo, redo
    cellM.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("dragover", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));

    undoTimetableSwap();
    jest.runAllTimers();

    redoTimetableSwap();
    jest.runAllTimers();

    expect(cellM.textContent).toBe("P");
    expect(cellP.textContent).toBe("M");
    expect(global.gSchedules.A[0][0]).toBe("P");
    expect(global.gSchedules.A[0][1]).toBe("M");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: UNDO / REDO BUTTON STATES
═══════════════════════════════════════════════════════ */

describe("undo/redo button states", () => {
  test("buttons are disabled when stacks are empty", () => {
    enableDragAndDrop();
    const undoBtn = document.getElementById("swapUndoBtn");
    const redoBtn = document.getElementById("swapRedoBtn");

    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
  });

  test("undo enabled after swap, redo enabled after undo", () => {
    enableDragAndDrop();
    const undoBtn = document.getElementById("swapUndoBtn");
    const redoBtn = document.getElementById("swapRedoBtn");
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const cellP = document.querySelector('.subject-cell[data-col="1"]');

    // Swap
    cellM.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("dragover", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));

    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(true);

    // Undo
    undoTimetableSwap();
    jest.runAllTimers();

    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(false);

    // Redo
    redoTimetableSwap();
    jest.runAllTimers();

    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: MULTIPLE SWAPS – UNDO STACK
═══════════════════════════════════════════════════════ */

describe("multiple swaps", () => {
  test("build up undo stack", () => {
    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const cellP = document.querySelector('.subject-cell[data-col="1"]');
    const cellC = document.querySelector('.subject-cell[data-col="2"]');
    const undoBtn = document.getElementById("swapUndoBtn");

    // Swap 1: M ↔ P
    cellM.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("dragover", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));
    // After swap: cells are [P, M, C]

    // Swap 2: col1 (now M) ↔ col2 (C)
    cellP.dispatchEvent(createDragEvent("dragend", createMockDataTransfer()));
    const cellCol1 = document.querySelector('.subject-cell[data-col="1"]');
    const cellCol2 = document.querySelector('.subject-cell[data-col="2"]');
    cellCol1.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));
    cellCol2.dispatchEvent(createDragEvent("dragover", createMockDataTransfer()));
    cellCol2.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));
    // After swap: cells are [P, C, M]

    expect(undoBtn.disabled).toBe(false);

    // Undo swap 2 → [P, M, C]
    undoTimetableSwap();
    jest.runAllTimers();
    expect(document.querySelector('.subject-cell[data-col="1"]').textContent).toBe("M");
    expect(document.querySelector('.subject-cell[data-col="2"]').textContent).toBe("C");

    // Undo swap 1 → [M, P, C]
    undoTimetableSwap();
    jest.runAllTimers();
    expect(document.querySelector('.subject-cell[data-col="0"]').textContent).toBe("M");
    expect(document.querySelector('.subject-cell[data-col="1"]').textContent).toBe("P");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: DRAG VISUAL FEEDBACK
═══════════════════════════════════════════════════════ */

describe("drag visual feedback", () => {
  test("adds drag-over class on dragover and removes on dragleave", () => {
    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const cellP = document.querySelector('.subject-cell[data-col="1"]');

    // Start drag on M
    cellM.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));

    // Dragover on P should add class
    cellP.dispatchEvent(createDragEvent("dragover", createMockDataTransfer()));
    expect(cellP.classList.contains("drag-over")).toBe(true);

    // Dragleave on P should remove class
    cellP.dispatchEvent(createDragEvent("dragleave", createMockDataTransfer()));
    expect(cellP.classList.contains("drag-over")).toBe(false);
  });

  test("swap-flash class is applied after a successful drop", () => {
    enableDragAndDrop();
    const cellM = document.querySelector('.subject-cell[data-col="0"]');
    const cellP = document.querySelector('.subject-cell[data-col="1"]');

    cellM.dispatchEvent(createDragEvent("dragstart", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("dragover", createMockDataTransfer()));
    cellP.dispatchEvent(createDragEvent("drop", createMockDataTransfer()));

    expect(cellM.classList.contains("swap-flash")).toBe(true);
    expect(cellP.classList.contains("swap-flash")).toBe(true);

    // After timeout, flash class is removed
    jest.advanceTimersByTime(600);
    expect(cellM.classList.contains("swap-flash")).toBe(false);
    expect(cellP.classList.contains("swap-flash")).toBe(false);
  });
});
