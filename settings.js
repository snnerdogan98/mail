/* ───────────── Ayarlar ───────────── */

const THEMES = [
  ['light', 'Açık cam', 'Gümüş zemin, buzlu cam paneller'],
  ['dark', 'Koyu cam', 'Gece zemini, füme cam paneller'],
  ['auto', 'Otomatik', 'Cihaz koyu moddaysa koyu, değilse açık'],
  ['flat', 'Düz', 'Camsız, sade gümüş-gri']
];

function openSettings() {
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
        <section>
          <h4>Kenar çubuğu</h4>
          <div class="set-row"><div><b>Etiketleri göster</b><span>Kapalıyken toplam okunmamış sayısı görünür</span></div>${sw('labels', labelsShown)}</div>
          <div class="set-row"><div><b>Tüm klasörleri göster</b><span>Taslaklar, Tüm postalar, Spam, Çöp kutusu</span></div>${sw('more', moreShown)}</div>
          <div class="set-row"><div><b>Etiket renkleri</b><span>${customColors ? `${customColors} etikete özel renk verdin` : 'Tüm etiketler Gmail renginde'}</span></div>
            <button class="btn" data-action="set-reset-colors" ${customColors ? '' : 'disabled'}>Gmail renklerine dön</button></div>
        </section>
        <section>
          <h4>Otomatik etiketleme</h4>
          <div class="set-row"><div><b>Kurallar ve engellenenler</b><span>${autoSummary()}</span></div>
            <button class="btn" data-action="set-open-auto">${IC.wand}Aç</button></div>
        </section>
        <section>
          <h4>Takvim</h4>
          <div class="set-row"><div><b>Açılış görünümü</b><span>Takvim açıldığında</span></div>
            <div class="seg">${[['month', 'Ay'], ['week', 'Hafta']].map(([m, t]) => `<button class="${calMode === m ? 'on' : ''}" data-action="set-calmode" data-m="${m}">${t}</button>`).join('')}</div></div>
        </section>
        <section>
          <h4>Hesap</h4>
          <div class="set-row"><div><b>${esc(S.email || '')}</b><span>Gmail ve Google Takvim bu hesapla bağlı</span></div>
            <button class="btn" data-action="logout">${IC.logout}Çıkış yap</button></div>
        </section>
        <section>
          <h4>Uygulama</h4>
          <div class="set-row"><div><b>Sürüm ${APP_VERSION}</b><span>Yenilikleri ve düzeltmeleri gör</span></div>
            <button class="btn" data-action="changelog">${IC.spark}Güncelleme notları</button></div>
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
