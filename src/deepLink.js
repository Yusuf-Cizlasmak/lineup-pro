// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Deep Link / Universal URL helpers
// ─────────────────────────────────────────────────────────────
// Tüm deep-link mantığı tek yerden yönetilir. Domain veya scheme
// değiştirmek istersen sadece BURAYI düzenle — projedeki her yer
// otomatik adapte olur.
// ─────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core';

// ─── KONFİG ───────────────────────────────────────────────────

// ★ WEB_BASE — Davet linkinin domain'i.
//   Kendi domain'ini aldığında bu tek satırı değiştir:
export const WEB_BASE = 'https://halisaha-kolik.ycizlasmak.workers.dev';

// ★ CUSTOM_SCHEME — Native uygulamayı doğrudan açan URI scheme.
//   iOS: ios/App/App/Info.plist → CFBundleURLTypes
//   Android: android/app/src/main/AndroidManifest.xml → intent-filter
export const CUSTOM_SCHEME = 'halisahakolik';

// ★ Android paket adı — intent:// URL'sinde kullanılır
//   capacitor_config.ts'deki appId ile aynı olmalı
export const ANDROID_PACKAGE_NAME = 'com.halisahakolik.app';

// ★ Store linkleri — app yüklü değilken fallback. Henüz yayında
//   değilse boş bırak, web app'e fallback yapar.
export const IOS_APP_URL     = ''; // örn: 'https://apps.apple.com/app/idXXXXXXXXX'
export const ANDROID_APP_URL = ''; // örn: 'https://play.google.com/store/apps/details?id=com.halisahakolik.app'

// ─── URL ÜRETİCİLERİ ─────────────────────────────────────────

/**
 * Path-based maç katılım linki (Worker bu URL'yi görür ve mobile'da
 * SERVER-SIDE redirect eder — hiç ekran gözükmez).
 *
 * Format:  https://halisaha-kolik.ycizlasmak.workers.dev/m/HK-AB12
 */
export const buildJoinUrl = (code) => {
  if (!code) return WEB_BASE;
  return `${WEB_BASE}/m/${encodeURIComponent(code)}`;
};

/**
 * Native scheme URL — yüklü app'i doğrudan açar.
 */
export const buildSchemeUrl = (code) => {
  return `${CUSTOM_SCHEME}://join?code=${encodeURIComponent(code)}`;
};

/**
 * Android intent URL — Chrome bunu parse eder:
 *   - App yüklüyse → otomatik açar
 *   - App yoksa    → S.browser_fallback_url'e gider
 * Tek URL ile hem app açma hem store fallback. En güvenilir Android yol.
 */
export const buildIntentUrl = (code, fallbackUrl = '') => {
  const parts = [
    `intent://join?code=${encodeURIComponent(code)}#Intent`,
    `scheme=${CUSTOM_SCHEME}`,
    `package=${ANDROID_PACKAGE_NAME}`,
  ];
  if (fallbackUrl) parts.push(`S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`);
  parts.push('end');
  return parts.join(';');
};

/**
 * WhatsApp / iMessage / SMS için zengin davet metni.
 */
export const buildShareText = ({
  code,
  fieldName,
  teamAName,
  teamBName,
  hostNickname,
  scheduledAt,
}) => {
  const url = buildJoinUrl(code);
  const lines = ['⚽ Halı Saha maçıma katıl!'];

  const meta = [];
  if (hostNickname)              meta.push(`👤 ${hostNickname} davet etti`);
  if (fieldName)                 meta.push(`📍 ${fieldName}`);
  if (teamAName && teamBName)    meta.push(`⚔️ ${teamAName} vs ${teamBName}`);
  if (scheduledAt) {
    try {
      const d = new Date(scheduledAt);
      const fmt = d.toLocaleString('tr-TR', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      });
      meta.push(`🕒 ${fmt}`);
    } catch {}
  }

  if (meta.length) {
    lines.push('');
    lines.push(...meta);
  }
  lines.push('');
  lines.push(`🔗 ${url}`);
  lines.push('');
  lines.push(`🔑 Kod: ${code}`);
  return lines.join('\n');
};

// ─── URL PARSER ───────────────────────────────────────────────

/**
 * URL'den katılım kodunu çıkarır. Şu formatları destekler:
 *
 *   https://x.com/m/HK-AB12            ← path (YENİ ANA FORMAT)
 *   https://x.com/#/m/HK-AB12          ← hash route (legacy)
 *   https://x.com/?code=HK-AB12        ← query
 *   https://x.com/?join=HK-AB12        ← alternatif query
 *   https://x.com/join/HK-AB12         ← path alternatif
 *   halisahakolik://join?code=HK-AB12  ← native scheme query
 *   halisahakolik:///m/HK-AB12         ← native scheme path
 */
export const parseCodeFromUrl = (rawUrl) => {
  if (!rawUrl) return null;
  const raw = String(rawUrl);

  try {
    // 1) Query param: ?code=HK-XXXX veya ?join=HK-XXXX
    const queryMatch = raw.match(/[?&](?:code|join)=([A-Z0-9-]+)/i);
    if (queryMatch) return normalizeCode(queryMatch[1]);

    // 2) Hash route veya path: /m/HK-XXXX veya /join/HK-XXXX
    const pathMatch = raw.match(/[/#]\/?(?:m|join)\/([A-Z0-9-]+)/i);
    if (pathMatch) return normalizeCode(pathMatch[1]);

    // 3) Direkt hostname olarak: halisahakolik://HK-XXXX
    const schemeHostMatch = raw.match(/^[a-z][a-z0-9+.-]*:\/\/(HK-?[A-Z0-9]{4,})/i);
    if (schemeHostMatch) return normalizeCode(schemeHostMatch[1]);

    return null;
  } catch {
    return null;
  }
};

const normalizeCode = (raw) => {
  const clean = String(raw).trim().toUpperCase();
  // HK-XXXX formatı bekliyoruz; tire yoksa ekle
  if (/^HK[A-Z0-9]{4}$/i.test(clean)) {
    return `HK-${clean.slice(2)}`;
  }
  return clean;
};

// ─── PLATFORM DETECTION ───────────────────────────────────────

const detectPlatform = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/android/.test(ua) && !/bot|crawler/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua) && !/bot|crawler/.test(ua)) return 'ios';
  return 'desktop';
};

// ─── STORE URL RESOLVER ───────────────────────────────────────

export const getStoreUrl = () => {
  const p = detectPlatform();
  if (p === 'android') return ANDROID_APP_URL || null;
  if (p === 'ios')     return IOS_APP_URL || null;
  return null;
};

// ─── EN ÖNEMLİSİ: AUTO-REDIRECT ──────────────────────────────

/**
 * Sayfa açılır açılmaz mobile cihazda native uygulamayı tetikler.
 * React mount edilmeden ÖNCE çağrılır (index.js'in en üstünde).
 *
 *   - Android  → intent:// URL  (app açılır VEYA Play Store'a fallback)
 *   - iOS      → scheme'i replace + 1.5sn sonra App Store fallback
 *   - Desktop  → no-op (React mount olsun, web app açılsın)
 *   - Native   → no-op (zaten uygulamanın içindeyiz)
 *
 * Genellikle Worker (server-side) bu sayfayı hiç render etmeden
 * redirect yapar. Bu fonksiyon Worker yoksa veya eski URL'lerde
 * (örn. WhatsApp önizlemeden gelirken) fallback olarak çalışır.
 *
 * @returns true: redirect tetiklendi
 *          false: desktop / kod yok / native — normal akış devam
 */
export const tryNativeRedirect = () => {
  if (typeof window === 'undefined') return false;
  if (isNative()) return false;

  const code = parseCodeFromUrl(window.location.href);
  if (!code) return false;

  const platform = detectPlatform();
  if (platform === 'desktop' || platform === 'unknown') return false;

  if (platform === 'android') {
    const fallback = ANDROID_APP_URL || `${WEB_BASE}/?fallback=1&code=${code}`;
    const intent = buildIntentUrl(code, fallback);
    window.location.replace(intent);
    return true;
  }

  if (platform === 'ios') {
    const schemeUrl = buildSchemeUrl(code);
    window.location.replace(schemeUrl);

    // App yüklü değilse 1.5sn sonra fallback
    setTimeout(() => {
      // Sayfa hala görünürse app açılmamış demektir
      if (document.hidden) return;
      if (IOS_APP_URL) {
        window.location.replace(IOS_APP_URL);
      }
      // Store URL yoksa: JoinLandingPage zaten mount olmuş olacak,
      // kullanıcıya "yüklü değil" mesajı gösterecek.
    }, 1500);
    return true;
  }

  return false;
};

// ─── HELPER ───────────────────────────────────────────────────
export const isNative = () => {
  try { return Capacitor.isNativePlatform(); }
  catch { return false; }
};