/* ───────────── Ertele ─────────────
   Gmail'in kendi erteleme özelliği API'de yok; aynısını etiketlerle yapıyoruz:
   • Ertelenen konu gelen kutusundan çıkar, "Ertelendi" ve "Ertelendi/2026-10-08 08.00 (+03)" etiketlerini alır.
   • Zamanı gelince (Google zamanlayıcısı ya da açık olan uygulama) gelen kutusuna döner, okunmadı olur,
     "Ertelendi/Geri döndü" etiketiyle listenin en üstünde gösterilir; açınca bu etiket kalkar.
   Bilgi Gmail'de durduğu için bütün cihazlarda aynı görünür. */
'use strict';

const SN_ROOT = 'Ertelendi', SN_BACK = 'Ertelendi/Geri döndü';
const SN_RE = /^Ertelendi\/(\d{4})-(\d\d)-(\d\d) (\d\d)\.(\d\d)(?: \(([+-]\d\d)\))?$/;
const isSnLabel = l => l && (l.name === SN_ROOT || l.name.startsWith(SN_ROOT + '/'));

Object.assign(RealGmail, { deleteLabel: id => call('labels/' + id, { method: 'DELETE' }) });

const pad2 = n => String(n).padStart(2, '0');
function snName(t) {
  const d = new Date(t), off = -d.getTimezoneOffset() / 60;
  const o = (off >= 0 ? '+' : '-') + pad2(Math.abs(Math.trunc(off)));
  return `${SN_ROOT}/${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}.${pad2(d.getMinutes())} (${o})`;
}
function snTime(name) {
  const m = SN_RE.exec(name || '');
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - (m[6] ? +m[6] : 3) * 3600e3;
}
const snByName = n => S.labels.find(l => l.name === n);
const snTimeLabels = () => S.labels.filter(l => l.type === 'user' && snTime(l.name) != null);
const snWhenOf = t => { for (const id of t.labelIds || []) { const v = snTime(S.labelById[id]?.name); if (v) return v; } return null; };

async function snEnsure(name) {
  const have = snByName(name);
  if (have) return have;
  let l;
  try { l = await Gmail.createLabel(name); }
  catch (e) { await snReloadLabels(); l = snByName(name); if (!l) throw e; return l; }
  const lab = { id: l.id, name, type: 'user', color: null, unread: 0, total: 0 };
  setLabels(S.labels.concat(lab));
  return S.labelById[lab.id];
}
async function snReloadLabels() {
  try { setLabels(await Gmail.labels()); renderSidebar(); } catch {}
}

/* Erteleme seçenekleri */
const snAt = (days, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.getTime(); };
function snPresets() {
  const now = new Date(), h = now.getHours(), out = [];
  if (h < 17) { const d = new Date(); d.setHours(h + 3, 0, 0, 0); out.push(['Bugün daha sonra', d.getTime()]); }
  if (h < 18) out.push(['Bu akşam', snAt(0, 20)]);
  out.push(['Yarın sabah', snAt(1, 8)]);
  const day = now.getDay();                              // 0 pazar, 6 cumartesi
  if (day >= 1 && day <= 4) out.push(['Hafta sonu', snAt(6 - day, 9)]);
  out.push(['Gelecek hafta', snAt(((8 - day) % 7) || 7, 8)]);
  return out;
}

function openSnoozeMenu(btn) {
  document.querySelector('.sn-pop')?.remove();
  const t = S.thread;
  if (!t) return;
  const when = snWhenOf(t);
  const pop = document.createElement('div');
  pop.className = 'sched-pop sn-pop';
  pop.innerHTML = `
    <div class="sp-title">${when ? 'Ertelendi: ' + esc(schedWhen(when)) : 'Ertele'}</div>
    ${snPresets().map(([n, v]) => `<button type="button" class="sp-item" data-t="${v}"><span>${n}</span><span class="sp-when">${schedWhen(v)}</span></button>`).join('')}
    <div class="sp-custom">
      <input type="datetime-local" value="${toLocalInput(snAt(1, 9))}" min="${toLocalInput(Date.now())}">
      <button type="button" class="btn primary sp-go">Ertele</button>
    </div>
    ${when ? '<button type="button" class="sp-item sn-now"><span>Şimdi gelen kutusuna geri getir</span></button>' : ''}
    ${store.get('schedScript') && store.get('schedScriptVer', 1) >= 2 ? '' : '<div class="sp-note">Program kapalıyken de zamanında dönmesi için Google zamanlayıcısının yeni sürümü gerekli. <a href="#" data-action="sched-setup">Güncelle</a></div>'}`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = Math.min(r.bottom + 8, innerHeight - pop.offsetHeight - 12) + 'px';
  pop.style.left = Math.max(12, Math.min(r.left - 20, innerWidth - pop.offsetWidth - 12)) + 'px';
  pop.style.right = 'auto';
  const close = e => { if (!pop.contains(e.target) && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
  setTimeout(() => document.addEventListener('mousedown', close, true));
  pop.addEventListener('click', e => {
    const it = e.target.closest('.sp-item');
    if (it?.classList.contains('sn-now')) { pop.remove(); return snUnsnooze(t.id, true); }
    if (it) { pop.remove(); return snSnooze(t.id, +it.dataset.t); }
    if (e.target.closest('.sp-go')) {
      const v = new Date(pop.querySelector('input').value).getTime();
      if (!v || v < Date.now() + 60e3) return toast('İleri bir tarih ve saat seç');
      pop.remove(); snSnooze(t.id, v);
    }
  });
}

async function snSnooze(id, when) {
  try {
    const t = S.threads.find(x => x.id === id) || S.thread;
    const old = (t?.labelIds || []).filter(x => isSnLabel(S.labelById[x]));
    const [lab, root] = [await snEnsure(snName(when)), await snEnsure(SN_ROOT)];
    await Gmail.modifyThread(id, [lab.id, root.id], ['INBOX', ...old.filter(x => x !== lab.id && x !== root.id)]);
    markLocal(id, [lab.id, root.id], ['INBOX', ...old]);
    if (S.labelId === 'INBOX' && !S.q) { removeFromList(id); renderList(); }
    if (S.threadId === id) ACTIONS.back();
    toast(`Ertelendi: ${schedWhen(when)}`, [['Geri al', () => snUnsnooze(id, false)]], 6000);
    snCleanup(); refreshCountsSoon();
  } catch (e) { if (!(e instanceof AuthError)) toast('Ertelenemedi: ' + e.message); }
}

// Ertelemeyi kaldır, konuyu gelen kutusuna döndür
async function snUnsnooze(id, msg) {
  try {
    const t = S.threads.find(x => x.id === id) || (S.thread?.id === id ? S.thread : null);
    const rm = (t?.labelIds || []).filter(x => isSnLabel(S.labelById[x]));
    const root = snByName(SN_ROOT);
    if (root && !rm.includes(root.id)) rm.push(root.id);
    await Gmail.modifyThread(id, ['INBOX'], rm);
    markLocal(id, ['INBOX'], rm);
    if (S.labelById[S.labelId]?.name === SN_ROOT) removeFromList(id);
    if (msg) toast('Gelen kutusuna geri getirildi');
    if (S.threadId === id && S.thread) renderThread();
    renderList(); snCleanup(); refreshCountsSoon();
  } catch (e) { if (!(e instanceof AuthError)) toast('Geri getirilemedi: ' + e.message); }
}

// Boş kalan zaman etiketlerini sil
async function snCleanup() {
  await snReloadLabels();
  for (const l of snTimeLabels()) {
    if (!l.total && snTime(l.name) > Date.now() - 864e5 * 365) { try { await Gmail.deleteLabel(l.id); } catch {} }
  }
  await snReloadLabels();
}

/* Zamanı gelenleri gelen kutusuna döndür (yedek: uygulama açıksa) */
let snBusy = false;
async function snWake() {
  if (snBusy || !S.labels.length) return;
  const due = snTimeLabels().filter(l => snTime(l.name) <= Date.now());
  if (!due.length) return;
  snBusy = true;
  try {
    const back = await snEnsure(SN_BACK), root = snByName(SN_ROOT);
    let n = 0;
    for (const l of due) {
      const r = await Gmail.listThreads({ labelId: l.id });
      for (const t of r.threads) {
        await Gmail.modifyThread(t.id, ['INBOX', 'UNREAD', back.id], [l.id, ...(root ? [root.id] : [])]);
        n++;
      }
      try { await Gmail.deleteLabel(l.id); } catch {}
    }
    await snReloadLabels();
    if (n) {
      toast(n === 1 ? 'Ertelenen bir mail geri döndü' : `Ertelenen ${n} mail geri döndü`);
      if (S.labelId === 'INBOX' && !S.q && S.view === 'list') loadList();
    }
  } catch {}
  snBusy = false;
}
let snTimer = null;
function snStart() {
  clearInterval(snTimer);
  snWake();
  snTimer = setInterval(snWake, 60e3);
}

/* Gelen kutusunda geri dönenleri en üste al */
async function snPinBack() {
  const back = snByName(SN_BACK);
  if (!back || S.labelId !== 'INBOX' || S.q || !back.total) return;
  try {
    const r = await Gmail.listThreads({ labelId: back.id });
    const ids = new Set(r.threads.map(t => t.id));
    S.threads = r.threads.filter(t => t.labelIds.includes('INBOX')).concat(S.threads.filter(t => !ids.has(t.id)));
    renderList();
  } catch {}
}
// Açılınca "Geri döndü" işaretini kaldır
async function snSeen(id) {
  const back = snByName(SN_BACK);
  const t = S.thread;
  if (!back || !t || t.id !== id || !t.labelIds.includes(back.id)) return;
  try { await Gmail.modifyThread(id, [], [back.id]); markLocal(id, [], [back.id]); } catch {}
}
// Ertelenenler görünümünde en yakın zaman en üstte
function snSortList() {
  if (S.labelById[S.labelId]?.name !== SN_ROOT) return;
  S.threads.sort((a, b) => (snWhenOf(a) || 0) - (snWhenOf(b) || 0));
}

// Liste ve okuma ekranında etiket rozetleri yerine zaman rozeti
function snChip(t) {
  const back = snByName(SN_BACK);
  if (back && t.labelIds?.includes(back.id)) return `<span class="sn-chip back">${IC.alarm}Ertelemeden döndü</span>`;
  const w = snWhenOf(t);
  return w ? `<span class="sn-chip">${IC.alarm}${esc(schedWhen(w))}</span>` : '';
}

Object.assign(ACTIONS, {
  snooze: el => openSnoozeMenu(el)
});
