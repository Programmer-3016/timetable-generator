/**
 * @module ui/pdf-import/payload.js
 * @description Page/text extraction and class payload construction for PDF import.
 */

// Section: CLASS SECTION DETECTION

function pdfImportExtractSectionLetter(text) {
  const t = pdfImportNormalizeLine(text);
  if (!t) return "";
  const m = t.match(/\bsection\b\s*[-: ]*\s*([A-Z])\b/i);
  if (m) return m[1].toUpperCase();
  const compact = t.match(/^[A-Za-z]{1,8}\s*[-:]\s*([A-Z])\b/);
  return compact ? compact[1].toUpperCase() : "";
}

/** @returns {boolean} Whether the line resembles a subject-table header row. */
function pdfImportLooksLikeSubjectHeaderLine(line) {
  const text = pdfImportNormalizeLine(line);
  if (!text) return false;

  const hasSubjectLikeToken = /\b(?:subject|course)\b/i.test(text);
  const hasCode = /\b(?:subject|course)\s*code\b/i.test(text) || /\bcode\b/i.test(text);
  const hasName =
    /\b(?:subject|course)\s*name\b/i.test(text) ||
    /\bshort\s*form\b/i.test(text);
  const hasTeacher =
    /\bname\s+of\s+subject\s+teacher\b/i.test(text) ||
    /\bsubject\s+teacher\b/i.test(text) ||
    /\bfaculty\s+name\b/i.test(text) ||
    /\bteacher\b/i.test(text);
  const hasLtp = /\bl\s*t\s*p\b/i.test(text) || /\bltp\b/i.test(text);

  if (hasCode && (hasName || hasTeacher || hasLtp)) return true;
  if (hasName && hasTeacher) return true;
  if (hasSubjectLikeToken && hasTeacher && hasLtp) return true;
  const hintCount = PDF_IMPORT_SUBJECT_HEADER_HINTS.reduce(
    (count, re) => count + (re.test(text) ? 1 : 0),
    0
  );
  return hintCount >= 2 &&
    /(subject|course|teacher|faculty|ltp|short)/i.test(text);
}

/** @returns {boolean} Whether the line resembles a class/section title (e.g. semester, year, section). */
function pdfImportLooksLikeClassTitleLine(line) {
  const text = pdfImportNormalizeLine(line);
  if (!text) return false;
  if (pdfImportLooksLikeClassHeader(text)) return true;
  const hasSem =
    /\bsem(?:ester)?\b/i.test(text) || /\b[IVX]{1,4}\s*sem\b/i.test(text);
  const hasYear =
    /\byear\b/i.test(text) ||
    /\b[IVX]{1,4}\s*year\b/i.test(text) ||
    /\bI\s*Year\b/i.test(text) ||
    /\bIT\s*Year\b/i.test(text) ||
    /\bIIT\s*Year\b/i.test(text);
  const hasSection = /\bsection\b\s*[-: ]*[A-Z]?\b/i.test(text);
  if (
    PDF_IMPORT_CLASS_HEADER_HINT_RE.test(text) &&
    ((hasSem && hasYear) || hasSection || /\bbatch\b/i.test(text))
  ) {
    return true;
  }
  if (hasSection && (hasSem || hasYear)) {
    return true;
  }
  return false;
}

/** @returns {Array<{label: string, lines: string[]}>} Class sections built by locating subject-header rows. */
function pdfImportBuildClassSectionsFromSubjectHeaders(lines) {
  const headerIndices = [];
  for (let i = 0; i < lines.length; i++) {
    const line = pdfImportNormalizeLine(lines[i]);
    if (pdfImportLooksLikeSubjectHeaderLine(line)) headerIndices.push(i);
  }
  if (!headerIndices.length) return [];

  const sections = [];
  for (let h = 0; h < headerIndices.length; h++) {
    const headerIdx = headerIndices[h];
    const nextHeaderIdx = headerIndices[h + 1] ?? lines.length;
    const backLimit = Math.max(0, headerIdx - 140);

    let sectionLetter = "";
    let sectionLineIdx = -1;
    for (let j = headerIdx; j >= backLimit; j--) {
      const ln = pdfImportNormalizeLine(lines[j]);
      const letter = pdfImportExtractSectionLetter(ln);
      if (letter) {
        sectionLetter = letter;
        sectionLineIdx = j;
        break;
      }
    }
    if (!sectionLetter) {
      const forwardLimit = Math.min(nextHeaderIdx, headerIdx + 40);
      for (let j = headerIdx; j < forwardLimit; j++) {
        const ln = pdfImportNormalizeLine(lines[j]);
        const letter = pdfImportExtractSectionLetter(ln);
        if (letter) {
          sectionLetter = letter;
          sectionLineIdx = j;
          break;
        }
      }
    }

    let titleLine = "";
    const titleScanStart = sectionLineIdx >= 0 ? sectionLineIdx : headerIdx;
    for (let j = titleScanStart; j >= backLimit; j--) {
      const ln = pdfImportNormalizeLine(lines[j]);
      if (PDF_IMPORT_TITLE_RE.test(ln) && PDF_IMPORT_SEM_YEAR_RE.test(ln)) {
        titleLine = ln;
        break;
      }
    }

    let label = "";
    if (titleLine && sectionLetter) {
      const normalizedTitle = pdfImportNormalizeClassLabel(titleLine);
      if (/\bSection\s*-\s*[A-Z]\b/i.test(normalizedTitle)) {
        label = normalizedTitle;
      } else {
        label = pdfImportNormalizeClassLabel(
          `${normalizedTitle} Section - ${sectionLetter}`
        );
      }
    } else if (titleLine) {
      label = pdfImportNormalizeClassLabel(titleLine);
    } else if (sectionLineIdx >= 0) {
      label = pdfImportNormalizeClassLabel(lines[sectionLineIdx]);
    } else {
      label = `Class ${h + 1}`;
    }

    const subjectLines = [];
    for (let i = headerIdx + 1; i < nextHeaderIdx; i++) {
      const line = pdfImportNormalizeLine(lines[i]);
      if (!line) continue;
      if (
        /\btime table coordinator\b/i.test(line) ||
        /\bhead of the department\b/i.test(line) ||
        /\bprincipal\b/i.test(line)
      ) {
        break;
      }
      subjectLines.push(line);
    }

    sections.push({
      label,
      lines: subjectLines,
    });
  }
  return sections;
}

/** @returns {Array<{label: string, lines: string[]}>} Class sections built by locating class title lines. */
function pdfImportBuildClassSectionsFromClassTitles(lines) {
  const titleIndices = [];
  for (let i = 0; i < lines.length; i++) {
    const line = pdfImportNormalizeLine(lines[i]);
    if (pdfImportLooksLikeClassTitleLine(line)) titleIndices.push(i);
  }
  if (!titleIndices.length) return [];

  const sections = [];
  for (let idx = 0; idx < titleIndices.length; idx++) {
    const start = titleIndices[idx];
    const end = titleIndices[idx + 1] ?? lines.length;
    const titleLine = pdfImportNormalizeLine(lines[start]) || `Class ${idx + 1}`;
    let label = pdfImportNormalizeClassLabel(titleLine) || `Class ${idx + 1}`;
    let sectionLetter = "";
    const sectionScanFrom = Math.max(0, start - 2);
    const sectionScanTo = Math.min(end, start + 12);
    for (let i = sectionScanFrom; i < sectionScanTo; i++) {
      const letter = pdfImportExtractSectionLetter(lines[i]);
      if (letter) {
        sectionLetter = letter;
        break;
      }
    }
    if (sectionLetter && !/\bSection\s*-\s*[A-Z]\b/i.test(label)) {
      label = pdfImportNormalizeClassLabel(`${label} Section - ${sectionLetter}`);
    }
    const subjectLines = [];

    let localHeaderIdx = -1;
    for (let i = start; i < end; i++) {
      const line = pdfImportNormalizeLine(lines[i]);
      if (pdfImportLooksLikeSubjectHeaderLine(line)) {
        localHeaderIdx = i;
        break;
      }
    }
    const scanStart = localHeaderIdx >= 0 ? localHeaderIdx + 1 : start + 1;

    for (let i = scanStart; i < end; i++) {
      const line = pdfImportNormalizeLine(lines[i]);
      if (!line) continue;
      if (i !== scanStart && pdfImportLooksLikeSubjectHeaderLine(line)) break;
      if (
        /\btime table coordinator\b/i.test(line) ||
        /\bhead of the department\b/i.test(line) ||
        /\bprincipal\b/i.test(line)
      ) {
        break;
      }
      subjectLines.push(line);
    }

    sections.push({
      label,
      lines: subjectLines,
    });
  }
  return sections;
}

/** @returns {number} Quality score for a parsed subject entry (higher = more reliable). */
function pdfImportScoreEntryQuality(entry) {
  const short = pdfImportNormalizeShort(entry?.short || "");
  const subject = pdfImportNormalizeLine(entry?.subject || "");
  const teacher = pdfImportNormalizeLine(entry?.teacher || "");

  let score = 0;
  if (short) score += 2;
  if (subject) score += 3;
  if (pdfImportIsStrictSubject(subject)) score += 4;
  if (pdfImportIsStrictShort(short)) score += 3;
  if (entry?.ltp) score += 1;
  if (teacher && !/^not\s*mentioned$/i.test(teacher)) score += 2;
  if (teacher && pdfImportIsStrictTeacher(teacher)) score += 1;

  if (subject && short && subject.toUpperCase() === short.toUpperCase()) score -= 7;
  if (/\bpractical\s+based\s+on\s+subject\b/i.test(subject)) score -= 5;
  if (/^[A-Z]$/i.test(teacher)) score -= 4;

  const artifactCount = subject
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, "").toUpperCase())
    .filter((w) => PDF_IMPORT_OCR_ARTIFACT_TOKEN_SET.has(w)).length;
  if (artifactCount) score -= artifactCount * 2;

  return score;
}

/** @returns {Array} Best entry per short code, filtering out low-quality duplicates. */
function pdfImportSelectBestEntriesByShort(entries) {
  const grouped = new Map();
  (entries || []).forEach((entry, idx) => {
    const short = pdfImportNormalizeShort(entry?.short || "");
    if (!short) return;
    if (!grouped.has(short)) grouped.set(short, []);
    grouped.get(short).push({
      entry,
      idx,
      score: pdfImportScoreEntryQuality(entry),
    });
  });

  const selected = [];
  grouped.forEach((group) => {
    group.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const subLenA = pdfImportNormalizeLine(a.entry?.subject || "").length;
      const subLenB = pdfImportNormalizeLine(b.entry?.subject || "").length;
      if (subLenB !== subLenA) return subLenB - subLenA;
      return a.idx - b.idx;
    });
    const best = group[0];
    // In larger classes, drop ultra-weak leftovers instead of injecting OCR garbage.
    if (best && best.score <= 0 && group.length >= 2) return;
    if (best) selected.push(best.entry);
  });

  return selected;
}

/** @returns {number} Aggregate quality score across all class sections. */
function pdfImportEstimateSectionsScore(sections) {
  let score = 0;
  for (const section of sections || []) {
    const entries = pdfImportParseSubjectTableLines(section?.lines || []);
    if (entries.length >= 3) score += entries.length;
    if ((section?.label || "").length >= 8) score += 1;
  }
  return score;
}

/** @returns {Array<{label: string, lines: string[]}>} Class sections using the best detection strategy (headers vs titles). */
function pdfImportBuildClassSections(lines) {
  const fromHeaders = pdfImportBuildClassSectionsFromSubjectHeaders(lines);
  const fromTitles = pdfImportBuildClassSectionsFromClassTitles(lines);

  if (!fromHeaders.length && !fromTitles.length) return [];
  if (!fromHeaders.length) return fromTitles;
  if (!fromTitles.length) return fromHeaders;

  const headerScore = pdfImportEstimateSectionsScore(fromHeaders);
  const titleScore = pdfImportEstimateSectionsScore(fromTitles);

  if (
    fromTitles.length > fromHeaders.length &&
    titleScore >= headerScore
  ) {
    return fromTitles;
  }
  if (titleScore > headerScore * 1.2) return fromTitles;
  return fromHeaders;
}

// Section: SETTINGS DETECTION

/** @returns {number|null} Number of distinct weekdays detected in the timetable lines. */
function pdfImportDetectDays(lines) {
  const firstBlockDays = new Set();
  let inFirstDayBlock = false;

  for (const raw of lines) {
    const line = pdfImportNormalizeLine(raw);
    if (!line) continue;
    if (pdfImportLooksLikeSubjectHeaderLine(line)) break;

    const cols = line.includes("|") ?
      line.split("|").map((c) => pdfImportNormalizeLine(c)).filter(Boolean) :
      [];
    const firstCol = cols.length ? cols[0] : line;
    const token = (firstCol.match(/^\s*(MON|TUE|WED|THU|FRI|SAT|SUN)\b/i) || [])[1]; // matched day-code token from current line

    if (token) {
      inFirstDayBlock = true;
      firstBlockDays.add(PDF_IMPORT_DAY_CODE_TO_NAME[token.toUpperCase()]);
      continue;
    }
    if (inFirstDayBlock && !token && !/\blunch\b/i.test(line)) {
      // End first timetable's day rows once non-day lines begin.
      break;
    }
  }
  if (firstBlockDays.size >= 3) return firstBlockDays.size;

  const found = new Set();
  lines.forEach((line) => {
    PDF_IMPORT_DAY_NAMES.forEach((day) => {
      if (new RegExp(`\\b${day}\\b`, "i").test(line)) found.add(day);
    });
    const m = String(line).match(/^\s*(MON|TUE|WED|THU|FRI|SAT|SUN)\b/i);
    if (m) {
      const day = PDF_IMPORT_DAY_CODE_TO_NAME[m[1].toUpperCase()];
      if (day) found.add(day);
    }
  });
  return found.size >= 3 ? found.size : null;
}

/** @returns {number|null} Highest LAB number found in the timetable lines. */
function pdfImportDetectLabCount(lines) {
  let maxLab = 0;
  lines.forEach((line) => {
    const matches = line.matchAll(/\bLAB\s*([1-9]\d*)\b/gi);
    for (const m of matches) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) maxLab = Math.max(maxLab, n);
    }
  });
  return maxLab > 0 ? maxLab : null;
}

/** @returns {Object} Detected timing settings (startTime, slots, duration, lunch info). */
function pdfImportDetectTimingSettings(lines) {
  let headerLine = "";
  let bestScore = -1;
  lines.forEach((line) => {
    const ranges = pdfImportExtractTimeRanges(line);
    if (ranges.length < 3) return;
    let score = ranges.length;
    if (/\btime\b/i.test(line)) score += 3;
    if (/\bp1\b/i.test(line)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      headerLine = line;
    }
  });

  const sourceLine = headerLine || "";
  if (!sourceLine) return {};
  const ranges = pdfImportExtractTimeRanges(sourceLine);
  if (!ranges.length) return {};

  const unique = [];
  const seen = new Set();
  ranges.forEach((r) => {
    const key = `${r.start}-${r.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(r);
  });
  if (!unique.length) return {};

  let lunchIdx = unique.findIndex((r) => r.lunchHint);
  if (lunchIdx < 0 && unique.length >= 7) {
    lunchIdx = Math.floor(unique.length / 2);
  }
  const nonLunch = unique.filter((_, idx) => idx !== lunchIdx);

  const durations = nonLunch
    .map((r) => pdfImportDurationMinutes(r.start, r.end))
    .filter((n) => Number.isFinite(n));
  durations.sort((a, b) => a - b);
  const mid = durations.length ? durations[Math.floor(durations.length / 2)] : null;

  const out = {};
  if (nonLunch.length && nonLunch[0].start) out.startTime = nonLunch[0].start;
  if (nonLunch.length >= 4) out.slots = nonLunch.length;
  if (mid != null) out.duration = mid;

  if (lunchIdx >= 0) {
    out.lunchPeriod = lunchIdx;
    const lunchRange = unique[lunchIdx];
    const lunchDur = pdfImportDurationMinutes(lunchRange.start, lunchRange.end);
    if (lunchDur != null) out.lunchDuration = lunchDur;
  }
  return out;
}

// Section: TEXT LAYER EXTRACTION

/** @returns {string[]} Text lines from PDF page items, using column-gap detection for pipe delimiters. */
function pdfImportExtractLinesFromPageItems(items) {
  const buckets = [];
  const toleranceY = 2.2;

  items.forEach((item) => {
    const txt = pdfImportPreprocessLine(item.str || "", {
      convertWideGaps: false,
    });
    if (!txt) return;
    const y = Number(item.transform?.[5] || 0);
    const x = Number(item.transform?.[4] || 0);
    const width = Number(item.width || txt.length * 5);

    let bucket = null;
    for (const b of buckets) {
      if (Math.abs(b.y - y) <= toleranceY) {
        bucket = b;
        break;
      }
    }
    if (!bucket) {
      bucket = {
        y,
        cells: []
      };
      buckets.push(bucket);
    }
    bucket.cells.push({
      x,
      width,
      txt
    });
  });

  buckets.sort((a, b) => b.y - a.y);
  const lines = [];

  buckets.forEach((bucket) => {
    bucket.cells.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEnd = null;
    bucket.cells.forEach((cell) => {
      if (!line) {
        line = cell.txt;
        prevEnd = cell.x + cell.width;
        return;
      }
      const gap = cell.x - (prevEnd || cell.x);
      line += gap > 28 ? " | " : " ";
      line += cell.txt;
      prevEnd = cell.x + cell.width;
    });
    const normalized = pdfImportPreprocessLine(line, {
      convertWideGaps: true,
    });
    if (!normalized) return;
    if (
      pdfImportIsLowQualityLine(normalized) &&
      !pdfImportLooksLikeSubjectHeaderLine(normalized)
    ) {
      return;
    }
    lines.push(normalized);
  });

  return lines;
}

/** @returns {string[]} Text lines from PDF page items using compact (no gap) joining. */
function pdfImportExtractLinesFromPageItemsCompact(items) {
  const buckets = [];
  const toleranceY = 2.2;

  items.forEach((item) => {
    const txt = pdfImportPreprocessLine(item.str || "", {
      convertWideGaps: false,
    });
    if (!txt) return;
    const y = Number(item.transform?.[5] || 0);
    const x = Number(item.transform?.[4] || 0);

    let bucket = null;
    for (const b of buckets) {
      if (Math.abs(b.y - y) <= toleranceY) {
        bucket = b;
        break;
      }
    }
    if (!bucket) {
      bucket = {
        y,
        cells: []
      };
      buckets.push(bucket);
    }
    bucket.cells.push({
      x,
      txt
    });
  });

  buckets.sort((a, b) => b.y - a.y);
  return buckets
    .map((bucket) =>
      bucket.cells
        .sort((a, b) => a.x - b.x)
        .map((cell) => cell.txt)
        .join(" ")
    )
    .map((line) =>
      pdfImportPreprocessLine(line, {
        convertWideGaps: true,
      })
    )
    .filter((line) => {
      if (!line) return false;
      if (
        pdfImportIsLowQualityLine(line) &&
        !pdfImportLooksLikeSubjectHeaderLine(line)
      ) {
        return false;
      }
      return true;
    });
}

/** @returns {number} Heuristic quality score for a set of extracted text lines. */
function pdfImportScoreExtractedLines(lines) {
  let score = 0;
  for (const raw of lines || []) {
    const line = pdfImportNormalizeLine(raw);
    if (!line) continue;
    if (pdfImportLooksLikeSubjectHeaderLine(line)) score += 8;
    if (/^(?:VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/i.test(line)) score += 4;
    if (/^[A-Z][A-Z0-9&\s]{1,20}\s*-\s*.+\s*-\s*.+$/.test(line)) score += 5;
    if (line.includes("|")) score += 1;
  }
  return score;
}

/** @returns {string[]} Best extraction result (column-aware vs compact) for a page's text items. */
function pdfImportChooseBestPageLines(items) {
  const withColumns = pdfImportExtractLinesFromPageItems(items);
  const compact = pdfImportExtractLinesFromPageItemsCompact(items);
  const scoreWithColumns = pdfImportScoreExtractedLines(withColumns);
  const scoreCompact = pdfImportScoreExtractedLines(compact);

  if (scoreCompact > scoreWithColumns) return compact;
  if (scoreCompact === scoreWithColumns && compact.length > withColumns.length) {
    return compact;
  }
  return withColumns;
}

// Section: OCR EXTRACTION AND FALLBACK

/** @returns {string} Sanitized OCR line with artifacts and low-quality content removed. */
function pdfImportSanitizeOcrLine(rawLine) {
  let line = pdfImportPreprocessLine(rawLine, {
    convertWideGaps: true,
  });
  if (!line) return "";

  line = line
    .replace(/[^\x20-\x7E|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!line || /^[_\-|=.:]+$/.test(line)) return "";
  if (
    pdfImportIsLowQualityLine(line) &&
    !pdfImportLooksLikeSubjectHeaderLine(line) &&
    !/^(?:VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/i.test(line)
  ) {
    return "";
  }
  return line;
}

/** @returns {string[]} Sanitized text lines extracted from a Tesseract OCR result object. */
function pdfImportExtractLinesFromOcrResult(ocrResult) {
  // lines extracted from structured OCR data
  const fromStructured = ((ocrResult?.data?.lines || []) || [])
    .map((entry) => pdfImportSanitizeOcrLine(entry?.text || ""))
    .filter(Boolean);

  if (fromStructured.length) return fromStructured;

  return String(ocrResult?.data?.text || "")
    .split(/\r?\n/)
    .map((line) => pdfImportSanitizeOcrLine(line))
    .filter(Boolean);
}

/** @returns {boolean} Whether OCR fallback should run due to weak text-layer extraction. */
function pdfImportShouldRunOcrFallback(lines) {
  // preprocessed non-empty lines for quality assessment
  const rawLines = (lines || [])
    .map((line) =>
      pdfImportPreprocessLine(line, {
        convertWideGaps: true,
      })
    )
    .filter(Boolean);
  if (!rawLines.length) return true;

  const score = pdfImportScoreExtractedLines(rawLines);
  const headerHits = rawLines.filter((line) => pdfImportLooksLikeSubjectHeaderLine(line))
    .length;
  const subjectRowHits = rawLines.filter((line) =>
    /^(?:VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/i.test(line)
  ).length;
  const lowQualityLines = rawLines.filter((line) =>
    pdfImportIsLowQualityLine(line)
  ).length;
  const lowQualityRatio = lowQualityLines / Math.max(1, rawLines.length);

  if (headerHits === 0) return true;
  if (lowQualityRatio >= 0.28 && score < 180) return true;
  if (subjectRowHits < 3 && score < 80) return true;
  if (score < 40) return true;
  return false;
}

/** @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, viewport: Object, rotation: number}} Rendered canvas for OCR. */
function pdfImportRenderPageCanvasForOcr(
  page,
  rotationDelta = 0,
  targetMaxDim = 1800
) {
  const baseRotation = Number(page?.rotate || 0);
  const rotation = ((baseRotation + rotationDelta) % 360 + 360) % 360; // effective page rotation in degrees
  const baseViewport = page.getViewport({
    scale: 1,
    rotation,
  });
  const maxDim = Math.max(baseViewport.width, baseViewport.height) || 1;
  const renderScale = Math.max(1, Math.min(2, targetMaxDim / maxDim));
  const viewport = page.getViewport({
    scale: renderScale,
    rotation,
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d", {
    alpha: false
  });
  return {
    canvas,
    ctx,
    viewport,
    rotation,
  };
}

/** @description Enhances canvas contrast (grayscale + threshold) for better OCR accuracy. */
function pdfImportEnhanceCanvasForOcr(canvas, ctx) {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    gray = gray > 192 ? 255 : gray < 56 ? 0 : gray;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  ctx.putImageData(img, 0, 0);
}

/** @returns {boolean} Whether an OCR line is likely garbage (low vowel ratio, repeated chars). */
function pdfImportIsLikelyOcrGarbageLine(rawLine) {
  const line = pdfImportNormalizeLine(rawLine);
  if (!line) return true;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;

  let alphaWordCount = 0;
  let weirdWordCount = 0;
  for (const token of words) {
    const clean = token.replace(/[^A-Za-z]/g, "");
    if (clean.length < 4) continue;
    alphaWordCount += 1;
    const vowels = (clean.match(/[aeiou]/gi) || []).length; // count of vowel characters in the word
    const repeated = /(.)\1{3,}/i.test(clean);
    if (vowels === 0 || repeated) weirdWordCount += 1;
  }

  if (alphaWordCount >= 4 && weirdWordCount / alphaWordCount >= 0.6) {
    return true;
  }
  return false;
}

/** @returns {number} Combined quality score for OCR-extracted lines (accounts for confidence, garbage, signals). */
function pdfImportScoreOcrLinesQuality(lines, confidence = 0) {
  // normalized non-empty lines for quality scoring
  const normalized = (lines || []).map((line) => pdfImportNormalizeLine(line)).filter(Boolean);
  if (!normalized.length) return 0;

  const parseableEntries = pdfImportParseSubjectTableLines(normalized);
  const uniqueShorts = new Set(
    parseableEntries.map((entry) => pdfImportNormalizeShort(entry.short))
  ).size;
  const teacherSignalLines = normalized.filter((line) =>
    /\b(?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Prof(?:essor)?\.?|Not\s*Mentioned)\b/i.test(line)
  ).length;
  const garbageLines = normalized.filter((line) =>
    pdfImportIsLikelyOcrGarbageLine(line)
  ).length;

  let score = 0;
  score += pdfImportScoreExtractedLines(normalized);
  score += parseableEntries.length * 2;
  score += uniqueShorts * 2;
  score += teacherSignalLines * 1.5;
  score += Math.max(0, Number(confidence) || 0) * 0.8;
  score -= garbageLines * 8;

  if (teacherSignalLines < 3) score -= 18;
  return Math.max(0, score);
}

/** @returns {Promise<{lines: string[], confidence: number, qualityScore: number, rotation: number}>} OCR result for a single PDF page. */
async function pdfImportRecognizePageWithOcr(
  page,
  pageNo,
  totalPages,
  rotationDelta = 0,
  targetMaxDim = 1800
) {
  const {
    canvas,
    ctx,
    viewport,
    rotation
  } = pdfImportRenderPageCanvasForOcr(page, rotationDelta, targetMaxDim);
  if (!ctx) throw new Error("Canvas context unavailable for OCR.");

  await page.render({
    canvasContext: ctx,
    viewport
  }).promise;
  pdfImportEnhanceCanvasForOcr(canvas, ctx);

  if (typeof showGenerationAnimation === "function") {
    showGenerationAnimation(
      0,
      `Running OCR on page ${pageNo}/${totalPages} (rotation ${rotation}deg)...`
    );
  }

  const result = await window.Tesseract.recognize(canvas, "eng");
  const lines = pdfImportExtractLinesFromOcrResult(result);
  const confidence = Number(result?.data?.confidence || 0);
  const qualityScore = pdfImportScoreOcrLinesQuality(lines, confidence);
  canvas.width = 1;
  canvas.height = 1;
  return {
    lines,
    confidence,
    qualityScore,
    rotation,
  };
}

/** @returns {Promise<{rotationDelta: number, confidence: number, qualityScore: number, combinedScore: number}>} Best OCR rotation detected by probing multiple angles. */
async function pdfImportDetectBestOcrRotation(pdf) {
  const probePage = await pdf.getPage(1);
  const deltas = [0, 90, 270, 180];
  let best = null;

  for (const delta of deltas) {
    const probe = await pdfImportRecognizePageWithOcr(
      probePage,
      1,
      pdf.numPages,
      delta,
      1400
    );
    const combinedScore = probe.qualityScore + probe.confidence;
    if (!best || combinedScore > best.combinedScore) {
      best = {
        ...probe,
        rotationDelta: delta,
        combinedScore,
      };
    }
  }

  return best || {
    rotationDelta: 0,
    confidence: 0,
    qualityScore: 0,
    combinedScore: 0,
  };
}

/** @returns {Promise<{lines: string[], bestRotation: Object, averagePageQuality: number}>} Lines extracted from all PDF pages via OCR. */
async function pdfImportExtractPdfLinesFromOcr(pdf) {
  const bestRotation = await pdfImportDetectBestOcrRotation(pdf);
  if (
    bestRotation.qualityScore < 35 &&
    bestRotation.confidence < 28
  ) {
    throw new Error(
      "OCR quality is too low on probe page. Use a clearer/upright scan."
    );
  }

  const all = [];
  const perPageScores = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const pageOcr = await pdfImportRecognizePageWithOcr(
      page,
      pageNo,
      pdf.numPages,
      bestRotation.rotationDelta,
      1800
    );
    perPageScores.push(pageOcr.qualityScore);
    all.push(...pageOcr.lines);
  }
  return {
    lines: all,
    bestRotation,
    averagePageQuality:
      perPageScores.length ?
      perPageScores.reduce((sum, n) => sum + n, 0) / perPageScores.length :
      0,
  };
}

/** @returns {Promise<string[]>} Lines extracted from all PDF pages via the built-in text layer. */
async function pdfImportExtractPdfLinesFromTextLayer(pdf) {
  const all = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const text = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
    const pageLines = pdfImportChooseBestPageLines(text.items || []);
    all.push(...pageLines);
  }
  return all;
}

/** @returns {Promise<string[]>} Extracted text lines from a PDF file, using text layer with OCR fallback. */
async function pdfImportExtractPdfLines(file) {
  if (!window.pdfjsLib) throw new Error("PDF parser not available.");
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
  }

  const data = await file.arrayBuffer();
  const task = window.pdfjsLib.getDocument({
    data
  });
  const pdf = await task.promise;
  const textLines = await pdfImportExtractPdfLinesFromTextLayer(pdf);

  if (!pdfImportShouldRunOcrFallback(textLines)) {
    return textLines;
  }

  if (!window.Tesseract) {
    throw new Error(
      "OCR library not loaded. Refresh once and try importing scanned PDF again."
    );
  }

  if (typeof showGenerationAnimation === "function") {
    showGenerationAnimation(
      0,
      "Text layer missing/weak. Running OCR for scanned PDF..."
    );
  }

  try {
    const ocrAttempt = await pdfImportExtractPdfLinesFromOcr(pdf);
    const ocrLines = ocrAttempt.lines || [];
    const textScore = pdfImportScoreExtractedLines(textLines);
    const ocrScore = pdfImportScoreExtractedLines(ocrLines);
    const ocrQuality = pdfImportScoreOcrLinesQuality(
      ocrLines,
      ocrAttempt?.bestRotation?.confidence || 0
    );

    if (ocrQuality < 80) {
      if (textScore >= 80) return textLines;
      throw new Error(
        "OCR extracted noisy text. Please use a cleaner PDF (upright, high-contrast scan)."
      );
    }

    return ocrScore >= textScore ? ocrLines : textLines;
  } catch (error) {
    throw new Error(
      `OCR failed for scanned PDF: ${error?.message || "unknown OCR error"}`
    );
  }
}

// Section: PAYLOAD BUILDING AND QUALITY ASSESSMENT

/** @returns {Array<{label: string, subjects: string, mains: string, fillers: string, ltpByShort: Object}>} Structured class payloads from raw lines. */
function pdfImportBuildClassPayloads(lines) {
  const sections = pdfImportBuildClassSections(lines);
  const rawClasses = [];

  sections.forEach((section, idx) => {
    let entries = pdfImportParseSubjectTableLines(section.lines);
    entries = pdfImportBackfillMissingLtp(entries, section.lines);
    // OCR/noise guard: keep only strict parseable rows.
    entries = entries.filter(
      (entry) =>
        pdfImportIsStrictShort(entry?.short || "") &&
        pdfImportIsStrictSubject(entry?.subject || "")
    );
    entries = pdfImportSelectBestEntriesByShort(entries);
    const classified = pdfImportClassifyEntries(entries);
    const hintLtpMap = pdfImportBuildLtpMapFromHints(section.lines);
    const entryLtpMap = pdfImportBuildLtpMap(entries);
    rawClasses.push({
      idx,
      label: section.label,
      entryCount: entries.length,
      confidenceScore: entries.length + (classified.mains.length + classified.fillers.length),
      // Keep imported textarea readable: mains block, labs block, fillers block.
      subjects: pdfImportBuildGroupedSubjectsText(classified),
      mains: classified.mains.join(", "),
      fillers: classified.fillers.join(", "),
      // Prefer parsed-entry LTP; fill remaining gaps from raw code-row hints.
      ltpByShort: {
        ...hintLtpMap,
        ...entryLtpMap,
      },
    });
  });

  // Dedupe by near-equal labels and keep the richer section.
  const byLabel = new Map();
  rawClasses.forEach((cls) => {
    const key = pdfImportNormalizeLine(cls.label || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!key) {
      byLabel.set(`__idx_${cls.idx}`, cls);
      return;
    }
    const prev = byLabel.get(key);
    if (!prev || cls.confidenceScore > prev.confidenceScore) {
      byLabel.set(key, cls);
    }
  });

  let classes = Array.from(byLabel.values())
    .sort((a, b) => a.idx - b.idx);

  // When OCR produces extra weak pseudo-classes, trim very weak tails.
  const strongCount = classes.filter((cls) => cls.entryCount >= 4).length;
  if (classes.length >= 8 && strongCount >= 6) {
    classes = classes.filter((cls) => cls.entryCount >= 2);
  }

  return classes.map((cls) => ({
    label: cls.label,
    subjects: cls.subjects,
    mains: cls.mains,
    fillers: cls.fillers,
    ltpByShort: cls.ltpByShort,
  }));
}

/** @returns {{ok: boolean, issues: string[], warnings: string[], summary: string}} Quality assessment of the PDF import result. */
function pdfImportAssessImportQuality(lines, classes) {
  const issues = [];
  const warnings = [];
  const classCount = (classes || []).length; // number of parsed classes
  const rawLineCount = (lines || []).length; // number of raw extracted lines

  if (!rawLineCount) {
    issues.push("PDF text extraction returned zero lines.");
  }
  if (!classCount) {
    issues.push("No class blocks could be reconstructed from this PDF.");
  }

  let reliableClassCount = 0;
  const weakClassNotes = [];

  (classes || []).forEach((cls, idx) => {
    const label = String(cls?.label || "").trim();
    const subjectLines = String(cls?.subjects || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!label || /^class\s+\d+$/i.test(label)) {
      warnings.push(`Class ${idx + 1}: label is generic or weak.`);
    }

    if (subjectLines.length >= 4) {
      reliableClassCount += 1;
    } else {
      weakClassNotes.push(`Class ${idx + 1}: only ${subjectLines.length} subject(s).`);
    }

    const malformed = subjectLines.filter(
      (line) =>
        !/^[A-Z0-9&]+(?:\s+[A-Z0-9&]+){0,2}\s*-\s*.+\s*-\s*.+$/i.test(line)
    );
    if (malformed.length && subjectLines.length) {
      const malformedRatio = malformed.length / subjectLines.length;
      if (malformedRatio >= 0.8 && subjectLines.length >= 5) {
        warnings.push(
          `Class ${idx + 1}: many malformed lines (${malformed.length}/${subjectLines.length}).`
        );
      }
    }
  });

  // Hard block only when extraction is broadly unreliable.
  if (classCount > 0 && reliableClassCount === 0) {
    issues.push("All classes are low-confidence after parse. Import aborted.");
  } else if (
    classCount >= 6 &&
    reliableClassCount < Math.max(2, Math.floor(classCount * 0.35))
  ) {
    issues.push(
      `Only ${reliableClassCount}/${classCount} classes parsed with reliable subject count.`
    );
  }

  if (weakClassNotes.length) {
    warnings.push(
      `Low-confidence classes: ${weakClassNotes.slice(0, 4).join(" | ")}${
        weakClassNotes.length > 4 ? " ..." : ""
      }`
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    summary: `${classCount} class(es), ${rawLineCount} raw line(s), ${issues.length} blocking issue(s).`,
  };
}

// Subsection: Form Apply and File Workflow
