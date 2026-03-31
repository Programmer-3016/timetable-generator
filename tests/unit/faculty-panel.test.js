/**
 * @file tests/unit/faculty-panel.test.js
 * @description Unit tests for ui/faculty-panel.js: faculty selector dropdown
 *   construction and per-teacher timetable rendering.
 */

/* ═══════════════════════════════════════════════════════
   Section: DOM SETUP & TEARDOWN
═══════════════════════════════════════════════════════ */

/**
 * Builds the minimal DOM structure that faculty-panel.js expects.
 */
function buildFacultyDOM() {
  const panel = document.createElement("div");
  panel.id = "facultyPanel";
  document.body.appendChild(panel);

  const sel = document.createElement("select");
  sel.id = "facultySelect";
  document.body.appendChild(sel);

  const tt = document.createElement("div");
  tt.id = "facultyTT";
  document.body.appendChild(tt);

  const daysInput = document.createElement("input");
  daysInput.id = "days";
  daysInput.value = "5";
  document.body.appendChild(daysInput);
}

beforeEach(() => {
  document.body.innerHTML = "";
  buildFacultyDOM();

  // Stub globals that faculty-panel.js reads
  global.reportData = [];
  global.gCanonFoldMap = {};
  global.gTeacherDisplayByCanon = {};
  global.gEnabledKeys = ["A"];
  global.subjectTeacherPairsByClass = {
    A: [
      { teacher: "Dr. Smith", subject: "Physics" },
      { teacher: "Prof. Jones", subject: "Chemistry" },
    ],
  };
  global.gSchedules = {
    A: [
      ["PHY", "CHE", "PHY"],
      ["CHE", "PHY", "CHE"],
      ["PHY", "CHE", "PHY"],
      ["CHE", "PHY", "CHE"],
      ["PHY", "CHE", "PHY"],
    ],
  };
  global.gSubjectByShort = {
    A: {
      PHY: { subject: "Physics", teachers: ["Dr. Smith"] },
      CHE: { subject: "Chemistry", teachers: ["Prof. Jones"] },
    },
  };
  global.gTeacherForShort = {
    A: { PHY: "Dr. Smith", CHE: "Prof. Jones" },
  };
  global.gClassLabels = { A: "Class A" };
  global.gLabNumberAssigned = {};
  global.periodTimings = [
    { type: "class", start: "9:00", end: "9:45" },
    { type: "class", start: "9:45", end: "10:30" },
    { type: "class", start: "10:30", end: "11:15" },
  ];
  global.window.gAssignedTeacher = {};
  global.renderLabUsage = jest.fn();
  global.getActiveTab = jest.fn().mockReturnValue("faculty");
});

afterEach(() => {
  document.body.innerHTML = "";
});

/* ═══════════════════════════════════════════════════════
   Section: buildFacultyPanel
═══════════════════════════════════════════════════════ */

describe("buildFacultyPanel", () => {
  test("creates a select dropdown with teacher names", () => {
    buildFacultyPanel();
    const sel = document.getElementById("facultySelect");
    const options = sel.querySelectorAll("option");
    // Default placeholder + 2 teachers
    expect(options.length).toBe(3);
    expect(options[0].value).toBe("");
    expect(options[0].textContent).toBe("— Select Faculty —");
  });

  test("populates options from gSchedules teacher data via subjectTeacherPairsByClass", () => {
    buildFacultyPanel();
    const sel = document.getElementById("facultySelect");
    const optionValues = Array.from(sel.querySelectorAll("option"))
      .map((o) => o.value)
      .filter(Boolean);
    expect(optionValues).toContain("Dr. Smith");
    expect(optionValues).toContain("Prof. Jones");
  });

  test("sorts teacher options alphabetically", () => {
    buildFacultyPanel();
    const sel = document.getElementById("facultySelect");
    const optionTexts = Array.from(sel.querySelectorAll("option"))
      .map((o) => o.textContent)
      .filter((t) => t !== "— Select Faculty —");
    const sorted = [...optionTexts].sort((a, b) => a.localeCompare(b));
    expect(optionTexts).toEqual(sorted);
  });

  test("hides panel when no teachers are found", () => {
    global.subjectTeacherPairsByClass = { A: [] };
    buildFacultyPanel();
    const panel = document.getElementById("facultyPanel");
    expect(panel.style.display).toBe("none");
  });

  test("populates from reportData when available", () => {
    global.reportData = [
      { teacher: "Dr. Adams" },
      { teacher: "Dr. Brown" },
      { teacher: "Dr. Adams" },
    ];
    buildFacultyPanel();
    const sel = document.getElementById("facultySelect");
    const optionValues = Array.from(sel.querySelectorAll("option"))
      .map((o) => o.value)
      .filter(Boolean);
    expect(optionValues).toContain("Dr. Adams");
    expect(optionValues).toContain("Dr. Brown");
    expect(optionValues.length).toBe(2);
  });

  test("re-renders the previously selected teacher after rebuilding", () => {
    buildFacultyPanel();
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById("facultySelect"));
    sel.value = "Dr. Smith";
    renderFacultyTimetable("Dr. Smith");
    expect(document.getElementById("facultyTT").textContent).toContain("PHY");

    global.gSchedules = {
      A: [
        ["CHE", "CHE", "CHE"],
        ["CHE", "CHE", "CHE"],
        ["CHE", "CHE", "CHE"],
        ["CHE", "CHE", "CHE"],
        ["CHE", "CHE", "CHE"],
      ],
    };
    global.gTeacherForShort = {
      A: { CHE: "Dr. Smith" },
    };
    global.gSubjectByShort = {
      A: {
        CHE: { subject: "Chemistry", teachers: ["Dr. Smith"] },
      },
    };

    buildFacultyPanel();
    expect(sel.value).toBe("Dr. Smith");
    expect(document.getElementById("facultyTT").textContent).toContain("CHE");
    expect(document.getElementById("facultyTT").textContent).not.toContain("PHY");
  });

  test("clears stale faculty timetable when previous selection is no longer available", () => {
    buildFacultyPanel();
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById("facultySelect"));
    sel.value = "Dr. Smith";
    renderFacultyTimetable("Dr. Smith");
    expect(document.getElementById("facultyTT").textContent).toContain("PHY");

    global.reportData = [{ teacher: "Prof. Jones" }];
    buildFacultyPanel();

    expect(sel.value).toBe("");
    expect(document.getElementById("facultyTT").textContent).toContain("Faculty view");
    expect(document.getElementById("facultyTT").textContent).not.toContain("PHY");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: renderFacultyTimetable
═══════════════════════════════════════════════════════ */

describe("renderFacultyTimetable", () => {
  test("creates a table with correct days and periods", () => {
    renderFacultyTimetable("Dr. Smith");
    const target = document.getElementById("facultyTT");
    const table = target.querySelector("table");
    expect(table).not.toBeNull();
    // 5 days → 5 body rows
    const rows = table.querySelectorAll("tbody tr");
    expect(rows.length).toBe(5);
    // 3 class periods + 1 day column = 4 header cells
    const headers = table.querySelectorAll("thead th");
    expect(headers.length).toBe(4);
  });

  test("shows free periods for slots without that teacher", () => {
    renderFacultyTimetable("Dr. Smith");
    const target = document.getElementById("facultyTT");
    const freeCells = target.querySelectorAll(".fac-free");
    // Days 0,2,4 have PHY at cols 0,2 (1 free); days 1,3 have PHY at col 1 (2 free)
    // 3×1 + 2×2 = 7 free cells
    expect(freeCells.length).toBe(7);
    expect(freeCells[0].textContent).toBe("Free");
  });

  test("shows subject assignments for the teacher", () => {
    renderFacultyTimetable("Dr. Smith");
    const target = document.getElementById("facultyTT");
    const assignCells = target.querySelectorAll(".fac-assign");
    // Days 0,2,4 have 2 PHY slots; days 1,3 have 1 PHY slot → 3×2 + 2×1 = 8
    expect(assignCells.length).toBe(8);
    // Each assignment cell should mention the class and short label
    expect(assignCells[0].textContent).toContain("Class A");
    expect(assignCells[0].textContent).toContain("PHY");
  });

  test("renders caption with teacher display name", () => {
    renderFacultyTimetable("Dr. Smith");
    const caption = document.getElementById("facultyTT").querySelector("caption");
    expect(caption.textContent).toContain("Dr. Smith");
  });

  test("does not fall back to configured teacher when assignedTeacher is explicitly blank", () => {
    global.gSchedules = {
      A: [["PHY"], [], [], [], []],
    };
    global.periodTimings = [
      { type: "class", start: "9:00", end: "9:45" },
    ];
    global.window.gAssignedTeacher = {
      A: [[""]],
    };

    renderFacultyTimetable("Dr. Smith");
    const target = document.getElementById("facultyTT");
    const freeCells = target.querySelectorAll(".fac-free");
    const assignCells = target.querySelectorAll(".fac-assign");

    expect(freeCells.length).toBe(5);
    expect(assignCells.length).toBe(0);
  });

  /* ─────────────────────────────────────────────────────
     Subsection: EDGE CASES
  ───────────────────────────────────────────────────── */

  test("teacher with no assignments shows all free periods", () => {
    renderFacultyTimetable("Nobody");
    const target = document.getElementById("facultyTT");
    const freeCells = target.querySelectorAll(".fac-free");
    // 5 days × 3 periods = 15 free cells
    expect(freeCells.length).toBe(15);
    const assignCells = target.querySelectorAll(".fac-assign");
    expect(assignCells.length).toBe(0);
  });

  test("empty schedule shows all free periods", () => {
    global.gSchedules = { A: [[], [], [], [], []] };
    renderFacultyTimetable("Dr. Smith");
    const target = document.getElementById("facultyTT");
    const freeCells = target.querySelectorAll(".fac-free");
    expect(freeCells.length).toBe(15);
  });

  test("does nothing when facultyTT element is missing", () => {
    document.getElementById("facultyTT").remove();
    // Should not throw
    expect(() => renderFacultyTimetable("Dr. Smith")).not.toThrow();
  });
});
