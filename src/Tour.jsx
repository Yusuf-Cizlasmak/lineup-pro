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

// Ana tur — takım kurma akışı
const STEPS_MAIN = [
  { target: "mode-myteam",    title: "tour_0_title", desc: "tour_0_desc", placement: "bottom", waitFor: "event:mode-selected" },
  { target: "tab-squad",      title: "tour_1_title", desc: "tour_1_desc", placement: "top",    waitFor: "click" },
  { target: "btn-add-player", title: "tour_2_title", desc: "tour_2_desc", placement: "bottom", waitFor: "click" },
  { target: null,             title: "tour_3_title", desc: "tour_3_desc", placement: "center", waitFor: "event:player-saved" },
  { target: "tab-field",      title: "tour_4_title", desc: "tour_4_desc", placement: "top",    waitFor: "click" },
  { target: "empty-slot",     title: "tour_5_title", desc: "tour_5_desc", placement: "bottom", waitFor: "click" },
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
    markTourDone();
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

  // ★ Center step (form modal'ı zaten açık) — karartma YOK, sadece üstte yardımcı ipucu
  const isCenterStep = !hole && step.placement === "center";

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
  if (isCenterStep) {
    // Modal zaten açık — tooltip'i ekranın üstünde, modal'ı kapatmayacak şekilde göster
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
          background: isCenterStep
            ? "linear-gradient(160deg,rgba(14,17,23,0.96),rgba(17,19,24,0.96))"
            : "linear-gradient(160deg,#0e1117,#111318)",
          backdropFilter: isCenterStep ? "blur(16px)" : "none",
          WebkitBackdropFilter: isCenterStep ? "blur(16px)" : "none",
          color: "#e2e8f0",
          padding: isCenterStep ? "12px 14px" : "14px 16px",
          borderRadius: isCenterStep ? 12 : 14,
          border: "1px solid rgba(52,211,153,0.35)",
          boxShadow: isCenterStep
            ? "0 12px 32px rgba(0,0,0,0.55), 0 0 20px rgba(52,211,153,0.18)"
            : "0 16px 40px rgba(0,0,0,0.5), 0 0 24px rgba(52,211,153,0.15)",
          fontFamily: "'DM Sans','Segoe UI',sans-serif",
          zIndex: 4502,
          pointerEvents: "auto",
          animation: "tourFadeIn 0.25s ease-out",
        }}
      >
        {isCenterStep ? (
          // Banner görünümü — modal'ın üstünde sade ipucu
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
              <div style={{ display: "flex", gap: 4 }}>
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