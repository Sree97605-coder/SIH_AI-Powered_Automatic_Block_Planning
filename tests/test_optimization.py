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

from optimization import BlockOptimizer, ScheduledSlot, optimize_blocks


class ClassicalOptimizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.optimizer = BlockOptimizer(data_dir=DATA_DIR)
        self.optimizer.load_data()

    def test_milp_weekly_optimization(self) -> None:
        """Test MILP solve for weekly horizon with hard P1, P2 and slot utilization targets."""
        scheduled, unscheduled, kpis = self.optimizer.build_and_solve_milp(horizon="weekly")

        self.assertEqual(kpis["solver_status"], "Optimal")
        # 100% P1 clearance
        self.assertEqual(kpis["p1_immediate_clearance_pct"], 100.0)
        # >= 85% P2 clearance
        self.assertGreaterEqual(kpis["p2_urgent_clearance_pct"], 85.0)
        # >= 50% slot utilization
        self.assertGreaterEqual(kpis["slot_utilization_pct"], 50.0)
        # High defect clearance
        self.assertGreaterEqual(kpis["total_defects_scheduled"], 45)
        self.assertEqual(kpis["unscheduled_p1_p2_count"], 0)
        self.assertGreater(kpis["bundled_slots_count"], 0)

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

        self.assertEqual(kpis["solver_status"], "Optimal")
        self.assertEqual(kpis["p1_immediate_clearance_pct"], 100.0)
        self.assertEqual(kpis["p2_urgent_clearance_pct"], 100.0)
        self.assertGreaterEqual(kpis["defect_clearance_rate_pct"], 95.0)
        self.assertEqual(kpis["unscheduled_p1_p2_count"], 0)

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


if __name__ == "__main__":
    unittest.main()
