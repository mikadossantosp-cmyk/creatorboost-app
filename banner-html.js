// banner-html.js - Inline Update-Banner HTML (template literal vermeidet escape-issues)

module.exports = `<!--cx-update-banner-v14--><style>
#cxUpd { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13.5px; font-weight: 600; box-shadow: 0 4px 16px rgba(124,58,237,0.4); animation: cxUpdSlide 0.4s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes cxUpdSlide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
#cxUpd .ico { width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0; background: rgba(255,255,255,0.15); overflow: hidden; }
#cxUpd .ico img { width: 100%; height: 100%; object-fit: cover; }
#cxUpd .txt { flex: 1; line-height: 1.3; }
#cxUpd .ttl { font-weight: 800; font-size: 14px; }
#cxUpd .sub { font-size: 11.5px; opacity: 0.9; margin-top: 2px; }
#cxUpd .x { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.2); border: none; color: #fff; font-size: 18px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
#cxUpd .x:active { transform: scale(0.85); background: rgba(255,255,255,0.3); }
#cxModal { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px; }
#cxModal .card { background: var(--bg2,#1a1a1a); border-radius: 24px; padding: 28px 24px; max-width: 380px; width: 100%; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 24px 48px rgba(0,0,0,0.6); }
#cxModal .big { width: 96px; height: 96px; border-radius: 22px; margin: 0 auto 16px; background: #000; overflow: hidden; box-shadow: 0 12px 32px rgba(124,58,237,0.4); }
#cxModal .big img { width: 100%; height: 100%; object-fit: cover; }
#cxModal h2 { font-size: 18px; margin: 0 0 8px; color: var(--text,#fff); font-weight: 800; }
#cxModal p { font-size: 13.5px; color: var(--muted,#999); line-height: 1.5; margin: 0 0 18px; }
#cxModal ol { text-align: left; padding-left: 24px; color: var(--text,#fff); font-size: 13px; line-height: 1.7; margin: 0 0 18px; }
#cxModal .acts { display: flex; gap: 10px; }
#cxModal button { flex: 1; padding: 12px; border: none; border-radius: 14px; font-size: 14px; font-weight: 700; cursor: pointer; }
#cxModal .p1 { background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; }
#cxModal .p2 { background: rgba(255,255,255,0.08); color: var(--text,#fff); }
</style>
<script>
(function(){
  if (window.__cxUpdShown) return;
  window.__cxUpdShown = true;
  var V = "v14";
  var KEY = "cx_upd_seen_" + V;

  function show() {
    if (localStorage.getItem(KEY) === "1") return;
    if (sessionStorage.getItem("cx_upd_dismissed")) return;
    if (location.pathname === "/" || location.pathname === "/login" || location.pathname === "/register") return;
    var b = document.createElement("div");
    b.id = "cxUpd";
    b.innerHTML = '<div class="ico"><img src="/icon.jpg?v=' + V + '" alt=""></div>' +
      '<div class="txt"><div class="ttl">✨ Neues App-Icon!</div><div class="sub">Tippe um zu sehen wie du es bekommst</div></div>' +
      '<button class="x" type="button">×</button>';
    var btn = b.querySelector(".x");
    if (btn) btn.addEventListener("click", function(e) {
      e.stopPropagation();
      sessionStorage.setItem("cx_upd_dismissed", "1");
      b.remove();
    });
    b.addEventListener("click", function(e) {
      if (e.target.classList && e.target.classList.contains("x")) return;
      showModal();
    });
    document.body.appendChild(b);
  }

  function showModal() {
    if (document.getElementById("cxModal")) return;
    var m = document.createElement("div");
    m.id = "cxModal";
    m.innerHTML = '<div class="card">' +
      '<div class="big"><img src="/icon.jpg?v=' + V + '" alt=""></div>' +
      '<h2>Neues CX-Icon 👑</h2>' +
      '<p>Damit du das neue gold-silberne Icon auf deinem Home-Screen siehst:</p>' +
      '<ol>' +
        '<li>Browser/App-Tab schliessen</li>' +
        '<li>Browser-Cache leeren</li>' +
        '<li>App neu öffnen → "Zum Home-Screen hinzufügen"</li>' +
        '<li>Altes Icon vom Home-Screen löschen</li>' +
      '</ol>' +
      '<div class="acts">' +
        '<button class="p2" type="button">Später</button>' +
        '<button class="p1" type="button">Verstanden</button>' +
      '</div>' +
    '</div>';
    var p1 = m.querySelector(".p1");
    var p2 = m.querySelector(".p2");
    if (p1) p1.addEventListener("click", function() {
      localStorage.setItem(KEY, "1");
      m.remove();
      var bn = document.getElementById("cxUpd");
      if (bn) bn.remove();
    });
    if (p2) p2.addEventListener("click", function() {
      sessionStorage.setItem("cx_upd_dismissed", "1");
      m.remove();
      var bn = document.getElementById("cxUpd");
      if (bn) bn.remove();
    });
    m.addEventListener("click", function(e) {
      if (e.target.id === "cxModal") m.remove();
    });
    document.body.appendChild(m);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { setTimeout(show, 500); });
  } else {
    setTimeout(show, 500);
  }
})();
<\/script>`;
