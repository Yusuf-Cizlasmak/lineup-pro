// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Team Balancer (Adil Takım Kurucu)
// ─────────────────────────────────────────────────────────────
// Seçili oyuncu listesinden güç + pozisyon açısından dengeli iki takım üretir.
// Saf JS — backend yok, AI yok. playerAttributes ile birebir uyumlu.
//
// Kullanım:
//   import { buildBalancedTeams } from "./teamBalancer";
//   const result = buildBalancedTeams(players, { formByPlayerId });
//   // result = { teamA, teamB, ratingA, ratingB, diff, balance }
//
//   // "Karıştır" butonu → her çağrı farklı ama hep dengeli sonuç:
//   const next = buildBalancedTeams(players, { seed: Math.random() });
//
// players[]: { id, name, surname?, position, rating, attributes? }
// ─────────────────────────────────────────────────────────────

import {
  computeOverallFromAttributes,
  getEffectiveRating,
  isGoalkeeper,
} from "./playerAttributes";
import { isPresent } from "./roster";

// ═══ Bir oyuncunun "etkin gücü" ═══
// Öncelik: attributes → overall. Yoksa rating. Form verisi varsa eklenir.
function strengthOf(player, formByPlayerId) {
  let base = null;
  if (player.attributes) {
    base = computeOverallFromAttributes(player.attributes, player.position);
  }
  if (base == null) base = typeof player.rating === "number" ? player.rating : 70;

  const formDelta = formByPlayerId ? formByPlayerId[player.id] : null;
  if (typeof formDelta === "number") {
    return getEffectiveRating(base, formDelta);
  }
  return base;
}

// ═══ Pozisyon → kaba rol grubu (pozisyon dengesi için) ═══
function roleOf(position) {
  if (isGoalkeeper(position)) return "GK";
  switch (position) {
    case "DEFANS":
    case "STOPER":
    case "SOL BEK":
    case "SAĞ BEK":
      return "DEF";
    case "ORTA SAHA":
      return "MID";
    case "FORVET":
      return "FWD";
    default:
      return "MID";
  }
}

// ═══ Seedli RNG — "Karıştır" her seferinde farklı ama deterministik ═══
function makeRng(seed) {
  let s = (Math.floor(seed * 1e9) || Date.now()) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══ Pozisyon dengesizliği maliyeti ═══
// İki takımın rol dağılımı ne kadar farklıysa o kadar yüksek.
function positionCost(teamA, teamB) {
  const roles = ["GK", "DEF", "MID", "FWD"];
  const countRoles = (team) => {
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    team.forEach((p) => { c[roleOf(p.position)]++; });
    return c;
  };
  const ca = countRoles(teamA);
  const cb = countRoles(teamB);
  let cost = 0;
  roles.forEach((r) => {
    let w = 1;
    if (r === "GK") w = 6;   // kaleci dengesi en kritik
    if (r === "DEF") w = 2;
    cost += Math.abs(ca[r] - cb[r]) * w;
  });
  return cost;
}

// ═══ Tek bir aday bölüştürme (LPT — Longest Processing Time greedy) ═══
// Kaleciler önce, dengeli şekilde. Sonra kalanlar güce göre azalan sırada
// her zaman daha zayıf takıma eklenir → minimum güç farkı.
function partitionOnce(players, formByPlayerId, rng) {
  const withS = players.map((p) => ({ p, s: strengthOf(p, formByPlayerId) }));

  const gks = withS.filter((x) => isGoalkeeper(x.p.position));
  const rest = withS.filter((x) => !isGoalkeeper(x.p.position));

  const teamA = [], teamB = [];
  let sumA = 0, sumB = 0;

  // Kaleciler: güçlüden zayıfa, dönüşümlü dağıt (jitter ile çeşitlik bozulur)
  shuffle(gks, rng)
    .sort((a, b) => b.s - a.s)
    .forEach((x, i) => {
      if (i % 2 === 0) { teamA.push(x.p); sumA += x.s; }
      else { teamB.push(x.p); sumB += x.s; }
    });

  // Saha oyuncuları: güce göre azalan. Eşit güçlüleri karıştır → çeşitlilik.
  const sorted = rest
    .map((x) => ({ ...x, jitter: rng() }))
    .sort((a, b) => (b.s - a.s) || (a.jitter - b.jitter));

  sorted.forEach((x) => {
    // Daha zayıf VE daha az kalabalık takıma ekle (boyut farkı max 1)
    const sizeGap = teamA.length - teamB.length;
    let toA;
    if (sizeGap >= 1) toA = false;
    else if (sizeGap <= -1) toA = true;
    else toA = sumA <= sumB;

    if (toA) { teamA.push(x.p); sumA += x.s; }
    else { teamB.push(x.p); sumB += x.s; }
  });

  return { teamA, teamB, sumA, sumB };
}

// ═══ Swap pass — güç farkını fazla bozmadan pozisyon dengesini iyileştir ═══
function refineSwaps(state, formByPlayerId) {
  let { teamA, teamB } = state;
  let improved = true;
  let guard = 0;

  const sum = (team) => team.reduce((s, p) => s + strengthOf(p, formByPlayerId), 0);

  while (improved && guard < 30) {
    improved = false;
    guard++;
    const baseStrengthGap = Math.abs(sum(teamA) - sum(teamB));
    const basePosCost = positionCost(teamA, teamB);

    for (let i = 0; i < teamA.length && !improved; i++) {
      for (let j = 0; j < teamB.length; j++) {
        const sa = strengthOf(teamA[i], formByPlayerId);
        const sb = strengthOf(teamB[j], formByPlayerId);
        // Sadece yakın güçteki oyuncuları takasla (güç dengesini bozma)
        if (Math.abs(sa - sb) > 4) continue;

        const nextA = teamA.slice(); const nextB = teamB.slice();
        [nextA[i], nextB[j]] = [nextB[j], nextA[i]];

        const newStrengthGap = Math.abs(sum(nextA) - sum(nextB));
        const newPosCost = positionCost(nextA, nextB);

        // Pozisyon dengesi iyileşiyor ve güç farkı ciddi kötüleşmiyorsa kabul
        if (newPosCost < basePosCost && newStrengthGap <= baseStrengthGap + 2) {
          teamA = nextA; teamB = nextB;
          improved = true;
          break;
        }
      }
    }
  }
  return { teamA, teamB };
}

// ═══ ANA FONKSİYON ═══
// options:
//   formByPlayerId : { [playerId]: formDelta }  — opsiyonel, varsa etkin güç kullanılır
//   seed           : number                     — "Karıştır" için (her çağrı farklı)
//   restarts       : number                     — random restart sayısı (default 12)
// ★ Bu hafta gelmeyen (p.absent) oyuncular otomatik olarak dışarıda bırakılır.
export function buildBalancedTeams(players, options = {}) {
  const list = (players || []).filter(isPresent);
  if (list.length < 2) {
    return { teamA: list, teamB: [], ratingA: 0, ratingB: 0, diff: 0, balance: 100, error: "min_2_players" };
  }

  const { formByPlayerId = null, seed = Math.random(), restarts = 12 } = options;
  const rng = makeRng(seed);

  // Birden çok random restart → en küçük (güç farkı + pozisyon maliyeti) seç
  let best = null;
  let bestCost = Infinity;

  for (let r = 0; r < restarts; r++) {
    const part = partitionOnce(list, formByPlayerId, rng);
    const refined = refineSwaps(part, formByPlayerId);

    const sumA = refined.teamA.reduce((s, p) => s + strengthOf(p, formByPlayerId), 0);
    const sumB = refined.teamB.reduce((s, p) => s + strengthOf(p, formByPlayerId), 0);
    const strengthGap = Math.abs(sumA - sumB);
    const posCost = positionCost(refined.teamA, refined.teamB);

    // Güç farkı baskın kriter, pozisyon ikincil
    const cost = strengthGap * 3 + posCost;
    if (cost < bestCost) {
      bestCost = cost;
      best = { ...refined, sumA, sumB };
    }
  }

  const avgA = best.teamA.length ? Math.round(best.sumA / best.teamA.length) : 0;
  const avgB = best.teamB.length ? Math.round(best.sumB / best.teamB.length) : 0;
  const diff = Math.abs(avgA - avgB);

  // Denge skoru: 0 fark = %100, her puan fark ~%8 düşürür
  const balance = Math.max(0, Math.min(100, Math.round(100 - diff * 8)));

  return {
    teamA: best.teamA,
    teamB: best.teamB,
    ratingA: avgA,        // takım ortalama gücü
    ratingB: avgB,
    sumA: best.sumA,      // toplam güç
    sumB: best.sumB,
    diff,                 // ortalama güç farkı
    balance,              // 0-100 denge skoru
  };
}

// Tek oyuncunun gösterilecek gücü (UI rozet için dışa açık)
export function playerStrength(player, formByPlayerId) {
  return strengthOf(player, formByPlayerId);
}