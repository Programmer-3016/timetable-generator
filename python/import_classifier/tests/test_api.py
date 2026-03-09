"""Tests for the FastAPI /classify and /process endpoints."""
from __future__ import annotations

import tempfile

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from import_classifier import app as app_module


def _make_upload(filename: str, data: bytes, content_type: str) -> UploadFile:
    file_obj = tempfile.SpooledTemporaryFile(max_size=max(1024, len(data) + 1))
    file_obj.write(data)
    file_obj.seek(0)
    return UploadFile(
        filename=filename,
        file=file_obj,
        headers=Headers({"content-type": content_type}),
    )


@pytest.mark.anyio
async def test_api_rejects_non_pdf_extension():
    upload = _make_upload("notes.txt", b"not-a-pdf", "text/plain")
    try:
        with pytest.raises(HTTPException) as exc:
            await app_module.classify_pdf(upload)
        assert exc.value.status_code == 400
        assert "Only PDF files are allowed." in str(exc.value.detail)
    finally:
        await upload.close()


@pytest.mark.anyio
async def test_api_allow_path(monkeypatch):
    def fake_extract(_data):
        return {
            "pages": 1,
            "lines_by_page": [["MON", "9:05-9:55", "IMC201 5 JAVA Mr. X"]],
            "raw_lines_by_page": [["MON", "9:05-9:55", "IMC201 5 JAVA Mr. X"]],
            "all_lines": ["MON", "9:05-9:55", "IMC201 5 JAVA Mr. X"],
            "raw_all_lines": ["MON", "9:05-9:55", "IMC201 5 JAVA Mr. X"],
            "non_empty_lines": 40,
            "printable_chars": 800,
            "gibberish_ratio": 0.01,
            "text_quality": "strong",
            "is_weak": False,
            "table_rows_count": 30,
        }

    def fake_signals(_features):
        return {
            "day_pattern": {"score": 18, "raw_hits": 5, "unique_days": 5, "line_start_hits": 5},
            "time_range_pattern": {"score": 18, "raw_hits": 8, "max_ranges_in_line": 4, "pages_with_ranges": 1},
            "subject_row_shape": {"score": 24, "raw_hits": 8, "header_hits": 1},
            "keyword_coverage": {"score": 18, "categories_hit": ["timetable_context", "subject_table", "academic_structure"], "category_count": 3},
            "grid_density": {"score": 8, "structured_ratio": 0.2, "structured_hits": 20},
        }

    def fake_eval(_signals):
        return {
            "decision": "allow",
            "confidence": 86.0,
            "threshold": 78.0,
            "hard_fail": False,
            "reasons": [],
        }

    monkeypatch.setattr(app_module, "extract_pdf_features", fake_extract)
    monkeypatch.setattr(app_module, "detect_all_signals", fake_signals)
    monkeypatch.setattr(app_module, "evaluate_decision", fake_eval)

    upload = _make_upload("tt.pdf", b"%PDF-1.4 dummy", "application/pdf")
    try:
        payload = await app_module.classify_pdf(upload)
        assert payload.decision.value == "allow"
        assert payload.confidence == 86.0
    finally:
        await upload.close()


@pytest.mark.anyio
async def test_api_weak_text_reject_when_ocr_fails(monkeypatch):
    def fake_extract(_data):
        return {
            "pages": 2,
            "lines_by_page": [[]],
            "raw_lines_by_page": [[]],
            "all_lines": [],
            "raw_all_lines": [],
            "non_empty_lines": 0,
            "printable_chars": 0,
            "gibberish_ratio": 1.0,
            "text_quality": "weak",
            "is_weak": True,
            "table_rows_count": 0,
        }

    def fake_ocr(*_args, **_kwargs):
        raise RuntimeError("ocr unavailable")

    monkeypatch.setattr(app_module, "extract_pdf_features", fake_extract)
    monkeypatch.setattr(app_module, "run_ocr_probe", fake_ocr)

    upload = _make_upload("scan.pdf", b"%PDF-1.4 dummy", "application/pdf")
    try:
        payload = await app_module.classify_pdf(upload)
        assert payload.decision.value == "reject"
        assert "weak_text_and_ocr_insufficient" in payload.reasons
    finally:
        await upload.close()
