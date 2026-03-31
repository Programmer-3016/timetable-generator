// @ts-check
/**
 * @module versioning/version-store.js
 * @description CRUD operations for schedule versions in localStorage.
 *
 * Each version captures a full snapshot of the generated schedule state
 * (window.__ttLastScheduleState) along with metadata like label, timestamp,
 * seed, and validation result.
 *
 * Storage key: tt_schedule_versions_v1
 * Max versions: 10 (oldest non-starred auto-pruned)
 */

/* exported
   loadScheduleVersions,
   saveScheduleVersion,
   deleteScheduleVersion,
   renameScheduleVersion,
   updateVersionDescription,
   toggleStarVersion,
   loadScheduleVersionById,
   getVersionById,
   VERSION_STORAGE_KEY,
   MAX_VERSIONS
*/

/* ═══════════════════════════════════════════════════════
   Section: CONSTANTS
═══════════════════════════════════════════════════════ */

var VERSION_STORAGE_KEY = "tt_schedule_versions_v1";
var MAX_VERSIONS = 10;

/* ═══════════════════════════════════════════════════════
   Section: STORAGE READ/WRITE
═══════════════════════════════════════════════════════ */

/**
 * Read all saved versions from localStorage.
 * @returns {Array<Object>} Array of version objects, newest first.
 */
function loadScheduleVersions() {
  try {
    var raw = localStorage.getItem(VERSION_STORAGE_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Persist the versions array to localStorage.
 * @param {Array<Object>} versions - Array of version objects to persist
 * @returns {void}
 */
function _saveVersionsToStorage(versions) {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(versions));
  } catch (_) {
    if (typeof showToast === "function") {
      showToast("Could not save version — storage may be full.", { type: "error" });
    }
  }
}

/* ═══════════════════════════════════════════════════════
   Section: INTERNAL HELPERS
═══════════════════════════════════════════════════════ */

/**
 * Generate the next version ID (max existing + 1).
 * @param {Array<Object>} versions
 * @returns {number}
 */
function _nextVersionId(versions) {
  if (!versions.length) return 1;
  var maxId = 0;
  for (var i = 0; i < versions.length; i++) {
    if (versions[i].id > maxId) maxId = versions[i].id;
  }
  return maxId + 1;
}

/**
 * Prune oldest non-starred versions to stay within MAX_VERSIONS.
 * @param {Array<Object>} versions
 * @returns {Array<Object>}
 */
function _pruneVersions(versions) {
  while (versions.length > MAX_VERSIONS) {
    var removeIdx = -1;
    // Find oldest non-starred (last in array since newest-first)
    for (var i = versions.length - 1; i >= 0; i--) {
      if (!versions[i].starred) {
        removeIdx = i;
        break;
      }
    }
    if (removeIdx === -1) {
      // All starred — remove oldest anyway
      removeIdx = versions.length - 1;
    }
    versions.splice(removeIdx, 1);
  }
  return versions;
}

/* ═══════════════════════════════════════════════════════
   Section: CRUD OPERATIONS
═══════════════════════════════════════════════════════ */

/**
 * Save a new schedule version.
 * @param {Object} snapshot - window.__ttLastScheduleState
 * @param {Object} validation - { valid, violations }
 * @param {string} [label] - Optional display label
 * @returns {Object} The saved version object
 */
function saveScheduleVersion(snapshot, validation, label) {
  if (!snapshot) return null;

  var versions = loadScheduleVersions();
  var id = _nextVersionId(versions);
  var version = {
    id: id,
    label: label || "Version " + id,
    timestamp: new Date().toISOString(),
    seed: snapshot.seed || null,
    starred: false,
    valid: !!(validation && validation.valid),
    violationCount: (validation && Array.isArray(validation.violations))
      ? validation.violations.length : 0,
    enabledKeys: snapshot.keys ? snapshot.keys.slice() : [],
    classLabels: typeof gClassLabels !== "undefined" ? JSON.parse(JSON.stringify(gClassLabels)) : {},
    fillerLabelsByClass: typeof gFillerLabelsByClass !== "undefined" ? JSON.parse(JSON.stringify(gFillerLabelsByClass)) : {},
    snapshot: JSON.parse(JSON.stringify(snapshot)),
  };

  versions.unshift(version);
  versions = _pruneVersions(versions);
  _saveVersionsToStorage(versions);

  return version;
}

/**
 * Delete a version by ID.
 * @param {number} id
 * @returns {boolean} true if deleted
 */
function deleteScheduleVersion(id) {
  var versions = loadScheduleVersions();
  var idx = -1;
  for (var i = 0; i < versions.length; i++) {
    if (versions[i].id === id) { idx = i; break; }
  }
  if (idx === -1) return false;
  versions.splice(idx, 1);
  _saveVersionsToStorage(versions);
  return true;
}

/**
 * Rename a version.
 * @param {number} id
 * @param {string} newLabel
 * @returns {boolean} true if renamed
 */
function renameScheduleVersion(id, newLabel) {
  var versions = loadScheduleVersions();
  for (var i = 0; i < versions.length; i++) {
    if (versions[i].id === id) {
      versions[i].label = (newLabel || "").trim() || versions[i].label;
      _saveVersionsToStorage(versions);
      return true;
    }
  }
  return false;
}

/**
 * Update the description of a version.
 * @param {number} id
 * @param {string} desc
 * @returns {boolean} true if updated
 */
function updateVersionDescription(id, desc) {
  var versions = loadScheduleVersions();
  for (var i = 0; i < versions.length; i++) {
    if (versions[i].id === id) {
      versions[i].description = (desc || "").trim();
      _saveVersionsToStorage(versions);
      return true;
    }
  }
  return false;
}

/**
 * Toggle star status of a version.
 * @param {number} id
 * @returns {boolean|null} new starred state, or null if not found
 */
function toggleStarVersion(id) {
  var versions = loadScheduleVersions();
  for (var i = 0; i < versions.length; i++) {
    if (versions[i].id === id) {
      versions[i].starred = !versions[i].starred;
      _saveVersionsToStorage(versions);
      return versions[i].starred;
    }
  }
  return null;
}

/**
 * Get a version by ID without loading it into state.
 * @param {number} id
 * @returns {Object|null}
 */
function getVersionById(id) {
  var versions = loadScheduleVersions();
  for (var i = 0; i < versions.length; i++) {
    if (versions[i].id === id) return versions[i];
  }
  return null;
}

/* ═══════════════════════════════════════════════════════
   Section: VERSION RESTORE
═══════════════════════════════════════════════════════ */

/**
 * Load a version into the active application state.
 * Restores globals and re-renders the DOM timetables.
 * @param {number} id
 * @returns {boolean} true if loaded successfully
 */
function loadScheduleVersionById(id) {
  var version = getVersionById(id);
  if (!version || !version.snapshot) return false;
  var restored = loadPublishedSnapshotIntoGlobals({
    snapshot: version.snapshot,
    classLabels: version.classLabels || null,
    fillerLabelsByClass: version.fillerLabelsByClass || null,
  });
  if (!restored) return false;

  rerenderPublishedScheduleFromGlobals({
    fillerLabelsByClass: version.fillerLabelsByClass || null,
  });
  rebuildPublishedPanels();

  // Enable tabs and switch
  try {
    if (typeof enablePostGenerateTabs === "function") enablePostGenerateTabs();
    if (typeof switchTab === "function") switchTab("timetables");
  } catch (_) {
    // Tab switching is non-critical
  }

  if (typeof showToast === "function") {
    showToast('Loaded "' + version.label + '"', { type: "success", duration: 3000 });
  }

  return true;
}
