import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.halisahakolik.app',
  appName: 'HaliSahaKolik',
  webDir: 'build',
  // ─── iOS Status Bar: WebView tam ekran, safe-area CSS ile yönetilir ───
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  plugins: {
    // ─── AdMob Plugin Ayarları ───
    AdMob: {
      appIdIos: 'ca-app-pub-2886543552287006~5889085689',
      // Android kullanılırsa buraya da eklenebilir:
      // appIdAndroid: 'ca-app-pub-XXXX~YYYY',
    },
    // ─── Status Bar ───
    StatusBar: {
      overlaysWebView: true,
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