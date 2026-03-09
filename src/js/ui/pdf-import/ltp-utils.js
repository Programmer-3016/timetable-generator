/* exported pdfImportExtractLtpFromLine */
/**
 * @module ui/pdf-import/ltp-utils.js
 * @description LTP extraction and normalization helpers for PDF import.
 */

function pdfImportNormalizeLtpTriplet(raw) {
  if (raw == null) return "";
  const text = pdfImportNormalizeLine(raw);
  if (!text) return "";

  // Compact OCR LTP forms: "420" => "4-2-0", "002" => "0-0-2".
  const compactTriple = text.match(/^(\d)(\d)(\d)$/);
  if (compactTriple) {
    const nums = compactTriple.slice(1).map((n) => parseInt(n, 10));
    if (nums.every((n) => Number.isFinite(n) && n >= 0 && n <= PDF_IMPORT_MAX_LTP_VALUE)) {
      return `${nums[0]}-${nums[1]}-${nums[2]}`;
    }
  }

  // Accept single-value LTP rows from PDFs where only Lecture is filled (e.g. "5").
  const single = text.match(/^(\d{1,2})$/);
  if (single) {
    const l = parseInt(single[1], 10);
    if (Number.isFinite(l) && l >= 0 && l <= PDF_IMPORT_MAX_LTP_VALUE) {
      return `${l}-0-0`;
    }
  }

  // Accept two-value compact LTP rows (e.g. "4 2" => "4-2-0").
  const pair = text.match(/^(\d{1,2})\s+(\d{1,2})$/);
  if (pair) {
    const nums = pair.slice(1).map((n) => parseInt(n, 10));
    if (nums.every((n) => Number.isFinite(n) && n >= 0 && n <= PDF_IMPORT_MAX_LTP_VALUE)) {
      return `${nums[0]}-${nums[1]}-0`;
    }
  }

  const fromDelimited = text.match(
    /^(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})$/
  );
  if (fromDelimited) {
    const nums = fromDelimited.slice(1).map((n) => parseInt(n, 10));
    if (nums.every((n) => Number.isFinite(n) && n >= 0 && n <= PDF_IMPORT_MAX_LTP_VALUE)) {
      return `${nums[0]}-${nums[1]}-${nums[2]}`;
    }
  }

  const triples = text.match(/^\d{1,2}\s+\d{1,2}\s+\d{1,2}$/);
  if (triples) {
    const nums = text.split(/\s+/).map((n) => parseInt(n, 10));
    if (nums.every((n) => Number.isFinite(n) && n >= 0 && n <= PDF_IMPORT_MAX_LTP_VALUE)) {
      return `${nums[0]}-${nums[1]}-${nums[2]}`;
    }
  }

  return "";
}

// Section: LTP EXTRACTION

/**
 * @description Extracts an LTP triplet from an array of table column strings.
 * @param {string[]} cols - Column strings from a table row.
 * @returns {string} Normalized LTP triplet or empty string.
 */
function pdfImportExtractLtpFromColumns(cols) {
  const cells = (cols || []) // Normalized non-empty column strings for LTP scanning
    .map((c) => pdfImportNormalizeLine(c))
    .filter(Boolean);
  if (!cells.length) return "";

  for (const cell of cells) {
    const cleaned = cell.replace(/\bLTP\b\s*[:\-]?\s*/i, "").trim();
    const ltp = pdfImportNormalizeLtpTriplet(cleaned);
    if (ltp) return ltp;
  }

  for (let i = 0; i <= cells.length - 3; i++) {
    const sample = `${cells[i]} ${cells[i + 1]} ${cells[i + 2]}`;
    const ltp = pdfImportNormalizeLtpTriplet(sample);
    if (ltp) return ltp;
  }

  return "";
}

/**
 * @description Extracts an LTP triplet from a single text line using multiple parsing strategies.
 * @param {string} line - Raw text line.
 * @returns {string} Normalized LTP triplet or empty string.
 */
function pdfImportExtractLtpFromLine(line) {
  const text = pdfImportNormalizeLine(line);
  if (!text) return "";

  if (text.includes("|")) {
    const cols = text
      .split("|")
      .map((c) => pdfImportNormalizeLine(c))
      .filter(Boolean);
    const fromCols = pdfImportExtractLtpFromColumns(cols);
    if (fromCols) return fromCols;
  }

  const tagged = text.match(
    /\bLTP\b\s*[:\-]?\s*(\d{1,2})\s*[-/ ]\s*(\d{1,2})\s*[-/ ]\s*(\d{1,2})\b/i
  );
  if (tagged) {
    return pdfImportNormalizeLtpTriplet(tagged.slice(1).join("-"));
  }

  const inlineDelimited = text.match(
    /\b(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})\b/
  );
  if (inlineDelimited) {
    const ltp = pdfImportNormalizeLtpTriplet(
      inlineDelimited.slice(1).join("-")
    );
    if (ltp) return ltp;
  }

  // Table rows often appear as: "IMC201 5 Subject Name ..."
  // Capture leading compact LTP tokens before the subject text.
  const leadingTriple = text.match(/^\s*(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})(?=\s+[A-Za-z])/);
  if (leadingTriple) {
    const ltp = pdfImportNormalizeLtpTriplet(leadingTriple.slice(1).join(" "));
    if (ltp) return ltp;
  }
  const leadingCompactTriple = text.match(/^\s*(\d{3})(?=\s+[A-Za-z])/);
  if (leadingCompactTriple) {
    const ltp = pdfImportNormalizeLtpTriplet(leadingCompactTriple[1]);
    if (ltp) return ltp;
  }
  const leadingCompactedPairPlusOne = text.match(
    /^\s*(\d{2})\s+(\d)(?=\s+[A-Za-z])/
  );
  if (leadingCompactedPairPlusOne) {
    const merged = `${leadingCompactedPairPlusOne[1]}${leadingCompactedPairPlusOne[2]}`;
    const ltp = pdfImportNormalizeLtpTriplet(merged);
    if (ltp) return ltp;
  }
  const leadingOnePlusCompactedPair = text.match(
    /^\s*(\d)\s+(\d{2})(?=\s+[A-Za-z])/
  );
  if (leadingOnePlusCompactedPair) {
    const merged = `${leadingOnePlusCompactedPair[1]}${leadingOnePlusCompactedPair[2]}`;
    const ltp = pdfImportNormalizeLtpTriplet(merged);
    if (ltp) return ltp;
  }
  const leadingPair = text.match(/^\s*(\d{1,2})\s+(\d{1,2})(?=\s+[A-Za-z])/);
  if (leadingPair) {
    const ltp = pdfImportNormalizeLtpTriplet(leadingPair.slice(1).join(" "));
    if (ltp) return ltp;
  }
  const leadingSingle = text.match(/^\s*(\d{1,2})(?=\s+[A-Za-z])/);
  if (leadingSingle) {
    const ltp = pdfImportNormalizeLtpTriplet(leadingSingle[1]);
    if (ltp) return ltp;
  }

  const trailing = text.match(
    /\b(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})(?=\s+(?:Mr\.?|Ms\.?|Mrs\.?|Miss\.?|Dr\.?|Prof(?:essor)?\.?|Not\b)|\s*$)/i
  );
  if (trailing) {
    const ltp = pdfImportNormalizeLtpTriplet(
      trailing.slice(1).join(" ")
    );
    if (ltp) return ltp;
  }

  const anyTriplet = text.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\b/);
  if (anyTriplet) {
    const ltp = pdfImportNormalizeLtpTriplet(anyTriplet.slice(1).join(" "));
    if (ltp) return ltp;
  }

  return "";
}

// Subsection: Subject Entry Construction
