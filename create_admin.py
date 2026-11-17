#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
create_admin.py
===============
أداة سطر أوامر محلية (CLI) حصرية لإنشاء حساب المدير العام الأولي (Primary Admin) في PostgreSQL:
- تُشغّل يدوياً عبر SSH على VPS بعد النشر.
- لا يوجد أي مسار HTTP عام للتسجيل.
- تطلب البريد واسم المستخدم وكلمة المرور المؤقتة مرتين بإدخال مخفي (getpass).
- تُجزئ كلمة المرور باستخدام scrypt وفق توصية OWASP الرسمية (N=131072, r=8, p=1).
- تضبط must_change_password=True لإجبار المدير على تغيير كلمة المرور فور أول تسجيل دخول.
- تتوقف فوراً برسالة واضحة وتمنع إنشاء أي حساب إضافي أو تعديل كلمة المرور إذا كان هناك مدير عام مسجل مسبقاً.
- لا تحتوي على أي بريد أو كلمة مرور افتراضية.
"""

import os
import sys
import getpass
import hashlib
import secrets
import time
import json
import argparse
import re

try:
    import psycopg2
except ImportError:
    psycopg2 = None

def get_db_url() -> str:
    """استرجاع رابط قاعدة البيانات من البيئة أو ملفات .env المحلية."""
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return db_url.strip()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, ".env"),
        "/var/www/taswoq/.env"
    ]
    for c in candidates:
        if os.path.isfile(c):
            with open(c, "r", encoding="utf-8") as f:
                for line in f:
                    l = line.strip()
                    if l.startswith("DATABASE_URL="):
                        val = l.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            return val
    return ""

def hash_scrypt_password(password: str) -> str:
    """تجزئة كلمة المرور باستخدام scrypt وفق توصية OWASP الرسمية (N=131072, r=8, p=1)."""
    salt = secrets.token_bytes(16)
    calc_hash = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=131072,
        r=8,
        p=1,
        maxmem=256 * 1024 * 1024
    ).hex()
    return f"$scrypt$ln=17,r=8,p=1${salt.hex()}${calc_hash}"

def main(argv=None):
    parser = argparse.ArgumentParser(description="إنشاء حساب المدير العام الأولي لنظام تسوق.")
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="قراءة البيانات من stdin (مخصص للاختبارات البرمجية المعزولة)"
    )
    args = parser.parse_args(argv)

    print("=" * 64)
    print(" 🛡️  Taswoq — أداة إنشاء حساب المدير العام الأولي (CLI Only)")
    print("=" * 64)

    if psycopg2 is None:
        print("❌ خطأ: مكتبة psycopg2 غير مثبتة في بيئة بايثون الحالية.")
        print("   يرجى التأكد من تفعيل بيئة venv الصحيحة.")
        sys.exit(1)

    db_url = get_db_url()
    if not db_url:
        print("❌ خطأ: DATABASE_URL غير محدد في متغيرات البيئة أو في ملف .env.")
        sys.exit(1)

    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cur = conn.cursor()
    except Exception as e:
        print(f"❌ فشل الاتصال بقاعدة البيانات: {e}")
        sys.exit(1)

    try:
        # 1. قفل تزامن على مستوى المعاملة (Advisory Lock + Table Lock) لحماية الفحص والإنشاء من أي تشغيل متزامن
        cur.execute("SELECT pg_try_advisory_xact_lock(hashtext('taswoq_create_primary_admin'));")
        got_lock = cur.fetchone()[0]
        if not got_lock:
            print("\n❌ تنبيه أمني: هناك جلسة أخرى تقوم بتهيئة المدير العام حالياً بالتزامن.")
            print("   تم إلغاء العملية منعاً للتعارض وتكرار الحسابات.")
            conn.rollback()
            sys.exit(1)

        # قفل الجدول لمنع أي إدراج متزامن حتى اكتمال المعاملة
        cur.execute("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;")

        # 2. فحص وجود مدير عام مسجل مسبقاً (قيد صارم: لا إنشاء ولا تعديل إذا وجد مدير عام)
        cur.execute(
            """
            SELECT id, username, email FROM users
            WHERE role = 'primary_admin' OR is_primary_admin = TRUE
            LIMIT 1;
            """
        )
        existing_primary = cur.fetchone()
        if existing_primary:
            ex_id, ex_uname, ex_mail = existing_primary
            conn.rollback()
            print("\n❌ تنبيه أمني صارم:")
            print(f"   يوجد بالفعل حساب مدير عام مسجل في النظام!")
            print(f"   - المعرف: {ex_id}")
            print(f"   - اسم المستخدم: {ex_uname}")
            print(f"   - البريد: {ex_mail or 'غير محدد'}")
            print("\n⛔ لمنع اختطاف الصلاحيات أو تجاوز الحماية:")
            print("   لا تسمح هذه الأداة بإنشاء مدير عام إضافي ولا تعديل كلمة مرور الحساب القائم.")
            print("   لإدارة الحسابات، يرجى تسجيل الدخول من خلال لوحة الإدارة.")
            sys.exit(1)

        print("\nيرجى إدخال بيانات المدير العام الجديد:")

        # 2. قراءة المدخلات
        if args.stdin:
            lines = [sys.stdin.readline().strip("\r\n") for _ in range(5)]
            email = lines[0].strip()
            username = lines[1].strip()
            full_name = lines[2].strip() or "المدير العام"
            password = lines[3].strip()
            password_confirm = lines[4].strip()
        else:
            email = input("📧 البريد الإلكتروني للمدير العام (Email): ").strip()
            username = input("👤 اسم المستخدم (Username): ").strip()
            full_name = input("📝 الاسم الكامل (اختياري - افتراضي: المدير العام): ").strip() or "المدير العام"

            password = getpass.getpass("🔑 كلمة المرور المؤقتة (الإدخال مخفي): ")
            password_confirm = getpass.getpass("🔒 أعد إدخال كلمة المرور المؤقتة للتأكيد: ")

        # 3. التحقق من صحة المدخلات
        if not email or "@" not in email or "." not in email:
            print("❌ خطأ: صيغة البريد الإلكتروني غير صالحة.")
            sys.exit(1)

        if not username or len(username) < 3 or " " in username:
            print("❌ خطأ: اسم المستخدم يجب ألا يقل عن 3 أحرف ولا يحتوي على مسافات.")
            sys.exit(1)

        if not password or len(password) < 8:
            print("❌ خطأ: كلمة المرور المؤقتة يجب أن تتكون من 8 خانات على الأقل.")
            sys.exit(1)

        if password != password_confirm:
            print("❌ خطأ: كلمتا المرور غير متطابقتين.")
            sys.exit(1)

        # 4. فحص عدم تكرار اسم المستخدم أو البريد الإلكتروني
        cur.execute("SELECT id FROM users WHERE username = %s OR email = %s;", (username, email))
        dup = cur.fetchone()
        if dup:
            print(f"❌ خطأ: اسم المستخدم أو البريد الإلكتروني مسجل مسبقاً في النظام (معرف: {dup[0]}).")
            sys.exit(1)

        # 5. تجزئة كلمة المرور بـ scrypt (دون حفظ النص الصريح مطلقاً)
        hashed_password = hash_scrypt_password(password)
        del password
        del password_confirm

        user_id = f"usr-gm-{int(time.time() * 1000)}"
        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        perms_json = json.dumps({"all": True})

        # 6. إدراج الحساب بدور primary_admin وإلزام تغيير كلمة المرور must_change_password=True
        # مع قيد تأكيد عدم وجود مدير عام مسجل في لحظة الإدراج نفسها (Defense-in-depth against race conditions)
        cur.execute(
            """
            INSERT INTO users (
                id, full_name, username, email, password_hash, role,
                is_primary_admin, is_active, must_change_password,
                failed_attempts, created_at, permissions
            )
            SELECT
                %s, %s, %s, %s, %s, %s,
                TRUE, TRUE, TRUE,
                0, %s, %s
            WHERE NOT EXISTS (
                SELECT 1 FROM users WHERE role = 'primary_admin' OR is_primary_admin = TRUE
            );
            """,
            (
                user_id, full_name, username, email, hashed_password,
                "primary_admin", now_str, perms_json
            )
        )
        if cur.rowcount == 0:
            conn.rollback()
            print("\n❌ تنبيه أمني: تعذر إنشاء الحساب؛ تم رصد مدير عام مسجل مسبقاً من جلسة متزامنة.")
            print("   تم إلغاء المعاملة بالكامل دون تعديل أي بيانات.")
            sys.exit(1)

        conn.commit()

        print("\n" + "=" * 64)
        print("✅ تم إنشاء حساب المدير العام الأولي بنجاح تام!")
        print(f"   المعرف (ID):              {user_id}")
        print(f"   اسم المستخدم (Username):   {username}")
        print(f"   البريد الإلكتروني (Email): {email}")
        print(f"   الدور (Role):             primary_admin (المدير الأساسي)")
        print(f"   إلزام التغيير:            مفعل (must_change_password=True)")
        print("=" * 64)
        print("💡 عند تسجيل الدخول لأول مرة عبر صفحة الدخول المعتادة،")
        print("   سيطلب النظام تلقائياً تعيين كلمة مرور جديدة ودائمة قبل تمكين أي إجراءات.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ خطأ غير متوقع أثناء إنشاء الحساب: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
