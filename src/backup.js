// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Yedek Al / Geri Yükle
// ─────────────────────────────────────────────────────────────
// Tüm veri cihazda (localStorage) duruyor → telefon değişince / uygulama
// silinince kadro, geçmiş, Kasa kaybolmasın diye tek dosyalık yedek.
//
//   import { exportBackup, pickAndImportBackup } from "./backup";
//   const r = await exportBackup();          // { ok, error? }
//   const r = await pickAndImportBackup();   // { ok, keys, error? } → ok ise window.location.reload()
//
// Dosya formatı:
//   { app: "halisaha-kolik", version: 1, exportedAt: <ms>, data: { "<halisaha_ anahtar>": "<string değer>" } }
//
// ★ GÜVENLİK: Abonelik / deneme / oda-kotası anahtarları yedeğe GİRMEZ ve
//   içe aktarmada YAZILMAZ → bir yedek dosyası Pro veremez, kota sıfırlayamaz.
//   Sadece "halisaha_" ile başlayan anahtarlar okunur/yazılır ("hk_" debug
//   bayrakları, push token'ı vb. cihaza özel kalır).
//
// Native (iOS/Android): Cache klasörüne .json yazılır → paylaşım menüsü açılır
//   (Dosyalar'a kaydet, WhatsApp'ta kendine gönder, Drive...).
// Web: Blob indirme.
// ─────────────────────────────────────────────────────────────
import { Capacitor } from "@capacitor/core";

export const BACKUP_APP = "halisaha-kolik";
export const BACKUP_VERSION = 1;
const KEY_PREFIX = "halisaha_";
const MAX_BACKUP_CHARS = 10 * 1024 * 1024; // 10 MB — localStorage zaten ~5 MB

// ★ Yedeğe girmeyen + içe aktarmada dokunulmayan anahtarlar
const EXCLUDED_KEYS = new Set([
  "halisaha_subscription",            // Pro / deneme durumu — yedekten Pro kazanılamaz
  "halisaha_trial_used",              // deneme hakkı sıfırlanamaz
  "halisaha_online_creates_monthly",  // aylık ücretsiz oda kotası sıfırlanamaz
  "halisaha_notif_os_result",         // bildirim izni cihaza özel
  "halisaha_notif_ledger",            // planlanmış yerel bildirim kimlikleri cihaza özel
]);

const isBackupKey = (k) =>
  typeof k === "string" && k.startsWith(KEY_PREFIX) && !EXCLUDED_KEYS.has(k);

const pad2 = (n) => String(n).padStart(2, "0");
const todayStamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const backupFileName = (d = new Date()) => `halisaha-yedek-${todayStamp(d)}.json`;

const isCancelError = (e) => /cancel/i.test(String(e?.message || e?.errorMessage || e || ""));

// ═══ Yedek objesi — localStorage'dan topla ═══
export function buildBackup() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!isBackupKey(k)) continue;
      const v = localStorage.getItem(k);
      if (typeof v === "string") data[k] = v;
    }
  } catch {}
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Date.now(), data };
}

// ═══ DIŞA AKTAR ═══
export async function exportBackup() {
  let json;
  try {
    json = JSON.stringify(buildBackup());
  } catch (e) {
    return { ok: false, error: e?.message || "serialize_failed" };
  }
  const fileName = backupFileName();

  // ── Native: Cache'e yaz → paylaşım menüsü ──
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const res = await Filesystem.writeFile({
        path: fileName,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: "HalıSaha-Kolik yedeği",
        text: "HalıSaha-Kolik yedek dosyası — yeni telefonda Ayarlar → Yedeği geri yükle",
        files: [res.uri],
        dialogTitle: "Yedeği kaydet / gönder",
      });
      return { ok: true };
    } catch (e) {
      if (isCancelError(e)) return { ok: false, error: "cancelled" };
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // ── Web: Blob indirme ──
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
      try { a.remove(); } catch {}
    }, 1500);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ═══ DOĞRULA — yazmadan önce (testlerde de kullanılır) ═══
// → { ok: true, entries: [[key, value], ...] } | { ok: false, error }
export function parseBackupText(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "empty" };
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: "too_large" };
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: "invalid_json" }; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "invalid_format" };
  if (obj.app !== BACKUP_APP) return { ok: false, error: "wrong_app" };
  if (obj.version !== BACKUP_VERSION) return { ok: false, error: "unsupported_version" };
  const data = obj.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "invalid_data" };

  const entries = [];
  for (const [k, v] of Object.entries(data)) {
    if (!isBackupKey(k)) continue; // yabancı / abonelik anahtarları sessizce atlanır
    if (v == null) continue;
    entries.push([k, typeof v === "string" ? v : JSON.stringify(v)]);
  }
  if (entries.length === 0) return { ok: false, error: "no_data" };
  return { ok: true, entries };
}

// ═══ İÇE AKTAR (metinden) — mevcut halisaha_ verilerini yedektekiyle DEĞİŞTİRİR ═══
// Abonelik/kota/cihaz anahtarlarına dokunmaz. Yazma yarıda kalırsa (kota dolu vb.)
// eski veriler geri konur. → { ok, keys, error? }
export function importBackupFromText(text) {
  const parsed = parseBackupText(text);
  if (!parsed.ok) return { ok: false, keys: 0, error: parsed.error };

  // Mevcut durumun anlık görüntüsü (geri alma için)
  const snapshot = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isBackupKey(k)) snapshot[k] = localStorage.getItem(k);
    }
  } catch (e) {
    return { ok: false, keys: 0, error: e?.message || "storage_unavailable" };
  }

  try {
    Object.keys(snapshot).forEach((k) => localStorage.removeItem(k));
    parsed.entries.forEach(([k, v]) => localStorage.setItem(k, v));
  } catch (e) {
    // ★ Geri al — yarım yedekle kalmasın
    try {
      parsed.entries.forEach(([k]) => localStorage.removeItem(k));
      Object.entries(snapshot).forEach(([k, v]) => { if (v != null) localStorage.setItem(k, v); });
    } catch {}
    return { ok: false, keys: 0, error: e?.message || "write_failed" };
  }
  return { ok: true, keys: parsed.entries.length };
}

// ═══ DOSYA SEÇ + İÇE AKTAR ═══
// Gizli <input type=file>. Kullanıcı vazgeçerse { ok:false, error:"cancelled" }.
export function pickAndImportBackup() {
  return new Promise((resolve) => {
    let settled = false;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";

    const cleanup = () => {
      window.removeEventListener("focus", onWindowFocus);
      try { input.remove(); } catch {}
    };
    const done = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) { done({ ok: false, keys: 0, error: "cancelled" }); return; }
      if (file.size > MAX_BACKUP_CHARS) { done({ ok: false, keys: 0, error: "too_large" }); return; }
      const reader = new FileReader();
      reader.onload = () => done(importBackupFromText(String(reader.result || "")));
      reader.onerror = () => done({ ok: false, keys: 0, error: "read_failed" });
      reader.readAsText(file);
    });

    // Vazgeçme: modern WebView'lar "cancel" yayınlar; desteklemeyenlerde
    // pencere odağı geri gelince bir süre bekleyip vazgeçildi say.
    const supportsCancel = "oncancel" in input;
    input.addEventListener("cancel", () => done({ ok: false, keys: 0, error: "cancelled" }));
    function onWindowFocus() {
      if (supportsCancel) return;
      setTimeout(() => {
        if (!settled && !(input.files && input.files.length)) {
          done({ ok: false, keys: 0, error: "cancelled" });
        }
      }, 2500);
    }

    document.body.appendChild(input);
    // Odak dinleyicisini seçici açıldıktan sonra ekle (açılırken gelen focus'u sayma)
    setTimeout(() => window.addEventListener("focus", onWindowFocus), 400);
    try {
      input.click();
    } catch (e) {
      done({ ok: false, keys: 0, error: e?.message || "picker_failed" });
    }
  });
}
