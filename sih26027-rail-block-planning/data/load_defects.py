"""Pandas-ready loaders for corridor + departmental defect CSVs."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from generate_synthetic_data import DEFECT_FIELDS, all_defects

DATA_DIR = Path(__file__).resolve().parent


def load_corridor_frame(path: Path | None = None) -> pd.DataFrame:
    """One row per station with corridor metadata repeated (dashboard-friendly)."""
    import json

    target = path or (DATA_DIR / "corridor.json")
    payload = json.loads(target.read_text(encoding="utf-8"))
    frame = pd.json_normalize(payload["stations"])
    frame["corridor_id"] = payload["corridor_id"]
    frame["division"] = payload["division"]
    frame["zone"] = payload["zone"]
    return frame


def load_sections_frame(path: Path | None = None) -> pd.DataFrame:
    import json

    target = path or (DATA_DIR / "corridor.json")
    payload = json.loads(target.read_text(encoding="utf-8"))
    return pd.json_normalize(payload["block_sections"])


def load_defects(data_dir: Path | None = None) -> pd.DataFrame:
    """Concat TMS + SMMS + TDMS. Falls back to in-memory rows if CSVs are missing."""
    root = data_dir or DATA_DIR
    paths = [root / "tms_defects.csv", root / "smms_defects.csv", root / "tdms_defects.csv"]
    if all(p.exists() for p in paths):
        frames = [pd.read_csv(p) for p in paths]
        return pd.concat(frames, ignore_index=True)
    return pd.DataFrame(all_defects(), columns=DEFECT_FIELDS)


def department_severity_crosstab(frame: pd.DataFrame | None = None) -> pd.DataFrame:
    data = frame if frame is not None else load_defects()
    return pd.crosstab(data["department"], data["severity"], margins=True)
