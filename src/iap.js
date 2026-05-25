// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · IAP (In-App Purchase) Wrapper
// ─────────────────────────────────────────────────────────────
// RevenueCat üzerinden Google Play + App Store satın almaları yönetir.
// Tek API — platform farkını gizler.
//
// Public API:
//   await iap.init()                       — App boot'unda bir kez (App.js)
//   const offerings = await iap.getOfferings()
//   await iap.purchase(packageId)          — packageId: pro_monthly | pro_yearly | trial_7d
//   await iap.restore()                    — Restore Purchases butonu
//   iap.isReady()                          — true ise SDK yüklendi
//   iap.openSubscriptionManagement()       — App Store / Play Store yönetim ekranı
//   await iap.diagnose()                   — Debug için: tam sistem teşhisi
//
// CALLER FORMAT (PaywallScreen):
//   try {
//     await iap.purchase("pro_yearly");
//   } catch (err) {
//     if (err.code === "USER_CANCELLED") return;
//     showError(err.message);
//   }
//
// DEBUG (production'da bile aktifleştirilebilir):
//   localStorage.setItem('hk_debug', '1')   → window.iap expose edilir
//   Sonra DevTools console'dan: await iap.diagnose()
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";
import {
  Purchases,
  PURCHASES_ERROR_CODE,
  LOG_LEVEL,
} from "@revenuecat/purchases-capacitor";
import { TIER, activateSubscription, markTrialUsed } from "./subscription";

// ═══ RevenueCat API anahtarları ═══
const REVENUECAT_API_KEY = {
  ios:     "appl_tlYOfFKQtBtuktDXQcPysCNZzgw",
  android: "goog_JrnXzixnvIUClDpspvYcQMyNear",
};

// ═══ Product / package identifier eşleştirmesi ═══
const PACKAGE_MAP = {
  pro_monthly: { tier: TIER.PRO, durationDays: 30,  rcIdentifier: "$rc_monthly" },
  pro_yearly:  { tier: TIER.PRO, durationDays: 365, rcIdentifier: "$rc_annual"  },
  trial_7d:    { tier: TIER.PRO, durationDays: 7,   rcIdentifier: "$rc_annual", isTrial: true },
};

let _ready = false;
let _offerings = null;
let _lastInitError = null;

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export const iap = {
  /**
   * App boot sırasında BİR KEZ çağrılır.
   * Web'de no-op olur (Capacitor değilse).
   */
  async init() {
    if (_ready) return;
    if (!Capacitor.isNativePlatform()) {
      console.log("[IAP] Web platform — IAP devre dışı, simülasyon kullanılır");
      return;
    }
    try {
      const platform = Capacitor.getPlatform();
      const apiKey = REVENUECAT_API_KEY[platform];
      if (!apiKey || apiKey.includes("YOUR_")) {
        _lastInitError = "API key yok";
        console.warn("[IAP] API key yok — RevenueCat init atlanıyor");
        return;
      }

      // ★ PRODUCTION: WARN seviyesi — gereksiz log yok, sadece uyarı/hata
      //   Debug için geçici: localStorage.setItem('hk_iap_verbose', '1') → DEBUG
      const verbose = (() => {
        try { return localStorage.getItem("hk_iap_verbose") === "1"; }
        catch { return false; }
      })();
      await Purchases.setLogLevel({ level: verbose ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN });
      await Purchases.configure({ apiKey });

      await Purchases.addCustomerInfoUpdateListener((info) => {
        _syncSubscriptionFromCustomerInfo(info);
      });

      const { customerInfo } = await Purchases.getCustomerInfo();
      _syncSubscriptionFromCustomerInfo(customerInfo);

      _ready = true;
      _lastInitError = null;
      console.log("[IAP] RevenueCat hazır");
    } catch (err) {
      _lastInitError = err?.message || String(err);
      console.error("[IAP] init başarısız:", err);
    }
  },

  isReady() {
    return _ready;
  },

  /**
   * Tüm offerings'leri döner. Hata durumunda throw eder.
   */
  async getOfferings() {
    if (!_ready) return null;
    if (_offerings) return _offerings;
    try {
      const { current, all } = await Purchases.getOfferings();
      _offerings = { current, all };
      return _offerings;
    } catch (err) {
      console.error("[IAP] getOfferings başarısız:", err);
      const e = _normalizeError(err);
      e._fromOfferings = true;
      throw e;
    }
  },

  /**
   * Bir paketi satın al. Native paywall açılır.
   *
   * @param {string} planId — "pro_monthly" | "pro_yearly" | "trial_7d"
   * @throws {Error} err.code ∈ {
   *   "USER_CANCELLED", "PAYMENT_FAILED", "BILLING_UNAVAILABLE",
   *   "NOT_READY", "INVALID_PACKAGE", "NO_OFFERINGS",
   *   "NOT_CONFIGURED", "WEB_NOT_SUPPORTED"
   * }
   */
  async purchase(planId) {
    const meta = PACKAGE_MAP[planId];
    if (!meta) {
      const e = new Error("Geçersiz paket: " + planId);
      e.code = "INVALID_PACKAGE";
      throw e;
    }

    if (!Capacitor.isNativePlatform() || !_ready) {
      let devSim = false;
      try { devSim = localStorage.getItem("hk_dev_simulate") === "1"; } catch {}
      if (devSim) {
        return _simulatePurchase(planId, meta);
      }
      const err = new Error(
        "Satın alma sadece App Store ve Google Play'de aktif. " +
        "Uygulamayı mağazadan indirip tekrar deneyin."
      );
      err.code = "WEB_NOT_SUPPORTED";
      throw err;
    }

    try {
      let offerings;
      try {
        offerings = await this.getOfferings();
      } catch (offErr) {
        if (offErr.code === "BILLING_UNAVAILABLE" || offErr.code === "PURCHASE_NOT_ALLOWED") {
          throw offErr;
        }
        const e = new Error(
          "Ürünler yüklenemedi. İnternet bağlantısı veya mağaza ayarlarını kontrol edip tekrar deneyin."
        );
        e.code = "NO_OFFERINGS";
        throw e;
      }

      if (!offerings?.current) {
        const e = new Error(
          "Şu anda satın alınabilir paket yok. Lütfen birkaç dakika sonra tekrar deneyin."
        );
        e.code = "NO_OFFERINGS";
        throw e;
      }

      const pkg = _findPackage(offerings, meta.rcIdentifier);
      if (!pkg) {
        const e = new Error("Bu paket şu an mevcut değil.");
        e.code = "INVALID_PACKAGE";
        throw e;
      }

      // ★ NATIVE PAYWALL ★
      const result = await Purchases.purchasePackage({ aPackage: pkg });

      const synced = _syncSubscriptionFromCustomerInfo(result.customerInfo, { fallbackPlanId: planId });

      if (!synced) {
        console.warn("[IAP] Sync başarısız — DIRECT aktivasyon");
        const expiresAt = Date.now() + (meta.durationDays || 365) * 86400000;
        activateSubscription({
          tier: TIER.PRO,
          plan: planId,
          expiresAt,
        });
      }

      setTimeout(async () => {
        try {
          const { customerInfo } = await Purchases.getCustomerInfo();
          _syncSubscriptionFromCustomerInfo(customerInfo, { fallbackPlanId: planId });
        } catch (e) {
          console.warn("[IAP] post-purchase recheck failed:", e);
        }
      }, 1500);

      if (meta.isTrial) markTrialUsed();

      return { success: true };
    } catch (err) {
      throw _normalizeError(err);
    }
  },

  /**
   * Eski satın almaları geri yükle.
   */
  async restore() {
    if (!Capacitor.isNativePlatform() || !_ready) {
      console.log("[IAP] Web/no-RC — restore no-op");
      return { success: false, message: "Native platform değil" };
    }

    try {
      const { customerInfo } = await Purchases.restorePurchases();
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
      throw _normalizeError(err);
    }
  },

  /**
   * App Store / Play Store abonelik yönetim ekranını aç.
   */
  async openSubscriptionManagement() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const platform = Capacitor.getPlatform();
      if (platform === "ios") {
        const url = "itms-apps://apps.apple.com/account/subscriptions";
        window.open(url, "_system");
      } else if (platform === "android") {
        const url = "https://play.google.com/store/account/subscriptions?package=com.halisahakolik.app";
        window.open(url, "_system");
      }
    } catch (err) {
      console.error("[IAP] openSubscriptionManagement:", err);
    }
  },

  async logIn(appUserId) {
    if (!Capacitor.isNativePlatform() || !_ready) return;
    try {
      await Purchases.logIn({ appUserID: appUserId });
    } catch (err) {
      console.error("[IAP] logIn:", err);
    }
  },

  async logOut() {
    if (!Capacitor.isNativePlatform() || !_ready) return;
    try {
      await Purchases.logOut();
    } catch (err) {
      console.error("[IAP] logOut:", err);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SELF-DIAGNOSTIC — kullanıcı destek için
  // ═══════════════════════════════════════════════════════════
  // Kullanım: kullanıcı sorun bildirirse şunu yapsın:
  //   1) localStorage.setItem('hk_debug', '1') sonra app'i kapatıp aç
  //   2) DevTools console'dan: await iap.diagnose()
  //   3) Çıktıyı kopyalayıp gönderir
  // ═══════════════════════════════════════════════════════════
  async diagnose() {
    const out = {
      platform: null,
      isNative: false,
      apiKey: null,
      sdkReady: false,
      lastInitError: _lastInitError,
      canMakePayments: null,
      offerings: null,
      currentOffering: null,
      packages: [],
      customerInfo: null,
      diagnosis: [],
      suggestions: [],
    };

    out.isNative = Capacitor.isNativePlatform();
    out.platform = Capacitor.getPlatform();

    if (!out.isNative) {
      out.diagnosis.push("ℹ️ Web platformda çalışıyorsun. Gerçek satın alma için APK/IPA gerekli.");
      console.table(out);
      return out;
    }

    const apiKey = REVENUECAT_API_KEY[out.platform];
    out.apiKey = apiKey
      ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)} ✓`
      : "❌ EKSİK";

    if (!apiKey) {
      out.diagnosis.push("❌ KRİTİK: " + out.platform + " için RevenueCat API key tanımlı değil.");
      out.suggestions.push("iap.js içindeki REVENUECAT_API_KEY objesine doğru key'i yaz.");
      console.table(out);
      return out;
    }

    out.sdkReady = _ready;
    if (!_ready) {
      out.diagnosis.push("❌ SDK init edilmedi. Hata: " + (_lastInitError || "bilinmiyor"));
      out.suggestions.push("App.js'te iap.init() çağrılıyor mu? Internet var mı?");
      console.table(out);
      return out;
    }

    try {
      const r = await Purchases.canMakePayments();
      out.canMakePayments = r?.canMakePayments;
    } catch (e) {
      out.canMakePayments = "ERROR: " + (e?.message || String(e));
    }

    if (out.canMakePayments === false) {
      out.diagnosis.push("❌ Cihaz canMakePayments=false döndürüyor. Google Play Billing servisi bu cihazda aktif değil.");
      out.suggestions.push(
        "1) APK'yı Play Store'dan (internal test track'ten) yükle, ADB ile değil.",
        "2) Google hesabını License Tester listesine ekle (Play Console → Settings → License testing).",
        "3) Cihaz ülkesi ↔ Google hesabı ülkesi ↔ Play Store ülkesi aynı mı kontrol et.",
        "4) Emülatör kullanıyorsan, AVD image'i 'Google Play' içeren olmalı ('Google APIs' YETMEZ)."
      );
    }

    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      out.customerInfo = {
        userId: customerInfo?.originalAppUserId,
        activeEntitlements: Object.keys(customerInfo?.entitlements?.active || {}),
        allEntitlements: Object.keys(customerInfo?.entitlements?.all || {}),
      };
    } catch (e) {
      out.customerInfo = "ERROR: " + (e?.message || String(e));
    }

    try {
      const { current, all } = await Purchases.getOfferings();
      out.currentOffering = current?.identifier || "(YOK)";
      out.offerings = Object.keys(all || {});
      out.packages = (current?.availablePackages || []).map(p => ({
        identifier: p.identifier,
        productId: p.product?.identifier,
        price: p.product?.priceString,
        title: p.product?.title,
      }));

      if (!current) {
        out.diagnosis.push("❌ Current offering YOK. RevenueCat dashboard'da 'Current' olarak işaretlenmiş offering yok.");
        out.suggestions.push(
          "RevenueCat → Project → Offerings → 'default' offering'in solundaki dot'u tıklayıp 'Make Current' yap."
        );
      } else if (out.packages.length === 0) {
        out.diagnosis.push("❌ Current offering var ama içinde paket yok.");
        out.suggestions.push(
          "RevenueCat → Offerings → default → Add package → $rc_monthly ve $rc_annual paketlerini ekle."
        );
      } else {
        const needed = ["$rc_monthly", "$rc_annual"];
        const missing = needed.filter(n => !out.packages.find(p => p.identifier === n));
        if (missing.length) {
          out.diagnosis.push("⚠️ Eksik paket: " + missing.join(", "));
        } else {
          out.diagnosis.push("✅ Tüm beklenen paketler mevcut.");
        }

        const noPriceCount = out.packages.filter(p => !p.price).length;
        if (noPriceCount > 0) {
          out.diagnosis.push(`⚠️ ${noPriceCount} paketin fiyatı boş.`);
          out.suggestions.push(
            "1) Play Console → Monetize → Subscriptions → ürünler 'Active' mi?",
            "2) Base plan'ın TR fiyatı girilmiş mi?",
            "3) RC Dashboard → Apps → Android → Service Credentials (JSON) yüklü mü?",
            "4) Aktif ettikten sonra 5-30 dk propagation bekledin mi?"
          );
        }
      }
    } catch (e) {
      const code = e?.code;
      out.offerings = "ERROR: " + (e?.message || String(e));
      out.diagnosis.push(`❌ getOfferings throw etti: ${e?.message}`);

      if (code === 3 || /not allowed|billing unavailable/i.test(e?.message || "")) {
        out.suggestions.push(
          "BILLING_UNAVAILABLE / PURCHASE_NOT_ALLOWED — Google Play satışı reddediyor.",
          "1) APK Play Store'dan değil ADB ile yüklendi — internal test track kullan.",
          "2) Google hesabı License Tester olarak eklenmemiş.",
          "3) Subscription ürünleri Play Console'da 'Active' değil.",
          "4) Base plan'ın TR (cihaz ülkesi) fiyatı yok.",
          "5) Cihaz ↔ Google hesabı ↔ Play Store ülkeleri uyuşmuyor.",
          "6) Play Console'da payments profile (merchant) tamamlanmamış."
        );
      }
    }

    console.log("═══════════ IAP DIAGNOSTIC ═══════════");
    console.log("Platform:", out.platform, "| Native:", out.isNative);
    console.log("API key:", out.apiKey);
    console.log("SDK ready:", out.sdkReady);
    console.log("canMakePayments:", out.canMakePayments);
    console.log("Customer info:", out.customerInfo);
    console.log("Current offering:", out.currentOffering);
    console.log("All offerings:", out.offerings);
    console.log("Packages:", out.packages);
    console.log("───────── DIAGNOSIS ─────────");
    out.diagnosis.forEach(d => console.log(d));
    if (out.suggestions.length) {
      console.log("───────── SUGGESTIONS ─────────");
      out.suggestions.forEach(s => console.log("→", s));
    }
    console.log("═══════════════════════════════════════");
    return out;
  },
};

// ═══════════════════════════════════════════════════════════
// ★ GLOBAL EXPOSE — sadece debug modda
// ═══════════════════════════════════════════════════════════
// Production'da window.iap default olarak EXPOSE DEĞİL.
// Kullanıcı sorun bildirirse:
//   localStorage.setItem('hk_debug', '1')   // App'i kapatıp aç
//   await iap.diagnose()                    // DevTools console'dan
//
// Geliştirme modunda (NODE_ENV !== 'production') otomatik açık.
// ═══════════════════════════════════════════════════════════
try {
  const isDev = (() => {
    try {
      return typeof process !== "undefined"
        && process?.env?.NODE_ENV !== "production";
    } catch { return false; }
  })();
  const debugFlag = (() => {
    try { return localStorage.getItem("hk_debug") === "1"; }
    catch { return false; }
  })();
  if (typeof window !== "undefined" && (isDev || debugFlag)) {
    window.iap = iap;
  }
} catch {}

// ═══════════════════════════════════════════════════════════
// INTERNAL — customer info → subscription state senkronu
// ═══════════════════════════════════════════════════════════

function _syncSubscriptionFromCustomerInfo(customerInfo, opts = {}) {
  if (!customerInfo) {
    console.warn("[IAP] sync: customerInfo gelmedi");
    return false;
  }
  const ents = customerInfo.entitlements?.active || {};

  // CASE-INSENSITIVE arama
  const proKey = Object.keys(ents).find((k) => k.toLowerCase() === "pro");
  let proEnt = proKey ? ents[proKey] : null;

  // Fallback 1: any active entitlement
  if (!proEnt && Object.keys(ents).length > 0) {
    const firstKey = Object.keys(ents)[0];
    proEnt = ents[firstKey];
    console.warn(`[IAP] 'pro' entitlement yok ama '${firstKey}' aktif — onu kullanıyorum`);
  }

  // Fallback 2: hiç entitlement yok ama az önce başarılı satın alma var
  if (!proEnt && opts.fallbackPlanId) {
    console.warn(`[IAP] entitlement gelmedi ama purchase başarılıydı — fallback: ${opts.fallbackPlanId}`);
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
    return false;
  }

  // Plan ID belirleme
  const pid = (proEnt.productIdentifier || "").toLowerCase();
  let planId = "pro_monthly";
  if (pid.includes("year") || pid.includes("annual") || pid.includes("yearly")) {
    planId = "pro_yearly";
  } else if (pid.includes("month") || pid.includes("monthly")) {
    planId = "pro_monthly";
  } else if (opts.fallbackPlanId) {
    planId = opts.fallbackPlanId;
  }

  const expiresAt = proEnt.expirationDate
    ? new Date(proEnt.expirationDate).getTime()
    : Date.now() + 30 * 86400000;

  console.log("[IAP] ✓ Pro aktive:", planId);

  activateSubscription({
    tier: TIER.PRO,
    plan: planId,
    expiresAt,
  });
  return true;
}

function _hasAnyActiveEntitlement(customerInfo) {
  const ents = customerInfo?.entitlements?.active || {};
  return Object.keys(ents).length > 0;
}

function _findPackage(offerings, rcIdentifier) {
  if (!offerings?.current) return null;
  const pkgs = offerings.current.availablePackages || [];
  return pkgs.find((p) => p.identifier === rcIdentifier) || null;
}

// ═══════════════════════════════════════════════════════════
// ERROR NORMALIZATION
// ═══════════════════════════════════════════════════════════

function _normalizeError(err) {
  const rcCode = err?.code;
  const msg    = err?.message || "";
  const under  = err?.underlyingErrorMessage || "";
  const combo  = (msg + " " + under).toLowerCase();
  const e = new Error(err?.message || "Bilinmeyen ödeme hatası");

  if (
    rcCode === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    rcCode === "1" ||
    err?.userCancelled === true
  ) {
    e.code = "USER_CANCELLED";
    e.message = "Satın alma iptal edildi";
  } else if (rcCode === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Bağlantı sorunu — internet kontrolü yap";
  } else if (rcCode === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Ödeme onayı bekliyor — birkaç dakika sonra tekrar dene";
  } else if (
    rcCode === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR ||
    rcCode === 3 || rcCode === "3" ||
    /not allowed|billing unavailable|purchasenotallowed/i.test(combo)
  ) {
    e.code = "BILLING_UNAVAILABLE";
    e.message =
      "Google Play satın almalara izin vermiyor. Sebebi şunlardan biri olabilir:\n" +
      "• Uygulamayı Play Store'dan değil, dosya olarak yüklediysen.\n" +
      "• Google hesabın test/lisans listesinde değilse.\n" +
      "• Cihaz ülkesi ile hesabın ülkesi farklıysa.\n" +
      "• Aile/çocuk hesabı kısıtlaması varsa.\n\n" +
      "Önce uygulamayı Play Store'dan güncelleyip tekrar dene.";
  } else if (rcCode === PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Ödeme yöntemi reddedildi";
  } else if (rcCode === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "App Store / Play Store geçici sorun yaşıyor";
  } else if (rcCode === PURCHASES_ERROR_CODE.CONFIGURATION_ERROR) {
    e.code = "NOT_CONFIGURED";
    e.message = "Uygulama yapılandırması eksik. (Geliştiriciye haber ver)";
  } else if (rcCode === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "İnternet bağlantısı yok";
  } else {
    e.code = "PAYMENT_FAILED";
  }

  e.original = err;
  return e;
}

// ═══════════════════════════════════════════════════════════
// SIMULATION — Web preview için (production'da çağrılmaz)
// ═══════════════════════════════════════════════════════════

function _simulatePurchase(planId, meta) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const forced = (() => {
        try { return localStorage.getItem("hk_force_purchase_fail"); }
        catch { return null; }
      })();
      const r = forced ? null : Math.random();
      const isCancel = forced === "cancel" || (r != null && r < 0.03);
      const isFail   = forced === "fail"   || (r != null && r >= 0.03 && r < 0.15);

      if (isCancel) {
        const err = new Error("Satın alma iptal edildi");
        err.code = "USER_CANCELLED";
        reject(err);
      } else if (isFail) {
        const reasons = [
          "Ödeme bilgilerin doğrulanamadı",
          "Bağlantı sorunu — internet kontrolü",
          "Ödeme yöntemi reddedildi",
        ];
        const err = new Error(reasons[Math.floor(Math.random() * reasons.length)]);
        err.code = "PAYMENT_FAILED";
        reject(err);
      } else {
        const expiresAt = Date.now() + meta.durationDays * 86400000;
        activateSubscription({
          tier: meta.tier,
          plan: planId,
          expiresAt,
        });
        if (meta.isTrial) markTrialUsed();
        resolve({ success: true });
      }
    }, 1800);
  });
}