// Mail — Windows programı. GitHub Pages'teki uygulamayı kendi penceresinde açar;
// güncellemeler siteye yüklendikçe kendiliğinden gelir.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://snnerdogan98.github.io/mail/';
const APP_ORIGIN = new URL(APP_URL).origin;
// Google girişi sırasında geçilen adresler (aynı pencerede kalmalı)
const GOOGLE_LOGIN = /^https:\/\/([a-z0-9-]+\.)*(google\.com|google\.com\.tr|youtube\.com|gstatic\.com|googleusercontent\.com)\//i;

app.setAppUserModelId('com.snnerdogan98.mail'); // görev çubuğunda kendi simgesi
// Google, gömülü tarayıcılarda girişi engelliyor; standart Chrome kimliğiyle açılır.
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/\S+/, '').replace(/\s?mail\/\S+/i, '');

// Program zaten açıksa ikinci pencere açma, mevcut olanı öne getir
if (!app.requestSingleInstanceLock()) { app.quit(); }

const stateFile = () => path.join(app.getPath('userData'), 'pencere.json');
const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } };
const saveState = win => {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, max: win.isMaximized() }));
  } catch {}
};

let win;
function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1320, height: st.height || 860, x: st.x, y: st.y,
    minWidth: 380, minHeight: 500,
    title: 'Mail', icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#e8eaed', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true }
  });
  win.webContents.session.setSpellCheckerLanguages(['tr', 'en-US']);
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveState(win));

  // Yeni pencere isteyen bağlantılar (mail içindeki linkler vb.) varsayılan tarayıcıda açılır
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Aynı pencerede sadece uygulama ve Google girişi açılır; diğer her şey tarayıcıya
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(APP_ORIGIN) || GOOGLE_LOGIN.test(url)) return;
    e.preventDefault();
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
  });

  // Sağ tık: yazım önerileri ve kopyala/yapıştır
  win.webContents.on('context-menu', (_e, p) => {
    const items = [];
    for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    if (p.misspelledWord) {
      if (!items.length) items.push({ label: 'Öneri yok', enabled: false });
      items.push({ label: 'Sözlüğe ekle', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' });
    }
    if (p.isEditable) items.push({ label: 'Kes', role: 'cut' }, { label: 'Kopyala', role: 'copy' }, { label: 'Yapıştır', role: 'paste' }, { type: 'separator' }, { label: 'Tümünü seç', role: 'selectAll' });
    else if (p.selectionText) items.push({ label: 'Kopyala', role: 'copy' });
    if (p.linkURL && /^https?:/.test(p.linkURL)) items.push({ label: 'Bağlantıyı tarayıcıda aç', click: () => shell.openExternal(p.linkURL) });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });

  win.loadURL(APP_URL);
  // İnternet yoksa birkaç saniyede bir yeniden dene
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'));
    setTimeout(() => win && !win.isDestroyed() && win.loadURL(APP_URL), 5000);
  });
}

// Kısayollar: F5 / Ctrl+R yenile, Ctrl+Shift+R önbelleksiz yenile, F11 tam ekran, Ctrl+ +/- yakınlaştır
Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Mail', submenu: [
  { label: 'Yenile', accelerator: 'F5', click: () => win?.webContents.reload() },
  { label: 'Yenile', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.reload(), visible: false },
  { label: 'Önbelleksiz yenile', accelerator: 'CmdOrCtrl+Shift+R', click: () => win?.webContents.reloadIgnoringCache() },
  { role: 'togglefullscreen', label: 'Tam ekran' },
  { role: 'zoomIn', label: 'Yakınlaştır' }, { role: 'zoomIn', accelerator: 'CmdOrCtrl+=', visible: false },
  { role: 'zoomOut', label: 'Uzaklaştır' }, { role: 'resetZoom', label: 'Gerçek boyut' },
  { role: 'toggleDevTools', label: 'Geliştirici araçları', accelerator: 'CmdOrCtrl+Shift+I' },
  { type: 'separator' }, { role: 'quit', label: 'Çıkış' }
] }]));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
