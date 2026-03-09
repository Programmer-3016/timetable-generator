"""Pydantic schemas for timetable PDF classifier API."""

from __future__ import annotations

from enum import Enum
from typing import List

from pydantic import BaseModel, Field


class Decision(str, Enum):
    ALLOW = "allow"
    REJECT = "reject"


class DayPatternSignal(BaseModel):
    score: float = 0.0
    raw_hits: int = 0
    unique_days: int = 0
    line_start_hits: int = 0


class TimeRangeSignal(BaseModel):
    score: float = 0.0
    raw_hits: int = 0
    max_ranges_in_line: int = 0
    pages_with_ranges: int = 0


class SubjectRowSignal(BaseModel):
    score: float = 0.0
    raw_hits: int = 0
    header_hits: int = 0


class KeywordCoverageSignal(BaseModel):
    score: float = 0.0
    categories_hit: List[str] = Field(default_factory=list)
    category_count: int = 0


class GridDensitySignal(BaseModel):
    score: float = 0.0
    structured_ratio: float = 0.0
    structured_hits: int = 0


class SignalBundle(BaseModel):
    day_pattern: DayPatternSignal
    time_range_pattern: TimeRangeSignal
    subject_row_shape: SubjectRowSignal
    keyword_coverage: KeywordCoverageSignal
    grid_density: GridDensitySignal


class MetaInfo(BaseModel):
    pages: int = 0
    ocr_used: bool = False
    text_quality: str = "weak"


class ClassifyResponse(BaseModel):
    decision: Decision
    confidence: float
    threshold: float
    hard_fail: bool
    reasons: List[str] = Field(default_factory=list)
    signals: SignalBundle
    meta: MetaInfo
