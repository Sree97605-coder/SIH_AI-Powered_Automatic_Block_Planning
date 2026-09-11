from __future__ import annotations

import ast
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from baseline_and_metrics import compare_plans, fifo_baseline, severity_baseline
from src.database import read_records
from src.feasibility_utils import classify_unscheduled
from src.optimization import optimize_schedule

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
OPTIMIZED_DIR = DATA_DIR / "optimized"
OVERRIDE_DB_PATH = PROJECT_ROOT / "override_log.db"

VALID_REASON_CATEGORIES = {
    "prioritization_mistake": "Prioritization mistake",
    "missed_bundling_opportunity": "Missed bundling opportunity",
    "weather_or_emergency": "Weather or emergency",
    "crew_or_resource_unavailable": "Crew or resource unavailable",
    "emergency_reprioritization": "Emergency reprioritization",
    "other": "Other",
}
LEARNABLE_REASON_FLAGS = {
    "prioritization_mistake": 1,
    "missed_bundling_opportunity": 1,
    "weather_or_emergency": 0,
    "crew_or_resource_unavailable": 0,
    "emergency_reprioritization": 0,
    "other": 0,
}
# Allow-list for overrides that would displace a P1 defect.
# Only genuine emergency categories may defer a P1; all others get a 403
# (policy rejection), not a 409 (physical infeasibility).
EMERGENCY_REASON_CATEGORIES: frozenset[str] = frozenset({
    "weather_or_emergency",
    "emergency_reprioritization",
})

app = FastAPI(title="Rail Block Planning API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
)


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists() or path.stat().st_size == 0:
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def _read_dataset(path: Path, table_name: str) -> pd.DataFrame:
    records = read_records(table_name)
    if records is not None:
        return pd.DataFrame(records)
    return _read_csv(path)


def _clean_frame(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df.empty:
        return []
    return df.where(pd.notna(df), None).to_dict(orient="records")


def _parse_assigned_ids(raw: Any) -> list[str]:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return []

    s = str(raw).strip()
    if not s:
        return []

    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass

    return [p.strip() for p in s.split(";") if p.strip()]


def _normalize_horizon(horizon: str) -> str:
    horizon = str(horizon or "").strip().lower()
    if horizon not in {"weekly", "monthly"}:
        raise HTTPException(status_code=400, detail=f"Invalid horizon '{horizon}'. Must be 'weekly' or 'monthly'.")
    return horizon


def _load_live_state(horizon: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    horizon = _normalize_horizon(horizon)
    defects_df = _read_dataset(DATA_DIR / "prioritized_defects.csv", "rail_defects")
    slots_df = _read_dataset(DATA_DIR / "block_slots.csv", "rail_slots")
    slots_df = slots_df[slots_df["horizon"].astype(str).str.lower() == horizon].copy()
    schedule_df = _read_dataset(OPTIMIZED_DIR / f"{horizon}_schedule.csv", f"rail_{horizon}_schedule")
    return defects_df, slots_df, schedule_df


def _compute_metrics(defects_df: pd.DataFrame, scheduled_ids: set[str]) -> dict[str, float]:
    total_defects = len(defects_df)
    if total_defects == 0:
        return {
            "clearance_pct": 0.0,
            "p1_clearance_pct": 0.0,
            "p2_clearance_pct": 0.0,
        }

    p1_total = int(defects_df[defects_df["urgency_band"].astype(str).str.contains("P1", case=False, na=False)].shape[0])
    p2_total = int(defects_df[defects_df["urgency_band"].astype(str).str.contains("P2", case=False, na=False)].shape[0])

    p1_scheduled = int(
        defects_df[defects_df["urgency_band"].astype(str).str.contains("P1", case=False, na=False)]["defect_id"].isin(scheduled_ids).sum()
    )
    p2_scheduled = int(
        defects_df[defects_df["urgency_band"].astype(str).str.contains("P2", case=False, na=False)]["defect_id"].isin(scheduled_ids).sum()
    )

    def pct(part: int, whole: int) -> float:
        return round((part / whole) * 100.0, 1) if whole else 0.0

    return {
        "clearance_pct": round((len(scheduled_ids) / total_defects) * 100.0, 1) if total_defects else 0.0,
        "p1_clearance_pct": pct(p1_scheduled, p1_total),
        "p2_clearance_pct": pct(p2_scheduled, p2_total),
    }


def _schedule_lookup(schedule_df: pd.DataFrame) -> tuple[dict[str, list[str]], dict[str, str]]:
    slot_lookup: dict[str, list[str]] = {}
    defect_slot_lookup: dict[str, str] = {}

    for _, row in schedule_df.iterrows():
        slot_id = str(row.get("slot_id", ""))
        assigned_ids = _parse_assigned_ids(row.get("assigned_defect_ids"))
        if assigned_ids:
            slot_lookup[slot_id] = assigned_ids
            for defect_id in assigned_ids:
                defect_slot_lookup[defect_id] = slot_id

    return slot_lookup, defect_slot_lookup


def _slot_remaining_hours(slot_id: str, slots_df: pd.DataFrame, slot_lookup: dict[str, list[str]], defects_df: pd.DataFrame) -> float:
    slots = slots_df[slots_df["slot_id"].astype(str) == slot_id]
    if slots.empty:
        return -1.0

    slot_row = slots.iloc[0]
    target_duration = float(slot_row.get("duration_hours", 0.0) or 0.0)
    assigned_ids = slot_lookup.get(slot_id, [])
    defect_map = {row["defect_id"]: float(row.get("estimated_duration_hours", 0) or 0.0) for _, row in defects_df.iterrows()}
    used_duration = sum(defect_map.get(did, 0.0) for did in assigned_ids)
    return max(0.0, target_duration - used_duration)


def _build_override_preview(payload: dict[str, Any]) -> dict[str, Any]:
    """Build a preview of what a proposed slot override would produce.

    reason_category is required in the payload at PREVIEW time, not only at
    confirm time, because P1-displacement gating must be evaluated before
    the officer decides whether to proceed.
    """
    defect_id = str(payload.get("defect_id", "")).strip()
    target_slot_id = str(payload.get("target_slot_id", "")).strip()
    horizon = _normalize_horizon(payload.get("horizon", ""))
    reason_category = str(payload.get("reason_category", "")).strip()

    if not defect_id or not target_slot_id:
        raise HTTPException(status_code=400, detail="defect_id and target_slot_id are required.")

    defects_df, slots_df, schedule_df = _load_live_state(horizon)

    if defects_df.empty or slots_df.empty:
        raise HTTPException(status_code=404, detail=f"No live data available for {horizon} horizon.")

    if defect_id not in defects_df["defect_id"].astype(str).tolist():
        raise HTTPException(status_code=404, detail=f"Defect {defect_id} was not found in the current defect dataset.")

    slot_lookup, defect_slot_lookup = _schedule_lookup(schedule_df)
    current_scheduled_ids = set()
    for ids in slot_lookup.values():
        current_scheduled_ids.update(ids)

    if defect_id not in current_scheduled_ids:
        raise HTTPException(status_code=404, detail=f"Defect {defect_id} is not currently scheduled in the live {horizon} plan.")

    target_slots = slots_df[slots_df["slot_id"].astype(str) == target_slot_id]
    if target_slots.empty:
        raise HTTPException(status_code=404, detail=f"Target slot {target_slot_id} was not found for horizon {horizon}.")

    current_slot_id = defect_slot_lookup.get(defect_id)
    defect_row = defects_df[defects_df["defect_id"].astype(str) == defect_id].iloc[0]
    defect_duration = float(defect_row.get("estimated_duration_hours", 0) or 0.0)
    target_slot_row = target_slots.iloc[0]

    available_hours = _slot_remaining_hours(target_slot_id, slots_df, slot_lookup, defects_df)
    required_hours = defect_duration

    result: dict[str, Any] = {
        "feasible": True,
        "reason": None,
        "available_hours": round(available_hours, 2),
        "required_hours": round(required_hours, 2),
        "original_slot_id": current_slot_id,
        "target_slot_id": target_slot_id,
        "horizon": horizon,
        "defect_id": defect_id,
        "current_scheduled_ids": sorted(current_scheduled_ids),
        "newly_deferred": [],
        "newly_cleared": [],
        "priority_alert": False,
        "p1_displacement": False,
        "reason_category_valid_for_displacement": True,
        "metrics_before": _compute_metrics(defects_df, current_scheduled_ids),
        "metrics_after": None,
    }

    pinned_assignments = {defect_id: target_slot_id}
    # Always use relax_p1_requirement=True so the solver can show what the
    # override would produce even when it displaces a P1.  Physical capacity
    # constraints (slot duration caps) remain hard and still surface as 409.
    try:
        scheduled_slots, unscheduled_df, _ = optimize_schedule(
            data_dir=DATA_DIR,
            horizon=horizon,
            pinned_assignments=pinned_assignments,
            relax_p1_requirement=True,
        )
    except RuntimeError as exc:
        # Physical capacity infeasibility: slot cannot hold the pin at all.
        raise HTTPException(
            status_code=409,
            detail={"feasible": False, "reason": "solver_infeasible", "message": str(exc)}
        ) from exc

    new_scheduled_ids = set()
    for slot in scheduled_slots:
        new_scheduled_ids.update(slot.assigned_defect_ids)

    newly_deferred = sorted(current_scheduled_ids - new_scheduled_ids)
    result["newly_deferred"] = newly_deferred
    result["newly_cleared"] = sorted(new_scheduled_ids - current_scheduled_ids)

    # Detect P1 and P2 in deferred set
    deferred_p1_ids = [
        d for d in newly_deferred
        if not defects_df[defects_df["defect_id"].astype(str) == d].empty
        and "P1" in str(defects_df[defects_df["defect_id"].astype(str) == d].iloc[0].get("urgency_band", "")).upper()
    ]
    deferred_p2_or_above_ids = [
        d for d in newly_deferred
        if not defects_df[defects_df["defect_id"].astype(str) == d].empty
        and (
            "P1" in str(defects_df[defects_df["defect_id"].astype(str) == d].iloc[0].get("urgency_band", "")).upper()
            or "P2" in str(defects_df[defects_df["defect_id"].astype(str) == d].iloc[0].get("urgency_band", "")).upper()
        )
    ]

    has_p1_displacement = len(deferred_p1_ids) > 0
    result["p1_displacement"] = has_p1_displacement
    result["priority_alert"] = len(deferred_p2_or_above_ids) > 0

    # --- P1-displacement policy gate (server-enforced) -----------------------
    # If the override would defer a P1, the reason_category MUST be in the
    # emergency allow-list.  This is checked BEFORE returning the preview so
    # the officer sees the policy rejection immediately.
    if has_p1_displacement:
        valid_for_p1 = reason_category in EMERGENCY_REASON_CATEGORIES
        result["reason_category_valid_for_displacement"] = valid_for_p1
        if not valid_for_p1:
            allowed = sorted(EMERGENCY_REASON_CATEGORIES)
            raise HTTPException(
                status_code=403,
                detail={
                    "reason": "p1_displacement_not_authorized",
                    "message": (
                        f"Deferring a P1 defect requires reason_category to be one of "
                        f"{allowed}. Received: '{reason_category}'."
                    ),
                    "p1_displacement": True,
                    "newly_deferred": newly_deferred,
                    "reason_category_valid_for_displacement": False,
                },
            )

    result["metrics_after"] = _compute_metrics(defects_df, new_scheduled_ids)
    result["scheduled_slots"] = scheduled_slots
    result["unscheduled_df"] = unscheduled_df
    return result


def _ensure_override_db() -> sqlite3.Connection:
    OVERRIDE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(OVERRIDE_DB_PATH))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS overrides (
            override_id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id TEXT NOT NULL,
            horizon TEXT NOT NULL,
            original_slot_id TEXT,
            new_slot_id TEXT NOT NULL,
            changed_by TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            reason_category TEXT NOT NULL,
            reason_freetext TEXT,
            learnable INTEGER NOT NULL,
            newly_deferred_ids TEXT,
            priority_alert INTEGER NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def _write_live_schedule(horizon: str, scheduled_slots: list[Any], unscheduled_df: pd.DataFrame) -> None:
    horizon_dir = OPTIMIZED_DIR
    horizon_dir.mkdir(parents=True, exist_ok=True)

    schedule_df = pd.DataFrame([slot.__dict__ for slot in scheduled_slots])
    schedule_path = horizon_dir / f"{horizon}_schedule.csv"
    unscheduled_path = horizon_dir / f"unscheduled_{horizon}_defects.csv"

    schedule_df.to_csv(schedule_path, index=False)
    unscheduled_df.to_csv(unscheduled_path, index=False)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/defects")
def get_defects(
    urgency: str | None = Query(default=None, description="Optional urgency band filter, e.g. P1 or P2"),
    limit: int | None = Query(default=None, ge=1),
) -> list[dict[str, Any]]:
    defects_df = _read_dataset(DATA_DIR / "prioritized_defects.csv", "rail_defects")
    if defects_df.empty:
        return []

    if urgency:
        defects_df = defects_df[
            defects_df["urgency_band"].astype(str).str.contains(urgency, case=False, na=False)
        ].copy()

    if "priority_score" not in defects_df.columns:
        defects_df["priority_score"] = pd.to_numeric(
            defects_df.get("final_priority_score", defects_df.get("rule_priority_score", 0)),
            errors="coerce",
        ).fillna(0.0)

    if limit is not None:
        defects_df = defects_df.head(limit).copy()

    return _clean_frame(defects_df)


@app.get("/slots")
def get_slots(
    horizon: str | None = Query(default=None, description="Optional horizon filter: weekly or monthly"),
) -> list[dict[str, Any]]:
    slots_df = _read_dataset(DATA_DIR / "block_slots.csv", "rail_slots")
    if slots_df.empty:
        return []
    if horizon:
        slots_df = slots_df[slots_df["horizon"].astype(str).str.lower() == horizon.lower()].copy()
    return _clean_frame(slots_df)


@app.get("/schedules/{horizon}")
def get_schedule(horizon: str) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    schedule_df = _read_dataset(
        OPTIMIZED_DIR / f"{horizon}_schedule.csv", f"rail_{horizon}_schedule"
    )
    return _clean_frame(schedule_df)


@app.get("/unscheduled/{horizon}")
def get_unscheduled(horizon: str) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    unscheduled_df = _read_dataset(
        OPTIMIZED_DIR / f"unscheduled_{horizon}_defects.csv",
        f"rail_unscheduled_{horizon}",
    )
    return _clean_frame(unscheduled_df)


@app.get("/classifications/{horizon}")
def get_classifications(horizon: str) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    unscheduled_df = _read_dataset(
        OPTIMIZED_DIR / f"unscheduled_{horizon}_defects.csv",
        f"rail_unscheduled_{horizon}",
    )
    slots_df = _read_dataset(DATA_DIR / "block_slots.csv", "rail_slots")
    slots_df = slots_df[slots_df["horizon"].astype(str).str.lower() == horizon].copy()
    if unscheduled_df.empty:
        return []
    classified = classify_unscheduled(unscheduled_df, slots_df)
    return _clean_frame(classified)


@app.get("/comparison")
def get_comparison() -> dict[str, list[dict[str, Any]]]:
    defects_df = _read_dataset(DATA_DIR / "prioritized_defects.csv", "rail_defects")
    if defects_df.empty:
        return {"weekly": [], "monthly": []}

    output: dict[str, list[dict[str, Any]]] = {}
    for horizon in ("weekly", "monthly"):
        slots_df = _read_dataset(DATA_DIR / "block_slots.csv", "rail_slots")
        slots_df = slots_df[slots_df["horizon"].astype(str).str.lower() == horizon].copy()
        schedule_df = _read_dataset(
            OPTIMIZED_DIR / f"{horizon}_schedule.csv", f"rail_{horizon}_schedule"
        )

        manual_fifo_schedule, _ = fifo_baseline(defects_df, slots_df)
        manual_severity_schedule, _ = severity_baseline(defects_df, slots_df)

        fifo_table = compare_plans(defects_df, slots_df, schedule_df, pd.DataFrame(), fifo_baseline, "Manual (FIFO)")
        sev_table = compare_plans(defects_df, slots_df, schedule_df, pd.DataFrame(), severity_baseline, "Manual (Severity-first)")

        rows = [
            {
                "plan": "Manual (FIFO)",
                "scheduled_defects": int(fifo_table.iloc[0]["scheduled_defects"]),
                "clearance_pct": float(fifo_table.iloc[0]["clearance_pct"]),
                "p1_clearance_pct": float(fifo_table.iloc[0]["p1_clearance_pct"]),
                "p2_clearance_pct": float(fifo_table.iloc[0]["p2_clearance_pct"]),
                "combined_p1_p2_pct": float(fifo_table.iloc[0]["combined_p1_p2_pct"]),
                "bundling_rate_pct": float(fifo_table.iloc[0]["bundling_rate_pct"]),
                "unscheduled_defects": int(fifo_table.iloc[0]["unscheduled_defects"]),
            },
            {
                "plan": "Manual (Severity-first)",
                "scheduled_defects": int(sev_table.iloc[0]["scheduled_defects"]),
                "clearance_pct": float(sev_table.iloc[0]["clearance_pct"]),
                "p1_clearance_pct": float(sev_table.iloc[0]["p1_clearance_pct"]),
                "p2_clearance_pct": float(sev_table.iloc[0]["p2_clearance_pct"]),
                "combined_p1_p2_pct": float(sev_table.iloc[0]["combined_p1_p2_pct"]),
                "bundling_rate_pct": float(sev_table.iloc[0]["bundling_rate_pct"]),
                "unscheduled_defects": int(sev_table.iloc[0]["unscheduled_defects"]),
            },
            {
                "plan": "Optimized",
                "scheduled_defects": int(fifo_table.iloc[1]["scheduled_defects"]),
                "clearance_pct": float(fifo_table.iloc[1]["clearance_pct"]),
                "p1_clearance_pct": float(fifo_table.iloc[1]["p1_clearance_pct"]),
                "p2_clearance_pct": float(fifo_table.iloc[1]["p2_clearance_pct"]),
                "combined_p1_p2_pct": float(fifo_table.iloc[1]["combined_p1_p2_pct"]),
                "bundling_rate_pct": float(fifo_table.iloc[1]["bundling_rate_pct"]),
                "unscheduled_defects": int(fifo_table.iloc[1]["unscheduled_defects"]),
            },
        ]
        output[horizon] = rows

    return output


@app.post("/schedule/preview-override")
def preview_override(payload: dict[str, Any]) -> dict[str, Any]:
    """Preview the effect of a proposed slot override.

    reason_category is required at preview time (not just confirm time) because
    P1-displacement gating is evaluated here.  If the override would defer a P1
    and reason_category is not in EMERGENCY_REASON_CATEGORIES, a 403 is returned
    before the officer can proceed to confirm.
    """
    preview = _build_override_preview(payload)
    result = {
        "feasible": preview["feasible"],
        "reason": preview.get("reason"),
        "available_hours": preview.get("available_hours"),
        "required_hours": preview.get("required_hours"),
        "newly_deferred": preview.get("newly_deferred", []),
        "newly_cleared": preview.get("newly_cleared", []),
        "priority_alert": preview.get("priority_alert", False),
        "p1_displacement": preview.get("p1_displacement", False),
        "reason_category_valid_for_displacement": preview.get("reason_category_valid_for_displacement", True),
        "metrics_before": preview.get("metrics_before", {}),
        "metrics_after": preview.get("metrics_after", {}),
    }
    if not preview["feasible"]:
        return result
    return result


@app.post("/schedule/confirm-override")
def confirm_override(payload: dict[str, Any]) -> dict[str, Any]:
    reason_category = str(payload.get("reason_category", "")).strip()
    if reason_category not in VALID_REASON_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid reason_category. Must be one of the fixed override categories.")

    preview = _build_override_preview(
        {
            "defect_id": payload.get("defect_id"),
            "target_slot_id": payload.get("target_slot_id"),
            "horizon": payload.get("horizon"),
            "reason_category": reason_category,
        }
    )

    if not preview["feasible"]:
        raise HTTPException(status_code=409, detail=preview)

    changed_by = str(payload.get("changed_by", "")).strip()
    if not changed_by:
        raise HTTPException(status_code=400, detail="changed_by is required.")

    reason_freetext = payload.get("reason_freetext")
    if reason_freetext is not None:
        reason_freetext = str(reason_freetext).strip()

    learnable = LEARNABLE_REASON_FLAGS[reason_category]
    now = datetime.now(timezone.utc).isoformat()

    schedule_path = OPTIMIZED_DIR / f"{payload['horizon']}_schedule.csv"
    unscheduled_path = OPTIMIZED_DIR / f"unscheduled_{payload['horizon']}_defects.csv"

    schedule_backup = schedule_path.read_text(encoding="utf-8") if schedule_path.exists() else None
    unscheduled_backup = unscheduled_path.read_text(encoding="utf-8") if unscheduled_path.exists() else None

    try:
        _write_live_schedule(preview["horizon"], preview["scheduled_slots"], preview["unscheduled_df"])

        conn = _ensure_override_db()
        try:
            conn.execute(
                """
                INSERT INTO overrides (
                    defect_id,
                    horizon,
                    original_slot_id,
                    new_slot_id,
                    changed_by,
                    timestamp,
                    reason_category,
                    reason_freetext,
                    learnable,
                    newly_deferred_ids,
                    priority_alert
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    preview["defect_id"],
                    preview["horizon"],
                    preview["original_slot_id"],
                    preview["target_slot_id"],
                    changed_by,
                    now,
                    reason_category,
                    reason_freetext,
                    learnable,
                    json.dumps(preview["newly_deferred"]),
                    int(preview["priority_alert"]),
                ),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    except Exception as exc:
        if schedule_backup is not None:
            schedule_path.write_text(schedule_backup, encoding="utf-8")
        if unscheduled_backup is not None:
            unscheduled_path.write_text(unscheduled_backup, encoding="utf-8")
        raise exc

    return {
        "message": "Override confirmed and committed.",
        "horizon": preview["horizon"],
        "defect_id": preview["defect_id"],
        "target_slot_id": preview["target_slot_id"],
        "schedule": _clean_frame(pd.DataFrame([slot.__dict__ for slot in preview["scheduled_slots"]])),
        "unscheduled": _clean_frame(preview["unscheduled_df"]),
    }


# Serve compiled React frontend assets when dist/ exists
DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
if DIST_DIR.exists():
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path in ["health", "defects", "slots", "schedules", "comparison", "unscheduled", "docs", "openapi.json", "redoc", "schedule"]:
            return None
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.api:app", host="0.0.0.0", port=8000, reload=False)

