from __future__ import annotations

import secrets
from datetime import datetime, timezone

from src.auth import VALID_DEPARTMENTS, VALID_ROLES, ensure_users_db, hash_password

DEMO_USERS = [
    ("coa.admin", "COA_ADMIN", None),
    ("division.head", "DIVISION_HEAD", None),
    ("engineer.tms", "DEPT_ENGINEER", "TMS"),
    ("engineer.smms", "DEPT_ENGINEER", "SMMS"),
    ("engineer.tdms", "DEPT_ENGINEER", "TDMS"),
]


def main() -> None:
    if len(DEMO_USERS) != 5 or {role for _, role, _ in DEMO_USERS} != VALID_ROLES:
        raise RuntimeError("Demo account definition does not match the required five roles.")
    if {department for _, _, department in DEMO_USERS if department is not None} != VALID_DEPARTMENTS:
        raise RuntimeError("Demo account definition does not cover all departments.")

    connection = ensure_users_db()
    try:
        if connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] != 0:
            raise RuntimeError("Users database is not empty; refusing to reseed accounts.")

        credentials: list[tuple[str, str]] = []
        for username, role, department in DEMO_USERS:
            password = secrets.token_urlsafe(12)
            connection.execute(
                """
                INSERT INTO users (username, hashed_password, role, department, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, hash_password(password), role, department, datetime.now(timezone.utc).isoformat()),
            )
            credentials.append((username, password))
        connection.commit()
    finally:
        connection.close()

    print("DEMO ONLY, not committed to git")
    print("Generated credentials (shown once; passwords are not stored in plaintext):")
    for username, password in credentials:
        print(f"{username}: {password}")


if __name__ == "__main__":
    main()
