# Davet linki ve QR kurulumu

Hedef: Davet linkine dokunan ya da QR kodu okutan kişi,
**uygulama yüklüyse doğrudan odaya girsin**, **yüklü değilse App Store / Google Play açılsın.**

## Nasıl çalışıyor

```
Paylaşılan link / QR:  https://<domain>/m/HK-AB12
        │
        ├─ Uygulama yüklü
        │     iOS Universal Link / Android App Link → uygulama açılır
        │     → Online moda geçer → takma ad varsa doğrudan odaya katılır
        │
        └─ Uygulama yüklü değil → Worker davet sayfası (public/_worker.js)
              iPhone  → App Store
              Android → Google Play
              Bilgisayar → maç bilgisi + "Tarayıcıda devam et"
              WhatsApp önizlemesi → saha, takımlar, saat ve kod
```

Universal/App Links devreye girene kadar yedek yol `halisahakolik://` şemasıdır:
davet sayfası önce uygulamayı açmayı dener, açılmazsa mağazaya yönlendirir.

> Not: Bu özellikler **yeni uygulama sürümüyle** gelir (iOS `Info.plist`, Android
> `AndroidManifest.xml` değişti). Eski sürümü olanlar linke dokununca mağazaya gider ve
> güncellemeyle sorun çözülür.

## 1. Davet sayfasını yayınla (Cloudflare Workers, ücretsiz)

`halisaha-kolik.ycizlasmak.workers.dev` adresi şu an yayında değil — linkler bu yüzden boşa
düşüyor. Bir kez deploy etmek yeterli:

```bash
npx wrangler login          # Cloudflare hesabınla giriş (tarayıcı açılır)
npm run deploy:web          # build + deploy
```

Komutun sonunda gerçek adres yazar: `https://halisaha-kolik.<alt-alan-adın>.workers.dev`.
Alt alan adın `ycizlasmak` **değilse** şu üç yeri aynı domain ile güncelle:

| Dosya | Satır |
|-------|-------|
| `src/deepLink.js` | `WEB_BASE` |
| `ios/App/App/App.entitlements` | `applinks:<domain>` |
| `android/app/src/main/AndroidManifest.xml` | `android:host="<domain>"` |

**Öneri:** Uygulama yayına girmeden kendi domainini al (örn. `halisahakolik.com`, yıllık
~10$) ve Cloudflare → Workers → *Custom Domains* ile bu Worker'a bağla. Domain sonradan
değişirse önceki linkler ve QR kodlar çalışmaz; kalıcı bir adresle başlamak en sağlıklısı.

Kontrol (tarayıcıda aç):
- `https://<domain>/.well-known/apple-app-site-association` → JSON görünmeli
- `https://<domain>/m/HK-TEST` → davet sayfası görünmeli

## 2. Mağaza bilgilerini gir — `wrangler.toml` → `[vars]`

- `IOS_APP_STORE_ID`: App Store Connect → Uygulama → Uygulama Bilgileri → **Apple Kimliği**
  (sadece rakam). Boşken iPhone'da App Store'da isimle arama açılır.
- `ANDROID_SHA256_FINGERPRINTS`: Play Console → Test ve yayınla → Uygulama bütünlüğü →
  *Uygulama imzalama anahtarı sertifikası* → **SHA-256** parmak izi.

Değiştirdikten sonra tekrar `npm run deploy:web`.

## 3. iOS Universal Links'i aç

Bu adım olmadan da çalışır (yedek yol), ama Universal Links ile uygulama hiçbir ara ekran
olmadan açılır ve QR okutunca iOS doğrudan "HaliSahaKolik'te aç" der.

1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → `com.halisahakolik.app`
   → **Associated Domains** kutusunu işaretle → Save.
2. `codemagic.yaml` → `ENABLE_UNIVERSAL_LINKS: "true"` → yeni build al.
   - İmzalama "profile doesn't support Associated Domains" hatası verirse developer
     portalındaki eski App Store profilini sil; Codemagic yenisini oluşturur.
3. Bu sürüm TestFlight'ta / App Store'da yayına girince `wrangler.toml` →
   `IOS_UNIVERSAL_LINKS = "true"` → `npm run deploy:web`.

## 4. Android App Links

Manifest hazır (`autoVerify`). 2. adımdaki SHA-256 parmak izi yayındayken yeni Android sürümü
yüklendiğinde Android domaini otomatik doğrular. Kontrol:

```bash
adb shell pm get-app-links com.halisahakolik.app   # "verified" görmelisin
```

Doğrulanmamış olsa bile davet sayfası `intent://` ile uygulamayı açar.

## Test listesi

| Senaryo | Beklenen |
|---------|----------|
| iPhone, uygulama yüklü, WhatsApp'tan linke dokun | Uygulama açılır, odaya girer |
| iPhone, uygulama yok | Davet sayfası → App Store |
| iPhone Kamera ile QR | "HaliSahaKolik'te aç" → odaya girer |
| Android, uygulama yüklü | Uygulama açılır, odaya girer |
| Android, uygulama yok | Google Play |
| Uygulama kapalıyken linke dokun (soğuk açılış) | Açılış sonrası odaya girer |
| Takma ad hiç girilmemiş | Önce takma ad sorulur, sonra otomatik katılır |
| Bilgisayarda link | Maç bilgisi + "Tarayıcıda devam et" |
| WhatsApp'ta link önizlemesi | Logo, "Takım A vs Takım B", saha ve saat |
