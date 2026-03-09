"""Tests for signal detectors — day patterns, grid density, keywords, and subject shapes."""
from import_classifier.signals import (
    detect_day_pattern,
    detect_grid_density,
    detect_keyword_coverage,
    detect_subject_row_shape,
    detect_time_range_pattern,
)


def _sample_lines_by_page():
    return [
        [
            "BCA IV Sem., II Year (AKTU)",
            "Section: A Room No. 103",
            "Time 9:05-9:55 9:55-10:45 10:45-11:35 11:35-12:25",
            "MON JAVA OS DAA WT",
            "TUE OS JAVA DAA DT",
            "WED WT JAVA DAA OS",
            "THU WT OS DAA DT",
            "FRI OS WT DT DAA",
            "Subject Code L T P Subject Name Short Form Name of Subject Teacher",
            "IMC201 5 Object Oriented Programming with JAVA JAVA Mr. Rajesh Gupta",
            "IMC202 5 Operating System OS Ms. Sonali Rohilla",
            "IMC203 5 Design and Analysis of Algorithms DAA Prof.(Dr.) Ragini Karwayun",
        ]
    ]


def test_day_pattern_signal_hits():
    result = detect_day_pattern(_sample_lines_by_page())
    assert result["raw_hits"] >= 5
    assert result["unique_days"] >= 4
    assert result["score"] > 0


def test_time_range_signal_hits():
    result = detect_time_range_pattern(_sample_lines_by_page())
    assert result["raw_hits"] >= 3
    assert result["max_ranges_in_line"] >= 2
    assert result["score"] > 0


def test_subject_row_shape_hits():
    result = detect_subject_row_shape(_sample_lines_by_page())
    assert result["raw_hits"] >= 2
    assert result["header_hits"] >= 1


def test_keyword_coverage_hits_multiple_categories():
    lines = [ln for page in _sample_lines_by_page() for ln in page]
    result = detect_keyword_coverage(lines)
    assert result["category_count"] >= 2
    assert "subject_table" in result["categories_hit"]


def test_grid_density_signal_ratio():
    lines_by_page = _sample_lines_by_page()
    raw_lines_by_page = _sample_lines_by_page()
    result = detect_grid_density(lines_by_page, raw_lines_by_page, table_rows_count=22)
    assert result["structured_ratio"] > 0
    assert result["score"] > 0
