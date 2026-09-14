from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from jose import jwt

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

TEST_USERS_DB = Path(tempfile.gettempdir()) / "rail-block-planning-auth-tests.db"
TEST_OVERRIDE_DB = Path(tempfile.gettempdir()) / "rail-block-planning-auth-overrides.db"
TEST_USERS_DB.unlink(missing_ok=True)
TEST_OVERRIDE_DB.unlink(missing_ok=True)
os.environ["USERS_DB_PATH"] = str(TEST_USERS_DB)
os.environ["OVERRIDE_DB_PATH"] = str(TEST_OVERRIDE_DB)

import src.api as api
from src.auth import JWT_ALGORITHM, JWT_SECRET, ensure_users_db, hash_password, verify_password


class AuthenticationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        connection = ensure_users_db(seed_demo_accounts=False)
        try:
            connection.execute("DELETE FROM users")
            users = [
                ("admin-user", "admin-pass", "COA_ADMIN", None),
                ("head-user", "head-pass", "DIVISION_HEAD", None),
                ("tms-engineer", "tms-pass", "DEPT_ENGINEER", "TMS"),
                ("smms-engineer", "smms-pass", "DEPT_ENGINEER", "SMMS"),
            ]
            for username, password, role, department in users:
                connection.execute(
                    "INSERT INTO users (username, hashed_password, role, department, created_at) VALUES (?, ?, ?, ?, ?)",
                    (username, hash_password(password), role, department, datetime.now(timezone.utc).isoformat()),
                )
            connection.commit()
        finally:
            connection.close()

    def setUp(self) -> None:
        self.client = TestClient(api.app)

    def login(self, username: str, password: str) -> str:
        response = self.client.post("/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def test_login_success_and_generic_failures(self) -> None:
        response = self.client.post("/auth/login", json={"username": "admin-user", "password": "admin-pass"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["role"], "COA_ADMIN")
        decoded = jwt.decode(payload["access_token"], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        self.assertEqual(decoded["sub"], "admin-user")
        self.assertEqual(decoded["role"], "COA_ADMIN")
        self.assertIn("exp", decoded)

        wrong_password = self.client.post("/auth/login", json={"username": "admin-user", "password": "wrong"})
        unknown_user = self.client.post("/auth/login", json={"username": "nobody", "password": "wrong"})
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_user.status_code, 401)
        self.assertEqual(wrong_password.json(), unknown_user.json())

    def test_missing_invalid_and_expired_tokens_are_401(self) -> None:
        missing = self.client.get("/defects")
        self.assertEqual(missing.status_code, 401)
        expired = jwt.encode(
            {"sub": "admin-user", "role": "COA_ADMIN", "department": None, "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )
        response = self.client.get("/defects", headers={"Authorization": f"Bearer {expired}"})
        self.assertEqual(response.status_code, 401)

    def test_login_sets_cookie_and_session_can_be_rehydrated(self) -> None:
        response = self.client.post("/auth/login", json={"username": "admin-user", "password": "admin-pass"})
        self.assertEqual(response.status_code, 200)
        set_cookie = response.headers.get("set-cookie") or ""
        self.assertIn("access_token=", set_cookie)
        self.assertIn("max-age=604800", set_cookie.lower())

        token = response.cookies.get("access_token")
        self.assertIsNotNone(token)

        me = self.client.get("/auth/me", cookies={"access_token": token})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["username"], "admin-user")
        self.assertEqual(me.json()["role"], "COA_ADMIN")

    def test_engineer_cannot_override_and_reason_is_distinct(self) -> None:
        token = self.login("tms-engineer", "tms-pass")
        response = self.client.post(
            "/schedule/preview-override",
            headers={"Authorization": f"Bearer {token}"},
            json={"defect_id": "TMS-002", "target_slot_id": "GF-SEC-01-20260916-0040", "horizon": "monthly", "reason_category": "prioritization_mistake"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"]["reason"], "insufficient_role")
        self.assertNotEqual(response.json()["detail"]["reason"], "p1_displacement_not_authorized")

    def test_admin_passes_through_to_existing_override_logic(self) -> None:
        token = self.login("admin-user", "admin-pass")
        preview = {
            "feasible": True,
            "reason": None,
            "available_hours": 3.5,
            "required_hours": 3.5,
            "newly_deferred": [],
            "newly_cleared": [],
            "priority_alert": False,
            "p1_displacement": False,
            "reason_category_valid_for_displacement": True,
            "metrics_before": {},
            "metrics_after": {},
        }
        with patch.object(api, "_build_override_preview", return_value=preview) as builder:
            response = self.client.post(
                "/schedule/preview-override",
                headers={"Authorization": f"Bearer {token}"},
                json={"defect_id": "TMS-002", "target_slot_id": "GF-SEC-01-20260916-0040", "horizon": "monthly", "reason_category": "prioritization_mistake"},
            )
        self.assertEqual(response.status_code, 200)
        builder.assert_called_once()

    def test_department_filter_is_server_side_and_division_head_is_unfiltered(self) -> None:
        engineer_token = self.login("tms-engineer", "tms-pass")
        engineer_response = self.client.get("/defects", headers={"Authorization": f"Bearer {engineer_token}"})
        self.assertEqual(engineer_response.status_code, 200)
        self.assertTrue(engineer_response.json())
        self.assertEqual({row["source_system"] for row in engineer_response.json()}, {"TMS"})

        head_token = self.login("head-user", "head-pass")
        head_response = self.client.get("/defects", headers={"Authorization": f"Bearer {head_token}"})
        self.assertEqual(head_response.status_code, 200)
        self.assertGreater(len(head_response.json()), len(engineer_response.json()))
        self.assertEqual({row["source_system"] for row in head_response.json()}, {"TMS", "SMMS", "TDMS"})

    def test_demo_accounts_are_seeded_idempotently_on_fresh_auth_db(self) -> None:
        seed_path = Path(tempfile.gettempdir()) / "rail-block-planning-demo-seed.db"
        seed_path.unlink(missing_ok=True)

        connection = ensure_users_db(seed_path)
        try:
            usernames = [row[0] for row in connection.execute("SELECT username FROM users ORDER BY user_id").fetchall()]
            self.assertEqual(usernames, ["coa.admin", "division.head", "tms.engineer", "smms.engineer", "tdms.engineer"])
            self.assertTrue(
                all(verify_password("123456789", row[1]) for row in connection.execute("SELECT username, hashed_password FROM users"))
            )
        finally:
            connection.close()

        connection = ensure_users_db(seed_path)
        try:
            users = connection.execute("SELECT username FROM users ORDER BY user_id").fetchall()
            self.assertEqual([row[0] for row in users], ["coa.admin", "division.head", "tms.engineer", "smms.engineer", "tdms.engineer"])
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM users").fetchone()[0], 5)
        finally:
            connection.close()
            seed_path.unlink(missing_ok=True)

    def test_legacy_demo_usernames_are_migrated(self) -> None:
        seed_path = Path(tempfile.gettempdir()) / "rail-block-planning-legacy-demo-seed.db"
        seed_path.unlink(missing_ok=True)

        connection = ensure_users_db(seed_path, seed_demo_accounts=False)
        try:
            connection.execute(
                "INSERT INTO users (username, hashed_password, role, department, created_at) VALUES (?, ?, ?, ?, ?)",
                ("admin", hash_password("123456789"), "COA_ADMIN", None, datetime.now(timezone.utc).isoformat()),
            )
            connection.commit()
        finally:
            connection.close()

        connection = ensure_users_db(seed_path)
        try:
            self.assertEqual(connection.execute("SELECT username FROM users").fetchone()[0], "coa.admin")
            self.assertIsNotNone(api.authenticate_user("coa.admin", "123456789"))
            self.assertIsNone(api.authenticate_user("admin", "123456789"))
        finally:
            connection.close()
            seed_path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
