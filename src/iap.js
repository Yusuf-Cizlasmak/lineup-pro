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
//
// ★★★ KULLANICI: BURAYI MUTLAKA DOLDUR ★★★
// 1) https://app.revenuecat.com → projeni seç
// 2) Project Settings → API Keys
// 3) Apple key "appl_" ile başlar, Google key "goog_" ile başlar
// 4) Bunları aşağıya yapıştır — yoksa SATIN ALMA ÇALIŞMAZ.
const REVENUECAT_API_KEY = {
  ios:     "appl_tlYOfFKQtBtuktDXQcPysCNZzgw",     // ★ DOLDUR
  android: "goog_JrnXzixnvIUClDpspvYcQMyNear", // ★ DOLDUR
};

// API key'in geçerli olup olmadığını kontrol et (placeholder mı, gerçek mi?)
function _isValidApiKey(key) {
  if (!key || typeof key !== "string") return false;
  if (key.includes("YOUR_")) return false;
  // Apple: appl_..., Google: goog_... — en az 20 karakter olmalı
  return (key.startsWith("appl_") || key.startsWith("goog_")) && key.length > 20;
}

// State: API key'leri eksikse bilelim → daha iyi error mesajı verelim
let _missingApiKey = false;

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
      if (!_isValidApiKey(apiKey)) {
        console.warn(
          `[IAP] ❌ RevenueCat ${platform} API key GEÇERSİZ veya BOŞ — ` +
          `iap.js'de REVENUECAT_API_KEY.${platform} değerini doldur. ` +
          `Satın alma çalışmayacak.`
        );
        _missingApiKey = true;  // ★ purchase() bunu kullanır
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
   *
   * ★ FALLBACK MANTIK: RC dashboard'da bir offering "Current" işaretlenmediyse
   * .current null gelir. Bu durumda .all'dan 'default' veya ilk offering'i kullanırız —
   * böylece kullanıcının her şeyi mükemmel kurması beklenmez.
   */
  async getOfferings() {
    if (!_ready) {
      console.warn("[IAP] getOfferings: SDK hazır değil");
      return null;
    }
    if (_offerings) return _offerings;
    try {
      let result;
      try {
        result = await Purchases.getOfferings();
      } catch (fetchErr) {
        // Google Play / App Store bazen getOfferings'de "not allowed" hatası fırlatır.
        // Bu genellikle: test hesabı Play Console'da "License Tester" olarak eklenmemiş,
        // veya uygulama henüz internal testing track'ine yüklenmemiş demektir.
        // Hatayı NO_OFFERINGS olarak işaretle — caller'a anlamlı mesaj gidsin.
        console.error("[IAP] getOfferings SDK çağrısı başarısız:", fetchErr?.message || fetchErr);
        const e = new Error(
          "Ürün listesi alınamadı. " +
          "Google Play Console'da test hesabının 'License Testers' listesinde olduğundan " +
          "ve uygulamanın internal track'te yayınlandığından emin ol."
        );
        e.code = "NO_OFFERINGS";
        e.original = fetchErr;
        throw e;
      }
      let { current, all } = result;

      // ★ DEBUG: Neyin geldiğini açıkça logla — dashboard sorunlarını teşhis için
      console.log("[IAP] Offerings raw:", {
        hasCurrent: !!current,
        currentId: current?.identifier,
        allKeys: all ? Object.keys(all) : [],
      });

      // ★★ FALLBACK ★★ current yoksa all'dan al
      if (!current && all) {
        const allKeys = Object.keys(all);
        if (all.default) {
          current = all.default;
          console.warn("[IAP] ⚠️ current YOK — 'default' offering'i kullanıyorum (RC dashboard'da 'Make Current' yapman önerilir)");
        } else if (allKeys.length > 0) {
          current = all[allKeys[0]];
          console.warn(`[IAP] ⚠️ current YOK — ilk offering '${allKeys[0]}' kullanılıyor`);
        }
      }

      if (current) {
        const pkgs = current.availablePackages || [];
        console.log(`[IAP] ✓ Offering '${current.identifier}' — ${pkgs.length} paket:`);
        pkgs.forEach((p) => {
          console.log(`  • id=${p.identifier} type=${p.packageType} product=${p.product?.identifier} fiyat=${p.product?.priceString}`);
        });
      } else {
        console.error(
          "[IAP] ❌ Hiçbir offering yok! " +
          "RevenueCat dashboard → Offerings'de hiç offering tanımlı değil veya store ürünleri bağlanmamış."
        );
      }

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

    // ═══════════════════════════════════════════════════════════
    // ★ DEV SIMULATE — Native veya web fark etmez, flag açıksa fake purchase yapar
    // ═══════════════════════════════════════════════════════════
    // Kullanım: localStorage.setItem('hk_dev_simulate', '1')
    // Bu, Google Play Billing / App Store Connect bağlantısı YOKKEN bile
    // paywall akışını sonuna kadar test etmeni sağlar — kullanıcı Pro'ya geçer,
    // success haptic'i çalar, modal kapanır, UI Pro state'ine geçer.
    // Production'a build alırken bu flag'i mutlaka temizle:
    //   localStorage.removeItem('hk_dev_simulate')
    let devSim = false;
    try { devSim = localStorage.getItem("hk_dev_simulate") === "1"; } catch {}
    if (devSim) {
      console.warn(`[IAP] ★ DEV SIMULATE — gerçek satın alma YOK, fake purchase: ${planId}`);
      return _simulatePurchase(planId, meta);
    }

    // Native değilse: gerçek mağaza yok, satın almayı reddet
    if (!Capacitor.isNativePlatform()) {
      const err = new Error(
        "Satın alma sadece App Store ve Google Play'de aktif. " +
        "Uygulamayı mağazadan indirip tekrar deneyin."
      );
      err.code = "WEB_NOT_SUPPORTED";
      throw err;
    }

    // ★★★ KRİTİK FIX ★★★
    // Native cihazda ama _ready false — bu "mobil değil" değil, "yapılandırma eksik" durumu.
    // En yaygın sebep: RevenueCat API key'i iap.js içinde doldurulmamış.
    if (!_ready) {
      if (_missingApiKey) {
        const err = new Error(
          "Satın alma sistemi yapılandırılmamış. RevenueCat API key'lerinin " +
          "iap.js içinde doldurulması gerekiyor. (Geliştiriciye bildirin)"
        );
        err.code = "NOT_CONFIGURED";
        throw err;
      }
      // Tekrar init dene — belki ağ sorunundan başarısız oldu
      console.warn("[IAP] _ready=false — tekrar init deneniyor...");
      await this.init();
      if (!_ready) {
        const err = new Error(
          "Mağaza bağlantısı kurulamadı. İnternet bağlantını kontrol et ve tekrar dene."
        );
        err.code = "NOT_READY";
        throw err;
      }
    }

    try {
      // Offerings'i tazele çek — cache'i bypass et (test/build sonrası RC bazen güncel olmaz)
      _offerings = null;
      const offerings = await this.getOfferings();

      if (!offerings || !offerings.current) {
        console.error("[IAP] ❌ Offerings.current YOK — RevenueCat dashboard'da 'Current' offering set edilmemiş");
        const e = new Error(
          "Ürün listesi alınamadı. RevenueCat'te 'Current Offering' tanımlanmamış olabilir. " +
          "Birkaç dakika sonra tekrar dene."
        );
        e.code = "NO_OFFERINGS";
        throw e;
      }

      const pkg = _findPackage(offerings, planId);
      if (!pkg) {
        // Detaylı debug — kullanıcının log'larında ne olduğunu görelim
        const availableIds = (offerings.current.availablePackages || []).map((p) => p.identifier).join(", ") || "(boş)";
        const e = new Error(
          `Bu paket şu an mağazada bulunamıyor. ` +
          `(Mevcut: ${availableIds || "yok"}) ` +
          `RevenueCat Offerings ayarlarını kontrol et.`
        );
        e.code = "INVALID_PACKAGE";
        throw e;
      }

      console.log("[IAP] Satın alma başlıyor:", { planId, packageId: pkg.identifier, productId: pkg.product?.identifier });

      // ★ NATIVE PAYWALL ekranı buradan açılır ★
      const result = await Purchases.purchasePackage({ aPackage: pkg });

      // Customer info güncellendi → primary sync (entitlement varsa kullanır)
      // fallbackPlanId ile garanti aktivasyon — entitlement gelmemişse paket ID'sine göre aktive eder
      const synced = _syncSubscriptionFromCustomerInfo(result.customerInfo, { fallbackPlanId: planId });

      // Defansif: yine de sync olmadıysa direkt aktive et
      if (!synced) {
        console.warn("[IAP] Sync başarısız — DIRECT aktivasyon");
        const expiresAt = Date.now() + (meta.durationDays || 365) * 86400000;
        activateSubscription({
          tier: TIER.PRO,
          plan: planId,
          expiresAt,
        });
      }

      // Customer info'yu kısa süre sonra TEKRAR çek — RC bazen 1-2 sn gecikmeli geliyor
      setTimeout(async () => {
        try {
          const { customerInfo } = await Purchases.getCustomerInfo();
          _syncSubscriptionFromCustomerInfo(customerInfo, { fallbackPlanId: planId });
        } catch (e) {
          console.warn("[IAP] post-purchase recheck failed:", e);
        }
      }, 1500);

      // Trial ise mark et
      if (meta.isTrial) markTrialUsed();

      return { success: true };
    } catch (err) {
      // NO_OFFERINGS, INVALID_PACKAGE vb. bizim kodlarımızı _normalizeError ezmesin
      const OWN_CODES = ["NO_OFFERINGS","INVALID_PACKAGE","NOT_READY","NOT_CONFIGURED","WEB_NOT_SUPPORTED","USER_CANCELLED"];
      if (err.code && OWN_CODES.includes(err.code)) throw err;
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

function _syncSubscriptionFromCustomerInfo(customerInfo, opts = {}) {
  if (!customerInfo) {
    console.warn("[IAP] sync: customerInfo gelmedi");
    return false;
  }
  const ents = customerInfo.entitlements?.active || {};
  const allEnts = customerInfo.entitlements?.all || {};
  console.log("[IAP] active entitlements:", Object.keys(ents));
  console.log("[IAP] all entitlements:", Object.keys(allEnts));

  // ★ CASE-INSENSITIVE arama — RC dashboard'da 'Pro', 'PRO', 'pro' yazılmış olabilir
  const proKey = Object.keys(ents).find((k) => k.toLowerCase() === "pro");
  let proEnt = proKey ? ents[proKey] : null;

  // Fallback 1: any active entitlement (RC'de farklı isim verilmişse)
  if (!proEnt && Object.keys(ents).length > 0) {
    const firstKey = Object.keys(ents)[0];
    proEnt = ents[firstKey];
    console.warn(`[IAP] 'pro' entitlement yok ama '${firstKey}' aktif — onu kullanıyorum`);
  }

  // Fallback 2: hiç entitlement yok ama az önce başarılı satın alma var → opts.fallbackPlanId
  if (!proEnt && opts.fallbackPlanId) {
    console.warn(`[IAP] entitlement gelmedi ama purchase başarılıydı — fallback ile aktive ediyorum: ${opts.fallbackPlanId}`);
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
    console.log("[IAP] sync: aktif entitlement yok, değişiklik yapılmadı");
    return false;
  }

  // Plan ID belirleme — productIdentifier'dan çıkar
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
    : Date.now() + 30 * 86400000; // güvenlik için 30 gün default

  console.log("[IAP] ✓ Pro aktive ediliyor:", { planId, expiresAt: new Date(expiresAt).toISOString() });

  activateSubscription({
    tier: TIER.PRO,
    plan: planId,
    expiresAt,
  });
  return true;
}

// ═══════════════════════════════════════════════════════════
// PACKAGE FINDING — RevenueCat dashboard'undaki package'ı bulur
// ═══════════════════════════════════════════════════════════
// RevenueCat'te package'lar 3 farklı yolla tanımlanabilir:
//   1) Standart identifier: "$rc_monthly", "$rc_annual" (default)
//   2) Custom identifier:   "monthly", "annual", "pro_monthly" gibi
//   3) packageType:         "MONTHLY", "ANNUAL" (her zaman vardır)
// Biz de hepsini sırayla deneyelim — esnek olalım.
function _findPackage(offerings, planId) {
  if (!offerings?.current) {
    console.warn("[IAP] _findPackage: offerings.current YOK");
    return null;
  }
  const pkgs = offerings.current.availablePackages || [];
  if (pkgs.length === 0) {
    console.warn("[IAP] _findPackage: availablePackages BOŞ — RevenueCat Offerings'i kontrol et");
    return null;
  }

  // Debug: hangi paketler var, görelim
  console.log(
    "[IAP] Mevcut paketler:",
    pkgs.map((p) => ({
      identifier: p.identifier,
      packageType: p.packageType,
      product: p.product?.identifier,
    }))
  );

  const meta = PACKAGE_MAP[planId];
  if (!meta) return null;

  // Strategy 1: tam identifier eşleşmesi (örn. "$rc_monthly")
  let found = pkgs.find((p) => p.identifier === meta.rcIdentifier);
  if (found) {
    console.log(`[IAP] ✓ Paket bulundu (strategy 1: identifier=${meta.rcIdentifier})`);
    return found;
  }

  // Strategy 2: packageType eşleşmesi — RC her package'a otomatik atıyor
  // "MONTHLY" / "ANNUAL" / "WEEKLY" / "LIFETIME" / "TWO_MONTH" / "THREE_MONTH" / "SIX_MONTH" / "CUSTOM"
  const wantedType = planId === "pro_monthly" ? "MONTHLY"
                   : planId === "pro_yearly"  ? "ANNUAL"
                   : planId === "trial_7d"    ? "ANNUAL"   // trial yıllık paketten gider
                   : null;
  if (wantedType) {
    found = pkgs.find((p) =>
      (p.packageType || "").toUpperCase() === wantedType
    );
    if (found) {
      console.log(`[IAP] ✓ Paket bulundu (strategy 2: packageType=${wantedType})`);
      return found;
    }
  }

  // Strategy 3: identifier'da plan adı geçiyor mu (custom isimlendirme — "monthly", "pro_monthly" gibi)
  const keyword = planId === "pro_monthly" ? "month"
                : planId === "pro_yearly"  ? ["year", "annual"]
                : planId === "trial_7d"    ? ["year", "annual"]
                : null;
  if (keyword) {
    const keys = Array.isArray(keyword) ? keyword : [keyword];
    found = pkgs.find((p) => {
      const id = (p.identifier || "").toLowerCase();
      const pid = (p.product?.identifier || "").toLowerCase();
      return keys.some((k) => id.includes(k) || pid.includes(k));
    });
    if (found) {
      console.log(`[IAP] ✓ Paket bulundu (strategy 3: keyword=${keys.join("/")})`);
      return found;
    }
  }

  // Strategy 4: SON ÇARE — tek paket varsa onu kullan
  // (Tek aboneliği olan bir uygulamada kullanıcı yanlış paketi alamaz)
  if (pkgs.length === 1) {
    console.warn("[IAP] ⚠️ Spesifik paket bulunamadı, tek mevcut paketi kullanıyorum");
    return pkgs[0];
  }

  console.error(
    `[IAP] ❌ '${planId}' için paket bulunamadı. ` +
    `RevenueCat Dashboard → Offerings → Current altına ` +
    `${meta.rcIdentifier} (veya "${wantedType}" tipinde bir package) ekle.`
  );
  return null;
}

function _hasAnyActiveEntitlement(customerInfo) {
  const ents = customerInfo?.entitlements?.active || {};
  return Object.keys(ents).length > 0;
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
// SIMULATION — Web preview ve dev test için
// (production'da Capacitor + RevenueCat varsa hiç çağrılmaz —
//  ancak hk_dev_simulate=1 set edildiyse native'de de çalışır)
// ═══════════════════════════════════════════════════════════

function _simulatePurchase(planId, meta) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // ★ DEFAULT: BAŞARILI — geliştirici akışı görsün diye
      // Cancel/fail testlerini istiyorsan localStorage'a flag set et:
      //   localStorage.setItem('hk_force_purchase_fail', 'cancel')  → USER_CANCELLED
      //   localStorage.setItem('hk_force_purchase_fail', 'fail')    → PAYMENT_FAILED
      //   localStorage.removeItem('hk_force_purchase_fail')         → her zaman success
      const forced = (() => {
        try { return localStorage.getItem("hk_force_purchase_fail"); }
        catch { return null; }
      })();

      if (forced === "cancel") {
        const err = new Error("Satın alma iptal edildi");
        err.code = "USER_CANCELLED";
        reject(err);
        return;
      }
      if (forced === "fail") {
        const err = new Error("Ödeme bilgilerin doğrulanamadı (simulate)");
        err.code = "PAYMENT_FAILED";
        reject(err);
        return;
      }

      // Default → SUCCESS
      const expiresAt = Date.now() + meta.durationDays * 86400000;
      activateSubscription({
        tier: meta.tier,
        plan: planId,
        expiresAt,
      });
      if (meta.isTrial) markTrialUsed();
      console.log(`[IAP] ✓ DEV SIMULATE success — Pro aktive edildi (${planId})`);
      resolve({ success: true });
    }, 1200);
  });
}