"""Static settings for timetable PDF classifier v1."""

from __future__ import annotations

import re

APP_HOST = "127.0.0.1"
APP_PORT = 8001

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

THRESHOLD_ALLOW = 78.0

WEIGHTS = {
    "day_pattern": 20.0,
    "time_range_pattern": 20.0,
    "subject_row_shape": 30.0,
    "keyword_coverage": 20.0,
    "grid_density": 10.0,
}

DAY_SHORT_TOKENS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}
DAY_FULL_TOKENS = {
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
}

KEYWORD_CATEGORIES = {
    "timetable_context": [
        "time table",
        "timetable",
        "period",
        "day",
    ],
    "academic_structure": [
        "semester",
        "section",
        "room no",
        "room number",
        "room",
    ],
    "subject_table": [
        "subject code",
        "short form",
        "l t p",
        "ltp",
        "subject teacher",
        "name of subject teacher",
        "faculty",
        "teacher",
    ],
}

TIME_RANGE_RE = re.compile(
    r"\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b"
)

CODE_TOKEN_RE = re.compile(r"\b(?:[A-Z]{2,}\s*-?\s*\d{2,}[A-Z]*|VAC)\b")
LTP_TRIPLE_RE = re.compile(r"\b\d{1,2}\s*(?:[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}|\s+\d{1,2}\s+\d{1,2})\b")
SHORT_CODE_RE = re.compile(r"\b[A-Z]{2,}(?:\s+LAB)?\b")
TEACHER_HINT_RE = re.compile(r"\b(?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Prof\.?|Faculty|Teacher|Not\s*Mentioned)\b", re.I)

STRUCTURED_LINE_HINT_RE = re.compile(
    r"(?:\||\t|\b\d{1,2}:\d{2}\b.*\b\d{1,2}:\d{2}\b|\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\b.*\b\d+\b)",
    re.I,
)

WEAK_TEXT_RULES = {
    "min_non_empty_lines": 25,
    "min_printable_chars": 500,
    "max_gibberish_ratio": 0.40,
}

GRID_DENSITY_MIN_RATIO = 0.04


# Conservative hard-fail reasons.
REASON_NO_DAY_AND_NO_TIME = "no_day_and_no_time_patterns"
REASON_NO_ACADEMIC_ROWS = "no_academic_tabular_rows"
REASON_INSUFFICIENT_STRUCTURED = "insufficient_structured_timetable_evidence"
REASON_WEAK_TEXT_AND_OCR = "weak_text_and_ocr_insufficient"
REASON_LOW_CONFIDENCE = "low_confidence_below_threshold"
