from __future__ import annotations

import pandas as pd


def max_slot_duration_by_section(slots_df: pd.DataFrame) -> dict[str, float]:
    """Largest available slot duration for each section in the supplied slot set."""
    if slots_df.empty:
        return {}
    return slots_df.groupby("section_id")["duration_hours"].max().to_dict()


def compute_feasibility_ceiling(
    defects_df: pd.DataFrame,
    slots_df: pd.DataFrame,
    urgency_contains: str = "P1",
) -> dict:
    """
    Compute the absolute physically achievable clearance ceiling for a urgency band.
    This is the correct target for tests: it derives the limit from the data itself,
    instead of hardcoding optimistic percentages that are impossible under the current
    slot inventory.
    """
    if defects_df.empty or "urgency_band" not in defects_df.columns:
        return {
            "urgency_band_filter": urgency_contains,
            "total_in_band": 0,
            "structurally_infeasible_count": 0,
            "structurally_infeasible_ids": [],
            "max_clearable_count": 0,
            "max_clearable_pct": 100.0,
        }

    band = defects_df[
        defects_df["urgency_band"].astype(str).str.contains(urgency_contains, na=False)
    ].copy()
    if band.empty:
        return {
            "urgency_band_filter": urgency_contains,
            "total_in_band": 0,
            "structurally_infeasible_count": 0,
            "structurally_infeasible_ids": [],
            "max_clearable_count": 0,
            "max_clearable_pct": 100.0,
        }

    max_by_section = max_slot_duration_by_section(slots_df)
    band["_max_slot_in_section"] = band["section_id"].map(max_by_section).fillna(0.0)
    band["_structurally_infeasible"] = (
        band["estimated_duration_hours"] > band["_max_slot_in_section"] + 1e-9
    )

    clearable = band[~band["_structurally_infeasible"]]
    infeasible = band[band["_structurally_infeasible"]]

    return {
        "urgency_band_filter": urgency_contains,
        "total_in_band": len(band),
        "structurally_infeasible_count": len(infeasible),
        "structurally_infeasible_ids": infeasible["defect_id"].tolist(),
        "max_clearable_count": len(clearable),
        "max_clearable_pct": round(100 * len(clearable) / len(band), 1),
    }


def classify_unscheduled(
    unscheduled_df: pd.DataFrame,
    slots_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Tag each unscheduled defect as either structurally infeasible or a contention issue.
    Structurally infeasible means the current slot inventory has no slot in the section
    long enough to hold the defect. This is exactly the case that should trigger a
    request for a mega-block window from Control Office.
    """
    df = unscheduled_df.copy()
    if df.empty:
        return pd.DataFrame(columns=["defect_id", "section_id", "estimated_duration_hours", "reason", "mega_block_hours_needed"])
    if "section_id" not in df.columns:
        return df.copy()

    max_by_section = max_slot_duration_by_section(slots_df)
    df["_max_slot_in_section"] = df["section_id"].map(max_by_section).fillna(0.0)
    df["reason"] = df.apply(
        lambda r: "STRUCTURALLY_INFEASIBLE"
        if r["estimated_duration_hours"] > r["_max_slot_in_section"] + 1e-9
        else "CONTENTION",
        axis=1,
    )
    df["mega_block_hours_needed"] = df.apply(
        lambda r: round(r["estimated_duration_hours"] - r["_max_slot_in_section"], 2)
        if r["reason"] == "STRUCTURALLY_INFEASIBLE"
        else 0.0,
        axis=1,
    )
    return df.drop(columns=["_max_slot_in_section"])
