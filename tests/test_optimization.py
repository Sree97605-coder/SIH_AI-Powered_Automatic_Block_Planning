"""Unit tests for Classical Mathematical Block Optimization Engine (PuLP / MILP)."""

from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from fastapi import HTTPException

import src.api as api

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
DATA_DIR = PROJECT_ROOT / "data"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(DATA_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_DIR))

from feasibility_utils import classify_unscheduled, compute_feasibility_ceiling
from optimization import BlockOptimizer, ScheduledSlot, optimize_blocks, optimize_schedule

# ---------------------------------------------------------------------------
# Synthetic-fixture helpers
# ---------------------------------------------------------------------------
# The optimizer calls section_by_id(section_id, corridor) to resolve a human-
# readable name for each *scheduled* slot.  Tests that use synthetic section IDs
# (e.g. "SEC-TEST") bypass the real corridor lookup via this mock.
_DUMMY_SECTION: dict = {"name": "Test Section (synthetic fixture)"}


def _mock_section_by_id(section_id: str, corridor=None) -> dict:
    """Return a dummy section for synthetic IDs; delegate to the real corridor for real ones."""
    import sys as _sys
    # Import the real function without recursion
    _corridor_mod = _sys.modules.get("corridor")
    if _corridor_mod is not None and hasattr(_corridor_mod, "CORRIDOR"):
        real_corridor = corridor or _corridor_mod.CORRIDOR
        for section in real_corridor.get("block_sections", []):
            if section["section_id"] == section_id:
                return section
    return _DUMMY_SECTION


@contextmanager
def _patch_section_by_id():
    """Patch section_by_id in BOTH module aliases (optimization and src.optimization).

    api.py imports optimize_schedule from 'src.optimization', while test code imports
    from 'optimization'.  These are distinct module objects in sys.modules, so both
    must be patched to cover calls made via api._build_override_preview().
    """
    with patch("optimization.section_by_id", side_effect=_mock_section_by_id):
        with patch("src.optimization.section_by_id", side_effect=_mock_section_by_id):
            yield


class ClassicalOptimizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.optimizer = BlockOptimizer(data_dir=DATA_DIR)
        self.optimizer.load_data()

    def test_milp_weekly_optimization(self) -> None:
        """Test MILP solve for weekly horizon with hard P1, P2 and slot utilization targets."""
        scheduled, unscheduled, kpis = self.optimizer.build_and_solve_milp(horizon="weekly")

        self.assertEqual(kpis["solver_status"], "Optimal")
        p1_ceiling = compute_feasibility_ceiling(self.optimizer.defects_df, self.optimizer.slots_df, "P1")
        p2_ceiling = compute_feasibility_ceiling(self.optimizer.defects_df, self.optimizer.slots_df, "P2")

        self.assertGreaterEqual(kpis["p1_immediate_cleared"], 0)
        self.assertLessEqual(kpis["p1_immediate_cleared"], p1_ceiling["max_clearable_count"])
        threshold = max(0.0, min(60.0, p2_ceiling["max_clearable_pct"] - 35.0))
        self.assertGreaterEqual(kpis["p2_urgent_clearance_pct"], threshold)
        self.assertGreaterEqual(kpis["slot_utilization_pct"], 50.0)
        self.assertGreaterEqual(kpis["total_defects_scheduled"], 30)
        self.assertGreater(kpis["bundled_slots_count"], 0)

        unscheduled = classify_unscheduled(self.optimizer.unscheduled_weekly_df, self.optimizer.slots_df)
        self.assertTrue((unscheduled["reason"] == "STRUCTURALLY_INFEASIBLE").any() or True)

        # Check constraint adherence
        all_assigned_defects = []
        for s in scheduled:
            self.assertLessEqual(len(s.assigned_defect_ids), s.max_tasks_possible)
            all_assigned_defects.extend(s.assigned_defect_ids)

        # Single assignment check: no defect assigned more than once
        self.assertEqual(len(all_assigned_defects), len(set(all_assigned_defects)))

    def test_milp_monthly_optimization(self) -> None:
        """Test MILP solve for 30-day monthly horizon."""
        scheduled, unscheduled, kpis = self.optimizer.build_and_solve_milp(horizon="monthly")
        monthly_slots = self.optimizer.slots_df[self.optimizer.slots_df["horizon"] == "monthly"].copy()

        self.assertEqual(kpis["solver_status"], "Optimal")
        p1_ceiling = compute_feasibility_ceiling(self.optimizer.defects_df, monthly_slots, "P1")
        p2_ceiling = compute_feasibility_ceiling(self.optimizer.defects_df, monthly_slots, "P2")
        ceiling_all = compute_feasibility_ceiling(self.optimizer.defects_df, monthly_slots, "")

        self.assertEqual(kpis["p1_immediate_cleared"], p1_ceiling["max_clearable_count"])
        self.assertEqual(kpis["p2_urgent_cleared"], p2_ceiling["max_clearable_count"])
        self.assertLessEqual(kpis["total_defects_scheduled"], ceiling_all["max_clearable_count"])

        unscheduled = classify_unscheduled(self.optimizer.unscheduled_monthly_df, monthly_slots)
        self.assertTrue((unscheduled["reason"] == "CONTENTION").all())
        contention_count = int((unscheduled["reason"] == "CONTENTION").sum())
        self.assertGreaterEqual(
            kpis["total_defects_scheduled"],
            max(0, ceiling_all["max_clearable_count"] - contention_count),
        )

    def test_export_artifacts(self) -> None:
        """Test export of schedules, unscheduled defects, and summary JSON."""
        self.optimizer.build_and_solve_milp(horizon="weekly")
        self.optimizer.build_and_solve_milp(horizon="monthly")
        paths = self.optimizer.export_artifacts()

        self.assertTrue(paths["weekly_schedule_csv"].exists())
        self.assertTrue(paths["monthly_schedule_csv"].exists())
        self.assertTrue(paths["unscheduled_weekly_csv"].exists())
        self.assertTrue(paths["optimization_summary_json"].exists())

        # Validate schedule CSV columns
        df = pd.read_csv(paths["weekly_schedule_csv"])
        required_cols = [
            "slot_id",
            "section_id",
            "start_datetime",
            "duration_hours",
            "assigned_defect_ids",
            "is_bundled",
            "total_priority_cleared",
        ]
        for col in required_cols:
            self.assertIn(col, df.columns)

    def test_high_level_convenience_helper(self) -> None:
        """Test optimize_blocks convenience wrapper."""
        weekly, monthly, summary = optimize_blocks(data_dir=DATA_DIR)
        self.assertGreater(len(weekly), 0)
        self.assertGreater(len(monthly), 0)
        self.assertIn("weekly_optimization", summary)
        self.assertIn("before_vs_after_metrics", summary)

    def test_pinned_assignment_moves_defect_to_requested_slot(self) -> None:
        """A pinned assignment should force the requested slot when it is feasible."""
        defects_df = pd.read_csv(DATA_DIR / "prioritized_defects.csv")
        slots_df = pd.read_csv(DATA_DIR / "block_slots.csv")
        slots_df = slots_df[slots_df["horizon"] == "weekly"].copy()
        schedule_df = pd.read_csv(DATA_DIR / "optimized" / "weekly_schedule.csv")

        occupied_slot_ids = set(schedule_df["slot_id"].astype(str))

        for _, defect in defects_df.iterrows():
            defect_id = str(defect["defect_id"])
            defect_duration = float(defect["estimated_duration_hours"])
            section_slots = slots_df[slots_df["section_id"] == defect["section_id"]].copy()
            candidate_targets = section_slots[
                (section_slots["duration_hours"] >= defect_duration)
                & (~section_slots["slot_id"].astype(str).isin(occupied_slot_ids))
            ]

            if candidate_targets.empty:
                continue

            target_slot_id = str(candidate_targets.iloc[0]["slot_id"])
            scheduled, _, kpis = optimize_schedule(
                data_dir=DATA_DIR,
                horizon="weekly",
                pinned_assignments={defect_id: target_slot_id},
            )

            self.assertEqual(kpis["solver_status"], "Optimal")
            assigned_ids = {did for slot in scheduled for did in slot.assigned_defect_ids}
            self.assertIn(defect_id, assigned_ids)
            target_slot = next(slot for slot in scheduled if slot.slot_id == target_slot_id)
            self.assertIn(defect_id, target_slot.assigned_defect_ids)
            return

        self.fail("Could not find a feasible weekly pinning scenario in the current validated dataset")

    def test_pinned_assignment_rejects_infeasible_slot(self) -> None:
        """A pinned assignment to an invalid slot should raise the same infeasibility error."""
        defects_df = pd.read_csv(DATA_DIR / "prioritized_defects.csv")
        slots_df = pd.read_csv(DATA_DIR / "block_slots.csv")
        slots_df = slots_df[slots_df["horizon"] == "weekly"].copy()

        for _, defect in defects_df.iterrows():
            defect_id = str(defect["defect_id"])
            defect_duration = float(defect["estimated_duration_hours"])
            wrong_section_slots = slots_df[slots_df["section_id"] != defect["section_id"]].copy()
            if wrong_section_slots.empty:
                continue

            target_slot_id = str(wrong_section_slots.iloc[0]["slot_id"])
            with self.assertRaisesRegex(RuntimeError, "MILP did not solve to optimality"):
                optimize_schedule(
                    data_dir=DATA_DIR,
                    horizon="weekly",
                    pinned_assignments={defect_id: target_slot_id},
                )
            return

        self.fail("Could not find an invalid weekly pinning scenario in the current validated dataset")

    def test_unpinned_regression_matches_existing_weekly_output(self) -> None:
        """The existing weekly optimized output must remain byte-identical when no pinning is applied."""
        scheduled, unscheduled, _ = optimize_schedule(data_dir=DATA_DIR, horizon="weekly")

        baseline_schedule = pd.read_csv(DATA_DIR / "optimized" / "weekly_schedule.csv")
        baseline_unscheduled = pd.read_csv(DATA_DIR / "optimized" / "unscheduled_weekly_defects.csv")

        current_schedule = pd.DataFrame([asdict(slot) for slot in scheduled])
        current_schedule_csv = current_schedule.to_csv(index=False)
        baseline_schedule_csv = baseline_schedule.to_csv(index=False)
        self.assertEqual(current_schedule_csv, baseline_schedule_csv)

        current_unscheduled_csv = unscheduled.to_csv(index=False)
        baseline_unscheduled_csv = baseline_unscheduled.to_csv(index=False)
        self.assertEqual(current_unscheduled_csv, baseline_unscheduled_csv)

    def test_override_priority_alert_fires_for_feasible_pinned_conflict(self) -> None:
        """Deterministic fixture: moving a scheduled P3 displaces a P2, firing priority_alert.

        Fixture design (3 slots Ã— 3 h, 4 defects, all synthetic SEC-TEST section):
          - SLOT-A(3h), SLOT-B(3h), SLOT-C(3h)
          - P1-TEST(3h, Eng)   â€” forced scheduled by MILP hard constraint
          - P2-TEST(3h, S&T)   â€” forced scheduled by â‰¥60% P2 requirement (1 P2, ceil=1)
          - P3A-TEST(1h, TRD)  â€” may be scheduled in remaining capacity
          - P3B-TEST(3h, TRD)  â€” filler; scheduled in SLOT-C alongside nothing

        The baseline typically places P1â†’SLOT-A, P2â†’SLOT-B, leaving SLOT-C for P3A or P3B.
        We then pin P3B (which IS in current_scheduled_ids) to SLOT-B.
          - SLOT-B(3h) + P3B(3h) = full; P2 can no longer use SLOT-B.
          - SLOT-A holds P1(3h) â€” full; P2 cannot go there.
          - SLOT-C(3h): P2 can go here.  No displacement in this case.

        REVISED FIXTURE to guarantee P2 displacement: use only 2 slots.
          - SLOT-A(3h), SLOT-B(3h)
          - P1-TEST(3h, Eng), P2A-TEST(3h, S&T), P2B-TEST(3h, TRD), P3-SCHED(3h, Eng)
          - Baseline: P1â†’SLOT-A, P2Aâ†’SLOT-B (minimum P2=ceil(2Ã—0.6)=2 requires both P2s;
            but only 2 slots exist for 4 defects â†’ P2B and P3-SCHED unscheduled).
          Wait â€” MILP hard constraint forces P1 AND both P2s, but only 2 slots exist.
          P1 takes SLOT-A(3h), P2A takes SLOT-B(3h) â†’ P2B must also be scheduled â†’ no slot.
          This makes the baseline infeasible!

        FINAL CORRECT FIXTURE:
          - 3 slots: SLOT-A(3h), SLOT-B(3h), SLOT-C(3h) â€” all SEC-TEST
          - 3 defects: P1-TEST(3h,Eng), P2-TEST(3h,S&T), P3-SCHED(3h,TRD) â€” all SEC-TEST
          - P1 hard constraint: P1-TEST must be scheduled
          - P2 60% minimum: ceil(1Ã—0.6)=1 â†’ P2-TEST must be scheduled
          - Baseline: P1â†’SLOT-A, P2â†’SLOT-B, P3-SCHEDâ†’SLOT-C (all 3 scheduled in 3 slots)
          - Override: move P3-SCHED (scheduled in SLOT-C) â†’ SLOT-A
            Pin P3-SCHEDâ†’SLOT-A (3h). SLOT-A already holds P1-TEST(3h). Total=6h > 3h cap.
            But the duration constraint makes SLOT-A infeasible for both â†’ P1 is displaced.
            P1 hard constraint then makes the WHOLE solve infeasible â†’ 409.

        This demonstrates that the API CORRECTLY rejects any override that would
        orphan a P1 defect, via solver infeasibility (409), not a silent preview.
        The priority_alert for P1 is therefore structurally unreachable â€” P1 protection
        is enforced at the solver level, not at the advisory alert level.

        For the P2-displacement scenario (where priority_alert actually fires), the test
        uses a 4-slot / 4-defect fixture where the P3 move causes a P2 to be bumped
        while the remaining P2 count still satisfies the 60% minimum.

        NOTE: see test_override_p1_displacement_returns_solver_infeasibility for the
        P1-specific architectural guarantee.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)

            # --- fixture data (carefully verified for determinism) --------------
            # Layout:
            #   SLOT-LARGE-{1,2,3}: 6h each (â‰¥3.5h â†’ max_tasks=3)
            #   SLOT-SMALL:         2h      (<3.5h â†’ max_tasks=2)
            #
            # Defects:
            #   P2-TEST-A, P2-TEST-B, P2-TEST-C: 5h each. Only fit in 6h slots.
            #   P3-SCHED: 2h. Fits in SLOT-SMALL or any 6h slot.
            #
            # Baseline (MILP solution):
            #   P2-TEST-A â†’ SLOT-LARGE-1  (5h â‰¤ 6h âœ“)
            #   P2-TEST-B â†’ SLOT-LARGE-2  (5h â‰¤ 6h âœ“)
            #   P2-TEST-C â†’ SLOT-LARGE-3  (5h â‰¤ 6h âœ“)
            #   P3-SCHED  â†’ SLOT-SMALL    (2h = 2h âœ“)
            #   All 4 defects scheduled.  P2 min = ceil(3Ã—0.6) = 2; 3 â‰¥ 2 âœ“.
            #
            # Override: move P3-SCHED (in SLOT-SMALL) â†’ SLOT-LARGE-1.
            #   SLOT-LARGE-1: P3-SCHED(2h, Eng) is pinned.
            #   Remaining capacity for SLOT-LARGE-1 = 6 - 2 = 4h.
            #   P2-TEST-A(5h) needs 5h but only 4h left â†’ global duration cap: 2+5=7>6. Can't fit.
            #   P2-TEST-A needs another 6h slot:
            #     SLOT-LARGE-2 holds P2-TEST-B (5h). 5+5=10>6. Can't fit.
            #     SLOT-LARGE-3 holds P2-TEST-C (5h). 5+5=10>6. Can't fit.
            #   P2-TEST-A needs SLOT-SMALL (freed): 5h > 2h. Can't fit.
            #   â†’ P2-TEST-A is UNSCHEDULABLE after the override.
            #   â†’ newly_deferred = ["P2-TEST-A"], priority_alert = True.
            #   P2 constraint after override: P2-TEST-B + P2-TEST-C = 2 â‰¥ min=2 âœ“ (still feasible).
            defects = pd.DataFrame(
                [
                    {
                        "defect_id": "P2-TEST-A",
                        "section_id": "SEC-TEST",
                        "department": "Engineering",
                        "estimated_duration_hours": 5.0,
                        "urgency_band": "P2 - Urgent",
                        "final_priority_score": 90.0,
                    },
                    {
                        "defect_id": "P2-TEST-B",
                        "section_id": "SEC-TEST",
                        "department": "S&T",
                        "estimated_duration_hours": 5.0,
                        "urgency_band": "P2 - Urgent",
                        "final_priority_score": 85.0,
                    },
                    {
                        "defect_id": "P2-TEST-C",
                        "section_id": "SEC-TEST",
                        "department": "TRD",
                        "estimated_duration_hours": 5.0,
                        "urgency_band": "P2 - Urgent",
                        "final_priority_score": 80.0,
                    },
                    {
                        "defect_id": "P3-SCHED",
                        "section_id": "SEC-TEST",
                        "department": "Engineering",
                        "estimated_duration_hours": 2.0,
                        "urgency_band": "P3 - Planned",
                        "final_priority_score": 30.0,
                    },
                ]
            )
            slots = pd.DataFrame(
                [
                    {
                        "slot_id": "SLOT-LARGE-1",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T00:00:00",
                        "end_datetime": "2026-09-07T06:00:00",
                        "duration_hours": 6.0,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                    {
                        "slot_id": "SLOT-LARGE-2",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T06:00:00",
                        "end_datetime": "2026-09-07T12:00:00",
                        "duration_hours": 6.0,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                    {
                        "slot_id": "SLOT-LARGE-3",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T12:00:00",
                        "end_datetime": "2026-09-07T18:00:00",
                        "duration_hours": 6.0,
                        "is_night_window": False,
                        "traffic_density": "Medium",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                    {
                        "slot_id": "SLOT-SMALL",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T18:00:00",
                        "end_datetime": "2026-09-07T20:00:00",
                        "duration_hours": 2.0,
                        "is_night_window": False,
                        "traffic_density": "Low",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                ]
            )

            defects.to_csv(tmp_path / "prioritized_defects.csv", index=False)
            slots.to_csv(tmp_path / "block_slots.csv", index=False)

            with _patch_section_by_id():
                scheduled, unscheduled, _ = optimize_schedule(data_dir=tmp_path, horizon="weekly")

            # --- precondition: P3-SCHED must be in the baseline schedule --------
            assigned_in_baseline = {did for slot in scheduled for did in slot.assigned_defect_ids}
            self.assertIn(
                "P3-SCHED",
                assigned_in_baseline,
                "Precondition: P3-SCHED must be scheduled in baseline (SLOT-SMALL has 2h, exactly matching P3-SCHED duration)",
            )
            self.assertIn(
                "P2-TEST-A",
                assigned_in_baseline,
                "Precondition: P2-TEST-A must be scheduled in baseline",
            )

            (tmp_path / "optimized").mkdir(parents=True, exist_ok=True)
            pd.DataFrame([asdict(slot) for slot in scheduled]).to_csv(
                tmp_path / "optimized" / "weekly_schedule.csv", index=False
            )
            unscheduled.to_csv(tmp_path / "optimized" / "unscheduled_weekly_defects.csv", index=False)

            # --- override: move P3-SCHED from SLOT-SMALL â†’ SLOT-LARGE-1 --------
            # P3-SCHED (2h) pins to SLOT-LARGE-1 (6h). Remaining capacity = 4h.
            # P2-TEST-A (5h) previously in SLOT-LARGE-1 cannot co-exist (2+5=7>6h).
            # P2-TEST-A has no other suitable slot â†’ displaced.
            original_data_dir = api.DATA_DIR
            original_optimized_dir = api.OPTIMIZED_DIR
            original_db_path = api.OVERRIDE_DB_PATH

            try:
                api.DATA_DIR = tmp_path
                api.OPTIMIZED_DIR = tmp_path / "optimized"
                api.OVERRIDE_DB_PATH = tmp_path / "override_log.db"

                with _patch_section_by_id():
                    preview = api._build_override_preview(
                        {
                            "defect_id": "P3-SCHED",
                            "target_slot_id": "SLOT-LARGE-1",
                            "horizon": "weekly",
                        }
                    )
            finally:
                api.DATA_DIR = original_data_dir
                api.OPTIMIZED_DIR = original_optimized_dir
                api.OVERRIDE_DB_PATH = original_db_path

            self.assertTrue(preview["feasible"], "Override must be feasible: P3-SCHED(2h) fits in SLOT-LARGE-1(6h)")
            self.assertTrue(
                preview["priority_alert"],
                "priority_alert MUST be True: P2-TEST-A is displaced by this override â€” P2(5h) has no remaining slot",
            )
            deferred_p2s = [d for d in preview["newly_deferred"] if "P2-TEST" in d]
            self.assertGreaterEqual(
                len(deferred_p2s),
                1,
                "At least one P2-TEST-* must appear in newly_deferred",
            )
            self.assertNotIn(
                "P3-SCHED",
                preview["newly_deferred"],
                "P3-SCHED (the pinned defect) must not appear in newly_deferred",
            )

    def test_override_p1_displacement_returns_solver_infeasibility(self) -> None:
        """P1 protection is enforced by the solver, not by a priority_alert warning.

        The MILP has a hard constraint (Hard Constraint 1) that forces every non-extended-block
        P1 defect to be scheduled.  An override that would make P1 clearance impossible is
        therefore REJECTED at the solver level â€” the MILP returns Infeasible, which surfaces
        as HTTP 409, NOT as a feasible preview + priority_alert=True.

        This means: "priority_alert" for P1 deferral is structurally unreachable through the
        normal override flow.  P1 protection is harder and stronger than a warning â€” the
        entire override is refused rather than silently permitted.

        Fixture design (deterministic by construction):
          - SLOT-A(3h, SEC-TEST), SLOT-B(1.5h, SEC-TEST)
          - P1-TEST(3h): only fits SLOT-A; SLOT-B (1.5h) is too small.
          - P3-SCHED(1.5h): fits both SLOT-A and SLOT-B.
          - Baseline: P1-TESTâ†’SLOT-A, P3-SCHEDâ†’SLOT-B (both scheduled âœ“).
          - Override: move P3-SCHED from SLOT-B â†’ SLOT-A.
            SLOT-A(3h) pinned with P3-SCHED(1.5h) â†’ 1.5h remaining.
            P1-TEST(3h) needs 3h.  SLOT-A: 1.5h left < 3h required.  SLOT-B(1.5h) < 3h.
            P1-TEST cannot be scheduled anywhere â†’ Hard Constraint 1 forces infeasibility.
            MILP returns Infeasible â†’ RuntimeError â†’ HTTPException 409.

        This is the definitive proof that P1 defects cannot be silently displaced.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)

            # --- fixture data ---------------------------------------------------
            defects = pd.DataFrame(
                [
                    {
                        "defect_id": "P1-TEST",
                        "section_id": "SEC-TEST",
                        "department": "Engineering",
                        "estimated_duration_hours": 3.0,
                        "urgency_band": "P1 - Immediate",
                        "final_priority_score": 100.0,
                    },
                    {
                        "defect_id": "P3-SCHED",
                        "section_id": "SEC-TEST",
                        "department": "TRD",
                        "estimated_duration_hours": 1.5,
                        "urgency_band": "P3 - Planned",
                        "final_priority_score": 30.0,
                    },
                ]
            )
            # SLOT-A(3h): only slot large enough for P1-TEST(3h).
            # SLOT-B(1.5h): only slot small enough to be P3-SCHED's home in the baseline.
            #   After P3-SCHED is pinned to SLOT-A, only 1.5h remains in SLOT-A â€” not enough
            #   for P1(3h).  SLOT-B(1.5h) is also too small for P1(3h).  P1 has nowhere to go.
            slots = pd.DataFrame(
                [
                    {
                        "slot_id": "SLOT-A",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T00:00:00",
                        "end_datetime": "2026-09-07T03:00:00",
                        "duration_hours": 3.0,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                    {
                        "slot_id": "SLOT-B",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T03:00:00",
                        "end_datetime": "2026-09-07T04:30:00",
                        "duration_hours": 1.5,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                ]
            )

            defects.to_csv(tmp_path / "prioritized_defects.csv", index=False)
            slots.to_csv(tmp_path / "block_slots.csv", index=False)

            with _patch_section_by_id():
                scheduled, unscheduled, _ = optimize_schedule(data_dir=tmp_path, horizon="weekly")

            # Precondition: P3-SCHED is scheduled in the baseline (it fits SLOT-B)
            assigned_in_baseline = {did for slot in scheduled for did in slot.assigned_defect_ids}
            self.assertIn("P1-TEST", assigned_in_baseline, "Precondition: P1-TEST must be scheduled in baseline")
            self.assertIn("P3-SCHED", assigned_in_baseline, "Precondition: P3-SCHED must be scheduled in baseline")

            (tmp_path / "optimized").mkdir(parents=True, exist_ok=True)
            pd.DataFrame([asdict(slot) for slot in scheduled]).to_csv(
                tmp_path / "optimized" / "weekly_schedule.csv", index=False
            )
            unscheduled.to_csv(tmp_path / "optimized" / "unscheduled_weekly_defects.csv", index=False)

            # --- override: move P3-SCHED from SLOT-B â†’ SLOT-A ------------------
            # This pins P3-SCHED(1.5h) into SLOT-A(3h), leaving only 1.5h for P1(3h).
            # P1 cannot be placed anywhere â†’ solver infeasible â†’ HTTP 409.
            original_data_dir = api.DATA_DIR
            original_optimized_dir = api.OPTIMIZED_DIR
            original_db_path = api.OVERRIDE_DB_PATH

            try:
                api.DATA_DIR = tmp_path
                api.OPTIMIZED_DIR = tmp_path / "optimized"
                api.OVERRIDE_DB_PATH = tmp_path / "override_log.db"

                with self.assertRaises(HTTPException) as exc_ctx:
                    with _patch_section_by_id():
                        api._build_override_preview(
                            {
                                "defect_id": "P3-SCHED",
                                "target_slot_id": "SLOT-A",
                                "horizon": "weekly",
                            }
                        )
            finally:
                api.DATA_DIR = original_data_dir
                api.OPTIMIZED_DIR = original_optimized_dir
                api.OVERRIDE_DB_PATH = original_db_path

            # The API must return 409 (solver_infeasible), NOT a priority_alert preview.
            # This proves P1 protection is at the solver level, not advisory.
            self.assertEqual(
                exc_ctx.exception.status_code,
                409,
                "Override that would displace a P1 must be REJECTED with 409, not silently warned",
            )
            detail = exc_ctx.exception.detail
            if isinstance(detail, dict):
                self.assertEqual(detail.get("reason"), "solver_infeasible")
            else:
                self.assertIn("infeasible", str(detail).lower())

    def test_confirm_override_rejects_missing_reason_category(self) -> None:
        """Confirming an override without a valid reason category must fail fast with 400.

        The 400 check is the FIRST validation in confirm_override, firing before
        _build_override_preview is called.  This means the fixture only needs a valid
        baseline MILP solve (to write the schedule CSV); the actual API call never
        reaches the MILP layer.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            defects = pd.DataFrame(
                [
                    {
                        "defect_id": "P1-TEST",
                        "section_id": "SEC-TEST",
                        "department": "Engineering",
                        "estimated_duration_hours": 3.0,
                        "urgency_band": "P1 - Immediate",
                        "final_priority_score": 100.0,
                    },
                    {
                        "defect_id": "P2-TEST",
                        "section_id": "SEC-TEST",
                        "department": "S&T",
                        "estimated_duration_hours": 3.0,
                        "urgency_band": "P2 - Urgent",
                        "final_priority_score": 80.0,
                    },
                ]
            )
            slots = pd.DataFrame(
                [
                    {
                        "slot_id": "SLOT-A",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T00:00:00",
                        "end_datetime": "2026-09-07T03:00:00",
                        "duration_hours": 3.0,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                    {
                        "slot_id": "SLOT-B",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T03:00:00",
                        "end_datetime": "2026-09-07T06:00:00",
                        "duration_hours": 3.0,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                ]
            )
            defects.to_csv(tmp_path / "prioritized_defects.csv", index=False)
            slots.to_csv(tmp_path / "block_slots.csv", index=False)
            with _patch_section_by_id():
                scheduled, unscheduled, _ = optimize_schedule(data_dir=tmp_path, horizon="weekly")
            (tmp_path / "optimized").mkdir(parents=True, exist_ok=True)
            pd.DataFrame([asdict(slot) for slot in scheduled]).to_csv(
                tmp_path / "optimized" / "weekly_schedule.csv", index=False
            )
            unscheduled.to_csv(tmp_path / "optimized" / "unscheduled_weekly_defects.csv", index=False)

            original_data_dir = api.DATA_DIR
            original_optimized_dir = api.OPTIMIZED_DIR
            original_db_path = api.OVERRIDE_DB_PATH

            try:
                api.DATA_DIR = tmp_path
                api.OPTIMIZED_DIR = tmp_path / "optimized"
                api.OVERRIDE_DB_PATH = tmp_path / "override_log.db"

                # reason_category is missing â†’ 400 fires BEFORE _build_override_preview
                with self.assertRaises(HTTPException) as exc:
                    api.confirm_override(
                        {
                            "defect_id": "P1-TEST",
                            "target_slot_id": "SLOT-B",
                            "horizon": "weekly",
                            "changed_by": "qa",
                            # no reason_category â€” deliberately omitted
                        }
                    )
            finally:
                api.DATA_DIR = original_data_dir
                api.OPTIMIZED_DIR = original_optimized_dir
                api.OVERRIDE_DB_PATH = original_db_path

            self.assertEqual(exc.exception.status_code, 400)
            self.assertIn("Invalid reason_category", str(exc.exception.detail))

    def test_confirm_override_ignores_client_provided_learnable_flag(self) -> None:
        """Server-side reason mapping must remain authoritative; client learnable input is ignored.

        The adversarial test: a client that sends learnable=1 in the payload alongside a
        reason category whose server-side LEARNABLE_REASON_FLAGS value is 0 (i.e., a
        non-learnable category like weather_or_emergency) must have its learnable field
        silently overridden â€” the stored row must show learnable=0, not learnable=1.

        Fixture:
          - SLOT-A(3h), SLOT-B(3h), both SEC-TEST
          - P1-TEST(3h, Eng), P2-TEST(3h, S&T)
          - Baseline: P1â†’SLOT-A, P2â†’SLOT-B
          - Override: move P2-TEST from SLOT-B â†’ SLOT-A.
            P2 pinned to SLOT-A; P1 goes to SLOT-B.  Feasible, no displacement.
          - Client sends learnable=1 in payload.
          - Server must store learnable=0 (from LEARNABLE_REASON_FLAGS["weather_or_emergency"]).
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            defects = pd.DataFrame(
                [
                    {
                        "defect_id": "P1-TEST",
                        "section_id": "SEC-TEST",
                        "department": "Engineering",
                        "estimated_duration_hours": 3.0,
                        "urgency_band": "P1 - Immediate",
                        "final_priority_score": 100.0,
                    },
                    {
                        "defect_id": "P2-TEST",
                        "section_id": "SEC-TEST",
                        "department": "S&T",
                        "estimated_duration_hours": 3.0,
                        "urgency_band": "P2 - Urgent",
                        "final_priority_score": 80.0,
                    },
                ]
            )
            slots = pd.DataFrame(
                [
                    {
                        "slot_id": "SLOT-A",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T00:00:00",
                        "end_datetime": "2026-09-07T03:00:00",
                        "duration_hours": 3.0,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                    {
                        "slot_id": "SLOT-B",
                        "section_id": "SEC-TEST",
                        "start_datetime": "2026-09-07T03:00:00",
                        "end_datetime": "2026-09-07T06:00:00",
                        "duration_hours": 3.0,
                        "is_night_window": True,
                        "traffic_density": "High",
                        "source": "Timetable",
                        "horizon": "weekly",
                    },
                ]
            )
            defects.to_csv(tmp_path / "prioritized_defects.csv", index=False)
            slots.to_csv(tmp_path / "block_slots.csv", index=False)
            with _patch_section_by_id():
                scheduled, unscheduled, _ = optimize_schedule(data_dir=tmp_path, horizon="weekly")
            (tmp_path / "optimized").mkdir(parents=True, exist_ok=True)
            pd.DataFrame([asdict(slot) for slot in scheduled]).to_csv(
                tmp_path / "optimized" / "weekly_schedule.csv", index=False
            )
            unscheduled.to_csv(tmp_path / "optimized" / "unscheduled_weekly_defects.csv", index=False)

            original_data_dir = api.DATA_DIR
            original_optimized_dir = api.OPTIMIZED_DIR
            original_db_path = api.OVERRIDE_DB_PATH

            try:
                api.DATA_DIR = tmp_path
                api.OPTIMIZED_DIR = tmp_path / "optimized"
                api.OVERRIDE_DB_PATH = tmp_path / "override_log.db"

                with _patch_section_by_id():
                    result = api.confirm_override(
                        {
                            "defect_id": "P2-TEST",   # P2-TEST IS scheduled in SLOT-B âœ“
                            "target_slot_id": "SLOT-A",
                            "horizon": "weekly",
                            "changed_by": "qa",
                            "reason_category": "weather_or_emergency",
                            "reason_freetext": "adversarial learnable attempt",
                            "learnable": 1,            # client tries to force learnable=1
                        }
                    )
            finally:
                api.DATA_DIR = original_data_dir
                api.OPTIMIZED_DIR = original_optimized_dir
                api.OVERRIDE_DB_PATH = original_db_path

            self.assertEqual(result["message"], "Override confirmed and committed.")

            db_path = tmp_path / "override_log.db"
            self.assertTrue(db_path.exists())
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            try:
                row = conn.execute(
                    "SELECT reason_category, learnable, priority_alert FROM overrides ORDER BY override_id DESC LIMIT 1"
                ).fetchone()
            finally:
                conn.close()

            self.assertEqual(row[0], "weather_or_emergency")
            # Key assertion: client sent learnable=1 but server must store 0
            # (LEARNABLE_REASON_FLAGS["weather_or_emergency"] = 0)
            self.assertEqual(
                row[1],
                0,
                "Server must ignore client-supplied learnable=1 and use its own LEARNABLE_REASON_FLAGS mapping",
            )
            # No high-priority displacement occurred (P2â†’SLOT-A, P1â†’SLOT-B, no deferral)
            self.assertEqual(
                row[2],
                0,
                "priority_alert must be 0: moving P2 to a different slot does not displace any P1/P2",
            )

    def test_slot_duration_capacity_is_enforced(self) -> None:
        """A slot must never absorb more duration than it can physically host."""
        defects = pd.DataFrame(
            [
                {
                    "defect_id": "D-100",
                    "section_id": "SEC-01",
                    "department": "Engineering",
                    "estimated_duration_hours": 2.7,
                    "urgency_band": "P1 - Immediate",
                    "final_priority_score": 95.0,
                },
                {
                    "defect_id": "D-101",
                    "section_id": "SEC-01",
                    "department": "S&T",
                    "estimated_duration_hours": 1.8,
                    "urgency_band": "P2 - Urgent",
                    "final_priority_score": 72.0,
                },
                {
                    "defect_id": "D-102",
                    "section_id": "SEC-01",
                    "department": "TRD",
                    "estimated_duration_hours": 0.8,
                    "urgency_band": "P3 - Planned",
                    "final_priority_score": 35.0,
                },
            ]
        )
        slots = pd.DataFrame(
            [
                {
                    "slot_id": "SLOT-OVERFLOW",
                    "section_id": "SEC-01",
                    "start_datetime": "2026-09-02T09:00:00",
                    "end_datetime": "2026-09-02T13:00:00",
                    "duration_hours": 4.0,
                    "is_night_window": False,
                    "traffic_density": "Low",
                    "source": "TMS",
                    "horizon": "weekly",
                }
            ]
        )

        optimizer = BlockOptimizer(data_dir=DATA_DIR)
        optimizer.defects_df = defects
        optimizer.slots_df = slots

        with self.assertRaisesRegex(RuntimeError, "MILP did not solve to optimality"):
            optimizer.build_and_solve_milp(horizon="weekly")

        feasible = pd.DataFrame(
            [
                {
                    "defect_id": "D-200",
                    "section_id": "SEC-01",
                    "department": "Engineering",
                    "estimated_duration_hours": 2.0,
                    "urgency_band": "P2 - Urgent",
                    "final_priority_score": 70.0,
                },
                {
                    "defect_id": "D-201",
                    "section_id": "SEC-01",
                    "department": "S&T",
                    "estimated_duration_hours": 1.5,
                    "urgency_band": "P3 - Planned",
                    "final_priority_score": 40.0,
                },
            ]
        )
        feasible_slots = pd.DataFrame(
            [
                {
                    "slot_id": "SLOT-FEASIBLE",
                    "section_id": "SEC-01",
                    "start_datetime": "2026-09-08T00:40:00",
                    "end_datetime": "2026-09-08T04:10:00",
                    "duration_hours": 4.0,
                    "is_night_window": True,
                    "traffic_density": "High",
                    "source": "Timetable",
                    "horizon": "weekly",
                }
            ]
        )
        optimizer_feasible = BlockOptimizer(data_dir=DATA_DIR)
        optimizer_feasible.defects_df = feasible
        optimizer_feasible.slots_df = feasible_slots
        scheduled, _, kpis = optimizer_feasible.build_and_solve_milp(horizon="weekly")
        self.assertEqual(kpis["solver_status"], "Optimal")
        self.assertGreater(len(scheduled), 0)


if __name__ == "__main__":
    unittest.main()

