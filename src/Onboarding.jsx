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
//
// ★ v3 — 8 slayt → 3 odaklı slayt (ilk oturumda değere en kısa yol):
//   1) Ekibini 1 dakikada kur      — WhatsApp listesini yapıştır
//   2) Adil takımlar, kavga yok    — AI sadece gelenlerden böler
//   3) Gol krallığı ve MVP her hafta — haftalık döngü + hatırlatma
//   Onboarding'de HİÇBİR izin istenmez (bildirim izni değer anında sorulur).
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from "react";
import logo from "./ssssss.png";
import { t, useLang, setLang } from "./i18n";
import { hideBanner } from "./admob";
import { track, EVENTS } from "./analytics";

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

// 3 adım — her adımın "kind" değeri illüstrasyon tipini söylüyor
const STEPS = [
  { key: 1, kind: "paste" },
  { key: 2, kind: "balance" },
  { key: 3, kind: "weekly", finale: true },
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

  // ★ Ölçüm — tamamlandı mı, atlandı mı, hangi slaytta? (tek sefer)
  const finishedRef = useRef(false);
  const replayRef = useRef(null);
  if (replayRef.current === null) {
    try { replayRef.current = localStorage.getItem("halisaha_onboarded") === "1"; } catch { replayRef.current = false; }
  }
  const finish = (skipped, slideIdx = idx) => {
    if (!finishedRef.current) {
      finishedRef.current = true;
      track(EVENTS.ONBOARDING_DONE, { skipped, slide: slideIdx + 1, replay: !!replayRef.current });
    }
    onFinish();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

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
      if (e.key === "Escape") finishRef.current(true);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [idx]);

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
              onClick={() => finish(true)}
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
          <StepIllustration kind={step.kind} accent={accent} idx={idx} logo={logo} lang={lang} />
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
            onClick={() => (isLast ? finish(false) : setIdx(idx + 1))}
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
const StepIllustration = ({ kind, accent, idx, logo, lang = "tr" }) => {
  const tr = lang === "tr";
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

  // ── 1. PASTE — WhatsApp listesi → kadro ───────────
  if (kind === "paste") {
    const names = ["Ahmet", "Mehmet", "Can", "Emre", "Burak", "Ali +1"];
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          {/* Sohbet balonu — grubun maç listesi */}
          <g transform="translate(10, 26)">
            <rect x="0" y="0" width="106" height="164" rx="12" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
            <path d="M 14 164 L 8 176 L 26 164 Z" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
            <text x="10" y="18" fontSize="7" fontWeight="800" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1">{tr ? "PERŞEMBE MAÇ ⚽" : "THURSDAY GAME ⚽"}</text>
            <line x1="10" y1="25" x2="96" y2="25" stroke="rgba(255,255,255,0.08)" />
            {names.map((n, i) => (
              <text key={n} x="10" y={42 + i * 19} fontSize="9.5" fontWeight="600" fill={BRAND.ink} fontFamily="'DM Sans',sans-serif" opacity="0.88">
                {i + 1}. {n}
              </text>
            ))}
          </g>

          {/* Ok — yapıştır */}
          <g transform="translate(120, 104)">
            <line x1="0" y1="0" x2="16" y2="0" stroke={accent} strokeWidth="2" strokeDasharray="3 3">
              <animate attributeName="stroke-dashoffset" values="12;0" dur="0.9s" repeatCount="indefinite" />
            </line>
            <path d="M 14 -5 L 21 0 L 14 5" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>

          {/* Uygulamadaki kadro — oyuncular sırayla belirir */}
          <g transform="translate(146, 30)">
            <rect x="0" y="0" width="86" height="156" rx="12" fill={`${accent}0d`} stroke={`${accent}66`} strokeWidth="1.2" />
            <image href={logo} x="8" y="7" width="14" height="14" preserveAspectRatio="xMidYMid slice" />
            <text x="27" y="17" fontSize="6.5" fontWeight="800" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1">{tr ? "KADRO" : "SQUAD"}</text>
            {names.map((n, i) => (
              <g key={n} transform={`translate(8, ${30 + i * 20})`} opacity="0">
                <animate attributeName="opacity" from="0" to="1" dur="0.3s" begin={`${0.35 + i * 0.16}s`} fill="freeze" />
                <rect x="0" y="0" width="70" height="15" rx="7.5" fill="rgba(255,255,255,0.04)" stroke={`${accent}33`} />
                <circle cx="8" cy="7.5" r="4.5" fill={accent} opacity="0.9" />
                <text x="17" y="10.5" fontSize="7.5" fontWeight="700" fill={BRAND.ink} fontFamily="'DM Sans',sans-serif">{n.replace(" +1", "")}</text>
                {n.includes("+1") && (
                  <text x="64" y="10.5" textAnchor="end" fontSize="6" fontWeight="800" fill={BRAND.gold} fontFamily="'JetBrains Mono',monospace">+1</text>
                )}
              </g>
            ))}
          </g>

          {/* Alt etiket */}
          <g transform="translate(120, 222)">
            <rect x="-62" y="-11" width="124" height="18" rx="9" fill={`${accent}18`} stroke={`${accent}55`} />
            <text textAnchor="middle" y="2" fontSize="7.5" fontWeight="800" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.4">
              {tr ? "YAPIŞTIR → KADRO HAZIR" : "PASTE → SQUAD READY"}
            </text>
          </g>
        </svg>
      </FrameBox>
    );
  }

  // ── 2. BALANCE — gelenlerden dengeli iki takım ─────
  if (kind === "balance") {
    const red = "#f87171";
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          {/* Kim var? satırı — 1 kişi gelmiyor */}
          <g transform="translate(20, 14)">
            <text x="0" y="8" fontSize="7" fontWeight="800" fill={BRAND.inkDim} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.4">{tr ? "BU HAFTA" : "THIS WEEK"}</text>
            {Array.from({ length: 11 }, (_, i) => {
              const absent = i === 7;
              return (
                <g key={i} transform={`translate(${62 + i * 13}, 4)`}>
                  <circle r="5" fill={absent ? "rgba(255,255,255,0.06)" : `${accent}30`} stroke={absent ? "rgba(255,255,255,0.18)" : accent} strokeWidth="1" />
                  <text textAnchor="middle" y="2.5" fontSize="6" fontWeight="900" fill={absent ? BRAND.inkFaint : accent} fontFamily="'DM Sans',sans-serif">{absent ? "×" : "✓"}</text>
                </g>
              );
            })}
          </g>

          {/* Saha — A vs B */}
          <g transform="translate(20, 32)">
            <rect x="0" y="0" width="200" height="118" rx="12" fill={`${accent}08`} stroke={`${accent}55`} strokeWidth="1.2" />
            <line x1="100" y1="0" x2="100" y2="118" stroke={`${accent}44`} strokeDasharray="3 3" />
            <circle cx="100" cy="59" r="16" stroke={`${accent}44`} strokeWidth="0.8" fill="none" />
            {[[18,59],[48,30],[48,88],[76,46],[76,72]].map(([x, y], i) => (
              <circle key={`A${i}`} cx={x} cy={y} r="6.5" fill={accent} opacity="0.92">
                <animate attributeName="cx" from="100" to={x} dur="0.6s" begin={`${0.1 + i * 0.08}s`} fill="freeze" />
              </circle>
            ))}
            {[[182,59],[152,30],[152,88],[124,46],[124,72]].map(([x, y], i) => (
              <circle key={`B${i}`} cx={x} cy={y} r="6.5" fill={red} opacity="0.92">
                <animate attributeName="cx" from="100" to={x} dur="0.6s" begin={`${0.1 + i * 0.08}s`} fill="freeze" />
              </circle>
            ))}
            {/* AI rozeti */}
            <g transform="translate(100, 59)">
              <circle r="11" fill={BRAND.bg} stroke={accent} strokeWidth="1.4" />
              <text textAnchor="middle" y="3.5" fontSize="9" fontWeight="900" fill={accent} fontFamily="'Bebas Neue','DM Sans',sans-serif" letterSpacing="0.5">AI</text>
            </g>
          </g>

          {/* Güç çubukları — neredeyse eşit */}
          {[
            { label: "A", v: 0.742, col: accent, y: 168, txt: "74.2" },
            { label: "B", v: 0.738, col: red,    y: 186, txt: "73.8" },
          ].map((b, i) => (
            <g key={b.label} transform={`translate(20, ${b.y})`}>
              <text x="0" y="7" fontSize="8" fontWeight="900" fill={b.col} fontFamily="'JetBrains Mono',monospace">{b.label}</text>
              <rect x="14" y="0" width="158" height="8" rx="4" fill="rgba(255,255,255,0.06)" />
              <rect x="14" y="0" width={158 * b.v} height="8" rx="4" fill={b.col} opacity="0.9">
                <animate attributeName="width" from="0" to={158 * b.v} dur="0.8s" begin={`${0.5 + i * 0.12}s`} fill="freeze" />
              </rect>
              <text x="200" y="7.5" textAnchor="end" fontSize="8" fontWeight="800" fill={BRAND.ink} fontFamily="'JetBrains Mono',monospace">{b.txt}</text>
            </g>
          ))}
          <text x="120" y="222" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.4">
            {tr ? "GÜÇ FARKI %0.5 · KAVGA YOK" : "POWER GAP 0.5% · NO ARGUMENTS"}
          </text>
        </svg>
      </FrameBox>
    );
  }

  // ── 3. WEEKLY — haftalık maç + krallık (FINALE) ────
  if (kind === "weekly") {
    return (
      <FrameBox>
        <svg viewBox="0 0 240 240" width="100%" height="100%">
          {/* Haftalık maç + hatırlatma rozeti */}
          <g transform="translate(120, 18)">
            <rect x="-78" y="-11" width="156" height="22" rx="11" fill={`${accent}18`} stroke={`${accent}77`} />
            <text textAnchor="middle" y="3.5" fontSize="8" fontWeight="800" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.2">
              {tr ? "🔔 HER PERŞEMBE 21:00" : "🔔 EVERY THURSDAY 21:00"}
            </text>
          </g>
          <text x="120" y="48" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={BRAND.ink} fontFamily="'JetBrains Mono',monospace" letterSpacing="2.2">
            {tr ? "GOL KRALLIĞI" : "TOP SCORERS"}
          </text>
          <line x1="70" y1="55" x2="170" y2="55" stroke={`${accent}55`} strokeWidth="0.6" />
          {/* Podyum */}
          {[
            { rank: 2, h: 64, name: "MEHMET", goals: "12", x: 56 },
            { rank: 1, h: 96, name: "AHMET",  goals: "18", x: 120 },
            { rank: 3, h: 46, name: "ALİ",    goals: "9",  x: 184 },
          ].map((p, i) => (
            <g key={p.rank}>
              <circle cx={p.x} cy={206 - p.h - 16} r="10" fill={p.rank === 1 ? accent : p.rank === 2 ? "rgba(255,255,255,0.42)" : "#cd7f32"} opacity="0.95">
                <animate attributeName="opacity" values="0.7;1;0.7" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <text x={p.x} y={206 - p.h - 12} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0a1410" fontFamily="'Bebas Neue','Inter Tight',sans-serif">{p.rank}</text>
              <rect
                x={p.x - 22}
                y={206 - p.h}
                width="44"
                height={p.h}
                rx="6"
                fill={p.rank === 1 ? `${accent}33` : "rgba(255,255,255,0.05)"}
                stroke={p.rank === 1 ? accent : BRAND.line}
                strokeWidth={p.rank === 1 ? "1.4" : "1"}
              >
                <animate attributeName="height" from="0" to={p.h} dur="0.7s" begin={`${i * 0.15}s`} fill="freeze" />
                <animate attributeName="y" from="206" to={206 - p.h} dur="0.7s" begin={`${i * 0.15}s`} fill="freeze" />
              </rect>
              <text x={p.x} y={220} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={BRAND.ink} fontFamily="'DM Sans',sans-serif" letterSpacing="0.4">{p.name}</text>
              <text x={p.x} y={206 - p.h / 2 + 4} textAnchor="middle" fontSize="14" fontWeight="800" fill={p.rank === 1 ? accent : BRAND.ink} fontFamily="'Bebas Neue','Inter Tight',sans-serif">{p.goals}</text>
            </g>
          ))}
          {/* MVP yıldızı — 1. sıranın yanında */}
          <g transform="translate(152, 96)">
            <circle r="10" fill={`${accent}25`} stroke={accent} strokeWidth="1">
              <animate attributeName="r" values="9;11;9" dur="2.2s" repeatCount="indefinite" />
            </circle>
            <text textAnchor="middle" y="3.5" fontSize="10" fill={accent}>★</text>
            <text textAnchor="middle" y="21" fontSize="5.5" fontWeight="800" fill={accent} fontFamily="'JetBrains Mono',monospace" letterSpacing="1">MVP</text>
          </g>
          <line x1="20" y1="206" x2="220" y2="206" stroke={`${accent}55`} strokeWidth="1" />
          <text x="120" y="234" textAnchor="middle" fontSize="7" fontWeight="800" fill={BRAND.inkDim} fontFamily="'JetBrains Mono',monospace" letterSpacing="1.4">
            {tr ? "HER MAÇTAN SONRA GÜNCELLENİR" : "UPDATED AFTER EVERY MATCH"}
          </text>
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