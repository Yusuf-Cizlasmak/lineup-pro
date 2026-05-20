// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Maç Sonucu Modalı (PRO · v2)
//
// BU SÜRÜMDEKİ KRİTİK İYİLEŞTİRMELER:
//
//  1) PAYLAŞIMDA NET SKOR
//     • FlipScore tamamen yeniden yazıldı: hayalet katman, dış shadow blur,
//       3D transform ve crossfade kaldırıldı. Skor artık sabit yükseklikli,
//       tabular-nums kullanan TEK katman. html2canvas / native screenshot
//       her zaman keskin yakalar.
//     • Capture sırasında tüm CSS animasyonları geçici olarak donduruluyor
//       (`data-capturing="true"` flag'i + global CSS rule). Confetti canvas
//       ve floater overlay'leri capture esnasında DOM'dan render dışı bırakılır.
//     • Paylaşım kartı (shareRef) artık sahip olduğu içeriği kendi padding'i
//       içinde tutuyor; modal'ın ayrı görsel katmanı olarak çalışıyor.
//
//  2) GOL EKLEMEDE TİTREMEYEN GEÇİŞLER
//     • Picker artık bottom-sheet OLARAK AÇILIRKEN ana modal'ın scroll
//       pozisyonunu KİLİTLİYOR. Picker kapanırken pozisyon geri yükleniyor.
//       Bu, "küçük ekran gidip gelmesi" hissini yaratan reflow'u tamamen
//       sıfırlar.
//     • Adım geçişleri (scorer → assist → confirm) içerik yüksekliğini
//       sabitleyen `min-height` ve `contain: layout` ile yapılır. Step
//       değişiminde içerik fade-translate animasyonuyla gelir; container
//       boyutu zıplamaz.
//     • +1 floater ve confetti yalnızca picker tamamen kapandıktan SONRA
//       (rAF ile garantili) tetiklenir, böylece picker close animasyonu
//       sırasında ekrana yayılan parlama olmaz.
//     • Goal type segmenti picker yüksekliğini değiştirmesin diye sabit
//       satıra alındı; horizontal scroll edge fade ile çerçevelendi.
//
//  3) PREMIUM KÜÇÜK DOKUNUŞLAR
//     • Trophy + skor kartında gradient ışık halkası, ince border-glow,
//       "FT" rozeti (final time) eklendi. Paylaşım kartı tek bakışta
//       "broadcast scoreboard" havası verir.
//     • Skorların iki tarafında dikey vurgu çubukları (takım renginde).
//     • Event log'da bullet renk noktası takım rengiyle eşleşir.
//     • Action butonları daha yumuşak, hover/active mikrostyle'lar.
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef, useMemo, useEffect, useCallback, useLayoutEffect } from "react";
import { t, tPos } from "./i18n";
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess, hapticSelection } from "./haptics";
import { saveMatch, buildMatch, newEvent, getAllMatches } from "./matchHistoryStore";
import { showInterstitial } from "./admob";
import { useSubscription } from "./subscription";
import MatchInsightsPanel from "./MatchInsightsPanel";

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// CONFETTI — capture-aware
// ═══════════════════════════════════════════════════════════
const Confetti = ({ trigger, color = "#fbbf24", suppressed }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!trigger || !ref.current || suppressed) return;
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
  }, [trigger, color, suppressed]);

  if (suppressed) return null;
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

// ═══════════════════════════════════════════════════════════
// FLOATER + HAT-TRICK
// ═══════════════════════════════════════════════════════════
const FloatingPlusOne = ({ trigger, color, anchor, suppressed }) => {
  if (!trigger || !anchor || suppressed) return null;
  return (
    <div
      key={trigger}
      style={{
        position: "fixed",
        left: anchor.x,
        top: anchor.y,
        transform: "translate(-50%, -50%)",
        color: color,
        fontSize: 30,
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        textShadow: `0 0 14px ${color}, 0 4px 12px rgba(0,0,0,0.6)`,
        pointerEvents: "none",
        zIndex: 1600,
        animation: "mrm_floatUp 1s ease-out forwards",
        letterSpacing: 1,
      }}
    >
      +1
    </div>
  );
};

const HatTrickBurst = ({ trigger, playerName, color, suppressed }) => {
  if (!trigger || suppressed) return null;
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
        animation: "mrm_fadeIn 0.3s",
      }}
    >
      <div style={{
        textAlign: "center",
        animation: "mrm_hatTrickIn 0.6s cubic-bezier(.34,1.56,.64,1)",
      }}>
        <div style={{
          fontSize: 72,
          fontWeight: 900,
          fontFamily: "'Bebas Neue', sans-serif",
          color: "#fff",
          textShadow: `0 0 30px ${color}, 0 0 60px ${color}, 0 8px 24px rgba(0,0,0,0.6)`,
          letterSpacing: 4,
          lineHeight: 1,
        }}>
          HAT-TRICK!
        </div>
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: color,
          marginTop: 12,
          textShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}>
          ⚽⚽⚽ {playerName}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// PLAYER CHIP (FIFA-tarzı)
// ═══════════════════════════════════════════════════════════
const PlayerChip = ({ player, accentColor, onClick, selected, disabled, badge, large }) => {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onTouchStart={() => !disabled && setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
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
        transition: "transform 0.12s ease, background 0.18s, border-color 0.18s",
        transform: pressed ? "scale(0.95)" : selected ? "scale(1.02)" : "scale(1)",
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
      }}
    >
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
        <div style={{
          fontSize: large ? 8.5 : 9,
          color: "rgba(255,255,255,0.4)",
          fontWeight: 600,
          letterSpacing: 0.3,
        }}>
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

// ═══════════════════════════════════════════════════════════
// SCORE DISPLAY — capture-safe, NET, sabit yükseklik
// ═══════════════════════════════════════════════════════════
//
// Eski FlipScore'da paylaşımda bulanıklık yapan etkenler:
//   • 3 katman üst üste (animating, prev, ghost-for-layout)
//   • 24px+ blur'lu textShadow → screenshot'ta "puslu" görüntü
//   • rotateX/translateY animasyonu mid-frame yakalanırsa rakam ezik
//   • visibility:hidden hayalet → bazı capture engine'leri yine boyar
//
// YENİ: TEK katman, sabit width/height, tabular-nums.
// Skor değişimi ↑ kısa "pop" animasyonu (transform-only, 220ms),
// fakat capture sırasında animasyon donar (data-capturing).
// ═══════════════════════════════════════════════════════════
const ScoreDigit = ({ value, color }) => {
  const [pop, setPop] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setPop(true);
      const t = setTimeout(() => setPop(false), 240);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={pop ? "mrm-score-pop" : ""}
      style={{
        display: "inline-block",
        minWidth: 48,
        height: 64,
        lineHeight: "64px",
        fontSize: 60,
        fontWeight: 800,
        color: "#fff",
        fontFamily: "'Bebas Neue', sans-serif",
        textAlign: "center",
        // ★ Net görünüm için keskin gölge: 1px sıkı, 8px renkli halo
        textShadow: `0 1px 0 rgba(0,0,0,0.45), 0 0 8px ${color}66`,
        fontVariantNumeric: "tabular-nums",
        // ★ Anti-aliasing iyileştirme — Android WebView'de ezilmeyi önler
        WebkitFontSmoothing: "antialiased",
        textRendering: "geometricPrecision",
        willChange: "transform",
      }}
    >
      {value}
    </span>
  );
};

// side: "A" → vurgu çubuğu solda, "B" → sağda
const ScoreSide = ({ value, color, name, refEl, side = "A" }) => (
  <div ref={refEl} style={{ flex: 1, textAlign: "center", minWidth: 0, position: "relative" }}>
    {/* Takım rengi vurgu çubuğu — A solda, B sağda (tire ile çakışmasın) */}
    <div style={{
      position: "absolute",
      top: "50%",
      [side === "A" ? "left" : "right"]: 0,
      transform: "translateY(-50%)",
      width: 3,
      height: 38,
      borderRadius: 2,
      background: color,
      boxShadow: `0 0 8px ${color}66`,
    }} />
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      color,
      textTransform: "uppercase",
      fontFamily: "'Bebas Neue', sans-serif",
      letterSpacing: 1.4,
      marginBottom: 8,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      padding: "0 10px",
    }}>
      {name}
    </div>
    <ScoreDigit value={value} color={color} />
  </div>
);

// ═══════════════════════════════════════════════════════════
// SCORERS LIST — paylaşım kartı içinde, takımlara ayrılmış
// Her oyuncunun adı + atış sayısı + gol türü ikonları
// ═══════════════════════════════════════════════════════════
const ScorersList = ({ teamA, teamB, events, isMatch, acA, acB }) => {
  // Her takım için gol-bazlı oyuncu listesi
  const buildList = (team, side) => {
    const map = {};
    for (const ev of events) {
      if (ev.type !== "goal" && ev.type !== "own_goal") continue;
      // Kendi kalesine: sayı diğer takıma yazılır ama oyuncu hangi takımdaysa o tarafta listelenir
      // (klasik: kendi kalesine atan oyuncu kendi takımının altında "(KK)" notuyla görünür)
      const isOG = ev.type === "own_goal";
      // Sadece o takımın oyuncularını topla
      if (ev.side !== side) continue;
      const player = team.players.find((p) => p.id === ev.playerId);
      if (!player) continue;
      const key = player.id;
      if (!map[key]) {
        map[key] = {
          player,
          goals: 0,
          ownGoals: 0,
          minutes: [],
          types: [],
        };
      }
      if (isOG) {
        map[key].ownGoals++;
        map[key].types.push("own_goal");
      } else {
        map[key].goals++;
        map[key].types.push(ev.goalType || "normal");
      }
      if (ev.minute != null) map[key].minutes.push(ev.minute);
    }
    return Object.values(map).sort((a, b) => b.goals - a.goals);
  };

  const listA = buildList(teamA, "A");
  const listB = isMatch ? buildList(teamB, "B") : [];

  if (listA.length === 0 && listB.length === 0) return null;

  const renderColumn = (list, accent, align) => (
    <div style={{
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      textAlign: align,
    }}>
      {list.length === 0 ? (
        <div style={{
          fontSize: 10.5,
          color: "rgba(255,255,255,0.25)",
          fontStyle: "italic",
          padding: "4px 0",
        }}>—</div>
      ) : (
        list.map(({ player, goals, ownGoals, minutes, types }) => {
          // Gol türü ikonları (3'ten fazlaysa kısalt)
          const ballCount = goals + ownGoals;
          const showBalls = Math.min(ballCount, 3);
          const balls = "⚽".repeat(showBalls) + (ballCount > 3 ? `×${ballCount}` : "");
          const minuteStr = minutes.length > 0
            ? minutes.sort((a, b) => a - b).map((m) => `${m}'`).join(", ")
            : null;
          return (
            <div
              key={player.id}
              style={{
                display: "flex",
                flexDirection: align === "right" ? "row-reverse" : "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              {/* Forma numarası rozet */}
              <div style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                color: "#0a1628",
                fontSize: 11,
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 2px 6px ${accent}40`,
              }}>
                {player.jerseyNumber || getInitials(player.name, player.surname)}
              </div>
              {/* İsim + dakikalar */}
              <div style={{
                flex: 1,
                minWidth: 0,
                textAlign: align,
              }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#e2e8f0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.2,
                }}>
                  {player.name} {player.surname}
                  {ownGoals > 0 && (
                    <span style={{
                      fontSize: 9,
                      color: "#f87171",
                      fontWeight: 700,
                      marginLeft: 4,
                      letterSpacing: 0.3,
                    }}>(KK)</span>
                  )}
                </div>
                {minuteStr && (
                  <div style={{
                    fontSize: 9.5,
                    color: "rgba(255,255,255,0.4)",
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1.2,
                    marginTop: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {minuteStr}
                  </div>
                )}
              </div>
              {/* Top ikonları */}
              <div style={{
                flexShrink: 0,
                fontSize: 11,
                letterSpacing: -1,
              }}>
                {balls}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div style={{
      marginTop: 14,
      padding: "12px 12px 10px",
      borderRadius: 12,
      background: "rgba(0,0,0,0.28)",
      border: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Mini başlık */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: 10,
      }}>
        <div style={{
          flex: 1,
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12))",
        }} />
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontFamily: "'Bebas Neue', sans-serif",
        }}>
          ⚽ Gol Atanlar
        </span>
        <div style={{
          flex: 1,
          height: 1,
          background: "linear-gradient(90deg, rgba(255,255,255,0.12), transparent)",
        }} />
      </div>

      {/* İki sütun */}
      {isMatch ? (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {renderColumn(listA, acA, "left")}
          <div style={{
            width: 1,
            alignSelf: "stretch",
            background: "rgba(255,255,255,0.06)",
            margin: "0 2px",
          }} />
          {renderColumn(listB, acB, "right")}
        </div>
      ) : (
        renderColumn(listA, acA, "left")
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// EVENT ROW
// ═══════════════════════════════════════════════════════════
const EventRow = ({ event, accent, scorerInfo, assistInfo, onDelete }) => {
  const goalType = GOAL_TYPES.find((g) => g.id === event.goalType) || GOAL_TYPES[0];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9,
      padding: "9px 11px",
      background: "rgba(255,255,255,0.03)",
      borderRadius: 10,
      borderLeft: `3px solid ${accent}`,
      animation: "mrm_cascadeIn 0.28s",
    }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{goalType.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, color: "#e2e8f0", fontWeight: 700,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {scorerInfo}
        </div>
        {assistInfo && (
          <div style={{
            fontSize: 10.5, color: "rgba(255,255,255,0.5)", fontWeight: 500,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginTop: 1,
          }}>
            🅰️ {assistInfo}
          </div>
        )}
      </div>
      {event.minute != null && (
        <span style={{
          fontSize: 11, color: "rgba(255,255,255,0.45)",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          padding: "2px 6px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 4,
        }}>{event.minute}'</span>
      )}
      <button
        onClick={onDelete}
        style={{
          padding: 3,
          border: "none",
          background: "none",
          color: "rgba(248,113,113,0.7)",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >×</button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TROPHY HEADER
// ═══════════════════════════════════════════════════════════
const TrophyHeader = ({ winnerName, winnerColor }) => {
  if (!winnerName) return null;
  return (
    <div style={{
      textAlign: "center",
      marginBottom: 14,
      paddingTop: 4,
      animation: "mrm_trophyDrop 0.7s cubic-bezier(.4,0,.2,1)",
    }}>
      <div style={{
        fontSize: 38,
        lineHeight: 1,
        filter: `drop-shadow(0 0 14px ${winnerColor})`,
      }}>🏆</div>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: winnerColor,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginTop: 6,
      }}>
        {winnerName}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TEAM SCORER STRIP
// ═══════════════════════════════════════════════════════════
const TeamScorerStrip = ({ team, accent, onPlayerTap, goalsByPlayer }) => {
  const teamGoals = (team.players || [])
    .map((p) => ({ p, g: goalsByPlayer[p.id] || 0 }))
    .filter((x) => x.g > 0);
  const totalGoals = teamGoals.reduce((a, b) => a + b.g, 0);

  return (
    <button
      onClick={onPlayerTap}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 11,
        padding: "13px 14px",
        background: `linear-gradient(135deg, ${accent}10, ${accent}05)`,
        border: `1px solid ${accent}33`,
        borderRadius: 13,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "transform 0.12s, background 0.18s",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div style={{
        width: 38, height: 38,
        borderRadius: 10,
        background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#0a1628", fontSize: 18, fontWeight: 800,
        boxShadow: `0 4px 12px ${accent}33`,
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
            ? t("tap_to_score")
            : t("no_player_in_squad")}
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
      <span style={{
        color: accent,
        fontSize: 20,
        fontWeight: 700,
        opacity: 0.7,
        marginLeft: 2,
      }}>+</span>
    </button>
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
  const [savedMatchObj, setSavedMatchObj] = useState(null); // insights için tam match objesi
  const [showSaveReminder, setShowSaveReminder] = useState(false);

  // ★ Capture state — true iken animasyon ve overlay'ler donar
  const [isCapturing, setIsCapturing] = useState(false);

  const scoreRef = useRef(null);
  const shareRef = useRef(null); // sadece trophy + skor board — paylaşım için
  const teamAScoreRef = useRef(null);
  const teamBScoreRef = useRef(null);
  const modalScrollRef = useRef(null); // ana modal scroll container
  const savedScrollTop = useRef(0);    // picker açılırken pozisyonu sakla

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
      setIsCapturing(false);
    }
  }, [open]);

  // ★ Picker açıkken ana modal'ın scroll pozisyonunu kilitle.
  // Bu, picker'ın bottom-sheet animasyonu sırasında ana modal'ın
  // "küçülüp büyüme" hissini ortadan kaldırır.
  useLayoutEffect(() => {
    const el = modalScrollRef.current;
    if (!el) return;
    if (pickerSide) {
      savedScrollTop.current = el.scrollTop;
      // Anlık olarak overflow'u kapat → reflow yok
      el.style.overflow = "hidden";
    } else {
      el.style.overflow = "auto";
      // Pozisyonu geri yükle (reflow olduysa)
      requestAnimationFrame(() => {
        if (el) el.scrollTop = savedScrollTop.current;
      });
    }
  }, [pickerSide]);

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

  const openPicker = useCallback((side) => {
    if (saved) return;
    hapticSelection();
    setPickerSide(side);
    setStep("scorer");
    setDraftScorer(null);
    setDraftAssist(null);
    setDraftGoalType("normal");
    setDraftMinute(45);
    setDraftMinuteEnabled(false);
  }, [saved]);

  const closePicker = useCallback(() => {
    setPickerSide(null);
    setDraftScorer(null);
    setDraftAssist(null);
    setStep("scorer");
  }, []);

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

  // ★ Olayı kaydet — picker'ı kapat, sonra rAF ile efektleri tetikle
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
    const scorerName = `${draftScorer.name} ${draftScorer.surname}`;
    const goalCountForPlayer = (goalsByPlayer[draftScorer.id] || 0) + (isOwnGoal ? 0 : 1);

    closePicker();
    hapticHeavy();

    // ★ Picker close animasyonu bittikten SONRA efektleri tetikle.
    // İki rAF + 280ms timeout: picker kapanma animasyonu (~250ms) tamamen biter,
    // ana modal layout stabil olur, ANCAK SCORE state güncellenmiş olduğundan
    // box position doğru ölçülür.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          setConfettiColor(accent);
          setConfettiTick((x) => x + 1);

          const target = scoreSide === "A" ? teamAScoreRef.current : teamBScoreRef.current;
          if (target) {
            const rect = target.getBoundingClientRect();
            setFloaterAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            setFloaterColor(accent);
            setFloaterTick((x) => x + 1);
          }

          // Hat-trick
          if (goalCountForPlayer === 3 && !isOwnGoal) {
            setTimeout(() => {
              setHatTrickBurst({
                player: scorerName,
                color: accent,
                key: Date.now(),
              });
              hapticHeavy();
              setTimeout(() => hapticHeavy(), 100);
              setTimeout(() => hapticHeavy(), 200);
              setTimeout(() => setHatTrickBurst(null), 1800);
            }, 250);
          } else if (draftAssist && !isOwnGoal) {
            toast?.(t("assist_added"));
          } else if (!isOwnGoal) {
            toast?.(t("goal_added"));
          }
        }, 280);
      });
    });
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

  const handleAttemptClose = () => {
    if (!saved && (scoreA > 0 || scoreB > 0) && events.length === 0) {
      setShowSaveReminder(true);
      return;
    }
    onClose();
  };

  // ★ KAYDET + (opsiyonel) PAYLAŞ
  // Capture'dan ÖNCE animasyonları durdur, overlay'leri gizle, 1 frame
  // bekle, sonra capture al. Capture biter bitmez state'i geri al.
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
    setSavedMatchObj(match); // insights paneli bu objeden besleniyor

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

    if (alsoShare && shareRef.current && captureAndShare) {
      // 1) Capture moduna gir → animasyonlar donar, overlay'ler gizlenir
      setIsCapturing(true);

      // 2) İki frame bekle → React render + browser paint stabilize olur
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          // 3) Ek küçük gecikme — Android WebView için güvence (300ms)
          //    Skor pop animasyonu (240ms) tamamen bitsin.
          await new Promise((res) => setTimeout(res, 320));
          try {
            await captureAndShare(shareRef.current, "mac-sonucu.png");
          } catch (e) {
            console.warn("capture error:", e);
          } finally {
            setIsCapturing(false);
            setShowSuccessPopup(true);
            setTimeout(() => { showInterstitial(); }, 500);
          }
        });
      });
    } else {
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
        @keyframes mrm_slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes mrm_floatUp {
          0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
          25% { transform: translate(-50%, -90%) scale(1.4); opacity: 1; }
          100% { transform: translate(-50%, -180%) scale(1); opacity: 0; }
        }
        @keyframes mrm_scorePop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
        .mrm-score-pop { animation: mrm_scorePop 0.24s cubic-bezier(.34,1.56,.64,1); }
        @keyframes mrm_trophyDrop {
          0% { transform: translateY(-60px) rotate(-30deg) scale(0.4); opacity: 0; }
          60% { transform: translateY(8px) rotate(10deg) scale(1.1); opacity: 1; }
          100% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
        }
        @keyframes mrm_hatTrickIn {
          0% { transform: scale(0.3) rotate(-15deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes mrm_cascadeIn {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes mrm_successPopIn {
          0% { transform: scale(0.7) translateY(20px); opacity: 0; }
          60% { transform: scale(1.04) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes mrm_successCheckIn {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          70% { transform: scale(1.2) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes mrm_fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mrm_stepFade {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes mrm_goalPop {
          0% { transform: scale(0.6); opacity: 0 }
          60% { transform: scale(1.15) }
          100% { transform: scale(1); opacity: 1 }
        }

        /* ★ CAPTURE MODU: Tüm animasyonları dondur — net screenshot */
        [data-mrm-capturing="true"] *,
        [data-mrm-capturing="true"] *::before,
        [data-mrm-capturing="true"] *::after {
          animation-play-state: paused !important;
          animation-duration: 0s !important;
          transition: none !important;
        }

        /* Edge fade — goal-type segmentinin kaymasında profesyonel his */
        .mrm-edgefade {
          mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
        }

        /* Goal type segmentinin scrollbarını gizle */
        .mrm-noscrollbar::-webkit-scrollbar { display: none; }
        .mrm-noscrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <Confetti
        trigger={confettiTick}
        color={confettiColor}
        suppressed={isCapturing}
        key={confettiTick}
      />
      <FloatingPlusOne
        trigger={floaterTick}
        color={floaterColor}
        anchor={floaterAnchor}
        suppressed={isCapturing}
      />
      <HatTrickBurst
        trigger={hatTrickBurst?.key}
        playerName={hatTrickBurst?.player}
        color={hatTrickBurst?.color}
        suppressed={isCapturing}
      />

      {/* ═══ ANA MODAL ═══ */}
      <div
        onClick={handleAttemptClose}
        data-mrm-capturing={isCapturing ? "true" : "false"}
        style={{
          position: "fixed", inset: 0, zIndex: 1100,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
      >
        <div
          ref={modalScrollRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#0e1117",
            borderRadius: "22px 22px 0 0",
            border: "1px solid rgba(255,255,255,0.08)",
            width: "100%", maxWidth: 480, maxHeight: "94vh",
            overflow: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            transform: "translateZ(0)",
            contain: "layout paint",
            paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
            animation: "mrm_slideUp 0.28s cubic-bezier(.4,0,.2,1)",
          }}
        >
          {/* Drag handle */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              background: "rgba(255,255,255,0.14)",
            }} />
          </div>

          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 18px 6px",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)",
              letterSpacing: 1.2, textTransform: "uppercase",
            }}>
              {t("match_save_title")}
            </div>
            <button
              onClick={handleAttemptClose}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                fontSize: 22, lineHeight: 1, cursor: "pointer", padding: 4,
                fontFamily: "inherit",
              }}
            >×</button>
          </div>

          <div ref={scoreRef} style={{
            padding: "0 18px 20px",
            display: "flex", flexDirection: "column", gap: 16,
            background: "#0e1117",
          }}>
            {/* ═══ PAYLAŞIM KARTI — sadece trophy + skor board ═══ */}
            <div ref={shareRef} style={{
              background: "linear-gradient(160deg, #14181f 0%, #0c0e14 100%)",
              padding: "18px 16px 16px",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* ═══ MULTI-LAYER WATERMARK (Free için kırpılamaz) ═══ */}
              <ShareWatermarkLayers />

              {/* Dekoratif gradient ışık halkası */}
              <div style={{
                position: "absolute",
                top: -40, left: "50%", transform: "translateX(-50%)",
                width: 240, height: 80,
                background: winner
                  ? `radial-gradient(ellipse, ${winnerColor}33 0%, transparent 70%)`
                  : "radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              {winner && <TrophyHeader winnerName={winnerName} winnerColor={winnerColor} />}

              {/* SCORE BOARD */}
              <div style={{
                position: "relative", borderRadius: 16, overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.07)",
                padding: "18px 10px",
                background: "rgba(20,22,30,0.98)",
                minHeight: 132, // ★ sabit yükseklik — score değişiminde zıplama yok
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: `linear-gradient(90deg, ${acA}18, transparent 42%, transparent 58%, ${acB}18)`,
                  pointerEvents: "none",
                }} />

                {/* "FT" rozeti — final time / friendly look */}
                <div style={{
                  position: "absolute",
                  top: 8, left: "50%", transform: "translateX(-50%)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 9,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.55)",
                  letterSpacing: 1.5,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  FT
                </div>

                <div style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  marginTop: 6,
                }}>
                  <ScoreSide
                    refEl={teamAScoreRef}
                    value={scoreA}
                    color={acA}
                    name={teamA.name}
                    side="A"
                  />
                  <div style={{
                    padding: "0 10px",
                    fontSize: 32,
                    fontWeight: 800,
                    color: "rgba(255,255,255,0.18)",
                    fontFamily: "'Bebas Neue', sans-serif",
                    lineHeight: 1,
                  }}>–</div>
                  {isMatch ? (
                    <ScoreSide
                      refEl={teamBScoreRef}
                      value={scoreB}
                      color={acB}
                      name={teamB.name}
                      side="B"
                    />
                  ) : (
                    <div style={{
                      flex: 1, textAlign: "center",
                      color: "rgba(255,255,255,0.18)",
                      fontSize: 12,
                    }}>—</div>
                  )}
                </div>

                {(scoreA > 0 || scoreB > 0) ? (
                  <div style={{
                    textAlign: "center",
                    marginTop: 14,
                    fontSize: 13,
                    fontWeight: 700,
                    color: winner ? "#fbbf24" : "rgba(255,255,255,0.45)",
                    letterSpacing: 0.3,
                  }}>
                    {winner
                      ? t("winner", { name: winnerName })
                      : (scoreA === scoreB && scoreA > 0)
                      ? t("draw")
                      : ""}
                  </div>
                ) : (
                  <div style={{
                    textAlign: "center",
                    marginTop: 14,
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.35)",
                    letterSpacing: 0.3,
                  }}>
                    ⚽ {t("score_auto_hint")}
                  </div>
                )}
              </div>

              {/* GOL ATANLAR LİSTESİ — paylaşım kartında, score board'un altında */}
              <ScorersList
                teamA={teamA}
                teamB={teamB}
                events={events}
                isMatch={isMatch}
                acA={acA}
                acB={acB}
              />

              {/* ★ Watermark / Pro brand strip — paylaşım kartında görünür */}
              <ShareWatermark />
            </div>

            {/* TAP-TO-SCORE: Takım strip */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{
                fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700,
                letterSpacing: 1, textTransform: "uppercase", textAlign: "center",
              }}>
                {t("tap_to_score")}
              </div>
              <TeamScorerStrip
                team={teamA} accent={acA}
                onPlayerTap={() => openPicker("A")}
                goalsByPlayer={goalsByPlayer}
              />
              {isMatch && (
                <TeamScorerStrip
                  team={teamB} accent={acB}
                  onPlayerTap={() => openPicker("B")}
                  goalsByPlayer={goalsByPlayer}
                />
              )}
            </div>

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
                <span style={{
                  fontSize: 16, color: "rgba(255,255,255,0.3)",
                  transform: showMvp ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}>▾</span>
              </button>
            )}

            {showMvp && events.length > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
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
                  flex: 1, padding: "13px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e2e8f0",
                  fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                💾 {t("match_save_only")}
              </button>
              <button
                onClick={() => handleSave(true)}
                style={{
                  flex: 1.4, padding: "13px",
                  borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  color: "#fff",
                  fontSize: 13, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: 0.3,
                  boxShadow: "0 8px 28px rgba(124,58,237,0.38)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  WebkitTapHighlightColor: "transparent",
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

      {/* ═══ PICKER OVERLAY ═══ */}
      {pickerSide && pickerTeam && (
        <div
          onClick={closePicker}
          style={{
            position: "fixed", inset: 0, zIndex: 1200,
            background: "rgba(0,0,0,0.86)", backdropFilter: "blur(12px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            animation: "mrm_fadeIn 0.2s",
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
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              transform: "translateZ(0)",
              contain: "layout paint",
              paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              animation: "mrm_slideUp 0.25s cubic-bezier(.4,0,.2,1)",
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
                {/* ★ Step container: min-height ile boyut zıplaması engellenir.
                       İçerik fade-translate animasyonuyla gelir. */}
                <div
                  key={step}
                  style={{
                    minHeight: 320,
                    animation: "mrm_stepFade 0.22s ease-out",
                    contain: "layout style",
                  }}
                >
                  {/* STEP 1: SCORER */}
                  {step === "scorer" && (
                    <div style={{ padding: "10px 18px 18px" }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: "#e2e8f0",
                        marginBottom: 10,
                      }}>
                        ⚽ {t("pick_scorer")}
                      </div>

                      {/* Goal type segmented — scrollable, edge fade */}
                      <div className="mrm-edgefade mrm-noscrollbar" style={{
                        display: "flex", gap: 4, marginBottom: 12,
                        overflowX: "auto", paddingBottom: 4,
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
                              transition: "all 0.15s",
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >
                            <span>{gt.icon}</span>
                            <span>{t(gt.labelKey)}</span>
                          </button>
                        ))}
                      </div>

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
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        {t("pick_assist_skip")} →
                      </button>
                    </div>
                  )}

                  {/* STEP 3: CONFIRM */}
                  {step === "confirm" && draftScorer && (
                    <div style={{ padding: "10px 18px 18px" }}>
                      <div style={{
                        padding: 14,
                        background: `linear-gradient(135deg, ${pickerAccent}1a, ${pickerAccent}0a)`,
                        border: `1px solid ${pickerAccent}33`,
                        borderRadius: 12,
                        marginBottom: 14,
                        animation: "mrm_goalPop 0.35s",
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
                                fontVariantNumeric: "tabular-nums",
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
                                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    WebkitTapHighlightColor: "transparent",
                                  }}
                                >
                                  {m}'
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

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
                            WebkitTapHighlightColor: "transparent",
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
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          ✓ {t("save")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
              animation: "mrm_goalPop 0.35s",
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
            padding: 16,
            animation: "mrm_fadeIn 0.25s",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, #14532d, #0e1117 60%)",
              borderRadius: 22,
              border: "1px solid rgba(52,211,153,0.4)",
              padding: "26px 22px 22px",
              maxWidth: 420, width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
              textAlign: "center",
              animation: "mrm_successPopIn 0.5s cubic-bezier(.34,1.56,.64,1)",
              boxShadow: "0 20px 80px rgba(0,0,0,0.7), 0 0 60px rgba(52,211,153,0.2)",
              position: "relative",
            }}
          >
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
              animation: "mrm_successCheckIn 0.6s 0.2s both",
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
                  fontVariantNumeric: "tabular-nums",
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

            {/* ═══ INSIGHTS PANEL — rule-based maç raporu ═══ */}
            {/* savedMatchObj olduğunda, geçmiş + bu maçtan içgörü üret */}
            {savedMatchObj && (
              <div style={{
                position: "relative",
                marginBottom: 18,
                textAlign: "left",
              }}>
                <MatchInsightsPanel
                  match={savedMatchObj}
                  history={getAllMatches()}
                  compact={true}
                  maxPerCategory={3}
                />
              </div>
            )}

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
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// SHARE WATERMARK LAYERS — Free için KIRPILAMAZ 3 katman:
//   1. Diagonal merkez (kartın orta-arka planında, 45° dönmüş)
//   2. Köşe rozeti (sağ üst köşede subtle)
//   3. Alt brand strip (ShareWatermark fonksiyonunun döndürdüğü)
// Kullanıcı altı kırparsa diagonal görünür; diagonal'i çıkarsa
// köşe görünür → Pro almadan watermark'sız paylaşım imkânsız.
// ═══════════════════════════════════════════════════════════
function ShareWatermarkLayers() {
  const { isPremium } = useSubscription();

  // Pro: hiçbir katman gözükmesin (köşede minik prestij rozeti)
  if (isPremium) {
    return (
      <div style={{
        position: "absolute",
        top: 8,
        right: 10,
        fontSize: 8.5,
        fontWeight: 800,
        letterSpacing: 1.8,
        color: "#fbbf24",
        fontFamily: "'JetBrains Mono', monospace",
        padding: "3px 8px",
        background: "rgba(251,191,36,0.08)",
        border: "1px solid rgba(251,191,36,0.3)",
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: 5,
        textShadow: "0 0 6px rgba(251,191,36,0.4)",
      }}>
        ★ PRO
      </div>
    );
  }

  // Free: 2 katman (3'üncüsü zaten ShareWatermark olarak ayrı render)
  return (
    <>
      {/* ── 1) DIAGONAL ORTA WATERMARK (kart genelinde, çapraz) ── */}
      <div style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }} aria-hidden>
        <div style={{
          fontFamily: "'Bebas Neue', 'Inter Tight', sans-serif",
          fontSize: 56,
          fontWeight: 400,
          letterSpacing: 6,
          color: "rgba(255,255,255,0.045)",
          transform: "rotate(-32deg)",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          userSelect: "none",
          lineHeight: 0.9,
          textAlign: "center",
        }}>
          HALISAHA<br/>KOLIK
          <div style={{
            fontSize: 16,
            letterSpacing: 4,
            marginTop: 6,
            color: "rgba(251,191,36,0.10)",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ★ FREE EDITION ★
          </div>
        </div>
      </div>

      {/* ── 2) KÖŞE ROZETİ (sağ üst, kart kırpılırsa görünür kalır) ── */}
      <div style={{
        position: "absolute",
        top: 8,
        right: 10,
        zIndex: 4,
        padding: "3px 8px",
        background: "rgba(0,0,0,0.45)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 4,
        fontSize: 8,
        fontWeight: 800,
        letterSpacing: 1.5,
        color: "rgba(255,255,255,0.55)",
        fontFamily: "'JetBrains Mono', monospace",
        pointerEvents: "none",
      }}>
        HK · FREE
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARE WATERMARK — Free=alt strip (3. katman), Pro=brand strip
// Yukarıdaki ShareWatermarkLayers ile birlikte çalışır.
// ═══════════════════════════════════════════════════════════
function ShareWatermark() {
  const { isPremium } = useSubscription();
  if (isPremium) {
    return (
      <div style={{
        textAlign: "center",
        marginTop: 12,
        padding: "8px 12px",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 2.5,
        color: "#fbbf24",
        fontFamily: "'JetBrains Mono', monospace",
        borderTop: "1px solid rgba(251,191,36,0.2)",
      }}>
        ★ HALI SAHA · PRO
      </div>
    );
  }
  return (
    <div style={{
      textAlign: "center",
      marginTop: 12,
      padding: "10px 12px 8px",
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 1.2,
      color: "rgba(255,255,255,0.45)",
      fontFamily: "'JetBrains Mono', monospace",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.25))",
    }}>
      <div style={{ marginBottom: 3 }}>
        HALISAHA-KOLIK <span style={{ color: "rgba(255,255,255,0.30)" }}>·</span> halisahakolik.com
      </div>
      <div style={{
        fontSize: 8.5,
        fontWeight: 800,
        letterSpacing: 2,
        color: "rgba(251,191,36,0.95)",
        textShadow: "0 0 8px rgba(251,191,36,0.35)",
      }}>
        ★ PRO İLE WATERMARK KALKAR
      </div>
    </div>
  );
}