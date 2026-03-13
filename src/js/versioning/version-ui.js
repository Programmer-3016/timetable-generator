/**
 * @module versioning/version-ui.js
 * @description Render the Versions tab panel — list saved versions with
 *   load, rename, star, delete, and compare actions.
 */

/* exported renderVersionPanel, onVersionAutoSave */

/**
 * Render/refresh the version list inside the Versions tab panel.
 */
function renderVersionPanel() {
  var panel = document.getElementById("versionPanel");
  if (!panel) return;

  var versions = loadScheduleVersions();

  if (!versions.length) {
    panel.innerHTML =
      '<div class="empty-state">' +
      '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/>' +
      "</svg>" +
      '<p class="empty-state-title">No saved versions</p>' +
      '<p class="empty-state-text">Generate a timetable to automatically save a version here.</p>' +
      "</div>";
    return;
  }

  var html = "";

  // Compare bar
  html += '<div class="ver-compare-bar" id="verCompareBar">';
  html += '<span class="ver-compare-hint">Select 2 versions to compare</span>';
  html += '<button type="button" class="secondary ver-compare-btn" id="verCompareBtn" disabled onclick="_onCompareClick()">Compare</button>';
  html += "</div>";

  // Version cards
  html += '<div class="ver-list">';
  for (var i = 0; i < versions.length; i++) {
    var v = versions[i];
    var ts = _formatTimestamp(v.timestamp);
    var validClass = v.valid ? "ver-valid" : "ver-invalid";
    var validLabel = v.valid ? "Valid" : "Issues";
    var starClass = v.starred ? "ver-star--active" : "";
    var starTitle = v.starred ? "Unstar" : "Star";

    html += '<div class="ver-card" data-version-id="' + v.id + '">';

    // Compare checkbox
    html += '<input type="checkbox" class="ver-compare-check" data-vid="' + v.id + '" onchange="_onCompareCheckChange()" title="Select for compare"/>';

    // Star
    html += '<button type="button" class="ver-star ' + starClass + '" onclick="_onStarClick(' + v.id + ')" title="' + starTitle + '">';
    html += v.starred ? "&#9733;" : "&#9734;";
    html += "</button>";

    // Info
    html += '<div class="ver-info">';
    html += '<span class="ver-label" id="verLabel' + v.id + '">' + _escVerHtml(v.label) + "</span>";
    html += '<span class="ver-meta">' + ts;
    if (v.seed != null) html += " &bull; seed " + v.seed;
    html += " &bull; " + (v.enabledKeys || []).length + " classes";
    html += '</span>';
    html += "</div>";

    // Badge
    html += '<span class="ver-badge ' + validClass + '">' + validLabel + "</span>";

    // Actions
    html += '<div class="ver-actions">';
    html += '<button type="button" class="ver-action-btn" onclick="_onLoadClick(' + v.id + ')" title="Load this version">Load</button>';
    html += '<button type="button" class="ver-action-btn" onclick="_onRenameClick(' + v.id + ')" title="Rename">Rename</button>';
    html += '<button type="button" class="ver-action-btn ver-action-btn--danger" onclick="_onDeleteClick(' + v.id + ')" title="Delete">Delete</button>';
    html += "</div>";

    html += "</div>"; // ver-card
  }
  html += "</div>"; // ver-list

  // Compare view container
  html += '<div id="versionCompareView" style="display:none;"></div>';

  panel.innerHTML = html;
}

// -- Event handlers (attached to window for onclick access) --

function _onLoadClick(id) {
  var ok = loadScheduleVersionById(id);
  if (ok && typeof renderVersionPanel === "function") {
    // Slight delay so user sees the toast before tab switch
    setTimeout(function () { renderVersionPanel(); }, 200);
  }
}

function _onRenameClick(id) {
  var labelSpan = document.getElementById("verLabel" + id);
  var current = labelSpan ? labelSpan.textContent : "";
  var newLabel = prompt("Rename version:", current);
  if (newLabel != null && newLabel.trim()) {
    renameScheduleVersion(id, newLabel.trim());
    renderVersionPanel();
  }
}

function _onStarClick(id) {
  toggleStarVersion(id);
  renderVersionPanel();
}

function _onDeleteClick(id) {
  if (!confirm("Delete this version?")) return;
  deleteScheduleVersion(id);
  renderVersionPanel();
  if (typeof showToast === "function") {
    showToast("Version deleted.", { type: "info", duration: 2000 });
  }
}

function _onCompareCheckChange() {
  var checks = document.querySelectorAll(".ver-compare-check:checked");
  var btn = document.getElementById("verCompareBtn");
  if (btn) btn.disabled = checks.length !== 2;
}

function _onCompareClick() {
  var checks = document.querySelectorAll(".ver-compare-check:checked");
  if (checks.length !== 2) return;
  var id1 = parseInt(checks[0].getAttribute("data-vid"), 10);
  var id2 = parseInt(checks[1].getAttribute("data-vid"), 10);
  var v1 = getVersionById(id1);
  var v2 = getVersionById(id2);
  if (!v1 || !v2) return;
  var diff = diffScheduleVersions(v1, v2);
  if (diff) renderCompareView(diff);
}

/**
 * Auto-save hook: call after generation to save the current state.
 * Shows a toast and refreshes the version panel if visible.
 */
function onVersionAutoSave() {
  var snapshot = (typeof window !== "undefined") ? window.__ttLastScheduleState : null;
  var validation = (typeof window !== "undefined") ? window.__ttLastValidation : null;
  if (!snapshot) return;

  var saved = saveScheduleVersion(snapshot, validation);
  if (saved && typeof showToast === "function") {
    showToast('Version "' + saved.label + '" saved.', { type: "success", duration: 2500 });
  }

  // Enable the Versions tab after first generation
  var tabVersions = document.getElementById("tabVersions");
  if (tabVersions) tabVersions.disabled = false;

  // Refresh panel if visible
  if (typeof getActiveTab === "function" && getActiveTab() === "versions") {
    renderVersionPanel();
  }
}

/** Format ISO timestamp to short readable format. */
function _formatTimestamp(isoStr) {
  if (!isoStr) return "";
  try {
    var d = new Date(isoStr);
    var day = String(d.getDate()).padStart(2, "0");
    var mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    var hr = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return day + " " + mon + " " + hr + ":" + min;
  } catch (_) {
    return isoStr;
  }
}

/** Escape HTML for safe insertion. */
function _escVerHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str || ""));
  return div.innerHTML;
}

// Expose internal handlers to global scope for inline onclick
window._onLoadClick = _onLoadClick;
window._onRenameClick = _onRenameClick;
window._onStarClick = _onStarClick;
window._onDeleteClick = _onDeleteClick;
window._onCompareCheckChange = _onCompareCheckChange;
window._onCompareClick = _onCompareClick;
