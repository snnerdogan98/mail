/* ───────────── Yazım düzeltmeleri ─────────────
   Yazarken, bir kelime bitince (boşluk, noktalama ya da Enter):
   • Cümle başındaki kelimenin ilk harfi büyütülür.
   • Bilinen özel isimler (kişiler, şehirler, diller, kendi kelimelerin) doğru yazılır:
     "ayşe erdoğan" → "Ayşe Erdoğan", "istanbul" → "İstanbul", "iphone" → "iPhone".
   Düzeltmeden hemen sonra ← Geri silme (Backspace) basılırsa düzeltme geri alınır
   ve o kelimeye bu oturumda bir daha dokunulmaz. */
'use strict';

const trUp = s => s.toLocaleUpperCase('tr-TR');
const trLo = s => s.toLocaleLowerCase('tr-TR');
const trCap = w => trUp(w.charAt(0)) + w.slice(1);
const trTitle = w => trCap(trLo(w));

// Hem isim hem günlük kelime olanlar: tek başına büyütülmez, sadece tam ad olarak yazılınca
// ("can yılmaz" → "Can Yılmaz") büyütülür.
const AC_COMMON = new Set(('can deniz umut ay su gül barış sevgi nur bahar yağmur kar ışık güneş yıldız derya ümit dilek ' +
  'ateş şeker bal inci elmas zafer kader hayat nisan mayıs ekim aslan kaya demir çelik doğan şahin kartal öz tan er ak ' +
  'kara eser onur ilke akın alp bulut çiçek toprak ceylan pınar ırmak dağ gök bora tunç sarp yiğit esen sevinç neşe rüya ' +
  'aydın ordu umay şafak tuna sezen sema seher gonca lale menekşe papatya yasemin ayça gülay ülkü ece ezgi ezel ' +
  'nazlı sevda sevim selin nehir mutlu ümran bilge erdem cesur azim ferah huzur emel hilal savaş koray polat yücel ' +
  'özgür hür kurt arslan uçar kılıç keskin güler durmaz bayram cuma kurban oğuz tuğba gizem efe ata ufuk').split(' '));

// Her zaman bu şekilde yazılan kelimeler
const AC_FIXED = ('Türkiye Türk Türkçe İngilizce Almanca Fransızca Arapça Rusça İspanyolca İtalyanca Japonca Çince Kürtçe Farsça Yunanca ' +
  'Atatürk Avrupa Asya Afrika Amerika Almanya İngiltere Fransa İtalya İspanya Hollanda Yunanistan Rusya Japonya Çin Kanada Azerbaycan ' +
  'KKTC Kıbrıs Londra Paris Berlin Roma Bakü Moskova Ramazan Bayramı ' +
  'Adana Adıyaman Afyonkarahisar Amasya Ankara Antalya Artvin Balıkesir Bilecik Bingöl Bitlis Bolu Burdur Bursa Çanakkale Çankırı Çorum ' +
  'Denizli Diyarbakır Edirne Elazığ Erzincan Erzurum Eskişehir Gaziantep Giresun Gümüşhane Hakkari Hatay Isparta Mersin İstanbul İzmir Kars ' +
  'Kastamonu Kayseri Kırklareli Kırşehir Kocaeli Konya Kütahya Malatya Manisa Kahramanmaraş Mardin Muğla Muş Nevşehir Niğde Rize Sakarya ' +
  'Samsun Siirt Sinop Sivas Tekirdağ Trabzon Tunceli Şanlıurfa Van Yozgat Zonguldak Aksaray Bayburt Karaman Kırıkkale Batman ' +
  'Şırnak Bartın Ardahan Iğdır Yalova Karabük Kilis Osmaniye Düzce Kadıköy Beşiktaş Üsküdar Şişli Bakırköy Kapadokya ' +
  'Google Gmail YouTube WhatsApp Instagram iPhone iPad iCloud macOS Windows Microsoft Apple Samsung Netflix Spotify ' +
  // Önemli yerler, kişiler, kurumlar, günler (tek başına günlük kelime olmayanlar)
  'Anıtkabir Ayasofya Topkapı Dolmabahçe Galata Sultanahmet Süleymaniye Eminönü Taksim Beyoğlu Boğaziçi Karaköy Ortaköy ' +
  'Sarıyer Kızılay Çankaya Keçiören Alsancak Karşıyaka Pamukkale Efes Truva Nemrut Göbeklitepe Sümela Ihlara ' +
  'Uludağ Erciyes Palandöken Ararat Fırat Dicle Kızılırmak Marmara Ege Akdeniz Karadeniz Anadolu Trakya ' +
  'Gelibolu Dumlupınar Malazgirt Kapalıçarşı Atatürk İnönü Osmanlı Selçuklu Bizans Mevlana Nasreddin Bektaş ' +
  'Sancar Sunal Manço TBMM TRT TÜİK SGK MEB YÖK ÖSYM PTT THY AVM NATO ABD UNESCO Nevruz Hıdırellez Noel').split(' ')
  .filter(w => w !== 'Bayramı');

// Kişi değil kurum adı olduğunu gösteren kelimeler
const AC_ORG = /^(bank|bankası|banka|kredi|katılım|sigorta|holding|telekom|turkcell|vodafone|games?|support|store|team|official|info|news|notebook|market|mağaza|mağazası|hizmetleri?|destek|müşteri|bilgi|grup|group|teknoloji|yayın|yayınları|online|shop|club|kulübü|derneği|vakfı|belediyesi|üniversitesi|okulu|hastanesi|eczanesi|kargo|lojistik|enerji|elektrik|doğalgaz|su|internet|digital|dijital|plus|premium|pay|card|kart|noreply|no-reply|bilgilendirme|kampanya|fırsat|indirim|a\.ş\.?|ltd\.?|şti\.?|inc\.?|llc|gmbh)$/i;

// Cümle başı sayılmayan kısaltmalar ("vb. diğerleri")
// Sadece birlikte yazılınca büyütülenler (tek başına günlük kelime olabilir: bebek, mısır, yunus, boğaz…)
const AC_FIXED_NAMES = ['Mustafa Kemal Atatürk', 'Fatih Sultan Mehmet', 'Kanuni Sultan Süleyman', 'Yavuz Sultan Selim',
  'Mimar Sinan', 'Yunus Emre', 'Nasreddin Hoca', 'Hacı Bektaş Veli', 'Nazım Hikmet', 'Orhan Pamuk', 'Aziz Sancar',
  'Kemal Sunal', 'Barış Manço', 'Ağrı Dağı', 'Mısır Çarşısı', 'Kapalı Çarşı', 'Kız Kulesi', 'Galata Kulesi',
  'Topkapı Sarayı', 'Dolmabahçe Sarayı', 'Sultanahmet Camii', 'Süleymaniye Camii', 'Bağdat Caddesi', 'İstiklal Caddesi',
  'İstiklal Marşı', 'Kurtuluş Savaşı', 'Çanakkale Savaşı', 'Türkiye Büyük Millet Meclisi', 'Milli Eğitim Bakanlığı',
  'Cumhuriyet Bayramı', 'Zafer Bayramı', 'Kurban Bayramı', 'Ramazan Bayramı', 'Bebek Sahili', 'Boğaz Köprüsü',
  'Avrupa Birliği', 'Birleşmiş Milletler', 'Kızılay', 'Türk Hava Yolları'];

const AC_ABBR = /(?:^|\s)(vb|vs|örn|bkz|yy|sn|no|tel|krş|bk|vd)\.\s*$/i;

const AC = { singles: new Map(), pairs: new Map(), ignore: new Set(), last: null, built: 0 };

const acOn = k => store.get(k, true) !== false;
const acLearned = () => store.get('acLearned', []);
const acMine = () => store.get('acMine', []);

// Tek kelimelik / iki-üç kelimelik isim sözlüğünü kur
function acBuild() {
  const singles = new Map(), pairs = new Map();
  const addSingle = w => { const lo = trLo(w); if (lo !== w && !AC_COMMON.has(lo)) singles.set(lo, w); };
  // force: kendi kelimelerin (her parça tek başına da düzeltilir).
  // Öğrenilen adlarda tek başına sadece ilk ad düzeltilir; soyadlar çoğu zaman günlük kelimedir
  // (Yılmaz, Kaya, Demir), onlar sadece tam ad olarak yazılınca büyür.
  const addName = (name, force) => {
    const ws = name.trim().split(/\s+/).filter(Boolean);
    if (!ws.length) return;
    const one = w => { const lo = trLo(w); if (lo !== w && (force || !AC_COMMON.has(lo))) singles.set(lo, w); };
    for (let i = 0; i < ws.length - 1; i++) pairs.set(trLo(ws[i] + ' ' + ws[i + 1]), ws[i] + ' ' + ws[i + 1]);
    if (force) ws.forEach(one); else one(ws[0]);
  };
  AC_FIXED.forEach(addSingle);
  AC_FIXED_NAMES.forEach(n => { const ws = n.split(' '); for (let i = 0; i < ws.length - 1; i++) pairs.set(trLo(ws[i] + ' ' + ws[i + 1]), ws[i] + ' ' + ws[i + 1]); });
  acLearned().forEach(n => addName(n, false));
  acMine().forEach(n => addName(n, true)); // kendi yazdıkların her zaman geçerli
  AC.singles = singles; AC.pairs = pairs; AC.built = Date.now();
}

// Maillerdeki gönderici/alıcı adlarından kişi isimlerini öğren ("Ayşe Erdoğan", "MEHMET YILMAZ")
function acPersonName(raw) {
  const s = String(raw || '').replace(/["'“”]/g, '').trim();
  if (!s || /[@\d]/.test(s)) return null;
  const ws = s.split(/\s+/);
  if (ws.length < 2 || ws.length > 3) return null;
  if (ws.some(w => AC_ORG.test(w))) return null; // şirket adları ("Yapı Kredi", "Riot Games")
  const caps = ws.every(w => /^[A-ZÇĞİIÖŞÜ]{2,}$/.test(w));
  const title = ws.every(w => /^[A-ZÇĞİIÖŞÜ][a-zçğıiöşü]+$/.test(w));
  if (!caps && !title) return null;
  return caps ? ws.map(trTitle).join(' ') : s;
}
function acLearn() {
  const names = new Set(acLearned());
  const before = names.size;
  const add = n => { const p = acPersonName(n); if (p) names.add(p); };
  (S.threads || []).forEach(t => { add(t.from); add(t.to); });
  (S.thread?.messages || []).forEach(m => { add(m.from); });
  if (names.size !== before) store.set('acLearned', [...names].slice(-1500));
  acBuild();
}

// Biten kelimeyi kontrol et. text: imleçten önceki metin (aynı satır/düğüm).
// Dönüş: { start, end, rep, orig } ya da null
function acCheck(text, lineStart) {
  const m = /([A-Za-zÇĞİIÖŞÜçğıiöşü'’]+)$/.exec(text);
  if (!m) return null;
  let word = m[1], start = m.index;
  const apo = word.search(/['’]/);               // "istanbul'da" → kök "istanbul"
  const root = apo > 0 ? word.slice(0, apo) : word;
  const prevCh = text.charAt(start - 1);
  if (prevCh && /[@./\\:_\-\d#]/.test(prevCh)) return null; // adres, link, dosya adı
  const lo = trLo(root);
  if (root !== lo) return null;                   // zaten büyük harf içeriyor → dokunma
  if (AC.ignore.has(lo)) return null;
  let rep = null, from = start, orig = root;

  if (acOn('acNames')) {
    // İki kelimelik isim: "can yılmaz"
    const pm = /([A-Za-zÇĞİIÖŞÜçğıiöşü]+)(\s+)$/.exec(text.slice(0, start));
    if (pm) {
      const pair = AC.pairs.get(trLo(pm[1] + ' ' + root));
      if (pair) {
        const [a, b] = pair.split(' ');
        if (pm[1] !== a || root !== b) { from = pm.index; orig = text.slice(from, start) + root; rep = a + pm[2] + b; }
      }
    }
    if (!rep && AC.singles.has(lo)) rep = AC.singles.get(lo);
  }
  if (!rep && acOn('acSentence')) {
    const pre = text.slice(0, start);
    const atStart = /^\s*$/.test(pre) ? lineStart : /[.!?…]["')\]]*\s+$/.test(pre) && !AC_ABBR.test(pre);
    if (atStart) rep = trCap(root);
  }
  if (!rep || rep === orig) return null;
  return { start: from, end: start + root.length, rep, orig };
}

const AC_TRIGGER = /^[\s.,!?;:)\]"'…]$/;
const isAcField = el => el && el.matches && el.matches('[data-ac], textarea[spellcheck], input[spellcheck], [contenteditable][spellcheck]');

document.addEventListener('focusin', e => { if (isAcField(e.target)) acLearn(); });

document.addEventListener('beforeinput', e => {
  const el = e.target;
  if (!isAcField(el) || e.isComposing) return;
  const enter = e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak';
  if (!enter && !(e.inputType === 'insertText' && AC_TRIGGER.test(e.data || ''))) return;
  if (!AC.built) acBuild();

  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const pos = el.selectionStart;
    if (pos == null || pos !== el.selectionEnd) return;
    const lineFrom = el.value.lastIndexOf('\n', pos - 1) + 1;
    const r = acCheck(el.value.slice(lineFrom, pos), true);
    if (!r) return;
    el.setRangeText(r.rep, lineFrom + r.start, lineFrom + r.end, 'end');
    el.setSelectionRange(pos, pos);
    AC.last = { el, at: pos, start: lineFrom + r.start, rep: r.rep, orig: r.orig, typed: enter ? '\n' : e.data };
    return;
  }

  // Not defteri (contenteditable)
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  const node = sel.anchorNode, off = sel.anchorOffset;
  if (!node || node.nodeType !== 3) return;
  const prev = node.previousSibling;
  const lineStart = !prev || prev.nodeName === 'BR' || /^(DIV|P|LI|H\d|BLOCKQUOTE)$/.test(prev.nodeName);
  const r = acCheck(node.data.slice(0, off), lineStart);
  if (!r) return;
  node.replaceData(r.start, r.end - r.start, r.rep);
  sel.collapse(node, off);
  AC.last = { node, at: off, start: r.start, rep: r.rep, orig: r.orig, typed: enter ? null : e.data };
  el.dispatchEvent(new Event('input', { bubbles: true })); // not kaydı için
}, true);

// Düzeltmeden hemen sonra Geri silme → düzeltmeyi geri al
document.addEventListener('keydown', e => {
  const L = AC.last;
  if (!L) return;
  if (e.key !== 'Backspace') { if (e.key.length === 1 || e.key === 'Enter') AC.last = null; return; }
  AC.last = null;
  const el = e.target;
  if (L.el && L.el === el) {
    const after = L.at + (L.typed ? L.typed.length : 0);
    if (el.selectionStart !== after || el.selectionEnd !== after) return;
    e.preventDefault();
    el.setRangeText(L.orig, L.start, L.start + L.rep.length, 'preserve');
    el.setSelectionRange(after, after);
  } else if (L.node && L.node.isConnected && L.typed) {
    const sel = getSelection();
    if (sel.anchorNode !== L.node || sel.anchorOffset !== L.at + L.typed.length) return;
    e.preventDefault();
    L.node.replaceData(L.start, L.rep.length, L.orig);
    sel.collapse(L.node, L.at + L.typed.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else return;
  trLo(L.orig).split(/\s+/).forEach(w => AC.ignore.add(w));
}, true);
