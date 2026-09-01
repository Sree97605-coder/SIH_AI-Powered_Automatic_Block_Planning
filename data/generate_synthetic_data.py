"""Generate realistic TMS / SMMS / TDMS defect CSVs for the CNB–PRYJ corridor.

Run from the project root:

    python data/generate_synthetic_data.py

Duration calibration policy
----------------------------
estimated_duration_hours represents the planned execution time for a SINGLE
traffic possession/block window. This is the binding constraint the optimizer
uses for slot eligibility.

Maximum available block windows on this corridor (weekly horizon):
  SEC-01 (High density): max 4.0 h  — 00:40–04:40 on extended-slot nights
  SEC-02 (High density): max 3.67 h — 01:10–04:50 on extended nights
  SEC-03 (Medium):       max 3.0 h  — 01:30–04:30 night / 10:30–13:00 day
  SEC-04 (Medium):       max 3.0 h  — 02:00–05:00 or 09:45–12:45
  SEC-05 (High density): max 4.0 h  — 00:20–04:20 on extended nights

Jobs that operationally require more total man-hours than a single window
(e.g. LWR destressing, rail panel renewal, bridge approach packing) are
modelled as multi-night sequential sessions. Each session duration is set
to the schedulable window for that section. The description notes the
multi-session nature. The MILP schedules one session per slot; the AEN /
PWI must then plan consecutive or proximate nights.
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
    """Engineering / Track Management System backlog (22 records).

    Duration calibration notes:
    - Rail fracture / P&C wear: 3.5–4.0 h (fits SEC-01 / SEC-05 windows)
    - AT weld / FBW: 3.0 h per session (fit medium-density 3 h windows)
    - LWR destressing: 3.5 h per session (needs 2–3 consecutive nights; noted in description)
    - Ballast deficiency (machine packing): 3.0 h per session (2 sessions planned)
    - Rail corrugation (grinding): 3.0 h per session (day shadow SEC-03)
    - Rail wear panel insertion: 3.5 h per session (2 nights SEC-01)
    """
    return [
        _row("TMS-001", "Engineering", "SEC-01 / km 4.8 (CNB–CNBI Up)", "Rail fracture (suspect)", "High", 6, 4.0, 10, "High", "Ultrasonic indication of transverse defect on 60 kg 90 UTS rail; TSR 30 km/h in force. Single-session possession."),
        _row("TMS-002", "Engineering", "CNB Yard (PF-3 turnout 12A)", "Point and crossing wear", "High", 11, 3.5, 9, "High", "Nose and wing rail wear beyond condemning limit; affects coaching dispatch. Session 1 of 2 (closure + measurement); Session 2 next night."),
        _row("TMS-003", "Engineering", "PNKD / km 14.2 Down", "Weld failure (AT weld)", "High", 3, 3.0, 9, "High", "Alumino-thermit weld dipped; requires destressing and re-weld under traffic block. Single session; preheating done during corridor."),
        _row("TMS-004", "Engineering", "SEC-01 / km 28.6", "Gauge slack", "Medium", 18, 3.0, 7, "Medium", "Wide gauge 8 mm over 12 m chord on high-speed stretch; tamping + gauging needed."),
        _row("TMS-005", "Engineering", "SEC-02 / km 58.1 (BKO–FTP)", "Ballast deficiency", "Medium", 24, 3.0, 6, "Medium", "Cushion below 250 mm after monsoon; machine packing. Session 1 of 2 (3 h/night, 2 nights). Total 6 h spread over consecutive nights."),
        _row("TMS-006", "Engineering", "FTP Yard (loop 2)", "Sleeper damage (PSC)", "Medium", 9, 3.0, 6, "Medium", "Cluster of cracked PSC sleepers at loop turnout; replacement before monsoon inspection. Single session."),
        _row("TMS-007", "Engineering", "SEC-03 / km 91.4", "Rail corrugation", "Low", 41, 3.0, 4, "Low", "Short-pitch corrugation on Down line; grinding in day shadow block. Session 1 of 2 (3 h/day, 2 sessions)."),
        _row("TMS-008", "Engineering", "KGA / km 113.5 Up", "Hanging sleeper", "Medium", 14, 3.0, 7, "Medium", "Voiding under 9 sleepers; risk of geometry burst at 110 km/h. Single-session tamping."),
        _row("TMS-009", "Engineering", "SEC-04 / km 128.0 (KGA–SRO)", "Track geometry (twist)", "High", 5, 3.0, 8, "High", "Twist 4.2 mm/3 m recorded on TRC; speed restriction 50 km/h pending packing. Single-session correction."),
        _row("TMS-010", "Engineering", "SRO Yard", "Level crossing road surface (engg.)", "Low", 33, 2.5, 3, "Low", "LC-42A approaches potholed; engineering share of joint block with S&T."),
        _row("TMS-011", "Engineering", "SEC-04 / km 148.7", "Rail wear (lateral)", "Medium", 21, 3.0, 6, "Medium", "Curve 2.5° lateral wear approaching 50% head; planned rail renewal patch. Session 1 of 2 (rail closure + insertion, 3 h/night)."),
        _row("TMS-012", "Engineering", "BRE / km 160.2", "Bridge approach settlement", "High", 8, 4.0, 9, "High", "Minor bridge 412 approach dip 18 mm; packing and approach rail destressing. Single 4-hour night possession."),
        _row("TMS-013", "Engineering", "SEC-05 / km 178.4 (SYWN–SFG)", "Rail fracture (suspect)", "High", 2, 4.0, 10, "High", "USFD cluster of 3 defects in 200 m; night block preferred before PRYJ terminal peak. Single-session USFD + patching."),
        _row("TMS-014", "Engineering", "SFG Yard (goods lead)", "Point and crossing wear", "Medium", 16, 3.5, 7, "High", "1:12 turnout on goods lead to Subedarganj yard; delays inward rakes if failed. Session 1 of 2 nights."),
        _row("TMS-015", "Engineering", "PRYJ Yard (PF-6)", "Track geometry (unevenness)", "Medium", 12, 3.5, 6, "Medium", "Coaching pit approach unevenness; affects rake placement at Prayagraj Junction. Single-session tamping."),
        _row("TMS-016", "Engineering", "SEC-02 / km 68.9", "LWR destressing overdue", "Medium", 27, 3.5, 7, "Medium", "LWR panel overdue destressing before summer; needs 25 kV power block. Session 1 of 2 (stress-free length measurement night 1; destressing night 2). Coordinate with TRD."),
        _row("TMS-017", "Engineering", "CNBI / km 8.1", "Sleeper damage (PSC)", "Low", 38, 3.0, 3, "Low", "Isolated cracked sleepers on slow line; can wait for machine block. Single session."),
        _row("TMS-018", "Engineering", "SEC-03 / km 102.6", "Ballast deficiency", "Low", 45, 3.0, 4, "Low", "Shoulder ballast flow after rains; sectional goods diverted via day shadow block. Session 1 of 2 nights."),
        _row("TMS-019", "Engineering", "FTP / km 77.8 Down", "Weld failure (flash butt)", "High", 4, 3.0, 9, "High", "Cupped FBW at station limit; TSR 20 km/h affecting Fatehpur stoppers. Single 3-hour night session."),
        _row("TMS-020", "Engineering", "SEC-01 / km 39.2", "Rail wear (vertical)", "Medium", 19, 3.5, 5, "Medium", "Vertical wear 12 mm on 20-year-old 60 kg rail; planned insertion of 1.2 km panel. Session 1 of 2 nights (fishplating night 1, insertion night 2)."),
        _row("TMS-021", "Engineering", "SEC-05 / km 194.0 (SFG–PRYJ)", "Gauge slack", "High", 7, 3.5, 8, "High", "Slack gauge on automatic block approach; high coaching density into PRYJ. Single-session tamping + gauging."),
        _row("TMS-022", "Engineering", "BKO Yard", "Hanging sleeper", "Low", 29, 2.5, 4, "Low", "Loop line voiding; no effect on main line if isolated."),
    ]


def smms_defects() -> list[dict[str, Any]]:
    """S&T / Signalling Maintenance & Management System backlog (16 records).

    Duration calibration notes:
    - EI card / interlocking: 3.5 h per session (testing + commissioning). Complex jobs (PRYJ EI) need 2 sessions.
    - Axle counter: 2.5–3.0 h single session (isolation + reset + testing cycle)
    - Point machine overhaul: 3.0 h (disconnect, overhaul, reconnect, test under traffic)
    - Track circuit: 2.5–3.0 h (shunt test, battery check, relay replacement)
    - LC interlocking: 3.0 h (boom, locking circuit, test)
    """
    return [
        _row("SMMS-001", "S&T", "CNB (RRI cabin)", "Interlocking relay / EI card fault", "High", 5, 3.5, 10, "High", "Electronic interlocking I/O card intermittent; risk of route locking failure at Kanpur Central. Session 1 of 2 (card swap night 1; full route testing night 2)."),
        _row("SMMS-002", "S&T", "SEC-01 / IB between PNKD–BKO", "Axle counter disturbance", "High", 9, 3.0, 9, "High", "Multi-section axle counter reset failures; trains running on paper line-clear during peaks. Single session reset + cable test."),
        _row("SMMS-003", "S&T", "PNKD (points 21/22)", "Point machine sluggish", "Medium", 13, 3.0, 7, "Medium", "IRS point machine throwing time > 4 s; needs overhauling under disconnection. Single session."),
        _row("SMMS-004", "S&T", "SEC-02 / LC-28", "LC gate interlocking defect", "High", 4, 3.0, 9, "High", "Boom locking circuit not proving; engineering + S&T joint block mandatory. Single session."),
        _row("SMMS-005", "S&T", "FTP (home signal Up)", "Signal lamp / LED module failure", "Medium", 8, 2.0, 6, "Medium", "Cold LED bank on Up home; redundant filament still OK but overdue replacement."),
        _row("SMMS-006", "S&T", "SEC-03 / km 88.0", "Track circuit failure", "High", 2, 3.0, 9, "High", "DC track circuit pumping in wet weather; false occupancy, capacity loss ~4 paths/hour. Single-session relay + battery replacement."),
        _row("SMMS-007", "S&T", "KGA cabin", "Cable insulation / megger fail", "Medium", 22, 3.0, 6, "Medium", "Main cable megger < 1 MΩ; replacement of 400 m quad under traffic block. Session 1 of 2 (pull-through night 1; termination + testing night 2)."),
        _row("SMMS-008", "S&T", "SRO (starter Down)", "Signal lamp / LED module failure", "Low", 31, 1.5, 3, "Low", "Route indicator LED dim; not affecting main aspect."),
        _row("SMMS-009", "S&T", "SEC-04 / IBS SRO–BRE", "Axle counter disturbance", "Medium", 15, 3.0, 7, "Medium", "Preparatory reset frequent in fog; medium density but crew complaints high. Single session."),
        _row("SMMS-010", "S&T", "BRE (points 11)", "Point machine sluggish", "High", 6, 3.0, 8, "High", "Detection chatter; possible split if not attended before summer expansion. Single session."),
        _row("SMMS-011", "S&T", "SFG Yard", "Track circuit failure", "Medium", 17, 3.5, 7, "High", "Yard berthing track shows occupied; inbound goods held at outer, asset idle. Single session relay + shunt test."),
        _row("SMMS-012", "S&T", "PRYJ (EI)", "Interlocking relay / EI card fault", "High", 1, 4.0, 10, "High", "Hot standby mismatch after power dip; division HQ station — treat as emergency. Session 1 of 2 (card replacement + hot-standby bring-up within 4 h night possession)."),
        _row("SMMS-013", "S&T", "SEC-05 auto signals A-14/A-16", "Signal lamp / LED module failure", "Medium", 10, 2.5, 5, "Medium", "Two consecutive auto signals degraded; headway increase for MEMU into PRYJ."),
        _row("SMMS-014", "S&T", "BKO cabin", "Cable cut (suspected rodent)", "Low", 27, 3.0, 4, "Low", "Spare quad damaged; main working pair healthy."),
        _row("SMMS-015", "S&T", "FTP / LC-35", "LC gate interlocking defect", "Medium", 12, 3.0, 7, "Medium", "Hooter and boom not in correspondence; joint S&T–Engineering window."),
        _row("SMMS-016", "S&T", "CNBI (slot circuit)", "Track circuit failure", "Low", 36, 2.5, 3, "Low", "Slot circuit voltage drop; can be patched in night shadow without full corridor block."),
    ]


def tdms_defects() -> list[dict[str, Any]]:
    """TRD / Traction Distribution Management System backlog (14 records).

    Duration calibration notes:
    - Section insulator replacement: 3.5 h (isolation + replacement + recharge cycle)
    - Contact wire replacement: 3.5 h per session (re-tensioning is night 2)
    - AT transformer / CB work: 2.5–3.0 h single session
    - OHE mast foundation: 3.0 h per session (excavation + grouting; setting time = next session)
    - ATD: 2.5–3.0 h single session
    """
    return [
        _row("TDMS-001", "TRD", "SP Panki (SEC-01)", "Section insulator defect", "High", 7, 3.5, 9, "High", "Section insulator pitting; risk of pantograph entanglement on Up high-density line. Single-session replacement under 25 kV isolation."),
        _row("TDMS-002", "TRD", "SEC-01 / km 22.4", "Contact wire wear", "High", 10, 3.5, 9, "High", "Contact wire residual 8.6 mm (condemn 8.25 mm); replacement. Session 1 of 2 (wire removal + new wire stringing night 1; tensioning + stagger correction night 2)."),
        _row("TDMS-003", "TRD", "PNKD ATD", "Auto tensioning device seized", "Medium", 14, 3.0, 7, "Medium", "ATD pulley not paying out; sag variation with temperature, sparking reported. Single session."),
        _row("TDMS-004", "TRD", "SSP Bindki Road", "CB trip / protection mal-op", "High", 3, 3.0, 8, "High", "Feeder CB nuisance trip; OHE isolation of SEC-02 during peaks. Single session relay + CB testing."),
        _row("TDMS-005", "TRD", "SEC-02 / km 63.0", "Insulator flashover", "Medium", 19, 3.0, 6, "Medium", "Stay tube insulator pollution flashover after fog; washing + replacement. Single session."),
        _row("TDMS-006", "TRD", "SP Fatehpur", "Transformer oil leak (AT)", "Medium", 21, 3.0, 7, "High", "Auxiliary transformer weeping at bushing; if failed, station lighting/signalling UPS stressed. Single session gasket replacement + oil top-up."),
        _row("TDMS-007", "TRD", "SEC-03 / km 96.8", "Catenary sag / stagger out", "Low", 34, 3.0, 4, "Low", "Stagger at cantilever 4 beyond 200 mm; plan with Engineering destressing. Single session."),
        _row("TDMS-008", "TRD", "KGA / mast 412/8", "Mast foundation settlement", "High", 8, 3.0, 8, "High", "OHE mast tilt 1.8° after monsoon; guy and foundation repair. Session 1 of 2 (excavation + grouting night 1; guy tensioning + inspection night 2)."),
        _row("TDMS-009", "TRD", "SSP Sirathu", "Jumper loose / hot spot", "Medium", 11, 2.5, 6, "Medium", "Thermovision 78 °C on feeder jumper; tighten under power block. Single session."),
        _row("TDMS-010", "TRD", "SEC-04 / km 152.1", "Contact wire wear", "Medium", 16, 3.0, 6, "Medium", "Localized wear at overlap; medium density allows day shadow. Session 1 of 2 nights."),
        _row("TDMS-011", "TRD", "SP Subedarganj", "Section insulator defect", "High", 4, 3.5, 9, "High", "Neutral section rough ride reported by Rajdhani crew; PRYJ approach. Single-session replacement."),
        _row("TDMS-012", "TRD", "SFG Yard OHE", "Insulator flashover", "Low", 28, 2.5, 3, "Low", "Yard line insulator; can be isolated without main line block."),
        _row("TDMS-013", "TRD", "SEC-05 / km 198.5", "Auto tensioning device seized", "Medium", 9, 3.0, 7, "High", "ATD on PRYJ approach; summer expansion risk of pantograph hook-up. Single session."),
        _row("TDMS-014", "TRD", "PRYJ / TSS feed", "CB trip / protection mal-op", "High", 2, 3.5, 10, "High", "Incoming 132 kV CB slow to close after trip; terminal station outage risk. Single session: CB timing tests + relay setting adjustment."),
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
