/**
 * @file tests/unit/render.test.js
 * @description Tests for scheduler/render.js: DOM rendering of class timetables.
 */

function buildMockTable({ key, days, periods }) {
  const table = document.createElement("table");
  table.id = `timetable${key}`;
  const tbody = document.createElement("tbody");
  for (let d = 0; d < days; d++) {
    const tr = document.createElement("tr");
    const dayTd = document.createElement("td");
    dayTd.textContent = `Day${d + 1}`;
    tr.appendChild(dayTd);
    for (let p = 0; p < periods; p++) {
      const td = document.createElement("td");
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  document.body.appendChild(table);
  return table;
}

// ─── schedulerRenderClassToDOM ───────────────────────────────────────────────

describe("schedulerRenderClassToDOM", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("is defined as a function", () => {
    expect(typeof schedulerRenderClassToDOM).toBe("function");
  });

  test("renders subject short code into cells", () => {
    buildMockTable({ key: "A", days: 1, periods: 3 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [
        { type: "class" },
        { type: "class" },
        { type: "class" },
      ],
      schedules: { A: [["MATH", "PHY", "CHEM"]] },
      subjectByShort: {
        A: {
          MATH: { subject: "Mathematics", teacher: "T1" },
          PHY: { subject: "Physics", teacher: "T2" },
          CHEM: { subject: "Chemistry", teacher: "T3" },
        },
      },
      getTeacherForCell: () => "T1",
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null, null, null]] },
      fillerLabelsByClass: {},
    });
    const tds = document.querySelectorAll("#timetableA tbody td");
    expect(tds[1].textContent).toBe("MATH");
    expect(tds[2].textContent).toBe("PHY");
    expect(tds[3].textContent).toBe("CHEM");
  });

  test("skips lunch periods (does not increment classCol)", () => {
    buildMockTable({ key: "A", days: 1, periods: 4 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [
        { type: "class" },
        { type: "class" },
        { type: "lunch" },
        { type: "class" },
      ],
      schedules: { A: [["MATH", "PHY", "CHEM"]] },
      subjectByShort: {
        A: {
          MATH: { subject: "Mathematics", teacher: "T1" },
          PHY: { subject: "Physics", teacher: "T2" },
          CHEM: { subject: "Chemistry", teacher: "T3" },
        },
      },
      getTeacherForCell: () => "T",
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null, null, null]] },
      fillerLabelsByClass: {},
    });
    const tds = document.querySelectorAll("#timetableA tbody td");
    expect(tds[1].textContent).toBe("MATH");
    expect(tds[2].textContent).toBe("PHY");
    // tds[3] is lunch — skipped
    expect(tds[4].textContent).toBe("CHEM");
  });

  test("adds subject-cell CSS class to filled cells", () => {
    buildMockTable({ key: "A", days: 1, periods: 2 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [{ type: "class" }, { type: "class" }],
      schedules: { A: [["MATH", null]] },
      subjectByShort: {
        A: { MATH: { subject: "Mathematics", teacher: "T1" } },
      },
      getTeacherForCell: () => "T1",
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null, null]] },
      fillerLabelsByClass: {},
    });
    const tds = document.querySelectorAll("#timetableA tbody td");
    expect(tds[1].classList.contains("subject-cell")).toBe(true);
    expect(tds[2].classList.contains("subject-cell")).toBe(false);
  });

  test("sets data attributes on filled cells", () => {
    buildMockTable({ key: "A", days: 1, periods: 1 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [{ type: "class" }],
      schedules: { A: [["MATH"]] },
      subjectByShort: {
        A: { MATH: { subject: "Mathematics", teacher: "T1" } },
      },
      getTeacherForCell: () => "T1",
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null]] },
      fillerLabelsByClass: {},
    });
    const cell = document.querySelector("#timetableA tbody td:nth-child(2)");
    expect(cell.dataset.key).toBe("A");
    expect(cell.dataset.day).toBe("0");
    expect(cell.dataset.col).toBe("0");
    expect(cell.dataset.short).toBe("MATH");
    expect(cell.dataset.teacher).toBe("T1");
    expect(cell.id).toBe("tt-A-0-0");
  });

  test("renders lab short with lab number", () => {
    buildMockTable({ key: "A", days: 1, periods: 1 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [{ type: "class" }],
      schedules: { A: [["CS LAB"]] },
      subjectByShort: {
        A: { "CS LAB": { subject: "CS Lab", teacher: "T1" } },
      },
      getTeacherForCell: () => "T1",
      isLabShort: { A: { "CS LAB": true } },
      labNumberAssigned: { A: [[2]] },
      fillerLabelsByClass: {},
    });
    const cell = document.querySelector("#timetableA tbody td:nth-child(2)");
    expect(cell.textContent).toBe("CS LAB (L2)");
  });

  test("renders lab short without lab number when not assigned", () => {
    buildMockTable({ key: "A", days: 1, periods: 1 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [{ type: "class" }],
      schedules: { A: [["CS LAB"]] },
      subjectByShort: {
        A: { "CS LAB": { subject: "CS Lab", teacher: "T1" } },
      },
      getTeacherForCell: () => "T1",
      isLabShort: { A: { "CS LAB": true } },
      labNumberAssigned: { A: [[null]] },
      fillerLabelsByClass: {},
    });
    const cell = document.querySelector("#timetableA tbody td:nth-child(2)");
    expect(cell.textContent).toBe("CS LAB");
  });

  test("sets title with filler label when available", () => {
    buildMockTable({ key: "A", days: 1, periods: 1 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [{ type: "class" }],
      schedules: { A: [["PT"]] },
      subjectByShort: {
        A: { PT: { subject: "Physical Training", teacher: "Coach" } },
      },
      getTeacherForCell: () => "Coach",
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null]] },
      fillerLabelsByClass: { A: { PT: "Physical Training" } },
    });
    const cell = document.querySelector("#timetableA tbody td:nth-child(2)");
    expect(cell.getAttribute("title")).toBe("Physical Training — Coach");
  });

  test("clears empty cells and removes subject-cell class", () => {
    buildMockTable({ key: "A", days: 1, periods: 2 });
    // first render with content
    const tds = document.querySelectorAll("#timetableA tbody td");
    tds[2].textContent = "OLD";
    tds[2].classList.add("subject-cell");

    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [{ type: "class" }, { type: "class" }],
      schedules: { A: [["MATH", null]] },
      subjectByShort: {
        A: { MATH: { subject: "Mathematics", teacher: "T1" } },
      },
      getTeacherForCell: () => "T1",
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null, null]] },
      fillerLabelsByClass: {},
    });
    expect(tds[2].textContent).toBe("");
    expect(tds[2].classList.contains("subject-cell")).toBe(false);
  });

  test("uses originalShort for display when available", () => {
    buildMockTable({ key: "A", days: 1, periods: 1 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 1,
      periodTimings: [{ type: "class" }],
      schedules: { A: [["MATH"]] },
      subjectByShort: {
        A: {
          MATH: {
            subject: "Mathematics",
            teacher: "T1",
            originalShort: "Math",
          },
        },
      },
      getTeacherForCell: () => "T1",
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null]] },
      fillerLabelsByClass: {},
    });
    const cell = document.querySelector("#timetableA tbody td:nth-child(2)");
    expect(cell.textContent).toBe("Math");
  });

  test("renders multiple days correctly", () => {
    buildMockTable({ key: "A", days: 2, periods: 1 });
    schedulerRenderClassToDOM({
      key: "A",
      days: 2,
      periodTimings: [{ type: "class" }],
      schedules: { A: [["MATH"], ["PHY"]] },
      subjectByShort: {
        A: {
          MATH: { subject: "Mathematics", teacher: "T1" },
          PHY: { subject: "Physics", teacher: "T2" },
        },
      },
      getTeacherForCell: (k, s) => (s === "MATH" ? "T1" : "T2"),
      isLabShort: { A: {} },
      labNumberAssigned: { A: [[null], [null]] },
      fillerLabelsByClass: {},
    });
    const rows = document.querySelectorAll("#timetableA tbody tr");
    expect(rows[0].querySelectorAll("td")[1].textContent).toBe("MATH");
    expect(rows[1].querySelectorAll("td")[1].textContent).toBe("PHY");
  });
});
