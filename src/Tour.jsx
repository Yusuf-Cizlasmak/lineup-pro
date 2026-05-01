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

// Ana tur — takım kurma akışı + özellik tanıtımı
//
// İlk 6 adım: kullanıcı uygulamayı kullanmayı öğrenir (interaktif, hedef-bazlı)
// Son 4 adım: özellik tanıtımı (merkezi popup, "Anladım" ile ilerler)
//
// waitFor seçenekleri:
//   "click"          → hedefe tıklayınca ilerler
//   "event:NAME"     → window event'i dinler (custom event)
//   "next"           → kullanıcı "İleri/Anladım" butonuna basınca ilerler (hedefsiz info-step)
const STEPS_MAIN = [
  // ─── İLK 6: İnteraktif rehber (kullanım) ───
  { target: "mode-myteam",    title: "tour_0_title", desc: "tour_0_desc", placement: "bottom", waitFor: "event:mode-selected" },
  { target: "tab-squad",      title: "tour_1_title", desc: "tour_1_desc", placement: "top",    waitFor: "click" },
  { target: "btn-add-player", title: "tour_2_title", desc: "tour_2_desc", placement: "bottom", waitFor: "click" },
  { target: null,             title: "tour_3_title", desc: "tour_3_desc", placement: "center", waitFor: "event:player-saved" },
  { target: "tab-field",      title: "tour_4_title", desc: "tour_4_desc", placement: "top",    waitFor: "click" },
  { target: "empty-slot",     title: "tour_5_title", desc: "tour_5_desc", placement: "bottom", waitFor: "click" },
  // ─── YENİ 4: Bilgilendirici özellik turu (info-step, merkezi popup) ───
  { target: null,             title: "tour_6_title",  desc: "tour_6_desc",  placement: "center", waitFor: "next" },
  { target: null,             title: "tour_7_title",  desc: "tour_7_desc",  placement: "center", waitFor: "next" },
  { target: null,             title: "tour_8_title",  desc: "tour_8_desc",  placement: "center", waitFor: "next" },
  { target: null,             title: "tour_9_title",  desc: "tour_9_desc",  placement: "center", waitFor: "next" },
  { target: null,             title: "tour_10_title", desc: "tour_10_desc", placement: "center", waitFor: "next" },
];

// Mini tour — maçı bitir vurgu
const STEPS_MATCH_END = [
  { target: "end-match", title: "tour_me_0_title", desc: "tour_me_0_desc", placement: "bottom", waitFor: "click" },
];

const PAD = 8;
const DIM = "rgba(0,0,0,0.78)";

export default function Tour({ active, onFinish, mode = "main" }) {
  // mode: "main" (takım kurulum) | "matchEnd" (maçı bitir vurgusu)
  const STEPS = mode === "matchEnd" ? STEPS_MATCH_END : STEPS_MAIN;
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [tick, setTick] = useState(0);
  const targetElRef = useRef(null);

  const step = STEPS[stepIdx];

  const measure = useCallback(() => {
    if (!step || !step.target) {
      setRect(null);
      targetElRef.current = null;
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect({ found: false });
      targetElRef.current = null;
      return;
    }
    targetElRef.current = el;
    const r = el.getBoundingClientRect();
    setRect({
      x: r.left, y: r.top, w: r.width, h: r.height,
      found: true,
    });
  }, [step]);

  // Step değişince + DOM güncellemesinden sonra ölç
  useEffect(() => {
    if (!active || !step) return;
    measure();
    const tries = [100, 400, 800, 1500]; // ← önceden [50, 200, 450, 800
    const timers = tries.map((ms) => setTimeout(measure, ms));
    return () => timers.forEach(clearTimeout);
  }, [active, step, tick, measure]);

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
  useEffect(() => {
    if (!active || !step || step.waitFor !== "click") return;
    const el = targetElRef.current;
    if (!el) return;
    let fired = false;
    const handler = () => {
      if (fired) return;
      fired = true;
      setTimeout(() => advance(), 350);
    };
    el.addEventListener("click", handler, true);
    return () => el.removeEventListener("click", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx, rect]);

  // Window event'i (event:NAME)
  useEffect(() => {
    if (!active || !step || !step.waitFor?.startsWith("event:")) return;
    const evtName = step.waitFor.slice("event:".length);
    const handler = () => advance();
    window.addEventListener(`halisaha:${evtName}`, handler);
    return () => window.removeEventListener(`halisaha:${evtName}`, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx]);

  const advance = () => {
    if (stepIdx >= STEPS.length - 1) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
      setTick((x) => x + 1);
    }
  };

  const finish = () => {
    if (mode === "matchEnd") {
      markMatchEndTourDone();
    } else {
      markTourDone();
    }
    setStepIdx(0);
    onFinish?.();
  };

  if (!active || !step) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;

  const hole = step.target && rect?.found ? {
    x: Math.max(0, rect.x - PAD),
    y: Math.max(0, rect.y - PAD),
    w: Math.min(vw, rect.w + PAD * 2),
    h: Math.min(vh, rect.h + PAD * 2),
  } : null;

  // ★ Center step'ler iki farklı tipte:
  //   - Form modal'ı açık olan (waitFor: "event:player-saved") → banner görünümü, modal'ı kapatma
  //   - Bilgilendirici info step (waitFor: "next") → büyük kart, karartılmış arkaplan, "Anladım" butonu
  const isCenterStep = !hole && step.placement === "center";
  const isInfoStep   = isCenterStep && step.waitFor === "next";

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
  } else if (step.placement === "top") {
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
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
        }
        @keyframes tourFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* 4-panel karartma — pointer-events:none, hiçbir şeyi engelleme */}
      {panels.map((p, i) => (
        <div
          key={i}
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

      {/* Pulsing ring around target */}
      {hole && (
        <div
          style={{
            position: "fixed",
            left: hole.x, top: hole.y,
            width: hole.w, height: hole.h,
            borderRadius: 14,
            border: "2.5px solid #34d399",
            boxShadow: "0 0 0 4px rgba(52,211,153,0.18), 0 0 24px rgba(52,211,153,0.4)",
            zIndex: 4501,
            pointerEvents: "none",
            animation: "tourPulse 1.4s ease-in-out infinite",
          }}
        />
      )}

      {/* Tooltip — pointerEvents:auto */}
      <div
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
          padding: isInfoStep ? "20px 22px" : isCenterStep ? "12px 14px" : "14px 16px",
          borderRadius: isInfoStep ? 18 : isCenterStep ? 12 : 14,
          border: isInfoStep ? "1px solid rgba(52,211,153,0.45)" : "1px solid rgba(52,211,153,0.35)",
          boxShadow: isInfoStep
            ? "0 24px 60px rgba(0,0,0,0.65), 0 0 50px rgba(52,211,153,0.25)"
            : isCenterStep
            ? "0 12px 32px rgba(0,0,0,0.55), 0 0 20px rgba(52,211,153,0.18)"
            : "0 16px 40px rgba(0,0,0,0.5), 0 0 24px rgba(52,211,153,0.15)",
          fontFamily: "'DM Sans','Segoe UI',sans-serif",
          zIndex: 4502,
          pointerEvents: "auto",
          animation: "tourFadeIn 0.25s ease-out",
        }}
      >
        {isInfoStep ? (
          // ★ INFO STEP — bilgilendirici büyük kart (özellik tanıtımı)
          <>
            {/* Step counter + skip */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 14,
            }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{
                    width: i === stepIdx ? 18 : 5, height: 5,
                    borderRadius: 3,
                    background: i <= stepIdx ? "#34d399" : "rgba(255,255,255,0.18)",
                    transition: "all 0.25s",
                  }} />
                ))}
              </div>
              <button
                onClick={finish}
                style={{
                  border: "none", background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 11, fontWeight: 600,
                  cursor: "pointer", padding: "4px 10px",
                  borderRadius: 6, fontFamily: "inherit",
                }}
              >
                {t("tour_skip")}
              </button>
            </div>

            {/* Adım numarası */}
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: "rgba(52,211,153,0.7)",
              textTransform: "uppercase", letterSpacing: 1,
              marginBottom: 6,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {t("tour_step_label", { current: stepIdx + 1, total: STEPS.length })}
            </div>

            {/* Başlık */}
            <div style={{
              fontSize: 16, fontWeight: 800, color: "#fff",
              marginBottom: 10, letterSpacing: -0.2,
              lineHeight: 1.25,
            }}>
              {t(step.title)}
            </div>

            {/* Açıklama */}
            <div style={{
              fontSize: 13, lineHeight: 1.55,
              color: "rgba(255,255,255,0.72)",
              marginBottom: 16,
            }}>
              {t(step.desc)}
            </div>

            {/* CTA — İleri / Anladım */}
            <button
              onClick={() => advance()}
              style={{
                width: "100%", padding: "12px",
                borderRadius: 11, border: "none",
                background: "linear-gradient(135deg, #10b981, #34d399)",
                color: "#0a1628",
                fontSize: 13, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
                letterSpacing: 0.3,
                boxShadow: "0 6px 18px rgba(52,211,153,0.35)",
                transition: "transform 0.12s",
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)"; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {stepIdx >= STEPS.length - 1 ? t("tour_finish") : t("tour_got_it")} →
            </button>
          </>
        ) : isCenterStep ? (
          // Banner görünümü — modal'ın üstünde sade ipucu (form modal açıkken)
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20, flexShrink: 0 }}>💡</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#34d399", marginBottom: 2 }}>
                {t(step.title)}
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "rgba(255,255,255,0.7)" }}>
                {t(step.desc)}
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
          <>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 8,
            }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{
                    width: i === stepIdx ? 18 : 5, height: 5,
                    borderRadius: 3,
                    background: i <= stepIdx ? "#34d399" : "rgba(255,255,255,0.18)",
                    transition: "all 0.25s",
                  }} />
                ))}
              </div>
              <button
                onClick={finish}
                style={{
                  border: "none", background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 11, fontWeight: 600,
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontFamily: "inherit",
                }}
              >
                {t("tour_skip")}
              </button>
            </div>

            <div style={{
              fontSize: 14, fontWeight: 700, color: "#34d399",
              marginBottom: 4, letterSpacing: -0.2,
            }}>
              {t(step.title)}
            </div>
            <div style={{
              fontSize: 12.5, lineHeight: 1.5,
              color: "rgba(255,255,255,0.7)",
            }}>
              {t(step.desc)}
            </div>
          </>
        )}
      </div>
    </>
  );
}