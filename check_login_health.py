"""Fail-fast health check for local demo authentication state."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_API_URL = "http://127.0.0.1:8000"


def find_users_databases(search_roots: list[Path]) -> list[Path]:
    found: set[Path] = set()
    for root in search_roots:
        if not root.exists():
            continue
        if root.is_file():
            if root.name.lower() == "users.db":
                found.add(root.resolve())
            continue
        for directory, directory_names, filenames in os.walk(root, topdown=True):
            directory_names[:] = [
                name for name in directory_names
                if name not in {".git", "node_modules", "dist", ".venv", "venv", "__pycache__"}
            ]
            if "users.db" in {name.lower() for name in filenames}:
                for filename in filenames:
                    if filename.lower() == "users.db":
                        found.add((Path(directory) / filename).resolve())
    return sorted(found)


def read_users(path: Path) -> list[tuple[str, str, str | None]]:
    with sqlite3.connect(str(path)) as connection:
        return connection.execute("SELECT username, role, department FROM users ORDER BY username").fetchall()


def read_hashes(path: Path) -> dict[str, str]:
    with sqlite3.connect(str(path)) as connection:
        return dict(connection.execute("SELECT username, hashed_password FROM users").fetchall())


def verify_database(databases: list[Path], configured_path: Path) -> tuple[bool, list[tuple[str, str, str | None]]]:
    print("DATABASE INVENTORY")
    for path in databases:
        stat = path.stat()
        modified = datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds")
        print(f"- {path} ({stat.st_size} bytes; modified {modified})")
        try:
            print(f"  users: {read_users(path)}")
        except sqlite3.Error as error:
            print(f"  users: UNREADABLE ({error})")

    if len(databases) != 1:
        print(f"FAIL: expected exactly one users.db, found {len(databases)}.")
        return False, []
    if databases[0] != configured_path:
        print(f"FAIL: users.db is not at configured path {configured_path}.")
        return False, []

    users = read_users(databases[0])
    print(f"CONFIGURED_USERS_DB_PATH: {configured_path}")
    return True, users


def login(api_url: str, username: str, password: str) -> tuple[bool, str]:
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/auth/login",
        data=json.dumps({"username": username, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            response.read()
            return response.status == 200, f"HTTP {response.status}"
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        return False, f"HTTP {error.code}: {body[:160]}"
    except urllib.error.URLError as error:
        return False, f"API unreachable: {error.reason}"
    except TimeoutError:
        return False, "API unreachable: request timed out"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("HEALTHCHECK_API_URL", DEFAULT_API_URL))
    parser.add_argument("--password", default="123456789")
    parser.add_argument(
        "--search-root",
        action="append",
        type=Path,
        help="Additional root to scan; defaults to the project and user temp roots.",
    )
    args = parser.parse_args()

    from src.auth import DEMO_USERS, USERS_DB_PATH

    configured_path = USERS_DB_PATH.resolve()
    roots = [Path("C:/"), Path(os.environ.get("TEMP", ""))]
    if args.search_root:
        roots.extend(args.search_root)
    databases = find_users_databases([root for root in roots if str(root)])
    database_ok, users = verify_database(databases, configured_path)

    expected_users = {username for username, _, _ in DEMO_USERS}
    if len(expected_users) != 5:
        print(f"FAIL: application defines {len(expected_users)} demo accounts, expected 5.")
        database_ok = False
    usernames = {username for username, _, _ in users}
    if database_ok and usernames != expected_users:
        print(f"FAIL: expected demo usernames {sorted(expected_users)}, found {sorted(usernames)}.")
        database_ok = False

    print(f"API_LOGIN_CHECK: {args.api_url}")
    stored_hashes = read_hashes(configured_path) if configured_path.exists() else {}
    login_results: dict[str, bool] = {}
    for username in sorted(expected_users):
        hash_matches = username in stored_hashes
        if hash_matches:
            from src.auth import verify_password

            hash_matches = verify_password(args.password, stored_hashes[username])
        passed, detail = login(args.api_url, username, args.password)
        login_results[username] = passed
        if not hash_matches:
            detail = f"wrong password hash or missing account; {detail}"
        elif not passed and detail.startswith("HTTP 401"):
            detail = f"API rejected credentials despite local hash match; {detail}"
        print(f"- {username}: {'PASS' if passed else 'FAIL'} (local_hash={'MATCH' if hash_matches else 'FAIL'}; {detail})")

    failed = [username for username, passed in login_results.items() if not passed]
    if database_ok and not failed:
        print("ALL 5 LOGINS WORKING")
        return 0

    print("LOGIN HEALTH FAILED")
    if not database_ok:
        print("Database/path checks failed; live login results are informational only.")
    if failed:
        print(f"Failed logins: {', '.join(failed)}")
    return 1


if __name__ == "__main__":
    sys.exit(main())