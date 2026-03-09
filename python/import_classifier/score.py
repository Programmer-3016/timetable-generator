"""Scoring and decision logic for classifier v1."""

from __future__ import annotations

from typing import Any

from .settings import (
    GRID_DENSITY_MIN_RATIO,
    REASON_INSUFFICIENT_STRUCTURED,
    REASON_LOW_CONFIDENCE,
    REASON_NO_ACADEMIC_ROWS,
    REASON_NO_DAY_AND_NO_TIME,
    THRESHOLD_ALLOW,
    WEIGHTS,
)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def evaluate_decision(signals: dict[str, Any], threshold: float = THRESHOLD_ALLOW) -> dict[str, Any]:
    day_hits = int(signals["day_pattern"].get("raw_hits", 0))
    time_hits = int(signals["time_range_pattern"].get("raw_hits", 0))
    academic_hits = int(signals["subject_row_shape"].get("raw_hits", 0))
    structured_ratio = float(signals["grid_density"].get("structured_ratio", 0.0))
    keyword_categories = int(signals["keyword_coverage"].get("category_count", 0))

    reasons: list[str] = []

    if day_hits == 0 and time_hits == 0:
        reasons.append(REASON_NO_DAY_AND_NO_TIME)
    if academic_hits == 0:
        reasons.append(REASON_NO_ACADEMIC_ROWS)
    if structured_ratio < GRID_DENSITY_MIN_RATIO and keyword_categories < 2:
        reasons.append(REASON_INSUFFICIENT_STRUCTURED)

    hard_fail = len(reasons) > 0

    # Weighted sum from detector scores (already normalized to each weight max).
    confidence = 0.0
    for key, max_weight in WEIGHTS.items():
        score = float(signals.get(key, {}).get("score", 0.0))
        confidence += _clamp(score, 0.0, max_weight)
    confidence = round(_clamp(confidence, 0.0, 100.0), 2)

    if hard_fail:
        decision = "reject"
    elif confidence >= threshold:
        decision = "allow"
    else:
        decision = "reject"
        reasons.append(REASON_LOW_CONFIDENCE)

    # Keep reason order stable and deduped.
    seen = set()
    ordered_reasons = []
    for reason in reasons:
        if reason in seen:
            continue
        seen.add(reason)
        ordered_reasons.append(reason)

    return {
        "decision": decision,
        "confidence": confidence,
        "threshold": float(threshold),
        "hard_fail": hard_fail,
        "reasons": ordered_reasons,
    }
