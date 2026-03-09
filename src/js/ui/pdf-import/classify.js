/* exported pdfImportBuildLtpMap, pdfImportBackfillMissingLtp, pdfImportBuildLtpMapFromHints, pdfImportClassifyEntries, pdfImportBuildGroupedSubjectsText */
/**
 * @module ui/pdf-import/classify.js
 * @description Subject classification (mains/labs/fillers) and grouped text builders.
 */

function pdfImportBuildLtpMap(entries) {
  const map = {};
  (entries || []).forEach((entry) => {
    const short = pdfImportNormalizeShort(entry.short);
    const ltp = pdfImportNormalizeLtpTriplet(entry.ltp || "");
    if (!short || !ltp) return;
    if (map[short]) return;
    map[short] = {
      ltp,
      subjectKey: pdfImportNormalizeLine(entry.subject || "").toLowerCase(),
    };
  });
  return map;
}

// Section: LTP EXTRACTION

/**
 * @description Checks if a token resembles a subject code (e.g., "VAC", "IMC201").
 * @param {string} token - Token to test.
 * @returns {boolean} True if the token looks like a subject code.
 */
function pdfImportLooksLikeSubjectCodeToken(token) {
  const t = pdfImportNormalizeShort(token);
  return /^(?:VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)$/i.test(t);
}

/**
 * @description Normalizes text to a lowercase alphanumeric key for fuzzy matching.
 * @param {string} text - Raw text.
 * @returns {string} Normalized match key.
 */
function pdfImportNormalizeMatchKey(text) {
  return pdfImportNormalizeLine(text)
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @description Extracts LTP hints from raw PDF lines, keyed by short code and subject metadata.
 * @param {string[]} lines - Raw extracted PDF lines.
 * @returns {{ byShort: Object, byMeta: Array }} LTP hints indexed by short and by metadata.
 */
function pdfImportExtractLtpHintsFromRawLines(lines) {
  const byShort = {};
  const byMeta = [];

  for (const rawLine of lines || []) {
    const line = pdfImportNormalizeLine(rawLine);
    if (!line) continue;
    const lineForCode = line.replace(/^(?:\||:|-|\s)+/, "");

    const codeMatch = lineForCode.match(
      /^(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b\s*(.*)$/i
    );
    if (!codeMatch) continue;

    const tailRaw = pdfImportNormalizeLine(codeMatch[2] || "");
    if (!tailRaw) continue;

    const ltp = pdfImportExtractLtpFromLine(tailRaw);
    if (!ltp) continue;

    let body = tailRaw
      .replace(/^[|:\-]+\s*/, "")
      .replace(/^(?:\d+\s*\|\s*){1,4}(?=[A-Za-z])/i, "")
      .replace(/^(?:\d+\s+){1,4}/, "")
      .trim();
    if (!body) continue;

    let short = "";
    let subject = "";
    let teacher = "";

    if (body.includes("|")) {
      const cols = body
        .split("|")
        .map((c) => pdfImportNormalizeLine(c))
        .filter(Boolean);
      let shortIdx = -1;
      for (let idx = cols.length - 1; idx >= 0; idx--) {
        const candidate = pdfImportNormalizeShort(cols[idx]);
        if (
          pdfImportIsStrictShort(candidate) &&
          !pdfImportLooksLikeSubjectCodeToken(candidate)
        ) {
          shortIdx = idx;
          short = candidate;
          break;
        }
      }
      if (shortIdx > 0) {
        subject = pdfImportCleanSubject(cols.slice(0, shortIdx).join(" "));
      } else if (cols.length) {
        subject = pdfImportCleanSubject(cols[0]);
      }
      if (shortIdx >= 0 && shortIdx + 1 < cols.length) {
        teacher = pdfImportCleanTeacher(cols.slice(shortIdx + 1).join(" "));
      } else if (cols.length >= 2) {
        teacher = pdfImportCleanTeacher(cols[cols.length - 1]);
      }
    } else {
      const split = pdfImportExtractTeacherAndHead(body);
      const coreHead = pdfImportNormalizeLine(split.head || body)
        .replace(/\bCOMMON\s+LECTURE\b.*$/i, "")
        .trim();
      const tailParsed = pdfImportExtractShortFromTail(coreHead);
      if (
        tailParsed &&
        tailParsed.short &&
        pdfImportIsStrictShort(tailParsed.short) &&
        !pdfImportLooksLikeSubjectCodeToken(tailParsed.short)
      ) {
        short = pdfImportNormalizeShort(tailParsed.short);
        subject = pdfImportCleanSubject(tailParsed.subject || coreHead);
      } else {
        subject = pdfImportCleanSubject(coreHead);
      }
      teacher = pdfImportCleanTeacher(split.teacher || "");
    }

    if (short && !byShort[short]) {
      byShort[short] = {
        ltp,
        subjectKey: pdfImportNormalizeMatchKey(subject),
      };
    }

    const subjectKey = pdfImportNormalizeMatchKey(subject);
    if (subjectKey) {
      byMeta.push({
        ltp,
        subjectKey,
        teacherKey: pdfImportNormalizeMatchKey(teacher),
      });
    }
  }

  return {
    byShort,
    byMeta,
  };
}

/**
 * @description Backfills missing LTP values on entries using hints extracted from raw PDF lines.
 * @param {Array} entries - Subject entries potentially missing LTP data.
 * @param {string[]} lines - Raw PDF lines for hint extraction.
 * @returns {Array} Entries with LTP backfilled where possible.
 */
function pdfImportBackfillMissingLtp(entries, lines) {
  const hints = pdfImportExtractLtpHintsFromRawLines(lines);
  if (!hints.byMeta.length && !Object.keys(hints.byShort).length) return entries;

  return (entries || []).map((entry) => {
    const existingLtp = pdfImportNormalizeLtpTriplet(entry?.ltp || "");
    if (existingLtp) return entry;

    const short = pdfImportNormalizeShort(entry?.short || "");
    if (short && hints.byShort[short]?.ltp) {
      return {
        ...entry,
        ltp: hints.byShort[short].ltp,
      };
    }

    const subjectKey = pdfImportNormalizeMatchKey(entry?.subject || "");
    const teacherKey = pdfImportNormalizeMatchKey(
      pdfImportCleanTeacher(entry?.teacher || "")
    );
    if (!subjectKey) return entry;

    const matched = hints.byMeta.find((hint) => {
      if (!hint?.ltp || !hint?.subjectKey) return false;
      const subjectMatch =
        subjectKey.includes(hint.subjectKey) ||
        hint.subjectKey.includes(subjectKey);
      if (!subjectMatch) return false;
      if (teacherKey && hint.teacherKey && teacherKey !== hint.teacherKey)
        return false;
      return true;
    });
    if (!matched) return entry;

    return {
      ...entry,
      ltp: matched.ltp,
    };
  });
}

/**
 * @description Builds a short-code-to-LTP map from hints extracted from raw PDF lines.
 * @param {string[]} lines - Raw PDF lines.
 * @returns {Object} Map of short codes to { ltp, subjectKey }.
 */
function pdfImportBuildLtpMapFromHints(lines) {
  const hints = pdfImportExtractLtpHintsFromRawLines(lines);
  const out = {};
  Object.entries(hints.byShort || {}).forEach(([shortRaw, meta]) => {
    const short = pdfImportNormalizeShort(shortRaw);
    const ltp = pdfImportNormalizeLtpTriplet(meta?.ltp || "");
    if (!short || !ltp) return;
    out[short] = {
      ltp,
      subjectKey: pdfImportNormalizeLine(meta?.subjectKey || "").toLowerCase(),
    };
  });
  return out;
}

// Subsection: Classification and Class-Level Payload Assembly
function pdfImportGetEntryLtpLoad(entry) {
  const ltp = pdfImportNormalizeLtpTriplet(entry?.ltp || "");
  if (!ltp) return null;
  const parts = ltp
    .split("-")
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  if (parts.length !== 3) return null;
  return parts[0] + parts[1] + parts[2];
}

/**
 * @description Computes a midpoint LTP load threshold to split mains from fillers.
 * @param {Array} entries - Subject entries with LTP data.
 * @returns {number|null} Threshold value or null if insufficient data.
 */
function pdfImportResolveLtpThreshold(entries) {
  const loads = (entries || []) // Numeric LTP load values from entries
    .map((entry) => pdfImportGetEntryLtpLoad(entry))
    .filter((n) => Number.isFinite(n));
  if (loads.length < 2) return null;

  const min = Math.min(...loads);
  const max = Math.max(...loads);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  // Midpoint split keeps classification data-driven per class:
  // higher LTP group => mains, lower LTP group => fillers.
  return min + (max - min) / 2;
}

// Section: ENTRY CLASSIFICATION

/**
 * @description Checks if an entry is a lab based on its short code or subject name.
 * @param {Object} entry - Subject entry with short and subject fields.
 * @returns {boolean} True if the entry is a lab.
 */
function pdfImportIsLabEntry(entry) {
  return (
    /\bLAB\b|LAB$/i.test(entry.short || "") ||
    /\bLAB\b|LAB$/i.test(entry.subject || "")
  );
}

/**
 * @description Classifies subject entries into mains, labs, and fillers by LTP load and heuristics.
 * @param {Array} entries - Subject entries to classify.
 * @returns {Object} Classified arrays: mains, fillers, mainEntries, labEntries, fillerEntries, orderedEntries.
 */
function pdfImportClassifyEntries(entries) {
  const mains = [];
  const fillers = [];
  const mainEntries = [];
  const labEntries = [];
  const fillerEntries = [];
  let seenLab = false;
  const nonLabEntries = (entries || []).filter((entry) => !pdfImportIsLabEntry(entry)); // Entries excluding labs for threshold calc
  const ltpSplit = pdfImportResolveLtpThreshold(nonLabEntries);

  const pushUnique = (arr, short) => { // Pushes short code only if not already present
    if (!short) return;
    if (!arr.includes(short)) arr.push(short);
  };

  entries.forEach((entry) => {
    const short = pdfImportNormalizeShort(entry.short);
    if (!short) return;

    const isLab = pdfImportIsLabEntry(entry);
    const teacher = pdfImportNormalizeLine(entry.teacher || "");
    const teacherMissing = !teacher || /^not\s*mentioned$/i.test(teacher);
    const ltpLoad = pdfImportGetEntryLtpLoad(entry);

    if (isLab) {
      seenLab = true;
      labEntries.push(entry);
      return;
    }

    // Keep Quick Fill compatibility: entries without teacher stay in fillers.
    if (teacherMissing) {
      fillerEntries.push(entry);
      pushUnique(fillers, short);
      return;
    }

    let isMain = false;

    if (Number.isFinite(ltpLoad)) {
      if (Number.isFinite(ltpSplit)) {
        // Primary rule: higher LTP subjects are mains.
        isMain = ltpLoad > ltpSplit;
      } else {
        // Fallback when a clear split is not available (single LTP band).
        isMain = ltpLoad >= 3;
      }
    } else {
      // If LTP is missing, keep legacy safe behavior.
      isMain = !teacherMissing && !seenLab;
    }

    if (isMain) {
      mainEntries.push(entry);
      pushUnique(mains, short);
    } else {
      fillerEntries.push(entry);
      pushUnique(fillers, short);
    }
  });

  return {
    mains,
    fillers,
    mainEntries,
    labEntries,
    fillerEntries,
    orderedEntries: [...mainEntries, ...labEntries, ...fillerEntries],
  };
}

// Section: OUTPUT FORMATTING

/**
 * @description Formats an entry as a "short - subject - teacher" line.
 * @param {Object} entry - Subject entry.
 * @returns {string} Formatted line.
 */
function pdfImportFormatEntryLine(entry) {
  return `${entry.short} - ${entry.subject} - ${entry.teacher}`;
}

/**
 * @description Builds grouped subjects text with blank-line separators between mains, labs, and fillers.
 * @param {Object} param0 - Object with mainEntries, labEntries, and fillerEntries arrays.
 * @returns {string} Grouped text block.
 */
function pdfImportBuildGroupedSubjectsText({
  mainEntries = [],
  labEntries = [],
  fillerEntries = [],
}) {
  const blocks = [];
  if (mainEntries.length) {
    blocks.push(mainEntries.map(pdfImportFormatEntryLine).join("\n"));
  }
  if (labEntries.length) {
    blocks.push(labEntries.map(pdfImportFormatEntryLine).join("\n"));
  }
  if (fillerEntries.length) {
    blocks.push(fillerEntries.map(pdfImportFormatEntryLine).join("\n"));
  }
  return blocks.join("\n\n");
}
