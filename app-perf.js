// app-perf.js v3 - JS-Fix nur fuer Topbar + Stories, Reactions via CSS

module.exports = `
<style>
  @view-transition { navigation: auto; }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.18s; }
  * { -webkit-tap-highlight-color: transparent; }
  html { scroll-behavior: smooth; }
  img { content-visibility: auto; }
  .nav-item { transition: transform 0.15s, opacity 0.15s; }
  .nav-item:active { transform: scale(0.92); opacity: 0.7; }
  .icon-btn { transition: transform 0.12s, opacity 0.12s; cursor: pointer; }
  .icon-btn:active { transform: scale(0.85); opacity: 0.6; }
  a { transition: opacity 0.12s; }
  a:active { opacity: 0.65; }
  body { animation: page-fadein 0.18s ease-out; }
  @keyframes page-fadein { from { opacity: 0.6; } to { opacity: 1; } }
  #app-nav-loading { position: fixed; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, #a78bfa, #7c3aed, #a78bfa, transparent); background-size: 200% 100%; z-index: 999; opacity: 0; transition: opacity 0.15s; pointer-events: none; animation: nav-loading-shimmer 1.2s linear infinite; }
  #app-nav-loading.show { opacity: 1; }
  @keyframes nav-loading-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
<script>
(function(){
  function ensureNavBar() {
    if (!document.getElementById('app-nav-loading')) {
      const bar = document.createElement('div'); bar.id = 'app-nav-loading'; document.body.appendChild(bar);
    }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ensureNavBar); } else { ensureNavBar(); }

  const seen = new Set();
  function maybePrefetch(href) {
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('http')) return;
    if (seen.has(href)) return;
    seen.add(href);
    try { const link = document.createElement('link'); link.rel = 'prefetch'; link.href = href; document.head.appendChild(link); } catch(e) {}
  }
  document.addEventListener('touchstart', e => { const a = e.target.closest('a[href]'); if (a) maybePrefetch(a.getAttribute('href')); }, { passive: true, capture: true });
  document.addEventListener('mouseover', e => { const a = e.target.closest('a[href]'); if (a) maybePrefetch(a.getAttribute('href')); }, { passive: true, capture: true });

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    const isExternal = href.startsWith('http') && !href.includes(location.host);
    if (isExternal) return;
    const bar = document.getElementById('app-nav-loading');
    if (bar) bar.classList.add('show');
    if (a.classList.contains('icon-btn')) {
      const txt = (a.textContent || '').trim();
      if (txt === '‹' || txt === '←' || txt === '<') {
        if (history.length > 1) { e.preventDefault(); history.back(); }
      }
    }
  });

  window.addEventListener('pageshow', () => { const bar = document.getElementById('app-nav-loading'); if (bar) bar.classList.remove('show'); });
  window.addEventListener('beforeunload', () => { const bar = document.getElementById('app-nav-loading'); if (bar) bar.classList.add('show'); });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && sessionStorage.getItem('hiddenSince')) {
      const hiddenMs = Date.now() - Number(sessionStorage.getItem('hiddenSince'));
      sessionStorage.removeItem('hiddenSince');
      if (hiddenMs > 60000) location.reload();
    }
    if (document.hidden) sessionStorage.setItem('hiddenSince', String(Date.now()));
  });

  // ── JS-FIX: Topbar Avatar nur wenn .chat-detail-page klasse oder profile link existiert ──
  function fixTopbarLayout() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const profileLink = topbar.querySelector('a[href^="/profil/"]');
    if (!profileLink) return;
    if (profileLink.dataset.fixed === '1') return;
    profileLink.dataset.fixed = '1';
    profileLink.style.cssText = 'display:flex !important;align-items:center !important;gap:10px !important;text-decoration:none !important;flex:1 !important;justify-content:flex-start !important;padding-left:6px !important;';
    const avatarDiv = profileLink.querySelector('div');
    if (avatarDiv) {
      avatarDiv.style.cssText = 'position:relative !important;width:36px !important;height:36px !important;border-radius:50% !important;background:var(--bg4) !important;display:flex !important;align-items:center !important;justify-content:center !important;font-size:14px !important;font-weight:700 !important;flex-shrink:0 !important;overflow:visible !important;';
      const img = avatarDiv.querySelector('img');
      if (img) {
        img.style.cssText = 'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;object-fit:cover !important;border-radius:50% !important;z-index:1 !important;';
      }
      if (!avatarDiv.querySelector('.online-dot')) {
        const dot = document.createElement('div');
        dot.className = 'online-dot';
        dot.style.cssText = 'position:absolute !important;bottom:-2px !important;right:-2px !important;width:11px !important;height:11px !important;border-radius:50% !important;background:#22c55e !important;border:2.5px solid var(--bg) !important;z-index:5 !important;pointer-events:none !important;';
        avatarDiv.appendChild(dot);
      }
    }
    const nameSpan = profileLink.querySelector('span:last-of-type');
    if (nameSpan) {
      nameSpan.style.cssText = 'font-size:15px !important;font-weight:700 !important;color:var(--text) !important;overflow:hidden !important;text-overflow:ellipsis !important;white-space:nowrap !important;';
    }
  }

  function fixStoryRings() {
    document.querySelectorAll('.dm-story-ring, .story-ring').forEach(ring => {
      if (ring.dataset.fixed === '1') return;
      ring.dataset.fixed = '1';
      ring.style.cssText = 'width:64px !important;height:64px !important;padding:2.5px !important;border-radius:50% !important;background:linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%) !important;border:0 !important;outline:0 !important;box-shadow:none !important;margin:0 auto !important;';
    });
  }

  function applyAllFixes() {
    try { fixTopbarLayout(); } catch(e) {}
    try { fixStoryRings(); } catch(e) {}
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', applyAllFixes); } else { applyAllFixes(); }
  window.addEventListener('load', applyAllFixes);

  let mutationTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(applyAllFixes, 100);
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
  } else {
    document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true, attributes: false }));
  }
  window.addEventListener('pageshow', applyAllFixes);

  function addHint(rel, href, crossorigin) {
    try { const link = document.createElement('link'); link.rel = rel; link.href = href; if (crossorigin) link.crossOrigin = 'anonymous'; document.head.appendChild(link); } catch(e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { addHint('preconnect', 'https://unavatar.io', true); addHint('dns-prefetch', 'https://unavatar.io'); });
  } else { addHint('preconnect', 'https://unavatar.io', true); addHint('dns-prefetch', 'https://unavatar.io'); }
})();
</script>
`;
