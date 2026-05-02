// banner-html.js v17 - OHNE auto-clear (das hat SW kaputt gemacht und Install verhindert)

module.exports = `<!--cx-update-banner-v17--><style>
#cxUpd { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 12px; font-size: 13.5px; font-weight: 600; box-shadow: 0 4px 16px rgba(255,107,107,0.5); animation: cxUpdSlide 0.4s cubic-bezier(0.34,1.56,0.64,1); cursor: pointer; }
@keyframes cxUpdSlide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
#cxUpd .ico { width: 38px; height: 38px; border-radius: 8px; flex-shrink: 0; background: rgba(255,255,255,0.2); overflow: hidden; }
#cxUpd .ico img { width: 100%; height: 100%; object-fit: cover; }
#cxUpd .txt { flex: 1; line-height: 1.3; }
#cxUpd .ttl { font-weight: 800; font-size: 14px; }
#cxUpd .sub { font-size: 11.5px; opacity: 0.95; margin-top: 2px; }
#cxUpd .arrow { font-size: 22px; opacity: 0.9; flex-shrink: 0; }
</style>
<script>
(function(){
  if (window.__cxUpdShown) return;
  window.__cxUpdShown = true;
  var V = 'v17';
  var SEEN_KEY = 'cx_upd_done_' + V;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator && window.navigator.standalone === true);
  }

  function showModal() {
    if (document.getElementById('cxModal')) return;
    var standalone = isStandalone();
    var m = document.createElement('div');
    m.id = 'cxModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;';
    var instructionsHtml = standalone ?
      '<ol style="text-align:left;padding-left:22px;color:#fff;font-size:13.5px;line-height:1.8;margin:0 0 22px;">' +
        '<li>App auf Home-Screen <b style="color:#ff6b6b">lange drücken</b> → “Löschen”</li>' +
        '<li><b style="color:#ff6b6b">Browser</b> (Chrome/Safari) öffnen + Seite besuchen</li>' +
        '<li>Auf der Seite ein paar Sekunden warten</li>' +
        '<li>Browser-Menü: <b style="color:#ff6b6b">Zum Home-Bildschirm</b></li>' +
        '<li>Neues CX-Icon ist da 🎉</li>' +
      '</ol>' :
      '<ol style="text-align:left;padding-left:22px;color:#fff;font-size:13.5px;line-height:1.8;margin:0 0 22px;">' +
        '<li>Wenn altes Icon auf Home-Screen: <b style="color:#ff6b6b">löschen</b></li>' +
        '<li>Diese Seite ein paar Sekunden offen lassen</li>' +
        '<li>Browser-Menü: <b style="color:#ff6b6b">App installieren</b> oder <b>Zum Home-Bildschirm</b></li>' +
        '<li>Falls kein <b>Install</b> kommt: Browser-Cache leeren + nochmal</li>' +
      '</ol>';
    m.innerHTML =
      '<div style="background:#1a1a1a;border-radius:24px;padding:28px 24px;max-width:380px;width:100%;text-align:center;border:1px solid rgba(255,255,255,0.1);box-shadow:0 24px 48px rgba(0,0,0,0.6);">' +
        '<div style="width:96px;height:96px;border-radius:22px;margin:0 auto 16px;background:#000;overflow:hidden;box-shadow:0 12px 32px rgba(255,107,107,0.4);"><img src="/icon.jpg?v=' + V + '" alt="" style="width:100%;height:100%;object-fit:cover;"></div>' +
        '<h2 style="font-size:19px;margin:0 0 8px;color:#fff;font-weight:800;">✨ App-Update verfügbar!</h2>' +
        '<p style="font-size:13.5px;color:#aaa;line-height:1.5;margin:0 0 18px;">Anleitung für neues CX-Icon:</p>' +
        instructionsHtml +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<button id="cxOkBtn" style="padding:14px 16px;border:none;border-radius:14px;font-size:14.5px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#ff6b6b,#ee5a52);color:#fff;box-shadow:0 4px 14px rgba(255,107,107,0.4);">Verstanden</button>' +
          '<button id="cxLaterBtn" style="padding:14px 16px;border:none;border-radius:14px;font-size:14.5px;font-weight:700;cursor:pointer;background:rgba(255,255,255,0.08);color:#fff;">Später</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    var ok = m.querySelector('#cxOkBtn');
    var later = m.querySelector('#cxLaterBtn');
    if (ok) ok.addEventListener('click', function() { try { localStorage.setItem(SEEN_KEY, '1'); } catch(e) {} m.remove(); var b = document.getElementById('cxUpd'); if (b) b.remove(); });
    if (later) later.addEventListener('click', function() { try { sessionStorage.setItem('cx_upd_dismissed', '1'); } catch(e) {} m.remove(); var b = document.getElementById('cxUpd'); if (b) b.remove(); });
    m.addEventListener('click', function(e) { if (e.target.id === 'cxModal') m.remove(); });
  }

  function show() {
    if (localStorage.getItem(SEEN_KEY) === '1') return;
    if (sessionStorage.getItem('cx_upd_dismissed')) return;
    if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register') return;
    var standalone = isStandalone();
    var b = document.createElement('div');
    b.id = 'cxUpd';
    var titleText = standalone ? '✨ Neues CX-Icon!' : '✨ Neues CX-Icon verfügbar!';
    var subText = standalone ? 'Tippe für Anleitung' : 'Tippe um zu sehen wie';
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
