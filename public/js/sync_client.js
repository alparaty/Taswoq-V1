/**
 * Taswoq Realtime Sync Client (مكتبة مزامنة تسوق مع الخادم المحلي)
 * Synchronizes Mobile App (APK) & Web Admin Dashboard with local/network server
 */

(function (window) {
  'use strict';

  // Production and Local Endpoints configuration
  const PRODUCTION_SERVER_URL = 'https://<نطاقي>';
  const DEFAULT_DEV_LOCAL_IP = '127.0.0.1';
  const DEFAULT_DEV_PORT = 8080;

  function isLoopbackHost(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.startsWith('127.');
  }

  function isLocalhost() {
    if (typeof window === 'undefined' || !window.location) return false;
    return isLoopbackHost(window.location.hostname);
  }

  function getDefaultServerUrl() {
    // 1. في المتصفح: الاعتماد التلقائي على أصل النطاق الحالي (Same-Origin عبر HTTPS أو HTTP)
    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
    // 2. في تطبيق الهاتف أو بيئة العميل الخارجية: التوجيه لنطاق الإنتاج الافتراضي
    return PRODUCTION_SERVER_URL;
  }

  function getInitialServerUrl() {
    const isBrowserWeb = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http'));
    // صفحات الويب تستخدم API من نفس الأصل حتى تبقى الجلسات وCookies وCSRF ضمن النطاق نفسه.
    // لا نحذف القيمة القديمة من localStorage؛ نتجاهلها فقط في المتصفح، مع إبقاء إعداد تطبيق الهاتف أدناه.
    if (isBrowserWeb) return window.location.origin;
    try {
      const saved = localStorage.getItem('taswoq_server_url');
      if (saved && typeof saved === 'string' && saved.trim()) {
        return saved.trim().replace(/\/+$/, '');
      }
    } catch (e) { }
    return getDefaultServerUrl();
  }

  const TaswoqSync = {
    _serverUrl: getInitialServerUrl(),
    _backendInfo: null,
    _csrfToken: '',
    _isOnline: false,
    _pollTimer: null,
    _lastOrderId: 0,
    _listeners: [],
    _systemGeneration: null,
    _generationRefreshInFlight: false,

    getSystemGeneration: function () {
      if (Number.isInteger(this._systemGeneration) && this._systemGeneration > 0) return this._systemGeneration;
      try {
        const stored = Number(localStorage.getItem('taswoq_system_generation'));
        if (Number.isInteger(stored) && stored > 0) {
          this._systemGeneration = stored;
          return stored;
        }
      } catch (e) {}
      return null;
    },

    setSystemGeneration: function (generation) {
      const parsed = Number(generation);
      if (!Number.isInteger(parsed) || parsed < 1) return null;
      this._systemGeneration = parsed;
      try { localStorage.setItem('taswoq_system_generation', String(parsed)); } catch (e) {}
      return parsed;
    },

    hasLegacyLocalData: function () {
      const keep = new Set(['taswoq_server_url','taswoq_device_uuid','taswoq_location_perm','tasweeq_theme','tasweeq_lang','tasweeq_sfx_enabled']);
      try {
        for (let i=0;i<localStorage.length;i++) {
          const key=localStorage.key(i);
          if (key && !keep.has(key) && (key.startsWith('tasweeq_') || key.startsWith('taswoq_') || key.startsWith('khudair_'))) return true;
        }
      } catch (e) {}
      return false;
    },

    clearGenerationScopedState: function () {
      const keep = new Set(['taswoq_server_url','taswoq_device_uuid','taswoq_location_perm','tasweeq_theme','tasweeq_lang','tasweeq_sfx_enabled']);
      try {
        for (let i=localStorage.length-1;i>=0;i--) {
          const key=localStorage.key(i);
          if (key && !keep.has(key) && (key.startsWith('tasweeq_') || key.startsWith('taswoq_') || key.startsWith('khudair_'))) localStorage.removeItem(key);
        }
        localStorage.removeItem('taswoq_system_generation');
      } catch (e) {}
      try {
        for (let i=sessionStorage.length-1;i>=0;i--) {
          const key=sessionStorage.key(i);
          if (key && (key.startsWith('tasweeq_') || key.startsWith('taswoq_') || key.startsWith('khudair_'))) sessionStorage.removeItem(key);
        }
      } catch (e) {}
      this._csrfToken = '';
      this._systemGeneration = null;
    },

    completeSystemReset: function (generation) {
      this.clearGenerationScopedState();
      return this.setSystemGeneration(generation);
    },

    handleGenerationError: function (payload) {
      if (this._generationRefreshInFlight) return;
      this._generationRefreshInFlight = true;
      (async () => {
        try {
          const freshData = await this.syncDown();
          if (freshData && freshData.success && typeof window !== 'undefined') {
            this.clearGenerationScopedState();
            this.setSystemGeneration(freshData.systemGeneration);
            window.dispatchEvent(new CustomEvent('taswoq:system-generation-updated', {
              detail: {
                data: freshData,
                resetDetected: !!(payload && (payload.code === 'GENERATION_MISMATCH' || Number(payload.currentGeneration) > 1))
              }
            }));
          }
        } catch (e) {
          console.warn('[TaswoqSync] generation refresh failed:', e && e.message ? e.message : e);
        } finally {
          this._generationRefreshInFlight = false;
        }
      })();
    },

    getAuthHeaders: function (extraHeaders = {}) {
      const headers = { 'Content-Type': 'application/json', ...extraHeaders };
      const token = this.getCsrfToken();
      if (token) {
        headers['X-CSRF-Token'] = token;
      }
      const generation = this.getSystemGeneration();
      if (generation != null) headers['X-System-Generation'] = String(generation);
      return headers;
    },

    setCsrfToken: function (token) {
      this._csrfToken = token || '';
      try {
        if (token) {
          sessionStorage.setItem('taswoq_csrf_token', token);
        } else {
          sessionStorage.removeItem('taswoq_csrf_token');
        }
      } catch (e) { }
    },

    getCsrfToken: function () {
      if (this._csrfToken) return this._csrfToken;
      try {
        const stored = sessionStorage.getItem('taswoq_csrf_token');
        if (stored) {
          this._csrfToken = stored;
          return stored;
        }
      } catch (e) { }
      return '';
    },

    login: async function (username, password, targetRole = "") {
      try {
        let endpoint = `${this._serverUrl}/api/auth/login`;
        if (targetRole === 'admin') endpoint = `${this._serverUrl}/api/auth/admin/login`;
        else if (targetRole === 'employee') endpoint = `${this._serverUrl}/api/auth/employee/login`;

        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, targetRole })
        });
        const data = await res.json();
        if (res.ok && data && data.success) {
          this.setCsrfToken(data.csrfToken || '');
          this.notifyListeners('auth_success', data);
          return { success: true, user: data.user, role: data.role, redirect: data.redirect, csrfToken: data.csrfToken };
        }
        return { success: false, error: (data && data.error) || 'فشل تسجيل الدخول' };
      } catch (err) {
        return { success: false, error: 'تعذر الاتصال بالخادم: ' + err.message };
      }
    },

    logout: async function () {
      try {
        await fetch(`${this._serverUrl}/api/auth/logout`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
      } catch (e) { }
      this.setCsrfToken('');
      try {
        sessionStorage.removeItem('taswoq_csrf_token');
      } catch (e) { }
      this.notifyListeners('auth_logout', {});
      return { success: true };
    },

    checkAuth: async function () {
      try {
        const authBaseUrl = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http'))
          ? window.location.origin
          : this._serverUrl;
        const res = await fetch(`${authBaseUrl}/api/auth/me`, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.user) {
            if (data.csrfToken) {
              this.setCsrfToken(data.csrfToken);
            }
            return { authenticated: true, user: data.user, role: data.role, redirect: data.redirect, csrfToken: data.csrfToken };
          }
        }
      } catch (e) { }
      this.setCsrfToken('');
      return { authenticated: false };
    },

    getServerUrl: function () {
      return this._serverUrl;
    },

    setServerUrl: function (url) {
      if (!url) url = getDefaultServerUrl();
      url = url.trim().replace(/\/+$/, '');
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
      }
      this._serverUrl = url;
      localStorage.setItem('taswoq_server_url', url);
      this.notifyListeners('server_url_changed', url);
      return url;
    },

    addListener: function (callback) {
      if (typeof callback === 'function') {
        this._listeners.push(callback);
      }
    },

    notifyListeners: function (event, data) {
      this._listeners.forEach(fn => {
        try { fn(event, data); } catch (e) { console.error('[Sync Listener Error]', e); }
      });
    },

    checkConnection: async function () {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`${this._serverUrl}/api/info`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const info = await res.json();
          const latency = Date.now() - startTime;
          this._isOnline = true;
          this._backendInfo = {
            backend: info.backend || (info.isLocalTest ? 'local_test_json' : 'postgresql'),
            storageType: info.storageType || (info.backend === 'postgresql' ? 'قاعدة بيانات PostgreSQL المشتركة' : 'بيانات اختبار محلية معزولة (JSON)'),
            isLocalTest: Boolean(info.isLocalTest),
            serverMode: info.serverMode || ''
          };
          this.notifyListeners('status_change', { online: true, latency, info, backendInfo: this._backendInfo });
          return { online: true, latency, info, backendInfo: this._backendInfo };
        }
      } catch (err) {
        // Fallback: if localhost failed and we are in browser, try machine IP, or vice versa
      }

      this._isOnline = false;
      this.notifyListeners('status_change', { online: false, error: 'Connection failed' });
      return { online: false, latency: null, info: null };
    },

    getBackendInfo: function () {
      return this._backendInfo || null;
    },

    /**
     * Download latest data from server to local state
     */
    syncDown: async function (role = "") {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const isAdmin = (typeof state !== 'undefined' && state.viewMode === 'admin')
          || (typeof window !== 'undefined' && (window.location.pathname.includes('admin') || decodeURI(window.location.pathname).includes('الإدارة') || document.querySelector('.admin-sidebar') || document.getElementById('admin-sync-widget')));
        const effectiveRole = role || (isAdmin ? 'admin' : 'customer');
        const curDev = (!isAdmin && typeof getAppDeviceId === 'function') ? getAppDeviceId() : (localStorage.getItem('taswoq_device_uuid') || '');

        const url = `${this._serverUrl}/api/sync?role=${encodeURIComponent(effectiveRole)}&deviceId=${encodeURIComponent(curDev)}`;
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data && data.success) {
          this._isOnline = true;
          if (data.backend || data.storageType || typeof data.isLocalTest !== 'undefined') {
            this._backendInfo = {
              backend: data.backend || (data.isLocalTest ? 'local_test_json' : 'postgresql'),
              storageType: data.storageType || (data.backend === 'postgresql' ? 'قاعدة بيانات PostgreSQL المشتركة' : 'بيانات اختبار محلية معزولة (JSON)'),
              isLocalTest: Boolean(data.isLocalTest),
              serverMode: data.serverMode || ''
            };
          }
          const serverGeneration = Number(data.systemGeneration);
          if (Number.isInteger(serverGeneration) && serverGeneration > 0) {
            const previousGeneration = this.getSystemGeneration();
            const legacyCacheExists = previousGeneration == null && this.hasLegacyLocalData();
            const generationChanged = (previousGeneration != null && previousGeneration !== serverGeneration) || legacyCacheExists;
            const resetDetected = serverGeneration > 1 && previousGeneration !== serverGeneration;
            if (generationChanged) this.clearGenerationScopedState();
            this.setSystemGeneration(serverGeneration);
            if (generationChanged && !this._generationRefreshInFlight) {
              window.dispatchEvent(new CustomEvent('taswoq:system-generation-updated', {
                detail: { data, resetDetected }
              }));
            }
          }
          if (Array.isArray(data.orders) && data.orders.length > 0) {
            const maxId = Math.max(0, ...data.orders.map(o => parseInt(o.id || 0) || 0));
            if (maxId > this._lastOrderId) {
              this._lastOrderId = maxId;
            }
          }
          this.notifyListeners('data_synced', data);
          if (!this._generationRefreshInFlight && typeof this.flushPendingOrderStatusUpdates === 'function') {
            await this.flushPendingOrderStatusUpdates().catch(() => {});
          }
          return data;
        }
      } catch (err) {
        console.warn('[TaswoqSync] syncDown offline / fallback to local storage:', err.message);
      }
      return null;
    },

    /**
     * Upload whole or partial state from admin
     */
    syncUp: async function (statePayload) {
      try {
        const res = await fetch(`${this._serverUrl}/api/sync`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(statePayload)
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TaswoqSync] syncUp failed:', err.message);
      }
      return null;
    },

    /**
     * Mobile App submits order to Server (مع دعم عدم تكرار الطلب الذري Idempotency)
     */
    sendOrder: async function (orderData) {
      try {
        if (!orderData || typeof orderData !== 'object') return null;

        // توليد وتثبيت معرف فريد (UUID / clientOrderId) لكل طلب لحمايته من التكرار عند إعادة المحاولة
        if (!orderData.clientOrderId) {
          orderData.clientOrderId = 'CLI-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10) + '-' + Math.random().toString(36).substring(2, 6);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(`${this._serverUrl}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          return { success: false, conflict: true, error: (errData && errData.error) || 'تعارض في مفتاح الطلب' };
        }

        if (res.ok) {
          const result = await res.json();
          // حفظ رمز تتبع الطلب السري لمرة واحدة في جهاز العميل
          if (result && result.orderId && result.orderToken) {
            try {
              const tokens = JSON.parse(localStorage.getItem('taswoq_order_tokens') || '{}');
              tokens[result.orderId] = result.orderToken;
              localStorage.setItem('taswoq_order_tokens', JSON.stringify(tokens));
            } catch (e) { }
          }
          this.notifyListeners('order_sent', result.order || result);
          return result;
        }
      } catch (err) {
        console.warn('[TaswoqSync] sendOrder offline:', err.message);
      }
      return null;
    },

    /**
     * استعلام العميل عن حالة طلبه بأمان عبر رقم الطلب والرمز السري
     */
    trackOrder: async function (orderId, orderToken) {
      try {
        let token = orderToken;
        if (!token && typeof localStorage !== 'undefined') {
          const tokens = JSON.parse(localStorage.getItem('taswoq_order_tokens') || '{}');
          token = tokens[orderId];
        }
        if (!token) return null;
        const res = await fetch(`${this._serverUrl}/api/orders/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: parseInt(orderId, 10), orderToken: token })
        });
        if (res.ok) {
          const data = await res.json();
          return data.order || null;
        }
      } catch (err) {
        console.warn('[TaswoqSync] trackOrder error:', err.message);
      }
      return null;
    },

    /**
     * Mobile App submits complaint
     */
    sendComplaint: async function (complaintData) {
      try {
        const res = await fetch(`${this._serverUrl}/api/complaints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(complaintData)
        });
        if (res.ok) {
          const result = await res.json();
          this.notifyListeners('complaint_sent', result);
          return result;
        }
      } catch (err) {
        console.warn('[TaswoqSync] sendComplaint offline:', err.message);
      }
      return null;
    },

    updateComplaint: async function (complaintId, updates) {
      try {
        const res = await fetch(`${this._serverUrl}/api/complaints/${encodeURIComponent(complaintId)}`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(updates)
        });
        if (res.ok) {
          const result = await res.json();
          this.notifyListeners('complaint_updated', result);
          return result;
        }
      } catch (err) {
        console.warn('[TaswoqSync] updateComplaint offline:', err.message);
      }
      return null;
    },

    deleteComplaint: async function (complaintId) {
      try {
        const res = await fetch(`${this._serverUrl}/api/complaints/${encodeURIComponent(complaintId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        if (res.ok) {
          const result = await res.json();
          this.notifyListeners('complaint_deleted', result);
          return result;
        }
      } catch (err) {
        console.warn('[TaswoqSync] deleteComplaint offline:', err.message);
      }
      return null;
    },

    /**
     * Admin adds or updates product
     */
    updateProductQuick: async function (productId, data) {
      try {
        const res = await fetch(`${this._serverUrl}/api/products/${productId}`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(data)
        });
        const resData = await res.json().catch(() => null);
        if (res.ok && resData && resData.success !== false) return resData;
        return { success: false, error: (resData && resData.error) || `فشل تعديل المنتج (${res.status})`, status: res.status };
      } catch (err) {
        console.warn('[TaswoqSync] updateProductQuick offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },
    saveProduct: async function (product, isEdit = false) {
      try {
        const prodId = product && product.id;
        const endpoint = (isEdit && prodId) ? `${this._serverUrl}/api/products/${prodId}` : `${this._serverUrl}/api/products`;
        const method = isEdit ? 'PUT' : 'POST';
        const res = await fetch(endpoint, {
          method: method,
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(product)
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success !== false) {
          this.notifyListeners('product_saved', data);
          return { success: true, ...data };
        }
        return {
          success: false,
          error: (data && data.error) || `فشل حفظ المنتج في الخادم (رمز الخطأ: ${res.status})`,
          status: res.status
        };
      } catch (err) {
        console.warn('[TaswoqSync] saveProduct offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },

    /**
     * Admin deletes product
     */
    deleteProduct: async function (productId) {
      try {
        const res = await fetch(`${this._serverUrl}/api/products/${productId}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success !== false) {
          this.notifyListeners('product_deleted', data);
          return { success: true, ...data };
        }
        return {
          success: false,
          error: (data && data.error) || `فشل حذف المنتج من الخادم (رمز الخطأ: ${res.status})`,
          status: res.status
        };
      } catch (err) {
        console.warn('[TaswoqSync] deleteProduct offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },

    /**
     * Admin adds or updates category
     */
    saveCategory: async function (category) {
      try {
        const res = await fetch(`${this._serverUrl}/api/categories`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(category)
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success !== false) {
          this.notifyListeners('category_saved', data);
          return { success: true, ...data };
        }
        return {
          success: false,
          error: (data && data.error) || `فشل حفظ القسم في الخادم (رمز الخطأ: ${res.status})`,
          status: res.status
        };
      } catch (err) {
        console.warn('[TaswoqSync] saveCategory offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },

    /**
     * Admin deletes category
     */
    deleteCategory: async function (categoryId) {
      try {
        const res = await fetch(`${this._serverUrl}/api/categories/${encodeURIComponent(categoryId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success !== false) {
          this.notifyListeners('category_deleted', data);
          return { success: true, ...data };
        }
        return {
          success: false,
          error: (data && data.error) || `فشل حذف القسم من الخادم (رمز الخطأ: ${res.status})`,
          status: res.status
        };
      } catch (err) {
        console.warn('[TaswoqSync] deleteCategory offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },

    /**
     * Operational Expenses API methods
     */
    getExpenses: async function () {
      try {
        const res = await fetch(`${this._serverUrl}/api/expenses`, {
          method: 'GET',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          cache: 'no-store'
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success !== false) {
          return data.expenses || [];
        }
      } catch (err) {
        console.warn('[TaswoqSync] getExpenses offline:', err.message);
      }
      return null;
    },

    saveExpense: async function (expenseData) {
      try {
        const res = await fetch(`${this._serverUrl}/api/expenses`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(expenseData)
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success) {
          return data;
        }
        return {
          success: false,
          error: (data && data.error) || `فشل تسجيل المصروف في الخادم (رمز الخطأ: ${res.status})`,
          status: res.status
        };
      } catch (err) {
        console.warn('[TaswoqSync] saveExpense offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },

    deleteExpense: async function (expenseId) {
      try {
        const res = await fetch(`${this._serverUrl}/api/expenses/${encodeURIComponent(expenseId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success) {
          return data;
        }
        return {
          success: false,
          error: (data && data.error) || `فشل حذف المصروف من الخادم (رمز الخطأ: ${res.status})`,
          status: res.status
        };
      } catch (err) {
        console.warn('[TaswoqSync] deleteExpense offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },

    /**
     * Admin broadcasts notification to Mobile APKs
     */
    sendNotification: async function (notifData) {
      try {
        const payload = { ...notifData };
        if (!payload.logo) {
          payload.logo = '/assets/images/taswoq_logo.png';
        }
        const res = await fetch(`${this._serverUrl}/api/notifications`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const result = await res.json();
          this.notifyListeners('notification_sent', result);
          return result;
        }
      } catch (err) {
        console.warn('[TaswoqSync] sendNotification offline:', err.message);
      }
      return null;
    },

    /**
     * Fetch all users/staff from PostgreSQL
     */
    fetchUsers: async function () {
      try {
        const res = await fetch(`${this._serverUrl}/api/users`, {
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success && Array.isArray(data.users)) {
          return data.users;
        }
      } catch (err) {
        console.warn('[TaswoqSync] fetchUsers offline/failed:', err.message);
      }
      return null;
    },

    /**
     * Get notifications
     */
    getNotifications: async function (sinceTime = 0) {
      try {
        const res = await fetch(`${this._serverUrl}/api/notifications?since_time=${sinceTime}`, {
          headers: this.getAuthHeaders(),
          cache: 'no-store'
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('[TaswoqSync] getNotifications offline:', err.message);
      }
      return null;
    },

    /**
     * Admin updates order status with credentials & error propagation
     */
    updateOrderStatus: async function (orderId, status, notes) {
      try {
        const res = await fetch(`${this._serverUrl}/api/orders/${orderId}`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ status, notes })
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success) {
          return data;
        }
        return {
          success: false,
          error: (data && data.error) || `فشل حفظ الحالة في الخادم (رمز الخطأ: ${res.status})`,
          status: res.status
        };
      } catch (err) {
        console.warn('[TaswoqSync] updateOrderStatus offline:', err.message);
        return { success: false, offline: true, error: err.message };
      }
    },

    /**
     * Queue order status update when offline
     * Bound to current serverUrl & systemGeneration
     */
    queueOfflineOrderStatus: function (orderId, status, notes) {
      try {
        const key = 'taswoq_pending_order_status_sync';
        const raw = localStorage.getItem(key);
        const queue = raw ? JSON.parse(raw) : [];
        const existingIdx = queue.findIndex(q => String(q.orderId) === String(orderId));
        const item = {
          orderId,
          status,
          notes,
          serverUrl: this._serverUrl,
          systemGeneration: this.getSystemGeneration(),
          timestamp: Date.now()
        };
        if (existingIdx >= 0) queue[existingIdx] = item;
        else queue.push(item);
        localStorage.setItem(key, JSON.stringify(queue));
      } catch (e) {
        console.warn('[TaswoqSync] queueOfflineOrderStatus failed:', e);
      }
    },

    /**
     * Flush queued offline order status updates
     * Strictly scoped to current serverUrl and systemGeneration
     */
    flushPendingOrderStatusUpdates: async function () {
      try {
        const key = 'taswoq_pending_order_status_sync';
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (!Array.isArray(queue) || queue.length === 0) return;

        const currentServer = this._serverUrl;
        const currentGen = this.getSystemGeneration();
        const remaining = [];
        for (const item of queue) {
          // Scoping: Never send offline actions created for another server/environment
          if (item.serverUrl && item.serverUrl !== currentServer) {
            remaining.push(item);
            continue;
          }
          // Scoping: Stale offline actions created under a previous system generation must be discarded
          if (item.systemGeneration != null && currentGen != null && item.systemGeneration !== currentGen) {
            console.warn(`[TaswoqSync] Discarding offline update for order #${item.orderId} due to system generation change (${item.systemGeneration} vs ${currentGen})`);
            continue;
          }

          const res = await this.updateOrderStatus(item.orderId, item.status, item.notes);
          if (!res || !res.success) {
            remaining.push(item);
          } else {
            console.log(`[TaswoqSync] Flushed offline update for order #${item.orderId} -> ${item.status}`);
          }
        }
        if (remaining.length > 0) {
          localStorage.setItem(key, JSON.stringify(remaining));
        } else {
          localStorage.removeItem(key);
        }
      } catch (e) {
        console.warn('[TaswoqSync] flushPendingOrderStatusUpdates failed:', e);
      }
    },

    /**
     * Delivery Settings & Zones REST API methods
     */
    getDeliverySettings: async function () {
      try {
        const res = await fetch(`${this._serverUrl}/api/delivery-settings`, {
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('[TaswoqSync] getDeliverySettings failed:', err.message);
      }
      return null;
    },

    saveDeliverySettings: async function (settings) {
      try {
        const res = await fetch(`${this._serverUrl}/api/delivery-settings`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(settings)
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('[TaswoqSync] saveDeliverySettings failed:', err.message);
      }
      return null;
    },

    getDeliveryZones: async function () {
      try {
        const res = await fetch(`${this._serverUrl}/api/delivery-zones`, {
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('[TaswoqSync] getDeliveryZones failed:', err.message);
      }
      return null;
    },

    saveDeliveryZone: async function (zone) {
      try {
        const res = await fetch(`${this._serverUrl}/api/delivery-zones`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(zone)
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('[TaswoqSync] saveDeliveryZone failed:', err.message);
      }
      return null;
    },

    updateDeliveryZoneQuick: async function (zoneId, updates) {
      try {
        const res = await fetch(`${this._serverUrl}/api/delivery-zones/${zoneId}`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(updates)
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('[TaswoqSync] updateDeliveryZoneQuick failed:', err.message);
      }
      return null;
    },

    deleteDeliveryZone: async function (zoneId) {
      try {
        const res = await fetch(`${this._serverUrl}/api/delivery-zones/${zoneId}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: this.getAuthHeaders()
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('[TaswoqSync] deleteDeliveryZone failed:', err.message);
      }
      return null;
    },

    saveApprovedDelegate: async function (delegateId) {
      try {
        const res = await fetch(`${this._serverUrl}/api/approved-delegate`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ id: delegateId, delegateId: delegateId })
        });
        if (res.ok) {
          const result = await res.json();
          this.notifyListeners('delegate_saved', result);
          return result;
        }
      } catch (err) {
        console.warn('[TaswoqSync] saveApprovedDelegate offline:', err.message);
      }
      return null;
    },

    /**
     * Polling for new orders & complaints (Admin Dashboard Realtime Alert)
     */
    startPollingOrders: function (onNewOrders, onNewComplaints) {
      if (this._pollTimer) clearInterval(this._pollTimer);

      let lastCompCount = -1;

      const poll = async () => {
        try {
          const lastOId = this._lastOrderId || 0;
          const lastCId = this._lastComplaintId || 0;
          const res = await fetch(`${this._serverUrl}/api/poll?role=admin&since_order_id=${lastOId}&since_complaint_id=${lastCId}`, {
            credentials: 'same-origin',
            cache: 'no-store'
          });
          if (res.ok) {
            const data = await res.json();
            if (!data) return;

            // 1. Handle New Orders
            if (data.newOrders && data.newOrders.length > 0) {
              const maxId = Math.max(...data.newOrders.map(o => parseInt(o.id || 0)));
              if (maxId > this._lastOrderId) {
                this._lastOrderId = maxId;
              }
              if (typeof onNewOrders === 'function') {
                onNewOrders(data.newOrders);
              }
            }

            // 2. Handle Complaints
            const compsChanged = (data.totalComplaints !== undefined && lastCompCount !== -1 && data.totalComplaints !== lastCompCount);
            if (lastCompCount === -1 && data.totalComplaints !== undefined) {
              lastCompCount = data.totalComplaints;
            }

            if ((data.newComplaints && data.newComplaints.length > 0) || compsChanged) {
              if (data.totalComplaints !== undefined) lastCompCount = data.totalComplaints;
              if (data.newComplaints && data.newComplaints.length > 0) {
                const maxCId = Math.max(...data.newComplaints.map(c => parseInt(c.id || 0)));
                if (maxCId > (this._lastComplaintId || 0)) {
                  this._lastComplaintId = maxCId;
                }
              }
              if (Array.isArray(data.complaints) && typeof window.handleIncomingAdminComplaints === 'function') {
                window.handleIncomingAdminComplaints(data.complaints);
              } else if (typeof onNewComplaints === 'function' && data.newComplaints) {
                onNewComplaints(data.newComplaints);
              }
            }
          }
        } catch (e) {
          // Quiet offline poll
        }
      };

      poll();
      this._pollTimer = setInterval(poll, 2500);
    },

    /**
     * Mobile App Polling: listens for catalog changes & broadcast notifications
     */
    startMobilePolling: function (onCatalogUpdate, onNewNotification) {
      if (this._pollTimer) clearInterval(this._pollTimer);

      let lastCatalogTime = 1;
      let lastNotifTime = Date.now();
      let lastOrderCount = -1;

      const poll = async () => {
        try {
          const res = await fetch(`${this._serverUrl}/api/poll?since_notif_time=${lastNotifTime}&since_catalog_time=${lastCatalogTime}`, {
            cache: 'no-store'
          });
          if (res.ok) {
            const data = await res.json();
            if (!data) return;

            const ordersChanged = (data.totalOrders !== undefined && lastOrderCount !== -1 && data.totalOrders !== lastOrderCount);
            if (lastOrderCount === -1 && data.totalOrders !== undefined) {
              lastOrderCount = data.totalOrders;
            }

            // 1. Check if catalog (products/categories/banners) or orders were updated
            if (data.catalogUpdated || ordersChanged) {
              lastCatalogTime = data.lastUpdated || Date.now();
              if (data.totalOrders !== undefined) lastOrderCount = data.totalOrders;
              // Fetch full latest state
              const fullData = await this.syncDown();
              if (fullData && typeof onCatalogUpdate === 'function') {
                onCatalogUpdate(fullData);
              }
            }

            // 2. Check if new broadcast notifications arrived
            if (data.newNotifications && data.newNotifications.length > 0) {
              const maxTime = Math.max(...data.newNotifications.map(n => parseInt(n.timestamp || 0)));
              if (maxTime > lastNotifTime) {
                lastNotifTime = maxTime;
              }
              if (typeof onNewNotification === 'function') {
                onNewNotification(data.newNotifications);
              }
            }
          }
        } catch (e) {
          // Quiet offline poll
        }
      };

      // Run poll every 3 seconds
      this._pollTimer = setInterval(poll, 3000);
    },

    stopPolling: function () {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    }
  };

  window.TaswoqSync = TaswoqSync;

  // Add the server-issued generation to every mutating API request to this server.
  if (!window.__taswoqGenerationFetchInstalled && typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const options = init ? { ...init } : {};
      const inputUrl = (typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL)) ? String(input) : input.url;
      const method = String(options.method || (input && input.method) || 'GET').toUpperCase();
      const isMutation = ['POST','PUT','PATCH','DELETE'].includes(method);
      let requestUrl, isServerApi = false, isExempt = false;
      try {
        requestUrl = new URL(inputUrl, window.location.href);
        const serverOrigin = new URL(TaswoqSync._serverUrl, window.location.href).origin;
        isServerApi = requestUrl.origin === serverOrigin && requestUrl.pathname.startsWith('/api/');
        isExempt = requestUrl.pathname.startsWith('/api/auth/') || requestUrl.pathname === '/api/orders/track';
      } catch (error) {
        return originalFetch(input, options);
      }
      if (TaswoqSync._generationRefreshInFlight && isMutation && isServerApi && !isExempt) {
        return new Response(JSON.stringify({ success:false, error:'يجري تحديث بيانات الجهاز بعد تهيئة النظام', code:'GENERATION_REFRESH_IN_PROGRESS' }), { status:409, headers:{'Content-Type':'application/json'} });
      }
      if (isMutation && isServerApi && !isExempt) {
        const generation = TaswoqSync.getSystemGeneration();
        const sourceHeaders = options.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
        const headers = new Headers(sourceHeaders);
        if (generation != null) headers.set('X-System-Generation', String(generation));
        options.headers = headers;
      }
      const response = await originalFetch(input, options);
      if (isMutation && isServerApi && [409,428].includes(response.status)) {
        const problem = await response.clone().json().catch(() => null);
        if (problem && ['GENERATION_MISMATCH','SYSTEM_GENERATION_REQUIRED'].includes(problem.code)) {
          TaswoqSync.handleGenerationError(problem);
        }
      }
      return response;
    };
    window.__taswoqGenerationFetchInstalled = true;
  }

})(typeof window !== 'undefined' ? window : this);
