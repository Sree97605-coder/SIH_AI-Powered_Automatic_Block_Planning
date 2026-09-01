"""Pandas loaders for timetable and goods-forecast block slots."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DATA_DIR.parent
if str(DATA_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_DIR))
if str(PROJECT_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "src"))

from corridor import CORRIDOR, section_by_id
from generate_block_slots import SLOT_FIELDS, all_slots
from load_defects import load_defects
from section_resolver import resolve_section_id


def load_block_slots(data_dir: Path | None = None) -> pd.DataFrame:
    """Load combined slots CSV, or build from the in-memory generator."""
    root = data_dir or DATA_DIR
    path = root / "block_slots.csv"
    if path.exists():
        frame = pd.read_csv(path)
    else:
        frame = pd.DataFrame([{k: r[k] for k in SLOT_FIELDS} for r in all_slots()])
    return frame


def load_timetable_slots(data_dir: Path | None = None) -> pd.DataFrame:
    root = data_dir or DATA_DIR
    path = root / "timetable_slots.csv"
    if path.exists():
        return pd.read_csv(path)
    return load_block_slots(root).query("source == 'Timetable'").reset_index(drop=True)


def load_goods_forecast_slots(data_dir: Path | None = None) -> pd.DataFrame:
    root = data_dir or DATA_DIR
    path = root / "goods_forecast_slots.csv"
    if path.exists():
        return pd.read_csv(path)
    return load_block_slots(root).query("source == 'GoodsForecast'").reset_index(drop=True)


def load_goods_forecast(data_dir: Path | None = None) -> pd.DataFrame:
    root = data_dir or DATA_DIR
    return pd.read_csv(root / "goods_forecast.csv")


def map_defects_to_candidate_slots(
    defects_df: pd.DataFrame | None = None,
    slots_df: pd.DataFrame | None = None,
    data_dir: Path | None = None,
) -> pd.DataFrame:
    """Join defects with candidate block slots based on section_id."""
    defects = defects_df.copy() if defects_df is not None else load_defects(data_dir)
    slots = slots_df.copy() if slots_df is not None else load_block_slots(data_dir)

    if "section_id" not in defects.columns:
        defects["section_id"] = defects["location"].apply(
            lambda loc: resolve_section_id(str(loc), CORRIDOR)
        )

    merged = pd.merge(
        defects,
        slots,
        on="section_id",
        how="inner",
        suffixes=("_defect", "_slot"),
    )
    return merged


def before_optimization_metrics(
    defects_df: pd.DataFrame | None = None,
    slots_df: pd.DataFrame | None = None,
    data_dir: Path | None = None,
) -> pd.DataFrame:
    """Calculate section-level supply vs demand metrics before optimization."""
    defects = defects_df.copy() if defects_df is not None else load_defects(data_dir)
    slots = slots_df.copy() if slots_df is not None else load_block_slots(data_dir)

    if "section_id" not in defects.columns:
        defects["section_id"] = defects["location"].apply(
            lambda loc: resolve_section_id(str(loc), CORRIDOR)
        )

    # Defect demand per section
    def_agg = (
        defects.groupby("section_id")
        .agg(
            defect_count=("defect_id", "count"),
            demanded_hours=("estimated_duration_hours", "sum"),
        )
        .reset_index()
    )

    if "horizon" not in slots.columns:
        slots["horizon"] = slots["start_datetime"].apply(
            lambda dt: "weekly" if str(dt) <= "2026-09-13T23:59:59" else "monthly"
        )

    # Weekly slot supply
    weekly_agg = (
        slots[slots["horizon"] == "weekly"]
        .groupby("section_id")
        .agg(
            weekly_slot_count=("slot_id", "count"),
            weekly_available_hours=("duration_hours", "sum"),
        )
        .reset_index()
    )

    # Total 30-day monthly supply
    monthly_agg = (
        slots.groupby("section_id")
        .agg(
            monthly_slot_count=("slot_id", "count"),
            monthly_available_hours=("duration_hours", "sum"),
        )
        .reset_index()
    )

    # Combine section level statistics
    summary = def_agg.merge(weekly_agg, on="section_id", how="left").merge(
        monthly_agg, on="section_id", how="left"
    )

    summary["section_name"] = summary["section_id"].apply(lambda sid: section_by_id(sid)["name"])
    summary["traffic_density"] = summary["section_id"].apply(
        lambda sid: section_by_id(sid)["density"].capitalize()
    )
    summary["weekly_net_deficit_hours"] = (
        summary["demanded_hours"] - summary["weekly_available_hours"]
    ).round(2)
    summary["weekly_coverage_pct"] = (
        (summary["weekly_available_hours"] / summary["demanded_hours"]) * 100
    ).round(1)
    summary["monthly_coverage_pct"] = (
        (summary["monthly_available_hours"] / summary["demanded_hours"]) * 100
    ).round(1)

    column_order = [
        "section_id",
        "section_name",
        "traffic_density",
        "defect_count",
        "demanded_hours",
        "weekly_available_hours",
        "weekly_slot_count",
        "weekly_net_deficit_hours",
        "weekly_coverage_pct",
        "monthly_available_hours",
        "monthly_slot_count",
        "monthly_coverage_pct",
    ]
    return summary[column_order]
