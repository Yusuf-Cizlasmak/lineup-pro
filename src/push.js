// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · push — Uzak bildirimler (Firebase Cloud Messaging)
// ─────────────────────────────────────────────────────────────
// ★ Eklenti: @capacitor-firebase/messaging (Capawesome).
//   iOS'ta da GERÇEK FCM token'ı verir (eski @capacitor/push-notifications
//   iOS'ta APNs token'ı veriyordu → Firebase kampanyaları iPhone'a ulaşmıyordu).
//
// ★ JS tarafında paketi import ETMİYORUZ — registerPlugin("FirebaseMessaging")
//   ile doğrudan native köprüye bağlanıyoruz. Sebep: paketin web sürümü
//   "firebase" JS SDK'sını ister (web build'i büyütür / kırar); biz web'de
//   push kullanmıyoruz. Native taraf (Android/iOS) paketten gelir (cap sync).
//   iOS'ta eklenti yalnızca codemagic ENABLE_PUSH="true" iken derlenir;
//   yoksa her şey sessizce no-op olur.
//
// SÖZLEŞME (diğer modüller buna güvenir):
//   initPush()   → App.js boot. İZİN PENCERESİ AÇMAZ. İzin zaten verildiyse
//                  token alır + Supabase'e kaydeder + dinleyicileri kurar.
//   enablePush() → NotifPermissionPrompt "Evet" → izin ister, kaydolur,
//                  token'ı kaydeder. Promise<boolean> (izin verildi mi).
//
// Token kaydı: supabase.rpc("register_push_token", { p_device_id, p_token, p_platform })
//   (supabase/migrations/20261018_push_tokens.sql). Fonksiyon henüz yoksa
//   hata bir kez loglanır, uygulama etkilenmez.
//
// Bildirime dokunma → data.route / data.kind / data.code okunur:
//   • data.code (HK-XXXX)  → queueJoinCode → doğrudan odaya katılım
//   • data.route           → window "halisaha:navigate" { route }
//     (attendance | ai_split | result | stats | online | squad | kasa | schedule)
//   • track(EVENTS.NOTIF_OPENED, { kind, remote: true })
//
// Firebase Console'dan kampanya gönderirken "Ek seçenekler → Özel veri"
// alanına route=online gibi anahtar/değer eklenebilir. Bkz. docs/BILDIRIM_KURULUM.md
// ─────────────────────────────────────────────────────────────

import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase, getDeviceId } from "./LiveMatchService";
import { track, EVENTS } from "./analytics";
import { queueJoinCode } from "./deepLink";

const PLUGIN_NAME = "FirebaseMessaging";

// ═══ ANDROID KANALI — sunucu (send-push) ve manifest varsayılanı bunu kullanır ═══
export const PUSH_CHANNEL_ID = "hk_push";

// Son başarılı token kaydı (aynı token'ı her açılışta tekrar yollamayalım).
// ★ "halisaha_" / "hk_" ile BAŞLAMAZ → yedeğe (backup.js) girmez; token cihaza özel.
const SYNC_KEY = "hkpush_sync_v1";
const RESYNC_MS = 3 * 24 * 60 * 60 * 1000; // 3 günde bir tazele (updated_at canlı kalsın)

const BOOT_AT = Date.now();

let _fm = null;
let _started = false;
let _listenersAdded = false;
let _channelDone = false;
let _rpcMissingLogged = false;
let _lastTapKey = "";
let _lastTapAt = 0;

// ═══ EKLENTİYE ERİŞİM ═══
// Web'de veya eklenti native build'de yoksa (iOS ENABLE_PUSH=false) null döner.
function getFM() {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    if (!Capacitor.isPluginAvailable(PLUGIN_NAME)) return null;
    if (!_fm) _fm = registerPlugin(PLUGIN_NAME);
    return _fm;
  } catch {
    return null;
  }
}

/** Uzak bildirim altyapısı bu build'de var mı? (UI isterse kullanır) */
export function isPushSupported() {
  return !!getFM();
}

const readSync = () => {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY) || "null"); } catch { return null; }
};
const writeSync = (v) => {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(v)); } catch {}
};

// ═══ TOKEN → SUPABASE ═══
// Aynı token aynı anda iki kez gelebilir (tokenReceived + getToken) → tek istek
let _saving = null; // { token, promise }
function saveToken(token, opts) {
  if (_saving && _saving.token === token) return _saving.promise;
  const promise = doSaveToken(token, opts).finally(() => {
    if (_saving && _saving.promise === promise) _saving = null;
  });
  _saving = { token, promise };
  return promise;
}

async function doSaveToken(token, { force = false } = {}) {
  if (!token || typeof token !== "string") return false;
  let deviceId;
  try { deviceId = getDeviceId(); } catch { return false; }
  const platform = Capacitor.getPlatform(); // "ios" | "android"

  // Debug/test için: Android Studio Logcat veya Xcode konsolunda görünür.
  // Firebase Console → "Test mesajı gönder" bu token'ı ister.
  console.info("[push] FCM token:", token);

  const prev = readSync();
  if (
    !force && prev && prev.t === token && prev.d === deviceId &&
    Date.now() - (prev.at || 0) < RESYNC_MS
  ) {
    return true; // zaten kayıtlı, taze
  }

  try {
    const { error } = await supabase.rpc("register_push_token", {
      p_device_id: deviceId,
      p_token: token,
      p_platform: platform,
    });
    if (error) {
      if (!_rpcMissingLogged) {
        _rpcMissingLogged = true;
        // PGRST202 = fonksiyon yok (SQL henüz çalıştırılmadı) — sessiz geç
        console.warn("[push] token kaydedilemedi:", error.code || "", error.message || error);
      }
      return false;
    }
    writeSync({ t: token, d: deviceId, at: Date.now() });
    return true;
  } catch (e) {
    if (!_rpcMissingLogged) {
      _rpcMissingLogged = true;
      console.warn("[push] token kaydı hata:", e?.message || e);
    }
    return false;
  }
}

async function fetchAndSaveToken(FM, attempt = 0) {
  try {
    const res = await FM.getToken();
    if (res?.token) return saveToken(res.token);
  } catch (e) {
    // iOS: APNs token henüz gelmediyse FCM token alınamaz → kısa bekleyip tekrar dene.
    // "Firebase is not configured" → GoogleService-Info.plist bundle'da yok (ENABLE_PUSH kapalı).
    const msg = String(e?.message || e || "");
    if (/not configured/i.test(msg)) {
      console.warn("[push] Firebase yapılandırılmamış — uzak bildirim kapalı");
      return false;
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      return fetchAndSaveToken(FM, attempt + 1);
    }
    console.warn("[push] token alınamadı:", msg);
  }
  return false;
}

async function hasPermission(FM) {
  try {
    const perm = await FM.checkPermissions();
    return perm?.receive === "granted";
  } catch {
    return false;
  }
}

// ═══ ANDROID KANALI (izin gerektirmez) ═══
async function ensureChannel(FM) {
  if (_channelDone || Capacitor.getPlatform() !== "android") return;
  _channelDone = true;
  try {
    await FM.createChannel({
      id: PUSH_CHANNEL_ID,
      name: "Maç ve oda bildirimleri",
      description: "Odaya katılanlar, MVP ve duyurular",
      importance: 4, // HIGH → banner
      visibility: 1, // PUBLIC
    });
  } catch {
    _channelDone = false;
  }
}

// ═══ DOKUNMA → YÖNLENDİRME ═══
function openRoute(route) {
  if (!route) return;
  try {
    if (route === "kasa") {
      window.dispatchEvent(new CustomEvent("halisaha:open-kasa", { detail: {} }));
    } else if (route === "schedule") {
      window.dispatchEvent(new CustomEvent("halisaha:open-schedule"));
    } else {
      window.dispatchEvent(new CustomEvent("halisaha:navigate", { detail: { route } }));
    }
  } catch {}
}

function onTap(event) {
  try {
    if (event?.actionId === "dismiss") return;
    const n = event?.notification || {};
    const data = n.data || {};
    const kind = String(data.kind || "remote");
    const route = data.route ? String(data.route) : null;
    const code = data.code ? String(data.code) : null;

    // Aynı dokunma iki kez gelebilir (retainUntilConsumed + onNewIntent) → dedupe
    const key = `${n.id || ""}|${kind}|${route || ""}|${code || ""}`;
    if (key === _lastTapKey && Date.now() - _lastTapAt < 3000) return;
    _lastTapKey = key;
    _lastTapAt = Date.now();

    track(EVENTS.NOTIF_OPENED, { kind, remote: true, route });

    // Soğuk açılışta UI'nin mount olması için kısa bekleme
    const delay = Date.now() - BOOT_AT < 6000 ? 400 : 60;
    setTimeout(() => {
      if (code && queueJoinCode(code)) return; // davet kodu → doğrudan oda
      openRoute(route);
    }, delay);
  } catch (e) {
    console.warn("[push] dokunma işlenemedi:", e?.message);
  }
}

function addListenersOnce(FM) {
  if (_listenersAdded) return;
  _listenersAdded = true;
  // addListener Promise döner — reddi yut (unhandled rejection olmasın)
  const listen = (name, fn) => {
    Promise.resolve(FM.addListener(name, fn)).catch((e) => {
      console.warn(`[push] ${name} dinleyicisi eklenemedi:`, e?.message);
    });
  };
  try {
    // Token yenilendi (FCM token'ı zamanla değişebilir) → izin varsa kaydet
    listen("tokenReceived", async (ev) => {
      if (ev?.token && (await hasPermission(FM))) saveToken(ev.token);
    });
    // Uygulama ÖNDEYKEN gelen bildirim — rahatsız edici bir şey gösterme.
    // (Android önde iken sistem bildirimi zaten göstermez; iOS banner'ı
    //  capacitor.config presentationOptions ile yönetilir.)
    listen("notificationReceived", (ev) => {
      const data = ev?.notification?.data || {};
      try {
        window.dispatchEvent(new CustomEvent("halisaha:push-received", { detail: data }));
      } catch {}
    });
    // Bildirime DOKUNULDU (arka plan / kapalıyken açılış)
    listen("notificationActionPerformed", onTap);
  } catch (e) {
    _listenersAdded = false;
    console.warn("[push] dinleyiciler eklenemedi:", e?.message);
  }
}

// ═══ BOOT — İZİN İSTEMEZ ═══
export async function initPush() {
  if (_started) return;
  const FM = getFM();
  if (!FM) return; // web veya eklenti yok → no-op
  _started = true;
  try {
    addListenersOnce(FM);
    ensureChannel(FM);
    if (!(await hasPermission(FM))) return; // izin yok → sessiz (değer anında sorulur)
    await fetchAndSaveToken(FM);
  } catch (e) {
    console.warn("[push] init hata:", e?.message);
  }
}

// ═══ İZİN İSTE + KAYDOL (NotifPermissionPrompt "Evet, hatırlat") ═══
export async function enablePush() {
  const FM = getFM();
  if (!FM) return false;
  _started = true;
  try {
    addListenersOnce(FM);
    ensureChannel(FM);
    let granted = await hasPermission(FM);
    if (!granted) {
      // iOS/Android: daha önce kalıcı reddedildiyse pencere açılmaz, "denied" döner
      const res = await FM.requestPermissions();
      granted = res?.receive === "granted";
    }
    if (!granted) return false;
    // Token kaydı arka planda — izin ekranı token'ı beklemeden kapansın
    fetchAndSaveToken(FM).catch(() => {});
    return true;
  } catch (e) {
    console.warn("[push] enablePush hata:", e?.message);
    return false;
  }
}