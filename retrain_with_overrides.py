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

# A prioritization mistake is evidence that the defect's risk was under-ranked.
# A 15% target lift is large enough to be learnable in this 0-100 score space,
# while remaining a bounded correction rather than pretending the defect is P1.
TARGET_ADJUSTMENT_FACTORS = {
    "prioritization_mistake": 1.15,
}


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


def build_adjusted_training_dataframe(
    original_df: pd.DataFrame,
    overrides_df: pd.DataFrame,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Return original rows with applicable learnable targets adjusted."""
    adjusted_df = original_df.copy()
    adjusted_df["_training_target"] = adjusted_df["rule_priority_score"].astype(float)
    applied: list[dict[str, Any]] = []

    for _, override in overrides_df[overrides_df["learnable"] == 1].iterrows():
        category = str(override["reason_category"])
        factor = TARGET_ADJUSTMENT_FACTORS.get(category)
        defect_id = str(override["defect_id"])
        if factor is None:
            continue

        matches = adjusted_df["defect_id"].astype(str) == defect_id
        if not matches.any():
            continue

        original_target = float(adjusted_df.loc[matches, "_training_target"].iloc[0])
        adjusted_target = min(100.0, round(original_target * factor, 2))
        adjusted_df.loc[matches, "_training_target"] = adjusted_target
        applied.append(
            {
                "defect_id": defect_id,
                "reason_category": category,
                "target_before": original_target,
                "target_after": adjusted_target,
                "factor": factor,
            }
        )

    return adjusted_df, applied


def compare_model_metrics() -> dict[str, Any]:
    data_dir = DATA_DIR
    original_df = pd.read_csv(data_dir / "prioritized_defects.csv")

    override_df = load_override_log()
    learnable_overrides = override_df[override_df["learnable"] == 1].copy() if not override_df.empty else pd.DataFrame()
    adjusted_df, applied_adjustments = build_adjusted_training_dataframe(original_df, override_df)

    before_model = MLPrioritizationModel(data_dir=data_dir)
    before_df = before_model.train_and_predict(original_df)
    after_model = MLPrioritizationModel(data_dir=data_dir)
    retrained_df = after_model.train_and_predict(adjusted_df, training_target_column="_training_target")

    if not learnable_overrides.empty:
        learnable_overrides["affected_defect"] = learnable_overrides["defect_id"]
    base_path = data_dir / "integrated"
    base_path.mkdir(parents=True, exist_ok=True)
    retrained_df.to_csv(base_path / "prioritized_defects.csv", index=False)

    result = {
        "before": {
            "total_overrides": int(len(override_df)),
            "learnable_overrides": int(len(learnable_overrides)),
            "model_metrics": before_model.cv_metrics_,
        },
        "after": {
            "model_metrics": after_model.cv_metrics_,
            "summary": build_override_summary(override_df),
        },
        "target_adjustments": {
            "applied": applied_adjustments,
            "ignored_categories": sorted(
                set(learnable_overrides["reason_category"])
                - set(TARGET_ADJUSTMENT_FACTORS)
            ) if not learnable_overrides.empty else [],
        },
    }

    if not learnable_overrides.empty:
        result["learnable_override_changes"] = []
        for _, row in learnable_overrides.iterrows():
            defect_id = str(row["defect_id"])
            before_row = before_df[before_df["defect_id"] == defect_id].iloc[0]
            after_row = retrained_df[retrained_df["defect_id"] == defect_id].iloc[0]
            result["learnable_override_changes"].append(
                {
                    "defect_id": defect_id,
                    "reason_category": row["reason_category"],
                    "from_slot": row["original_slot_id"],
                    "to_slot": row["new_slot_id"],
                    "target_adjustment_applied": row["reason_category"] in TARGET_ADJUSTMENT_FACTORS,
                    "priority_score_before": round(float(before_row["final_priority_score"]), 2),
                    "priority_score_after": round(float(after_row["final_priority_score"]), 2),
                    "priority_score_delta": round(
                        float(after_row["final_priority_score"] - before_row["final_priority_score"]), 2
                    ),
                }
            )

    return result


def main() -> None:
    print("Loading override log and retraining model...")
    comparison = compare_model_metrics()

    print(json.dumps(comparison, indent=2))


if __name__ == "__main__":
    main()
