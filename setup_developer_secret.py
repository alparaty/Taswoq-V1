#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
setup_developer_secret.py
=========================
أداة إعداد سر بوابة المطور على الخادم (VPS) بشكل آمن وخاص تماماً:
- تطلب الرمز عبر إدخال مخفي (getpass) دون إظهاره على الشاشة أو تسجيله.
- تولّد تجزئة scrypt مملحة ومطابقة لتوصية OWASP الرسمية (N=131072, r=8, p=1).
- تكتب التجزئة ذرياً (Atomic Write) وتمنع التكرار (No Duplicates).
- تضبط صلاحيات الملف المقيدة (chmod 600) لمنع وصول المستخدمين غير المصرح لهم.
- لا تطبع الرمز الصريح نهائياً في المخرجات أو السجلات.
"""

import os
import sys
import getpass
import hashlib
import secrets
import argparse

DEFAULT_SECRETS_FILE = "/etc/taswoq/secrets.env"

def generate_scrypt_hash(secret: str) -> str:
    """توليد تجزئة scrypt مملحة وفق توصية OWASP الرسمية (N=131072, r=8, p=1)."""
    salt = secrets.token_bytes(16)
    calc_hash = hashlib.scrypt(
        secret.encode("utf-8"),
        salt=salt,
        n=131072,
        r=8,
        p=1,
        maxmem=256 * 1024 * 1024
    ).hex()
    return f"$scrypt$ln=17,r=8,p=1${salt.hex()}${calc_hash}"

def atomic_write_secret_env(target_path: str, secret_hash: str) -> None:
    """كتابة تجزئة الرمز في ملف البيئة ذرياً دون تكرار وبصلاحيات مقيدة."""
    target_path = os.path.abspath(target_path)
    target_dir = os.path.dirname(target_path)
    if target_dir and not os.path.isdir(target_dir):
        os.makedirs(target_dir, mode=0o700, exist_ok=True)

    lines = []
    if os.path.isfile(target_path):
        with open(target_path, "r", encoding="utf-8") as f:
            lines = [l for l in f if not l.strip().startswith("DEVELOPER_SECRET_HASH=")]

    # إضافة سطر التجزئة الجديد
    lines.append(f'DEVELOPER_SECRET_HASH="{secret_hash}"\n')

    # كتابة الملف المؤقت في نفس المجلد لضمان ذرية الاستبدال
    tmp_path = f"{target_path}.tmp.{secrets.token_hex(4)}"
    try:
        # إنشاء الملف بأذونات 0600 منذ لحظة الإنشاء
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        mode = 0o600
        fd = os.open(tmp_path, flags, mode)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.writelines(lines)

        if hasattr(os, "chmod"):
            try:
                os.chmod(tmp_path, 0o600)
            except Exception:
                pass

        # استبدال ذري
        os.replace(tmp_path, target_path)

        if hasattr(os, "chmod"):
            try:
                os.chmod(target_path, 0o600)
            except Exception:
                pass
    finally:
        if os.path.isfile(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

def main():
    parser = argparse.ArgumentParser(description="إعداد تجزئة رمز المطور السري للخادم.")
    parser.add_argument(
        "--target",
        "-t",
        default=DEFAULT_SECRETS_FILE,
        help=f"مسار ملف الأسرار (الافتراضي: {DEFAULT_SECRETS_FILE})"
    )
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="قراءة الرمز من الدخل القياسي stdin بدلاً من شاشة getpass التفاعلية (للاختبارات البرمجية)"
    )
    args = parser.parse_args()

    print("=" * 64)
    print(" 🔐 Taswoq Developer Gate — Secure Secret Provisioning")
    print("=" * 64)

    if args.stdin:
        secret = sys.stdin.readline().strip("\r\n")
        if not secret:
            print("❌ خطأ: الرمز المدخل فارغ.")
            sys.exit(1)
    else:
        try:
            secret = getpass.getpass("🔑 أدخل رمز المطور السري (الإدخال مخفي): ")
        except (KeyboardInterrupt, EOFError):
            print("\nتم إلغاء العملية.")
            sys.exit(1)

        if not secret:
            print("❌ خطأ: الرمز السري لا يمكن أن يكون فارغاً.")
            sys.exit(1)

        try:
            confirm = getpass.getpass("🔒 أعد إدخال الرمز السري للتأكيد: ")
        except (KeyboardInterrupt, EOFError):
            print("\nتم إلغاء العملية.")
            sys.exit(1)

        if secret != confirm:
            print("❌ خطأ: الرمزان غير متطابقين. تم إلغاء العملية.")
            sys.exit(1)

    # توليد التجزئة وفق OWASP N=131072, r=8, p=1
    scrypt_hash = generate_scrypt_hash(secret)

    # حفظ التجزئة ذرياً في المسار المحدد
    try:
        atomic_write_secret_env(args.target, scrypt_hash)
        print(f"✅ تم حفظ تجزئة scrypt بنجاح في: {args.target}")
        print("🛡️  الصلاحيات: 0600 (محمية ومقيدة للمستخدم المالك فقط).")
        print("💡 تم إعداد بوابة المطور بنجاح دون تسجيل أو طباعة الرمز الصريح.")
    except Exception as e:
        print(f"❌ حدث خطأ أثناء كتابة ملف الأسرار: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
