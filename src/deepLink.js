// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Deep Link / Universal URL helpers
// ─────────────────────────────────────────────────────────────
// Uygulama tarafındaki tüm deep-link mantığı burada. Sunucu tarafı
// (davet sayfası, apple-app-site-association, assetlinks.json) →
// public/_worker.js. Akış:
//   Link / QR → https://<domain>/m/HK-AB12
//     • App yüklü  → iOS Universal Link / Android App Link app'i açar
//                    → App.js → queueJoinCode → doğrudan odaya katılım
//     • App yok    → Worker davet sayfası → App Store / Google Play
// ─────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core';

// ─── KONFİG ───────────────────────────────────────────────────
// Davet akışının tamamı → docs/DAVET_LINKI_KURULUM.md

// ★ WEB_BASE — Davet linkinin domain'i (Cloudflare Worker: public/_worker.js).
//   Build sırasında REACT_APP_WEB_BASE ile ezilebilir. Domain değişirse
//   şunlar da aynı domain'e güncellenmeli:
//     • ios/App/App/App.entitlements          → applinks:<domain>
//     • android/app/src/main/AndroidManifest.xml → android:host="<domain>"
//   Not: Domain değişince eski linkler/QR'lar çalışmaz — kalıcı bir domain seç.
export const WEB_BASE = (
  process.env.REACT_APP_WEB_BASE || 'https://davet.halisahakolik.com.tr'
).replace(/\/+$/, '');

// ★ CUSTOM_SCHEME — Native uygulamayı doğrudan açan URI scheme.
//   iOS: ios/App/App/Info.plist → CFBundleURLTypes
//   Android: android/app/src/main/AndroidManifest.xml → intent-filter
export const CUSTOM_SCHEME = 'halisahakolik';

// ★ Android paket adı — intent:// URL'sinde kullanılır
//   capacitor_config.ts'deki appId ile aynı olmalı
export const ANDROID_PACKAGE_NAME = 'com.halisahakolik.app';

// ★ App Store kimliği — App Store Connect → Uygulama → Uygulama Bilgileri →
//   "Apple Kimliği" (sadece rakamlar, örn. 6741234567). public/_worker.js'deki
//   IOS_APP_STORE_ID (wrangler.toml [vars]) ile AYNI olmalı.
export const IOS_APP_STORE_ID = process.env.REACT_APP_IOS_APP_STORE_ID || '';

// ★ Store linkleri — app yüklü değilken yönlendirilecek sayfa
export const IOS_APP_URL = IOS_APP_STORE_ID
  ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
  : '';
export const ANDROID_APP_URL =
  `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;

// ★ Uygulamanın tanıtım sitesi + tüm paylaşımların alt bilgisi (büyüme döngüsü:
//   her paylaşılan görsel/metin uygulamaya geri link verir)
export const APP_SITE_URL = 'https://halisahakolik.com.tr';
export const SHARE_FOOTER = '⚽ HalıSaha-Kolik ile kuruldu · halisahakolik.com.tr';

// ─── URL ÜRETİCİLERİ ─────────────────────────────────────────

/**
 * Path-based maç katılım linki — paylaşım metni ve QR kod bunu kullanır.
 * App yüklüyse işletim sistemi linki doğrudan uygulamaya verir; değilse
 * Worker davet sayfasını gösterip mağazaya yönlendirir.
 *
 * Format:  https://davet.halisahakolik.com.tr/m/HK-AB12
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

// code verilirse Play Store linkine install referrer eklenir
// (ileride "yükledikten sonra otomatik katıl" için okunabilir).
export const getStoreUrl = (code) => {
  const p = detectPlatform();
  if (p === 'android') {
    return code
      ? `${ANDROID_APP_URL}&referrer=${encodeURIComponent(`hk_code=${code}`)}`
      : ANDROID_APP_URL;
  }
  if (p === 'ios') return IOS_APP_URL || null;
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

  // Kullanıcı "tarayıcıda devam et" dedi ya da Worker zaten app'i denedi →
  // tekrar yönlendirme yapma (aksi halde app ↔ web arasında döngü olur)
  if (/[?&](?:web|fallback)=1\b/.test(window.location.search)) return false;

  const platform = detectPlatform();
  if (platform === 'desktop' || platform === 'unknown') return false;

  if (platform === 'android') {
    const fallback = getStoreUrl(code) || `${WEB_BASE}/?fallback=1&code=${code}`;
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

// ─── BEKLEYEN DAVET (link / QR ile gelen kod) ─────────────────
// App.js kodu buraya koyar + event yayınlar. HaliSahaKolik event'i görünce
// Online moda geçer; LiveMatch mount olunca kodu alıp doğrudan odaya katılır.
// Kullanıcı o an hangi ekranda olursa olsun kod kaybolmaz.

export const JOIN_CODE_EVENT = 'halisaha:join-code';
const PENDING_TTL_MS = 15 * 60 * 1000;
let _pendingJoin = null; // { code, at }

const isValidCode = (code) => /^HK-[A-Z0-9]{4,8}$/.test(code || '');

export const queueJoinCode = (rawCode) => {
  const code = normalizeCode(rawCode || '');
  if (!isValidCode(code)) return false;
  _pendingJoin = { code, at: Date.now() };
  window.dispatchEvent(new CustomEvent(JOIN_CODE_EVENT, { detail: { code } }));
  return true;
};

export const peekPendingJoinCode = () => {
  if (!_pendingJoin) return null;
  if (Date.now() - _pendingJoin.at > PENDING_TTL_MS) { _pendingJoin = null; return null; }
  return _pendingJoin.code;
};

export const takePendingJoinCode = () => {
  const code = peekPendingJoinCode();
  _pendingJoin = null;
  return code;
};

// ─── HELPER ───────────────────────────────────────────────────
export const isNative = () => {
  try { return Capacitor.isNativePlatform(); }
  catch { return false; }
};