/* ───────────── Notlar (ayrı uygulama) ─────────────
   Mail'in not altyapısını kullanır: notlar Gmail'deki "Notes" etiketinde, iPhone/Mac Notlar uygulamasının
   kullandığı biçimde durur. Yani iPhone'daki Notlar (Gmail hesabı) ile aynı notlar görünür. */
'use strict';

window.APP_NAME = 'Notlar';
window.APP_ICON = 'notlar-apple.png?v=1';
window.APP_LEAD = 'Gmail hesabında saklanan, iPhone ve Mac\'teki Notlar uygulamasıyla aynı notlar. Notların yalnızca senin cihazında görüntülenir; arada başka bir sunucu yoktur.';
window.AUTH_STATE_PREFIX = 'not-';           // Google dönüşü ana sayfaya gelir, ana sayfa buraya aktarır
Auth.redirectUri = () => location.origin + location.pathname.replace(/[^/]*$/, '');

IC.notepad = svg('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>');

showLogin = function (msg) {
  $('#app').innerHTML = `
  <div class="center-screen">
    <div class="brand-mark">${IC.notepad}</div>
    <h1>Notlar</h1>
    <p>Gmail hesabınla giriş yap. iPhone ve Mac'teki Notlar uygulamasının Gmail'e kaydettiği notlar burada da görünür.</p>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <button class="btn primary" data-action="login">Google ile giriş yap</button>
  </div>`;
};

function notesShell() {
  const bar = $('.listpane > .bar');
  if (bar && !bar.querySelector('[data-action="notes-settings"]'))
    bar.insertAdjacentHTML('beforeend', `<button class="icon-btn" data-action="notes-settings" aria-label="Ayarlar">${IC.gear}</button>`);
  const fab = $('.fab');
  if (fab) { fab.dataset.action = 'new-note'; fab.setAttribute('aria-label', 'Yeni not'); fab.innerHTML = `${IC.pen}<span>Yeni not</span>`; }
}

start = async function () {
  showShell(); notesShell();
  try {
    const [p, labels] = await Promise.all([Gmail.profile(), Gmail.labels()]);
    S.email = p.email;
    if (typeof accessGate === 'function' && !(await accessGate(p.email))) return;
    store.set('email', p.email);
    setLabels(labels);
    if (!notesLabel()) { await Gmail.createLabel('Notes'); setLabels(await Gmail.labels()); }
    S.labelId = notesLabel().id;
    renderSidebar();
    closeReader();
    await loadList();
  } catch (e) {
    if (!(e instanceof AuthError)) showLogin('Gmail\'e bağlanılamadı: ' + e.message);
  }
};

/* Ayarlar: görünüm, hesap, hakkında */
function openNotesSettings() {
  const t = store.get('theme', 'light');
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet settings">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Ayarlar</h3>
      </header>
      <div class="set-body">
        <section><h4>Görünüm</h4>
          <div class="seg yon-seg">${[['light', 'Cam'], ['dark', 'Koyu'], ['auto', 'Otomatik'], ['flat', 'Düz']].map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-action="notes-theme" data-t="${k}">${n}</button>`).join('')}</div>
        </section>
        <section><h4>Hesap</h4>
          <div class="set-row"><div><b>${esc(S.email || '')}</b><span>Notlar bu Gmail hesabındaki "Notes" etiketinde saklanır</span></div>
            <button class="btn" data-action="logout">${IC.logout}Çıkış yap</button></div>
        </section>
        <section><h4>Uygulama</h4>${typeof aboutRow === 'function' ? aboutRow() : ''}</section>
      </div>
    </div>
  </div>`;
}
Object.assign(ACTIONS, {
  'notes-settings': () => openNotesSettings(),
  'notes-theme': el => { store.set('theme', el.dataset.t); applyTheme(el.dataset.t); openNotesSettings(); },
  compose: () => newNote(),
  'open-drawer': () => {}
});
