from __future__ import annotations

import json
import logging
import os
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

logger = logging.getLogger(__name__)


def _connection_settings() -> dict[str, Any] | None:
    url = os.getenv("MYSQL_URL")
    if url:
        parsed = urlparse(url.replace("mysql+pymysql://", "mysql://", 1))
        if not parsed.hostname or not parsed.path:
            return None
        query = parse_qs(parsed.query)
        return {
            "host": parsed.hostname,
            "port": parsed.port or 3306,
            "user": unquote(parsed.username or ""),
            "password": unquote(parsed.password or ""),
            "database": parsed.path.lstrip("/"),
            "ssl": {"ca": query["ssl-ca"][0]} if query.get("ssl-ca") else None,
        }

    host = os.getenv("MYSQL_HOST")
    database = os.getenv("MYSQL_DATABASE")
    if not host or not database or not os.getenv("MYSQL_USER"):
        return None
    return {
        "host": host,
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.getenv("MYSQL_USER"),
        "password": os.getenv("MYSQL_PASSWORD", ""),
        "database": database,
        "ssl": None,
    }


def read_records(table_name: str) -> list[dict[str, Any]] | None:
    """Read JSON rows from MySQL, returning None for CSV fallback."""
    settings = _connection_settings()
    if settings is None:
        return None

    try:
        import pymysql

        connection = pymysql.connect(
            **settings,
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=8,
            read_timeout=8,
            write_timeout=8,
        )
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT payload FROM `{table_name}` ORDER BY id")
                rows = cursor.fetchall()
        finally:
            connection.close()
        return [json.loads(row["payload"]) for row in rows]
    except Exception as exc:
        logger.warning("MySQL read failed for %s; using CSV fallback: %s", table_name, exc)
        return None