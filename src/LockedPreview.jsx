// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · LockedPreview
// ─────────────────────────────────────────────────────────────
// "Lock with reason" pattern — kullanıcı kilitli özelliğin
// GERÇEK görüntüsünü blur ile görür, üstüne lock overlay + CTA.
//
// PaywallGate (info kartı) vs LockedPreview (içerik üzerinde lock):
//   • PaywallGate inline   → "burada bir özellik vardı, Pro al" satırı
//   • PaywallGate block    → büyük info kartı, içerik yerine
//   • LockedPreview        → içeriğin KENDİSİ + üstünde lock — bu en güçlüsü
//
// Kullanım:
//   <LockedPreview feature="unlimited_online" locked={!isPremium}>
//     <OnlineModeCard ... />
//   </LockedPreview>
//
// Props:
//   - locked   : boolean — false ise children olduğu gibi render edilir
//   - feature  : paywall feature key (cloud_sync, unlimited_online, vb.)
//   - title    : (opsiyonel) override başlık
//   - subtitle : (opsiyonel) override açıklama
//   - ctaLabel : (opsiyonel) CTA buton metni
//   - blur     : "soft" | "medium" | "hard" — overlay blur şiddeti
//   - tone     : "gold" | "blue" — accent rengi
// ─────────────────────────────────────────────────────────────
import React from "react";
import { useSubscription } from "./subscription";
import { hapticMedium } from "./haptics";

const FEATURE_DEFAULTS = {
  cloud_sync:        { title: "Bulut Senkronu",     sub: "Telefon değiştirsen bile tüm verilerin saklı kalır.", tone: "blue" },
  unlimited_online:  { title: "Sınırsız Online",    sub: "Sınırsız oda kur · Sınırsız maça katıl",              tone: "gold" },
  unlimited_history: { title: "Sınırsız Geçmiş",    sub: "Tüm maçlarını ve istatistiklerini sakla",             tone: "gold" },
  no_ads:            { title: "Reklamsız Deneyim",  sub: "Banner ve geçiş reklamları kalksın",                  tone: "gold" },
  multi_team:        { title: "Sınırsız Takım",     sub: "İstediğin kadar takım yönet",                          tone: "blue" },
  brand_team:        { title: "Takım Brand'i",      sub: "Logo, renk, sponsor — paylaşımlarda görünsün",        tone: "blue" },
  ai_coach:          { title: "AI Antrenör",        sub: "Maç sonrası taktiksel analiz — sana özel",            tone: "blue" },
  general:           { title: "Premium Özellik",    sub: "Bu özellik Pro üyeler içindir",                       tone: "gold" },
};

const TONES = {
  gold: {
    accent:    "#fbbf24",
    accentDim: "#f59e0b",
    glow:      "rgba(251,191,36,0.32)",
    soft:      "rgba(251,191,36,0.12)",
    border:    "rgba(251,191,36,0.4)",
  },
  blue: {
    accent:    "#60a5fa",
    accentDim: "#3b82f6",
    glow:      "rgba(96,165,250,0.28)",
    soft:      "rgba(96,165,250,0.10)",
    border:    "rgba(96,165,250,0.4)",
  },
};

const BLUR_MAP = {
  soft:   "blur(2px) saturate(0.7)",
  medium: "blur(4px) saturate(0.55)",
  hard:   "blur(7px) saturate(0.4)",
};

export default function LockedPreview({
  locked = true,
  feature = "general",
  title,
  subtitle,
  ctaLabel,
  blur = "medium",
  tone,
  fullCover = false,
  children,
  style = {},
}) {
  const { openPaywall } = useSubscription();

  if (!locked) return <>{children}</>;

  const info = FEATURE_DEFAULTS[feature] || FEATURE_DEFAULTS.general;
  const T = TONES[tone || info.tone] || TONES.gold;
  const heading = title || info.title;
  const sub = subtitle || info.sub;
  const cta = ctaLabel || "Pro'ya Geç";

  const handleTap = (e) => {
    e.stopPropagation();
    e.preventDefault();
    hapticMedium();
    openPaywall(feature);
  };

  return (
    <div
      onClick={handleTap}
      role="button"
      aria-label={`${heading} — Pro özelliği, açmak için tıkla`}
      style={{
        position: "relative",
        cursor: "pointer",
        borderRadius: "inherit",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Gerçek içerik — blur'lu, pointer-event yok */}
      <div
        aria-hidden
        style={{
          filter: BLUR_MAP[blur] || BLUR_MAP.medium,
          pointerEvents: "none",
          userSelect: "none",
          // Hafif desaturate + opacity → kullanıcı "var ama erişemiyorum" hissetsin
          opacity: 0.85,
          transform: "scale(1.01)", // blur kenarlarını kapatmak için
          transformOrigin: "center",
        }}
      >
        {children}
      </div>

      {/* Karanlık tabaka — okunabilirlik */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, rgba(4,7,11,0.45) 0%, rgba(4,7,11,0.72) 60%, rgba(4,7,11,0.85) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Accent halo — tone'a göre renkli ışıma */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "70%",
          height: "70%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${T.glow}, transparent 65%)`,
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />

      {/* Lock badge + CTA — merkezde */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 16,
          textAlign: "center",
          fontFamily: "'DM Sans','Inter Tight',sans-serif",
        }}
      >
        {/* Lock icon — minimal SVG, emoji değil */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: `linear-gradient(135deg, ${T.accent}, ${T.accentDim})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 8px 22px ${T.glow}, 0 0 0 4px rgba(255,255,255,0.04)`,
            marginBottom: 2,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a0805" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* Pro badge */}
        <div
          style={{
            fontSize: 8.5,
            fontWeight: 900,
            letterSpacing: 2,
            background: `linear-gradient(135deg, ${T.accent}, ${T.accentDim})`,
            color: "#0a0805",
            padding: "3px 9px",
            borderRadius: 4,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
          }}
        >
          ★ PRO ÖZELLİĞİ
        </div>

        {/* Başlık */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: -0.2,
            lineHeight: 1.15,
            maxWidth: 240,
          }}
        >
          {heading}
        </div>

        {/* Alt başlık */}
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: "rgba(255,255,255,0.65)",
              lineHeight: 1.4,
              maxWidth: 260,
              marginTop: -2,
            }}
          >
            {sub}
          </div>
        )}

        {/* CTA pill */}
        <div
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "8px 14px",
            background: `linear-gradient(135deg, ${T.accent}, ${T.accentDim})`,
            color: "#0a0805",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.3,
            boxShadow: `0 6px 14px ${T.glow}`,
          }}
        >
          {cta} <span style={{ fontSize: 13, lineHeight: 1 }}>→</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INLINE LOCK — küçük yerlere uygun, badge tarzı kullanım
// ═══════════════════════════════════════════════════════════
// Örn: bir satırın yanında "Pro" rozeti olarak kullanıma
export function InlineLockBadge({ feature = "general", tone = "gold" }) {
  const { openPaywall } = useSubscription();
  const T = TONES[tone] || TONES.gold;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        hapticMedium();
        openPaywall(feature);
      }}
      aria-label="Pro özelliği — kilidi aç"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        background: T.soft,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        color: T.accent,
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: 1.4,
        cursor: "pointer",
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
        whiteSpace: "nowrap",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      PRO
    </button>
  );
}