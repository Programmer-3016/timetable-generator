"""Optional OCR probe for weak-text PDFs (v1 only)."""

from __future__ import annotations

import re
import string
from typing import Any

from .extract import normalize_line

try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None

try:
    from pdf2image import convert_from_bytes, pdfinfo_from_bytes
except Exception:  # pragma: no cover
    convert_from_bytes = None
    pdfinfo_from_bytes = None


def _normalize_common_ocr_mistakes(text: str) -> str:
    """
    Normalize frequent OCR mistakes that affect timetable parsing.
    Keep this conservative to avoid changing valid tokens.
    """
    out = str(text or "")
    out = re.sub(r"\b00PS\b", "OOPS", out, flags=re.I)
    out = re.sub(r"\b1C\b", "IC", out, flags=re.I)
    return out


def _clean_ocr_line(line: str) -> str:
    fixed = _normalize_common_ocr_mistakes(line)
    return normalize_line(re.sub(r"[^\x20-\x7E]", " ", fixed))


def extract_text_with_ocr(
    pdf_bytes: bytes,
    *,
    max_pages: int = 24,
    dpi: int = 220,
    chunk_size: int = 4,
) -> dict[str, Any]:
    """
    OCR text extraction fallback for scanned/image PDFs.
    - Processes pages in small chunks to keep memory usage bounded.
    - Returns both combined text and line-wise page payload for downstream parsers.
    """
    if pytesseract is None or convert_from_bytes is None:
        raise RuntimeError("OCR dependencies are not installed (pytesseract/pdf2image).")

    safe_max_pages = max(1, int(max_pages))
    safe_chunk_size = max(1, int(chunk_size))
    page_limit = safe_max_pages

    # Best-effort page count detection so OCR work stays bounded on large PDFs.
    if pdfinfo_from_bytes is not None:
        try:
            info = pdfinfo_from_bytes(pdf_bytes)
            total_pages = int(info.get("Pages", 0) or 0)
            if total_pages > 0:
                page_limit = min(total_pages, safe_max_pages)
        except Exception:
            pass

    lines_by_page: list[list[str]] = []
    combined_parts: list[str] = []

    for first_page in range(1, page_limit + 1, safe_chunk_size):
        last_page = min(page_limit, first_page + safe_chunk_size - 1)
        images = convert_from_bytes(
            pdf_bytes,
            dpi=dpi,
            first_page=first_page,
            last_page=last_page,
            thread_count=1,
            grayscale=True,
        )
        try:
            for img in images:
                text = pytesseract.image_to_string(img, lang="eng") or ""
                raw_lines = text.splitlines()
                lines = [_clean_ocr_line(ln) for ln in raw_lines]
                lines = [ln for ln in lines if ln]
                lines_by_page.append(lines)
                if lines:
                    combined_parts.append("\n".join(lines))
        finally:
            for img in images:
                try:
                    img.close()
                except Exception:
                    pass

    all_lines = [ln for page_lines in lines_by_page for ln in page_lines]
    combined_text = "\n".join(combined_parts).strip()
    printable_chars = sum(ch in string.printable for ch in combined_text)

    return {
        "lines_by_page": lines_by_page,
        "text": combined_text,
        "all_lines": all_lines,
        "non_empty_lines": len(all_lines),
        "printable_chars": printable_chars,
        "pages_processed": len(lines_by_page),
    }


def run_ocr_probe(pdf_bytes: bytes, pages: tuple[int, int] = (1, 2), dpi: int = 220) -> dict[str, Any]:
    """Run OCR on first pages only; do not OCR entire document in v1."""
    first_page, last_page = pages
    if first_page <= 1:
        return extract_text_with_ocr(
            pdf_bytes,
            max_pages=max(1, last_page),
            dpi=dpi,
            chunk_size=2,
        )

    if pytesseract is None or convert_from_bytes is None:
        raise RuntimeError("OCR dependencies are not installed (pytesseract/pdf2image).")

    images = convert_from_bytes(
        pdf_bytes,
        dpi=dpi,
        first_page=max(1, first_page),
        last_page=max(first_page, last_page),
        thread_count=1,
        grayscale=True,
    )

    lines_by_page: list[list[str]] = []
    try:
        for img in images:
            text = pytesseract.image_to_string(img, lang="eng") or ""
            raw_lines = text.splitlines()
            lines = [_clean_ocr_line(ln) for ln in raw_lines]
            lines = [ln for ln in lines if ln]
            lines_by_page.append(lines)
    finally:
        for img in images:
            try:
                img.close()
            except Exception:
                pass

    all_lines = [ln for page_lines in lines_by_page for ln in page_lines]
    combined_text = "\n".join("\n".join(page) for page in lines_by_page if page).strip()
    printable_chars = sum(ch in string.printable for ch in combined_text)

    return {
        "lines_by_page": lines_by_page,
        "text": combined_text,
        "all_lines": all_lines,
        "non_empty_lines": len(all_lines),
        "printable_chars": printable_chars,
    }
