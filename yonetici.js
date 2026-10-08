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
  more: svg('<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  down: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  chat: svg('<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>'),
  reply: svg('<path d="M10 8 5 12.5 10 17M5 12.5h9a5 5 0 0 1 5 5V19"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>')
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

const demoSrv = { sifre: null, hata: 0, e: { mode: 'off', allow: [{ h: 'c0ffee'.padEnd(64, '1'), ad: 'Abim' }], block: [] },
  ku: [
    { id: 'ku:snn.erdogan98@gmail.com', e: 'snn.erdogan98@gmail.com', ad: 'Sinan Erdoğan', son: Date.now() - 6e4, ilk: Date.now() - 864e5 * 5, sayi: 40, cihaz: 'iPhone (iOS 18.0) · Ana ekran uygulaması', surum: 'V0.6' },
    { id: 'ku:mehmet.erdogan@gmail.com', e: 'mehmet.erdogan@gmail.com', ad: 'Mehmet Erdoğan', son: Date.now() - 36e5 * 3, ilk: Date.now() - 864e5 * 2, sayi: 6, cihaz: 'Windows · Windows programı', surum: 'V0.6' },
    { id: 'ku:ali.veli@ornekfirma.com', e: 'ali.veli@ornekfirma.com', ad: 'Ali Veli', son: Date.now() - 864e5, ilk: Date.now() - 864e5 * 1.5, sayi: 3, cihaz: 'Android (sürüm 14) · Chrome', surum: 'V0.6' },
    { id: 'ku:yabanci.kisi@hotmail.com', e: 'yabanci.kisi@hotmail.com', ad: '', son: Date.now() - 864e5 * 4, ilk: Date.now() - 864e5 * 4, sayi: 1, cihaz: 'Windows · Edge', surum: 'V0.6' }
  ],
  gb: [
    { id: 'gb:3', t: Date.now() - 36e5 * 2, kim: 'mehmet.erdogan@gmail.com', tur: 'hata', okundu: 0, metin: 'Telefonda bir maili etikete taşıyınca liste hemen yenilenmiyor, aşağı çekince düzeliyor.', bilgi: 'Sürüm: V0.6\nCihaz: iPhone (iOS 18.0)\nKullanım: Ana ekran uygulaması\nGörünüm: Koyu\nEkran: 390×844' },
    { id: 'gb:2', t: Date.now() - 864e5, kim: 'ali.veli@ornekfirma.com', tur: 'oneri', okundu: 0, metin: 'Sağ tık menüsüne "Yazdır" da eklenebilir mi?', bilgi: 'Sürüm: V0.6\nCihaz: Windows\nKullanım: Windows programı\nGörünüm: Cam\nEkran: 1536×864' },
    { id: 'gb:1', t: Date.now() - 864e5 * 3, kim: 'ayse.erdogan@gmail.com', tur: 'diger', okundu: 1, metin: 'Program çok güzel olmuş, eline sağlık :)', bilgi: 'Sürüm: V0.5\nCihaz: Android (sürüm 14)\nKullanım: Chrome\nGörünüm: Cam\nEkran: 412×915' }
  ] };
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
  if (b.islem === 'gb-sil') d.gb = d.gb.filter(g => g.id !== b.id);
  if (b.islem === 'gb-oku') d.gb.forEach(g => { if (!b.id || g.id === b.id) g.okundu = 1; });
  if (/^gb-/.test(b.islem)) return { gb: JSON.parse(JSON.stringify(d.gb)) };
  if (b.islem === 'ku-sil') d.ku = d.ku.filter(u => u.id !== b.id);
  if (/^ku-/.test(b.islem)) return { ku: JSON.parse(JSON.stringify(d.ku)) };
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
    </form>`);
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
/* ───── Programı kullananlar ───── */
let ku = null, kuHash = {};          // ku: [{id,e,ad,son,ilk,sayi,cihaz,surum}] | 'eski'
async function loadKu() {
  try {
    const j = await post({ islem: 'ku-liste' });
    ku = Array.isArray(j.ku) ? j.ku : 'eski';
    if (Array.isArray(ku)) for (const u of ku) if (!kuHash[u.e]) kuHash[u.e] = await accHash(u.e);
  } catch { ku = ku || 'eski'; }
}
const inList = (h, l) => (data?.[l] || []).some(x => x.h === h);
function kuStatus(u) {
  const h = kuHash[u.e], owner = h === CFG.OWNER_HASH;
  const w = inList(h, 'allow'), k = inList(h, 'block'), m = data?.mode || 'off';
  const blocked = !owner && ((m === 'allow' && !w) || (m === 'block' && k));
  return { h, owner, w, k, blocked };
}
function kuRow(u) {
  const st = kuStatus(u);
  const name = u.ad && u.ad.toLowerCase() !== u.e ? u.ad : '';
  return `<div class="ku-row ${st.blocked ? 'blocked' : ''}" data-ku="${esc(u.id)}">
    <span class="ku-av">${esc((name || u.e).trim().charAt(0).toLocaleUpperCase('tr-TR'))}</span>
    <span class="ku-txt"><b>${esc(name || u.e)}</b>${name ? `<small>${esc(u.e)}</small>` : ''}
      <small class="ku-meta">${esc(gbWhen(u.son))}${u.cihaz ? ' · ' + esc(u.cihaz) : ''}${u.surum ? ' · ' + esc(u.surum) : ''}</small>
      <span class="ku-chips">${st.owner ? '<i class="ku-chip me">Sen</i>' : ''}${st.w ? '<i class="ku-chip w">Beyaz liste</i>' : ''}${st.k ? '<i class="ku-chip k">Kara liste</i>' : ''}${st.blocked ? '<i class="ku-chip no">Giremiyor</i>' : ''}</span></span>
    ${st.owner ? '' : `<button class="icon-btn ku-more" data-action="ku-menu" data-ku="${esc(u.id)}" title="Seçenekler">${IC.more}</button>`}
  </div>`;
}
function kuSection(mode) {
  if (ku === 'eski') return `<section><h4>Programı kullananlar</h4><div class="card upd-card"><b>Bir adım kaldı:</b> Programı kullananların burada listelenmesi için zamanlayıcıyı <b>sürüm 5</b>'e güncelle (Mail → Ayarlar → Zamanlanmış gönderim → Güncelle), sonra script.google.com'da <b>Dağıt → Dağıtımları yönet → ✎ → Sürüm: Yeni sürüm → Dağıt</b>.</div>${listOnly()}</section>`;
  if (!Array.isArray(ku)) return listOnly(true);
  return `<section><h4>Programı kullananlar · ${ku.length}</h4>
    ${ku.length ? `<div class="ku-list">${ku.map(kuRow).join('')}</div>` : '<p class="muted sm">Henüz kimse yok. Programı açan herkes (V0.6 ve sonrası) burada görünür.</p>'}
    <p class="muted sm">En son ne zaman açtığı, hangi cihazdan ve hangi sürümle girdiği görünür. Bilgisayarda satıra sağ tıkla, telefonda ⋯'ye dokun.</p>
  </section>${listOnly(true)}`;
}
// Listelerde olup programı hiç açmamış (ya da kaydı silinmiş) adresler + elle ekleme
function listOnly(own) {
  const known = new Set(Object.values(kuHash));
  const rows = [...(data?.allow || []).map(x => ({ ...x, l: 'allow' })), ...(data?.block || []).map(x => ({ ...x, l: 'block' }))].filter(x => !known.has(x.h));
  const inner = `${rows.length ? `<div class="acc-list">${rows.map(r => `<div class="acc-row"><span>${IC.user}<b>${esc(r.ad || 'Not yok')}</b><i class="ku-chip ${r.l === 'allow' ? 'w' : 'k'}">${r.l === 'allow' ? 'Beyaz liste' : 'Kara liste'}</i></span><button class="btn sm" data-action="del" data-h="${r.h}" data-l="${r.l}">Çıkar</button></div>`).join('')}</div>` : ''}
    <details class="ku-manual" ${rows.length ? '' : ''}><summary>Elle ekle (programı henüz açmamış biri için)</summary>
      <form class="acc-add" data-form="add2">
        <input id="accEmail" type="email" placeholder="ornek@gmail.com" required>
        <input id="accNote" placeholder="Not (ör. Abim)">
        <div class="ph-actions"><button class="btn primary" name="l" value="allow">Beyaz listeye</button><button class="btn" name="l" value="block">Kara listeye</button></div>
      </form>
      <p class="muted sm">Elle eklenen adresler listede açık yazılmaz, şifrelenmiş halleri saklanır; notu sadece sen görürsün.</p>
    </details>`;
  return own ? `<section><h4>Listede olup henüz görünmeyenler${rows.length ? ' · ' + rows.length : ''}</h4>${inner}</section>` : inner;
}
// Bir listeye al (diğerinden çıkararak) / listeden çıkar
async function kuSet(h, ad, which) {
  const other = which === 'allow' ? 'block' : 'allow';
  return change(async () => {
    if (inList(h, other)) await post({ islem: 'sil', liste: other, h });
    return post({ islem: 'ekle', liste: which, h, ad });
  }, which === 'allow' ? 'Beyaz listeye alındı' : 'Kara listeye alındı');
}
function kuMenu(id, x, y) {
  document.querySelector('.ku-pop')?.remove();
  const u = Array.isArray(ku) && ku.find(z => z.id === id); if (!u) return;
  const st = kuStatus(u); if (st.owner) return;
  const it = (a, ic, t, extra = '') => `<button class="ctx-item" data-ku-act="${a}" ${extra}>${ic}<span>${t}</span></button>`;
  const m = document.createElement('div');
  m.className = 'ctx-menu sched-pop ku-pop';
  m.innerHTML = `<div class="ctx-title">${esc(u.ad || u.e)}</div>
    ${st.w ? it('w-out', IC.close, 'Beyaz listeden çıkar') : it('w-in', IC.check, 'Beyaz listeye al')}
    ${st.k ? it('k-out', IC.close, 'Kara listeden çıkar') : it('k-in', IC.block, 'Kara listeye al', 'data-danger')}
    <div class="ctx-sep"></div>
    ${it('forget', IC.trash, 'Bu listeden kaldır')}`;
  document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) + 'px';
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-ku-act]'); if (!b) return;
    m.remove();
    const a = b.dataset.kuAct, ad = u.ad || u.e.replace(/@.*/, '');
    if (a === 'w-in') kuSet(st.h, ad, 'allow');
    if (a === 'k-in') kuSet(st.h, ad, 'block');
    if (a === 'w-out') change(() => post({ islem: 'sil', liste: 'allow', h: st.h }), 'Beyaz listeden çıkarıldı');
    if (a === 'k-out') change(() => post({ islem: 'sil', liste: 'block', h: st.h }), 'Kara listeden çıkarıldı');
    if (a === 'forget' && confirm(`${u.e} bu listeden kaldırılsın mı? (Programı tekrar açarsa yeniden görünür. Beyaz/kara listedeki yeri değişmez.)`))
      (async () => { try { const j = await post({ islem: 'ku-sil', id: u.id }); if (Array.isArray(j.ku)) ku = j.ku; toast('Kaldırıldı'); } catch (e) { toast(errText(e)); } render(); })();
  });
}
document.addEventListener('contextmenu', e => {
  const r = e.target.closest?.('.ku-row[data-ku]'); if (!r) return;
  e.preventDefault(); kuMenu(r.dataset.ku, e.clientX, e.clientY);
});
document.addEventListener('mousedown', e => { if (!e.target.closest?.('.ku-pop')) document.querySelector('.ku-pop')?.remove(); }, true);
addEventListener('scroll', () => document.querySelector('.ku-pop')?.remove(), true);
let showPwChange = false;
let yonTab = store.get('yonTab', 'users');
let gbFilter = 'all';
const GB_TUR = { hata: ['Hata', 'h'], oneri: ['Öneri', 'o'], diger: ['Diğer', 'd'] };
const gbWhen = t => { const d = new Date(t), now = new Date(), hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? 'Bugün ' + hm : days === 1 ? 'Dün ' + hm : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) + ' ' + hm; };
function gbSection() {
  if (gb === 'eski') return `<section><h4>Geri bildirimler</h4><div class="card upd-card"><b>Bir adım kaldı:</b> Kullanıcıların geri bildirimlerinin buraya gelmesi için zamanlayıcıyı <b>sürüm 5</b>'e güncelle (Mail → Ayarlar → Zamanlanmış gönderim → Güncelle), sonra script.google.com'da <b>Dağıt → Dağıtımları yönet → ✎ → Sürüm: Yeni sürüm → Dağıt</b>. Adres değişmez.</div></section>`;
  if (!Array.isArray(gb)) return '';
  const yeni = gb.filter(g => !g.okundu).length;
  const cnt = k => k === 'all' ? gb.length : k === 'new' ? yeni : gb.filter(g => g.tur === k).length;
  const shown = gb.filter(g => gbFilter === 'all' || (gbFilter === 'new' ? !g.okundu : g.tur === gbFilter));
  const filters = [['all', 'Tümü'], ['new', 'Yeni'], ['hata', 'Hata'], ['oneri', 'Öneri'], ['diger', 'Diğer']];
  return `<section><h4 class="gb-head">Geri bildirimler · ${gb.length}${yeni ? ` <span class="gb-new">${yeni} yeni</span>` : ''}
      <button class="icon-btn gb-refresh" data-action="gb-refresh" title="Yenile">${IC.refresh}</button></h4>
    ${gb.length ? `<div class="gb-filters">${filters.map(([k, t]) => `<button class="${gbFilter === k ? 'on' : ''}" data-action="gb-filter" data-f="${k}">${t}<i>${cnt(k)}</i></button>`).join('')}</div>` : ''}
    ${gb.length && !shown.length ? `<p class="muted sm">${gbFilter === 'new' ? 'Okunmamış geri bildirim yok.' : 'Bu türde geri bildirim yok.'}</p>` : ''}
    ${gb.length ? `<div class="gb-list">${shown.map(g => { const [t, c] = GB_TUR[g.tur] || GB_TUR.diger; return `
      <article class="gb-item ${g.okundu ? '' : 'unread'}">
        <div class="gb-top"><span class="gb-tur ${c}">${t}</span><b class="gb-kim">${esc(g.kim)}</b><small>${esc(gbWhen(g.t))}</small></div>
        <p class="gb-metin">${esc(g.metin)}</p>
        ${g.bilgi ? `<details class="gb-bilgi"><summary>Cihaz bilgisi</summary><pre>${esc(g.bilgi)}</pre></details>` : ''}
        <div class="gb-acts">
          ${g.okundu ? '' : `<button class="btn sm" data-action="gb-read" data-id="${esc(g.id)}">${IC.check} Okundu</button>`}
          <a class="btn sm" href="https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(g.kim)}&su=${encodeURIComponent('Mail geri bildirimin hakkında')}&body=${encodeURIComponent('\n\n> ' + g.metin.replace(/\n/g, '\n> '))}" target="_blank" rel="noopener">${IC.reply} Yanıtla</a>
          <button class="btn sm ghost" data-action="gb-del" data-id="${esc(g.id)}">${IC.trash} Sil</button>
        </div>
      </article>`; }).join('')}</div>
      ${yeni > 1 ? '<div class="ph-actions" style="margin-top:8px"><button class="btn sm" data-action="gb-read-all">Hepsini okundu say</button></div>' : ''}`
      : '<p class="muted sm">Henüz geri bildirim yok. Kullanıcılar Mail → Ayarlar → Uygulama → Geri bildirim gönder\'den yazabilir.</p>'}
  </section>`;
}
async function gbDo(body, ok) {
  try { const j = await post(body); if (Array.isArray(j.gb)) gb = j.gb; if (ok) toast(ok); }
  catch (e) { if (e.j?.hata === 'sifre' || e.j?.hata === 'kilit') { pw = null; return showUnlock(errText(e)); } toast(errText(e)); }
  render();
}
function render() {
  const mode = data.mode || 'off', list = mode === 'block' ? 'block' : 'allow', rows = data[list] || [];
  const tabs = [['users', 'Kullanıcılar', IC.user], ['gb', 'Geri bildirim', IC.chat], ['set', 'Ayarlar', IC.key]];
  const yeni = Array.isArray(gb) ? gb.filter(g => !g.okundu).length : 0;
  const nav = `<nav class="yon-tabs">${tabs.map(([k, t, ic]) => `<button class="${yonTab === k ? 'on' : ''}" data-action="tab" data-t="${k}">${ic}<span>${t}</span>${k === 'gb' && yeni ? `<i class="gb-badge">${yeni}</i>` : ''}</button>`).join('')}</nav>`;
  const body = yonTab === 'gb' ? gbSection() : yonTab === 'set' ? `    <section><h4>Güvenlik</h4>
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
    </section>` : `
    ${!LIVE() && !DEMO ? `<div class="card upd-card"><b>Son adım:</b> Liste servisi çalışıyor ama Mail programı adresi henüz bilmiyor; seçimlerin şu an kimseyi etkilemez. <b>config.js</b>'i indirip GitHub'a (main) yükle.<div class="ph-actions" style="margin-top:8px"><button class="btn" data-action="config">${IC.down} config.js'i indir</button></div></div>` : ''}
    <section><h4>Kimler kullanabilir?</h4>
      <div class="seg yon-seg">${[['off', 'Herkes'], ['allow', 'Beyaz liste'], ['block', 'Kara liste']].map(([m, t]) => `<button class="${mode === m ? 'on' : ''}" data-action="mode" data-m="${m}">${t}</button>`).join('')}</div>
      <p class="muted sm">${mode === 'off' ? 'Programı kuran herkes kullanabilir.' : mode === 'allow' ? 'Beyaz liste: sadece beyaz listedekiler kullanabilir.' : 'Kara liste: herkes kullanabilir, kara listedekiler hariç.'} Sen her zaman kullanabilirsin. Birini listeye almak için aşağıda adına sağ tıkla ya da ⋯'ye dokun.</p>
    </section>

    ${kuSection(mode)}
`;
  $('#app').innerHTML = panel(nav + body);
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
let gb = null;            // geri bildirimler; 'eski' = zamanlayıcı sürüm 5 değil
async function loadGb() {
  try { const j = await post({ islem: 'gb-liste' }); gb = Array.isArray(j.gb) ? j.gb : 'eski'; } catch { gb = gb || 'eski'; }
}
async function openPanel() {
  try { data = await post({ islem: 'liste' }); await Promise.all([loadGb(), loadKu()]); touch(); render(); }
  catch (e) { pw = null; e.j?.hata === 'yetki' ? showLogin(errText(e)) : showUnlock(errText(e)); }
}

// Hareketsizlikte kilitle
let lastAct = Date.now();
const touch = () => { lastAct = Date.now(); };
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, touch, true));
setInterval(() => { if (pw && Date.now() - lastAct > 10 * 60e3) lock(); }, 15e3);
function lock() { pw = null; data = null; gb = null; ku = null; showPwChange = false; showUnlock(); }
// Uygulamaya dönünce yeni geri bildirimleri getir
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && pw && data) { await Promise.all([loadGb(), loadKu()]); render(); } });

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
  'ku-menu': el => { const r = el.getBoundingClientRect(); kuMenu(el.dataset.ku, r.right - 240, r.bottom + 4); },
  'gb-filter': el => { gbFilter = el.dataset.f; render(); },
  'gb-refresh': async el => { el.classList.add('spin'); await Promise.all([loadGb(), loadKu()]); render(); toast('Güncellendi'); },
  tab: el => { yonTab = el.dataset.t; store.set('yonTab', yonTab); showPwChange = false; render(); scrollTo(0, 0); },
  'gb-read': el => gbDo({ islem: 'gb-oku', id: el.dataset.id }),
  'gb-read-all': () => gbDo({ islem: 'gb-oku' }, 'Hepsi okundu sayıldı'),
  'gb-del': el => { if (confirm('Bu geri bildirim silinsin mi?')) gbDo({ islem: 'gb-sil', id: el.dataset.id }, 'Silindi'); },
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
    if (m === 'allow' && !(data.allow || []).length && !confirm('Beyaz liste şu an boş: seçilince programı senden başka kimse kullanamaz. Devam edilsin mi?')) return;
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
    try { data = await post({ islem: 'sifre-kur', yeni: a, sifre: '' }); pw = a; await Promise.all([loadGb(), loadKu()]); touch(); render(); toast('Yönetici şifresi kaydedildi'); }
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
  add2: async (f, e) => {
    const email = $('#accEmail').value.trim(), note = $('#accNote').value.trim(), l = e?.submitter?.value || 'allow';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Geçerli bir e-posta adresi yaz');
    const h = await accHash(email);
    if (h === CFG.OWNER_HASH) return toast('Bu senin adresin; sen her zaman kullanabilirsin');
    kuSet(h, note || email.replace(/@.*/, ''), l);
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
  if (f && FORMS[f.dataset.form]) { e.preventDefault(); FORMS[f.dataset.form](f, e); }
});

boot();
