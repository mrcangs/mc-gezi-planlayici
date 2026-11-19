# Gezi Planlayıcı — oturum notları

Bu dosya, Claude Code ile yapılan çalışma oturumlarında neyin, neden ve nasıl yapıldığını kaydeder.
Yeni bir oturuma başlarken bu dosya okunur. Kod ayrıntıları için `README.md` ve `git log` kaynaktır.

---

## Yeni oturumu başlatmak için prompt

Aşağıdaki metni yeni bir Claude Code oturumunda (bu klasör açıkken) ilk mesaj olarak yapıştır:

```text
mc-gezi-planlayici projesinde kaldığımız yerden devam ediyoruz.
Önce şunları oku ve kısaca özetle:
1. docs/OTURUM-NOTLARI.md (özellikle "Açık işler" ve "Bilinen sınırlar")
2. README.md
3. git log --oneline -15 ve git status
Sonra bana:
- son durumun 5 maddelik özetini,
- "Açık işler" listesinden hâlâ açık olanları,
- benim yapmam gereken (Firebase Console vb.) bekleyen adımları
söyle ve ne yapmak istediğimi sor.
Kurallar: Türkçe konuş. Bitip test edilen işi sormadan commit'le ve main'e push et (push = canlı site).
Veritabanı kuralları değişirse Firebase Console'da Publish etmemi hatırlat.
Oturum sonunda docs/OTURUM-NOTLARI.md dosyasına yeni bir bölüm ekle.
```

---

## Proje özeti

- **Ne:** Ekipçe gezi planı. İçinde mekan havuzu, gün gün program, oylama, hazırlık listesi, sohbet ve gezi sonrası puanlama var.
- **Nerede:**
  - Site: https://mrcangs.github.io/mc-gezi-planlayici/ (GitHub Pages, `main` dalından)
  - Repo: github.com/mrcangs/mc-gezi-planlayici (herkese açık)
  - Firebase projesi: `mc-gezi-planlayici`; Realtime Database bölgesi `europe-west1`. Google girişi açık.
- **Yapı:** Build adımı yok. Statik HTML ve JS; Tailwind, Font Awesome ve Firebase compat SDK CDN'den yükleniyor.
- **Dosyalar:**

  | Dosya | İçerik |
  |---|---|
  | `index.html` | Tüm ekranların iskeleti ve stiller |
  | `js/config.js` | Firebase web yapılandırması ve `YOUTUBE_API_KEY` |
  | `js/i18n.js` | Arayüz metinleri (tr / es) |
  | `js/core.js` | `App`: Firebase, giriş, yönlendirme (`#/…`), ortak yardımcılar, avatar ve fotoğraf |
  | `js/places.js` | `Places`: ülke ve şehir verisi, yazarak filtrelenen açılır liste |
  | `js/ai.js` | `AI`: Claude istekleri, anahtar kasası, kullanım ve limit, YouTube verisi, anahtar paneli, rozet |
  | `js/home.js` | Planlarım, yeni plan formu, davetle katılma, anahtar kutusu |
  | `js/trip.js` | Plan ekranı (program, havuz, kararlar, hazırlık, sohbet, değerlendirme, AI penceresi) |
  | `js/admin.js` | Yönetim sayfası (plan hakkı, Barselona içe aktarma) |
  | `database.rules.json` | Realtime Database güvenlik kuralları. Değişince Console'da **Publish** gerekir. |
  | `data/` | `countries.json` ve `cities/<ISO>.json` (GeoNames cities1000, CC BY 4.0) |
  | `tools/build-cities.ps1` | Şehir verisini GeoNames dosyalarından üreten PowerShell betiği |

---

## Oturum 1 — 2026-11-17 (önceki oturum, konuşma geçmişi kayıp)

Git geçmişinden çıkarılanlar:
- `de39eae` **Faz 1-2:**
  - Google girişi, Planlarım, plan hakkı (allowlist + limit), Yönetim sayfası
  - Davet linkiyle katılma; plandaki kişi seçimi hesaba kalıcı bağlanıyor
  - Barselona planı veri güdümlü hale getirildi ve eski siteden içe aktarılabiliyor
  - Bilet dosyaları `trip_files` altında
- `99d3da0` Firebase yapılandırması eklendi.

---

## Oturum 2 — 2026-11-18

### Kurulum ve süreç
- Firebase kurulumu tamamlandı. Kullanıcı `admins/<uid>: true` kaydını Console'dan ekledi; Yönetim düğmesi görünüyor ve kendi e-postasına plan hakkı verildi.
- Claude Code hafızası kuruldu (proje durumu, dil, commit kuralı).
- **Çalışma kuralı (kullanıcı kararı):** Bitip test edilen işler sormadan commit'lenip `main`'e push ediliyor. Push, canlı siteyi yaklaşık 30 saniyede günceller.
- **Barselona planı:** Henüz içe aktarılmadı. Ekipteki herkesin review etmesi bekleniyor; kullanıcı kendisi başlatacak.
- Kullanıcı ilk boş planı açtı ve şablonu "tam istediğimiz gibi" buldu.

### Yapılanlar (commit sırasıyla)

#### `354aaf6` Ülke/şehir seçimi, Google fotoğrafları, AI önerileri (ilk sürüm)
- **Yeni plan formu:**
  - Önce ülke, sonra o ülkenin şehirleri; ikisi de yazarak filtreleniyor (aksan ve Türkçe karakter duyarsız). Klavyeyle seçilebiliyor.
  - Listede olmayan yer yazılan adla kullanılabiliyor.
  - Veri: GeoNames cities1000; 252 ülke, yaklaşık 160 bin şehir. Ülke başına ayrı dosya, ülke seçilince indiriliyor (en büyüğü US.json ≈ 280 KB, sıkıştırılmış ≈ 80 KB).
  - Ülke adları `Intl.DisplayNames` ile Türkçe. Türkçe adı farklı şehirler (Münih, Floransa, İstanbul…) Türkçe görünüyor.
  - Planda `city`, `country`, `countryCode`, `cityLocal` (yerel ad) tutuluyor.
- **Google fotoğrafı:**
  - Avatarlarda kişiyi seçen hesabın fotoğrafı gösteriliyor (`trips/<id>/members/<uid>/photo`). Fotoğraf yoksa ya da yüklenemezse renkli baş harf görünüyor.
  - Yalnızca `googleusercontent.com` adresleri kabul ediliyor (istemcide ve kurallarda).
- **AI önerileri (ilk hali):** Mekan önerisi ve pratik bilgiler; sonuçlar önizlenip seçilerek ekleniyor.

#### Aynı commit içinde ek istekler
- Anahtarı olmayanlar için **Anahtar sayfasına git** düğmesi ve 4 adımlı **"Anahtarım yok, nasıl alırım?"** rehberi: Console'a gir → kredi yükle → anahtar oluştur → yapıştır. Ayrıca harcama limiti linki var.
- Aylık kullanım limiti seçimi: 50k / 150k (varsayılan) / 500k token / sınırsız.
- Başlıktaki hesap fotoğrafı yüklenemezse baş harfe dönüyor.

#### `62d99aa` Anahtar hesapta şifreli, kullanım hesaba bağlı, video/link sekmesi
- **Mimari kararı:**
  - Seçenekler: (1) sunucu, yani Firebase Functions (Blaze plan, Node.js, `firebase login` gerektirir); (2) sunucusuz, parola ile şifreleme; (3) sunucusuz, otomatik şifreleme.
  - Kullanıcı **sunucusuz, parola ile** seçti. Not: önceki oturumda sunucuya ihtiyaç olduğu söylenmemişti; kullanıcı bunu sordu ve düzeltildi.
- **Anahtar kasası (`users/<uid>/ai/key`):**
  - Anahtar önce Anthropic'e sorularak deneniyor (`models.retrieve`).
  - Sonra tarayıcıda kullanıcının parolasıyla şifreleniyor: PBKDF2-SHA256 600 bin tur, ardından AES-GCM 256. Ek veri (AAD) hesap kimliği; başka hesaba taşınan kayıt çözülemez.
  - Veritabanında yalnızca `{v, ct, iv, salt, it, hint(son 4), at}` duruyor. Parolasız kimse (yöneticiler dahil) çözemez.
  - "Bu cihazda hatırla": türetilen anahtar, dışarı aktarılamaz bir `CryptoKey` olarak IndexedDB'de (`gp-vault`) tutuluyor; yeni cihazda parola bir kez soruluyor.
  - Düğmeler: Dene / Anahtarı değiştir / Bu cihazda kilitle / Sil / Parolamı unuttum (anahtarı siler, yeniden girilir).
  - Eski sürümde `localStorage`'da duran düz anahtar varsa yalnızca parola soruluyor ve anahtar hesaba taşınıyor.
- **Kullanım (`users/<uid>/ai/usage/<YYYY-MM>`)** ve **limit (`users/<uid>/ai/limit`):**
  - Hesaba bağlı ve tüm cihazlarda ortak. Transaction ile toplanıyor.
  - Başlıkta her sayfada rozet var (ör. "41k / 150k"): %80'de turuncu, dolunca kırmızı. Plan ekranında rozete basınca AI penceresi açılıyor.
  - Fiyat (Opus 5.5): 1M token başına giriş 4 $, çıkış 20 $; web araması 1000'i 10 $.
- **YouTube:** Kapak resmi ve başlık önizlemesi (oEmbed, tarayıcıdan çağrılabiliyor).

#### `ec18f52` Mekan girdi kanalları, web'den doğrulama, rezervasyon görevleri
- **Kullanıcının tanımladığı girdi kanalları:**
  1. Elle giriş → "Kendi önerin" formu + **AI ile tamamla** (kayıt hemen, bilgiler arka planda).
  2. Serbest liste → AI doğrudan dönüştürüyor (web araması yok).
  3. YouTube linki → başlık, açıklama, bölümler ve en beğenilen 100 yorum (YouTube Data API ile).
  4. Instagram linki → hesap açıksa video/reels ve yorumlar istendi. Gerçekte mümkün olan aşağıdaki "Bilinen sınırlar" bölümünde.
- **Ekran görüntüsü:** En fazla 8 tane; en uzun kenar 1568 px'e küçültülüp JPEG olarak Claude'a görsel bloğu halinde gidiyor.
- **Web'den doğrulama** (varsayılan açık, mekan başı yaklaşık 0,05 $):
  - Seçilen mekanlar için resmi site, adres, bilgi satırı, rezervasyon gerekip gerekmediği, rezervasyon linki ve not aranıyor.
  - İki adımda yapılıyor: önce `web_search` / `web_fetch` ile serbest metin notları, sonra şemaya dönüştürme. Mekanlar 8'erli gruplar halinde işleniyor.
  - Hata olursa seçimler korunuyor ve "Doğrulamadan ekle" seçeneği çıkıyor.
- **Rezervasyon görevleri:** Rezervasyon gerekenler `trips/<id>/tasks/<id>` altına `{text, url, note, actName, by, at}` olarak yazılıyor ve **Hazırlık → Rezervasyonlar**'da görünüyor. İşaretlenebiliyor (`checklist/task_<id>`), ekleyen ya da plan sahibi silebiliyor. Aynı mekana ikinci görev açılmıyor.
- **Kart alanları:** `info` (bilgi satırı), `addr`, `url`, `res`, `resUrl`, `resNote`, `ai`. Kartta Web sitesi / Rezervasyon / Harita düğmeleri var; harita linki ad ve adresle Google Maps'te arıyor.

#### `aedfeca` YouTube Data API anahtarı eklendi
- Anahtar Google Cloud'da "Gezi Planlayıcı - YouTube" adıyla oluşturuldu ve `js/config.js` içinde duruyor.
- **Kısıtlar (doğrulandı):**
  - Websites: `https://mrcangs.github.io/*`, `http://localhost:8000/*`. Başka siteden ya da referer olmadan gelen istek reddediliyor.
  - API: yalnızca YouTube Data API v3. Firebase Auth API'si bu anahtarla "blocked" dönüyor.
- **GitHub secret scanning:** İki "Google API Key" uyarısı (#1 Firebase web anahtarı, #2 YouTube anahtarı) "won't fix" olarak kapatıldı. Neden: tarayıcıda çalışan statik sitede bu anahtarların açık olması gerekiyor; ikisi de kısıtlı ya da kurallarla korunuyor.

### AI mimarisi (özet)
- **İstek yolu:** İstekler tarayıcıdan doğrudan Anthropic'e gidiyor. SDK `@anthropic-ai/sdk@1.10.0` jsDelivr'dan dinamik import ile yükleniyor (`dangerouslyAllowBrowser: true`); bu SDK anahtarı `Authorization: Bearer` başlığıyla gönderiyor.
- **İstek ayarları:**
  - Model `claude-opus-5-5`; `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`.
  - Yanıt akışla alınıyor; `pause_turn` gelirse 4 tura kadar devam ettiriliyor.
  - Yapılandırılmış çıktı: `output_config.format` (JSON şeması). Araçlı isteklerde şema kullanılmıyor; araçlı adım serbest metin, ardından düşük effort ile şemaya dönüştürme.
- **Sekmeler:**
  - **Öner:** mekan önerisi.
  - **Liste / link:** liste, YouTube, Instagram, web, ekran görüntüsü.
  - **Pratik:** pratik bilgiler; yalnızca plan sahibi.
- **Nereye yazılıyor:** Plan sahibinin seçtikleri `def/pool` ve `def/practical`'a, diğer üyelerinkiler `custom_activities`'e ("Ekip önerisi") yazılıyor.
- **Güvenlik:** Modelden gelen her alan süzülüyor: ikon izin listesi, kategori izin listesi, yalnızca https linkler, uzunluk sınırları. Kaynaktaki talimatlara uyulmaması sistem isteminde belirtiliyor.

### Veritabanı kuralları (bu oturumda eklenenler)
- `trips/$t/members/$uid/photo`: string, https, `googleusercontent.com` içermeli, ≤ 520 karakter.
- `users/$uid/ai`: yalnızca hesap sahibi yazabilir.
  - `key`: `v`, `ct`, `iv`, `salt`, `it` alanları zorunlu.
  - `limit`: yalnızca 0 / 50k / 150k / 500k.
  - `usage/$m`: `YYYY-MM` biçiminde.
  - `$other` yasak.
- `trips/$t/tasks/$id`: üyeler yazabilir; `text` ≤ 160 karakter, `url` http(s), `note` ≤ 200, `actName` ≤ 80.
- `custom_activities/$id`: `url`, `resUrl`, `addr`, `info`, `resNote`, `res`, `ai` alanları doğrulanıyor.

### Test yöntemi
- Bu makinede Python ve Node yok; betikler PowerShell ile yazılıyor.
- Testler başsız Chrome ile çalışıyor:
  - Sahte Firebase (bellekte, `transaction` / `remove` dahil) ve sahte Anthropic model uç noktası kullanılıyor.
  - Test sayfası sonucu yerel sunucuya POST ediyor (`/__result`).
  - **`--virtual-time-budget` kullanılmamalı:** PBKDF2 gerçek zamanda çalıştığı için sanal saatle yarışıyor. Gerçek zamanlı çalıştırılıp sonuç dosyası bekleniyor.
- Son durum: birim testlerinde 60 ve ekran senaryosunda 73 test, hepsi geçti.
- Test dosyaları oturumun geçici klasöründeydi (repoda yok). Gerekirse `tools/` altına taşınabilir.

---

## Oturum 2 devamı — 2026-11-19

- Kullanıcı Barselona içe aktarmasını denedi. 1. adım geçti (58 mekan, 6 gün, 4 kişi); 2. adım "HATA: eski veritabanı 400" verdi.
- **Neden:** Kutuya eski sitenin tam davet linki yapıştırılmıştı. Yol `trips/https…#t=…` olunca Firebase "Invalid path" ile 400 dönüyor. Input'taki `pattern="[A-Za-z0-9_-]{20,}"` yeni tarayıcılarda (`v` bayrağıyla) geçersiz sayılıp yok sayıldığı için bunu engellemedi.
- **Düzeltme (`b89f086`):**
  - Kutu artık hem anahtarı hem tam linki kabul ediyor; anahtar linkin içinden (`#t=…`) çıkarılıyor.
  - Pattern kaldırıldı.
  - Hata olursa Firebase'in mesajı da günlükte gösteriliyor.
- İçe aktarma 2. adımda durduğu için veritabanına hiçbir şey yazılmamıştı; plan hakkı da harcanmadı.
- Not: Başka input'lara `pattern` eklenirse `-` karakteri sınıfın içinde `\-` diye kaçışlanmalı.

---

## Bilinen sınırlar
- Claude **videoyu izleyemez ve sesini işleyemez.** YouTube'da yalnızca başlık, açıklama, bölümler, yorumlar ve web araması kullanılabiliyor. Videoda sadece konuşulan mekanlar, ekran görüntüsü eklenmedikçe bulunamaz.
- **Instagram:** Giriş yapmadan gönderi ve yorumlar genelde açılmıyor; resmi API başkasının gönderisini okumaya izin vermiyor. Çözüm ekran görüntüsü yüklemek; arayüz Instagram linki görünce bunu öneriyor.
- **Kullanım sayacı:** Tarayıcıda sayılıyor; hesaba bağlı ama istemci tarafında. Kesin üst sınır için Claude Console'daki harcama limiti önerilir.
- **YouTube anahtarı:** Referer taklidiyle başkası kullanıp günlük ücretsiz kotayı tüketebilir. Ücret çıkmaz; o gün yorumlar okunamaz.
- **Uçtan uca deneme:** Gerçek bir Claude anahtarıyla henüz denenmedi. İlk denemede hata çıkarsa ekrandaki mesaj ve ekran görüntüsüyle bakılmalı.

## Açık işler / kullanıcının yapacakları
- [ ] **Firebase Console → Realtime Database → Rules:** `database.rules.json`'un son halini yapıştırıp **Publish** et. Bu oturumdaki tüm kural değişiklikleri buna bağlı (anahtar kaydı, görevler, fotoğraf).
- [ ] Claude API anahtarını ana sayfadan bir parolayla kaydet ve ilk gerçek denemeyi yap (Öner, Liste / link + YouTube, ekran görüntüsü, doğrulama).
- [ ] Barselona planını içe aktar. Kullanıcı 2026-11-19'da başlattı; 400 hatası düzeltildi (b89f086), yeniden denenecek.
- [ ] "Faz 3" kapsamı henüz tanımlanmadı.

## Kararlar özeti
| Konu | Karar |
|---|---|
| Commit / push | Bitip test edilen iş sormadan commit + push |
| AI anahtarı | Herkes kendi anahtarını kullanır; parola ile şifreli, hesapta |
| Sunucu | Kurulmadı (sunucusuz kalındı) |
| Model | `claude-opus-5-5` |
| Kullanım limiti | Hesaba bağlı; varsayılan 150k token / ay |
| Instagram | Link denenir, asıl yol ekran görüntüsü |
| YouTube yorumları | YouTube Data API v3 anahtarı (kısıtlı) |
| GitHub secret uyarıları | "won't fix" (kasıtlı olarak açık anahtarlar) |
