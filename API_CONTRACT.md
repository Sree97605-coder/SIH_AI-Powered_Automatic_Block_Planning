# Rail Block Planning API Contract

Base URL for local dev: `http://localhost:8000`

This API serves the validated optimizer outputs for the dashboard and downstream tools.

## General notes

- Responses are JSON arrays or JSON objects.
- The app uses the fully generated data under `data/optimized` and `data/prioritized_defects.csv`.
- Important caveat: `/schedules/{horizon}` returns only occupied slots. Empty slots are omitted intentionally.
- If the dashboard needs unused capacity, it should compute it by diffing `/slots?horizon=<horizon>` against the scheduled slot IDs returned in `/schedules/{horizon}`.

## 1) GET /health

Returns app health.

Example response:

```json
{"status": "ok"}
```

## 2) GET /defects

Query params:

- `urgency` (optional): filter by urgency band, e.g. `P1`
- `limit` (optional): max rows to return

Example:

```http
GET /defects?urgency=P1&limit=3
```

Example response:

```json
[
  {
    "defect_id": "SMMS-001",
    "section_id": "SEC-01",
    "urgency_band": "P1 - Immediate",
    "priority_score": 81.13,
    "estimated_duration_hours": 6.0
  }
]
```

Notes:

- `urgency` filtering is applied at the DataFrame level before serialization.
- Returned records contain the full defect payload, not a reduced view.

## 3) GET /slots

Query params:

- `horizon` (optional): `weekly` or `monthly`

Example:

```http
GET /slots?horizon=monthly
```

Example response:

```json
[
  {
    "slot_id": "MF-SEC-05-20260916-0020",
    "section_id": "SEC-05",
    "horizon": "monthly",
    "start_datetime": "2026-09-16T00:20:00",
    "duration_hours": 7.0,
    "slot_source": "MegaBlock"
  }
]
```

Notes:

- This is the full slot inventory for the horizon.
- For dashboard capacity views, this is the source to compare against scheduled slots.

## 4) GET /schedules/{horizon}

Path params:

- `horizon`: `weekly` or `monthly`

Example:

```http
GET /schedules/monthly
```

Example response (occupied slots only):

```json
[
  {
    "slot_id": "GF-SEC-05-20260916-0020",
    "section_id": "SEC-05",
    "start_datetime": "2026-09-16T00:20:00",
    "end_datetime": "2026-09-16T07:20:00",
    "duration_hours": 7.0,
    "assigned_defect_ids": "['TDMS-011']",
    "assigned_defect_count": 1,
    "is_bundled": false,
    "bundle_type": "Single Task Block"
  }
]
```

Notes:

- This endpoint intentionally omits empty slots.
- For the monthly schedule, the current file has 38 rows, not 56.
- The minimum `assigned_defect_count` in the saved file is `1`, confirming this is an occupied-slots-only export.

## 5) GET /unscheduled/{horizon}

Path params:

- `horizon`: `weekly` or `monthly`

Example response:

```json
[
  {
    "defect_id": "TMS-020",
    "section_id": "SEC-01",
    "urgency_band": "P3 - Planned",
    "estimated_duration_hours": 6.0,
    "unscheduled_reason": "capacity_constrained: no feasible slot available within planning horizon"
  }
]
```

## 6) GET /classifications/{horizon}

Path params:

- `horizon`: `weekly` or `monthly`

Example response:

```json
[
  {
    "defect_id": "TMS-020",
    "section_id": "SEC-01",
    "urgency_band": "P3 - Planned",
    "reason": "CONTENTION",
    "mega_block_hours_needed": 0.0
  }
]
```

Verified count for current monthly data:

```json
{"CONTENTION": 9}
```

This means the current monthly classification result is a clean split: 9 contention cases, zero structurally infeasible cases.

## 7) GET /comparison

Returns an object keyed by horizon.

Example response:

```json
{
  "weekly": [
    {"plan": "Manual (FIFO)", "scheduled_defects": 35, "unscheduled_defects": 17, "clearance_pct": 67.3},
    {"plan": "Manual (Severity-first)", "scheduled_defects": 35, "unscheduled_defects": 17, "clearance_pct": 67.3},
    {"plan": "Optimized", "scheduled_defects": 36, "unscheduled_defects": 16, "clearance_pct": 69.2}
  ],
  "monthly": [
    {"plan": "Manual (FIFO)", "scheduled_defects": 42, "unscheduled_defects": 10, "clearance_pct": 80.8},
    {"plan": "Manual (Severity-first)", "scheduled_defects": 42, "unscheduled_defects": 10, "clearance_pct": 80.8},
    {"plan": "Optimized", "scheduled_defects": 43, "unscheduled_defects": 9, "clearance_pct": 82.7}
  ]
}
```

## Dashboard guidance

- Use `/schedules/{horizon}` for assigned work by slot.
- Use `/slots?horizon=<horizon>` for the complete inventory by slot.
- Use `/comparison` for before-vs-after summary metrics.
- Use `/classifications/{horizon}` for reason-tagged unscheduled items.
- For idle capacity, compute `full_slot_inventory - scheduled_slot_ids` rather than expecting empty rows in `/schedules/{horizon}`.
