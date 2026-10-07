/* ───────────── Mail Yönetici ─────────────
   Programı kimlerin kullanabileceğini yönetir. Ayrı bir uygulama olarak ana ekrana / bilgisayara eklenir.
   İki kilit: (1) programın sahibinin Google girişi, (2) yönetici şifresi.
   İkisi de Google zamanlayıcısında (Apps Script) kontrol edilir; bu sayfayı açan biri tek başına hiçbir şey yapamaz.
   Şifre cihazda saklanmaz; 10 dakika işlem yapılmazsa kilitlenir. */
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = window.MAIL_CONFIG || {};
const DEMO = new URLSearchParams(location.search).has('demo');
const svg = p => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  shield: svg('<path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6z"/><circle cx="12" cy="10.5" r="1.6"/><path d="M12 12v3"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  key: svg('<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M16 7l2 2M14 9l1.5 1.5"/>'),
  user: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>'),
  logout: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  block: svg('<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>'),
  down: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>')
};

/* ───── Google girişi (sadece e-posta adresi istenir; maillere erişim yok) ───── */
const SCOPE = 'openid email';
const Auth = {
  token() { const t = store.get('yonAuth'); return t && t.exp > Date.now() + 30000 ? t.token : null; },
  // Google dönüşü ana sayfaya gelir (kayıtlı adres o), ana sayfa buraya yönlendirir
  redirectUri() { return location.origin + location.pathname.replace(/[^/]*$/, ''); },
  login(silent) {
    const state = 'yon-' + Math.random().toString(36).slice(2);
    store.set('yonState', state);
    const p = new URLSearchParams({ client_id: CFG.CLIENT_ID, redirect_uri: this.redirectUri(), response_type: 'token', scope: SCOPE, state });
    const hint = store.get('yonEmail'); if (hint) p.set('login_hint', hint);
    if (silent) p.set('prompt', 'none');
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
  },
  handleRedirect() {
    if (!location.hash.includes('state=')) return null;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    if (h.get('state') !== store.get('yonState')) return 'state';
    store.del('yonState');
    if (!h.get('access_token')) return h.get('error') || 'error';
    store.set('yonAuth', { token: h.get('access_token'), exp: Date.now() + (+h.get('expires_in') || 3600) * 1000 });
    return 'ok';
  },
  logout() {
    const t = store.get('yonAuth');
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.token), { method: 'POST' }).catch(() => {});
    store.del('yonAuth'); store.del('yonEmail'); pw = null;
    showLogin();
  }
};

async function accHash(email) {
  const b = new TextEncoder().encode('mail-erisim-v1:' + String(email || '').trim().toLowerCase());
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
}
const SERVICE = () => (CFG.ACCESS_URL || store.get('accessUrlDraft') || '').trim();
const LIVE = () => !!(CFG.ACCESS_URL || '').trim();

/* ───── Liste servisi ───── */
let pw = null;          // şifre sadece bellekte
let data = null;        // { mode, allow:[{h,ad}], block:[{h,ad}] }
class SrvError extends Error { constructor(j) { super(j.hata); this.j = j; } }

const demoSrv = { sifre: null, hata: 0, e: { mode: 'off', allow: [{ h: 'c0ffee'.padEnd(64, '1'), ad: 'Abim' }], block: [] } };
async function demoPost(b) {
  await sleep(250);
  const d = demoSrv, L = b.liste === 'block' ? 'block' : 'allow';
  if (b.islem === 'durum') return { sifreVar: !!d.sifre };
  if (!d.sifre) { if (b.islem === 'sifre-kur' && (b.yeni || '').length >= 6) { d.sifre = b.yeni; return d.e; } return { hata: 'sifre-yok' }; }
  if (b.sifre !== d.sifre) { d.hata++; return d.hata >= 5 ? (d.hata = 0, { hata: 'kilit', dakika: 15 }) : { hata: 'sifre', kalan: 5 - d.hata }; }
  d.hata = 0;
  if (b.islem === 'sifre-kur') d.sifre = b.yeni;
  if (b.islem === 'mod') d.e.mode = b.mode;
  if (b.islem === 'ekle') { d.e[L] = d.e[L].filter(x => x.h !== b.h); d.e[L].push({ h: b.h, ad: b.ad }); }
  if (b.islem === 'sil') d.e[L] = d.e[L].filter(x => x.h !== b.h);
  return JSON.parse(JSON.stringify(d.e));
}
async function post(body) {
  let j;
  body = { ...body, sifre: body.sifre ?? pw };
  if (DEMO) j = await demoPost(body);
  else {
    const r = await fetch(SERVICE(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, token: Auth.token() }) });
    j = await r.json();
  }
  if (j.hata) throw new SrvError(j);
  return j;
}
function errText(e) {
  const j = e.j || {};
  if (j.hata === 'sifre') return `Şifre yanlış. ${j.kalan} deneme hakkın kaldı.`;
  if (j.hata === 'kilit') return `Çok fazla yanlış deneme. ${j.dakika || 15} dakika sonra tekrar dene.`;
  if (j.hata === 'yetki') return 'Google girişin doğrulanamadı. Çıkış yapıp tekrar gir.';
  if (j.hata === 'kisa') return 'Şifre en az 6 karakter olmalı.';
  if (/Failed to fetch|NetworkError|JSON/i.test(e.message)) return 'Liste servisine ulaşılamadı. İnternetini ve servis adresini kontrol et.';
  return 'Hata: ' + e.message;
}

/* ───── Ekranlar ───── */
const brand = (ic = IC.shield) => `<div class="brand-mark yon-mark">${ic}</div>`;
function screen(html) { $('#app').innerHTML = `<div class="center-screen yon-center">${html}</div>`; }

function showLogin(msg) {
  screen(`${brand()}<h1>Mail Yönetici</h1>
    <p>Programı kimlerin kullanabileceğini buradan yönetirsin. Sadece programın sahibi girebilir.</p>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <button class="btn primary" data-action="login">Google ile giriş yap</button>`);
}
function showNotOwner(email) {
  screen(`${brand(IC.block)}<h1>Yetkin yok</h1>
    <p><b>${esc(email)}</b> bu programın yöneticisi değil.</p>
    <button class="btn" data-action="logout">Başka hesapla giriş yap</button>`);
}
function showSetup(msg) {
  $('#app').innerHTML = panel(`
    <section><h4>Kurulum</h4>
      <div class="set-col"><b>Liste servisini bağla</b>
        <span>Kullanıcı listesi senin Google zamanlayıcında durur. Bir kerelik kurulum, 3 dakika.</span>
        <ol class="steps sm">
          <li>Mail programında <b>Ayarlar → Zamanlanmış gönderim → Güncelle</b> ile zamanlayıcı kodunu en son sürüme (4) güncelle.</li>
          <li>script.google.com'da <b>Mail Zamanlayıcı</b>'da sağ üstte <b>Dağıt → Yeni dağıtım</b>. Tür: <b>Web uygulaması</b>, Yürüten: <b>Ben</b>, Erişimi olan: <b>Herkes</b> → <b>Dağıt</b>.</li>
          <li>Çıkan <b>Web uygulaması URL'sini</b> kopyalayıp buraya yapıştır:</li>
        </ol>
        ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
        <div class="acc-url"><input id="accUrl" placeholder="https://script.google.com/macros/s/…/exec"><button class="btn primary" data-action="save-url">Kaydet</button></div>
      </div>
    </section>`, false);
}
function showCreatePw(msg) {
  screen(`${brand(IC.key)}<h1>Yönetici şifresi belirle</h1>
    <p>Bu şifre olmadan kimse listeyi değiştiremez. Hiçbir cihazda saklanmaz; unutma.</p>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <form class="yon-form" data-form="create">
      <input type="password" id="pw1" placeholder="Yeni şifre (en az 6 karakter)" autocomplete="new-password" minlength="6" required>
      <input type="password" id="pw2" placeholder="Şifre tekrar" autocomplete="new-password" required>
      <button class="btn primary">Şifreyi kaydet</button>
    </form>`);
  $('#pw1').focus();
}
function showUnlock(msg) {
  screen(`${brand(IC.lock)}<h1>Kilitli</h1>
    <p>Devam etmek için yönetici şifreni gir.</p>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <form class="yon-form" data-form="unlock">
      <input type="password" id="pw" placeholder="Yönetici şifresi" autocomplete="current-password" required>
      <button class="btn primary">Kilidi aç</button>
    </form>
    <p class="muted sm">Şifreni unuttuysan: script.google.com'da Mail Zamanlayıcı'yı aç, üstten <b>yoneticiSifresiniSifirla</b>'yı seçip ▷ Çalıştır'a bas. Sonra burada yeni şifre belirlersin.</p>`);
  $('#pw').focus();
}
function showBusy(t = 'Yükleniyor…') { screen(`${brand()}<p class="muted">${t}</p>`); }

function panel(body, tools = true) {
  return `<div class="yon-page"><div class="sheet settings yon-sheet">
    <div class="sheet-head">${brand()}<h3>Mail Yönetici</h3>
      ${tools ? `<button class="icon-btn" data-action="lock" title="Kilitle">${IC.lock}</button>` : ''}
      <button class="icon-btn" data-action="logout" title="Çıkış yap">${IC.logout}</button></div>
    <div class="set-body">${body}</div></div></div>`;
}
let showPwChange = false;
function render() {
  const mode = data.mode || 'off', list = mode === 'block' ? 'block' : 'allow', rows = data[list] || [];
  $('#app').innerHTML = panel(`
    ${!LIVE() && !DEMO ? `<div class="card upd-card"><b>Son adım:</b> Liste servisi çalışıyor ama Mail programı adresi henüz bilmiyor; seçimlerin şu an kimseyi etkilemez. <b>config.js</b>'i indirip GitHub'a (main) yükle.<div class="ph-actions" style="margin-top:8px"><button class="btn" data-action="config">${IC.down} config.js'i indir</button></div></div>` : ''}
    <section><h4>Kimler kullanabilir?</h4>
      <div class="seg yon-seg">${[['off', 'Herkes'], ['allow', 'Sadece izinliler'], ['block', 'Engellenenler hariç']].map(([m, t]) => `<button class="${mode === m ? 'on' : ''}" data-action="mode" data-m="${m}">${t}</button>`).join('')}</div>
      <p class="muted sm">${mode === 'off' ? 'Kapalı: programı kuran herkes kullanabilir.' : mode === 'allow' ? 'Sadece aşağıdaki listedekiler kullanabilir.' : 'Herkes kullanabilir; aşağıdakiler hariç.'} Sen her zaman kullanabilirsin.</p>
    </section>
    ${mode === 'off' ? '' : `
    <section><h4>${list === 'allow' ? 'İzinli kullanıcılar' : 'Engellenen kullanıcılar'} · ${rows.length}</h4>
      ${rows.length ? `<div class="acc-list">${rows.map(r => `<div class="acc-row"><span>${IC.user}<b>${esc(r.ad || 'Not yok')}</b><small>${esc(r.h.slice(0, 8))}…</small></span><button class="btn sm" data-action="del" data-h="${r.h}" data-l="${list}">${list === 'allow' ? 'Çıkar' : 'Engeli kaldır'}</button></div>`).join('')}</div>` : `<p class="muted sm">Liste boş.${list === 'allow' ? ' Şu an programı sadece sen kullanabilirsin.' : ''}</p>`}
      <form class="acc-add" data-form="add" data-l="${list}">
        <input id="accEmail" type="email" placeholder="ornek@gmail.com" required>
        <input id="accNote" placeholder="Not (ör. Abim)">
        <button class="btn primary">${list === 'allow' ? 'İzin ver' : 'Engelle'}</button>
      </form>
      <p class="muted sm">Adresler listede açık yazılmaz, şifrelenmiş halleri saklanır. Notu sadece sen görürsün.</p>
    </section>`}
    <section><h4>Güvenlik</h4>
      ${showPwChange ? `
      <form class="yon-form left" data-form="change">
        <input type="password" id="pwOld" placeholder="Şu anki şifre" autocomplete="current-password" required>
        <input type="password" id="pwNew" placeholder="Yeni şifre (en az 6 karakter)" autocomplete="new-password" minlength="6" required>
        <div class="ph-actions"><button class="btn primary">Değiştir</button><button type="button" class="btn ghost" data-action="pw-cancel">Vazgeç</button></div>
      </form>` : `
      <div class="set-row"><div><b>Yönetici şifresi</b><span>10 dakika işlem yapılmazsa kendiliğinden kilitlenir</span></div>
        <button class="btn" data-action="pw-change">${IC.key} Değiştir</button></div>`}
      <div class="set-row"><div><b>${esc(store.get('yonEmail') || '')}</b><span>Yönetici hesabı</span></div>
        <button class="btn" data-action="lock">${IC.lock} Kilitle</button></div>
      <div class="set-row"><div><b>Liste servisi</b><span class="yon-url">${esc(DEMO ? 'Deneme modu' : SERVICE())}</span></div>
        ${LIVE() ? '' : `<button class="btn ghost" data-action="forget-url">Değiştir</button>`}</div>
    </section>`);
}

/* ───── Akış ───── */
async function boot() {
  if (DEMO) { store.set('yonEmail', 'snn.erdogan98@gmail.com'); return afterLogin(); }
  const r = Auth.handleRedirect();
  if (r && r !== 'ok') return showLogin(sessionStorage.getItem('yonSilent') ? '' : r === 'access_denied' ? 'Giriş iptal edildi.' : 'Giriş tamamlanamadı, tekrar dene.');
  if (!Auth.token()) return store.get('yonEmail') && r !== 'ok' && !sessionStorage.getItem('yonSilent')
    ? (sessionStorage.setItem('yonSilent', '1'), Auth.login(true)) : showLogin();
  sessionStorage.removeItem('yonSilent');
  try {
    const u = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + Auth.token() } })).json();
    if (!u.email) throw 0;
    store.set('yonEmail', u.email);
  } catch { store.del('yonAuth'); return showLogin('Giriş doğrulanamadı, tekrar dene.'); }
  afterLogin();
}
async function afterLogin() {
  const email = store.get('yonEmail');
  if (await accHash(email) !== CFG.OWNER_HASH) return showNotOwner(email);
  if (!SERVICE() && !DEMO) return showSetup();
  showBusy('Liste servisine bağlanılıyor…');
  try {
    const d = await post({ islem: 'durum' });
    return d.sifreVar ? (pw ? openPanel() : showUnlock()) : showCreatePw();
  } catch (e) {
    if (e.j?.hata === 'yetki') { store.del('yonAuth'); return showLogin(errText(e)); }
    if (e.j?.hata === 'kilit') return showUnlock(errText(e));
    return LIVE() ? screen(`${brand()}<h1>Bağlanılamadı</h1><p class="err">${esc(errText(e))}</p><button class="btn" data-action="retry">Tekrar dene</button>`)
      : showSetup(errText(e) + ' Adresi ve 2. adımdaki ayarları kontrol et.');
  }
}
async function openPanel() {
  try { data = await post({ islem: 'liste' }); touch(); render(); }
  catch (e) { pw = null; e.j?.hata === 'yetki' ? showLogin(errText(e)) : showUnlock(errText(e)); }
}

// Hareketsizlikte kilitle
let lastAct = Date.now();
const touch = () => { lastAct = Date.now(); };
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, touch, true));
setInterval(() => { if (pw && Date.now() - lastAct > 10 * 60e3) lock(); }, 15e3);
function lock() { pw = null; data = null; showPwChange = false; showUnlock(); }

let toastT;
function toast(t) {
  const el = $('#toast');
  el.innerHTML = `<div class="toast-in"><span>${esc(t)}</span></div>`;
  el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200);
}
async function change(fn, ok) {
  try { data = await fn(); if (ok) toast(ok); }
  catch (e) { if (e.j?.hata === 'sifre' || e.j?.hata === 'kilit') { pw = null; return showUnlock(errText(e)); } toast(errText(e)); }
  render();
}

function downloadConfig() {
  const txt = `// Google Cloud'da oluşturduğun Web istemcisinin Client ID'sini buraya yapıştır.
// Örnek: '1234567890-abcdefg.apps.googleusercontent.com'
window.MAIL_CONFIG = {
  CLIENT_ID: '${CFG.CLIENT_ID || ''}',
  // Erişim listesi (kimlerin programı kullanabileceği). Boşken kapalıdır, herkes kullanabilir.
  // Google zamanlayıcısının "web uygulaması" adresi; Mail Yönetici'den kurulur.
  ACCESS_URL: '${SERVICE()}',
  // Programın sahibi (yönetici). E-posta açık yazılmaz, şifrelenmiş hali tutulur.
  OWNER_HASH: '${CFG.OWNER_HASH || ''}'
};
`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
  a.download = 'config.js'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const ACTIONS = {
  login: () => Auth.login(false),
  logout: () => DEMO ? location.reload() : Auth.logout(),
  retry: () => afterLogin(),
  lock: () => lock(),
  config: () => downloadConfig(),
  'save-url': () => {
    const v = $('#accUrl').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) return toast('Adres "https://script.google.com/macros/s/…/exec" şeklinde olmalı');
    store.set('accessUrlDraft', v); afterLogin();
  },
  'forget-url': () => { if (confirm('Liste servisi adresini değiştirmek istiyor musun?')) { store.del('accessUrlDraft'); pw = null; showSetup(); } },
  'pw-change': () => { showPwChange = true; render(); $('#pwOld').focus(); },
  'pw-cancel': () => { showPwChange = false; render(); },
  mode: el => {
    const m = el.dataset.m;
    if (m === data.mode) return;
    if (m === 'allow' && !(data.allow || []).length && !confirm('Liste boş: "Sadece izinliler" seçilince programı senden başka kimse kullanamaz. Devam edilsin mi?')) return;
    change(() => post({ islem: 'mod', mode: m }), 'Kaydedildi');
  },
  del: el => change(() => post({ islem: 'sil', liste: el.dataset.l, h: el.dataset.h }), el.dataset.l === 'allow' ? 'Listeden çıkarıldı' : 'Engel kaldırıldı')
};
const FORMS = {
  create: async () => {
    const a = $('#pw1').value, b = $('#pw2').value;
    if (a.length < 6) return showCreatePw('Şifre en az 6 karakter olmalı.');
    if (a !== b) return showCreatePw('İki şifre aynı değil.');
    showBusy('Kaydediliyor…');
    try { data = await post({ islem: 'sifre-kur', yeni: a, sifre: '' }); pw = a; touch(); render(); toast('Yönetici şifresi kaydedildi'); }
    catch (e) { showCreatePw(errText(e)); }
  },
  unlock: async () => {
    const v = $('#pw').value; showBusy('Kontrol ediliyor…'); pw = v; openPanel();
  },
  change: async () => {
    const o = $('#pwOld').value, n = $('#pwNew').value;
    if (n.length < 6) return toast('Yeni şifre en az 6 karakter olmalı');
    try { data = await post({ islem: 'sifre-kur', sifre: o, yeni: n }); pw = n; showPwChange = false; toast('Şifre değiştirildi'); }
    catch (e) { if (e.j?.hata === 'kilit') { pw = null; return showUnlock(errText(e)); } toast(errText(e)); }
    render();
  },
  add: async f => {
    const email = $('#accEmail').value.trim(), note = $('#accNote').value.trim(), l = f.dataset.l;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Geçerli bir e-posta adresi yaz');
    const h = await accHash(email);
    if (h === CFG.OWNER_HASH) return toast('Bu senin adresin; sen her zaman kullanabilirsin');
    change(() => post({ islem: 'ekle', liste: l, h, ad: note || email.replace(/@.*/, '') }), l === 'allow' ? 'İzin verildi' : 'Engellendi');
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) { e.preventDefault(); ACTIONS[el.dataset.action](el); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (f && FORMS[f.dataset.form]) { e.preventDefault(); FORMS[f.dataset.form](f); }
});

boot();
