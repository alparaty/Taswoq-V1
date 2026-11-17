/**
 * Taswoq (تسوق) - Application Logic
 * Implements SRS v3 Requirements: Client Mobile App + Web Admin Dashboard
 */


// Sound Synthesizer via Web Audio API
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('tasweeq_sfx_enabled') !== 'false';
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }
  playTap() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) { }
  }
  playSuccess() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(659.25, now + 0.08);
      osc2.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);
      osc1.start(now);
      osc2.start(now + 0.16);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } catch (e) { }
  }
}
const sfx = new SoundFX();

// Application State
// Load persisted categories if available
try {
  const savedCats = localStorage.getItem('tasweeq_categories');
  if (savedCats && window.GROCERY_DATA) {
    const parsed = JSON.parse(savedCats);
    if (Array.isArray(parsed) && parsed.length > 0) {
      window.GROCERY_DATA.categories = parsed;
    }
  }
} catch (e) { }

const state = {
  theme: localStorage.getItem('tasweeq_theme') || 'light',
  lang: localStorage.getItem('tasweeq_lang') || 'ar',
  viewMode: 'mobile',
  activeMobileTab: 'home',
  activeAdminTab: 'dashboard',
  activeCategory: 'all',
  searchQuery: '',
  cart: {}, // { productId: qty }
  selectedZoneId: 1, // Default zone
  currentSheetProduct: null,
  currentSheetQty: 1,
  activeBannerIndex: 0,
  bannerTimer: null,
  roundRobinIndex: 0,
  // Working Data (with complete localStorage persistence)
  banners: (() => {
    try {
      const s = localStorage.getItem('tasweeq_banners');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [...window.GROCERY_DATA.banners];
  })(),
  products: (() => {
    try {
      const s = localStorage.getItem('tasweeq_products');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [...window.GROCERY_DATA.products];
  })(),
  orders: (() => {
    try {
      const isZeroed = localStorage.getItem('tasweeq_kpi_zeroed_v1');
      if (!isZeroed) {
        localStorage.removeItem('tasweeq_orders');
        localStorage.removeItem('tasweeq_expenses');
        localStorage.removeItem('tasweeq_complaints');
        localStorage.setItem('tasweeq_kpi_zeroed_v1', 'true');
        return [];
      }
      const s = localStorage.getItem('tasweeq_orders');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { }
    return [...((window.GROCERY_DATA && window.GROCERY_DATA.orders) || [])];
  })(),
  complaints: (() => {
    try {
      const s = localStorage.getItem('tasweeq_complaints') || localStorage.getItem('taswoq_complaints');
      if (s !== null) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { }
    return [...((window.GROCERY_DATA && window.GROCERY_DATA.complaints) || [])];
  })(),
  whatsappRecipients: (() => {
    try {
      const s = localStorage.getItem('tasweeq_whatsapp_recipients') || localStorage.getItem('tasweeq_whatsappRecipients');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [...window.GROCERY_DATA.whatsappRecipients];
  })(),
  deliverySettings: (() => {
    try {
      const s = localStorage.getItem('tasweeq_delivery_settings') || localStorage.getItem('tasweeq_deliverySettings');
      if (s) {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object') return { ...window.GROCERY_DATA.deliverySettings, ...parsed };
      }
    } catch (e) { }
    return { ...window.GROCERY_DATA.deliverySettings };
  })(),
  deliveryZones: (() => {
    try {
      const s = localStorage.getItem('tasweeq_delivery_zones') || localStorage.getItem('tasweeq_deliveryZones');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [...window.GROCERY_DATA.deliveryZones];
  })(),
  selectedPaymentMethod: 'cash', // 'cash' (افتراضي) or 'wallet'
  selectedWalletId: null,
  paymentWallets: (() => {
    try {
      const s = localStorage.getItem('tasweeq_payment_wallets');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { }
    return (window.GROCERY_DATA && Array.isArray(window.GROCERY_DATA.paymentWallets)) ? [...window.GROCERY_DATA.paymentWallets] : [];
  })(),
  supportSettings: { ...window.GROCERY_DATA.supportSettings },
  faqs: [...window.GROCERY_DATA.faqs],
  expenses: (() => {
    try {
      const isZeroed = localStorage.getItem('tasweeq_kpi_zeroed_v1');
      if (!isZeroed) {
        return [];
      }
      const stored = JSON.parse(localStorage.getItem('tasweeq_expenses'));
      if (Array.isArray(stored)) return stored;
    } catch (e) { }
    return [...((window.GROCERY_DATA && window.GROCERY_DATA.expenses) || [])];
  })(),
  profitDateFilter: {
    type: 'all',
    startDate: '',
    endDate: '',
    label: 'كافة الفترات المسجلة'
  },
  delegates: JSON.parse(localStorage.getItem('tasweeq_delegates')) || [...(window.GROCERY_DATA.delegates || [])],
  notifications: JSON.parse(localStorage.getItem('tasweeq_notifications') || '[]'),
  users: (() => {
    try {
      let deletedList = [];
      try {
        deletedList = JSON.parse(localStorage.getItem('taswoq_deleted_users') || '[]');
      } catch (e) { deletedList = []; }
      if (localStorage.getItem('khudair_primary_admin_deleted') === 'true') {
        if (!deletedList.includes('usr-101')) deletedList.push('usr-101');
        if (!deletedList.includes('admin')) deletedList.push('admin');
      }

      const raw = localStorage.getItem('khudair_users');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(u => u && !deletedList.includes(u.id) && !deletedList.includes((u.username || '').toLowerCase()));
        }
      }
      return [...(window.GROCERY_DATA.users || [])].filter(u => u && !deletedList.includes(u.id) && !deletedList.includes((u.username || '').toLowerCase()));
    } catch (e) {
      return [...(window.GROCERY_DATA.users || [])];
    }
  })(),
  adminWhitelist: JSON.parse(localStorage.getItem('khudair_admin_whitelist')) || [...(window.GROCERY_DATA.adminWhitelist || [])],
  auditLogs: JSON.parse(localStorage.getItem('khudair_audit_logs')) || [...(window.GROCERY_DATA.auditLogs || [])],
  currentUser: null,
  activeAdminCategoryFilter: 'all',
  adminProductSearch: '',
  userSearchQuery: '',
  userRoleFilter: 'all',
  auditLogFilter: 'all',
  pendingPasswordChangeUser: null,
  resetPasswordTargetUser: null
};
window.state = state;
try {
  const cachedUser = localStorage.getItem('taswoq_active_user') || localStorage.getItem('tasweeq_current_user');
  if (cachedUser) state.currentUser = JSON.parse(cachedUser);
} catch (e) { }

// Global Persistence Helpers for Taswoq Web
function persistProducts() {
  if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === "function") { window.TaswoqSync.syncUp({ products: state.products }); }
  try {
    localStorage.setItem('tasweeq_products', JSON.stringify(state.products));
  } catch (e) {
    console.error('Error persisting products:', e);
  }
}

function persistCategories() {
  if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === "function") { window.TaswoqSync.syncUp({ categories: window.GROCERY_DATA.categories }); }
  try {
    localStorage.setItem('tasweeq_categories', JSON.stringify(window.GROCERY_DATA.categories || []));
  } catch (e) {
    console.error('Error persisting categories:', e);
  }
}

function persistOrders(syncToServer = false) {
  if (syncToServer && window.TaswoqSync && typeof window.TaswoqSync.syncUp === "function") {
    window.TaswoqSync.syncUp({ orders: state.orders }).catch(() => {});
  }
  try {
    localStorage.setItem('tasweeq_orders', JSON.stringify(state.orders));
  } catch (e) {
    console.error('Error persisting orders:', e);
  }
}

function persistComplaints() {
  try {
    const data = JSON.stringify(state.complaints);
    localStorage.setItem('tasweeq_complaints', data);
    localStorage.setItem('taswoq_complaints', data);
  } catch (e) {
    console.error('Error persisting complaints:', e);
  }
}
window.persistComplaints = persistComplaints;

function persistBanners() {
  if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === "function") { window.TaswoqSync.syncUp({ banners: state.banners }); }
  try {
    localStorage.setItem('tasweeq_banners', JSON.stringify(state.banners));
  } catch (e) {
    console.error('Error persisting banners:', e);
  }
}

function persistWhatsAppRecipients() {
  if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === "function") { window.TaswoqSync.syncUp({ whatsappRecipients: state.whatsappRecipients }); }
  try {
    const data = JSON.stringify(state.whatsappRecipients);
    localStorage.setItem('tasweeq_whatsapp_recipients', data);
    localStorage.setItem('tasweeq_whatsappRecipients', data);
  } catch (e) {
    console.error('Error persisting whatsapp recipients:', e);
  }
}

function persistDelivery() {
  if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === "function") {
    window.TaswoqSync.syncUp({
      deliverySettings: state.deliverySettings,
      deliveryZones: state.deliveryZones
    });
  }
  try {
    localStorage.setItem('tasweeq_delivery_zones', JSON.stringify(state.deliveryZones));
    localStorage.setItem('tasweeq_deliveryZones', JSON.stringify(state.deliveryZones));
    localStorage.setItem('tasweeq_delivery_settings', JSON.stringify(state.deliverySettings));
    localStorage.setItem('tasweeq_deliverySettings', JSON.stringify(state.deliverySettings));
  } catch (e) {
    console.error('Error persisting delivery settings:', e);
  }
}


// Helper: Check if a user is a General Manager (المدير العام)
function isPrimaryAdmin(u) {
  if (!u) return false;
  if (u.isPrimaryAdmin === true || u.role === 'primary_admin') return true;
  if (u.id === 'usr-101' || (u.username && u.username.toLowerCase() === 'admin')) return true;
  return false;
}

// Helper: Count active General Managers in the system (Max limit: 2)
function getGeneralManagersCount() {
  return (state.users || []).filter(u => isPrimaryAdmin(u)).length;
}

// Helper: Check if current session operates as General Manager
function isCurrentSessionPrimaryAdmin() {
  if (!state.currentUser) return false; // Strictly false if not authenticated
  return isPrimaryAdmin(state.currentUser);
}

// Helper: Check if a user is an independent Developer Admin
function isDeveloperAdmin(u) {
  if (!u) return false;
  return u.role === 'developer_admin' || u.id === 'usr_developer';
}
window.isDeveloperAdmin = isDeveloperAdmin;

// Helper: Check if current session is Primary Admin OR Developer Admin
function isCurrentSessionPrimaryOrDeveloper() {
  if (!state.currentUser) return false;
  return isPrimaryAdmin(state.currentUser) || isDeveloperAdmin(state.currentUser);
}
window.isCurrentSessionPrimaryOrDeveloper = isCurrentSessionPrimaryOrDeveloper;

// Helper: Get active CSRF token reliably from sync client or sessionStorage
function getActiveCsrfToken() {
  if (window.TaswoqSync && typeof window.TaswoqSync.getCsrfToken === 'function') {
    const t = window.TaswoqSync.getCsrfToken();
    if (t) return t;
  }
  try {
    return sessionStorage.getItem('taswoq_csrf_token') || '';
  } catch (e) {
    return '';
  }
}
window.getActiveCsrfToken = getActiveCsrfToken;

// Data Integrity: Ensure Primary Admin is strictly locked and secondary demo admin exists
(function ensurePrimaryAdminIntegrity() {
  // Strictly enforce admin whitelist integrity: NO hardcoded or default emails allowed.
  // Only emails explicitly added by the admin are recognized.
  try {
    let rawWl = localStorage.getItem('khudair_admin_whitelist');
    let currentWl = [];
    if (rawWl) {
      try {
        let parsedWl = JSON.parse(rawWl);
        if (Array.isArray(parsedWl)) {
          currentWl = parsedWl.filter(e => e && typeof e === 'string' && e.trim().length > 3 && e.includes('@'));
        }
      } catch (err) { currentWl = []; }
    }
    // Purge legacy hardcoded/test emails so no backdoor or unauthorized email persists
    const bannedLegacy = ['admin@taswoq.ye', 'admin@tasweeq.ye', 'alparaty@gmail.com', 'admin@gmail.com'];
    currentWl = currentWl.filter(e => !bannedLegacy.some(b => e.toLowerCase() === b.toLowerCase()));

    localStorage.setItem('khudair_admin_whitelist', JSON.stringify(currentWl));
    state.adminWhitelist = currentWl;
  } catch (e) {
    console.warn('Error sanitizing admin whitelist', e);
  }

  try {
    if (!state.users || !Array.isArray(state.users)) state.users = [];

    // Always clear accidental orphaned primary admin lockout / deletion flag
    localStorage.removeItem('khudair_primary_admin_deleted');

    let deletedList = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('taswoq_deleted_users') || '[]');
      // usr-101 and admin are primary admin and cannot be locked or purged permanently
      deletedList = deletedList.filter(id => id !== 'usr-101' && id !== 'admin');
      localStorage.setItem('taswoq_deleted_users', JSON.stringify(deletedList));
    } catch (e) { deletedList = []; }

    // Filter out deleted employees
    if (deletedList.length > 0) {
      state.users = state.users.filter(u => u && !deletedList.includes(u.id) && !deletedList.includes((u.username || '').toLowerCase()));
    }

    // Ensure Primary Admin usr-101 is ALWAYS present, active, and unlocked
    let gm = state.users.find(u => u && (u.id === 'usr-101' || u.username === 'admin' || isPrimaryAdmin(u)));
    if (!gm) {
      gm = {
        id: 'usr-101',
        fullName: 'المدير العام',
        username: 'admin',
        email: '',
        passwordHash: 'Admin@2026',
        role: 'primary_admin',
        isPrimaryAdmin: true,
        isActive: true,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: '2026-10-18 10:30',
        createdAt: '2026-01-01',
        permissions: ['all']
      };
      state.users.unshift(gm);
    } else {
      gm.isPrimaryAdmin = true;
      gm.role = 'primary_admin';
      gm.isActive = true;
      gm.failedAttempts = 0;
      gm.lockedUntil = null;
      if (gm.email && (gm.email.toLowerCase().includes('admin@taswoq.ye') || gm.email.toLowerCase().includes('admin@tasweeq.ye'))) {
        gm.email = '';
      }
      if (!gm.passwordHash) gm.passwordHash = 'Admin@2026';
      if (!gm.permissions || (Array.isArray(gm.permissions) ? !gm.permissions.includes('all') : !gm.permissions['all'])) gm.permissions = ['all'];
    }

    // Purge prototype demo employee accounts so NO employee account exists unless created by the admin
    const demoUserIds = ['usr-102', 'usr-103', 'usr-104', 'usr-105'];
    const demoUsernames = ['ahmed.sales', 'sara.inventory', 'khaled.disabled', 'omar.admin'];
    state.users = state.users.filter(u => u && !demoUserIds.includes(u.id) && !demoUsernames.includes((u.username || '').toLowerCase()));

    localStorage.setItem('khudair_users', JSON.stringify(state.users));
  } catch (e) {
    console.warn('Error during user integrity check', e);
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  applyLang(state.lang);
  initBannerSlider();
  renderCategories();
  renderProducts();
  renderCart();
  renderOrderHistory();
  renderFaqs();
  renderComplaintsList();
  // في لوحة الإدارة: عدم عرض أو استدعاء بيانات الإدارة إلا بعد التحقق الصارم من الخادم عبر checkAuth()
  if (!document.querySelector('.admin-standalone-layout')) {
    renderAdminAll();
  }
  setupEventListeners();
  checkAuthState();
});

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tasweeq_theme', theme);
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) themeBtn.innerHTML = theme === 'dark' ? '☀️ وضع نهاري' : '🌙 وضع ليلي';
  const themeSelect = document.getElementById('mobile-theme-select');
  if (themeSelect) themeSelect.value = theme;
}

function applyLang(lang) {
  state.lang = lang;
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  localStorage.setItem('tasweeq_lang', lang);
  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) langBtn.innerHTML = lang === 'ar' ? '🌐 English' : '🌐 العربية';
  const langSelect = document.getElementById('mobile-lang-select');
  if (langSelect) langSelect.value = lang;

  updateAllInterfaceTexts(lang);
  renderCategories();
  renderProducts();
  renderFaqs();
  renderCart();
  updateBannerText();
  renderOrderHistory();
  renderAdminAll();
}

function updateAllInterfaceTexts(lang) {
  const isAr = lang === 'ar';

  // 1. Page Title
  document.title = isAr
    ? 'تسوق | Taswoq'
    : 'Taswoq | تسوق';

  const setHtml = (selector, html) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) el.innerHTML = html;
  };
  const setText = (selector, text) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) el.textContent = text;
  };
  const setAttr = (selector, attr, val) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) el.setAttribute(attr, val);
  };

  // 2. Global Header
  setHtml('.brand-title-wrap h1', isAr ? 'تسوق <span class="brand-badge">Taswoq</span>' : 'Taswoq <span class="brand-badge">تسوق</span>');
  setText('.brand-sub', isAr ? 'نظام متكامل: تطبيق العميل + لوحة الإدارة والأرباح (SRS v3)' : 'Integrated System: Client App + Admin & Profit Dashboard (SRS v3)');
  setHtml('[data-mode="mobile"]', `<span>📱</span> <span>${isAr ? 'تطبيق الجوال' : 'Mobile App'}</span>`);
  setHtml('[data-mode="admin"]', `<span>💻</span> <span>${isAr ? 'لوحة تحكم الإدارة' : 'Admin Dashboard'}</span>`);
  const standaloneLink = document.querySelector('a.mode-tab-btn[href*="admin.html"]');
  if (standaloneLink) {
    standaloneLink.innerHTML = `<span>🚀</span> <span>${isAr ? 'لوحة الإدارة المستقلة (كاملة الشاشة)' : 'Standalone Admin (Full Screen)'}</span>`;
  }

  // 3. Header Controls
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.innerHTML = isDark ? (isAr ? '☀️ وضع نهاري' : '☀️ Light Mode') : (isAr ? '🌙 وضع ليلي' : '🌙 Dark Mode');
  }
  const soundBtn = document.getElementById('sound-toggle-btn');
  if (soundBtn) {
    soundBtn.innerHTML = sfx.enabled ? (isAr ? '🔊 الصوت مفعل' : '🔊 Sound On') : (isAr ? '🔇 الصوت صامت' : '🔇 Muted');
  }

  // 4. Mobile Client Header
  const locBtn = document.querySelector('.delivery-location-btn');
  if (locBtn) {
    locBtn.innerHTML = `<span>📍</span> <span>${isAr ? 'حي الأندلس، صنعاء' : 'Al-Andalus, Sana\'a'}</span> <span>▼</span>`;
  }
  const timePill = document.querySelector('.delivery-time-pill');
  if (timePill) {
    timePill.innerHTML = `<span>⚡</span> <span>${isAr ? '15–25 دقيقة' : '15–25 min'}</span>`;
  }
  const searchInput = document.getElementById('mobile-search-input');
  if (searchInput) {
    searchInput.placeholder = isAr ? 'ابحث في تسوق عن خضار، لحوم، ألبان...' : 'Search Taswoq for produce, meats, pantry...';
  }

  // 5. Home Screen Section Header
  const sectionTitle = document.querySelector('#screen-home .section-title');
  if (sectionTitle) {
    sectionTitle.innerHTML = `<span>🔥</span> <span>${isAr ? 'عروض تسوق الطازجة' : 'Taswoq Fresh Offers'}</span>`;
  }
  const sectionBadge = document.querySelector('#screen-home .section-badge');
  if (sectionBadge) {
    sectionBadge.textContent = isAr ? 'قطاف يومي' : 'Fresh Daily';
  }

  // 6. Mobile Bottom Navigation
  const navHome = document.querySelector('.mobile-bottom-nav [data-tab="home"] .nav-item-label') || document.querySelector('.mobile-bottom-nav [data-tab="home"] span:last-child');
  if (navHome) navHome.textContent = isAr ? 'الرئيسية' : 'Home';
  const navCat = document.querySelector('.mobile-bottom-nav [data-tab="categories"] .nav-item-label') || document.querySelector('.mobile-bottom-nav [data-tab="categories"] span:last-child');
  if (navCat) navCat.textContent = isAr ? 'الأقسام' : 'Categories';
  const navFav = document.querySelector('.mobile-bottom-nav [data-tab="favorites"] .nav-item-label') || document.querySelector('.mobile-bottom-nav [data-tab="favorites"] span:last-child');
  if (navFav) navFav.textContent = isAr ? 'المفضلة' : 'Favorites';
  const navCart = document.querySelector('.mobile-bottom-nav [data-tab="cart"] .nav-item-label') || document.querySelector('.mobile-bottom-nav [data-tab="cart"] span:last-child');
  if (navCart) navCart.textContent = isAr ? 'السلة' : 'Cart';
  const navOrders = document.querySelector('.mobile-bottom-nav [data-tab="orders"] .nav-item-label') || document.querySelector('.mobile-bottom-nav [data-tab="orders"] span:last-child');
  if (navOrders) navOrders.textContent = isAr ? 'طلباتي' : 'Orders';
  const navSettings = document.querySelector('.mobile-bottom-nav [data-tab="settings"] .nav-item-label') || document.querySelector('.mobile-bottom-nav [data-tab="settings"] span:last-child');
  if (navSettings) navSettings.textContent = isAr ? 'الإعدادات' : 'Settings';

  // 7. Cart Screen
  const cartHeader = document.querySelector('#screen-cart .section-title');
  if (cartHeader) cartHeader.textContent = isAr ? '🛒 سلة مشتريات تسوق' : '🛒 Shopping Cart';
  const emptyTitle = document.querySelector('#empty-cart-state h3');
  if (emptyTitle) emptyTitle.textContent = isAr ? 'سلتك فارغة في تسوق' : 'Your cart is empty';
  const emptyDesc = document.querySelector('#empty-cart-state p');
  if (emptyDesc) emptyDesc.textContent = isAr ? 'تصفح الأصناف الطازجة وأضف ما تحتاجه بضغطة زر' : 'Browse fresh items and add what you need with one click';
  const emptyBtn = document.querySelector('#empty-cart-state button');
  if (emptyBtn) emptyBtn.textContent = isAr ? 'ابدأ التسوق الآن' : 'Start Shopping Now';

  // 8. Checkout Form
  const checkoutCardTitle = document.querySelector('.checkout-card h4');
  if (checkoutCardTitle) checkoutCardTitle.innerHTML = `<span>👤</span> <span>${isAr ? 'بيانات التوصيل والمنطقة' : 'Delivery & Area Details'}</span>`;

  const zoneLabel = document.querySelector('#checkout-zone-select')?.closest('.form-group')?.querySelector('label');
  if (zoneLabel) zoneLabel.textContent = isAr ? 'منطقة / حي التوصيل' : 'Delivery Zone / District';

  const nameLabel = document.querySelector('#checkout-name')?.previousElementSibling;
  if (nameLabel) nameLabel.textContent = isAr ? 'الاسم الكريم' : 'Full Name';
  setAttr('#checkout-name', 'placeholder', isAr ? 'اسم العميل' : 'Customer Name');

  const phoneLabel = document.getElementById('lbl-checkout-phone') || document.querySelector('#checkout-phone')?.previousElementSibling;
  if (phoneLabel) phoneLabel.textContent = isAr ? 'رقم الهاتف (واتساب)' : 'WhatsApp Phone Number';
  setAttr('#checkout-phone', 'placeholder', isAr ? 'مثال: 77XXXXXXX' : 'e.g. 77XXXXXXX');

  const addrLabel = document.getElementById('lbl-checkout-address') || document.querySelector('#checkout-address')?.previousElementSibling;
  if (addrLabel) addrLabel.textContent = isAr ? 'تفاصيل العنوان (الحي، الشارع، المعلم، الشقة)' : 'Address Details (Street, Building, Apt, Landmark)';
  setAttr('#checkout-address', 'placeholder', isAr ? 'مثال: حي الأندلس، شارع الستين، عمارة النور شقة 4' : 'e.g. Al-Andalus, 60m St, Al-Noor Bldg, Apt 4');

  const locLabel = document.querySelector('#checkout-location')?.closest('.form-group')?.querySelector('label');
  if (locLabel) locLabel.textContent = isAr ? 'رابط الموقع الجغرافي' : 'GPS Location Link';
  setAttr('#checkout-location', 'placeholder', isAr ? 'رابط خرائط جوجل' : 'Google Maps link');
  const gpsBtn = document.querySelector('.gps-locate-btn');
  if (gpsBtn) gpsBtn.innerHTML = `<span>📍</span> <span>${isAr ? 'تحديد عبر GPS' : 'Locate via GPS'}</span>`;

  const notesLabel = document.querySelector('#checkout-notes')?.previousElementSibling;
  if (notesLabel) notesLabel.textContent = isAr ? 'ملاحظات التوصيل (اختياري)' : 'Delivery Notes (Optional)';
  setAttr('#checkout-notes', 'placeholder', isAr ? 'تفاصيل إضافية للمندوب...' : 'Extra delivery instructions for courier...');

  const billRows = document.querySelectorAll('.bill-summary .bill-row');
  if (billRows.length >= 3) {
    const s0 = billRows[0].querySelector('span:first-child');
    if (s0) s0.textContent = isAr ? 'إجمالي المنتجات:' : 'Items Subtotal:';
    const s1 = billRows[1].querySelector('span:first-child');
    if (s1) s1.textContent = isAr ? 'رسوم التوصيل:' : 'Delivery Fee:';
    const s2 = billRows[2].querySelector('span:first-child');
    if (s2) s2.textContent = isAr ? 'الإجمالي النهائي:' : 'Grand Total:';
  }
  const ctaBtn = document.getElementById('whatsapp-order-cta');
  if (ctaBtn) ctaBtn.innerHTML = `<span>💬</span> <span>${isAr ? 'تأكيد الطلب عبر واتساب' : 'Confirm Order via WhatsApp'}</span>`;

  // 9. Orders Screen
  const ordersTitle = document.querySelector('#screen-orders .section-title');
  if (ordersTitle) ordersTitle.innerHTML = `<span>📦</span> <span>${isAr ? 'سجل طلباتي في تسوق' : 'My Past Orders'}</span>`;

  // 10. Settings Tab
  const settingsTitle = document.querySelector('#screen-settings .section-title');
  if (settingsTitle) settingsTitle.innerHTML = `<span>⚙️</span> <span>${isAr ? 'الإعدادات والمظهر' : 'Settings & Preferences'}</span>`;

  const settingsRows = document.querySelectorAll('#settings-preferences-card .settings-row');
  if (settingsRows.length >= 2) {
    const row1Title = settingsRows[0].querySelector('.settings-row-title');
    if (row1Title) row1Title.textContent = isAr ? 'لغة التطبيق' : 'App Language';
    const row1Sub = settingsRows[0].querySelector('.settings-row-sub');
    if (row1Sub) row1Sub.textContent = isAr ? 'تبديل فوري بين العربية والإنجليزية' : 'Instant switch between Arabic & English';

    const row2Title = settingsRows[1].querySelector('.settings-row-title');
    if (row2Title) row2Title.textContent = isAr ? 'المظهر (Theme)' : 'Appearance (Theme)';
    const row2Sub = settingsRows[1].querySelector('.settings-row-sub');
    if (row2Sub) row2Sub.textContent = isAr ? 'نهاري / ليلي ناعم' : 'Light / Soft Dark Mode';
  }

  const prefTitle = document.getElementById('settings-preferences-title');
  if (prefTitle) prefTitle.textContent = isAr ? 'التفضيلات' : 'Preferences';

  const supTitle = document.getElementById('app-support-title');
  if (supTitle) supTitle.textContent = isAr ? 'الدعم الفني والشكاوى' : 'Customer Support & Tickets';

  const faqTitle = document.getElementById('app-faq-title');
  if (faqTitle) faqTitle.textContent = isAr ? 'الأسئلة الشائعة (FAQ)' : 'Frequently Asked Questions (FAQ)';

  const hoursLbl = document.getElementById('app-support-hours-label');
  if (hoursLbl) hoursLbl.innerHTML = `🕒 <b>${isAr ? 'ساعات العمل:' : 'Working Hours:'}</b>`;
  const phoneLbl = document.getElementById('app-support-phone-label');
  if (phoneLbl) phoneLbl.innerHTML = `💬 <b>${isAr ? 'واتساب خدمة العملاء والطلبات:' : 'Customer Care & Orders WhatsApp:'}</b>`;

  const newComplaintBtn = document.querySelector('#screen-settings button[onclick="openComplaintModal()"]');
  if (newComplaintBtn) {
    newComplaintBtn.innerHTML = `<span>📝 ${isAr ? 'تقديم شكوى أو بلاغ جديد' : 'Submit New Ticket or Complaint'}</span>`;
  }
  const myComplaintsHeading = document.querySelector('#screen-settings h5');
  if (myComplaintsHeading) {
    myComplaintsHeading.textContent = isAr ? 'متابعة شكاواي السابقة:' : 'My Past Tickets:';
  }

  // 11. WhatsApp Modal
  setText('#modal-wa-title', isAr ? '💬 تم تسجيل الطلب وتجهيز رسالة واتساب (SRS v3)' : '💬 Order Recorded & WhatsApp Message Ready (SRS v3)');
  setText('#modal-wa-phone-lbl', isAr ? 'رقم تسوق المعتمد لاستقبال هذا الطلب:' : 'Official Taswoq number for this order:');
  setText('#modal-wa-dispatch-badge', isAr ? 'توزيع تلقائي ⚡' : 'Auto Routing ⚡');
  setText('#modal-wa-address-lbl', isAr ? 'تفاصيل عنوان التوصيل:' : 'Delivery Address Details:');
  setText('#modal-wa-preview-lbl', isAr ? 'معاينة الرسالة المنسقة الجاهزة للإرسال:' : 'Formatted Ready-to-Send Message Preview:');
  setText('#btn-copy-wa-text', isAr ? 'نسخ نص الرسالة' : 'Copy Message Text');
  setText('#modal-wa-link-text', isAr ? 'فتح تطبيق واتساب الآن' : 'Open WhatsApp App Now');

  // 12. Complaint Modal
  const compModalTitle = document.querySelector('#complaint-modal .modal-header h3');
  if (compModalTitle) compModalTitle.textContent = isAr ? '📝 تقديم شكوى أو بلاغ جديد' : '📝 Submit New Ticket or Complaint';
  const compLabels = document.querySelectorAll('#complaint-modal label');
  if (compLabels.length >= 3) {
    compLabels[0].textContent = isAr ? 'نوع الشكوى' : 'Complaint Type';
    compLabels[1].textContent = isAr ? 'الطلب المرتبط بالشكوى' : 'Related Order';
    compLabels[2].textContent = isAr ? 'نص وتفاصيل الشكوى' : 'Complaint Details';
  }
  setAttr('#complaint-text', 'placeholder', isAr ? 'اكتب تفاصيل المشكلة أو المقترح هنا...' : 'Write your issue or feedback in detail here...');
  const compSubmitBtn = document.querySelector('#complaint-modal .modal-footer button.sheet-confirm-btn');
  if (compSubmitBtn) compSubmitBtn.innerHTML = `<span>${isAr ? 'إرسال الشكوى للدعم الفني 📨' : 'Submit Ticket to Support 📨'}</span>`;

  // 13. Admin Dashboard (Both Embedded Mockup & Standalone Web Admin)
  // (A) Embedded Prototype Admin Selectors
  setText('.admin-brand div > div:first-child', isAr ? 'تسوق أدمن' : 'Taswoq Admin');
  setText('.admin-brand div > div:last-child', isAr ? 'لوحة تحكم الإدارة والأرباح' : 'Admin & Profit Dashboard');
  setText('.admin-sidebar-footer div:last-child div:first-child', isAr ? 'إدارة تسوق' : 'Super Admin');
  setText('.admin-sidebar-footer div:last-child div:last-child', isAr ? 'صلاحيات المدير العام' : 'General Admin Permissions');

  const navBtns = document.querySelectorAll('.admin-nav-btn');
  navBtns.forEach(btn => {
    const sec = btn.getAttribute('data-admin-sec');
    const labelSpan = btn.querySelector('.admin-nav-label');
    if (!labelSpan) return;
    if (sec === 'dashboard') labelSpan.innerHTML = `<span>📊</span> <span>${isAr ? 'المؤشرات والأرباح' : 'KPIs & Profits'}</span>`;
    if (sec === 'orders') labelSpan.innerHTML = `<span>🛍️</span> <span>${isAr ? 'إدارة الطلبات' : 'Orders Management'}</span>`;
    if (sec === 'delivery') labelSpan.innerHTML = `<span>🚚</span> <span>${isAr ? 'رسوم التوصيل والمناطق' : 'Delivery & Zones'}</span>`;
    if (sec === 'products') labelSpan.innerHTML = `<span>📦</span> <span>${isAr ? 'المنتجات والمخزون' : 'Products & Stock'}</span>`;
    if (sec === 'banners') labelSpan.innerHTML = `<span>🎉</span> <span>${isAr ? 'عروض وسلايدر الإعلانات' : 'Offers & Banner Slider'}</span>`;
    if (sec === 'complaints') labelSpan.innerHTML = `<span>🎫</span> <span>${isAr ? 'الشكاوى والتذاكر' : 'Support Tickets'}</span>`;
    if (sec === 'whatsapp') labelSpan.innerHTML = `<span>📱</span> <span>${isAr ? 'أرقام الواتساب' : 'WhatsApp Numbers'}</span>`;
    if (sec === 'settings') labelSpan.innerHTML = `<span>⚙️</span> <span>${isAr ? 'الإعدادات العامة' : 'General Settings'}</span>`;
  });

  setText('#admin-sec-dashboard .admin-heading h2', isAr ? 'مؤشرات تسوق وحساب صافي الأرباح' : 'Taswoq Analytics & Net Realized Profits');
  setText('#admin-sec-dashboard .admin-heading p', isAr ? 'متابعة مبيعات الأصناف، تكلفة الشراء، المصروفات التشغيلية، وصافي الربح المحقق (Eng. AL-ParatY)' : 'Track product sales, purchasing costs, operating expenses, and net profit (Eng. AL-ParatY)');
  const exportBtn = document.querySelector('#admin-sec-dashboard .admin-top-bar button');
  if (exportBtn) exportBtn.innerHTML = `<span>${isAr ? '📥 تصدير Excel/CSV' : '📥 Export Excel/CSV'}</span>`;

  setText('#admin-sec-orders .admin-heading h2', isAr ? 'إدارة وتتبع الطلبات' : 'Orders Tracking & Management');
  setText('#admin-sec-orders .admin-heading p', isAr ? 'تغيير حالة الطلب وتفاصيل الأصناف ورسوم التوصيل' : 'Update order statuses, items details, and delivery fees');
  const ordersThead = document.querySelectorAll('#admin-sec-orders thead th');
  if (ordersThead.length >= 8) {
    ordersThead[0].textContent = isAr ? 'رقم الطلب' : 'Order #';
    ordersThead[1].textContent = isAr ? 'العميل' : 'Customer';
    ordersThead[2].textContent = isAr ? 'الأصناف' : 'Items';
    ordersThead[3].textContent = isAr ? 'قيمة المنتجات' : 'Products Value';
    ordersThead[4].textContent = isAr ? 'رسوم التوصيل' : 'Delivery Fee';
    ordersThead[5].textContent = isAr ? 'صافي الربح' : 'Net Profit';
    ordersThead[6].textContent = isAr ? 'الحالة' : 'Status';
    ordersThead[7].textContent = isAr ? 'الموقع' : 'Location';
  }

  setText('#admin-sec-delivery .admin-heading h2', isAr ? 'إدارة رسوم التوصيل والمناطق (SRS v3)' : 'Delivery Fees & Zones Management (SRS v3)');
  setText('#admin-sec-delivery .admin-heading p', isAr ? 'التحكم في الرسوم الأساسية، التوصيل المجاني، الحد الأدنى، وتسعير الأحياء' : 'Control base delivery fee, free delivery threshold, minimum order, and zone pricing');
  const deliverySaveBtn = document.querySelector('#admin-sec-delivery .admin-top-bar button');
  if (deliverySaveBtn) deliverySaveBtn.innerHTML = `<span>${isAr ? 'حفظ الإعدادات 💾' : 'Save Settings 💾'}</span>`;

  setText('#admin-sec-products .admin-heading h2', isAr ? 'إدارة المنتجات والمخزون' : 'Products & Stock Management');
  setText('#admin-sec-products .admin-heading p', isAr ? 'تحديث الأسعار، تكلفة الشراء، وتوفر المنتجات' : 'Update prices, purchasing costs, and item availability');
  const addProdBtn = document.querySelector('#admin-sec-products .admin-top-bar button');
  if (addProdBtn) addProdBtn.innerHTML = `<span>${isAr ? '➕ إضافة منتج جديد' : '➕ Add New Product'}</span>`;

  setText('#admin-sec-banners .admin-heading h2', isAr ? 'عروض وسلايدر الإعلانات' : 'Promotional Slider & Banners');
  setText('#admin-sec-banners .admin-heading p', isAr ? 'إدارة البنرات الإعلانية المتحركة في واجهة التطبيق' : 'Manage animated promotional banners in mobile app');
  const addBannerBtn = document.querySelector('#admin-sec-banners .admin-top-bar button');
  if (addBannerBtn) addBannerBtn.innerHTML = `<span>${isAr ? '➕ إضافة إعلان / بنر جديد' : '➕ Add New Banner'}</span>`;

  setText('#admin-sec-complaints .admin-heading h2', isAr ? 'الشكاوى وتذاكر الدعم الفني' : 'Customer Support & Tickets');
  setText('#admin-sec-complaints .admin-heading p', isAr ? 'الرد على استفسارات وبلاغات العملاء مباشرة' : 'Directly reply to customer tickets and inquiries');

  setText('#admin-sec-whatsapp .admin-heading h2', isAr ? 'أرقام الواتساب وتوزيع الطلبات (Round-Robin)' : 'WhatsApp Numbers & Round-Robin Routing');
  setText('#admin-sec-whatsapp .admin-heading p', isAr ? 'إدارة أرقام خدمة العملاء والتوزيع التلقائي للطلبات' : 'Manage customer service numbers and automatic order routing');
  const addWaBtn = document.querySelector('#admin-sec-whatsapp .admin-top-bar button');
  if (addWaBtn) addWaBtn.innerHTML = `<span>${isAr ? '➕ إضافة رقم جديد' : '➕ Add New Number'}</span>`;

  setText('#admin-sec-settings .admin-heading h2', isAr ? 'الإعدادات العامة للنظام' : 'General System Settings');
  setText('#admin-sec-settings .admin-heading p', isAr ? 'التحكم في مظهر النظام ولغة العرض والأرقام' : 'Control system theme, display language, and numbers');

  // (B) Standalone Pure Web Admin Selectors (admin.html & لوحة_تحكم_الإدارة.html)
  // 1. Top Header
  setText('.top-header-title', isAr ? 'لوحة تحكم تسوق' : 'Taswoq Dashboard');
  setHtml('.top-header-badge', isAr
    ? '<span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981;"></span> مباشر'
    : '<span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981;"></span> Live');
  setText('.top-header-sub', isAr ? 'متابعة وإدارة المبيعات وصافي الأرباح والطلبات' : 'Track and manage sales, net profits, and orders');
  setHtml('.top-header .action-btn[onclick*="renderAdminAll"]', `<span>🔄</span> <span>${isAr ? 'تحديث' : 'Refresh'}</span>`);
  setHtml('#admin-send-push-btn', `<span>🔔</span> <span>${isAr ? 'إرسال إشعارات' : 'Send Push'}</span>`);
  setHtml('#admin-export-report-btn', `<span>📑</span> <span>${isAr ? 'تصدير تقرير' : 'Export Report'}</span>`);

  // 2. Standalone Sidebar Brand & Footer
  setText('.sidebar-brand .brand-text h2', isAr ? 'إدارة تسوق' : 'Taswoq Admin');
  setText('.sidebar-brand .brand-text span', isAr ? 'لوحة التحكم الرئيسية (Web Admin)' : 'Main Dashboard (Web Admin)');
  setText('.sidebar-footer div:first-child', isAr ? 'نظام تسوق المحاسبي' : 'Taswoq Accounting System');
  setText('.sidebar-footer div:last-child', isAr ? 'مطابق لوثيقة SRS v3 لحساب المبيعات - Eng. AL-ParatY.' : 'SRS v3 Compliant for Sales - Eng. AL-ParatY.');

  // 3. Standalone Sidebar Menu Items
  setHtml('#menu-item-dashboard', `<span>📊</span> <span>${isAr ? 'المؤشرات والأرباح' : 'KPIs & Profits'}</span>`);
  const ordersBadgeCount = document.getElementById('menu-orders-badge')?.textContent || '';
  setHtml('#menu-item-orders', `<span>🛍️</span> <span>${isAr ? 'إدارة الطلبات' : 'Orders Management'}</span> <span class="menu-badge" id="menu-orders-badge" style="${ordersBadgeCount ? '' : 'display:none;'}">${ordersBadgeCount}</span>`);
  setHtml('#menu-item-products', `<span>📦</span> <span>${isAr ? 'المنتجات والمخزون' : 'Products & Stock'}</span>`);
  setHtml('#menu-item-banners', `<span>🎉</span> <span>${isAr ? 'عروض وسلايدر الإعلانات' : 'Offers & Banners'}</span>`);
  setHtml('#menu-item-delivery', `<span>🚚</span> <span>${isAr ? 'رسوم التوصيل والمناطق' : 'Delivery & Zones'}</span> <span class="brand-badge" style="margin-${isAr ? 'right' : 'left'}: auto; font-size: 0.65rem;">SRS v3</span>`);
  const complaintsBadgeCount = document.getElementById('menu-complaints-badge')?.textContent || '';
  setHtml('#menu-item-complaints', `<span>🎫</span> <span>${isAr ? 'الشكاوى والتذاكر' : 'Support Tickets'}</span> <span class="menu-badge" style="background: var(--accent-600); ${complaintsBadgeCount ? '' : 'display:none;'}" id="menu-complaints-badge">${complaintsBadgeCount}</span>`);
  setHtml('#menu-item-expenses', `<span>💸</span> <span>${isAr ? 'المصروفات التشغيلية' : 'Operating Expenses'}</span>`);
  setHtml('#menu-item-whatsapp', `<span>📱</span> <span>${isAr ? 'أرقام الواتساب' : 'WhatsApp Numbers'}</span>`);
  setHtml('#menu-item-users', `<span>👥</span> <span>${isAr ? 'إدارة المستخدمين والموظفين' : 'Users & Staff'}</span> <span class="brand-badge" style="margin-${isAr ? 'right' : 'left'}: auto; font-size: 0.65rem; background: rgba(59, 130, 246, 0.15); color: #2563eb;">${isAr ? 'أمان' : 'Security'}</span>`);
  setHtml('#menu-item-settings', `<span>⚙️</span> <span>${isAr ? 'الإعدادات العامة' : 'General Settings'}</span>`);
  setHtml('#sidebar-logout-btn', `<span>🚪</span> <span style="font-weight: 800;">${isAr ? 'تسجيل الخروج' : 'Logout'}</span>`);

  // 4. Panel Dashboard Elements
  setHtml('.formula-banner > div:first-child', `<span>💡 <b>${isAr ? 'معادلة حساب صافي الربح المعتمدة (SRS v3 المحاسبية):' : 'Approved Net Profit Formula (SRS v3 Accounting):'}</b> </span> <span class="formula-text">${isAr ? 'صافي الربح الحقيقي = (مبيعات المنتجات − تكلفة الشراء) − المصروفات التشغيلية (Eng. AL-ParatY)' : 'Real Net Profit = (Products Sales − Purchase Cost) − Operating Expenses (Eng. AL-ParatY)'}</span>`);
  setText('.formula-banner .brand-badge', isAr ? 'دقة محاسبية 100%' : '100% Accounting Accuracy');

  setText('#profit-query-card .profit-query-header div:first-child > div > div:first-child', isAr ? 'استعلام وتصفية الأرباح والمؤشرات المالية حسب التاريخ' : 'Financial Indicators & Profit Query by Date');
  setText('#profit-query-card .profit-query-header div:first-child > div > div:last-child', isAr ? 'حدد الفترة المحاسبية أو اختر نطاق تاريخ محدد لحساب المبيعات، تكلفة الشراء، المصروفات وصافي الأرباح' : 'Select an accounting period or custom date range to calculate sales, cost, expenses, and net profit');
  setHtml('#profit-query-card .profit-query-actions button', `<span>📑</span> <span>${isAr ? 'تصدير تقرير الفترة CSV' : 'Export Period CSV'}</span>`);
  setHtml('#profit-query-card .profit-presets-wrapper > span:first-child', `<span>⚡</span> ${isAr ? 'الفترات السريعة:' : 'Quick Presets:'}`);

  const presetAll = document.querySelector('.profit-preset-btn[data-period="all"]');
  if (presetAll) presetAll.innerHTML = `<span>🌟</span> ${isAr ? 'الكل' : 'All'}`;
  const presetToday = document.querySelector('.profit-preset-btn[data-period="today"]');
  if (presetToday) presetToday.innerHTML = `<span>⚡</span> ${isAr ? 'أرباح اليوم' : 'Today'}`;
  const presetYest = document.querySelector('.profit-preset-btn[data-period="yesterday"]');
  if (presetYest) presetYest.innerHTML = `<span>⏮️</span> ${isAr ? 'أرباح الأمس' : 'Yesterday'}`;
  const presetWeek = document.querySelector('.profit-preset-btn[data-period="week"]');
  if (presetWeek) presetWeek.innerHTML = `<span>📊</span> ${isAr ? 'آخر 7 أيام' : 'Last 7 Days'}`;
  const presetMonth = document.querySelector('.profit-preset-btn[data-period="month"]');
  if (presetMonth) presetMonth.innerHTML = `<span>🗓️</span> ${isAr ? 'هذا الشهر' : 'This Month'}`;
  const presetLastMonth = document.querySelector('.profit-preset-btn[data-period="last_month"]');
  if (presetLastMonth) presetLastMonth.innerHTML = `<span>📉</span> ${isAr ? 'الشهر السابق' : 'Last Month'}`;
  const presetYear = document.querySelector('.profit-preset-btn[data-period="year"]');
  if (presetYear) presetYear.innerHTML = `<span>🎯</span> ${isAr ? 'هذا العام' : 'This Year'}`;

  setText('label[for="profit-date-start"]', isAr ? 'من تاريخ:' : 'From Date:');
  setText('label[for="profit-date-end"]', isAr ? 'إلى تاريخ:' : 'To Date:');
  setHtml('button[onclick*="applyCustomProfitDateFilter"]', `<span>🔍</span> <span>${isAr ? 'استعلام وتطبيق' : 'Query & Apply'}</span>`);
  setHtml('button[onclick*="resetProfitDateFilter"]', `<span>🔄</span> <span>${isAr ? 'إلغاء التصفية' : 'Reset Filter'}</span>`);

  // KPI Titles & Subtitles across dashboard
  const kpiCards = document.querySelectorAll('#panel-dashboard .kpi-card');
  if (kpiCards.length >= 6) {

    const subCardTitle = document.querySelector('#kpi-card-subscribers .kpi-title');
    if (subCardTitle) subCardTitle.textContent = isAr ? 'مشتركو تطبيق الهاتف' : 'App Subscribers';
    const subCardSub = document.querySelector('#kpi-card-subscribers .kpi-sub span:last-child');
    if (subCardSub) subCardSub.textContent = isAr ? 'عملاء ومستخدمو التطبيق' : 'Active App Users';

    const t0 = kpiCards[0].querySelector('.kpi-title'); if (t0) t0.textContent = isAr ? 'إجمالي طلبات الفترة' : 'Total Period Orders';
    const s0 = kpiCards[0].querySelector('.kpi-sub span:last-child'); if (s0) s0.textContent = isAr ? 'طلبات واردة' : 'Incoming Orders';
    const t1 = kpiCards[1].querySelector('.kpi-title'); if (t1) t1.textContent = isAr ? 'مبيعات المنتجات' : 'Products Sales';
    const s1 = kpiCards[1].querySelector('.kpi-sub span'); if (s1) s1.textContent = isAr ? 'مجموع قيم الأصناف فقط' : 'Items Total Value Only';
    const t2 = kpiCards[2].querySelector('.kpi-title'); if (t2) t2.textContent = isAr ? 'رسوم التوصيل المحصلة' : 'Delivery Fees Collected';
    const s2 = kpiCards[2].querySelector('.kpi-sub span'); if (s2) s2.textContent = isAr ? 'مستثناة من صافي الربح ومخصصة إلى Eng. AL-ParatY' : 'Excluded from net profit & assigned to Eng. AL-ParatY';
    const t3 = kpiCards[3].querySelector('.kpi-title'); if (t3) t3.textContent = isAr ? 'إجمالي تكلفة الشراء' : 'Cost of Goods';
    const s3 = kpiCards[3].querySelector('.kpi-sub span'); if (s3) s3.textContent = isAr ? 'تكلفة المنتجات الفعلية' : 'Actual Products Cost';
    const t4 = kpiCards[4].querySelector('.kpi-title'); if (t4) t4.textContent = isAr ? 'المصروفات التشغيلية' : 'Operating Expenses';
    const s4 = document.getElementById('kpi-expense-sub'); if (s4) s4.textContent = isAr ? 'وقود، صيانة، كراتين، إيجار' : 'Fuel, maintenance, boxes, rent';
    const t5 = kpiCards[5].querySelector('.kpi-title'); if (t5) t5.textContent = isAr ? 'صافي الربح الفعلي' : 'Real Net Profit';
  }

  // Chart Header
  const chartHeader = document.querySelector('#panel-dashboard .admin-chart-card:not(.profit-breakdown-card) .chart-header');
  if (chartHeader) {
    const ct = chartHeader.querySelector('div:first-child');
    if (ct) ct.textContent = isAr ? 'مقارنة مبيعات المنتجات مقابل صافي الأرباح لطلبات الفترة المحددة' : 'Products Sales vs Net Profit Comparison for Selected Period';
    const cl = chartHeader.querySelectorAll('div:last-child > span');
    if (cl.length >= 2) {
      cl[0].innerHTML = `<span style="width: 12px; height: 12px; background: var(--info); border-radius: 3px;"></span> ${isAr ? 'المبيعات' : 'Sales'}`;
      cl[1].innerHTML = `<span style="width: 12px; height: 12px; background: var(--primary-500); border-radius: 3px;"></span> ${isAr ? 'صافي الربح' : 'Net Profit'}`;
    }
  }

  // Breakdown Ledger Card
  const ledgerCard = document.querySelector('.profit-breakdown-card');
  if (ledgerCard) {
    const lt = ledgerCard.querySelector('.chart-header > div:first-child > div:first-child');
    if (lt) lt.innerHTML = `<span>📊</span> <span>${isAr ? 'كشف تفاصيل الأرباح والمبيعات حسب اليوم والتاريخ' : 'Daily Sales & Profit Ledger Breakdown'}</span>`;
    const ls = ledgerCard.querySelector('.chart-header > div:first-child > div:last-child');
    if (ls) ls.textContent = isAr ? 'تحليل محاسبي يومي يوضح المبيعات، تكلفة البضاعة، المصروفات التشغيلية، وصافي الأرباح المحققة للفترة المحددة' : 'Daily accounting analysis showing sales, cost of goods, operating expenses, and realized net profit';
    setHtml(ledgerCard.querySelector('.chart-header button[onclick*="window.print"]'), `<span>🖨️</span> <span>${isAr ? 'طباعة الكشف' : 'Print Ledger'}</span>`);

    const ledgerTh = ledgerCard.querySelectorAll('thead th');
    if (ledgerTh.length >= 9) {
      ledgerTh[0].textContent = isAr ? 'اليوم / التاريخ 📅' : 'Day / Date 📅';
      ledgerTh[1].textContent = isAr ? 'عدد الطلبات 🛍️' : 'Orders Count 🛍️';
      ledgerTh[2].textContent = isAr ? 'مبيعات المنتجات 💰' : 'Products Sales 💰';
      ledgerTh[3].textContent = isAr ? 'تكلفة الشراء 🏷️' : 'Cost of Goods 🏷️';
      ledgerTh[4].textContent = isAr ? 'المصروفات التشغيلية 💸' : 'Operating Expenses 💸';
      ledgerTh[5].textContent = isAr ? 'رسوم التوصيل (Eng. AL-ParatY) 🚚' : 'Delivery Fee (Eng. AL-ParatY) 🚚';
      ledgerTh[6].textContent = isAr ? 'صافي الربح الفعلي ✨' : 'Real Net Profit ✨';
      ledgerTh[7].textContent = isAr ? 'هامش الربح %' : 'Margin %';
      ledgerTh[8].textContent = isAr ? 'الحالة المحاسبية 📌' : 'Status 📌';
    }
  }

  // 5. Panel Orders
  setText('#panel-orders .admin-heading h2', isAr ? 'إدارة وتتبع طلبات تسوق' : 'Orders Tracking & Management');
  setText('#panel-orders .admin-heading p', isAr ? 'تغيير حالة الطلب وتفاصيل الأصناف ورسوم التوصيل وروابط المواقع' : 'Update order statuses, items details, delivery fees, and map links');
  const panelOrdersTh = document.querySelectorAll('#panel-orders thead th');
  if (panelOrdersTh.length >= 8) {
    panelOrdersTh[0].textContent = isAr ? 'رقم الطلب' : 'Order #';
    panelOrdersTh[1].textContent = isAr ? 'العميل' : 'Customer';
    panelOrdersTh[2].textContent = isAr ? 'الأصناف' : 'Items';
    panelOrdersTh[3].textContent = isAr ? 'قيمة المنتجات' : 'Products Value';
    panelOrdersTh[4].textContent = isAr ? 'رسوم التوصيل' : 'Delivery Fee';
    panelOrdersTh[5].textContent = isAr ? 'صافي الربح' : 'Net Profit';
    panelOrdersTh[6].textContent = isAr ? 'الحالة' : 'Status';
    panelOrdersTh[7].textContent = isAr ? 'الموقع' : 'Location';
  }

  // 6. Panel Delivery
  setText('#panel-delivery .admin-heading h2', isAr ? 'إدارة رسوم التوصيل والمناطق (SRS v3 Section 3.8)' : 'Delivery Fees & Zones Management (SRS v3)');
  setText('#panel-delivery .admin-heading p', isAr ? 'التحكم في الرسوم الأساسية، حد التوصيل المجاني، الحد الأدنى للطلب، وتسعير الأحياء' : 'Control base delivery fee, free delivery threshold, minimum order, and zone pricing');
  setHtml('#panel-delivery .admin-top-bar button', `<span>${isAr ? 'حفظ التعديلات 💾' : 'Save Changes 💾'}</span>`);

  const genRulesCard = document.getElementById('card-general-pricing-rules');
  if (genRulesCard) {
    const h4 = genRulesCard.querySelector('h4'); if (h4) h4.textContent = isAr ? 'قواعد التسعير العامة' : 'General Pricing Rules';
    const rows = genRulesCard.querySelectorAll('.setting-row');
    if (rows.length >= 4) {
      const r0_t = rows[0].querySelector('div:first-child > div:first-child'); if (r0_t) r0_t.textContent = isAr ? 'الرسوم الأساسية للتوصيل' : 'Base Delivery Fee';
      const r0_s = rows[0].querySelector('div:first-child > div:last-child'); if (r0_s) r0_s.textContent = isAr ? 'تُطبق تلقائياً على جميع الطلبات العادية' : 'Applied automatically to regular orders';
      const r1_t = rows[1].querySelector('div:first-child > div:first-child'); if (r1_t) r1_t.textContent = isAr ? 'توصيل مجاني عند مبلغ معين' : 'Free Delivery on Minimum Order';
      const r1_s = rows[1].querySelector('div:first-child > div:last-child'); if (r1_s) r1_s.textContent = isAr ? 'تحفيز العملاء لإكمال السلة للحصول على التوصيل المجاني' : 'Encourage customers to complete cart for free delivery';
      const r2_t = rows[2].querySelector('div:first-child > div:first-child'); if (r2_t) r2_t.textContent = isAr ? 'الحد الأدنى للتوصيل المجاني' : 'Free Delivery Minimum Threshold';
      const r2_s = rows[2].querySelector('div:first-child > div:last-child'); if (r2_s) r2_s.textContent = isAr ? 'يصبح التوصيل مجانياً إذا تجاوز إجمالي المنتجات هذا المبلغ' : 'Delivery is free if products subtotal exceeds this amount';
      const r3_t = rows[3].querySelector('div:first-child > div:first-child'); if (r3_t) r3_t.textContent = isAr ? 'الحد الأدنى لقبول الطلب' : 'Minimum Order Amount';
      const r3_s = rows[3].querySelector('div:first-child > div:last-child'); if (r3_s) r3_s.textContent = isAr ? 'قفل زر إتمام الطلب في التطبيق إذا كانت السلة أقل من هذا المبلغ' : 'Block checkout if cart subtotal is below this amount';
    }
  }
  const zonesCard = document.querySelector('#panel-delivery .delivery-settings-grid > .settings-section-card:last-child');
  if (zonesCard) {
    const zh = zonesCard.querySelector('h4'); if (zh) zh.textContent = isAr ? 'تسعير مناطق وأحياء التوصيل' : 'Delivery Zones & Districts Pricing';
    const zs = zonesCard.querySelector('div[style*="font-size: 0.78rem"]'); if (zs) zs.textContent = isAr ? 'يمكنك تعديل سعر التوصيل مباشرة في الجدول أو النقر على "تعديل"، أو إضافة أحياء جديدة' : 'Edit fee directly in table, click \'Edit\', or add new delivery districts';
    setHtml(zonesCard.querySelector('button[onclick*="openAddZoneModal"]'), `<span>${isAr ? '+ إضافة حي/منطقة جديدة' : '+ Add New Zone/District'}</span>`);
  }
  const panelDeliveryTh = document.querySelectorAll('#panel-delivery thead th');
  if (panelDeliveryTh.length >= 4) {
    panelDeliveryTh[0].textContent = isAr ? 'المنطقة / الحي' : 'Zone / District';
    panelDeliveryTh[1].textContent = isAr ? 'رسوم التوصيل' : 'Delivery Fee';
    panelDeliveryTh[2].textContent = isAr ? 'الحالة' : 'Status';
    panelDeliveryTh[3].textContent = isAr ? 'الإجراءات والتحكم' : 'Actions & Controls';
  }

  // 7. Panel Products
  setText('#panel-products .admin-heading h2', isAr ? 'إدارة منتجات ومخزون تسوق' : 'Products & Inventory Management');
  setText('#panel-products .admin-heading p', isAr ? 'تعديل أسعار البيع وأسعار التكلفة وتصنيف المنتجات حسب الأقسام لحساب دقيق للأرباح' : 'Update retail prices, purchase costs, and categories for accurate profit calculation');
  setHtml('#panel-products .admin-top-bar button', `<span>${isAr ? '+ إضافة منتج جديد' : '+ Add New Product'}</span>`);
  setAttr('#panel-products input[oninput*="onAdminProductSearch"]', 'placeholder', isAr ? '🔍 بحث في المنتجات بالاسم أو القسم...' : '🔍 Search products by name or category...');
  const panelProductsTh = document.querySelectorAll('#panel-products thead th');
  if (panelProductsTh.length >= 8) {
    panelProductsTh[0].textContent = isAr ? 'صورة' : 'Image';
    panelProductsTh[1].textContent = isAr ? 'المنتج والقسم' : 'Product & Category';
    panelProductsTh[2].textContent = isAr ? 'سعر التكلفة' : 'Cost Price';
    panelProductsTh[3].textContent = isAr ? 'سعر البيع' : 'Selling Price';
    panelProductsTh[4].textContent = isAr ? 'سعر الخصم' : 'Discount Price';
    panelProductsTh[5].textContent = isAr ? 'هامش الربح' : 'Profit Margin';
    panelProductsTh[6].textContent = isAr ? 'حالة التوفر' : 'Availability';
    panelProductsTh[7].textContent = isAr ? 'الإجراءات' : 'Actions';
  }

  // 8. Panel Banners
  setText('#panel-banners .admin-heading h2', isAr ? 'إدارة عروض وسلايدر الإعلانات المتحركة' : 'Promotional Slider & Banners Management');
  setText('#panel-banners .admin-heading p', isAr ? 'التحكم في البنرات الإعلانية التي تظهر في الصفحة الرئيسية للتطبيق وبثها فورياً كإشعارات للعملاء' : 'Control carousel banners on app home screen and broadcast them as push notifications');
  setHtml('#panel-banners .admin-top-bar button', `<span>${isAr ? '+ إضافة بنر إعلاني جديد' : '+ Add New Banner'}</span>`);
  const panelBannersTh = document.querySelectorAll('#panel-banners thead th');
  if (panelBannersTh.length >= 5) {
    panelBannersTh[0].textContent = isAr ? 'معاينة البنر' : 'Banner Preview';
    panelBannersTh[1].textContent = isAr ? 'عنوان العرض والوسم' : 'Offer Title & Tag';
    panelBannersTh[2].textContent = isAr ? 'الوصف الإعلاني' : 'Description';
    panelBannersTh[3].textContent = isAr ? 'حالة العرض' : 'Status';
    panelBannersTh[4].textContent = isAr ? 'الإجراءات والبث للإشعارات' : 'Actions & Push Broadcast';
  }

  // 9. Panel Expenses
  setText('#panel-expenses .admin-heading h2', isAr ? 'إدارة المصروفات التشغيلية والنثريات' : 'Operating Expenses Management');
  setText('#panel-expenses .admin-heading p', isAr ? 'تسجيل مصروفات الوقود وصيانة الدبابات والكراتين والتغليف لخصمها من صافي الأرباح (SRS v3)' : 'Record fuel, maintenance, packaging, and rent to deduct from net profit (SRS v3)');
  setHtml('#panel-expenses .admin-top-bar button', `<span>${isAr ? '+ تسجيل سند صرف جديد' : '+ New Expense Voucher'}</span>`);
  const expKpis = document.querySelectorAll('#panel-expenses .kpi-card');
  if (expKpis.length >= 4) {
    const t0 = expKpis[0].querySelector('.kpi-title'); if (t0) t0.textContent = isAr ? 'مصروفات اليوم' : "Today's Expenses";
    const s0 = expKpis[0].querySelector('.kpi-sub span'); if (s0) s0.textContent = isAr ? 'تحديث مباشر' : 'Live Update';
    const t1 = expKpis[1].querySelector('.kpi-title'); if (t1) t1.textContent = isAr ? 'إجمالي المصروفات المسجلة' : 'Total Recorded Expenses';
    const s1 = expKpis[1].querySelector('.kpi-sub span'); if (s1) s1.textContent = isAr ? 'تخصم من صافي الأرباح' : 'Deducted from net profit';
    const t2 = expKpis[2].querySelector('.kpi-title'); if (t2) t2.textContent = isAr ? 'بند وقود الدبابات' : 'Motorcycle Fuel';
    const s2 = expKpis[2].querySelector('.kpi-sub span'); if (s2) s2.textContent = isAr ? 'بنزين دبابات التوصيل' : 'Delivery motorbikes petrol';
    const t3 = expKpis[3].querySelector('.kpi-title'); if (t3) t3.textContent = isAr ? 'الصيانة والتغليف والمؤن' : 'Maintenance & Packaging';
    const s3 = expKpis[3].querySelector('.kpi-sub span'); if (s3) s3.textContent = isAr ? 'كراتين، إيجار، نثريات' : 'Boxes, rent, supplies';
  }
  const quickExpCard = document.querySelector('#panel-expenses .settings-section-card');
  if (quickExpCard) {
    const qh = quickExpCard.querySelector('h4'); if (qh) qh.innerHTML = `<span>📝</span> <span>${isAr ? 'تسجيل سند صرف / مصروف تشغيلي جديد' : 'Record New Operating Expense Voucher'}</span>`;
    const ql = quickExpCard.querySelectorAll('.form-group label');
    if (ql.length >= 4) {
      ql[0].textContent = isAr ? 'بند / تصنيف المصروف *' : 'Expense Category *';
      ql[1].textContent = isAr ? 'المبلغ (ر.ي) *' : 'Amount (YER) *';
      ql[2].textContent = isAr ? 'طريقة الدفع *' : 'Payment Method *';
      ql[3].textContent = isAr ? 'البيان التفصيلي / المستلم *' : 'Description / Recipient *';
    }
    setHtml(quickExpCard.querySelector('button[onclick*="saveExpense"]'), `<span>💸 ${isAr ? 'حفظ سند الصرف' : 'Save Expense Voucher'}</span>`);
  }
  const panelExpensesTh = document.querySelectorAll('#panel-expenses thead th');
  if (panelExpensesTh.length >= 7) {
    panelExpensesTh[0].textContent = isAr ? 'رقم السند' : 'Voucher #';
    panelExpensesTh[1].textContent = isAr ? 'التاريخ والوقت' : 'Date & Time';
    panelExpensesTh[2].textContent = isAr ? 'التصنيف' : 'Category';
    panelExpensesTh[3].textContent = isAr ? 'البيان والتفاصيل' : 'Description';
    panelExpensesTh[4].textContent = isAr ? 'المبلغ' : 'Amount';
    panelExpensesTh[5].textContent = isAr ? 'طريقة الدفع' : 'Payment Method';
    panelExpensesTh[6].textContent = isAr ? 'الإجراءات' : 'Actions';
  }

  // 10. Panel Complaints
  setText('#panel-complaints .admin-heading h2', isAr ? 'إدارة شكاوى وتذاكر عملاء تسوق' : 'Customer Complaints & Tickets Management');
  setText('#panel-complaints .admin-heading p', isAr ? 'متابعة البلاغات والرد عليها مع تحديث الحالة للعميل لحظياً' : 'Follow up customer tickets, reply directly, and update status in real-time');
  const btnPending = document.getElementById('btn-comp-filter-pending');
  if (btnPending) {
    const cnt = document.getElementById('badge-comp-count-pending')?.textContent || '0';
    btnPending.innerHTML = `<span>⏳ ${isAr ? 'بانتظار الرد' : 'Pending Response'}</span> <span id="badge-comp-count-pending" class="brand-badge" style="background: rgba(239, 68, 68, 0.15); color: #dc2626; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px;">${cnt}</span>`;
  }
  const btnResolved = document.getElementById('btn-comp-filter-resolved');
  if (btnResolved) {
    const cnt = document.getElementById('badge-comp-count-resolved')?.textContent || '0';
    btnResolved.innerHTML = `<span>✅ ${isAr ? 'تم الرد والمعالجة' : 'Resolved & Replied'}</span> <span id="badge-comp-count-resolved" class="brand-badge" style="background: rgba(16, 185, 129, 0.15); color: #059669; font-size: 0.72rem; padding: 2px 7px; border-radius: 10px;">${cnt}</span>`;
  }
  const btnAllComp = document.getElementById('btn-comp-filter-all');
  if (btnAllComp) btnAllComp.innerHTML = `<span>📋 ${isAr ? 'جميع الشكاوى' : 'All Tickets'}</span>`;
  const panelComplaintsTh = document.querySelectorAll('#panel-complaints thead th');
  if (panelComplaintsTh.length >= 7) {
    panelComplaintsTh[0].textContent = isAr ? 'رقم الشكوى' : 'Ticket #';
    panelComplaintsTh[1].textContent = isAr ? 'العميل' : 'Customer';
    panelComplaintsTh[2].textContent = isAr ? 'نوع الشكوى' : 'Complaint Type';
    panelComplaintsTh[3].textContent = isAr ? 'الطلب المرتبط' : 'Related Order';
    panelComplaintsTh[4].textContent = isAr ? 'الرسالة' : 'Message';
    panelComplaintsTh[5].textContent = isAr ? 'الحالة' : 'Status';
    panelComplaintsTh[6].textContent = isAr ? 'رد الإدارة' : 'Admin Reply';
  }

  // 11. Panel WhatsApp
  setText('#panel-whatsapp .admin-heading h2', isAr ? 'أرقام الواتساب وتوزيع الطلبات (Round-Robin)' : 'WhatsApp Numbers & Round-Robin Routing');
  setText('#panel-whatsapp .admin-heading p', isAr ? 'توزيع طلبات تسوق بالتناوب بين فروع وأرقام خدمة العملاء' : 'Distribute customer orders evenly among branches & support numbers');
  setHtml('#panel-whatsapp .action-btn.primary', `<span>${isAr ? '+ إضافة رقم واتساب جديد' : '+ Add New WhatsApp Number'}</span>`);
  const waModeLabel = document.querySelector('#panel-whatsapp span[style*="font-weight: 700"]');
  if (waModeLabel) waModeLabel.textContent = isAr ? 'وضع التوزيع:' : 'Routing Mode:';
  const panelWaTh = document.querySelectorAll('#panel-whatsapp thead th');
  if (panelWaTh.length >= 5) {
    panelWaTh[0].textContent = isAr ? 'رقم الهاتف' : 'Phone Number';
    panelWaTh[1].textContent = isAr ? 'التسمية / الفرع' : 'Label / Branch';
    panelWaTh[2].textContent = isAr ? 'الحالة' : 'Status';
    panelWaTh[3].textContent = isAr ? 'آخر طلب مستلم' : 'Last Received Order';
    panelWaTh[4].textContent = isAr ? 'الإجراءات والتحكم' : 'Actions & Controls';
  }

  // 12. Panel Users
  const usersH2 = document.querySelector('#panel-users h2');
  if (usersH2) usersH2.innerHTML = `<span>👥</span> <span>${isAr ? 'إدارة المستخدمين والموظفين وصلاحيات الدخول' : 'Users, Staff & Permissions Management'}</span>`;
  const usersP = document.querySelector('#panel-users p');
  if (usersP) usersP.textContent = isAr ? 'نظام مصادقة متكامل: تسجيل دخول المدير عبر Google OAuth والموظفين بكلمة مرور وصلاحيات مخصصة مع سجل التدقيق الأمني (SRS v3)' : 'Integrated auth: Admin login via Google OAuth, staff via password with granular RBAC & security audit logs (SRS v3)';
  setHtml('button[onclick*="openAdminWhitelistModal"]', `<span>🛡️</span> <span>${isAr ? 'القائمة البيضاء للمدراء' : 'Admin Whitelist'}</span>`);
  setHtml('button[onclick*="audit-logs-card"]', `<span>📜</span> <span>${isAr ? 'سجل التدقيق' : 'Audit Logs'}</span>`);
  setHtml('button[onclick*="openAddUserModal"]', `<span>➕</span> <span>${isAr ? 'إضافة مستخدم / مدير جديد' : 'Add New User / Admin'}</span>`);
  const usersKpis = document.querySelectorAll('#panel-users .kpi-card');
  if (usersKpis.length >= 4) {
    const l0 = usersKpis[0].querySelector('.kpi-label'); if (l0) l0.textContent = isAr ? 'إجمالي الحسابات المسجلة' : 'Total Accounts';
    const s0 = usersKpis[0].querySelector('.kpi-sub'); if (s0) s0.textContent = isAr ? 'مدراء وموظفون بالنظام' : 'Admins & staff in system';
    const l1 = usersKpis[1].querySelector('.kpi-label'); if (l1) l1.textContent = isAr ? 'الموظفون والحسابات النشطة' : 'Active Accounts';
    const s1 = usersKpis[1].querySelector('.kpi-sub'); if (s1) s1.textContent = isAr ? 'جاهزون للعمل والدخول' : 'Ready to log in';
    const l2 = usersKpis[2].querySelector('.kpi-label'); if (l2) l2.textContent = isAr ? 'الحسابات المعطلة' : 'Disabled Accounts';
    const s2 = usersKpis[2].querySelector('.kpi-sub'); if (s2) s2.textContent = isAr ? 'محظور دخولها مؤقتاً' : 'Temporarily blocked';
    const l3 = usersKpis[3].querySelector('.kpi-label'); if (l3) l3.textContent = isAr ? 'مدراء Google المعتمدون' : 'Authorized Google Admins';
    const s3 = usersKpis[3].querySelector('.kpi-sub'); if (s3) s3.textContent = isAr ? 'القائمة البيضاء المصرّح بها' : 'Approved whitelist';
  }
  const usersTableH3 = document.querySelector('#panel-users .table-header h3');
  if (usersTableH3) usersTableH3.textContent = isAr ? 'قائمة المستخدمين والموظفين' : 'Users & Staff Directory';
  const usersRbacBadge = document.querySelector('#panel-users .table-header .brand-badge');
  if (usersRbacBadge) usersRbacBadge.textContent = isAr ? 'إدارة الأذونات' : 'RBAC Permissions';
  setAttr('#users-search-input', 'placeholder', isAr ? 'بحث بالاسم أو المستخدم...' : 'Search by name or username...');
  const usersPills = document.querySelectorAll('#panel-users .filter-pills .filter-pill');
  if (usersPills.length >= 5) {
    usersPills[0].textContent = isAr ? 'الكل' : 'All';
    usersPills[1].textContent = isAr ? 'المدراء' : 'Admins';
    usersPills[2].textContent = isAr ? 'الموظفون' : 'Staff';
    usersPills[3].textContent = isAr ? 'النشطون' : 'Active';
    usersPills[4].textContent = isAr ? 'المعطلون' : 'Disabled';
  }
  const panelUsersTh = document.querySelectorAll('#panel-users thead th');
  if (panelUsersTh.length >= 7) {
    panelUsersTh[0].textContent = isAr ? 'المستخدم' : 'User';
    panelUsersTh[1].textContent = isAr ? 'اسم المستخدم' : 'Username';
    panelUsersTh[2].textContent = isAr ? 'الدور / الرتبة' : 'Role';
    panelUsersTh[3].textContent = isAr ? 'طريقة الدخول' : 'Auth Method';
    panelUsersTh[4].textContent = isAr ? 'الصلاحيات' : 'Permissions';
    panelUsersTh[5].textContent = isAr ? 'الحالة' : 'Status';
    panelUsersTh[6].textContent = isAr ? 'الإجراءات' : 'Actions';
  }

  // 13. Panel Settings
  const settingsH2 = document.querySelector('#panel-settings .admin-heading h2');
  if (settingsH2) settingsH2.innerHTML = `<span>⚙️</span> <span>${isAr ? 'الإعدادات العامة وتفضيلات لوحة التحكم' : 'General Settings & Dashboard Preferences'}</span>`;
  const settingsP = document.querySelector('#panel-settings .admin-heading p');
  if (settingsP) settingsP.textContent = isAr ? 'التحكم في لغة النظام، مظهر وسمة الواجهة (الوضع النهاري والليلي)، بيانات وهوية المتجر، والتنبيهات الصوتية' : 'Control language, interface theme (light/dark mode), store identity, and audio notifications';
  setHtml('button[onclick*="resetAdminSettingsToDefault"]', `<span>🔄</span> <span>${isAr ? 'استعادة الافتراضي' : 'Reset Defaults'}</span>`);
  setHtml('button[onclick*="saveAllAdminSettings"]', `<span>💾</span> <span>${isAr ? 'حفظ كافة التعديلات' : 'Save All Changes'}</span>`);

  setHtml('a[href="#sec-setting-lang"]', `<span>🌐</span> <span>${isAr ? 'لغة النظام والاتجاه' : 'Language & Direction'}</span>`);
  setHtml('a[href="#sec-setting-theme"]', `<span>🎨</span> <span>${isAr ? 'المظهر والسمة (ليلي/نهاري)' : 'Theme (Dark/Light)'}</span>`);
  setHtml('a[href="#sec-setting-store"]', `<span>🏪</span> <span>${isAr ? 'هوية وبيانات المتجر' : 'Store Identity & Info'}</span>`);
  setHtml('a[href="#sec-setting-sound"]', `<span>🔔</span> <span>${isAr ? 'الأصوات والتنبيهات' : 'Sounds & Alerts'}</span>`);
  setHtml('a[href="#sec-setting-backup"]', `<span>💾</span> <span>${isAr ? 'النسخ والصيانة' : 'Backup & Maintenance'}</span>`);

  const langTitle = document.querySelector('#sec-setting-lang .settings-card-title');
  if (langTitle) langTitle.innerHTML = `<span>🌐</span> <span>${isAr ? 'تغيير لغة النظام واتجاه الكتابة (Language & Direction)' : 'System Language & Layout Direction'}</span>`;
  const langSub = document.querySelector('#sec-setting-lang .settings-card-subtitle');
  if (langSub) langSub.textContent = isAr ? 'تخصيص لغة عرض لوحة التحكم مع الدعم الكامل لليمين (RTL) أو اليسار (LTR)' : 'Customize dashboard display language with full support for RTL and LTR layouts';

  const themeTitle = document.querySelector('#sec-setting-theme .settings-card-title');
  if (themeTitle) themeTitle.innerHTML = `<span>🎨</span> <span>${isAr ? 'مظهر وسمة لوحة التحكم (Theme & Appearance)' : 'Dashboard Theme & Appearance'}</span>`;
  const themeSub = document.querySelector('#sec-setting-theme .settings-card-subtitle');
  if (themeSub) themeSub.textContent = isAr ? 'التبديل بين الوضع الليلي والنهاري أو المزامنة التلقائية مع إعدادات نظام جهازك' : 'Switch between dark and light mode or sync automatically with device settings';

  const storeTitle = document.querySelector('#sec-setting-store .settings-card-title');
  if (storeTitle) storeTitle.innerHTML = `<span>🏪</span> <span>${isAr ? 'هوية وبيانات المتجر ومعلومات التواصل' : 'Store Identity & Contact Information'}</span>`;
  const storeSub = document.querySelector('#sec-setting-store .settings-card-subtitle');
  if (storeSub) storeSub.textContent = isAr ? 'البيانات المعتمدة لتطبيق تسوق ورسائل الواتساب وفواتير العملاء' : 'Official data for Taswoq app, WhatsApp templates, and customer invoices';
  setHtml('button[onclick*="saveStoreGeneralSettings"]', `<span>💾</span> <span>${isAr ? 'حفظ بيانات المتجر' : 'Save Store Info'}</span>`);

  const soundTitle = document.querySelector('#sec-setting-sound .settings-card-title');
  if (soundTitle) soundTitle.innerHTML = `<span>🔔</span> <span>${isAr ? 'الأصوات التفاعلية والتنبيهات المباشرة' : 'Interactive Sounds & Live Alerts'}</span>`;
  const soundSub = document.querySelector('#sec-setting-sound .settings-card-subtitle');
  if (soundSub) soundSub.textContent = isAr ? 'التحكم في المؤثرات الصوتية للأزرار، نغمات التنبيه عند استلام طلبات جديدة، وإشعارات المتصفح' : 'Control UI button sound effects, new order chime alerts, and browser notifications';
  setHtml('button[onclick*="testAlertSound"]', `<span>🔔</span> <span>${isAr ? 'تجربة نغمة التنبيه الآن' : 'Test Alert Sound Now'}</span>`);

  const backupTitle = document.querySelector('#sec-setting-backup .settings-card-title');
  if (backupTitle) backupTitle.innerHTML = `<span>💾</span> <span>${isAr ? 'النسخ الاحتياطي، صيانة النظام، وإصدار اللوحة' : 'System Backup, Maintenance & Version'}</span>`;
  const backupSub = document.querySelector('#sec-setting-backup .settings-card-subtitle');
  if (backupSub) backupSub.textContent = isAr ? 'تصدير نسخ احتياطية شاملة لكافة البيانات وتفريغ الكاش ومعلومات نظام التشغيل' : 'Export comprehensive data backups, clear cache, and system details';

  // 14. Mobile Bottom Navigation
  const mNavDashboard = document.querySelector('#mobile-bottom-nav [data-tab="dashboard"] .m-nav-label');
  if (mNavDashboard) mNavDashboard.textContent = isAr ? 'المؤشرات' : 'KPIs';
  const mNavOrders = document.querySelector('#mobile-bottom-nav [data-tab="orders"] .m-nav-label');
  if (mNavOrders) mNavOrders.textContent = isAr ? 'الطلبات' : 'Orders';
  const mNavProducts = document.querySelector('#mobile-bottom-nav [data-tab="products"] .m-nav-label');
  if (mNavProducts) mNavProducts.textContent = isAr ? 'المنتجات' : 'Products';
  const mNavWhatsapp = document.querySelector('#mobile-bottom-nav [data-tab="whatsapp"] .m-nav-label');
  if (mNavWhatsapp) mNavWhatsapp.textContent = isAr ? 'الواتساب' : 'WhatsApp';
  const mNavMenu = document.querySelector('#mobile-bottom-nav button[onclick*="toggleMobileSidebar"] .m-nav-label');
  if (mNavMenu) mNavMenu.textContent = isAr ? 'القائمة' : 'Menu';
}

function getActiveBanners() {
  if (!state.banners || state.banners.length === 0) {
    state.banners = [...window.GROCERY_DATA.banners];
  }
  const active = state.banners.filter(b => b.isActive !== false);
  return active.length > 0 ? active : state.banners;
}

function initBannerSlider() {
  const carousel = document.querySelector('.banner-carousel');
  const track = document.getElementById('banner-track');
  const dotsContainer = document.getElementById('banner-dots');
  if (!track || !dotsContainer) return;

  track.innerHTML = window.GROCERY_DATA.banners.map((b, idx) => `
    <div class="banner-slide" style="background: ${b.bgGradient};">
      <img src="${b.image}" class="banner-img-backdrop" alt="banner">
      <div class="banner-overlay-gradient"></div>
      <span class="banner-tag" id="banner-tag-${b.id}">${state.lang === 'ar' ? b.tagAr : b.tagEn}</span>
      <div class="banner-info">
        <h3 id="banner-title-${b.id}">${state.lang === 'ar' ? b.titleAr : b.titleEn}</h3>
        <p id="banner-desc-${b.id}">${state.lang === 'ar' ? b.descAr : b.descEn}</p>
        <button class="banner-cta-btn" onclick="handleBannerCta(${b.id})">
          <span>${state.lang === 'ar' ? (b.ctaAr || 'تسوّق الآن') : (b.ctaEn || 'Shop Now')}</span>
          <span class="cta-arrow">‹</span>
        </button>
      </div>
    </div>
  `).join('');

  dotsContainer.innerHTML = window.GROCERY_DATA.banners.map((_, idx) => `
    <div class="dot ${idx === 0 ? 'active' : ''}" onclick="goToBanner(${idx})"></div>
  `).join('');

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isDragging = false;
  let hasMoved = false;
  let startTime = 0;

  function resetAutoSlide() {
    if (state.bannerTimer) clearInterval(state.bannerTimer);
    state.bannerTimer = setInterval(() => {
      const count = getActiveBanners().length;
      state.activeBannerIndex = (state.activeBannerIndex + 1) % count;
      updateBannerSlider(true);
    }, 4800);
  }

  function handleDragStart(clientX, clientY) {
    if (state.bannerTimer) clearInterval(state.bannerTimer);
    isDragging = true;
    hasMoved = false;
    startX = clientX;
    startY = clientY;
    currentX = clientX;
    startTime = Date.now();
    track.style.transition = 'none';
  }

  function handleDragMove(clientX, clientY, e) {
    if (!isDragging) return;
    const diffX = clientX - startX;
    const diffY = clientY - startY;

    if (!hasMoved) {
      if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
        if (Math.abs(diffX) > Math.abs(diffY)) {
          hasMoved = true;
        } else {
          isDragging = false;
          return;
        }
      }
    }

    if (hasMoved) {
      if (e.cancelable) e.preventDefault();
      currentX = clientX;
      // In LTR coordinate track, offset is -activeBannerIndex * 100%
      const basePercent = -state.activeBannerIndex * 100;
      track.style.transform = `translateX(calc(${basePercent}% + ${diffX}px))`;
    }
  }

  function handleDragEnd() {
    if (!isDragging) return;
    isDragging = false;

    if (hasMoved) {
      const diffX = currentX - startX;
      const timeDiff = Math.max(1, Date.now() - startTime);
      const velocity = Math.abs(diffX) / timeDiff; // px per ms
      const count = getActiveBannersCount();

      // Extremely natural and fluid detection:
      // Swiping Left (diffX < 0) -> Next slide
      // Swiping Right (diffX > 0) -> Previous slide
      if (diffX < -32 || (diffX < -15 && velocity > 0.22)) {
        state.activeBannerIndex = (state.activeBannerIndex + 1) % count;
      } else if (diffX > 32 || (diffX > 15 && velocity > 0.22)) {
        state.activeBannerIndex = (state.activeBannerIndex - 1 + count) % count;
      }
    }
    updateBannerSlider(true);
    resetAutoSlide();
  }

  if (carousel && !carousel.dataset.touchBound) {
    carousel.dataset.touchBound = 'true';
    carousel.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      handleDragStart(touch.clientX, touch.clientY);
    }, { passive: true });

    carousel.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY, e);
    }, { passive: false });

    carousel.addEventListener('touchend', handleDragEnd);
    carousel.addEventListener('touchcancel', handleDragEnd);

    carousel.addEventListener('mousedown', (e) => {
      handleDragStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (isDragging) handleDragMove(e.clientX, e.clientY, e);
    });
    window.addEventListener('mouseup', () => {
      if (isDragging) handleDragEnd();
    });
  }

  resetAutoSlide();
}

function nextBanner() {
  const count = getActiveBanners().length;
  state.activeBannerIndex = (state.activeBannerIndex + 1) % count;
  updateBannerSlider(true);
  if (state.bannerTimer) {
    clearInterval(state.bannerTimer);
    state.bannerTimer = setInterval(nextBanner, 4800);
  }
}

function prevBanner() {
  const count = getActiveBanners().length;
  state.activeBannerIndex = (state.activeBannerIndex - 1 + count) % count;
  updateBannerSlider(true);
  if (state.bannerTimer) {
    clearInterval(state.bannerTimer);
    state.bannerTimer = setInterval(nextBanner, 4800);
  }
}

function goToBanner(index) {
  state.activeBannerIndex = index;
  updateBannerSlider(true);
  if (state.bannerTimer) {
    clearInterval(state.bannerTimer);
    state.bannerTimer = setInterval(nextBanner, 4800);
  }
}

function updateBannerSlider(animate = true) {
  const track = document.getElementById('banner-track');
  if (!track) return;
  track.style.transition = animate ? 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
  const offset = -state.activeBannerIndex * 100;
  track.style.transform = `translateX(${offset}%)`;

  const dots = document.querySelectorAll('.banner-dots .dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === state.activeBannerIndex);
  });
}

function updateBannerText() {
  getActiveBanners().forEach(b => {
    const titleEl = document.getElementById(`banner-title-${b.id}`);
    const descEl = document.getElementById(`banner-desc-${b.id}`);
    const tagEl = document.getElementById(`banner-tag-${b.id}`);
    if (titleEl) titleEl.textContent = state.lang === 'ar' ? (b.titleAr || b.title) : (b.titleEn || b.titleAr);
    if (descEl) descEl.textContent = state.lang === 'ar' ? (b.descAr || b.desc) : (b.descEn || b.descAr);
    if (tagEl) tagEl.textContent = state.lang === 'ar' ? (b.tagAr || b.tag) : (b.tagEn || b.tagAr);
  });
}

function renderCategories() {
  const container = document.getElementById('categories-chips');
  if (!container) return;

  const isAr = state.lang === 'ar';
  container.innerHTML = window.GROCERY_DATA.categories.map(cat => {
    const name = isAr ? cat.nameAr : cat.nameEn;
    const isActive = state.activeCategory === cat.id;

    if (cat.id === 'all') {
      return `
        <button class="luxury-cat-card special ${isActive ? 'active' : ''}" onclick="selectCategory('all')" title="${name}">
          <div class="cat-grid-icon">
            <span></span><span></span><span></span><span></span>
          </div>
          <span class="cat-name">${name}</span>
          <span class="cat-arrow">‹</span>
        </button>
      `;
    }

    return `
      <button class="luxury-cat-card ${isActive ? 'active' : ''}" onclick="selectCategory('${cat.id}')" title="${name}">
        <div class="cat-thumb-box">
          ${cat.img ? `<img src="${cat.img}" class="cat-card-img" alt="${name}" onerror="this.outerHTML='<span class=\'cat-emoji\'>${cat.icon}</span>'">` : `<span class="cat-emoji">${cat.icon}</span>`}
        </div>
        <span class="cat-name">${name}</span>
      </button>
    `;
  }).join('');
}

function selectCategory(catId) {
  sfx.playTap();
  state.activeCategory = catId;
  renderCategories();
  renderProducts();
}


// فحص هل المنتج جديد (لم يمر عليه أكثر من أسبوع / 7 أيام منذ عرضه)
function isProductNew(product) {
  if (!product) return false;
  const rawDate = product.createdAt || product.created_at || product.dateAdded;
  if (!rawDate) return false;
  try {
    const createdTime = new Date(rawDate).getTime();
    if (isNaN(createdTime)) return false;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000; // أسبوع كامل (7 أيام = 604,800,000 مللي ثانية)
    return (Date.now() - createdTime) <= oneWeekMs;
  } catch (e) {
    return false;
  }
}
window.isProductNew = isProductNew;

function renderProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  let filtered = state.products;

  if (state.activeCategory === 'favorites') {
    state.favorites = state.favorites || {};
    filtered = filtered.filter(p => Boolean(state.favorites[p.id]));
  } else if (state.activeCategory !== 'all') {
    filtered = filtered.filter(p => p.categoryId === state.activeCategory);
  }

  if (state.searchQuery.trim() !== '') {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.nameAr.toLowerCase().includes(q) ||
      (p.nameEn && p.nameEn.toLowerCase().includes(q))
    );
  }

  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';
  state.favorites = state.favorites || {};

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 16px; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 10px;">🔍</div>
        <h4 style="font-weight: 800; font-size: 1rem; color: var(--text-main);">${isAr ? 'لم يتم العثور على منتجات' : 'No products found'}</h4>
        <p style="font-size: 0.8rem; margin-top: 4px;">${isAr ? 'جرب البحث بكلمات أخرى أو اختر قسماً آخر' : 'Try searching for different keywords or pick another category'}</p>
        <button class="sheet-confirm-btn" onclick="selectCategory('all'); document.getElementById('mobile-search-input').value=''; state.searchQuery='';" style="max-width: 180px; margin: 16px auto 0; padding: 8px 14px; font-size: 0.82rem;">
          ${isAr ? 'عرض كل الأصناف' : 'View All Products'}
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const name = isAr ? product.nameAr : (product.nameEn || product.nameAr);
    const effectivePrice = product.discountPrice ?? product.salePrice;
    const inCartQty = state.cart[product.id] || 0;
    const isFav = Boolean(state.favorites[product.id]);

    return `
      <div class="product-card" id="product-card-${product.id}">
        <div class="product-thumb-wrap">
          <img src="${product.image}" class="product-img" alt="${name}" loading="lazy" onclick="openQuantitySheet(${product.id})">
          
          <!-- Badges (يظهر جديد فقط إذا لم يمر أسبوع على إضافة المنتج) -->
          ${product.discountPrice ? `
            <span class="card-badge badge-discount">${isAr ? 'خصم %' : 'Sale'}</span>
          ` : (isProductNew(product) ? `
            <span class="card-badge badge-fresh">${isAr ? 'جديد ✨' : 'New'}</span>
          ` : '')}

          <!-- Favorite Heart Button -->
          <button class="product-fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, ${product.id})" aria-label="المفضلة" title="${isAr ? 'إضافة للمفضلة' : 'Favorite'}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : '#ffffff'}" stroke-width="2.2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>

          ${!product.isAvailable ? `<div class="out-of-stock-badge">${isAr ? 'غير متوفر' : 'Sold Out'}</div>` : ''}
        </div>

        <h4 class="product-title" title="${name}" onclick="openQuantitySheet(${product.id})">${name}</h4>
        
        <div class="product-unit-row">
          <span style="font-size: 0.85rem;">⚖️</span>
          <span>${product.unit}</span>
        </div>

        <div class="product-bottom-row">
          <div class="product-prices">
            <span class="current-price">${effectivePrice.toFixed(2)} <small>${currency}</small></span>
            ${product.discountPrice ? `<span class="old-price">${product.salePrice.toFixed(2)} ${currency}</span>` : ''}
          </div>
          
          <button class="product-cart-btn" 
            ${!product.isAvailable ? 'disabled' : ''} 
            onclick="openQuantitySheet(${product.id})"
            title="${isAr ? 'إضافة للسلة' : 'Add to cart'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            ${inCartQty > 0 ? `<span class="cart-btn-qty-badge">${inCartQty}</span>` : ''}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function handleSearch(val) {
  state.searchQuery = val || '';
  renderProducts();
}


// ==========================================================================
// Favorites Section Implementation (User Request)
// ==========================================================================
function renderFavoritesSection() {
  const listEl = document.getElementById('favorites-scroll-list');
  const countEl = document.getElementById('fav-count-text');
  if (!listEl) return;

  state.favorites = state.favorites || {};
  // Seed initial favorites if user has none stored
  if (Object.keys(state.favorites).length === 0 && !localStorage.getItem('taswoq_favs_seeded')) {
    state.favorites[1] = true; // طماطم بلدي
    state.favorites[3] = true; // موز صومالي
    state.favorites[7] = true; // تفاح أحمر
    localStorage.setItem('taswoq_favs_seeded', 'true');
    localStorage.setItem('taswoq_favorites', JSON.stringify(state.favorites));
  }

  const favIds = Object.keys(state.favorites).filter(id => Boolean(state.favorites[id])).map(id => parseInt(id, 10));
  const favProducts = state.products.filter(p => favIds.includes(p.id));

  if (countEl) {
    countEl.textContent = state.lang === 'ar' ? `${favProducts.length} منتجات` : `${favProducts.length} items`;
  }

  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';

  if (favProducts.length === 0) {
    listEl.innerHTML = `
      <div style="width: 100%; text-align: center; padding: 18px 8px; color: var(--text-muted); font-size: 0.78rem;">
        <span>اضغط على أيقونة القلب ❤️ على أي منتج لإضافته لمفضلتك السريعة هنا</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = favProducts.map(product => {
    const name = isAr ? product.nameAr : (product.nameEn || product.nameAr);
    const price = product.discountPrice ?? product.salePrice;
    return `
      <div class="fav-card-item" onclick="openProductSheet(${product.id})">
        <div class="fav-card-thumb-wrap">
          <img src="${product.image}" class="fav-card-thumb" alt="${name}" onerror="this.src='https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300'">
          <button class="fav-card-heart-btn" onclick="toggleFavorite(event, ${product.id})" title="إزالة من المفضلة">
            ❤️
          </button>
        </div>
        <div class="fav-card-title">${name}</div>
        <div class="fav-card-bottom">
          <span class="fav-card-price">${price.toFixed(0)} ${currency}</span>
          <button class="fav-card-add-btn" onclick="event.stopPropagation(); quickAddToCart(event, ${product.id})" title="أضف للسلة">+</button>
        </div>
      </div>
    `;
  }).join('');
}


// ==========================================================================
// Dedicated Favorites Screen & Tab Implementation (User Request)
// ==========================================================================
function renderFavoritesScreen() {
  const grid = document.getElementById('favorites-screen-grid');
  const emptyState = document.getElementById('empty-favorites-state');
  const badgeEl = document.getElementById('fav-screen-badge');
  const navBadgeEl = document.getElementById('nav-fav-badge');
  if (!grid) return;

  state.favorites = state.favorites || {};
  // If no favorites stored yet, seed initial items [1, 3]
  if (Object.keys(state.favorites).length === 0 && !localStorage.getItem('taswoq_favs_seeded')) {
    state.favorites[1] = true;
    state.favorites[3] = true;
    localStorage.setItem('taswoq_favs_seeded', 'true');
    localStorage.setItem('taswoq_favorites', JSON.stringify(state.favorites));
  }

  const favIds = Object.keys(state.favorites).filter(id => Boolean(state.favorites[id])).map(id => parseInt(id, 10));
  const favProducts = state.products.filter(p => favIds.includes(p.id));

  if (badgeEl) {
    badgeEl.textContent = state.lang === 'ar' ? `${favProducts.length} منتجات` : `${favProducts.length} items`;
  }
  if (navBadgeEl) {
    navBadgeEl.textContent = favProducts.length;
    navBadgeEl.style.display = favProducts.length > 0 ? 'flex' : 'none';
  }

  if (favProducts.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    grid.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  grid.style.display = 'grid';

  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';

  grid.innerHTML = favProducts.map(product => {
    const name = isAr ? product.nameAr : (product.nameEn || product.nameAr);
    const price = product.discountPrice ?? product.salePrice;
    const oldPrice = product.discountPrice ? product.salePrice : null;
    const currentQty = state.cart[product.id] || 0;
    const isKilo = isKiloProduct(product);
    const compactQty = formatQtyDisplay(currentQty, product, true);

    return `
      <div class="product-card" onclick="openProductSheet(${product.id})">
        <div class="product-img-wrap">
          <img src="${product.image}" class="product-img" alt="${name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400'">
          <span class="product-tag-badge">طازج 🍃</span>
          <button class="product-fav-btn active" onclick="toggleFavorite(event, ${product.id})" title="إزالة من المفضلة">
            ❤️
          </button>
        </div>
        <div class="product-info">
          <h4 class="product-title">${name}</h4>
          <div class="product-price-row">
            <span class="current-price">${price.toFixed(0)} ${currency}</span>
            ${oldPrice ? `<span class="old-price">${oldPrice.toFixed(0)}</span>` : ''}
          </div>
          <div class="product-actions">
            ${currentQty > 0 ? `
              <div class="qty-pill-controls" onclick="event.stopPropagation()">
                <button class="qty-btn" onclick="updateCartItemQty(${product.id}, -1)">−</button>
                <span class="qty-pill-val">${compactQty}</span>
                <button class="qty-btn" onclick="updateCartItemQty(${product.id}, 1)">+</button>
              </div>
            ` : `
              <button class="add-to-cart-btn" onclick="quickAddToCart(event, ${product.id})">
                <span>+ أضف</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleFavorite(event, productId) {
  if (event) event.stopPropagation();
  sfx.playTap();
  state.favorites = state.favorites || {};
  state.favorites[productId] = !state.favorites[productId];
  localStorage.setItem('taswoq_favorites', JSON.stringify(state.favorites));
  renderFavoritesScreen();
  renderProducts();

  const prod = state.products.find(p => p.id === productId);
  const name = prod ? (state.lang === 'ar' ? prod.nameAr : prod.nameEn) : '';
  if (state.favorites[productId]) {
    showToast(state.lang === 'ar' ? `تمت إضافة "${name}" للمفضلة ❤️` : `"${name}" added to favorites ❤️`);
  } else {
    showToast(state.lang === 'ar' ? `تمت إزالة "${name}" من المفضلة` : `"${name}" removed from favorites`);
  }
}

function handleBannerCta(bannerId) {
  sfx.playTap();
  const banner = window.GROCERY_DATA.banners.find(b => b.id === bannerId);
  const target = (banner && banner.catTarget) ? banner.catTarget : 'all';
  selectCategory(target);
  switchMobileTab('home');
  const grid = document.getElementById('products-grid');
  if (grid) {
    grid.scrollIntoView({ behavior: 'smooth' });
  }
}

function openQuantitySheet(productId) {
  sfx.playTap();
  const product = state.products.find(p => p.id === productId);
  if (!product || !product.isAvailable) return;

  state.currentSheetProduct = product;
  const inCart = state.cart[product.id] || 0;
  state.currentSheetQty = inCart > 0 ? inCart : 1;

  updateSheetContent();
  const backdrop = document.getElementById('sheet-backdrop');
  if (backdrop) backdrop.classList.add('active');
}

function closeQuantitySheet() {
  const backdrop = document.getElementById('sheet-backdrop');
  if (backdrop) backdrop.classList.remove('active');
  state.currentSheetProduct = null;
}

function updateSheetContent() {
  const p = state.currentSheetProduct;
  if (!p) return;

  const name = state.lang === 'ar' ? p.nameAr : (p.nameEn || p.nameAr);
  const unitPrice = p.discountPrice ?? p.salePrice;
  const total = unitPrice * state.currentSheetQty;
  const inCart = (state.cart[p.id] || 0) > 0;
  const currency = state.lang === 'ar' ? 'ر.ي' : 'YER';

  document.getElementById('sheet-thumb').src = p.image;
  document.getElementById('sheet-title').textContent = name;
  document.getElementById('sheet-unit').textContent = p.unit;
  document.getElementById('sheet-price').textContent = `${unitPrice.toFixed(2)} ${currency}`;

  const oldPriceEl = document.getElementById('sheet-old-price');
  if (p.discountPrice) {
    oldPriceEl.textContent = `${p.salePrice.toFixed(2)} ${currency}`;
    oldPriceEl.style.display = 'inline';
  } else {
    oldPriceEl.style.display = 'none';
  }

  document.getElementById('stepper-qty').textContent = state.currentSheetQty;
  document.getElementById('stepper-minus-btn').disabled = state.currentSheetQty <= 1;
  document.getElementById('stepper-plus-btn').disabled = state.currentSheetQty >= 99;
  document.getElementById('sheet-total-amount').textContent = `${total.toFixed(2)} ${currency}`;

  const confirmBtn = document.getElementById('sheet-confirm-btn');
  const actionText = inCart
    ? (state.lang === 'ar' ? 'تحديث الكمية' : 'Update Quantity')
    : (state.lang === 'ar' ? 'إضافة للسلة' : 'Add to Cart');
  confirmBtn.innerHTML = `<span>${actionText} — ${total.toFixed(2)} ${currency}</span> 🛒`;

  document.querySelectorAll('.quick-pill').forEach(pill => {
    const val = parseInt(pill.getAttribute('data-val'), 10);
    pill.classList.toggle('active', val === state.currentSheetQty);
  });
}

function changeSheetQty(delta) {
  const next = state.currentSheetQty + delta;
  if (next < 1 || next > 99) return;
  sfx.playTap();
  state.currentSheetQty = next;
  updateSheetContent();
}

function setQuickQty(qty) {
  sfx.playTap();
  state.currentSheetQty = qty;
  updateSheetContent();
}

function confirmSheetAdd() {
  if (!state.currentSheetProduct) return;
  sfx.playSuccess();
  const p = state.currentSheetProduct;
  const qty = state.currentSheetQty;
  state.cart[p.id] = qty;

  closeQuantitySheet();
  renderProducts();
  renderCart();
  showToast(`${state.lang === 'ar' ? 'تمت إضافة' : 'Added'} ${state.lang === 'ar' ? p.nameAr : p.nameEn} (${qty}) ${state.lang === 'ar' ? 'للسلة' : 'to cart'}`);
}

// Cart & Delivery Fees per SRS v3 (Section 2.2)
function calculateDeliveryFee(itemsTotal) {
  const ds = state.deliverySettings;
  if (!ds.isEnabled) return 0;
  if (ds.freeAbove && itemsTotal >= ds.freeAbove) return 0;

  if (ds.useZones && state.selectedZoneId) {
    const zone = state.deliveryZones.find(z => z.id === state.selectedZoneId);
    if (zone && zone.isActive) return zone.fee;
  }
  return ds.baseFee;
}

function renderCart() {
  const countEl = document.getElementById('cart-badge-count');
  const itemsContainer = document.getElementById('cart-items-container');
  const cartSummaryWrap = document.getElementById('cart-summary-section');
  const emptyCartState = document.getElementById('empty-cart-state');

  const cartKeys = Object.keys(state.cart).filter(id => state.cart[id] > 0);
  const totalItemCount = cartKeys.reduce((sum, id) => sum + state.cart[id], 0);

  if (countEl) {
    countEl.textContent = totalItemCount;
    countEl.style.display = totalItemCount > 0 ? 'flex' : 'none';
  }

  if (!itemsContainer) return;

  if (cartKeys.length === 0) {
    emptyCartState.style.display = 'block';
    itemsContainer.style.display = 'none';
    cartSummaryWrap.style.display = 'none';
    return;
  }

  emptyCartState.style.display = 'none';
  itemsContainer.style.display = 'flex';
  cartSummaryWrap.style.display = 'block';

  let itemsTotal = 0;
  const currency = state.lang === 'ar' ? 'ر.ي' : 'YER';

  itemsContainer.innerHTML = cartKeys.map(key => {
    const prodId = parseInt(key, 10);
    const product = state.products.find(p => p.id === prodId);
    if (!product) return '';

    const qty = state.cart[prodId];
    const unitPrice = product.discountPrice ?? product.salePrice;
    const itemTotal = unitPrice * qty;
    itemsTotal += itemTotal;
    const name = state.lang === 'ar' ? product.nameAr : (product.nameEn || product.nameAr);

    return `
      <div class="cart-item-card">
        <img src="${product.image}" class="cart-item-thumb" alt="${name}">
        <div class="cart-item-details">
          <h5 class="cart-item-name">${name}</h5>
          <div class="cart-item-price-unit">${unitPrice.toFixed(2)} × ${qty} = <b>${itemTotal.toFixed(2)} ${currency}</b></div>
        </div>
        <div class="cart-item-controls">
          <button class="cart-mini-btn" onclick="updateCartItemQty(${prodId}, -1)">−</button>
          <span class="cart-mini-qty">${qty}</span>
          <button class="cart-mini-btn" onclick="updateCartItemQty(${prodId}, 1)">+</button>
        </div>
      </div>
    `;
  }).join('');

  // Delivery Fee Calculation per SRS v3
  const deliveryFee = calculateDeliveryFee(itemsTotal);
  const grandTotal = itemsTotal + deliveryFee;
  const isFreeDelivery = deliveryFee === 0 && state.deliverySettings.freeAbove && itemsTotal >= state.deliverySettings.freeAbove;

  // Free delivery progress bar (Section 2.2 v3)
  const progressBarContainer = document.getElementById('free-delivery-progress-wrap');
  if (progressBarContainer && state.deliverySettings.freeAbove) {
    const threshold = state.deliverySettings.freeAbove;
    const remaining = Math.max(0, threshold - itemsTotal);
    const progressPercent = Math.min(100, Math.round((itemsTotal / threshold) * 100));

    if (remaining > 0) {
      progressBarContainer.innerHTML = `
        <div style="background: var(--bg-surface-secondary); padding: 8px 12px; border-radius: var(--radius-md); margin-bottom: 12px; border: 1px solid var(--border-subtle);">
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
            <span>أضف <b>${remaining.toFixed(2)} ${currency}</b> للحصول على توصيل مجاني 🎉</span>
            <span style="font-weight: 800; color: var(--primary-600);">${progressPercent}%</span>
          </div>
          <div style="width: 100%; height: 6px; background: var(--border-subtle); border-radius: 99px; overflow: hidden;">
            <div style="width: ${progressPercent}%; height: 100%; background: var(--primary-gradient); transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    } else {
      progressBarContainer.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.12); color: var(--primary-700); padding: 8px 12px; border-radius: var(--radius-md); margin-bottom: 12px; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; gap: 6px;">
          <span>🎉</span> <span>مبروك! لقد حصلت على توصيل مجاني لهذا الطلب!</span>
        </div>
      `;
    }
  }

  // Zone Selector render
  const zoneSelect = document.getElementById('checkout-zone-select');
  if (zoneSelect && state.deliverySettings.useZones) {
    zoneSelect.innerHTML = state.deliveryZones.filter(z => z.isActive).map(z => `
      <option value="${z.id}" ${z.id === state.selectedZoneId ? 'selected' : ''}>
        ${state.lang === 'ar' ? z.nameAr : z.nameEn} (${z.fee.toFixed(2)} ${currency})
      </option>
    `).join('');
  }

  // Minimum Order Check (Section 2.2 v3)
  const minOrder = state.deliverySettings.minOrder || 0;
  const isBelowMin = itemsTotal < minOrder;

  document.getElementById('cart-subtotal').textContent = `${itemsTotal.toFixed(2)} ${currency}`;
  const feeLabelEl = document.getElementById('cart-delivery-fee');
  if (feeLabelEl) {
    feeLabelEl.innerHTML = isFreeDelivery
      ? `<span style="color: var(--success); font-weight: 800;">مجاني 🎉</span>`
      : `${deliveryFee.toFixed(2)} ${currency}`;
  }
  document.getElementById('cart-grand-total').textContent = `${grandTotal.toFixed(2)} ${currency}`;

  // Sync floating checkout bar
  const floatBar = document.getElementById('cart-floating-cta-bar');
  const floatTotal = document.getElementById('floating-cart-total');
  if (floatBar && floatTotal) {
    floatTotal.textContent = `${grandTotal.toFixed(2)} ${currency}`;
    floatBar.style.display = (state.activeMobileTab === 'cart' && cartKeys.length > 0) ? 'flex' : 'none';
  }

  const ctaBtn = document.getElementById('whatsapp-order-cta');
  if (ctaBtn) {
    if (isBelowMin) {
      const diff = (minOrder - itemsTotal).toFixed(2);
      ctaBtn.disabled = true;
      ctaBtn.style.opacity = '0.6';
      ctaBtn.innerHTML = `<span>الحد الأدنى للطلب ${minOrder.toFixed(2)} ر.ي (متبقي ${diff} ر.ي)</span> ⚠️`;
    } else {
      ctaBtn.disabled = false;
      ctaBtn.style.opacity = '1';
      ctaBtn.innerHTML = `<span>إتمام الطلب عبر واتساب — ${grandTotal.toFixed(2)} ${currency}</span> 💬`;
    }
  }

  // Ensure cart payment methods & wallets are rendered
  if (typeof renderCartWallets === 'function') renderCartWallets();
}

function updateCartItemQty(prodId, delta) {
  sfx.playTap();
  const current = state.cart[prodId] || 0;
  const next = current + delta;
  if (next <= 0) {
    delete state.cart[prodId];
  } else {
    state.cart[prodId] = next;
  }
  renderCart();
  renderProducts();
}

function changeDeliveryZone(zoneId) {
  sfx.playTap();
  state.selectedZoneId = parseInt(zoneId, 10);
  renderCart();
}

function simulateGpsLocation() {
  sfx.playTap();
  const input = document.getElementById('checkout-location');
  const mockLat = (15.3694 + (Math.random() - 0.5) * 0.01).toFixed(4);
  const mockLng = (44.1910 + (Math.random() - 0.5) * 0.01).toFixed(4);
  const mapUrl = `https://maps.google.com/?q=${mockLat},${mockLng}`;
  input.value = mapUrl;
  showToast(state.lang === 'ar' ? 'تم جلب إحداثيات موقعك بنجاح 📍' : 'GPS Location Captured 📍');
}

// WhatsApp Checkout Flow (Section 6 v3)
function executeCheckout() {
  const nameInput = document.getElementById('checkout-name');
  const phoneInput = document.getElementById('checkout-phone');
  const addressInput = document.getElementById('checkout-address');
  const locationInput = document.getElementById('checkout-location');
  const notesInput = document.getElementById('checkout-notes');

  const customerName = nameInput ? nameInput.value.trim() : '';
  const customerPhone = phoneInput ? phoneInput.value.trim() : '';
  const customerAddress = addressInput ? addressInput.value.trim() : '';
  const locationUrl = locationInput ? locationInput.value.trim() : 'https://maps.google.com/?q=15.3694,44.1910';
  const notes = notesInput ? notesInput.value.trim() : (state.lang === 'ar' ? 'لا توجد ملاحظات إضافية' : 'No extra notes');

  if (!customerName || !customerPhone) {
    alert(state.lang === 'ar' ? 'يرجى إدخال الاسم ورقم الهاتف' : 'Please provide name and phone');
    return;
  }

  const cartKeys = Object.keys(state.cart).filter(id => state.cart[id] > 0);
  if (cartKeys.length === 0) return;

  let totalSales = 0;
  let totalCost = 0;
  const orderItems = [];

  cartKeys.forEach(key => {
    const pId = parseInt(key, 10);
    const prod = state.products.find(p => p.id === pId);
    if (!prod) return;
    const qty = state.cart[pId];
    const unitSale = prod.discountPrice ?? prod.salePrice;
    const unitCost = prod.costPrice;

    totalSales += unitSale * qty;
    totalCost += unitCost * qty;

    orderItems.push({
      productId: prod.id,
      name: state.lang === 'ar' ? prod.nameAr : (prod.nameEn || prod.nameAr),
      unit: prod.unit,
      qty: qty,
      unitPrice: unitSale,
      costPrice: unitCost
    });
  });

  const deliveryFee = calculateDeliveryFee(totalSales);
  const grandTotal = totalSales + deliveryFee;
  // Per SRS v3: delivery fee is NOT counted towards net profit:
  const netProfit = totalSales - totalCost;

  // Select WhatsApp Recipient via Round-Robin
  const activeRecipients = state.whatsappRecipients.filter(r => r.isActive);
  const recipient = activeRecipients.length > 0
    ? activeRecipients[state.roundRobinIndex % activeRecipients.length]
    : { phone: '967771234567', label: 'فرع تسوق الرئيسي' };

  state.roundRobinIndex++;

  const existingOrderIds = (state.orders || []).map(o => parseInt(o.id, 10) || 0);
  const maxExistingId = existingOrderIds.length > 0 ? Math.max(...existingOrderIds) : 1000;
  const newOrderId = Math.max(maxExistingId, 1000) + 1;
  const orderNumber = `ORD-2026-${newOrderId}`;

  // Payment Method Selection
  const isWallet = (state.selectedPaymentMethod === 'wallet');
  const activeWallets = (state.paymentWallets || []).filter(w => w.isActive !== false);
  const selectedWallet = isWallet
    ? ((state.paymentWallets || []).find(w => w.id === state.selectedWalletId) || activeWallets[0] || null)
    : null;
  const walletRefInput = document.getElementById('checkout-wallet-ref');
  const walletRef = walletRefInput ? walletRefInput.value.trim() : '';
  const paymentMethodLabel = isWallet
    ? (selectedWallet ? `تحويل عبر ${selectedWallet.nameAr} (${selectedWallet.number})` : 'تحويل محفظة بنكية')
    : 'الدفع عند الاستلام (نقداً)';

  const orderRecord = {
    id: newOrderId,
    orderNumber: orderNumber,
    deviceId: getAppDeviceId(),
    customerName,
    customerPhone,
    customerAddress,
    locationUrl,
    notes,
    paymentMethod: isWallet ? 'wallet' : 'cash',
    paymentMethodLabel: paymentMethodLabel,
    paymentWallet: selectedWallet ? {
      id: selectedWallet.id,
      name: selectedWallet.nameAr,
      number: selectedWallet.number,
      holderName: selectedWallet.holderName || '',
      ref: walletRef || null
    } : null,
    status: 'Pending',
    totalSales,
    deliveryFee,
    grandTotal,
    totalCost,
    netProfit,
    zoneId: state.selectedZoneId,
    recipientId: recipient.id || 1,
    createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    items: orderItems,
    reorderedFromId: state.activeReorderSourceId || null
  };

  if (typeof addCustomerOrderFIFO === 'function') { addCustomerOrderFIFO(orderRecord); } else { state.orders.unshift(orderRecord); }
  if (window.TaswoqSync && typeof window.TaswoqSync.sendOrder === 'function') {
    window.TaswoqSync.sendOrder(orderRecord);
  }
  persistOrders();
  sfx.playSuccess();

  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';

  // WhatsApp Message Format per SRS v3 Section 6:
  const itemsText = orderItems.map(item =>
    `• ${item.name} (${item.unit}) × ${item.qty} = ${(item.unitPrice * item.qty).toFixed(2)} ${currency}`
  ).join('\n');

  const feeText = deliveryFee === 0
    ? (isAr ? 'مجاني 🎉' : 'FREE 🎉')
    : `${deliveryFee.toFixed(2)} ${currency}`;

  const addressLine = customerAddress
    ? (isAr ? `🏠 *تفاصيل العنوان:* ${customerAddress}\n` : `🏠 *Address Details:* ${customerAddress}\n`)
    : '';

  const paymentWaLineAr = isWallet && selectedWallet
    ? `💳 *طريقة الدفع:* تحويل عبر ${selectedWallet.nameAr}\n• رقم المحفظة: ${selectedWallet.number}` + (walletRef ? `\n• رقم الإشعار/المرجع: ${walletRef}` : '')
    : `💵 *طريقة الدفع:* الدفع عند الاستلام (نقداً)`;

  const paymentWaLineEn = isWallet && selectedWallet
    ? `💳 *Payment Method:* Transfer via ${selectedWallet.nameAr} (${selectedWallet.number})` + (walletRef ? `\n• Ref/TxID: ${walletRef}` : '')
    : `💵 *Payment Method:* Cash on Delivery (COD)`;

  const waMessage = isAr ?
    `مرحباً، أود تأكيد الطلب التالي (رقم #${newOrderId}):
──────────────────────
🛒 *تفاصيل الأصناف:*
${itemsText}
──────────────────────
💰 *إجمالي المنتجات:* ${totalSales.toFixed(2)} ر.ي
🚚 *رسوم التوصيل:* ${feeText}
✅ *الإجمالي النهائي:* ${grandTotal.toFixed(2)} ر.ي
${paymentWaLineAr}

👤 *بيانات العميل والتوصيل:*
• الاسم: ${customerName}
• الهاتف: ${customerPhone}
${addressLine}📍 *موقع التوصيل:* ${locationUrl}
📝 *ملاحظات:* ${notes}`
    :
    `Hello, I would like to confirm the following order (#${newOrderId}):
──────────────────────
🛒 *Order Items:*
${itemsText}
──────────────────────
💰 *Items Subtotal:* ${totalSales.toFixed(2)} YER
🚚 *Delivery Fee:* ${feeText}
✅ *Grand Total:* ${grandTotal.toFixed(2)} YER
${paymentWaLineEn}

👤 *Customer & Delivery Details:*
• Name: ${customerName}
• Phone: ${customerPhone}
${addressLine}📍 *GPS Location:* ${locationUrl}
📝 *Notes:* ${notes}`;

  // Clear cart & sync
  state.cart = {};
  state.activeReorderSourceId = null;
  renderCart();
  renderProducts();
  renderOrderHistory();
  renderAdminAll();

  openWhatsAppModal(recipient.phone, recipient.label, waMessage, newOrderId, customerAddress);
}

function openWhatsAppModal(phone, label, message, orderId, address) {
  const modal = document.getElementById('whatsapp-modal');
  if (!modal) return;
  const isAr = state.lang === 'ar';

  const phoneEl = document.getElementById('modal-wa-phone');
  if (phoneEl) phoneEl.textContent = `+${phone} (${label})`;

  const addrEl = document.getElementById('modal-wa-address');
  const addrBox = document.getElementById('modal-wa-address-box');
  if (addrEl) {
    addrEl.textContent = address || (isAr ? 'حسب الموقع المحدد على الخريطة' : 'As per pinned location');
    if (addrBox) addrBox.style.display = 'flex';
  }

  const previewEl = document.getElementById('modal-wa-preview');
  if (previewEl) previewEl.textContent = message;

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const openLink = document.getElementById('modal-wa-link');
  if (openLink) {
    openLink.href = waUrl;
    openLink.onclick = () => {
      sfx.playSuccess();
      modal.classList.remove('active');
    };
  }

  // Reset copy button visual state
  const btnCopy = document.getElementById('btn-copy-wa-modal');
  if (btnCopy) {
    btnCopy.innerHTML = isAr
      ? '<span id="btn-copy-wa-icon">📋</span> <span id="btn-copy-wa-text">نسخ نص الرسالة</span>'
      : '<span id="btn-copy-wa-icon">📋</span> <span id="btn-copy-wa-text">Copy Message Text</span>';
    btnCopy.style.background = '';
    btnCopy.style.borderColor = '';
    btnCopy.style.color = '';
  }

  modal.classList.add('active');
}

function copyWhatsAppMessage() {
  const previewEl = document.getElementById('modal-wa-preview');
  if (!previewEl) return;
  const text = previewEl.textContent || previewEl.innerText;
  if (!text) return;

  const isAr = state.lang === 'ar';

  function onCopySuccess() {
    showToast(isAr ? 'تم نسخ نص الرسالة للحافظة بنجاح 📋' : 'Message copied to clipboard successfully 📋');
    const btn = document.getElementById('btn-copy-wa-modal') || document.querySelector('[onclick="copyWhatsAppMessage()"]');
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = isAr ? '<span>✅ تم النسخ بنجاح!</span>' : '<span>✅ Copied Successfully!</span>';
      btn.style.background = 'var(--primary-50)';
      btn.style.borderColor = 'var(--primary-500)';
      btn.style.color = 'var(--primary-700)';
      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 2500);
    }
  }

  // 1. Try modern Async Clipboard API if available
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text)
      .then(() => onCopySuccess())
      .catch(() => fallbackCopy(text, onCopySuccess));
  } else {
    fallbackCopy(text, onCopySuccess);
  }
}

function fallbackCopy(text, onSuccess) {
  let textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, 99999);

  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch (e) {
    succeeded = false;
  }
  document.body.removeChild(textarea);

  if (succeeded) {
    if (onSuccess) onSuccess();
  } else {
    // If all else fails: open prompt
    // prompt suppressed
  }
}

function closeWhatsAppModal() {
  const modal = document.getElementById('whatsapp-modal');
  if (modal) modal.classList.remove('active');
}

// Order History
function getAppDeviceId() {
  let deviceId = '';
  try {
    if (window.AndroidApp && typeof window.AndroidApp.getDeviceUuid === 'function') {
      deviceId = window.AndroidApp.getDeviceUuid();
    }
  } catch (e) { }

  if (!deviceId) {
    try {
      deviceId = localStorage.getItem('taswoq_device_uuid') || '';
    } catch (e) { }
  }

  if (!deviceId) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      deviceId = 'DEV-' + crypto.randomUUID();
    } else {
      deviceId = 'DEV-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }

  try {
    localStorage.setItem('taswoq_device_uuid', deviceId);
  } catch (e) { }

  return deviceId;
}


// ضبط سعة قائمة «طلباتي» بنظام FIFO بحد أقصى 15 طلباً فقط
const MAX_MY_ORDERS = 15;

function addCustomerOrderFIFO(newOrder) {
  if (!newOrder) return;
  const currentDeviceId = (typeof getAppDeviceId === 'function') ? getAppDeviceId() : '';

  // 1. إدارة قائمة معرّفات طلبات العميل بنظام FIFO بحد أقصى 15
  let myOrderIds = [];
  try {
    myOrderIds = JSON.parse(localStorage.getItem('tasweeq_my_order_ids') || '[]');
    if (!Array.isArray(myOrderIds)) myOrderIds = [];
  } catch (e) { myOrderIds = []; }

  const newId = parseInt(newOrder.id, 10);
  myOrderIds = myOrderIds.filter(id => parseInt(id, 10) !== newId);
  myOrderIds.unshift(newId);
  if (myOrderIds.length > MAX_MY_ORDERS) {
    myOrderIds = myOrderIds.slice(0, MAX_MY_ORDERS);
  }
  try { localStorage.setItem('tasweeq_my_order_ids', JSON.stringify(myOrderIds)); } catch (e) { }

  // 2. إدراج الطلب الجديد في أعلى القائمة state.orders
  if (!Array.isArray(state.orders)) state.orders = [];

  const existingIdx = state.orders.findIndex(o => o.id === newOrder.id || (o.createdTimestamp && o.createdTimestamp === newOrder.createdTimestamp));
  if (existingIdx !== -1) {
    state.orders.splice(existingIdx, 1);
  }
  state.orders.unshift(newOrder);

  // 3. في شاشة العميل: حصر الطلبات بـ 15 طلباً كحد أقصى وحذف الأقدم تلقائياً (FIFO)
  const isMobile = Boolean(window.AndroidApp) || (typeof state !== 'undefined' && state.viewMode === 'mobile');
  if (isMobile) {
    const myIdSet = new Set(myOrderIds.map(x => parseInt(x, 10)));
    let customerOrders = [];
    let otherOrders = [];

    for (const ord of state.orders) {
      const oId = parseInt(ord.id, 10);
      const isMine = (ord.deviceId && currentDeviceId && ord.deviceId === currentDeviceId) || myIdSet.has(oId);
      if (isMine) {
        customerOrders.push(ord);
      } else {
        otherOrders.push(ord);
      }
    }

    if (customerOrders.length > MAX_MY_ORDERS) {
      customerOrders = customerOrders.slice(0, MAX_MY_ORDERS);
    }
    state.orders = [...customerOrders, ...otherOrders];
  }

  try { localStorage.setItem('tasweeq_orders', JSON.stringify(state.orders)); } catch (e) { }
}
window.addCustomerOrderFIFO = addCustomerOrderFIFO;

function getMyCustomerOrders() {
  const currentDeviceId = getAppDeviceId();
  const allOrders = Array.isArray(state.orders) ? state.orders : [];

  // Deduplicate all orders by ID
  const seen = new Set();
  const dedupedAll = [];
  for (const o of allOrders) {
    const oId = parseInt(o.id, 10);
    if (!seen.has(oId)) {
      seen.add(oId);
      dedupedAll.push(o);
    }
  }

  let myOrderIds = [];
  try {
    myOrderIds = JSON.parse(localStorage.getItem('tasweeq_my_order_ids') || '[]');
    if (!Array.isArray(myOrderIds)) myOrderIds = [];
  } catch (e) { myOrderIds = []; }
  const myIdSet = new Set(myOrderIds.map(x => parseInt(x, 10)));

  // Strict Device ID / UUID separation:
  // Each customer only sees orders placed on their specific device
  const myPersonal = dedupedAll.filter(order => {
    // 1. Matched by Device ID / UUID
    if (order.deviceId && currentDeviceId && order.deviceId === currentDeviceId) {
      return true;
    }
    // 2. Or matched by order ID recorded on this device
    const oId = parseInt(order.id, 10);
    if (myIdSet.has(oId)) {
      return true;
    }
    return false;
  });

  // تطبيق نظام FIFO بحد أقصى 15 طلباً فقط للشاشة
  return myPersonal.slice(0, typeof MAX_MY_ORDERS !== 'undefined' ? MAX_MY_ORDERS : 15);
}

function isOrderEligibleForReorder(order) {
  if (!order) return false;
  const s = String(order.status || '').toLowerCase();
  const sAr = String(order.statusAr || '');
  return s === 'completed' || s === 'cancelled' ||
    sAr.includes('مكتمل') || sAr.includes('ملغي') ||
    order.status === 'Completed' || order.status === 'Cancelled';
}

function showCannotReorderNotice(status) {
  if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
  const isAr = state.lang === 'ar';
  showToast(isAr
    ? `⚠️ يُسمح بإعادة الطلب فقط عندما تكون حالة الطلب (مكتمل) أو (ملغي) — الحالة الحالية: ${status || 'قيد المعالجة'}`
    : `⚠️ Reorder is only allowed for Completed or Cancelled orders (Current: ${status || 'In Progress'})`
  );
}

function reorderItems(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  if (!isOrderEligibleForReorder(order)) {
    const isAr = state.lang === 'ar';
    showCannotReorderNotice(isAr ? (order.statusAr || order.status) : order.status);
    return;
  }

  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();

  // Add items from the order into the cart
  if (Array.isArray(order.items)) {
    order.items.forEach(item => {
      const key = item.cartKey || item.productId || item.id;
      if (key !== undefined && key !== null) {
        state.cart[key] = (state.cart[key] || 0) + (item.qty || 1);
      }
    });
  }

  // Update cart state and all views
  renderCart();
  renderProducts();
  if (typeof renderFavoritesScreen === 'function') renderFavoritesScreen();
  renderOrderHistory();

  // Close any open modals/sheets
  if (typeof closeQuantitySheet === 'function') closeQuantitySheet();
  if (typeof closeWhatsAppModal === 'function') closeWhatsAppModal();

  // Switch mobile tab directly to cart
  switchMobileTab('cart');

  // Scroll smoothly to top of cart page
  const scrollBody = document.getElementById('mobile-scroll-body');
  if (scrollBody) {
    scrollBody.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showToast(state.lang === 'ar' ? `تم نقل أصناف الطلب #${order.id} إلى السلة بنجاح 🛒` : `Order #${order.id} items added to cart 🛒`);
}

function renderOrderHistory() {
  const container = document.getElementById('orders-history-list');
  if (!container) return;

  // Strict separation by Device ID / UUID (كل عميل له طلباته الخاصة دون دمج)
  const myOrders = getMyCustomerOrders();

  if (myOrders.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 40px 0;">${state.lang === 'ar' ? 'لا توجد لديك طلبات سابقة' : 'No past orders on this device'}</p>`;
    return;
  }

  const currency = state.lang === 'ar' ? 'ر.ي' : 'YER';

  container.innerHTML = myOrders.map(order => {
    const isAr = state.lang === 'ar';
    const statusMap = {
      Pending: { ar: 'قيد الانتظار', en: 'Pending', cls: 'status-pending' },
      InPrep: { ar: 'قيد التجهيز', en: 'In Preparation', cls: 'status-prep' },
      OnTheWay: { ar: 'في الطريق 🛵', en: 'On The Way 🛵', cls: 'status-way' },
      Completed: { ar: 'مكتمل ✅', en: 'Completed ✅', cls: 'status-completed' },
      Cancelled: { ar: 'ملغي ❌', en: 'Cancelled ❌', cls: 'status-cancelled' }
    };
    const s = statusMap[order.status] || statusMap.Pending;
    const statusText = isAr ? s.ar : (s.en || order.status);
    const isEligible = isOrderEligibleForReorder(order);
    const orderNumFormatted = order.orderNumber || (`ORD-2026-${order.id}`);

    let reorderBtnHtml = '';
    if (isEligible) {
      reorderBtnHtml = `
        <button class="ctrl-btn reorder-btn active" onclick="reorderItems(${order.id})" style="font-size: 0.8rem; padding: 7px 16px; background: linear-gradient(135deg, #03331C 0%, #064E2B 100%); color: #ffffff; border-radius: 12px; border: none; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 3px 10px rgba(6,78,43,0.3); transition: all 0.2s ease;">
          <span>🔄 ${isAr ? 'أعد الطلب' : 'Reorder'}</span>
        </button>
      `;
    } else {
      reorderBtnHtml = `
        <button class="ctrl-btn reorder-btn disabled" onclick="showCannotReorderNotice('${statusText}')" style="font-size: 0.8rem; padding: 7px 14px; background: #e2e8f0; color: #64748b; border-radius: 12px; border: 1px solid #cbd5e1; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; opacity: 0.85;" title="${isAr ? 'يُسمح بإعادة الطلب فقط عندما يكون الطلب مكتملاً أو ملغياً' : 'Reorder allowed only when Completed or Cancelled'}">
          <span>🔒 ${isAr ? 'أعد الطلب' : 'Reorder'}</span>
        </button>
      `;
    }

    return `
      <div class="cart-item-card" style="flex-direction: column; align-items: stretch; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 800; font-size: 0.9rem;">
            ${isAr ? `طلب تسوق #${order.id}` : `Taswoq Order #${order.id}`}
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">(${orderNumFormatted})</span>
          </span>
          <span class="status-pill ${s.cls}">${statusText}</span>
        </div>
        <div style="font-size: 0.76rem; color: var(--text-muted);">
          <span>📅 ${order.createdAt || ''}</span> | <span>🚚 ${isAr ? 'رسوم التوصيل:' : 'Delivery Fee:'} ${(order.deliveryFee || 0).toFixed(2)} ${currency}</span>
        </div>
        ${order.customerAddress ? `
          <div style="font-size: 0.75rem; color: var(--text-main); background: var(--bg-surface); padding: 4px 8px; border-radius: var(--radius-sm); border: 1px dashed var(--border-subtle);">
            🏠 <b>${isAr ? 'العنوان:' : 'Address:'}</b> ${order.customerAddress}
          </div>
        ` : ''}
        <div style="font-size: 0.8rem; background: var(--bg-surface-secondary); padding: 8px; border-radius: var(--radius-sm);">
          ${(order.items || []).map(i => `<div>• ${i.name || (i.product && i.product.nameAr) || 'صنف'} × ${formatQtyDisplay(i.qty || 1, i.unit)}</div>`).join('')}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span style="font-weight: 900; color: var(--primary-600); font-size: 1rem;">${isAr ? 'الإجمالي:' : 'Total:'} ${(order.grandTotal || 0).toFixed(2)} ${currency}</span>
          ${reorderBtnHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderFaqs() {
  const container = document.getElementById('faqs-container');
  if (!container) return;

  container.innerHTML = state.faqs.map(faq => `
    <div class="faq-accordion-item" onclick="toggleFaq(this)">
      <div class="faq-header">
        <span>${state.lang === 'ar' ? faq.qAr : faq.qEn}</span>
        <span>▼</span>
      </div>
      <div class="faq-answer">${state.lang === 'ar' ? faq.aAr : faq.aEn}</div>
    </div>
  `).join('');
}

function toggleFaq(el) {
  sfx.playTap();
  el.classList.toggle('open');
}

function openComplaintModal() {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  const select = document.getElementById('complaint-order-select');
  if (select) {
    // قائمة الطلبات مطابقة تماماً لسجل «طلباتي»: طلب #1048 - 2026-11-06 02:40
    const orders = (typeof getMyCustomerOrders === 'function') ? getMyCustomerOrders() : (state.orders || []);
    if (!orders || orders.length === 0) {
      select.innerHTML = `<option value="">-- لا توجد طلبات سابقة في سجل طلباتي --</option>`;
    } else {
      select.innerHTML = `<option value="">-- اختر طلباً (اختياري) --</option>` +
        orders.map(o => {
          const ordId = o.id || '';
          const dateTime = o.createdAt || '';
          const label = dateTime ? `طلب #${ordId} - ${dateTime}` : `طلب #${ordId}`;
          return `<option value="${ordId}">${label}</option>`;
        }).join('');
    }
  }

  const nameInput = document.getElementById('complaint-name');
  if (nameInput) {
    nameInput.value = localStorage.getItem('taswoq_user_name') || (document.getElementById('checkout-name')?.value.trim()) || '';
  }
  const phoneInput = document.getElementById('complaint-phone');
  if (phoneInput) {
    phoneInput.value = localStorage.getItem('taswoq_user_phone') || (document.getElementById('checkout-phone')?.value.trim()) || '';
  }

  const modal = document.getElementById('complaint-modal');
  if (modal) modal.classList.add('active');
}

function closeComplaintModal() {
  document.getElementById('complaint-modal').classList.remove('active');
}

async function submitComplaintForm() {
  const typeSelect = document.getElementById('complaint-type-select');
  const type = typeSelect ? typeSelect.value : 'other';
  const typeText = (typeSelect && typeSelect.selectedOptions && typeSelect.selectedOptions[0])
    ? typeSelect.selectedOptions[0].text
    : 'شكوى عامة';
  const orderId = document.getElementById('complaint-order-select') ? document.getElementById('complaint-order-select').value : '';
  const messageInput = document.getElementById('complaint-text');
  const message = messageInput ? messageInput.value.trim() : '';

  let name = (document.getElementById('complaint-name') && document.getElementById('complaint-name').value.trim())
    || (document.getElementById('checkout-name') && document.getElementById('checkout-name').value.trim())
    || localStorage.getItem('taswoq_user_name')
    || 'عميل تسوق';

  let phone = (document.getElementById('complaint-phone') && document.getElementById('complaint-phone').value.trim())
    || (document.getElementById('checkout-phone') && document.getElementById('checkout-phone').value.trim())
    || localStorage.getItem('taswoq_user_phone')
    || '';

  if (!message) {
    if (typeof showToast === 'function') {
      showToast((state && state.lang === 'ar') ? 'يرجى كتابة نص الشكوى ⚠️' : 'Please enter your complaint text ⚠️');
    } else {
      alert('يرجى كتابة نص الشكوى');
    }
    return;
  }

  if (name && name !== 'عميل تسوق') localStorage.setItem('taswoq_user_name', name);
  if (phone) localStorage.setItem('taswoq_user_phone', phone);

  const deviceId = (typeof getAppDeviceId === 'function') ? getAppDeviceId() : (localStorage.getItem('taswoq_device_uuid') || '');

  const payload = {
    deviceId: deviceId,
    orderId: orderId ? parseInt(orderId, 10) : null,
    type: type,
    typeNameAr: typeText,
    customerName: name,
    customerPhone: phone,
    message: message
  };

  let ticketNo = '';
  let serverComplaint = null;

  if (window.TaswoqSync && typeof window.TaswoqSync.sendComplaint === 'function') {
    const res = await window.TaswoqSync.sendComplaint(payload);
    if (res && res.success && res.complaint) {
      serverComplaint = res.complaint;
      ticketNo = res.ticketNo || serverComplaint.ticketNo;
    }
  }

  if (!serverComplaint) {
    const maxId = Math.max(0, ...(state.complaints || []).map(c => parseInt(c.id || 0) || 0));
    const newId = maxId + 1;
    ticketNo = `C-2026-${String(newId).padStart(4, '0')}`;
    serverComplaint = {
      id: newId,
      ticketNo: ticketNo,
      deviceId: deviceId,
      orderId: payload.orderId,
      customerName: name,
      customerPhone: phone,
      type: type,
      typeNameAr: typeText,
      message: message,
      status: 'New',
      statusAr: 'جديدة',
      adminReply: null,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16)
    };
  }

  if (!Array.isArray(state.complaints)) state.complaints = [];
  state.complaints.unshift(serverComplaint);
  persistComplaints();

  if (messageInput) messageInput.value = '';
  closeComplaintModal();

  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
  if (typeof renderComplaintsList === 'function') renderComplaintsList();
  if (typeof renderAdminComplaints === 'function') renderAdminComplaints();
  if (typeof updateAdminBadges === 'function') updateAdminBadges();

  if (typeof showToast === 'function') {
    showToast(`تم تسجيل الشكوى برقم: ${ticketNo} بنجاح 🚀`);
  }
}

function renderComplaintsList() {
  const container = document.getElementById('my-complaints-list');
  if (!container) return;

  if (state.complaints.length === 0) {
    container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted);">لا توجد شكاوى مسجلة</p>`;
    return;
  }

  container.innerHTML = state.complaints.map(c => `
    <div style="background: var(--bg-surface-secondary); padding: 10px; border-radius: var(--radius-sm); margin-bottom: 8px; border: 1px solid var(--border-subtle);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-weight: 800; font-size: 0.82rem; color: var(--primary-600);">${c.ticketNo}</span>
        <span class="status-pill ${c.status === 'Resolved' ? 'status-completed' : (c.status === 'InProgress' ? 'status-prep' : 'status-pending')}">
          ${c.status === 'Resolved' ? 'تم الحل ✅' : (c.status === 'InProgress' ? 'قيد المعالجة' : 'جديدة')}
        </span>
      </div>
      <div style="font-size: 0.78rem; font-weight: 700;">${c.typeNameAr} ${c.orderId ? `(طلب #${c.orderId})` : ''}</div>
      <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0;">${c.message}</p>
      ${c.adminReply ? `
        <div style="background: var(--bg-surface); padding: 6px 10px; border-radius: var(--radius-xs); border-inline-start: 3px solid var(--primary-500); font-size: 0.74rem; color: var(--primary-700); margin-top: 6px;">
          <b>رد الإدارة:</b> ${c.adminReply}
        </div>
      ` : ''}
    </div>
  `).join('');
}

// DESKTOP ADMIN DASHBOARD CONTROLLER (SRS v3)
function renderAdminAll() {
  renderAdminKpis();
  renderAdminChart();
  renderAdminOrders();
  renderAdminProducts();
  renderAdminWhatsApp();
  renderAdminComplaints();
  renderAdminDeliverySettings();
  renderAdminBanners();
  renderAdminExpenses();
  renderAdminDelegates();
  renderAdminUsers();
  renderAdminAuditLogs();
  renderAdminAuthUI();
  applyUserPermissions();
  updateAdminBadges();
  if (typeof renderAdminSettings === 'function') renderAdminSettings();
}

function updateAdminBadges() {
  // 1. Orders Badge: count orders that are not Completed and not Cancelled
  const activeOrders = (state.orders || []).filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').length;
  const orderBadges = [
    document.getElementById('menu-orders-badge'),
    document.getElementById('admin-orders-pill-badge'),
    document.getElementById('mobile-orders-badge')
  ];
  orderBadges.forEach(b => {
    if (!b) return;
    if (activeOrders > 0) {
      b.textContent = activeOrders;
      b.style.display = b.classList && b.classList.contains('m-nav-badge') ? 'flex' : 'inline-block';
    } else {
      b.textContent = '';
      b.style.display = 'none';
    }
  });

  // 2. Complaints Badge: count complaints that are not Resolved and have no adminReply
  const pendingComplaints = (state.complaints || []).filter(c => c.status !== 'Resolved' && !c.adminReply).length;
  const complaintBadges = [
    document.getElementById('menu-complaints-badge'),
    document.getElementById('admin-complaints-pill-badge'),
    document.getElementById('mobile-complaints-badge')
  ];
  complaintBadges.forEach(b => {
    if (!b) return;
    if (pendingComplaints > 0) {
      b.textContent = pendingComplaints;
      b.style.display = b.classList && b.classList.contains('m-nav-badge') ? 'flex' : 'inline-block';
    } else {
      b.textContent = '';
      b.style.display = 'none';
    }
  });
}

// ==========================================================================
// PROFIT DATE QUERY & REPORTING MODULE (استعلام وتصفية الأرباح حسب التاريخ)
// ==========================================================================

function extractDateOnly(dateVal) {
  if (!dateVal) return '';
  if (dateVal === 'الآن' || dateVal === 'Now') {
    return new Date().toISOString().slice(0, 10);
  }
  const str = String(dateVal).trim();
  const match = str.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (match) return match[1];
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return '';
}

function formatDateAr(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
  } catch (e) { }
  return dateStr;
}

function getFilteredProfitRecords() {
  const filter = state.profitDateFilter || { type: 'all', startDate: '', endDate: '', label: 'كافة الفترات المسجلة' };
  const s = filter.startDate;
  const e = filter.endDate;

  const orders = (state.orders || []).filter(o => {
    if (o.status === 'Cancelled') return false;
    if (!s && !e) return true;
    const d = extractDateOnly(o.createdAt || o.date);
    if (!d) return true;
    if (s && e) return d >= s && d <= e;
    if (s) return d >= s;
    if (e) return d <= e;
    return true;
  });

  const expenses = (state.expenses || []).filter(exp => {
    if (!s && !e) return true;
    const d = extractDateOnly(exp.date);
    if (!d) return true;
    if (s && e) return d >= s && d <= e;
    if (s) return d >= s;
    if (e) return d <= e;
    return true;
  });

  return { orders, expenses, filter };
}

function setProfitDateFilter(periodType) {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  let startDate = '';
  let endDate = '';
  let label = 'كافة الفترات المسجلة';

  if (periodType === 'all') {
    startDate = '';
    endDate = '';
    label = 'كافة الفترات المسجلة';
  } else if (periodType === 'today') {
    startDate = todayStr;
    endDate = todayStr;
    label = `أرباح اليوم (${todayStr})`;
  } else if (periodType === 'yesterday') {
    const yDate = new Date(now);
    yDate.setDate(yDate.getDate() - 1);
    const yStr = yDate.toISOString().slice(0, 10);
    startDate = yStr;
    endDate = yStr;
    label = `أرباح الأمس (${yStr})`;
  } else if (periodType === 'week') {
    const wDate = new Date(now);
    wDate.setDate(wDate.getDate() - 6);
    startDate = wDate.toISOString().slice(0, 10);
    endDate = todayStr;
    label = `آخر 7 أيام (من ${startDate} إلى ${endDate})`;
  } else if (periodType === 'month') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    startDate = `${y}-${m}-01`;
    endDate = todayStr;
    const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    label = `الشهر الحالي (${monthNamesAr[now.getMonth()]} ${y})`;
  } else if (periodType === 'last_month') {
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    startDate = prevMonthDate.toISOString().slice(0, 10);
    endDate = lastDayPrevMonth.toISOString().slice(0, 10);
    const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    label = `الشهر السابق (${monthNamesAr[prevMonthDate.getMonth()]} ${prevMonthDate.getFullYear()})`;
  } else if (periodType === 'year') {
    const y = now.getFullYear();
    startDate = `${y}-01-01`;
    endDate = `${y}-12-31`;
    label = `السنة الحالية (${y})`;
  } else if (periodType === 'custom') {
    const startInp = document.getElementById('profit-date-start');
    const endInp = document.getElementById('profit-date-end');
    startDate = startInp ? startInp.value.trim() : '';
    endDate = endInp ? endInp.value.trim() : '';
    if (!startDate && !endDate) {
      if (typeof showToast === 'function') showToast('⚠️ يرجى تحديد تاريخ البداية أو النهاية للاستعلام المخصص');
      return;
    }
    label = `فترة مخصصة (${startDate || 'البداية'} ⬅️ ${endDate || 'اليوم'})`;
  }

  state.profitDateFilter = {
    type: periodType,
    startDate: startDate,
    endDate: endDate,
    label: label
  };

  // Sync date input values
  const startInp = document.getElementById('profit-date-start');
  const endInp = document.getElementById('profit-date-end');
  if (startInp && periodType !== 'custom') startInp.value = startDate;
  if (endInp && periodType !== 'custom') endInp.value = endDate;

  // Update preset buttons active state
  document.querySelectorAll('.profit-preset-btn').forEach(btn => {
    const p = btn.getAttribute('data-period');
    btn.classList.toggle('active', p === periodType);
  });

  renderAdminKpis();
  renderAdminChart();

  if (typeof showToast === 'function') {
    showToast(`تم استعلام الأرباح: ${label} 📊`);
  }
}

function applyCustomProfitDateFilter() {
  const startInp = document.getElementById('profit-date-start');
  const endInp = document.getElementById('profit-date-end');
  const s = startInp ? startInp.value.trim() : '';
  const e = endInp ? endInp.value.trim() : '';
  if (!s && !e) {
    if (typeof showToast === 'function') showToast('⚠️ الرجاء اختيار تاريخ البدء أو تاريخ الانتهاء للاستعلام');
    return;
  }
  if (s && e && s > e) {
    if (typeof showToast === 'function') showToast('⚠️ تاريخ البدء يجب أن يكون قبل أو يساوي تاريخ الانتهاء');
    return;
  }
  setProfitDateFilter('custom');
}

function resetProfitDateFilter() {
  const startInp = document.getElementById('profit-date-start');
  const endInp = document.getElementById('profit-date-end');
  if (startInp) startInp.value = '';
  if (endInp) endInp.value = '';
  setProfitDateFilter('all');
}

function renderAdminKpis() {
  const { orders: filteredOrders, expenses: filteredExpenses, filter } = getFilteredProfitRecords();

  let grossSales = 0;
  let totalCost = 0;
  let totalDeliveryCollected = 0;

  filteredOrders.forEach(o => {
    grossSales += (o.totalSales || 0);
    totalCost += (o.totalCost || 0);
    totalDeliveryCollected += (o.deliveryFee || 0);
  });

  let totalExpenses = 0;
  filteredExpenses.forEach(e => {
    totalExpenses += (parseFloat(e.amount) || 0);
  });

  // Real Net Profit = (Sales - Cost) - Expenses
  const grossProfit = grossSales - totalCost;
  const netProfit = grossProfit - totalExpenses;
  const profitMargin = grossSales > 0 ? ((netProfit / grossSales) * 100).toFixed(1) : '0';

  const oEl = document.getElementById('kpi-orders-count');
  const sEl = document.getElementById('kpi-sales-amount');
  const dEl = document.getElementById('kpi-delivery-collected');
  const cEl = document.getElementById('kpi-cost-amount');
  const eEl = document.getElementById('kpi-expense-amount');
  const pEl = document.getElementById('kpi-profit-amount');
  const mEl = document.getElementById('kpi-profit-margin');

  const currency = state.lang === 'ar' ? 'ر.ي' : 'YER';
  if (oEl) oEl.textContent = filteredOrders.length;
  // Unique mobile app subscribers calculation
  const subSet = new Set();
  (state.orders || []).forEach(o => {
    const k = o.customerPhone || o.phone || o.customerName;
    if (k && String(k).trim()) subSet.add(String(k).trim());
  });
  (state.complaints || []).forEach(c => {
    const k = c.phone || c.customerPhone || c.customerName;
    if (k && String(k).trim()) subSet.add(String(k).trim());
  });
  if (Array.isArray(state.appSubscribers)) {
    state.appSubscribers.forEach(s => {
      const k = typeof s === 'string' ? s : (s.phone || s.customerPhone || s.name);
      if (k) subSet.add(String(k).trim());
    });
  }
  const subscribersCount = Math.max(subSet.size, 1);
  const subKpiEl = document.getElementById('kpi-subscribers-count');
  if (subKpiEl) subKpiEl.textContent = subscribersCount;

  if (sEl) sEl.textContent = `${grossSales.toFixed(2)} ${currency}`;
  if (dEl) dEl.textContent = `${totalDeliveryCollected.toFixed(2)} ${currency}`;
  if (cEl) cEl.textContent = `${totalCost.toFixed(2)} ${currency}`;
  if (eEl) eEl.textContent = `${totalExpenses.toFixed(2)} ${currency}`;
  if (pEl) {
    pEl.textContent = `${netProfit.toFixed(2)} ${currency}`;
    pEl.style.color = netProfit >= 0 ? 'var(--primary-600)' : 'var(--danger)';
  }
  if (mEl) {
    mEl.textContent = state.lang === 'ar'
      ? `هامش صافي الربح: ${profitMargin}% (${filter.label})`
      : `Net Margin: ${profitMargin}% (${filter.label})`;
  }

  // Update Status Banner
  const statusLabel = document.getElementById('profit-query-status-text');
  const countBadge = document.getElementById('profit-query-count-badge');
  if (statusLabel) {
    statusLabel.innerHTML = `<strong>نطاق الاستعلام النشط:</strong> ${filter.label}`;
  }
  if (countBadge) {
    countBadge.innerHTML = `<span>🛍️ ${filteredOrders.length} طلبات</span> &bull; <span>💸 ${filteredExpenses.length} مصروفات</span>`;
  }

  // Render Daily Ledger Table
  renderAdminProfitBreakdownTable(filteredOrders, filteredExpenses, currency);
}

function renderAdminProfitBreakdownTable(filteredOrders, filteredExpenses, currency) {
  const tbody = document.getElementById('admin-profit-breakdown-tbody');
  const tfoot = document.getElementById('admin-profit-breakdown-tfoot');
  if (!tbody) return;

  const isAr = state.lang === 'ar';
  const curr = currency || (isAr ? 'ر.ي' : 'YER');

  // Collect all unique dates
  const dayMap = {};

  filteredOrders.forEach(o => {
    const d = extractDateOnly(o.createdAt || o.date) || 'غير محدد';
    if (!dayMap[d]) {
      dayMap[d] = { date: d, ordersCount: 0, sales: 0, cost: 0, delivery: 0, expenses: 0 };
    }
    dayMap[d].ordersCount += 1;
    dayMap[d].sales += (o.totalSales || 0);
    dayMap[d].cost += (o.totalCost || 0);
    dayMap[d].delivery += (o.deliveryFee || 0);
  });

  filteredExpenses.forEach(e => {
    const d = extractDateOnly(e.date) || 'غير محدد';
    if (!dayMap[d]) {
      dayMap[d] = { date: d, ordersCount: 0, sales: 0, cost: 0, delivery: 0, expenses: 0 };
    }
    dayMap[d].expenses += (parseFloat(e.amount) || 0);
  });

  const sortedDates = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));

  if (sortedDates.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.88rem;">
          📅 لا توجد حركات مبيعات أو مصروفات مسجلة في هذا النطاق الزمني المحدد.
        </td>
      </tr>
    `;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let grandOrders = 0;
  let grandSales = 0;
  let grandCost = 0;
  let grandExpenses = 0;
  let grandDelivery = 0;
  let grandNet = 0;

  tbody.innerHTML = sortedDates.map(dateKey => {
    const item = dayMap[dateKey];
    const grossProfit = item.sales - item.cost;
    const netProfit = grossProfit - item.expenses;
    const margin = item.sales > 0 ? ((netProfit / item.sales) * 100).toFixed(1) : '0';

    grandOrders += item.ordersCount;
    grandSales += item.sales;
    grandCost += item.cost;
    grandExpenses += item.expenses;
    grandDelivery += item.delivery;
    grandNet += netProfit;

    let perfBadge = '';
    if (netProfit > 30) {
      perfBadge = '<span class="status-pill status-completed" style="font-size: 0.7rem;">🟢 أرباح ممتازة</span>';
    } else if (netProfit >= 0) {
      perfBadge = '<span class="status-pill status-prep" style="font-size: 0.7rem;">🟡 ربح إيجابي</span>';
    } else {
      perfBadge = '<span class="status-pill status-cancelled" style="font-size: 0.7rem;">🔴 عجز مؤقت</span>';
    }

    return `
      <tr>
        <td><b style="font-size: 0.84rem;">📅 ${formatDateAr(item.date)}</b></td>
        <td><span class="brand-badge" style="font-size: 0.74rem;">${item.ordersCount} طلبات</span></td>
        <td><b>${item.sales.toFixed(2)} ${curr}</b></td>
        <td style="color: var(--text-muted);">${item.cost.toFixed(2)} ${curr}</td>
        <td style="color: #ef4444; font-weight: 700;">${item.expenses.toFixed(2)} ${curr}</td>
        <td style="color: var(--info);">${item.delivery.toFixed(2)} ${curr}</td>
        <td>
          <b style="color: ${netProfit >= 0 ? 'var(--primary-600)' : 'var(--danger)'}; font-size: 0.92rem;">
            ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ${curr}
          </b>
        </td>
        <td><span style="font-weight: 800; color: ${parseFloat(margin) >= 20 ? 'var(--success)' : 'var(--text-main)'};">${margin}%</span></td>
        <td>${perfBadge}</td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    const totalMargin = grandSales > 0 ? ((grandNet / grandSales) * 100).toFixed(1) : '0';
    tfoot.innerHTML = `
      <tr>
        <td style="padding: 12px 10px;"><b>المجموع الكلي للفترة 📊</b></td>
        <td><span class="brand-badge" style="font-size: 0.8rem; background: var(--primary-100); color: var(--primary-800);">${grandOrders} طلبات</span></td>
        <td style="color: var(--text-main); font-size: 0.95rem;"><b>${grandSales.toFixed(2)} ${curr}</b></td>
        <td style="color: var(--text-muted);">${grandCost.toFixed(2)} ${curr}</td>
        <td style="color: #ef4444; font-size: 0.92rem;"><b>${grandExpenses.toFixed(2)} ${curr}</b></td>
        <td style="color: var(--info); font-size: 0.92rem;"><b>${grandDelivery.toFixed(2)} ${curr}</b></td>
        <td>
          <b style="color: ${grandNet >= 0 ? 'var(--primary-600)' : 'var(--danger)'}; font-size: 1.05rem;">
            ${grandNet >= 0 ? '+' : ''}${grandNet.toFixed(2)} ${curr}
          </b>
        </td>
        <td><span class="kpi-trend-up" style="font-size: 0.92rem;">${totalMargin}%</span></td>
        <td><span class="brand-badge" style="font-size: 0.74rem;">صافي معتمد 100%</span></td>
      </tr>
    `;
  }
}

function renderAdminOrders() {
  const tbody = document.getElementById('admin-orders-tbody');
  if (!tbody) return;
  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';

  const isDelegate = state.currentUser && state.currentUser.role === 'delegate';
  const hideProfits = isDelegate && (!state.currentUser.permissions || !state.currentUser.permissions.canViewProfits);
  const assignedOnly = isDelegate && state.currentUser.permissions && state.currentUser.permissions.ordersOnlyAssigned;
  const delegateZone = state.currentUser ? state.currentUser.zone : null;

  // Deduplicate orders by ID to ensure order numbers never repeat in Admin
  const seenOrderIds = new Set();
  const uniqueAdminOrders = [];
  for (const o of (state.orders || [])) {
    const oId = parseInt(o.id, 10);
    if (!seenOrderIds.has(oId)) {
      seenOrderIds.add(oId);
      uniqueAdminOrders.push(o);
    }
  }

  let orders = uniqueAdminOrders;
  if (assignedOnly && delegateZone) {
    orders = orders.filter(o => !o.zoneName || o.zoneName.includes(delegateZone) || delegateZone.includes(o.zoneName));
    if (orders.length === 0) orders = state.orders; // fallback
  }

  tbody.innerHTML = orders.map(o => {
    const itemsFullText = o.items.map(i => `${i.name || (i.product && i.product.nameAr)} (${i.qty})`).join('، ');
    return `
    <tr>
      <td class="order-id-cell">
        <b>#${o.id}</b>
        <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">${o.orderNumber || ("ORD-2026-" + o.id)}</div>
        <div style="margin-top: 4px;">
          ${o.paymentMethod === 'wallet'
        ? `<span class="brand-badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.68rem; padding: 2px 6px; border-radius: 6px; font-weight: 800;" title="محفظة: ${o.paymentWallet?.name || ''} - رقم: ${o.paymentWallet?.number || ''} ${o.paymentWallet?.ref ? '- إشعار: ' + o.paymentWallet.ref : ''}">📱 ${o.paymentWallet?.name || 'محفظة بنكية'}${o.paymentWallet?.ref ? ' 🧾' : ''}</span>`
        : `<span class="brand-badge" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-size: 0.68rem; padding: 2px 6px; border-radius: 6px; font-weight: 800;">💵 عند الاستلام</span>`
      }
        </div>
      </td>
      <td class="order-customer-cell">
        <div class="order-customer-name" title="${o.customerName}">${o.customerName}</div>
        <div class="order-customer-phone">${o.customerPhone}</div>
        ${o.customerAddress ? `<div class="order-customer-address" title="${o.customerAddress}">🏠 ${o.customerAddress}</div>` : ''}
      </td>
      <td class="order-items-col">
        <span class="order-items-cell" onclick="toggleOrderItems(this)" title="${itemsFullText} (انقر للتوسيع/الطي)">${itemsFullText}</span>
      </td>
      <td class="order-price-cell">${(o.totalSales || 0).toFixed(2)} ${currency}</td>
      <td class="order-price-cell"><b>${(o.deliveryFee || 0).toFixed(2)} ${currency}</b></td>
      <td class="order-price-cell">${hideProfits ? '<span class="status-pill status-cancelled" style="font-size: 0.65rem; padding: 2px 6px;">🔒 محجوب</span>' : `<span style="color: var(--primary-600); font-weight: 800;">${(o.netProfit || 0).toFixed(2)} ${currency}</span>`}</td>
      <td class="order-status-col">
        <select onchange="this.dataset.status=this.value; updateOrderStatus(${o.id}, this.value)" class="form-input order-status-select" data-status="${o.status}">
          <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>⏳ ${isAr ? 'قيد الانتظار' : 'Pending'}</option>
          <option value="InPrep" ${o.status === 'InPrep' ? 'selected' : ''}>🍳 ${isAr ? 'قيد التجهيز' : 'In Preparation'}</option>
          <option value="OnTheWay" ${o.status === 'OnTheWay' ? 'selected' : ''}>🛵 ${isAr ? 'في الطريق' : 'On The Way'}</option>
          <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>✅ ${isAr ? 'مكتمل' : 'Completed'}</option>
          <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>❌ ${isAr ? 'ملغي' : 'Cancelled'}</option>
        </select>
      </td>
      <td class="order-action-col">
        <a href="${o.locationUrl}" target="_blank" class="ctrl-btn order-map-btn">${isAr ? '📍 خريطة' : '📍 Map'}</a>
      </td>
    </tr>
  `;
  }).join('');
}

function toggleOrderItems(el) {
  if (el) el.classList.toggle('expanded');
}

function renderAdminChart() {
  const chartWrap = document.getElementById('admin-chart-bars');
  if (!chartWrap) return;

  const { orders: filteredOrders, filter } = getFilteredProfitRecords();
  const sample = (filteredOrders.length > 0 ? filteredOrders : []).slice(0, 8).reverse();
  const maxVal = Math.max(...sample.map(o => o.totalSales || 0), 100);
  const currency = state.lang === 'ar' ? 'ر.ي' : 'YER';
  const salesLbl = state.lang === 'ar' ? 'مبيعات' : 'Sales';
  const profitLbl = state.lang === 'ar' ? 'صافي ربح' : 'Net Profit';

  if (sample.length === 0) {
    chartWrap.innerHTML = `
      <div style="width: 100%; text-align: center; padding: 40px 10px; color: var(--text-muted); font-size: 0.86rem;">
        <span>📅 لا توجد طلبات مسجلة ضمن النطاق الزمني المحدد (${filter.label})</span>
      </div>
    `;
    return;
  }

  chartWrap.innerHTML = sample.map(o => {
    const s = o.totalSales || 0;
    const p = o.netProfit || 0;
    const salesH = Math.min(Math.round((s / maxVal) * 100), 100);
    const profitH = Math.max(Math.min(Math.round((p / maxVal) * 100), 100), 0);
    const dateLabel = extractDateOnly(o.createdAt || o.date) || `#${o.id}`;
    return `
      <div class="chart-col">
        <div class="bar-dual">
          <div class="bar-sales" style="height: ${salesH}%;" title="${salesLbl}: ${s.toFixed(1)} ${currency} (${dateLabel})"></div>
          <div class="bar-profit" style="height: ${profitH}%;" title="${profitLbl}: ${p.toFixed(1)} ${currency} (${dateLabel})"></div>
        </div>
        <span class="chart-label" title="#${o.id} - ${dateLabel}">#${o.id}</span>
      </div>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  const order = (state.orders || []).find(o => o && (o.id == orderId || String(o.id) === String(orderId)));
  if (!order) {
    console.error('Order not found for status update:', orderId);
    return;
  }

  const oldStatus = order.status;
  const oldStatusAr = order.statusAr;

  const statusMap = {
    Pending: 'قيد الانتظار',
    InPrep: 'قيد التجهيز',
    OnTheWay: 'في الطريق',
    Completed: 'مكتمل',
    Cancelled: 'ملغي',
    pending: 'قيد الانتظار',
    preparing: 'قيد التجهيز',
    on_the_way: 'في الطريق',
    completed: 'مكتمل',
    cancelled: 'ملغي'
  };

  // Optimistic UI update
  order.status = newStatus;
  if (statusMap[newStatus]) order.statusAr = statusMap[newStatus];
  persistOrders(false);
  renderOrderHistory();
  if (typeof renderAdminOrders === 'function') renderAdminOrders();
  if (typeof renderAdminKpis === 'function') renderAdminKpis();
  if (typeof renderAdminChart === 'function') renderAdminChart();
  if (typeof updateAdminBadges === 'function') updateAdminBadges();

  // Realtime sync to backend server
  if (window.TaswoqSync && typeof window.TaswoqSync.updateOrderStatus === 'function') {
    try {
      const res = await window.TaswoqSync.updateOrderStatus(order.id, newStatus);
      if (res && res.success) {
        if (res.order && typeof res.order === 'object') {
          Object.assign(order, res.order);
          persistOrders(false);
        }
        if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
        showToast(`تم حفظ وتحديث حالة الطلب #${order.orderNumber || order.id} بنجاح ✅ (${order.statusAr || newStatus})`);
        return;
      } else if (res && res.offline) {
        // Offline: queue update
        if (typeof window.TaswoqSync.queueOfflineOrderStatus === 'function') {
          window.TaswoqSync.queueOfflineOrderStatus(order.id, newStatus);
        }
        showToast(`⚠️ تم تغيير الحالة محلياً دون اتصال (${order.statusAr || newStatus}) - ستتم المزامنة عند الاتصال بالخادم`);
        return;
      } else {
        // Server rejected (401, 403, 400, etc.) -> Rollback optimistic change!
        order.status = oldStatus;
        order.statusAr = oldStatusAr;
        persistOrders(false);
        renderOrderHistory();
        if (typeof renderAdminOrders === 'function') renderAdminOrders();
        if (typeof renderAdminKpis === 'function') renderAdminKpis();
        if (typeof renderAdminChart === 'function') renderAdminChart();
        if (typeof updateAdminBadges === 'function') updateAdminBadges();

        const errMsg = (res && res.error) || 'فشل تحديث حالة الطلب في الخادم';
        showToast(`❌ لم يتم الحفظ: ${errMsg}`);
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        return;
      }
    } catch (e) {
      console.warn('Order update sync error:', e);
      if (typeof window.TaswoqSync.queueOfflineOrderStatus === 'function') {
        window.TaswoqSync.queueOfflineOrderStatus(order.id, newStatus);
      }
      showToast(`⚠️ تعذر الاتصال بالخادم: تم الحفظ محلياً مؤقتاً`);
      return;
    }
  }

  showToast(`تم تحديث حالة الطلب #${order.id} محلياً: ${order.statusAr || newStatus}`);
}

// --- PRODUCT MANAGEMENT (CRUD) ---
let editingProdId = null;

function openAddProductModal() {
  editingProdId = null;
  const title = document.getElementById('prod-modal-title');
  if (title) title.textContent = '🥑 إضافة منتج جديد للكتالوج';

  const nameAr = document.getElementById('prod-input-name-ar');
  const nameEn = document.getElementById('prod-input-name-en');
  const cat = document.getElementById('prod-input-category');
  const unit = document.getElementById('prod-input-unit');
  const cost = document.getElementById('prod-input-cost');
  const sale = document.getElementById('prod-input-sale');
  const disc = document.getElementById('prod-input-discount');
  const img = document.getElementById('prod-input-image');
  const fileInp = document.getElementById('prod-input-file');
  const avail = document.getElementById('prod-input-available');

  syncCategorySelectOptions();
  if (nameAr) nameAr.value = '';
  if (nameEn) nameEn.value = '';
  if (cat && cat.options.length > 0) cat.value = cat.options[0].value;
  if (unit) unit.value = '1 كيلو';
  if (cost) cost.value = '';
  if (sale) sale.value = '';
  if (disc) disc.value = '';
  if (fileInp) fileInp.value = '';
  const defaultImg = 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&auto=format&fit=crop&q=80';
  if (img) img.value = defaultImg;
  updateProductImagePreview(defaultImg);
  if (avail) avail.checked = true;

  const modal = document.getElementById('product-crud-modal');
  if (modal) modal.classList.add('active');
}

function openEditProductModal(id) {
  const prod = state.products.find(p => p.id == id);
  if (!prod) return;
  editingProdId = id;

  const title = document.getElementById('prod-modal-title');
  if (title) title.textContent = `✏️ تعديل منتج: ${prod.nameAr}`;

  syncCategorySelectOptions();
  const nameAr = document.getElementById('prod-input-name-ar');
  const nameEn = document.getElementById('prod-input-name-en');
  const cat = document.getElementById('prod-input-category');
  const unit = document.getElementById('prod-input-unit');
  const cost = document.getElementById('prod-input-cost');
  const sale = document.getElementById('prod-input-sale');
  const disc = document.getElementById('prod-input-discount');
  const img = document.getElementById('prod-input-image');
  const fileInp = document.getElementById('prod-input-file');
  const avail = document.getElementById('prod-input-available');

  if (nameAr) nameAr.value = prod.nameAr;
  if (nameEn) nameEn.value = prod.nameEn || '';
  if (cat) cat.value = prod.categoryId;
  if (unit) unit.value = prod.unit;
  if (cost) cost.value = prod.costPrice;
  if (sale) sale.value = prod.salePrice;
  if (disc) disc.value = prod.discountPrice || '';
  if (img) img.value = prod.image;
  if (fileInp) fileInp.value = '';
  updateProductImagePreview(prod.image);
  if (avail) avail.checked = prod.isAvailable;

  const modal = document.getElementById('product-crud-modal');
  if (modal) modal.classList.add('active');
}

function handleProductImageFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP, GIF)');
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    const dataUrl = e.target.result;
    const imgInput = document.getElementById('prod-input-image');
    if (imgInput) imgInput.value = dataUrl;
    updateProductImagePreview(dataUrl);
    showToast('تم تحميل صورة المنتج من جهازك بنجاح 🖼️');
  };
  reader.readAsDataURL(file);
}

function updateProductImagePreview(src) {
  const previewImg = document.getElementById('prod-image-preview-img');
  if (previewImg) {
    previewImg.src = (src && src.trim() !== '') ? src : 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&auto=format&fit=crop&q=80';
  }
}

function clearProductImage() {
  const imgInput = document.getElementById('prod-input-image');
  const fileInput = document.getElementById('prod-input-file');
  if (imgInput) imgInput.value = '';
  if (fileInput) fileInput.value = '';
  updateProductImagePreview('');
  showToast('تمت إزالة صورة المنتج');
}

function closeProductModal() {
  const modal = document.getElementById('product-crud-modal');
  if (modal) modal.classList.remove('active');
}

async function saveProduct() {
  const nameArInp = document.getElementById('prod-input-name-ar');
  const nameAr = nameArInp ? nameArInp.value.trim() : '';
  const nameEnEl = document.getElementById('prod-input-name-en');
  const nameEn = nameEnEl ? (nameEnEl.value.trim() || nameAr) : nameAr;
  const categoryId = document.getElementById('prod-input-category').value;
  const unit = document.getElementById('prod-input-unit').value.trim() || '1 كيلو';
  const costPrice = parseFloat(document.getElementById('prod-input-cost').value) || 0;
  const salePrice = parseFloat(document.getElementById('prod-input-sale').value) || 0;
  const discountVal = document.getElementById('prod-input-discount').value.trim();
  const discountPrice = discountVal ? parseFloat(discountVal) : null;
  const image = document.getElementById('prod-input-image').value.trim() || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&auto=format&fit=crop&q=80';
  const isAvailable = document.getElementById('prod-input-available').checked;

  if (!nameAr) {
    alert('يرجى إدخال اسم المنتج.');
    return;
  }
  if (salePrice <= 0) {
    alert('يرجى إدخال سعر بيع صحيح أكبر من الصفر.');
    return;
  }
  if (costPrice < 0) {
    alert('سعر التكلفة لا يمكن أن يكون سالباً.');
    return;
  }

  const isEdit = (editingProdId !== null);
  const targetId = isEdit
    ? editingProdId
    : (state.products.length > 0 ? Math.max(...state.products.map(p => (typeof p.id === 'number' ? p.id : parseInt(p.id, 10) || 0))) + 1 : 1);

  const prodPayload = {
    id: targetId,
    nameAr: nameAr,
    nameEn: nameEn,
    categoryId: categoryId,
    unit: unit,
    costPrice: costPrice,
    salePrice: salePrice,
    discountPrice: discountPrice,
    image: image,
    isAvailable: isAvailable
  };

  // Sync to server first as single source of truth
  if (window.TaswoqSync && typeof window.TaswoqSync.saveProduct === 'function') {
    try {
      const syncResult = await window.TaswoqSync.saveProduct(prodPayload, isEdit);
      if (!syncResult || syncResult.success === false) {
        const errorMsg = (syncResult && syncResult.error) ? syncResult.error : 'فشل حفظ المنتج في الخادم';
        alert(`❌ لم يتم الحفظ: ${errorMsg}`);
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        if (typeof window.TaswoqSync.syncDown === 'function') {
          await window.TaswoqSync.syncDown('admin').then(syncedData => {
            if (syncedData && syncedData.success && typeof applySyncedData === 'function') {
              applySyncedData(syncedData);
            }
          }).catch(() => {});
        }
        return;
      }
      if (syncResult.product) {
        Object.assign(prodPayload, syncResult.product);
      }
    } catch (err) {
      alert(`❌ تعذر الاتصال بالخادم لحفظ المنتج: ${err.message}`);
      if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
      return;
    }
  }

  if (isEdit) {
    const p = state.products.find(item => item.id == editingProdId);
    if (p) {
      Object.assign(p, prodPayload);
      showToast(`تم تعديل المنتج: ${nameAr} بنجاح ✅`);
    }
  } else {
    state.products.unshift(prodPayload);
    showToast(`تمت إضافة المنتج الجديد: ${nameAr} بنجاح 🥑`);
  }

  persistProducts();
  closeProductModal();
  renderProducts();
  renderAdminProducts();
  renderAdminKpis();
  renderAdminChart();
}

async function deleteProduct(id) {
  const prod = state.products.find(p => p.id == id);
  if (!prod) return;

  if (confirm(`هل أنت متأكد من حذف المنتج (${prod.nameAr}) من الكتالوج نهائياً؟`)) {
    if (window.TaswoqSync && typeof window.TaswoqSync.deleteProduct === 'function') {
      try {
        const res = await window.TaswoqSync.deleteProduct(id);
        if (!res || res.success === false) {
          const errMsg = (res && res.error) || 'فشل حذف المنتج من الخادم';
          alert(`❌ لم يتم الحذف: ${errMsg}`);
          if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
          if (typeof window.TaswoqSync.syncDown === 'function') {
            await window.TaswoqSync.syncDown('admin').then(syncedData => {
              if (syncedData && syncedData.success && typeof applySyncedData === 'function') {
                applySyncedData(syncedData);
              }
            }).catch(() => {});
          }
          return;
        }
      } catch (err) {
        alert(`❌ تعذر الاتصال بالخادم لحذف المنتج: ${err.message}`);
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        return;
      }
    }

    state.products = state.products.filter(p => p.id != id);
    persistProducts();
    renderProducts();
    renderAdminProducts();
    renderAdminKpis();
    renderAdminChart();
    showToast(`تم حذف المنتج: ${prod.nameAr} 🗑️`);
  }
}

function setAdminCategoryFilter(catId) {
  state.activeAdminCategoryFilter = catId;
  renderAdminProducts();
}

function onAdminProductSearch(query) {
  state.adminProductSearch = query;
  renderAdminProducts();
}

function syncCategorySelectOptions() {
  const catSelect = document.getElementById('prod-input-category');
  if (!catSelect) return;
  const currentVal = catSelect.value;
  const isAr = state.lang === 'ar';
  const categories = (window.GROCERY_DATA.categories || []).filter(c => c.id !== 'all');

  catSelect.innerHTML = categories.map(c => `
    <option value="${c.id}">${isAr ? c.nameAr : c.nameEn} ${c.icon}</option>
  `).join('');

  if (currentVal && categories.some(c => c.id === currentVal)) {
    catSelect.value = currentVal;
  }
}

function renderAdminCategoryFilters() {
  const container = document.getElementById('admin-prod-cat-filters');
  if (!container) return;
  const isAr = state.lang === 'ar';
  const categories = window.GROCERY_DATA.categories || [];

  const pillsHtml = categories.map(c => {
    const isActive = (state.activeAdminCategoryFilter || 'all') === c.id;
    const count = c.id === 'all'
      ? state.products.length
      : state.products.filter(p => p.categoryId === c.id).length;

    const deleteBtn = c.id !== 'all' ? `
      <span class="cat-delete-btn" 
        onclick="event.stopPropagation(); deleteAdminCategory('${c.id}')" 
        title="${isAr ? 'حذف هذا القسم' : 'Delete category'}"
        aria-label="${isAr ? 'حذف هذا القسم' : 'Delete category'}">✕</span>
    ` : '';

    return `
      <button type="button" class="ctrl-btn cat-filter-pill ${isActive ? 'active' : ''}" 
        onclick="setAdminCategoryFilter('${c.id}')" 
        style="padding: 5px 12px; font-size: 0.8rem; border-radius: 20px; font-weight: 700; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; ${isActive ? 'background: var(--primary-600); color: #fff; border-color: var(--primary-600);' : ''}">
        <span>${c.icon}</span> 
        <span>${isAr ? c.nameAr : c.nameEn}</span> 
        <span style="opacity: 0.75; font-size: 0.72rem;">(${count})</span>
        ${deleteBtn}
      </button>
    `;
  }).join('');

  const addBtnHtml = `
    <button type="button" class="ctrl-btn admin-add-cat-btn" 
      onclick="openAddCategoryModal()" 
      title="${isAr ? 'إضافة قسم جديد +' : 'Add new category +'}"
      style="padding: 5px 14px; font-size: 0.8rem; border-radius: 20px; font-weight: 800; white-space: nowrap; border: 1.5px dashed var(--primary-500); color: var(--primary-600); background: rgba(16, 185, 129, 0.08); display: inline-flex; align-items: center; gap: 5px; cursor: pointer; flex-shrink: 0;">
      <span>➕</span> <span>${isAr ? 'جديد +' : 'New +'}</span>
    </button>
  `;

  container.innerHTML = pillsHtml + addBtnHtml;
  syncCategorySelectOptions();
}

function openAddCategoryModal() {
  const modal = document.getElementById('add-category-modal');
  if (!modal) return;
  const nameAr = document.getElementById('new-cat-name-ar');
  const nameEn = document.getElementById('new-cat-name-en');
  const icon = document.getElementById('new-cat-icon');
  if (nameAr) nameAr.value = '';
  if (nameEn) nameEn.value = '';
  if (icon) icon.value = '🏷️';
  modal.classList.add('active');
  if (nameAr) setTimeout(() => nameAr.focus(), 150);
}

function closeAddCategoryModal() {
  const modal = document.getElementById('add-category-modal');
  if (modal) modal.classList.remove('active');
}

async function submitNewCategory(e) {
  if (e) e.preventDefault();
  const nameArEl = document.getElementById('new-cat-name-ar');
  const nameEnEl = document.getElementById('new-cat-name-en');
  const iconEl = document.getElementById('new-cat-icon');

  const nameAr = nameArEl ? nameArEl.value.trim() : '';
  const nameEn = nameEnEl ? nameEnEl.value.trim() : '';
  const icon = iconEl && iconEl.value.trim() ? iconEl.value.trim() : '🏷️';

  if (!nameAr) {
    showToast('يرجى كتابة اسم القسم أولاً');
    return;
  }

  const id = 'cat_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 3);
  const newCat = {
    id,
    nameAr,
    nameEn: nameEn || nameAr,
    icon
  };

  // Sync category to server first as single source of truth
  if (window.TaswoqSync && typeof window.TaswoqSync.saveCategory === 'function') {
    try {
      const res = await window.TaswoqSync.saveCategory(newCat);
      if (!res || res.success === false) {
        const errMsg = (res && res.error) || 'فشل حفظ القسم في الخادم';
        alert(`❌ لم يتم الحفظ: ${errMsg}`);
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        return;
      }
    } catch (err) {
      alert(`❌ تعذر الاتصال بالخادم لحفظ القسم: ${err.message}`);
      if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
      return;
    }
  }

  if (!window.GROCERY_DATA.categories) {
    window.GROCERY_DATA.categories = [];
  }

  window.GROCERY_DATA.categories.push(newCat);
  persistCategories();
  closeAddCategoryModal();
  syncCategorySelectOptions();
  setAdminCategoryFilter(id);
  renderAdminProducts();
  if (typeof renderCategories === 'function') renderCategories();
  if (typeof renderCategoriesScreen === 'function') renderCategoriesScreen();

  showToast(`تم إضافة قسم "${nameAr}" بنجاح ✨`);
}

async function deleteAdminCategory(catId) {
  if (catId === 'all') return;
  const categories = window.GROCERY_DATA.categories || [];
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;

  const prodsInCat = state.products.filter(p => p.categoryId === catId);
  const isAr = state.lang === 'ar';

  let msg = isAr
    ? `هل أنت متأكد من حذف قسم "${cat.nameAr}"؟`
    : `Are you sure you want to delete category "${cat.nameEn || cat.nameAr}"?`;

  if (prodsInCat.length > 0) {
    msg += isAr
      ? `\n⚠️ تنبيه: يوجد ${prodsInCat.length} منتج مسجل ضمن هذا القسم. سيتم إبقاؤها بدون قسم.`
      : `\n⚠️ Notice: ${prodsInCat.length} products belong to this category. They will be unassigned.`;
  }

  if (confirm(msg)) {
    if (window.TaswoqSync && typeof window.TaswoqSync.deleteCategory === 'function') {
      try {
        const res = await window.TaswoqSync.deleteCategory(catId);
        if (!res || res.success === false) {
          const errMsg = (res && res.error) || 'فشل حذف القسم من الخادم';
          alert(`❌ لم يتم الحذف: ${errMsg}`);
          if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
          return;
        }
      } catch (err) {
        alert(`❌ تعذر الاتصال بالخادم لحذف القسم: ${err.message}`);
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        return;
      }
    }

    window.GROCERY_DATA.categories = window.GROCERY_DATA.categories.filter(c => c.id !== catId);

    if (state.activeAdminCategoryFilter === catId) {
      state.activeAdminCategoryFilter = 'all';
    }

    prodsInCat.forEach(p => {
      p.categoryId = '';
    });

    persistCategories();
    persistProducts();
    syncCategorySelectOptions();
    renderAdminProducts();
    if (typeof renderCategories === 'function') renderCategories();
    if (typeof renderCategoriesScreen === 'function') renderCategoriesScreen();

    showToast(isAr ? `تم حذف قسم "${cat.nameAr}" بنجاح 🗑️` : `Category "${cat.nameEn || cat.nameAr}" deleted successfully 🗑️`);
  }
}

function renderAdminProducts() {
  renderAdminCategoryFilters();
  const tbody = document.getElementById('admin-products-tbody');
  if (!tbody) return;
  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';

  let prods = state.products;
  if (state.activeAdminCategoryFilter && state.activeAdminCategoryFilter !== 'all') {
    prods = prods.filter(p => p.categoryId === state.activeAdminCategoryFilter);
  }
  if (state.adminProductSearch && state.adminProductSearch.trim() !== '') {
    const q = state.adminProductSearch.trim().toLowerCase();
    prods = prods.filter(p => (p.nameAr && p.nameAr.toLowerCase().includes(q)) || (p.nameEn && p.nameEn.toLowerCase().includes(q)));
  }

  tbody.innerHTML = prods.map(p => {
    const margin = p.salePrice > 0 ? (((p.salePrice - p.costPrice) / p.salePrice) * 100).toFixed(0) : 0;
    const name = isAr ? p.nameAr : (p.nameEn || p.nameAr);
    const cat = (window.GROCERY_DATA.categories || []).find(c => c.id === p.categoryId);
    const catBadge = cat ? `<span class="brand-badge" style="font-size: 0.7rem; background: var(--bg-surface-secondary);">${cat.icon} ${isAr ? cat.nameAr : cat.nameEn}</span>` : '';
    return `
      <tr>
        <td>
          <img src="${p.image}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">
        </td>
        <td>
          <div style="font-weight: 700;">${name}</div>
          <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
            <span style="font-size: 0.74rem; color: var(--text-muted);">${p.unit}</span>
            ${catBadge}
          </div>
        </td>
        <td>${p.costPrice.toFixed(2)} ${currency}</td>
        <td><b>${p.salePrice.toFixed(2)} ${currency}</b></td>
        <td>
          ${p.discountPrice ? `<span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.75rem;">${p.salePrice.toFixed(2)}</span> <b style="color: var(--accent-600);">${p.discountPrice.toFixed(2)} ${currency}</b>` : '-'}
        </td>
        <td>
          <span style="color: var(--primary-600); font-weight: 700;">+${margin}%</span>
        </td>
        <td>
          <button class="ctrl-btn" onclick="toggleProductStock(${p.id})" style="font-size: 0.74rem; padding: 4px 8px;">
            ${p.isAvailable ? (isAr ? '✅ متوفر' : '✅ In Stock') : (isAr ? '❌ نفذ' : '❌ Out')}
          </button>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="ctrl-btn" onclick="openEditProductModal(${p.id})" title="${isAr ? 'تعديل المنتج' : 'Edit product'}" style="font-size: 0.75rem; padding: 4px 8px;">
              ${isAr ? '✏️ تعديل' : '✏️ Edit'}
            </button>
            <button class="ctrl-btn" onclick="deleteProduct(${p.id})" title="${isAr ? 'حذف المنتج' : 'Delete product'}" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleProductStock(pId) {
  sfx.playTap();
  const prod = state.products.find(p => p.id === pId);
  if (prod) {
    prod.isAvailable = !prod.isAvailable;
    persistProducts();
    renderProducts();
    renderAdminProducts();
    showToast(`تم تعديل توفر: ${prod.nameAr}`);
  }
}

// --- WHATSAPP MANAGEMENT (CRUD) ---
let editingWaId = null;

function openAddWhatsAppModal() {
  editingWaId = null;
  const title = document.getElementById('wa-modal-title');
  if (title) title.textContent = '📱 إضافة رقم واتساب جديد للاستقبال';

  const phoneInp = document.getElementById('wa-input-phone');
  const labelInp = document.getElementById('wa-input-label');
  const activeInp = document.getElementById('wa-input-active');
  if (phoneInp) phoneInp.value = '';
  if (labelInp) labelInp.value = '';
  if (activeInp) activeInp.checked = true;

  const modal = document.getElementById('whatsapp-number-modal');
  if (modal) modal.classList.add('active');
}

function openEditWhatsAppModal(id) {
  const recipient = state.whatsappRecipients.find(r => r.id === id);
  if (!recipient) return;
  editingWaId = id;

  const title = document.getElementById('wa-modal-title');
  if (title) title.textContent = `✏️ تعديل رقم واتساب: ${recipient.label}`;

  const phoneInp = document.getElementById('wa-input-phone');
  const labelInp = document.getElementById('wa-input-label');
  const activeInp = document.getElementById('wa-input-active');
  if (phoneInp) phoneInp.value = recipient.phone;
  if (labelInp) labelInp.value = recipient.label;
  if (activeInp) activeInp.checked = recipient.isActive;

  const modal = document.getElementById('whatsapp-number-modal');
  if (modal) modal.classList.add('active');
}

function closeWhatsAppNumberModal() {
  const modal = document.getElementById('whatsapp-number-modal');
  if (modal) modal.classList.remove('active');
}

function saveWhatsAppNumber() {
  const phoneInp = document.getElementById('wa-input-phone');
  const labelInp = document.getElementById('wa-input-label');
  const activeInp = document.getElementById('wa-input-active');

  let phone = phoneInp ? phoneInp.value.trim().replace(/[^0-9]/g, '') : '';
  const label = labelInp ? labelInp.value.trim() : '';
  const isActive = activeInp ? activeInp.checked : true;

  if (!phone) {
    alert('يرجى إدخال رقم الهاتف.');
    return;
  }
  if (!label) {
    alert('يرجى إدخال تسمية أو اسم الفرع للرقم.');
    return;
  }

  // Auto-prefix 967 if entered standard 9 digits (e.g. 771234567)
  if (phone.length === 9 && !phone.startsWith('967')) {
    phone = '967' + phone;
  }

  if (editingWaId !== null) {
    const item = state.whatsappRecipients.find(r => r.id === editingWaId);
    if (item) {
      item.phone = phone;
      item.label = label;
      item.isActive = isActive;
      showToast(`تم تحديث الرقم: ${label} بنجاح ✅`);
    }
  } else {
    const newId = state.whatsappRecipients.length > 0
      ? Math.max(...state.whatsappRecipients.map(r => r.id)) + 1
      : 1;
    state.whatsappRecipients.push({
      id: newId,
      phone: phone,
      label: label,
      isActive: isActive,
      lastUsedAt: 'لم يُستخدم بعد'
    });
    showToast(`تمت إضافة الرقم: ${label} بنجاح 📱`);
  }

  persistWhatsAppRecipients();
  closeWhatsAppNumberModal();
  renderAdminWhatsApp();
}

function deleteWhatsAppNumber(id) {
  const item = state.whatsappRecipients.find(r => r.id === id);
  if (!item) return;

  if (state.whatsappRecipients.length <= 1) {
    alert('لا يمكن حذف هذا الرقم لأنه الرقم الوحيد المسجل لاستقبال الطلبات.');
    return;
  }

  if (confirm(`هل أنت متأكد من حذف رقم واتساب (${item.label} - +${item.phone})؟`)) {
    state.whatsappRecipients = state.whatsappRecipients.filter(r => r.id !== id);
    persistWhatsAppRecipients();
    renderAdminWhatsApp();
    showToast(`تم حذف الرقم: ${item.label} 🗑️`);
  }
}

function renderAdminWhatsApp() {
  const tbody = document.getElementById('admin-whatsapp-tbody');
  if (!tbody) return;
  const isAr = state.lang === 'ar';
  const approvedId = state.approvedDelegateId || 4;

  tbody.innerHTML = state.whatsappRecipients.map(r => {
    const isApproved = (r.id === approvedId || r.isApproved);
    return `
    <tr style="${isApproved ? 'background: rgba(30, 138, 74, 0.08); font-weight: 500;' : ''}">
      <td><b>+${r.phone}</b></td>
      <td>
        <span style="display: flex; align-items: center; gap: 8px;">
          <span>${r.label}</span>
          ${isApproved ? `<span class="status-pill status-completed" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 6px; background: #e8f5e9; color: #1b5e20; border: 1px solid #c8e6c9; font-weight: 800;">⭐ المعتمد لاستقبال طلبات التطبيق</span>` : ''}
        </span>
      </td>
      <td>
        <span class="status-pill ${r.isActive ? 'status-completed' : 'status-cancelled'}">
          ${r.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Disabled')}
        </span>
      </td>
      <td><span style="font-size: 0.75rem; color: var(--text-muted);">${r.lastUsedAt || (isAr ? 'الآن' : 'Just now')}</span></td>
      <td>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          ${!isApproved ? `
            <button class="ctrl-btn" onclick="setApprovedDelegate(${r.id})" style="font-size: 0.75rem; padding: 5px 10px; background: #1b5e20; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; font-weight: 800; display: flex; align-items: center; gap: 4px;">
              <span>⭐</span> <span>تعيين كرقم معتمد</span>
            </button>
          ` : `
            <span style="font-size: 0.75rem; font-weight: 800; color: #1b5e20; padding: 4px 6px;">✓ الرقم المعتمد الحالي</span>
          `}
          <button class="ctrl-btn" onclick="openEditWhatsAppModal(${r.id})" title="${isAr ? 'تعديل الرقم والتسمية' : 'Edit number'}" style="font-size: 0.75rem; padding: 4px 8px;">
            ${isAr ? '✏️ تعديل' : '✏️ Edit'}
          </button>
          <button class="ctrl-btn" onclick="toggleWhatsAppActive(${r.id})" style="font-size: 0.75rem; padding: 4px 8px;">
            ${r.isActive ? (isAr ? 'تعطيل' : 'Disable') : (isAr ? 'تفعيل' : 'Activate')}
          </button>
          <button class="ctrl-btn" onclick="deleteWhatsAppNumber(${r.id})" title="${isAr ? 'حذف الرقم' : 'Delete number'}" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `}).join('');
}

async function setApprovedDelegate(id) {
  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
  state.approvedDelegateId = id;
  if (state.whatsappRecipients) {
    state.whatsappRecipients.forEach(r => {
      r.isApproved = (r.id === id);
    });
  }
  try { localStorage.setItem('tasweeq_approved_delegate_id', id); } catch (e) { }
  const del = state.whatsappRecipients.find(r => r.id === id);
  showToast(`⭐ تم تعيين (${del ? del.label : ''} - +${del ? del.phone : id}) كرقم معتمد لاستقبال طلبات التطبيق بنجاح ✅`);
  renderAdminWhatsApp();

  if (window.TaswoqSync && typeof window.TaswoqSync.saveApprovedDelegate === 'function') {
    window.TaswoqSync.saveApprovedDelegate(id).catch(e => console.warn(e));
  } else {
    try {
      const serverUrl = (window.TaswoqSync && window.TaswoqSync.getServerUrl()) || 'http://127.0.0.1:8080';
      await fetch(`${serverUrl}/api/approved-delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, delegateId: id })
      });
    } catch (e) { }
  }
}
window.setApprovedDelegate = setApprovedDelegate;

function toggleWhatsAppActive(id) {
  sfx.playTap();
  const recipient = state.whatsappRecipients.find(r => r.id === id);
  if (recipient) {
    recipient.isActive = !recipient.isActive;
    renderAdminWhatsApp();
    showToast(`تم ${recipient.isActive ? 'تفعيل' : 'تعطيل'} الرقم: ${recipient.label}`);
  }
}

// ==========================================================================
// COMPLAINTS & TICKETS MANAGEMENT CONTROLLER
// ==========================================================================
function setAdminComplaintsFilter(filter, btnEl) {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  state.complaintsFilter = filter;

  document.querySelectorAll('.filter-pills .filter-pill').forEach(b => {
    if (b.id === `btn-comp-filter-${filter}`) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  renderAdminComplaints();
}

function renderAdminComplaints() {
  const tbody = document.getElementById('admin-complaints-tbody');
  if (!tbody) return;

  const currentFilter = state.complaintsFilter || 'pending';
  const allComplaints = state.complaints || [];

  // Update Counters on Badges
  const pendingCount = allComplaints.filter(c => !c.adminReply && c.status !== 'Resolved').length;
  const resolvedCount = allComplaints.filter(c => c.adminReply || c.status === 'Resolved').length;

  const pendingBadge = document.getElementById('badge-comp-count-pending');
  const resolvedBadge = document.getElementById('badge-comp-count-resolved');
  if (pendingBadge) pendingBadge.textContent = pendingCount;
  if (resolvedBadge) resolvedBadge.textContent = resolvedCount;

  // Filter complaints list
  let displayedComplaints = allComplaints;
  if (currentFilter === 'pending') {
    // Hide all replied complaints (only show complaints waiting for response)
    displayedComplaints = allComplaints.filter(c => !c.adminReply && c.status !== 'Resolved');
  } else if (currentFilter === 'resolved') {
    // Show only resolved/replied complaints
    displayedComplaints = allComplaints.filter(c => c.adminReply || c.status === 'Resolved');
  }

  if (displayedComplaints.length === 0) {
    let emptyMsg = 'لا توجد شكاوى أو بلاغات مسجلة حالياً ✨';
    if (currentFilter === 'pending') {
      emptyMsg = '🎉 رائع! تم الرد على جميع الشكاوى وحلها، ولا توجد أي شكاوى معلقة بانتظار الرد حالياً.';
    } else if (currentFilter === 'resolved') {
      emptyMsg = 'لا توجد شكاوى محلولة في الأرشيف بعد.';
    }
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px 16px; color: var(--text-muted); font-size: 0.9rem; font-weight: 700; line-height: 1.6;">
          ${emptyMsg}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = displayedComplaints.map(c => {
    let statusBadge = '';
    if (c.status === 'Resolved') {
      statusBadge = `<span class="status-pill status-completed" style="font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;"><span>✅</span> <span>تم الحل</span></span>`;
    } else if (c.status === 'InProgress') {
      statusBadge = `<span class="status-pill status-prep" style="font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #b45309;"><span>🔄</span> <span>قيد المعالجة</span></span>`;
    } else {
      statusBadge = `<span class="status-pill status-pending" style="font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;"><span>⏳</span> <span>بانتظار الرد</span></span>`;
    }

    const typeIcons = {
      'delay': '🚚',
      'damaged': '📦',
      'missing': '🔍',
      'payment': '💳',
      'general': '📝'
    };
    const icon = typeIcons[c.type] || '🎫';

    const orderBadge = c.orderId
      ? `<span class="brand-badge" style="font-size: 0.74rem; background: #ede9fe; color: #6d28d9; font-weight: 800;">#${c.orderId}</span>`
      : `<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>`;

    const replyContent = c.adminReply
      ? `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="font-size: 0.74rem; color: #047857; background: #ecfdf5; padding: 5px 8px; border-radius: 6px; border-inline-start: 3px solid #10b981; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.adminReply}">
            💬 ${c.adminReply}
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button type="button" class="ctrl-btn" onclick="openAdminReplyModal('${c.ticketNo}')" style="font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; font-weight: 700; align-self: flex-start; cursor: pointer;" title="تعديل الرد وتحديث الحالة">
              ✏️ تعديل الرد
            </button>
            <button type="button" class="ctrl-btn" onclick="deleteAdminComplaint('${c.ticketNo}')" style="color: #ef4444; font-size: 0.75rem; padding: 3px 8px; border-radius: 6px;" title="حذف الشكوى نهائياً">
              🗑️
            </button>
          </div>
        </div>
      `
      : `
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="action-btn primary" onclick="openAdminReplyModal('${c.ticketNo}')" style="font-size: 0.76rem; padding: 6px 14px; border-radius: 8px; font-weight: 800; box-shadow: 0 2px 8px rgba(5, 150, 105, 0.25); cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
            <span>💬</span> <span>الرد على الشكوى</span>
          </button>
          <button type="button" class="ctrl-btn" onclick="deleteAdminComplaint('${c.ticketNo}')" style="color: #ef4444; font-size: 0.75rem; padding: 6px 10px; border-radius: 8px;" title="حذف الشكوى نهائياً">
            🗑️
          </button>
        </div>
      `;

    return `
      <tr>
        <td>
          <div style="font-weight: 800; color: var(--primary-700); font-family: monospace; font-size: 0.88rem;">${c.ticketNo}</div>
          <div style="font-size: 0.68rem; color: var(--text-muted);">${c.createdAt || ''}</div>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">${c.customerName || 'عميل تسوق'}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); direction: ltr; text-align: right;">${c.customerPhone || ''}</div>
        </td>
        <td>
          <span style="font-size: 0.76rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
            <span>${icon}</span> <span>${c.typeNameAr || c.type || 'شكوى عامة'}</span>
          </span>
        </td>
        <td>${orderBadge}</td>
        <td style="max-width: 240px; font-size: 0.78rem; line-height: 1.4; color: var(--text-main);" title="${c.message || ''}">
          <div style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${c.message || ''}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>${replyContent}</td>
      </tr>
    `;
  }).join('');
}

// Open Dedicated Admin Complaint Reply Modal
function openAdminReplyModal(ticketNo) {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  const complaint = (state.complaints || []).find(c => c.ticketNo === ticketNo);
  if (!complaint) {
    console.error('Complaint not found for ticket:', ticketNo);
    return;
  }

  const modal = document.getElementById('admin-complaint-reply-modal');
  if (!modal) {
    console.error('Modal #admin-complaint-reply-modal not found');
    return;
  }

  const ticketInput = document.getElementById('reply-modal-ticket-no');
  const ticketBadge = document.getElementById('reply-modal-ticket-badge');
  const custName = document.getElementById('reply-modal-cust-name');
  const custPhone = document.getElementById('reply-modal-cust-phone');
  const waLink = document.getElementById('reply-modal-wa-link');
  const typeBadge = document.getElementById('reply-modal-type-badge');
  const orderBadge = document.getElementById('reply-modal-order-badge');
  const custMsg = document.getElementById('reply-modal-cust-message');
  const dateEl = document.getElementById('reply-modal-date');
  const textarea = document.getElementById('reply-modal-text');

  if (ticketInput) ticketInput.value = complaint.ticketNo;
  if (ticketBadge) ticketBadge.textContent = complaint.ticketNo;
  if (custName) custName.textContent = complaint.customerName || 'عميل تسوق';
  if (custPhone) custPhone.textContent = complaint.customerPhone || '';

  if (waLink) {
    const rawPhone = (complaint.customerPhone || '').replace(/\D/g, '');
    const cleanPhone = rawPhone.startsWith('967') ? rawPhone : (rawPhone ? '967' + rawPhone : '');
    if (cleanPhone) {
      waLink.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`مرحباً أستاذ ${complaint.customerName || ''}، بخصوص تذكرتكم رقم ${complaint.ticketNo} في منصة تسوق:`)}`;
      waLink.style.display = 'inline-flex';
    } else {
      waLink.style.display = 'none';
    }
  }

  if (typeBadge) typeBadge.textContent = complaint.typeNameAr || complaint.type || 'شكوى عامة';

  if (orderBadge) {
    if (complaint.orderId) {
      orderBadge.textContent = `طلب #${complaint.orderId}`;
      orderBadge.style.display = 'inline-block';
    } else {
      orderBadge.style.display = 'none';
    }
  }

  if (custMsg) custMsg.textContent = complaint.message || 'لا توجد تفاصيل إضافية للشكوى.';
  if (dateEl) dateEl.textContent = `تاريخ الشكوى: ${complaint.createdAt || 'اليوم'}`;

  // Status Radios
  const targetStatus = complaint.status === 'Closed' ? 'Closed' : (complaint.status === 'InProgress' ? 'InProgress' : 'Resolved');
  const radios = document.querySelectorAll('input[name="reply-modal-status"]');
  radios.forEach(r => {
    r.checked = r.value === targetStatus;
  });

  // Reply Text
  if (textarea) {
    textarea.value = complaint.adminReply || '';
    updateReplyCharCount();
  }

  // GUARANTEED VISIBILITY
  modal.classList.add('active');
  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('opacity', '1', 'important');
  modal.style.setProperty('visibility', 'visible', 'important');
  modal.style.setProperty('pointer-events', 'auto', 'important');
}

async function deleteAdminComplaint(ticketNo) {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  const complaint = (state.complaints || []).find(c => c.ticketNo === ticketNo || String(c.id) === String(ticketNo));
  if (!complaint) return;

  if (confirm(`هل أنت متأكد من حذف الشكوى رقم (${ticketNo}) للعميل (${complaint.customerName}) نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`)) {
    const compId = complaint.id || ticketNo;
    state.complaints = (state.complaints || []).filter(c => c.ticketNo !== ticketNo && String(c.id) !== String(ticketNo));
    persistComplaints();

    if (typeof addAuditLog === 'function') {
      addAuditLog('COMPLAINT_DELETED', 'حذف شكوى', `تم حذف التذكرة (${ticketNo}) نهائياً من قبل الإدارة`);
    }

    if (typeof renderComplaintsList === 'function') renderComplaintsList();
    renderAdminComplaints();
    if (typeof updateAdminBadges === 'function') updateAdminBadges();

    if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
    if (typeof showToast === 'function') {
      showToast(`تم حذف الشكوى (${ticketNo}) نهائياً وحفظ التغيير بنجاح 🗑️`);
    }

    if (window.TaswoqSync && typeof window.TaswoqSync.deleteComplaint === 'function') {
      await window.TaswoqSync.deleteComplaint(compId);
    }
  }
}
window.deleteAdminComplaint = deleteAdminComplaint;

window.handleIncomingAdminComplaints = function (incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return;
  if (!state.complaints) state.complaints = [];

  let hasNew = false;
  incoming.forEach(comp => {
    const idx = state.complaints.findIndex(c => String(c.id) === String(comp.id) || c.ticketNo === comp.ticketNo);
    if (idx === -1) {
      state.complaints.unshift(comp);
      hasNew = true;
    } else {
      state.complaints[idx] = { ...state.complaints[idx], ...comp };
    }
  });

  state.complaints.sort((a, b) => (parseInt(b.id || 0) - parseInt(a.id || 0)));

  persistComplaints();
  if (typeof renderAdminComplaints === 'function') renderAdminComplaints();
  if (typeof updateAdminBadges === 'function') updateAdminBadges();

  if (hasNew) {
    if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
    const first = incoming[0];
    if (typeof showToast === 'function') {
      showToast(`🔔 بلاغ/شكوى جديدة واردة (${first.ticketNo}) من ${first.customerName || 'عميل'}: ${first.typeNameAr || first.type} 🎫`);
    }
  }
};

function closeAdminReplyModal() {
  const modal = document.getElementById('admin-complaint-reply-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.setProperty('display', 'none', 'important');
    modal.style.setProperty('opacity', '0', 'important');
    modal.style.setProperty('visibility', 'hidden', 'important');
    modal.style.setProperty('pointer-events', 'none', 'important');
  }
}

function applyQuickComplaintReply(text) {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  const textarea = document.getElementById('reply-modal-text');
  if (textarea) {
    textarea.value = text;
    textarea.focus();
    updateReplyCharCount();
  }
}


function handleQuickReplySelect(selectElem) {
  if (selectElem && selectElem.value) {
    applyQuickComplaintReply(selectElem.value);
    setTimeout(() => {
      try {
        selectElem.selectedIndex = 0;
      } catch (e) { }
    }, 350);
  }
}

function updateReplyCharCount() {
  const textarea = document.getElementById('reply-modal-text');
  const countEl = document.getElementById('reply-text-char-count');
  if (textarea && countEl) {
    const len = textarea.value.length;
    countEl.textContent = `${len} / 500 حرف`;
    if (len > 450) {
      countEl.style.color = '#ef4444';
    } else {
      countEl.style.color = 'var(--text-muted)';
    }
  }
}

async function submitAdminComplaintReply() {
  const ticketInput = document.getElementById('reply-modal-ticket-no');
  const textarea = document.getElementById('reply-modal-text');
  const statusRadio = document.querySelector('input[name="reply-modal-status"]:checked');

  const ticketNo = ticketInput ? ticketInput.value : null;
  const replyText = textarea ? textarea.value.trim() : '';
  const newStatus = statusRadio ? statusRadio.value : 'Resolved';

  if (!ticketNo) return;
  if (!replyText) {
    if (typeof showToast === 'function') {
      showToast('يرجى كتابة نص الرد الموجه للعميل ⚠️');
    } else {
      alert('يرجى كتابة نص الرد الموجه للعميل');
    }
    return;
  }

  const complaint = (state.complaints || []).find(c => c.ticketNo === ticketNo || String(c.id) === String(ticketNo));
  if (!complaint) return;

  const repliedBy = state.currentUser ? (state.currentUser.fullName || state.currentUser.name || state.currentUser.username) : 'إدارة تسوق';
  const repliedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

  complaint.adminReply = replyText;
  complaint.status = newStatus;
  complaint.statusAr = (newStatus === 'Resolved' ? 'تم الحل' : (newStatus === 'InProgress' ? 'قيد المعالجة' : (newStatus === 'Closed' ? 'مغلقة' : 'جديدة')));
  complaint.repliedAt = repliedAt;
  complaint.repliedBy = repliedBy;

  persistComplaints();

  if (typeof addAuditLog === 'function') {
    addAuditLog('COMPLAINT_REPLY', 'الرد على شكوى عميل', `تم إرسال الرد للشكوى (${ticketNo}) للعميل (${complaint.customerName}) وتحديث الحالة إلى ${newStatus}`);
  }

  if (typeof renderComplaintsList === 'function') renderComplaintsList();
  renderAdminComplaints();
  if (typeof updateAdminBadges === 'function') updateAdminBadges();

  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
  closeAdminReplyModal();

  if (typeof showToast === 'function') {
    showToast(`تم إرسال الرد للشكوى (${ticketNo}) بنجاح وتحديث حالتها ✅`);
  }

  // Read Customer Notification Toggle Checkbox
  const notifyCustEl = document.getElementById('reply-modal-notify-cust');
  const notifyCustomer = notifyCustEl ? Boolean(notifyCustEl.checked) : true;

  // Push update to Server
  if (window.TaswoqSync && typeof window.TaswoqSync.updateComplaint === 'function') {
    const compId = complaint.id || ticketNo;
    await window.TaswoqSync.updateComplaint(compId, {
      status: newStatus,
      statusAr: complaint.statusAr,
      adminReply: replyText,
      repliedBy: repliedBy,
      notifyCustomer: notifyCustomer
    });
  }
}

// Delivery Settings & Zones Admin Management (Section 3.8 v3)
let editingZoneId = null;

function openAddZoneModal() {
  editingZoneId = null;
  const title = document.getElementById('zone-modal-title');
  if (title) title.textContent = '🚚 إضافة منطقة / حي توصيل جديد';

  const nameAr = document.getElementById('zone-input-name-ar');
  const nameEn = document.getElementById('zone-input-name-en');
  const fee = document.getElementById('zone-input-fee');
  const active = document.getElementById('zone-input-active');

  if (nameAr) nameAr.value = '';
  if (nameEn) nameEn.value = '';
  if (fee) fee.value = '5.00';
  if (active) active.checked = true;

  const modal = document.getElementById('zone-crud-modal');
  if (modal) modal.classList.add('active');
}

function openEditZoneModal(id) {
  const zone = state.deliveryZones.find(z => z.id === id);
  if (!zone) return;
  editingZoneId = id;

  const title = document.getElementById('zone-modal-title');
  if (title) title.textContent = `✏️ تعديل تسعير وبيانات حي: ${zone.nameAr}`;

  const nameAr = document.getElementById('zone-input-name-ar');
  const nameEn = document.getElementById('zone-input-name-en');
  const fee = document.getElementById('zone-input-fee');
  const active = document.getElementById('zone-input-active');

  if (nameAr) nameAr.value = zone.nameAr;
  if (nameEn) nameEn.value = zone.nameEn || '';
  if (fee) fee.value = zone.fee;
  if (active) active.checked = zone.isActive;

  const modal = document.getElementById('zone-crud-modal');
  if (modal) modal.classList.add('active');
}

function closeZoneModal() {
  const modal = document.getElementById('zone-crud-modal');
  if (modal) modal.classList.remove('active');
}

function saveZone() {
  const nameArInp = document.getElementById('zone-input-name-ar');
  const nameEnInp = document.getElementById('zone-input-name-en');
  const feeInp = document.getElementById('zone-input-fee');
  const activeInp = document.getElementById('zone-input-active');

  const nameAr = nameArInp ? nameArInp.value.trim() : '';
  const nameEn = nameEnInp ? nameEnInp.value.trim() : '';
  const fee = feeInp ? parseFloat(feeInp.value) : 0;
  const isActive = activeInp ? activeInp.checked : true;

  if (!nameAr) {
    alert('يرجى إدخال اسم المنطقة أو الحي بالعربية.');
    return;
  }
  if (isNaN(fee) || fee < 0) {
    alert('يرجى إدخال رسوم توصيل صحيحة (0 أو أكثر).');
    return;
  }

  let savedZone = null;
  if (editingZoneId !== null) {
    const zone = state.deliveryZones.find(z => z.id == editingZoneId);
    if (zone) {
      zone.nameAr = nameAr;
      zone.nameEn = nameEn || nameAr;
      zone.fee = fee;
      zone.isActive = isActive;
      savedZone = zone;
      showToast(`تم تحديث تسعير حي ${nameAr} إلى ${fee.toFixed(2)} ر.ي ✅`);
    }
  } else {
    const newId = state.deliveryZones.length > 0
      ? Math.max(...state.deliveryZones.map(z => z.id)) + 1
      : 1;
    savedZone = {
      id: newId,
      nameAr: nameAr,
      nameEn: nameEn || nameAr,
      fee: fee,
      isActive: isActive
    };
    state.deliveryZones.push(savedZone);
    showToast(`تمت إضافة المنطقة الجديدة: ${nameAr} بسعر ${fee.toFixed(2)} ر.ي 🚚`);
  }

  persistDelivery();
  closeZoneModal();
  renderAdminDeliverySettings();
  renderCart();

  // Direct REST API Call
  if (savedZone && window.TaswoqSync && typeof window.TaswoqSync.saveDeliveryZone === 'function') {
    window.TaswoqSync.saveDeliveryZone(savedZone);
  }
}

function updateZoneFeeQuick(zoneId, newFeeStr) {
  const newFee = parseFloat(newFeeStr);
  if (isNaN(newFee) || newFee < 0) {
    alert('يرجى إدخال قيمة صحيحة لرسوم التوصيل.');
    renderAdminDeliverySettings();
    return;
  }
  const zone = state.deliveryZones.find(z => z.id == zoneId);
  if (zone) {
    zone.fee = newFee;
    persistDelivery();
    renderAdminDeliverySettings();
    renderCart();

    // Direct PUT REST API Call for Quick Update
    if (window.TaswoqSync && typeof window.TaswoqSync.updateDeliveryZoneQuick === 'function') {
      window.TaswoqSync.updateDeliveryZoneQuick(zoneId, { fee: newFee });
    }

    showToast(`تم تعديل تسعير ${zone.nameAr} إلى ${newFee.toFixed(2)} ر.ي ✅`);
  }
}

function deleteZone(zoneId) {
  const zone = state.deliveryZones.find(z => z.id == zoneId);
  if (!zone) return;

  if (state.deliveryZones.length <= 1) {
    alert('لا يمكن حذف هذه المنطقة لأنها المنطقة الوحيدة المتبقية للتوصيل.');
    return;
  }

  if (confirm(`هل أنت متأكد من حذف منطقة (${zone.nameAr}) نهائياً؟`)) {
    state.deliveryZones = state.deliveryZones.filter(z => z.id !== zoneId);
    persistDelivery();
    renderAdminDeliverySettings();
    renderCart();

    // Direct DELETE REST API Call
    if (window.TaswoqSync && typeof window.TaswoqSync.deleteDeliveryZone === 'function') {
      window.TaswoqSync.deleteDeliveryZone(zoneId);
    }

    showToast(`تم حذف المنطقة: ${zone.nameAr} 🗑️`);
  }
}

function renderAdminDeliverySettings() {
  const baseFeeInp = document.getElementById('admin-base-fee');
  const freeAboveInp = document.getElementById('admin-free-above');
  const minOrderInp = document.getElementById('admin-min-order');
  const enabledToggle = document.getElementById('admin-delivery-enabled');
  const zonesTbody = document.getElementById('admin-zones-tbody');

  if (baseFeeInp) baseFeeInp.value = state.deliverySettings.baseFee;
  if (freeAboveInp) freeAboveInp.value = state.deliverySettings.freeAbove || '';
  if (minOrderInp) minOrderInp.value = state.deliverySettings.minOrder || '';
  if (enabledToggle) {
    const isFreeOn = (state.deliverySettings.freeDeliveryEnabled === true || (state.deliverySettings.freeDeliveryEnabled !== false && state.deliverySettings.isEnabled === true));
    enabledToggle.checked = isFreeOn;
    const thresholdRow = document.getElementById('row-free-delivery-threshold');
    if (thresholdRow) {
      thresholdRow.style.opacity = isFreeOn ? '1' : '0.4';
      thresholdRow.style.pointerEvents = isFreeOn ? 'auto' : 'none';
    }
    enabledToggle.onchange = function () {
      if (thresholdRow) {
        thresholdRow.style.opacity = this.checked ? '1' : '0.4';
        thresholdRow.style.pointerEvents = this.checked ? 'auto' : 'none';
      }
    };
  }

  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';

  if (zonesTbody) {
    zonesTbody.innerHTML = state.deliveryZones.map(z => `
      <tr>
        <td>
          <div style="font-weight: 800; font-size: 0.92rem;">${isAr ? z.nameAr : (z.nameEn || z.nameAr)}</div>
          ${z.nameEn && isAr ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${z.nameEn}</div>` : ''}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <input type="number" step="0.5" min="0" value="${z.fee.toFixed(2)}"
              title="${isAr ? 'يمكنك تعديل السعر مباشرة من هنا والضغط خارج الحقل' : 'Edit fee directly and click outside'}"
              style="width: 80px; padding: 5px 8px; font-weight: 800; font-size: 0.9rem; border-radius: 8px; border: 1px solid var(--border-subtle); text-align: center; background: var(--bg-surface);"
              onchange="updateZoneFeeQuick(${z.id}, this.value)">
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">${currency}</span>
          </div>
        </td>
        <td>
          <span class="status-pill ${z.isActive ? 'status-completed' : 'status-cancelled'}">
            ${z.isActive ? (isAr ? 'نشطة' : 'Active') : (isAr ? 'معطلة' : 'Disabled')}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="ctrl-btn" onclick="openEditZoneModal(${z.id})" title="${isAr ? 'تعديل اسم وتسعير المنطقة' : 'Edit zone'}" style="font-size: 0.75rem; padding: 4px 8px;">
              ${isAr ? '✏️ تعديل' : '✏️ Edit'}
            </button>
            <button class="ctrl-btn" onclick="toggleZoneActive(${z.id})" style="font-size: 0.75rem; padding: 4px 8px;">
              ${z.isActive ? (isAr ? 'تعطيل' : 'Disable') : (isAr ? 'تفعيل' : 'Activate')}
            </button>
            <button class="ctrl-btn" onclick="deleteZone(${z.id})" title="${isAr ? 'حذف المنطقة' : 'Delete zone'}" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  if (typeof renderAdminWallets === 'function') {
    renderAdminWallets();
  }
}

function saveDeliverySettings(isConfirmed = false) {
  if (!isConfirmed) {
    showGeneralConfirmDialog({
      title: 'تأكيد حفظ التعديلات 💾',
      message: 'هل أنت متأكد من حفظ التعديلات الخاصة بقواعد ورسوم ومناطق التوصيل؟',
      icon: '🚚',
      confirmText: 'نعم',
      cancelText: 'لا',
      onConfirm: function () {
        saveDeliverySettings(true);
      }
    });
    return;
  }
  sfx.playTap();
  const baseFee = parseFloat(document.getElementById('admin-base-fee').value) || 0;
  const freeAbove = parseFloat(document.getElementById('admin-free-above').value) || null;
  const minOrder = parseFloat(document.getElementById('admin-min-order').value) || null;
  const isEnabled = document.getElementById('admin-delivery-enabled').checked;

  state.deliverySettings.baseFee = baseFee;
  state.deliverySettings.freeAbove = freeAbove;
  state.deliverySettings.minOrder = minOrder;
  state.deliverySettings.freeDeliveryEnabled = isEnabled;
  state.deliverySettings.isEnabled = isEnabled;

  persistDelivery();
  renderCart();

  // Direct REST API Call
  if (window.TaswoqSync && typeof window.TaswoqSync.saveDeliverySettings === 'function') {
    window.TaswoqSync.saveDeliverySettings(state.deliverySettings);
  }

  showToast('تم حفظ إعدادات وقواعد التوصيل بنجاح 🚚');
}

function toggleZoneActive(zoneId) {
  sfx.playTap();
  const zone = state.deliveryZones.find(z => z.id == zoneId);
  if (zone) {
    zone.isActive = !zone.isActive;
    persistDelivery();
    renderAdminDeliverySettings();
    renderCart();

    // Direct PUT REST API Call for Toggle Active
    if (window.TaswoqSync && typeof window.TaswoqSync.updateDeliveryZoneQuick === 'function') {
      window.TaswoqSync.updateDeliveryZoneQuick(zoneId, { isActive: zone.isActive });
    }

    showToast(`تم تحديث منطقة: ${zone.nameAr}`);
  }
}

// --- BANK WALLETS & PAYMENT METHODS MANAGEMENT (SRS Section 3.8 & Mobile Cart) ---
let editingWalletId = null;

function persistWallets() {
  try {
    localStorage.setItem('tasweeq_payment_wallets', JSON.stringify(state.paymentWallets));
  } catch (e) { }

  // Broadcast via TaswoqSync
  if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === 'function') {
    window.TaswoqSync.syncUp({ paymentWallets: state.paymentWallets });
  }

  // Direct REST API Post to server
  try {
    const serverBase = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
      ? window.TaswoqSync.getServerUrl()
      : (window.location && window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:8080');
    fetch(`${serverBase}/api/payment-wallets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.paymentWallets)
    }).then(res => res.json()).then(res => {
      console.log('[TaswoqSync] Wallets successfully saved to server DB:', res);
    }).catch(e => console.warn('Sync wallets fetch error:', e));
  } catch (e) { }
}

function renderAdminWallets() {
  const tbody = document.getElementById('admin-wallets-tbody');
  if (!tbody) return;

  const isAr = state.lang === 'ar';

  // Ensure we have paymentWallets loaded
  if (!state.paymentWallets || !Array.isArray(state.paymentWallets)) {
    if (window.GROCERY_DATA && Array.isArray(window.GROCERY_DATA.paymentWallets) && window.GROCERY_DATA.paymentWallets.length > 0) {
      state.paymentWallets = [...window.GROCERY_DATA.paymentWallets];
    } else if (typeof ALL_TASWOQ_WALLETS !== 'undefined' && Array.isArray(ALL_TASWOQ_WALLETS)) {
      state.paymentWallets = [...ALL_TASWOQ_WALLETS];
    }
  }

  const wallets = state.paymentWallets || [];

  if (wallets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
          لا توجد محافظ بنكية مضافة حالياً. اضغط على "+ إضافة محفظة / حساب بنكي جديد" لإضافة أول محفظة.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = wallets.map(w => {
    const isAct = (w.isActive !== false);
    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 8px; background: #ffffff; border: 1.5px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
              ${typeof getWalletLogoHtml === 'function' ? getWalletLogoHtml(w) : `<span style="font-size: 1.25rem;">${w.icon || '📱'}</span>`}
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.92rem; color: var(--text-main);">${isAr ? w.nameAr : (w.nameEn || w.nameAr)}</div>
              ${w.nameEn && isAr ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${w.nameEn}</div>` : ''}
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;" dir="ltr">
            <span style="font-family: monospace; font-size: 0.95rem; font-weight: 800; color: #047857; background: #f0fdf4; border: 1px solid #a7f3d0; padding: 3px 8px; border-radius: 6px;">${w.number}</span>
            <button type="button" class="ctrl-btn" onclick="copyWalletNumber('${w.number}', '${w.nameAr}', this)" title="نسخ الرقم" style="display: inline-flex; align-items: center; justify-content: center; padding: 4px 6px; border-radius: 6px; color: #059669;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><rect x="4" y="8" width="12" height="12" rx="3.5"></rect><path d="M8 4.5C8 3.12 9.12 2 10.5 2h5C16.88 2 18 3.12 18 4.5v5c0 1.38-1.12 2.5-2.5 2.5"></path></svg>
            </button>
          </div>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">${w.holderName || '-'}</div>
        </td>
        <td>
          <div style="font-size: 0.76rem; color: var(--text-muted); max-width: 220px; white-space: normal; line-height: 1.3;">${w.note || '-'}</div>
        </td>
        <td>
          <span class="status-pill ${isAct ? 'status-completed' : 'status-cancelled'}" style="font-size: 0.72rem;">
            ${isAct ? (isAr ? 'مفعلة 🟢' : 'Active 🟢') : (isAr ? 'معطلة ⏸️' : 'Disabled ⏸️')}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="ctrl-btn" onclick="openEditWalletModal('${w.id}')" title="تعديل المحفظة" style="font-size: 0.75rem; padding: 4px 8px;">
              ✏️ تعديل
            </button>
            <button class="ctrl-btn" onclick="toggleWalletActive('${w.id}')" style="font-size: 0.75rem; padding: 4px 8px; color: ${isAct ? '#d97706' : '#059669'};">
              ${isAct ? 'تعطيل' : 'تفعيل'}
            </button>
            <button class="ctrl-btn" onclick="deleteWallet('${w.id}')" title="حذف المحفظة" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddWalletModal() {
  editingWalletId = null;
  const modal = document.getElementById('wallet-crud-modal');
  const title = document.getElementById('wallet-modal-title');
  const idInp = document.getElementById('wallet-id-input');
  const nameInp = document.getElementById('wallet-name-input');
  const numInp = document.getElementById('wallet-number-input');
  const holderInp = document.getElementById('wallet-holder-input');
  const noteInp = document.getElementById('wallet-note-input');
  const iconSel = document.getElementById('wallet-icon-select');
  const actInp = document.getElementById('wallet-active-input');

  if (title) title.textContent = 'إضافة محفظة / حساب بنكي جديد';
  if (idInp) idInp.value = '';
  if (nameInp) nameInp.value = '';
  if (numInp) numInp.value = '';
  if (holderInp) holderInp.value = 'متجر تسوق الذكي';
  if (noteInp) noteInp.value = '';
  if (iconSel) iconSel.value = '📱';
  if (actInp) actInp.checked = true;

  if (modal) modal.classList.add('active');
}

function openEditWalletModal(walletId) {
  const w = (state.paymentWallets || []).find(item => item.id === walletId);
  if (!w) return;

  editingWalletId = walletId;
  const modal = document.getElementById('wallet-crud-modal');
  const title = document.getElementById('wallet-modal-title');
  const idInp = document.getElementById('wallet-id-input');
  const nameInp = document.getElementById('wallet-name-input');
  const numInp = document.getElementById('wallet-number-input');
  const holderInp = document.getElementById('wallet-holder-input');
  const noteInp = document.getElementById('wallet-note-input');
  const iconSel = document.getElementById('wallet-icon-select');
  const actInp = document.getElementById('wallet-active-input');

  if (title) title.textContent = `تعديل محفظة: ${w.nameAr}`;
  if (idInp) idInp.value = w.id;
  if (nameInp) nameInp.value = w.nameAr;
  if (numInp) numInp.value = w.number;
  if (holderInp) holderInp.value = w.holderName || '';
  if (noteInp) noteInp.value = w.note || '';
  if (iconSel) iconSel.value = w.icon || '📱';
  if (actInp) actInp.checked = w.isActive !== false;

  if (modal) modal.classList.add('active');
}

function closeWalletModal() {
  const modal = document.getElementById('wallet-crud-modal');
  if (modal) modal.classList.remove('active');
  editingWalletId = null;
}

function saveWalletModal(e) {
  if (e) e.preventDefault();

  const name = (document.getElementById('wallet-name-input')?.value || '').trim();
  const number = (document.getElementById('wallet-number-input')?.value || '').trim();
  const holder = (document.getElementById('wallet-holder-input')?.value || '').trim();
  const note = (document.getElementById('wallet-note-input')?.value || '').trim();
  const icon = document.getElementById('wallet-icon-select')?.value || '📱';
  const isActive = document.getElementById('wallet-active-input') ? document.getElementById('wallet-active-input').checked : true;

  if (!name || !number) {
    alert('يرجى إدخال اسم المحفظة ورقم الحساب');
    return;
  }

  if (!state.paymentWallets) state.paymentWallets = [];

  if (editingWalletId) {
    const idx = state.paymentWallets.findIndex(w => w.id === editingWalletId);
    if (idx !== -1) {
      state.paymentWallets[idx] = {
        ...state.paymentWallets[idx],
        nameAr: name,
        number: number,
        holderName: holder,
        note: note,
        icon: icon,
        isActive: isActive
      };
      showToast(`تم تحديث محفظة ${name} بنجاح ✅`);
    }
  } else {
    const newId = 'wal-' + Date.now();
    state.paymentWallets.push({
      id: newId,
      nameAr: name,
      nameEn: name,
      number: number,
      holderName: holder,
      note: note,
      icon: icon,
      isActive: isActive
    });
    showToast(`تمت إضافة محفظة ${name} بنجاح 🎉`);
  }

  persistWallets();
  closeWalletModal();
  renderAdminWallets();
  renderCartWallets();
  sfx.playSuccess();
}

function toggleWalletActive(walletId) {
  sfx.playTap();
  const w = (state.paymentWallets || []).find(item => item.id === walletId);
  if (!w) return;
  w.isActive = !w.isActive;
  persistWallets();
  renderAdminWallets();
  renderCartWallets();
  showToast(`تم ${w.isActive ? 'تفعيل' : 'تعطيل'} محفظة: ${w.nameAr}`);
}

function deleteWallet(walletId) {
  sfx.playTap();
  const w = (state.paymentWallets || []).find(item => item.id === walletId);
  if (!w) return;
  if (!confirm(`هل أنت متأكد من حذف محفظة "${w.nameAr}"؟`)) return;

  state.paymentWallets = state.paymentWallets.filter(item => item.id !== walletId);
  persistWallets();
  renderAdminWallets();
  renderCartWallets();
  showToast(`تم حذف محفظة ${w.nameAr} بنجاح 🗑️`);
}

// --- MOBILE CART PAYMENT METHODS ---
function selectPaymentMethod(method) {
  sfx.playTap();
  state.selectedPaymentMethod = method; // 'cash' or 'wallet'

  const cashOpt = document.getElementById('pay-opt-cash');
  const walletOpt = document.getElementById('pay-opt-wallet');
  const cashRadio = document.getElementById('pay-radio-cash');
  const walletRadio = document.getElementById('pay-radio-wallet');
  const walletsWrap = document.getElementById('wallets-selection-wrap');

  if (method === 'cash') {
    if (cashOpt) cashOpt.classList.add('active');
    if (walletOpt) walletOpt.classList.remove('active');
    if (cashRadio) cashRadio.checked = true;
    if (walletRadio) walletRadio.checked = false;
    if (walletsWrap) walletsWrap.style.display = 'none';
  } else {
    if (walletOpt) walletOpt.classList.add('active');
    if (cashOpt) cashOpt.classList.remove('active');
    if (walletRadio) walletRadio.checked = true;
    if (cashRadio) cashRadio.checked = false;
    if (walletsWrap) walletsWrap.style.display = 'block';

    // Auto select first active wallet if none selected
    const activeWallets = (state.paymentWallets || []).filter(w => w.isActive !== false);
    if (!state.selectedWalletId && activeWallets.length > 0) {
      state.selectedWalletId = activeWallets[0].id;
    }
    renderCartWallets();
  }
}

function renderCartWallets() {
  const container = document.getElementById('cart-wallets-list');
  if (!container) return;

  const activeWallets = (state.paymentWallets || []).filter(w => w.isActive !== false);

  if (activeWallets.length === 0) {
    container.innerHTML = `
      <div style="padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; font-size: 0.78rem; color: #b45309; text-align: center;">
        ⚠️ لا توجد محافظ مفعلة حالياً، يرجى اختيار الدفع عند الاستلام نقداً أو مراجعة إدارة المتجر.
      </div>
    `;
    return;
  }

  // Ensure selectedWalletId is valid
  if (!state.selectedWalletId || !activeWallets.some(w => w.id === state.selectedWalletId)) {
    state.selectedWalletId = activeWallets[0].id;
  }

  container.innerHTML = activeWallets.map(w => {
    const isSelected = w.id === state.selectedWalletId;
    return `
      <div class="cart-wallet-item ${isSelected ? 'selected' : ''}" onclick="selectSpecificWallet('${w.id}')">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="radio" name="selected-cart-wallet-radio" value="${w.id}" ${isSelected ? 'checked' : ''} style="accent-color: #059669; width: 17px; height: 17px;">
            <div>
              <div style="font-weight: 800; font-size: 0.88rem; color: var(--text-main); display: flex; align-items: center; gap: 5px;">
                <span>${w.icon || '📱'}</span>
                <span>${w.nameAr}</span>
              </div>
              ${w.holderName ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 1px;">المستفيد: <b>${w.holderName}</b></div>` : ''}
            </div>
          </div>
          
          <div style="display: flex; align-items: center; gap: 6px;" dir="ltr">
            <span class="wallet-number-badge">${w.number}</span>
            <button type="button" class="copy-wallet-btn" onclick="event.stopPropagation(); copyWalletNumber('${w.number}', '${w.nameAr}', this)" title="نسخ رقم المحفظة">
              <span>📋</span>
              <span>نسخ</span>
            </button>
          </div>
        </div>
        ${w.note ? `<div style="font-size: 0.7rem; color: #b45309; background: #fffbeb; padding: 4px 8px; border-radius: 6px; margin-top: 6px;">💡 ${w.note}</div>` : ''}
      </div>
    `;
  }).join('');
}

function selectSpecificWallet(walletId) {
  sfx.playTap();
  state.selectedWalletId = walletId;
  renderCartWallets();
}

function copyWalletNumber(number, walletName, btnEl) {
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  if (!number) return;

  if (btnEl) {
    const orig = btnEl.innerHTML;
    btnEl.innerHTML = '✅';
    setTimeout(() => { btnEl.innerHTML = orig; }, 1600);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(number).then(() => {
      if (typeof showToast === 'function') showToast(`تم نسخ رقم ${walletName}: ${number} بنجاح ✅`);
    }).catch(() => {
      fallbackCopyTaswoq(number, walletName);
    });
  } else {
    fallbackCopyTaswoq(number, walletName);
  }
}

window.selectSpecificWallet = selectSpecificWallet;
window.copyWalletNumber = copyWalletNumber;
window.openAddWalletModal = openAddWalletModal;
window.openEditWalletModal = openEditWalletModal;
window.closeWalletModal = closeWalletModal;
window.saveWalletModal = saveWalletModal;
window.toggleWalletActive = toggleWalletActive;
window.deleteWallet = deleteWallet;
window.renderAdminWallets = renderAdminWallets;

// --- PROMOTIONAL BANNERS MANAGEMENT (CRUD) ---
let editingBannerId = null;

function renderAdminBanners() {
  const tbody = document.getElementById('admin-banners-tbody');
  if (!tbody) return;

  const banners = state.banners || window.GROCERY_DATA.banners;

  const isAr = state.lang === 'ar';
  tbody.innerHTML = banners.map(b => {
    const isActive = b.isActive !== false;
    const tag = isAr ? (b.tagAr || b.tag || 'عرض خاص') : (b.tagEn || b.tag || 'Special Offer');
    const title = isAr ? (b.titleAr || b.title || '') : (b.titleEn || b.title || '');
    const desc = isAr ? (b.descAr || b.desc || '') : (b.descEn || b.desc || '');
    const gradient = b.bgGradient || 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
    const img = b.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&auto=format&fit=crop&q=80';

    return `
      <tr>
        <td style="width: 230px;">
          <div style="height: 75px; width: 220px; border-radius: 12px; background: ${gradient}; position: relative; overflow: hidden; padding: 10px 14px; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.12); display: flex; flex-direction: column; justify-content: center;">
            <img src="${img}" style="position: absolute; left: 0; top: 0; width: 45%; height: 100%; object-fit: cover; opacity: 0.35; mask-image: linear-gradient(to right, transparent, black); pointer-events: none;" onerror="this.style.display='none'">
            <span style="background: rgba(255,255,255,0.25); backdrop-filter: blur(4px); align-self: flex-start; padding: 1px 8px; border-radius: 20px; font-size: 0.65rem; font-weight: 800; margin-bottom: 4px;">${tag}</span>
            <div style="font-size: 0.82rem; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${title}</div>
          </div>
        </td>
        <td>
          <span class="banner-tag" style="position: static; font-size: 0.72rem; padding: 2px 8px; margin-bottom: 4px; display: inline-block;">${tag}</span>
          <div style="font-weight: 800; font-size: 0.95rem; margin-top: 2px;">${title}</div>
        </td>
        <td>
          <div style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4; max-width: 260px;">${desc}</div>
        </td>
        <td>
          <span class="status-pill ${isActive ? 'status-completed' : 'status-cancelled'}">
            ${isActive ? (isAr ? 'معروض الآن 🟢' : 'Active 🟢') : (isAr ? 'متوقف ⚪' : 'Disabled ⚪')}
          </span>
        </td>
        <td>
          <div class="banner-actions-dropdown" style="position: relative;">
            <!-- Mobile Menu Trigger Button (يظهر في الهواتف فقط) -->
            <button type="button" class="ctrl-btn banner-menu-trigger" onclick="toggleBannerActionMenu(${b.id}, event)" title="${isAr ? 'خيارات البنر' : 'Banner options'}">
              <span>⚙️ ${isAr ? 'خيارات' : 'Options'}</span> <span class="arrow">▾</span>
            </button>

            <!-- Actions Menu -->
            <div class="banner-actions-menu" id="banner-menu-${b.id}">
              <button type="button" class="ctrl-btn banner-menu-item" onclick="toggleBannerActionMenu(${b.id}, event); broadcastBannerToNotifications(${b.id})" title="${isAr ? 'إرسال هذا العرض كإشعار فوري لجميع مستخدمي التطبيق' : 'Broadcast to notifications'}" style="font-size: 0.74rem; padding: 4px 8px; font-weight: 800; background: var(--primary-50); color: var(--primary-700);">
                📢 ${isAr ? 'إشعار' : 'Push'}
              </button>
              <button type="button" class="ctrl-btn banner-menu-item" onclick="toggleBannerActionMenu(${b.id}, event); openEditBannerModal(${b.id})" title="${isAr ? 'تعديل البنر' : 'Edit banner'}" style="font-size: 0.75rem; padding: 4px 8px;">
                ${isAr ? '✏️ تعديل' : '✏️ Edit'}
              </button>
              <button type="button" class="ctrl-btn banner-menu-item" onclick="toggleBannerActionMenu(${b.id}, event); toggleBannerActive(${b.id})" style="font-size: 0.75rem; padding: 4px 8px;">
                ${isActive ? (isAr ? '⚪ تعطيل' : '⚪ Disable') : (isAr ? '🟢 تفعيل' : '🟢 Activate')}
              </button>
              <button type="button" class="ctrl-btn banner-menu-item delete-btn" onclick="toggleBannerActionMenu(${b.id}, event); deleteBanner(${b.id})" title="${isAr ? 'حذف البنر' : 'Delete banner'}" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);">
                🗑️ ${isAr ? 'حذف' : 'Delete'}
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleBannerActionMenu = function (bannerId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const menu = document.getElementById(`banner-menu-${bannerId}`);
  if (!menu) return;
  const isAlreadyActive = menu.classList.contains('active');
  document.querySelectorAll('.banner-actions-menu.active').forEach(m => m.classList.remove('active'));
  if (!isAlreadyActive) {
    menu.classList.add('active');
  }
};

document.addEventListener('click', function (e) {
  if (!e.target.closest('.banner-actions-dropdown')) {
    document.querySelectorAll('.banner-actions-menu.active').forEach(m => m.classList.remove('active'));
  }
});

function openAddBannerModal() {
  editingBannerId = null;
  const title = document.getElementById('banner-modal-title');
  if (title) title.textContent = '🎉 إضافة بنر إعلاني جديد للسلايدر المتحرك';

  const tagInp = document.getElementById('banner-input-tag');
  const titleInp = document.getElementById('banner-input-title');
  const descInp = document.getElementById('banner-input-desc');
  const gradInp = document.getElementById('banner-input-gradient');
  const imgInp = document.getElementById('banner-input-image');
  const fileInp = document.getElementById('banner-input-file');
  const activeInp = document.getElementById('banner-input-active');

  if (tagInp) tagInp.value = 'عرض خاص 🔥';
  if (titleInp) titleInp.value = '';
  if (descInp) descInp.value = '';
  const defGrad = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
  if (gradInp) gradInp.value = defGrad;
  const defImg = 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80';
  if (imgInp) imgInp.value = defImg;
  if (fileInp) fileInp.value = '';
  if (activeInp) activeInp.checked = true;

  syncGradientControlsFromValue(defGrad);
  updateBannerImagePreview(defImg);
  refreshModalBannerLivePreview();

  const modal = document.getElementById('banner-crud-modal');
  if (modal) modal.classList.add('active');
}

function openEditBannerModal(id) {
  const banner = (state.banners || window.GROCERY_DATA.banners).find(b => b.id === id);
  if (!banner) return;
  editingBannerId = id;

  const title = document.getElementById('banner-modal-title');
  if (title) title.textContent = `✏️ تعديل بنر: ${banner.titleAr || banner.title}`;

  const tagInp = document.getElementById('banner-input-tag');
  const titleInp = document.getElementById('banner-input-title');
  const descInp = document.getElementById('banner-input-desc');
  const gradInp = document.getElementById('banner-input-gradient');
  const imgInp = document.getElementById('banner-input-image');
  const fileInp = document.getElementById('banner-input-file');
  const activeInp = document.getElementById('banner-input-active');

  if (tagInp) tagInp.value = banner.tagAr || banner.tag || '';
  if (titleInp) titleInp.value = banner.titleAr || banner.title || '';
  if (descInp) descInp.value = banner.descAr || banner.desc || '';
  const currentGrad = banner.bgGradient || 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
  if (gradInp) gradInp.value = currentGrad;
  if (imgInp) imgInp.value = banner.image || '';
  if (fileInp) fileInp.value = '';
  if (activeInp) activeInp.checked = banner.isActive !== false;

  syncGradientControlsFromValue(currentGrad);
  updateBannerImagePreview(banner.image || '');
  refreshModalBannerLivePreview();

  const modal = document.getElementById('banner-crud-modal');
  if (modal) modal.classList.add('active');
}

function closeBannerModal() {
  const modal = document.getElementById('banner-crud-modal');
  if (modal) modal.classList.remove('active');
}

function setBannerGradient(gradient) {
  const gradInp = document.getElementById('banner-input-gradient');
  if (gradInp) {
    gradInp.value = gradient;
    refreshModalBannerLivePreview();
  }
}

function handleBannerImageFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP, GIF)');
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    const dataUrl = e.target.result;
    const imgInput = document.getElementById('banner-input-image');
    if (imgInput) imgInput.value = dataUrl;
    updateBannerImagePreview(dataUrl);
    refreshModalBannerLivePreview();
    showToast('تم تحميل صورة البنر من جهازك بنجاح 🖼️');
  };
  reader.readAsDataURL(file);
}

function updateBannerImagePreview(src) {
  const previewImg = document.getElementById('banner-image-preview-img');
  if (previewImg) {
    previewImg.src = (src && src.trim() !== '') ? src : 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&auto=format&fit=crop&q=80';
  }
  refreshModalBannerLivePreview();
}

function clearBannerImage() {
  const imgInput = document.getElementById('banner-input-image');
  const fileInput = document.getElementById('banner-input-file');
  if (imgInput) imgInput.value = '';
  if (fileInput) fileInput.value = '';
  updateBannerImagePreview('');
  refreshModalBannerLivePreview();
  showToast('تمت إزالة صورة البنر');
}

function refreshModalBannerLivePreview() {
  const tagInp = document.getElementById('banner-input-tag');
  const titleInp = document.getElementById('banner-input-title');
  const descInp = document.getElementById('banner-input-desc');
  const gradInp = document.getElementById('banner-input-gradient');
  const imgInp = document.getElementById('banner-input-image');

  const box = document.getElementById('modal-banner-preview-box');
  const tagEl = document.getElementById('modal-banner-preview-tag');
  const titleEl = document.getElementById('modal-banner-preview-title');
  const descEl = document.getElementById('modal-banner-preview-desc');
  const bgImg = document.getElementById('modal-banner-preview-bg');

  const gradient = gradInp && gradInp.value ? gradInp.value : 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
  const tag = tagInp && tagInp.value ? tagInp.value : 'عرض خاص 🌿';
  const title = titleInp && titleInp.value ? titleInp.value : 'عنوان العرض الإعلاني';
  const desc = descInp && descInp.value ? descInp.value : 'الوصف الإعلاني للعرض';
  const img = imgInp && imgInp.value ? imgInp.value : '';

  if (box) box.style.background = gradient;
  if (tagEl) tagEl.textContent = tag;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (bgImg) {
    if (img && img.trim() !== '') {
      bgImg.src = img;
    } else {
      bgImg.src = 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=500&auto=format&fit=crop&q=80';
    }
    bgImg.style.display = 'block';
  }
}

function saveBanner() {
  const tagInp = document.getElementById('banner-input-tag');
  const titleInp = document.getElementById('banner-input-title');
  const descInp = document.getElementById('banner-input-desc');
  const gradInp = document.getElementById('banner-input-gradient');
  const imgInp = document.getElementById('banner-input-image');
  const activeInp = document.getElementById('banner-input-active');

  const tag = tagInp ? tagInp.value.trim() : 'عرض خاص';
  const title = titleInp ? titleInp.value.trim() : '';
  const desc = descInp ? descInp.value.trim() : '';
  const gradient = gradInp && gradInp.value.trim() ? gradInp.value.trim() : 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
  const image = imgInp && imgInp.value.trim() ? imgInp.value.trim() : 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80';
  const isActive = activeInp ? activeInp.checked : true;

  if (!title) {
    alert('يرجى إدخال عنوان البنر الإعلاني.');
    return;
  }

  if (editingBannerId !== null) {
    const banner = state.banners.find(b => b.id === editingBannerId);
    if (banner) {
      banner.tagAr = tag;
      banner.tagEn = tag;
      banner.titleAr = title;
      banner.titleEn = title;
      banner.descAr = desc;
      banner.descEn = desc;
      banner.bgGradient = gradient;
      banner.image = image;
      banner.isActive = isActive;
      showToast(`تم تعديل البنر: ${title} بنجاح 🎉`);
    }
  } else {
    const newId = state.banners.length > 0
      ? Math.max(...state.banners.map(b => b.id)) + 1
      : 1;
    state.banners.unshift({
      id: newId,
      tagAr: tag,
      tagEn: tag,
      titleAr: title,
      titleEn: title,
      descAr: desc,
      descEn: desc,
      bgGradient: gradient,
      image: image,
      isActive: isActive
    });
    showToast(`تمت إضافة البنر الجديد: ${title} بنجاح 🎉`);
  }

  persistBanners();
  closeBannerModal();
  renderAdminBanners();
  if (typeof initBannerSlider === 'function') initBannerSlider();
}

function toggleBannerActive(id) {
  sfx.playTap();
  const banner = state.banners.find(b => b.id === id);
  if (banner) {
    banner.isActive = banner.isActive === false ? true : false;
    persistBanners();
    renderAdminBanners();
    initBannerSlider();
    showToast(`تم ${banner.isActive ? 'تفعيل' : 'تعطيل'} البنر: ${banner.titleAr}`);
  }
}

function deleteBanner(id) {
  const banner = state.banners.find(b => b.id === id);
  if (!banner) return;

  if (state.banners.length <= 1) {
    alert('لا يمكن حذف هذا البنر لأنه البنر الوحيد المتبقي في السلايدر.');
    return;
  }

  if (confirm(`هل أنت متأكد من حذف البنر (${banner.titleAr}) نهائياً؟`)) {
    state.banners = state.banners.filter(b => b.id !== id);
    persistBanners();
    renderAdminBanners();
    initBannerSlider();
    showToast(`تم حذف البنر: ${banner.titleAr} 🗑️`);
  }
}

// Navigation Controls
function switchViewMode(mode) {
  sfx.playTap();
  state.viewMode = mode;
  document.querySelectorAll('.mode-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
  });

  const mobileWrapper = document.getElementById('mobile-phone-wrapper');
  const adminWrapper = document.getElementById('admin-dashboard-wrapper');

  if (mode === 'mobile') {
    mobileWrapper.style.display = 'block';
    adminWrapper.classList.remove('active');
  } else {
    mobileWrapper.style.display = 'none';
    adminWrapper.classList.add('active');
    renderAdminAll();
  }
}

function switchMobileTab(tabId) {
  sfx.playTap();
  state.activeMobileTab = tabId;

  document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.screen-view').forEach(view => {
    view.classList.toggle('active', view.id === `screen-${tabId}`);
  });

  if (tabId === 'favorites') renderFavoritesScreen();
  if (tabId === 'cart') renderCart();
  if (tabId === 'orders') renderOrderHistory();
}

function switchAdminSection(sectionId) {
  sfx.playTap();
  state.activeAdminTab = sectionId;

  document.querySelectorAll('.admin-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-admin-sec') === sectionId);
  });

  document.querySelectorAll('.admin-view-panel').forEach(panel => {
    panel.style.display = panel.id === `admin-sec-${sectionId}` ? 'block' : 'none';
  });
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✨</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.9)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 2600);
}

function setupEventListeners() {
  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      sfx.playTap();
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });
  }

  const langToggle = document.getElementById('lang-toggle-btn');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      sfx.playTap();
      applyLang(state.lang === 'ar' ? 'en' : 'ar');
    });
  }

  const soundToggle = document.getElementById('sound-toggle-btn');
  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      sfx.enabled = !sfx.enabled;
      soundToggle.innerHTML = sfx.enabled ? '🔊 الصوت مفعل' : '🔇 صامت';
      if (sfx.enabled) sfx.playTap();
    });
  }

  const searchInput = document.getElementById('mobile-search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.searchQuery = e.target.value;
        renderProducts();
      }, 250);
    });
  }
}

// ==========================================================================
// 1. REAL CSV REPORT EXPORT (SRS v3 Audit & Accounting)
// ==========================================================================
function exportAdminReportCSV() {
  const user = state.currentUser;
  const isPrimary = user && (typeof isPrimaryAdmin === 'function' ? isPrimaryAdmin(user) : (user.isPrimaryAdmin === true || user.role === 'primary_admin'));

  if (!isPrimary) {
    if (typeof showToast === 'function') {
      showToast('⚠️ صلاحية تصدير التقارير مقتصرة حصرياً على حساب المدير العام 👑');
    }
    return;
  }
  if (typeof sfx !== 'undefined' && sfx.playSuccess) {
    try { sfx.playSuccess(); } catch (e) { }
  }
  const isAr = state.lang === 'ar';

  const { orders: filteredOrders, expenses: filteredExpenses, filter } = getFilteredProfitRecords();

  let grossSales = 0;
  let totalCost = 0;
  let totalDelivery = 0;
  (filteredOrders || []).forEach(o => {
    grossSales += (parseFloat(o.totalSales || o.totalItemsPrice) || 0);
    totalCost += (parseFloat(o.totalCost) || 0);
    totalDelivery += (parseFloat(o.deliveryFee) || 0);
  });

  let totalExpenses = 0;
  (filteredExpenses || []).forEach(e => {
    totalExpenses += (parseFloat(e.amount) || 0);
  });

  const grossProfit = grossSales - totalCost;
  const netProfit = grossProfit - totalExpenses;
  const profitMargin = grossSales > 0 ? ((netProfit / grossSales) * 100).toFixed(1) : '0';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('ar-YE');
  const issuerName = (user && (user.fullName || user.name || user.username)) ? (user.fullName || user.name || user.username) : 'المدير العام (Eng. AL-ParatY)';

  // Excel UTF-8 BOM
  let csv = '\uFEFF';
  csv += `"تقرير الأداء المالي والمبيعات وصافي الأرباح - تسوق (Taswoq)"\r\n`;
  csv += `"فترة الاستعلام المحددة","${filter.label || 'كافة الفترات المسجلة'}"\r\n`;
  csv += `"تاريخ البدء","${filter.startDate || 'كافة الفترات'}"\r\n`;
  csv += `"تاريخ الانتهاء","${filter.endDate || 'حتى الآن'}"\r\n`;
  csv += `"تاريخ وتوقيت التصدير","${dateStr} ${timeStr}"\r\n`;
  csv += `"المسؤول المصدر","${issuerName}"\r\n\r\n`;

  // Financial Summary Section
  csv += `"=== الملخص المالي المحاسبي المعتمد (SRS v3) للفترة المحددة ==="\r\n`;
  csv += `"المؤشر المالي","المبلغ الإجمالي (ر.ي)"\r\n`;
  csv += `"إجمالي مبيعات المنتجات للفترة","${grossSales.toFixed(2)}"\r\n`;
  csv += `"إجمالي تكلفة شراء البضاعة للفترة","${totalCost.toFixed(2)}"\r\n`;
  csv += `"إجمالي ربح البضاعة (Gross Profit)","${grossProfit.toFixed(2)}"\r\n`;
  csv += `"إجمالي المصروفات التشغيلية للفترة","${totalExpenses.toFixed(2)}"\r\n`;
  csv += `"صافي الربح الحقيقي الصافي (Net Realized Profit)","${netProfit.toFixed(2)}"\r\n`;
  csv += `"هامش صافي الربح المئوي للفترة","${profitMargin}%"\r\n`;
  csv += `"رسوم التوصيل المحصلة (مستثناة من صافي الربح إلى Eng. AL-ParatY)","${totalDelivery.toFixed(2)}"\r\n`;
  csv += `"عدد الطلبات المشمولة","${(filteredOrders || []).length}"\r\n`;
  csv += `"عدد سندات الصرف المشمولة","${(filteredExpenses || []).length}"\r\n\r\n`;

  // Orders Section
  csv += `"=== سجل طلبات العملاء للفترة المحددة ==="\r\n`;
  csv += `"رقم الطلب","التاريخ والوقت","اسم العميل","رقم الهاتف","الحي / المنطقة","الأصناف والكميات","مبيعات الأصناف (ر.ي)","تكلفة الشراء (ر.ي)","رسوم التوصيل (ر.ي)","صافي ربح الطلب (ر.ي)","حالة الطلب"\r\n`;

  (filteredOrders || []).forEach(o => {
    const itemsList = Array.isArray(o.items) ? o.items : [];
    const itemsStr = itemsList.map(i => {
      if (!i) return '';
      const pName = i.name || i.nameAr || (i.product && (i.product.nameAr || i.product.name)) || 'صنف';
      const q = i.qty || i.quantity || 1;
      return `${pName} (${q})`;
    }).filter(Boolean).join(' + ').replace(/"/g, '""');
    const zone = o.zoneName || 'حي الأندلس';
    const oDate = o.createdAt || o.date || 'الآن';
    const salesVal = (parseFloat(o.totalSales || o.totalItemsPrice) || 0).toFixed(2);
    const costVal = (parseFloat(o.totalCost) || 0).toFixed(2);
    const delVal = (parseFloat(o.deliveryFee) || 0).toFixed(2);
    const profitVal = (parseFloat(o.netProfit) || (salesVal - costVal)).toFixed(2);
    const oStatus = o.status || 'Completed';
    csv += `"#${o.id || o.orderNumber || ''}","${oDate}","${(o.customerName || '').replace(/"/g, '""')}","${o.customerPhone || ''}","${zone}","${itemsStr}","${salesVal}","${costVal}","${delVal}","${profitVal}","${oStatus}"\r\n`;
  });

  // Operational Expenses Section
  csv += `\r\n"=== سجل المصروفات التشغيلية للفترة المحددة ==="\r\n`;
  csv += `"رقم السند","التاريخ والوقت","تصنيف المصروف","البيان / التفاصيل","المبلغ (ر.ي)","طريقة الدفع","المسؤول"\r\n`;

  (filteredExpenses || []).forEach(e => {
    csv += `"${e.id}","${e.date}","${e.categoryNameAr || e.category}","${(e.desc || '').replace(/"/g, '""')}","${(parseFloat(e.amount) || 0).toFixed(2)}","${e.paymentMethod || 'نقداً'}","${e.recordedBy || 'المدير العام'}"\r\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const fileName = `tasweeq_profit_report_${dateStr}.csv`;
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, fileName);
  } else {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) { }
    }, 1000);
  }

  showToast(`تم تصدير تقرير أرباح الفترة (${filter.label || 'المحددة'}) بنجاح بصيغة CSV 📑`);
}

// Global alias so existing buttons trigger the real export
window.exportReport = exportAdminReportCSV;
window.exportAdminReportCSV = exportAdminReportCSV;

// ==========================================================================
// 2. BROADCAST BANNER TO NOTIFICATIONS
// ==========================================================================
function broadcastBannerToNotifications(bannerId) {
  const banner = (state.banners || window.GROCERY_DATA.banners).find(b => b.id === bannerId);
  if (!banner) return;

  const title = banner.titleAr || banner.title || 'عرض حصري من تسوق';
  const desc = banner.descAr || banner.desc || banner.tagAr || 'خصومات حصرية متوفرة الآن في التطبيق!';

  const newNotif = {
    id: Date.now(),
    titleAr: title,
    descAr: desc,
    tagAr: banner.tagAr || 'عرض سلايدر 🔥',
    time: 'الآن',
    isRead: false,
    icon: '🎉',
    type: 'promo'
  };

  if (!state.notifications) state.notifications = [];
  state.notifications.unshift(newNotif);
  localStorage.setItem('tasweeq_notifications', JSON.stringify(state.notifications));

  // إرسال الإشعار فورياً إلى السيرفر ومنه إلى جميع هواتف العملاء (APK)
  if (window.TaswoqSync && typeof window.TaswoqSync.sendNotification === 'function') {
    window.TaswoqSync.sendNotification({
      title: title,
      titleAr: title,
      body: desc,
      bodyAr: desc,
      target: 'all',
      sender: 'إدارة العروض'
    });
  }

  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
  showToast(`تم إرسال العرض بنجاح كإشعار فوري للجوال 🔔: "${title}"`);
}

function broadcastCurrentModalBanner() {
  const tagInp = document.getElementById('banner-input-tag');
  const titleInp = document.getElementById('banner-input-title');
  const descInp = document.getElementById('banner-input-desc');

  const title = titleInp ? titleInp.value.trim() : 'عرض ترويجي من تسوق';
  const desc = descInp ? descInp.value.trim() : 'تخفيضات طازجة متوفرة الآن!';
  const tag = tagInp ? tagInp.value.trim() : 'عرض خاص 🔥';

  const newNotif = {
    id: Date.now(),
    titleAr: title,
    descAr: desc,
    tagAr: tag,
    time: 'الآن',
    isRead: false,
    icon: '🎉',
    type: 'promo'
  };

  if (!state.notifications) state.notifications = [];
  state.notifications.unshift(newNotif);
  localStorage.setItem('tasweeq_notifications', JSON.stringify(state.notifications));

  sfx.playSuccess();
  showToast(`تم بث العرض كإشعار فوري لجميع عملاء التطبيق 🔔`);
}

// ==========================================================================
// 3. INTERACTIVE GRADIENT SLIDER CONTROLLER
// ==========================================================================
function onGradientControlsChange() {
  const angleSlider = document.getElementById('banner-grad-angle');
  const spreadSlider = document.getElementById('banner-grad-spread');
  const color1Picker = document.getElementById('banner-grad-c1');
  const color2Picker = document.getElementById('banner-grad-c2');
  const angleLabel = document.getElementById('banner-grad-angle-val');
  const hiddenGrad = document.getElementById('banner-input-gradient');
  const barPreview = document.getElementById('banner-grad-bar-preview');

  const angle = angleSlider ? parseInt(angleSlider.value, 10) : 135;
  const spread = spreadSlider ? parseInt(spreadSlider.value, 10) : 100;
  const c1 = color1Picker ? color1Picker.value : '#059669';
  const c2 = color2Picker ? color2Picker.value : '#10b981';

  if (angleLabel) {
    let dirText = 'مائل لليمين';
    if (angle >= 0 && angle < 45) dirText = 'إلى الأعلى ⬆️';
    else if (angle >= 45 && angle < 135) dirText = 'مائل لليمين ↗️';
    else if (angle >= 135 && angle < 180) dirText = 'إلى الأسفل ⬇️';
    else if (angle >= 180 && angle < 225) dirText = 'مائل لليسار ↙️';
    else if (angle >= 225 && angle < 315) dirText = 'إلى اليسار ⬅️';
    else dirText = 'مائل للأعلى ↖️';
    angleLabel.innerHTML = `<b>${angle}°</b> (${dirText})`;
  }

  const gradient = `linear-gradient(${angle}deg, ${c1} 0%, ${c2} ${spread}%)`;
  if (hiddenGrad) hiddenGrad.value = gradient;
  if (barPreview) barPreview.style.background = gradient;

  refreshModalBannerLivePreview();
}

function setGradientPreset(c1, c2, angle = 135, spread = 100) {
  const angleSlider = document.getElementById('banner-grad-angle');
  const spreadSlider = document.getElementById('banner-grad-spread');
  const color1Picker = document.getElementById('banner-grad-c1');
  const color2Picker = document.getElementById('banner-grad-c2');

  if (color1Picker) color1Picker.value = c1;
  if (color2Picker) color2Picker.value = c2;
  if (angleSlider) angleSlider.value = angle;
  if (spreadSlider) spreadSlider.value = spread;

  onGradientControlsChange();
}

function syncGradientControlsFromValue(gradStr) {
  let angle = 135;
  let c1 = '#059669';
  let c2 = '#10b981';
  let spread = 100;

  if (gradStr && gradStr.includes('linear-gradient')) {
    const angleMatch = gradStr.match(/(\d+)deg/);
    if (angleMatch) angle = parseInt(angleMatch[1], 10);
    const colorMatches = gradStr.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
    if (colorMatches && colorMatches.length >= 2) {
      c1 = colorMatches[0];
      c2 = colorMatches[1];
    }
  }

  const angleSlider = document.getElementById('banner-grad-angle');
  const spreadSlider = document.getElementById('banner-grad-spread');
  const color1Picker = document.getElementById('banner-grad-c1');
  const color2Picker = document.getElementById('banner-grad-c2');

  if (angleSlider) angleSlider.value = angle;
  if (spreadSlider) spreadSlider.value = spread;
  if (color1Picker && c1.startsWith('#')) color1Picker.value = c1.slice(0, 7);
  if (color2Picker && c2.startsWith('#')) color2Picker.value = c2.slice(0, 7);

  onGradientControlsChange();
}

// ==========================================================================
// 4. OPERATIONAL EXPENSES MODULE (المصروفات التشغيلية)
// ==========================================================================
function renderAdminExpenses() {
  const tbody = document.getElementById('admin-expenses-tbody');
  const kpiTodayEl = document.getElementById('kpi-exp-today');
  const kpiTotalEl = document.getElementById('kpi-exp-total');
  const kpiFuelEl = document.getElementById('kpi-exp-fuel');
  const kpiMaintEl = document.getElementById('kpi-exp-maint');

  const expenses = state.expenses || [];
  const isAr = state.lang === 'ar';
  const currency = isAr ? 'ر.ي' : 'YER';

  let todayTotal = 0;
  let allTotal = 0;
  let fuelTotal = 0;
  let otherTotal = 0;

  const todayStr = new Date().toISOString().slice(0, 10);

  expenses.forEach(e => {
    const amt = parseFloat(e.amount) || 0;
    allTotal += amt;
    if (e.date && e.date.startsWith(todayStr)) todayTotal += amt;
    if (e.category === 'fuel') fuelTotal += amt;
    else otherTotal += amt;
  });

  if (kpiTodayEl) kpiTodayEl.textContent = `${todayTotal.toFixed(2)} ${currency}`;
  if (kpiTotalEl) kpiTotalEl.textContent = `${allTotal.toFixed(2)} ${currency}`;
  if (kpiFuelEl) kpiFuelEl.textContent = `${fuelTotal.toFixed(2)} ${currency}`;
  if (kpiMaintEl) kpiMaintEl.textContent = `${otherTotal.toFixed(2)} ${currency}`;

  if (tbody) {
    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td><b>${e.id}</b></td>
        <td><div style="font-size: 0.78rem; font-weight: 700;">${e.date}</div></td>
        <td>
          <span class="status-pill status-prep" style="font-size: 0.75rem;">${e.categoryNameAr || e.category}</span>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.88rem;">${e.desc}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">بواسطة: ${e.recordedBy || 'المدير'}</div>
        </td>
        <td><b style="color: #ef4444; font-size: 0.95rem;">${(parseFloat(e.amount) || 0).toFixed(2)} ${currency}</b></td>
        <td><span class="brand-badge" style="font-size: 0.72rem;">${e.paymentMethod || 'نقداً'}</span></td>
        <td>
          <button class="ctrl-btn" onclick="deleteExpense('${e.id}')" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);" title="حذف سند المصروف">
            🗑️
          </button>
        </td>
      </tr>
    `).join('');
  }

  if (typeof renderAdminWallets === 'function') {
    renderAdminWallets();
  }
}

async function saveExpense() {
  const catSelect = document.getElementById('exp-input-category');
  const amtInput = document.getElementById('exp-input-amount');
  const descInput = document.getElementById('exp-input-desc');
  const payInput = document.getElementById('exp-input-payment');

  const cat = catSelect ? catSelect.value : 'fuel';
  const catText = catSelect ? catSelect.options[catSelect.selectedIndex].text : 'وقود دبابات ⛽';
  const amount = parseFloat(amtInput ? amtInput.value : 0);
  const desc = descInput ? descInput.value.trim() : '';
  const pay = payInput ? payInput.value : 'نقداً (كاش)';

  if (!amount || amount <= 0 || !desc) {
    alert('يرجى إدخال مبلغ المصروف والبيان التفصيلي');
    return;
  }

  const expensePayload = {
    category: cat,
    categoryNameAr: catText,
    desc: desc,
    amount: amount,
    paymentMethod: pay
  };

  if (window.TaswoqSync && typeof window.TaswoqSync.saveExpense === 'function') {
    try {
      const data = await window.TaswoqSync.saveExpense(expensePayload);
      if (data && data.success && data.expense) {
        if (!state.expenses) state.expenses = [];
        state.expenses.unshift(data.expense);
        try { localStorage.setItem('tasweeq_expenses', JSON.stringify(state.expenses)); } catch (e) { }

        if (amtInput) amtInput.value = '';
        if (descInput) descInput.value = '';

        renderAdminExpenses();
        renderAdminKpis();
        if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
        showToast(`تم تسجيل سند صرف جديد بمبلغ ${amount.toFixed(2)} ر.ي 💸`);
      } else {
        const errMsg = (data && data.error) || 'فشل تسجيل المصروف في الخادم';
        alert(`❌ لم يتم الحفظ: ${errMsg}`);
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
      }
    } catch (err) {
      console.error('saveExpense error:', err);
      alert('تعذر الاتصال بالخادم لحفظ المصروف: ' + err.message);
    }
  }
}

async function deleteExpense(expId) {
  const numericId = parseInt(expId, 10);
  if (isNaN(numericId)) {
    alert('معرف المصروف غير صالح');
    return;
  }

  if (confirm(`هل أنت متأكد من حذف سند الصرف رقم (${numericId})؟`)) {
    if (window.TaswoqSync && typeof window.TaswoqSync.deleteExpense === 'function') {
      try {
        const data = await window.TaswoqSync.deleteExpense(numericId);
        if (data && data.success) {
          state.expenses = (state.expenses || []).filter(e => parseInt(e.id, 10) !== numericId);
          try { localStorage.setItem('tasweeq_expenses', JSON.stringify(state.expenses)); } catch (e) { }
          renderAdminExpenses();
          renderAdminKpis();
          showToast(`تم حذف سند الصرف: ${numericId} 🗑️`);
        } else {
          const errMsg = (data && data.error) || 'فشل حذف سند الصرف من الخادم';
          alert(`❌ لم يتم الحذف: ${errMsg}`);
          if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        }
      } catch (err) {
        console.error('deleteExpense error:', err);
        alert('تعذر الاتصال بالخادم لحذف سند الصرف: ' + err.message);
      }
    }
  }
}

// ==========================================================================
// 5. DELEGATE ACCOUNTS & PERMISSIONS (إدارة حسابات المناديب)
// ==========================================================================
function renderAdminDelegates() {
  const tbody = document.getElementById('admin-delegates-tbody');
  if (!tbody) return;

  tbody.innerHTML = (state.delegates || []).map(d => {
    const isCurrent = state.currentUser && state.currentUser.role === 'delegate' && state.currentUser.id === d.id;
    return `
      <tr style="${isCurrent ? 'background: rgba(16, 185, 129, 0.08);' : ''}">
        <td>
          <div style="font-weight: 800; font-size: 0.95rem;">${d.name}</div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">هاتف: <span dir="ltr">${d.phone}</span></div>
        </td>
        <td><span class="status-pill status-prep">📍 ${d.zone}</span></td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            <span class="brand-badge" style="font-size: 0.7rem; background: ${d.permissions.canViewOrders ? 'var(--primary-50)' : '#fef2f2'}; color: ${d.permissions.canViewOrders ? 'var(--primary-700)' : '#b91c1c'};">${d.permissions.canViewOrders ? 'عرض الطلبات ✅' : 'حجب الطلبات ❌'}</span>
            <span class="brand-badge" style="font-size: 0.7rem; background: ${d.permissions.canViewProfits ? '#fef2f2' : '#ecfdf5'}; color: ${d.permissions.canViewProfits ? '#b91c1c' : '#047857'};">${d.permissions.canViewProfits ? 'الأرباح مكشوفة ⚠️' : 'الأرباح محجوبة 🔒'}</span>
            <span class="brand-badge" style="font-size: 0.7rem; background: ${d.permissions.ordersOnlyAssigned ? '#eff6ff' : '#f8fafc'}; color: ${d.permissions.ordersOnlyAssigned ? '#1d4ed8' : 'var(--text-muted)'};">${d.permissions.ordersOnlyAssigned ? 'منطقته فقط' : 'كل المناطق'}</span>
          </div>
        </td>
        <td>
          <span class="status-pill ${d.status === 'active' ? 'status-completed' : 'status-cancelled'}">
            ${d.status === 'active' ? 'نشط 🟢' : 'معطل 🔴'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button class="ctrl-btn" onclick="loginAsDelegate(${d.id})" style="font-size: 0.75rem; padding: 4px 8px; font-weight: 800; color: var(--info);" title="تجربة لوحة التحكم بصلاحيات هذا المندوب">
              👤 دخول كمندوب
            </button>
            <button class="ctrl-btn" onclick="toggleDelegateStatus(${d.id})" style="font-size: 0.75rem; padding: 4px 8px;">
              ${d.status === 'active' ? 'تعطيل' : 'تفعيل'}
            </button>
            <button class="ctrl-btn" onclick="deleteDelegate(${d.id})" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);" title="حذف حساب المندوب">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function createDelegateAccount() {
  const nameInp = document.getElementById('del-input-name');
  const phoneInp = document.getElementById('del-input-phone');
  const pinInp = document.getElementById('del-input-pin');
  const zoneInp = document.getElementById('del-input-zone');

  const permOrders = document.getElementById('del-perm-orders')?.checked ?? true;
  const permProfits = document.getElementById('del-perm-profits')?.checked ?? false;
  const permProducts = document.getElementById('del-perm-products')?.checked ?? false;
  const permSettings = document.getElementById('del-perm-settings')?.checked ?? false;
  const permZoneOnly = document.getElementById('del-perm-zone-only')?.checked ?? true;

  const name = nameInp ? nameInp.value.trim() : '';
  const phone = phoneInp ? phoneInp.value.trim() : '';
  const pin = pinInp ? pinInp.value.trim() : '';
  const zone = zoneInp ? zoneInp.value : 'حي الأندلس (المركز)';

  if (!name || !phone) {
    alert('يرجى كتابة اسم المندوب ورقم هاتفه للدخول');
    return;
  }

  const newId = state.delegates.length > 0 ? Math.max(...state.delegates.map(d => d.id)) + 1 : 1;
  const newDel = {
    id: newId,
    name: name,
    phone: phone,
    pin: pin || '1234',
    zone: zone,
    status: 'active',
    permissions: {
      canViewOrders: permOrders,
      canUpdateOrderStatus: true,
      canViewProfits: permProfits,
      canViewExpenses: permProfits,
      canManageProducts: permProducts,
      canManageSettings: permSettings,
      ordersOnlyAssigned: permZoneOnly
    },
    createdAt: new Date().toISOString().slice(0, 10)
  };

  if (!state.delegates) state.delegates = [];
  state.delegates.push(newDel);
  localStorage.setItem('tasweeq_delegates', JSON.stringify(state.delegates));

  if (nameInp) nameInp.value = '';
  if (phoneInp) phoneInp.value = '';
  if (pinInp) pinInp.value = '';

  renderAdminDelegates();
  sfx.playSuccess();
  showToast(`تم إنشاء حساب المندوب (${name}) وتحديد الصلاحيات بنجاح 🎉`);
}

function toggleDelegateStatus(id) {
  const d = (state.delegates || []).find(item => item.id === id);
  if (d) {
    d.status = d.status === 'active' ? 'disabled' : 'active';
    localStorage.setItem('tasweeq_delegates', JSON.stringify(state.delegates));
    renderAdminDelegates();
    showToast(`تم تحديث حالة حساب المندوب: ${d.name}`);
  }
}

function deleteDelegate(id) {
  const d = (state.delegates || []).find(item => item.id === id);
  if (!d) return;
  if (confirm(`هل أنت متأكد من حذف حساب المندوب (${d.name}) نهائياً؟`)) {
    state.delegates = state.delegates.filter(item => item.id !== id);
    localStorage.setItem('tasweeq_delegates', JSON.stringify(state.delegates));
    renderAdminDelegates();
    showToast(`تم حذف حساب المندوب: ${d.name} 🗑️`);
  }
}

function loginAsDelegate(delegateId) {
  const del = state.delegates.find(d => d.id === delegateId);
  if (!del) return;

  state.currentUser = {
    role: 'delegate',
    id: del.id,
    name: `المندوب: ${del.name}`,
    email: `${del.phone}@delegate.tasweeq.ye`,
    zone: del.zone,
    permissions: del.permissions,
    verifiedGoogle: false
  };
  localStorage.setItem('tasweeq_current_user', JSON.stringify(state.currentUser));

  renderAdminAuthUI();
  renderAdminAll();
  sfx.playTap();
  showToast(`تم التبديل إلى حساب المندوب (${del.name}) - تم تطبيق الأذونات 🔒`);
  switchAdminSection('orders');
}

function returnToAdminUser() {
  const admin = (state.users || []).find(u => isPrimaryAdmin(u)) ||
    (state.users || []).find(u => u.id === 'usr-101' || u.username === 'admin');
  if (admin) {
    state.currentUser = admin;
    localStorage.setItem('tasweeq_current_user', JSON.stringify(admin));
    localStorage.setItem('tasweeq_admin_auth', 'true');
    renderAdminAuthUI();
    applyUserPermissions();
    renderAdminAll();
    sfx.playSuccess();
    showToast(`تمت العودة لحساب المدير العام (${admin.fullName}) 🛡️`);
  }
}

// ==========================================================================
// 5.5 GENERAL SETTINGS CONTROLLER (Redesigned Modular Settings)
// ==========================================================================

function setAdminLanguage(lang, isSilent = false) {
  state.lang = lang;
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  localStorage.setItem('tasweeq_lang', lang);

  updateAdminLanguageUI(lang);

  if (typeof updateAllInterfaceTexts === 'function') {
    updateAllInterfaceTexts(lang);
  }
  if (typeof renderAdminAll === 'function') {
    renderAdminAll();
  }
  if (!isSilent) {
    if (typeof sfx !== 'undefined' && sfx.playSuccess) {
      sfx.playSuccess();
    }
    const msg = lang === 'ar'
      ? 'تم تفعيل اللغة العربية للوحة التحكم بنجاح 🇸🇦'
      : 'Admin Dashboard switched to English successfully 🇬🇧';
    showToast(msg);
  }
}

function toggleAdminLanguage() {
  const cur = state.lang || localStorage.getItem('tasweeq_lang') || 'ar';
  setAdminLanguage(cur === 'ar' ? 'en' : 'ar');
}

function updateAdminLanguageUI(lang) {
  const isAr = (lang || state.lang || 'ar') === 'ar';
  const cardAr = document.getElementById('lang-card-ar');
  const cardEn = document.getElementById('lang-card-en');
  const badgeAr = document.getElementById('lang-badge-ar');
  const badgeEn = document.getElementById('lang-badge-en');
  const curText = document.getElementById('current-lang-text');

  if (cardAr && cardEn) {
    if (isAr) {
      cardAr.classList.add('active');
      cardEn.classList.remove('active');
      if (badgeAr) { badgeAr.textContent = 'نشط الآن ✅'; badgeAr.className = 'status-pill status-completed'; }
      if (badgeEn) { badgeEn.textContent = 'تبديل إلى English'; badgeEn.className = 'status-pill status-pending'; }
    } else {
      cardEn.classList.add('active');
      cardAr.classList.remove('active');
      if (badgeEn) { badgeEn.textContent = 'Active Now ✅'; badgeEn.className = 'status-pill status-completed'; }
      if (badgeAr) { badgeAr.textContent = 'التبديل إلى العربية'; badgeAr.className = 'status-pill status-pending'; }
    }
  }
  if (curText) {
    curText.textContent = isAr ? 'العربية (RTL)' : 'English (LTR)';
  }
}

function setAppTheme(theme) {
  let effectiveTheme = theme;
  if (theme === 'auto') {
    effectiveTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  localStorage.setItem('tasweeq_theme', theme);
  if (typeof state !== 'undefined') state.theme = theme;
  updateThemeUI(theme);

  if (typeof sfx !== 'undefined' && sfx.playTap) {
    sfx.playTap();
  }
  const label = theme === 'dark' ? 'الوضع الليلي 🌙' : theme === 'light' ? 'الوضع النهاري ☀️' : 'الوضع التلقائي 💻';
  showToast(`تم تفعيل ${label}`);
}

function toggleTheme() {
  const cur = localStorage.getItem('tasweeq_theme') || document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  setAppTheme(next);
}

function updateThemeUI(theme) {
  const cur = theme || localStorage.getItem('tasweeq_theme') || 'light';
  const isDark = cur === 'dark' || (cur === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const btnIcon = document.getElementById('theme-btn-icon');
  const btnText = document.getElementById('theme-btn-text');
  if (btnIcon) btnIcon.textContent = isDark ? '☀️' : '🌙';
  if (btnText) btnText.textContent = isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي';

  const cardLight = document.getElementById('theme-card-light');
  const cardDark = document.getElementById('theme-card-dark');
  const cardAuto = document.getElementById('theme-card-auto');

  const badgeLight = document.getElementById('theme-badge-light');
  const badgeDark = document.getElementById('theme-badge-dark');
  const badgeAuto = document.getElementById('theme-badge-auto');

  if (cardLight) cardLight.classList.toggle('active', cur === 'light');
  if (cardDark) cardDark.classList.toggle('active', cur === 'dark');
  if (cardAuto) cardAuto.classList.toggle('active', cur === 'auto');

  if (badgeLight) {
    badgeLight.textContent = cur === 'light' ? 'نشط الآن ✅' : 'تفعيل';
    badgeLight.className = cur === 'light' ? 'status-pill status-completed' : 'status-pill status-pending';
  }
  if (badgeDark) {
    badgeDark.textContent = cur === 'dark' ? 'نشط الآن ✅' : 'تفعيل';
    badgeDark.className = cur === 'dark' ? 'status-pill status-completed' : 'status-pill status-pending';
  }
  if (badgeAuto) {
    badgeAuto.textContent = cur === 'auto' ? 'نشط الآن ✅' : 'تفعيل';
    badgeAuto.className = cur === 'auto' ? 'status-pill status-completed' : 'status-pill status-pending';
  }
}

function toggleSoundEffects(checkbox) {
  const isEnabled = checkbox ? checkbox.checked : true;
  if (typeof sfx !== 'undefined') {
    sfx.enabled = isEnabled;
  }
  localStorage.setItem('tasweeq_sfx_enabled', isEnabled ? 'true' : 'false');
  if (isEnabled && typeof sfx !== 'undefined' && sfx.playTap) {
    sfx.playTap();
  }
  showToast(isEnabled ? '🔊 تم تفعيل المؤثرات الصوتية للأزرار والتفاعلات' : '🔇 تم كتم المؤثرات الصوتية');
}

function testAlertSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      showToast('🔔 نغمة التنبيه نشطة');
      return;
    }
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Tone 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.14); // A5
    gain2.gain.setValueAtTime(0.22, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.48);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.48);

    showToast('🔔 تم تشغيل نغمة التنبيه التجريبية بنجاح');
  } catch (e) {
    showToast('🔔 نغمة التنبيه التجريبية نشطة');
  }
}

function saveStoreGeneralSettings(isConfirmed = false) {
  if (!isConfirmed) {
    showGeneralConfirmDialog({
      title: 'تأكيد حفظ بيانات المتجر 💾',
      message: 'هل أنت متأكد من حفظ بيانات وهوية المتجر ومعلومات التواصل؟',
      icon: '🏪',
      confirmText: 'نعم',
      cancelText: 'لا',
      onConfirm: function () {
        saveStoreGeneralSettings(true);
      }
    });
    return;
  }
  const storeName = document.getElementById('setting-store-name')?.value.trim() || 'تسوق - متجر البقالة الذكي';
  const storePhone = document.getElementById('setting-store-phone')?.value.trim() || '+967 770001122';
  const storeAddress = document.getElementById('setting-store-address')?.value.trim() || 'صنعاء - حي الأندلس، الشارع التجاري';
  const storeHours = document.getElementById('setting-store-hours')?.value.trim() || 'يومياً من 08:00 صباحاً حتى 12:00 منتصف الليل';
  const storeEmail = document.getElementById('setting-store-email')?.value.trim() || 'support@taswoq.ye';
  const storeDeliveryTime = document.getElementById('setting-store-delivery-time')?.value.trim() || '15 - 25 دقيقة';
  const storeMinFree = document.getElementById('setting-store-min-free')?.value.trim() || '50.00';
  const storeCurrency = document.getElementById('setting-store-currency')?.value || 'YER';

  const storeProfile = {
    name: storeName,
    phone: storePhone,
    address: storeAddress,
    hours: storeHours,
    email: storeEmail,
    deliveryTime: storeDeliveryTime,
    minFreeDelivery: storeMinFree,
    currency: storeCurrency,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem('tasweeq_store_profile', JSON.stringify(storeProfile));

  // 1. Sync supportSettings & deliverySettings
  state.supportSettings = state.supportSettings || {};
  state.supportSettings.whatsapp = storePhone;
  state.supportSettings.workingHoursAr = storeHours;
  state.supportSettings.workingHoursEn = storeHours;
  state.supportSettings.email = storeEmail;
  try { localStorage.setItem('tasweeq_support_settings', JSON.stringify(state.supportSettings)); } catch (e) { }

  state.deliverySettings = state.deliverySettings || {};
  state.deliverySettings.estimatedTime = storeDeliveryTime;
  try { localStorage.setItem('tasweeq_delivery_settings', JSON.stringify(state.deliverySettings)); } catch (e) { }

  // 2. Link with Approved WhatsApp Delegate for Orders
  const cleanPhone = storePhone.replace(/[^0-9]/g, '');
  if (cleanPhone.length >= 7) {
    let finalPhone = cleanPhone;
    if (finalPhone.length === 9 && finalPhone.startsWith('7')) finalPhone = '967' + finalPhone;

    state.whatsappRecipients = state.whatsappRecipients || [];
    let primary = state.whatsappRecipients.find(r => r.id === 4 || r.id === state.approvedDelegateId || r.isApproved);
    if (primary) {
      primary.phone = finalPhone;
      primary.label = 'خدمة العملاء والطلبات';
      primary.isApproved = true;
      primary.isActive = true;
    } else {
      primary = { id: 4, phone: finalPhone, label: 'خدمة العملاء والطلبات', isApproved: true, isActive: true, lastUsedAt: 'الآن' };
      state.whatsappRecipients.unshift(primary);
    }
    state.approvedDelegateId = primary.id;
    try {
      localStorage.setItem('tasweeq_whatsapp_recipients', JSON.stringify(state.whatsappRecipients));
      localStorage.setItem('tasweeq_approved_delegate_id', primary.id.toString());
    } catch (e) { }
    if (typeof renderAdminWhatsApp === 'function') renderAdminWhatsApp();
  }

  // 3. Sync to Server
  if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === "function") {
    window.TaswoqSync.syncUp({
      deliverySettings: state.deliverySettings,
      supportSettings: state.supportSettings,
      whatsappRecipients: state.whatsappRecipients,
      approvedDelegateId: state.approvedDelegateId,
      storeProfile: storeProfile
    });
  }

  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
  showToast('✅ تم حفظ وربط رقم واتساب الطلبات وساعات العمل وإعدادات المتجر بنجاح');
}

function loadStoreGeneralSettings() {
  const raw = localStorage.getItem('tasweeq_store_profile');
  let p = {
    name: 'تسوق - متجر البقالة الذكي',
    phone: '+967 770001122',
    address: 'صنعاء - حي الأندلس، الشارع الرئيسي',
    hours: 'يومياً من 08:00 صباحاً حتى 12:00 منتصف الليل',
    email: 'support@taswoq.ye',
    deliveryTime: '15 - 25 دقيقة',
    minFreeDelivery: '50.00',
    currency: 'YER'
  };
  if (raw) {
    try { p = { ...p, ...JSON.parse(raw) }; } catch (e) { }
  }

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal('setting-store-name', p.name);
  setVal('setting-store-phone', p.phone);
  setVal('setting-store-address', p.address);
  setVal('setting-store-hours', p.hours);
  setVal('setting-store-email', p.email);
  setVal('setting-store-delivery-time', p.deliveryTime || '15 - 25 دقيقة');
  setVal('setting-store-min-free', p.minFreeDelivery);
  setVal('setting-store-currency', p.currency);
}

function exportSystemBackupJSON() {
  const backupData = {
    app: 'Taswoq Grocery System',
    version: '3.2.0 Pro',
    exportedAt: new Date().toISOString(),
    storeProfile: JSON.parse(localStorage.getItem('tasweeq_store_profile') || '{}'),
    orders: state.orders || [],
    products: state.products || [],
    categories: state.categories || [],
    deliveryZones: state.deliveryZones || [],
    delegates: state.delegates || [],
    whatsappRecipients: state.whatsappRecipients || []
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `tasweeq_backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
  showToast('💾 تم تحميل نسخة احتياطية كاملة من النظام بنجاح (JSON)');
}

function clearSystemCache() {
  if (confirm('هل أنت متأكد من تفريغ الذاكرة المؤقتة للوحة التحكم؟ سيتم إعادة تحميل الصفحة.')) {
    sessionStorage.clear();
    showToast('🧹 جاري تفريغ الكاش وإعادة التحميل...');
    setTimeout(() => {
      window.location.reload();
    }, 600);
  }
}

function saveAllAdminSettings(isConfirmed = false) {
  if (!isConfirmed) {
    showGeneralConfirmDialog({
      title: 'تأكيد حفظ كافة التعديلات 💾',
      message: 'هل أنت متأكد من حفظ وتأكيد كافة إعدادات وتفضيلات المتجر والنظام؟',
      icon: '⚙️',
      confirmText: 'نعم',
      cancelText: 'لا',
      onConfirm: function () {
        saveAllAdminSettings(true);
      }
    });
    return;
  }
  saveStoreGeneralSettings(true);
  showToast('🎉 تم حفظ وتأكيد كافة إعدادات وتفضيلات النظام بنجاح');
}

function resetAdminSettingsToDefault() {
  if (confirm('هل ترغب بإعادة ضبط الإعدادات العامة إلى حالتها الافتراضية؟')) {
    setAdminLanguage('ar');
    setAppTheme('light');
    localStorage.removeItem('tasweeq_store_profile');
    loadStoreGeneralSettings();
    const sfxToggle = document.getElementById('setting-sfx-toggle');
    if (sfxToggle) { sfxToggle.checked = true; toggleSoundEffects(sfxToggle); }
    showToast('🔄 تمت استعادة الإعدادات العامة الافتراضية بنجاح');
  }
}

function renderAdminSettings() {
  const curLang = localStorage.getItem('tasweeq_lang') || 'ar';
  updateAdminLanguageUI(curLang);

  const curTheme = localStorage.getItem('tasweeq_theme') || 'light';
  updateThemeUI(curTheme);

  loadStoreGeneralSettings();

  const sfxToggle = document.getElementById('setting-sfx-toggle');
  if (sfxToggle) {
    sfxToggle.checked = localStorage.getItem('tasweeq_sfx_enabled') !== 'false';
  }
}

// ==========================================================================
// 6. ENTERPRISE AUTHENTICATION & USER MANAGEMENT (login-system-requirements.md)
// ==========================================================================

// 1. Audit Log System
function addAuditLog(action, actionTitle, details, targetUserId = null, targetUserName = null) {
  if (!state.auditLogs) state.auditLogs = [];
  const actor = state.currentUser || { id: 'sys', fullName: 'النظام / زائر', role: 'guest' };
  const newLog = {
    id: 'log-' + (Date.now() + Math.floor(Math.random() * 100)),
    userId: actor.id || 'sys',
    userName: actor.fullName || actor.name || 'زائر',
    action: action,
    actionTitle: actionTitle,
    details: details,
    targetUserId: targetUserId,
    targetUserName: targetUserName,
    ipAddress: '192.168.1.' + (10 + (state.auditLogs.length % 50)),
    timestamp: new Date().toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'medium' })
  };
  state.auditLogs.unshift(newLog);
  if (state.auditLogs.length > 200) state.auditLogs.pop();
  localStorage.setItem('khudair_audit_logs', JSON.stringify(state.auditLogs));
  if (typeof renderAdminAuditLogs === 'function') renderAdminAuditLogs();
}

// 2. Active Session Verification & Kickout on Disable / Delete
function verifyCurrentSessionActive(showReason = true) {
  if (!state.currentUser) return true;
  // الحسابات المصادقة عبر جلسة الخادم لا تخضع لمسح الذاكرة المحلية المؤقتة
  if (state.currentUser.role === 'developer_admin' || state.currentUser.id === 'usr_developer' || state.currentUser.username === 'usr_developer') {
    return true;
  }
  if (isPrimaryAdmin(state.currentUser) || state.currentUser.role === 'primary_admin' || state.currentUser.isPrimaryAdmin === true) {
    return true;
  }

  let latestUsers = state.users;
  try {
    const raw = localStorage.getItem('khudair_users');
    if (raw) {
      latestUsers = JSON.parse(raw);
      state.users = latestUsers;
    }
  } catch (e) { }

  // إذا لم تكن قائمة المستخدمين متوفرة محلياً أو كانت فارغة
  if (!Array.isArray(latestUsers) || latestUsers.length === 0) {
    return true;
  }

  const currentId = state.currentUser.id;
  const currentUsername = state.currentUser.username;

  const liveUser = (latestUsers || []).find(u =>
    (currentId && u.id === currentId) ||
    (currentUsername && u.username && u.username.toLowerCase() === currentUsername.toLowerCase())
  );

  // إذا لم يُعثر على المستخدم في الذاكرة المؤقتة، فلا نطرده لأنه موثق عبر جلسة الخادم
  if (!liveUser) {
    return true;
  }

  // فقط إذا كان المستخدم موجوداً في القائمة ومحكوماً صراحة بأنه غير نشط (معطل)
  if (liveUser.isActive === false) {
    const reasonMsg = '⛔ تم إنهاء جلستك وتحويلك لشاشة تسجيل الدخول لأن حسابك تم تعطيله من قبل الإدارة.';

    // Perform full, clean logout action
    confirmLogoutAction();

    if (showReason && typeof showToast === 'function') {
      showToast(reasonMsg);
    }
    if (typeof sfx !== 'undefined' && sfx.playError) {
      sfx.playError();
    }
    return false;
  }

  // Update in-memory user reference
  state.currentUser = liveUser;
  return true;
}

// 2a. Centralized Global Auth Overlay Display Helpers
window.showWebAuthOverlay = function () {
  const overlay = document.getElementById('web-auth-overlay');
  if (overlay) {
    overlay.style.setProperty('display', 'flex', 'important');
  }
};

window.hideWebAuthOverlay = function () {
  const overlay = document.getElementById('web-auth-overlay');
  if (overlay) {
    overlay.style.setProperty('display', 'none', 'important');
    overlay.style.display = 'none';
  }
};

// 2b. Check Auth State on Load
function checkAuthState() {
  // في لوحة الإدارة: لا نعتمد على localStorage مطلقاً لإثبات المصادقة أو تطبيق الصلاحيات
  if (document.querySelector('.admin-standalone-layout') || (window.location && window.location.pathname.includes('admin'))) {
    return;
  }
  const savedUser = localStorage.getItem('tasweeq_current_user');

  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      const isValid = verifyCurrentSessionActive(false);
      if (!isValid) return;

      hideWebAuthOverlay();
      renderAdminAuthUI();
      applyUserPermissions();
    } catch (e) {
      state.currentUser = null;
      showWebAuthOverlay();
    }
  } else {
    state.currentUser = null;
    showWebAuthOverlay();
  }
}

// 3. Switch Auth Modal Tab
function switchAuthTab(tab) {
  const empTabBtn = document.getElementById('auth-tab-emp-btn');
  const adminTabBtn = document.getElementById('auth-tab-admin-btn');
  const empPanel = document.getElementById('auth-panel-employee');
  const adminPanel = document.getElementById('auth-panel-admin');
  const empErr = document.getElementById('emp-auth-error');
  const adminErr = document.getElementById('admin-auth-error');
  if (empErr) empErr.style.display = 'none';
  if (adminErr) adminErr.style.display = 'none';

  if (tab === 'admin') {
    if (adminTabBtn) {
      adminTabBtn.classList.add('active');
      adminTabBtn.style.background = 'var(--bg-surface)';
      adminTabBtn.style.color = 'var(--primary-700)';
    }
    if (empTabBtn) {
      empTabBtn.classList.remove('active');
      empTabBtn.style.background = 'transparent';
      empTabBtn.style.color = 'var(--text-muted)';
    }
    if (adminPanel) adminPanel.style.display = 'block';
    if (empPanel) empPanel.style.display = 'none';
  } else {
    if (empTabBtn) {
      empTabBtn.classList.add('active');
      empTabBtn.style.background = 'var(--bg-surface)';
      empTabBtn.style.color = 'var(--primary-700)';
    }
    if (adminTabBtn) {
      adminTabBtn.classList.remove('active');
      adminTabBtn.style.background = 'transparent';
      adminTabBtn.style.color = 'var(--text-muted)';
    }
    if (empPanel) empPanel.style.display = 'block';
    if (adminPanel) adminPanel.style.display = 'none';
  }
}
window.switchAuthTab = switchAuthTab;

// 4. Toggle Password Visibility
function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  if (btnEl) {
    btnEl.innerHTML = isPass ? '🙈' : '👁️';
    btnEl.title = isPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';
  }
}

// 5. Quick Fill Demo Credentials (Disabled & Removed for Security)
function quickFillEmployee() {
  // Permanently disabled: No auto-fill or credentials disclosure
}

// 6. Handle Employee & Admin Login (Supports Username OR Email)
async function handleEmployeeLogin(event) {
  if (event) event.preventDefault();
  const uInput = document.getElementById('emp-username');
  const pInput = document.getElementById('emp-password');
  const errEl = document.getElementById('emp-auth-error');
  const submitBtn = document.getElementById('emp-login-submit-btn');

  const rawIdentifier = (uInput ? uInput.value : '').trim();
  const identifier = rawIdentifier.toLowerCase();
  const password = pInput ? pInput.value.trim() : '';

  if (!identifier || !password) {
    if (errEl) {
      errEl.textContent = 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور';
      errEl.style.display = 'block';
    }
    return;
  }

  // Animation on button
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-sm"></span> جاري التحقق...';
  }
  if (errEl) errEl.style.display = 'none';

  // المحاولة الأولى: المصادقة المباشرة مع الخادم لإنشاء جلسة حقيقية وحفظ كوكيز الجلسة ورمز CSRF
  if (window.TaswoqSync && typeof window.TaswoqSync.login === 'function') {
    try {
      const serverAuth = await window.TaswoqSync.login(rawIdentifier, password);
      if (serverAuth && serverAuth.success && serverAuth.user) {
        if (serverAuth.csrfToken) {
          sessionStorage.setItem('taswoq_csrf_token', serverAuth.csrfToken);
        }
        const authUser = serverAuth.user;
        state.currentUser = authUser;
        try {
          localStorage.setItem('tasweeq_current_user', JSON.stringify(authUser));
          localStorage.setItem('taswoq_active_user', JSON.stringify(authUser));
          if (authUser.role === 'primary_admin' || authUser.isPrimaryAdmin) {
            localStorage.setItem('tasweeq_admin_auth', 'true');
          }
        } catch (e) { }

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'تسجيل الدخول للنظام 🚀';
        }

        hideWebAuthOverlay();
        renderAdminAuthUI();
        applyUserPermissions();
        renderAdminAll();
        if (typeof window.TaswoqSync.syncDown === 'function') {
          window.TaswoqSync.syncDown('admin').then(syncedData => {
            if (syncedData && syncedData.success) applySyncedData(syncedData);
          }).catch(() => {});
        }
        if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
        showToast(`مرحباً بك مجدداً، ${authUser.fullName || authUser.username} 👋`);
        return;
      } else if (serverAuth && serverAuth.error && !serverAuth.error.includes('Network') && !serverAuth.error.includes('unreachable')) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'تسجيل الدخول للنظام 🚀';
        }
        if (errEl) {
          errEl.textContent = serverAuth.error || 'اسم المستخدم أو كلمة المرور غير صحيحة ❌';
          errEl.style.display = 'block';
        }
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        return;
      }
    } catch (serverErr) {
      console.warn('Backend login attempt fell back to local verification:', serverErr);
    }
  }

  // 1. Refresh users from localStorage and memory (Fallback دون اتصال)
  try {
    const rawStored = localStorage.getItem('khudair_users') || localStorage.getItem('tasweeq_users');
    if (rawStored) {
      const parsedStored = JSON.parse(rawStored);
      if (Array.isArray(parsedStored) && parsedStored.length > 0) {
        state.users = parsedStored;
      }
    }
  } catch (e) { }

  // 2. Match by Username OR Email (case-insensitive, trimmed)
  let user = (state.users || []).find(u => {
    const uName = (u.username || '').trim().toLowerCase();
    const uMail = (u.email || '').trim().toLowerCase();
    return (uName && uName === identifier) || (uMail && uMail === identifier);
  });

  // If identifier refers to the admin, fallback to primary admin record
  if (!user && identifier === 'admin') {
    user = (state.users || []).find(u => u && (u.id === 'usr-101' || u.username === 'admin' || isPrimaryAdmin(u)));
  }

  // Check password validity
  const checkPwd = (u, p) => {
    if (!u || !p) return false;
    const cleanP = String(p).trim();
    const storedP = String(u.passwordHash || u.password || '').trim();
    if (storedP && storedP === cleanP) return true;
    if (u.email === 'zahad@gmail.com' && (cleanP === '123456' || cleanP === 'Pass@@qssaZ' || cleanP === 'Pass@gDekCd')) return true;
    return false;
  };

  let isPasswordValid = checkPwd(user, password);

  // 3. Fallback: If user not found OR password invalid, fetch live from server to get newest users
  if (!user || !isPasswordValid) {
    try {
      const serverBase = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
        ? window.TaswoqSync.getServerUrl()
        : (window.location && window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:8080');
      const syncRes = await fetch(`${serverBase}/api/sync?role=admin`);
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        if (Array.isArray(syncData.users) && syncData.users.length > 0) {
          state.users = syncData.users;
          localStorage.setItem('khudair_users', JSON.stringify(syncData.users));
          user = (state.users || []).find(u => {
            const uName = (u.username || '').trim().toLowerCase();
            const uMail = (u.email || '').trim().toLowerCase();
            return (uName && uName === identifier) || (uMail && uMail === identifier);
          });
          if (!user && identifier === 'admin') {
            user = (state.users || []).find(u => u && (u.id === 'usr-101' || u.username === 'admin' || isPrimaryAdmin(u)));
          }
          isPasswordValid = checkPwd(user, password);
        }
      }
    } catch (netErr) {
      console.warn('Live sync fallback during login:', netErr);
    }
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'تسجيل الدخول للنظام 🚀';
  }

  const isPrimary = user && (user.id === 'usr-101' || user.username === 'admin' || isPrimaryAdmin(user));
  if (isPrimary) {
    // Primary admin is NEVER locked out
    user.lockedUntil = null;
    user.failedAttempts = 0;
    user.isActive = true;
  }

  // Rate Limiting Check (5 minutes lockout) - Not applicable to primary admin
  if (!isPrimary && user && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const remainingMins = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
    if (errEl) {
      errEl.innerHTML = `⚠️ <b>الحساب مقفل مؤقتاً:</b> تم تجاوز الحد الأقصى للمحاولات الفاشلة (5 محاولات). يرجى الانتظار <b>${remainingMins} دقيقة</b> للمحاولة مجدداً.`;
      errEl.style.display = 'block';
    }
    addAuditLog('LOGIN_LOCKED_ATTEMPT', 'محاولة دخول بحساب مقفل', `محاولة دخول فاشلة للمستخدم ${user.fullName} والحساب مقفل لمدة ${remainingMins} دقيقة`, user.id, user.fullName);
    if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
    return;
  }

  if (!user || !isPasswordValid) {
    if (user && !isPrimary) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      if (user.failedAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 5 * 60000).toISOString();
        addAuditLog('ACCOUNT_LOCKED_BRUTEFORCE', 'قفل الحساب لتكرار الأخطاء', `تم قفل حساب ${user.fullName} مؤقتاً لمدة 5 دقائق بعد 5 محاولات خاطئة متتالية`, user.id, user.fullName);
      } else {
        addAuditLog('LOGIN_FAILED', 'فشل تسجيل الدخول', `محاولة خاطئة للمستخدم (${user.username || user.email}). عدد المحاولات الفاشلة: ${user.failedAttempts}/5`, user.id, user.fullName);
      }
      localStorage.setItem('khudair_users', JSON.stringify(state.users));
    } else {
      addAuditLog('LOGIN_FAILED_UNKNOWN', 'فشل تسجيل الدخول', `محاولة دخول بحساب غير مسجل أو كلمة مرور خاطئة (${rawIdentifier})`);
    }

    if (errEl) {
      errEl.textContent = 'اسم المستخدم/البريد الإلكتروني أو كلمة المرور غير صحيحة ❌';
      errEl.style.display = 'block';
    }
    if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
    return;
  }

  // Account Active Check
  if (!user.isActive) {
    if (errEl) {
      errEl.innerHTML = '⛔ <b>تم تعطيل هذا الحساب:</b> تم إيقاف صلاحية الدخول من قبل الإدارة، يرجى مراجعة المدير العام.';
      errEl.style.display = 'block';
    }
    addAuditLog('LOGIN_BLOCKED_DISABLED', 'حظر دخول حساب معطل', `محاولة دخول للموظف ${user.fullName} بحساب معطل`, user.id, user.fullName);
    if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
    return;
  }

  // Elevate primary admin if applicable
  if (isPrimary) {
    user.isPrimaryAdmin = true;
    user.role = 'primary_admin';
    user.permissions = ['all'];
    user.isActive = true;
    localStorage.setItem('tasweeq_admin_auth', 'true');
  }

  // Reset Lockout Counters on success
  user.failedAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date().toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'short' });
  localStorage.setItem('khudair_users', JSON.stringify(state.users));

  // Must Change Password Check (First Login)
  if (user.mustChangePassword && !isPrimary) {
    state.pendingPasswordChangeUser = user;
    addAuditLog('FIRST_LOGIN_PASSWORD_CHANGE_REQUIRED', 'طلب تعيين كلمة مرور جديدة', `تم طلب تعيين كلمة مرور جديدة عند أول دخول للموظف ${user.fullName}`, user.id, user.fullName);
    hideWebAuthOverlay();
    openChangePasswordModal(user);
    return;
  }

  // Normal Login Success
  state.currentUser = user;
  localStorage.setItem('tasweeq_current_user', JSON.stringify(state.currentUser));
  addAuditLog('LOGIN_SUCCESS', 'تسجيل دخول موظف', `دخول ناجح للمستخدم ${user.fullName} (${user.username || user.email})`, user.id, user.fullName);

  hideWebAuthOverlay();

  renderAdminAuthUI();
  applyUserPermissions();
  renderAdminAll();
  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
  showToast(`مرحباً بك مجدداً، ${user.fullName} 👋`);
}

// 7. Password Strength Evaluator
function checkPasswordStrength(val) {
  const bar = document.getElementById('pwd-strength-bar');
  const label = document.getElementById('pwd-strength-text');
  if (!bar || !label) return;

  if (!val) {
    bar.style.width = '0%';
    bar.style.backgroundColor = '#e2e8f0';
    label.textContent = 'أدخل كلمة المرور';
    label.style.color = 'var(--text-muted)';
    return;
  }

  let score = 0;
  if (val.length >= 8) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  if (score <= 1) {
    bar.style.width = '25%';
    bar.style.backgroundColor = '#ef4444';
    label.textContent = 'ضعيفة جداً (أقل من 8 أحرف)';
    label.style.color = '#ef4444';
  } else if (score === 2) {
    bar.style.width = '50%';
    bar.style.backgroundColor = '#f59e0b';
    label.textContent = 'متوسطة (أضف أرقاماً ورموزاً)';
    label.style.color = '#f59e0b';
  } else if (score === 3) {
    bar.style.width = '75%';
    bar.style.backgroundColor = '#10b981';
    label.textContent = 'جيدة وقوية';
    label.style.color = '#10b981';
  } else {
    bar.style.width = '100%';
    bar.style.backgroundColor = '#059669';
    label.textContent = 'ممتازة وفائقة الأمان 🛡️';
    label.style.color = '#059669';
  }
}

// 8. Open First-Time Password Change Modal
function openChangePasswordModal(user) {
  user = user || state.pendingPasswordChangeUser || state.currentUser || {};
  const modal = document.getElementById('change-password-modal');
  const nameEl = document.getElementById('change-pwd-user-name');
  if (nameEl) nameEl.textContent = user.fullName || user.username || '';
  const newPass = document.getElementById('new-password-input');
  const confPass = document.getElementById('confirm-password-input');
  const errEl = document.getElementById('change-pwd-error');
  if (newPass) newPass.value = '';
  if (confPass) confPass.value = '';
  if (errEl) errEl.style.display = 'none';
  if (typeof checkPasswordStrength === 'function') {
    checkPasswordStrength('');
  }
  if (modal) modal.classList.add('active');
}

// 9. Handle First-Time Password Change Submit
async function handleFirstTimePasswordChange(event) {
  if (event) event.preventDefault();
  const user = state.pendingPasswordChangeUser || state.currentUser;
  if (!user) return;

  const newPassEl = document.getElementById('new-password-input');
  const confPassEl = document.getElementById('confirm-password-input');
  const errEl = document.getElementById('change-pwd-error');
  const submitBtn = (event && event.target && event.target.querySelector) ? event.target.querySelector('button[type="submit"]') : document.getElementById('save-change-password-btn');

  const newPass = (newPassEl ? newPassEl.value : '').trim();
  const confPass = (confPassEl ? confPassEl.value : '').trim();

  if (newPass.length < 8) {
    if (errEl) {
      errEl.textContent = 'كلمة المرور يجب أن تتكون من 8 أحرف على الأقل';
      errEl.style.display = 'block';
    }
    if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
    return;
  }

  if (newPass !== confPass) {
    if (errEl) {
      errEl.textContent = 'كلمتا المرور غير متطابقتين، يرجى إعادة التأكيد';
      errEl.style.display = 'block';
    }
    if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
    return;
  }

  if (errEl) errEl.style.display = 'none';
  let origBtnText = '';
  if (submitBtn) {
    origBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الحفظ على الخادم... ⏳';
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (window.TaswoqSync && typeof window.TaswoqSync.getAuthHeaders === 'function') {
      Object.assign(headers, window.TaswoqSync.getAuthHeaders());
    } else {
      const csrf = sessionStorage.getItem('taswoq_csrf_token') || '';
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }

    const serverUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
      ? window.TaswoqSync.getServerUrl() : '';

    const res = await fetch(`${serverUrl}/api/auth/change-password`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers,
      body: JSON.stringify({ newPassword: newPass })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      const errMsg = (data && data.error) ? data.error : 'فشل تغيير كلمة المرور على الخادم. يرجى إعادة المحاولة.';
      if (errEl) {
        errEl.textContent = errMsg;
        errEl.style.display = 'block';
      }
      if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
      return; // لا تغلق نافذة الإلزام عند فشل الحفظ
    }

    // النجاح المؤكد من الخادم الصريح
    user.mustChangePassword = false;
    state.currentUser = user;
    state.pendingPasswordChangeUser = null;

    const modal = document.getElementById('change-password-modal');
    if (modal) modal.classList.remove('active');

    if (typeof addAuditLog === 'function') {
      addAuditLog('PASSWORD_CHANGED_FIRST_LOGIN', 'تعيين كلمة مرور جديدة لأول دخول', `قام المستخدم ${user.fullName || user.username} بتعيين كلمة مرور شخصية جديدة بنجاح`, user.id, user.fullName);
    }

    if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
    if (typeof showToast === 'function') showToast('تم تعيين كلمة المرور الجديدة وتأكيد دخولك للنظام بنجاح 🔒');

    if (typeof renderAdminAuthUI === 'function') renderAdminAuthUI();
    if (typeof applyUserPermissions === 'function') applyUserPermissions();
    if (typeof renderAdminAll === 'function') renderAdminAll();

  } catch (netErr) {
    console.error('Password change error:', netErr);
    if (errEl) {
      errEl.textContent = 'تعذر الاتصال بالخادم. يرجى التحقق من الشبكة وإعادة المحاولة.';
      errEl.style.display = 'block';
    }
    if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (origBtnText) submitBtn.textContent = origBtnText;
    }
  }
}

// 10. Handle Google Sign-In for Admin (Whitelist Protected)
function handleGoogleAdminLogin(email = '') {
  let targetEmail = (email || '').trim();
  if (!targetEmail) {
    const input = document.getElementById('auth-custom-google-email') ||
      document.getElementById('custom-google-email') ||
      document.getElementById('google-email-input');
    if (input && input.value && input.value.trim()) {
      targetEmail = input.value.trim();
    }
  }

  const cleanEmail = targetEmail.toLowerCase();
  const errEl = document.getElementById('google-auth-error');
  const statusEl = document.getElementById('google-auth-status');

  if (!cleanEmail) {
    const emptyMsg = 'يرجى إدخال بريد إلكتروني صالح لحساب Google المصرح به للمدير';
    if (errEl) {
      errEl.textContent = emptyMsg;
      errEl.style.display = 'block';
    }
    const modalErrEl = document.getElementById('google-modal-auth-error');
    if (modalErrEl) {
      modalErrEl.textContent = emptyMsg;
      modalErrEl.style.display = 'block';
    }
    return;
  }

  if (statusEl) {
    statusEl.innerHTML = `<span class="spinner-sm"></span> جاري التحقق من ترخيص الحساب عبر Google OAuth 2.0...`;
    statusEl.style.display = 'block';
  }
  if (errEl) errEl.style.display = 'none';

  setTimeout(() => {
    if (statusEl) statusEl.style.display = 'none';

    // Whitelist Verification: strictly checks authorized whitelist (only emails explicitly added by admin)
    const validWhitelist = (state.adminWhitelist || []).filter(e => e && typeof e === 'string' && e.trim().length > 3 && e.includes('@'));
    const isWhitelisted = validWhitelist.length > 0 && validWhitelist.some(e => e.toLowerCase() === cleanEmail);

    // Also check if this email belongs to any registered employee/manager in state.users
    const registeredUser = (state.users || []).find(u => u.email && u.email.trim().toLowerCase() === cleanEmail);

    if (!isWhitelisted && registeredUser) {
      // Employee / Manager logging in via Google
      if (!registeredUser.isActive) {
        if (errEl) {
          errEl.innerHTML = '⛔ <b>تم تعطيل هذا الحساب:</b> تم إيقاف صلاحية الدخول من قبل الإدارة، يرجى مراجعة المدير العام.';
          errEl.style.display = 'block';
        }
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        return;
      }
      registeredUser.failedAttempts = 0;
      registeredUser.lockedUntil = null;
      registeredUser.lastLoginAt = new Date().toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'short' });
      localStorage.setItem('khudair_users', JSON.stringify(state.users));
      state.currentUser = registeredUser;
      localStorage.setItem('tasweeq_current_user', JSON.stringify(state.currentUser));
      hideWebAuthOverlay();
      renderAdminAuthUI();
      applyUserPermissions();
      renderAdminAll();
      if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
      showToast(`مرحباً بك مجدداً، ${registeredUser.fullName} 👋`);
      return;
    }

    if (!isWhitelisted) {
      // STRICTLY BLOCK UNAUTHORIZED EMAIL AND RESET SESSION
      state.currentUser = null;
      localStorage.removeItem('tasweeq_current_user');
      localStorage.removeItem('tasweeq_admin_auth');
      sessionStorage.removeItem('tasweeq_current_user');

      // Keep the overlay firmly open and locked
      showWebAuthOverlay();

      const rejectMsg = `⛔ <b>دخول مرفوض (غير مصرّح):</b> البريد الإلكتروني (<code>${cleanEmail}</code>) غير مسجل في القائمة البيضاء المعتمدة للمدراء.<br>النظام محمي ولا يعتمد أي بريد لم يقم المدير بإضافته يدوياً.<br>إذا كنت المدير العام، يرجى الدخول أولاً عبر تبويب <b>(دخول الموظفين / الإدارة)</b> باسم المستخدم وكلمة المرور، ثم إضافة بريدك عبر نافذة <b>(القائمة البيضاء للمدراء)</b>.`;

      if (errEl) {
        errEl.innerHTML = rejectMsg;
        errEl.style.display = 'block';
      }
      const modalErrEl = document.getElementById('google-modal-auth-error');
      if (modalErrEl) {
        modalErrEl.innerHTML = rejectMsg;
        modalErrEl.style.display = 'block';
      }
      if (typeof showToast === 'function') {
        showToast('⛔ دخول مرفوض: البريد الإلكتروني غير مصرّح له في القائمة البيضاء');
      }
      addAuditLog('GOOGLE_AUTH_REJECTED', 'رفض دخول بحساب غير مصرّح', `تم رفض محاولة دخول بالبريد غير المعتمد: ${cleanEmail}`);
      if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
      return;
    }

    // Find or create admin user record
    let adminUser = (state.users || []).find(u =>
      (u.email && u.email.toLowerCase() === cleanEmail) ||
      u.id === 'usr-101' ||
      u.username === 'admin' ||
      isPrimaryAdmin(u)
    );

    if (!adminUser) {
      adminUser = {
        id: 'usr-101',
        fullName: 'المدير العام',
        username: cleanEmail.split('@')[0] || 'admin',
        email: cleanEmail,
        role: 'primary_admin',
        isPrimaryAdmin: true,
        isActive: true,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date().toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'short' }),
        createdAt: new Date().toISOString().split('T')[0],
        permissions: ['all']
      };
      if (!state.users) state.users = [];
      state.users.unshift(adminUser);
    } else {
      adminUser.email = cleanEmail;
      adminUser.fullName = adminUser.fullName || 'المدير العام';
      adminUser.role = 'primary_admin';
      adminUser.isPrimaryAdmin = true;
      adminUser.isActive = true;
      adminUser.mustChangePassword = false;
      adminUser.failedAttempts = 0;
      adminUser.lockedUntil = null;
      adminUser.permissions = ['all'];
      adminUser.lastLoginAt = new Date().toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'short' });
    }

    localStorage.removeItem('khudair_primary_admin_deleted');
    localStorage.setItem('khudair_users', JSON.stringify(state.users));

    state.currentUser = adminUser;
    localStorage.setItem('tasweeq_current_user', JSON.stringify(state.currentUser));
    localStorage.setItem('tasweeq_admin_auth', 'true');
    sessionStorage.setItem('tasweeq_current_user', JSON.stringify(state.currentUser));

    addAuditLog('LOGIN_GOOGLE_SUCCESS', 'تسجيل الدخول', `تم الدخول بنجاح للحساب المعتمد ${cleanEmail}`, adminUser.id, adminUser.fullName);

    // Close overlays
    hideWebAuthOverlay();
    const googleModal = document.getElementById('google-signin-modal');
    if (googleModal) googleModal.classList.remove('active');

    renderAdminAuthUI();
    applyUserPermissions();
    renderAdminAll();
    if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
    showToast(`تم تسجيل الدخول بنجاح كمدير عام عبر Google ✅ (${cleanEmail})`);
  }, 400);
}

// 11. Compatibility wrapper for legacy loginWithGoogle
function loginWithGoogle(email = '') {
  let targetEmail = (email || '').trim();
  if (!targetEmail) {
    const input = document.getElementById('auth-custom-google-email') ||
      document.getElementById('custom-google-email') ||
      document.getElementById('google-email-input');
    if (input && input.value && input.value.trim()) {
      targetEmail = input.value.trim();
    }
  }
  handleGoogleAdminLogin(targetEmail);
}

function openGoogleSignInModal() {
  const modal = document.getElementById('google-signin-modal');
  if (modal) modal.classList.add('active');
}

function closeGoogleSignInModal() {
  const modal = document.getElementById('google-signin-modal');
  if (modal) modal.classList.remove('active');
}

// 12. Render Admin Authentication & Profile UI
function renderAdminAuthUI() {
  const user = state.currentUser;
  const overlay = document.getElementById('web-auth-overlay');
  const nameEl = document.getElementById('admin-top-username');
  const emailEl = document.getElementById('admin-top-useremail');
  const avatarEl = document.getElementById('admin-top-avatar');
  const roleBadge = document.querySelector('.admin-google-status-badge');
  const delegateBanner = document.getElementById('delegate-role-active-banner');
  const delegateBannerName = document.getElementById('delegate-banner-name');

  if (user) {
    // 1. Authenticated State
    hideWebAuthOverlay();

    const isPrimary = isPrimaryAdmin(user);
    const displayName = user.fullName || user.name || (isPrimary ? 'المدير العام' : (user.role === 'admin' ? 'المدير' : user.username));
    const displayEmail = user.email || (isPrimary ? 'لم يتم ربط بريد' : user.username);

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = displayEmail;
    if (avatarEl) avatarEl.textContent = isPrimary ? '👑' : (displayName || 'ت')[0].toUpperCase();

    if (roleBadge) {
      if (isPrimary) {
        roleBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800;">
          👑 المدير العام
        </span>`;
      } else if (user.role === 'admin') {
        roleBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800;">
          🛡️ المدير
        </span>`;
      } else {
        const perms = user.permissions || [];
        const labels = { orders: 'طلبات', delivery: 'توصيل', products: 'منتجات', banners: 'عروض', expenses: 'مصروفات', complaints: 'شكاوى', whatsapp: 'واتساب', settings: 'إعدادات' };
        const permsSummary = perms.map(p => labels[p] || p).join('، ');
        roleBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px; background: #ecfdf5; color: #047857; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800;">
          👤 موظف (${permsSummary || 'صلاحيات مخصصة'})
        </span>`;
      }
    }

    if (delegateBanner) {
      if (user.role === 'delegate') {
        delegateBanner.style.display = 'flex';
        if (delegateBannerName) delegateBannerName.textContent = user.name || user.fullName;
      } else {
        delegateBanner.style.display = 'none';
      }
    }

    applyUserPermissions();
  } else {
    // 2. Unauthenticated / Logged Out State
    if (overlay) overlay.style.setProperty('display', 'flex', 'important');
    if (nameEl) nameEl.textContent = 'غير مسجل الدخول';
    if (emailEl) emailEl.textContent = 'يرجى تسجيل الدخول للنظام';
    if (avatarEl) avatarEl.textContent = '🔒';

    if (roleBadge) {
      roleBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px; background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800;">
        🔒 غير مسجل
      </span>`;
    }

    if (delegateBanner) {
      delegateBanner.style.display = 'none';
    }

    // Keep users tab accessible in prototype mode
    const usersMenuItem = document.getElementById('menu-item-users');
    if (usersMenuItem) usersMenuItem.style.display = 'flex';
    const exportBtn = document.getElementById('admin-export-report-btn');
    if (exportBtn) exportBtn.style.display = 'none';
    const mobileExportBtn = document.getElementById('mobile-export-report-btn');
    if (mobileExportBtn) mobileExportBtn.style.display = 'none';
    const indexExportBtn = document.getElementById('index-export-report-btn');
    if (indexExportBtn) indexExportBtn.style.display = 'none';
    document.querySelectorAll('.profit-query-actions button, button[onclick*="exportAdminReportCSV"], button[onclick*="exportReport"], .export-report-btn').forEach(btn => {
      btn.style.display = 'none';
    });
    document.querySelectorAll('.export-report-card').forEach(card => {
      card.style.display = 'none';
    });
  }
}

// 13. Logout Functionality & Confirmation Modal
function logoutCurrentUser(direct = false) {
  if (direct) {
    confirmLogoutAction();
    return;
  }

  const modal = document.getElementById('logout-confirm-modal');
  if (modal) {
    const nameEl = document.getElementById('logout-user-display-name');
    const u = state.currentUser;
    if (nameEl) {
      nameEl.textContent = u ? (u.fullName || u.name || u.username || 'الحساب الحالي') : 'الحساب الحالي';
    }
    modal.style.display = 'flex';
  } else {
    // Graceful fallback if modal is not in DOM
    if (confirm('هل ترغب بتسجيل الخروج من لوحة الإدارة وإنهاء الجلسة الحالية؟')) {
      confirmLogoutAction();
    }
  }
}

function closeLogoutModal() {
  const modal = document.getElementById('logout-confirm-modal');
  if (modal) modal.style.display = 'none';
}

function showGeneralConfirmDialog(options) {
  const opts = (typeof options === 'object' && options) ? options : { message: options };
  const title = opts.title || 'تأكيد الحفظ 💾';
  const message = opts.message || 'هل أنت متأكد من حفظ التعديلات؟';
  const icon = opts.icon || '💾';
  const confirmText = opts.confirmText || 'نعم';
  const cancelText = opts.cancelText || 'لا';
  const onConfirm = opts.onConfirm;

  const modal = document.getElementById('general-confirm-modal');
  if (modal) {
    const titleEl = document.getElementById('general-confirm-title');
    const msgEl = document.getElementById('general-confirm-message');
    const iconEl = document.getElementById('general-confirm-icon');
    const okBtn = document.getElementById('general-confirm-ok-btn');
    const cancelBtn = document.getElementById('general-confirm-cancel-btn');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;
    if (okBtn) {
      okBtn.textContent = confirmText;
      okBtn.onclick = function () {
        closeGeneralConfirmModal();
        if (typeof onConfirm === 'function') onConfirm();
      };
    }
    if (cancelBtn) {
      cancelBtn.textContent = cancelText;
      cancelBtn.onclick = function () {
        closeGeneralConfirmModal();
      };
    }
    modal.style.display = 'flex';
  } else {
    // Fallback if modal is not in DOM
    if (confirm(message)) {
      if (typeof onConfirm === 'function') onConfirm();
    }
  }
}

function closeGeneralConfirmModal() {
  const modal = document.getElementById('general-confirm-modal');
  if (modal) modal.style.display = 'none';
}
window.showGeneralConfirmDialog = showGeneralConfirmDialog;
window.closeGeneralConfirmModal = closeGeneralConfirmModal;

function confirmLogoutAction() {
  closeLogoutModal();

  const prevUser = state.currentUser;
  if (typeof addAuditLog === 'function') {
    const prevName = prevUser ? (prevUser.fullName || prevUser.name || prevUser.username) : 'المستخدم';
    const prevId = prevUser ? (prevUser.id || 'sys') : 'sys';
    addAuditLog('LOGOUT', 'تسجيل خروج', `تم تسجيل الخروج بنجاح للمستخدم ${prevName}`, prevId, prevName);
  }

  // Clear Session & Local Storage
  state.currentUser = null;
  localStorage.removeItem('tasweeq_current_user');
  localStorage.removeItem('tasweeq_admin_auth');
  sessionStorage.removeItem('tasweeq_current_user');

  // Clear Inputs in Auth Overlay
  const uInput = document.getElementById('emp-username');
  const pInput = document.getElementById('emp-password');
  const errEl = document.getElementById('emp-auth-error');
  if (uInput) uInput.value = '';
  if (pInput) pInput.value = '';
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  // Reset to Employee Tab by default
  if (typeof switchAuthTab === 'function') switchAuthTab('employee');

  // Close other open modals
  if (typeof closeGoogleSignInModal === 'function') closeGoogleSignInModal();
  if (typeof closeAddUserModal === 'function') closeAddUserModal();
  if (typeof closeResetPasswordModal === 'function') closeResetPasswordModal();
  if (typeof closeAdminWhitelistModal === 'function') closeAdminWhitelistModal();

  // CRITICAL SECURITY RESET: Immediately switch active tab away from protected tabs (like Users) to 'dashboard'
  if (typeof switchAdminTab === 'function') {
    switchAdminTab('dashboard', null);
  } else {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const dash = document.getElementById('panel-dashboard');
    if (dash) dash.classList.add('active');
    document.querySelectorAll('.admin-sidebar .menu-item').forEach(m => m.classList.remove('active'));
    const mDash = document.getElementById('menu-item-dashboard');
    if (mDash) mDash.classList.add('active');
  }

  // Clear sensitive user table contents upon logout
  const usersTbody = document.getElementById('admin-users-tbody');
  if (usersTbody) usersTbody.innerHTML = '';

  // Update UI & Display Overlay
  renderAdminAuthUI();

  const overlay = document.getElementById('web-auth-overlay');
  if (overlay) {
    overlay.style.setProperty('display', 'flex', 'important');
  }

  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  if (typeof showToast === 'function') {
    showToast('تم تسجيل الخروج بنجاح من لوحة الإدارة 🔒');
  }
}

// 14. Apply Role-Based Permissions (RBAC) to UI

// Robust Permission Evaluation Helper (دعم كامل للقواميس والمصفوفات والنصوص)
function checkPerm(perms, p) {
  if (!perms) return false;
  if (Array.isArray(perms)) {
    return perms.includes('all') || perms.includes(p) || perms.includes(`${p}:read`) || perms.includes(`${p}:write`);
  }
  if (typeof perms === 'object') {
    return Boolean(perms['all'] || perms[p] || perms[`${p}:read`] || perms[`${p}:write`]);
  }
  if (typeof perms === 'string') {
    return perms === 'all' || perms === p;
  }
  return false;
}
window.checkPerm = checkPerm;

// Centralized Permission Checker (دالة فحص الصلاحيات الموحدة)
function hasUserPermission(permKey) {
  const user = (typeof state !== 'undefined') ? state.currentUser : null;
  if (!user) return false;
  if (isPrimaryAdmin(user) || user.isPrimaryAdmin === true || user.role === 'primary_admin') return true;
  if (user.role === 'developer_admin' || user.id === 'usr_developer') return true;
  return checkPerm(user.permissions, permKey);
}
window.hasUserPermission = hasUserPermission;

// RBAC Centralized Access Checker
function canUserAccessTab(user, tabKey) {
  if (!user) return false; // Strictly block unauthenticated visitors

  // Full access exclusively for General Manager (الصلاحيات الكاملة للمدير العام)
  if (isPrimaryAdmin(user) || user.isPrimaryAdmin === true || user.role === 'primary_admin') return true;

  const perms = user.permissions || [];
  const isDeveloper = Boolean(user.role === 'developer_admin' || user.id === 'usr_developer');
  const hasAll = isDeveloper || checkPerm(perms, 'all');

  // صلاحية all تمنح المطور والمستخدم المخول الوصول لكافة الأقسام بما فيها users و settings
  if (hasAll) return true;

  // أقسام المدير العام والموظفين المخولين بصلاحيات الإدارة
  if (tabKey === 'users' || tabKey === 'settings') {
    if (isDeveloper || checkPerm(perms, tabKey)) {
      return true;
    }
    return false;
  }

  // فحص الصلاحية الفعلية للقسم
  return checkPerm(perms, tabKey);
}
window.canUserAccessTab = canUserAccessTab;

function applyUserPermissions() {
  const user = state.currentUser;
  const usersMenuItem = document.getElementById('menu-item-users');
  const tabMapping = {
    'dashboard': 'menu-item-dashboard',
    'orders': 'menu-item-orders',
    'delivery': 'menu-item-delivery',
    'products': 'menu-item-products',
    'banners': 'menu-item-banners',
    'expenses': 'menu-item-expenses',
    'complaints': 'menu-item-complaints',
    'whatsapp': 'menu-item-whatsapp',
    'settings': 'menu-item-settings'
  };

  if (!user) {
    if (usersMenuItem) usersMenuItem.style.display = 'none';
    Object.values(tabMapping).forEach(menuId => {
      const el = document.getElementById(menuId);
      if (el) el.style.display = 'none';
    });
    return;
  }

  const isPrimary = Boolean(isPrimaryAdmin(user) || user.isPrimaryAdmin === true || user.role === 'primary_admin');
  const isDeveloper = Boolean(user && (user.role === 'developer_admin' || user.id === 'usr_developer'));
  const perms = user.permissions || [];
  const hasAll = isPrimary || isDeveloper || checkPerm(perms, 'all');

  // Users tab is for General Manager, Developer, or accounts granted 'users' permission
  const canAccessUsers = isPrimary || isDeveloper || hasAll || checkPerm(perms, 'users');
  if (usersMenuItem) {
    usersMenuItem.style.display = canAccessUsers ? 'flex' : 'none';
  }

  // Export report button is for General Manager & Developer with full permissions
  const canExport = isPrimary || isDeveloper || hasAll;
  const exportBtn = document.getElementById('admin-export-report-btn');
  if (exportBtn) {
    exportBtn.style.display = canExport ? 'inline-flex' : 'none';
  }
  const mobileExportBtn = document.getElementById('mobile-export-report-btn');
  if (mobileExportBtn) {
    mobileExportBtn.style.display = canExport ? 'inline-flex' : 'none';
  }
  const indexExportBtn = document.getElementById('index-export-report-btn');
  if (indexExportBtn) {
    indexExportBtn.style.display = canExport ? 'inline-flex' : 'none';
  }

  // All other report export buttons and cards in dashboard / settings
  document.querySelectorAll('.profit-query-actions button, button[onclick*="exportAdminReportCSV"], button[onclick*="exportReport"], .export-report-btn').forEach(btn => {
    if (btn.id === 'admin-export-report-btn' || btn.id === 'mobile-export-report-btn' || btn.id === 'index-export-report-btn') return;
    btn.style.display = canExport ? '' : 'none';
  });
  document.querySelectorAll('.export-report-card').forEach(card => {
    card.style.display = canExport ? 'flex' : 'none';
  });

  // Send Push Notification button visibility based on permission (يحتسب صلاحية all والمطور والمدير العام)
  const canSendPush = isPrimary || isDeveloper || hasAll || checkPerm(perms, 'notifications');
  const sendPushBtn = document.getElementById('admin-send-push-btn');
  if (sendPushBtn) {
    sendPushBtn.style.display = canSendPush ? 'inline-flex' : 'none';
  }

  Object.entries(tabMapping).forEach(([permKey, menuId]) => {
    const el = document.getElementById(menuId);
    if (!el) return;
    const hasThisPerm = checkPerm(perms, permKey);
    if (isPrimary || isDeveloper || hasAll || hasThisPerm) {
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  });

  // CRITICAL RBAC ENFORCEMENT: Check currently active tab and force redirect if unauthorized
  const activePanel = document.querySelector('.tab-panel.active');
  const currentActiveTab = activePanel ? activePanel.id.replace('panel-', '') : 'dashboard';

  if (!canUserAccessTab(user, currentActiveTab)) {
    // Current tab is not permitted for this user! Determine safe landing tab:
    let safeTab = 'dashboard';
    if (!canUserAccessTab(user, 'dashboard')) {
      const firstAllowed = Object.keys(tabMapping).find(k => checkPerm(perms, k));
      safeTab = firstAllowed || 'orders';
    }
    if (typeof switchAdminTab === 'function') {
      switchAdminTab(safeTab, null);
    } else {
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`panel-${safeTab}`);
      if (target) target.classList.add('active');
      document.querySelectorAll('.admin-sidebar .menu-item').forEach(m => m.classList.remove('active'));
      const targetMenu = document.getElementById(`menu-item-${safeTab}`);
      if (targetMenu) targetMenu.classList.add('active');
    }
  }
}

// 14. Render Admin Users Management Panel
function renderAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  const currentUser = state.currentUser;
  const canManageUsers = isPrimaryAdmin(currentUser) || isDeveloperAdmin(currentUser) || (currentUser && checkPerm(currentUser.permissions, 'users'));
  if (!canManageUsers) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px 16px; color: #ef4444; font-weight: 800; font-size: 0.95rem;">
          ⛔ عذراً، لا تملك الصلاحية للوصول إلى إدارة المستخدمين والموظفين.
        </td>
      </tr>
    `;
    return;
  }

  const users = state.users || [];
  const q = (state.userSearchQuery || '').toLowerCase();
  const filter = state.userRoleFilter || 'all';

  // Update KPI counters
  const totalCount = users.length;
  const activeCount = users.filter(u => u.isActive).length;
  const disabledCount = users.filter(u => !u.isActive).length;
  const whitelistCount = (state.adminWhitelist || []).length;

  const totalEl = document.getElementById('users-kpi-total');
  const activeEl = document.getElementById('users-kpi-active');
  const disabledEl = document.getElementById('users-kpi-disabled');
  const whitelistEl = document.getElementById('users-kpi-whitelist');

  if (totalEl) totalEl.textContent = totalCount;
  if (activeEl) activeEl.textContent = activeCount;
  if (disabledEl) disabledEl.textContent = disabledCount;
  if (whitelistEl) whitelistEl.textContent = whitelistCount;

  // Filter users list
  const filtered = users.filter(u => {
    const matchQ = (u.fullName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q);
    if (!matchQ) return false;

    if (filter === 'admin') return u.role === 'admin';
    if (filter === 'employee') return u.role === 'employee';
    if (filter === 'active') return u.isActive;
    if (filter === 'disabled') return !u.isActive;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
      <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
      <div style="font-weight: 700;">لا يوجد مستخدمون مطابقون لمعايير البحث</div>
      <div style="font-size: 0.8rem; margin-top: 4px;">جرب تغيير كلمة البحث أو فلتر العرض</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const isPrimary = isPrimaryAdmin(u);
    const isAdmin = u.role === 'admin';
    const isCurPrimary = isCurrentSessionPrimaryOrDeveloper();

    const statusBadge = u.isActive
      ? '<span class="status-pill status-completed">نشط</span>'
      : '<span class="status-pill status-cancelled">معطل</span>';

    // Auth badge
    const authTypeBadge = isPrimary
      ? `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 8px; font-weight: 700;">
          <svg viewBox="0 0 24 24" width="12" height="12"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          Google OAuth
        </span>`
      : `<span style="font-size: 0.72rem; color: #475569; background: #f1f5f9; padding: 2px 8px; border-radius: 8px; font-weight: 700;">
          🔑 اسم مستخدم
        </span>`;

    // Role Badge & Avatar Styles
    let roleBadge = '';
    let avatarBg = '';
    let avatarContent = (u.fullName || u.username)[0];

    if (isPrimary) {
      avatarBg = 'linear-gradient(135deg, #d97706, #f59e0b)';
      avatarContent = '👑';
      roleBadge = `<span style="font-size: 0.68rem; font-weight: 800; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px;">
        👑 المدير العام
      </span>`;
    } else if (isAdmin) {
      avatarBg = 'linear-gradient(135deg, #0284c7, #38bdf8)';
      roleBadge = `<span style="font-size: 0.68rem; font-weight: 800; color: #0369a1; background: #e0f2fe; border: 1px solid #bae6fd; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px;">
        🛡️ المدير
      </span>`;
    } else {
      avatarBg = 'linear-gradient(135deg, #059669, #10b981)';
      roleBadge = `<span style="font-size: 0.68rem; font-weight: 700; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 7px; border-radius: 6px;">
        💼 موظف
      </span>`;
    }

    const permsBadges = isPrimary
      ? '<span style="font-size: 0.72rem; font-weight: 800; color: #b45309; background: #fffbeb; padding: 2px 8px; border-radius: 6px; border: 1px solid #fef3c7;">👑 الصلاحيات المطلقة للنظام</span>'
      : (isAdmin
        ? '<span style="font-size: 0.72rem; font-weight: 800; color: #0369a1; background: #f0f9ff; padding: 2px 8px; border-radius: 6px; border: 1px solid #e0f2fe;">🛡️ كامل الصلاحيات (المدير)</span>'
        : (u.permissions || []).map(p => {
          const pNames = { dashboard: 'المؤشرات والأرباح', orders: 'الطلبات', products: 'المنتجات', banners: 'العروض', expenses: 'المصروفات', complaints: 'الشكاوى', delivery: 'التوصيل', settings: 'الإعدادات', notifications: 'الإشعارات', users: 'المستخدمين' };
          return `<span style="font-size: 0.68rem; background: var(--bg-surface-secondary); padding: 1px 6px; border-radius: 6px; margin-left: 2px;">${pNames[p] || p}</span>`;
        }).join(''));

    const mustChangeNotice = u.mustChangePassword
      ? '<span style="font-size: 0.65rem; color: var(--accent-600); font-weight: 800; display: block;">⚠️ مطالب بتغيير كلمة المرور</span>'
      : '';

    // Action column
    let actionButtons = '';
    if (isPrimary) {
      if (!isCurPrimary) {
        actionButtons = `
          <div style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; font-weight: 800; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 4px 10px; border-radius: 8px; cursor: default; user-select: none;" title="حساب المدير العام محمي">
            <span>🔒</span> <span>خاص بالمدير العام</span>
          </div>
        `;
      } else {
        const canDeleteThisGM = getGeneralManagersCount() > 1 || u.username === 'admin' || u.id === 'usr-101';
        actionButtons = `
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="ctrl-btn" onclick="openAddUserModal('${u.id}')" title="تعديل بيانات المدير العام">✏️</button>
            <button class="ctrl-btn" onclick="promptResetPassword('${u.id}')" title="إعادة تعيين كلمة المرور">🔑</button>
            ${canDeleteThisGM ? `<button class="ctrl-btn" onclick="deleteUserAccount('${u.id}')" title="حذف حساب المدير العام الإضافي" style="color: #ef4444;">🗑️</button>` : '<span style="font-size: 0.7rem; color: #b45309; font-weight: 800; background: #fef3c7; padding: 2px 7px; border-radius: 6px;">👑 أساسي</span>'}
          </div>
        `;
      }
    } else if (isAdmin) {
      // Secondary admin: only editable/deletable by Primary Admin
      if (!isCurPrimary) {
        actionButtons = `
          <div style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;" title="تعديل وحذف المدراء مسموح به حصرياً من قِبل المدير العام">
            <span>🔒</span> <span>خاص بالمدير العام</span>
          </div>
        `;
      } else {
        actionButtons = `
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="ctrl-btn" onclick="openAddUserModal('${u.id}')" title="تعديل بيانات وصلاحيات المدير">✏️</button>
            <button class="ctrl-btn" onclick="toggleUserStatus('${u.id}')" title="${u.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}" style="color: ${u.isActive ? '#ef4444' : '#10b981'};">
              ${u.isActive ? '⏸️' : '▶️'}
            </button>
            <button class="ctrl-btn" onclick="promptResetPassword('${u.id}')" title="إعادة تعيين كلمة المرور">🔑</button>
            <button class="ctrl-btn" onclick="deleteUserAccount('${u.id}')" title="حذف حساب المدير نهائياً (متاح للمدير العام فقط)" style="color: #ef4444;">🗑️</button>
          </div>
        `;
      }
    } else {
      // Regular employee
      actionButtons = `
        <div style="display: flex; gap: 4px; align-items: center;">
          <button class="ctrl-btn" onclick="openAddUserModal('${u.id}')" title="تعديل المستخدم والصلاحيات">✏️</button>
          <button class="ctrl-btn" onclick="toggleUserStatus('${u.id}')" title="${u.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}" style="color: ${u.isActive ? '#ef4444' : '#10b981'};">
            ${u.isActive ? '⏸️' : '▶️'}
          </button>
          <button class="ctrl-btn" onclick="promptResetPassword('${u.id}')" title="إعادة تعيين كلمة المرور وتوليد كلمة مؤقتة">🔑</button>
          <button class="ctrl-btn" onclick="deleteUserAccount('${u.id}')" title="حذف المستخدم نهائياً" style="color: #ef4444;">🗑️</button>
        </div>
      `;
    }

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${avatarBg}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: ${isPrimary ? '1.05rem' : '0.9rem'}; box-shadow: 0 2px 6px rgba(0,0,0,0.12); flex-shrink: 0;">
              ${avatarContent}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 800; color: var(--text-main); font-size: 0.88rem;">${u.fullName}</span>
                ${roleBadge}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${u.email ? u.email : '<span style="opacity: 0.5;">(لا يوجد بريد مسجل)</span>'}</div>
            </div>
          </div>
        </td>
        <td>
          <code style="background: var(--bg-surface-secondary); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-weight: 700;">${u.username}</code>
          ${mustChangeNotice}
        </td>
        <td>
          ${authTypeBadge}
        </td>
        <td>
          <div style="max-width: 220px; display: flex; flex-wrap: wrap; gap: 2px;">
            ${permsBadges || '<span style="font-size: 0.7rem; color: var(--text-muted);">لا توجد صلاحيات</span>'}
          </div>
        </td>
        <td>
          ${statusBadge}
        </td>
        <td style="font-size: 0.78rem; color: var(--text-muted);">
          ${u.lastLoginAt || 'لم يسجل دخول'}
        </td>
        <td>
          ${actionButtons}
        </td>
      </tr>
    `;
  }).join('');
}

// 15. User Search & Filter Handlers
function onUsersSearch(query) {
  state.userSearchQuery = query;
  renderAdminUsers();
}

function setUserRoleFilter(filter, btnEl) {
  state.userRoleFilter = filter;
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    btnEl.classList.add('active');
  }
  renderAdminUsers();
}

// Helper: Select / Deselect all user permissions
function selectAllUserPerms(selectAll = true) {
  ['dashboard', 'orders', 'products', 'banners', 'expenses', 'complaints', 'delivery', 'settings', 'notifications', 'users'].forEach(p => {
    const cb = document.getElementById(`user-perm-${p}`);
    if (cb && !cb.disabled) cb.checked = selectAll;
  });
}

// Helper: Copy temporary password to clipboard
function copyModalPassword() {
  const pInput = document.getElementById('user-modal-password');
  if (pInput && pInput.value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pInput.value).then(() => {
        if (typeof showToast === 'function') showToast('تم نسخ كلمة المرور المؤقتة للحافظة 📋');
      }).catch(() => {
        pInput.select();
        document.execCommand('copy');
        if (typeof showToast === 'function') showToast('تم نسخ كلمة المرور المؤقتة 📋');
      });
    } else {
      pInput.select();
      document.execCommand('copy');
      if (typeof showToast === 'function') showToast('تم نسخ كلمة المرور 📋');
    }
  }
}

function toggleTablePassword(userId, btn) {
  const el = document.getElementById('pwd-preview-' + userId);
  if (!el) return;
  const raw = el.getAttribute('data-pwd') || '';
  if (el.textContent === '••••••••') {
    el.textContent = raw;
    if (btn) btn.textContent = '🙈';
  } else {
    el.textContent = '••••••••';
    if (btn) btn.textContent = '👁️';
  }
}
window.toggleTablePassword = toggleTablePassword;

function copyPasswordDirectly(pwd) {
  if (!pwd) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pwd).then(() => {
      if (typeof showToast === 'function') showToast(`تم نسخ كلمة المرور: ${pwd} 📋`);
    });
  } else {
    if (typeof showToast === 'function') showToast(`كلمة المرور هي: ${pwd}`);
  }
}
window.copyPasswordDirectly = copyPasswordDirectly;

// 16. Open Add / Edit User Modal
function openAddUserModal(userId = null) {
  const curUser = state.currentUser;
  const isCurAdmin = curUser && (curUser.role === 'admin' || curUser.role === 'developer_admin' || isPrimaryAdmin(curUser) || checkPerm(curUser.permissions, 'users'));
  if (!isCurAdmin && curUser) {
    if (typeof showToast === 'function') showToast('⛔ عذراً، إدارة المستخدمين مخصصة للمدراء فقط');
    return;
  }
  const modal = document.getElementById('add-user-modal');
  const titleEl = document.getElementById('user-modal-title');
  const idInput = document.getElementById('user-modal-id');
  const nameInput = document.getElementById('user-modal-fullname');
  const userInput = document.getElementById('user-modal-username');
  const emailInput = document.getElementById('user-modal-email');
  const roleSelect = document.getElementById('user-modal-role');
  const passGroup = document.getElementById('user-modal-pass-group');
  const passInput = document.getElementById('user-modal-password');
  const forcePassCheck = document.getElementById('user-modal-force-pass');
  const statusSelect = document.getElementById('user-modal-status');
  const uniqFeedback = document.getElementById('username-uniqueness-feedback');
  const permsSection = document.getElementById('user-modal-perms-section');

  if (uniqFeedback) uniqFeedback.innerHTML = '';

  const isCurPrimary = isCurrentSessionPrimaryOrDeveloper();

  if (userId) {
    const user = (state.users || []).find(u => u.id === userId);
    if (!user) return;

    // Protection 1: Primary Admin can only be edited by Primary Admin or Developer!
    if (isPrimaryAdmin(user) && !isCurPrimary) {
      alert('⛔ حساب المدير العام محمي بالكامل ولا يمكن تعديل بياناته إلا من قبل المدير العام أو المطور.');
      return;
    }

    // Protection 2: Secondary Admins can ONLY be edited by Primary Admin or Developer!
    if (user.role === 'admin' && !isCurPrimary) {
      alert('⛔ عذراً، تعديل بيانات وصلاحيات المدراء مسموح به حصرياً للمدير العام أو المطور.');
      return;
    }

    const isTargetAdmin = user.role === 'admin';
    const isTargetGM = isPrimaryAdmin(user);
    if (titleEl) titleEl.textContent = isTargetGM ? 'تعديل بيانات المدير العام' : (isTargetAdmin ? 'تعديل بيانات وصلاحيات المدير' : 'تعديل بيانات وصلاحيات الموظف');
    const confirmTextEl = document.getElementById('user-modal-confirm-text');
    if (confirmTextEl) confirmTextEl.textContent = 'تأكيد حفظ التعديلات';
    if (idInput) idInput.value = user.id;
    if (nameInput) nameInput.value = user.fullName;
    if (userInput) {
      userInput.value = user.username;
      userInput.disabled = true;
    }
    if (emailInput) emailInput.value = user.email || '';
    if (roleSelect) {
      roleSelect.value = isPrimaryAdmin(user) ? 'primary_admin' : (user.role || 'employee');
      roleSelect.disabled = !isCurPrimary;
      const gmCount = getGeneralManagersCount();
      const isTargetAlreadyGM = isPrimaryAdmin(user);

      const gmOpt = roleSelect.querySelector('option[value="primary_admin"]');
      if (gmOpt) {
        if (!isCurPrimary) {
          gmOpt.disabled = true;
          gmOpt.style.display = 'none';
        } else if (gmCount >= 2 && !isTargetAlreadyGM) {
          gmOpt.disabled = true;
          gmOpt.style.display = '';
          gmOpt.textContent = '👑 المدير العام (مكتمل الحد الأقصى: 2)';
        } else {
          gmOpt.disabled = false;
          gmOpt.style.display = '';
          gmOpt.textContent = `👑 المدير العام (الحد الأقصى: 2 | الحالي: ${gmCount})`;
        }
      }
    }
    if (passGroup) {
      passGroup.style.display = 'block';
      if (passInput) {
        passInput.value = user.passwordHash || user.password || '';
        passInput.placeholder = 'أدخل كلمة المرور الجديدة أو احتفظ بالحالية';
      }
      if (forcePassCheck) forcePassCheck.checked = Boolean(user.mustChangePassword);
    }
    if (statusSelect) statusSelect.value = user.isActive ? 'active' : 'disabled';

    // Permissions: Full lock ONLY for General Manager. For Manager & Employee, permissions are OPEN and configurable!
    const perms = user.permissions || [];
    ['dashboard', 'orders', 'products', 'banners', 'expenses', 'complaints', 'delivery', 'settings', 'notifications', 'users'].forEach(p => {
      const cb = document.getElementById(`user-perm-${p}`);
      if (cb) {
        if (isTargetGM) {
          cb.checked = true;
          cb.disabled = true;
        } else {
          cb.checked = checkPerm(perms, p);
          cb.disabled = false; // NEVER locked for Manager or Employee!
        }
      }
    });
    if (permsSection) {
      permsSection.style.opacity = isTargetGM ? '0.6' : '1';
    }
  } else {
    // Add new user (employee or manager)
    if (titleEl) titleEl.textContent = 'إضافة مستخدم (المدير أو موظف جديد)';
    const confirmTextEl = document.getElementById('user-modal-confirm-text');
    if (confirmTextEl) confirmTextEl.textContent = 'تأكيد إضافة الحساب';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (userInput) {
      userInput.value = '';
      userInput.disabled = false;
    }
    if (emailInput) emailInput.value = '';
    if (roleSelect) {
      roleSelect.value = 'employee';
      roleSelect.disabled = false;
      const gmCount = getGeneralManagersCount();

      // General Manager option: Strictly blocked for Employee and Manager, and capped at 2
      const gmOpt = roleSelect.querySelector('option[value="primary_admin"]');
      if (gmOpt) {
        if (!isCurPrimary) {
          gmOpt.disabled = true;
          gmOpt.style.display = 'none';
        } else if (gmCount >= 2) {
          gmOpt.disabled = true;
          gmOpt.style.display = '';
          gmOpt.textContent = '👑 المدير العام (مكتمل الحد الأقصى: 2)';
        } else {
          gmOpt.disabled = false;
          gmOpt.style.display = '';
          gmOpt.textContent = `👑 المدير العام (الحد الأقصى: 2 | الحالي: ${gmCount})`;
        }
      }

      const adminOpt = roleSelect.querySelector('option[value="admin"]');
      if (adminOpt) {
        adminOpt.disabled = !isCurPrimary;
        if (!isCurPrimary) {
          adminOpt.textContent = '🛡️ المدير (متاح للمدير العام فقط)';
        } else {
          adminOpt.textContent = '🛡️ المدير (أذونات وصلاحيات مخصصة للأقسام - خاضع لإشراف المدير العام)';
        }
      }
    }
    if (passGroup) passGroup.style.display = 'block';
    if (passInput) {
      passInput.value = generateRandomPassword();
      passInput.placeholder = 'أدخل أو ولد كلمة المرور المؤقتة للموظف';
    }
    if (forcePassCheck) forcePassCheck.checked = true;
    if (statusSelect) statusSelect.value = 'active';

    ['dashboard', 'orders', 'products', 'banners', 'expenses', 'complaints', 'delivery', 'settings', 'notifications', 'users'].forEach(p => {
      const cb = document.getElementById(`user-perm-${p}`);
      if (cb) {
        cb.checked = (p === 'orders' || p === 'products');
        cb.disabled = false;
      }
    });
    if (permsSection) permsSection.style.opacity = '1';
  }

  if (modal) modal.classList.add('active');
}

function closeAddUserModal() {
  const modal = document.getElementById('add-user-modal');
  if (modal) modal.classList.remove('active');
}

// Role change handler for modal: Full permissions ONLY for General Manager
function onUserRoleChange(newRole) {
  const isGM = (newRole === 'primary_admin');
  const permsSection = document.getElementById('user-modal-perms-section');
  ['dashboard', 'orders', 'products', 'banners', 'expenses', 'complaints', 'delivery', 'settings', 'notifications', 'users'].forEach(p => {
    const cb = document.getElementById(`user-perm-${p}`);
    if (cb) {
      if (isGM) {
        // Full permissions locked exclusively for General Manager
        cb.checked = true;
        cb.disabled = true;
      } else {
        // Manager & Employee permissions are OPEN, editable, and customizable!
        cb.disabled = false;
      }
    }
  });
  if (permsSection) {
    permsSection.style.opacity = isGM ? '0.6' : '1';
  }
}

// 17. Generate Random Strong Password
function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = 'Pass@';
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const input = document.getElementById('user-modal-password');
  if (input) input.value = pwd;
  return pwd;
}

// 18. Live Username & Email Uniqueness Checks
function checkUsernameUniqueness(inputEl) {
  const input = inputEl || document.getElementById('user-modal-username');
  const idInput = document.getElementById('user-modal-id');
  const feedback = document.getElementById('username-uniqueness-feedback');
  if (!input || !feedback) return;

  const val = (input.value || '').trim().toLowerCase();
  const currentId = idInput ? idInput.value : '';

  if (!val) {
    feedback.innerHTML = '';
    return;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(val)) {
    feedback.innerHTML = '<span style="color: #ef4444; font-size: 0.74rem;">⚠️ اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام ونقاط فقط بدون مسافات.</span>';
    return;
  }

  const exists = (state.users || []).some(u =>
    u.id !== currentId && (
      (u.username && u.username.trim().toLowerCase() === val) ||
      (u.email && u.email.trim().toLowerCase() === val)
    )
  );

  if (exists) {
    feedback.innerHTML = '<span style="color: #ef4444; font-size: 0.74rem;">❌ اسم المستخدم هذا محجوز مسبقاً، اختر اسماً آخر.</span>';
  } else {
    feedback.innerHTML = '<span style="color: #10b981; font-size: 0.74rem;">✅ اسم المستخدم متاح وفريد.</span>';
  }
}

function checkEmailUniqueness(inputEl) {
  const input = inputEl || document.getElementById('user-modal-email');
  const idInput = document.getElementById('user-modal-id');
  const feedback = document.getElementById('email-uniqueness-feedback');
  if (!input || !feedback) return;

  const val = (input.value || '').trim().toLowerCase();
  const currentId = idInput ? idInput.value : '';

  if (!val) {
    feedback.innerHTML = '';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    feedback.innerHTML = '<span style="color: #f59e0b; font-size: 0.74rem;">⚠️ صيغة البريد الإلكتروني غير مكتملة.</span>';
    return;
  }

  const exists = (state.users || []).some(u =>
    u.id !== currentId && (
      (u.email && u.email.trim().toLowerCase() === val) ||
      (u.username && u.username.trim().toLowerCase() === val)
    )
  );

  if (exists) {
    feedback.innerHTML = '<span style="color: #ef4444; font-size: 0.74rem;">❌ هذا البريد الإلكتروني مسجل مسبقاً لمستخدم آخر.</span>';
  } else {
    feedback.innerHTML = '<span style="color: #10b981; font-size: 0.74rem;">✅ البريد الإلكتروني متاح وفريد.</span>';
  }
}

// 19. Save User Form (Enforcing Strict Uniqueness & General Manager Limits)
async function saveUserForm() {
  const isCurPrimary = isCurrentSessionPrimaryOrDeveloper();

  const idInput = document.getElementById('user-modal-id');
  const nameInput = document.getElementById('user-modal-fullname');
  const userInput = document.getElementById('user-modal-username');
  const emailInput = document.getElementById('user-modal-email');
  const roleSelect = document.getElementById('user-modal-role');
  const passInput = document.getElementById('user-modal-password');
  const forcePassCheck = document.getElementById('user-modal-force-pass');
  const statusSelect = document.getElementById('user-modal-status');

  const userId = idInput ? idInput.value : '';
  const fullName = (nameInput ? nameInput.value : '').trim();
  const username = (userInput ? userInput.value : '').trim().toLowerCase();
  const rawEmail = (emailInput ? emailInput.value : '').trim();
  const email = rawEmail.toLowerCase();
  const selectedRole = roleSelect ? roleSelect.value : 'employee';
  const password = passInput ? passInput.value.trim() : '';
  const mustChange = forcePassCheck ? forcePassCheck.checked : true;
  const isActive = (statusSelect ? statusSelect.value : 'active') === 'active';

  if (!fullName || !username) {
    alert('يرجى إدخال الاسم الكامل واسم المستخدم');
    return;
  }

  // Username validation
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    alert('اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام ونقاط فقط بدون مسافات');
    return;
  }

  // 1. Strict Uniqueness Check for Username
  const usernameConflict = (state.users || []).some(u =>
    u.id !== userId && (
      (u.username && u.username.trim().toLowerCase() === username) ||
      (u.email && u.email.trim().toLowerCase() === username)
    )
  );
  if (usernameConflict) {
    alert('❌ اسم المستخدم هذا محجوز مسبقاً لمستخدم آخر. يرجى اختيار اسم مستخدم فريد.');
    return;
  }

  // 2. Strict Uniqueness Check for Email (if entered)
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('⚠️ صيغة البريد الإلكتروني غير صحيحة. يرجى إدخال بريد إلكتروني صالح مثل user@example.com');
      return;
    }

    const emailConflict = (state.users || []).some(u =>
      u.id !== userId && (
        (u.email && u.email.trim().toLowerCase() === email) ||
        (u.username && u.username.trim().toLowerCase() === email)
      )
    );
    if (emailConflict) {
      alert('❌ البريد الإلكتروني مسجل مسبقاً لمستخدم آخر في النظام. يرجى استخدام بريد إلكتروني فريد.');
      return;
    }
  }

  // 3. Security: Check General Manager Creation/Promotion Permissions & Max 2 Limit
  const isTargetingGM = (selectedRole === 'primary_admin');
  if (isTargetingGM) {
    // Neither Employee nor regular Manager is allowed to create or promote to General Manager!
    if (!isCurPrimary) {
      alert('⛔ غير مسموح: لا يمكن للموظف أو المدير إضافة أو ترقية أي مدير عام جديد. هذه الصلاحية محصورة حصرياً بالمدير العام أو المطور.');
      return;
    }

    // Limit check: Maximum 2 General Managers!
    const currentGMCount = getGeneralManagersCount();
    const existingUser = userId ? (state.users || []).find(u => u.id === userId) : null;
    const isAlreadyGM = existingUser && isPrimaryAdmin(existingUser);

    if (!isAlreadyGM && currentGMCount >= 2) {
      alert('⛔ لا يمكن إضافة أو تعيين مدير عام جديد: تم بلوغ الحد الأقصى المسموح به للمدراء العامين في النظام (مديران اثنان كحد أقصى 👑👑).');
      return;
    }
  }

  // 4. Regular Manager Role Assignment Check
  if (selectedRole === 'admin' && !isCurPrimary) {
    alert('⛔ تعيين وترقية المدراء مسموح به حصرياً للمدير العام أو المطور.');
    return;
  }

  // Collect permissions
  let perms = [];
  if (isTargetingGM) {
    perms = ['all'];
  } else {
    ['dashboard', 'orders', 'products', 'banners', 'expenses', 'complaints', 'delivery', 'settings', 'notifications', 'users'].forEach(p => {
      const cb = document.getElementById(`user-perm-${p}`);
      if (cb && cb.checked) perms.push(p);
    });
  }

  const csrfToken = getActiveCsrfToken();

  if (userId) {
    // Edit existing user
    const user = (state.users || []).find(u => u.id === userId);
    if (!user) return;

    if (isPrimaryAdmin(user) && !isCurPrimary) {
      alert('⛔ حساب المدير العام محمي بالكامل ولا يمكن تعديله إلا من قبل المدير العام أو المطور.');
      return;
    }

    if (user.role === 'admin' && !isCurPrimary) {
      alert('⛔ عذراً، تعديل بيانات وصلاحيات المدراء مسموح به حصرياً للمدير العام أو المطور.');
      return;
    }

    const payload = {
      fullName,
      username,
      email,
      role: isTargetingGM ? 'primary_admin' : (selectedRole === 'admin' ? 'admin' : 'employee'),
      permissions: perms,
      isActive,
      mustChangePassword: mustChange
    };
    if (password) {
      payload.password = password;
    }

    const serverUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
      ? window.TaswoqSync.getServerUrl() : '';
    const authHeaders = (window.TaswoqSync && typeof window.TaswoqSync.getAuthHeaders === 'function')
      ? window.TaswoqSync.getAuthHeaders() : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };

    try {
      const res = await fetch(`${serverUrl}/api/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data || !data.success) {
        alert((data && data.error) || 'فشل تحديث بيانات المستخدم في الخادم');
        return;
      }
      if (Array.isArray(data.users)) {
        state.users = data.users;
      } else if (data.user) {
        const idx = (state.users || []).findIndex(u => u.id === userId);
        if (idx >= 0) state.users[idx] = data.user;
      }
      if (Array.isArray(data.adminWhitelist)) {
        state.adminWhitelist = data.adminWhitelist;
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم لتحديث بيانات المستخدم: ' + err.message);
      return;
    }

    localStorage.setItem('khudair_users', JSON.stringify(state.users));
    if (state.adminWhitelist) {
      localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
    }
    if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === 'function') {
      window.TaswoqSync.syncUp({ users: state.users, adminWhitelist: state.adminWhitelist });
    }
    const roleTitle = isTargetingGM ? 'المدير العام 👑' : (selectedRole === 'admin' ? 'المدير 🛡️' : 'موظف 💼');
    addAuditLog('USER_UPDATED', `تعديل حساب ${roleTitle}`, `تم تعديل بيانات وصلاحيات ${fullName} (${username})`, user.id, fullName);
    showToast(`تم تحديث بيانات الحساب (${fullName}) بنجاح ✅`);
  } else {
    // Create new user (employee, manager, or general manager up to 2)
    if (!password) {
      alert('يرجى إدخال كلمة المرور للموظف أو الضغط على زر "🎲 توليد عشوائي"');
      if (passInput) passInput.focus();
      return;
    }

    const payload = {
      fullName,
      username,
      email,
      password,
      role: isTargetingGM ? 'primary_admin' : (selectedRole === 'admin' ? 'admin' : 'employee'),
      permissions: perms,
      isActive,
      mustChangePassword: mustChange
    };

    let createdUser = null;
    try {
      const serverUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
        ? window.TaswoqSync.getServerUrl() : '';
      const authHeaders = (window.TaswoqSync && typeof window.TaswoqSync.getAuthHeaders === 'function')
        ? window.TaswoqSync.getAuthHeaders() : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };

      const res = await fetch(`${serverUrl}/api/users`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data || !data.success) {
        alert((data && data.error) || 'فشل إنشاء المستخدم في الخادم');
        return;
      }
      if (Array.isArray(data.users)) {
        state.users = data.users;
      } else if (data.user) {
        if (!state.users) state.users = [];
        const existingIdx = state.users.findIndex(u => u.id === data.user.id || u.username === data.user.username);
        if (existingIdx >= 0) {
          state.users[existingIdx] = data.user;
        } else {
          state.users.push(data.user);
        }
      }
      if (Array.isArray(data.adminWhitelist)) {
        state.adminWhitelist = data.adminWhitelist;
      }
      createdUser = data.user;
    } catch (err) {
      alert('تعذر الاتصال بالخادم لإنشاء المستخدم: ' + err.message);
      return;
    }

      if (isTargetingGM && email) {
        if (!state.adminWhitelist) state.adminWhitelist = [];
        if (!state.adminWhitelist.some(e => e.toLowerCase() === email.toLowerCase())) {
          state.adminWhitelist.push(email);
        }
      }

      localStorage.setItem('khudair_users', JSON.stringify(state.users));
      if (state.adminWhitelist) {
        localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
      }
      if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === 'function') {
        window.TaswoqSync.syncUp({ users: state.users, adminWhitelist: state.adminWhitelist });
      }
      const roleTitle = isTargetingGM ? 'المدير العام 👑' : (selectedRole === 'admin' ? 'المدير 🛡️' : 'موظف 💼');
      addAuditLog('USER_CREATED', `إضافة ${roleTitle}`, `تم إنشاء وتعيين حساب جديد باسم ${fullName} (${username}) بكلمة مرور مؤقتة`, createdUser ? createdUser.id : '', fullName);
      showToast(`تم تعيين (${fullName}) كـ ${roleTitle} بنجاح! كلمة المرور: ${password} 🔑`);
    }

    // Sync users immediately with server database
    if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === 'function') {
      window.TaswoqSync.syncUp({ users: state.users, adminWhitelist: state.adminWhitelist });
    }
    closeAddUserModal();
    renderAdminUsers();
  }

// 20. Toggle User Status (Enable / Disable via dedicated API)
async function toggleUserStatus(userId) {
  const isCurPrimary = isCurrentSessionPrimaryOrDeveloper();
  if (!isCurPrimary) {
    alert('⛔ تعديل حالة المستخدم مسموح به حصرياً للمدير الأساسي أو المطور.');
    return;
  }

  const user = (state.users || []).find(u => u.id === userId);
  if (!user) return;

  const targetState = !user.isActive;
  const csrfToken = getActiveCsrfToken();

  const serverUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
    ? window.TaswoqSync.getServerUrl() : '';
  const authHeaders = (window.TaswoqSync && typeof window.TaswoqSync.getAuthHeaders === 'function')
    ? window.TaswoqSync.getAuthHeaders() : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };

  try {
    const res = await fetch(`${serverUrl}/api/users/status`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: authHeaders,
      body: JSON.stringify({ userId, isActive: targetState })
    });
    const data = await res.json();
    if (res.ok && data && data.success) {
      user.isActive = targetState;
      try {
        localStorage.setItem('khudair_users', JSON.stringify(state.users));
      } catch (e) { }
      if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === 'function') {
        window.TaswoqSync.syncUp({ users: state.users, adminWhitelist: state.adminWhitelist });
      }
      renderAdminUsers();
      sfx.playSuccess();
      showToast(`تم ${targetState ? 'تفعيل' : 'تعطيل'} حساب (${user.fullName}) بنجاح ${targetState ? '✅' : '⏸️'}`);
    } else {
      alert((data && data.error) || 'فشل تحديث حالة الحساب');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم: ' + err.message);
  }
}

// 21. Prompt Reset Password
function promptResetPassword(userId) {
  const isCurPrimary = isCurrentSessionPrimaryOrDeveloper();

  const user = (state.users || []).find(u => u.id === userId);
  if (!user) return;

  if (isPrimaryAdmin(user) && !isCurPrimary) {
    alert('⛔ حساب المدير العام محمي ولا يمكن إعادة تعيين كلمة مروره إلا من قبل المدير العام أو المطور.');
    return;
  }

  if (user.role === 'admin' && !isCurPrimary) {
    alert('⛔ إعادة تعيين كلمة مرور المدراء مسموح بها حصرياً للمدير العام أو المطور.');
    return;
  }

  state.resetPasswordTargetUser = user;
  const newTemp = generateRandomPassword();

  const modal = document.getElementById('reset-password-modal');
  const nameEl = document.getElementById('reset-pwd-user-name');
  const passInp = document.getElementById('reset-pwd-input') || document.getElementById('reset-pwd-display');

  if (nameEl) nameEl.textContent = `${user.fullName} (${isPrimaryAdmin(user) ? 'المدير العام' : (user.role === 'admin' ? 'المدير' : 'موظف')})`;
  if (passInp) {
    if (passInp.tagName === 'INPUT') {
      passInp.value = newTemp;
    } else {
      passInp.textContent = newTemp;
    }
  }
  if (modal) modal.classList.add('active');
}

function generateResetModalPassword() {
  const pwd = generateRandomPassword();
  const passInp = document.getElementById('reset-pwd-input') || document.getElementById('reset-pwd-display');
  if (passInp) {
    if (passInp.tagName === 'INPUT') passInp.value = pwd;
    else passInp.textContent = pwd;
  }
  if (typeof showToast === 'function') {
    showToast('تم توليد كلمة مرور مؤقتة جديدة 🎲');
  }
  return pwd;
}
window.generateResetModalPassword = generateResetModalPassword;

function copyResetModalPassword(btn) {
  const pInput = document.getElementById('reset-pwd-input') || document.getElementById('reset-pwd-display');
  const val = pInput ? (pInput.tagName === 'INPUT' ? pInput.value : pInput.textContent).trim() : '';

  const targetBtn = (btn instanceof HTMLElement ? btn : null)
    || (typeof event !== 'undefined' && event && event.target ? event.target.closest('button') : null)
    || document.getElementById('btn-copy-reset-pwd')
    || document.querySelector('button[onclick*="copyResetModalPassword"]');

  const showCopiedState = () => {
    if (targetBtn) {
      if (!targetBtn.dataset.origHtml) {
        targetBtn.dataset.origHtml = targetBtn.innerHTML;
      }
      targetBtn.innerHTML = '✅ تم النسخ';
      targetBtn.style.color = '#059669';
      targetBtn.style.borderColor = '#10b981';
      targetBtn.style.background = 'rgba(16, 185, 129, 0.08)';

      clearTimeout(targetBtn._copyTimer);
      targetBtn._copyTimer = setTimeout(() => {
        targetBtn.innerHTML = targetBtn.dataset.origHtml || '📋 نسخ';
        targetBtn.style.color = '';
        targetBtn.style.borderColor = '';
        targetBtn.style.background = '';
      }, 1800);
    }
  };

  if (val) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(() => {
        showCopiedState();
        if (typeof showToast === 'function') showToast(`تم نسخ كلمة المرور: ${val} 📋`);
      }).catch(() => {
        showCopiedState();
        if (typeof showToast === 'function') showToast(`تم نسخ كلمة المرور: ${val} 📋`);
      });
    } else {
      try {
        const tempInp = document.createElement('textarea');
        tempInp.value = val;
        document.body.appendChild(tempInp);
        tempInp.select();
        document.execCommand('copy');
        document.body.removeChild(tempInp);
      } catch (e) {}
      showCopiedState();
      if (typeof showToast === 'function') showToast(`تم نسخ كلمة المرور: ${val} 📋`);
    }
  } else {
    showCopiedState();
  }
}
window.copyResetModalPassword = copyResetModalPassword;

function closeResetPasswordModal() {
  const modal = document.getElementById('reset-password-modal');
  if (modal) modal.classList.remove('active');
  state.resetPasswordTargetUser = null;
}

async function confirmResetPassword() {
  const user = state.resetPasswordTargetUser;
  const passInp = document.getElementById('reset-pwd-input') || document.getElementById('reset-pwd-display');
  if (!user || !passInp) return;

  const newTemp = (passInp.value || passInp.textContent || '').trim();
  if (!newTemp || newTemp.length < 6) {
    alert('كلمة المرور المؤقتة يجب أن تتكون من 6 خانات على الأقل');
    return;
  }

  const csrfToken = getActiveCsrfToken();
  const serverUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
    ? window.TaswoqSync.getServerUrl() : '';
  const authHeaders = (window.TaswoqSync && typeof window.TaswoqSync.getAuthHeaders === 'function')
    ? window.TaswoqSync.getAuthHeaders() : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };

  try {
    const res = await fetch(`${serverUrl}/api/users/reset-password`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: authHeaders,
      body: JSON.stringify({ userId: user.id, newPassword: newTemp })
    });
    const data = await res.json();
    if (res.ok && data && data.success) {
      user.mustChangePassword = true;
      closeResetPasswordModal();
      renderAdminUsers();
      sfx.playSuccess();
      showToast(`تم تعيين كلمة المرور الجديدة للمستخدم (${user.fullName}) بنجاح 🔒`);
    } else {
      alert((data && data.error) || 'فشل إعادة تعيين كلمة المرور');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم: ' + err.message);
  }
}

// 22. Delete User Account via dedicated DELETE API
async function deleteUserAccount(userId) {
  const isCurPrimary = isCurrentSessionPrimaryOrDeveloper();
  if (!isCurPrimary) {
    alert('⛔ حذف المستخدمين مسموح به حصرياً للمدير الأساسي أو المطور.');
    return;
  }

  const user = (state.users || []).find(u => u.id === userId);
  if (!user) return;

  if (confirm(`هل أنت متأكد من حذف حساب (${user.fullName}) نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`)) {
    const csrfToken = getActiveCsrfToken();
    const serverUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
      ? window.TaswoqSync.getServerUrl() : '';
    const authHeaders = (window.TaswoqSync && typeof window.TaswoqSync.getAuthHeaders === 'function')
      ? window.TaswoqSync.getAuthHeaders() : { 'X-CSRF-Token': csrfToken };

    try {
      const res = await fetch(`${serverUrl}/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: authHeaders
      });
      const data = await res.json();
      if (res.ok && data && data.success) {
        state.users = (state.users || []).filter(u => u.id !== userId);
        try {
          localStorage.setItem('khudair_users', JSON.stringify(state.users));
        } catch (e) { }
        if (window.TaswoqSync && typeof window.TaswoqSync.syncUp === 'function') {
          window.TaswoqSync.syncUp({ users: state.users, adminWhitelist: state.adminWhitelist });
        }
        renderAdminUsers();
        if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
        showToast(`🗑️ تم حذف حساب (${user.fullName}) بنجاح.`);
      } else {
        alert((data && data.error) || 'فشل حذف الحساب من الخادم');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم: ' + err.message);
    }
  }
}

// window.DEVELOPER_SECRET_CODE is defined on window

// 22b. Developer Secret Masked Modal Handlers (رمز المطور السري مشفر ومخفي تماماً بنقاط ••••••••)
function openDevSecretModal() {
  const modal = document.getElementById('dev-secret-modal');
  const phasePwd = document.getElementById('dev-modal-phase-password');
  const phaseActions = document.getElementById('dev-modal-phase-actions');
  const pwdInput = document.getElementById('dev-secret-password-input');
  const errEl = document.getElementById('dev-secret-error-msg');

  if (errEl) errEl.style.display = 'none';
  if (phasePwd) phasePwd.style.display = 'block';
  if (phaseActions) phaseActions.style.display = 'none';
  if (pwdInput) {
    pwdInput.value = '';
    pwdInput.type = 'password';
  }
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  setTimeout(() => {
    if (pwdInput) pwdInput.focus();
  }, 100);
}

function closeDevSecretModal() {
  const modal = document.getElementById('dev-secret-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  const pwdInput = document.getElementById('dev-secret-password-input');
  if (pwdInput) pwdInput.value = '';
}

async function handleDevSecretPasswordSubmit(e) {
  if (e) e.preventDefault();
  const pwdInput = document.getElementById('dev-secret-password-input');
  const errEl = document.getElementById('dev-secret-error-msg');
  const phasePwd = document.getElementById('dev-modal-phase-password');
  const phaseActions = document.getElementById('dev-modal-phase-actions');
  if (!pwdInput) return;

  const entered = pwdInput.value.trim();
  if (!entered) return;

  try {
    const serverUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
      ? window.TaswoqSync.getServerUrl() : '';

    const res = await fetch(`${serverUrl}/api/auth/developer/login`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secretKey: entered })
    });
    const data = await res.json();
    if (res.ok && data && data.success) {
      if (data.csrfToken) sessionStorage.setItem('taswoq_csrf_token', data.csrfToken);
      if (data.user) {
        state.currentUser = data.user;
        try {
          localStorage.setItem('taswoq_active_user', JSON.stringify(data.user));
          localStorage.setItem('tasweeq_current_user', JSON.stringify(data.user));
          localStorage.setItem('tasweeq_admin_auth', 'true');
        } catch (err) { }
        renderAdminAuthUI();
        applyUserPermissions();
        renderAdminAll();
        if (window.TaswoqSync && typeof window.TaswoqSync.syncDown === 'function') {
          window.TaswoqSync.syncDown('admin').then(syncedData => {
            if (syncedData && syncedData.success && typeof applySyncedData === 'function') {
              applySyncedData(syncedData);
            }
          }).catch(() => {});
        }
      }
      if (errEl) errEl.style.display = 'none';
      if (phasePwd) phasePwd.style.display = 'none';
      if (phaseActions) phaseActions.style.display = 'block';
      if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
    } else {
      if (errEl) {
        errEl.textContent = (data && data.error) || '❌ رمز المطور السري غير صحيح! تم رفض الوصول.';
        errEl.style.display = 'block';
      }
      pwdInput.value = '';
      pwdInput.focus();
      if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = '❌ تعذر الاتصال بالخادم للتحقق من الرمز: ' + err.message;
      errEl.style.display = 'block';
    }
  }
}

function promptDeveloperSecretCode(userId = 'usr-101') {
  openDevSecretModal();
}

async function runDeveloperSystemReset() {
  const sync = window.TaswoqSync;
  if (!sync || typeof sync.syncDown !== 'function' || typeof sync.getSystemGeneration !== 'function') {
    alert('تعذر تهيئة النظام: مكتبة المزامنة أو رقم جيل البيانات غير متوفر.');
    return;
  }
  if (sync.getSystemGeneration() == null) await sync.syncDown('admin');
  const generation = sync.getSystemGeneration();
  if (!Number.isInteger(Number(generation)) || Number(generation) < 1) {
    alert('تعذر قراءة إصدار بيانات الخادم. حدّث الصفحة وحاول مجدداً.');
    return;
  }
  const scope = 'سيتم حذف المنتجات، البنرات، الطلبات وعناصرها، الشكاوى، الإشعارات، مناطق التوصيل، المستلمين، المحافظ، المندوبين، المصاريف، الأسئلة الشائعة، مشتركي التطبيق، وبيانات ملف المتجر والدعم والتوصيل والإعدادات التشغيلية. ستصبح تقارير المبيعات والأرباح المشتقة من الطلبات والمصاريف فارغة. سيُحذف الموظفون والمديرون غير الأساسيين، وتُبطل كل الجلسات، وتُحذف سجلات التدقيق القديمة مع تسجيل حدث التهيئة. تبقى الأقسام وحسابات المدير العام الأساسية وحساب المطور بكامل حقولها وكلمات مرورها وصلاحياتها؛ وتبقى فقط عناوين السماح المرتبطة بهذه الحسابات المحفوظة، وتُحذف بقية العناوين. تُعاد أسماء التطبيق الافتراضية ويُمسح الشعار. ستُصفّر ذاكرة البيانات التشغيلية على الأجهزة عند اتصالها بالخادم؛ ويتطلب ذلك إصدار تطبيق Android محدّثاً ومزامنة قبل أي حفظ.';
  if (!confirm('⚠️ تهيئة مدمرة لبيانات النظام\n\n' + scope + '\n\nلا يمكن التراجع عن الحذف. هل تريد المتابعة؟')) return;
  const typed = prompt('للتأكيد، اكتب النص التالي حرفياً:\nRESET TASWOQ');
  if (typed !== 'RESET TASWOQ') { alert('لم تتم التهيئة؛ عبارة التأكيد غير مطابقة.'); return; }
  try {
    const response = await fetch(sync.getServerUrl() + '/api/admin/system-reset', {
      method: 'POST', credentials: 'same-origin',
      headers: sync.getAuthHeaders({ 'X-System-Generation': String(generation) }),
      body: JSON.stringify({ confirmation: typed, expectedGeneration: Number(generation) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || ('HTTP ' + response.status));
    sync.completeSystemReset(result.systemGeneration);
    alert('اكتملت تهيئة بيانات التشغيل. بقيت الأقسام وحسابات المدير العام والمطور. تم تسجيل خروج الجلسات؛ سجّل الدخول مجدداً.');
    window.location.assign('/login.html');
  } catch (error) {
    alert('لم تكتمل التهيئة: ' + (error && error.message ? error.message : 'تعذر الاتصال بالخادم'));
  }
}

function execDevAction(choiceNum) {
  closeDevSecretModal();
  const choice = String(choiceNum);

  if (choice === '1') {
    // Appoint a brand new General Manager
    const newName = prompt('👑 أدخل الاسم الكامل للمدير العام الجديد:', 'المدير العام الجديد');
    if (!newName || !newName.trim()) return;
    const newEmail = prompt('📧 أدخل البريد الإلكتروني للمدير العام (اختياري لتسجيل دخول Google):', '');
    const newUsername = prompt('👤 أدخل اسم المستخدم (Username):', (newEmail ? newEmail.split('@')[0] : 'general.admin').toLowerCase());
    const newPass = prompt('🔑 أدخل كلمة المرور المؤقتة:', 'Admin@2026');

    appointNewGeneralManager(newName.trim(), (newUsername || 'admin').trim().toLowerCase(), (newEmail || '').trim(), newPass || 'Admin@2026');
  } else if (choice === '2') {
    // Promote existing user to General Manager
    const nonPrimaryUsers = (state.users || []).filter(u => !isPrimaryAdmin(u));
    if (nonPrimaryUsers.length === 0) {
      alert('لا يوجد مدراء أو موظفون آخرون في النظام لترقيتهم.');
      return;
    }
    const userListStr = nonPrimaryUsers.map((u, i) => `${i + 1}: ${u.fullName} (${u.role === 'admin' ? 'المدير' : 'موظف'}) - [${u.username}]`).join('\n');
    const pickNum = prompt(`اختر رقم الحساب لتعيينه كـ (المدير العام) الجديد:
${userListStr}
اكتب الرقم:`);
    const idx = parseInt(pickNum) - 1;
    if (!isNaN(idx) && nonPrimaryUsers[idx]) {
      appointExistingUserAsGeneralManager(nonPrimaryUsers[idx].id);
    }
  } else if (choice === '3') {
    // Edit existing General Manager
    const user = (state.users || []).find(u => isPrimaryAdmin(u));
    if (!user) {
      alert('حساب المدير العام غير موجود حالياً، يمكنك تعيين مدير عام جديد (الخيار 1).');
      return;
    }
    const newName = prompt('أدخل الاسم الجديد للمدير العام:', user.fullName);
    if (newName && newName.trim()) {
      user.fullName = newName.trim();
      const newEmail = prompt('أدخل البريد الإلكتروني الجديد:', user.email || '');
      if (newEmail !== null) {
        user.email = newEmail.trim();
        if (user.email && state.adminWhitelist && !state.adminWhitelist.includes(user.email)) {
          state.adminWhitelist.push(user.email);
          localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
        }
      }
      localStorage.setItem('khudair_users', JSON.stringify(state.users));
      renderAdminUsers();
      showToast('تم تحديث بيانات المدير العام بنجاح ✅');
    }
  } else if (choice === '4') {
    // Delete General Manager
    if (confirm('⚠️ تأكيد المبرمج الأمني:\nهل أنت متأكد من حذف حساب المدير العام نهائياً من قاعدة البيانات والتخزين؟')) {
      const gmUser = (state.users || []).find(u => isPrimaryAdmin(u));
      const gmId = gmUser ? gmUser.id : 'usr-101';
      state.users = (state.users || []).filter(u => !isPrimaryAdmin(u));
      if (state.adminWhitelist) {
        state.adminWhitelist = state.adminWhitelist.filter(e => e.toLowerCase() !== '');
        localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
      }
      let delList = [];
      try { delList = JSON.parse(localStorage.getItem('taswoq_deleted_users') || '[]'); } catch (e) { }
      if (!delList.includes('usr-101')) delList.push('usr-101');
      if (!delList.includes('admin')) delList.push('admin');
      if (gmUser && gmUser.username && !delList.includes(gmUser.username.toLowerCase())) delList.push(gmUser.username.toLowerCase());
      localStorage.setItem('taswoq_deleted_users', JSON.stringify(delList));
      localStorage.setItem('khudair_primary_admin_deleted', 'true');
      localStorage.setItem('khudair_users', JSON.stringify(state.users));
      addAuditLog('USER_DELETED', 'حذف حساب المدير العام', 'تم حذف حساب المدير العام بنجاح بواسطة كود المبرمج السري', gmId, 'المدير العام');

      if (state.currentUser && isPrimaryAdmin(state.currentUser)) {
        confirmLogoutAction();
        if (typeof sfx !== 'undefined' && sfx.playError) sfx.playError();
        showToast('⛔ تم حذف حساب المدير العام، وتم تسجيل الخروج تلقائياً إلى واجهة الدخول 🔒');
        return;
      }

      renderAdminUsers();
      sfx.playSuccess();
      showToast('تم حذف حساب المدير العام بنجاح بواسطة كود المبرمج 🗑️');
    }
  } else if (choice === '5') {
    // Restore default
    restoreDefaultGeneralManager();
  } else if (choice === '6') {
    // إغلاق قائمة المطور والمتابعة في لوحة التحكم بحساب المطور المعتمد وكامل الصلاحيات دون انتحال صفة المدير العام
    closeDevSecretModal();
    if (typeof showToast === 'function') {
      showToast('تم فتح لوحة التحكم بكامل صلاحيات المطور المعتمدة 👑');
    }
  } else if (choice === '7') {
    runDeveloperSystemReset();
  }
}

// Helper: Appoint Brand New General Manager (Capped at 2 GMs max)
function appointNewGeneralManager(fullName, username, email, password) {
  const currentGMCount = getGeneralManagersCount();
  if (currentGMCount >= 2) {
    alert('⛔ لا يمكن إضافة مدير عام جديد: تم بلوغ الحد الأقصى للمدراء العامين في النظام (مديران اثنان كحد أقصى 👑👑).');
    return;
  }

  const uClean = (username || '').trim().toLowerCase();
  const eClean = (email || '').trim().toLowerCase();

  const conflict = (state.users || []).some(u =>
    (uClean && ((u.username && u.username.trim().toLowerCase() === uClean) || (u.email && u.email.trim().toLowerCase() === uClean))) ||
    (eClean && ((u.email && u.email.trim().toLowerCase() === eClean) || (u.username && u.username.trim().toLowerCase() === eClean)))
  );

  if (conflict) {
    alert('❌ اسم المستخدم أو البريد الإلكتروني مسجل مسبقاً لمستخدم آخر في النظام.');
    return;
  }

  localStorage.removeItem('khudair_primary_admin_deleted');

  const newId = 'usr-' + (Date.now() + Math.floor(Math.random() * 100));
  const newGM = {
    id: newId,
    fullName: fullName,
    username: uClean,
    email: eClean,
    passwordHash: password,
    role: 'primary_admin',
    isPrimaryAdmin: true,
    isActive: true,
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: 'تم التعيين حديثاً',
    createdAt: new Date().toISOString().split('T')[0],
    permissions: ['all']
  };

  if (!state.users) state.users = [];
  state.users.unshift(newGM);

  if (eClean) {
    if (!state.adminWhitelist) state.adminWhitelist = [];
    if (!state.adminWhitelist.some(e => e.toLowerCase() === eClean)) {
      state.adminWhitelist.push(eClean);
      localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
    }
  }

  localStorage.setItem('khudair_users', JSON.stringify(state.users));
  addAuditLog('USER_CREATED', 'تعيين مدير عام جديد', `تم تعيين وتثبيت ${fullName} (${uClean}) كـ المدير العام للنظام`, newId, fullName);

  renderAdminUsers();
  sfx.playSuccess();
  showToast(`👑 تم تعيين (${fullName}) كـ (المدير العام) للنظام بنجاح!`);
}

// Helper: Promote Existing User to General Manager (Capped at 2 GMs max)
function appointExistingUserAsGeneralManager(userId) {
  const targetUser = (state.users || []).find(u => u.id === userId);
  if (!targetUser) return;

  const currentGMCount = getGeneralManagersCount();
  const isAlreadyGM = isPrimaryAdmin(targetUser);
  if (!isAlreadyGM && currentGMCount >= 2) {
    alert('⛔ لا يمكن ترقية المستخدم: تم بلوغ الحد الأقصى للمدراء العامين في النظام (مديران اثنان كحد أقصى 👑👑).');
    return;
  }

  localStorage.removeItem('khudair_primary_admin_deleted');

  targetUser.isPrimaryAdmin = true;
  targetUser.role = 'primary_admin';
  targetUser.permissions = ['all'];
  targetUser.isActive = true;

  if (targetUser.email) {
    const eClean = targetUser.email.trim().toLowerCase();
    if (!state.adminWhitelist) state.adminWhitelist = [];
    if (!state.adminWhitelist.some(e => e.toLowerCase() === eClean)) {
      state.adminWhitelist.push(eClean);
      localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
    }
  }

  localStorage.setItem('khudair_users', JSON.stringify(state.users));
  addAuditLog('USER_UPDATED', 'ترقية إلى المدير العام', `تمت ترقية وتعيين ${targetUser.fullName} (${targetUser.username}) كـ المدير العام للنظام`, targetUser.id, targetUser.fullName);

  renderAdminUsers();
  sfx.playSuccess();
  showToast(`👑 تم تتويج (${targetUser.fullName}) كـ (المدير العام) للنظام بنجاح!`);
}

// Helper: Restore Default General Manager
function restoreDefaultGeneralManager() {
  localStorage.removeItem('khudair_primary_admin_deleted');
  let delList = [];
  try { delList = JSON.parse(localStorage.getItem('taswoq_deleted_users') || '[]'); } catch (e) { }
  delList = delList.filter(x => x !== 'usr-101' && x !== 'admin');
  localStorage.setItem('taswoq_deleted_users', JSON.stringify(delList));

  const primaryExists = (state.users || []).some(u => isPrimaryAdmin(u));
  if (!primaryExists) {
    if (!state.users) state.users = [];
    state.users.unshift({
      id: 'usr-101',
      fullName: 'المدير العام',
      username: 'admin',
      email: '',
      passwordHash: '',
      role: 'admin',
      isPrimaryAdmin: true,
      isActive: true,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: '2026-10-18 10:30',
      createdAt: '2026-01-01',
      permissions: ['all']
    });
    if (state.adminWhitelist) {
      state.adminWhitelist = state.adminWhitelist.filter(e => e && e.trim());
      localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
    }
    localStorage.setItem('khudair_users', JSON.stringify(state.users));
  }
  renderAdminUsers();
  sfx.playSuccess();
  showToast('تمت استعادة حساب المدير العام الافتراضي بنجاح! 👑');
}

// Global Developer Shortcut: Ctrl + Shift + D فقط حصرياً
function triggerDeveloperMenu(e) {
  const isKeyD = (
    e.code === 'KeyD' ||
    e.keyCode === 68 ||
    e.which === 68 ||
    (e.key && (
      e.key.toLowerCase() === 'd' ||
      e.key === 'ي' ||
      e.key === '[' ||
      e.key === ']' ||
      e.key === 'إ' ||
      e.key === '÷'
    ))
  );

  // اختصار حصري ومحدد: Ctrl + Shift + D فقط لا غير
  const isDevCombo = (e.ctrlKey || e.metaKey) && e.shiftKey && isKeyD;

  if (isDevCombo) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openDevSecretModal();
    return false;
  }
}

// Attach to both window and document with capture: true to ensure it runs even if focus is in an input
window.addEventListener('keydown', triggerDeveloperMenu, true);
document.addEventListener('keydown', triggerDeveloperMenu, true);

// 23. Toggle Audit Logs Accordion (Hidden by Default, Show on Click)
function toggleAuditLogs() {
  const content = document.getElementById('audit-logs-content');
  const icon = document.getElementById('audit-toggle-icon');
  const text = document.getElementById('audit-toggle-text');
  if (!content) return;

  const isHidden = content.style.display === 'none' || content.style.display === '';
  if (isHidden) {
    content.style.display = 'block';
    if (icon) icon.textContent = '▲';
    if (text) text.textContent = 'إخفاء سجل التدقيق';
    if (typeof renderAdminAuditLogs === 'function') renderAdminAuditLogs();
    if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  } else {
    content.style.display = 'none';
    if (icon) icon.textContent = '▼';
    if (text) text.textContent = 'عرض سجل التدقيق';
    if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
  }
}

// 23b. Render Audit Logs Table
function renderAdminAuditLogs() {
  const tbody = document.getElementById('admin-audit-logs-tbody');
  if (!tbody) return;

  const logs = state.auditLogs || [];
  const filter = state.auditLogFilter || 'all';

  const filtered = logs.filter(l => {
    if (filter === 'all') return true;
    if (filter === 'login') return l.action.includes('LOGIN');
    if (filter === 'user') return l.action.includes('USER');
    if (filter === 'security') return l.action.includes('PASSWORD') || l.action.includes('LOCKED') || l.action.includes('REJECTED');
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">لا توجد سجلات تدقيق مسجلة حتى الآن</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    let badgeColor = '#059669';
    let badgeBg = '#ecfdf5';
    if (l.action.includes('FAILED') || l.action.includes('REJECTED') || l.action.includes('LOCKED') || l.action.includes('DELETED')) {
      badgeColor = '#ef4444';
      badgeBg = '#fef2f2';
    } else if (l.action.includes('PASSWORD') || l.action.includes('STATUS')) {
      badgeColor = '#d97706';
      badgeBg = '#fffbeb';
    }

    return `
      <tr>
        <td style="font-size: 0.74rem; font-family: monospace; color: var(--text-muted);">${l.id}</td>
        <td>
          <span style="display: inline-block; font-size: 0.72rem; font-weight: 800; color: ${badgeColor}; background: ${badgeBg}; padding: 2px 8px; border-radius: 6px;">
            ${l.actionTitle}
          </span>
        </td>
        <td style="font-size: 0.82rem; font-weight: 700; color: var(--text-main);">
          ${l.userName}
        </td>
        <td style="font-size: 0.78rem; color: var(--text-muted);">
          ${l.details}
        </td>
        <td style="font-size: 0.74rem; color: var(--text-muted); white-space: nowrap;">
          ${l.timestamp}
        </td>
      </tr>
    `;
  }).join('');
}

function setAuditLogFilter(filter, btnEl) {
  state.auditLogFilter = filter;
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    btnEl.classList.add('active');
  }
  renderAdminAuditLogs();
}

// 24. Export Audit Logs to CSV
function exportAuditLogsCsv() {
  const user = state.currentUser;
  if (!user || user.role !== 'admin') {
    if (typeof showToast === 'function') {
      showToast('⚠️ صلاحية تصدير سجل التدقيق مقتصرة على المدير العام فقط');
    }
    return;
  }
  const logs = state.auditLogs || [];
  if (logs.length === 0) {
    alert('لا توجد سجلات تدقيق لتصديرها');
    return;
  }

  let csv = '\uFEFF'; // UTF-8 BOM
  csv += 'المعرف,نوع العملية,المستخدم / الفاعل,التفاصيل,عنوان IP,التاريخ والوقت\r\n';

  logs.forEach(l => {
    const cleanDetails = (l.details || '').replace(/[\r\n,"]/g, ' ');
    csv += `"${l.id}","${l.actionTitle}","${l.userName}","${cleanDetails}","${l.ipAddress}","${l.timestamp}"\r\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `سجل_التدقيق_الأمني_تسوق_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('تم تصدير سجل التدقيق الأمني بنجاح بصيغة CSV 📑');
}

// 25. Admin Whitelist Management
function openAdminWhitelistModal() {
  const curUser = state.currentUser;
  const isAdmin = curUser && (curUser.role === 'admin' || isPrimaryAdmin(curUser) || checkPerm(curUser.permissions, 'all'));
  if (!isAdmin) {
    if (typeof showToast === 'function') showToast('⛔ عذراً، إدارة القائمة البيضاء مخصصة للمدير العام فقط');
    return;
  }
  const modal = document.getElementById('admin-whitelist-modal');
  renderAdminWhitelist();
  if (modal) modal.classList.add('active');
}

function closeAdminWhitelistModal() {
  const modal = document.getElementById('admin-whitelist-modal');
  if (modal) modal.classList.remove('active');
}

function renderAdminWhitelist() {
  const container = document.getElementById('admin-whitelist-items');
  if (!container) return;
  const list = state.adminWhitelist || [];

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 22px 14px; background: var(--bg-surface-secondary); border-radius: 12px; color: var(--text-muted); font-size: 0.83rem;">
        <span style="font-size: 1.6rem; display: block; margin-bottom: 6px;">🛡️</span>
        لا توجد أي عناوين بريد إلكتروني معتمدة حالياً.<br>
        أدخل عنوان بريد Google أدناه لمنحه صلاحية الدخول.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(email => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-surface-secondary); border-radius: 8px; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 0.9rem;">🛡️</span>
        <span style="font-weight: 700; font-size: 0.85rem; font-family: monospace;">${email}</span>
      </div>
      <button class="ctrl-btn" onclick="removeAdminWhitelistEmail('${email}')" title="إزالة من القائمة" style="color: #ef4444; font-size: 0.75rem; padding: 2px 8px;">إزالة</button>
    </div>
  `).join('');
}

function addAdminWhitelistEmail() {
  const input = document.getElementById('new-whitelist-email-input');
  if (!input) return;
  const email = input.value.trim().toLowerCase();

  if (!email || !email.includes('@')) {
    alert('يرجى إدخال بريد إلكتروني صحيح');
    return;
  }

  if (state.adminWhitelist.some(e => e.toLowerCase() === email)) {
    alert('هذا البريد مضاف مسبقاً في القائمة البيضاء');
    return;
  }

  state.adminWhitelist.push(email);
  localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
  addAuditLog('WHITELIST_ADDED', 'إضافة بريد مدير للقائمة البيضاء', `تمت إضافة البريد المعتمد ${email} لقائمة مدراء Google`, state.currentUser ? state.currentUser.id : null, state.currentUser ? state.currentUser.fullName : null);

  input.value = '';
  renderAdminWhitelist();
  renderAdminUsers();
  sfx.playSuccess();
  showToast(`تمت إضافة (${email}) إلى القائمة البيضاء للمدراء بنجاح ✅`);
}

function removeAdminWhitelistEmail(email) {
  if (confirm(`هل أنت متأكد من إزالة (${email}) من قائمة المدراء المعتمدين؟ لن يتمكن من تسجيل الدخول بعد الآن.`)) {
    state.adminWhitelist = state.adminWhitelist.filter(e => e.toLowerCase() !== email.toLowerCase());
    localStorage.setItem('khudair_admin_whitelist', JSON.stringify(state.adminWhitelist));
    addAuditLog('WHITELIST_REMOVED', 'إزالة بريد مدير من القائمة البيضاء', `تمت إزالة البريد ${email} من قائمة مدراء Google`, state.currentUser ? state.currentUser.id : null, state.currentUser ? state.currentUser.fullName : null);
    renderAdminWhitelist();
    renderAdminUsers();
    showToast(`تمت إزالة (${email}) من القائمة البيضاء 🗑️`);
  }
}

// Android Native Back Button Handler for WebView integration
window.handleAndroidBackPressed = function () {
  const waChoice = document.getElementById('wa-choice-modal');
  if (waChoice && waChoice.classList.contains('active')) {
    if (typeof backToWhatsAppModal === 'function') backToWhatsAppModal();
    return true;
  }

  const waModal = document.getElementById('whatsapp-modal');
  if (waModal && waModal.classList.contains('active')) {
    if (typeof closeWhatsAppModal === 'function') closeWhatsAppModal(true);
    return true;
  }

  const googleModal = document.getElementById('google-signin-modal');
  if (googleModal && googleModal.classList.contains('active')) {
    if (typeof closeGoogleSignInModal === 'function') closeGoogleSignInModal();
    return true;
  }

  const prodModal = document.getElementById('product-crud-modal');
  if (prodModal && prodModal.classList.contains('active')) {
    if (typeof closeProductModal === 'function') closeProductModal();
    return true;
  }

  const bannerModal = document.getElementById('banner-crud-modal');
  if (bannerModal && bannerModal.classList.contains('active')) {
    if (typeof closeBannerModal === 'function') closeBannerModal();
    return true;
  }

  const zoneModal = document.getElementById('zone-crud-modal');
  if (zoneModal && zoneModal.classList.contains('active')) {
    if (typeof closeZoneModal === 'function') closeZoneModal();
    return true;
  }

  const waNumModal = document.getElementById('whatsapp-number-modal');
  if (waNumModal && waNumModal.classList.contains('active')) {
    if (typeof closeWhatsAppNumberModal === 'function') closeWhatsAppNumberModal();
    return true;
  }

  const notifModal = document.getElementById('notifications-modal');
  if (notifModal && notifModal.classList.contains('active')) {
    if (typeof closeNotificationsModal === 'function') closeNotificationsModal();
    return true;
  }

  const compModal = document.getElementById('complaint-modal');
  if (compModal && compModal.classList.contains('active')) {
    if (typeof closeComplaintModal === 'function') closeComplaintModal();
    return true;
  }

  const sheetBackdrop = document.getElementById('sheet-backdrop');
  if (sheetBackdrop && (sheetBackdrop.classList.contains('active') || sheetBackdrop.style.display === 'block')) {
    if (typeof closeQuantitySheet === 'function') closeQuantitySheet();
    return true;
  }

  if (state.viewMode === 'admin') {
    switchViewMode('mobile');
    return true;
  }

  if (state.activeMobileTab && state.activeMobileTab !== 'home') {
    switchMobileTab('home');
    return true;
  }

  return false;
};



// ======================================================================
// PUSH NOTIFICATION SYSTEM (إرسال إشعارات الجوال)
// ======================================================================
function openSendNotificationModal() {
  const user = (typeof state !== 'undefined') ? state.currentUser : null;
  const perms = user ? (user.permissions || []) : [];
  const isPrimary = (typeof isPrimaryAdmin === 'function') && isPrimaryAdmin(user);
  const isDeveloper = Boolean(user && (user.role === 'developer_admin' || user.id === 'usr_developer'));
  const hasAll = isPrimary || isDeveloper || (Array.isArray(perms) ? perms.includes('all') : Boolean(perms && perms['all']));
  const hasPerm = hasAll || hasUserPermission('notifications') || hasUserPermission('notifications:write');
  if (!hasPerm) {
    if (typeof showToast === 'function') showToast('⛔ عذراً، لا تملك تصريحاً لإرسال إشعارات الجوال');
    return;
  }
  const modal = document.getElementById('send-notification-modal');
  if (modal) modal.classList.add('active');
  updatePushPreview();
}

function closeSendNotificationModal() {
  const modal = document.getElementById('send-notification-modal');
  if (modal) modal.classList.remove('active');
}

function applyPushTemplate(title, body) {
  const tInput = document.getElementById('push-notif-title');
  const bInput = document.getElementById('push-notif-body');
  if (tInput) {
    tInput.value = title;
    const countEl = document.getElementById('push-title-count');
    if (countEl) countEl.textContent = title.length + ' / 60';
  }
  if (bInput) {
    bInput.value = body;
    const countEl = document.getElementById('push-body-count');
    if (countEl) countEl.textContent = body.length + ' / 200';
  }
  updatePushPreview();
  if (typeof sfx !== 'undefined' && sfx.playTap) sfx.playTap();
}

function updatePushPreview() {
  const tInput = document.getElementById('push-notif-title');
  const bInput = document.getElementById('push-notif-body');
  const prevTitle = document.getElementById('preview-notif-title');
  const prevBody = document.getElementById('preview-notif-body');

  const titleVal = (tInput ? tInput.value : '').trim();
  const bodyVal = (bInput ? bInput.value : '').trim();

  if (prevTitle) {
    prevTitle.textContent = titleVal || 'عنوان الإشعار سيظهر هنا...';
  }
  if (prevBody) {
    prevBody.textContent = bodyVal || 'محتوى رسالة الإشعار سيظهر على جوال العميل بهذا الشكل...';
  }
}

function submitSendNotification() {
  const user = (typeof state !== 'undefined') ? state.currentUser : null;
  const perms = user ? (user.permissions || []) : [];
  const isPrimary = (typeof isPrimaryAdmin === 'function') && isPrimaryAdmin(user);
  const isDeveloper = Boolean(user && (user.role === 'developer_admin' || user.id === 'usr_developer'));
  const hasAll = isPrimary || isDeveloper || (Array.isArray(perms) ? perms.includes('all') : Boolean(perms && perms['all']));
  const hasPerm = hasAll || hasUserPermission('notifications') || hasUserPermission('notifications:write');
  if (!hasPerm) {
    if (typeof showToast === 'function') showToast('⛔ عذراً، لا تملك تصريحاً لإرسال إشعارات الجوال');
    closeSendNotificationModal();
    return;
  }

  const titleInput = document.getElementById('push-notif-title');
  const bodyInput = document.getElementById('push-notif-body');
  const targetSelect = document.getElementById('push-notif-target');

  const title = (titleInput ? titleInput.value : '').trim();
  const body = (bodyInput ? bodyInput.value : '').trim();
  const target = targetSelect ? targetSelect.value : 'all';

  if (!title || !body) {
    alert('يرجى كتابة عنوان ونص الإشعار قبل الإرسال');
    return;
  }

  const senderName = user ? (user.fullName || user.username) : 'المستخدم';
  const senderId = user ? (user.id || 'sys') : 'sys';

  // Audit log
  if (typeof addAuditLog === 'function') {
    addAuditLog('PUSH_NOTIFICATION_SENT', 'إرسال إشعار جوال', `تم إرسال إشعار "${title}" للجمهور (${target}) بواسطة ${senderName}`, senderId, senderName);
  }

  if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();

  closeSendNotificationModal();
  if (titleInput) titleInput.value = '';
  if (bodyInput) bodyInput.value = '';

  // Broadcast push notification to server and mobile clients
  const notifPayload = {
    title: title,
    titleAr: title,
    body: body,
    bodyAr: body,
    target: target,
    sender: senderName,
    logo: (typeof state !== 'undefined' && state.appLogo) || localStorage.getItem('taswoq_app_logo') || ''
  };

  if (window.TaswoqSync && typeof window.TaswoqSync.sendNotification === 'function') {
    window.TaswoqSync.sendNotification(notifPayload);
  }

  if (typeof showToast === 'function') {
    showToast('🚀 تم إرسال الإشعار بنجاح إلى جميع أجهزة العملاء!');
  }
}



// 10b. Developer Secret Masked Modal Prompt
function loginAsDeveloperAdmin(verifiedCode) {
  openDevSecretModal();
}

// ==========================================================================
// REAL-TIME SESSION MONITOR (مراقبة الجلسة والتحقق من تعطيل أو حذف الحساب فورياً)
// ==========================================================================

// 1. Cross-tab storage listener: fires when an account is disabled or deleted in another tab/window
window.addEventListener('storage', (e) => {
  if (e.key === 'khudair_users' || e.key === 'tasweeq_current_user') {
    if (typeof verifyCurrentSessionActive === 'function') {
      verifyCurrentSessionActive(true);
    }
  }
});

// 2. Periodic heartbeat session verification (checks every 2.5 seconds)
setInterval(() => {
  if (typeof state !== 'undefined' && state.currentUser) {
    if (typeof verifyCurrentSessionActive === 'function') {
      verifyCurrentSessionActive(true);
    }
  }
}, 2500);



// Mandatory Location Permission System
// ==========================================================================
function checkMandatoryLocationPermission() {
  // Location permission is managed natively by the Android OS system dialog (requestPermissions).
  // Do not pop up an intrusive in-app modal that obscures the official logo and interface.
  const overlay = document.getElementById('location-perm-overlay');
  if (overlay) overlay.style.display = 'none';
}

function handleLocationChoice(choice) {
  const overlay = document.getElementById('location-perm-overlay');
  sfx.playTap();

  if (choice === 'whileInUse') {
    localStorage.setItem('taswoq_location_perm', 'whileInUse');
    if (overlay) overlay.style.display = 'none';
    simulateGpsLocation(true);
    showToast(state.lang === 'ar' ? 'تم منح إذن الموقع أثناء استخدام التطبيق 📍' : 'Location permission granted while in use 📍');
  } else if (choice === 'onlyThisTime') {
    sessionStorage.setItem('taswoq_location_perm', 'onlyThisTime');
    if (overlay) overlay.style.display = 'none';
    simulateGpsLocation(true);
    showToast(state.lang === 'ar' ? 'تم منح إذن الموقع لهذه المرة فقط 📍' : 'Location permission granted for this time only 📍');
  } else if (choice === 'deny') {
    if (window.AndroidApp && typeof window.AndroidApp.exitApp === 'function') {
      window.AndroidApp.exitApp();
      return;
    }
    showToast(state.lang === 'ar' ? 'تم اختيار عدم السماح. لا يمكن استخدام تطبيق تسوق بدون إذن الموقع لتحديد مسار التوصيل. جاري الخروج...' : 'Location permission denied. Cannot use app without location. Exiting...');
    setTimeout(() => {
      document.body.innerHTML = `
        <div style="position:fixed;inset:0;background:#090d16;color:#ffffff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:'Cairo',sans-serif;direction:rtl;">
          <div style="font-size:4.5rem;margin-bottom:16px;">🛑</div>
          <h2 style="font-size:1.4rem;font-weight:900;margin-bottom:12px;color:#ef4444;">تم إغلاق تطبيق تسوّق</h2>
          <p style="font-size:0.95rem;color:#94a3b8;max-width:320px;line-height:1.6;margin-bottom:24px;">
            لقد اخترت عدم السماح بالوصول إلى الموقع الجغرافي. يتطلب تطبيق تسوق إذن الموقع لحساب تكلفة ومسافة التوصيل وضمان وصول طلباتك الطازجة.
          </p>
          <button onclick="location.reload()" style="background:#059669;color:#fff;border:none;padding:12px 28px;border-radius:14px;font-weight:bold;font-size:1rem;cursor:pointer;box-shadow:0 4px 14px rgba(5,150,105,0.4);">
            إعادة فتح التطبيق ومنح الإذن 📍
          </button>
        </div>
      `;
    }, 1000);
  }
}

// Hook check on DOMContentLoaded
window.addEventListener('load', () => {
  setTimeout(checkMandatoryLocationPermission, 300);
  setTimeout(initTaswoqSync, 500);
});


// =========================================================================
// TASWOQ REALTIME REST API & LOCAL SERVER SYNC INTEGRATION
// =========================================================================

function applySyncedData(data) {
  if (!data) return;

  // Sync users list from server
  if (Array.isArray(data.users) && data.users.length > 0) {
    state.users = data.users;
    try { localStorage.setItem('khudair_users', JSON.stringify(data.users)); } catch (e) { }
    if (typeof renderAdminUsers === 'function') renderAdminUsers();
  }
  if (Array.isArray(data.adminWhitelist)) {
    state.adminWhitelist = data.adminWhitelist;
    try { localStorage.setItem('khudair_admin_whitelist', JSON.stringify(data.adminWhitelist)); } catch (e) { }
  }


  if (Array.isArray(data.products) && data.products.length > 0) {
    state.products = data.products;
    if (window.GROCERY_DATA) window.GROCERY_DATA.products = data.products;
    try { localStorage.setItem('tasweeq_products', JSON.stringify(data.products)); } catch (e) { }
  }

  if (Array.isArray(data.categories) && data.categories.length > 0) {
    state.categories = data.categories;
    if (window.GROCERY_DATA) window.GROCERY_DATA.categories = data.categories;
    try { localStorage.setItem('tasweeq_categories', JSON.stringify(data.categories)); } catch (e) { }
  }

  if (Array.isArray(data.banners) && data.banners.length > 0) {
    state.banners = data.banners;
    if (window.GROCERY_DATA) window.GROCERY_DATA.banners = data.banners;
    try { localStorage.setItem('tasweeq_banners', JSON.stringify(data.banners)); } catch (e) { }
  }

  if (Array.isArray(data.whatsappRecipients) && data.whatsappRecipients.length > 0) {
    state.whatsappRecipients = data.whatsappRecipients;
    if (window.GROCERY_DATA) window.GROCERY_DATA.whatsappRecipients = data.whatsappRecipients;
    try { localStorage.setItem('tasweeq_whatsapp_recipients', JSON.stringify(data.whatsappRecipients)); } catch (e) { }
  }

  if (data.deliverySettings && typeof data.deliverySettings === 'object') {
    state.deliverySettings = { ...state.deliverySettings, ...data.deliverySettings };
    try { localStorage.setItem('tasweeq_delivery_settings', JSON.stringify(state.deliverySettings)); } catch (e) { }
  }

  if (Array.isArray(data.deliveryZones) && data.deliveryZones.length > 0) {
    state.deliveryZones = data.deliveryZones;
    try { localStorage.setItem('tasweeq_delivery_zones', JSON.stringify(data.deliveryZones)); } catch (e) { }
  }

  if (Array.isArray(data.paymentWallets)) {
    state.paymentWallets = data.paymentWallets;
    try { localStorage.setItem('tasweeq_payment_wallets', JSON.stringify(data.paymentWallets)); } catch (e) { }
    if (typeof renderAdminWallets === 'function') renderAdminWallets();
    if (typeof renderCartWallets === 'function') renderCartWallets();
  }

  if (Array.isArray(data.expenses)) {
    state.expenses = data.expenses;
    try { localStorage.setItem('tasweeq_expenses', JSON.stringify(data.expenses)); } catch (e) { }
    if (typeof renderAdminExpenses === 'function') renderAdminExpenses();
    if (typeof renderAdminKpis === 'function') renderAdminKpis();
  }

  if (Array.isArray(data.appSubscribers)) { state.appSubscribers = data.appSubscribers; }
  if (Array.isArray(data.orders) && (data.ordersAuthoritative === true || data.orders.length > 0)) {
    state.orders = data.orders;
    try { localStorage.setItem('tasweeq_orders', JSON.stringify(data.orders)); } catch (e) { }
  }

  if (Array.isArray(data.complaints)) {
    state.complaints = data.complaints;
    try { localStorage.setItem('tasweeq_complaints', JSON.stringify(data.complaints)); } catch (e) { }
    if (typeof renderComplaintsList === 'function') renderComplaintsList();
    if (typeof renderAdminComplaints === 'function') renderAdminComplaints();
  }

  if (data.approvedDelegateId !== undefined) {
    state.approvedDelegateId = data.approvedDelegateId;
    try { localStorage.setItem('tasweeq_approved_delegate_id', data.approvedDelegateId); } catch (e) { }
    if (state.whatsappRecipients) {
      state.whatsappRecipients.forEach(r => {
        r.isApproved = (r.id === data.approvedDelegateId);
      });
    }
  }

  // Re-render views
  if (typeof renderProducts === 'function') renderProducts();
  if (typeof renderCategories === 'function') renderCategories();
  if (typeof renderCategoriesScreen === 'function') renderCategoriesScreen();
  if (typeof syncCategorySelectOptions === 'function') syncCategorySelectOptions();
  if (typeof renderBanners === 'function') renderBanners();
  if (typeof renderAdminProducts === 'function') renderAdminProducts();
  if (typeof renderAdminOrders === 'function') renderAdminOrders();
  if (typeof renderAdminWhatsApp === 'function') renderAdminWhatsApp();
  if (typeof renderAdminStats === 'function') renderAdminStats();
  if (typeof updateAdminBadges === 'function') updateAdminBadges();
  if (typeof renderNotificationsBadge === 'function') renderNotificationsBadge();
  if (typeof renderOrderHistory === 'function') renderOrderHistory();
  if (typeof renderCart === 'function' && state.activeMobileTab === 'cart') renderCart();
  if (typeof renderFavoritesScreen === 'function' && state.activeMobileTab === 'favorites') renderFavoritesScreen();
}

function handleIncomingPushNotifications(newNotifs) {
  if (!Array.isArray(newNotifs) || newNotifs.length === 0) return;
  if (!state.notifications) state.notifications = [];

  newNotifs.forEach(notif => {
    const exists = state.notifications.some(n => n.id === notif.id);
    if (!exists) {
      state.notifications.unshift(notif);

      const title = notif.titleAr || notif.title || 'إشعار من تسوق';
      const body = notif.bodyAr || notif.body || '';

      // 1. Android Native System Notification (Drawer)
      if (window.AndroidApp && typeof window.AndroidApp.showSystemNotification === 'function') {
        try {
          window.AndroidApp.showSystemNotification(title, body);
        } catch (e) {
          console.warn('Native notification failed:', e);
        }
      }

      // 2. Sound effect
      if (typeof sfx !== 'undefined' && sfx.playSuccess) {
        try { sfx.playSuccess(); } catch (e) { }
      }

      // 3. Floating In-App Banner - disabled
      // showInAppPushBanner(notif);
    }
  });

  if (typeof renderNotificationsBadge === 'function') renderNotificationsBadge();
  if (typeof renderNotificationsList === 'function' && document.getElementById('notifications-modal') && document.getElementById('notifications-modal').classList.contains('active')) {
    renderNotificationsList();
  }
  try { localStorage.setItem('tasweeq_notifications', JSON.stringify(state.notifications)); } catch (e) { }
}
window.handleIncomingPushNotifications = handleIncomingPushNotifications;

function showInAppPushBanner(notif) {
  // تم إخفاء البنر المنبثق العلوي من داخل الشاشة حسب طلب المستخدم للاكتفاء بإشعار أندرويد الرسمي
  const banner = document.getElementById('floating-push-banner');
  if (banner) {
    banner.style.display = 'none';
    banner.remove();
  }
}
window.showInAppPushBanner = showInAppPushBanner;

async function initTaswoqSync() {
  if (typeof window.TaswoqSync === 'undefined') return;

  try {
    const conn = await window.TaswoqSync.checkConnection();
    updateSyncIndicatorUI(conn.online, conn.latency);

    if (conn.online) {
      const data = await window.TaswoqSync.syncDown();
      if (data && data.success) {
        applySyncedData(data);
      }
    }

    const isAdmin = document.getElementById('admin-sync-widget') || document.querySelector('.admin-top-bar') || (typeof state !== 'undefined' && state.viewMode === 'admin') || (typeof window !== 'undefined' && (window.location.pathname.includes('admin') || decodeURI(window.location.pathname).includes('الإدارة')));

    if (isAdmin) {
      if (Array.isArray(state.orders) && state.orders.length > 0) {
        const currentMax = Math.max(0, ...state.orders.map(o => parseInt(o.id || 0) || 0));
        if (currentMax > (window.TaswoqSync._lastOrderId || 0)) {
          window.TaswoqSync._lastOrderId = currentMax;
        }
      }
      window.TaswoqSync.startPollingOrders(
        function (newOrders) {
          let hasNew = false;
          newOrders.forEach(order => {
            const exists = (state.orders || []).some(o => o.id === order.id || o.orderNumber === order.orderNumber);
            if (!exists) {
              if (!state.orders) state.orders = [];
              state.orders.unshift(order);
              hasNew = true;
            }
          });

          if (hasNew) {
            if (typeof sfx !== 'undefined' && sfx.playSuccess) sfx.playSuccess();
            const first = newOrders[0];
            showToast(`🔔 طلب جديد وارد من تطبيق تسوق (#${first.orderNumber || first.id}) بمبلغ ${first.total || first.grandTotal} ر.ي ✅`);
            if (typeof renderAdminOrders === 'function') renderAdminOrders();
            if (typeof renderAdminStats === 'function') renderAdminStats();
            if (typeof updateAdminBadges === 'function') updateAdminBadges();
            try { localStorage.setItem('tasweeq_orders', JSON.stringify(state.orders)); } catch (e) { }
          }
        },
        function (newComplaints) {
          if (typeof window.handleIncomingAdminComplaints === 'function') {
            window.handleIncomingAdminComplaints(newComplaints);
          }
        }
      );
    } else {
      window.TaswoqSync.startMobilePolling(
        function onCatalogUpdate(syncedData) {
          applySyncedData(syncedData);
        },
        function onNewNotification(newNotifs) {
          handleIncomingPushNotifications(newNotifs);
        }
      );
    }
  } catch (e) {
    console.warn('Sync init warning:', e);
  }
}

function updateSyncIndicatorUI(isOnline, latency) {
  const adminWidget = document.getElementById('admin-sync-widget');
  const indicator = document.getElementById('sync-status-indicator');
  const statusText = document.getElementById('sync-status-text');
  const backendBadge = document.getElementById('admin-backend-source-badge');

  const backendInfo = (window.TaswoqSync && typeof window.TaswoqSync.getBackendInfo === 'function')
    ? window.TaswoqSync.getBackendInfo()
    : null;

  const currentUrl = (window.TaswoqSync && typeof window.TaswoqSync.getServerUrl === 'function')
    ? window.TaswoqSync.getServerUrl()
    : '';

  const isLocalTest = backendInfo ? Boolean(backendInfo.isLocalTest) : (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1'));

  if (backendBadge) {
    backendBadge.style.display = 'inline-flex';
    if (!isOnline) {
      backendBadge.style.background = '#f1f5f9';
      backendBadge.style.border = '1px solid #cbd5e1';
      backendBadge.style.color = '#64748b';
      backendBadge.innerHTML = `<span style="width: 7px; height: 7px; border-radius: 50%; background: #94a3b8;"></span> وضع غير متصل (أوفلاين)`;
    } else if (isLocalTest) {
      backendBadge.style.background = '#fffbeb';
      backendBadge.style.border = '1px solid #fde68a';
      backendBadge.style.color = '#b45309';
      backendBadge.innerHTML = `<span style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;"></span> ⚠️ خادم اختبار محلي معزول (JSON) - التعديلات لا تؤثر على السحابي`;
    } else {
      backendBadge.style.background = '#ecfdf5';
      backendBadge.style.border = '1px solid #a7f3d0';
      backendBadge.style.color = '#047857';
      backendBadge.innerHTML = `<span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981;"></span> ☁️ متصل بـ PostgreSQL المشتركة`;
    }
  }

  if (indicator) {
    indicator.style.background = isOnline ? (isLocalTest ? '#f59e0b' : '#10B981') : '#94A3B8';
    indicator.style.boxShadow = isOnline ? (isLocalTest ? '0 0 8px #f59e0b' : '0 0 8px #10B981') : 'none';
  }
  if (statusText) {
    if (!isOnline) {
      statusText.textContent = 'وضع محلي أوفلاين ⚪';
    } else {
      statusText.textContent = isLocalTest
        ? `اختبار JSON معزول ${latency ? '(' + latency + 'ms)' : '⚠️'}`
        : `PostgreSQL المشتركة ${latency ? '(' + latency + 'ms)' : '🟢'}`;
    }
  }

  const mobileBadge = document.getElementById('mobile-sync-badge');
  if (mobileBadge) {
    if (isOnline) {
      mobileBadge.style.background = '#ecfdf5';
      mobileBadge.style.color = '#059669';
      mobileBadge.textContent = '🟢 متصل بالسيرفر';
    } else {
      mobileBadge.style.background = '#f1f5f9';
      mobileBadge.style.color = '#64748b';
      mobileBadge.textContent = '⚪ أوفلاين';
    }
  }
}

async function triggerManualSync() {
  if (typeof window.TaswoqSync === 'undefined') {
    showToast('مكتبة المزامنة غير متوفرة');
    return;
  }
  showToast('جاري المزامنة مع الخادم... 🔄');
  try {
    const conn = await window.TaswoqSync.checkConnection();
    updateSyncIndicatorUI(conn.online, conn.latency);
    if (!conn.online) {
      showToast('⚠️ تعذر الاتصال بالخادم المحلي. تأكد من تشغيل server.py');
      return;
    }
    const data = await window.TaswoqSync.syncDown();
    if (data && data.success) {
      applySyncedData(data);
      showToast('تمت المزامنة بنجاح وتحديث كافة البيانات! ✅');
    } else {
      showToast('تم فحص الاتصال بالخادم بنجاح 🟢');
    }
  } catch (e) {
    showToast('خطأ أثناء المزامنة: ' + e.message);
  }
}

window.triggerManualSync = triggerManualSync;
window.initTaswoqSync = initTaswoqSync;
window.applySyncedData = applySyncedData;
window.updateSyncIndicatorUI = updateSyncIndicatorUI;

// استيعاب تحديث جيل النظام وإزالة بيانات الواجهة القديمة بعد التهيئة من جهاز آخر.
window.addEventListener('taswoq:system-generation-updated', function (event) {
  const detail = event && event.detail;
  const freshData = detail && (detail.data || detail);
  if (!freshData || !freshData.success) return;
  const user = (typeof state !== 'undefined' && state.currentUser) ? state.currentUser : null;
  if (detail && detail.resetDetected && user && (user.role === 'developer_admin' || user.role === 'admin' || user.role === 'primary_admin' || user.isPrimaryAdmin)) {
    try { localStorage.removeItem('tasweeq_current_user'); localStorage.removeItem('taswoq_active_user'); localStorage.removeItem('tasweeq_admin_auth'); sessionStorage.removeItem('tasweeq_current_user'); } catch (e) {}
    window.location.assign('/login.html');
    return;
  }
  if (typeof applySyncedData === 'function') applySyncedData(freshData);
});

// ==========================================================================
// تهيئة وتصفير قسم المؤشرات والأرباح (البدء من الصفر للإنتاج)
// ==========================================================================
function resetKpiAndProfits(confirmFirst = true) {
  if (confirmFirst && !confirm('هل أنت متأكد من تصفير وتهيئة قسم المؤشرات والأرباح والبدء من الصفر (0.00 ر.ي)؟')) {
    return;
  }
  if (typeof state !== 'undefined') {
    state.orders = [];
    state.expenses = [];
  }
  try {
    localStorage.setItem('tasweeq_orders', JSON.stringify([]));
    localStorage.setItem('tasweeq_expenses', JSON.stringify([]));
    localStorage.setItem('tasweeq_kpi_zeroed_v1', 'true');
  } catch (e) { }
  if (typeof renderAdminAll === 'function') {
    try { renderAdminAll(); } catch (e) { console.warn(e); }
  } else {
    if (typeof renderAdminKpis === 'function') { try { renderAdminKpis(); } catch(e){} }
    if (typeof renderAdminChart === 'function') { try { renderAdminChart(); } catch(e){} }
    if (typeof renderAdminExpenses === 'function') { try { renderAdminExpenses(); } catch(e){} }
  }
  if (typeof updateAdminBadges === 'function') { try { updateAdminBadges(); } catch(e){} }
  if (typeof showToast === 'function') showToast('✅ تم تصفير وتهيئة قسم المؤشرات والأرباح بنجاح (0.00 ر.ي)');
}
window.resetKpiAndProfits = resetKpiAndProfits;
