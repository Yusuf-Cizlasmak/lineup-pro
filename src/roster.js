// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Kadro yardımcıları (katılım · misafir · örnek)
// ─────────────────────────────────────────────────────────────
// Oyuncu objesi bayrakları (TÜM modüller buna uyar):
//   p.absent  === true → bu hafta gelmiyor (AI dağıtımı / maç kaydı dışı)
//   p.isGuest === true → tek seferlik misafir (+1) — krallık tablolarına girmez
//   p.isDemo  === true → "Örnek kadroyla dene" oyuncusu — geçmişe HİÇ yazılmaz
//
// Bu dosya saf JS'tir (analytics / capacitor import ETMEZ) → Jest testlerinde
// rosterParser ile birlikte rahatça kullanılabilir.
// ─────────────────────────────────────────────────────────────

// ═══ BAYRAKLAR ═══
export const isPresent = (p) => !!p && !p.absent;
export const isGuest = (p) => !!p && p.isGuest === true;
export const isDemo = (p) => !!p && p.isDemo === true;

// Sadece bu hafta gelenler (absent olmayanlar)
export const presentPlayers = (players) => (players || []).filter(isPresent);

// Gerçek kadro: örnek ve misafir olmayan oyuncular (SQUAD_READY vb. için)
export const realPlayers = (players) =>
  (players || []).filter((p) => p && !isDemo(p) && !isGuest(p));

// ═══ TÜRKÇE-DUYARLI İSİM NORMALİZASYONU ═══
// "  AHMET  Yılmaz " → "ahmet yilmaz" · "İsmail Çağlar" → "ismail caglar"
// • Türkçe büyük/küçük harf (İ→i, I→ı→i)
// • Diakritikler kaldırılır (ş→s, ğ→g, ü→u, ö→o, ç→c, ı→i, â/î/û → a/i/u)
// • Fazla boşluklar tek boşluğa indirilir
const TR_FOLD = {
  "İ": "i", "I": "i", "ı": "i", "i": "i",
  "Ş": "s", "ş": "s",
  "Ğ": "g", "ğ": "g",
  "Ü": "u", "ü": "u",
  "Ö": "o", "ö": "o",
  "Ç": "c", "ç": "c",
};
export const normalizeName = (str) => {
  if (str == null) return "";
  let s = String(str);
  s = s.replace(/[İIıiŞşĞğÜüÖöÇç]/g, (ch) => TR_FOLD[ch] || ch);
  s = s.toLowerCase();
  // Kalan birleşik aksanlar (â, î, û, é …)
  try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch {}
  return s.replace(/\s+/g, " ").trim();
};

// Türkçe büyük/küçük harf dönüşümleri (ICU'ya bağımlı olmadan)
export const trLower = (s) =>
  String(s || "").replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
export const trUpper = (s) =>
  String(s || "").replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();

// Kelimeyi baş harfi büyük yap — sadece tamamı küçük/büyük yazılmışsa
// ("ahmet" → "Ahmet", "AHMET" → "Ahmet", "McDonald" dokunulmaz)
export const titleCaseWord = (w) => {
  if (!w) return w;
  const isAllLower = w === trLower(w);
  const isAllUpper = w === trUpper(w);
  if (!isAllLower && !isAllUpper) return w;
  // "Y." gibi tek harf baş harfler büyük kalsın
  const lower = trLower(w);
  return trUpper(lower.charAt(0)) + lower.slice(1);
};

export const fullNameOf = (p) =>
  `${(p?.name || "").trim()} ${(p?.surname || "").trim()}`.trim();

// ═══ AYNI İSİM KONTROLÜ ═══
// Yeni/düzenlenen oyuncu adı kadroda zaten var mı? (iki takım birlikte verilir)
//  • Ad+soyad normalize eşit → kopya
//  • Yeni oyuncunun soyadı yoksa ve aynı ada sahip biri varsa → kopya şüphesi
// Bulursa o oyuncuyu döner, yoksa null.
export const findDuplicatePlayer = (name, surname, players, excludeId = null) => {
  const n = normalizeName(name);
  if (!n) return null;
  const full = normalizeName(`${name || ""} ${surname || ""}`);
  const noSurname = !normalizeName(surname);
  for (const p of players || []) {
    if (!p || (excludeId && p.id === excludeId)) continue;
    const pFull = normalizeName(fullNameOf(p));
    if (pFull && pFull === full) return p;
    if (noSurname && normalizeName(p.name) === n) return p;
  }
  return null;
};

// ═══ GÜÇ SEVİYELERİ — hızlı seçici (Zayıf / Orta / İyi / Yıldız) ═══
export const STRENGTH_LEVELS = [
  { key: "weak",   label: "Zayıf",  rating: 60 },
  { key: "mid",    label: "Orta",   rating: 70 },
  { key: "good",   label: "İyi",    rating: 80 },
  { key: "star",   label: "Yıldız", rating: 88 },
];
export const DEFAULT_STRENGTH = 70;
// Puan tam olarak bir seviyeye denk geliyorsa o seviyenin key'i, değilse null
export const strengthKeyOf = (rating) => {
  const lv = STRENGTH_LEVELS.find((l) => l.rating === rating);
  return lv ? lv.key : null;
};

// Hızlı ekleme için 4 ana mevki (uygulamanın gerçek pozisyon değerleri)
export const QUICK_POSITIONS = ["KALECİ", "DEFANS", "ORTA SAHA", "FORVET"];

// ═══ FOTOĞRAF KÜÇÜLTME ═══
// localStorage'da base64 tutulduğu için foto max 200px · JPEG 0.7'ye indirilir
// (800px PNG ≈ 1MB → 200px JPEG ≈ 10-15KB). Hata olursa orijinali döner.
export const resizeImageDataUrl = (dataUrl, maxSize = 200, quality = 0.7) =>
  new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== "string" || typeof document === "undefined") {
      resolve(dataUrl);
      return;
    }
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) { resolve(dataUrl); return; }
          const scale = Math.min(1, maxSize / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * scale));
          const ch = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = cw; canvas.height = ch;
          const ctx = canvas.getContext("2d");
          // JPEG'de şeffaflık yok → koyu zemin (uygulama arka planı)
          ctx.fillStyle = "#0d1117";
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          const out = canvas.toDataURL("image/jpeg", quality);
          // Küçültme beklenenden büyük çıktıysa (çok küçük PNG vb.) orijinali koru
          resolve(out && out.length < dataUrl.length ? out : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });

// ═══ localStorage KOTA HATASI TESPİTİ ═══
export const isQuotaError = (e) => {
  if (!e) return false;
  const name = e.name || "";
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 || e.code === 1014 ||
    /quota/i.test(String(e.message || ""))
  );
};
