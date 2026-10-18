// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Subscription (Free / Pro)
// ─────────────────────────────────────────────────────────────
// Aşama 1: Lokal state — localStorage'da tier + bitiş tarihi
// Aşama 2 (sonra): RevenueCat webhook → Supabase → bu hook
//
// Kullanım:
//   const { tier, isPro, isPremium, daysLeft, openPaywall } = useSubscription();
//   if (!isPro) return <PaywallGate feature="cloud_sync" />;
// ─────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "halisaha_subscription";
const TRIAL_KEY   = "halisaha_trial_used";

// ═══ Tier tanımları ═══
export const TIER = {
  FREE: "free",
  PRO:  "pro",
};

// ═══ Feature limitleri (free tier) ═══
// Online Halı Saha modu FREE: maça katılma sınırsız (davet edilen arkadaşlar
// hiç takılmasın), oda kurma ayda ONLINE_CREATES_PER_MONTH kez. Fazlası Pro.
export const FREE_LIMITS = {
  ONLINE_CREATES_PER_MONTH: 3,   // her ay 3 ücretsiz oda kurma (ayın 1'inde yenilenir)
  HISTORY_LIMIT: 5,              // son 5 maç geçmişi
  TEAMS_LIMIT: 1,
  ADS: true,
};

// ═══ Storage helper'ları ═══
function readSub() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tier: TIER.FREE, until: null, plan: null };
    const obj = JSON.parse(raw);
    // Süresi geçmiş abonelik → free'ye düş
    if (obj.until && Date.now() > obj.until) {
      return { tier: TIER.FREE, until: null, plan: null, expired: true };
    }
    return obj;
  } catch {
    return { tier: TIER.FREE, until: null, plan: null };
  }
}

function writeSub(sub) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sub)); }
  catch {}
  // Diğer hook instance'larına haber ver
  window.dispatchEvent(new CustomEvent("hk:subscription-changed", { detail: sub }));
}

// ═══ Public API ═══

// Mevcut subscription durumunu oku (hook olmadan da kullanılabilir)
export function getSubscription() {
  return readSub();
}

export function isPremium() {
  const s = readSub();
  return s.tier === TIER.PRO;
}

// Trial kullanıldı mı?
export function isTrialUsed() {
  try { return localStorage.getItem(TRIAL_KEY) === "1"; }
  catch { return false; }
}

export function markTrialUsed() {
  try { localStorage.setItem(TRIAL_KEY, "1"); } catch {}
}

// 7-gün trial başlat
export function startTrial() {
  if (isTrialUsed()) return false;
  const sub = {
    tier: TIER.PRO,
    until: Date.now() + 7 * 24 * 60 * 60 * 1000,
    plan: "trial_7d",
    startedAt: Date.now(),
  };
  writeSub(sub);
  markTrialUsed();
  return true;
}

// Pro aktive et (RevenueCat callback'inden çağrılır)
export function activateSubscription({ tier, plan, expiresAt }) {
  if (tier !== TIER.PRO) return false;
  writeSub({
    tier,
    until: expiresAt || null,
    plan,
    activatedAt: Date.now(),
  });
  return true;
}

// Aboneliği iptal et (debug / test için; production'da store yapar)
export function clearSubscription() {
  writeSub({ tier: TIER.FREE, until: null, plan: null });
}

// ═══ Online oda kurma sayacı (free tier — AYLIK limit) ═══
// localStorage'da { month: "2026-10", count } tutulur; ay değişince kendiliğinden
// sıfırlanır. Sunucu tarafı doğrulama (match_sessions sayımı) → onlineUsage.js
const MONTHLY_CREATE_KEY = "halisaha_online_creates_monthly";

export const currentMonthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const getMonthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const getNextMonthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 1);

export function getOnlineMatchCount() {
  const month = currentMonthKey();
  try {
    const obj = JSON.parse(localStorage.getItem(MONTHLY_CREATE_KEY) || "null");
    if (!obj || obj.month !== month) return { count: 0, month };
    return { count: obj.count || 0, month };
  } catch {
    return { count: 0, month };
  }
}

export function setOnlineMatchCount(count) {
  const next = { month: currentMonthKey(), count: Math.max(0, count | 0), updatedAt: Date.now() };
  try { localStorage.setItem(MONTHLY_CREATE_KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent("hk:online-usage-changed", { detail: next }));
  return next.count;
}

export function incrementOnlineMatchCount() {
  return setOnlineMatchCount(getOnlineMatchCount().count + 1);
}

// Kullanıcının bu ay oda kurma hakkı kaldı mı? (senkron, lokal cache'e bakar)
export function canCreateOnlineMatch() {
  if (isPremium()) return { allowed: true, remaining: Infinity };
  const { count } = getOnlineMatchCount();
  const limit = FREE_LIMITS.ONLINE_CREATES_PER_MONTH;
  const remaining = Math.max(0, limit - count);
  return {
    allowed: remaining > 0,
    remaining,
    used: count,
    limit,
    resetsAt: getNextMonthStart().getTime(),
  };
}

// ═══ Paywall trigger event'i ═══
// Component'lerden tetikleyebilir, üst-seviye App component dinler
export function openPaywall(feature = "general") {
  window.dispatchEvent(new CustomEvent("hk:open-paywall", { detail: { feature } }));
}

// ═══ React Hook ═══
export function useSubscription() {
  const [sub, setSub] = useState(() => readSub());

  useEffect(() => {
    const refresh = () => setSub(readSub());

    // 1) Bizim custom event — activateSubscription/clearSubscription dispatch'liyor
    window.addEventListener("hk:subscription-changed", refresh);

    // 2) Başka tab değişimi — storage event (aynı tab'da fire etmez, sadece diğer tab'lar)
    window.addEventListener("storage", refresh);

    // 3) ★ App foreground'a döndü — native paywall'dan dönüş sonrası kritik
    //    iOS'ta App Store paywall kapanıp app aktif olduğunda focus event tetiklenir
    //    Android'de Play Store paywall sonrası benzer şekilde çalışır
    window.addEventListener("focus", refresh);

    // 4) ★ Sayfa visibility değişti — webview pause/resume sonrası state tazele
    //    RC entitlement bazen 1-2 sn gecikir; visibility refresh bu race'i yakalar
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    // 5) ★ Pageshow event — iOS BFCache'den dönüşte gerekli
    //    (focus her zaman tetiklenmeyebilir)
    const onPageShow = (e) => { if (e.persisted) refresh(); };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("hk:subscription-changed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const isPro     = sub.tier === TIER.PRO;
  const isPrem    = isPro;
  const daysLeft  = sub.until ? Math.max(0, Math.ceil((sub.until - Date.now()) / 86400000)) : null;
  const isTrial   = sub.plan === "trial_7d";

  const triggerPaywall = useCallback((feature) => openPaywall(feature), []);

  return {
    tier: sub.tier,
    plan: sub.plan,
    until: sub.until,
    isPro,
    isPremium: isPrem,
    isTrial,
    daysLeft,
    openPaywall: triggerPaywall,
    refresh: () => setSub(readSub()),
  };
}