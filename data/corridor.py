"""Corridor geography for SIH26027 synthetic prototype.

Loads ``data/corridor.json`` so JSON and the Python dict stay in sync.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent
CORRIDOR_JSON_PATH = DATA_DIR / "corridor.json"


def load_corridor(path: Path | None = None) -> dict[str, Any]:
    """Return the NCR Prayagraj CNB–PRYJ corridor as a nested dict."""
    target = path or CORRIDOR_JSON_PATH
    with target.open(encoding="utf-8") as handle:
        return json.load(handle)


CORRIDOR: dict[str, Any] = load_corridor()


def station_by_code(code: str, corridor: dict[str, Any] | None = None) -> dict[str, Any]:
    """Look up one station record by CRS-style code."""
    data = corridor or CORRIDOR
    for station in data["stations"]:
        if station["code"] == code:
            return station
    raise KeyError(f"Unknown station code: {code}")


def section_by_id(section_id: str, corridor: dict[str, Any] | None = None) -> dict[str, Any]:
    """Look up one planning block section by id (SEC-01 … SEC-05)."""
    data = corridor or CORRIDOR
    for section in data["block_sections"]:
        if section["section_id"] == section_id:
            return section
    raise KeyError(f"Unknown section id: {section_id}")
