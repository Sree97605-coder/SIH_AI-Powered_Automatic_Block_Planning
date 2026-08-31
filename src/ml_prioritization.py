"""Machine Learning Prioritization & Ranking Model for SIH26027.

Uses XGBoost / GradientBoosting regression to learn non-linear feature
interactions and rank rail defects based on multi-dimensional operational impact.

Features:
- Criticality score, overdue days, estimated duration
- Categorical encodings (severity, asset impact, department)
- Corridor traffic density & typical daily train frequencies
- Safety hazard flags (rail fracture / weld defect / power block requirement)
- Co-location / bundling synergy density

Outputs:
- ml_priority_score (0–100)
- final_priority_score (composite 50% Rule + 50% ML)
- Rank comparison: rule_rank vs ml_rank vs final_rank
- Feature importance analysis
- Trained model artifact export (joblib)
- Exports to data/prioritized_defects.csv and data/priority_summary.json
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict

try:
    from xgboost import XGBRegressor

    HAS_XGBOOST = True
except ImportError:
    from sklearn.ensemble import GradientBoostingRegressor

    HAS_XGBOOST = False

from paths import DATA_DIR, INTEGRATED_DIR, ensure_data_on_path

ensure_data_on_path()

from corridor import CORRIDOR, section_by_id
from load_defects import load_defects
from scoring import PriorityScorer, calculate_rule_priority
from section_resolver import resolve_section_id

# Typical section train densities from corridor.json
TYPICAL_DAILY_TRAINS = {
    "SEC-01": 142,
    "SEC-02": 128,
    "SEC-03": 86,
    "SEC-04": 74,
    "SEC-05": 136,
}

SEVERITY_MAP = {"High": 3, "Medium": 2, "Low": 1}
ASSET_IMPACT_MAP = {"High": 3, "Medium": 2, "Low": 1}
DENSITY_MAP = {"high": 2, "medium": 1, "low": 0}

FEATURE_COLUMNS = [
    "criticality_score",
    "overdue_days",
    "estimated_duration_hours",
    "severity_num",
    "asset_impact_num",
    "section_density_num",
    "daily_trains",
    "requires_power_block",
    "is_track_critical_hazard",
    "dept_Engineering",
    "dept_ST",
    "dept_TRD",
]


def extract_features(df: pd.DataFrame, corridor: dict[str, Any] | None = None) -> pd.DataFrame:
    """Transform raw defects into rich numeric feature representations."""
    corr = corridor or CORRIDOR
    feat_df = df.copy()

    # Section ID resolution
    if "section_id" not in feat_df.columns:
        feat_df["section_id"] = feat_df["location"].apply(
            lambda loc: resolve_section_id(str(loc), corr) or "SEC-01"
        )

    # Numerical mappings
    feat_df["severity_num"] = feat_df["severity"].map(SEVERITY_MAP).fillna(2)
    feat_df["asset_impact_num"] = feat_df["asset_impact"].map(ASSET_IMPACT_MAP).fillna(2)

    # Section attributes
    feat_df["section_density"] = feat_df["section_id"].apply(
        lambda sid: section_by_id(sid, corr)["density"].lower()
    )
    feat_df["section_density_num"] = feat_df["section_density"].map(DENSITY_MAP).fillna(1)
    feat_df["daily_trains"] = feat_df["section_id"].map(TYPICAL_DAILY_TRAINS).fillna(100)

    # Domain flags
    feat_df["requires_power_block"] = feat_df.apply(
        lambda r: 1
        if r["department"] == "TRD" or "destressing" in str(r.get("defect_type", "")).lower()
        else 0,
        axis=1,
    )

    critical_keywords = [
        "fracture",
        "weld",
        "wear",
        "twist",
        "bridge",
        "interlocking",
        "ei",
        "rri",
        "catenary",
        "parting",
        "flashover",
    ]
    feat_df["is_track_critical_hazard"] = feat_df.apply(
        lambda r: 1
        if any(kw in str(r.get("defect_type", "")).lower() for kw in critical_keywords)
        else 0,
        axis=1,
    )

    # Department One-Hot
    feat_df["dept_Engineering"] = (feat_df["department"] == "Engineering").astype(int)
    feat_df["dept_ST"] = (feat_df["department"] == "S&T").astype(int)
    feat_df["dept_TRD"] = (feat_df["department"] == "TRD").astype(int)

    return feat_df


class MLPrioritizationModel:
    """Supervised ranking model for railway block maintenance prioritization."""

    def __init__(self, data_dir: Path | None = None, integrated_dir: Path | None = None):
        self.data_dir = data_dir or DATA_DIR
        self.integrated_dir = integrated_dir or INTEGRATED_DIR
        self.model = None
        self.feature_importance_: dict[str, float] = {}
        self.cv_metrics_: dict[str, float] = {}
        self.prioritized_df: pd.DataFrame = pd.DataFrame()

    def build_model(self):
        """Instantiate XGBoost or GradientBoosting regressor."""
        if HAS_XGBOOST:
            return XGBRegressor(
                n_estimators=120,
                learning_rate=0.06,
                max_depth=3,
                subsample=0.85,
                colsample_bytree=0.85,
                random_state=42,
                verbosity=0,
            )
        else:
            return GradientBoostingRegressor(
                n_estimators=120,
                learning_rate=0.06,
                max_depth=3,
                subsample=0.85,
                random_state=42,
            )

    def train_and_predict(self, defects_df: pd.DataFrame | None = None) -> pd.DataFrame:
        """Train model, compute cross-validation metrics, and predict priority scores."""
        # 1. Obtain rule-based scores as supervised target reference
        scorer = PriorityScorer(data_dir=self.data_dir)
        scored_df = scorer.score_all(defects_df)

        # 2. Extract features
        features_df = extract_features(scored_df)
        X = features_df[FEATURE_COLUMNS].values
        y = features_df["rule_priority_score"].values

        # 3. Cross-validation evaluation
        kf = KFold(n_splits=5, shuffle=True, random_state=42)
        cv_preds = cross_val_predict(self.build_model(), X, y, cv=kf)

        r2 = round(float(r2_score(y, cv_preds)), 4)
        mae = round(float(mean_absolute_error(y, cv_preds)), 3)

        # Spearman rank correlation
        spearman_corr = round(float(pd.Series(y).corr(pd.Series(cv_preds), method="spearman")), 4)

        self.cv_metrics_ = {
            "r2_score": r2,
            "mean_absolute_error": mae,
            "spearman_rank_correlation": spearman_corr,
            "model_type": "XGBoost (XGBRegressor)" if HAS_XGBOOST else "Scikit-Learn (GradientBoostingRegressor)",
        }

        # 4. Train final model on full dataset
        self.model = self.build_model()
        self.model.fit(X, y)

        # Feature importances
        if hasattr(self.model, "feature_importances_"):
            raw_imp = self.model.feature_importances_
            imp_dict = {col: round(float(imp), 4) for col, imp in zip(FEATURE_COLUMNS, raw_imp)}
            # Sort by importance descending
            self.feature_importance_ = dict(
                sorted(imp_dict.items(), key=lambda item: item[1], reverse=True)
            )

        # 5. Predict ML scores
        ml_preds = self.model.predict(X)
        ml_preds = np.clip(ml_preds, 0.0, 100.0).round(2)

        # 6. Build combined prioritized table
        result_df = scored_df.copy()
        result_df["ml_priority_score"] = ml_preds

        # Composite score: 50% Rule + 50% ML prediction
        result_df["final_priority_score"] = (
            (0.5 * result_df["rule_priority_score"]) + (0.5 * result_df["ml_priority_score"])
        ).round(2)

        # Calculate ranks
        result_df.sort_values(
            by=["final_priority_score", "criticality_score", "overdue_days"],
            ascending=[False, False, False],
            inplace=True,
        )
        result_df.reset_index(drop=True, inplace=True)
        result_df["final_rank"] = result_df.index + 1

        result_df["rule_rank"] = (
            result_df["rule_priority_score"].rank(ascending=False, method="min").astype(int)
        )
        result_df["ml_rank"] = (
            result_df["ml_priority_score"].rank(ascending=False, method="min").astype(int)
        )
        result_df["rank_delta"] = result_df["rule_rank"] - result_df["ml_rank"]

        # Urgency band based on final_priority_score
        def assign_urgency(score: float) -> str:
            if score >= 80.0:
                return "P1 - Immediate"
            elif score >= 65.0:
                return "P2 - Urgent"
            elif score >= 45.0:
                return "P3 - Planned"
            else:
                return "P4 - Routine"

        result_df["final_urgency_band"] = result_df["final_priority_score"].apply(assign_urgency)

        self.prioritized_df = result_df
        return result_df

    def export_artifacts(self) -> dict[str, Path]:
        """Save model, prioritized defects CSV, and priority summary JSON."""
        if self.prioritized_df.empty:
            self.train_and_predict()

        self.integrated_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # Export CSV to both data/ and data/integrated/
        csv_path_1 = self.data_dir / "prioritized_defects.csv"
        csv_path_2 = self.integrated_dir / "prioritized_defects.csv"
        self.prioritized_df.to_csv(csv_path_1, index=False)
        self.prioritized_df.to_csv(csv_path_2, index=False)

        # Export Summary JSON to both data/ and data/integrated/
        summary_payload = self.get_summary()
        json_path_1 = self.data_dir / "priority_summary.json"
        json_path_2 = self.integrated_dir / "priority_summary.json"
        with json_path_1.open("w", encoding="utf-8") as f:
            json.dump(summary_payload, f, indent=2)
        with json_path_2.open("w", encoding="utf-8") as f:
            json.dump(summary_payload, f, indent=2)

        # Save model artifact
        model_path_1 = self.data_dir / "prioritization_model.joblib"
        model_path_2 = self.integrated_dir / "prioritization_model.joblib"
        joblib.dump(self.model, model_path_1)
        joblib.dump(self.model, model_path_2)

        return {
            "prioritized_defects_csv": csv_path_1,
            "priority_summary_json": json_path_1,
            "model_joblib": model_path_1,
        }

    def get_summary(self) -> dict[str, Any]:
        """Summary metrics including model performance, feature importance, and top ranked defects."""
        if self.prioritized_df.empty:
            self.train_and_predict()

        df = self.prioritized_df
        top_10 = df[
            [
                "final_rank",
                "rule_rank",
                "ml_rank",
                "defect_id",
                "department",
                "section_id",
                "defect_type",
                "severity",
                "overdue_days",
                "rule_priority_score",
                "ml_priority_score",
                "final_priority_score",
                "final_urgency_band",
            ]
        ].head(10).to_dict(orient="records")

        return {
            "total_defects_evaluated": len(df),
            "model_metrics": self.cv_metrics_,
            "feature_importance": self.feature_importance_,
            "urgency_distribution": df["final_urgency_band"].value_counts().to_dict(),
            "department_averages": df.groupby("department")["final_priority_score"].mean().round(2).to_dict(),
            "section_averages": df.groupby("section_id")["final_priority_score"].mean().round(2).to_dict(),
            "top_10_prioritized_defects": top_10,
        }


def run_prioritization(data_dir: Path | None = None) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Convenience helper to run full prioritization workflow and save artifacts."""
    model = MLPrioritizationModel(data_dir=data_dir)
    df = model.train_and_predict()
    model.export_artifacts()
    return df, model.get_summary()


if __name__ == "__main__":
    df, summary = run_prioritization()
    print("=== TOP 10 PRIORITIZED DEFECTS (Rule vs ML vs Final) ===")
    cols = [
        "final_rank",
        "rule_rank",
        "ml_rank",
        "defect_id",
        "department",
        "section_id",
        "severity",
        "overdue_days",
        "rule_priority_score",
        "ml_priority_score",
        "final_priority_score",
        "final_urgency_band",
    ]
    print(df[cols].head(10).to_string(index=False))

    print("\n=== MODEL PERFORMANCE & FEATURE IMPORTANCE ===")
    print(f"Model Type: {summary['model_metrics']['model_type']}")
    print(f"5-Fold CV R^2 Score: {summary['model_metrics']['r2_score']}")
    print(f"5-Fold CV MAE: {summary['model_metrics']['mean_absolute_error']}")
    print(f"Spearman Rank Correlation: {summary['model_metrics']['spearman_rank_correlation']}")
    print("\nFeature Importances:")
    for feat, imp in summary["feature_importance"].items():
        print(f"  {feat:26} : {imp:.4f} ({imp*100:.1f}%)")
