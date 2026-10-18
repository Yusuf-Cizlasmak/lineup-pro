// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Web Landing Page (Deep Link Fallback)
// ─────────────────────────────────────────────────────────────
// Bu sayfa NORMAL ŞARTLARDA görülmez:
//   • Paylaşılan linkler /m/HK-XXXX formatında → Worker'ın kendi davet
//     sayfası karşılar (public/_worker.js). Bu React sayfası sadece eski
//     /?code=HK-XXXX ve /#/m/HK-XXXX linkleri için yedek.
//   • Mobile (Worker yoksa/yetişmezse) → tryNativeRedirect (index.js)
//     React mount'tan ÖNCE redirect yapar
//   • Mobile (yine yetişmezse) → BU sayfa mount-time'da otomatik
//     deneme yapar (en son fallback)
//   • Desktop → BU sayfayı manuel buton kontrollü gösterir
//
// Yani bu sayfa fiilen sadece DESKTOP'TA görünür ya da çok nadir
// edge case'lerde mobile'da kısa süre flash eder.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import {
  buildSchemeUrl, buildIntentUrl, getStoreUrl,
  IOS_APP_URL, ANDROID_APP_URL,
} from './deepLink';

const detectPlatform = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
};

export default function JoinLandingPage({ code, onContinueWeb }) {
  const [tryingApp, setTryingApp] = useState(false);
  const [appNotInstalled, setAppNotInstalled] = useState(false);
  const [platform] = useState(detectPlatform);
  const autoTried = useRef(false);
  const storeUrl = getStoreUrl(code);
  // Worker app'i zaten denedi ve buraya düştüyse (?fallback=1) tekrar deneme → döngü olmasın
  const alreadyTried = typeof window !== 'undefined' && /[?&]fallback=1\b/.test(window.location.search);

  // ─── Uygulamada açma — Android intent / iOS scheme ───
  const openInApp = () => {
    setTryingApp(true);
    setAppNotInstalled(false);

    if (platform === 'android') {
      window.location.replace(buildIntentUrl(code, storeUrl || ANDROID_APP_URL));
      return;
    }

    const schemeUrl = buildSchemeUrl(code);
    const start = Date.now();

    try {
      window.location.replace(schemeUrl);
    } catch {}

    setTimeout(() => {
      const elapsed = Date.now() - start;
      const stillHere = !document.hidden;
      setTryingApp(false);
      if (stillHere && elapsed < 3000) {
        setAppNotInstalled(true);
        if (storeUrl) {
          setTimeout(() => window.location.replace(storeUrl), 800);
        }
      }
    }, 1800);
  };

  // ─── MOUNT'TA OTOMATİK TETİKLE (mobile ise) ───
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (alreadyTried) { setAppNotInstalled(true); return; }

    if (platform === 'android' || platform === 'ios') {
      const t = setTimeout(() => openInApp(), 50);
      return () => clearTimeout(t);
    }
  }, [platform]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isMobile = platform === 'android' || platform === 'ios';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at top, #0d1d2e 0%, #050810 60%, #020409 100%)',
      color: '#e2e8f0',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      overflowY: 'auto',
      zIndex: 99999,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 25%, rgba(52,211,153,0.08) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '40px 24px',
        maxWidth: 460, margin: '0 auto', width: '100%',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          width: 84, height: 84, borderRadius: 22,
          background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 46,
          boxShadow: '0 20px 50px rgba(52,211,153,0.45), inset 0 0 0 1px rgba(255,255,255,0.1)',
          marginBottom: 24,
          animation: isMobile ? 'jlpFloat 1.6s ease-in-out infinite' : 'jlpFloat 4s ease-in-out infinite',
        }}>⚽</div>

        {isMobile ? (
          <>
            <h1 style={{
              fontSize: 22, fontWeight: 800,
              letterSpacing: -0.4,
              textAlign: 'center',
              margin: '0 0 8px',
            }}>Uygulama açılıyor…</h1>
            <p style={{
              fontSize: 13.5, color: '#94a3b8',
              textAlign: 'center', margin: '0 0 24px',
            }}>Kod: <strong style={{ color: '#34d399', fontFamily: "'JetBrains Mono', monospace" }}>{code}</strong></p>

            {appNotInstalled && (
              <div style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.28)',
                borderRadius: 12,
                padding: '14px 16px',
                fontSize: 13, color: '#fbbf24',
                textAlign: 'center', lineHeight: 1.55,
                animation: 'jlpFadeIn 0.3s ease',
                marginBottom: 14,
                maxWidth: 340,
              }}>
                Uygulama açılmadı — yüklü değil gibi görünüyor.
                {storeUrl ? (
                  <>
                    {' '}<a href={storeUrl} style={{ color: '#fbbf24', textDecoration: 'underline', fontWeight: 800 }}>
                      Hemen indir →
                    </a>
                  </>
                ) : (
                  <>
                    {' '}<button onClick={onContinueWeb} style={{
                      background: 'none', border: 'none', padding: 0,
                      color: '#fbbf24', textDecoration: 'underline',
                      fontWeight: 800, cursor: 'pointer', fontSize: 'inherit',
                      fontFamily: 'inherit',
                    }}>
                      Tarayıcıda devam et →
                    </button>
                  </>
                )}
              </div>
            )}

            {!appNotInstalled && (
              <button
                onClick={openInApp}
                disabled={tryingApp}
                style={{
                  marginTop: 12,
                  padding: '10px 22px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 11, color: '#94a3b8',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {tryingApp ? 'Açılıyor...' : 'Açılmadı mı? Tekrar dene'}
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{
              fontSize: 10.5, color: 'rgba(148,163,184,0.75)', fontWeight: 700,
              letterSpacing: 2, textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 8,
            }}>HalıSaha-Kolik · Davet</div>

            <h1 style={{
              fontSize: 28, fontWeight: 800,
              letterSpacing: -0.5,
              textAlign: 'center',
              margin: '0 0 10px',
              lineHeight: 1.15,
            }}>Maça davet edildin</h1>

            <p style={{
              fontSize: 14.5, color: '#94a3b8',
              textAlign: 'center', lineHeight: 1.55,
              margin: '0 0 28px',
              maxWidth: 360,
            }}>Telefonundan tekrar açarsan uygulama doğrudan açılır.<br/>
            Şimdilik tarayıcıda devam edebilirsin.</p>

            <div style={{
              background: 'linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(16,185,129,0.04) 100%)',
              border: '1px solid rgba(52,211,153,0.28)',
              borderRadius: 16,
              padding: '14px 26px',
              marginBottom: 32,
              textAlign: 'center',
              boxShadow: '0 8px 24px rgba(52,211,153,0.08)',
            }}>
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.55)',
                fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 5,
              }}>Davet Kodu</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 28, fontWeight: 900,
                color: '#34d399',
                letterSpacing: 5,
                lineHeight: 1.1,
              }}>{code}</div>
            </div>

            <button
              onClick={onContinueWeb}
              style={{
                width: '100%', maxWidth: 320,
                padding: '14px',
                background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
                color: '#0a1628',
                border: 'none',
                borderRadius: 14,
                fontSize: 14, fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 12px 30px rgba(52,211,153,0.4)',
                marginBottom: 22,
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}>
              🌐 Tarayıcıda Devam Et
            </button>

            {(IOS_APP_URL || ANDROID_APP_URL) && (
              <>
                <div style={{
                  fontSize: 10, color: 'rgba(148,163,184,0.6)',
                  letterSpacing: 1.5, textTransform: 'uppercase',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  marginBottom: 12,
                }}>Uygulamayı indir</div>
                <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
                  {IOS_APP_URL && (
                    <a href={IOS_APP_URL} style={storeBtn}>
                      <span style={{ fontSize: 18 }}>🍎</span>
                      <span>App Store</span>
                    </a>
                  )}
                  {ANDROID_APP_URL && (
                    <a href={ANDROID_APP_URL} style={storeBtn}>
                      <span style={{ fontSize: 18 }}>▶️</span>
                      <span>Play Store</span>
                    </a>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div style={{
        textAlign: 'center',
        padding: '20px 24px',
        fontSize: 11, color: 'rgba(148,163,184,0.45)',
        letterSpacing: 0.4,
        position: 'relative', zIndex: 1,
      }}>
        HalıSaha-Kolik · Halı saha maçların için
      </div>

      <style>{`
        @keyframes jlpFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.04); }
        }
        @keyframes jlpFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const storeBtn = {
  flex: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 8,
  padding: '12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#e2e8f0',
  textDecoration: 'none',
  fontSize: 13, fontWeight: 700,
  fontFamily: 'inherit',
  WebkitTapHighlightColor: 'transparent',
};