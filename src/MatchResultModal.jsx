// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Maç Sonucu Modalı (TAP-TO-SCORE)
// Form doldurmak yerine sahadaki oyuncu kartlarına dokunarak gol ekleme.
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useMemo, useEffect } from "react";
import { t, tPos } from "./i18n";
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess, hapticSelection } from "./haptics";
import { saveMatch, buildMatch, newEvent } from "./matchHistory";
import { showInterstitial } from "./admob";

// captureAndShare ana dosyada tanımlı; prop ile alıyoruz.
const getInitials = (n, s) => {
  const name = (n || "").trim();
  const surname = (s || "").trim();
  if (name && surname) return `${name[0]}${surname[0]}`.toUpperCase();
  if (name) return name[0].toUpperCase();
  if (surname) return surname[0].toUpperCase();
  return "⚽";
};

const GOAL_TYPES = [
  { id: "normal",   icon: "⚽", labelKey: "goal_type_normal" },
  { id: "penalty",  icon: "🎯", labelKey: "goal_type_penalty" },
  { id: "freekick", icon: "🦶", labelKey: "goal_type_freekick" },
  { id: "header",   icon: "🤯", labelKey: "goal_type_header" },
  { id: "own_goal", icon: "😅", labelKey: "goal_type_own_goal" },
];

// Konfeti — basit canvas tabanlı, performanslı
const Confetti = ({ trigger, color = "#fbbf24" }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!trigger || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = canvas.offsetWidth * 2;
    const H = canvas.height = canvas.offsetHeight * 2;
    const colors = [color, "#fff", "#fbbf24", "#34d399", "#60a5fa"];
    const N = 60;
    const particles = Array.from({ length: N }, () => ({
      x: W / 2,
      y: H / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      g: 0.45,
      size: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    }));
    let frame;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g;
        p.rot += p.vrot;
        p.life -= 0.012;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        ctx.restore();
        if (p.y < H + 40 && p.life > 0) alive++;
      }
      if (alive > 0) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [trigger, color]);

  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed", inset: 0,
        width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 1500,
      }}
    />
  );
};

// Mini player chip — tap to select
const PlayerChip = ({ player, accentColor, onClick, selected, disabled, badge }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 11px 8px 8px",
        background: selected ? `${accentColor}28` : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${selected ? accentColor : "rgba(255,255,255,0.08)"}`,
        borderRadius: 11,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        minWidth: 0, flex: "1 1 auto",
        textAlign: "left",
        transition: "transform 0.12s, background 0.18s",
        transform: selected ? "scale(1.02)" : "scale(1)",
        fontFamily: "inherit",
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => !disabled && (e.currentTarget.style.transform = selected ? "scale(1.02)" : "scale(1)")}
      onMouseLeave={(e) => !disabled && (e.currentTarget.style.transform = selected ? "scale(1.02)" : "scale(1)")}
    >
      {/* Forma + numara */}
      <div style={{
        position: "relative",
        width: 30, height: 30, flexShrink: 0,
        borderRadius: 8,
        background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#0a1628", fontWeight: 800, fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        boxShadow: selected ? `0 4px 12px ${accentColor}66` : "none",
      }}>
        {player.jerseyNumber || getInitials(player.name, player.surname)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#e2e8f0",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {player.name} {player.surname}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: 0.3 }}>
          {tPos(player.position)}
        </div>
      </div>
      {badge != null && badge > 0 && (
        <div style={{
          background: accentColor, color: "#0a1628",
          borderRadius: 8, padding: "2px 6px",
          fontSize: 10, fontWeight: 800,
          minWidth: 18, textAlign: "center",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {badge}
        </div>
      )}
    </button>
  );
};

// Score control
const ScoreControl = ({ value, onChange, color, name, isHome }) => (
  <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
    <div style={{
      fontSize: 10, fontWeight: 700, color, textTransform: "uppercase",
      fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.2,
      marginBottom: 8,
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      padding: "0 4px",
    }}>
      {name}
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <button
        onClick={() => { hapticLight(); onChange(Math.max(0, value - 1)); }}
        style={{
          width: 30, height: 30, borderRadius: "50%",
          border: `1px solid ${color}44`, background: `${color}14`,
          color, fontSize: 18, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >−</button>
      <span style={{
        fontSize: 56, fontWeight: 800, color: "#fff",
        fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1,
        minWidth: 44, textAlign: "center",
        textShadow: `0 0 24px ${color}55`,
      }}>{value}</span>
      <button
        onClick={() => { hapticMedium(); onChange(value + 1); }}
        style={{
          width: 30, height: 30, borderRadius: "50%",
          border: `1px solid ${color}44`, background: `${color}14`,
          color, fontSize: 18, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >+</button>
    </div>
  </div>
);

// Mini event row — kayıtlı bir olayı göster
const EventRow = ({ event, accent, scorerInfo, assistInfo, onDelete }) => {
  const goalType = GOAL_TYPES.find((g) => g.id === event.goalType) || GOAL_TYPES[0];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 10px",
      background: "rgba(255,255,255,0.03)",
      borderRadius: 9,
      borderLeft: `3px solid ${accent}`,
    }}>
      <span style={{ fontSize: 16 }}>{goalType.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, color: "#e2e8f0", fontWeight: 700,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {scorerInfo}
        </div>
        {assistInfo && (
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            🅰️ {assistInfo}
          </div>
        )}
      </div>
      {event.minute != null && (
        <span style={{
          fontSize: 11, color: "rgba(255,255,255,0.4)",
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
        }}>{event.minute}'</span>
      )}
      <button
        onClick={onDelete}
        style={{
          padding: 3, border: "none", background: "none",
          color: "rgba(248,113,113,0.7)", cursor: "pointer",
          fontSize: 18, lineHeight: 1, flexShrink: 0,
        }}
      >×</button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════
export default function MatchResultModal({
  open, onClose, teamA, teamB, isMatch,
  captureAndShare, // ana dosyadan geçiyor (DOM dependency)
  toast,           // toast fonksiyonu
}) {
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [events, setEvents] = useState([]);
  const [pickerSide, setPickerSide] = useState(null); // null | "A" | "B"
  const [draftScorer, setDraftScorer] = useState(null);
  const [draftGoalType, setDraftGoalType] = useState("normal");
  const [draftMinute, setDraftMinute] = useState("");
  const [draftAssist, setDraftAssist] = useState(null);
  const [step, setStep] = useState("scorer"); // scorer | assist | confirm
  const [confettiTick, setConfettiTick] = useState(0);
  const [confettiColor, setConfettiColor] = useState("#fbbf24");
  const [showMvp, setShowMvp] = useState(false);
  const [mvpId, setMvpId] = useState(null);
  const [saved, setSaved] = useState(false);
  const scoreRef = useRef(null);

  const acA = teamA.color.secondary;
  const acB = teamB.color.secondary;

  // Modal her açıldığında temiz başla
  useEffect(() => {
    if (open) {
      setScoreA(0); setScoreB(0);
      setEvents([]);
      setPickerSide(null);
      setDraftScorer(null); setDraftAssist(null);
      setDraftGoalType("normal"); setDraftMinute("");
      setStep("scorer");
      setShowMvp(false);
      setMvpId(null);
      setSaved(false);
    }
  }, [open]);

  // Skor değişimi — events ile senkron için tek yön: skor öncelikli
  // (kullanıcı skoru elle artırırsa events boş kalır → manuel skor artışı)
  // Goller eklendikçe skor otomatik artar (aşağıda addEvent)

  // Bir takım için "gol başına" sayım (rozet için)
  const goalsByPlayer = useMemo(() => {
    const map = {};
    for (const e of events) {
      if (e.type === "goal" && e.playerId) {
        map[e.playerId] = (map[e.playerId] || 0) + 1;
      }
    }
    return map;
  }, [events]);

  const assistsByPlayer = useMemo(() => {
    const map = {};
    for (const e of events) {
      if (e.assistPlayerId) map[e.assistPlayerId] = (map[e.assistPlayerId] || 0) + 1;
    }
    return map;
  }, [events]);

  const winner = scoreA > scoreB ? teamA.name : scoreB > scoreA ? teamB.name : null;

  // Picker'ı aç
  const openPicker = (side) => {
    if (saved) return;
    hapticSelection();
    setPickerSide(side);
    setStep("scorer");
    setDraftScorer(null);
    setDraftAssist(null);
    setDraftGoalType("normal");
    setDraftMinute("");
  };

  const closePicker = () => {
    setPickerSide(null);
    setDraftScorer(null);
    setDraftAssist(null);
    setStep("scorer");
  };

  // Gol atan seçildi
  const handleScorerPick = (player) => {
    hapticMedium();
    setDraftScorer(player);
    // Aynı takımın oyuncuları varsa asist adımına geç, yoksa direkt confirm
    const sideTeam = pickerSide === "A" ? teamA : teamB;
    const others = sideTeam.players.filter((p) => p.id !== player.id);
    if (others.length === 0) {
      setStep("confirm");
    } else {
      setStep("assist");
    }
  };

  // Asistçi seçildi (veya skip)
  const handleAssistPick = (player) => {
    hapticLight();
    setDraftAssist(player);
    setStep("confirm");
  };

  const handleAssistSkip = () => {
    hapticLight();
    setDraftAssist(null);
    setStep("confirm");
  };

  // Olayı kaydet
  const commitEvent = () => {
    if (!draftScorer || !pickerSide) return;
    const isOwnGoal = draftGoalType === "own_goal";
    const ev = newEvent({
      type: isOwnGoal ? "own_goal" : "goal",
      side: pickerSide,
      playerId: draftScorer.id,
      assistPlayerId: isOwnGoal ? null : (draftAssist?.id || null),
      minute: draftMinute ? Math.max(1, Math.min(120, parseInt(draftMinute, 10))) : null,
      goalType: draftGoalType,
    });

    // Kendi kalesi: gol KARŞI takıma gider, oyuncu kayıtta kalır
    const scoreSide = isOwnGoal ? (pickerSide === "A" ? "B" : "A") : pickerSide;

    setEvents((arr) => {
      const next = [...arr, ev];
      // Dakikaya göre sırala (dakikası olmayanlar sona)
      next.sort((a, b) => {
        if (a.minute == null && b.minute == null) return a.createdAt - b.createdAt;
        if (a.minute == null) return 1;
        if (b.minute == null) return -1;
        return a.minute - b.minute;
      });
      return next;
    });

    if (scoreSide === "A") setScoreA((s) => s + 1);
    else setScoreB((s) => s + 1);

    // Konfeti + haptic
    const accent = scoreSide === "A" ? acA : acB;
    setConfettiColor(accent);
    setConfettiTick((x) => x + 1);
    hapticHeavy();

    // Hat-trick kontrolü
    const newCount = (goalsByPlayer[draftScorer.id] || 0) + (isOwnGoal ? 0 : 1);
    if (newCount === 3 && !isOwnGoal) {
      setTimeout(() => toast?.(t("hat_trick")), 400);
    } else if (draftAssist && !isOwnGoal) {
      setTimeout(() => toast?.(t("assist_added")), 200);
    } else {
      setTimeout(() => toast?.(t("goal_added")), 200);
    }

    closePicker();
  };

  const deleteEvent = (eventId) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    hapticLight();
    setEvents((arr) => arr.filter((e) => e.id !== eventId));
    // Skoru da geri al
    const isOwnGoal = ev.type === "own_goal";
    const scoreSide = isOwnGoal ? (ev.side === "A" ? "B" : "A") : ev.side;
    if (ev.type === "goal" || ev.type === "own_goal") {
      if (scoreSide === "A") setScoreA((s) => Math.max(0, s - 1));
      else setScoreB((s) => Math.max(0, s - 1));
    }
    toast?.(t("t_event_deleted"));
  };

  // MVP otomatik öneri: en çok gol+asist katkısı
  const mvpSuggestion = useMemo(() => {
    const scores = {};
    for (const e of events) {
      if (e.type === "goal" && e.playerId) {
        scores[e.playerId] = (scores[e.playerId] || 0) + 2;
        if (e.assistPlayerId) scores[e.assistPlayerId] = (scores[e.assistPlayerId] || 0) + 1;
      }
    }
    let best = null, bestScore = 0;
    Object.entries(scores).forEach(([pid, sc]) => {
      if (sc > bestScore) { bestScore = sc; best = pid; }
    });
    return best;
  }, [events]);

  // Kaydet
  const handleSave = (alsoShare) => {
    if (saved) return;
    if (scoreA === 0 && scoreB === 0 && events.length === 0) {
      toast?.(t("match_no_score"));
      return;
    }
    hapticSuccess();
    const match = buildMatch({
      teamA, teamB, scoreA, scoreB, events,
      isMatch: !!isMatch, mvpId,
    });
    saveMatch(match);
    setSaved(true);
    toast?.(t("match_saved"));

    if (alsoShare && scoreRef.current && captureAndShare) {
      // Paylaşım
      setTimeout(async () => {
        await captureAndShare(scoreRef.current, "mac-sonucu.png");
        setTimeout(() => { showInterstitial(); }, 500);
      }, 250);
    } else {
      setTimeout(() => { showInterstitial(); }, 500);
    }
  };

  if (!open) return null;

  // Picker'da hangi takımın oyuncuları gösterilecek
  // Kendi kalesi seçildiyse: sahibi farklı takım olur
  const pickerTeam = pickerSide === "A" ? teamA : pickerSide === "B" ? teamB : null;
  const pickerAccent = pickerSide === "A" ? acA : acB;

  // Asist için: aynı takımdan, gol atan dışındaki oyuncular
  const assistCandidates = pickerTeam && draftScorer
    ? pickerTeam.players.filter((p) => p.id !== draftScorer.id)
    : [];

  // Tüm oyuncuların düz listesi (MVP için)
  const allPlayers = [
    ...teamA.players.map((p) => ({ ...p, side: "A" })),
    ...(isMatch ? teamB.players.map((p) => ({ ...p, side: "B" })) : []),
  ];

  return (
    <>
      {confettiTick > 0 && <Confetti trigger={confettiTick} color={confettiColor} key={confettiTick} />}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1100,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#0e1117",
            borderRadius: "22px 22px 0 0",
            border: "1px solid rgba(255,255,255,0.08)",
            width: "100%", maxWidth: 480, maxHeight: "94vh",
            overflow: "auto",
            paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
            animation: "slideUpModal 0.28s cubic-bezier(.4,0,.2,1)",
          }}
        >
          <style>{`
            @keyframes slideUpModal { from { transform: translateY(100%) } to { transform: translateY(0) } }
            @keyframes pulse2 { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.06); opacity: 0.85 } }
            @keyframes goalPop { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
          `}</style>

          {/* Drag handle */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.14)" }} />
          </div>

          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 20px 10px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              color: "#e2e8f0", fontSize: 16, fontWeight: 700,
            }}>
              🏆 {t("match_result")}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6, padding: 5, cursor: "pointer",
                color: "rgba(255,255,255,0.5)",
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, lineHeight: 1,
              }}
            >×</button>
          </div>

          {/* SCREENSHOT TARGET */}
          <div ref={scoreRef} style={{
            padding: "0 18px 20px",
            display: "flex", flexDirection: "column", gap: 16,
            background: "#0e1117",
          }}>
            {/* SCORE BOARD */}
            <div style={{
              position: "relative", borderRadius: 18, overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.07)",
              padding: "20px 12px",
              background: "rgba(20,22,30,0.98)",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: `linear-gradient(90deg,${acA}18,transparent 42%,transparent 58%,${acB}18)`,
                pointerEvents: "none",
              }} />
              <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                <ScoreControl value={scoreA} onChange={setScoreA} color={acA} name={teamA.name} isHome />
                <div style={{ padding: "0 6px" }}>
                  <div style={{
                    fontSize: 12, color: "rgba(255,255,255,0.18)", fontWeight: 800,
                    fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2,
                  }}>–</div>
                </div>
                {isMatch ? (
                  <ScoreControl value={scoreB} onChange={setScoreB} color={acB} name={teamB.name} />
                ) : (
                  <div style={{ flex: 1, textAlign: "center", color: "rgba(255,255,255,0.18)", fontSize: 12 }}>
                    —
                  </div>
                )}
              </div>
              {(scoreA > 0 || scoreB > 0) && (
                <div style={{
                  textAlign: "center", marginTop: 12,
                  fontSize: 13, fontWeight: 700,
                  color: winner ? "#fbbf24" : "rgba(255,255,255,0.45)",
                  letterSpacing: 0.3,
                }}>
                  {winner ? t("winner", { name: winner }) : (scoreA === scoreB && (scoreA > 0)) ? t("draw") : ""}
                </div>
              )}
            </div>

            {/* TAP-TO-SCORE: Takım oyuncu listeleri */}
            {isMatch ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{
                  fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700,
                  letterSpacing: 1, textTransform: "uppercase", textAlign: "center",
                }}>
                  {t("tap_to_score")}
                </div>
                <TeamScorerStrip
                  team={teamA} accent={acA} side="A"
                  onPlayerTap={() => openPicker("A")}
                  goalsByPlayer={goalsByPlayer}
                  assistsByPlayer={assistsByPlayer}
                />
                <TeamScorerStrip
                  team={teamB} accent={acB} side="B"
                  onPlayerTap={() => openPicker("B")}
                  goalsByPlayer={goalsByPlayer}
                  assistsByPlayer={assistsByPlayer}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{
                  fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700,
                  letterSpacing: 1, textTransform: "uppercase", textAlign: "center",
                }}>
                  {t("tap_to_score")}
                </div>
                <TeamScorerStrip
                  team={teamA} accent={acA} side="A"
                  onPlayerTap={() => openPicker("A")}
                  goalsByPlayer={goalsByPlayer}
                  assistsByPlayer={assistsByPlayer}
                />
              </div>
            )}

            {/* EVENT LOG */}
            <div>
              <div style={{
                fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 9,
              }}>
                {t("match_event_log")}
              </div>
              {events.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "16px 12px",
                  color: "rgba(255,255,255,0.25)", fontSize: 12,
                  background: "rgba(255,255,255,0.02)", borderRadius: 10,
                  border: "1px dashed rgba(255,255,255,0.06)",
                }}>
                  {t("no_events_yet")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {events.map((e) => {
                    const sideTeam = e.side === "A" ? teamA : teamB;
                    const scorer = sideTeam.players.find((p) => p.id === e.playerId);
                    const otherTeam = e.side === "A" ? teamA : teamB;
                    const assister = e.assistPlayerId
                      ? otherTeam.players.find((p) => p.id === e.assistPlayerId)
                      : null;
                    const accent = e.side === "A" ? acA : acB;
                    const isOG = e.type === "own_goal";
                    const scorerName = scorer
                      ? `${scorer.name} ${scorer.surname}${isOG ? " (KK)" : ""}`
                      : "?";
                    const assistName = assister ? `${assister.name} ${assister.surname}` : null;
                    return (
                      <EventRow
                        key={e.id}
                        event={e}
                        accent={accent}
                        scorerInfo={scorerName}
                        assistInfo={assistName}
                        onDelete={() => deleteEvent(e.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* MVP toggle (sadece events varsa) */}
            {events.length > 0 && !saved && (
              <button
                onClick={() => { hapticSelection(); setShowMvp((v) => !v); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px",
                  background: mvpId ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${mvpId ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 11, cursor: "pointer", width: "100%",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 18 }}>⭐</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: mvpId ? "#fbbf24" : "#e2e8f0" }}>
                    {t("mvp_select")}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {mvpId ? (() => {
                      const mvp = allPlayers.find((p) => p.id === mvpId);
                      return mvp ? `${mvp.name} ${mvp.surname}` : "—";
                    })() : (mvpSuggestion ? `${t("mvp_suggest")}: ${(() => {
                      const ms = allPlayers.find((p) => p.id === mvpSuggestion);
                      return ms ? `${ms.name} ${ms.surname}` : "—";
                    })()}` : t("mvp_skip"))}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: "rgba(255,255,255,0.3)", transform: showMvp ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
              </button>
            )}

            {showMvp && events.length > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 11, padding: 10,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {allPlayers.map((p) => (
                    <PlayerChip
                      key={p.id}
                      player={p}
                      accentColor={p.side === "A" ? acA : acB}
                      selected={mvpId === p.id}
                      onClick={() => {
                        hapticMedium();
                        setMvpId((cur) => cur === p.id ? null : p.id);
                        toast?.(t("mvp_set"));
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          {!saved && (
            <div style={{ padding: "0 18px 4px", display: "flex", gap: 8 }}>
              <button
                onClick={() => handleSave(false)}
                style={{
                  flex: 1,
                  padding: "13px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e2e8f0",
                  fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                💾 {t("match_save_only")}
              </button>
              <button
                onClick={() => handleSave(true)}
                style={{
                  flex: 1.4,
                  padding: "13px",
                  borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                  color: "#fff",
                  fontSize: 13, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: 0.3,
                  boxShadow: "0 8px 28px rgba(124,58,237,0.38)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                📤 {t("match_save_share")}
              </button>
            </div>
          )}

          {saved && (
            <div style={{ padding: "0 18px" }}>
              <div style={{
                padding: "13px",
                borderRadius: 12,
                background: "linear-gradient(135deg,rgba(5,150,105,0.18),rgba(16,185,129,0.18))",
                border: "1px solid rgba(52,211,153,0.3)",
                color: "#34d399",
                fontSize: 13, fontWeight: 700,
                textAlign: "center",
              }}>
                ✓ {t("match_saved")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PICKER OVERLAY — ikinci modal */}
      {pickerSide && pickerTeam && (
        <div
          onClick={closePicker}
          style={{
            position: "fixed", inset: 0, zIndex: 1200,
            background: "rgba(0,0,0,0.86)", backdropFilter: "blur(12px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            animation: "fadeIn 0.2s",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0e1117",
              borderRadius: "22px 22px 0 0",
              border: "1px solid rgba(255,255,255,0.08)",
              width: "100%", maxWidth: 480, maxHeight: "85vh",
              overflow: "auto",
              paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              animation: "slideUpModal 0.25s cubic-bezier(.4,0,.2,1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.14)" }} />
            </div>

            {/* Stepper */}
            <div style={{
              padding: "14px 20px 6px",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: pickerAccent,
              }} />
              <span style={{
                fontSize: 11, fontWeight: 700, color: pickerAccent,
                textTransform: "uppercase", letterSpacing: 1,
              }}>
                {pickerTeam.name}
              </span>
              <span style={{ flex: 1 }} />
              {pickerTeam.players.length === 0 && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  {t("no_player_in_squad")}
                </span>
              )}
            </div>

            {pickerTeam.players.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                {t("no_player_in_squad")}
                <div style={{ marginTop: 14 }}>
                  <button
                    onClick={() => {
                      // Manuel skor + 1 (oyuncu yokken)
                      hapticMedium();
                      if (pickerSide === "A") setScoreA((s) => s + 1);
                      else setScoreB((s) => s + 1);
                      setConfettiColor(pickerAccent);
                      setConfettiTick((x) => x + 1);
                      closePicker();
                    }}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10, border: "none",
                      background: pickerAccent, color: "#0a1628",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    +1 (Manuel)
                  </button>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
                    {t("manual_score_hint")}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* STEP 1: SCORER */}
                {step === "scorer" && (
                  <div style={{ padding: "10px 18px 18px" }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: "#e2e8f0",
                      marginBottom: 10,
                    }}>
                      ⚽ {t("pick_scorer")}
                    </div>

                    {/* Goal type segmented (üstte, scorer seçilmeden) */}
                    <div style={{
                      display: "flex", gap: 4, marginBottom: 12,
                      overflowX: "auto", paddingBottom: 4,
                      scrollbarWidth: "none",
                    }}>
                      {GOAL_TYPES.map((gt) => (
                        <button
                          key={gt.id}
                          onClick={() => { hapticSelection(); setDraftGoalType(gt.id); }}
                          style={{
                            flexShrink: 0,
                            padding: "7px 11px",
                            borderRadius: 9,
                            border: `1px solid ${draftGoalType === gt.id ? pickerAccent : "rgba(255,255,255,0.08)"}`,
                            background: draftGoalType === gt.id ? `${pickerAccent}1f` : "rgba(255,255,255,0.03)",
                            color: draftGoalType === gt.id ? pickerAccent : "rgba(255,255,255,0.55)",
                            fontSize: 11, fontWeight: 700,
                            cursor: "pointer", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 5,
                          }}
                        >
                          <span>{gt.icon}</span>
                          <span>{t(gt.labelKey)}</span>
                        </button>
                      ))}
                    </div>

                    {/* Player grid */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 6,
                    }}>
                      {pickerTeam.players.map((p) => (
                        <PlayerChip
                          key={p.id}
                          player={p}
                          accentColor={pickerAccent}
                          onClick={() => handleScorerPick(p)}
                          badge={goalsByPlayer[p.id]}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 2: ASSIST */}
                {step === "assist" && draftScorer && draftGoalType !== "own_goal" && (
                  <div style={{ padding: "10px 18px 18px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
                      🅰️ {t("pick_assist")}
                    </div>
                    <div style={{
                      fontSize: 11, color: pickerAccent, fontWeight: 600,
                      marginBottom: 12,
                    }}>
                      ⚽ {draftScorer.name} {draftScorer.surname}
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 6, marginBottom: 12,
                    }}>
                      {assistCandidates.map((p) => (
                        <PlayerChip
                          key={p.id}
                          player={p}
                          accentColor={pickerAccent}
                          onClick={() => handleAssistPick(p)}
                          badge={assistsByPlayer[p.id]}
                        />
                      ))}
                    </div>

                    <button
                      onClick={handleAssistSkip}
                      style={{
                        width: "100%", padding: "11px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.03)",
                        color: "rgba(255,255,255,0.6)",
                        fontSize: 12, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {t("pick_assist_skip")} →
                    </button>
                  </div>
                )}

                {/* STEP 3: CONFIRM (dakika opsiyonel + kaydet) */}
                {step === "confirm" && draftScorer && (
                  <div style={{ padding: "10px 18px 18px" }}>
                    {/* Özet kart */}
                    <div style={{
                      padding: 14,
                      background: `linear-gradient(135deg, ${pickerAccent}1a, ${pickerAccent}0a)`,
                      border: `1px solid ${pickerAccent}33`,
                      borderRadius: 12,
                      marginBottom: 14,
                      animation: "goalPop 0.35s",
                    }}>
                      <div style={{
                        fontSize: 18, fontWeight: 800, color: "#fff",
                        marginBottom: 6,
                      }}>
                        {GOAL_TYPES.find((g) => g.id === draftGoalType)?.icon} {draftScorer.name} {draftScorer.surname}
                      </div>
                      <div style={{ fontSize: 12, color: pickerAccent, fontWeight: 600 }}>
                        {t(GOAL_TYPES.find((g) => g.id === draftGoalType)?.labelKey)}
                      </div>
                      {draftAssist && draftGoalType !== "own_goal" && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                          🅰️ {draftAssist.name} {draftAssist.surname}
                        </div>
                      )}
                    </div>

                    {/* Dakika input — opsiyonel */}
                    <label style={{
                      fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
                      display: "block",
                    }}>
                      {t("minute_optional")} ({t("optional")})
                    </label>
                    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                      {[15, 30, 45, 60, 75, 90].map((m) => (
                        <button
                          key={m}
                          onClick={() => { hapticSelection(); setDraftMinute(String(m)); }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 9,
                            border: `1px solid ${draftMinute === String(m) ? pickerAccent : "rgba(255,255,255,0.08)"}`,
                            background: draftMinute === String(m) ? `${pickerAccent}1f` : "rgba(255,255,255,0.03)",
                            color: draftMinute === String(m) ? pickerAccent : "rgba(255,255,255,0.55)",
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {m}'
                        </button>
                      ))}
                      <input
                        type="number"
                        min="1" max="120"
                        placeholder="..."
                        value={draftMinute}
                        onChange={(e) => setDraftMinute(e.target.value)}
                        style={{
                          width: 70,
                          padding: "8px 10px",
                          borderRadius: 9,
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "rgba(255,255,255,0.04)",
                          color: "#e2e8f0",
                          fontSize: 12, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          textAlign: "center", outline: "none",
                        }}
                      />
                    </div>

                    {/* Buttons */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setStep(draftGoalType === "own_goal" ? "scorer" : "assist")}
                        style={{
                          flex: 1, padding: "12px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "rgba(255,255,255,0.03)",
                          color: "rgba(255,255,255,0.6)",
                          fontSize: 12, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        ← {t("cancel")}
                      </button>
                      <button
                        onClick={commitEvent}
                        style={{
                          flex: 1.5, padding: "12px",
                          borderRadius: 10, border: "none",
                          background: `linear-gradient(135deg, ${pickerAccent}, ${pickerAccent}cc)`,
                          color: "#0a1628",
                          fontSize: 13, fontWeight: 800,
                          cursor: "pointer", fontFamily: "inherit",
                          letterSpacing: 0.3,
                          boxShadow: `0 8px 24px ${pickerAccent}55`,
                        }}
                      >
                        ✓ {t("save")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helper: Takım oyuncuları yatay strip (modal'da gösterim) ───
const TeamScorerStrip = ({ team, accent, side, onPlayerTap, goalsByPlayer, assistsByPlayer }) => {
  return (
    <button
      onClick={onPlayerTap}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px",
        background: `linear-gradient(135deg, ${accent}10, ${accent}05)`,
        border: `1px solid ${accent}33`,
        borderRadius: 13,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "transform 0.12s, background 0.18s",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div style={{
        width: 36, height: 36,
        borderRadius: 10,
        background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#0a1628", fontSize: 18, fontWeight: 800,
      }}>⚽</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: "#e2e8f0",
          marginBottom: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {team.name}
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)" }}>
          {team.players.length > 0
            ? `${team.players.length} oyuncu · dokun ve gol ekle`
            : "Önce kadro oluştur"}
        </div>
      </div>
      {/* Top scorer rozet */}
      {(() => {
        const teamGoals = team.players
          .map((p) => ({ p, g: goalsByPlayer[p.id] || 0 }))
          .filter((x) => x.g > 0)
          .sort((a, b) => b.g - a.g);
        if (teamGoals.length === 0) return null;
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 9px",
            background: `${accent}25`,
            borderRadius: 8,
          }}>
            <span style={{ fontSize: 11 }}>⚽</span>
            <span style={{
              fontSize: 11, fontWeight: 800, color: accent,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {teamGoals.reduce((a, b) => a + b.g, 0)}
            </span>
          </div>
        );
      })()}
      <span style={{ color: accent, fontSize: 18, fontWeight: 700 }}>+</span>
    </button>
  );
};