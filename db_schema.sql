-- =============================================================================
-- Taswoq PostgreSQL Database Schema (المخطط الكامل المحدث)
-- =============================================================================

-- جدول توثيق المخططات
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(50) PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  BIGINT NOT NULL
);

-- جدول الإعدادات العامة (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key   VARCHAR(100) PRIMARY KEY,
    value TEXT
);

-- ملف تعريف المتجر
CREATE TABLE IF NOT EXISTS store_profile (
    id                SERIAL PRIMARY KEY,
    name              TEXT,
    phone             TEXT,
    address           TEXT,
    hours             TEXT,
    email             TEXT,
    delivery_time     TEXT,
    min_free_delivery NUMERIC(10,2),
    currency          TEXT DEFAULT 'YER',
    updated_at        BIGINT DEFAULT 0
);

-- إعدادات الدعم
CREATE TABLE IF NOT EXISTS support_settings (
    id                SERIAL PRIMARY KEY,
    whatsapp          TEXT,
    email             TEXT,
    working_hours_ar  TEXT,
    working_hours_en  TEXT
);

-- إعدادات التوصيل
CREATE TABLE IF NOT EXISTS delivery_settings (
    id                    SERIAL PRIMARY KEY,
    base_fee              NUMERIC(10,2) DEFAULT 0,
    free_delivery_enabled BOOLEAN DEFAULT FALSE,
    is_enabled            BOOLEAN DEFAULT FALSE,
    free_above            NUMERIC(10,2),
    min_order             NUMERIC(10,2),
    estimated_time        TEXT
);

-- الأقسام / التصنيفات
CREATE TABLE IF NOT EXISTS categories (
    id          VARCHAR(100) PRIMARY KEY,
    name_ar     TEXT NOT NULL,
    name_en     TEXT,
    icon        TEXT,
    img         TEXT,
    is_special  BOOLEAN DEFAULT FALSE
);

-- المنتجات
CREATE TABLE IF NOT EXISTS products (
    id              INTEGER PRIMARY KEY,
    name_ar         TEXT NOT NULL,
    name_en         TEXT,
    category_id     VARCHAR(100),
    unit            TEXT,
    cost_price      NUMERIC(10,2),
    sale_price      NUMERIC(10,2),
    discount_price  NUMERIC(10,2),
    image           TEXT,
    is_available    BOOLEAN DEFAULT TRUE,
    created_at      TEXT,
    extra_data      JSONB
);

-- البنرات الإعلانية
CREATE TABLE IF NOT EXISTS banners (
    id          INTEGER PRIMARY KEY,
    tag_ar      TEXT,
    tag_en      TEXT,
    title_ar    TEXT,
    title_en    TEXT,
    desc_ar     TEXT,
    desc_en     TEXT,
    bg_gradient TEXT,
    image       TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TEXT,
    extra_data  JSONB
);

-- متسلسلة معرفات الطلبات الآمنة للطلبات المتزامنة
CREATE SEQUENCE IF NOT EXISTS orders_id_seq START WITH 1001;

-- الطلبات (مع دعم متسلسلة المعرفات الآمنة، رمز التتبع السري المشفر، ومعرف العميل الفريد لمنع التكرار)
CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY DEFAULT nextval('orders_id_seq'),
    order_number        TEXT,
    client_order_id     TEXT,        -- معرف فريد من العميل (UUID) لمنع التكرار الذري
    payload_hash        VARCHAR(64), -- تجزئة SHA-256 لكامل بيانات الطلب المطبّعة
    order_token_hash    VARCHAR(64), -- تجزئة SHA-256 لرمز التحقق السري العشوائي
    device_id           TEXT,
    customer_name       TEXT,
    customer_phone      TEXT,
    customer_address    TEXT,
    items_count         INTEGER DEFAULT 0,
    subtotal            NUMERIC(10,2) DEFAULT 0,
    total_sales         NUMERIC(10,2) DEFAULT 0,
    delivery_fee        NUMERIC(10,2) DEFAULT 0,
    total               NUMERIC(10,2) DEFAULT 0,
    grand_total         NUMERIC(10,2) DEFAULT 0,
    total_cost          NUMERIC(10,2) DEFAULT 0,
    net_profit          NUMERIC(10,2) DEFAULT 0,
    location_url        TEXT,
    location_details    TEXT,
    notes               TEXT,
    delegate            TEXT,
    recipient_id        INTEGER,
    status              TEXT DEFAULT 'Pending',
    status_ar           TEXT DEFAULT 'قيد الانتظار',
    created_at          TEXT,
    created_timestamp   BIGINT DEFAULT 0,
    source              TEXT
);

-- عناصر الطلبات (مع الفهرس التسلسلي والقيد الفريد لمنع التكرار)
CREATE TABLE IF NOT EXISTS order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_index  INTEGER NOT NULL DEFAULT 0,
    product_id  INTEGER,
    cart_key    TEXT,
    name        TEXT,
    unit        TEXT,
    qty         NUMERIC(10,3) DEFAULT 1,
    unit_price  NUMERIC(10,2) DEFAULT 0,
    cost_price  NUMERIC(10,2) DEFAULT 0,
    extra_data  JSONB,
    CONSTRAINT uq_order_items_order_index UNIQUE (order_id, item_index)
);

-- متسلسلة معرفات الشكاوى
CREATE SEQUENCE IF NOT EXISTS complaints_id_seq START WITH 101;

-- الشكاوى
CREATE TABLE IF NOT EXISTS complaints (
    id              INTEGER PRIMARY KEY DEFAULT nextval('complaints_id_seq'),
    ticket_no       TEXT UNIQUE,
    device_id       TEXT,
    order_id        INTEGER,
    customer_name   TEXT,
    customer_phone  TEXT,
    type            TEXT,
    type_name_ar    TEXT,
    message         TEXT,
    status          TEXT DEFAULT 'New',
    status_ar       TEXT DEFAULT 'جديدة',
    admin_reply     TEXT,
    replied_at      TEXT,
    replied_by      TEXT,
    created_at      TEXT
);

-- الإشعارات
CREATE TABLE IF NOT EXISTS notifications (
    id               VARCHAR(100) PRIMARY KEY,
    type             TEXT,
    title            TEXT,
    title_ar         TEXT,
    body             TEXT,
    body_ar          TEXT,
    message          TEXT,
    target           TEXT DEFAULT 'all',
    target_device_id TEXT,
    order_id         INTEGER,
    order_number     TEXT,
    ticket_no        TEXT,
    complaint_id     INTEGER,
    logo             TEXT,
    is_read          BOOLEAN DEFAULT FALSE,
    timestamp        BIGINT DEFAULT 0,
    extra_data       JSONB
);

-- مناطق التوصيل
CREATE TABLE IF NOT EXISTS delivery_zones (
    id              INTEGER PRIMARY KEY,
    name_ar         TEXT NOT NULL,
    name_en         TEXT,
    fee             NUMERIC(10,2) DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    estimated_time  TEXT
);

-- مندوبو الواتساب والتوصيل
CREATE TABLE IF NOT EXISTS whatsapp_recipients (
    id          INTEGER PRIMARY KEY,
    name        TEXT,
    phone       TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT FALSE,
    extra_data  JSONB
);

-- محافظ الدفع
CREATE TABLE IF NOT EXISTS payment_wallets (
    id          VARCHAR(100) PRIMARY KEY,
    name_ar     TEXT,
    name_en     TEXT,
    number      TEXT,
    holder_name TEXT,
    note        TEXT,
    icon        TEXT,
    is_active   BOOLEAN DEFAULT TRUE
);

-- المستخدمون والمشرفون
CREATE TABLE IF NOT EXISTS users (
    id                   VARCHAR(100) PRIMARY KEY,
    full_name            TEXT,
    username             TEXT UNIQUE,
    email                TEXT,
    password_hash        TEXT, -- تجزئة مشفرة عبر Argon2id أو bcrypt
    role                 TEXT DEFAULT 'staff',
    is_primary_admin     BOOLEAN DEFAULT FALSE,
    is_active            BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT FALSE,
    failed_attempts      INTEGER DEFAULT 0,
    locked_until         BIGINT,
    last_login_at        BIGINT,
    created_at           TEXT,
    permissions          JSONB
);

-- جدول جلسات المشرفين الموثقة (Bearer Sessions + HttpOnly Cookie)
CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash      VARCHAR(64) PRIMARY KEY, -- SHA-256 لرمز الجلسة العشوائي
    csrf_token_hash VARCHAR(64),             -- SHA-256 لرمز حماية CSRF
    user_id         VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    permissions     JSONB,
    created_at      BIGINT NOT NULL,
    expires_at      BIGINT NOT NULL,
    ip_address      TEXT
);

-- المندوبون
CREATE TABLE IF NOT EXISTS delegates (
    id          INTEGER PRIMARY KEY,
    name        TEXT,
    phone       TEXT,
    pin         TEXT,
    zone        TEXT,
    status      TEXT,
    permissions JSONB,
    created_at  TEXT
);

-- المصاريف
CREATE TABLE IF NOT EXISTS expenses (
    id               SERIAL PRIMARY KEY,
    date             TEXT,
    category         TEXT,
    category_name_ar TEXT,
    description      TEXT,
    amount           NUMERIC(10,2) DEFAULT 0,
    payment_method   TEXT,
    recorded_by      TEXT
);

-- سجلات المراجعة
CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    user_id      TEXT,
    user_name    TEXT,
    action       TEXT,
    action_title TEXT,
    details      TEXT,
    ip_address   TEXT,
    timestamp    BIGINT DEFAULT 0
);

-- الأسئلة الشائعة
CREATE TABLE IF NOT EXISTS faqs (
    id   SERIAL PRIMARY KEY,
    q_ar TEXT,
    q_en TEXT,
    a_ar TEXT,
    a_en TEXT
);

-- مشتركو التطبيق
CREATE TABLE IF NOT EXISTS app_subscribers (
    device_id VARCHAR(200) PRIMARY KEY
);

-- قائمة المشرفين البيضاء
CREATE TABLE IF NOT EXISTS admin_whitelist (
    email VARCHAR(200) PRIMARY KEY
);

-- =============================================================================
-- الفهارس
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_status           ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_ts       ON orders(created_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_orders_token_hash       ON orders(order_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_client_order_id ON orders(client_order_id) WHERE client_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order_id    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user     ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp      ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp  ON notifications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_device_id    ON complaints(device_id);
CREATE INDEX IF NOT EXISTS idx_products_category       ON products(category_id);
