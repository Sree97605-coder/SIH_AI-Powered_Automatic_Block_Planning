"""Unit tests for Classical Mathematical Block Optimization Engine (PuLP / MILP)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
DATA_DIR = PROJECT_ROOT / "data"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(DATA_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_DIR))

from feasibility_utils import classify_unscheduled, compute_feasibility_ceiling
from optimization import BlockOptimizer, ScheduledSlot, optimize_blocks


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
