// banner-html.js - Update-Banner mit 1-Klick auto-update (caches+SW clear+reload)

module.exports = `<!--cx-update-banner-v14--><style>
#cxUpd { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13.5px; font-weight: 600; box-shadow: 0 4px 16px rgba(124,58,237,0.4); animation: cxUpdSlide 0.4s cubic-bezier(0.34,1.56,0.64,1); cursor: pointer; }
@keyframes cxUpdSlide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
#cxUpd .ico { width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0; background: rgba(255,255,255,0.15); overflow: hidden; }
#cxUpd .ico img { width: 100%; height: 100%; object-fit: cover; }
#cxUpd .txt { flex: 1; line-height: 1.3; }
#cxUpd .ttl { font-weight: 800; font-size: 14px; }
#cxUpd .sub { font-size: 11.5px; opacity: 0.9; margin-top: 2px; }
#cxUpd .x { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.2); border: none; color: #fff; font-size: 18px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
#cxUpd .x:active { transform: scale(0.85); background: rgba(255,255,255,0.3); }
#cxUpd.loading { pointer-events: none; opacity: 0.85; }
#cxUpd.loading::after { content: ""; position: absolute; bottom: 0; left: 0; height: 3px; background: #fff; animation: cxUpdLoad 0.8s linear; }
@keyframes cxUpdLoad { from { width: 0; } to { width: 100%; } }
</style>
<script>
(function(){
  if (window.__cxUpdShown) return;
  window.__cxUpdShown = true;
  var V = "v14";
  var KEY = "cx_upd_done_" + V;

  async function performUpdate(banner) {
    if (banner) {
      banner.classList.add("loading");
      var ttl = banner.querySelector(".ttl");
      var sub = banner.querySelector(".sub");
      if (ttl) ttl.textContent = "✨ Aktualisiere App...";
      if (sub) sub.textContent = "Cache wird geleert + Neustart";
    }
    try {
      // 1. Service Worker unregistrieren (force fresh)
      if ("serviceWorker" in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        for (var i = 0; i < regs.length; i++) {
          await regs[i].unregister();
        }
      }
      // 2. Alle Caches loeschen
      if ("caches" in window) {
        var keys = await caches.keys();
        for (var j = 0; j < keys.length; j++) {
          await caches.delete(keys[j]);
        }
      }
      // 3. localStorage als 'done' markieren
      try { localStorage.setItem(KEY, "1"); } catch(e) {}
    } catch(err) {
      console.warn("[cx-update] cleanup error", err);
    }
    // 4. Hard-reload (mit cache bypass)
    setTimeout(function() {
      window.location.reload();
    }, 600);
  }

  function show() {
    if (localStorage.getItem(KEY) === "1") return;
    if (sessionStorage.getItem("cx_upd_dismissed")) return;
    if (location.pathname === "/" || location.pathname === "/login" || location.pathname === "/register") return;

    var b = document.createElement("div");
    b.id = "cxUpd";
    b.innerHTML = '<div class="ico"><img src="/icon.jpg?v=' + V + '" alt=""></div>' +
      '<div class="txt"><div class="ttl">✨ Neues App-Update!</div><div class="sub">Tippe um sofort zu aktualisieren</div></div>' +
      '<button class="x" type="button" aria-label="Schliessen">×</button>';

    var btn = b.querySelector(".x");
    if (btn) btn.addEventListener("click", function(e) {
      e.stopPropagation();
      sessionStorage.setItem("cx_upd_dismissed", "1");
      b.remove();
    });

    b.addEventListener("click", function(e) {
      if (e.target.classList && e.target.classList.contains("x")) return;
      performUpdate(b);
    });

    document.body.appendChild(b);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { setTimeout(show, 400); });
  } else {
    setTimeout(show, 400);
  }
})();
<\/script>`;
