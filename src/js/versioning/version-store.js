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
   toggleStarVersion,
   loadScheduleVersionById,
   getVersionById,
   VERSION_STORAGE_KEY,
   MAX_VERSIONS
*/

var VERSION_STORAGE_KEY = "tt_schedule_versions_v1";
var MAX_VERSIONS = 10;

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
 * @param {Array<Object>} versions
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

/**
 * Load a version into the active application state.
 * Restores globals and re-renders the DOM timetables.
 * @param {number} id
 * @returns {boolean} true if loaded successfully
 */
function loadScheduleVersionById(id) {
  var version = getVersionById(id);
  if (!version || !version.snapshot) return false;

  var snap = version.snapshot;

  // Restore core globals
  try {
    window.__ttLastScheduleState = snap;
    gSchedules = snap.schedulesByClass || {};
    gEnabledKeys = snap.keys ? snap.keys.slice() : [];

    if (snap.teacherForShortByClass) {
      gTeacherForShort = snap.teacherForShortByClass;
    }
    if (snap.teacherForShortGlobal) {
      gSubjectByShort = snap.teacherForShortGlobal;
    }
    if (snap.labNumberAssigned) {
      window.gLabNumberAssigned = snap.labNumberAssigned;
    }
    if (snap.assignedTeacher) {
      window.gAssignedTeacher = snap.assignedTeacher;
    }
    if (snap.fillerShortsByClass) {
      gFillerShortsByClass = snap.fillerShortsByClass;
    }
    if (version.classLabels) {
      gClassLabels = version.classLabels;
    }

    // Restore weeklyQuota if available
    if (snap.weeklyQuotaByClass) {
      gWeeklyQuotaByClass = snap.weeklyQuotaByClass;
    }

    // Re-validate
    if (typeof schedulerIsFullyValid === "function") {
      window.__ttLastValidation = schedulerIsFullyValid(snap);
    }
  } catch (e) {
    console.error("Version restore error:", e);
    return false;
  }

  // Re-render DOM timetables
  try {
    if (typeof schedulerRenderClassToDOM === "function") {
      var keys = snap.keys || [];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var schedule = (snap.schedulesByClass || {})[k];
        if (!schedule) continue;
        schedulerRenderClassToDOM(k, schedule, snap.days, snap.classesPerDay, snap.lunchClassIndex);
      }
    }
  } catch (e) {
    console.error("Version re-render error:", e);
  }

  // Rebuild secondary panels
  try {
    if (typeof buildAndRenderReport === "function") buildAndRenderReport();
    if (typeof buildFacultyPanel === "function") buildFacultyPanel();
    if (typeof renderLabTimetables === "function") renderLabTimetables();
  } catch (e) {
    console.error("Version panel rebuild error:", e);
  }

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
