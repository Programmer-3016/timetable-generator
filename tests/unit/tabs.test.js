/**
 * @file tests/unit/tabs.test.js
 * @description Unit tests for ui/tabs.js: tab-bar navigation, panel switching,
 *   legacy CSS class management, and localStorage persistence.
 */

/* ═══════════════════════════════════════════════════════
   Section: TEST HELPERS
═══════════════════════════════════════════════════════ */

/** All panel IDs that tabs.js manages */
const PANEL_IDS = [
  "classInputsPanel",
  "timetableWrap",
  "reportPanel",
  "facultyPanel",
  "labPanelWrap",
  "versionPanelWrap",
  "globalExport",
];

/** Tab names used for tab buttons */
const TAB_NAMES = ["inputs", "timetables", "faculty", "labs", "versions"];

/**
 * Build the DOM structure that tabs.js expects:
 * panels, tab-nav with buttons, .app, .controls, .timetable-area, etc.
 */
function buildTabDOM() {
  // Panels
  PANEL_IDS.forEach(function (id) {
    var el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  });

  // Tab navigation bar
  var tabNav = document.createElement("div");
  tabNav.className = "tab-nav";
  TAB_NAMES.forEach(function (name) {
    var btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.setAttribute("data-tab", name);
    // Give post-gen tabs matching IDs
    if (name === "faculty") btn.id = "tabFaculty";
    if (name === "labs") btn.id = "tabLabs";
    if (name === "versions") btn.id = "tabVersions";
    tabNav.appendChild(btn);
  });

  // timetable-area wraps the tab bar
  var ttArea = document.createElement("div");
  ttArea.className = "timetable-area";
  ttArea.appendChild(tabNav);
  document.body.appendChild(ttArea);

  // .app container
  var app = document.createElement("div");
  app.className = "app";
  document.body.appendChild(app);

  // .controls container
  var controls = document.createElement("div");
  controls.className = "controls";
  document.body.appendChild(controls);

  // mainTabBar (moved between timetable-area and verTabBarSlot)
  var mainTabBar = document.createElement("div");
  mainTabBar.id = "mainTabBar";
  ttArea.appendChild(mainTabBar);

  // verTabBarSlot (versions tab slot)
  var verSlot = document.createElement("div");
  verSlot.id = "verTabBarSlot";
  document.body.appendChild(verSlot);
}

/* ═══════════════════════════════════════════════════════
   Section: switchTab
═══════════════════════════════════════════════════════ */

describe("switchTab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    buildTabDOM();
    // Stub renderVersionPanel so versions tab doesn't blow up
    window.renderVersionPanel = jest.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  /* ─────────────────────────────────────────────────────
     Subsection: PANEL VISIBILITY – inputs tab
  ───────────────────────────────────────────────────── */

  test("switchTab('inputs') shows classInputsPanel and hides all others", () => {
    switchTab("inputs");
    expect(document.getElementById("classInputsPanel").style.display).toBe("block");
    expect(document.getElementById("timetableWrap").style.display).toBe("none");
    expect(document.getElementById("reportPanel").style.display).toBe("none");
    expect(document.getElementById("facultyPanel").style.display).toBe("none");
    expect(document.getElementById("labPanelWrap").style.display).toBe("none");
    expect(document.getElementById("versionPanelWrap").style.display).toBe("none");
    expect(document.getElementById("globalExport").style.display).toBe("none");
  });

  /* ─────────────────────────────────────────────────────
     Subsection: PANEL VISIBILITY – timetables tab
  ───────────────────────────────────────────────────── */

  test("switchTab('timetables') shows timetableWrap, reportPanel, globalExport", () => {
    switchTab("timetables");
    expect(document.getElementById("timetableWrap").style.display).toBe("grid");
    expect(document.getElementById("reportPanel").style.display).toBe("block");
    expect(document.getElementById("globalExport").style.display).toBe("flex");
    expect(document.getElementById("classInputsPanel").style.display).toBe("none");
    expect(document.getElementById("facultyPanel").style.display).toBe("none");
    expect(document.getElementById("labPanelWrap").style.display).toBe("none");
    expect(document.getElementById("versionPanelWrap").style.display).toBe("none");
  });

  /* ─────────────────────────────────────────────────────
     Subsection: PANEL VISIBILITY – faculty tab
  ───────────────────────────────────────────────────── */

  test("switchTab('faculty') shows facultyPanel only", () => {
    switchTab("faculty");
    expect(document.getElementById("facultyPanel").style.display).toBe("block");
    expect(document.getElementById("classInputsPanel").style.display).toBe("none");
    expect(document.getElementById("timetableWrap").style.display).toBe("none");
    expect(document.getElementById("reportPanel").style.display).toBe("none");
    expect(document.getElementById("labPanelWrap").style.display).toBe("none");
    expect(document.getElementById("versionPanelWrap").style.display).toBe("none");
    expect(document.getElementById("globalExport").style.display).toBe("none");
  });

  /* ─────────────────────────────────────────────────────
     Subsection: PANEL VISIBILITY – labs tab
  ───────────────────────────────────────────────────── */

  test("switchTab('labs') shows labPanelWrap only", () => {
    switchTab("labs");
    expect(document.getElementById("labPanelWrap").style.display).toBe("block");
    expect(document.getElementById("classInputsPanel").style.display).toBe("none");
    expect(document.getElementById("timetableWrap").style.display).toBe("none");
    expect(document.getElementById("reportPanel").style.display).toBe("none");
    expect(document.getElementById("facultyPanel").style.display).toBe("none");
    expect(document.getElementById("versionPanelWrap").style.display).toBe("none");
    expect(document.getElementById("globalExport").style.display).toBe("none");
  });

  /* ─────────────────────────────────────────────────────
     Subsection: PANEL VISIBILITY – versions tab
  ───────────────────────────────────────────────────── */

  test("switchTab('versions') shows versionPanelWrap only", () => {
    switchTab("versions");
    expect(document.getElementById("versionPanelWrap").style.display).toBe("block");
    expect(document.getElementById("classInputsPanel").style.display).toBe("none");
    expect(document.getElementById("timetableWrap").style.display).toBe("none");
    expect(document.getElementById("reportPanel").style.display).toBe("none");
    expect(document.getElementById("facultyPanel").style.display).toBe("none");
    expect(document.getElementById("labPanelWrap").style.display).toBe("none");
    expect(document.getElementById("globalExport").style.display).toBe("none");
  });

  /* ─────────────────────────────────────────────────────
     Subsection: INVALID TAB NAME
  ───────────────────────────────────────────────────── */

  test("switchTab with invalid tab name does nothing", () => {
    switchTab("inputs");
    var before = document.getElementById("classInputsPanel").style.display;
    switchTab("nonexistent");
    expect(document.getElementById("classInputsPanel").style.display).toBe(before);
    expect(getActiveTab()).toBe("inputs");
  });

  /* ─────────────────────────────────────────────────────
     Subsection: TAB BUTTON CSS CLASSES
  ───────────────────────────────────────────────────── */

  test("active tab button gets tab-btn--active, others lose it", () => {
    switchTab("faculty");
    var btns = document.querySelectorAll(".tab-nav .tab-btn");
    btns.forEach(function (btn) {
      if (btn.getAttribute("data-tab") === "faculty") {
        expect(btn.classList.contains("tab-btn--active")).toBe(true);
      } else {
        expect(btn.classList.contains("tab-btn--active")).toBe(false);
      }
    });
  });

  test("switching tabs moves active class to new tab button", () => {
    switchTab("inputs");
    switchTab("labs");
    var labsBtn = document.querySelector('[data-tab="labs"]');
    var inputsBtn = document.querySelector('[data-tab="inputs"]');
    expect(labsBtn.classList.contains("tab-btn--active")).toBe(true);
    expect(inputsBtn.classList.contains("tab-btn--active")).toBe(false);
  });

  /* ─────────────────────────────────────────────────────
     Subsection: LOCALSTORAGE PERSISTENCE
  ───────────────────────────────────────────────────── */

  test("switchTab saves tab name to localStorage", () => {
    switchTab("timetables");
    expect(localStorage.getItem("tt_active_tab_v1")).toBe("timetables");
  });

  test("switching to another tab updates localStorage", () => {
    switchTab("inputs");
    switchTab("faculty");
    expect(localStorage.getItem("tt_active_tab_v1")).toBe("faculty");
  });

  /* ─────────────────────────────────────────────────────
     Subsection: LEGACY CSS CLASSES
  ───────────────────────────────────────────────────── */

  test("inputs tab applies view-inputs class to timetable-area", () => {
    switchTab("inputs");
    var ttArea = document.querySelector(".timetable-area");
    expect(ttArea.classList.contains("view-inputs")).toBe(true);
    expect(ttArea.classList.contains("view-timetable")).toBe(false);
  });

  test("non-inputs tab applies view-timetable class to timetable-area", () => {
    switchTab("timetables");
    var ttArea = document.querySelector(".timetable-area");
    expect(ttArea.classList.contains("view-timetable")).toBe(true);
    expect(ttArea.classList.contains("view-inputs")).toBe(false);
  });

  test("switching from timetables to inputs swaps legacy classes", () => {
    switchTab("timetables");
    switchTab("inputs");
    var ttArea = document.querySelector(".timetable-area");
    expect(ttArea.classList.contains("view-inputs")).toBe(true);
    expect(ttArea.classList.contains("view-timetable")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: getActiveTab
═══════════════════════════════════════════════════════ */

describe("getActiveTab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    buildTabDOM();
    window.renderVersionPanel = jest.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  test("returns 'inputs' by default after switching to inputs", () => {
    switchTab("inputs");
    expect(getActiveTab()).toBe("inputs");
  });

  test("returns the name of the most recently activated tab", () => {
    switchTab("timetables");
    expect(getActiveTab()).toBe("timetables");
    switchTab("faculty");
    expect(getActiveTab()).toBe("faculty");
    switchTab("labs");
    expect(getActiveTab()).toBe("labs");
  });

  test("does not change when an invalid tab is requested", () => {
    switchTab("inputs");
    switchTab("bogus");
    expect(getActiveTab()).toBe("inputs");
  });
});

/* ═══════════════════════════════════════════════════════
   Section: enablePostGenerateTabs
═══════════════════════════════════════════════════════ */

describe("enablePostGenerateTabs", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    buildTabDOM();
    // Start with post-gen buttons disabled
    document.getElementById("tabFaculty").disabled = true;
    document.getElementById("tabLabs").disabled = true;
    document.getElementById("tabVersions").disabled = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("removes disabled from tabFaculty, tabLabs, and tabVersions", () => {
    expect(document.getElementById("tabFaculty").disabled).toBe(true);
    expect(document.getElementById("tabLabs").disabled).toBe(true);
    expect(document.getElementById("tabVersions").disabled).toBe(true);

    enablePostGenerateTabs();

    expect(document.getElementById("tabFaculty").disabled).toBe(false);
    expect(document.getElementById("tabLabs").disabled).toBe(false);
    expect(document.getElementById("tabVersions").disabled).toBe(false);
  });

  test("is safe to call when buttons are already enabled", () => {
    document.getElementById("tabFaculty").disabled = false;
    enablePostGenerateTabs();
    expect(document.getElementById("tabFaculty").disabled).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════
   Section: VERSIONS TAB LAYOUT MODE
═══════════════════════════════════════════════════════ */

describe("switchTab versions layout", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    buildTabDOM();
    window.renderVersionPanel = jest.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  test("versions tab adds app--versions-mode class", () => {
    switchTab("versions");
    expect(document.querySelector(".app").classList.contains("app--versions-mode")).toBe(true);
  });

  test("versions tab hides controls", () => {
    switchTab("versions");
    expect(document.querySelector(".controls").style.display).toBe("none");
  });

  test("switching away from versions removes app--versions-mode", () => {
    switchTab("versions");
    switchTab("inputs");
    expect(document.querySelector(".app").classList.contains("app--versions-mode")).toBe(false);
  });

  test("switching away from versions restores controls display", () => {
    switchTab("versions");
    switchTab("inputs");
    expect(document.querySelector(".controls").style.display).toBe("");
  });

  test("versions tab calls renderVersionPanel", () => {
    switchTab("versions");
    expect(window.renderVersionPanel).toHaveBeenCalled();
  });
});
