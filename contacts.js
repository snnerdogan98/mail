/* ───────────── Alıcı adresi tamamlama ─────────────
   "Kime" ve "Cc" alanına yazmaya başlayınca daha önce mail attığın kişileri önerir.
   Kişi listesi Gönderilmiş klasöründeki son maillerin alıcılarından çıkarılır (yeni bir Google izni gerekmez),
   sadece bu cihazda saklanır ve günde bir kez tazelenir. En çok ve en son yazıştıkların öne gelir. */
'use strict';

const AC_MAX = 6, AC_SENT = 300, AC_DAY = 864e5;
const acOff = () => store.get('acContacts', true) === false;
const trLow = s => String(s || '').toLocaleLowerCase('tr-TR');

Object.assign(RealGmail, {
  async sentHeaders(max = AC_SENT) {
    const r = await call('messages', { query: { labelIds: ['SENT'], maxResults: max } });
    const ms = await pmap(r.messages || [], 6, m => call('messages/' + m.id, { query: { format: 'metadata', metadataHeaders: ['To', 'Cc'] } }).catch(() => null));
    return ms.filter(Boolean).map(m => ({ to: hdr(m, 'To'), cc: hdr(m, 'Cc'), t: +m.internalDate || 0 }));
  }
});
if (window.MockGmail) MockGmail.sentHeaders = async () => {
  const d = Date.now(), D = 864e5;
  return [
    { to: 'Ahmet Yılmaz <ahmet.yilmaz@gmail.com>', t: d - 1 * D }, { to: 'Ahmet Yılmaz <ahmet.yilmaz@gmail.com>', t: d - 3 * D },
    { to: 'Abim <mehmet.erdogan@gmail.com>', cc: 'Annem <ayse.erdogan@gmail.com>', t: d - 2 * D },
    { to: 'Ali Veli <ali.veli@ornekfirma.com>', t: d - 5 * D }, { to: 'Ali Veli <ali.veli@ornekfirma.com>', t: d - 9 * D },
    { to: 'ayse.kaya@hotmail.com', t: d - 40 * D }, { to: '"Av. Selin Aksoy" <selin@aksoyhukuk.com.tr>', t: d - 20 * D },
    { to: 'Mehmet Demir <mehmet.demir@ornekfirma.com>', t: d - 60 * D }, { to: 'İlknur Şahin <ilknur.sahin@gmail.com>', t: d - 15 * D }
  ];
};

// "Ad <a@b>, b@c" → [{n, e}]
function parseAddrList(s) {
  const out = [];
  String(s || '').replace(/(?:"([^"]*)"|([^,<"]*?))\s*<([^>]+@[^>]+)>|([^\s<>,;"]+@[^\s<>,;"]+)/g, (m, q, n, e1, e2) => {
    const e = (e1 || e2 || '').trim().toLowerCase();
    if (e) out.push({ e, n: decodeMimeWords((q ?? n ?? '').trim()).replace(/^'|'$/g, '') });
    return m;
  });
  return out;
}

/* Adres defteri */
let acBook = null, acBuilding = null;
function acLoad() { if (!acBook) acBook = store.get('contactsBook', null); return acBook; }
function acAdd(map, { e, n }, t, w = 1) {
  if (!e || e === S.email || /no-?reply|do-?not-?reply|mailer-daemon|bounce/i.test(e)) return;
  const c = map.get(e) || { e, n: '', c: 0, t: 0 };
  c.c += w;
  if (n && n.toLowerCase() !== e && (!c.n || t >= c.t)) c.n = n;
  c.t = Math.max(c.t, t || 0);
  map.set(e, c);
}
async function acBuild(force) {
  const b = acLoad();
  if (!force && b && Date.now() - b.at < AC_DAY) return b;
  if (acBuilding) return acBuilding;
  acBuilding = (async () => {
    try {
      const rows = await Gmail.sentHeaders(AC_SENT);
      const map = new Map();
      // Elle eklenenler (son gönderimler) kaybolmasın
      for (const c of (b?.list || []).filter(x => x.own)) map.set(c.e, { ...c });
      for (const r of rows) for (const a of [...parseAddrList(r.to), ...parseAddrList(r.cc)]) acAdd(map, a, r.t);
      acBook = { at: Date.now(), list: [...map.values()] };
      store.set('contactsBook', acBook);
    } catch {}
    acBuilding = null;
    return acBook;
  })();
  return acBuilding;
}
// Gönderdiğin anda alıcıları deftere ekle (ertesi günü beklemesin)
function acRemember(to, cc) {
  const b = acLoad() || { at: 0, list: [] };
  const map = new Map(b.list.map(c => [c.e, c]));
  for (const a of [...parseAddrList(to), ...parseAddrList(cc)]) { acAdd(map, a, Date.now()); map.get(a.e) && (map.get(a.e).own = 1); }
  acBook = { at: b.at, list: [...map.values()] };
  store.set('contactsBook', acBook);
}

function acScore(c) {
  const age = (Date.now() - c.t) / AC_DAY;
  return c.c + (age < 7 ? 6 : age < 30 ? 3 : age < 180 ? 1 : 0);
}
function acFind(q, skip) {
  q = trLow(q).trim();
  if (!q) return [];
  const list = (acLoad()?.list || []).filter(c => !skip.has(c.e));
  const hits = [];
  for (const c of list) {
    const name = trLow(c.n), mail = c.e;
    let rank = -1;
    if (name.startsWith(q) || mail.startsWith(q)) rank = 3;
    else if (name.split(/[\s.\-_]+/).some(w => w.startsWith(q)) || mail.split(/[.@\-_]/).some(w => w.startsWith(q))) rank = 2;
    else if (name.includes(q) || mail.includes(q)) rank = 1;
    if (rank > 0) hits.push([rank * 100 + acScore(c), c]);
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, AC_MAX).map(h => h[1]);
}

/* Açılır öneri listesi */
function acAttach(input) {
  if (!input || input.dataset.ac) return;
  input.dataset.ac = '1';
  input.setAttribute('autocomplete', 'off');
  const form = input.form;
  let pop = null, items = [], idx = 0;
  const close = () => { pop?.remove(); pop = null; items = []; };
  const tokenStart = () => { const v = input.value.slice(0, input.selectionStart ?? input.value.length); return Math.max(v.lastIndexOf(','), v.lastIndexOf(';')) + 1; };
  const show = () => {
    if (acOff()) return close();
    const caret = input.selectionStart ?? input.value.length;
    const q = input.value.slice(tokenStart(), caret).trim();
    const already = new Set(emailsIn(input.value.slice(0, tokenStart()) + ',' + input.value.slice(caret)).map(x => x.toLowerCase()));
    items = q.length ? acFind(q, already) : [];
    if (!items.length) return close();
    idx = Math.min(idx, items.length - 1);
    if (!pop) { pop = document.createElement('div'); pop.className = 'ac-pop sched-pop'; form.appendChild(pop); }
    const fr = form.getBoundingClientRect(), ir = input.closest('.field').getBoundingClientRect();
    pop.style.top = (ir.bottom - fr.top + form.scrollTop - 2) + 'px';
    pop.style.left = Math.max(8, ir.left - fr.left + 8) + 'px';
    pop.innerHTML = items.map((c, i) => `<div class="ac-item ${i === idx ? 'on' : ''}" data-i="${i}">
      <span class="ac-av">${esc((c.n || c.e).trim().charAt(0).toLocaleUpperCase('tr-TR'))}</span>
      <span class="ac-txt"><b>${esc(c.n || c.e)}</b>${c.n ? `<small>${esc(c.e)}</small>` : ''}</span></div>`).join('');
  };
  const pick = i => {
    const c = items[i]; if (!c) return;
    const st = tokenStart(), caret = input.selectionStart ?? input.value.length;
    let rest = input.value.slice(caret).replace(/^[^,;]*[,;]?\s*/, '');
    const head = input.value.slice(0, st).replace(/\s*$/, '');
    const one = c.n && !/[,;<>"]/.test(c.n) ? `${c.n} <${c.e}>` : c.e;
    const before = (head ? head + ' ' : '') + one + ', ';
    input.value = before + rest;
    input.setSelectionRange(before.length, before.length);
    close();
    input.focus();
  };
  input.addEventListener('input', () => { idx = 0; acBuild().then(() => { if (document.activeElement === input) show(); }); show(); });
  input.addEventListener('focus', () => acBuild());
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (!pop) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; show(); }
    else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); pick(idx); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  // Dokunma/tıklama: odak kaybolmadan seç
  form.addEventListener('pointerdown', e => {
    const it = e.target.closest?.('.ac-item');
    if (it && pop?.contains(it)) { e.preventDefault(); pick(+it.dataset.i); }
  });
}

// Yazma penceresi her açıldığında alanlara bağla
const _acOpenCompose = openCompose;
openCompose = function (...a) {
  const r = _acOpenCompose.apply(this, a);
  const f = $('#composeForm');
  if (f) { acAttach(f.to); acAttach(f.cc); }
  return r;
};
document.addEventListener('submit', e => {
  const f = e.target;
  if (f?.id === 'composeForm') try { acRemember(f.to?.value, f.cc?.value); } catch {}
}, true);
// Program açıldıktan biraz sonra defteri arka planda hazırla (liste yüklenmesiyle yarışmasın)
setTimeout(function acWarm() { if (S.email) acBuild(); else setTimeout(acWarm, 5000); }, 8000);

/* Ayarlar satırı */
function contactsRow() {
  const n = acLoad()?.list?.length || 0;
  return `<div class="set-row"><div><b>Alıcı önerileri</b><span>"Kime" alanına yazarken daha önce mail attığın kişileri önerir.${n ? ` Listede ${n} kişi var.` : ''} Liste sadece bu cihazda tutulur.</span></div>
    ${!acOff() && n ? '<button class="btn" data-action="ac-refresh">Yenile</button>' : ''}
    <button class="switch ${!acOff() ? 'on' : ''}" data-action="ac-toggle" role="switch" aria-checked="${!acOff()}"><i></i></button></div>`;
}
Object.assign(ACTIONS, {
  'ac-toggle': () => { store.set('acContacts', acOff()); openSettings(); },
  'ac-refresh': async el => { el.disabled = true; el.textContent = 'Yenileniyor…'; await acBuild(true); toast(`Alıcı listesi güncellendi · ${acLoad()?.list?.length || 0} kişi`); openSettings(); }
});
