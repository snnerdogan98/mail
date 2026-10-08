/* ───────────── Word / Excel / PowerPoint → PDF ─────────────
   Office eklerinin yanına "PDF'e çevir" düğmesi koyar. İki yol var:
   1) Google Drive ile: dosya kullanıcının kendi Drive'ına geçici olarak yüklenir, Google PDF'e çevirir,
      geçici dosya hemen silinir. Sayfa düzeni en iyi bu yolla korunur. İlk seferde bir kez "drive.file" izni ister
      (bu izinle program yalnızca kendi oluşturduğu dosyaları görebilir; Drive'daki diğer dosyalarına erişemez).
   2) Bu cihazda (yalnızca .docx ve .xlsx): dosya tarayıcının içinde açılır, önizlemesi gösterilir; "PDF olarak kaydet" yazdırma
      penceresini açar. Dosya hiçbir yere gönderilmez. */
'use strict';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const PDF_KINDS = {
  word: { ext: ['docx', 'docm', 'doc', 'odt', 'rtf'], g: 'application/vnd.google-apps.document', ic: 'W',
    drive: 'Sayfa düzeni, yazı tipleri ve tablolar olduğu gibi korunur.' },
  excel: { ext: ['xlsx', 'xlsm', 'xls', 'ods', 'csv'], g: 'application/vnd.google-apps.spreadsheet', ic: 'X',
    drive: 'Tablolar, renkler, sayı biçimleri ve grafikler korunur; her sayfa ayrı çıkar.' },
  slide: { ext: ['pptx', 'ppsx', 'ppt', 'pps', 'odp'], g: 'application/vnd.google-apps.presentation', ic: 'P',
    drive: 'Her slayt bir sayfa olur; tasarım, resimler ve tablolar korunur.' }
};
const PDF_MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docm: 'application/vnd.ms-word.document.macroEnabled.12',
  doc: 'application/msword', odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  ppt: 'application/vnd.ms-powerpoint', pps: 'application/vnd.ms-powerpoint', odp: 'application/vnd.oasis.opendocument.presentation' };
let pdfJob = null, pdfUrl = null, pdfDemoDrive = false;

const pdfExt = name => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const pdfName = name => name.replace(/\.[^.]+$/, '') + '.pdf';
const pdfKind = name => Object.keys(PDF_KINDS).find(k => PDF_KINDS[k].ext.includes(pdfExt(name || '')));
const pdfLocalOk = name => /^(docx|docm|xlsx|xlsm)$/.test(pdfExt(name));
const driveOk = () => DEMO ? pdfDemoDrive : (store.get('auth')?.scope || '').includes(DRIVE_SCOPE);

// Ek satırında gösterilecek düğme (app.js çağırır)
function pdfAttBtn(m, a, ai) {
  if (!pdfKind(a.filename)) return '';
  return `<button class="att att-pdf" data-action="pdf-conv" data-mid="${m.id}" data-ai="${ai}" title="${esc(a.filename)} dosyasını PDF'e çevir">${IC.file}<span>PDF'e çevir</span></button>`;
}

async function pdfBytes(job) {
  if (job.bytes) return job.bytes;
  if (job.url) job.bytes = new Uint8Array(await (await fetch(job.url)).arrayBuffer());
  else job.bytes = b64urlToBytes(job.data || await Gmail.attachment(job.mid, job.attId));
  return job.bytes;
}

/* ── Pencere ── */
function pdfSheet(inner, { wide = false, head = '' } = {}) {
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet pdf-sheet${wide ? ' wide' : ''}">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="pdf-close">${IC.close}</button>
        <h3>PDF'e çevir</h3>${head}
      </header>
      <div class="pdf-body">${inner}</div>
    </div>
  </div>`;
}
const pdfFileRow = (job, extra = '') => `<div class="pdf-file"><span class="pdf-doc ${pdfKind(job.filename)}">${PDF_KINDS[pdfKind(job.filename)].ic}</span><div><b>${esc(job.filename)}</b><small>${job.size ? fmtSize(job.size) : ''}${extra}</small></div></div>`;

function pdfChoose(note = '') {
  const job = pdfJob, local = pdfLocalOk(job.filename), kind = pdfKind(job.filename);
  const localText = local ? (kind === 'excel'
      ? 'Dosya hiçbir yere gönderilmez. Sayfalar tablo olarak açılır, “PDF olarak kaydet” ile kaydedersin. Grafikler ve resimler çıkmaz.'
      : 'Dosya hiçbir yere gönderilmez. Önizleme açılır, “PDF olarak kaydet” ile kaydedersin. Sade belgeler için uygundur.')
    : kind === 'slide' ? 'PowerPoint dosyaları yalnızca Google Drive ile çevrilebilir.'
    : 'Bu dosya türü (eski biçim) yalnızca Google Drive ile çevrilebilir.';
  pdfSheet(`${pdfFileRow(job)}
    ${note ? `<p class="pdf-note">${note}</p>` : ''}
    <button class="pdf-opt" data-action="pdf-drive">
      <span class="pdf-opt-ic">${IC.spark}</span>
      <div><b>Google Drive ile çevir <em>Önerilen</em></b><span>${PDF_KINDS[kind].drive} İlk seferde Google bir kez izin sorar. Dosya Drive'ında birkaç saniyeliğine açılır, çevrilince silinir.</span></div>
    </button>
    <button class="pdf-opt" data-action="pdf-local" ${local ? '' : 'disabled'}>
      <span class="pdf-opt-ic">${IC.shield}</span>
      <div><b>Bu cihazda çevir</b><span>${localText}</span></div>
    </button>`);
}

async function pdfStart(job) {
  pdfJob = job;
  if (driveOk()) return pdfDrive();
  pdfChoose();
}

/* ── 1) Google Drive ile ── */
function pdfProgress(text) {
  pdfSheet(`${pdfFileRow(pdfJob)}<div class="pdf-progress"><span class="spin"></span><span id="pdfStep">${text}</span></div>`);
}
const pdfStep = t => { const el = $('#pdfStep'); if (el) el.textContent = t; };

async function pdfDrive() {
  const job = pdfJob;
  if (!driveOk()) {
    if (DEMO) { pdfDemoDrive = true; toast('Demo: Google Drive izni verilmiş sayıldı'); }
    else return pdfAskDrive();
  }
  pdfProgress('Dosya hazırlanıyor…');
  try {
    let blob;
    if (DEMO) {
      await pdfBytes(job); await sleep(500);
      pdfStep('Drive\'a yükleniyor…'); await sleep(700);
      pdfStep('PDF\'e çevriliyor…'); await sleep(900);
      blob = await (await fetch(job.url.replace(/\.\w+$/, '.pdf'))).blob();
    } else {
      blob = await driveConvert(await pdfBytes(job), job.filename, job.mimeType);
    }
    if (pdfJob !== job) return;
    pdfShowResult(blob, 'Google Drive ile çevrildi');
  } catch (e) {
    if (pdfJob !== job) return;
    if (e.code === 'scope') return pdfChoose('Google Drive izni bulunamadı. Tekrar izin vererek ya da bu cihazda çevirebilirsin.');
    if (e instanceof AuthError) return;
    pdfChoose(`Drive ile çevrilemedi: ${esc(e.message)}`);
  }
}

// Ek izin: Google'a gidip drive.file iznini isteriz; dönünce işleme kaldığı yerden devam edilir
async function pdfAskDrive() {
  const job = pdfJob;
  const scopes = SCOPES + ' ' + DRIVE_SCOPE;
  if (DESKTOP) {
    pdfProgress('Tarayıcında Google izni açıldı. İzin verince buraya dönebilirsin…');
    try { keepDesktopToken(await window.mailDesktop.login(scopes, store.get('email') || '')); }
    catch (e) { return pdfChoose('İzin verilmedi. İstersen bu cihazda çevirebilirsin.'); }
    return driveOk() ? pdfDrive() : pdfChoose('Google, Drive iznini vermedi. İstersen bu cihazda çevirebilirsin.');
  }
  store.set('pdfPending', { mid: job.mid, attId: job.attId, filename: job.filename, mimeType: job.mimeType, size: job.size, t: Date.now() });
  const state = 'pdf-' + Math.random().toString(36).slice(2);
  store.set('oauthState', state);
  const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: Auth.redirectUri(), response_type: 'token',
    scope: scopes, include_granted_scopes: 'true', state });
  if (store.get('email')) p.set('login_hint', store.get('email'));
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

// Google'dan dönüş: giriş ekranına düşmeden işlenir (izin verilmese bile oturum açık kalır)
(function pdfHandleReturn() {
  if (!/[#&]state=pdf-/.test(location.hash)) return;
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const ok = h.get('state') === store.get('oauthState');
  store.del('oauthState');
  if (ok && h.get('access_token')) {
    store.set('auth', { token: h.get('access_token'), exp: Date.now() + (+h.get('expires_in') || 3600) * 1000, scope: h.get('scope') || '' });
  } else {
    const p = store.get('pdfPending');
    if (p) store.set('pdfPending', { ...p, denied: true });
  }
})();

async function pdfResume() {
  const p = store.get('pdfPending');
  if (!p) return;
  store.del('pdfPending');
  if (Date.now() - p.t > 15 * 60e3) return;
  pdfJob = p;
  if (p.denied || !driveOk()) return pdfChoose('Drive izni verilmedi. İstersen bu cihazda çevirebilirsin.');
  pdfDrive();
}
if (typeof start === 'function') {
  const pdfOrigStart = start;
  start = async function () { await pdfOrigStart(); pdfResume(); };
}

async function driveConvert(bytes, name, mime) {
  const tok = Auth.token() || (DESKTOP ? await Auth.desktopRefresh() : null);
  if (!tok) { Auth.reauth(); throw new AuthError('oturum'); }
  const H = { Authorization: 'Bearer ' + tok };
  const fail = async (r, what) => {
    if (r.status === 401) { Auth.reauth(); return new AuthError('oturum'); }
    let j = {}; try { j = await r.json(); } catch {}
    const reason = JSON.stringify(j);
    if (r.status === 403 && /insufficient|SCOPE/i.test(reason)) return Object.assign(new Error('izin yok'), { code: 'scope' });
    if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(reason))
      return new Error('Google Drive API bu programın Google Cloud projesinde açık değil (programın sahibi açmalı).');
    if (/exportSizeLimitExceeded/.test(reason)) return new Error('Belge Google\'ın çevirebileceği boyuttan büyük.');
    return new Error(j.error?.message || `${what} (${r.status})`);
  };
  pdfStep('Drive\'a yükleniyor…');
  const b = 'suha' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: 'Mail – geçici – ' + name, mimeType: PDF_KINDS[pdfKind(name)].g });
  const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${PDF_MIME[pdfExt(name)] || mime || 'application/octet-stream'}\r\n\r\n`, bytes, `\r\n--${b}--`]);
  const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { ...H, 'Content-Type': 'multipart/related; boundary=' + b }, body });
  if (!up.ok) throw await fail(up, 'Yüklenemedi');
  const { id } = await up.json();
  try {
    pdfStep('PDF\'e çevriliyor…');
    const ex = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`, { headers: H });
    if (!ex.ok) throw await fail(ex, 'Çevrilemedi');
    return new Blob([await ex.arrayBuffer()], { type: 'application/pdf' });
  } finally {
    // Geçici belgeyi kalıcı olarak sil (çöp kutusuna da düşmez)
    fetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE', headers: H }).catch(() => {});
  }
}

function pdfShowResult(blob, how) {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = URL.createObjectURL(blob);
  const name = pdfName(pdfJob.filename);
  const touch = navigator.pdfViewerEnabled === false || /iPhone|iPad|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  pdfSheet(`<div class="pdf-file done"><span class="pdf-doc pdf">PDF</span><div><b>${esc(name)}</b><small>${fmtSize(blob.size)} · ${how}</small></div></div>
    <div class="pdf-actions">
      <a class="btn primary" href="${pdfUrl}" download="${esc(name)}">${IC.check}İndir</a>
      <a class="btn" href="${pdfUrl}" target="_blank" rel="noopener">${IC.file}Aç</a>
    </div>
    ${touch ? '' : `<iframe class="pdf-frame" src="${pdfUrl}#view=FitH" title="PDF önizleme"></iframe>`}`, { wide: !touch });
}

/* ── 2) Bu cihazda: .docx → HTML önizleme → yazdır / PDF olarak kaydet ── */
async function pdfLocal() {
  const job = pdfJob;
  pdfProgress('Belge açılıyor…');
  try {
    const doc = await (pdfKind(job.filename) === 'excel' ? xlsxToHtml : docxToHtml)(await pdfBytes(job));
    if (pdfJob !== job) return;
    job.doc = doc;
    pdfSheet(`<div class="dx-wrap"><div class="dx-page" style="--pw:${doc.page.w}mm;--pm:${doc.page.ml}mm">${doc.html}</div></div>
      <p class="pdf-hint">Yazdırma penceresinde hedef olarak <b>PDF olarak kaydet</b>’i seç. Dosya cihazından çıkmaz.${driveOk() || DESKTOP ? '' : ' Düzen bozuk görünürse <a href="#" data-action="pdf-drive">Google Drive ile çevir</a>.'}</p>`,
      { wide: true, head: `<button class="btn primary" data-action="pdf-print">${IC.check}PDF olarak kaydet</button>` });
  } catch (e) {
    if (pdfJob !== job) return;
    pdfChoose(`Belge bu cihazda açılamadı: ${esc(e.message)}`);
  }
}

function pdfPrint() {
  const doc = pdfJob?.doc; if (!doc) return;
  let box = $('#pdfPrint');
  if (!box) { box = document.createElement('div'); box.id = 'pdfPrint'; document.body.appendChild(box); }
  box.innerHTML = `<style>@page { size: ${doc.page.w}mm ${doc.page.h}mm; margin: ${doc.page.mt}mm ${doc.page.mr}mm ${doc.page.mb}mm ${doc.page.ml}mm; }</style><div class="dx-print">${doc.html}</div>`;
  const title = document.title;
  document.title = pdfJob.filename.replace(/\.[^.]+$/, '');   // kaydederken önerilen dosya adı
  document.documentElement.classList.add('pdf-printing');
  const done = () => { document.documentElement.classList.remove('pdf-printing'); document.title = title; box.innerHTML = ''; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => print(), 60);
}

/* Basit .docx okuyucu: zip'i tarayıcının kendi açıcısıyla açar, document.xml'i HTML'e çevirir.
   Desteklenenler: başlıklar, kalın/italik/altı çizili/renk/boyut, hizalama, girinti, madde ve numaralı listeler,
   tablolar (birleştirilmiş hücreler dahil), resimler, bağlantılar, sayfa sonları, sayfa boyutu ve kenar boşlukları. */
async function pdfUnzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Word dosyası okunamadı');
  const files = {};
  let p = dv.getUint32(e + 16, true);
  for (let i = 0, n = dv.getUint16(e + 10, true); i < n; i++) {
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    files[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl))] = { m: dv.getUint16(p + 10, true), cs: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + nl + xl + cl;
  }
  return async name => {
    const f = files[name]; if (!f) return null;
    const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const raw = u8.subarray(s, s + f.cs);
    if (f.m === 0) return raw.slice();
    if (f.m !== 8) throw new Error('Desteklenmeyen sıkıştırma');
    return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };
}

async function docxToHtml(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('bu tarayıcı desteklemiyor');
  const get = await pdfUnzip(bytes);
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const xml = async n => { const b = await get(n); return b ? new DOMParser().parseFromString(new TextDecoder().decode(b), 'application/xml') : null; };
  const kids = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
  const kid = (el, n) => el ? [...el.children].find(c => c.localName === n) : null;
  const at = (el, n) => el ? el.getAttributeNS(W, n) ?? el.getAttribute('w:' + n) : null;
  const on = el => !!el && !/^(0|false|none)$/.test(at(el, 'val') || '');
  const tw = v => (+v || 0) / 1440 * 25.4;   // twip → mm

  const main = await xml('word/document.xml');
  if (!main) throw new Error('belge bulunamadı');
  const body = main.getElementsByTagNameNS(W, 'body')[0];

  // İlişkiler (resimler, bağlantılar)
  const rels = {};
  const relx = await xml('word/_rels/document.xml.rels');
  if (relx) for (const r of relx.getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = { t: r.getAttribute('Target'), ext: r.getAttribute('TargetMode') === 'External' };
  const imgCache = {};
  const img = async id => {
    const r = rels[id]; if (!r || r.ext) return '';
    if (imgCache[id] != null) return imgCache[id];
    const path = r.t.startsWith('/') ? r.t.slice(1) : 'word/' + r.t.replace(/^\.\//, '');
    const b = await get(path.replace(/[^/]+\/\.\.\//g, ''));
    if (!b) return (imgCache[id] = '');
    const ext = pdfExt(path), type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
    if (!type) return (imgCache[id] = '');
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return (imgCache[id] = `data:${type};base64,${btoa(s)}`);
  };

  // Stiller: başlık seviyesi, liste bilgisi, varsayılan yazı boyutu
  const styles = {};
  let baseSize = 11;
  const sx = await xml('word/styles.xml');
  if (sx) {
    const dsz = sx.getElementsByTagNameNS(W, 'rPrDefault')[0]?.getElementsByTagNameNS(W, 'sz')[0];
    if (dsz) baseSize = +at(dsz, 'val') / 2 || 11;
    for (const s of sx.getElementsByTagNameNS(W, 'style')) {
      const pPr = kid(s, 'pPr'), rPr = kid(s, 'rPr');
      styles[at(s, 'styleId')] = { name: (at(kid(s, 'name'), 'val') || '').toLowerCase(), based: at(kid(s, 'basedOn'), 'val'),
        lvl: at(kid(pPr, 'outlineLvl'), 'val'), numPr: kid(pPr, 'numPr'), jc: at(kid(pPr, 'jc'), 'val'), rPr };
    }
  }
  const styleChain = id => { const out = []; for (let i = 0; id && styles[id] && i < 12; i++) { out.push(styles[id]); id = styles[id].based; } return out; };
  const headingOf = id => {
    for (const s of styleChain(id)) {
      if (s.name === 'title') return 'title';
      if (s.name === 'subtitle') return 'subtitle';
      const m = s.name.match(/^heading (\d)$/); if (m) return Math.min(+m[1], 6);
      if (s.lvl != null && s.lvl !== '') return Math.min(+s.lvl + 1, 6);
    }
    return 0;
  };

  // Numaralandırma: numId + seviye → madde mi sayı mı
  const nums = {};
  const nx = await xml('word/numbering.xml');
  if (nx) {
    const abs = {};
    for (const a of nx.getElementsByTagNameNS(W, 'abstractNum'))
      abs[at(a, 'abstractNumId')] = Object.fromEntries(kids(a, 'lvl').map(l => [at(l, 'ilvl'), at(kid(l, 'numFmt'), 'val') || 'bullet']));
    for (const n of nx.getElementsByTagNameNS(W, 'num')) nums[at(n, 'numId')] = abs[at(kid(n, 'abstractNumId'), 'val')] || {};
  }
  const listOf = (pPr, sid) => {
    let np = kid(pPr, 'numPr');
    if (!np) np = styleChain(sid).find(s => s.numPr)?.numPr;
    if (!np) return null;
    const id = at(kid(np, 'numId'), 'val'); if (!id || id === '0') return null;
    const lvl = +(at(kid(np, 'ilvl'), 'val') || 0), fmt = nums[id]?.[lvl] || 'bullet';
    return { lvl, tag: fmt === 'bullet' || fmt === 'none' ? 'ul' : 'ol', type: { lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I' }[fmt] || '' };
  };

  const color = v => v && v !== 'auto' && /^[0-9a-f]{6}$/i.test(v) ? '#' + v : '';
  const HL = { yellow: '#ff0', green: '#0f0', cyan: '#0ff', magenta: '#f0f', blue: '#00f', red: '#f00', darkBlue: '#008', darkCyan: '#088', darkGreen: '#080', darkMagenta: '#808', darkRed: '#800', darkYellow: '#880', darkGray: '#888', lightGray: '#ccc', black: '#000' };

  async function runs(el) {
    let out = '';
    for (const c of el.children) {
      const n = c.localName;
      if (n === 'r') out += await run(c);
      else if (n === 'hyperlink') {
        const href = rels[c.getAttributeNS(R, 'id')]?.t;
        const inner = await runs(c);
        out += href && /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}">${inner}</a>` : inner;
      }
      else if (['ins', 'smartTag', 'fldSimple', 'customXml', 'bdo', 'dir'].includes(n)) out += await runs(c);
      else if (n === 'sdt') out += await runs(kid(c, 'sdtContent') || c);
    }
    return out;
  }
  async function run(r) {
    const p = kid(r, 'rPr');
    let txt = '';
    for (const c of r.children) {
      const n = c.localName;
      if (n === 't') txt += esc(c.textContent);
      else if (n === 'tab') txt += '<span class="dx-tab"></span>';
      else if (n === 'br') txt += at(c, 'type') === 'page' ? '<span class="dx-pb"></span>' : '<br>';
      else if (n === 'noBreakHyphen') txt += '‑';
      else if (n === 'drawing' || n === 'pict') {
        const blip = c.getElementsByTagNameNS('*', 'blip')[0], vml = c.getElementsByTagNameNS('*', 'imagedata')[0];
        const id = blip?.getAttributeNS(R, 'embed') || vml?.getAttributeNS(R, 'id');
        const src = id ? await img(id) : '';
        const ext = c.getElementsByTagNameNS('*', 'extent')[0];
        const w = ext ? Math.round(+ext.getAttribute('cx') / 9525) : 0;
        if (src) txt += `<img src="${src}" alt=""${w ? ` style="width:${w}px"` : ''}>`;
      }
    }
    if (!txt) return '';
    const st = [];
    if (p) {
      const sz = at(kid(p, 'sz'), 'val'); if (sz) st.push(`font-size:${+sz / 2}pt`);
      const col = color(at(kid(p, 'color'), 'val')); if (col) st.push(`color:${col}`);
      const hl = HL[at(kid(p, 'highlight'), 'val')] || color(at(kid(p, 'shd'), 'fill')); if (hl) st.push(`background:${hl}`);
      if (on(kid(p, 'b'))) txt = `<b>${txt}</b>`;
      if (on(kid(p, 'i'))) txt = `<i>${txt}</i>`;
      if (kid(p, 'u') && at(kid(p, 'u'), 'val') !== 'none') txt = `<u>${txt}</u>`;
      if (on(kid(p, 'strike')) || on(kid(p, 'dstrike'))) txt = `<s>${txt}</s>`;
      const va = at(kid(p, 'vertAlign'), 'val'); if (va === 'superscript') txt = `<sup>${txt}</sup>`; else if (va === 'subscript') txt = `<sub>${txt}</sub>`;
      if (on(kid(p, 'caps'))) st.push('text-transform:uppercase');
      if (on(kid(p, 'smallCaps'))) st.push('font-variant:small-caps');
    }
    return st.length ? `<span style="${st.join(';')}">${txt}</span>` : txt;
  }
  async function para(p) {
    const pPr = kid(p, 'pPr'), sid = at(kid(pPr, 'pStyle'), 'val');
    const h = headingOf(sid);
    const jc = at(kid(pPr, 'jc'), 'val') || styleChain(sid).find(s => s.jc)?.jc;
    const st = [];
    const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc]; if (align) st.push(`text-align:${align}`);
    const ind = kid(pPr, 'ind');
    const left = +(at(ind, 'left') || at(ind, 'start') || 0), first = +(at(ind, 'firstLine') || 0) - +(at(ind, 'hanging') || 0);
    const list = listOf(pPr, sid);
    if (left && !list) st.push(`margin-left:${tw(left).toFixed(1)}mm`);
    if (first && !list) st.push(`text-indent:${tw(first).toFixed(1)}mm`);
    const shd = color(at(kid(pPr, 'shd'), 'fill')); if (shd) st.push(`background:${shd}`);
    const pb = on(kid(pPr, 'pageBreakBefore')) ? '<span class="dx-pb"></span>' : '';
    const inner = await runs(p) || '&nbsp;';
    const style = st.length ? ` style="${st.join(';')}"` : '';
    if (h === 'title') return { html: `${pb}<h1 class="dx-title"${style}>${inner}</h1>` };
    if (h === 'subtitle') return { html: `${pb}<p class="dx-subtitle"${style}>${inner}</p>` };
    if (h) return { html: `${pb}<h${h}${style}>${inner}</h${h}>` };
    if (list) return { list, html: `<li${style}>${inner}</li>` };
    return { html: `${pb}<p${style}>${inner}</p>` };
  }
  async function table(t) {
    const rows = kids(t, 'tr').map(tr => {
      let col = 0;
      return kids(tr, 'tc').map(tc => {
        const pr = kid(tc, 'tcPr'), span = +(at(kid(pr, 'gridSpan'), 'val') || 1), vm = kid(pr, 'vMerge');
        const cell = { tc, col, span, cont: !!vm && at(vm, 'val') !== 'restart', fill: color(at(kid(pr, 'shd'), 'fill')), rows: 1 };
        col += span; return cell;
      });
    });
    rows.forEach((row, i) => row.forEach(c => {
      if (c.cont) return;
      for (let j = i + 1; j < rows.length; j++) { const below = rows[j].find(x => x.col === c.col); if (below?.cont) c.rows++; else break; }
    }));
    let out = '<table class="dx-table">';
    for (const row of rows) {
      out += '<tr>';
      for (const c of row) {
        if (c.cont) continue;
        out += `<td${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rows > 1 ? ` rowspan="${c.rows}"` : ''}${c.fill ? ` style="background:${c.fill}"` : ''}>${await blocks(c.tc)}</td>`;
      }
      out += '</tr>';
    }
    return out + '</table>';
  }
  async function blocks(el) {
    let out = '', stack = [];
    const closeTo = lvl => { while (stack.length > lvl) out += `</${stack.pop()}>`; };
    for (const c of el.children) {
      const n = c.localName;
      if (n === 'p') {
        const r = await para(c);
        if (r.list) {
          if (stack.length > r.list.lvl + 1) closeTo(r.list.lvl + 1);
          if (stack.length === r.list.lvl + 1 && stack[r.list.lvl] !== r.list.tag) closeTo(r.list.lvl);
          while (stack.length < r.list.lvl + 1) { out += `<${r.list.tag}${r.list.type ? ` type="${r.list.type}"` : ''}>`; stack.push(r.list.tag); }
        } else closeTo(0);
        out += r.html;
      } else if (n === 'tbl') { closeTo(0); out += await table(c); }
      else if (n === 'sdt') { closeTo(0); out += await blocks(kid(c, 'sdtContent') || c); }
    }
    closeTo(0);
    return out;
  }

  // Sayfa boyutu ve kenar boşlukları (son bölüm ayarı)
  const sect = kid(body, 'sectPr'), pg = kid(sect, 'pgSz'), mar = kid(sect, 'pgMar');
  const page = { w: pg ? tw(at(pg, 'w')) : 210, h: pg ? tw(at(pg, 'h')) : 297,
    mt: mar ? tw(at(mar, 'top')) : 25, mr: mar ? tw(at(mar, 'right')) : 25, mb: mar ? tw(at(mar, 'bottom')) : 25, ml: mar ? tw(at(mar, 'left')) : 25 };
  for (const k in page) page[k] = Math.max(+page[k].toFixed(1), k === 'w' || k === 'h' ? 50 : 5);
  if (at(pg, 'orient') === 'landscape' && page.w < page.h) [page.w, page.h] = [page.h, page.w];

  return { html: `<div class="dx" style="font-size:${baseSize}pt">${await blocks(body)}</div>`, page };
}

/* Basit .xlsx okuyucu: her sayfayı bir tablo olarak çizer. Hesaplanmış değerler, tarih/para/yüzde biçimleri,
   kalın yazı, hücre renkleri, hizalama, sütun genişlikleri ve birleştirilmiş hücreler korunur. Grafik ve resim çıkmaz. */
async function xlsxToHtml(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('bu tarayıcı desteklemiyor');
  const get = await pdfUnzip(bytes);
  const X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const xml = async n => { const b = await get(n); return b ? new DOMParser().parseFromString(new TextDecoder().decode(b), 'application/xml') : null; };
  const all = (el, n) => el ? [...el.getElementsByTagNameNS(X, n)] : [];
  const kid = (el, n) => el ? [...el.children].find(c => c.localName === n) : null;
  const textOf = si => [...si.getElementsByTagNameNS(X, 't')].filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('');

  const wb = await xml('xl/workbook.xml');
  if (!wb) throw new Error('çalışma kitabı bulunamadı');
  const rels = {};
  const rx = await xml('xl/_rels/workbook.xml.rels');
  if (rx) for (const r of rx.getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  const shared = all(await xml('xl/sharedStrings.xml'), 'si').map(textOf);
  const date1904 = kid(wb.documentElement, 'workbookPr')?.getAttribute('date1904') === '1';

  // Biçimler: sayı biçimi, kalın, dolgu rengi, hizalama
  const st = await xml('xl/styles.xml');
  const fmts = Object.fromEntries(all(st, 'numFmt').map(f => [f.getAttribute('numFmtId'), f.getAttribute('formatCode')]));
  const BUILTIN = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 14: 'dd.mm.yyyy', 15: 'd-mmm-yy', 16: 'd-mmm',
    17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd.mm.yyyy h:mm', 37: '#,##0', 38: '#,##0', 39: '#,##0.00', 40: '#,##0.00',
    45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 49: '@' };
  const fonts = all(kid(st?.documentElement, 'fonts'), 'font').map(f => ({ b: !!kid(f, 'b') && kid(f, 'b').getAttribute('val') !== '0', i: !!kid(f, 'i'),
    c: (kid(f, 'color')?.getAttribute('rgb') || '').slice(-6) }));
  const fills = all(kid(st?.documentElement, 'fills'), 'fill').map(f => { const p = kid(f, 'patternFill'); return p?.getAttribute('patternType') === 'solid' ? (kid(p, 'fgColor')?.getAttribute('rgb') || '').slice(-6) : ''; });
  const xfs = all(kid(st?.documentElement, 'cellXfs'), 'xf').map(x => ({ fmt: fmts[x.getAttribute('numFmtId')] ?? BUILTIN[x.getAttribute('numFmtId')] ?? '',
    font: fonts[+x.getAttribute('fontId')] || {}, fill: fills[+x.getAttribute('fillId')] || '', al: kid(x, 'alignment')?.getAttribute('horizontal') || '' }));

  const hex = v => /^[0-9a-f]{6}$/i.test(v) && !/^(000000|ffffff)$/i.test(v) ? '#' + v : '';
  const pad = n => String(n).padStart(2, '0');
  function fmtNum(v, code) {
    const sec = (code || '').split(';')[0];
    const clean = sec.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
    if (/[dmyhs]/i.test(clean) && !/^general$/i.test(clean)) {   // tarih / saat
      const d = new Date(Math.round((v + (date1904 ? 1462 : 0) - 25569) * 864e5));
      const day = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`, time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
      if (/[dy]/i.test(clean)) return /h/i.test(clean) ? `${day} ${time}` : day;
      return time;
    }
    const pct = clean.includes('%'); if (pct) v *= 100;
    const dec = (clean.match(/\.([0#]+)/)?.[1] || '').length;
    let out = !clean || /general/i.test(clean) ? (+v.toPrecision(12)).toLocaleString('tr-TR', { maximumFractionDigits: 10, useGrouping: false })
      : v.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: clean.includes(',') });
    if (pct) out = '%' + out;
    const lit = [...sec.matchAll(/"([^"]*)"/g)].map(m => m[1]).join('').trim();
    const cur = sec.match(/\[\$([^-\]]+)/)?.[1];
    if (lit) out = sec.indexOf('"') < sec.search(/[0#]/) ? lit + ' ' + out : out + ' ' + lit;
    if (cur) out = sec.indexOf('[$') < sec.search(/[0#]/) ? cur + out : out + ' ' + cur;
    return out;
  }
  const colNum = ref => { let n = 0; for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const rowNum = ref => +ref.match(/\d+/)[0] - 1;

  let html = '';
  const sheets = all(wb, 'sheet').filter(sh => !/hidden/.test(sh.getAttribute('state') || ''));
  for (const [si, sh] of sheets.entries()) {
    const target = rels[sh.getAttributeNS(R, 'id') || sh.getAttribute('r:id')] || '';
    const doc = await xml(target.startsWith('/') ? target.slice(1) : 'xl/' + target);
    if (!doc) continue;
    const cells = new Map();
    let maxR = -1, maxC = -1;
    for (const row of all(doc, 'row')) for (const c of [...row.children].filter(x => x.localName === 'c')) {
      const ref = c.getAttribute('r'); if (!ref) continue;
      const t = c.getAttribute('t'), v = kid(c, 'v')?.textContent, xf = xfs[+(c.getAttribute('s') || 0)] || {};
      let text = '', num = false;
      if (t === 's') text = shared[+v] ?? '';
      else if (t === 'inlineStr') text = kid(c, 'is') ? textOf(kid(c, 'is')) : '';
      else if (t === 'str' || t === 'e') text = v ?? '';
      else if (t === 'b') text = v === '1' ? 'DOĞRU' : 'YANLIŞ';
      else if (v != null && v !== '') { text = fmtNum(+v, xf.fmt); num = true; }
      const r = rowNum(ref), col = colNum(ref);
      if (r > 1999 || col > 59) continue;
      cells.set(r + ':' + col, { text, num, xf });
      if (text !== '' || xf.fill) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, col); }
    }
    if (maxR < 0) continue;
    const merged = new Map(), covered = new Set();
    for (const m of all(doc, 'mergeCell')) {
      const [a, b] = m.getAttribute('ref').split(':'); if (!b) continue;
      const r0 = rowNum(a), c0 = colNum(a), r1 = rowNum(b), c1 = colNum(b);
      merged.set(r0 + ':' + c0, { rs: r1 - r0 + 1, cs: c1 - c0 + 1 });
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered.add(r + ':' + c);
    }
    const widths = Array(maxC + 1).fill(8.43);
    for (const col of all(doc, 'col')) for (let i = +col.getAttribute('min') - 1; i < Math.min(+col.getAttribute('max'), maxC + 1); i++)
      if (col.getAttribute('width')) widths[i] = col.getAttribute('hidden') === '1' || col.getAttribute('hidden') === 'true' ? 0 : +col.getAttribute('width');
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    let t = `<colgroup>${widths.map(w => `<col style="width:${(w / total * 100).toFixed(2)}%">`).join('')}</colgroup>`;
    for (let r = 0; r <= maxR; r++) {
      t += '<tr>';
      for (let c = 0; c <= maxC; c++) {
        const k = r + ':' + c; if (covered.has(k)) continue;
        const cell = cells.get(k), m = merged.get(k), xf = cell?.xf || {}, sty = [];
        if (xf.fill && hex(xf.fill)) sty.push(`background:${hex(xf.fill)}`);
        if (xf.font?.c && hex(xf.font.c)) sty.push(`color:${hex(xf.font.c)}`);
        const al = { center: 'center', centerContinuous: 'center', right: 'right', left: 'left' }[xf.al] || (cell?.num ? 'right' : '');
        if (al) sty.push(`text-align:${al}`);
        let v = esc(cell?.text ?? '');
        if (xf.font?.b) v = `<b>${v}</b>`; if (xf.font?.i) v = `<i>${v}</i>`;
        t += `<td${m ? `${m.rs > 1 ? ` rowspan="${m.rs}"` : ''}${m.cs > 1 ? ` colspan="${m.cs}"` : ''}` : ''}${sty.length ? ` style="${sty.join(';')}"` : ''}>${v}</td>`;
      }
      t += '</tr>';
    }
    html += `${si ? '<span class="dx-pb"></span>' : ''}${sheets.length > 1 ? `<h2 class="xl-name">${esc(sh.getAttribute('name'))}</h2>` : ''}<table class="xl">${t}</table>`;
  }
  if (!html) throw new Error('dosyada gösterilecek veri yok');
  return { html: `<div class="dx xl-doc">${html}</div>`, page: { w: 297, h: 210, mt: 12, mr: 12, mb: 12, ml: 12 } };
}

function pdfClose() {
  pdfJob = null; closeModal();
  if (pdfUrl) { const u = pdfUrl; pdfUrl = null; setTimeout(() => URL.revokeObjectURL(u), 60000); }
}

Object.assign(ACTIONS, {
  'pdf-conv': el => {
    const m = S.thread.messages.find(x => x.id === el.dataset.mid);
    const a = m.attachments[+el.dataset.ai];
    pdfStart({ mid: m.id, attId: a.attachmentId, data: a.data, url: a.url, filename: a.filename, mimeType: a.mimeType, size: a.size });
  },
  'pdf-drive': (el, e) => { e?.preventDefault?.(); pdfDrive(); },
  'pdf-local': () => pdfLocal(),
  'pdf-print': () => pdfPrint(),
  'pdf-close': () => pdfClose()
});
