import { AdMob, BannerAdSize, BannerAdPosition, MaxAdContentRating } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

// ═══════════════════════════════════════════════════════════════
// ═══ ADMOB REKLAM YÖNETİCİSİ — HalıSaha-Kolik
// ═══════════════════════════════════════════════════════════════
//
// 💰 GELİR OPTİMİZASYONU (eCPM sıralaması):
//
//   1. REWARDED VIDEO   → $8-18 eCPM (TR ~$2-4)  ⭐ EN YÜKSEK
//   2. INTERSTITIAL      → $2.5-5 eCPM (TR ~$1-2)
//   3. BANNER            → $0.2-0.8 eCPM (TR ~$0.1-0.3)
//
// ═══════════════════════════════════════════════════════════════

// ─── TEST MODU: Gerçek reklamlar için false ───
const IS_TESTING = false;

// ─── PLATFORM KONTROLÜ ───
const isNativePlatform = () => {
  return Capacitor.isNativePlatform(); // true = iOS/Android, false = web
};

// ─── REKLAM BİRİM KİMLİKLERİ ───
const AD_CONFIG = {
  banner:       'ca-app-pub-2886543552287006/3886785053',
  interstitial: 'ca-app-pub-2886543552287006/2573703388',
  rewarded:     'ca-app-pub-2886543552287006/6520687257',
};

// ─── SIKLIK KONTROLÜ ───
const INTERSTITIAL_COOLDOWN_MS = 120000; // 2 dk
const REWARDED_COOLDOWN_MS = 60000;      // 1 dk
let lastInterstitialTime = 0;
let lastRewardedTime = 0;
let interstitialCount = 0;
let rewardedCount = 0;
const MAX_INTERSTITIALS_PER_SESSION = 6;
const MAX_REWARDED_PER_SESSION = 10;

// ─── DURUM ───
let isInitialized = false;
let isBannerShowing = false;
let isInterstitialReady = false;
let isRewardedReady = false;

// ═══ BAŞLATMA ═══
export async function initializeAdMob() {
  // Web'de çalışıyorsa AdMob yok, sessizce çık
  if (!isNativePlatform()) {
    console.log('ℹ️ AdMob: Web ortamında, reklamlar devre dışı');
    return false;
  }

  if (isInitialized) return true;

  try {
    await AdMob.initialize({
      initializeForTesting: IS_TESTING,
      tagForChildDirectedTreatment: true,
      maxAdContentRating: MaxAdContentRating.General,
      tagForUnderAgeOfConsent: true,
    });
    isInitialized = true;
    console.log('✅ AdMob başarıyla başlatıldı');

    // Reklam event listener'ları
    AdMob.addListener('onBannerAdLoaded', () => {
      console.log('✅ Banner yüklendi');
    });
    AdMob.addListener('onBannerAdFailedToLoad', (error) => {
      console.error('❌ Banner yüklenemedi:', JSON.stringify(error));
      isBannerShowing = false;
    });
    AdMob.addListener('onInterstitialAdLoaded', () => {
      console.log('✅ Interstitial hazır');
      isInterstitialReady = true;
    });
    AdMob.addListener('onInterstitialAdFailedToLoad', (error) => {
      console.error('❌ Interstitial yüklenemedi:', JSON.stringify(error));
      isInterstitialReady = false;
    });
    AdMob.addListener('onRewardedVideoAdLoaded', () => {
      console.log('✅ Rewarded hazır');
      isRewardedReady = true;
    });
    AdMob.addListener('onRewardedVideoAdFailedToLoad', (error) => {
      console.error('❌ Rewarded yüklenemedi:', JSON.stringify(error));
      isRewardedReady = false;
    });

    // İlk reklamları hazırla
    prepareRewarded();
    prepareInterstitial();
    return true;
  } catch (e) {
    console.error('❌ AdMob init hatası:', e);
    return false;
  }
}

// ═══ BANNER ═══
export async function showBanner() {
  if (!isNativePlatform() || !isInitialized) return;
  if (isBannerShowing) return;
  try {
    await AdMob.showBanner({
      adId: AD_CONFIG.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: IS_TESTING,
      npa: true,
    });
    isBannerShowing = true;
    console.log('✅ Banner gösterildi');
  } catch (e) {
    console.error('❌ Banner gösterilemedi:', e);
    isBannerShowing = false;
  }
}

export async function hideBanner() {
  if (!isNativePlatform() || !isBannerShowing) return;
  try {
    await AdMob.hideBanner();
    isBannerShowing = false;
  } catch (e) {
    console.error('❌ Banner gizlenemedi:', e);
  }
}

export async function removeBanner() {
  if (!isNativePlatform()) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
  } catch (e) {
    console.error('❌ Banner kaldırılamadı:', e);
  }
}

// ═══ INTERSTITIAL ═══
export async function prepareInterstitial() {
  if (!isNativePlatform() || !isInitialized) return;
  if (isInterstitialReady) return;
  try {
    await AdMob.prepareInterstitial({
      adId: AD_CONFIG.interstitial,
      isTesting: IS_TESTING,
      npa: true,
    });
    // isInterstitialReady listener'da true olacak
    console.log('ℹ️ Interstitial hazırlanıyor...');
  } catch (e) {
    console.error('❌ Interstitial hazırlanamadı:', e);
    isInterstitialReady = false;
  }
}

export async function showInterstitial() {
  if (!isNativePlatform() || !isInitialized) return false;

  const now = Date.now();
  if (now - lastInterstitialTime < INTERSTITIAL_COOLDOWN_MS) {
    console.log('ℹ️ Interstitial cooldown aktif');
    return false;
  }
  if (interstitialCount >= MAX_INTERSTITIALS_PER_SESSION) {
    console.log('ℹ️ Interstitial oturum limiti aşıldı');
    return false;
  }
  if (!isInterstitialReady) {
    await prepareInterstitial();
    // Kısa bir bekleme — reklamın hazırlanması için
    await new Promise(r => setTimeout(r, 1500));
    if (!isInterstitialReady) return false;
  }
  try {
    await AdMob.showInterstitial();
    lastInterstitialTime = now;
    interstitialCount++;
    isInterstitialReady = false;
    setTimeout(() => prepareInterstitial(), 3000);
    return true;
  } catch (e) {
    console.error('❌ Interstitial gösterilemedi:', e);
    isInterstitialReady = false;
    setTimeout(() => prepareInterstitial(), 3000);
    return false;
  }
}

// ═══ REWARDED — EN YÜKSEK GELİR ═══
export async function prepareRewarded() {
  if (!isNativePlatform() || !isInitialized) return;
  if (isRewardedReady) return;
  try {
    await AdMob.prepareRewardVideoAd({
      adId: AD_CONFIG.rewarded,
      isTesting: IS_TESTING,
      npa: true,
    });
    // isRewardedReady listener'da true olacak
    console.log('ℹ️ Rewarded hazırlanıyor...');
  } catch (e) {
    console.error('❌ Rewarded hazırlanamadı:', e);
    isRewardedReady = false;
  }
}

export async function showRewarded(onReward) {
  if (!isNativePlatform() || !isInitialized) return false;

  const now = Date.now();
  if (now - lastRewardedTime < REWARDED_COOLDOWN_MS) return false;
  if (rewardedCount >= MAX_REWARDED_PER_SESSION) return false;
  if (!isRewardedReady) {
    await prepareRewarded();
    await new Promise(r => setTimeout(r, 1500));
    if (!isRewardedReady) return false;
  }
  try {
    const listener = await AdMob.addListener('onRewardedVideoAdReward', (reward) => {
      console.log('✅ Ödül alındı:', reward);
      if (onReward) onReward(reward);
      listener.remove();
    });
    await AdMob.showRewardVideoAd();
    lastRewardedTime = now;
    rewardedCount++;
    isRewardedReady = false;
    setTimeout(() => prepareRewarded(), 3000);
    return true;
  } catch (e) {
    console.error('❌ Rewarded gösterilemedi:', e);
    isRewardedReady = false;
    setTimeout(() => prepareRewarded(), 3000);
    return false;
  }
}

// ═══ YARDIMCI ═══
export async function startAds() {
  if (!isNativePlatform()) {
    console.log('ℹ️ Web ortamında — reklamlar atlandı');
    return;
  }
  const ok = await initializeAdMob();
  if (ok) {
    // Banner'ı biraz gecikmeyle göster — uygulama tam yüklensin
    setTimeout(async () => {
      await showBanner();
    }, 1500);
  }
}

export async function refreshBanner() {
  if (!isNativePlatform() || !isInitialized) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
    setTimeout(async () => await showBanner(), 500);
  } catch (e) {
    await showBanner();
  }
}

export function isRewardedAvailable() {
  return isNativePlatform() && isRewardedReady && rewardedCount < MAX_REWARDED_PER_SESSION;
}

export function getAdStats() {
  return {
    isNative: isNativePlatform(),
    isInitialized,
    isBannerShowing,
    isInterstitialReady,
    isRewardedReady,
    interstitialCount,
    rewardedCount,
    maxInterstitials: MAX_INTERSTITIALS_PER_SESSION,
    maxRewarded: MAX_REWARDED_PER_SESSION,
  };
}