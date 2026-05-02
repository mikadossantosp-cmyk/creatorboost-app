// banner-html.js v20 - MINIMAL: only floating install button, no banner, no modal

module.exports = `<!--cx-banner-v20--><style>
#cxInstall { position: fixed; bottom: 84px; right: 16px; z-index: 9998; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; padding: 14px 22px; border-radius: 999px; font-size: 14px; font-weight: 800; box-shadow: 0 8px 24px rgba(255,107,107,0.55); border: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; animation: cxIPop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes cxIPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#cxInstall .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: cxIPulse 1.5s infinite; }
@keyframes cxIPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
#cxHint { position: fixed; bottom: 144px; right: 16px; left: 16px; max-width: 320px; margin-left: auto; z-index: 9999; background: #1a1a1a; color: #fff; padding: 14px 16px; border-radius: 14px; font-size: 13px; line-height: 1.5; box-shadow: 0 12px 32px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); }
#cxHint b { color: #ff6b6b; }
#cxHint .x { float: right; cursor: pointer; opacity: 0.6; font-size: 16px; margin-left: 8px; }
</style>
<script>
(function(){
  if (window.__cxV20) return;
  window.__cxV20 = true;

  // Remove any leftover old banner from earlier versions
  ['cxUpd', 'cxModal'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.remove();
  });

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator && window.navigator.standalone === true);
  }

  if (isStandalone()) return; // bereits installiert -> nichts zeigen

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    var b = document.getElementById('cxInstall');
    if (b) b.remove();
    var h = document.getElementById('cxHint');
    if (h) h.remove();
  });

  function showHint(text) {
    var existing = document.getElementById('cxHint');
    if (existing) existing.remove();
    var h = document.createElement('div');
    h.id = 'cxHint';
    h.innerHTML = '<span class="x">✕</span>' + text;
    h.querySelector('.x').addEventListener('click', function(){ h.remove(); });
    document.body.appendChild(h);
    setTimeout(function(){ if (h.parentNode) h.remove(); }, 12000);
  }

  function mountButton() {
    if (document.getElementById('cxInstall')) return;
    if (!document.body) { setTimeout(mountButton, 100); return; }
    var btn = document.createElement('button');
    btn.id = 'cxInstall';
    btn.innerHTML = '<span class="dot"></span>📱 App installieren';
    btn.addEventListener('click', async function() {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          btn.remove();
        } catch(e) {}
        return;
      }
      // Fallback: Chrome hat beforeinstallprompt noch nicht gefeuert
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
      if (isIOS) {
        showHint('Auf iPhone: Tippe unten auf das <b>Teilen</b>-Symbol und wähle <b>Zum Home-Bildschirm</b>.');
      } else {
        showHint('Tippe oben rechts auf das <b>⋮ Menü</b> und wähle <b>App installieren</b> (oder <b>Zum Startbildschirm</b>).');
      }
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
})();
<\/script>`;
