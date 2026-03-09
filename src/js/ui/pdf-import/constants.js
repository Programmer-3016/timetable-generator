/**
 * @module ui/pdf-import/constants.js
 * @description Regex patterns and constants used across the PDF import pipeline
 *   for detecting titles, semesters, subject codes, and classification signals.
 */

// Section: PDF IMPORT CONSTANTS

// --- Title, semester, and section detection regexes
const PDF_IMPORT_TITLE_RE =
  /\b(?:BCA|MCA|MBA|B\.?\s*TECH|M\.?\s*TECH|BBA|BSC|B\.?\s*SC)\b/i;
const PDF_IMPORT_SEM_YEAR_RE = /\b(?:sem(?:ester)?|year)\b/i;
const PDF_IMPORT_SECTION_RE = /\bsection\b/i;
// --- Day name lists and code-to-name mapping
const PDF_IMPORT_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const PDF_IMPORT_DAY_CODE_SET = new Set([
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
]);
const PDF_IMPORT_DAY_CODE_TO_NAME = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};
// --- Tokens to reject as subject short-forms
const PDF_IMPORT_SHORT_BLOCKLIST = new Set([
  "ROOM",
  "DAY",
  "TIME",
  "LUNCH",
  "COORDINATOR",
  "MENTOR",
  "MENTORS",
  "SEMESTER",
  "EVEN",
  "ODD",
  "TOTAL",
  "SUBJECT",
  "CODE",
  "NAME",
  "FACULTY",
  "MR",
  "MS",
  "MRS",
  "DR",
  "PROF",
]);
// --- Roman numeral tokens and LTP/long-short allowlists
const PDF_IMPORT_ROMAN_TOKEN_SET = new Set([
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
]);
const PDF_IMPORT_MAX_LTP_VALUE = 12;
const PDF_IMPORT_LONG_SHORT_ALLOWLIST = new Set([
  "PROJECT",
  "SEMINAR",
]);
// --- Common OCR misread tokens to ignore
const PDF_IMPORT_OCR_ARTIFACT_TOKEN_SET = new Set([
  "DYE",
  "ODE",
  "AME",
  "BYE",
  "P",
  "Q",
  "N",
  "AN",
]);

const PDF_IMPORT_SUBJECT_HEADER_HINTS = [
  /\bsubject\s*code\b/i,
  /\bcourse\s*code\b/i,
  /\bsubject\s*name\b/i,
  /\bcourse\s*name\b/i,
  /\bshort\s*form\b/i,
  /\bname\s+of\s+subject\s+teacher\b/i,
  /\bsubject\s+teacher\b/i,
  /\bfaculty\s+name\b/i,
  /\bteacher\b/i,
  /\bl\s*t\s*p\b/i,
  /\bltp\b/i,
];

const PDF_IMPORT_CLASS_HEADER_HINT_RE =
  /\b(?:BCA|MCA|MBA|B\.?\s*TECH|M\.?\s*TECH|BBA|BSC|B\.?\s*SC)\b/i;
