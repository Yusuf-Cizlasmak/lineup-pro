// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Geçmiş Maçlar Ekranı
// 3 sekme: Genel Bakış · Krallıklar · Oyuncularım
// ─────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect } from "react";
import { t, tPos } from "./i18n";
import { hapticLight, hapticMedium, hapticWarning, hapticSelection } from "./haptics";
import {
  getAllMatches, deleteMatch, clearAllMatches,
  computeLeaderboards, getPlayerStats, summarizeMatch,
} from "./matchHistory";

// ─── Tarih formatla ───
const formatDate = (ts) => {
  const now = Date.now();
  const diffMs = now - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return t("history_today");
  if (diffMs < 2 * day) return t("history_yesterday");
  if (diffMs < 7 * day) return t("history_days_ago", { n: Math.floor(diffMs / day) });
  const d = new Date(ts);
  return d.toLocaleDateString();
};

const getInitials = (n, s) => {
  const name = (n || "").trim();
  const surname = (s || "").trim();
  if (name && surname) return `${name[0]}${surname[0]}`.toUpperCase();
  if (name) return name[0].toUpperCase();
  if (surname) return surname[0].toUpperCase();
  return "⚽";
};

// ─── Match Card (geçmiş listesinde) ───
const MatchCard = ({ match, onClick, onDelete }) => {
  const aWon = match.teamA.score > match.teamB.score;
  const bWon = match.teamB.score > match.teamA.score;
  const summary = summarizeMatch(match);

  return (
    <div
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 14,
        cursor: "pointer",
        transition: "transform 0.12s, background 0.18s",
        position: "relative",
        fontFamily: "inherit",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {/* Üst: tarih + sil */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 0.8,
        }}>
          {formatDate(match.playedAt)}{" "}
          {match.isMatch ? "" : `· ${t("single_lineup")}`}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            border: "none", background: "rgba(248,113,113,0.08)",
            color: "rgba(248,113,113,0.7)",
            borderRadius: 6, padding: "4px 8px",
            fontSize: 14, lineHeight: 1, cursor: "pointer", fontFamily: "inherit",
          }}
        >×</button>
      </div>

      {/* Skor */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Team A */}
        <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: aWon ? match.teamA.color.secondary : "rgba(255,255,255,0.7)",
            marginBottom: 4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            opacity: bWon ? 0.5 : 1,
          }}>
            {match.teamA.name}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px",
          background: "rgba(0,0,0,0.35)",
          borderRadius: 9,
          minWidth: 84, justifyContent: "center",
        }}>
          <span style={{
            fontSize: 22, fontWeight: 800, color: aWon ? match.teamA.color.secondary : "#fff",
            fontFamily: "'Bebas Neue',sans-serif",
            opacity: bWon ? 0.5 : 1,
          }}>{match.teamA.score}</span>
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 14 }}>–</span>
          <span style={{
            fontSize: 22, fontWeight: 800, color: bWon ? match.teamB.color.secondary : "#fff",
            fontFamily: "'Bebas Neue',sans-serif",
            opacity: aWon ? 0.5 : 1,
          }}>{match.teamB.score}</span>
        </div>
        {/* Team B */}
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: bWon ? match.teamB.color.secondary : "rgba(255,255,255,0.7)",
            marginBottom: 4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            opacity: aWon ? 0.5 : 1,
          }}>
            {match.teamB.name}
          </div>
        </div>
      </div>

      {/* Olay sayısı + MVP */}
      {(summary.eventsCount > 0 || match.mvpId) && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "flex", gap: 12,
          fontSize: 10.5, color: "rgba(255,255,255,0.45)", fontWeight: 600,
        }}>
          {summary.eventsCount > 0 && <span>⚽ {summary.eventsCount}</span>}
          {match.mvpId && (() => {
            const mvp = match.playerSnapshots?.[match.mvpId];
            return mvp ? <span>⭐ {mvp.name} {mvp.surname}</span> : null;
          })()}
        </div>
      )}
    </div>
  );
};

// ─── Leaderboard Row ───
const LeaderRow = ({ index, info, primaryStat, secondaryStat, primaryLabel, accent }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 11,
    padding: "11px 13px",
    background: index === 0 ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${index === 0 ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.05)"}`,
    borderRadius: 11,
  }}>
    <div style={{
      width: 28, height: 28,
      borderRadius: "50%",
      background: index === 0 ? "#fbbf24" : index === 1 ? "rgba(203,213,225,0.8)" : index === 2 ? "rgba(202,138,4,0.8)" : "rgba(255,255,255,0.08)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: index <= 2 ? "#0a1628" : "rgba(255,255,255,0.6)",
      fontSize: 12, fontWeight: 800,
      fontFamily: "'JetBrains Mono',monospace",
      flexShrink: 0,
    }}>
      {index + 1}
    </div>
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: `linear-gradient(135deg, ${accent}, ${accent}aa)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#0a1628", fontWeight: 800, fontSize: 12,
      flexShrink: 0,
    }}>
      {info.jerseyNumber || getInitials(info.name, info.surname)}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 13, color: "#e2e8f0", fontWeight: 700,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {info.name} {info.surname}
      </div>
      {secondaryStat && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
          {secondaryStat}
        </div>
      )}
    </div>
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div style={{
        fontSize: 18, fontWeight: 800, color: accent,
        fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1,
      }}>
        {primaryStat}
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {primaryLabel}
      </div>
    </div>
  </div>
);

// ─── MAIN ───
export default function MatchHistoryView({ teamA, teamB, onBack, onOpenPlayerStats }) {
  const [tab, setTab] = useState("overview"); // overview | leaderboards | players
  const [matches, setMatches] = useState(() => getAllMatches());
  const [selectedMatch, setSelectedMatch] = useState(null);

  // Cross-tab + delete sonrası refresh
  useEffect(() => {
    const refresh = () => setMatches(getAllMatches());
    window.addEventListener("halisaha:history-updated", refresh);
    return () => window.removeEventListener("halisaha:history-updated", refresh);
  }, []);

  const leaderboards = useMemo(() => computeLeaderboards(matches, [teamA, teamB]), [matches, teamA, teamB]);

  const totalGoals = useMemo(() => {
    let total = 0;
    matches.forEach((m) => total += m.teamA.score + m.teamB.score);
    return total;
  }, [matches]);

  const totalAssists = useMemo(() => {
    return Object.values(leaderboards.allStats).reduce((a, s) => a + s.assists, 0);
  }, [leaderboards]);

  // Oyuncularım — şu anki kayıtlı oyuncular + istatistik
  const myPlayers = useMemo(() => {
    const all = [
      ...(teamA?.players || []).map((p) => ({ ...p, side: "A" })),
      ...(teamB?.players || []).map((p) => ({ ...p, side: "B" })),
    ];
    return all.map((p) => ({
      player: p,
      stat: leaderboards.allStats[p.id] || null,
    }));
  }, [teamA, teamB, leaderboards]);

  if (selectedMatch) {
    return (
      <MatchDetailView
        match={selectedMatch}
        onBack={() => setSelectedMatch(null)}
        onDelete={() => {
          if (window.confirm(t("history_delete_confirm"))) {
            hapticWarning();
            deleteMatch(selectedMatch.id);
            setSelectedMatch(null);
          }
        }}
      />
    );
  }

  return (
    <div style={{
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
      background: "linear-gradient(160deg,#070a0f,#0c1117 45%,#0a1628)",
      color: "#e2e8f0",
      position: "fixed", inset: 0,
      maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* HEADER */}
      <div style={{
        padding: "10px 13px",
        paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(7,10,15,0.95)",
        backdropFilter: "blur(14px)",
        flexShrink: 0, zIndex: 50,
      }}>
        <button
          onClick={() => { hapticLight(); onBack(); }}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8, padding: "6px 10px",
            color: "rgba(255,255,255,0.7)", cursor: "pointer",
            fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          ‹
        </button>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          📚 {t("history_title")}
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* TAB BAR */}
      <div style={{
        display: "flex", gap: 4,
        padding: "10px 13px 0",
        flexShrink: 0,
      }}>
        {[
          { id: "overview", label: t("stats_overview") },
          { id: "leaderboards", label: t("stats_leaderboards") },
          { id: "players", label: t("stats_my_players") },
        ].map((it) => (
          <button
            key={it.id}
            onClick={() => { hapticSelection(); setTab(it.id); }}
            style={{
              flex: 1,
              padding: "9px 6px",
              borderRadius: 9,
              border: "none",
              background: tab === it.id ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
              color: tab === it.id ? "#34d399" : "rgba(255,255,255,0.45)",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              letterSpacing: 0.3,
            }}
          >
            {it.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{
        flex: 1, overflow: "auto",
        paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
      }}>
        {tab === "overview" && (
          <div style={{ padding: 13 }}>
            {matches.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  <StatCard icon="📅" value={matches.length} label={t("stats_total_matches")} />
                  <StatCard icon="⚽" value={totalGoals} label={t("stats_total_goals")} />
                  <StatCard icon="🎯" value={totalAssists} label={t("stats_total_assists")} />
                </div>

                {/* Maç listesi */}
                <div style={{
                  fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
                }}>
                  {t("history_match_count", { n: matches.length })}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {matches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      onClick={() => { hapticLight(); setSelectedMatch(m); }}
                      onDelete={() => {
                        if (window.confirm(t("history_delete_confirm"))) {
                          hapticWarning();
                          deleteMatch(m.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "leaderboards" && (
          <div style={{ padding: 13 }}>
            {matches.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <LeaderboardSection
                  title={t("lb_top_scorers")}
                  entries={leaderboards.topScorers}
                  primaryKey="goals"
                  primaryLabel={t("ps_goals")}
                  accent="#fbbf24"
                  formatSecondary={(s) => `${t("ps_matches")}: ${s.matches} · ${t("ps_g_per_m")}: ${s.goalsPerMatch.toFixed(1)}`}
                />
                <LeaderboardSection
                  title={t("lb_top_assisters")}
                  entries={leaderboards.topAssisters}
                  primaryKey="assists"
                  primaryLabel={t("ps_assists")}
                  accent="#60a5fa"
                  formatSecondary={(s) => `${t("ps_matches")}: ${s.matches}`}
                />
                <LeaderboardSection
                  title={t("lb_top_keepers")}
                  entries={leaderboards.topGoalkeepers}
                  primaryKey="cleanSheets"
                  primaryLabel={t("ps_clean_sheets")}
                  accent="#34d399"
                  formatSecondary={(s) => `${t("ps_matches")}: ${s.matches}`}
                />
                <LeaderboardSection
                  title={t("lb_most_wins")}
                  entries={leaderboards.mostWins}
                  primaryKey="wins"
                  primaryLabel={t("ps_matches")}
                  accent="#a78bfa"
                  formatSecondary={(s) => `${t("ps_win_rate")}: ${(s.winRate * 100).toFixed(0)}%`}
                />
                {leaderboards.mvps.length > 0 && (
                  <LeaderboardSection
                    title={t("lb_mvps")}
                    entries={leaderboards.mvps}
                    primaryKey="mvpCount"
                    primaryLabel={t("ps_mvp")}
                    accent="#f87171"
                    formatSecondary={(s) => `${t("ps_matches")}: ${s.matches}`}
                  />
                )}
              </>
            )}
          </div>
        )}

        {tab === "players" && (
          <div style={{ padding: 13 }}>
            {myPlayers.length === 0 ? (
              <EmptyState message={t("ps_no_matches")} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {myPlayers.map(({ player, stat }) => (
                  <button
                    key={player.id}
                    onClick={() => { hapticLight(); onOpenPlayerStats?.(player); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 11,
                      cursor: "pointer", fontFamily: "inherit",
                      width: "100%", textAlign: "left",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 9,
                      background: `linear-gradient(135deg, ${player.side === "A" ? (teamA?.color?.secondary || "#34d399") : (teamB?.color?.secondary || "#f87171")}, ${player.side === "A" ? (teamA?.color?.primary || "#059669") : (teamB?.color?.primary || "#dc2626")})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#0a1628", fontWeight: 800, fontSize: 13,
                      flexShrink: 0,
                    }}>
                      {player.jerseyNumber || getInitials(player.name, player.surname)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: "#e2e8f0",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {player.name} {player.surname}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                        {tPos(player.position)}
                      </div>
                    </div>
                    {stat ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <MiniStat label={t("ps_matches")} value={stat.matches} />
                        <MiniStat label={t("ps_goals")} value={stat.goals} accent="#fbbf24" />
                        <MiniStat label={t("ps_assists")} value={stat.assists} accent="#60a5fa" />
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>—</div>
                    )}
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 18, marginLeft: 4 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ───
const EmptyState = ({ message }) => (
  <div style={{
    padding: "40px 20px", textAlign: "center",
    color: "rgba(255,255,255,0.35)",
  }}>
    <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📚</div>
    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "rgba(255,255,255,0.5)" }}>
      {message || t("stats_no_data")}
    </div>
    <div style={{ fontSize: 12 }}>{t("stats_no_data_sub")}</div>
  </div>
);

// ─── Stat Card ───
const StatCard = ({ icon, value, label }) => (
  <div style={{
    padding: "12px 8px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 11,
    textAlign: "center",
  }}>
    <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
    <div style={{
      fontSize: 22, fontWeight: 800, color: "#fff",
      fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
    }}>{value}</div>
    <div style={{
      fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4,
    }}>{label}</div>
  </div>
);

const MiniStat = ({ label, value, accent = "rgba(255,255,255,0.7)" }) => (
  <div style={{ textAlign: "center", minWidth: 26 }}>
    <div style={{
      fontSize: 14, fontWeight: 800, color: accent,
      fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
    }}>{value}</div>
    <div style={{
      fontSize: 7.5, color: "rgba(255,255,255,0.35)", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1,
    }}>{label}</div>
  </div>
);

// ─── Leaderboard Section ───
const LeaderboardSection = ({ title, entries, primaryKey, primaryLabel, accent, formatSecondary }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{
      fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 10,
      letterSpacing: 0.3,
    }}>
      {title}
    </div>
    {entries.length === 0 ? (
      <div style={{
        padding: "14px 12px", textAlign: "center",
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(255,255,255,0.06)",
        borderRadius: 10,
        color: "rgba(255,255,255,0.3)", fontSize: 11.5,
      }}>
        {t("lb_no_entries")}
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.slice(0, 5).map((e, idx) => (
          <LeaderRow
            key={e.playerId}
            index={idx}
            info={e.info}
            primaryStat={e[primaryKey]}
            primaryLabel={primaryLabel}
            secondaryStat={formatSecondary?.(e)}
            accent={accent}
          />
        ))}
      </div>
    )}
  </div>
);

// ═══════════════════════════════════════════════════
// MATCH DETAIL VIEW
// ═══════════════════════════════════════════════════
const MatchDetailView = ({ match, onBack, onDelete }) => {
  const events = match.events || [];
  const acA = match.teamA.color.secondary;
  const acB = match.teamB.color.secondary;

  const goalTypeIcon = (gt) => {
    const map = { normal: "⚽", penalty: "🎯", freekick: "🦶", header: "🤯", own_goal: "😅" };
    return map[gt] || "⚽";
  };

  return (
    <div style={{
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
      background: "linear-gradient(160deg,#070a0f,#0c1117 45%,#0a1628)",
      color: "#e2e8f0",
      position: "fixed", inset: 0,
      maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
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
        <div style={{ fontSize: 14, fontWeight: 700 }}>{t("match_detail")}</div>
        <button
          onClick={onDelete}
          style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 8, padding: "6px 10px",
            color: "#f87171", cursor: "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit",
          }}
        >🗑</button>
      </div>

      <div style={{
        flex: 1, overflow: "auto",
        padding: 13,
        paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
      }}>
        {/* Score */}
        <div style={{
          background: "rgba(20,22,30,0.98)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          padding: "20px 14px",
          marginBottom: 14,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(90deg,${acA}18,transparent 42%,transparent 58%,${acB}18)`,
            pointerEvents: "none",
          }} />
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center",
            marginBottom: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
          }}>
            {formatDate(match.playedAt)} · {new Date(match.playedAt).toLocaleTimeString().slice(0, 5)}
          </div>
          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: acA, marginBottom: 8,
                fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.2,
              }}>
                {match.teamA.name}
              </div>
              <div style={{
                fontSize: 56, fontWeight: 800, color: "#fff",
                fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1,
                textShadow: `0 0 24px ${acA}55`,
              }}>{match.teamA.score}</div>
            </div>
            <div style={{ padding: "0 6px", color: "rgba(255,255,255,0.25)", fontSize: 24, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>–</div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: acB, marginBottom: 8,
                fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.2,
              }}>
                {match.teamB.name}
              </div>
              <div style={{
                fontSize: 56, fontWeight: 800, color: "#fff",
                fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1,
                textShadow: `0 0 24px ${acB}55`,
              }}>{match.teamB.score}</div>
            </div>
          </div>
        </div>

        {/* MVP */}
        {match.mvpId && (() => {
          const mvp = match.playerSnapshots?.[match.mvpId];
          if (!mvp) return null;
          return (
            <div style={{
              padding: "12px 14px",
              background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))",
              border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: 12,
              display: "flex", alignItems: "center", gap: 10,
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 24 }}>⭐</div>
              <div>
                <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" }}>
                  {t("mvp_select")}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>
                  {mvp.name} {mvp.surname}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Timeline */}
        <div style={{
          fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
        }}>
          {t("match_timeline")}
        </div>
        {events.length === 0 ? (
          <div style={{
            padding: "20px 14px", textAlign: "center",
            color: "rgba(255,255,255,0.3)", fontSize: 12,
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.06)",
            borderRadius: 10,
          }}>
            {t("match_no_events")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {events.map((e) => {
              const isA = e.side === "A";
              const accent = isA ? acA : acB;
              const scorer = match.playerSnapshots?.[e.playerId];
              const assister = e.assistPlayerId ? match.playerSnapshots?.[e.assistPlayerId] : null;
              const isOG = e.type === "own_goal";
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderRadius: 10,
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{goalTypeIcon(e.goalType)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: "#e2e8f0",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {scorer ? `${scorer.name} ${scorer.surname}` : "—"}{isOG ? " (KK)" : ""}
                    </div>
                    {assister && (
                      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)" }}>
                        🅰️ {assister.name} {assister.surname}
                      </div>
                    )}
                  </div>
                  {e.minute != null && (
                    <span style={{
                      fontSize: 12, color: accent, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>{e.minute}'</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};