// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Oyuncu Profil & İstatistik (FIFA Kart Tarzı)
// + Form chart (son 10 maç) — saf SVG ile çizdik (recharts dependency yok)
// + Spider Chart (yetenekler) + Form Gücü rozeti
// ─────────────────────────────────────────────────────────────
import React, { useMemo } from "react";
import { t, tPos } from "./i18n";
import { hapticLight } from "./haptics";
import { getAllMatches, getPlayerStats } from "./matchHistoryStore";
import {
  ensurePlayerAttributes,
  getAttrKeys,
  computeForm,
} from "./playerAttributes";
import SpiderChart from "./SpiderChart";
import FormBadge from "./FormBadge";

const getInitials = (n, s) => {
  const name = (n || "").trim();
  const surname = (s || "").trim();
  if (name && surname) return `${name[0]}${surname[0]}`.toUpperCase();
  if (name) return name[0].toUpperCase();
  if (surname) return surname[0].toUpperCase();
  return "⚽";
};

// Rating'e göre renk
const ratingColor = (rating) => {
  if (rating >= 90) return "#fbbf24"; // gold
  if (rating >= 80) return "#a78bfa"; // purple
  if (rating >= 70) return "#60a5fa"; // blue
  if (rating >= 60) return "#34d399"; // green
  return "#94a3b8"; // gray
};

// Pozisyon kısaltması (FIFA tarzı)
const positionShort = (pos) => {
  const map = {
    "KALECİ": "GK", "DEFANS": "DEF", "ORTASAHA": "MID", "FORVET": "FWD",
    "SOL BEK": "LB", "SAĞ BEK": "RB", "STOPER": "CB",
    "DEFANSİF ORTASAHA": "DM", "OFANSİF ORTASAHA": "AM",
    "SOL KANAT": "LW", "SAĞ KANAT": "RW", "SANTRAFOR": "ST",
  };
  return map[pos] || (pos || "—").substring(0, 3).toUpperCase();
};

// ─── FIFA STYLE PLAYER CARD ───
const FifaCard = ({ player, accent }) => {
  const rating = player.rating || 70;
  const ratingCol = ratingColor(rating);

  return (
    <div style={{
      position: "relative",
      borderRadius: 18,
      overflow: "hidden",
      padding: "0",
      background: `linear-gradient(160deg, ${accent}28, ${accent}08 60%, rgba(0,0,0,0.4))`,
      border: `1px solid ${accent}40`,
      marginBottom: 14,
      boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 30px ${accent}22`,
      animation: "fifaCardIn 0.5s cubic-bezier(.34,1.56,.64,1)",
    }}>
      {/* Glow background */}
      <div style={{
        position: "absolute",
        top: -40, left: -40, right: -40, height: 140,
        background: `radial-gradient(circle at 50% 0%, ${accent}55 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative",
        padding: "18px 20px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        alignItems: "center",
      }}>
        {/* Sol: Rating + position */}
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 4,
          minWidth: 56,
        }}>
          <div style={{
            fontSize: 38, fontWeight: 900, color: ratingCol,
            fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
            textShadow: `0 0 16px ${ratingCol}88`,
          }}>{rating}</div>
          <div style={{
            fontSize: 11, fontWeight: 800,
            color: ratingCol, opacity: 0.85,
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: 1.2,
          }}>
            {positionShort(player.position)}
          </div>
        </div>

        {/* Orta: Forma + isim */}
        <div style={{ minWidth: 0, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
            margin: "0 auto 8px",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#0a1628", fontWeight: 800,
            fontSize: 24,
            fontFamily: "'JetBrains Mono', monospace",
            boxShadow: `0 8px 22px ${accent}66`,
          }}>
            {player.jerseyNumber || getInitials(player.name, player.surname)}
          </div>
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.55)",
            fontWeight: 700, textTransform: "uppercase",
            letterSpacing: 0.5, lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {player.name}
          </div>
          <div style={{
            fontSize: 16, fontWeight: 800, color: "#fff",
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: 1, lineHeight: 1.1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {(player.surname || "").toUpperCase()}
          </div>
        </div>

        {/* Sağ: Pozisyon detayı */}
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 4,
          minWidth: 56,
        }}>
          <div style={{
            padding: "5px 8px",
            borderRadius: 6,
            background: "rgba(0,0,0,0.35)",
            fontSize: 9, fontWeight: 800,
            color: ratingCol,
            letterSpacing: 0.5,
            fontFamily: "'Bebas Neue', sans-serif",
            textTransform: "uppercase",
          }}>
            ⭐ {rating >= 90 ? "ELITE" : rating >= 80 ? "RARE" : rating >= 70 ? "GOLD" : rating >= 60 ? "SILVER" : "BRONZE"}
          </div>
        </div>
      </div>

      {/* Pozisyon tam isim */}
      <div style={{
        background: "rgba(0,0,0,0.3)",
        padding: "8px 20px",
        textAlign: "center",
        fontSize: 10, fontWeight: 700,
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 1.2, textTransform: "uppercase",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        {tPos(player.position)}
      </div>
    </div>
  );
};

// ─── FORM CHART (son 10 maç) — Saf SVG ───
const FormChart = ({ matches, accent }) => {
  if (!matches || matches.length === 0) return null;

  // Maçları kronolojik sırala (eskiden yeniye)
  const sorted = [...matches].sort((a, b) => a.playedAt - b.playedAt).slice(-10);

  // Her maç için "performans skoru" — gol*2 + asist*1 + (W:2, D:1, L:0)
  const dataPoints = sorted.map((m) => {
    const result = m.result === "W" ? 2 : m.result === "D" ? 1 : 0;
    return Math.min(10, m.goals * 2 + m.assists + result);
  });

  if (dataPoints.length < 2) return null;

  const W = 280;
  const H = 80;
  const PAD = 8;
  const max = 10;

  // Path
  const stepX = (W - PAD * 2) / (dataPoints.length - 1);
  const points = dataPoints.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return { x, y, v };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const fill = `${path} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;

  return (
    <div style={{
      padding: 14,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 12,
      marginBottom: 14,
    }}>
      <div style={{
        fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
      }}>
        📈 {t("ps_form_chart")}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 80 }}>
        <defs>
          <linearGradient id={`formFill-${accent.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.5, 1].map((g) => (
          <line key={g}
            x1={PAD} y1={H - PAD - g * (H - PAD * 2)}
            x2={W - PAD} y2={H - PAD - g * (H - PAD * 2)}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 4"
          />
        ))}
        {/* Fill */}
        <path d={fill} fill={`url(#formFill-${accent.replace("#", "")})`} />
        {/* Line */}
        <path d={path} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => {
          const m = sorted[i];
          const isWin = m.result === "W";
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={isWin ? 4 : 3} fill={accent} />
              <circle cx={p.x} cy={p.y} r={isWin ? 6 : 4} fill={accent} opacity="0.3" />
            </g>
          );
        })}
      </svg>
      {/* W/D/L badge satırı */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 8, gap: 4,
      }}>
        {sorted.map((m, i) => {
          const c = m.result === "W" ? "#10b981" : m.result === "D" ? "#94a3b8" : "#dc2626";
          return (
            <div key={i} style={{
              flex: 1,
              height: 14,
              borderRadius: 3,
              background: `${c}22`,
              color: c,
              fontSize: 9, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {m.result}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── MAIN ───
export default function PlayerStatsView({ player, accent = "#34d399", onBack }) {
  const matches = useMemo(() => getAllMatches(), []);
  const { stat } = useMemo(() => getPlayerStats(player.id, matches), [player.id, matches]);

  // ★ Player'a attributes garantisi (eski oyuncularda yoksa auto-fill)
  const enrichedPlayer = useMemo(() => ensurePlayerAttributes(player), [player]);

  // ★ Form gücü — son 5 maçtan
  const formScore = useMemo(() => computeForm(stat), [stat]);
  const recentResults = useMemo(
    () => (stat?.lastMatches || []).slice(0, 5).map((m) => m.result),
    [stat]
  );

  const goalTypeData = stat ? [
    { id: "normal",   label: "⚽", value: stat.goalsByType.normal,   color: "#fbbf24" },
    { id: "penalty",  label: "🎯", value: stat.goalsByType.penalty,  color: "#f87171" },
    { id: "freekick", label: "🦶", value: stat.goalsByType.freekick, color: "#a78bfa" },
    { id: "header",   label: "🤯", value: stat.goalsByType.header,   color: "#34d399" },
  ].filter((d) => d.value > 0) : [];

  const totalTypedGoals = goalTypeData.reduce((a, b) => a + b.value, 0);

  // Son 10 maç (form chart için)
  const last10 = stat?.lastMatches || [];

  return (
    <div style={{
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
      background: "linear-gradient(160deg,#070a0f,#0c1117 45%,#0a1628)",
      color: "#e2e8f0",
      position: "fixed", inset: 0,
      maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <style>{`
        @keyframes fifaCardIn {
          0% { transform: scale(0.85) rotateY(-15deg); opacity: 0; }
          60% { transform: scale(1.02) rotateY(2deg); opacity: 1; }
          100% { transform: scale(1) rotateY(0); opacity: 1; }
        }
        @keyframes cascadeInPS {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        padding: "10px 13px",
        paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(7,10,15,0.95)",
        backdropFilter: "blur(14px)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => { hapticLight(); onBack(); }}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8, padding: "6px 10px",
            color: "rgba(255,255,255,0.7)", cursor: "pointer",
            fontSize: 13, fontWeight: 700, fontFamily: "inherit",
          }}
        >‹</button>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{t("player_profile")}</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{
        flex: 1, overflow: "auto",
        padding: 13,
        paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
      }}>
        {/* FIFA CARD HERO */}
        <FifaCard player={player} accent={accent} />

        {/* No data state */}
        {!stat || stat.matches === 0 ? (
          <div style={{
            padding: "40px 20px", textAlign: "center",
            color: "rgba(255,255,255,0.35)",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📊</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "rgba(255,255,255,0.5)" }}>
              {t("ps_no_matches")}
            </div>
            <div style={{ fontSize: 12 }}>{t("stats_no_data_sub")}</div>
          </div>
        ) : (
          <>
            <div style={{ animation: "cascadeInPS 0.35s 0.1s both" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <BigStat label={t("ps_matches")}  value={stat.matches} icon="📅" color="#94a3b8" />
                <BigStat label={t("ps_goals")}    value={stat.goals}   icon="⚽" color="#fbbf24" />
                <BigStat label={t("ps_assists")}  value={stat.assists} icon="🎯" color="#60a5fa" />
                <BigStat label={t("ps_g_per_m")}  value={stat.goalsPerMatch.toFixed(2)} icon="📈" color="#34d399" />
              </div>
            </div>

            <div style={{
              padding: 12,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 12,
              marginBottom: 14,
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
              animation: "cascadeInPS 0.35s 0.18s both",
            }}>
              <SmallStat label={t("ps_win_rate")}     value={`${(stat.winRate * 100).toFixed(0)}%`} accent="#a78bfa" />
              <SmallStat label={t("ps_clean_sheets")} value={stat.cleanSheets} accent="#34d399" />
              <SmallStat label={t("ps_mvp")}          value={stat.mvpCount} accent="#fbbf24" />
            </div>

            {/* FORM CHART */}
            <div style={{ animation: "cascadeInPS 0.35s 0.25s both" }}>
              <FormChart matches={last10} accent={accent} />
            </div>

            {/* W/D/L RECORD */}
            <div style={{ marginBottom: 14, animation: "cascadeInPS 0.35s 0.3s both" }}>
              <div style={{
                fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
              }}>
                W / D / L
              </div>
              <div style={{
                display: "flex",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 11,
                overflow: "hidden",
                height: 38,
              }}>
                {stat.matches > 0 && (
                  <>
                    <div
                      style={{
                        flex: stat.wins,
                        background: "linear-gradient(135deg, #059669, #10b981)",
                        display: stat.wins > 0 ? "flex" : "none",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800, color: "#fff",
                      }}
                    >
                      {stat.wins}
                    </div>
                    <div
                      style={{
                        flex: stat.draws,
                        background: "rgba(255,255,255,0.06)",
                        display: stat.draws > 0 ? "flex" : "none",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      {stat.draws}
                    </div>
                    <div
                      style={{
                        flex: stat.losses,
                        background: "linear-gradient(135deg, #991b1b, #dc2626)",
                        display: stat.losses > 0 ? "flex" : "none",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800, color: "#fff",
                      }}
                    >
                      {stat.losses}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ★ FORM + SPIDER CHART — Goal Breakdown'dan önce */}
            <div style={{ marginBottom: 14, animation: "cascadeInPS 0.35s 0.28s both" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <FormBadge form={formScore} size="md" recentResults={recentResults} />
              </div>
              <div style={{
                padding: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 12,
              }}>
                <div style={{
                  fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, textAlign: "center",
                }}>
                  {t("attributes_title")}
                </div>
                <div style={{
                  fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500,
                  textAlign: "center", marginBottom: 6, lineHeight: 1.4,
                }}>
                  {t("form_explainer")}
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <SpiderChart
                    attributes={enrichedPlayer.attributes}
                    keys={getAttrKeys(enrichedPlayer.position)}
                    accent={accent}
                    size={260}
                  />
                </div>
              </div>
            </div>

            {/* GOAL BREAKDOWN */}
            {totalTypedGoals > 0 && (
              <div style={{ marginBottom: 14, animation: "cascadeInPS 0.35s 0.35s both" }}>
                <div style={{
                  fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
                }}>
                  {t("ps_goal_breakdown")}
                </div>
                <div style={{
                  padding: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 12,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  {goalTypeData.map((d) => {
                    const pct = (d.value / totalTypedGoals) * 100;
                    return (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16, width: 22 }}>{d.label}</span>
                        <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            width: `${pct}%`, height: "100%",
                            background: `linear-gradient(90deg, ${d.color}, ${d.color}cc)`,
                            borderRadius: 4,
                            transition: "width 0.6s ease-out",
                          }} />
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 800, color: d.color,
                          fontFamily: "'JetBrains Mono', monospace",
                          minWidth: 22, textAlign: "right",
                        }}>{d.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LAST 5 MATCHES */}
            {stat.lastMatches.length > 0 && (
              <div style={{ animation: "cascadeInPS 0.35s 0.4s both" }}>
                <div style={{
                  fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
                }}>
                  {t("ps_last_5")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {stat.lastMatches.map((m, idx) => {
                    const resultColor = m.result === "W" ? "#10b981" : m.result === "D" ? "#94a3b8" : "#dc2626";
                    const d = new Date(m.playedAt);
                    const dateStr = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
                    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                    return (
                      <div key={`${m.matchId}-${idx}`} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: 10,
                      }}>
                        <div style={{
                          width: 26, height: 26,
                          borderRadius: "50%",
                          background: `${resultColor}22`,
                          color: resultColor,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800,
                          flexShrink: 0,
                        }}>
                          {m.result === "W" ? t("result_win") : m.result === "D" ? t("result_draw") : t("result_loss")}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 700, color: "#e2e8f0",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            vs {m.opponent}
                          </div>
                          <div style={{
                            fontSize: 10, color: "rgba(255,255,255,0.4)",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {dateStr} · {timeStr}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                          {m.goals > 0 && (
                            <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                              ⚽ {m.goals}
                            </span>
                          )}
                          {m.assists > 0 && (
                            <span style={{ color: "#60a5fa", fontWeight: 700 }}>
                              🎯 {m.assists}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const BigStat = ({ label, value, icon, color }) => (
  <div style={{
    padding: "14px 12px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 12,
    textAlign: "center",
  }}>
    <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
    <div style={{
      fontSize: 26, fontWeight: 800, color,
      fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
    }}>{value}</div>
    <div style={{
      fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.5, marginTop: 5,
    }}>{label}</div>
  </div>
);

const SmallStat = ({ label, value, accent }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{
      fontSize: 18, fontWeight: 800, color: accent,
      fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
    }}>{value}</div>
    <div style={{
      fontSize: 8.5, color: "rgba(255,255,255,0.4)", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4,
    }}>{label}</div>
  </div>
);