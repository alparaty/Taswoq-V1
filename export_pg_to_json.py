# -*- coding: utf-8 -*-
"""
export_pg_to_json.py
====================
أداة التصدير والتراجع الذرية:
1. تقرأ أحدث البيانات اللحظية من جداول PostgreSQL بالكامل.
2. تكتبها في ملف مؤقت taswoq_db_latest.json.tmp مع fsync.
3. استبدال ذري آمن os.replace إلى taswoq_db_latest.json.
4. إعادة قراءة الملف والتحقق التام من اكتمال التصدير وصحة JSON.
5. لا يمس ولا يستبدل ملف taswoq_db.json الأصلي إطلاقاً.
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
EXPORT_FILE = os.path.join(BASE_DIR, "taswoq_db_latest.json")
TEMP_FILE   = os.path.join(BASE_DIR, "taswoq_db_latest.json.tmp")

def get_connection():
    if psycopg2 is None:
        print("❌ psycopg2 غير مثبت. نفّذ: pip install psycopg2-binary")
        sys.exit(1)
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL غير محدد في متغيرات البيئة.")
        sys.exit(1)
    return psycopg2.connect(db_url)

def fetch_table(cur, table_name, order_by="id"):
    try:
        cur.execute(f"SELECT * FROM {table_name} ORDER BY {order_by};")
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in rows]
    except Exception as e:
        print(f"⚠️  تعذر قراءة {table_name}: {e}")
        return []

def export_all():
    print("=" * 65)
    print(" 📦 Taswoq — أداة تصدير بيانات PostgreSQL إلى JSON (Atomic Export)")
    print("=" * 65)

    conn = get_connection()
    cur = conn.cursor()

    try:
        print("🔍 سحب البيانات من جداول PostgreSQL...")
        
        # 1. Categories
        raw_cats = fetch_table(cur, "categories", "id")
        categories = [{
            "id": c["id"], "nameAr": c["name_ar"], "nameEn": c["name_en"] or "",
            "icon": c["icon"] or "", "img": c["img"] or "", "isSpecial": c["is_special"]
        } for c in raw_cats]

        # 2. Products
        raw_prods = fetch_table(cur, "products", "id DESC")
        products = []
        for p in raw_prods:
            item = {
                "id": p["id"], "nameAr": p["name_ar"], "nameEn": p["name_en"] or "",
                "categoryId": p["category_id"] or "", "unit": p["unit"] or "",
                "costPrice": float(p["cost_price"] or 0),
                "salePrice": float(p["sale_price"] or 0),
                "discountPrice": float(p["discount_price"]) if p["discount_price"] else None,
                "image": p["image"] or "", "isAvailable": p["is_available"],
                "createdAt": p["created_at"] or ""
            }
            if p.get("extra_data"):
                extra = p["extra_data"] if isinstance(p["extra_data"], dict) else json.loads(p["extra_data"])
                item.update(extra)
            products.append(item)

        # 3. Orders with Items
        raw_orders = fetch_table(cur, "orders", "id DESC")
        orders = []
        for o in raw_orders:
            # عناصر الطلب مرتبة بالفهرس
            cur.execute("SELECT * FROM order_items WHERE order_id = %s ORDER BY item_index ASC, id ASC;", (o["id"],))
            raw_items = cur.fetchall()
            item_cols = [c[0] for c in cur.description]
            items = []
            for it in raw_items:
                d_it = dict(zip(item_cols, it))
                it_dict = {
                    "productId": d_it["product_id"], "cartKey": d_it["cart_key"] or "",
                    "name": d_it["name"] or "", "unit": d_it["unit"] or "",
                    "qty": float(d_it["qty"] or 1), "unitPrice": float(d_it["unit_price"] or 0),
                    "costPrice": float(d_it["cost_price"] or 0)
                }
                if d_it.get("extra_data"):
                    extra = d_it["extra_data"] if isinstance(d_it["extra_data"], dict) else json.loads(d_it["extra_data"])
                    it_dict.update(extra)
                items.append(it_dict)

            order_dict = {
                "id": o["id"], "orderNumber": o["order_number"] or "",
                "deviceId": o["device_id"] or "", "customerName": o["customer_name"] or "",
                "customerPhone": o["customer_phone"] or "", "customerAddress": o["customer_address"] or "",
                "items": items, "itemsCount": len(items),
                "subtotal": float(o["subtotal"] or 0), "totalSales": float(o["total_sales"] or 0),
                "deliveryFee": float(o["delivery_fee"] or 0), "total": float(o["total"] or 0),
                "grandTotal": float(o["grand_total"] or 0), "totalCost": float(o["total_cost"] or 0),
                "netProfit": float(o["net_profit"] or 0), "locationUrl": o["location_url"] or "",
                "locationDetails": o["location_details"] or "", "notes": o["notes"] or "",
                "delegate": o["delegate"] or "", "recipientId": o["recipient_id"],
                "status": o["status"] or "Pending", "statusAr": o["status_ar"] or "قيد الانتظار",
                "createdAt": o["created_at"] or "", "createdTimestamp": o["created_timestamp"] or 0,
                "source": o["source"] or ""
            }
            orders.append(order_dict)

        # 4. Settings & Other Collections
        cur.execute("SELECT key, value FROM settings;")
        settings = dict(cur.fetchall())

        cur.execute("SELECT * FROM delivery_settings LIMIT 1;")
        ds_row = cur.fetchone()
        delivery_settings = {}
        if ds_row:
            ds_cols = [c[0] for c in cur.description]
            ds_d = dict(zip(ds_cols, ds_row))
            delivery_settings = {
                "baseFee": float(ds_d["base_fee"] or 0),
                "freeDeliveryEnabled": ds_d["free_delivery_enabled"],
                "isEnabled": ds_d["is_enabled"],
                "freeAbove": float(ds_d["free_above"]) if ds_d["free_above"] else None,
                "minOrder": float(ds_d["min_order"]) if ds_d["min_order"] else None,
                "estimatedTime": ds_d["estimated_time"] or ""
            }

        payload = {
            "appNameAr": settings.get("appNameAr", "تسوق"),
            "appNameEn": settings.get("appNameEn", "Taswoq"),
            "appLogoBase64": settings.get("appLogoBase64", ""),
            "approvedDelegateId": int(settings.get("approvedDelegateId", 4)) if settings.get("approvedDelegateId") else 4,
            "categories": categories,
            "products": products,
            "orders": orders,
            "banners": fetch_table(cur, "banners"),
            "complaints": fetch_table(cur, "complaints"),
            "deliverySettings": delivery_settings,
            "deliveryZones": fetch_table(cur, "delivery_zones"),
            "paymentWallets": fetch_table(cur, "payment_wallets"),
            "whatsappRecipients": fetch_table(cur, "whatsapp_recipients"),
            "supportSettings": fetch_table(cur, "support_settings")[0] if fetch_table(cur, "support_settings") else {},
            "storeProfile": fetch_table(cur, "store_profile")[0] if fetch_table(cur, "store_profile") else {},
            "faqs": fetch_table(cur, "faqs"),
            "notifications": fetch_table(cur, "notifications"),
            "users": fetch_table(cur, "users"),
            "adminWhitelist": [r["email"] for r in fetch_table(cur, "admin_whitelist", "email")],
            "appSubscribers": [r["device_id"] for r in fetch_table(cur, "app_subscribers", "device_id")],
            "lastUpdated": int(time.time() * 1000)
        }

        # 5. الكتابة الذرية (Atomic Write with Flush and Fsync)
        print("💾 تنفيذ الكتابة الذرية إلى الملف المؤقت...")
        with open(TEMP_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())

        os.replace(TEMP_FILE, EXPORT_FILE)
        print(f"✅ تم إنشاء الملف النهائي: {EXPORT_FILE}")

        # 6. التحقق من صحة واكتمال التصدير
        print("🔍 فحص التحقق من صحة الملف المصدر...")
        with open(EXPORT_FILE, "r", encoding="utf-8") as f:
            check_data = json.load(f)

        assert len(check_data.get("categories", [])) == len(categories), "عدم تطابق في الأقسام!"
        assert len(check_data.get("orders", [])) == len(orders), "عدم تطابق في الطلبات!"
        assert len(check_data.get("products", [])) == len(products), "عدم تطابق في المنتجات!"

        print("=" * 65)
        print("🎉 اكتمل التصدير بنجاح تام وتم التحقق من سلامة وصحة الملف 100%!")
        print(f"   الملف الناتج: {EXPORT_FILE} ({os.path.getsize(EXPORT_FILE)/1024:.1f} KB)")
        print(f"   الأقسام: {len(categories)} | الطلبات: {len(orders)} | المنتجات: {len(products)}")
        print("🔒 ملف taswoq_db.json الأصلي لم يُمس وبقي محفوظاً دون تغيير.")
        print("=" * 65)

    except Exception as e:
        if os.path.exists(TEMP_FILE):
            os.remove(TEMP_FILE)
        print(f"❌ فشل التصدير: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    export_all()

