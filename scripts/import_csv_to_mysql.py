from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd
import pymysql

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"


def load_dotenv() -> None:
    """Load simple KEY=VALUE entries from the project or scripts folder."""
    for env_path in (PROJECT_ROOT / ".env", Path(__file__).resolve().parent / ".env"):
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        break

DATASETS = {
    "rail_defects": DATA_DIR / "prioritized_defects.csv",
    "rail_slots": DATA_DIR / "block_slots.csv",
    "rail_weekly_schedule": DATA_DIR / "optimized" / "weekly_schedule.csv",
    "rail_monthly_schedule": DATA_DIR / "optimized" / "monthly_schedule.csv",
    "rail_unscheduled_weekly": DATA_DIR / "optimized" / "unscheduled_weekly_defects.csv",
    "rail_unscheduled_monthly": DATA_DIR / "optimized" / "unscheduled_monthly_defects.csv",
}


def connection_settings() -> dict[str, object]:
    required = ("MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise SystemExit(f"Missing environment variables: {', '.join(missing)}")
    return {
        "host": os.environ["MYSQL_HOST"],
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.environ["MYSQL_USER"],
        "password": os.getenv("MYSQL_PASSWORD", ""),
        "database": os.environ["MYSQL_DATABASE"],
        "cursorclass": pymysql.cursors.DictCursor,
        "connect_timeout": 15,
    }


def load_schema(connection: pymysql.Connection) -> None:
    schema_path = PROJECT_ROOT / "database" / "mysql_schema.sql"
    statements = [statement.strip() for statement in schema_path.read_text().split(";") if statement.strip()]
    with connection.cursor() as cursor:
        for statement in statements:
            cursor.execute(statement)


def import_dataset(connection: pymysql.Connection, table_name: str, csv_path: Path) -> int:
    try:
        frame = pd.read_csv(csv_path) if csv_path.stat().st_size else pd.DataFrame()
    except pd.errors.EmptyDataError:
        frame = pd.DataFrame()
    records = json.loads(frame.to_json(orient="records")) if not frame.empty else []
    with connection.cursor() as cursor:
        cursor.execute(f"TRUNCATE TABLE `{table_name}`")
        if records:
            cursor.executemany(
                f"INSERT INTO `{table_name}` (payload) VALUES (%s)",
                [(json.dumps(record, ensure_ascii=True),) for record in records],
            )
    return len(records)


def main() -> None:
    load_dotenv()
    connection = pymysql.connect(**connection_settings())
    try:
        load_schema(connection)
        counts = {table: import_dataset(connection, table, path) for table, path in DATASETS.items()}
        connection.commit()
    finally:
        connection.close()

    for table, count in counts.items():
        print(f"{table}: {count} rows")


if __name__ == "__main__":
    main()
