import { AdMob, BannerAdSize, BannerAdPosition, MaxAdContentRating, AdmobConsentStatus } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { isPremium } from './subscription';
import { getAllMatches } from './matchHistoryStore';
import { track, EVENTS } from './analytics';

const IS_TESTING = false;

// ═══ PLATFORM-SPECIFIC AD IDs ═══
const PLATFORM = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

const AD_IDS = {
  ios: {
    banner:       'ca-app-pub-2886543552287006/3886785053',
    interstitial: 'ca-app-pub-2886543552287006/2573703388',
    rewarded:     'ca-app-pub-2886543552287006/6520687257',
  },
  android: {
    // ★ ANDROID REKLAM BİRİMİ ID'LERİNİ BURAYA YAZ
    banner:       'ca-app-pub-2886543552287006/5847500924',
    interstitial: 'ca-app-pub-2886543552287006/1389381160',
    rewarded:     'ca-app-pub-2886543552287006/5254707624',
  },
};

const AD_CONFIG = AD_IDS[PLATFORM] || AD_IDS.android;

// ═══ REKLAM POLİTİKASI — ilk deneyimi reklamla bozma ═══
// Geçiş (interstitial) reklamı SADECE şu koşulların hepsi sağlanınca:
//   ★ Pro değil
//   ★ İlk oturum değil (halisaha_launch_count > 1 — App.js açılışta artırır)
//   ★ En az 1 kayıtlı maç var (kullanıcı değeri gördü)
//   ★ Bu oturumda henüz gösterilmedi (oturum başına en fazla 1)
//   ★ Bir öncekinden en az 3 dk geçti (hızlı kapat-aç'ta da korunur → localStorage)
// ATT (iOS izin penceresi) de ilk açılışta SORULMAZ → 2. açılışta, reklam SDK'sı
// başlamadan önce sorulur. Sorulana kadar reklamlar kişiselleştirilmemiş (npa) gelir.
const INTERSTITIAL_MIN_GAP_MS = 3 * 60 * 1000;
const REWARDED_COOLDOWN_MS = 20000;
const MAX_INTERSTITIALS_PER_SESSION = 1;
const MAX_REWARDED_PER_SESSION = 10;
const LAUNCH_COUNT_KEY = 'halisaha_launch_count';
const LAST_INTERSTITIAL_KEY = 'halisaha_last_interstitial_at';

let lastInterstitialTime = 0;
let lastRewardedTime = 0;
let interstitialCount = 0;
let rewardedCount = 0;
let bannerTracked = false;             // ★ Analytics: banner oturumda ilk kez görününce 1 olay

// ─── Politika yardımcıları ───
const readInt = (key) => {
  try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch { return 0; }
};
const getLaunchCount = () => readInt(LAUNCH_COUNT_KEY);
// launch_count <= 1 → ilk oturum (App.js boot'ta artırır; okunamazsa da ilk oturum say)
const isFirstSession = () => getLaunchCount() <= 1;
const savedMatchCount = () => {
  try { return getAllMatches().length; } catch { return 0; }
};
const lastInterstitialAt = () => Math.max(lastInterstitialTime, readInt(LAST_INTERSTITIAL_KEY));

// Geçiş reklamı neden gösterilemez? null → gösterilebilir
function interstitialBlockReason() {
  if (isPremium()) return 'premium';
  if (interstitialCount >= MAX_INTERSTITIALS_PER_SESSION) return 'session_cap';
  if (isFirstSession()) return 'first_session';
  if (savedMatchCount() < 1) return 'no_saved_match';
  const last = lastInterstitialAt();
  if (last > 0 && Date.now() - last < INTERSTITIAL_MIN_GAP_MS) return 'cooldown';
  return null;
}

let isInitialized = false;
let isBannerShowing = false;
let isInterstitialReady = false;
let isInterstitialLoading = false;     // ★ Android: prepareInterstitial çağrıldı mı?
let isRewardedReady = false;
let isRewardedLoading = false;         // ★ Android: prepareRewarded çağrıldı mı?
// ★ FIX: iOS'ta Türkiye gibi UMP-scope dışı bölgelerde status UNKNOWN dönebilir.
// Başlangıç değeri false yerine null bırakıyoruz; consent sonrası set edilecek.
// Eğer status belirlenemezse güvenli varsayılan: true (reklam göster, npa=false).
let canShowAds = false;
let listenersAttached = false;         // ★ Listener'lar bir kez eklensin

const isNative = () => Capacitor.isNativePlatform();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── ATT (App Tracking Transparency) — Sadece iOS ───
// ★ İlk açılışta izin penceresi YOK (kullanıcı uygulamayı tanımadan "takip" sorusu
//   güven kırıyor). 2. açılıştan itibaren, AdMob başlamadan ÖNCE sorulur.
//   Sorulmadıysa (notDetermined) veya durum okunamadıysa → npa (kişiselleştirilmemiş).
let attStatus = null; // iOS: 'authorized' | 'denied' | 'restricted' | 'notDetermined' | null
async function requestATT() {
  if (!isNative() || PLATFORM !== 'ios') return;

  try {
    // UI'ın tam render olması ve app'in "active" state'e geçmesi için kısa bekleme
    // (bu sürede App.js açılış sayacını da artırmış olur)
    await sleep(500);

    const trackingInfo = await AdMob.trackingAuthorizationStatus();
    attStatus = trackingInfo?.status || null;
    console.log('ℹ️ ATT mevcut durum:', attStatus);

    if (attStatus === 'notDetermined') {
      if (getLaunchCount() < 2) {
        console.log('ℹ️ ATT ilk oturumda sorulmuyor — reklamlar kişiselleştirilmemiş');
        return;
      }
      await AdMob.requestTrackingAuthorization();
      const after = await AdMob.trackingAuthorizationStatus();
      attStatus = after?.status || attStatus;
      console.log('ℹ️ ATT yeni durum:', attStatus);
    }
  } catch (e) {
    console.warn('⚠️ ATT hatası:', e);
  }
}

// Kişiselleştirilmemiş reklam mı? — UMP onayı yoksa veya (iOS) ATT henüz sorulmadıysa
const wantsNpa = () => {
  if (!canShowAds) return true;
  if (PLATFORM === 'ios' && (attStatus === null || attStatus === 'notDetermined')) return true;
  return false;
};

// ═══ EVENT LISTENERS ═══
// ★ KRİTİK: Listener'lar initialize()'dan ÖNCE eklenmeli — Android'de aksi
//    halde plugin'in ilk emit ettiği yükleme event'leri kaçırılabiliyor.
function attachAdListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  // ─── Banner ───
  AdMob.addListener('onBannerAdLoaded', () => console.log('✅ Banner yüklendi'));
  AdMob.addListener('onBannerAdFailedToLoad', (e) => {
    console.error('❌ Banner fail:', JSON.stringify(e));
    isBannerShowing = false;
  });

  // ─── Interstitial ───
  AdMob.addListener('onInterstitialAdLoaded', () => {
    console.log('✅ Interstitial yüklendi');
    isInterstitialReady = true;
    isInterstitialLoading = false;
  });
  AdMob.addListener('onInterstitialAdFailedToLoad', (e) => {
    console.error('❌ Interstitial fail:', JSON.stringify(e));
    isInterstitialReady = false;
    isInterstitialLoading = false;
    // ★ Yükleme başarısız: 3sn sonra tekrar dene (network blip / no fill)
    setTimeout(() => prepareInterstitial(), 3000);
  });
  AdMob.addListener('onInterstitialAdDismissed', () => {
    console.log('ℹ️ Interstitial kapatıldı');
    isInterstitialReady = false;
    isInterstitialLoading = false;
    // ★ Oturum kotası dolduysa prepareInterstitial zaten no-op (boşuna istek atılmaz)
    setTimeout(() => prepareInterstitial(), 1000);
  });

  // ─── Rewarded ───
  AdMob.addListener('onRewardedVideoAdLoaded', () => {
    console.log('✅ Rewarded yüklendi');
    isRewardedReady = true;
    isRewardedLoading = false;
  });
  AdMob.addListener('onRewardedVideoAdFailedToLoad', (e) => {
    console.error('❌ Rewarded fail:', JSON.stringify(e));
    isRewardedReady = false;
    isRewardedLoading = false;
    setTimeout(() => prepareRewarded(), 3000);
  });
  AdMob.addListener('onRewardedVideoAdDismissed', () => {
    console.log('ℹ️ Rewarded kapatıldı — yenisi hazırlanıyor');
    isRewardedReady = false;
    isRewardedLoading = false;
    setTimeout(() => prepareRewarded(), 1000);
  });
}

// ═══ INITIALIZATION ═══
export async function initializeAdMob() {
  if (!isNative()) {
    console.log('ℹ️ AdMob: Web ortamı — atlanıyor');
    return false;
  }
  if (isInitialized) return true;

  console.log(`ℹ️ AdMob platform: ${PLATFORM}`);
  console.log(`ℹ️ AdMob banner ID: ${AD_CONFIG.banner}`);

  try {
    // ═══ 0) ÖNCE listener'ları ekle (init'ten önce — Android için kritik) ═══
    attachAdListeners();

    // ═══ 1) ATT iste (sadece iOS) ═══
    await requestATT();

    // ═══ 2) AdMob SDK'yı başlat ═══
    await AdMob.initialize({
      initializeForTesting: IS_TESTING,
      tagForChildDirectedTreatment: false,
      maxAdContentRating: MaxAdContentRating.General,
    });
    console.log('✅ AdMob SDK başlatıldı');

    // ═══ 3) UMP Consent ═══
    try {
      const consentInfo = await AdMob.requestConsentInfo();
      console.log('ℹ️ Consent status:', consentInfo.status);

      if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
        await AdMob.showConsentForm();
        // Form gösterildikten sonra güncel status'u tekrar al
        const updatedInfo = await AdMob.requestConsentInfo();
        console.log('ℹ️ Consent (form sonrası):', updatedInfo.status);
        canShowAds = updatedInfo.status === AdmobConsentStatus.OBTAINED
                  || updatedInfo.status === AdmobConsentStatus.NOT_REQUIRED;
      } else {
        // ★ KRİTİK FIX: Türkiye gibi UMP-scope dışı bölgelerde UNKNOWN veya
        // NOT_REQUIRED dönebilir. UNKNOWN dahil tüm "form gerekmez" durumlarında
        // reklam göster. Sadece açıkça REQUIRED ve form gösterilmemişse kapat.
        const explicitlyBlocked = consentInfo.status === AdmobConsentStatus.REQUIRED
                                  && !consentInfo.isConsentFormAvailable;
        canShowAds = !explicitlyBlocked;
        console.log('ℹ️ canShowAds:', canShowAds, '(status:', consentInfo.status, ')');
      }
    } catch (e) {
      console.warn('⚠️ Consent hatası — reklam göstermeye devam:', e);
      canShowAds = true;
    }

    isInitialized = true;

    // ★ FIX: iOS'a da yeterli süre ver. iOS mediation adapterleri de
    // initialize() Promise'i resolve ettikten hemen sonra hazır olmayabiliyor.
    // 0ms → 600ms yaparak "no fill" oranını ciddi düşürüyoruz.
    const preloadDelay = PLATFORM === 'android' ? 800 : 600;
    setTimeout(() => {
      prepareInterstitial();
      prepareRewarded();
    }, preloadDelay);

    return true;
  } catch (e) {
    console.error('❌ AdMob init:', e);
    return false;
  }
}

// ═══ BANNER ═══
export async function showBanner() {
  if (!isNative() || !isInitialized) return;
  // ★ Premium kullanıcı: hiç reklam yok. Olası kalıntı banner'ı da gizle.
  if (isPremium()) { try { await AdMob.hideBanner(); } catch (_) {} return; }
  if (isBannerShowing) return;
  try {
    // ★ Önceki bir banner kalıntısı varsa temizle (Android race condition)
    try { await AdMob.removeBanner(); } catch (_) { /* yoksa sorun değil */ }
    await AdMob.showBanner({
      adId: AD_CONFIG.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: IS_TESTING,
      npa: wantsNpa(),
    });
    isBannerShowing = true;
    if (!bannerTracked) {
      bannerTracked = true;
      track(EVENTS.AD_SHOWN, { placement: 'banner', type: 'banner' });
    }
  } catch (e) {
    console.error('❌ Banner:', e);
    isBannerShowing = false;
  }
}

export async function hideBanner() {
  if (!isNative()) return;
  // ★ State ne olursa olsun çağır (Android'de bazen flag yanlış kalıyor)
  try {
    await AdMob.hideBanner();
    isBannerShowing = false;
  } catch (e) {
    console.log('ℹ️ Banner hide (zaten gizli olabilir):', e?.message);
    isBannerShowing = false;
  }
}

export async function removeBanner() {
  if (!isNative()) return;
  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
  } catch (e) {
    console.error('❌ Banner remove:', e);
    isBannerShowing = false;
  }
}

// ═══ INTERSTITIAL ═══
export async function prepareInterstitial() {
  if (!isNative() || !isInitialized) return;
  if (isPremium()) return; // ★ Premium: interstitial hazırlama
  if (isInterstitialReady || isInterstitialLoading) return; // ★ Çift yükleme önleme
  // ★ Bu oturumda zaten gösterilemeyecekse (ilk oturum / kota doldu) boşuna yükleme
  if (isFirstSession() || interstitialCount >= MAX_INTERSTITIALS_PER_SESSION) return;

  isInterstitialLoading = true;
  console.log('ℹ️ Interstitial hazırlanıyor...');
  try {
    await AdMob.prepareInterstitial({
      adId: AD_CONFIG.interstitial,
      isTesting: IS_TESTING,
      npa: wantsNpa(),
    });
    // ★ NOT: Bazı plugin versiyonlarında prepareInterstitial Promise resolve
    //    ettiğinde reklam zaten hazırdır ama event tetiklenmez. Bu yüzden
    //    fallback olarak isReady'i de set ediyoruz.
    if (PLATFORM === 'android') {
      // Event birazdan zaten gelecek; gelmezse 4sn sonra hazır kabul et
      setTimeout(() => {
        if (isInterstitialLoading && !isInterstitialReady) {
          console.log('⚠️ Interstitial event gelmedi — fallback ready');
          isInterstitialReady = true;
          isInterstitialLoading = false;
        }
      }, 4000);
    }
  } catch (e) {
    console.error('❌ Interstitial prep:', e);
    isInterstitialReady = false;
    isInterstitialLoading = false;
  }
}

// placement: reklamın nerede istendiği (analytics için, örn. "match_saved")
export async function showInterstitial(placement = 'unknown') {
  if (!isNative() || !isInitialized) return false;

  // ★ Politika (Pro, ilk oturum, kayıtlı maç, oturum kotası, 3 dk aralık)
  const blocked = interstitialBlockReason();
  if (blocked) {
    console.log(`ℹ️ Interstitial atlandı (${placement}): ${blocked}`);
    return false;
  }

  // ★ Hazır değilse: prepare'ı tetikle ve kısa bir süre bekle (Android için kritik)
  if (!isInterstitialReady) {
    console.log('ℹ️ Interstitial hazır değil — yükleme tetikleniyor, kısa bekleme...');
    prepareInterstitial();
    // Android: maksimum 2sn bekle, her 200ms'de bir kontrol et
    const maxWaitMs = PLATFORM === 'android' ? 2000 : 1200;
    const stepMs = 200;
    let waited = 0;
    while (!isInterstitialReady && waited < maxWaitMs) {
      await sleep(stepMs);
      waited += stepMs;
    }
    if (!isInterstitialReady) {
      console.log('ℹ️ Interstitial yine hazır değil — atlanıyor');
      return false;
    }
  }

  // Bekleme sırasında Pro olunmuş / başka bir çağrı reklamı göstermiş olabilir
  if (interstitialBlockReason()) return false;

  try {
    // ★ Sayaçları göstermeden ÖNCE işaretle → eşzamanlı iki çağrı iki reklam açamaz
    interstitialCount++;
    lastInterstitialTime = Date.now();
    await AdMob.showInterstitial();
    try { localStorage.setItem(LAST_INTERSTITIAL_KEY, String(lastInterstitialTime)); } catch {}
    isInterstitialReady = false;
    track(EVENTS.AD_SHOWN, { placement, type: 'interstitial' });
    return true;
  } catch (e) {
    // Gösterilemedi → kota/aralık harcanmasın
    interstitialCount = Math.max(0, interstitialCount - 1);
    lastInterstitialTime = 0;
    console.error('❌ Interstitial show:', e);
    isInterstitialReady = false;
    setTimeout(() => prepareInterstitial(), 1000);
    return false;
  }
}

// ═══ REWARDED ═══
export async function prepareRewarded() {
  if (!isNative() || !isInitialized) return;
  if (isRewardedReady || isRewardedLoading) return; // ★ Çift yükleme önleme

  isRewardedLoading = true;
  console.log('ℹ️ Rewarded hazırlanıyor...');
  try {
    await AdMob.prepareRewardVideoAd({
      adId: AD_CONFIG.rewarded,
      isTesting: IS_TESTING,
      npa: wantsNpa(),
    });
    if (PLATFORM === 'android') {
      setTimeout(() => {
        if (isRewardedLoading && !isRewardedReady) {
          console.log('⚠️ Rewarded event gelmedi — fallback ready');
          isRewardedReady = true;
          isRewardedLoading = false;
        }
      }, 4000);
    }
  } catch (e) {
    console.error('❌ Rewarded prep:', e);
    isRewardedReady = false;
    isRewardedLoading = false;
  }
}

export async function showRewarded(onReward) {
  if (!isNative() || !isInitialized) return false;
  // ★ Premium: reklam GÖSTERME ama ödülü ver (kullanıcı içeriği kazansın).
  //   true döner → çağıran taraf ödülü verilmiş sayar, fallback interstitial açmaz.
  if (isPremium()) { if (onReward) onReward({ premium: true }); return true; }

  const now = Date.now();
  if (now - lastRewardedTime < REWARDED_COOLDOWN_MS) return false;
  if (rewardedCount >= MAX_REWARDED_PER_SESSION) return false;

  if (!isRewardedReady) {
    prepareRewarded();
    return false;
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
    track(EVENTS.AD_SHOWN, { placement: 'rewarded', type: 'rewarded' });
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
  if (ok) setTimeout(() => showBanner(), 1500);
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
  return {
    platform: PLATFORM,
    isInitialized,
    canShowAds,
    isBannerShowing,
    isInterstitialReady,
    isRewardedReady,
    interstitialCount,
    rewardedCount,
    attStatus,
    npa: wantsNpa(),
    launchCount: getLaunchCount(),
    interstitialBlockedBy: interstitialBlockReason(),
  };
}