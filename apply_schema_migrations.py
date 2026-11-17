# -*- coding: utf-8 -*-
"""
apply_schema_migrations.py
==========================
محرك ترحيل وتحديث مخطط PostgreSQL بطريقة آمنة وقابلة للتحقق.
الميزات الأساسية:
1. فحص وقائي مسبق (Pre-DDL Check): إذا كانت قاعدة البيانات تحتوي على جداول وبيانات مسبقة،
   يتوقف السكربت فوراً ويطبع تقريراً بالبيانات الموجودة دون إجراء أي تعديل.
2. ترقيم فهارس عناصر الطلبات (item_index) تسلسلياً باستخدام ROW_NUMBER() دون حذف أي صف
   ودون أي تعارض قبل تطبيق القيد الفريد.
3. إنشاء جدول جلسات المشرفين admin_sessions.
4. إضافة حقل order_token_hash في جدول orders لدعم استعلام الزبون الآمن.
5. توثيق رقم الترحيل في جدول schema_migrations داخل Transaction متكامل.
"""

import os
import sys

try:
    import psycopg2
except ImportError:
    psycopg2 = None

def get_connection():
    if psycopg2 is None:
        print("❌ psycopg2 غير مثبت. نفّذ: pip install psycopg2-binary")
        sys.exit(1)
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL غير محدد في متغيرات البيئة.")
        sys.exit(1)
    return psycopg2.connect(db_url)

def inspect_pre_existing_data(cur):
    """
    يفحص الجداول الأساسية للتأكد مما إذا كانت القاعدة فارغة أو جديدة أو تحتوي على بيانات قديمة.
    1. إذا كانت القاعدة جديدة تماماً (لا تحتوي على أي من الجداول): يعيد قاموساً فارغاً (تعتبر نظيفة).
    2. إذا كانت الجداول موجودة: يفحص عدد الصفوف في كل منها.
    3. إذا وُجد في أي جدول صف واحد أو أكثر: يعيد قاموساً بأسماء الجداول وعدد الصفوف فيها.
    """
    tables_to_check = [
        "orders", "order_items", "products", "categories",
        "complaints", "users", "banners", "delivery_zones"
    ]
    existing_counts = {}
    any_table_found = False
    for table in tables_to_check:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = %s
            );
            """,
            (table,)
        )
        exists = cur.fetchone()[0]
        if exists:
            any_table_found = True
            cur.execute(f"SELECT COUNT(*) FROM {table};")
            count = cur.fetchone()[0]
            if count > 0:
                existing_counts[table] = count

    return existing_counts, any_table_found

def run_migrations():
    print("=" * 65)
    print(" 🛠️  Taswoq — فحص وترحيل مخطط PostgreSQL (Safe DDL Engine)")
    print("=" * 65)

    conn = get_connection()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 1. الفحص الوقائي المسبق (Pre-DDL Inspection)
        print("🔍 1. فحص حالة قاعدة البيانات المسبقة...")
        pre_existing, tables_exist = inspect_pre_existing_data(cur)
        if pre_existing:
            print("\n" + "!" * 65)
            print("⚠️  تنبيه أمان صارم: تم العثور على بيانات سابقة داخل قاعدة البيانات:")
            print("!" * 65)
            for tbl, cnt in pre_existing.items():
                print(f"   - جدول {tbl:<20}: {cnt} سجل موجود")
            print("!" * 65)
            print("🛑 تم إيقاف العملية تلقائياً لمنع أي تعديل أو تعارض في المخطط.")
            print("   للمتابعة بأمان، يجب مراجعة البيانات السابقة أو تفريغ القاعدة يدوياً.")
            print("!" * 65)
            conn.rollback()
            sys.exit(1)
        elif not tables_exist:
            print("✅ قاعدة بيانات جديدة كلياً (لا توجد جداول سابقة). المتابعة بإنشاء المخطط...\n")
        else:
            print("✅ قاعدة البيانات نظيفة (الجداول موجودة ولكنها خالية من أي سجلات). متابعة...\n")

        # 2. إنشاء جدول توثيق المخطط schema_migrations
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(50) PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at BIGINT NOT NULL
            );
            """
        )

        # 3. جدول جلسات المشرفين admin_sessions مع دعم csrf_token_hash
        print("📦 2. التحقق من جدول admin_sessions...")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token_hash VARCHAR(64) PRIMARY KEY,
                csrf_token_hash VARCHAR(64),
                user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                permissions JSONB,
                created_at BIGINT NOT NULL,
                expires_at BIGINT NOT NULL,
                ip_address TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp  ON admin_sessions(expires_at);
            """
        )

        # 4. تحديث جدول orders: إضافة order_token_hash
        print("📦 3. التحقق من حقل order_token_hash في جدول orders...")
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_token_hash';
            """
        )
        if not cur.fetchone():
            cur.execute("ALTER TABLE orders ADD COLUMN order_token_hash VARCHAR(64);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_token_hash ON orders(order_token_hash);")
            print("   ✅ تم إضافة حقل order_token_hash وفهرسه بنجاح.")
        else:
            print("   ℹ️  حقل order_token_hash موجود مسبقاً.")

        # 5. تحديث جدول order_items: إضافة item_index وترقيم الصفوف السابقة بأمان
        print("📦 4. معالجة عمود item_index والقيد الفريد في order_items...")
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'item_index';
            """
        )
        if not cur.fetchone():
            cur.execute("ALTER TABLE order_items ADD COLUMN item_index INTEGER;")
            print("   ✅ تم إضافة عمود item_index.")

        # ترقيم أي عناصر سابقة تسلسلياً باستخدام Window Function دون أي حذف
        cur.execute(
            """
            WITH numbered_items AS (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY id ASC) - 1 AS new_idx
                FROM order_items
            )
            UPDATE order_items
            SET item_index = numbered_items.new_idx
            FROM numbered_items
            WHERE order_items.id = numbered_items.id
              AND order_items.item_index IS NULL;
            """
        )
        cur.execute("ALTER TABLE order_items ALTER COLUMN item_index SET DEFAULT 0;")

        # التحقق الصارم من انعدام التكرارات قبل إضافة القيد الفريد
        cur.execute(
            """
            SELECT order_id, item_index, COUNT(*)
            FROM order_items
            GROUP BY order_id, item_index
            HAVING COUNT(*) > 1;
            """
        )
        duplicates = cur.fetchall()
        if duplicates:
            print(f"❌ تم العثور على {len(duplicates)} تكرارات لعناصر الطلبات! التراجع...")
            conn.rollback()
            sys.exit(1)

        # إضافة القيد الفريد إذا لم يكن موجوداً
        cur.execute(
            """
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_schema = 'public' AND table_name = 'order_items' AND constraint_name = 'uq_order_items_order_index';
            """
        )
        if not cur.fetchone():
            cur.execute(
                """
                ALTER TABLE order_items 
                ADD CONSTRAINT uq_order_items_order_index UNIQUE (order_id, item_index);
                """
            )
            print("   ✅ تم إضافة القيد الفريد uq_order_items_order_index بنجاح.")
        else:
            print("   ℹ️  القيد الفريد uq_order_items_order_index موجود مسبقاً.")

        # 6. ضبط متسلسلات المعرفات التلقائية الآمنة للطلبات المتزامنة
        print("📦 5. التحقق من متسلسلات المعرفات التلقائية (Sequences)...")
        cur.execute("CREATE SEQUENCE IF NOT EXISTS orders_id_seq START WITH 1001;")
        cur.execute("ALTER TABLE orders ALTER COLUMN id SET DEFAULT nextval('orders_id_seq');")
        cur.execute("CREATE SEQUENCE IF NOT EXISTS complaints_id_seq START WITH 101;")
        cur.execute("ALTER TABLE complaints ALTER COLUMN id SET DEFAULT nextval('complaints_id_seq');")
        cur.execute("SELECT setval('orders_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM orders), 1000), 1000) + 1, false);")
        cur.execute("SELECT setval('complaints_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM complaints), 100), 100) + 1, false);")
        print("   ✅ تم تهيئة وضبط متسلسلات orders_id_seq و complaints_id_seq بنجاح.")

        # 7. الترحيل الإصداري v002: إضافة دعم منع تكرار الطلب الذري (client_order_id & payload_hash)
        print("📦 6. فحص وتطبيق ترحيل client_order_id و payload_hash لمنع تكرار الطلبات...")
        cur.execute("SELECT version FROM schema_migrations WHERE version = '20261110_02_atomic_idempotency';")
        if not cur.fetchone():
            cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_order_id TEXT;")
            cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64);")

            # الفحص الاستباقي الصارم للتكرارات قبل تطبيق القيد الفريد
            cur.execute(
                """
                SELECT client_order_id, COUNT(*) 
                FROM orders 
                WHERE client_order_id IS NOT NULL 
                GROUP BY client_order_id 
                HAVING COUNT(*) > 1;
                """
            )
            dup_rows = cur.fetchall()
            if dup_rows:
                print("\n" + "!" * 65)
                print("🛑 خطأ وقائي حرج: تم العثور على قيم مكررة لحقل client_order_id:")
                for r in dup_rows:
                    print(f"   - المعرف '{r[0]}' مكرر {r[1]} مرات")
                print("   تم إيقاف الترحيل تلقائياً لحماية البيانات السابقة دون أي حذف أو تعديل.")
                print("!" * 65)
                conn.rollback()
                sys.exit(1)

            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_client_order_id ON orders(client_order_id) WHERE client_order_id IS NOT NULL;")
            cur.execute(
                """
                INSERT INTO schema_migrations (version, name, applied_at)
                VALUES ('20261110_02_atomic_idempotency', 'Add client_order_id and payload_hash with unique index', %s);
                """,
                (int(time.time() * 1000),)
            )
            print("   ✅ تم إضافة حقول client_order_id و payload_hash والفهرس الفريد بنجاح.")
        else:
            print("   ℹ️  ترحيل 20261110_02_atomic_idempotency مطبق مسبقاً.")

        # توثيق إنجاز الترحيل الأساسي الأول
        import time
        cur.execute(
            """
            INSERT INTO schema_migrations (version, name, applied_at)
            VALUES ('20261109_01_security_and_idempotency', 'Add sessions, order tokens, and item_index unique constraint', %s)
            ON CONFLICT (version) DO NOTHING;
            """,
            (int(time.time() * 1000),)
        )

        conn.commit()
        print("\n" + "=" * 65)
        print("✅ اكتمل تحديث المخطط بنجاح وأمان تام داخل Transaction.")
        print("=" * 65)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ حدث خطأ أثناء فحص/تحديث المخطط: {e}")
        print("🔄 تم التراجع عن جميع التغييرات (Rollback).")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run_migrations()

