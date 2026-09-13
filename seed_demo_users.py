from __future__ import annotations

from src.auth import DEMO_USERS, SHARED_PASSWORD, VALID_DEPARTMENTS, VALID_ROLES, ensure_users_db


def main() -> None:
    if len(DEMO_USERS) != 5 or {role for _, role, _ in DEMO_USERS} != VALID_ROLES:
        raise RuntimeError("Demo account definition does not match the required five roles.")
    if {department for _, _, department in DEMO_USERS if department is not None} != VALID_DEPARTMENTS:
        raise RuntimeError("Demo account definition does not cover all departments.")

    connection = ensure_users_db()
    try:
        created = []
        for username, _, _ in DEMO_USERS:
            row = connection.execute("SELECT username FROM users WHERE username = ?", (username,)).fetchone()
            if row is not None:
                created.append(username)
        if not created:
            raise RuntimeError("No demo accounts were created.")
    finally:
        connection.close()

    print("DEMO ONLY, not committed to git")
    print(f"Shared password: {SHARED_PASSWORD}")
    print("Available demo accounts:")
    for username, _, _ in DEMO_USERS:
        print(username)


if __name__ == "__main__":
    main()
