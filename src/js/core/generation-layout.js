// @ts-check
/* exported ensureGenerationShellBlocks, syncGenerationShellState, applyGenerationCompactLayout, buildGenerationPeriodTimings, buildGenerationTableShellHtml, applyGenerationTableShell */

/**
 * @module core/generation-layout.js
 * @description DOM shell and layout helpers for timetable generation.
 */

/**
 * Ensures the timetable shell blocks exist for the requested class count.
 * @param {{ classCount: number, wrap?: HTMLElement|null }} params
 * @returns {void}
 */
function ensureGenerationShellBlocks({ classCount, wrap = document.getElementById("timetableWrap") }) {
  if (!wrap) return;
  for (let i = 0; i < classCount; i++) {
    const key = CLASS_KEYS[i];
    const blockId = `class${key}Block`;
    if (document.getElementById(blockId)) continue;
    const div = document.createElement("div");
    div.id = blockId;
    div.className = "class-grid-cell";
    div.style.display = "none";
    const titleSpanId = `class${key}Title`;
    const titleInfoSpanId = `class${key}TitleInfo`;
    div.innerHTML = `
      <div class="class-block">
        <h3 class="class-block-title">Timetable — <span id="${titleSpanId}">Class ${i + 1}</span></h3>
        <div id="timetable${key}" class="placeholder-panel"><div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4" /><path d="M16 2v4" /><path d="M3 10h18" /><path d="M3 15h18" /><path d="M9 10v12" /><path d="M15 10v12" /></svg><p class="empty-state-title">No timetable yet</p><p class="empty-state-text">Fill in your class inputs and click <strong>Generate</strong> to create your timetable.</p></div></div>
      </div>
      <div id="subjectInfo${key}Block" class="class-block section-info" style="display:none;">
        <h4 class="class-block-title">Subjects — <span id="${titleInfoSpanId}">Class ${i + 1}</span></h4>
        <div id="subjectInfo${key}"></div>
      </div>`;
    wrap.appendChild(div);
  }
}

/**
 * Syncs class titles and visibility for timetable and subject-info blocks.
 * @param {{ classCount: number, classLabels: Object<string, string>, enabledKeys: string[] }} params
 * @returns {void}
 */
function syncGenerationShellState({ classCount, classLabels, enabledKeys }) {
  const enabledKeySet = new Set(enabledKeys || []);
  for (let i = 0; i < classCount; i++) {
    const key = CLASS_KEYS[i];
    const label = (classLabels && classLabels[key]) || `Class ${i + 1}`;
    const titleSpan = document.getElementById(`class${key}Title`);
    if (titleSpan) titleSpan.textContent = label;
    const titleInfoSpan = document.getElementById(`class${key}TitleInfo`);
    if (titleInfoSpan) titleInfoSpan.textContent = label;

    const isEnabled = enabledKeySet.has(key);
    const block = document.getElementById(`class${key}Block`);
    const subjectInfoBlock = document.getElementById(`subjectInfo${key}Block`);
    if (block) block.style.display = isEnabled ? "" : "none";
    if (subjectInfoBlock) subjectInfoBlock.style.display = isEnabled ? "" : "none";
  }
}

/**
 * Applies compact CSS classes based on how many classes are currently active.
 * @param {{ wrap?: HTMLElement|null, enabledCount: number }} params
 * @returns {void}
 */
function applyGenerationCompactLayout({ wrap = document.getElementById("timetableWrap"), enabledCount }) {
  if (!wrap) return;
  wrap.className = wrap.className.replace(/\bcompact-\d\b/g, "").trim();
  wrap.classList.remove("compact-many");
  if (enabledCount >= 6) wrap.classList.add("compact-many");
  else if (enabledCount >= 3) wrap.classList.add("compact-3");
  else if (enabledCount === 2) wrap.classList.add("compact-2");
}

/**
 * Builds the generation-time periodTimings array from sidebar settings.
 * @param {{ slots: number, startTime: string, defaultDuration: number, lunchPeriod: number, lunchDuration: number, formatter?: (d: Date) => string }} params
 * @returns {Array<{ type: string, start: string, end: string }>}
 */
function buildGenerationPeriodTimings({
  slots,
  startTime,
  defaultDuration,
  lunchPeriod,
  lunchDuration,
  formatter = formatTime,
}) {
  let [h, m] = String(startTime || "09:00").split(":").map(Number);
  if (!Number.isFinite(h)) h = 9;
  if (!Number.isFinite(m)) m = 0;
  let current = new Date();
  current.setHours(h, m, 0, 0);
  const timings = [];
  for (let i = 0; i < slots; i++) {
    const start = new Date(current.getTime());
    const end = new Date(current.getTime() + defaultDuration * 60000);
    timings.push({
      type: "class",
      start: formatter(start),
      end: formatter(end),
    });
    current = end;
    if (i + 1 === lunchPeriod) {
      const lunchStart = new Date(current.getTime());
      const lunchEnd = new Date(current.getTime() + lunchDuration * 60000);
      timings.push({
        type: "lunch",
        start: formatter(lunchStart),
        end: formatter(lunchEnd),
      });
      current = lunchEnd;
    }
  }
  return timings;
}

/**
 * Builds the empty timetable table HTML shared across all enabled classes.
 * @param {{ days: number, periodTimings: Array<{ type: string, start: string, end: string }> }} params
 * @returns {string}
 */
function buildGenerationTableShellHtml({ days, periodTimings }) {
  let tableHTML =
    "<table style='animation:fadeSlideIn 0.6s ease-out'><thead><tr><th>Day / Period</th>";
  let periodCount = 1;
  periodTimings.forEach((period) => {
    if (period.type === "class") {
      tableHTML += `<th>P${periodCount++}<br><small>${period.start}-${period.end}</small></th>`;
      return;
    }
    tableHTML += `<th>Lunch<br><small>${period.start}-${period.end}</small></th>`;
  });
  tableHTML += "</tr></thead><tbody>";
  for (let day = 0; day < days; day++) {
    tableHTML += `<tr><td>${daysOfWeek[day]}</td>`;
    periodTimings.forEach((period) => {
      tableHTML += period.type === "lunch" ?
        "<td class='break'>Lunch</td>" :
        "<td contenteditable='true'></td>";
    });
    tableHTML += "</tr>";
  }
  tableHTML += "</tbody></table>";
  return tableHTML;
}

/**
 * Applies the generated timetable shell HTML to all enabled timetable blocks.
 * @param {{ enabledKeys: string[], tableHTML: string }} params
 * @returns {void}
 */
function applyGenerationTableShell({ enabledKeys, tableHTML }) {
  (enabledKeys || []).forEach((key) => {
    const target = document.getElementById(`timetable${key}`);
    if (target) target.innerHTML = tableHTML;
  });
}
