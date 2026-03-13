"""FastAPI entrypoint for timetable PDF classifier v1."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .extract import extract_pdf_features
from .logger import get_logger
from .ocr import extract_text_with_ocr, run_ocr_probe
from .schemas import (
    ClassifyResponse,
    DayPatternSignal,
    GridDensitySignal,
    KeywordCoverageSignal,
    MetaInfo,
    SignalBundle,
    SubjectRowSignal,
    TimeRangeSignal,
)
from .score import evaluate_decision
from .settings import (
    APP_HOST,
    APP_PORT,
    MAX_FILE_SIZE_BYTES,
    REASON_WEAK_TEXT_AND_OCR,
    THRESHOLD_ALLOW,
    WEAK_TEXT_RULES,
)
from .signals import detect_all_signals

app = FastAPI(title="Timetable PDF Classifier", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5501"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger = get_logger("import_classifier")


from .process_parser import (
    _build_process_classes_from_pdf_tables,
    _build_process_classes,
    _extract_process_settings,
    _extract_process_settings_from_pdf_tables,
    _build_settings_diagnostics,
    _should_retry_ocr_for_class_recovery,
)


def _empty_signals() -> SignalBundle:
    return SignalBundle(
        day_pattern=DayPatternSignal(),
        time_range_pattern=TimeRangeSignal(),
        subject_row_shape=SubjectRowSignal(),
        keyword_coverage=KeywordCoverageSignal(),
        grid_density=GridDensitySignal(),
    )


def _signal_bundle_from_dict(signals: dict[str, Any]) -> SignalBundle:
    return SignalBundle(
        day_pattern=DayPatternSignal(**signals.get("day_pattern", {})),
        time_range_pattern=TimeRangeSignal(**signals.get("time_range_pattern", {})),
        subject_row_shape=SubjectRowSignal(**signals.get("subject_row_shape", {})),
        keyword_coverage=KeywordCoverageSignal(**signals.get("keyword_coverage", {})),
        grid_density=GridDensitySignal(**signals.get("grid_density", {})),
    )


def _reject_response_for_weak_text(pages: int, ocr_used: bool) -> ClassifyResponse:
    return ClassifyResponse(
        decision="reject",
        confidence=0.0,
        threshold=THRESHOLD_ALLOW,
        hard_fail=True,
        reasons=[REASON_WEAK_TEXT_AND_OCR],
        signals=_empty_signals(),
        meta=MetaInfo(pages=pages, ocr_used=ocr_used, text_quality="weak"),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/import/process")
async def process_pdf(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        filename = (file.filename or "").strip()
        content_type = (file.content_type or "").lower()

        if not filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
        # Accept common browser/client upload types for PDFs.
        allowed_content_types = {
            "application/pdf",
            "application/x-pdf",
            "application/octet-stream",
            "binary/octet-stream",
        }
        if content_type and content_type not in allowed_content_types and "pdf" not in content_type:
            raise HTTPException(status_code=400, detail="Invalid content-type for PDF upload.")

        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(data) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="PDF file is too large.")
        if not data.lstrip().startswith(b"%PDF"):
            raise HTTPException(status_code=422, detail="Invalid or corrupted PDF file.")


        features = extract_pdf_features(data)
        lines_by_page = features.get("lines_by_page", [])

        # Primary path: text-layer extraction.
        # OCR fallback is activated only when extracted content is near-empty.
        extracted_text = "\n".join(features.get("all_lines", [])).strip()
        used_ocr_fallback = False
        ocr_max_pages = 0
        ocr_pages_processed = 0

        if len(extracted_text) < 50:
            used_ocr_fallback = True
            try:
                total_pages = int(features.get("pages", 0) or 0)
            except Exception:
                total_pages = 0
            ocr_max_pages = max(1, min(total_pages if total_pages > 0 else 24, 24))
            try:
                ocr_payload = extract_text_with_ocr(
                    data,
                    max_pages=ocr_max_pages,
                    dpi=170,
                    chunk_size=3,
                )
            except Exception as exc:
                logger.warning("process route OCR fallback failed: %s", exc)
                raise HTTPException(
                    status_code=422,
                    detail="Scanned PDF could not be processed.",
                ) from exc
            ocr_text = str(ocr_payload.get("text", "")).strip()
            if len(ocr_text) < 50:
                raise HTTPException(
                    status_code=422,
                    detail="Scanned PDF could not be processed.",
                )
            try:
                ocr_pages_processed = int(ocr_payload.get("pages_processed", 0) or 0)
            except Exception:
                ocr_pages_processed = 0
            lines_by_page = ocr_payload.get("lines_by_page", []) or lines_by_page

        classes = _build_process_classes_from_pdf_tables(data)
        if not classes:
            classes = _build_process_classes(lines_by_page)

        # If OCR recovered too few classes compared to scanned page count,
        # retry once at higher DPI to improve header/label capture quality.
        if used_ocr_fallback:
            pages_for_threshold = ocr_pages_processed or ocr_max_pages
            if _should_retry_ocr_for_class_recovery(len(classes), pages_for_threshold):
                try:
                    retry_payload = extract_text_with_ocr(
                        data,
                        max_pages=ocr_max_pages or 24,
                        dpi=240,
                        chunk_size=2,
                    )
                    retry_lines = retry_payload.get("lines_by_page", []) or []
                    if retry_lines:
                        retry_classes = _build_process_classes(retry_lines)
                        if len(retry_classes) > len(classes):
                            classes = retry_classes
                            lines_by_page = retry_lines
                except Exception as exc:
                    logger.warning("process route high-DPI OCR retry failed: %s", exc)

        if not classes:
            return {"success": False, "message": "Could not parse timetable"}
        line_settings = _extract_process_settings(lines_by_page)
        settings = dict(line_settings)
        table_settings = _extract_process_settings_from_pdf_tables(data)
        if table_settings:
            settings.update(
                {
                    key: value
                    for key, value in table_settings.items()
                    if value is not None and value != ""
                }
            )
        settings_diagnostics = _build_settings_diagnostics(
            line_settings, table_settings
        )

        return {
            "success": True,
            "data": {
                "classes": classes,
                "settings": settings,
                "settingsDiagnostics": settings_diagnostics,
            },
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("process route failed")
        return {"success": False, "message": "Could not parse timetable"}


@app.post("/api/import/classify", response_model=ClassifyResponse)
async def classify_pdf(file: UploadFile = File(...)) -> ClassifyResponse:
    filename = (file.filename or "").strip()
    content_type = (file.content_type or "").lower()
    logger.info("classify request started: filename=%s content_type=%s", filename, content_type)

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    # Accept common browser/client upload types for PDFs.
    allowed_content_types = {
        "application/pdf",
        "application/x-pdf",
        "application/octet-stream",
        "binary/octet-stream",
    }
    if content_type and content_type not in allowed_content_types and "pdf" not in content_type:
        raise HTTPException(status_code=400, detail="Invalid content-type for PDF upload.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="PDF file is too large.")
    if not data.lstrip().startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="Invalid or corrupted PDF file.")

    try:
        features = extract_pdf_features(data)
    except Exception as exc:
        logger.exception("extract failed")
        raise HTTPException(status_code=422, detail=f"PDF parse failed: {exc}") from exc

    ocr_used = False

    # OCR is optional and only for weak/empty extracted text.
    if features.get("is_weak"):
        logger.info(
            "weak text detected (lines=%s chars=%s gibberish=%.3f), trying OCR probe",
            features.get("non_empty_lines", 0),
            features.get("printable_chars", 0),
            float(features.get("gibberish_ratio", 0.0)),
        )
        try:
            ocr = run_ocr_probe(data, pages=(1, 2))
            ocr_used = True
            if (
                int(ocr.get("non_empty_lines", 0)) >= WEAK_TEXT_RULES["min_non_empty_lines"]
                and int(ocr.get("printable_chars", 0)) >= WEAK_TEXT_RULES["min_printable_chars"]
            ):
                features["lines_by_page"] = ocr["lines_by_page"]
                features["raw_lines_by_page"] = ocr["lines_by_page"]
                features["all_lines"] = ocr["all_lines"]
                features["raw_all_lines"] = ocr["all_lines"]
                features["non_empty_lines"] = int(ocr["non_empty_lines"])
                features["printable_chars"] = int(ocr["printable_chars"])
                features["is_weak"] = False
                features["text_quality"] = "medium"
                logger.info("OCR probe produced sufficient text; continuing with scoring")
            else:
                logger.info("OCR probe insufficient text; rejecting")
                return _reject_response_for_weak_text(features.get("pages", 0), ocr_used=True)
        except Exception as exc:
            logger.warning("OCR probe failed: %s", exc)
            return _reject_response_for_weak_text(features.get("pages", 0), ocr_used=False)

    if features.get("is_weak"):
        logger.info("text still weak after optional OCR path; rejecting")
        return _reject_response_for_weak_text(features.get("pages", 0), ocr_used=ocr_used)

    signals = detect_all_signals(features)
    decision = evaluate_decision(signals)
    logger.info(
        "decision=%s confidence=%.2f reasons=%s",
        decision["decision"],
        decision["confidence"],
        ",".join(decision["reasons"]),
    )

    response = ClassifyResponse(
        decision=decision["decision"],
        confidence=decision["confidence"],
        threshold=decision["threshold"],
        hard_fail=decision["hard_fail"],
        reasons=decision["reasons"],
        signals=_signal_bundle_from_dict(signals),
        meta=MetaInfo(
            pages=int(features.get("pages", 0)),
            ocr_used=ocr_used,
            text_quality=str(features.get("text_quality", "weak")),
        ),
    )
    return response


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("import_classifier.app:app", host=APP_HOST, port=APP_PORT, reload=True)
