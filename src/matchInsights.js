// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Match Insights (Rule-based, no AI)
// ─────────────────────────────────────────────────────────────
// Bir maçın (opsiyonel: tüm geçmişin) datasından "akıllı"
// içgörüler çıkarır. LLM yok — saf JS pattern detection.
//
// Çıktı: { stars[], tactical[], trend[] }
// Her insight: { id, severity, icon, title, body, evidence, type }
//
// Kullanım:
//   import { computeMatchInsights } from "./matchInsights";
//   const insights = computeMatchInsights(match, allHistory);
//   // → render <MatchInsightsPanel insights={insights} />
//
// Tasarım:
//   • Her kural ayrı fn: rule(ctx) → insight | null
//   • Kurallar BAĞIMSIZ — sıralama önemli değil, tek tek eklenebilir
//   • Severity ile filtrele: high > medium > low
//   • UI cap: ekranı boğmamak için kategori başına max N insight
// ─────────────────────────────────────────────────────────────

// ═══ SEVERITY / TYPE constants ═══
export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low" };
export const TYPE     = { POSITIVE: "positive", TACTICAL: "tactical", TREND: "trend", WARNING: "warning" };
export const CATEGORY = { STARS: "stars", TACTICAL: "tactical", TREND: "trend" };

// ═══ HELPERS ═══

// Oyuncunun display name'i — playerSnapshots'tan
function nameOf(snap) {
  if (!snap) return "Bilinmeyen";
  const n = (snap.name || "").trim();
  const s = (snap.surname || "").trim();
  if (n && s) return `${n} ${s}`;
  if (n) return n;
  if (snap.jerseyNumber != null) return `#${snap.jerseyNumber}`;
  return "Bilinmeyen";
}

// Bir oyuncunun bu maçtaki gol sayısı
function countGoals(events, playerId) {
  return (events || []).filter(e => e.type === "goal" && e.playerId === playerId).length;
}

// Bir oyuncunun bu maçtaki asist sayısı
function countAssists(events, playerId) {
  return (events || []).filter(e => e.type === "goal" && e.assistPlayerId === playerId).length;
}

// Skorer/asistçi çift sayımı (kimya)
function chemistryPairs(events) {
  const pairs = {}; // `${scorer}|${assister}` → count
  for (const e of events || []) {
    if (e.type === "goal" && e.playerId && e.assistPlayerId) {
      const key = `${e.playerId}|${e.assistPlayerId}`;
      pairs[key] = (pairs[key] || 0) + 1;
    }
  }
  return pairs;
}

// Yarı bazlı gol dağılımı — minute < 30 ilk yarı, >= 30 ikinci yarı
function goalsByHalf(events, side) {
  const goals = (events || []).filter(e => e.type === "goal" && e.side === side);
  let first = 0, second = 0, unknown = 0;
  for (const g of goals) {
    if (g.minute == null) unknown++;
    else if (g.minute < 30) first++;
    else second++;
  }
  return { first, second, unknown, total: goals.length };
}

// Goal type dağılımı
function goalTypeDistribution(events) {
  const dist = { normal: 0, penalty: 0, freekick: 0, header: 0 };
  for (const e of events || []) {
    if (e.type !== "goal") continue;
    const t = e.goalType || "normal";
    if (dist[t] != null) dist[t]++;
  }
  return dist;
}

// Comeback detection — bir takım önce geride düşüp sonra öne geçtiyse
// Olay sırası: events'in minute'a göre sıralı olduğunu varsayıyoruz
function detectComeback(events, finalAScore, finalBScore) {
  if (!events || events.length === 0) return null;
  const sorted = [...events]
    .filter(e => e.type === "goal" || e.type === "own_goal")
    .sort((a, b) => (a.minute || 0) - (b.minute || 0));

  let a = 0, b = 0;
  let aWasDown = false, bWasDown = false;

  for (const ev of sorted) {
    // own goal: kendine gol → karşı takıma yazılır
    if (ev.type === "own_goal") {
      if (ev.side === "A") b++; else a++;
    } else {
      if (ev.side === "A") a++; else b++;
    }
    if (a < b) aWasDown = true;
    if (b < a) bWasDown = true;
  }

  const aWon = finalAScore > finalBScore;
  const bWon = finalBScore > finalAScore;

  if (aWon && aWasDown) return "A";
  if (bWon && bWasDown) return "B";
  return null;
}

// Son N maçtaki oyuncunun gol serisini bul
// (her maçta en az 1 gol attıysa streak)
function scoringStreak(playerLastMatches, n = 3) {
  if (!playerLastMatches || playerLastMatches.length < n) return 0;
  let streak = 0;
  for (let i = 0; i < playerLastMatches.length; i++) {
    if (playerLastMatches[i].goals > 0) streak++;
    else break;
  }
  return streak;
}

// Win streak bir oyuncu için
function winStreak(playerLastMatches) {
  if (!playerLastMatches || playerLastMatches.length === 0) return 0;
  let streak = 0;
  for (const m of playerLastMatches) {
    if (m.result === "W") streak++;
    else break;
  }
  return streak;
}

// ═══════════════════════════════════════════════════════════
// CONTEXT BUILDER — kuralların ortak okuduğu derived data
// ═══════════════════════════════════════════════════════════
function buildContext(match, history = []) {
  const snaps = match.playerSnapshots || {};
  const events = match.events || [];
  const scoreA = match.teamA?.score ?? 0;
  const scoreB = match.teamB?.score ?? 0;
  const totalGoals = scoreA + scoreB;

  // Her oyuncunun bu maçtaki performansı
  const perPlayer = {}; // pid → { goals, assists, name, side, position }
  Object.keys(snaps).forEach(pid => {
    perPlayer[pid] = {
      playerId: pid,
      name: nameOf(snaps[pid]),
      side: snaps[pid].side,
      position: snaps[pid].position,
      jerseyNumber: snaps[pid].jerseyNumber,
      goals: countGoals(events, pid),
      assists: countAssists(events, pid),
      ownGoals: events.filter(e => e.type === "own_goal" && e.playerId === pid).length,
    };
  });

  // Gol/asist sıralamaları
  const sortedScorers = Object.values(perPlayer).filter(p => p.goals > 0)
    .sort((a, b) => b.goals - a.goals);
  const sortedAssisters = Object.values(perPlayer).filter(p => p.assists > 0)
    .sort((a, b) => b.assists - a.assists);

  // Kimya çiftleri
  const pairs = chemistryPairs(events);
  const topPair = Object.entries(pairs)
    .map(([key, count]) => {
      const [scorerId, assisterId] = key.split("|");
      return { scorerId, assisterId, count };
    })
    .sort((a, b) => b.count - a.count)[0] || null;

  // Yarı analizi (her takım için)
  const halvesA = goalsByHalf(events, "A");
  const halvesB = goalsByHalf(events, "B");

  // Goal type
  const goalTypes = goalTypeDistribution(events);

  // Comeback
  const comebackWinner = detectComeback(events, scoreA, scoreB);

  // Result
  const aWon = scoreA > scoreB;
  const bWon = scoreB > scoreA;
  const isDraw = scoreA === scoreB;

  return {
    match,
    history,
    snaps,
    events,
    scoreA, scoreB, totalGoals,
    aWon, bWon, isDraw,
    perPlayer,
    sortedScorers,
    sortedAssisters,
    pairs, topPair,
    halvesA, halvesB,
    goalTypes,
    comebackWinner,
  };
}

// ═══════════════════════════════════════════════════════════
// RULES — STARS kategorisi
// ═══════════════════════════════════════════════════════════

// MVP — match.mvpId varsa ve oyuncunun gerçek katkısı varsa
function ruleMVP(ctx) {
  const mvpId = ctx.match.mvpId;
  if (!mvpId) return null;
  const p = ctx.perPlayer[mvpId];
  if (!p) return null;

  const contribParts = [];
  if (p.goals > 0)   contribParts.push(`${p.goals} gol`);
  if (p.assists > 0) contribParts.push(`${p.assists} asist`);
  const contrib = contribParts.length > 0 ? contribParts.join(" · ") : "takıma büyük katkı";

  return {
    id: "mvp",
    category: CATEGORY.STARS,
    type: TYPE.POSITIVE,
    severity: SEVERITY.HIGH,
    icon: "⭐",
    title: `MVP: ${p.name}`,
    body: `Maçın yıldızı. ${contrib}.`,
    evidence: {
      label: "MVP",
      metrics: [
        { k: "Gol",   v: p.goals },
        { k: "Asist", v: p.assists },
      ],
    },
  };
}

// Hat-trick — bir oyuncu 3+ gol
function ruleHatTrick(ctx) {
  const scorer = ctx.sortedScorers.find(s => s.goals >= 3);
  if (!scorer) return null;
  return {
    id: `hattrick_${scorer.playerId}`,
    category: CATEGORY.STARS,
    type: TYPE.POSITIVE,
    severity: SEVERITY.HIGH,
    icon: "🎩",
    title: `Hat-trick! ${scorer.name}`,
    body: `Tek maçta ${scorer.goals} gol — efsane performans.`,
    evidence: {
      label: "Hat-trick",
      metrics: [{ k: "Gol", v: scorer.goals }],
    },
  };
}

// Brace — bir oyuncu tam olarak 2 gol (hat-trick varsa atla — title olarak iki kez gözükmesin)
function ruleBrace(ctx) {
  // Hat-trick varsa pas (daha güçlü insight zaten gösteriliyor)
  if (ctx.sortedScorers.some(s => s.goals >= 3)) return null;
  const scorer = ctx.sortedScorers.find(s => s.goals === 2);
  if (!scorer) return null;
  return {
    id: `brace_${scorer.playerId}`,
    category: CATEGORY.STARS,
    type: TYPE.POSITIVE,
    severity: SEVERITY.MEDIUM,
    icon: "⚡",
    title: `${scorer.name} — Çiftleme`,
    body: `Maçta 2 gol attı. Hücumun belkemiği.`,
    evidence: {
      label: "Brace",
      metrics: [{ k: "Gol", v: 2 }],
    },
  };
}

// Best chemistry pair — en çok birlikte gol üreten ikili (2+ birlikte gol)
function ruleBestChemistry(ctx) {
  if (!ctx.topPair || ctx.topPair.count < 2) return null;
  const scorer = ctx.perPlayer[ctx.topPair.scorerId];
  const assister = ctx.perPlayer[ctx.topPair.assisterId];
  if (!scorer || !assister) return null;
  return {
    id: "chemistry_pair",
    category: CATEGORY.STARS,
    type: TYPE.POSITIVE,
    severity: SEVERITY.MEDIUM,
    icon: "🤝",
    title: `İkili: ${assister.name} → ${scorer.name}`,
    body: `Bu maçta birlikte ${ctx.topPair.count} gol ürettiler.`,
    evidence: {
      label: "Kimya",
      metrics: [{ k: "Birlikte gol", v: ctx.topPair.count }],
    },
  };
}

// Top assister — 2+ asist (kralı belirgin biçimde)
function ruleTopAssister(ctx) {
  const top = ctx.sortedAssisters[0];
  if (!top || top.assists < 2) return null;
  return {
    id: `top_assister_${top.playerId}`,
    category: CATEGORY.STARS,
    type: TYPE.POSITIVE,
    severity: SEVERITY.MEDIUM,
    icon: "🎯",
    title: `${top.name} — Asist Kralı`,
    body: `${top.assists} asistle takımın yaratıcısı.`,
    evidence: {
      label: "Asist",
      metrics: [{ k: "Asist", v: top.assists }],
    },
  };
}

// Clean sheet — kaleci pozisyonundaki oyuncu hiç gol yememişse
function ruleCleanSheet(ctx) {
  const keepers = Object.values(ctx.perPlayer).filter(p => p.position === "KALECİ");
  const result = [];
  for (const k of keepers) {
    const concededByMyTeam = k.side === "A" ? ctx.scoreB : ctx.scoreA;
    if (concededByMyTeam === 0) {
      result.push({
        id: `cleansheet_${k.playerId}`,
        category: CATEGORY.STARS,
        type: TYPE.POSITIVE,
        severity: SEVERITY.MEDIUM,
        icon: "🥅",
        title: `Clean Sheet: ${k.name}`,
        body: "Maç boyunca kaleyi gole kapadı.",
        evidence: {
          label: "Kaleci",
          metrics: [{ k: "Yenilen", v: 0 }],
        },
      });
    }
  }
  return result.length > 0 ? result : null;
}

// ═══════════════════════════════════════════════════════════
// RULES — TACTICAL kategorisi
// ═══════════════════════════════════════════════════════════

// Yarı zaman dengesizliği — bir takım gollerin %75+'ını tek yarıda atmışsa
function ruleHalfImbalance(ctx) {
  const results = [];
  for (const side of ["A", "B"]) {
    const h = side === "A" ? ctx.halvesA : ctx.halvesB;
    if (h.total < 3) continue; // anlamlı sample için min 3 gol
    if (h.unknown > 0) continue; // minute datası eksikse yorum yapma
    const teamName = ctx.match[`team${side}`]?.name || side;
    if (h.first / h.total >= 0.75) {
      results.push({
        id: `half_first_${side}`,
        category: CATEGORY.TACTICAL,
        type: TYPE.TACTICAL,
        severity: SEVERITY.MEDIUM,
        icon: "⏱",
        title: `${teamName} ilk yarı ağırlıklı`,
        body: `${h.total} golün ${h.first}'i ilk yarıda. İkinci yarı tempo düştü.`,
        evidence: {
          label: "İlk yarı / Toplam",
          metrics: [{ k: "İlk", v: h.first }, { k: "İkinci", v: h.second }],
        },
      });
    } else if (h.second / h.total >= 0.75) {
      results.push({
        id: `half_second_${side}`,
        category: CATEGORY.TACTICAL,
        type: TYPE.TACTICAL,
        severity: SEVERITY.MEDIUM,
        icon: "⏱",
        title: `${teamName} ikinci yarıda açıldı`,
        body: `${h.total} golün ${h.second}'i ikinci yarıda. İlk yarı zorlanıldı.`,
        evidence: {
          label: "İkinci yarı / Toplam",
          metrics: [{ k: "İlk", v: h.first }, { k: "İkinci", v: h.second }],
        },
      });
    }
  }
  return results.length > 0 ? results : null;
}

// Comeback — geriye düşüp galip gelen takım
function ruleComeback(ctx) {
  if (!ctx.comebackWinner) return null;
  const teamName = ctx.match[`team${ctx.comebackWinner}`]?.name || ctx.comebackWinner;
  return {
    id: "comeback",
    category: CATEGORY.TACTICAL,
    type: TYPE.POSITIVE,
    severity: SEVERITY.HIGH,
    icon: "🔄",
    title: `${teamName} — Comeback`,
    body: "Geriye düştü, sonra galip geldi. Karakter maçı.",
    evidence: {
      label: "Sonuç",
      metrics: [{ k: "Skor", v: `${ctx.scoreA}-${ctx.scoreB}` }],
    },
  };
}

// Yüksek skorlu maç (7+ toplam gol)
function ruleHighScoring(ctx) {
  if (ctx.totalGoals < 7) return null;
  return {
    id: "high_scoring",
    category: CATEGORY.TACTICAL,
    type: TYPE.TACTICAL,
    severity: SEVERITY.LOW,
    icon: "🎆",
    title: "Yüksek skorlu maç",
    body: `${ctx.totalGoals} gol — açık alan, sıkı hücum.`,
    evidence: {
      label: "Toplam gol",
      metrics: [{ k: "Gol", v: ctx.totalGoals }],
    },
  };
}

// Düşük skorlu / defansif maç
function ruleDefensive(ctx) {
  if (ctx.totalGoals > 1) return null;
  if (ctx.events.length < 3) return null; // yeterince veri yoksa atla
  return {
    id: "defensive",
    category: CATEGORY.TACTICAL,
    type: TYPE.TACTICAL,
    severity: SEVERITY.LOW,
    icon: "🛡",
    title: "Defansif maç",
    body: `Toplam ${ctx.totalGoals} gol — savunma ağır bastı.`,
    evidence: {
      label: "Skor",
      metrics: [{ k: "A", v: ctx.scoreA }, { k: "B", v: ctx.scoreB }],
    },
  };
}

// Goal type baskınlığı — gollerin %50+'ı tek tür ise (penalty/freekick/header)
function ruleGoalTypeDominance(ctx) {
  const { normal, penalty, freekick, header } = ctx.goalTypes;
  const total = normal + penalty + freekick + header;
  if (total < 3) return null;

  const labels = { penalty: "penaltı", freekick: "serbest vuruş", header: "kafa" };
  for (const t of ["penalty", "freekick", "header"]) {
    const c = ctx.goalTypes[t];
    if (c >= 3 || (c / total >= 0.5 && c >= 2)) {
      return {
        id: `goal_type_${t}`,
        category: CATEGORY.TACTICAL,
        type: TYPE.TACTICAL,
        severity: SEVERITY.LOW,
        icon: t === "penalty" ? "⚖️" : t === "freekick" ? "🎯" : "💥",
        title: `${labels[t][0].toUpperCase() + labels[t].slice(1)} ağırlıklı maç`,
        body: `${total} golün ${c}'i ${labels[t]} pozisyonundan.`,
        evidence: {
          label: "Gol türü",
          metrics: [{ k: labels[t], v: c }, { k: "Toplam", v: total }],
        },
      };
    }
  }
  return null;
}

// Own goal dramı — bir takım own goal yemişse
function ruleOwnGoal(ctx) {
  const ogs = ctx.events.filter(e => e.type === "own_goal");
  if (ogs.length === 0) return null;
  const player = ogs[0].playerId ? ctx.perPlayer[ogs[0].playerId] : null;
  return {
    id: "own_goal",
    category: CATEGORY.TACTICAL,
    type: TYPE.WARNING,
    severity: SEVERITY.LOW,
    icon: "😬",
    title: ogs.length === 1 ? "Kendi kalesine" : `${ogs.length} kendi kalesine`,
    body: player
      ? `${player.name} talihsiz bir an yaşadı.`
      : "Talihsiz bir anla skora yansıdı.",
    evidence: {
      label: "Own goal",
      metrics: [{ k: "Adet", v: ogs.length }],
    },
  };
}

// ═══════════════════════════════════════════════════════════
// RULES — TREND kategorisi (geçmiş gerekli)
// ═══════════════════════════════════════════════════════════

// Mevcut maçta oynayan oyuncuların geçmiş istatistiklerinden trend çıkar
function buildHistoryStats(history) {
  // Aynı playerId aynı kişi varsayımı — şu an üst limit, ileride normalize edebilirsin
  if (!history || history.length === 0) return null;
  // Lazy import yerine inline mini-aggregate:
  const stats = {};
  for (const m of history) {
    const snaps = m.playerSnapshots || {};
    const events = m.events || [];
    for (const pid of Object.keys(snaps)) {
      if (!stats[pid]) {
        stats[pid] = {
          name: nameOf(snaps[pid]),
          matches: [],
        };
      }
      const goals = events.filter(e => e.type === "goal" && e.playerId === pid).length;
      const assists = events.filter(e => e.type === "goal" && e.assistPlayerId === pid).length;
      const side = snaps[pid].side;
      const aWon = m.teamA.score > m.teamB.score;
      const bWon = m.teamB.score > m.teamA.score;
      const draw = m.teamA.score === m.teamB.score;
      const result = draw ? "D" : ((side === "A" && aWon) || (side === "B" && bWon)) ? "W" : "L";
      stats[pid].matches.push({
        playedAt: m.playedAt,
        goals, assists, result,
      });
    }
  }
  // En yeni → en eski sırala
  Object.values(stats).forEach(s => {
    s.matches.sort((a, b) => b.playedAt - a.playedAt);
  });
  return stats;
}

// Scoring streak — bu maçta oynayan ve son N maçta her maç gol atan oyuncu
function ruleScoringStreak(ctx, histStats) {
  if (!histStats) return null;
  const results = [];
  // Bu maçta sahada olan ve önceki maçlardan veri olan oyuncular
  for (const pid of Object.keys(ctx.perPlayer)) {
    const hist = histStats[pid];
    if (!hist || hist.matches.length < 3) continue;
    // Bu maçı dahil etme — sadece geçmişe bak (history zaten bu maçı içermez)
    const streak = scoringStreak(hist.matches.slice(0, 5), 3);
    if (streak >= 3 && ctx.perPlayer[pid].goals > 0) {
      // Bu maç da gole geçti → 3+ maç gol formu devam ediyor
      results.push({
        id: `scoring_streak_${pid}`,
        category: CATEGORY.TREND,
        type: TYPE.POSITIVE,
        severity: SEVERITY.MEDIUM,
        icon: "🔥",
        title: `${ctx.perPlayer[pid].name} — Gol formunda`,
        body: `Son ${streak + 1} maçta her maç gol attı.`,
        evidence: {
          label: "Form",
          metrics: [{ k: "Maç", v: streak + 1 }, { k: "Gol", v: "her maç" }],
        },
      });
    }
  }
  return results.length > 0 ? results : null;
}

// Win streak — bu maçı kazanan tarafta oynayan oyuncu için
function ruleWinStreak(ctx, histStats) {
  if (!histStats) return null;
  if (ctx.isDraw) return null;
  const winningSide = ctx.aWon ? "A" : "B";

  const results = [];
  for (const pid of Object.keys(ctx.perPlayer)) {
    if (ctx.perPlayer[pid].side !== winningSide) continue;
    const hist = histStats[pid];
    if (!hist || hist.matches.length < 2) continue;
    const streak = winStreak(hist.matches.slice(0, 5));
    if (streak >= 2) {
      results.push({
        id: `win_streak_${pid}`,
        category: CATEGORY.TREND,
        type: TYPE.POSITIVE,
        severity: SEVERITY.LOW,
        icon: "📈",
        title: `${ctx.perPlayer[pid].name} — Galibiyet serisi`,
        body: `${streak + 1} maçtır galip. Form uçuyor.`,
        evidence: {
          label: "Streak",
          metrics: [{ k: "Galibiyet", v: streak + 1 }],
        },
        playerId: pid, // dedupe için
      });
    }
  }
  // Aynı insight'ı 3+ kez gösterme — en uzun streak'i seç
  if (results.length === 0) return null;
  results.sort((a, b) => (b.evidence.metrics[0].v) - (a.evidence.metrics[0].v));
  return results.slice(0, 2);
}

// Sezonun en üretken ikilisi — history'de aynı çiftin toplam gol+asist sayısı
function ruleSeasonTopPair(ctx) {
  if (!ctx.history || ctx.history.length < 3) return null;
  const pairTotals = {}; // `${scorer}|${assister}` → count
  for (const m of ctx.history) {
    for (const e of m.events || []) {
      if (e.type === "goal" && e.playerId && e.assistPlayerId) {
        const key = `${e.playerId}|${e.assistPlayerId}`;
        pairTotals[key] = (pairTotals[key] || 0) + 1;
      }
    }
  }
  const top = Object.entries(pairTotals)
    .map(([k, v]) => ({ key: k, count: v }))
    .sort((a, b) => b.count - a.count)[0];
  if (!top || top.count < 3) return null;

  // Bu maçta bu ikili de gol üretmiş mi?
  const [sId, aId] = top.key.split("|");
  const matchPairScore = ctx.pairs[top.key] || 0;
  if (matchPairScore === 0) return null; // bu maçta yoksa trend olarak gösterme

  const scorerName = ctx.perPlayer[sId]?.name || nameOf(ctx.snaps[sId]);
  const assisterName = ctx.perPlayer[aId]?.name || nameOf(ctx.snaps[aId]);

  return {
    id: "season_top_pair",
    category: CATEGORY.TREND,
    type: TYPE.POSITIVE,
    severity: SEVERITY.MEDIUM,
    icon: "💎",
    title: `Sezonun ikilisi: ${assisterName} → ${scorerName}`,
    body: `Geçmişte birlikte ${top.count} gol ürettiler. Bu maçta da gole geçtiler.`,
    evidence: {
      label: "Sezon toplamı",
      metrics: [{ k: "Birlikte gol", v: top.count }],
    },
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN — kuralları çalıştır, sırala, grupla
// ═══════════════════════════════════════════════════════════

const STARS_RULES = [
  ruleMVP,
  ruleHatTrick,
  ruleBrace,
  ruleBestChemistry,
  ruleTopAssister,
  ruleCleanSheet,
];

const TACTICAL_RULES = [
  ruleComeback,
  ruleHalfImbalance,
  ruleHighScoring,
  ruleDefensive,
  ruleGoalTypeDominance,
  ruleOwnGoal,
];

const TREND_RULES = [
  // bunlar histStats parametresi alır, ayrı çalıştırılacak
];

// Severity → sayısal puan (sıralama için)
const sevScore = (s) =>
  s === SEVERITY.HIGH ? 3 : s === SEVERITY.MEDIUM ? 2 : 1;

// Bir kuralı çağır — null/array/insight döndürebilir → flat array yap
function runRule(rule, ctx, extra) {
  try {
    const r = rule(ctx, extra);
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  } catch (e) {
    console.warn(`[insights] kural çalışmadı: ${rule.name}`, e);
    return [];
  }
}

/**
 * Ana API — bir maç ve geçmişten içgörü listesi çıkarır.
 *
 * @param {Match} match — Mevcut maç
 * @param {Match[]} history — Geçmiş maçlar (bu maç DAHİL EDİLMEMELİ)
 * @returns {{ stars: Insight[], tactical: Insight[], trend: Insight[], all: Insight[] }}
 */
export function computeMatchInsights(match, history = []) {
  if (!match) return { stars: [], tactical: [], trend: [], all: [] };

  const ctx = buildContext(match, history);
  const histStats = buildHistoryStats(history);

  // STARS
  const stars = STARS_RULES.flatMap(r => runRule(r, ctx));

  // TACTICAL
  const tactical = TACTICAL_RULES.flatMap(r => runRule(r, ctx));

  // TREND
  const trend = [
    ...runRule(ruleScoringStreak, ctx, histStats),
    ...runRule(ruleWinStreak, ctx, histStats),
    ...runRule(ruleSeasonTopPair, ctx, histStats),
  ];

  // Severity sırala her grupta
  const bySeverity = (a, b) => sevScore(b.severity) - sevScore(a.severity);
  stars.sort(bySeverity);
  tactical.sort(bySeverity);
  trend.sort(bySeverity);

  return {
    stars,
    tactical,
    trend,
    all: [...stars, ...tactical, ...trend],
  };
}

// Convenience: tüm history'yi tek seferde
export function computeMatchInsightsFromHistory(matchId, allMatches) {
  const m = allMatches.find(x => x.id === matchId);
  if (!m) return { stars: [], tactical: [], trend: [], all: [] };
  const history = allMatches.filter(x => x.id !== matchId);
  return computeMatchInsights(m, history);
}