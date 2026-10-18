// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Analytics (PostHog)
// ─────────────────────────────────────────────────────────────
// Kullanıcının nerede bıraktığını ölçmeden "arayüz mü kötü, ihtiyaç mı yok"
// sorusu cevaplanamaz. Tüm uygulama tek fonksiyon kullanır:
//
//   import { track, EVENTS } from "./analytics";
//   track(EVENTS.PLAYER_ADDED, { source: "paste", count: 14, squad_size: 14 });
//
// KURULUM: posthog.com → EU bölgesinde ücretsiz hesap → Project settings →
//   "Project API key" (phc_...) → aşağıdaki POSTHOG_KEY'e yaz (ya da build'de
//   REACT_APP_POSTHOG_KEY). Boşken tüm çağrılar no-op olur, uygulama etkilenmez.
//
// GİZLİLİK: Oturum kaydı ve otomatik tıklama toplama KAPALI. Sadece aşağıdaki
//   olaylar, uygulamanın rastgele cihaz kimliğiyle (isim/telefon yok) gönderilir.
//   App Store Connect → Uygulama Gizliliği'nde "Kullanım Verisi → Ürün
//   Etkileşimi (Analiz, kimliğe bağlı değil)" beyan et.
//
// DEBUG: localStorage.setItem('hk_debug', '1') → olaylar console'a da yazılır.
// ─────────────────────────────────────────────────────────────
import posthog from "posthog-js";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { getDeviceId } from "./LiveMatchService";

const POSTHOG_KEY  = process.env.REACT_APP_POSTHOG_KEY || ""; // örn: "phc_xxx"
const POSTHOG_HOST = process.env.REACT_APP_POSTHOG_HOST || "https://eu.i.posthog.com";

// ═══ Olay adları — yeni olay eklerken buraya ekle (dashboard'da tutarlı kalsın) ═══
export const EVENTS = {
  APP_OPEN:          "app_open",          // { source: "cold" | "resume" }
  ONBOARDING_DONE:   "onboarding_done",   // { skipped, slide }
  NOTIF_PERMISSION:  "notif_permission",  // { granted, context }
  NOTIF_OPENED:      "notif_opened",      // { kind }
  MODE_SELECTED:     "mode_selected",     // { mode }
  PLAYER_ADDED:      "player_added",      // { source: manual|paste|demo|guest, count, squad_size }
  SQUAD_READY:       "squad_ready",       // { squad_size }  — kadro ilk kez 10+ olunca
  AI_BALANCE_USED:   "ai_balance_used",   // { surface: lineup|match|online, players }
  LINEUP_SHARED:     "lineup_shared",     // { kind: image|text|result|season }
  MATCH_SAVED:       "match_saved",       // { kind: offline|online, players, has_schedule }
  SCHEDULE_SET:      "schedule_set",      // { weekday, hour }
  ROOM_CREATED:      "room_created",      // { scheduled }
  JOIN_SUCCESS:      "join_success",      // { source: link|code|list }
  AD_SHOWN:          "ad_shown",          // { placement, type }
  PAYWALL_OPENED:    "paywall_opened",    // { feature }
  PURCHASE_SUCCESS:  "purchase_success",  // { plan }
  KASA_USED:         "kasa_used",         // { action }
  BACKUP:            "backup",            // { action: export|import, ok }
};

let _ready = false;
const _queue = [];

const isDebug = () => {
  try { return localStorage.getItem("hk_debug") === "1"; } catch { return false; }
};

// App.js boot'unda bir kez çağrılır
export function initAnalytics() {
  if (_ready || !POSTHOG_KEY) return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: "localStorage",
      person_profiles: "identified_only",
    });
    // Supabase satırlarıyla eşleşsin diye online moddaki cihaz kimliğini kullan
    posthog.identify(getDeviceId());
    posthog.register({ platform: Capacitor.getPlatform() });
    if (Capacitor.isNativePlatform()) {
      CapApp.getInfo()
        .then((i) => posthog.register({ app_version: i.version, app_build: i.build }))
        .catch(() => {});
    }
    _ready = true;
    _queue.splice(0).forEach(([e, p]) => posthog.capture(e, p));
  } catch (e) {
    console.warn("[analytics] init başarısız:", e?.message);
  }
}

export function track(event, props = {}) {
  if (isDebug()) console.log("[track]", event, props);
  if (!POSTHOG_KEY) return;
  if (!_ready) { _queue.push([event, props]); return; }
  try { posthog.capture(event, props); } catch {}
}

// Kullanıcı özellikleri (örn. { role: "organizer", has_schedule: true })
export function setUserProps(props) {
  if (!POSTHOG_KEY || !_ready) return;
  try { posthog.setPersonProperties(props); } catch {}
}
