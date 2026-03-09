/* exported toggleSidebarLayout, buildToolbar */
/**
 * @module ui/sidebar-toolbar.js
 * @description Sidebar collapse/expand controls and teacher highlight toolbar.
 */

// Section: SIDEBAR & TOOLBAR CONTROLS

/** Updates the sidebar toggle button text and title based on current state. */
function refreshSidebarToggleButton() {
  const btn = document.getElementById("sidebarToggleBtn");
  if (!btn) return;
  const collapsed = document.body.classList.contains("fullwide");
  btn.textContent = collapsed ? "Expand" : "Collapse Sidebar";
  btn.title = collapsed
    ? "Show full controls"
    : "Hide controls for full-width timetable";
}

/** Toggles the sidebar between collapsed and expanded states. */
function toggleSidebarLayout() {
  document.body.classList.toggle("fullwide");
  refreshSidebarToggleButton();
}

// Section: CLASS FILTER

let gClassFilterQuery = "";

/**
 * Extracts the class key (e.g. "A") from a block element ID.
 * @param {string} blockId - DOM element ID (e.g. "classABlock").
 * @returns {string} The class key, or empty string.
 */
function extractClassKeyFromBlock(blockId) {
  const m = String(blockId || "").match(/^class([A-Z]{1,2})Block$/);
  return m ? m[1] : "";
}

/**
 * Filters visible class blocks by name/key matching a query string.
 * @param {string} [query=""] - Filter text to match against class labels.
 */
function applyClassNameFilter(query = "") {
  gClassFilterQuery = String(query || "");
  const needle = gClassFilterQuery.trim().toLowerCase();
  const wrap = document.getElementById("timetableWrap");
  if (!wrap) return;
  const enabledSet = new Set(gEnabledKeys || []);
  let visibleCount = 0;

  // Select direct children of timetableWrap (.class-grid-cell wrappers)
  Array.from(wrap.children).forEach((child) => {
    const key = extractClassKeyFromBlock(child.id);
    if (!key || !enabledSet.has(key)) {
      // Don't hide unknown children (reportPanel, etc.)
      if (child.id && /^class[A-Z]{1,2}Block$/.test(child.id)) {
        child.style.display = "none";
      }
      return;
    }
    const label = (gClassLabels && gClassLabels[key]) || "";
    const searchText = `${label} ${key}`.toLowerCase();
    const matches = !needle || searchText.includes(needle);
    child.style.display = matches ? "" : "none";
    if (matches) visibleCount++;
  });

  const hint = document.getElementById("classFilterHint");
  if (!hint) return;
  if (!needle) {
    hint.textContent = "";
    hint.style.display = "none";
    return;
  }
  hint.style.display = "inline";
  hint.textContent = visibleCount ?
    `${visibleCount} class${visibleCount === 1 ? "" : "es"} shown` :
    "No class match";
}

/**
 * Builds the teacher highlight toolbar and class filter controls.
 */
function buildToolbar() {
  const toolbar = document.getElementById("ttToolbar");
  if (!toolbar) return;
  const teachers = Object.keys(aggregateStats)
    .map((k) => aggregateStats[k]?.display || k)
    .filter((t) => t && t.trim().length);
  const hasClassBlocks = !!(gEnabledKeys && gEnabledKeys.length);

  if (teachers.length || hasClassBlocks) {
    const options = ['<option value="">— Select Teacher —</option>']
      .concat(teachers.map((t) => `<option value="${t}">${t}</option>`))
      .join("");
    toolbar.innerHTML = `
      ${
        teachers.length ?
        `<div class="toolbar-group">
          <label for="teacherFilter">Highlight by teacher:</label>
          <select id="teacherFilter">${options}</select>
          <button id="clearHighlightBtn" type="button">Clear</button>
        </div>` :
        ""
      }
    `;
    toolbar.style.display = "flex";

    const teacherFilter = document.getElementById("teacherFilter");
    if (teacherFilter) {
      teacherFilter.addEventListener("change", (e) => {
        const val = e.target.value;
        if (!val) {
          clearHighlight();
          return;
        }
        highlightByTeacher(val);
      });
    }
    const clearHighlightBtn = document.getElementById("clearHighlightBtn");
    if (clearHighlightBtn) {
      clearHighlightBtn.addEventListener("click", () => {
        const sel = document.getElementById("teacherFilter");
        if (sel) sel.value = "";
        clearHighlight();
      });
    }

    const classFilterInput = document.getElementById("classFilterInput");
    if (classFilterInput) {
      classFilterInput.value = gClassFilterQuery;
      classFilterInput.addEventListener("input", (e) => {
        applyClassNameFilter(e.target.value);
      });
    }
    const clearClassFilterBtn = document.getElementById("clearClassFilterBtn");
    if (clearClassFilterBtn) {
      clearClassFilterBtn.addEventListener("click", () => {
        const input = document.getElementById("classFilterInput");
        if (input) input.value = "";
        applyClassNameFilter("");
      });
    }

    refreshSidebarToggleButton();
  } else {
    toolbar.style.display = "none";
    toolbar.innerHTML = "";
    refreshSidebarToggleButton();
  }
}

refreshSidebarToggleButton();
