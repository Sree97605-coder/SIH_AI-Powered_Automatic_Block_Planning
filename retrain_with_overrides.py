from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"
DATA_DIR = PROJECT_ROOT / "data"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(DATA_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_DIR))

from ml_prioritization import MLPrioritizationModel

DB_PATH = PROJECT_ROOT / "override_log.db"


def load_override_log(db_path: Path = DB_PATH) -> pd.DataFrame:
    if not db_path.exists():
        return pd.DataFrame()

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        df = pd.read_sql_query(
            """
            SELECT
                override_id,
                defect_id,
                horizon,
                original_slot_id,
                new_slot_id,
                changed_by,
                timestamp,
                reason_category,
                reason_freetext,
                learnable,
                newly_deferred_ids,
                priority_alert
            FROM overrides
            ORDER BY timestamp ASC
            """,
            conn,
        )
    finally:
        conn.close()

    return df


def build_override_summary(overrides_df: pd.DataFrame) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "total_overrides": int(len(overrides_df)),
        "learnable_count": int((overrides_df["learnable"] == 1).sum()) if not overrides_df.empty else 0,
        "non_learnable_count": int((overrides_df["learnable"] == 0).sum()) if not overrides_df.empty else 0,
        "reason_breakdown": {},
        "defect_breakdown": {},
    }

    if overrides_df.empty:
        return summary

    summary["reason_breakdown"] = (
        overrides_df.groupby("reason_category").size().sort_values(ascending=False).to_dict()
    )
    summary["defect_breakdown"] = (
        overrides_df.groupby("defect_id").size().sort_values(ascending=False).to_dict()
    )

    return summary


def compare_model_metrics() -> dict[str, Any]:
    data_dir = DATA_DIR
    original_df = pd.read_csv(data_dir / "prioritized_defects.csv")

    model = MLPrioritizationModel(data_dir=data_dir)
    retrained_df = model.train_and_predict(original_df)

    original_metrics = model.cv_metrics_.copy()

    override_df = load_override_log()
    learnable_overrides = override_df[override_df["learnable"] == 1].copy() if not override_df.empty else pd.DataFrame()

    if not learnable_overrides.empty:
        learnable_overrides["affected_defect"] = learnable_overrides["defect_id"]
        learnable_overrides["risk_before"] = retrained_df.set_index("defect_id")["final_priority_score"].reindex(
            learnable_overrides["defect_id"]
        ).values

    base_path = data_dir / "integrated"
    base_path.mkdir(parents=True, exist_ok=True)
    retrained_df.to_csv(base_path / "prioritized_defects.csv", index=False)

    result = {
        "before": {
            "total_overrides": int(len(override_df)),
            "learnable_overrides": int(len(learnable_overrides)),
            "model_metrics": original_metrics,
        },
        "after": {
            "model_metrics": model.cv_metrics_,
            "summary": build_override_summary(override_df),
        },
    }

    if not learnable_overrides.empty:
        result["learnable_override_changes"] = []
        for _, row in learnable_overrides.iterrows():
            defect_id = str(row["defect_id"])
            defect_row = retrained_df[retrained_df["defect_id"] == defect_id].iloc[0]
            result["learnable_override_changes"].append(
                {
                    "defect_id": defect_id,
                    "reason_category": row["reason_category"],
                    "from_slot": row["original_slot_id"],
                    "to_slot": row["new_slot_id"],
                    "priority_score_before": round(float(defect_row["final_priority_score"]), 2),
                }
            )

    return result


def main() -> None:
    print("Loading override log and retraining model...")
    comparison = compare_model_metrics()

    print(json.dumps(comparison, indent=2))


if __name__ == "__main__":
    main()
