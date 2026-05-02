// app-perf.css - Globale Performance + Smoothness Styles
// Wird via require() in jeder Page eingefugt (durch patch-bot.js)

module.exports = `
<style>
  /* Smoothere Page-Transitions */
  @view-transition { navigation: auto; }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.18s; }

  /* Tap-Feedback ohne Highlight-Flash */
  * { -webkit-tap-highlight-color: transparent; }

  /* Smooth Scrolling */
  html { scroll-behavior: smooth; }

  /* Prevent layout shift */
  img { content-visibility: auto; }

  /* Bottom-Nav: smooth slide on press */
  .nav-item { transition: transform 0.15s, opacity 0.15s; }
  .nav-item:active { transform: scale(0.92); opacity: 0.7; }

  /* Topbar back-button: snappy press feedback */
  .icon-btn { transition: transform 0.12s, opacity 0.12s; cursor: pointer; }
  .icon-btn:active { transform: scale(0.85); opacity: 0.6; }

  /* Touch link smoothness */
  a { transition: opacity 0.12s; }
  a:active { opacity: 0.65; }

  /* Send-Button bouncy */
  .send-btn-active { animation: send-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes send-bounce { 0% { transform: scale(1); } 30% { transform: scale(0.85); } 100% { transform: scale(1); } }

  /* Optimistic message status */
  .chat-status.pending { color: var(--muted); animation: pending-pulse 1.4s ease-in-out infinite; }
  @keyframes pending-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

  /* Page-fade-in beim ersten paint */
  body { animation: page-fadein 0.22s ease-out; }
  @keyframes page-fadein { from { opacity: 0.7; } to { opacity: 1; } }
</style>
<script>
  // Touchstart-Prefetch fur navigation: link wird schon gefetcht beim Tap-Down
  (function(){
    const seen = new Set();
    document.addEventListener('touchstart', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      if (seen.has(href)) return;
      seen.add(href);
      try {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
      } catch(e) {}
    }, { passive: true, capture: true });
  })();

  // Back-Button-Wrapping fur alle topbar-back-links
  (function(){
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
  })();
</script>
`;
