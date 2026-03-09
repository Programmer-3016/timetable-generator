"""Core signal detectors for timetable PDF classification (v1)."""

from __future__ import annotations

import re
from typing import Any

from .settings import (
    CODE_TOKEN_RE,
    DAY_FULL_TOKENS,
    DAY_SHORT_TOKENS,
    KEYWORD_CATEGORIES,
    LTP_TRIPLE_RE,
    SHORT_CODE_RE,
    STRUCTURED_LINE_HINT_RE,
    TEACHER_HINT_RE,
    TIME_RANGE_RE,
)


def _upper(text: str) -> str:
    return str(text or "").upper()


def detect_day_pattern(lines_by_page: list[list[str]]) -> dict[str, Any]:
    unique_days: set[str] = set()
    raw_hits = 0
    line_start_hits = 0

    for page_lines in lines_by_page:
        for line in page_lines:
            u = _upper(line)
            tokens = re.findall(r"\b[A-Z]{3,9}\b", u)
            for tok in tokens:
                if tok in DAY_SHORT_TOKENS or tok in DAY_FULL_TOKENS:
                    unique_days.add(tok)
                    raw_hits += 1

            if re.match(r"^\s*(MON|TUE|WED|THU|FRI|SAT|SUN|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b", u):
                line_start_hits += 1

    ucount = len(unique_days)
    if ucount >= 5:
        score = 20
    elif ucount == 4:
        score = 16
    elif ucount == 3:
        score = 10
    elif ucount == 2:
        score = 4
    else:
        score = 0

    if ucount >= 4 and line_start_hits >= 4:
        score += 2
    if ucount >= 4 and raw_hits >= 10:
        score += 2

    return {
        "score": float(min(20, score)),
        "raw_hits": int(raw_hits),
        "unique_days": int(ucount),
        "line_start_hits": int(line_start_hits),
    }


def detect_time_range_pattern(lines_by_page: list[list[str]]) -> dict[str, Any]:
    raw_hits = 0
    max_ranges_in_line = 0
    pages_with_ranges = 0

    for page_lines in lines_by_page:
        page_hits = 0
        for line in page_lines:
            count = len(TIME_RANGE_RE.findall(line))
            if count > 0:
                raw_hits += count
                page_hits += count
                max_ranges_in_line = max(max_ranges_in_line, count)
        if page_hits > 0:
            pages_with_ranges += 1

    if raw_hits >= 12 and max_ranges_in_line >= 4:
        score = 20
    elif raw_hits >= 8 and max_ranges_in_line >= 3:
        score = 16
    elif raw_hits >= 6 and max_ranges_in_line >= 2:
        score = 12
    elif raw_hits >= 3:
        score = 6
    else:
        score = 0

    if pages_with_ranges >= 2 and score > 0:
        score += 2

    return {
        "score": float(min(20, score)),
        "raw_hits": int(raw_hits),
        "max_ranges_in_line": int(max_ranges_in_line),
        "pages_with_ranges": int(pages_with_ranges),
    }


def detect_subject_row_shape(lines_by_page: list[list[str]]) -> dict[str, Any]:
    raw_hits = 0
    header_hits = 0
    header_terms = ["subject code", "short form", "l t p", "ltp", "teacher", "faculty"]

    for page_lines in lines_by_page:
        for line in page_lines:
            lower = line.lower()
            term_hits = sum(1 for term in header_terms if term in lower)
            if term_hits >= 2:
                header_hits += 1

            has_code = bool(CODE_TOKEN_RE.search(_upper(line)))
            has_ltp = bool(LTP_TRIPLE_RE.search(line))
            has_short = len(SHORT_CODE_RE.findall(_upper(line))) >= 1
            has_teacher = bool(TEACHER_HINT_RE.search(line))
            token_count = len(line.split())
            has_subject_text = len(re.findall(r"[A-Za-z]{4,}", line)) >= 2

            if has_code and has_subject_text and token_count >= 5 and (has_ltp or has_teacher or has_short):
                raw_hits += 1

    if raw_hits >= 10:
        score = 30
    elif raw_hits >= 7:
        score = 24
    elif raw_hits >= 5:
        score = 18
    elif raw_hits >= 3:
        score = 10
    elif raw_hits >= 1:
        score = 4
    else:
        score = 0

    if raw_hits >= 3 and header_hits >= 2:
        score += 2

    return {
        "score": float(min(30, score)),
        "raw_hits": int(raw_hits),
        "header_hits": int(header_hits),
    }


def detect_keyword_coverage(all_lines: list[str]) -> dict[str, Any]:
    categories_hit: list[str] = []
    recurrence = 0

    for category, keywords in KEYWORD_CATEGORIES.items():
        cat_hits = 0
        for line in all_lines:
            low = line.lower()
            if any(kw in low for kw in keywords):
                cat_hits += 1
        if cat_hits > 0:
            categories_hit.append(category)
            recurrence += cat_hits

    count = len(categories_hit)
    if count >= 3:
        score = 20
    elif count == 2:
        score = 12
    elif count == 1:
        score = 5
    else:
        score = 0

    if count >= 2 and recurrence >= 8:
        score += 2

    return {
        "score": float(min(20, score)),
        "categories_hit": categories_hit,
        "category_count": int(count),
    }


def detect_grid_density(
    lines_by_page: list[list[str]],
    raw_lines_by_page: list[list[str]],
    table_rows_count: int,
) -> dict[str, Any]:
    total_lines = 0
    structured_hits = 0
    pages_with_structured = 0

    page_count = max(len(lines_by_page), len(raw_lines_by_page))
    for idx in range(page_count):
        page_lines = lines_by_page[idx] if idx < len(lines_by_page) else []
        raw_page_lines = raw_lines_by_page[idx] if idx < len(raw_lines_by_page) else page_lines
        page_structured = 0

        for line_idx, line in enumerate(page_lines):
            raw_line = raw_page_lines[line_idx] if line_idx < len(raw_page_lines) else line
            total_lines += 1

            time_count = len(TIME_RANGE_RE.findall(line))
            day_line = bool(
                re.match(
                    r"^\s*(MON|TUE|WED|THU|FRI|SAT|SUN|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b",
                    _upper(line),
                )
            )
            day_row_like = day_line and len(line.split()) >= 3
            code_row_like = bool(CODE_TOKEN_RE.search(_upper(line))) and (
                bool(LTP_TRIPLE_RE.search(line)) or bool(TEACHER_HINT_RE.search(line))
            )
            separator_like = bool(re.search(r"\|+|\t+| {2,}", raw_line))
            hint_like = bool(STRUCTURED_LINE_HINT_RE.search(line))

            if time_count >= 2 or day_row_like or code_row_like or separator_like or hint_like:
                structured_hits += 1
                page_structured += 1

        if page_structured > 0:
            pages_with_structured += 1

    structured_ratio = structured_hits / max(1, total_lines)

    if structured_ratio >= 0.25:
        score = 10
    elif structured_ratio >= 0.15:
        score = 7
    elif structured_ratio >= 0.08:
        score = 4
    elif structured_ratio >= 0.04:
        score = 2
    else:
        score = 0

    if table_rows_count >= 25:
        score += 2
    if structured_ratio >= 0.08 and pages_with_structured >= 2:
        score += 1

    return {
        "score": float(min(10, score)),
        "structured_ratio": round(structured_ratio, 4),
        "structured_hits": int(structured_hits),
    }


def detect_all_signals(features: dict[str, Any]) -> dict[str, Any]:
    lines_by_page = features.get("lines_by_page", [])
    raw_lines_by_page = features.get("raw_lines_by_page", lines_by_page)
    all_lines = features.get("all_lines", [])
    table_rows_count = int(features.get("table_rows_count", 0) or 0)

    day = detect_day_pattern(lines_by_page)
    time = detect_time_range_pattern(lines_by_page)
    subject = detect_subject_row_shape(lines_by_page)
    keyword = detect_keyword_coverage(all_lines)
    grid = detect_grid_density(lines_by_page, raw_lines_by_page, table_rows_count)

    return {
        "day_pattern": day,
        "time_range_pattern": time,
        "subject_row_shape": subject,
        "keyword_coverage": keyword,
        "grid_density": grid,
    }
