// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Player Attributes & Form Gücü
// ─────────────────────────────────────────────────────────────
// Tek doğruluk kaynağı: attribute generation, form hesaplama, migration helper
// Geriye uyumlu: eski oyuncularda attributes yoksa, position+rating'den türetir.
// ─────────────────────────────────────────────────────────────

// ═══ ATTRIBUTE ANAHTARLARI ═══
// Saha oyuncuları için 6 attribute, kaleci için ayrı 6 attribute
export const FIELD_ATTRS = ["pas", "sut", "hiz", "dribbling", "defans", "fizik"];
export const GK_ATTRS = ["refleks", "konum", "hava", "cikis", "uzaklik", "ayak"];

export const isGoalkeeper = (position) => position === "KALECİ";

export const getAttrKeys = (position) =>
  isGoalkeeper(position) ? GK_ATTRS : FIELD_ATTRS;

// ═══ POZISYON-BAZLI BASE PROFİL (rating = 70 baz alınmış) ═══
// Her pozisyon için her attribute'un baz puanına ofseti.
// Auto-generate'de: attribute = clamp(rating + offset + jitter, 30, 99)
const POSITION_PROFILES = {
  "KALECİ":     { refleks:  +8, konum:  +6, hava:  +4, cikis:  +2, uzaklik:  +0, ayak:  -4 },
  "DEFANS":     { pas:      -2, sut:    -8, hiz:   -2, dribbling: -6, defans: +10, fizik:  +6 },
  "STOPER":     { pas:      -4, sut:   -10, hiz:   -4, dribbling: -8, defans: +12, fizik:  +8 },
  "SOL BEK":    { pas:      +0, sut:    -6, hiz:   +6, dribbling: +0, defans:  +6, fizik:  +2 },
  "SAĞ BEK":    { pas:      +0, sut:    -6, hiz:   +6, dribbling: +0, defans:  +6, fizik:  +2 },
  "ORTA SAHA":  { pas:      +8, sut:    +0, hiz:   +0, dribbling: +4, defans:  +0, fizik:  +0 },
  "FORVET":     { pas:      -2, sut:   +10, hiz:   +6, dribbling: +6, defans:  -8, fizik:  +0 },
};

// ═══ DEFAULT PROFİL (bilinmeyen pozisyon için) ═══
const DEFAULT_FIELD_PROFILE = { pas: 0, sut: 0, hiz: 0, dribbling: 0, defans: 0, fizik: 0 };
const DEFAULT_GK_PROFILE    = { refleks: 0, konum: 0, hava: 0, cikis: 0, uzaklik: 0, ayak: 0 };

const ATTR_MIN = 30;
const ATTR_MAX = 99;
const clamp = (v, min = ATTR_MIN, max = ATTR_MAX) => Math.max(min, Math.min(max, Math.round(v)));

// ═══ AUTO-GENERATE ═══
// Pozisyon ve rating'e göre 6 attribute türet.
// Aynı oyuncu için her seferinde aynı sonucu üretsin diye id-bazlı seedli jitter.
export const generateDefaultAttributes = (position, rating = 70, seed = "") => {
  const isGK = isGoalkeeper(position);
  const profile = POSITION_PROFILES[position]
    || (isGK ? DEFAULT_GK_PROFILE : DEFAULT_FIELD_PROFILE);
  const keys = isGK ? GK_ATTRS : FIELD_ATTRS;

  // Deterministik küçük jitter — aynı id her zaman aynı sayı versin
  const seededRand = (key) => {
    const str = `${seed}:${key}`;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    // -3 ile +3 arası
    return ((h % 7) + 7) % 7 - 3;
  };

  const out = {};
  keys.forEach((k) => {
    const offset = profile[k] ?? 0;
    out[k] = clamp(rating + offset + seededRand(k));
  });
  return out;
};

// ═══ ATTRIBUTE → OVERALL ═══
// Attribute set'inden ortalama overall hesapla.
// Pozisyona göre attribute ağırlıklı: forvet için şut/hız daha önemli, defans için defans/fizik vb.
const POSITION_WEIGHTS = {
  "KALECİ":     { refleks: 1.5, konum: 1.3, hava: 1.0, cikis: 1.0, uzaklik: 0.7, ayak: 0.5 },
  "DEFANS":     { defans: 1.5, fizik: 1.2, pas: 1.0, hiz: 1.0, dribbling: 0.6, sut: 0.4 },
  "STOPER":     { defans: 1.6, fizik: 1.4, pas: 0.9, hiz: 0.8, dribbling: 0.5, sut: 0.3 },
  "SOL BEK":    { hiz: 1.3, defans: 1.2, fizik: 1.0, pas: 1.0, dribbling: 0.8, sut: 0.5 },
  "SAĞ BEK":    { hiz: 1.3, defans: 1.2, fizik: 1.0, pas: 1.0, dribbling: 0.8, sut: 0.5 },
  "ORTA SAHA":  { pas: 1.4, dribbling: 1.1, fizik: 1.0, hiz: 1.0, sut: 0.9, defans: 0.7 },
  "FORVET":     { sut: 1.5, hiz: 1.3, dribbling: 1.2, fizik: 1.0, pas: 0.7, defans: 0.3 },
};

export const computeOverallFromAttributes = (attributes, position) => {
  if (!attributes) return null;
  const weights = POSITION_WEIGHTS[position];
  const keys = getAttrKeys(position);
  if (!weights) {
    const sum = keys.reduce((s, k) => s + (attributes[k] || 0), 0);
    return Math.round(sum / keys.length);
  }
  let totalScore = 0, totalWeight = 0;
  keys.forEach((k) => {
    const w = weights[k] ?? 1.0;
    totalScore += (attributes[k] || 0) * w;
    totalWeight += w;
  });
  return Math.round(totalScore / totalWeight);
};

// ═══ RATING ↔ ATTRIBUTES SENKRONİZASYONU ═══
//
// İki yönlü bağlama için iki ayrı helper:
//
//  1) scaleAttributesToRating(attrs, position, oldRating, newRating)
//     Kullanıcı rating slider'ını manuel oynatınca tüm attribute'ları
//     orantılı kaydırır. Profili (kullanıcının özel düzenlemelerini) korur,
//     sadece aşağı/yukarı translate eder. FIFA/FM standardı.
//     Clamp'lere takılan attribute'lar için "yayılma" yapmaz — sadece tepe
//     veya tabana yapışırlar (gerçekçi davranış: 99'a yapışmış bir şut
//     artık daha fazla yükselemez).
//
//  2) Tek attribute değişince yeni overall'ı parent hesaplar:
//     computeOverallFromAttributes(newAttrs, position) →  rating slider'ı
//     bu değere snap eder. Bu yüzden burada ayrı bir helper'a gerek yok.
//
export const scaleAttributesToRating = (attributes, position, oldRating, newRating) => {
  if (!attributes || oldRating == null || newRating == null) return attributes;
  const delta = newRating - oldRating;
  if (delta === 0) return attributes;

  const keys = getAttrKeys(position);
  const out = { ...attributes };
  keys.forEach((k) => {
    const v = attributes[k];
    if (typeof v === "number") {
      out[k] = clamp(v + delta);
    }
  });
  return out;
};

// ═══ MIGRATION ═══
// Eski oyuncuda attributes yoksa ekle. Mutate ETMEZ, yeni obje döner.
export const ensurePlayerAttributes = (player) => {
  if (!player) return player;
  const keys = getAttrKeys(player.position);
  // attribute objesi var mı VE tüm key'ler dolu mu?
  const hasAll = player.attributes
    && keys.every((k) => typeof player.attributes[k] === "number");
  if (hasAll) return player;
  return {
    ...player,
    attributes: generateDefaultAttributes(
      player.position || "ORTA SAHA",
      player.rating || 70,
      player.id || ""
    ),
  };
};

// ═══ FORM GÜCÜ ═══
//
// YENİ MODEL — overall'a uygulanan küçük delta (asimetrik):
//   Maksimum +5 (alev sıcak streak), minimum -3 (kötü streak).
//   Lig/oyun yönetim oyunlarındaki "form" mantığı: toplam güç değişmez,
//   sadece o anki etkin güç dalgalanır.
//
// matchScore() artık 0-100 değil, -1.0..+1.0 arası "katkı puanı" üretir.
// Sonra son 5 maçın ağırlıklı ortalaması → ölçeklenir → asimetrik clamp.
//
// formDelta:
//   +5  →  son maçların hepsi galibiyet + birden fazla gol → "blazing"
//   +2..+4 → iyi gidiyor
//   ±0..±1 → ortalama
//   -1..-2 → düşüşte
//   -3 → seri yenilgi / gol yok / kötü maçlar (tabana clamp)
//
// "Üst üste 3-4 hafta gol atıyorsa +5 gelsin, soğuksa -3 düşsün" isteğine
// uygun şekilde kalibre edildi.

const FORM_WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4]; // En yeni maç ilk; eski maçlar da hatırı sayılır etkili
const FORM_MAX_BOOST = 5;
const FORM_MAX_DROP  = -3;

// Tek bir maç performansını ~-1.2 .. +1.4 arası bir katkı puanına çevir.
// Pozitif = iyi, negatif = kötü.
const matchContribution = ({
  goals = 0,
  assists = 0,
  result = "D",
  isMVP = false,
  cleanSheet = false,
  redCard = false,
  yellowCard = false,
}) => {
  let s = 0;

  // Sonuç (güçlü temel sinyal)
  if (result === "W") s += 0.50;
  else if (result === "L") s -= 0.55;
  else s -= 0.10; // beraberlik nötr-altı

  // Skor katkısı (asimptot ile sınırlı — gol başına anlamlı boost,
  // ama 5 gol atan oyuncu da çatıya yapışsın)
  if (goals > 0) s += Math.min(0.70, goals * 0.32);
  if (assists > 0) s += Math.min(0.35, assists * 0.16);

  // Kaleci özel
  if (cleanSheet) s += 0.40;

  // Bonus / penaltı
  if (isMVP) s += 0.25;
  if (redCard) s -= 0.55;
  if (yellowCard) s -= 0.12;

  return Math.max(-1.2, Math.min(1.4, s));
};

// playerStat (matchHistory.computePlayerStats) çıktısından form delta'sı hesapla
// Sadece son 5 maç. Maç yoksa null döner ("yetersiz veri").
//
// Dönüş: { delta: number, recent: [...] } | null
//   delta: -3 .. +5 arası tam sayı  (overall'a eklenecek)
//
// NOT: Geriye uyumluluk için fonksiyon hala "computeForm" adıyla export edilir,
//      ama dönen değer artık 0-100 değil küçük bir delta'dır. UI tarafında
//      `formDelta` olarak kullan.
export const computeForm = (playerStat) => {
  if (!playerStat || !playerStat.lastMatches || playerStat.lastMatches.length === 0) {
    return null;
  }
  const recent = playerStat.lastMatches.slice(0, 5); // computePlayerStats zaten yeni→eski sıralı

  let totalScore = 0, totalWeight = 0;
  recent.forEach((m, i) => {
    const w = FORM_WEIGHTS[i] ?? 0.1;
    const c = matchContribution({
      goals: m.goals || 0,
      assists: m.assists || 0,
      result: m.result || "D",
    });
    totalScore += c * w;
    totalWeight += w;
  });
  const avg = totalWeight > 0 ? totalScore / totalWeight : 0; // ~-1.2 .. +1.4 arası

  // Asimetrik ölçek: pozitif tarafta tepe ~+0.85'de saturasyona ulaşsın
  // (mükemmel olmasa bile galibiyet+gol streak'iyle +5'e çıksın),
  // negatif tarafta ~-0.7'de tabana otursun.
  let delta;
  if (avg >= 0) {
    delta = avg * (FORM_MAX_BOOST / 0.85);
  } else {
    delta = avg * (Math.abs(FORM_MAX_DROP) / 0.7);
  }

  // Veri azlığı yumuşatması: 1-2 maçlık çok kısa serilerde tam delta'yı verme
  if (recent.length < 3) {
    delta *= recent.length / 3;
  }

  // Tam sayıya yuvarla ve clamp
  delta = Math.round(delta);
  delta = Math.max(FORM_MAX_DROP, Math.min(FORM_MAX_BOOST, delta));
  return delta;
};

// ═══ EFEKTİF GÜÇ (overall + form) ═══
// UI'da "şu anki etkin güç"ü göstermek için yardımcı.
export const getEffectiveRating = (rating, formDelta) => {
  if (typeof rating !== "number") return null;
  const d = typeof formDelta === "number" ? formDelta : 0;
  return clamp(rating + d, ATTR_MIN, ATTR_MAX);
};

// ═══ FORM ETİKETLERİ ═══
// Form delta → emoji + label key + renk
//
// Eşikler delta tabanlı:
//   +4..+5  → blazing 🔥
//   +2..+3  → hot 📈
//   -1..+1  → average ➖
//   -2      → cold 📉
//   -3      → freezing ❄️
export const getFormLabel = (formDelta) => {
  if (formDelta == null) return { icon: "—", labelKey: "form_no_data", color: "rgba(255,255,255,0.3)" };
  if (formDelta >= 4)  return { icon: "🔥", labelKey: "form_blazing",  color: "#f97316" };
  if (formDelta >= 2)  return { icon: "📈", labelKey: "form_hot",      color: "#22c55e" };
  if (formDelta >= -1) return { icon: "➖", labelKey: "form_avg",      color: "#94a3b8" };
  if (formDelta >= -2) return { icon: "📉", labelKey: "form_cold",     color: "#fb923c" };
  return                  { icon: "❄️",  labelKey: "form_freezing", color: "#60a5fa" };
};