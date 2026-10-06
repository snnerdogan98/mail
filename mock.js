/* Demo modu (?demo): Gmail'e bağlanmadan arayüzü örnek verilerle gösterir. */
(function () {
  const L = (id, name, color) => ({ id, name, type: 'user', color });
  const labels = [
    ...['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'IMPORTANT'].map(id => ({ id, name: id, type: 'system' })),
    L('L1', 'Amazon', '#285bac'), L('L2', 'Apple', '#999999'), L('L3', 'Battle.Net', '#000000'),
    L('L4', 'Enpara', '#fbd3e0'), L('L5', 'Fatura', '#cccccc'), L('L6', 'Findeks', '#000000'),
    L('L7', 'Garanti', '#16a766'), L('L8', 'Garanti/Annem Garanti', '#0b804b'), L('L9', 'Hepsiburada', '#ffad47'),
    L('L10', 'Kişisel', '#a46a21'), L('L11', 'Microsoft/Xbox', '#4a86e8'), L('L12', 'Monster', '#000000'),
    L('L13', 'Notes', '#cccccc'), L('L14', 'ON Dijital', '#43d692'), L('L15', 'Papara', '#000000'),
    L('L16', 'QNB', '#f691b3'), L('L17', 'Riot Games', '#666666'), L('L18', 'Steam', '#1c4587'),
    L('L19', 'Steam/Steam Store', '#e7e7e7'), L('L20', 'Trendyol', '#ff7537'), L('L21', 'Yapıkredi', '#4a86e8'),
    L('L22', 'Ziraat', '#ac2b16')
  ];

  const now = Date.now(), H = 3600e3, D = 24 * H;
  let seq = 0;
  const T = (label, from, subject, text, ago, opts = {}) => ({
    id: 't' + (++seq), label, from, subject, text, date: now - ago, unread: !!opts.unread,
    starred: !!opts.starred, inbox: opts.inbox !== false, html: opts.html
  });
  const raw = [
    T('L20', 'Trendyol <kampanya@trendyol.com>', 'Siparişin kargoya verildi 📦', 'Merhaba, 4 Ekim tarihli siparişin kargoya verildi. Takip numarası: 7281 0034 9921.', 1.2 * H, { unread: true, html: '<div style="font-family:Arial;max-width:560px;margin:auto"><div style="background:#f27a1a;color:#fff;padding:18px 20px;font-size:20px;font-weight:bold">trendyol</div><div style="padding:20px"><h2 style="margin-top:0">Siparişin yolda!</h2><p>Merhaba, 4 Ekim tarihli siparişin kargoya verildi.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;border-bottom:1px solid #eee">Kargo firması</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right"><b>Trendyol Express</b></td></tr><tr><td style="padding:8px">Takip no</td><td style="padding:8px;text-align:right"><b>7281 0034 9921</b></td></tr></table><a href="https://example.com" style="display:inline-block;background:#f27a1a;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">Kargomu takip et</a></div></div>' }),
    T('L8', 'Garanti BBVA <bilgilendirme@garantibbva.com.tr>', 'Kredi kartı ekstreniz hazır – Ayşe Erdoğan', 'Sayın Ayşe Erdoğan, **** 4417 numaralı kartınızın Ekim dönemi ekstresi hazırlanmıştır. Son ödeme tarihi: 15 Ekim 2026.', 3 * H, { unread: true }),
    T('L17', 'Riot Games <noreply@mail.riotgames.com>', 'Yeni sezon başladı: ödüllerini al', 'Sezon 3 başladı. Derecelendirilmiş maçlara gir ve sezon ödüllerini topla.', 5 * H, { unread: true }),
    T('L19', 'Steam <noreply@steampowered.com>', 'İstek listendeki 3 oyun indirimde!', 'İstek listendeki Hades II, Balatro ve Hollow Knight: Silksong şu anda indirimde.', 6 * H, { unread: true, inbox: false }),
    T('L19', 'Steam <noreply@steampowered.com>', 'Sonbahar indirimi başladı', 'Binlerce oyunda büyük indirimler 9 Ekim\'e kadar devam ediyor.', 1.1 * D, { unread: true, inbox: false }),
    T('L18', 'Steam <noreply@steampowered.com>', 'Steam hesabınız: yeni cihazdan giriş', 'Steam hesabınıza Windows cihazdan giriş yapıldı. Bu siz değilseniz şifrenizi değiştirin.', 8 * H, { unread: true }),
    T('L18', 'Steam Support <support@steampowered.com>', 'Destek talebiniz yanıtlandı', 'Merhaba, talebinizle ilgili inceleme tamamlandı.', 2 * D, { unread: true }),
    T('L10', 'Mehmet Yılmaz <mehmet.yilmaz84@gmail.com>', 'Hafta sonu planı', 'Selam! Cumartesi kahvaltıya ne dersin? Saat 10 gibi Moda\'da buluşabiliriz.\n\nMehmet', 9 * H, { starred: true }),
    T('L7', 'Garanti BBVA <bilgilendirme@garantibbva.com.tr>', 'Hesap hareketi bildirimi', 'Sayın Sinan Erdoğan, hesabınıza 2.450,00 TL tutarında havale gelmiştir.', 11 * H),
    T('L5', 'Enerjisa <e-fatura@enerjisa.com.tr>', 'Ekim 2026 elektrik faturanız', 'Ekim dönemine ait faturanız 612,40 TL olarak oluşturulmuştur. Son ödeme: 20 Ekim.', 1.3 * D),
    T('L5', 'Türk Telekom <efatura@turktelekom.com.tr>', 'İnternet faturanız hazır', 'Ekim dönemi fatura tutarınız 449,90 TL.', 3 * D),
    T('L1', 'Amazon.com.tr <siparis-guncelleme@amazon.com.tr>', 'Siparişiniz teslim edildi', 'Logitech MX Master 3S siparişiniz teslim edildi.', 1.5 * D),
    T('L9', 'Hepsiburada <bilgi@hepsiburada.com>', 'Sepetindeki ürünün fiyatı düştü', 'Sepetindeki Philips airfryer\'ın fiyatı 3.499 TL\'ye düştü.', 2.2 * D, { inbox: false }),
    T('L11', 'Xbox <xbox@engage.xbox.com>', 'Bu ay Game Pass\'e gelenler', 'Ekim ayında Game Pass kütüphanesine eklenen oyunlara göz at.', 2.5 * D, { inbox: false }),
    T('L11', 'Microsoft hesap ekibi <account-security-noreply@accountprotection.microsoft.com>', 'Microsoft hesabı güvenlik kodu', 'Güvenlik kodunuz: 482913', 4 * D),
    T('L4', 'Enpara.com <bilgi@enpara.com>', 'Ekim ayı hesap özetiniz', 'Ekim ayı hesap özetiniz ektedir.', 3.5 * D),
    T('L16', 'QNB <bilgilendirme@qnb.com.tr>', 'Kartınızla yapılan harcama', 'QNB kartınızla 189,90 TL harcama yapılmıştır.', 4.2 * D),
    T('L22', 'Ziraat Bankası <bilgilendirme@ziraatbank.com.tr>', 'Şifre değişikliği', 'İnternet şubesi şifreniz değiştirilmiştir.', 5 * D),
    T('L3', 'Battle.net <noreply@battle.net>', 'Battle.net hesabınızda yeni oturum', 'Hesabınıza yeni bir cihazdan giriş yapıldı.', 6 * D),
    T('L2', 'Apple <no_reply@email.apple.com>', 'Apple ID faturanız', 'iCloud+ 50 GB aboneliği için faturanız.', 7 * D),
    T('L14', 'ON Dijital <bilgi@ondijital.com>', 'Mevduat faizi güncellendi', 'Vadeli hesabınızın faiz oranı güncellenmiştir.', 8 * D),
    T('L15', 'Papara <destek@papara.com>', 'Cashback kazandın!', 'Bu ayki harcamalarından 42,50 TL cashback kazandın.', 9 * D),
    T('L6', 'Findeks <bilgi@findeks.com>', 'Kredi notunuz güncellendi', 'Findeks kredi notunuz güncellendi.', 10 * D),
    T('L21', 'Yapı Kredi <bilgilendirme@yapikredi.com.tr>', 'World kart ekstreniz', 'Ekim dönemi ekstreniz hazır.', 11 * D),
    T('L12', 'Monster Notebook <bilgi@monsternotebook.com.tr>', 'Garanti kaydınız oluşturuldu', 'Tulpar T7 cihazınızın garanti kaydı oluşturuldu.', 12 * D),
    T('L13', 'Ben <snn.erdogan98@gmail.com>', 'Not: kira artışı', 'Kira artışı Ocak\'ta %TÜFE oranında olacak, sözleşmeyi kontrol et.', 13 * D, { inbox: false }),
    T(null, 'LinkedIn <messages-noreply@linkedin.com>', 'Bu hafta profilini 12 kişi görüntüledi', 'Profilini görüntüleyenleri gör.', 4 * H, { unread: true })
  ];
  // Taramada çakışma göstermek için: Garanti ve Annem Garanti aynı adresten
  raw.push(T('L8', 'Garanti BBVA <bilgilendirme@garantibbva.com.tr>', 'Eylül ekstreniz – Ayşe Erdoğan', 'Sayın Ayşe Erdoğan, Eylül dönemi ekstreniz hazırlanmıştır.', 30 * D, { inbox: false }));
  raw.push(T('L7', 'Garanti BBVA <bilgilendirme@garantibbva.com.tr>', 'Bonus puan kazandınız', 'Sayın Sinan Erdoğan, 120 bonus kazandınız.', 20 * D, { inbox: false }));

  const threads = raw.map(r => ({
    id: r.id,
    labelIds: [r.label, r.inbox && 'INBOX', r.unread && 'UNREAD', r.starred && 'STARRED'].filter(Boolean),
    msg: r
  }));
  let filters = [{ id: 'f1', criteria: { from: 'enerjisa.com.tr' }, action: { addLabelIds: ['L5'] } }];
  const wait = (v, ms = 220) => new Promise(r => setTimeout(() => r(v), ms));
  const addr = s => { const m = s.match(/^(.*?)<([^>]+)>/); return m ? { name: m[1].trim(), email: m[2] } : { name: s, email: s }; };
  const me = 'snn.erdogan98@gmail.com';

  function summary(t) {
    const f = addr(t.msg.from);
    return { id: t.id, from: f.name, fromEmail: f.email, to: 'Sinan', subject: t.msg.subject, snippet: t.msg.text.slice(0, 120),
      date: t.msg.date, count: 1, labelIds: [...t.labelIds], unread: t.labelIds.includes('UNREAD'), starred: t.labelIds.includes('STARRED') };
  }
  function counts() {
    return labels.map(l => {
      const inL = threads.filter(t => t.labelIds.includes(l.id));
      return { ...l, unread: inL.filter(t => t.labelIds.includes('UNREAD')).length, total: inL.length };
    });
  }
  function match(t, q) {
    q = q.toLowerCase();
    const fm = q.match(/from:\(([^)]+)\)/);
    if (fm) return t.msg.from.toLowerCase().includes(fm[1]);
    return (t.msg.subject + ' ' + t.msg.text + ' ' + t.msg.from).toLowerCase().includes(q);
  }

  window.MockGmail = {
    profile: () => wait({ email: me }),
    labels: () => wait(counts()),
    listThreads: ({ labelId, q }) => wait({
      threads: threads.filter(t => q ? match(t, q) : (labelId === 'ALL' ? true : t.labelIds.includes(labelId)))
        .sort((a, b) => b.msg.date - a.msg.date).map(summary), next: null
    }, 350),
    getThread: id => {
      const t = threads.find(x => x.id === id);
      const f = addr(t.msg.from);
      return wait({ id, labelIds: [...t.labelIds], messages: [{
        id: id + 'm', labelIds: [...t.labelIds], from: f.name, fromEmail: f.email, to: 'Sinan Erdoğan <' + me + '>', cc: '', replyTo: '',
        subject: t.msg.subject, date: t.msg.date, messageId: '<' + id + '@demo>', references: '', snippet: t.msg.text,
        html: t.msg.html || '', text: t.msg.text, inline: [],
        attachments: /ekstre|fatura|özet/i.test(t.msg.subject) ? [{ filename: 'ekstre_ekim_2026.pdf', mimeType: 'application/pdf', size: 184320, data: btoa('demo') }] : []
      }] });
    },
    modifyThread: (id, add = [], remove = []) => {
      const t = threads.find(x => x.id === id);
      t.labelIds = [...new Set([...t.labelIds, ...add])].filter(x => !remove.includes(x));
      return wait({});
    },
    trashMessages: ids => { ids.forEach(id => { const t = threads.find(x => x.id === id); if (t) t.labelIds = ['TRASH']; }); return wait({}); },
    trashThread: id => { const t = threads.find(x => x.id === id); t.labelIds = ['TRASH']; return wait({}); },
    send: () => wait({ id: 'sent' }, 600),
    attachment: () => wait(btoa('demo')),
    filters: () => wait(filters.map(f => ({ ...f }))),
    createFilter: (criteria, action) => { const f = { id: 'f' + Math.random().toString(36).slice(2, 7), criteria, action }; filters.push(f); return wait(f); },
    deleteFilter: id => { filters = filters.filter(f => f.id !== id); return wait({}); },
    labelSenders: id => wait(threads.filter(t => t.labelIds.includes(id) || t.msg.label === id).map(t => addr(t.msg.from).email.toLowerCase()), 150),
    messageIdsByQuery: q => wait(threads.filter(t => match(t, q) && (!/in:inbox/.test(q) || t.labelIds.includes('INBOX'))).map(t => t.id)),
    batchModify: (ids, add = [], remove = []) => { ids.forEach(id => { const t = threads.find(x => x.id === id); if (t) t.labelIds = [...new Set([...t.labelIds, ...add])].filter(x => !remove.includes(x)); }); return wait({}); }
  };
})();
