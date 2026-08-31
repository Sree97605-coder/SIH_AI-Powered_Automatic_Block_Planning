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


class BlockSlotTests(unittest.TestCase):
    def test_slots_generation_and_schema(self) -> None:
        from generate_block_slots import (
            GOODS_FIELDS,
            SLOT_FIELDS,
            all_slots,
            goods_forecast_rows,
            goods_forecast_slots,
            timetable_slots,
            write_all as write_slots,
        )

        tt = timetable_slots()
        gf = goods_forecast_slots()
        slots = all_slots()

        self.assertGreaterEqual(len(slots), 70)
        self.assertEqual(len(slots), len(tt) + len(gf))

        # Check required fields exist on all generated slot records
        required_keys = {
            "slot_id",
            "section_id",
            "start_datetime",
            "end_datetime",
            "duration_hours",
            "traffic_density",
            "is_night_window",
            "max_tasks_possible",
            "source",
        }
        for slot in slots:
            self.assertTrue(required_keys.issubset(slot.keys()))
            self.assertIn(slot["section_id"], {"SEC-01", "SEC-02", "SEC-03", "SEC-04", "SEC-05"})
            self.assertGreater(slot["duration_hours"], 0)
            self.assertGreaterEqual(slot["max_tasks_possible"], 1)

        # Check goods forecast rows
        gf_rows = goods_forecast_rows()
        self.assertGreaterEqual(len(gf_rows), 10)
        for row in gf_rows:
            self.assertTrue(set(GOODS_FIELDS).issubset(row.keys()))

        # Test write_all creates all CSV and JSON files
        summary = write_slots(DATA_DIR)
        self.assertIn("total_slots", summary)
        self.assertTrue((DATA_DIR / "block_slots.csv").exists())
        self.assertTrue((DATA_DIR / "timetable_slots.csv").exists())
        self.assertTrue((DATA_DIR / "goods_forecast_slots.csv").exists())
        self.assertTrue((DATA_DIR / "goods_forecast.csv").exists())
        self.assertTrue((DATA_DIR / "block_slots_summary.json").exists())

    def test_density_and_day_shadow_rules(self) -> None:
        from generate_block_slots import timetable_slots

        tt = timetable_slots()
        # High density sections should NOT have daytime slots in weekly timetable
        high_density = {"SEC-01", "SEC-02", "SEC-05"}
        for s in tt:
            if s["section_id"] in high_density and s["source"] == "Timetable":
                self.assertTrue(
                    s["is_night_window"],
                    f"Expected high-density section {s['section_id']} to have only night slots, got {s}",
                )

        # Medium density sections should have day shadow slots
        day_shadow_slots = [
            s for s in tt if s["section_id"] in {"SEC-03", "SEC-04"} and not s["is_night_window"]
        ]
        self.assertGreater(len(day_shadow_slots), 0)


class LoaderAndMetricsTests(unittest.TestCase):
    def test_pandas_loaders(self) -> None:
        from load_slots import (
            load_block_slots,
            load_goods_forecast,
            load_goods_forecast_slots,
            load_timetable_slots,
        )

        df_all = load_block_slots(DATA_DIR)
        df_tt = load_timetable_slots(DATA_DIR)
        df_gf_slots = load_goods_forecast_slots(DATA_DIR)
        df_gf = load_goods_forecast(DATA_DIR)

        self.assertEqual(len(df_all), len(df_tt) + len(df_gf_slots))
        self.assertIn("max_tasks_possible", df_all.columns)
        self.assertIn("rake_id", df_gf.columns)

    def test_defect_candidate_slot_join(self) -> None:
        from load_defects import load_defects
        from load_slots import map_defects_to_candidate_slots

        defects = load_defects(DATA_DIR)
        joined = map_defects_to_candidate_slots(defects_df=defects, data_dir=DATA_DIR)

        # Every one of 52 defects must map to candidate slots in its section
        unique_mapped_defects = joined["defect_id"].nunique()
        self.assertEqual(unique_mapped_defects, 52)
        self.assertGreater(len(joined), 500)

    def test_before_optimization_metrics(self) -> None:
        from load_slots import before_optimization_metrics

        metrics = before_optimization_metrics(data_dir=DATA_DIR)
        self.assertEqual(len(metrics), 5)  # 5 sections SEC-01..05
        self.assertEqual(metrics["defect_count"].sum(), 52)
        self.assertAlmostEqual(metrics["demanded_hours"].sum(), 230.0, places=1)
        self.assertGreater(metrics["weekly_available_hours"].sum(), 100.0)
        self.assertGreater(metrics["monthly_available_hours"].sum(), 200.0)

        # Confirm high-density SEC-01 and SEC-05 have supply deficits
        sec01 = metrics[metrics["section_id"] == "SEC-01"].iloc[0]
        sec05 = metrics[metrics["section_id"] == "SEC-05"].iloc[0]
        self.assertGreater(sec01["weekly_net_deficit_hours"], 0)
        self.assertGreater(sec05["weekly_net_deficit_hours"], 0)


if __name__ == "__main__":
    unittest.main()

