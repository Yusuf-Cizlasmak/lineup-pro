// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · ShareCard
// ─────────────────────────────────────────────────────────────
// Maç sonu / Oyuncu kartı / Sezon raporu için paylaşım kartı üretir.
// Free: kartın altında tek satır sade alt bilgi (SHARE_FOOTER — uygulamaya geri link).
// Pro : logo / alt bilgi yok.
//
// Kullanım:
//   <ShareCard mode="match" data={{ teamA, teamB, scoreA, scoreB, mvp }} onClose={...} />
//   <ShareCard mode="player" data={{ player, stat }} onClose={...} />
//   <ShareCard mode="season" data={{ matches, leaderboards }} onClose={...} />
// ─────────────────────────────────────────────────────────────
import React, { useRef, useState } from "react";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { useSubscription } from "./subscription";
import { hapticMedium, hapticSuccess } from "./haptics";
import { SHARE_FOOTER } from "./deepLink";
import { track, EVENTS } from "./analytics";

// ─── Image capture — html-to-image (primary) → html2canvas (fallback) ───
// html2canvas iOS WebView'da gradient/transform/filter ile sessizce başarısız oluyor.
// html-to-image SVG foreignObject kullanır, modern WebView'da çok daha güvenilir.
async function captureNode(node) {
  if (!node) throw new Error("NODE_MISSING");

  // ── 1) Önce html-to-image dene (en güvenilir) ──
  try {
    const mod = await import("html-to-image");
    const toPng = mod.toPng || mod.default?.toPng;
    if (toPng) {
      const dataUrl = await toPng(node, {
        backgroundColor: "#0a1018",
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: false,
        // Style override — bazı problemli CSS'leri normalize et
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
        },
      });
      if (dataUrl && dataUrl.length > 1000) {
        console.log("[ShareCard] capture OK (html-to-image)");
        return dataUrl;
      }
    }
  } catch (e) {
    console.warn("[ShareCard] html-to-image failed, fallback to html2canvas:", e?.message || e);
  }

  // ── 2) Fallback: html2canvas ──
  try {
    const mod = await import("html2canvas");
    const html2canvas = mod.default || mod;
    const canvas = await html2canvas(node, {
      backgroundColor: "#0a1018",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      foreignObjectRendering: false,
      imageTimeout: 15000,
      removeContainer: true,
    });
    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl && dataUrl.length > 1000) {
      console.log("[ShareCard] capture OK (html2canvas fallback)");
      return dataUrl;
    }
    throw new Error("EMPTY_CANVAS");
  } catch (e) {
    console.error("[ShareCard] all capture methods failed:", e);
    throw new Error("CAPTURE_FAILED");
  }
}

// shareText: paylaşım metni (Free'de SHARE_FOOTER eklenir → görseli alan uygulamayı bulur)
async function shareImage(dataUrl, title = "HalıSaha-Kolik", shareText = title) {
  if (!dataUrl) return false;
  try {
    if (Capacitor.isNativePlatform()) {
      // Native share — base64'i geçici dosyaya yaz, file URI ile share et
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const fileName = `halisaha_${Date.now()}.png`;
      const base64 = dataUrl.split(",")[1];
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title,
        text: shareText,
        url: result.uri,
        dialogTitle: "Paylaş",
      });
      return true;
    }
    // Web fallback: download
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}.png`;
    a.click();
    return true;
  } catch (e) {
    console.error("Share fail:", e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
export default function ShareCard({ mode = "match", data = {}, onClose }) {
  const { isPremium } = useSubscription();
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    hapticMedium();
    try {
      const dataUrl = await captureNode(cardRef.current);
      const title = mode === "match" ? "Maç Sonucu" : mode === "player" ? "Oyuncu Kartı" : "Sezon Raporu";
      const ok = await shareImage(dataUrl, title, isPremium ? title : `${title}\n\n${SHARE_FOOTER}`);
      if (ok) {
        track(EVENTS.LINEUP_SHARED, {
          kind: mode === "season" ? "season" : mode === "match" ? "result" : "image",
          card: mode,
        });
        hapticSuccess(); setDone(true); setTimeout(() => onClose?.(), 600);
      }
    } catch (e) {
      console.error("Share error:", e);
      // Fallback: screenshot yönlendirmesi göster
      setFallbackMode(true);
    }
    setBusy(false);
  };

  return (
    <div style={S.backdrop} onClick={onClose}>
      <style>{anims}</style>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={S.closeBtn}>×</button>

        <div style={S.previewWrap}>
          <div ref={cardRef} style={{ ...S.card, paddingBottom: isPremium ? 18 : 46 }}>
            {mode === "match"  && <MatchCard data={data} isPremium={isPremium} />}
            {mode === "player" && <PlayerCard data={data} isPremium={isPremium} />}
            {mode === "season" && <SeasonCard data={data} isPremium={isPremium} />}

            {/* ★ Free: sade alt bilgi (uygulamaya geri link) · Pro: hiçbir şey */}
            {!isPremium && (
              <div style={S.footer}>{SHARE_FOOTER}</div>
            )}
          </div>
        </div>

        <button onClick={handleShare} disabled={busy} style={{ ...S.shareBtn, opacity: busy ? 0.6 : 1 }}>
          {done ? "✓ Paylaşıldı" : busy ? "Hazırlanıyor..." : "📤 Paylaş"}
        </button>

        {fallbackMode && (
          <div style={S.fallback}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📸</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24", marginBottom: 4 }}>
              Otomatik paylaşım kullanılamıyor
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.45 }}>
              Telefonun <b>ekran görüntüsü</b> kısayolu ile kartın resmini al,<br />
              sonra galeriden istediğin yere paylaş.
            </div>
          </div>
        )}

        {!isPremium && !fallbackMode && (
          <div style={S.proHint}>
            Pro ile paylaşımlarda logo/alt bilgi olmaz
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MATCH CARD
// ═══════════════════════════════════════════════════════════
function MatchCard({ data, isPremium }) {
  const { teamA = {}, teamB = {}, scoreA = 0, scoreB = 0, mvp, topScorer, isMatch = true } = data;
  const winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : null;
  const colA = teamA.color?.secondary || "#34d399";
  const colB = teamB.color?.secondary || "#f87171";
  return (
    <>
      <div style={{ textAlign: "center", paddingTop: 14 }}>
        <div style={S.cardTitle}>{isMatch ? "MAÇ SONUCU" : "ANTRENMAN"}</div>
        <div style={S.cardDate}>{new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
      <div style={S.scoreRow}>
        <div style={{ ...S.scoreSide, color: winner === "A" ? colA : "rgba(255,255,255,0.7)" }}>
          <div style={S.teamName}>{teamA.name || "Takım A"}</div>
          <div style={{ ...S.scoreNum, color: winner === "A" ? colA : "#fff" }}>{scoreA}</div>
        </div>
        <div style={S.scoreDash}>–</div>
        <div style={{ ...S.scoreSide, color: winner === "B" ? colB : "rgba(255,255,255,0.7)" }}>
          <div style={S.teamName}>{teamB.name || "Takım B"}</div>
          <div style={{ ...S.scoreNum, color: winner === "B" ? colB : "#fff" }}>{scoreB}</div>
        </div>
      </div>
      {(mvp || topScorer) && (
        <div style={S.highlights}>
          {mvp && <div style={S.highlightRow}><span style={S.hlLabel}>MVP</span><span>{mvp.name} {mvp.surname || ""}</span></div>}
          {topScorer && <div style={S.highlightRow}><span style={{ ...S.hlLabel, color: "#fbbf24" }}>GOL KRALI</span><span>{topScorer.name} ({topScorer.goals})</span></div>}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// PLAYER CARD (FUT-style)
// ═══════════════════════════════════════════════════════════
function PlayerCard({ data, isPremium }) {
  const { player = {}, stat = null } = data;
  const rating = player.rating || 70;
  const color = rating >= 90 ? "#fbbf24" : rating >= 80 ? "#a78bfa" : rating >= 70 ? "#60a5fa" : "#34d399";
  const initials = `${(player.name || "")[0] || ""}${(player.surname || "")[0] || ""}`.toUpperCase() || "⚽";
  return (
    <>
      <div style={{
        margin: "20px auto 12px", width: 180, aspectRatio: "0.72",
        background: `linear-gradient(180deg, ${color}25, ${color}05 60%, transparent)`,
        border: `2px solid ${color}`,
        borderRadius: 14,
        padding: "18px 16px",
        position: "relative",
        boxShadow: `0 14px 30px ${color}40`,
      }}>
        <div style={{ fontSize: 38, fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{rating}</div>
        <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: 1.5 }}>{player.position || "—"}</div>
        <div style={{
          margin: "8px 0", height: 1,
          background: `linear-gradient(90deg, transparent, ${color}77, transparent)`,
        }} />
        <div style={{
          width: 70, height: 70, margin: "0 auto",
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${color}55, ${color}11)`,
          border: `2px solid ${color}88`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 900, color: "#fff",
        }}>{initials}</div>
        <div style={{
          marginTop: 10, textAlign: "center",
          fontSize: 13, fontWeight: 800, color: "#fff",
          letterSpacing: 0.5, textTransform: "uppercase",
        }}>{player.name} {player.surname}</div>
        {stat && (
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-around", fontSize: 9 }}>
            <Stat label="MAÇ" value={stat.matches} color={color} />
            <Stat label="GOL" value={stat.goals} color={color} />
            <Stat label="ASİST" value={stat.assists} color={color} />
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color, fontWeight: 900, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SEASON CARD
// ═══════════════════════════════════════════════════════════
function SeasonCard({ data, isPremium }) {
  const { matches = [], leaderboards = {} } = data;
  const totalGoals = leaderboards.totalGoals || 0;
  const top1 = leaderboards.topScorers?.[0];
  const top2 = leaderboards.topScorers?.[1];
  const mostWins = leaderboards.mostWins?.[0];
  const mvp = leaderboards.mvps?.[0];
  return (
    <>
      <div style={{ textAlign: "center", paddingTop: 14 }}>
        <div style={S.cardTitle}>SEZON RAPORU</div>
        <div style={S.cardDate}>{new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "14px 16px 0" }}>
        <BigStat label="MAÇ"      value={matches.length}        color="#34d399" />
        <BigStat label="TOPLAM GOL" value={totalGoals}           color="#fbbf24" />
      </div>
      {(top1 || mostWins || mvp) && (
        <div style={{ ...S.highlights, marginTop: 14 }}>
          {top1 && (
            <div style={S.highlightRow}>
              <span style={{ ...S.hlLabel, color: "#fbbf24" }}>👑 GOL KRALI</span>
              <span>{top1.info?.name} ({top1.goals})</span>
            </div>
          )}
          {top2 && (
            <div style={S.highlightRow}>
              <span style={{ ...S.hlLabel, color: "#a78bfa" }}>🥈 2. SIRA</span>
              <span>{top2.info?.name} ({top2.goals})</span>
            </div>
          )}
          {mostWins && (
            <div style={S.highlightRow}>
              <span style={{ ...S.hlLabel, color: "#34d399" }}>🏆 EN ÇOK GALİBİYET</span>
              <span>{mostWins.info?.name} ({mostWins.wins})</span>
            </div>
          )}
          {mvp && (
            <div style={S.highlightRow}>
              <span style={{ ...S.hlLabel, color: "#60a5fa" }}>⭐ MVP</span>
              <span>{mvp.info?.name} ({mvp.mvpCount}x)</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function BigStat({ label, value, color }) {
  return (
    <div style={{
      padding: "12px",
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}33`,
      borderRadius: 10,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const anims = `
@keyframes shFadeUp { from { opacity:0; transform: translateY(20px) scale(0.97); } to { opacity:1; transform: translateY(0) scale(1); } }
`;

const S = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(2,5,9,0.85)", backdropFilter: "blur(10px)",
    zIndex: 9500,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20,
    fontFamily: "'DM Sans', sans-serif",
  },
  sheet: {
    width: "100%", maxWidth: 380,
    background: "#0e1620",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
    position: "relative",
    animation: "shFadeUp 0.32s cubic-bezier(.4,1.4,.5,1)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.6)",
  },
  closeBtn: {
    position: "absolute", top: 10, right: 10,
    width: 30, height: 30, borderRadius: "50%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.6)",
    fontSize: 18, cursor: "pointer", zIndex: 10,
  },
  previewWrap: {
    marginBottom: 12,
  },
  card: {
    background: "linear-gradient(160deg, #14181f 0%, #0a0e14 100%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 280,
    position: "relative",
  },
  cardTitle: {
    fontSize: 11, fontWeight: 900, letterSpacing: 3,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  cardDate: {
    fontSize: 10, color: "rgba(255,255,255,0.35)",
    fontWeight: 700, marginTop: 4, letterSpacing: 0.5,
  },
  scoreRow: {
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px 16px",
  },
  scoreSide: {
    flex: 1, textAlign: "center",
  },
  teamName: {
    fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  scoreNum: {
    fontSize: 56, fontWeight: 900,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 0.9,
    color: "#fff",
  },
  scoreDash: {
    fontSize: 36, fontWeight: 800,
    color: "rgba(255,255,255,0.2)",
    padding: "0 8px",
  },
  highlights: {
    padding: "0 16px",
    display: "flex", flexDirection: "column", gap: 8,
  },
  highlightRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 8,
    fontSize: 12,
    color: "#e2e8f0",
    fontWeight: 600,
  },
  hlLabel: {
    fontSize: 9, fontWeight: 900, letterSpacing: 1.5,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  // Free alt bilgi — tek satır, sakin (reklam bandı değil)
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: "9px 14px 10px",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    textAlign: "center",
    fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
    color: "rgba(255,255,255,0.45)",
  },

  shareBtn: {
    width: "100%",
    padding: "13px",
    background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
    color: "#0a1628",
    border: "none",
    borderRadius: 11,
    fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(52,211,153,0.35)",
    fontFamily: "inherit",
  },
  proHint: {
    marginTop: 10,
    fontSize: 11, color: "rgba(251,191,36,0.85)",
    textAlign: "center",
    fontWeight: 600,
  },
  fallback: {
    marginTop: 12,
    padding: "14px",
    background: "linear-gradient(135deg, rgba(251,191,36,0.10), rgba(251,191,36,0.02))",
    border: "1px solid rgba(251,191,36,0.30)",
    borderRadius: 10,
    textAlign: "center",
  },
};