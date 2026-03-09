/**
 * @module ui/skeleton.js
 * @description Skeleton loading shim — wraps generateTimetable() so that
 *   shimmer placeholder rows appear in every class-block *before* the heavy
 *   scheduling computation runs.  All actual generation logic is untouched.
 */

(function () {
  "use strict";
  // Section: SKELETON LOADING SHIM
  // ─── Build skeleton HTML ────────────────────────────────────────────────────

  /**
   * Returns an HTML string for a shimmer skeleton that mimics the real
   * timetable table (N columns, M days).
   * @param {number} cols  Number of period columns (default 8)
   * @param {number} rows  Number of day rows (default 5)
   */
  function buildSkeletonHTML(cols, rows) {
    // More natural varied bar widths for subjects
    var widths = [40, 55, 35, 60, 45, 50, 38, 48];

    var thead = "<thead><tr><th><span class='skeleton-bar' style='width:30px; margin-bottom: 2px'></span></th>";
    for (var c = 0; c < cols; c++) {
      thead += "<th><span class='skeleton-bar' style='width:" + widths[c % widths.length] + "px; margin-bottom: 4px'></span><span class='skeleton-bar' style='width:24px; opacity:0.35; height: 4px'></span></th>";
    }
    thead += "</tr></thead>";

    var tbody = "<tbody>";
    for (var r = 0; r < rows; r++) {
      tbody += "<tr><td><span class='skeleton-bar' style='width:45%; margin-bottom: 4px'></span></td>";
      for (var cc = 0; cc < cols; cc++) {
        var w = widths[(r * cols + cc) % widths.length];
        var isLab = (r + cc) % 7 === 0; // Randomly assign a 'lab' double-cell look
        if (isLab) {
          tbody += "<td><span class='skeleton-bar' style='width:75%; margin-bottom: 6px'></span><span class='skeleton-bar' style='width:40%; opacity: 0.6'></span></td>";
        } else {
          tbody += "<td><span class='skeleton-bar' style='width:" + w + "%'></span></td>";
        }
      }
      tbody += "</tr>";
    }
    tbody += "</tbody>";

    return (
      "<div class='skeleton-wrap'>" +
        "<span class='skeleton-title-bar'></span>" +
        "<table class='skeleton-table'>" + thead + tbody + "</table>" +
        "<div class='skeleton-generating-label'>Optimizing Schedule System…</div>" +
      "</div>"
    );
  }

  // ─── Show / hide helpers ────────────────────────────────────────────────────

  var SKELETON_CLASS = "tt-skeleton-active";

  /**
   * Inject skeletons into every visible class-block's timetable div.
   * Also makes sure the timetable area switches to the timetable view first
   * so the skeleton is actually visible.
   * @returns {string[]} Array of element IDs that received a skeleton.
   */
  function showSkeletons() {
    var classCount = Math.min(
      (typeof CLASS_KEYS !== "undefined" ? CLASS_KEYS.length : 50),
      Math.max(1, parseInt((document.getElementById("classCount") || {}).value || "1", 10))
    );

    // Guess periods & days for a realistic skeleton size
    var cols = Math.max(1, parseInt((document.getElementById("slots") || {}).value || "7", 10));
    var rows = Math.max(1, parseInt((document.getElementById("days") || {}).value || "5", 10));
    var skeletonHTML = buildSkeletonHTML(cols, rows);

    var injected = [];
    var keys = typeof CLASS_KEYS !== "undefined" ? CLASS_KEYS : [];

    for (var i = 0; i < classCount && i < keys.length; i++) {
      var k = keys[i];
      var block = document.getElementById("class" + k + "Block");
      var tDiv  = document.getElementById("timetable" + k);

      // Make the block visible so the skeleton shows
      if (block) block.style.display = "";

      if (tDiv) {
        tDiv.innerHTML = skeletonHTML;
        tDiv.classList.add(SKELETON_CLASS);
        injected.push("timetable" + k);
      }
    }

    // ── Faculty panel skeleton ──────────────────────────────────────────────
    var facultyTT = document.getElementById("facultyTT");
    if (facultyTT) {
      facultyTT.innerHTML = buildSkeletonHTML(cols, rows);
      facultyTT.classList.add(SKELETON_CLASS);
      injected.push("facultyTT");
    }

    // ── Lab panel skeleton (one skeleton per lab room) ─────────────────────
    var labPanel = document.getElementById("labPanel");
    var labCountEl = document.getElementById("labCount");
    var labRooms = Math.max(1, parseInt((labCountEl || {}).value || "3", 10));
    if (labPanel) {
      var labHTML = "";
      for (var l = 0; l < labRooms; l++) {
        labHTML += buildSkeletonHTML(cols, rows);
      }
      labPanel.innerHTML = labHTML;
      labPanel.classList.add(SKELETON_CLASS);
      injected.push("labPanel");
    }

    // Switch view to timetable area so skeletons are on-screen
    try {
      if (typeof switchTab === "function") {
        switchTab("timetables");
      } else {
        var ttArea = document.querySelector(".timetable-area");
        if (ttArea) {
          ttArea.classList.add("view-timetable");
          ttArea.classList.remove("view-inputs");
        }
      }
      // Enable post-generate tabs
      if (typeof enablePostGenerateTabs === "function") {
        enablePostGenerateTabs();
      }
    } catch (_) {}

    return injected;
  }

  /**
   * Smoothly fade out the shimmer skeletons, then remove the skeleton class.
   * The real timetable content has already been written by the time this runs.
   * @param {string[]} ids
   */
  function clearSkeletons(ids) {
    (ids || []).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;

      // Find the skeleton-wrap inside and apply fade-out animation
      var wrap = el.querySelector(".skeleton-wrap");
      if (wrap) {
        wrap.classList.add("skeleton-fade-out");
        // After animation completes, remove the skeleton class
        setTimeout(function () {
          el.classList.remove(SKELETON_CLASS);
        }, 450); // Matches the CSS animation duration
      } else {
        // Fallback: just remove immediately
        el.classList.remove(SKELETON_CLASS);
      }
    });
  }

  // ─── Wrap generateTimetable ──────────────────────────────────────────────────

  /**
   * Wait until generateTimetable is defined (it's in generate.js which loads
   * before this file) then wrap it with the skeleton logic.
   */
  function installSkeleton() {
    var _original = window.generateTimetable;
    if (typeof _original !== "function") {
      // generate.js should already be loaded — fallback: no-op
      return;
    }

    window.generateTimetable = function generateTimetableWithSkeleton(options) {
      options = options || {};

      // __runImmediate is the internal recursive flag used by generate.js
      // for large class counts.  When it's set we skip the skeleton shim so
      // we don't double-show or conflict.
      if (options.__runImmediate) {
        return _original.call(this, options);
      }

      // 1. Inject skeleton rows immediately (synchronous — browser will paint
      //    on the next animation frame before our setTimeout fires).
      var injectedIds = showSkeletons();

      // 2. Yield to the browser so skeletons render, then wait a minimum
      //    time so the shimmer effect is actually visible before heavy
      //    computation replaces the content.
      var SKELETON_MIN_MS = 800;
      var startTime = Date.now();

      requestAnimationFrame(function () {
        setTimeout(function () {
          var elapsed = Date.now() - startTime;
          var remaining = Math.max(0, SKELETON_MIN_MS - elapsed);

          setTimeout(function () {
            try {
              _original.call(window, options);
            } finally {
              clearSkeletons(injectedIds);
            }
          }, remaining);
        }, 0);
      });
    };
  }

  // generate.js is guaranteed to load before skeleton.js (see HTML script order),
  // so DOMContentLoaded is fine here.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installSkeleton);
  } else {
    installSkeleton();
  }

})();
