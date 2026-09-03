from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, Query

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from baseline_and_metrics import compare_plans, fifo_baseline, severity_baseline
from src.feasibility_utils import classify_unscheduled

from fastapi.middleware.cors import CORSMiddleware

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
OPTIMIZED_DIR = DATA_DIR / "optimized"

app = FastAPI(title="Rail Block Planning API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists() or path.stat().st_size == 0:
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def _clean_frame(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df.empty:
        return []
    return df.where(pd.notna(df), None).to_dict(orient="records")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/defects")
def get_defects(
    urgency: str | None = Query(default=None, description="Optional urgency band filter, e.g. P1 or P2"),
    limit: int | None = Query(default=None, ge=1),
) -> list[dict[str, Any]]:
    defects_df = _read_csv(DATA_DIR / "prioritized_defects.csv")
    if defects_df.empty:
        return []

    if urgency:
        defects_df = defects_df[
            defects_df["urgency_band"].astype(str).str.contains(urgency, case=False, na=False)
        ].copy()

    if "priority_score" not in defects_df.columns:
        defects_df["priority_score"] = pd.to_numeric(
            defects_df.get("final_priority_score", defects_df.get("rule_priority_score", 0)),
            errors="coerce",
        ).fillna(0.0)

    if limit is not None:
        defects_df = defects_df.head(limit).copy()

    return _clean_frame(defects_df)


@app.get("/slots")
def get_slots(
    horizon: str | None = Query(default=None, description="Optional horizon filter: weekly or monthly"),
) -> list[dict[str, Any]]:
    slots_df = _read_csv(DATA_DIR / "block_slots.csv")
    if slots_df.empty:
        return []
    if horizon:
        slots_df = slots_df[slots_df["horizon"].astype(str).str.lower() == horizon.lower()].copy()
    return _clean_frame(slots_df)


@app.get("/schedules/{horizon}")
def get_schedule(horizon: str) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    schedule_df = _read_csv(OPTIMIZED_DIR / f"{horizon}_schedule.csv")
    return _clean_frame(schedule_df)


@app.get("/unscheduled/{horizon}")
def get_unscheduled(horizon: str) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    unscheduled_df = _read_csv(OPTIMIZED_DIR / f"unscheduled_{horizon}_defects.csv")
    return _clean_frame(unscheduled_df)


@app.get("/classifications/{horizon}")
def get_classifications(horizon: str) -> list[dict[str, Any]]:
    horizon = horizon.lower()
    if horizon not in {"weekly", "monthly"}:
        return []
    unscheduled_df = _read_csv(OPTIMIZED_DIR / f"unscheduled_{horizon}_defects.csv")
    slots_df = _read_csv(DATA_DIR / "block_slots.csv")
    slots_df = slots_df[slots_df["horizon"].astype(str).str.lower() == horizon].copy()
    if unscheduled_df.empty:
        return []
    classified = classify_unscheduled(unscheduled_df, slots_df)
    return _clean_frame(classified)


@app.get("/comparison")
def get_comparison() -> dict[str, list[dict[str, Any]]]:
    defects_df = _read_csv(DATA_DIR / "prioritized_defects.csv")
    if defects_df.empty:
        return {"weekly": [], "monthly": []}

    output: dict[str, list[dict[str, Any]]] = {}
    for horizon in ("weekly", "monthly"):
        slots_df = _read_csv(DATA_DIR / "block_slots.csv")
        slots_df = slots_df[slots_df["horizon"].astype(str).str.lower() == horizon].copy()
        schedule_df = _read_csv(OPTIMIZED_DIR / f"{horizon}_schedule.csv")

        manual_fifo_schedule, _ = fifo_baseline(defects_df, slots_df)
        manual_severity_schedule, _ = severity_baseline(defects_df, slots_df)

        fifo_table = compare_plans(defects_df, slots_df, schedule_df, pd.DataFrame(), fifo_baseline, "Manual (FIFO)")
        sev_table = compare_plans(defects_df, slots_df, schedule_df, pd.DataFrame(), severity_baseline, "Manual (Severity-first)")

        rows = [
            {
                "plan": "Manual (FIFO)",
                "scheduled_defects": int(fifo_table.iloc[0]["scheduled_defects"]),
                "clearance_pct": float(fifo_table.iloc[0]["clearance_pct"]),
                "p1_clearance_pct": float(fifo_table.iloc[0]["p1_clearance_pct"]),
                "p2_clearance_pct": float(fifo_table.iloc[0]["p2_clearance_pct"]),
                "combined_p1_p2_pct": float(fifo_table.iloc[0]["combined_p1_p2_pct"]),
                "bundling_rate_pct": float(fifo_table.iloc[0]["bundling_rate_pct"]),
                "unscheduled_defects": int(fifo_table.iloc[0]["unscheduled_defects"]),
            },
            {
                "plan": "Manual (Severity-first)",
                "scheduled_defects": int(sev_table.iloc[0]["scheduled_defects"]),
                "clearance_pct": float(sev_table.iloc[0]["clearance_pct"]),
                "p1_clearance_pct": float(sev_table.iloc[0]["p1_clearance_pct"]),
                "p2_clearance_pct": float(sev_table.iloc[0]["p2_clearance_pct"]),
                "combined_p1_p2_pct": float(sev_table.iloc[0]["combined_p1_p2_pct"]),
                "bundling_rate_pct": float(sev_table.iloc[0]["bundling_rate_pct"]),
                "unscheduled_defects": int(sev_table.iloc[0]["unscheduled_defects"]),
            },
            {
                "plan": "Optimized",
                "scheduled_defects": int(fifo_table.iloc[1]["scheduled_defects"]),
                "clearance_pct": float(fifo_table.iloc[1]["clearance_pct"]),
                "p1_clearance_pct": float(fifo_table.iloc[1]["p1_clearance_pct"]),
                "p2_clearance_pct": float(fifo_table.iloc[1]["p2_clearance_pct"]),
                "combined_p1_p2_pct": float(fifo_table.iloc[1]["combined_p1_p2_pct"]),
                "bundling_rate_pct": float(fifo_table.iloc[1]["bundling_rate_pct"]),
                "unscheduled_defects": int(fifo_table.iloc[1]["unscheduled_defects"]),
            },
        ]
        output[horizon] = rows

    return output


# Serve compiled React frontend assets when dist/ exists
DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
if DIST_DIR.exists():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api/") or full_path in ["health", "defects", "slots", "schedules", "comparison", "unscheduled", "docs", "openapi.json", "redoc"]:
            return None
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.api:app", host="0.0.0.0", port=8000, reload=False)

