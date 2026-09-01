"""Data Integration Layer for SIH26027 Rail Block Planning.

Unifies corridor infrastructure, departmental defects (TMS/SMMS/TDMS),
and block availability slots (Timetable + Goods Forecast).

Provides:
- Section resolution & location metadata enrichment
- Candidate block slot assignment with suitability scoring
- Cross-departmental compatibility & bundling detection (TRD shadow blocks, joint engg/S&T)
- Conflict and mutual-exclusion analysis
- Data quality validation and export of integrated artifacts
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from paths import DATA_DIR, INTEGRATED_DIR, ensure_data_on_path

ensure_data_on_path()

from corridor import CORRIDOR, load_corridor, section_by_id, station_by_code
from generate_block_slots import SLOT_FIELDS, all_slots
from load_defects import load_defects
from load_slots import load_block_slots, load_goods_forecast
from section_resolver import corridor_section_spans, resolve_section_id, section_from_km


# Department Compatibility and Shadow Block Rules (Railway domain)
DEPARTMENT_RULES: dict[str, dict[str, Any]] = {
    "Engineering": {
        "requires_traffic_block": True,
        "requires_ohe_power_block_default": False,
        "compatible_co_located_depts": ["S&T", "TRD"],
        "description": "Track, P-way, ballast, sleepers, turnouts, and bridges.",
    },
    "S&T": {
        "requires_traffic_block": True,
        "requires_ohe_power_block_default": False,
        "compatible_co_located_depts": ["Engineering", "TRD"],
        "description": "Signalling, point machines, track circuits, Axle counters, and interlockings.",
    },
    "TRD": {
        "requires_traffic_block": True,
        "requires_ohe_power_block_default": True,
        "compatible_co_located_depts": ["Engineering", "S&T"],
        "description": "Traction Distribution, 25 kV AC OHE, catenary/contact wire, feeding posts, TSS.",
    },
}

KM_EXTRACTOR = re.compile(r"km\s*([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE)


def extract_km(location_str: str) -> float | None:
    """Extract numerical kilometrage from location description if present."""
    match = KM_EXTRACTOR.search(str(location_str))
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


@dataclass
class IntegratedDefect:
    defect_id: str
    department: str
    location: str
    section_id: str
    section_name: str
    chainage_km: float | None
    defect_type: str
    severity: str
    overdue_days: int
    estimated_duration_hours: float
    criticality_score: int
    asset_impact: str
    description: str
    requires_power_block: bool
    requires_traffic_block: bool


@dataclass
class CandidateAssignment:
    defect_id: str
    slot_id: str
    section_id: str
    department: str
    severity: str
    criticality_score: int
    defect_duration: float
    slot_duration: float
    duration_slack_hours: float
    is_fit: bool
    fit_category: str
    is_night_window: bool
    traffic_density: str
    slot_source: str
    slot_start: str
    slot_end: str
    max_tasks_possible: int
    suitability_score: float
    feasibility_notes: str


class DataIntegrator:
    """Unified integration pipeline for corridor, defects, and block availability."""

    def __init__(self, data_dir: Path | None = None, integrated_dir: Path | None = None):
        self.data_dir = data_dir or DATA_DIR
        self.integrated_dir = integrated_dir or INTEGRATED_DIR
        self.corridor = load_corridor()
        self.defects_df: pd.DataFrame = pd.DataFrame()
        self.slots_df: pd.DataFrame = pd.DataFrame()
        self.goods_forecast_df: pd.DataFrame = pd.DataFrame()
        self.integrated_defects: list[IntegratedDefect] = []
        self.candidate_assignments: list[CandidateAssignment] = []
        self.bundling_opportunities: list[dict[str, Any]] = []
        self.conflict_matrix: dict[str, Any] = {}
        self.data_quality_report: dict[str, Any] = {}

    def load_all(self) -> DataIntegrator:
        """Load and normalize all raw datasets."""
        self.defects_df = load_defects(self.data_dir)
        self.slots_df = load_block_slots(self.data_dir)
        self.goods_forecast_df = load_goods_forecast(self.data_dir)
        return self

    def resolve_and_enrich_defects(self) -> list[IntegratedDefect]:
        """Map each defect to corridor section and enrich with domain attributes."""
        enriched: list[IntegratedDefect] = []
        for _, row in self.defects_df.iterrows():
            loc = str(row["location"])
            section_id = resolve_section_id(loc, self.corridor)
            if not section_id:
                section_id = "UNKNOWN"
                section_name = "Unknown Section"
            else:
                section_name = section_by_id(section_id, self.corridor)["name"]

            km = extract_km(loc)
            dept = str(row["department"])

            # TRD items typically require 25 kV power shutdown.
            # LWR destressing or overhead clearance also benefits from power block.
            req_power = dept == "TRD" or "destressing" in str(row["defect_type"]).lower()
            req_traffic = True

            item = IntegratedDefect(
                defect_id=str(row["defect_id"]),
                department=dept,
                location=loc,
                section_id=section_id,
                section_name=section_name,
                chainage_km=km,
                defect_type=str(row["defect_type"]),
                severity=str(row["severity"]),
                overdue_days=int(row["overdue_days"]),
                estimated_duration_hours=float(row["estimated_duration_hours"]),
                criticality_score=int(row["criticality_score"]),
                asset_impact=str(row["asset_impact"]),
                description=str(row["description"]),
                requires_power_block=req_power,
                requires_traffic_block=req_traffic,
            )
            enriched.append(item)

        self.integrated_defects = enriched
        return enriched

    def evaluate_candidate_suitability(
        self, defect: IntegratedDefect, slot: pd.Series
    ) -> tuple[float, str, str, bool]:
        """Score suitability (0-100) of assigning a defect to a candidate slot.

        Returns (score, fit_category, feasibility_notes, is_fit).
        """
        slot_duration = float(slot["duration_hours"])
        defect_duration = defect.estimated_duration_hours
        slack = round(slot_duration - defect_duration, 2)
        is_night = bool(slot["is_night_window"])
        source = str(slot["source"])

        notes: list[str] = []
        score = 50.0  # baseline

        # 1. Duration Evaluation
        if slack >= 0:
            is_fit = True
            if slack <= 0.5:
                fit_cat = "tight_fit"
                score += 25.0
                notes.append("Optimal fit with minimal idle window")
            elif slack <= 2.0:
                fit_cat = "comfortable_fit"
                score += 20.0
                notes.append("Adequate buffer for setup and clearance")
            else:
                fit_cat = "excess_capacity"
                score += 10.0
                notes.append(f"Excess window capacity (+{slack}h) allows bundling additional tasks")
        else:
            # Slot is shorter than single estimated duration
            is_fit = False
            fit_cat = "insufficient_duration"
            score -= 30.0
            notes.append(f"Slot duration {slot_duration}h is less than required {defect_duration}h")

        # 2. Severity & Night Window Alignment
        if defect.severity == "High" or defect.criticality_score >= 8:
            if is_night:
                score += 20.0
                notes.append("High criticality matched to safe night corridor")
            else:
                # Daytime high-severity work
                if defect.section_id in {"SEC-01", "SEC-02", "SEC-05"}:
                    score -= 15.0
                    notes.append("Day block on high-density line causes high coaching punctuality impact")
                else:
                    score += 5.0
                    notes.append("Day shadow window on medium density line")
        elif defect.severity == "Medium":
            score += 10.0
        else:
            # Low severity work
            if not is_night:
                score += 15.0
                notes.append("Routine/low severity ideally executed during day shadow slots")
            else:
                score += 5.0

        # 3. Source & Density Synergies
        if source == "GoodsForecast":
            score += 10.0
            notes.append("Utilizes dynamic goods cancellation slot, protecting timetable paths")

        # 4. Overdue Urgency
        if defect.overdue_days >= 20:
            score += 10.0
            notes.append(f"High backlog age ({defect.overdue_days} days) boosts priority")

        final_score = max(0.0, min(100.0, round(score, 1)))
        return final_score, fit_cat, "; ".join(notes), is_fit

    def generate_candidate_assignments(self) -> list[CandidateAssignment]:
        """Generate all defect-to-slot candidate combinations on the same section."""
        if not self.integrated_defects:
            self.resolve_and_enrich_defects()

        assignments: list[CandidateAssignment] = []
        for defect in self.integrated_defects:
            # Match slots on the same section_id
            matching_slots = self.slots_df[self.slots_df["section_id"] == defect.section_id]
            for _, slot in matching_slots.iterrows():
                score, fit_cat, notes, is_fit = self.evaluate_candidate_suitability(defect, slot)
                slot_duration = float(slot["duration_hours"])
                slack = round(slot_duration - defect.estimated_duration_hours, 2)

                max_tasks = int(slot.get("max_tasks_possible", slot.get("max_tasks_allowed", 1)))

                assignment = CandidateAssignment(
                    defect_id=defect.defect_id,
                    slot_id=str(slot["slot_id"]),
                    section_id=defect.section_id,
                    department=defect.department,
                    severity=defect.severity,
                    criticality_score=defect.criticality_score,
                    defect_duration=defect.estimated_duration_hours,
                    slot_duration=slot_duration,
                    duration_slack_hours=slack,
                    is_fit=is_fit,
                    fit_category=fit_cat,
                    is_night_window=bool(slot["is_night_window"]),
                    traffic_density=str(slot["traffic_density"]),
                    slot_source=str(slot["source"]),
                    slot_start=str(slot["start_datetime"]),
                    slot_end=str(slot["end_datetime"]),
                    max_tasks_possible=max_tasks,
                    suitability_score=score,
                    feasibility_notes=notes,
                )
                assignments.append(assignment)

        self.candidate_assignments = assignments
        return assignments

    def detect_bundling_and_conflicts(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """Analyze cross-departmental bundling synergies and conflict constraints."""
        if not self.integrated_defects:
            self.resolve_and_enrich_defects()

        # Group defects by section
        by_section: dict[str, list[IntegratedDefect]] = {}
        for d in self.integrated_defects:
            by_section.setdefault(d.section_id, []).append(d)

        bundling_pairs: list[dict[str, Any]] = []
        conflict_list: list[dict[str, Any]] = []

        for section_id, def_list in by_section.items():
            n = len(def_list)
            for i in range(n):
                for j in range(i + 1, n):
                    d1 = def_list[i]
                    d2 = def_list[j]

                    depts = {d1.department, d2.department}
                    is_cross_dept = len(depts) > 1

                    # Check spatial proximity if km is known
                    spatial_distance_km: float | None = None
                    if d1.chainage_km is not None and d2.chainage_km is not None:
                        spatial_distance_km = round(abs(d1.chainage_km - d2.chainage_km), 2)

                    # Determine bundling synergy type
                    synergy_type = "standard_section_co_location"
                    can_bundle = True
                    synergy_rationale = []

                    # Synergy 1: TRD-Led Power Shadow Block
                    if "TRD" in depts:
                        trd_item = d1 if d1.department == "TRD" else d2
                        other_item = d2 if d1.department == "TRD" else d1
                        synergy_type = "trd_power_shadow_block"
                        synergy_rationale.append(
                            f"TRD power block for {trd_item.defect_type} de-energizes OHE; "
                            f"{other_item.department} ({other_item.defect_type}) can utilize the same traffic isolation."
                        )

                    # Synergy 2: Joint Track & S&T (Turnout / Point Machine / LC)
                    elif "Engineering" in depts and "S&T" in depts:
                        if (
                            "turnout" in d1.description.lower()
                            or "turnout" in d2.description.lower()
                            or "point" in d1.description.lower()
                            or "point" in d2.description.lower()
                        ):
                            synergy_type = "joint_point_and_crossing_block"
                            synergy_rationale.append(
                                "Engineering track replacement and S&T point machine maintenance can be executed jointly under coordinated sequence."
                            )
                        elif (
                            "lc-" in d1.location.lower()
                            or "lc-" in d2.location.lower()
                            or "level crossing" in d1.defect_type.lower()
                        ):
                            synergy_type = "joint_level_crossing_block"
                            synergy_rationale.append(
                                "Level crossing track surface overhaul combined with S&T gate interlocking maintenance."
                            )
                        else:
                            synergy_type = "engg_s_and_t_corridor_shadow"
                            synergy_rationale.append(
                                "Track maintenance and S&T cable/signal work share section traffic block."
                            )

                    # Synergy 3: Same Department Co-location
                    else:
                        synergy_type = f"same_dept_multi_task_{d1.department.lower()}"
                        synergy_rationale.append(
                            f"Two {d1.department} tasks on {section_id} scheduled in sequence or with split gang."
                        )

                    # Conflict / Restriction Check
                    has_conflict = False
                    conflict_reason = ""

                    # Heavy turnout replacement vs instant S&T testing
                    if (
                        d1.defect_type == "Point and crossing wear"
                        and d2.defect_type == "Signal failure (interlocking/track circuit)"
                        and spatial_distance_km is not None
                        and spatial_distance_km < 1.0
                    ):
                        has_conflict = True
                        conflict_reason = "Track geometry must be packed and normalized before final S&T signal certification."

                    pair_info = {
                        "section_id": section_id,
                        "defect_1": {
                            "id": d1.defect_id,
                            "department": d1.department,
                            "type": d1.defect_type,
                            "severity": d1.severity,
                            "duration": d1.estimated_duration_hours,
                        },
                        "defect_2": {
                            "id": d2.defect_id,
                            "department": d2.department,
                            "type": d2.defect_type,
                            "severity": d2.severity,
                            "duration": d2.estimated_duration_hours,
                        },
                        "is_cross_department": is_cross_dept,
                        "departments": sorted(list(depts)),
                        "spatial_distance_km": spatial_distance_km,
                        "synergy_type": synergy_type,
                        "synergy_rationale": " ".join(synergy_rationale),
                        "can_bundle": can_bundle,
                        "has_operational_constraint": has_conflict,
                        "constraint_description": conflict_reason if has_conflict else "None (fully compatible)",
                    }
                    bundling_pairs.append(pair_info)
                    if has_conflict:
                        conflict_list.append(pair_info)

        self.bundling_opportunities = bundling_pairs
        self.conflict_matrix = {
            "total_defect_pairs_evaluated": len(bundling_pairs),
            "cross_department_pairs": sum(1 for p in bundling_pairs if p["is_cross_department"]),
            "trd_shadow_block_pairs": sum(
                1 for p in bundling_pairs if p["synergy_type"] == "trd_power_shadow_block"
            ),
            "joint_engg_st_pairs": sum(1 for p in bundling_pairs if "joint" in p["synergy_type"]),
            "same_department_pairs": sum(1 for p in bundling_pairs if not p["is_cross_department"]),
            "operational_conflict_pairs": len(conflict_list),
            "conflicts": conflict_list,
            "bundling_opportunities": bundling_pairs,
        }
        return bundling_pairs, self.conflict_matrix

    def run_data_quality_checks(self) -> dict[str, Any]:
        """Verify complete data integrity across corridor, defects, and slots."""
        if not self.integrated_defects:
            self.resolve_and_enrich_defects()

        unmapped_defects = [
            d.defect_id for d in self.integrated_defects if d.section_id == "UNKNOWN"
        ]
        missing_durations = [
            d.defect_id for d in self.integrated_defects if d.estimated_duration_hours <= 0
        ]
        invalid_severity = [
            d.defect_id
            for d in self.integrated_defects
            if d.severity not in {"High", "Medium", "Low"}
        ]

        slots_with_zero_dur = self.slots_df[self.slots_df["duration_hours"] <= 0]["slot_id"].tolist()
        unmatched_sections_in_slots = set(self.slots_df["section_id"]) - {
            s["section_id"] for s in self.corridor["block_sections"]
        }

        status = (
            "PASS"
            if not (
                unmapped_defects
                or missing_durations
                or invalid_severity
                or slots_with_zero_dur
                or unmatched_sections_in_slots
            )
            else "WARNING"
        )

        self.data_quality_report = {
            "status": status,
            "total_defects_checked": len(self.integrated_defects),
            "unmapped_defects_count": len(unmapped_defects),
            "missing_durations_count": len(missing_durations),
            "invalid_severity_count": len(invalid_severity),
            "total_slots_checked": len(self.slots_df),
            "invalid_slots_count": len(slots_with_zero_dur),
            "unmatched_sections_count": len(unmatched_sections_in_slots),
            "checks": {
                "100_pct_defects_section_resolved": len(unmapped_defects) == 0,
                "valid_durations_on_all_defects": len(missing_durations) == 0,
                "valid_severity_categories": len(invalid_severity) == 0,
                "all_slot_durations_positive": len(slots_with_zero_dur) == 0,
                "all_slot_sections_valid": len(unmatched_sections_in_slots) == 0,
            },
        }
        return self.data_quality_report

    def export_integrated_artifacts(self) -> dict[str, Path]:
        """Export all processed integration outputs to data/integrated/."""
        self.integrated_dir.mkdir(parents=True, exist_ok=True)

        if not self.candidate_assignments:
            self.generate_candidate_assignments()
        if not self.bundling_opportunities:
            self.detect_bundling_and_conflicts()
        if not self.data_quality_report:
            self.run_data_quality_checks()

        # 1. candidate_assignments.csv
        cand_df = pd.DataFrame([asdict(c) for c in self.candidate_assignments])
        cand_path = self.integrated_dir / "candidate_assignments.csv"
        cand_df.to_csv(cand_path, index=False)

        # 2. conflict_matrix.json
        conflict_path = self.integrated_dir / "conflict_matrix.json"
        with conflict_path.open("w", encoding="utf-8") as f:
            json.dump(self.conflict_matrix, f, indent=2)

        # 3. integrated_summary.json
        summary_payload = self.get_summary()
        summary_path = self.integrated_dir / "integrated_summary.json"
        with summary_path.open("w", encoding="utf-8") as f:
            json.dump(summary_payload, f, indent=2)

        return {
            "candidate_assignments_csv": cand_path,
            "conflict_matrix_json": conflict_path,
            "integrated_summary_json": summary_path,
        }

    def get_summary(self) -> dict[str, Any]:
        """Generate high-level statistical summary of integrated datasets."""
        if not self.candidate_assignments:
            self.generate_candidate_assignments()
        if not self.bundling_opportunities:
            self.detect_bundling_and_conflicts()
        if not self.data_quality_report:
            self.run_data_quality_checks()

        cand_df = pd.DataFrame([asdict(c) for c in self.candidate_assignments])
        fits = cand_df[cand_df["is_fit"] == True]

        # Bundling potential: defects that participate in at least one valid bundle pair
        bundled_defect_ids = set()
        for p in self.bundling_opportunities:
            if p["can_bundle"]:
                bundled_defect_ids.add(p["defect_1"]["id"])
                bundled_defect_ids.add(p["defect_2"]["id"])

        return {
            "corridor_id": self.corridor["corridor_id"],
            "corridor_name": self.corridor["corridor_name"],
            "total_stations": len(self.corridor["stations"]),
            "total_sections": len(self.corridor["block_sections"]),
            "total_defects": len(self.integrated_defects),
            "defects_by_department": self.defects_df["department"].value_counts().to_dict(),
            "defects_by_severity": self.defects_df["severity"].value_counts().to_dict(),
            "total_block_slots": len(self.slots_df),
            "slots_by_source": self.slots_df["source"].value_counts().to_dict(),
            "total_candidate_assignments": len(self.candidate_assignments),
            "direct_fit_candidate_assignments": len(fits),
            "avg_candidates_per_defect": round(
                len(self.candidate_assignments) / max(1, len(self.integrated_defects)), 1
            ),
            "avg_fit_candidates_per_defect": round(
                len(fits) / max(1, len(self.integrated_defects)), 1
            ),
            "total_bundling_pairs": len(self.bundling_opportunities),
            "cross_department_bundling_pairs": self.conflict_matrix["cross_department_pairs"],
            "trd_power_shadow_bundling_pairs": self.conflict_matrix["trd_shadow_block_pairs"],
            "defects_eligible_for_bundling": len(bundled_defect_ids),
            "bundling_eligibility_pct": round(
                (len(bundled_defect_ids) / max(1, len(self.integrated_defects))) * 100, 1
            ),
            "data_quality_status": self.data_quality_report["status"],
        }


def run_integration(
    data_dir: Path | None = None, integrated_dir: Path | None = None
) -> dict[str, Any]:
    """Convenience function to run end-to-end integration and return summary."""
    integrator = DataIntegrator(data_dir=data_dir, integrated_dir=integrated_dir)
    integrator.load_all()
    integrator.resolve_and_enrich_defects()
    integrator.generate_candidate_assignments()
    integrator.detect_bundling_and_conflicts()
    integrator.run_data_quality_checks()
    integrator.export_integrated_artifacts()
    return integrator.get_summary()


if __name__ == "__main__":
    summary = run_integration()
    print(json.dumps(summary, indent=2))
