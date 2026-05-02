// Instagram DM Style Threads-Liste v3 - mit app-perf eingebunden

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
    const { myConvos = [], botData = {}, myUid = '', feedPreview = '', totalThreadUnread = 0, ladeBild = () => null } = opts || {};
    const adminIds = (typeof opts.adminIds !== 'undefined') ? opts.adminIds : [];

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
        let avatarInner = '<span class="sa-fb">' + esc(name.slice(0, 1)) + '</span>';
        if (pic) avatarInner = '<img src="/appbild/' + id + '/profilepic" alt="" loading="lazy">';
        else if (insta) avatarInner = '<img src="https://unavatar.io/instagram/' + esc(insta) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
        return '<a href="/profil/' + id + '" class="story-item">' +
            '<div class="story-ring"><div class="story-avatar">' + avatarInner + '</div></div>' +
            '<div class="story-name">' + esc(name.slice(0, 10)) + '</div>' +
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

        let avatarInner = '<span class="dm-avatar-fb">' + esc((c.otherName || '?').slice(0, 1)) + '</span>';
        if (pic) avatarInner = '<img src="/appbild/' + c.otherUid + '/profilepic" alt="" loading="lazy">';
        else if (insta) avatarInner = '<img src="https://unavatar.io/instagram/' + esc(insta) + '" alt="" loading="lazy">';

        const unreadClass = (c.unread > 0 ? ' unread' : '');
        const tickHtml = (isOwn && !c.unread) ? '<div class="dm-tick' + (isRead ? ' read' : '') + '">' + (isRead ? '✓✓' : '✓') + '</div>' : '';
        const badgeHtml = c.unread > 0 ? '<div class="dm-badge">' + c.unread + '</div>' : '';

        return '<a href="/nachrichten/' + c.otherUid + '" class="dm-row' + unreadClass + '">' +
            '<div class="dm-avatar">' + avatarInner + '</div>' +
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

    return appPerf + '<style>' +
        '* { -webkit-tap-highlight-color: transparent; }' +
        '.stories-section { padding: 16px 0 12px; border-bottom: 0.5px solid rgba(255,255,255,0.08); }' +
        '.stories-wrap { display: flex; gap: 16px; overflow-x: auto; padding: 0 16px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }' +
        '.stories-wrap::-webkit-scrollbar { display: none; }' +
        '.story-item { flex-shrink: 0; text-align: center; text-decoration: none; color: inherit; min-width: 68px; transition: transform 0.15s; }' +
        '.story-item:active { transform: scale(0.93); }' +
        '.story-ring { width: 64px; height: 64px; padding: 2.5px; border-radius: 50%; background: linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); margin: 0 auto; }' +
        '.story-avatar { width: 100%; height: 100%; border-radius: 50%; background: var(--bg); padding: 2.5px; display: block; position: relative; overflow: hidden; box-sizing: border-box; }' +
        '.story-avatar > img { position: absolute; inset: 2.5px; width: calc(100% - 5px); height: calc(100% - 5px); border-radius: 50%; object-fit: cover; }' +
        '.story-avatar .sa-fb { position: absolute; inset: 2.5px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff; font-size: 22px; background: linear-gradient(135deg, #a78bfa, #7c3aed); }' +
        '.story-name { font-size: 11px; margin-top: 7px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70px; font-weight: 500; }' +
        '.dm-list { padding: 6px 0 90px; }' +
        '.dm-row { display: flex; align-items: center; gap: 13px; padding: 11px 16px; text-decoration: none; color: inherit; transition: background 0.15s; position: relative; }' +
        '.dm-row:active { background: rgba(255,255,255,0.04); }' +
        '.dm-row.unread .dm-name { font-weight: 800; color: var(--text); }' +
        '.dm-row.unread .dm-preview { color: var(--text); font-weight: 500; }' +
        '.dm-pinned { background: linear-gradient(90deg, rgba(0,136,204,0.04), transparent 70%); }' +
        '.dm-avatar { position: relative; width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0; background: var(--bg4); overflow: hidden; display: flex; align-items: center; justify-content: center; }' +
        '.dm-avatar > img { width: 100%; height: 100%; object-fit: cover; }' +
        '.dm-avatar-fb { font-weight: 800; font-size: 22px; color: #fff; background: linear-gradient(135deg, #a78bfa, #7c3aed); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }' +
        '.dm-avatar.online::after { content: ""; position: absolute; bottom: 1px; right: 1px; width: 14px; height: 14px; border-radius: 50%; background: #22c55e; border: 2.5px solid var(--bg); }' +
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
        (storiesArr.length ? '<div class="stories-section"><div class="stories-wrap">' + storiesHtml + '</div></div>' : '') +
        '<div class="dm-list">' +
            telegramRow +
            dmRows +
            emptyState +
        '</div>';
};
