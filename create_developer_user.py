#!/usr/bin/env python3
"""
CLI Script to initialize usr_developer account in PostgreSQL with explicit operational permissions.
NOT EXECUTED AUTOMATICALLY. Intended for one-time server administration.
"""

import os
import sys
import json
import psycopg2

def init_developer_user():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        # البحث عن ملف .env في مجلد السكريبت أو المسار الافتراضي على السيرفر
        base_dir = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.join(base_dir, ".env"),
            "/var/www/taswoq/.env"
        ]
        for c in candidates:
            if os.path.isfile(c):
                with open(c, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("DATABASE_URL="):
                            db_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
                if db_url:
                    break

    if not db_url:
        print("❌ DATABASE_URL environment variable is required.")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        dev_perms = {
            "orders:read": True,
            "orders:write": True,
            "products:read": True,
            "products:write": True,
            "categories:read": True,
            "categories:write": True,
            "banners:read": True,
            "banners:write": True,
            "complaints:read": True,
            "complaints:write": True,
            "notifications:read": True,
            "notifications:write": True,
            "expenses:read": True,
            "expenses:write": True,
            "delivery:read": True,
            "delivery:write": True,
            "dashboard:read": True,
            "users": False,
            "settings": False
        }

        cur.execute(
            """
            INSERT INTO users (id, username, full_name, password_hash, role, is_active, permissions, is_primary_admin, must_change_password)
            VALUES ('usr_developer', 'usr_developer', 'مهندس النظام والمطور', NULL, 'developer_admin', TRUE, %s, FALSE, FALSE)
            ON CONFLICT (id) DO UPDATE SET
                role = 'developer_admin',
                is_active = TRUE,
                is_primary_admin = FALSE,
                permissions = EXCLUDED.permissions;
            """,
            (json.dumps(dev_perms),)
        )
        conn.commit()
        print("✅ usr_developer initialized successfully with operational RBAC permissions.")
    finally:
        conn.close()

if __name__ == "__main__":
    init_developer_user()

