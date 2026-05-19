import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.halisahakolik.app',
  appName: 'HaliSahaKolik',
  webDir: 'build',

  // ─── iOS — Full-screen WebView, safe-area CSS ile yönetilecek ───
  ios: {
    // ★ FIX: 'never' → WebView ekranı tamamen kaplar, safe-area-inset CSS
    // ile sen kontrol edersin. 'automatic' Capacitor'un kendi insetlerini
    // ekliyor, iPhone'larda kenarlarda boşluk yaratıyordu.
    contentInset: 'never',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },

  plugins: {
    // ─── AdMob ───
    AdMob: {
      appIdIos: 'ca-app-pub-2886543552287006~5889085689',
      appIdAndroid: 'ca-app-pub-2886543552287006~2792195810',
    },
    // ─── Status Bar ───
    StatusBar: {
      overlaysWebView: true,  // WebView status bar'ın ALTINA gider, biz safe-area-inset-top ile pad'leriz
      style: 'LIGHT',
      backgroundColor: '#070a0f',
    },
    // ─── Keyboard ───
    Keyboard: {
      resize: 'body',
      scrollPadding: false,
    },
  },

  server: {
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },
};

export default config;