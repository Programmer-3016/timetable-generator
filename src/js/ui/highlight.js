/**
 * @module ui/highlight.js
 * @description Teacher highlight and clash indication helpers.
 */

// Section: TEACHER HIGHLIGHT HELPERS

function clearHighlight() {
  document.querySelectorAll(".subject-cell").forEach((c) => {
    c.classList.remove("tt-highlight", "tt-dim");
  });
}

/**
 * Splits and deduplicates a teacher string for highlighting.
 * @param {string} input - Comma/pipe/slash-separated teacher names.
 * @returns {string[]}
 */
function highlightNormalizeTeacherList(input) {
  return Array.from(
    new Set(
      String(input || "")
      .split(/[,|/]+/)
      .map((t) => String(t || "").trim())
      .filter(Boolean)
    )
  );
}

/**
 * Resolves the teacher list for a cell element (highlight context).
 * @param {HTMLElement} cell - The .subject-cell DOM element.
 * @returns {string[]}
 */
function highlightGetCellTeachers(cell) {
  if (!cell) return [];
  const key = String(cell.dataset.key || "").trim();
  const short = String(cell.dataset.short || "").trim();
  if (!key || !short) {
    return highlightNormalizeTeacherList(cell.dataset.teacher || "");
  }

  const subj = gSubjectByShort?.[key]?.[short] || {};
  const subjectTeachers = Array.isArray(subj.teachers) ?
    subj.teachers
    .map((t) => String(t || "").trim())
    .filter(Boolean) :
    [];
  const isLab =
    /\blab\b/i.test(short || "") || /\blab\b/i.test(subj.subject || "");
  if (isLab && subjectTeachers.length) {
    return Array.from(new Set(subjectTeachers));
  }

  const fromCell = highlightNormalizeTeacherList(cell.dataset.teacher || "");
  if (fromCell.length) return fromCell;
  if (subjectTeachers.length) return [subjectTeachers[0]];

  const fallback = String(gTeacherForShort?.[key]?.[short] || "").trim();
  return fallback ? [fallback] : [];
}

/**
 * Checks if a cell's teachers include the target canonical key.
 * @param {HTMLElement} cell - The .subject-cell DOM element.
 * @param {string} targetKey - Canonical teacher key to match.
 * @returns {boolean}
 */
function highlightHasTeacher(cell, targetKey) {
  if (!targetKey) return false;
  return highlightGetCellTeachers(cell).some((rawTeacher) => {
    const c1 = canonicalTeacherName(rawTeacher);
    const folded = (gCanonFoldMap && gCanonFoldMap[c1]) || c1; // Fold to canonical master key
    return folded && folded === targetKey;
  });
}

/**
 * Highlights cells assigned to the given teacher and marks clashes.
 * @param {string} teacher - Teacher display name.
 */
function highlightByTeacher(teacher) {
  const cells = document.querySelectorAll(".subject-cell");
  cells.forEach((c) => {
    c.classList.remove("tt-highlight", "tt-dim", "tt-clash");
    const badge = c.querySelector(".clash-badge");
    if (badge) badge.remove();
  });
  const c0 = canonicalTeacherName(teacher);
  const targetKey = (gCanonFoldMap && gCanonFoldMap[c0]) || c0; // Folded canonical key for matching
  if (!targetKey) {
    clearHighlight();
    return;
  }

  const slotMap = {}; // "day-pabs" => [cell, cell, ...]
  const teacherCells = [];
  cells.forEach((c) => {
    if (highlightHasTeacher(c, targetKey)) {
      teacherCells.push(c);
      const slotKey = `${c.dataset.day}-${c.dataset.pabs}`;
      if (!slotMap[slotKey]) slotMap[slotKey] = [];
      slotMap[slotKey].push(c);
    }
  });

  if (!teacherCells.length) {
    clearHighlight();
    return;
  }

  const clashSlots = new Set();
  Object.entries(slotMap).forEach(([slot, arr]) => {
    if (arr.length > 1) clashSlots.add(slot);
  });

  cells.forEach((c) => {
    if (highlightHasTeacher(c, targetKey)) {
      const slotKey = `${c.dataset.day}-${c.dataset.pabs}`;
      if (clashSlots.has(slotKey)) {
        c.classList.add("tt-clash");
        const badge = document.createElement("span");
        badge.className = "clash-badge";
        badge.textContent = "⚠ CLASH";
        c.appendChild(badge);
      } else {
        c.classList.add("tt-highlight");
      }
    } else {
      c.classList.add("tt-dim");
    }
  });
}
