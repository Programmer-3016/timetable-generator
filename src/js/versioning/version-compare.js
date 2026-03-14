/**
 * @module versioning/version-compare.js
 * @description Compute cell-level diffs between two schedule versions and
 *   render a side-by-side comparison view.
 */

/* exported diffScheduleVersions, renderCompareView, closeCompareView */

/**
 * Compute diff between two version snapshots.
 * Returns per-class, per-day, per-slot diff entries.
 *
 * @param {Object} v1 - First version object (with .snapshot)
 * @param {Object} v2 - Second version object (with .snapshot)
 * @returns {Object} { classes: { [key]: { label, cells: [[{a, b, changed}]] } }, summary }
 */
function diffScheduleVersions(v1, v2) {
  if (!v1 || !v2 || !v1.snapshot || !v2.snapshot) return null;

  var s1 = v1.snapshot;
  var s2 = v2.snapshot;
  var allKeys = {};
  (s1.keys || []).forEach(function (k) { allKeys[k] = true; });
  (s2.keys || []).forEach(function (k) { allKeys[k] = true; });
  var keys = Object.keys(allKeys).sort();

  var days = Math.max(s1.days || 0, s2.days || 0);
  var cols = Math.max(s1.classesPerDay || 0, s2.classesPerDay || 0);
  var lunchIdx = s1.lunchClassIndex != null ? s1.lunchClassIndex : s2.lunchClassIndex;

  var classes = {};
  var totalCells = 0;
  var changedCells = 0;

  for (var ki = 0; ki < keys.length; ki++) {
    var k = keys[ki];
    var sched1 = (s1.schedulesByClass || {})[k] || [];
    var sched2 = (s2.schedulesByClass || {})[k] || [];
    var label = ((v1.classLabels || {})[k]) || ((v2.classLabels || {})[k]) || "Class " + k;

    var cellGrid = [];
    for (var d = 0; d < days; d++) {
      var row1 = sched1[d] || [];
      var row2 = sched2[d] || [];
      var rowDiff = [];
      for (var c = 0; c < cols; c++) {
        var a = row1[c] != null ? String(row1[c]) : "";
        var b = row2[c] != null ? String(row2[c]) : "";
        var changed = a !== b;
        rowDiff.push({ a: a, b: b, changed: changed });
        totalCells++;
        if (changed) changedCells++;
      }
      cellGrid.push(rowDiff);
    }

    classes[k] = { label: label, cells: cellGrid };
  }

  return {
    classes: classes,
    keys: keys,
    days: days,
    cols: cols,
    lunchClassIndex: lunchIdx,
    summary: {
      totalCells: totalCells,
      changedCells: changedCells,
      changePercent: totalCells ? Math.round((changedCells / totalCells) * 100) : 0,
    },
    v1Label: v1.label || "Version A",
    v2Label: v2.label || "Version B",
    v1Valid: v1.valid,
    v2Valid: v2.valid,
  };
}

/**
 * Render the compare view into the versions panel.
 * @param {Object} diff - Result from diffScheduleVersions
 */
function renderCompareView(diff) {
  if (!diff) return;

  var container = document.getElementById("versionCompareView");
  if (!container) return;

  var html = "";

  // Header
  html += '<div class="vc-header">';
  html += '<h4 class="vc-title">Compare: ' + _escHtml(diff.v1Label) + " vs " + _escHtml(diff.v2Label) + "</h4>";
  html += '<button type="button" class="vc-close-btn" onclick="closeCompareView()" title="Close compare view">&times;</button>';
  html += "</div>";

  // Summary
  html += '<div class="vc-summary">';
  html += "<span>" + diff.summary.changedCells + " of " + diff.summary.totalCells + " cells changed";
  html += " (" + diff.summary.changePercent + "%)</span>";
  var v1Badge = diff.v1Valid ? '<span class="vc-badge vc-badge--valid">Valid</span>' : '<span class="vc-badge vc-badge--invalid">Issues</span>';
  var v2Badge = diff.v2Valid ? '<span class="vc-badge vc-badge--valid">Valid</span>' : '<span class="vc-badge vc-badge--invalid">Issues</span>';
  html += " &mdash; " + _escHtml(diff.v1Label) + " " + v1Badge + " &bull; " + _escHtml(diff.v2Label) + " " + v2Badge;
  html += "</div>";

  // Per-class diff tables
  for (var ki = 0; ki < diff.keys.length; ki++) {
    var k = diff.keys[ki];
    var cls = diff.classes[k];
    html += '<div class="vc-class-block">';
    html += '<h5 class="vc-class-title">' + _escHtml(cls.label) + "</h5>";

    // Side-by-side tables
    html += '<div class="vc-side-by-side">';

    // Left table (v1)
    html += '<div class="vc-table-wrap">';
    html += '<div class="vc-table-label">' + _escHtml(diff.v1Label) + "</div>";
    html += "<table class='vc-table'><tbody>";
    for (var d = 0; d < diff.days; d++) {
      html += "<tr>";
      var row = cls.cells[d] || [];
      for (var c = 0; c < diff.cols; c++) {
        var cell = row[c] || { a: "", changed: false };
        var cellClass = cell.changed ? "vc-cell--changed" : "";
        html += '<td class="' + cellClass + '">' + _escHtml(cell.a || "—") + "</td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";

    // Right table (v2)
    html += '<div class="vc-table-wrap">';
    html += '<div class="vc-table-label">' + _escHtml(diff.v2Label) + "</div>";
    html += "<table class='vc-table'><tbody>";
    for (var d2 = 0; d2 < diff.days; d2++) {
      html += "<tr>";
      var row2 = cls.cells[d2] || [];
      for (var c2 = 0; c2 < diff.cols; c2++) {
        var cell2 = row2[c2] || { b: "", changed: false };
        var cellClass2 = cell2.changed ? "vc-cell--changed" : "";
        html += '<td class="' + cellClass2 + '">' + _escHtml(cell2.b || "—") + "</td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";

    html += "</div>"; // vc-side-by-side
    html += "</div>"; // vc-class-block
  }

  container.innerHTML = html;
  container.style.display = "block";
}

/**
 * Close/hide the compare view.
 */
function closeCompareView() {
  var container = document.getElementById("versionCompareView");
  if (container) {
    container.innerHTML = "";
    container.style.display = "none";
  }
}

/** Escape HTML for safe insertion. */
function _escHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str || ""));
  return div.innerHTML;
}
