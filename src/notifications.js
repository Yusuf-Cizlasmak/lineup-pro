// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · notifications — Akıllı maç hatırlatmaları (local)
// ─────────────────────────────────────────────────────────────
// Push sunucusu GEREKMEZ — hepsi cihazda planlanır.
//
// ★ İLKELER
//   • İzin uygulama açılışında İSTENMEZ. İzin, değer anında uygulama içi
//     ön-izin ekranıyla (NotifPermissionPrompt) istenir.
//   • Tüm bildirimler TEK SEFERLİK ve her fırsatta YENİDEN HESAPLANIR:
//     uygulama açılışı / öne gelme, plan değişimi, maç kaydı.
//     (önce bizim tüm id'lerimiz iptal → sonra güncel veriyle yeniden kurulur)
//   • Takvim günü başına EN FAZLA 1 bildirim. Tek istisna maç günü:
//     maç öncesi + maç sonrası (en fazla 2).
//   • Gece 00:00–08:59 arası bildirim yok (sabaha kaydırılır).
//   • Sahte aciliyet yok; metinler gerçek veriden üretilir.
//   • Her bildirim extra: { route, kind } taşır → dokununca ilgili ekran açılır.
//
// ★ HAFTALIK PLAN VARSA (az önce oynanan + sıradaki 2 maç):
//   (a) maçtan 1 gün önce 20:00 → "Yarın 21:00 … Kim geliyor?"        route attendance
//   (b) maç günü T-3 saat        → "Bu akşam 21:00 maç var …"           route ai_split
//   (c) maç bitişi + 60 dk       → "Maç nasıl bitti? Skoru gir …"       route result
//   (d) ertesi gün 12:00         → "Dünkü maçı kaydetmedin …"           route result
//                                  (maç kaydedilince yeniden hesap → iptal)
//   (e) Pazartesi 10:00 haftalık özet (geçen hafta maç kaydedildiyse)  route stats
//   (f) ücret > 0 ise maç bitişi + 2 saat → "Saha 1400₺, kişi başı 100₺" route kasa
//
// ★ PLAN YOKSA: son açılıştan 3 / 10 / 30 gün sonra 19:30 (en fazla 3), gerçek
//   veriyle ("Ali hâlâ gol kralı (12 gol)") ya da haftalık maç saatini kurmaya davet.
//
// ★ DURUM BİLDİRİMİ (HaliSahaKolik → scheduleContextNotifications):
//   kadro eksik / hiç maç yok / AI denenmedi … → en fazla 1 tane, cooldown'lu.
//
// ★ ÖZEL ROUTE'LAR (halisaha:navigate dışında):
//   "kasa"     → window "halisaha:open-kasa" { matchId? }
//   "schedule" → window "halisaha:open-schedule"
//
// KULLANIM (App.js):
//   initNotifications();            // kanal + dokunma dinleyicisi (izin İSTEMEZ)
//   refreshNotifications("boot");   // açılış / resume / maç kaydı / plan değişimi
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { track, EVENTS } from "./analytics";
import { getAllMatches, computeLeaderboards } from "./matchHistoryStore";
import { getSchedule, nextMatchDate, perHeadFee } from "./matchSchedule";
import { matchAttendees } from "./kasa";

const CH_ID = "match_reminders";
const LEGACY_CH_ID = "reengage"; // eski "eğlenceli geri-getirme" kanalı — silinir

function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  return LocalNotifications;
}

// ═══ ID ARALIKLARI — sadece bunlara dokunuruz ═══
//   91000–91099  eski rastgele geri-getirme (temizlik için iptal edilir)
//   92000–92099  eski durum/karşılama bildirimleri (temizlik için iptal edilir)
//   93000–93029  haftalık plan: 93000 + occ*10 + slot
//                occ 0 = az önce oynanan, 1 = sıradaki, 2 = bir sonraki maç
//   93100        haftalık özet
//   93110–93112  geri-getirme (plan yokken)
//   93120        durum bildirimi
const OUR_ID_MIN = 91000;
const OUR_ID_MAX = 93999;
const SLOT = { eve: 0, today: 1, result: 2, missed: 3, kasa: 4 };
const schedId = (occ, slot) => 93000 + occ * 10 + slot;
const DIGEST_ID = 93100;
const reengageId = (i) => 93110 + i;
const CTX_ID = 93120;
const KNOWN_IDS = (() => {
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push(91000 + i, 92000 + i);
  ids.push(92050); // eski "hoş geldin" bildirimi
  for (let occ = 0; occ < 3; occ++) Object.values(SLOT).forEach((s) => ids.push(schedId(occ, s)));
  ids.push(DIGEST_ID, reengageId(0), reengageId(1), reengageId(2), CTX_ID);
  return ids;
})();

// Çakışmada hangisi kalır (büyük = önemli)
const PRIO = {
  sched_today: 100,
  sched_result: 95,
  sched_eve: 90,
  sched_missed: 80,
  sched_kasa: 70,
  digest: 60,
  context: 40,
  reengage: 30,
};

const LEDGER_KEY = "halisaha_notif_ledger";  // { planned: [{kind,key,at}], sent: {kind[:key]: ts} }
const CTX_STATE_KEY = "halisaha_ctx_state";  // son durum (HaliSahaKolik'ten)

// ═══ ZAMAN YARDIMCILARI ═══
const MIN = 60000;
const HOUR = 60 * MIN;
const QUIET_END_HOUR = 9; // 00:00–08:59 sessiz

const pad2 = (n) => String(n).padStart(2, "0");
const addMin = (d, mins) => new Date(d.getTime() + mins * MIN);
// base gününden dayOffset gün sonra, saat h:m
const atDay = (base, dayOffset, h, m = 0) => {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const sameDay = (a, b) => dayKey(a) === dayKey(b);
const isQuiet = (d) => d.getHours() < QUIET_END_HOUR;
const timeOf = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// ═══ VERİ YARDIMCILARI ═══
const realMatches = (matches) =>
  (matches || []).filter((m) => m && !m.isDemo && Number(m.playedAt) > 0);

// Planlanan maç için kayıt var mı? (başlangıçtan 2 sa önce – 36 sa sonrası)
const findSavedFor = (matches, start) => {
  const s = start.getTime();
  return matches.find((m) => m.playedAt >= s - 2 * HOUR && m.playedAt <= s + 36 * HOUR) || null;
};

// Krallık satırı gerçek oyuncu mu? (misafir / örnek oyuncu tabloya girmez)
const okLeader = (e) =>
  !!(e && e.info && !e.info.isGuest && !e.info.isDemo && String(e.info.name || e.info.surname || "").trim());
const nameOf = (info) => String(info?.name || "").trim() || String(info?.surname || "").trim();

const leadersOf = (matches) => {
  if (!matches.length) return {};
  try {
    const lb = computeLeaderboards(matches);
    return {
      scorer: (lb.topScorers || []).find(okLeader) || null,
      mvp: (lb.mvps || []).find(okLeader) || null,
    };
  } catch {
    return {};
  }
};

// "Kartallar 7–5" (kazanan önde) · beraberlik: "Kartallar 5–5 Aslanlar"
const scoreLine = (m) => {
  const a = m?.teamA || {};
  const b = m?.teamB || {};
  const sa = Number(a.score) || 0;
  const sb = Number(b.score) || 0;
  const an = a.name || "Takım A";
  const bn = b.name || "Takım B";
  if (sa === sb) return `${an} ${sa}–${sb} ${bn}`;
  return sa > sb ? `${an} ${sa}–${sb}` : `${bn} ${sb}–${sa}`;
};

// ═══════════════════════════════════════════════════════════
// ADAY ÜRETİCİLER — saf fonksiyonlar (I/O yok, test edilebilir)
// Aday: { id, kind, route, title, body, at: Date, pair?, fallbacks?: Date[], key?, matchId? }
// ═══════════════════════════════════════════════════════════

// ─── Haftalık plan zinciri (a)–(d), (f) ───
function scheduleCandidates(now, s, matches) {
  const out = [];
  const next = nextMatchDate(now, s);
  if (!next) return out;
  // occ 0: az önce oynanan · 1: sıradaki · 2: bir sonraki
  const occs = [-7, 0, 7].map((off) => {
    const d = new Date(next);
    d.setDate(d.getDate() + off);
    return d;
  });
  const pitch = s.pitch ? ` ${s.pitch}` : "";

  occs.forEach((start, occ) => {
    // Plan bu maçtan SONRA kurulduysa geçmiş maç için hatırlatma yapma
    if (occ === 0 && (!s.setAt || s.setAt > start.getTime())) return;
    const end = addMin(start, s.durationMin || 60);
    const saved = findSavedFor(matches, start);
    const pair = `occ${occ}`; // maç günü öncesi + sonrası aynı güne düşebilir
    const t = timeOf(start);
    const h = start.getHours();

    // (a) Maçtan bir gün önce 20:00 — kim geliyor?
    out.push({
      id: schedId(occ, SLOT.eve), kind: "sched_eve", route: "attendance", pair,
      at: atDay(start, -1, 20, 0),
      title: `Yarın ${t}${pitch} ⚽`,
      body: "Kim geliyor? Listeyi yapıştır, takımları 10 saniyede kur.",
    });

    // (b) Maç günü T-3 saat — takımları kur
    let tb = addMin(start, -180);
    if (sameDay(tb, start) && isQuiet(tb)) {
      // Sabah maçı: 09:00'a çek; maça 1 saatten az kalıyorsa atla (dünkü hatırlatma yeter)
      tb = atDay(start, 0, QUIET_END_HOUR, 0);
      if (start.getTime() - tb.getTime() < HOUR) tb = null;
    }
    if (tb && !saved) {
      const when = h < 5 ? "Bu gece" : h >= 17 ? "Bu akşam" : "Bugün";
      out.push({
        id: schedId(occ, SLOT.today), kind: "sched_today", route: "ai_split", pair,
        at: tb,
        title: `${when} ${t} maç var ⚽`,
        body: "Takımları adil kur, kavga çıkmasın ⚖️",
      });
    }

    if (!saved) {
      // (c) Bitişten 1 saat sonra — skor & MVP
      let tc = addMin(end, 60);
      if (isQuiet(tc)) tc = atDay(tc, 0, 10, 0); // gece yarısını geçtiyse sabaha
      out.push({
        id: schedId(occ, SLOT.result), kind: "sched_result", route: "result", pair,
        at: tc,
        title: "Maç nasıl bitti? ⚽",
        body: "Skoru gir, MVP'yi seç 👑",
      });
      // (d) Ertesi gün 12:00 — hâlâ kaydedilmediyse
      out.push({
        id: schedId(occ, SLOT.missed), kind: "sched_missed", route: "result",
        at: atDay(start, 1, 12, 0),
        title: "Dünkü maçı kaydetmedin",
        body: "Gol krallığı güncellenmedi 👑 Skoru girmek 20 saniye sürer.",
      });
    }

    // (f) Saha ücreti — bitişten 2 saat sonra (sığmazsa ertesi gün 11:00)
    if (s.fee > 0) {
      const count = (saved && matchAttendees(saved).length) || s.playerCount || 0;
      const per = perHeadFee(s.fee, count);
      let tf = addMin(end, 120);
      if (isQuiet(tf)) tf = atDay(tf, 0, 10, 30);
      out.push({
        id: schedId(occ, SLOT.kasa), kind: "sched_kasa", route: "kasa",
        matchId: saved ? saved.id : null,
        at: tf,
        fallbacks: [atDay(start, 1, 11, 0)],
        title: per > 0 ? `Saha ${s.fee}₺, kişi başı ${per}₺ 💰` : `Saha ${s.fee}₺ 💰`,
        body: "Kasa'yı güncelle — kim ödedi, kim borçlu tek ekranda.",
      });
    }
  });
  return out;
}

// ─── (e) Haftalık özet — Pazartesi 10:00, geçen haftanın gerçek verisiyle ───
function digestCandidate(now, matches) {
  const d = atDay(now, 0, 10, 0);
  d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7)); // sıradaki Pazartesi
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  const weekEnd = atDay(d, 0, 0, 0).getTime();
  const weekStart = atDay(d, -7, 0, 0).getTime();
  const week = matches.filter((m) => m.playedAt >= weekStart && m.playedAt < weekEnd);
  if (!week.length) return null;

  const latest = [...week].sort((a, b) => b.playedAt - a.playedAt)[0];
  const parts = [week.length === 1 ? `Geçen hafta: ${scoreLine(latest)}` : `Geçen hafta ${week.length} maç · Son: ${scoreLine(latest)}`];
  const { scorer, mvp } = leadersOf(week);
  if (scorer) parts.push(`Gol kralı ${nameOf(scorer.info)} (${scorer.goals})`);
  else if (mvp) parts.push(`MVP ${nameOf(mvp.info)}`);

  return {
    id: DIGEST_ID, kind: "digest", route: "stats",
    at: d,
    fallbacks: [atDay(d, 1, 10, 0), atDay(d, 2, 10, 0)],
    title: "Haftanın özeti 📊",
    body: parts.join(" · "),
  };
}

// ─── Plan yokken: 3 / 10 / 30 gün sonra 19:30 (en fazla 3) ───
const REENGAGE_DAYS = [3, 10, 30];
function reengageCandidates(now, matches) {
  const { scorer, mvp } = leadersOf(matches);
  const last = [...matches].sort((a, b) => b.playedAt - a.playedAt)[0] || null;

  const invite = {
    route: "schedule",
    title: "Maçınız hangi gün? ⏰",
    body: "Saatini gir, kadroyu senin yerine hatırlatayım.",
  };
  const invite2 = {
    route: "schedule",
    title: "Her hafta aynı saatte mi oynuyorsunuz? ⏰",
    body: "Maç gününü kaydet: kim geliyor, takımlar, skor — hepsini zamanında hatırlatayım.",
  };
  const pasteTip = {
    route: "squad",
    title: "Bu hafta maç var mı? ⚽",
    body: "WhatsApp listesini yapıştır, takımları AI ile adil kur.",
  };
  const scorerMsg = scorer && {
    route: "squad",
    title: `${nameOf(scorer.info)} hâlâ gol kralı (${scorer.goals} gol) 👑`,
    body: "Tahtını kim alacak? Bu haftanın takımlarını kur.",
  };
  const mvpMsg = mvp && {
    route: "squad",
    title: `${nameOf(mvp.info)} ${mvp.mvpCount} kez MVP oldu 🏅`,
    body: "Bu hafta sıra kimde? Takımları kur, maçı kaydet.",
  };
  const rematchMsg = last && {
    route: "squad",
    title: `Son maç: ${scoreLine(last)}`,
    body: "Rövanş ne zaman? Takımları 10 saniyede dengele.",
  };

  // Gerçek veri önce; haftalık saat daveti mutlaka bir kez yer alır
  const msgs = [];
  const add = (m) => { if (m && !msgs.some((x) => x.title === m.title)) msgs.push(m); };
  add(scorerMsg || mvpMsg || invite);
  add(invite);
  add(rematchMsg || mvpMsg);
  add(invite2);
  add(pasteTip);

  return REENGAGE_DAYS.map((days, i) => ({
    id: reengageId(i), kind: "reengage",
    at: atDay(now, days, 19, 30),
    fallbacks: [atDay(now, days + 1, 19, 30)], // o gün başka bildirim varsa ertesi gün
    ...msgs[i],
  }));
}

// ─── Durum bildirimi — kadro durumuna göre EN FAZLA 1 tane (cooldown'lu) ───
// Sıra önemlidir: ilk uygun kural seçilir. Sahte aciliyet yok, "11" yok (5-7'lik).
const CONTEXT_RULES = [
  {
    key: "incomplete_squad", delayDays: 2, cooldownDays: 7, route: "squad",
    when: (s) => s.squadComplete === false,
    title: "Kadroda boş mevki var 👥",
    body: "WhatsApp listesini yapıştır, kadro saniyeler içinde dolsun.",
  },
  {
    key: "never_played", delayDays: 2, cooldownDays: 7, route: "ai_split",
    when: (s) => s.hasPlayedMatch === false && (s.playerCount || 0) >= 4,
    title: "Kadron hazır ⚽",
    body: "Takımları AI ile adil kur; maç bitince skoru gir, gol krallığı kendiliğinden oluşsun.",
  },
  {
    key: "never_used_ai", delayDays: 3, cooldownDays: 10, route: "ai_split",
    when: (s) => s.usedAI === false && (s.playerCount || 0) >= 4,
    title: "Takımları adil kur ⚖️",
    body: "AI, oyuncuları güce göre iki dengeli takıma böler. Ücretsiz.",
  },
  {
    key: "no_captain", delayDays: 3, cooldownDays: 14, route: "squad",
    when: (s) => s.hasCaptain === false,
    title: "Kaptan kim? ©️",
    body: "Takımında kaptan seçili değil. Pazıbandını birine takmak tek dokunuş.",
  },
  {
    key: "online_quota_out", delayDays: 2, cooldownDays: 21, route: "online",
    when: (s) => s.onlineQuotaOut === true,
    title: "Online oda hakkın ay başında yenilenir",
    body: "Maçlara katılım her zaman ücretsiz. Pro ile sınırsız oda da kurabilirsin.",
  },
];

function contextCandidate(now, ctx, sent = {}) {
  if (!ctx || !ctx.hasSquad) return null; // boş kadroya durum bildirimi yok
  const nowMs = now.getTime();
  const rule = CONTEXT_RULES.find((r) => {
    if (!r.when(ctx)) return false;
    const last = Number(sent[`context:${r.key}`]) || 0;
    return nowMs - last >= r.cooldownDays * 24 * HOUR;
  });
  if (!rule) return null;
  return {
    id: CTX_ID, kind: "context", key: rule.key, route: rule.route,
    at: atDay(now, rule.delayDays, 19, 0),
    title: rule.title,
    body: rule.body,
  };
}

// ─── Yerleştirme: günde 1 (maç günü öncesi+sonrası 2), sessiz saat, geçmiş zaman yok ───
function allocate(cands, now) {
  const minAt = now.getTime() + MIN;
  const sorted = cands
    .filter(Boolean)
    .map((c) => ({ ...c, prio: PRIO[c.kind] || 0 }))
    .sort((a, b) => b.prio - a.prio || a.at - b.at);
  const days = {};
  const out = [];
  sorted.forEach((c) => {
    const options = [c.at, ...(c.fallbacks || [])];
    for (const when of options) {
      if (!when || when.getTime() < minAt) continue;
      const k = dayKey(when);
      const list = days[k] || [];
      const fits =
        list.length === 0 ||
        (c.pair && list.length < 2 && list.every((x) => x.pair === c.pair));
      if (fits) {
        const item = { ...c, at: when };
        days[k] = [...list, item];
        out.push(item);
        break;
      }
    }
  });
  return out.sort((a, b) => a.at - b.at);
}

// ★ Tüm planı hesapla (saf) — refreshNotifications bunu cihaza yazar.
export function planNotifications({ now = new Date(), schedule = null, matches = [], ctx = null, sent = {} } = {}) {
  const ms = realMatches(matches);
  const cands = [];
  if (schedule) {
    cands.push(...scheduleCandidates(now, schedule, ms));
    cands.push(digestCandidate(now, ms));
  } else {
    cands.push(...reengageCandidates(now, ms));
  }
  cands.push(contextCandidate(now, ctx, sent));
  return allocate(cands, now);
}

// ═══════════════════════════════════════════════════════════
// CİHAZ I/O
// ═══════════════════════════════════════════════════════════
const readJSON = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};
const writeJSON = (key, v) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
};

const readLedger = () => {
  const l = readJSON(LEDGER_KEY, {});
  return {
    planned: Array.isArray(l.planned) ? l.planned : [],
    sent: l.sent && typeof l.sent === "object" ? l.sent : {},
  };
};
const ledgerKeyOf = (p) => (p.key ? `${p.kind}:${p.key}` : p.kind);
// Planlanmış ve zamanı geçmiş olanlar teslim edilmiş sayılır (iptalden önce çaldı)
const markDelivered = (ledger, nowMs) => {
  ledger.planned.forEach((p) => {
    if (p && p.at <= nowMs) {
      const k = ledgerKeyOf(p);
      ledger.sent[k] = Math.max(Number(ledger.sent[k]) || 0, p.at);
    }
  });
};

const toNative = (c) => ({
  id: c.id,
  title: c.title,
  body: c.body,
  schedule: { at: c.at, allowWhileIdle: true },
  channelId: CH_ID,
  smallIcon: "ic_stat_icon", // Android: kaynak yoksa varsayılan ikon
  extra: {
    route: c.route,
    kind: c.kind,
    ...(c.key ? { key: c.key } : {}),
    ...(c.matchId ? { matchId: c.matchId } : {}),
  },
});

async function cancelOurs(LN) {
  const ids = new Set(KNOWN_IDS);
  try {
    const pending = await LN.getPending();
    (pending?.notifications || []).forEach((n) => {
      const id = Number(n.id);
      if (id >= OUR_ID_MIN && id <= OUR_ID_MAX) ids.add(id);
    });
  } catch {}
  try {
    await LN.cancel({ notifications: [...ids].map((id) => ({ id })) });
  } catch (e) {
    console.warn("[notif] iptal hata:", e?.message);
  }
}

async function runRefresh(reason) {
  const LN = getPlugin();
  if (!LN) return false;
  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") return false;

    const now = new Date();
    const ledger = readLedger();
    markDelivered(ledger, now.getTime());

    let matches = [];
    try { matches = getAllMatches() || []; } catch {}
    const plan = planNotifications({
      now,
      schedule: getSchedule(),
      matches,
      ctx: readJSON(CTX_STATE_KEY, null),
      sent: ledger.sent,
    });

    await cancelOurs(LN);
    if (plan.length) await LN.schedule({ notifications: plan.map(toNative) });

    ledger.planned = plan.map((p) => ({ kind: p.kind, key: p.key || "", at: p.at.getTime() }));
    writeJSON(LEDGER_KEY, ledger);
    if (isDebug()) {
      console.log(`[notif] plan (${reason}):`, plan.map((p) => `${p.kind} @ ${p.at.toLocaleString("tr-TR")} → ${p.title}`));
    }
    return true;
  } catch (e) {
    console.warn("[notif] plan hata:", e?.message);
    return false;
  }
}

const isDebug = () => {
  try { return localStorage.getItem("hk_debug") === "1"; } catch { return false; }
};

// ★ Planı yeniden hesapla — kısa debounce + sıralı çalışma (aynı anda iki plan yazılmaz)
let _debounce = null;
let _waiters = [];
let _chain = Promise.resolve();
export function refreshNotifications(reason = "manual") {
  return new Promise((resolve) => {
    _waiters.push(resolve);
    clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      const waiters = _waiters.splice(0);
      _chain = _chain
        .then(() => runRefresh(reason))
        .catch(() => false)
        .then((r) => { waiters.forEach((w) => w(r)); });
    }, 250);
  });
}

// ═══ İZİN ═══
// "granted" | "denied" | "prompt" | "prompt-with-rationale" | "unsupported" (web)
export async function getNotifPermission() {
  const LN = getPlugin();
  if (!LN) return "unsupported";
  try {
    const p = await LN.checkPermissions();
    return p?.display || "prompt";
  } catch {
    return "unsupported";
  }
}

// Sistem izin penceresi — SADECE kullanıcı uygulama içi ön-izinde "Evet" deyince
export async function requestNotifPermission() {
  const LN = getPlugin();
  if (!LN) return false;
  try {
    const r = await LN.requestPermissions();
    return r?.display === "granted";
  } catch {
    return false;
  }
}

// ═══ DOKUNMA → YÖNLENDİRME ═══
const BOOT_AT = Date.now();
const _tapHandlers = new Set();
let _tapListenerAdded = false;

// route → uygulama içi olay (ModeSelectScreen kısayolları da kullanır)
export function openRoute(route, extra = {}) {
  if (!route) return;
  try {
    if (route === "kasa") {
      window.dispatchEvent(new CustomEvent("halisaha:open-kasa", { detail: extra.matchId ? { matchId: extra.matchId } : {} }));
    } else if (route === "schedule") {
      window.dispatchEvent(new CustomEvent("halisaha:open-schedule"));
    } else {
      window.dispatchEvent(new CustomEvent("halisaha:navigate", { detail: { route } }));
    }
  } catch {}
}

function onTap(action) {
  const extra = action?.notification?.extra || {};
  const kind = extra.kind || "unknown";
  const route = extra.route || null;
  track(EVENTS.NOTIF_OPENED, { kind, route });
  // Soğuk açılışta UI'nin mount olması için kısa bekleme
  const delay = Date.now() - BOOT_AT < 6000 ? 400 : 60;
  setTimeout(() => openRoute(route, extra), delay);
  _tapHandlers.forEach((h) => { try { h(action); } catch {} });
}

function ensureTapListener() {
  if (_tapListenerAdded) return;
  const LN = getPlugin();
  if (!LN) return;
  _tapListenerAdded = true;
  try {
    Promise.resolve(LN.addListener("localNotificationActionPerformed", onTap))
      .catch(() => { _tapListenerAdded = false; });
  } catch {
    _tapListenerAdded = false;
  }
}

// ═══ KURULUM (izin İSTEMEZ) ═══
let _initDone = false;
export async function initNotifications() {
  const LN = getPlugin();
  if (!LN) return false;
  ensureTapListener();
  if (_initDone) return true;
  _initDone = true;
  if (Capacitor.getPlatform() === "android") {
    try {
      await LN.createChannel({
        id: CH_ID,
        name: "Maç hatırlatmaları",
        description: "Maç günü, kadro, skor ve kasa hatırlatmaları",
        importance: 4,
        visibility: 1,
      });
    } catch {}
    try { await LN.deleteChannel({ id: LEGACY_CH_ID }); } catch {}
  }
  return true;
}

// ═══ GERİYE UYUMLU API (eski çağrı yerleri kırılmasın) ═══
// Eski: rastgele espri bildirimleri → artık tek planlayıcıya yönlenir
export async function scheduleReengagement() {
  return refreshNotifications("reengage");
}

// Eski: kurulumdan 5 sn sonra "hoş geldin" — KALDIRILDI (kurulumdan hemen sonra bildirim yok)
export async function scheduleWelcome() {
  return false;
}

// HaliSahaKolik kadro durumunu bildirir → saklanır, plan yeniden hesaplanır.
// state: { hasSquad, squadComplete, hasCaptain, hasPlayedMatch, usedAI, playerCount, onlineQuotaOut }
export async function scheduleContextNotifications(state = {}) {
  writeJSON(CTX_STATE_KEY, { ...state, at: Date.now() });
  return refreshNotifications("context");
}

// Ek dokunma dinleyicisi (yönlendirme zaten yapılır) — kaldırma fonksiyonu döner
export async function addNotificationTapListener(handler) {
  if (typeof handler === "function") _tapHandlers.add(handler);
  ensureTapListener();
  return () => _tapHandlers.delete(handler);
}