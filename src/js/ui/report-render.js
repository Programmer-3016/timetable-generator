/* exported renderReport */
/**
 * @module ui/report-render.js
 * @description Report table UI rendering and sorting interactions.
 */

// Section: REPORT TABLE RENDERING

// Section: CLASH DASHBOARD METRICS

/**
 * Computes clash dashboard metrics including teacher slot clashes, strict violations, and overloaded teacher counts.
 * @returns {{teacherSlotClashes: number, teachersInClash: number, clashCells: number, strictViolations: number, strictTeacherClashes: number, strictOtherViolations: number, overloadedTeachers: number}}
 */
function buildClashDashboardMetrics() {
  const metrics = {
    teacherSlotClashes: 0,
    teachersInClash: 0,
    clashCells: 0,
    strictViolations: 0,
    strictTeacherClashes: 0,
    strictOtherViolations: 0,
    overloadedTeachers: 0,
  };

  metrics.overloadedTeachers = (reportData || []).filter(
    (row) => Number(row?.minutes || 0) > 18 * 60
  ).length;

  const state = typeof window !== "undefined" ? window.__ttLastScheduleState : null;
  if (state && typeof state === "object") {
    const schedulesByClass =
      state.schedulesByClass && typeof state.schedulesByClass === "object" ?
      state.schedulesByClass :
      {};
    const keys =
      Array.isArray(state.keys) && state.keys.length ?
      state.keys.slice() :
      Object.keys(schedulesByClass);
    const days =
      Number.isFinite(state.days) && state.days > 0 ?
      state.days :
      Math.max(
        0,
        ...keys.map((k) => {
          const byDay = schedulesByClass[k];
          return Array.isArray(byDay) ? byDay.length : 0;
        })
      );
    const classesPerDay =
      Number.isFinite(state.classesPerDay) && state.classesPerDay > 0 ?
      state.classesPerDay :
      Math.max(
        0,
        ...keys.map((k) => {
          const byDay = schedulesByClass[k];
          if (!Array.isArray(byDay) || !byDay.length) return 0;
          return byDay.reduce(
            (mx, row) => Math.max(mx, Array.isArray(row) ? row.length : 0),
            0
          );
        })
      );

    const teacherSet = new Set();
    for (let d = 0; d < days; d++) {
      for (let c = 0; c < classesPerDay; c++) {
        const byTeacher = {};
        keys.forEach((key) => {
          const short =
            schedulesByClass[key] &&
            schedulesByClass[key][d] &&
            schedulesByClass[key][d][c] ?
            schedulesByClass[key][d][c] :
            null;
          if (!short) return;
          const teachers =
            typeof schedulerGetTeachersForValidationCell === "function" ?
            schedulerGetTeachersForValidationCell(state, key, short, d, c) :
            [];
          (teachers || []).forEach((teacher) => {
            const teacherKey =
              typeof schedulerTeacherValidationKey === "function" ?
              schedulerTeacherValidationKey(state, teacher) :
              canonicalTeacherName(teacher);
            if (!teacherKey) return;
            if (!byTeacher[teacherKey]) {
              byTeacher[teacherKey] = {
                classes: new Set(),
                cells: 0,
              };
            }
            byTeacher[teacherKey].classes.add(key);
            byTeacher[teacherKey].cells += 1;
          });
        });

        Object.entries(byTeacher).forEach(([teacherKey, payload]) => {
          if (!payload || payload.classes.size <= 1) return;
          metrics.teacherSlotClashes += 1;
          metrics.clashCells += payload.cells;
          teacherSet.add(teacherKey);
        });
      }
    }
    metrics.teachersInClash = teacherSet.size;
  }

  let strictViolations = [];
  if (
    typeof window !== "undefined" &&
    window.__ttLastValidation &&
    Array.isArray(window.__ttLastValidation.violations)
  ) {
    strictViolations = window.__ttLastValidation.violations.slice();
  } else if (typeof schedulerIsFullyValid === "function") {
    try {
      const result = schedulerIsFullyValid(state);
      if (result && Array.isArray(result.violations)) {
        strictViolations = result.violations.slice();
      }
    } catch (_e) { /* no-op */ }
  }
  metrics.strictViolations = strictViolations.length;
  metrics.strictTeacherClashes = strictViolations.filter((line) =>
    /teacher clash|teacher double booking|double booking/i.test(
      String(line || "")
    )
  ).length;
  metrics.strictOtherViolations = Math.max(
    0,
    metrics.strictViolations - metrics.strictTeacherClashes
  );

  return metrics;
}

// Section: REPORT TABLE RENDERING

/**
 * Renders the per-teacher report table with clash dashboard, sortable columns, and click-to-focus interactions.
 */
function renderReport() {
  const panel = document.getElementById("reportPanel");
  if (!panel) return;
  let rows = reportData.slice();
  const clashMetrics = buildClashDashboardMetrics();
  const {
    key,
    dir
  } = reportSort;
  const asc = dir === "asc" ? 1 : -1;
  /** Comparator function for sorting report rows by the active column and direction. */
  const cmp = (a, b) => {
    let va, vb;
    switch (key) {
      case "teacher":
        va = a.teacher.toLowerCase();
        vb = b.teacher.toLowerCase();
        break;
      case "theory":
        va = a.theory;
        vb = b.theory;
        break;
      case "labs":
        va = a.labs;
        vb = b.labs;
        break;
      case "periods":
        va = a.periods;
        vb = b.periods;
        break;
      case "hours":
        va = a.minutes;
        vb = b.minutes;
        break; // sort by minutes
      case "first":
        va = a.first;
        vb = b.first;
        break;
      case "status": {
        const rank = {
          ok: 0,
          warn: 1,
          err: 2
        };
        va = rank[a.status];
        vb = rank[b.status];
        break;
      }
      default:
        va = 0;
        vb = 0;
    }
    if (va < vb) return -1 * asc;
    if (va > vb) return 1 * asc;
    return 0;
  };
  rows.sort(cmp);

  const sortDirIcon = dir === "asc" ? "▲" : "▼";
  const reportTip =
    "Tip: Click a teacher to focus timetable · Click headers to sort · " +
    "Theory and Lab are shown separately; Total Hours sums both";
  let html = `<h3 style='margin:12px 0 6px'>Per-Teacher Report</h3>
    <div class="clash-dashboard">
      <div class="clash-card clash-danger">
        <div class="clash-card-label">Teacher Clash Events</div>
        <div class="clash-card-value">${clashMetrics.teacherSlotClashes}</div>
        <div class="clash-card-meta">${clashMetrics.clashCells} conflicting cells</div>
      </div>
      <div class="clash-card clash-warn">
        <div class="clash-card-label">Teachers in Clash</div>
        <div class="clash-card-value">${clashMetrics.teachersInClash}</div>
        <div class="clash-card-meta">cross-class same-slot overlaps</div>
      </div>
      <div class="clash-card clash-info">
        <div class="clash-card-label">Strict Violations</div>
        <div class="clash-card-value">${clashMetrics.strictViolations}</div>
        <div class="clash-card-meta">teacher ${clashMetrics.strictTeacherClashes} · other ${clashMetrics.strictOtherViolations}</div>
      </div>
      <div class="clash-card clash-neutral">
        <div class="clash-card-label">Overloaded Teachers</div>
        <div class="clash-card-value">${clashMetrics.overloadedTeachers}</div>
        <div class="clash-card-meta">above 18.0h weekly load</div>
      </div>
    </div>
    <div class="report-toolbar">
      <div style="font-size:12px;color:#6b7280">${reportTip}</div>
    </div>`;
  html += `<table><thead><tr>
    <th class="sortable" data-sort="teacher">Teacher <span class="dir">${
      key === "teacher" ? sortDirIcon : ""
    }</span></th>
    <th class="sortable" data-sort="theory">Theory <span class="dir">${
      key === "theory" ? sortDirIcon : ""
    }</span></th>
    <th class="sortable" data-sort="labs">Lab <span class="dir">${
      key === "labs" ? sortDirIcon : ""
    }</span></th>
    <th class="sortable" data-sort="hours">Total Hours <span class="dir">${
      key === "hours" ? sortDirIcon : ""
    }</span></th>
    <th class="sortable" data-sort="first">First Period Days <span class="dir">${
      key === "first" ? sortDirIcon : ""
    }</span></th>
    <th class="sortable" data-sort="status">Status <span class="dir">${
      key === "status" ? sortDirIcon : ""
    }</span></th>
  </tr></thead><tbody>`;
  rows.forEach((r) => {
    // Formatted total hours string for display (e.g. "12.5h")
    const hrs = (r.minutes / 60).toFixed(1) + "h";
    let statusHtml = "<span class='pill ok'>OK</span>";
    if (r.status === "warn")
      statusHtml = `<span class='pill warn'>${r.flags[0]}</span>`;
    if (r.status === "err")
      statusHtml = `<span class='pill err'>${r.flags.join(" · ")}</span>`;
    html += `<tr class="report-row" data-teacher="${r.teacher}">
<td class="teacher-cell">${r.teacher}</td>
<td>${r.theory}</td>
<td>${r.labs}</td>
<td>${hrs}</td>
<td>${r.first}</td>
<td>${statusHtml}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  panel.innerHTML = html;

  panel.querySelectorAll(".sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.getAttribute("data-sort");
      if (reportSort.key === k) {
        reportSort.dir = reportSort.dir === "asc" ? "desc" : "asc";
      } else {
        reportSort.key = k;
        reportSort.dir = "asc";
      }
      renderReport();
    });
  });
  panel.querySelectorAll(".report-row").forEach((tr) => {
    const t = tr.getAttribute("data-teacher");
    tr.addEventListener("click", () => {
      syncTeacherFilter(t);
      highlightByTeacher(t);
      focusTeacherCell(t);
    });
  });
}

// Section: TEACHER FOCUS HELPERS

/**
 * Synchronizes the teacher filter dropdown to match the clicked teacher name.
 * @param {string} teacher - Teacher name to select
 */
function syncTeacherFilter(teacher) {
  const sel = document.getElementById("teacherFilter");
  if (sel) {
    sel.value = teacher;
  }
}

/**
 * Scrolls the viewport to the first timetable cell assigned to the given teacher.
 * @param {string} teacher - Teacher name to locate
 */
function focusTeacherCell(teacher) {
  const cells = Array.from(document.querySelectorAll(".subject-cell"));
  const c0 = canonicalTeacherName(teacher);
  // Canonical fold key for the teacher being focused
  const targetKey = (gCanonFoldMap && gCanonFoldMap[c0]) || c0;
  const target = cells.find((c) => {
    // Raw teacher name from the cell's data attribute
    const raw = (c.dataset && c.dataset.teacher) || "";
    const c1 = canonicalTeacherName(raw);
    // Canonical fold key for the cell's teacher, used for match comparison
    const key1 = (gCanonFoldMap && gCanonFoldMap[c1]) || c1;
    return key1 && key1 === targetKey;
  });
  if (target)
    target.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
}

// Section: EXPORT BUTTON WIRING

document.addEventListener("DOMContentLoaded", function() {
  const allBtn = document.getElementById("exportAllClassesBtn");
  if (allBtn)
    allBtn.addEventListener("click", function() {
      exportAllTimetablesAsOneJPG();
    });
  const pdfBtn = document.getElementById("exportAllPdfBtn");
  if (pdfBtn)
    pdfBtn.addEventListener("click", function() {
      exportAllTimetablesAsPDF();
    });
  const fbtn = document.getElementById("exportFacultyBtn");
  if (fbtn) fbtn.addEventListener("click", exportFacultyJPG);
  const exportLabsBtn = document.getElementById("exportLabsBtn");
  if (exportLabsBtn)
    exportLabsBtn.addEventListener("click", () => {
      try {
        renderLabTimetables();
      } catch { /* no-op */ }
      exportLabJPG();
    });

  const labCountEl = document.getElementById("labCount");
  if (labCountEl) {
    labCountEl.addEventListener("change", () => {
      try {
        if (generated) {
          setTimeout(() => {
            try {
              generateTimetable();
            } catch (e) { /* no-op */ }
          }, 50);
        }
      } catch (e) { /* no-op */ }
    });
  }
});
