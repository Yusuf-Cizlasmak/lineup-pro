// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · IAP (DEBUG INSTRUMENTED VERSION)
// ─────────────────────────────────────────────────────────────
// Bu versiyon her adımı detaylı loglar. Chrome Inspect ile bağlanıp
// console'dan şu komutları çalıştırabilirsin:
//
//   await window.hkIap.diagnose()         — Tam tanı raporu (BUNU ÇALIŞTIR)
//   await window.hkIap.getOfferings()     — Raw offerings response
//   await window.hkIap.getCustomerInfo()  — Raw customer info
//   window.hkIap.state()                  — İç state dump
//   await window.hkIap.purchase('pro_monthly')  — Manuel satın alma testi
//   await window.hkIap.restore()          — Manuel restore
//   window.hkIap.logs()                   — Son 100 log
//
// Public API (PaywallScreen aynı kalıyor):
//   iap.init() / iap.purchase() / iap.restore() / iap.getOfferings()
//   iap.isReady() / iap.openSubscriptionManagement() / iap.logIn() / iap.logOut()
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";
import {
  Purchases,
  PURCHASES_ERROR_CODE,
  LOG_LEVEL,
} from "@revenuecat/purchases-capacitor";
import { TIER, activateSubscription, markTrialUsed } from "./subscription";

// ═══ RevenueCat API anahtarları ═══
// iOS: "appl_" ile başlamalı, ~32 karakter
// Android: "goog_" ile başlamalı, ~32 karakter
// YANLIŞ FORMAT → init başarısız, log'da uyarı görürsün
const REVENUECAT_API_KEY = {
  ios:     "appl_tlYOfFKQtBtuktDXQcPysCNZzgw",
  android: "goog_JrnXzixnvIUClDpspvYcQMyNear",
};

// ═══ Plan ↔ paket eşleştirmesi ═══
const PACKAGE_MAP = {
  pro_monthly: { tier: TIER.PRO, durationDays: 30,  rcIdentifier: "$rc_monthly" },
  pro_yearly:  { tier: TIER.PRO, durationDays: 365, rcIdentifier: "$rc_annual"  },
  trial_7d:    { tier: TIER.PRO, durationDays: 7,   rcIdentifier: "$rc_annual", isTrial: true },
};

// ═══ Internal state ═══
const _state = {
  ready: false,
  configured: false,
  apiKeyValid: false,
  platform: null,
  offerings: null,
  lastCustomerInfo: null,
  lastError: null,
  initCallCount: 0,
  purchaseCallCount: 0,
};

// ═══ Log buffer (window.hkIap.logs() ile erişilir) ═══
const _logs = [];
function L(level, label, data) {
  const entry = {
    t: new Date().toISOString().slice(11, 23),
    level,
    label,
    data,
  };
  _logs.push(entry);
  if (_logs.length > 200) _logs.shift();

  const prefix = `[IAP ${entry.t}] ${label}`;
  if (data !== undefined) {
    if (level === "error") console.error(prefix, data);
    else if (level === "warn") console.warn(prefix, data);
    else console.log(prefix, data);
  } else {
    if (level === "error") console.error(prefix);
    else if (level === "warn") console.warn(prefix);
    else console.log(prefix);
  }
}

// ═══ API key doğrulama ═══
function _isValidApiKey(key) {
  if (!key || typeof key !== "string") return { valid: false, reason: "boş veya string değil" };
  if (key.includes("YOUR_")) return { valid: false, reason: "placeholder (YOUR_ içeriyor)" };
  if (!key.startsWith("appl_") && !key.startsWith("goog_")) {
    return { valid: false, reason: `prefix 'appl_' veya 'goog_' değil — '${key.slice(0, 6)}...' ile başlıyor` };
  }
  if (key.length < 30) {
    return { valid: false, reason: `çok kısa (${key.length} karakter, minimum 30 olmalı)` };
  }
  return { valid: true, reason: null };
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export const iap = {
  async init() {
    _state.initCallCount++;
    L("info", `init() çağrıldı (#${_state.initCallCount})`);

    if (_state.ready) {
      L("info", "Zaten hazır — init atlanıyor");
      return;
    }

    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();
    _state.platform = platform;
    L("info", `Platform: ${platform} (isNative=${isNative})`);

    if (!isNative) {
      L("info", "Web platform — IAP devre dışı, simülasyon kullanılır");
      return;
    }

    try {
      const apiKey = REVENUECAT_API_KEY[platform];
      const masked = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : "(boş)";
      const validation = _isValidApiKey(apiKey);
      _state.apiKeyValid = validation.valid;

      L("info", `API key: ${masked} (uzunluk=${apiKey?.length || 0})`);

      if (!validation.valid) {
        L("error", `❌ API key GEÇERSİZ: ${validation.reason}`);
        L("error", "→ iap.js'de REVENUECAT_API_KEY değerini doğru SDK key ile değiştir");
        L("error", "→ RevenueCat Dashboard → Project Settings → API Keys → 'Public app-specific API key' kopyala");
        _state.lastError = `API key invalid: ${validation.reason}`;
        return;
      }
      L("info", "✓ API key formatı geçerli");

      L("info", "Purchases.setLogLevel(WARN) çağrılıyor...");
      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });

      L("info", "Purchases.configure() çağrılıyor...");
      await Purchases.configure({ apiKey });
      _state.configured = true;
      L("info", "✓ Purchases.configure() başarılı");

      L("info", "CustomerInfo listener ekleniyor...");
      await Purchases.addCustomerInfoUpdateListener((info) => {
        L("info", "🔔 CustomerInfo listener tetiklendi");
        _state.lastCustomerInfo = info;
        _syncSubscriptionFromCustomerInfo(info);
      });

      L("info", "İlk getCustomerInfo() çağrılıyor...");
      const { customerInfo } = await Purchases.getCustomerInfo();
      _state.lastCustomerInfo = customerInfo;
      L("info", `✓ CustomerInfo alındı`, {
        originalAppUserId: customerInfo?.originalAppUserId,
        managementURL: customerInfo?.managementURL ? "(var)" : "(yok)",
        activeEntitlements: Object.keys(customerInfo?.entitlements?.active || {}),
        allEntitlements: Object.keys(customerInfo?.entitlements?.all || {}),
        activeSubscriptions: customerInfo?.activeSubscriptions || [],
        nonSubscriptionTransactions: (customerInfo?.nonSubscriptionTransactions || []).length,
      });

      _syncSubscriptionFromCustomerInfo(customerInfo);

      _state.ready = true;
      L("info", "✅ RevenueCat HAZIR");
    } catch (err) {
      _state.lastError = err?.message || String(err);
      L("error", `❌ init başarısız: ${_state.lastError}`, err);
    }
  },

  isReady() {
    return _state.ready;
  },

  async getOfferings() {
    L("info", "getOfferings() çağrıldı");

    if (!_state.ready) {
      L("warn", "SDK hazır değil — getOfferings null döner");
      return null;
    }
    if (_state.offerings) {
      L("info", "Cache'den offerings dönülüyor");
      return _state.offerings;
    }

    try {
      L("info", "Purchases.getOfferings() native çağrı yapılıyor...");
      let result;
      try {
        result = await Purchases.getOfferings();
      } catch (fetchErr) {
        const msg = fetchErr?.message || String(fetchErr);
        L("error", `❌ Purchases.getOfferings() exception fırlattı: ${msg}`, fetchErr);
        L("error", "→ Olası sebepler: (1) Google Play subscription'lar Active değil " +
                   "(2) Base Plan yok/Inactive (3) Pricing tanımsız (4) APK Play Store'dan değil");
        const e = new Error("Ürün listesi alınamadı: " + msg);
        e.code = "NO_OFFERINGS";
        e.original = fetchErr;
        throw e;
      }

      L("info", "Raw response:", {
        hasCurrent: !!result.current,
        currentIdentifier: result.current?.identifier || null,
        allKeys: result.all ? Object.keys(result.all) : [],
      });

      let { current, all } = result;

      if (!current && all) {
        const keys = Object.keys(all);
        if (all.default) {
          current = all.default;
          L("warn", "current YOK — 'default' offering kullanılıyor (RC'de Make Current yap)");
        } else if (keys.length > 0) {
          current = all[keys[0]];
          L("warn", `current YOK — ilk offering '${keys[0]}' kullanılıyor`);
        }
      }

      if (current) {
        const pkgs = current.availablePackages || [];
        L("info", `✓ Offering '${current.identifier}' — ${pkgs.length} paket bulundu`);
        pkgs.forEach((p, idx) => {
          L("info", `  Paket #${idx + 1}:`, {
            identifier: p.identifier,
            packageType: p.packageType,
            productIdentifier: p.product?.identifier,
            priceString: p.product?.priceString,
            currencyCode: p.product?.currencyCode,
          });
        });
        if (pkgs.length === 0) {
          L("error", "❌ Offering var ama PAKET YOK — RC dashboard'da pakete ürün attach et");
        }
      } else {
        L("error", "❌ Hiçbir offering yok — RC dashboard'da Offerings'i oluştur ve Current yap");
      }

      _state.offerings = { current, all };
      return _state.offerings;
    } catch (err) {
      if (err.code) throw err;
      L("error", `getOfferings genel hata: ${err.message}`, err);
      _state.lastError = err.message;
      return null;
    }
  },

  async purchase(planId) {
    _state.purchaseCallCount++;
    L("info", `═══ purchase('${planId}') ÇAĞRILDI (#${_state.purchaseCallCount}) ═══`);

    const meta = PACKAGE_MAP[planId];
    if (!meta) {
      L("error", `Geçersiz planId: ${planId} — PACKAGE_MAP'te yok`);
      const e = new Error("Geçersiz paket: " + planId);
      e.code = "INVALID_PACKAGE";
      throw e;
    }
    L("info", "Plan meta:", meta);

    let devSim = false;
    try { devSim = localStorage.getItem("hk_dev_simulate") === "1"; } catch {}
    if (devSim) {
      L("warn", "★ DEV SIMULATE aktif — fake purchase");
      return _simulatePurchase(planId, meta);
    }

    if (!Capacitor.isNativePlatform()) {
      L("warn", "Native değil — WEB_NOT_SUPPORTED");
      const err = new Error("Satın alma sadece App Store ve Google Play'de aktif.");
      err.code = "WEB_NOT_SUPPORTED";
      throw err;
    }

    if (!_state.ready) {
      L("warn", "_ready=false — init tekrar deneniyor...");
      await this.init();
      if (!_state.ready) {
        L("error", `init hâlâ başarısız: ${_state.lastError}`);
        const err = new Error(_state.lastError || "Mağaza bağlantısı yok");
        err.code = _state.apiKeyValid ? "NOT_READY" : "NOT_CONFIGURED";
        throw err;
      }
    }

    try {
      L("info", "Offerings cache temizleniyor (fresh fetch için)");
      _state.offerings = null;
      const offerings = await this.getOfferings();

      if (!offerings || !offerings.current) {
        L("error", "Offerings veya current yok");
        const e = new Error("Ürünler şu an yüklenemiyor. Lütfen birkaç dakika sonra tekrar deneyin.");
        e.code = "NO_OFFERINGS";
        throw e;
      }

      const pkg = _findPackage(offerings, planId);
      if (!pkg) {
        const availableIds = (offerings.current.availablePackages || [])
          .map((p) => p.identifier).join(", ") || "(boş)";
        L("error", `Paket '${planId}' bulunamadı. Mevcut: ${availableIds}`);
        const e = new Error(`Bu paket şu an mağazada bulunamıyor. (Mevcut: ${availableIds})`);
        e.code = "INVALID_PACKAGE";
        throw e;
      }

      L("info", "✓ Paket seçildi:", {
        identifier: pkg.identifier,
        packageType: pkg.packageType,
        productId: pkg.product?.identifier,
        price: pkg.product?.priceString,
      });

      L("info", "═══ Purchases.purchasePackage() çağrılıyor — NATIVE PAYWALL açılacak ═══");
      const result = await Purchases.purchasePackage({ aPackage: pkg });
      L("info", "✓ purchasePackage başarılı dönüş aldı");

      const ci = result.customerInfo;
      _state.lastCustomerInfo = ci;
      L("info", "Purchase sonrası CustomerInfo:", {
        activeEntitlements: Object.keys(ci?.entitlements?.active || {}),
        allEntitlements: Object.keys(ci?.entitlements?.all || {}),
        activeSubscriptions: ci?.activeSubscriptions || [],
        productIdentifier: result.productIdentifier,
      });

      const synced = _syncSubscriptionFromCustomerInfo(ci, { fallbackPlanId: planId });

      if (!synced) {
        L("warn", "Entitlement gelmedi ama purchase başarılı — DIRECT aktivasyon yapılıyor");
        const expiresAt = Date.now() + (meta.durationDays || 365) * 86400000;
        activateSubscription({
          tier: TIER.PRO,
          plan: planId,
          expiresAt,
        });
        L("info", `✓ DIRECT activation: planId=${planId}, expiresAt=${new Date(expiresAt).toISOString()}`);
      }

      setTimeout(async () => {
        try {
          L("info", "Post-purchase recheck — getCustomerInfo()");
          const { customerInfo } = await Purchases.getCustomerInfo();
          _state.lastCustomerInfo = customerInfo;
          L("info", "Recheck sonrası entitlements:", {
            active: Object.keys(customerInfo?.entitlements?.active || {}),
            all: Object.keys(customerInfo?.entitlements?.all || {}),
          });
          _syncSubscriptionFromCustomerInfo(customerInfo, { fallbackPlanId: planId });
        } catch (e) {
          L("warn", "Recheck başarısız", e?.message);
        }
      }, 1500);

      if (meta.isTrial) {
        markTrialUsed();
        L("info", "Trial mark edildi");
      }

      L("info", "═══ purchase() BAŞARI ═══");
      return { success: true };
    } catch (err) {
      const OWN_CODES = ["NO_OFFERINGS", "INVALID_PACKAGE", "NOT_READY", "NOT_CONFIGURED", "WEB_NOT_SUPPORTED", "USER_CANCELLED"];
      if (err.code && OWN_CODES.includes(err.code)) {
        L("warn", `purchase fırlattı: ${err.code} — ${err.message}`);
        throw err;
      }
      const normalized = _normalizeError(err);
      L("error", `purchase fail: ${normalized.code} — ${normalized.message}`, err);
      throw normalized;
    }
  },

  async restore() {
    L("info", "restore() çağrıldı");
    if (!Capacitor.isNativePlatform() || !_state.ready) {
      L("warn", "Native değil veya ready değil — restore no-op");
      return { success: false, message: "Native platform değil veya hazır değil" };
    }
    try {
      L("info", "Purchases.restorePurchases() çağrılıyor...");
      const { customerInfo } = await Purchases.restorePurchases();
      _state.lastCustomerInfo = customerInfo;
      L("info", "Restore sonrası:", {
        active: Object.keys(customerInfo?.entitlements?.active || {}),
        all: Object.keys(customerInfo?.entitlements?.all || {}),
      });
      const synced = _syncSubscriptionFromCustomerInfo(customerInfo);
      const hasActive = _hasAnyActiveEntitlement(customerInfo);
      return {
        success: true,
        restored: hasActive && synced,
        message: (hasActive && synced)
          ? "Aboneliğin başarıyla geri yüklendi"
          : "Geri yüklenebilecek aktif abonelik bulunamadı",
      };
    } catch (err) {
      L("error", "restore başarısız", err?.message);
      throw _normalizeError(err);
    }
  },

  async openSubscriptionManagement() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const platform = Capacitor.getPlatform();
      if (platform === "ios") {
        window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
      } else if (platform === "android") {
        window.open("https://play.google.com/store/account/subscriptions?package=com.halisahakolik.app", "_system");
      }
    } catch (err) {
      L("error", "openSubscriptionManagement", err);
    }
  },

  async logIn(appUserId) {
    if (!Capacitor.isNativePlatform() || !_state.ready) return;
    try {
      L("info", `logIn(${appUserId})`);
      await Purchases.logIn({ appUserID: appUserId });
    } catch (err) { L("error", "logIn", err); }
  },

  async logOut() {
    if (!Capacitor.isNativePlatform() || !_state.ready) return;
    try {
      L("info", "logOut()");
      await Purchases.logOut();
    } catch (err) { L("error", "logOut", err); }
  },
};

// ═══════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════
function _syncSubscriptionFromCustomerInfo(customerInfo, opts = {}) {
  if (!customerInfo) {
    L("warn", "sync: customerInfo yok");
    return false;
  }
  const active = customerInfo.entitlements?.active || {};
  const all = customerInfo.entitlements?.all || {};
  L("info", "sync — active entitlements:", Object.keys(active));
  L("info", "sync — all entitlements:", Object.keys(all));

  const proKey = Object.keys(active).find((k) => k.toLowerCase() === "pro");
  let proEnt = proKey ? active[proKey] : null;
  if (proEnt) L("info", `✓ 'pro' entitlement bulundu (key='${proKey}')`);

  if (!proEnt && Object.keys(active).length > 0) {
    const firstKey = Object.keys(active)[0];
    proEnt = active[firstKey];
    L("warn", `'pro' yok ama '${firstKey}' aktif — onu kullanıyorum`);
  }

  if (!proEnt && opts.fallbackPlanId) {
    L("warn", `Hiç entitlement yok ama fallbackPlanId='${opts.fallbackPlanId}' — direct aktivasyon`);
    const meta = PACKAGE_MAP[opts.fallbackPlanId] || PACKAGE_MAP.pro_yearly;
    const expiresAt = Date.now() + (meta.durationDays || 365) * 86400000;
    activateSubscription({
      tier: TIER.PRO,
      plan: opts.fallbackPlanId,
      expiresAt,
    });
    return true;
  }

  if (!proEnt) {
    L("info", "sync: aktif entitlement yok — değişiklik yapılmadı");
    return false;
  }

  const pid = (proEnt.productIdentifier || "").toLowerCase();
  let planId = "pro_monthly";
  if (pid.includes("year") || pid.includes("annual") || pid.includes("yearly")) planId = "pro_yearly";
  else if (pid.includes("month") || pid.includes("monthly")) planId = "pro_monthly";
  else if (opts.fallbackPlanId) planId = opts.fallbackPlanId;

  const expiresAt = proEnt.expirationDate
    ? new Date(proEnt.expirationDate).getTime()
    : Date.now() + 30 * 86400000;

  L("info", `✅ Pro aktive ediliyor:`, {
    planId,
    productId: proEnt.productIdentifier,
    expiresAt: new Date(expiresAt).toISOString(),
  });

  activateSubscription({ tier: TIER.PRO, plan: planId, expiresAt });
  return true;
}

function _findPackage(offerings, planId) {
  if (!offerings?.current) return null;
  const pkgs = offerings.current.availablePackages || [];
  if (pkgs.length === 0) return null;

  const meta = PACKAGE_MAP[planId];
  if (!meta) return null;

  let found = pkgs.find((p) => p.identifier === meta.rcIdentifier);
  if (found) { L("info", `Paket strategy 1: identifier=${meta.rcIdentifier}`); return found; }

  const wantedType = planId === "pro_monthly" ? "MONTHLY"
                   : planId === "pro_yearly"  ? "ANNUAL"
                   : planId === "trial_7d"    ? "ANNUAL"
                   : null;
  if (wantedType) {
    found = pkgs.find((p) => (p.packageType || "").toUpperCase() === wantedType);
    if (found) { L("info", `Paket strategy 2: packageType=${wantedType}`); return found; }
  }

  const keywords = planId === "pro_monthly" ? ["month"]
                 : planId === "pro_yearly"  ? ["year", "annual"]
                 : planId === "trial_7d"    ? ["year", "annual"]
                 : [];
  if (keywords.length) {
    found = pkgs.find((p) => {
      const id = (p.identifier || "").toLowerCase();
      const pid = (p.product?.identifier || "").toLowerCase();
      return keywords.some((k) => id.includes(k) || pid.includes(k));
    });
    if (found) { L("info", `Paket strategy 3: keyword=${keywords.join("/")}`); return found; }
  }

  if (pkgs.length === 1) {
    L("warn", "Spesifik bulunamadı — tek paket kullanılıyor");
    return pkgs[0];
  }

  return null;
}

function _hasAnyActiveEntitlement(customerInfo) {
  return Object.keys(customerInfo?.entitlements?.active || {}).length > 0;
}

function _normalizeError(err) {
  const rcCode = err?.code;
  const e = new Error(err?.message || "Bilinmeyen ödeme hatası");

  if (rcCode === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || rcCode === "1" || err?.userCancelled === true) {
    e.code = "USER_CANCELLED";
    e.message = "Satın alma iptal edildi";
  } else if (rcCode === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Bağlantı sorunu — internet kontrolü yap";
  } else if (rcCode === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Ödeme onayı bekliyor";
  } else if (rcCode === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR || rcCode === PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Ödeme yöntemi reddedildi";
  } else if (rcCode === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Mağaza geçici sorun yaşıyor";
  } else {
    e.code = "PAYMENT_FAILED";
  }
  e.original = err;
  return e;
}

function _simulatePurchase(planId, meta) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const forced = (() => { try { return localStorage.getItem("hk_force_purchase_fail"); } catch { return null; } })();
      if (forced === "cancel") {
        const err = new Error("Satın alma iptal edildi");
        err.code = "USER_CANCELLED";
        reject(err); return;
      }
      if (forced === "fail") {
        const err = new Error("Ödeme bilgilerin doğrulanamadı (simulate)");
        err.code = "PAYMENT_FAILED";
        reject(err); return;
      }
      const expiresAt = Date.now() + meta.durationDays * 86400000;
      activateSubscription({ tier: meta.tier, plan: planId, expiresAt });
      if (meta.isTrial) markTrialUsed();
      L("info", `✓ DEV SIMULATE success — ${planId}`);
      resolve({ success: true });
    }, 1200);
  });
}

// ═══════════════════════════════════════════════════════════
// DEBUG INTERFACE — window.hkIap
// Inspect console'dan kullanım:
//   await window.hkIap.diagnose()
// ═══════════════════════════════════════════════════════════
if (typeof window !== "undefined") {
  window.hkIap = {
    state: () => ({
      ready: _state.ready,
      configured: _state.configured,
      apiKeyValid: _state.apiKeyValid,
      platform: _state.platform,
      hasOfferings: !!_state.offerings,
      initCallCount: _state.initCallCount,
      purchaseCallCount: _state.purchaseCallCount,
      lastError: _state.lastError,
      lastCustomerInfo: _state.lastCustomerInfo ? {
        userId: _state.lastCustomerInfo.originalAppUserId,
        active: Object.keys(_state.lastCustomerInfo.entitlements?.active || {}),
        all: Object.keys(_state.lastCustomerInfo.entitlements?.all || {}),
      } : null,
    }),

    logs: (n = 100) => _logs.slice(-n),

    getOfferings: async () => {
      _state.offerings = null;
      return await iap.getOfferings();
    },

    getCustomerInfo: async () => {
      if (!_state.ready) { console.warn("SDK ready değil — önce init"); return null; }
      const { customerInfo } = await Purchases.getCustomerInfo();
      _state.lastCustomerInfo = customerInfo;
      return customerInfo;
    },

    purchase: (planId) => iap.purchase(planId),
    restore: () => iap.restore(),

    /**
     * Tam tanı raporu — sorunlarını otomatik tespit eder.
     * Inspect console'dan: await window.hkIap.diagnose()
     */
    diagnose: async () => {
      const r = [];
      const push = (icon, line) => { r.push(`${icon} ${line}`); };

      r.push("═══════════════════════════════════════");
      r.push("  IAP DIAGNOSE REPORT");
      r.push("═══════════════════════════════════════");

      const isNative = Capacitor.isNativePlatform();
      const platform = Capacitor.getPlatform();
      if (isNative) push("✓", `Platform: ${platform} (native)`);
      else { push("✗", `Platform: ${platform} (NATIVE DEĞİL — IAP çalışmaz)`); }

      const apiKey = REVENUECAT_API_KEY[platform];
      const validation = _isValidApiKey(apiKey);
      if (validation.valid) push("✓", `API key formatı geçerli: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
      else push("✗", `API key GEÇERSİZ: ${validation.reason}`);

      if (!_state.ready) {
        push("✗", `SDK ready DEĞİL — init başarısız. lastError: ${_state.lastError || "(yok)"}`);
        r.push("");
        r.push("Init başarısız — diğer kontroller atlanıyor.");
        const out = r.join("\n");
        console.log(out);
        return out;
      }
      push("✓", `SDK ready, configured=${_state.configured}`);

      let ci = _state.lastCustomerInfo;
      try {
        const result = await Purchases.getCustomerInfo();
        ci = result.customerInfo;
        _state.lastCustomerInfo = ci;
        push("✓", `CustomerInfo alındı (userId: ${ci.originalAppUserId})`);
      } catch (e) {
        push("✗", `CustomerInfo alınamadı: ${e?.message}`);
      }

      if (ci) {
        const active = Object.keys(ci.entitlements?.active || {});
        const all = Object.keys(ci.entitlements?.all || {});
        push("ℹ", `Active entitlements: ${active.length ? active.join(", ") : "(yok)"}`);
        push("ℹ", `All entitlements (history): ${all.length ? all.join(", ") : "(yok)"}`);
        push("ℹ", `Active subscriptions: ${(ci.activeSubscriptions || []).join(", ") || "(yok)"}`);

        const hasPro = active.some((k) => k.toLowerCase() === "pro");
        if (hasPro) push("✓", "'pro' entitlement aktif — kullanıcı Pro");
        else if (active.length) push("⚠", `'pro' yok ama '${active[0]}' aktif — entitlement adı yanlış olabilir`);
        else push("ℹ", "Hiç aktif entitlement yok (henüz satın alma yapılmamış olabilir)");
      }

      _state.offerings = null;
      try {
        const result = await Purchases.getOfferings();
        const hasCurrent = !!result.current;
        const allKeys = result.all ? Object.keys(result.all) : [];

        if (hasCurrent) push("✓", `Offering current var: '${result.current.identifier}'`);
        else if (allKeys.length) push("⚠", `current YOK ama .all içinde: ${allKeys.join(", ")} → RC'de "Make Current" yap`);
        else push("✗", "Hiçbir offering yok — RC dashboard'da Offerings oluştur");

        const offering = result.current || result.all?.default || (allKeys.length ? result.all[allKeys[0]] : null);
        if (offering) {
          const pkgs = offering.availablePackages || [];
          push("ℹ", `Offering '${offering.identifier}' — ${pkgs.length} paket:`);
          pkgs.forEach((p) => {
            push("  •", `${p.identifier} (${p.packageType}) → ${p.product?.identifier} = ${p.product?.priceString}`);
          });
          if (pkgs.length === 0) push("✗", "Offering boş — paketlere ürün attach et");
        }
      } catch (e) {
        push("✗", `getOfferings exception: ${e?.message}`);
        push("→", "Google Play Console: subscription ürünleri Active mi? Base Plan var ve Active mi? Pricing var mı?");
      }

      r.push("");
      r.push("───────────────────────────────────────");
      r.push("Sonraki adımlar:");
      r.push("  • Sorun varsa yukarıdaki ✗ ve ⚠ satırlarına bak");
      r.push("  • Detaylı log: window.hkIap.logs()");
      r.push("  • Manuel test: await window.hkIap.purchase('pro_monthly')");
      r.push("═══════════════════════════════════════");

      const out = r.join("\n");
      console.log(out);
      return out;
    },
  };
  console.log("[IAP] window.hkIap debug interface hazır — 'await window.hkIap.diagnose()' çalıştır");
}