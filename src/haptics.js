// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Haptics (iOS + Android + Web)
// ─────────────────────────────────────────────────────────────
// iOS: @capacitor/haptics → Taptic Engine (UIImpactFeedbackGenerator)
// Android: @capacitor/haptics → VibratorManager (API 26+) / Vibrator (öncesi)
// Web/PWA: navigator.vibrate (Android Chrome'da çalışır, iOS Safari yok sayar)
// ─────────────────────────────────────────────────────────────
import { Capacitor } from "@capacitor/core";

let H = null;        // ImpactStyle, NotificationType ve Haptics modülü
let loaded = false;
let loading = null;

const STORAGE_KEY = "halisaha_haptics_off";

export const isHapticsEnabled = () => {
  try { return localStorage.getItem(STORAGE_KEY) !== "1"; } catch { return true; }
};
export const setHapticsEnabled = (on) => {
  try { localStorage.setItem(STORAGE_KEY, on ? "0" : "1"); } catch {}
};

const ensureLoaded = async () => {
  if (loaded || !Capacitor.isNativePlatform()) return loaded;
  if (loading) return loading;
  loading = (async () => {
    try {
      const mod = await import("@capacitor/haptics");
      H = mod;
      loaded = true;
    } catch (e) {
      // Plugin yoksa native'de de skip
      loaded = false;
    }
  })();
  await loading;
  return loaded;
};

// ───── Web fallback ─────
const webVibe = (ms) => {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  } catch {}
};

// ───── Public API ─────
// Hafif dokunuş — bir öğe seçildi, sürüklenmeye başlandı, vs.
export const hapticLight = async () => {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    if (await ensureLoaded()) {
      try { await H.Haptics.impact({ style: H.ImpactStyle.Light }); return; } catch {}
    }
  }
  webVibe(8);
};

// Orta — düğme tıklandı, oyuncu yerleştirildi
export const hapticMedium = async () => {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    if (await ensureLoaded()) {
      try { await H.Haptics.impact({ style: H.ImpactStyle.Medium }); return; } catch {}
    }
  }
  webVibe(15);
};

// Sert — gol eklendi, kaptan atandı, önemli işlem
export const hapticHeavy = async () => {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    if (await ensureLoaded()) {
      try { await H.Haptics.impact({ style: H.ImpactStyle.Heavy }); return; } catch {}
    }
  }
  webVibe(25);
};

// Başarı — kaydedildi, otomatik kadro kuruldu
export const hapticSuccess = async () => {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    if (await ensureLoaded()) {
      try { await H.Haptics.notification({ type: H.NotificationType.Success }); return; } catch {}
    }
  }
  webVibe([10, 30, 10]);
};

// Uyarı — silme, geri alma
export const hapticWarning = async () => {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    if (await ensureLoaded()) {
      try { await H.Haptics.notification({ type: H.NotificationType.Warning }); return; } catch {}
    }
  }
  webVibe([20, 40, 20]);
};

// Seçim değişti — segment kontrol, dropdown
export const hapticSelection = async () => {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    if (await ensureLoaded()) {
      try { await H.Haptics.selectionStart(); await H.Haptics.selectionChanged(); await H.Haptics.selectionEnd(); return; } catch {}
    }
  }
  webVibe(5);
};