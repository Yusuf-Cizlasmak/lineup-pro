// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Interaktif Rehber (Coach Marks)
// 4-panel cutout overlay: hedefin etrafını 4 dikdörtgen panel ile karartır,
// hedefin üstündeki bölge tamamen pointer-events:none — DOM tıklanır.
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from "react";
import { t } from "./i18n";

const STORAGE_KEY = "halisaha_tour_done";
const STORAGE_KEY_MATCH = "halisaha_tour_match_end_done";

export const isTourDone = () => {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
};
export const markTourDone = () => {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
};
export const resetTour = () => {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STORAGE_KEY_MATCH); } catch {}
};
// Match-end mini-tour
export const isMatchEndTourDone = () => {
  try { return localStorage.getItem(STORAGE_KEY_MATCH) === "1"; } catch { return false; }
};
export const markMatchEndTourDone = () => {
  try { localStorage.setItem(STORAGE_KEY_MATCH, "1"); } catch {}
};

// ═══ ANA TUR — 3 adım, doğrudan değere: maç modu → listeyi yapıştır → AI ile böl ═══
//
// Adım alanları:
//   target   → data-tour hedefi (ilk bulunan kullanılır; alt[] yedek hedefler)
//   via      → hedef ekranda yoksa önce buraya yönlendir (örn. "Kadro" sekmesi).
//              via.when[] verilirse via sadece o hedeflerden biri ekrandayken gösterilir.
//              Her adımda via en fazla 1 kez kullanılır.
//   waitFor  → "click" (hedefe tıklayınca) | "event:NAME" (window "halisaha:NAME")
//              | "next" (hedefsiz bilgi kartı, "Anladım" ile)
//   canNext  → tooltip'te "Sonraki" butonu (kadrosu zaten olan kullanıcı takılmasın)
//
// ★ SAĞLAMLIK:
//   • Hedef (ve via) ~2 sn içinde DOM'da görünmezse adım sessizce ATLANIR.
//   • Hedef DOM'da ama üstü kapalıysa (onboarding, sheet, modal açık) tur görünmez
//     olur ve bekler; üstü açılınca kaldığı yerden devam eder (atlanmaz).
const STEPS_MAIN = [
  { target: "mode-match", title: "tour_1_title", desc: "tour_1_desc", placement: "bottom", waitFor: "event:mode-selected" },
  {
    target: "paste-roster", alt: ["paste-roster-empty"],
    via: { target: "tab-squad", title: "tour_2_via_title", desc: "tour_2_via_desc", placement: "top" },
    title: "tour_2_title", desc: "tour_2_desc", placement: "bottom",
    waitFor: "event:player-saved", canNext: true,
  },
  {
    target: "ai-split",
    via: { target: "tab-field", title: "tour_3_via_title", desc: "tour_3_via_desc", placement: "top", when: ["paste-roster", "btn-add-player"] },
    title: "tour_3_title", desc: "tour_3_desc", placement: "bottom",
    waitFor: "click",
  },
];

// Mini tour — maçı bitir vurgu
const STEPS_MATCH_END = [
  { target: "end-match", title: "tour_me_0_title", desc: "tour_me_0_desc", placement: "bottom", waitFor: "click" },
];

const PAD = 8;
const DIM = "rgba(0,0,0,0.78)";
const MISSING_SKIP_MS = 2000;   // hedef bu sürede görünmezse adımı atla
const POLL_MS = 300;            // hedef/üstü-kapalı kontrolü sıklığı

const q = (id) => (id ? document.querySelector(`[data-tour="${id}"]`) : null);
const isRendered = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
// Hedefin ortasına başka bir katman (onboarding, sheet, modal) biniyor mu?
// Tur katmanları pointer-events:none olduğu için elementFromPoint onları görmez.
const isCovered = (el, r) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
  const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
  if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return true; // ekran dışında
  const hit = document.elementFromPoint ? document.elementFromPoint(cx, cy) : el;
  if (!hit) return true;
  return !(hit === el || el.contains(hit) || hit.contains(el));
};

export default function Tour({ active, onFinish, mode = "main" }) {
  // mode: "main" (3 adımlık kurulum) | "matchEnd" (maçı bitir vurgusu)
  const STEPS = mode === "matchEnd" ? STEPS_MATCH_END : STEPS_MAIN;
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [viaUsed, setViaUsed] = useState(false);
  const targetElRef = useRef(null);
  const missingSinceRef = useRef(null);
  const stepIdxRef = useRef(0);
  stepIdxRef.current = stepIdx;

  const step = STEPS[stepIdx];

  const finish = useCallback(() => {
    if (mode === "matchEnd") {
      markMatchEndTourDone();
    } else {
      markTourDone();
    }
    setStepIdx(0);
    setViaUsed(false);
    setRect(null);
    missingSinceRef.current = null;
    onFinish?.();
  }, [mode, onFinish]);

  const advance = useCallback(() => {
    missingSinceRef.current = null;
    setViaUsed(false);
    setRect(null);
    if (stepIdxRef.current >= STEPS.length - 1) {
      finish();
    } else {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }
  }, [STEPS.length, finish]);

  // Tur kapanınca bir sonraki açılış temiz başlasın
  useEffect(() => {
    if (!active) {
      setStepIdx(0); setViaUsed(false); setRect(null);
      missingSinceRef.current = null;
    }
  }, [active]);

  // ── Hedef çözümleme: primary → alt → via ──
  const resolve = useCallback(() => {
    if (!step || !step.target) return null;
    for (const id of [step.target, ...(step.alt || [])]) {
      const el = q(id);
      if (isRendered(el)) return { el, kind: "primary" };
    }
    const via = step.via;
    if (via && !viaUsed) {
      const whenOk = !via.when || via.when.some((id) => isRendered(q(id)));
      const el = q(via.target);
      if (whenOk && isRendered(el)) return { el, kind: "via" };
    }
    return null;
  }, [step, viaUsed]);

  const measure = useCallback(() => {
    if (!step || !step.target) {
      targetElRef.current = null;
      setRect(null);
      return;
    }
    const found = resolve();
    if (!found) {
      targetElRef.current = null;
      setRect((prev) => (prev && prev.found === false ? prev : { found: false }));
      // ★ ~2 sn içinde görünmezse adımı atla
      const now = Date.now();
      if (missingSinceRef.current == null) missingSinceRef.current = now;
      else if (now - missingSinceRef.current >= MISSING_SKIP_MS) advance();
      return;
    }
    missingSinceRef.current = null;
    targetElRef.current = found.el;
    const r = found.el.getBoundingClientRect();
    const next = {
      x: r.left, y: r.top, w: r.width, h: r.height,
      found: true, kind: found.kind, covered: isCovered(found.el, r),
    };
    setRect((prev) => (
      prev && prev.found && prev.x === next.x && prev.y === next.y && prev.w === next.w &&
      prev.h === next.h && prev.kind === next.kind && prev.covered === next.covered
    ) ? prev : next);
  }, [step, resolve, advance]);

  // Step değişince ilk iş: target ekran içinde mi? Değilse smooth scroll ile getir.
  useEffect(() => {
    if (!active || !step || !step.target) return;
    const tryScroll = () => {
      const found = resolve();
      if (!found) return;
      const r = found.el.getBoundingClientRect();
      const vh = window.innerHeight;
      const margin = 80; // üst/alt nefes payı
      // Sadece görünür alanın dışındaysa kaydır
      if (r.top < margin || r.bottom > vh - margin) {
        found.el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    };
    // DOM hazır olana kadar birkaç deneme — ekran/modal geçişleri için
    const timers = [0, 120, 300, 700].map(ms => setTimeout(tryScroll, ms));
    return () => timers.forEach(clearTimeout);
  }, [active, stepIdx, step, viaUsed, resolve]);

  // Sürekli ölçüm — hedef geç gelebilir, üstündeki sheet kapanabilir, 2 sn atlama sayacı
  useEffect(() => {
    if (!active || !step) return;
    measure();
    const iv = setInterval(measure, POLL_MS);
    return () => clearInterval(iv);
  }, [active, step, measure]);

  // Resize / scroll
  useEffect(() => {
    if (!active) return;
    const fn = () => measure();
    window.addEventListener("resize", fn);
    window.addEventListener("scroll", fn, true);
    return () => {
      window.removeEventListener("resize", fn);
      window.removeEventListener("scroll", fn, true);
    };
  }, [active, measure]);

  // Hedefe click dinleme — capture phase
  //   via → yönlendirme hedefi tıklandı: via harcandı, asıl hedef aranır
  //   primary + waitFor "click" → ilerle
  const rectKind = rect?.found ? rect.kind : null;
  useEffect(() => {
    if (!active || !step || !rectKind) return;
    const el = targetElRef.current;
    if (!el) return;
    const isVia = rectKind === "via";
    if (!isVia && step.waitFor !== "click") return;
    let fired = false;
    const handler = () => {
      if (fired) return;
      fired = true;
      if (isVia) {
        setTimeout(() => { missingSinceRef.current = null; setViaUsed(true); }, 250);
      } else {
        setTimeout(() => advance(), 350);
      }
    };
    el.addEventListener("click", handler, true);
    return () => el.removeEventListener("click", handler, true);
  }, [active, stepIdx, step, rectKind, rect, advance]);

  // Window event'i (event:NAME) — via gösterilirken de geçerli
  useEffect(() => {
    if (!active || !step || !step.waitFor?.startsWith("event:")) return;
    const evtName = step.waitFor.slice("event:".length);
    const handler = () => advance();
    window.addEventListener(`halisaha:${evtName}`, handler);
    return () => window.removeEventListener(`halisaha:${evtName}`, handler);
  }, [active, stepIdx, step, advance]);

  // ★ Kullanıcı başka yoldan AI dağıtımına ulaştıysa (örnek kadro, bildirim) tur amacına ulaştı
  useEffect(() => {
    if (!active || mode !== "main") return;
    const onNav = (e) => {
      if (e?.detail?.route === "ai_split" && stepIdxRef.current >= 1) finish();
    };
    window.addEventListener("halisaha:navigate", onNav);
    return () => window.removeEventListener("halisaha:navigate", onNav);
  }, [active, mode, finish]);

  if (!active || !step) return null;

  // Hedefli adımda hedef henüz yok / üstü kapalı → görünmez bekle (uygulama tamamen kullanılabilir)
  if (step.target && (!rect || !rect.found || rect.covered)) return null;

  // Gösterilen içerik: via aktifse yönlendirme metni, değilse adımın kendisi
  const showingVia = rect?.found && rect.kind === "via" && step.via;
  const view = showingVia
    ? { ...step, title: step.via.title, desc: step.via.desc, placement: step.via.placement || step.placement, canNext: false }
    : step;

  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;

  const hole = view.target && rect?.found ? {
    x: Math.max(0, rect.x - PAD),
    y: Math.max(0, rect.y - PAD),
    w: Math.min(vw, rect.w + PAD * 2),
    h: Math.min(vh, rect.h + PAD * 2),
  } : null;

  // ★ Center step'ler iki farklı tipte:
  //   - Form modal'ı açık olan (waitFor: "event:player-saved") → banner görünümü, modal'ı kapatma
  //   - Bilgilendirici info step (waitFor: "next") → büyük kart, karartılmış arkaplan, "Anladım" butonu
  const isCenterStep = !hole && view.placement === "center";
  const isInfoStep   = isCenterStep && view.waitFor === "next";

  // 4-panel cutout — hole çevresini karart, içi dokunulmaz
  const panels = hole ? [
    { left: 0, top: 0, width: vw, height: hole.y },                                    // Üst
    { left: 0, top: hole.y + hole.h, width: vw, height: vh - (hole.y + hole.h) },     // Alt
    { left: 0, top: hole.y, width: hole.x, height: hole.h },                           // Sol
    { left: hole.x + hole.w, top: hole.y, width: vw - (hole.x + hole.w), height: hole.h }, // Sağ
  ] : [];
  // (isCenterStep ise panels boş — modal'ın üstüne karartma binmez)

  // Tooltip pozisyonu
  const TIP_W = Math.min(280, vw - 32);
  let tipStyle = {};
  if (isInfoStep) {
    // Bilgilendirici merkezi info step — büyük kart, ekran ortası
    tipStyle = {
      top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      width: Math.min(340, vw - 32),
    };
  } else if (isCenterStep) {
    // Modal zaten açık (örn. form) — tooltip'i ekranın üstünde, modal'ı kapatmayacak şekilde göster
    tipStyle = {
      top: "calc(env(safe-area-inset-top, 0px) + 14px)",
      left: "50%",
      transform: "translateX(-50%)",
      width: Math.min(320, vw - 24),
    };
  } else if (!hole) {
    tipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: TIP_W };
  } else if (
    // ★ Otomatik yön: istenen tarafta yer yoksa (~170px) karşı tarafa aç
    (view.placement === "top" && hole.y - 182 >= 0) ||
    (view.placement !== "top" && hole.y + hole.h + 182 > vh && hole.y - 182 >= 0)
  ) {
    tipStyle = {
      bottom: vh - hole.y + 12,
      left: Math.max(16, Math.min(vw - TIP_W - 16, hole.x + hole.w / 2 - TIP_W / 2)),
      width: TIP_W,
    };
  } else {
    tipStyle = {
      top: hole.y + hole.h + 12,
      left: Math.max(16, Math.min(vw - TIP_W - 16, hole.x + hole.w / 2 - TIP_W / 2)),
      width: TIP_W,
    };
  }

  return (
    <>
      <style>{`
        @keyframes tourPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes tourPulseOuter {
          0%   { opacity: 0.55; transform: scale(1); }
          100% { opacity: 0;    transform: scale(1.45); }
        }
        @keyframes tourSlideUp {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tourFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tourShimmer {
          0%   { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes tourFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        /* ★ Spotlight'ın step'ler arası akıcı geçişi —
           ring & panel position/size değişimi cubic-bezier ile yumuşatılır */
        .tour-panel, .tour-ring-outer, .tour-ring-inner, .tour-halo {
          transition: left 0.42s cubic-bezier(.22,1,.36,1),
                      top 0.42s cubic-bezier(.22,1,.36,1),
                      width 0.42s cubic-bezier(.22,1,.36,1),
                      height 0.42s cubic-bezier(.22,1,.36,1),
                      opacity 0.3s ease;
        }
        .tour-tip {
          transition: top 0.42s cubic-bezier(.22,1,.36,1),
                      bottom 0.42s cubic-bezier(.22,1,.36,1),
                      left 0.42s cubic-bezier(.22,1,.36,1),
                      transform 0.42s cubic-bezier(.22,1,.36,1);
        }
      `}</style>

      {/* 4-panel karartma — pointer-events:none, hiçbir şeyi engelleme */}
      {panels.map((p, i) => (
        <div
          key={i}
          className="tour-panel"
          style={{
            position: "fixed",
            left: p.left, top: p.top,
            width: p.width, height: p.height,
            background: DIM,
            zIndex: 4500,
            pointerEvents: "none",
          }}
        />
      ))}

      {/* ★ Info step için tam ekran karartma (modal davranışı — pointer events açık) */}
      {isInfoStep && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 4500,
            pointerEvents: "auto",
            animation: "tourFadeIn 0.25s ease-out",
          }}
        />
      )}

      {/* Spotlight halo — hedefin etrafında soft glow */}
      {hole && !isCenterStep && (
        <div
          className="tour-halo"
          style={{
            position: "fixed",
            left: hole.x - 24, top: hole.y - 24,
            width: hole.w + 48, height: hole.h + 48,
            borderRadius: 28,
            background: "radial-gradient(ellipse at center, rgba(52,211,153,0.18) 0%, rgba(52,211,153,0.05) 50%, transparent 75%)",
            zIndex: 4500,
            pointerEvents: "none",
            filter: "blur(8px)",
          }}
        />
      )}

      {/* Outer pulsing ring — yayılan halka */}
      {hole && (
        <div
          className="tour-ring-outer"
          style={{
            position: "fixed",
            left: hole.x - 4, top: hole.y - 4,
            width: hole.w + 8, height: hole.h + 8,
            borderRadius: 16,
            border: "1.5px solid rgba(52,211,153,0.5)",
            zIndex: 4501,
            pointerEvents: "none",
            animation: "tourPulseOuter 1.6s ease-out infinite",
          }}
        />
      )}

      {/* Inner pulsing ring around target */}
      {hole && (
        <div
          className="tour-ring-inner"
          style={{
            position: "fixed",
            left: hole.x, top: hole.y,
            width: hole.w, height: hole.h,
            borderRadius: 14,
            border: "2.5px solid #34d399",
            boxShadow: "0 0 0 4px rgba(52,211,153,0.18), 0 0 32px rgba(52,211,153,0.5)",
            zIndex: 4501,
            pointerEvents: "none",
            animation: "tourPulse 1.4s ease-in-out infinite",
          }}
        />
      )}

      {/* Tooltip — pointerEvents:auto */}
      <div
        className="tour-tip"
        style={{
          position: "fixed",
          ...tipStyle,
          background: isInfoStep
            ? "linear-gradient(165deg, #0f1722 0%, #0c1117 60%, #0a0d13 100%)"
            : isCenterStep
            ? "linear-gradient(160deg,rgba(14,17,23,0.96),rgba(17,19,24,0.96))"
            : "linear-gradient(160deg,#0e1117,#111318)",
          backdropFilter: isCenterStep && !isInfoStep ? "blur(16px)" : "none",
          WebkitBackdropFilter: isCenterStep && !isInfoStep ? "blur(16px)" : "none",
          color: "#e2e8f0",
          padding: isInfoStep ? "22px 22px" : isCenterStep ? "12px 14px" : "16px 18px",
          borderRadius: isInfoStep ? 20 : isCenterStep ? 12 : 16,
          border: isInfoStep ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(52,211,153,0.35)",
          boxShadow: isInfoStep
            ? "0 30px 80px rgba(0,0,0,0.7), 0 0 60px rgba(52,211,153,0.22), 0 0 0 1px rgba(255,255,255,0.04) inset"
            : isCenterStep
            ? "0 12px 32px rgba(0,0,0,0.55), 0 0 20px rgba(52,211,153,0.18)"
            : "0 18px 44px rgba(0,0,0,0.55), 0 0 28px rgba(52,211,153,0.18), 0 0 0 1px rgba(255,255,255,0.04) inset",
          fontFamily: "'DM Sans','Segoe UI',sans-serif",
          zIndex: 4502,
          pointerEvents: "auto",
          animation: isInfoStep
            ? "tourSlideUp 0.42s cubic-bezier(.34,1.56,.64,1)"
            : "tourFadeIn 0.28s ease-out",
        }}
      >
        {/* Premium gradient border halo (info step için) */}
        {isInfoStep && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: -1,
              borderRadius: 21,
              padding: 1,
              background: "linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(96,165,250,0.35) 50%, rgba(251,191,36,0.4) 100%)",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              opacity: 0.7,
              pointerEvents: "none",
            }}
          />
        )}

        {isInfoStep ? (
          // ★ INFO STEP — bilgilendirici büyük kart (özellik tanıtımı)
          <>
            {/* Üst satır: STEP X/Y + skip */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 14,
            }}>
              <div style={{
                fontSize: 9.5, fontWeight: 800,
                color: "rgba(52,211,153,0.85)",
                textTransform: "uppercase", letterSpacing: 1.6,
                fontFamily: "'JetBrains Mono', monospace",
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.25)",
                padding: "3px 9px",
                borderRadius: 5,
              }}>
                STEP {String(stepIdx + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </div>
              <button
                onClick={finish}
                style={{
                  border: "none", background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 11, fontWeight: 600,
                  cursor: "pointer", padding: "4px 11px",
                  borderRadius: 6, fontFamily: "inherit",
                }}
              >
                {t("tour_skip")}
              </button>
            </div>

            {/* Yatay progress bar */}
            <div style={{
              height: 3, borderRadius: 2,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              marginBottom: 16,
            }}>
              <div style={{
                height: "100%",
                width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
                background: "linear-gradient(90deg, #34d399, #10b981)",
                borderRadius: 2,
                boxShadow: "0 0 8px rgba(52,211,153,0.6)",
                transition: "width 0.4s cubic-bezier(.4,0,.2,1)",
              }} />
            </div>

            {/* Başlık — gradient text */}
            <div style={{
              fontSize: 18, fontWeight: 800,
              marginBottom: 10, letterSpacing: -0.3,
              lineHeight: 1.25,
              backgroundImage: "linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              {t(view.title)}
            </div>

            {/* Açıklama */}
            <div style={{
              fontSize: 13, lineHeight: 1.6,
              color: "rgba(255,255,255,0.72)",
              marginBottom: 18,
            }}>
              {t(view.desc)}
            </div>

            {/* CTA — Shimmer overlay'li gradient */}
            <button
              onClick={() => advance()}
              style={{
                position: "relative",
                width: "100%", padding: "13px",
                borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #10b981, #34d399)",
                color: "#0a1628",
                fontSize: 13.5, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
                letterSpacing: 0.5,
                boxShadow: "0 8px 24px rgba(52,211,153,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
                transition: "transform 0.12s",
                overflow: "hidden",
                textTransform: "uppercase",
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)"; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {/* Shimmer overlay */}
              <span aria-hidden style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)",
                backgroundSize: "200% 100%",
                animation: "tourShimmer 2.4s linear infinite",
                pointerEvents: "none",
              }} />
              <span style={{ position: "relative", zIndex: 1 }}>
                {stepIdx >= STEPS.length - 1 ? t("tour_finish") : t("tour_got_it")} →
              </span>
            </button>
          </>
        ) : isCenterStep ? (
          // Banner görünümü — modal'ın üstünde sade ipucu (form modal açıkken)
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              fontSize: 20, flexShrink: 0,
              animation: "tourFloat 2.4s ease-in-out infinite",
            }}>💡</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#34d399", marginBottom: 2 }}>
                {t(view.title)}
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "rgba(255,255,255,0.7)" }}>
                {t(view.desc)}
              </div>
            </div>
            <button
              onClick={finish}
              style={{
                border: "none", background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.55)",
                fontSize: 11, fontWeight: 600,
                cursor: "pointer", padding: "5px 10px",
                borderRadius: 6, fontFamily: "inherit", flexShrink: 0,
              }}
            >
              {t("tour_skip")}
            </button>
          </div>
        ) : (
          // ★ Standart hedef-bazlı tooltip — premium revize
          <>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 10,
            }}>
              <div style={{
                fontSize: 9, fontWeight: 800,
                color: "rgba(52,211,153,0.85)",
                textTransform: "uppercase", letterSpacing: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.22)",
                padding: "2.5px 7px",
                borderRadius: 4,
              }}>
                {String(stepIdx + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {/* ★ Kadrosu zaten olan kullanıcı bu adımda takılmasın */}
                {view.canNext && (
                  <button
                    onClick={() => advance()}
                    style={{
                      border: "1px solid rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.10)",
                      color: "#34d399",
                      fontSize: 10.5, fontWeight: 700,
                      cursor: "pointer",
                      padding: "3px 9px",
                      borderRadius: 5,
                      fontFamily: "inherit",
                    }}
                  >
                    {t("tour_next")} →
                  </button>
                )}
                <button
                  onClick={finish}
                  style={{
                    border: "none", background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 10.5, fontWeight: 600,
                    cursor: "pointer",
                    padding: "3px 9px",
                    borderRadius: 5,
                    fontFamily: "inherit",
                  }}
                >
                  {t("tour_skip")}
                </button>
              </div>
            </div>

            <div style={{
              fontSize: 14.5, fontWeight: 800,
              marginBottom: 5, letterSpacing: -0.2,
              backgroundImage: "linear-gradient(180deg, #ffffff 0%, #34d399 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              {t(view.title)}
            </div>
            <div style={{
              fontSize: 12.5, lineHeight: 1.55,
              color: "rgba(255,255,255,0.72)",
            }}>
              {t(view.desc)}
            </div>

            {/* Yatay progress mini */}
            <div style={{
              height: 2, borderRadius: 1,
              background: "rgba(255,255,255,0.07)",
              overflow: "hidden",
              marginTop: 12,
            }}>
              <div style={{
                height: "100%",
                width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
                background: "linear-gradient(90deg, #34d399, #10b981)",
                borderRadius: 1,
                transition: "width 0.4s cubic-bezier(.4,0,.2,1)",
              }} />
            </div>
          </>
        )}
      </div>
    </>
  );
}