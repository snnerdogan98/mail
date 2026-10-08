/* ───────────── İmza ─────────────
   İmza Gmail'in kendi imza ayarında saklanır (Gmail → Ayarlar → İmza ile aynı). Böylece program,
   tarayıcı ve iPhone'da aynı imza kullanılır; burada değiştirince Gmail'de de değişir.
   Yeni postaya ve yanıt/iletmeye eklenip eklenmeyeceği bu cihazdaki tercihtir. */
'use strict';

const SIG = { email: '', html: '', text: '', rich: false, loaded: false };

Object.assign(RealGmail, {
  async sendAs() { return (await call('settings/sendAs')).sendAs || []; },
  setSignature: (email, html) => call('settings/sendAs/' + encodeURIComponent(email), { method: 'PATCH', body: { signature: html } })
});
if (window.MockGmail) {
  let demoSig = '<div dir="ltr">Sinan Erdoğan<br>+90 532 000 00 00</div>';
  Object.assign(window.MockGmail, {
    sendAs: () => new Promise(r => setTimeout(() => r([{ sendAsEmail: 'snn.erdogan98@gmail.com', isPrimary: true, signature: demoSig }]), 150)),
    setSignature: (e, html) => { demoSig = html; return Promise.resolve({}); }
  });
}

// Gmail imzası (HTML) → düz yazı
function sigToText(html) {
  const h = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|tr|h\d|table)>/gi, '\n');
  const d = new DOMParser().parseFromString(h, 'text/html');
  return (d.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const textToSig = t => t.trim() ? `<div dir="ltr">${esc(t.trim()).replace(/\n/g, '<br>')}</div>` : '';

async function loadSignature() {
  try {
    const list = await Gmail.sendAs();
    const me = list.find(x => x.isPrimary) || list.find(x => x.sendAsEmail === S.email) || list[0];
    if (!me) return;
    SIG.email = me.sendAsEmail; SIG.name = me.displayName || ''; SIG.html = me.signature || ''; SIG.text = sigToText(SIG.html);
    SIG.rich = /<img|<a\s|<table|style=|<font|<b>|<strong|<i>/i.test(SIG.html);
    SIG.loaded = true;
  } catch {}
}

const sigOn = k => store.get(k, true) !== false;
// Yeni posta penceresine konacak metin
function bodyWithSignature(init) {
  const body = init.body || '';
  if (!SIG.text || init.noSig) return body;
  const kind = init.kind || 'new';
  if (kind === 'new' && !sigOn('sigNew')) return body;
  if (kind !== 'new' && !sigOn('sigReply')) return body;
  const block = '\n\n--\n' + SIG.text;
  return kind === 'new' ? body + block : block + body;   // yanıtta imza alıntının üstünde
}

// Ayarlar penceresindeki bölüm
function signatureSection() {
  const sw = (key, on) => `<button class="switch ${on ? 'on' : ''}" data-action="set-toggle" data-k="${key}" role="switch" aria-checked="${on}"><i></i></button>`;
  return `
    <section>
      <h4>İmza</h4>
      <div class="set-col"><b>İmzan</b><span>Gmail'deki imzanla aynı; burada değiştirirsen Gmail'de ve diğer cihazlarında da değişir.</span>
        <textarea id="sigText" rows="3" spellcheck="true" lang="tr" placeholder="Örn:\nSinan Erdoğan\n+90 5xx xxx xx xx">${esc(SIG.text)}</textarea>
        ${SIG.rich ? '<span class="sig-warn">Gmail\'deki imzanda resim, link ya da biçimlendirme var. Burada kaydedersen düz yazıya dönüşür.</span>' : ''}
        <div class="sig-actions"><button class="btn primary" data-action="sig-save">Kaydet</button></div>
      </div>
      <div class="set-row"><div><b>Yeni postalara ekle</b></div>${sw('sigNew', sigOn('sigNew'))}</div>
      <div class="set-row"><div><b>Yanıt ve iletmelere ekle</b><span>İmza, alıntılanan mailin üstüne eklenir</span></div>${sw('sigReply', sigOn('sigReply'))}</div>
    </section>`;
}

Object.assign(ACTIONS, {
  'sig-save': async el => {
    const t = $('#sigText').value;
    el.disabled = true; el.textContent = 'Kaydediliyor…';
    try {
      if (!SIG.email) await loadSignature();
      const html = textToSig(t);
      await Gmail.setSignature(SIG.email || S.email, html);
      SIG.html = html; SIG.text = sigToText(html); SIG.rich = false;
      toast(t.trim() ? 'İmza kaydedildi' : 'İmza kaldırıldı');
      openSettings();
    } catch (e) {
      el.disabled = false; el.textContent = 'Kaydet';
      if (!(e instanceof AuthError)) toast('İmza kaydedilemedi: ' + e.message);
    }
  }
});
