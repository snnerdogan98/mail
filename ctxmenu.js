/* ───────────── Sağ tık menüsü ─────────────
   Listede bir maile sağ tıklayınca tarayıcının menüsü yerine bizim menümüz çıkar.
   Birden çok mail seçiliyken seçili bir maile sağ tıklanırsa menü hepsine uygulanır.
   Mailin içindeki yazılarda (kopyalama vb.) tarayıcının kendi menüsü kalır. */
'use strict';

const ctxOn = () => store.get('ctxMenu', true) !== false;

function ctxClose() { document.querySelector('.ctx-menu')?.remove(); document.querySelectorAll('.row.ctx').forEach(r => r.classList.remove('ctx')); }

function ctxItem(act, icon, label, extra = '') {
  return `<button type="button" class="ctx-item" data-ctx="${act}" ${extra}>${icon || '<i></i>'}<span>${label}</span></button>`;
}
const ctxSep = '<div class="ctx-sep"></div>';

function ctxBuild(t, multi) {
  if (multi) {
    const ts = S.threads.filter(x => SEL.has(x.id));
    const anyUnread = ts.some(x => x.unread);
    return `<div class="ctx-title">${SEL.size} konu seçili</div>
      ${S.labelId !== 'TRASH' && S.labelId !== 'SPAM' ? ctxItem('m-archive', IC.archive, 'Arşivle') : ''}
      ${ctxItem(anyUnread ? 'm-read' : 'm-unread', anyUnread ? IC.mail : IC.unread, anyUnread ? 'Okundu yap' : 'Okunmadı yap')}
      ${ctxItem('m-labels', IC.tag, 'Etiketle…')}
      ${ctxSep}
      ${S.labelId === 'SPAM' ? ctxItem('m-notspam', IC.check, 'Spam değil') : ctxItem('m-spam', IC.block, 'Spam olarak işaretle')}
      ${ctxItem('m-trash', IC.trash, 'Sil', 'data-danger')}
      ${ctxSep}
      ${ctxItem('m-clear', IC.close, 'Seçimi kaldır')}`;
  }
  const inbox = t.labelIds.includes('INBOX'), trash = S.labelId === 'TRASH', spam = S.labelId === 'SPAM';
  const snooze = typeof snPresets === 'function' && !trash && !spam;
  return `<div class="ctx-title">${esc(t.from || t.fromEmail || '')}</div>
    ${ctxItem('open', IC.mail, 'Aç')}
    ${ctxItem('reply', IC.reply, 'Yanıtla')}
    ${ctxItem('forward', IC.forward, 'İlet')}
    ${ctxSep}
    ${ctxItem(t.unread ? 'read' : 'unread', t.unread ? IC.mail : IC.unread, t.unread ? 'Okundu yap' : 'Okunmadı yap')}
    ${ctxItem('star', t.starred ? IC.starFill : IC.star, t.starred ? 'Yıldızı kaldır' : 'Yıldızla')}
    ${inbox ? ctxItem('archive', IC.archive, 'Arşivle') : (!trash && !spam ? ctxItem('inbox', IC.inbox, 'Gelen kutusuna taşı') : '')}
    ${ctxItem('labels', IC.tag, 'Etiketle…')}
    ${snooze ? ctxItem('snooze', IC.alarm, 'Ertele', 'data-sub="snooze"') : ''}
    ${ctxItem('select', IC.check, 'Seç')}
    ${ctxSep}
    ${t.fromEmail ? ctxItem('from', IC.search, 'Bu göndericiden gelenler') : ''}
    ${t.fromEmail && t.fromEmail !== S.email ? ctxItem('block', IC.block, 'Göndericiyi engelle…') : ''}
    ${spam ? ctxItem('notspam', IC.check, 'Spam değil') : ctxItem('spam', IC.alert || IC.block, 'Spam olarak işaretle')}
    ${trash ? ctxItem('untrash', IC.inbox, 'Çöp kutusundan çıkar') : ctxItem('trash', IC.trash, 'Sil', 'data-danger')}`;
}

function ctxPlace(menu, x, y) {
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
}

function ctxOpen(row, x, y) {
  ctxClose();
  const t = S.threads.find(z => z.id === row.dataset.id);
  if (!t) return;
  const multi = typeof selActive === 'function' && selActive() && SEL.has(t.id) && SEL.size > 1;
  row.classList.add('ctx');
  const menu = document.createElement('div');
  menu.className = 'ctx-menu sched-pop';
  menu.innerHTML = ctxBuild(t, multi);
  ctxPlace(menu, x, y);
  menu.addEventListener('click', e => {
    const it = e.target.closest('[data-ctx]');
    if (!it) return;
    if (it.dataset.sub === 'snooze') return ctxSnooze(menu, it, t);
    if (it.dataset.when) { ctxClose(); return snSnooze(t.id, +it.dataset.when); }
    ctxClose();
    ctxRun(it.dataset.ctx, t);
  });
}

// Ertele alt menüsü (menünün yanında açılır)
function ctxSnooze(menu, it, t) {
  menu.querySelector('.ctx-sub')?.remove();
  const sub = document.createElement('div');
  sub.className = 'ctx-menu ctx-sub sched-pop';
  sub.innerHTML = `<div class="ctx-title">Ertele</div>` + snPresets().map(([n, v]) =>
    `<button type="button" class="ctx-item" data-ctx="snz" data-when="${v}"><i></i><span>${n}</span><small>${esc(schedWhen(v))}</small></button>`).join('')
    + ctxItem('snooze-pick', IC.clock, 'Tarih ve saat seç…');
  menu.appendChild(sub);
  const r = it.getBoundingClientRect(), mr = menu.getBoundingClientRect();
  const right = mr.right + sub.offsetWidth + 6 < innerWidth;
  sub.style.left = (right ? mr.width + 4 : -sub.offsetWidth - 4) + 'px';
  sub.style.top = Math.min(r.top - mr.top - 8, innerHeight - mr.top - sub.offsetHeight - 8) + 'px';
}

async function ctxRun(act, t) {
  const id = t.id, one = [id];
  const withThread = async fn => { await openThread(id); if (S.thread?.id === id) fn(S.thread); };
  switch (act) {
    case 'open': return openThread(id);
    case 'reply': return withThread(th => replyTo(th.messages[th.messages.length - 1]));
    case 'forward': return withThread(th => forward(th.messages[th.messages.length - 1]));
    case 'read': case 'unread': case 'archive': case 'spam': case 'notspam': return selDo(act, one);
    case 'trash': case 'untrash': return selDo(act, one);
    case 'inbox':
      try { await Gmail.modifyThread(id, ['INBOX'], []); markLocalQuiet(id, ['INBOX'], []); renderList(); refreshCountsSoon(); toast('Gelen kutusuna taşındı'); }
      catch (e) { if (!(e instanceof AuthError)) toast(e.message); }
      return;
    case 'star': {
      const on = t.starred;
      try { await Gmail.modifyThread(id, on ? [] : ['STARRED'], on ? ['STARRED'] : []); markLocalQuiet(id, on ? [] : ['STARRED'], on ? ['STARRED'] : []); renderList(); refreshCountsSoon(); }
      catch (e) { if (!(e instanceof AuthError)) toast(e.message); }
      return;
    }
    case 'labels': return openSelLabels(one);
    case 'select': return selToggle(id);
    case 'snooze-pick': return withThread(() => { const b = document.querySelector('.reader-bar [data-action="snooze"]'); if (b) openSnoozeMenu(b); });
    case 'from':
      S.q = `from:(${t.fromEmail})`; $('#search').value = 'from:' + t.fromEmail;
      if (S.view !== 'list') closeReader();
      renderSidebar(); return loadList();
    case 'block': return withThread(() => openBlockDialog());
    // çoklu seçim
    case 'm-archive': return selDo('archive');
    case 'm-read': return selDo('read');
    case 'm-unread': return selDo('unread');
    case 'm-spam': return selDo('spam');
    case 'm-notspam': return selDo('notspam');
    case 'm-trash': return selDo('trash');
    case 'm-labels': return openSelLabels();
    case 'm-clear': return selClear();
  }
}

document.addEventListener('contextmenu', e => {
  if (!ctxOn() || e.shiftKey) return;                       // Shift+sağ tık: tarayıcının menüsü
  const row = e.target.closest?.('#list .row[data-id]');
  if (!row || (typeof lpFired !== 'undefined' && lpFired)) return;
  e.preventDefault();
  ctxOpen(row, e.clientX, e.clientY);
});
document.addEventListener('mousedown', e => { if (!e.target.closest?.('.ctx-menu')) ctxClose(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.ctx-menu')) { e.stopPropagation(); ctxClose(); } }, true);
addEventListener('resize', ctxClose);
addEventListener('blur', ctxClose);
document.addEventListener('scroll', e => { if (!e.target.closest?.('.ctx-menu')) ctxClose(); }, true);

/* Ayarlar satırı (Klavye bölümünün yanında) */
function ctxRow() {
  return `<div class="set-row"><div><b>Sağ tık menüsü</b><span>Listede bir maile sağ tıklayınca yanıtla, arşivle, ertele, etiketle gibi seçenekler çıkar. Tarayıcının menüsü için Shift + sağ tık.</span></div>
    <button class="switch ${ctxOn() ? 'on' : ''}" data-action="ctx-toggle" role="switch" aria-checked="${ctxOn()}"><i></i></button></div>`;
}
Object.assign(ACTIONS, { 'ctx-toggle': () => { store.set('ctxMenu', !ctxOn()); openSettings(); } });
