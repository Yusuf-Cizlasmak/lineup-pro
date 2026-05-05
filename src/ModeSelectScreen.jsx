// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · ModeSelectScreen (PREMIUM EDITION)
// ─────────────────────────────────────────────────────────────
// Vizyon: "Floodlight" — gece halı sahası, stadyum ışığı atmosferi.
// • Animated saha arkaplanı (SVG, hafif drift)
// • Cinematic logo entrance (scale + glow pulse)
// • Kişiselleştirilmiş üst pill (nickname + lokal istatistik özeti)
// • Aktif maç şeridi (devam eden online/lokal maç varsa)
// • 4 mode kartı, her biri kendi karakterinde:
//     - Kendi Takımım (yeşil)        → tek-takım yönetimi
//     - Tüm Halı Saha (altın · vurgu) → 2 takım, full maç
//     - Online Halı Saha (mavi · PRO) → canlı, kod ile katılım
//     - Geçmiş & İstatistikler (mor) → maç tarihi, krallık, profiller
// • Kartlarda parıltı (shimmer) ve subtle hover/tap motion
// • Alt info bar: versiyon + dil + topluluk linkleri
// • Tüm dış görünümün tutarlı CSS değişkenleri ile yönetimi
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import logo from "./ssssss.png";
import { t, useLang, setLang } from "./i18n";
import { LangToggle } from "./Onboarding";
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess } from "./haptics";
import { getAllMatches, computePlayerStats } from "./matchHistoryStore";
import { getNickname, setNickname, registerDevice, getMyActiveSessions } from "./LiveMatchService";
import { hideBanner, showBanner } from "./admob";

// ═══ SABİTLER ═══
const C = {
  bg0: "#04070b",
  bg1: "#070c13",
  bg2: "#0a141f",
  text: "#e8edf3",
  muted: "rgba(232,237,243,0.45)",
  dim: "rgba(232,237,243,0.22)",
  border: "rgba(255,255,255,0.07)",
  accent: "#34d399",
  gold: "#fbbf24",
  blue: "#60a5fa",
  purple: "#a78bfa",
  red: "#f87171",
};

// Mode meta — i18n'den title/sub gelir, gerisi burada
const buildModes = (T) => [
  {
    key: "myteam",
    icon: "🛡",
    color: "#34d399",
    glow: "rgba(52,211,153,0.45)",
    bgTint: "rgba(52,211,153,0.05)",
    badge: null,
    title: T("mode_myteam_title"),
    sub: T("mode_myteam_sub"),
    detail: T("mode_myteam_detail"),
  },
  {
    key: "match",
    icon: "🏆",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.45)",
    bgTint: "rgba(251,191,36,0.05)",
    badge: { label: "POPÜLER", color: "#fbbf24" },
    title: T("mode_match_title"),
    sub: T("mode_match_sub"),
    detail: T("mode_match_detail"),
  },
  {
    key: "online",
    icon: "⚡",
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.5)",
    bgTint: "rgba(96,165,250,0.06)",
    badge: { label: "CANLI", color: "#ef4444", pulse: true },
    premium: true,
    title: "Online Halı Saha",
    sub: "Kod ile arkadaşlarınla aynı maçı paylaş, canlı senkronize ol.",
    detail: "Realtime · Çoklu cihaz · Puanlama",
  },
  {
    key: "history",
    icon: "📊",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.4)",
    bgTint: "rgba(167,139,250,0.05)",
    badge: null,
    title: T("mode_history_title"),
    sub: T("mode_history_sub"),
    detail: T("mode_history_detail"),
  },
];

export default function ModeSelectScreen({ onSelectMode }) {
  const [lang] = useLang();
  const modes = useMemo(() => buildModes(t), [lang]);
  const [nickname, setLocalNickname] = useState(getNickname() || "");
  const [showRename, setShowRename] = useState(false);

  // ─── Lokal istatistik özeti ───
  const [stats, setStats] = useState(null);
  // ─── Son maçlar (lokal geçmiş) ───
  const [lastMatches, setLastMatches] = useState([]);
  // ─── Aktif online maç (devam eden, henüz finished değil) ───
  const [activeOnline, setActiveOnline] = useState(null);

  useEffect(() => {
    try {
      const matches = getAllMatches();
      if (matches.length > 0) {
        const { stats: s } = computePlayerStats(matches);
        let totalGoals = 0,
          totalAssists = 0,
          totalWins = 0,
          totalMatches = matches.length;
        Object.values(s).forEach((v) => {
          totalGoals += v.goals || 0;
          totalAssists += v.assists || 0;
          totalWins += v.wins || 0;
        });
        setStats({ matches: totalMatches, goals: totalGoals, assists: totalAssists, wins: totalWins });

        // Son 3 maç (en yeniye göre)
        const sorted = [...matches].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setLastMatches(sorted.slice(0, 3));
      }
    } catch (e) {
      // sessizce yut
    }

    // Aktif online maç var mı?
    (async () => {
      try {
        const sessions = await getMyActiveSessions();
        if (sessions && sessions.length > 0) {
          setActiveOnline(sessions[0]);
        }
      } catch {}
    })();
  }, []);

  const handleSelect = (m) => {
    hapticMedium();
    onSelectMode?.(m.key);
  };

  const handleResumeOnline = () => {
    hapticMedium();
    onSelectMode?.("online");
  };

  const handleSaveNickname = async (newName) => {
    const clean = (newName || "").trim();
    if (!clean) return;
    setNickname(clean);
    setLocalNickname(clean);
    try { await registerDevice(clean); } catch {}
    hapticSuccess();
    setShowRename(false);
  };

  return (
    <>
      <style>{cssAnims}</style>

      {/* ═══ ATMOSFER (FIXED — scroll'da kaymaz) ═══ */}
      <AmbientBackground />

      <div style={S.root}>

      {/* ═══ ÜST BAR ═══ */}
      <header style={S.header}>
        <button
          onClick={() => { hapticLight(); setShowRename(true); }}
          style={S.userPill}
          aria-label="İsmi düzenle"
        >
          {nickname ? (
            <>
              <span style={S.userAvatar}>{nickname[0].toUpperCase()}</span>
              <span style={S.userName}>{nickname}</span>
              <span style={S.userPillEdit}>✏️</span>
            </>
          ) : (
            <>
              <span style={{ ...S.userAvatar, background: "rgba(255,255,255,0.08)", color: C.muted }}>?</span>
              <span style={{ ...S.userName, color: C.muted }}>İsim belirle</span>
              <span style={S.userPillEdit}>✏️</span>
            </>
          )}
        </button>
        <LangToggle lang={lang} onChange={setLang} />
      </header>

      {/* ═══ AKTIF MAÇ ŞERİDİ ═══ */}
      {activeOnline && (
        <div style={S.activeBanner} onClick={handleResumeOnline}>
          <span style={S.liveDot} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.activeTitle}>
              {activeOnline.field_name || "Online Maç"} — devam ediyor
            </div>
            <div style={S.activeSub}>
              {activeOnline.team_a_name} {activeOnline.score_a ?? 0}-
              {activeOnline.score_b ?? 0} {activeOnline.team_b_name}
              {" · "}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: C.blue }}>
                {activeOnline.join_code}
              </span>
            </div>
          </div>
          <span style={S.activeArrow}>→</span>
        </div>
      )}

      {/* ═══ HERO BLOĞU ═══ */}
      <section style={S.hero}>
        <div style={S.logoWrap}>
          <div style={S.logoHaloOuter} />
          <div style={S.logoHaloInner} />
          <img src={logo} alt="HalıSaha-Kolik" style={S.logo} />
        </div>

        <h1 style={S.brandTitle}>HALI&shy;SAHA-KOLİK</h1>
        <div style={S.brandTag}>
          <span style={S.brandTagDash}>—</span>
          <span style={S.brandTagText}>{t("mode_subtitle")}</span>
          <span style={S.brandTagDash}>—</span>
        </div>

        {/* Lokal istatistik mini kartı */}
        {stats && stats.matches > 0 && (
          <div style={S.statStrip}>
            <StatPill label="MAÇ" value={stats.matches} />
            <StatPill label="GOL" value={stats.goals} accent={C.gold} />
            <StatPill label="ASİST" value={stats.assists} accent={C.blue} />
            <StatPill label="GALİBİYET" value={stats.wins} accent={C.accent} />
          </div>
        )}
      </section>

      {/* ═══ MOD KARTLARI ═══ */}
      <section style={S.cards}>
        {modes.map((m, i) => (
          <ModeCard
            key={m.key}
            mode={m}
            delay={0.18 + i * 0.07}
            onSelect={() => handleSelect(m)}
          />
        ))}
      </section>

      {/* ═══ SON MAÇLAR ═══ */}
      {lastMatches.length > 0 && (
        <section style={S.recentSection}>
          <div style={S.recentHeader}>
            <span style={S.recentLabel}>SON MAÇLAR</span>
            <button onClick={() => { hapticLight(); onSelectMode?.("history"); }}
                    style={S.recentMoreBtn}>
              Tümü →
            </button>
          </div>
          <div style={S.recentList}>
            {lastMatches.map((m) => (
              <RecentMatchCard
                key={m.id}
                match={m}
                onClick={() => { hapticMedium(); onSelectMode?.("history"); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ═══ ALT İNFO ═══ */}
      <footer style={S.footer}>
        <span style={S.footerDot} />
        <span style={S.footerText}>v1 · Made with ⚽ for the field</span>
      </footer>

      {/* ═══ RENAME MODAL ═══ */}
      {showRename && (
        <RenameModal
          currentName={nickname}
          onSave={handleSaveNickname}
          onClose={() => setShowRename(false)}
        />
      )}
    </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// RENAME MODAL — premium nickname düzenleme
// ═══════════════════════════════════════════════════════════
function RenameModal({ currentName, onSave, onClose }) {
  const [draft, setDraft] = useState(currentName || "");
  const [shake, setShake] = useState(false);
  const inputRef = React.useRef(null);

  useEffect(() => {
    // Açılınca input'a otomatik fokus
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    // ★ Banner reklamı gizle — modal'ın altına çakışmasın
    hideBanner().catch(() => {});
    return () => {
      clearTimeout(t);
      // Modal kapanınca banner'ı geri getir
      showBanner().catch(() => {});
    };
  }, []);

  const handleSave = () => {
    if (!draft.trim()) {
      setShake(true);
      hapticLight();
      setTimeout(() => setShake(false), 400);
      return;
    }
    onSave(draft);
  };

  return (
    <div onClick={onClose} style={S.renameBackdrop}>
      <style>{`
        @keyframes msShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        @keyframes msSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} style={S.renameSheet}>
        {/* Grabber */}
        <div style={S.renameGrabber} />

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 52, height: 52, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.accent}, #10b981)`,
            color: "#04150b", fontSize: 24, fontWeight: 900,
            boxShadow: `0 8px 22px ${C.accent}55, 0 0 0 1px ${C.accent}33 inset`,
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: 12,
          }}>
            {(draft || currentName || "?")[0].toUpperCase()}
          </div>
          <h3 style={{
            margin: 0, fontSize: 18, fontWeight: 800, color: C.text,
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: 0.2,
          }}>
            {currentName ? "İsmini düzenle" : "Takma adını belirle"}
          </h3>
          <p style={{
            margin: "4px 0 0", fontSize: 12, color: C.muted,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Maçlarda ve istatistiklerde bu isimle görüneceksin
          </p>
        </div>

        {/* Input */}
        <div style={{
          ...S.renameInputWrap,
          animation: shake ? "msShake 0.4s ease-out" : "none",
          borderColor: shake ? C.red : "rgba(255,255,255,0.1)",
        }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="Takma adın..."
            maxLength={20}
            style={S.renameInput}
          />
          <span style={S.renameCharCount}>{draft.length}/20</span>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={S.renameCancelBtn}>
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={!draft.trim()}
            style={{
              ...S.renameSaveBtn,
              opacity: !draft.trim() ? 0.5 : 1,
              cursor: !draft.trim() ? "not-allowed" : "pointer",
            }}
          >
            ✓ Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AMBIENT BACKGROUND — saha çizgileri + drift halo
// ═══════════════════════════════════════════════════════════
function AmbientBackground() {
  return (
    <>
      {/* Tüm atmosfer fixed — scroll'dan etkilenmez, içerik üzerine binmez */}
      <div style={S.bgFixedWrap} aria-hidden>
        {/* Üst stadyum ışığı */}
        <div style={S.bgFloodTop} />
        {/* Alt drift halo */}
        <div style={S.bgHaloBottom} />
        {/* Çim deseni — sadece üst %55 + agresif alt karartma */}
        <svg
          style={S.bgPitch}
          viewBox="0 0 100 200"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id="ms-grass" patternUnits="userSpaceOnUse" width="100" height="6">
              <rect width="100" height="6" fill="rgba(26,107,49,0.18)" />
              <rect width="100" height="3" fill="rgba(30,122,56,0.12)" opacity="0.5" />
            </pattern>
            <linearGradient id="ms-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0.55)" />
              <stop offset="40%" stopColor="rgba(0,0,0,0.45)" />
              <stop offset="80%" stopColor="rgba(7,12,19,0.95)" />
              <stop offset="100%" stopColor="rgba(7,12,19,1)" />
            </linearGradient>
          </defs>
          <rect width="100" height="200" fill="url(#ms-grass)" />
          {/* Saha çizgileri — sadece üst yarıda */}
          <rect x="6" y="4" width="88" height="96" fill="none"
                stroke="rgba(255,255,255,0.07)" strokeWidth="0.3" />
          <line x1="6" y1="100" x2="94" y2="100"
                stroke="rgba(255,255,255,0.07)" strokeWidth="0.3" />
          <circle cx="50" cy="100" r="14" fill="none"
                  stroke="rgba(255,255,255,0.07)" strokeWidth="0.3" />
          <circle cx="50" cy="100" r="0.8" fill="rgba(255,255,255,0.18)" />
          <rect x="22" y="4" width="56" height="18" fill="none"
                stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
          {/* Karartma overlay — alt yarı tamamen koyu */}
          <rect width="100" height="200" fill="url(#ms-fade)" />
        </svg>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// RECENT MATCH CARD — Son maç önizlemesi
// ═══════════════════════════════════════════════════════════
function formatRelativeDate(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 7) return `${days} gün önce`;
  if (days < 30) return `${Math.floor(days / 7)} hafta önce`;
  const d = new Date(ts);
  return `${d.getDate()}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

function RecentMatchCard({ match, onClick }) {
  const a = match.teamA || {};
  const b = match.teamB || {};
  const aWin = (match.scoreA || 0) > (match.scoreB || 0);
  const bWin = (match.scoreB || 0) > (match.scoreA || 0);
  const draw = !aWin && !bWin;
  const colA = a.color?.secondary || "#34d399";
  const colB = b.color?.secondary || "#f87171";

  return (
    <button onClick={onClick} style={S.recentCard}>
      {/* Sol şerit + Takım A */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2,
          background: `linear-gradient(180deg, ${colA}, ${colB})` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.recentRow}>
            <span style={{ ...S.recentTeamName, color: aWin ? "#fff" : "rgba(255,255,255,0.65)" }}>
              {a.name || "Takım A"}
            </span>
            <span style={{ ...S.recentScore, color: aWin ? colA : draw ? "#fff" : "rgba(255,255,255,0.4)" }}>
              {match.scoreA ?? 0}
            </span>
          </div>
          <div style={S.recentRow}>
            <span style={{ ...S.recentTeamName, color: bWin ? "#fff" : "rgba(255,255,255,0.65)" }}>
              {b.name || "Takım B"}
            </span>
            <span style={{ ...S.recentScore, color: bWin ? colB : draw ? "#fff" : "rgba(255,255,255,0.4)" }}>
              {match.scoreB ?? 0}
            </span>
          </div>
        </div>
      </div>
      {/* Sağ — tarih */}
      <div style={S.recentDate}>{formatRelativeDate(match.createdAt)}</div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// STAT PILL — küçük metrik
// ═══════════════════════════════════════════════════════════
function StatPill({ label, value, accent = "#e8edf3" }) {
  return (
    <div style={S.statPill}>
      <span style={{ ...S.statValue, color: accent }}>{value}</span>
      <span style={S.statLabel}>{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODE CARD — her bir mod kutusu
// ═══════════════════════════════════════════════════════════
function ModeCard({ mode, onSelect, delay }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={() => onSelect()}
      onTouchStart={() => { setPressed(true); hapticSelection(); }}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        ...S.card,
        animationDelay: `${delay}s`,
        transform: pressed ? "scale(0.985)" : "scale(1)",
        background: `linear-gradient(135deg, ${mode.bgTint} 0%, rgba(255,255,255,0.015) 100%)`,
        borderColor: pressed ? `${mode.color}55` : "rgba(255,255,255,0.08)",
        boxShadow: mode.premium
          ? `0 0 0 1px ${mode.color}33 inset, 0 14px 40px rgba(0,0,0,0.5), 0 0 28px ${mode.glow}`
          : `0 14px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset`,
      }}
    >
      {/* Sol kenar şeridi (jersey rib) */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 14,
          bottom: 14,
          width: 4,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${mode.color}, ${mode.color}66 50%, ${mode.color})`,
          boxShadow: `0 0 12px ${mode.glow}`,
        }}
      />

      {/* Premium altın gradient kenar */}
      {mode.premium && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 18,
            padding: 1,
            background:
              "linear-gradient(135deg, rgba(251,191,36,0.55), rgba(96,165,250,0.45) 50%, rgba(251,191,36,0.55))",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            opacity: 0.7,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Sol — icon kutusu */}
      <div
        style={{
          ...S.cardIconBox,
          background: `linear-gradient(135deg, ${mode.color}28, ${mode.color}10)`,
          borderColor: `${mode.color}55`,
          color: mode.color,
          boxShadow: `0 8px 24px ${mode.glow}, 0 0 0 1px ${mode.color}33 inset`,
        }}
      >
        <span style={S.cardIcon}>{mode.icon}</span>
      </div>

      {/* Orta — metin */}
      <div style={S.cardBody}>
        <div style={S.cardHeader}>
          <span style={{ ...S.cardTitle, color: C.text }}>{mode.title}</span>
          {mode.badge && (
            <span
              style={{
                ...S.cardBadge,
                color: mode.badge.color,
                borderColor: `${mode.badge.color}55`,
                background: `${mode.badge.color}18`,
              }}
            >
              {mode.badge.pulse && <span style={S.badgePulseDot} />}
              {mode.badge.label}
            </span>
          )}
          {mode.premium && (
            <span style={S.proBadge}>★ PRO</span>
          )}
        </div>
        <div style={S.cardSub}>{mode.sub}</div>
        <div style={{ ...S.cardDetail, color: `${mode.color}c0` }}>{mode.detail}</div>
      </div>

      {/* Sağ — chevron */}
      <span style={{ ...S.cardArrow, color: mode.color }}>›</span>

      {/* Shimmer overlay */}
      <span aria-hidden style={S.cardShimmer} />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// ANIMATIONS (tek bir <style> tag'inde)
// ═══════════════════════════════════════════════════════════
const cssAnims = `
@keyframes msFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes msLogoIntro {
  0%   { opacity: 0; transform: scale(0.8); }
  60%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes msLogoGlow {
  0%, 100% { transform: scale(1);    opacity: 0.55; }
  50%      { transform: scale(1.15); opacity: 0.85; }
}
@keyframes msHaloDrift {
  0%   { transform: translate(0, 0) rotate(0deg); }
  50%  { transform: translate(-4%, 3%) rotate(180deg); }
  100% { transform: translate(0, 0) rotate(360deg); }
}
@keyframes msFloodPulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 0.9; }
}
@keyframes msShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes msLivePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
  50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
}
@keyframes msBadgePulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
@keyframes msStatPop {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}
`;

// ═══════════════════════════════════════════════════════════
// STYLE TABLE
// ═══════════════════════════════════════════════════════════
const S = {
  root: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    background: `linear-gradient(180deg, transparent 0%, transparent 50vh, #070c13 100vh)`,
    color: C.text,
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
    paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    zIndex: 1,
  },

  // ─── Atmosfer (sabit, scroll'dan etkilenmez) ───
  bgFixedWrap: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 0,
  },
  bgFloodTop: {
    position: "absolute",
    top: "-15%",
    left: "0",
    right: "0",
    height: "55%",
    background: "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(180,210,255,0.08), transparent 60%)",
    animation: "msFloodPulse 7s ease-in-out infinite",
  },
  bgHaloBottom: {
    position: "absolute",
    bottom: "-10%",
    left: "-10%",
    width: "120%",
    height: "55%",
    background: "radial-gradient(ellipse 60% 60% at 50% 100%, rgba(52,211,153,0.07), transparent 60%)",
    animation: "msHaloDrift 28s ease-in-out infinite",
  },
  bgPitch: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    // Yalnızca viewport'un üst %60'ı — alt kısım solid koyu kalır
    height: "60vh",
    opacity: 0.85,
  },

  // ─── Header ───
  header: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    maxWidth: 460,
    padding: "0 18px 6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  userPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 10px 5px 5px",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border}`,
    borderRadius: 999,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    cursor: "pointer",
    color: C.text,
    fontFamily: "inherit",
    transition: "background 0.15s, border-color 0.15s",
  },
  userPillEdit: {
    fontSize: 11,
    opacity: 0.5,
    marginLeft: 2,
  },
  userAvatar: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${C.accent}, #10b981)`,
    color: "#04150b",
    fontWeight: 900,
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 4px 10px rgba(52,211,153,0.35)",
  },
  userName: {
    fontSize: 12,
    fontWeight: 700,
    color: C.text,
    letterSpacing: 0.3,
  },

  // ─── Aktif Online Maç şeridi ───
  activeBanner: {
    position: "relative",
    zIndex: 2,
    width: "calc(100% - 36px)",
    maxWidth: 424,
    margin: "10px 0 4px",
    padding: "10px 14px",
    background: "linear-gradient(90deg, rgba(96,165,250,0.12), rgba(96,165,250,0.04))",
    border: "1px solid rgba(96,165,250,0.32)",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    animation: "msFadeUp 0.5s cubic-bezier(.4,0,.2,1)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
    boxShadow: "0 0 0 0 rgba(239,68,68,0.6)",
    animation: "msLivePulse 1.6s ease-out infinite",
    flexShrink: 0,
  },
  activeTitle: {
    fontSize: 12.5,
    fontWeight: 700,
    color: C.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  activeSub: {
    fontSize: 10.5,
    color: C.muted,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  activeArrow: {
    color: C.blue,
    fontSize: 18,
    fontWeight: 800,
    flexShrink: 0,
  },

  // ─── Hero ───
  hero: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    maxWidth: 460,
    padding: "16px 18px 20px",
    textAlign: "center",
  },
  logoWrap: {
    position: "relative",
    width: 92,
    height: 92,
    margin: "0 auto 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoHaloOuter: {
    position: "absolute",
    inset: -16,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(52,211,153,0.35) 0%, transparent 65%)",
    filter: "blur(10px)",
    animation: "msLogoGlow 3.4s ease-in-out infinite",
    pointerEvents: "none",
  },
  logoHaloInner: {
    position: "absolute",
    inset: 0,
    borderRadius: 22,
    boxShadow: "0 14px 36px rgba(5,150,105,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset",
    pointerEvents: "none",
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 22,
    objectFit: "cover",
    position: "relative",
    zIndex: 2,
    animation: "msLogoIntro 0.8s cubic-bezier(.5,1.5,.5,1) both",
  },
  brandTitle: {
    fontFamily: "'Bebas Neue', 'DM Sans', sans-serif",
    fontSize: 36,
    fontWeight: 700,
    margin: 0,
    letterSpacing: 4,
    backgroundImage: "linear-gradient(180deg, #ffffff 0%, #d6dde7 60%, #b8c2d0 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    animation: "msFadeUp 0.55s 0.1s both",
    textShadow: "0 1px 0 rgba(255,255,255,0.06)",
  },
  brandTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    animation: "msFadeUp 0.55s 0.18s both",
  },
  brandTagDash: {
    width: 16,
    height: 1,
    background: C.dim,
    display: "inline-block",
  },
  brandTagText: {
    fontSize: 10.5,
    color: C.muted,
    fontWeight: 700,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', 'DM Sans', sans-serif",
  },

  // ─── Stat Strip ───
  statStrip: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
    animation: "msFadeUp 0.5s 0.26s both",
  },
  statPill: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "6px 14px",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    minWidth: 56,
    backdropFilter: "blur(6px)",
    animation: "msStatPop 0.4s cubic-bezier(.5,1.5,.5,1) both",
  },
  statValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.05,
  },
  statLabel: {
    fontSize: 8.5,
    color: C.dim,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 2,
  },

  // ─── Cards ───
  cards: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    maxWidth: 460,
    padding: "0 18px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },
  card: {
    position: "relative",
    width: "100%",
    padding: "16px 16px 16px 22px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: C.text,
    fontFamily: "inherit",
    textAlign: "left",
    overflow: "hidden",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    transition: "transform 0.14s ease, border-color 0.18s ease, box-shadow 0.2s ease",
    animation: "msFadeUp 0.55s cubic-bezier(.4,0,.2,1) both",
  },
  cardIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: "1px solid",
  },
  cardIcon: {
    fontSize: 26,
    lineHeight: 1,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.1,
    fontFamily: "'DM Sans', sans-serif",
  },
  cardBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1.5px 7px",
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: 1,
    borderRadius: 4,
    border: "1px solid",
    fontFamily: "'JetBrains Mono', 'DM Sans', monospace",
  },
  badgePulseDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#ef4444",
    animation: "msBadgePulse 1.4s ease-in-out infinite",
  },
  proBadge: {
    fontSize: 8.5,
    fontWeight: 900,
    letterSpacing: 1,
    color: "#fbbf24",
    background: "linear-gradient(90deg, rgba(251,191,36,0.2), rgba(251,191,36,0.06))",
    border: "1px solid rgba(251,191,36,0.5)",
    padding: "1.5px 7px",
    borderRadius: 4,
    fontFamily: "'DM Sans', sans-serif",
  },
  cardSub: {
    fontSize: 12.5,
    color: "rgba(232,237,243,0.55)",
    lineHeight: 1.42,
    marginBottom: 4,
    fontWeight: 400,
  },
  cardDetail: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', 'DM Sans', monospace",
  },
  cardArrow: {
    fontSize: 26,
    fontWeight: 300,
    flexShrink: 0,
    opacity: 0.55,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cardShimmer: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)",
    backgroundSize: "300% 100%",
    animation: "msShimmer 6s linear infinite",
    pointerEvents: "none",
    mixBlendMode: "overlay",
    opacity: 0.5,
  },

  // ─── Recent Matches ───
  recentSection: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    maxWidth: 460,
    padding: "18px 18px 0",
    animation: "msFadeUp 0.55s 0.5s both",
  },
  recentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    padding: "0 2px",
  },
  recentLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', 'DM Sans', monospace",
  },
  recentMoreBtn: {
    background: "transparent",
    border: "none",
    color: C.accent,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.5,
    padding: 0,
  },
  recentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  recentCard: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    cursor: "pointer",
    color: C.text,
    fontFamily: "inherit",
    textAlign: "left",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    transition: "background 0.15s, border-color 0.15s",
  },
  recentRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    minHeight: 18,
  },
  recentTeamName: {
    fontSize: 12.5,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
    minWidth: 0,
  },
  recentScore: {
    fontSize: 16,
    fontWeight: 900,
    fontFamily: "'JetBrains Mono', monospace",
    minWidth: 18,
    textAlign: "right",
  },
  recentDate: {
    fontSize: 9.5,
    color: C.dim,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
    paddingLeft: 8,
    borderLeft: `1px solid ${C.border}`,
    minWidth: 60,
    textAlign: "right",
  },

  // ─── Footer ───
  footer: {
    position: "relative",
    zIndex: 2,
    marginTop: "auto",
    paddingTop: 22,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: C.dim,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', 'DM Sans', monospace",
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: C.accent,
    boxShadow: `0 0 8px ${C.accent}`,
  },
  footerText: {},

  // ─── Rename Modal ───
  renameBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,5,9,0.72)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    zIndex: 999,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    animation: "msFadeUp 0.2s ease-out",
  },
  renameSheet: {
    width: "100%",
    maxWidth: 460,
    background: "linear-gradient(180deg, #0e1620 0%, #0a1018 100%)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    border: `1px solid ${C.border}`,
    borderBottom: "none",
    padding: "12px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
    boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
    animation: "msSlideUp 0.28s cubic-bezier(.4,0,.2,1)",
  },
  renameGrabber: {
    width: 40,
    height: 4,
    background: "rgba(255,255,255,0.18)",
    borderRadius: 2,
    margin: "0 auto 14px",
  },
  renameInputWrap: {
    position: "relative",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: "2px",
    transition: "border-color 0.2s",
  },
  renameInput: {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    color: C.text,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
    padding: "12px 56px 12px 14px",
    boxSizing: "border-box",
    letterSpacing: 0.3,
  },
  renameCharCount: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 10,
    color: C.dim,
    fontWeight: 700,
    letterSpacing: 0.5,
    fontFamily: "'JetBrains Mono', monospace",
    pointerEvents: "none",
  },
  renameCancelBtn: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: C.muted,
    borderRadius: 12,
    padding: "13px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "background 0.15s",
  },
  renameSaveBtn: {
    flex: 2,
    background: `linear-gradient(135deg, ${C.accent}, #10b981)`,
    border: "none",
    color: "#04150b",
    borderRadius: 12,
    padding: "13px",
    fontSize: 14,
    fontWeight: 800,
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: `0 6px 18px ${C.accent}55`,
    transition: "transform 0.1s, opacity 0.15s",
  },
};