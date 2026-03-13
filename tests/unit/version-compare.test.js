/**
 * @file tests/unit/version-compare.test.js
 * @description Unit tests for versioning/version-compare.js
 */

const fs = require("fs");
const path = require("path");
const compareSrc = fs.readFileSync(
  path.join(__dirname, "../../src/js/versioning/version-compare.js"),
  "utf-8"
);

eval(compareSrc);

// Helper: build a version object for testing
function makeVersion(id, label, opts) {
  opts = opts || {};
  return {
    id: id,
    label: label,
    valid: opts.valid !== false,
    classLabels: opts.classLabels || { A: "CSE-A" },
    snapshot: {
      seed: opts.seed || 42,
      keys: opts.keys || ["A"],
      days: opts.days || 2,
      classesPerDay: opts.cols || 3,
      lunchClassIndex: opts.lunchClassIndex != null ? opts.lunchClassIndex : 2,
      schedulesByClass: opts.schedules || {
        A: [
          ["MATH", "PHY", "CHEM"],
          ["ENG", "CS", null],
        ],
      },
    },
  };
}

describe("version-compare.js", () => {

  describe("diffScheduleVersions", () => {
    test("returns null if v1 is null", () => {
      expect(diffScheduleVersions(null, makeVersion(1, "B"))).toBeNull();
    });

    test("returns null if v2 has no snapshot", () => {
      expect(diffScheduleVersions(makeVersion(1, "A"), { id: 2, label: "B" })).toBeNull();
    });

    test("identical versions have 0 changes", () => {
      var v1 = makeVersion(1, "A");
      var v2 = makeVersion(2, "B");
      var diff = diffScheduleVersions(v1, v2);
      expect(diff.summary.changedCells).toBe(0);
      expect(diff.summary.changePercent).toBe(0);
    });

    test("detects cell differences", () => {
      var v1 = makeVersion(1, "V1", {
        schedules: { A: [["MATH", "PHY", "CHEM"], ["ENG", "CS", null]] },
      });
      var v2 = makeVersion(2, "V2", {
        schedules: { A: [["MATH", "BIO", "CHEM"], ["ENG", "CS", "ART"]] },
      });
      var diff = diffScheduleVersions(v1, v2);
      expect(diff.summary.changedCells).toBe(2); // PHY→BIO, null→ART
      expect(diff.classes.A.cells[0][1].changed).toBe(true);
      expect(diff.classes.A.cells[0][1].a).toBe("PHY");
      expect(diff.classes.A.cells[0][1].b).toBe("BIO");
    });

    test("handles different class keys across versions", () => {
      var v1 = makeVersion(1, "V1", {
        keys: ["A"],
        schedules: { A: [["MATH"]] },
        cols: 1,
        days: 1,
      });
      var v2 = makeVersion(2, "V2", {
        keys: ["A", "B"],
        schedules: { A: [["MATH"]], B: [["PHY"]] },
        cols: 1,
        days: 1,
      });
      var diff = diffScheduleVersions(v1, v2);
      expect(diff.keys).toContain("A");
      expect(diff.keys).toContain("B");
      // Class B: v1 has nothing, v2 has PHY → 1 change
      expect(diff.classes.B.cells[0][0].changed).toBe(true);
    });

    test("includes validation status in result", () => {
      var v1 = makeVersion(1, "V1", { valid: true });
      var v2 = makeVersion(2, "V2", { valid: false });
      var diff = diffScheduleVersions(v1, v2);
      expect(diff.v1Valid).toBe(true);
      expect(diff.v2Valid).toBe(false);
    });

    test("computes correct change percentage", () => {
      var v1 = makeVersion(1, "V1", {
        keys: ["A"],
        days: 1,
        cols: 4,
        schedules: { A: [["A", "B", "C", "D"]] },
      });
      var v2 = makeVersion(2, "V2", {
        keys: ["A"],
        days: 1,
        cols: 4,
        schedules: { A: [["A", "X", "C", "Y"]] },
      });
      var diff = diffScheduleVersions(v1, v2);
      expect(diff.summary.totalCells).toBe(4);
      expect(diff.summary.changedCells).toBe(2);
      expect(diff.summary.changePercent).toBe(50);
    });

    test("uses max days/cols from both versions", () => {
      var v1 = makeVersion(1, "V1", { days: 3, cols: 2, keys: ["A"], schedules: { A: [] } });
      var v2 = makeVersion(2, "V2", { days: 2, cols: 5, keys: ["A"], schedules: { A: [] } });
      var diff = diffScheduleVersions(v1, v2);
      expect(diff.days).toBe(3);
      expect(diff.cols).toBe(5);
    });

    test("treats null cells as empty strings", () => {
      var v1 = makeVersion(1, "V1", {
        keys: ["A"], days: 1, cols: 2,
        schedules: { A: [[null, "X"]] },
      });
      var v2 = makeVersion(2, "V2", {
        keys: ["A"], days: 1, cols: 2,
        schedules: { A: [[null, "X"]] },
      });
      var diff = diffScheduleVersions(v1, v2);
      expect(diff.summary.changedCells).toBe(0);
    });

    test("preserves version labels in result", () => {
      var diff = diffScheduleVersions(
        makeVersion(1, "Alpha"),
        makeVersion(2, "Beta")
      );
      expect(diff.v1Label).toBe("Alpha");
      expect(diff.v2Label).toBe("Beta");
    });
  });

  describe("renderCompareView", () => {
    beforeEach(() => {
      document.body.innerHTML = '<div id="versionCompareView" style="display:none;"></div>';
    });

    test("renders diff into container", () => {
      var v1 = makeVersion(1, "V1");
      var v2 = makeVersion(2, "V2", {
        schedules: { A: [["MATH", "BIO", "CHEM"], ["ENG", "CS", null]] },
      });
      var diff = diffScheduleVersions(v1, v2);
      renderCompareView(diff);

      var container = document.getElementById("versionCompareView");
      expect(container.style.display).toBe("block");
      expect(container.innerHTML).toContain("V1");
      expect(container.innerHTML).toContain("V2");
      expect(container.innerHTML).toContain("vc-cell--changed");
    });

    test("does nothing for null diff", () => {
      renderCompareView(null);
      var container = document.getElementById("versionCompareView");
      expect(container.style.display).toBe("none");
    });
  });

  describe("closeCompareView", () => {
    test("hides and clears the compare view", () => {
      document.body.innerHTML = '<div id="versionCompareView" style="display:block;">content</div>';
      closeCompareView();
      var container = document.getElementById("versionCompareView");
      expect(container.style.display).toBe("none");
      expect(container.innerHTML).toBe("");
    });
  });
});
