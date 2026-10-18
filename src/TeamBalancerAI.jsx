// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · TeamBalancerAI — "AI Canlı Dağıtım"
// ─────────────────────────────────────────────────────────────
// Kuralsal motor (teamBalancer) sonucu, sahnelenmiş bir deneyimle sunulur:
//   1) ANALİZ   — AI çekirdeği güçleri/mevkileri tarıyormuş gibi (shimmer + pulse)
//   2) DAĞITIM  — oyuncular A/B'ye tek tek, dönüşümlü ve animasyonla yerleşir;
//                 güç barları ve denge metresi CANLI dolar; her dağıtımda haptik
//   3) SONUÇ    — denge skoru + tekrar dağıt / paylaş
//
// Bağımlılık YOK — saf CSS keyframes + React state machine. Capacitor webview-safe.
//
// Props (önceki TeamBalancerModal ile birebir uyumlu — drop-in):
//   players          : [{ id, name, surname?, position, rating, attributes? }]
//   formByPlayerId?  : { [id]: formDelta }
//   onClose          : () => void
//   onShare?         : (result) => void
// ─────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { buildBalancedTeams, playerStrength } from "./teamBalancer";
import { hapticLight, hapticMedium, hapticSuccess } from "./haptics";
import { presentPlayers } from "./roster";

const C = {
  bg: "#06090e", bgDeep: "#04070b", surface: "#0a1118", surfaceHi: "#0d1620",
  ink: "#f4f4f5", inkDim: "rgba(244,244,245,0.60)", inkFaint: "rgba(244,244,245,0.30)",
  line: "rgba(255,255,255,0.07)", lineHi: "rgba(255,255,255,0.14)",
  primary: "#10b981", primaryDim: "#059669",
  red: "#f87171", redDim: "#ef4444",
  gold: "#fbbf24",
};

const posShort = (pos) => ({
  "KALECİ": "KL", "DEFANS": "DF", "STOPER": "ST", "SOL BEK": "SB",
  "SAĞ BEK": "SĞ", "ORTA SAHA": "OS", "FORVET": "FV",
}[pos] || "OS");

const fullName = (p) => {
  const n = (p.name || "").trim(), s = (p.surname || "").trim();
  return (n + " " + s).trim() || "Oyuncu";
};

const ANALYZE_MS = 1350;
const DEAL_STEP_MS = 240;

const STATUS_LINES = [
  "Oyuncu güçleri taranıyor",
  "Mevki dağılımı analiz ediliyor",
  "Denge optimizasyonu çalışıyor",
  "Kadrolar oluşturuluyor",
];

// ═══ AI çekirdek görseli (saha orta yuvarlağı + dönen halka) ═══
function AICore({ active }) {
  return (
    <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
      <div className="tbai-ring" style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        border: `2px solid transparent`,
        borderTopColor: C.primary, borderRightColor: `${C.primary}55`,
      }} />
      <div className="tbai-ring-rev" style={{
        position: "absolute", inset: 7, borderRadius: "50%",
        border: `1.5px solid transparent`,
        borderBottomColor: C.gold, borderLeftColor: `${C.gold}44`,
      }} />
      <div className={active ? "tbai-pulse" : ""} style={{
        position: "absolute", inset: 16, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.primary}33, transparent 70%)`,
        display: "grid", placeItems: "center",
      }}>
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1,
          color: C.ink,
        }}>AI</span>
      </div>
    </div>
  );
}

function PlayerCard({ player, accent, strength, revealed }) {
  return (
    <div
      className={revealed ? "tbai-pop" : ""}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "8px 10px", borderRadius: 10,
        background: revealed
          ? `linear-gradient(135deg, ${accent}1c, ${C.surfaceHi})`
          : C.surface,
        border: `1px solid ${revealed ? accent + "3a" : C.line}`,
        opacity: revealed ? 1 : 0.22,
        transform: revealed ? "none" : "translateY(6px)",
        transition: "opacity .3s ease, transform .3s ease, background .3s ease, border-color .3s ease",
        minHeight: 44,
      }}
    >
      {revealed ? (
        <>
          <span style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: 7,
            display: "grid", placeItems: "center",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
            color: accent, background: `${accent}1f`, border: `1px solid ${accent}3a`,
          }}>{posShort(player.position)}</span>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.ink,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            fontFamily: "'DM Sans', sans-serif",
          }}>{fullName(player)}</span>
          <span style={{
            flexShrink: 0, fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 17, lineHeight: 1, color: accent, letterSpacing: 0.5,
          }}>{strength}</span>
        </>
      ) : (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.inkFaint,
          letterSpacing: 1,
        }}>· · ·</span>
      )}
    </div>
  );
}

export default function TeamBalancerAI({ players = [], formByPlayerId = null, onClose, onShare, onCommit, commitLabel = "UYGULA" }) {
  const [seed, setSeed] = useState(() => Math.random());
  const [phase, setPhase] = useState("analyzing"); // analyzing | dealing | done
  const [revealed, setRevealed] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);

  // ★ Sadece bu hafta GELENLER dağıtılır (p.absent === true olanlar dışarıda)
  const present = useMemo(() => presentPlayers(players), [players]);
  const absentCount = (players?.length || 0) - present.length;
  const attendanceLine = `${present.length} kişi geliyor${absentCount > 0 ? ` · ${absentCount} kişi yok` : ""}`;

  const tooFew = present.length < 4;

  const result = useMemo(
    () => buildBalancedTeams(present, { formByPlayerId, seed }),
    [present, formByPlayerId, seed]
  );

  // Güç önbelleği
  const strengthMap = useMemo(() => {
    const m = {};
    [...result.teamA, ...result.teamB].forEach((p) => { m[p.id] = playerStrength(p, formByPlayerId); });
    return m;
  }, [result, formByPlayerId]);

  // Dağıtım sırası — A,B,A,B... dönüşümlü (sahnede dengeli görünür)
  const deal = useMemo(() => {
    const order = [];
    const max = Math.max(result.teamA.length, result.teamB.length);
    for (let i = 0; i < max; i++) {
      if (result.teamA[i]) order.push({ player: result.teamA[i], side: "A", slot: i });
      if (result.teamB[i]) order.push({ player: result.teamB[i], side: "B", slot: i });
    }
    return order;
  }, [result]);

  const revealedSet = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < revealed; i++) s.add(deal[i]?.player?.id);
    return s;
  }, [revealed, deal]);

  // Canlı toplam/ortalama (sadece açılmış oyuncular)
  const live = useMemo(() => {
    let sumA = 0, sumB = 0, nA = 0, nB = 0;
    for (let i = 0; i < revealed; i++) {
      const d = deal[i]; if (!d) continue;
      const s = strengthMap[d.player.id] || 0;
      if (d.side === "A") { sumA += s; nA++; } else { sumB += s; nB++; }
    }
    return {
      sumA, sumB, nA, nB,
      avgA: nA ? Math.round(sumA / nA) : 0,
      avgB: nB ? Math.round(sumB / nB) : 0,
    };
  }, [revealed, deal, strengthMap]);

  const current = revealed > 0 ? deal[revealed - 1] : null;
  const activeSide = phase === "dealing" && current ? current.side : null;

  // ── Faz: analiz → dağıtım ──
  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setTimeout(() => { setPhase("dealing"); hapticMedium(); }, ANALYZE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Analiz sırasında durum metni döngüsü ──
  useEffect(() => {
    if (phase !== "analyzing") return;
    const iv = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_LINES.length), ANALYZE_MS / 3.2);
    return () => clearInterval(iv);
  }, [phase]);

  // ── Dağıtım: oyuncuları tek tek aç ──
  useEffect(() => {
    if (phase !== "dealing") return;
    if (revealed >= deal.length) {
      const t = setTimeout(() => { setPhase("done"); hapticSuccess(); }, 480);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setRevealed((r) => r + 1);
      hapticLight();
    }, revealed === 0 ? 120 : DEAL_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, revealed, deal.length]);

  const restart = useCallback(() => {
    hapticMedium();
    setSeed(Math.random());
    setRevealed(0);
    setStatusIdx(0);
    setPhase("analyzing");
  }, []);

  const handleShare = useCallback(() => { hapticSuccess(); onShare && onShare(result); }, [onShare, result]);
  const handleCommit = useCallback(() => { hapticSuccess(); onCommit && onCommit(result); onClose && onClose(); }, [onCommit, onClose, result]);

  const balancePct = result.sumA + result.sumB > 0
    ? (live.sumA / (live.sumA + live.sumB)) * 100
    : 50;

  return (
    <div
      onClick={phase === "done" ? onClose : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(2,4,8,0.82)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <style>{`
        @keyframes tbai-spin { to { transform: rotate(360deg); } }
        @keyframes tbai-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes tbai-pulse { 0%,100% { transform: scale(1); opacity:.85 } 50% { transform: scale(1.12); opacity:1 } }
        @keyframes tbai-pop {
          0% { transform: translateY(10px) scale(.94); }
          60% { transform: translateY(-2px) scale(1.015); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes tbai-shimmer { 0% { background-position: -160% 0 } 100% { background-position: 260% 0 } }
        @keyframes tbai-beam { 0%,100% { opacity:.25 } 50% { opacity:.9 } }
        @keyframes tbai-rise { from { opacity:0; transform: translateY(12px) } to { opacity:1; transform:none } }
        .tbai-ring { animation: tbai-spin 2.4s linear infinite; }
        .tbai-ring-rev { animation: tbai-spin-rev 3.4s linear infinite; }
        .tbai-pulse { animation: tbai-pulse 1.4s ease-in-out infinite; }
        .tbai-pop { animation: tbai-pop .34s cubic-bezier(.34,1.56,.64,1); }
        .tbai-scan {
          background: linear-gradient(100deg, transparent 30%, ${C.primary}22 50%, transparent 70%);
          background-size: 220% 100%;
          animation: tbai-shimmer 1.2s linear infinite;
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 540, maxHeight: "94vh",
          background: `radial-gradient(120% 80% at 50% 0%, ${C.surface}, ${C.bgDeep} 70%)`,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          border: `1px solid ${C.lineHi}`, borderBottom: "none",
          display: "flex", flexDirection: "column", overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Saha atmosferi — orta yuvarlak + çizgi */}
        <svg viewBox="0 0 540 200" preserveAspectRatio="none" style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: 200,
          opacity: 0.10, pointerEvents: "none",
        }}>
          <line x1="270" y1="0" x2="270" y2="200" stroke="#fff" strokeWidth="1" />
          <circle cx="270" cy="100" r="62" fill="none" stroke="#fff" strokeWidth="1" />
          <circle cx="270" cy="100" r="2.5" fill="#fff" />
        </svg>

        {/* Header */}
        <div style={{
          padding: "16px 18px 10px", borderBottom: `1px solid ${C.line}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "relative", zIndex: 2,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 27, lineHeight: 1,
                color: C.ink, letterSpacing: 1.2,
              }}>AI TAKIM DAĞITIMI</span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1,
                color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 5,
                padding: "2px 5px",
              }}>BETA</span>
            </div>
            <div style={{ fontSize: 12, color: C.inkDim, marginTop: 3 }}>
              {phase === "done"
                ? `Denge %${result.balance} · fark ${result.diff} puan · ${attendanceLine}`
                : `${attendanceLine} · güç ve mevkiye göre dağıtım`}
            </div>
          </div>
          <button
            data-screenshot-hide="true"
            onClick={() => { hapticLight(); onClose(); }}
            disabled={phase === "dealing"}
            style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: C.surface, border: `1px solid ${C.line}`,
              color: C.inkDim, fontSize: 18, cursor: "pointer",
              opacity: phase === "dealing" ? 0.35 : 1,
            }}
          >×</button>
        </div>

        {tooFew ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.inkDim, fontSize: 14, zIndex: 2 }}>
            AI dağıtımı için bu hafta en az <b style={{ color: C.ink }}>4 oyuncu</b> gelmeli.<br />
            Şu an: {present.length} kişi geliyor{absentCount > 0 ? ` · ${absentCount} kişi "bu hafta yok"` : ""}.
          </div>
        ) : (
          <>
            {/* Denge metresi (canlı) */}
            <div style={{ padding: "12px 18px 6px", zIndex: 2 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                fontSize: 11, marginBottom: 6,
              }}>
                <span style={{ color: C.primary, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  A {live.avgA || "—"}
                </span>
                <span style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1,
                  color: phase === "done" ? C.gold : C.inkDim,
                }}>
                  {phase === "done" ? `DENGE %${result.balance}` : "DENGELENİYOR"}
                </span>
                <span style={{ color: C.red, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {live.avgB || "—"} B
                </span>
              </div>
              <div style={{
                height: 8, borderRadius: 5, overflow: "hidden",
                background: C.surfaceHi, border: `1px solid ${C.line}`, display: "flex",
              }}>
                <div style={{
                  width: `${balancePct}%`, background: `linear-gradient(90deg, ${C.primaryDim}, ${C.primary})`,
                  transition: "width .4s cubic-bezier(.4,0,.2,1)",
                }} />
                <div style={{ flex: 1, background: `linear-gradient(90deg, ${C.red}, ${C.redDim})`, transition: "width .4s" }} />
              </div>
            </div>

            {/* AI çekirdek + durum / ticker */}
            <div style={{
              margin: "8px 18px 4px", padding: "10px 12px", borderRadius: 14, zIndex: 2,
              background: C.surface, border: `1px solid ${C.line}`,
              display: "flex", alignItems: "center", gap: 12, minHeight: 86,
            }}>
              <AICore active={phase !== "done"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {phase === "analyzing" && (
                  <>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkFaint, letterSpacing: 1, marginBottom: 4 }}>
                      ANALİZ EDİLİYOR
                    </div>
                    <div key={statusIdx} style={{
                      fontSize: 14.5, color: C.ink, fontWeight: 600, animation: "tbai-rise .3s ease",
                      fontFamily: "'DM Sans', sans-serif",
                    }}>{STATUS_LINES[statusIdx]}…</div>
                    <div className="tbai-scan" style={{
                      marginTop: 8, height: 5, borderRadius: 3, background: C.surfaceHi,
                    }} />
                  </>
                )}
                {phase === "dealing" && current && (
                  <>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkFaint, letterSpacing: 1, marginBottom: 4 }}>
                      DAĞITILIYOR · {revealed}/{deal.length}
                    </div>
                    <div key={current.player.id} style={{ display: "flex", alignItems: "center", gap: 8, animation: "tbai-rise .25s ease" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: "'DM Sans', sans-serif" }}>
                        {fullName(current.player)}
                      </span>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1,
                        color: current.side === "A" ? C.primary : C.red,
                      }}>→ {current.side} TAKIMI</span>
                    </div>
                  </>
                )}
                {phase === "done" && (
                  <>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.primary, letterSpacing: 1, marginBottom: 4 }}>
                      DAĞITIM TAMAMLANDI
                    </div>
                    <div style={{ fontSize: 14.5, color: C.ink, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                      {result.balance >= 85 ? "Kadrolar neredeyse kusursuz dengeli." :
                       result.balance >= 65 ? "Dengeli iki takım hazır." :
                       "En iyi olası denge bu kadroyla bu."}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Takım kolonları */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px 8px", zIndex: 2 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {[
                  { title: "A TAKIMI", team: result.teamA, accent: C.primary, avg: live.avgA, sum: live.sumA, side: "A" },
                  { title: "B TAKIMI", team: result.teamB, accent: C.red, avg: live.avgB, sum: live.sumB, side: "B" },
                ].map((col) => (
                  <div key={col.side} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "9px 11px", borderRadius: 12,
                      background: `linear-gradient(135deg, ${col.accent}22, ${col.accent}08)`,
                      border: `1px solid ${col.accent}40`,
                      boxShadow: activeSide === col.side ? `0 0 0 1px ${col.accent}66, 0 0 18px ${col.accent}33` : "none",
                      transition: "box-shadow .25s ease",
                    }}>
                      <div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, lineHeight: 1, color: C.ink, letterSpacing: 0.5 }}>
                          {col.title}
                        </div>
                        <div style={{ fontSize: 10.5, color: C.inkDim, marginTop: 2 }}>
                          {col.team.filter((p) => revealedSet.has(p.id)).length}/{col.team.length} · {col.sum}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, lineHeight: 1, color: col.accent }}>
                          {col.avg || "—"}
                        </div>
                        <div style={{ fontSize: 8, color: C.inkFaint, letterSpacing: 1 }}>ORT. GÜÇ</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {col.team.map((p) => (
                        <PlayerCard key={p.id} player={p} accent={col.accent}
                          strength={strengthMap[p.id]} revealed={revealedSet.has(p.id)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div data-screenshot-hide="true" style={{
              padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 10, zIndex: 2,
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
            }}>
              <button
                onClick={restart}
                disabled={phase === "dealing"}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  cursor: phase === "dealing" ? "default" : "pointer",
                  background: onCommit ? C.surfaceHi : (phase === "dealing" ? C.surface : C.primary),
                  opacity: phase === "dealing" ? 0.5 : 1,
                  border: onCommit ? `1px solid ${C.lineHi}` : "none",
                  color: onCommit ? C.ink : (phase === "dealing" ? C.inkDim : "#04130d"),
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, letterSpacing: 1,
                }}
              >{phase === "analyzing" ? "ANALİZ…" : "TEKRAR DAĞIT"}</button>
              {onCommit && (
                <button
                  onClick={handleCommit}
                  disabled={phase !== "done"}
                  style={{
                    flex: 1.3, padding: "13px 0", borderRadius: 12,
                    cursor: phase !== "done" ? "default" : "pointer",
                    background: phase === "done" ? C.primary : C.surface,
                    opacity: phase !== "done" ? 0.5 : 1,
                    border: "none", color: phase === "done" ? "#04130d" : C.inkDim,
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, letterSpacing: 1,
                  }}
                >{commitLabel}</button>
              )}
              {onShare && !onCommit && (
                <button
                  onClick={handleShare}
                  disabled={phase !== "done"}
                  style={{
                    flex: 1, padding: "13px 0", borderRadius: 12,
                    cursor: phase !== "done" ? "default" : "pointer",
                    background: C.surfaceHi, opacity: phase !== "done" ? 0.5 : 1,
                    border: `1px solid ${C.lineHi}`, color: C.ink,
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, letterSpacing: 1,
                  }}
                >PAYLAŞ</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}