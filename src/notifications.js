// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · notifications — Eğlenceli geri-getirme bildirimleri
// ─────────────────────────────────────────────────────────────
// Kullanıcı uygulamayı bırakınca, futbol esprili local bildirimlerle
// geri çağırır. Push sunucusu GEREKMEZ — tamamen cihazda (offline) planlanır.
//
// Mantık:
//   • Uygulama her açıldığında: bekleyen tüm geri-getirme bildirimleri iptal →
//     "şu andan itibaren" gün 1/2/4/7/14/30'a yeni eğlenceli bildirimler kurulur.
//   • Kullanıcı uygulamayı açtıkça sayaç sıfırlanır → aktif kullanıcı spam yemez,
//     yalnızca GERÇEKTEN uzaklaşan kullanıcıya bildirim gider.
//   • Mesajlar her seferinde rastgele seçilir (tekrar hissi az).
//
// KULLANIM (App.js boot):
//   import { initNotifications, scheduleReengagement } from "./notifications";
//   await initNotifications();          // izin + kanal (bir kez)
//   await scheduleReengagement();       // her açılışta planı tazele
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const CH_ID = "reengage";

function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  return LocalNotifications;
}

// ═══ EĞLENCELİ MESAJ HAVUZU ═══
// Her bildirim { title, body } — futbol/halı saha esprili, samimi, TR.
const MESSAGES = [
  { title: "Saha seni özledi ⚽", body: "Çimler kurudu, top tozlandı. Bir maç ayarlasak mı?" },
  { title: "Kadro eksik kaldı 👀", body: "Senin yerin hâlâ boş. Takım seni bekliyor!" },
  { title: "Transfer dönemi açıldı 📋", body: "Yeni sezon kadronu kurma vakti. Hadi başlayalım." },
  { title: "Ayağın paslanıyor 🦵", body: "Bu kadar dinlenme yeter. Sahaya geri dön!" },
  { title: "Kaptanlık seni arıyor ©️", body: "Pazıbandı tozlandı. Takımı yine sen mi taşırsın?" },
  { title: "VAR seni izliyor 📹", body: "Uzun süredir maç yok. Bu bir ihlaldir! Geri gel." },
  { title: "Forman ütülendi 👕", body: "11 numara hazır, çiviye asılı duruyor. Giyer misin?" },
  { title: "Antrenör çağırıyor 📣", body: "Taktik tahtası hazır. AI takımları dağıtmak için seni bekliyor." },
  { title: "Derbi havası var 🔥", body: "İki takım kur, dengele, kapış. Bugün maç günü olsun mu?" },
  { title: "Gol sevincin eksik 🎉", body: "Kornere koşmayalı çok oldu. Bir gol atmaya ne dersin?" },
  { title: "Halı saha rezervasyonu 🗓️", body: "Saat ayarlandı, eksik olan sensin. Kadroyu topla!" },
  { title: "Penaltı noktasında bekleniyorsun ⚽", body: "Soğukkanlılık ister. Geri dön, vuruşu sen yap." },
  { title: "Yedek kulübesi sıkıldı 🪑", body: "Isınma turu bitti koç. Seni sahada görmek istiyoruz." },
  { title: "Maç topu hazır 🟢", body: "Hava güzel, takım hazır. Tek eksik: sen." },
  { title: "Lig başlıyor 🏆", body: "Şampiyonluk kendiliğinden gelmez. Kadronu kur, sahaya çık!" },
  { title: "Düdük çaldı 🎽", body: "İlk yarı başladı, sen hâlâ tribündesin. Sahaya in!" },
  { title: "Tarihe geçme vakti 📈", body: "İstatistiklerin seni özledi. Yeni bir maçla rekor kır." },
  { title: "Krampon nerede? 👟", body: "Dolapta seni bekliyor. Bir maç daha yapmadan olmaz." },
  { title: "Rakip korkuyor 😏", body: "Sahaya çıkmadığın için rahatlar. Onlara günlerini göster!" },
  { title: "Hat-trick zamanı ⚽⚽⚽", body: "Üç gol senden ne kadar uzak? Gel, deneyelim." },
  { title: "Takım toplantısı 🧠", body: "Yeni taktik mi, eski 3-2-1 mi? Karar senin, gel konuşalım." },
  { title: "Tribün tezahürat istiyor 📢", body: "Adını sayıyorlar. Onları boş çevirme!" },
  { title: "Maç özeti bekliyor 🎬", body: "Son maçın efsaneydi. Yenisini ne zaman çekiyoruz?" },
  { title: "Soyunma odası hazır 🚪", body: "Forman asılı, su şişen dolu. Geriye sadece sen kaldın." },
  { title: "MVP koltuğu boş 🥇", body: "Haftanın yıldızı kim olacak? Sahaya çıkmadan belli olmaz." },
  { title: "Uzatmalar oynanıyor ⏱️", body: "Hâlâ vakit var koç. Bir maç daha sıkıştıralım mı?" },
  { title: "Defans seni çağırıyor 🛡️", body: "Arka taraf dağıldı. Düzeni kuracak birine ihtiyaç var: sana." },
  { title: "Golcü aranıyor 🎯", body: "Forvet boş kaldı. Filelere göndermeye var mısın?" },
];

// Planlanacak gün ofsetleri (uygulamadan uzaklaşma süresine göre) — daha sık
const SCHEDULE_DAYS = [1, 2, 3, 5, 7, 10, 14, 21, 30];

// Sabit ID aralığı — sadece bu bildirimleri yönetiriz (başka bildirimlere dokunmaz)
const ID_BASE = 91000;
// Durum-bazlı bildirimler için ayrı aralık
const CTX_BASE = 92000;
const CTX_DEDUP_KEY = "halisaha_ctx_notif_last"; // koşul başına son atım zamanı
const WELCOME_KEY = "halisaha_welcome_sent";      // ilk açılış karşılama bildirimi (bir kez)
const WELCOME_ID = CTX_BASE + 50;

function pickMessages(count) {
  const pool = [...MESSAGES];
  const out = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// Hedef: belirtilen gün sonrası, akşam 19:00 (maç saati hissi)
function fireDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(19, 0, 0, 0);
  // Eğer bugünse ve 19:00 geçtiyse bir sonraki güne kaydır (daysFromNow>=1 olduğundan nadiren gerekir)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

// ═══ İzin + kanal kurulumu (bir kez) ═══
export async function initNotifications() {
  const LN = getPlugin();
  if (!LN) return false;
  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") {
      const req = await LN.requestPermissions();
      if (req.display !== "granted") return false;
    }
    // Android kanalı (iOS yok sayar)
    if (Capacitor.getPlatform() === "android") {
      try {
        await LN.createChannel({
          id: CH_ID,
          name: "Maç Hatırlatmaları",
          description: "Seni sahaya geri çağıran eğlenceli hatırlatmalar",
          importance: 4,
          visibility: 1,
        });
      } catch {}
    }
    return true;
  } catch (e) {
    console.warn("[notif] init hata:", e?.message);
    return false;
  }
}

// ═══ Bekleyen geri-getirme bildirimlerini iptal et ═══
async function cancelReengagement(LN) {
  try {
    const pending = await LN.getPending();
    const ids = (pending?.notifications || [])
      .map((n) => n.id)
      .filter((id) => id >= ID_BASE && id < ID_BASE + 100);
    if (ids.length) await LN.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch (e) {
    console.warn("[notif] cancel hata:", e?.message);
  }
}

// ═══ Geri-getirme planını tazele (her uygulama açılışında çağır) ═══
export async function scheduleReengagement() {
  const LN = getPlugin();
  if (!LN) return false;
  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") return false;

    await cancelReengagement(LN);

    const msgs = pickMessages(SCHEDULE_DAYS.length);
    const notifications = SCHEDULE_DAYS.map((day, i) => {
      const m = msgs[i] || MESSAGES[0];
      return {
        id: ID_BASE + i,
        title: m.title,
        body: m.body,
        schedule: { at: fireDate(day), allowWhileIdle: true },
        channelId: CH_ID,
        smallIcon: "ic_stat_icon", // Android: yoksa varsayılan kullanılır
      };
    });

    await LN.schedule({ notifications });
    return true;
  } catch (e) {
    console.warn("[notif] schedule hata:", e?.message);
    return false;
  }
}

// ═══ İLK AÇILIŞ KARŞILAMA BİLDİRİMİ (bir kez) ═══
// Kullanıcı uygulamayı ilk kez açtıktan birkaç saat sonra sıcak bir hatırlatma.
// Hemen göndermeyiz (kullanıcı zaten içeride); 3 saat sonra planlanır.
export async function scheduleWelcome() {
  const LN = getPlugin();
  if (!LN) return false;
  try {
    // Zaten gönderildiyse tekrar planlama
    if (localStorage.getItem(WELCOME_KEY) === "1") return false;

    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") return false;

    const at = new Date(Date.now() + 5 * 1000); // ~anında (5 sn sonra)
    await LN.schedule({
      notifications: [{
        id: WELCOME_ID,
        title: "Sahaya hoş geldin! ⚽",
        body: "İlk takımını kur, oyuncularını ekle ve AI ile dengeli kadroları sahaya diz. Hadi başlayalım!",
        schedule: { at, allowWhileIdle: true },
        channelId: CH_ID,
        smallIcon: "ic_stat_icon",
        extra: { kind: "welcome" },
      }],
    });
    localStorage.setItem(WELCOME_KEY, "1");
    return true;
  } catch (e) {
    console.warn("[notif] welcome hata:", e?.message);
    return false;
  }
}

// ═══ DURUM-BAZLI BİLDİRİMLER (spam'siz) ═══
// Her koşul: sabit ID + dedup damgası. Koşul varsa "X gün dönmezsen" tek
// hatırlatma planlanır; koşul düzelince iptal edilir; aynı koşul için belirli
// bir süre (cooldown) geçmeden tekrar atılmaz.
//
// CONTEXT_RULES[key] = { id, delayDays, cooldownDays, messages: [{title,body}] }
const CONTEXT_RULES = {
  // Takımım kadrosu eksik (7'den az saha oyuncusu)
  incomplete_squad: {
    id: CTX_BASE + 0,
    delayDays: 2,        // 2 gün dönmezse hatırlat
    cooldownDays: 5,     // aynı koşul için en sık 5 günde bir
    messages: [
      { title: "Kadron eksik kaldı 👥", body: "Takım arkadaşların seni bekliyor! Eksik mevkileri doldur, 11'i tamamla." },
      { title: "Saha yarım dolu ⚽", body: "Kadroda boş yerler var. Bir an önce takımı tamamlayalım mı?" },
      { title: "Takım toplanamıyor 📋", body: "Birkaç oyuncu eksik. Sen olmadan diziliş tamamlanmıyor!" },
    ],
  },
  // Kaptan atanmamış
  no_captain: {
    id: CTX_BASE + 1,
    delayDays: 3,
    cooldownDays: 7,
    messages: [
      { title: "Kaptan kim olacak? ©️", body: "Takımın hâlâ kaptansız. Pazıbandını birine takmaya ne dersin?" },
    ],
  },
  // Hiç maç oynanmamış (kadro var ama maç yok)
  never_played: {
    id: CTX_BASE + 2,
    delayDays: 2,
    cooldownDays: 6,
    messages: [
      { title: "İlk maç heyecanı 🔥", body: "Kadron hazır ama daha sahaya çıkmadın. İlk maçını başlatalım!" },
    ],
  },
  // Uzun süredir AI dağıtım denenmemiş (kadro tam ama AI modu hiç kullanılmamış)
  never_used_ai: {
    id: CTX_BASE + 3,
    delayDays: 3,
    cooldownDays: 8,
    messages: [
      { title: "AI seni bekliyor 🤖", body: "Takımları saniyede dengele! AI dağıtımını henüz denemedin." },
      { title: "Dengeli kadro bir tık uzakta ⚖️", body: "AI Modu ile oyuncuları adil böl. Hadi bir dene!" },
    ],
  },
  // Bu ayki ücretsiz online oda kurma hakkı bitmiş (free kullanıcı)
  online_quota_out: {
    id: CTX_BASE + 4,
    delayDays: 1,
    cooldownDays: 10,
    messages: [
      { title: "Bu ayki oda hakların doldu 🔓", body: "Pro ile sınırsız online oda kur, sahalara geri dön!" },
      { title: "Daha fazla maç ister misin? 🚀", body: "Ücretsiz oda hakların ay başında yenilenir. Beklemek istemezsen Pro ile dilediğin kadar oda kur." },
    ],
  },
};

function readDedup() {
  try { return JSON.parse(localStorage.getItem(CTX_DEDUP_KEY)) || {}; } catch { return {}; }
}
function writeDedup(obj) {
  try { localStorage.setItem(CTX_DEDUP_KEY, JSON.stringify(obj)); } catch {}
}

function ctxFireDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(19, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

// state: { squadComplete: bool, hasCaptain: bool, hasPlayedMatch: bool, hasSquad: bool }
// hasSquad: kadroda hiç oyuncu var mı (boş takıma bildirim atmayız)
export async function scheduleContextNotifications(state = {}) {
  const LN = getPlugin();
  if (!LN) return false;
  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") return false;

    const dedup = readDedup();
    const now = Date.now();
    const toSchedule = [];
    const toCancel = [];

    const evaluate = (key, conditionActive) => {
      const rule = CONTEXT_RULES[key];
      if (!rule) return;
      if (!conditionActive) {
        // Koşul düzeldi → bekleyen bildirimi iptal et
        toCancel.push(rule.id);
        return;
      }
      // Cooldown: aynı koşul için çok sık atma
      const last = dedup[key] || 0;
      const cooldownMs = rule.cooldownDays * 86400000;
      if (now - last < cooldownMs) {
        // Henüz cooldown dolmadı; mevcut planı tazelemeye gerek yok ama
        // var olanı koru (iptal etme).
        return;
      }
      // Yeni planla
      toCancel.push(rule.id); // eski varsa temizle
      const m = rule.messages[Math.floor(Math.random() * rule.messages.length)];
      toSchedule.push({
        id: rule.id,
        title: m.title,
        body: m.body,
        schedule: { at: ctxFireDate(rule.delayDays), allowWhileIdle: true },
        channelId: CH_ID,
        smallIcon: "ic_stat_icon",
        extra: { kind: "context", key },
      });
      dedup[key] = now;
    };

    // Boş takıma hiç dokunma
    if (state.hasSquad) {
      evaluate("incomplete_squad", state.squadComplete === false);
      evaluate("no_captain", state.hasCaptain === false);
      evaluate("never_played", state.hasPlayedMatch === false);
      // AI hiç denenmemiş — yalnızca kadro tamken anlamlı (en az 4 oyuncu)
      evaluate("never_used_ai", state.usedAI === false && (state.playerCount || 0) >= 4);
      // Online hak bitmiş ve premium değilse
      evaluate("online_quota_out", state.onlineQuotaOut === true);
    } else {
      // Kadro boşsa tüm durum-bildirimleri iptal
      Object.values(CONTEXT_RULES).forEach((r) => toCancel.push(r.id));
    }

    if (toCancel.length) {
      try { await LN.cancel({ notifications: toCancel.map((id) => ({ id })) }); } catch {}
    }
    if (toSchedule.length) {
      await LN.schedule({ notifications: toSchedule });
      writeDedup(dedup);
    }
    return true;
  } catch (e) {
    console.warn("[notif] context schedule hata:", e?.message);
    return false;
  }
}

// Kullanıcı bildirime dokununca uygulama açılır; ekstra yönlendirme istenirse:
export async function addNotificationTapListener(handler) {
  const LN = getPlugin();
  if (!LN) return;
  try {
    LN.addListener("localNotificationActionPerformed", (action) => {
      handler && handler(action);
    });
  } catch {}
}