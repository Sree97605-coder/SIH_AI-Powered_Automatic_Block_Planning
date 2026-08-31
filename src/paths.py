"""Filesystem locations shared by integration and later API modules."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
INTEGRATED_DIR = DATA_DIR / "integrated"


def ensure_data_on_path() -> Path:
    """Allow ``import corridor`` / ``import load_defects`` from the data folder."""
    data = str(DATA_DIR)
    if data not in sys.path:
        sys.path.insert(0, data)
    return DATA_DIR
