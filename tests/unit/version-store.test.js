/**
 * @file tests/unit/version-store.test.js
 * @description Unit tests for versioning/version-store.js
 */

// Load the module
const fs = require("fs");
const path = require("path");
const storeSrc = fs.readFileSync(
  path.join(__dirname, "../../src/js/versioning/version-store.js"),
  "utf-8"
);

// Mock localStorage
let mockStorage = {};
const localStorageMock = {
  getItem: jest.fn((key) => mockStorage[key] || null),
  setItem: jest.fn((key, val) => { mockStorage[key] = val; }),
  removeItem: jest.fn((key) => { delete mockStorage[key]; }),
  clear: jest.fn(() => { mockStorage = {}; }),
};
Object.defineProperty(global, "localStorage", { value: localStorageMock, writable: true });

// Mock globals used by the module
global.showToast = jest.fn();
global.gClassLabels = { A: "CSE-A", B: "CSE-B" };
global.gSchedules = {};
global.gEnabledKeys = [];
global.gTeacherForShort = {};
global.gSubjectByShort = {};
global.gFillerShortsByClass = {};
global.gWeeklyQuotaByClass = {};
global.schedulerIsFullyValid = jest.fn(() => ({ valid: true, violations: [] }));
global.schedulerRenderClassToDOM = jest.fn();
global.buildAndRenderReport = jest.fn();
global.buildFacultyPanel = jest.fn();
global.renderLabTimetables = jest.fn();
global.enablePostGenerateTabs = jest.fn();
global.switchTab = jest.fn();

// Load the source
eval(storeSrc);

// Helper: create a mock snapshot
function mockSnapshot(seed) {
  return {
    seed: seed || 42,
    keys: ["A", "B"],
    days: 5,
    classesPerDay: 7,
    lunchClassIndex: 4,
    schedulesByClass: {
      A: [["MATH", "PHY", "CHEM", null, null, "ENG", "CS"]],
      B: [["ENG", "CS", "MATH", null, null, "PHY", "CHEM"]],
    },
    assignedTeacher: {},
    labNumberAssigned: {},
    teacherForShortByClass: {},
    weeklyQuotaByClass: {},
  };
}

function mockValidation(valid) {
  return { valid: !!valid, violations: valid ? [] : ["some issue"] };
}

describe("version-store.js", () => {
  beforeEach(() => {
    mockStorage = {};
    jest.clearAllMocks();
  });

  describe("loadScheduleVersions", () => {
    test("returns empty array when no data stored", () => {
      expect(loadScheduleVersions()).toEqual([]);
    });

    test("returns empty array for invalid JSON", () => {
      mockStorage[VERSION_STORAGE_KEY] = "not-json";
      expect(loadScheduleVersions()).toEqual([]);
    });

    test("returns empty array for non-array JSON", () => {
      mockStorage[VERSION_STORAGE_KEY] = '{"foo": 1}';
      expect(loadScheduleVersions()).toEqual([]);
    });

    test("returns stored versions", () => {
      mockStorage[VERSION_STORAGE_KEY] = JSON.stringify([{ id: 1, label: "V1" }]);
      var result = loadScheduleVersions();
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("V1");
    });
  });

  describe("saveScheduleVersion", () => {
    test("saves a version with correct fields", () => {
      var snap = mockSnapshot(123);
      var val = mockValidation(true);
      var saved = saveScheduleVersion(snap, val, "My Version");

      expect(saved).not.toBeNull();
      expect(saved.id).toBe(1);
      expect(saved.label).toBe("My Version");
      expect(saved.seed).toBe(123);
      expect(saved.starred).toBe(false);
      expect(saved.valid).toBe(true);
      expect(saved.violationCount).toBe(0);
      expect(saved.enabledKeys).toEqual(["A", "B"]);
      expect(saved.snapshot.days).toBe(5);
    });

    test("auto-generates label if not provided", () => {
      var saved = saveScheduleVersion(mockSnapshot(), mockValidation(true));
      expect(saved.label).toBe("Version 1");
    });

    test("returns null for null snapshot", () => {
      expect(saveScheduleVersion(null, null)).toBeNull();
    });

    test("increments ID for subsequent saves", () => {
      saveScheduleVersion(mockSnapshot(1), mockValidation(true));
      var second = saveScheduleVersion(mockSnapshot(2), mockValidation(true));
      expect(second.id).toBe(2);
    });

    test("newest version is first in array", () => {
      saveScheduleVersion(mockSnapshot(1), mockValidation(true), "First");
      saveScheduleVersion(mockSnapshot(2), mockValidation(true), "Second");
      var versions = loadScheduleVersions();
      expect(versions[0].label).toBe("Second");
      expect(versions[1].label).toBe("First");
    });

    test("stores invalid validation result", () => {
      var saved = saveScheduleVersion(mockSnapshot(), mockValidation(false));
      expect(saved.valid).toBe(false);
      expect(saved.violationCount).toBe(1);
    });

    test("prunes oldest non-starred when exceeding MAX_VERSIONS", () => {
      for (var i = 0; i < MAX_VERSIONS + 3; i++) {
        saveScheduleVersion(mockSnapshot(i), mockValidation(true));
      }
      var versions = loadScheduleVersions();
      expect(versions.length).toBe(MAX_VERSIONS);
    });

    test("prune preserves starred versions", () => {
      for (var i = 0; i < MAX_VERSIONS; i++) {
        saveScheduleVersion(mockSnapshot(i), mockValidation(true));
      }
      // Star the oldest
      var versions = loadScheduleVersions();
      var oldestId = versions[versions.length - 1].id;
      toggleStarVersion(oldestId);

      // Add more — starred one should survive
      saveScheduleVersion(mockSnapshot(99), mockValidation(true));
      saveScheduleVersion(mockSnapshot(100), mockValidation(true));
      saveScheduleVersion(mockSnapshot(101), mockValidation(true));

      versions = loadScheduleVersions();
      var starredStillExists = versions.some(function (v) { return v.id === oldestId; });
      expect(starredStillExists).toBe(true);
    });

    test("deep-copies snapshot to prevent mutation", () => {
      var snap = mockSnapshot();
      var saved = saveScheduleVersion(snap, mockValidation(true));
      snap.days = 999;
      var stored = loadScheduleVersions()[0];
      expect(stored.snapshot.days).toBe(5);
    });
  });

  describe("deleteScheduleVersion", () => {
    test("deletes existing version", () => {
      saveScheduleVersion(mockSnapshot(), mockValidation(true));
      var versions = loadScheduleVersions();
      expect(deleteScheduleVersion(versions[0].id)).toBe(true);
      expect(loadScheduleVersions()).toHaveLength(0);
    });

    test("returns false for non-existent ID", () => {
      expect(deleteScheduleVersion(999)).toBe(false);
    });
  });

  describe("renameScheduleVersion", () => {
    test("renames existing version", () => {
      var saved = saveScheduleVersion(mockSnapshot(), mockValidation(true));
      expect(renameScheduleVersion(saved.id, "New Name")).toBe(true);
      var v = getVersionById(saved.id);
      expect(v.label).toBe("New Name");
    });

    test("returns false for non-existent ID", () => {
      expect(renameScheduleVersion(999, "X")).toBe(false);
    });

    test("ignores empty new label", () => {
      var saved = saveScheduleVersion(mockSnapshot(), mockValidation(true), "Original");
      renameScheduleVersion(saved.id, "   ");
      expect(getVersionById(saved.id).label).toBe("Original");
    });
  });

  describe("toggleStarVersion", () => {
    test("toggles star on", () => {
      var saved = saveScheduleVersion(mockSnapshot(), mockValidation(true));
      var result = toggleStarVersion(saved.id);
      expect(result).toBe(true);
      expect(getVersionById(saved.id).starred).toBe(true);
    });

    test("toggles star off", () => {
      var saved = saveScheduleVersion(mockSnapshot(), mockValidation(true));
      toggleStarVersion(saved.id);
      var result = toggleStarVersion(saved.id);
      expect(result).toBe(false);
    });

    test("returns null for non-existent ID", () => {
      expect(toggleStarVersion(999)).toBeNull();
    });
  });

  describe("getVersionById", () => {
    test("returns version by ID", () => {
      var saved = saveScheduleVersion(mockSnapshot(), mockValidation(true), "Find Me");
      var found = getVersionById(saved.id);
      expect(found.label).toBe("Find Me");
    });

    test("returns null for unknown ID", () => {
      expect(getVersionById(999)).toBeNull();
    });
  });

  describe("loadScheduleVersionById", () => {
    test("restores globals from version", () => {
      var snap = mockSnapshot(42);
      snap.schedulesByClass = { A: [["MATH"]], B: [["PHY"]] };
      saveScheduleVersion(snap, mockValidation(true));

      var versions = loadScheduleVersions();
      var ok = loadScheduleVersionById(versions[0].id);
      expect(ok).toBe(true);
      expect(gSchedules).toEqual(snap.schedulesByClass);
      expect(gEnabledKeys).toEqual(["A", "B"]);
    });

    test("returns false for non-existent ID", () => {
      expect(loadScheduleVersionById(999)).toBe(false);
    });

    test("calls re-render functions", () => {
      saveScheduleVersion(mockSnapshot(), mockValidation(true));
      var versions = loadScheduleVersions();
      loadScheduleVersionById(versions[0].id);
      expect(buildAndRenderReport).toHaveBeenCalled();
      expect(buildFacultyPanel).toHaveBeenCalled();
      expect(renderLabTimetables).toHaveBeenCalled();
    });

    test("shows success toast", () => {
      saveScheduleVersion(mockSnapshot(), mockValidation(true), "Loaded V");
      var versions = loadScheduleVersions();
      loadScheduleVersionById(versions[0].id);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("Loaded V"),
        expect.objectContaining({ type: "success" })
      );
    });

    test("switches to timetables tab", () => {
      saveScheduleVersion(mockSnapshot(), mockValidation(true));
      var versions = loadScheduleVersions();
      loadScheduleVersionById(versions[0].id);
      expect(switchTab).toHaveBeenCalledWith("timetables");
    });
  });

  describe("constants", () => {
    test("VERSION_STORAGE_KEY is defined", () => {
      expect(VERSION_STORAGE_KEY).toBe("tt_schedule_versions_v1");
    });

    test("MAX_VERSIONS is 10", () => {
      expect(MAX_VERSIONS).toBe(10);
    });
  });
});
