/**
 * @module ui/pdf-import/name-review.js
 * @description Post-import teacher-name ambiguity review (same vs different teacher).
 */

function pdfImportParseTeacherFromSubjectLine(line) {
  const parts = String(line || "")
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return "";
  return parts[parts.length - 1] || "";
}

// Section: DISPLAY NAME RESOLUTION

/**
 * @description Selects the best display name from a set of teacher name variants (longest/most words first).
 * @param {Iterable<string>} names - Collection of name variants.
 * @returns {string} Best display name or empty string.
 */
function pdfImportBestTeacherDisplayName(names) {
  const clean = Array.from(
    new Set(
      Array.from(names || [])
      .map((n) => String(n || "").trim())
      .filter(Boolean)
    )
  );
  if (!clean.length) return "";
  clean.sort((a, b) => {
    const aWords = a.split(/\s+/).length;
    const bWords = b.split(/\s+/).length;
    if (aWords !== bWords) return bWords - aWords;
    if (a.length !== b.length) return b.length - a.length;
    return a.localeCompare(b);
  });
  return clean[0];
}

/**
 * @description Escapes HTML special characters for safe DOM insertion.
 * @param {string} text - Raw text.
 * @returns {string} HTML-escaped string.
 */
function pdfImportEscapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Section: AMBIGUITY DETECTION

/**
 * @description Collects pairs of teacher names that may refer to the same person across classes.
 * @param {Array} classes - Array of class objects with subjects text.
 * @returns {Array<Object>} Ambiguity pairs with canonical names and display names.
 */
function pdfImportCollectTeacherAmbiguityPairs(classes) {
  const byCanonical = {};

  (classes || []).forEach((cls) => {
    const lines = String(cls?.subjects || "")
      .split(/\r?\n/)
      .map((ln) => ln.trim())
      .filter(Boolean);
    lines.forEach((line) => {
      const teacherRaw = pdfImportParseTeacherFromSubjectLine(line);
      const teacher = String(teacherRaw || "").trim();
      if (!teacher || /^not\s*mentioned$/i.test(teacher)) return;
      const canon = normalizeTeacherName(teacher);
      if (!canon) return;
      if (!byCanonical[canon]) byCanonical[canon] = new Set();
      byCanonical[canon].add(teacher);
    });
  });

  const canonicalNames = Object.keys(byCanonical).sort((a, b) => {
    const aw = a.split(/\s+/).length;
    const bw = b.split(/\s+/).length;
    if (aw !== bw) return aw - bw;
    return a.localeCompare(b);
  });

  const pairs = [];
  const seen = new Set();
  canonicalNames.forEach((shortCanon) => {
    const shortTokens = shortCanon.split(/\s+/).filter(Boolean);
    if (shortTokens.length !== 1) return;
    const first = shortTokens[0];
    if (!first || first.length < 2) return;

    const fullCandidates = canonicalNames.filter((cand) => {
      if (cand === shortCanon) return false;
      return cand.startsWith(first + " ");
    });

    fullCandidates.forEach((fullCanon) => {
      const pairKey = teacherPairKey(shortCanon, fullCanon);
      if (!pairKey || seen.has(pairKey)) return;
      seen.add(pairKey);

      const shortDisplay = pdfImportBestTeacherDisplayName(byCanonical[shortCanon]);
      const fullDisplay = pdfImportBestTeacherDisplayName(byCanonical[fullCanon]);
      if (!shortDisplay || !fullDisplay) return;

      const forcedSeparate = isTeacherPairForcedSeparate(shortCanon, fullCanon);
      const defaultDifferent = !!forcedSeparate;

      pairs.push({
        shortCanon,
        fullCanon,
        shortDisplay,
        fullDisplay,
        defaultDifferent,
      });
    });
  });

  // Also surface typo-like full-name similarities that scheduler may fold.
  for (let i = 0; i < canonicalNames.length; i++) {
    const aCanon = canonicalNames[i];
    for (let j = i + 1; j < canonicalNames.length; j++) {
      const bCanon = canonicalNames[j];
      const pairKey = teacherPairKey(aCanon, bCanon);
      if (!pairKey || seen.has(pairKey)) continue;
      if (typeof shouldFoldTeacherCanonicalNames !== "function") continue;
      if (!shouldFoldTeacherCanonicalNames(aCanon, bCanon)) continue;
      seen.add(pairKey);

      const aDisplay = pdfImportBestTeacherDisplayName(byCanonical[aCanon]);
      const bDisplay = pdfImportBestTeacherDisplayName(byCanonical[bCanon]);
      if (!aDisplay || !bDisplay) continue;

      const forcedSeparate = isTeacherPairForcedSeparate(aCanon, bCanon);
      pairs.push({
        shortCanon: aCanon,
        fullCanon: bCanon,
        shortDisplay: aDisplay,
        fullDisplay: bDisplay,
        defaultDifferent: !!forcedSeparate,
      });
    }
  }

  return pairs;
}

/**
 * @description Builds a canonical-to-display-name map for all teachers across classes and pairs.
 * @param {Array} classes - Array of class objects.
 * @param {Array} [pairs=[]] - Ambiguity pairs.
 * @param {Object} [correctedByCanon={}] - User-corrected names keyed by canonical form.
 * @returns {Object} Map of canonical name to best display name.
 */
function pdfImportBuildTeacherDisplayMap(
  classes,
  pairs = [],
  correctedByCanon = {}
) {
  const byCanonical = {};

  const pushDisplay = (canonInput, rawDisplay) => { // Registers a raw display name under its canonical form
    const canon = normalizeTeacherName(canonInput || "");
    const raw = String(rawDisplay || "").trim();
    if (!canon || !raw || /^not\s*mentioned$/i.test(raw)) return;
    if (!byCanonical[canon]) byCanonical[canon] = new Set();
    byCanonical[canon].add(raw);
  };

  (classes || []).forEach((cls) => {
    const lines = String(cls?.subjects || "")
      .split(/\r?\n/)
      .map((ln) => ln.trim())
      .filter(Boolean);
    lines.forEach((line) => {
      const teacherRaw = pdfImportParseTeacherFromSubjectLine(line);
      if (!teacherRaw) return;
      teacherRaw
        .split(/\s*,\s*/)
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .forEach((teacher) => {
          pushDisplay(teacher, teacher);
        });
    });
  });

  (pairs || []).forEach((pair) => {
    pushDisplay(pair?.shortCanon, pair?.shortDisplay);
    pushDisplay(pair?.fullCanon, pair?.fullDisplay);
  });
  Object.entries(correctedByCanon || {}).forEach(([canon, display]) => {
    pushDisplay(canon, display);
  });

  const out = {};
  Object.entries(byCanonical).forEach(([canon, names]) => {
    out[canon] = pdfImportBestTeacherDisplayName(names);
  });
  return out;
}

// Section: ALIAS REWRITING

/**
 * @description Rewrites teacher names in class subject lines using alias resolution and display map.
 * @param {Array} classes - Array of class objects.
 * @param {Object} [displayMap={}] - Canonical-to-display-name map.
 * @returns {Array} Classes with rewritten teacher names in subject text.
 */
function pdfImportRewriteTeacherNamesByAlias(classes, displayMap = {}) {
  const rewriteTeacherToken = (rawTeacher) => { // Resolves a single teacher token to its corrected display name
    const original = String(rawTeacher || "").trim();
    if (!original || /^not\s*mentioned$/i.test(original)) return original;
    const canon = normalizeTeacherName(original);
    if (!canon) return original;
    const resolved = resolveTeacherAliasCanonical(canon);
    const resolvedCanon = normalizeTeacherName(resolved || "");
    const targetCanon = resolvedCanon || canon;
    const corrected =
      displayMap[targetCanon] ||
      displayMap[canon] ||
      "";
    return corrected || original;
  };

  const rewriteLine = (line) => { // Rewrites all teacher tokens in a subject line
    const txt = String(line || "");
    if (!txt.trim()) return txt;
    const parts = txt
      .split(/\s+-\s+/)
      .map((p) => String(p || "").trim());
    if (parts.length < 3) return txt;

    const short = parts[0];
    const subject = parts.slice(1, parts.length - 1).join(" - ").trim();
    const teacherPart = parts[parts.length - 1] || "";
    const rewrittenTeachers = teacherPart
      .split(/\s*,\s*/)
      .map((t) => rewriteTeacherToken(t))
      .map((t) => String(t || "").trim())
      .filter(Boolean);
    const dedup = [];
    const seen = new Set();
    rewrittenTeachers.forEach((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      dedup.push(t);
    });
    const teacherFinal = dedup.join(", ") || teacherPart.trim();
    return `${short} - ${subject} - ${teacherFinal}`;
  };

  return (classes || []).map((cls) => {
    const lines = String(cls?.subjects || "").split(/\r?\n/);
    const rewritten = lines.map(rewriteLine).join("\n");
    return {
      ...cls,
      subjects: rewritten,
    };
  });
}

// Section: REVIEW MODAL

/**
 * @description Shows a modal for reviewing teacher name ambiguities and returns resolved classes.
 * @param {Array} classes - Array of class objects to review.
 * @returns {Promise<Object>} Result with shown, skipped flags, counts, and resolved classes.
 */
function pdfImportReviewTeacherNamesAfterImport(classes) {
  const overlay = document.getElementById("teacherNameReviewOverlay");
  const rowsHost = document.getElementById("teacherNameReviewRows");
  const summary = document.getElementById("teacherNameReviewSummary");
  const skipBtn = document.getElementById("teacherNameReviewSkipBtn");
  const applyBtn = document.getElementById("teacherNameReviewApplyBtn");
  const modal = document.getElementById("teacherNameReviewModal");
  const actionBar = modal ?
    modal.querySelector(".tnr-actions") :
    null;
  const pairs = pdfImportCollectTeacherAmbiguityPairs(classes);
  const displayMap = pdfImportBuildTeacherDisplayMap(classes, pairs);
  const rewrittenClasses = pdfImportRewriteTeacherNamesByAlias(classes, displayMap);

  if (!overlay || !rowsHost || !summary || !skipBtn || !applyBtn) {
    return Promise.resolve({
      shown: false,
      classes: rewrittenClasses,
    });
  }

  if (!pairs.length) {
    return Promise.resolve({
      shown: false,
      classes: rewrittenClasses,
    });
  }

  const oldCorrectionWrap = document.getElementById("teacherNameCorrectionWrap");
  if (oldCorrectionWrap) oldCorrectionWrap.remove();

  rowsHost.innerHTML = "";
  pairs.forEach((pair, idx) => {
    const row = document.createElement("label");
    row.className = "tnr-row";
    const inputId = `tnrPair${idx}`;
    const shortDisplayEsc = pdfImportEscapeHtml(pair.shortDisplay);
    const fullDisplayEsc = pdfImportEscapeHtml(pair.fullDisplay);
    row.innerHTML = `
      <input
        id="${inputId}"
        class="tnr-checkbox"
        type="checkbox"
        ${pair.defaultDifferent ? "checked" : ""}
      />
      <div class="tnr-row-text">
        <div class="tnr-pair">
          <strong>${shortDisplayEsc}</strong> vs <strong>${fullDisplayEsc}</strong>
        </div>
        <div class="tnr-hint">
          Checked = different teachers, unchecked = same teacher.
        </div>
      </div>
    `;
    const checkbox = row.querySelector("input");
    checkbox.dataset.shortCanon = pair.shortCanon;
    checkbox.dataset.fullCanon = pair.fullCanon;
    rowsHost.appendChild(row);
  });

  const correctionWrap = document.createElement("div");
  correctionWrap.id = "teacherNameCorrectionWrap";
  correctionWrap.className = "tnr-correct-wrap";
  const pairCanonSet = new Set();
  (pairs || []).forEach((pair) => {
    const shortCanon = normalizeTeacherName(pair?.shortCanon || "");
    const fullCanon = normalizeTeacherName(pair?.fullCanon || "");
    if (shortCanon) pairCanonSet.add(shortCanon);
    if (fullCanon) pairCanonSet.add(fullCanon);
  });
  const correctionCanons = Array.from(pairCanonSet).sort((a, b) => {
    const da = displayMap[a] || a;
    const db = displayMap[b] || b;
    return da.localeCompare(db);
  });

  if (correctionCanons.length) {
    const title = document.createElement("div");
    title.className = "tnr-correct-title";
    title.textContent = "Correct teacher spellings (optional)";
    correctionWrap.appendChild(title);

    const list = document.createElement("div");
    list.className = "tnr-correct-list";
    correctionCanons.forEach((canon, idx) => {
      const current = String(displayMap[canon] || canon || "").trim();
      if (!current) return;
      const item = document.createElement("label");
      item.className = "tnr-correct-item";
      const safeCurrent = pdfImportEscapeHtml(current);
      const safeCanon = pdfImportEscapeHtml(canon);
      item.innerHTML = `
        <span class="tnr-correct-name">${safeCurrent}</span>
        <input
          type="text"
          class="tnr-correct-input"
          data-canon="${safeCanon}"
          value="${safeCurrent}"
          placeholder="Enter corrected name"
          autocomplete="off"
          spellcheck="false"
          aria-label="Correct teacher name ${idx + 1}"
        />
      `;
      list.appendChild(item);
    });
    correctionWrap.appendChild(list);
  }

  if (modal && rowsHost) {
    modal.insertBefore(correctionWrap, rowsHost);
  } else if (modal && actionBar) {
    modal.insertBefore(correctionWrap, actionBar);
  }

  summary.textContent =
    `${pairs.length} similar name pair(s) found. Confirm and correct names before filling inputs.`;

  return new Promise((resolve) => {
    const close = (result) => { // Hides overlay and resolves the review promise
      overlay.style.display = "none";
      document.removeEventListener("keydown", onKeyDown);
      overlay.removeEventListener("click", onBackdropClick);
      skipBtn.removeEventListener("click", onSkip);
      applyBtn.removeEventListener("click", onApply);
      resolve(result);
    };

    // Handles skip action, returning rewritten classes without merge decisions
    const onSkip = () =>
      close({
        shown: true,
        skipped: true,
        classes: rewrittenClasses,
      });

    // Applies merge/separate decisions and name corrections
    const onApply = () => {
      const mergePairs = [];
      const separatePairs = [];
      const correctedByCanon = {};
      const checks = Array.from(rowsHost.querySelectorAll(".tnr-checkbox"));
      const correctionInputs = Array.from(
        document.querySelectorAll("#teacherNameCorrectionWrap .tnr-correct-input")
      );
      checks.forEach((cb) => {
        const shortCanon = normalizeTeacherName(cb.dataset.shortCanon || "");
        const fullCanon = normalizeTeacherName(cb.dataset.fullCanon || "");
        if (!shortCanon || !fullCanon || shortCanon === fullCanon) return;
        if (cb.checked) separatePairs.push([shortCanon, fullCanon]);
        else mergePairs.push({
          from: shortCanon,
          to: fullCanon
        });
      });
      correctionInputs.forEach((inputEl) => {
        const canon = normalizeTeacherName(inputEl.dataset.canon || "");
        const corrected = String(inputEl.value || "").trim();
        if (!canon || !corrected || /^not\s*mentioned$/i.test(corrected)) return;
        correctedByCanon[canon] = corrected;
      });
      const changed = setTeacherAliasDecisions({
        mergePairs,
        separatePairs
      });
      const finalDisplayMap = pdfImportBuildTeacherDisplayMap(
        classes,
        pairs,
        correctedByCanon
      );
      close({
        shown: true,
        changed,
        mergedCount: mergePairs.length,
        separateCount: separatePairs.length,
        correctedCount: Object.keys(correctedByCanon).length,
        classes: pdfImportRewriteTeacherNamesByAlias(
          classes,
          finalDisplayMap
        ),
      });
    };

    const onKeyDown = (event) => { // Handles Escape key to trigger skip
      if (event.key === "Escape") onSkip();
    };

    const onBackdropClick = (event) => { // Handles backdrop click to trigger skip
      if (event.target === overlay) onSkip();
    };

    overlay.style.display = "flex";
    document.addEventListener("keydown", onKeyDown);
    overlay.addEventListener("click", onBackdropClick);
    skipBtn.addEventListener("click", onSkip);
    applyBtn.addEventListener("click", onApply);
  });
}
