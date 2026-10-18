// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Profesyonel Davet Paylaşım Modal'ı
// ─────────────────────────────────────────────────────────────
// Bottom-sheet stili tam ekran modal. 3 sekme:
//   1. LINK — Tek tıkla katılım URL'i + WhatsApp/Telegram/SMS
//   2. QR KOD — Yan masadakiler kameralarını tutup direkt girsin
//   3. KOD — Eski usul manuel girilen HK-XXXX
//
// Bağımlılıklar:
//   • qrcode.react  →  npm install qrcode.react
//   • deepLink.js (aynı klasör)
//   • haptics.js (aynı klasör)
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { buildJoinUrl, buildShareText } from './deepLink';
import { hapticLight, hapticSuccess } from './haptics';

// Renk paleti — LiveMatch ile bire bir tutarlı
const C = {
  bg:      '#0a0e15',
  surface: '#0d1117',
  border:  'rgba(255,255,255,0.08)',
  text:    '#e2e8f0',
  muted:   '#64748b',
  accent:  '#34d399',
  warn:    '#fbbf24',
};

export default function ShareInviteModal({
  open,
  onClose,
  session,
  hostNickname,
  onToast,   // (msg: string) => void
}) {
  const [tab, setTab] = useState('link');
  const [copied, setCopied] = useState(null); // 'link' | 'text' | 'code'
  const [mounted, setMounted] = useState(false);

  // Mount/unmount animasyonu için
  useEffect(() => {
    if (open) {
      setMounted(true);
      setTab('link');
      setCopied(null);
    } else {
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted && !open) return null;
  if (!session) return null;

  const code = session.join_code;
  const url = buildJoinUrl(code);
  const shareText = buildShareText({
    code,
    fieldName: session.field_name,
    teamAName: session.team_a_name,
    teamBName: session.team_b_name,
    hostNickname,
    scheduledAt: session.scheduled_at,
  });
  const colA = session.team_a_color || '#34d399';
  const colB = session.team_b_color || '#f87171';

  // ─── Kopyalama yardımcı ───
  const copy = async (value, kind) => {
    try {
      await navigator.clipboard.writeText(value);
      hapticSuccess();
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
      onToast && onToast(
        kind === 'link' ? '🔗 Link kopyalandı' :
        kind === 'code' ? '🔑 Kod kopyalandı' :
                          '📋 Davet metni kopyalandı'
      );
    } catch {
      onToast && onToast('❌ Kopyalanamadı');
    }
  };

  // ─── Native Share API ───
  const openNativeShare = async () => {
    hapticLight();
    if (!navigator.share) { copy(shareText, 'text'); return; }
    try {
      await navigator.share({
        title: `${session.team_a_name || 'Takım A'} vs ${session.team_b_name || 'Takım B'} — HalıSaha`,
        text: shareText,
        url,
      });
    } catch (e) {
      if (!/cancel/i.test(e?.message || '')) copy(shareText, 'text');
    }
  };

  // ─── Hızlı paylaşım butonları ───
  const openWhatsApp = () => {
    hapticLight();
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };
  const openTelegram = () => {
    hapticLight();
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(shareText);
    window.open(`https://t.me/share/url?url=${u}&text=${t}`, '_blank');
  };
  const openSMS = () => {
    hapticLight();
    // iOS ve Android'de "&body=" çalışır (eski iOS'larda "?body=" gerek olsa da modern hepsi destekler)
    window.location.href = `sms:?&body=${encodeURIComponent(shareText)}`;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: open ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'background 0.28s ease',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540,
          maxHeight: '92vh',
          background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
          borderTop: `1px solid ${C.border}`,
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(52,211,153,0.08)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.36s cubic-bezier(0.32, 0.72, 0, 1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{
            width: 38, height: 4, borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
          }} />
        </div>

        {/* ═══════ HEADER ═══════ */}
        <div style={{
          padding: '12px 20px 16px',
          borderBottom: `1px solid ${C.border}`,
          background: `linear-gradient(135deg, ${colA}0a 0%, transparent 50%, ${colB}0a 100%)`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 10, color: C.muted, fontWeight: 700,
                letterSpacing: 1.6, textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 5,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: C.accent,
                  animation: 'shareModalPulse 2s ease-in-out infinite',
                }} />
                Davet · Maça katıl
              </div>
              <div style={{
                fontSize: 19, fontWeight: 800, color: C.text,
                letterSpacing: -0.4, lineHeight: 1.2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: "'DM Sans', sans-serif",
              }}>{session.field_name || 'Halı Saha Maçı'}</div>

              {session.team_a_name && session.team_b_name && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  marginTop: 10, fontSize: 12, fontWeight: 700, color: C.text,
                  flexWrap: 'wrap',
                }}>
                  <TeamChip name={session.team_a_name} color={colA} />
                  <span style={{
                    color: C.muted,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, fontWeight: 800, letterSpacing: 1,
                  }}>VS</span>
                  <TeamChip name={session.team_b_name} color={colB} />
                </div>
              )}
            </div>
            <button onClick={onClose} aria-label="Kapat" style={{
              flexShrink: 0,
              width: 34, height: 34, borderRadius: 11,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${C.border}`,
              color: C.text, fontSize: 15,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s ease',
              WebkitTapHighlightColor: 'transparent',
            }}>✕</button>
          </div>
        </div>

        {/* ═══════ TABS ═══════ */}
        <div style={{ display: 'flex', padding: '12px 14px 0', gap: 6 }}>
          {[
            { id: 'link', label: 'Link', icon: '🔗' },
            { id: 'qr',   label: 'QR Kod', icon: '📷' },
            { id: 'code', label: 'Kod', icon: '🔑' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { hapticLight(); setTab(t.id); }}
              style={{
                flex: 1, padding: '10px 6px', borderRadius: 12,
                background: tab === t.id ? `${C.accent}18` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${tab === t.id ? `${C.accent}55` : C.border}`,
                color: tab === t.id ? C.accent : C.text,
                fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.18s ease',
                WebkitTapHighlightColor: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ═══════ CONTENT (scrollable) ═══════ */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 20px 28px',
          WebkitOverflowScrolling: 'touch',
        }}>

          {/* ─── LINK TAB ─── */}
          {tab === 'link' && (
            <div style={{ animation: 'shareModalFadeIn 0.28s ease' }}>
              <div style={{
                background: `linear-gradient(135deg, ${colA}0c 0%, ${colB}0c 100%)`,
                border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '14px 16px',
                marginBottom: 16,
              }}>
                <div style={{
                  fontSize: 9.5, color: C.muted, fontWeight: 700,
                  letterSpacing: 1.6, textTransform: 'uppercase',
                  marginBottom: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>Davet bağlantısı</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(0,0,0,0.4)',
                  border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '11px 12px',
                }}>
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                    fontSize: 11.5, color: C.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{url}</span>
                  <button onClick={() => copy(url, 'link')} style={{
                    flexShrink: 0,
                    background: copied === 'link' ? `${C.accent}22` : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${copied === 'link' ? `${C.accent}66` : C.border}`,
                    color: copied === 'link' ? C.accent : C.text,
                    borderRadius: 8, padding: '7px 14px',
                    fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'all 0.18s',
                    minWidth: 86,
                    WebkitTapHighlightColor: 'transparent',
                  }}>{copied === 'link' ? '✓ Tamam' : 'Kopyala'}</button>
                </div>
              </div>

              <div style={{
                fontSize: 10, color: C.muted, fontWeight: 700,
                letterSpacing: 1.6, textTransform: 'uppercase',
                marginBottom: 10,
                fontFamily: "'JetBrains Mono', monospace",
              }}>Hızlı paylaş</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <ShareBtn icon="🟢" label="WhatsApp" onClick={openWhatsApp} color="#25D366" />
                <ShareBtn icon="✈️" label="Telegram" onClick={openTelegram} color="#229ED9" />
                <ShareBtn icon="💬" label="SMS"      onClick={openSMS}      color="#34d399" />
                <ShareBtn icon="📤" label="Diğer…"   onClick={openNativeShare} color="#94a3b8" />
              </div>

              <button onClick={() => copy(shareText, 'text')} style={{
                width: '100%', marginTop: 14,
                padding: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                color: C.text, fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 0.18s ease',
              }}>
                {copied === 'text' ? '✓ Davet metni kopyalandı' : '📋 Tüm davet metnini kopyala'}
              </button>
            </div>
          )}

          {/* ─── QR TAB ─── */}
          {tab === 'qr' && (
            <div style={{ textAlign: 'center', animation: 'shareModalFadeIn 0.28s ease' }}>
              <div style={{
                fontSize: 12.5, color: C.muted, lineHeight: 1.55,
                marginBottom: 20,
                padding: '0 14px',
              }}>
                Arkadaşların kameralarını kodun üzerine tutsun —
                <br/>uygulama yüklüyse doğrudan maça girer, değilse mağaza açılır.
              </div>

              <div style={{
                display: 'inline-block',
                padding: 16,
                background: '#fff',
                borderRadius: 18,
                boxShadow: `0 12px 40px rgba(52,211,153,0.22), 0 0 0 1px rgba(52,211,153,0.15)`,
                marginBottom: 18,
              }}>
                <QRCodeSVG
                  value={url}
                  size={216}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0e15"
                  includeMargin={false}
                />
              </div>

              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15, fontWeight: 800,
                color: C.accent,
                letterSpacing: 3,
                marginBottom: 6,
              }}>{code}</div>

              <div style={{
                fontSize: 11, color: C.muted,
                marginBottom: 18,
                lineHeight: 1.5,
              }}>
                💡 İpucu: Ekran parlaklığını maksimuma alırsan
                <br/>QR daha hızlı taranır
              </div>

              <button onClick={openNativeShare} style={{
                padding: '12px 22px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                color: C.text, fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                WebkitTapHighlightColor: 'transparent',
              }}>📤 QR'yi paylaş</button>
            </div>
          )}

          {/* ─── CODE TAB ─── */}
          {tab === 'code' && (
            <div style={{
              textAlign: 'center', padding: '14px 0 8px',
              animation: 'shareModalFadeIn 0.28s ease',
            }}>
              <div style={{
                fontSize: 10.5, color: C.muted, fontWeight: 700,
                letterSpacing: 1.8, textTransform: 'uppercase',
                marginBottom: 16,
                fontFamily: "'JetBrains Mono', monospace",
              }}>Davet Kodu</div>

              <div style={{
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                fontSize: 48, fontWeight: 900,
                color: C.accent,
                letterSpacing: 6,
                lineHeight: 1.1,
                textShadow: `0 4px 24px ${C.accent}55`,
                marginBottom: 22,
              }}>{code}</div>

              <button onClick={() => copy(code, 'code')} style={{
                padding: '13px 36px',
                background: copied === 'code' ? `${C.accent}22` : `linear-gradient(135deg, ${C.accent} 0%, #10b981 100%)`,
                color: copied === 'code' ? C.accent : '#0a1628',
                border: `1px solid ${C.accent}88`,
                borderRadius: 12,
                fontSize: 14, fontWeight: 800,
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: 24,
                minWidth: 200,
                boxShadow: copied === 'code' ? 'none' : `0 10px 26px ${C.accent}55`,
                transition: 'all 0.18s',
                WebkitTapHighlightColor: 'transparent',
              }}>{copied === 'code' ? '✓ Kopyalandı' : 'Kodu Kopyala'}</button>

              <div style={{
                background: 'rgba(251,191,36,0.06)',
                border: '1px solid rgba(251,191,36,0.22)',
                borderRadius: 12,
                padding: '12px 16px',
                textAlign: 'left',
                fontSize: 12.5, color: C.muted,
                lineHeight: 1.65,
              }}>
                <div style={{
                  fontSize: 10, color: C.warn, fontWeight: 700,
                  letterSpacing: 1.4, textTransform: 'uppercase',
                  marginBottom: 6,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>Manuel giriş</div>
                Arkadaşının uygulamasında: <strong style={{ color: C.text }}>Live Match → Katıl</strong> menüsüne git ve yukarıdaki kodu yaz.
              </div>
            </div>
          )}

        </div>

        {/* Global animations */}
        <style>{`
          @keyframes shareModalPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.85); }
          }
          @keyframes shareModalFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

// ─── ALT BİLEŞENLER ──────────────────────────────────────────

function TeamChip({ name, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: `${color}18`,
      border: `1px solid ${color}44`,
      fontSize: 11.5, fontWeight: 700,
      color: '#e2e8f0',
      maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color, boxShadow: `0 0 8px ${color}aa`,
        flexShrink: 0,
      }} />
      {name}
    </span>
  );
}

function ShareBtn({ icon, label, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '13px 14px',
      background: `${color}12`,
      border: `1px solid ${color}38`,
      borderRadius: 12,
      color: C.text, fontSize: 13, fontWeight: 700,
      cursor: 'pointer',
      fontFamily: "'DM Sans', sans-serif",
      transition: 'all 0.18s ease',
      WebkitTapHighlightColor: 'transparent',
      textAlign: 'left',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}