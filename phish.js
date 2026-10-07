/* ───────────── Sahte mail (oltalama) uyarısı ─────────────
   Üç tür işarete bakılır:
   1) Kimlik doğrulama: Gmail'in kendi kontrolü (Authentication-Results: SPF / DKIM / DMARC). DMARC başarısızsa
      gönderen adres büyük ihtimalle taklit edilmiştir.
   2) Marka taklidi: Gönderen adı (ya da adres) bir banka / kurum / mağaza gibi görünüyor ama adres o kuruma ait değil.
   3) Aldatıcı linkler: Link yazısı "www.garantibbva.com.tr" ama tıklayınca başka bir yere gidiyor; IP adresine
      giden ya da harf taklidi (xn--) içeren adresler.
   Kullanıcı bir göndereni "güvenli" işaretleyebilir; otomatik etiketleme kurallarındaki göndericiler de güvenli sayılır. */
'use strict';

// Marka → resmi alan adları (alt alan adları da geçerli: email.apple.com → apple.com)
const BRANDS = [
  ['Garanti BBVA', /garanti/, ['garantibbva.com.tr', 'garanti.com.tr', 'garantibbva.com', 'bonus.com.tr', 'garantibbvaemeklilik.com.tr']],
  ['Ziraat Bankası', /ziraat/, ['ziraatbank.com.tr', 'ziraat.com.tr', 'ziraatkatilim.com.tr', 'bankkart.com.tr']],
  ['Yapı Kredi', /yap[ıi] ?kredi|yapikredi|worldcard/, ['yapikredi.com.tr', 'ykb.com.tr', 'worldcard.com.tr', 'yapikredi.com']],
  ['İş Bankası', /i[şs] ?bankas[ıi]|isbank|maximum ?kart/, ['isbank.com.tr', 'isbank.com', 'maximum.com.tr', 'maximiles.com.tr']],
  ['Akbank', /akbank|axess/, ['akbank.com', 'akbank.com.tr', 'axess.com.tr']],
  ['QNB', /\bqnb\b|finansbank|cardfinans/, ['qnb.com.tr', 'qnbfinansbank.com', 'finansbank.com.tr', 'cardfinans.com.tr', 'enpara.com']],
  ['Enpara', /enpara/, ['enpara.com', 'qnb.com.tr', 'qnbfinansbank.com']],
  ['Halkbank', /halkbank|paraf/, ['halkbank.com.tr', 'paraf.com.tr']],
  ['VakıfBank', /vak[ıi]f ?bank/, ['vakifbank.com.tr', 'vakifbank.com']],
  ['DenizBank', /denizbank/, ['denizbank.com', 'denizbank.com.tr', 'fastpay.com.tr']],
  ['TEB', /\bteb\b|cepteteb/, ['teb.com.tr', 'cepteteb.com.tr']],
  ['ING', /\bing bank/, ['ing.com.tr']],
  ['Kuveyt Türk', /kuveyt ?t[üu]rk/, ['kuveytturk.com.tr']],
  ['Papara', /papara/, ['papara.com']],
  ['Findeks', /findeks/, ['findeks.com', 'kkb.com.tr']],
  ['PTT', /\bptt\b/, ['ptt.gov.tr', 'pttbank.com.tr', 'pttavm.com']],
  ['e-Devlet', /e-?devlet|t[üu]rkiye\.gov/, ['turkiye.gov.tr']],
  ['Gelir İdaresi', /gelir idaresi|\bgib\b/, ['gib.gov.tr', 'hazine.gov.tr']],
  ['SGK', /\bsgk\b|sosyal g[üu]venlik/, ['sgk.gov.tr']],
  ['Turkcell', /turkcell/, ['turkcell.com.tr', 'turkcell.com']],
  ['Vodafone', /vodafone/, ['vodafone.com.tr', 'vodafone.com']],
  ['Türk Telekom', /t[üu]rk ?telekom/, ['turktelekom.com.tr', 'ttnet.com.tr']],
  ['Trendyol', /trendyol/, ['trendyol.com']],
  ['Hepsiburada', /hepsiburada/, ['hepsiburada.com']],
  ['Amazon', /amazon/, ['amazon.com.tr', 'amazon.com', 'amazon.de', 'amazon.co.uk', 'amazonses.com']],
  ['Apple', /\bapple\b|icloud|app store/, ['apple.com', 'icloud.com', 'itunes.com']],
  ['Microsoft', /microsoft|outlook|xbox|office ?365|onedrive/, ['microsoft.com', 'outlook.com', 'live.com', 'xbox.com', 'office.com', 'microsoftonline.com', 'office365.com']],
  ['Google', /\bgoogle\b|\bgmail\b|youtube/, ['google.com', 'youtube.com', 'gmail.com']],
  ['PayPal', /paypal/, ['paypal.com', 'paypal.com.tr']],
  ['Netflix', /netflix/, ['netflix.com']],
  ['Steam', /\bsteam\b/, ['steampowered.com', 'steamcommunity.com', 'valvesoftware.com']],
  ['Battle.net', /battle\.?net|blizzard/, ['battle.net', 'blizzard.com']],
  ['Riot Games', /riot games/, ['riotgames.com']],
  ['Yurtiçi Kargo', /yurti[çc]i kargo/, ['yurticikargo.com']],
  ['Aras Kargo', /aras kargo/, ['araskargo.com.tr']],
  ['MNG Kargo', /mng kargo/, ['mngkargo.com.tr']],
  ['DHL', /\bdhl\b/, ['dhl.com', 'dhl.com.tr', 'dhl.de']],
  ['UPS', /\bups\b/, ['ups.com']]
];

const trLower = s => String(s || '').toLocaleLowerCase('tr-TR');
const domainOf = email => (String(email || '').split('@')[1] || '').toLowerCase().trim();
const domainIs = (dom, list) => list.some(d => dom === d || dom.endsWith('.' + d));
const hostOfUrl = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
// "a.b.example.com.tr" → "example.com.tr" (kaba "kayıtlı alan adı")
function baseDomain(h) {
  const p = h.split('.').filter(Boolean);
  if (p.length <= 2) return h;
  const two = p.slice(-2).join('.');
  return /^(com|net|org|gov|edu|co|gen|biz|web|av|bel|k12|tv)\.[a-z]{2}$/.test(two) ? p.slice(-3).join('.') : two;
}

/* Güvenli göndericiler: kullanıcının işaretledikleri + otomatik etiketleme kurallarındakiler */
const safeDomains = () => new Set(store.get('safeSenders', []));
function trustedByRules(dom) {
  return (S.filters || []).some(f => {
    const k = (f.criteria?.from || '').toLowerCase();
    return k && (dom === k.replace(/^.*@/, '') || dom.endsWith('.' + k.replace(/^.*@/, '')) || k === dom);
  });
}
async function loadPhishRules() {
  if (S.filters) return;
  try { S.filters = await Gmail.filters(); } catch {}
}

function parseAuth(h) {
  const v = trLower(h);
  const g = k => (v.match(new RegExp('\\b' + k + '=(\\w+)')) || [])[1] || '';
  return { spf: g('spf'), dkim: g('dkim'), dmarc: g('dmarc'), any: !!v };
}

// Ana kontrol. m: { from, fromEmail, authResults, html, replyTo }
function analyzePhish(m, withLinks = true) {
  const reasons = [];
  let level = 0;                          // 0 temiz, 1 dikkat, 2 tehlike
  const dom = domainOf(m.fromEmail);
  if (!dom || (S.email && trLower(m.fromEmail) === trLower(S.email))) return { level: 0, reasons };
  if (safeDomains().has(dom) || safeDomains().has(baseDomain(dom))) return { level: 0, reasons, safe: true };
  const name = trLower(m.from);

  // 1) Gmail'in kimlik doğrulaması
  const a = parseAuth(m.authResults);
  if (a.dmarc === 'fail') { level = 2; reasons.push('Gmail\'in kontrolünde gönderen adres doğrulanamadı (DMARC başarısız); adres taklit edilmiş olabilir.'); }
  else if (a.any && a.spf && a.dkim && !/pass/.test(a.spf) && !/pass/.test(a.dkim) && !a.dmarc) { level = Math.max(level, 1); reasons.push('Gönderen sunucu doğrulanamadı (SPF ve DKIM geçmedi).'); }

  // 2) Marka taklidi
  const rules = trustedByRules(dom);
  let official = false;
  for (const [brand, re, list] of BRANDS) {
    const inName = re.test(name), inDomain = re.test(dom);
    if (domainIs(dom, list)) { official = true; break; }   // gerçekten o kurumdan
    if (!(inName || inDomain)) continue;
    if (rules) break;                     // kendi kurallarında tanınan gönderici
    level = 2;
    reasons.push(inName
      ? `"${brand}" adıyla geliyor ama gönderen adres (${dom}) bu kuruma ait değil.`
      : `Gönderen adres (${dom}) ${brand} gibi görünüyor ama kurumun resmi adresi değil.`);
    break;
  }
  // Ad kısmına başka bir mail adresi yazılmış: "destek@paypal.com <x@baska.com>"
  const em = (m.from || '').match(/[\w.+-]+@([\w-]+\.[\w.-]+)/);
  if (em && baseDomain(em[1].toLowerCase()) !== baseDomain(dom)) { level = 2; reasons.push(`Gönderen adında "${em[0]}" yazıyor ama mail aslında ${dom} adresinden geliyor.`); }
  if (/(^|\.)xn--/.test(dom)) { level = Math.max(level, 2); reasons.push(`Gönderen adres taklit harfler içeriyor (${dom}).`); }

  // 3) Aldatıcı linkler (bültenlerdeki takip linkleri yüzünden sadece "kurum gibi görünen" linklere bakılır)
  if (withLinks && m.html && !((official || rules) && a.dmarc !== 'fail')) {
    const d = new DOMParser().parseFromString(m.html, 'text/html');
    const seen = new Set();
    for (const el of d.querySelectorAll('a[href]')) {
      const href = el.getAttribute('href').trim();
      if (!/^https?:/i.test(href)) continue;
      const host = hostOfUrl(href);
      if (!host) continue;
      const txt = (el.textContent || '').trim().toLowerCase();
      const shown = (txt.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[\/:?#]|$)/) || [])[1];
      const brandish = shown && BRANDS.some(([, re, list]) => domainIs(shown, list) || re.test(shown));
      if (shown && brandish && baseDomain(shown) !== baseDomain(host) && !seen.has('m' + shown)) {
        seen.add('m' + shown);
        level = Math.max(level, 2);
        reasons.push(`Bir link "${shown}" gibi görünüyor ama tıklayınca ${host} adresine gidiyor.`);
      }
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !seen.has('ip')) { seen.add('ip'); level = Math.max(level, 1); reasons.push(`Bir link doğrudan bir IP adresine (${host}) gidiyor; kurumlar böyle link kullanmaz.`); }
      if (/(^|\.)xn--/.test(host) && !seen.has('pc')) { seen.add('pc'); level = Math.max(level, 2); reasons.push(`Bir link taklit harfli bir adrese (${host}) gidiyor.`); }
    }
    if (level === 1 && reasons.length > 3) reasons.splice(3);
  }
  return { level, reasons, domain: dom };
}

// Okuma ekranında uyarı kutusu
function phishNote(container, m) {
  const r = analyzePhish(m);
  if (!r.level) return;
  const n = document.createElement('div');
  const open = store.get('phishOpen', true) !== false;   // ayrıntılar açık mı (tercih hatırlanır)
  n.className = 'phish ' + (r.level === 2 ? 'danger' : 'warn') + (open ? '' : ' closed');
  n.innerHTML = `
    <button class="ph-head" data-action="phish-toggle" aria-expanded="${open}" title="${open ? 'Ayrıntıları gizle' : 'Ayrıntıları göster'}">
      ${IC.alert}<b>${r.level === 2 ? 'Dikkat: Bu mail sahte olabilir' : 'Bu maili dikkatli aç'}</b>
      <span class="ph-count">${r.reasons.length} neden</span>
      <span class="ph-tg">${open ? 'Gizle' : 'Ayrıntılar'}${IC.caret}</span>
    </button>
    <div class="ph-body">
      <ul>${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <p>Linklere tıklama, şifre, kart bilgisi ya da SMS kodu verme. Emin değilsen kurumun uygulamasından ya da telefonla kontrol et.</p>
      <div class="ph-actions">
        <button class="btn" data-action="phish-spam">Spam olarak işaretle</button>
        <button class="btn ghost" data-action="phish-safe" data-d="${esc(r.domain)}">Bu gönderen güvenli</button>
      </div>
    </div>`;
  container.before(n);
}

// Listede küçük uyarı işareti (sadece gönderen bilgisiyle; linkler mail açılınca kontrol edilir)
function phishMark(t) {
  if (!t || t.from === undefined) return '';
  const r = analyzePhish({ from: t.from, fromEmail: t.fromEmail, authResults: t.authResults }, false);
  return r.level === 2 ? `<span class="ph-mark" title="Sahte olabilir">${IC.alert}</span>` : '';
}

Object.assign(ACTIONS, {
  // Ayrıntıları aç/kapa; kapalıyken de kırmızı şerit olarak görünür kalır
  'phish-toggle': el => {
    const box = el.closest('.phish');
    const open = box.classList.toggle('closed') === false;
    store.set('phishOpen', open);
    el.setAttribute('aria-expanded', open);
    el.title = open ? 'Ayrıntıları gizle' : 'Ayrıntıları göster';
    el.querySelector('.ph-tg').firstChild.textContent = open ? 'Gizle' : 'Ayrıntılar';
  },
  'phish-reset': () => { store.del('safeSenders'); toast('Güvenli gönderici listesi temizlendi'); openSettings(); if (S.thread) renderThread(); renderList(); },
  'phish-spam': async () => {
    const id = S.threadId;
    try {
      await Gmail.modifyThread(id, ['SPAM'], ['INBOX']);
      markLocal(id, ['SPAM'], ['INBOX']);
      removeFromList(id); ACTIONS.back();
      toast('Spam klasörüne taşındı');
    } catch (e) { if (!(e instanceof AuthError)) toast('Taşınamadı: ' + e.message); }
  },
  'phish-safe': el => {
    const d = el.dataset.d;
    const s = safeDomains(); s.add(d); store.set('safeSenders', [...s]);
    toast(`${d} güvenli olarak işaretlendi`);
    if (S.thread) renderThread();
    renderList();
  }
});
