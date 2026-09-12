from __future__ import annotations

import ast
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from baseline_and_metrics import compare_plans, fifo_baseline, severity_baseline
from src.database import read_records
from src.feasibility_utils import classify_unscheduled
from src.optimization import optimize_schedule
from src.auth import CurrentUser, authenticate_user, create_access_token, get_current_user, require_roles

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
OPTIMIZED_DIR = DATA_DIR / "optimized"
OVERRIDE_DB_PATH = Path(os.environ.get("OVERRIDE_DB_PATH", "override_log.db"))
if not OVERRIDE_DB_PATH.is_absolute():
    OVERRIDE_DB_PATH = PROJECT_ROOT / OVERRIDE_DB_PATH
CRIS_PENDING_DB_PATH = Path(os.environ.get("CRIS_PENDING_DB_PATH", "cris_pending_defects.db"))
if not CRIS_PENDING_DB_PATH.is_absolute():
    CRIS_PENDING_DB_PATH = PROJECT_ROOT / CRIS_PENDING_DB_PATH

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


def _add_source_system(df: pd.DataFrame) -> pd.DataFrame:
    enriched = df.copy()
    if "source_system" not in enriched.columns:
        enriched["source_system"] = enriched["defect_id"].astype(str).str.extract(r"^(TMS|SMMS|TDMS)-", expand=False)
    return enriched


def _get_real_defect_schema() -> list[str]:
    schema_path = DATA_DIR / "prioritized_defects.csv"
    if schema_path.exists():
        try:
            return list(pd.read_csv(schema_path, nrows=0).columns)
        except Exception:
            pass
    return [
        "defect_id",
        "department",
        "location",
        "section_id",
        "section_name",
        "defect_type",
        "severity",
        "overdue_days",
        "estimated_duration_hours",
        "criticality_score",
        "asset_impact",
        "description",
        "source_system",
    ]


def _normalize_ingest_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")

    defect_id = str(payload.get("defect_id", "")).strip()
    if not defect_id:
        raise HTTPException(status_code=400, detail="defect_id is required.")

    required_fields = [
        "department",
        "location",
        "section_id",
        "section_name",
        "defect_type",
        "severity",
        "overdue_days",
        "estimated_duration_hours",
        "criticality_score",
        "asset_impact",
        "description",
    ]
    missing = [field for field in required_fields if payload.get(field) in (None, "")]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}.")

    department = str(payload["department"]).strip()
    location = str(payload["location"]).strip()
    section_id = str(payload["section_id"]).strip()
    section_name = str(payload["section_name"]).strip()
    defect_type = str(payload["defect_type"]).strip()
    severity = str(payload["severity"]).strip()
    asset_impact = str(payload["asset_impact"]).strip()
    description = str(payload["description"]).strip()
    if not all([department, location, section_id, section_name, defect_type, severity, asset_impact, description]):
        raise HTTPException(status_code=400, detail="All defect fields must be non-empty strings.")

    try:
        overdue_days = int(payload["overdue_days"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="overdue_days must be an integer.") from None

    try:
        estimated_duration_hours = float(payload["estimated_duration_hours"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="estimated_duration_hours must be numeric.") from None

    try:
        criticality_score = int(payload["criticality_score"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="criticality_score must be an integer.") from None

    source_system = str(payload.get("source_system") or defect_id.split("-")[0]).strip() or "TMS"
    if source_system not in {"TMS", "SMMS", "TDMS"}:
        source_system = defect_id.split("-")[0] if defect_id.split("-")[0] in {"TMS", "SMMS", "TDMS"} else "TMS"

    normalized = {
        "defect_id": defect_id,
        "department": department,
        "location": location,
        "section_id": section_id,
        "section_name": section_name,
        "defect_type": defect_type,
        "severity": severity,
        "overdue_days": overdue_days,
        "estimated_duration_hours": round(estimated_duration_hours, 2),
        "criticality_score": criticality_score,
        "asset_impact": asset_impact,
        "description": description,
        "source_system": source_system,
    }

    schema = _get_real_defect_schema()
    for field in schema:
        if field not in normalized:
            normalized[field] = None
    return normalized


def _append_defect_to_master_dataset(defect_row: dict[str, Any]) -> None:
    path = DATA_DIR / "prioritized_defects.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    schema = _get_real_defect_schema()

    if path.exists() and path.stat().st_size > 0:
        df = pd.read_csv(path)
    else:
        df = pd.DataFrame(columns=schema)

    if "defect_id" not in df.columns:
        df["defect_id"] = pd.Series(dtype="object")

    normalized_row = {field: defect_row.get(field) for field in schema}
    defect_id = str(normalized_row.get("defect_id", "")).strip()
    if defect_id:
        matching = df["defect_id"].astype(str).str.strip() == defect_id
        if matching.any():
            for field in schema:
                df.loc[matching, field] = normalized_row.get(field)
            df = df.reindex(columns=schema)
            df.to_csv(path, index=False)
            return

    df = pd.concat([df, pd.DataFrame([normalized_row])], ignore_index=True)
    df = df.reindex(columns=schema)
    df.to_csv(path, index=False)


def _write_system_event(
    conn: sqlite3.Connection,
    event_type: str,
    defect_id: str,
    *,
    slot_id: str | None = None,
    horizon: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            defect_id TEXT NOT NULL,
            slot_id TEXT,
            horizon TEXT,
            created_at TEXT NOT NULL,
            payload_json TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO system_events (event_type, defect_id, slot_id, horizon, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
        (
            event_type,
            defect_id,
            slot_id,
            horizon,
            datetime.now(timezone.utc).isoformat(),
            json.dumps(payload or {}, sort_keys=True),
        ),
    )
    conn.commit()


def _find_compatible_slot_for_defect(normalized: dict[str, Any], horizons: list[str] | None = None) -> tuple[str | None, str | None]:
    for horizon in horizons or ["weekly", "monthly"]:
        defects_df, slots_df, schedule_df = _load_live_state(horizon)
        if slots_df.empty:
            continue
        slot_lookup, _ = _schedule_lookup(schedule_df)
        best_slot_id: str | None = None
        best_excess = None
        required_hours = float(normalized.get("estimated_duration_hours", 0) or 0.0)
        if required_hours <= 0:
            continue

        for _, slot_row in slots_df.iterrows():
            if str(slot_row.get("section_id", "")).strip() != str(normalized.get("section_id", "")).strip():
                continue
            slot_id = str(slot_row.get("slot_id", "")).strip()
            if not slot_id:
                continue
            remaining_hours = _slot_remaining_hours(slot_id, slots_df, slot_lookup, defects_df)
            if remaining_hours < required_hours:
                continue
            excess = remaining_hours - required_hours
            if best_slot_id is None or excess < (best_excess if best_excess is not None else float("inf")):
                best_slot_id = slot_id
                best_excess = excess

        if best_slot_id is not None:
            return horizon, best_slot_id
    return None, None


def _assign_defect_to_schedule(horizon: str, slot_id: str, defect_row: dict[str, Any]) -> None:
    schedule_path = OPTIMIZED_DIR / f"{horizon}_schedule.csv"
    schedule_df = pd.read_csv(schedule_path) if schedule_path.exists() else pd.DataFrame()
    if schedule_df.empty:
        return

    mask = schedule_df["slot_id"].astype(str).str.strip() == slot_id
    if not mask.any():
        return

    row_index = schedule_df.index[mask][0]
    assigned_ids = _parse_assigned_ids(schedule_df.at[row_index, "assigned_defect_ids"])
    defect_id = str(defect_row.get("defect_id", "")).strip()
    if defect_id and defect_id not in assigned_ids:
        assigned_ids.append(defect_id)

    schedule_df.at[row_index, "assigned_defect_ids"] = str(assigned_ids)
    schedule_df.at[row_index, "assigned_defect_count"] = len(assigned_ids)

    departments = []
    if not schedule_df.empty:
        all_defects = _read_dataset(DATA_DIR / "prioritized_defects.csv", "rail_defects")
        for did in assigned_ids:
            def_row = all_defects[all_defects["defect_id"].astype(str).str.strip() == did]
            if not def_row.empty:
                department = str(def_row.iloc[0].get("department", "")).strip()
                if department:
                    departments.append(department)
    schedule_df.at[row_index, "departments_involved"] = str(sorted(set(departments)))

    duration_hours = float(schedule_df.at[row_index, "duration_hours"] or 0.0)
    total_duration = 0.0
    for did in assigned_ids:
        def_row = _read_dataset(DATA_DIR / "prioritized_defects.csv", "rail_defects")
        matches = def_row[def_row["defect_id"].astype(str).str.strip() == did]
        if not matches.empty:
            total_duration += float(matches.iloc[0].get("estimated_duration_hours", 0.0) or 0.0)
    schedule_df.at[row_index, "total_defect_duration"] = round(total_duration, 2)
    schedule_df.at[row_index, "max_defect_duration"] = round(max([float(d.get("estimated_duration_hours", 0.0) or 0.0) for d in _read_dataset(DATA_DIR / "prioritized_defects.csv", "rail_defects").to_dict(orient="records") if str(d.get("defect_id", "")).strip() in assigned_ids], default=0.0), 2)
    if duration_hours > 0:
        schedule_df.at[row_index, "duration_utilization_pct"] = round((total_duration / duration_hours) * 100.0, 1)
    else:
        schedule_df.at[row_index, "duration_utilization_pct"] = 0.0

    unscheduled_path = OPTIMIZED_DIR / f"unscheduled_{horizon}_defects.csv"
    if unscheduled_path.exists():
        unscheduled_df = pd.read_csv(unscheduled_path)
        unscheduled_df = unscheduled_df[~unscheduled_df["defect_id"].astype(str).str.strip().eq(defect_id)].copy()
        unscheduled_df.to_csv(unscheduled_path, index=False)

    schedule_df.to_csv(schedule_path, index=False)


def _ensure_cris_pending_db() -> sqlite3.Connection:
    CRIS_PENDING_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(CRIS_PENDING_DB_PATH))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_defects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING_REOPTIMIZATION',
            source_system TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            defect_id TEXT NOT NULL,
            slot_id TEXT,
            horizon TEXT,
            created_at TEXT NOT NULL,
            payload_json TEXT
        )
        """
    )
    conn.commit()
    return conn


def _filter_by_department(df: pd.DataFrame, user: CurrentUser) -> pd.DataFrame:
    if user.role != "DEPT_ENGINEER" or not user.department:
        return df
    enriched = _add_source_system(df)
    return enriched[enriched["source_system"].astype(str) == user.department].copy()


class LoginPayload(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
def login(payload: LoginPayload) -> dict[str, Any]:
    user = authenticate_user(payload.username.strip(), payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return {
        "access_token": create_access_token(user.username, user.role, user.department),
        "token_type": "bearer",
        "expires_in": 8 * 60 * 60,
        "user": {"username": user.username, "role": user.role, "department": user.department},
    }


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
            priority_alert INTEGER NOT NULL,
            previous_override_id INTEGER NULL
        )
        """
    )
    columns = conn.execute("PRAGMA table_info(overrides)").fetchall()
    existing = {row[1] for row in columns}
    if "previous_override_id" not in existing:
        conn.execute("ALTER TABLE overrides ADD COLUMN previous_override_id INTEGER NULL")
    conn.commit()
    return conn


def _get_previous_override_id(conn: sqlite3.Connection, defect_id: str) -> int | None:
    row = conn.execute(
        "SELECT override_id FROM overrides WHERE defect_id = ? ORDER BY override_id DESC LIMIT 1",
        (defect_id,),
    ).fetchone()
    return int(row[0]) if row else None


def _duplicate_override_recent(conn: sqlite3.Connection, defect_id: str, target_slot_id: str, changed_by: str) -> sqlite3.Row | None:
    cutoff = (datetime.now(timezone.utc) - __import__("datetime").timedelta(seconds=5)).isoformat()
    row = conn.execute(
        """
        SELECT * FROM overrides
        WHERE defect_id = ?
          AND new_slot_id = ?
          AND changed_by = ?
          AND timestamp >= ?
        ORDER BY override_id DESC
        LIMIT 1
        """,
        (defect_id, target_slot_id, changed_by, cutoff),
    ).fetchone()
    return row


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


@app.get("/audit-log")
def get_audit_log(
    defect_id: str | None = Query(default=None),
    horizon: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    if horizon is not None and horizon.lower() not in {"weekly", "monthly"}:
        raise HTTPException(status_code=400, detail="horizon must be 'weekly' or 'monthly'.")

    query = "SELECT * FROM overrides"
    parameters: list[str] = []
    filters: list[str] = []

    if defect_id is not None:
        filters.append("defect_id = ?")
        parameters.append(defect_id)
    if horizon is not None:
        filters.append("horizon = ?")
        parameters.append(horizon.lower())

    if filters:
        query += " WHERE " + " AND ".join(filters)
    query += " ORDER BY timestamp DESC"

    connection = sqlite3.connect(f"file:{OVERRIDE_DB_PATH}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(query, parameters).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


@app.get("/defects/pending")
def get_pending_defects() -> list[dict[str, Any]]:
    conn = _ensure_cris_pending_db()
    try:
        rows = conn.execute(
            "SELECT id, defect_id, status, source_system, created_at, updated_at, payload_json FROM pending_defects ORDER BY created_at DESC"
        ).fetchall()
    finally:
        conn.close()

    results: list[dict[str, Any]] = []
    for row in rows:
        payload = json.loads(row[6]) if row[6] else {}
        results.append(
            {
                "id": row[0],
                "defect_id": row[1],
                "status": row[2],
                "source_system": row[3],
                "created_at": row[4],
                "updated_at": row[5],
                "payload": payload,
            }
        )
    return results


@app.post("/defects/ingest")
def ingest_defect(payload: dict[str, Any], response: Response) -> dict[str, Any]:
    normalized = _normalize_ingest_payload(payload)
    defect_id = str(normalized["defect_id"]).strip()
    now = datetime.now(timezone.utc).isoformat()

    conn = _ensure_cris_pending_db()
    try:
        existing = conn.execute(
            "SELECT payload_json FROM pending_defects WHERE defect_id = ?",
            (defect_id,),
        ).fetchone()
        if existing is not None:
            existing_payload = json.loads(existing[0]) if existing[0] else {}
            if existing_payload == normalized:
                response.status_code = 200
                return {
                    "defect_id": defect_id,
                    "status": "PENDING_REOPTIMIZATION",
                    "duplicate": True,
                    "message": "Defect is already pending re-optimization.",
                }

            conn.execute(
                "UPDATE pending_defects SET status = ?, updated_at = ?, payload_json = ? WHERE defect_id = ?",
                ("PENDING_REOPTIMIZATION", now, json.dumps(normalized, sort_keys=True), defect_id),
            )
            conn.commit()
            response.status_code = 200
            return {
                "defect_id": defect_id,
                "status": "PENDING_REOPTIMIZATION",
                "duplicate": False,
                "message": "Defect pending re-optimization was refreshed.",
            }

        horizon, slot_id = _find_compatible_slot_for_defect(normalized)
        if horizon and slot_id:
            _append_defect_to_master_dataset(normalized)
            _assign_defect_to_schedule(horizon, slot_id, normalized)
            _write_system_event(conn, "SYSTEM_INCREMENTAL_INSERT", defect_id, slot_id=slot_id, horizon=horizon, payload=normalized)
            response.status_code = 200
            return {
                "defect_id": defect_id,
                "status": "SCHEDULED",
                "duplicate": False,
                "slot_id": slot_id,
                "horizon": horizon,
                "message": f"New defect {defect_id} scheduled immediately into slot {slot_id} ({horizon}) — no full re-optimization needed.",
            }

        conn.execute(
            "INSERT INTO pending_defects (defect_id, status, source_system, created_at, updated_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                defect_id,
                "PENDING_REOPTIMIZATION",
                normalized.get("source_system"),
                now,
                now,
                json.dumps(normalized, sort_keys=True),
            ),
        )
        conn.commit()
        response.status_code = 201
    finally:
        conn.close()

    return {
        "defect_id": defect_id,
        "status": "PENDING_REOPTIMIZATION",
        "duplicate": False,
        "message": "Defect queued for re-optimization.",
    }


@app.get("/defects")
def get_defects(
    urgency: str | None = Query(default=None, description="Optional urgency band filter, e.g. P1 or P2"),
    limit: int | None = Query(default=None, ge=1),
    user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    defects_df = _read_dataset(DATA_DIR / "prioritized_defects.csv", "rail_defects")
    if defects_df.empty:
        return []
    defects_df = _filter_by_department(defects_df, user)

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

    return _clean_frame(_add_source_system(defects_df))


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
def get_schedule(horizon: str, user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    schedule_df = _read_dataset(
        OPTIMIZED_DIR / f"{horizon}_schedule.csv", f"rail_{horizon}_schedule"
    )
    if user.role == "DEPT_ENGINEER" and user.department:
        schedule_df = schedule_df.copy()
        schedule_df["assigned_defect_ids"] = schedule_df["assigned_defect_ids"].apply(
            lambda raw: [
                defect_id
                for defect_id in _parse_assigned_ids(raw)
                if defect_id.startswith(f"{user.department}-")
            ]
        )
        schedule_df["assigned_defect_count"] = schedule_df["assigned_defect_ids"].apply(len)
        schedule_df = schedule_df[schedule_df["assigned_defect_count"] > 0].copy()
    return _clean_frame(schedule_df)


@app.get("/unscheduled/{horizon}")
def get_unscheduled(horizon: str, user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    unscheduled_df = _read_dataset(
        OPTIMIZED_DIR / f"unscheduled_{horizon}_defects.csv",
        f"rail_unscheduled_{horizon}",
    )
    return _clean_frame(_filter_by_department(unscheduled_df, user))


@app.get("/classifications/{horizon}")
def get_classifications(horizon: str, user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
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
    return _clean_frame(_filter_by_department(classified, user))


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
def preview_override(
    payload: dict[str, Any],
    user: CurrentUser = Depends(require_roles("COA_ADMIN")),
) -> dict[str, Any]:
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
def confirm_override(
    payload: dict[str, Any],
    user: CurrentUser = Depends(require_roles("COA_ADMIN")),
) -> dict[str, Any]:
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

    if preview.get("p1_displacement") and (not reason_freetext or len(reason_freetext) < 20):
        raise HTTPException(
            status_code=400,
            detail={
                "reason": "p1_justification_required",
                "message": "P1-displacing overrides require a justification with at least 20 characters.",
            },
        )

    learnable = LEARNABLE_REASON_FLAGS[reason_category]
    now = datetime.now(timezone.utc).isoformat()

    schedule_path = OPTIMIZED_DIR / f"{payload['horizon']}_schedule.csv"
    unscheduled_path = OPTIMIZED_DIR / f"unscheduled_{payload['horizon']}_defects.csv"

    schedule_backup = schedule_path.read_text(encoding="utf-8") if schedule_path.exists() else None
    unscheduled_backup = unscheduled_path.read_text(encoding="utf-8") if unscheduled_path.exists() else None

    conn = _ensure_override_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        duplicate = _duplicate_override_recent(conn, preview["defect_id"], preview["target_slot_id"], changed_by)
        if duplicate is not None:
            conn.rollback()
            return {
                "message": "Override confirmed and committed.",
                "horizon": preview["horizon"],
                "defect_id": preview["defect_id"],
                "target_slot_id": preview["target_slot_id"],
                "schedule": _clean_frame(pd.DataFrame([slot.__dict__ for slot in preview["scheduled_slots"]])),
                "unscheduled": _clean_frame(preview["unscheduled_df"]),
            }

        try:
            _write_live_schedule(preview["horizon"], preview["scheduled_slots"], preview["unscheduled_df"])
            previous_override_id = _get_previous_override_id(conn, preview["defect_id"])
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
                    priority_alert,
                    previous_override_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    previous_override_id,
                ),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    except Exception as exc:
        if schedule_backup is not None:
            schedule_path.write_text(schedule_backup, encoding="utf-8")
        if unscheduled_backup is not None:
            unscheduled_path.write_text(unscheduled_backup, encoding="utf-8")
        raise exc
    finally:
        conn.close()

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

