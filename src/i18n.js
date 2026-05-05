// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · i18n (TR / EN)
// Kullanım: import { t, useLang, setLang } from './i18n';
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

const STORAGE_KEY = "halisaha_lang";

const DICT = {
  tr: {
    // Onboarding
    tour_0_title: "Hadi Başlayalım",
    tour_0_desc: "Önce bir mod seç. \"Kendi Takımım\" seçeneğine dokunarak devam et.",
    onb_skip: "Atla",
    onb_next: "İleri",
    onb_start: "Hadi Başlayalım",
    // ─── 8 STEP — daha bilgilendirici ───
    onb_1_title: "HalıSaha-Kolik'e Hoş Geldin",
    onb_1_desc: "Halı saha maçlarını profesyonelce yönet — kadro kur, taktiğini belirle, golleri kaydet, istatistikleri analiz et. Tek tıkla arkadaşlarınla paylaş.",

    onb_2_title: "İki Mod, Tek Uygulama",
    onb_2_desc: "Sadece kendi takımını yönetmek istersen \"Kendi Takımım\" modunu, iki takımı birden kontrol edip maç yapmak istersen \"Tüm Halı Saha\" modunu seç.",

    onb_3_title: "Detaylı Oyuncu Profilleri",
    onb_3_desc: "Her oyuncunun fotoğrafı, forma numarası, mevkisi ve 0–99 arası güç puanı olur. Pas, şut, hız, defans gibi 6 ayrı yetenek değerini spider chart üzerinden görsel olarak ayarla.",

    onb_4_title: "7 Formasyon · Sürükle-Bırak",
    onb_4_desc: "1-2-3-1, 2-3-1, 3-2-1 gibi 7 farklı dizilişten seç. Oyuncuları parmağınla sürükleyerek istediğin pozisyona yerleştir veya \"Otomatik Kadro\" ile saniyeler içinde dizilim kur.",

    onb_5_title: "Maçı Yönet · Gol & Asist Kaydet",
    onb_5_desc: "Maç bitince tap-to-score ekranında dakikalı gol kaydı yap, asistleri ekle, kart ve MVP işaretle. Hat-trick efektleri ve kupa animasyonu ile keyifli kullanım.",

    onb_6_title: "İstatistik & Form Takibi",
    onb_6_desc: "Her oyuncunun maç sayısı, gol/asist ortalaması, kazanma oranı ve son 5 maçtaki form durumu (🔥 alev alev / ❄️ buz gibi) otomatik hesaplanır. FIFA-tarzı kart görünümünde profilini incele.",

    onb_7_title: "Krallık Tabloları & Geçmiş",
    onb_7_desc: "Tüm maçlarının geçmişi, gol kralı, asist kralı, MVP listesi ve clean-sheet sıralaması saklanır. Hangi oyuncun kaç maçta kaç gol attığını anında gör.",

    onb_8_title: "Tek Tıkla Paylaş",
    onb_8_desc: "Hazırladığın diziliş veya maç sonucunu görsel olarak yakala, WhatsApp/Instagram üzerinden arkadaşlarınla paylaş. Hadi, ilk takımını kuralım!",
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
    jersey_number: "Forma No",
    jersey_taken: "Bu numara kullanılıyor",
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
    // Position'lar (TR yoksa İngilizce için altta var)
    pos_KALECİ: "KALECİ",
    pos_DEFANS: "DEFANS",
    "pos_ORTA SAHA": "ORTA SAHA",
    pos_FORVET: "FORVET",
    "pos_SOL BEK": "SOL BEK",
    "pos_SAĞ BEK": "SAĞ BEK",
    pos_STOPER: "STOPER",
    // Empty state mikro-ödüller
    t_first_player: "İlk oyuncun eklendi! 🎉",
    t_squad_complete: "Kadro hazır! 7 oyuncu sahada ✓",
    t_first_match: "İlk maçın için bol şans! ⚽",
    // Settings menu (yeni eklenen)
    settings_title: "Ayarlar",
    settings_show_intro: "Tanıtımı tekrar göster",
    settings_show_intro_sub: "5 adımlık karşılama ekranını yeniden aç",
    settings_haptics: "Titreşim geri bildirimi",
    settings_haptics_sub: "Buton ve sürükleme anında hafif titreşim",
    settings_lang: "Dil",
    settings_team: "Takım Ayarları",
    settings_team_sub: "İsim ve forma rengi",
    settings_about: "Hakkında",
    settings_version: "Sürüm",
    quick_empty_squad: "Henüz boşta oyuncun yok",
    quick_empty_squad_sub: "Önce kadro sekmesinden oyuncu ekle",
    // Tour (rehber)
    tour_skip: "Atla",
    tour_finish: "Tamamla",
    tour_got_it: "Anladım",
    tour_step_label: "Adım {current} / {total}",
    // ─── Mevcut adımlar (daha bilgilendirici) ───
    tour_1_title: "📋 Kadroya Geç",
    tour_1_desc: "Önce oyuncularını ekleyelim. Aşağıdaki \"Kadro\" sekmesine dokun.",
    tour_2_title: "➕ Oyuncu Ekle",
    tour_2_desc: "İlk oyuncunu eklemek için sağ üstteki + butonuna dokun. İstediğin kadar oyuncu ekleyebilirsin.",
    tour_3_title: "✏️ Profili Doldur",
    tour_3_desc: "Ad, soyad, mevki ve güç değerini gir. İstersen forma numarası da seç. Yetenekler bölümünden 6 ayrı yeteneği spider chart üzerinden de düzenleyebilirsin.",
    tour_4_title: "⚽ Sahaya Geç",
    tour_4_desc: "Harika! Oyuncuyu kaydettin. Şimdi sahaya yerleştirelim — \"Saha\" sekmesine dön.",
    tour_5_title: "🎯 Pozisyona Dokun",
    tour_5_desc: "Boş bir pozisyona dokun ve oyuncunu seç. Listeden sürükle-bırak da yapabilirsin. Yerleştirilen oyuncuyu uzun basıp başka pozisyona taşıyabilirsin.",
    // ─── ★ YENİ adımlar — özellik tanıtımı ───
    tour_6_title: "🔄 Formasyonu Değiştir",
    tour_6_desc: "Üstteki formasyon adına dokunarak 7 farklı diziliş arasında geçiş yapabilirsin: 1-2-3-1, 2-3-1, 3-2-1 gibi. Diziliş değişince oyuncular yeni pozisyonlara otomatik kaydırılır.",
    tour_7_title: "⚡ Otomatik Kadro",
    tour_7_desc: "\"Otomatik Kadro\" butonuna dokunarak en yüksek puanlı oyuncularını ideal pozisyonlara saniyeler içinde yerleştir. Manuel düzenlemen istediğin gibi serbest.",
    tour_8_title: "🎖️ Kaptan & Transfer",
    tour_8_desc: "Kadro listesinde her oyuncunun yanındaki butonlardan kaptan atayabilir, istatistik profilini açabilir, transfer ile başka takıma gönderebilir, düzenleyebilir veya silebilirsin.",
    tour_9_title: "📤 Paylaş",
    tour_9_desc: "Hazırladığın dizilim hazır olunca üstteki paylaş butonuna dokunarak görsel olarak yakalayıp WhatsApp veya Instagram üzerinden arkadaşlarınla paylaşabilirsin.",
    tour_10_title: "🏁 Hazırsın!",
    tour_10_desc: "Artık her şeyi biliyorsun. Maç bittiğinde sağ üstteki \"Maçı Bitir\" butonuna dokunarak gol, asist ve MVP kaydedebilirsin. İyi maçlar! ⚽",

    settings_show_tour: "Rehber turu yeniden başlat",
    settings_show_tour_sub: "Oyuncu ekleme adımlarını tekrar göster",

    // ═══ MAÇ GEÇMİŞİ + İSTATİSTİKLER ═══
    // Mod seçim — 3. kart
    mode_history_title: "Geçmiş Maçlar",
    mode_history_sub: "İstatistikler, krallık tabloları, maç detayları",
    mode_history_detail: "Geçmiş kayıt · Krallık · Oyuncu profili",
    mode_history_empty: "Henüz kayıtlı maç yok",
    mode_history_empty_sub: "İlk maçını oyna ve geçmişe kaydet",

    // Maç sonu — yeni tap-tarzı
    match_save_title: "Maçı Kaydet",
    match_saved: "Maç geçmişe kaydedildi 📚",
    match_save_share: "Kaydet & Paylaş",
    match_save_only: "Sadece Kaydet",
    match_no_score: "Önce skoru girin",
    match_event_log: "Maç Akışı",
    no_events_yet: "Henüz olay eklenmedi",
    tap_to_score: "Gol için oyuncuya dokun",
    pick_scorer: "Gol Atan",
    pick_assist: "Asist Yapan",
    pick_assist_skip: "Asist Yok",
    no_player_in_squad: "Bu takımda oyuncu yok",
    goal_type: "Gol Türü",
    goal_type_normal: "Normal",
    goal_type_penalty: "Penaltı",
    goal_type_freekick: "Frikik",
    goal_type_header: "Kafa",
    goal_type_own_goal: "Kendi Kalesi",
    minute_short: "dk",
    minute_optional: "Dakika",
    add_event: "Olay Ekle",
    hat_trick: "HAT-TRICK!",
    goal_added: "Gol! ⚽",
    assist_added: "Asist! 🎯",
    manual_score_hint: "Manuel skor — oyuncu kaydı yapılmaz",

    // Geçmiş listesi
    history_title: "Geçmiş Maçlar",
    history_match_count: "{n} maç",
    history_view_match: "Maçı Görüntüle",
    history_delete_confirm: "Bu maçı silmek istediğine emin misin?",
    history_clear_all: "Tüm Geçmişi Sil",
    history_clear_confirm: "Tüm geçmiş maçlar silinecek. Emin misin?",
    history_deleted: "Maç silindi",
    history_today: "Bugün",
    history_yesterday: "Dün",
    history_days_ago: "{n} gün önce",
    result_win: "G",
    result_draw: "B",
    result_loss: "M",
    full_match: "Maç",
    single_lineup: "Kadro",

    // Maç detay
    match_detail: "Maç Detayı",
    match_timeline: "Maç Akışı",
    match_no_events: "Bu maçta kaydedilmiş olay yok",
    match_share_again: "Tekrar Paylaş",
    match_delete: "Maçı Sil",

    // İstatistik tabları
    stats_overview: "Genel Bakış",
    stats_leaderboards: "Krallıklar",
    stats_my_players: "Oyuncularım",
    stats_total_matches: "Toplam Maç",
    stats_total_goals: "Toplam Gol",
    stats_total_assists: "Toplam Asist",
    stats_no_data: "Henüz istatistik yok",
    stats_no_data_sub: "Maç oynayıp kaydet, istatistikler burada görünsün",

    // Krallık tabloları
    lb_top_scorers: "🥇 Gol Krallığı",
    lb_top_assisters: "🅰️ Asist Krallığı",
    lb_top_keepers: "🧤 En İyi Kaleci",
    lb_most_wins: "🏆 En Çok Galibiyet",
    lb_mvps: "⭐ MVP Sayısı",
    lb_no_entries: "Bu kategoride henüz kayıt yok",

    // Oyuncu profil
    player_profile: "Oyuncu Profili",
    ps_matches: "Maç",
    ps_goals: "Gol",
    ps_assists: "Asist",
    ps_g_per_m: "G/M",
    ps_win_rate: "Galibiyet %",
    ps_clean_sheets: "Gol Yemediği",
    ps_yellow: "Sarı",
    ps_red: "Kırmızı",
    ps_mvp: "MVP",
    ps_last_5: "Son 5 Maç",
    ps_goal_breakdown: "Gol Dağılımı",
    ps_no_matches: "Henüz maçı yok",
    ps_view_stats: "İstatistikleri Gör",

    // Toaster
    t_event_added: "Olay eklendi",
    t_event_deleted: "Olay silindi",

    // MVP seçim
    mvp_select: "Maçın Adamı (MVP)",
    mvp_skip: "MVP Seçme",
    mvp_suggest: "Önerilen",
    mvp_set: "MVP atandı! ⭐",

    // Settings
    settings_history_clear: "Tüm geçmişi sil",
    settings_history_clear_sub: "Kayıtlı tüm maçlar silinir",

    // ═══ STAGE 2: PRO POLISH ═══
    // Match-end mini tour
    tour_me_0_title: "Maçı Bitir Zamanı! 🏁",
    tour_me_0_desc: "Maç hazır! Sağ üstteki büyük kırmızı butona dokunarak maçı bitir, golleri ve asistleri ekleyebilirsin.",

    // Gol ekle hatırlatma popup
    save_reminder_title: "Skor var ama gol yok! 📊",
    save_reminder_desc: "Maçta golleri eklemeden çıkıyorsun. Geçmişe sadece skor kaydedilecek, oyuncu istatistikleri tutulmayacak. Devam etmek ister misin?",
    save_reminder_skip: "Yine de Çık",
    save_reminder_continue: "Gol Eklemeye Devam",

    // Mini pitch
    top_scorers_pitch: "Maçın Yıldızları",

    // Filter chips
    filter_all: "Tümü",
    filter_wins: "Galibiyet",
    filter_draws: "Beraberlik",
    filter_losses: "Mağlubiyet",
    filter_this_week: "🗓️ Bu Hafta",
    filter_this_month: "📅 Bu Ay",
    filter_no_results: "Bu filtreyle eşleşen maç yok",

    // Form chart
    ps_form_chart: "Form Grafiği (Son 10 Maç)",

    // Save success popup
    save_success_title: "Maç Kaydedildi! 🎉",
    save_success_desc: "Maç geçmişine başarıyla eklendi. İstatistiklerin güncellendi.",
    save_success_view: "Geçmişi Gör",
    save_success_close: "Kapat",
    save_success_events: "olay",
    match_saving: "Kaydediliyor...",

    // Score hint
    score_auto_hint: "Skor, oyuncu seçtikçe otomatik artar",
    no_player_hint: "Önce kadroya oyuncu ekle, sonra gol kaydı için onlara dokun.",
    close: "Kapat",

    // ★ Player attributes (saha oyuncuları)
    attr_pas: "Pas",
    attr_sut: "Şut",
    attr_hiz: "Hız",
    attr_dribbling: "Dribbling",
    attr_defans: "Defans",
    attr_fizik: "Fizik",
    // Kaleci attributes
    attr_refleks: "Refleks",
    attr_konum: "Konum",
    attr_hava: "Hava",
    attr_cikis: "Çıkış",
    attr_uzaklik: "Uzaklık",
    attr_ayak: "Ayak",

    // ★ Attribute paneli
    attributes_title: "Yetenekler",
    attributes_subtitle: "Pozisyona göre otomatik önerildi — istediğin gibi düzenle",
    attributes_reset: "Sıfırla",
    attributes_overall: "Ortalama",
    attributes_auto_filled: "Otomatik dolduruldu",

    // ★ Form gücü
    form_title: "Form",
    form_blazing: "Alev Alev",
    form_hot: "Yüksek",
    form_avg: "Orta",
    form_cold: "Düşük",
    form_freezing: "Buz Gibi",
    form_no_data: "Veri yok",
    form_explainer: "Son 5 maçtaki gol, asist ve sonuçlardan hesaplanır.",
    form_recent_results: "Son 5 maç",

    // ★ Transfer
    transfer_title: "Takım Değiştir",
    transfer_desc: "Bu oyuncuyu hangi takıma taşımak istersin?",
    transfer_to: "{team} takımına taşı",
    transfer_same_team: "Bu oyuncu zaten {team} takımında",
    transfer_confirm_title: "Transfer onayı",
    transfer_confirm_desc: "{name} oyuncusu {from} takımından {to} takımına taşınacak. Tüm geçmiş istatistikleri korunur.",
    transfer_done: "Transfer tamamlandı",
    transfer_btn: "Takım Değiştir",
    transfer_cancel: "Vazgeç",
    // ★ KAP-tarzı transfer bilgilendirmesi (post-transfer popup)
    transfer_kap_title: "KAP Bilgilendirmesi",
    transfer_kap_subtitle: "Kamuyu Aydınlatma Bildirimi",
    transfer_kap_announcement: "{playerName} oyuncusu, {fromTeam} takımından {toTeam} takımına transfer olmuştur.",
    transfer_kap_meta_position: "Mevki",
    transfer_kap_meta_rating: "Güç",
    transfer_kap_meta_jersey: "Forma",
    transfer_kap_close: "Tamam",
    transfer_kap_view: "Kadroyu Gör",
    transfer_kap_signature: "HalıSaha-Kolik · Resmi Bildirim",
    // ★ Hover tooltipleri (PlayerCard butonları için)
    pc_btn_captain: "Kaptan",
    pc_btn_captain_remove: "Kaptanlığı Kaldır",
    pc_btn_stats: "İstatistik",
    pc_btn_transfer: "Transfer",
    pc_btn_edit: "Düzenle",
    pc_btn_delete: "Kaldır",
  },
  en: {
    tour_0_title: "Let's Get Started",
    tour_0_desc: "First, pick a mode. Tap \"My Team\" to continue.",
    onb_skip: "Skip",
    onb_next: "Next",
    onb_start: "Let's Start",
    // ─── 8 STEP — more informative ───
    onb_1_title: "Welcome to HalıSaha-Kolik",
    onb_1_desc: "Manage your 7-a-side football matches like a pro — build squads, set tactics, log goals, analyze stats. Share with friends in one tap.",

    onb_2_title: "Two Modes, One App",
    onb_2_desc: "Pick \"My Team\" if you want to manage just your own squad, or \"Full Pitch\" to control both teams head-to-head in match mode.",

    onb_3_title: "Detailed Player Profiles",
    onb_3_desc: "Every player has a photo, jersey number, position, and a 0–99 rating. Tune 6 separate skills (Passing, Shooting, Pace, Defense and more) visually using the spider chart.",

    onb_4_title: "7 Formations · Drag & Drop",
    onb_4_desc: "Pick from 7 different lineups like 1-2-3-1, 2-3-1, 3-2-1. Drag players to any spot, or use \"Auto Lineup\" to fill the pitch in seconds.",

    onb_5_title: "Run the Match · Goals & Assists",
    onb_5_desc: "When the match ends, log goals minute-by-minute with tap-to-score, add assists, mark cards and MVP. Hat-trick effects and trophy animations make it fun.",

    onb_6_title: "Stats & Form Tracking",
    onb_6_desc: "Every player's match count, goal/assist averages, win rate and form across the last 5 games (🔥 on fire / ❄️ freezing) is auto-computed. Browse FIFA-style profile cards.",

    onb_7_title: "Leaderboards & History",
    onb_7_desc: "Your full match history, top scorers, top assisters, MVP rankings and clean sheets are all saved. See who scored what, in which match, instantly.",

    onb_8_title: "Share with One Tap",
    onb_8_desc: "Capture your lineup or match result as an image and share via WhatsApp, Instagram, anywhere. Let's go — build your first squad!",
    rate_title: "Enjoying the App?",
    rate_desc: "If you like HalıSaha-Kolik, would you mind giving us a 5-star rating? It means the world to us.",
    rate_yes: "Rate 5 Stars ⭐",
    rate_later: "Later",
    rate_no: "Not Really",
    mode_subtitle: "Football Tactics & Team Management for 7-a-side",
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
    jersey_number: "Jersey #",
    jersey_taken: "This number is taken",
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
    // Position translations
    pos_KALECİ: "GOALKEEPER",
    pos_DEFANS: "DEFENDER",
    "pos_ORTA SAHA": "MIDFIELDER",
    pos_FORVET: "FORWARD",
    "pos_SOL BEK": "LEFT BACK",
    "pos_SAĞ BEK": "RIGHT BACK",
    pos_STOPER: "CENTRE-BACK",
    // Empty state micro-rewards
    t_first_player: "Your first player added! 🎉",
    t_squad_complete: "Squad ready! 7 players on pitch ✓",
    t_first_match: "Good luck with your first match! ⚽",
    // Settings menu
    settings_title: "Settings",
    settings_show_intro: "Replay intro",
    settings_show_intro_sub: "Open the 5-step welcome again",
    settings_haptics: "Haptic feedback",
    settings_haptics_sub: "Subtle vibration on taps and drags",
    settings_lang: "Language",
    settings_team: "Team Settings",
    settings_team_sub: "Name and kit color",
    settings_about: "About",
    settings_version: "Version",
    quick_empty_squad: "No available players yet",
    quick_empty_squad_sub: "Add players from the Squad tab first",
    // Tour
    tour_skip: "Skip",
    tour_finish: "Finish",
    tour_got_it: "Got it",
    tour_step_label: "Step {current} of {total}",
    // ─── Existing steps (more informative) ───
    tour_1_title: "📋 Go to Squad",
    tour_1_desc: "Let's add players first. Tap the \"Squad\" tab at the bottom.",
    tour_2_title: "➕ Add Player",
    tour_2_desc: "Tap the + button at the top right to add your first player. Add as many as you want.",
    tour_3_title: "✏️ Fill Profile",
    tour_3_desc: "Enter name, surname, position and rating. Optionally pick a jersey number. From the Attributes section you can also tune 6 separate skills using the spider chart.",
    tour_4_title: "⚽ Go to Pitch",
    tour_4_desc: "Great! Player saved. Now let's place them on the pitch — switch back to the \"Pitch\" tab.",
    tour_5_title: "🎯 Tap a Slot",
    tour_5_desc: "Tap any empty slot and pick a player. Or drag-and-drop from the list. You can long-press a placed player to move them to another slot.",
    // ─── ★ NEW steps — feature highlights ───
    tour_6_title: "🔄 Change Formation",
    tour_6_desc: "Tap the formation name at the top to switch between 7 different lineups: 1-2-3-1, 2-3-1, 3-2-1, etc. Players are automatically repositioned when you change formation.",
    tour_7_title: "⚡ Auto Lineup",
    tour_7_desc: "Tap \"Auto Lineup\" to instantly fill the pitch with your top-rated players in their ideal positions. You can still tweak everything manually afterwards.",
    tour_8_title: "🎖️ Captain & Transfer",
    tour_8_desc: "From the squad list, each player has buttons to: assign captain, view their stats profile, transfer them to the other team, edit their info, or remove them.",
    tour_9_title: "📤 Share",
    tour_9_desc: "Once your lineup is ready, tap the share button at the top to capture it as an image and share via WhatsApp, Instagram, or any app.",
    tour_10_title: "🏁 You're Ready!",
    tour_10_desc: "You know it all now. When the match ends, tap \"End Match\" at the top right to log goals, assists and MVP. Have a great match! ⚽",

    settings_show_tour: "Restart tour guide",
    settings_show_tour_sub: "Replay the player-adding walkthrough",

    // ═══ MATCH HISTORY + STATS ═══
    mode_history_title: "Match History",
    mode_history_sub: "Stats, leaderboards, match details",
    mode_history_detail: "Past records · Leaderboards · Player profiles",
    mode_history_empty: "No saved matches yet",
    mode_history_empty_sub: "Play your first match and save it",

    match_save_title: "Save Match",
    match_saved: "Match saved to history 📚",
    match_save_share: "Save & Share",
    match_save_only: "Save Only",
    match_no_score: "Enter the score first",
    match_event_log: "Match Log",
    no_events_yet: "No events added yet",
    tap_to_score: "Tap a player to score",
    pick_scorer: "Scorer",
    pick_assist: "Assist by",
    pick_assist_skip: "No Assist",
    no_player_in_squad: "No player in this squad",
    goal_type: "Goal Type",
    goal_type_normal: "Normal",
    goal_type_penalty: "Penalty",
    goal_type_freekick: "Free-kick",
    goal_type_header: "Header",
    goal_type_own_goal: "Own Goal",
    minute_short: "min",
    minute_optional: "Minute",
    add_event: "Add Event",
    hat_trick: "HAT-TRICK!",
    goal_added: "Goal! ⚽",
    assist_added: "Assist! 🎯",
    manual_score_hint: "Manual score — no player will be credited",

    history_title: "Match History",
    history_match_count: "{n} matches",
    history_view_match: "View Match",
    history_delete_confirm: "Delete this match?",
    history_clear_all: "Clear All History",
    history_clear_confirm: "All saved matches will be deleted. Are you sure?",
    history_deleted: "Match deleted",
    history_today: "Today",
    history_yesterday: "Yesterday",
    history_days_ago: "{n} days ago",
    result_win: "W",
    result_draw: "D",
    result_loss: "L",
    full_match: "Match",
    single_lineup: "Lineup",

    match_detail: "Match Detail",
    match_timeline: "Timeline",
    match_no_events: "No events were recorded for this match",
    match_share_again: "Share Again",
    match_delete: "Delete Match",

    stats_overview: "Overview",
    stats_leaderboards: "Leaderboards",
    stats_my_players: "My Players",
    stats_total_matches: "Total Matches",
    stats_total_goals: "Total Goals",
    stats_total_assists: "Total Assists",
    stats_no_data: "No stats yet",
    stats_no_data_sub: "Play and save matches to see stats here",

    lb_top_scorers: "🥇 Top Scorers",
    lb_top_assisters: "🅰️ Top Assisters",
    lb_top_keepers: "🧤 Best Keepers",
    lb_most_wins: "🏆 Most Wins",
    lb_mvps: "⭐ MVP Count",
    lb_no_entries: "No entries in this category yet",

    player_profile: "Player Profile",
    ps_matches: "Matches",
    ps_goals: "Goals",
    ps_assists: "Assists",
    ps_g_per_m: "G/M",
    ps_win_rate: "Win %",
    ps_clean_sheets: "Clean Sheets",
    ps_yellow: "Yellow",
    ps_red: "Red",
    ps_mvp: "MVP",
    ps_last_5: "Last 5 Matches",
    ps_goal_breakdown: "Goal Breakdown",
    ps_no_matches: "No matches yet",
    ps_view_stats: "View Stats",

    t_event_added: "Event added",
    t_event_deleted: "Event removed",

    mvp_select: "Man of the Match",
    mvp_skip: "Skip MVP",
    mvp_suggest: "Suggested",
    mvp_set: "MVP assigned! ⭐",

    settings_history_clear: "Clear all history",
    settings_history_clear_sub: "All saved matches will be deleted",

    // ═══ STAGE 2: PRO POLISH ═══
    // Match-end mini tour
    tour_me_0_title: "Time to End the Match! 🏁",
    tour_me_0_desc: "The match is ready! Tap the big red button at the top right to end the match and add goals & assists.",

    // Add goals reminder popup
    save_reminder_title: "Score recorded, no goals added! 📊",
    save_reminder_desc: "You're leaving without adding goals. Only the score will be saved to history — player stats won't be tracked. Continue anyway?",
    save_reminder_skip: "Exit Anyway",
    save_reminder_continue: "Keep Adding Goals",

    // Mini pitch
    top_scorers_pitch: "Match Stars",

    // Filter chips
    filter_all: "All",
    filter_wins: "Wins",
    filter_draws: "Draws",
    filter_losses: "Losses",
    filter_this_week: "🗓️ This Week",
    filter_this_month: "📅 This Month",
    filter_no_results: "No matches found with this filter",

    // Form chart
    ps_form_chart: "Form (Last 10 Matches)",

    // Save success popup
    save_success_title: "Match Saved! 🎉",
    save_success_desc: "Successfully added to your match history. Stats updated.",
    save_success_view: "View History",
    save_success_close: "Close",
    save_success_events: "events",
    match_saving: "Saving...",

    // Score hint
    score_auto_hint: "Score updates automatically as you tap players",
    no_player_hint: "Add players to your squad first, then tap them to register goals.",
    close: "Close",

    // ★ Player attributes (field players)
    attr_pas: "Pass",
    attr_sut: "Shot",
    attr_hiz: "Pace",
    attr_dribbling: "Dribbling",
    attr_defans: "Defense",
    attr_fizik: "Physical",
    // Goalkeeper attributes
    attr_refleks: "Reflexes",
    attr_konum: "Positioning",
    attr_hava: "Aerial",
    attr_cikis: "Coming Out",
    attr_uzaklik: "Distribution",
    attr_ayak: "Footwork",

    // ★ Attribute panel
    attributes_title: "Attributes",
    attributes_subtitle: "Auto-suggested by position — edit as you like",
    attributes_reset: "Reset",
    attributes_overall: "Overall",
    attributes_auto_filled: "Auto-filled",

    // ★ Form
    form_title: "Form",
    form_blazing: "On Fire",
    form_hot: "Hot",
    form_avg: "Average",
    form_cold: "Cold",
    form_freezing: "Freezing",
    form_no_data: "No data",
    form_explainer: "Calculated from goals, assists, and results in the last 5 matches.",
    form_recent_results: "Last 5 matches",

    // ★ Transfer
    transfer_title: "Change Team",
    transfer_desc: "Which team would you like to move this player to?",
    transfer_to: "Move to {team}",
    transfer_same_team: "Already on {team}",
    transfer_confirm_title: "Confirm transfer",
    transfer_confirm_desc: "{name} will be moved from {from} to {to}. All historical stats are preserved.",
    transfer_done: "Transfer complete",
    transfer_btn: "Change Team",
    transfer_cancel: "Cancel",
    // ★ KAP-style transfer announcement (post-transfer popup)
    transfer_kap_title: "Official Announcement",
    transfer_kap_subtitle: "Public Disclosure Notice",
    transfer_kap_announcement: "{playerName} has been transferred from {fromTeam} to {toTeam}.",
    transfer_kap_meta_position: "Position",
    transfer_kap_meta_rating: "Rating",
    transfer_kap_meta_jersey: "Jersey",
    transfer_kap_close: "OK",
    transfer_kap_view: "View Squad",
    transfer_kap_signature: "HaliSaha-Kolik · Official Notice",
    // ★ Hover tooltips (PlayerCard buttons)
    pc_btn_captain: "Captain",
    pc_btn_captain_remove: "Remove Captain",
    pc_btn_stats: "Stats",
    pc_btn_transfer: "Transfer",
    pc_btn_edit: "Edit",
    pc_btn_delete: "Remove",
  },
};

let _lang =
  (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) ||
  "tr"; // ★ Her zaman Türkçe default

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

// Position çevirisi — internal key TR'dir, sadece görüntüde çevrilir
export const tPos = (role) => t(`pos_${role}`);

export const useLang = () => {
  const [lang, setLangState] = useState(_lang);
  useEffect(() => {
    const fn = (l) => setLangState(l);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return [lang, setLang];
};