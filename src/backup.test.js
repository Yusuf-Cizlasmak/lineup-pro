// ─────────────────────────────────────────────────────────────
// backup.js — içe aktarma doğrulaması (yedek dosyası Pro veremez vb.)
// ─────────────────────────────────────────────────────────────
import { buildBackup, importBackupFromText, parseBackupText, backupFileName } from "./backup";

const wrap = (data, extra = {}) =>
  JSON.stringify({ app: "halisaha-kolik", version: 1, exportedAt: 1, data, ...extra });

beforeEach(() => {
  localStorage.clear();
});

describe("importBackupFromText — doğrulama", () => {
  test("boş / bozuk JSON reddedilir", () => {
    expect(importBackupFromText("")).toMatchObject({ ok: false, error: "empty" });
    expect(importBackupFromText("{bozuk")).toMatchObject({ ok: false, error: "invalid_json" });
    expect(importBackupFromText("[]")).toMatchObject({ ok: false, error: "invalid_format" });
  });

  test("başka uygulamanın / sürümün dosyası reddedilir", () => {
    expect(importBackupFromText(JSON.stringify({ app: "x", version: 1, data: { halisaha_a: "1" } })))
      .toMatchObject({ ok: false, error: "wrong_app" });
    expect(importBackupFromText(wrap({ halisaha_a: "1" }, { version: 2 })))
      .toMatchObject({ ok: false, error: "unsupported_version" });
  });

  test("data objesi yoksa / dizi ise reddedilir", () => {
    expect(importBackupFromText(JSON.stringify({ app: "halisaha-kolik", version: 1 })))
      .toMatchObject({ ok: false, error: "invalid_data" });
    expect(importBackupFromText(wrap(["halisaha_a"])))
      .toMatchObject({ ok: false, error: "invalid_data" });
  });

  test("abonelik / deneme / kota anahtarları yazılmaz", () => {
    const r = importBackupFromText(wrap({
      halisaha_subscription: JSON.stringify({ tier: "pro", until: 9999999999999 }),
      halisaha_trial_used: "0",
      halisaha_online_creates_monthly: "{}",
      halisaha_match_history: "[]",
    }));
    expect(r).toEqual({ ok: true, keys: 1 });
    expect(localStorage.getItem("halisaha_subscription")).toBeNull();
    expect(localStorage.getItem("halisaha_trial_used")).toBeNull();
    expect(localStorage.getItem("halisaha_online_creates_monthly")).toBeNull();
    expect(localStorage.getItem("halisaha_match_history")).toBe("[]");
  });

  test("sadece abonelik anahtarı içeren yedek → no_data", () => {
    expect(importBackupFromText(wrap({ halisaha_subscription: "{}" })))
      .toMatchObject({ ok: false, error: "no_data" });
  });

  test("halisaha_ dışı anahtarlar (hk_ debug bayrakları vb.) yazılmaz", () => {
    const r = importBackupFromText(wrap({ hk_force_purchase_fail: "1", foo: "bar", halisaha_lang: "en" }));
    expect(r).toEqual({ ok: true, keys: 1 });
    expect(localStorage.getItem("hk_force_purchase_fail")).toBeNull();
    expect(localStorage.getItem("foo")).toBeNull();
    expect(localStorage.getItem("halisaha_lang")).toBe("en");
  });

  test("mevcut halisaha_ verileri değiştirilir; mevcut abonelik korunur", () => {
    localStorage.setItem("halisaha_subscription", "MEVCUT");
    localStorage.setItem("halisaha_kasa", "ESKİ");
    localStorage.setItem("halisaha_kolik_data", "ESKİ");
    const r = importBackupFromText(wrap({ halisaha_kolik_data: "YENİ" }));
    expect(r).toEqual({ ok: true, keys: 1 });
    expect(localStorage.getItem("halisaha_subscription")).toBe("MEVCUT");
    expect(localStorage.getItem("halisaha_kolik_data")).toBe("YENİ");
    expect(localStorage.getItem("halisaha_kasa")).toBeNull();
  });

  test("string olmayan değerler JSON'a çevrilir", () => {
    const r = importBackupFromText(wrap({ halisaha_match_schedule: { weekday: 4, time: "21:00" } }));
    expect(r.ok).toBe(true);
    expect(JSON.parse(localStorage.getItem("halisaha_match_schedule"))).toEqual({ weekday: 4, time: "21:00" });
  });
});

describe("buildBackup — dışa aktarma içeriği", () => {
  test("halisaha_ anahtarlarını toplar, abonelik ve hk_ anahtarlarını dışarıda bırakır", () => {
    localStorage.setItem("halisaha_match_history", "[1]");
    localStorage.setItem("halisaha_device_id", "dev-1");
    localStorage.setItem("halisaha_subscription", "{}");
    localStorage.setItem("halisaha_trial_used", "1");
    localStorage.setItem("hk_debug", "1");
    const b = buildBackup();
    expect(b.app).toBe("halisaha-kolik");
    expect(b.version).toBe(1);
    expect(Object.keys(b.data).sort()).toEqual(["halisaha_device_id", "halisaha_match_history"]);
  });

  test("dışa aktarılan yedek tekrar içe aktarılabilir (round-trip)", () => {
    localStorage.setItem("halisaha_match_history", "[1,2]");
    localStorage.setItem("halisaha_nickname", "Yusuf");
    const text = JSON.stringify(buildBackup());
    localStorage.clear();
    expect(parseBackupText(text).ok).toBe(true);
    expect(importBackupFromText(text)).toEqual({ ok: true, keys: 2 });
    expect(localStorage.getItem("halisaha_nickname")).toBe("Yusuf");
  });

  test("dosya adı halisaha-yedek-YYYY-MM-DD.json", () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe("halisaha-yedek-2026-01-05.json");
  });
});
