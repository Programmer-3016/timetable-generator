/* exported pdfImportDurationMinutes, pdfImportExtractTimeRanges, pdfImportLooksLikeClassHeader, pdfImportNormalizeClassLabel, pdfImportParseSubjectLine, pdfImportDeriveShortFromSubject, pdfImportSplitLineBySubjectCode, pdfImportSplitTabularColumns, pdfImportSplitMergedDashEntries, pdfImportFinalizeEntry, pdfImportExtractShortFromTail */
/**
 * @module ui/pdf-import/text-utils.js
 * @description General normalization and parsing utilities for PDF import.
 */

// Section: LINE PREPROCESSING

function pdfImportNormalizeLine(text) {
  return pdfImportPreprocessLine(text, {
    convertWideGaps: false,
  });
}

/** @description Preprocesses a PDF text line: strips invisible chars, normalizes dashes/quotes, and optionally converts wide gaps to pipe delimiters. */
function pdfImportPreprocessLine(text, options = {}) {
  const convertWideGaps = options.convertWideGaps !== false;
  let out = String(text || "");
  if (!out) return "";

  out = out
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z]{2,})(\d{2,})(?=\s|$)/g, "$1 $2")
    .replace(/\s*\|\s*/g, " | ");

  if (convertWideGaps && /[ \t]{2,}/.test(out)) {
    const looksTabular =
      /\b(?:subject|course|short|teacher|faculty|ltp|code)\b/i.test(out) ||
      /^(?:\s*)(?:VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/i.test(out) ||
      /\b(?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Prof\.?)\b/i.test(out);
    if (looksTabular) {
      out = out.replace(/[ \t]{2,}/g, " | ");
    }
  }

  return out
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\|\s*/g, " | ")
    .trim();
}

/** @description Checks whether a line is low-quality (too short, symbol-heavy, or mostly unpronounceable words). */
function pdfImportIsLowQualityLine(line) {
  const t = pdfImportNormalizeLine(line);
  if (!t) return true;
  if (t.length < 3) return true;
  if (/^[^A-Za-z0-9]+$/.test(t)) return true;

  const symbolDensity =
    (t.match(/[^A-Za-z0-9\s|&/().,'\-:]/g) || []).length / Math.max(1, t.length);
  if (symbolDensity > 0.26) return true;

  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  if (words.length >= 4) {
    const weird = words.filter((w) => {
      if (w.length < 4) return false;
      const vowels = (w.match(/[aeiou]/gi) || []).length; // vowel count in the word
      return vowels === 0 || /(.)\1{3,}/i.test(w);
    }).length;
    if (weird / words.length >= 0.68) return true;
  }

  return false;
}

/** @description Escapes special regex characters in a string. */
function pdfImportEscapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @description Normalizes a roman numeral token (I–X), correcting common OCR misreads. */
function pdfImportNormalizeRomanToken(rawToken, fallback = "") {
  const token = String(rawToken || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .trim();
  if (!token) return fallback;
  if (PDF_IMPORT_ROMAN_TOKEN_SET.has(token)) return token;
  if (token === "IT" || token === "IIT") return "II";
  if (token === "IIIT") return "III";
  if (token === "IVT") return "IV";
  if (token === "VIT") return "VI";
  return fallback;
}

// Section: TIME PARSING

function pdfImportToHHMM(raw) {
  const m = String(raw || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!m) return "";
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const mer = (m[3] || "").toUpperCase(); // AM/PM meridiem indicator
  if (Number.isNaN(hh) || Number.isNaN(mm) || mm < 0 || mm > 59) return "";
  if (mer) {
    if (mer === "PM" && hh < 12) hh += 12;
    if (mer === "AM" && hh === 12) hh = 0;
  }
  if (hh < 0 || hh > 23) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** @description Converts an HH:MM time string to total minutes since midnight. */
function pdfImportTimeToMinutes(hhmm) {
  const t = pdfImportToHHMM(hhmm);
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

/** @description Calculates duration in minutes between two time strings, handling noon crossover. */
function pdfImportDurationMinutes(start, end) {
  const s = pdfImportTimeToMinutes(start);
  let e = pdfImportTimeToMinutes(end);
  if (s == null || e == null) return null;
  // Noon crossover in PDFs is commonly written as 12:25-1:15 (without AM/PM).
  if (e <= s && s >= 11 * 60 && e <= 6 * 60) e += 12 * 60;
  if (e <= s) return null;
  return e - s;
}

/** @description Extracts all start–end time range pairs from a line of text. */
function pdfImportExtractTimeRanges(line) {
  const out = [];
  const re = /\b(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)\s*-\s*(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)\b/g;
  let m;
  let prevEnd = 0;
  while ((m = re.exec(line)) !== null) {
    const before = line.slice(prevEnd, m.index).toLowerCase();
    out.push({
      start: pdfImportToHHMM(m[1]),
      end: pdfImportToHHMM(m[2]),
      lunchHint: /\blunch\b/i.test(before),
      idx: m.index,
    });
    prevEnd = re.lastIndex;
  }
  return out.filter((r) => r.start && r.end);
}

// Section: CLASS DETECTION

/** @description Checks if text looks like a class/section header (e.g. "B.Tech II Sem Section A"). */
function pdfImportLooksLikeClassHeader(text) {
  const t = pdfImportNormalizeLine(text);
  return (
    PDF_IMPORT_TITLE_RE.test(t) &&
    PDF_IMPORT_SEM_YEAR_RE.test(t) &&
    (
      PDF_IMPORT_SECTION_RE.test(t) ||
      /\broom\s*no\b/i.test(t) ||
      /\btime\s*table\b/i.test(t)
    )
  );
}

/** @description Normalizes a class header into a canonical label (program, semester, year, section). */
function pdfImportNormalizeClassLabel(text) {
  let out = pdfImportNormalizeLine(text).replace(/\|/g, " ");
  out = out.replace(/\bTIME\s*TABLE.*$/gi, " ");
  out = out.replace(/\bCOORDINATOR\b.*$/gi, " ");
  out = out.replace(/\bROOM\s*NO\.?\b.*$/gi, " ");
  out = out.replace(/\(w\.?e\.?f\.?.*?\)/gi, " ");
  out = out.replace(/\bON\s*-\s*([A-Z])\b/i, "Section - $1");
  out = out.replace(/\bIYEAR\b/gi, "I Year");
  out = out.replace(/\[\s*Year\b/gi, "I Year");
  out = out.replace(/\bIT\s+Sem\b/gi, "II Sem");
  out = out.replace(/\bIIT\s+Sem\b/gi, "II Sem");
  out = out.replace(/\bIT\s+Year\b/gi, "II Year");
  out = out.replace(/\bIIT\s+Year\b/gi, "II Year");
  out = out.replace(/\b([IVX]+)\s*Sem\b/gi, "$1 Sem");
  out = out.replace(/\b([IVX]+)\s*Year\b/gi, "$1 Year");
  out = out.replace(/\bYear\(([^)]+)\)/gi, "Year ($1)");
  out = out.replace(/\s*section\s*[-:]\s*/i, " Section - ");
  if (!/\bSection\s*-\s*/i.test(out) && /\bsection\b/i.test(out)) {
    out = out.replace(/\bsection\b/i, "Section -");
  }
  out = out.replace(/\bSection\s*-\s*([A-Za-z])\b/i, "Section - $1");
  out = out.replace(/\s+/g, " ").trim();
  out = out.replace(/\s*\(\s*\)\s*/g, " ").trim();

  const sectionLetter = pdfImportExtractSectionLetter(out);
  const hasAktu = /\bAKTU\b/i.test(out);
  const programMatch = out.match(
    /\b(BCA|MCA|MBA|B\.?\s*TECH|M\.?\s*TECH|BBA|BSC|B\.?\s*SC)\b/i
  );
  const semMatch = out.match(/\b([IVX]{1,4}|IT|IIT)\s*Sem\b/i);
  const yearMatch = out.match(/\b([IVX]{1,4}|IT|IIT|I)\s*Year\b/i);

  const program = String(programMatch?.[1] || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const semRoman = pdfImportNormalizeRomanToken(semMatch?.[1] || "");
  const yearRoman =
    pdfImportNormalizeRomanToken(yearMatch?.[1] || "") ||
    (/\bI\s*Year\b/i.test(out) || /\[\s*Year\b/i.test(out) ? "I" : "");

  if (program && semRoman && yearRoman) {
    let canonical = `${program} ${semRoman} Sem , ${yearRoman} Year`;
    if (hasAktu) canonical += " (AKTU)";
    if (sectionLetter) canonical += ` Section - ${sectionLetter}`;
    return canonical;
  }

  return out.trim();
}

// Section: LINE FILTERING

/** @description Determines whether a line should be skipped (day headers, artifacts, time-only rows, etc.). */
function pdfImportShouldSkipLine(line) {
  const t = pdfImportNormalizeLine(line);
  if (!t) return true;
  if (t.length < 2) return true;
  const subjectCodePattern = /^(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/i;
  if (
    pdfImportIsLowQualityLine(t) &&
    !subjectCodePattern.test(t) &&
    !/\s-\s/.test(t)
  ) {
    return true;
  }
  const low = t.toLowerCase();
  const artifactOnly =
    /^(?:(?:dye|ode|ame|bye|p|q|n|an)|\d{1,2})(?:\s+(?:(?:dye|ode|ame|bye|p|q|n|an)|\d{1,2}))*$/i.test(
      t
    );
  if (artifactOnly) return true;
  if (/^\d+$/.test(t)) return true;
  if (/\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/.test(t)) return true;
  if (/\bday\s*\/\s*period\b/i.test(t)) return true;
  if (/^\s*day\s*[-:]/i.test(t)) return true;
  if (/\bsubject\s*code\b/i.test(t) || /\bsubject\s*name\b/i.test(t))
    return true;
  if (/\bfaculty\s*name\b/i.test(t) || /\bcoordinator\b/i.test(t)) return true;
  if (/\bhead of the department\b/i.test(t)) return true;
  if (/\btime table coordinator\b/i.test(t)) return true;
  if (/\broom\s*no\.?\b/i.test(t)) return true;
  if (/^\s*room\b/i.test(t)) return true;
  if (/\beven\s+semester\b/i.test(t)) return true;
  if (/\bpractical\s+based\s+on\s+subject\s+code\b/i.test(t)) return true;
  if (/\bmentor[s]?\b/i.test(t)) return true;
  if (/\broll\s*no\b/i.test(t)) return true;
  if (/^\s*no\s*[-:]\s*\d+/i.test(t)) return true;
  if (/^\s*(?:mon|tue|wed|thu|fri|sat|sun)\b/i.test(t)) return true;
  if (/^\b(?:p\d+|lunch)\b/i.test(low)) return true;
  if (t.includes("|") && !subjectCodePattern.test(t) && !/\s-\s/.test(t)) {
    const alphaTokens = t
      .split(/\s+/)
      .filter((w) => w !== "|")
      .map((w) => w.replace(/[^A-Za-z]/g, ""))
      .filter(Boolean);
    const pipeCount = (t.match(/\|/g) || []).length; // number of pipe delimiters in the line
    if (pipeCount >= 3 && alphaTokens.length <= 6) return true;
    if (
      alphaTokens.length >= 3 &&
      alphaTokens.every((w) => w.length <= 3) &&
      pipeCount >= 2
    ) {
      return true;
    }
  }
  if (
    !/\s-\s/.test(t) &&
    !/\|/.test(t) &&
    pdfImportLooksLikeTeacherNameList(t)
  ) {
    return true;
  }
  if (!/\s-\s/.test(t) && !/\|/.test(t) && pdfImportLooksLikePersonNameChunk(t))
    return true;
  if (PDF_IMPORT_DAY_NAMES.some((d) => low === d.toLowerCase())) return true;
  return false;
}

// Section: SUBJECT CODE PARSING

function pdfImportNormalizeShort(raw) {
  let out = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^[A-Z0-9]{2,12}LAB$/.test(out) && !/\sLAB$/.test(out)) {
    out = `${out.slice(0, -3)} LAB`.trim();
  }
  return out;
}

/** @description Checks if a token looks like a subject code (uppercase alphanumeric, not a blocked keyword). */
function pdfImportIsLikelyCodeToken(tok) {
  const t = String(tok || "").toUpperCase();
  if (!t) return false;
  if (!/^[A-Z0-9&]{1,12}$/.test(t)) return false;
  if (!/[A-Z]/.test(t)) return false;
  const blocked = new Set([
    "SUBJECT",
    "NAME",
    "FACULTY",
    "CODE",
    "THEORY",
    "PRACTICAL",
    "CREDITS",
    "CLASS",
    "TOTAL",
    "LUNCH",
  ]);
  return !blocked.has(t);
}

/** @description Splits a line into head (subject portion) and teacher name. */
function pdfImportExtractTeacherAndHead(line) {
  const source = pdfImportNormalizeLine(line).replace(/\|/g, " ");
  if (!source) return {
    head: "",
    teacher: ""
  };

  const notMentioned = source.match(/\bnot\s*mentioned\b/i);
  if (notMentioned) {
    const head = pdfImportNormalizeLine(
      source.replace(/\bnot\s*mentioned\b/gi, "")
    );
    return {
      head,
      teacher: "Not Mentioned"
    };
  }

  const titleRe =
    /\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\s+[A-Za-z][A-Za-z().'\-\s]*/gi;
  const titleMatch = titleRe.exec(source);
  if (titleMatch && titleMatch.index != null) {
    return {
      head: pdfImportNormalizeLine(source.slice(0, titleMatch.index)),
      teacher: pdfImportNormalizeLine(source.slice(titleMatch.index)),
    };
  }

  const tailRole = source.match(/\b(?:Mentor|Faculty)\b\s*$/i);
  if (tailRole && tailRole.index != null) {
    return {
      head: pdfImportNormalizeLine(source.slice(0, tailRole.index)),
      teacher: pdfImportNormalizeLine(tailRole[0]),
    };
  }

  // OCR rows often miss honorifics (e.g. "... Operating System Os Saloni Singh").
  // Split a trailing person-name chunk into teacher when detected.
  const tailNameMatch = source.match(
    /^(.*?)([A-Z][A-Za-z.'\-]*(?:\s+[A-Z][A-Za-z.'\-]*){1,2})$/
  );
  if (tailNameMatch) {
    const maybeHead = pdfImportNormalizeLine(tailNameMatch[1]);
    const maybeTeacher = pdfImportNormalizeLine(tailNameMatch[2]);
    const maybeTeacherParts = maybeTeacher.split(/\s+/).filter(Boolean);
    let compactTeacher = maybeTeacher;
    if (
      maybeTeacherParts.length >= 3 &&
      /^[A-Za-z]{2,3}$/.test(maybeTeacherParts[0])
    ) {
      const tailOnly = maybeTeacherParts.slice(1).join(" ");
      if (pdfImportLooksLikePersonNameChunk(tailOnly)) compactTeacher = tailOnly;
    }
    if (
      maybeHead &&
      compactTeacher &&
      pdfImportLooksLikePersonNameChunk(compactTeacher) &&
      !pdfImportLooksLikeNoiseSubject(maybeHead)
    ) {
      return {
        head: maybeHead,
        teacher: compactTeacher,
      };
    }
  }

  return {
    head: source,
    teacher: ""
  };
}

/** @description Splits head text into a short code and subject name based on leading code tokens. */
function pdfImportSplitCodeAndSubject(headText) {
  const rawTokens = String(headText || "")
    .split(/\s+/)
    .map((t) => t.replace(/^[^A-Za-z0-9&]+|[^A-Za-z0-9&]+$/g, ""))
    .filter(Boolean);
  if (!rawTokens.length) return null;
  // OCR continuation lines (e.g. "Object Oriented ...") should not be treated as short codes.
  // For import, accept short-start only when the first token is uppercase-like.
  if (/[a-z]/.test(rawTokens[0] || "")) return null;

  const first = pdfImportNormalizeShort(rawTokens[0]);
  if (!pdfImportIsLikelyCodeToken(first)) return null;

  const codeTokens = [first];
  let idx = 1;
  while (idx < rawTokens.length && codeTokens.length < 4) {
    const cur = pdfImportNormalizeShort(rawTokens[idx]);
    const next = pdfImportNormalizeShort(rawTokens[idx + 1] || "");
    if (cur === "LAB") {
      codeTokens.push(cur);
      idx++;
      continue;
    }
    if (cur && cur.length <= 4 && next === "LAB") {
      codeTokens.push(cur);
      idx++;
      continue;
    }
    break;
  }

  let subject = rawTokens.slice(idx).join(" ").trim();
  subject = subject
    .replace(/^(?:\d{1,2}\s+){1,3}/, "")
    .replace(/^(?:L|T|P|TH|PR)\s+/i, "")
    .trim();
  if (!subject) return null;

  return {
    short: pdfImportNormalizeShort(codeTokens.join(" ")),
    subject: pdfImportNormalizeLine(subject),
  };
}

/** @description Parses a subject line into short code, subject name, and teacher. */
function pdfImportParseSubjectLine(line) {
  const cleaned = pdfImportPreprocessLine(line, {
    convertWideGaps: true,
  });
  if (!cleaned || pdfImportShouldSkipLine(cleaned)) return null;

  if (/\s-\s/.test(cleaned)) {
    const parts = cleaned.split(/\s*-\s*/).map((p) => p.trim());
    if (parts.length >= 2) {
      const short = pdfImportNormalizeShort(parts[0]);
      const subject = pdfImportNormalizeLine(parts[1]);
      const teacher = pdfImportNormalizeLine(parts.slice(2).join(" - "));
      if (short && subject) {
        return {
          short,
          subject,
          teacher: teacher || "Not Mentioned",
        };
      }
    }
  }

  const {
    head,
    teacher
  } = pdfImportExtractTeacherAndHead(cleaned);
  const split = pdfImportSplitCodeAndSubject(head);
  if (!split) return null;

  return {
    short: split.short,
    subject: split.subject,
    teacher: teacher || "Not Mentioned",
  };
}

// Section: TEACHER NAME DETECTION

function pdfImportIsBlockedShort(shortText) {
  const short = pdfImportNormalizeShort(shortText);
  if (!short) return true;
  const head = short.split(/\s+/)[0] || short;
  if (PDF_IMPORT_SHORT_BLOCKLIST.has(head)) return true;
  if (PDF_IMPORT_DAY_CODE_SET.has(head)) return true;
  return false;
}

/** @description Validates that a short code meets strict formatting rules (length, casing, no artifacts). */
function pdfImportIsStrictShort(shortText) {
  const short = pdfImportNormalizeShort(shortText);
  if (!short || pdfImportIsBlockedShort(short)) return false;

  const tokens = short.split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 3) return false;
  if (
    tokens.some(
      (tok) => tok.length < 2 || tok.length > 12 || !/^[A-Z0-9&]+$/.test(tok)
    )
  ) {
    return false;
  }
  if (tokens.some((tok) => /^\d+$/.test(tok))) return false;
  if (tokens.length === 1 && tokens[0] === "LAB") return false;
  if (tokens.length > 1 && PDF_IMPORT_ROMAN_TOKEN_SET.has(tokens[0])) return false;
  if (tokens.length >= 2 && new Set(tokens).size === 1) return false;

  const labIndex = tokens.indexOf("LAB");
  if (labIndex >= 0 && labIndex !== tokens.length - 1) return false;
  if (tokens.length > 1 && tokens[tokens.length - 1] !== "LAB") return false;

  // OCR noise guard: very long single-token "shorts" are usually misreads.
  if (
    tokens.length === 1 &&
    tokens[0].length > 6 &&
    !PDF_IMPORT_LONG_SHORT_ALLOWLIST.has(tokens[0])
  ) {
    return false;
  }
  if (tokens.some((tok) => PDF_IMPORT_OCR_ARTIFACT_TOKEN_SET.has(tok))) {
    return false;
  }

  return true;
}

/** @description Heuristically checks whether text looks like a person's name (2–4 capitalized words). */
function pdfImportLooksLikePersonNameChunk(text) {
  const cleaned = pdfImportNormalizeLine(text)
    .replace(
      /\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\b\.?/gi,
      ""
    )
    .replace(/[^A-Za-z.'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /\d/.test(cleaned)) return false;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  // OCR subjects like "E Commerce" should not be treated as person names.
  if (words.some((w) => w.length === 1)) return false;

  // Keep this subject-word guard aligned with:
  // - src/js/core/parser.js (looksLikePersonNameChunk)
  // - parse_pdf.py (subject/teacher noise filters)
  const subjectWordSet = new Set([
    "analysis",
    "and",
    "aptitude",
    "architecture",
    "aws",
    "cloud",
    "communication",
    "computer",
    "constitution",
    "culture",
    "cyber",
    "data",
    "database",
    "design",
    "discrete",
    "electronics",
    "engineering",
    "foundation",
    "graphics",
    "implementation",
    "indian",
    "information",
    "java",
    "knowledge",
    "lab",
    "learning",
    "management",
    "math",
    "mathematics",
    "major",
    "machine",
    "multimedia",
    "network",
    "operating",
    "optimization",
    "practitioner",
    "presentation",
    "programming",
    "project",
    "python",
    "reasoning",
    "science",
    "security",
    "seminar",
    "skill",
    "skills",
    "software",
    "startup",
    "structure",
    "system",
    "technical",
    "technology",
    "tradition",
    "using",
    "web",
    "with",
  ]);

  for (const rawWord of words) {
    const word = rawWord.replace(/[^A-Za-z.'\-]/g, "");
    if (!word) return false;
    const lower = word.toLowerCase();
    if (subjectWordSet.has(lower)) return false;
    if (!/^[A-Z][a-z.'\-]*$/.test(word)) return false;
  }

  return true;
}

/** @description Checks if text looks like a comma/slash-separated list of teacher names. */
function pdfImportLooksLikeTeacherNameList(text) {
  const t = pdfImportNormalizeLine(text);
  if (!t) return false;
  // Intentionally explicit keyword list to block subject phrases from being
  // misclassified as faculty names during OCR-heavy PDF imports.
  if (
    /\b(?:lab|project|seminar|startup|aptitude|reasoning|soft\s*skill|math|system|security|technology|programming|electronics|design|analysis|management|communication|constitution|culture|engineering|graphics|multimedia|database|network|python|java|aws)\b/i.test(
      t
    )
  ) {
    return false;
  }

  if (
    /\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\b/i.test(
      t
    )
  ) {
    return true;
  }

  const parts = t
    .split(/\s*(?:\/|,|;|\band\b)\s*/i)
    .map((p) => pdfImportNormalizeLine(p))
    .filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => pdfImportLooksLikePersonNameChunk(part));
}

/** @description Builds a short code from the initials of subject words (excluding stop words). */
function pdfImportBuildShortFromInitials(subjectText) {
  const words = pdfImportNormalizeLine(subjectText)
    .split(/[\s/&,+-]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => /[A-Za-z]/.test(w));
  if (!words.length) return "";

  const stopWords = new Set([
    "AND",
    "OF",
    "THE",
    "WITH",
    "FOR",
    "TO",
    "IN",
    "ON",
    "BASED",
    "USING",
    "PROJECT",
    "PRESENTATION",
    "SEMINAR",
    "ACTIVITY",
    "ASSESSMENT",
    "MAJOR",
  ]);
  const letters = words
    .map((w) => w.toUpperCase())
    .filter((w) => !stopWords.has(w))
    .map((w) => w[0])
    .filter(Boolean);
  if (letters.length < 2) return "";

  const short = letters.slice(0, 6).join("");
  return pdfImportIsStrictShort(short) ? short : "";
}

/** @description Derives a short code from subject text using tail tokens, keyword mapping, or initials. */
function pdfImportDeriveShortFromSubject(subjectText) {
  const subject = pdfImportCleanSubject(subjectText);
  if (!subject || !pdfImportIsStrictSubject(subject)) return "";
  if (/\bpractical\s+based\s+on\s+subject\b/i.test(subject)) return "";
  if (/\bsubject\s+code\b/i.test(subject)) return "";
  if (pdfImportLooksLikeTeacherNameList(subject)) return "";
  if (/\b(?:mr|ms|mrs|dr|prof)\b\.?/i.test(subject)) return "";

  const tailTokenMatch = subject.match(/\b([A-Za-z]{2,4})$/);
  if (tailTokenMatch) {
    const tailTokenRaw = tailTokenMatch[1];
    const tailToken = tailTokenRaw.toUpperCase();
    if (/[A-Z]/.test(tailToken) && (tailTokenRaw === tailTokenRaw.toUpperCase() || tailToken.length <= 2)) {
      const core = pdfImportNormalizeLine(
        subject.slice(0, Math.max(0, subject.length - tailTokenRaw.length))
      );
      const coreWords = core
        .split(/[\s/&,+-]+/)
        .map((w) => w.trim())
        .filter(Boolean)
        .filter((w) => /[A-Za-z]/.test(w));
      const initials = coreWords
        .map((w) => w[0] || "")
        .join("")
        .toUpperCase();
      if (
        coreWords.length >= 2 &&
        initials &&
        (initials === tailToken ||
          initials.startsWith(tailToken) ||
          tailToken.startsWith(initials))
      ) {
        const normalizedTail = pdfImportNormalizeShort(tailToken);
        if (pdfImportIsStrictShort(normalizedTail)) return normalizedTail;
      }
    }
  }

  // Handle subject-only rows where short code is absent in PDF cells.
  const keywordMap = [
    [/\bseminar\b/i, "SEMINAR"],
    [/major\s+project/i, "PROJECT"],
    [/\bstartup\b.*\b(?:entrep|enterp)/i, "SEA"],
    [/\bsoft\s*skill\b/i, "SS"],
    [/\baptitude\b.*\breasoning\b/i, "AR"],
  ];
  for (const [re, short] of keywordMap) {
    if (re.test(subject)) {
      return pdfImportIsStrictShort(short) ? short : "";
    }
  }

  const compact = pdfImportNormalizeShort(subject);
  if (pdfImportIsStrictShort(compact)) return compact;
  return pdfImportBuildShortFromInitials(subject);
}

// Section: SUBJECT/TEACHER CLEANING

/** @description Checks if subject text is noise (OCR artifacts, headers, day names, time ranges, etc.). */
function pdfImportLooksLikeNoiseSubject(text) {
  const t = pdfImportNormalizeLine(text);
  if (!t) return true;
  if (pdfImportLooksLikePersonNameChunk(t)) return true;
  if (
    /^(?:(?:dye|ode|ame|bye|p|q|n|an)|\d{1,2})(?:\s+(?:(?:dye|ode|ame|bye|p|q|n|an)|\d{1,2}))*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (pdfImportLooksLikeTeacherNameList(t)) return true;
  if (/\broom\s*no\.?\b/i.test(t)) return true;
  if (/^\s*room\s*[-:]/i.test(t)) return true;
  if (/^\s*day\s*[-:]/i.test(t)) return true;
  if (/\bday\b/i.test(t)) return true;
  if (/\bday\b/i.test(t) && /\b(?:mon|tue|wed|thu|fri|sat|sun|\d{1,2})\b/i.test(t))
    return true;
  if (/^\s*(?:mon|tue|wed|thu|fri|sat|sun)\s*[-:]/i.test(t)) return true;
  if (/\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/.test(t)) return true;
  if (/\beven\s+semester\b/i.test(t)) return true;
  if (/\b(?:sem(?:ester)?|year)\b/i.test(t) && /\bsection\b/i.test(t))
    return true;
  if (/\btime table\b/i.test(t)) return true;
  if (/\bcoordinator\b/i.test(t)) return true;
  if (/\broom\s*no\b/i.test(t)) return true;
  if (/\bsubject\s*code\b/i.test(t)) return true;
  if (/\bpractical\s+based\s+on\s+subject\b/i.test(t)) return true;
  if (/\bpractical\s+based\s+on\s+subject\s+code\b/i.test(t)) return true;
  if (/\bname\s+of\s+subject\s+teacher\b/i.test(t)) return true;
  if (/\bl\s*t\s*p\b/i.test(t)) return true;
  if (/^\d+(?:\s+\d+){2,}$/.test(t)) return true;
  if (/[|]{2,}/.test(t)) return true;
  if (/^(?:[A-Z]{2,8}\s+){5,}[A-Z]{2,8}$/.test(t)) return true;
  const artifactCount = t
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, "").toUpperCase())
    .filter((w) => PDF_IMPORT_OCR_ARTIFACT_TOKEN_SET.has(w)).length;
  if (artifactCount >= 2) return true;
  return false;
}

/** @description Validates that teacher text is plausible (not a header, day name, or noise). */
function pdfImportIsStrictTeacher(teacherText) {
  const t = pdfImportNormalizeLine(teacherText);
  if (!t) return false;
  if (/^not\s*mentioned$/i.test(t)) return true;
  if (/^\bcommon\s+lecture\b/i.test(t)) return true;
  if (/^\bcommon\s+lecture\s+with\b/i.test(t)) return true;
  if (/\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/.test(t)) return false;
  if (/^(?:room|day|time|section|lunch)\b/i.test(t)) return false;
  if (/^(?:mon|tue|wed|thu|fri|sat|sun)\b/i.test(t)) return false;
  if (/^[A-Z]$/i.test(t)) return false;
  if (/^(?:mr|ms|mrs|dr|prof)\.?$/i.test(t)) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (t.split(/\s+/).length > 8) return false;
  if (pdfImportLooksLikeTeacherNameList(t)) return true;
  if (/(.)\1{3,}/i.test(t)) return false;
  if (/\b(?:sem(?:ester)?|year|section|coordinator|room)\b/i.test(t)) return false;
  return true;
}

/** @description Validates that subject text is well-formed (not noise, not a teacher list, reasonable length). */
function pdfImportIsStrictSubject(subjectText) {
  const subject = pdfImportNormalizeLine(subjectText);
  if (!subject) return false;
  if (pdfImportLooksLikeTeacherNameList(subject)) return false;
  if (!/[A-Za-z]/.test(subject)) return false;
  if (/[@#~`]/.test(subject)) return false;
  if (subject.length < 3 || subject.length > 160) return false;
  if (pdfImportLooksLikeNoiseSubject(subject)) return false;
  if (/\bpractical\s+based\s+on\s+subject\s+code\b/i.test(subject)) return false;
  if (/^(?:room|day|time|section|lunch)\b/i.test(subject)) return false;
  if (/^(?:mon|tue|wed|thu|fri|sat|sun)\b/i.test(subject)) return false;

  const words = subject
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  if (!words.length) return false;
  if (words.every((w) => w.length <= 2)) return false;
  const oneLetterWords = words.filter((w) => w.length === 1).length;
  if (oneLetterWords >= 2 && words.length <= 4) return false;

  const artifactWords = words.filter((w) =>
    PDF_IMPORT_OCR_ARTIFACT_TOKEN_SET.has(w.toUpperCase())
  ).length;
  if (artifactWords > 0 && artifactWords / words.length >= 0.34) return false;

  const longWords = words.filter((w) => w.length >= 3);
  if (longWords.length) {
    const vowelPoor = longWords.filter((w) => !/[aeiou]/i.test(w)).length;
    if (vowelPoor / longWords.length >= 0.75) return false;
  }

  return true;
}

/** @description Cleans a subject string: removes LTP/credit noise, OCR artifacts, and trailing residue. */
function pdfImportCleanSubject(subjectText) {
  let out = pdfImportNormalizeLine(subjectText);
  if (!out) return "";
  out = out
    .replace(/_+/g, " ")
    .replace(/^(?:\d+\s+){1,4}(?=[A-Za-z])/i, "")
    .replace(/\b\d{1,2}\s+\d{1,2}\s+\d{1,2}\b/g, " ")
    .replace(/\b\d{1,3}\b(?=\s+[A-Za-z])/g, " ")
    .replace(/\b0\b/g, " ")
    .replace(/^(?:L|T|P|TH|PR)(?:\s*[:\-]\s*|\s+)/i, "")
    .replace(/^[\-:|]+\s*/, "")
    .replace(/\b\d{1,2}[A-Z]?\s+LAB\b/gi, "LAB")
    .replace(/\bLAB\s*[- ]?\d{1,2}[A-Z]?\b/gi, "LAB")
    .replace(
      /\bLTP\b\s*[:\-]?\s*\d{1,2}\s*[-/ ]\s*\d{1,2}\s*[-/ ]\s*\d{1,2}\b/gi,
      " "
    )
    .replace(/\b\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}\b/g, " ")
    .replace(/\bL\s*\d{1,2}\s*T\s*\d{1,2}\s*P\s*\d{1,2}\b/gi, " ")
    .replace(/\s+[A-Z]{2,6}(?:\s*-\s*[A-Z]{2,6}){1,3}\s*$/g, " ")
    .replace(/\s*-\s*[IVX]{1,4}\s*$/i, "")
    .replace(/(?<=\w)-(?=\w)/g, " ")
    .replace(/\s*\(\s*lab[^)]*\)\s*$/i, "")
    .replace(/\s*\(\s*room[^)]*\)\s*$/i, "")
    .replace(/\bpractical\s+based\s+on\s+subject\s+code\b/gi, " ")
    .replace(/\bsubject\s+code\s*-?\s*\d{1,3}\b/gi, " ")
    .replace(/\b(?:dye|ode|ame|bye)\b/gi, " ")
    .replace(/\b(?:dye|ode|ame|bye)\b(?:\s+\b(?:dye|ode|ame|bye)\b)+/gi, " ")
    .replace(/^\s*ython\b/i, "Python")
    .replace(/^\s*echnical\b/i, "Technical")
    .replace(/^\s*ractical\b/i, "Practical")
    .replace(/^\s*ptitude\b/i, "Aptitude")
    .replace(/\bAWS\s+AWS\b/gi, "AWS")
    .trim();
  const anchor = out.match(
    /\b(?:computer|operating|software|optimization|mathematics?|data|database|information|knowledge|project|presentation|seminar|machine|startup|aptitude|reasoning|soft|web|java|python|digital|cyber|network|cloud|indian|tradition|culture|design|graphics|electronics|security|oops)\b/i
  );
  if (anchor && anchor.index > 0 && anchor.index <= 24) {
    out = out.slice(anchor.index).trim();
  }
  const parts = out.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2] || "";
    if (
      /^[A-Za-z]{1,3}$/.test(last) &&
      !/^(?:lab|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(last) &&
      /^[A-Za-z]{4,}$/.test(prev)
    ) {
      parts.pop();
      out = parts.join(" ");
    }
  }
  out = out.replace(/^([A-Z])\s+([A-Za-z]{4,})$/i, "$1-$2");
  return pdfImportNormalizeLine(out);
}

/** @description Removes short-code echoes and credit noise from subject text relative to its short code. */
function pdfImportNormalizeSubjectForShort(shortInput, subjectInput) {
  const short = pdfImportNormalizeShort(shortInput || "");
  const shortBase = short.replace(/\s+LAB\b/i, "").trim();
  let subject = pdfImportCleanSubject(subjectInput || "");
  if (!shortBase || !subject) return subject;

  const shortRe = pdfImportEscapeRegExp(shortBase);
  subject = subject
    // Remove explicit credit-noise around short code (e.g. "AWS 0 AWS").
    .replace(new RegExp(`\\b${shortRe}\\s+0+\\s+${shortRe}\\b`, "ig"), shortBase)
    .replace(new RegExp(`^${shortRe}\\s+0+\\s+`, "i"), "")
    .replace(new RegExp(`\\s+0+\\s+${shortRe}$`, "i"), "")
    .replace(new RegExp(`^${shortRe}(?:\\s+\\d{1,3})+\\s+`, "i"), "")
    .replace(new RegExp(`^${shortRe}\\s+${shortRe}\\s+`, "i"), "")
    .trim();

  // Keep known long subject names readable (e.g. "SS Soft Skill", "AR Aptitude ...").
  if (shortBase === "SS") {
    subject = subject.replace(/^SS(?:\s+\d{1,3})*\s+(?=Soft\s*Skill\b)/i, "");
  } else if (shortBase === "AR") {
    subject = subject.replace(/^AR(?:\s+\d{1,3})*\s+(?=Aptitude\b)/i, "");
  }

  // Remove trailing table-column residue like:
  // "SoftSkill | SS" -> "SoftSkill"
  subject = subject
    .replace(new RegExp(`\\s*\\|\\s*${shortRe}\\s*$`, "i"), "")
    .trim();

  // Tight cleanup for known short fillers where OCR often appends short again:
  // "SoftSkill SS" / "Aptitude & Reasoning AR"
  if (shortBase === "SS" || shortBase === "AR") {
    subject = subject
      .replace(new RegExp(`\\s+${shortRe}\\s*$`, "i"), "")
      .trim();
  }
  if (shortBase.length <= 4 && !/\bLAB\b/i.test(shortBase)) {
    subject = subject
      .replace(new RegExp(`\\s+${shortRe}\\s*$`, "i"), "")
      .trim();
    subject = subject
      .replace(
        new RegExp(
          `\\s+${shortRe}\\s+[A-Z][A-Za-z.'\\-]+\\s+[A-Z][A-Za-z.'\\-]+$`,
          "i"
        ),
        ""
      )
      .trim();
  }

  return pdfImportNormalizeLine(subject);
}

/** @description Cleans teacher text: extracts honorific-prefixed names, strips room/lab annotations. */
function pdfImportCleanTeacher(teacherText) {
  let t = pdfImportNormalizeLine(teacherText);
  if (!t) return "Not Mentioned";
  t = t
    .replace(/\(\s*lab[^)]*\)/gi, "")
    .replace(/\(\s*roll[^)]*\)/gi, "")
    .replace(/\(\s*room[^)]*\)/gi, "")
    .replace(/\(\s*lab.*$/i, "")
    .replace(/\(\s*room.*$/i, "")
    .replace(
      /\s*\(\s*(?:roll|room|lab|block|floor|[A-Za-z ]*\d+[A-Za-z ]*)[^)]*\)\s*$/i,
      ""
    )
    .replace(/\broom\s*no\.?\s*[A-Za-z0-9\-\/ ]*$/i, "")
    .replace(/\broom\s+[A-Za-z0-9\-\/ ]*$/i, "")
    .replace(
      /^[A-Za-z]{2,3}\s+(?=[A-Z][A-Za-z.'\-]+\s+[A-Z][A-Za-z.'\-]+$)/,
      ""
    )
    .trim();
  // Preserve generic allocation text (e.g. "COMMON LECTURE WITH BTECH IT")
  // instead of forcing it to "Not Mentioned".
  if (/^(?:room|day|time|section)\b/i.test(t)) return "Not Mentioned";
  if (/^not\s*mentioned$/i.test(t)) return "Not Mentioned";

  const names = [];
  const seen = new Set();
  const nameRe =
    /\b(?:Prof\.\(Dr\.\)|Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Miss\.?)\s+[A-Za-z][A-Za-z().'\-]*(?:\s+[A-Za-z][A-Za-z().'\-]*){0,5}/gi;
  let m;
  while ((m = nameRe.exec(t)) !== null) {
    const name = pdfImportNormalizeLine(m[0]).replace(/[;|]+$/g, "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  if (names.length) return names.join(", ");
  if (!pdfImportIsStrictTeacher(t)) return "Not Mentioned";
  return t.replace(/[;|]+$/g, "").trim();
}

/** @description Repairs OCR-truncated subject prefixes (e.g. "ython" → "Python") using short code hints. */
function pdfImportRepairSubjectPrefix(shortText, subjectText) {
  const short = pdfImportNormalizeShort(shortText);
  let subject = pdfImportCleanSubject(subjectText);
  if (!subject) return "";

  const baseCode = (short.split(/\s+/).find((tok) => tok !== "LAB") || "").trim(); // primary code token (excluding LAB suffix)
  const baseLead = baseCode ? baseCode[0] : "";

  const directFixes = [
    [/^ython\b/i, "P"],
    [/^echnical\b/i, "T"],
    [/^ractical\b/i, "P"],
    [/^ptitude\b/i, "A"],
  ];
  for (const [re, prefix] of directFixes) {
    if (re.test(subject)) {
      return pdfImportNormalizeLine(`${prefix}${subject}`);
    }
  }

  if (/^[a-z]/.test(subject)) {
    if (baseLead && !subject.toUpperCase().startsWith(baseLead)) {
      return pdfImportNormalizeLine(`${baseLead}${subject}`);
    }
    return subject[0].toUpperCase() + subject.slice(1);
  }
  return subject;
}

// Section: LINE SPLITTING AND ENTRY FINALIZATION

/** @description Splits a line into segments at each subject-code boundary (e.g. "CS101 ... EE201 ..."). */
function pdfImportSplitLineBySubjectCode(line) {
  const text = pdfImportNormalizeLine(line);
  if (!text) return [];

  const codeRe = /(VAC|[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*)\b/gi;
  const starts = [];
  let m;
  while ((m = codeRe.exec(text)) !== null) {
    starts.push(m.index);
  }
  if (!starts.length) return [text];
  if (starts.length === 1 && starts[0] === 0) return [text];

  const parts = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = starts[i + 1] ?? text.length;
    const segment = pdfImportNormalizeLine(text.slice(start, end));
    if (segment) parts.push(segment);
  }
  return parts.length ? parts : [text];
}

/** @description Splits a line into tabular columns using wide gaps, pipes, or collapsed-column patterns. */
function pdfImportSplitTabularColumns(line) {
  const raw = String(line || "");
  if (!raw) return [];

  // OCR/text-layer rows often keep visual columns as 2+ spaces or tabs.
  const wideGapCols = raw
    .split(/\t+| {2,}/)
    .map((c) => pdfImportNormalizeLine(c))
    .filter(Boolean);
  if (wideGapCols.length >= 2) return wideGapCols;

  const prepared = pdfImportPreprocessLine(raw, {
    convertWideGaps: true,
  });
  if (prepared.includes("|")) {
    return prepared
      .split("|")
      .map((c) => pdfImportNormalizeLine(c))
      .filter(Boolean);
  }

  // Pattern fallback for OCR rows where columns collapse into single-space text:
  // "... <SUBJECT> <SHORT> <TEACHER>"
  const collapsedPattern = prepared.match(
    /^(.*?)\s+([A-Z][A-Z0-9&]{1,11}(?:\s+LAB)?)\s+((?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Prof(?:essor)?\.?|Not\s*Mentioned).*)$/i
  );
  if (collapsedPattern) {
    return [collapsedPattern[1], collapsedPattern[2], collapsedPattern[3]]
      .map((c) => pdfImportNormalizeLine(c))
      .filter(Boolean);
  }

  const normalized = pdfImportNormalizeLine(raw);
  return normalized ? [normalized] : [];
}

/** @description Splits merged dash-separated entries (e.g. "CS - Subject1 EE - Subject2") into chunks. */
function pdfImportSplitMergedDashEntries(text) {
  const line = pdfImportNormalizeLine(text);
  if (!line) return [];

  const starts = [];
  const shortDashRe =
    /\b([A-Z][A-Z0-9&]{1,11}(?:\s+[A-Z][A-Z0-9&]{1,11}){0,1}(?:\s+LAB)?)\s*-\s*/g;
  let m;
  while ((m = shortDashRe.exec(line)) !== null) {
    const short = pdfImportNormalizeShort(m[1]);
    if (!pdfImportIsStrictShort(short)) continue;
    starts.push(m.index);
  }

  if (!starts.length) return [];
  if (starts.length === 1 && starts[0] === 0) return [line];

  const chunks = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = starts[i + 1] ?? line.length;
    const chunk = pdfImportNormalizeLine(line.slice(start, end)).replace(
      /\s*[-|]+\s*$/,
      ""
    );
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/** @description Finalizes a timetable entry by cleaning, validating, and normalizing short/subject/teacher/LTP. */
function pdfImportFinalizeEntry(shortInput, subjectInput, teacherInput, ltpInput) {
  let short = pdfImportNormalizeShort(shortInput || "");
  let subject = pdfImportRepairSubjectPrefix(short, subjectInput || "");
  subject = pdfImportNormalizeSubjectForShort(short, subject);
  let teacher = pdfImportCleanTeacher(teacherInput || "");
  const ltp = pdfImportNormalizeLtpTriplet(ltpInput || "");

  if (!short || !subject) return null;
  if (!pdfImportIsStrictShort(short)) return null;
  if (!pdfImportIsStrictSubject(subject)) return null;
  if (/\bLAB\b/i.test(short) && !/\bLAB\b/i.test(subject)) return null;
  if (
    !/\bLAB\b/i.test(short) &&
    /^[A-Z]{4,12}$/.test(subject) &&
    subject.toUpperCase() !== short.replace(/\s+/g, "")
  ) {
    return null;
  }

  // Normalize Lab short code for strict import format.
  if (/(?:\bLAB\b|LAB$)/i.test(subject) && !/(?:\bLAB\b|LAB$)/i.test(short)) {
    short = `${short} LAB`.trim();
  }

  return {
    short,
    subject,
    teacher: teacher || "Not Mentioned",
    ltp,
  };
}

/** @description Extracts a short code from the tail of text (e.g. "Data Structures DS" → {short, subject}). */
function pdfImportExtractShortFromTail(coreText) {
  const t = pdfImportNormalizeLine(coreText);
  if (!t) return null;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const maxTake = Math.min(3, tokens.length - 1);
  for (let take = maxTake; take >= 1; take--) {
    const rawShortTokens = tokens
      .slice(tokens.length - take)
      .map((tok) =>
        String(tok).replace(/^[^A-Za-z0-9&]+|[^A-Za-z0-9&]+$/g, "")
      )
      .filter(Boolean);
    if (!rawShortTokens.length || rawShortTokens.length !== take) continue;
    const hasLongMixedCaseTail = rawShortTokens.some(
      (tok) => /[a-z]/.test(tok) && tok.length > 2
    );
    if (hasLongMixedCaseTail) continue;
    const normalizedTokens = rawShortTokens.map((tok) =>
      pdfImportNormalizeShort(tok)
    );
    if (
      !normalizedTokens.every(
        (tok) => tok && /^[A-Z0-9&]{2,12}$/.test(tok.replace(/\s+/g, ""))
      )
    )
      continue;

    const short = pdfImportNormalizeShort(normalizedTokens.join(" "));
    if (!pdfImportIsStrictShort(short)) continue;

    const subject = pdfImportNormalizeLine(
      tokens.slice(0, tokens.length - take).join(" ")
    );
    if (!subject || pdfImportLooksLikeNoiseSubject(subject)) continue;

    return {
      short,
      subject,
    };
  }

  return null;
}
