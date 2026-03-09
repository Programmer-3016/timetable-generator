/**
 * @module ui/init.js
 * @description DOMContentLoaded wiring: input persistence, pager, quick fill, view toggle.
 */

// Section: DOM INITIALIZATION (DOMContentLoaded)

document.addEventListener("DOMContentLoaded", () => {
  // -- Auto-grow textareas in input panel --
  function autoGrowTextarea(el) {
    if (!el || el.tagName !== "TEXTAREA") return;
    el.style.height = "auto";
    const target = Math.min(200, Math.max(110, el.scrollHeight));
    el.style.height = target + "px";
  }

  const inputsPanel = document.getElementById("classInputsPanel");
  if (inputsPanel) {
    inputsPanel.addEventListener("input", (e) => {
      if (e.target && e.target.tagName === "TEXTAREA") {
        autoGrowTextarea(e.target);
      }
    });
    // Auto-size pre-filled textareas on load
    setTimeout(() => {
      inputsPanel.querySelectorAll("textarea").forEach(autoGrowTextarea);
    }, 100);
  }
  window._autoGrowTextarea = autoGrowTextarea;

  const countSel = document.getElementById("classCount");
  const pagerPrev = document.getElementById("inputsPrev");
  const pagerNext = document.getElementById("inputsNext");
  const pagerLabel = document.getElementById("inputsPageLabel");

  const inputsSearch = document.getElementById("inputsSearch");
  const inputsSearchClear = document.getElementById("inputsSearchClear");
  const inputsSearchMeta = document.getElementById("inputsSearchMeta");
  const letters = CLASS_KEYS.slice();

  if (countSel) {
    countSel.innerHTML = "";
    for (let i = 1; i <= letters.length; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      countSel.appendChild(opt);
    }
  }

  // Section: INPUT ROW MANAGEMENT

  /**
   * Ensures at least n input rows exist in the class inputs table.
   * @param {number} n - Number of rows to create.
   */
  function ensureInputRows(n) {
    const tbody = document.querySelector("#classInputsPanel table tbody");
    if (!tbody) return;
    for (let i = 0; i < Math.min(n, letters.length); i++) {
      const key = letters[i];
      const rowId = `classRow${key}`;
      if (document.getElementById(rowId)) continue;
      const tr = document.createElement("tr");
      tr.id = rowId;
      tr.style.display = "none";
      const numTd = document.createElement("td");
      numTd.textContent = String(i + 1);
      const labelTd = document.createElement("td");
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.id = `class${key}Label`;
      labelInput.value = `Class ${i + 1}`;
      labelTd.appendChild(labelInput);
      const subsTd = document.createElement("td");
      const ta = document.createElement("textarea");
      ta.id = i === 0 ? "pairs" : `pairs${key}`;
      if (i !== 0) {
        ta.placeholder = "SHORT - Full Subject Name - Teacher - Credits";
      }
      subsTd.appendChild(ta);
      const fillersTd = document.createElement("td");
      const fillersInput = document.createElement("input");
      fillersInput.type = "text";
      fillersInput.id = i === 0 ? "fillerShorts" : `fillerShorts${key}`;
      fillersInput.placeholder = "e.g., AR";
      fillersTd.appendChild(fillersInput);
      const mainsTd = document.createElement("td");
      const mainsInput = document.createElement("input");
      mainsInput.type = "text";
      mainsInput.id = i === 0 ? "mainShorts" : `mainShorts${key}`;
      mainsInput.placeholder = "e.g., MATH, OOPS, WT";
      mainsTd.appendChild(mainsInput);
      tr.appendChild(numTd);
      tr.appendChild(labelTd);
      tr.appendChild(subsTd);
      tr.appendChild(fillersTd);
      tr.appendChild(mainsTd);
      tbody.appendChild(tr);
    }
  }
  window._ensureInputRows = ensureInputRows;

  let pagerIndex = 0; // Current page index (0-based), 5 classes per page
  let inputSearchQuery = "";

  // Section: STATE PERSISTENCE

  const STORAGE_KEY = "tt_inputs_v1";
  let saveTimer = null;

  /**
   * Collects all current input panel state into a serializable object.
   * @returns {{ settings: Object, classes: Object, view: string }}
   */
  function collectState() {
    const settings = {
      startTime: document.getElementById("startTime")?.value || "",
      slots: document.getElementById("slots")?.value || "",
      days: document.getElementById("days")?.value || "",
      duration: document.getElementById("duration")?.value || "",
      lunchPeriod: document.getElementById("lunchPeriod")?.value || "",
      lunchDuration: document.getElementById("lunchDuration")?.value || "",
      labCount: document.getElementById("labCount")?.value || "3",
      classCount: countSel?.value || "1",
    };
    const classes = {};
    for (let i = 0; i < letters.length; i++) {
      const L = letters[i];
      const labelEl = document.getElementById(`class${L}Label`);
      const pairsId = i === 0 ? "pairs" : `pairs${L}`;
      const fillerId = i === 0 ? "fillerShorts" : `fillerShorts${L}`;
      const mainId = i === 0 ? "mainShorts" : `mainShorts${L}`;
      const pairsEl = document.getElementById(pairsId);
      const fillerEl = document.getElementById(fillerId);
      const mainEl = document.getElementById(mainId);
      classes[L] = {
        label: labelEl?.value || "",
        pairs: pairsEl?.value || "",
        fillers: fillerEl?.value || "",
        mains: mainEl?.value || "",
      };
    }
    const ttArea = document.querySelector(".timetable-area");
    const view = ttArea?.classList.contains("view-timetable") ?
      "timetable" :
      "inputs";
    return {
      settings,
      classes,
      view
    };
  }

  /**
   * Restores input panel state from a previously collected state object.
   * @param {Object} state - State object from collectState.
   */
  function applyState(state) {
    if (!state || typeof state !== "object") return;
    try {
      const s = state.settings || {};
      const desired = parseInt(String(s.classCount || "1"), 10) || 1;
      ensureInputRows(desired);
      if (document.getElementById("startTime") && s.startTime)
        document.getElementById("startTime").value = s.startTime;
      if (document.getElementById("slots") && s.slots)
        document.getElementById("slots").value = s.slots;
      if (document.getElementById("days") && s.days)
        document.getElementById("days").value = s.days;
      if (document.getElementById("duration") && s.duration)
        document.getElementById("duration").value = s.duration;
      if (document.getElementById("lunchPeriod") && s.lunchPeriod)
        document.getElementById("lunchPeriod").value = s.lunchPeriod;
      if (document.getElementById("lunchDuration") && s.lunchDuration)
        document.getElementById("lunchDuration").value = s.lunchDuration;
      if (document.getElementById("labCount") && s.labCount)
        document.getElementById("labCount").value = s.labCount;
      if (countSel && s.classCount) countSel.value = String(s.classCount);
      const c = state.classes || {};
      for (let i = 0; i < letters.length; i++) {
        const L = letters[i];
        const cls = c[L] || {};
        const labelEl = document.getElementById(`class${L}Label`);
        const pairsId = i === 0 ? "pairs" : `pairs${L}`;
        const fillerId = i === 0 ? "fillerShorts" : `fillerShorts${L}`;
        const mainId = i === 0 ? "mainShorts" : `mainShorts${L}`;
        if (labelEl && typeof cls.label === "string")
          labelEl.value = cls.label;
        const pairsEl = document.getElementById(pairsId);
        if (pairsEl && typeof cls.pairs === "string")
          pairsEl.value = cls.pairs;
        const fillerEl = document.getElementById(fillerId);
        if (fillerEl && typeof cls.fillers === "string")
          fillerEl.value = cls.fillers;
        const mainEl = document.getElementById(mainId);
        if (mainEl && typeof cls.mains === "string")
          mainEl.value = cls.mains;
      }
      if (state.view) {
        if (typeof switchTab === "function") {
          switchTab(state.view === "timetable" ? "timetables" : "inputs");
        }
      }
    } catch (e) {
      console.warn("[TT] applyState: failed to restore state", e);
    }
  }

  /** Persists the current input panel state to localStorage. */
  function saveState() {
    try {
      const obj = collectState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn("[TT] saveState: failed to persist inputs", e);
    }
  }

  /** Debounces save calls to avoid excessive localStorage writes. */
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 400);
  }

  // Section: SEARCH UTILITIES

  /**
   * Normalizes text for search comparison (lowercase, collapsed whitespace).
   * @param {string} text - Raw text to normalize.
   * @returns {string}
   */
  function normalizeSearchText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Escapes HTML entities for safe snippet rendering.
   * @param {string} text - Raw text to escape.
   * @returns {string}
   */
  function escapeHtmlForSearchSnippet(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Escapes special regex characters in a string for literal matching.
   * @param {string} text - Raw text to escape.
   * @returns {string}
   */
  function escapeRegExpForSearchSnippet(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Builds an HTML snippet with highlighted search matches.
   * @param {string} rawText - The field text to search within.
   * @param {string} rawQuery - The user's search query.
   * @returns {string} HTML with <mark> highlights, or empty string.
   */
  function buildFieldSearchSnippet(rawText, rawQuery) {
    const text = String(rawText || "");
    const tokens = normalizeSearchText(rawQuery).split(" ").filter(Boolean);
    if (!text.trim() || !tokens.length) return "";
    const pattern = tokens.map(escapeRegExpForSearchSnippet).join("\\s+");
    const re = new RegExp(pattern, "i");
    const match = re.exec(text);
    if (!match) return "";
    const start = Math.max(0, match.index - 32);
    const end = Math.min(text.length, match.index + match[0].length + 38);
    const left = text.slice(start, match.index);
    const center = text.slice(match.index, match.index + match[0].length);
    const right = text.slice(match.index + match[0].length, end);
    return `${start > 0 ? "..." : ""}${escapeHtmlForSearchSnippet(
      left
    )}<mark>${escapeHtmlForSearchSnippet(
      center
    )}</mark>${escapeHtmlForSearchSnippet(right)}${
      end < text.length ? "..." : ""
    }`;
  }

  /**
   * Removes all search snippet annotations from a table row.
   * @param {HTMLElement} row - The table row element.
   */
  function clearRowSearchArtifacts(row) {
    if (!row) return;
    row.querySelectorAll(".inputs-search-snippet").forEach((el) => el.remove());
  }

  /**
   * Appends a search snippet annotation below a form field.
   * @param {HTMLElement} field - The input/textarea element.
   * @param {string} snippetHtml - HTML string for the snippet.
   */
  function setFieldSearchSnippet(field, snippetHtml) {
    if (!field || !field.parentElement || !snippetHtml) return;
    const note = document.createElement("div");
    note.className = "inputs-search-snippet";
    note.innerHTML = snippetHtml;
    field.parentElement.appendChild(note);
  }

  /**
   * Checks if an input row matches the current search query.
   * @param {number} indexOneBased - 1-based row index.
   * @param {string} normalizedNeedle - Normalized search string.
   * @returns {boolean}
   */
  function rowMatchesInputSearch(indexOneBased, normalizedNeedle) {
    const i = indexOneBased - 1;
    const key = letters[i];
    if (!key) return false;
    const pairsId = i === 0 ? "pairs" : `pairs${key}`;
    const fillerId = i === 0 ? "fillerShorts" : `fillerShorts${key}`;
    const mainId = i === 0 ? "mainShorts" : `mainShorts${key}`;
    const labelText = document.getElementById(`class${key}Label`)?.value || "";
    const pairsText = document.getElementById(pairsId)?.value || "";
    const fillersText = document.getElementById(fillerId)?.value || "";
    const mainsText = document.getElementById(mainId)?.value || "";
    const haystack = normalizeSearchText(
      [
        `class ${indexOneBased}`,
        `class ${key}`,
        labelText,
        pairsText,
        fillersText,
        mainsText,
      ].join(" ")
    );
    return haystack.includes(normalizedNeedle);
  }

  // Section: COUNT VISIBILITY

  /**
   * Updates visibility of class input rows based on count, page, and search state.
   */
  function applyCountVisibility() {
    const n = parseInt(countSel?.value || "1");
    const pageSize = 5;
    const needle = normalizeSearchText(inputSearchQuery);
    const rawNeedle = String(inputSearchQuery || "").trim();
    const searchActive = needle.length > 0;
    const totalPages = Math.max(1, Math.ceil(n / pageSize));
    if (!searchActive && pagerIndex >= totalPages) pagerIndex = totalPages - 1;
    let visibleRows = 0;
    for (let i = 1; i <= letters.length; i++) {
      const letter = letters[i - 1];
      const row = document.getElementById("classRow" + letter);
      if (!row) continue;
      const inRange = i <= n;
      let visible = false;
      if (inRange) {
        if (searchActive) visible = rowMatchesInputSearch(i, needle);
        else visible = Math.floor((i - 1) / pageSize) === pagerIndex;
      }
      row.style.display = visible ? "" : "none";
      if (visible) visibleRows++;

      // Live search highlighting
      if (searchActive && visible) {
        row.classList.add("input-row-match");
      } else {
        row.classList.remove("input-row-match");
      }
      const firstTd = row.querySelector("td:first-child");
      if (firstTd) firstTd.textContent = String(i);

      const pairsId = i === 1 ? "pairs" : `pairs${letter}`;
      const fillerId = i === 1 ? "fillerShorts" : `fillerShorts${letter}`;
      const mainId = i === 1 ? "mainShorts" : `mainShorts${letter}`;
      const fields = [
        document.getElementById(`class${letter}Label`),
        document.getElementById(pairsId),
        document.getElementById(fillerId),
        document.getElementById(mainId),
      ].filter(Boolean);
      clearRowSearchArtifacts(row);
      if (searchActive && visible) {
        let snippetCount = 0;
        fields.forEach((field) => {
          const snippetHtml = buildFieldSearchSnippet(
            field?.value || "",
            rawNeedle
          );
          if (!snippetHtml) return;
          setFieldSearchSnippet(field, snippetHtml);
          snippetCount++;
        });
        if (snippetCount === 0 && fields[0]) {
          const classMetaSnippet = buildFieldSearchSnippet(
            `Class ${i} ${letter}`,
            rawNeedle
          );
          if (classMetaSnippet) setFieldSearchSnippet(fields[0], classMetaSnippet);
        }
      }
    }
    if (searchActive) {
      if (pagerLabel)
        pagerLabel.textContent = `${visibleRows} result${
          visibleRows === 1 ? "" : "s"
        }`;
      if (pagerPrev) pagerPrev.disabled = true;
      if (pagerNext) pagerNext.disabled = true;
      if (inputsSearchMeta) {
        inputsSearchMeta.style.display = "";
        inputsSearchMeta.textContent = `${visibleRows} match${
          visibleRows === 1 ? "" : "es"
        }`;
      }
    } else {
      if (pagerLabel)
        pagerLabel.textContent = `${pagerIndex + 1} / ${totalPages}`;
      if (pagerPrev) pagerPrev.disabled = pagerIndex <= 0;
      if (pagerNext) pagerNext.disabled = pagerIndex >= totalPages - 1;
      if (inputsSearchMeta) {
        inputsSearchMeta.style.display = "none";
        inputsSearchMeta.textContent = "";
      }
    }
  }

  if (pagerPrev)
    pagerPrev.addEventListener("click", () => {
      if (pagerIndex > 0) {
        pagerIndex--;
        applyCountVisibility();
      }
    });
  if (pagerNext)
    pagerNext.addEventListener("click", () => {
      const n = parseInt(countSel?.value || "1");
      const totalPages = Math.max(1, Math.ceil(n / 5));
      if (pagerIndex < totalPages - 1) {
        pagerIndex++;
        applyCountVisibility();
      }
    });

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      const desired = parseInt(String(st?.settings?.classCount || "1"), 10) || 1;
      ensureInputRows(desired);
      applyState(st);
    }
  } catch (e) {
    console.warn("[TT] Failed to load saved state — it may be corrupted.", e);
  }

  if (countSel) ensureInputRows(parseInt(countSel.value || "1", 10) || 1);
  if (inputsSearch) {
    inputsSearch.addEventListener("input", () => {
      inputSearchQuery = inputsSearch.value || "";
      applyCountVisibility();
    });
  }
  if (inputsSearchClear) {
    inputsSearchClear.addEventListener("click", () => {
      inputSearchQuery = "";
      if (inputsSearch) inputsSearch.value = "";
      applyCountVisibility();
      if (inputsSearch) inputsSearch.focus();
    });
  }
  if (countSel) {
    countSel.addEventListener("change", () => {
      ensureInputRows(parseInt(countSel.value || "1", 10) || 1);
      applyCountVisibility();
      scheduleSave();
    });
    applyCountVisibility();
  }

  const controls = document.querySelector(".controls");
  if (controls) controls.addEventListener("input", scheduleSave);

  [
    "startTime",
    "slots",
    "days",
    "duration",
    "lunchPeriod",
    "lunchDuration",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", scheduleSave);
    if (el) el.addEventListener("change", scheduleSave);
  });
  if (inputsPanel) inputsPanel.addEventListener("input", scheduleSave);

  // Section: QUICK FILL MODAL

  (function setupQuickFill() {
    const btn = document.getElementById("quickFillBtn");
    const overlay = document.getElementById("quickFillOverlay");
    const applyBtn = document.getElementById("qfApply");
    const cancelBtn = document.getElementById("qfCancel");
    const classRangeInput = document.getElementById("qfClassRange");

    /** Opens the Quick Fill modal overlay. */
    function openQF() {
      if (overlay) overlay.style.display = "flex";
    }

    /** Closes the Quick Fill modal overlay. */
    function closeQF() {
      if (overlay) overlay.style.display = "none";
    }

    /**
     * Parses a class range string (e.g. "1-3, 5") into sorted indices.
     * @param {string} text - Comma-separated ranges.
     * @param {boolean} [visiblePageOnly=false] - Use current page if text is empty.
     * @returns {number[]} Sorted 1-based class indices.
     */
    function parseClassRange(text, visiblePageOnly = false) {
      const n = parseInt(countSel?.value || "5");
      let indices = new Set();
      // Adds index to set if within valid class range
      const add = (i) => {
        if (i >= 1 && i <= n) indices.add(i);
      };
      // Trimmed input text for range parsing
      const t = (text || "").trim();
      if (!t && visiblePageOnly) {
        const start = pagerIndex * 5 + 1;
        const end = Math.min(start + 4, n);
        for (let i = start; i <= end; i++) add(i);
      } else {
        t.split(/\s*,\s*/)
          .filter(Boolean)
          .forEach((part) => {
            const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
            if (!m) return;
            const a = parseInt(m[1], 10);
            const b = m[2] ? parseInt(m[2], 10) : a;
            const lo = Math.min(a, b),
              hi = Math.max(a, b);
            for (let i = lo; i <= hi; i++) add(i);
          });
      }
      return Array.from(indices).sort((a, b) => a - b);
    }
    if (btn) btn.addEventListener("click", openQF);
    if (cancelBtn) cancelBtn.addEventListener("click", closeQF);
    if (overlay)
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeQF();
      });
    if (applyBtn)
      applyBtn.addEventListener("click", () => {
        // Raw subject data from the Quick Fill textarea
        const allRaw = (
          document.getElementById("qfAll")?.value || ""
        ).trim();
        if (!allRaw) {
          showToast("Quick Fill is empty. Paste subject data first.", {
            type: "warn"
          });
          return;
        }
        let pairs = [];
        const tmpId = "__qf_tmp_pairs__";
        let tmp = document.getElementById(tmpId);
        if (!tmp) {
          tmp = document.createElement("textarea");
          tmp.id = tmpId;
          tmp.style.display = "none";
          document.body.appendChild(tmp);
        }
        tmp.value = allRaw;
        try {
          pairs = parsePairs(tmpId) || [];
        } catch (e) {
          pairs = [];
        } finally {
          if (tmp && tmp.parentNode) tmp.parentNode.removeChild(tmp);
        }
        if (!pairs.length) {
          showToast(
            "No valid subject lines found. Use: SHORT - FULL - TEACHER - CREDITS",
            {
              type: "warn"
            }
          );
          return;
        }
        // Checks if a parsed pair represents a lab subject
        const isLabPair = (p) =>
          /\bLAB\b/i.test(p.short) || /\bLAB\b/i.test(p.subject);
        // Checks if a pair has no meaningful teacher assigned
        const isTeacherMissingOrNotMentioned = (p) => {
          const teacherText = (p.teacher || "").trim(); // Trimmed teacher string
          return (
            !teacherText || /^not\s*mentioned$/i.test(teacherText)
          );
        };
        let seenLab = false;
        const mainsShorts = [];
        const fillerEntries = []; // {short, label}
        for (const p of pairs) {
          if (isLabPair(p)) {
            seenLab = true;
            continue; // do not include labs in mains/fillers
          }
          const sh = (p.short || "").toUpperCase(); // Uppercased short form
          if (!sh) continue;
          if (isTeacherMissingOrNotMentioned(p)) {
            fillerEntries.push({
              short: sh,
              label: p.subject || sh
            });
            continue;
          }
          if (!seenLab) {
            mainsShorts.push(sh);
          } else {
            fillerEntries.push({
              short: sh,
              label: p.subject || sh
            });
          }
        }
        // Deduplicates an array preserving order
        const uniq = (arr) => Array.from(new Set(arr));
        const mainsUnique = uniq(mainsShorts);
        const seen = new Set();
        const fillersUnique = [];
        for (const fe of fillerEntries) {
          if (seen.has(fe.short)) continue;
          seen.add(fe.short);
          fillersUnique.push(fe);
        }
        const mainsCSV = mainsUnique.join(", ");
        const fillersCSV = fillersUnique.map((fe) => fe.short).join(", ");
        const selected = parseClassRange(
          classRangeInput?.value || "",
          true
        );
        if (!selected.length) {
          showToast("No valid classes selected. Check class range.", {
            type: "warn"
          });
          return;
        }
        const letters = CLASS_KEYS.slice();
        selected.forEach((idx) => {
          const L = letters[idx - 1];
          const pairsId = idx === 1 ? "pairs" : `pairs${L}`;
          const fillerId =
            idx === 1 ? "fillerShorts" : `fillerShorts${L}`;
          const mainId = idx === 1 ? "mainShorts" : `mainShorts${L}`;
          const pEl = document.getElementById(pairsId);
          const fEl = document.getElementById(fillerId);
          const mEl = document.getElementById(mainId);
          if (mEl) mEl.value = mainsCSV;
          if (fEl) fEl.value = fillersCSV;
          if (pEl) pEl.value = allRaw;
        });
        scheduleSave();
        closeQF();
      });
  })();

  window.addEventListener("beforeunload", saveState);

  // Ensure default tab on first load
  const tta0 = document.querySelector(".timetable-area");
  if (
    tta0 &&
    !tta0.classList.contains("view-inputs") &&
    !tta0.classList.contains("view-timetable")
  ) {
    if (typeof switchTab === "function") {
      switchTab("inputs");
    }
  }

  // Keyboard shortcuts are handled by keyboard-shortcuts.js
});
