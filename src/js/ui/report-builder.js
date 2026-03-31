// @ts-check
/* exported buildAndRenderReport */

/**
 * @module ui/report-builder.js
 * @description Teacher aggregate report data preparation.
 */

/* ═══════════════════════════════════════════════════════
   Section: PER-TEACHER REPORT BUILDER
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   Section: TEACHER CANDIDATE RESOLUTION
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   Section: AGGREGATE STATS
═══════════════════════════════════════════════════════ */

/**
 * Rebuilds aggregate per-teacher statistics (theory, labs, minutes, first-period counts) from the current published schedule.
 * @returns {Object} Map of teacher keys to their aggregate stat objects
 */
function rebuildAggregateStatsFromPublishedSchedule() {
  const next = {};
  const minsPerPeriod =
    parseInt(/** @type {HTMLInputElement | null} */ (document.getElementById("duration"))?.value, 10) || 50;
  const enabledKeys = Array.isArray(gEnabledKeys) ? gEnabledKeys : [];

  enabledKeys.forEach((key) => {
    const byDay = gSchedules?.[key];
    if (!Array.isArray(byDay)) return;
    for (let d = 0; d < byDay.length; d++) {
      const row = byDay[d];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const short = row[c];
        if (!short) continue;

        const subj = gSubjectByShort?.[key]?.[short] || {};
        const isLabCell =
          /\blab\b/i.test(short || "") || /\blab\b/i.test(subj?.subject || "");
        const prevShort = c > 0 ? row[c - 1] : "";
        const prevSubj = prevShort ? gSubjectByShort?.[key]?.[prevShort] || {} : {};
        const prevIsLab =
          /\blab\b/i.test(prevShort || "") ||
          /\blab\b/i.test(prevSubj?.subject || "");
        const startsLabBlock =
          isLabCell && !(prevShort && prevShort === short && prevIsLab);

        const teachers = resolvePublishedTeacherCandidatesForCell({
          key,
          day: d,
          col: c,
          short,
          subj,
        });
        if (!teachers.length) continue;

        teachers.forEach((rawName) => {
          const display = String(rawName || "").trim();
          if (!isReportableTeacherName(display)) return;
          const canonical = canonicalTeacherName(display);
          const teacherKey = canonical || normalizeTeacherName(display);
          if (!teacherKey) return;

          if (!next[teacherKey]) {
            next[teacherKey] = {
              display,
              theory: 0,
              labs: 0,
              minutes: 0,
              first: 0,
            };
          } else if (display.length > (next[teacherKey].display || "").length) {
            next[teacherKey].display = display;
          }

          next[teacherKey].minutes += minsPerPeriod;
          if (c === 0) next[teacherKey].first += 1;

          if (isLabCell) {
            if (startsLabBlock) next[teacherKey].labs += 1;
            return;
          }
          // In report view, every non-lab teaching slot counts as Theory.
          next[teacherKey].theory += 1;
        });
      }
    }
  });

  aggregateStats = next;
  return next;
}

/* ═══════════════════════════════════════════════════════
   Section: REPORT ORCHESTRATION
═══════════════════════════════════════════════════════ */

/**
 * Orchestrates the full report pipeline: rebuilds subject info, aggregates teacher stats, folds canonical names, and renders the report table.
 * @returns {void}
 */
function buildAndRenderReport() {
  renderSubjectInfo();
  rebuildAggregateStatsFromPublishedSchedule();
  const TEACHER_MAX_HOURS = 18 * 60; // minutes; status is based on time only
  const canonicalNames = Object.keys(aggregateStats || {}).filter(Boolean);
  const seededFoldMap =
    gCanonFoldMap && Object.keys(gCanonFoldMap).length ?
    gCanonFoldMap :
    buildTeacherFoldMapFromCanonicalNames(canonicalNames);
  const folded = {};
  gCanonFoldMap = {};
  canonicalNames.forEach((coreK) => {
    const master = seededFoldMap[coreK] || coreK;
    gCanonFoldMap[coreK] = master;
    if (!folded[master]) {
      folded[master] = {
        ...(aggregateStats[coreK] || {})
      };
      return;
    }
    const src = aggregateStats[coreK] || {};
    const tgt = folded[master];
    tgt.theory += src.theory || 0;
    tgt.labs += src.labs || 0;
    tgt.minutes += src.minutes || 0;
    tgt.first += src.first || 0;
    const d = src.display || "";
    if ((d?.length || 0) > (tgt.display?.length || 0)) tgt.display = d;
  });
  const teachers = Object.keys(folded);
  reportData = teachers.map((k) => {
    const s = folded[k];
    const flags = [];
    if (s.minutes > TEACHER_MAX_HOURS) flags.push("Over 18h");
    let status = "ok";
    if (flags.length === 1) status = "warn";
    if (flags.length > 1) status = "err";
    return {
      teacher: s.display || k,
      theory: s.theory,
      labs: s.labs,
      periods: (s.theory || 0) + (s.labs || 0),
      minutes: s.minutes,
      first: s.first,
      flags,
      status,
    };
  });
  renderReport();
}
