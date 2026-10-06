// Google girişi (masaüstü): giriş sistemin tarayıcısında yapılır, program "yenileme anahtarı"nı
// Windows'un şifreli deposunda saklar. Böylece her saat yeniden giriş gerekmez.
const { shell, safeStorage, app } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'auth-config.json'), 'utf8')); } catch {}

const tokenFile = () => path.join(app.getPath('userData'), 'oturum.bin');
let access = null; // { token, exp, scope }

function saveRefresh(rt) {
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(rt) : Buffer.from('plain:' + rt);
  fs.writeFileSync(tokenFile(), data);
}
function loadRefresh() {
  try {
    const b = fs.readFileSync(tokenFile());
    if (b.slice(0, 6).toString() === 'plain:') return b.slice(6).toString();
    return safeStorage.decryptString(b);
  } catch { return null; }
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CFG.clientId, client_secret: CFG.clientSecret, ...params })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error_description || j.error || ('HTTP ' + res.status)); e.code = j.error; throw e; }
  return j;
}
const keep = j => (access = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, scope: j.scope || '' });

// Kayıtlı oturumdan yeni erişim anahtarı al (gerekirse)
async function getToken() {
  if (access && access.exp > Date.now() + 120000) return access;
  const rt = loadRefresh();
  if (!rt || !CFG.clientId) return null;
  try { return keep(await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt })); }
  catch (e) { if (e.code === 'invalid_grant') { try { fs.unlinkSync(tokenFile()); } catch {} } return null; }
}

const page = (title, text) => `<!doctype html><meta charset="utf-8"><title>Mail</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#e6e8ec,#b3b9c2);font:16px 'Segoe UI',system-ui,sans-serif;color:#2b3036">
<div style="text-align:center;background:rgba(255,255,255,.6);padding:36px 48px;border-radius:20px;box-shadow:0 10px 40px rgba(30,40,60,.15)">
<div style="font-size:42px">✉</div><h2 style="margin:8px 0">${title}</h2><p>${text}</p></div></body>`;

let pending = null;
// Tarayıcıda Google girişi → yerel adrese dönüş → anahtarlar
function login(scopes, hint, onDone) {
  if (!CFG.clientId) return Promise.reject(new Error('Programda Google masaüstü kimliği yok (auth-config.json).'));
  if (pending) { shell.openExternal(pending.url); return pending.promise; }
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(12).toString('hex');
  let server;
  const promise = new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404).end(); return; }
      const code = u.searchParams.get('code'), err = u.searchParams.get('error');
      if (u.searchParams.get('state') !== state || (!code && !err)) { res.writeHead(400).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (err) { res.end(page('Giriş iptal edildi', 'Bu sekmeyi kapatıp Mail programından tekrar deneyebilirsin.')); finish(); return reject(new Error(err)); }
      try {
        const j = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect });
        if (j.refresh_token) saveRefresh(j.refresh_token);
        keep(j);
        res.end(page('Giriş tamam', 'Mail programına dönebilirsin. Bu sekmeyi kapatabilirsin.'));
        finish(); resolve(access); onDone && onDone();
      } catch (e) { res.end(page('Giriş tamamlanamadı', String(e.message))); finish(); reject(e); }
    });
    server.on('error', reject);
  });
  let redirect;
  const finish = () => { setTimeout(() => server.close(), 1000); pending = null; };
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      redirect = `http://127.0.0.1:${server.address().port}`;
      const p = new URLSearchParams({
        client_id: CFG.clientId, redirect_uri: redirect, response_type: 'code', scope: scopes,
        code_challenge: challenge, code_challenge_method: 'S256', state,
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true'
      });
      if (hint) p.set('login_hint', hint);
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
      pending = { url, promise };
      shell.openExternal(url);
      // 10 dakikada tamamlanmazsa vazgeç
      setTimeout(() => { if (pending && pending.promise === promise) { finish(); reject(new Error('zaman aşımı')); } }, 600000);
      promise.then(resolve, reject);
    });
  });
}

async function logout() {
  const rt = loadRefresh();
  access = null;
  try { fs.unlinkSync(tokenFile()); } catch {}
  if (rt) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' }).catch(() => {});
}

module.exports = { getToken, login, logout, configured: () => !!CFG.clientId };
