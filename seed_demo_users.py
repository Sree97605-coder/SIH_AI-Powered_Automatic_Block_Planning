from __future__ import annotations

from datetime import datetime, timezone

from src.auth import VALID_DEPARTMENTS, VALID_ROLES, ensure_users_db, hash_password

SHARED_PASSWORD = "123456789"
DEMO_USERS = [
    ("admin", "COA_ADMIN", None),
    ("head", "DIVISION_HEAD", None),
    ("tms", "DEPT_ENGINEER", "TMS"),
    ("smms", "DEPT_ENGINEER", "SMMS"),
    ("tdms", "DEPT_ENGINEER", "TDMS"),
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

        credentials: list[str] = []
        for username, role, department in DEMO_USERS:
            connection.execute(
                """
                INSERT INTO users (username, hashed_password, role, department, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, hash_password(SHARED_PASSWORD), role, department, datetime.now(timezone.utc).isoformat()),
            )
            credentials.append(username)
        connection.commit()
    finally:
        connection.close()

    print("DEMO ONLY, not committed to git")
    print(f"Shared password: {SHARED_PASSWORD}")
    print("Created demo accounts:")
    for username in credentials:
        print(username)


if __name__ == "__main__":
    main()
