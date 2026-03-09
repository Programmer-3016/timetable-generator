"""Tests for the scoring and decision logic (evaluate_decision)."""
from import_classifier.score import evaluate_decision


def test_hard_fail_without_day_and_time_and_rows():
    signals = {
        "day_pattern": {"score": 0, "raw_hits": 0},
        "time_range_pattern": {"score": 0, "raw_hits": 0},
        "subject_row_shape": {"score": 0, "raw_hits": 0},
        "keyword_coverage": {"score": 0, "category_count": 0},
        "grid_density": {"score": 0, "structured_ratio": 0.0},
    }
    out = evaluate_decision(signals)
    assert out["decision"] == "reject"
    assert out["hard_fail"] is True
    assert "no_day_and_no_time_patterns" in out["reasons"]
    assert "no_academic_tabular_rows" in out["reasons"]


def test_allow_when_confidence_high_and_no_hard_fail():
    signals = {
        "day_pattern": {"score": 18, "raw_hits": 7},
        "time_range_pattern": {"score": 16, "raw_hits": 9},
        "subject_row_shape": {"score": 24, "raw_hits": 8},
        "keyword_coverage": {"score": 18, "category_count": 3},
        "grid_density": {"score": 8, "structured_ratio": 0.19},
    }
    out = evaluate_decision(signals)
    assert out["hard_fail"] is False
    assert out["decision"] == "allow"
    assert out["confidence"] >= out["threshold"]


def test_reject_low_confidence_without_hard_fail():
    signals = {
        "day_pattern": {"score": 4, "raw_hits": 2},
        "time_range_pattern": {"score": 6, "raw_hits": 3},
        "subject_row_shape": {"score": 4, "raw_hits": 1},
        "keyword_coverage": {"score": 5, "category_count": 1},
        "grid_density": {"score": 2, "structured_ratio": 0.06},
    }
    out = evaluate_decision(signals)
    assert out["hard_fail"] is False
    assert out["decision"] == "reject"
    assert "low_confidence_below_threshold" in out["reasons"]
