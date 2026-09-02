"""Generate timetable-derived and goods-forecast block availability slots.

Planning horizon (IST, naive datetimes):

- Weekly detail: Monday 2026-09-07 … Sunday 2026-09-13
- Monthly skeleton: remainder of September 2026 (Wed + Sun nights, plus a few goods extras)

Night windows follow ``typical_block_window`` on each corridor section.
High-density sections (SEC-01/02/05) get no weekday day blocks.
Medium-density sections (SEC-03/04) get day-shadow blocks from the timetable.
GoodsForecast slots appear only when a rake is deferred or looped, freeing extra hours.

Run from the project root::

    python data/generate_block_slots.py
"""

from __future__ import annotations

import csv
import json
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent

WEEK_START = date(2026, 9, 7)
WEEK_END = date(2026, 9, 13)
MONTH_END = date(2026, 9, 30)

SLOT_FIELDS = [
    "slot_id",
    "section_id",
    "start_datetime",
    "end_datetime",
    "duration_hours",
    "traffic_density",
    "is_night_window",
    "max_tasks_possible",
    "source",
    "horizon",
]

GOODS_FIELDS = [
    "rake_id",
    "commodity",
    "origin",
    "destination",
    "section_id",
    "planned_date",
    "planned_start",
    "planned_end",
    "operation",
    "frees_block_slot",
    "notes",
]

# Corridor typical night windows (from corridor.json typical_block_window).
NIGHT_WINDOWS: dict[str, tuple[time, time]] = {
    "SEC-01": (time(0, 40), time(4, 10)),
    "SEC-02": (time(1, 10), time(4, 20)),
    "SEC-03": (time(1, 30), time(4, 30)),
    "SEC-04": (time(2, 0), time(5, 0)),
    "SEC-05": (time(0, 20), time(3, 50)),
}

DAY_SHADOW: dict[str, tuple[time, time]] = {
    "SEC-03": (time(10, 30), time(13, 0)),
    "SEC-04": (time(9, 45), time(12, 45)),
}

HIGH_DENSITY = {"SEC-01", "SEC-02", "SEC-05"}
MEGA_BLOCK_TARGETS = {
    "SEC-01": 6.0,
    "SEC-02": 8.0,
    "SEC-03": 7.0,
    "SEC-04": 7.0,
    "SEC-05": 7.0,
}


def _dt(day: date, clock: time) -> datetime:
    return datetime.combine(day, clock)


def _hours(start: datetime, end: datetime) -> float:
    return round((end - start).total_seconds() / 3600.0, 2)


def _max_tasks(duration_hours: float) -> int:
    """Crew/machine constraint: roughly one task per 1.75 h, minimum 1."""
    return max(1, int(duration_hours // 1.75))


def _density_for(section_id: str, source: str, is_night: bool) -> str:
    """High-density sections stay High even at night; goods extras are Low."""
    if source == "GoodsForecast":
        return "Low"
    if section_id in HIGH_DENSITY:
        return "High"
    if is_night:
        return "Medium"
    return "Medium"


def _is_night(start: datetime) -> bool:
    return start.hour >= 20 or start.hour < 6


def _horizon(day: date) -> str:
    if WEEK_START <= day <= WEEK_END:
        return "weekly"
    return "monthly"


def _slot_id(source: str, section_id: str, start: datetime) -> str:
    prefix = "TT" if source == "Timetable" else "GF"
    return f"{prefix}-{section_id}-{start.strftime('%Y%m%d-%H%M')}"


def make_slot(
    section_id: str,
    start: datetime,
    end: datetime,
    source: str,
) -> dict[str, Any]:
    duration = _hours(start, end)
    night = _is_night(start)
    return {
        "slot_id": _slot_id(source, section_id, start),
        "section_id": section_id,
        "start_datetime": start.strftime("%Y-%m-%dT%H:%M:%S"),
        "end_datetime": end.strftime("%Y-%m-%dT%H:%M:%S"),
        "duration_hours": duration,
        "traffic_density": _density_for(section_id, source, night),
        "is_night_window": night,
        "max_tasks_possible": _max_tasks(duration),
        "max_tasks_allowed": _max_tasks(duration),
        "source": source,
        "horizon": _horizon(start.date()),
    }


def _daterange(start: date, end: date):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def sunday_stretch(section_id: str, start_t: time, end_t: time) -> tuple[time, time]:
    """Sunday night corridor is 30 minutes longer on high-density sections."""
    if section_id not in HIGH_DENSITY:
        return start_t, end_t
    end_dt = datetime.combine(date(2000, 1, 1), end_t) + timedelta(minutes=30)
    return start_t, end_dt.time()


def timetable_slots() -> list[dict[str, Any]]:
    """Passenger/mail influence: night corridors every day in week 1; day shadow on medium density."""
    rows: list[dict[str, Any]] = []
    for day in _daterange(WEEK_START, WEEK_END):
        for section_id, (start_t, end_t) in NIGHT_WINDOWS.items():
            if day.weekday() == 6:  # Sunday
                start_t, end_t = sunday_stretch(section_id, start_t, end_t)
            rows.append(make_slot(section_id, _dt(day, start_t), _dt(day, end_t), "Timetable"))
        # Day shadow only on medium-density sections; skip peak mail days (Tue/Thu)
        # on SEC-04 so high-speed through trains keep the morning path.
        if "SEC-03" in DAY_SHADOW and day.weekday() in {0, 2, 4, 6}:  # Mon Wed Fri Sun
            s, e = DAY_SHADOW["SEC-03"]
            rows.append(make_slot("SEC-03", _dt(day, s), _dt(day, e), "Timetable"))
        if "SEC-04" in DAY_SHADOW and day.weekday() in {1, 3, 5}:  # Tue Thu Sat
            s, e = DAY_SHADOW["SEC-04"]
            rows.append(make_slot("SEC-04", _dt(day, s), _dt(day, e), "Timetable"))

    # Monthly skeleton: Wednesday + Sunday night windows for all sections.
    for day in _daterange(WEEK_END + timedelta(days=1), MONTH_END):
        if day.weekday() not in {2, 6}:
            continue
        for section_id, (start_t, end_t) in NIGHT_WINDOWS.items():
            if day.weekday() == 6:
                start_t, end_t = sunday_stretch(section_id, start_t, end_t)
            rows.append(make_slot(section_id, _dt(day, start_t), _dt(day, end_t), "Timetable"))
        if day.weekday() == 6:
            s, e = DAY_SHADOW["SEC-03"]
            rows.append(make_slot("SEC-03", _dt(day, s), _dt(day, e), "Timetable"))
    return rows


def goods_forecast_rows() -> list[dict[str, Any]]:
    """Control Office goods picture: deferred/looped rakes free extra block time."""
    return [
        _goods("GF-BOXN-4418", "Coal", "PNKD", "BKO", "SEC-01", date(2026, 9, 8), time(4, 10), time(5, 40), "deferred", True, "Thermal coal rake held at Panki siding; night path after 04:10 unused."),
        _goods("GF-CONCOR-2201", "Container", "CNB", "PRYJ", "SEC-01", date(2026, 9, 10), time(4, 10), time(5, 40), "looped", True, "ICD rake looped at Chandari; extra 90 min on SEC-01."),
        _goods("GF-BOXN-4422", "Coal", "PNKD", "FTP", "SEC-01", date(2026, 9, 12), time(4, 10), time(5, 40), "deferred", True, "Saturday coal cancelled by Control; corridor remains clear."),
        _goods("GF-BCN-1180", "Foodgrain", "BKO", "FTP", "SEC-02", date(2026, 9, 9), time(4, 20), time(5, 50), "deferred", True, "FCI rake not placed; Bindki–Fatehpur early morning free."),
        _goods("GF-BCN-1184", "Foodgrain", "BKO", "FTP", "SEC-02", date(2026, 9, 11), time(4, 20), time(5, 50), "looped", True, "Rake loops Fatehpur goods; no run-through after night mail."),
        _goods("GF-BTPN-3305", "POL", "CNB", "PRYJ", "SEC-05", date(2026, 9, 7), time(3, 50), time(5, 20), "deferred", True, "POL not cleared from SFG; PRYJ approach extra window."),
        _goods("GF-BTPN-3310", "POL", "SFG", "PRYJ", "SEC-05", date(2026, 9, 10), time(3, 50), time(5, 20), "looped", True, "Inward POL held SFG yard; terminal approach free."),
        _goods("GF-BCN-1191", "Foodgrain", "FTP", "KGA", "SEC-03", date(2026, 9, 11), time(13, 0), time(14, 30), "deferred", True, "Day goods cancelled; extends Fatehpur–Khaga shadow block."),
        _goods("GF-BCN-1199", "Foodgrain", "KGA", "BRE", "SEC-04", date(2026, 9, 12), time(12, 45), time(14, 15), "deferred", True, "Khaga–Bharwari afternoon path unused after passenger lull."),
        _goods("GF-BOXN-4501", "Coal", "PNKD", "BKO", "SEC-01", date(2026, 9, 16), time(4, 10), time(5, 40), "deferred", True, "Week-2 coal skip (Control order)."),
        _goods("GF-CONCOR-2210", "Container", "CNB", "PRYJ", "SEC-01", date(2026, 9, 23), time(4, 10), time(5, 40), "looped", True, "Week-3 ICD looped Chandari."),
        _goods("GF-BCN-1210", "Foodgrain", "BKO", "FTP", "SEC-02", date(2026, 9, 18), time(4, 20), time(5, 50), "deferred", True, "Week-2 FCI not placed."),
        _goods("GF-BTPN-3320", "POL", "SFG", "PRYJ", "SEC-05", date(2026, 9, 21), time(3, 50), time(5, 20), "deferred", True, "Week-3 POL held at SFG."),
        # Running rakes that do NOT free a slot (capacity remains occupied).
        _goods("GF-BOXN-4401", "Coal", "PNKD", "PRYJ", "SEC-01", date(2026, 9, 7), time(4, 10), time(6, 30), "run_through", False, "Night coal still occupies SEC-01 after mail; no extra block."),
        _goods("GF-RAJDHANI-PATH", "Empty coaching", "PRYJ", "CNB", "SEC-05", date(2026, 9, 8), time(3, 40), time(4, 10), "run_through", False, "Empty Rajdhani rake to CNB; keeps terminal approach closed."),
        _goods("GF-BCN-1170", "Foodgrain", "KGA", "PRYJ", "SEC-04", date(2026, 9, 9), time(5, 0), time(7, 30), "run_through", False, "Morning grain run-through after night corridor."),
    ]


def _goods(
    rake_id: str,
    commodity: str,
    origin: str,
    destination: str,
    section_id: str,
    planned_date: date,
    start: time,
    end: time,
    operation: str,
    frees: bool,
    notes: str,
) -> dict[str, Any]:
    return {
        "rake_id": rake_id,
        "commodity": commodity,
        "origin": origin,
        "destination": destination,
        "section_id": section_id,
        "planned_date": planned_date.isoformat(),
        "planned_start": start.strftime("%H:%M"),
        "planned_end": end.strftime("%H:%M"),
        "operation": operation,
        "frees_block_slot": frees,
        "notes": notes,
    }


def goods_forecast_slots(forecast: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Turn deferred/looped rakes into GoodsForecast availability slots."""
    rows = []
    for rake in forecast if forecast is not None else goods_forecast_rows():
        if not rake["frees_block_slot"]:
            continue
        day = date.fromisoformat(rake["planned_date"])
        start = datetime.combine(day, datetime.strptime(rake["planned_start"], "%H:%M").time())
        end = datetime.combine(day, datetime.strptime(rake["planned_end"], "%H:%M").time())
        slot = make_slot(rake["section_id"], start, end, "GoodsForecast")
        slot["rake_id"] = rake["rake_id"]
        rows.append(slot)
    return rows


def mega_block_slots() -> list[dict[str, Any]]:
    """Control Office mega-block windows that plug the structural capacity gap.

    These windows represent negotiated extended possessions needed when a defect's
    planned duration exceeds the normal night/day slot on a section. They are
    deliberately added to the synthetic inventory so the model can distinguish
    structural infeasibility from a true optimization failure.
    """
    rows: list[dict[str, Any]] = []
    for day in _daterange(WEEK_START, MONTH_END):
        for section_id, target_duration in MEGA_BLOCK_TARGETS.items():
            if day <= WEEK_END:
                if day.weekday() not in {1, 3, 5}:  # Tue / Thu / Sat
                    continue
            else:
                if day.weekday() not in {2, 6}:  # Wed / Sun monthly
                    continue

            if section_id in {"SEC-03", "SEC-04"}:
                if section_id == "SEC-03":
                    start_t = DAY_SHADOW["SEC-03"][0]
                else:
                    start_t = DAY_SHADOW["SEC-04"][0]
            else:
                start_t = NIGHT_WINDOWS[section_id][0]

            start = _dt(day, start_t)
            end = start + timedelta(hours=target_duration)
            rows.append(make_slot(section_id, start, end, "MegaBlock"))
    return rows


def all_slots() -> list[dict[str, Any]]:
    combined = timetable_slots() + goods_forecast_slots() + mega_block_slots()
    combined.sort(key=lambda r: (r["start_datetime"], r["section_id"], r["slot_id"]))
    return combined


def public_slot_row(row: dict[str, Any]) -> dict[str, Any]:
    """CSV columns required by STEP 3 (plus horizon kept on integrated output)."""
    return {field: row[field] for field in SLOT_FIELDS}


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_all(data_dir: Path | None = None) -> dict[str, Any]:
    root = data_dir or DATA_DIR
    tt = [public_slot_row(r) for r in timetable_slots()]
    gf = [public_slot_row(r) for r in goods_forecast_slots()]
    mega = [public_slot_row(r) for r in mega_block_slots()]
    combined = [public_slot_row(r) for r in all_slots()]
    write_csv(root / "timetable_slots.csv", tt, SLOT_FIELDS)
    write_csv(root / "goods_forecast_slots.csv", gf, SLOT_FIELDS)
    write_csv(root / "block_slots.csv", combined, SLOT_FIELDS)
    write_csv(root / "goods_forecast.csv", goods_forecast_rows(), GOODS_FIELDS)
    summary = {
        "total_slots": len(combined),
        "timetable_slots": len(tt),
        "goods_forecast_slots": len(gf),
        "mega_blocks": len(mega),
        "by_section": _count(combined, "section_id"),
        "by_source": _count(combined, "source"),
        "by_density": _count(combined, "traffic_density"),
        "total_hours": round(sum(r["duration_hours"] for r in combined), 2),
        "week_start": WEEK_START.isoformat(),
        "month_end": MONTH_END.isoformat(),
    }
    with (root / "block_slots_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)
        handle.write("\n")
    return summary


def _count(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in rows:
        out[row[key]] = out.get(row[key], 0) + 1
    return out


if __name__ == "__main__":
    print(json.dumps(write_all(), indent=2))
