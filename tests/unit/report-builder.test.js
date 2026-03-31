/**
 * @file tests/unit/report-builder.test.js
 * @description Unit tests for ui/report-builder.js aggregate teacher reporting.
 */

const fs = require("fs");
const path = require("path");

function loadScript(relPath) {
  const fullPath = path.resolve(__dirname, "..", "..", relPath);
  const code = fs.readFileSync(fullPath, "utf8");
  const indirectEval = eval;
  indirectEval(code);
}

beforeAll(() => {
  loadScript("src/js/ui/report-builder.js");
});

beforeEach(() => {
  document.body.innerHTML = "";

  const duration = document.createElement("input");
  duration.id = "duration";
  duration.value = "50";
  document.body.appendChild(duration);

  global.renderSubjectInfo = jest.fn();
  global.renderReport = jest.fn();
  global.aggregateStats = {};
  global.reportData = [];
  global.gEnabledKeys = ["A"];
  global.gSchedules = {
    A: [["PHY"], [], [], [], []],
  };
  global.gSubjectByShort = {
    A: {
      PHY: {
        subject: "Physics",
        teachers: ["Dr. Smith"],
      },
    },
  };
  global.gTeacherForShort = {
    A: {
      PHY: "Dr. Smith",
    },
  };
  global.gCanonFoldMap = {};
  global.window.gAssignedTeacher = {
    A: [[""]],
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("buildAndRenderReport", () => {
  test("does not count explicit blank assignedTeacher cells toward teacher totals", () => {
    buildAndRenderReport();

    expect(reportData).toEqual([]);
    expect(aggregateStats).toEqual({});
  });
});
