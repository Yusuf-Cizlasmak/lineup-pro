// ─────────────────────────────────────────────────────────────
// 5-step Onboarding (TR/EN, swipe + skip)
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import logo from "./ssssss.png";
import { t, useLang, setLang } from "./i18n";

const STEPS = [
  { key: 1, icon: "⚽", color: "#34d399", bg: "rgba(5,150,105,0.18)" },
  { key: 2, icon: "👥", color: "#60a5fa", bg: "rgba(29,78,216,0.18)" },
  { key: 3, icon: "🎯", color: "#fbbf24", bg: "rgba(245,158,11,0.18)" },
  { key: 4, icon: "🏆", color: "#f87171", bg: "rgba(220,38,38,0.18)" },
  { key: 5, icon: "📸", color: "#a78bfa", bg: "rgba(124,58,237,0.18)" },
];

export default function Onboarding({ onFinish }) {
  const [lang] = useLang();
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0);
  const startX = useRef(null);
  const wrap = useRef(null);

  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;

  // Swipe
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

  // Klavye desteği (web test için)
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "ArrowRight" && idx < STEPS.length - 1) setIdx(idx + 1);
      if (e.key === "ArrowLeft" && idx > 0) setIdx(idx - 1);
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [idx, onFinish]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        background: "linear-gradient(160deg,#070a0f,#0c1117 45%,#0a1628)",
        color: "#e2e8f0",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        display: "flex",
        flexDirection: "column",
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulseGlow { 0%,100% { transform: scale(1); opacity: 0.5 } 50% { transform: scale(1.08); opacity: 0.85 } }
      `}</style>

      {/* TOP BAR — Lang switch + Skip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px", flexShrink: 0 }}>
        <LangToggle lang={lang} onChange={setLang} />
        {!isLast && (
          <button
            onClick={onFinish}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "6px 14px",
              color: "rgba(255,255,255,0.55)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("onb_skip")}
          </button>
        )}
        {isLast && <div style={{ width: 60 }} />}
      </div>

      {/* CONTENT — swipeable */}
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
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 28px",
          textAlign: "center",
          touchAction: "pan-y",
          userSelect: "none",
          transform: `translateX(${drag * 0.35}px)`,
          transition: drag === 0 ? "transform 0.25s cubic-bezier(.4,0,.2,1)" : "none",
        }}
      >
        {/* Decorative orb */}
        <div style={{ position: "relative", marginBottom: 28 }}>
          <div
            style={{
              position: "absolute",
              inset: -30,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${step.color}33 0%, transparent 70%)`,
              animation: "pulseGlow 3s ease-in-out infinite",
            }}
          />
          {idx === 0 ? (
            <img
              src={logo}
              alt="logo"
              key={`logo-${idx}`}
              style={{
                width: 96,
                height: 96,
                borderRadius: 22,
                objectFit: "cover",
                position: "relative",
                boxShadow: `0 12px 36px ${step.color}55`,
                animation: "slideUp 0.35s",
              }}
            />
          ) : (
            <div
              key={`icon-${idx}`}
              style={{
                width: 96,
                height: 96,
                borderRadius: 22,
                background: step.bg,
                border: `1px solid ${step.color}33`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
                position: "relative",
                animation: "slideUp 0.35s",
              }}
            >
              {step.icon}
            </div>
          )}
        </div>

        <h2
          key={`title-${idx}`}
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            marginBottom: 12,
            lineHeight: 1.25,
            letterSpacing: -0.3,
            animation: "slideUp 0.35s 0.05s both",
          }}
        >
          {t(`onb_${step.key}_title`)}
        </h2>
        <p
          key={`desc-${idx}`}
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.55)",
            margin: 0,
            maxWidth: 320,
            animation: "slideUp 0.35s 0.1s both",
          }}
        >
          {t(`onb_${step.key}_desc`)}
        </p>
      </div>

      {/* DOTS + CTA */}
      <div style={{ padding: "0 24px", flexShrink: 0 }}>
        {/* Dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIdx(i)}
              aria-label={`step ${i + 1}`}
              style={{
                width: i === idx ? 22 : 7,
                height: 7,
                borderRadius: 4,
                border: "none",
                background: i === idx ? step.color : "rgba(255,255,255,0.18)",
                cursor: "pointer",
                padding: 0,
                transition: "all 0.25s",
              }}
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => (isLast ? onFinish() : setIdx(idx + 1))}
          style={{
            width: "100%",
            padding: "15px",
            borderRadius: 14,
            border: "none",
            background: `linear-gradient(135deg,${step.color},${step.color}cc)`,
            color: "#0a1628",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: 0.3,
            boxShadow: `0 10px 28px ${step.color}55`,
            transition: "transform 0.12s",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {isLast ? t("onb_start") : t("onb_next")}
        </button>
      </div>
    </div>
  );
}

// ─── Lang toggle (TR/EN segmented) ───
const LangToggle = ({ lang, onChange }) => (
  <div
    style={{
      display: "flex",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      padding: 2,
      gap: 2,
    }}
  >
    {["tr", "en"].map((l) => (
      <button
        key={l}
        onClick={() => onChange(l)}
        style={{
          padding: "5px 11px",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
          background: lang === l ? "rgba(52,211,153,0.18)" : "transparent",
          color: lang === l ? "#34d399" : "rgba(255,255,255,0.4)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontFamily: "inherit",
        }}
      >
        {l}
      </button>
    ))}
  </div>
);

export { LangToggle };