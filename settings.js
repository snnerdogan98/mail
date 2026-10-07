/* ───────────── Ayarlar ───────────── */

const THEMES = [
  ['light', 'Açık cam', 'Gümüş zemin, buzlu cam paneller'],
  ['dark', 'Koyu cam', 'Gece zemini, füme cam paneller'],
  ['auto', 'Otomatik', 'Cihaz koyu moddaysa koyu, değilse açık'],
  ['flat', 'Düz', 'Camsız, sade gümüş-gri']
];

function openSettings() {
  if (typeof SIG !== 'undefined' && !SIG.loaded && !SIG.trying) { SIG.trying = true; loadSignature().then(() => { if ($('.sheet.settings')) openSettings(); }); }
  $('#shell')?.classList.remove('drawer');
  const theme = store.get('theme', 'light');
  const labelsShown = !S.collapsed.__labels;
  const moreShown = S.collapsed.__more === false;
  const calMode = store.get('calMode', 'month');
  const customColors = Object.keys(store.get('labelColors', {})).length;
  const sw = (key, on) => `<button class="switch ${on ? 'on' : ''}" data-action="set-toggle" data-k="${key}" role="switch" aria-checked="${on}"><i></i></button>`;
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet settings">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Ayarlar</h3>
      </header>
      <div class="set-body">
        <section>
          <h4>Görünüm</h4>
          <div class="theme-grid">
            ${THEMES.map(([k, name, desc]) => `
              <button class="theme-opt ${theme === k ? 'on' : ''}" data-action="set-theme" data-t="${k}">
                <span class="theme-prev tp-${k}"><i></i><b></b><b></b></span>
                <span class="theme-name">${name}${theme === k ? IC.check : ''}</span>
                <span class="theme-desc">${desc}</span>
              </button>`).join('')}
          </div>
        </section>
        ${typeof notifySection === 'function' ? notifySection() : ''}
        ${typeof undoSendRow === 'function' ? `<section><h4>Gönderme</h4>${undoSendRow()}</section>` : ''}
        ${typeof keysRow === 'function' ? `<section><h4>Klavye</h4>${keysRow()}</section>` : ''}
        ${typeof signatureSection === 'function' ? signatureSection() : ''}
        <section>
          <h4>Gizlilik</h4>
          <div class="set-row"><div><b>Takip piksellerini engelle</b><span>Pazarlama mailleri, maili açtığını ve nereden açtığını gizlice öğrenemez.${store.get('trkCount', 0) ? ` Bugüne kadar <b>${store.get('trkCount', 0)}</b> takip pikseli engellendi.` : ''}</span></div>${sw('blockTrackers', store.get('blockTrackers', true) !== false)}</div>
          <div class="set-row"><div><b>Sahte mail uyarısı</b><span>Banka, kurum ya da mağaza adıyla gelip adresi o kuruma ait olmayan, doğrulanamayan ya da aldatıcı link içeren maillerde kırmızı uyarı.${store.get('safeSenders', []).length ? ` Güvenli saydıkların: ${esc(store.get('safeSenders', []).join(', '))}` : ''}</span></div>
            ${store.get('safeSenders', []).length ? '<button class="btn" data-action="phish-reset">Güvenli listesini temizle</button>' : ''}</div>
          <div class="set-row"><div><b>Resimleri gizli yükle</b><span>Maildeki resimler aracı bir sunucu (images.weserv.nl) üzerinden gelir; gönderen IP adresini ve konumunu göremez. Resimler biraz yavaş açılabilir.</span></div>${sw('imgProxyAll', store.get('imgProxyAll', false) === true)}</div>
        </section>
        <section>
          <h4>Kenar çubuğu</h4>
          <div class="set-row"><div><b>Etiketleri göster</b><span>Kapalıyken toplam okunmamış sayısı görünür</span></div>${sw('labels', labelsShown)}</div>
          <div class="set-row"><div><b>Tüm klasörleri göster</b><span>Taslaklar, Tüm postalar, Spam, Çöp kutusu</span></div>${sw('more', moreShown)}</div>
          <div class="set-row"><div><b>Etiket renkleri</b><span>${customColors ? `${customColors} etikete özel renk verdin` : 'Tüm etiketler Gmail renginde'}</span></div>
            <button class="btn" data-action="set-reset-colors" ${customColors ? '' : 'disabled'}>Gmail renklerine dön</button></div>
        </section>
        <section>
          <h4>Yazım</h4>
          <div class="set-row"><div><b>Cümle başını büyük harfle başlat</b><span>Nokta, soru ve ünlem işaretinden sonra ve satır başında</span></div>${sw('acSentence', acOn('acSentence'))}</div>
          <div class="set-row"><div><b>Özel isimleri büyük harfle yaz</b><span>${acLearned().length ? `Maillerindeki ${acLearned().length} kişinin adı` : 'Maillerindeki kişilerin adları'}, şehirler, ülkeler, diller. Yanlış düzeltirse hemen ← Geri silme ile geri al.</span></div>${sw('acNames', acOn('acNames'))}</div>
          <div class="set-col"><b>Kendi kelimelerim</b><span>Hep böyle yazılmasını istediğin isimler, virgülle ayır</span>
            <textarea id="acMine" rows="2" placeholder="Örn: Sinan Erdoğan, Enpara, Kadıköy">${esc(acMine().join(', '))}</textarea></div>
        </section>
        <section>
          <h4>Zamanlanmış gönderim</h4>
          <div class="set-row"><div><b>Google zamanlayıcısı</b><span>${!store.get('schedScript') ? 'Kurulu değil: zamanlanmış postalar ve ertelenen mailler sadece uygulama açıkken işlenir'
              : store.get('schedScriptVer', 1) < SCHED_SCRIPT_VER ? '<b class="upd">Yeni sürüm var.</b> Erteleme ve gizlilik için zamanlayıcı kodunu güncelle.'
              : 'Kurulu ve güncel: cihazların kapalıyken de çalışır'}</span></div>
            <button class="btn" data-action="sched-setup">${IC.clock}${!store.get('schedScript') ? 'Kur' : store.get('schedScriptVer', 1) < SCHED_SCRIPT_VER ? 'Güncelle' : 'Kurulum'}</button></div>
        </section>
        <section>
          <h4>Otomatik etiketleme</h4>
          <div class="set-row"><div><b>Kurallar ve engellenenler</b><span>${autoSummary()}</span></div>
            <button class="btn" data-action="set-open-auto">${IC.wand}Aç</button></div>
        </section>
        <section>
          <h4>Takvim</h4>
          <div class="set-row"><div><b>Açılış görünümü</b><span>Takvim açıldığında</span></div>
            <div class="seg">${[['month', 'Ay'], ['week', 'Hafta'], ['agenda', 'Ajanda']].map(([m, t]) => `<button class="${calMode === m ? 'on' : ''}" data-action="set-calmode" data-m="${m}">${t}</button>`).join('')}</div></div>
        </section>
        <section>
          <h4>Hesap</h4>
          <div class="set-row"><div><b>${esc(S.email || '')}</b><span>Gmail ve Google Takvim bu hesapla bağlı</span></div>
            <button class="btn" data-action="logout">${IC.logout}Çıkış yap</button></div>
        </section>
        <section>
          <h4>Uygulama</h4>
          <div class="set-row"><div><b>Sürüm ${APP_VERSION}</b><span>Mail · kişisel Gmail istemcisi</span></div></div>
          <div class="set-row"><div><b>Yenile ve güncelle</b><span>Eski sürüm görünüyorsa önbelleği temizler; giriş ve ayarların kalır</span></div>
            <button class="btn" data-action="set-hard-reload">${IC.refresh}Yenile</button></div>
        </section>
      </div>
    </div>
  </div>`;
}

// Gmail filtreleri yüklendiyse sayıları göster
function autoSummary() {
  if (!S.filters) return 'Etiketlerinden öğren, kuralları yönet, engelli göndericileri gör';
  const rules = S.filters.filter(f => (f.action?.addLabelIds || []).some(id => S.labelById[id]?.type === 'user')).length;
  const blocked = S.filters.filter(f => (f.action?.addLabelIds || []).includes('TRASH')).length;
  return `${rules} kural · ${blocked} engelli gönderici`;
}

function setTheme(t) {
  store.set('theme', t);
  applyTheme(t);
}

Object.assign(ACTIONS, {
  settings: () => openSettings(),
  'set-open-auto': () => { closeModal(); ACTIONS.auto(); },
  'set-theme': el => { setTheme(el.dataset.t); openSettings(); },
  'set-toggle': el => {
    if (el.dataset.k === 'labels') S.collapsed.__labels = !S.collapsed.__labels;
    if (el.dataset.k === 'more') S.collapsed.__more = S.collapsed.__more === false;
    if (el.dataset.k === 'acSentence' || el.dataset.k === 'acNames') { store.set(el.dataset.k, !acOn(el.dataset.k)); return openSettings(); }
    if (el.dataset.k === 'sigNew' || el.dataset.k === 'sigReply') { store.set(el.dataset.k, !sigOn(el.dataset.k)); return openSettings(); }
    if (el.dataset.k === 'blockTrackers') { store.set('blockTrackers', store.get('blockTrackers', true) === false); if (S.thread && S.view === 'thread') renderThread(); return openSettings(); }
    if (el.dataset.k === 'imgProxyAll') { store.set('imgProxyAll', !store.get('imgProxyAll', false)); if (S.thread && S.view === 'thread') renderThread(); return openSettings(); }
    store.set('collapsed', S.collapsed);
    renderSidebar(); openSettings();
  },
  'set-calmode': el => {
    store.set('calMode', el.dataset.m);
    if (typeof C !== 'undefined') { C.mode = el.dataset.m; if (S.view === 'cal') loadEvents(); }
    openSettings();
  },
  'set-reset-colors': () => {
    store.del('labelColors');
    for (const l of S.labels) if (l.type === 'user') l.color = l.gmailColor;
    renderSidebar(); renderList();
    if (S.thread && S.view === 'thread') renderThread();
    openSettings();
    toast('Etiket renkleri Gmail\'deki haline döndü');
  },
  'set-hard-reload': async () => {
    try {
      if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
      if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    } catch {}
    location.reload();
  }
});

// Kendi kelimelerim: yazıp çıkınca kaydedilir
document.addEventListener('change', e => {
  if (e.target.id !== 'acMine') return;
  const words = e.target.value.split(/[,\n]+/).map(w => w.trim().replace(/\s+/g, ' ')).filter(Boolean);
  store.set('acMine', [...new Set(words)]);
  acBuild();
  toast(words.length ? `${words.length} kelime kaydedildi` : 'Kendi kelimelerin temizlendi');
});
