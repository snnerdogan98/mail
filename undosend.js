/* ───────────── Göndermeyi geri al ─────────────
   Gönder'e basınca posta hemen gitmez; seçilen süre kadar bekletilir. Bu sürede "Geri al"a basılırsa
   gönderilmez ve yazdığın haliyle tekrar açılır. Süre ayarlardan seçilir (varsayılan 10 saniye). */
'use strict';

const UNDO_CHOICES = [0, 5, 10, 20, 30];
const undoDelay = () => { const v = store.get('undoSend', 10); return UNDO_CHOICES.includes(v) ? v : 10; };
const pendingSends = new Map();   // id → { msg, init, timer, tick }
let undoSeq = 0;

function queueSend(msg, init) {
  const id = ++undoSeq;
  let left = undoDelay();
  const item = { msg, init };
  pendingSends.set(id, item);
  const show = () => toast(`<span class="undo-txt">Gönderiliyor… <b data-left>${left}</b></span>`, [['Geri al', () => undoSend(id)]], (left + 1) * 1000);
  show();
  item.tick = setInterval(() => {
    left--;
    const el = document.querySelector('#toast [data-left]');
    if (el && pendingSends.has(id)) el.textContent = left;
  }, 1000);
  item.timer = setTimeout(() => reallySend(id), left * 1000);
}

async function reallySend(id) {
  const item = pendingSends.get(id);
  if (!item) return;
  pendingSends.delete(id);
  clearInterval(item.tick); clearTimeout(item.timer);
  try {
    await Gmail.send(item.msg, item.init.threadId);
    toast('Gönderildi');
    if (item.init.threadId && S.threadId === item.init.threadId) openThread(item.init.threadId);
  } catch (err) {
    if (err instanceof AuthError) return;
    toast('Gönderilemedi: ' + err.message, [['Tekrar aç', () => reopenCompose(item)]], 15000);
  }
}

function undoSend(id) {
  const item = pendingSends.get(id);
  if (!item) return;
  pendingSends.delete(id);
  clearInterval(item.tick); clearTimeout(item.timer);
  reopenCompose(item);
  toast('Gönderme iptal edildi');
}

function reopenCompose({ msg, init }) {
  openCompose({ ...init, to: msg.to, cc: msg.cc || '', subject: msg.subject, body: msg.body, noSig: true });
}

// Uygulama kapatılırken ya da arka plana alınırken bekleyen postaları hemen gönder (kaybolmasın)
const flushSends = () => { for (const id of [...pendingSends.keys()]) reallySend(id); };
window.addEventListener('pagehide', flushSends);
// Telefonda arka plana alınan sayfa kapatılabilir; orada hemen gönder. Bilgisayarda pencere değiştirmek süreyi bozmasın.
const isPhone = matchMedia('(pointer: coarse)').matches;
document.addEventListener('visibilitychange', () => { if (isPhone && document.visibilityState === 'hidden') flushSends(); });
window.addEventListener('beforeunload', e => { if (pendingSends.size) { flushSends(); e.preventDefault(); e.returnValue = ''; } });

// Ayarlar satırı
function undoSendRow() {
  const v = undoDelay();
  return `<div class="set-row"><div><b>Göndermeyi geri al</b><span>Gönder'e bastıktan sonra vazgeçmek için süre</span></div>
    <div class="seg">${UNDO_CHOICES.map(n => `<button class="${v === n ? 'on' : ''}" data-action="set-undo" data-n="${n}">${n ? n + ' sn' : 'Kapalı'}</button>`).join('')}</div></div>`;
}

Object.assign(ACTIONS, {
  'set-undo': el => { store.set('undoSend', +el.dataset.n); openSettings(); }
});
