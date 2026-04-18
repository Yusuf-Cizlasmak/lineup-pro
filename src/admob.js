import { AdMob, BannerAdSize, BannerAdPosition, MaxAdContentRating } from '@capacitor-community/admob';

// ═══════════════════════════════════════════════════════════════
// ═══ ADMOB REKLAM YÖNETİCİSİ — HalıSaha-Kolik
// ═══════════════════════════════════════════════════════════════
//
// 💰 GELİR OPTİMİZASYONU (eCPM sıralaması):
//
//   1. REWARDED VIDEO   → $8-18 eCPM (TR ~$2-4)  ⭐ EN YÜKSEK
//      Kullanıcı isteğiyle izler. %90+ tamamlanma oranı.
//      → Otomatik kadro kur, premium özellik aç
//
//   2. INTERSTITIAL      → $2.5-5 eCPM (TR ~$1-2)
//      Doğal geçiş anlarında tam ekran.
//      → Mod seçimi, maç bitir, paylaş
//
//   3. BANNER            → $0.2-0.8 eCPM (TR ~$0.1-0.3)
//      Düşük ama sürekli, %100 fill rate.
//      → Her zaman altta görünür
//
// ✅ Google Play Families Policy tam uyumlu
// ═══════════════════════════════════════════════════════════════

const IS_TESTING = false;

const AD_CONFIG = {
  banner:       'ca-app-pub-2886543552287006/3886785053',
  interstitial: 'ca-app-pub-2886543552287006/2573703388',
  rewarded:     'ca-app-pub-2886543552287006/6520687257',
};

// ─── SIKLIK KONTROLÜ ───
const INTERSTITIAL_COOLDOWN_MS = 120000; // 2 dk
const REWARDED_COOLDOWN_MS = 60000;      // 1 dk (kullanıcı ister, daha sık ok)
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
  if (isInitialized) return true;
  try {
    await AdMob.initialize({
      initializeForTesting: IS_TESTING,
      tagForChildDirectedTreatment: true,
      maxAdContentRating: MaxAdContentRating.General,
      tagForUnderAgeOfConsent: true,
    });
    isInitialized = true;
    prepareRewarded();
    prepareInterstitial();
    return true;
  } catch (e) {
    console.error('❌ AdMob init:', e);
    return false;
  }
}

// ═══ BANNER ═══
export async function showBanner() {
  if (isBannerShowing) return;
  try {
    await AdMob.showBanner({
      adId: AD_CONFIG.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 56,
      isTesting: IS_TESTING,
      npa: true,
    });
    isBannerShowing = true;
  } catch (e) { console.error('❌ Banner:', e); }
}

export async function hideBanner() {
  if (!isBannerShowing) return;
  try { await AdMob.hideBanner(); isBannerShowing = false; }
  catch (e) { console.error('❌ Banner hide:', e); }
}

export async function removeBanner() {
  try { await AdMob.removeBanner(); isBannerShowing = false; }
  catch (e) { console.error('❌ Banner remove:', e); }
}

// ═══ INTERSTITIAL ═══
export async function prepareInterstitial() {
  if (isInterstitialReady) return;
  try {
    await AdMob.prepareInterstitial({ adId: AD_CONFIG.interstitial, isTesting: IS_TESTING, npa: true });
    isInterstitialReady = true;
  } catch (e) { console.error('❌ Interstitial prep:', e); }
}

export async function showInterstitial() {
  const now = Date.now();
  if (now - lastInterstitialTime < INTERSTITIAL_COOLDOWN_MS) return false;
  if (interstitialCount >= MAX_INTERSTITIALS_PER_SESSION) return false;
  if (!isInterstitialReady) { await prepareInterstitial(); if (!isInterstitialReady) return false; }
  try {
    await AdMob.showInterstitial();
    lastInterstitialTime = now;
    interstitialCount++;
    isInterstitialReady = false;
    setTimeout(() => prepareInterstitial(), 2000);
    return true;
  } catch (e) {
    console.error('❌ Interstitial:', e);
    isInterstitialReady = false;
    prepareInterstitial();
    return false;
  }
}

// ═══ REWARDED — EN YÜKSEK GELİR ═══
export async function prepareRewarded() {
  if (isRewardedReady) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: AD_CONFIG.rewarded, isTesting: IS_TESTING, npa: true });
    isRewardedReady = true;
  } catch (e) { console.error('❌ Rewarded prep:', e); }
}

export async function showRewarded(onReward) {
  const now = Date.now();
  if (now - lastRewardedTime < REWARDED_COOLDOWN_MS) return false;
  if (rewardedCount >= MAX_REWARDED_PER_SESSION) return false;
  if (!isRewardedReady) { await prepareRewarded(); if (!isRewardedReady) return false; }
  try {
    const listener = await AdMob.addListener('onRewardedVideoAdReward', (reward) => {
      if (onReward) onReward(reward);
      listener.remove();
    });
    await AdMob.showRewardVideoAd();
    lastRewardedTime = now;
    rewardedCount++;
    isRewardedReady = false;
    setTimeout(() => prepareRewarded(), 2000);
    return true;
  } catch (e) {
    console.error('❌ Rewarded:', e);
    isRewardedReady = false;
    prepareRewarded();
    return false;
  }
}

// ═══ YARDIMCI ═══
export async function startAds() {
  const ok = await initializeAdMob();
  if (ok) await showBanner();
}

export async function refreshBanner() {
  if (!isInitialized) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
    setTimeout(async () => await showBanner(), 300);
  } catch (e) { await showBanner(); }
}

export function isRewardedAvailable() {
  return isRewardedReady && rewardedCount < MAX_REWARDED_PER_SESSION;
}

export function getAdStats() {
  return { isInitialized, isBannerShowing, isInterstitialReady, isRewardedReady,
    interstitialCount, rewardedCount, maxInterstitials: MAX_INTERSTITIALS_PER_SESSION,
    maxRewarded: MAX_REWARDED_PER_SESSION };
}