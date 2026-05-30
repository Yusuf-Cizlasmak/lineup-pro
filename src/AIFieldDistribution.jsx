// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · AIFieldDistribution — Sinematik Saha Dağıtımı
// ─────────────────────────────────────────────────────────────
// Tam ekran saha. AI çekirdeği ortadan oyuncuları mevki slotlarına tek tek
// "fırlatır" (traveler puck → token pop). Formasyon iskeleti baştan görünür,
// canlı denge barı dolar. "Onayla" gerçek kadroya işler.
//
// Props:
//   teamA, teamB    : takım objeleri ({ players, formation, color, name, captain })
//   positionsA/B    : FORMATIONS[formation].positions  ([{x,y,role}])
//   formByPlayerId? : { [id]: formDelta }
//   onClose         : () => void
//   onCommit        : (result) => void   — Onayla'da çağrılır
// ─────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { distributeToField } from "./aiFieldDistribute";
import { playerStrength } from "./teamBalancer";
import { hapticLight, hapticMedium, hapticSuccess } from "./haptics";

const C = {
  ink: "#f4f4f5", inkDim: "rgba(244,244,245,0.60)", inkFaint: "rgba(244,244,245,0.30)",
  line: "rgba(255,255,255,0.08)", lineHi: "rgba(255,255,255,0.16)",
  surface: "#0a1118", surfaceHi: "#0d1620",
  gold: "#fbbf24",
};

const ANALYZE_MS = 1300;
const DEAL_STEP_MS = 230;

const posShort = (pos) => ({
  "KALECİ": "KL", "DEFANS": "DF", "STOPER": "ST", "SOL BEK": "SB",
  "SAĞ BEK": "SĞ", "ORTA SAHA": "OS", "FORVET": "FV",
}[pos] || "OS");

// Formasyon (x,y 0-100) → saha yüzdesi. A alt yarı, B üst yarı (yatay ayna).
function pitchCoord(side, pos) {
  const x = side === "A" ? pos.x : 100 - pos.x;
  const y = side === "A" ? 50 + pos.y * 0.475 : 50 - pos.y * 0.475;
  return { x: Math.max(8, Math.min(92, x)), y: Math.max(4, Math.min(96, y)) };
}

const STATUS = [
  "Tüm oyuncular toplanıyor",
  "Güç ve mevki analizi",
  "Denge optimizasyonu",
  "Saha dizilimi kuruluyor",
];

export default function AIFieldDistribution({
  teamA, teamB, positionsA, positionsB, formByPlayerId = null, onClose, onCommit,
}) {
  const [seed, setSeed] = useState(() => Math.random());
  const [phase, setPhase] = useState("analyzing");
  const [revealed, setRevealed] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);

  const colorA = teamA?.color?.secondary || "#34d399";
  const colorB = teamB?.color?.secondary || "#f87171";

  const result = useMemo(
    () => distributeToField({ teamA, teamB, positionsA, positionsB, formByPlayerId, seed }),
    [teamA, teamB, positionsA, positionsB, formByPlayerId, seed]
  );

  const playerById = useMemo(() => {
    const m = {};
    if (!result.error) {
      [...result.A.players, ...result.B.players].forEach((p) => { m[p.id] = p; });
    }
    return m;
  }, [result]);

  // Dağıtım sırası: A,B dönüşümlü; her takım içinde KL→DEF→OS→FV (lineup zaten sıralı)
  const dealSeq = useMemo(() => {
    if (result.error) return [];
    const out = [];
    const a = result.A.lineup, b = result.B.lineup;
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (a[i]) out.push({ ...a[i], side: "A" });
      if (b[i]) out.push({ ...b[i], side: "B" });
    }
    return out;
  }, [result]);

  const revealedIds = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < revealed; i++) s.add(dealSeq[i]?.playerId);
    return s;
  }, [revealed, dealSeq]);

  const live = useMemo(() => {
    let sA = 0, sB = 0, nA = 0, nB = 0;
    for (let i = 0; i < revealed; i++) {
      const d = dealSeq[i]; if (!d) continue;
      const p = playerById[d.playerId];
      const s = playerStrength(p, formByPlayerId) || 0;
      if (d.side === "A") { sA += s; nA++; } else { sB += s; nB++; }
    }
    return { sA, sB, avgA: nA ? Math.round(sA / nA) : 0, avgB: nB ? Math.round(sB / nB) : 0 };
  }, [revealed, dealSeq, playerById, formByPlayerId]);

  const current = revealed > 0 ? dealSeq[revealed - 1] : null;
  const travel = current
    ? pitchCoord(current.side, current.pos)
    : { x: 50, y: 50 };

  // ── Fazlar ──
  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setTimeout(() => { setPhase("dealing"); hapticMedium(); }, ANALYZE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "analyzing") return;
    const iv = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS.length), ANALYZE_MS / 3.2);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== "dealing") return;
    if (revealed >= dealSeq.length) {
      const t = setTimeout(() => { setPhase("done"); hapticSuccess(); }, 460);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setRevealed((r) => r + 1); hapticLight(); },
      revealed === 0 ? 140 : DEAL_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, revealed, dealSeq.length]);

  const restart = useCallback(() => {
    hapticMedium();
    setSeed(Math.random()); setRevealed(0); setStatusIdx(0); setPhase("analyzing");
  }, []);

  const confirm = useCallback(() => {
    hapticSuccess();
    onCommit && onCommit(result);
    onClose && onClose();
  }, [onCommit, onClose, result]);

  const balancePct = (live.sA + live.sB) > 0 ? (live.sA / (live.sA + live.sB)) * 100 : 50;

  // ── Slot render ──
  const renderSlots = (side, positions, fieldPlayers, captain, color, metaArr) =>
    positions.map((pos, idx) => {
      const pid = fieldPlayers[idx];
      const c = pitchCoord(side, pos);
      const show = pid && revealedIds.has(pid);
      const p = pid ? playerById[pid] : null;
      return (
        <div key={`${side}-${idx}`} style={{
          position: "absolute", left: `${c.x}%`, top: `${c.y}%`,
          transform: "translate(-50%,-50%)", zIndex: show ? 4 : 2,
        }}>
          {show && p ? (
            (() => {
              const m = metaArr && metaArr[idx];
              const eff = m ? m.effStrength : playerStrength(p, formByPlayerId);
              const oop = m && m.isOutOfPosition;
              const emergencyGK = m && m.tier === "gk_emergency";
              const ringColor = emergencyGK ? "#f87171" : oop ? C.gold : color;
              return (
            <div className="aifd-pop" style={{ width: 56, textAlign: "center" }}>
              <div style={{
                position: "relative", width: 44, height: 44, margin: "0 auto",
                borderRadius: "50%", display: "grid", placeItems: "center",
                background: `radial-gradient(circle at 50% 35%, ${color}33, #0a0f16 75%)`,
                border: `2px solid ${ringColor}`,
                boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 14px ${ringColor}55`,
              }}>
                <span style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, lineHeight: 1,
                  color: oop || emergencyGK ? "#fde68a" : C.ink, letterSpacing: 0.5,
                }}>{eff}</span>
                <span style={{
                  position: "absolute", top: -5, right: -5, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 7.5, fontWeight: 700, color, background: "#0a0f16",
                  border: `1px solid ${color}66`, borderRadius: 4, padding: "1px 3px",
                }}>{posShort(pos.role)}</span>
                {/* Mevki-dışı ceza rozeti */}
                {m && m.penalty > 0 && (
                  <span style={{
                    position: "absolute", top: -6, left: -6, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 8, fontWeight: 800, color: emergencyGK ? "#fff" : "#3a2a00",
                    background: emergencyGK ? "#ef4444" : C.gold, borderRadius: 4, padding: "1px 3px",
                    border: "1.5px solid #0a0f16",
                  }}>−{m.penalty}</span>
                )}
                {captain === pid && (
                  <span style={{
                    position: "absolute", bottom: -5, left: -5, width: 15, height: 15,
                    borderRadius: "50%", background: C.gold, color: "#3a2a00",
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, display: "grid",
                    placeItems: "center", border: "1.5px solid #0a0f16",
                  }}>C</span>
                )}
              </div>
              <div style={{
                marginTop: 3, fontSize: 9.5, fontWeight: 700, color: C.ink,
                fontFamily: "'DM Sans', sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 60,
              }}>{(p.name || "Oyuncu").split(" ")[0]}</div>
              {/* Uyum ibaresi (yalnız mevki dışında) */}
              {m && (oop || emergencyGK) && (
                <div style={{
                  marginTop: 1, fontSize: 7.5, fontWeight: 700, letterSpacing: 0.3,
                  color: emergencyGK ? "#f87171" : C.gold,
                  textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                }}>{m.note}</div>
              )}
            </div>
              );
            })()
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              border: `1.5px dashed ${color}55`, background: `${color}10`,
              display: "grid", placeItems: "center",
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: `${color}aa`,
                fontWeight: 700,
              }}>{posShort(pos.role)}</span>
            </div>
          )}
        </div>
      );
    });

  const tooFew = result.error === "min_2_players";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9500, background: "#05080d",
      display: "flex", flexDirection: "column",
      paddingTop: "max(10px, env(safe-area-inset-top))",
    }}>
      <style>{`
        @keyframes aifd-spin { to { transform: rotate(360deg) } }
        @keyframes aifd-pulse { 0%,100% { transform: scale(1); opacity:.9 } 50% { transform: scale(1.14); opacity:1 } }
        @keyframes aifd-pop { 0% { transform: scale(.5); opacity:0 } 60% { transform: scale(1.08) } 100% { transform: scale(1); opacity:1 } }
        @keyframes aifd-scan { 0% { transform: translateY(-100%) } 100% { transform: translateY(2000%) } }
        @keyframes aifd-rise { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:none } }
        .aifd-pop { animation: aifd-pop .32s cubic-bezier(.34,1.56,.64,1); }
        .aifd-pulse { animation: aifd-pulse 1.3s ease-in-out infinite; }
      `}</style>

      {/* Üst bar — denge + başlık */}
      <div style={{ padding: "8px 16px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, lineHeight: 1, color: C.ink, letterSpacing: 1.2 }}>
              AI SAHA DAĞITIMI
            </div>
            <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
              {tooFew ? "Yetersiz oyuncu" :
               phase === "done" ? `Denge %${result.balance} · ${result.poolSize} oyuncu havuzu` :
               "Tüm oyuncular dengeli iki kadroya dağıtılıyor"}
            </div>
          </div>
          <button onClick={() => { hapticLight(); onClose(); }} disabled={phase === "dealing"} style={{
            width: 34, height: 34, borderRadius: 9, background: C.surface,
            border: `1px solid ${C.line}`, color: C.inkDim, fontSize: 18, cursor: "pointer",
            opacity: phase === "dealing" ? 0.35 : 1, flexShrink: 0,
          }}>×</button>
        </div>

        {!tooFew && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5, fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: colorA, fontWeight: 700 }}>{teamA?.name || "A"} · {live.avgA || "—"}</span>
              <span style={{ color: colorB, fontWeight: 700 }}>{live.avgB || "—"} · {teamB?.name || "B"}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, overflow: "hidden", background: C.surfaceHi, border: `1px solid ${C.line}`, display: "flex" }}>
              <div style={{ width: `${balancePct}%`, background: colorA, transition: "width .4s cubic-bezier(.4,0,.2,1)" }} />
              <div style={{ flex: 1, background: colorB, transition: "width .4s" }} />
            </div>
          </>
        )}
      </div>

      {/* SAHA */}
      {tooFew ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center", color: C.inkDim, fontSize: 14, textAlign: "center", padding: 24 }}>
          AI dağıtımı için iki takımda toplam en az 2 oyuncu olmalı.
        </div>
      ) : (
        <div style={{ flex: 1, position: "relative", overflow: "hidden", margin: "0 10px" }}>
          {/* Çim + çizgiler */}
          <svg viewBox="0 0 100 200" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="aifd-turf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0e2a1c" /><stop offset="50%" stopColor="#0a2016" /><stop offset="100%" stopColor="#0e2a1c" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="200" fill="url(#aifd-turf)" />
            {[...Array(8)].map((_, i) => (
              <rect key={i} x="0" y={i * 25} width="100" height="12.5" fill={i % 2 ? "rgba(255,255,255,0.018)" : "transparent"} />
            ))}
            <g stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" fill="none">
              <rect x="3" y="3" width="94" height="194" />
              <line x1="3" y1="100" x2="97" y2="100" />
              <circle cx="50" cy="100" r="16" />
              <circle cx="50" cy="100" r="1" fill="rgba(255,255,255,0.3)" />
              <rect x="28" y="3" width="44" height="22" />
              <rect x="28" y="175" width="44" height="22" />
            </g>
          </svg>

          {/* Analiz tarama çizgisi */}
          {phase === "analyzing" && (
            <div style={{
              position: "absolute", left: 0, right: 0, height: "8%",
              background: `linear-gradient(180deg, transparent, ${colorA}30, transparent)`,
              animation: "aifd-scan 1.2s linear infinite",
            }} />
          )}

          {/* Slotlar */}
          {renderSlots("A", positionsA, result.A.fieldPlayers, result.A.captain, colorA, result.A.meta)}
          {renderSlots("B", positionsB, result.B.fieldPlayers, result.B.captain, colorB, result.B.meta)}

          {/* Traveler puck — AI'dan slota uçar */}
          {phase === "dealing" && (
            <div style={{
              position: "absolute", left: `${travel.x}%`, top: `${travel.y}%`,
              width: 12, height: 12, borderRadius: "50%", zIndex: 6,
              transform: "translate(-50%,-50%)",
              transition: "left .2s cubic-bezier(.4,0,.2,1), top .2s cubic-bezier(.4,0,.2,1)",
              background: current?.side === "A" ? colorA : colorB,
              boxShadow: `0 0 16px 4px ${current?.side === "A" ? colorA : colorB}`,
            }} />
          )}

          {/* AI çekirdek (orta) */}
          {phase !== "done" && (
            <div style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
              width: 56, height: 56, zIndex: 5,
            }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent",
                borderTopColor: colorA, borderRightColor: `${colorA}44`,
                animation: "aifd-spin 2.2s linear infinite",
              }} />
              <div className="aifd-pulse" style={{
                position: "absolute", inset: 12, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(16,185,129,0.4), transparent 70%)",
                display: "grid", placeItems: "center",
              }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: C.ink, letterSpacing: 1 }}>AI</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Durum / ticker */}
      {!tooFew && (
        <div style={{ padding: "8px 16px", flexShrink: 0, minHeight: 30 }}>
          {phase === "analyzing" && (
            <div key={statusIdx} style={{ fontSize: 13, color: C.inkDim, animation: "aifd-rise .3s ease", fontFamily: "'DM Sans', sans-serif" }}>
              {STATUS[statusIdx]}…
            </div>
          )}
          {phase === "dealing" && current && (
            <div key={current.playerId} style={{ display: "flex", alignItems: "center", gap: 8, animation: "aifd-rise .25s ease" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkFaint }}>
                {revealed}/{dealSeq.length}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: "'DM Sans', sans-serif" }}>
                {(playerById[current.playerId]?.name || "Oyuncu")}
              </span>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 0.5, color: current.side === "A" ? colorA : colorB }}>
                → {current.side === "A" ? teamA?.name : teamB?.name} · {posShort(current.pos.role)}
              </span>
              {current.penalty > 0 && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                  color: current.tier === "gk_emergency" ? "#f87171" : C.gold,
                }}>{current.note} −{current.penalty}</span>
              )}
            </div>
          )}
          {phase === "done" && (
            <div style={{ fontSize: 12.5, color: C.inkDim, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: C.gold }}>Denge %{result.balance}</span>
              <span>Yedek {result.A.bench.length}+{result.B.bench.length}</span>
              {result.totalOutOfPos > 0 && (
                <span style={{ color: C.gold }}>{result.totalOutOfPos} oyuncu mevki dışı</span>
              )}
              {result.hasEmergencyGK && (
                <span style={{ color: "#f87171", fontWeight: 700 }}>⚠ Gerçek kaleci yok — acil görev</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: "10px 16px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 10, flexShrink: 0,
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}>
        <button onClick={restart} disabled={phase === "dealing" || tooFew} style={{
          flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${C.lineHi}`,
          background: C.surfaceHi, color: C.ink, opacity: (phase === "dealing" || tooFew) ? 0.5 : 1,
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1,
          cursor: (phase === "dealing" || tooFew) ? "default" : "pointer",
        }}>{phase === "analyzing" ? "ANALİZ…" : "TEKRAR DAĞIT"}</button>
        <button onClick={confirm} disabled={phase !== "done"} style={{
          flex: 1.3, padding: "13px 0", borderRadius: 12, border: "none",
          background: phase === "done" ? "#10b981" : C.surface,
          color: phase === "done" ? "#04130d" : C.inkDim, opacity: phase === "done" ? 1 : 0.5,
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1,
          cursor: phase === "done" ? "pointer" : "default",
        }}>SAHAYA UYGULA</button>
      </div>
    </div>
  );
}