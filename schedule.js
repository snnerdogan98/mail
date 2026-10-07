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
  // Göndermeden önce zaman başlığını sil (alıcı maile ne zaman planlandığını göremesin)
  async send(id) {
    try { await RealSched.setTime(id, null); } catch {}
    return call('drafts/send', { method: 'POST', body: { id } });
  },
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
const SCHED_SCRIPT = String.raw`// Mail — zamanlayıcı (sürüm 4)
// Her dakika çalışır:
//  1) "X-Mail-Scheduled" zamanı gelmiş taslakları gönderir,
//  2) zamanı gelen ertelenmiş mailleri gelen kutusuna geri getirir.
function zamanlanmisPostalariGonder() {
  var simdi = Date.now();
  GmailApp.getDrafts().forEach(function (taslak) {
    var m = taslak.getMessage();
    var zaman = m.getHeader('X-Mail-Scheduled');
    if (!zaman) zaman = ((m.getRawContent().match(/^X-Mail-Scheduled:[ \t]*(.+)$/m) || [])[1] || '').trim();
    if (!zaman) return;
    var t = Date.parse(zaman);
    if (!isNaN(t) && t <= simdi) {
      try { temizleVeGonder(taslak); } catch (e) { console.error(e); }
    }
  });
  try { ertelenenleriGeriGetir(); } catch (e) { console.error(e); }
}

// Göndermeden önce "X-Mail-Scheduled" satırını siler; alıcı maile ne zaman planlandığını göremez.
function temizleVeGonder(taslak) {
  var api = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/' + taslak.getId();
  var h = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  try {
    var d = JSON.parse(UrlFetchApp.fetch(api + '?format=raw', { headers: h }).getContentText());
    var ham = Utilities.newBlob(Utilities.base64DecodeWebSafe(d.message.raw)).getDataAsString('ISO-8859-1');
    ham = ham.replace(/^X-Mail-Scheduled:.*(\r?\n)?/m, '');
    var bayt = Utilities.newBlob('').setDataFromString(ham, 'ISO-8859-1').getBytes();
    UrlFetchApp.fetch(api, { method: 'put', contentType: 'application/json', headers: h,
      payload: JSON.stringify({ id: taslak.getId(), message: { raw: Utilities.base64EncodeWebSafe(bayt), threadId: d.message.threadId } }) });
  } catch (e) { console.error('Başlık silinemedi, yine de gönderiliyor: ' + e); }
  taslak.send();
}

// "Ertelendi/2026-10-08 08.00 (+03)" adlı etiketlerin zamanı geldiyse mailleri gelen kutusuna döndürür.
function ertelenenleriGeriGetir() {
  var simdi = Date.now(), kok = null, geri = null;
  GmailApp.getUserLabels().forEach(function (etiket) {
    var m = etiket.getName().match(/^Ertelendi\/(\d{4})-(\d\d)-(\d\d) (\d\d)\.(\d\d)(?: \(([+-]\d\d)\))?$/);
    if (!m) return;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - (m[6] ? +m[6] : 3) * 3600000;
    if (t > simdi) return;
    kok = kok || GmailApp.getUserLabelByName('Ertelendi');
    geri = geri || GmailApp.getUserLabelByName('Ertelendi/Geri döndü') || GmailApp.createLabel('Ertelendi/Geri döndü');
    etiket.getThreads().forEach(function (konu) {
      konu.moveToInbox(); konu.markUnread(); konu.addLabel(geri);
      if (kok) konu.removeLabel(kok);
      konu.removeLabel(etiket);
    });
    etiket.deleteLabel();
  });
}

// ── Erişim listesi (programı kimlerin kullanabileceği) ──
// Web uygulaması olarak dağıtılınca çalışır. Herkes sadece şifrelenmiş listeyi okuyabilir.
// Değiştirmek için iki kilit gerekir: programın sahibinin Google girişi + yönetici şifresi.
// 5 yanlış şifrede 15 dakika kilitlenir. Şifreyi unutursan: yöneticiSifresiniSifirla'yı bir kez çalıştır.
var OZ = PropertiesService.getScriptProperties();
function erisimOku() {
  var v = OZ.getProperty('erisim');
  return v ? JSON.parse(v) : { mode: 'off', allow: [], block: [] };
}
function cevap(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  var e = erisimOku();
  return cevap({ mode: e.mode,
    allow: e.allow.map(function (x) { return x.h; }),
    block: e.block.map(function (x) { return x.h; }) });
}
function girenKim(token) {
  var adresler = ['https://www.googleapis.com/oauth2/v3/userinfo', 'https://gmail.googleapis.com/gmail/v1/users/me/profile'];
  for (var i = 0; i < adresler.length; i++) {
    var r = UrlFetchApp.fetch(adresler[i], { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) continue;
    var j = JSON.parse(r.getContentText());
    if (j.email || j.emailAddress) return String(j.email || j.emailAddress).toLowerCase();
  }
  return '';
}
function sifreOzeti(sifre, tuz) {
  var x = tuz + ':' + sifre;
  for (var i = 0; i < 300; i++)
    x = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, x + tuz, Utilities.Charset.UTF_8));
  return x;
}
function doPost(istek) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var b = JSON.parse(istek.postData.contents);
    if (!b.token || girenKim(b.token) !== Session.getEffectiveUser().getEmail().toLowerCase()) return cevap({ hata: 'yetki' });
    var y = JSON.parse(OZ.getProperty('yonetici') || '{}'), simdi = Date.now();
    if (y.kilit && y.kilit > simdi) return cevap({ hata: 'kilit', dakika: Math.ceil((y.kilit - simdi) / 60000) });
    if (b.islem === 'durum') return cevap({ sifreVar: !!y.ozet });
    if (!y.ozet) {                                   // ilk kez: şifre belirle
      if (b.islem !== 'sifre-kur' || String(b.yeni || '').length < 6) return cevap({ hata: 'sifre-yok' });
      y = { tuz: Utilities.getUuid(), hata: 0 }; y.ozet = sifreOzeti(b.yeni, y.tuz);
      OZ.setProperty('yonetici', JSON.stringify(y));
      return cevap(erisimOku());
    }
    if (sifreOzeti(String(b.sifre || ''), y.tuz) !== y.ozet) {
      y.hata = (y.hata || 0) + 1;
      if (y.hata >= 5) { y.hata = 0; y.kilit = simdi + 15 * 60000; }
      OZ.setProperty('yonetici', JSON.stringify(y));
      return cevap({ hata: y.kilit > simdi ? 'kilit' : 'sifre', kalan: 5 - y.hata, dakika: 15 });
    }
    if (y.hata || y.kilit) { y.hata = 0; delete y.kilit; OZ.setProperty('yonetici', JSON.stringify(y)); }
    var e = erisimOku(), L = b.liste === 'block' ? 'block' : 'allow';
    if (b.islem === 'sifre-kur') {
      if (String(b.yeni || '').length < 6) return cevap({ hata: 'kisa' });
      y.tuz = Utilities.getUuid(); y.ozet = sifreOzeti(b.yeni, y.tuz);
      OZ.setProperty('yonetici', JSON.stringify(y));
    }
    if (b.islem === 'mod' && /^(off|allow|block)$/.test(b.mode)) e.mode = b.mode;
    if (b.islem === 'ekle' && /^[0-9a-f]{64}$/.test(b.h || '')) {
      e[L] = e[L].filter(function (x) { return x.h !== b.h; });
      e[L].push({ h: b.h, ad: String(b.ad || '').slice(0, 60) });
    }
    if (b.islem === 'sil') e[L] = e[L].filter(function (x) { return x.h !== b.h; });
    if (/^(mod|ekle|sil)$/.test(b.islem)) OZ.setProperty('erisim', JSON.stringify(e));
    return cevap(e);
  } catch (err) { return cevap({ hata: String(err) }); }
  finally { lock.releaseLock(); }
}
// Yönetici şifresini unutursan bunu bir kez çalıştır; programda yeni şifre belirlersin.
function yoneticiSifresiniSifirla() {
  OZ.deleteProperty('yonetici');
  console.log('Yönetici şifresi silindi. Yönetici programını açıp yeni şifre belirleyebilirsin.');
}

// Bir kez çalıştır: zamanlayıcıyı kurar.
function kurulum() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('zamanlanmisPostalariGonder').timeBased().everyMinutes(1).create();
  zamanlanmisPostalariGonder();
  console.log('Kurulum tamam. Zamanlanmış postalar ve ertelenen mailler artık otomatik işlenecek.');
}
`;
const SCHED_SCRIPT_VER = 4;

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
        ${done && store.get('schedScriptVer', 1) < SCHED_SCRIPT_VER ? `<div class="card upd-card"><b>Güncelleme:</b> script.google.com'da <b>Mail Zamanlayıcı</b> projesini aç, eski kodu tamamen silip aşağıdaki yeni kodu yapıştır, <b>Ctrl+S</b> ile kaydet. Sonra bir kez <b>kurulum</b>'u seçip <b>▷ Çalıştır</b>'a bas ve istenen izinleri onayla. Bitince en alttaki düğmeye bas.</div>` : ''}
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
        <button class="btn primary" data-action="sched-done">${!done ? 'Kurdum' : store.get('schedScriptVer', 1) < SCHED_SCRIPT_VER ? 'Güncelledim' : 'Tamam'}</button>
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
  'sched-done': () => { store.set('schedScript', true); store.set('schedScriptVer', SCHED_SCRIPT_VER); closeModal(); toast('Google zamanlayıcısı kuruldu olarak işaretlendi'); if (S.view === 'sched') renderSched(); },
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
