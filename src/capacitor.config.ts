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
      // ★ Android App ID'ni AdMob konsolundan al (Apps → HaliSahaKolik Android → App settings)
      // Format: ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY  (tilde ~ ile, slash / değil!)
      appIdAndroid: 'ca-app-pub-2886543552287006~2792195810',
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