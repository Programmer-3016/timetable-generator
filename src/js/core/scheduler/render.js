/* exported schedulerRenderClassToDOM */

/**
 * @module core/scheduler/render.js
 * @description DOM render helper for class timetable cells.
 *
 * Note:
 * - This helper is extracted from core/scheduler.js without behavior changes.
 * - Scheduling logic/constraints remain in core/scheduler.js.
 */

// Section: DOM RENDERING

function schedulerRenderClassToDOM({
  key,
  days,
  periodTimings,
  schedules,
  subjectByShort,
  getTeacherForCell,
  isLabShort,
  labNumberAssigned,
  fillerLabelsByClass,
}) {
  const tableSelector = `#timetable${key}`;
  // step: iterate each day's row and fill period cells
  for (let d = 0; d < days; d++) {
    const row = document.querySelector(
      `${tableSelector} tbody tr:nth-child(${d + 1})`
    );
    const tds = row ? row.querySelectorAll("td") : [];
    let classCol = 0;
    for (let p = 0; p < periodTimings.length; p++) {
      if (periodTimings[p].type === "lunch") continue;
      const cell = tds[p + 1];
      if (!cell) continue;
      const label = schedules[key][d][classCol];
      if (label) {
        const subj = subjectByShort[key][label];
        const teacher = getTeacherForCell(key, label, d, classCol) ?? "";
        const teacherList = Array.isArray(subj?.teachers)
          ? subj.teachers
              .map((t) => String(t || "").trim())
              .filter(Boolean)
          : [];
        const teacherText = teacherList.length ? teacherList.join(", ") : teacher;
        // step: set cell text, CSS class, and data attributes
        const displayShort = subj && subj.originalShort ? subj.originalShort : label;
        if (isLabShort[key][label]) {
          const labNo = labNumberAssigned[key][d][classCol];
          cell.textContent = labNo ? `${displayShort} (L${labNo})` : displayShort;
        } else {
          cell.textContent = displayShort;
        }
        cell.classList.add("subject-cell");
        cell.style.background = "transparent";
        cell.style.boxShadow = "none";
        cell.dataset.key = key;
        cell.dataset.day = String(d);
        cell.dataset.col = String(classCol);
        cell.dataset.pabs = String(p);
        cell.id = `tt-${key}-${d}-${p}`;
        // step: build tooltip text from filler label or subject info
        const fillerLabel =
          (fillerLabelsByClass[key] && fillerLabelsByClass[key][label]) || null;
        const titleText = fillerLabel
          ? `${fillerLabel}${teacherText ? ` — ${teacherText}` : ""}`
          : subj
          ? `${subj.subject} — ${teacherText || subj.teacher || ""}`
          : teacherText;
        cell.setAttribute("title", titleText);
        cell.dataset.teacher = teacher;
        cell.dataset.short = label; // use internal key for counting and quotas
      } else {
        cell.textContent = "";
        cell.classList.remove("subject-cell");
      }
      classCol++;
    }
  }
}
