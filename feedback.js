/* ───────────── Geri bildirim ─────────────
   Kullanıcı hata/öneri yazar; Mail Yönetici'deki "Geri bildirimler" listesine düşer
   (liste servisi yoksa ya da eskiyse kullanıcının Gmail'inden sahibe mail olarak gider).
   Altına sürüm, cihaz ve görünüm bilgisi kendiliğinden eklenir (mail içeriği ya da kişisel veri eklenmez). */
'use strict';

const FEEDBACK_TO = 'snn.erdogan98@gmail.com';   // gizlilik sayfasında da yazan iletişim adresi
const FB_KINDS = [['hata', 'Hata'], ['oneri', 'Öneri'], ['diger', 'Diğer']];
let fbKind = 'hata';

function fbDevice() {
  const ua = navigator.userAgent;
  let os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Bilinmiyor';
  const ios = ua.match(/OS (\d+)[._](\d+)/), and = ua.match(/Android (\d+(?:\.\d+)?)/);
  if (ios && /iPhone|iPad/.test(os)) os += ` (iOS ${ios[1]}.${ios[2]})`;
  else if (and) os += ` (sürüm ${and[1]})`;
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  const mode = DESKTOP ? 'Windows programı' : (matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? 'Ana ekran uygulaması' : br;
  const theme = { light: 'Cam', dark: 'Koyu', auto: 'Otomatik', flat: 'Düz' }[store.get('theme', 'light')] || store.get('theme', 'light');
  return { Sürüm: APP_VERSION, Cihaz: os, Kullanım: mode, Görünüm: theme, Ekran: `${innerWidth}×${innerHeight}` };
}
const fbInfoText = () => Object.entries(fbDevice()).map(([k, v]) => `${k}: ${v}`).join('\n');

// Önce Mail Yönetici'ye (zamanlayıcıdaki liste servisi) gönder; servis yoksa ya da eskiyse mail olarak gönder
async function fbSend(kindId, kindName, text) {
  const url = (window.MAIL_CONFIG?.ACCESS_URL || '').trim();
  if (DEMO) { await sleep(300); return 'yonetici'; }
  if (url) {
    try {
      const tok = Auth.token() || (DESKTOP ? await Auth.desktopRefresh() : null);
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ islem: 'geri-bildirim', token: tok, tur: kindId, metin: text, bilgi: fbInfoText() }) });
      const j = await r.json();
      if (j.tamam) return 'yonetici';
      if (j.hata === 'cok') throw new Error('Bugün çok fazla geri bildirim gönderdin, yarın tekrar dene');
    } catch (e) { if (/çok fazla/.test(e.message)) throw e; }
  }
  await Gmail.send({ to: FEEDBACK_TO, subject: `[Mail geri bildirim] ${kindName}`, body: `${text}\n\n——\n${fbInfoText()}` });
  return 'mail';
}

function openFeedback() {
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <form class="sheet fb-sheet" id="fbForm">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Geri bildirim</h3>
        <button type="submit" class="btn primary">${IC.send} Gönder</button>
      </header>
      <div class="fb-body">
        <div class="seg fb-seg">${FB_KINDS.map(([k, t]) => `<button type="button" class="${fbKind === k ? 'on' : ''}" data-action="fb-kind" data-k="${k}">${t}</button>`).join('')}</div>
        <textarea id="fbText" spellcheck="true" lang="tr" autocapitalize="sentences" placeholder="${fbKind === 'hata' ? 'Ne oldu? Ne yaparken oldu? Ne olmasını bekliyordun?' : fbKind === 'oneri' ? 'Programda neyin olmasını ya da neyin değişmesini isterdin?' : 'Aklındakini yaz…'}">${esc(store.get('fbDraft', ''))}</textarea>
        <details class="fb-info"><summary>Mailin altına eklenecek bilgi</summary><pre>${esc(fbInfoText())}</pre></details>
        <p class="muted fb-note">Programın yöneticisine iletilir; kimden geldiğini görebilmesi için e-posta adresin de eklenir. Maillerinden ya da hesabından başka hiçbir bilgi gönderilmez.</p>
      </div>
    </form>
  </div>`;
  const ta = $('#fbText');
  setTimeout(() => ta.focus(), 50);
  ta.addEventListener('input', () => store.set('fbDraft', ta.value));
  ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#fbForm').requestSubmit(); } });
  $('#fbForm').addEventListener('submit', async e => {
    e.preventDefault();
    const text = ta.value.trim();
    if (text.length < 3) return toast('Birkaç kelime yazar mısın?');
    const btn = $('#fbForm [type=submit]');
    btn.disabled = true; btn.textContent = 'Gönderiliyor…';
    const kind = FB_KINDS.find(k => k[0] === fbKind)[1];
    try {
      await fbSend(fbKind, kind, text);
      store.del('fbDraft'); closeModal();
      toast('Teşekkürler, geri bildirimin gönderildi');
    } catch (err) {
      btn.disabled = false; btn.innerHTML = `${IC.send} Gönder`;
      if (!(err instanceof AuthError)) toast('Gönderilemedi: ' + err.message);
    }
  });
}

function feedbackRow() {
  return `<div class="set-row"><div><b>Geri bildirim</b><span>Bir hata mı buldun, bir fikrin mi var? Programın sahibine yaz.</span></div>
    <button class="btn" data-action="feedback">${IC.pen}Geri bildirim gönder</button></div>`;
}
Object.assign(ACTIONS, {
  feedback: () => openFeedback(),
  'fb-kind': el => { fbKind = el.dataset.k; const v = $('#fbText')?.value; if (v != null) store.set('fbDraft', v); openFeedback(); }
});
