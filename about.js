/* ───────────── Hakkında ───────────── */
'use strict';

// Büyükayı'nın kepçesi; Süha (Alcor), Mizar'ın hemen yanındaki sönük yıldız
function suhaSky() {
  const S = [[34, 70], [40, 128], [118, 142], [132, 88], [196, 76], [256, 62], [324, 84]];   // Dubhe → Alkaid
  const line = [0, 1, 2, 3, 0].map(i => S[i].join(',')).join(' ') + ' ' + [3, 4, 5, 6].map(i => S[i].join(',')).join(' ');
  const alcor = [266, 42];
  return `<svg class="ab-sky" viewBox="0 0 360 170" role="img" aria-label="Büyükayı takımyıldızı ve Süha yıldızı">
    <defs><radialGradient id="abg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <polyline points="${line}" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="1.2" stroke-dasharray="3 4"/>
    ${S.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 5 ? 4.2 : 3.4}" fill="currentColor"/>`).join('')}
    <circle cx="${alcor[0]}" cy="${alcor[1]}" r="14" fill="url(#abg)" class="ab-glow"/>
    <circle cx="${alcor[0]}" cy="${alcor[1]}" r="2.2" fill="currentColor"/>
    <circle cx="${alcor[0]}" cy="${alcor[1]}" r="9" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1"/>
    <text x="${alcor[0] + 14}" y="${alcor[1] - 10}" class="ab-lbl">Süha</text>
    <text x="${S[5][0] - 8}" y="${S[5][1] + 22}" class="ab-lbl dim">Mizar</text>
  </svg>`;
}

function openAbout() {
  $('#modal').innerHTML = `
  <div class="modal-bg">
    <div class="sheet about-sheet">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-action="close-modal">${IC.close}</button>
        <h3>Hakkında</h3>
      </header>
      <div class="ab-body">
        <div class="ab-app">
          <img class="ab-icon" src="${window.APP_ICON || 'apple-touch-icon.png?v=6'}" alt="">
          <div><b>${window.APP_NAME || 'Mail'}</b><span>Sürüm ${APP_VERSION}</span></div>
        </div>
        <p class="ab-lead">${window.APP_LEAD || 'Gmail için sade, hızlı ve gizliliğe önem veren bir posta programı. Maillerin yalnızca senin cihazında görüntülenir; arada başka bir sunucu yoktur.'}</p>

        <div class="ab-links">
          <a class="btn" href="gizlilik.html" target="_blank" rel="noopener">${IC.shield || ''}Gizlilik politikası</a>
          ${typeof openFeedback === 'function' ? `<button class="btn" data-action="feedback">${IC.pen}Geri bildirim gönder</button>` : ''}
        </div>
        <p class="ab-credit">Bir <b>Suha</b> projesi · Sinan Erdoğan ve Claude</p>
        <p class="ab-foot">© ${new Date().getFullYear()} Suha · Gmail, Google LLC'nin ticari markasıdır.</p>
      </div>
    </div>
  </div>`;
}

function aboutRow() {
  return `<div class="set-row"><div><b>${window.APP_NAME || 'Mail'} · Sürüm ${APP_VERSION}</b><span>Bir Suha projesi · Sinan Erdoğan ve Claude</span></div>
    <button class="btn" data-action="about">${IC.spark || ''}Hakkında</button></div>`;
}
Object.assign(ACTIONS, { about: () => openAbout() });
