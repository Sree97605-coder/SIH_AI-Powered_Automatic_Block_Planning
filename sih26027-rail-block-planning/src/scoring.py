"""Rule-Based Priority & Criticality Scoring Engine for SIH26027.

Computes multi-criteria composite priority scores (0–100) for railway defects.

Scoring Formula Weights (Total = 100 points):
1. Base Criticality Score (Weight: 35%):
   score = (criticality_score / 10.0) * 35.0
2. Severity Level (Weight: 15%):
   High = 15.0, Medium = 9.75 (65%), Low = 4.5 (30%)
3. Backlog Aging / Overdue Escalation (Weight: 20%):
   score = min(1.0, overdue_days / 40.0) * 20.0
4. Asset Impact / Safety Risk (Weight: 15%):
   High = 15.0, Medium = 9.75 (65%), Low = 4.5 (30%)
5. Section Traffic Density (Weight: 10%):
   High Density (SEC-01, SEC-02, SEC-05) = 10.0, Medium Density (SEC-03, SEC-04) = 5.0
6. Estimated Duration Complexity (Weight: 5%):
   score = min(1.0, estimated_duration_hours / 8.0) * 5.0

Urgency Classification:
- P1 (Immediate): Score >= 80.0
- P2 (Urgent): 65.0 <= Score < 80.0
- P3 (Planned): 45.0 <= Score < 65.0
- P4 (Routine): Score < 45.0
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from paths import DATA_DIR, INTEGRATED_DIR, ensure_data_on_path

ensure_data_on_path()

from corridor import CORRIDOR, section_by_id
from load_defects import load_defects
from section_resolver import resolve_section_id

# Scoring Formula Weights
WEIGHT_CRITICALITY = 35.0
WEIGHT_SEVERITY = 15.0
WEIGHT_AGING = 20.0
WEIGHT_ASSET_IMPACT = 15.0
WEIGHT_TRAFFIC_DENSITY = 10.0
WEIGHT_DURATION = 5.0

SEVERITY_FACTORS = {
    "High": 1.0,
    "Medium": 0.65,
    "Low": 0.30,
}

ASSET_IMPACT_FACTORS = {
    "High": 1.0,
    "Medium": 0.65,
    "Low": 0.30,
}

HIGH_DENSITY_SECTIONS = {"SEC-01", "SEC-02", "SEC-05"}


@dataclass
class ScoredDefect:
    defect_id: str
    department: str
    location: str
    section_id: str
    section_name: str
    defect_type: str
    severity: str
    overdue_days: int
    estimated_duration_hours: float
    criticality_score: int
    asset_impact: str
    description: str
    criticality_component: float
    severity_component: float
    aging_component: float
    asset_impact_component: float
    density_component: float
    duration_component: float
    rule_priority_score: float
    urgency_band: str
    priority_rank: int = 0


def calculate_rule_priority(defect_row: dict[str, Any] | pd.Series, corridor: dict[str, Any] | None = None) -> dict[str, Any]:
    """Compute individual score components and final priority score for one defect."""
    corr = corridor or CORRIDOR
    loc = str(defect_row.get("location", ""))
    sec_id = str(defect_row.get("section_id", ""))
    if not sec_id or sec_id == "UNKNOWN" or sec_id == "nan":
        sec_id = resolve_section_id(loc, corr) or "SEC-01"

    sec_info = section_by_id(sec_id, corr)
    sec_name = sec_info["name"]
    is_high_density = sec_id in HIGH_DENSITY_SECTIONS

    crit_val = float(defect_row.get("criticality_score", 5))
    crit_comp = round((crit_val / 10.0) * WEIGHT_CRITICALITY, 2)

    sev_str = str(defect_row.get("severity", "Medium"))
    sev_factor = SEVERITY_FACTORS.get(sev_str, 0.65)
    sev_comp = round(sev_factor * WEIGHT_SEVERITY, 2)

    overdue = float(defect_row.get("overdue_days", 0))
    aging_factor = min(1.0, overdue / 40.0)
    aging_comp = round(aging_factor * WEIGHT_AGING, 2)

    impact_str = str(defect_row.get("asset_impact", "Medium"))
    impact_factor = ASSET_IMPACT_FACTORS.get(impact_str, 0.65)
    impact_comp = round(impact_factor * WEIGHT_ASSET_IMPACT, 2)

    density_comp = WEIGHT_TRAFFIC_DENSITY if is_high_density else (WEIGHT_TRAFFIC_DENSITY * 0.5)
    density_comp = round(density_comp, 2)

    dur = float(defect_row.get("estimated_duration_hours", 3.0))
    dur_factor = min(1.0, dur / 8.0)
    dur_comp = round(dur_factor * WEIGHT_DURATION, 2)

    total_score = round(crit_comp + sev_comp + aging_comp + impact_comp + density_comp + dur_comp, 2)
    total_score = max(0.0, min(100.0, total_score))

    if total_score >= 80.0:
        urgency = "P1 - Immediate"
    elif total_score >= 65.0:
        urgency = "P2 - Urgent"
    elif total_score >= 45.0:
        urgency = "P3 - Planned"
    else:
        urgency = "P4 - Routine"

    return {
        "defect_id": str(defect_row.get("defect_id", "")),
        "department": str(defect_row.get("department", "")),
        "location": loc,
        "section_id": sec_id,
        "section_name": sec_name,
        "defect_type": str(defect_row.get("defect_type", "")),
        "severity": sev_str,
        "overdue_days": int(overdue),
        "estimated_duration_hours": dur,
        "criticality_score": int(crit_val),
        "asset_impact": impact_str,
        "description": str(defect_row.get("description", "")),
        "criticality_component": crit_comp,
        "severity_component": sev_comp,
        "aging_component": aging_comp,
        "asset_impact_component": impact_comp,
        "density_component": density_comp,
        "duration_component": dur_comp,
        "rule_priority_score": total_score,
        "urgency_band": urgency,
    }


class PriorityScorer:
    """Batch scoring engine for departmental maintenance defects."""

    def __init__(self, data_dir: Path | None = None):
        self.data_dir = data_dir or DATA_DIR
        self.corridor = CORRIDOR
        self.scored_defects: list[ScoredDefect] = []

    def score_all(self, defects_df: pd.DataFrame | None = None) -> pd.DataFrame:
        """Score and rank all defects in descending order of rule_priority_score."""
        df = defects_df.copy() if defects_df is not None else load_defects(self.data_dir)
        scored_list: list[dict[str, Any]] = []

        for _, row in df.iterrows():
            item = calculate_rule_priority(row, self.corridor)
            scored_list.append(item)

        scored_df = pd.DataFrame(scored_list)
        scored_df.sort_values(
            by=["rule_priority_score", "criticality_score", "overdue_days"],
            ascending=[False, False, False],
            inplace=True,
        )
        scored_df.reset_index(drop=True, inplace=True)
        scored_df["priority_rank"] = scored_df.index + 1

        self.scored_defects = [ScoredDefect(**r) for r in scored_df.to_dict(orient="records")]
        return scored_df

    def get_summary(self, scored_df: pd.DataFrame | None = None) -> dict[str, Any]:
        """Generate statistical summary of rule-based prioritization."""
        df = scored_df if scored_df is not None else self.score_all()
        return {
            "total_defects_scored": len(df),
            "mean_priority_score": round(float(df["rule_priority_score"].mean()), 2),
            "max_priority_score": round(float(df["rule_priority_score"].max()), 2),
            "min_priority_score": round(float(df["rule_priority_score"].min()), 2),
            "urgency_distribution": df["urgency_band"].value_counts().to_dict(),
            "department_breakdown": df.groupby("department")["rule_priority_score"].mean().round(2).to_dict(),
            "section_breakdown": df.groupby("section_id")["rule_priority_score"].mean().round(2).to_dict(),
            "top_5_defects": df[["priority_rank", "defect_id", "department", "section_id", "rule_priority_score", "urgency_band"]].head(5).to_dict(orient="records"),
        }


def score_defects(data_dir: Path | None = None) -> pd.DataFrame:
    """Convenience helper to score and return ranked DataFrame."""
    scorer = PriorityScorer(data_dir=data_dir)
    return scorer.score_all()


if __name__ == "__main__":
    scorer = PriorityScorer()
    df = scorer.score_all()
    print("Top 10 Defects by Rule Priority Score:")
    cols = ["priority_rank", "defect_id", "department", "section_id", "severity", "overdue_days", "rule_priority_score", "urgency_band"]
    print(df[cols].head(10).to_string(index=False))
    print("\nSummary:")
    print(json.dumps(scorer.get_summary(df), indent=2))
