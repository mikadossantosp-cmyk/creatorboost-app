// chat-list-render.js v6 - mit onlineUids fuer DM-Liste online-status

let appPerf = '';
try { appPerf = require('./app-perf'); } catch(e) {}

function formatTime(ts) {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return 'jetzt';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
        return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'gestern';
    const diffDays = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (diffDays < 7) return diffDays + 'd';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = function renderChatList(opts) {
    const { myConvos = [], botData = {}, myUid = '', feedPreview = '', totalThreadUnread = 0, ladeBild = () => null, onlineUids } = opts || {};
    const adminIds = (typeof opts.adminIds !== 'undefined') ? opts.adminIds : [];
    const onlineSet = onlineUids instanceof Set ? onlineUids : (Array.isArray(onlineUids) ? new Set(onlineUids.map(String)) : new Set());
    const onlineArr = [...onlineSet];

    let storiesArr = [];
    try {
        const users = botData.users || {};
        storiesArr = Object.entries(users)
            .filter(([id, u]) => {
                if (String(id) === String(myUid)) return false;
                if (Array.isArray(adminIds) && adminIds.includes(Number(id))) return false;
                if (!u || !u.started) return false;
                return true;
            })
            .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
            .slice(0, 14);
    } catch (e) { storiesArr = []; }

    const storiesHtml = storiesArr.map(([id, u]) => {
        const insta = u.instagram;
        const pic = ladeBild(id, 'profilepic');
        const name = u.spitzname || u.name || '?';
        const isOnline = onlineSet.has(String(id));
        let avatarInner = '<span class="sa-fb">' + esc(name.slice(0, 1)) + '</span>';
        if (pic) avatarInner = '<img src="/appbild/' + id + '/profilepic" alt="" loading="lazy">';
        else if (insta) avatarInner = '<img src="https://unavatar.io/instagram/' + esc(insta) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
        return '<a href="/profil/' + id + '" class="dm-story-item">' +
            '<div class="dm-story-ring' + (isOnline ? ' online' : '') + '"><div class="dm-story-avatar">' + avatarInner + '</div></div>' +
            '<div class="dm-story-name">' + esc(name.slice(0, 10)) + '</div>' +
            '</a>';
    }).join('');

    const telegramRow = '<a href="/nachrichten/gruppe" class="dm-row dm-pinned">' +
        '<div class="dm-avatar dm-tg">✈️</div>' +
        '<div class="dm-content">' +
          '<div class="dm-name">Telegram Gruppe <span class="dm-pin-icon">📌</span></div>' +
          '<div class="dm-preview">' + esc((feedPreview || 'Live Telegram Nachrichten').slice(0, 60)) + '</div>' +
        '</div>' +
        '<div class="dm-meta">' +
          '<div class="dm-online-dot" title="Live"></div>' +
          (totalThreadUnread > 0 ? '<div class="dm-badge dm-tg-badge">' + (totalThreadUnread > 9 ? '9+' : totalThreadUnread) + '</div>' : '') +
        '</div>' +
        '</a>';

    const dmRows = (myConvos || []).map(c => {
        const ou = (botData.users || {})[c.otherUid] || {};
        const insta = ou.instagram;
        const pic = ladeBild(c.otherUid, 'profilepic');
        const isOwn = c.lastMsg && String(c.lastMsg.from) === String(myUid);
        const isRead = isOwn && c.lastMsg && c.lastMsg.read;
        const time = formatTime(c.lastMsg && c.lastMsg.timestamp);
        const preview = (c.lastMsg && c.lastMsg.text) || '';
        const previewText = (isOwn ? 'Du: ' : '') + preview.slice(0, 50);
        const isOnline = onlineSet.has(String(c.otherUid));

        let avatarInner = '<span class="dm-avatar-fb">' + esc((c.otherName || '?').slice(0, 1)) + '</span>';
        if (pic) avatarInner = '<img src="/appbild/' + c.otherUid + '/profilepic" alt="" loading="lazy">';
        else if (insta) avatarInner = '<img src="https://unavatar.io/instagram/' + esc(insta) + '" alt="" loading="lazy">';

        const unreadClass = (c.unread > 0 ? ' unread' : '');
        const tickHtml = (isOwn && !c.unread) ? '<div class="dm-tick' + (isRead ? ' read' : '') + '">' + (isRead ? '✓✓' : '✓') + '</div>' : '';
        const badgeHtml = c.unread > 0 ? '<div class="dm-badge">' + c.unread + '</div>' : '';

        return '<a href="/nachrichten/' + c.otherUid + '" class="dm-row' + unreadClass + '">' +
            '<div class="dm-avatar' + (isOnline ? ' online' : '') + '">' + avatarInner + '</div>' +
            '<div class="dm-content">' +
                '<div class="dm-name">' + esc(c.otherName) + '</div>' +
                '<div class="dm-preview">' + esc(previewText) + '</div>' +
            '</div>' +
            '<div class="dm-meta">' +
                (time ? '<div class="dm-time">' + time + '</div>' : '') +
                badgeHtml +
                tickHtml +
            '</div>' +
        '</a>';
    }).join('');

    const emptyState = (!myConvos || !myConvos.length) ?
        '<div class="dm-empty">' +
            '<div class="dm-empty-icon">💬</div>' +
            '<div class="dm-empty-text">Noch keine Nachrichten</div>' +
            '<div class="dm-empty-sub">Tippe auf einen Kreis oben um eine DM zu starten</div>' +
        '</div>' : '';

    // Online-UIDs auch als window-Variable fuer JS-Zugriff
    const onlineFlag = '<script>window.DM_ONLINE_UIDS = ' + JSON.stringify(onlineArr) + ';<\/script>';

    return onlineFlag + appPerf + '<style>' +
        '* { -webkit-tap-highlight-color: transparent; }' +
        '.dm-search-wrap { padding: 10px 16px 12px; position: sticky; top: 0; background: var(--bg); z-index: 5; border-bottom: 0.5px solid rgba(255,255,255,0.05); }' +
        '.dm-search-input { width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.08); border-radius: 22px; padding: 9px 14px 9px 38px; color: var(--text); font-size: 14px; outline: none; transition: border-color 0.2s, background 0.2s; background-image: url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23999\' stroke-width=\'2.5\' stroke-linecap=\'round\'><circle cx=\'11\' cy=\'11\' r=\'8\'/><path d=\'M21 21l-4.35-4.35\'/></svg>"); background-repeat: no-repeat; background-position: 14px center; }' +
        '.dm-search-input:focus { border-color: rgba(167,139,250,0.4); background-color: rgba(255,255,255,0.08); }' +
        '.dm-search-results { padding: 4px 0; }' +
        '.dm-search-results:empty { display: none; }' +
        '.dm-stories-section { padding: 14px 0 12px; border-bottom: 0.5px solid rgba(255,255,255,0.08); }' +
        '.dm-stories-section .dm-stories-wrap { display: flex !important; gap: 16px !important; overflow-x: auto !important; padding: 0 16px !important; scrollbar-width: none !important; -webkit-overflow-scrolling: touch !important; }' +
        '.dm-stories-section .dm-stories-wrap::-webkit-scrollbar { display: none !important; }' +
        '.dm-stories-section .dm-story-item { flex-shrink: 0 !important; text-align: center !important; text-decoration: none !important; color: inherit !important; min-width: 68px !important; transition: transform 0.15s !important; outline: none !important; position: relative; }' +
        '.dm-stories-section .dm-story-item:active { transform: scale(0.93) !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring { width: 64px !important; height: 64px !important; padding: 2.5px !important; border-radius: 50% !important; background: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%) !important; margin: 0 auto !important; border: 0 !important; outline: 0 !important; box-shadow: none !important; position: relative; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring.online::after { content: "" !important; position: absolute !important; bottom: 0 !important; right: 0 !important; width: 14px !important; height: 14px !important; border-radius: 50% !important; background: #22c55e !important; border: 2.5px solid var(--bg) !important; z-index: 5 !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring .dm-story-avatar { width: 100% !important; height: 100% !important; border-radius: 50% !important; background: var(--bg) !important; padding: 2.5px !important; display: block !important; position: relative !important; overflow: hidden !important; box-sizing: border-box !important; border: 0 !important; outline: 0 !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring .dm-story-avatar > img { position: absolute !important; inset: 2.5px !important; width: calc(100% - 5px) !important; height: calc(100% - 5px) !important; border-radius: 50% !important; object-fit: cover !important; border: 0 !important; outline: 0 !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring .dm-story-avatar .sa-fb { position: absolute !important; inset: 2.5px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; font-weight: 800 !important; color: #fff !important; font-size: 22px !important; background: linear-gradient(135deg, #a78bfa, #7c3aed) !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-name { font-size: 11px !important; margin-top: 7px !important; color: var(--text) !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; max-width: 70px !important; font-weight: 500 !important; }' +
        '.dm-list { padding: 6px 0 90px; }' +
        '.dm-row { display: flex; align-items: center; gap: 13px; padding: 11px 16px; text-decoration: none; color: inherit; transition: background 0.15s; position: relative; }' +
        '.dm-row:active { background: rgba(255,255,255,0.04); }' +
        '.dm-row.unread .dm-name { font-weight: 800; color: var(--text); }' +
        '.dm-row.unread .dm-preview { color: var(--text); font-weight: 500; }' +
        '.dm-pinned { background: linear-gradient(90deg, rgba(0,136,204,0.04), transparent 70%); }' +
        '.dm-avatar { position: relative; width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0; background: var(--bg4); overflow: visible; display: flex; align-items: center; justify-content: center; }' +
        '.dm-avatar > img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }' +
        '.dm-avatar-fb { font-weight: 800; font-size: 22px; color: #fff; background: linear-gradient(135deg, #a78bfa, #7c3aed); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%; }' +
        '.dm-avatar.online::after { content: ""; position: absolute; bottom: 1px; right: 1px; width: 14px; height: 14px; border-radius: 50%; background: #22c55e; border: 2.5px solid var(--bg); z-index: 5; }' +
        '.dm-tg { background: linear-gradient(135deg, #0088cc, #00c6ff); color: #fff; font-size: 26px; font-weight: 600; }' +
        '.dm-content { flex: 1; min-width: 0; }' +
        '.dm-name { font-size: 14.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; }' +
        '.dm-pin-icon { font-size: 11px; opacity: 0.6; }' +
        '.dm-preview { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px; line-height: 1.3; }' +
        '.dm-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; min-width: 38px; }' +
        '.dm-time { font-size: 11px; color: var(--muted); }' +
        '.dm-badge { background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; min-width: 20px; height: 20px; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 0 6px; display: flex; align-items: center; justify-content: center; line-height: 1; }' +
        '.dm-tg-badge { background: linear-gradient(135deg, #0088cc, #00c6ff); }' +
        '.dm-tick { font-size: 13px; color: var(--muted); font-weight: 600; }' +
        '.dm-tick.read { color: #4dabf7; }' +
        '.dm-online-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); animation: pulse-dot 1.6s infinite; }' +
        '@keyframes pulse-dot { 0%,100% { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); } 50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); } }' +
        '.dm-empty { padding: 80px 28px; text-align: center; }' +
        '.dm-empty-icon { font-size: 56px; margin-bottom: 16px; opacity: 0.4; animation: empty-bounce 2s ease-in-out infinite; }' +
        '@keyframes empty-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }' +
        '.dm-empty-text { font-weight: 700; color: var(--text); margin-bottom: 6px; font-size: 15px; }' +
        '.dm-empty-sub { font-size: 13px; color: var(--muted); line-height: 1.5; max-width: 240px; margin: 0 auto; }' +
        '</style>' +

        '<div class="dm-search-wrap">' +
            '<input type="text" class="dm-search-input" placeholder="Suche User..." oninput="dmSearch(this.value)" autocomplete="off">' +
            '<div id="dm-search-results" class="dm-search-results"></div>' +
        '</div>' +

        (storiesArr.length ? '<div class="dm-stories-section"><div class="dm-stories-wrap">' + storiesHtml + '</div></div>' : '') +
        '<div class="dm-list" id="dm-list-main">' +
            telegramRow +
            dmRows +
            emptyState +
        '</div>' +

        '<script>' +
            'let dmSearchTimer = null;' +
            'function dmSearch(q) {' +
                'clearTimeout(dmSearchTimer);' +
                'const results = document.getElementById("dm-search-results");' +
                'const main = document.getElementById("dm-list-main");' +
                'const stories = document.querySelector(".dm-stories-section");' +
                'if (!q || !q.trim()) {' +
                    'results.innerHTML = "";' +
                    'main.style.display = "";' +
                    'if (stories) stories.style.display = "";' +
                    'return;' +
                '}' +
                'main.style.display = "none";' +
                'if (stories) stories.style.display = "none";' +
                'results.innerHTML = "<div style=\\"padding:40px 16px;text-align:center;color:var(--muted);font-size:13px\\">Suche...</div>";' +
                'dmSearchTimer = setTimeout(async () => {' +
                    'try {' +
                        'const r = await fetch("/api/search?q=" + encodeURIComponent(q));' +
                        'const data = await r.json();' +
                        'const users = (data.users || []).slice(0, 20);' +
                        'if (!users.length) {' +
                            'results.innerHTML = "<div style=\\"padding:40px 16px;text-align:center;color:var(--muted);font-size:13px\\">Niemand gefunden 😔</div>";' +
                            'return;' +
                        '}' +
                        'results.innerHTML = users.map(u => {' +
                            'const name = u.spitzname || u.name || "User";' +
                            'const initial = (name[0] || "?").toUpperCase();' +
                            'const avatar = u.pic ? "<img src=\\"" + u.pic + "\\" alt=\\"\\" loading=\\"lazy\\">" : "<span class=\\"dm-avatar-fb\\">" + initial + "</span>";' +
                            'return "<a href=\\"/nachrichten/" + u.id + "\\" class=\\"dm-row\\">" +' +
                                '"<div class=\\"dm-avatar\\">" + avatar + "</div>" +' +
                                '"<div class=\\"dm-content\\">" +' +
                                    '"<div class=\\"dm-name\\">" + name + "</div>" +' +
                                    '"<div class=\\"dm-preview\\">" + (u.role || "Nachricht senden") + " · " + (u.xp || 0) + " XP</div>" +' +
                                '"</div>" +' +
                            '"</a>";' +
                        '}).join("");' +
                    '} catch(e) {' +
                        'results.innerHTML = "<div style=\\"padding:40px 16px;text-align:center;color:var(--muted);font-size:13px\\">Fehler bei der Suche</div>";' +
                    '}' +
                '}, 250);' +
            '}' +
        '<\/script>';
};
