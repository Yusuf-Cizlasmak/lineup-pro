// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · ModeSelectScreen — PREMIUM EDITION v2
// ─────────────────────────────────────────────────────────────
// Onboarding ile aynı editöryel spor-premium estetiği:
//   • Tek brand yeşil (#10b981), gold sadece PRO accent için
//   • Bebas Neue display + DM Sans body + JetBrains Mono micro
//   • Saha tebeşir çizgili subtle atmosfer (Onboarding'le aynı)
//   • Mode kartları: her birinde mini SVG pitch illüstrasyonu
//   • Editöryel typography hiyerarşisi
//   • Hiç emoji yok — tüm aksanlar harf monogramı veya SVG
//
// Tüm mevcut özellikler korundu:
//   - User pill (nickname / premium status)
//   - Aktif online maç şeridi
//   - İstatistik bloğu (maç, gol, asist, galibiyet)
//   - Pro tease (free için)
//   - Son maçlar listesi (varsa)
//   - Rename modal
//   - i18n / lang toggle
//   - useSubscription / openPaywall
//
// LİG MODU TAMAMEN KALDIRILDI.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import logo from "./ssssss.png";
import { t, useLang } from "./i18n";
// (LangToggle ve setLang artık burada kullanılmıyor; dil ayarı Settings sheet'te.)
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess } from "./haptics";
import { getAllMatches, computePlayerStats } from "./matchHistoryStore";
import { getNickname, setNickname, registerDevice, getMyActiveSessions } from "./LiveMatchService";
import { hideBanner, showBanner } from "./admob";
import { useSubscription, canCreateOnlineMatch } from "./subscription";
import LockedPreview from "./LockedPreview";

// ═══════════════════════════════════════════════════════════
// BRAND — Onboarding ile birebir aynı palet
// ═══════════════════════════════════════════════════════════
const C = {
  bg:        "#06090e",
  bgDeep:    "#04070b",
  surface:   "#0a1118",
  surfaceHi: "#0d1620",
  ink:       "#f4f4f5",
  inkDim:    "rgba(244,244,245,0.62)",
  inkFaint:  "rgba(244,244,245,0.32)",
  inkGhost:  "rgba(244,244,245,0.16)",
  line:      "rgba(255,255,255,0.07)",
  lineHi:    "rgba(255,255,255,0.14)",
  primary:   "#10b981",
  primaryDim:"#059669",
  gold:      "#fbbf24",
  goldDim:   "#f59e0b",
  blue:      "#60a5fa",
  purple:    "#a78bfa",
  red:       "#ef4444",
};

// ═══════════════════════════════════════════════════════════
// MOD LİSTESİ — her modun mini SVG kind'ı var
// ═══════════════════════════════════════════════════════════
const buildModes = (T) => [
  {
    key: "myteam",
    kind: "single-pitch",
    title: T("mode_myteam_title"),
    sub: T("mode_myteam_sub"),
    detail: T("mode_myteam_detail"),
    accent: C.primary,
    badge: null,
    premium: false,
  },
  {
    key: "match",
    kind: "vs-pitch",
    title: T("mode_match_title"),
    sub: T("mode_match_sub"),
    detail: T("mode_match_detail"),
    accent: C.primary,
    badge: { label: "POPÜLER", color: C.primary },
    premium: false,
  },
  {
    key: "online",
    kind: "connected-phones",
    title: "Online Halı Saha",
    sub: "Kod ile arkadaşlarınla aynı maçı paylaş, canlı senkronize ol.",
    detail: "REALTIME · ÇOKLU CİHAZ · PUANLAMA",
    accent: C.blue,
    badge: { label: "CANLI", color: C.red, pulse: true },
    premium: true,
  },
  {
    key: "history",
    kind: "scoreboard",
    title: T("mode_history_title"),
    sub: T("mode_history_sub"),
    detail: T("mode_history_detail"),
    accent: C.purple,
    badge: null,
    premium: false,
  },
];

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
export default function ModeSelectScreen({ onSelectMode, onOpenSettings }) {
  const { isPremium, isTrial, daysLeft, openPaywall } = useSubscription();
  const [lang] = useLang();
  const modes = useMemo(() => buildModes(t), [lang]);
  const [nickname, setLocalNickname] = useState(getNickname() || "");
  const [showRename, setShowRename] = useState(false);

  const [stats, setStats] = useState(null);
  const [lastMatches, setLastMatches] = useState([]);
  const [activeOnline, setActiveOnline] = useState(null);

  // Hoş geldin kartı dismiss durumu — localStorage'da kalıcı
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try { return localStorage.getItem("halisaha_welcome_dismissed") === "1"; }
    catch { return false; }
  });

  const dismissWelcome = () => {
    try { localStorage.setItem("halisaha_welcome_dismissed", "1"); } catch {}
    setWelcomeDismissed(true);
    hapticLight();
  };

  useEffect(() => {
    try {
      const matches = getAllMatches();
      if (matches.length > 0) {
        const { stats: s } = computePlayerStats(matches);
        let totalGoals = 0, totalAssists = 0, totalWins = 0;
        Object.values(s).forEach((v) => {
          totalGoals += v.goals || 0;
          totalAssists += v.assists || 0;
          totalWins += v.wins || 0;
        });
        setStats({ matches: matches.length, goals: totalGoals, assists: totalAssists, wins: totalWins });
        const sorted = [...matches].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setLastMatches(sorted.slice(0, 3));
      }
    } catch {}

    (async () => {
      try {
        const sessions = await getMyActiveSessions();
        if (sessions && sessions.length > 0) setActiveOnline(sessions[0]);
      } catch {}
    })();
  }, []);

  // ★ Tour başlarken "Hoş Geldin" kartını otomatik kapat —
  // aksi halde tour tooltip'i welcome card'la çakışıyor (acemi görünüm)
  useEffect(() => {
    const onTourStart = () => {
      setWelcomeDismissed(true);
      // NOT: localStorage'a yazmıyoruz — tour bitince kullanıcı isterse
      // welcome card'ı tekrar görebilsin (sadece geçici gizleme)
    };
    window.addEventListener("halisaha:start-tour", onTourStart);
    return () => window.removeEventListener("halisaha:start-tour", onTourStart);
  }, []);

  const handleSelect = (m) => { hapticMedium(); onSelectMode?.(m.key); };
  const handleResumeOnline = () => { hapticMedium(); onSelectMode?.("online"); };
  const handleSaveNickname = async (newName) => {
    const clean = (newName || "").trim();
    if (!clean) return;
    setNickname(clean);
    setLocalNickname(clean);
    try { await registerDevice(clean); } catch {}
    hapticSuccess();
    setShowRename(false);
  };

  const proLabel = isTrial ? `TRIAL · ${daysLeft}G` : "PRO";

  return (
    <>
      <style>{cssAnims}</style>
      <PitchAtmosphere />

      <div style={S.root}>
        {/* ═══ HEADER ═══ */}
        <header style={S.header}>
          <button
            onClick={() => {
              hapticLight();
              if (isPremium) {
                openPaywall("manage");
              } else {
                setShowRename(true);
              }
            }}
            style={{
              ...S.userPill,
              ...(isPremium ? {
                borderColor: `${C.gold}66`,
                background: `linear-gradient(135deg, ${C.gold}14, ${C.gold}04)`,
                boxShadow: `0 0 14px ${C.gold}22`,
              } : {}),
            }}
            aria-label={isPremium ? "Aboneliği yönet" : "İsmi düzenle"}
          >
            {nickname ? (
              <>
                <span style={{
                  ...S.userAvatar,
                  ...(isPremium ? {
                    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`,
                    color: "#0a0805",
                    boxShadow: `0 0 10px ${C.gold}55`,
                  } : {}),
                }}>
                  {nickname[0].toUpperCase()}
                </span>
                <span style={{
                  ...S.userName,
                  ...(isPremium ? { color: C.gold } : {}),
                }}>
                  {nickname}
                </span>
                {isPremium ? (
                  <span style={S.userProBadge}>{proLabel}</span>
                ) : (
                  <span style={S.userPillEdit}>›</span>
                )}
              </>
            ) : (
              <>
                <span style={{ ...S.userAvatar, background: "rgba(255,255,255,0.05)", color: C.inkFaint }}>?</span>
                <span style={{ ...S.userName, color: C.inkFaint }}>İsim belirle</span>
                <span style={S.userPillEdit}>›</span>
              </>
            )}
          </button>
          <button
            onClick={() => { hapticLight(); onOpenSettings?.(); }}
            style={S.settingsBtn}
            aria-label="Ayarlar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </header>

        {/* ═══ AKTİF MAÇ ŞERİDİ ═══ */}
        {activeOnline && (
          <button onClick={handleResumeOnline} style={S.activeBanner}>
            <span style={S.liveDot} />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={S.activeTitle}>
                {activeOnline.field_name || "Online Maç"} · DEVAM EDİYOR
              </div>
              <div style={S.activeSub}>
                {activeOnline.team_a_name} {activeOnline.score_a ?? 0}–
                {activeOnline.score_b ?? 0} {activeOnline.team_b_name}
                {" · "}
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: C.blue }}>
                  {activeOnline.join_code}
                </span>
              </div>
            </div>
            <span style={S.activeArrow}>›</span>
          </button>
        )}

        {/* ═══ HERO ═══ */}
        <section style={S.hero}>
          <div style={S.logoWrap}>
            <div style={S.logoHalo} />
            <img src={logo} alt="HalıSaha-Kolik" style={S.logo} />
          </div>

          <div style={S.heroEyebrow}>
            <span style={S.eyebrowDash} />
            <span>· PROFESSIONAL · </span>
            <span style={S.eyebrowDash} />
          </div>

          <h1 style={S.brandTitle}>
            HALI<wbr/>SAHA<span style={S.brandTitleAccent}>·</span>KOLİK
          </h1>

          {/* ═══ STAT BLOCK — editorial cluster ═══ */}
          {stats && stats.matches > 0 && (
            <div style={S.statBlock}>
              <StatCell label="MAÇ"       value={stats.matches} />
              <span style={S.statDivider} />
              <StatCell label="GOL"       value={stats.goals}   accent={C.primary} />
              <span style={S.statDivider} />
              <StatCell label="ASİST"     value={stats.assists} accent={C.blue} />
              <span style={S.statDivider} />
              <StatCell label="GALİBİYET" value={stats.wins}    accent={C.gold} />
            </div>
          )}

        </section>

        {/* ═══ PLANIM kaldırıldı — artık ⚙️ Ayarlar > Plan & Üyelik üzerinden erişiliyor ═══ */}

        {/* ═══ EMPTY STATE — ilk kez giren kullanıcı için 3-adımlık onboarding ═══ */}
        {/* Dismiss edilmediyse VE hiç veri yoksa göster */}
        {!welcomeDismissed && stats === null && lastMatches.length === 0 && !activeOnline && (
          <EmptyStateWelcome
            onQuickStart={() => { hapticMedium(); onSelectMode?.("match"); }}
            onMyTeam={() => { hapticLight(); onSelectMode?.("myteam"); }}
            onDismiss={dismissWelcome}
          />
        )}

        {/* ═══ MODES ═══ */}
        <section style={S.modesWrap}>
          <div style={S.sectionHeader}>
            <span style={S.sectionDash} />
            <span style={S.sectionLabel}>OYUN MODLARI</span>
            <span style={S.sectionDashFlex} />
            <span style={S.sectionCount}>
              {String(modes.length).padStart(2, "0")}
            </span>
          </div>
          <div style={S.modes}>
            {modes.map((m, i) => {
              // Online mod kartı — Free kullanıcı 1 hayatta-bir hakkını kullandıysa lock göster
              // Pro/Trial veya henüz hakkı varsa normal render → ilk deneyim ücretsiz kalsın
              const isOnlineExhausted =
                m.key === "online" &&
                !isPremium &&
                !canCreateOnlineMatch().allowed;

              const card = (
                <ModeCard
                  mode={m}
                  delay={0.16 + i * 0.07}
                  onSelect={() => handleSelect(m)}
                />
              );

              return isOnlineExhausted ? (
                <LockedPreview
                  key={m.key}
                  feature="unlimited_online"
                  blur="soft"
                  title="1 hakkını kullandın"
                  subtitle="Pro ile sınırsız oda kur · Sınırsız maça katıl"
                  ctaLabel="Pro'ya Geç"
                  style={{ borderRadius: 16 }}
                >
                  {card}
                </LockedPreview>
              ) : (
                <React.Fragment key={m.key}>{card}</React.Fragment>
              );
            })}
          </div>
        </section>

        {/* ═══ RECENT ═══ */}
        {lastMatches.length > 0 && (
          <section style={S.recentSection}>
            <div style={S.sectionHeader}>
              <span style={S.sectionDash} />
              <span style={S.sectionLabel}>SON MAÇLAR</span>
              <span style={S.sectionDashFlex} />
              <button
                onClick={() => { hapticLight(); onSelectMode?.("history"); }}
                style={S.recentMoreBtn}
              >
                TÜMÜ ›
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

        {/* ═══ FOOTER ═══ */}
        <footer style={S.footer}>
          <span style={S.footerDot} />
          <span style={S.footerText}>HALISAHA-KOLIK · © 2026</span>
          <span style={S.footerDot} />
        </footer>

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
// EMPTY STATE WELCOME — yeni kullanıcı, 3 adımlık intro
// ═══════════════════════════════════════════════════════════
// stats === null && lastMatches.length === 0 && !activeOnline iken render edilir
// Amaç: kullanıcıyı ilk maça götürmek (D1 retention için kritik)
function EmptyStateWelcome({ onQuickStart, onMyTeam, onDismiss }) {
  const steps = [
    { n: "01", title: "Takımını oluştur", sub: "Oyuncuları ekle, formayı seç" },
    { n: "02", title: "Maçı başlat",      sub: "Saha üzerinde sürükle-bırak" },
    { n: "03", title: "İstatistiği gör",  sub: "Gol, asist, MVP — her şey kayıt" },
  ];

  return (
    <section style={ES.wrap}>
      {/* Sol kenar şerit — diğer kartlarla görsel tutarlılık */}
      <span aria-hidden style={ES.rib} />

      {/* ★ Kapatma butonu — sağ üst köşe; 36x36 touch target, kalın ×, iOS-safe */}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          onTouchEnd={(e) => {
            // iOS WebView fallback — bazen click fire etmiyor
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Hoş geldin mesajını kapat"
          style={ES.closeBtn}
        >
          <span style={ES.closeBtnGlyph}>×</span>
        </button>
      )}

      {/* Üst aksanlı çubuk */}
      <div style={ES.eyebrow}>
        <span style={ES.eyebrowDot} />
        <span style={ES.eyebrowText}>HOŞ GELDİN</span>
        <span style={ES.eyebrowFlexLine} />
      </div>

      {/* Ana başlık */}
      <h2 style={ES.title}>
        İlk maçını kuralım
      </h2>
      <p style={ES.sub}>
        3 adımda kaptanın olabilirsin. Tüm verilerin telefonunda kalır.
      </p>

      {/* 3 adım listesi */}
      <div style={ES.stepList}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ ...ES.stepRow, animationDelay: `${0.08 + i * 0.06}s` }}>
            <span style={ES.stepNum}>{s.n}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={ES.stepTitle}>{s.title}</div>
              <div style={ES.stepSub}>{s.sub}</div>
            </div>
            <span style={ES.stepArrow}>›</span>
          </div>
        ))}
      </div>

      {/* CTA — birincil ve ikincil */}
      <div style={ES.ctaRow}>
        <button onClick={onQuickStart} style={ES.ctaPrimary}>
          <span style={ES.ctaPrimaryIcon}>▶</span>
          <span>Hemen Başla</span>
        </button>
        <button onClick={onMyTeam} style={ES.ctaSecondary}>
          Önce Takım Kur
        </button>
      </div>

      {/* Microcopy — güven inşası */}
      <div style={ES.trust}>
        <span style={ES.trustDot} />
        <span>Kayıt gerekmez · İnternet zorunlu değil · Tamamen ücretsiz başla</span>
      </div>
    </section>
  );
}

// EmptyState style'ları — diğerlerinden ayrı tutuyoruz, kolay maintain
const ES = {
  wrap: {
    position: "relative",
    padding: "18px 18px 16px 22px",
    background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(13,22,32,0.85) 60%, rgba(96,165,250,0.04) 100%)",
    border: "1px solid rgba(16,185,129,0.18)",
    borderRadius: 16,
    marginBottom: 18,
    overflow: "hidden",
    animation: "msCardIn 0.55s cubic-bezier(.2,.85,.3,1) both",
    boxShadow: "0 14px 36px rgba(0,0,0,0.45), 0 0 28px rgba(16,185,129,0.08)",
  },
  rib: {
    position: "absolute",
    left: 0,
    top: "16%",
    bottom: "16%",
    width: 3,
    background: "linear-gradient(180deg, #10b981, #34d39955 50%, #10b981)",
    boxShadow: "0 0 14px #10b98188",
    borderRadius: "0 2px 2px 0",
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    color: "rgba(244,244,245,0.85)",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.18s ease",
    zIndex: 10,
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    // iOS WebView'da default button styling'i bastır
    appearance: "none",
    WebkitAppearance: "none",
  },
  closeBtnGlyph: {
    fontSize: 22,
    lineHeight: 1,
    fontWeight: 300,
    color: "inherit",
    pointerEvents: "none", // glyph üstüne tıklasa bile event button'a gitsin
    marginTop: -3,         // × glyph optik olarak biraz aşağıda görünüyor — yukarı çek
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  eyebrow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#10b981",
    boxShadow: "0 0 8px #10b981",
  },
  eyebrowText: {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 2.4,
    color: "#10b981",
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },
  eyebrowFlexLine: {
    flex: 1,
    height: 1,
    background: "rgba(16,185,129,0.18)",
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    color: "#f4f4f5",
    letterSpacing: -0.4,
    lineHeight: 1.05,
    fontFamily: "'Bebas Neue','Oswald','Inter Tight',sans-serif",
  },
  sub: {
    margin: "6px 0 14px",
    fontSize: 13,
    color: "rgba(244,244,245,0.6)",
    lineHeight: 1.5,
  },
  stepList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 14,
  },
  stepRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 11px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 10,
    animation: "msCardIn 0.45s cubic-bezier(.2,.85,.3,1) both",
  },
  stepNum: {
    fontSize: 14,
    fontWeight: 900,
    color: "#10b981",
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    letterSpacing: 0.5,
    width: 22,
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "#f4f4f5",
    letterSpacing: 0.1,
    lineHeight: 1.2,
  },
  stepSub: {
    fontSize: 11,
    color: "rgba(244,244,245,0.45)",
    marginTop: 1,
    lineHeight: 1.3,
  },
  stepArrow: {
    fontSize: 16,
    color: "rgba(244,244,245,0.25)",
    flexShrink: 0,
  },
  ctaRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    marginBottom: 10,
  },
  ctaPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #10b981, #059669)",
    color: "#0a1410",
    border: "none",
    borderRadius: 11,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.3,
    fontFamily: "inherit",
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(16,185,129,0.30), inset 0 1px 0 rgba(255,255,255,0.18)",
    textTransform: "uppercase",
  },
  ctaPrimaryIcon: {
    fontSize: 10,
    lineHeight: 1,
  },
  ctaSecondary: {
    padding: "12px 14px",
    background: "rgba(255,255,255,0.03)",
    color: "rgba(244,244,245,0.85)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 11,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  trust: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    color: "rgba(244,244,245,0.4)",
    fontWeight: 500,
    paddingTop: 4,
  },
  trustDot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: "#10b981",
    boxShadow: "0 0 6px #10b981",
    flexShrink: 0,
  },
};

// ═══════════════════════════════════════════════════════════
// STAT CELL — editorial number display
// ═══════════════════════════════════════════════════════════
function StatCell({ label, value, accent }) {
  return (
    <div style={S.statCell}>
      <div style={{ ...S.statValue, color: accent || C.ink }}>
        {String(value).padStart(2, "0")}
      </div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODE CARD — mini SVG illüstrasyonlu premium kart
// ═══════════════════════════════════════════════════════════
function ModeCard({ mode, onSelect, delay }) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onSelect}
      data-tour={`mode-${mode.key}`}
      onTouchStart={() => { setPressed(true); hapticSelection(); }}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        ...S.modeCard,
        animationDelay: `${delay}s`,
        transform: pressed ? "scale(0.985)" : "scale(1)",
        borderColor: pressed ? `${mode.accent}88` : C.line,
        boxShadow: mode.premium
          ? `0 14px 36px rgba(0,0,0,0.55), inset 0 0 0 1px ${C.gold}33`
          : "0 10px 26px rgba(0,0,0,0.45)",
      }}
    >
      {/* Sol şerit */}
      <span style={{
        ...S.modeRib,
        background: `linear-gradient(180deg, ${mode.accent}, ${mode.accent}55 50%, ${mode.accent})`,
        boxShadow: `0 0 10px ${mode.accent}66`,
      }} />

      {/* Premium altın çerçeve */}
      {mode.premium && (
        <span aria-hidden style={S.modeGoldFrame} />
      )}

      {/* Mini SVG illüstrasyon */}
      <div style={{
        ...S.modeIllusFrame,
        borderColor: `${mode.accent}33`,
        background: `${mode.accent}08`,
      }}>
        <ModeThumb kind={mode.kind} accent={mode.accent} />
      </div>

      {/* Body */}
      <div style={S.modeBody}>
        <div style={S.modeHeader}>
          <span style={S.modeTitle}>{mode.title}</span>
          {mode.badge && (
            <span style={{
              ...S.modeBadge,
              color: mode.badge.color,
              borderColor: `${mode.badge.color}55`,
              background: `${mode.badge.color}14`,
            }}>
              {mode.badge.pulse && <span style={S.badgePulseDot} />}
              {mode.badge.label}
            </span>
          )}
          {mode.premium && (
            <span style={S.modeProBadge}>★ PRO</span>
          )}
        </div>
        <div style={S.modeSub}>{mode.sub}</div>
        <div style={{ ...S.modeDetail, color: `${mode.accent}c0` }}>{mode.detail}</div>
      </div>

      <span style={{ ...S.modeChevron, color: mode.accent }}>›</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// MODE THUMBNAIL — her kart için mini SVG illüstrasyon
// ═══════════════════════════════════════════════════════════
function ModeThumb({ kind, accent }) {
  if (kind === "single-pitch") {
    return (
      <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden>
        <rect x="6" y="6" width="48" height="48" rx="6" fill="none" stroke={`${accent}55`} strokeWidth="1" />
        <line x1="6" y1="30" x2="54" y2="30" stroke={`${accent}33`} strokeDasharray="2 2" strokeWidth="0.6" />
        <circle cx="30" cy="30" r="6" stroke={`${accent}33`} fill="none" strokeWidth="0.6" />
        {[[16,46],[30,46],[44,46],[20,30],[40,30],[30,16]].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r="2.2" fill={accent}>
            <animate attributeName="opacity" values="0.55;1;0.55" dur={`${2 + i*0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
    );
  }

  if (kind === "vs-pitch") {
    return (
      <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden>
        <rect x="6" y="6" width="48" height="48" rx="6" fill="none" stroke={`${accent}55`} strokeWidth="1" />
        <line x1="30" y1="6" x2="30" y2="54" stroke={`${accent}55`} strokeDasharray="2 2" strokeWidth="0.6" />
        <circle cx="30" cy="30" r="5" stroke={`${accent}55`} fill="none" strokeWidth="0.6" />
        {[[12,30],[20,18],[20,42]].map(([x,y],i) => (
          <circle key={`L${i}`} cx={x} cy={y} r="2" fill={accent} />
        ))}
        {[[48,30],[40,18],[40,42]].map(([x,y],i) => (
          <circle key={`R${i}`} cx={x} cy={y} r="2" fill="#f87171" />
        ))}
        <text x="30" y="33" textAnchor="middle" fontSize="6" fontWeight="800" fill={accent} fontFamily="'DM Sans',sans-serif">vs</text>
      </svg>
    );
  }

  if (kind === "connected-phones") {
    return (
      <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden>
        <rect x="8" y="14" width="16" height="32" rx="3" fill={`${accent}10`} stroke={accent} strokeWidth="1" />
        <rect x="10" y="16" width="12" height="28" rx="2" fill="none" stroke={`${accent}55`} strokeWidth="0.5" />
        <circle cx="16" cy="20" r="0.8" fill={accent} />
        <rect x="36" y="14" width="16" height="32" rx="3" fill={`${accent}10`} stroke={accent} strokeWidth="1" />
        <rect x="38" y="16" width="12" height="28" rx="2" fill="none" stroke={`${accent}55`} strokeWidth="0.5" />
        <circle cx="44" cy="20" r="0.8" fill={accent} />
        <path d="M 24 26 Q 30 22 36 26" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.55">
          <animate attributeName="opacity" values="0.25;0.85;0.25" dur="1.8s" repeatCount="indefinite" />
        </path>
        <path d="M 24 30 Q 30 24 36 30" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.4">
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.8s" begin="0.2s" repeatCount="indefinite" />
        </path>
        <path d="M 24 34 Q 30 26 36 34" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.25">
          <animate attributeName="opacity" values="0.05;0.5;0.05" dur="1.8s" begin="0.4s" repeatCount="indefinite" />
        </path>
        <circle cx="30" cy="46" r="1.5" fill="#ef4444">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }

  if (kind === "scoreboard") {
    return (
      <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden>
        <rect x="6" y="14" width="48" height="32" rx="4" fill={`${accent}08`} stroke={`${accent}55`} strokeWidth="1" />
        <circle cx="14" cy="30" r="4" fill={`${accent}30`} stroke={accent} strokeWidth="0.8" />
        <text x="14" y="32" textAnchor="middle" fontSize="4.5" fontWeight="800" fill={accent} fontFamily="'DM Sans',sans-serif">A</text>
        <text x="24" y="34" fontSize="13" fontWeight="800" fill={accent} fontFamily="'Bebas Neue','Inter Tight',sans-serif" textAnchor="middle">3</text>
        <text x="30" y="32" fontSize="8" fontWeight="700" fill={`${accent}88`} fontFamily="'Bebas Neue',sans-serif" textAnchor="middle">:</text>
        <text x="36" y="34" fontSize="13" fontWeight="800" fill={C.inkDim} fontFamily="'Bebas Neue','Inter Tight',sans-serif" textAnchor="middle">2</text>
        <circle cx="46" cy="30" r="4" fill="rgba(248,113,113,0.18)" stroke="#f87171" strokeWidth="0.8" />
        <text x="46" y="32" textAnchor="middle" fontSize="4.5" fontWeight="800" fill="#f87171" fontFamily="'DM Sans',sans-serif">B</text>
        <line x1="10" y1="42" x2="22" y2="42" stroke={`${accent}55`} strokeWidth="0.8" />
        <line x1="38" y1="42" x2="50" y2="42" stroke={`${accent}33`} strokeWidth="0.8" />
      </svg>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// PLAN CARD — abonelik durumu (Free / Pro / Trial / Team)
// ═══════════════════════════════════════════════════════════
function PlanCard({ isPremium, isTrial, daysLeft, onOpen }) {
  // Plan etiketi & alt başlık
  const planLabel = isTrial ? "TRIAL" : isPremium ? "PRO" : "FREE";
  const planSub = isTrial
    ? `${daysLeft} GÜN KALDI`
    : isPremium
      ? "PREMIUM · AKTİF"
      : "STANDART · LİMİTLİ";

  // Aksan rengi: gold = pro/trial, primary = free
  const accent = isPremium ? C.gold : C.primary;
  const accentDim = isPremium ? C.goldDim : C.primaryDim;

  // Özellik listesi
  const benefits = isPremium
    ? [
        { ok: true,  text: "Sınırsız maç oynama" },
        { ok: true,  text: "Online halı saha modu" },
        { ok: true,  text: "Reklamsız deneyim" },
        { ok: true,  text: "Tüm premium özellikler" },
      ]
    : [
        { ok: false, text: "2 maç / gün limit" },
        { ok: false, text: "Online mod kilitli" },
        { ok: false, text: "Reklam görüntülenir" },
        { ok: false, text: "Premium istatistikler yok" },
      ];

  // CTA metni
  const ctaText = isPremium
    ? "ABONELİĞİ YÖNET"
    : "PRO'YA YÜKSELT";
  const ctaBadge = isPremium ? null : "7 GÜN ÜCRETSİZ";

  return (
    <div style={{
      ...S.planCard,
      borderColor: `${accent}33`,
      boxShadow: isPremium
        ? `0 18px 44px rgba(0,0,0,0.55), inset 0 0 0 1px ${accent}33, 0 0 0 1px ${accent}22`
        : "0 12px 30px rgba(0,0,0,0.45)",
    }}>
      {/* Sol kenar şerit */}
      <span style={{
        ...S.planRib,
        background: `linear-gradient(180deg, ${accent}, ${accent}55 50%, ${accent})`,
        boxShadow: `0 0 12px ${accent}88`,
      }} />

      {/* Premium altın halo */}
      {isPremium && (
        <span aria-hidden style={{
          ...S.planGoldGlow,
          background: `radial-gradient(ellipse 60% 100% at 10% 0%, ${accent}1a, transparent 65%)`,
        }} />
      )}

      {/* HEADER — büyük etiket + alt başlık */}
      <div style={S.planHeader}>
        <div style={S.planHeaderLeft}>
          <div style={{
            ...S.planBadgeWrap,
            borderColor: `${accent}55`,
            background: `${accent}10`,
          }}>
            {isPremium && <span style={{ ...S.planStar, color: accent }}>★</span>}
            <span style={{ ...S.planBadgeText, color: accent }}>{planLabel}</span>
          </div>
          <div style={{ ...S.planSubLabel, color: C.inkDim }}>
            {planSub}
          </div>
        </div>

        {/* Sağ üst — mini status indicator */}
        <div style={S.planStatusRight}>
          <span style={{
            ...S.planMiniDot,
            background: isPremium ? accent : C.inkFaint,
            boxShadow: isPremium ? `0 0 8px ${accent}` : "none",
          }} />
          <span style={{
            ...S.planStatusText,
            color: isPremium ? accent : C.inkFaint,
          }}>
            {isPremium ? "ACTIVE" : "BASIC"}
          </span>
        </div>
      </div>

      {/* DIVIDER */}
      <span style={S.planDivider} />

      {/* BENEFITS — checkmark veya x */}
      <div style={S.planBenefits}>
        {benefits.map((b, i) => (
          <div key={i} style={S.planBenefitRow}>
            <span style={{
              ...S.planBenefitIcon,
              color: b.ok ? accent : C.inkGhost,
              borderColor: b.ok ? `${accent}55` : C.line,
              background: b.ok ? `${accent}14` : "transparent",
            }}>
              {b.ok ? "✓" : "×"}
            </span>
            <span style={{
              ...S.planBenefitText,
              color: b.ok ? C.ink : C.inkDim,
              textDecoration: b.ok ? "none" : "none",
            }}>
              {b.text}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onOpen}
        style={{
          ...S.planCta,
          background: isPremium
            ? "rgba(255,255,255,0.04)"
            : `linear-gradient(135deg, ${accent}, ${accentDim})`,
          color: isPremium ? accent : "#0a1410",
          border: isPremium ? `1px solid ${accent}55` : "none",
          boxShadow: isPremium
            ? "none"
            : `0 10px 26px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.3)`,
        }}
      >
        <span style={S.planCtaText}>{ctaText}</span>
        {ctaBadge && (
          <span style={{
            ...S.planCtaBadge,
            background: "#0a1410",
            color: accent,
          }}>
            {ctaBadge}
          </span>
        )}
        <span style={{ fontSize: 16, marginLeft: "auto", opacity: 0.85 }}>→</span>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RECENT MATCH CARD
// ═══════════════════════════════════════════════════════════
function formatRelativeDate(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "BUGÜN";
  if (days === 1) return "DÜN";
  if (days < 7) return `${days}G ÖNCE`;
  if (days < 30) return `${Math.floor(days / 7)}H ÖNCE`;
  const d = new Date(ts);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function RecentMatchCard({ match, onClick }) {
  const a = match.teamA || {};
  const b = match.teamB || {};
  const aWin = (match.scoreA || 0) > (match.scoreB || 0);
  const bWin = (match.scoreB || 0) > (match.scoreA || 0);
  const draw = !aWin && !bWin;
  const colA = a.color?.secondary || C.primary;
  const colB = b.color?.secondary || C.red;

  return (
    <button onClick={onClick} style={S.recentCard}>
      <span style={{
        width: 3, alignSelf: "stretch", borderRadius: 1.5,
        background: `linear-gradient(180deg, ${colA}, ${colB})`,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.recentRow}>
          <span style={{ ...S.recentTeamName, color: aWin ? C.ink : C.inkDim }}>
            {a.name || "Takım A"}
          </span>
          <span style={{ ...S.recentScore, color: aWin ? colA : draw ? C.ink : C.inkGhost }}>
            {match.scoreA ?? 0}
          </span>
        </div>
        <div style={S.recentRow}>
          <span style={{ ...S.recentTeamName, color: bWin ? C.ink : C.inkDim }}>
            {b.name || "Takım B"}
          </span>
          <span style={{ ...S.recentScore, color: bWin ? colB : draw ? C.ink : C.inkGhost }}>
            {match.scoreB ?? 0}
          </span>
        </div>
      </div>
      <div style={S.recentDate}>{formatRelativeDate(match.createdAt)}</div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// PITCH ATMOSPHERE — Onboarding ile aynı subtle saha çizgileri
// ═══════════════════════════════════════════════════════════
function PitchAtmosphere() {
  return (
    <div style={S.atmosphere} aria-hidden>
      <div style={S.haloTop} />
      <div style={S.haloBottom} />
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
        style={S.chalkSvg}
      >
        <defs>
          <linearGradient id="ms-chalk-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <mask id="ms-chalk-mask">
            <rect width="400" height="800" fill="url(#ms-chalk-fade)" />
          </mask>
        </defs>
        <g mask="url(#ms-chalk-mask)" stroke="#ffffff" strokeWidth="0.6" fill="none" opacity="0.35">
          <circle cx="200" cy="400" r="70" />
          <line x1="0" y1="400" x2="400" y2="400" />
          <rect x="100" y="100" width="200" height="80" />
          <rect x="100" y="620" width="200" height="80" />
          <circle cx="200" cy="400" r="2" fill="#ffffff" />
        </g>
      </svg>
      <div style={S.vignette} />
    </div>
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
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    hideBanner().catch(() => {});
    return () => {
      clearTimeout(timer);
      showBanner().catch(() => {});
    };
  }, []);

  const handleSave = () => {
    const clean = draft.trim();
    if (!clean || clean.length < 2) {
      setShake(true);
      hapticMedium();
      setTimeout(() => setShake(false), 500);
      return;
    }
    onSave(clean);
  };

  return (
    <div style={S.modalBackdrop} onClick={onClose}>
      <div
        style={{
          ...S.modalSheet,
          animation: shake ? "rmShake 0.45s" : "rmIn 0.32s cubic-bezier(.2,.85,.3,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} style={S.modalClose} aria-label="Kapat">×</button>

        <div style={S.modalEyebrow}>
          <span style={S.eyebrowDash} />
          <span>OYUNCU KİMLİĞİ</span>
          <span style={S.eyebrowDash} />
        </div>

        <h2 style={S.modalTitle}>İSMİNİ BELİRLE</h2>
        <p style={S.modalSub}>
          Bu isim arkadaşların online maçlarda seni gördüğünde gözükür.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 20))}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="Ahmet Y."
          maxLength={20}
          style={S.modalInput}
        />

        <div style={S.modalCharCount}>
          {draft.length} / 20
        </div>

        <button onClick={handleSave} style={S.modalSaveBtn}>
          <span>KAYDET</span>
          <span style={{ fontSize: 15 }}>→</span>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const S = {
  root: {
    position: "relative",
    zIndex: 2,
    minHeight: "100%",
    width: "100%",
    maxWidth: "100vw",
    paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
    paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
    paddingLeft: 18,
    paddingRight: 18,
    color: C.ink,
    fontFamily: "'DM Sans','Inter','Segoe UI',sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    overflowX: "hidden",
  },

  atmosphere: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    pointerEvents: "none",
    background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgDeep} 100%)`,
    overflow: "hidden",
    maxWidth: 480,
    margin: "0 auto",
  },
  haloTop: {
    position: "absolute",
    top: "-15%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "120%",
    height: "55%",
    background: `radial-gradient(ellipse 70% 100% at 50% 0%, ${C.primary}1a, transparent 60%)`,
    pointerEvents: "none",
  },
  haloBottom: {
    position: "absolute",
    bottom: "-10%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "120%",
    height: "40%",
    background: `radial-gradient(ellipse 70% 100% at 50% 100%, ${C.gold}10, transparent 65%)`,
    pointerEvents: "none",
  },
  chalkSvg: {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    opacity: 0.07,
    pointerEvents: "none",
  },
  vignette: {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    background: "radial-gradient(ellipse 100% 80% at 50% 50%, transparent 30%, rgba(0,0,0,0.5) 100%)",
    pointerEvents: "none",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  userPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 11px 5px 5px",
    background: "rgba(255,255,255,0.025)",
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    color: C.ink,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    transition: "all 0.2s ease",
    maxWidth: "60%",
    minWidth: 0,
    overflow: "hidden",
  },
  userAvatar: {
    width: 24, height: 24,
    borderRadius: "50%",
    background: `${C.primary}30`,
    color: C.primary,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800,
    fontSize: 11.5,
    fontFamily: "'DM Sans',sans-serif",
    flexShrink: 0,
  },
  userName: {
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  userPillEdit: {
    color: C.inkFaint,
    fontSize: 14,
    marginLeft: 2,
  },
  userProBadge: {
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: "#0a0805",
    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`,
    padding: "2px 6px",
    borderRadius: 4,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },

  // ⚙️ Settings button — header sağ üst, dairesel ikon buton
  settingsBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    padding: 0,
    background: "rgba(255,255,255,0.025)",
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    color: C.inkDim,
    cursor: "pointer",
    fontFamily: "inherit",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    transition: "all 0.18s ease",
    flexShrink: 0,
  },

  activeBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    background: `linear-gradient(135deg, ${C.blue}0d, ${C.blue}03)`,
    border: `1px solid ${C.blue}55`,
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    color: C.ink,
    boxShadow: `0 6px 20px ${C.blue}1a`,
    animation: "msFadeIn 0.4s ease",
  },
  liveDot: {
    width: 8, height: 8,
    borderRadius: "50%",
    background: C.red,
    boxShadow: `0 0 10px ${C.red}`,
    animation: "msLiveBlink 1.4s infinite",
    flexShrink: 0,
  },
  activeTitle: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 1.4,
    color: C.blue,
    marginBottom: 2,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },
  activeSub: {
    fontSize: 12,
    fontWeight: 600,
    color: C.inkDim,
  },
  activeArrow: {
    color: C.blue,
    fontSize: 22,
    fontWeight: 800,
    flexShrink: 0,
  },

  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  logoWrap: {
    position: "relative",
    width: 80,
    height: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  logoHalo: {
    position: "absolute",
    top: "-15%", right: "-15%", bottom: "-15%", left: "-15%",
    borderRadius: "50%",
    background: `radial-gradient(circle, ${C.primary}33 0%, transparent 65%)`,
    filter: "blur(8px)",
    animation: "msHalo 4s ease-in-out infinite",
  },
  logo: {
    position: "relative",
    width: 80,
    height: 80,
    borderRadius: 20,
    objectFit: "cover",
    boxShadow: `0 14px 36px ${C.primary}44, inset 0 1px 0 rgba(255,255,255,0.18)`,
  },
  heroEyebrow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 2.4,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    textTransform: "uppercase",
    color: C.primary,
  },
  eyebrowDash: {
    width: 16,
    height: 1,
    background: C.primary,
    opacity: 0.7,
  },
  brandTitle: {
    fontFamily: "'Bebas Neue','Oswald','Inter Tight',sans-serif",
    fontSize: "clamp(28px, 9vw, 42px)",
    fontWeight: 400,
    lineHeight: 0.95,
    letterSpacing: 1.2,
    margin: 0,
    color: C.ink,
    textTransform: "uppercase",
    textShadow: "0 1px 0 rgba(0,0,0,0.5)",
    textAlign: "center",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    overflow: "hidden",
  },
  brandTitleAccent: {
    color: C.primary,
    margin: "0 4px",
    textShadow: `0 0 14px ${C.primary}aa`,
  },

  statBlock: {
    display: "inline-flex",
    alignItems: "stretch",
    gap: 0,
    padding: "10px 4px",
    background: "rgba(255,255,255,0.025)",
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    marginTop: 4,
    maxWidth: "100%",
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  statCell: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 14px",
    minWidth: 56,
  },
  statValue: {
    fontFamily: "'Bebas Neue','Inter Tight',sans-serif",
    fontSize: 22,
    fontWeight: 400,
    letterSpacing: 0.5,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 1.6,
    color: C.inkFaint,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },
  statDivider: {
    width: 1,
    background: C.line,
    alignSelf: "stretch",
  },

  // ─── Planım section ───
  planSection: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    width: "100%",
  },
  planStatusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
  planCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: "14px 16px 14px 18px",
    background: `linear-gradient(135deg, ${C.surface}, ${C.surfaceHi})`,
    border: "1px solid",
    borderRadius: 14,
    overflow: "hidden",
    animation: "msCardIn 0.5s cubic-bezier(.2,.85,.3,1) both",
  },
  planRib: {
    position: "absolute",
    left: 0,
    top: "18%",
    bottom: "18%",
    width: 3,
    borderRadius: "0 2px 2px 0",
  },
  planGoldGlow: {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    pointerEvents: "none",
  },
  planHeader: {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  planHeaderLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    minWidth: 0,
  },
  planBadgeWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 11px",
    border: "1px solid",
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  planStar: {
    fontSize: 12,
    textShadow: "0 0 5px currentColor",
  },
  planBadgeText: {
    fontFamily: "'Bebas Neue','Oswald','Inter Tight',sans-serif",
    fontSize: 18,
    fontWeight: 400,
    letterSpacing: 1.4,
    lineHeight: 1,
  },
  planSubLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    textTransform: "uppercase",
  },
  planStatusRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  planMiniDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
  },
  planStatusText: {
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: 2,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },
  planDivider: {
    display: "block",
    height: 1,
    background: C.line,
    marginBottom: 12,
  },
  planBenefits: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    marginBottom: 14,
  },
  planBenefitRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
  },
  planBenefitIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 800,
    fontFamily: "'DM Sans',sans-serif",
    flexShrink: 0,
  },
  planBenefitText: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.1,
  },
  planCta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 11,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "transform 0.15s ease, box-shadow 0.2s ease",
  },
  planCtaText: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.3,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    textTransform: "uppercase",
  },
  planCtaBadge: {
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: 1.3,
    padding: "2px 7px",
    borderRadius: 3,
    fontFamily: "'JetBrains Mono',monospace",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionDash: {
    width: 18,
    height: 1,
    background: C.primary,
    opacity: 0.6,
  },
  sectionDashFlex: {
    flex: 1,
    height: 1,
    background: C.line,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2.4,
    color: C.primary,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: C.inkFaint,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    fontVariantNumeric: "tabular-nums",
  },

  modesWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  modes: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  modeCard: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "12px 14px",
    background: `linear-gradient(135deg, ${C.surface}, ${C.surfaceHi})`,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    color: C.ink,
    textAlign: "left",
    animation: "msCardIn 0.55s cubic-bezier(.2,.85,.3,1) both",
    transition: "transform 0.15s ease, border-color 0.2s ease, box-shadow 0.2s ease",
    overflow: "hidden",
  },
  modeRib: {
    position: "absolute",
    left: 0,
    top: "20%",
    bottom: "20%",
    width: 3,
    borderRadius: "0 2px 2px 0",
  },
  modeGoldFrame: {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    borderRadius: 14,
    border: `1px solid ${C.gold}55`,
    pointerEvents: "none",
    boxShadow: `inset 0 0 14px ${C.gold}14`,
  },
  modeIllusFrame: {
    width: 52,
    height: 52,
    borderRadius: 11,
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modeBody: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  modeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  modeTitle: {
    fontSize: 14.5,
    fontWeight: 800,
    color: C.ink,
    letterSpacing: 0.2,
    fontFamily: "'DM Sans',sans-serif",
  },
  modeBadge: {
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: 1.3,
    padding: "2px 6px",
    borderRadius: 4,
    border: "1px solid",
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  badgePulseDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: C.red,
    boxShadow: `0 0 6px ${C.red}`,
    animation: "msLiveBlink 1.4s infinite",
  },
  modeProBadge: {
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: 1.4,
    color: "#0a0805",
    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`,
    padding: "2px 6px",
    borderRadius: 4,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },
  modeSub: {
    fontSize: 11.5,
    lineHeight: 1.4,
    color: C.inkDim,
    fontWeight: 400,
  },
  modeDetail: {
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 1.6,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    marginTop: 2,
  },
  modeChevron: {
    fontSize: 26,
    fontWeight: 200,
    flexShrink: 0,
    opacity: 0.7,
    fontFamily: "'DM Sans',sans-serif",
  },

  recentSection: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  recentList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  recentMoreBtn: {
    background: "transparent",
    border: "none",
    color: C.primary,
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 1.5,
    cursor: "pointer",
    padding: "0 0 0 8px",
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },
  recentCard: {
    display: "flex",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.022)",
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    color: C.ink,
    textAlign: "left",
  },
  recentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  recentTeamName: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
    minWidth: 0,
  },
  recentScore: {
    fontSize: 16,
    fontWeight: 800,
    fontFamily: "'Bebas Neue','Inter Tight',sans-serif",
    fontVariantNumeric: "tabular-nums",
    minWidth: 18,
    textAlign: "right",
  },
  recentDate: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: C.inkFaint,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    alignSelf: "center",
    flexShrink: 0,
  },

  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: "auto",
    paddingTop: 16,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: C.inkGhost,
  },
  footerText: {
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 1.8,
    color: C.inkFaint,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
  },

  modalBackdrop: {
    position: "fixed",
    top: 0, right: 0, bottom: 0, left: 0,
    background: "rgba(2,5,9,0.78)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    zIndex: 4000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    maxWidth: 480,
    margin: "0 auto",
  },
  modalSheet: {
    position: "relative",
    width: "100%",
    maxWidth: 380,
    padding: "28px 24px 22px",
    background: `linear-gradient(180deg, ${C.surface}, ${C.surfaceHi})`,
    border: `1px solid ${C.line}`,
    borderRadius: 18,
    boxShadow: `0 30px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)`,
  },
  modalClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 999,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    color: C.inkDim,
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  modalEyebrow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    marginBottom: 10,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 2.5,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    color: C.primary,
  },
  modalTitle: {
    fontFamily: "'Bebas Neue','Oswald','Inter Tight',sans-serif",
    fontSize: 26,
    fontWeight: 400,
    lineHeight: 1.05,
    letterSpacing: 0.8,
    margin: 0,
    marginBottom: 10,
    color: C.ink,
    textAlign: "center",
    textTransform: "uppercase",
  },
  modalSub: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: C.inkDim,
    margin: 0,
    marginBottom: 18,
    textAlign: "center",
  },
  modalInput: {
    width: "100%",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.025)",
    border: `1px solid ${C.lineHi}`,
    borderRadius: 10,
    color: C.ink,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'DM Sans',sans-serif",
    outline: "none",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    boxSizing: "border-box",
  },
  modalCharCount: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: C.inkFaint,
    fontFamily: "'JetBrains Mono','SF Mono',monospace",
    textAlign: "right",
    marginTop: 6,
    marginBottom: 16,
  },
  modalSaveBtn: {
    width: "100%",
    padding: "14px",
    background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDim})`,
    color: "#0a1410",
    border: "none",
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    cursor: "pointer",
    fontFamily: "'DM Sans',sans-serif",
    boxShadow: `0 10px 28px ${C.primary}55, inset 0 1px 0 rgba(255,255,255,0.3)`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
};

// ═══════════════════════════════════════════════════════════
// CSS ANIMATIONS
// ═══════════════════════════════════════════════════════════
const cssAnims = `
  @keyframes msFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes msCardIn {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes msHalo {
    0%, 100% { opacity: 0.85; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.06); }
  }
  @keyframes msLiveBlink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
  }
  @keyframes rmIn {
    from { opacity: 0; transform: translateY(20px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes rmShake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
`;