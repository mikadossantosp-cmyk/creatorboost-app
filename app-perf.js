// app-perf.js v7 - Update-Banner v12 + Online-Status + Performance

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

  .topbar-online-status { font-size: 11px; color: #22c55e; font-weight: 600; margin-top: -2px; }
  .topbar-offline-status { font-size: 11px; color: var(--muted); font-weight: 500; margin-top: -2px; }

  #app-update-banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
    background: linear-gradient(135deg, #a78bfa, #7c3aed);
    color: #fff; padding: 12px 16px;
    display: none; align-items: center; gap: 12px;
    font-size: 13.5px; font-weight: 600;
    box-shadow: 0 4px 16px rgba(124,58,237,0.4);
    animation: banner-slide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  #app-update-banner.show { display: flex; }
  @keyframes banner-slide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
  #app-update-banner .upd-icon { width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  #app-update-banner .upd-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
  #app-update-banner .upd-text { flex: 1; min-width: 0; line-height: 1.3; }
  #app-update-banner .upd-title { font-weight: 800; font-size: 14px; }
  #app-update-banner .upd-sub { font-size: 11.5px; opacity: 0.9; margin-top: 2px; }
  #app-update-banner .upd-close { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.2); border: none; color: #fff; font-size: 18px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  #app-update-banner .upd-close:active { transform: scale(0.85); background: rgba(255,255,255,0.3); }

  #app-update-modal { position: fixed; inset: 0; z-index: 1001; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; padding: 20px; }
  #app-update-modal.show { display: flex; animation: modal-fade 0.2s ease-out; }
  @keyframes modal-fade { from { opacity: 0; } to { opacity: 1; } }
  #app-update-modal .upd-card { background: var(--bg2); border-radius: 24px; padding: 28px 24px; max-width: 380px; width: 100%; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 24px 48px rgba(0,0,0,0.6); animation: card-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes card-pop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  #app-update-modal .upd-card .upd-big-icon { width: 96px; height: 96px; border-radius: 22px; margin: 0 auto 16px; background: #000; overflow: hidden; box-shadow: 0 12px 32px rgba(124,58,237,0.4); }
  #app-update-modal .upd-card .upd-big-icon img { width: 100%; height: 100%; object-fit: cover; }
  #app-update-modal .upd-card h2 { font-size: 18px; margin: 0 0 8px; color: var(--text); font-weight: 800; }
  #app-update-modal .upd-card p { font-size: 13.5px; color: var(--muted); line-height: 1.5; margin: 0 0 18px; }
  #app-update-modal .upd-card ol { text-align: left; padding-left: 24px; color: var(--text); font-size: 13px; line-height: 1.7; margin: 0 0 18px; }
  #app-update-modal .upd-card ol li { margin-bottom: 4px; }
  #app-update-modal .upd-card .upd-actions { display: flex; gap: 10px; }
  #app-update-modal .upd-card button { flex: 1; padding: 12px; border: none; border-radius: 14px; font-size: 14px; font-weight: 700; cursor: pointer; transition: transform 0.15s; }
  #app-update-modal .upd-card button:active { transform: scale(0.95); }
  #app-update-modal .upd-card .upd-btn-primary { background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; }
  #app-update-modal .upd-card .upd-btn-secondary { background: rgba(255,255,255,0.08); color: var(--text); }
</style>
<script>
(function(){
  if (window.__appPerfMounted) return;
  window.__appPerfMounted = true;

  function ensureNavBar() {
    if (!document.getElementById('app-nav-loading')) {
      const bar = document.createElement('div'); bar.id = 'app-nav-loading'; document.body.appendChild(bar);
    }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ensureNavBar); } else { ensureNavBar(); }

  const APP_VERSION = '12';
  const UPDATE_KEY = 'app_update_seen_v' + APP_VERSION;

  function showUpdateBanner() {
    if (sessionStorage.getItem('upd_dismissed_session')) return;
    if (localStorage.getItem(UPDATE_KEY) === '1') return;
    if (document.getElementById('app-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'app-update-banner';
    banner.innerHTML =
      '<div class="upd-icon"><img src="/icon.jpg?v=' + APP_VERSION + '" alt=""></div>' +
      '<div class="upd-text">' +
        '<div class="upd-title">✨ Neues App-Icon!</div>' +
        '<div class="upd-sub">Tippe um zu sehen wie du es bekommst</div>' +
      '</div>' +
      '<button class="upd-close" onclick="event.stopPropagation();sessionStorage.setItem(\'upd_dismissed_session\',\'1\');this.parentElement.remove();">×</button>';
    banner.onclick = (e) => {
      if (e.target.classList.contains('upd-close')) return;
      showUpdateModal();
    };
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));
  }

  function showUpdateModal() {
    if (document.getElementById('app-update-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'app-update-modal';
    modal.innerHTML =
      '<div class="upd-card">' +
        '<div class="upd-big-icon"><img src="/icon.jpg?v=' + APP_VERSION + '" alt=""></div>' +
        '<h2>Neues CX-Icon 👑</h2>' +
        '<p>Damit du das neue gold-silberne Icon auf deinem Home-Screen siehst:</p>' +
        '<ol>' +
          '<li>Browser/App-Tab schliessen</li>' +
          '<li>Browser-Cache leeren</li>' +
          '<li>App neu öffnen → "Zum Home-Screen hinzufügen"</li>' +
          '<li>Altes Icon vom Home-Screen löschen</li>' +
        '</ol>' +
        '<div class="upd-actions">' +
          '<button class="upd-btn-secondary" onclick="document.getElementById(\'app-update-modal\').remove();sessionStorage.setItem(\'upd_dismissed_session\',\'1\');document.getElementById(\'app-update-banner\') && document.getElementById(\'app-update-banner\').remove();">Später</button>' +
          '<button class="upd-btn-primary" onclick="localStorage.setItem(\'' + UPDATE_KEY + '\',\'1\');document.getElementById(\'app-update-modal\').remove();document.getElementById(\'app-update-banner\') && document.getElementById(\'app-update-banner\').remove();">Verstanden</button>' +
        '</div>' +
      '</div>';
    modal.onclick = (e) => { if (e.target.id === 'app-update-modal') modal.remove(); };
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  function maybeShowUpdate() {
    if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register') return;
    setTimeout(showUpdateBanner, 1500);
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', maybeShowUpdate); } else { maybeShowUpdate(); }

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

  function fixTopbarLayout() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const profileLink = topbar.querySelector('a[href^="/profil/"]');
    if (!profileLink) return;
    if (profileLink.dataset.fixed !== '1') {
      profileLink.dataset.fixed = '1';
      profileLink.style.cssText = 'display:flex !important;align-items:center !important;gap:10px !important;text-decoration:none !important;flex:1 !important;justify-content:flex-start !important;padding-left:6px !important;';
    }
    const avatarDiv = profileLink.querySelector('div');
    if (avatarDiv) {
      avatarDiv.style.cssText = 'position:relative !important;width:36px !important;height:36px !important;border-radius:50% !important;background:var(--bg4) !important;display:flex !important;align-items:center !important;justify-content:center !important;font-size:14px !important;font-weight:700 !important;flex-shrink:0 !important;overflow:visible !important;';
      const img = avatarDiv.querySelector('img');
      if (img) {
        img.style.cssText = 'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;object-fit:cover !important;border-radius:50% !important;z-index:1 !important;';
      }
      const isOnline = window.CHAT_OTHER_ONLINE === true;
      let dot = avatarDiv.querySelector('.online-dot');
      if (isOnline) {
        if (!dot) {
          dot = document.createElement('div');
          dot.className = 'online-dot';
          dot.style.cssText = 'position:absolute !important;bottom:-2px !important;right:-2px !important;width:11px !important;height:11px !important;border-radius:50% !important;background:#22c55e !important;border:2.5px solid var(--bg) !important;z-index:5 !important;pointer-events:none !important;';
          avatarDiv.appendChild(dot);
        }
      } else if (dot) { dot.remove(); }
    }
    const nameSpan = profileLink.querySelector('span:last-of-type');
    if (nameSpan && !nameSpan.dataset.wrapped) {
      nameSpan.dataset.wrapped = '1';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;min-width:0;';
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:15px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;';
      nameEl.textContent = nameSpan.textContent;
      const statusEl = document.createElement('div');
      statusEl.className = window.CHAT_OTHER_ONLINE === true ? 'topbar-online-status' : 'topbar-offline-status';
      statusEl.textContent = window.CHAT_OTHER_ONLINE === true ? '● Online' : 'Offline';
      statusEl.dataset.statusText = '1';
      wrap.appendChild(nameEl); wrap.appendChild(statusEl);
      nameSpan.replaceWith(wrap);
    } else {
      const existing = profileLink.querySelector('[data-status-text]');
      if (existing) {
        existing.className = window.CHAT_OTHER_ONLINE === true ? 'topbar-online-status' : 'topbar-offline-status';
        existing.textContent = window.CHAT_OTHER_ONLINE === true ? '● Online' : 'Offline';
      }
    }
  }

  function fixStoryRings() {
    document.querySelectorAll('.dm-story-ring, .story-ring').forEach(ring => {
      if (ring.dataset.fixed === '1') return;
      ring.dataset.fixed = '1';
      ring.style.cssText = 'width:64px !important;height:64px !important;padding:2.5px !important;border-radius:50% !important;background:linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%) !important;border:0 !important;outline:0 !important;box-shadow:none !important;margin:0 auto !important;';
    });
  }

  function fixDmListOnlineDots() {
    const onlineSet = window.DM_ONLINE_UIDS;
    if (!onlineSet || !Array.isArray(onlineSet)) return;
    const onlineUids = new Set(onlineSet.map(String));
    document.querySelectorAll('.dm-row[href^="/nachrichten/"]').forEach(row => {
      if (row.dataset.onlineFixed === '1') return;
      row.dataset.onlineFixed = '1';
      const href = row.getAttribute('href') || '';
      const m = href.match(/\\/nachrichten\\/([^/?#]+)/);
      if (!m) return;
      const uid = m[1];
      if (uid === 'gruppe') return;
      const avatar = row.querySelector('.dm-avatar');
      if (!avatar) return;
      if (onlineUids.has(uid)) avatar.classList.add('online'); else avatar.classList.remove('online');
    });
  }

  function applyAllFixes() {
    try { fixTopbarLayout(); } catch(e) {}
    try { fixStoryRings(); } catch(e) {}
    try { fixDmListOnlineDots(); } catch(e) {}
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
