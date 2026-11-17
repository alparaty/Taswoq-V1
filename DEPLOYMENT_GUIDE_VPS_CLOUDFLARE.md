# دليل النشر والتشغيل السحابي لمشروع تسوق (Linux VPS + Cloudflare)

> [!IMPORTANT]
> **ملاحظة تمهيدية ملزمة:**
> كافة الأوامر والخطوات الواردة في هذا الدليل (إنشاء قاعدة بيانات الإنتاج، استيراد الأقسام، تفعيل جدار الحماية UFW، ضبط سجلات DNS، وإعداد Nginx) هي **خطوات يدوية مؤجلة تماماً** تنتظر مراجعتك الشخصية وتوفير خادم Linux VPS الفعلي وحجز النطاق الرسمي. لا تقم بتنفيذ أي أمر منها على بيئة التطوير الحالية.

---

## 1. المعمارية السحابية المعتمدة
* **خادم مركزي واحد (VPS):** يشغّل خدمة بايثون `server_pg.py` بحساب مستخدم نظام مخصص ومحدود الصلاحيات (`taswoq`) والمجموعة (`taswoq`) مستمعاً على `127.0.0.1:8080` داخلياً، ومحرك PostgreSQL مستمعاً على `127.0.0.1:5432` داخلياً فقط دون فتحهما للعامة.
* **الجدار الناري (UFW):** يُغلق كافة المنافذ افتراضياً؛ ويفتح فقط منفذ SSH الفعلي المحقق للإدارة، ويحصر المنفذين 80 و 443 على نطاقات خوادم Cloudflare الرسمية لمنع الالتفاف على الخادم (Bypass Prevention).
* **الوكيل العكسي (Nginx):** يتلقى طلبات HTTPS المشفرة من Cloudflare، يخدم الملفات الثابتة المعزولة من مجلد `public/` مباشرة، ويمرر طلبات `/api/` إلى بايثون.
* **العملاء:**
  1. **تطبيق Android:** يتصل بنطاق HTTPS المركزي.
  2. **لوحة الإدارة (`لوحة_تحكم_الإدارة.html`):** تعمل عبر نفس النطاق المركزي بمصادقة مشفرة `HttpOnly` و `CSRF Token`.

---

## 2. خطوات تهيئة خادم Linux VPS (خطوات مؤجلة عند توفر السيرفر)

### أ. اختيار نظام التشغيل وتحديث المتطلبات:

* **Ubuntu 24.04 LTS (الخيار الموصى به):**
  - يأتي افتراضياً مع **Python 3.12**، و **PostgreSQL 16**، و **Nginx >= 1.24**.
  - يدعم توجيه `ssl_reject_handshake on;` أصيلاً في Nginx لمنع تجاوز حماية Cloudflare عبر المنفذ 443 مباشرة دون الحاجة لشهادة وهمية.
  - يفرض بيئة بايثون معزولة (PEP 668) تمنع التثبيت العشوائي خارج `venv`.
* **Ubuntu 22.04 LTS (طريقة التوافق):**
  - يأتي افتراضياً مع **Python 3.10**، و **PostgreSQL 14**، و **Nginx 1.18**.
  - **نقطة التوافق الهامة في Nginx:** إصدار Nginx 1.18 لا يدعم توجيه `ssl_reject_handshake on;` (الذي يتطلب Nginx 1.19.4+). للتوافق عند استخدام Ubuntu 22.04:
    - *إما* إضافة مستودع Nginx الرسمي (`ppa:ondrej/nginx`) للحصول على Nginx الحديث (>= 1.24).
    - *أو* استخدام كتلة التوافق البديلة الموضحة في ملف `nginx-taswoq.conf` (تعطيل سطر `ssl_reject_handshake` وتفعيل شهادة snakeoil الوهمية مع إرجاع كود `return 444;`).

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv postgresql postgresql-contrib nginx ufw git
```

### ب. إنشاء حساب نظام ومجموعة مخصصة ومحدودة الصلاحيات لتشغيل الخدمة:
لحماية الخادم ومبدأ أقل الصلاحيات (Least Privilege)، لا تُشغّل تطبيق بايثون بحساب `root` أو `www-data`، بل بحساب مخصص ومجموعته الخاصة:
```bash
sudo useradd -r -s /usr/sbin/nologin -d /var/www/taswoq -U taswoq
```

### ج. التحقق الأمني قبل ضبط جدار الحماية (UFW):
> [!CAUTION]
> **إجراءات حاسمة قبل لمس جدار الحماية:**
> 1. **التحقق من منفذ SSH الفعلي:** لا تفترض أن المنفذ هو 22 دائماً. افحص المنفذ الفعلي الذي تستمع عليه الخدمة حالياً:
>    ```bash
>    sudo ss -tulpn | grep sshd
>    # أو من الإعدادات:
>    grep -i "^Port" /etc/ssh/sshd_config || echo "Port 22 (الافتراضي)"
>    ```
> 2. **التحقق من تفعيل IPv6 في UFW:**
>    تأكد من وجود `IPV6=yes` في ملف إعدادات UFW حتى تُطبّق قواعد نطاقات Cloudflare لـ IPv6 ولا يتم تجاهلها:
>    ```bash
>    grep -i "^IPV6=" /etc/default/ufw
>    # إذا كانت no، عدّلها إلى yes
>    ```
> 3. **إبقاء جلسة بديلة مفتوحة:**
>    أبقِ جلسة الـ SSH الحالية نشطة، وتأكد من توفر وسيلة الوصول البديلة عبر لوحة تحكم مزود الـ VPS (مثل Web Console / VNC / Serial Console) قبل تشغيل الجدار الناري لتفادي قفل الخادم في حال حدوث أي خطأ في أرقام المنافذ.

```bash
# 1. ضبط السياسات الافتراضية
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 2. السماح بمنفذ SSH الفعلي المحقق (مثال: إذا كان 22 أو منفذاً مخصصاً):
ACTUAL_SSH_PORT=22 # استبدل بالقيمة الفعلية الظاهرة من فحص sshd
sudo ufw allow ${ACTUAL_SSH_PORT}/tcp

# 3. السماح بحركة المرور المحلية الداخلية (Loopback):
sudo ufw allow in on lo

# 4. السماح بالمنفذين 80 و 443 من نطاقات Cloudflare الرسمية فقط (IPv4):
for cf_ip in \
  173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 \
  141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 \
  197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 \
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
    sudo ufw allow proto tcp from $cf_ip to any port 80,443
done

# 5. السماح بنطاقات Cloudflare الرسمية (IPv6):
for cf_ip6 in \
  2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 \
  2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32; do
    sudo ufw allow proto tcp from $cf_ip6 to any port 80,443
done

# 6. تفعيل الجدار الناري (فقط بعد التأكد التام من الخطوة 2 والوصول البديل):
sudo ufw enable
```

---

## 3. إعداد PostgreSQL وتعيين كلمة المرور بأمان

> [!CAUTION]
> لا تضع كلمة مرور فعلية في أوامر SQL أو سطر أوامر bash حتى لا تُسجل في سجلات الخادم (`.bash_history` أو سجل استعلامات postgres).

```bash
sudo -u postgres psql
```

نفّذ الاستعلامات التالية داخل `psql`:
```sql
-- 1. إنشاء المستخدم المخصص دون كلمة مرور في نص الاستعلام:
CREATE USER taswoq_user;

-- 2. تعيين كلمة المرور بشكل تفاعلي آمن ومخفي (Interactive Prompt):
\password taswoq_user

-- 3. إنشاء قاعدة بيانات الإنتاج ومنح الصلاحيات:
CREATE DATABASE taswoq_db OWNER taswoq_user ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE taswoq_db TO taswoq_user;
\c taswoq_db
GRANT ALL ON SCHEMA public TO taswoq_user;
\q
```

---

## 4. إعداد ملف البيئة `.env` وهيكل الصلاحيات الصارم

### أ. الصيغة المقبولة، الاقتباس المفرد، وأداة كتابة وتأمين `DATABASE_URL`:
* **قاعدة الاقتباس المفرد في Bash (`source .env`):**
  توضع القيم داخل اقتباس مفرد `KEY='VALUE'` لأن Bash يعامل ما بداخل الاقتباس المفرد كنص حرفي يمنع تفسير الرموز مثل `$` أو `#` أو `&` أو المسافات.
  > [!IMPORTANT]
  > **تنبيه حاسم حول علامة الاقتباس المفردة:**
  > في Bash، **لا يمكن إدراج علامة اقتباس مفردة `'` داخل قيمة مقتبسة باقتباس مفرد دون معالجة خاصة** (مثل كسر النص: `'pass'\''word'`)؛ لأن علامة الاقتباس الأولى ستنهي السلسلة النصية فوراً مسببة خطأ صياغة. يوصى صراحة باختيار كلمة مرور خالية من علامة الاقتباس المفردة `'`.

* **أداة الإدخال المخفي وكتابة وتأمين الرابط المشفر مباشرة:**
  تستخدم الأداة إدخالاً تفاعلياً مخفياً (`getpass`) لا يظهر على الشاشة ولا يُسجل في التاريخ، وتُرمّز كلمة المرور بدقة وفق مواصفات URI القياسية (RFC 3986) عبر `urllib.parse.quote(pwd, safe="")`، وتكتب الرابط مباشرة إلى ملف `.env`، ثم **تضبط فوراً ملكية وصلاحيات الملف المحمية (`root:taswoq` بصلاحية `440`)**، ولا تطبع للمستخدم سوى نتيجة منقّحة (Redacted) تخفي كلمة المرور تماماً:
  ```bash
  # تشغيل أداة إدخال وكتابة وتأمين DATABASE_URL في .env:
  sudo python3 -c "
  import getpass, urllib.parse, os, grp

  # 1. إدخال مخفي تماماً
  pwd = getpass.getpass('أدخل كلمة مرور PostgreSQL لقاعدة الإنتاج: ')
  if not pwd:
      print('خطأ: لم يتم إدخال كلمة مرور.')
      exit(1)

  # 2. ترميز URI القياسي المعتمد (RFC 3986)
  encoded_pwd = urllib.parse.quote(pwd, safe='')
  db_url = f'postgresql://taswoq_user:{encoded_pwd}@127.0.0.1:5432/taswoq_db'

  # 3. تحديث ملف .env مباشرة
  env_path = '/var/www/taswoq/.env'
  lines = []
  if os.path.exists(env_path):
      with open(env_path, 'r', encoding='utf-8') as f:
          lines = f.readlines()

  new_lines = []
  updated = False
  for line in lines:
      if line.startswith('DATABASE_URL='):
          new_lines.append(f'DATABASE_URL=\'{db_url}\'\n')
          updated = True
      else:
          new_lines.append(line)

  if not updated:
      new_lines.append(f'DATABASE_URL=\'{db_url}\'\n')

  with open(env_path, 'w', encoding='utf-8') as f:
      f.writelines(new_lines)

  # 4. ضبط الملكية والصلاحيات الآمنة مباشرة بعد الكتابة:
  # المالك root، والمجموعة taswoq، والصلاحية 440 (قراءة فقط للمجموعة وحظر تام للآخرين)
  taswoq_gid = grp.getgrnam('taswoq').gr_gid
  os.chown(env_path, 0, taswoq_gid)
  os.chmod(env_path, 0o440)

  # 5. عرض النتيجة المنقحة فقط
  redacted = 'postgresql://taswoq_user:********@127.0.0.1:5432/taswoq_db'
  print(f'✅ تم حفظ وتأمين رابط الاتصال بنجاح في .env: {redacted}')
  "
  ```

---

### ب. هيكل الصلاحيات والملكية الدقيق:
لحماية الخادم ومنع حقن الشيفرات أو التعديل على ملفات الكود، تم تصميم الصلاحيات والملكية بالتفصيل الآتي:
1. **مستخدم بايثون (`taswoq`):** عضو في المجموعة المالكة للكود (`taswoq`) ويملك صلاحية **القراءة والتنفيذ فقط وممنوع منعاً باتاً من الكتابة أو التعديل على أي ملف كود**.
2. **ملف الأسرار (`.env`):** قراءة فقط للمجموعة `taswoq` وبدون أي صلاحية كتابة لها، ومحجوب تماماً عن `www-data` وباقي المستخدمين.
3. **خادم Nginx (`www-data`):** يملك إذن العبور (`+x`) لاجتياز المجلد الرئيسي `/var/www/taswoq` والوصول إلى `/var/www/taswoq/public` لقراءة الملفات الثابتة فقط، وهو **محظور تماماً من قراءة ملفات الكود أو ملف `.env`**.

> [!IMPORTANT]
> **اعتماد حزمة النشر المعزولة (Release Bundle) بدلاً من نقل مجلد العمل كاملاً:**
> لمنع نقل أي ملفات غير متتبعة أو أسرار محلية أو كاش أو مفاتيح إلى الخادم، **يُحظر نسخ مجلد العمل كاملاً**.
> بدلاً من ذلك، يتم بناء حزمة أرشيف نظيفة ومستقلة (`taswoq_release.tar.gz`) مبنية **حصراً من الملفات البرمجية المتتبعة في commit المعتمد داخل `Taswoq_Cleaned`**:
>
> 1. **إنشاء حزمة النشر محلياً داخل مجلد `Taswoq_Cleaned`:**
>    ```powershell
>    # إنشاء أرشيف النشر البرمجي المعتمد (يحتوي ملفات الخدمة والبذور ويستثني الأسرار والمفاتيح تلقائياً):
>    git archive --format=tar.gz -o taswoq_release.tar.gz HEAD categories_seed.json server_pg.py db_schema.sql apply_schema_migrations.py create_admin.py migrate_to_postgres.py export_pg_to_json.py requirements.txt nginx-taswoq.conf taswoq.service .env.production.example .env.example admin.html "لوحة_تحكم_الإدارة.html" public
>    ```
> 2. **نقل الحزمة وفكها داخل مسار المشروع على الـ VPS:**
>    ```bash
>    # نقل ملف الأرشيف الفردي فقط إلى الخادم:
>    scp taswoq_release.tar.gz user@vps_ip:/tmp/
>
>    # على خادم الـ VPS: إنشاء المجلد وفك الأرشيف مباشرة:
>    sudo mkdir -p /var/www/taswoq
>    sudo tar -xzf /tmp/taswoq_release.tar.gz -C /var/www/taswoq/
>    rm -f /tmp/taswoq_release.tar.gz
>    ```
> 3. **قواعد الاستثناء والضمانات الأمنية للحزمة:**
>    - **خالية تماماً من `.git`:** أداة `git archive` لا تُضمّن شجرة Git أو التاريخ القديم إطلاقاً.
>    - **خالية من ملفات البيئة الحقيقية:** لا تحتوي على `.env` أو `.env.production` أو أسرار حقيقية، وتقتصر على قوالب الأمثلة (`.env.production.example`).
>    - **خالية من مفاتيح الأندرويد:** لا تحتوي على `taswoq_apk/build/debug.keystore` أو أي مفتاح توقيع.
>    - **خالية من قواعد بيانات JSON القديمة والنسخ الاحتياطية:** لا تحتوي على `taswoq_db.json` أو ملفات `taswoq_db.before_reset_*.json`.
>    - **خالية من حزم APK والملفات المؤقتة:** لا تضم أي ملفات `*.apk` أو مجلدات `__pycache__` أو ملفات مؤقتة.
>    - **تحتوي حصراً:** ملف البذور المعتمد `categories_seed.json` (10 أقسام)، وكود خادم بايثون وقاعدة البيانات PostgreSQL، وملفات الواجهة العامة `public/`، وإعدادات Nginx وخدمة systemd.

> [!CAUTION]
> **تنبيه أمني دقيق حول الروابط الرمزية في البيئة الافتراضية (`venv`):**
> يحتوي مجلد `venv/bin/` على روابط رمزية (Symlinks) مثل `python` و `python3` تشير إلى مفسر النظام الأساسي في `/usr/bin/python3`.
> إذا تم تنفيذ أمر `chmod` عشوائياً أو بدون استثناء الروابط الرمزية، فإن نظام Linux يقوم بتتبع الرابط الرمزي وتغيير صلاحيات مفسر النظام الأساسي `/usr/bin/python3`، مما قد يكسر بايثون لباقي خدمات النظام!
> لذلك يجب:
> 1. استخدام خيار `--no-dereference` (أو `-h`) مع `chown` حتى لا يتم تتبع الروابط الرمزية لمفسر النظام.
> 2. استثناء الروابط الرمزية (`! -type l`) من كافة أوامر `chmod`.

```bash
# 1. إنشاء المجلد الأساسي وفك حزمة النشر:
sudo mkdir -p /var/www/taswoq
sudo tar -xzf /tmp/taswoq_release.tar.gz -C /var/www/taswoq/
rm -f /tmp/taswoq_release.tar.gz

# 2. إنشاء وتأمين البيئة الافتراضية
cd /var/www/taswoq
sudo python3 -m venv venv
sudo ./venv/bin/pip install --upgrade pip
sudo ./venv/bin/pip install -r requirements.txt

# 3. إعداد ملف البيئة
sudo cp .env.production.example .env

# 4. المجلد الرئيسي يملكه root:taswoq بصلاحية 755 ليتمكن www-data من العبور إلى public/:
sudo chown root:taswoq /var/www/taswoq
sudo chmod 755 /var/www/taswoq

# 5. ملكية وصلاحيات البيئة الافتراضية وكود بايثون:
# استخدام --no-dereference لمنع تغيير ملكية الروابط الرمزية لمفسر النظام
sudo chown -R --no-dereference root:taswoq /var/www/taswoq/venv

# ضبط صلاحيات مجلدات venv (قراءة وتنفيذ للمجموعة taswoq)
sudo find /var/www/taswoq/venv -type d -exec chmod 750 {} +

# ضبط الملفات العادية داخل venv (استثناء الروابط الرمزية ! -type l لعدم المساس بمفسر النظام)
sudo find /var/www/taswoq/venv -type f ! -type l -exec chmod 640 {} +

# ضبط السكربتات التنفيذية العادية داخل bin (استثناء الروابط الرمزية ! -type l)
sudo find /var/www/taswoq/venv/bin -type f ! -type l -exec chmod 750 {} +

# ضبط ملفات كود بايثون الرئيسية في المشروع (قراءة فقط للمجموعة taswoq ومحظورة عن www-data)
sudo find /var/www/taswoq -maxdepth 1 -name "*.py" -exec chown root:taswoq {} +
sudo find /var/www/taswoq -maxdepth 1 -name "*.py" -exec chmod 640 {} +

# 6. تأمين ملف الأسرار .env (قراءة فقط للمجموعة taswoq ومحظور عن www-data تماماً):
sudo chown root:taswoq /var/www/taswoq/.env
sudo chmod 440 /var/www/taswoq/.env

# 7. تأمين مجلد الواجهة العامة الثابتة (قراءة فقط لـ www-data وتخديم الويب):
sudo chown -R root:www-data /var/www/taswoq/public
sudo find /var/www/taswoq/public -type d -exec chmod 755 {} +
sudo find /var/www/taswoq/public -type f -exec chmod 644 {} +
```

#### أوامر التحقق الإلزامية من الصلاحيات:
```bash
# 1. التحقق من أن taswoq يستطيع القراءة فقط وممنوع من الكتابة:
sudo -u taswoq test -r /var/www/taswoq/server_pg.py && echo "✅ taswoq: قراءة الكود متاحة"
sudo -u taswoq test -w /var/www/taswoq/server_pg.py && echo "❌ خطأ: taswoq يملك صلاحية كتابة!" || echo "✅ taswoq: كتابة الكود محظورة"

# 2. التحقق من أن www-data يستطيع عبور المجلد وقراءة public فقط ومحظور عن الأسرار والكود:
sudo -u www-data test -r /var/www/taswoq/public/index.html && echo "✅ www-data: قراءة public متاحة"
sudo -u www-data test -r /var/www/taswoq/server_pg.py && echo "❌ خطأ: www-data يستطيع قراءة الكود!" || echo "✅ www-data: قراءة الكود محظورة"
sudo -u www-data test -r /var/www/taswoq/.env && echo "❌ خطأ: www-data يستطيع قراءة .env!" || echo "✅ www-data: قراءة .env محظورة"

# 3. التحقق من أن حساب taswoq يستطيع تشغيل بايثون عبر venv بنجاح:
sudo -u taswoq /var/www/taswoq/venv/bin/python -c "import sys; print('✅ تشغيل بايثون ناجح بحساب taswoq:', sys.version.split()[0])"

# 4. التأكد من بقاء مفسر النظام الأساسي بصلاحياته الأصلية دون مساس:
ls -l /usr/bin/python3
```

---

### ج. تطبيق المخطط الأولي وإنشاء المشرف بطريقة آمنة:
```bash
sudo -u taswoq bash -c "cd /var/www/taswoq && set -a && source .env && set +a && ./venv/bin/python apply_schema_migrations.py"
sudo -u taswoq bash -c "cd /var/www/taswoq && set -a && source .env && set +a && ./venv/bin/python create_admin.py --username admin_master --name 'المدير العام'"
```

---

## 5. استيراد الأقسام العشرة بأمان عبر `categories_seed.json` وسكربت `migrate_to_postgres.py` (مؤجل)

* **الاعتماد على ملف البذور النظيف (`categories_seed.json`) بدلاً من ملفات JSON القديمة:**
  بدلاً من الاعتماد على ملفات JSON المحلية القديمة أو نقلها للخادم، يتم استيراد البيانات الأولية حصراً من ملف البذور المعتمد `categories_seed.json` الذي تم إنشاؤه وتدقيقه في المستودع ويحتوي **حصراً على الأقسام العشرة المنقحة** المطابقة للمتجر:
  1. كل الأقسام (`all`)
  2. أكل صحي (`healthy`)
  3. خضار وفواكه (`fresh`)
  4. لحوم ودواجن (`meat`)
  5. ألبان وأجبان (`dairy`)
  6. مخبوزات وطازج (`bakery`)
  7. حلويات وسناكس (`snacks`)
  8. مشروبات وعصائر (`drinks`)
  9. منتجات (`cat_mvpnfgdtqe2`)
  10. بقالة (`cat_mw7y548f07u`)

* **تشغيل الاستيراد عبر سكربت الترحيل المعتمد:**
  يتم تنفيذ عملية الاستيراد باستخدام سكربت `migrate_to_postgres.py` الذي يقرأ تلقائياً من `categories_seed.json` كمصدر افتراضي وحيد:
  ```bash
  sudo -u taswoq bash -c "cd /var/www/taswoq && set -a && source .env && set +a && ./venv/bin/python migrate_to_postgres.py"
  ```

* **قواعد الأمان الصارمة المدمجة في السكربت:**
  1. **فحص ما قبل الترحيل (Pre-flight Data Inspection):** يفحص السكربت قاعدة بيانات PostgreSQL؛ فإذا وُجدت أي بيانات سابقة أو تعارضات في أي جدول، يتوقف فوراً برمز خروج `1` ويرفض دمج أو استبدال أي بيانات لحماية قاعدة بيانات الإنتاج.
  2. **حظر الرجوع التلقائي لملفات قديمة:** لا يرجع السكربت إلى `taswoq_db.json` إطلاقاً، ويتوقف برسالة خطأ صريحة إذا فُقد ملف البذور `categories_seed.json`.
  3. **أسبقية الوسيط الصريح:** يدعم السكربت `--source <file>` فقط إذا حُدد صراحة في سطر الأوامر، ويرفض أي وسيط فارغ دون الرجوع تلقائياً لأي ملف قديم.
  4. **إدراج آمن دون استبدال:** استخدام `ON CONFLICT (id) DO NOTHING`، مع التدقيق والمطابقة العميقة لكافة الحقول الستة (`id`, `nameAr`, `nameEn`, `icon`, `img`, `isSpecial`) بعد الإدخال.

* **تنبيه:** لا تقم بتشغيل هذا الأمر الآن؛ تبقى الخطوة مؤجلة تماماً حتى توفر قاعدة الإنتاج ومراجعتها.

---

## 6. تفعيل خدمة بايثون التلقائية (`taswoq.service`)

تأكد أن ملف الخدمة مضبوط ليعمل بحساب `taswoq` ومجموعته `taswoq`:
```ini
[Unit]
Description=Taswoq Python Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=taswoq
Group=taswoq
WorkingDirectory=/var/www/taswoq
ExecStart=/var/www/taswoq/venv/bin/python /var/www/taswoq/server_pg.py
Restart=always
RestartSec=5
EnvironmentFile=/var/www/taswoq/.env

[Install]
WantedBy=multi-user.target
```
أوامر التشغيل:
```bash
sudo cp /var/www/taswoq/taswoq.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable taswoq.service
sudo systemctl start taswoq.service
sudo systemctl status taswoq.service
```

---

## 7. ضبط خادم Nginx وفحص الصياغة

1. **التحقق من إصدار Nginx الفعلي على الـ VPS:**
   ```bash
   nginx -v
   ```
   * إذا كان الإصدار **>= 1.19.4**: يدعم التوجيه الحديث `ssl_reject_handshake on;` الموجود افتراضياً في ملف الإعداد `nginx-taswoq.conf` لرفض أي اتصال مباشر على المنفذ 443 دون الحاجة لشهادة وهمية.
   * إذا كان الإصدار **< 1.19.4**: افتح ملف الإعداد وعطّل هذا السطر واستخدم الإعداد التوافقي البديل الموضح في تعليقات الملف (شهادة وهمية مع `return 444`).

2. **تثبيت وفحص الإعداد:**
   ```bash
   sudo cp /var/www/taswoq/nginx-taswoq.conf /etc/nginx/sites-available/taswoq
   sudo nano /etc/nginx/sites-available/taswoq # استبدل <نطاقي> بالنطاق الحقيقي
   sudo ln -s /etc/nginx/sites-available/taswoq /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   ```

3. **فحص الصياغة الإجباري قبل إعادة التشغيل:**
   ```bash
   sudo nginx -t
   ```
   *تأكد من ظهور رسالة: `syntax is ok` و `test is successful`* ثم أعد التشغيل:
   ```bash
   sudo systemctl restart nginx
   ```

---

## 8. توضيح وضع مفاتيح توقيع تطبيق Android والتحقق الفعلي عبر `keytool`

* **الفحص الفعلي للشهادة الحالية عبر أداة `keytool`:**
  عند فحص مخزن المفاتيح الفعلي للمشروع عبر الأمر:
  ```bash
  keytool -list -v -keystore taswoq_apk/build/debug.keystore -storepass android
  ```
  أظهرت البيانات الرسمية للشهادة ما يلي:
  * **الاسم المستعار (Alias):** `androiddebugkey`
  * **المالك والمصدر:** `CN=Taswoq, O=Taswoq, C=YE`
  * **كلمة مرور المخزن:** تم التحقق منها تجريبياً وهي `android`.
  * **تاريخ الإنشاء:** `23 Oct 2026`
  * **تاريخ انتهاء الصلاحية الفعلي:** **`10 Mar 2054`** (صالحة حتى 10 مارس 2054).
  * **بصمة SHA256:** `49:96:D2:37:F9:81:50:61:04:34:84:C5:84:34:11:C3:B3:08:D5:B5:1B:3E:CE:FF:5A:EA:9E:B1:1A:A4:41:5A`

> [!WARNING]
> **التوافق مع إرشادات Android الرسمية:**
> * وفقاً لإرشادات توقيع تطبيقات أندرويد الرسمية (Google Android Security Guidelines)، فإن مفتاح `debug.keystore` هو مفتاح تطوير مخصص للاختبار والتجربة؛ وهو **غير مناسب وغير معتمد للتوزيع العام أو النشر التجاري في المتاجر الرسمية**؛ وذلك نظراً لأن مخزن المفاتيح مخزن ضمن مجلد التطوير في المستودع بدلاً من حفظه في خزنة مفاتيح إنتاجية مخصصة (Production Key Vault).
> * الممارسة القياسية للتوزيع العام هي إنشاء مفتاح إصدار رسمي مخصص ومحمي (`release.keystore`) بكلمة مرور قوية خاصة بك.
> * **أثر تغيير المفتاح على النسخ المثبتة حالياً:**
>   إذا تم الانتقال إلى مفتاح إصدار جديد (`release.keystore`)، فلن يتمكن أي هاتف قام بتثبيت النسخة الحالية من تثبيت التحديث فوقها مباشرة (`Signatures mismatch`)، وسيرفض نظام أندرويد التحديث ويطلب حذف النسخة القديمة بالكامل أولاً، مما يتسبب في **مسح قاعدة بيانات الهاتف المحلية (IndexedDB/LocalStorage) وفقدان سلة المشتريات والبيانات المحلية المخزنة**.
> * **الالتزام:** لا تقم بإنشاء أي مفتاح جديد أو استبدال المفتاح الحالي أو بناء أي حزمة APK حالياً.

---

## 9. بناء النسخة الإنتاجية (`taswoq_cloud.apk`) عند توفر النطاق

عند اكتمال ربط خادم الـ VPS وتوفير النطاق الفعلي:
1. استبدل `https://<نطاقي>` بالنطاق الفعلي في:
   * [`taswoq_apk/src/com/taswoq/app/MainActivity.java`](file:///C:/Users/AlparatY/Desktop/Taswoq/taswoq_apk/src/com/taswoq/app/MainActivity.java)
   * [`taswoq_apk/assets/index.html`](file:///C:/Users/AlparatY/Desktop/Taswoq/taswoq_apk/assets/index.html)
2. نفّذ أمر البناء في بيئة Windows:
   ```powershell
   cd taswoq_apk
   .\build_apk.ps1
   ```
   *سينتج ملف مستقل باسم `taswoq_cloud.apk` دون مساس بملف `taswoq.apk` الأصلي المحفوظ.*

---

## 10. إقرار ختامي
> [!IMPORTANT]
> **ملاحظة ختامية صريحة:**
> كافة التجهيزات الحالية هي تعديلات وتحسينات مصدرية محلية خضعت لاختبارات في الذاكرة (In-Memory Unit Tests) فقط. **هذا الإعداد المحلي لم يثبت اتصال PostgreSQL أو خادم VPS فعلياً**، وتبقى كافة خطوات إنشاء قاعدة بيانات الإنتاج، وتشغيل الترحيل، وتفعيل UFW، وتغيير DNS، والنشر السحابي خطوات يدوية مؤجلة إلى حين مراجعتك وتوفير الخادم والنطاق.
