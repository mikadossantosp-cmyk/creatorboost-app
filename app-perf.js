// app-perf.js - Performance + Smoothness + Loading-Skeleton

module.exports = `
<style>
  @view-transition { navigation: auto; }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.2s; }

  * { -webkit-tap-highlight-color: transparent; }
  html { scroll-behavior: smooth; }
  img { content-visibility: auto; }

  .nav-item { transition: transform 0.15s, opacity 0.15s; }
  .nav-item:active { transform: scale(0.92); opacity: 0.7; }

  .icon-btn { transition: transform 0.12s, opacity 0.12s; cursor: pointer; }
  .icon-btn:active { transform: scale(0.85); opacity: 0.6; }

  a { transition: opacity 0.12s; }
  a:active { opacity: 0.65; }

  body { animation: page-fadein 0.2s ease-out; }
  @keyframes page-fadein { from { opacity: 0.6; } to { opacity: 1; } }

  /* Loading-Skeleton overlay - erscheint sofort beim Tap auf einen Link */
  #app-nav-loading {
    position: fixed; top: 0; left: 0; right: 0;
    height: 3px; background: linear-gradient(90deg, transparent, #a78bfa, #7c3aed, #a78bfa, transparent);
    background-size: 200% 100%;
    z-index: 999;
    opacity: 0;
    transition: opacity 0.15s;
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
  // Loading-Bar erstellen
  if (!document.getElementById('app-nav-loading')) {
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.getElementById('app-nav-loading')) {
        const bar = document.createElement('div');
        bar.id = 'app-nav-loading';
        document.body.appendChild(bar);
      }
    });
  }

  // Touchstart-Prefetch fur navigation links
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

  // Show loading-bar bei navigation click
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    const isExternal = href.startsWith('http') && !href.includes(location.host);
    if (isExternal) return;
    const bar = document.getElementById('app-nav-loading');
    if (bar) bar.classList.add('show');
  });

  // Back-Button-Wrapping
  document.addEventListener('click', e => {
    const a = e.target.closest('.icon-btn[href]');
    if (!a) return;
    const txt = (a.textContent || '').trim();
    if (txt === '‹' || txt === '←' || txt === '<') {
      if (history.length > 1) {
        e.preventDefault();
        history.back();
      }
    }
  });

  // Hide loading-bar wenn page neu da ist
  window.addEventListener('pageshow', () => {
    const bar = document.getElementById('app-nav-loading');
    if (bar) bar.classList.remove('show');
  });
  window.addEventListener('beforeunload', () => {
    const bar = document.getElementById('app-nav-loading');
    if (bar) bar.classList.add('show');
  });
})();
</script>
`;
