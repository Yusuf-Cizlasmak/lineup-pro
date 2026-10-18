// HalıSaha-Kolik · rosterParser testleri — gerçekçi WhatsApp grup listeleri
import { parseRoster, matchExisting } from "./rosterParser";
import { normalizeName, findDuplicatePlayer, isPresent, presentPlayers } from "./roster";

const names = (arr) => arr.map((p) => p.name);

describe("normalizeName", () => {
  test("Türkçe karakterler ve büyük/küçük harf", () => {
    expect(normalizeName("  İSMAİL   Çağlar ")).toBe("ismail caglar");
    expect(normalizeName("IŞIK Güneş")).toBe("isik gunes");
    expect(normalizeName("Ömer Faruk Doğan")).toBe("omer faruk dogan");
    expect(normalizeName("ahmet yilmaz")).toBe(normalizeName("Ahmet Yılmaz"));
  });
});

describe("parseRoster", () => {
  test("1) Klasik numaralı liste + başlık + yedekler", () => {
    const text = `Perşembe 21:00 Yıldız Halı Saha
Kadro
1- Ahmet Yılmaz
2- Mehmet Demir
3- Can Özkan (k)
4- Burak Kaya
5-
6-
Yedek:
1- Emre Çelik
2- Ali Şahin`;
    const r = parseRoster(text);
    expect(names(r.players)).toEqual([
      "Ahmet Yılmaz", "Mehmet Demir", "Can Özkan", "Burak Kaya", "Emre Çelik", "Ali Şahin",
    ]);
    expect(names(r.subs)).toEqual(["Emre Çelik", "Ali Şahin"]);
    expect(r.players.find((p) => p.name === "Can Özkan").isGK).toBe(true);
    expect(r.players.find((p) => p.name === "Ahmet Yılmaz").isSub).toBe(false);
    expect(r.ignored).toContain("Perşembe 21:00 Yıldız Halı Saha");
  });

  test("2) Farklı numaralandırma biçimleri: 1. 1) 1 - 01: #1", () => {
    const text = `1. Ahmet
2) Mehmet
3 - Can
04: Burak
#5 Emre
6.Kerem`;
    expect(names(parseRoster(text).players)).toEqual(["Ahmet", "Mehmet", "Can", "Burak", "Emre", "Kerem"]);
  });

  test("3) Emojiler ve madde işaretleri temizlenir, 🧤 kaleci olur", () => {
    const text = `⚽ Bu hafta kim geliyor ⚽
• Ahmet ✅
• Mehmet ✅
- Hakan 🧤
* Oğuz 🔥🔥
1️⃣ Serkan
▪️ Yusuf 👍🏻`;
    const r = parseRoster(text);
    expect(names(r.players)).toEqual(["Ahmet", "Mehmet", "Hakan", "Oğuz", "Serkan", "Yusuf"]);
    expect(r.players.find((p) => p.name === "Hakan").isGK).toBe(true);
    expect(r.ignored.length).toBe(1);
  });

  test("4) Kaleci işaretleri: (K), kaleci kelimesi, [gk]", () => {
    const r = parseRoster(`1- Ahmet (K)
2- Mehmet kaleci
3- Ali [gk]
4- Can`);
    const gk = Object.fromEntries(r.players.map((p) => [p.name, p.isGK]));
    expect(gk).toEqual({ Ahmet: true, Mehmet: true, Ali: true, Can: false });
  });

  test("5) Parantez notları atılır, ❌ ve (gelmiyor) gelmeyen sayılır", () => {
    const r = parseRoster(`1- Ahmet (gelmeyebilir)
2- Mehmet (geç gelir)
3- Burak ❌
4- Emre (gelmiyor)
5- Kerem ✅`);
    expect(names(r.players)).toEqual(["Ahmet", "Mehmet", "Kerem"]);
    expect(names(r.out)).toEqual(["Burak", "Emre"]);
  });

  test("6) YEDEK / Yedekler başlıkları ve satır içi yedek listesi", () => {
    const r = parseRoster(`Ahmet
Mehmet
YEDEKLER
Can
Yedek: Emre, Kerem`);
    expect(names(r.players)).toEqual(["Ahmet", "Mehmet", "Can", "Emre", "Kerem"]);
    expect(names(r.subs)).toEqual(["Can", "Emre", "Kerem"]);
  });

  test("7) Tekrar eden isimler (büyük/küçük harf, Türkçe karakter farkı) tekilleştirilir", () => {
    const r = parseRoster(`1- Ahmet Yılmaz
2- ahmet yilmaz
3- AHMET YILMAZ
4- Mehmet`);
    expect(names(r.players)).toEqual(["Ahmet Yılmaz", "Mehmet"]);
  });

  test("8) Büyük harf isimler Türkçe kurallarla düzeltilir; ad/soyad ilk boşluktan ayrılır", () => {
    const r = parseRoster(`1- İSMAİL IŞIK
2- mehmet ali yıldız
3- ahmet y`);
    expect(r.players[0]).toMatchObject({ name: "İsmail Işık", firstName: "İsmail", lastName: "Işık" });
    expect(r.players[1]).toMatchObject({ firstName: "Mehmet", lastName: "Ali Yıldız" });
    expect(r.players[2]).toMatchObject({ name: "Ahmet Y.", firstName: "Ahmet", lastName: "Y." });
  });

  test("9) Uzun cümleler, saat/tarih, ücret ve link satırları yok sayılır", () => {
    const text = `Arkadaşlar bu hafta maç var gelen yazsın lütfen
18.10.2026
Saat 21:30
Kişi başı 150 TL
https://maps.app.goo.gl/xyz
1- Ahmet
2- Mehmet`;
    const r = parseRoster(text);
    expect(names(r.players)).toEqual(["Ahmet", "Mehmet"]);
    // Sadece tarihten oluşan satır sessizce atlanır; diğer 4 satır "ignored"da
    expect(r.ignored).toEqual([
      "Arkadaşlar bu hafta maç var gelen yazsın lütfen",
      "Saat 21:30",
      "Kişi başı 150 TL",
      "https://maps.app.goo.gl/xyz",
    ]);
  });

  test("10) WhatsApp'tan kopyalanan mesaj başlıkları atılır", () => {
    const text = `[21:03, 18.10.2026] Ahmet Yılmaz: 1- Ahmet
2- Mehmet
18.10.2026 21:05 - Can Özkan: 3- Can`;
    expect(names(parseRoster(text).players)).toEqual(["Ahmet", "Mehmet", "Can"]);
  });

  test("11) Tek satırda virgüllü liste ve 've'", () => {
    const r = parseRoster("Ahmet, Mehmet, Can ve Burak");
    expect(names(r.players)).toEqual(["Ahmet", "Mehmet", "Can", "Burak"]);
  });

  test("12) 'Cuma' isimli oyuncu korunur ama 'Cuma 21:00' başlıktır", () => {
    const r = parseRoster(`Cuma 21:00
1- Cuma
2- Cuma Yıldız
Perşembe`);
    expect(names(r.players)).toEqual(["Cuma", "Cuma Yıldız"]);
    expect(r.ignored).toEqual(["Cuma 21:00", "Perşembe"]);
  });

  test("13) Kaleciler başlığı + gelmeyenler bölümü + üstü çizili isim", () => {
    const r = parseRoster(`Kaleciler: Hakan
Oyuncular:
1- Ahmet
2- ~Mehmet~
Gelmeyenler:
Kerem`);
    expect(names(r.players)).toEqual(["Hakan", "Ahmet"]);
    expect(r.players[0].isGK).toBe(true);
    expect(names(r.out)).toEqual(["Mehmet", "Kerem"]);
  });

  test("14) Boş / geçersiz giriş", () => {
    expect(parseRoster("")).toEqual({ players: [], subs: [], out: [], ignored: [] });
    expect(parseRoster(null).players).toEqual([]);
    expect(parseRoster("1-\n2-\n3-").players).toEqual([]);
  });

  test("15) Telefon numarası / mention satırları atılır", () => {
    const r = parseRoster(`1- @905551234567
2- @Ahmet
3- +90 555 123 45 67`);
    expect(names(r.players)).toEqual(["Ahmet"]);
  });
});

describe("matchExisting", () => {
  const squad = [
    { id: "1", name: "Ahmet", surname: "Yılmaz" },
    { id: "2", name: "Mehmet", surname: "Demir" },
    { id: "3", name: "Burak", surname: "Kaya" },
    { id: "4", name: "Emre", surname: "Çelik" },
    { id: "5", name: "Emre", surname: "Aydın" },
    { id: "6", name: "Kerem", surname: "" },
    { id: "7", name: "Mehmet Ali", surname: "Koç" },
  ];

  test("tam eşleşme, baş harf, sadece ad ve Türkçe karakter farkı", () => {
    const { players } = parseRoster(`1- ahmet yilmaz
2- Mehmet D.
3- Burak
4- Kerem Arslan
5- Mehmet Ali
6- Deniz Acar`);
    const m = matchExisting(players, squad);
    const byName = Object.fromEntries(m.results.map((r) => [r.parsed.name, r.player && r.player.id]));
    expect(byName).toEqual({
      "Ahmet Yilmaz": "1",
      "Mehmet D.": "2",
      "Burak": "3",
      "Kerem Arslan": "6",
      "Mehmet Ali": "7",
      "Deniz Acar": null,
    });
    expect(names(m.unmatched)).toEqual(["Deniz Acar"]);
  });

  test("aynı adlı iki oyuncu varsa belirsiz döner; tam eşleşme önce kazanır", () => {
    const { players } = parseRoster(`Emre
Emre Aydın
Emre Ç.`);
    const m = matchExisting(players, squad);
    // "Emre Aydın" tam eşleşir → kalan tek "Emre" adayı Çelik olur
    const ids = m.results.map((r) => r.player && r.player.id);
    expect(ids[1]).toBe("5");
    expect(ids[0]).toBe("4");
    // "Emre Ç." için aday kalmadı → yeni
    expect(ids[2]).toBe(null);

    const amb = matchExisting(parseRoster("Emre").players, squad);
    expect(amb.ambiguous.length).toBe(1);
    expect(amb.ambiguous[0].candidates.map((p) => p.id).sort()).toEqual(["4", "5"]);
  });

  test("bir oyuncu iki kez eşleşmez", () => {
    const { players } = parseRoster("Burak Kaya\nBurak");
    const m = matchExisting(players, squad);
    expect(m.matched.length).toBe(1);
    expect(names(m.unmatched)).toEqual(["Burak"]);
  });
});

describe("roster yardımcıları", () => {
  test("findDuplicatePlayer ve katılım", () => {
    const squad = [
      { id: "1", name: "Ahmet", surname: "Yılmaz" },
      { id: "2", name: "Can", surname: "", absent: true },
    ];
    expect(findDuplicatePlayer("ahmet", "yilmaz", squad)?.id).toBe("1");
    expect(findDuplicatePlayer("Ahmet", "", squad)?.id).toBe("1");
    expect(findDuplicatePlayer("Ahmet", "Kaya", squad)).toBe(null);
    expect(findDuplicatePlayer("Ahmet", "Yılmaz", squad, "1")).toBe(null);
    expect(isPresent(squad[1])).toBe(false);
    expect(presentPlayers(squad).map((p) => p.id)).toEqual(["1"]);
  });
});
