/* ───────────── Klavye kısayolları ─────────────
   Gmail'e benzer tuşlar; her biri kullanıcı tarafından değiştirilebilir (Ayarlar → Klavye → Düzenle ya da ? tuşu).
   Yazı yazılan bir alandayken (arama, yeni posta, not) çalışmazlar; sadece Ctrl ile olanlar çalışır.
   Tuş yazımı: "j", "ArrowDown", "Shift+U", "Ctrl+Enter", "#". "Git" grubundakiler önek tuşla (varsayılan G) iki adımlıdır. */
'use strict';

const KEYS_ON = () => store.get('keysOn', true) !== false;
const reading = () => S.view === 'thread' && S.thread;
const lastMsg = () => S.thread?.messages?.[S.thread.messages.length - 1];
const goLabel = id => ACTIONS['open-label']({ dataset: { id } });
const selOn = () => typeof selActive === 'function' && selActive();
const canAct = () => selOn() || reading();

// id, grup, açıklama, varsayılan tuşlar, ne zaman çalışır, ne yapar
const KEY_ACTS = [
  ['next', 'Gezinme', 'Sonraki mail', ['j', 'ArrowDown'], () => S.view !== 'cal', () => kbMove(1)],
  ['prev', 'Gezinme', 'Önceki mail', ['k', 'ArrowUp'], () => S.view !== 'cal', () => kbMove(-1)],
  ['open', 'Gezinme', 'Seçili maili aç', ['Enter', 'o'], () => !reading() && kbIdx >= 0, () => openThread(S.threads[kbIdx].id)],
  ['back', 'Gezinme', 'Listeye dön / seçimi kaldır', ['u', 'Escape'], () => S.view !== 'list' || selOn(), () => selOn() ? selClear() : ACTIONS.back()],
  ['select', 'Gezinme', 'Maili seç / seçimi kaldır', ['x'], () => !reading() && kbIdx >= 0 && !!S.threads[kbIdx] && !inNotes(), () => selToggle(S.threads[kbIdx].id)],
  ['search', 'Gezinme', 'Aramaya geç', ['/'], null, () => { $('#search')?.focus(); $('#search')?.select(); }],
  ['go-inbox', 'Git', 'Gelen Kutusu', ['i'], null, () => goLabel('INBOX')],
  ['go-starred', 'Git', 'Yıldızlı', ['s'], null, () => goLabel('STARRED')],
  ['go-sent', 'Git', 'Gönderilmiş', ['t'], null, () => goLabel('SENT')],
  ['go-drafts', 'Git', 'Taslaklar', ['d'], null, () => goLabel('DRAFT')],
  ['go-notes', 'Git', 'Notlar', ['n'], () => !!notesLabel(), () => goLabel(notesLabel().id)],
  ['go-cal', 'Git', 'Takvim', ['k'], null, () => ACTIONS['open-cal']()],
  ['go-snoozed', 'Git', 'Ertelenenler', ['b'], () => S.labels.some(l => l.name === 'Ertelendi'), () => goLabel(S.labels.find(l => l.name === 'Ertelendi').id)],
  ['compose', 'Mail', 'Yeni posta', ['c'], null, () => ACTIONS.compose()],
  ['reply', 'Mail', 'Yanıtla', ['r'], reading, () => { const m = lastMsg(); if (m) replyTo(m); }],
  ['forward', 'Mail', 'İlet', ['f'], reading, () => { const m = lastMsg(); if (m) forward(m); }],
  ['archive', 'Mail', 'Arşivle', ['e'], canAct, () => selOn() ? selDo('archive') : ACTIONS.archive()],
  ['trash', 'Mail', 'Çöp kutusuna taşı', ['#', 'Delete'], canAct, () => selOn() ? selDo('trash') : ACTIONS.trash()],
  ['star', 'Mail', 'Yıldızla / yıldızı kaldır', ['s'], reading, () => ACTIONS.star()],
  ['unread', 'Mail', 'Okunmadı yap', ['Shift+U'], canAct, () => selOn() ? selDo('unread') : ACTIONS['mark-unread']()],
  ['read', 'Mail', 'Seçilenleri okundu yap', ['Shift+I'], selOn, () => selDo('read')],
  ['labels', 'Mail', 'Etiketler', ['l'], canAct, () => selOn() ? openSelLabels() : ACTIONS.labels()],
  ['snooze', 'Mail', 'Ertele', ['b'], reading, () => { const b = document.querySelector('[data-action="snooze"]'); if (b) openSnoozeMenu(b); }],
  ['spam', 'Mail', 'Spam olarak işaretle', ['!'], canAct, () => selOn() ? selDo('spam') : ACTIONS['phish-spam']?.()],
  ['send', 'Yazarken', 'Gönder', ['Ctrl+Enter'], () => !!$('#composeForm'), () => $('#composeForm').requestSubmit()],
  ['settings', 'Diğer', 'Ayarlar', ['Ctrl+K'], null, () => ACTIONS.settings()],
  ['help', 'Diğer', 'Kısayol listesi', ['?'], null, () => openKeyHelp()]
].map(([id, group, label, keys, when, run]) => ({ id, group, label, keys, when, run }));
const GO_PREFIX_DEFAULT = 'g';

/* Kullanıcının değişiklikleri */
const keyMap = () => store.get('keyMap', {});
const goPrefix = () => store.get('keyGoPrefix', GO_PREFIX_DEFAULT);
const keysOf = a => keyMap()[a.id] || a.keys;
function setKeys(id, keys) {
  const m = keyMap();
  const def = KEY_ACTS.find(a => a.id === id).keys;
  if (JSON.stringify(keys) === JSON.stringify(def)) delete m[id]; else m[id] = keys;
  store.set('keyMap', m);
}

/* Tuş yazımı */
function comboOf(e) {
  let k = e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Dead', 'Unidentified'].includes(k)) return null;
  const letter = k.length === 1 && /\p{L}/u.test(k);
  if (letter) k = k.toLocaleLowerCase('tr-TR');
  let c = '';
  if (e.ctrlKey || e.metaKey) c += 'Ctrl+';
  if (e.altKey) c += 'Alt+';
  if (e.shiftKey && (letter || k.length > 1) && !['?', '!', '#'].includes(k)) c += 'Shift+';
  return c + k;
}
const norm = s => s.replace(/(^|\+)([^+]+)$/, (m, p, k) => p + (k.length === 1 ? k.toLocaleLowerCase('tr-TR') : k));
const KEY_NAMES = { ArrowDown: '↓', ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Delete: 'Delete', Enter: 'Enter', ' ': 'Boşluk', Backspace: '⌫' };
const keyLabel = s => s.split('+').map(p => `<kbd>${esc(KEY_NAMES[p] || (p.length === 1 ? p.toLocaleUpperCase('tr-TR') : p))}</kbd>`).join('+');
const comboHtml = (a, k) => a.group === 'Git' ? `${keyLabel(goPrefix())} <i>sonra</i> ${keyLabel(k)}` : keyLabel(k);

/* Liste gezinme */
let kbIdx = -1;
function kbHighlight() {
  document.querySelectorAll('#list .kb').forEach(r => r.classList.remove('kb'));
  const rows = [...document.querySelectorAll('#list .row[data-id], #list .note-card[data-id]')];
  const el = rows[kbIdx];
  if (el) { el.classList.add('kb'); el.scrollIntoView({ block: 'nearest' }); }
}
function kbMove(step) {
  if (!S.threads.length) return;
  const cur = S.threadId ? S.threads.findIndex(t => t.id === S.threadId) : kbIdx;
  kbIdx = Math.max(0, Math.min(S.threads.length - 1, (cur < 0 ? (step > 0 ? -1 : 0) : cur) + step));
  if (S.threadId && S.view === 'thread') openThread(S.threads[kbIdx].id);   // okurken: doğrudan sonrakini aç
  else kbHighlight();
}
const _renderList = renderList;
renderList = function (...a) { _renderList.apply(this, a); if (kbIdx >= 0 && !S.threadId) kbHighlight(); };

/* Tuş dinleyici */
let gPending = 0, capture = null;
const isTyping = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

document.addEventListener('keydown', e => {
  if (capture) { capture(e); return; }
  if (!KEYS_ON() || !$('#shell')) return;
  const combo = comboOf(e);
  if (!combo) return;
  const typing = isTyping(e.target);
  if (typing && e.key === 'Escape' && e.target.id === 'search') { e.target.blur(); return; }
  if (typing && !combo.startsWith('Ctrl+')) return;
  const modal = !!$('#modal').innerHTML.trim();
  const fire = a => { if (a.when && !a.when()) return false; e.preventDefault(); a.run(); return true; };

  // İki adımlı "Git" kısayolları
  if (gPending && Date.now() - gPending < 1500 && !modal) {
    gPending = 0;
    for (const a of KEY_ACTS) if (a.group === 'Git' && keysOf(a).map(norm).includes(norm(combo)) && fire(a)) return;
    return;
  }
  for (const a of KEY_ACTS) {
    if (a.group === 'Git' || !keysOf(a).map(norm).includes(norm(combo))) continue;
    if (modal && a.id !== 'send') continue;   // açık pencerede sadece "Gönder" çalışsın
    if (fire(a)) return;
  }
  if (!modal && !typing && norm(combo) === norm(goPrefix())) { gPending = Date.now(); e.preventDefault(); }
});

/* Kısayol listesi ve düzenleme */
let keyEdit = false;
function openKeyHelp(edit = keyEdit) {
  keyEdit = edit;
  const groups = [...new Set(KEY_ACTS.map(a => a.group))];
  const custom = Object.keys(keyMap()).length || goPrefix() !== GO_PREFIX_DEFAULT;
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet keyhelp ${edit ? 'editing' : ''}">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Klavye kısayolları</h3>
        <button class="icon-btn kh-edit ${edit ? 'on' : ''}" data-action="key-edit" title="${edit ? 'Düzenlemeyi bitir' : 'Kısayolları değiştir'}" aria-pressed="${edit}">${IC.pen}</button>
      </header>
      ${edit ? `<div class="kh-tip">Değiştirmek istediğin tuşa tıkla, sonra yeni tuşa bas. <b>+</b> ile ikinci bir tuş ekleyebilir, <b>×</b> ile silebilirsin.${custom ? ' <a href="#" data-action="key-reset-all">Tümünü varsayılana döndür</a>' : ''}</div>` : ''}
      <div class="set-body kh-grid">
        ${groups.map(g => `<section><h4>${g}${g === 'Git' ? ` <span class="kh-pre">önce ${edit ? `<button class="kh-key" data-action="key-cap" data-id="__go" data-i="0">${keyLabel(goPrefix())}</button>` : keyLabel(goPrefix())}</span>` : ''}</h4>
          ${KEY_ACTS.filter(a => a.group === g).map(a => {
            const ks = keysOf(a), changed = !!keyMap()[a.id];
            return `<div class="kh-row ${changed ? 'changed' : ''}"><span>${a.label}</span><span class="kh-keys">${edit
              ? ks.map((k, i) => `<span class="kh-chip"><button class="kh-key" data-action="key-cap" data-id="${a.id}" data-i="${i}" title="Değiştir">${keyLabel(k)}</button>${ks.length > 1 ? `<button class="kh-x" data-action="key-del" data-id="${a.id}" data-i="${i}" title="Sil">×</button>` : ''}</span>`).join('')
                + (ks.length < 3 ? `<button class="kh-add" data-action="key-cap" data-id="${a.id}" data-i="${ks.length}" title="Tuş ekle">+</button>` : '')
                + (changed ? `<button class="kh-reset" data-action="key-reset" data-id="${a.id}" title="Varsayılana dön">↺</button>` : '')
              : ks.map(k => comboHtml(a, k)).join(' <i>ya da</i> ')}</span></div>`;
          }).join('')}
        </section>`).join('')}
      </div>
      ${edit ? '<div class="cl-foot"><button class="btn primary" data-action="key-edit">Bitti</button></div>' : ''}
    </div>
  </div>`;
}

// Yeni tuşu yakala
function captureKey(btn) {
  const { id } = btn.dataset, i = +btn.dataset.i;
  btn.classList.add('listening'); btn.innerHTML = 'Bir tuşa bas…';
  capture = e => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey) { capture = null; openKeyHelp(true); return; }
    const c = comboOf(e);
    if (!c) return;
    capture = null;
    if (id === '__go') {
      if (c.includes('+') || c.length > 1) { toast('Önek için tek bir harf seç'); return openKeyHelp(true); }
      store.set('keyGoPrefix', c); toast(`"Git" kısayolları artık ${c.toUpperCase()} ile başlıyor`); return openKeyHelp(true);
    }
    const a = KEY_ACTS.find(x => x.id === id);
    const isGo = a.group === 'Git';
    if (isGo && c.includes('+')) { toast('"Git" kısayollarında tek tuş kullan'); return openKeyHelp(true); }
    // Aynı tuşu kullanan başka kısayol varsa ondan kaldır ("Git" kısayolları kendi aralarında ayrı)
    const sameContext = KEY_ACTS.find(x => x.id !== id && (x.group === 'Git') === isGo && keysOf(x).map(norm).includes(norm(c)));
    if (sameContext) {
      const rest = keysOf(sameContext).filter(k => norm(k) !== norm(c));
      setKeys(sameContext.id, rest);
      toast(`${keyLabel(c).replace(/<[^>]+>/g, '')} "${sameContext.label}" kısayolundan alındı${rest.length ? '' : '; onun artık tuşu yok'}`, [], 5000);
    }
    const ks = keysOf(a).slice();
    ks[i] = c;
    setKeys(id, [...new Set(ks.map(norm))].map((k, j) => ks.find(x => norm(x) === k) || k));
    openKeyHelp(true);
  };
}

// Ayarlar satırı
function keysRow() {
  const on = KEYS_ON(), n = Object.keys(keyMap()).length;
  return `<div class="set-row"><div><b>Klavye kısayolları</b><span>Gmail'deki gibi tuşlar: J/K gezin, E arşivle, R yanıtla, C yeni posta…${n ? ` ${n} kısayolu değiştirdin.` : ''}</span></div>
    <button class="switch ${on ? 'on' : ''}" data-action="keys-toggle" role="switch" aria-checked="${on}"><i></i></button></div>
    <div class="set-row"><div><b>Kısayolları gör ve değiştir</b><span>Her kısayola istediğin tuşu atayabilirsin (bilgisayarda ? tuşu da açar)</span></div>
    <button class="btn" data-action="key-open-edit">Düzenle</button></div>`;
}

Object.assign(ACTIONS, {
  'key-help': (el, e) => { e?.preventDefault(); openKeyHelp(false); },
  'key-open-edit': () => openKeyHelp(true),
  'key-edit': () => openKeyHelp(!keyEdit),
  'key-cap': el => captureKey(el),
  'key-del': el => { const a = KEY_ACTS.find(x => x.id === el.dataset.id); const ks = keysOf(a).slice(); ks.splice(+el.dataset.i, 1); setKeys(a.id, ks); openKeyHelp(true); },
  'key-reset': el => { const m = keyMap(); delete m[el.dataset.id]; store.set('keyMap', m); openKeyHelp(true); },
  'key-reset-all': (el, e) => { e?.preventDefault(); store.del('keyMap'); store.del('keyGoPrefix'); toast('Kısayollar varsayılana döndü'); openKeyHelp(true); },
  'keys-toggle': () => { store.set('keysOn', !KEYS_ON()); openSettings(); }
});
