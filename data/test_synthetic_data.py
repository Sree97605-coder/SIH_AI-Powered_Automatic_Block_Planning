"""Lightweight tests for corridor + defect generators (stdlib unittest)."""

from __future__ import annotations

import unittest
from pathlib import Path

from corridor import CORRIDOR, load_corridor, section_by_id, station_by_code
from generate_synthetic_data import DEFECT_FIELDS, all_defects, summarize, write_all

DATA_DIR = Path(__file__).resolve().parent


class CorridorTests(unittest.TestCase):
    def test_station_and_section_counts(self) -> None:
        self.assertGreaterEqual(len(CORRIDOR["stations"]), 8)
        self.assertLessEqual(len(CORRIDOR["stations"]), 12)
        self.assertGreaterEqual(len(CORRIDOR["block_sections"]), 4)
        self.assertLessEqual(len(CORRIDOR["block_sections"]), 6)

    def test_chainage_monotonic(self) -> None:
        kms = [s["chainage_km"] for s in CORRIDOR["stations"]]
        self.assertEqual(kms, sorted(kms))
        self.assertEqual(kms[0], 0.0)

    def test_section_lengths_match_station_span(self) -> None:
        for section in CORRIDOR["block_sections"]:
            start = station_by_code(section["from_station"])["chainage_km"]
            end = station_by_code(section["to_station"])["chainage_km"]
            self.assertAlmostEqual(section["length_km"], round(end - start, 1), places=1)

    def test_json_roundtrip(self) -> None:
        loaded = load_corridor()
        self.assertEqual(loaded["corridor_id"], CORRIDOR["corridor_id"])
        self.assertEqual(station_by_code("PRYJ")["name"], "Prayagraj Junction")
        self.assertEqual(section_by_id("SEC-03")["density"], "medium")


class DefectTests(unittest.TestCase):
    def test_volume_and_schema(self) -> None:
        rows = all_defects()
        self.assertGreaterEqual(len(rows), 40)
        self.assertLessEqual(len(rows), 60)
        for row in rows:
            self.assertEqual(set(row), set(DEFECT_FIELDS))
            self.assertIn(row["severity"], {"High", "Medium", "Low"})
            self.assertTrue(1 <= row["criticality_score"] <= 10)

    def test_departments_split(self) -> None:
        summary = summarize()
        self.assertEqual(summary["by_department"]["Engineering"], 22)
        self.assertEqual(summary["by_department"]["S&T"], 16)
        self.assertEqual(summary["by_department"]["TRD"], 14)
        self.assertEqual(summary["total"], 52)

    def test_write_csvs(self) -> None:
        write_all(DATA_DIR)
        for name in ("tms_defects.csv", "smms_defects.csv", "tdms_defects.csv"):
            self.assertTrue((DATA_DIR / name).exists())


if __name__ == "__main__":
    unittest.main()
