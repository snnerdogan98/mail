/* ───────────── Zamanlanmış gönderim ─────────────
   Zamanlanan posta Gmail'de taslak olarak durur; içinde "X-Mail-Scheduled: <zaman>" başlığı vardır.
   • Google zamanlayıcısı (kullanıcının kendi hesabındaki Apps Script) her dakika bakar, zamanı gelen taslağı gönderir.
     Bilgisayar/telefon kapalıyken de çalışır.
   • Uygulama açıksa yedek olarak o da bakar; zamanlayıcı kuruluysa ona 10 dakika öncelik tanır. */
'use strict';

const SCHED_GRACE = () => store.get('schedScript') ? 10 * 60e3 : 0;

const b64urlToBin = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return atob(s); };
const binToB64url = b => btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// Taslağın ham içeriğinde sadece zaman başlığını değiştir (at = null → zamanlamayı kaldır)
function setSchedHeader(raw, at) {
  let bin = b64urlToBin(raw);
  const line = at ? `X-Mail-Scheduled: ${new Date(at).toISOString()}` : '';
  if (/^X-Mail-Scheduled:.*$/m.test(bin)) bin = bin.replace(/^X-Mail-Scheduled:.*(\r?\n)?/m, line ? line + '\r\n' : '');
  else if (line) bin = line + '\r\n' + bin;
  return binToB64url(bin);
}

const RealSched = {
  create: (msg, threadId, at) => call('drafts', { method: 'POST', body: { message: { raw: buildRaw({ ...msg, scheduledAt: at }), ...(threadId ? { threadId } : {}) } } }),
  async list() {
    const r = await call('drafts', { query: { maxResults: 100 } });
    const ds = await pmap(r.drafts || [], 5, d => call('drafts/' + d.id, { query: { format: 'metadata' } }).catch(() => null));
    return ds.filter(Boolean).map(d => {
      const m = d.message, at = Date.parse(hdr(m, 'X-Mail-Scheduled'));
      if (!at) return null;
      return { id: d.id, at, to: hdr(m, 'To'), subject: hdr(m, 'Subject'), snippet: fixMojibake(m.snippet || ''), threadId: m.threadId };
    }).filter(Boolean).sort((a, b) => a.at - b.at);
  },
  send: id => call('drafts/send', { method: 'POST', body: { id } }),
  remove: id => call('drafts/' + id, { method: 'DELETE' }),
  async setTime(id, at) {
    const d = await call('drafts/' + id, { query: { format: 'raw' } });
    return call('drafts/' + id, { method: 'PUT', body: { id, message: { raw: setSchedHeader(d.message.raw, at), threadId: d.message.threadId } } });
  }
};

// Deneme sürümü için
const MockSched = (() => {
  const H = 3600e3;
  let items = [
    { id: 'd1', at: Date.now() + 14 * H, to: 'Ayşe Erdoğan <ayse@example.com>', subject: 'Doğum günün kutlu olsun!', snippet: 'Nice mutlu yıllara, sağlıkla…' },
    { id: 'd2', at: Date.now() + 62 * H, to: 'Ali Veli <ali@example.com>', subject: 'Proje toplantısı notları', snippet: 'Merhaba Ali, toplantıda konuştuklarımızı özetliyorum…' }
  ];
  const w = (v, ms = 250) => new Promise(r => setTimeout(() => r(v), ms));
  return {
    create: (msg, threadId, at) => { const it = { id: 'd' + Math.random().toString(36).slice(2, 6), at, to: msg.to, subject: msg.subject, snippet: (msg.body || '').slice(0, 80) }; items.push(it); return w(it); },
    list: () => w(items.slice().sort((a, b) => a.at - b.at)),
    send: id => { items = items.filter(i => i.id !== id); return w({}); },
    remove: id => { items = items.filter(i => i.id !== id); return w({}); },
    setTime: (id, at) => { const it = items.find(i => i.id === id); if (at) it.at = at; else items = items.filter(i => i.id !== id); return w({}); }
  };
})();
const Sched = DEMO ? MockSched : RealSched;

/* Zaman yazımı */
const schedWhen = t => {
  const d = new Date(t), now = new Date();
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 864e5);
  const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `Bugün ${hm}`;
  if (diff === 1) return `Yarın ${hm}`;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: diff < 7 ? 'long' : undefined }) + ' ' + hm;
};
const toLocalInput = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };
const schedAt = (dayOffset, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d.getTime(); };

function schedPresets() {
  const now = new Date(), out = [];
  if (now.getHours() < 18) out.push(['Bu akşam', schedAt(0, 20)]);
  out.push(['Yarın sabah', schedAt(1, 8)], ['Yarın öğleden sonra', schedAt(1, 13)]);
  const toMon = (8 - now.getDay()) % 7 || 7;          // gelecek pazartesi
  if (toMon > 1) out.push(['Pazartesi sabah', schedAt(toMon, 8)]);
  return out;
}

/* Yeni posta penceresindeki "Zamanla" menüsü */
function openSchedMenu(btn) {
  const form = $('#composeForm');
  if (!form) return;
  form.querySelector('.sched-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'sched-pop';
  pop.innerHTML = `
    <div class="sp-title">Gönderme zamanı</div>
    ${schedPresets().map(([name, t]) => `<button type="button" class="sp-item" data-t="${t}"><span>${name}</span><span class="sp-when">${schedWhen(t)}</span></button>`).join('')}
    <div class="sp-custom">
      <input type="datetime-local" value="${toLocalInput(schedAt(1, 9))}" min="${toLocalInput(Date.now())}">
      <button type="button" class="btn primary sp-go">Zamanla</button>
    </div>
    ${store.get('schedScript') ? '' : '<div class="sp-note">Google zamanlayıcısı kurulu değil: posta sadece uygulama açıkken gider. <a href="#" data-action="sched-setup">Kur</a></div>'}`;
  form.appendChild(pop);
  const close = e => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
  setTimeout(() => document.addEventListener('mousedown', close, true));
  pop.addEventListener('click', e => {
    const it = e.target.closest('.sp-item');
    if (it) return schedCompose(+it.dataset.t);
    if (e.target.closest('.sp-go')) {
      const t = new Date(pop.querySelector('input').value).getTime();
      if (!t || t < Date.now() + 60e3) return toast('İleri bir tarih ve saat seç');
      schedCompose(t);
    }
  });
}

async function schedCompose(when) {
  const form = $('#composeForm'), init = S.compose || {};
  if (!emailsIn(form.to.value).length) { toast('Geçerli bir alıcı adresi gir'); return; }
  const btn = form.querySelector('.sched-btn');
  btn.disabled = true;
  try {
    const d = await Sched.create({ to: form.to.value, cc: form.cc?.value, subject: form.subject.value, body: form.body.value,
      inReplyTo: init.inReplyTo, references: init.references }, init.threadId, when);
    closeModal();
    await schedRefresh();
    toast(`Zamanlandı: ${schedWhen(when)}`, [['Geri al', async () => { await Sched.remove(d.id); schedRefresh(); toast('Zamanlama iptal edildi'); }]], 6000);
  } catch (err) {
    btn.disabled = false;
    if (!(err instanceof AuthError)) toast('Zamanlanamadı: ' + err.message);
  }
}

/* Liste ve yedek gönderici */
async function schedRefresh() {
  try { S.scheduled = await Sched.list(); } catch { return; }
  renderSidebar();
  if (S.view === 'sched') renderSched();
}
let schedBusy = false;
async function schedTick() {
  if (schedBusy || !S.scheduled?.length) return;
  const due = S.scheduled.filter(x => x.at + SCHED_GRACE() <= Date.now());
  if (!due.length) return;
  schedBusy = true;
  // Önce güncel listeye bak: zamanlayıcı göndermiş olabilir
  await schedRefresh();
  for (const x of (S.scheduled || []).filter(x => x.at + SCHED_GRACE() <= Date.now())) {
    try { await Sched.send(x.id); toast(`Zamanlanmış posta gönderildi: ${x.subject || '(konusuz)'}`); } catch {}
  }
  schedBusy = false;
  schedRefresh();
}
let schedTimers = [];
function schedStart() {
  schedTimers.forEach(clearInterval);
  schedRefresh().then(schedTick);
  schedTimers = [setInterval(schedTick, 30e3), setInterval(schedRefresh, 5 * 60e3)];
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedRefresh().then(schedTick); });
}

/* Zamanlanmış ekranı */
function openSched() {
  if (S.note) flushNote();
  S.threadId = null;
  $('#shell').classList.remove('drawer');
  setView('sched', matchMedia('(max-width: 800px)').matches);
  $('#shell').setAttribute('data-view', 'thread');
  renderSidebar(); renderList();
  $('#reader').innerHTML = `<div class="reader-bar"><button class="icon-btn back" data-action="back">${IC.back}</button><h3>Zamanlanmış</h3></div>
    <div class="reader-scroll auto"><div id="schedBody"><div class="list-msg">Yükleniyor…</div></div></div>`;
  renderSched();
  schedRefresh();
}
function renderSched() {
  const el = $('#schedBody');
  if (!el) return;
  const list = S.scheduled || [];
  el.innerHTML = `
    ${store.get('schedScript') ? '' : `<div class="card sched-warn"><b>Google zamanlayıcısı kurulu değil</b>
      <p>Şu an zamanlanmış postalar sadece uygulama açıkken gönderilir. Bir kerelik kurulumla bilgisayarın kapalıyken de tam saatinde gider.</p>
      <button class="btn primary" data-action="sched-setup">Kurulumu göster</button></div>`}
    ${list.length ? list.map(x => `
      <div class="sched-item" data-id="${x.id}">
        <div class="si-when">${IC.clock}<b>${esc(schedWhen(x.at))}</b></div>
        <div class="si-to">Kime: ${esc(x.to)}</div>
        <div class="si-subj">${esc(x.subject || '(konu yok)')}</div>
        <div class="si-snip">${esc(x.snippet || '')}</div>
        <div class="si-actions">
          <button class="btn" data-action="sched-edit" data-id="${x.id}">Saati değiştir</button>
          <button class="btn" data-action="sched-now" data-id="${x.id}">${IC.send}Şimdi gönder</button>
          <button class="btn" data-action="sched-cancel" data-id="${x.id}" title="Zamanlamayı kaldırır, posta Taslaklar'da kalır">Taslağa çevir</button>
          <button class="icon-btn" data-action="sched-del" data-id="${x.id}" title="Sil">${IC.trash}</button>
        </div>
      </div>`).join('') : '<p class="muted">Zamanlanmış posta yok. Yeni posta yazarken Gönder\'in yanındaki saat simgesine bas.</p>'}`;
}

/* Google zamanlayıcısı kurulumu */
const SCHED_SCRIPT = `// Mail — zamanlanmış postaları gönderir.
// Her dakika taslaklara bakar; "X-Mail-Scheduled" zamanı gelmiş olanı gönderir.
function zamanlanmisPostalariGonder() {
  var simdi = Date.now();
  GmailApp.getDrafts().forEach(function (taslak) {
    var m = taslak.getMessage();
    var zaman = m.getHeader('X-Mail-Scheduled');
    if (!zaman) zaman = ((m.getRawContent().match(/^X-Mail-Scheduled:[ \\t]*(.+)$/m) || [])[1] || '').trim();
    if (!zaman) return;
    var t = Date.parse(zaman);
    if (!isNaN(t) && t <= simdi) {
      try { taslak.send(); } catch (e) { console.error(e); }
    }
  });
}

// Bir kez çalıştır: zamanlayıcıyı kurar.
function kurulum() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('zamanlanmisPostalariGonder').timeBased().everyMinutes(1).create();
  zamanlanmisPostalariGonder();
  console.log('Kurulum tamam. Zamanlanmış postalar artık otomatik gönderilecek.');
}
`;

function openSchedSetup() {
  const done = !!store.get('schedScript');
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet sched-setup">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Google zamanlayıcısı</h3>
      </header>
      <div class="set-body">
        <p class="muted">Bir kerelik kurulum, 5 dakika. Google hesabında senin adına küçük bir zamanlayıcı çalışır; ücretsizdir ve sadece senin taslaklarına bakar.</p>
        <ol class="steps">
          <li><b>Yeni proje aç.</b> <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> adresini aç (Gmail hesabınla). Sol üstteki "Adsız proje" yazısına tıklayıp adını <b>Mail Zamanlayıcı</b> yap.</li>
          <li><b>Kodu yapıştır.</b> Editördeki her şeyi sil, aşağıdaki kodu kopyalayıp yapıştır, <b>Ctrl+S</b> ile kaydet.
            <div class="code-box"><pre>${esc(SCHED_SCRIPT)}</pre><button class="btn" data-action="sched-copy">Kodu kopyala</button></div></li>
          <li><b>Çalıştır.</b> Üstteki fonksiyon listesinden <b>kurulum</b>'u seç, <b>▷ Çalıştır</b>'a bas.</li>
          <li><b>İzin ver.</b> "Yetkilendirme gerekli" → <b>İzinleri incele</b> → hesabını seç. "Google bu uygulamayı doğrulamadı" çıkarsa <b>Gelişmiş</b> → <b>Mail Zamanlayıcı'ya git</b> → <b>İzin ver</b>. (Bu uyarı, kodu senin yazdığın için çıkar.)</li>
          <li><b>Bitti.</b> Altta "Kurulum tamam" yazısını görünce aşağıdaki düğmeye bas.</li>
        </ol>
      </div>
      <div class="cl-foot">
        ${done ? '<button class="btn" data-action="sched-unset">Kurulu değil olarak işaretle</button>' : ''}
        <button class="btn primary" data-action="sched-done">${done ? 'Tamam' : 'Kurdum'}</button>
      </div>
    </div>
  </div>`;
}

Object.assign(ACTIONS, {
  'sched-menu': el => openSchedMenu(el),
  'open-sched': () => openSched(),
  'sched-setup': (el, e) => { e?.preventDefault(); openSchedSetup(); },
  'sched-copy': async el => {
    try { await navigator.clipboard.writeText(SCHED_SCRIPT); el.textContent = 'Kopyalandı ✓'; }
    catch { const r = document.createRange(); r.selectNodeContents(el.previousElementSibling); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Kod seçildi, Ctrl+C ile kopyala'); }
  },
  'sched-done': () => { store.set('schedScript', true); closeModal(); toast('Google zamanlayıcısı kuruldu olarak işaretlendi'); if (S.view === 'sched') renderSched(); },
  'sched-unset': () => { store.set('schedScript', false); closeModal(); if (S.view === 'sched') renderSched(); },
  'sched-now': async el => { el.disabled = true; try { await Sched.send(el.dataset.id); toast('Gönderildi'); } catch (e) { toast('Gönderilemedi: ' + e.message); } schedRefresh(); },
  'sched-del': async el => { await Sched.remove(el.dataset.id); toast('Zamanlanmış posta silindi'); schedRefresh(); },
  'sched-cancel': async el => { await Sched.setTime(el.dataset.id, null); toast('Zamanlama kaldırıldı, posta Taslaklar\'da'); schedRefresh(); },
  'sched-edit': el => {
    const box = el.closest('.sched-item');
    if (box.querySelector('.si-edit')) return;
    const x = S.scheduled.find(i => i.id === el.dataset.id);
    const d = document.createElement('div');
    d.className = 'si-edit';
    d.innerHTML = `<input type="datetime-local" value="${toLocalInput(x.at)}" min="${toLocalInput(Date.now())}"><button class="btn primary">Kaydet</button>`;
    box.appendChild(d);
    d.querySelector('button').onclick = async () => {
      const t = new Date(d.querySelector('input').value).getTime();
      if (!t || t < Date.now() + 60e3) return toast('İleri bir tarih ve saat seç');
      await Sched.setTime(x.id, t);
      toast(`Yeni zaman: ${schedWhen(t)}`);
      schedRefresh();
    };
  }
});
