"""Map free-text defect locations onto corridor ``section_id`` values (SEC-01 … SEC-05).

Join key for maintenance tasks ↔ block slots. Resolution order:

1. Explicit ``SEC-0N`` token in the location string.
2. Kilometrage (``km 91.4``) against station chainage.
3. Station codes, yards, and feeding-post names.
"""

from __future__ import annotations

import re
from typing import Any

SEC_TOKEN = re.compile(r"SEC-0([1-5])")
KM_TOKEN = re.compile(r"km\s*([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE)

# Feeding posts and yard phrases that never include a SEC- token.
NAMED_ASSETS: dict[str, str] = {
    "SP Panki": "SEC-01",
    "SSP Bindki Road": "SEC-02",
    "SP Fatehpur": "SEC-03",
    "SSP Sirathu": "SEC-04",
    "SP Subedarganj": "SEC-05",
}

# Prefer the section where the station is the *from* station or a via halt.
# Boundary stations (to of one section / from of the next) default to the
# section they terminate, which matches yard work at that station.
STATION_SECTION: dict[str, str] = {
    "CNB": "SEC-01",
    "CNBI": "SEC-01",
    "PNKD": "SEC-01",
    "BKO": "SEC-01",
    "FTP": "SEC-02",
    "KGA": "SEC-03",
    "SRO": "SEC-04",
    "BRE": "SEC-04",
    "SYWN": "SEC-05",
    "SFG": "SEC-05",
    "PRYJ": "SEC-05",
}

STATION_CODE_PATTERN = re.compile(
    r"\b(" + "|".join(sorted(STATION_SECTION, key=len, reverse=True)) + r")\b"
)


def corridor_section_spans(corridor: dict[str, Any]) -> list[tuple[str, float, float]]:
    """Return (section_id, from_km, to_km) using station chainage."""
    km = {s["code"]: float(s["chainage_km"]) for s in corridor["stations"]}
    spans = []
    for section in corridor["block_sections"]:
        sid = section["section_id"]
        start = km[section["from_station"]]
        end = km[section["to_station"]]
        spans.append((sid, start, end))
    return spans


def section_from_km(km_value: float, corridor: dict[str, Any]) -> str | None:
    """Assign chainage to [from, to) for each section; the last span is closed on the right."""
    spans = corridor_section_spans(corridor)
    last_index = len(spans) - 1
    for i, (sid, start, end) in enumerate(spans):
        if i < last_index and start <= km_value < end:
            return sid
        if i == last_index and start <= km_value <= end:
            return sid
    return None


def resolve_section_id(location: str, corridor: dict[str, Any]) -> str | None:
    """Return SEC-0N for a defect location, or None if it cannot be mapped."""
    if not location or not str(location).strip():
        return None
    text = str(location)

    sec_match = SEC_TOKEN.search(text)
    if sec_match:
        return f"SEC-0{sec_match.group(1)}"

    km_match = KM_TOKEN.search(text)
    if km_match:
        mapped = section_from_km(float(km_match.group(1)), corridor)
        if mapped:
            return mapped

    for name, sid in NAMED_ASSETS.items():
        if name.lower() in text.lower():
            return sid

    station_match = STATION_CODE_PATTERN.search(text)
    if station_match:
        return STATION_SECTION[station_match.group(1)]

    return None
