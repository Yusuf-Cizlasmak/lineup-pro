import React, { useEffect, useState } from "react";
import { PremiumProvider } from "./monetization";
import HalisahaKolik from "./HaliSahaKolik";
import Onboarding from "./Onboarding";
import RatePrompt from "./RatePrompt";
import Tour from "./Tour";
import { PaywallProvider } from "./PaywallScreen";
import { iap } from "./iap";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

// ★ NEW — Deep link / Landing page
import JoinLandingPage from "./JoinLandingPage";
import { parseCodeFromUrl, queueJoinCode } from "./deepLink";
import { initNotifications, refreshNotifications } from "./notifications";
import { initPush } from "./push";
import { initAnalytics, track, EVENTS } from "./analytics";

// ★ Haftalık maç planı · bildirim ön-izni · Kasa (window event'leriyle açılır)
import ScheduleSheet from "./ScheduleSheet";
import NotifPermissionPrompt from "./NotifPermissionPrompt";
import KasaSheet from "./KasaSheet";

// ─── ADMOB / IAP DEBUG PANEL ─────────────────────────────────
// Default KAPALI — production'da görünmesin.
// Geliştirici test ederken açmak için:
//   Chrome DevTools console'da:  localStorage.setItem('hk_debug', '1')
// Sonra app'i tekrar başlat, panel açılır. Kapatmak için:
//   localStorage.removeItem('hk_debug')

const ADMOB_DEBUG = (() => {
  try { return localStorage.getItem('hk_debug') === '1'; }
  catch { return false; }
})();

function AdMobDebugPanel() {
  const [logs, setLogs] = useState([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!ADMOB_DEBUG) return;

    const add = (emoji, msg) => {
      const line = `${emoji} ${new Date().toLocaleTimeString("tr")} ${msg}`;
      setLogs((prev) => [line, ...prev].slice(0, 40));
    };

    // console metodlarını yakala — sadece AdMob ile ilgili olanları filtrele
    const origLog   = console.log.bind(console);
    const origWarn  = console.warn.bind(console);
    const origError = console.error.bind(console);

    console.log = (...args) => {
      origLog(...args);
      const s = args.join(" ");
      if (/(admob|gad|banner|interstitial|rewarded|consent|att|tracking|canshow|npa|initialized|platform|iap|revenuecat|offerings|paket|purchase|entitlement|customerinfo)/i.test(s)) {
        add("ℹ️", s);
      }
    };
    console.warn = (...args) => { origWarn(...args); add("⚠️", args.join(" ")); };
    console.error = (...args) => { origError(...args); add("❌", args.join(" ")); };

    // 2sn sonra anlık durumu çek
    setTimeout(async () => {
      try {
        const { getAdStats } = await import("./admob");
        const s = getAdStats();
        add("📊", `platform=${s.platform} init=${s.isInitialized} canShow=${s.canShowAds} banner=${s.isBannerShowing} interstitial=${s.isInterstitialReady} rewarded=${s.isRewardedReady}`);
      } catch (e) {
        add("❌", "getAdStats: " + e.message);
      }
    }, 2000);

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    };
  }, []);

  if (!ADMOB_DEBUG || !visible) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
      background: "rgba(0,0,0,0.93)", maxHeight: "45vh", overflowY: "auto",
      paddingTop: "env(safe-area-inset-top, 0px)",
      fontFamily: "monospace", fontSize: 11,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "6px 10px", borderBottom: "1px solid #222", position: "sticky", top: 0, background: "#0a0a0a",
      }}>
        <span style={{ color: "#34d399", fontWeight: 700, fontSize: 12 }}>📡 AdMob Debug</span>
        <button
          onClick={() => setVisible(false)}
          style={{ background: "none", border: "1px solid #333", color: "#ef4444", fontSize: 13, cursor: "pointer", borderRadius: 4, padding: "2px 8px" }}
        >
          Kapat
        </button>
      </div>
      {logs.length === 0 && (
        <div style={{ color: "#555", padding: "8px 10px" }}>Loglar bekleniyor...</div>
      )}
      {logs.map((l, i) => (
        <div key={i} style={{
          padding: "3px 10px",
          borderBottom: "1px solid #111",
          color: l.startsWith("❌") ? "#ef4444" : l.startsWith("⚠️") ? "#fbbf24" : l.startsWith("📊") ? "#60a5fa" : "#d1d5db",
          wordBreak: "break-all",
          lineHeight: 1.4,
        }}>
          {l}
        </div>
      ))}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────

const ONBOARDING_KEY = "halisaha_onboarded";
const INVITED_KEY = "halisaha_invited"; // davet linkiyle geldi → tour/onboarding atlanır
const LAUNCH_COUNT_KEY = "halisaha_launch_count";
const RATED_KEY = "halisaha_rated";

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [matchEndTourActive, setMatchEndTourActive] = useState(false);

  // ★ NEW — Web'de deep link açıldığında landing page için pending code
  const [pendingLandingCode, setPendingLandingCode] = useState(null);

  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDING_KEY) === "1";
    if (!onboarded) setShowOnboarding(true);

    // ★ Ölçüm — kullanıcının nerede bıraktığını görmek için (anahtar yoksa no-op)
    initAnalytics();
    track(EVENTS.APP_OPEN, { source: "cold", onboarded });

    // ★ RevenueCat IAP — App boot'unda bir kez init et
    //   Native değilse (web) no-op. PaywallScreen iap.js'i çağrır.
    iap.init();

    // ★ Akıllı maç hatırlatmaları — açılışta İZİN İSTENMEZ.
    //   initNotifications: Android kanalı + bildirime dokunma → ekran yönlendirmesi.
    //   refreshNotifications: tüm tek seferlik bildirimler güncel veriyle yeniden
    //   hesaplanır (izin yoksa no-op). İzin, değer anında NotifPermissionPrompt ile istenir.
    (async () => {
      try {
        await initNotifications();
        await refreshNotifications("boot");
      } catch (e) { /* sessiz geç */ }
    })();

    // ★ FCM push — izin daha önce verildiyse kayıt olur (izin penceresi AÇMAZ)
    initPush();

    // ★ Maç kaydı / geçmiş değişimi / plan değişimi → bildirim planını tazele
    //   (ör. maç kaydedilince "Dünkü maçı kaydetmedin" iptal olur)
    const onPlanInputsChanged = () => { refreshNotifications("data_changed").catch(() => {}); };
    window.addEventListener("halisaha:match-saved", onPlanInputsChanged);
    window.addEventListener("halisaha:history-updated", onPlanInputsChanged);
    window.addEventListener("halisaha:schedule-changed", onPlanInputsChanged);

    // ─── Deep link join code dispatcher ───
    // queueJoinCode kodu saklar + event yayınlar → HaliSahaKolik Online moda
    // geçer, LiveMatch mount olunca kodu alıp doğrudan odaya katılır.
    // Aynı link hem appUrlOpen hem getLaunchUrl ile gelebilir → kısa süreli dedupe.
    // ★ Davetle gelen kullanıcı onboarding'e takılmaz: doğrudan odaya gider.
    let lastCode = null, lastCodeAt = 0;
    const dispatchJoinCode = (code) => {
      if (!code?.trim()) return;
      const clean = code.trim().toUpperCase();
      if (clean === lastCode && Date.now() - lastCodeAt < 5000) return;
      lastCode = clean; lastCodeAt = Date.now();
      skipOnboardingForInvite();
      setTimeout(() => queueJoinCode(clean), 300);   // ilk render tamamlansın
    };

    // ═══════════════════════════════════════════════════════════
    // NATIVE (iOS/Android) — Capacitor appUrlOpen
    //   Scheme:        halisahakolik://join?code=HK-AB12
    //                  halisahakolik:///m/HK-AB12
    //   Universal:     https://davet.halisahakolik.com.tr/m/HK-AB12
    //   Tüm formatlar deepLink.js → parseCodeFromUrl ile yakalanır.
    // ═══════════════════════════════════════════════════════════
    let capListener = null;
    let resumeListener = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appUrlOpen', (data) => {
        const code = parseCodeFromUrl(data.url);
        if (code) dispatchJoinCode(code);
      }).then(listener => { capListener = listener; });

      // ★ Soğuk başlatma: app KAPALIYKEN linke/QR'a dokunulduysa Android
      //   appUrlOpen tetiklemez — açılış URL'sini ayrıca okumak gerekir.
      CapApp.getLaunchUrl().then((res) => {
        const code = parseCodeFromUrl(res?.url);
        if (code) dispatchJoinCode(code);
      }).catch(() => {});

      // ★ Uygulama öne gelince bildirim planını tazele (geri-getirme sayacı sıfırlanır,
      //   durum bildirimleri iptal edilip yeniden hesaplanır)
      CapApp.addListener('resume', () => {
        track(EVENTS.APP_OPEN, { source: "resume" });
        refreshNotifications("resume").catch(() => {});
      }).then(listener => { resumeListener = listener; });
    } else {
      // ═══════════════════════════════════════════════════════════
      // WEB — URL'den kodu yakala
      //   • Hash route:  /#/m/HK-AB12        ← yeni profesyonel format
      //   • Query:       /?code=HK-AB12      ← legacy fallback
      //
      //   Kod bulunursa → JoinLandingPage göster (kullanıcı seçsin:
      //   uygulamada aç / tarayıcıda devam et / store'a git).
      // ═══════════════════════════════════════════════════════════
      try {
        const code = parseCodeFromUrl(window.location.href);
        // Davet sayfasında "Tarayıcıda devam et" seçildiyse (?web=1) landing'i
        // atla — kod doğrudan web app'teki Online moda aktarılsın.
        const continueWeb = /[?&]web=1\b/.test(window.location.search);
        if (code && continueWeb) {
          dispatchJoinCode(code);
          window.history.replaceState({}, '', window.location.pathname);
        } else if (code) {
          setPendingLandingCode(code);
          // URL'yi temizle — refresh'te tekrar landing açılmasın
          const u = new URL(window.location.href);
          u.searchParams.delete('code');
          u.searchParams.delete('join');
          if (u.hash && /\/?m\//i.test(u.hash)) u.hash = '';
          window.history.replaceState({}, '', u.toString());
        }
      } catch {}
    }

    let count = parseInt(localStorage.getItem(LAUNCH_COUNT_KEY) || "0", 10) || 0;
    count += 1;
    localStorage.setItem(LAUNCH_COUNT_KEY, String(count));
    const alreadyRated = localStorage.getItem(RATED_KEY) === "1";

    const shouldShow =
      !alreadyRated &&
      onboarded &&
      (count === 3 || (count > 3 && (count - 3) % 10 === 0));

    if (shouldShow) {
      setTimeout(() => setShowRate(true), 1500);
    }

    const onReplay = () => setShowOnboarding(true);
    window.addEventListener("halisaha:replay-onboarding", onReplay);

    const onStartTour = () => setTourActive(true);
    window.addEventListener("halisaha:start-tour", onStartTour);

    const onStartMatchEndTour = () => setMatchEndTourActive(true);
    window.addEventListener("halisaha:start-match-end-tour", onStartMatchEndTour);

    return () => {
      window.removeEventListener("halisaha:replay-onboarding", onReplay);
      window.removeEventListener("halisaha:start-tour", onStartTour);
      window.removeEventListener("halisaha:start-match-end-tour", onStartMatchEndTour);
      window.removeEventListener("halisaha:match-saved", onPlanInputsChanged);
      window.removeEventListener("halisaha:history-updated", onPlanInputsChanged);
      window.removeEventListener("halisaha:schedule-changed", onPlanInputsChanged);
      // Capacitor deep link listener'ı temizle
      if (capListener) capListener.remove();
      if (resumeListener) resumeListener.remove();
    };
  }, []);

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
    // Deep link bekleyen event varsa tetikle
    window.dispatchEvent(new CustomEvent("halisaha:onboarded"));
  };

  // ★ DAVET AKIŞI — link/QR ile gelen kullanıcı önce onboarding'i geçmek
  //   zorunda kalmaz: onboarded + invited işaretlenir, onboarding gizlenir,
  //   kod hemen odaya aktarılır. (HaliSahaKolik "halisaha_invited" görünce tour'u da atlar.)
  //   Sadece setter + localStorage kullanır → boot effect'inden güvenle çağrılır.
  function skipOnboardingForInvite() {
    let onboarded = false;
    try { onboarded = localStorage.getItem(ONBOARDING_KEY) === "1"; } catch {}
    if (onboarded) return;
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
      localStorage.setItem(INVITED_KEY, "1");
    } catch {}
    setShowOnboarding(false);
    track(EVENTS.ONBOARDING_DONE, { skipped: true, slide: "invite" });
  }

  // ★ NEW — Landing'den "Tarayıcıda Devam Et"e basıldığında
  const handleContinueWebFromLanding = () => {
    const code = pendingLandingCode;
    setPendingLandingCode(null);
    if (!code) return;
    skipOnboardingForInvite();
    setTimeout(() => queueJoinCode(code), 300);
  };

  return (
    <PremiumProvider>
      <AdMobDebugPanel />
      <HalisahaKolik />
      <PaywallProvider />  {/* ← BU SATIR, root seviyesinde, en altta */}
      {showOnboarding && <Onboarding onFinish={finishOnboarding} />}
      {showRate && <RatePrompt onClose={() => setShowRate(false)} />}
      <Tour active={tourActive} onFinish={() => setTourActive(false)} mode="main" />
      <Tour active={matchEndTourActive} onFinish={() => setMatchEndTourActive(false)} mode="matchEnd" />

      {/* ★ Haftalık maç planı ("halisaha:open-schedule"), bildirim ön-izni
          ("halisaha:ask-notif-permission"), Kasa ("halisaha:open-kasa") */}
      <ScheduleSheet />
      <KasaSheet />
      <NotifPermissionPrompt />

      {/* ★ NEW — Web deep-link landing page (sadece web'de açılır) */}
      {pendingLandingCode && (
        <JoinLandingPage
          code={pendingLandingCode}
          onContinueWeb={handleContinueWebFromLanding}
        />
      )}
    </PremiumProvider>
  );
}