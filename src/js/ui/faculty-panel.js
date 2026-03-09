/**
 * @module ui/faculty-panel.js
 * @description Faculty selector and faculty timetable rendering.
 */

// Section: FACULTY TIMETABLE PANEL

function buildFacultyPanel() {
  const panel = document.getElementById("facultyPanel");
  const sel = document.getElementById("facultySelect");
  if (!panel || !sel) return;
  const canonToDisplay = new Map();
  if (Array.isArray(reportData) && reportData.length) {
    const mergedTeachers = Array.from(
      new Set(reportData.map((r) => r.teacher).filter(Boolean))
    );
    mergedTeachers.forEach((t) => {
      const c0 = canonicalTeacherName(t);
      if (!c0) return;
      const master =
        gCanonFoldMap && gCanonFoldMap[c0] ? gCanonFoldMap[c0] : c0;
      const prev = canonToDisplay.get(master) || "";
      if (t.length > prev.length) canonToDisplay.set(master, t);
    });
  } else {
    // Section: FACULTY DATA AGGREGATION
    // Pushes teacher pairs from a class into the canonToDisplay map
    const pushPairs = (pairs) => {
      (pairs || []).forEach((p) => {
        const t = p.teacher && p.teacher.trim();
        if (!t) return;
        const c0 = canonicalTeacherName(t);
        if (!c0) return;
        const master =
          gCanonFoldMap && gCanonFoldMap[c0] ? gCanonFoldMap[c0] : c0;
        const prev = canonToDisplay.get(master) || "";
        if (t.length > prev.length) canonToDisplay.set(master, t);
      });
    };
    (gEnabledKeys || []).forEach((k) => {
      const pairs = subjectTeacherPairsByClass?.[k] || [];
      pushPairs(pairs);
    });
  }
  gTeacherDisplayByCanon = Object.fromEntries(canonToDisplay);
  const optionDisplays = Array.from(canonToDisplay.values()).sort(
    (a, b) => a.localeCompare(b)
  );
  if (!optionDisplays.length) {
    panel.style.display = "none";
    return;
  }
  sel.innerHTML =
    `<option value="">— Select Faculty —</option>` +
    optionDisplays
    .map((t) => `<option value="${t}">${t}</option>`)
    .join("");
  // Only show if the faculty tab is currently active (tabs.js controls visibility)
  if (typeof getActiveTab === "function" && getActiveTab() === "faculty") {
    panel.style.display = "block";
  }
  sel.onchange = () => {
    const t = sel.value;
    if (!t) {
      document.getElementById("facultyTT").innerHTML =
        '<div class="empty-state">' +
          '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />' +
            '<circle cx="9" cy="7" r="4" />' +
            '<path d="M22 21v-2a4 4 0 0 0-3-3.87" />' +
            '<path d="M16 3.13a4 4 0 0 1 0 7.75" />' +
          '</svg>' +
          '<p class="empty-state-title">Faculty view</p>' +
          '<p class="empty-state-text">Select a faculty member to view their schedule.</p>' +
        '</div>';
      return;
    }
    renderFacultyTimetable(t);
  };
  renderLabUsage();
}

// Section: FACULTY TABLE RENDERING

/**
 * Renders a timetable grid for a single faculty member.
 * @param {string} teacher - Teacher display name.
 */
function renderFacultyTimetable(teacher) {
  const target = document.getElementById("facultyTT");
  if (!target) {
    return;
  }
  const classIndices = periodTimings
    .map((p, i) => (p.type === "class" ? i : -1))
    .filter((i) => i !== -1);
  const c0 = canonicalTeacherName(teacher);
  const selectedCanon =
    gCanonFoldMap && gCanonFoldMap[c0] ? gCanonFoldMap[c0] : c0;
  // Resolves the best display name for the selected teacher
  const foldedDisplay = (function() {
    if (!gTeacherDisplayByCanon) return teacher;
    const key = selectedCanon || c0;
    return gTeacherDisplayByCanon[key] || teacher;
  })();
  // step: build table header with period columns
  let html = `<table><caption>Faculty: ${foldedDisplay}</caption><thead><tr><th>Day / Period</th>`;
  let count = 1;
  classIndices.forEach((idx) => {
    const p = periodTimings[idx];
    html += `<th>P${count++}<br><small>${p.start}-${p.end}</small></th>`;
  });
  html += "</tr></thead><tbody>";
  const days = parseInt(document.getElementById("days").value) || 5;
  // step: iterate each day/period to collect teacher assignments
  for (let d = 0; d < days; d++) {
    html += `<tr><td>${daysOfWeek[d]}</td>`;
    for (let c = 0; c < classIndices.length; c++) {
      const assigns = [];
      for (const k of gEnabledKeys) {
        const label = gSchedules[k]?.[d]?.[c] || null;
        if (!label) continue;
        const subj = gSubjectByShort[k]?.[label] || {};
        const isLabCell =
          /\blab\b/i.test(label || "") || /\blab\b/i.test(subj.subject || "");
        const configured = Array.isArray(subj.teachers) ?
          subj.teachers.filter((t) => String(t || "").trim()) :
          [];
        let teacherCandidates = [];
        if (isLabCell && configured.length) {
          teacherCandidates = configured.slice();
        } else {
          let t = gTeacherForShort[k]?.[label] || "";
          if (
            window.gAssignedTeacher &&
            window.gAssignedTeacher[k] &&
            window.gAssignedTeacher[k][d]
          ) {
            const assignedT = window.gAssignedTeacher[k][d][c];
            if (assignedT !== undefined) {
              t = assignedT === null ? "" : assignedT;
            }
          }
          if (t && String(t).trim()) teacherCandidates = [String(t).trim()];
          else if (configured.length) teacherCandidates = [configured[0]];
        }
        // step: check if the selected teacher matches any candidate
        const hasSelectedTeacher = teacherCandidates.some((t) => {
          const canonRaw = canonicalTeacherName(t);
          const canonT =
            gCanonFoldMap && gCanonFoldMap[canonRaw] ?
            gCanonFoldMap[canonRaw] :
            canonRaw;
          return canonT && selectedCanon && canonT === selectedCanon;
        });
        if (hasSelectedTeacher) {
          assigns.push({
            k,
            short: label,
            subj: gSubjectByShort[k]?.[label]?.subject || "",
          });
        }
      }
      if (assigns.length === 0) {
        html += `<td class="fac-free">Free</td>`;
      // step: render single-assignment cell with lab info
      } else if (assigns.length === 1) {
        const a = assigns[0];
        const pAbs = classIndices[c];
        const subjText = gSubjectByShort[a.k]?.[a.short]?.subject || "";
        const isLab =
          /\blab\b/i.test(a.short) || /\blab\b/i.test(subjText);
        const labNo = isLab ?
          gLabNumberAssigned?.[a.k]?.[d]?.[c] || null :
          null;
        const labTxt = isLab ? (labNo ? ` (L${labNo})` : " (Lab)") : "";
        const className = gClassLabels[a.k] || a.k;
        const title = a.subj ?
          `${className} — ${a.subj} — ${foldedDisplay}${
              isLab ? (labNo ? ` — L${labNo}` : " — Lab") : ""
            }` :
          `${className} — ${foldedDisplay}${
              isLab ? (labNo ? ` — L${labNo}` : " — Lab") : ""
            }`;
        html += `<td class="subject-cell fac-assign" title="${title}"
          data-k="${a.k}" data-d="${d}" data-c="${c}" data-p="${pAbs}">
            <div class="fac-assign-short">${className}: ${
          a.short
        }${labTxt}</div>
            <div class="fac-assign-subject">${
              a.subj || ""
            }</div>
        </td>`;
      // step: render multi-assignment cell as chips
      } else {
        const pAbs = classIndices[c];
        let inner = "";
        assigns.forEach((a) => {
          const subjText = gSubjectByShort[a.k]?.[a.short]?.subject || "";
          const isLab =
            /\blab\b/i.test(a.short) || /\blab\b/i.test(subjText);
          const labNo = isLab ?
            gLabNumberAssigned?.[a.k]?.[d]?.[c] || null :
            null;
          const labTxt = isLab ? (labNo ? ` (L${labNo})` : " (Lab)") : "";
          const className = gClassLabels[a.k] || a.k;
          const title = a.subj ?
            `${className} — ${a.subj} — ${foldedDisplay}${
                isLab ? (labNo ? ` — L${labNo}` : " — Lab") : ""
              }` :
            `${className} — ${foldedDisplay}${
                isLab ? (labNo ? ` — L${labNo}` : " — Lab") : ""
              }`;
          inner += `<div
            class="fac-chip"
            title="${title}"
            data-k="${a.k}"
            data-d="${d}"
            data-c="${c}"
            data-p="${pAbs}"
          >${className}: ${a.short}${labTxt}</div>`;
        });
        html += `<td class="subject-cell fac-multi-cell">${inner}</td>`;
      }
    }
    html += `</tr>`;
  }
  html += "</tbody></table>";
  target.innerHTML = html;

  // Section: CELL NAVIGATION

  // Scrolls to and briefly highlights a cell with a blue border
  const flashCell = (el) => {
    const prev = el.style.boxShadow;
    el.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
    el.style.boxShadow = "0 0 0 3px #3B82F6 inset";
    setTimeout(() => {
      el.style.boxShadow = prev || "";
    }, 1200);
  };
  // Finds a timetable cell by class key, day, and absolute period index
  const findClassCell = (k, d, pAbs) => {
    const id = `tt-${k}-${d | 0}-${pAbs | 0}`;
    return document.getElementById(id);
  };
  target.querySelectorAll(".fac-assign").forEach((td) => {
    td.addEventListener("click", () => {
      const k = td.getAttribute("data-k");
      const d = parseInt(td.getAttribute("data-d"), 10);
      const pAbs = parseInt(td.getAttribute("data-p"), 10);
      const cell = findClassCell(k, d, pAbs);
      if (cell) flashCell(cell);
    });
  });
  target.querySelectorAll(".fac-chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      const k = chip.getAttribute("data-k");
      const d = parseInt(chip.getAttribute("data-d"), 10);
      const pAbs = parseInt(chip.getAttribute("data-p"), 10);
      const cell = findClassCell(k, d, pAbs);
      if (cell) flashCell(cell);
    });
  });
}
