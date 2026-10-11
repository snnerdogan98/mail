/* Mail yeni adresine taşındı. Bu sayfa eski adresteki her şeyi temizler (oturum, ayarlar, önbellek)
   ve kullanıcıyı yeni adrese götürür. */
(function () {
  var YENI = 'https://projectsuha.github.io/mail/';
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
  var bitti = function () { location.replace(YENI + location.pathname.replace(/^\/mail\/?/, '')); };
  var isler = [];
  try { if (navigator.serviceWorker) isler.push(navigator.serviceWorker.getRegistrations().then(function (r) { return Promise.all(r.map(function (x) { return x.unregister(); })); })); } catch (e) {}
  try { if (window.caches) isler.push(caches.keys().then(function (k) { return Promise.all(k.map(function (x) { return caches.delete(x); })); })); } catch (e) {}
  Promise.all(isler).then(bitti, bitti);
  setTimeout(bitti, 3000);
})();
