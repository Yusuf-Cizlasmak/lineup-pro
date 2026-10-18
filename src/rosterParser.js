// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · WhatsApp kadro listesi ayrıştırıcı
// ─────────────────────────────────────────────────────────────
// Grupta dönen listeyi ("1- Ahmet ✅ / 2. Mehmet (k) / Yedek: Can") tek
// yapıştırmayla oyuncuya çevirir. Saf JS — DOM / React yok, Jest ile test edilir.
//
//   import { parseRoster, matchExisting } from "./rosterParser";
//   const { players, subs, out, ignored } = parseRoster(text);
//   const m = matchExisting(players, [...teamA.players, ...teamB.players]);
//
// parseRoster(text) → {
//   players: [{ name, firstName, lastName, isGK, isSub, raw }]  // asıl + yedek (isSub ile)
//   subs:    [...]   // players içinden isSub === true olanlar
//   out:     [...]   // ❌ / "(gelmiyor)" / "Gelmeyenler:" altındakiler — oyuncu SAYILMAZ
//   ignored: [raw]   // başlık / cümle / saat-tarih satırları
// }
// ─────────────────────────────────────────────────────────────
import { normalizeName, titleCaseWord, fullNameOf } from "./roster";

// ═══ SÖZLÜKLER (normalize edilmiş: küçük harf, diakritiksiz) ═══
const DAY_WORDS = new Set(["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]);
const MONTH_WORDS = new Set(["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"]);
// Bir isim satırında geçmesi neredeyse imkânsız, başlık/duyuru kelimeleri
const HEADER_WORDS = new Set([
  "mac", "maci", "maca", "macimiz", "saha", "sahasi", "hali", "halisaha", "kadro", "kadrosu", "kadromuz",
  "liste", "listesi", "listemiz", "saat", "saatte", "aksam", "aksami", "sabah", "ogle", "gece",
  "ucret", "ucreti", "kisi", "kisilik", "kisibasi", "iban", "tl", "lira", "odeme", "para",
  "gelenler", "gelecekler", "gelecek", "katilim", "katilimcilar", "katilanlar", "oyuncular", "oyuncu",
  "takim", "takimlar", "takimi", "hafta", "haftaki", "haftanin", "toplam", "lutfen", "arkadaslar",
  "selam", "selamlar", "merhaba", "kim", "kimler", "geliyor", "geliyoruz", "gelen", "yazsin", "yazin",
  "yazalim", "adres", "konum", "tarih", "bugun", "yarin", "asillar", "futbol", "bu", "icin",
  "ile", "var", "olan", "olarak", "spor", "tesis", "tesisi", "stad", "stadi",
  "rezervasyon", "kapora",
]);
// Bölüm başlıkları — sonraki satırların türünü değiştirir
const SUB_HEADER_RE = /^(yedek|yedekler|yedekte|yedek oyuncular|yedek liste|yedek listesi|bekleme listesi|bekleyenler|sira bekleyenler|sirada|subs?)$/;
const OUT_HEADER_RE = /^(gelmeyenler|gelemeyenler|gelmeyecekler|gelemeyecekler|gelmiyorlar|gelmiyor|katilmayanlar|izinli|izinliler|iptal|yok|yoklar)$/;
const MAIN_HEADER_RE = /^(kadro|kadromuz|asil kadro|asillar|gelenler|gelecekler|liste|oyuncular|katilimcilar|katilanlar|ilk 14|ilk 12|ilk 10|ilk 11)$/;
// "Kaleciler:" → sonraki (veya aynı satırdaki) isimler kaleci
const GK_HEADER_RE = /^(kaleci|kaleciler|kale)$/;

// ═══ REGEX'LER ═══
// WhatsApp'tan kopyalanan mesaj başlığı:
//   "[21:03, 18.10.2026] Ahmet Yılmaz: ..."  ·  "18.10.2026 21:03 - Ahmet: ..."
const WA_PREFIX_RES = [
  /^\[[^\]]{4,32}\]\s*[^:\n]{1,40}:\s+/,
  /^\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}[:.]\d{2}(?::\d{2})?\s*[-–]\s*[^:\n]{1,40}:\s+/,
];
// Emoji + yaygın liste sembolleri (✅ ❌ ⚽ 🧤 • ▪ ► …). Rakamlar/# hariç tutulur.
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu;
const SYMBOL_RE = /[✓✔✗✘✕✖☑☐☒•·∙▪▫◦●○◆◇■□►▶▸▹→⇒➔➜➡★☆♦♥♠♣‣⁃※❖✦✧⚫⚪~*_"“”„«»|]/g;
const TIME_RE = /\b\d{1,2}[:.]\d{2}\b/;
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/;
const URL_RE = /(https?:\/\/|www\.|\.com\b|\.tr\b)/i;
const MONEY_RE = /(₺|\$|€|\b\d+\s*(tl|lira)\b)/i;
const PHONE_RE = /(?:\d[\s-]?){7,}/;
// Satır başı numaralandırma: "1-", "1.", "1)", "1 -", "01:", "#3", "1/"
const NUMBERING_RE = /^\s*#?\d{1,3}\s*(?:[-–—.):\]/]+\s*|\s+)(?=\D)/;
// Satır başı madde işaretleri
const BULLET_RE = /^\s*[-–—+>]+\s*/;

// Kaleci işaretleri
const GK_MARK_RE = /(\(\s*(k|kl|gk|kaleci)\s*\)|\[\s*(k|kl|gk)\s*\]|🧤|🥅)/i;
const GK_WORD_RE = /^(kaleci|kaleciyim|gk|goalkeeper)$/;
// Gelmiyor işaretleri (satırdaki ❌ veya parantez notu)
const OUT_MARK_RE = /[❌✖✗✘⛔🚫🙅]/u;
const OUT_NOTE_RE = /\(\s*(gelmiyor|gelemiyor|gelmeyecek|gelemeyecek|gelemem|gelmiyorum|gelemiyorum|yok|iptal|izinli|sakat)\s*\)/i;
const SUB_NOTE_RE = /\(\s*(yedek|yedekte|bekleme)\s*\)/i;

// ═══ YARDIMCILAR ═══
const words = (s) => s.split(/\s+/).filter(Boolean);
const normWords = (s) => words(normalizeName(s));

const stripWaPrefix = (s) => {
  let out = s;
  for (const re of WA_PREFIX_RES) out = out.replace(re, "");
  return out;
};

// "Ahmet, Mehmet ve Ali" → ["Ahmet", "Mehmet", "Ali"]
const splitSegments = (s) =>
  s.split(/\s*[,;&]\s*|\s+ve\s+/i).map((x) => x.trim()).filter(Boolean);

const stripDecor = (s) =>
  s.replace(EMOJI_RE, " ").replace(SYMBOL_RE, " ").replace(/\s+/g, " ").trim();

const stripNumbering = (s) => {
  let out = s;
  // "1- • Ahmet" gibi iç içe numara + madde işaretleri için birkaç tur
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = out.replace(NUMBERING_RE, "").replace(BULLET_RE, "").trim();
    if (out === before) break;
  }
  return out;
};

// "Yedek: Can, Emre" → { kind: "sub", rest: "Can, Emre" }
const detectSectionHeader = (s) => {
  const m = s.match(/^([^:]{1,30}?)\s*:\s*(.*)$/);
  const head = normalizeName((m ? m[1] : s).replace(/[^\p{L}\p{N}\s]/gu, " "));
  const rest = m ? m[2].trim() : "";
  if (SUB_HEADER_RE.test(head)) return { kind: "sub", rest };
  if (OUT_HEADER_RE.test(head)) return { kind: "out", rest };
  if (MAIN_HEADER_RE.test(head)) return { kind: "main", rest };
  if (GK_HEADER_RE.test(head)) return { kind: "gk", rest };
  return null;
};

// Başlık / duyuru satırı mı? (isim değil)
// listItem: satır numaralı / madde işaretliydi → neredeyse kesin isim, gün/ay kuralı uygulanmaz
const looksLikeHeader = (text, hadTimeOrDate, listItem = false) => {
  if (hadTimeOrDate) return true;
  if (URL_RE.test(text) || MONEY_RE.test(text)) return true;
  const nw = normWords(text);
  if (nw.length === 0) return false;
  if (nw.length > 4) return true;
  const hasHeaderWord = nw.some((w) => HEADER_WORDS.has(w));
  if (hasHeaderWord) return true;
  if (listItem) return false;
  const hasMonth = nw.some((w) => MONTH_WORDS.has(w));
  const hasDigit = /\d/.test(text);
  if (hasMonth && hasDigit) return true;
  const day = nw.find((w) => DAY_WORDS.has(w));
  if (day) {
    // "Cuma" aynı zamanda yaygın bir erkek adı → "Cuma Yıldız" isim kalır,
    // ama "Cuma" tek başına / "Cuma akşamı" / "Cuma 21:00" başlıktır.
    if (day === "cuma" && nw.length === 2 && nw[0] === "cuma" && !hasDigit) return false;
    return true;
  }
  return false;
};

// Temizlenmiş isim metni → { name, firstName, lastName } | null
const buildName = (text) => {
  let toks = words(text)
    // "+1", "?", "!" gibi kırıntılar
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}.'’-]+$/gu, ""))
    .filter(Boolean)
    // tek başına sayılar (forma no vb.) at
    .filter((w) => !/^\d+$/.test(w));
  if (toks.some((w) => /\d/.test(w))) return null;
  if (toks.length === 0 || toks.length > 4) return null;
  // "Y" tek harfi soyad baş harfi olarak "Y." yap
  toks = toks.map((w, i) => {
    const bare = w.replace(/\.+$/, "");
    if (i > 0 && bare.length === 1) return `${titleCaseWord(bare)}.`;
    return titleCaseWord(bare);
  }).filter(Boolean);
  if (toks.length === 0) return null;
  // İlk kelime tek harf/nokta ise isim değildir
  if (toks[0].replace(/[^\p{L}]/gu, "").length < 2) return null;
  const firstName = toks[0];
  const lastName = toks.slice(1).join(" ");
  return { name: [firstName, lastName].filter(Boolean).join(" "), firstName, lastName };
};

// ═══ ANA FONKSİYON ═══
export function parseRoster(text) {
  const result = { players: [], subs: [], out: [], ignored: [] };
  if (!text || typeof text !== "string") return result;

  const seen = new Set();
  let mode = "main"; // main | sub | out
  let gkMode = false; // "Kaleciler:" başlığından sonra

  // Bir isim parçasını (virgülle ayrılmış olabilir) işle
  const pushName = (segment, raw, flags) => {
    let s = segment;
    // Satır sonu notları: "Ahmet - geç gelir", "Ahmet: geliyorum", "Ahmet / belki"
    s = s.split(/\s+[-–—/|]\s+|:\s+/)[0];
    // Kaleci / yedek kelimeleri (ayrı kelime olarak)
    let isGK = flags.isGK;
    let isSub = flags.isSub;
    const kept = words(s).filter((w) => {
      const nw = normalizeName(w.replace(/[^\p{L}]/gu, ""));
      if (GK_WORD_RE.test(nw)) { isGK = true; return false; }
      if (nw === "yedek") { isSub = true; return false; }
      if (nw === "belki") return false;
      return true;
    });
    s = kept.join(" ").replace(/[,;()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
    if (!s || !/\p{L}/u.test(s)) return;
    if (looksLikeHeader(s, false, flags.listItem)) { result.ignored.push(raw); return; }
    const nm = buildName(s);
    if (!nm) { result.ignored.push(raw); return; }
    const key = normalizeName(nm.name);
    if (seen.has(key)) return; // tekrar eden isim
    seen.add(key);
    const entry = { ...nm, isGK: !!isGK, isSub: !!isSub && !flags.isOut, raw };
    if (flags.isOut) { result.out.push(entry); return; }
    result.players.push(entry);
    if (entry.isSub) result.subs.push(entry);
  };

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const rawLine of lines) {
    const raw = rawLine.trim();
    if (!raw) continue;

    let s = stripWaPrefix(raw);

    // ── İşaretler (temizlemeden ÖNCE yakala)
    const isGKMark = GK_MARK_RE.test(s);
    // ❌ / "(gelmiyor)" / WhatsApp üstü çizili "~Ahmet~"
    const isOutMark = OUT_MARK_RE.test(s) || OUT_NOTE_RE.test(s) || /~[^~\s][^~]*~/.test(s);
    const isSubMark = SUB_NOTE_RE.test(s);

    // ── Parantez içi notları at: "(gelmeyebilir)", "(k)", "[yedek]"
    s = s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ");
    // ── Emoji + semboller
    s = stripDecor(s);
    if (!s) continue;

    // Telefon numarası / mention satırı
    if (PHONE_RE.test(s)) { result.ignored.push(raw); continue; }

    // Saat / tarih numaralandırmadan önce kontrol edilir ("21:00" → "00" kalmasın)
    const hadTimeOrDate = TIME_RE.test(s) || DATE_RE.test(s);

    const beforeNum = s;
    s = stripNumbering(s).replace(/@/g, "").trim();
    const listItem = s !== beforeNum;
    if (!s || !/\p{L}/u.test(s)) continue; // "13-" gibi boş slot

    // ── Bölüm başlığı mı? ("Yedekler:", "Gelmeyenler", "Kadro:")
    const section = !hadTimeOrDate ? detectSectionHeader(s) : null;
    if (section) {
      if (section.kind === "gk") {
        gkMode = true;
        if (mode === "out") mode = "main";
      } else {
        mode = section.kind;
        gkMode = false;
      }
      if (section.rest) {
        const secFlags = {
          isGK: isGKMark || gkMode, isSub: mode === "sub", isOut: mode === "out", listItem: true,
        };
        for (const seg of splitSegments(section.rest)) pushName(seg, raw, secFlags);
      }
      continue;
    }

    if (hadTimeOrDate) { result.ignored.push(raw); continue; }
    // "Ahmet, Mehmet, Can ve Burak" — önce parçala; başlık kontrolü parça başına yapılır
    const segments = splitSegments(s);
    if (segments.length <= 1 && looksLikeHeader(s, false, listItem)) { result.ignored.push(raw); continue; }

    const flags = {
      isGK: isGKMark || gkMode,
      isSub: mode === "sub" || isSubMark,
      isOut: mode === "out" || isOutMark,
      listItem,
    };
    for (const seg of segments) pushName(seg, raw, flags);
  }
  return result;
}

// ═══ KADRO EŞLEŞTİRME ═══
// Ayrıştırılan isimleri mevcut oyuncularla eşleştirir (Türkçe-duyarlı):
//   1) Tam ad-soyad eşit               "Ahmet Yılmaz" ↔ Ahmet Yılmaz
//   2) Mevcut oyuncunun ad alanı eşit   "Mehmet Ali"   ↔ Mehmet Ali (ad) + Kaya (soyad)
//   3) Soyad baş harfi                  "Ahmet Y."     ↔ Ahmet Yılmaz
//   4) Sadece ad (tekilse)              "Burak"        ↔ Burak Kaya
//   5) Mevcutta soyad yoksa ad eşit     "Ahmet Yılmaz" ↔ Ahmet
// Önce TÜM tam eşleşmeler alınır, sonra kalanlara esnek kurallar uygulanır;
// bir oyuncu iki kez eşleşmez. Birden çok aday varsa "ambiguous" döner.
//
// Dönüş: {
//   results:   [{ parsed, player|null, how, candidates? }]  // parsed sırasıyla
//   matched:   [{ parsed, player, how }]
//   unmatched: [parsed]
//   ambiguous: [{ parsed, candidates: [player] }]
// }
export function matchExisting(parsed, existingPlayers) {
  const list = (parsed || []).filter(Boolean);
  const pool = (existingPlayers || []).filter(Boolean).map((p) => {
    const nameNorm = normalizeName(p.name);
    return {
      p,
      full: normalizeName(fullNameOf(p)),
      nameNorm,
      first: nameNorm.split(" ")[0] || "",
      last: normalizeName(p.surname),
    };
  });
  const used = new Set();
  const results = list.map((pp) => ({ parsed: pp, player: null, how: null }));

  const claim = (r, info, how) => {
    used.add(info.p.id);
    r.player = info.p;
    r.how = how;
  };

  // ── PASS 1 — tam eşleşmeler
  results.forEach((r) => {
    const full = normalizeName(r.parsed.name);
    const hit = pool.find((x) => !used.has(x.p.id) && x.full === full);
    if (hit) claim(r, hit, "exact");
  });

  // ── PASS 2 — esnek kurallar (sadece TEK aday varsa otomatik)
  results.forEach((r) => {
    if (r.player) return;
    const first = normalizeName(r.parsed.firstName || r.parsed.name.split(" ")[0]);
    const lastRaw = normalizeName(r.parsed.lastName || "");
    const full = normalizeName(r.parsed.name);
    const free = pool.filter((x) => !used.has(x.p.id));

    const tryRule = (cands, how) => {
      if (cands.length === 1) { claim(r, cands[0], how); return true; }
      if (cands.length > 1) { r.candidates = cands.map((c) => c.p); r.how = "ambiguous"; return true; }
      return false;
    };

    // 2) Ad alanı tam eşit ("Mehmet Ali")
    if (r.parsed.lastName && tryRule(free.filter((x) => x.nameNorm === full), "name")) return;

    // 3) Soyad baş harfi: "Ahmet Y." / "Ahmet Y"
    const initial = lastRaw.replace(/\./g, "");
    if (initial.length === 1) {
      if (tryRule(free.filter((x) => x.first === first && x.last.startsWith(initial)), "initial")) return;
    }

    // 4) Sadece ad yazılmış → aynı ada sahip tek oyuncu
    if (!lastRaw) {
      if (tryRule(free.filter((x) => x.first === first), "first")) return;
    }

    // 5) Listede ad+soyad var, mevcut oyuncuda soyad yok ("Ahmet" kayıtlı)
    if (lastRaw && initial.length !== 1) {
      tryRule(free.filter((x) => !x.last && x.nameNorm === first), "first_only_existing");
    }
  });

  return {
    results,
    matched: results.filter((r) => r.player).map(({ parsed: pp, player, how }) => ({ parsed: pp, player, how })),
    unmatched: results.filter((r) => !r.player && !r.candidates).map((r) => r.parsed),
    ambiguous: results.filter((r) => !r.player && r.candidates).map((r) => ({ parsed: r.parsed, candidates: r.candidates })),
  };
}
