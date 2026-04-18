import { AdMob, BannerAdSize, BannerAdPosition, MaxAdContentRating, AdmobConsentStatus } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

// ═══════════════════════════════════════════════════════════════
// ═══ ADMOB REKLAM YÖNETİCİSİ — HalıSaha-Kolik
// ═══════════════════════════════════════════════════════════════

const IS_TESTING = true;

const AD_CONFIG = {
  banner:       'ca-app-pub-2886543552287006/3886785053',
  interstitial: 'ca-app-pub-2886543552287006/2573703388',
  rewarded:     'ca-app-pub-2886543552287006/6520687257',
};

// ─── SIKLIK KONTROLÜ ───
const INTERSTITIAL_COOLDOWN_MS = 30000;  // 30 sn (eskiden 120sn — çok uzundu)
const REWARDED_COOLDOWN_MS = 20000;      // 20 sn
let lastInterstitialTime = 0;
let lastRewardedTime = 0;
let interstitialCount = 0;
let rewardedCount = 0;
const MAX_INTERSTITIALS_PER_SESSION = 15;
const MAX_REWARDED_PER_SESSION = 20;

// ─── DURUM ───
let isInitialized = false;
let isBannerShowing = false;
let isInterstitialReady = false;
let isRewardedReady = false;
let canShowAds = false;

// ─── Promise-based prepare bekleyiciler ───
let interstitialLoadPromise = null;
let rewardedLoadPromise = null;

const isNative = () => Capacitor.isNativePlatform();

// ═══ BAŞLATMA ═══
export async function initializeAdMob() {
  if (!isNative()) {
    console.log('ℹ️ AdMob: Web — atlanıyor');
    return false;
  }
  if (isInitialized) return true;

  try {
    await AdMob.initialize({
      initializeForTesting: IS_TESTING,
      tagForChildDirectedTreatment: false,
      maxAdContentRating: MaxAdContentRating.General,
    });
    console.log('✅ AdMob SDK başlatıldı');

    // ATT izni
    try {
      const trackingInfo = await AdMob.trackingAuthorizationStatus();
      console.log('ℹ️ ATT:', trackingInfo.status);
      if (trackingInfo.status === 'notDetermined') {
        await AdMob.requestTrackingAuthorization();
      }
    } catch (e) {
      console.warn('⚠️ ATT hatası:', e);
    }

    // UMP Consent
    try {
      const consentInfo = await AdMob.requestConsentInfo();
      console.log('ℹ️ Consent:', consentInfo.status);
      if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
        await AdMob.showConsentForm();
      }
      canShowAds = consentInfo.status === AdmobConsentStatus.OBTAINED
                || consentInfo.status === AdmobConsentStatus.NOT_REQUIRED;
    } catch (e) {
      console.warn('⚠️ Consent hatası:', e);
      canShowAds = true;
    }

    // ─── Event listener'lar (promise resolve ile) ───
    AdMob.addListener('onBannerAdLoaded', () => console.log('✅ Banner yüklendi'));
    AdMob.addListener('onBannerAdFailedToLoad', (e) => {
      console.error('❌ Banner fail:', JSON.stringify(e));
      isBannerShowing = false;
    });

    AdMob.addListener('onInterstitialAdLoaded', () => {
      console.log('✅ Interstitial yüklendi');
      isInterstitialReady = true;
    });
    AdMob.addListener('onInterstitialAdFailedToLoad', (e) => {
      console.error('❌ Interstitial fail:', JSON.stringify(e));
      isInterstitialReady = false;
    });
    AdMob.addListener('onInterstitialAdDismissed', () => {
      console.log('ℹ️ Interstitial kapatıldı — yenisi hazırlanıyor');
      isInterstitialReady = false;
      setTimeout(() => prepareInterstitial(), 1000);
    });

    AdMob.addListener('onRewardedVideoAdLoaded', () => {
      console.log('✅ Rewarded yüklendi');
      isRewardedReady = true;
    });
    AdMob.addListener('onRewardedVideoAdFailedToLoad', (e) => {
      console.error('❌ Rewarded fail:', JSON.stringify(e));
      isRewardedReady = false;
    });
    AdMob.addListener('onRewardedVideoAdDismissed', () => {
      console.log('ℹ️ Rewarded kapatıldı — yenisi hazırlanıyor');
      isRewardedReady = false;
      setTimeout(() => prepareRewarded(), 1000);
    });

    isInitialized = true;

    // İlk reklamları hemen hazırla
    prepareInterstitial();
    prepareRewarded();

    return true;
  } catch (e) {
    console.error('❌ AdMob init:', e);
    return false;
  }
}

// ═══ BANNER ═══
export async function showBanner() {
  if (!isNative() || !isInitialized) return;
  if (isBannerShowing) return;
  try {
    await AdMob.showBanner({
      adId: AD_CONFIG.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: IS_TESTING,
      npa: !canShowAds,
    });
    isBannerShowing = true;
  } catch (e) {
    console.error('❌ Banner:', e);
    isBannerShowing = false;
  }
}

export async function hideBanner() {
  if (!isNative() || !isBannerShowing) return;
  try {
    await AdMob.hideBanner();
    isBannerShowing = false;
  } catch (e) {
    console.error('❌ Banner hide:', e);
  }
}

export async function removeBanner() {
  if (!isNative()) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
  } catch (e) {
    console.error('❌ Banner remove:', e);
  }
}

// ═══ INTERSTITIAL ═══
export async function prepareInterstitial() {
  if (!isNative() || !isInitialized || isInterstitialReady) return;
  try {
    await AdMob.prepareInterstitial({
      adId: AD_CONFIG.interstitial,
      isTesting: IS_TESTING,
      npa: !canShowAds,
    });
  } catch (e) {
    console.error('❌ Interstitial prep:', e);
    isInterstitialReady = false;
  }
}

export async function showInterstitial() {
  if (!isNative() || !isInitialized) return false;

  const now = Date.now();
  if (now - lastInterstitialTime < INTERSTITIAL_COOLDOWN_MS) {
    console.log('ℹ️ Interstitial cooldown — atlanıyor');
    return false;
  }
  if (interstitialCount >= MAX_INTERSTITIALS_PER_SESSION) return false;

  // Hazır değilse bekle
  if (!isInterstitialReady) {
    console.log('ℹ️ Interstitial hazır değil — hazırlanıyor...');
    await prepareInterstitial();
    // Yüklenene kadar bekle (max 5sn)
    for (let i = 0; i < 25; i++) {
      if (isInterstitialReady) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!isInterstitialReady) {
      console.log('⚠️ Interstitial yüklenemedi — atlanıyor');
      return false;
    }
  }

  try {
    await AdMob.showInterstitial();
    lastInterstitialTime = Date.now();
    interstitialCount++;
    isInterstitialReady = false;
    // Dismissed listener'da otomatik hazırlanacak
    return true;
  } catch (e) {
    console.error('❌ Interstitial show:', e);
    isInterstitialReady = false;
    setTimeout(() => prepareInterstitial(), 1000);
    return false;
  }
}

// ═══ REWARDED ═══
export async function prepareRewarded() {
  if (!isNative() || !isInitialized || isRewardedReady) return;
  try {
    await AdMob.prepareRewardVideoAd({
      adId: AD_CONFIG.rewarded,
      isTesting: IS_TESTING,
      npa: !canShowAds,
    });
  } catch (e) {
    console.error('❌ Rewarded prep:', e);
    isRewardedReady = false;
  }
}

export async function showRewarded(onReward) {
  if (!isNative() || !isInitialized) return false;

  const now = Date.now();
  if (now - lastRewardedTime < REWARDED_COOLDOWN_MS) return false;
  if (rewardedCount >= MAX_REWARDED_PER_SESSION) return false;

  if (!isRewardedReady) {
    console.log('ℹ️ Rewarded hazır değil — hazırlanıyor...');
    await prepareRewarded();
    for (let i = 0; i < 25; i++) {
      if (isRewardedReady) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!isRewardedReady) {
      console.log('⚠️ Rewarded yüklenemedi — atlanıyor');
      return false;
    }
  }

  try {
    const listener = await AdMob.addListener('onRewardedVideoAdReward', (reward) => {
      console.log('✅ Ödül:', reward);
      if (onReward) onReward(reward);
      listener.remove();
    });
    await AdMob.showRewardVideoAd();
    lastRewardedTime = Date.now();
    rewardedCount++;
    isRewardedReady = false;
    return true;
  } catch (e) {
    console.error('❌ Rewarded show:', e);
    isRewardedReady = false;
    setTimeout(() => prepareRewarded(), 1000);
    return false;
  }
}

// ═══ YARDIMCI ═══
export async function startAds() {
  if (!isNative()) return;
  const ok = await initializeAdMob();
  if (ok) {
    setTimeout(() => showBanner(), 1500);
  }
}

export async function refreshBanner() {
  if (!isNative() || !isInitialized) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
    setTimeout(() => showBanner(), 300);
  } catch (e) {
    await showBanner();
  }
}

export function isRewardedAvailable() {
  return isNative() && isRewardedReady && rewardedCount < MAX_REWARDED_PER_SESSION;
}

export function getAdStats() {
  return { isInitialized, canShowAds, isBannerShowing, isInterstitialReady, isRewardedReady, interstitialCount, rewardedCount };
}