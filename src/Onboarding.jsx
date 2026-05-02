// ─────────────────────────────────────────────────────────────
// 8-step Onboarding (TR/EN, swipe + skip) — PREMIUM EDITION
// Glassmorphism cards, ambient gradient mesh, parallax orb,
// refined typography, top progress bar, micro-interactions.
// (i18n keys, swipe logic, banner-hide lifecycle KORUNDU.)
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import logo from "./ssssss.png";
import { t, useLang, setLang } from "./i18n";
import { hideBanner } from "./admob";

const STEPS = [
  { key: 1, icon: "⚽", color: "#34d399", bg: "rgba(5,150,105,0.18)" },
  { key: 2, icon: "🎮", color: "#60a5fa", bg: "rgba(29,78,216,0.18)" },
  { key: 3, icon: "👤", color: "#a78bfa", bg: "rgba(124,58,237,0.18)" },
  { key: 4, icon: "📋", color: "#fbbf24", bg: "rgba(245,158,11,0.18)" },
  { key: 5, icon: "⚽", color: "#f87171", bg: "rgba(220,38,38,0.18)" },
  { key: 6, icon: "📊", color: "#22c55e", bg: "rgba(22,163,74,0.18)" },
  { key: 7, icon: "🏆", color: "#f97316", bg: "rgba(249,115,22,0.18)" },
  { key: 8, icon: "📸", color: "#ec4899", bg: "rgba(236,72,153,0.18)" },
];

export default function Onboarding({ onFinish }) {
  const [lang] = useLang();
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0);
  const startX = useRef(null);
  const wrap = useRef(null);

  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;
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

  // ── Klavye desteği (web test) ──────────────────────────
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "ArrowRight" && idx < STEPS.length - 1) setIdx(idx + 1);
      if (e.key === "ArrowLeft" && idx > 0) setIdx(idx - 1);
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [idx, onFinish]);

  // ── Banner reklamı gizle (lifecycle KORUNDU) ───────────
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
        inset: 0,
        zIndex: 5000,
        color: "#e2e8f0",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        display: "flex",
        flexDirection: "column",
        paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
        animation: "obFadeIn 0.4s ease-out",
        overflow: "hidden",
        // Premium ambient base
        background: "#05080d",
      }}
    >
      <style>{`
        @keyframes obFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes obSlideUp {
          from { opacity: 0; transform: translateY(18px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes obOrbFloat {
          0%, 100% { transform: translateY(0) }
          50%      { transform: translateY(-6px) }
        }
        @keyframes obOrbPulse {
          0%, 100% { transform: scale(1);    opacity: 0.55 }
          50%      { transform: scale(1.12); opacity: 0.85 }
        }
        @keyframes obMeshDrift {
          0%   { transform: translate(0, 0) rotate(0deg) }
          50%  { transform: translate(-3%, 2%) rotate(180deg) }
          100% { transform: translate(0, 0) rotate(360deg) }
        }
        @keyframes obShimmer {
          0%   { background-position: -200% 0 }
          100% { background-position: 200% 0 }
        }
        @keyframes obDotMorph {
          from { width: 7px }
          to   { width: 22px }
        }
      `}</style>

      {/* AMBIENT GRADIENT MESH — premium vibe */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 60% 50% at 20% 0%, ${step.color}22, transparent 60%),
            radial-gradient(ellipse 50% 40% at 85% 30%, ${step.color}1c, transparent 65%),
            radial-gradient(ellipse 70% 60% at 50% 100%, #0a162822, transparent 70%),
            linear-gradient(160deg, #060a10 0%, #0a0f17 45%, #07111d 100%)
          `,
          transition: "background 0.6s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      {/* Slow drifting orb behind everything */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-20%",
          left: "-10%",
          width: "120%",
          height: "60%",
          background: `radial-gradient(circle at 50% 50%, ${step.color}15 0%, transparent 55%)`,
          filter: "blur(40px)",
          animation: "obMeshDrift 22s ease-in-out infinite",
          transition: "background 0.6s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* PROGRESS BAR — top */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: 3,
          margin: "0 18px 8px",
          borderRadius: 2,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${step.color}, ${step.color}cc)`,
            borderRadius: 2,
            transition: "width 0.45s cubic-bezier(.4,0,.2,1), background 0.4s ease",
            boxShadow: `0 0 12px ${step.color}aa`,
          }}
        />
      </div>

      {/* TOP BAR — Lang switch + Step counter + Skip */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 18px 4px",
          flexShrink: 0,
        }}
      >
        <LangToggle lang={lang} onChange={setLang} />

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: 1.2,
            fontFamily: "'JetBrains Mono', 'DM Sans', sans-serif",
          }}
        >
          {String(idx + 1).padStart(2, "0")}
          <span style={{ color: "rgba(255,255,255,0.18)" }}> / {STEPS.length}</span>
        </div>

        {!isLast ? (
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
              backdropFilter: "blur(8px)",
            }}
          >
            {t("onb_skip")}
          </button>
        ) : (
          <div style={{ width: 60 }} />
        )}
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
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 28px",
          textAlign: "center",
          touchAction: "pan-y",
          userSelect: "none",
          transform: `translateX(${drag * 0.32}px)`,
          transition: drag === 0 ? "transform 0.3s cubic-bezier(.4,0,.2,1)" : "none",
        }}
      >
        {/* ORB — with subtle parallax on drag */}
        <div
          style={{
            position: "relative",
            marginBottom: 32,
            transform: `translateX(${drag * 0.06}px)`,
            transition: drag === 0 ? "transform 0.4s cubic-bezier(.4,0,.2,1)" : "none",
          }}
        >
          {/* Outer glow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: -36,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${step.color}38 0%, transparent 70%)`,
              animation: "obOrbPulse 3.4s ease-in-out infinite",
              filter: "blur(2px)",
            }}
          />
          {/* Inner ring */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: 28,
              border: `1px solid ${step.color}33`,
              opacity: 0.6,
            }}
          />

          {idx === 0 ? (
            <img
              src={logo}
              alt="logo"
              key={`logo-${idx}`}
              style={{
                width: 104,
                height: 104,
                borderRadius: 26,
                objectFit: "cover",
                position: "relative",
                boxShadow: `
                  0 12px 36px ${step.color}55,
                  0 0 0 1px rgba(255,255,255,0.08) inset,
                  0 1px 0 rgba(255,255,255,0.12) inset
                `,
                animation: "obSlideUp 0.4s, obOrbFloat 4s ease-in-out 0.4s infinite",
              }}
            />
          ) : (
            <div
              key={`icon-${idx}`}
              style={{
                width: 104,
                height: 104,
                borderRadius: 26,
                background: `linear-gradient(150deg, ${step.bg}, rgba(255,255,255,0.02))`,
                border: `1px solid ${step.color}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 50,
                position: "relative",
                animation: "obSlideUp 0.4s, obOrbFloat 4s ease-in-out 0.4s infinite",
                backdropFilter: "blur(10px)",
                boxShadow: `
                  0 12px 36px ${step.color}33,
                  0 0 0 1px rgba(255,255,255,0.05) inset,
                  0 1px 0 rgba(255,255,255,0.08) inset
                `,
              }}
            >
              {step.icon}
            </div>
          )}
        </div>

        {/* GLASS CONTENT CARD */}
        <div
          key={`card-${idx}`}
          style={{
            position: "relative",
            maxWidth: 340,
            width: "100%",
            padding: "22px 22px 24px",
            borderRadius: 20,
            background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
            border: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: `
              0 20px 40px rgba(0,0,0,0.35),
              0 0 0 1px rgba(255,255,255,0.04) inset,
              0 1px 0 rgba(255,255,255,0.08) inset
            `,
            animation: "obSlideUp 0.45s cubic-bezier(.4,0,.2,1)",
          }}
        >
          {/* Tiny accent label */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: step.color,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              marginBottom: 10,
              fontFamily: "'JetBrains Mono', 'DM Sans', sans-serif",
              opacity: 0.9,
            }}
          >
            <span style={{ opacity: 0.5 }}>—</span>{" "}
            {idx === 0 ? "Welcome" : isLast ? "Ready" : `Step ${idx + 1}`}
          </div>

          <h2
            style={{
              fontSize: 24,
              fontWeight: 800,
              margin: 0,
              marginBottom: 12,
              lineHeight: 1.22,
              letterSpacing: -0.4,
              color: "#f3f5f8",
              // Subtle gradient text on title
              backgroundImage: `linear-gradient(180deg, #ffffff, #d1d5db)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {t(`onb_${step.key}_title`)}
          </h2>

          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "rgba(226,232,240,0.62)",
              margin: 0,
              fontWeight: 400,
            }}
          >
            {t(`onb_${step.key}_desc`)}
          </p>
        </div>
      </div>

      {/* DOTS + CTA */}
      <div style={{ position: "relative", zIndex: 2, padding: "0 24px", flexShrink: 0 }}>
        {/* Dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 6,
            marginBottom: 18,
          }}
        >
          {STEPS.map((s, i) => {
            const active = i === idx;
            const done = i < idx;
            return (
              <button
                key={s.key}
                onClick={() => setIdx(i)}
                aria-label={`step ${i + 1}`}
                style={{
                  width: active ? 24 : 7,
                  height: 7,
                  borderRadius: 4,
                  border: "none",
                  background: active
                    ? `linear-gradient(90deg, ${step.color}, ${step.color}cc)`
                    : done
                    ? "rgba(255,255,255,0.35)"
                    : "rgba(255,255,255,0.14)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.32s cubic-bezier(.4,0,.2,1)",
                  boxShadow: active ? `0 0 10px ${step.color}88` : "none",
                }}
              />
            );
          })}
        </div>

        {/* CTA */}
        <button
          onClick={() => (isLast ? onFinish() : setIdx(idx + 1))}
          style={{
            position: "relative",
            width: "100%",
            padding: "16px",
            borderRadius: 16,
            border: "none",
            background: `linear-gradient(135deg, ${step.color} 0%, ${step.color}d0 100%)`,
            color: "#0a1628",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: 0.4,
            boxShadow: `
              0 12px 32px ${step.color}66,
              0 0 0 1px rgba(255,255,255,0.18) inset,
              0 1px 0 rgba(255,255,255,0.4) inset
            `,
            transition: "transform 0.14s ease, box-shadow 0.2s ease",
            overflow: "hidden",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {/* Subtle shimmer overlay */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "obShimmer 2.6s linear infinite",
              pointerEvents: "none",
              mixBlendMode: "overlay",
              opacity: 0.55,
            }}
          />
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {isLast ? t("onb_start") : t("onb_next")}
            {!isLast && (
              <span style={{ fontSize: 16, lineHeight: 1, transform: "translateY(-1px)" }}>→</span>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Lang toggle (TR/EN segmented) — refined ───
const LangToggle = ({ lang, onChange }) => (
  <div
    style={{
      display: "flex",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 9,
      padding: 2,
      gap: 2,
      backdropFilter: "blur(8px)",
    }}
  >
    {["tr", "en"].map((l) => {
      const active = lang === l;
      return (
        <button
          key={l}
          onClick={() => onChange(l)}
          style={{
            padding: "5px 12px",
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            background: active ? "rgba(52,211,153,0.16)" : "transparent",
            color: active ? "#34d399" : "rgba(255,255,255,0.42)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            fontFamily: "inherit",
            transition: "all 0.18s ease",
            boxShadow: active ? "0 0 0 1px rgba(52,211,153,0.22) inset" : "none",
          }}
        >
          {l}
        </button>
      );
    })}
  </div>
);

export { LangToggle };