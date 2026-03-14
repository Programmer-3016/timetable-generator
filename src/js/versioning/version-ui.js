/**
 * @module versioning/version-ui.js
 * @description Render the Versions tab panel in split timeline/details layout.
 */

/* exported renderVersionPanel, onVersionAutoSave */

var _selectedVersionId = null;
var _isVersionSidebarCollapsed = false;

function renderVersionPanel() {
  var panel = document.getElementById("versionPanel");
  var details = document.getElementById("versionDetailsView");
  if (!panel || !details) return;

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
    _renderVersionDetails(null);
    return;
  }

  var html = "";
  html += '<div class="ver-left-section-head">';
  html += '<h3 class="ver-left-section-title">Version History</h3>';
  html += '<p class="ver-left-section-subtitle">Select a version to view details, compare, or delete.</p>';
  html += '</div>';
  html += '<div class="ver-compare-bar" id="verCompareBar">';
  html += '<span class="ver-compare-hint">Select versions to compare or delete</span>';
  html += '<button type="button" class="ver-compare-btn" id="verCompareBtn" disabled onclick="_onCompareClick()">Compare</button>';
  html += '<button type="button" class="ver-bulk-delete-btn" id="verBulkDeleteBtn" disabled onclick="_onBulkDeleteClick()"><span class="material-symbols-outlined" style="font-size:14px">delete</span> Delete</button>';
  html += "</div>";

  html += '<div class="ver-timeline-list">';

  for (var i = 0; i < versions.length; i++) {
    var v = versions[i];
    var toneClass = _timelineToneClass(v, i);
    var toneLabel = _timelineToneLabel(v, i);

    html += '<div class="ver-timeline-item ver-timeline-item--tone-' + _timelineToneKey(v, i) + '' + (_selectedVersionId === v.id ? ' ver-timeline-item--active' : '') + '" data-version-id="' + v.id + '" onclick="_onVersionCardClick(' + v.id + ')">';
    html += '<div class="ver-node ' + toneClass + '">';
    html += '<span class="material-symbols-outlined">' + _timelineToneIcon(v, i) + '</span>';
    html += '</div>';

    html += '<div class="ver-timeline-card">';
    html += '<div class="ver-timeline-top">';
    html += '<span class="ver-timeline-state ' + toneClass + '">' + toneLabel + '</span>';
    html += '<div class="ver-inline-controls">';
    html += '<input type="checkbox" class="ver-compare-check" data-vid="' + v.id + '" onchange="_onCompareCheckChange()" onclick="event.stopPropagation()" title="Select for compare"/>';
    html += '<button type="button" class="ver-star ' + (v.starred ? 'ver-star--active' : '') + '" onclick="event.stopPropagation();_onStarClick(' + v.id + ')" title="' + (v.starred ? 'Unstar' : 'Star') + '">';
    html += v.starred ? '&#9733;' : '&#9734;';
    html += '</button>';
    html += '</div>';
    html += '</div>';

    html += '<p class="ver-timeline-name" id="verLabel' + v.id + '">' + _escVerHtml(v.label) + '</p>';
    html += '<p class="ver-timeline-meta">' + _formatTimestamp(v.timestamp) + ' • ' + (v.enabledKeys || []).length + ' classes</p>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  panel.innerHTML = html;

  var selected = getVersionById(_selectedVersionId);
  if (!selected) {
    selected = versions[0];
    _selectedVersionId = selected ? selected.id : null;
  }

  _highlightSelectedTimelineCard();
  _renderVersionDetails(selected);
}

function _onVersionCardClick(id) {
  _selectedVersionId = id;
  _highlightSelectedTimelineCard();
  _renderVersionDetails(getVersionById(id));
}

function _highlightSelectedTimelineCard() {
  var items = document.querySelectorAll('.ver-timeline-item');
  for (var i = 0; i < items.length; i++) {
    var itemId = parseInt(items[i].getAttribute('data-version-id'), 10);
    items[i].classList.toggle('ver-timeline-item--active', itemId === _selectedVersionId);
  }
}

function _renderVersionDetails(v) {
  var details = document.getElementById('versionDetailsView');
  if (!details) return;

  if (!v) {
    details.innerHTML =
      '<div class="empty-state">' +
      '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/>' +
      '</svg>' +
      '<p class="empty-state-title">Select a version</p>' +
      '<p class="empty-state-text">Click a version from the timeline to view details.</p>' +
      '</div>';
    return;
  }

  var badgeClass = v.valid ? 'ver-valid' : 'ver-invalid';
  var badgeLabel = v.valid ? 'Published' : 'Issues';
  var stageLabel = _versionStageLabel(v);
  var descText = _versionDescription(v);

  var html = '';
  html += '<div class="ver-detail-top-tools">';
  html += '<div>';
  html += '<h2 class="ver-page-title">Version Details</h2>';
  html += '<p class="ver-page-subtitle">Deep dive into the selected iteration of the schedule.</p>';
  html += '</div>';
  html += '<div class="ver-detail-tools">';
  html += '<button type="button" class="ver-icon-btn" onclick="_onPrintClick()" title="Print details"><span class="material-symbols-outlined">print</span></button>';
  html += '<button type="button" class="ver-icon-btn" onclick="_onDownloadClick(' + v.id + ')" title="Download version"><span class="material-symbols-outlined">download</span></button>';
  html += '</div>';
  html += '</div>';
  html += '<div class="ver-detail-card">';
  html += '<div class="ver-detail-topbar"></div>';
  html += '<div class="ver-detail-body">';

  html += '<div class="ver-detail-header">';
  html += '<div class="ver-detail-header-main">';
  html += '<div class="ver-detail-icon"><span class="material-symbols-outlined">published_with_changes</span></div>';
  html += '<div class="ver-detail-text">';
  html += '<div class="ver-detail-title-row">';
  html += '<h3 class="ver-detail-title">' + _escVerHtml(v.label) + '</h3>';
  if (stageLabel === 'Current Draft') {
    html += '<span class="ver-badge ver-draft">Current Draft</span>';
  }
  html += '<span class="ver-badge ' + badgeClass + '">' + badgeLabel + '</span>';
  html += '</div>';
  html += '<p class="ver-detail-meta"><span class="material-symbols-outlined">schedule</span>' + _formatTimestamp(v.timestamp) + '</p>';
  html += '</div>';
  html += '</div>';
  html += '<div class="ver-detail-cta">';
  html += '<button type="button" class="ver-btn-primary" onclick="_onLoadClick(' + v.id + ')">Load Schedule</button>';
  html += '<button type="button" class="ver-btn-secondary" onclick="_onRenameClick(' + v.id + ')">Rename</button>';
  html += '</div>';
  html += '</div>';

  html += '<div class="ver-detail-section">';
  html += '<h4 class="ver-detail-section-title">Description</h4>';
  html += '<p class="ver-detail-desc" id="verDescText' + v.id + '" onclick="_onDescClick(' + v.id + ')" title="Click to edit description">' + _escVerHtml(descText) + '</p>';
  html += '</div>';

  html += '<div class="ver-detail-stats">';
  html += '<div class="ver-stat"><p class="ver-stat-label">Total Classes</p><p class="ver-stat-value">' + (v.enabledKeys || []).length + '</p></div>';
  html += '<div class="ver-stat"><p class="ver-stat-label">Conflicts Resolved</p><p class="ver-stat-value">' + (v.violationCount || 0) + '</p></div>';
  html += '<div class="ver-stat"><p class="ver-stat-label">Status</p><p class="ver-stat-value"><span class="ver-badge ' + badgeClass + '">' + (v.valid ? 'Valid' : 'Issues') + '</span></p></div>';
  html += '</div>';

  html += '<div class="ver-detail-foot">';
  html += '<div class="ver-detail-foot-note"><span class="material-symbols-outlined">info</span>This version is currently synced with the main display system.</div>';
  html += '<button type="button" class="ver-btn-link-danger" onclick="_onDeleteClick(' + v.id + ')">Delete</button>';
  html += '</div>';

  html += '</div>';
  html += '</div>';

  details.innerHTML = html;
}

function _timelineToneClass(v, idx) {
  if (idx === 0) return 'ver-tone-active';
  if (v.starred) return 'ver-tone-draft';
  return 'ver-tone-archived';
}

function _timelineToneKey(v, idx) {
  if (idx === 0) return 'active';
  if (v.starred) return 'draft';
  return 'archived';
}

function _timelineToneLabel(v, idx) {
  if (idx === 0) return 'Active Version';
  if (v.starred) return 'Current Draft';
  return 'Archived';
}

function _timelineToneIcon(v, idx) {
  if (idx === 0) return 'published_with_changes';
  if (v.starred) return 'edit_document';
  return 'archive';
}

function _onLoadClick(id) {
  var ok = loadScheduleVersionById(id);
  if (ok && typeof renderVersionPanel === 'function') {
    setTimeout(function () { renderVersionPanel(); }, 200);
  }
}

function _onRenameClick(id) {
  var labelSpan = document.getElementById('verLabel' + id);
  var current = labelSpan ? labelSpan.textContent : '';
  var newLabel = prompt('Rename version:', current);
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
  if (!confirm('Delete this version?')) return;
  deleteScheduleVersion(id);
  if (_selectedVersionId === id) _selectedVersionId = null;
  renderVersionPanel();
  if (typeof showToast === 'function') {
    showToast('Version deleted.', { type: 'info', duration: 2000 });
  }
}

function _onCompareCheckChange() {
  var checks = document.querySelectorAll('.ver-compare-check:checked');
  var compareBtn = document.getElementById('verCompareBtn');
  var bulkBtn = document.getElementById('verBulkDeleteBtn');
  if (compareBtn) compareBtn.disabled = checks.length !== 2;
  if (bulkBtn) bulkBtn.disabled = checks.length < 1;
}

function _onCompareClick() {
  var checks = document.querySelectorAll('.ver-compare-check:checked');
  if (checks.length !== 2) return;

  var id1 = parseInt(checks[0].getAttribute('data-vid'), 10);
  var id2 = parseInt(checks[1].getAttribute('data-vid'), 10);
  var v1 = getVersionById(id1);
  var v2 = getVersionById(id2);
  if (!v1 || !v2) return;

  var diff = diffScheduleVersions(v1, v2);
  if (diff) renderCompareView(diff);
}

function _onPrintClick() {
  window.print();
}

function _onDownloadClick(id) {
  var version = getVersionById(id);
  if (!version) return;
  var fileName = 'version-' + id + '.json';
  var blob = new Blob([JSON.stringify(version, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _onDescClick(id) {
  var el = document.getElementById('verDescText' + id);
  if (!el || el.querySelector('textarea')) return;

  var version = getVersionById(id);
  var editVal = (version && typeof version.description === 'string') ? version.description : '';

  el.innerHTML = '<textarea class="ver-desc-edit" id="verDescEdit' + id + '" rows="3">' + _escVerHtml(editVal) + '</textarea>'
    + '<div class="ver-desc-actions">'
    + '<button type="button" class="ver-btn-primary ver-desc-save" onclick="_onDescSave(' + id + ')">Save</button>'
    + '<button type="button" class="ver-btn-secondary ver-desc-cancel" onclick="renderVersionPanel()">Cancel</button>'
    + '</div>';

  var textarea = document.getElementById('verDescEdit' + id);
  if (textarea) { textarea.focus(); textarea.select(); }
}

function _onDescSave(id) {
  var textarea = document.getElementById('verDescEdit' + id);
  if (!textarea) return;
  var newDesc = textarea.value.trim();
  updateVersionDescription(id, newDesc);
  _selectedVersionId = id;
  renderVersionPanel();
  if (typeof showToast === 'function') {
    showToast('Description updated.', { type: 'success', duration: 2000 });
  }
}

function _onBulkDeleteClick() {
  var checks = document.querySelectorAll('.ver-compare-check:checked');
  if (checks.length < 1) return;

  var ids = [];
  for (var i = 0; i < checks.length; i++) {
    ids.push(parseInt(checks[i].getAttribute('data-vid'), 10));
  }

  if (!confirm('Delete ' + ids.length + ' selected version' + (ids.length > 1 ? 's' : '') + '?')) return;

  var deleted = bulkDeleteVersions(ids);
  // Clear selection if current was deleted
  for (var j = 0; j < ids.length; j++) {
    if (_selectedVersionId === ids[j]) { _selectedVersionId = null; break; }
  }
  renderVersionPanel();
  if (typeof showToast === 'function') {
    showToast(deleted + ' version' + (deleted > 1 ? 's' : '') + ' deleted.', { type: 'info', duration: 2000 });
  }
}

function onVersionAutoSave() {
  var snapshot = (typeof window !== 'undefined') ? window.__ttLastScheduleState : null;
  var validation = (typeof window !== 'undefined') ? window.__ttLastValidation : null;
  if (!snapshot) return;

  var saved = saveScheduleVersion(snapshot, validation);
  if (saved && typeof showToast === 'function') {
    showToast('Version "' + saved.label + '" saved.', { type: 'success', duration: 2500 });
  }

  var tabVersions = document.getElementById('tabVersions');
  if (tabVersions) tabVersions.disabled = false;

  if (typeof getActiveTab === 'function' && getActiveTab() === 'versions') {
    renderVersionPanel();
  }
}

function _formatTimestamp(isoStr) {
  if (!isoStr) return '';
  try {
    var d = new Date(isoStr);
    var day = String(d.getDate()).padStart(2, '0');
    var mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    var yr = d.getFullYear();
    var rawHr = d.getHours();
    var ampm = rawHr >= 12 ? 'PM' : 'AM';
    var hr12 = rawHr % 12 || 12;
    var hr = String(hr12).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return mon + ' ' + day + ', ' + yr + ' · ' + hr + ':' + min + ' ' + ampm;
  } catch (_) {
    return isoStr;
  }
}

function _escVerHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function _versionStageLabel(v) {
  var versions = loadScheduleVersions();
  for (var i = 0; i < versions.length; i++) {
    if (versions[i].id === v.id) {
      if (i === 0) return 'Active Version';
      if (v.starred) return 'Current Draft';
      return 'Archived';
    }
  }
  return v.starred ? 'Current Draft' : 'Archived';
}

function _versionDescription(v) {
  if (typeof v.description === 'string' && v.description.trim()) {
    return v.description.trim();
  }
  var base = v.valid
    ? 'This version captures a stable timetable snapshot with validated class allocations.'
    : 'This version contains pending constraint issues and may require review before use.';
  return base + ' Snapshot saved on ' + _formatTimestamp(v.timestamp) + '.';
}

window._onVersionCardClick = _onVersionCardClick;
window._onLoadClick = _onLoadClick;
window._onRenameClick = _onRenameClick;
window._onStarClick = _onStarClick;
window._onDeleteClick = _onDeleteClick;
window._onCompareCheckChange = _onCompareCheckChange;
window._onCompareClick = _onCompareClick;
window._toggleVersionSidebar = _toggleVersionSidebar;
window._onPrintClick = _onPrintClick;
window._onDownloadClick = _onDownloadClick;
window._onDescClick = _onDescClick;
window._onDescSave = _onDescSave;
window._onBulkDeleteClick = _onBulkDeleteClick;

function _toggleVersionSidebar() {
  var layout = document.querySelector('.ver-layout');
  var toggle = document.getElementById('verSidebarToggle');
  if (!layout || !toggle) return;

  _isVersionSidebarCollapsed = !_isVersionSidebarCollapsed;
  layout.classList.toggle('ver-layout--left-collapsed', _isVersionSidebarCollapsed);

  var icon = toggle.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = _isVersionSidebarCollapsed ? 'menu_open' : 'menu';
  toggle.title = _isVersionSidebarCollapsed ? 'Expand timeline' : 'Collapse timeline';
}
