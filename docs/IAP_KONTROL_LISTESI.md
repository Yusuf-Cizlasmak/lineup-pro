# App Store satın alma — kontrol listesi

Uygulama tarafındaki hatalar bu sürümde düzeltildi (bkz. "Kodda düzeltilenler"). Satın alma
hâlâ başarısız oluyorsa sebep neredeyse her zaman **App Store Connect / RevenueCat ayarlarıdır**.
Önce uygulamadaki tanılama raporuna bak, sonra aşağıdaki listeyi sırayla kontrol et.

## 1. Önce tanılama raporu (Mac gerekmez)

1. TestFlight sürümünde Pro ekranını aç, bir plan seç.
2. Hata kutusu çıkarsa altındaki **"Tanılama raporu"** butonuna dokun.
3. Rapor şunları gösterir: SDK hazır mı, `canMakePayments`, current offering, paketler ve
   fiyatları, hata kodu (`RC#11` gibi) ve çözüm önerileri. **Kopyala** ile alıp saklayabilirsin.

Hata kutusundaki küçük gri satır (`RC#23 · …`) RevenueCat'in gerçek hata kodudur:

| Kod | Anlamı | Nereye bakılır |
|-----|--------|----------------|
| `RC#11`, `RC#17`, `RC#23` | Kimlik bilgisi / yapılandırma eksik | Madde 3 (RevenueCat) |
| `RC#5` | Ürün satışa açık değil | Madde 2 (abonelik durumu, fiyat) |
| `RC#3` | Cihazda satın alma kısıtlı | iPhone: Ayarlar → Ekran Süresi → İçerik ve Gizlilik Kısıtlamaları |
| "Ürünler yüklenemedi" / paket yok | Offering boş | Madde 2 ve 3 |

## 2. App Store Connect

- [ ] **İş (Business) → Sözleşmeler**: *Ücretli Uygulamalar Sözleşmesi (Paid Apps Agreement)*
      **Etkin** olmalı. Banka hesabı ve vergi formları tamamlanmadan App Store hiçbir ürün
      döndürmez — en sık sebep budur.
- [ ] **Uygulama → Abonelikler**: bir abonelik grubu içinde aylık ve yıllık ürün var.
  - Her ürünün **Türkiye fiyatı**, yerelleştirmesi (görünen ad + açıklama) ve
    inceleme ekran görüntüsü girilmiş.
  - Durum **"Gönderilmeye Hazır" (Ready to Submit)** veya **"Onaylandı"**.
    "Meta Veri Eksik" ise ürün hiç gelmez.
- [ ] **İlk abonelikler sürümle birlikte gönderilmeli**: Sürüm sayfası → *Uygulama İçi Satın
      Alımlar ve Abonelikler* bölümünden ürünleri seçip sürümle birlikte incelemeye gönder.
      Onaylanana kadar canlı App Store'da satın alma çalışmaz (TestFlight/sandbox çalışır).
- [ ] 7 günlük deneme: yıllık ürüne **Tanıtım Teklifi → Ücretsiz, 1 hafta** eklenmiş olmalı
      (uygulamadaki "7 gün ücretsiz" butonu yıllık paketi satın alır).

## 3. RevenueCat

- [ ] **Apps → iOS uygulaması**: Bundle ID `com.halisahakolik.app`.
- [ ] **In-App Purchase Key (.p8)** yüklü (App Store Connect → Kullanıcılar ve Erişim →
      Entegrasyonlar → Uygulama İçi Satın Alma). StoreKit 2 ile bu anahtar olmadan satın
      alma doğrulanamaz → `RC#11`/`RC#23`.
- [ ] **Products**: App Store ürün ID'leri App Store Connect'tekiyle birebir aynı ve
      **`pro`** entitlement'ına bağlı.
- [ ] **Offerings**: `default` offering **Current** olarak işaretli; içinde `$rc_monthly` ve
      `$rc_annual` paketleri var. (Kod artık custom paket adlarını da tip üzerinden bulur, ama
      standart adlar önerilir.)

## 4. Test

- TestFlight sürümleri otomatik olarak **sandbox** kullanır, gerçek para çekilmez.
- Değişikliklerden sonra App Store tarafının yayılması 15–60 dk sürebilir.
- Satın alma başarılı olunca Pro anında açılır; olmazsa "Satın alımları geri yükle".

## 5. App Review için

- Paywall'da otomatik yenileme açıklaması ve **Kullanım Koşulları** linki artık var.
- `src/PaywallScreen.jsx` → `PRIVACY_URL` sabitine App Store Connect'te girdiğin gizlilik
  politikası adresini yaz. Boşken link gösterilmez ve Apple 3.1.2 gerekçesiyle reddedebilir.
- Fiyatlar artık App Store'dan geliyor. Mağaza ulaşılamazsa gösterilen varsayılanlar
  `FALLBACK_PRICES` içinde — App Store Connect'teki fiyatlarla aynı tut.

## Kodda düzeltilenler

- SDK `configure` başarılı olduğu hâlde `getCustomerInfo` hata verirse SDK "hazır değil"
  sayılıyordu → iPhone'da her satın alma "sadece mobil cihazda aktif" hatasıyla reddediliyordu.
- Paywall, açılıştaki init bitmeden açılırsa aynı hata çıkıyordu; artık init beklenip tekrar deneniyor.
- İlk boş offering cevabı uygulama kapanana kadar cache'te kalıyordu; artık boş sonuç cache'lenmiyor.
- Paket yalnızca `$rc_monthly`/`$rc_annual` adıyla aranıyordu; artık paket tipi ve ürün ID'si
  üzerinden de bulunuyor.
- iPhone'a Google Play mesajları gösteriliyordu; hata mesajları platforma göre ayrıldı,
  "zaten abonesin" durumunda otomatik geri yükleme yapılıyor.
