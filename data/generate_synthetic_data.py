"""Generate realistic TMS / SMMS / TDMS defect CSVs for the CNB–PRYJ corridor.

Run from the project root:

    python data/generate_synthetic_data.py
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent

DEFECT_FIELDS = [
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


def tms_defects() -> list[dict[str, Any]]:
    """Engineering / Track Management System backlog (22 records)."""
    return [
        _row("TMS-001", "Engineering", "SEC-01 / km 4.8 (CNB–CNBI Up)", "Rail fracture (suspect)", "High", 6, 4.0, 10, "High", "Ultrasonic indication of transverse defect on 60 kg 90 UTS rail; TSR 30 km/h in force."),
        _row("TMS-002", "Engineering", "CNB Yard (PF-3 turnout 12A)", "Point and crossing wear", "High", 11, 6.0, 9, "High", "Nose and wing rail wear beyond condemning limit; affects coaching dispatch from Kanpur Central."),
        _row("TMS-003", "Engineering", "PNKD / km 14.2 Down", "Weld failure (AT weld)", "High", 3, 5.0, 9, "High", "Alumino-thermit weld dipped; requires destressing and re-weld under traffic block."),
        _row("TMS-004", "Engineering", "SEC-01 / km 28.6", "Gauge slack", "Medium", 18, 3.0, 7, "Medium", "Wide gauge 8 mm over 12 m chord on high-speed stretch; tamping + gauging needed."),
        _row("TMS-005", "Engineering", "SEC-02 / km 58.1 (BKO–FTP)", "Ballast deficiency", "Medium", 24, 8.0, 6, "Medium", "Cushion below 250 mm after monsoon; machine packing preferred with 6–8 hour corridor block."),
        _row("TMS-006", "Engineering", "FTP Yard (loop 2)", "Sleeper damage (PSC)", "Medium", 9, 4.5, 6, "Medium", "Cluster of cracked PSC sleepers at loop turnout; replacement before monsoon inspection."),
        _row("TMS-007", "Engineering", "SEC-03 / km 91.4", "Rail corrugation", "Low", 41, 6.0, 4, "Low", "Short-pitch corrugation on Down line; grinding requested, not safety-critical yet."),
        _row("TMS-008", "Engineering", "KGA / km 113.5 Up", "Hanging sleeper", "Medium", 14, 3.5, 7, "Medium", "Voiding under 9 sleepers; risk of geometry burst at 110 km/h."),
        _row("TMS-009", "Engineering", "SEC-04 / km 128.0 (KGA–SRO)", "Track geometry (twist)", "High", 5, 5.0, 8, "High", "Twist 4.2 mm/3 m recorded on TRC; speed restriction 50 km/h pending packing."),
        _row("TMS-010", "Engineering", "SRO Yard", "Level crossing road surface (engg.)", "Low", 33, 2.5, 3, "Low", "LC-42A approaches potholed; engineering share of joint block with S&T."),
        _row("TMS-011", "Engineering", "SEC-04 / km 148.7", "Rail wear (lateral)", "Medium", 21, 7.0, 6, "Medium", "Curve 2.5° lateral wear approaching 50% head; planned rail renewal patch."),
        _row("TMS-012", "Engineering", "BRE / km 160.2", "Bridge approach settlement", "High", 8, 6.5, 9, "High", "Minor bridge 412 approach dip 18 mm; packing and approach rail destressing needed."),
        _row("TMS-013", "Engineering", "SEC-05 / km 178.4 (SYWN–SFG)", "Rail fracture (suspect)", "High", 2, 4.0, 10, "High", "USFD cluster of 3 defects in 200 m; night block preferred before PRYJ terminal peak."),
        _row("TMS-014", "Engineering", "SFG Yard (goods lead)", "Point and crossing wear", "Medium", 16, 5.5, 7, "High", "1:12 turnout on goods lead to Subedarganj yard; delays inward rakes if failed."),
        _row("TMS-015", "Engineering", "PRYJ Yard (PF-6)", "Track geometry (unevenness)", "Medium", 12, 4.0, 6, "Medium", "Coaching pit approach unevenness; affects rake placement at Prayagraj Junction."),
        _row("TMS-016", "Engineering", "SEC-02 / km 68.9", "LWR destressing overdue", "Medium", 27, 8.0, 7, "Medium", "LWR panel overdue destressing before summer; needs 25 kV power block coordination with TRD."),
        _row("TMS-017", "Engineering", "CNBI / km 8.1", "Sleeper damage (PSC)", "Low", 38, 3.0, 3, "Low", "Isolated cracked sleepers on slow line; can wait for machine block."),
        _row("TMS-018", "Engineering", "SEC-03 / km 102.6", "Ballast deficiency", "Low", 45, 7.0, 4, "Low", "Shoulder ballast flow after rains; sectional goods can be diverted via day shadow block."),
        _row("TMS-019", "Engineering", "FTP / km 77.8 Down", "Weld failure (flash butt)", "High", 4, 5.5, 9, "High", "Cupped FBW at station limit; TSR 20 km/h affecting Fatehpur stoppers."),
        _row("TMS-020", "Engineering", "SEC-01 / km 39.2", "Rail wear (vertical)", "Medium", 19, 6.0, 5, "Medium", "Vertical wear 12 mm on 20-year-old 60 kg rail; planned insertion of 1.2 km panel."),
        _row("TMS-021", "Engineering", "SEC-05 / km 194.0 (SFG–PRYJ)", "Gauge slack", "High", 7, 3.5, 8, "High", "Slack gauge on automatic block approach; high coaching density into PRYJ."),
        _row("TMS-022", "Engineering", "BKO Yard", "Hanging sleeper", "Low", 29, 2.5, 4, "Low", "Loop line voiding; no effect on main line if isolated."),
    ]


def smms_defects() -> list[dict[str, Any]]:
    """S&T / Signalling Maintenance & Management System backlog (16 records)."""
    return [
        _row("SMMS-001", "S&T", "CNB (RRI cabin)", "Interlocking relay / EI card fault", "High", 5, 6.0, 10, "High", "Electronic interlocking I/O card intermittent; risk of route locking failure at Kanpur Central."),
        _row("SMMS-002", "S&T", "SEC-01 / IB between PNKD–BKO", "Axle counter disturbance", "High", 9, 4.0, 9, "High", "Multi-section axle counter reset failures; trains running on paper line-clear during peaks."),
        _row("SMMS-003", "S&T", "PNKD (points 21/22)", "Point machine sluggish", "Medium", 13, 3.5, 7, "Medium", "IRS point machine throwing time > 4 s; needs overhauling under disconnection."),
        _row("SMMS-004", "S&T", "SEC-02 / LC-28", "LC gate interlocking defect", "High", 4, 3.0, 9, "High", "Boom locking circuit not proving; engineering + S&T joint block mandatory."),
        _row("SMMS-005", "S&T", "FTP (home signal Up)", "Signal lamp / LED module failure", "Medium", 8, 2.0, 6, "Medium", "Cold LED bank on Up home; redundant filament still OK but overdue replacement."),
        _row("SMMS-006", "S&T", "SEC-03 / km 88.0", "Track circuit failure", "High", 2, 4.5, 9, "High", "DC track circuit pumping in wet weather; false occupancy, capacity loss ~4 paths/hour."),
        _row("SMMS-007", "S&T", "KGA cabin", "Cable insulation / megger fail", "Medium", 22, 5.0, 6, "Medium", "Main cable megger < 1 MΩ; replacement of 400 m quad under traffic block."),
        _row("SMMS-008", "S&T", "SRO (starter Down)", "Signal lamp / LED module failure", "Low", 31, 1.5, 3, "Low", "Route indicator LED dim; not affecting main aspect."),
        _row("SMMS-009", "S&T", "SEC-04 / IBS SRO–BRE", "Axle counter disturbance", "Medium", 15, 3.5, 7, "Medium", "Preparatory reset frequent in fog; medium density but crew complaints high."),
        _row("SMMS-010", "S&T", "BRE (points 11)", "Point machine sluggish", "High", 6, 3.0, 8, "High", "Detection chatter; possible split if not attended before summer expansion."),
        _row("SMMS-011", "S&T", "SFG Yard", "Track circuit failure", "Medium", 17, 4.0, 7, "High", "Yard berthing track shows occupied; inbound goods held at outer, asset idle."),
        _row("SMMS-012", "S&T", "PRYJ (EI)", "Interlocking relay / EI card fault", "High", 1, 7.0, 10, "High", "Hot standby mismatch after power dip; division HQ station — treat as emergency."),
        _row("SMMS-013", "S&T", "SEC-05 auto signals A-14/A-16", "Signal lamp / LED module failure", "Medium", 10, 2.5, 5, "Medium", "Two consecutive auto signals degraded; headway increase for MEMU into PRYJ."),
        _row("SMMS-014", "S&T", "BKO cabin", "Cable cut (suspected rodent)", "Low", 27, 3.0, 4, "Low", "Spare quad damaged; main working pair healthy."),
        _row("SMMS-015", "S&T", "FTP / LC-35", "LC gate interlocking defect", "Medium", 12, 3.0, 7, "Medium", "Hooter and boom not in correspondence; joint S&T–Engineering window."),
        _row("SMMS-016", "S&T", "CNBI (slot circuit)", "Track circuit failure", "Low", 36, 2.5, 3, "Low", "Slot circuit voltage drop; can be patched in night shadow without full corridor block."),
    ]


def tdms_defects() -> list[dict[str, Any]]:
    """TRD / Traction Distribution Management System backlog (14 records)."""
    return [
        _row("TDMS-001", "TRD", "SP Panki (SEC-01)", "Section insulator defect", "High", 7, 5.0, 9, "High", "Section insulator pitting; risk of pantograph entanglement on Up high-density line."),
        _row("TDMS-002", "TRD", "SEC-01 / km 22.4", "Contact wire wear", "High", 10, 6.0, 9, "High", "Contact wire residual 8.6 mm (condemn 8.25 mm); replacement needs power + traffic block."),
        _row("TDMS-003", "TRD", "PNKD ATD", "Auto tensioning device seized", "Medium", 14, 3.5, 7, "Medium", "ATD pulley not paying out; sag variation with temperature, sparking reported."),
        _row("TDMS-004", "TRD", "SSP Bindki Road", "CB trip / protection mal-op", "High", 3, 4.0, 8, "High", "Feeder CB nuisance trip; OHE isolation of SEC-02 during peaks."),
        _row("TDMS-005", "TRD", "SEC-02 / km 63.0", "Insulator flashover", "Medium", 19, 3.0, 6, "Medium", "Stay tube insulator pollution flashover after fog; washing + replacement."),
        _row("TDMS-006", "TRD", "SP Fatehpur", "Transformer oil leak (AT)", "Medium", 21, 5.5, 7, "High", "Auxiliary transformer weeping at bushing; if failed, station lighting/signalling UPS stressed."),
        _row("TDMS-007", "TRD", "SEC-03 / km 96.8", "Catenary sag / stagger out", "Low", 34, 4.0, 4, "Low", "Stagger at cantilever 4 beyond 200 mm; plan with Engineering destressing."),
        _row("TDMS-008", "TRD", "KGA / mast 412/8", "Mast foundation settlement", "High", 8, 7.0, 8, "High", "OHE mast tilt 1.8° after monsoon; guy and foundation repair needs long block."),
        _row("TDMS-009", "TRD", "SSP Sirathu", "Jumper loose / hot spot", "Medium", 11, 2.5, 6, "Medium", "Thermovision 78 °C on feeder jumper; tighten under power block."),
        _row("TDMS-010", "TRD", "SEC-04 / km 152.1", "Contact wire wear", "Medium", 16, 6.0, 6, "Medium", "Localized wear at overlap; medium density allows day shadow if goods forecast permits."),
        _row("TDMS-011", "TRD", "SP Subedarganj", "Section insulator defect", "High", 4, 5.0, 9, "High", "Neutral section rough ride reported by Rajdhani crew; PRYJ approach — high impact."),
        _row("TDMS-012", "TRD", "SFG Yard OHE", "Insulator flashover", "Low", 28, 2.5, 3, "Low", "Yard line insulator; can be isolated without main line block."),
        _row("TDMS-013", "TRD", "SEC-05 / km 198.5", "Auto tensioning device seized", "Medium", 9, 3.5, 7, "High", "ATD on PRYJ approach; summer expansion risk of pantograph hook-up."),
        _row("TDMS-014", "TRD", "PRYJ / TSS feed", "CB trip / protection mal-op", "High", 2, 4.5, 10, "High", "Incoming 132 kV CB slow to close after trip; terminal station outage risk."),
    ]


def _row(
    defect_id: str,
    department: str,
    location: str,
    defect_type: str,
    severity: str,
    overdue_days: int,
    estimated_duration_hours: float,
    criticality_score: int,
    asset_impact: str,
    description: str,
) -> dict[str, Any]:
    return {
        "defect_id": defect_id,
        "department": department,
        "location": location,
        "defect_type": defect_type,
        "severity": severity,
        "overdue_days": overdue_days,
        "estimated_duration_hours": estimated_duration_hours,
        "criticality_score": criticality_score,
        "asset_impact": asset_impact,
        "description": description,
    }


def all_defects() -> list[dict[str, Any]]:
    return tms_defects() + smms_defects() + tdms_defects()


def summarize(records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Counts by department and severity for dashboards / tests."""
    rows = records if records is not None else all_defects()
    by_dept = Counter(r["department"] for r in rows)
    by_sev = Counter(r["severity"] for r in rows)
    by_dept_sev: dict[str, dict[str, int]] = {}
    for row in rows:
        dept = row["department"]
        sev = row["severity"]
        by_dept_sev.setdefault(dept, Counter())
        by_dept_sev[dept][sev] += 1
    nested = {dept: dict(counts) for dept, counts in by_dept_sev.items()}
    return {
        "total": len(rows),
        "by_department": dict(by_dept),
        "by_severity": dict(by_sev),
        "by_department_and_severity": nested,
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=DEFECT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def write_all(data_dir: Path | None = None) -> dict[str, Any]:
    """Write the three CSVs and a JSON summary; return the summary dict."""
    root = data_dir or DATA_DIR
    write_csv(root / "tms_defects.csv", tms_defects())
    write_csv(root / "smms_defects.csv", smms_defects())
    write_csv(root / "tdms_defects.csv", tdms_defects())
    summary = summarize()
    with (root / "defect_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)
        handle.write("\n")
    return summary


if __name__ == "__main__":
    result = write_all()
    print(json.dumps(result, indent=2))
