import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

// ═══════════════════════════════════════════════════════════════
// ═══ ADMOB REKLAM YÖNETİCİSİ — HalıSaha-Kolik
// ═══════════════════════════════════════════════════════════════
//
// Reklam Stratejisi:
// 1. BANNER      → Sürekli altta döner (ana ekran + saha ekranı)
// 2. INTERSTITIAL → Belirli aksiyonlarda tam ekran (otomatik kadro, maç bitir, paylaş)
// 3. REWARDED    → Ödüllü reklam (ekstra özellikler için opsiyonel)
//
// ⚠️ YAYINLAMADAN ÖNCE:
//   - Tüm isTesting: true → false yap
//   - initializeForTesting: true → false yap
//   - Test ID'lerini gerçek ID'lerinle değiştir
// ═══════════════════════════════════════════════════════════════

const IS_TESTING = false; // Gerçek reklamlar aktif

const AD_CONFIG = {
  banner:       'ca-app-pub-2886543552287006/5847500924',
  interstitial: 'ca-app-pub-2886543552287006/1389381160',
  rewarded:     'ca-app-pub-2886543552287006/5254707624',
};

// ─── REKLAM SIKLIĞI KONTROLÜ ───
// Kullanıcıyı bunaltmamak için interstitial reklamlar arası minimum süre
const INTERSTITIAL_COOLDOWN_MS = 120000; // 2 dakika
let lastInterstitialTime = 0;
let interstitialCount = 0;
const MAX_INTERSTITIALS_PER_SESSION = 5; // Oturum başına max 5

// ─── DURUM TAKİBİ ───
let isInitialized = false;
let isBannerShowing = false;
let isInterstitialReady = false;
let isRewardedReady = false;

// ═══════════════════════════════════════════════════════════════
// 1. BAŞLATMA
// ═══════════════════════════════════════════════════════════════
export async function initializeAdMob() {
  if (isInitialized) return true;
  try {
    await AdMob.initialize({
      initializeForTesting: IS_TESTING,
    });
    isInitialized = true;
    console.log('✅ AdMob başlatıldı');

    // Interstitial ve Rewarded'ı arka planda hazırla
    prepareInterstitial();
    prepareRewarded();

    return true;
  } catch (error) {
    console.error('❌ AdMob başlatma hatası:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. BANNER REKLAM — Sürekli altta görünen reklam
// ═══════════════════════════════════════════════════════════════
export async function showBanner() {
  if (isBannerShowing) return;
  try {
    await AdMob.showBanner({
      adId: AD_CONFIG.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 56, // Tab bar yüksekliği
      isTesting: IS_TESTING,
    });
    isBannerShowing = true;
    console.log('✅ Banner gösterildi');
  } catch (error) {
    console.error('❌ Banner hatası:', error);
  }
}

export async function hideBanner() {
  if (!isBannerShowing) return;
  try {
    await AdMob.hideBanner();
    isBannerShowing = false;
  } catch (error) {
    console.error('❌ Banner gizleme hatası:', error);
  }
}

export async function removeBanner() {
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
  } catch (error) {
    console.error('❌ Banner kaldırma hatası:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. INTERSTITIAL — Tam ekran geçiş reklamı
// ═══════════════════════════════════════════════════════════════
export async function prepareInterstitial() {
  if (isInterstitialReady) return;
  try {
    await AdMob.prepareInterstitial({
      adId: AD_CONFIG.interstitial,
      isTesting: IS_TESTING,
    });
    isInterstitialReady = true;
    console.log('✅ Interstitial hazır');
  } catch (error) {
    console.error('❌ Interstitial hazırlama hatası:', error);
  }
}

// Cooldown ve limit kontrolü ile interstitial göster
export async function showInterstitial() {
  const now = Date.now();

  // Cooldown kontrolü
  if (now - lastInterstitialTime < INTERSTITIAL_COOLDOWN_MS) {
    console.log('⏳ Interstitial cooldown — atlanıyor');
    return false;
  }

  // Oturum limiti kontrolü
  if (interstitialCount >= MAX_INTERSTITIALS_PER_SESSION) {
    console.log('🚫 Oturum interstitial limiti doldu');
    return false;
  }

  if (!isInterstitialReady) {
    await prepareInterstitial();
    // Hazırlanamadıysa gösterme
    if (!isInterstitialReady) return false;
  }

  try {
    await AdMob.showInterstitial();
    lastInterstitialTime = now;
    interstitialCount++;
    isInterstitialReady = false;
    console.log(`✅ Interstitial gösterildi (${interstitialCount}. kez)`);

    // Sonraki için hazırla
    setTimeout(() => prepareInterstitial(), 2000);
    return true;
  } catch (error) {
    console.error('❌ Interstitial gösterme hatası:', error);
    isInterstitialReady = false;
    prepareInterstitial();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. REWARDED — Ödüllü reklam (izle → özellik aç)
// ═══════════════════════════════════════════════════════════════
export async function prepareRewarded() {
  if (isRewardedReady) return;
  try {
    await AdMob.prepareRewardVideoAd({
      adId: AD_CONFIG.rewarded,
      isTesting: IS_TESTING,
    });
    isRewardedReady = true;
    console.log('✅ Rewarded reklam hazır');
  } catch (error) {
    console.error('❌ Rewarded hazırlama hatası:', error);
  }
}

// Ödüllü reklam göster, callback ile ödül ver
export async function showRewarded(onReward) {
  if (!isRewardedReady) {
    await prepareRewarded();
    if (!isRewardedReady) return false;
  }

  try {
    // Ödül event'ini dinle
    const listener = await AdMob.addListener('onRewardedVideoAdReward', (reward) => {
      console.log('🎁 Ödül alındı:', reward);
      if (onReward) onReward(reward);
      listener.remove();
    });

    await AdMob.showRewardVideoAd();
    isRewardedReady = false;

    // Sonraki için hazırla
    setTimeout(() => prepareRewarded(), 2000);
    return true;
  } catch (error) {
    console.error('❌ Rewarded gösterme hatası:', error);
    isRewardedReady = false;
    prepareRewarded();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════════════════

// Tüm reklamları başlat + banner göster (uygulama açılışında çağır)
export async function startAds() {
  const ok = await initializeAdMob();
  if (ok) {
    await showBanner();
  }
}

// Tab değiştiğinde banner'ı yenile (tablet takılma sorunu için)
export async function refreshBanner() {
  if (!isInitialized) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
    // Kısa gecikme ile tekrar göster
    setTimeout(async () => {
      await showBanner();
    }, 300);
  } catch (error) {
    console.error('❌ Banner yenileme hatası:', error);
    await showBanner();
  }
}

// Durum bilgisi
export function getAdStats() {
  return {
    isInitialized,
    isBannerShowing,
    isInterstitialReady,
    isRewardedReady,
    interstitialCount,
    maxInterstitials: MAX_INTERSTITIALS_PER_SESSION,
  };
}