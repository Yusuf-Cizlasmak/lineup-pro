// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Maç Geçmişi & İstatistikler
// localStorage tabanlı; şema ileride asist/kart/MVP/gol türü içerir.
// Performans: list cache + memoize stat hesaplama.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "halisaha_match_history";
const MAX_MATCHES = 200; // perf guard — eski maçları otomatik düşür

// ★ Kaydedilen her YENİ maç için yayınlanan olay (Kasa, bildirimler, misafir sorusu dinler)
//   detail: { id, date (ms), kind: "offline"|"online", attendeeCount, scoreA, scoreB }
export const MATCH_SAVED_EVENT = "halisaha:match-saved";

// ─── Şema (referans) ───
// Match {
//   id: string
//   playedAt: number (timestamp)
//   teamA: { name, color: {primary, secondary}, score }
//   teamB: { name, color: {primary, secondary}, score }
//   formationA: string
//   formationB: string | null
//   isMatch: boolean (tek takım mı, iki takım mı)
//   events: Event[]   // dakika sıralı akış
//   mvpId: string | null
//   playerSnapshots: { [playerId]: { id, name, surname, jerseyNumber, position, side: "A"|"B", isGuest? } }
//   source?: "online" | "offline"   // LiveMatch → "online" (buildMatch({ source }) ile)
//   attendeeCount: number           // maça katılan (gelen) oyuncu sayısı, misafirler dahil
// }
// ★ Katılım kuralları (roster.js bayrakları):
//   • p.absent  → bu hafta gelmedi → snapshot'a YAZILMAZ (olaylarda adı geçiyorsa yazılır)
//   • p.isDemo  → örnek oyuncu → geçmişe HİÇ yazılmaz; sadece örnek oyunculu maç kaydedilmez
//   • p.isGuest → snapshot'a isGuest:true ile yazılır, istatistik/krallıklara girmez
// Event {
//   id: string
//   type: "goal" | "own_goal" | "yellow" | "red" | "assist_only"
//   side: "A" | "B"
//   playerId: string | null   // bilinmiyorsa null (manuel skor artışı)
//   assistPlayerId: string | null
//   minute: number | null
//   goalType: "normal"|"penalty"|"freekick"|"header"|"own_goal"
//   createdAt: number
// }

// ═══ I/O ═══
const readAll = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const writeAll = (matches) => {
  try {
    // En yeni en başta. Capacity guard.
    const trimmed = matches.slice(0, MAX_MATCHES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
};

// ═══ Public API ═══
export const getAllMatches = () => readAll();

export const getMatch = (id) => readAll().find((m) => m.id === id) || null;

// Online (LiveMatch) maçı mı? source/kind alanı ya da (eski kayıtlar için) oyuncu
// kimliklerinin hepsinin cihaz UUID'si olmasından anlaşılır.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const matchKindOf = (match) => {
  if (!match) return "offline";
  if (match.source === "online" || match.kind === "online") return "online";
  if (match.source === "offline" || match.kind === "offline") return "offline";
  const ids = Object.keys(match.playerSnapshots || {});
  if (ids.length > 0 && ids.every((id) => UUID_RE.test(id))) return "online";
  return "offline";
};

export const saveMatch = (match) => {
  // ★ Sadece örnek oyunculardan oluşan maç geçmişe yazılmaz (deneme amaçlı)
  if (!match || match.isDemo) return match;
  const all = readAll();
  const i = all.findIndex((m) => m.id === match.id);
  const isNew = i < 0;
  if (i >= 0) all[i] = match;
  else all.unshift(match);
  writeAll(all);
  // Cross-tab + dinleyici bilgilendirmesi
  try { window.dispatchEvent(new CustomEvent("halisaha:history-updated")); } catch {}
  // ★ Yeni maç → Kasa / bildirim / misafir sorusu dinleyicileri
  if (isNew) {
    try {
      const snaps = Object.values(match.playerSnapshots || {});
      window.dispatchEvent(new CustomEvent(MATCH_SAVED_EVENT, {
        detail: {
          id: match.id,
          date: match.playedAt || Date.now(),
          kind: matchKindOf(match),
          attendeeCount: typeof match.attendeeCount === "number" ? match.attendeeCount : snaps.length,
          scoreA: match.teamA?.score ?? 0,
          scoreB: match.teamB?.score ?? 0,
        },
      }));
    } catch {}
  }
  return match;
};

export const deleteMatch = (id) => {
  const all = readAll().filter((m) => m.id !== id);
  writeAll(all);
  try { window.dispatchEvent(new CustomEvent("halisaha:history-updated")); } catch {}
};

export const clearAllMatches = () => {
  writeAll([]);
  try { window.dispatchEvent(new CustomEvent("halisaha:history-updated")); } catch {}
};

// ═══ Yardımcılar ═══
const newId = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Maç oluştur (modaldan kaydet butonu çağırır)
// source: "online" (LiveMatch) | "offline" — verilmezse otomatik tespit edilir
export const buildMatch = ({
  teamA,
  teamB,
  scoreA,
  scoreB,
  events,
  isMatch,
  mvpId = null,
  source = null,
}) => {
  const allPlayers = [...(teamA?.players || []), ...(teamB?.players || [])].filter(Boolean);
  const demoIds = new Set(allPlayers.filter((p) => p.isDemo === true).map((p) => p.id));

  // ★ Örnek oyuncular olaylardan da silinir (gol/asist/kart/MVP kimseye yazılmaz)
  const cleanEvents = (events || []).map((ev) => {
    if (!ev) return ev;
    const pid = ev.playerId && demoIds.has(ev.playerId) ? null : ev.playerId ?? null;
    const aid = ev.assistPlayerId && demoIds.has(ev.assistPlayerId) ? null : ev.assistPlayerId ?? null;
    if (pid === ev.playerId && aid === ev.assistPlayerId) return ev;
    return { ...ev, playerId: pid, assistPlayerId: aid };
  }).filter(Boolean);
  const cleanMvp = mvpId && demoIds.has(mvpId) ? null : mvpId;

  // Olaylarda adı geçen oyuncu "gelmedi" işaretli olsa bile maça katılmıştır
  const involved = new Set();
  cleanEvents.forEach((ev) => {
    if (ev.playerId) involved.add(ev.playerId);
    if (ev.assistPlayerId) involved.add(ev.assistPlayerId);
  });
  if (cleanMvp) involved.add(cleanMvp);

  // Oyuncu snapshot — sonradan oyuncu silinse bile geçmişte kalsın
  // ★ Sadece gelen (absent olmayan) ve örnek olmayan oyuncular yazılır
  const playerSnapshots = {};
  const snap = (p, side) => {
    if (!p || p.isDemo === true) return;
    if (p.absent === true && !involved.has(p.id)) return;
    playerSnapshots[p.id] = {
      id: p.id,
      name: p.name || "",
      surname: p.surname || "",
      jerseyNumber: p.jerseyNumber || null,
      position: p.position || null,
      side,
      ...(p.isGuest === true ? { isGuest: true } : {}),
    };
  };
  (teamA?.players || []).forEach((p) => snap(p, "A"));
  (teamB?.players || []).forEach((p) => snap(p, "B"));

  const attendeeCount = Object.keys(playerSnapshots).length;
  // Kadroda oyuncu vardı ama hepsi örnek oyuncu → deneme maçı, geçmişe yazılmaz
  const isDemoOnly = attendeeCount === 0 && demoIds.size > 0;

  return {
    id: newId(),
    playedAt: Date.now(),
    teamA: {
      name: teamA?.name || "Takım A",
      color: teamA?.color || { primary: "#059669", secondary: "#34d399" },
      score: scoreA,
    },
    teamB: {
      name: teamB?.name || "Takım B",
      color: teamB?.color || { primary: "#dc2626", secondary: "#f87171" },
      score: scoreB,
    },
    formationA: teamA?.formation || null,
    formationB: teamB?.formation || null,
    isMatch: !!isMatch,
    events: cleanEvents,
    mvpId: cleanMvp,
    playerSnapshots,
    attendeeCount,
    ...(source === "online" || source === "offline" ? { source } : {}),
    ...(isDemoOnly ? { isDemo: true } : {}),
  };
};

// Event şablonu
export const newEvent = ({
  type = "goal",
  side,
  playerId = null,
  assistPlayerId = null,
  minute = null,
  goalType = "normal",
}) => ({
  id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  type,
  side,
  playerId,
  assistPlayerId,
  minute,
  goalType,
  createdAt: Date.now(),
});

// ═══ İstatistik Hesaplama ═══
// Tüm geçmiş maçlardan oyuncu bazlı agrega çıkarır
// Her oyuncu için: matches, goals, assists, ownGoals, wins, draws, losses,
//                  cleanSheets (kaleci için), goalsByType, lastMatches[]
export const computePlayerStats = (matches) => {
  const stats = {}; // playerId → stat objesi
  const playerInfo = {}; // playerId → snapshot (en son görülen)

  const ensure = (pid) => {
    if (!stats[pid]) {
      stats[pid] = {
        playerId: pid,
        matches: 0,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        cleanSheets: 0,
        yellowCards: 0,
        redCards: 0,
        mvpCount: 0,
        goalsByType: { normal: 0, penalty: 0, freekick: 0, header: 0 },
        lastMatches: [], // {matchId, playedAt, opponent, goals, assists, result}
      };
    }
    return stats[pid];
  };

  for (const m of matches) {
    const allSnaps = m.playerSnapshots || {};
    // ★ Misafir (+1) oyuncular istatistik/krallıklara girmez
    const skip = new Set(
      Object.values(allSnaps).filter((s) => s && (s.isGuest || s.isDemo)).map((s) => s.id)
    );
    const pSnaps = {};
    Object.keys(allSnaps).forEach((pid) => { if (!skip.has(pid)) pSnaps[pid] = allSnaps[pid]; });
    // info'yu güncelle (en son maç en başta olduğu için ilk yazan en son bilgisi olur)
    Object.values(pSnaps).forEach((s) => {
      if (!playerInfo[s.id]) playerInfo[s.id] = s;
    });

    // Hangi oyuncular bu maça katıldı? → snapshot'taki herkes katıldı sayılır
    // (sahaya çıkmamış olsa da takımda yer almış)
    const playedIds = Object.keys(pSnaps);
    const aWon = m.teamA.score > m.teamB.score;
    const bWon = m.teamB.score > m.teamA.score;
    const draw = m.teamA.score === m.teamB.score;

    // Sahip olduğu takımın sonucuna göre W/D/L
    playedIds.forEach((pid) => {
      const side = pSnaps[pid].side;
      const s = ensure(pid);
      s.matches++;
      if (draw) s.draws++;
      else if ((side === "A" && aWon) || (side === "B" && bWon)) s.wins++;
      else s.losses++;

      // Kaleci clean sheet — pozisyon bilgisi varsa
      if (pSnaps[pid].position === "KALECİ") {
        const concededBySide = side === "A" ? m.teamB.score : m.teamA.score;
        if (concededBySide === 0) s.cleanSheets++;
      }
    });

    // Eventler — gol, asist, kart
    const matchGoalsByPlayer = {}; // bu maç içinde her oyuncu kaç gol atmış (lastMatches için)
    const matchAssistsByPlayer = {};
    for (const ev of m.events || []) {
      if (!ev) continue;
      if (ev.type === "goal" && ev.playerId && !skip.has(ev.playerId)) {
        const s = ensure(ev.playerId);
        s.goals++;
        const gt = ev.goalType || "normal";
        if (s.goalsByType[gt] != null) s.goalsByType[gt]++;
        matchGoalsByPlayer[ev.playerId] = (matchGoalsByPlayer[ev.playerId] || 0) + 1;
      }
      if (ev.type === "goal" && ev.playerId) {
        if (ev.assistPlayerId && !skip.has(ev.assistPlayerId)) {
          const sa = ensure(ev.assistPlayerId);
          sa.assists++;
          matchAssistsByPlayer[ev.assistPlayerId] = (matchAssistsByPlayer[ev.assistPlayerId] || 0) + 1;
        }
      } else if (ev.playerId && skip.has(ev.playerId)) {
        // misafirin kendi kalesine golü / kartı istatistiğe yazılmaz
      } else if (ev.type === "own_goal" && ev.playerId) {
        ensure(ev.playerId).ownGoals++;
      } else if (ev.type === "yellow" && ev.playerId) {
        ensure(ev.playerId).yellowCards++;
      } else if (ev.type === "red" && ev.playerId) {
        ensure(ev.playerId).redCards++;
      }
    }

    // MVP
    if (m.mvpId && !skip.has(m.mvpId)) ensure(m.mvpId).mvpCount++;

    // lastMatches — her oyuncu için en fazla 5 tut
    playedIds.forEach((pid) => {
      const s = ensure(pid);
      const side = pSnaps[pid].side;
      const result = draw
        ? "D"
        : (side === "A" && aWon) || (side === "B" && bWon)
        ? "W"
        : "L";
      const opp = side === "A" ? m.teamB.name : m.teamA.name;
      s.lastMatches.push({
        matchId: m.id,
        playedAt: m.playedAt,
        opponent: opp,
        goals: matchGoalsByPlayer[pid] || 0,
        assists: matchAssistsByPlayer[pid] || 0,
        result,
      });
    });
  }

  // lastMatches'i tarihe göre yeni→eski sırala, 5'le sınırla
  Object.values(stats).forEach((s) => {
    s.lastMatches.sort((a, b) => b.playedAt - a.playedAt);
    s.lastMatches = s.lastMatches.slice(0, 5);
    // türetilen alanlar
    s.goalsPerMatch = s.matches ? s.goals / s.matches : 0;
    s.winRate = s.matches ? s.wins / s.matches : 0;
  });

  return { stats, playerInfo };
};

// Krallık tabloları
export const computeLeaderboards = (matches, currentTeams = []) => {
  const { stats, playerInfo } = computePlayerStats(matches);
  // currentTeams = [teamA, teamB] — şu anki kayıtlı oyuncular bilgisi (snapshot'tan üstün)
  currentTeams.forEach((t) => {
    if (!t?.players) return;
    t.players.forEach((p) => {
      if (!p || p.isDemo === true) return;
      playerInfo[p.id] = {
        id: p.id,
        name: p.name,
        surname: p.surname,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
      };
    });
  });

  const arr = Object.values(stats);
  const decorate = (s) => ({ ...s, info: playerInfo[s.playerId] || { name: "?", surname: "" } });

  return {
    topScorers: arr.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals || b.goalsPerMatch - a.goalsPerMatch).slice(0, 10).map(decorate),
    topAssisters: arr.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 10).map(decorate),
    topGoalkeepers: arr.filter((s) => s.cleanSheets > 0).sort((a, b) => b.cleanSheets - a.cleanSheets).slice(0, 10).map(decorate),
    mostWins: arr.filter((s) => s.wins > 0).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate).slice(0, 10).map(decorate),
    mvps: arr.filter((s) => s.mvpCount > 0).sort((a, b) => b.mvpCount - a.mvpCount).slice(0, 10).map(decorate),
    totalMatches: matches.length,
    playerInfo,
    allStats: stats,
  };
};

// Tek oyuncunun istatistiği (cache'siz, hızlı erişim)
export const getPlayerStats = (playerId, matches) => {
  const { stats, playerInfo } = computePlayerStats(matches);
  return {
    stat: stats[playerId] || null,
    info: playerInfo[playerId] || null,
  };
};

// Maç başına kısa özet (geçmiş listesinde kart gösterimi için)
export const summarizeMatch = (m) => {
  const goals = (m.events || []).filter((e) => e.type === "goal" || e.type === "own_goal");
  const goalsA = goals.filter((g) => g.side === "A").length;
  const goalsB = goals.filter((g) => g.side === "B").length;
  // Skor manuel girilmiş olabilir → events skoru ile uyumsuz olabilir; gösterimde m.score baz alınır
  return {
    scoreA: m.teamA.score,
    scoreB: m.teamB.score,
    goalsCount: goals.length,
    eventsCount: (m.events || []).length,
    impliedGoalsA: goalsA,
    impliedGoalsB: goalsB,
  };
};