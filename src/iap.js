// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · IAP (In-App Purchase) Wrapper
// ─────────────────────────────────────────────────────────────
// RevenueCat üzerinden Google Play + App Store satın almaları yönetir.
// Tek API — platform farkını gizler.
//
// Public API:
//   await iap.init()                       — App boot'unda bir kez (App.js)
//   const offerings = await iap.getOfferings()
//   const prices = await iap.getPlanPrices() — mağazanın gerçek fiyatları (paywall için)
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
// packageType: RevenueCat dashboard'unda paket custom identifier ile
// tanımlanmışsa bile doğru paketi bulabilmek için ikinci eşleştirme anahtarı.
const PACKAGE_MAP = {
  pro_monthly: { tier: TIER.PRO, durationDays: 30,  rcIdentifier: "$rc_monthly", packageType: "MONTHLY" },
  pro_yearly:  { tier: TIER.PRO, durationDays: 365, rcIdentifier: "$rc_annual",  packageType: "ANNUAL"  },
  trial_7d:    { tier: TIER.PRO, durationDays: 7,   rcIdentifier: "$rc_annual",  packageType: "ANNUAL", isTrial: true },
};

let _ready = false;
let _initPromise = null;
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
    if (_ready) return true;
    if (!Capacitor.isNativePlatform()) {
      console.log("[IAP] Web platform — IAP devre dışı, simülasyon kullanılır");
      return false;
    }
    // ★ Aynı anda gelen çağrılar (App boot + paywall) tek init'i paylaşır
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      const platform = Capacitor.getPlatform();
      const apiKey = REVENUECAT_API_KEY[platform];
      if (!apiKey || apiKey.includes("YOUR_")) {
        _lastInitError = "API key yok";
        console.warn("[IAP] API key yok — RevenueCat init atlanıyor");
        return false;
      }

      try {
        // ★ PRODUCTION: WARN seviyesi — gereksiz log yok, sadece uyarı/hata
        //   Debug için geçici: localStorage.setItem('hk_iap_verbose', '1') → DEBUG
        const verbose = (() => {
          try { return localStorage.getItem("hk_iap_verbose") === "1"; }
          catch { return false; }
        })();
        await Purchases.setLogLevel({ level: verbose ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN });

        // Yarım kalmış bir önceki deneme SDK'yı zaten kurduysa tekrar configure etme
        let configured = false;
        try { configured = (await Purchases.isConfigured())?.isConfigured === true; } catch {}
        if (!configured) await Purchases.configure({ apiKey });
      } catch (err) {
        _lastInitError = err?.message || String(err);
        console.error("[IAP] init başarısız:", err);
        return false;
      }

      // ★ FIX: configure başarılıysa SDK kullanılabilir. Eskiden getCustomerInfo
      //   hata verince (ağ, RC backend) _ready hiç true olmuyordu → iPhone'da
      //   her satın alma "sadece mobil cihazda" hatasıyla reddediliyordu.
      _ready = true;
      _lastInitError = null;
      console.log("[IAP] RevenueCat hazır");

      try {
        await Purchases.addCustomerInfoUpdateListener((info) => {
          _syncSubscriptionFromCustomerInfo(info);
        });
      } catch (err) {
        console.warn("[IAP] customerInfo listener eklenemedi:", err);
      }

      try {
        const { customerInfo } = await Purchases.getCustomerInfo();
        _syncSubscriptionFromCustomerInfo(customerInfo);
      } catch (err) {
        console.warn("[IAP] ilk customerInfo alınamadı (satın alma yine çalışır):", err);
      }

      // Paywall açıldığında fiyatlar hazır olsun
      iap.getOfferings().catch(() => {});
      return true;
    })();

    const ok = await _initPromise;
    if (!ok) _initPromise = null; // sonraki çağrı tekrar denesin
    return ok;
  },

  isReady() {
    return _ready;
  },

  /**
   * Tüm offerings'leri döner. Hata durumunda throw eder.
   * @param {{ force?: boolean }} opts — force: cache'i atla, mağazadan tekrar çek
   */
  async getOfferings({ force = false } = {}) {
    if (!_ready && !(await iap.init())) return null;
    if (_offerings && !force) return _offerings;
    try {
      const { current, all } = await Purchases.getOfferings();
      const result = { current, all };
      // ★ FIX: Boş sonucu cache'leme — App Store ürünleri geç yayılabilir;
      //   eskiden ilk boş cevap app kapanana kadar kalıcı oluyordu.
      if ((current?.availablePackages || []).length > 0) _offerings = result;
      return result;
    } catch (err) {
      console.error("[IAP] getOfferings başarısız:", err);
      const e = _normalizeError(err);
      e._fromOfferings = true;
      throw e;
    }
  },

  /**
   * Paywall için mağazanın GERÇEK fiyatları (App Store / Play'deki TL fiyatı).
   * Native değilse veya ürünler yüklenemediyse null döner → paywall varsayılan
   * fiyatları gösterir.
   * @returns {Promise<null | { pro_monthly?: PlanPrice, pro_yearly?: PlanPrice }>}
   */
  async getPlanPrices() {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const offerings = await iap.getOfferings();
      if (!offerings?.current) return null;
      const out = {};
      ["pro_monthly", "pro_yearly"].forEach((planId) => {
        const product = _findPackage(offerings, PACKAGE_MAP[planId])?.product;
        if (!product?.priceString) return;
        out[planId] = {
          priceString: product.priceString,
          price: product.price,
          currencyCode: product.currencyCode,
          pricePerMonthString: product.pricePerMonthString || null,
          introPrice: product.introPrice || null,
        };
      });
      return Object.keys(out).length ? out : null;
    } catch {
      return null;
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

    if (!Capacitor.isNativePlatform()) {
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

    // ★ FIX: Native'de SDK henüz hazır değilse (boot'ta init yarışı / ağ hatası)
    //   kullanıcıya "web" hatası göstermek yerine init'i burada tekrar dene.
    if (!_ready && !(await iap.init())) {
      const err = new Error(
        "Mağazaya bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene."
      );
      err.code = "NOT_READY";
      err.detail = _lastInitError;
      throw err;
    }

    // iOS Ekran Süresi / Android aile kısıtlaması → net mesaj
    try {
      const r = await Purchases.canMakePayments();
      if (r?.canMakePayments === false) {
        throw _normalizeError({ code: PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR });
      }
    } catch (err) {
      if (err?.code === "BILLING_UNAVAILABLE") throw err;
      // canMakePayments desteklenmiyorsa satın almayı engelleme
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

      let pkg = _findPackage(offerings, meta);
      if (!pkg) {
        // Cache eski olabilir — mağazadan bir kez taze çek
        const fresh = await this.getOfferings({ force: true }).catch(() => null);
        pkg = _findPackage(fresh, meta);
      }
      if (!pkg) {
        const available = (offerings.current.availablePackages || [])
          .map((p) => p.identifier).join(", ") || "yok";
        const e = new Error("Bu paket şu an mevcut değil.");
        e.code = "INVALID_PACKAGE";
        e.detail = `Aranan: ${meta.rcIdentifier} · Mevcut: ${available}`;
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
      // Kendi fırlattığımız (normalize edilmiş) hatalar olduğu gibi geçsin
      if (err?.original || ["NO_OFFERINGS", "INVALID_PACKAGE", "BILLING_UNAVAILABLE"].includes(err?.code)) {
        throw err;
      }
      const e = _normalizeError(err);
      // Bu Apple ID / Google hesabı zaten abone → satın alma yerine geri yükle
      if (e.code === "ALREADY_OWNED") {
        try {
          const r = await this.restore();
          if (r?.restored) return { success: true, restored: true };
        } catch {}
      }
      throw e;
    }
  },

  /**
   * Eski satın almaları geri yükle.
   */
  async restore() {
    if (!Capacitor.isNativePlatform()) {
      console.log("[IAP] Web — restore no-op");
      return { success: false, message: "Native platform değil" };
    }
    if (!_ready && !(await iap.init())) {
      const err = new Error("Mağazaya bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene.");
      err.code = "NOT_READY";
      err.detail = _lastInitError;
      throw err;
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

    if (!_ready) await iap.init();
    out.sdkReady = _ready;
    out.lastInitError = _lastInitError;
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

    const isIOS = out.platform === "ios";

    if (out.canMakePayments === false && isIOS) {
      out.diagnosis.push("❌ canMakePayments=false — bu iPhone'da uygulama içi satın alma kısıtlı.");
      out.suggestions.push(
        "Ayarlar → Ekran Süresi → İçerik ve Gizlilik Kısıtlamaları → iTunes ve App Store Satın Alımları → Uygulama İçi Satın Alma: İzin Ver."
      );
    } else if (out.canMakePayments === false) {
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

      // iOS'ta ürünlerin hiç gelmemesinin en sık sebepleri (App Store Connect tarafı)
      const iosStoreHints = [
        "App Store Connect → İş (Business) → Ücretli Uygulamalar Sözleşmesi (Paid Apps Agreement) 'Etkin' mi? Banka + vergi formları tamam mı?",
        "App Store Connect → Uygulama → Abonelikler: aylık/yıllık ürünler 'Gönderilmeye Hazır' veya 'Onaylandı' durumunda mı? Türkiye fiyatı girilmiş mi?",
        "İlk abonelik ürünleri, uygulama sürümüyle BİRLİKTE incelemeye gönderilmeli (Sürüm sayfası → Uygulama İçi Satın Alımlar ve Abonelikler bölümü).",
        "RevenueCat → Apps → iOS: Bundle ID 'com.halisahakolik.app' mi? In-App Purchase Key (.p8) ve App Store Connect API key yüklü mü?",
        "RevenueCat → Products: App Store ürün ID'leri App Store Connect'tekilerle birebir aynı mı ve 'pro' entitlement'ına bağlı mı?",
      ];

      if (!current) {
        out.diagnosis.push("❌ Current offering YOK. RevenueCat dashboard'da 'Current' olarak işaretlenmiş offering yok.");
        out.suggestions.push(
          "RevenueCat → Project → Offerings → 'default' offering'in solundaki dot'u tıklayıp 'Make Current' yap."
        );
        if (isIOS) out.suggestions.push(...iosStoreHints);
      } else if (out.packages.length === 0) {
        out.diagnosis.push("❌ Current offering var ama içinde paket yok (veya App Store ürünleri döndürmedi).");
        out.suggestions.push(
          "RevenueCat → Offerings → default → Add package → $rc_monthly ve $rc_annual paketlerini ekle."
        );
        if (isIOS) out.suggestions.push(...iosStoreHints);
      } else {
        const needed = ["$rc_monthly", "$rc_annual"];
        const missing = needed.filter(n => !out.packages.find(p => p.identifier === n));
        if (missing.length) {
          out.diagnosis.push("⚠️ Eksik paket: " + missing.join(", "));
        } else {
          out.diagnosis.push("✅ Tüm beklenen paketler mevcut.");
        }

        const noPriceCount = out.packages.filter(p => !p.price).length;
        if (noPriceCount > 0 && isIOS) {
          out.diagnosis.push(`⚠️ ${noPriceCount} paketin fiyatı boş.`);
          out.suggestions.push(...iosStoreHints);
        } else if (noPriceCount > 0) {
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

      if (isIOS) {
        out.suggestions.push(
          "Hata kodu: " + (code ?? "?") + " — RC#11/#23 ise RevenueCat ↔ App Store Connect kimlik bilgileri eksik.",
          "RevenueCat → Apps → iOS → In-App Purchase Key (.p8) + Issuer ID yüklü mü?",
          "App Store Connect → Ücretli Uygulamalar Sözleşmesi etkin mi?"
        );
      } else if (String(code) === "3" || /not allowed|billing unavailable/i.test(e?.message || "")) {
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

  /**
   * diagnose() çıktısını kopyalanabilir düz metne çevirir — paywall'daki
   * "Tanılama raporu" ekranı kullanır (Mac/Web Inspector gerekmeden).
   */
  async diagnoseReport() {
    const d = await iap.diagnose();
    const lines = [
      "HalıSaha-Kolik · IAP tanılama",
      `Tarih: ${new Date().toISOString()}`,
      `Platform: ${d.platform} (native: ${d.isNative})`,
      `API key: ${d.apiKey ?? "-"}`,
      `SDK hazır: ${d.sdkReady}${d.lastInitError ? " · hata: " + d.lastInitError : ""}`,
      `canMakePayments: ${d.canMakePayments}`,
      `Offering: ${d.currentOffering ?? "-"} · tümü: ${Array.isArray(d.offerings) ? d.offerings.join(", ") || "-" : d.offerings ?? "-"}`,
      "Paketler:",
      ...(d.packages.length
        ? d.packages.map((p) => `  • ${p.identifier} → ${p.productId ?? "?"} (${p.price ?? "fiyat yok"})`)
        : ["  (yok)"]),
      `Müşteri: ${typeof d.customerInfo === "string" ? d.customerInfo : JSON.stringify(d.customerInfo)}`,
      "",
      "Teşhis:",
      ...(d.diagnosis.length ? d.diagnosis.map((x) => "  " + x) : ["  -"]),
    ];
    if (d.suggestions.length) {
      lines.push("", "Öneriler:", ...d.suggestions.map((x) => "  → " + x));
    }
    return lines.join("\n");
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

function _findPackage(offerings, meta) {
  const pkgs = offerings?.current?.availablePackages || [];
  if (!pkgs.length || !meta) return null;
  // 1) RevenueCat standart identifier ($rc_monthly / $rc_annual)
  const byId = pkgs.find((p) => p.identifier === meta.rcIdentifier);
  if (byId) return byId;
  // 2) Paket tipi (dashboard'da custom identifier verilmişse)
  const byType = pkgs.find((p) => p.packageType === meta.packageType);
  if (byType) return byType;
  // 3) Ürün id'sinden tahmin (örn. "halisaha_pro_yearly")
  const re = meta.packageType === "ANNUAL" ? /(year|annual|yillik)/i : /(month|aylik)/i;
  return pkgs.find((p) => re.test(p.product?.identifier || "") || re.test(p.identifier || "")) || null;
}

// ═══════════════════════════════════════════════════════════
// ERROR NORMALIZATION
// ═══════════════════════════════════════════════════════════
// RC kodları string gelir ("1", "3"...) ama bazı platformlarda number
// olabiliyor — karşılaştırmayı tek tipe indiriyoruz.

const RC = PURCHASES_ERROR_CODE;

function _normalizeError(err) {
  const rcCode = err?.code == null ? null : String(err.code);
  const msg    = err?.message || "";
  const under  = err?.underlyingErrorMessage || "";
  const combo  = (msg + " " + under).toLowerCase();
  const isIOS  = (() => { try { return Capacitor.getPlatform() === "ios"; } catch { return false; } })();
  const store  = isIOS ? "App Store" : "Google Play";
  const e = new Error(err?.message || "Bilinmeyen ödeme hatası");

  if (rcCode === RC.PURCHASE_CANCELLED_ERROR || err?.userCancelled === true) {
    e.code = "USER_CANCELLED";
    e.message = "Satın alma iptal edildi";
  } else if (rcCode === RC.NETWORK_ERROR || rcCode === RC.PRODUCT_REQUEST_TIMED_OUT_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Bağlantı sorunu — internet kontrolü yap";
  } else if (rcCode === RC.PAYMENT_PENDING_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Ödeme onayı bekliyor — birkaç dakika sonra tekrar dene";
  } else if (
    rcCode === RC.PURCHASE_NOT_ALLOWED_ERROR ||
    /not allowed|billing unavailable|purchasenotallowed/i.test(combo)
  ) {
    e.code = "BILLING_UNAVAILABLE";
    e.message = isIOS
      ? "Bu cihazda App Store satın alımları kapalı.\n\n" +
        "Ayarlar → Ekran Süresi → İçerik ve Gizlilik Kısıtlamaları → " +
        "iTunes ve App Store Satın Alımları → Uygulama İçi Satın Alma: İzin Ver\n\n" +
        "Aile Paylaşımı'nda çocuk hesabıysan 'Satın Almak İçin Sor' onayı gerekir."
      : "Google Play satın almalara izin vermiyor. Sebebi şunlardan biri olabilir:\n" +
        "• Uygulamayı Play Store'dan değil, dosya olarak yüklediysen.\n" +
        "• Google hesabın test/lisans listesinde değilse.\n" +
        "• Cihaz ülkesi ile hesabın ülkesi farklıysa.\n" +
        "• Aile/çocuk hesabı kısıtlaması varsa.\n\n" +
        "Önce uygulamayı Play Store'dan güncelleyip tekrar dene.";
  } else if (rcCode === RC.PRODUCT_ALREADY_PURCHASED_ERROR) {
    e.code = "ALREADY_OWNED";
    e.message = `Bu ${isIOS ? "Apple ID" : "Google hesabı"} ile zaten abonesin. "Satın alımları geri yükle"ye dokun.`;
  } else if (rcCode === RC.RECEIPT_ALREADY_IN_USE_ERROR || rcCode === RC.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = `Bu ${isIOS ? "Apple ID" : "Google hesabı"}ndaki abonelik başka bir kullanıcıya bağlı. "Satın alımları geri yükle"yi dene.`;
  } else if (rcCode === RC.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = `Bu paket şu an ${store}'da satın alınamıyor. Lütfen daha sonra tekrar dene.`;
  } else if (rcCode === RC.INELIGIBLE_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Bu hesap ücretsiz deneme için uygun değil. Normal planla devam edebilirsin.";
  } else if (rcCode === RC.OPERATION_ALREADY_IN_PROGRESS_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Önceki satın alma işlemi hâlâ sürüyor — birkaç saniye bekleyip tekrar dene.";
  } else if (rcCode === RC.PURCHASE_INVALID_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "Ödeme yöntemi reddedildi";
  } else if (rcCode === RC.STORE_PROBLEM_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = `${store} geçici sorun yaşıyor — birkaç dakika sonra tekrar dene`;
  } else if (
    rcCode === RC.CONFIGURATION_ERROR ||
    rcCode === RC.INVALID_CREDENTIALS_ERROR ||
    rcCode === RC.INVALID_APPLE_SUBSCRIPTION_KEY_ERROR
  ) {
    // Geliştirici tarafı: RevenueCat ↔ App Store Connect bağlantısı eksik
    // (In-App Purchase Key / Shared Secret / Paid Apps Agreement). Bkz. docs/IAP_KONTROL_LISTESI.md
    e.code = "NOT_CONFIGURED";
    e.message = "Mağaza yapılandırması eksik. Lütfen daha sonra tekrar dene.";
  } else if (rcCode === RC.OFFLINE_CONNECTION_ERROR) {
    e.code = "PAYMENT_FAILED";
    e.message = "İnternet bağlantısı yok";
  } else {
    e.code = "PAYMENT_FAILED";
  }

  // UI'da küçük "teknik detay" satırı + tanılama raporu için
  e.rcCode = rcCode;
  e.detail = [rcCode != null ? `RC#${rcCode}` : null, under || (e.message !== msg ? msg : null)]
    .filter(Boolean).join(" · ") || null;
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