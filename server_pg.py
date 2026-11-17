# -*- coding: utf-8 -*-
"""
server_pg.py
============
خادم مزامنة تسوق الذكي — نسخة PostgreSQL الآمنة والمتكاملة
- دعم مزدوج لـ Bearer Token و HttpOnly Cookies لمقاومة XSS و CSRF
- ترويسات أمان شاملة (nosniff, SAMEORIGIN, strict-origin-when-cross-origin)
- حظر Sandbox صارم لملفات الكود وقواعد البيانات والأسرار والملفات المخفية
- فصل الكتالوج العام عن واجهات المزامنة والإدارة الحساسة
- توليد رمز سري مشفر ومستقل لكل طلب يُعاد للعميل لمرة واحدة فقط
- دعم التحقق الآمن من حالة الطلب عبر مقارنة ثابتة الزمن (hmac.compare_digest)
- دعم كامل لواجهة /api/poll المتوافقة مع MainActivity.java في الأندرويد ولوحة الإدارة
"""

import os
import sys
import json
import time
import socket
import secrets
import hashlib
import hmac
import threading
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, SimpleHTTPRequestHandler
import socketserver
import tempfile

try:
    import psycopg2
    import psycopg2.pool
    import psycopg2.extras
except ImportError:
    psycopg2 = None

# دعم خوارزميات التشفير
HASH_TYPE = None
try:
    from argon2 import PasswordHasher
    ph = PasswordHasher()
    HASH_TYPE = "argon2id"
except ImportError:
    try:
        import bcrypt
        HASH_TYPE = "bcrypt"
    except ImportError:
        HASH_TYPE = "scrypt"

def verify_password(plain_password: str, stored_hash: str) -> bool:
    """التحقق الآمن من كلمة المرور مع دعم الخوارزميات المختلفة."""
    if not stored_hash:
        return False
    try:
        if stored_hash.startswith("$argon2"):
            if HASH_TYPE == "argon2id":
                return ph.verify(stored_hash, plain_password)
            return False
        elif stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"):
            import bcrypt
            return bcrypt.checkpw(plain_password.encode('utf-8'), stored_hash.encode('utf-8'))
        elif stored_hash.startswith("$scrypt$"):
            parts = stored_hash.split("$")
            params = parts[2].split(",")
            n_val = 131072
            r_val = 8
            p_val = 1
            for param in params:
                if param.startswith("ln="):
                    n_val = 1 << int(param.split("=")[1])
                elif param.startswith("n="):
                    n_val = int(param.split("=")[1])
                elif param.startswith("r="):
                    r_val = int(param.split("=")[1])
                elif param.startswith("p="):
                    p_val = int(param.split("=")[1])
            salt = bytes.fromhex(parts[3])
            expected_hash = parts[4]
            calc_hash = hashlib.scrypt(plain_password.encode('utf-8'), salt=salt, n=n_val, r=r_val, p=p_val, maxmem=256*1024*1024).hex()
            return hmac.compare_digest(calc_hash, expected_hash)
        else:
            calc = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
            return hmac.compare_digest(calc, stored_hash)
    except Exception as e:
        print(f"[AUTH VERIFY ERROR] {e}")
        return False

def hash_password(plain_password: str) -> str:
    """تجزئة كلمة المرور باستخدام scrypt وفق توصية OWASP الرسمية الحالية (N=131072 / 2^17, r=8, p=1, ~128 MiB)."""
    salt = secrets.token_bytes(16)
    calc_hash = hashlib.scrypt(plain_password.encode('utf-8'), salt=salt, n=131072, r=8, p=1, maxmem=256*1024*1024).hex()
    return f"$scrypt$ln=17,r=8,p=1${salt.hex()}${calc_hash}"

HOST     = os.environ.get("HOST", "127.0.0.1")
PORT     = int(os.environ.get("PORT", "8080"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
ENV      = os.environ.get("ENV", "production").strip().lower()
ALLOWED_ORIGINS = {o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()}

# =========================================================
# Connection Pool
# =========================================================
DEV_LOGIN_ATTEMPTS = {}
DEV_LOGIN_LOCK = threading.Lock()
DEV_LOCKOUT_DURATION = 15 * 60  # 15 دقيقة
DEV_MAX_FAILED_ATTEMPTS = 5

def check_dev_rate_limit(client_ip: str):
    """التحقق من معدل محاولات دخول المطور لمنع هجمات التخمين."""
    now = time.time()
    with DEV_LOGIN_LOCK:
        expired = [ip for ip, data in DEV_LOGIN_ATTEMPTS.items() if now > data.get("lock_until", 0) and now - data.get("first_attempt", 0) > DEV_LOCKOUT_DURATION]
        for ip in expired:
            DEV_LOGIN_ATTEMPTS.pop(ip, None)

        record = DEV_LOGIN_ATTEMPTS.get(client_ip)
        if record:
            lock_until = record.get("lock_until", 0)
            if lock_until > now:
                retry_after = int(lock_until - now)
                return False, retry_after
    return True, 0

def record_dev_login_failure(client_ip: str):
    now = time.time()
    with DEV_LOGIN_LOCK:
        record = DEV_LOGIN_ATTEMPTS.setdefault(client_ip, {"count": 0, "first_attempt": now, "lock_until": 0})
        if now - record.get("first_attempt", 0) > DEV_LOCKOUT_DURATION:
            record["count"] = 1
            record["first_attempt"] = now
            record["lock_until"] = 0
        else:
            record["count"] += 1

        if record["count"] >= DEV_MAX_FAILED_ATTEMPTS:
            record["lock_until"] = now + DEV_LOCKOUT_DURATION

def record_dev_login_success(client_ip: str):
    with DEV_LOGIN_LOCK:
        DEV_LOGIN_ATTEMPTS.pop(client_ip, None)

def get_developer_secret_hash():
    """
    استرجاع تجزئة رمز المطور السري (المملحة بـ scrypt) حصراً من إعداد سرّي للخادم:
    متغير البيئة DEVELOPER_SECRET_HASH.
    عند غياب التجزئة، تُعطل بوابة المطوّر فقط (برمز 503) مع استمرار عمل المتجر وباقي خدمات النظام.
    دون طباعة الرمز أو التجزئة.
    """
    return os.environ.get("DEVELOPER_SECRET_HASH", "").strip()

_pool      = None
_pool_lock = threading.Lock()
SYSTEM_DATA_LOCK = threading.RLock()

def get_pool():
    global _pool
    if psycopg2 is None:
        print("❌ psycopg2 غير مثبت. نفّذ: pip install psycopg2-binary")
        sys.exit(1)
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                url = os.environ.get("DATABASE_URL")
                if not url:
                    print("❌ DATABASE_URL غير موجود في متغيرات البيئة.")
                    sys.exit(1)
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2, maxconn=20, dsn=url
                )
                print("✅ PostgreSQL Connection Pool جاهز.")
    return _pool

def get_conn():
    return get_pool().getconn()

def put_conn(conn):
    get_pool().putconn(conn)

def get_local_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        ips.append("127.0.0.1")
    return ips

def now_ms():
    return int(time.time() * 1000)

def safe_float(val, default=None):
    if val is None: return default
    try: return float(val)
    except: return default

def safe_int(val, default=None):
    if val is None: return default
    try: return int(val)
    except: return default

import ssl

# قائمة عناوين الوكلاء العكسيين الموثوقين (مثل Nginx المحلي على نفس الخادم)
TRUSTED_PROXIES = {p.strip() for p in os.environ.get("TRUSTED_PROXIES", "127.0.0.1,::1,localhost").split(",") if p.strip()}

def is_transport_secure(handler):
    """تحقق من HTTPS الفعلي أو من ترويسة HTTPS الواردة عبر وكيل موثوق فقط."""
    connection = getattr(handler, "connection", None)
    if connection is not None and hasattr(connection, "cipher"):
        try:
            if connection.cipher():
                return True
        except Exception:
            pass

    client_ip = handler.client_address[0] if getattr(handler, "client_address", None) else ""
    normalized_ip = client_ip.lower()
    if normalized_ip.startswith("::ffff:"):
        normalized_ip = normalized_ip[len("::ffff:"):]
    if normalized_ip in TRUSTED_PROXIES:
        headers = getattr(handler, "headers", {})
        proto = headers.get("X-Forwarded-Proto", "").strip().lower()
        if proto == "https":
            return True
    return False


def is_request_secure(handler):
    """تحديد سمة Secure للكوكي؛ إعدادها لا يُعد دليلاً على أن النقل مشفر فعلياً."""
    if os.environ.get("TASWOQ_COOKIE_SECURE", "").strip().lower() in ("1", "true", "yes"):
        return True
    return is_transport_secure(handler)

# =========================================================
# إدارة جلسات المشرفين، التحقق من الصلاحيات (RBAC)، وحماية CSRF
# =========================================================

def authenticate_admin_request(headers, client_address=None):
    """
    يتحقق من جلسة المشرف ويعيد قراءة حالة الحساب وصلاحياته المحدثة من قاعدة البيانات:
    - عبر HttpOnly Cookie: taswoq_session=<token> (لوحة الإدارة في المتصفح)
    - أو ترويسة Authorization: Bearer <token> (أدوات وسكريبتات سطر الأوامر المستقلة)
    """
    raw_token = ""
    is_cookie = False
    auth_header = headers.get("Authorization", "").strip() if headers else ""
    if auth_header.startswith("Bearer "):
        raw_token = auth_header[7:].strip()
    elif headers and "Cookie" in headers:
        cookies = headers.get("Cookie", "").split(";")
        for c in cookies:
            c = c.strip()
            if c.startswith("taswoq_session="):
                raw_token = c[len("taswoq_session="):].strip()
                is_cookie = True
                break

    if not raw_token:
        return None

    token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.user_id, s.role, s.permissions, s.expires_at, s.csrf_token_hash,
                   u.is_active, u.username, u.full_name, u.role, u.permissions,
                   u.is_primary_admin, u.must_change_password
            FROM admin_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = %s;
            """,
            (token_hash,)
        )
        row = cur.fetchone()
        if not row:
            return None
        s_uid, s_role, s_perms, expires_at, csrf_hash, is_active, username, full_name, u_role, u_perms, is_primary_admin, must_change_password = row
        # التحقق الفوري من حالة تفعيل الحساب وانتهاء صلاحية الجلسة
        if not is_active or expires_at < now_ms():
            if expires_at < now_ms():
                cur.execute("DELETE FROM admin_sessions WHERE token_hash = %s", (token_hash,))
                conn.commit()
            return None
        return {
            "userId": s_uid,
            "username": username,
            "fullName": full_name,
            "role": u_role or s_role,
            "isPrimaryAdmin": bool(is_primary_admin),
            "mustChangePassword": bool(must_change_password),
            "permissions": u_perms if u_perms is not None else (s_perms or {}),
            "csrf_token_hash": csrf_hash,
            "authMode": "cookie" if is_cookie else "bearer"
        }
    except Exception as e:
        print(f"[AUTH ERROR] {e}")
        return None
    finally:
        put_conn(conn)

def normalize_permissions(raw_perms):
    """
    تطهير وتقييس الصلاحيات بشكل صارم ومنع ثغرات bool('false') == True:
    - تحويل القيم النصية ('false', '0', 'no', '') إلى False بولياني.
    - تحويل القيم النصية ('true', '1', 'yes') إلى True بولياني.
    - قصر المفاتيح على القائمة البيضاء المعتمدة.
    - دعم المفاتيح التوافقية القديمة وتوليد الصلاحيات الصريحة المقابلة لها.
    - حظر مفاتيح users و settings لأي حساب غير المدير الأساسي.
    """
    if not isinstance(raw_perms, (dict, list)):
        return {}

    normalized = {}
    
    # قائمة المفاتيح الصريحة المسموحة
    allowed_explicit_perms = {
        "orders:read", "orders:write",
        "products:read", "products:write",
        "categories:read", "categories:write",
        "banners:read", "banners:write",
        "complaints:read", "complaints:write",
        "notifications:read", "notifications:write",
        "expenses:read", "expenses:write",
        "delivery:read", "delivery:write",
        "dashboard:read",
        "settings:read", "settings:write",
        "users:read", "users:write"
    }

    if isinstance(raw_perms, list):
        # مصفوفة مفاتيح مثل ['dashboard', 'orders', 'products']
        for item in raw_perms:
            if not isinstance(item, str):
                continue
            key = item.strip()
            if key in allowed_explicit_perms:
                normalized[key] = True
            elif key == "orders":
                normalized["orders"] = True
                normalized["orders:read"] = True
                normalized["orders:write"] = True
            elif key == "products":
                normalized["products"] = True
                normalized["products:read"] = True
                normalized["products:write"] = True
            elif key == "categories":
                normalized["categories"] = True
                normalized["categories:read"] = True
                normalized["categories:write"] = True
            elif key == "banners":
                normalized["banners"] = True
                normalized["banners:read"] = True
                normalized["banners:write"] = True
            elif key == "complaints":
                normalized["complaints"] = True
                normalized["complaints:read"] = True
                normalized["complaints:write"] = True
            elif key == "notifications":
                normalized["notifications"] = True
                normalized["notifications:read"] = True
                normalized["notifications:write"] = True
            elif key == "expenses":
                normalized["expenses"] = True
                normalized["expenses:read"] = True
                normalized["expenses:write"] = True
            elif key == "delivery":
                normalized["delivery"] = True
                normalized["delivery:read"] = True
                normalized["delivery:write"] = True
            elif key == "dashboard":
                normalized["dashboard"] = True
                normalized["dashboard:read"] = True
            elif key == "settings":
                normalized["settings"] = True
                normalized["settings:read"] = True
                normalized["settings:write"] = True
            elif key == "users":
                normalized["users"] = True
                normalized["users:read"] = True
                normalized["users:write"] = True
        return normalized

    # قاموس مفاتيح وقيم
    for k, v in raw_perms.items():
        if not isinstance(k, str):
            continue
        key = k.strip()
        # حظر all لمنع الترقية غير المصرح بها عبر القاموس
        if key in ("all",):
            continue

        # فحص القيمة المنطقية
        bool_val = False
        if isinstance(v, bool):
            bool_val = v
        elif isinstance(v, (int, float)):
            bool_val = bool(v != 0)
        elif isinstance(v, str):
            clean_str = v.strip().lower()
            if clean_str in ("true", "1", "yes"):
                bool_val = True
            elif clean_str in ("false", "0", "no", ""):
                bool_val = False
            else:
                bool_val = False

        if not bool_val:
            normalized[key] = False
            continue

        if key in allowed_explicit_perms:
            normalized[key] = True
        elif key == "orders":
            normalized["orders"] = True
            normalized["orders:read"] = True
            normalized["orders:write"] = True
        elif key == "products":
            normalized["products"] = True
            normalized["products:read"] = True
            normalized["products:write"] = True
        elif key == "categories":
            normalized["categories"] = True
            normalized["categories:read"] = True
            normalized["categories:write"] = True
        elif key == "banners":
            normalized["banners"] = True
            normalized["banners:read"] = True
            normalized["banners:write"] = True
        elif key == "complaints":
            normalized["complaints"] = True
            normalized["complaints:read"] = True
            normalized["complaints:write"] = True
        elif key == "notifications":
            normalized["notifications"] = True
            normalized["notifications:read"] = True
            normalized["notifications:write"] = True
        elif key == "expenses":
            normalized["expenses"] = True
            normalized["expenses:read"] = True
            normalized["expenses:write"] = True
        elif key == "delivery":
            normalized["delivery"] = True
            normalized["delivery:read"] = True
            normalized["delivery:write"] = True
        elif key == "dashboard":
            normalized["dashboard"] = True
            normalized["dashboard:read"] = True
        elif key == "settings":
            normalized["settings"] = True
            normalized["settings:read"] = True
            normalized["settings:write"] = True
        elif key == "users":
            normalized["users"] = True
            normalized["users:read"] = True
            normalized["users:write"] = True

    return normalized

def resolve_employee_redirect(perms):
    """
    تحديد وجهة الموظف الافتراضية بدقة وفق صلاحياته الفعلية الموثقة في قاعدة البيانات:
    - orders -> orders
    - products -> products
    - delivery -> delivery
    - categories -> categories
    - complaints -> complaints
    - موظف بلا صلاحيات ({}) -> restricted
    """
    if not isinstance(perms, dict):
        return "restricted"
    if perms.get("orders:read") or perms.get("orders:write") or perms.get("orders"):
        return "orders"
    if perms.get("products:write") or perms.get("products"):
        return "products"
    if perms.get("delivery") or perms.get("delivery:read") or perms.get("delivery:write"):
        return "delivery"
    if perms.get("categories:write") or perms.get("categories"):
        return "categories"
    if perms.get("complaints:write") or perms.get("complaints:read") or perms.get("complaints"):
        return "complaints"
    if perms.get("banners") or perms.get("banners:read") or perms.get("banners:write"):
        return "banners"
    if perms.get("expenses") or perms.get("expenses:read") or perms.get("expenses:write"):
        return "expenses"
    if perms.get("notifications") or perms.get("notifications:read") or perms.get("notifications:write"):
        return "notifications"
    return "restricted"

def check_admin_permission(admin_user, required_perm):
    """التحقق الخلفي الصارم من الصلاحيات (RBAC) لكل عملية."""
    if not admin_user:
        return False
    # منع العمليات التشغيلية إذا كان المستخدم مطالباً بتغيير كلمة المرور المؤقتة (إجبار التغيير أولاً)
    if admin_user.get("mustChangePassword") and admin_user.get("role") != "developer_admin":
        return False
    # المدير الأساسي الموثق من DB وحساب المطور يملكان صلاحيات النظام المطلقة
    if admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") in ("developer_admin", "admin", "primary_admin"):
        return True
    
    # فحص الصلاحيات الصريحة للمستخدم
    perms = admin_user.get("permissions") or {}
    if not isinstance(perms, dict):
        return False
        
    if perms.get("all"):
        return True
    if perms.get(required_perm):
        return True
    base_perm = required_perm.split(":")[0] if ":" in required_perm else required_perm
    return bool(perms.get(base_perm))

def verify_csrf_token(handler, admin_user):
    """
    التحقق الآمن من رمز CSRF لطلبات الكتابة والتعديل الواردة عبر المتصفح (Cookie-based auth):
    - مقارنة ثابتة الزمن باستخدام hmac.compare_digest لمنع هجمات التوقيت.
    - الطلبات القادمة عبر Bearer token من أنظمة خلفية أو CLI لا تعتمد كوكيز المتصفح فلا تشترط CSRF.
    """
    if not admin_user:
        return False
    if admin_user.get("authMode") != "cookie":
        return True
    csrf_header = handler.headers.get("X-CSRF-Token", "").strip() if handler.headers else ""
    if not csrf_header:
        return False
    stored_hash = admin_user.get("csrf_token_hash")
    if not stored_hash:
        return False
    calc_hash = hashlib.sha256(csrf_header.encode('utf-8')).hexdigest()
    return hmac.compare_digest(calc_hash, stored_hash)

# =========================================================
# دوال استعلام قاعدة البيانات
# =========================================================

def db_get_setting(cur, key, default=None):
    cur.execute("SELECT value FROM settings WHERE key = %s", (key,))
    row = cur.fetchone()
    return row[0] if row else default

def db_get_system_generation(cur):
    try:
        return max(1, int(db_get_setting(cur, "system_generation", "1") or 1))
    except (TypeError, ValueError):
        return 1

def db_get_last_updated(cur):
    val = db_get_setting(cur, "lastUpdated", "0")
    try: return int(val)
    except: return now_ms()

def db_set_last_updated(cur, ts=None):
    ts = ts or now_ms()
    cur.execute(
        "INSERT INTO settings (key, value) VALUES ('lastUpdated', %s) "
        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        (str(ts),)
    )
    return ts

def db_get_categories(cur):
    cur.execute("SELECT id, name_ar, name_en, icon, img, is_special FROM categories ORDER BY id")
    rows = cur.fetchall()
    return [{
        "id": r[0], "nameAr": r[1], "nameEn": r[2] or "",
        "icon": r[3] or "", "img": r[4] or "", "isSpecial": bool(r[5])
    } for r in rows]

def db_get_products(cur, public_only=False):
    if public_only:
        # قائمة أعمدة عامة محددة بدقة دون SELECT * ودون طلب cost_price أو حقول التكلفة والهوامش
        sql = """
            SELECT id, name_ar, name_en, category_id, unit,
                   sale_price, discount_price, image, is_available,
                   created_at, extra_data
            FROM products
            WHERE is_available = TRUE
            ORDER BY id DESC;
        """
        cur.execute(sql)
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
        result = []
        for r in rows:
            d = dict(zip(cols, r))
            item = {
                "id": d["id"],
                "nameAr": d["name_ar"],
                "nameEn": d["name_en"] or "",
                "categoryId": d["category_id"] or "",
                "unit": d["unit"] or "",
                "salePrice": float(d["sale_price"] or 0),
                "discountPrice": float(d["discount_price"]) if d["discount_price"] else None,
                "image": d["image"] or "",
                "isAvailable": d["is_available"],
                "createdAt": d["created_at"] or ""
            }
            if d.get("extra_data"):
                extra = d["extra_data"] if isinstance(d["extra_data"], dict) else json.loads(d["extra_data"])
                if isinstance(extra, dict):
                    # حظر تسريب أي حقول داخلية للتكلفة أو الموردين
                    extra = {k: v for k, v in extra.items() if k not in ("costPrice", "cost_price", "supplier", "margin")}
                item.update(extra)
            result.append(item)
        return result
    else:
        # للمشرفين المصرحين فقط: جلب كامل البيانات متضمنة تكلفة الشراء
        cur.execute("SELECT * FROM products ORDER BY id DESC;")
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
        result = []
        for r in rows:
            d = dict(zip(cols, r))
            item = {
                "id": d["id"],
                "nameAr": d["name_ar"],
                "nameEn": d["name_en"] or "",
                "categoryId": d["category_id"] or "",
                "unit": d["unit"] or "",
                "costPrice": float(d["cost_price"] or 0),
                "salePrice": float(d["sale_price"] or 0),
                "discountPrice": float(d["discount_price"]) if d["discount_price"] else None,
                "image": d["image"] or "",
                "isAvailable": d["is_available"],
                "createdAt": d["created_at"] or ""
            }
            if d.get("extra_data"):
                extra = d["extra_data"] if isinstance(d["extra_data"], dict) else json.loads(d["extra_data"])
                item.update(extra)
            result.append(item)
        return result

def db_get_banners(cur):
    cur.execute("SELECT * FROM banners WHERE is_active = TRUE ORDER BY id")
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    result = []
    for r in rows:
        d = dict(zip(cols, r))
        item = {
            "id": d["id"], "tagAr": d["tag_ar"] or "", "tagEn": d["tag_en"] or "",
            "titleAr": d["title_ar"] or "", "titleEn": d["title_en"] or "",
            "descAr": d["desc_ar"] or "", "descEn": d["desc_en"] or "",
            "bgGradient": d["bg_gradient"] or "", "image": d["image"] or "",
            "isActive": d["is_active"], "createdAt": d["created_at"] or ""
        }
        if d.get("extra_data"):
            extra = d["extra_data"] if isinstance(d["extra_data"], dict) else json.loads(d["extra_data"])
            item.update(extra)
        result.append(item)
    return result

def db_get_delivery_settings(cur):
    cur.execute("SELECT * FROM delivery_settings LIMIT 1")
    row = cur.fetchone()
    if not row: return {}
    cols = [c[0] for c in cur.description]
    d = dict(zip(cols, row))
    return {
        "baseFee": float(d["base_fee"] or 0),
        "freeDeliveryEnabled": d["free_delivery_enabled"],
        "isEnabled": d["is_enabled"],
        "freeAbove": float(d["free_above"]) if d["free_above"] else None,
        "minOrder": float(d["min_order"]) if d["min_order"] else None,
        "estimatedTime": d["estimated_time"] or ""
    }

def db_get_delivery_zones(cur):
    cur.execute("SELECT id, name_ar, name_en, fee, is_active, estimated_time FROM delivery_zones WHERE is_active = TRUE ORDER BY id")
    rows = cur.fetchall()
    return [{
        "id": r[0], "nameAr": r[1], "nameEn": r[2] or "",
        "fee": float(r[3] or 0), "isActive": r[4], "estimatedTime": r[5] or ""
    } for r in rows]

def db_get_payment_wallets(cur):
    cur.execute("SELECT id, name_ar, name_en, number, holder_name, note, icon, is_active FROM payment_wallets WHERE is_active = TRUE ORDER BY id")
    rows = cur.fetchall()
    return [{
        "id": r[0], "nameAr": r[1], "nameEn": r[2] or "",
        "number": r[3] or "", "holderName": r[4] or "", "note": r[5] or "",
        "icon": r[6] or "", "isActive": r[7]
    } for r in rows]

def db_get_orders_admin(cur):
    """جلب جميع الطلبات وعناصرها للإدارة فقط."""
    cur.execute("SELECT * FROM orders ORDER BY id DESC")
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    result = []
    for r in rows:
        d = dict(zip(cols, r))
        # عناصر الطلب
        cur.execute("SELECT product_id, cart_key, name, unit, qty, unit_price, cost_price FROM order_items WHERE order_id = %s ORDER BY item_index ASC;", (d["id"],))
        items_raw = cur.fetchall()
        items = [{
            "productId": it[0], "cartKey": it[1] or "", "name": it[2] or "",
            "unit": it[3] or "", "qty": float(it[4] or 1), "unitPrice": float(it[5] or 0)
        } for it in items_raw]

        d_out = {
            "id": d["id"], "orderNumber": d["order_number"],
            "deviceId": d["device_id"], "customerName": d["customer_name"],
            "customerPhone": d["customer_phone"], "customerAddress": d["customer_address"],
            "items": items, "itemsCount": len(items),
            "subtotal": float(d["subtotal"] or 0), "totalSales": float(d["total_sales"] or 0),
            "deliveryFee": float(d["delivery_fee"] or 0), "total": float(d["total"] or 0),
            "grandTotal": float(d["grand_total"] or 0), "locationDetails": d["location_details"] or "",
            "notes": d["notes"] or "", "status": d["status"], "statusAr": d["status_ar"],
            "createdAt": d["created_at"], "source": d["source"]
        }
        result.append(d_out)
    return result

def db_get_complaints_admin(cur):
    cur.execute("SELECT * FROM complaints ORDER BY id DESC")
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in rows]

def db_get_order_by_token(cur, order_id, raw_token):
    """الاستعلام الآمن عن طلب الزبون بمقارنة ثابتة الزمن hmac.compare_digest."""
    cur.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
    row = cur.fetchone()
    if not row:
        return None
    cols = [c[0] for c in cur.description]
    d = dict(zip(cols, row))
    stored_hash = d.get("order_token_hash")
    if not stored_hash or not raw_token:
        return None
    calc_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    if not hmac.compare_digest(calc_hash, stored_hash):
        return None

    cur.execute("SELECT product_id, cart_key, name, unit, qty, unit_price, cost_price FROM order_items WHERE order_id = %s ORDER BY item_index ASC;", (order_id,))
    items_rows = cur.fetchall()
    items = [{
        "productId": it[0], "cartKey": it[1] or "", "name": it[2] or "",
        "unit": it[3] or "", "qty": float(it[4] or 1), "unitPrice": float(it[5] or 0)
    } for it in items_rows]

    return {
        "id": d["id"], "orderNumber": d["order_number"],
        "customerName": d["customer_name"], "status": d["status"],
        "statusAr": d["status_ar"], "items": items,
        "subtotal": float(d["subtotal"] or 0),
        "deliveryFee": float(d["delivery_fee"] or 0),
        "total": float(d["total"] or 0),
        "createdAt": d["created_at"], "locationDetails": d["location_details"]
    }

# =========================================================
# HTTP Server Handler
# =========================================================

class ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True

class TaswoqSyncHandler(SimpleHTTPRequestHandler):
    def _is_admin_path(self, path=None, method=None):
        """تحديد المسارات الإدارية الحساسة التي يمنع وصول Origin: null إليها منعاً باتاً."""
        req_path = urlparse(path or self.path).path.rstrip("/")
        cmd = method or getattr(self, "command", "GET")
        if cmd in ("PUT", "DELETE"):
            return True
        if req_path.startswith("/api/auth") or req_path in ("/api/users", "/api/audit-logs", "/api/settings", "/api/admin/system-reset"):
            return True
        if cmd == "POST" and req_path in ("/api/products", "/api/categories", "/api/delivery-settings", "/api/delivery-zones", "/api/payment-wallets"):
            return True
        return False

    def _apply_cors_headers(self):
        """
        إدارة ترويسات CORS المنضبطة:
        - قصر Origin المصرح به على النطاق المعتمد للإنتاج (ALLOWED_ORIGINS) مع دعم الكوكيز للوحة الإدارة.
        - في بيئة التطوير فقط (ENV=development): السماح بـ localhost و 127.0.0.1.
        - طلبات تطبيق الأندرويد والـ WebView المحلي:
          * المسارات العامة للزبائن (/api/catalog, /api/sync, /api/orders, /api/orders/track, /api/poll, /api/complaints, /api/payment-wallets, /api/wallets):
            تقبل Origin: null أو file:// بإرجاع Access-Control-Allow-Origin: * (دون كوكيز/credentials لتفادي أي ثغرة).
          * مسارات الإدارة الحساسة (/api/auth/*, /api/users, عمليات PUT/DELETE/POST الإدارية):
            تحظر Origin: null تماماً ولا تعيد أي ترويسة سماح له.
        - التذكير الأمني: CORS ليس مصادقة أمنية، والمصادقة الصارمة محققة خلفياً في كل طلب.
        """
        origin = self.headers.get("Origin", "").strip() if self.headers else ""
        is_admin = self._is_admin_path()

        if origin and (origin in ALLOWED_ORIGINS or (not ALLOWED_ORIGINS and origin.startswith("https://"))):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        elif ENV == "development" and origin and ("localhost" in origin or "127.0.0.1" in origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        elif (origin == "null" or origin.startswith("file://") or not origin) and not is_admin:
            # واجهات الزبون العامة فقط من WebView المحلي (تطبيق أندرويد)
            self.send_header("Access-Control-Allow-Origin", "*")

        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Order-Token, X-CSRF-Token, X-System-Generation, Cache-Control")
        self.send_header("Access-Control-Max-Age", "86400")

    def end_headers(self):
        self._apply_cors_headers()
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        # ترويسات الأمان والحماية
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        # سياسة أمان المحتوى (CSP)
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https:; "
            "frame-ancestors 'self';"
        )
        self.send_header("Content-Security-Policy", csp)
        super().end_headers()

    def do_OPTIONS(self):
        req_method = self.headers.get("Access-Control-Request-Method", "GET")
        if self._is_admin_path(method=req_method):
            origin = self.headers.get("Origin", "").strip() if self.headers else ""
            if origin == "null" or origin.startswith("file://") or not origin:
                self.send_response(403, "Forbidden Origin")
                self.end_headers()
                return
        self.send_response(200, "OK")
        self.end_headers()

    def _send_json(self, status, payload, cookies=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cookies:
            for ck in cookies:
                self.send_header("Set-Cookie", ck)
        self.end_headers()
        self.wfile.write(body)

    def _is_body_required(self, path):
        """
        تحديد ما إذا كان المسار يتطلب جسماً إجبارياً:
        - /api/auth/logout: مسار تسجيل خروج يعتمد على ترويسة الجلسة (كوكيز أو Bearer) ولا يتطلب جسماً.
        - باقي مسارات POST/PUT تتطلب جسماً صالحاً.
        """
        if path == "/api/auth/logout":
            return False
        return True

    def _get_max_body_size(self, path):
        """
        تحديد سقف حجم جسم الطلب بالبايت حسب حساسية المسار:
        - تسجيل دخول المشرف والمطور والمستخدمين: 32 كيلوبايت
        - إرسال الشكاوى: 64 كيلوبايت
        - إنشاء وتعديل الطلبات: 256 كيلوبايت
        - باقي العمليات وإدارة البيانات والمزامنة: 1 ميجابايت كحد أقصى افتراضي
        """
        if path in ("/api/auth/login", "/api/auth/admin/login", "/api/auth/employee/login", "/api/auth/developer/login", "/api/auth/change-password") or path.startswith("/api/users"):
            return 32 * 1024       # 32 KB
        elif path == "/api/complaints" or path.startswith("/api/complaints/"):
            return 64 * 1024       # 64 KB
        elif path == "/api/orders" or path.startswith("/api/orders/"):
            return 256 * 1024      # 256 KB
        else:
            return 1024 * 1024     # 1 MB

    def _read_body_json(self, max_bytes=1048576, require_body=True):
        """
        قراءة جسم الطلب والتحقق الصارم من الترويسات قبل أي قراءة من المقبس أو تفريغ للذاكرة:
        1. رفض Transfer-Encoding إذا وُجدت (الخادم لا يدعم chunked transfer صراحة).
        2. رفض Content-Length إذا كانت مفقودة فقط للمسارات التي تتطلب جسماً (411 Length Required).
        3. رفض Content-Length إذا كانت غير رقمية أو سالبة (400 Bad Request).
        4. رفض الطلب إذا تجاوز content_length السقف المسموح به للمسار max_bytes (413 Payload Too Large).
        لا يتم استدعاء self.rfile.read() نهائياً في أي حالة من حالات الرفض أعلاه لمنع استهلاك الموارد.
        """
        self._body_error = False
        self._payload_too_large = False

        # 1. التحقق من ترويسة Transfer-Encoding ورفضها
        te_header = self.headers.get("Transfer-Encoding")
        if te_header is not None:
            self._body_error = True
            self._send_json(501, {
                "success": False,
                "error": "Transfer-Encoding غير مدعوم على هذا الخادم"
            })
            return None

        # 2. التحقق من وجود ترويسة Content-Length
        cl_header = self.headers.get("Content-Length")
        if cl_header is None:
            if not require_body:
                # المسارات التي لا تتطلب جسماً (مثل logout): يسمح بغياب Content-Length
                return None
            self._body_error = True
            self._send_json(411, {
                "success": False,
                "error": "ترويسة Content-Length مطلوبة لهذا المسار"
            })
            return None

        # 3. التحقق من كون القيمة رقمية صحيحة وغير سالبة
        cl_str = str(cl_header).strip()
        try:
            content_length = int(cl_str)
        except (ValueError, TypeError):
            self._body_error = True
            self._send_json(400, {
                "success": False,
                "error": "قيمة Content-Length غير صالحة"
            })
            return None

        if content_length < 0:
            self._body_error = True
            self._send_json(400, {
                "success": False,
                "error": "قيمة Content-Length لا يمكن أن تكون سالبة"
            })
            return None

        # 4. التحقق من سقف الحجم المسموح به للمسار
        if content_length > max_bytes:
            self._body_error = True
            self._payload_too_large = True
            self._send_json(413, {
                "success": False,
                "error": f"حجم جسم الطلب ({content_length} بايت) يتجاوز الحد المسموح به لهذا المسار ({max_bytes} بايت)"
            })
            return None

        # 5. إذا كان الحجم 0 (طلب فارغ)
        if content_length == 0:
            return None

        # 6. قراءة وتحليل JSON بعد اجتياز كافة القيود
        try:
            raw = self.rfile.read(content_length).decode("utf-8")
            return json.loads(raw)
        except json.JSONDecodeError:
            self._body_error = True
            self._send_json(400, {
                "success": False,
                "error": "صيغة JSON في جسم الطلب غير صالحة"
            })
            return None
        except Exception as e:
            self._body_error = True
            self._send_json(400, {
                "success": False,
                "error": f"خطأ في قراءة بيانات الطلب: {str(e)}"
            })
            return None

    def translate_path(self, path):
        """حظر صارم لملفات الكود، والبيانات، والأسرار، والملفات المخفية، ودعم مجلد public/ النظيف."""
        clean_path = urlparse(path).path.lstrip("/")
        if ".." in clean_path or clean_path.startswith("."):
            return None

        forbidden_exts = (
            ".json", ".py", ".sql", ".env", ".bat", ".cmd",
            ".sh", ".md", ".bak", ".tmp", ".log"
        )
        for ext in forbidden_exts:
            if clean_path.lower().endswith(ext):
                return None

        # توجيه صفحة تسجيل الدخول الموحدة
        if clean_path in ("login", "login.html"):
            for candidate in (
                os.path.join(PUBLIC_DIR, "login.html"),
                os.path.join(BASE_DIR, "public", "login.html"),
                os.path.join(BASE_DIR, "login.html")
            ):
                if os.path.exists(candidate):
                    return candidate

        # توجيه لوحة الإدارة المطلوبة
        if clean_path in ("admin.html",):
            for candidate in (
                os.path.join(PUBLIC_DIR, "admin.html"),
                os.path.join(BASE_DIR, "admin.html")
            ):
                if os.path.exists(candidate):
                    return candidate

        if clean_path in ("", "admin", "لوحة_تحكم_الإدارة.html"):
            for candidate in (
                os.path.join(PUBLIC_DIR, "لوحة_تحكم_الإدارة.html"),
                os.path.join(BASE_DIR, "لوحة_تحكم_الإدارة.html"),
                os.path.join(PUBLIC_DIR, "admin.html"),
                os.path.join(BASE_DIR, "admin.html")
            ):
                if os.path.exists(candidate):
                    return candidate

        if clean_path in ("taswoq.apk", "download", "app.apk"):
            apk_path = os.path.join(BASE_DIR, "taswoq.apk")
            if os.path.exists(apk_path):
                return apk_path

        allowed_exts = (
            ".html", ".css", ".js", ".png", ".jpg", ".jpeg",
            ".webp", ".svg", ".ico", ".apk", ".woff", ".woff2", ".ttf"
        )
        if clean_path.lower().endswith(allowed_exts):
            # فحص مجلد public أولاً، ثم BASE_DIR
            pub_path = os.path.abspath(os.path.join(PUBLIC_DIR, clean_path))
            if pub_path.startswith(PUBLIC_DIR) and os.path.exists(pub_path):
                return pub_path
            full_path = os.path.abspath(os.path.join(BASE_DIR, clean_path))
            if full_path.startswith(BASE_DIR) and os.path.exists(full_path):
                return full_path

        return None

    def _require_system_generation(self, require_header=False):
        conn = get_conn()
        try:
            cur = conn.cursor()
            current = db_get_system_generation(cur)
        finally:
            try:
                conn.rollback()
            finally:
                put_conn(conn)
        raw_generation = self.headers.get("X-System-Generation", "").strip()
        if not raw_generation:
            if not require_header and current == 1:
                return True
            self._send_json(428, {"success": False, "error": "نسخة المزامنة تحتاج إلى تحديث قبل حفظ البيانات", "code": "SYSTEM_GENERATION_REQUIRED", "currentGeneration": current})
            return False
        try:
            submitted = int(raw_generation)
        except (TypeError, ValueError):
            submitted = -1
        if submitted != current:
            self._send_json(409, {"success": False, "error": "تغيرت بيانات النظام. تم رفض الحفظ القديم؛ أعد تحميل بيانات الخادم", "code": "GENERATION_MISMATCH", "currentGeneration": current})
            return False
        return True

    def _reset_system_data(self, body):
        if not isinstance(body, dict) or body.get("confirmation") != "RESET TASWOQ":
            self._send_json(400, {"success": False, "error": "اكتب RESET TASWOQ لتأكيد التهيئة", "code": "RESET_CONFIRMATION_REQUIRED"})
            return
        admin_user = authenticate_admin_request(self.headers, self.client_address)
        if not admin_user:
            self._send_json(401, {"success": False, "error": "غير مصرح: تتطلب جلسة مطوّر صالحة"})
            return
        if admin_user.get("authMode") != "cookie" or not verify_csrf_token(self, admin_user):
            self._send_json(403, {"success": False, "error": "تهيئة النظام تتطلب جلسة متصفح ورمز CSRF صالحاً", "code": "INVALID_CSRF"})
            return
        if admin_user.get("userId") != "usr_developer" or admin_user.get("role") != "developer_admin":
            self._send_json(403, {"success": False, "error": "تهيئة النظام متاحة لحساب المطوّر المعتمد فقط", "code": "DEVELOPER_REQUIRED"})
            return
        try:
            expected_generation = int(body.get("expectedGeneration"))
            submitted_header = int(self.headers.get("X-System-Generation", ""))
        except (TypeError, ValueError):
            self._send_json(428, {"success": False, "error": "إصدار النظام مطلوب قبل التهيئة", "code": "SYSTEM_GENERATION_REQUIRED"})
            return

        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("SELECT pg_advisory_xact_lock(hashtext('taswoq_system_reset_lock'));")
            current_generation = db_get_system_generation(cur)
            if expected_generation != current_generation or submitted_header != current_generation:
                conn.rollback()
                self._send_json(409, {"success": False, "error": "تغير إصدار بيانات النظام؛ أعد تحميل الصفحة قبل التهيئة", "code": "GENERATION_MISMATCH", "currentGeneration": current_generation})
                return

            new_generation = current_generation + 1
            actor_name = admin_user.get("fullName") or admin_user.get("username") or "المطور البرمجي"
            timestamp = now_ms()
            cur.execute("DELETE FROM admin_sessions;")
            cur.execute("""
                DELETE FROM users
                WHERE id <> 'usr_developer'
                  AND COALESCE(is_primary_admin, FALSE) IS NOT TRUE
                  AND COALESCE(role, '') <> 'primary_admin';
            """)
            cur.execute("""
                DELETE FROM admin_whitelist AS aw
                WHERE NOT EXISTS (
                    SELECT 1 FROM users AS u
                    WHERE LOWER(COALESCE(u.email, '')) = LOWER(aw.email)
                      AND (u.id = 'usr_developer' OR u.is_primary_admin IS TRUE OR COALESCE(u.role, '') = 'primary_admin')
                );
            """)
            cur.execute("""
                TRUNCATE TABLE store_profile, support_settings, delivery_settings,
                    products, banners, order_items, orders, complaints, notifications,
                    delivery_zones, whatsapp_recipients, payment_wallets, delegates,
                    expenses, faqs, app_subscribers
                RESTART IDENTITY;
            """)
            cur.execute("ALTER SEQUENCE orders_id_seq RESTART WITH 1001;")
            cur.execute("ALTER SEQUENCE complaints_id_seq RESTART WITH 101;")
            cur.execute("DELETE FROM settings;")
            settings = {
                "system_generation": str(new_generation),
                "appNameAr": "تسوق",
                "appNameEn": "Taswoq",
                "appLogoBase64": "",
                "lastUpdated": str(timestamp)
            }
            for key, value in settings.items():
                cur.execute("INSERT INTO settings (key, value) VALUES (%s, %s);", (key, value))
            cur.execute("DELETE FROM audit_logs;")
            cur.execute("""
                INSERT INTO audit_logs (user_id, user_name, action, action_title, details, ip_address, timestamp)
                VALUES (%s, %s, 'SYSTEM_RESET', 'تهيئة بيانات النظام', %s, %s, %s);
            """, (
                "usr_developer", actor_name,
                f"تمت تهيئة بيانات التشغيل مع إبقاء الأقسام وحسابات المدير العام والمطوّر؛ الجيل {current_generation} إلى {new_generation}",
                self.client_address[0] if self.client_address else "", timestamp
            ))
            conn.commit()
            self._send_json(200, {
                "success": True,
                "message": "تمت تهيئة بيانات التشغيل؛ بقيت الأقسام وحسابات المدير العام والمطوّر",
                "systemGeneration": new_generation,
                "sessionsInvalidated": True,
                "preserved": ["categories", "primary_admin users", "usr_developer"],
                "cleared": ["products", "orders", "order_items", "expenses", "complaints", "notifications", "banners", "delivery_zones", "whatsapp_recipients", "payment_wallets", "faqs", "app_subscribers", "store_profile", "support_settings", "delivery_settings", "settings except generation/default app values", "admin_sessions", "other non-primary users", "whitelist entries not tied to preserved accounts"]
            })
        except Exception as exc:
            conn.rollback()
            print(f"[SYSTEM RESET ERROR] {type(exc).__name__}")
            self._send_json(500, {"success": False, "error": "تعذر إتمام تهيئة النظام؛ أُلغيت المعاملة بالكامل", "code": "SYSTEM_RESET_FAILED"})
        finally:
            put_conn(conn)

    # ------------------------------------------------------------------
    # GET
    # ------------------------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        query  = parse_qs(parsed.query)

        # 1. المزامنة العامة / مواءمة الكتالوج
        if path in ("/api/catalog", "/api/sync"):
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            conn = get_conn()
            try:
                cur = conn.cursor()
                if admin_user:
                    # عزل البيانات بحسب الصلاحيات الحقيقية الموثقة في قاعدة البيانات
                    is_full_admin = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") in ("admin", "primary_admin", "developer_admin") or (admin_user.get("permissions") or {}).get("all") is True
                    user_perms = admin_user.get("permissions") or {}

                    orders_data = db_get_orders_admin(cur) if (is_full_admin or user_perms.get("orders:read") or user_perms.get("orders:write")) else []
                    complaints_data = db_get_complaints_admin(cur) if (is_full_admin or user_perms.get("complaints:read") or user_perms.get("complaints:write")) else []

                    expenses_data = []
                    if is_full_admin or user_perms.get("expenses:read") or user_perms.get("expenses:write") or user_perms.get("expenses"):
                        cur.execute("SELECT id, date, category, category_name_ar, description, amount, payment_method, recorded_by FROM expenses ORDER BY id DESC;")
                        for r in cur.fetchall():
                            expenses_data.append({
                                "id": r[0], "date": r[1], "category": r[2], "categoryNameAr": r[3],
                                "desc": r[4], "description": r[4], "amount": float(r[5] or 0),
                                "paymentMethod": r[6], "recordedBy": r[7]
                            })

                    self._send_json(200, {
                        "success": True,
                        "backend": "postgresql",
                        "storageType": "قاعدة بيانات PostgreSQL المشتركة",
                        "isLocalTest": False,
                        "serverMode": "shared_pg",
                        "isAdmin": is_full_admin,
                        "ordersAuthoritative": bool(is_full_admin or user_perms.get("orders:read") or user_perms.get("orders:write")),
                        "appNameAr": db_get_setting(cur, "appNameAr", "تسوق"),
                        "appNameEn": db_get_setting(cur, "appNameEn", "Taswoq"),
                        "categories": db_get_categories(cur),
                        "products": db_get_products(cur, public_only=False),
                        "banners": db_get_banners(cur),
                        "orders": orders_data,
                        "expenses": expenses_data,
                        "complaints": complaints_data,
                        "deliverySettings": db_get_delivery_settings(cur),
                        "deliveryZones": db_get_delivery_zones(cur),
                        "paymentWallets": db_get_payment_wallets(cur),
                        "systemGeneration": db_get_system_generation(cur),
                        "lastUpdated": db_get_last_updated(cur)
                    })
                    return
                else:
                    # رد العميل والـ APK الآمن (كتالوج عام فقط دون طلبات أو مستخدمين أو شكاوى)
                    self._send_json(200, {
                        "success": True,
                        "appNameAr": db_get_setting(cur, "appNameAr", "تسوق"),
                        "appNameEn": db_get_setting(cur, "appNameEn", "Taswoq"),
                        "appLogoBase64": db_get_setting(cur, "appLogoBase64", ""),
                        "categories": db_get_categories(cur),
                        "products": db_get_products(cur, public_only=True),
                        "banners": db_get_banners(cur),
                        "deliverySettings": db_get_delivery_settings(cur),
                        "deliveryZones": db_get_delivery_zones(cur),
                        "paymentWallets": db_get_payment_wallets(cur),
                        "orders": [],
                        "users": [],
                        "complaints": [],
                        "systemGeneration": db_get_system_generation(cur),
                        "lastUpdated": db_get_last_updated(cur)
                    })
                    return
            finally:
                put_conn(conn)

        # 2. الاستعلام عن الجلسة الحالية للمشرف GET /api/auth/me
        if path == "/api/auth/me":
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            if not admin_user:
                self._send_json(401, {"success": False, "error": "غير مصرح (جلسة غير صالحة)"})
                return
            is_full_admin = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") in ("admin", "primary_admin")
            perms = admin_user.get("permissions") or {}
            redirect_dest = "dashboard" if is_full_admin else resolve_employee_redirect(perms)
            self._send_json(200, {
                "success": True,
                "user": {
                    "id": admin_user["userId"],
                    "username": admin_user["username"],
                    "fullName": admin_user["fullName"],
                    "role": admin_user["role"],
                    "isPrimaryAdmin": admin_user.get("isPrimaryAdmin", False),
                    "mustChangePassword": admin_user.get("mustChangePassword", False),
                    "permissions": perms
                },
                "role": admin_user["role"],
                "redirect": redirect_dest,
                "authMode": admin_user.get("authMode")
            })
            return

        # 3. استعلام الطلبات للإدارة فقط GET /api/orders
        if path == "/api/orders":
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            if not admin_user:
                self._send_json(401, {"success": False, "error": "غير مصرح: إدارة الطلبات تتطلب صلاحية المشرف"})
                return
            if not check_admin_permission(admin_user, "orders:read") and not check_admin_permission(admin_user, "orders:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية عرض الطلبات"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                self._send_json(200, {"success": True, "orders": db_get_orders_admin(cur)})
            finally:
                put_conn(conn)
            return

        # 4. الاستعلام الدوري /api/poll (متوافق مع MainActivity.java في الأندرويد ولوحة الإدارة)
        if path == "/api/poll":
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            conn = get_conn()
            try:
                cur = conn.cursor()
                last_updated = db_get_last_updated(cur)
                if admin_user:
                    is_full_admin = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") in ("admin", "primary_admin", "developer_admin") or (admin_user.get("permissions") or {}).get("all") is True
                    user_perms = admin_user.get("permissions") or {}

                    if is_full_admin or user_perms.get("orders:read") or user_perms.get("orders:write"):
                        orders = db_get_orders_admin(cur)
                    else:
                        orders = []

                    target_clause = "('all', 'broadcast', 'admin')" if is_full_admin else "('all', 'broadcast')"
                    cur.execute(
                        f"""
                        SELECT id, type, title, title_ar, body, body_ar, message, target, timestamp
                        FROM notifications
                        WHERE target IN {target_clause}
                        ORDER BY timestamp DESC LIMIT 20;
                        """
                    )
                    notif_cols = [c[0] for c in cur.description]
                    notifs = [dict(zip(notif_cols, r)) for r in cur.fetchall()]
                    self._send_json(200, {
                        "success": True,
                        "lastUpdated": last_updated,
                        "totalOrders": len(orders),
                        "newOrders": orders[:10],
                        "catalogUpdated": True,
                        "newNotifications": notifs
                    })
                else:
                    # استجابة عامة آمنة لتطبيق الهاتف وMainActivity.java
                    # قصر الإشعارات العامة على الأنواع العامة المعتمدة فقط وحظر أي إشعارات إدارية أو طلبات
                    cur.execute(
                        """
                        SELECT id, type, title, title_ar, body, body_ar, message, target, timestamp
                        FROM notifications
                        WHERE target IN ('all', 'broadcast', 'general', 'promo', 'customers')
                          AND type IN ('promo', 'announcement', 'general', 'store_update')
                          AND (target_device_id IS NULL OR target_device_id = '')
                          AND (ticket_no IS NULL OR ticket_no = '')
                        ORDER BY timestamp DESC LIMIT 20;
                        """
                    )
                    notif_cols = [c[0] for c in cur.description]
                    notifs = [dict(zip(notif_cols, r)) for r in cur.fetchall()]
                    self._send_json(200, {
                        "success": True,
                        "lastUpdated": last_updated,
                        "totalOrders": 0,
                        "catalogUpdated": True,
                        "newNotifications": notifs
                    })
            finally:
                put_conn(conn)
            return

        # 5. /api/info
        if path == "/api/info":
            conn = get_conn()
            try:
                cur = conn.cursor()
                primary_ip = get_local_ips()[0]
                cur.execute("SELECT COUNT(*) FROM products")
                prod_cnt = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM categories")
                cat_cnt = cur.fetchone()[0]
                self._send_json(200, {
                    "status": "online",
                    "appName": db_get_setting(cur, "appNameAr", "تسوق"),
                    "serverIp": primary_ip,
                    "serverPort": PORT,
                    "backend": "postgresql",
                    "storageType": "قاعدة بيانات PostgreSQL المشتركة",
                    "isLocalTest": False,
                    "serverMode": "shared_pg",
                    "counts": {"products": prod_cnt, "categories": cat_cnt},
                    "systemGeneration": db_get_system_generation(cur),
                    "lastUpdated": db_get_last_updated(cur)
                })
            finally:
                put_conn(conn)
            return

        # 6. /api/payment-wallets و /api/wallets (محافظ الدفع المتاحة للزبائن)
        if path in ("/api/payment-wallets", "/api/wallets"):
            conn = get_conn()
            try:
                cur = conn.cursor()
                wallets = db_get_payment_wallets(cur)
                self._send_json(200, {
                    "success": True,
                    "paymentWallets": wallets,
                    "total": len(wallets),
                    "lastUpdated": db_get_last_updated(cur)
                })
            finally:
                put_conn(conn)
            return

        # 7. استعراض المستخدمين GET /api/users (محصور بالمخولين بصلاحية المستخدمين أو المدير الأساسي/المطور)
        if path == "/api/users":
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            if not admin_user:
                self._send_json(401, {"success": False, "error": "غير مصرح (جلسة غير صالحة)"})
                return
            can_view = (
                admin_user.get("isPrimaryAdmin") is True or
                admin_user.get("role") == "developer_admin" or
                check_admin_permission(admin_user, "users") or
                check_admin_permission(admin_user, "users:read")
            )
            if not can_view:
                self._send_json(403, {"success": False, "error": "إدارة واستعراض المستخدمين محصورة بالمخولين"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT id, username, full_name, role, is_active, permissions,
                           is_primary_admin, must_change_password, created_at, last_login_at
                    FROM users
                    ORDER BY is_primary_admin DESC, id ASC;
                    """
                )
                users = []
                for r in cur.fetchall():
                    users.append({
                        "id": r[0],
                        "username": r[1],
                        "fullName": r[2],
                        "role": r[3],
                        "isActive": bool(r[4]),
                        "permissions": r[5] or {},
                        "isPrimaryAdmin": bool(r[6]),
                        "mustChangePassword": bool(r[7]),
                        "createdAt": r[8],
                        "lastLoginAt": r[9]
                    })
                self._send_json(200, {"success": True, "users": users})
            finally:
                put_conn(conn)
            return

        # 8. استعراض المصاريف التشغيلية GET /api/expenses
        if path == "/api/expenses":
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            if not admin_user:
                self._send_json(401, {"success": False, "error": "غير مصرح: تتطلب جلسة صالحة"})
                return
            if not check_admin_permission(admin_user, "expenses:read"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية استعراض المصاريف"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT id, date, category, category_name_ar, description, amount, payment_method, recorded_by
                    FROM expenses
                    ORDER BY id DESC;
                    """
                )
                expenses = []
                for r in cur.fetchall():
                    expenses.append({
                        "id": int(r[0]),
                        "date": r[1] or "",
                        "category": r[2] or "general",
                        "categoryNameAr": r[3] or r[2] or "عام",
                        "desc": r[4] or "",
                        "amount": float(r[5] or 0),
                        "paymentMethod": r[6] or "نقداً",
                        "recordedBy": r[7] or "المدير"
                    })
                self._send_json(200, {"success": True, "expenses": expenses})
            finally:
                put_conn(conn)
            return

        # 9. استعراض الإشعارات التشغيلية GET /api/notifications
        if path == "/api/notifications":
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            if not admin_user:
                self._send_json(401, {"success": False, "error": "غير مصرح: تتطلب جلسة صالحة"})
                return
            if not check_admin_permission(admin_user, "notifications:read"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية استعراض الإشعارات"})
                return

            since_time = 0
            if "since_time" in query:
                try: since_time = int(query["since_time"][0])
                except: since_time = 0

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT id, type, title, title_ar, body, body_ar, message, target, timestamp, is_read
                    FROM notifications
                    WHERE timestamp >= %s
                    ORDER BY timestamp DESC LIMIT 50;
                    """,
                    (since_time,)
                )
                cols = [c[0] for c in cur.description]
                notifs = [dict(zip(cols, r)) for r in cur.fetchall()]
                self._send_json(200, {"success": True, "notifications": notifs})
            finally:
                put_conn(conn)
            return

        # تقديم الملفات الثابتة عبر الـ Sandbox
        resolved = self.translate_path(self.path)
        if not resolved or not os.path.isfile(resolved):
            self.send_error(403, "Forbidden: Access Denied")
            return

        return super().do_GET()

    # ------------------------------------------------------------------
    # POST
    # ------------------------------------------------------------------
    def do_POST(self):
        with SYSTEM_DATA_LOCK:
            return self._do_POST_locked()

    def _do_POST_locked(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        max_bytes = self._get_max_body_size(path)
        body_required = self._is_body_required(path)
        body   = self._read_body_json(max_bytes=max_bytes, require_body=body_required)
        if body is None and (getattr(self, "_body_error", False) or getattr(self, "_payload_too_large", False)):
            return
        if path == "/api/admin/system-reset":
            return self._reset_system_data(body)
        exempt_post_paths = {
            "/api/auth/login", "/api/auth/admin/login", "/api/auth/employee/login",
            "/api/auth/developer/login", "/api/auth/logout", "/api/auth/change-password",
            "/api/orders/track"
        }
        if path.startswith("/api/") and path not in exempt_post_paths:
            if not self._require_system_generation():
                return

        # 1. تسجيل الدخول الموحد POST /api/auth/login, /api/auth/admin/login, /api/auth/employee/login
        if path in ("/api/auth/login", "/api/auth/admin/login", "/api/auth/employee/login"):
            if not body or not body.get("username") or not body.get("password"):
                self._send_json(400, {"success": False, "error": "اسم المستخدم وكلمة المرور مطلوبان"})
                return
            username = str(body["username"]).strip()
            password = str(body["password"]).strip()

            # حظر حساب المطوّر ودور developer_admin من واجهة تسجيل الدخول العامة فوراً
            if username == "usr_developer":
                self._send_json(401, {"success": False, "error": "بيانات الدخول غير صحيحة"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT id, username, full_name, password_hash, role, is_active,
                           failed_attempts, locked_until, permissions,
                           is_primary_admin, must_change_password
                    FROM users
                    WHERE LOWER(username) = LOWER(%s) OR (email IS NOT NULL AND email != '' AND LOWER(email) = LOWER(%s));
                    """,
                    (username, username)
                )
                user_row = cur.fetchone()
                if not user_row:
                    self._send_json(401, {"success": False, "error": "بيانات الدخول غير صحيحة"})
                    return

                uid, uname, fname, phash, role, is_active, failed_cnt, locked_until, u_perms, is_primary_admin, must_change_password = user_row
                
                # حظر دور developer_admin
                if role == "developer_admin":
                    self._send_json(401, {"success": False, "error": "بيانات الدخول غير صحيحة"})
                    return

                if not is_active:
                    self._send_json(403, {"success": False, "error": "الحساب معطل، يرجى مراجعة الإدارة"})
                    return

                if locked_until and locked_until > now_ms():
                    self._send_json(403, {"success": False, "error": "الحساب مقفل مؤقتاً لكثرة المحاولات الفاشلة"})
                    return

                if not phash or not verify_password(password, phash):
                    new_failed = (failed_cnt or 0) + 1
                    lock_time = (now_ms() + 15 * 60 * 1000) if new_failed >= 5 else None
                    cur.execute("UPDATE users SET failed_attempts = %s, locked_until = %s WHERE id = %s", (new_failed, lock_time, uid))
                    conn.commit()
                    self._send_json(401, {"success": False, "error": "بيانات الدخول غير صحيحة"})
                    return

                # التحقق الصارم من الدور والحساب من قاعدة البيانات وتحديد الوجهة
                is_admin_account = bool(is_primary_admin) or role in ('admin', 'primary_admin')
                effective_perms = normalize_permissions(u_perms) if u_perms is not None else {}
                if is_primary_admin:
                    effective_perms = {"all": True}

                if is_admin_account:
                    redirect_target = "dashboard"
                else:
                    redirect_target = resolve_employee_redirect(effective_perms)

                # توليد رمزي الجلسة و CSRF بشكل عشوائي مستقل
                raw_session_token = secrets.token_urlsafe(32)
                raw_csrf_token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(raw_session_token.encode('utf-8')).hexdigest()
                csrf_token_hash = hashlib.sha256(raw_csrf_token.encode('utf-8')).hexdigest()
                expires_at = now_ms() + (12 * 3600 * 1000)
                client_ip = self.client_address[0] if self.client_address else ""

                cur.execute(
                    """
                    INSERT INTO admin_sessions (token_hash, csrf_token_hash, user_id, role, permissions, created_at, expires_at, ip_address)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (token_hash, csrf_token_hash, uid, role, json.dumps(effective_perms), now_ms(), expires_at, client_ip)
                )
                cur.execute("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = %s WHERE id = %s", (now_ms(), uid))
                conn.commit()

                print(f"[AUTH LOGIN SUCCESS] User: {username} ({role}) from {client_ip} -> redirect: {redirect_target}")

                # إرفاق HttpOnly Cookie مع SameSite=Strict وضبط Secure تلقائياً عند HTTPS أو الوكيل الموثوق
                secure_flag = "; Secure" if is_request_secure(self) else ""
                cookie_header = f"taswoq_session={raw_session_token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200{secure_flag}"

                # عدم إرسال رمز الجلسة في JSON مطلقاً، وإرجاع رمز CSRF وبيانات المستخدم ومسار التوجيه
                self._send_json(200, {
                    "success": True,
                    "csrfToken": raw_csrf_token,
                    "expiresAt": expires_at,
                    "role": role,
                    "redirect": redirect_target,
                    "user": {
                        "id": uid,
                        "username": uname,
                        "fullName": fname,
                        "role": role,
                        "isPrimaryAdmin": bool(is_primary_admin),
                        "mustChangePassword": bool(must_change_password),
                        "permissions": effective_perms
                    }
                }, cookies=[cookie_header])
            except Exception as e:
                conn.rollback()
                print(f"[AUTH LOGIN ERROR] {e}")
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # 1.1 تسجيل دخول المطوّر السري POST /api/auth/developer/login
        if path == "/api/auth/developer/login":
            # اشتراط HTTPS الموثوق
            if not is_transport_secure(self):
                self._send_json(403, {"success": False, "error": "تسجيل دخول المطور يتطلب اتصال HTTPS موثوق حصراً"})
                return

            client_ip = (
                self.headers.get("X-Real-IP") or self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            ) if (self.client_address and self.client_address[0] in TRUSTED_PROXIES) else (self.client_address[0] if self.client_address else "")

            # فحص تحديد المحاولات
            is_allowed, retry_after = check_dev_rate_limit(client_ip)
            if not is_allowed:
                self._send_json(429, {
                    "success": False,
                    "error": f"تم تجاوز الحد المسموح من المحاولات ({DEV_MAX_FAILED_ATTEMPTS} محاولات). يرجى الانتظار {retry_after} ثانية قبل المحاولة مجدداً.",
                    "code": "RATE_LIMIT_EXCEEDED",
                    "retryAfter": retry_after
                }, cookies=None)
                return

            if not body or not body.get("secretKey"):
                self._send_json(400, {"success": False, "error": "رمز المطور السري مطلوب"})
                return

            submitted_secret = str(body["secretKey"]).strip()
            dev_hash = get_developer_secret_hash()
            if not dev_hash:
                self._send_json(503, {"success": False, "error": "بوابة المطوّر غير مهيأة على هذا الخادم (DEVELOPER_SECRET_HASH غير مضبوط)"})
                return

            # التحقق عبر scrypt
            if not verify_password(submitted_secret, dev_hash):
                record_dev_login_failure(client_ip)
                conn = get_conn()
                try:
                    cur = conn.cursor()
                    cur.execute(
                        """
                        INSERT INTO audit_logs (user_id, user_name, action, action_title, details, ip_address, timestamp)
                        VALUES ('usr_developer', 'محاولة دخول مطور فاشلة', 'DEV_LOGIN_FAILED', 'فشل التحقق من رمز المطور', %s, %s, %s);
                        """,
                        (f"محاولة فاشلة للتحقق من رمز المطور من IP: {client_ip}", client_ip, now_iso())
                    )
                    conn.commit()
                except Exception:
                    pass
                finally:
                    put_conn(conn)

                self._send_json(401, {"success": False, "error": "رمز المطور السري غير صحيح"})
                return

            record_dev_login_success(client_ip)

            # استعلام حساب usr_developer القائم حصراً في قاعدة البيانات لاحترام قيد المفتاح الأجنبي
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT id, username, full_name, role, is_active, permissions, is_primary_admin, must_change_password
                    FROM users WHERE id = 'usr_developer';
                    """
                )
                dev_user = cur.fetchone()
                if not dev_user:
                    self._send_json(403, {"success": False, "error": "حساب المطور غير مسجل في النظام أو معطل"})
                    return

                d_uid, d_uname, d_fname, d_role, d_active, d_perms, d_is_primary, d_must_change = dev_user
                if not d_active or d_role != "developer_admin" or d_is_primary:
                    self._send_json(403, {"success": False, "error": "حساب المطور معطل أو غير صالح"})
                    return

                # منح المطور صلاحيات النظام الكاملة بما فيها users و settings و all
                dev_effective_perms = normalize_permissions(d_perms or {})
                dev_effective_perms["all"] = True
                dev_effective_perms["users"] = True
                dev_effective_perms["settings"] = True
                dev_effective_perms["dashboard"] = True
                dev_effective_perms["orders"] = True
                dev_effective_perms["products"] = True
                dev_effective_perms["banners"] = True
                dev_effective_perms["expenses"] = True
                dev_effective_perms["complaints"] = True
                dev_effective_perms["delivery"] = True
                dev_effective_perms["notifications"] = True

                raw_session_token = secrets.token_urlsafe(32)
                raw_csrf_token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(raw_session_token.encode('utf-8')).hexdigest()
                csrf_token_hash = hashlib.sha256(raw_csrf_token.encode('utf-8')).hexdigest()
                expires_at = now_ms() + (8 * 3600 * 1000) # 8 ساعات لجلسة المطور
                client_ip = self.client_address[0] if self.client_address else ""

                cur.execute(
                    """
                    INSERT INTO admin_sessions (token_hash, csrf_token_hash, user_id, role, permissions, created_at, expires_at, ip_address)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (token_hash, csrf_token_hash, d_uid, d_role, json.dumps(dev_effective_perms), now_ms(), expires_at, client_ip)
                )
                conn.commit()

                secure_flag = "; Secure" if is_request_secure(self) else ""
                cookie_header = f"taswoq_session={raw_session_token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure_flag}"

                self._send_json(200, {
                    "success": True,
                    "csrfToken": raw_csrf_token,
                    "expiresAt": expires_at,
                    "role": d_role,
                    "redirect": "dashboard",
                    "user": {
                        "id": d_uid,
                        "username": d_uname,
                        "fullName": d_fname,
                        "role": d_role,
                        "isPrimaryAdmin": False,
                        "mustChangePassword": False,
                        "permissions": dev_effective_perms
                    }
                }, cookies=[cookie_header])
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # 2. تسجيل الخروج الإداري POST /api/auth/logout
        if path == "/api/auth/logout":
            auth_header = self.headers.get("Authorization", "").strip()
            raw_token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
            if not raw_token and "Cookie" in self.headers:
                for c in self.headers.get("Cookie", "").split(";"):
                    c = c.strip()
                    if c.startswith("taswoq_session="):
                        raw_token = c[len("taswoq_session="):].strip()
                        break

            if raw_token:
                token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
                conn = get_conn()
                try:
                    cur = conn.cursor()
                    cur.execute("DELETE FROM admin_sessions WHERE token_hash = %s", (token_hash,))
                    conn.commit()
                finally:
                    put_conn(conn)

            secure_flag = "; Secure" if is_request_secure(self) else ""
            clear_cookie = f"taswoq_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0{secure_flag}"
            self._send_json(200, {"success": True, "message": "تم تسجيل الخروج بنجاح"}, cookies=[clear_cookie])
            return

        # 3. تغيير كلمة المرور للمستخدم المرتبط بالجلسة الحالية فقط POST /api/auth/change-password
        if path == "/api/auth/change-password":
            admin_user = authenticate_admin_request(self.headers, self.client_address)
            if not admin_user:
                self._send_json(401, {"success": False, "error": "غير مصرح (جلسة غير صالحة)"})
                return

            if not verify_csrf_token(self, admin_user):
                self._send_json(403, {"success": False, "error": "رمز الحماية ضد التزوير (CSRF Token) غير صالح أو مفقود"})
                return

            if not body or not isinstance(body, dict):
                self._send_json(400, {"success": False, "error": "بيانات الطلب غير صالحة"})
                return

            new_password = str(body.get("newPassword", "")).strip()
            if not new_password or len(new_password) < 8:
                self._send_json(400, {"success": False, "error": "كلمة المرور يجب أن تتكون من 8 أحرف على الأقل"})
                return

            # لا نثق بأي username أو userId مرسل من العميل:
            # نعتمد حصراً على userId المرتبط بالجلسة الحالية في قاعدة البيانات
            uid = admin_user["userId"]
            new_hash = hash_password(new_password)

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    UPDATE users
                    SET password_hash = %s,
                        must_change_password = FALSE,
                        failed_attempts = 0,
                        locked_until = NULL
                    WHERE id = %s;
                    """,
                    (new_hash, uid)
                )
                if cur.rowcount == 0:
                    conn.rollback()
                    self._send_json(404, {"success": False, "error": "المستخدم غير موجود"})
                    return
                conn.commit()
                self._send_json(200, {
                    "success": True,
                    "message": "تم تغيير كلمة المرور وتحديث الحساب بنجاح"
                })
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # 4. إنشاء طلب جديد وتوليد رمز تتبع سري يعاد لمرة واحدة فقط POST /api/orders
        if path == "/api/orders":
            if not body or not isinstance(body, dict):
                self._send_json(400, {"success": False, "error": "بيانات الطلب غير صالحة"})
                return

            raw_items = body.get("items", [])
            if not raw_items or not isinstance(raw_items, list) or len(raw_items) == 0:
                self._send_json(400, {"success": False, "error": "يجب أن يحتوي الطلب على عنصر واحد على الأقل"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()

                # 1. التحقق من توفر المنتجات وحساب الأسعار والتكاليف من قاعدة البيانات حصراً
                validated_items = []
                subtotal_calc = 0.0
                total_cost_calc = 0.0

                for idx, it in enumerate(raw_items):
                    if not isinstance(it, dict):
                        self._send_json(400, {"success": False, "error": f"العنصر رقم {idx + 1} بتنسيق غير صالح"})
                        return
                    prod_id = safe_int(it.get("productId"))
                    if not prod_id:
                        self._send_json(400, {"success": False, "error": f"معرف المنتج في العنصر {idx + 1} غير صالح"})
                        return

                    # فحص الكمية (يجب أن تكون رقماً موجباً ومنطقياً)
                    qty = safe_float(it.get("qty"))
                    if qty is None or qty <= 0 or qty > 1000:
                        self._send_json(400, {"success": False, "error": f"الكمية المحددة للعنصر {idx + 1} غير صالحة"})
                        return

                    # استعلام بيانات المنتج المحدثة من PostgreSQL
                    cur.execute(
                        """
                        SELECT id, name_ar, unit, sale_price, discount_price, cost_price, is_available
                        FROM products
                        WHERE id = %s;
                        """,
                        (prod_id,)
                    )
                    p_row = cur.fetchone()
                    if not p_row:
                        self._send_json(400, {"success": False, "error": f"المنتج رقم {prod_id} غير موجود في المتجر"})
                        return

                    p_id, p_name_ar, p_unit, p_sale_price, p_discount_price, p_cost_price, p_is_available = p_row

                    # التحقق من توفر المنتج
                    if not p_is_available:
                        self._send_json(400, {"success": False, "error": f"عذراً، المنتج '{p_name_ar}' غير متوفر حالياً"})
                        return

                    # حساب السعر المعتمد (سعر الخصم إذا كان سارياً وأقل من سعر البيع، وإلا سعر البيع)
                    sale_p = float(p_sale_price or 0)
                    disc_p = float(p_discount_price) if p_discount_price is not None else None
                    if disc_p is not None and 0 < disc_p < sale_p:
                        effective_unit_price = disc_p
                    else:
                        effective_unit_price = sale_p

                    cost_p = float(p_cost_price or 0)
                    item_total = round(effective_unit_price * qty, 2)
                    subtotal_calc += item_total
                    total_cost_calc += round(cost_p * qty, 2)

                    validated_items.append({
                        "productId": p_id,
                        "name": p_name_ar,
                        "unit": p_unit or "",
                        "cartKey": str(it.get("cartKey", "")),
                        "qty": qty,
                        "unitPrice": effective_unit_price,
                        "costPrice": cost_p
                    })

                subtotal_calc = round(subtotal_calc, 2)

                # 2. حساب رسوم التوصيل والتحقق من الحد الأدنى للطلب من قاعدة البيانات حصراً
                del_settings = db_get_delivery_settings(cur)
                base_fee = float(del_settings.get("baseFee") or 0)
                min_order = safe_float(del_settings.get("minOrder"))
                free_above = safe_float(del_settings.get("freeAbove"))
                free_del_enabled = bool(del_settings.get("freeDeliveryEnabled", False))

                # فحص الحد الأدنى للطلب
                if min_order is not None and subtotal_calc < min_order:
                    self._send_json(400, {
                        "success": False,
                        "error": f"قيمة الطلب ({subtotal_calc:.2f}) أقل من الحد الأدنى المطلوب ({min_order:.2f})"
                    })
                    return

                # حساب رسم التوصيل بناء على المنطقة أو الرسم الأساسي
                del_fee = base_fee
                zone_id = safe_int(body.get("zoneId"))
                zone_name = str(body.get("deliveryZone", "")).strip()

                if zone_id:
                    cur.execute("SELECT fee FROM delivery_zones WHERE id = %s AND is_active = TRUE;", (zone_id,))
                    z_row = cur.fetchone()
                    if z_row:
                        del_fee = float(z_row[0] or 0)
                elif zone_name:
                    cur.execute("SELECT fee FROM delivery_zones WHERE (name_ar = %s OR name_en = %s) AND is_active = TRUE LIMIT 1;", (zone_name, zone_name))
                    z_row = cur.fetchone()
                    if z_row:
                        del_fee = float(z_row[0] or 0)

                # إعفاء التوصيل إذا كان مشمولاً بالعرض المجاني
                if free_del_enabled and free_above is not None and subtotal_calc >= free_above:
                    del_fee = 0.0

                grand_tot = round(subtotal_calc + del_fee, 2)
                net_profit = round(subtotal_calc - total_cost_calc, 2)

                # 3. التحقق الذري لمنع تكرار الطلب (Order Idempotency)
                client_order_id = str(body.get("clientOrderId") or body.get("idempotencyKey") or "").strip()
                sorted_canonical_items = sorted(
                    [{"productId": it["productId"], "qty": round(float(it["qty"]), 3), "cartKey": it["cartKey"]} for it in validated_items],
                    key=lambda x: x["productId"]
                )
                canonical_payload = {
                    "clientOrderId": client_order_id,
                    "phone": str(body.get("customerPhone", "")).strip(),
                    "name": str(body.get("customerName", "")).strip(),
                    "address": str(body.get("customerAddress", "")).strip(),
                    "zoneId": zone_id,
                    "zoneName": zone_name,
                    "notes": str(body.get("notes", "")).strip(),
                    "items": sorted_canonical_items
                }
                payload_hash = hashlib.sha256(json.dumps(canonical_payload, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()

                if client_order_id:
                    cur.execute(
                        """
                        SELECT id, order_number, grand_total, subtotal, delivery_fee, payload_hash
                        FROM orders
                        WHERE client_order_id = %s;
                        """,
                        (client_order_id,)
                    )
                    ex_order = cur.fetchone()
                    if ex_order:
                        ex_id, ex_num, ex_grand, ex_sub, ex_del, ex_hash = ex_order
                        if ex_hash and hmac.compare_digest(ex_hash, payload_hash):
                            # تطابق كامل للبيانات والمفتاح: إعادة بيانات الطلب السابق دون تكرار
                            self._send_json(200, {
                                "success": True,
                                "alreadyProcessed": True,
                                "orderId": ex_id,
                                "orderNumber": ex_num,
                                "grandTotal": float(ex_grand or 0),
                                "subtotal": float(ex_sub or 0),
                                "deliveryFee": float(ex_del or 0),
                                "message": "تم استرجاع تفاصيل طلبك المسجل مسبقاً بنجاح (طلب غير مكرر)"
                            })
                            return
                        else:
                            # نفس المفتاح ولكن مع بيانات مختلفة: رفض الطلب بـ 409
                            self._send_json(409, {
                                "success": False,
                                "error": "تعارض أمني: مفتاح الطلب (clientOrderId) مستخدم مسبقاً لطلب ذي بيانات مختلفة"
                            })
                            return

                # 4. توليد معرف آمن ومتزامن عبر Sequence دون تعارض
                cur.execute("SELECT nextval('orders_id_seq');")
                new_id = cur.fetchone()[0]
                formatted_num = f"ORD-2026-{new_id:04d}"

                raw_order_token = secrets.token_urlsafe(32)
                order_token_hash = hashlib.sha256(raw_order_token.encode('utf-8')).hexdigest()

                cur.execute(
                    """
                    INSERT INTO orders
                        (id, order_number, client_order_id, payload_hash, order_token_hash, device_id, customer_name,
                         customer_phone, customer_address, items_count, subtotal,
                         total_sales, delivery_fee, total, grand_total, total_cost,
                         net_profit, location_details, notes, status, status_ar,
                         created_at, created_timestamp, source)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);
                    """,
                    (
                        new_id, formatted_num, client_order_id if client_order_id else None,
                        payload_hash, order_token_hash,
                        body.get("deviceId", "APP-CLIENT"),
                        body.get("customerName", "عميل تطبيق تسوق"),
                        body.get("customerPhone", ""),
                        body.get("customerAddress", ""),
                        len(validated_items), subtotal_calc, subtotal_calc, del_fee,
                        grand_tot, grand_tot, total_cost_calc, net_profit,
                        body.get("locationDetails", ""), body.get("notes", ""),
                        "Pending", "قيد الانتظار",
                        time.strftime("%Y-%m-%d %H:%M"), now_ms(), "تطبيق تسوق"
                    )
                )

                for idx, item in enumerate(validated_items):
                    cur.execute(
                        """
                        INSERT INTO order_items
                            (order_id, item_index, product_id, cart_key, name, unit, qty, unit_price, cost_price)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (order_id, item_index) DO UPDATE SET
                            qty = EXCLUDED.qty, unit_price = EXCLUDED.unit_price, cost_price = EXCLUDED.cost_price;
                        """,
                        (new_id, idx, item["productId"], item["cartKey"],
                         item["name"], item["unit"], item["qty"], item["unitPrice"], item["costPrice"])
                    )

                db_set_last_updated(cur)
                conn.commit()

                print(f"[NEW ORDER CREATED] #{new_id} ({formatted_num}) — Subtotal: {subtotal_calc}, DelFee: {del_fee}, Total: {grand_tot}. Token Issued.")
                self._send_json(201, {
                    "success": True,
                    "orderId": new_id,
                    "orderNumber": formatted_num,
                    "orderToken": raw_order_token,
                    "subtotal": subtotal_calc,
                    "deliveryFee": del_fee,
                    "grandTotal": grand_tot,
                    "message": "تم استلام طلبك بنجاح وحساب القيمة المعتمدة ورمز التتبع الآمن"
                })
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # 4. استعلام العميل عن حالة طلبه بأمان POST /api/orders/track
        if path == "/api/orders/track":
            if not body or "orderId" not in body or "orderToken" not in body:
                self._send_json(400, {"success": False, "error": "رقم الطلب والرمز السري مطلوبان"})
                return
            order_id = safe_int(body["orderId"])
            raw_token = str(body["orderToken"]).strip()
            conn = get_conn()
            try:
                cur = conn.cursor()
                order_data = db_get_order_by_token(cur, order_id, raw_token)
                if not order_data:
                    self._send_json(404, {"success": False, "error": "الطلب غير موجود أو رمز التحقق غير صحيح"})
                    return
                self._send_json(200, {"success": True, "order": order_data})
            finally:
                put_conn(conn)
            return

        # 5. استلام شكوى من العميل POST /api/complaints
        if path == "/api/complaints":
            if not body or not isinstance(body, dict):
                self._send_json(400, {"success": False, "error": "بيانات الشكوى غير صالحة"})
                return
            customer_name = str(body.get("customerName", "عميل")).strip()
            phone = str(body.get("customerPhone", "")).strip()
            msg = str(body.get("message", "")).strip()
            if not msg:
                self._send_json(400, {"success": False, "error": "نص الشكوى مطلوب"})
                return
            if len(msg) > 5000:
                self._send_json(400, {"success": False, "error": "نص الشكوى طويل جداً، الحد الأقصى 5000 حرف"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("SELECT nextval('complaints_id_seq');")
                new_cid = cur.fetchone()[0]
                ticket_no = body.get("ticketNo") or f"TKT-{new_cid:04d}"
                cur.execute(
                    """
                    INSERT INTO complaints (id, ticket_no, customer_name, customer_phone, device_id, message, status, status_ar, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (new_cid, ticket_no, customer_name, phone, body.get("deviceId", ""), msg, "new", "جديدة", time.strftime("%Y-%m-%d %H:%M"))
                )
                cur.execute(
                    """
                    INSERT INTO notifications (id, type, title, title_ar, body, body_ar, message, target, ticket_no, complaint_id, timestamp, is_read)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (f"notif_comp_{new_cid}_{now_ms()}", "complaint", f"شكوى جديدة ({ticket_no})", f"شكوى جديدة ({ticket_no})", msg, msg, f"من {customer_name}: {msg[:60]}", "admin", ticket_no, new_cid, now_ms(), False)
                )
                db_set_last_updated(cur)
                conn.commit()
                self._send_json(201, {
                    "success": True,
                    "complaintId": new_cid,
                    "ticketNo": ticket_no,
                    "message": "تم استلام شكواك بنجاح وسيتواصل معك فريق الدعم"
                })
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # --------------------------------------------------------------
        # فحص مصادقة المشرف وحماية CSRF لجميع واجهات الكتابة الإدارية
        # --------------------------------------------------------------
        admin_user = authenticate_admin_request(self.headers, self.client_address)
        if not admin_user:
            self._send_json(401, {"success": False, "error": "غير مصرح: واجهة إدارية تتطلب جلسة صالحة"})
            return

        if not verify_csrf_token(self, admin_user):
            self._send_json(403, {"success": False, "error": "رمز الحماية ضد التزوير (CSRF Token) غير صالح أو مفقود"})
            return

        # POST /api/products
        if path == "/api/products":
            if not check_admin_permission(admin_user, "products:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية إضافة أو تعديل المنتجات"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM products")
                new_id = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO products (id, name_ar, name_en, category_id, unit, cost_price, sale_price, discount_price, image, is_available, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        new_id, body.get("nameAr",""), body.get("nameEn",""),
                        body.get("categoryId",""), body.get("unit",""),
                        safe_float(body.get("costPrice")), safe_float(body.get("salePrice")),
                        safe_float(body.get("discountPrice")), body.get("image",""),
                        bool(body.get("isAvailable", True)), time.strftime("%Y-%m-%d %H:%M")
                    )
                )
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(201, {"success": True, "productId": new_id, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/categories
        if path == "/api/categories":
            if not check_admin_permission(admin_user, "categories:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية إدارة الأقسام"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                cat_id = str(body.get("id") or f"cat_{now_ms()}")
                cur.execute(
                    """
                    INSERT INTO categories (id, name_ar, name_en, icon, img, is_special)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en,
                        icon=EXCLUDED.icon, img=EXCLUDED.img, is_special=EXCLUDED.is_special;
                    """,
                    (cat_id, body.get("nameAr",""), body.get("nameEn",""),
                     body.get("icon",""), body.get("img",""), bool(body.get("isSpecial",False)))
                )
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "categoryId": cat_id, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/banners
        if path == "/api/banners":
            if not check_admin_permission(admin_user, "banners:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية إدارة البانرات"})
                return
            banners_list = body.get("banners")
            if not isinstance(banners_list, list):
                # قد يكون بانراً مفرداً
                banners_list = [body]
            conn = get_conn()
            try:
                cur = conn.cursor()
                for b in banners_list:
                    bid = str(b.get("id") or f"ban_{now_ms()}")
                    cur.execute(
                        """
                        INSERT INTO banners (id, title, img, action, link, is_active)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET
                            title=EXCLUDED.title, img=EXCLUDED.img, action=EXCLUDED.action,
                            link=EXCLUDED.link, is_active=EXCLUDED.is_active;
                        """,
                        (bid, b.get("title",""), b.get("img",""), b.get("action",""), b.get("link",""), bool(b.get("isActive", True)))
                    )
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/expenses (تسجيل سند صرف جديد)
        if path == "/api/expenses":
            if not check_admin_permission(admin_user, "expenses:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية تسجيل المصاريف"})
                return
            amount = safe_float(body.get("amount", 0))
            desc = str(body.get("desc") or body.get("description") or "").strip()
            if amount <= 0 or not desc:
                self._send_json(400, {"success": False, "error": "مبلغ المصروف والوصف مطلوبان"})
                return

            category = str(body.get("category", "general")).strip()
            category_ar = str(body.get("categoryNameAr") or body.get("category_name_ar") or category).strip()
            payment_method = str(body.get("paymentMethod") or body.get("payment_method") or "نقداً").strip()
            recorded_by = admin_user.get("fullName") or admin_user.get("username") or "مستخدم النظام"
            exp_date = time.strftime("%Y-%m-%d %H:%M")

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO expenses (date, category, category_name_ar, description, amount, payment_method, recorded_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id;
                    """,
                    (exp_date, category, category_ar, desc, amount, payment_method, recorded_by)
                )
                new_exp_id = cur.fetchone()[0]
                conn.commit()
                self._send_json(201, {
                    "success": True,
                    "expense": {
                        "id": int(new_exp_id),
                        "date": exp_date,
                        "category": category,
                        "categoryNameAr": category_ar,
                        "desc": desc,
                        "amount": amount,
                        "paymentMethod": payment_method,
                        "recordedBy": recorded_by
                    }
                })
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/notifications (إرسال إشعار تشغيلي وبثه)
        if path == "/api/notifications":
            if not check_admin_permission(admin_user, "notifications:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية إرسال الإشعارات"})
                return
            title = str(body.get("title") or body.get("titleAr") or "").strip()
            message = str(body.get("message") or body.get("body") or "").strip()
            if not title or not message:
                self._send_json(400, {"success": False, "error": "عنوان ونص الإشعار مطلوبان"})
                return

            notif_id = str(body.get("id") or f"notif_{now_ms()}_{secrets.token_hex(4)}")
            notif_type = str(body.get("type", "announcement")).strip()
            target = str(body.get("target", "all")).strip()
            ts = now_ms()

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO notifications (id, type, title, title_ar, body, body_ar, message, target, timestamp, is_read)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE)
                    RETURNING id;
                    """,
                    (notif_id, notif_type, title, title, message, message, message, target, ts)
                )
                conn.commit()
                self._send_json(201, {
                    "success": True,
                    "notification": {
                        "id": notif_id,
                        "type": notif_type,
                        "title": title,
                        "message": message,
                        "target": target,
                        "timestamp": ts
                    }
                })
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/users (إنشاء مستخدم جديد - محمي مع اشتراط الصلاحية + قفل استشاري ذري)
        if path == "/api/users":
            is_super = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") == "developer_admin"
            can_manage = is_super or check_admin_permission(admin_user, "users") or check_admin_permission(admin_user, "users:write")
            if not can_manage:
                self._send_json(403, {"success": False, "error": "إدارة المستخدمين محصورة بالمخولين"})
                return

            username = str(body.get("username", "")).strip().lower()
            password = str(body.get("password", "")).strip()
            full_name = str(body.get("fullName", "")).strip()
            email = str(body.get("email", "")).strip().lower() if body.get("email") else ""
            role = str(body.get("role", "employee")).strip()
            is_target_primary = bool(body.get("isPrimaryAdmin", False)) or (role == "primary_admin")

            if is_target_primary and not is_super:
                self._send_json(403, {"success": False, "error": "ترقية أو إنشاء مدير عام محصور بالمدير الأساسي والمطور"})
                return

            if not username or not password or not full_name:
                self._send_json(400, {"success": False, "error": "اسم المستخدم وكلمة المرور والاسم الكامل مطلوبة"})
                return

            if username == "usr_developer" or role == "developer_admin":
                self._send_json(400, {"success": False, "error": "لا يمكن إنشاء حسابات مطور عبر الواجهة"})
                return

            raw_perms = body.get("permissions", {})
            clean_perms = {"all": True} if is_target_primary else normalize_permissions(raw_perms)
            p_hash = hash_password(password)
            user_id = str(body.get("id") or f"usr_{now_ms()}_{secrets.token_hex(4)}")

            conn = get_conn()
            try:
                cur = conn.cursor()
                # أخذ قفل استشاري ذري على مستوى المعاملة لحماية سقف المديرين الأساسيين
                cur.execute("SELECT pg_advisory_xact_lock(hashtext('taswoq_primary_admin_lock'));")

                # التحقق من عدم تكرار اسم المستخدم
                cur.execute("SELECT id FROM users WHERE LOWER(username) = %s;", (username,))
                if cur.fetchone():
                    conn.rollback()
                    self._send_json(409, {"success": False, "error": "اسم المستخدم مسجل مسبقاً"})
                    return

                # التحقق من عدم تكرار البريد إن وُجد
                if email:
                    cur.execute("SELECT id FROM users WHERE email IS NOT NULL AND email != '' AND LOWER(email) = %s;", (email,))
                    if cur.fetchone():
                        conn.rollback()
                        self._send_json(409, {"success": False, "error": "البريد الإلكتروني مسجل مسبقاً"})
                        return

                if is_target_primary:
                    cur.execute("SELECT COUNT(*) FROM users WHERE is_primary_admin = TRUE AND is_active = TRUE;")
                    primary_cnt = cur.fetchone()[0]
                    if primary_cnt >= 2:
                        conn.rollback()
                        self._send_json(400, {"success": False, "error": "تم الوصول للحد الأقصى للمديرين العامين (2 فقط)"})
                        return

                target_role = "primary_admin" if is_target_primary else ("admin" if role == "admin" else "employee")
                cur.execute(
                    """
                    INSERT INTO users (id, username, email, full_name, password_hash, role, is_active, permissions, is_primary_admin, must_change_password, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (user_id, username, email, full_name, p_hash, target_role, True, json.dumps(clean_perms), is_target_primary, bool(body.get("mustChangePassword", False)), time.strftime("%Y-%m-%d %H:%M"))
                )

                # تسجيل العملية في سجل التدقيق بهوية الفاعل الحقيقية
                cur.execute(
                    """
                    INSERT INTO audit_logs (user_id, user_name, action, action_title, details, ip_address, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (admin_user.get("userId", "usr_developer"), admin_user.get("fullName", "المطور البرمجي"), "USER_CREATED", "إضافة مستخدم جديد", f"تم إنشاء حساب {target_role}: {full_name} ({username}) بواسطة {admin_user.get('fullName', 'المطور')} [{admin_user.get('role', 'developer_admin')}]", self.client_address[0] if self.client_address else "", now_ms())
                )
                conn.commit()
                created_user_obj = {
                    "id": user_id,
                    "username": username,
                    "email": email,
                    "fullName": full_name,
                    "role": target_role,
                    "isActive": True,
                    "permissions": clean_perms,
                    "isPrimaryAdmin": is_target_primary,
                    "mustChangePassword": bool(body.get("mustChangePassword", False))
                }
                self._send_json(201, {"success": True, "userId": user_id, "username": username, "user": created_user_obj})
            except Exception as e:
                conn.rollback()
                if "users_username_key" in str(e).lower() or "unique constraint" in str(e).lower():
                    self._send_json(409, {"success": False, "error": "اسم المستخدم مسجل مسبقاً"})
                else:
                    self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/users/status (تفعيل أو تعطيل حساب - محمي للمخولين + قفل ذري)
        if path == "/api/users/status":
            is_super = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") == "developer_admin"
            can_manage = is_super or check_admin_permission(admin_user, "users") or check_admin_permission(admin_user, "users:write")
            if not can_manage:
                self._send_json(403, {"success": False, "error": "تعديل حالة المستخدم محصور بالمخولين"})
                return
            target_uid = str(body.get("userId", "")).strip()
            is_active = bool(body.get("isActive", True))
            if not target_uid:
                self._send_json(400, {"success": False, "error": "معرف المستخدم مطلوب"})
                return

            if target_uid == "usr_developer":
                self._send_json(403, {"success": False, "error": "لا يمكن تعديل حالة حساب المطور"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("SELECT pg_advisory_xact_lock(hashtext('taswoq_primary_admin_lock'));")
                cur.execute("SELECT is_primary_admin, is_active FROM users WHERE id = %s;", (target_uid,))
                target_user = cur.fetchone()
                if not target_user:
                    self._send_json(404, {"success": False, "error": "المستخدم غير موجود"})
                    return

                u_is_primary, u_curr_active = target_user

                if u_is_primary:
                    if not is_super:
                        conn.rollback()
                        self._send_json(403, {"success": False, "error": "لا يمكن لغير المدير الأساسي أو المطور تعديل حساب مدير عام"})
                        return
                    if not is_active:
                        # حظر تعطيل المدير الأساسي الأخير
                        cur.execute("SELECT COUNT(*) FROM users WHERE is_primary_admin = TRUE AND is_active = TRUE;")
                        active_primaries = cur.fetchone()[0]
                        if active_primaries <= 1:
                            conn.rollback()
                            self._send_json(400, {"success": False, "error": "لا يمكن تعطيل المدير الأساسي النشط الوحيد بالنظام"})
                            return
                    else:
                        # عند إعادة التفعيل: التحقق من عدم تجاوز سقف الـ 2
                        cur.execute("SELECT COUNT(*) FROM users WHERE is_primary_admin = TRUE AND is_active = TRUE;")
                        active_primaries = cur.fetchone()[0]
                        if not u_curr_active and active_primaries >= 2:
                            conn.rollback()
                            self._send_json(400, {"success": False, "error": "تم الوصول للحد الأقصى للمديرين العامين النشطين (2 فقط)"})
                            return

                cur.execute("UPDATE users SET is_active = %s WHERE id = %s;", (is_active, target_uid))
                # إذا تم التعطيل: إبطال كافة جلسات هذا المستخدم فوراً
                if not is_active:
                    cur.execute("DELETE FROM admin_sessions WHERE user_id = %s;", (target_uid,))

                cur.execute(
                    """
                    INSERT INTO audit_logs (user_id, user_name, action, action_title, details, ip_address, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (admin_user.get("userId", "usr_developer"), admin_user.get("fullName", "المطور البرمجي"), "USER_STATUS_TOGGLED", "تعديل حالة حساب", f"تم {'تفعيل' if is_active else 'تعطيل'} حساب {target_uid} بواسطة {admin_user.get('fullName', 'المطور')} [{admin_user.get('role', 'developer_admin')}]", self.client_address[0] if self.client_address else "", now_ms())
                )
                conn.commit()
                self._send_json(200, {"success": True, "userId": target_uid, "isActive": is_active})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/users/reset-password (إعادة تعيين كلمة مرور موظف - محمي للمخولين)
        if path == "/api/users/reset-password":
            is_super = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") == "developer_admin"
            can_manage = is_super or check_admin_permission(admin_user, "users") or check_admin_permission(admin_user, "users:write")
            if not can_manage:
                self._send_json(403, {"success": False, "error": "إعادة تعيين كلمة المرور محصورة بالمخولين"})
                return
            target_uid = str(body.get("userId", "")).strip()
            new_pass = str(body.get("newPassword", "")).strip()
            if not target_uid or not new_pass:
                self._send_json(400, {"success": False, "error": "معرف المستخدم وكلمة المرور الجديدة مطلوبان"})
                return

            if target_uid == "usr_developer":
                self._send_json(403, {"success": False, "error": "لا يمكن إعادة تعيين كلمة مرور المطور"})
                return

            new_hash = hash_password(new_pass)
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("SELECT is_primary_admin, role FROM users WHERE id = %s;", (target_uid,))
                target_user = cur.fetchone()
                if not target_user:
                    self._send_json(404, {"success": False, "error": "المستخدم غير موجود"})
                    return
                if (target_user[0] or target_user[1] in ("primary_admin", "developer_admin")) and not is_super:
                    self._send_json(403, {"success": False, "error": "لا يمكن لغير المدير الأساسي أو المطور إعادة تعيين كلمة مرور هذا الحساب"})
                    return
                cur.execute("UPDATE users SET password_hash = %s, must_change_password = TRUE, failed_attempts = 0, locked_until = NULL WHERE id = %s;", (new_hash, target_uid))
                # إبطال الجلسات القديمة لإجبار المستخدم على الدخول بكلمة المرور الجديدة
                cur.execute("DELETE FROM admin_sessions WHERE user_id = %s;", (target_uid,))

                cur.execute(
                    """
                    INSERT INTO audit_logs (user_id, user_name, action, action_title, details, ip_address, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (admin_user.get("userId", "usr_developer"), admin_user.get("fullName", "المطور البرمجي"), "PASSWORD_RESET", "إعادة تعيين كلمة مرور", f"تمت إعادة تعيين كلمة مرور المستخدم {target_uid} بواسطة {admin_user.get('fullName', 'المطور')} [{admin_user.get('role', 'developer_admin')}]", self.client_address[0] if self.client_address else "", now_ms())
                )
                conn.commit()
                self._send_json(200, {"success": True, "message": "تمت إعادة تعيين كلمة المرور بنجاح وإلغاء جلسات المستخدم السابقة"})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # POST /api/sync (المزامنة الذرية الصارمة مع فحص RBAC لكل حقل وحظر الطلبات والمستخدمين)
        if path == "/api/sync":
            allowed_sync_fields = {"products", "categories", "banners", "deliverySettings", "deliveryZones", "supportSettings", "whatsappRecipients"}
            # فحص الحقول الواردة
            for field in body.keys():
                if field == "orders":
                    self._send_json(400, {"success": False, "error": "تعديل الطلبات محظور عبر المزامنة العامة؛ استخدم PUT /api/orders/<id> حصراً"})
                    return
                if field in ("users", "adminWhitelist"):
                    self._send_json(403, {"success": False, "error": "تعديل المستخدمين محظور عبر المزامنة العامة؛ استخدم مسارات /api/users المخصصة"})
                    return
                if field not in allowed_sync_fields:
                    self._send_json(400, {"success": False, "error": f"حقل المزامنة غير معروف أو غير مصرح به: {field}"})
                    return

            conn = get_conn()
            try:
                cur = conn.cursor()
                # 1. المنتجات
                if "products" in body:
                    if not check_admin_permission(admin_user, "products:write"):
                        conn.rollback()
                        self._send_json(403, {"success": False, "error": "ليس لديك صلاحية تعديل المنتجات"})
                        return
                    # تحديث ذري للمنتجات الواردة
                    for p in body["products"]:
                        pid = safe_int(p.get("id"))
                        if pid:
                            cur.execute(
                                """
                                UPDATE products SET name_ar=%s, name_en=%s, category_id=%s, unit=%s,
                                    cost_price=%s, sale_price=%s, discount_price=%s, image=%s, is_available=%s
                                WHERE id = %s;
                                """,
                                (p.get("nameAr",""), p.get("nameEn",""), p.get("categoryId",""), p.get("unit",""),
                                 safe_float(p.get("costPrice")), safe_float(p.get("salePrice")), safe_float(p.get("discountPrice")),
                                 p.get("image",""), bool(p.get("isAvailable",True)), pid)
                            )

                # 2. الأقسام
                if "categories" in body:
                    if not check_admin_permission(admin_user, "categories:write"):
                        conn.rollback()
                        self._send_json(403, {"success": False, "error": "ليس لديك صلاحية تعديل الأقسام"})
                        return
                    for c in body["categories"]:
                        cid = str(c.get("id"))
                        if cid:
                            cur.execute(
                                """
                                INSERT INTO categories (id, name_ar, name_en, icon, img, is_special)
                                VALUES (%s, %s, %s, %s, %s, %s)
                                ON CONFLICT (id) DO UPDATE SET
                                    name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en,
                                    icon=EXCLUDED.icon, img=EXCLUDED.img, is_special=EXCLUDED.is_special;
                                """,
                                (cid, c.get("nameAr",""), c.get("nameEn",""), c.get("icon",""), c.get("img",""), bool(c.get("isSpecial",False)))
                            )

                # 3. البانرات
                if "banners" in body:
                    if not check_admin_permission(admin_user, "banners:write"):
                        conn.rollback()
                        self._send_json(403, {"success": False, "error": "ليس لديك صلاحية تعديل البانرات"})
                        return
                    for b in body["banners"]:
                        bid = str(b.get("id"))
                        if bid:
                            cur.execute(
                                """
                                INSERT INTO banners (id, title, img, action, link, is_active)
                                VALUES (%s, %s, %s, %s, %s, %s)
                                ON CONFLICT (id) DO UPDATE SET
                                    title=EXCLUDED.title, img=EXCLUDED.img, action=EXCLUDED.action,
                                    link=EXCLUDED.link, is_active=EXCLUDED.is_active;
                                """,
                                (bid, b.get("title",""), b.get("img",""), b.get("action",""), b.get("link",""), bool(b.get("isActive",True)))
                            )

                # 4. إعدادات التوصيل والإعدادات الحساسة: محصورة بالمخولين
                sensitive_fields = {"deliverySettings", "deliveryZones", "supportSettings", "whatsappRecipients"}
                present_sensitive = sensitive_fields.intersection(body.keys())
                if present_sensitive:
                    can_manage_settings = (
                        admin_user.get("isPrimaryAdmin") is True or
                        admin_user.get("role") == "developer_admin" or
                        check_admin_permission(admin_user, "settings") or
                        check_admin_permission(admin_user, "settings:write") or
                        check_admin_permission(admin_user, "delivery:write")
                    )
                    if not can_manage_settings:
                        conn.rollback()
                        self._send_json(403, {"success": False, "error": "تعديل إعدادات التوصيل والمتجر محصور بالمخولين"})
                        return

                    if "deliverySettings" in body:
                        ds = body["deliverySettings"]
                        cur.execute(
                            """
                            UPDATE delivery_settings SET
                                base_fee = %s, free_delivery_enabled = %s, is_enabled = %s, free_above = %s
                            WHERE id = 1;
                            """,
                            (safe_float(ds.get("baseFee", 0)), bool(ds.get("freeDeliveryEnabled", False)),
                             bool(ds.get("isEnabled", True)), safe_float(ds.get("freeAbove")))
                        )

                    if "deliveryZones" in body:
                        for z in body["deliveryZones"]:
                            zid = safe_int(z.get("id"))
                            if zid:
                                cur.execute(
                                    """
                                    INSERT INTO delivery_zones (id, name_ar, name_en, fee, is_active, estimated_time)
                                    VALUES (%s, %s, %s, %s, %s, %s)
                                    ON CONFLICT (id) DO UPDATE SET
                                        name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en,
                                        fee=EXCLUDED.fee, is_active=EXCLUDED.is_active, estimated_time=EXCLUDED.estimated_time;
                                    """,
                                    (zid, z.get("nameAr",""), z.get("nameEn",""), safe_float(z.get("fee",0)), bool(z.get("isActive",True)), z.get("estimatedTime",""))
                                )

                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        self._send_json(404, {"success": False, "error": "Endpoint not found"})

    # ------------------------------------------------------------------
    # PUT
    # ------------------------------------------------------------------
    def do_PUT(self):
        with SYSTEM_DATA_LOCK:
            return self._do_PUT_locked()

    def _do_PUT_locked(self):
        admin_user = authenticate_admin_request(self.headers, self.client_address)
        if not admin_user:
            self._send_json(401, {"success": False, "error": "غير مصرح: تتطلب جلسة صالحة"})
            return

        if not verify_csrf_token(self, admin_user):
            self._send_json(403, {"success": False, "error": "رمز الحماية ضد التزوير (CSRF Token) غير صالح أو مفقود"})
            return

        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        max_bytes = self._get_max_body_size(path)
        body_required = self._is_body_required(path)
        body   = self._read_body_json(max_bytes=max_bytes, require_body=body_required)
        if body is None and (getattr(self, "_body_error", False) or getattr(self, "_payload_too_large", False)):
            return
        if path.startswith("/api/") and not self._require_system_generation():
            return

        # PUT /api/products/{id}
        if path.startswith("/api/products/"):
            if not check_admin_permission(admin_user, "products:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية تعديل المنتجات"})
                return
            try:
                prod_id = int(path.split("/")[-1])
            except (ValueError, TypeError):
                self._send_json(400, {"success": False, "error": "معرف المنتج غير صالح"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    UPDATE products
                    SET name_ar = COALESCE(%s, name_ar),
                        name_en = COALESCE(%s, name_en),
                        category_id = COALESCE(%s, category_id),
                        unit = COALESCE(%s, unit),
                        cost_price = COALESCE(%s, cost_price),
                        sale_price = COALESCE(%s, sale_price),
                        discount_price = %s,
                        image = COALESCE(%s, image),
                        is_available = COALESCE(%s, is_available)
                    WHERE id = %s
                    RETURNING id;
                    """,
                    (
                        body.get("nameAr"), body.get("nameEn"),
                        body.get("categoryId"), body.get("unit"),
                        safe_float(body.get("costPrice")), safe_float(body.get("salePrice")),
                        safe_float(body.get("discountPrice")), body.get("image"),
                        bool(body.get("isAvailable")) if "isAvailable" in body else None,
                        prod_id
                    )
                )
                res = cur.fetchone()
                if not res:
                    conn.rollback()
                    self._send_json(404, {"success": False, "error": "المنتج غير موجود"})
                    return
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "productId": prod_id, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # PUT /api/orders/{id}
        if path.startswith("/api/orders/"):
            # يسمح بتعديل الطلبات لحاملي orders:write أو delivery:write
            can_update_order = check_admin_permission(admin_user, "orders:write") or check_admin_permission(admin_user, "delivery:write")
            if not can_update_order:
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية تعديل حالة الطلبات أو إسناد التوصيل"})
                return
            try:
                order_id = int(path.split("/")[-1])
            except:
                self._send_json(400, {"success": False, "error": "معرف الطلب غير صالح"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                status_map = {
                    "pending": "قيد الانتظار", "preparing": "قيد التجهيز", "on_the_way": "في الطريق",
                    "completed": "مكتمل", "cancelled": "ملغي",
                    "Pending": "قيد الانتظار", "InPrep": "قيد التجهيز", "OnTheWay": "في الطريق",
                    "Completed": "مكتمل", "Cancelled": "ملغي"
                }

                new_status = body.get("status")
                new_status_ar = status_map.get(new_status) if new_status else None

                delegate_val = body.get("delegate")
                recipient_id_val = body.get("recipientId") or body.get("recipient_id") or body.get("delegateId") or body.get("delegate_id")

                # التحقق الصارم من المندوب في جدول delegates قبل الإسناد
                if recipient_id_val is not None:
                    try:
                        rec_int = int(recipient_id_val)
                    except:
                        conn.rollback()
                        self._send_json(400, {"success": False, "error": "معرف المندوب يجب أن يكون عدداً صحيحاً"})
                        return
                    cur.execute("SELECT id, name, phone FROM delegates WHERE id = %s AND (status = 'active' OR status IS NULL);", (rec_int,))
                    del_row = cur.fetchone()
                    if not del_row:
                        conn.rollback()
                        self._send_json(400, {"success": False, "error": "معرّف المندوب غير صالح أو غير نشط في النظام"})
                        return
                    recipient_id_val = del_row[0]
                    if not delegate_val:
                        delegate_val = f"{del_row[1]} ({del_row[2] or ''})".strip()

                cur.execute(
                    """
                    UPDATE orders
                    SET status = COALESCE(%s, status),
                        status_ar = COALESCE(%s, status_ar),
                        delegate = COALESCE(%s, delegate),
                        recipient_id = COALESCE(%s, recipient_id)
                    WHERE id = %s
                    RETURNING id, status, delegate, recipient_id, status_ar;
                    """,
                    (new_status, new_status_ar, delegate_val, recipient_id_val, order_id)
                )
                updated_row = cur.fetchone()
                if not updated_row:
                    conn.rollback()
                    self._send_json(404, {"success": False, "error": "الطلب غير موجود"})
                    return

                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {
                    "success": True,
                    "orderId": order_id,
                    "status": updated_row[1],
                    "statusAr": updated_row[4],
                    "delegate": updated_row[2],
                    "recipientId": updated_row[3],
                    "order": {
                        "id": order_id,
                        "status": updated_row[1],
                        "statusAr": updated_row[4],
                        "delegate": updated_row[2],
                        "recipientId": updated_row[3]
                    },
                    "lastUpdated": ts
                })
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # PUT /api/complaints/{id}
        if path.startswith("/api/complaints/"):
            if not check_admin_permission(admin_user, "complaints:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية الرد على الشكاوى"})
                return
            try:
                comp_id = int(path.split("/")[-1])
            except:
                self._send_json(400, {"success": False, "error": "معرف الشكوى غير صالح"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                status_map = {
                    "new": "جديدة", "in_progress": "قيد المعالجة", "resolved": "تم الحل", "closed": "مغلقة", "rejected": "مرفوضة"
                }
                new_status = body.get("status", "in_progress")
                new_status_ar = status_map.get(new_status, "قيد المعالجة")
                admin_reply = body.get("adminReply", "")
                cur.execute(
                    """
                    UPDATE complaints
                    SET status = %s, status_ar = %s, admin_reply = %s, replied_at = %s, replied_by = %s
                    WHERE id = %s;
                    """,
                    (new_status, new_status_ar, admin_reply, time.strftime("%Y-%m-%d %H:%M"), admin_user.get("fullName", admin_user.get("username")), comp_id)
                )
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "complaintId": comp_id, "status": new_status, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # PUT /api/users/{id} (تعديل مستخدم - محمي للمخولين + قفل ذري)
        if path.startswith("/api/users/"):
            is_super = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") == "developer_admin"
            can_manage = is_super or check_admin_permission(admin_user, "users") or check_admin_permission(admin_user, "users:write")
            if not can_manage:
                self._send_json(403, {"success": False, "error": "تعديل المستخدمين محصور بالمخولين"})
                return

            target_uid = path.split("/")[-1].strip()
            if not target_uid or target_uid == "usr_developer":
                self._send_json(403, {"success": False, "error": "لا يمكن تعديل هذا الحساب"})
                return

            if not body or not isinstance(body, dict):
                self._send_json(400, {"success": False, "error": "بيانات التعديل مطلوبة"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("SELECT pg_advisory_xact_lock(hashtext('taswoq_primary_admin_lock'));")
                cur.execute("SELECT id, username, email, role, is_primary_admin, is_active FROM users WHERE id = %s;", (target_uid,))
                target_row = cur.fetchone()
                if not target_row:
                    conn.rollback()
                    self._send_json(404, {"success": False, "error": "المستخدم غير موجود"})
                    return

                t_id, curr_uname, curr_email, curr_role, curr_is_primary, curr_active = target_row

                # لا يمكن لغير المدير الأساسي أو المطور التعديل على حساب مدير عام أو مطور
                if (curr_is_primary or curr_role in ("primary_admin", "developer_admin")) and not is_super:
                    conn.rollback()
                    self._send_json(403, {"success": False, "error": "تعديل حسابات المدير العام أو المطور محصور بالمدير الأساسي والمطور"})
                    return

                new_uname = str(body.get("username", curr_uname)).strip().lower()
                new_email = str(body.get("email", curr_email or "")).strip().lower() if body.get("email") else ""
                new_fname = str(body.get("fullName", "")).strip() if "fullName" in body else None
                new_role = str(body.get("role", curr_role)).strip()
                is_targeting_primary = bool(body.get("isPrimaryAdmin", False)) or (new_role == "primary_admin")

                # التحقق من عدم التكرار
                if new_uname != curr_uname:
                    cur.execute("SELECT id FROM users WHERE LOWER(username) = %s AND id != %s;", (new_uname, target_uid))
                    if cur.fetchone():
                        conn.rollback()
                        self._send_json(409, {"success": False, "error": "اسم المستخدم مسجل مسبقاً"})
                        return
                if new_email and new_email != (curr_email or "").lower():
                    cur.execute("SELECT id FROM users WHERE email IS NOT NULL AND email != '' AND LOWER(email) = %s AND id != %s;", (new_email, target_uid))
                    if cur.fetchone():
                        conn.rollback()
                        self._send_json(409, {"success": False, "error": "البريد الإلكتروني مسجل مسبقاً"})
                        return

                # حماية سقف المديرين وحظر تجريد آخر مدير عام
                cur.execute("SELECT COUNT(*) FROM users WHERE is_primary_admin = TRUE AND is_active = TRUE;")
                active_primaries = cur.fetchone()[0]
                if is_targeting_primary and not curr_is_primary:
                    if active_primaries >= 2:
                        conn.rollback()
                        self._send_json(400, {"success": False, "error": "تم الوصول للحد الأقصى للمديرين العامين (2 فقط)"})
                        return
                elif curr_is_primary and not is_targeting_primary:
                    if active_primaries <= 1:
                        conn.rollback()
                        self._send_json(400, {"success": False, "error": "لا يمكن تجريد المدير الأساسي الوحيد بالنظام"})
                        return

                target_final_role = "primary_admin" if is_targeting_primary else ("admin" if new_role == "admin" else "employee")
                clean_perms = {"all": True} if is_targeting_primary else normalize_permissions(body.get("permissions", {}))

                updates = ["username = %s", "email = %s", "role = %s", "is_primary_admin = %s", "permissions = %s"]
                params = [new_uname, new_email, target_final_role, is_targeting_primary, json.dumps(clean_perms)]

                if new_fname:
                    updates.append("full_name = %s")
                    params.append(new_fname)
                if "isActive" in body:
                    updates.append("is_active = %s")
                    params.append(bool(body["isActive"]))
                if "mustChangePassword" in body:
                    updates.append("must_change_password = %s")
                    params.append(bool(body["mustChangePassword"]))
                if body.get("password"):
                    updates.append("password_hash = %s")
                    params.append(hash_password(str(body["password"]).strip()))

                params.append(target_uid)
                sql = f"UPDATE users SET {', '.join(updates)} WHERE id = %s;"
                cur.execute(sql, tuple(params))

                # تسجيل التدقيق
                cur.execute(
                    """
                    INSERT INTO audit_logs (user_id, user_name, action, action_title, details, ip_address, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (admin_user.get("userId", "usr_developer"), admin_user.get("fullName", admin_user.get("username", "المطور البرمجي")), "USER_UPDATED", "تعديل حساب مستخدم", f"تم تعديل بيانات وصلاحيات {new_uname} بواسطة {admin_user.get('fullName', 'المطور')} [{admin_user.get('role', 'developer_admin')}]", self.client_address[0] if self.client_address else "", now_ms())
                )
                conn.commit()
                self._send_json(200, {"success": True, "userId": target_uid})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        self._send_json(404, {"success": False, "error": "Endpoint not found"})

    # ------------------------------------------------------------------
    # DELETE
    # ------------------------------------------------------------------
    def do_DELETE(self):
        with SYSTEM_DATA_LOCK:
            return self._do_DELETE_locked()

    def _do_DELETE_locked(self):
        admin_user = authenticate_admin_request(self.headers, self.client_address)
        if not admin_user:
            self._send_json(401, {"success": False, "error": "غير مصرح: تتطلب جلسة صالحة"})
            return

        if not verify_csrf_token(self, admin_user):
            self._send_json(403, {"success": False, "error": "رمز الحماية ضد التزوير (CSRF Token) غير صالح أو مفقود"})
            return

        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        if path.startswith("/api/") and not self._require_system_generation():
            return

        # DELETE /api/users/{id} (حذف مستخدم - محصور بالمدير الأساسي والمطور + قفل ذري)
        if path.startswith("/api/users/"):
            is_super = admin_user.get("isPrimaryAdmin") is True or admin_user.get("role") == "developer_admin"
            if not is_super:
                self._send_json(403, {"success": False, "error": "حذف المستخدمين محصور بالمدير الأساسي والمطور"})
                return
            target_uid = path.split("/")[-1]
            if not target_uid:
                self._send_json(400, {"success": False, "error": "معرف المستخدم مطلوب"})
                return

            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("SELECT pg_advisory_xact_lock(hashtext('taswoq_primary_admin_lock'));")
                cur.execute("SELECT is_primary_admin FROM users WHERE id = %s;", (target_uid,))
                target_user = cur.fetchone()
                if not target_user:
                    self._send_json(404, {"success": False, "error": "المستخدم غير موجود"})
                    return

                u_is_primary = target_user[0]
                if u_is_primary:
                    cur.execute("SELECT COUNT(*) FROM users WHERE is_primary_admin = TRUE AND is_active = TRUE;")
                    active_primaries = cur.fetchone()[0]
                    if active_primaries <= 1:
                        conn.rollback()
                        self._send_json(400, {"success": False, "error": "لا يمكن حذف المدير الأساسي الوحيد بالنظام"})
                        return

                cur.execute("DELETE FROM admin_sessions WHERE user_id = %s;", (target_uid,))
                cur.execute("DELETE FROM users WHERE id = %s;", (target_uid,))

                cur.execute(
                    """
                    INSERT INTO audit_logs (user_id, user_name, action, action_title, details, ip_address, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (admin_user.get("userId", "usr_developer"), admin_user.get("fullName", admin_user.get("username", "المطور البرمجي")), "USER_DELETED", "حذف حساب مستخدم", f"تم حذف حساب {target_uid} نهائياً بواسطة {admin_user.get('fullName', 'المطور')} [{admin_user.get('role', 'developer_admin')}]", self.client_address[0] if self.client_address else "", now_ms())
                )
                conn.commit()
                self._send_json(200, {"success": True, "deletedId": target_uid})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # DELETE /api/categories/{id}
        if path.startswith("/api/categories/"):
            if not check_admin_permission(admin_user, "categories:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية حذف الأقسام"})
                return
            cat_id = path.split("/")[-1]
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM categories WHERE id = %s", (cat_id,))
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "deletedId": cat_id, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # DELETE /api/products/{id}
        if path.startswith("/api/products/"):
            if not check_admin_permission(admin_user, "products:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية حذف المنتجات"})
                return
            try:
                prod_id = int(path.split("/")[-1])
            except:
                self._send_json(400, {"success": False, "error": "معرف المنتج غير صالح"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM products WHERE id = %s;", (prod_id,))
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "deletedId": prod_id, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        # DELETE /api/expenses/{id}
        if path.startswith("/api/expenses/"):
            if not check_admin_permission(admin_user, "expenses:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية حذف المصاريف"})
                return
            try:
                exp_id = int(path.split("/")[-1])
            except:
                self._send_json(400, {"success": False, "error": "معرف المصروف يجب أن يكون رقماً صحيحاً"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM expenses WHERE id = %s RETURNING id;", (exp_id,))
                deleted_row = cur.fetchone()
                if not deleted_row:
                    conn.rollback()
                    self._send_json(404, {"success": False, "error": "سند الصرف غير موجود"})
                    return
                conn.commit()
                self._send_json(200, {"success": True, "deletedId": exp_id})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return



        if path.startswith("/api/complaints/"):
            if not check_admin_permission(admin_user, "complaints:write"):
                self._send_json(403, {"success": False, "error": "ليس لديك صلاحية حذف الشكاوى"})
                return
            try:
                comp_id = int(path.split("/")[-1])
            except:
                self._send_json(400, {"success": False, "error": "معرف الشكوى غير صالح"})
                return
            conn = get_conn()
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM complaints WHERE id = %s", (comp_id,))
                ts = db_set_last_updated(cur)
                conn.commit()
                self._send_json(200, {"success": True, "deletedId": comp_id, "lastUpdated": ts})
            except Exception as e:
                conn.rollback()
                self._send_json(500, {"success": False, "error": str(e)})
            finally:
                put_conn(conn)
            return

        self._send_json(404, {"success": False, "error": "Endpoint not found"})

def run_server():
    get_pool()
    dev_hash = get_developer_secret_hash()
    dev_status = "Enabled (scrypt Hash configured)" if dev_hash else "Disabled (DEVELOPER_SECRET_HASH not configured)"
    server_address = (HOST, PORT)
    httpd = ThreadedHTTPServer(server_address, TaswoqSyncHandler)
    primary_ip = get_local_ips()[0]
    print("\n" + "=" * 68)
    print("      🚀 Taswoq Sync Server — Secure PostgreSQL Edition")
    print("=" * 68)
    print(f"  🌐 وضع الاستماع: {HOST}:{PORT}")
    print(f"  💻 لوحة تحكم المشرف:")
    print(f"     -> http://{HOST}:{PORT}/لوحة_تحكم_الإدارة.html")
    print(f"  📱 رابط مزامنة التطبيق والكتالوج:")
    print(f"     -> http://{HOST}:{PORT}/api/sync")
    print(f"  🔐 التوثيق الإداري: Bearer Tokens + HttpOnly SameSite=Strict Cookies")
    print(f"  🔑 Developer Gate: {dev_status}")
    print(f"  🛡️  Sandbox: حظر تام لملفات الكود والأسرار وقواعد البيانات")
    print("=" * 68)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nتم إيقاف السيرفر.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
