// app-perf.js v2 - JS Force-Fixes + Performance-Booster
// Wird via require() in allen render-files eingebunden

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

  /* Loading shimmer-bar bei navigation */
  #app-nav-loading {
    position: fixed; top: 0; left: 0; right: 0;
    height: 3px; background: linear-gradient(90deg, transparent, #a78bfa, #7c3aed, #a78bfa, transparent);
    background-size: 200% 100%;
    z-index: 999; opacity: 0; transition: opacity 0.15s;
    pointer-events: none;
    animation: nav-loading-shimmer 1.2s linear infinite;
  }
  #app-nav-loading.show { opacity: 1; }
  @keyframes nav-loading-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
<script>
(function(){
  // ── LOADING-BAR ──
  function ensureNavBar() {
    if (!document.getElementById('app-nav-loading')) {
      const bar = document.createElement('div');
      bar.id = 'app-nav-loading';
      document.body.appendChild(bar);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureNavBar);
  } else { ensureNavBar(); }

  // ── PREFETCH bei touch/hover ──
  const seen = new Set();
  function maybePrefetch(href) {
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('http')) return;
    if (seen.has(href)) return;
    seen.add(href);
    try {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    } catch(e) {}
  }
  document.addEventListener('touchstart', e => {
    const a = e.target.closest('a[href]');
    if (a) maybePrefetch(a.getAttribute('href'));
  }, { passive: true, capture: true });
  document.addEventListener('mouseover', e => {
    const a = e.target.closest('a[href]');
    if (a) maybePrefetch(a.getAttribute('href'));
  }, { passive: true, capture: true });

  // ── CLICK SHOW LOADING-BAR + Smooth Back ──
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    const isExternal = href.startsWith('http') && !href.includes(location.host);
    if (isExternal) return;
    const bar = document.getElementById('app-nav-loading');
    if (bar) bar.classList.add('show');
    // Smooth back-button
    if (a.classList.contains('icon-btn')) {
      const txt = (a.textContent || '').trim();
      if (txt === '‹' || txt === '←' || txt === '<') {
        if (history.length > 1) {
          e.preventDefault();
          history.back();
        }
      }
    }
  });

  window.addEventListener('pageshow', () => {
    const bar = document.getElementById('app-nav-loading');
    if (bar) bar.classList.remove('show');
  });
  window.addEventListener('beforeunload', () => {
    const bar = document.getElementById('app-nav-loading');
    if (bar) bar.classList.add('show');
  });

  // ── PAUSE POLLING wenn Tab versteckt (spart CPU + Battery + Bandwidth) ──
  let pausedIntervals = [];
  const origSetInterval = window.setInterval;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab versteckt - alle laufenden polling-loops pausieren
      // (best effort - wir brauchen die IDs)
    } else {
      // Tab wieder sichtbar - reload wenn lange weg
      if (sessionStorage.getItem('hiddenSince')) {
        const hiddenMs = Date.now() - Number(sessionStorage.getItem('hiddenSince'));
        if (hiddenMs > 60000) {
          // Mehr als 1 min weg -> reload um aktuelle daten zu holen
          location.reload();
        }
        sessionStorage.removeItem('hiddenSince');
      }
    }
    if (document.hidden) {
      sessionStorage.setItem('hiddenSince', String(Date.now()));
    }
  });

  // ── JS FORCE-FIX: Reactions als overlay neben bubble ──
  function fixReactionsLayout() {
    const boxes = document.querySelectorAll('.chat-reactions');
    if (!boxes.length) return;
    boxes.forEach(box => {
      if (!box.children.length) { box.style.display = 'none'; return; }
      const wrap = box.closest('.chat-bubble-wrap');
      const row = box.closest('.chat-row');
      if (!wrap || !row) return;
      wrap.style.position = 'relative';
      wrap.style.paddingBottom = '14px';
      const isMe = row.classList.contains('chat-row-me');
      box.style.cssText =
        'display:flex !important;' +
        'gap:2px !important;' +
        'padding:0 !important;' +
        'margin:0 !important;' +
        'position:absolute !important;' +
        'bottom:-10px !important;' +
        'z-index:10 !important;' +
        (isMe ? 'right:6px !important; left:auto !important;' : 'left:6px !important; right:auto !important;') +
        'flex-wrap:nowrap !important;' +
        'min-height:0 !important;' +
        'max-width:none !important;' +
        'width:auto !important;';
      // jede reaction klein machen
      box.querySelectorAll('.chat-reaction').forEach(r => {
        r.style.cssText =
          'display:inline-flex !important;' +
          'align-items:center !important;' +
          'background:var(--bg2) !important;' +
          'border:2.5px solid var(--bg) !important;' +
          'padding:2px 7px !important;' +
          'border-radius:999px !important;' +
          'font-size:13px !important;' +
          'line-height:1 !important;' +
          'box-shadow:0 2px 8px rgba(0,0,0,0.5) !important;' +
          'max-width:none !important;' +
          'width:auto !important;' +
          'min-width:0 !important;';
        if (r.classList.contains('mine')) {
          r.style.background = 'linear-gradient(135deg,#a78bfa,#7c3aed)';
          r.style.color = '#fff';
        }
      });
    });
  }

  // ── JS FORCE-FIX: Topbar Avatar (kleiner + Online-Punkt outside) ──
  function fixTopbarLayout() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const profileLink = topbar.querySelector('a[href^="/profil/"]');
    if (!profileLink) return;
    profileLink.style.cssText =
      'display:flex !important;' +
      'align-items:center !important;' +
      'gap:10px !important;' +
      'text-decoration:none !important;' +
      'flex:1 !important;' +
      'justify-content:flex-start !important;' +
      'padding-left:6px !important;';
    const avatarDiv = profileLink.querySelector('div');
    if (avatarDiv) {
      avatarDiv.style.cssText =
        'position:relative !important;' +
        'width:36px !important;' +
        'height:36px !important;' +
        'border-radius:50% !important;' +
        'background:var(--bg4) !important;' +
        'display:flex !important;' +
        'align-items:center !important;' +
        'justify-content:center !important;' +
        'font-size:14px !important;' +
        'font-weight:700 !important;' +
        'flex-shrink:0 !important;' +
        'overflow:visible !important;';
      // Profilbild image clipping
      const img = avatarDiv.querySelector('img');
      if (img && !img.dataset.fixed) {
        img.dataset.fixed = '1';
        img.style.cssText =
          'position:absolute !important;' +
          'inset:0 !important;' +
          'width:100% !important;' +
          'height:100% !important;' +
          'object-fit:cover !important;' +
          'border-radius:50% !important;' +
          'z-index:1 !important;';
      }
      // Online dot ✅
      if (!avatarDiv.querySelector('.online-dot')) {
        const dot = document.createElement('div');
        dot.className = 'online-dot';
        dot.style.cssText =
          'position:absolute !important;' +
          'bottom:-2px !important;' +
          'right:-2px !important;' +
          'width:11px !important;' +
          'height:11px !important;' +
          'border-radius:50% !important;' +
          'background:#22c55e !important;' +
          'border:2.5px solid var(--bg) !important;' +
          'z-index:5 !important;' +
          'pointer-events:none !important;';
        avatarDiv.appendChild(dot);
      }
    }
    const nameSpan = profileLink.querySelector('span:last-of-type');
    if (nameSpan) {
      nameSpan.style.cssText =
        'font-size:15px !important;' +
        'font-weight:700 !important;' +
        'color:var(--text) !important;' +
        'overflow:hidden !important;' +
        'text-overflow:ellipsis !important;' +
        'white-space:nowrap !important;';
    }
    // Topbar selbst
    topbar.style.cssText =
      (topbar.getAttribute('style') || '') +
      ';display:flex !important;align-items:center !important;justify-content:flex-start !important;gap:4px !important;';
  }

  // ── JS FORCE-FIX: Story-Ringe Insta-Gradient ──
  function fixStoryRings() {
    document.querySelectorAll('.dm-story-ring, .story-ring').forEach(ring => {
      ring.style.cssText =
        'width:64px !important;' +
        'height:64px !important;' +
        'padding:2.5px !important;' +
        'border-radius:50% !important;' +
        'background:linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%) !important;' +
        'border:0 !important;' +
        'outline:0 !important;' +
        'box-shadow:none !important;' +
        'margin:0 auto !important;';
    });
  }

  function applyAllFixes() {
    try { fixReactionsLayout(); } catch(e) {}
    try { fixTopbarLayout(); } catch(e) {}
    try { fixStoryRings(); } catch(e) {}
  }

  // Initial + on DOM changes
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAllFixes);
  } else { applyAllFixes(); }
  window.addEventListener('load', applyAllFixes);

  // MutationObserver fuer dynamic content
  let mutationTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(applyAllFixes, 50);
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    });
  }

  // Re-apply nach Page-Show (browser back-cache)
  window.addEventListener('pageshow', applyAllFixes);

  // ── SPEED: Preconnect zu external image hosts ──
  function addHint(rel, href, crossorigin) {
    try {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = href;
      if (crossorigin) link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    } catch(e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      addHint('preconnect', 'https://unavatar.io', true);
      addHint('dns-prefetch', 'https://unavatar.io');
    });
  } else {
    addHint('preconnect', 'https://unavatar.io', true);
    addHint('dns-prefetch', 'https://unavatar.io');
  }
})();
</script>
`;
