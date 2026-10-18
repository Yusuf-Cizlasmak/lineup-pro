// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Haftalık maç planı (sabit gün / saat / saha)
// ─────────────────────────────────────────────────────────────
// Grubun her hafta oynadığı sabit maç saati. Hatırlatmalar (notifications.js),
// ana ekran "Haftalık maç" kartı ve Kasa bu planı okur.
//
// Şema (localStorage "halisaha_match_schedule"):
//   {
//     weekday: 0-6        // JS getDay() → 0 = Pazar, 1 = Pazartesi … 6 = Cumartesi
//     time: "21:00"       // HH:MM (24 saat)
//     pitch: string       // saha adı (opsiyonel)
//     durationMin: number // 60 | 90 …
//     playerCount: number // 10 | 12 | 14 | 16 …
//     fee: number         // toplam saha ücreti (TL) — 0 = yok
//     iban: string        // ödeme için IBAN (opsiyonel)
//     setAt: number       // gün/saat en son ne zaman belirlendi (ms) — bildirimler
//                         // plandan ÖNCEKİ maçlar için "kaydetmedin" demesin diye
//   }
//
// Plan değişince window "halisaha:schedule-changed" yayınlanır.
// Bu dosya saf JS'tir (capacitor import ETMEZ).
// ─────────────────────────────────────────────────────────────

import { getAllMatches } from "./matchHistoryStore";

const STORAGE_KEY = "halisaha_match_schedule";
export const SCHEDULE_CHANGED_EVENT = "halisaha:schedule-changed";

// ═══ GÜN ADLARI (JS getDay sırası: 0 = Pazar) ═══
export const WEEKDAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const WEEKDAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
// UI'da Pazartesi'den başlayan sıra (Türkiye'de hafta Pazartesi başlar)
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DEFAULT_SCHEDULE = {
  weekday: 4,          // Perşembe
  time: "21:00",
  pitch: "",
  durationMin: 60,
  playerCount: 14,
  fee: 0,
  iban: "",
};

// ═══ Yardımcılar ═══
const clampInt = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// "21:00" / "9:5" → { h: 21, m: 0 } — geçersizse 21:00
export const parseTime = (time) => {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(String(time || ""));
  if (!m) return { h: 21, m: 0 };
  return { h: clampInt(m[1], 0, 23, 21), m: clampInt(m[2], 0, 59, 0) };
};

const pad2 = (n) => String(n).padStart(2, "0");

// Bozuk/eksik alanları güvenli değerlere çevir
const normalize = (s) => {
  if (!s || typeof s !== "object") return null;
  const weekday = clampInt(s.weekday, 0, 6, null);
  if (weekday == null) return null;
  const { h, m } = parseTime(s.time);
  const fee = Math.max(0, Math.round(Number(s.fee) || 0));
  return {
    weekday,
    time: `${pad2(h)}:${pad2(m)}`,
    pitch: String(s.pitch || "").trim().slice(0, 60),
    durationMin: clampInt(s.durationMin, 15, 240, 60),
    playerCount: clampInt(s.playerCount, 2, 30, 14),
    fee,
    iban: String(s.iban || "").trim().slice(0, 42),
    setAt: Number(s.setAt) || 0,
  };
};

// ═══ Public API ═══
export const getSchedule = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
};

// obj → kaydet · null → planı kaldır
export const setSchedule = (obj) => {
  try {
    if (obj == null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      const s = normalize(obj);
      if (!s) return null;
      // Gün/saat değişmediyse eski setAt korunur (sadece saha adı/ücret düzenlemesi)
      const prev = getSchedule();
      s.setAt = prev && prev.weekday === s.weekday && prev.time === s.time && prev.setAt
        ? prev.setAt
        : Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    }
  } catch {}
  try { window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT)); } catch {}
  return obj == null ? null : getSchedule();
};

export const hasSchedule = () => !!getSchedule();

// Belirli bir günün maç başlangıç anı (Date)
const atScheduleTime = (day, s) => {
  const { h, m } = parseTime(s.time);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
};

// ★ Bir sonraki maç başlangıcı — saat de dikkate alınır:
//   Bugün maç günü ve saat henüz gelmediyse → bugün; geçtiyse → gelecek hafta.
export const nextMatchDate = (from = new Date(), schedule = getSchedule()) => {
  const s = schedule;
  if (!s) return null;
  const base = new Date(from);
  const diff = (s.weekday - base.getDay() + 7) % 7;
  const cand = new Date(base);
  cand.setDate(base.getDate() + diff);
  const d = atScheduleTime(cand, s);
  if (d.getTime() <= base.getTime()) d.setDate(d.getDate() + 7);
  return d;
};

// En son geçmiş maç başlangıcı (bildirimler: "Maç nasıl bitti?" vb. için)
export const prevMatchDate = (from = new Date(), schedule = getSchedule()) => {
  const next = nextMatchDate(from, schedule);
  if (!next) return null;
  const d = new Date(next);
  d.setDate(d.getDate() - 7);
  return d;
};

// Maç bitişi (başlangıç + süre)
export const matchEndDate = (start, schedule = getSchedule()) => {
  if (!start || !schedule) return null;
  return new Date(new Date(start).getTime() + (schedule.durationMin || 60) * 60000);
};

// Bugünden maça kaç takvim günü var (0 = bugün, 1 = yarın)
export const daysUntil = (date, from = new Date()) => {
  if (!date) return null;
  const a = new Date(from); a.setHours(0, 0, 0, 0);
  const b = new Date(date); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

// "Bugün" / "Yarın" / "3 gün kaldı"
export const countdownLabel = (date, from = new Date()) => {
  const n = daysUntil(date, from);
  if (n == null) return "";
  if (n <= 0) return "Bugün";
  if (n === 1) return "Yarın";
  return `${n} gün kaldı`;
};

// "Perşembe 21:00 · Yıldız Halı Saha"
export const formatSchedule = (s = getSchedule()) => {
  if (!s) return "";
  const day = WEEKDAY_NAMES[s.weekday] || "";
  const parts = [`${day} ${s.time}`.trim()];
  if (s.pitch) parts.push(s.pitch);
  return parts.join(" · ");
};

// Kişi başı saha ücreti — 5 TL'ye yukarı yuvarlanır
export const perHeadFee = (fee, count) => {
  const f = Number(fee) || 0;
  const n = Number(count) || 0;
  if (f <= 0 || n <= 0) return 0;
  return Math.ceil(f / n / 5) * 5;
};

// ★ Geçmiş maçlardan plan tahmini (form ön doldurma):
//   en sık oynanan gün + o günlerdeki başlama saatlerinin medyanı.
//   Maç kaydı genelde maç BİTİNCE yapıldığı için kayıt saatinden ~1 saat düşülür.
//   Yeterli veri yoksa null döner.
export const suggestScheduleFromHistory = () => {
  let matches = [];
  try { matches = getAllMatches() || []; } catch { matches = []; }
  const dates = matches
    .map((m) => Number(m?.playedAt))
    .filter((t) => Number.isFinite(t) && t > 0)
    .map((t) => new Date(t - 60 * 60000)); // kayıt ≈ maç sonu → başlangıca yaklaş
  if (dates.length < 2) return null;

  // En sık gün
  const counts = [0, 0, 0, 0, 0, 0, 0];
  dates.forEach((d) => { counts[d.getDay()]++; });
  let weekday = 0;
  for (let i = 1; i < 7; i++) if (counts[i] > counts[weekday]) weekday = i;
  if (counts[weekday] < 2) return null; // tek seferlik maçlardan plan uydurma

  // O günlerin medyan saati (dakika cinsinden), yarım saate yuvarla
  const mins = dates
    .filter((d) => d.getDay() === weekday)
    .map((d) => d.getHours() * 60 + d.getMinutes())
    .sort((a, b) => a - b);
  const mid = Math.floor(mins.length / 2);
  const median = mins.length % 2 ? mins[mid] : Math.round((mins[mid - 1] + mins[mid]) / 2);
  const rounded = Math.round(median / 30) * 30;
  const h = Math.floor(rounded / 60) % 24;
  const m = rounded % 60;

  return {
    ...DEFAULT_SCHEDULE,
    weekday,
    time: `${pad2(h)}:${pad2(m)}`,
    _fromHistory: true,
    _sampleSize: counts[weekday],
  };
};
