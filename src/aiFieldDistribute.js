// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · aiFieldDistribute (v2 — profesyonel mevki mantığı)
// ─────────────────────────────────────────────────────────────
// İki takımın TÜM havuzunu birleştirir, dengeli A/B'ye böler ve her takımı
// gerçek futbol mantığıyla dizilişin mevki slotlarına yerleştirir.
//
// Yenilikler (v2):
//   • Pozisyonlar arası UYUM MATRİSİ — kim nerede oynayabilir, ne kadar iyi.
//   • Kaleci KATI kural: GK slotuna yalnızca kaleci tercih; saha oyuncusu
//     ancak hiç kaleci yoksa, ağır cezayla geçer.
//   • MEVKİ DIŞI CEZASI: orta saha → bek geçince etkin gücü düşer (penalty).
//   • Her yerleşim için "tier" + "note" döner → UI'da ibare gösterilir.
//   lineup[i] = { slot, playerId, pos, tier, penalty, effStrength, note }
// ─────────────────────────────────────────────────────────────

import { buildBalancedTeams, playerStrength } from "./teamBalancer";

const M = {
  natural:     (penalty = 0)  => ({ tier: "natural", penalty }),
  comfortable: (penalty = 2)  => ({ tier: "comfortable", penalty }),
  stretch:     (penalty = 5)  => ({ tier: "stretch", penalty }),
  emergency:   (penalty = 10) => ({ tier: "emergency", penalty }),
};

const COMPAT = {
  // ── SAVUNMA HATTI: kendi içinde serbest (stoper↔defans↔bekler = 0 ceza)
  //    Bir defans oyuncusu sağ/sol bek oynayabilir, puanı düşmez.
  //    Hat atlamak cezalı: orta saha (uyumlu, küçük ceza), forvet (büyük ceza).
  "STOPER": {
    "STOPER": M.natural(), "DEFANS": M.natural(), "SOL BEK": M.natural(), "SAĞ BEK": M.natural(),
    "ORTA SAHA": M.comfortable(4), "FORVET": M.emergency(11),
  },
  "DEFANS": {
    "DEFANS": M.natural(), "STOPER": M.natural(), "SOL BEK": M.natural(), "SAĞ BEK": M.natural(),
    "ORTA SAHA": M.comfortable(4), "FORVET": M.emergency(11),
  },
  "SOL BEK": {
    "SOL BEK": M.natural(), "SAĞ BEK": M.natural(), "DEFANS": M.natural(), "STOPER": M.natural(),
    "ORTA SAHA": M.comfortable(3), "FORVET": M.stretch(8),
  },
  "SAĞ BEK": {
    "SAĞ BEK": M.natural(), "SOL BEK": M.natural(), "DEFANS": M.natural(), "STOPER": M.natural(),
    "ORTA SAHA": M.comfortable(3), "FORVET": M.stretch(8),
  },
  // ── ORTA SAHA: hem savunmaya hem hücuma bir hat uzaklıkta (uyumlu, küçük ceza)
  "ORTA SAHA": {
    "ORTA SAHA": M.natural(),
    "SOL BEK": M.comfortable(3), "SAĞ BEK": M.comfortable(3),
    "DEFANS": M.comfortable(4), "STOPER": M.comfortable(4),
    "FORVET": M.comfortable(3),
  },
  // ── FORVET: orta sahaya bir hat (uyumlu), savunmaya iki hat (acil)
  "FORVET": {
    "FORVET": M.natural(),
    "ORTA SAHA": M.comfortable(3),
    "SOL BEK": M.stretch(8), "SAĞ BEK": M.stretch(8),
    "DEFANS": M.emergency(11), "STOPER": M.emergency(13),
  },
};

const TIER_LABEL = {
  natural: "Doğal mevki",
  comfortable: "Uyumlu mevki",
  stretch: "Zorlama mevki",
  emergency: "Acil görev",
  gk_natural: "Doğal kaleci",
  gk_emergency: "Acil kaleci",
};

function compatOf(playerPos, slotRole) {
  if (slotRole === "KALECİ") {
    if (playerPos === "KALECİ") return { tier: "gk_natural", penalty: 0 };
    return { tier: "gk_emergency", penalty: 18 };
  }
  if (playerPos === "KALECİ") {
    return { tier: "emergency", penalty: 16 };
  }
  const row = COMPAT[playerPos];
  if (!row) return M.comfortable(4);
  return row[slotRole] || M.stretch(7);
}

const TIER_BONUS = {
  gk_natural: 1000, natural: 300, comfortable: 120, stretch: 30, emergency: -40, gk_emergency: -200,
};

function slotScore(playerPos, slotRole, strength) {
  const { tier, penalty } = compatOf(playerPos, slotRole);
  return (TIER_BONUS[tier] || 0) + (strength - penalty);
}

function assignToSlots(players, positions, formByPlayerId) {
  const result = Array(positions.length).fill(null);
  const meta = Array(positions.length).fill(null);
  const lineup = [];

  let pool = players.map((p) => ({
    p, s: playerStrength(p, formByPlayerId), used: false,
  }));

  const rank = { "KALECİ": 0, "STOPER": 1, "DEFANS": 1, "SOL BEK": 2, "SAĞ BEK": 2, "ORTA SAHA": 3, "FORVET": 4 };
  const order = positions
    .map((pos, idx) => ({ pos, idx }))
    .sort((a, b) => (rank[a.pos.role] ?? 9) - (rank[b.pos.role] ?? 9));

  // Bir slota oyuncu yerleştir + meta/lineup yaz
  const place = (idx, pos, candIdx) => {
    const c = pool[candIdx];
    c.used = true;
    const { tier, penalty } = compatOf(c.p.position, pos.role);
    const effStrength = Math.max(30, c.s - penalty);
    result[idx] = c.p.id;
    meta[idx] = {
      tier, penalty, effStrength, naturalStrength: c.s,
      note: TIER_LABEL[tier] || "",
      naturalPos: c.p.position, playedRole: pos.role,
      isOutOfPosition: penalty > 0 && c.p.position !== pos.role,
    };
    lineup.push({ slot: idx, playerId: c.p.id, pos, tier, penalty, effStrength, note: TIER_LABEL[tier] || "" });
  };

  // ── PASS 1 — DOĞAL MEVKİ: her slotu önce kendi mevkisindeki en güçlü oyuncu doldursun
  order.forEach(({ pos, idx }) => {
    let bestI = -1, bestS = -Infinity;
    pool.forEach((c, i) => {
      if (c.used) return;
      const { tier } = compatOf(c.p.position, pos.role);
      const isNatural = tier === "natural" || tier === "gk_natural";
      if (!isNatural) return;
      if (c.s > bestS) { bestS = c.s; bestI = i; }
    });
    if (bestI !== -1) place(idx, pos, bestI);
  });

  // ── PASS 2 — ZORUNLU DOLDUR: boş kalan slotları yedek bırakmak yerine
  //    kalan oyuncularla doldur (mevki dışı serbest, en uygun skorlu seçilir)
  order.forEach(({ pos, idx }) => {
    if (result[idx]) return; // pass 1'de doldu
    let bestI = -1, bestScore = -Infinity;
    pool.forEach((c, i) => {
      if (c.used) return;
      const sc = slotScore(c.p.position, pos.role, c.s);
      if (sc > bestScore) { bestScore = sc; bestI = i; }
    });
    if (bestI !== -1) place(idx, pos, bestI);
  });
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < lineup.length; a++) {
      for (let b = a + 1; b < lineup.length; b++) {
        const la = lineup[a], lb = lineup[b];
        const pa = players.find((x) => x.id === la.playerId);
        const pb = players.find((x) => x.id === lb.playerId);
        if (!pa || !pb) continue;
        const sa = playerStrength(pa, formByPlayerId);
        const sb = playerStrength(pb, formByPlayerId);

        const curr = slotScore(pa.position, la.pos.role, sa) + slotScore(pb.position, lb.pos.role, sb);
        const swap = slotScore(pa.position, lb.pos.role, sa) + slotScore(pb.position, la.pos.role, sb);

        if (swap > curr + 1) {
          [la.playerId, lb.playerId] = [lb.playerId, la.playerId];
          result[la.slot] = la.playerId;
          result[lb.slot] = lb.playerId;
          const recompute = (l) => {
            const pl = players.find((x) => x.id === l.playerId);
            const s = playerStrength(pl, formByPlayerId);
            const { tier, penalty } = compatOf(pl.position, l.pos.role);
            l.tier = tier; l.penalty = penalty;
            l.effStrength = Math.max(30, s - penalty);
            l.note = TIER_LABEL[tier] || "";
            meta[l.slot] = {
              tier, penalty, effStrength: l.effStrength, naturalStrength: s,
              note: l.note, naturalPos: pl.position, playedRole: l.pos.role,
              isOutOfPosition: penalty > 0 && pl.position !== l.pos.role,
            };
          };
          recompute(la); recompute(lb);
        }
      }
    }
  }

  const bench = pool.filter((c) => !c.used).map((c) => c.p.id);

  let captain = null, capStr = -1;
  lineup.forEach((l) => {
    if (l.effStrength > capStr) { capStr = l.effStrength; captain = l.playerId; }
  });

  const rating = lineup.length
    ? Math.round(lineup.reduce((a, l) => a + l.effStrength, 0) / lineup.length)
    : 0;

  const outOfPos = lineup.filter((l) => l.penalty > 0 && (meta[l.slot]?.isOutOfPosition)).length;
  const emergencyGK = lineup.some((l) => l.tier === "gk_emergency");

  // Animasyon sırası: slot önem sırası (kaleci→savunma→orta→forvet)
  lineup.sort((a, b) => (rank[a.pos.role] ?? 9) - (rank[b.pos.role] ?? 9));

  return { result, meta, lineup, bench, captain, rating, outOfPos, emergencyGK };
}

function dedup(players) {
  const seen = new Set(), out = [];
  (players || []).forEach((p) => { if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); } });
  return out;
}

export function distributeToField({
  teamA, teamB, positionsA, positionsB, formByPlayerId = null, seed = Math.random(),
}) {
  const pool = dedup([...(teamA?.players || []), ...(teamB?.players || [])]);
  if (pool.length < 2) return { error: "min_2_players", pool };

  const balanced = buildBalancedTeams(pool, { formByPlayerId, seed });

  const A = assignToSlots(balanced.teamA, positionsA, formByPlayerId);
  const B = assignToSlots(balanced.teamB, positionsB, formByPlayerId);

  const diff = Math.abs(A.rating - B.rating);
  const balance = Math.max(0, Math.min(100, Math.round(100 - diff * 8)));

  return {
    A: { players: balanced.teamA, fieldPlayers: A.result, meta: A.meta,
         captain: A.captain, lineup: A.lineup, bench: A.bench, rating: A.rating,
         outOfPos: A.outOfPos, emergencyGK: A.emergencyGK },
    B: { players: balanced.teamB, fieldPlayers: B.result, meta: B.meta,
         captain: B.captain, lineup: B.lineup, bench: B.bench, rating: B.rating,
         outOfPos: B.outOfPos, emergencyGK: B.emergencyGK },
    balance, diff, poolSize: pool.length,
    totalOutOfPos: A.outOfPos + B.outOfPos,
    hasEmergencyGK: A.emergencyGK || B.emergencyGK,
  };
}

export { compatOf, TIER_LABEL };