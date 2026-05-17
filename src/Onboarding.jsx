// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Onboarding — PREMIUM EDITION v2
// ─────────────────────────────────────────────────────────────
// Editorial sport-premium estetiği:
//   • Tek brand yeşil + son adımda altın "achievement" momenti
//   • Her adım için özel SVG illüstrasyon (jenerik emoji yok)
//   • Bebas Neue display + DM Sans body + JetBrains Mono micro
//   • Saha tebeşir çizgili subtle atmosfer
//   • Restrained motion — daha az ama daha kararlı animasyonlar
//   • Editöryel typography hiyerarşisi (eyebrow → display → body)
//
// i18n keys, swipe logic, banner-hide lifecycle KORUNDU.
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import logo from "./ssssss.png";
import { t, useLang, setLang } from "./i18n";
import { hideBanner } from "./admob";

// ═══════════════════════════════════════════════════════════
// BRAND — restrained palette
// ═══════════════════════════════════════════════════════════
const BRAND = {
  primary:    "#10b981",          // emerald — saha yeşili
  primaryDim: "#059669",
  gold:       "#fbbf24",          // yalnız finale
  goldDim:    "#f59e0b",
  bg:         "#06090e",
  bgDeep:     "#04070b",
  ink:        "#f4f4f5",
  inkDim:     "rgba(244,244,245,0.62)",
  inkFaint:   "rgba(244,244,245,0.32)",
  inkGhost:   "rgba(244,244,245,0.16)",
  line:       "rgba(255,255,255,0.07)",
  lineHi:     "rgba(255,255,255,0.14)",
};

// 8 adım — her adımın "kind" değeri illüstrasyon tipini söylüyor
const STEPS = [
  { key: 1, kind: "hero" },
  { key: 2, kind: "modes" },
  { key: 3, kind: "profile" },
  { key: 4, kind: "formation" },
  { key: 5, kind: "match" },
  { key: 6, kind: "stats" },
  { key: 7, kind: "podium" },
  { key: 8, kind: "share", finale: true },
];

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
export default function Onboarding({ onFinish }) {
  const [lang] = useLang();
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0);
  const startX = useRef(null);
  const wrap = useRef(null);

  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;
  const isFinale = !!step.finale;
  const accent = isFinale ? BRAND.gold : BRAND.primary;
  const accentDim = isFinale ? BRAND.goldDim : BRAND.primaryDim;
  const progress = ((idx + 1) / STEPS.length) * 100;

  // ── Swipe ──────────────────────────────────────────────
  const onStart = (x) => { startX.current = x; setDrag(0); };
  const onMove = (x) => {
    if (startX.current == null) return;
    setDrag(x - startX.current);
  };
  const onEnd = () => {
    const w = wrap.current?.offsetWidth || 320;
    const threshold = w * 0.18;
    if (drag < -threshold && idx < STEPS.length - 1) setIdx(idx + 1);
    else if (drag > threshold && idx > 0) setIdx(idx - 1);
    setDrag(0);
    startX.current = null;
  };

  // ── Klavye desteği (web testleri için) ─────────────────
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "ArrowRight" && idx < STEPS.length - 1) setIdx(idx + 1);
      if (e.key === "ArrowLeft" && idx > 0) setIdx(idx - 1);
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [idx, onFinish]);

  // ── Banner reklamı gizle (lifecycle KORUNDU) ──────────
  useEffect(() => {
    window.__onboardingActive = true;
    hideBanner();
    const interval = setInterval(() => {
      if (window.__onboardingActive) hideBanner();
    }, 500);
    return () => {
      clearInterval(interval);
      window.__onboardingActive = false;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("halisaha:onboarding-done"));
      }, 50);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 5000,
        maxWidth: 480,
        margin: "0 auto",
        color: BRAND.ink,
        fontFamily: "'DM Sans','Inter','Segoe UI',sans-serif",
        display: "flex",
        flexDirection: "column",
        paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        animation: "obFadeIn 0.55s ease-out",
        overflow: "hidden",
        background: BRAND.bg,
        boxShadow: "0 0 60px rgba(0,0,0,0.6)",
      }}
    >
      <style>{cssAnims}</style>

      {/* ─── ATMOSPHERE: pitch chalk + ambient mesh ─── */}
      <Atmosphere accent={accent} />

      {/* ─── TOP META: progress bar + lang + counter + skip ─── */}
      <div style={{ position: "relative", zIndex: 3, padding: "0 22px", flexShrink: 0 }}>
        {/* Thin premium progress bar */}
        <div style={{
          height: 2,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 14,
        }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${accent}, ${accentDim})`,
              borderRadius: 2,
              transition: "width 0.55s cubic-bezier(.65,0,.35,1), background 0.4s",
              boxShadow: `0 0 10px ${accent}aa`,
            }}
          />
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <LangToggle lang={lang} onChange={setLang} accent={accent} />
          <div style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: BRAND.inkFaint,
            letterSpacing: 2.2,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            fontVariantNumeric: "tabular-nums",
          }}>
            <span style={{ color: accent }}>{String(idx + 1).padStart(2, "0")}</span>
            <span style={{ opacity: 0.6 }}> · {STEPS.length}</span>
          </div>
          {!isLast ? (
            <button
              onClick={onFinish}
              style={{
                background: "transparent",
                border: "none",
                padding: "6px 4px",
                color: BRAND.inkFaint,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              {t("onb_skip")}
            </button>
          ) : (
            <div style={{ width: 44 }} />
          )}
        </div>
      </div>

      {/* ─── CONTENT — swipeable canvas ─── */}
      <div
        ref={wrap}
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onMouseDown={(e) => onStart(e.clientX)}
        onMouseMove={(e) => startX.current != null && onMove(e.clientX)}
        onMouseUp={onEnd}
        onMouseLeave={() => { if (startX.current != null) onEnd(); }}
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "10px 26px 12px",
          touchAction: "pan-y",
          userSelect: "none",
          minHeight: 0,
          transform: `translateX(${drag * 0.28}px)`,
          transition: drag === 0 ? "transform 0.32s cubic-bezier(.4,0,.2,1)" : "none",
        }}
      >
        {/* ─── ILLUSTRATION STAGE ─── */}
        <div
          key={`illus-${idx}`}
          style={{
            position: "relative",
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `translateX(${drag * 0.05}px)`,
            transition: drag === 0 ? "transform 0.4s cubic-bezier(.4,0,.2,1)" : "none",
            animation: "obStageIn 0.55s cubic-bezier(.2,.85,.3,1) both",
          }}
        >
          <StepIllustration kind={step.kind} accent={accent} idx={idx} logo={logo} />
        </div>

        {/* ─── COPY BLOCK — editorial left-aligned ─── */}
        <div
          key={`copy-${idx}`}
          style={{
            position: "relative",
            paddingTop: 18,
            paddingBottom: 8,
            animation: "obCopyIn 0.55s cubic-bezier(.2,.85,.3,1) 0.08s both",
          }}
        >
          {/* Editorial eyebrow */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 2.5,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            textTransform: "uppercase",
          }}>
            <span style={{ width: 18, height: 1, background: accent, opacity: 0.85 }} />
            <span style={{ color: accent, opacity: 0.9 }}>
              {idx === 0
                ? (lang === "tr" ? "Hoş geldin" : "Welcome")
                : isLast
                ? (lang === "tr" ? "Hazır mısın" : "You're set")
                : `${lang === "tr" ? "Adım" : "Step"} ${String(idx + 1).padStart(2, "0")}`}
            </span>
            <span style={{ flex: 1, height: 1, background: BRAND.line }} />
          </div>

          {/* Display heading — athletic */}
          <h2 style={{
            fontFamily: "'Bebas Neue','Oswald','Inter Tight',sans-serif",
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: 0.5,
            margin: 0,
            marginBottom: 12,
            color: BRAND.ink,
            textTransform: "uppercase",
            textShadow: "0 1px 0 rgba(0,0,0,0.4)",
          }}>
            {t(`onb_${step.key}_title`)}
          </h2>

          {/* Body */}
          <p style={{
            fontSize: 14.5,
            lineHeight: 1.62,
            color: BRAND.inkDim,
            margin: 0,
            fontWeight: 400,
            maxWidth: 360,
            letterSpacing: 0.05,
          }}>
            {t(`onb_${step.key}_desc`)}
          </p>
        </div>
      </div>

      {/* ─── FOOTER: pagination + CTA ─── */}
      <div style={{ position: "relative", zIndex: 3, padding: "0 22px", flexShrink: 0 }}>
        {/* Segmented progress dots */}
        <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
          {STEPS.map((s, i) => {
            const active = i === idx;
            const done = i < idx;
            return (
              <button
                key={s.key}
                onClick={() => setIdx(i)}
                aria-label={`step ${i + 1}`}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 1.5,
                  border: "none",
                  background: active
                    ? accent
                    : done
                    ? "rgba(244,244,245,0.42)"
                    : "rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 0.4s ease",
                  boxShadow: active ? `0 0 8px ${accent}88` : "none",
                }}
              />
            );
          })}
        </div>

        {/* CTA stack */}
        <div style={{ display: "flex", gap: 10 }}>
          {idx > 0 && !isLast && (
            <button
              onClick={() => setIdx(idx - 1)}
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                border: `1px solid ${BRAND.line}`,
                background: "rgba(255,255,255,0.02)",
                color: BRAND.inkDim,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: 0.3,
                fontVariantNumeric: "tabular-nums",
                backdropFilter: "blur(8px)",
              }}
              aria-label="Back"
            >
              ←
            </button>
          )}
          <button
            onClick={() => (isLast ? onFinish() : setIdx(idx + 1))}
            style={{
              position: "relative",
              flex: 1,
              padding: "16px 18px",
              borderRadius: 12,
              border: "none",
              background: `linear-gradient(135deg, ${accent} 0%, ${accentDim} 100%)`,
              color: "#0a1410",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              boxShadow: `0 10px 28px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.35)`,
              transition: "transform 0.14s ease",
              overflow: "hidden",
            }}
            onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.985)")}
            onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.985)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {/* Subtle inner shimmer */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)",
                backgroundSize: "220% 100%",
                animation: "obShimmer 2.8s linear infinite",
                pointerEvents: "none",
                mixBlendMode: "overlay",
                opacity: 0.7,
              }}
            />
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {isLast ? t("onb_start") : t("onb_next")}
              <span style={{ fontSize: 15, lineHeight: 1, transform: "translateY(-1px)" }}>
                {isLast ? "↗" : "→"}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LANG TOGGLE — minimal segmented (export edilmiş — ModeSelectScreen kullanıyor)
// ═══════════════════════════════════════════════════════════
export const LangToggle = ({ lang, onChange, accent = BRAND.primary }) => (
  <div style={{
    display: "inline-flex",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${BRAND.line}`,
    borderRadius: 999,
    padding: 2,
    backdropFilter: "blur(8px)",
  }}>
    {["tr", "en"].map((l) => {
      const active = lang === l;
      return (
        <button
          key={l}
          onClick={() => onChange(l)}
          style={{
            padding: "4px 10px",
            border: "none",
            background: active ? `${accent}22` : "transparent",
            color: active ? accent : BRAND.inkFaint,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.4,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            cursor: "pointer",
            borderRadius: 999,
            textTransform: "uppercase",
            transition: "all 0.25s ease",
          }}
        >
          {l}
        </button>
      );
    })}
  </div>
);

// ═══════════════════════════════════════════════════════════
// ATMOSPHERE — pitch chalk + ambient mesh
// ═══════════════════════════════════════════════════════════
const Atmosphere = ({ accent }) => (
  <>
    {/* Ambient gradient that follows accent */}
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background: `
          radial-gradient(ellipse 70% 50% at 50% -10%, ${accent}22, transparent 60%),
          radial-gradient(ellipse 80% 55% at 50% 110%, ${accent}14, transparent 65%),
          linear-gradient(180deg, ${BRAND.bg} 0%, ${BRAND.bgDeep} 100%)
        `,
        transition: "background 0.7s ease",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />

    {/* Stadium chalk pattern — very faint */}
    <svg
      aria-hidden
      width="100%"
      height="100%"
      viewBox="0 0 400 800"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.10,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <defs>
        <linearGradient id="chalkFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <mask id="chalkMask">
          <rect width="400" height="800" fill="url(#chalkFade)" />
        </mask>
      </defs>
      <g mask="url(#chalkMask)" stroke="#ffffff" strokeWidth="0.6" fill="none" opacity="0.5">
        <circle cx="200" cy="400" r="70" />
        <line x1="0" y1="400" x2="400" y2="400" />
        <rect x="100" y="100" width="200" height="80" />
        <rect x="100" y="620" width="200" height="80" />
        <circle cx="200" cy="400" r="2" fill="#ffffff" />
      </g>
    </svg>

    {/* Vignette */}
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse 100% 80% at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  </>
);

// ═══════════════════════════════════════════════════════════
// STEP ILLUSTRATIONS — her adım için özel SVG kompozisyon
// ═══════════════════════════════════════════════════════════
const StepIllustration = ({ kind, accent, idx, logo }) => {
  const FrameBox = ({ children }) => (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: "min(280px, 78vw)",
        aspectRatio: "1 / 1",
        maxHeight: "44vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Halo */}
      <div style={{
        position: "absolute",
        inset: "-12%",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}22 0%, transparent 65%)`,
        filter: "blur(8px)",
        animation: "obHalo 4s ease-in-out infinite",
      }} />
      {/* Thin frame ring */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 26,
        border: `1px solid ${accent}28`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0))",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 50px ${accent}1a`,
      }} />
      <div style={{
        position: "relative",
        width: "82%",
        height: "82%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {children}
      </div>
    </div>
  );

  // ── 1. HERO ────────────────────────────────────────
  if (kind === "hero") {
    return (
      <FrameBox>
        <div style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}>
          <div style={{ position: "relative", animation: "obFloat 5s ease-in-out infinite" }}>
            <img
              src={logo}
              alt="HalıSaha-Kolik"
              style={{
                width: 110,
                height: 110,
                borderRadius: 28,
                objectFit: "cover",
                boxShadow: `0 18px 50px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.18)`,
              }}
            />
            <div style={{
              position: "absolute",
              inset: -6,
              borderRadius: 34,
              border: `1px solid ${accent}55`,
              opacity: 0.6,
              animation: "obPulseRing 3s ease-in-out infinite",
            }} />
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 11px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${accent}33`,
            backdropFilter: "blur(8px)",
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }} />
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2.2,
              color: BRAND.ink,
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
              textTransform: "uppercase",
            }}>
              HalıSaha-Kolik
            </span>
          </div>
        </div>
      </FrameBox>
    );
  }

  // ── 2. MODES — two pitches ─────────────────────────
  if (kind === "modes") {
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          <defs>
            <linearGradient id="pitch-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.10" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Top half pitch — My Team */}
          <g transform="translate(20, 20)">
            <rect x="0" y="0" width="200" height="90" rx="10" fill="url(#pitch-grad)" stroke={`${accent}55`} strokeWidth="1" />
            <line x1="0" y1="45" x2="200" y2="45" stroke={`${accent}33`} strokeDasharray="3 3" />
            {[[40,68],[100,68],[160,68],[70,45],[130,45],[100,22]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r="4.5" fill={accent} opacity={0.85 - i*0.05}>
                <animate attributeName="opacity" values={`${0.45};${0.95};${0.45}`} dur={`${2 + i*0.15}s`} repeatCount="indefinite" />
              </circle>
            ))}
            <text x="100" y="86" textAnchor="middle" fontSize="6.5" fontWeight="700" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.5">MY TEAM</text>
          </g>
          {/* vs badge */}
          <g transform="translate(120, 115)">
            <circle r="9" fill={BRAND.bg} stroke={accent} strokeWidth="1.2" />
            <text textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="800" fill={accent} fontFamily="'DM Sans',sans-serif">vs</text>
          </g>
          {/* Bottom half — Full pitch head-to-head */}
          <g transform="translate(20, 130)">
            <rect x="0" y="0" width="200" height="90" rx="10" fill="url(#pitch-grad)" stroke={`${accent}55`} strokeWidth="1" />
            <line x1="100" y1="0" x2="100" y2="90" stroke={`${accent}55`} strokeDasharray="3 3" />
            <circle cx="100" cy="45" r="13" stroke={`${accent}55`} strokeWidth="0.8" fill="none" />
            {[[20,45],[55,25],[55,65],[75,45]].map(([x,y],i) => (
              <circle key={`L${i}`} cx={x} cy={y} r="3.5" fill={accent} opacity="0.85" />
            ))}
            {[[180,45],[145,25],[145,65],[125,45]].map(([x,y],i) => (
              <circle key={`R${i}`} cx={x} cy={y} r="3.5" fill="#f87171" opacity="0.85" />
            ))}
            <text x="100" y="86" textAnchor="middle" fontSize="6.5" fontWeight="700" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.5">FULL PITCH</text>
          </g>
        </svg>
      </FrameBox>
    );
  }

  // ── 3. PROFILE — FIFA-style player card ────────────
  if (kind === "profile") {
    return (
      <FrameBox>
        <svg viewBox="0 0 220 240" width="100%" height="100%">
          <defs>
            <linearGradient id="card-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <rect x="35" y="20" width="150" height="200" rx="14" fill="url(#card-grad)" stroke={`${accent}88`} strokeWidth="1.4" />
          <rect x="42" y="27" width="136" height="186" rx="10" fill="none" stroke={`${accent}22`} />
          <text x="58" y="56" fontSize="26" fontWeight="800" fill={accent} fontFamily="'Bebas Neue','Inter Tight',sans-serif" letterSpacing="0.5">87</text>
          <text x="58" y="71" fontSize="9" fontWeight="700" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.5">ST</text>
          {/* Avatar */}
          <circle cx="110" cy="98" r="26" fill={`${accent}25`} stroke={accent} strokeWidth="1.4" />
          <circle cx="110" cy="92" r="9" fill={accent} opacity="0.85" />
          <path d="M 90 116 Q 110 102 130 116 L 130 124 L 90 124 Z" fill={accent} opacity="0.85" />
          <line x1="58" y1="140" x2="162" y2="140" stroke={`${accent}66`} strokeWidth="0.8" />
          <text x="110" y="155" textAnchor="middle" fontSize="11" fontWeight="700" fill={BRAND.ink} fontFamily="'DM Sans',sans-serif" letterSpacing="0.8">AHMET YILMAZ</text>
          {/* Stat bars */}
          {[
            { label: "PAS", v: 0.78, y: 172 },
            { label: "ŞUT", v: 0.92, y: 184 },
            { label: "HIZ", v: 0.85, y: 196 },
          ].map((s, i) => (
            <g key={i}>
              <text x="58" y={s.y + 3} fontSize="7.5" fontWeight="700" fill={BRAND.inkDim} fontFamily="'JetBrains Mono',monospace">{s.label}</text>
              <rect x="78" y={s.y - 2} width="84" height="3.5" rx="1.5" fill="rgba(255,255,255,0.08)" />
              <rect x="78" y={s.y - 2} width={84 * s.v} height="3.5" rx="1.5" fill={accent}>
                <animate attributeName="width" from="0" to={84 * s.v} dur="0.8s" begin={`${0.2 + i*0.1}s`} fill="freeze" />
              </rect>
            </g>
          ))}
          <line x1="42" y1="206" x2="178" y2="206" stroke={`${accent}33`} strokeWidth="0.6" />
        </svg>
      </FrameBox>
    );
  }

  // ── 4. FORMATION — tactical pitch with 1-2-3-1 ─────
  if (kind === "formation") {
    const positions = [
      { x: 110, y: 195 },                                            // GK
      { x: 60,  y: 145 }, { x: 160, y: 145 },                        // DEF
      { x: 50,  y: 95  }, { x: 110, y: 95  }, { x: 170, y: 95 },     // MID
      { x: 110, y: 50  },                                            // FWD
    ];
    return (
      <FrameBox>
        <svg viewBox="0 0 220 240" width="100%" height="100%">
          <rect x="18" y="18" width="184" height="204" rx="14" fill={`${accent}08`} stroke={`${accent}55`} strokeWidth="1.2" />
          <line x1="18" y1="120" x2="202" y2="120" stroke={`${accent}33`} strokeWidth="0.7" strokeDasharray="3 3" />
          <circle cx="110" cy="120" r="22" stroke={`${accent}33`} fill="none" strokeWidth="0.7" />
          <rect x="68" y="18" width="84" height="22" stroke={`${accent}33`} fill="none" strokeWidth="0.7" />
          <rect x="68" y="200" width="84" height="22" stroke={`${accent}33`} fill="none" strokeWidth="0.7" />
          {/* Tactical lines */}
          {[
            [60,145, 50,95], [60,145, 110,95], [160,145, 110,95], [160,145, 170,95],
            [50,95, 110,50], [110,95, 110,50], [170,95, 110,50],
          ].map(([x1,y1,x2,y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`${accent}22`} strokeWidth="0.8" strokeDasharray="2 3" />
          ))}
          {/* Players with pulse */}
          {positions.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="9" fill={accent} opacity="0.94">
                <animate attributeName="r" values="8;10;8" dur={`${2.4 + i*0.18}s`} repeatCount="indefinite" />
              </circle>
              <circle cx={p.x} cy={p.y} r="9" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4">
                <animate attributeName="r" values="9;16;9" dur={`${2.4 + i*0.18}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur={`${2.4 + i*0.18}s`} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
          {/* Formation label */}
          <g transform="translate(110, 234)">
            <text textAnchor="middle" fontSize="9" fontWeight="700" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="2.5">1-2-3-1</text>
          </g>
        </svg>
      </FrameBox>
    );
  }

  // ── 5. MATCH — scoreboard moment ───────────────────
  if (kind === "match") {
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          {/* Scoreboard */}
          <rect x="20" y="40" width="200" height="80" rx="14" fill={`${accent}10`} stroke={`${accent}55`} strokeWidth="1.4" />
          {/* Team A */}
          <circle cx="60" cy="80" r="14" fill={`${accent}30`} stroke={accent} strokeWidth="1.4" />
          <text x="60" y="84" textAnchor="middle" fontSize="11" fontWeight="800" fill={accent} fontFamily="'DM Sans',sans-serif">A</text>
          {/* Score */}
          <text x="100" y="92" fontSize="34" fontWeight="800" fill={BRAND.ink} fontFamily="'Bebas Neue','Inter Tight',sans-serif" textAnchor="middle">3</text>
          <text x="120" y="88" fontSize="22" fontWeight="700" fill={BRAND.inkFaint} fontFamily="'Bebas Neue',sans-serif" textAnchor="middle">:</text>
          <text x="140" y="92" fontSize="34" fontWeight="800" fill={BRAND.ink} fontFamily="'Bebas Neue','Inter Tight',sans-serif" textAnchor="middle">2</text>
          {/* Team B */}
          <circle cx="180" cy="80" r="14" fill="rgba(248,113,113,0.20)" stroke="#f87171" strokeWidth="1.4" />
          <text x="180" y="84" textAnchor="middle" fontSize="11" fontWeight="800" fill="#f87171" fontFamily="'DM Sans',sans-serif">B</text>
          {/* Live indicator */}
          <g transform="translate(120, 32)">
            <circle r="3" fill="#ef4444">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <text x="8" y="3" fontSize="7.5" fontWeight="800" fill="#ef4444" fontFamily="'JetBrains Mono',monospace" letterSpacing="1.8">LIVE · 67'</text>
          </g>
          {/* Goal log */}
          <g transform="translate(0, 140)">
            {[
              { min: "12'", name: "AHMET Y.", side: "A" },
              { min: "34'", name: "MEHMET K.", side: "B" },
              { min: "58'", name: "AHMET Y.", side: "A" },
            ].map((g, i) => (
              <g key={i} transform={`translate(20, ${i * 22})`}>
                <rect x="0" y="0" width="200" height="18" rx="6" fill="rgba(255,255,255,0.025)" stroke={BRAND.line} />
                <circle cx="14" cy="9" r="3" fill={g.side === "A" ? accent : "#f87171"} />
                <text x="26" y="12" fontSize="7" fontWeight="700" fill={BRAND.inkDim} fontFamily="'JetBrains Mono',monospace" letterSpacing="1">{g.min}</text>
                <text x="52" y="12" fontSize="8" fontWeight="700" fill={BRAND.ink} fontFamily="'DM Sans',sans-serif" letterSpacing="0.5">{g.name}</text>
                <text x="186" y="12" textAnchor="end" fontSize="9" fill={accent}>⚽</text>
              </g>
            ))}
          </g>
        </svg>
      </FrameBox>
    );
  }

  // ── 6. STATS — bars + spider preview ───────────────
  if (kind === "stats") {
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          {/* Top: form bars (last 5 matches) */}
          <g transform="translate(20, 16)">
            <text x="0" y="0" fontSize="7.5" fontWeight="700" fill={BRAND.inkDim} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.8">SON 5 MAÇ · FORM</text>
            {[0.7, 0.92, 0.45, 0.88, 0.95].map((v, i) => (
              <g key={i} transform={`translate(${i * 40}, 10)`}>
                <rect x="0" y="0" width="32" height="38" rx="4" fill="rgba(255,255,255,0.04)" />
                <rect x="0" y={38 - 38 * v} width="32" height={38 * v} rx="4" fill={v > 0.7 ? accent : v > 0.5 ? "#fbbf24" : "#f87171"}>
                  <animate attributeName="height" from="0" to={38 * v} dur="0.7s" begin={`${i * 0.1}s`} fill="freeze" />
                  <animate attributeName="y" from="38" to={38 - 38 * v} dur="0.7s" begin={`${i * 0.1}s`} fill="freeze" />
                </rect>
                <text x="16" y="56" textAnchor="middle" fontSize="6.5" fontWeight="700" fill={BRAND.inkFaint} fontFamily="'JetBrains Mono',monospace">M{i + 1}</text>
              </g>
            ))}
          </g>
          {/* Spider chart preview */}
          <g transform="translate(120, 160)">
            {/* Hexagonal grid */}
            {[0.4, 0.7, 1.0].map((r, i) => (
              <polygon
                key={i}
                points={Array.from({ length: 6 }, (_, k) => {
                  const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
                  return `${Math.cos(a) * 48 * r},${Math.sin(a) * 48 * r}`;
                }).join(" ")}
                fill="none"
                stroke={`${accent}22`}
                strokeWidth="0.6"
              />
            ))}
            {/* Stats polygon */}
            <polygon
              points={[0.78, 0.92, 0.85, 0.74, 0.62, 0.81].map((v, k) => {
                const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
                return `${Math.cos(a) * 48 * v},${Math.sin(a) * 48 * v}`;
              }).join(" ")}
              fill={`${accent}33`}
              stroke={accent}
              strokeWidth="1.4"
            />
            {[0.78, 0.92, 0.85, 0.74, 0.62, 0.81].map((v, k) => {
              const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
              return <circle key={k} cx={Math.cos(a) * 48 * v} cy={Math.sin(a) * 48 * v} r="2.5" fill={accent} />;
            })}
            {/* Labels around */}
            {["PAS","ŞUT","HIZ","DEF","DRİ","FİZ"].map((label, k) => {
              const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
              return (
                <text
                  key={k}
                  x={Math.cos(a) * 60}
                  y={Math.sin(a) * 60 + 2}
                  textAnchor="middle"
                  fontSize="6"
                  fontWeight="700"
                  fill={BRAND.inkDim}
                  fontFamily="'JetBrains Mono',monospace"
                  letterSpacing="0.8"
                >{label}</text>
              );
            })}
          </g>
        </svg>
      </FrameBox>
    );
  }

  // ── 7. PODIUM — top scorers ranking ────────────────
  if (kind === "podium") {
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          {/* Header */}
          <text x="120" y="22" textAnchor="middle" fontSize="9" fontWeight="800" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="2.5">GOL KRALLIĞI</text>
          <line x1="60" y1="30" x2="180" y2="30" stroke={`${accent}55`} strokeWidth="0.6" />
          {/* Podium bars */}
          {[
            { rank: 2, h: 70, name: "MEHMET", goals: "12", x: 50  },
            { rank: 1, h: 100, name: "AHMET",  goals: "18", x: 110 },
            { rank: 3, h: 50,  name: "ALİ",    goals: "9",  x: 170 },
          ].map((p, i) => (
            <g key={i}>
              {/* Crown / medal */}
              <circle cx={p.x} cy={210 - p.h - 18} r="10" fill={p.rank === 1 ? accent : p.rank === 2 ? "rgba(255,255,255,0.42)" : "#cd7f32"} opacity="0.95">
                <animate attributeName="opacity" values="0.7;1;0.7" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <text x={p.x} y={210 - p.h - 14} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0a1410" fontFamily="'Bebas Neue','Inter Tight',sans-serif">{p.rank}</text>
              {/* Bar */}
              <rect
                x={p.x - 22}
                y={210 - p.h}
                width="44"
                height={p.h}
                rx="6"
                fill={p.rank === 1 ? `${accent}33` : "rgba(255,255,255,0.05)"}
                stroke={p.rank === 1 ? accent : BRAND.line}
                strokeWidth={p.rank === 1 ? "1.4" : "1"}
              >
                <animate attributeName="height" from="0" to={p.h} dur="0.7s" begin={`${i * 0.15}s`} fill="freeze" />
                <animate attributeName="y" from="210" to={210 - p.h} dur="0.7s" begin={`${i * 0.15}s`} fill="freeze" />
              </rect>
              {/* Name */}
              <text x={p.x} y={224} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={BRAND.ink} fontFamily="'DM Sans',sans-serif" letterSpacing="0.4">{p.name}</text>
              {/* Goals */}
              <text x={p.x} y={210 - p.h / 2 + 4} textAnchor="middle" fontSize="14" fontWeight="800" fill={p.rank === 1 ? accent : BRAND.ink} fontFamily="'Bebas Neue','Inter Tight',sans-serif">{p.goals}</text>
            </g>
          ))}
          {/* Base */}
          <line x1="20" y1="210" x2="220" y2="210" stroke={`${accent}55`} strokeWidth="1" />
        </svg>
      </FrameBox>
    );
  }

  // ── 8. SHARE — phone with shareable card (FINALE) ──
  if (kind === "share") {
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          <defs>
            <linearGradient id="gold-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {/* Phone frame */}
          <rect x="70" y="20" width="100" height="200" rx="16" fill="rgba(255,255,255,0.04)" stroke={`${accent}aa`} strokeWidth="1.8" />
          <rect x="74" y="24" width="92" height="192" rx="13" fill={BRAND.bgDeep} stroke={`${accent}44`} strokeWidth="0.8" />
          {/* Notch */}
          <rect x="105" y="28" width="30" height="5" rx="2.5" fill="rgba(0,0,0,0.5)" />
          {/* Share card inside phone */}
          <g transform="translate(82, 50)">
            {/* Card */}
            <rect x="0" y="0" width="76" height="120" rx="8" fill="url(#gold-grad)" opacity="0.18" stroke={accent} strokeWidth="1" />
            {/* Mini pitch */}
            <rect x="6" y="8" width="64" height="40" rx="4" fill={`${BRAND.bgDeep}`} stroke={`${accent}55`} strokeWidth="0.5" />
            <line x1="38" y1="8" x2="38" y2="48" stroke={`${accent}33`} strokeDasharray="1 2" strokeWidth="0.4" />
            <circle cx="38" cy="28" r="5" fill="none" stroke={`${accent}33`} strokeWidth="0.4" />
            {/* Tiny players */}
            {[[14,28],[26,18],[26,38],[50,18],[50,38],[62,28]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r="1.8" fill={accent} />
            ))}
            {/* Score */}
            <text x="38" y="64" textAnchor="middle" fontSize="11" fontWeight="800" fill={accent} fontFamily="'Bebas Neue','Inter Tight',sans-serif">3 - 2</text>
            {/* MVP line */}
            <line x1="10" y1="72" x2="66" y2="72" stroke={`${accent}55`} strokeWidth="0.4" />
            <text x="38" y="82" textAnchor="middle" fontSize="5" fontWeight="700" fill={BRAND.inkDim} fontFamily="'JetBrains Mono',monospace" letterSpacing="1">MVP</text>
            <text x="38" y="92" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={BRAND.ink} fontFamily="'DM Sans',sans-serif">AHMET Y.</text>
            <text x="38" y="102" textAnchor="middle" fontSize="5.5" fontWeight="700" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="0.8">2G · 1A</text>
            {/* Logo strip */}
            <rect x="10" y="108" width="56" height="8" rx="2" fill="rgba(255,255,255,0.04)" />
            <text x="38" y="114" textAnchor="middle" fontSize="4.5" fontWeight="700" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1">HALISAHA-KOLIK</text>
          </g>
          {/* Share icons floating */}
          {[
            { x: 28, y: 90, char: "↗" },
            { x: 200, y: 70, char: "♥" },
            { x: 36, y: 160, char: "★" },
            { x: 208, y: 150, char: "✓" },
          ].map((s, i) => (
            <g key={i} style={{ animation: `obFloat ${3 + i * 0.4}s ease-in-out ${i * 0.3}s infinite` }}>
              <circle cx={s.x} cy={s.y} r="11" fill={`${accent}25`} stroke={accent} strokeWidth="1" />
              <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={accent} fontFamily="'DM Sans',sans-serif">{s.char}</text>
            </g>
          ))}
          {/* Sparkles for finale moment */}
          {[
            { x: 120, y: 12, r: 2 },
            { x: 60, y: 50, r: 1.5 },
            { x: 180, y: 200, r: 2 },
            { x: 50, y: 200, r: 1.5 },
          ].map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={accent}>
              <animate attributeName="opacity" values="0.3;1;0.3" dur={`${1.6 + i * 0.4}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      </FrameBox>
    );
  }

  return null;
};

// ═══════════════════════════════════════════════════════════
// CSS ANIMATIONS
// ═══════════════════════════════════════════════════════════
const cssAnims = `
  @keyframes obFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes obStageIn {
    from { opacity: 0; transform: translateY(14px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes obCopyIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes obFloat {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes obHalo {
    0%, 100% { opacity: 0.85; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.06); }
  }
  @keyframes obPulseRing {
    0%, 100% { transform: scale(1);    opacity: 0.6; }
    50%      { transform: scale(1.08); opacity: 0.25; }
  }
  @keyframes obShimmer {
    0%   { background-position: 220% 0; }
    100% { background-position: -220% 0; }
  }
`;