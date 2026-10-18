// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · PasteRosterSheet — "Listeyi Yapıştır" + "Kim Var?"
// ─────────────────────────────────────────────────────────────
// WhatsApp grubundaki listeyi tek yapıştırmayla kadroya çevirir ve bu haftanın
// katılımını (p.absent) ayarlar. İki sekme:
//   • Listeyi Yapıştır — metin → canlı önizleme → yeni oyuncular için mevki +
//                        güç seçimi → onayla (aktif takıma eklenir)
//   • Kim Var?         — tüm oyuncuların yoklama listesi "12/14 geliyor"
//
// Açma: window "halisaha:open-paste-roster" { tab: "paste" | "attendance" }
//       (HaliSahaKolik.jsx dinler ve bu sheet'i mount eder)
//
// Ayrıca küçük yardımcı UI parçaları da buradan export edilir:
//   StrengthPicker · DemoBanner · EmptySquadCTA · ActionToast · GuestPrompt
//   trackPlayersAdded (PLAYER_ADDED + bir kerelik SQUAD_READY)
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { parseRoster, matchExisting } from "./rosterParser";
import {
  STRENGTH_LEVELS, QUICK_POSITIONS, DEFAULT_STRENGTH, strengthKeyOf,
  isPresent, isGuest, isDemo, realPlayers, normalizeName, fullNameOf,
} from "./roster";
import { generateDefaultAttributes } from "./playerAttributes";
import { hapticLight, hapticMedium, hapticSuccess, hapticSelection } from "./haptics";
import { track, EVENTS } from "./analytics";

// ═══ RENKLER — uygulamanın koyu yüzeyleri + yeşil vurgu ═══
const C = {
  bg: "#070a0f", surface: "#0d1117", surfaceHi: "#121922", card: "rgba(255,255,255,0.03)",
  line: "rgba(255,255,255,0.07)", lineHi: "rgba(255,255,255,0.14)",
  ink: "#e2e8f0", inkDim: "rgba(226,232,240,0.62)", inkFaint: "rgba(226,232,240,0.36)",
  accent: "#34d399", accentDim: "#059669", red: "#f87171", gold: "#fbbf24", gray: "#64748b",
};
const FONT = "'DM Sans','Segoe UI',sans-serif";
const DISPLAY = "'Bebas Neue','Oswald',sans-serif";

const POS_LABEL = { "KALECİ": "KALECİ", "DEFANS": "DEFANS", "ORTA SAHA": "ORTA SAHA", "FORVET": "FORVET" };
const POS_SHORT = {
  "KALECİ": "KL", "DEFANS": "DF", "STOPER": "ST", "SOL BEK": "SB",
  "SAĞ BEK": "SĞ", "ORTA SAHA": "OS", "FORVET": "FV",
};

// ═══ ANALİTİK — PLAYER_ADDED + kadro ilk kez 10+ olunca SQUAD_READY (bir kez) ═══
export const SQUAD_READY_KEY = "halisaha_squad_ready_tracked";
export function trackPlayersAdded({ source, count, squadSize, realSquadSize }) {
  try { track(EVENTS.PLAYER_ADDED, { source, count, squad_size: squadSize }); } catch {}
  if (typeof realSquadSize === "number" && realSquadSize >= 10) {
    try {
      if (localStorage.getItem(SQUAD_READY_KEY) !== "1") {
        localStorage.setItem(SQUAD_READY_KEY, "1");
        track(EVENTS.SQUAD_READY, { squad_size: realSquadSize });
      }
    } catch {}
  }
}
// Güncellemeden önce zaten 10+ kişilik kadrosu olanlar için bayrağı sessizce işaretle
// (SQUAD_READY "ilk kez 10'a ulaştı" anlamını korusun)
export function markSquadReadyIfAlready(realSquadSize) {
  if (realSquadSize < 10) return;
  try { if (localStorage.getItem(SQUAD_READY_KEY) !== "1") localStorage.setItem(SQUAD_READY_KEY, "1"); } catch {}
}

// ═══ GÜÇ SEÇİCİ — Zayıf 60 / Orta 70 / İyi 80 / Yıldız 88 ═══
export function StrengthPicker({ value, onChange, accent = C.accent, compact = false }) {
  const active = strengthKeyOf(value);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {STRENGTH_LEVELS.map((lv) => {
        const on = active === lv.key;
        return (
          <button
            key={lv.key}
            type="button"
            onClick={() => { hapticSelection(); onChange?.(lv.rating); }}
            style={{
              flex: 1, padding: compact ? "5px 0" : "7px 0", borderRadius: 7, cursor: "pointer",
              border: on ? `1px solid ${accent}` : `1px solid ${C.line}`,
              background: on ? `${accent}22` : C.card,
              color: on ? accent : C.inkDim,
              fontSize: compact ? 10.5 : 11.5, fontWeight: 700, fontFamily: FONT,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 1, lineHeight: 1.15,
            }}
          >
            <span>{lv.label}</span>
            <span style={{ fontSize: 9, opacity: 0.7, fontFamily: "'JetBrains Mono',monospace" }}>{lv.rating}</span>
          </button>
        );
      })}
    </div>
  );
}

// ═══ ÖRNEK KADRO BANDI ═══
export function DemoBanner({ count, onRemove }) {
  if (!count) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 10,
      borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.22)",
    }}>
      <span style={{ fontSize: 16 }}>🧪</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.gold }}>Örnek oyuncular ({count})</div>
        <div style={{ fontSize: 10, color: C.inkFaint }}>Geçmişe yazılmaz · Sil ve kendi ekibini ekle</div>
      </div>
      <button
        onClick={() => { hapticMedium(); onRemove?.(); }}
        style={{
          padding: "7px 10px", borderRadius: 8, cursor: "pointer", flexShrink: 0,
          border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.12)",
          color: C.gold, fontSize: 11, fontWeight: 700, fontFamily: FONT,
        }}
      >Örnekleri sil</button>
    </div>
  );
}

// ═══ BOŞ KADRO — hızlı başlangıç butonları ═══
export function EmptySquadCTA({ onPaste, onDemo, accent = C.accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, width: "100%", maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
      <button
        data-tour="paste-roster-empty"
        onClick={() => { hapticLight(); onPaste?.(); }}
        style={{
          padding: "11px 14px", borderRadius: 10, cursor: "pointer",
          border: `1px solid ${accent}55`, background: `${accent}14`, color: accent,
          fontSize: 13, fontWeight: 700, fontFamily: FONT,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        }}
      >📋 WhatsApp listesini yapıştır</button>
      {onDemo && (
        <button
          onClick={() => { hapticLight(); onDemo(); }}
          style={{
            padding: "10px 14px", borderRadius: 10, cursor: "pointer",
            border: `1px solid ${C.line}`, background: C.card, color: C.inkDim,
            fontSize: 12, fontWeight: 600, fontFamily: FONT,
          }}
        >🧪 Örnek kadroyla dene</button>
      )}
    </div>
  );
}

// ═══ AKSİYONLU TOAST — "Oyuncu silindi · Geri al", "Hafıza dolu" ═══
//   notice: { id, msg, actionLabel?, onAction?, tone?: "ok"|"warn" }
export function ActionToast({ notice, onClose }) {
  if (!notice) return null;
  const warn = notice.tone === "warn";
  return (
    <div
      role="status"
      style={{
        position: "fixed", left: "50%", transform: "translateX(-50%)",
        bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
        zIndex: 2100, width: "calc(100% - 32px)", maxWidth: 420,
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 14px",
        borderRadius: 12, background: "#0d1117",
        border: `1px solid ${warn ? "rgba(248,113,113,0.45)" : "rgba(52,211,153,0.35)"}`,
        boxShadow: "0 12px 36px rgba(0,0,0,0.55)", fontFamily: FONT,
        animation: "fadeUp 0.22s ease both",
      }}
    >
      <span style={{ fontSize: 15 }}>{warn ? "⚠️" : "🗑️"}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{notice.msg}</span>
      {notice.actionLabel && (
        <button
          onClick={() => { hapticLight(); try { notice.onAction?.(); } catch {} onClose?.(); }}
          style={{
            padding: "7px 11px", borderRadius: 8, cursor: "pointer", flexShrink: 0,
            border: "none", background: warn ? C.red : C.accent, color: "#04130d",
            fontSize: 12, fontWeight: 800, fontFamily: FONT,
          }}
        >{notice.actionLabel}</button>
      )}
      <button
        onClick={onClose}
        aria-label="Kapat"
        style={{ background: "none", border: "none", color: C.inkFaint, fontSize: 16, cursor: "pointer", padding: "0 2px" }}
      >×</button>
    </div>
  );
}

// ═══ MAÇ SONRASI MİSAFİR SORUSU — "Misafirler: Can, Emre — Kadroya kat / Sil" ═══
export function GuestPrompt({ guests, onKeep, onDelete, onClose }) {
  if (!guests || guests.length === 0) return null;
  const names = guests.map((g) => fullNameOf(g) || "Misafir").join(", ");
  return (
    <div style={{
      position: "fixed", left: "50%", transform: "translateX(-50%)",
      bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
      zIndex: 2050, width: "calc(100% - 32px)", maxWidth: 420,
      padding: "12px 14px", borderRadius: 14, background: "#0d1117",
      border: `1px solid ${C.lineHi}`, boxShadow: "0 14px 40px rgba(0,0,0,0.6)", fontFamily: FONT,
      animation: "fadeUp 0.25s ease both",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span style={{ fontSize: 17 }}>🙋</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Misafirler: {names}</div>
          <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 2 }}>Kalıcı olarak kadroya eklensin mi?</div>
        </div>
        <button onClick={onClose} aria-label="Kapat" style={{ background: "none", border: "none", color: C.inkFaint, fontSize: 16, cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => { hapticSuccess(); onKeep?.(); }}
          style={{ flex: 1.3, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", background: C.accent, color: "#04130d", fontSize: 12.5, fontWeight: 800, fontFamily: FONT }}
        >Kadroya kat</button>
        <button
          onClick={() => { hapticLight(); onDelete?.(); }}
          style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${C.line}`, cursor: "pointer", background: C.card, color: C.inkDim, fontSize: 12.5, fontWeight: 700, fontFamily: FONT }}
        >Sil</button>
      </div>
    </div>
  );
}

// ═══ ANA SHEET ═══
const EXAMPLE = `1- Ahmet Yılmaz
2- Mehmet (k)
3- Can ✅
Yedek:
- Emre`;

const looksLikeList = (txt) => {
  try { return parseRoster(txt).players.length >= 2; } catch { return false; }
};

export default function PasteRosterSheet({
  initialTab = "paste",
  teamA, teamB, setTeamA, setTeamB,
  isMatch, activeTeam = "A",
  makeId, getJersey,
  onClose, onToast,
}) {
  const [tab, setTab] = useState(initialTab === "attendance" ? "attendance" : "paste");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState({});      // normalizedName → { position, rating, include, name }
  const [ambChoice, setAmbChoice] = useState({}); // normalizedName → playerId | "new"
  const [applyAttendance, setApplyAttendance] = useState(true);
  const [guestName, setGuestName] = useState("");
  const [showMatched, setShowMatched] = useState(false);
  const taRef = useRef(null);

  const targetSide = isMatch ? activeTeam : "A";
  const targetTeam = targetSide === "A" ? teamA : teamB;
  const accent = C.accent;

  // Eşleştirme + yoklama kapsamı: HER ZAMAN iki takım (AI bölünce oyuncular B'ye de geçer;
  // "Takımım" modunda yapıştırınca B'dekiler kopya olarak yeniden eklenmesin)
  const pool = useMemo(
    () => [...(teamA?.players || []), ...(teamB?.players || [])],
    [teamA?.players, teamB?.players]
  );
  const showTeamDots = isMatch || (teamB?.players || []).length > 0;
  const sideOf = useCallback(
    (id) => ((teamA?.players || []).some((p) => p.id === id) ? "A" : "B"),
    [teamA?.players]
  );

  // "Geçen haftaki gibi" — sheet açıldığı andaki katılım durumu
  const snapshotRef = useRef(null);
  if (snapshotRef.current === null) {
    const snap = {};
    pool.forEach((p) => { snap[p.id] = !!p.absent; });
    snapshotRef.current = snap;
  }

  // ── Panodan otomatik doldur (engellemeden; izin yoksa sessiz geç)
  useEffect(() => {
    if (tab !== "paste" || text) return;
    let cancelled = false;
    try {
      const p = navigator?.clipboard?.readText?.();
      if (p && typeof p.then === "function") {
        p.then((clip) => {
          if (!cancelled && clip && looksLikeList(clip)) setText((cur) => cur || clip);
        }).catch(() => {});
      }
    } catch {}
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const pasteFromClipboard = async () => {
    hapticLight();
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) { setText(clip); return; }
    } catch {}
    onToast?.("Pano okunamadı — metni kutuya yapıştır");
    try { taRef.current?.focus(); } catch {}
  };

  // ══ AYRIŞTIR + EŞLEŞTİR ══
  const parsed = useMemo(() => parseRoster(text), [text]);
  const matching = useMemo(() => matchExisting(parsed.players, pool), [parsed, pool]);
  const outMatching = useMemo(() => matchExisting(parsed.out, pool), [parsed, pool]);

  // Satırları çöz: eşleşen / belirsiz (seçimli) / yeni
  const rows = useMemo(() => {
    const used = new Set(matching.matched.map((m) => m.player.id));
    return matching.results.map((r) => {
      const key = normalizeName(r.parsed.name);
      if (r.player) return { key, parsed: r.parsed, player: r.player, how: r.how };
      if (r.candidates) {
        const choice = ambChoice[key];
        let player = null;
        if (choice && choice !== "new") player = r.candidates.find((c) => c.id === choice) || null;
        else if (!choice) player = r.candidates.find((c) => !used.has(c.id)) || null;
        if (player) used.add(player.id);
        return { key, parsed: r.parsed, player, how: player ? "choice" : null, candidates: r.candidates };
      }
      return { key, parsed: r.parsed, player: null, how: null };
    });
  }, [matching, ambChoice]);

  const newRows = rows.filter((r) => !r.player);
  const matchedRows = rows.filter((r) => r.player);
  const draftOf = (r) => {
    const d = drafts[r.key] || {};
    return {
      position: d.position || (r.parsed.isGK ? "KALECİ" : "ORTA SAHA"),
      rating: d.rating || DEFAULT_STRENGTH,
      include: d.include !== false,
      name: d.name != null ? d.name : r.parsed.name,
    };
  };
  const setDraft = (key, patch) => setDrafts((all) => ({ ...all, [key]: { ...(all[key] || {}), ...patch } }));
  const includedNew = newRows.filter((r) => draftOf(r).include);
  const subsCount = parsed.subs.length;

  // ══ ONAYLA — yeni oyuncuları ekle + katılımı uygula ══
  const confirmPaste = () => {
    if (rows.length === 0) return;
    hapticSuccess();
    const forJersey = [...(targetTeam?.players || [])];
    const created = [];
    includedNew.forEach((r) => {
      const d = draftOf(r);
      const clean = String(d.name || "").replace(/\s+/g, " ").trim();
      if (!clean) return;
      const sp = clean.indexOf(" ");
      const first = sp > 0 ? clean.slice(0, sp) : clean;
      const last = sp > 0 ? clean.slice(sp + 1) : "";
      const id = makeId();
      const p = {
        id, name: first, surname: last, position: d.position, rating: d.rating, photo: null,
        jerseyNumber: getJersey ? getJersey(d.position, forJersey) : null,
        attributes: generateDefaultAttributes(d.position, d.rating, id),
        ...(applyAttendance && r.parsed.isSub ? { absent: true } : {}),
      };
      forJersey.push(p);
      created.push(p);
    });

    // Katılım: listedeki (asıl) herkes geliyor, yedekler + listede olmayanlar "bu hafta yok"
    const presentIds = new Set(matchedRows.filter((r) => !r.parsed.isSub).map((r) => r.player.id));
    // ❌ / "Gelmeyenler:" ile açıkça yazılanlar (katılım kutusu kapalıyken de işlenir)
    const explicitOutIds = new Set(
      outMatching.matched.map((m) => m.player.id).filter((id) => !presentIds.has(id))
    );
    const createdIds = new Set(created.map((p) => p.id));
    const inScope = new Set(pool.map((p) => p.id));
    const applyAtt = (players) => {
      if (!applyAttendance) {
        if (explicitOutIds.size === 0) return players;
        return players.map((p) => (explicitOutIds.has(p.id) && !p.absent ? { ...p, absent: true } : p));
      }
      return players.map((p) => {
        if (createdIds.has(p.id) || !inScope.has(p.id)) return p;
        // Listede asıl kadroda adı geçen → geliyor (aynı kişi ayrıca ❌ ile eşleşse bile)
        if (presentIds.has(p.id)) {
          if (!p.absent) return p;
          const { absent, ...rest } = p;
          return rest;
        }
        return p.absent ? p : { ...p, absent: true };
      });
    };
    setTeamA((tt) => ({ ...tt, players: applyAtt([...(tt.players || []), ...(targetSide === "A" ? created : [])]) }));
    setTeamB((tt) => ({ ...tt, players: applyAtt([...(tt.players || []), ...(targetSide === "B" ? created : [])]) }));

    const allAfter = [...(teamA?.players || []), ...(teamB?.players || []), ...created];
    if (created.length > 0) {
      trackPlayersAdded({
        source: "paste", count: created.length,
        squadSize: allAfter.length, realSquadSize: realPlayers(allAfter).length,
      });
      try { window.dispatchEvent(new CustomEvent("halisaha:player-saved")); } catch {}
    }
    const comingCount = applyAttendance
      ? presentIds.size + created.filter((p) => !p.absent).length
      : null;
    onToast?.(
      created.length > 0
        ? `${created.length} oyuncu eklendi${comingCount != null ? ` · ${comingCount} kişi geliyor` : ""}`
        : comingCount != null ? `Katılım güncellendi · ${comingCount} kişi geliyor` : "Liste işlendi"
    );
    setText(""); setDrafts({}); setAmbChoice({});
    setTab("attendance");
  };

  // ══ KİM VAR? ══
  const toggleAbsent = (p) => {
    hapticSelection();
    const setter = sideOf(p.id) === "A" ? setTeamA : setTeamB;
    setter((tt) => ({
      ...tt,
      players: tt.players.map((x) => {
        if (x.id !== p.id) return x;
        if (x.absent) { const { absent, ...rest } = x; return rest; }
        return { ...x, absent: true };
      }),
    }));
  };
  const setAllPresent = () => {
    hapticMedium();
    const strip = (tt) => ({ ...tt, players: tt.players.map((x) => { if (!x.absent) return x; const { absent, ...rest } = x; return rest; }) });
    setTeamA(strip);
    setTeamB(strip);
  };
  const restoreSnapshot = () => {
    hapticMedium();
    const snap = snapshotRef.current || {};
    const apply = (tt) => ({
      ...tt,
      players: tt.players.map((x) => {
        if (!(x.id in snap)) return x;
        const wasAbsent = snap[x.id];
        if (wasAbsent === !!x.absent) return x;
        if (wasAbsent) return { ...x, absent: true };
        const { absent, ...rest } = x; return rest;
      }),
    });
    setTeamA(apply);
    setTeamB(apply);
    onToast?.("Geçen haftaki katılım geri yüklendi");
  };
  const addGuest = () => {
    const clean = guestName.replace(/\s+/g, " ").trim();
    if (!clean) { try { document.getElementById("hk-guest-input")?.focus(); } catch {} return; }
    hapticSuccess();
    const sp = clean.indexOf(" ");
    const id = makeId();
    const position = "ORTA SAHA";
    const g = {
      id, name: sp > 0 ? clean.slice(0, sp) : clean, surname: sp > 0 ? clean.slice(sp + 1) : "",
      position, rating: DEFAULT_STRENGTH, photo: null, isGuest: true,
      jerseyNumber: getJersey ? getJersey(position, targetTeam?.players || []) : null,
      attributes: generateDefaultAttributes(position, DEFAULT_STRENGTH, id),
    };
    (targetSide === "A" ? setTeamA : setTeamB)((tt) => ({ ...tt, players: [...(tt.players || []), g] }));
    const allAfter = [...(teamA?.players || []), ...(teamB?.players || []), g];
    trackPlayersAdded({ source: "guest", count: 1, squadSize: allAfter.length, realSquadSize: realPlayers(allAfter).length });
    setGuestName("");
    onToast?.(`${g.name} misafir olarak eklendi`);
  };

  const presentCount = pool.filter(isPresent).length;
  const openAISplit = () => {
    hapticMedium();
    onClose?.();
    setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent("halisaha:navigate", { detail: { route: "ai_split" } })); } catch {}
    }, 180);
  };

  // ── Önizleme metni: "14 oyuncu bulundu · 3 yeni · 11 kadroda"
  const preview = rows.length > 0
    ? [
        `${rows.length} oyuncu bulundu`,
        `${includedNew.length} yeni`,
        `${matchedRows.length} kadroda`,
        subsCount > 0 ? `${subsCount} yedek` : null,
        parsed.out.length > 0 ? `${parsed.out.length} gelmiyor` : null,
      ].filter(Boolean).join(" · ")
    : null;

  // ═══ RENDER ═══
  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => { hapticSelection(); setTab(id); }}
      style={{
        flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer",
        background: tab === id ? `${accent}1f` : "transparent",
        color: tab === id ? accent : C.inkFaint,
        fontSize: 12.5, fontWeight: 700, fontFamily: FONT,
        boxShadow: tab === id ? `inset 0 0 0 1px ${accent}55` : "none",
      }}
    >{label}</button>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FONT,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "92%",
          background: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${C.lineHi}`, borderBottom: "none",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)", animation: "fadeUp 0.25s ease both",
        }}
      >
        {/* Tutamaç + başlık */}
        <div style={{ padding: "8px 16px 0", flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.lineHi, margin: "0 auto 10px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 22, letterSpacing: 1, color: C.ink, lineHeight: 1 }}>
                {tab === "paste" ? "LİSTEYİ YAPIŞTIR" : "BU HAFTA KİM VAR?"}
              </div>
              <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 3 }}>
                {tab === "paste" ? "WhatsApp grubundaki listeyi kopyala, buraya yapıştır" : "Gelmeyenleri işaretle — AI sadece gelenleri dağıtır"}
              </div>
            </div>
            <button onClick={onClose} aria-label="Kapat" style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0, cursor: "pointer",
              background: C.card, border: `1px solid ${C.line}`, color: C.inkDim, fontSize: 18,
            }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 11, background: C.bg, border: `1px solid ${C.line}`, marginBottom: 10 }}>
            {tabBtn("paste", "📋 Listeyi Yapıştır")}
            {tabBtn("attendance", `✅ Kim Var? · ${presentCount}/${pool.length}`)}
          </div>
        </div>

        {/* ══ İÇERİK ══ */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px", WebkitOverflowScrolling: "touch" }}>
          {tab === "paste" ? (
            <>
              <div style={{ position: "relative" }}>
                <textarea
                  ref={taRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Örnek:\n${EXAMPLE}`}
                  rows={text ? 7 : 6}
                  style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 120,
                    padding: "11px 12px", borderRadius: 11, outline: "none",
                    border: `1px solid ${text ? `${accent}44` : C.line}`, background: C.bg, color: C.ink,
                    fontSize: 15, lineHeight: 1.45, fontFamily: FONT,
                  }}
                />
                {!text && (
                  <button onClick={pasteFromClipboard} style={{
                    position: "absolute", right: 8, bottom: 10, padding: "7px 10px", borderRadius: 8,
                    cursor: "pointer", border: `1px solid ${accent}55`, background: `${accent}18`,
                    color: accent, fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
                  }}>📋 Panodan yapıştır</button>
                )}
                {text && (
                  <button onClick={() => { setText(""); setDrafts({}); setAmbChoice({}); }} style={{
                    position: "absolute", right: 8, top: 8, padding: "3px 8px", borderRadius: 6,
                    cursor: "pointer", border: `1px solid ${C.line}`, background: C.surfaceHi,
                    color: C.inkFaint, fontSize: 10.5, fontWeight: 600, fontFamily: FONT,
                  }}>Temizle</button>
                )}
              </div>

              {/* Canlı önizleme */}
              {text && (
                <div style={{
                  marginTop: 10, padding: "9px 12px", borderRadius: 10,
                  background: rows.length ? `${accent}10` : "rgba(248,113,113,0.07)",
                  border: `1px solid ${rows.length ? `${accent}33` : "rgba(248,113,113,0.25)"}`,
                  fontSize: 12.5, fontWeight: 700, color: rows.length ? accent : C.red,
                }}>
                  {preview || "Listede isim bulunamadı — her satıra bir isim yaz"}
                  {parsed.ignored.length > 0 && (
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: C.inkFaint, marginTop: 3 }}>
                      {parsed.ignored.length} satır başlık/not olarak atlandı
                    </div>
                  )}
                </div>
              )}

              {/* Belirsiz eşleşmeler */}
              {rows.filter((r) => r.candidates).map((r) => (
                <div key={`amb-${r.key}`} style={{ marginTop: 8, padding: "9px 11px", borderRadius: 10, background: C.card, border: `1px solid rgba(251,191,36,0.25)` }}>
                  <div style={{ fontSize: 11.5, color: C.gold, fontWeight: 700, marginBottom: 6 }}>"{r.parsed.name}" kim?</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {r.candidates.map((c) => {
                      const on = r.player && r.player.id === c.id;
                      return (
                        <button key={c.id} onClick={() => { hapticSelection(); setAmbChoice((a) => ({ ...a, [r.key]: c.id })); }} style={chipStyle(on, accent)}>
                          {fullNameOf(c)}
                        </button>
                      );
                    })}
                    <button onClick={() => { hapticSelection(); setAmbChoice((a) => ({ ...a, [r.key]: "new" })); }} style={chipStyle(!r.player, accent)}>+ Yeni oyuncu</button>
                  </div>
                </div>
              ))}

              {/* Yeni oyuncular — mevki + güç */}
              {newRows.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={sectionLabel}>Yeni oyuncular · mevki ve güç seç</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {newRows.map((r) => {
                      const d = draftOf(r);
                      return (
                        <div key={`new-${r.key}`} style={{
                          padding: "9px 10px", borderRadius: 11, background: C.card,
                          border: `1px solid ${d.include ? C.line : "transparent"}`, opacity: d.include ? 1 : 0.45,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: d.include ? 7 : 0 }}>
                            <input
                              value={d.name}
                              onChange={(e) => setDraft(r.key, { name: e.target.value })}
                              style={{
                                flex: 1, minWidth: 0, padding: "6px 9px", borderRadius: 7, outline: "none",
                                border: `1px solid ${C.line}`, background: C.bg, color: C.ink,
                                fontSize: 15, fontWeight: 600, fontFamily: FONT,
                              }}
                            />
                            {r.parsed.isSub && <Tag color={C.gold}>YEDEK</Tag>}
                            <button
                              onClick={() => { hapticLight(); setDraft(r.key, { include: !d.include }); }}
                              aria-label={d.include ? "Ekleme" : "Ekle"}
                              style={{
                                width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: "pointer",
                                border: `1px solid ${C.line}`, background: C.surfaceHi,
                                color: d.include ? C.red : accent, fontSize: 14, fontWeight: 800,
                              }}
                            >{d.include ? "×" : "+"}</button>
                          </div>
                          {d.include && (
                            <>
                              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                                {QUICK_POSITIONS.map((pos) => (
                                  <button key={pos} onClick={() => { hapticSelection(); setDraft(r.key, { position: pos }); }} style={{ ...chipStyle(d.position === pos, accent), flex: 1, padding: "6px 0", fontSize: 9.5 }}>
                                    {POS_LABEL[pos]}
                                  </button>
                                ))}
                              </div>
                              <StrengthPicker compact value={d.rating} onChange={(v) => setDraft(r.key, { rating: v })} accent={accent} />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kadroda olanlar */}
              {matchedRows.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => setShowMatched((v) => !v)} style={{ ...sectionLabel, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    Kadroda olanlar ({matchedRows.length}) <span style={{ transform: showMatched ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
                  </button>
                  {showMatched && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {matchedRows.map((r) => (
                        <span key={`m-${r.player.id}`} style={{
                          padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: `${accent}12`, border: `1px solid ${accent}2a`, color: C.inkDim,
                        }}>
                          ✓ {fullNameOf(r.player)}
                          {normalizeName(r.parsed.name) !== normalizeName(fullNameOf(r.player)) && (
                            <span style={{ color: C.inkFaint }}> ← {r.parsed.name}</span>
                          )}
                          {r.parsed.isSub && <span style={{ color: C.gold }}> · yedek</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {parsed.out.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: C.inkFaint }}>
                  <span style={{ color: C.red, fontWeight: 700 }}>Gelmiyor: </span>
                  {parsed.out.map((p) => p.name).join(", ")}
                </div>
              )}

              {/* Katılım onayı */}
              {rows.length > 0 && (
                <label style={{
                  marginTop: 12, display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                  borderRadius: 10, background: C.card, border: `1px solid ${C.line}`, cursor: "pointer",
                }}>
                  <input
                    type="checkbox"
                    checked={applyAttendance}
                    onChange={(e) => { hapticSelection(); setApplyAttendance(e.target.checked); }}
                    style={{ width: 18, height: 18, accentColor: accent, marginTop: 1, flexShrink: 0 }}
                  />
                  <span>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.ink }}>Bu listeyi bu haftanın katılım listesi yap</span>
                    <span style={{ display: "block", fontSize: 10.5, color: C.inkFaint, marginTop: 2 }}>
                      Listede olmayanlar{subsCount > 0 ? " ve yedekler" : ""} "bu hafta yok" olarak işaretlenir
                    </span>
                  </span>
                </label>
              )}
            </>
          ) : (
            /* ══ KİM VAR? ══ */
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 13,
                background: `linear-gradient(135deg, ${accent}1a, ${accent}05)`, border: `1px solid ${accent}33`,
              }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 40, lineHeight: 1, color: accent, letterSpacing: 1 }}>
                  {presentCount}<span style={{ fontSize: 24, color: C.inkFaint }}>/{pool.length}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>geliyor</div>
                  <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 2 }}>
                    {pool.length - presentCount > 0 ? `${pool.length - presentCount} kişi bu hafta yok` : "Herkes geliyor"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button onClick={setAllPresent} style={secondaryBtn}>✓ Hepsini işaretle</button>
                <button onClick={restoreSnapshot} style={secondaryBtn}>↺ Geçen haftaki gibi</button>
              </div>

              {pool.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 10px", color: C.inkFaint, fontSize: 12.5 }}>
                  Kadroda henüz oyuncu yok.
                  <div>
                    <button onClick={() => setTab("paste")} style={{ ...secondaryBtn, display: "inline-block", width: "auto", marginTop: 10, padding: "8px 14px" }}>📋 Listeyi yapıştır</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
                  {pool.map((p) => {
                    const on = isPresent(p);
                    const side = sideOf(p.id);
                    const tm = side === "A" ? teamA : teamB;
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleAbsent(p)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10,
                          cursor: "pointer", textAlign: "left", fontFamily: FONT, width: "100%",
                          background: on ? `${accent}0d` : C.card,
                          border: `1px solid ${on ? `${accent}33` : C.line}`,
                          opacity: on ? 1 : 0.55, transition: "opacity .15s, background .15s",
                        }}
                      >
                        <span style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center",
                          background: on ? accent : "transparent", border: `1.5px solid ${on ? accent : C.lineHi}`,
                          color: "#04130d", fontSize: 13, fontWeight: 900,
                        }}>{on ? "✓" : ""}</span>
                        {showTeamDots && <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: tm?.color?.secondary || accent }} />}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {fullNameOf(p) || "Oyuncu"}
                        </span>
                        {isGuest(p) && <Tag color={C.gray}>MİSAFİR</Tag>}
                        {isDemo(p) && <Tag color={C.gold}>ÖRNEK</Tag>}
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: C.inkFaint, flexShrink: 0 }}>{POS_SHORT[p.position] || "OS"}</span>
                        {!on && <span style={{ fontSize: 9.5, fontWeight: 700, color: C.red, flexShrink: 0 }}>YOK</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Misafir (+1) */}
              <div style={{ marginTop: 12, padding: "10px 11px", borderRadius: 11, background: C.card, border: `1px dashed ${C.lineHi}` }}>
                <div style={{ ...sectionLabel, marginBottom: 6 }}>Misafir ekle (+1) · sadece bu hafta</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    id="hk-guest-input"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addGuest(); }}
                    placeholder="Misafirin adı"
                    style={{
                      flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, outline: "none",
                      border: `1px solid ${C.line}`, background: C.bg, color: C.ink, fontSize: 15, fontFamily: FONT,
                    }}
                  />
                  <button onClick={addGuest} style={{
                    padding: "8px 12px", borderRadius: 8, cursor: "pointer", flexShrink: 0,
                    border: `1px solid ${C.lineHi}`, background: C.surfaceHi, color: C.ink,
                    fontSize: 12, fontWeight: 700, fontFamily: FONT,
                  }}>+ Misafir</button>
                </div>
                <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 5 }}>Misafirler krallık tablolarına girmez; maç sonrası kadroya katabilirsin.</div>
              </div>
            </>
          )}
        </div>

        {/* ══ ALT BAR ══ */}
        <div style={{
          padding: "10px 16px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, flexShrink: 0,
          paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))", background: C.surface,
        }}>
          {tab === "paste" ? (
            <>
              <button onClick={onClose} style={{ ...footerBtn, flex: 1, background: C.card, border: `1px solid ${C.line}`, color: C.inkDim }}>Vazgeç</button>
              <button
                onClick={confirmPaste}
                disabled={rows.length === 0}
                style={{
                  ...footerBtn, flex: 2,
                  background: rows.length ? `linear-gradient(135deg, ${C.accentDim}, ${accent})` : C.card,
                  color: rows.length ? "#04130d" : C.inkFaint, opacity: rows.length ? 1 : 0.6,
                  cursor: rows.length ? "pointer" : "default",
                }}
              >
                {rows.length === 0
                  ? "Onayla"
                  : includedNew.length > 0 ? `${includedNew.length} oyuncu ekle ve onayla` : "Katılımı onayla"}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} style={{ ...footerBtn, flex: 1, background: C.card, border: `1px solid ${C.line}`, color: C.inkDim }}>Tamam</button>
              <button
                onClick={openAISplit}
                disabled={presentCount < 4}
                style={{
                  ...footerBtn, flex: 2,
                  background: presentCount >= 4 ? `linear-gradient(135deg, ${C.accentDim}, ${accent})` : C.card,
                  color: presentCount >= 4 ? "#04130d" : C.inkFaint, opacity: presentCount >= 4 ? 1 : 0.6,
                  cursor: presentCount >= 4 ? "pointer" : "default",
                }}
              >{presentCount >= 4 ? `AI ile takım kur · ${presentCount} kişi →` : "Takım için en az 4 kişi"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ küçük stil yardımcıları ═══
const chipStyle = (on, accent) => ({
  padding: "5px 9px", borderRadius: 7, cursor: "pointer",
  border: on ? `1px solid ${accent}` : `1px solid ${C.line}`,
  background: on ? `${accent}22` : C.card, color: on ? accent : C.inkDim,
  fontSize: 11, fontWeight: 700, fontFamily: FONT, letterSpacing: 0.2,
});
const sectionLabel = {
  fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase",
  letterSpacing: 0.9, marginBottom: 7, fontFamily: FONT,
};
const secondaryBtn = {
  flex: 1, padding: "8px 0", borderRadius: 9, cursor: "pointer",
  border: `1px solid ${C.line}`, background: C.card, color: C.inkDim,
  fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
};
const footerBtn = {
  padding: "12px 0", borderRadius: 11, border: "none", cursor: "pointer",
  fontSize: 13.5, fontWeight: 800, fontFamily: FONT,
};
function Tag({ color, children }) {
  return (
    <span style={{
      flexShrink: 0, padding: "1px 5px", borderRadius: 4, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5,
      color, border: `1px solid ${color}66`, background: `${color}1a`,
    }}>{children}</span>
  );
}
