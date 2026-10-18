# Uzak bildirim (push) kurulumu

Hedef: Telefonlara **sunucudan** bildirim gitsin. iPhone'lar da dahil.

- Biri online odana katılınca sana: **"Ali maça katıldı · 9/14"**
- MVP seçilince MVP'ye **"⭐ Haftanın MVP'si sensin!"**, diğer oyunculara **"⭐ MVP: Ali"**
- Firebase Console'dan **herkese duyuru** (ör. "Yeni sürüm çıktı")

Bildirime dokunan kişi uygulamada doğru ekrana gider (katılım bildirimi → doğrudan oda).

> Bunlar **uzak** bildirimlerdir. Maç günü / kadro / skor hatırlatmaları ise **yerel**
> bildirimdir (`src/notifications.js`), sunucu gerektirmez ve zaten çalışır.

## Nasıl çalışıyor

```
Uygulama (src/push.js)
  │  izin verildiyse FCM token alır
  └─► Supabase: register_push_token(device_id, token, platform)  → push_tokens tablosu
                                                                   (uygulama OKUYAMAZ)
Biri odaya katılır / MVP seçilir
  └─► Supabase Database Webhook ─► Edge Function "send-push"
                                      │ push_tokens'tan token'ı okur (service role)
                                      └─► Firebase Cloud Messaging (HTTP v1)
                                             ├─ Android → doğrudan
                                             └─ iPhone  → APNs üzerinden
```

**Neden önceden iPhone'a gitmiyordu?** Eski eklenti (`@capacitor/push-notifications`)
iPhone'da Firebase token'ı değil Apple (APNs) token'ı veriyordu; Firebase kampanyaları
bu yüzden iPhone'lara hiç ulaşmıyordu. Artık `@capacitor-firebase/messaging` kullanılıyor:
iPhone'da da Firebase token'ı alınıyor.

**Bildirim izni ne zaman isteniyor?** Açılışta **istenmiyor**. Kullanıcı haftalık maç
planı kurduğunda / ilk maçını kaydettiğinde uygulama içi kısa bir ekran çıkar
("Maç gününden önce hatırlatayım mı?"). "Evet" derse sistem izni sorulur ve token kaydedilir.

---

## Kontrol listesi (sırayla)

| # | Nerede | Ne yapılacak | Süre |
|---|--------|--------------|------|
| 1 | Apple Developer | App ID'de **Push Notifications** aç | 2 dk |
| 2 | Apple Developer → Firebase | **APNs anahtarı (.p8)** oluştur, Firebase'e yükle | 5 dk |
| 3 | Supabase | SQL'i çalıştır (`push_tokens` tablosu) | 1 dk |
| 4 | Firebase → Supabase | Servis hesabı JSON'u indir, Supabase'e gizli değişken olarak koy | 5 dk |
| 5 | Bilgisayar (terminal) | Edge Function'ı yayınla | 5 dk |
| 6 | Supabase | 2 Database Webhook oluştur | 5 dk |
| 7 | Codemagic | `ENABLE_PUSH: "true"` → yeni iOS build | 1 build |
| 8 | Android Studio | Android'de dene, yeni sürümü yayınla | — |

1–6 arası adımlar mevcut uygulamayı **bozmaz** (eski sürümler token kaydetmez, sadece
yeni sürüm kaydeder). iOS tarafını 7. adıma kadar açmadan da Android'i deneyebilirsin.

---

## 1. Apple: Push Notifications yetkisini aç

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles**
2. **Identifiers** → `com.halisahakolik.app` satırına tıkla
3. Listede **Push Notifications** kutusunu işaretle → sağ üstte **Save** → **Confirm**
   (Yanında "Configure" butonu çıkar — sertifika istemiyoruz, **dokunma**; 2. adımda anahtar kullanacağız.)
4. **Profiles** → `com.halisahakolik.app` için olan **App Store** profili artık
   "Invalid" görünebilir. Görünüyorsa profili **sil** — Codemagic bir sonraki build'de
   Push yetkili yenisini otomatik üretir.

## 2. APNs anahtarı (.p8) → Firebase

Firebase, iPhone'lara Apple üzerinden ulaşmak için bu anahtarı kullanır. **Tek anahtar
hem test hem App Store için yeter, süresi dolmaz.**

1. developer.apple.com → **Keys** → **+** (Create a key)
2. Key Name: `HaliSahaKolik APNs` → **Apple Push Notifications service (APNs)** kutusunu işaretle
   (Environment sorulursa **Sandbox & Production**) → **Continue** → **Register**
3. **Download** → `AuthKey_XXXXXXXXXX.p8` dosyası iner.
   ⚠️ Bu dosya **sadece bir kez** indirilebilir. Güvenli bir yere sakla, repoya koyma.
4. Sayfadaki **Key ID**'yi (10 karakter) not al. **Team ID**: `Q3BH6457BX`
5. https://console.firebase.google.com → **halisahakolik-7f135** projesi →
   ⚙️ **Project settings** → **Cloud Messaging** sekmesi
6. **Apple app configuration** → iOS uygulaması (`com.halisahakolik.app`) →
   **APNs Authentication Key** → **Upload** → `.p8` dosyası + Key ID + Team ID → **Upload**

> Aynı sayfada "Firebase Cloud Messaging API (V1)" **Enabled** görünmeli. Görünmüyorsa
> yanındaki ⋮ menüden Google Cloud Console'a gidip **Enable** de.

## 3. Supabase: token tablosunu kur

1. https://supabase.com/dashboard → projen (`mzryetwernvtqrvbhcxp`) → **SQL Editor** → **New query**
2. Repodaki `supabase/migrations/20261018_push_tokens.sql` dosyasının **tamamını** yapıştır → **Run**
3. "Success. No rows returned" görmelisin. **Table Editor**'da `push_tokens` tablosu çıkar.

Bu tablo **uygulamadan okunamaz** (RLS açık, kural yok). Uygulama sadece
`register_push_token` fonksiyonuyla kendi token'ını yazabilir.

## 4. Firebase servis hesabı → Supabase gizli değişkeni

Edge Function'ın Firebase adına bildirim gönderebilmesi için:

1. Firebase Console → ⚙️ **Project settings** → **Service accounts** sekmesi
2. **Generate new private key** → **Generate key** → `halisahakolik-7f135-xxxx.json` iner
   ⚠️ Bu dosya projenin anahtarıdır. **Repoya koyma, kimseyle paylaşma.**
3. Bir de webhook şifresi uydur (uzun, rastgele). Terminalde üretmek için:
   ```bash
   openssl rand -hex 32
   ```
   Çıkan metni not al — buna **WEBHOOK_SECRET** diyeceğiz.

Bu ikisini 5. adımda Supabase'e koyacağız.

## 5. Edge Function'ı yayınla (bilgisayardan, bir kez)

Gereken: Node.js yüklü bilgisayar. Proje klasöründe (`lineup-pro`) terminal aç:

```bash
# 1) Supabase CLI ile giriş (tarayıcı açılır, onayla)
npx supabase login

# 2) Projeyi bağla
npx supabase link --project-ref mzryetwernvtqrvbhcxp

# 3) Gizli değişkenler (JSON dosyasının yolunu kendi dosyanla değiştir)
#    JSON tek satır base64 olarak verilir (çok satırlı metin sorun çıkarmasın; fonksiyon çözer)
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(base64 < ~/Downloads/halisahakolik-7f135-xxxx.json | tr -d '\n')"
npx supabase secrets set WEBHOOK_SECRET="BURAYA_4_ADIMDAKI_RASTGELE_METIN"

# 4) Fonksiyonu yayınla (JWT kontrolü kapalı; koruma x-webhook-secret başlığıyla)
npx supabase functions deploy send-push --no-verify-jwt
```

> Windows'ta ya da komut hata verirse en kolayı: Dashboard → **Edge Functions** →
> **Secrets** → **Add new secret** → Name `FIREBASE_SERVICE_ACCOUNT`, Value: JSON
> dosyasını Not Defteri ile aç, **tüm içeriğini** yapıştır → Save. (`WEBHOOK_SECRET` de aynı yerden eklenebilir.)

`SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY`'i Supabase **kendisi** verir, eklemene gerek yok.

Yayın adresi:
`https://mzryetwernvtqrvbhcxp.supabase.co/functions/v1/send-push`

**Hızlı kontrol** (şifre yanlışsa 401 dönmeli):
```bash
curl -i -X POST https://mzryetwernvtqrvbhcxp.supabase.co/functions/v1/send-push \
  -H "Content-Type: application/json" -H "x-webhook-secret: yanlis" -d '{}'
```

## 6. Supabase: iki Database Webhook

Dashboard → **Database** → **Webhooks** (ilk seferde **Enable webhooks** butonu çıkarsa bas)
→ **Create a new hook**. İki tane oluşturacaksın:

### Webhook 1 — Odaya katılım

| Alan | Değer |
|------|-------|
| Name | `push_player_joined` |
| Table | `session_players` |
| Events | ✅ **Insert** (Update/Delete **işaretleme**) |
| Type of webhook | **HTTP Request** |
| Method | `POST` |
| URL | `https://mzryetwernvtqrvbhcxp.supabase.co/functions/v1/send-push` |
| Timeout | `5000` |
| HTTP Headers | `Content-Type` = `application/json` |
| | `x-webhook-secret` = *(4. adımdaki WEBHOOK_SECRET)* |
| HTTP Parameters | boş |

→ **Create webhook**

### Webhook 2 — MVP

| Alan | Değer |
|------|-------|
| Name | `push_mvp` |
| Table | `match_sessions` |
| Events | ✅ **Update** (sadece) |
| Type of webhook | **HTTP Request** |
| Method | `POST` |
| URL | `https://mzryetwernvtqrvbhcxp.supabase.co/functions/v1/send-push` |
| Timeout | `5000` |
| HTTP Headers | `Content-Type` = `application/json` |
| | `x-webhook-secret` = *(aynı WEBHOOK_SECRET)* |

→ **Create webhook**

> "Type of webhook" listesinde **Supabase Edge Functions** seçeneğini de kullanabilirsin
> (fonksiyon olarak `send-push`, method POST). O zaman da **x-webhook-secret** başlığını
> elle eklemeyi unutma.

Fonksiyon sadece **MVP değiştiğinde** bildirim yollar; skor/durum gibi diğer
güncellemelerde hiçbir şey göndermez (sadece kısa bir çağrı olur).

<details>
<summary>İsteğe bağlı: MVP webhook'unu sadece MVP değişince tetikle (SQL)</summary>

Dashboard webhook'u her `match_sessions` güncellemesinde çağrılır. Çağrı sayısını
azaltmak istersen Webhook 2'yi **oluşturma**, bunun yerine SQL Editor'de çalıştır
(`BURAYA_WEBHOOK_SECRET` kısmını değiştir):

```sql
create trigger push_mvp
after update of mvp_device_id on public.match_sessions
for each row
when (old.mvp_device_id is distinct from new.mvp_device_id and new.mvp_device_id is not null)
execute function supabase_functions.http_request(
  'https://mzryetwernvtqrvbhcxp.supabase.co/functions/v1/send-push',
  'POST',
  '{"Content-Type":"application/json","x-webhook-secret":"BURAYA_WEBHOOK_SECRET"}',
  '{}',
  '5000'
);
```
</details>

## 7. Codemagic: iOS'ta push'u aç

`codemagic.yaml` içinde:

```yaml
MARKETING_VERSION: "1.5"     # her store yüklemesinde artır
ENABLE_PUSH: "true"
```

Commit + push → Codemagic build. `ENABLE_PUSH: "true"` şunları yapar:

1. `@capacitor-firebase/messaging` iOS build'e girer (Firebase SDK, Swift Package Manager)
   — ilk build birkaç dakika uzun sürer.
2. `ios/App/App/GoogleService-Info.plist` uygulama paketine eklenir.
3. İmzaya `aps-environment = production` eklenir.

Build loglarında görmen gerekenler:
- **Sync Capacitor**: `CapacitorFirebaseMessaging` satırı
- **Detect provisioning profile**: `✅ Profil aps-environment içeriyor`
- **Generate entitlements**: `🔔 aps-environment = production`
- **Patch App target signing**: `✅ GoogleService-Info.plist → App target Resources`
- **Verify Info.plist in archive**: `aps-environment` ve `✅ GoogleService-Info.plist bundle'da`

`ENABLE_PUSH: "false"` (varsayılan) iken iOS build **bugünkü gibi** kalır: Firebase eklentisi
build'den çıkarılır, uzak bildirim kapalıdır, yerel hatırlatmalar çalışmaya devam eder.

## 8. Android'de dene (Android Studio)

`android/app/google-services.json` zaten var. Proje klasöründe:

```bash
npm install
CI=false npm run build
npx cap sync android
npx cap open android
```

1. Android Studio açılınca telefonu USB ile bağla (Geliştirici seçenekleri → USB hata ayıklama) → ▶ **Run**
2. Uygulamada haftalık maç planı kur (veya bir maç kaydet) → "Hatırlatayım mı?" → **Evet** → izin ver
3. Android Studio alttaki **Logcat** → arama: `FCM token` → `[push] FCM token: ....` satırındaki
   uzun metni kopyala
4. Firebase Console → **Messaging** → **New campaign** → **Notifications** → başlık + metin →
   sağda **Send test message** → token'ı yapıştır → **+** → **Test**
5. Uygulamayı arka plana al → bildirim gelmeli. Dokununca uygulama açılmalı.
6. Supabase **Table Editor** → `push_tokens`: telefonunun satırı (platform `android`) görünmeli.

**Sunucu bildirimini dene:** `push_tokens` tablosundan kendi `device_id`'ni kopyala:

```bash
curl -X POST https://mzryetwernvtqrvbhcxp.supabase.co/functions/v1/send-push \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: WEBHOOK_SECRET_DEGERIN" \
  -d '{"test":{"device_id":"BURAYA-DEVICE-ID","title":"Deneme ⚽","body":"Sunucudan merhaba","route":"stats"}}'
```

Cevapta `"sent":1` görmelisin. Gerçek akış: bir telefonda online oda kur, diğerinden katıl →
oda sahibine "… maça katıldı · 2/14" gelir.

Her şey çalışınca `android/app/build.gradle` → `versionCode` artır → Play Console'a yükle.

## 9. Firebase Console'dan herkese duyuru

1. Firebase Console → **Messaging** (Engage altında) → **New campaign** → **Notifications**
2. **Notification title** / **Notification text** yaz (ör. "Bu hafta maç var mı? ⚽")
3. **Target** → **User segment** → App: `com.halisahakolik.app` (**iOS**) → **and** →
   `com.halisahakolik.app` (**Android**) — ikisini de ekle
4. **Scheduling**: Now (veya saat seç)
5. **Additional options** (isteğe bağlı):
   - **Android Notification Channel**: `hk_push`
   - **Custom data** → dokununca açılacak ekran: anahtar `route`, değer aşağıdakilerden biri
6. **Review** → **Publish**

| `route` değeri | Dokununca açılan |
|----------------|------------------|
| `online` | Online maç |
| `attendance` | Bu hafta kim geliyor |
| `ai_split` | AI ile takım kur |
| `result` | Skor / maç sonucu |
| `stats` | İstatistik / sıralama |
| `squad` | Kadro |
| `schedule` | Haftalık maç planı |
| `kasa` | Kasa (saha ücreti) |

Ek anahtarlar: `kind` (analitikte görünen tür, ör. `duyuru`), `code` (ör. `HK-AB12` →
doğrudan o odaya katılım).

> Sadece **yeni sürümü yükleyip bildirim izni veren** kullanıcılara ulaşır. Eski sürümler
> (eski eklenti) iPhone'da zaten token üretmiyordu.

---

## Sorun giderme

| Belirti | Sebep / çözüm |
|---------|---------------|
| Codemagic: `Provisioning profile ... doesn't include the aps-environment entitlement` | 1. adım yapılmamış ya da eski profil duruyor → Profiles'tan eski App Store profilini sil, build'i tekrarla |
| Codemagic: `❌ ENABLE_PUSH=true ama provisioning profile'da aps-environment YOK` | Aynısı. Acil build lazımsa `ENABLE_PUSH: "false"` yap |
| iPhone'da token var ama bildirim gelmiyor | 2. adım: APNs anahtarı Firebase'e yüklenmemiş / Key ID-Team ID yanlış |
| `push_tokens` boş | Kullanıcı bildirim iznini vermemiş ya da 3. adımdaki SQL çalışmamış (uygulama logunda `PGRST202`) |
| Webhook çalışıyor ama bildirim yok | Dashboard → Edge Functions → `send-push` → **Logs**. `401` → başlıktaki şifre yanlış. `FIREBASE_SERVICE_ACCOUNT tanımlı değil` → 4–5. adım |
| Android'de bildirim ikonu beyaz kare | Yeni sürümde düzeldi (`res/drawable/ic_stat_icon.xml`) |
| iPhone'da uygulama açıkken de banner çıkıyor | Normal (iOS varsayılanı). Kapatmak istersen `capacitor.config.ts` → `plugins: { FirebaseMessaging: { presentationOptions: ["badge"] } }` |

## Dosyalar

- `src/push.js` — izin, token kaydı, bildirime dokununca yönlendirme
- `supabase/migrations/20261018_push_tokens.sql` — token tablosu + `register_push_token`
- `supabase/functions/send-push/index.ts` — FCM HTTP v1 gönderici (Edge Function)
- `ios/App/App/AppDelegate.swift` — APNs token'ını eklentiye iletir
- `ios/App/App/Info.plist` — `UIBackgroundModes: remote-notification`
- `codemagic.yaml` — `ENABLE_PUSH` bayrağı, entitlements üretimi, GoogleService-Info.plist
- `android/app/src/main/AndroidManifest.xml` — varsayılan ikon / renk / kanal (`hk_push`)
