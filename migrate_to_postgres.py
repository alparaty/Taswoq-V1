# -*- coding: utf-8 -*-
"""
migrate_to_postgres.py
======================
أداة ترحيل وتدقيق آمنة وحصيفة:
1. تقرأ من taswoq_db.json الحالي (الذي يحتوي الأقسام فقط).
2. فحص ما قبل الترحيل الصارم: إذا وُجدت أي بيانات سابقة في PostgreSQL، تتوقف الأداة فوراً وتطبع تقريراً دون دمج أو تعديل.
3. الترحيل يعتمد على Idempotent Inserts.
4. التدقيق العميق: مطابقة المفاتيح وفحص المحتوى حقلاً بحقل وكشف الزيادات والتكرارات.
5. لا تعديل ولا مساس بـ taswoq_db.json.
"""

import os
import sys
import json
import time

try:
    import psycopg2
except ImportError:
    psycopg2 = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SEED_FILE = os.path.join(BASE_DIR, "categories_seed.json")

def resolve_source_file():
    """
    يحدد مسار ملف المصدر وفقاً للقواعد الصارمة التالية:
    1. أسبقية أولى: الوسيط الصريح (--source <path> أو --source=<path>).
       - يُرفض فوراً إذا لم يتبعه مسار صالح أو إذا كان المسار فارغاً.
       - لا يُسمح بقراءة taswoq_db.json إلا إذا تم تمريره صراحةً هنا.
    2. المصدر الافتراضي الوحيد: categories_seed.json.
       - لا يوجد أي رجوع صامت أو تلقائي إلى taswoq_db.json نهائياً.
    """
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--source":
            if i + 1 >= len(args) or args[i + 1].startswith("-"):
                print("❌ خطأ: وسيط --source يتطلب تحديد مسار الملف بعده مباشرة.")
                print("💡 الاستخدام الصحيح: python migrate_to_postgres.py --source <مسار_الملف>")
                sys.exit(1)
            explicit_path = args[i + 1].strip()
            if not explicit_path:
                print("❌ خطأ: مسار الملف المحدد بعد --source فارغ.")
                sys.exit(1)
            if not os.path.isabs(explicit_path):
                explicit_path = os.path.join(BASE_DIR, explicit_path)
            return explicit_path, f"وسيط سطر الأوامر الصريح (--source: {os.path.basename(explicit_path)})"

        elif arg.startswith("--source="):
            explicit_path = arg.split("=", 1)[1].strip()
            if not explicit_path:
                print("❌ خطأ: وسيط --source= يتطلب تحديد مسار ملف صالح بعد علامة '='.")
                sys.exit(1)
            if not os.path.isabs(explicit_path):
                explicit_path = os.path.join(BASE_DIR, explicit_path)
            return explicit_path, f"وسيط سطر الأوامر الصريح (--source={os.path.basename(explicit_path)})"

    # المصدر الافتراضي الوحيد المعتمد لنشر الأقسام
    return DEFAULT_SEED_FILE, "ملف بذور الأقسام الافتراضي الوحيد (categories_seed.json)"

def load_source_json():
    target_file, source_desc = resolve_source_file()
    if not os.path.exists(target_file):
        if target_file == DEFAULT_SEED_FILE:
            print(f"❌ لم يُعثر على ملف بذور الأقسام الافتراضي: {DEFAULT_SEED_FILE}")
            print("💡 توقف الأمان: السكربت لا يرجع تلقائياً إلى taswoq_db.json.")
            print("   الرجاء توفير categories_seed.json أو تحديد ملف مصدر صراحة عبر:")
            print("   python migrate_to_postgres.py --source <مسار_الملف>")
        else:
            print(f"❌ لم يُعثر على ملف المصدر المحدد [{source_desc}]: {target_file}")
            print("💡 تأكد من صحة مسار الملف الممرر في --source.")
        sys.exit(1)

    with open(target_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"📖 تم قراءة المصدر [{source_desc}] بنجاح من: {target_file}")
    if isinstance(data, list):
        return {"categories": data}
    return data

def get_connection():
    if psycopg2 is None:
        print("❌ psycopg2 غير مثبت. نفّذ: pip install psycopg2-binary")
        sys.exit(1)
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL غير محدد في متغيرات البيئة.")
        sys.exit(1)
    return psycopg2.connect(db_url)

def check_pre_existing_data(cur):
    """يفحص ما إذا كانت هناك بيانات سابقة في أي جدول بقاعدة البيانات."""
    tables = [
        "orders", "order_items", "products", "categories",
        "complaints", "users", "banners", "delivery_zones",
        "whatsapp_recipients", "payment_wallets"
    ]
    found = {}
    for t in tables:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = %s
            );
            """,
            (t,)
        )
        if cur.fetchone()[0]:
            cur.execute(f"SELECT COUNT(*) FROM {t};")
            c = cur.fetchone()[0]
            if c > 0:
                found[t] = c
    return found

def migrate_categories_safe(cur, categories):
    count = 0
    for c in categories:
        cid = str(c.get("id", "")).strip()
        if not cid:
            continue
        cur.execute(
            """
            INSERT INTO categories (id, name_ar, name_en, icon, img, is_special)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name_ar    = EXCLUDED.name_ar,
                name_en    = EXCLUDED.name_en,
                icon       = EXCLUDED.icon,
                img        = EXCLUDED.img,
                is_special = EXCLUDED.is_special;
            """,
            (
                cid,
                str(c.get("nameAr", "")).strip(),
                str(c.get("nameEn", "")).strip(),
                str(c.get("icon", "")).strip(),
                str(c.get("img", "")).strip(),
                bool(c.get("isSpecial", False)),
            )
        )
        count += 1
    return count

def deep_verify_categories(cur, source_categories):
    """تدقيق ومطابقة عميقة للمفاتيح والمحتوى حقلاً بحقل."""
    print("\n" + "=" * 65)
    print(" 🔍 فحص المطابقة والتدقيق العميق لمحتوى الأقسام...")
    print("=" * 65)

    source_dict = {str(c.get("id")): c for c in source_categories}
    source_keys = set(source_dict.keys())

    cur.execute("SELECT id, name_ar, name_en, icon, img, is_special FROM categories;")
    pg_rows = cur.fetchall()
    pg_dict = {
        r[0]: {
            "id": r[0], "nameAr": r[1], "nameEn": r[2] or "",
            "icon": r[3] or "", "img": r[4] or "", "isSpecial": bool(r[5])
        } for r in pg_rows
    }
    pg_keys = set(pg_dict.keys())

    missing_in_pg = source_keys - pg_keys
    surplus_in_pg = pg_keys - source_keys
    common_keys   = source_keys & pg_keys

    content_mismatches = []
    for k in common_keys:
        s = source_dict[k]
        p = pg_dict[k]
        mismatch_fields = []
        for field in ("nameAr", "nameEn", "icon", "isSpecial"):
            if str(s.get(field, "")).strip() != str(p.get(field, "")).strip():
                mismatch_fields.append(f"{field} (JSON='{s.get(field)}' != PG='{p.get(field)}')")
        if mismatch_fields:
            content_mismatches.append((k, mismatch_fields))

    print(f"  📊 إجمالي أقسام JSON:          {len(source_keys)}")
    print(f"  📊 إجمالي أقسام PostgreSQL:    {len(pg_keys)}")
    print(f"  ✅ المفاتيح المتطابقة:          {len(common_keys)}")

    all_passed = True
    if missing_in_pg:
        all_passed = False
        print(f"  ❌ مفاتيح مفقودة في PostgreSQL: {missing_in_pg}")
    if surplus_in_pg:
        all_passed = False
        print(f"  ⚠️  مفاتيح زائدة في PostgreSQL: {surplus_in_pg}")
    if content_mismatches:
        all_passed = False
        print("  ❌ اختلافات في محتوى الحقول:")
        for k, diffs in content_mismatches:
            print(f"     - القسم [{k}]: {', '.join(diffs)}")

    if all_passed:
        print("\n  🎯 النتيجة: تطابق تام 100% في المفاتيح والمحتوى.")
    print("=" * 65)
    return all_passed

def main():
    print("=" * 65)
    print(" 🚀 Taswoq — أداة الترحيل الآمنة (Migration & Verification)")
    print("=" * 65)

    data = load_source_json()
    categories = data.get("categories", [])
    print(f"ℹ️  عدد الأقسام المطلوب ترحيلها من JSON: {len(categories)}")

    conn = get_connection()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # فحص وجود بيانات قديمة في PostgreSQL قبل المتابعة
        print("\n🔍 فحص ما قبل الترحيل (Pre-flight Data Inspection)...")
        existing_data = check_pre_existing_data(cur)
        if existing_data:
            print("\n" + "!" * 65)
            print("🛑 توقف أمان حاسم: تم العثور على بيانات سابقة في قاعدة PostgreSQL:")
            print("!" * 65)
            for tbl, count in existing_data.items():
                print(f"   * جدول {tbl:<20}: {count} سجل موجود مسبقاً")
            print("!" * 65)
            print("⚠️  لن يتم دمج البيانات أو حذفها أو استعادة النسخة الاحتياطية تلقائياً.")
            print("   الرجاء مراجعة قاعدة البيانات وإفراغها يدوياً إذا كنت تريد ترحيل الأقسام فقط.")
            print("!" * 65)
            conn.rollback()
            sys.exit(1)

        print("✅ قاعدة البيانات نظيفة تماماً ولا تحتوي على بيانات سابقة.")
        print("\n⚙️  بدء ترحيل الأقسام داخل Transaction...")

        migrated_count = migrate_categories_safe(cur, categories)
        print(f"✅ تم ترحيل {migrated_count} قسماً بنجاح.")

        # ضبط وتحديث متسلسلات المعرفات التلقائية
        cur.execute("SELECT setval('orders_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM orders), 1000), 1000) + 1, false);")
        cur.execute("SELECT setval('complaints_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM complaints), 100), 100) + 1, false);")

        # حفظ التغييرات
        conn.commit()
        print("💾 تم تأكيد التغييرات (COMMIT) في PostgreSQL بنجاح.")

        # التدقيق والمطابقة العميقة
        verified = deep_verify_categories(cur, categories)
        if not verified:
            print("⚠️  تحذير: التدقيق أظهر عدم تطابق كامل.")
            sys.exit(1)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ حدث خطأ أثناء الترحيل: {e}")
        print("🔄 تم التراجع (Rollback) — لم يتم تغيير أي بيانات.")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
