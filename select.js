/* ───────────── Toplu seçim ─────────────
   Bilgisayarda: satırın solundaki yuvarlağa tıkla (Shift ile aralık seçilir), X tuşu seçer.
   Telefonda: bir maile basılı tut, seçim modu açılır; sonra dokunarak ekle/çıkar.
   Seçim varken üstte çubuk çıkar: Tümü, Arşivle, Sil, Okundu/Okunmadı, Etiketle, Spam. Hepsi geri alınabilir. */
'use strict';

const SEL = new Set();
let selAnchor = null;
const selActive = () => SEL.size > 0;

Object.assign(RealGmail, { untrashThread: id => call(`threads/${id}/untrash`, { method: 'POST' }) });
if (window.MockGmail) MockGmail.untrashThread = async id => MockGmail.modifyThread(id, ['INBOX'], ['TRASH']);

function selToggle(id, range) {
  const ids = S.threads.map(t => t.id);
  if (range && selAnchor && ids.includes(selAnchor)) {
    const [a, b] = [ids.indexOf(selAnchor), ids.indexOf(id)].sort((x, y) => x - y);
    ids.slice(a, b + 1).forEach(x => SEL.add(x));
  } else {
    SEL.has(id) ? SEL.delete(id) : SEL.add(id);
    selAnchor = id;
  }
  selRender();
}
function selClear() { SEL.clear(); selAnchor = null; selRender(); }
function selAll() {
  const all = S.threads.every(t => SEL.has(t.id));
  if (all) SEL.clear(); else S.threads.forEach(t => SEL.add(t.id));
  selRender();
}
// Listede olmayanları seçimden düş (sayfa/etiket değişince)
function selPrune() { const ids = new Set(S.threads.map(t => t.id)); [...SEL].forEach(id => { if (!ids.has(id)) SEL.delete(id); }); }

function selBar() {
  let bar = $('#selbar');
  if (!bar) {
    const head = $('.listpane > .bar'); if (!head) return null;
    bar = document.createElement('div'); bar.id = 'selbar'; bar.className = 'selbar';
    head.after(bar);
  }
  return bar;
}
function selRender() {
  selPrune();
  const shell = $('#shell'); if (!shell) return;
  shell.classList.toggle('selecting', selActive());
  document.querySelectorAll('#list .row[data-id]').forEach(r => {
    const on = SEL.has(r.dataset.id);
    r.classList.toggle('picked', on);
    r.querySelector('.row-check')?.setAttribute('aria-checked', on);
  });
  const bar = selBar(); if (!bar) return;
  if (!selActive()) { bar.innerHTML = ''; return; }
  const ts = S.threads.filter(t => SEL.has(t.id));
  const anyUnread = ts.some(t => t.unread);
  const all = S.threads.length && S.threads.every(t => SEL.has(t.id));
  const inSpam = S.labelId === 'SPAM', inTrash = S.labelId === 'TRASH';
  bar.innerHTML = `
    <button class="icon-btn" data-action="sel-clear" title="Seçimi kaldır (Esc)">${IC.close}</button>
    <b class="sel-n">${SEL.size} seçili</b>
    <button class="btn sm ghost sel-all" data-action="sel-all">${all ? 'Hiçbiri' : 'Tümü'}</button>
    <span class="sel-acts">
      ${!inTrash && !inSpam && S.labelId !== 'SENT' && S.labelId !== 'DRAFT' ? `<button class="icon-btn" data-action="sel-do" data-op="archive" title="Arşivle">${IC.archive}</button>` : ''}
      ${inTrash ? `<button class="icon-btn" data-action="sel-do" data-op="untrash" title="Çöp kutusundan çıkar">${IC.archive}</button>` : `<button class="icon-btn" data-action="sel-do" data-op="trash" title="Sil">${IC.trash}</button>`}
      <button class="icon-btn" data-action="sel-do" data-op="${anyUnread ? 'read' : 'unread'}" title="${anyUnread ? 'Okundu yap' : 'Okunmadı yap'}">${anyUnread ? IC.mail : IC.unread}</button>
      <button class="icon-btn" data-action="sel-labels" title="Etiketle">${IC.tag}</button>
      ${inSpam ? `<button class="icon-btn" data-action="sel-do" data-op="notspam" title="Spam değil">${IC.check}</button>` : `<button class="icon-btn" data-action="sel-do" data-op="spam" title="Spam">${IC.block}</button>`}
    </span>`;
}

// renderList her çizildiğinde seçim görünümünü uygula
const _selRenderList = renderList;
renderList = function (...a) { _selRenderList.apply(this, a); selRender(); };

/* Toplu işlem */
const SEL_OPS = {
  archive: { one: 'Arşivlendi', add: [], rm: ['INBOX'], drop: () => S.labelId === 'INBOX', msg: n => `${n} konu arşivlendi`, undo: { add: ['INBOX'], rm: [] } },
  read: { one: 'Okundu yapıldı', add: [], rm: ['UNREAD'], msg: n => `${n} konu okundu yapıldı`, undo: { add: ['UNREAD'], rm: [] } },
  unread: { one: 'Okunmadı yapıldı', add: ['UNREAD'], rm: [], msg: n => `${n} konu okunmadı yapıldı`, undo: { add: [], rm: ['UNREAD'] } },
  spam: { one: 'Spam\'e taşındı', add: ['SPAM'], rm: ['INBOX'], drop: () => true, msg: n => `${n} konu spam'e taşındı`, undo: { add: ['INBOX'], rm: ['SPAM'] } },
  notspam: { one: 'Gelen kutusuna taşındı', add: ['INBOX'], rm: ['SPAM'], drop: () => true, msg: n => `${n} konu gelen kutusuna taşındı`, undo: { add: ['SPAM'], rm: ['INBOX'] } }
};
// only: seçim yerine belirli konular (sağ tık menüsü)
async function selDo(op, only) {
  const ids = only || [...SEL];
  if (!ids.length) return;
  const snapshot = S.threads.filter(t => ids.includes(t.id)).map(t => ({ ...t, labelIds: [...t.labelIds] }));
  if (!only) selClear();
  try {
    if (op === 'trash' || op === 'untrash') {
      await pmap(ids, 5, id => op === 'trash' ? Gmail.trashThread(id) : Gmail.untrashThread(id));
      S.threads = S.threads.filter(t => !ids.includes(t.id));
      if (ids.includes(S.threadId)) closeReader(); else renderList();
      refreshCountsSoon();
      if (op === 'untrash') return toast(`${ids.length} konu gelen kutusuna geri alındı`);
      return toast(ids.length === 1 ? 'Çöp kutusuna taşındı' : `${ids.length} konu çöp kutusuna taşındı`, [['Geri al', async () => {
        await pmap(ids, 5, id => Gmail.untrashThread(id));
        selRestore(snapshot); toast('Geri alındı');
      }]], 8000);
    }
    const o = SEL_OPS[op];
    await pmap(ids, 5, id => Gmail.modifyThread(id, o.add, o.rm));
    ids.forEach(id => markLocalQuiet(id, o.add, o.rm));
    if (o.drop?.()) { S.threads = S.threads.filter(t => !ids.includes(t.id)); if (ids.includes(S.threadId)) closeReader(); }
    renderList(); renderSidebar(); refreshCountsSoon();
    toast(ids.length === 1 && o.one ? o.one : o.msg(ids.length), [['Geri al', async () => {
      await pmap(ids, 5, id => Gmail.modifyThread(id, o.undo.add, o.undo.rm));
      if (o.drop?.()) selRestore(snapshot); else { ids.forEach(id => markLocalQuiet(id, o.undo.add, o.undo.rm)); renderList(); }
      refreshCountsSoon(); toast('Geri alındı');
    }]], 8000);
  } catch (e) { if (!(e instanceof AuthError)) toast('İşlem tamamlanamadı: ' + e.message); refreshCountsSoon(); loadList(); }
}
// Liste ve sayaçları tek tek çizmeden güncelle (çok mailde yavaşlamasın)
function markLocalQuiet(id, add, rm) {
  const t = S.threads.find(x => x.id === id); if (!t) return;
  const s = new Set(t.labelIds); add.forEach(x => s.add(x)); rm.forEach(x => s.delete(x));
  t.labelIds = [...s]; t.unread = s.has('UNREAD'); t.starred = s.has('STARRED');
  if (S.thread?.id === id) S.thread.labelIds = [...s];
}
function selRestore(snapshot) {
  const have = new Set(S.threads.map(t => t.id));
  S.threads = S.threads.concat(snapshot.filter(t => !have.has(t.id))).sort((a, b) => b.date - a.date);
  renderList(); refreshCountsSoon();
}

/* Toplu etiketleme: hepsinde olan ✓, bazılarında olan – (dokunulmaz) */
let selLabelIds = null;
function openSelLabels(only) {
  selLabelIds = only || [...SEL];
  const ts = S.threads.filter(t => selLabelIds.includes(t.id));
  if (!ts.length) return;
  const state = id => { const n = ts.filter(t => t.labelIds.includes(id)).length; return n === ts.length ? 'all' : n ? 'some' : 'none'; };
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet picker">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>${ts.length === 1 ? 'Etiketle' : ts.length + ' konuyu etiketle'}</h3>
        <button class="btn primary" data-action="sel-apply-labels">Uygula</button>
      </header>
      <div class="pick-list">
        ${userLabels().filter(l => !(typeof isSnLabel === 'function' && isSnLabel(l))).map(l => {
          let depth = 0; for (let p = l; p.parentId; p = S.labelById[p.parentId]) depth++;
          const st = state(l.id);
          return `<label class="pick" style="--d:${depth}"><input type="checkbox" value="${l.id}" data-st="${st}" ${st === 'all' ? 'checked' : ''}>${dot(l.color)}<span class="pick-name">${esc(shortName(l))}</span><i class="pick-check">${IC.check}</i></label>`;
        }).join('')}
      </div>
    </div>
  </div>`;
  document.querySelectorAll('.pick input[data-st="some"]').forEach(i => { i.indeterminate = true; i.closest('.pick').classList.add('some'); });
  document.querySelectorAll('.pick input').forEach(i => i.addEventListener('change', () => { i.dataset.touched = '1'; i.closest('.pick').classList.remove('some'); }));
}
async function applySelLabels() {
  const ids = selLabelIds || [...SEL];
  const add = [], rm = [];
  document.querySelectorAll('.pick input').forEach(i => {
    if (i.dataset.st === 'some' && !i.dataset.touched) return;
    if (i.checked && i.dataset.st !== 'all') add.push(i.value);
    if (!i.checked && i.dataset.st !== 'none') rm.push(i.value);
  });
  closeModal();
  if (!add.length && !rm.length) return;
  try {
    await pmap(ids, 5, id => Gmail.modifyThread(id, add, rm));
    ids.forEach(id => markLocalQuiet(id, add, rm));
    if (rm.includes(S.labelId)) S.threads = S.threads.filter(t => !ids.includes(t.id));
    if (ids.every(id => SEL.has(id))) selClear();
    renderList(); renderSidebar(); refreshCountsSoon();
    toast(ids.length === 1 ? 'Etiketler güncellendi' : `${ids.length} konunun etiketleri güncellendi`);
  } catch (e) { if (!(e instanceof AuthError)) toast('Etiket değiştirilemedi: ' + e.message); }
}

/* Telefonda basılı tutunca seçim */
let lpTimer = null, lpFired = false, lpStart = null;
document.addEventListener('touchstart', e => {
  const row = e.target.closest?.('#list .row[data-id]');
  lpFired = false;
  if (!row) return;
  lpStart = [e.touches[0].clientX, e.touches[0].clientY];
  lpTimer = setTimeout(() => { lpFired = true; navigator.vibrate?.(15); selToggle(row.dataset.id); }, 480);
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!lpTimer || !lpStart) return;
  const t = e.touches[0];
  if (Math.abs(t.clientX - lpStart[0]) > 10 || Math.abs(t.clientY - lpStart[1]) > 10) { clearTimeout(lpTimer); lpTimer = null; }
}, { passive: true });
document.addEventListener('touchend', () => { clearTimeout(lpTimer); lpTimer = null; });
document.addEventListener('contextmenu', e => { if (lpFired && e.target.closest?.('#list .row')) e.preventDefault(); });
// Basılı tutmanın ardından gelen tıklamayı yut
document.addEventListener('click', e => {
  if (lpFired && e.target.closest?.('#list .row')) { e.stopPropagation(); e.preventDefault(); lpFired = false; }
}, true);

// Seçim modundayken satıra tıklamak seçer (açmaz)
const _openThreadAct = ACTIONS['open-thread'];
Object.assign(ACTIONS, {
  'open-thread': (el, e) => {
    if (selActive() && el.classList.contains('row')) return selToggle(el.dataset.id, e?.shiftKey);
    if (e?.shiftKey && el.classList.contains('row') && !inNotes()) return selToggle(el.dataset.id, true);
    return _openThreadAct(el, e);
  },
  'sel-toggle': (el, e) => { e?.stopPropagation(); selToggle(el.dataset.id, e?.shiftKey); },
  'sel-clear': () => selClear(),
  'sel-all': () => selAll(),
  'sel-do': el => selDo(el.dataset.op),
  'sel-labels': () => openSelLabels(),
  'sel-apply-labels': () => applySelLabels()
});

// Başka etikete / aramaya geçince seçimi bırak
let selPlace = '';
const _loadListSel = loadList;
loadList = function (more, ...rest) {
  const place = S.labelId + '|' + S.q;
  if (!more && place !== selPlace) { SEL.clear(); selAnchor = null; }
  selPlace = place;
  return _loadListSel.call(this, more, ...rest);
};
