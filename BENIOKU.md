# Mail — kişisel Gmail uygulaması

Gmail'e doğrudan tarayıcıdan bağlanan, iPhone ve Windows'a yüklenebilen kişisel mail uygulaması.
Arada sunucu yok; mailler sadece senin cihazında görüntülenir.

## Kurulum

1. `config.js` dosyasını aç, `CLIENT_ID: ''` kısmına Google Cloud'dan aldığın Client ID'yi yapıştır.
2. GitHub'da **mail** adında *Public* bir depo (repository) oluştur.
3. "uploading an existing file" bağlantısına tıkla, bu klasördeki tüm dosyaları (icons klasörü dahil) sürükleyip bırak, **Commit changes**.
4. Depoda **Settings → Pages** → Source: *Deploy from a branch*, Branch: *main*, klasör: */ (root)* → **Save**.
5. 1-2 dakika sonra uygulama `https://KULLANICIADIN.github.io/mail/` adresinde açılır.

Depo herkese açık olsa da içinde şifre ya da mail yok; Client ID gizli bir bilgi değildir
ve Google sadece senin test kullanıcısı olarak eklediğin hesabın giriş yapmasına izin verir.

## Cihazlara yükleme

- **iPhone:** Safari'de adresi aç → Paylaş → **Ana Ekrana Ekle**.
- **Windows:** Edge veya Chrome'da adresi aç → adres çubuğundaki **Uygulamayı yükle** simgesi.

## Önizleme

Adresin sonuna `?demo` eklersen (`.../mail/?demo`) Gmail'e bağlanmadan örnek verilerle açılır.

## Dosyalar

- `index.html`, `style.css`, `app.js` — uygulama
- `config.js` — Client ID ayarı
- `mock.js` — demo verileri
- `sw.js`, `manifest.webmanifest`, `icons/` — telefona/bilgisayara yüklenebilmesi için
