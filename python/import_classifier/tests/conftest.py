"""Pytest path bootstrap for local package imports."""

from __future__ import annotations

import sys
from pathlib import Path


# Project root path: /.../Project_T
PROJECT_ROOT = Path(__file__).resolve().parents[3]
PYTHON_DIR = PROJECT_ROOT / "python"

if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))
