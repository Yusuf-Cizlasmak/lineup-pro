// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Kasa — saha ücretini böl, kim ödedi takip et
// ─────────────────────────────────────────────────────────────
// Tamamen cihazda (localStorage "halisaha_kasa"). Sunucu yok.
//
//   • Maç başına ücret: haftalık plandaki saha ücreti (düzenlenebilir)
//   • Katılımcılar: maç kaydındaki oyuncular (playerSnapshots). Kayıt zaten
//     sadece GELENLERİ içerir (absent yazılmaz, örnek oyuncu yazılmaz);
//     misafirler (+1) DAHİL — onlar da sahaya para veriyor.
//   • Kişi başı = toplam / kişi → 5 TL'ye yukarı yuvarlanır
//   • "Ödedi" işaretleri: maç id + oyuncu adı (normalize) anahtarıyla
//   • Birikmiş borç: Kasa'da açılmış (takip edilen) maçlar üzerinden
//     "Mehmet 2 maçtır borçlu"
//
// Şema:
//   {
//     fees:   { [matchId]: number }               // takip edilen maç → saha ücreti
//     paid:   { [matchId]: { [nameKey]: true } }  // ödeyenler
//     auto:   [matchId, …]                        // otomatik açılmış maçlar (bir kez)
//   }
// ─────────────────────────────────────────────────────────────

import { getAllMatches } from "./matchHistoryStore";
import { getSchedule, perHeadFee } from "./matchSchedule";
import { normalizeName } from "./roster";

const STORAGE_KEY = "halisaha_kasa";
const MAX_TRACKED = 60; // eski maç kayıtlarını şişirmeyelim

export { perHeadFee };

// ═══ I/O ═══
const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") throw new Error("empty");
    return {
      fees: raw.fees && typeof raw.fees === "object" ? raw.fees : {},
      paid: raw.paid && typeof raw.paid === "object" ? raw.paid : {},
      auto: Array.isArray(raw.auto) ? raw.auto : [],
    };
  } catch {
    return { fees: {}, paid: {}, auto: [] };
  }
};

const write = (db) => {
  try {
    // Kapasite: en fazla MAX_TRACKED maç tut (silinmiş maçların kaydı da temizlenir)
    const alive = new Set(getAllMatches().map((m) => m.id));
    const ids = Object.keys(db.fees).filter((id) => alive.has(id));
    const keep = new Set(ids.slice(-MAX_TRACKED));
    const fees = {}; const paid = {};
    keep.forEach((id) => {
      fees[id] = db.fees[id];
      if (db.paid[id]) paid[id] = db.paid[id];
    });
    const auto = db.auto.filter((id) => alive.has(id)).slice(-MAX_TRACKED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fees, paid, auto }));
  } catch {}
  try { window.dispatchEvent(new CustomEvent("halisaha:kasa-changed")); } catch {}
};

// ═══ Maç & katılımcılar ═══
export const nameKey = (name) => normalizeName(name);

// Kasa'ya girebilecek maçlar — yeni → eski
export const getKasaMatches = () => {
  let all = [];
  try { all = getAllMatches() || []; } catch { all = []; }
  return all
    .filter((m) => m && !m.isDemo)
    .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
};

// Maçın katılımcıları: [{ key, name, isGuest }] — aynı isim iki kez sayılmaz
export const matchAttendees = (match) => {
  if (!match) return [];
  const seen = new Set();
  const out = [];
  Object.values(match.playerSnapshots || {}).forEach((s) => {
    if (!s || s.isDemo === true || s.absent === true) return;
    const name = `${(s.name || "").trim()} ${(s.surname || "").trim()}`.trim() || "İsimsiz";
    const key = nameKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, name, isGuest: s.isGuest === true });
  });
  return out.sort((a, b) => Number(a.isGuest) - Number(b.isGuest) || a.name.localeCompare(b.name, "tr"));
};

// ═══ Ücret ═══
export const isTracked = (matchId) => {
  const db = read();
  return Object.prototype.hasOwnProperty.call(db.fees, matchId);
};

// Kayıtlı ücret yoksa planın ücreti (0 olabilir)
export const getMatchFee = (matchId) => {
  const db = read();
  if (matchId && Object.prototype.hasOwnProperty.call(db.fees, matchId)) {
    return Math.max(0, Number(db.fees[matchId]) || 0);
  }
  return Math.max(0, Number(getSchedule()?.fee) || 0);
};

// Maçı takibe al / ücretini değiştir
export const setMatchFee = (matchId, fee) => {
  if (!matchId) return;
  const db = read();
  db.fees[matchId] = Math.max(0, Math.round(Number(fee) || 0));
  write(db);
};

// Kasa bir maç için açıldığında çağrılır: ücret > 0 ise maç takibe alınır
export const trackMatch = (matchId) => {
  if (!matchId || isTracked(matchId)) return;
  const fee = getMatchFee(matchId);
  if (fee > 0) setMatchFee(matchId, fee);
};

// ═══ Ödemeler ═══
export const getPaidMap = (matchId) => ({ ...(read().paid[matchId] || {}) });

export const isPaid = (matchId, name) => !!read().paid[matchId]?.[nameKey(name)];

export const setPaid = (matchId, name, paid) => {
  if (!matchId) return;
  const db = read();
  if (!Object.prototype.hasOwnProperty.call(db.fees, matchId)) db.fees[matchId] = getMatchFee(matchId);
  const key = nameKey(name);
  const map = { ...(db.paid[matchId] || {}) };
  if (paid) map[key] = true; else delete map[key];
  db.paid[matchId] = map;
  write(db);
};

export const togglePaid = (matchId, name) => {
  const next = !isPaid(matchId, name);
  setPaid(matchId, name, next);
  return next;
};

export const setAllPaid = (matchId, paid = true) => {
  const match = getKasaMatches().find((m) => m.id === matchId);
  if (!match) return;
  const db = read();
  if (!Object.prototype.hasOwnProperty.call(db.fees, matchId)) db.fees[matchId] = getMatchFee(matchId);
  const map = {};
  if (paid) matchAttendees(match).forEach((a) => { map[a.key] = true; });
  db.paid[matchId] = map;
  write(db);
};

// ═══ Özet ═══
// Tek maç: { fee, count, perHead, collected, unpaid: [names], paidCount }
export const summarizeMatchKasa = (match, feeOverride) => {
  const attendees = matchAttendees(match);
  const fee = feeOverride != null ? Math.max(0, Number(feeOverride) || 0) : getMatchFee(match?.id);
  const perHead = perHeadFee(fee, attendees.length);
  const paidMap = match ? getPaidMap(match.id) : {};
  const unpaid = attendees.filter((a) => !paidMap[a.key]);
  const paidCount = attendees.length - unpaid.length;
  return {
    fee,
    count: attendees.length,
    perHead,
    attendees,
    paidMap,
    paidCount,
    collected: paidCount * perHead,
    unpaid: unpaid.map((a) => a.name),
  };
};

// Birikmiş borçlar — sadece takip edilen (Kasa'da açılmış, ücreti > 0) maçlar.
// excludeMatchId: o an ekranda olan maç (ayrıca gösteriliyor)
// → [{ key, name, matches, amount }] borç sayısına göre azalan
export const computeBalances = (excludeMatchId = null) => {
  const db = read();
  const byKey = {};
  getKasaMatches().forEach((m) => {
    if (m.id === excludeMatchId) return;
    if (!Object.prototype.hasOwnProperty.call(db.fees, m.id)) return;
    const fee = Math.max(0, Number(db.fees[m.id]) || 0);
    if (fee <= 0) return;
    const attendees = matchAttendees(m);
    const per = perHeadFee(fee, attendees.length);
    const paid = db.paid[m.id] || {};
    attendees.forEach((a) => {
      if (paid[a.key]) return;
      const row = byKey[a.key] || (byKey[a.key] = { key: a.key, name: a.name, matches: 0, amount: 0 });
      row.matches += 1;
      row.amount += per;
    });
  });
  return Object.values(byKey).sort((a, b) => b.matches - a.matches || b.amount - a.amount);
};

// "Mehmet 2 maçtır borçlu"
export const debtLabel = (row) =>
  row.matches > 1 ? `${row.name} ${row.matches} maçtır borçlu` : `${row.name} 1 maç borçlu`;

// ═══ WhatsApp metni ═══
// footer: SHARE_FOOTER (Free) ya da "" (Pro → alt bilgi yok)
export const buildKasaShareText = (match, { fee, iban, footer = "" } = {}) => {
  const sum = summarizeMatchKasa(match, fee);
  const lines = [`Saha ${sum.fee}₺ · Kişi başı ${sum.perHead}₺`];
  lines.push(sum.unpaid.length ? `Ödemeyenler: ${sum.unpaid.join(", ")}` : "Herkes ödedi ✅");
  const old = computeBalances(match?.id).filter((r) => r.matches > 0);
  if (old.length) {
    lines.push(`Eski borçlar: ${old.slice(0, 8).map((r) => `${r.name} (${r.matches} maç)`).join(", ")}`);
  }
  const ib = String(iban || "").trim();
  if (ib) lines.push(`IBAN: ${ib}`);
  let text = lines.join("\n");
  if (footer) text += `\n\n${footer}`;
  return text;
};

// ═══ Otomatik açılış (maç kaydı sonrası, maç başına bir kez) ═══
export const wasAutoOpened = (matchId) => read().auto.includes(matchId);
export const markAutoOpened = (matchId) => {
  if (!matchId) return;
  const db = read();
  if (!db.auto.includes(matchId)) db.auto.push(matchId);
  write(db);
};
