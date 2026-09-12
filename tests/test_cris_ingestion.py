from __future__ import annotations

import os
import sqlite3
import tempfile
import uuid
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import src.api as api


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    unique_path = tmp_path / "cris_pending.db"
    data_dir = tmp_path / "data"
    optimized_dir = tmp_path / "optimized"
    data_dir.mkdir(parents=True, exist_ok=True)
    optimized_dir.mkdir(parents=True, exist_ok=True)

    old_pending_path = api.CRIS_PENDING_DB_PATH
    old_data_dir = api.DATA_DIR
    old_optimized_dir = api.OPTIMIZED_DIR
    os.environ["CRIS_PENDING_DB_PATH"] = str(unique_path)
    api.CRIS_PENDING_DB_PATH = unique_path
    api.DATA_DIR = data_dir
    api.OPTIMIZED_DIR = optimized_dir

    pd.DataFrame(
        [
            {
                "defect_id": "TMS-EXISTING-001",
                "department": "Engineering",
                "location": "SEC-01 / km 4.9 (CNB–CNBI Up)",
                "section_id": "SEC-01",
                "section_name": "Kanpur Central – Bindki Road",
                "defect_type": "Rail fracture (suspect)",
                "severity": "High",
                "overdue_days": 4,
                "estimated_duration_hours": 2.0,
                "criticality_score": 8,
                "asset_impact": "High",
                "description": "Existing defect already in slot.",
                "source_system": "TMS",
            }
        ]
    ).to_csv(data_dir / "prioritized_defects.csv", index=False)

    pd.DataFrame(
        [
            {
                "slot_id": "TEST-WEEKLY-SEC01-01",
                "section_id": "SEC-01",
                "section_name": "Kanpur Central – Bindki Road",
                "horizon": "weekly",
                "start_datetime": "2026-09-07T00:00:00",
                "end_datetime": "2026-09-07T04:00:00",
                "duration_hours": 4.0,
                "is_night_window": True,
                "traffic_density": "High",
                "slot_source": "Timetable",
                "max_tasks_possible": 3,
            }
        ]
    ).to_csv(data_dir / "block_slots.csv", index=False)

    pd.DataFrame(
        [
            {
                "slot_id": "TEST-WEEKLY-SEC01-01",
                "section_id": "SEC-01",
                "section_name": "Kanpur Central – Bindki Road",
                "start_datetime": "2026-09-07T00:00:00",
                "end_datetime": "2026-09-07T04:00:00",
                "duration_hours": 4.0,
                "is_night_window": True,
                "traffic_density": "High",
                "slot_source": "Timetable",
                "max_tasks_possible": 3,
                "assigned_defect_ids": "['TMS-EXISTING-001']",
                "assigned_defect_count": 1,
                "departments_involved": "['Engineering']",
                "is_bundled": False,
                "bundle_type": "Single Task Block",
                "total_priority_cleared": 80.0,
                "max_defect_duration": 2.0,
                "total_defect_duration": 2.0,
                "duration_utilization_pct": 50.0,
            }
        ]
    ).to_csv(optimized_dir / "weekly_schedule.csv", index=False)

    pd.DataFrame([], columns=["defect_id", "section_id", "urgency_band", "estimated_duration_hours"]).to_csv(
        optimized_dir / "unscheduled_weekly_defects.csv",
        index=False,
    )

    pd.DataFrame(
        [
            {
                "slot_id": "TEST-MONTHLY-SEC01-01",
                "section_id": "SEC-01",
                "section_name": "Kanpur Central – Bindki Road",
                "horizon": "monthly",
                "start_datetime": "2026-09-16T00:00:00",
                "end_datetime": "2026-09-16T04:00:00",
                "duration_hours": 4.0,
                "is_night_window": True,
                "traffic_density": "High",
                "slot_source": "MegaBlock",
                "max_tasks_possible": 3,
            }
        ]
    ).to_csv(data_dir / "block_slots_monthly.csv", index=False)

    pd.DataFrame(
        [
            {
                "slot_id": "TEST-MONTHLY-SEC01-01",
                "section_id": "SEC-01",
                "section_name": "Kanpur Central – Bindki Road",
                "start_datetime": "2026-09-16T00:00:00",
                "end_datetime": "2026-09-16T04:00:00",
                "duration_hours": 4.0,
                "is_night_window": True,
                "traffic_density": "High",
                "slot_source": "MegaBlock",
                "max_tasks_possible": 3,
                "assigned_defect_ids": "[]",
                "assigned_defect_count": 0,
                "departments_involved": "[]",
                "is_bundled": False,
                "bundle_type": "Single Task Block",
                "total_priority_cleared": 0.0,
                "max_defect_duration": 0.0,
                "total_defect_duration": 0.0,
                "duration_utilization_pct": 0.0,
            }
        ]
    ).to_csv(optimized_dir / "monthly_schedule.csv", index=False)

    pd.DataFrame([], columns=["defect_id", "section_id", "urgency_band", "estimated_duration_hours"]).to_csv(
        optimized_dir / "unscheduled_monthly_defects.csv",
        index=False,
    )

    try:
        yield TestClient(api.app)
    finally:
        api.CRIS_PENDING_DB_PATH = old_pending_path
        api.DATA_DIR = old_data_dir
        api.OPTIMIZED_DIR = old_optimized_dir
        os.environ["CRIS_PENDING_DB_PATH"] = str(old_pending_path)


VALID_PAYLOAD = {
    "defect_id": "TMS-CRIS-101",
    "department": "Engineering",
    "location": "SEC-01 / km 4.9 (CNB–CNBI Up)",
    "section_id": "SEC-01",
    "section_name": "Kanpur Central – Bindki Road",
    "defect_type": "Rail fracture (suspect)",
    "severity": "High",
    "overdue_days": 3,
    "estimated_duration_hours": 4.0,
    "criticality_score": 9,
    "asset_impact": "High",
    "description": "CRIS simulated defect for runtime validation and re-optimization.",
    "source_system": "TMS",
}


VALID_PAYLOAD = {
    "defect_id": "TMS-CRIS-101",
    "department": "Engineering",
    "location": "SEC-01 / km 4.9 (CNB–CNBI Up)",
    "section_id": "SEC-01",
    "section_name": "Kanpur Central – Bindki Road",
    "defect_type": "Rail fracture (suspect)",
    "severity": "High",
    "overdue_days": 3,
    "estimated_duration_hours": 4.0,
    "criticality_score": 9,
    "asset_impact": "High",
    "description": "CRIS simulated defect for runtime validation and re-optimization.",
    "source_system": "TMS",
}


def test_ingest_defect_creates_pending_reoptimization_record(client: TestClient) -> None:
    response = client.post("/defects/ingest", json=VALID_PAYLOAD)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["defect_id"] == VALID_PAYLOAD["defect_id"]
    assert body["status"] == "PENDING_REOPTIMIZATION"

    pending = client.get("/defects/pending")
    assert pending.status_code == 200, pending.text
    rows = pending.json()
    assert len(rows) == 1
    assert rows[0]["defect_id"] == VALID_PAYLOAD["defect_id"]
    assert rows[0]["status"] == "PENDING_REOPTIMIZATION"


def test_ingest_defect_is_idempotent_for_same_payload(client: TestClient) -> None:
    first = client.post("/defects/ingest", json=VALID_PAYLOAD)
    second = client.post("/defects/ingest", json=VALID_PAYLOAD)

    assert first.status_code == 201, first.text
    assert second.status_code == 200, second.text
    assert second.json()["duplicate"] is True

    pending = client.get("/defects/pending")
    assert pending.status_code == 200, pending.text
    assert len(pending.json()) == 1


def test_ingest_defect_rejects_malformed_payload(client: TestClient) -> None:
    defect_file = api.DATA_DIR / "prioritized_defects.csv"
    payload_count_before = len(pd.read_csv(defect_file)) if defect_file.exists() else 0

    response = client.post("/defects/ingest", json={"defect_id": "BAD-ONLY"})

    assert response.status_code == 400, response.text
    assert "department" in response.text

    payload_count_after = len(pd.read_csv(defect_file)) if defect_file.exists() else 0
    assert payload_count_after == payload_count_before
    assert "BAD-ONLY" not in pd.read_csv(defect_file)["defect_id"].astype(str).tolist()


def test_ingest_defect_accepts_multiple_pending_rows(client: TestClient) -> None:
    payload_1 = {**VALID_PAYLOAD, "defect_id": "TMS-CRIS-201"}
    payload_2 = {**VALID_PAYLOAD, "defect_id": "TMS-CRIS-202"}

    first = client.post("/defects/ingest", json=payload_1)
    second = client.post("/defects/ingest", json=payload_2)

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text

    pending = client.get("/defects/pending")
    assert pending.status_code == 200, pending.text
    assert len(pending.json()) == 2


def test_ingest_defect_with_compatible_slot_schedules_immediately(client: TestClient) -> None:
    payload = {
        **VALID_PAYLOAD,
        "defect_id": "TMS-CRIS-300",
        "estimated_duration_hours": 1.5,
        "description": "Fits a partially used slot and should schedule immediately.",
    }

    response = client.post("/defects/ingest", json=payload)
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["status"] == "SCHEDULED"
    assert body["slot_id"] == "TEST-WEEKLY-SEC01-01"
    assert body["horizon"] == "weekly"

    weekly_schedule = pd.read_csv(api.OPTIMIZED_DIR / "weekly_schedule.csv")
    assigned = weekly_schedule.loc[weekly_schedule["slot_id"] == "TEST-WEEKLY-SEC01-01", "assigned_defect_ids"].iloc[0]
    assert payload["defect_id"] in str(assigned)

    pending = client.get("/defects/pending")
    assert pending.status_code == 200, pending.text
    assert all(row["defect_id"] != payload["defect_id"] for row in pending.json())

    with sqlite3.connect(api.CRIS_PENDING_DB_PATH) as conn:
        events = conn.execute(
            "SELECT event_type, defect_id, slot_id, horizon FROM system_events WHERE defect_id = ?",
            (payload["defect_id"],),
        ).fetchall()
    assert len(events) == 1
    assert events[0][0] == "SYSTEM_INCREMENTAL_INSERT"
    assert events[0][1] == payload["defect_id"]
    assert events[0][2] == "TEST-WEEKLY-SEC01-01"
    assert events[0][3] == "weekly"
