"""Unit tests for ML Prioritization Model."""

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

from ml_prioritization import (
    FEATURE_COLUMNS,
    MLPrioritizationModel,
    extract_features,
    run_prioritization,
)


class MLPrioritizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ml_model = MLPrioritizationModel(data_dir=DATA_DIR)

    def test_feature_extraction(self) -> None:
        """Test that feature extraction transforms raw defect data properly."""
        from load_defects import load_defects

        raw_df = load_defects(DATA_DIR)
        feat_df = extract_features(raw_df)

        self.assertEqual(len(feat_df), 52)
        for col in FEATURE_COLUMNS:
            self.assertIn(col, feat_df.columns)
            self.assertFalse(feat_df[col].isnull().any())

    def test_train_and_predict_metrics(self) -> None:
        """Test training, cross validation metrics, and scoring bounds."""
        df = self.ml_model.train_and_predict()

        self.assertEqual(len(df), 52)
        self.assertIn("ml_priority_score", df.columns)
        self.assertIn("final_priority_score", df.columns)
        self.assertIn("final_rank", df.columns)

        # Bounds check
        self.assertTrue((df["ml_priority_score"] >= 0.0).all())
        self.assertTrue((df["ml_priority_score"] <= 100.0).all())
        self.assertTrue((df["final_priority_score"] >= 0.0).all())
        self.assertTrue((df["final_priority_score"] <= 100.0).all())

        # CV metrics validation
        metrics = self.ml_model.cv_metrics_
        self.assertGreater(metrics["r2_score"], 0.85)
        self.assertLess(metrics["mean_absolute_error"], 3.5)
        self.assertGreater(metrics["spearman_rank_correlation"], 0.90)

    def test_feature_importances(self) -> None:
        """Verify feature importances are computed and sum to ~1.0."""
        self.ml_model.train_and_predict()
        importances = self.ml_model.feature_importance_

        self.assertEqual(len(importances), len(FEATURE_COLUMNS))
        self.assertAlmostEqual(sum(importances.values()), 1.0, places=2)
        # Top features should include asset_impact or criticality_score
        top_feature = list(importances.keys())[0]
        self.assertIn(top_feature, {"asset_impact_num", "criticality_score", "severity_num"})

    def test_export_artifacts(self) -> None:
        """Test saving CSV, summary JSON, and joblib model."""
        paths = self.ml_model.export_artifacts()

        self.assertTrue(paths["prioritized_defects_csv"].exists())
        self.assertTrue(paths["priority_summary_json"].exists())
        self.assertTrue(paths["model_joblib"].exists())

        # Validate saved CSV
        saved_df = pd.read_csv(paths["prioritized_defects_csv"])
        self.assertEqual(len(saved_df), 52)
        self.assertEqual(list(saved_df["final_rank"]), list(range(1, 53)))

        # Validate saved JSON summary
        with paths["priority_summary_json"].open("r", encoding="utf-8") as f:
            summary = json.load(f)
            self.assertEqual(summary["total_defects_evaluated"], 52)
            self.assertEqual(len(summary["top_10_prioritized_defects"]), 10)

    def test_run_prioritization_convenience_function(self) -> None:
        """Test high-level run_prioritization helper."""
        df, summary = run_prioritization(data_dir=DATA_DIR)
        self.assertEqual(len(df), 52)
        self.assertEqual(summary["total_defects_evaluated"], 52)


if __name__ == "__main__":
    unittest.main()
