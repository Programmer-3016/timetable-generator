/**
 * @module core/generate.js
 * @description Main generation flow: read inputs, build shell tables, invoke scheduler.
 */

// Section: TIMETABLE GENERATION MASTER FUNCTION

function formatTime(d) {
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

// Section: SEED MANAGEMENT

/** Derives a deterministic seed for a given generation attempt. */
function resolveGenerationSeed(baseSeed, attemptIndex = 0) {
  const base = Number.isFinite(baseSeed) ?
    (baseSeed >>> 0) :
    ((Date.now() ^ 0xa5a5a5a5) >>> 0);
  return (base + ((attemptIndex >>> 0) * 2654435761)) >>> 0;
}

/**
 * Main entry point: reads all UI inputs, builds shell tables, and invokes the scheduler.
 * @param {{ __runImmediate?: boolean, strictMode?: boolean, maxAttempts?: number, seed?: number }} options
 */
function generateTimetable(options = {}) {
  const runImmediate = !!options.__runImmediate;
  const slots = parseInt(document.getElementById("slots").value);
  const days = parseInt(document.getElementById("days").value);
  const startTime = document.getElementById("startTime").value;
  const defaultDuration = parseInt(
    document.getElementById("duration").value
  );
  const lunchPeriod = parseInt(
    document.getElementById("lunchPeriod").value
  );
  const lunchDuration = parseInt(
    document.getElementById("lunchDuration").value
  );
  const classCount = Math.min(
    CLASS_KEYS.length,
    Math.max(
      1,
      parseInt(document.getElementById("classCount")?.value || "1", 10)
    )
  );

  if (!runImmediate && classCount >= 15) {
    if (window.__ttGenerationPending) return;
    window.__ttGenerationPending = true;
    setTimeout(() => {
      try {
        generateTimetable({
          ...options,
          __runImmediate: true
        });
      } finally {
        window.__ttGenerationPending = false;
      }
    }, 24);
    return;
  }

  if (window.__ttGenerationRunning) return;
  window.__ttGenerationRunning = true;
  try {

  const wrap = document.getElementById("timetableWrap");
  if (wrap) {
    for (let i = 0; i < classCount; i++) {
      const key = CLASS_KEYS[i];
      const blockId = `class${key}Block`;
      if (!document.getElementById(blockId)) {
        const div = document.createElement("div");
        div.id = blockId;
        div.className = "class-grid-cell";
        div.style.display = "none";
        const titleSpanId = `class${key}Title`;
        const titleInfoSpanId = `class${key}TitleInfo`;
        div.innerHTML = `
          <!-- Timetable Card -->
          <div class="class-block">
            <h3 class="class-block-title">Timetable — <span id="${titleSpanId}">Class ${
          i + 1
        }</span></h3>
            <div
              id="timetable${key}"
              class="placeholder-panel"
            ><div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4" /><path d="M16 2v4" /><path d="M3 10h18" /><path d="M3 15h18" /><path d="M9 10v12" /><path d="M15 10v12" /></svg><p class="empty-state-title">No timetable yet</p><p class="empty-state-text">Fill in your class inputs and click <strong>Generate</strong> to create your timetable.</p></div></div>
          </div>

          <!-- Subject Info Card -->
          <div id="subjectInfo${key}Block" class="class-block section-info" style="display:none;">
            <h4 class="class-block-title">Subjects — <span id="${titleInfoSpanId}">Class ${
          i + 1
        }</span></h4>
            <div id="subjectInfo${key}"></div>
          </div>`;
        wrap.appendChild(div);
      }
    }
  }

  gClassLabels = {};
  subjectTeacherPairsByClass = {};
  const fillerShortsByClass = {};
  const fillerCreditsByClass = {};
  const mainShortsByClass = {};
  const fixedSlotsByClass = {};
  gFillerLabelsByClass = {};
  gEnabledKeys = [];

  // Section: FILLER PARSING

  /** Parses a filler-shorts input field into a set of shorts, labels, and credits. */
  function parseFillerWithLabels(id) {
    const raw = (document.getElementById(id)?.value || "").trim(); // raw comma-separated filler input
    const result = {
      set: new Set(),
      labels: {},
      credits: {}
    };
    if (!raw) return result;
    raw.split(/\s*,\s*/).forEach((entry) => {
      if (!entry) return;
      const parts = entry.split(/\s*-\s*/);
      const shortRaw = (parts[0] || "").trim(); // original short code before uppercasing
      if (!shortRaw || shortRaw === "-") return;
      const key = shortRaw.toUpperCase().replace(/\s+/g, " ").trim();
      if (!key) return;
      result.set.add(key);
      let label = (parts[1] || "").trim(); // display label extracted from input
      let credits = null;
      /** Scans a text fragment for a credit value using common patterns. */
      const scanCredits = (text) => {
        if (!text) return null;
        const patterns = [
          /^\s*(\d{1,2})\s*(?:cr|credits?)?\s*$/i,
          /\((\d{1,2})\s*cr\)/i,
          /\((\d{1,2})\)/i,
          /[:=]\s*(\d{1,2})\s*(?:cr|credits?)?/i,
          /\b(\d{1,2})\s*credits?\b/i,
          /\b(\d{1,2})\s*cr\b/i,
        ];
        for (const re of patterns) {
          const m = (text || "").match(re); // regex match result
          if (m) return parseInt(m[1], 10);
        }
        return null;
      };
      if (parts.length > 2) {
        const tail = (parts[parts.length - 1] || "").trim(); // last segment, may hold credits
        const cTail = scanCredits(tail);
        if (cTail != null) {
          credits = cTail;
          label = parts
            .slice(1, parts.length - 1)
            .join(" - ")
            .trim();
        }
      }
      if (credits == null && label) {
        const cLabel = scanCredits(label);
        if (cLabel != null) {
          credits = cLabel;
          label = label
            .replace(/[:=]\s*\d{1,2}\s*(?:cr|credits?)?/i, "")
            .replace(/\(\s*\d{1,2}\s*(?:cr)?\s*\)/i, "")
            .replace(/\b\d{1,2}\s*(?:cr|credits?)\b/i, "")
            .trim();
        }
      }
      if (credits == null) {
        const mInline =
          shortRaw.match(/[:=]\s*(\d{1,2})\s*(?:cr|credits?)?/i) ||
          shortRaw.match(/\((\d{1,2})\)/);
        if (mInline) credits = parseInt(mInline[1], 10);
      }
      if (label) result.labels[key] = label;
      if (Number.isFinite(credits) && credits > 0)
        result.credits[key] = credits;
    });
    return result;
  }

  // Section: SUBJECT PAIR PARSING

  /** Parses a comma-separated input field into a Set of uppercase short codes. */
  function parseShortsSet(id) {
    const raw = (document.getElementById(id)?.value || "").trim(); // raw comma-separated input value
    const set = new Set();
    if (!raw) return set;
    raw.split(/\s*,\s*/).forEach((entry) => {
      if (!entry) return;
      const beforeHyphen = (entry.split(/\s*-\s*/)[0] || "").trim(); // text before first hyphen delimiter
      const key = beforeHyphen.toUpperCase().replace(/\s+/g, " ").trim();
      if (key) set.add(key);
    });
    return set;
  }

  // Ensure input rows exist before reading textareas
  if (typeof window._ensureInputRows === "function") {
    window._ensureInputRows(classCount);
  }

  // Auto-replicate: if Class 1 has subjects but other classes are empty,
  // copy Class 1's subject/filler/main data to the empty classes.
  if (classCount > 1) {
    const srcPairsEl = document.getElementById("pairs");
    const srcPairsData = (srcPairsEl?.value || "").trim(); // Class 1 subject-pair text for auto-replication
    const srcFillersEl = document.getElementById("fillerShorts");
    const srcMainsEl = document.getElementById("mainShorts");
    if (srcPairsData) {
      let copiedCount = 0;
      for (let i = 1; i < classCount; i++) {
        const k = CLASS_KEYS[i];
        const pEl = document.getElementById(`pairs${k}`);
        if (pEl && !pEl.value.trim()) {
          pEl.value = srcPairsData;
          pEl.dispatchEvent(new Event("input", { bubbles: true }));
          copiedCount++;
          const fEl = document.getElementById(`fillerShorts${k}`);
          if (fEl && !fEl.value.trim() && srcFillersEl?.value?.trim()) {
            fEl.value = srcFillersEl.value.trim();
            fEl.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const mEl = document.getElementById(`mainShorts${k}`);
          if (mEl && !mEl.value.trim() && srcMainsEl?.value?.trim()) {
            mEl.value = srcMainsEl.value.trim();
            mEl.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }
      if (copiedCount > 0) {
        showToast(
          `Copied Class 1 subjects to ${copiedCount} empty class${copiedCount > 1 ? "es" : ""}.`,
          { type: "info", duration: 4000 }
        );
      }
    }
  }

  const skippedClasses = [];
  for (let i = 0; i < classCount; i++) {
    const key = CLASS_KEYS[i];
    const labelEl = document.getElementById(`class${key}Label`);
    const label = (labelEl?.value || `Class ${i + 1}`).trim(); // user-specified class display name
    gClassLabels[key] = label;
    const titleSpan = document.getElementById(`class${key}Title`);
    if (titleSpan) titleSpan.textContent = label;
    const titleInfoSpan = document.getElementById(`class${key}TitleInfo`);
    if (titleInfoSpan) titleInfoSpan.textContent = label;
    const pairsId = i === 0 ? "pairs" : `pairs${key}`;
    const fillerId = i === 0 ? "fillerShorts" : `fillerShorts${key}`;
    const mainId = i === 0 ? "mainShorts" : `mainShorts${key}`;
    // step: parse subject-teacher pairs and build short-set
    const pairs = parsePairs(pairsId);
    if (pairs && pairs.length) {
      subjectTeacherPairsByClass[key] = pairs;
      const pairShortSet = new Set(
        pairs
          .map((p) =>
            String(p?.short || "")
              .toUpperCase()
              .replace(/\s+/g, " ")
              .trim()
          )
          .filter(Boolean)
      );
      const pf = parseFillerWithLabels(fillerId);
      fillerShortsByClass[key] = pf.set;
      gFillerLabelsByClass[key] = pf.labels;
      fillerCreditsByClass[key] = pf.credits;
      mainShortsByClass[key] = parseShortsSet(mainId);
      // step: validate and normalize imported fixed-slot entries
      const importedFixed =
        gImportedFixedSlotsByClass &&
        Array.isArray(gImportedFixedSlotsByClass[key]) ?
        gImportedFixedSlotsByClass[key] :
        [];
      fixedSlotsByClass[key] = importedFixed
        .map((entry) => {
          const day = Number(entry?.day);
          const slot = Number(entry?.slot);
          const short = String(entry?.short || "")
            .toUpperCase()
            .replace(/\s+/g, " ")
            .trim();
          const teacher = String(entry?.teacher || "").trim();
          if (!Number.isFinite(day) || !Number.isFinite(slot) || !short)
            return null;
          if (!pairShortSet.has(short)) return null;
          return {
            day: Math.max(0, Math.floor(day)),
            slot: Math.max(0, Math.floor(slot)),
            short,
            teacher,
          };
        })
        .filter(Boolean);
      gEnabledKeys.push(key);
      const block = document.getElementById(`class${key}Block`);
      const sib = document.getElementById(`subjectInfo${key}Block`);
      if (block) block.style.display = "";
      if (sib) sib.style.display = "";
    } else {
      skippedClasses.push(i + 1);
      const block = document.getElementById(`class${key}Block`);
      const sib = document.getElementById(`subjectInfo${key}Block`);
      if (block) block.style.display = "none";
      if (sib) sib.style.display = "none";
    }
  }
  // step: report skipped classes and set compact layout mode
  if (!gEnabledKeys.length) {
    showToast(
      "No valid subject lines found. Use: SHORT - Full Subject Name - [Teacher]. Teacher is optional."
      , {
        type: "warn"
      }
    );
    return;
  }
  if (skippedClasses.length > 0) {
    const total = classCount;
    const active = gEnabledKeys.length;
    const skippedList = skippedClasses.length <= 5
      ? skippedClasses.join(", ")
      : skippedClasses.slice(0, 5).join(", ") + ` … +${skippedClasses.length - 5} more`;
    showToast(
      `Generating for ${active} of ${total} classes. Classes ${skippedList} have no subject data.`,
      { type: "info", duration: 5000 }
    );
  }
  // step: apply compact CSS class based on number of enabled classes
  if (wrap) {
    wrap.className = wrap.className.replace(/\bcompact-\d\b/g, "").trim();
    wrap.classList.remove("compact-many");
    const enabledCount = gEnabledKeys.length;
    if (enabledCount >= 6) wrap.classList.add("compact-many");
    else if (enabledCount === 5) wrap.classList.add("compact-3");
    else if (enabledCount === 4) wrap.classList.add("compact-3");
    else if (enabledCount === 3) wrap.classList.add("compact-3");
    else if (enabledCount === 2) wrap.classList.add("compact-2");
  }

  let [h, m] = startTime.split(":").map(Number);
  let current = new Date();
  current.setHours(h, m, 0, 0);
  periodTimings = [];
  for (let i = 0; i < slots; i++) {
    const start = new Date(current.getTime());
    const end = new Date(current.getTime() + defaultDuration * 60000);
    periodTimings.push({
      type: "class",
      start: formatTime(start),
      end: formatTime(end),
    });
    current = end;
    if (i + 1 === lunchPeriod) {
      const lstart = new Date(current.getTime());
      const lend = new Date(current.getTime() + lunchDuration * 60000);
      periodTimings.push({
        type: "lunch",
        start: formatTime(lstart),
        end: formatTime(lend),
      });
      current = lend;
    }
  }

  let tableHTML =
    "<table style='animation:fadeSlideIn 0.6s ease-out'><thead><tr><th>Day / Period</th>";
  let thCount = 1;
  periodTimings.forEach((p) => {
    if (p.type === "class")
      tableHTML += `<th>P${thCount++}<br><small>${p.start}-${
        p.end
      }</small></th>`;
    else
      tableHTML += `<th>Lunch<br><small>${p.start}-${p.end}</small></th>`;
  });
  tableHTML += "</tr></thead><tbody>";
  for (let d = 0; d < days; d++) {
    tableHTML += `<tr><td>${daysOfWeek[d]}</td>`;
    periodTimings.forEach((p) => {
      tableHTML +=
        p.type === "lunch" ?
        `<td class='break'>Lunch</td>` :
        `<td contenteditable='true'></td>`;
    });
    tableHTML += "</tr>";
  }
  tableHTML += "</tbody></table>";
  gEnabledKeys.forEach((k) => {
    const tDiv = document.getElementById(`timetable${k}`);
    if (tDiv) tDiv.innerHTML = tableHTML;
  });

  aggregateStats = {};
  const strictMode = options.strictMode !== false;
  const maxAttempts = strictMode ?
    Math.max(1, Math.min(10, parseInt(options.maxAttempts, 10) || 10)) :
    1;
  const autoSeed = ( // fallback seed derived from current time and grid dimensions
    Date.now() ^
    ((classCount & 0xff) << 16) ^
    ((slots & 0xff) << 8) ^
    (days & 0xff)
  ) >>> 0;
  const baseSeed = Number.isFinite(options.seed) ? (options.seed >>> 0) : autoSeed;
  let scheduleRenderOk = false;
  let strictValidation = {
    valid: true,
    violations: [],
  };
  let attemptsUsed = 0;
  let forced = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attemptsUsed = attempt + 1;
    const attemptSeed = resolveGenerationSeed(baseSeed, attempt);
    try {
      renderMultiClasses({
        pairsByClass: subjectTeacherPairsByClass,
        fillerShortsByClass,
        fillerCreditsByClass,
        mainShortsByClass,
        fixedSlotsByClass,
        days,
        defaultDuration,
        enabledKeys: gEnabledKeys.slice(),
        seed: attemptSeed,
      });
      scheduleRenderOk = true;
    } catch (e) {
      scheduleRenderOk = false;
      console.error("renderMultiClasses fatal error:", e);
      continue;
    }

    if (!strictMode || typeof schedulerIsFullyValid !== "function") {
      strictValidation = {
        valid: true,
        violations: [],
      };
      forced = false;
      break;
    }

    strictValidation = schedulerIsFullyValid(
      (typeof window !== "undefined" && window.__ttLastScheduleState) ||
      null
    );
    if (strictValidation.valid) {
      forced = false;
      break;
    }
    forced = attemptsUsed >= maxAttempts;
  }

  try {
    window.__ttStrictGenerationMeta = {
      strictMode,
      maxAttempts,
      attemptsUsed,
      baseSeed,
      lastSeed: window.__ttLastSeed,
      valid: !!strictValidation.valid,
      forced: !!forced,
      violations: Array.isArray(strictValidation.violations) ?
        strictValidation.violations.slice() :
        [],
    };
  } catch (_e) { /* no-op */ }

  if (scheduleRenderOk) {
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
  try {
    // Use tab system to switch to timetables view
    if (typeof switchTab === "function") {
      switchTab("timetables");
    } else {
      var ttArea = document.querySelector(".timetable-area");
      if (ttArea) {
        ttArea.classList.add("view-timetable");
        ttArea.classList.remove("view-inputs");
      }
    }
  } catch { /* no-op */ }
  buildToolbar();
  enableDragAndDrop();
  generated = true;

  if (!scheduleRenderOk) {
    showToast(
      "Timetable render interrupted for this run. Please try Generate again after reducing class count once.",
      {
        type: "error",
        duration: 4200
      }
    );
  }
  } finally {
    window.__ttGenerationRunning = false;
  }
}

// Section: MULTI-CANDIDATE GENERATION

/**
 * Generates multiple timetable candidates and ranks them by objective score.
 * @param {number} count - Number of candidates to generate.
 * @returns {Array<{ seed: number, score: number, valid: boolean }>}
 */
function generateMultipleCandidates(count = 5) {
  const safeCount = Math.max(1, parseInt(count, 10) || 5);
  const candidates = [];
  const baseSeed = resolveGenerationSeed(Date.now() ^ 0x13572468, 0);

  for (let i = 0; i < safeCount; i++) {
    const candidateSeed = resolveGenerationSeed(baseSeed, i);
    generateTimetable({
      __runImmediate: true,
      strictMode: true,
      maxAttempts: 10,
      seed: candidateSeed,
    });
    const state =
      (typeof window !== "undefined" && window.__ttLastScheduleState) || null;
    const validation =
      typeof schedulerIsFullyValid === "function" ?
      schedulerIsFullyValid(state) :
      {
        valid: false,
        violations: ["Strict validator unavailable"],
      };
    if (!validation.valid) continue;

    const score =
      typeof schedulerScoreCandidateObjective === "function" ?
      schedulerScoreCandidateObjective(state, validation) :
      0;
    candidates.push({
      seed: candidateSeed,
      score,
      valid: true,
      violations: validation.violations.slice(),
      forced: !!(
        typeof window !== "undefined" &&
        window.__ttStrictGenerationMeta &&
        window.__ttStrictGenerationMeta.forced
      ),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  try {
    window.__ttLastCandidates = candidates;
  } catch (_e) { /* no-op */ }
  return candidates;
}

window.generateMultipleCandidates = generateMultipleCandidates;
