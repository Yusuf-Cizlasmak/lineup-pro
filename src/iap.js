// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · IAP (Minimal)
// ─────────────────────────────────────────────────────────────
// RevenueCat ile native abonelik yönetimi.
//
// ★ v2: "current" offering bağımlılığı kaldırıldı.
//   RC dashboard'da "Make Current" işareti olmadan da çalışır —
//   identifier "default" olan offering'i veya ilk offering'i alır.
//   Paket bulma mantığı 4 stratejiyle agresifleştirildi.
//
// Public API (PaywallScreen aynı kalır):
//   iap.init() / iap.purchase() / iap.restore() / iap.getOfferings()
//   iap.isReady() / iap.openSubscriptionManagement() / iap.logIn() / iap.logOut()
//
// Dev simulate (Apple/Google'a gitmeden test):
//   localStorage.setItem("hk_dev_simulate", "1")
//
// Debug:
//   window.hkIap.state()       — iç durum
//   window.hkIap.offerings()   — ürünler
//   window.hkIap.restore()     — manuel restore
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";
import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { TIER, activateSubscription, markTrialUsed } from "./subscription";

// ═══ Konfigürasyon ═══
const REVENUECAT_API_KEY = {
  ios:     "appl_tlYOfFKQtBtuktDXQcPysCNZzgw",
  android: "goog_JrnXzixnvIUClDpspvYcQMyNear",
};

// Plan ID → RevenueCat paket identifier eşleştirmesi
const PACKAGE_MAP = {
  pro_monthly: { rcId: "$rc_monthly", durationDays: 30,  productId: "pro_monthly" },
  pro_yearly:  { rcId: "$rc_annual",  durationDays: 365, productId: "pro_yearly"  },
  trial_7d:    { rcId: "$rc_annual",  durationDays: 7,   productId: "pro_yearly", isTrial: true },
};

const state = {
  ready: false,
  offering: null,      // ★ Aktif offering (default veya ilk bulunan)
  allOfferings: null,  // ★ Tüm offering'ler (fallback için)
  lastError: null,
};

const log  = (...a) => console.log("[IAP]", ...a);
const warn = (...a) => console.warn("[IAP]", ...a);
const err  = (...a) => console.error("[IAP]", ...a);

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export const iap = {
  async init() {
    if (state.ready) return;

    if (!Capacitor.isNativePlatform()) {
      log("Web platform — IAP devre dışı (simulate mode kullanılabilir)");
      return;
    }

    const platform = Capacitor.getPlatform();
    const apiKey = REVENUECAT_API_KEY[platform];

    if (!apiKey?.startsWith("appl_") && !apiKey?.startsWith("goog_")) {
      err("Geçersiz API key:", platform, apiKey?.slice(0, 8));
      state.lastError = "Invalid API key";
      return;
    }

    try {
      // ★ Debug için VERBOSE — native console'da RC log'ları görünür
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      await Purchases.configure({ apiKey });

      // CustomerInfo değişimlerini otomatik dinle — restore/refund/renewal hepsi buraya gelir
      await Purchases.addCustomerInfoUpdateListener((info) => {
        syncFromCustomerInfo(info);
      });

      // İlk durum çek — eski abonelik varsa burada zaten gelir
      const { customerInfo } = await Purchases.getCustomerInfo();
      syncFromCustomerInfo(customerInfo);

      state.ready = true;
      log("✓ Hazır", platform);
    } catch (e) {
      state.lastError = e?.message || String(e);
      err("init başarısız:", state.lastError);
    }
  },

  isReady() {
    return state.ready;
  },

  // ★ Artık "current" değil — "default" identifier'ını arar, yoksa ilk offering'i alır
  async getOfferings() {
    if (!state.ready) return null;
    if (state.offering) return { offering: state.offering, all: state.allOfferings };

    try {
      const result = await Purchases.getOfferings();
      log("getOfferings raw:", JSON.stringify({
        hasCurrent: !!result.current,
        currentId: result.current?.identifier,
        allKeys: Object.keys(result.all || {}),
      }));

      const all = result.all || {};

      // ★ Öncelik sırası:
      // 1) result.all["default"] — RC'de offering identifier'ı "default" olduğu için
      // 2) result.current — "Current" işareti varsa
      // 3) İlk offering — yedek
      const offering =
        all.default
        || result.current
        || Object.values(all)[0]
        || null;

      if (!offering) {
        warn("Hiç offering bulunamadı! all keys:", Object.keys(all));
        state.lastError = "No offerings available";
        return null;
      }

      log("Offering seçildi:", offering.identifier, "paket sayısı:", offering.availablePackages?.length || 0);

      state.offering = offering;
      state.allOfferings = all;
      return { offering, all };
    } catch (e) {
      err("getOfferings:", e?.message);
      state.lastError = e?.message;
      return null;
    }
  },

  async purchase(planId) {
    const meta = PACKAGE_MAP[planId];
    if (!meta) throw codedError("INVALID_PACKAGE", "Geçersiz paket: " + planId);

    // Dev mode — store'a gitmeden test
    if (isDevSimulate()) return simulate(planId, meta);

    if (!Capacitor.isNativePlatform()) {
      throw codedError("WEB_NOT_SUPPORTED", "Satın alma sadece App Store ve Google Play'de aktif.");
    }

    if (!state.ready) {
      await this.init();
      if (!state.ready) {
        throw codedError("NOT_READY", state.lastError || "Mağaza bağlantısı kurulamadı");
      }
    }

    try {
      // ★ Fresh fetch — eski cache'i temizle
      state.offering = null;
      state.allOfferings = null;
      const result = await this.getOfferings();

      if (!result?.offering) {
        throw codedError("NO_OFFERINGS", "Ürünler şu an yüklenemiyor. Birkaç dakika sonra tekrar dene.");
      }

      const pkg = findPackage(result.offering, planId, result.all);
      if (!pkg) {
        // Debug için ne bulunduğunu da log'la
        const available = (result.offering.availablePackages || []).map(p => ({
          id: p.identifier,
          type: p.packageType,
          product: p.product?.identifier,
        }));
        err("Paket bulunamadı! planId:", planId, "mevcut:", JSON.stringify(available));
        throw codedError("INVALID_PACKAGE", "Bu paket şu an mağazada bulunamıyor.");
      }

      log("Paket seçildi:", pkg.identifier, "→", pkg.product?.identifier);

      // Native paywall açılır
      const purchaseResult = await Purchases.purchasePackage({ aPackage: pkg });

      // Entitlement geldiyse normal sync; gelmezse direct aktivasyon (kullanıcı para verdi)
      const synced = syncFromCustomerInfo(purchaseResult.customerInfo, { fallbackPlanId: planId });
      if (!synced) {
        const expiresAt = Date.now() + meta.durationDays * 86400000;
        activateSubscription({ tier: TIER.PRO, plan: planId, expiresAt });
        warn("Entitlement gelmedi — direct aktivasyon yapıldı");
      }

      if (meta.isTrial) markTrialUsed();

      // 1.5 sn sonra RC'den yeniden çek — bazen webhook gecikiyor
      setTimeout(async () => {
        try {
          const { customerInfo } = await Purchases.getCustomerInfo();
          syncFromCustomerInfo(customerInfo, { fallbackPlanId: planId });
        } catch {}
      }, 1500);

      return { success: true };
    } catch (e) {
      // Bizim attığımız hatalar olduğu gibi geçsin
      if (e.code && ["NO_OFFERINGS", "INVALID_PACKAGE", "NOT_READY", "WEB_NOT_SUPPORTED"].includes(e.code)) {
        throw e;
      }
      throw normalizeError(e);
    }
  },

  async restore() {
    if (!Capacitor.isNativePlatform() || !state.ready) {
      return { success: false, message: "Native değil veya SDK hazır değil" };
    }
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      const synced = syncFromCustomerInfo(customerInfo);
      const hasActive = Object.keys(customerInfo?.entitlements?.active || {}).length > 0;
      return {
        success: true,
        restored: hasActive && synced,
        message: (hasActive && synced)
          ? "Aboneliğin başarıyla geri yüklendi"
          : "Geri yüklenebilecek aktif abonelik bulunamadı",
      };
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async openSubscriptionManagement() {
    if (!Capacitor.isNativePlatform()) return;
    const platform = Capacitor.getPlatform();
    if (platform === "ios") {
      window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
    } else if (platform === "android") {
      window.open("https://play.google.com/store/account/subscriptions?package=com.halisahakolik.app", "_system");
    }
  },

  async logIn(appUserId) {
    if (!Capacitor.isNativePlatform() || !state.ready) return;
    try {
      await Purchases.logIn({ appUserID: appUserId });
    } catch (e) { warn("logIn:", e?.message); }
  },

  async logOut() {
    if (!Capacitor.isNativePlatform() || !state.ready) return;
    try {
      await Purchases.logOut();
    } catch (e) { warn("logOut:", e?.message); }
  },
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function isDevSimulate() {
  try { return localStorage.getItem("hk_dev_simulate") === "1"; }
  catch { return false; }
}

function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ★ 4 stratejiyle paket arar — bir tanesi tutmazsa diğeri tutsun
function findPackage(offering, planId, allOfferings) {
  const meta = PACKAGE_MAP[planId];
  if (!meta) return null;

  // Tüm offering'lerden tüm paketleri topla (default'ta yoksa diğerinde bulabiliriz)
  const allPkgs = [];
  if (offering?.availablePackages) allPkgs.push(...offering.availablePackages);
  if (allOfferings) {
    for (const [key, off] of Object.entries(allOfferings)) {
      if (off === offering) continue; // zaten ekledik
      if (off?.availablePackages) allPkgs.push(...off.availablePackages);
    }
  }

  if (!allPkgs.length) return null;

  // 1) RC identifier exact match ($rc_monthly / $rc_annual)
  let found = allPkgs.find(p => p.identifier === meta.rcId);
  if (found) return found;

  // 2) Package type match (MONTHLY / ANNUAL)
  const wantedType = planId === "pro_monthly" ? "MONTHLY" : "ANNUAL";
  found = allPkgs.find(p => (p.packageType || "").toUpperCase() === wantedType);
  if (found) return found;

  // 3) Product identifier exact match (pro_monthly / pro_yearly)
  found = allPkgs.find(p => p.product?.identifier === meta.productId);
  if (found) return found;

  // 4) Product identifier contains (pro_monthly:proaylik59 gibi Android base plan'lar için)
  found = allPkgs.find(p => (p.product?.identifier || "").startsWith(meta.productId));
  if (found) return found;

  // 5) Tek paket varsa onu kullan
  if (allPkgs.length === 1) return allPkgs[0];

  return null;
}

function syncFromCustomerInfo(customerInfo, opts = {}) {
  if (!customerInfo) return false;

  const active = customerInfo.entitlements?.active || {};

  // 'pro' entitlement öncelikli; yoksa ilk aktif entitlement
  const proKey = Object.keys(active).find(k => k.toLowerCase() === "pro");
  let ent = proKey ? active[proKey] : Object.values(active)[0];

  // Entitlement yok ama satın alma yeni tamamlandıysa direct aktivasyon
  if (!ent && opts.fallbackPlanId) {
    const meta = PACKAGE_MAP[opts.fallbackPlanId];
    const expiresAt = Date.now() + (meta?.durationDays || 365) * 86400000;
    activateSubscription({ tier: TIER.PRO, plan: opts.fallbackPlanId, expiresAt });
    return true;
  }

  if (!ent) return false;

  // Plan ID'yi product identifier'dan tahmin et
  const pid = (ent.productIdentifier || "").toLowerCase();
  let planId = "pro_monthly";
  if (pid.includes("year") || pid.includes("annual") || pid.includes("yearly")) planId = "pro_yearly";
  else if (opts.fallbackPlanId) planId = opts.fallbackPlanId;

  const expiresAt = ent.expirationDate
    ? new Date(ent.expirationDate).getTime()
    : Date.now() + 30 * 86400000;

  log("✓ Pro aktive:", planId, "expires:", new Date(expiresAt).toISOString());
  activateSubscription({ tier: TIER.PRO, plan: planId, expiresAt });
  return true;
}

function normalizeError(error) {
  const rcCode = error?.code;
  const userCancelled = rcCode === "1" || error?.userCancelled === true
    || /cancel/i.test(error?.message || "");

  const out = new Error(error?.message || "Bilinmeyen ödeme hatası");

  if (userCancelled) {
    out.code = "USER_CANCELLED";
    out.message = "Satın alma iptal edildi";
  } else if (/not allowed|billing.*not available/i.test(error?.message || "")) {
    out.code = "PURCHASE_NOT_ALLOWED";
    out.message = "Bu cihaz veya hesap satın alma yapmaya yetkili değil. " +
                  "Mağaza hesabını kontrol et veya uygulamayı resmi mağazadan indir.";
  } else if (/network/i.test(error?.message || "")) {
    out.code = "PAYMENT_FAILED";
    out.message = "Bağlantı sorunu — internet kontrolü yap";
  } else {
    out.code = "PAYMENT_FAILED";
  }

  out.original = error;
  return out;
}

function simulate(planId, meta) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Force fail/cancel için: localStorage.setItem("hk_force_purchase_fail", "fail" | "cancel")
      let forced = null;
      try { forced = localStorage.getItem("hk_force_purchase_fail"); } catch {}

      if (forced === "cancel") {
        reject(codedError("USER_CANCELLED", "Satın alma iptal edildi"));
        return;
      }
      if (forced === "fail") {
        reject(codedError("PAYMENT_FAILED", "Ödeme bilgilerin doğrulanamadı (simulate)"));
        return;
      }

      const expiresAt = Date.now() + meta.durationDays * 86400000;
      activateSubscription({ tier: TIER.PRO, plan: planId, expiresAt });
      if (meta.isTrial) markTrialUsed();
      log("✓ DEV SIMULATE success —", planId);
      resolve({ success: true });
    }, 800);
  });
}

// ═══════════════════════════════════════════════════════════
// DEBUG INTERFACE (minimal)
// ═══════════════════════════════════════════════════════════
if (typeof window !== "undefined") {
  window.hkIap = {
    state: () => ({ ...state, platform: Capacitor.getPlatform() }),
    offerings: () => {
      state.offering = null;
      state.allOfferings = null;
      return iap.getOfferings();
    },
    restore: () => iap.restore(),
    purchase: (planId) => iap.purchase(planId),
    customerInfo: async () => {
      if (!state.ready) return null;
      const { customerInfo } = await Purchases.getCustomerInfo();
      return customerInfo;
    },
  };
}