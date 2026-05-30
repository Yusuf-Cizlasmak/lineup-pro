// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · onlineUsage — Reinstall-proof kullanım sayacı
// ─────────────────────────────────────────────────────────────
// Free tier online maç oluşturma/katılma haklarını Supabase'te,
// uygulamanın silinmesinden ETKİLENMEYEN bir donanım kimliğine bağlar.
//
// Neden gerekti:
//   Eski sistem sayacı localStorage'da tutuyordu. Uygulama silinince
//   localStorage (ve device_id) sıfırlanıyor → haklar resetleniyordu.
//   Artık gerçek kaynak Supabase; localStorage sadece offline cache.
//
// Kimlik stratejisi:
//   • Android: Device.getId() → app-signing'e bağlı, reinstall'da KALIR. Sağlam.
//   • iOS: identifierForVendor → aynı yayıncının başka uygulaması yüklüyken kalır,
//     hepsi silinirse sıfırlanabilir. "Sil-yükle ile bedava hak" istismarını
//     yine de büyük ölçüde durdurur. Tam garanti için (opsiyonel sertleştirme)
//     keychain'e UUID yazan bir plugin eklenebilir — notlarda belirtildi.
//
// KULLANIM (async — await gerekir):
//   import { canJoinOnline, recordJoin, canCreateOnline, recordCreate } from "./onlineUsage";
//   const gate = await canJoinOnline();
//   if (!gate.allowed) { openPaywall("online_join"); return; }
//   ... katılım başarılı ...
//   await recordJoin();
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";
import { supabase, getDeviceId } from "./LiveMatchService";
import { isPremium, FREE_LIMITS } from "./subscription";

// localStorage cache anahtarları (offline fallback + sync UI uyumu)
const CACHE_JOINS   = "halisaha_online_matches_joined";
const CACHE_CREATES = "halisaha_online_matches_created";
const HW_CACHE_KEY  = "halisaha_hw_id";

let _hwId = null;

// ═══ Silmeye dayanıklı donanım kimliği ═══
async function getHardwareId() {
  if (_hwId) return _hwId;

  // Native: @capacitor/device → reinstall'a dayanıklı kimlik
  if (Capacitor.isNativePlatform()) {
    try {
      const { Device } = await import("@capacitor/device");
      const info = await Device.getId();
      // Yeni sürüm: { identifier }, eski sürüm: { uuid }
      _hwId = info?.identifier || info?.uuid || null;
    } catch (e) {
      console.warn("[onlineUsage] Device.getId başarısız:", e?.message);
    }
  }

  // Fallback: localStorage'da kalıcı UUID (web + plugin yoksa)
  if (!_hwId) {
    try {
      let cached = localStorage.getItem(HW_CACHE_KEY);
      if (!cached) {
        cached = getDeviceId(); // mevcut session UUID'sini taban al
        localStorage.setItem(HW_CACHE_KEY, cached);
      }
      _hwId = cached;
    } catch {
      _hwId = getDeviceId();
    }
  }
  return _hwId;
}

// ═══ localStorage cache helper'ları (offline UI için) ═══
function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const obj = JSON.parse(raw);
    return obj.count || 0;
  } catch { return 0; }
}
function writeCache(key, count) {
  try { localStorage.setItem(key, JSON.stringify({ count, lastAt: Date.now() })); } catch {}
}

// ═══ Sunucudan güncel sayaçları çek ═══
async function fetchServerUsage() {
  try {
    const hwId = await getHardwareId();
    const { data, error } = await supabase
      .from("device_usage")
      .select("online_joins, online_creates")
      .eq("hw_id", hwId)
      .maybeSingle();
    if (error) throw error;
    return {
      joins:   data?.online_joins   || 0,
      creates: data?.online_creates || 0,
    };
  } catch (e) {
    console.warn("[onlineUsage] fetch başarısız, cache'e düşülüyor:", e?.message);
    return {
      joins:   readCache(CACHE_JOINS),
      creates: readCache(CACHE_CREATES),
    };
  }
}

// ═══ Atomik artırım (RPC) ═══
async function bump(kind /* 'join' | 'create' */) {
  const hwId = await getHardwareId();
  try {
    const { data, error } = await supabase.rpc("increment_online_usage", {
      p_hw_id: hwId, p_kind: kind,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const joins   = row?.online_joins   ?? readCache(CACHE_JOINS);
    const creates = row?.online_creates ?? readCache(CACHE_CREATES);
    // Cache'i sunucuyla eşitle
    writeCache(CACHE_JOINS, joins);
    writeCache(CACHE_CREATES, creates);
    return { joins, creates };
  } catch (e) {
    console.warn("[onlineUsage] bump başarısız, cache'e yazılıyor:", e?.message);
    // Offline: en azından cihazda say (sunucu sonraki açılışta kazanır)
    const next = (kind === "join" ? readCache(CACHE_JOINS) : readCache(CACHE_CREATES)) + 1;
    writeCache(kind === "join" ? CACHE_JOINS : CACHE_CREATES, next);
    return { joins: readCache(CACHE_JOINS), creates: readCache(CACHE_CREATES) };
  }
}

// ═══ PUBLIC API ═══

export async function canJoinOnline() {
  if (isPremium()) return { allowed: true, remaining: Infinity, used: 0, limit: Infinity };
  const { joins } = await fetchServerUsage();
  writeCache(CACHE_JOINS, joins); // UI sync
  const limit = FREE_LIMITS.ONLINE_JOINS_LIFETIME;
  const remaining = Math.max(0, limit - joins);
  return { allowed: remaining > 0, remaining, used: joins, limit };
}

export async function recordJoin() {
  if (isPremium()) return;
  await bump("join");
}

export async function canCreateOnline() {
  if (isPremium()) return { allowed: true, remaining: Infinity, used: 0, limit: Infinity };
  const { creates } = await fetchServerUsage();
  writeCache(CACHE_CREATES, creates);
  const limit = FREE_LIMITS.ONLINE_MATCHES_LIFETIME;
  const remaining = Math.max(0, limit - creates);
  return { allowed: remaining > 0, remaining, used: creates, limit };
}

export async function recordCreate() {
  if (isPremium()) return;
  await bump("create");
}

// App boot'ta çağır → sunucu sayaçlarını cache'e çek (sync UI tutarlı olsun)
export async function syncOnlineUsage() {
  const { joins, creates } = await fetchServerUsage();
  writeCache(CACHE_JOINS, joins);
  writeCache(CACHE_CREATES, creates);
  return { joins, creates };
}