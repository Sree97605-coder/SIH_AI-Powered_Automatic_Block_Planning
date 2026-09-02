from __future__ import annotations

import ast
from typing import Callable

import pandas as pd


def _parse_assigned_ids(raw) -> list[str]:
    """Parse list-like or semicolon-delimited assigned defect IDs from schedule CSV output."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return []

    s = str(raw).strip()
    if not s:
        return []

    # Handle literal Python list strings like "['A', 'B']"
    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass

    # Real output in this project is semicolon-joined strings, e.g. "D-001;D-002"
    return [p.strip() for p in s.split(";") if p.strip()]


def _stable_defect_sort(defects_df: pd.DataFrame) -> pd.DataFrame:
    """Sort defects by urgency/priority and then operational urgency in a stable way."""
    df = defects_df.copy()

    def urgency_rank(value: str) -> int:
        mapping = {
            "P1 - Immediate": 1,
            "P2 - Urgent": 2,
            "P3 - Planned": 3,
            "P3 - Scheduled": 3,
            "P4 - Routine": 4,
            "P4 - Low": 4,
        }
        return mapping.get(str(value), 99)

    df["_urgency_rank"] = df["urgency_band"].map(urgency_rank)
    df["_priority_score"] = pd.to_numeric(df.get("final_priority_score", df.get("rule_priority_score", 0)), errors="coerce").fillna(0)
    df["_overdue_days"] = pd.to_numeric(df.get("overdue_days", 0), errors="coerce").fillna(0)
    df["_report_date"] = pd.to_datetime(df.get("report_date", pd.NaT), errors="coerce")

    sort_cols = ["_urgency_rank", "_priority_score", "_overdue_days", "_report_date", "defect_id"]
    return df.sort_values(sort_cols, ascending=[True, False, False, False, True], na_position="last").reset_index(drop=True)


def _plan_metrics(defects_df: pd.DataFrame, schedule_df: pd.DataFrame) -> dict:
    """Compute high-level schedule metrics from a schedule DataFrame."""
    defects_df = defects_df.copy()
    schedule_df = schedule_df.copy()

    scheduled_ids: set[str] = set()
    for ids in schedule_df.get("assigned_defect_ids", pd.Series(dtype=object)).fillna("").tolist():
        scheduled_ids.update(_parse_assigned_ids(ids))

    total_defects = len(defects_df)
    scheduled_count = len(scheduled_ids)
    unscheduled_count = total_defects - scheduled_count

    def band_count(label: str) -> int:
        return int(defects_df["urgency_band"].astype(str).str.contains(label, na=False).sum())

    p1_total = band_count("P1")
    p2_total = band_count("P2")
    p1_sched = int(defects_df[defects_df["urgency_band"].astype(str).str.contains("P1", na=False)]["defect_id"].isin(scheduled_ids).sum())
    p2_sched = int(defects_df[defects_df["urgency_band"].astype(str).str.contains("P2", na=False)]["defect_id"].isin(scheduled_ids).sum())

    bundled_defect_count = int(
        sum(
            len(_parse_assigned_ids(ids))
            for ids in schedule_df.get("assigned_defect_ids", pd.Series(dtype=object)).fillna("").tolist()
            if len(_parse_assigned_ids(ids)) > 1
        )
    )
    bundled_slots = int((schedule_df.get("assigned_defect_count", pd.Series(dtype=object)).fillna(0).astype(int) > 1).sum())

    return {
        "total_defects": total_defects,
        "scheduled_defects": scheduled_count,
        "unscheduled_defects": unscheduled_count,
        "clearance_pct": round((scheduled_count / total_defects) * 100.0, 1) if total_defects else 0.0,
        "p1_total": p1_total,
        "p1_scheduled": p1_sched,
        "p1_pct": round((p1_sched / p1_total) * 100.0, 1) if p1_total else 0.0,
        "p2_total": p2_total,
        "p2_scheduled": p2_sched,
        "p2_pct": round((p2_sched / p2_total) * 100.0, 1) if p2_total else 0.0,
        "combined_p1_p2_pct": round(((p1_sched + p2_sched) / (p1_total + p2_total)) * 100.0, 1) if (p1_total + p2_total) else 0.0,
        "bundling_rate_pct": round((bundled_defect_count / scheduled_count) * 100.0, 1) if scheduled_count else 0.0,
        "bundled_slots": bundled_slots,
    }


def fifo_baseline(defects_df: pd.DataFrame, slots_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Manual plan: oldest / highest-urgency backlog first, assign to earliest matching slot."""
    defects = _stable_defect_sort(defects_df).copy()
    slots = slots_df.copy().reset_index(drop=True)

    if "start_datetime" in slots.columns:
        slots["_sort_dt"] = pd.to_datetime(slots["start_datetime"], errors="coerce")
    elif "date" in slots.columns:
        slots["_sort_dt"] = pd.to_datetime(slots["date"], errors="coerce")
    else:
        slots["_sort_dt"] = pd.to_datetime(pd.NaT)

    slots["remaining_hours"] = pd.to_numeric(slots["duration_hours"], errors="coerce").fillna(0.0)
    slot_assignments: dict[str, list[str]] = {}
    occupied_slot_ids: set[str] = set()

    for _, defect in defects.iterrows():
        d_id = str(defect["defect_id"])
        section_id = str(defect.get("section_id", ""))
        duration = float(defect.get("estimated_duration_hours", 0) or 0)

        candidates = slots[
            (slots["section_id"] == section_id)
            & (~slots["slot_id"].isin(occupied_slot_ids))
            & (slots["remaining_hours"] >= duration - 1e-9)
        ].sort_values(["_sort_dt", "slot_id"], na_position="last")

        if candidates.empty:
            continue

        slot = candidates.iloc[0]
        slot_id = str(slot["slot_id"])
        slot_assignments.setdefault(slot_id, []).append(d_id)
        occupied_slot_ids.add(slot_id)
        slots.loc[slots["slot_id"] == slot_id, "remaining_hours"] -= duration

    rows = []
    for _, slot in slots.iterrows():
        ids = slot_assignments.get(str(slot["slot_id"]), [])
        if not ids:
            continue
        rows.append(
            {
                "slot_id": str(slot["slot_id"]),
                "section_id": str(slot.get("section_id", "")),
                "start_datetime": slot.get("start_datetime", slot.get("date", "")),
                "end_datetime": slot.get("end_datetime", ""),
                "duration_hours": slot.get("duration_hours", 0.0),
                "assigned_defect_ids": ";".join(ids),
                "assigned_defect_count": len(ids),
            }
        )

    schedule_df = pd.DataFrame(rows)
    scheduled_set = {d for ids in slot_assignments.values() for d in ids}
    unscheduled_df = defects[~defects["defect_id"].isin(scheduled_set)].copy()
    return schedule_df, unscheduled_df


def severity_baseline(defects_df: pd.DataFrame, slots_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Manual plan: severity-first ordering, then earliest-fit slot assignment."""
    defects = defects_df.copy().reset_index(drop=True)
    defects["_severity_rank"] = defects["severity"].astype(str).str.lower().map({"high": 1, "medium": 2, "low": 3}).fillna(3)
    defects["_priority_score"] = pd.to_numeric(defects.get("final_priority_score", defects.get("rule_priority_score", 0)), errors="coerce").fillna(0)
    defects["_overdue_days"] = pd.to_numeric(defects.get("overdue_days", 0), errors="coerce").fillna(0)
    defects = defects.sort_values(["_severity_rank", "_priority_score", "_overdue_days", "defect_id"], ascending=[True, False, False, True], na_position="last").reset_index(drop=True)

    slots = slots_df.copy().reset_index(drop=True)
    if "start_datetime" in slots.columns:
        slots["_sort_dt"] = pd.to_datetime(slots["start_datetime"], errors="coerce")
    elif "date" in slots.columns:
        slots["_sort_dt"] = pd.to_datetime(slots["date"], errors="coerce")
    else:
        slots["_sort_dt"] = pd.to_datetime(pd.NaT)

    slots["remaining_hours"] = pd.to_numeric(slots["duration_hours"], errors="coerce").fillna(0.0)
    slot_assignments: dict[str, list[str]] = {}
    occupied_slot_ids: set[str] = set()

    for _, defect in defects.iterrows():
        d_id = str(defect["defect_id"])
        section_id = str(defect.get("section_id", ""))
        duration = float(defect.get("estimated_duration_hours", 0) or 0)

        candidates = slots[
            (slots["section_id"] == section_id)
            & (~slots["slot_id"].isin(occupied_slot_ids))
            & (slots["remaining_hours"] >= duration - 1e-9)
        ].sort_values(["_sort_dt", "slot_id"], na_position="last")

        if candidates.empty:
            continue

        slot = candidates.iloc[0]
        slot_id = str(slot["slot_id"])
        slot_assignments.setdefault(slot_id, []).append(d_id)
        occupied_slot_ids.add(slot_id)
        slots.loc[slots["slot_id"] == slot_id, "remaining_hours"] -= duration

    rows = []
    for _, slot in slots.iterrows():
        ids = slot_assignments.get(str(slot["slot_id"]), [])
        if not ids:
            continue
        rows.append(
            {
                "slot_id": str(slot["slot_id"]),
                "section_id": str(slot.get("section_id", "")),
                "start_datetime": slot.get("start_datetime", slot.get("date", "")),
                "end_datetime": slot.get("end_datetime", ""),
                "duration_hours": slot.get("duration_hours", 0.0),
                "assigned_defect_ids": ";".join(ids),
                "assigned_defect_count": len(ids),
            }
        )

    schedule_df = pd.DataFrame(rows)
    scheduled_set = {d for ids in slot_assignments.values() for d in ids}
    unscheduled_df = defects[~defects["defect_id"].isin(scheduled_set)].copy()
    return schedule_df, unscheduled_df


def compare_plans(
    defects_df: pd.DataFrame,
    slots_df: pd.DataFrame,
    optimized_schedule_df: pd.DataFrame,
    optimized_unscheduled_df: pd.DataFrame,
    baseline_fn: Callable[[pd.DataFrame, pd.DataFrame], tuple[pd.DataFrame, pd.DataFrame]],
    baseline_label: str,
) -> pd.DataFrame:
    """Compare a greedy baseline against the optimized schedule for a single horizon."""
    baseline_schedule, baseline_unscheduled = baseline_fn(defects_df, slots_df)

    baseline_metrics = _plan_metrics(defects_df, baseline_schedule)
    optimized_metrics = _plan_metrics(defects_df, optimized_schedule_df)

    rows = [
        {
            "plan": baseline_label,
            "scheduled_defects": baseline_metrics["scheduled_defects"],
            "clearance_pct": baseline_metrics["clearance_pct"],
            "p1_clearance_pct": baseline_metrics["p1_pct"],
            "p2_clearance_pct": baseline_metrics["p2_pct"],
            "combined_p1_p2_pct": baseline_metrics["combined_p1_p2_pct"],
            "bundling_rate_pct": baseline_metrics["bundling_rate_pct"],
            "unscheduled_defects": baseline_metrics["unscheduled_defects"],
        },
        {
            "plan": "Optimized",
            "scheduled_defects": optimized_metrics["scheduled_defects"],
            "clearance_pct": optimized_metrics["clearance_pct"],
            "p1_clearance_pct": optimized_metrics["p1_pct"],
            "p2_clearance_pct": optimized_metrics["p2_pct"],
            "combined_p1_p2_pct": optimized_metrics["combined_p1_p2_pct"],
            "bundling_rate_pct": optimized_metrics["bundling_rate_pct"],
            "unscheduled_defects": optimized_metrics["unscheduled_defects"],
        },
    ]
    return pd.DataFrame(rows)


if __name__ == "__main__":
    defects = pd.read_csv("data/prioritized_defects.csv")
    slots = pd.read_csv("data/block_slots.csv")

    for horizon in ("weekly", "monthly"):
        horizon_slots = slots[slots["horizon"] == horizon].copy().reset_index(drop=True)
        sched = pd.read_csv(f"data/optimized/{horizon}_schedule.csv")

        print(f"\n=== {horizon.upper()} horizon ===")
        print(
            compare_plans(
                defects,
                horizon_slots,
                sched,
                pd.DataFrame(),
                fifo_baseline,
                "Manual (FIFO)",
            ).to_string(index=False)
        )
        print(
            compare_plans(
                defects,
                horizon_slots,
                sched,
                pd.DataFrame(),
                severity_baseline,
                "Manual (Severity-first)",
            ).to_string(index=False)
        )
