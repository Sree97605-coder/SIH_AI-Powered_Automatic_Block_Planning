"""Poll a local CRIS-shaped feed and re-run the existing planning pipeline."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


RAW_DEFECT_FIELDS = [
    "defect_id",
    "department",
    "location",
    "defect_type",
    "severity",
    "overdue_days",
    "estimated_duration_hours",
    "criticality_score",
    "asset_impact",
    "description",
]
DEPARTMENT_FILES = {
    "Engineering": "tms_defects.csv",
    "S&T": "smms_defects.csv",
    "TRD": "tdms_defects.csv",
}
DEFAULT_WATERMARK = "1970-01-01T00:00:00+00:00"
LOGGER = logging.getLogger("cris_adapter")


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)


class CrisAdapter:
    """Stateful CRIS poller using a JSON watermark file."""

    def __init__(
        self,
        endpoint: str,
        data_dir: Path,
        state_path: Path | None = None,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.data_dir = data_dir
        self.state_path = state_path or data_dir / ".cris_watermark.json"

    def _read_watermark(self) -> str:
        if not self.state_path.exists():
            return DEFAULT_WATERMARK
        payload = json.loads(self.state_path.read_text(encoding="utf-8"))
        return str(payload["last_created_at"])

    def _write_watermark(self, value: str) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(
            json.dumps({"last_created_at": value}, indent=2) + "\n",
            encoding="utf-8",
        )

    def _fetch(self, watermark: str) -> list[dict[str, object]]:
        url = f"{self.endpoint}?{urlencode({'since': watermark})}"
        LOGGER.info("CRIS_REQUEST url=%s", url)
        with urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not isinstance(payload, list):
            raise ValueError("CRIS response must be a JSON list")
        return payload

    def _existing_ids(self, path: Path) -> set[str]:
        if not path.exists():
            return set()
        with path.open(newline="", encoding="utf-8") as handle:
            return {row["defect_id"] for row in csv.DictReader(handle)}

    def _append_new_records(self, records: list[dict[str, object]]) -> tuple[list[str], list[str]]:
        existing_by_file = {
            filename: self._existing_ids(self.data_dir / filename)
            for filename in DEPARTMENT_FILES.values()
        }
        inserted: list[str] = []
        duplicates: list[str] = []
        handles: dict[str, object] = {}
        writers: dict[str, csv.DictWriter] = {}

        try:
            for record in records:
                missing = [field for field in RAW_DEFECT_FIELDS if field not in record]
                if missing or "created_at" not in record:
                    raise ValueError(f"CRIS record has invalid schema; missing={missing}")
                filename = DEPARTMENT_FILES.get(str(record["department"]))
                if filename is None:
                    raise ValueError(f"Unsupported CRIS department: {record['department']}")
                defect_id = str(record["defect_id"])
                if defect_id in existing_by_file[filename] or defect_id in inserted:
                    duplicates.append(defect_id)
                    continue

                if filename not in writers:
                    path = self.data_dir / filename
                    handle = path.open("a", newline="", encoding="utf-8")
                    handles[filename] = handle
                    writers[filename] = csv.DictWriter(handle, fieldnames=RAW_DEFECT_FIELDS)
                writers[filename].writerow({field: record[field] for field in RAW_DEFECT_FIELDS})
                inserted.append(defect_id)
        finally:
            for handle in handles.values():
                handle.close()

        return inserted, duplicates

    def _run_existing_pipeline(self) -> None:
        project_root = Path(__file__).resolve().parent
        src_dir = project_root / "src"
        data_dir = project_root / "data"
        for path in (src_dir, data_dir):
            if str(path) not in sys.path:
                sys.path.insert(0, str(path))

        from data_integration import run_integration
        from ml_prioritization import MLPrioritizationModel
        from optimization import BlockOptimizer

        integrated_dir = self.data_dir / "integrated"
        LOGGER.info("PIPELINE_STEP run_integration")
        run_integration(data_dir=self.data_dir, integrated_dir=integrated_dir)
        LOGGER.info("PIPELINE_STEP run_prioritization")
        model = MLPrioritizationModel(
            data_dir=self.data_dir,
            integrated_dir=integrated_dir,
        )
        model.train_and_predict()
        model.export_artifacts()
        LOGGER.info("PIPELINE_STEP optimize_blocks")
        optimizer = BlockOptimizer(
            data_dir=self.data_dir,
            optimized_dir=self.data_dir / "optimized",
        )
        optimizer.run_full_optimization()

    def poll(self) -> dict[str, object]:
        poll_time = datetime.now(timezone.utc).isoformat()
        watermark_before = self._read_watermark()
        LOGGER.info("POLL_START poll_time=%s watermark_before=%s", poll_time, watermark_before)
        records = self._fetch(watermark_before)
        LOGGER.info("RECORDS_FOUND count=%d", len(records))
        inserted, duplicates = self._append_new_records(records)
        for defect_id in inserted:
            LOGGER.info("INSERTED defect_id=%s", defect_id)
        for defect_id in duplicates:
            LOGGER.info("SKIPPED_DUPLICATE defect_id=%s", defect_id)

        timestamps = [str(record["created_at"]) for record in records]
        watermark_after = max(timestamps, key=lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))) if timestamps else watermark_before
        self._write_watermark(watermark_after)
        LOGGER.info("WATERMARK_ADVANCED before=%s after=%s", watermark_before, watermark_after)

        if inserted:
            self._run_existing_pipeline()
        else:
            LOGGER.info("PIPELINE_SKIPPED reason=no_new_records")
        LOGGER.info(
            "POLL_END inserted=%d duplicates=%d watermark=%s",
            len(inserted),
            len(duplicates),
            watermark_after,
        )
        return {
            "inserted": inserted,
            "duplicates": duplicates,
            "watermark_before": watermark_before,
            "watermark_after": watermark_after,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Poll the local mock CRIS defect feed.")
    parser.add_argument("--endpoint", default="http://127.0.0.1:8090/cris/defects/new")
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent / "data")
    parser.add_argument("--state-file", type=Path, default=None)
    args = parser.parse_args()
    _configure_logging()
    CrisAdapter(args.endpoint, args.data_dir, args.state_file).poll()


if __name__ == "__main__":
    main()