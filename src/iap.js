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
//
// CALLER FORMAT (PaywallScreen):
//   try {
//     await iap.purchase("pro_yearly");    // ← throw'larsa error.code'a göre davran
//   } catch (err) {
//     if (err.code === "USER_CANCELLED") return;       // sessizce kapat
//     showError(err.message);                          // gerçek hata
//   }
//
// Subscription state şu eventlerle güncellenir:
//   - "hk:subscription-changed" → useSubscription() otomatik refresh olur
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";
import {
  Purchases,
  PURCHASES_ERROR_CODE,
  LOG_LEVEL,
} from "@revenuecat/purchases-capacitor";
import { TIER, activateSubscription, markTrialUsed } from "./subscription";

// ═══ RevenueCat API anahtarlarını buraya yaz ═══
// RevenueCat dashboard → Project Settings → API Keys
// iOS ve Android için AYRI key var; yanlış key → sessiz fail.
const REVENUECAT_API_KEY = {
  ios:     "app836f235ec2",     // ★ DOLDUR
  android: "appb556df2384", // ★ DOLDUR
};

// ═══ Product / package identifier eşleştirmesi ═══
// RevenueCat'te "Offerings" → "Current" altında bu identifier'larla package'lar tanımlı olmalı.
// Hem App Store Connect'te hem de Google Play Console'da product ID'leri eşleşmeli.
const PACKAGE_MAP = {
  pro_monthly: { tier: TIER.PRO, durationDays: 30,  rcIdentifier: "$rc_monthly" },
  pro_yearly:  { tier: TIER.PRO, durationDays: 365, rcIdentifier: "$rc_annual"  },
  trial_7d:    { tier: TIER.PRO, durationDays: 7,   rcIdentifier: "$rc_annual", isTrial: true },
};

let _ready = false;
let _offerings = null;

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
      const platform = Capacitor.getPlatform(); // 'ios' | 'android'
      const apiKey = REVENUECAT_API_KEY[platform];
      if (!apiKey || apiKey.includes("YOUR_")) {
        console.warn("[IAP] API key yok — RevenueCat init atlanıyor");
        return;
      }

      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
      await Purchases.configure({ apiKey });

      // Üye listener: app her açıldığında / abonelik değiştiğinde tetiklenir.
      await Purchases.addCustomerInfoUpdateListener((info) => {
        _syncSubscriptionFromCustomerInfo(info);
      });

      // İlk customer info'yu çek
      const { customerInfo } = await Purchases.getCustomerInfo();
      _syncSubscriptionFromCustomerInfo(customerInfo);

      _ready = true;
      console.log("[IAP] RevenueCat hazır");
    } catch (err) {
      console.error("[IAP] init başarısız:", err);
    }
  },

  isReady() {
    return _ready;
  },

  /**
   * Tüm offerings'leri döner — paywall ekranı bunlardan fiyat çekebilir.
   * Genelde "current" offering kullanılır.
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
      return null;
    }
  },

  /**
   * Bir paketi satın al. Native paywall (App Store / Play Store) açılır.
   *
   * @param {string} planId — "pro_monthly" | "pro_yearly" | "trial_7d"
   * @throws {Error} err.code ∈ { "USER_CANCELLED", "PAYMENT_FAILED", "NOT_READY", "INVALID_PACKAGE" }
   *
   * Başarılıysa subscription state otomatik güncellenir (listener üzerinden).
   */
  async purchase(planId) {
    const meta = PACKAGE_MAP[planId];
    if (!meta) {
      const e = new Error("Geçersiz paket: " + planId);
      e.code = "INVALID_PACKAGE";
      throw e;
    }

    // Native değilse: 
    //   • Varsayılan davranış: WEB_NOT_SUPPORTED throw — kullanıcı gerçek mağaza akışını görmek zorunda kalsın
    //   • Sadece localStorage.setItem('hk_dev_simulate', '1') ile dev simülasyonu aktif olur
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
      const offerings = await this.getOfferings();
      const pkg = _findPackage(offerings, meta.rcIdentifier);
      if (!pkg) {
        const e = new Error("Paket bulunamadı (RevenueCat offerings'i kontrol et)");
        e.code = "INVALID_PACKAGE";
        throw e;
      }

      // ★ NATIVE PAYWALL ekranı buradan açılır ★
      const result = await Purchases.purchasePackage({ aPackage: pkg });

      // Customer info güncellendi → listener otomatik subscription'ı set eder.
      // Yine de defansif kontrol:
      _syncSubscriptionFromCustomerInfo(result.customerInfo);

      // Trial ise mark et
      if (meta.isTrial) markTrialUsed();

      return { success: true };
    } catch (err) {
      throw _normalizeError(err);
    }
  },

  /**
   * Eski satın almaları geri yükle (yeni cihaz / reset sonrası).
   */
  async restore() {
    if (!Capacitor.isNativePlatform() || !_ready) {
      console.log("[IAP] Web/no-RC — restore no-op");
      return { success: false, message: "Native platform değil" };
    }

    try {
      const { customerInfo } = await Purchases.restorePurchases();
      _syncSubscriptionFromCustomerInfo(customerInfo);

      const hasActive = _hasAnyActiveEntitlement(customerInfo);
      return {
        success: true,
        restored: hasActive,
        message: hasActive
          ? "Aboneliğin başarıyla geri yüklendi"
          : "Geri yüklenebilecek aktif abonelik bulunamadı",
      };
    } catch (err) {
      throw _normalizeError(err);
    }
  },

  /**
   * App Store / Play Store abonelik yönetim ekranını aç.
   * Kullanıcı production'da aboneliğini iptal etmek için buraya gider.
   */
  async openSubscriptionManagement() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const platform = Capacitor.getPlatform();
      if (platform === "ios") {
        // iOS: yerleşik yönetim URL'i
        const url = "itms-apps://apps.apple.com/account/subscriptions";
        window.open(url, "_system");
      } else if (platform === "android") {
        // Android: Play Store abonelik sayfası
        // Package name: com.halisahakolik.app
        const url = "https://play.google.com/store/account/subscriptions?package=com.halisahakolik.app";
        window.open(url, "_system");
      }
    } catch (err) {
      console.error("[IAP] openSubscriptionManagement:", err);
    }
  },

  /**
   * Kullanıcıya bağlı user ID — Supabase auth ile birleşince kullan.
   * Default: anonymous (RC otomatik UUID üretir).
   */
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
};

// ═══════════════════════════════════════════════════════════
// INTERNAL — customer info → subscription state senkronu
// ═══════════════════════════════════════════════════════════

function _syncSubscriptionFromCustomerInfo(customerInfo) {
  if (!customerInfo) return;
  const ents = customerInfo.entitlements?.active || {};

  // RevenueCat dashboard'da "pro" entitlement'ı tanımlı olmalı:
  //   "pro" → pro_monthly + pro_yearly paketleri verir
  const proEnt = ents.pro;

  if (!proEnt) {
    // Aktif entitlement yok — local state subscription.js'in expire mantığı ile zaten temizlenir
    return;
  }

  const planId =
    proEnt.productIdentifier?.includes("yearly")  ? "pro_yearly"
    : proEnt.productIdentifier?.includes("monthly") ? "pro_monthly"
    : proEnt.productIdentifier;

  const expiresAt = proEnt.expirationDate
    ? new Date(proEnt.expirationDate).getTime()
    : null;

  activateSubscription({
    tier: TIER.PRO,
    plan: planId,
    expiresAt,
  });
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
  // RevenueCat error code'larını bizim semantiklerimize çevir
  const rcCode = err?.code;
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
    rcCode === PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR
  ) {
    e.code = "PAYMENT_FAILED";
    e.message = "Ödeme yöntemi reddedildi";
  } else if (rcCode === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "App Store / Play Store geçici sorun yaşıyor";
  } else {
    e.code = "PAYMENT_FAILED";
  }

  e.original = err;
  return e;
}

// ═══════════════════════════════════════════════════════════
// SIMULATION — Web preview için
// (production'da Capacitor + RevenueCat varsa hiç çağrılmaz)
// ═══════════════════════════════════════════════════════════

function _simulatePurchase(planId, meta) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Test override: localStorage.setItem('hk_force_purchase_fail', 'fail'|'cancel'|'success')
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