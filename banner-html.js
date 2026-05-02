// banner-html.js - Update-Banner mit PWA-Detection und Browser-Redirect

module.exports = `<!--cx-update-banner-v15--><style>
#cxUpd { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 12px; font-size: 13.5px; font-weight: 600; box-shadow: 0 4px 16px rgba(255,107,107,0.5); animation: cxUpdSlide 0.4s cubic-bezier(0.34,1.56,0.64,1); cursor: pointer; }
@keyframes cxUpdSlide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
#cxUpd .ico { width: 38px; height: 38px; border-radius: 8px; flex-shrink: 0; background: rgba(255,255,255,0.2); overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 22px; }
#cxUpd .ico img { width: 100%; height: 100%; object-fit: cover; }
#cxUpd .txt { flex: 1; line-height: 1.3; }
#cxUpd .ttl { font-weight: 800; font-size: 14px; }
#cxUpd .sub { font-size: 11.5px; opacity: 0.95; margin-top: 2px; }
#cxUpd .arrow { font-size: 22px; opacity: 0.9; flex-shrink: 0; }
#cxModal { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: cxModalFade 0.25s ease-out; }
@keyframes cxModalFade { from { opacity: 0; } to { opacity: 1; } }
#cxModal .card { background: #1a1a1a; border-radius: 24px; padding: 28px 24px; max-width: 380px; width: 100%; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 24px 48px rgba(0,0,0,0.6); animation: cxCardPop 0.35s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes cxCardPop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#cxModal .big { width: 96px; height: 96px; border-radius: 22px; margin: 0 auto 16px; background: #000; overflow: hidden; box-shadow: 0 12px 32px rgba(255,107,107,0.4); }
#cxModal .big img { width: 100%; height: 100%; object-fit: cover; }
#cxModal h2 { font-size: 19px; margin: 0 0 8px; color: #fff; font-weight: 800; }
#cxModal p { font-size: 13.5px; color: #aaa; line-height: 1.5; margin: 0 0 18px; }
#cxModal ol { text-align: left; padding-left: 22px; color: #fff; font-size: 13.5px; line-height: 1.8; margin: 0 0 22px; }
#cxModal ol li { margin-bottom: 6px; }
#cxModal ol li b { color: #ff6b6b; }
#cxModal .acts { display: flex; flex-direction: column; gap: 10px; }
#cxModal button { padding: 14px 16px; border: none; border-radius: 14px; font-size: 14.5px; font-weight: 700; cursor: pointer; transition: transform 0.15s; font-family: inherit; }
#cxModal button:active { transform: scale(0.96); }
#cxModal .p1 { background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; box-shadow: 0 4px 14px rgba(255,107,107,0.4); }
#cxModal .p2 { background: rgba(255,255,255,0.08); color: #fff; }
</style>
<script>
(function(){
  if (window.__cxUpdShown) return;
  window.__cxUpdShown = true;

  var V = "v15";
  var KEY = "cx_upd_done_" + V;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator && window.navigator.standalone === true) ||
           document.referrer.indexOf('android-app://') === 0;
  }

  function isiOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function openInBrowser() {
    var url = location.origin + location.pathname;
    if (isiOS()) {
      // iOS: kann nicht direkt browser oeffnen, zeige modal
      showModal();
    } else {
      // Android: kann meist intent links
      try {
        var a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Fallback: zeige modal nach 1s
        setTimeout(showModal, 1000);
      } catch(e) { showModal(); }
    }
  }

  function showModal() {
    if (document.getElementById("cxModal")) return;
    var standalone = isStandalone();
    var ios = isiOS();
    var m = document.createElement("div");
    m.id = "cxModal";
    var instructionsHtml;
    if (standalone) {
      instructionsHtml =
        '<ol>' +
          '<li><b>App-Icon</b> auf Home-Screen <b>lange drücken</b> → “Löschen”</li>' +
          '<li><b>Browser öffnen</b> (Safari/Chrome) und diese Seite öffnen</li>' +
          '<li>Browser-Menü: <b>„Zum Home-Bildschirm hinzufügen“</b></li>' +
          '<li>Öffne die App neu → Neues CX-Icon ist da 🎉</li>' +
        '</ol>';
    } else {
      instructionsHtml =
        '<ol>' +
          '<li>Falls App auf Home-Screen: <b>löschen</b></li>' +
          '<li>Browser-Menü: <b>„Zum Home-Bildschirm hinzufügen“</b></li>' +
          '<li>Neues CX-Icon ist da 🎉</li>' +
        '</ol>';
    }
    var copyBtnHtml = standalone ? '<button class="p2" id="cxCopyBtn">📋 URL kopieren</button>' : '';
    m.innerHTML =
      '<div class="card">' +
        '<div class="big"><img src="/icon.jpg?v=' + V + '" alt=""></div>' +
        '<h2>✨ App-Update verfügbar!</h2>' +
        '<p>Damit das neue CX-Icon auf deinem Home-Screen erscheint:</p>' +
        instructionsHtml +
        '<div class="acts">' +
          copyBtnHtml +
          '<button class="p1" id="cxOkBtn">Verstanden</button>' +
          '<button class="p2" id="cxLaterBtn">Später erinnern</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    var ok = m.querySelector('#cxOkBtn');
    var later = m.querySelector('#cxLaterBtn');
    var copy = m.querySelector('#cxCopyBtn');
    if (ok) ok.addEventListener('click', function() {
      try { localStorage.setItem(KEY, '1'); } catch(e) {}
      m.remove();
      var b = document.getElementById('cxUpd');
      if (b) b.remove();
    });
    if (later) later.addEventListener('click', function() {
      try { sessionStorage.setItem('cx_upd_dismissed', '1'); } catch(e) {}
      m.remove();
      var b = document.getElementById('cxUpd');
      if (b) b.remove();
    });
    if (copy) copy.addEventListener('click', function() {
      try {
        navigator.clipboard.writeText(location.origin);
        copy.textContent = '✅ Kopiert!';
        setTimeout(function() { copy.textContent = '📋 URL kopieren'; }, 2000);
      } catch(e) {}
    });
    m.addEventListener('click', function(e) { if (e.target.id === 'cxModal') m.remove(); });
  }

  function show() {
    if (localStorage.getItem(KEY) === '1') return;
    if (sessionStorage.getItem('cx_upd_dismissed')) return;
    if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register') return;

    var standalone = isStandalone();
    var b = document.createElement('div');
    b.id = 'cxUpd';
    var titleText = standalone ? '✨ App-Update bereit!' : '✨ Neues CX-Icon!';
    var subText = standalone ? 'Tippe um Anleitung zu sehen' : 'Tippe um Icon zu aktualisieren';
    b.innerHTML =
      '<div class="ico"><img src="/icon.jpg?v=' + V + '" alt=""></div>' +
      '<div class="txt"><div class="ttl">' + titleText + '</div><div class="sub">' + subText + '</div></div>' +
      '<div class="arrow">›</div>';
    b.addEventListener('click', function() { showModal(); });
    document.body.appendChild(b);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(show, 400); });
  } else {
    setTimeout(show, 400);
  }
})();
<\/script>`;
