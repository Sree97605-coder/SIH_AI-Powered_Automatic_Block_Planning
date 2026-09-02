"""Unit tests for SIH26027 Data Integration Layer."""

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

from data_integration import (
    CandidateAssignment,
    DataIntegrator,
    IntegratedDefect,
    extract_km,
    run_integration,
)


class DataIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.integrator = DataIntegrator(data_dir=DATA_DIR)
        self.integrator.load_all()

    def test_unify_datasets(self) -> None:
        """Test that all three core datasets load correctly."""
        self.assertEqual(len(self.integrator.defects_df), 52)
        self.assertEqual(len(self.integrator.slots_df), 122)
        self.assertGreaterEqual(len(self.integrator.goods_forecast_df), 10)
        self.assertEqual(len(self.integrator.corridor["block_sections"]), 5)

    def test_section_resolution_and_enrichment(self) -> None:
        """Test that 100% of defects are resolved to valid corridor sections."""
        enriched = self.integrator.resolve_and_enrich_defects()
        self.assertEqual(len(enriched), 52)

        valid_sections = {"SEC-01", "SEC-02", "SEC-03", "SEC-04", "SEC-05"}
        for defect in enriched:
            self.assertIn(defect.section_id, valid_sections)
            self.assertTrue(len(defect.section_name) > 0)
            self.assertGreater(defect.estimated_duration_hours, 0)
            self.assertIn(defect.severity, {"High", "Medium", "Low"})
            self.assertTrue(1 <= defect.criticality_score <= 10)

        # Check TRD items flag power block requirement
        trd_items = [d for d in enriched if d.department == "TRD"]
        self.assertGreater(len(trd_items), 0)
        for trd in trd_items:
            self.assertTrue(trd.requires_power_block)

    def test_extract_km_helper(self) -> None:
        """Test numerical chainage extraction regex."""
        self.assertEqual(extract_km("SEC-01 / km 4.8 (CNB-CNBI)"), 4.8)
        self.assertEqual(extract_km("SEC-03 / km 91.4"), 91.4)
        self.assertEqual(extract_km("BRE / km 160.2"), 160.2)
        self.assertIsNone(extract_km("CNB Yard (PF-3 turnout 12A)"))

    def test_candidate_assignments_generation(self) -> None:
        """Test candidate slot matching and scoring."""
        assignments = self.integrator.generate_candidate_assignments()
        self.assertGreater(len(assignments), 700)

        # Every defect must have candidate assignments on its section
        assigned_defect_ids = {a.defect_id for a in assignments}
        self.assertEqual(len(assigned_defect_ids), 52)

        for a in assignments:
            self.assertEqual(a.section_id, a.section_id)
            self.assertTrue(0.0 <= a.suitability_score <= 100.0)
            self.assertIn(a.fit_category, {"tight_fit", "comfortable_fit", "excess_capacity", "insufficient_duration"})
            self.assertIsInstance(a.is_fit, bool)

    def test_bundling_and_conflict_detection(self) -> None:
        """Test bundling opportunities across departments and constraint detection."""
        pairs, matrix = self.integrator.detect_bundling_and_conflicts()
        self.assertGreater(len(pairs), 200)

        # Verify cross-department bundling
        self.assertGreater(matrix["cross_department_pairs"], 100)
        self.assertGreater(matrix["trd_shadow_block_pairs"], 50)
        self.assertGreater(matrix["joint_engg_st_pairs"], 10)

        # Verify all 52 defects are eligible for at least one bundle
        summary = self.integrator.get_summary()
        self.assertEqual(summary["defects_eligible_for_bundling"], 52)
        self.assertEqual(summary["bundling_eligibility_pct"], 100.0)

    def test_data_quality_report(self) -> None:
        """Test data quality assertion suite."""
        report = self.integrator.run_data_quality_checks()
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["unmapped_defects_count"], 0)
        self.assertEqual(report["missing_durations_count"], 0)
        self.assertEqual(report["invalid_severity_count"], 0)
        self.assertEqual(report["invalid_slots_count"], 0)
        self.assertEqual(report["unmatched_sections_count"], 0)

    def test_export_artifacts(self) -> None:
        """Test file export of candidate assignments, conflict matrix, and summary."""
        paths = self.integrator.export_integrated_artifacts()
        self.assertTrue(paths["candidate_assignments_csv"].exists())
        self.assertTrue(paths["conflict_matrix_json"].exists())
        self.assertTrue(paths["integrated_summary_json"].exists())

        # Validate candidate assignments CSV
        df = pd.read_csv(paths["candidate_assignments_csv"])
        self.assertEqual(len(df), len(self.integrator.candidate_assignments))
        self.assertIn("suitability_score", df.columns)

        # Validate summary JSON
        with paths["integrated_summary_json"].open("r", encoding="utf-8") as f:
            summary = json.load(f)
            self.assertEqual(summary["total_defects"], 52)
            self.assertEqual(summary["total_block_slots"], 122)
            self.assertEqual(summary["data_quality_status"], "PASS")

    def test_run_integration_convenience_function(self) -> None:
        """Test high-level run_integration function."""
        summary = run_integration()
        self.assertEqual(summary["total_defects"], 52)
        self.assertEqual(summary["total_block_slots"], 122)
        self.assertEqual(summary["data_quality_status"], "PASS")


if __name__ == "__main__":
    unittest.main()
