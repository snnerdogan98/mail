/* Güncelleme notları: sol alttaki sürüm numarasına tıklayınca açılır,
   yeni bir sürüm yüklendiğinde de ilk açılışta bir kez gösterilir. */
'use strict';

const CHANGELOG = [
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
