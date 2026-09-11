"""Standalone seeded mock for a CRIS defect feed.

This is a local demo endpoint only. It does not connect to CRIS or any
external system.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


SEED_RECORDS = [
    {
        "defect_id": "TMS-9001",
        "department": "Engineering",
        "location": "SEC-01 / km 9.1 (CNB-CNBI Up)",
        "defect_type": "Rail fracture (suspect)",
        "severity": "High",
        "overdue_days": 2,
        "estimated_duration_hours": 3.0,
        "criticality_score": 9,
        "asset_impact": "High",
        "description": "Synthetic CRIS feed record for rail inspection follow-up.",
        "created_at": "2026-09-11T00:00:00+00:00",
    },
    {
        "defect_id": "SMMS-9001",
        "department": "S&T",
        "location": "SEC-02 / km 56.2 (BKO-FTP)",
        "defect_type": "Signal failure (interlocking/track circuit)",
        "severity": "Medium",
        "overdue_days": 1,
        "estimated_duration_hours": 2.5,
        "criticality_score": 7,
        "asset_impact": "Medium",
        "description": "Synthetic CRIS feed record for signal testing.",
        "created_at": "2026-09-11T00:01:00+00:00",
    },
    {
        "defect_id": "TDMS-9001",
        "department": "TRD",
        "location": "SEC-05 / km 181.4 (KAP-PRYJ)",
        "defect_type": "OHE contact wire wear",
        "severity": "Low",
        "overdue_days": 0,
        "estimated_duration_hours": 2.0,
        "criticality_score": 5,
        "asset_impact": "Low",
        "description": "Synthetic CRIS feed record for OHE inspection follow-up.",
        "created_at": "2026-09-11T00:02:00+00:00",
    },
    {
        "defect_id": "TMS-9002",
        "department": "Engineering",
        "location": "SEC-03 / km 91.0 (FTP-KGA)",
        "defect_type": "Ballast shoulder defect",
        "severity": "Medium",
        "overdue_days": 3,
        "estimated_duration_hours": 2.5,
        "criticality_score": 6,
        "asset_impact": "Medium",
        "description": "Synthetic CRIS feed record for ballast maintenance.",
        "created_at": "2026-09-11T00:03:00+00:00",
    },
    {
        "defect_id": "SMMS-9002",
        "department": "S&T",
        "location": "SEC-04 / km 129.8 (KGA-BHR)",
        "defect_type": "Axle counter intermittent fault",
        "severity": "High",
        "overdue_days": 4,
        "estimated_duration_hours": 3.0,
        "criticality_score": 8,
        "asset_impact": "High",
        "description": "Synthetic CRIS feed record for axle counter diagnostics.",
        "created_at": "2026-09-11T00:04:00+00:00",
    },
    {
        "defect_id": "TDMS-9002",
        "department": "TRD",
        "location": "SEC-01 / km 22.0 (CNBI-PNKD)",
        "defect_type": "OHE isolator inspection finding",
        "severity": "Medium",
        "overdue_days": 2,
        "estimated_duration_hours": 2.0,
        "criticality_score": 6,
        "asset_impact": "Medium",
        "description": "Synthetic CRIS feed record for traction inspection.",
        "created_at": "2026-09-11T00:05:00+00:00",
    },
]


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _handler(records: list[dict[str, object]]) -> type[BaseHTTPRequestHandler]:
    class CrisHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path != "/cris/defects/new":
                self.send_error(404)
                return

            since = parse_qs(parsed.query).get("since", ["1970-01-01T00:00:00+00:00"])[0]
            try:
                since_dt = _parse_timestamp(since)
                result = [
                    record
                    for record in records
                    if _parse_timestamp(str(record["created_at"])) > since_dt
                ]
            except (TypeError, ValueError):
                self.send_error(400, "since must be an ISO timestamp")
                return

            payload = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format: str, *args: object) -> None:
            return

    return CrisHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local seeded CRIS mock.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument(
        "--count",
        type=int,
        default=len(SEED_RECORDS),
        choices=range(1, len(SEED_RECORDS) + 1),
        help="Expose the first N deterministic records for a demo run.",
    )
    args = parser.parse_args()
    records = SEED_RECORDS[: args.count]
    server = ThreadingHTTPServer((args.host, args.port), _handler(records))
    print(
        f"MOCK_CRIS_LISTENING http://{args.host}:{args.port}/cris/defects/new "
        f"seeded_records={len(records)} started_at={datetime.now(timezone.utc).isoformat()}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()