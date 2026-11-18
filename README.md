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

## Yeni plan: ülke ve şehir
Yeni plan formunda önce ülke, sonra şehir seçilir. İki alan da yazarak filtrelenir.
- Veri `data/countries.json` ve ülke başına `data/cities/<ISO>.json` dosyalarındadır. Şehir dosyası ancak ülke seçilince indirilir.
- Kaynak: [GeoNames](https://www.geonames.org/) `cities1000` (nüfusu 1000'i geçen yerleşimler, CC BY 4.0). Ülke adları tarayıcının dil desteğiyle Türkçe gösterilir.
- Türkçede farklı adı olan bazı şehirler (Münih, Floransa, Viyana…) Türkçe adıyla görünür. Aramada yerel ad da eşleşir.
- Listede olmayan bir yer yazılan adla kullanılabilir.
- Veriyi yenilemek için GeoNames dosyalarını indir ve `tools/build-cities.ps1 -Raw <klasör> -Out data` komutunu çalıştır.

## AI önerileri (Claude)
Plan ekranındaki **AI** penceresinin üç sekmesi var:
- **Öner:** Claude bu gezi için mekan ve aktivite önerir. İsteğe bağlı olarak ne aradığınız yazılabilir.
- **Video / link:** YouTube videosu, blog linki ya da yapıştırılan bir metinden mekanları çıkarır. Claude videoyu izleyemez. Sayfadaki başlığı, açıklamayı ve bölüm başlıklarını okur (`web_fetch`), gerekirse web'de arar (`web_search`). Sonra bulduklarını havuz biçimine dönüştürür. YouTube linklerinde kapak resmi ve başlık önizlenir.
- **Pratik:** Ulaşım, para, güvenlik gibi konularda 8–12 madde hazırlar. Yalnızca plan sahibine açıktır.

Gelen önerilerden istenenler işaretlenip havuza eklenir. Plan sahibininkiler havuza, diğer üyelerinkiler "Ekip önerisi" olarak eklenir. AI'dan gelen kartlarda küçük bir **AI** etiketi bulunur.

**Anahtar (herkes kendi anahtarını kullanır):**
- Anahtar ana sayfadaki **Claude API anahtarı** kutusuna ya da AI penceresine bir parolayla birlikte girilir.
- Önce Anthropic'e sorularak denenir. Sonra tarayıcıda parolayla şifrelenir ve `users/<uid>/ai/key` altına yalnızca şifreli hali yazılır. Şifreleme: PBKDF2-SHA256 (600 bin tur) ile AES-GCM 256; hesap kimliği ek veri olarak bağlanır.
- Parolayı bilmeyen (yöneticiler dahil) anahtarı çözemez.
- Yeni bir cihazda parola bir kez sorulur. "Bu cihazda hatırla" seçiliyse parolatan türetilen anahtar, dışarı aktarılamaz biçimde IndexedDB'de tutulur. Ortak bilgisayarda **Bu cihazda kilitle** kullanılmalı.
- Parola unutulursa anahtar silinip yeniden girilir.
- Anahtarı olmayanlar için **Anahtar sayfasına git** düğmesi ve 4 adımlı **"Anahtarım yok, nasıl alırım?"** rehberi var.

**Kullanım ve limit (hesaba bağlı):**
- Her yanıttan sonra token ve yaklaşık $ `users/<uid>/ai/usage/<YYYY-MM>` altına yazılır (web araması dahil). Bu, tüm cihazlarda ortak tutulur.
- Kullanım her sayfanın başlığında görünür (ör. "41k / 150k"). Limite yaklaşınca turuncu, dolunca kırmızı olur.
- Aylık limit 50k, 150k (varsayılan), 500k ya da sınırsız olabilir. Limit dolunca yeni istek gönderilmez.
- Sayım tarayıcıda yapılır. Kesin üst sınır için Console'daki harcama limiti önerilir.

İstekler tarayıcıdan doğrudan Anthropic API'sine gider. Model `claude-opus-5-5`'tir. Yanıtlar JSON şemasıyla alınır ve arayüze girmeden önce süzülür.
- **Plan sahibi:** seçtiği öneriler mekan havuzuna eklenir ve pratik bilgileri plana kaydedebilir.
- **Diğer üyeler:** seçtikleri öneriler havuza "Ekip önerisi" olarak eklenir.
- AI'dan gelen kartlarda küçük bir **AI** etiketi bulunur.

## Profil fotoğrafları
Plana katılan herkesin Google profil fotoğrafı üyelik kaydına (`trips/<id>/members/<uid>/photo`) yazılır ve avatarlarda gösterilir. Fotoğraf yoksa ya da yüklenemezse renkli baş harf görünür. Yalnızca `googleusercontent.com` adresleri kabul edilir.

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
- Claude API anahtarları veritabanında yalnızca kullanıcının parolasıyla şifreli durur; repoya hiç girmez. `users/<uid>/ai` altına yalnızca o hesap yazabilir.
- `database.rules.json` değiştiğinde Firebase Console → Realtime Database → **Rules** sekmesine yeniden yapıştırıp **Publish** et.
