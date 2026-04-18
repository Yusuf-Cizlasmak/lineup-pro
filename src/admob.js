import { AdMob, BannerAdSize, BannerAdPosition, MaxAdContentRating, AdmobConsentStatus } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

// ═══════════════════════════════════════════════════════════════
// ═══ ADMOB REKLAM YÖNETİCİSİ — HalıSaha-Kolik
// ═══════════════════════════════════════════════════════════════
//
// iOS 14+ GEREKSİNİMLERİ:
//   1. ATT (App Tracking Transparency) izni istenmeli
//   2. UMP (User Messaging Platform) consent alınmalı
//   3. Bunlar olmadan AdMob reklam SERVİS ETMEZ
//
// ═══════════════════════════════════════════════════════════════

const IS_TESTING = false;

const AD_CONFIG = {
  banner:       'ca-app-pub-2886543552287006/3886785053',
  interstitial: 'ca-app-pub-2886543552287006/2573703388',
  rewarded:     'ca-app-pub-2886543552287006/6520687257',
};

// ─── SIKLIK KONTROLÜ ───
const INTERSTITIAL_COOLDOWN_MS = 120000;
const REWARDED_COOLDOWN_MS = 60000;
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
let canShowAds = false;

// ─── PLATFORM KONTROLÜ ───
const isNative = () => Capacitor.isNativePlatform();

// ═══════════════════════════════════════════════════════════════
// ═══ ANA BAŞLATMA — ATT + UMP + AdMob initialize
// ═══════════════════════════════════════════════════════════════
export async function initializeAdMob() {
  if (!isNative()) {
    console.log('ℹ️ AdMob: Web ortamı — atlanıyor');
    return false;
  }
  if (isInitialized) return true;

  try {
    // ─── ADIM 1: AdMob SDK'yı başlat ───
    await AdMob.initialize({
      initializeForTesting: IS_TESTING,
      tagForChildDirectedTreatment: false,
      maxAdContentRating: MaxAdContentRating.General,
    });
    console.log('✅ AdMob SDK başlatıldı');

    // ─── ADIM 2: iOS ATT izni iste ───
    try {
      const trackingInfo = await AdMob.trackingAuthorizationStatus();
      console.log('ℹ️ ATT durumu:', trackingInfo.status);

      if (trackingInfo.status === 'notDetermined') {
        // iOS izin dialogunu göster
        const result = await AdMob.requestTrackingAuthorization();
        console.log('ℹ️ ATT sonucu:', result.status);
      }
    } catch (attErr) {
      // ATT hatası reklamları engellemez, devam et
      console.warn('⚠️ ATT hatası (devam ediliyor):', attErr);
    }

    // ─── ADIM 3: UMP Consent (GDPR/Türkiye) ───
    try {
      const consentInfo = await AdMob.requestConsentInfo();
      console.log('ℹ️ Consent durumu:', consentInfo.status, 'Form var:', consentInfo.isConsentFormAvailable);

      if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
        const consentResult = await AdMob.showConsentForm();
        console.log('ℹ️ Consent sonucu:', consentResult.status);
      }

      // Consent durumuna göre reklam gösterilebilir mi?
      canShowAds = consentInfo.status === AdmobConsentStatus.OBTAINED
                || consentInfo.status === AdmobConsentStatus.NOT_REQUIRED;
    } catch (consentErr) {
      console.warn('⚠️ Consent hatası (devam ediliyor):', consentErr);
      // Consent başarısız olsa bile reklam dene — bazı bölgelerde consent gerekmez
      canShowAds = true;
    }

    console.log('ℹ️ Reklam gösterilebilir:', canShowAds);

    // ─── ADIM 4: Event listener'lar ───
    AdMob.addListener('onBannerAdLoaded', () => {
      console.log('✅ Banner yüklendi');
    });
    AdMob.addListener('onBannerAdFailedToLoad', (err) => {
      console.error('❌ Banner yüklenemedi:', JSON.stringify(err));
      isBannerShowing = false;
    });
    AdMob.addListener('onInterstitialAdLoaded', () => {
      console.log('✅ Interstitial hazır');
      isInterstitialReady = true;
    });
    AdMob.addListener('onInterstitialAdFailedToLoad', (err) => {
      console.error('❌ Interstitial yüklenemedi:', JSON.stringify(err));
      isInterstitialReady = false;
    });
    AdMob.addListener('onRewardedVideoAdLoaded', () => {
      console.log('✅ Rewarded hazır');
      isRewardedReady = true;
    });
    AdMob.addListener('onRewardedVideoAdFailedToLoad', (err) => {
      console.error('❌ Rewarded yüklenemedi:', JSON.stringify(err));
      isRewardedReady = false;
    });

    isInitialized = true;

    // İlk reklamları hazırla
    prepareInterstitial();
    prepareRewarded();

    return true;
  } catch (e) {
    console.error('❌ AdMob init hatası:', e);
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
      npa: !canShowAds,  // kişiselleştirilmemiş reklam consent yoksa
    });
    isBannerShowing = true;
    console.log('✅ Banner gösterildi');
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
    console.log('ℹ️ Interstitial hazırlanıyor...');
  } catch (e) {
    console.error('❌ Interstitial prep:', e);
    isInterstitialReady = false;
  }
}

export async function showInterstitial() {
  if (!isNative() || !isInitialized) return false;

  const now = Date.now();
  if (now - lastInterstitialTime < INTERSTITIAL_COOLDOWN_MS) return false;
  if (interstitialCount >= MAX_INTERSTITIALS_PER_SESSION) return false;

  if (!isInterstitialReady) {
    await prepareInterstitial();
    await new Promise((r) => setTimeout(r, 2000));
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
    console.error('❌ Interstitial:', e);
    isInterstitialReady = false;
    setTimeout(() => prepareInterstitial(), 3000);
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
    console.log('ℹ️ Rewarded hazırlanıyor...');
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
    await prepareRewarded();
    await new Promise((r) => setTimeout(r, 2000));
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
    console.error('❌ Rewarded:', e);
    isRewardedReady = false;
    setTimeout(() => prepareRewarded(), 3000);
    return false;
  }
}

// ═══ YARDIMCI ═══
export async function startAds() {
  if (!isNative()) {
    console.log('ℹ️ Web ortamı — reklamlar atlandı');
    return;
  }
  const ok = await initializeAdMob();
  if (ok) {
    setTimeout(async () => {
      await showBanner();
    }, 2000);
  }
}

export async function refreshBanner() {
  if (!isNative() || !isInitialized) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
    setTimeout(() => showBanner(), 500);
  } catch (e) {
    await showBanner();
  }
}

export function isRewardedAvailable() {
  return isNative() && isRewardedReady && rewardedCount < MAX_REWARDED_PER_SESSION;
}

export function getAdStats() {
  return {
    isNative: isNative(),
    isInitialized,
    canShowAds,
    isBannerShowing,
    isInterstitialReady,
    isRewardedReady,
    interstitialCount,
    rewardedCount,
  };
}