"""PDF text/layout extraction helpers for classifier v1."""

from __future__ import annotations

import io
import re
import string
from typing import Any

from .settings import WEAK_TEXT_RULES

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover
    fitz = None

try:
    import pdfplumber
except Exception:  # pragma: no cover
    pdfplumber = None


def normalize_line(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _is_gibberish_line(line: str) -> bool:
    t = normalize_line(line)
    if not t or len(t) < 6:
        return False
    words = [re.sub(r"[^A-Za-z]", "", w) for w in t.split()]
    words = [w for w in words if len(w) >= 4]
    if len(words) < 2:
        return False

    weird = 0
    for w in words:
        vowels = len(re.findall(r"[aeiou]", w, flags=re.I))
        repeated = bool(re.search(r"(.)\1{3,}", w, flags=re.I))
        if vowels == 0 or repeated:
            weird += 1
    return weird / max(1, len(words)) >= 0.60


def _quality_label(is_weak: bool, gibberish_ratio: float) -> str:
    if is_weak:
        return "weak"
    if gibberish_ratio >= 0.18:
        return "medium"
    return "strong"


def _extract_with_pymupdf(pdf_bytes: bytes) -> dict[str, Any]:
    if fitz is None:
        raise RuntimeError("PyMuPDF (fitz) is not installed.")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    lines_by_page: list[list[str]] = []
    raw_lines_by_page: list[list[str]] = []

    try:
        for page in doc:
            raw_text = page.get_text("text") or ""
            raw_lines = [ln.rstrip() for ln in raw_text.splitlines() if ln.strip()]
            norm_lines = [normalize_line(ln) for ln in raw_lines if normalize_line(ln)]
            raw_lines_by_page.append(raw_lines)
            lines_by_page.append(norm_lines)
    finally:
        doc.close()

    return {
        "pages": len(lines_by_page),
        "lines_by_page": lines_by_page,
        "raw_lines_by_page": raw_lines_by_page,
    }


def _extract_table_row_count(pdf_bytes: bytes) -> int:
    if pdfplumber is None:
        return 0

    total_rows = 0
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                for row in table or []:
                    if not row:
                        continue
                    has_content = any(str(cell or "").strip() for cell in row)
                    if has_content:
                        total_rows += 1
    return total_rows


def extract_pdf_features(pdf_bytes: bytes) -> dict[str, Any]:
    """Extract text/layout features needed for classification signals."""
    extracted = _extract_with_pymupdf(pdf_bytes)

    lines_by_page = extracted["lines_by_page"]
    raw_lines_by_page = extracted["raw_lines_by_page"]
    all_lines = [ln for page_lines in lines_by_page for ln in page_lines]
    raw_all_lines = [ln for page_lines in raw_lines_by_page for ln in page_lines]

    printable_chars = sum(ch in string.printable for ch in "\n".join(raw_all_lines))
    non_empty_lines = len(all_lines)

    gibberish_hits = sum(1 for ln in all_lines if _is_gibberish_line(ln))
    gibberish_ratio = gibberish_hits / max(1, non_empty_lines)

    is_weak = (
        non_empty_lines < WEAK_TEXT_RULES["min_non_empty_lines"]
        or printable_chars < WEAK_TEXT_RULES["min_printable_chars"]
        or gibberish_ratio > WEAK_TEXT_RULES["max_gibberish_ratio"]
    )

    return {
        "pages": extracted["pages"],
        "lines_by_page": lines_by_page,
        "raw_lines_by_page": raw_lines_by_page,
        "all_lines": all_lines,
        "raw_all_lines": raw_all_lines,
        "non_empty_lines": non_empty_lines,
        "printable_chars": printable_chars,
        "gibberish_ratio": round(gibberish_ratio, 4),
        "text_quality": _quality_label(is_weak, gibberish_ratio),
        "is_weak": bool(is_weak),
        "table_rows_count": _extract_table_row_count(pdf_bytes),
    }
