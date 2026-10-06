/* Takvim — Google Takvim'e bağlanır (birincil takvim).
 * - Ay ve hafta görünümü, etkinlik ekle / düzenle / sil
 * - Maillerdeki tarih ve saatleri bulup "Takvime ekle" önerir
 * - .ics toplantı davetlerini gösterir, katılım yanıtı verir
 * app.js'teki yardımcıları (call, esc, IC, S, toast, store…) kullanır.
 */
'use strict';

const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/';
const TZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Europe/Istanbul';

// Google Takvim'in etkinlik renkleri (colorId → renk)
const EV_COLORS = { 1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e',
  7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000' };
const EV_DEFAULT = '#3d434c';
IC.bell = svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>');
const evColor = ev => EV_COLORS[ev.colorId] || EV_DEFAULT;

const RealCal = {
  async list(min, max) {
    const r = await call(CAL_API + 'events', { query: { timeMin: min.toISOString(), timeMax: max.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: 500 } });
    return r.items || [];
  },
  insert: ev => call(CAL_API + 'events', { method: 'POST', body: ev }),
  patch: (id, ev) => call(CAL_API + 'events/' + encodeURIComponent(id), { method: 'PATCH', body: ev }),
  remove: id => call(CAL_API + 'events/' + encodeURIComponent(id), { method: 'DELETE' }),
  async byUid(uid) { return (await call(CAL_API + 'events', { query: { iCalUID: uid } })).items || []; }
};
const Cal = DEMO ? window.MockCal : RealCal;

/* ───────────── Tarih yardımcıları ───────────── */

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TR_DOW = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const mondayOf = d => addDays(dayStart(d), -((d.getDay() + 6) % 7));
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function evRange(ev) {
  if (ev.start?.date) {
    const s = parseYmd(ev.start.date), e = parseYmd(ev.end?.date || ev.start.date);
    return { s, e: e > s ? e : addDays(s, 1), allDay: true };
  }
  const s = new Date(ev.start?.dateTime), e = new Date(ev.end?.dateTime || ev.start?.dateTime);
  return { s, e: e > s ? e : new Date(s.getTime() + 30 * 60000), allDay: false };
}
const evOnDay = (ev, day) => { const { s, e } = evRange(ev); const d0 = dayStart(day), d1 = addDays(d0, 1); return s < d1 && e > d0; };

/* ───────────── Takvim ekranı ───────────── */

const C = { mode: store.get('calMode', 'month'), cursor: new Date(), events: [], loading: false, error: '' };

function calRange() {
  if (C.mode === 'week') { const s = mondayOf(C.cursor); return [s, addDays(s, 7)]; }
  const first = new Date(C.cursor.getFullYear(), C.cursor.getMonth(), 1);
  const s = mondayOf(first); return [s, addDays(s, 42)];
}

function openCal() {
  if (S.note) flushNote();
  $('#shell').classList.remove('drawer');
  S.threadId = null;
  setView('cal');
  renderSidebar();
  renderCal();
  loadEvents();
}

async function loadEvents() {
  const [a, b] = calRange();
  C.loading = true; C.error = '';
  renderCal();
  try { C.events = await Cal.list(a, b); }
  catch (e) {
    if (e instanceof AuthError) return;
    C.events = [];
    C.error = /not been used|disabled/i.test(e.message) ? 'api'
      : /insufficient|scope|permission/i.test(e.message) ? 'scope' : e.message;
  }
  C.loading = false;
  renderCal();
}

function calTitle() {
  if (C.mode === 'week') {
    const s = mondayOf(C.cursor), e = addDays(s, 6);
    return s.getMonth() === e.getMonth()
      ? `${s.getDate()}–${e.getDate()} ${TR_MONTHS[s.getMonth()]} ${s.getFullYear()}`
      : `${s.getDate()} ${TR_MONTHS[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${TR_MONTHS[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
  }
  return `${TR_MONTHS[C.cursor.getMonth()]} ${C.cursor.getFullYear()}`;
}

function renderCal() {
  const el = $('#calpane');
  if (!el || S.view !== 'cal') return;
  const prevScroll = el.querySelector('.wk-scroll')?.scrollTop;
  el.innerHTML = `
    <header class="cal-head">
      <button class="icon-btn only-mobile" data-action="open-drawer" aria-label="Menü">${IC.menu}</button>
      <h1>${calTitle()}</h1>
      <div class="cal-nav">
        <button class="icon-btn" data-action="cal-prev" title="Önceki">${IC.chevL}</button>
        <button class="btn sm" data-action="cal-today">Bugün</button>
        <button class="icon-btn" data-action="cal-next" title="Sonraki">${IC.chevR}</button>
      </div>
      <div class="seg">
        <button class="${C.mode === 'month' ? 'on' : ''}" data-action="cal-mode" data-m="month">Ay</button>
        <button class="${C.mode === 'week' ? 'on' : ''}" data-action="cal-mode" data-m="week">Hafta</button>
      </div>
      <div class="spacer"></div>
      ${C.loading ? '<span class="cal-loading">Yükleniyor…</span>' : ''}
      <button class="btn primary" data-action="cal-new">${IC.plus} Etkinlik</button>
    </header>
    ${C.error ? calErrorHtml() : (C.mode === 'month' ? monthHtml() : weekHtml())}`;
  const sc = el.querySelector('.wk-scroll');
  if (sc) sc.scrollTop = prevScroll ?? 8 * 48 - 10;
}

function calErrorHtml() {
  if (C.error === 'scope') return `<div class="cal-msg card"><h3>Takvim izni gerekiyor</h3>
    <p>Uygulama şu an sadece Gmail'ine erişebiliyor. Takvimini görmek için Google'a bir kez daha giriş yapıp takvim iznini onaylaman gerekiyor.</p>
    <button class="btn primary" data-action="login">Takvim iznini ver</button></div>`;
  if (C.error === 'api') return `<div class="cal-msg card"><h3>Google Calendar API kapalı</h3>
    <p>Google Cloud'da <b>Mail</b> projesinde arama çubuğuna <b>Google Calendar API</b> yazıp <b>Enable</b>'a bas. Birkaç dakika sonra burayı yenile.</p>
    <button class="btn" data-action="cal-reload">Yeniden dene</button></div>`;
  return `<div class="cal-msg card"><h3>Takvim yüklenemedi</h3><p>${esc(C.error)}</p><button class="btn" data-action="cal-reload">Yeniden dene</button></div>`;
}

function evChip(ev, withTime) {
  const { s, allDay } = evRange(ev);
  const c = evColor(ev);
  return `<div class="ev ${allDay ? 'ev-all' : ''}" style="--c:${c};--ink:${inkFor(c)}" data-action="cal-open" data-id="${esc(ev.id)}" title="${esc(ev.summary || '(başlıksız)')}">
    ${!allDay && withTime ? `<b>${hm(s)}</b> ` : ''}${esc(ev.summary || '(başlıksız)')}</div>`;
}

function monthHtml() {
  const [start] = calRange();
  const today = new Date(), month = C.cursor.getMonth();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const evs = C.events.filter(ev => evOnDay(ev, d))
      .sort((a, b) => (evRange(b).allDay - evRange(a).allDay) || (evRange(a).s - evRange(b).s));
    const shown = evs.slice(0, 3), more = evs.length - shown.length;
    cells += `<div class="mday ${d.getMonth() !== month ? 'other' : ''} ${sameDay(d, today) ? 'today' : ''}" data-action="cal-day" data-d="${ymd(d)}">
      <span class="mnum">${d.getDate()}</span>
      ${shown.map(ev => evChip(ev, true)).join('')}
      ${more > 0 ? `<button class="more-ev" data-action="cal-week-of" data-d="${ymd(d)}">+${more} daha</button>` : ''}
    </div>`;
  }
  return `<div class="month"><div class="mhead">${TR_DOW.map(d => `<span>${d}</span>`).join('')}</div><div class="mgrid">${cells}</div></div>`;
}

const HOUR_PX = 48;
function weekHtml() {
  const start = mondayOf(C.cursor), today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const head = days.map((d, i) => `<div class="wk-dh ${sameDay(d, today) ? 'today' : ''}"><span>${TR_DOW[i]}</span><b>${d.getDate()}</b></div>`).join('');
  const allday = days.map(d => `<div class="wk-ad" data-action="cal-day" data-d="${ymd(d)}">${C.events.filter(ev => evRange(ev).allDay && evOnDay(ev, d)).map(ev => evChip(ev)).join('')}</div>`).join('');
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="wk-hr"><span>${pad(h)}:00</span></div>`).join('');
  const cols = days.map(d => {
    const evs = C.events.filter(ev => !evRange(ev).allDay && evOnDay(ev, d)).map(ev => {
      const r = evRange(ev);
      const s = Math.max(r.s, dayStart(d)), e = Math.min(r.e, addDays(dayStart(d), 1));
      return { ev, top: (s - dayStart(d)) / 60000, end: (e - dayStart(d)) / 60000 };
    }).sort((a, b) => a.top - b.top);
    // çakışan etkinlikleri yan yana diz
    const lanes = [];
    evs.forEach(x => { let i = lanes.findIndex(end => end <= x.top); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = x.end; x.lane = i; });
    const n = Math.max(1, lanes.length);
    const now = sameDay(d, today) ? `<div class="now-line" style="top:${(today - dayStart(d)) / 60000 / 60 * HOUR_PX}px"></div>` : '';
    return `<div class="wk-col" data-action="cal-slot" data-d="${ymd(d)}">${now}${evs.map(x => {
      const c = evColor(x.ev), h = Math.max(20, (x.end - x.top) / 60 * HOUR_PX - 2);
      return `<div class="wk-ev" style="top:${x.top / 60 * HOUR_PX}px;height:${h}px;left:calc(${x.lane / n * 100}% + 2px);width:calc(${100 / n}% - 4px);--c:${c};--ink:${inkFor(c)}" data-action="cal-open" data-id="${esc(x.ev.id)}">
        <b>${esc(x.ev.summary || '(başlıksız)')}</b><span>${hm(evRange(x.ev).s)}${x.ev.location ? ' · ' + esc(x.ev.location) : ''}</span></div>`;
    }).join('')}</div>`;
  }).join('');
  return `<div class="week">
    <div class="wk-head"><div class="wk-gut"></div>${head}</div>
    <div class="wk-allday"><div class="wk-gut"><span>tüm gün</span></div>${allday}</div>
    <div class="wk-scroll"><div class="wk-body" style="height:${24 * HOUR_PX}px"><div class="wk-hours">${hours}</div>${cols}</div></div>
  </div>`;
}

/* ───────────── Etkinlik formu ───────────── */

const REMINDERS = [['default', 'Varsayılan'], ['0', 'Yok'], ['10', '10 dakika önce'], ['30', '30 dakika önce'], ['60', '1 saat önce'], ['1440', '1 gün önce'], ['2880', '2 gün önce']];

function openEventForm(init = {}) {
  const ev = init.ev || null;
  let start, end, allDay;
  if (ev) {
    const r = evRange(ev); allDay = r.allDay; start = r.s; end = allDay ? addDays(r.e, -1) : r.e;
  } else {
    allDay = !!init.allDay;
    start = init.start || (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
    end = init.end || (allDay ? start : new Date(start.getTime() + 60 * 60000));
  }
  const rem = ev ? (ev.reminders?.useDefault === false ? String(ev.reminders.overrides?.[0]?.minutes ?? 0) : 'default') : String(init.reminder ?? 'default');
  const color = ev?.colorId || init.colorId || '';
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <form class="sheet ev-form" id="evForm">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>${ev ? 'Etkinlik' : 'Yeni etkinlik'}</h3>
        <button type="submit" class="btn primary">Kaydet</button>
      </header>
      <div class="ev-body">
        <input class="ev-title" name="title" spellcheck="true" lang="tr" autocorrect="on" autocapitalize="sentences" placeholder="Başlık" value="${esc(ev?.summary ?? init.title ?? '')}" autocomplete="off" required>
        <label class="check"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}> Tüm gün</label>
        <div class="ev-row">${IC.clock}
          <input type="date" name="sd" value="${ymd(start)}" required>
          <input type="time" name="st" value="${hm(start)}" class="tm">
          <span class="ev-dash">–</span>
          <input type="date" name="ed" value="${ymd(end)}" required>
          <input type="time" name="et" value="${hm(end)}" class="tm">
        </div>
        <div class="ev-row">${IC.pin}<input name="loc" placeholder="Konum ekle" value="${esc(ev?.location ?? init.location ?? '')}" autocomplete="off"></div>
        <div class="ev-row">${IC.bell}<select name="rem">${REMINDERS.map(([v, l]) => `<option value="${v}" ${v === rem ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="ev-colors">
          <label title="Varsayılan"><input type="radio" name="color" value="" ${!color ? 'checked' : ''}><i style="--c:${EV_DEFAULT}"></i></label>
          ${Object.entries(EV_COLORS).map(([k, c]) => `<label><input type="radio" name="color" value="${k}" ${String(color) === k ? 'checked' : ''}><i style="--c:${c}"></i></label>`).join('')}
        </div>
        <textarea name="desc" spellcheck="true" lang="tr" autocorrect="on" autocapitalize="sentences" placeholder="Açıklama">${esc(ev?.description ?? init.description ?? '')}</textarea>
        ${ev?.htmlLink ? `<a class="ev-link" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener">Google Takvim'de aç</a>` : ''}
      </div>
      ${ev ? `<div class="ev-foot"><button type="button" class="btn danger-ghost" data-action="cal-delete" data-id="${esc(ev.id)}">${IC.trash} Sil</button></div>` : ''}
    </form>
  </div>`;
  const f = $('#evForm');
  const syncAllDay = () => f.querySelectorAll('.tm').forEach(x => x.hidden = f.allDay.checked);
  f.allDay.addEventListener('change', syncAllDay); syncAllDay();
  // başlangıç değişince bitişi aynı süre kadar kaydır
  let dur = (end - start);
  const readStart = () => new Date(`${f.sd.value}T${f.st.value || '00:00'}`);
  const readEnd = () => new Date(`${f.ed.value}T${f.et.value || '00:00'}`);
  ['sd', 'st'].forEach(n => f[n].addEventListener('change', () => {
    const s = readStart(); if (isNaN(s)) return;
    const e = new Date(s.getTime() + Math.max(0, dur));
    f.ed.value = ymd(e); f.et.value = hm(e);
  }));
  ['ed', 'et'].forEach(n => f[n].addEventListener('change', () => { dur = readEnd() - readStart(); }));
  if (!ev) setTimeout(() => f.title.focus(), 50);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const s = readStart(), en = readEnd();
    if (!f.allDay.checked && en <= s) { toast('Bitiş, başlangıçtan sonra olmalı'); return; }
    if (f.allDay.checked && parseYmd(f.ed.value) < parseYmd(f.sd.value)) { toast('Bitiş, başlangıçtan önce olamaz'); return; }
    const body = {
      summary: f.title.value.trim() || '(başlıksız)',
      location: f.loc.value.trim(),
      description: f.desc.value,
      start: f.allDay.checked ? { date: f.sd.value, dateTime: null } : { dateTime: `${f.sd.value}T${f.st.value}:00`, timeZone: TZ, date: null },
      end: f.allDay.checked ? { date: ymd(addDays(parseYmd(f.ed.value), 1)), dateTime: null } : { dateTime: `${f.ed.value}T${f.et.value}:00`, timeZone: TZ, date: null },
      reminders: f.rem.value === 'default' ? { useDefault: true } : { useDefault: false, overrides: f.rem.value === '0' ? [] : [{ method: 'popup', minutes: +f.rem.value }] },
      colorId: f.color.value || null
    };
    if (!ev) { ['start', 'end'].forEach(k => Object.keys(body[k]).forEach(x => body[k][x] == null && delete body[k][x])); if (!body.colorId) delete body.colorId; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Kaydediliyor…';
    try {
      if (ev) await Cal.patch(ev.id, body); else await Cal.insert(body);
      closeModal();
      toast(ev ? 'Etkinlik güncellendi' : `Takvime eklendi · ${s.getDate()} ${TR_MONTHS[s.getMonth()]}`);
      if (S.view === 'cal') loadEvents();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Kaydet';
      if (err instanceof AuthError) return;
      if (/insufficient|scope|permission/i.test(err.message)) toast('Takvim izni yok. Çıkış yapıp tekrar giriş yap ve takvim iznini onayla.');
      else if (/not been used|disabled/i.test(err.message)) toast('Google Cloud\'da Google Calendar API\'yi açman gerekiyor.');
      else toast('Kaydedilemedi: ' + err.message);
    }
  });
}

/* ───────────── Maillerdeki tarihleri bulma ───────────── */

const MONTHS_RE = 'ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık';
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS_TR = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
const L = 'a-zçğıöşü';   // Türkçe küçük harfler (kelime sınırı için)

// Bir eşleşmenin hemen ardındaki (ya da önündeki) saati bul
function timeNear(text, from, to) {
  const after = text.slice(to, to + 70).split('\n')[0];
  let m = after.match(/(?<![\d.,:])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d,:]|\.\d)/);
  if (m) return { h: +m[1], m: +m[2] };
  m = after.match(/saat\s*([01]?\d|2[0-3])(?![\d:.,])/);
  if (m) return { h: +m[1], m: 0 };
  const before = text.slice(Math.max(0, from - 25), from);
  m = before.match(/saat\s*([01]?\d|2[0-3])[:.]?([0-5]\d)?\s*$/);
  if (m) return { h: +m[1], m: +(m[2] || 0) };
  return null;
}

function kindOf(ctx) {
  if (/son ödeme|ödeme tarihi|son gün/.test(ctx)) return 'Son ödeme';
  if (/randevu/.test(ctx)) return 'Randevu';
  if (/toplantı|meeting/.test(ctx)) return 'Toplantı';
  if (/teslim|kargo/.test(ctx)) return 'Teslimat';
  if (/uçuş|kalkış|check-in/.test(ctx)) return 'Uçuş';
  return '';
}

function findDates(rawText, base) {
  const text = (rawText || '').toLocaleLowerCase('tr').replace(/ /g, ' ');
  base = base ? new Date(base) : new Date();
  const out = [];
  const add = (date, from, to, hasTime) => {
    if (!date || isNaN(date)) return;
    const ctx = text.slice(Math.max(0, from - 45), to + 10);
    out.push({ date, hasTime, from, kind: kindOf(ctx), raw: rawText.slice(from, to).trim() });
  };
  const fixYear = (d, m, y) => {
    if (y) { y = +y; if (y < 100) y += 2000; return new Date(y, m, d); }
    let dt = new Date(base.getFullYear(), m, d);
    if (dt < addDays(dayStart(base), -7)) dt = new Date(base.getFullYear() + 1, m, d);
    return dt;
  };
  const withTime = (d, from, to) => {
    const t = timeNear(text, from, to);
    if (t) { d = new Date(d); d.setHours(t.h, t.m, 0, 0); }
    add(d, from, to, !!t);
  };
  let m;
  // 15 Ekim 2026 / 15 Ekim'de / 1 Kasım
  const r1 = new RegExp(`(?<![\\d${L}])(\\d{1,2})\\s+(${MONTHS_RE})(?:['’]?[${L}]*)?(?:\\s+(\\d{4}))?`, 'g');
  while ((m = r1.exec(text))) {
    const d = +m[1], mo = MONTHS_RE.split('|').indexOf(m[2]);
    if (d >= 1 && d <= 31) withTime(fixYear(d, mo, m[3]), m.index, m.index + m[0].length);
  }
  // 15.10.2026 / 15/10/26 / 15-10-2026
  const r2 = /(?<![\d.,/])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d.,/])/g;
  while ((m = r2.exec(text))) {
    const d = +m[1], mo = +m[2] - 1;
    if (d >= 1 && d <= 31 && mo >= 0 && mo < 12) withTime(fixYear(d, mo, m[3]), m.index, m.index + m[0].length);
  }
  // 2026-10-15
  const r3 = /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g;
  while ((m = r3.exec(text))) withTime(new Date(+m[1], +m[2] - 1, +m[3]), m.index, m.index + m[0].length);
  // October 15, 2026
  const r4 = new RegExp(`(?<![a-z])(${MONTHS_EN.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?`, 'g');
  while ((m = r4.exec(text))) withTime(fixYear(+m[2], MONTHS_EN.indexOf(m[1]), m[3]), m.index, m.index + m[0].length);
  // bugün / yarın / öbür gün
  const r5 = new RegExp(`(?<![${L}])(bugün|yarın|öbür gün|yarından sonra)(?![${L}])`, 'g');
  while ((m = r5.exec(text))) {
    const n = m[1] === 'bugün' ? 0 : m[1] === 'yarın' ? 1 : 2;
    withTime(addDays(dayStart(base), n), m.index, m.index + m[0].length);
  }
  // (bu / gelecek / haftaya) Cumartesi
  const r6 = new RegExp(`(?<![${L}])(?:(bu|gelecek|önümüzdeki|haftaya)\\s+)?(pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|pazar)(?:['’]?[${L}]*)?(?:\\s+günü)?`, 'g');
  while ((m = r6.exec(text))) {
    // "pazar" kelimesi tek başına (pazar yeri gibi) ve saat yoksa çok belirsiz: atla
    const target = DAYS_TR.indexOf(m[2]);
    const t = timeNear(text, m.index, m.index + m[0].length);
    if (m[2] === 'pazar' && !t && !m[1]) continue;
    let d;
    if (m[1] && m[1] !== 'bu') {
      // "gelecek Salı" = gelecek haftanın Salı'sı
      d = addDays(addDays(mondayOf(base), 7), (target + 6) % 7);
    } else {
      let diff = (target - base.getDay() + 7) % 7;
      if (diff === 0 && m[1] !== 'bu') diff = 7;
      d = addDays(dayStart(base), diff);
    }
    if (t) d.setHours(t.h, t.m, 0, 0);
    add(d, m.index, m.index + m[0].length, !!t);
  }
  // Tekrarları ve geçmiş tarihleri ayıkla, aynı güne ait saatli olanı tercih et
  const today = dayStart(new Date());
  const seen = new Map();
  out.sort((a, b) => a.from - b.from).forEach(x => {
    if (x.date < today || x.date > addDays(today, 730)) return;
    const k = ymd(x.date);
    const prev = seen.get(k);
    if (!prev || (!prev.hasTime && x.hasTime) || (!prev.kind && x.kind)) seen.set(k, { ...x, kind: x.kind || prev?.kind || '' });
  });
  return [...seen.values()].sort((a, b) => a.date - b.date).slice(0, 4);
}

function fmtWhen(d, hasTime) {
  const dow = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][d.getDay()];
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${dow}${hasTime ? ' · ' + hm(d) : ''}`;
}

/* ───────────── .ics toplantı davetleri ───────────── */

function parseIcs(ics) {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const ev = {}; let inEv = false;
  for (const ln of lines) {
    if (ln === 'BEGIN:VEVENT') { inEv = true; continue; }
    if (ln === 'END:VEVENT') break;
    if (!inEv) { if (/^METHOD:/.test(ln)) ev.method = ln.slice(7).trim(); continue; }
    const i = ln.indexOf(':'); if (i < 0) continue;
    const [name, ...params] = ln.slice(0, i).split(';');
    const val = ln.slice(i + 1).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    if (['SUMMARY', 'LOCATION', 'UID', 'DESCRIPTION'].includes(name)) ev[name.toLowerCase()] = val;
    if (name === 'DTSTART' || name === 'DTEND') {
      const allDay = params.includes('VALUE=DATE') || /^\d{8}$/.test(val);
      const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
      if (!m) continue;
      const d = m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
        : new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
      ev[name === 'DTSTART' ? 'start' : 'end'] = d; ev.allDay = allDay;
    }
    if (name === 'ORGANIZER') ev.organizer = (params.find(p => p.startsWith('CN=')) || '').slice(3).replace(/"/g, '') || val.replace(/^mailto:/i, '');
  }
  return ev.start ? ev : null;
}

/* ───────────── Mailin üstündeki takvim şeridi ───────────── */

async function renderMailCalExtras() {
  const box = $('#calExtras');
  const t = S.thread;
  if (!box || !t) return;
  const m = t.messages[t.messages.length - 1];
  let html = '';
  // 1) Toplantı daveti
  let ics = m.ics;
  if (!ics && m.icsAtt) { try { ics = decodeText(await Gmail.attachment(m.id, m.icsAtt)); } catch {} }
  const inv = ics && parseIcs(ics);
  if (inv && inv.method !== 'CANCEL') {
    html += `<div class="invite" id="invite">
      <div class="inv-date"><b>${inv.start.getDate()}</b><span>${TR_MONTHS[inv.start.getMonth()].slice(0, 3)}</span></div>
      <div class="inv-main"><div class="inv-title">${esc(inv.summary || 'Toplantı daveti')}</div>
        <div class="inv-meta">${fmtWhen(inv.start, !inv.allDay)}${inv.end && !inv.allDay ? '–' + hm(inv.end) : ''}${inv.location ? ' · ' + esc(inv.location) : ''}${inv.organizer ? ' · ' + esc(inv.organizer) : ''}</div></div>
      <div class="inv-actions" id="invActions"><span class="muted">…</span></div>
    </div>`;
  }
  // 2) Metindeki tarihler
  if (!inv) {
    const text = (m.subject || '') + '\n' + (m.text || (m.html ? htmlToText(m.html) : m.snippet));
    const found = findDates(text, m.date);
    if (found.length) {
      S.foundDates = found;
      html += `<div class="date-strip">${IC.cal}<span class="ds-label">Bu mailde tarih var</span>
        ${found.map((x, i) => `<button class="ds-chip" data-action="cal-from-mail" data-i="${i}" title="${esc(x.raw)}">
          ${x.kind ? `<i>${x.kind}</i>` : ''}${fmtWhen(x.date, x.hasTime)}<span>${IC.plus}</span></button>`).join('')}
      </div>`;
    }
  }
  if (S.thread !== t) return;
  box.innerHTML = html;
  if (inv) inviteActions(inv);
}

async function inviteActions(inv) {
  const el = $('#invActions'); if (!el) return;
  let ev = null;
  try { if (inv.uid) ev = (await Cal.byUid(inv.uid))[0] || null; } catch {}
  S.inviteIcs = inv; S.inviteEv = ev;
  const me = ev?.attendees?.find(a => a.self);
  const st = me?.responseStatus;
  if (ev && me) {
    el.innerHTML = [['accepted', 'Katılıyorum'], ['tentative', 'Belki'], ['declined', 'Katılmıyorum']]
      .map(([v, l]) => `<button class="btn sm ${st === v ? 'primary' : ''}" data-action="cal-rsvp" data-v="${v}">${l}</button>`).join('');
  } else if (ev) {
    el.innerHTML = `<span class="inv-ok">${IC.check} Takviminde</span>`;
  } else {
    el.innerHTML = `<button class="btn sm primary" data-action="cal-add-invite">${IC.plus} Takvime ekle</button>`;
  }
}

function eventFromMail(x) {
  const t = S.thread, m = t.messages[t.messages.length - 1];
  const subj = (m.subject || '').replace(/^(re|fwd?|ynt|ilt)\s*:\s*/i, '');
  const title = x.kind && !subj.toLocaleLowerCase('tr').includes(x.kind.toLocaleLowerCase('tr')) ? `${x.kind}: ${subj}` : subj;
  openEventForm({
    title, start: x.date, allDay: !x.hasTime,
    end: x.hasTime ? new Date(x.date.getTime() + 60 * 60000) : x.date,
    reminder: x.hasTime ? 30 : 1440,
    description: `${m.from} <${m.fromEmail}> tarafından gönderilen mailden eklendi:\n${m.subject}\nhttps://mail.google.com/mail/u/0/#all/${t.id}`
  });
}

/* ───────────── Olaylar ───────────── */

Object.assign(ACTIONS, {
  'open-cal': () => openCal(),
  'cal-prev': () => { C.cursor = C.mode === 'week' ? addDays(C.cursor, -7) : new Date(C.cursor.getFullYear(), C.cursor.getMonth() - 1, 1); loadEvents(); },
  'cal-next': () => { C.cursor = C.mode === 'week' ? addDays(C.cursor, 7) : new Date(C.cursor.getFullYear(), C.cursor.getMonth() + 1, 1); loadEvents(); },
  'cal-today': () => { C.cursor = new Date(); loadEvents(); },
  'cal-mode': el => { C.mode = el.dataset.m; store.set('calMode', C.mode); loadEvents(); },
  'cal-reload': () => loadEvents(),
  'cal-new': () => openEventForm(),
  'cal-day': (el, e) => {
    if (e.target.closest('.ev, .more-ev')) return;
    const d = parseYmd(el.dataset.d); d.setHours(9);
    openEventForm({ start: d, allDay: C.mode === 'week' });
  },
  'cal-slot': (el, e) => {
    if (e.target.closest('.wk-ev')) return;
    const r = el.getBoundingClientRect();
    const mins = Math.floor((e.clientY - r.top) / HOUR_PX * 2) * 30;
    const d = parseYmd(el.dataset.d); d.setMinutes(mins);
    openEventForm({ start: d });
  },
  'cal-week-of': (el, e) => { e.stopPropagation(); C.mode = 'week'; store.set('calMode', 'week'); C.cursor = parseYmd(el.dataset.d); loadEvents(); },
  'cal-open': (el, e) => { e.stopPropagation(); const ev = C.events.find(x => x.id === el.dataset.id); if (ev) openEventForm({ ev }); },
  'cal-delete': async el => {
    if (!confirm('Bu etkinlik silinsin mi?')) return;
    try { await Cal.remove(el.dataset.id); closeModal(); toast('Etkinlik silindi'); loadEvents(); }
    catch (e) { if (!(e instanceof AuthError)) toast('Silinemedi: ' + e.message); }
  },
  'cal-from-mail': el => { const x = S.foundDates?.[+el.dataset.i]; if (x) eventFromMail(x); },
  'cal-add-invite': () => {
    const inv = S.inviteIcs; if (!inv) return;
    const t = S.thread;
    openEventForm({ title: inv.summary || 'Toplantı', start: inv.start, end: inv.allDay && inv.end ? addDays(inv.end, -1) : inv.end, allDay: inv.allDay,
      location: inv.location || '', reminder: 30, description: (inv.description || '') + `\n\nhttps://mail.google.com/mail/u/0/#all/${t.id}` });
  },
  'cal-rsvp': async el => {
    const ev = S.inviteEv; if (!ev) return;
    const attendees = ev.attendees.map(a => a.self ? { ...a, responseStatus: el.dataset.v } : a);
    try {
      await Cal.patch(ev.id, { attendees });
      ev.attendees = attendees;
      inviteActions(S.inviteIcs);
      toast({ accepted: 'Katılacağını bildirdin', tentative: 'Belki olarak işaretlendi', declined: 'Katılmayacağını bildirdin' }[el.dataset.v]);
    } catch (e) { if (!(e instanceof AuthError)) toast('Yanıt gönderilemedi: ' + e.message); }
  }
});
