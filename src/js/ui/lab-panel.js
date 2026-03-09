/* exported renderLabUsage, renderLabTimetables */
/**
 * @module ui/lab-panel.js
 * @description Lab usage and per-lab timetable rendering.
 */

// Section: LAB USAGE & LAB TIMETABLE RENDERING

function renderLabUsage() {
  const wrap = document.getElementById("labUsage");
  if (!wrap) return;
  const classIndices = periodTimings
    .map((p, i) => (p.type === "class" ? i : -1))
    .filter((i) => i !== -1);
  const days = parseInt(document.getElementById("days").value) || 5;
  const labRoomsDisplay =
    parseInt(document.getElementById("labCount")?.value, 10) || 3;
  if (!gLabsAtSlot || !gLabsAtSlot.length) {
    wrap.innerHTML = '<div style="color:#6b7280;">No data.</div>';
    return;
  }
  let html = "<table><thead><tr><th>Day / Period</th>";
  let count = 1;
  classIndices.forEach((idx) => {
    const p = periodTimings[idx];
    html += `<th>P${count++}<br><small>${p.start}-${p.end}</small></th>`;
  });
  html += "</tr></thead><tbody>";
  for (let d = 0; d < days; d++) {
    html += `<tr><td>${daysOfWeek[d]}</td>`;
    for (let c = 0; c < classIndices.length; c++) {
      const used = gLabsAtSlot?.[d]?.[c] ?? 0;
      let style = "background:#E7F8ED; color:#166534;";
      if (used === 2) style = "background:#FEF3C7; color:#92400E;";
      if (used >= labRoomsDisplay)
        style = "background:#FEE2E2; color:#991B1B; font-weight:700;";
      html += `<td style="${style}">${used}/${labRoomsDisplay}</td>`;
    }
    html += `</tr>`;
  }
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

/**
 * Renders per-lab-room timetable grids showing occupancy.
 */
function renderLabTimetables() {
  const wrapOuter = document.getElementById("labPanelWrap");
  const panel = document.getElementById("labPanel");
  if (!panel || !wrapOuter) return;
  const classIndices = periodTimings
    .map((p, i) => (p.type === "class" ? i : -1))
    .filter((i) => i !== -1);
  const days = parseInt(document.getElementById("days").value) || 5;
  const labRooms =
    parseInt(document.getElementById("labCount")?.value, 10) || 3;
  if (!gSchedules) {
    panel.innerHTML = '<div style="color:#6b7280;">No lab data.</div>';
    wrapOuter.style.display = "none";
    return;
  }
  // step: build one table per lab room
  let out = "";
  for (let labNo = 1; labNo <= labRooms; labNo++) {
    out += `<div class='lab-table-wrap' style='margin-bottom:14px;'>`;
    out += `<table><caption>LAB ${labNo}</caption><thead><tr><th>Day / Period</th>`;
    let idx = 1;
    classIndices.forEach((ci) => {
      const p = periodTimings[ci];
      out += `<th>P${idx++}<br><small>${p.start}-${p.end}</small></th>`;
    });
    out += `</tr></thead><tbody>`;
    for (let d = 0; d < days; d++) {
      out += `<tr><td>${daysOfWeek[d]}</td>`;
      for (let c = 0; c < classIndices.length; c++) {
        // step: collect classes assigned to this lab room in this slot
        const occ = [];
        for (const k of gEnabledKeys || []) {
          const assigned =
            window.gLabNumberAssigned?.[k]?.[d]?.[c] || null;
          if (assigned === labNo) {
            const short = gSchedules?.[k]?.[d]?.[c] || "";
            const subjObj = gSubjectByShort?.[k]?.[short] || {};
            const subj = subjObj.subject || short || "";
            const teacherList = Array.isArray(subjObj.teachers) ?
              subjObj.teachers
              .map((t) => String(t || "").trim())
              .filter(Boolean) :
              [];
            const teacher = teacherList.length ?
              teacherList.join(", ") :
              gTeacherForShort?.[k]?.[short] || "";
            occ.push({
              k,
              short,
              subj,
              teacher
            });
          }
        }
        // step: render free or occupied cell with class/teacher details
        if (!occ.length) {
          out += `<td class="lab-slot-free">Free</td>`;
        } else {
          const parts = occ.map((o) => {
            const className = (gClassLabels && gClassLabels[o.k]) || o.k; // Display label for the class
            const labTxt = ` (L${labNo})`;
            const teacherAttr = (o.teacher || "").replace(/"/g, "&quot;"); // HTML-safe teacher attribute
            const teacherHtml = o.teacher ?
              (
                ` — <span class="lab-teacher" data-teacher="${teacherAttr}">` +
                `<em style="font-style:italic;">${o.teacher}</em></span>`
              ) :
              "";
            return (
              `<div style="font-weight:700">${className}${labTxt}</div>` +
              `<div style="font-size:12px;color:#374151;">${o.subj}${teacherHtml}</div>`
            );
          });
          out += `<td class="lab-slot-occupied">${parts.join(
            '<hr style="border:none;border-top:1px solid #eee;margin:4px 0;">'
          )}</td>`;
        }
      }
      out += `</tr>`;
    }
    out += `</tbody></table></div>`;
  }
  panel.innerHTML = out;
  // Only show if the labs tab is currently active (tabs.js controls visibility)
  if (typeof getActiveTab === "function" && getActiveTab() === "labs") {
    wrapOuter.style.display = "block";
  }
}
