/* Mail — kişisel Gmail istemcisi
 * Gmail'e doğrudan tarayıcıdan, Gmail API ile bağlanır. Arada sunucu yok;
 * mailler ve oturum bilgisi sadece bu cihazda kalır.
 */
'use strict';

const CLIENT_ID = (window.MAIL_CONFIG && window.MAIL_CONFIG.CLIENT_ID || '').trim();
const DEMO = new URLSearchParams(location.search).has('demo');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',          // okuma, etiketleme, gönderme
  'https://www.googleapis.com/auth/gmail.settings.basic'   // filtre oluşturma
].join(' ');
const API = 'https://gmail.googleapis.com/gmail/v1/users/me/';

/* ───────────── Yardımcılar ───────────── */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); }
  });
  await Promise.all(workers);
  return out;
}

function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s || '';
  return t.value;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const utf8 = s => new TextEncoder().encode(s);
const toB64url = s => bytesToB64(utf8(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function decodeText(data, charset) {
  const bytes = b64urlToBytes(data);
  try { return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

// =?UTF-8?B?...?= gibi kodlanmış başlıkları çözer (Gmail çoğunlukla zaten çözülmüş verir)
function decodeMimeWords(s) {
  if (!s || !s.includes('=?')) return s || '';
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=\s*/g, (m, cs, enc, txt) => {
    try {
      let bytes;
      if (enc.toUpperCase() === 'B') bytes = Uint8Array.from(atob(txt), c => c.charCodeAt(0));
      else {
        const t = txt.replace(/_/g, ' ');
        const arr = [];
        for (let i = 0; i < t.length; i++) {
          if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) { arr.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; }
          else arr.push(t.charCodeAt(i));
        }
        bytes = new Uint8Array(arr);
      }
      return new TextDecoder(cs.toLowerCase()).decode(bytes);
    } catch { return m; }
  });
}

function parseAddress(str) {
  str = decodeMimeWords(str || '').trim();
  const m = str.match(/^(.*?)<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^"|"$/g, '').trim();
    return { name: name || m[2].trim(), email: m[2].trim().toLowerCase() };
  }
  return { name: str, email: str.toLowerCase() };
}
const emailsIn = s => (String(s || '').match(/[^\s<>,;"]+@[^\s<>,;"]+/g) || []);

const GENERIC_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'yandex.com', 'yandex.com.tr', 'yandex.ru', 'aol.com',
  'proton.me', 'protonmail.com', 'mynet.com', 'windowslive.com', 'hotmail.com.tr', 'outlook.com.tr']);
function baseDomain(d) {
  const p = (d || '').toLowerCase().split('.');
  const second = ['com', 'net', 'org', 'gov', 'edu', 'co', 'gen', 'web', 'bel', 'k12', 'av', 'biz', 'info', 'tv', 'ac'];
  if (p.length >= 3 && p[p.length - 1].length === 2 && second.includes(p[p.length - 2])) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}
// Bir göndericiyi kural anahtarına çevirir: şirketler için alan adı, kişisel adresler için adresin kendisi
function senderKey(email) {
  const dom = baseDomain(email.split('@')[1] || '');
  return GENERIC_DOMAINS.has(dom) ? email : dom;
}

function fmtDate(ms, long) {
  const d = new Date(ms), now = new Date();
  if (long) return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('tr-TR');
}
function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

function avatarColor(s) {
  let h = 0;
  for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 42%)`;
}
function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function htmlToText(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('style,script,head').forEach(n => n.remove());
  return (d.body.innerText || d.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

/* ───────────── Simgeler ───────────── */

const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
const IC = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  inbox: svg('<path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M5.5 5h13L21 13v6H3v-6z"/>'),
  star: svg('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>'),
  starFill: svg('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor"/>'),
  send: svg('<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>'),
  file: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>'),
  alert: svg('<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  block: svg('<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>'),
  archive: svg('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>'),
  unread: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/><circle cx="19" cy="5" r="3" fill="currentColor" stroke="none"/>'),
  tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
  reply: svg('<path d="M10 8 4 13l6 5"/><path d="M4 13h10a6 6 0 0 1 6 6"/>'),
  forward: svg('<path d="m14 8 6 5-6 5"/><path d="M20 13H10a6 6 0 0 0-6 6"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  wand: svg('<path d="m4 20 11-11M14 4v3M19 9h-3M17.5 5.5 16 7M9 3.5v1.5M20 14v1.5M5.5 7H7"/>'),
  logout: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  clip: svg('<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>'),
  caret: svg('<path d="m9 6 6 6-6 6"/>', 'class="caret-ic"'),
  check: svg('<path d="m5 12 5 5L20 7"/>'),
};
// Etiket rozeti: zemin etiketin rengi, yazı rengi zemine göre otomatik (koyu zeminde beyaz, açıkta siyah)
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#1d1f23';
  const n = parseInt(m[1], 16), lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const L = .2126 * lin(n >> 16) + .7152 * lin((n >> 8) & 255) + .0722 * lin(n & 255);
  return L > .4 ? '#1d1f23' : '#ffffff';
}
const tagChip = (l, text) => {
  const bg = /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#aab0b8';
  return `<span class="tchip" style="--bg:${bg};--ink:${inkFor(bg)}" title="${esc(l.name)}">${esc(text)}</span>`;
};
const dot = color => `<span class="ldot" style="--c:${esc(color || '#8a8a8a')}"></span>`;
const tagIcon = color => `<svg class="tagic" viewBox="0 0 20 14" width="18" height="13"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11l5 6-5 6h-11A1.5 1.5 0 0 1 1 11.5z" fill="${esc(color || '#8a8a8a')}"/></svg>`;

/* ───────────── Google girişi (OAuth, tarayıcı içi) ───────────── */

const Auth = {
  redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); },
  token() {
    const t = store.get('auth');
    return t && t.exp > Date.now() + 30000 ? t.token : null;
  },
  login(silent) {
    const state = Math.random().toString(36).slice(2);
    store.set('oauthState', state);
    if (silent) store.set('silentAt', Date.now());
    const p = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: this.redirectUri(), response_type: 'token',
      scope: SCOPES, include_granted_scopes: 'true', state
    });
    const hint = store.get('email');
    if (hint) p.set('login_hint', hint);
    if (silent) p.set('prompt', 'none');
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
  },
  // Google'dan dönüşte adres çubuğundaki #access_token=... kısmını okur
  handleRedirect() {
    if (!location.hash.includes('state=')) return null;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    if (h.get('state') !== store.get('oauthState')) return 'state';
    store.del('oauthState');
    if (h.get('access_token')) {
      store.set('auth', { token: h.get('access_token'), exp: Date.now() + (+h.get('expires_in') || 3600) * 1000 });
      store.del('silentAt');
      return 'ok';
    }
    return h.get('error') || 'error';
  },
  // Süre dolunca sessizce yeniler; az önce denendiyse giriş ekranına döner
  reauth() {
    store.del('auth');
    const last = store.get('silentAt', 0);
    if (Date.now() - last > 60000 && store.get('email')) this.login(true);
    else showLogin();
  },
  logout() {
    const t = store.get('auth');
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.token), { method: 'POST' }).catch(() => {});
    store.del('auth'); store.del('email');
    showLogin();
  }
};

/* ───────────── Gmail API katmanı ───────────── */

class AuthError extends Error {}

/* Gmail'in kota sınırı: kullanıcı başına dakikada ~15.000 "birim".
   Her istek türünün bir maliyeti var; istekleri bu sınırın altında kalacak şekilde sıraya koyuyoruz. */
const QUOTA = { perMinute: 11000, perSecond: 220 };
function costOf(path, method) {
  if (path === 'messages/send') return 100;
  if (path.endsWith('batchModify')) return 50;
  if (/^threads\/[^/]+$/.test(path) && method === 'GET') return 10;
  if (/\/(modify|trash)$/.test(path)) return path.startsWith('threads') ? 10 : 5;
  if (path.startsWith('labels')) return 1;
  return 5;
}
const Quota = {
  log: [],             // [zaman, birim]
  pausedUntil: 0,
  used(ms) { const t = Date.now() - ms; return this.log.reduce((s, [at, c]) => at > t ? s + c : s, 0); },
  async take(cost) {
    for (;;) {
      const now = Date.now();
      this.log = this.log.filter(([at]) => at > now - 60000);
      if (now >= this.pausedUntil && this.used(60000) + cost <= QUOTA.perMinute && this.used(1000) + cost <= QUOTA.perSecond) {
        this.log.push([now, cost]); return;
      }
      await sleep(Math.max(120, this.pausedUntil - now));
    }
  },
  backoff(ms) { this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms); }
};
const isRateLimit = (status, msg) => status === 429 || (status === 403 && /rate|quota|limit/i.test(msg));

async function call(path, { method = 'GET', body, query } = {}) {
  const url = new URL(API + path);
  if (query) for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else if (v != null && v !== '') url.searchParams.set(k, v);
  }
  const cost = costOf(path, method);
  for (let attempt = 0; ; attempt++) {
    await Quota.take(cost);
    const tok = Auth.token();
    if (!tok) { Auth.reauth(); throw new AuthError('oturum'); }
    const res = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + tok, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { Auth.reauth(); throw new AuthError('oturum'); }
    if (!res.ok) {
      let msg = res.status + '';
      try { msg = (await res.json()).error.message; } catch {}
      // Kotaya takıldıysak bir süre herkes beklesin, sonra aynı isteği tekrar dene (en fazla ~2 dakika)
      if (isRateLimit(res.status, msg) && attempt < 6) {
        const wait = Math.min(60000, 5000 * 2 ** attempt);
        Quota.backoff(wait);
        if (wait >= 10000) toast('Gmail kısa bir mola istedi, birkaç saniye içinde devam ediliyor…', [], wait);
        continue;
      }
      if (res.status >= 500 && attempt < 4) { await sleep(800 * 2 ** attempt); continue; }
      throw new Error(msg);
    }
    if (res.status === 204) return {};
    const txt = await res.text();
    return txt ? JSON.parse(txt) : {};
  }
}

const hdr = (msg, name) => {
  const h = (msg.payload?.headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? decodeMimeWords(h.value) : '';
};

function summarizeThread(t) {
  const msgs = t.messages || [];
  const first = msgs[0] || {}, last = msgs[msgs.length - 1] || {};
  const labelIds = [...new Set(msgs.flatMap(m => m.labelIds || []))];
  const f = parseAddress(hdr(last, 'From'));
  const to = parseAddress(hdr(last, 'To'));
  return {
    id: t.id, from: f.name, fromEmail: f.email, to: to.name,
    subject: hdr(first, 'Subject'), snippet: decodeEntities(last.snippet || ''),
    date: +last.internalDate || 0, count: msgs.length, labelIds,
    unread: labelIds.includes('UNREAD'), starred: labelIds.includes('STARRED')
  };
}

function parseMessage(m) {
  const out = { html: '', text: '', attachments: [], inline: [] };
  const walk = part => {
    const mt = (part.mimeType || '').toLowerCase();
    const ph = n => (part.headers || []).find(h => h.name.toLowerCase() === n)?.value || '';
    const cs = (ph('content-type').match(/charset="?([^";\s]+)/i) || [])[1];
    const cid = ph('content-id').replace(/[<>\s]/g, '').toLowerCase();
    // Gömülü resimler: adı/eki olmasa bile Content-ID taşıyan her resim parçası
    if (cid && mt.startsWith('image/') && !part.filename && !part.body?.attachmentId) {
      if (part.body?.data) out.inline.push({ cid, mimeType: mt, data: part.body.data });
      return;
    }
    if (part.filename || part.body?.attachmentId) {
      if (cid && mt.startsWith('image/')) out.inline.push({ cid, mimeType: mt, attachmentId: part.body.attachmentId, data: part.body.data });
      if (part.filename && !(cid && /inline/i.test(ph('content-disposition')))) {
        out.attachments.push({ filename: part.filename, mimeType: mt, size: part.body?.size || 0, attachmentId: part.body?.attachmentId, data: part.body?.data, messageId: m.id });
      }
      return;
    }
    if (mt === 'text/html' && part.body?.data && !out.html) out.html = decodeText(part.body.data, cs);
    else if (mt === 'text/plain' && part.body?.data && !out.text) out.text = decodeText(part.body.data, cs);
    (part.parts || []).forEach(walk);
  };
  if (m.payload) walk(m.payload);
  const f = parseAddress(hdr(m, 'From'));
  return {
    id: m.id, labelIds: m.labelIds || [], from: f.name, fromEmail: f.email,
    to: hdr(m, 'To'), cc: hdr(m, 'Cc'), replyTo: hdr(m, 'Reply-To'),
    subject: hdr(m, 'Subject'), date: +m.internalDate || 0,
    messageId: hdr(m, 'Message-ID') || hdr(m, 'Message-Id'), references: hdr(m, 'References'),
    snippet: decodeEntities(m.snippet || ''), ...out
  };
}

function buildRaw({ to, cc, subject, body, inReplyTo, references }) {
  const encWord = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + bytesToB64(utf8(s)) + '?=';
  const addrs = s => emailsIn(s).join(', ');
  const lines = [`To: ${addrs(to)}`];
  if (cc && emailsIn(cc).length) lines.push(`Cc: ${addrs(cc)}`);
  lines.push(`Subject: ${encWord(subject || '')}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64');
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${[references, inReplyTo].filter(Boolean).join(' ')}`);
  const b = bytesToB64(utf8(body || '')).replace(/.{76}/g, '$&\r\n');
  return toB64url(lines.join('\r\n') + '\r\n\r\n' + b);
}

const RealGmail = {
  async profile() { const p = await call('profile'); return { email: p.emailAddress }; },
  async labels() {
    const { labels = [] } = await call('labels');
    const full = await pmap(labels, 6, l => call('labels/' + l.id).catch(() => l));
    return full.map(l => ({ id: l.id, name: l.name, type: l.type, color: l.color?.backgroundColor || null, unread: l.threadsUnread || 0, total: l.threadsTotal || 0 }));
  },
  async listThreads({ labelId, q, pageToken }) {
    const r = await call('threads', { query: { maxResults: 25, labelIds: labelId && labelId !== 'ALL' ? labelId : null, q, pageToken } });
    const ts = await pmap(r.threads || [], 6, t => call('threads/' + t.id, { query: { format: 'metadata', metadataHeaders: ['From', 'To', 'Subject'] } }));
    return { threads: ts.map(summarizeThread), next: r.nextPageToken || null };
  },
  async getThread(id) {
    const t = await call('threads/' + id, { query: { format: 'full' } });
    const messages = (t.messages || []).map(parseMessage);
    return { id: t.id, messages, labelIds: [...new Set(messages.flatMap(m => m.labelIds))] };
  },
  modifyThread: (id, add = [], remove = []) => call(`threads/${id}/modify`, { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove } }),
  trashThread: id => call(`threads/${id}/trash`, { method: 'POST' }),
  trashMessages: ids => pmap(ids, 5, id => call(`messages/${id}/trash`, { method: 'POST' })),
  send: (msg, threadId) => call('messages/send', { method: 'POST', body: { raw: buildRaw(msg), ...(threadId ? { threadId } : {}) } }),
  async attachment(messageId, attachmentId) { return (await call(`messages/${messageId}/attachments/${attachmentId}`)).data; },
  async filters() { return (await call('settings/filters')).filter || []; },
  createFilter: (criteria, action) => call('settings/filters', { method: 'POST', body: { criteria, action } }),
  deleteFilter: id => call('settings/filters/' + id, { method: 'DELETE' }),
  async labelSenders(labelId, max) {
    const r = await call('messages', { query: { labelIds: labelId, maxResults: max } });
    const ms = await pmap(r.messages || [], 6, m => call('messages/' + m.id, { query: { format: 'metadata', metadataHeaders: ['From'] } }));
    return ms.map(m => parseAddress(hdr(m, 'From')).email).filter(Boolean);
  },
  async messageIdsByQuery(q, max = 500) {
    const ids = []; let pageToken;
    do {
      const r = await call('messages', { query: { q, maxResults: 500, pageToken } });
      (r.messages || []).forEach(m => ids.push(m.id));
      pageToken = r.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  },
  async batchModify(ids, add = [], remove = []) {
    for (let i = 0; i < ids.length; i += 1000)
      await call('messages/batchModify', { method: 'POST', body: { ids: ids.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove } });
  }
};

const Gmail = DEMO ? window.MockGmail : RealGmail;

/* ───────────── Uygulama durumu ───────────── */

const SYSTEM = [
  ['INBOX', 'Gelen Kutusu', 'inbox'], ['STARRED', 'Yıldızlı', 'star'], ['SENT', 'Gönderilmiş', 'send'],
  ['DRAFT', 'Taslaklar', 'file'], ['ALL', 'Tüm Postalar', 'mail'], ['SPAM', 'Spam', 'alert'], ['TRASH', 'Çöp Kutusu', 'trash']
];

const S = {
  email: '', labels: [], labelById: {}, filters: null,
  labelId: 'INBOX', q: '', threads: [], next: null, loading: false,
  thread: null, threadId: null, openMsgs: new Set(), view: 'list', // list | thread | auto
  collapsed: store.get('collapsed', {})
};

function setLabels(labels) {
  const byName = new Map(labels.filter(l => l.type === 'user').map(l => [l.name, l]));
  for (const l of labels) {
    l.short = l.name; l.parentId = null;
    const parts = l.name.split('/');
    for (let i = parts.length - 1; i > 0 && l.type === 'user'; i--) {
      const p = byName.get(parts.slice(0, i).join('/'));
      if (p) { l.parentId = p.id; l.short = parts.slice(i).join('/'); break; }
    }
  }
  // Uygulamaya özel renkler (sadece bu tarayıcıda; Gmail'deki renge dokunmaz)
  const custom = store.get('labelColors', {});
  for (const l of labels) {
    if (l.type !== 'user') continue;
    l.gmailColor = l.color;
    if (custom[l.id]) l.color = custom[l.id];
  }
  S.labels = labels;
  S.labelById = Object.fromEntries(labels.map(l => [l.id, l]));
}
const userLabels = () => S.labels.filter(l => l.type === 'user').sort((a, b) => a.name.localeCompare(b.name, 'tr'));
const shortName = l => l.short || l.name;

/* ───────────── Ekranlar ───────────── */

function showSetup() {
  $('#app').innerHTML = `
  <div class="center-screen">
    <div class="brand-mark">${IC.mail}</div>
    <h1>Kurulum tamamlanmadı</h1>
    <p><code>config.js</code> dosyasına Google Cloud'dan aldığın <b>Client ID</b>'yi eklemen gerekiyor.</p>
    <a class="btn" href="?demo">Örnek verilerle dene</a>
  </div>`;
}

function showLogin(msg) {
  $('#app').innerHTML = `
  <div class="center-screen">
    <div class="brand-mark">${IC.mail}</div>
    <h1>Mail</h1>
    <p>Gmail hesabınla giriş yap. Mailler sadece bu cihazda görüntülenir, başka bir yere gönderilmez.</p>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <button class="btn primary" data-action="login">Google ile giriş yap</button>
  </div>`;
}

function showShell() {
  $('#app').innerHTML = `
  <div class="shell" id="shell" data-view="list">
    <aside class="sidebar" id="sidebar"></aside>
    <div class="scrim" data-action="close-drawer"></div>
    <section class="listpane">
      <header class="bar">
        <button class="icon-btn only-mobile" data-action="open-drawer" aria-label="Menü">${IC.menu}</button>
        <h1 id="listTitle">Gelen Kutusu</h1>
        <button class="icon-btn" data-action="refresh" aria-label="Yenile">${IC.refresh}</button>
      </header>
      <form class="searchbox" id="searchForm">
        ${IC.search}<input id="search" type="search" placeholder="Postalarda ara" autocomplete="off" enterkeyhint="search">
        <button type="button" class="icon-btn clear" data-action="clear-search" aria-label="Temizle">${IC.close}</button>
      </form>
      <div id="list" class="list"></div>
      <button class="fab" data-action="compose" aria-label="Yeni posta">${IC.pen}<span>Yeni</span></button>
    </section>
    <section class="reader" id="reader"><div class="empty-reader">${IC.mail}<p>Okumak için bir posta seç</p></div></section>
  </div>`;
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#search').value.trim();
    $('#search').blur();
    S.q = q;
    loadList();
  });
}

function setView(v, push) {
  S.view = v;
  $('#shell')?.setAttribute('data-view', v === 'list' ? 'list' : 'thread');
  if (push) history.pushState({ v }, '');
}

/* Kenar çubuğu */

function renderSidebar() {
  const el = $('#sidebar');
  if (!el) return;
  // Az kullanılan klasörler "Daha fazla" altında gizli durur
  const MORE = ['DRAFT', 'ALL', 'SPAM', 'TRASH'];
  const showMore = S.collapsed.__more === false || MORE.includes(S.labelId);
  const sysHtml = SYSTEM.filter(([id]) => showMore || !MORE.includes(id)).map(([id, name, ic]) => {
    const l = S.labelById[id];
    const n = id === 'INBOX' || id === 'SPAM' ? (l?.unread || 0) : (id === 'DRAFT' ? (l?.total || 0) : 0);
    return navItem({ id, html: IC[ic], name, count: n, depth: 0 });
  }).join('') + `<div class="nav-item tool more-toggle" data-action="toggle-more" style="--d:0"><span class="caret-sp"></span><span class="nav-name">${showMore ? 'Daha az' : 'Daha fazla'}</span></div>`;

  // Etiket ağacı: "Garanti/Annem Garanti" → Garanti'nin altında.
  // Üst etiketi olmayan "Microsoft/Xbox" gibi isimler olduğu gibi gösterilir.
  const kids = new Map();
  for (const l of userLabels()) {
    const key = l.parentId || '';
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(l);
  }
  const renderNode = (pid, depth) => (kids.get(pid) || []).map(l => {
    const hasKids = kids.has(l.id);
    const collapsed = !!S.collapsed[l.id];
    return navItem({ id: l.id, html: `<span class="dot-btn" data-action="color-label" data-id="${l.id}" title="Rengini değiştir">${dot(l.color)}</span>`, name: l.short, count: l.unread, depth, caret: hasKids, collapsed, key: l.id })
      + (hasKids && !collapsed ? renderNode(l.id, depth + 1) : '');
  }).join('');

  el.innerHTML = `
    <div class="side-head">
      <span class="wordmark">Mail</span>
      <button class="compose-mini" data-action="compose" title="Yeni posta">${IC.pen}<span>Yeni</span></button>
    </div>
    <nav>
      ${sysHtml}
      <div class="nav-sep">Etiketler</div>
      ${renderNode('', 0) || '<div class="nav-empty">Etiket yok</div>'}
      <div class="nav-sep"></div>
      <div class="nav-item tool ${S.view === 'auto' ? 'active' : ''}" data-action="auto" style="--d:0"><span class="caret-sp"></span>${IC.wand}<span class="nav-name">Otomatik etiketleme</span></div>
      <div class="nav-item tool" data-action="logout" style="--d:0"><span class="caret-sp"></span>${IC.logout}<span class="nav-name">Çıkış yap</span></div>
    </nav>
    <div class="acct-foot">${esc(S.email)}</div>`;
}
const caretBtn = (key, collapsed) => `<span class="caret ${collapsed ? '' : 'open'}" data-action="toggle-node" data-key="${esc(key)}">${IC.caret}</span>`;
function navItem({ id, html, name, count, depth, caret, collapsed, key }) {
  const active = S.view !== 'auto' && !S.q && S.labelId === id;
  return `<div class="nav-item ${active ? 'active' : ''} ${count ? 'has-unread' : ''}" data-action="open-label" data-id="${esc(id)}" style="--d:${depth}">
    ${caret ? caretBtn(key, collapsed) : '<span class="caret-sp"></span>'}${html}
    <span class="nav-name">${esc(name)}</span>${count ? `<span class="count">${count}</span>` : ''}</div>`;
}

/* Liste */

function listTitle() {
  if (S.q) return `“${S.q}”`;
  const sys = SYSTEM.find(s => s[0] === S.labelId);
  if (sys) return sys[1];
  const l = S.labelById[S.labelId];
  return l ? shortName(l) : 'Posta';
}

async function loadList(more) {
  if (S.loading) return;
  S.loading = true;
  if (!more) { S.threads = []; S.next = null; }
  $('#listTitle').textContent = listTitle();
  $('#searchForm').classList.toggle('has-q', !!S.q);
  renderList(true);
  try {
    const r = await Gmail.listThreads({ labelId: S.q ? null : S.labelId, q: S.q, pageToken: more ? S.next : null });
    S.threads = S.threads.concat(r.threads);
    S.next = r.next;
  } catch (e) { if (!(e instanceof AuthError)) toast('Postalar yüklenemedi: ' + e.message); }
  S.loading = false;
  renderList();
}

function renderList(loading) {
  const el = $('#list');
  if (!el) return;
  const showTo = S.labelId === 'SENT' || S.labelId === 'DRAFT';
  const items = S.threads.map(t => {
    const chips = t.labelIds.map(id => S.labelById[id]).filter(l => l && l.type === 'user' && l.id !== S.labelId)
      .map(l => tagChip(l, l.name)).join('');
    const who = showTo ? 'Kime: ' + (t.to || '') : t.from;
    return `<div class="row ${t.unread ? 'unread' : ''} ${S.threadId === t.id ? 'sel' : ''}" data-action="open-thread" data-id="${t.id}" draggable="true">
      <div class="row-main">
        <div class="row-top"><span class="who">${esc(who)}${t.count > 1 ? ` <i>${t.count}</i>` : ''}</span><span class="date">${fmtDate(t.date)}</span></div>
        <div class="subj">${t.starred ? '<span class="st">★</span>' : ''}${esc(t.subject || '(konu yok)')}</div>
        <div class="snip">${esc(t.snippet)}</div>
        ${chips ? `<div class="chips">${chips}</div>` : ''}
      </div></div>`;
  }).join('');
  let tail = '';
  if (loading && !S.threads.length) tail = skeleton();
  else if (loading) tail = '<div class="list-msg">Yükleniyor…</div>';
  else if (!S.threads.length) tail = `<div class="list-msg">${S.q ? 'Sonuç bulunamadı' : 'Burada posta yok'}</div>`;
  else if (S.next) tail = '<button class="btn more" data-action="more">Daha fazla yükle</button>';
  el.innerHTML = items + tail;
}
const skeleton = () => Array.from({ length: 7 }, () => '<div class="row skel"><div class="row-main"><div class="bar1"></div><div class="bar2"></div><div class="bar3"></div></div></div>').join('');

/* Okuma ekranı */

async function openThread(id) {
  S.threadId = id;
  if (S.view !== 'thread') setView('thread', matchMedia('(max-width: 800px)').matches);
  else setView('thread');
  renderList();
  renderSidebar();
  const r = $('#reader');
  r.innerHTML = `<div class="reader-bar">${readerButtons()}</div><div class="list-msg">Yükleniyor…</div>`;
  try {
    const t = await Gmail.getThread(id);
    if (S.threadId !== id) return;
    S.thread = t;
    S.openMsgs = new Set(t.messages.filter((m, i) => i === t.messages.length - 1 || m.labelIds.includes('UNREAD')).map(m => m.id));
    renderThread();
    if (t.labelIds.includes('UNREAD')) {
      await Gmail.modifyThread(id, [], ['UNREAD']);
      markLocal(id, [], ['UNREAD']);
    }
  } catch (e) { if (!(e instanceof AuthError)) r.innerHTML = `<div class="list-msg">Açılamadı: ${esc(e.message)}</div>`; }
}

function readerButtons() {
  const t = S.thread && S.thread.id === S.threadId ? S.thread : null;
  const starred = t?.labelIds.includes('STARRED');
  return `
    <button class="icon-btn back" data-action="back" aria-label="Geri">${IC.back}</button>
    <button class="icon-btn" data-action="archive" title="Arşivle">${IC.archive}</button>
    <button class="icon-btn" data-action="trash" title="Sil">${IC.trash}</button>
    <button class="icon-btn" data-action="mark-unread" title="Okunmadı yap">${IC.unread}</button>
    <button class="icon-btn ${starred ? 'on' : ''}" data-action="star" title="Yıldızla">${starred ? IC.starFill : IC.star}</button>
    <button class="icon-btn" data-action="labels" title="Etiketler">${IC.tag}</button>
    <button class="icon-btn" data-action="block" title="Göndericiyi engelle">${IC.block}</button>
    <div class="spacer"></div>`;
}

function renderThread() {
  const t = S.thread;
  const r = $('#reader');
  const prevScroll = r.querySelector('.reader-scroll')?.scrollTop || 0;
  const msgs = t.messages;
  const chips = t.labelIds.map(id => S.labelById[id]).filter(l => l && l.type === 'user')
    .map(l => tagChip(l, l.name)).join('');
  r.innerHTML = `
    <div class="reader-bar">${readerButtons()}</div>
    <div class="reader-scroll">
      <h2 class="t-subj">${esc(msgs[0]?.subject || '(konu yok)')}</h2>
      ${chips ? `<div class="chips t-chips">${chips}</div>` : ''}
      ${msgs.map((m, i) => {
        const open = S.openMsgs.has(m.id);
        return `<article class="msg ${open ? 'open' : ''}" data-mid="${m.id}">
          <header class="msg-head" data-action="toggle-msg">
            <div class="msg-who">
              <div><b>${esc(m.from)}</b> <span class="addr">&lt;${esc(m.fromEmail)}&gt;</span></div>
              <div class="msg-sub">${open ? 'Kime: ' + esc(m.to) + (m.cc ? ' · Cc: ' + esc(m.cc) : '') : esc(m.snippet)}</div>
            </div>
            <span class="date">${fmtDate(m.date, open)}</span>
          </header>
          ${open ? `<div class="msg-body"></div>
            ${m.attachments.length ? `<div class="atts">${m.attachments.map((a, ai) => `<button class="att" data-action="att" data-mid="${m.id}" data-ai="${ai}">${IC.clip}<span>${esc(a.filename)}</span><small>${fmtSize(a.size)}</small></button>`).join('')}</div>` : ''}
            <div class="msg-actions">
              <button class="btn" data-action="reply" data-mid="${m.id}">${IC.reply} Yanıtla</button>
              <button class="btn" data-action="forward" data-mid="${m.id}">${IC.forward} İlet</button>
            </div>` : ''}
        </article>`;
      }).join('')}
    </div>`;
  msgs.forEach(m => {
    const body = r.querySelector(`.msg[data-mid="${m.id}"] .msg-body`);
    if (body) renderBody(body, m);
  });
  r.querySelector('.reader-scroll').scrollTop = prevScroll;
}

// Resimlerin yüklenmesini engelleyen durumları düzeltir
function prepareHtml(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('img').forEach(img => {
    img.removeAttribute('loading');                    // tembel yükleme çerçeve içinde hiç tetiklenmeyebiliyor
    const src = (img.getAttribute('src') || '').trim();
    if (/^cid:/i.test(src)) {
      img.setAttribute('data-cid', decodeURIComponent(src.slice(4)).replace(/[<>\s]/g, '').toLowerCase());
      img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
    } else if (/^http:\/\//i.test(src)) {
      img.setAttribute('data-orig', src);
      img.setAttribute('src', 'https://' + src.slice(7));  // güvenli sayfada http resimler engellenir
    }
    const ss = img.getAttribute('srcset');
    if (ss) img.setAttribute('srcset', ss.replace(/http:\/\//gi, 'https://'));
  });
  d.querySelectorAll('[background]').forEach(el => {
    el.setAttribute('background', el.getAttribute('background').replace(/^http:\/\//i, 'https://'));
  });
  return d.body.innerHTML.replace(/url\((['"]?)http:\/\//gi, 'url($1https://');
}

// https ile açılmayan eski sunuculardaki resimler için yedek yol
const imgProxy = url => 'https://images.weserv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//i, ''));

function renderBody(container, m) {
  if (!m.html) {
    container.innerHTML = `<div class="plain">${linkify(m.text || m.snippet || '')}</div>`;
    return;
  }
  // HTML mailler, scriptleri çalıştıramayan izole bir çerçevede gösterilir
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  f.className = 'mailframe';
  f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
    <meta name="referrer" content="no-referrer">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html{overflow-x:auto}body{margin:0;padding:16px;font:15px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1d1f;background:#fff;overflow-wrap:anywhere}
    img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${prepareHtml(m.html)}</body></html>`;
  container.appendChild(f);
  const fit = () => { try { f.style.height = f.contentDocument.documentElement.scrollHeight + 'px'; } catch {} };

  let wired = false;
  const wire = () => {
    let doc;
    try { doc = f.contentDocument; } catch { return; }
    if (wired || !doc || !doc.body || doc.URL !== 'about:srcdoc') return;
    wired = true;
    fit();
    try { new ResizeObserver(fit).observe(doc.body); } catch {}
    doc.querySelectorAll('img').forEach(img => {
      img.addEventListener('load', fit);
      img.addEventListener('error', () => retryImg(img));
    });
    // Gömülü (cid:) resimleri hemen yükle; diğer resimlerin bitmesini bekleme
    doc.querySelectorAll('img[data-cid]').forEach(async img => {
      const cid = img.getAttribute('data-cid');
      const part = m.inline.find(p => p.cid === cid) || m.inline.find(p => p.cid.split('@')[0] === cid.split('@')[0]);
      if (!part) return;
      try {
        const data = part.data || await Gmail.attachment(m.id, part.attachmentId);
        img.src = `data:${part.mimeType};base64,` + data.replace(/-/g, '+').replace(/_/g, '/');
      } catch {}
    });
  };
  const retryImg = img => {
    const orig = img.getAttribute('data-orig') || img.currentSrc || img.getAttribute('src') || '';
    if (img.dataset.retried || !/^https?:/i.test(orig) || orig.includes('images.weserv.nl')) return;
    img.dataset.retried = '1';
    img.removeAttribute('srcset');
    img.src = imgProxy(orig);
  };
  // srcdoc'un "load" olayı tüm resimler inene kadar gecikir; çerçeveyi erken bağla
  const poll = setInterval(() => { wire(); if (wired) clearInterval(poll); }, 30);
  f.addEventListener('load', () => {
    clearInterval(poll); wire(); fit();
    try {   // olay kaçmışsa: yüklenemeyen resimleri yakala
      f.contentDocument.querySelectorAll('img').forEach(img => { if (img.complete && !img.naturalWidth) retryImg(img); });
    } catch {}
  });
}

function markLocal(id, add, remove) {
  const apply = list => {
    let s = new Set(list);
    add.forEach(x => s.add(x)); remove.forEach(x => s.delete(x));
    return [...s];
  };
  const t = S.threads.find(x => x.id === id);
  const before = t ? t.labelIds : (S.thread?.id === id ? S.thread.labelIds : []);
  const wasUnread = before.includes('UNREAD');
  if (t) { t.labelIds = apply(t.labelIds); t.unread = t.labelIds.includes('UNREAD'); t.starred = t.labelIds.includes('STARRED'); }
  if (S.thread?.id === id) S.thread.labelIds = apply(S.thread.labelIds);
  const after = t ? t.labelIds : S.thread?.labelIds || [];
  const nowUnread = after.includes('UNREAD');
  if (wasUnread !== nowUnread) {
    for (const lid of new Set([...before, ...after])) {
      const l = S.labelById[lid];
      if (l) l.unread = Math.max(0, l.unread + (nowUnread ? 1 : -1));
    }
  }
  renderList(); renderSidebar();
  refreshCountsSoon();
}

let countsTimer;
function refreshCountsSoon() {
  clearTimeout(countsTimer);
  countsTimer = setTimeout(async () => {
    try { setLabels(await Gmail.labels()); renderSidebar(); renderList(); } catch {}
  }, 2500);
}

function closeReader() {
  S.threadId = null; S.thread = null;
  $('#reader').innerHTML = `<div class="empty-reader">${IC.mail}<p>Okumak için bir posta seç</p></div>`;
  setView('list');
  renderList(); renderSidebar();
}
function removeFromList(id) {
  S.threads = S.threads.filter(t => t.id !== id);
}

/* Yazma, yanıtlama, iletme */

function openCompose(init = {}) {
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <form class="sheet compose" id="composeForm">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>${esc(init.title || 'Yeni posta')}</h3>
        <button type="submit" class="btn primary">${IC.send} Gönder</button>
      </header>
      <label class="field"><span>Kime</span><input name="to" type="text" inputmode="email" autocomplete="email" value="${esc(init.to || '')}" required></label>
      ${init.cc ? `<label class="field"><span>Cc</span><input name="cc" type="text" value="${esc(init.cc)}"></label>` : ''}
      <label class="field"><span>Konu</span><input name="subject" type="text" value="${esc(init.subject || '')}"></label>
      <textarea name="body" placeholder="Mesajını yaz…">${esc(init.body || '')}</textarea>
    </form>
  </div>`;
  const form = $('#composeForm');
  const ta = form.body;
  setTimeout(() => {
    (init.to ? ta : form.to).focus();
    if (init.to) ta.setSelectionRange(0, 0);
  }, 50);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!emailsIn(form.to.value).length) { toast('Geçerli bir alıcı adresi gir'); return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Gönderiliyor…';
    try {
      await Gmail.send({
        to: form.to.value, cc: form.cc?.value, subject: form.subject.value, body: ta.value,
        inReplyTo: init.inReplyTo, references: init.references
      }, init.threadId);
      closeModal();
      toast('Gönderildi');
      if (init.threadId && S.threadId === init.threadId) openThread(init.threadId);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = `${IC.send} Gönder`;
      if (!(err instanceof AuthError)) toast('Gönderilemedi: ' + err.message);
    }
  });
}

function quoteOf(m) {
  const txt = m.text || (m.html ? htmlToText(m.html) : m.snippet);
  return `\n\n${fmtDate(m.date, true)} tarihinde ${m.from} <${m.fromEmail}> şunu yazdı:\n` + txt.split('\n').map(l => '> ' + l).join('\n');
}
function replyTo(m) {
  const subj = /^(re|ynt|yanıt)\s*:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject;
  const sentByMe = m.fromEmail === S.email;
  openCompose({
    title: 'Yanıtla', to: sentByMe ? m.to : (m.replyTo || `${m.from} <${m.fromEmail}>`), subject: subj,
    body: quoteOf(m), inReplyTo: m.messageId, references: m.references, threadId: S.thread.id
  });
}
function forward(m) {
  const subj = /^(fwd?|ilt)\s*:/i.test(m.subject) ? m.subject : 'Fwd: ' + m.subject;
  const txt = m.text || (m.html ? htmlToText(m.html) : m.snippet);
  openCompose({
    title: 'İlet', subject: subj,
    body: `\n\n---------- İletilen ileti ----------\nGönderen: ${m.from} <${m.fromEmail}>\nTarih: ${fmtDate(m.date, true)}\nKonu: ${m.subject}\nKime: ${m.to}\n\n${txt}`
  });
}

function closeModal() { $('#modal').innerHTML = ''; }

/* Etiket seçici */

function openLabelPicker() {
  const t = S.thread;
  const has = new Set(t.labelIds);
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet picker">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Etiketler</h3>
        <button class="btn primary" data-action="apply-labels">Uygula</button>
      </header>
      <div class="pick-list">
        ${userLabels().map(l => {
          let depth = 0; for (let p = l; p.parentId; p = S.labelById[p.parentId]) depth++;
          return `<label class="pick" style="--d:${depth}"><input type="checkbox" value="${l.id}" ${has.has(l.id) ? 'checked' : ''}>${dot(l.color)}<span class="pick-name">${esc(shortName(l))}</span><i class="pick-check">${IC.check}</i></label>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

async function applyLabels() {
  const t = S.thread;
  const checked = new Set([...document.querySelectorAll('.pick input:checked')].map(i => i.value));
  const current = new Set(t.labelIds.filter(id => S.labelById[id]?.type === 'user'));
  const add = [...checked].filter(id => !current.has(id));
  const remove = [...current].filter(id => !checked.has(id));
  closeModal();
  if (!add.length && !remove.length) return;
  try {
    await Gmail.modifyThread(t.id, add, remove);
    markLocal(t.id, add, remove);
    renderThread();
    if (remove.includes(S.labelId)) removeFromList(t.id), renderList();
    if (add.length === 1) offerRule(t, add[0]);
    else toast('Etiketler güncellendi');
  } catch (e) { if (!(e instanceof AuthError)) toast('Etiket değiştirilemedi: ' + e.message); }
}

// Elle etiketlemeden sonra: "bu gönderici hep buraya gitsin mi?"
async function offerRule(thread, labelId) {
  const sender = [...thread.messages].reverse().find(m => m.fromEmail !== S.email) || thread.messages[0];
  if (!sender) return;
  try { if (!S.filters) S.filters = await Gmail.filters(); } catch { return; }
  let key = senderKey(sender.fromEmail);
  const covers = (f, k) => (f.criteria?.from || '').toLowerCase().includes(k);
  if (S.filters.some(f => covers(f, sender.fromEmail) || covers(f, key))) { toast('Etiket eklendi'); return; }
  const label = S.labelById[labelId];
  toast(`Bundan sonra <b>${esc(key)}</b> adresinden gelenler doğrudan <b>${esc(shortName(label))}</b> etiketine gitsin mi?`, [
    ['Evet', async () => {
      try {
        const f = await Gmail.createFilter({ from: key }, { addLabelIds: [labelId], removeLabelIds: ['INBOX'] });
        S.filters.push(f);
        const ids = await Gmail.messageIdsByQuery(`in:inbox from:(${key})`, 500);
        if (ids.length) await Gmail.batchModify(ids, [labelId], ['INBOX']);
        if (S.labelId === 'INBOX') { S.threads = S.threads.filter(t => !(t.fromEmail === key || t.fromEmail.endsWith('@' + key) || t.fromEmail.endsWith('.' + key))); renderList(); }
        refreshCountsSoon();
        toast(`Kural oluşturuldu${ids.length ? ` · ${ids.length} mail etiketine taşındı` : ''}`);
      } catch (e) { toast('Kural oluşturulamadı: ' + e.message); }
    }],
    ['Hayır', () => {}]
  ], 12000);
}

/* ───────────── Göndericiyi engelle ───────────── */


function openBlockDialog() {
  const t = S.thread;
  const m = [...t.messages].reverse().find(x => x.fromEmail !== S.email) || t.messages[t.messages.length - 1];
  const email = m.fromEmail;
  const dom = baseDomain(email.split('@')[1] || '');
  const canDomain = !GENERIC_DOMAINS.has(dom);
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet picker block-sheet">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Göndericiyi engelle</h3>
      </header>
      <div class="block-body">
        <p>Bundan sonra gelen mailler gelen kutuna uğramadan <b>doğrudan çöp kutusuna</b> gidecek. Çöp kutusundakiler 30 gün sonra Gmail tarafından silinir.</p>
        <label class="radio"><input type="radio" name="bkey" value="${esc(email)}" checked><span><b>Sadece bu adres</b><small>${esc(email)}</small></span></label>
        ${canDomain ? `<label class="radio"><input type="radio" name="bkey" value="${esc(dom)}"><span><b>Bu alan adından gelen her şey</b><small>${esc(dom)} (tüm adresleri)</small></span></label>` : ''}
        <label class="check"><input type="checkbox" id="blockOld" checked> Eski maillerini de çöp kutusuna taşı</label>
      </div>
      <div class="block-actions">
        <button class="btn" data-action="close-modal">Vazgeç</button>
        <button class="btn danger" data-action="apply-block">${IC.block} Engelle</button>
      </div>
    </div>
  </div>`;
}

async function applyBlock() {
  const key = document.querySelector('input[name=bkey]:checked')?.value;
  const old = $('#blockOld')?.checked;
  const id = S.threadId;
  if (!key) return;
  const btn = document.querySelector('[data-action=apply-block]');
  btn.disabled = true; btn.textContent = 'Engelleniyor…';
  try {
    const f = await Gmail.createFilter({ from: key }, { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] });
    if (S.filters) S.filters.push(f);
    let moved = 0;
    if (old) {
      const ids = await Gmail.messageIdsByQuery(`from:(${key})`, 500);
      await Gmail.trashMessages(ids);
      moved = ids.length;
    }
    await Gmail.trashThread(id).catch(() => {});
    closeModal();
    removeFromList(id);
    if (old) S.threads = S.threads.filter(t => !(t.fromEmail === key || t.fromEmail.endsWith('@' + key) || t.fromEmail.endsWith('.' + key)));
    ACTIONS.back();
    refreshCountsSoon();
    toast(`${key} engellendi${moved ? ` · ${moved} eski mail çöpe taşındı` : ''}`);
  } catch (e) {
    closeModal();
    if (!(e instanceof AuthError)) toast('Engellenemedi: ' + e.message);
  }
}

/* ───────────── Otomatik etiketleme ───────────── */

const SCAN_PER_LABEL = 30;

async function openAuto() {
  S.threadId = null;
  setView('auto', matchMedia('(max-width: 800px)').matches);
  $('#shell').setAttribute('data-view', 'thread');
  renderSidebar(); renderList();
  const r = $('#reader');
  r.innerHTML = `<div class="reader-bar"><button class="icon-btn back" data-action="back">${IC.back}</button><h3>Otomatik etiketleme</h3></div>
    <div class="reader-scroll auto"><div id="autoBody"><div class="list-msg">Kurallar yükleniyor…</div></div></div>`;
  try {
    S.filters = await Gmail.filters();
    renderAutoIntro();
  } catch (e) { if (!(e instanceof AuthError)) $('#autoBody').innerHTML = `<div class="list-msg">Yüklenemedi: ${esc(e.message)}</div>`; }
}

function describeFilter(f) {
  const c = f.criteria || {}, a = f.action || {};
  const cond = [c.from && `Gönderen: ${c.from}`, c.to && `Alıcı: ${c.to}`, c.subject && `Konu: ${c.subject}`, c.query && `İçerik: ${c.query}`].filter(Boolean).join(' · ') || 'Koşul';
  const labels = (a.addLabelIds || []).map(id => S.labelById[id]).filter(Boolean);
  const skip = (a.removeLabelIds || []).includes('INBOX');
  return { cond, labels, skip };
}

function renderAutoIntro() {
  const mine = (S.filters || []).filter(f => (f.action?.addLabelIds || []).some(id => S.labelById[id]?.type === 'user'));
  const blocked = (S.filters || []).filter(f => (f.action?.addLabelIds || []).includes('TRASH'));
  const notSkipping = mine.filter(f => !(f.action?.removeLabelIds || []).includes('INBOX')).length;
  $('#autoBody').innerHTML = `
    <div class="card hero">
      <h3>Etiketlerinden öğren</h3>
      <p>Her etiketin altındaki son mailler taranır, göndericiler incelenir ve senin için Gmail filtresi önerilir. Onayladığın kurallar Gmail'in içinde çalışır; uygulama kapalıyken bile yeni mailler otomatik etiketlenir.</p>
      <button class="btn primary" data-action="scan">${IC.wand} Taramayı başlat</button>
    </div>
    <div class="sec-row"><h4 class="sec">Mevcut kurallar (${mine.length})</h4>
      ${notSkipping ? `<button class="btn" data-action="redirect-all">Tümü doğrudan etiketine gitsin (${notSkipping})</button>` : ''}</div>
    ${mine.length ? mine.map(f => {
      const d = describeFilter(f);
      return `<div class="rule">
        <div class="rule-main">${d.labels.map(l => tagChip(l, shortName(l))).join('')}
          <span class="rule-cond">${esc(d.cond)}</span>${d.skip ? '<span class="tag-skip">Doğrudan etiketine gider</span>' : '<span class="tag-muted">Gelen kutusunda da görünür</span>'}</div>
        ${d.skip ? '' : `<button class="btn sm" data-action="redirect-filter" data-id="${f.id}">Etiketine yönlendir</button>`}
        <button class="icon-btn" data-action="del-filter" data-id="${f.id}" title="Kuralı sil">${IC.trash}</button></div>`;
    }).join('') : '<p class="muted">Henüz otomatik kural yok.</p>'}
    <h4 class="sec">Engellenen göndericiler (${blocked.length})</h4>
    ${blocked.length ? blocked.map(f => `<div class="rule">
        <div class="rule-main">${IC.block}<span class="rule-cond">${esc(f.criteria?.from || describeFilter(f).cond)}</span><span class="tag-skip">Doğrudan çöpe gider</span></div>
        <button class="btn" data-action="del-filter" data-id="${f.id}">Engeli kaldır</button></div>`).join('')
      : '<p class="muted">Engellenen gönderici yok. Bir maili açıp üstteki ⊘ düğmesiyle engelleyebilirsin.</p>'}`;
}

async function runScan() {
  const body = $('#autoBody');
  const labels = userLabels();
  const data = {};
  let done = 0;
  const progress = () => {
    body.innerHTML = `<div class="card"><h3>Taranıyor…</h3><p>${done} / ${labels.length} etiket</p>
      <div class="progress"><div style="width:${labels.length ? done / labels.length * 100 : 100}%"></div></div></div>`;
  };
  progress();
  try {
    await pmap(labels, 2, async l => {
      data[l.id] = await Gmail.labelSenders(l.id, SCAN_PER_LABEL);
      done++; progress();
    });
  } catch (e) { if (!(e instanceof AuthError)) body.innerHTML = `<div class="list-msg">Tarama başarısız: ${esc(e.message)}</div>`; return; }
  S.scan = analyze(labels, data);
  renderSuggestions();
}

// Hangi gönderici hangi etikete gidiyor? Çakışmaları ayrıca işaretler.
function analyze(labels, data) {
  const domMap = new Map(), addrMap = new Map();
  const bump = (map, k, lid) => { if (!map.has(k)) map.set(k, new Map()); const m = map.get(k); m.set(lid, (m.get(lid) || 0) + 1); };
  for (const l of labels) for (const e of data[l.id] || []) {
    bump(domMap, baseDomain(e.split('@')[1] || ''), l.id);
    bump(addrMap, e, l.id);
  }
  const covered = (lid, key) => (S.filters || []).some(f => (f.action?.addLabelIds || []).includes(lid) && (f.criteria?.from || '').toLowerCase().includes(key));
  const suggestions = [], conflicts = new Map();
  for (const l of labels) {
    const senders = data[l.id] || [];
    if (!senders.length) continue;
    const doms = new Map();
    senders.forEach(e => { const d = baseDomain(e.split('@')[1] || ''); doms.set(d, (doms.get(d) || 0) + 1); });
    for (const [dom, cnt] of [...doms.entries()].sort((a, b) => b[1] - a[1])) {
      if (!GENERIC_DOMAINS.has(dom) && domMap.get(dom).size === 1) {
        if (!covered(l.id, dom)) suggestions.push({ labelId: l.id, key: dom, count: cnt, total: senders.length });
        continue;
      }
      const addrs = new Map();
      senders.filter(e => baseDomain(e.split('@')[1] || '') === dom).forEach(e => addrs.set(e, (addrs.get(e) || 0) + 1));
      for (const [addr, c] of addrs) {
        if (addrMap.get(addr).size === 1) { if (!covered(l.id, addr)) suggestions.push({ labelId: l.id, key: addr, count: c, total: senders.length }); }
        else {
          if (!conflicts.has(addr)) conflicts.set(addr, new Map(addrMap.get(addr)));
        }
      }
    }
  }
  suggestions.forEach((s, i) => { s.i = i; s.on = s.count >= 2 || s.count / s.total >= 0.3; s.skip = true; });
  return { suggestions, conflicts: [...conflicts.entries()].map(([key, m], i) => ({ i, key, labels: [...m.entries()].map(([labelId, count]) => ({ labelId, count, phrase: '' })) })) };
}

function renderSuggestions() {
  const { suggestions, conflicts } = S.scan;
  const byLabel = new Map();
  suggestions.forEach(s => { if (!byLabel.has(s.labelId)) byLabel.set(s.labelId, []); byLabel.get(s.labelId).push(s); });
  const groups = [...byLabel.entries()].sort((a, b) => S.labelById[a[0]].name.localeCompare(S.labelById[b[0]].name, 'tr'));
  $('#autoBody').innerHTML = `
    <div class="card">
      <h3>${suggestions.length} kural önerisi</h3>
      <p>İşaretli olanlar oluşturulacak. Yeni mailler gelen kutusuna uğramadan <b>doğrudan etiketine gider</b>; okunmamış sayısını sol menüde etiketin yanında görürsün. Gelen kutusunda da görmek istediklerinin <b>"Gelen kutusunda da göster"</b> kutusunu işaretle.</p>
      <label class="check"><input type="checkbox" id="retro" checked> Eski mailleri de etiketle ve gelen kutusundan etiketine taşı</label>
    </div>
    ${groups.map(([lid, list]) => {
      const l = S.labelById[lid];
      return `<div class="sug-group"><div class="sug-label">${dot(l.color)} ${esc(l.name.replace('/', ' › '))}</div>
        ${list.map(s => `<div class="sug">
          <label class="check grow"><input type="checkbox" data-sug="${s.i}" ${s.on ? 'checked' : ''}><span><b>${esc(s.key)}</b><small>${s.count} mail</small></span></label>
          <label class="toggle"><input type="checkbox" data-keep="${s.i}"><span>Gelen kutusunda da göster</span></label>
        </div>`).join('')}</div>`;
    }).join('')}
    ${conflicts.length ? `<h4 class="sec">Ayırt edemediklerim (${conflicts.length})</h4>
      <p class="muted">Bu adresten gelen mailler birden fazla etikette var. Her etiket için o maillerde geçen ayırt edici bir kelime yaz (ör. annenin adı, kart numarasının son 4 hanesi, "Steam Store" için "istek listesi"). Boş bıraktıkların için kural oluşturulmaz.</p>
      ${conflicts.map(c => `<div class="sug-group"><div class="sug-label">${IC.alert} <b>${esc(c.key)}</b></div>
        ${c.labels.map((x, j) => {
          const l = S.labelById[x.labelId];
          return `<label class="field inline">${dot(l.color)}<span>${esc(l.name.replace('/', ' › '))} <small>(${x.count})</small></span>
            <input type="text" placeholder="ayırt edici kelime" data-conf="${c.i}" data-j="${j}"></label>`;
        }).join('')}</div>`).join('')}` : ''}
    <div class="sticky-actions"><button class="btn" data-action="auto">Vazgeç</button><button class="btn primary" data-action="apply-rules">${IC.check} Kuralları oluştur</button></div>`;
}

async function applyRules() {
  const { suggestions, conflicts } = S.scan;
  const retro = $('#retro')?.checked;
  const jobs = [];
  document.querySelectorAll('[data-sug]').forEach(cb => {
    if (!cb.checked) return;
    const s = suggestions[+cb.dataset.sug];
    const skip = !document.querySelector(`[data-keep="${s.i}"]`)?.checked;
    jobs.push({ labelId: s.labelId, criteria: { from: s.key }, skip, q: `from:(${s.key})` });
  });
  document.querySelectorAll('[data-conf]').forEach(inp => {
    const phrase = inp.value.trim();
    if (!phrase) return;
    const c = conflicts[+inp.dataset.conf];
    const x = c.labels[+inp.dataset.j];
    const qp = /\s/.test(phrase) ? `"${phrase.replace(/"/g, '')}"` : phrase;
    jobs.push({ labelId: x.labelId, criteria: { from: c.key, query: qp }, skip: true, q: `from:(${c.key}) ${qp}` });
  });
  if (!jobs.length) { toast('Hiç kural seçilmedi'); return; }
  const body = $('#autoBody');
  let done = 0, failed = 0, tagged = 0;
  const progress = () => body.innerHTML = `<div class="card"><h3>Kurallar oluşturuluyor…</h3><p>${done} / ${jobs.length}</p>
    <div class="progress"><div style="width:${done / jobs.length * 100}%"></div></div></div>`;
  progress();
  for (const j of jobs) {
    try {
      const f = await Gmail.createFilter(j.criteria, { addLabelIds: [j.labelId], ...(j.skip ? { removeLabelIds: ['INBOX'] } : {}) });
      S.filters.push(f);
      if (retro) {
        const ids = await Gmail.messageIdsByQuery(j.q, 1000);
        if (ids.length) { await Gmail.batchModify(ids, [j.labelId], j.skip ? ['INBOX'] : []); tagged += ids.length; }
      }
    } catch (e) {
      if (e instanceof AuthError) return;
      failed++;
    }
    done++; progress();
  }
  toast(`${jobs.length - failed} kural oluşturuldu${retro && tagged ? ` · ${tagged} eski mail etiketine taşındı` : ''}${failed ? ` · ${failed} başarısız` : ''}`);
  refreshCountsSoon();
  loadList();
  renderAutoIntro();
}

// Var olan kuralı "gelen kutusunu atla" olacak şekilde yeniler ve gelen kutusundaki eşleşen mailleri etiketine taşır
function filterQuery(c) {
  const q = [];
  if (c.from) q.push(`from:(${c.from})`);
  if (c.to) q.push(`to:(${c.to})`);
  if (c.subject) q.push(`subject:(${c.subject})`);
  if (c.query) q.push(c.query);
  return q.join(' ');
}
async function redirectFilter(f) {
  const action = { ...f.action, removeLabelIds: [...new Set([...(f.action?.removeLabelIds || []), 'INBOX'])] };
  const nf = await Gmail.createFilter(f.criteria, action);
  await Gmail.deleteFilter(f.id).catch(() => {});
  S.filters = S.filters.filter(x => x.id !== f.id).concat(nf);
  let moved = 0;
  const q = filterQuery(f.criteria || {});
  if (q) {
    const ids = await Gmail.messageIdsByQuery('in:inbox ' + q, 1000);
    if (ids.length) { await Gmail.batchModify(ids, action.addLabelIds || [], ['INBOX']); moved = ids.length; }
  }
  return moved;
}
async function redirectMany(list) {
  const body = $('#autoBody');
  let done = 0, moved = 0, failed = 0;
  const progress = () => body.innerHTML = `<div class="card"><h3>Kurallar güncelleniyor…</h3><p>${done} / ${list.length}</p>
    <div class="progress"><div style="width:${done / list.length * 100}%"></div></div></div>`;
  progress();
  for (const f of list) {
    try { moved += await redirectFilter(f); }
    catch (e) { if (e instanceof AuthError) return; failed++; }
    done++; progress();
  }
  toast(`${list.length - failed} kural güncellendi${moved ? ` · ${moved} mail gelen kutusundan etiketine taşındı` : ''}${failed ? ` · ${failed} başarısız` : ''}`);
  refreshCountsSoon();
  loadList();
  renderAutoIntro();
}

/* ───────────── Bildirim ───────────── */

let toastTimer;
function toast(html, actions = [], ms = 3500) {
  const el = $('#toast');
  el.innerHTML = `<div class="toast-in"><span>${actions.length ? html : esc(html)}</span>${actions.map((a, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-ti="${i}">${esc(a[0])}</button>`).join('')}</div>`;
  el.classList.add('show');
  el.querySelectorAll('[data-ti]').forEach(b => b.onclick = () => { el.classList.remove('show'); actions[+b.dataset.ti][1](); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ───────────── Olaylar ───────────── */

const ACTIONS = {
  login: () => Auth.login(false),
  logout: () => { if (DEMO) location.href = location.pathname; else Auth.logout(); },
  'open-drawer': () => $('#shell').classList.add('drawer'),
  'close-drawer': () => $('#shell').classList.remove('drawer'),
  'open-label': el => {
    $('#shell').classList.remove('drawer');
    S.labelId = el.dataset.id; S.q = ''; $('#search').value = '';
    if (S.view === 'auto') closeReader();
    renderSidebar(); loadList();
  },
  'toggle-more': () => { S.collapsed.__more = S.collapsed.__more === false; store.set('collapsed', S.collapsed); renderSidebar(); },
  'color-label': (el, e) => { e.stopPropagation(); openColorPicker(el.dataset.id, el.closest('.nav-item')); },
  'toggle-node': (el, e) => {
    e.stopPropagation();
    const k = el.dataset.key;
    S.collapsed[k] = !S.collapsed[k];
    store.set('collapsed', S.collapsed);
    renderSidebar();
  },
  refresh: () => { loadList(); refreshCountsSoon(); },
  'clear-search': () => { $('#search').value = ''; if (S.q) { S.q = ''; loadList(); renderSidebar(); } },
  more: () => loadList(true),
  'open-thread': el => openThread(el.dataset.id),
  back: () => { if (history.state?.v) history.back(); else closeReader(); },
  'toggle-msg': el => {
    const id = el.closest('.msg').dataset.mid;
    if (S.openMsgs.has(id)) { if (S.openMsgs.size > 1) S.openMsgs.delete(id); } else S.openMsgs.add(id);
    renderThread();
  },
  archive: async () => {
    const id = S.threadId;
    try { await Gmail.modifyThread(id, [], ['INBOX']); markLocal(id, [], ['INBOX']); if (S.labelId === 'INBOX' && !S.q) removeFromList(id); ACTIONS.back(); toast('Arşivlendi'); }
    catch (e) { if (!(e instanceof AuthError)) toast('Arşivlenemedi: ' + e.message); }
  },
  trash: async () => {
    const id = S.threadId;
    try { await Gmail.trashThread(id); removeFromList(id); ACTIONS.back(); toast('Çöp kutusuna taşındı'); refreshCountsSoon(); }
    catch (e) { if (!(e instanceof AuthError)) toast('Silinemedi: ' + e.message); }
  },
  'mark-unread': async () => {
    const id = S.threadId;
    try { await Gmail.modifyThread(id, ['UNREAD'], []); markLocal(id, ['UNREAD'], []); ACTIONS.back(); }
    catch (e) { if (!(e instanceof AuthError)) toast(e.message); }
  },
  star: async () => {
    const id = S.threadId, on = S.thread.labelIds.includes('STARRED');
    try {
      await Gmail.modifyThread(id, on ? [] : ['STARRED'], on ? ['STARRED'] : []);
      markLocal(id, on ? [] : ['STARRED'], on ? ['STARRED'] : []);
      $('.reader-bar').innerHTML = readerButtons();
    } catch (e) { if (!(e instanceof AuthError)) toast(e.message); }
  },
  labels: () => { if (S.thread) openLabelPicker(); },
  block: () => { if (S.thread) openBlockDialog(); },
  'apply-block': applyBlock,
  'apply-labels': applyLabels,
  'close-modal': closeModal,
  compose: () => { $('#shell').classList.remove('drawer'); openCompose(); },
  reply: el => replyTo(S.thread.messages.find(m => m.id === el.dataset.mid)),
  forward: el => forward(S.thread.messages.find(m => m.id === el.dataset.mid)),
  att: async el => {
    const m = S.thread.messages.find(x => x.id === el.dataset.mid);
    const a = m.attachments[+el.dataset.ai];
    try {
      el.classList.add('busy');
      const data = a.data || await Gmail.attachment(m.id, a.attachmentId);
      const blob = new Blob([b64urlToBytes(data)], { type: a.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: a.filename, target: '_blank' });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { if (!(e instanceof AuthError)) toast('Ek indirilemedi: ' + e.message); }
    el.classList.remove('busy');
  },
  auto: () => { $('#shell').classList.remove('drawer'); openAuto(); },
  scan: runScan,
  'redirect-filter': el => { const f = S.filters.find(x => x.id === el.dataset.id); if (f) redirectMany([f]); },
  'redirect-all': () => redirectMany(S.filters.filter(f => (f.action?.addLabelIds || []).some(id => S.labelById[id]?.type === 'user') && !(f.action?.removeLabelIds || []).includes('INBOX'))),
  'apply-rules': applyRules,
  'del-filter': async el => {
    if (!confirm('Bu kural silinsin mi? Etiketlenmiş mailler etkilenmez.')) return;
    try { await Gmail.deleteFilter(el.dataset.id); S.filters = S.filters.filter(f => f.id !== el.dataset.id); renderAutoIntro(); toast('Kural silindi'); }
    catch (e) { if (!(e instanceof AuthError)) toast(e.message); }
  }
};

/* ───────────── Etiket rengi (uygulamaya özel) ───────────── */

const PALETTE = [
  '#e5484d', '#f76b15', '#ffb224', '#f5d90a', '#99d52a', '#46a758', '#12a594', '#00a2c7',
  '#0090ff', '#3e63dd', '#6e56cf', '#ab4aba', '#d6409f', '#e93d82', '#ad7f58', '#978365',
  '#1c1e21', '#4a4f57', '#7d838c', '#aab0b8', '#d0d4d9', '#f1f3f5'
];

function openColorPicker(labelId, anchor) {
  const l = S.labelById[labelId];
  if (!l) return;
  closeColorPicker();
  const custom = store.get('labelColors', {});
  const cur = (l.color || '').toLowerCase();
  const pop = document.createElement('div');
  pop.className = 'color-pop';
  pop.innerHTML = `
    <div class="cp-head">${dot(l.color)}<b>${esc(shortName(l))}</b></div>
    <div class="cp-grid">${PALETTE.map(c => `<button class="cp-sw ${c === cur ? 'on' : ''}" style="--c:${c}" data-c="${c}" title="${c}"></button>`).join('')}</div>
    <div class="cp-foot">
      <label class="cp-custom" title="İstediğin rengi seç"><input type="color" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#7d838c'}"><span>Özel renk</span></label>
      ${custom[labelId] ? `<button class="cp-reset">Gmail rengine dön</button>` : ''}
    </div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const top = Math.min(r.top - 8, innerHeight - pop.offsetHeight - 12);
  pop.style.top = Math.max(12, top) + 'px';
  pop.style.left = Math.min(r.right + 10, innerWidth - pop.offsetWidth - 12) + 'px';
  const apply = c => {
    const m = store.get('labelColors', {});
    if (c) m[labelId] = c; else delete m[labelId];
    store.set('labelColors', m);
    l.color = c || l.gmailColor;
    renderSidebar(); renderList();
    if (S.thread && S.view === 'thread') renderThread();
  };
  pop.addEventListener('click', e => {
    e.stopPropagation();
    const sw = e.target.closest('.cp-sw');
    if (sw) { apply(sw.dataset.c); closeColorPicker(); }
    if (e.target.closest('.cp-reset')) { apply(null); closeColorPicker(); }
  });
  const inp = pop.querySelector('input[type=color]');
  inp.addEventListener('input', () => { l.color = inp.value; pop.querySelector('.cp-head .ldot').style.setProperty('--c', inp.value); });
  inp.addEventListener('change', () => { apply(inp.value); closeColorPicker(); });
  setTimeout(() => document.addEventListener('mousedown', outsideColor), 0);
}
function outsideColor(e) { if (!e.target.closest('.color-pop')) closeColorPicker(); }
function closeColorPicker() {
  document.querySelectorAll('.color-pop').forEach(p => p.remove());
  document.removeEventListener('mousedown', outsideColor);
}
// Etikete sağ tıklayınca da renk seçici açılsın
document.addEventListener('contextmenu', e => {
  const nav = e.target.closest?.('.sidebar .nav-item[data-action="open-label"]');
  if (!nav || S.labelById[nav.dataset.id]?.type !== 'user') return;
  e.preventDefault();
  openColorPicker(nav.dataset.id, nav);
});

/* ───────────── Sürükle bırak: maili sol menüdeki etikete/klasöre taşı ───────────── */

const DROP_OK = id => id && (S.labelById[id]?.type === 'user' || ['INBOX', 'TRASH', 'SPAM', 'STARRED'].includes(id));
let dragId = null;

document.addEventListener('dragstart', e => {
  const row = e.target.closest?.('.row[data-id]');
  if (!row) return;
  dragId = row.dataset.id;
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  const t = S.threads.find(x => x.id === dragId);
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = t?.subject || '(konu yok)';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 12, 12);
  setTimeout(() => ghost.remove(), 0);
  document.body.classList.add('is-dragging');
});
document.addEventListener('dragend', () => {
  dragId = null;
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.dragging, .drop-over').forEach(el => el.classList.remove('dragging', 'drop-over'));
});
document.addEventListener('dragover', e => {
  if (!dragId) return;
  const nav = e.target.closest?.('.nav-item[data-action="open-label"]');
  document.querySelectorAll('.drop-over').forEach(el => el !== nav && el.classList.remove('drop-over'));
  if (!nav || !DROP_OK(nav.dataset.id) || nav.dataset.id === S.labelId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  nav.classList.add('drop-over');
});
document.addEventListener('drop', async e => {
  const nav = e.target.closest?.('.nav-item[data-action="open-label"]');
  const id = dragId;
  if (!nav || !id) return;
  e.preventDefault();
  nav.classList.remove('drop-over');
  await dropOnto(id, nav.dataset.id);
});

async function dropOnto(threadId, target) {
  const t = S.threads.find(x => x.id === threadId);
  if (!t) return;
  const from = S.labelId;
  const name = SYSTEM.find(s => s[0] === target)?.[1] || shortName(S.labelById[target]);
  try {
    if (target === 'TRASH') {
      await Gmail.trashThread(threadId);
      removeFromList(threadId);
    } else if (target === 'STARRED') {
      await Gmail.modifyThread(threadId, ['STARRED'], []);
      markLocal(threadId, ['STARRED'], []);
      toast('Yıldızlandı'); return;
    } else {
      // Gmail'deki gibi "taşı": yeni etiketi ekle, bulunduğu yerden (gelen kutusu ya da önceki etiket) çıkar
      const remove = [];
      if (from === 'INBOX' || (S.labelById[from]?.type === 'user')) remove.push(from);
      if (target === 'INBOX') remove.push('SPAM', 'TRASH');
      if (target === 'SPAM') remove.push('INBOX');
      const rm = remove.filter(x => x !== target);
      await Gmail.modifyThread(threadId, [target], rm);
      markLocal(threadId, [target], rm);
      if (rm.includes(from) && !S.q) removeFromList(threadId);
    }
    if (S.threadId === threadId && !S.threads.some(x => x.id === threadId)) closeReader();
    renderList(); refreshCountsSoon();
    if (S.labelById[target]?.type === 'user') {
      offerRule({ messages: [{ fromEmail: t.fromEmail }] }, target);
    } else toast(`${name} klasörüne taşındı`);
  } catch (err) { if (!(err instanceof AuthError)) toast('Taşınamadı: ' + err.message); }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').innerHTML) closeModal(); });
$('#modal').addEventListener('click', e => { if (e.target.classList.contains('modal-bg')) closeModal(); });
window.addEventListener('popstate', () => { if (S.view !== 'list') closeReader(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && $('#shell') && !S.loading && S.view === 'list') { loadList(); refreshCountsSoon(); }
});

/* ───────────── Başlat ───────────── */

async function start() {
  showShell();
  try {
    const [p, labels] = await Promise.all([Gmail.profile(), Gmail.labels()]);
    S.email = p.email;
    store.set('email', p.email);
    setLabels(labels);
    renderSidebar();
    await loadList();
  } catch (e) {
    if (!(e instanceof AuthError)) showLogin('Gmail\'e bağlanılamadı: ' + e.message);
  }
}

(function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (DEMO) return start();
  if (!CLIENT_ID) return showSetup();
  const r = Auth.handleRedirect();
  if (r && r !== 'ok') {
    // Sessiz yenileme başarısız oldu ya da kullanıcı izin vermedi
    return showLogin(r === 'access_denied' ? 'Giriş iptal edildi.' : (r === 'state' ? '' : 'Tekrar giriş yapman gerekiyor.'));
  }
  if (Auth.token()) start();
  else if (store.get('email') && Date.now() - store.get('silentAt', 0) > 60000) Auth.login(true);
  else showLogin();
})();
