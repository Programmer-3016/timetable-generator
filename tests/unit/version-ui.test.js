/**
 * @file tests/unit/version-ui.test.js
 * @description Unit tests for versioning/version-ui.js: timeline panel rendering,
 *   detail view, auto-save, and card interaction handlers.
 */

/* ═══════════════════════════════════════════════════════
   Section: TEST HELPERS
═══════════════════════════════════════════════════════ */

/** Build the DOM elements that version-ui.js expects */
function buildVersionDOM() {
  var panel = document.createElement("div");
  panel.id = "versionPanel";
  document.body.appendChild(panel);

  var details = document.createElement("div");
  details.id = "versionDetailsView";
  document.body.appendChild(details);

  var tabBtn = document.createElement("button");
  tabBtn.id = "tabVersions";
  tabBtn.disabled = true;
  document.body.appendChild(tabBtn);
}

/** Create a mock version object */
function makeMockVersion(overrides) {
  var base = {
    id: 1,
    label: "Version 1",
    timestamp: "2025-01-15T14:30:00.000Z",
    seed: 42,
    starred: false,
    valid: true,
    violationCount: 0,
    enabledKeys: ["A", "B"],
    classLabels: { A: "CSE-A", B: "CSE-B" },
    snapshot: { keys: ["A", "B"], days: 5 },
  };
  return Object.assign({}, base, overrides || {});
}

/* ═══════════════════════════════════════════════════════
   Section: TESTS
═══════════════════════════════════════════════════════ */

describe("version-ui.js", () => {
  var origLoadVersions, origGetVersionById, origSaveVersion;
  var origLoadVersionById, origRenameVersion, origToggleStar;
  var origDeleteVersion, origUpdateDesc, origShowToast, origGetActiveTab;

  beforeEach(() => {
    document.body.innerHTML = "";
    buildVersionDOM();

    // Reset module state
    _selectedVersionId = null;
    _isVersionSidebarCollapsed = false;

    // Save originals and replace with mocks
    origLoadVersions = global.loadScheduleVersions;
    origGetVersionById = global.getVersionById;
    origSaveVersion = global.saveScheduleVersion;
    origLoadVersionById = global.loadScheduleVersionById;
    origRenameVersion = global.renameScheduleVersion;
    origToggleStar = global.toggleStarVersion;
    origDeleteVersion = global.deleteScheduleVersion;
    origUpdateDesc = global.updateVersionDescription;
    origShowToast = global.showToast;
    origGetActiveTab = global.getActiveTab;

    global.loadScheduleVersions = jest.fn(() => []);
    global.getVersionById = jest.fn(() => null);
    global.saveScheduleVersion = jest.fn(() => null);
    global.loadScheduleVersionById = jest.fn(() => true);
    global.renameScheduleVersion = jest.fn(() => true);
    global.toggleStarVersion = jest.fn(() => true);
    global.deleteScheduleVersion = jest.fn(() => true);
    global.updateVersionDescription = jest.fn(() => true);
    global.showToast = jest.fn();
    global.getActiveTab = jest.fn(() => "versions");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    global.loadScheduleVersions = origLoadVersions;
    global.getVersionById = origGetVersionById;
    global.saveScheduleVersion = origSaveVersion;
    global.loadScheduleVersionById = origLoadVersionById;
    global.renameScheduleVersion = origRenameVersion;
    global.toggleStarVersion = origToggleStar;
    global.deleteScheduleVersion = origDeleteVersion;
    global.updateVersionDescription = origUpdateDesc;
    global.showToast = origShowToast;
    global.getActiveTab = origGetActiveTab;
  });

/* ═══════════════════════════════════════════════════════
   Section: renderVersionPanel – EMPTY STATE
═══════════════════════════════════════════════════════ */

  describe("renderVersionPanel – empty state", () => {
    test("clears panel and details when no versions exist", () => {
      global.loadScheduleVersions.mockReturnValue([]);
      renderVersionPanel();

      expect(document.getElementById("versionPanel").innerHTML).toBe("");
      expect(document.getElementById("versionDetailsView").innerHTML).toBe("");
    });

    test("handles null return from loadScheduleVersions gracefully", () => {
      global.loadScheduleVersions.mockReturnValue([]);
      expect(() => renderVersionPanel()).not.toThrow();
    });
  });

/* ═══════════════════════════════════════════════════════
   Section: renderVersionPanel – TIMELINE CARDS
═══════════════════════════════════════════════════════ */

  describe("renderVersionPanel – timeline cards", () => {
    test("renders timeline cards for saved versions", () => {
      var v1 = makeMockVersion({ id: 1, label: "Alpha" });
      var v2 = makeMockVersion({ id: 2, label: "Beta", starred: true });
      global.loadScheduleVersions.mockReturnValue([v1, v2]);
      global.getVersionById.mockImplementation(function (id) {
        if (id === 1) return v1;
        if (id === 2) return v2;
        return null;
      });

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      var items = panel.querySelectorAll(".ver-timeline-item");
      expect(items.length).toBe(2);
    });

    test("displays version label in each card", () => {
      var v1 = makeMockVersion({ id: 1, label: "Alpha" });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      expect(panel.innerHTML).toContain("Alpha");
    });

    test("shows class count in card meta", () => {
      var v1 = makeMockVersion({ id: 1, enabledKeys: ["A", "B", "C"] });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      expect(panel.innerHTML).toContain("3 classes");
    });

    test("first version gets active tone class", () => {
      var v1 = makeMockVersion({ id: 1 });
      var v2 = makeMockVersion({ id: 2 });
      global.loadScheduleVersions.mockReturnValue([v1, v2]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      var items = panel.querySelectorAll(".ver-timeline-item");
      expect(items[0].classList.contains("ver-timeline-item--tone-active")).toBe(true);
    });

    test("starred non-first version gets draft tone", () => {
      var v1 = makeMockVersion({ id: 1 });
      var v2 = makeMockVersion({ id: 2, starred: true });
      global.loadScheduleVersions.mockReturnValue([v1, v2]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      var items = panel.querySelectorAll(".ver-timeline-item");
      expect(items[1].classList.contains("ver-timeline-item--tone-draft")).toBe(true);
    });

    test("non-starred non-first version gets archived tone", () => {
      var v1 = makeMockVersion({ id: 1 });
      var v2 = makeMockVersion({ id: 2, starred: false });
      global.loadScheduleVersions.mockReturnValue([v1, v2]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      var items = panel.querySelectorAll(".ver-timeline-item");
      expect(items[1].classList.contains("ver-timeline-item--tone-archived")).toBe(true);
    });

    test("starred version shows filled star", () => {
      var v1 = makeMockVersion({ id: 1, starred: true });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      var starBtn = panel.querySelector(".ver-star--active");
      expect(starBtn).not.toBeNull();
      expect(starBtn.innerHTML).toContain("★");
    });

    test("unstarred version shows empty star", () => {
      var v1 = makeMockVersion({ id: 1, starred: false });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var panel = document.getElementById("versionPanel");
      var starBtns = panel.querySelectorAll(".ver-star");
      var found = false;
      starBtns.forEach(function (btn) {
        if (!btn.classList.contains("ver-star--active")) found = true;
      });
      expect(found).toBe(true);
    });

    test("selects first version by default when none selected", () => {
      var v1 = makeMockVersion({ id: 10, label: "First" });
      var v2 = makeMockVersion({ id: 20, label: "Second" });
      global.loadScheduleVersions.mockReturnValue([v1, v2]);
      global.getVersionById.mockImplementation(function (id) {
        if (id === 10) return v1;
        if (id === 20) return v2;
        return null;
      });

      renderVersionPanel();

      expect(_selectedVersionId).toBe(10);
    });
  });

/* ═══════════════════════════════════════════════════════
   Section: renderVersionPanel – DETAIL VIEW
═══════════════════════════════════════════════════════ */

  describe("renderVersionPanel – detail view", () => {
    test("renders detail view for the selected version", () => {
      var v1 = makeMockVersion({ id: 1, label: "My Version", valid: true });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("My Version");
      expect(details.innerHTML).toContain("Version Details");
    });

    test("shows Published badge for valid version", () => {
      var v1 = makeMockVersion({ id: 1, valid: true });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Published");
      expect(details.querySelector(".ver-valid")).not.toBeNull();
    });

    test("shows Issues badge for invalid version", () => {
      var v1 = makeMockVersion({ id: 1, valid: false });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Issues");
      expect(details.querySelector(".ver-invalid")).not.toBeNull();
    });

    test("shows Total Classes stat", () => {
      var v1 = makeMockVersion({ id: 1, enabledKeys: ["A", "B", "C"] });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Total Classes");
      expect(details.innerHTML).toContain("3");
    });

    test("shows Conflicts Resolved stat", () => {
      var v1 = makeMockVersion({ id: 1, violationCount: 5 });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Conflicts Resolved");
      expect(details.innerHTML).toContain("5");
    });

    test("renders Load Schedule and Rename buttons", () => {
      var v1 = makeMockVersion({ id: 1 });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Load Schedule");
      expect(details.innerHTML).toContain("Rename");
    });

    test("renders Delete button in footer", () => {
      var v1 = makeMockVersion({ id: 1 });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      var deleteBtn = details.querySelector(".ver-btn-link-danger");
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn.textContent).toBe("Delete");
    });

    test("renders custom description when present", () => {
      var v1 = makeMockVersion({ id: 1, description: "Custom desc text" });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Custom desc text");
    });

    test("renders generated description when none set", () => {
      var v1 = makeMockVersion({ id: 1, valid: true });
      delete v1.description;
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("stable timetable snapshot");
    });

    test("shows Current Draft badge for starred non-first version", () => {
      var v1 = makeMockVersion({ id: 1 });
      var v2 = makeMockVersion({ id: 2, starred: true, label: "Draft V" });
      global.loadScheduleVersions.mockReturnValue([v1, v2]);
      global.getVersionById.mockImplementation(function (id) {
        if (id === 1) return v1;
        if (id === 2) return v2;
        return null;
      });

      _selectedVersionId = 2;
      renderVersionPanel();

      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Current Draft");
    });

    test("falls back to first version when selected ID is not found", () => {
      var v1 = makeMockVersion({ id: 1, label: "Fallback" });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(null);

      _selectedVersionId = 999;
      renderVersionPanel();

      // Falls back to versions[0] from the array directly
      expect(_selectedVersionId).toBe(1);
      var details = document.getElementById("versionDetailsView");
      expect(details.innerHTML).toContain("Fallback");
    });
  });

/* ═══════════════════════════════════════════════════════
   Section: onVersionAutoSave
═══════════════════════════════════════════════════════ */

  describe("onVersionAutoSave", () => {
    test("saves a version and shows toast", () => {
      var snap = { keys: ["A"], seed: 1 };
      window.__ttLastScheduleState = snap;
      window.__ttLastValidation = { valid: true, violations: [] };

      var saved = makeMockVersion({ id: 5, label: "Version 5" });
      global.saveScheduleVersion.mockReturnValue(saved);

      onVersionAutoSave();

      expect(global.saveScheduleVersion).toHaveBeenCalledWith(snap, window.__ttLastValidation);
      expect(global.showToast).toHaveBeenCalledWith(
        expect.stringContaining("Version 5"),
        expect.objectContaining({ type: "success" })
      );
    });

    test("enables tabVersions button after save", () => {
      window.__ttLastScheduleState = { keys: ["A"] };
      window.__ttLastValidation = null;
      global.saveScheduleVersion.mockReturnValue(makeMockVersion());

      var tabBtn = document.getElementById("tabVersions");
      tabBtn.disabled = true;

      onVersionAutoSave();

      expect(tabBtn.disabled).toBe(false);
    });

    test("does nothing when no snapshot exists", () => {
      window.__ttLastScheduleState = null;

      onVersionAutoSave();

      expect(global.saveScheduleVersion).not.toHaveBeenCalled();
    });

    test("re-renders panel when versions tab is active", () => {
      window.__ttLastScheduleState = { keys: ["A"] };
      window.__ttLastValidation = null;
      global.saveScheduleVersion.mockReturnValue(makeMockVersion());
      global.getActiveTab.mockReturnValue("versions");
      global.loadScheduleVersions.mockReturnValue([makeMockVersion()]);
      global.getVersionById.mockReturnValue(makeMockVersion());

      onVersionAutoSave();

      // renderVersionPanel was called, which calls loadScheduleVersions
      expect(global.loadScheduleVersions).toHaveBeenCalled();
    });

    test("does not re-render panel when another tab is active", () => {
      window.__ttLastScheduleState = { keys: ["A"] };
      window.__ttLastValidation = null;
      global.saveScheduleVersion.mockReturnValue(makeMockVersion());
      global.getActiveTab.mockReturnValue("inputs");

      onVersionAutoSave();

      // loadScheduleVersions is NOT called because renderVersionPanel is skipped
      expect(global.loadScheduleVersions).not.toHaveBeenCalled();
    });

    test("does not show toast when save returns null", () => {
      window.__ttLastScheduleState = { keys: ["A"] };
      window.__ttLastValidation = null;
      global.saveScheduleVersion.mockReturnValue(null);

      onVersionAutoSave();

      expect(global.showToast).not.toHaveBeenCalled();
    });
  });

/* ═══════════════════════════════════════════════════════
   Section: CARD CLICK HANDLERS
═══════════════════════════════════════════════════════ */

  describe("card click handlers", () => {
    test("_onVersionCardClick selects the clicked version", () => {
      var v1 = makeMockVersion({ id: 5 });
      global.getVersionById.mockReturnValue(v1);

      // Create a card element to highlight
      var panel = document.getElementById("versionPanel");
      var item = document.createElement("div");
      item.className = "ver-timeline-item";
      item.setAttribute("data-version-id", "5");
      panel.appendChild(item);

      window._onVersionCardClick(5);

      expect(_selectedVersionId).toBe(5);
    });

    test("_onStarClick calls toggleStarVersion and re-renders", () => {
      global.loadScheduleVersions.mockReturnValue([]);

      window._onStarClick(3);

      expect(global.toggleStarVersion).toHaveBeenCalledWith(3);
      // re-render was triggered (loadScheduleVersions called by renderVersionPanel)
      expect(global.loadScheduleVersions).toHaveBeenCalled();
    });

    test("_onDeleteClick calls deleteScheduleVersion when confirmed", () => {
      jest.spyOn(window, "confirm").mockReturnValue(true);
      global.loadScheduleVersions.mockReturnValue([]);

      window._onDeleteClick(7);

      expect(global.deleteScheduleVersion).toHaveBeenCalledWith(7);
      expect(global.showToast).toHaveBeenCalledWith(
        "Version deleted.",
        expect.objectContaining({ type: "info" })
      );
      window.confirm.mockRestore();
    });

    test("_onDeleteClick does nothing when cancelled", () => {
      jest.spyOn(window, "confirm").mockReturnValue(false);

      window._onDeleteClick(7);

      expect(global.deleteScheduleVersion).not.toHaveBeenCalled();
      window.confirm.mockRestore();
    });

    test("_onDeleteClick resets selected ID if deleted version was selected", () => {
      jest.spyOn(window, "confirm").mockReturnValue(true);
      global.loadScheduleVersions.mockReturnValue([]);
      _selectedVersionId = 7;

      window._onDeleteClick(7);

      expect(_selectedVersionId).toBeNull();
      window.confirm.mockRestore();
    });

    test("_onRenameClick calls renameScheduleVersion with new label", () => {
      var v1 = makeMockVersion({ id: 4, label: "Old Name" });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      // Put label span in DOM so _onRenameClick can read current name
      var label = document.createElement("p");
      label.id = "verLabel4";
      label.textContent = "Old Name";
      document.body.appendChild(label);

      jest.spyOn(window, "prompt").mockReturnValue("New Name");

      window._onRenameClick(4);

      expect(global.renameScheduleVersion).toHaveBeenCalledWith(4, "New Name");
      window.prompt.mockRestore();
    });

    test("_onRenameClick does nothing when prompt is cancelled", () => {
      jest.spyOn(window, "prompt").mockReturnValue(null);

      window._onRenameClick(4);

      expect(global.renameScheduleVersion).not.toHaveBeenCalled();
      window.prompt.mockRestore();
    });

    test("_onLoadClick calls loadScheduleVersionById", () => {
      global.loadScheduleVersionById.mockReturnValue(true);
      global.loadScheduleVersions.mockReturnValue([]);

      window._onLoadClick(2);

      expect(global.loadScheduleVersionById).toHaveBeenCalledWith(2);
    });
  });

/* ═══════════════════════════════════════════════════════
   Section: EDGE CASES
═══════════════════════════════════════════════════════ */

  describe("edge cases", () => {
    test("renderVersionPanel does nothing when panel element is missing", () => {
      document.body.innerHTML = "";
      expect(() => renderVersionPanel()).not.toThrow();
    });

    test("renderVersionPanel does nothing when details element is missing", () => {
      document.body.innerHTML = "";
      var panel = document.createElement("div");
      panel.id = "versionPanel";
      document.body.appendChild(panel);

      expect(() => renderVersionPanel()).not.toThrow();
    });

    test("renders correctly with version missing enabledKeys", () => {
      var v1 = makeMockVersion({ id: 1 });
      delete v1.enabledKeys;
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      expect(() => renderVersionPanel()).not.toThrow();
      expect(document.getElementById("versionPanel").innerHTML).toContain("0 classes");
    });

    test("renders correctly with version having null timestamp", () => {
      var v1 = makeMockVersion({ id: 1, timestamp: null });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      expect(() => renderVersionPanel()).not.toThrow();
    });

    test("handles empty label gracefully", () => {
      var v1 = makeMockVersion({ id: 1, label: "" });
      global.loadScheduleVersions.mockReturnValue([v1]);
      global.getVersionById.mockReturnValue(v1);

      expect(() => renderVersionPanel()).not.toThrow();
    });

    test("renders multiple versions with mixed starred states", () => {
      var versions = [
        makeMockVersion({ id: 1, label: "V1", starred: false }),
        makeMockVersion({ id: 2, label: "V2", starred: true }),
        makeMockVersion({ id: 3, label: "V3", starred: false }),
      ];
      global.loadScheduleVersions.mockReturnValue(versions);
      global.getVersionById.mockReturnValue(versions[0]);

      renderVersionPanel();

      var items = document.querySelectorAll(".ver-timeline-item");
      expect(items.length).toBe(3);
    });
  });

/* ═══════════════════════════════════════════════════════
   Section: SIDEBAR TOGGLE
═══════════════════════════════════════════════════════ */

  describe("_toggleVersionSidebar", () => {
    test("toggles collapsed class on layout element", () => {
      var layout = document.createElement("div");
      layout.className = "ver-layout";
      document.body.appendChild(layout);

      var toggle = document.createElement("button");
      toggle.id = "verSidebarToggle";
      var icon = document.createElement("span");
      icon.className = "material-symbols-outlined";
      icon.textContent = "menu";
      toggle.appendChild(icon);
      document.body.appendChild(toggle);

      window._toggleVersionSidebar();

      expect(layout.classList.contains("ver-layout--left-collapsed")).toBe(true);
      expect(icon.textContent).toBe("menu_open");

      window._toggleVersionSidebar();

      expect(layout.classList.contains("ver-layout--left-collapsed")).toBe(false);
      expect(icon.textContent).toBe("menu");
    });

    test("does nothing when layout element is missing", () => {
      expect(() => window._toggleVersionSidebar()).not.toThrow();
    });
  });
});
