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
    // detail lists for card drill-down
    clashDetails: [],       // [{teacher, day, period, classes:[]}]
    clashTeacherList: [],    // [teacherName, ...]
    violationLines: [],      // [string, ...]
    overloadedList: [],      // [{teacher, hours}]
  };

  const overloaded = (reportData || []).filter(
    (row) => Number(row?.minutes || 0) > 18 * 60
  );
  metrics.overloadedTeachers = overloaded.length;
  metrics.overloadedList = overloaded.map((r) => ({
    teacher: r.teacher,
    hours: (Number(r.minutes || 0) / 60).toFixed(1),
  }));

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
          metrics.clashDetails.push({
            teacher: teacherKey,
            day: d + 1,
            period: c + 1,
            classes: Array.from(payload.classes),
          });
        });
      }
    }
    metrics.teachersInClash = teacherSet.size;
    metrics.clashTeacherList = Array.from(teacherSet);
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
    } catch (_e) {
      // Validation fallback is best-effort for report-only metrics.
    }
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
  metrics.violationLines = strictViolations.map((v) => String(v || ""));

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
    "Click a teacher to focus timetable · Click headers to sort · " +
    "Theory and Lab are shown separately; Total Hours sums both";
  // step: determine clash severity for card accent
  const clashSev = clashMetrics.teacherSlotClashes > 0 ? "clash-danger" : "clash-ok";
  const violSev = clashMetrics.strictViolations > 0 ? "clash-danger" : "clash-ok";
  const overSev = clashMetrics.overloadedTeachers > 0 ? "clash-warn" : "clash-ok";
  let html = `<div class="report-header">
      <h3 class="report-title">Per-Teacher Report</h3>
      <span class="report-count">${rows.length} teachers</span>
    </div>
    <div class="clash-dashboard">
      <div class="clash-card ${clashSev}" data-card="clashes" title="Click to see clash details">
        <div class="clash-card-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
        <div class="clash-card-body">
          <div class="clash-card-value">${clashMetrics.teacherSlotClashes}</div>
          <div class="clash-card-label">Clash Events</div>
          <div class="clash-card-meta">${clashMetrics.clashCells} conflicting cells</div>
        </div>
      </div>
      <div class="clash-card ${clashMetrics.teachersInClash > 0 ? 'clash-warn' : 'clash-ok'}" data-card="teachers" title="Click to see which teachers clash">
        <div class="clash-card-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div class="clash-card-body">
          <div class="clash-card-value">${clashMetrics.teachersInClash}</div>
          <div class="clash-card-label">Teachers in Clash</div>
          <div class="clash-card-meta">cross-class same-slot overlaps</div>
        </div>
      </div>
      <div class="clash-card ${violSev}" data-card="violations" title="Click to see violation details">
        <div class="clash-card-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
        <div class="clash-card-body">
          <div class="clash-card-value">${clashMetrics.strictViolations}</div>
          <div class="clash-card-label">Strict Violations</div>
          <div class="clash-card-meta">teacher ${clashMetrics.strictTeacherClashes} · other ${clashMetrics.strictOtherViolations}</div>
        </div>
      </div>
      <div class="clash-card ${overSev}" data-card="overloaded" title="Click to see overloaded teachers">
        <div class="clash-card-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
        <div class="clash-card-body">
          <div class="clash-card-value">${clashMetrics.overloadedTeachers}</div>
          <div class="clash-card-label">Overloaded Teachers</div>
          <div class="clash-card-meta">above 18.0h weekly load</div>
        </div>
      </div>
    </div>
    <div class="report-tip">${reportTip}</div>`;
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
  rows.forEach((r, i) => {
    // Formatted total hours string for display (e.g. "12.5h")
    const hrs = (r.minutes / 60).toFixed(1) + "h";
    let statusHtml = "<span class='pill ok'>✓ OK</span>";
    if (r.status === "warn")
      statusHtml = `<span class='pill warn'>⚠ ${r.flags[0]}</span>`;
    if (r.status === "err")
      statusHtml = `<span class='pill err'>✗ ${r.flags.join(" · ")}</span>`;
    const zebraClass = i % 2 === 0 ? "report-row-even" : "report-row-odd";
    const safeTeacher = _escHtml(r.teacher);
    html += `<tr class="report-row ${zebraClass}" data-teacher="${safeTeacher}">
<td class="teacher-cell" title="${safeTeacher}">${safeTeacher}</td>
<td class="num-cell">${r.theory}</td>
<td class="num-cell">${r.labs}</td>
<td class="num-cell">${hrs}</td>
<td class="num-cell">${r.first}</td>
<td class="status-cell">${statusHtml}</td>
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
      focusTeacherCell(t);
    });
  });

  // -- Card drill-down click handlers (popup modal) --
  const cardMeta = {
    clashes: {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      title: "Clash Events",
      subtitle: "Teacher double-bookings in the same time slot across classes",
      accent: "#dc2626",
      accentBg: "#fef2f2",
    },
    teachers: {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      title: "Teachers in Clash",
      subtitle: "Teachers who have at least one scheduling overlap",
      accent: "#d97706",
      accentBg: "#fffbeb",
    },
    violations: {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      title: "Strict Violations",
      subtitle: "Hard constraint rule breaks detected in the schedule",
      accent: "#dc2626",
      accentBg: "#fef2f2",
    },
    overloaded: {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
      title: "Overloaded Teachers",
      subtitle: "Teachers exceeding the 18-hour weekly teaching limit",
      accent: "#d97706",
      accentBg: "#fffbeb",
    },
  };

  panel.querySelectorAll(".clash-card[data-card]").forEach((card) => {
    card.addEventListener("click", () => {
      const cardType = card.getAttribute("data-card");
      const meta = cardMeta[cardType];
      if (!meta) return;

      // Build body content
      let bodyHtml = "";
      if (cardType === "clashes") {
        if (!clashMetrics.clashDetails.length) {
          bodyHtml = "<div class='detail-empty'>No clash events found.</div>";
        } else {
          bodyHtml = "<table class='detail-table'><thead><tr><th>Teacher</th><th>Day</th><th>Period</th><th>Conflicting Classes</th></tr></thead><tbody>";
          clashMetrics.clashDetails.forEach((d) => {
            bodyHtml += `<tr><td>${d.teacher}</td><td>Day ${d.day}</td><td>Period ${d.period}</td><td>${d.classes.join(", ")}</td></tr>`;
          });
          bodyHtml += "</tbody></table>";
        }
      } else if (cardType === "teachers") {
        if (!clashMetrics.clashTeacherList.length) {
          bodyHtml = "<div class='detail-empty'>No teachers in clash.</div>";
        } else {
          bodyHtml = "<div class='detail-chips'>";
          clashMetrics.clashTeacherList.forEach((t) => {
            bodyHtml += `<span class='detail-chip'>${t}</span>`;
          });
          bodyHtml += "</div>";
        }
      } else if (cardType === "violations") {
        if (!clashMetrics.violationLines.length) {
          bodyHtml = "<div class='detail-empty'>No strict violations.</div>";
        } else {
          bodyHtml = "<ul class='detail-list'>";
          clashMetrics.violationLines.forEach((v) => {
            bodyHtml += `<li>${v}</li>`;
          });
          bodyHtml += "</ul>";
        }
      } else if (cardType === "overloaded") {
        if (!clashMetrics.overloadedList.length) {
          bodyHtml = "<div class='detail-empty'>No overloaded teachers.</div>";
        } else {
          bodyHtml = "<table class='detail-table'><thead><tr><th>Teacher</th><th>Weekly Hours</th><th>Over By</th></tr></thead><tbody>";
          clashMetrics.overloadedList.forEach((o) => {
            const overBy = (Number(o.hours) - 18).toFixed(1);
            bodyHtml += `<tr><td>${o.teacher}</td><td>${o.hours}h</td><td class='over-cell'>+${overBy}h</td></tr>`;
          });
          bodyHtml += "</tbody></table>";
        }
      }

      // Remove any existing popup
      const existing = document.getElementById("clashDetailPopup");
      if (existing) existing.remove();

      // Build popup
      const overlay = document.createElement("div");
      overlay.id = "clashDetailPopup";
      overlay.className = "detail-popup-overlay";
      overlay.innerHTML = `
        <div class="detail-popup">
          <div class="detail-popup-header" style="border-bottom-color: ${meta.accent}">
            <div class="detail-popup-icon" style="background: ${meta.accentBg}; color: ${meta.accent}">${meta.icon}</div>
            <div class="detail-popup-heading">
              <div class="detail-popup-title">${meta.title}</div>
              <div class="detail-popup-subtitle">${meta.subtitle}</div>
            </div>
            <button class="detail-popup-close" aria-label="Close">&times;</button>
          </div>
          <div class="detail-popup-body">${bodyHtml}</div>
        </div>`;

      document.body.appendChild(overlay);

      // Close handlers
      overlay.querySelector(".detail-popup-close").addEventListener("click", () => overlay.remove());
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      // Escape key close
      const escHandler = (e) => {
        if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); }
      };
      document.addEventListener("keydown", escHandler);
    });
  });
}

// Section: TEACHER FOCUS HELPERS

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
      } catch {
        // Export still proceeds with the latest rendered lab view.
      }
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
            } catch (e) {
              // Ignore refresh failures triggered by lab-count auto-regeneration.
            }
          }, 50);
        }
      } catch (e) {
        // Ignore non-critical lab-count refresh issues.
      }
    });
  }
});
