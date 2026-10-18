# Davet linki ve QR kurulumu

Hedef: Davet linkine dokunan ya da QR kodu okutan kişi,
**uygulama yüklüyse doğrudan odaya girsin**, **yüklü değilse App Store / Google Play açılsın.**

## Nasıl çalışıyor

```
Paylaşılan link / QR:  https://davet.halisahakolik.com.tr/m/HK-AB12
        │
        ├─ Uygulama yüklü
        │     iOS Universal Link / Android App Link → uygulama açılır
        │     → Online moda geçer → takma ad varsa doğrudan odaya katılır
        │
        └─ Uygulama yüklü değil → Worker davet sayfası (public/_worker.js)
              iPhone  → App Store
              Android (Chrome) → sunucu doğrudan uygulamayı açar, yoksa Google Play
              Bilgisayar → maç bilgisi + "Tarayıcıda devam et"
              WhatsApp önizlemesi → saha, takımlar, saat ve kod
```

Universal/App Links devreye girene kadar yedek yol `halisahakolik://` şemasıdır:
davet sayfası önce uygulamayı açmayı dener, açılmazsa mağazaya yönlendirir.

> Not: Bu özellikler **yeni uygulama sürümüyle** gelir (iOS `Info.plist`, Android
> `AndroidManifest.xml` değişti). Eski sürümü olanlar linke dokununca mağazaya gider ve
> güncellemeyle sorun çözülür.

## 1. Domain'i Cloudflare'e bağla ve davet sayfasını yayınla (ücretsiz)

Davet linkleri **alt alan adında**: `https://davet.halisahakolik.com.tr/m/HK-XXXX`.
Kök domain (`halisahakolik.com.tr`) web sitene ait kalır.

> **Neden alt alan adı?** `halisahakolik.com.tr/m/HK-9DZN` web sitene gitti, çünkü kök
> domainde zaten web siten var. Cloudflare, var olan bir sitenin domainini Worker'a
> bağlamaz; istek Worker'a hiç ulaşmaz. Alt alan adı bu çakışmayı ortadan kaldırır.

1. **Cloudflare'e ekle:** dash.cloudflare.com → *Add a domain* → `halisahakolik.com.tr`
   → **Free** plan. Cloudflare mevcut DNS kayıtlarını (web siten, e-posta/MX) tarayıp
   kopyalar. Listeyi kontrol et; web sitenin ve e-postanın kayıtları orada olmalı.
2. **Nameserver'ları değiştir:** Cloudflare sana iki adres verir
   (örn. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`). Domaini aldığın firmanın
   panelinde (Natro, İsimtescil, Turhost vb.) *DNS / Ad sunucuları* bölümüne bu ikisini yaz,
   eskileri sil. Birkaç dakika–24 saat sürer; Cloudflare'de domain **Active** olunca mail gelir.
   Web siten bu sırada çalışmaya devam eder.
3. **Deploy** (Android Studio → Terminal, proje ana klasöründe):
   ```bash
   npx wrangler login          # Cloudflare hesabınla giriş (tarayıcı açılır)
   npm run deploy:web          # build + deploy
   ```
   `wrangler.toml` içindeki `routes` ayarı `davet.halisahakolik.com.tr`'yi Worker'a
   bağlar; DNS kaydı ve SSL sertifikası otomatik oluşur. Kök domainde açılan eski
   `/m/...` linkleri de (kök domain kaydı Cloudflare'de turuncu bulutluysa) davet adresine
   yönlendirilir.

Kontrol (tarayıcıda aç):
- `https://davet.halisahakolik.com.tr/.well-known/apple-app-site-association` → JSON görünmeli
- `https://davet.halisahakolik.com.tr/m/HK-TEST?sayfa=1` → davet sayfası görünmeli

Domain değişirse şu üç yeri aynı domain ile güncelle (eski linkler/QR'lar çalışmaz):

| Dosya | Satır |
|-------|-------|
| `src/deepLink.js` | `WEB_BASE` |
| `ios/App/App/App.entitlements` | `applinks:<domain>` |
| `android/app/src/main/AndroidManifest.xml` | `android:host="<domain>"` |
| `wrangler.toml` | `routes` + `PUBLIC_HOST` |

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
yüklendiğinde Android domaini otomatik doğrular.

**Android Studio'dan yüklediğin test sürümü** debug anahtarıyla imzalanır, Play anahtarıyla
değil. Onu da doğrulatmak için debug parmak izini ekle:
Android Studio → sağdaki *Gradle* paneli → `app > Tasks > android > signingReport`
→ `Variant: debug` altındaki **SHA-256** satırını `ANDROID_SHA256_FINGERPRINTS`'e
Play parmak iziyle birlikte virgülle ekle → `npm run deploy:web`. Sonra:

```bash
adb shell pm verify-app-links --re-verify com.halisahakolik.app
adb shell pm get-app-links com.halisahakolik.app   # "verified" görmelisin
```

Doğrulanmamış olsa bile Chrome'da link, sunucunun yönlendirmesiyle uygulamayı açar.
**Önemli:** Telefondaki uygulama bu sürümden eski ise link uygulamayı açamaz
(eski sürümde link ayarları yok) — önce yeni sürümü yükle.

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
