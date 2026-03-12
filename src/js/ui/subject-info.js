/* exported renderSubjectInfo */

/**
 * @module ui/subject-info.js
 * @description Per-class subject info table rendering.
 */

// Section: SUBJECT INFO TABLES

/**
 * Renders per-class subject info tables with slot counts and credit details.
 */
function renderSubjectInfo() {
  // Normalizes an LTP string (e.g. "3-1-0") into a consistent format
  const normalizeLtp = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const m = text.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})$/);
    if (!m) return "";
    const l = parseInt(m[1], 10);
    const t = parseInt(m[2], 10);
    const p = parseInt(m[3], 10);
    if (t === 0 && p === 0) return String(l);
    return `${l} - ${t} - ${p}`;
  };
  // Formats teacher list from a subject pair for display
  const formatTeachers = (pair) => {
    const list = Array.isArray(pair?.teachers) ?
      pair.teachers
      .map((t) => String(t || "").trim())
      .filter(Boolean) :
      [];
    if (list.length) return list.join(", ");
    const one = String(pair?.teacher || "").trim();
    return one || "Not Mentioned";
  };
  // Resolves LTP value from pair data or imported LTP lookup
  const resolveLtp = (classKey, short, _subjectText, pairLtp = "") => {
    const direct = normalizeLtp(pairLtp);
    if (direct) return direct;
    const normalizedShort = String(short || "").trim().toUpperCase();
    if (!normalizedShort) return "";
    const classMap =
      (gImportedLtpByClass && gImportedLtpByClass[classKey]) || {};
    const match = classMap[normalizedShort];
    if (!match || !match.ltp) return "";
    return normalizeLtp(match.ltp);
  };
  // Counts slot occurrences per subject short for a given class
  const countMap = (classKey, tableSel) => {
    // Prefer scheduler state as source of truth; DOM can drift after manual edits.
    const byDay = gSchedules && gSchedules[classKey];
    if (Array.isArray(byDay) && byDay.length) {
      const map = {};
      byDay.forEach((row) => {
        if (!Array.isArray(row)) return;
        row.forEach((short) => {
          if (!short) return;
          map[short] = (map[short] || 0) + 1;
        });
      });
      return map;
    }

    // Fallback when schedule state is unavailable.
    const map = {};
    const cells = document.querySelectorAll(`${tableSel} .subject-cell`);
    cells.forEach((c) => {
      const s =
        (c.dataset && c.dataset.short) || (c.textContent || "").trim();
      if (!s) return;
      map[s] = (map[s] || 0) + 1;
    });
    return map;
  };
  (gEnabledKeys || []).forEach((key) => {
    const tableSel = `#timetable${key}`;
    const counts = countMap(key, tableSel);
    const rawPairs =
      (subjectTeacherPairsByClass && subjectTeacherPairsByClass[key]) || [];
    const pairByShort = new Map();
    rawPairs.forEach((p) => {
      if (!p || !p.short) return;
      // Match scheduler's "last short wins" behavior.
      if (pairByShort.has(p.short)) pairByShort.delete(p.short);
      pairByShort.set(p.short, p);
    });
    const pairs = Array.from(pairByShort.values());
    const quota = (gWeeklyQuotaByClass && gWeeklyQuotaByClass[key]) || {};
    // step: build subject-info table header
    let html =
      "<table><thead><tr>" +
      "<th>Short Form</th><th>Full subject name</th><th>Teacher(s)</th>" +
      "<th>LTP</th><th>Credits</th><th>Slots/Week (target)</th>" +
      "</tr></thead><tbody>";
    // step: render one row per subject-teacher pair with quota badge
    pairs.forEach((p) => {
      const effective = (gSubjectByShort && gSubjectByShort[key] &&
          gSubjectByShort[key][p.short]) ||
        p;
      const cnt = counts[p.short] || 0;
      const target = quota[p.short] ?? "-";
      const warn = typeof target === "number" && cnt !== target;
      const badge = warn ?
        `<span class='badge hrs-warn' title='Target ${target}, got ${cnt}'>${cnt}/${target}</span>` :
        `${cnt}/${target}`;
      const displayShort = effective.originalShort || p.originalShort || p.short;
      const teacherText = formatTeachers(effective);
      const ltpText = resolveLtp(
        key,
        p.short,
        effective.subject,
        effective.ltp
      );
      html += `<tr><td>${displayShort}</td><td>${effective.subject}</td><td>${
        teacherText
      }</td><td>${
        ltpText
      }</td><td>${
        typeof effective.credits === "number" && Number.isFinite(effective.credits)
          ? effective.credits
          : ""
      }</td><td>${badge}</td></tr>`;
    });
    // step: append rows for filler shorts not already listed
    const set =
      (gFillerShortsByClass && gFillerShortsByClass[key]) || new Set();
    const existing = new Set(pairs.map((p) => p.short));
    for (const f of set) {
      if (existing.has(f)) continue;
      const cnt = counts[f] || 0;
      const subj =
        (gFillerLabelsByClass &&
          gFillerLabelsByClass[key] &&
          gFillerLabelsByClass[key][f]) ||
        (gSubjectByShort &&
          gSubjectByShort[key] &&
          gSubjectByShort[key][f]?.subject) ||
        f;
      const target = quota[f] ?? "-";
      const warn = typeof target === "number" && cnt !== target;
      const badge = warn ?
        `<span class='badge hrs-warn' title='Target ${target}, got ${cnt}'>${cnt}/${target}</span>` :
        `${cnt}/${target}`;
      const credits =
        gSubjectByShort &&
        gSubjectByShort[key] &&
        gSubjectByShort[key][f] &&
        typeof gSubjectByShort[key][f].credits === "number" ?
        gSubjectByShort[key][f].credits :
        "";
      const ltpText = resolveLtp(key, f, subj);
      html += `<tr><td>${f}</td><td>${subj}</td><td></td><td>${ltpText}</td><td>${credits}</td><td>${badge}</td></tr>`;
    }
    html += "</tbody></table>";
    const targetEl = document.getElementById(`subjectInfo${key}`);
    if (targetEl) targetEl.innerHTML = html;
  });
}
