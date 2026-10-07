/* ───────────── Erişim listesi (kimler kullanabilir) ─────────────
   Liste sahibin Google hesabındaki zamanlayıcıda (Apps Script web uygulaması) durur.
   Uygulama girişten sonra listeyi okur; kullanıcı izinli değilse "erişim yok" ekranı gösterir.
   E-postalar listede açık yazılmaz, sadece şifrelenmiş halleri (SHA-256) tutulur.
   Modlar: off (herkes) · allow (sadece izin verilenler) · block (engellenenler hariç herkes).
   Sahip her zaman kullanabilir. ACCESS_URL boşken tamamen kapalıdır. */
'use strict';

const ACC_SALT = 'mail-erisim-v1:';
const ACC_PUBLIC_URL = () => (window.MAIL_CONFIG?.ACCESS_URL || '').trim();
async function accHash(email) {
  const b = new TextEncoder().encode(ACC_SALT + String(email || '').trim().toLowerCase());
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
}
const isOwnerHash = h => h && h === window.MAIL_CONFIG?.OWNER_HASH;
let accIsOwner = false;

// Listeyi oku (önbellekli; internet yoksa son bilinen liste kullanılır)
async function accFetch(url) {
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j && j.mode) { store.set('accessCache', j); return j; }
  } catch {}
  return store.get('accessCache', null);
}

// Girişten sonra çağrılır; false dönerse uygulama durur
async function accessGate(email) {
  const h = await accHash(email);
  accIsOwner = isOwnerHash(h);
  const url = ACC_PUBLIC_URL();
  if (DEMO || !url || accIsOwner) return true;
  const L = await accFetch(url);
  if (!L || L.mode === 'off') return true;
  const ok = L.mode === 'allow' ? (L.allow || []).includes(h) : !(L.block || []).includes(h);
  if (!ok) showNoAccess(email);
  return ok;
}
// Açıkken de ara ara kontrol et (engellenen kişi program açık kalsa da durdurulsun)
setInterval(async () => {
  if (!S.email || accIsOwner || !ACC_PUBLIC_URL() || !$('#shell')) return;
  const L = await accFetch(ACC_PUBLIC_URL()); if (!L || L.mode === 'off') return;
  const h = await accHash(S.email);
  const ok = L.mode === 'allow' ? (L.allow || []).includes(h) : !(L.block || []).includes(h);
  if (!ok) showNoAccess(S.email);
}, 30 * 60e3);

function showNoAccess(email) {
  $('#modal').innerHTML = '';
  $('#app').innerHTML = `
  <div class="center-screen">
    <div class="brand-mark">${IC.block}</div>
    <h1>Erişim yok</h1>
    <p><b>${esc(email)}</b> hesabının bu programı kullanma izni yok.</p>
    <p class="muted">Mailine bir şey olmadı; sadece bu program kapalı. Gmail'i her zamanki gibi kullanabilirsin. İzin için programı sana veren kişiyle konuş.</p>
    <button class="btn" data-action="logout">Başka hesapla giriş yap</button>
  </div>`;
}

// Listeyi değiştirmek ayrı programda: yonetici.html (Mail Yönetici)
