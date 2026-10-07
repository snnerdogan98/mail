/* ───────────── Yeni mail bildirimi + okunmamış sayısı ─────────────
   Program açıkken (simge durumunda / arka planda da) dakikada bir gelen kutusuna bakar.
   • Yeni okunmamış mail gelince: ekran başka yerdeyse sistem bildirimi, programa bakıyorsan küçük bir uyarı.
   • Okunmamış sayısı programın simgesinde (destekleyen sistemlerde) ve pencere başlığında görünür.
   Program tamamen kapalıyken bildirim gelmez (bunun için sunucu gerekir). */
'use strict';

const NTF_EVERY = 60e3;
const ntfOn = () => store.get('notifyMail', false) === true;
const badgeOn = () => store.get('unreadBadge', true) !== false;
const ntfSupported = () => 'Notification' in window;

Object.assign(RealGmail, {
  // Gelen kutusundaki son okunmamış mesajlar (sadece kimlikler, tek istek)
  async unreadInboxIds() {
    const r = await call('messages', { query: { labelIds: ['INBOX', 'UNREAD'], maxResults: 15 } });
    return (r.messages || []).map(m => ({ id: m.id, threadId: m.threadId }));
  },
  async messageHead(id) {
    const m = await call('messages/' + id, { query: { format: 'metadata', metadataHeaders: ['From', 'Subject'] } });
    const f = parseAddress(hdr(m, 'From'));
    return { from: f.name || f.email, subject: hdr(m, 'Subject'), snippet: decodeEntities(m.snippet || '') };
  },
  async inboxUnread() { return (await call('labels/INBOX')).threadsUnread || 0; }
});
if (window.MockGmail) Object.assign(window.MockGmail, {
  async unreadInboxIds() {
    const ts = await MockGmail.listThreads({ labelId: 'INBOX' });
    return ts.threads.filter(t => t.unread).map(t => ({ id: t.id + 'm', threadId: t.id }));
  },
  async messageHead(id) {
    const t = (await MockGmail.listThreads({ labelId: 'ALL' })).threads.find(x => x.id + 'm' === id) || {};
    return { from: t.from, subject: t.subject, snippet: t.snippet };
  },
  async inboxUnread() { return (await MockGmail.labels()).find(l => l.id === 'INBOX')?.unread || 0; }
});
function decodeEntities(s) { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; }

let ntfSeen = null, ntfBusy = false, ntfTimer = null;
async function ntfCheck() {
  if (ntfBusy || !$('#shell') || !S.email) return;
  if (!DEMO && !DESKTOP && !Auth.token()) return;          // süresi dolmuşsa arka planda giriş sayfası açmayalım
  ntfBusy = true;
  try {
    const list = await Gmail.unreadInboxIds();
    const fresh = ntfSeen ? list.filter(m => !ntfSeen.has(m.id)) : [];
    ntfSeen = new Set([...(ntfSeen || []), ...list.map(m => m.id)]);
    if (fresh.length) await ntfAnnounce(fresh);
    if (badgeOn()) setBadge(await Gmail.inboxUnread()); else setBadge(0);
  } catch {}
  ntfBusy = false;
}

async function ntfAnnounce(fresh) {
  const away = document.visibilityState === 'hidden' || !document.hasFocus();
  const heads = await Promise.all(fresh.slice(0, 3).map(m => Gmail.messageHead(m.id).then(h => ({ ...h, ...m })).catch(() => null)));
  const items = heads.filter(Boolean);
  // Liste açıksa yenile
  if (S.labelId === 'INBOX' && !S.q && S.view === 'list' && !S.loading && !(typeof selActive === 'function' && selActive())) loadList();
  refreshCountsSoon();
  if (!items.length) return;
  if (away && ntfOn() && ntfSupported() && Notification.permission === 'granted') {
    if (fresh.length > 3) return sysNotify(`${fresh.length} yeni posta`, items.map(i => `${i.from}: ${i.subject || '(konu yok)'}`).join('\n'), null);
    for (const i of items) sysNotify(i.from || 'Yeni posta', (i.subject || '(konu yok)') + (i.snippet ? '\n' + i.snippet.slice(0, 120) : ''), i.threadId);
  } else if (!away) {
    const i = items[0];
    toast(fresh.length > 1 ? `<b>${fresh.length} yeni posta</b> · ${esc(i.from)}` : `<b>Yeni posta:</b> ${esc(i.from)} · ${esc(i.subject || '(konu yok)')}`,
      [['Aç', () => ntfOpen(i.threadId)]], 7000);
  }
}

function sysNotify(title, body, threadId) {
  const opts = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: threadId || 'mail-yeni', data: { threadId } };
  try {
    const n = new Notification(title, opts);
    n.onclick = () => { try { window.focus(); window.mailDesktop?.focus?.(); } catch {} n.close(); ntfOpen(threadId); };
  } catch {
    // Bazı telefonlarda bildirim sadece servis çalışanı üzerinden gösterilebilir
    navigator.serviceWorker?.ready.then(r => r.showNotification(title, opts)).catch(() => {});
  }
}
function ntfOpen(threadId) {
  if (!threadId) { goLabelInbox(); return; }
  if (S.labelId !== 'INBOX' || S.q) goLabelInbox();
  openThread(threadId);
}
function goLabelInbox() {
  if (S.labelId === 'INBOX' && !S.q) return;
  S.labelId = 'INBOX'; S.q = ''; const sb = $('#search'); if (sb) sb.value = '';
  renderSidebar(); loadList();
}

// Servis çalışanından gelen "bildirime tıklandı" mesajı
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'open-thread') ntfOpen(e.data.threadId); });

/* Okunmamış sayısı: simge + pencere başlığı */
function setBadge(n) {
  document.title = n ? `(${n > 99 ? '99+' : n}) Mail` : 'Mail';
  try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch {}
  try { window.mailDesktop?.setBadge?.(n); } catch {}
}

function ntfStart() {
  clearInterval(ntfTimer);
  ntfSeen = null;
  ntfCheck();
  ntfTimer = setInterval(ntfCheck, NTF_EVERY);
}
// Programa geri dönünce sayıyı hemen tazele
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(ntfCheck, 1500); });

/* Ayarlar */
function notifySection() {
  const sw = (a, on) => `<button class="switch ${on ? 'on' : ''}" data-action="${a}" role="switch" aria-checked="${on}"><i></i></button>`;
  const perm = ntfSupported() ? Notification.permission : 'yok';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const note = !ntfSupported() ? 'Bu cihaz ya da tarayıcı bildirimleri desteklemiyor.'
    : perm === 'denied' ? '<b>Bildirim izni kapalı.</b> Açmak için tarayıcının adres çubuğundaki simgeye (ya da cihaz ayarlarına) girip bildirimlere izin ver.'
    : ios ? 'iPhone\'da bu program sadece açıkken bildirim gösterebilir; kapalıyken bildirim için Gmail uygulamasının bildirimleri açık kalsın.'
    : 'Program açıkken (simge durumuna küçültülmüş olsa da) gelen mailler bildirilir. Program tamamen kapalıyken bildirim gelmez.';
  return `
    <section>
      <h4>Bildirimler</h4>
      <div class="set-row"><div><b>Yeni mail bildirimi</b><span>${note}</span></div>${perm === 'denied' || !ntfSupported() ? '' : sw('ntf-toggle', ntfOn() && perm === 'granted')}</div>
      <div class="set-row"><div><b>Okunmamış sayısı</b><span>Gelen kutusundaki okunmamış mail sayısı pencere başlığında${navigator.setAppBadge ? ' ve programın simgesinde' : ''} görünür.</span></div>${sw('badge-toggle', badgeOn())}</div>
      ${ntfOn() && perm === 'granted' ? '<div class="set-row"><div><b>Deneme</b><span>Bildirimin nasıl göründüğünü gör</span></div><button class="btn" data-action="ntf-test">Deneme bildirimi</button></div>' : ''}
    </section>`;
}

Object.assign(ACTIONS, {
  'ntf-toggle': async () => {
    if (ntfOn() && Notification.permission === 'granted') { store.set('notifyMail', false); return openSettings(); }
    let p = Notification.permission;
    if (p !== 'granted') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
    store.set('notifyMail', p === 'granted');
    if (p === 'granted') toast('Yeni mailler bildirilecek');
    openSettings();
  },
  'badge-toggle': () => { store.set('unreadBadge', !badgeOn()); ntfCheck(); if (!badgeOn()) setBadge(0); openSettings(); },
  'ntf-test': () => sysNotify('Mail', 'Bildirimler çalışıyor. Yeni mail gelince böyle görünecek.', null)
});
