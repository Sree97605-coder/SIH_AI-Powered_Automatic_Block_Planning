"""Unit tests for Rule-Based Priority & Criticality Scoring Engine."""

from __future__ import annotations

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

from scoring import PriorityScorer, calculate_rule_priority, score_defects


class ScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scorer = PriorityScorer(data_dir=DATA_DIR)

    def test_single_defect_scoring_components(self) -> None:
        """Test calculation of scoring components on a representative high-severity defect."""
        sample_defect = {
            "defect_id": "TMS-TEST-01",
            "department": "Engineering",
            "location": "SEC-01 / km 4.8",
            "section_id": "SEC-01",
            "defect_type": "Rail fracture (suspect)",
            "severity": "High",
            "overdue_days": 20,
            "estimated_duration_hours": 4.0,
            "criticality_score": 10,
            "asset_impact": "High",
            "description": "Transverse defect on high speed rail",
        }
        res = calculate_rule_priority(sample_defect)
        self.assertEqual(res["defect_id"], "TMS-TEST-01")
        self.assertEqual(res["criticality_component"], 35.0)  # (10/10)*35
        self.assertEqual(res["severity_component"], 15.0)     # High = 15.0
        self.assertEqual(res["aging_component"], 10.0)        # (20/40)*20
        self.assertEqual(res["asset_impact_component"], 15.0) # High = 15.0
        self.assertEqual(res["density_component"], 10.0)      # High Density SEC-01 = 10.0
        self.assertEqual(res["duration_component"], 2.5)      # (4/8)*5
        self.assertEqual(res["rule_priority_score"], 87.5)
        self.assertEqual(res["urgency_band"], "P1 - Immediate")

    def test_score_all_defects_volume_and_bounds(self) -> None:
        """Test scoring of all 52 backlog defects."""
        df = self.scorer.score_all()
        self.assertEqual(len(df), 52)
        self.assertTrue((df["rule_priority_score"] >= 0.0).all())
        self.assertTrue((df["rule_priority_score"] <= 100.0).all())
        self.assertEqual(list(df["priority_rank"]), list(range(1, 53)))

    def test_urgency_band_assignment(self) -> None:
        """Verify proper classification into P1, P2, P3, P4."""
        df = self.scorer.score_all()
        valid_bands = {"P1 - Immediate", "P2 - Urgent", "P3 - Planned", "P4 - Routine"}
        for band in df["urgency_band"].unique():
            self.assertIn(band, valid_bands)

        p1_items = df[df["urgency_band"] == "P1 - Immediate"]
        for _, row in p1_items.iterrows():
            self.assertGreaterEqual(row["rule_priority_score"], 80.0)

    def test_summary_generation(self) -> None:
        """Test summary metrics dictionary."""
        summary = self.scorer.get_summary()
        self.assertEqual(summary["total_defects_scored"], 52)
        self.assertGreater(summary["mean_priority_score"], 50.0)
        self.assertGreater(summary["max_priority_score"], 80.0)
        self.assertEqual(len(summary["top_5_defects"]), 5)


if __name__ == "__main__":
    unittest.main()
