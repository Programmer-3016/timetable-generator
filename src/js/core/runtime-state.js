// @ts-check
/* exported clonePublishedValue, captureAcceptedPublishedState, loadPublishedSnapshotIntoGlobals, rerenderPublishedScheduleFromGlobals, rebuildPublishedPanels, clearPublishedPanels, restoreAcceptedPublishedState */

/**
 * @module core/runtime-state.js
 * @description Shared helpers for published schedule snapshots, restores, and dependent panel refreshes.
 */

/**
 * Deep-clones a JSON-serializable value.
 * @param {*} value
 * @returns {*}
 */
function clonePublishedValue(value) {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_e) {
    return value;
  }
}

/**
 * Captures the currently accepted published schedule state.
 * @returns {{ snapshot: Object, validation: Object|null, unresolvedClashes: Array<*>, compactionReport: Object|null, classLabels: Object<string, string>, fillerLabelsByClass: Object<string, Object<string, string>> }|null}
 */
function captureAcceptedPublishedState() {
  if (
    !generated ||
    typeof window === "undefined" ||
    !window.__ttLastScheduleState ||
    typeof window.__ttLastScheduleState !== "object"
  ) {
    return null;
  }

  return {
    snapshot: clonePublishedValue(window.__ttLastScheduleState),
    validation:
      window.__ttLastValidation && typeof window.__ttLastValidation === "object" ?
        clonePublishedValue(window.__ttLastValidation) :
        null,
    unresolvedClashes: Array.isArray(window.__ttUnresolvedClashes) ?
      clonePublishedValue(window.__ttUnresolvedClashes) :
      [],
    compactionReport:
      window.__ttPostLunchCompactReport &&
      typeof window.__ttPostLunchCompactReport === "object" ?
        clonePublishedValue(window.__ttPostLunchCompactReport) :
        null,
    classLabels: clonePublishedValue(gClassLabels || {}),
    fillerLabelsByClass: clonePublishedValue(gFillerLabelsByClass || {}),
  };
}

/**
 * Loads a published snapshot into globals without rebuilding the DOM.
 * @param {{ snapshot: Object, validation?: Object|null, unresolvedClashes?: Array<*>, compactionReport?: Object|null, classLabels?: Object<string, string>|null, fillerLabelsByClass?: Object<string, Object<string, string>>|null }} params
 * @returns {boolean}
 */
function loadPublishedSnapshotIntoGlobals({
  snapshot,
  validation = null,
  unresolvedClashes = [],
  compactionReport = null,
  classLabels = null,
  fillerLabelsByClass = null,
}) {
  if (!snapshot || typeof snapshot !== "object") return false;
  try {
    const snap = clonePublishedValue(snapshot);
    window.__ttLastScheduleState = snap;
    if (Number.isFinite(snap.seed)) window.__ttLastSeed = snap.seed >>> 0;

    gSchedules = clonePublishedValue(snap.schedulesByClass || {});
    gEnabledKeys = Array.isArray(snap.keys) ?
      snap.keys.slice() :
      (Array.isArray(snap.enabledKeys) ? snap.enabledKeys.slice() : []);

    if (snap.teacherForShortByClass) {
      gTeacherForShort = clonePublishedValue(snap.teacherForShortByClass);
    }
    if (snap.subjectByShortByClass) {
      gSubjectByShort = clonePublishedValue(snap.subjectByShortByClass);
    }
    if (snap.labsAtSlot) {
      gLabsAtSlot = clonePublishedValue(snap.labsAtSlot);
    }
    window.gAssignedTeacher = clonePublishedValue(snap.assignedTeacher || {});
    window.gLabNumberAssigned = clonePublishedValue(snap.labNumberAssigned || {});
    gFillerShortsByClass = clonePublishedValue(snap.fillerShortsByClass || {});
    if (snap.weeklyQuotaByClass) {
      gWeeklyQuotaByClass = clonePublishedValue(snap.weeklyQuotaByClass);
    }
    if (classLabels && typeof classLabels === "object") {
      gClassLabels = clonePublishedValue(classLabels);
    }
    if (fillerLabelsByClass && typeof fillerLabelsByClass === "object") {
      gFillerLabelsByClass = clonePublishedValue(fillerLabelsByClass);
    }

    window.__ttUnresolvedClashes = Array.isArray(unresolvedClashes) ?
      clonePublishedValue(unresolvedClashes) :
      [];
    window.__ttPostLunchCompactReport =
      compactionReport && typeof compactionReport === "object" ?
        clonePublishedValue(compactionReport) :
        { totalIssues: 0 };

    if (validation && typeof validation === "object") {
      window.__ttLastValidation = clonePublishedValue(validation);
    } else if (typeof schedulerIsFullyValid === "function") {
      window.__ttLastValidation = schedulerIsFullyValid(snap);
    }
    return true;
  } catch (e) {
    console.error("Published snapshot load error:", e);
    return false;
  }
}

/**
 * Builds fallback period timings for version/published restores when the current global timing grid is missing.
 * @param {{ classesPerDay: number, lunchClassIndex: number|null }} params
 * @returns {Array<{ type: string, start: string, end: string }>}
 */
function buildFallbackPeriodTimingsForRestore({ classesPerDay, lunchClassIndex }) {
  const timings = [];
  for (let col = 0; col < classesPerDay; col++) {
    timings.push({ type: "class", start: "", end: "" });
    if (lunchClassIndex !== null && lunchClassIndex === col + 1) {
      timings.push({ type: "lunch", start: "", end: "" });
    }
  }
  return timings;
}

/**
 * Re-renders class timetable DOM blocks from the currently loaded globals.
 * @param {{ periodTimings?: Array<{ type: string, start: string, end: string }>, fillerLabelsByClass?: Object<string, Object<string, string>>|null }} [params={}]
 * @returns {void}
 */
function rerenderPublishedScheduleFromGlobals({ periodTimings: runtimePeriodTimings = null, fillerLabelsByClass = null } = {}) {
  if (typeof schedulerRenderClassToDOM !== "function") return;
  const snapshot = window.__ttLastScheduleState || {};
  const classesPerDay = Number(snapshot.classesPerDay) || 0;
  const lunchClassIndex = Number.isFinite(snapshot.lunchClassIndex) ?
    Number(snapshot.lunchClassIndex) :
    null;
  const renderPeriodTimings =
    Array.isArray(runtimePeriodTimings) && runtimePeriodTimings.length ?
      runtimePeriodTimings :
      (Array.isArray(periodTimings) && periodTimings.length ?
        periodTimings :
        buildFallbackPeriodTimingsForRestore({ classesPerDay, lunchClassIndex }));

  const isLabShortByClass =
    snapshot.isLabShortByClass && typeof snapshot.isLabShortByClass === "object" ?
      snapshot.isLabShortByClass :
      {};

  const resolveTeacherForCell = (key, short, day, col) => {
    const assignedRow =
      window.gAssignedTeacher &&
      window.gAssignedTeacher[key] &&
      window.gAssignedTeacher[key][day] ?
        window.gAssignedTeacher[key][day] :
        null;
    if (assignedRow && assignedRow[col] !== undefined) {
      const assigned = assignedRow[col];
      return assigned === null ? "" : String(assigned || "");
    }
    return (
      (gTeacherForShort &&
        gTeacherForShort[key] &&
        gTeacherForShort[key][short]) ||
      ""
    );
  };

  gEnabledKeys.forEach((key) => {
    if (!isLabShortByClass[key]) {
      isLabShortByClass[key] = {};
      const subjectMap = gSubjectByShort[key] || {};
      Object.keys(subjectMap).forEach((short) => {
        isLabShortByClass[key][short] =
          /\blab\b/i.test(short || "") ||
          /\blab\b/i.test(subjectMap[short]?.subject || "");
      });
    }

    const daysInput = /** @type {HTMLInputElement|null} */ (document.getElementById("days"));
    schedulerRenderClassToDOM({
      key,
      days: Number(snapshot.days) || Number(daysInput?.value) || 5,
      periodTimings: renderPeriodTimings,
      schedules: gSchedules,
      subjectByShort: gSubjectByShort,
      getTeacherForCell: resolveTeacherForCell,
      isLabShort: isLabShortByClass,
      labNumberAssigned: window.gLabNumberAssigned || {},
      fillerLabelsByClass: fillerLabelsByClass || gFillerLabelsByClass || {},
    });
  });
}

/**
 * Rebuilds report, faculty, and lab panels from the current globals.
 * @returns {void}
 */
function rebuildPublishedPanels() {
  try {
    buildAndRenderReport();
  } catch (e) {
    console.error("buildAndRenderReport error:", e);
  }
  try {
    buildFacultyPanel();
  } catch (e) {
    console.error("buildFacultyPanel error:", e);
  }
  try {
    renderLabTimetables();
  } catch (e) {
    console.error("renderLabTimetables error:", e);
  }
}

/**
 * Clears secondary panels when there is no accepted schedule to display.
 * @returns {void}
 */
function clearPublishedPanels() {
  const reportPanel = document.getElementById("reportPanel");
  if (reportPanel) reportPanel.innerHTML = "";
  const facultyPanel = document.getElementById("facultyPanel");
  if (facultyPanel) facultyPanel.style.display = "none";
  const facultySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("facultySelect"));
  if (facultySelect) {
    facultySelect.innerHTML = '<option value="">— Select Faculty —</option>';
    facultySelect.value = "";
  }
  const facultyTT = document.getElementById("facultyTT");
  if (facultyTT) facultyTT.innerHTML = "";
  const labPanelWrap = document.getElementById("labPanelWrap");
  if (labPanelWrap) labPanelWrap.innerHTML = "";
}

/**
 * Restores a previously accepted published state and rebuilds the related views.
 * @param {{ acceptedState: ReturnType<typeof captureAcceptedPublishedState>|null, periodTimings?: Array<{ type: string, start: string, end: string }> }} params
 * @returns {boolean}
 */
function restoreAcceptedPublishedState({ acceptedState, periodTimings: runtimePeriodTimings = null }) {
  if (!acceptedState || !acceptedState.snapshot) return false;
  const loaded = loadPublishedSnapshotIntoGlobals({
    snapshot: acceptedState.snapshot,
    validation: acceptedState.validation,
    unresolvedClashes: acceptedState.unresolvedClashes,
    compactionReport: acceptedState.compactionReport,
    classLabels: acceptedState.classLabels,
    fillerLabelsByClass: acceptedState.fillerLabelsByClass,
  });
  if (!loaded) return false;
  rerenderPublishedScheduleFromGlobals({
    periodTimings: runtimePeriodTimings,
    fillerLabelsByClass: acceptedState.fillerLabelsByClass,
  });
  rebuildPublishedPanels();
  return true;
}
