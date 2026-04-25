// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · i18n (TR / EN)
// Kullanım: import { t, useLang, setLang } from './i18n';
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

const STORAGE_KEY = "halisaha_lang";

const DICT = {
  tr: {
    // Onboarding
    onb_skip: "Atla",
    onb_next: "İleri",
    onb_start: "Başla",
    onb_1_title: "HalıSaha-Kolik'e Hoş Geldin",
    onb_1_desc: "Halı saha maçlarını profesyonelce yönet. Kadronu kur, taktiğini belirle, sonucu paylaş.",
    onb_2_title: "Takımını Kur",
    onb_2_desc: "Oyuncularını ekle, mevki ve güç değerini belirle. İstediğin sayıda oyuncu ekleyebilirsin.",
    onb_3_title: "Diziliş & Taktik",
    onb_3_desc: "7 farklı formasyon arasından seç. Oyuncuları sürükleyerek pozisyonlarını ayarla.",
    onb_4_title: "Maç Modu",
    onb_4_desc: "İki takım kur, yarı sahada karşı karşıya getir. Otomatik kadro kurulumu ile saniyeler içinde hazır ol.",
    onb_5_title: "Sonucu Paylaş",
    onb_5_desc: "Maç sonunda skoru ve gol atanları kaydet. Tek tıkla görsel olarak arkadaşlarınla paylaş.",
    // Rate prompt
    rate_title: "Uygulamayı Beğendin mi?",
    rate_desc: "Eğer HalıSaha-Kolik'i beğendiysen 5 yıldızla değerlendirir misin? Bu bizim için çok değerli.",
    rate_yes: "5 Yıldız Ver ⭐",
    rate_later: "Daha Sonra",
    rate_no: "Beğenmedim",
    // Mode select
    mode_subtitle: "Halı Saha Taktik & Takım Yönetimi",
    mode_myteam_title: "Kendi Takımım",
    mode_myteam_sub: "Tek takım kur, kadro yönet, dizilim paylaş",
    mode_myteam_detail: "7 kişilik kadro · 7 formasyon · Paylaşım",
    mode_match_title: "Tüm Halı Saha",
    mode_match_sub: "İki takım kur, maçı yönet, sonucu paylaş",
    mode_match_detail: "2 takım · Yarı saha dizilimi · Gol kaydı",
    // Header
    hdr_myteam: "Takımım",
    hdr_match: "Halı Saha",
    hdr_end_match: "Maçı Bitir",
    // Tabs
    tab_field: "Saha",
    tab_squad: "Kadro",
    // Field
    drag_hint: "Sürükle → sahaya bırak",
    no_squad_hint: "Kadro sekmesinden oyuncu ekle",
    auto_fill: "Otomatik",
    midfield: "ORTA SAHA",
    // Squad
    search_player: "Oyuncu ara...",
    captain: "Kaptan",
    captain_none: "Kaptan seçilmedi",
    players_count: "{n} oyuncu",
    on_field: "{n}/7 sahada",
    no_player_found: "Oyuncu bulunamadı",
    add_player: "Oyuncu Ekle",
    // Stats
    team_stats: "Takım İstatistikleri",
    stat_squad: "Kadro",
    stat_field: "Sahada",
    stat_avg: "Ort. Güç",
    top_player: "En İyi Oyuncu",
    // Player form
    new_player: "Yeni Oyuncu",
    edit_player: "Oyuncuyu Düzenle",
    name: "Ad",
    surname: "Soyad",
    position: "Mevki",
    rating: "Oyuncu Gücü",
    cancel: "İptal",
    save: "Kaydet",
    update: "Güncelle",
    // Toasts
    t_saved: "Oyuncu kaydedildi!",
    t_deleted: "Oyuncu silindi!",
    t_auto_filled: "Kadro otomatik kuruldu! 🤖",
    t_field_cleared: "Saha temizlendi!",
    t_captain_set: "Kaptan atandı! 👑",
    t_captain_removed: "Kaptanlık kaldırıldı",
    t_screenshot: "Ekran görüntüsü alınıyor...",
    t_lineup_shared: "Dizilim paylaşıldı! 📸",
    t_field_not_found: "Saha bulunamadı",
    // Captain modal
    captain_select: "Kaptan Seçimi",
    captain_hint: "Kaptanın kolundaki bant sahada görünecek",
    captain_remove: "Kaptanlığı Kaldır",
    on_pitch: "Sahada",
    on_bench: "Yedekler",
    captain_first_squad: "Önce kadroyu oluşturun",
    select: "Seç",
    // Quick select
    candidates_for: "{role} mevkisi için adaylar",
    no_candidates: "Bu mevki için uygun boşta oyuncu yok.",
    other_free: "Diğer boşta oyuncular",
    // Match result
    match_result: "Maç Sonucu",
    winner: "🏆 {name} kazandı!",
    draw: "🤝 Beraberlik",
    goals: "Goller",
    optional: "(opsiyonel)",
    scorer_ph: "Gol atan...",
    share_result: "Sonucu Paylaş",
    copied: "Panoya Kopyalandı ✓",
    // Settings
    team_settings: "Takım Ayarları",
    team_name: "Takım Adı",
    team_color: "Forma Rengi",
    ok: "Tamam",
    // Premium
    premium_title: "HalıSaha-Kolik Premium",
    premium_sub: "Tüm reklamları kaldır, kesintisiz deneyim",
    premium_f1: "Banner ve geçiş reklamları yok",
    premium_f2: "Sınırsız otomatik kadro",
    premium_f3: "Tek seferlik ödeme, ömür boyu",
    premium_f4: "Geliştiriciye destek ol ❤️",
    premium_buy: "Premium'a Geç",
    premium_restore: "Satın Alımı Geri Yükle",
    premium_active: "Premium Aktif ✓",
    premium_loading: "Yükleniyor...",
    premium_thanks: "Teşekkürler! Premium aktif 🎉",
    premium_error: "Bir hata oluştu, tekrar dene.",
    premium_restored: "Satın alım geri yüklendi ✓",
    premium_no_purchase: "Geri yüklenecek satın alım bulunamadı.",
  },
  en: {
    onb_skip: "Skip",
    onb_next: "Next",
    onb_start: "Get Started",
    onb_1_title: "Welcome to HalıSaha-Kolik",
    onb_1_desc: "Manage your 7-a-side football matches like a pro. Build your squad, set your tactics, share the result.",
    onb_2_title: "Build Your Squad",
    onb_2_desc: "Add your players, set their position and rating. Add as many players as you want.",
    onb_3_title: "Lineup & Tactics",
    onb_3_desc: "Choose between 7 different formations. Drag and drop players to fine-tune their positions.",
    onb_4_title: "Match Mode",
    onb_4_desc: "Set up two teams head to head on a half-pitch view. Auto-fill your lineup in seconds.",
    onb_5_title: "Share the Result",
    onb_5_desc: "Save the score and goal scorers after each match. Share a beautiful image with friends in one tap.",
    rate_title: "Enjoying the App?",
    rate_desc: "If you like HalıSaha-Kolik, would you mind giving us a 5-star rating? It means the world to us.",
    rate_yes: "Rate 5 Stars ⭐",
    rate_later: "Later",
    rate_no: "Not Really",
    mode_subtitle: "Football Tactics & Team Manager",
    mode_myteam_title: "My Team",
    mode_myteam_sub: "Build one team, manage your squad, share the lineup",
    mode_myteam_detail: "7-player squad · 7 formations · Sharing",
    mode_match_title: "Full Match",
    mode_match_sub: "Build two teams, manage the match, share the result",
    mode_match_detail: "2 teams · Half-pitch view · Goal log",
    hdr_myteam: "My Team",
    hdr_match: "Match",
    hdr_end_match: "End Match",
    tab_field: "Pitch",
    tab_squad: "Squad",
    drag_hint: "Drag → drop on pitch",
    no_squad_hint: "Add players from the Squad tab",
    auto_fill: "Auto",
    midfield: "MIDFIELD",
    search_player: "Search player...",
    captain: "Captain",
    captain_none: "No captain selected",
    players_count: "{n} players",
    on_field: "{n}/7 on pitch",
    no_player_found: "No player found",
    add_player: "Add Player",
    team_stats: "Team Stats",
    stat_squad: "Squad",
    stat_field: "On Pitch",
    stat_avg: "Avg. Rating",
    top_player: "Top Player",
    new_player: "New Player",
    edit_player: "Edit Player",
    name: "First Name",
    surname: "Last Name",
    position: "Position",
    rating: "Rating",
    cancel: "Cancel",
    save: "Save",
    update: "Update",
    t_saved: "Player saved!",
    t_deleted: "Player deleted!",
    t_auto_filled: "Squad auto-filled! 🤖",
    t_field_cleared: "Pitch cleared!",
    t_captain_set: "Captain assigned! 👑",
    t_captain_removed: "Captaincy removed",
    t_screenshot: "Capturing screenshot...",
    t_lineup_shared: "Lineup shared! 📸",
    t_field_not_found: "Pitch not found",
    captain_select: "Captain Selection",
    captain_hint: "The armband will be visible on the pitch",
    captain_remove: "Remove Captaincy",
    on_pitch: "On Pitch",
    on_bench: "Bench",
    captain_first_squad: "Build your squad first",
    select: "Select",
    candidates_for: "Candidates for {role}",
    no_candidates: "No available player for this position.",
    other_free: "Other available players",
    match_result: "Match Result",
    winner: "🏆 {name} wins!",
    draw: "🤝 Draw",
    goals: "Goals",
    optional: "(optional)",
    scorer_ph: "Scorer...",
    share_result: "Share Result",
    copied: "Copied ✓",
    team_settings: "Team Settings",
    team_name: "Team Name",
    team_color: "Kit Color",
    ok: "OK",
    premium_title: "HalıSaha-Kolik Premium",
    premium_sub: "Remove all ads, enjoy seamlessly",
    premium_f1: "No banner or interstitial ads",
    premium_f2: "Unlimited auto-fill",
    premium_f3: "One-time payment, lifetime",
    premium_f4: "Support the developer ❤️",
    premium_buy: "Go Premium",
    premium_restore: "Restore Purchase",
    premium_active: "Premium Active ✓",
    premium_loading: "Loading...",
    premium_thanks: "Thank you! Premium activated 🎉",
    premium_error: "Something went wrong, please try again.",
    premium_restored: "Purchase restored ✓",
    premium_no_purchase: "No purchase to restore.",
  },
};

let _lang =
  (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) ||
  // Otomatik algılama: tarayıcı dili TR ise tr, değilse en
  (typeof navigator !== "undefined" && /^tr/i.test(navigator.language) ? "tr" : "en");

const listeners = new Set();

export const getLang = () => _lang;

export const setLang = (lang) => {
  if (lang !== "tr" && lang !== "en") return;
  _lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  listeners.forEach((fn) => fn(lang));
};

export const t = (key, vars) => {
  const dict = DICT[_lang] || DICT.en;
  let s = dict[key] ?? DICT.en[key] ?? key;
  if (vars) Object.keys(vars).forEach((k) => { s = s.replace(`{${k}}`, vars[k]); });
  return s;
};

export const useLang = () => {
  const [lang, setLangState] = useState(_lang);
  useEffect(() => {
    const fn = (l) => setLangState(l);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return [lang, setLang];
};