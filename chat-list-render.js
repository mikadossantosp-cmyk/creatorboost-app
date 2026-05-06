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
    const { myConvos = [], botData = {}, myUid = '', feedPreview = '', totalThreadUnread = 0, ladeBild = () => null, onlineUids, threadsList = [], threadLastRead = {} } = opts || {};
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
        const badgeHtml = c.unread > 0 ? '<div class="dm-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</div>' : '';

        return '<a href="/nachrichten/' + c.otherUid + '" class="dm-row' + unreadClass + '" data-uid="' + c.otherUid + '" data-name="' + esc(c.otherName) + '" oncontextmenu="event.preventDefault(); dmCtxMenu(event,this)" ontouchstart="dmCtxStart(event,this)" ontouchend="dmCtxEnd()" ontouchmove="dmCtxEnd()">' +
            '<div class="dm-avatar' + (isOnline ? ' online' : '') + '">' + avatarInner + '</div>' +
            '<div class="dm-content">' +
                '<div class="dm-name">' + esc(c.otherName) + '<span class="dm-pin-marker">📌</span></div>' +
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

    const totalUnread = (myConvos || []).reduce((s,c) => s + (c.unread || 0), 0) + (totalThreadUnread || 0);

    const THR_EMOJI_PALETTE = ['🎯','🚀','💡','📊','🎨','🔥','⚡','🌟','📝','🎭','🏆','🎵','🧠','💎','🌈','🎮','📣','🛠️','🌍','🎬','📚','🍕','☕','🌙','🎁','🌊','⚽','🚴','🍀','✨','📷','🦄','🪐','🍎','🛸','🎪','🪄','🎲','🛹','🧭'];
    function isCustomEmoji(e){ return e && e.length >= 1 && e.length <= 4 && !/^\d+$/.test(e); }
    function thrEmojiFor(tid){let h=0;const s=String(tid);for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return THR_EMOJI_PALETTE[h%THR_EMOJI_PALETTE.length];}
    // Greedy: jeder Thread kriegt ein eindeutiges Emoji aus der Palette wenn möglich.
    // Erst Threads mit explizitem (renderbaren) Emoji einsetzen, dann den Rest aus der Palette füllen ohne Doppelung.
    const _thrUsed = new Set();
    const _thrEmojiMap = new Map();
    (threadsList || []).forEach(t => {
        const id = String(t.id);
        if (id === 'general') { _thrEmojiMap.set(id, '💬'); _thrUsed.add('💬'); return; }
        if (isCustomEmoji(t.emoji)) { _thrEmojiMap.set(id, t.emoji); _thrUsed.add(t.emoji); }
    });
    (threadsList || []).forEach(t => {
        const id = String(t.id);
        if (_thrEmojiMap.has(id)) return;
        // Hash als Start, dann lineares Probing um Kollisionen zu vermeiden
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
        let emoji = null;
        for (let i = 0; i < THR_EMOJI_PALETTE.length; i++) {
            const cand = THR_EMOJI_PALETTE[(h + i) % THR_EMOJI_PALETTE.length];
            if (!_thrUsed.has(cand)) { emoji = cand; break; }
        }
        if (!emoji) emoji = THR_EMOJI_PALETTE[h % THR_EMOJI_PALETTE.length]; // Palette voll: fallback mit Doppelung
        _thrEmojiMap.set(id, emoji);
        _thrUsed.add(emoji);
    });
    function pickThrEmoji(t){ return _thrEmojiMap.get(String(t.id)) || thrEmojiFor(t.id); }
    // Threads-Liste rendern (für Tab 2)
    const threadsRows = (threadsList || []).map(t => {
        const tid = String(t.id);
        const lr = threadLastRead?.[tid] || 0;
        const thrMsgs = botData.threadMessages?.[tid] || [];
        const unread = thrMsgs.filter(m => (m.timestamp||0) > lr).length;
        const last = t.last_msg || thrMsgs[0];
        const lastTime = last?.timestamp ? formatTime(last.timestamp) : '';
        const lastText = last ? ((last.name?last.name+': ':'') + (last.text||'').slice(0,50)) : 'Keine Nachrichten';
        const tName = t.name && t.name !== ('Thread '+tid) ? t.name : (tid === 'general' ? 'Allgemein' : t.name || 'Thread');
        return '<a href="/nachrichten/gruppe/' + encodeURIComponent(tid) + '" class="dm-row' + (unread>0?' unread':'') + '">' +
            '<div class="dm-avatar dm-tg" style="background:linear-gradient(135deg,#0088cc,#00c6ff);font-size:24px">' + pickThrEmoji(t) + '</div>' +
            '<div class="dm-content">' +
                '<div class="dm-name">' + esc(tName) + '</div>' +
                '<div class="dm-preview">' + esc(lastText) + '</div>' +
            '</div>' +
            '<div class="dm-meta">' +
                (lastTime ? '<div class="dm-time">' + lastTime + '</div>' : '') +
                (unread > 0 ? '<div class="dm-badge dm-tg-badge">' + (unread>99?'99+':unread) + '</div>' : '') +
            '</div>' +
        '</a>';
    }).join('');

    return onlineFlag + appPerf + '<style>' +
        '* { -webkit-tap-highlight-color: transparent; }' +
        '.dm-tabs { display: flex; gap: 0; padding: 0 16px 8px; border-bottom: 0.5px solid rgba(255,255,255,0.05); background: var(--bg); position: sticky; top: 56px; z-index: 4; }' +
        '.dm-tab { flex: 1; background: none; border: none; color: var(--muted); font-size: 13px; font-weight: 600; padding: 10px 6px; cursor: pointer; border-bottom: 2.5px solid transparent; transition: color 0.18s, border-color 0.18s; display: flex; align-items: center; justify-content: center; gap: 6px; }' +
        '.dm-tab.active { color: var(--text); border-bottom-color: #a78bfa; }' +
        '.dm-tab .dm-tab-count { background: rgba(167,139,250,0.18); color: #a78bfa; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 800; }' +
        '.dm-tab.active .dm-tab-count { background: #a78bfa; color: #fff; }' +
        '.dm-fab { position: fixed; right: 18px; bottom: 78px; width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg,#a78bfa,#7c3aed); color: #fff; border: none; box-shadow: 0 8px 24px rgba(124,58,237,0.5); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 50; transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }' +
        '.dm-fab:active { transform: scale(0.9); }' +
        '.dm-fab svg { width: 22px; height: 22px; }' +
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
        '.dm-row .dm-pin-marker { display: none; font-size: 11px; color: #a78bfa; margin-left: 4px; }' +
        '.dm-row.is-pinned .dm-pin-marker { display: inline-flex; align-items: center; gap: 2px; }' +
        '.dm-row.is-pinned { background: linear-gradient(90deg, rgba(167,139,250,0.05), transparent 60%); }' +
        '.dm-row.is-muted .dm-time::after { content: "🔕"; margin-left: 4px; opacity: 0.7; }' +
        '.dm-ctx-menu { position: fixed; background: var(--bg2); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 6px; box-shadow: 0 12px 36px rgba(0,0,0,0.5); z-index: 200; min-width: 200px; backdrop-filter: blur(20px); display: none; animation: ctx-pop 0.18s ease; }' +
        '.dm-ctx-menu.show { display: block; }' +
        '@keyframes ctx-pop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }' +
        '.dm-ctx-menu .ctx-item { display: flex; align-items: center; gap: 10px; padding: 11px 14px; cursor: pointer; color: var(--text); font-size: 14px; border-radius: 10px; transition: background 0.12s; }' +
        '.dm-ctx-menu .ctx-item:hover, .dm-ctx-menu .ctx-item:active { background: rgba(167,139,250,0.12); }' +
        '.dm-ctx-menu .ctx-icon { font-size: 16px; width: 20px; text-align: center; }' +
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

        '<div class="dm-tabs">' +
            '<button class="dm-tab active" data-tab="chats" onclick="dmSwitchTab(\'chats\')">💬 Chats' + ((myConvos||[]).reduce((s,c)=>s+(c.unread||0),0) > 0 ? ' <span class="dm-tab-count">' + Math.min(99,(myConvos||[]).reduce((s,c)=>s+(c.unread||0),0)) + '</span>' : '') + '</button>' +
            '<button class="dm-tab" data-tab="threads" onclick="dmSwitchTab(\'threads\')">✈️ Telegram-Treads' + (totalThreadUnread > 0 ? ' <span class="dm-tab-count">' + (totalThreadUnread > 99 ? '99+' : totalThreadUnread) + '</span>' : '') + '</button>' +
        '</div>' +

        '<div class="dm-list" id="dm-list-chats">' +
            dmRows +
            emptyState +
        '</div>' +

        '<div class="dm-list" id="dm-list-threads" style="display:none">' +
            (threadsRows || '<div class="dm-empty"><div class="dm-empty-icon">✈️</div><div class="dm-empty-text">Keine Telegram-Treads</div></div>') +
        '</div>' +

        '<button class="dm-fab" onclick="dmFocusSearch()" title="Neue Nachricht" aria-label="Neue Nachricht">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M16 8l-3 3-1.5-1.5"/></svg>' +
        '</button>' +

        '<script>' +
            'let dmSearchTimer = null;' +
            'function dmSearch(q) {' +
                'clearTimeout(dmSearchTimer);' +
                'const results = document.getElementById("dm-search-results");' +
                'const main = document.getElementById("dm-list-chats");' +
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
            'function dmFocusSearch(){' +
                'document.querySelector(".dm-search-input")?.focus();' +
                'window.scrollTo({top:0,behavior:"smooth"});' +
            '}' +
            'function dmSwitchTab(t){' +
                'document.querySelectorAll(".dm-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));' +
                'const c = document.getElementById("dm-list-chats");' +
                'const th = document.getElementById("dm-list-threads");' +
                'if (c) c.style.display = (t === "chats") ? "" : "none";' +
                'if (th) th.style.display = (t === "threads") ? "" : "none";' +
                'try { localStorage.setItem("dmTab", t); } catch(e) {}' +
            '}' +
            'try { const saved = localStorage.getItem("dmTab"); if (saved && (saved === "chats" || saved === "threads")) dmSwitchTab(saved); } catch(e) {}' +
            // ── Pin/Mute Settings (localStorage) ──
            'function dmGetSettings(){ try { return JSON.parse(localStorage.getItem("dmSettings")||"{}"); } catch(e) { return {}; } }' +
            'function dmSaveSettings(s){ try { localStorage.setItem("dmSettings", JSON.stringify(s)); } catch(e) {} }' +
            'function dmApplySettings(){' +
                'const s = dmGetSettings();' +
                'const list = document.getElementById("dm-list-chats"); if (!list) return;' +
                'document.querySelectorAll("#dm-list-chats .dm-row[data-uid]").forEach(r => {' +
                    'const uid = r.dataset.uid;' +
                    'r.classList.toggle("is-pinned", !!s[uid]?.pinned);' +
                    'r.classList.toggle("is-muted", !!s[uid]?.muted);' +
                '});' +
                // Sortierung: Pinned nach oben (nach dem Telegram-Pinned)
                'const pinned = [...list.querySelectorAll(".dm-row.is-pinned[data-uid]")];' +
                'pinned.forEach(p => { list.insertBefore(p, list.firstChild); });' +
            '}' +
            'dmApplySettings();' +
            // Long-Press Context Menu
            'let __dmPressTimer = null, __dmPressedRow = null, __dmCtxFired = false;' +
            // TouchEvents werden vom Browser recycled — Coords SOFORT capturen, nicht erst im setTimeout
            // (sonst e.touches ist [] beim Fire → TypeError).
            'function dmCtxStart(e, row){ __dmPressedRow = row; const t = e.touches&&e.touches[0]; const cx = t?t.clientX:0; const cy = t?t.clientY:0; __dmPressTimer = setTimeout(() => { __dmCtxFired = true; dmCtxMenu({clientX: cx, clientY: cy, preventDefault:()=>{}}, row); if (navigator.vibrate) navigator.vibrate(15); }, 480); }' +
            // Click-Suppression nach Long-Press: Browser feuert click NACH touchend → wir blocken den nächsten click einmal
            'document.addEventListener("click", function(e){ if (__dmCtxFired) { __dmCtxFired = false; e.preventDefault(); e.stopPropagation(); } }, true);' +
            'function dmCtxEnd(){ if (__dmPressTimer) { clearTimeout(__dmPressTimer); __dmPressTimer = null; } }' +
            'function dmCtxMenu(e, row){' +
                'e.preventDefault && e.preventDefault();' +
                'const uid = row.dataset.uid; const name = row.dataset.name || "";' +
                'const s = dmGetSettings(); const cur = s[uid] || {};' +
                'let menu = document.getElementById("dm-ctx-menu");' +
                'if (!menu) { menu = document.createElement("div"); menu.id = "dm-ctx-menu"; menu.className = "dm-ctx-menu"; document.body.appendChild(menu); }' +
                'menu.innerHTML = "" +' +
                    '"<div class=\\"ctx-item\\" onclick=\\"dmTogglePin(\\\""+uid+"\\\")\\"><span class=\\"ctx-icon\\">"+(cur.pinned?"📍":"📌")+"</span>"+(cur.pinned?"Pin entfernen":"Pin oben")+"</div>" +' +
                    '"<div class=\\"ctx-item\\" onclick=\\"dmToggleMute(\\\""+uid+"\\\")\\"><span class=\\"ctx-icon\\">"+(cur.muted?"🔔":"🔕")+"</span>"+(cur.muted?"Stummschalten aufheben":"Stummschalten")+"</div>" +' +
                    '"<div class=\\"ctx-item\\" onclick=\\"window.location=\\\"/profil/"+uid+"\\\"\\"><span class=\\"ctx-icon\\">👤</span>Profil ansehen</div>" +' +
                    '"<div class=\\"ctx-item\\" style=\\"color:#ef4444\\" onclick=\\"dmCtxClose()\\"><span class=\\"ctx-icon\\">✖</span>Schließen</div>";' +
                'menu.classList.add("show");' +
                'const W = window.innerWidth, H = window.innerHeight;' +
                'const mw = menu.offsetWidth || 220, mh = menu.offsetHeight || 200;' +
                'menu.style.left = Math.max(10, Math.min(W - mw - 10, e.clientX)) + "px";' +
                'menu.style.top = Math.max(10, Math.min(H - mh - 10, e.clientY)) + "px";' +
            '}' +
            'function dmCtxClose(){ document.getElementById("dm-ctx-menu")?.classList.remove("show"); }' +
            'document.addEventListener("click", e => { const m = document.getElementById("dm-ctx-menu"); if (m && !m.contains(e.target)) dmCtxClose(); });' +
            'function dmTogglePin(uid){ const s = dmGetSettings(); s[uid] = s[uid] || {}; s[uid].pinned = !s[uid].pinned; dmSaveSettings(s); dmCtxClose(); dmApplySettings(); }' +
            'function dmToggleMute(uid){ const s = dmGetSettings(); s[uid] = s[uid] || {}; s[uid].muted = !s[uid].muted; dmSaveSettings(s); dmCtxClose(); dmApplySettings(); }' +
        '<\/script>';
};
