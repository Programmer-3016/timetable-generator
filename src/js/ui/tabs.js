/**
 * @module ui/tabs.js
 * @description Tab bar navigation for switching between Inputs, Timetables,
 *   Faculty, and Labs panels. Integrates with the existing view-inputs /
 *   view-timetable CSS class system without touching any generation logic.
 */

(function () {
  "use strict";

  // Section: TAB BAR NAVIGATION

  var TAB_STORAGE_KEY = "tt_active_tab_v1";

  // Display type map: what display value each panel should use when shown
  var DISPLAY_MAP = {
    classInputsPanel: "block",
    timetableWrap: "grid",
    reportPanel: "block",
    facultyPanel: "block",
    labPanelWrap: "block",
    versionPanelWrap: "block",
    globalExport: "flex",
  };

  var TAB_CONFIG = {
    inputs:     { panelShow: ["classInputsPanel"], panelHide: ["timetableWrap", "reportPanel", "facultyPanel", "labPanelWrap", "versionPanelWrap", "globalExport"] },
    timetables: { panelShow: ["timetableWrap", "reportPanel", "globalExport"], panelHide: ["classInputsPanel", "facultyPanel", "labPanelWrap", "versionPanelWrap"] },
    faculty:    { panelShow: ["facultyPanel"],  panelHide: ["classInputsPanel", "timetableWrap", "reportPanel", "labPanelWrap", "versionPanelWrap", "globalExport"] },
    labs:       { panelShow: ["labPanelWrap"],   panelHide: ["classInputsPanel", "timetableWrap", "reportPanel", "facultyPanel", "versionPanelWrap", "globalExport"] },
    versions:   { panelShow: ["versionPanelWrap"], panelHide: ["classInputsPanel", "timetableWrap", "reportPanel", "facultyPanel", "labPanelWrap", "globalExport"] },
  };

  /** Currently active tab name */
  var activeTab = "inputs";

  /**
   * Switch to the given tab. Updates button states, panel visibility, and
   * the legacy view-inputs / view-timetable CSS classes so existing code
   * (skeleton.js, init.js persistence, etc.) continues to work.
   */
  function switchTab(tabName) {
    if (!TAB_CONFIG[tabName]) return;
    activeTab = tabName;

    // -- Update tab button active states --
    var btns = document.querySelectorAll(".tab-nav .tab-btn");
    btns.forEach(function (btn) {
      if (btn.getAttribute("data-tab") === tabName) {
        btn.classList.add("tab-btn--active");
      } else {
        btn.classList.remove("tab-btn--active");
      }
    });

    // -- Show / hide panels --
    var cfg = TAB_CONFIG[tabName];
    cfg.panelShow.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = DISPLAY_MAP[id] || "block";
    });
    cfg.panelHide.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

    // -- Versions tab layout mode --
    var appEl = document.querySelector(".app");
    var controlsEl = document.querySelector(".controls");
    var tabBarEl = document.getElementById("mainTabBar");
    var verSlot = document.getElementById("verTabBarSlot");
    var ttArea = document.querySelector(".timetable-area");

    if (tabName === "versions") {
      if (appEl) appEl.classList.add("app--versions-mode");
      if (controlsEl) controlsEl.style.display = "none";
      if (tabBarEl && verSlot) verSlot.appendChild(tabBarEl);
    } else {
      if (appEl) appEl.classList.remove("app--versions-mode");
      if (controlsEl) controlsEl.style.display = "";
      if (tabBarEl && ttArea && tabBarEl.parentElement !== ttArea) {
        ttArea.insertBefore(tabBarEl, ttArea.firstChild);
      }
    }

    // -- Refresh version panel when switching to versions tab --
    if (tabName === "versions" && typeof renderVersionPanel === "function") {
      renderVersionPanel();
    }

    // -- Keep legacy view class in sync so other code isn't broken --
    var ttArea = document.querySelector(".timetable-area");
    if (ttArea) {
      ttArea.classList.remove("view-inputs", "view-timetable");
      if (tabName === "inputs") {
        ttArea.classList.add("view-inputs");
      } else {
        ttArea.classList.add("view-timetable");
      }
    }

    // -- Persist --
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tabName);
    } catch (_) {
      // Ignore persistence failures and keep the current in-memory tab state.
    }
  }

  /**
   * Enable Faculty and Labs tabs (called after timetable is generated).
   */
  function enablePostGenerateTabs() {
    var tabFaculty = document.getElementById("tabFaculty");
    var tabLabs = document.getElementById("tabLabs");
    var tabVersions = document.getElementById("tabVersions");
    if (tabFaculty) tabFaculty.disabled = false;
    if (tabLabs) tabLabs.disabled = false;
    if (tabVersions) tabVersions.disabled = false;
  }

  /**
   * Get the currently active tab name.
   */
  function getActiveTab() {
    return activeTab;
  }

  // Expose to global scope for use by other modules
  window.switchTab = switchTab;
  window.enablePostGenerateTabs = enablePostGenerateTabs;
  window.getActiveTab = getActiveTab;

  // -- Wire up tab clicks --
  function initTabs() {
    var btns = document.querySelectorAll(".tab-nav .tab-btn");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-tab");
        if (tab && !btn.disabled) {
          switchTab(tab);
        }
      });
    });

    // Restore saved tab (but only "inputs" or "timetables" — Faculty/Labs need generation)
    try {
      var saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === "timetables") {
        switchTab("timetables");
      } else {
        switchTab("inputs");
      }
    } catch (_) {
      // Fall back to the default tab when localStorage is unavailable.
      switchTab("inputs");
    }

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTabs);
  } else {
    initTabs();
  }
})();
