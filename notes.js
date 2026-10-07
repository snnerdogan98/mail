/* Güncelleme notları: sol alttaki sürüm numarasına tıklayınca açılır,
   yeni bir sürüm yüklendiğinde de ilk açılışta bir kez gösterilir. */
'use strict';

const CHANGELOG = [
  { v: 'V0.5', date: '7 Ekim 2026', items: [
    ['Yeni mail bildirimi', 'Program açıkken (küçültülmüş olsa da) yeni mail gelince köşede bildirim; tıklayınca mail açılır. Programa bakarken küçük bir uyarı çıkar. Okunmamış sayısı pencere başlığında ve destekleyen sistemlerde simgede. Ayarlar → Bildirimler.'],
    ['Toplu seçim', 'Satırın solundaki yuvarlağa tıkla (Shift ile aralık seç, X tuşu) ya da telefonda maile basılı tut. Seçilenleri tek seferde arşivle, sil, okundu/okunmadı yap, etiketle ya da spam\'e taşı; hepsi geri alınabilir.'],
    ['Mail Yönetici', 'Programın sahibi için ayrı bir yönetici programı (ana ekrana ya da bilgisayara ayrı simgeyle eklenir). Programı kimlerin kullanabileceğini belirler: herkes, sadece izin verdiklerin ya da engellediklerin hariç herkes. Google girişi + yönetici şifresiyle korunur. Kimsenin mailine dokunulmaz; izni olmayan sadece bu programı açamaz. Sen açana kadar kapalıdır.'],
    ['Zamanlayıcı sürüm 4', 'Google zamanlayıcısına şifre korumalı erişim listesi servisi eklendi (Mail Yönetici için).']
  ]},
  { v: 'V0.4', date: '7 Ekim 2026', items: [
    ['Sahte mail uyarısı', 'Banka, kurum ya da mağaza adıyla gelip adresi o kuruma ait olmayan, Gmail doğrulamasından geçemeyen ya da aldatıcı link içeren maillerde kırmızı uyarı; listede ⚠ işareti. Ayrıntılar gizlenince belirgin bir şerit olarak kalır. "Spam olarak işaretle" ve "Bu gönderen güvenli" düğmeleri.'],
    ['Takip pikseli engelleme', 'Kampanya maillerindeki görünmez takip resimleri silinir; gönderen maili açtığını ve nereden açtığını öğrenemez. İstersen tüm resimleri gizli yükleyebilirsin (Ayarlar → Gizlilik).'],
    ['Ertele', 'Bir maili Bugün daha sonra, Bu akşam, Yarın sabah, Hafta sonu, Gelecek hafta ya da istediğin zamana ertele. Zamanı gelince gelen kutusunun en üstüne döner. Menüde "Ertelenenler" bölümü.'],
    ['Göndermeyi geri al', 'Gönder\'e bastıktan sonra 10 saniye (Ayarlar\'dan 5–30 sn ya da kapalı) vazgeçme şansı.'],
    ['İmza', 'Gmail\'deki imzanla eşitlenir; yeni postalara ve yanıtlara otomatik eklenir. Ayarlar → İmza.'],
    ['Klavye kısayolları', 'Gmail\'deki gibi: J/K gezin, E arşivle, R yanıtla, C yeni posta, B ertele, Ctrl+Enter gönder… ? tuşu listeyi açar; her kısayol değiştirilebilir.'],
    ['Takvim: Ajanda', 'Önümüzdeki 30 günün etkinlikleri gün gün liste halinde.'],
    ['Gizlilik', 'Zamanlanmış maillerden planlanan saat bilgisi göndermeden önce silinir.'],
    ['İyileştirmeler', 'Bildirim yazıları cam görünümde daha okunaklı; yeni postada imleç imzanın üstünde başlar.']
  ]},
  { v: 'V0.3', date: '6 Ekim 2026', items: [
    ['Windows programı', 'Mail artık kurulabilen bir Windows programı olarak da var. Giriş bir kez tarayıcıda yapılır, program oturumu güvenle hatırlar.'],
    ['Zamanlanmış gönderim', 'Yeni postada saat simgesiyle göndermeyi ileri bir zamana planla. Zamanlanmış postalar menüde ayrı bölümde; saatini değiştir, hemen gönder ya da iptal et. Google zamanlayıcısı kurulursa cihazların kapalıyken de tam saatinde gider.'],
    ['Yazım düzeltmeleri', 'Cümle başı büyük harf; kişi, şehir, ülke, dil ve önemli yer adları (Anıtkabir, Ayasofya…) otomatik doğru yazılır. Yanlış düzeltirse Geri silme ile geri alınır. Ayarlar → Yazım bölümünden açılıp kapanır, kendi kelimelerini ekleyebilirsin.'],
    ['Yazım denetimi', 'Posta, not ve takvim alanlarında Türkçe yazım denetimi.'],
    ['Düzeltmeler', 'Uzun etiket listesinde sol menü artık aşağı kayıyor; Windows\'ta uygulama olarak açınca sağda çıkan gereksiz kaydırma çubuğu kaldırıldı.']
  ]},
  { v: 'V0.2', date: '6 Ekim 2026', items: [
    ['Türkçe karakterler', 'Bazı maillerde "gÃ¼nÃ¼", "buluÅŸacaÄŸÄ±z" gibi bozuk görünen Türkçe harfler düzeltildi.'],
    ['Telefon numaraları', 'Maillerdeki telefon numaraları tıklanabilir; tıklayınca Ara, Kopyala ve (cep numaralarında) WhatsApp seçenekleri çıkar. İmzada numaranın sadece bir kısmı link olsa bile tam numara alınır.'],
    ['iPhone', 'Ana ekrandan açınca altta kalan beyaz boşluk giderildi.'],
    ['Cam görünüm', 'Paneller buzlu cam gibi; gümüş-gri renkler ve grafit menü aynen korunuyor.'],
    ['Ayarlar', 'Sol alttaki çark simgesinden açılan Ayarlar: görünüm seçimi (Açık cam, Koyu cam, Otomatik, Düz), etiket ve klasör görünürlüğü, etiket renklerini sıfırlama, takvimin açılış görünümü, çıkış ve tek tıkla "Yenile ve güncelle".'],
    ['Otomatik etiketleme', 'Artık Etiketler başlığının sağındaki değnek simgesinden açılıyor. Mevcut kurallar ve engellenen göndericiler listeleri başlığa tıklayarak gizlenip gösterilebiliyor.'],
    ['Koyu cam', 'Gece zeminli, füme cam panelli koyu görünüm. Otomatik seçilirse cihazın koyu moduna göre kendiliğinden değişir.']
  ]},
  { v: 'V0.1', date: '5–6 Ekim 2026', items: [
    ['Gmail bağlantısı', 'Etiketler, mail okuma, yanıtlama, iletme, arama ve ekler.'],
    ['Otomatik etiketleme', 'Etiketlerinden kural önerir; yeni mailler gelen kutusuna uğramadan doğrudan etiketine gider.'],
    ['Göndericiyi engelle', 'Seçtiğin adres ya da siteden gelenler doğrudan çöpe gider.'],
    ['Görünüm', 'Gümüş-gri renkler, koyu grafit menü, minimalist düzen ve yuvarlak gümüş zarf simgesi.'],
    ['Etiketler', 'Gmail tarzı renkli rozetler, renk seçici, sade etiket seçici ve "Etiketler" başlığından aç/kapat.'],
    ['Sürükle bırak', 'Maili sol menüdeki bir etikete sürükleyerek taşı.'],
    ['Notlar', 'Kendi bölümünde not defteri görünümü; yeni not yazma ve düzenleme.'],
    ['Takvim', 'Google Takvim\'in uygulamanın içinde: ay ve hafta görünümü, etkinlik ekleme, düzenleme ve silme.'],
    ['Maillerden takvime', 'Mailde geçen tarihler bulunur ("Son ödeme: 15 Ekim" gibi) ve tek tıkla takvime eklenir; toplantı davetlerine Katılıyorum / Belki / Katılmıyorum.'],
    ['İyileştirmeler', 'Yüklenmeyen resimler, Gmail hız sınırı, araç çubuğu hizası ve güncellemelerin hemen görünmesi düzeltildi.']
  ]}
];

function openChangelog(onlyLatest) {
  const list = onlyLatest ? CHANGELOG.slice(0, 1) : CHANGELOG;
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet changelog">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>${onlyLatest ? `${list[0].v} ile gelen yenilikler` : 'Güncelleme notları'}</h3>
      </header>
      <div class="cl-body">
        ${list.map((r, i) => `
          <section class="cl-rel">
            <div class="cl-head"><b>${r.v}</b>${i === 0 ? '<span class="cl-new">Güncel</span>' : ''}<span class="cl-date">${r.date}</span></div>
            <ul>${r.items.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ul>
          </section>`).join('')}
      </div>
      <div class="cl-foot">
        ${onlyLatest ? '<button class="btn" data-action="changelog-all">Tüm notlar</button>' : ''}
        <button class="btn primary" data-action="close-modal">Tamam</button>
      </div>
    </div>
  </div>`;
}

Object.assign(ACTIONS, {
  changelog: () => openChangelog(false),
  'changelog-all': () => openChangelog(false)
});

// Yeni sürüm ilk kez açıldığında notları bir kez göster
function maybeShowWhatsNew() {
  const seen = store.get('seenVersion');
  if (seen === APP_VERSION) return;
  store.set('seenVersion', APP_VERSION);
  setTimeout(() => openChangelog(true), 800);
}
