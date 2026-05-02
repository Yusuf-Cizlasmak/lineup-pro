// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Maç Sonucu Modalı (TAP-TO-SCORE — PRO)
// FIFA-tarzı tap-to-score, kupa animasyonu, skor flip, dakika slider,
// +1 floating animation, hat-trick fullscreen efekt.
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef, useMemo, useEffect } from "react";
import { t, tPos } from "./i18n";
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess, hapticSelection } from "./haptics";
import { saveMatch, buildMatch, newEvent } from "./matchHistoryStore";
import { showInterstitial } from "./admob";

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

// ─── Konfeti — 80 partikül, daha zengin ───
const Confetti = ({ trigger, color = "#fbbf24" }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!trigger || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width = canvas.offsetWidth * dpr;
    const H = canvas.height = canvas.offsetHeight * dpr;
    const colors = [color, "#fff", "#fbbf24", "#34d399", "#60a5fa", "#f87171"];
    const N = 80;
    const particles = Array.from({ length: N }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 120,
      y: H / 3,
      vx: (Math.random() - 0.5) * 18,
      vy: -Math.random() * 18 - 6,
      g: 0.55,
      size: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
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
        p.life -= 0.011;
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

// ─── +1 Floating animation ───
const FloatingPlusOne = ({ trigger, color, anchor }) => {
  if (!trigger || !anchor) return null;
  return (
    <div
      key={trigger}
      style={{
        position: "fixed",
        left: anchor.x,
        top: anchor.y,
        transform: "translate(-50%, -50%)",
        color: color,
        fontSize: 28,
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        textShadow: `0 0 12px ${color}, 0 4px 12px rgba(0,0,0,0.6)`,
        pointerEvents: "none",
        zIndex: 1600,
        animation: "floatUpModal 1s ease-out forwards",
      }}
    >
      +1
    </div>
  );
};

// ─── Hat-trick fullscreen efekti ───
const HatTrickBurst = ({ trigger, playerName, color }) => {
  if (!trigger) return null;
  return (
    <div
      key={trigger}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        background: `radial-gradient(circle, ${color}33 0%, transparent 60%)`,
        animation: "fadeIn 0.3s",
      }}
    >
      <div
        style={{
          textAlign: "center",
          animation: "hatTrickInModal 0.6s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            fontFamily: "'Bebas Neue', sans-serif",
            color: "#fff",
            textShadow: `0 0 30px ${color}, 0 0 60px ${color}, 0 8px 24px rgba(0,0,0,0.6)`,
            letterSpacing: 4,
            lineHeight: 1,
          }}
        >
          HAT-TRICK!
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: color,
            marginTop: 12,
            textShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          ⚽⚽⚽ {playerName}
        </div>
      </div>
    </div>
  );
};

// ─── Mini player chip — FIFA-tarzı, forma + numara büyük ───
const PlayerChip = ({ player, accentColor, onClick, selected, disabled, badge, large }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: large ? "column" : "row",
        alignItems: "center",
        gap: large ? 6 : 8,
        padding: large ? "10px 8px 9px" : "8px 11px 8px 8px",
        background: selected ? `${accentColor}28` : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${selected ? accentColor : "rgba(255,255,255,0.08)"}`,
        borderRadius: large ? 13 : 11,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        minWidth: 0,
        flex: "1 1 auto",
        textAlign: large ? "center" : "left",
        transition: "transform 0.12s, background 0.18s, border-color 0.18s",
        transform: selected ? "scale(1.02)" : "scale(1)",
        fontFamily: "inherit",
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.95)")}
      onMouseUp={(e) => !disabled && (e.currentTarget.style.transform = selected ? "scale(1.02)" : "scale(1)")}
      onMouseLeave={(e) => !disabled && (e.currentTarget.style.transform = selected ? "scale(1.02)" : "scale(1)")}
    >
      {/* Forma */}
      <div style={{
        position: "relative",
        width: large ? 44 : 30,
        height: large ? 44 : 30,
        flexShrink: 0,
        borderRadius: large ? 11 : 8,
        background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#0a1628",
        fontWeight: 800,
        fontSize: large ? 16 : 12,
        fontFamily: "'JetBrains Mono', monospace",
        boxShadow: selected ? `0 6px 18px ${accentColor}66` : `0 2px 6px rgba(0,0,0,0.25)`,
      }}>
        {player.jerseyNumber || getInitials(player.name, player.surname)}
      </div>
      <div style={{ flex: large ? "none" : 1, minWidth: 0, width: large ? "100%" : "auto" }}>
        <div style={{
          fontSize: large ? 11 : 12,
          fontWeight: 700,
          color: "#e2e8f0",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {player.name} {player.surname}
        </div>
        <div style={{ fontSize: large ? 8.5 : 9, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: 0.3 }}>
          {tPos(player.position)}
        </div>
      </div>
      {badge != null && badge > 0 && (
        <div style={{
          position: large ? "absolute" : "static",
          top: large ? 6 : "auto",
          right: large ? 6 : "auto",
          background: accentColor,
          color: "#0a1628",
          borderRadius: 8,
          padding: "2px 6px",
          fontSize: 10,
          fontWeight: 800,
          minWidth: 18,
          textAlign: "center",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {badge}
        </div>
      )}
    </button>
  );
};

// ─── Score number with flip animation ───
const FlipScore = ({ value, color }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (value !== displayValue) {
      setFlipping(true);
      const t1 = setTimeout(() => {
        setDisplayValue(value);
      }, 180);
      const t2 = setTimeout(() => setFlipping(false), 360);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [value, displayValue]);
  return (
    <span style={{
      display: "inline-block",
      fontSize: 56,
      fontWeight: 800,
      color: "#fff",
      fontFamily: "'Bebas Neue',sans-serif",
      lineHeight: 1,
      minWidth: 44,
      textAlign: "center",
      textShadow: `0 0 24px ${color}55`,
      animation: flipping ? "scoreFlipModal 0.36s cubic-bezier(.4,0,.2,1)" : "none",
      transformOrigin: "center",
    }}>
      {displayValue}
    </span>
  );
};

// Score control with flip
// Score display only — manuel +/− kaldırıldı, golleri oyuncu seçerek ekle
const ScoreControl = ({ value, color, name }) => (
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <FlipScore value={value} color={color} />
    </div>
  </div>
);

// ─── Mini event row ───
const EventRow = ({ event, accent, scorerInfo, assistInfo, onDelete }) => {
  const goalType = GOAL_TYPES.find((g) => g.id === event.goalType) || GOAL_TYPES[0];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 10px",
      background: "rgba(255,255,255,0.03)",
      borderRadius: 9,
      borderLeft: `3px solid ${accent}`,
      animation: "cascadeInModal 0.3s",
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

// ─── Trophy header (kazanan takım için) ───
const TrophyHeader = ({ winnerName, winnerColor }) => {
  if (!winnerName) return null;
  return (
    <div style={{
      textAlign: "center",
      marginBottom: -8,
      paddingTop: 4,
      animation: "trophyDropModal 0.7s cubic-bezier(.4,0,.2,1)",
    }}>
      <div style={{ fontSize: 36, lineHeight: 1, filter: `drop-shadow(0 0 12px ${winnerColor})` }}>🏆</div>
      <div style={{
        fontSize: 11, fontWeight: 800, color: winnerColor,
        letterSpacing: 1, textTransform: "uppercase",
        marginTop: 4,
      }}>
        {winnerName}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════
export default function MatchResultModal({
  open, onClose, teamA, teamB, isMatch,
  captureAndShare,
  toast,
  onNavigateToHistory,
}) {
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [events, setEvents] = useState([]);
  const [pickerSide, setPickerSide] = useState(null);
  const [draftScorer, setDraftScorer] = useState(null);
  const [draftGoalType, setDraftGoalType] = useState("normal");
  const [draftMinute, setDraftMinute] = useState(45);
  const [draftMinuteEnabled, setDraftMinuteEnabled] = useState(false);
  const [draftAssist, setDraftAssist] = useState(null);
  const [step, setStep] = useState("scorer");
  const [confettiTick, setConfettiTick] = useState(0);
  const [confettiColor, setConfettiColor] = useState("#fbbf24");
  const [hatTrickBurst, setHatTrickBurst] = useState(null);
  const [floaterTick, setFloaterTick] = useState(0);
  const [floaterAnchor, setFloaterAnchor] = useState(null);
  const [floaterColor, setFloaterColor] = useState("#fbbf24");
  const [showMvp, setShowMvp] = useState(false);
  const [mvpId, setMvpId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [savedSummary, setSavedSummary] = useState(null);
  const [showSaveReminder, setShowSaveReminder] = useState(false);
  const scoreRef = useRef(null);
  const shareRef = useRef(null); // sadece trophy + skor board — paylaşım için
  const teamAScoreRef = useRef(null);
  const teamBScoreRef = useRef(null);

  const acA = teamA.color.secondary;
  const acB = teamB.color.secondary;

  // Modal her açıldığında temiz başla
  useEffect(() => {
    if (open) {
      setScoreA(0); setScoreB(0);
      setEvents([]);
      setPickerSide(null);
      setDraftScorer(null); setDraftAssist(null);
      setDraftGoalType("normal"); setDraftMinute(45); setDraftMinuteEnabled(false);
      setStep("scorer");
      setShowMvp(false);
      setMvpId(null);
      setSaved(false);
      setShowSaveReminder(false);
      setShowSuccessPopup(false);
      setSavedSummary(null);
      setHatTrickBurst(null);
    }
  }, [open]);

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

  const winner = scoreA > scoreB ? teamA : scoreB > scoreA ? teamB : null;
  const winnerName = winner?.name || null;
  const winnerColor = winner?.color?.secondary || null;

  const openPicker = (side) => {
    if (saved) return;
    hapticSelection();
    setPickerSide(side);
    setStep("scorer");
    setDraftScorer(null);
    setDraftAssist(null);
    setDraftGoalType("normal");
    setDraftMinute(45);
    setDraftMinuteEnabled(false);
  };

  const closePicker = () => {
    setPickerSide(null);
    setDraftScorer(null);
    setDraftAssist(null);
    setStep("scorer");
  };

  const handleScorerPick = (player) => {
    hapticMedium();
    setDraftScorer(player);
    const sideTeam = pickerSide === "A" ? teamA : teamB;
    const others = sideTeam.players.filter((p) => p.id !== player.id);
    if (others.length === 0 || draftGoalType === "own_goal") {
      setStep("confirm");
    } else {
      setStep("assist");
    }
  };

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

  // Olayı kaydet — +1 floater + konfeti + hat-trick check
  const commitEvent = () => {
    if (!draftScorer || !pickerSide) return;
    const isOwnGoal = draftGoalType === "own_goal";
    const ev = newEvent({
      type: isOwnGoal ? "own_goal" : "goal",
      side: pickerSide,
      playerId: draftScorer.id,
      assistPlayerId: isOwnGoal ? null : (draftAssist?.id || null),
      minute: draftMinuteEnabled ? draftMinute : null,
      goalType: draftGoalType,
    });

    const scoreSide = isOwnGoal ? (pickerSide === "A" ? "B" : "A") : pickerSide;

    setEvents((arr) => {
      const next = [...arr, ev];
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

    const accent = scoreSide === "A" ? acA : acB;
    setConfettiColor(accent);
    setConfettiTick((x) => x + 1);
    hapticHeavy();

    // +1 floater anchor — score box'ın konumu
    setTimeout(() => {
      const target = scoreSide === "A" ? teamAScoreRef.current : teamBScoreRef.current;
      if (target) {
        const rect = target.getBoundingClientRect();
        setFloaterAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        setFloaterColor(accent);
        setFloaterTick((x) => x + 1);
      }
    }, 50);

    // Hat-trick kontrolü
    const newCount = (goalsByPlayer[draftScorer.id] || 0) + (isOwnGoal ? 0 : 1);
    if (newCount === 3 && !isOwnGoal) {
      setTimeout(() => {
        setHatTrickBurst({ player: `${draftScorer.name} ${draftScorer.surname}`, color: accent, key: Date.now() });
        // Çok sert haptic
        hapticHeavy();
        setTimeout(() => hapticHeavy(), 100);
        setTimeout(() => hapticHeavy(), 200);
        setTimeout(() => setHatTrickBurst(null), 1800);
      }, 300);
    } else if (draftAssist && !isOwnGoal) {
      setTimeout(() => toast?.(t("assist_added")), 200);
    } else if (!isOwnGoal) {
      setTimeout(() => toast?.(t("goal_added")), 200);
    }

    closePicker();
  };

  const deleteEvent = (eventId) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    hapticLight();
    setEvents((arr) => arr.filter((e) => e.id !== eventId));
    const isOwnGoal = ev.type === "own_goal";
    const scoreSide = isOwnGoal ? (ev.side === "A" ? "B" : "A") : ev.side;
    if (ev.type === "goal" || ev.type === "own_goal") {
      if (scoreSide === "A") setScoreA((s) => Math.max(0, s - 1));
      else setScoreB((s) => Math.max(0, s - 1));
    }
    toast?.(t("t_event_deleted"));
  };

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

  // Modal kapatma — gol ekledi mi kontrolü
  const handleAttemptClose = () => {
    if (!saved && (scoreA > 0 || scoreB > 0) && events.length === 0) {
      // Skor var ama event yok → hatırlat
      setShowSaveReminder(true);
      return;
    }
    onClose();
  };

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

    // Özet bilgileri kaydet — popup'ta gösterilecek
    setSavedSummary({
      scoreA, scoreB,
      teamAName: teamA.name,
      teamBName: teamB.name,
      eventsCount: events.length,
      mvpName: mvpId ? (() => {
        const all = [...teamA.players, ...teamB.players];
        const mvp = all.find((p) => p.id === mvpId);
        return mvp ? `${mvp.name} ${mvp.surname}` : null;
      })() : null,
    });

    // Başarı pop-up'ı göster — paylaşmadan veya paylaştıktan sonra
    if (alsoShare && scoreRef.current && captureAndShare) {
      setTimeout(async () => {
        await captureAndShare(shareRef.current, "mac-sonucu.png");
        setShowSuccessPopup(true);
        setTimeout(() => { showInterstitial(); }, 500);
      }, 250);
    } else {
      // Hemen popup
      setTimeout(() => setShowSuccessPopup(true), 200);
      setTimeout(() => { showInterstitial(); }, 500);
    }
  };

  if (!open) return null;

  const pickerTeam = pickerSide === "A" ? teamA : pickerSide === "B" ? teamB : null;
  const pickerAccent = pickerSide === "A" ? acA : acB;

  const assistCandidates = pickerTeam && draftScorer
    ? pickerTeam.players.filter((p) => p.id !== draftScorer.id)
    : [];

  const allPlayers = [
    ...teamA.players.map((p) => ({ ...p, side: "A" })),
    ...(isMatch ? teamB.players.map((p) => ({ ...p, side: "B" })) : []),
  ];

  return (
    <>
      <style>{`
        @keyframes slideUpModal { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes pulse2 { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.06); opacity: 0.85 } }
        @keyframes goalPop { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes floatUpModal {
          0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
          25% { transform: translate(-50%, -90%) scale(1.4); opacity: 1; }
          100% { transform: translate(-50%, -180%) scale(1); opacity: 0; }
        }
        @keyframes scoreFlipModal {
          0% { transform: rotateX(0); }
          50% { transform: rotateX(-90deg); }
          100% { transform: rotateX(0); }
        }
        @keyframes trophyDropModal {
          0% { transform: translateY(-60px) rotate(-30deg) scale(0.4); opacity: 0; }
          60% { transform: translateY(8px) rotate(10deg) scale(1.1); opacity: 1; }
          100% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
        }
        @keyframes hatTrickInModal {
          0% { transform: scale(0.3) rotate(-15deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes cascadeInModal {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes successPopIn {
          0% { transform: scale(0.7) translateY(20px); opacity: 0; }
          60% { transform: scale(1.04) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes successCheckIn {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          70% { transform: scale(1.2) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {confettiTick > 0 && <Confetti trigger={confettiTick} color={confettiColor} key={confettiTick} />}
      {floaterTick > 0 && <FloatingPlusOne trigger={floaterTick} color={floaterColor} anchor={floaterAnchor} />}
      {hatTrickBurst && <HatTrickBurst trigger={hatTrickBurst.key} playerName={hatTrickBurst.player} color={hatTrickBurst.color} />}

      <div
        onClick={handleAttemptClose}
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
              onClick={handleAttemptClose}
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

          {/* SCREENSHOT TARGET — Tüm alan (eskiden kullanılıyordu) */}
          <div ref={scoreRef} style={{
            padding: "0 18px 20px",
            display: "flex", flexDirection: "column", gap: 16,
            background: "#0e1117",
          }}>
            {/* PAYLAŞIM ALANI — sadece trophy + skor board */}
            <div ref={shareRef} style={{
              background: "#0e1117",
              padding: "16px 18px",
              borderRadius: 18,
            }}>
            {/* Trophy header */}
            {winner && <TrophyHeader winnerName={winnerName} winnerColor={winnerColor} />}

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
                <div ref={teamAScoreRef} style={{ flex: 1 }}>
                  <ScoreControl value={scoreA} color={acA} name={teamA.name} />
                </div>
                <div style={{ padding: "0 6px" }}>
                  <div style={{
                    fontSize: 12, color: "rgba(255,255,255,0.18)", fontWeight: 800,
                    fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2,
                  }}>–</div>
                </div>
                {isMatch ? (
                  <div ref={teamBScoreRef} style={{ flex: 1 }}>
                    <ScoreControl value={scoreB} color={acB} name={teamB.name} />
                  </div>
                ) : (
                  <div style={{ flex: 1, textAlign: "center", color: "rgba(255,255,255,0.18)", fontSize: 12 }}>
                    —
                  </div>
                )}
              </div>
              {(scoreA > 0 || scoreB > 0) ? (
                <div style={{
                  textAlign: "center", marginTop: 12,
                  fontSize: 13, fontWeight: 700,
                  color: winner ? "#fbbf24" : "rgba(255,255,255,0.45)",
                  letterSpacing: 0.3,
                }}>
                  {winner ? t("winner", { name: winnerName }) : (scoreA === scoreB && (scoreA > 0)) ? t("draw") : ""}
                </div>
              ) : (
                <div style={{
                  textAlign: "center", marginTop: 12,
                  fontSize: 10.5, fontWeight: 600,
                  color: "rgba(255,255,255,0.35)",
                  letterSpacing: 0.3,
                }}>
                  ⚽ {t("score_auto_hint")}
                </div>
              )}
            </div>
            </div>{/* /shareRef */}

            {/* TAP-TO-SCORE: Takım strip */}
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

            {/* MVP toggle */}
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

          {saved && !showSuccessPopup && (
            <div style={{ padding: "0 18px" }}>
              <div style={{
                padding: "13px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.6)",
                fontSize: 12, fontWeight: 600,
                textAlign: "center",
              }}>
                ⏳ {t("match_saving")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PICKER OVERLAY */}
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
              {/* Step göstergesi */}
              {pickerTeam.players.length > 0 && (
                <div style={{ display: "flex", gap: 4 }}>
                  {[
                    "scorer",
                    ...(draftGoalType !== "own_goal" && pickerTeam.players.length > 1 ? ["assist"] : []),
                    "confirm",
                  ].map((stepId, idx, arr) => (
                    <div
                      key={stepId}
                      style={{
                        width: step === stepId ? 16 : 5,
                        height: 5,
                        borderRadius: 3,
                        background: arr.indexOf(step) >= idx ? pickerAccent : "rgba(255,255,255,0.15)",
                        transition: "all 0.25s",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {pickerTeam.players.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.6 }}>⚠️</div>
                <div style={{
                  fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 600,
                  marginBottom: 8,
                }}>
                  {t("no_player_in_squad")}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 16, lineHeight: 1.5 }}>
                  {t("no_player_hint")}
                </div>
                <button
                  onClick={closePicker}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {t("close")}
                </button>
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

                    {/* Goal type segmented */}
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

                    {/* FIFA-tarzı player grid (large kart) */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                      gap: 6,
                    }}>
                      {pickerTeam.players.map((p) => (
                        <PlayerChip
                          key={p.id}
                          player={p}
                          accentColor={pickerAccent}
                          onClick={() => handleScorerPick(p)}
                          badge={goalsByPlayer[p.id]}
                          large
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
                      gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                      gap: 6, marginBottom: 12,
                    }}>
                      {assistCandidates.map((p) => (
                        <PlayerChip
                          key={p.id}
                          player={p}
                          accentColor={pickerAccent}
                          onClick={() => handleAssistPick(p)}
                          badge={assistsByPlayer[p.id]}
                          large
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

                {/* STEP 3: CONFIRM with slider minute */}
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

                    {/* Dakika — slider tarzı */}
                    <div style={{
                      padding: 14,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 11,
                      marginBottom: 14,
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        marginBottom: 10,
                      }}>
                        <label style={{
                          fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: 1,
                        }}>
                          {t("minute_optional")}
                        </label>
                        <button
                          onClick={() => { hapticSelection(); setDraftMinuteEnabled((v) => !v); }}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${draftMinuteEnabled ? pickerAccent : "rgba(255,255,255,0.1)"}`,
                            background: draftMinuteEnabled ? `${pickerAccent}22` : "transparent",
                            color: draftMinuteEnabled ? pickerAccent : "rgba(255,255,255,0.4)",
                            fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          {draftMinuteEnabled ? "✓ AÇIK" : "KAPALI"}
                        </button>
                      </div>

                      {draftMinuteEnabled && (
                        <>
                          <div style={{
                            display: "flex", alignItems: "baseline", justifyContent: "center",
                            gap: 4, marginBottom: 10,
                          }}>
                            <span style={{
                              fontSize: 44, fontWeight: 800, color: pickerAccent,
                              fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
                              textShadow: `0 0 16px ${pickerAccent}55`,
                            }}>{draftMinute}</span>
                            <span style={{
                              fontSize: 14, color: pickerAccent, fontWeight: 700,
                              opacity: 0.7,
                            }}>'</span>
                          </div>
                          <input
                            type="range"
                            min="1" max="120"
                            value={draftMinute}
                            onChange={(e) => setDraftMinute(parseInt(e.target.value, 10))}
                            onTouchStart={() => hapticLight()}
                            style={{
                              width: "100%",
                              accentColor: pickerAccent,
                              cursor: "pointer",
                            }}
                          />
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            fontSize: 9, color: "rgba(255,255,255,0.3)",
                            marginTop: 4, fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            <span>1'</span>
                            <span>45'</span>
                            <span>90'</span>
                            <span>120'</span>
                          </div>
                          {/* Hızlı butonlar */}
                          <div style={{ display: "flex", gap: 5, marginTop: 10, justifyContent: "center" }}>
                            {[15, 30, 45, 60, 75, 90].map((m) => (
                              <button
                                key={m}
                                onClick={() => { hapticSelection(); setDraftMinute(m); }}
                                style={{
                                  flex: 1,
                                  padding: "5px 0",
                                  borderRadius: 6,
                                  border: `1px solid ${draftMinute === m ? pickerAccent : "rgba(255,255,255,0.06)"}`,
                                  background: draftMinute === m ? `${pickerAccent}22` : "transparent",
                                  color: draftMinute === m ? pickerAccent : "rgba(255,255,255,0.45)",
                                  fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                {m}'
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Buttons */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setStep(draftGoalType === "own_goal" || pickerTeam.players.length === 1 ? "scorer" : "assist")}
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

      {/* GOL EKLEME HATIRLATMA POP */}
      {showSaveReminder && (
        <div
          onClick={() => setShowSaveReminder(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1300,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(160deg, #1a1d27, #0e1117)",
              borderRadius: 18,
              border: "1px solid rgba(251,191,36,0.3)",
              padding: 22,
              maxWidth: 360,
              textAlign: "center",
              animation: "goalPop 0.35s",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(251,191,36,0.15)",
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 8 }}>📊</div>
            <div style={{
              fontSize: 16, fontWeight: 800, color: "#fff",
              marginBottom: 8,
            }}>
              {t("save_reminder_title")}
            </div>
            <div style={{
              fontSize: 12, color: "rgba(255,255,255,0.55)",
              marginBottom: 18, lineHeight: 1.5,
            }}>
              {t("save_reminder_desc")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setShowSaveReminder(false); onClose(); }}
                style={{
                  flex: 1, padding: "11px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t("save_reminder_skip")}
              </button>
              <button
                onClick={() => setShowSaveReminder(false)}
                style={{
                  flex: 1.4, padding: "11px",
                  borderRadius: 10, border: "none",
                  background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                  color: "#7c2d12",
                  fontSize: 12, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: 0.3,
                  boxShadow: "0 6px 18px rgba(251,191,36,0.35)",
                }}
              >
                ⚽ {t("save_reminder_continue")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAÇ KAYDEDİLDİ — BAŞARI POP-UP */}
      {showSuccessPopup && savedSummary && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1400,
            background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
            animation: "fadeIn 0.25s",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, #14532d, #0e1117 60%)",
              borderRadius: 22,
              border: "1px solid rgba(52,211,153,0.4)",
              padding: "26px 22px 22px",
              maxWidth: 380, width: "100%",
              textAlign: "center",
              animation: "successPopIn 0.5s cubic-bezier(.34,1.56,.64,1)",
              boxShadow: "0 20px 80px rgba(0,0,0,0.7), 0 0 60px rgba(52,211,153,0.2)",
              position: "relative", overflow: "hidden",
            }}
          >
            {/* Glow */}
            <div style={{
              position: "absolute",
              top: -50, left: "50%", transform: "translateX(-50%)",
              width: 200, height: 100,
              background: "radial-gradient(ellipse, rgba(52,211,153,0.4) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <div style={{
              position: "relative",
              fontSize: 56,
              marginBottom: 6,
              animation: "successCheckIn 0.6s 0.2s both",
            }}>
              ✅
            </div>

            <div style={{
              fontSize: 18, fontWeight: 800, color: "#fff",
              marginBottom: 6, position: "relative",
            }}>
              {t("save_success_title")}
            </div>

            <div style={{
              fontSize: 12, color: "rgba(255,255,255,0.55)",
              marginBottom: 18, lineHeight: 1.5, position: "relative",
            }}>
              {t("save_success_desc")}
            </div>

            {/* Mini özet kart */}
            <div style={{
              padding: "14px 12px",
              background: "rgba(0,0,0,0.4)",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: 18,
              position: "relative",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                marginBottom: 6,
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: "#e2e8f0",
                  maxWidth: 100,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{savedSummary.teamAName}</span>
                <span style={{
                  fontSize: 28, fontWeight: 800, color: "#fbbf24",
                  fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
                }}>
                  {savedSummary.scoreA} – {savedSummary.scoreB}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: "#e2e8f0",
                  maxWidth: 100,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{savedSummary.teamBName}</span>
              </div>
              {(savedSummary.eventsCount > 0 || savedSummary.mvpName) && (
                <div style={{
                  display: "flex", justifyContent: "center", gap: 12,
                  fontSize: 10.5, color: "rgba(255,255,255,0.5)", fontWeight: 600,
                  marginTop: 6,
                }}>
                  {savedSummary.eventsCount > 0 && <span>⚽ {savedSummary.eventsCount} {t("save_success_events")}</span>}
                  {savedSummary.mvpName && <span>⭐ {savedSummary.mvpName}</span>}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, position: "relative" }}>
              <button
                onClick={() => { hapticLight(); setShowSuccessPopup(false); onClose(); }}
                style={{
                  flex: 1, padding: "12px",
                  borderRadius: 11,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t("save_success_close")}
              </button>
              <button
                onClick={() => {
                  hapticMedium();
                  setShowSuccessPopup(false);
                  if (onNavigateToHistory) onNavigateToHistory();
                  else onClose();
                }}
                style={{
                  flex: 1.6, padding: "12px",
                  borderRadius: 11, border: "none",
                  background: "linear-gradient(135deg, #10b981, #34d399)",
                  color: "#0a1628",
                  fontSize: 12, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: 0.3,
                  boxShadow: "0 8px 22px rgba(52,211,153,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}
              >
                📚 {t("save_success_view")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helper: Takım strip ───
const TeamScorerStrip = ({ team, accent, side, onPlayerTap, goalsByPlayer, assistsByPlayer }) => {
  const teamGoals = (team.players || [])
    .map((p) => ({ p, g: goalsByPlayer[p.id] || 0 }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g);
  const totalGoals = teamGoals.reduce((a, b) => a + b.g, 0);

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
      {totalGoals > 0 && (
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
            {totalGoals}
          </span>
        </div>
      )}
      <span style={{ color: accent, fontSize: 18, fontWeight: 700 }}>+</span>
    </button>
  );
};