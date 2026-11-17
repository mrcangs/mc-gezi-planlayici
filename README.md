# Gezi Planlayıcı

Ekipçe gezi planı: mekan havuzu, gün gün program, oylama, hazırlık listesi, sohbet ve gezi sonrası değerlendirme.
Statik site (GitHub Pages) + Firebase Realtime Database + Google girişi. Build adımı yok.

## Nasıl çalışır
- Herkes Google hesabıyla girer. Plan açabilecek kişiler ve kaç plan açabilecekleri **Yönetim** sayfasından belirlenir.
- Plan açan kişi plan içinden **Davet linki**ni paylaşır. Linki açan kişi plana üye olur ve kendini kişi listesinden seçer.
- Bu seçim hesabına bağlanır ve sonradan değiştirilemez.
- Plan içeriği (kişiler, günler, slotlar, havuz, listeler…) `trips/<id>/def` altında durur. Oylar, sohbet ve puanlar gibi canlı veriler yanındaki düğümlerde tutulur.
- Bilet dosyaları `trip_files/<id>` altında durur ve sadece açılınca indirilir.

## Kurulum (bir kez)
1. [Firebase Console](https://console.firebase.google.com/) → **Proje ekle**. Analytics gerekmez.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**.
3. Aynı sayfada **Settings → Authorized domains → Add domain** ile `mrcangs.github.io` ekle.
4. **Build → Realtime Database → Create database**. Bölge olarak `europe-west1` seç, **locked mode** ile başlat.
5. **Rules** sekmesine `database.rules.json` içeriğini yapıştır ve **Publish** et.
6. **Proje ayarları (⚙) → Genel → Uygulamalarınız → Web (</>)** ile bir uygulama kaydet. Gösterilen `firebaseConfig` değerlerini `js/config.js`'e yaz.
7. Siteyi aç ve Google ile gir. Ana sayfanın altındaki **Hesap kimliğin** değerini kopyala.
8. Realtime Database → **Data** sekmesinde `admins` altına bu kimliği ekle, değeri `true` olsun. Örnek: `admins/AbC123…: true`.
9. Sayfayı yenile. Sağ üstte **Yönetim** butonu görünür. Oradan kendi e-postanı ve plan hakkını ekle.

## Barselona planını içe aktarma
Yönetim sayfasındaki **Barselona planını içe aktar** bölümüne eski sitenin davet anahtarını yapıştır.

Bu işlem eski sitenin içeriğini ve eski veritabanındaki canlı verileri yeni plana kopyalar:
- havuz, günler, listeler;
- oylar, sohbet, puanlar;
- bilet dosyaları.

Eski site ve veritabanı değişmez. İçe aktarılan plan, plan hakkından bir tane kullanır.

## Lokal deneme
`python -m http.server 8000` ile `http://localhost:8000` adresinde aç. Firebase'de `localhost` yetkili domainler arasında varsayılan olarak bulunur.

## Güvenlik notları
- Firebase web yapılandırmasının repoda görünmesi normaldir. Güvenliği `database.rules.json` sağlar.
- Kurallar şunları garanti eder:
  - Üye olmayan bir planın hiçbir verisini okuyamaz.
  - Davet kodu olmadan bir plana üye olunamaz.
  - Bir kişi başka bir hesap tarafından seçilmişse alınamaz.
  - Plan sayısı allowlist'teki limitle sınırlıdır; sayaç yalnızca birer artar.
- Bilet PDF'leri ve kişisel bilgiler repoya değil, yalnızca veritabanına girer.
