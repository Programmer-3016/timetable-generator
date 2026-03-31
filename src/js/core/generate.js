// @ts-check
/**
 * @module core/generate.js
 * @description Main generation flow: read inputs, build shell tables, invoke scheduler.
 */

/* exported formatTime, resolveGenerationSeed, buildGenerationAttemptMetrics, isGenerationCandidateBetter, generateTimetable */

/**
 * @typedef {Object} GenerationValidationResult
 * @property {boolean} valid
 * @property {boolean} [healthy]
 * @property {string[]} violations
 * @property {number} [unresolvedClashCount]
 * @property {number} [compactionIssueCount]
 */

/**
 * @typedef {Object} GenerationAttemptSnapshot
 * @property {number} seed
 * @property {GenerationValidationResult} validation
 * @property {ReturnType<typeof buildGenerationAttemptMetrics>} metrics
 */

/* ═══════════════════════════════════════════════════════
   Section: TIMETABLE GENERATION MASTER FUNCTION
═══════════════════════════════════════════════════════ */

/**
 * Formats a Date object as "HH:MM".
 * @param {Date} d - The date to format.
 * @returns {string} Time string in "HH:MM" format.
 */
function formatTime(d) {
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

/* ═══════════════════════════════════════════════════════
   Section: SEED MANAGEMENT
═══════════════════════════════════════════════════════ */

/**
 * Derives a deterministic seed for a given generation attempt.
 * @param {number} baseSeed - The base seed value.
 * @param {number} [attemptIndex=0] - The attempt index offset.
 * @returns {number} An unsigned 32-bit seed.
 */
function resolveGenerationSeed(baseSeed, attemptIndex = 0) {
  const base = Number.isFinite(baseSeed) ?
    (baseSeed >>> 0) :
    ((Date.now() ^ 0xa5a5a5a5) >>> 0);
  return (base + ((attemptIndex >>> 0) * 2654435761)) >>> 0;
}

/**
 * Summarizes one generation attempt so retries can compare candidates consistently.
 * Hard safety wins over cosmetic quality: unresolved clashes and strict violations
 * are ranked ahead of the quality score.
 * @param {Object} [params={}] - Published attempt diagnostics.
 * @param {GenerationValidationResult|{ valid?: boolean, healthy?: boolean, violations?: string[], unresolvedClashCount?: number, compactionIssueCount?: number }|null} [params.validation=null] - Published health report.
 * @param {Array<*>} [params.unresolvedClashes=[]] - Runtime unresolved clash records.
 * @param {{ totalIssues?: number }|null} [params.compactionReport=null] - Runtime compaction diagnostics.
 * @param {Object|null} [params.scheduleState=null] - Published schedule snapshot for objective scoring.
 * @param {number|null} [params.objectiveScore=null] - Precomputed objective score, when available.
 * @returns {{ healthy: boolean, unresolvedClashCount: number, compactionIssueCount: number, teacherClashViolationCount: number, otherViolationCount: number, totalViolationCount: number, objectiveScore: number, violations: string[] }}
 */
function buildGenerationAttemptMetrics({
  validation = null,
  unresolvedClashes = [],
  compactionReport = null,
  scheduleState = null,
  objectiveScore = null,
} = {}) {
  const report =
    validation && typeof validation === "object" ?
    validation :
    {
      valid: false,
      healthy: false,
      violations: ["Missing schedule health report"],
    };
  const violations = Array.isArray(report.violations) ?
    report.violations
      .map((item) => String(item || "").trim())
      .filter(Boolean) :
    [];
  const unresolvedClashCount = Number.isFinite(report.unresolvedClashCount) ?
    Number(report.unresolvedClashCount) :
    (Array.isArray(unresolvedClashes) ? unresolvedClashes.filter(Boolean).length : 0);
  const compactionIssueCount = Number.isFinite(report.compactionIssueCount) ?
    Number(report.compactionIssueCount) :
    (compactionReport && Number.isFinite(compactionReport.totalIssues) ?
      Number(compactionReport.totalIssues) :
      0);

  let teacherClashViolationCount = 0;
  let unresolvedClashViolationCount = 0;
  let compactionViolationCount = 0;
  violations.forEach((message) => {
    if (/unresolved teacher clashes remain/i.test(message)) {
      unresolvedClashViolationCount++;
      return;
    }
    if (/post-lunch compaction issues remain/i.test(message)) {
      compactionViolationCount++;
      return;
    }
    if (/teacher/i.test(message) && /(clash|double[- ]?book)/i.test(message)) {
      teacherClashViolationCount++;
    }
  });

  const otherViolationCount = Math.max(
    0,
    violations.length -
      unresolvedClashViolationCount -
      compactionViolationCount -
      teacherClashViolationCount
  );
  let resolvedObjectiveScore = Number.isFinite(objectiveScore) ?
    Number(objectiveScore) :
    -100;
  if (
    !Number.isFinite(objectiveScore) &&
    typeof schedulerScoreCandidateObjective === "function"
  ) {
    try {
      resolvedObjectiveScore = schedulerScoreCandidateObjective(
        scheduleState,
        report
      );
    } catch (_e) {
      resolvedObjectiveScore = -100;
    }
  }

  return {
    healthy: !!(report.healthy ?? report.valid),
    unresolvedClashCount,
    compactionIssueCount,
    teacherClashViolationCount,
    otherViolationCount,
    totalViolationCount: violations.length,
    objectiveScore: resolvedObjectiveScore,
    violations,
  };
}

/**
 * Compares two generation attempts and returns true when the candidate is safer.
 * Ordering priority:
 * 1. healthy schedules
 * 2. unresolved clash count
 * 3. compaction issue count
 * 4. teacher-clash violation count
 * 5. other strict violations
 * 6. total violations
 * 7. objective score
 * @param {{ healthy?: boolean, unresolvedClashCount?: number, compactionIssueCount?: number, teacherClashViolationCount?: number, otherViolationCount?: number, totalViolationCount?: number, objectiveScore?: number }|null} candidate - New attempt metrics.
 * @param {{ healthy?: boolean, unresolvedClashCount?: number, compactionIssueCount?: number, teacherClashViolationCount?: number, otherViolationCount?: number, totalViolationCount?: number, objectiveScore?: number }|null} incumbent - Current best attempt metrics.
 * @returns {boolean} True when candidate should replace incumbent.
 */
function isGenerationCandidateBetter(candidate, incumbent) {
  if (!candidate) return false;
  if (!incumbent) return true;

  const compareAscending = (a, b) => {
    const left = Number.isFinite(a) ? Number(a) : Number.POSITIVE_INFINITY;
    const right = Number.isFinite(b) ? Number(b) : Number.POSITIVE_INFINITY;
    if (left === right) return 0;
    return left < right ? -1 : 1;
  };
  const compareDescending = (a, b) => {
    const left = Number.isFinite(a) ? Number(a) : Number.NEGATIVE_INFINITY;
    const right = Number.isFinite(b) ? Number(b) : Number.NEGATIVE_INFINITY;
    if (left === right) return 0;
    return left > right ? -1 : 1;
  };

  const comparisons = [
    candidate.healthy === incumbent.healthy ?
      0 :
      (candidate.healthy ? -1 : 1),
    compareAscending(candidate.unresolvedClashCount, incumbent.unresolvedClashCount),
    compareAscending(candidate.compactionIssueCount, incumbent.compactionIssueCount),
    compareAscending(
      candidate.teacherClashViolationCount,
      incumbent.teacherClashViolationCount
    ),
    compareAscending(candidate.otherViolationCount, incumbent.otherViolationCount),
    compareAscending(candidate.totalViolationCount, incumbent.totalViolationCount),
    compareDescending(candidate.objectiveScore, incumbent.objectiveScore),
  ];

  for (let i = 0; i < comparisons.length; i++) {
    if (comparisons[i] < 0) return true;
    if (comparisons[i] > 0) return false;
  }
  return false;
}

/**
 * Builds a user-facing notice when strict validation still fails after retries.
 * Highlights low-lab-capacity failures separately because they are a common
 * feasibility issue rather than a hidden scheduler crash.
 * @param {{ valid?: boolean, healthy?: boolean, violations?: string[] }|null} validation
 * @param {number} labCapacity
 * @returns {{ type: "lab-capacity" | "generic", message: string, violations: string[] }|null}
 */
function buildStrictGenerationFailureNotice(validation, labCapacity) {
  const violations = Array.isArray(validation?.violations) ?
    validation.violations
      .map((item) => String(item || "").trim())
      .filter(Boolean) :
    [];
  if (!violations.length) return null;

  const labRoomViolations = violations.filter((line) =>
    /lab room\s+\d+.*double[- ]?book/i.test(line)
  );

  if (labRoomViolations.length) {
    const sample = labRoomViolations[0];
    const capacityValue =
      Number.isFinite(labCapacity) && labCapacity > 0 ?
      Math.round(labCapacity) :
      null;
    const capacityText =
      capacityValue === null ?
      "the current lab-room capacity" :
      `${capacityValue} lab room${capacityValue === 1 ? "" : "s"}`;
    const overlapText =
      `${labRoomViolations.length} lab-room overlap${labRoomViolations.length === 1 ? "" : "s"}`;
    return {
      type: "lab-capacity",
      message:
        `Could not generate a valid timetable with ${capacityText}. ` +
        `${overlapText} still remain. Example: ${sample}. ` +
        "Increase Number of Lab Rooms or reduce simultaneous lab sections. " +
        "This run was not saved to Versions.",
      violations: labRoomViolations,
    };
  }

  return {
    type: "generic",
    message:
      `Generated timetable is still invalid (${violations.length} strict violation${violations.length === 1 ? "" : "s"} remain). ` +
      "This run was not saved to Versions. Review the current inputs and try Generate again.",
    violations,
  };
}

/**
 * Main entry point: reads all UI inputs, builds shell tables, and invokes the scheduler.
 * @param {{ __runImmediate?: boolean, strictMode?: boolean, maxAttempts?: number, seed?: number }} options
 * @returns {void}
 */
function generateTimetable(options = {}) {
  const runImmediate = !!options.__runImmediate;
  const slots = parseInt(/** @type {HTMLInputElement} */ (document.getElementById("slots")).value);
  const days = parseInt(/** @type {HTMLInputElement} */ (document.getElementById("days")).value);
  const startTime = /** @type {HTMLInputElement} */ (document.getElementById("startTime")).value;
  const defaultDuration = parseInt(
    /** @type {HTMLInputElement} */ (document.getElementById("duration")).value
  );
  const lunchPeriod = parseInt(
    /** @type {HTMLInputElement} */ (document.getElementById("lunchPeriod")).value
  );
  const lunchDuration = parseInt(
    /** @type {HTMLInputElement} */ (document.getElementById("lunchDuration")).value
  );
  const labCapacity = parseInt(
    /** @type {HTMLInputElement | null} */ (document.getElementById("labCount"))
      ?.value || "",
    10
  );
  const classCount = Math.min(
    CLASS_KEYS.length,
    Math.max(
      1,
      parseInt(/** @type {HTMLInputElement} */ (document.getElementById("classCount"))?.value || "1", 10)
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
  ensureGenerationShellBlocks({ classCount, wrap });

  gClassLabels = {};
  subjectTeacherPairsByClass = {};
  const fillerShortsByClass = {};
  const fillerCreditsByClass = {};
  const mainShortsByClass = {};
  const fixedSlotsByClass = {};
  gFillerLabelsByClass = {};
  gEnabledKeys = [];

  /* ═══════════════════════════════════════════════════════
     Section: FILLER PARSING
  ═══════════════════════════════════════════════════════ */

  /**
   * Parses a filler-shorts input field into a set of shorts, labels, and credits.
   * @param {string} id - The DOM element ID of the filler input field.
   * @returns {{ set: Set<string>, labels: Object<string, string>, credits: Object<string, number> }} Parsed filler data.
   */
  function parseFillerWithLabels(id) {
    const raw = (/** @type {HTMLInputElement} */ (document.getElementById(id))?.value || "").trim(); // raw comma-separated filler input
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
      /**
       * Scans a text fragment for a credit value using common patterns.
       * @param {string} text - The text to scan for credit values.
       * @returns {?number} The parsed credit value or null.
       */
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

  /* ═══════════════════════════════════════════════════════
     Section: SUBJECT PAIR PARSING
  ═══════════════════════════════════════════════════════ */

  /**
   * Parses a comma-separated input field into a Set of uppercase short codes.
   * @param {string} id - The DOM element ID of the input field.
   * @returns {Set<string>} Set of uppercase short codes.
   */
  function parseShortsSet(id) {
    const raw = (/** @type {HTMLInputElement} */ (document.getElementById(id))?.value || "").trim(); // raw comma-separated input value
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
    const srcPairsEl = /** @type {HTMLInputElement|null} */ (document.getElementById("pairs"));
    const srcPairsData = (srcPairsEl?.value || "").trim(); // Class 1 subject-pair text for auto-replication
    const srcFillersEl = /** @type {HTMLInputElement|null} */ (document.getElementById("fillerShorts"));
    const srcMainsEl = /** @type {HTMLInputElement|null} */ (document.getElementById("mainShorts"));
    if (srcPairsData) {
      let copiedCount = 0;
      for (let i = 1; i < classCount; i++) {
        const k = CLASS_KEYS[i];
        const pEl = /** @type {HTMLInputElement|null} */ (document.getElementById(`pairs${k}`));
        if (pEl && !pEl.value.trim()) {
          pEl.value = srcPairsData;
          pEl.dispatchEvent(new Event("input", { bubbles: true }));
          copiedCount++;
          const fEl = /** @type {HTMLInputElement|null} */ (document.getElementById(`fillerShorts${k}`));
          if (fEl && !fEl.value.trim() && srcFillersEl?.value?.trim()) {
            fEl.value = srcFillersEl.value.trim();
            fEl.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const mEl = /** @type {HTMLInputElement|null} */ (document.getElementById(`mainShorts${k}`));
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
    const labelEl = /** @type {HTMLInputElement|null} */ (document.getElementById(`class${key}Label`));
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
    } else {
      skippedClasses.push(i + 1);
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
  syncGenerationShellState({
    classCount,
    classLabels: gClassLabels,
    enabledKeys: gEnabledKeys,
  });
  applyGenerationCompactLayout({
    wrap,
    enabledCount: gEnabledKeys.length,
  });

  periodTimings = buildGenerationPeriodTimings({
    slots,
    startTime,
    defaultDuration,
    lunchPeriod,
    lunchDuration,
    formatter: formatTime,
  });
  const tableHTML = buildGenerationTableShellHtml({
    days,
    periodTimings,
  });
  applyGenerationTableShell({
    enabledKeys: gEnabledKeys,
    tableHTML,
  });

  aggregateStats = {};
  const strictMode = options.strictMode !== false;
  const defaultStrictAttempts = classCount >= 12 ? 16 : 10;
  const maxAttempts = strictMode ?
    Math.max(
      1,
      Math.min(24, parseInt(String(options.maxAttempts), 10) || defaultStrictAttempts)
    ) :
    1;
  const autoSeed = ( // fallback seed derived from current time and grid dimensions
    Date.now() ^
    ((classCount & 0xff) << 16) ^
    ((slots & 0xff) << 8) ^
    (days & 0xff)
  ) >>> 0;
  const baseSeed = Number.isFinite(options.seed) ? (options.seed >>> 0) : autoSeed;
  let scheduleRenderOk = false;
  /** @type {GenerationValidationResult} */
  let strictValidation = {
    valid: true,
    violations: [],
  };
  let attemptsUsed = 0;
  let forced = false;
  /** @type {GenerationAttemptSnapshot|null} */
  let bestAttempt = null;
  const previousAcceptedState = captureAcceptedPublishedState();
  let restoredPreviousAccepted = false;

  /**
   * Captures the currently published attempt diagnostics so retries can compare them.
   * @param {number} attemptSeed - Seed used by the just-completed attempt.
   * @returns {GenerationAttemptSnapshot}
   */
  const buildAttemptSnapshot = (attemptSeed) => {
    /** @type {GenerationValidationResult} */
    const publishedValidation =
      typeof window !== "undefined" &&
      window.__ttLastValidation &&
      typeof window.__ttLastValidation === "object" ?
      /** @type {GenerationValidationResult} */ (window.__ttLastValidation) :
      {
        valid: false,
        violations: ["Missing schedule validation result"],
      };
    const scheduleState =
      (typeof window !== "undefined" && window.__ttLastScheduleState) || null;
    const unresolvedClashes =
      typeof window !== "undefined" && Array.isArray(window.__ttUnresolvedClashes) ?
      window.__ttUnresolvedClashes.slice() :
      [];
    const compactionReport =
      typeof window !== "undefined" &&
      window.__ttPostLunchCompactReport &&
      typeof window.__ttPostLunchCompactReport === "object" ?
      {
        ...window.__ttPostLunchCompactReport,
      } :
      null;
    return {
      seed: attemptSeed,
      validation: publishedValidation,
      metrics: buildGenerationAttemptMetrics({
        validation: publishedValidation,
        unresolvedClashes,
        compactionReport,
        scheduleState,
      }),
    };
  };

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
        labCapacity,
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
      bestAttempt = {
        seed: attemptSeed,
        validation: strictValidation,
        metrics: buildGenerationAttemptMetrics({
          validation: strictValidation,
          scheduleState:
            (typeof window !== "undefined" && window.__ttLastScheduleState) || null,
        }),
      };
      forced = false;
      break;
    }

    const attemptSnapshot = buildAttemptSnapshot(attemptSeed);
    strictValidation = attemptSnapshot.validation;
    if (isGenerationCandidateBetter(attemptSnapshot.metrics, bestAttempt?.metrics)) {
      bestAttempt = attemptSnapshot;
    }
    if (attemptSnapshot.metrics.healthy) {
      forced = false;
      break;
    }
    forced = attemptsUsed >= maxAttempts;
  }

  const publishedSeed =
    typeof window !== "undefined" && Number.isFinite(window.__ttLastSeed) ?
    (window.__ttLastSeed >>> 0) :
    null;
  if (
    scheduleRenderOk &&
    strictMode &&
    bestAttempt &&
    Number.isFinite(bestAttempt.seed) &&
    publishedSeed !== (bestAttempt.seed >>> 0)
  ) {
    try {
      renderMultiClasses({
        pairsByClass: subjectTeacherPairsByClass,
        fillerShortsByClass,
        fillerCreditsByClass,
        mainShortsByClass,
        fixedSlotsByClass,
        days,
        defaultDuration,
        labCapacity,
        enabledKeys: gEnabledKeys.slice(),
        seed: bestAttempt.seed,
      });
      strictValidation =
        typeof window !== "undefined" &&
        window.__ttLastValidation &&
        typeof window.__ttLastValidation === "object" ?
        /** @type {GenerationValidationResult} */ (window.__ttLastValidation) :
        bestAttempt.validation;
    } catch (e) {
      console.error("best-attempt replay failed:", e);
      strictValidation = bestAttempt.validation;
    }
  } else if (bestAttempt) {
    strictValidation = bestAttempt.validation;
  }

  const scheduleAccepted =
    !strictMode || !!(strictValidation?.healthy ?? strictValidation?.valid);
  const strictFailureNotice =
    strictMode && !scheduleAccepted ?
    buildStrictGenerationFailureNotice(strictValidation, labCapacity) :
    null;
  if (scheduleRenderOk && !scheduleAccepted) {
    restoredPreviousAccepted = restoreAcceptedPublishedState({
      acceptedState: previousAcceptedState,
      periodTimings,
    });
    if (!restoredPreviousAccepted) {
      clearPublishedPanels();
    }
  }

  try {
    window.__ttStrictGenerationMeta = {
      strictMode,
      maxAttempts,
      attemptsUsed,
      baseSeed,
      lastSeed: window.__ttLastSeed,
      selectedSeed: bestAttempt ? bestAttempt.seed : window.__ttLastSeed,
      valid: !!strictValidation.valid,
      forced: !!forced,
      accepted: !!scheduleAccepted,
      restoredPreviousAccepted: !!restoredPreviousAccepted,
      displayingAcceptedSchedule: !!(scheduleAccepted || restoredPreviousAccepted),
      savedToVersions: !!(scheduleRenderOk && scheduleAccepted),
      bestMetrics: bestAttempt ? {
        ...bestAttempt.metrics,
      } : null,
      violations: Array.isArray(strictValidation.violations) ?
        strictValidation.violations.slice() :
        [],
    };
  } catch (_e) {
    // Strict-generation metadata is optional debug state.
  }

  if (scheduleRenderOk && scheduleAccepted) {
    rebuildPublishedPanels();
    // Auto-save schedule version
    if (scheduleAccepted) {
      try {
        if (typeof onVersionAutoSave === "function") onVersionAutoSave();
      } catch (e) {
        console.error("Version auto-save error:", e);
      }
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
  } catch {
    // Ignore tab-switch UI failures; the generated schedule remains available.
  }
  buildToolbar();
  enableDragAndDrop();
  generated = !!(scheduleAccepted || restoredPreviousAccepted);

  if (!scheduleRenderOk) {
    showToast(
      "Timetable render interrupted for this run. Please try Generate again after reducing class count once.",
      {
        type: "error",
        duration: 4200
      }
    );
  } else if (strictFailureNotice) {
    const failureMessage = restoredPreviousAccepted ?
      `${strictFailureNotice.message} Previous valid timetable was kept on screen.` :
      strictFailureNotice.message;
    showToast(failureMessage, {
      type: strictFailureNotice.type === "lab-capacity" ? "warn" : "error",
      duration: 6200,
    });
  }
  } finally {
    window.__ttGenerationRunning = false;
  }
}
