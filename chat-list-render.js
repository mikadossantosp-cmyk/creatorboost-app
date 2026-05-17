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
    const { myConvos = [], botData = {}, myUid = '', feedPreview = '', totalThreadUnread = 0, ladeBild = () => null, onlineUids, threadsList = [], threadLastRead = {}, crown = () => '', appChatPreview = null, appChatUnread = 0, appChatMembers = 0, pinnedStories = [] } = opts || {};
    const adminIds = (typeof opts.adminIds !== 'undefined') ? opts.adminIds : [];
    const isAdminUser = (Array.isArray(adminIds) ? adminIds : []).map(Number).includes(Number(myUid));
    const onlineSet = onlineUids instanceof Set ? onlineUids : (Array.isArray(onlineUids) ? new Set(onlineUids.map(String)) : new Set());
    const onlineArr = [...onlineSet];

    // Stories: nur gefolgte User mit Pinned Reel. Wenn keine pinnedStories übergeben → leer.
    const storiesArr = Array.isArray(pinnedStories) ? pinnedStories : [];

    const storiesHtml = storiesArr.map((item) => {
        const id = item.uid;
        const name = item.name || '?';
        const isOnline = onlineSet.has(String(id));
        const ringExtraClass = item.engaged ? ' pinned-engaged' : ' pinned-glow';
        let avatarInner = '<span class="sa-fb">' + esc(name.slice(0, 1)) + '</span>';
        if (item.avatar) avatarInner = '<img src="' + esc(item.avatar) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
        return '<button type="button" class="dm-story-item" onclick="openPinnedStory(\'' + esc(id) + '\')">' +
            '<div class="dm-story-ring' + (isOnline ? ' online' : '') + ringExtraClass + '"><div class="dm-story-avatar">' + avatarInner + '</div></div>' +
            '<div class="dm-story-name">' + esc(name.slice(0, 10)) + '</div>' +
            '</button>';
    }).join('');
    const pinnedStoriesJson = JSON.stringify(storiesArr).replace(/<\/(script)/gi, '<\\/$1');

    // Pinned-Row: App-Community-Chat (globale Gruppe für alle App-User).
    // Immer ganz oben sichtbar, unabhängig von DMs.
    const appChatPrev = appChatPreview ? smartPreview(appChatPreview) : 'Tippen, um mit allen App-Usern zu chatten…';
    const appChatPrevText = appChatPreview ? ((appChatPreview.name ? appChatPreview.name + ': ' : '') + appChatPrev) : appChatPrev;
    const appCommunityRow = '<a href="/nachrichten/app-chat" class="dm-row dm-pinned dm-app-community">' +
        '<div class="dm-avatar dm-app-community-avatar">🌍</div>' +
        '<div class="dm-content">' +
          '<div class="dm-name">App Community <span style="font-size:10px;color:#a78bfa;font-weight:700;background:rgba(167,139,250,0.12);padding:2px 7px;border-radius:99px;margin-left:6px">📌 Pinned</span></div>' +
          '<div class="dm-preview">' + esc(appChatPrevText.slice(0, 70)) + '</div>' +
        '</div>' +
        '<div class="dm-meta">' +
          (appChatMembers ? '<div class="dm-time">' + appChatMembers + ' 👥</div>' : '') +
          (appChatUnread > 0 ? '<div class="dm-badge">' + (appChatUnread > 99 ? '99+' : appChatUnread) + '</div>' : '') +
        '</div>' +
        '</a>';

    // Telegram-Group-Row entfernt — Threads sind aus der App komplett raus.

    // Smart preview: image, audio oder text
    function smartPreview(msg) {
        if (!msg) return 'Tippen zum Schreiben…';
        if (msg.image) return '📷 Foto';
        if (msg.audio) return '🎤 Sprachnachricht';
        const t = (msg.text||'').trim();
        if (!t) return 'Tippen zum Schreiben…';
        return t.slice(0, 64);
    }
    function timeBucket(ts) {
        if (!ts) return 'older';
        const now = Date.now();
        const diff = now - ts;
        if (diff < 86400000) return 'today';
        if (diff < 172800000) return 'yesterday';
        if (diff < 604800000) return 'week';
        return 'older';
    }

    function buildDmRow(c) {
        const ou = (botData.users || {})[c.otherUid] || {};
        const insta = ou.instagram;
        const pic = ladeBild(c.otherUid, 'profilepic');
        const isOwn = c.lastMsg && String(c.lastMsg.from) === String(myUid);
        const isRead = isOwn && c.lastMsg && c.lastMsg.read;
        const time = formatTime(c.lastMsg && c.lastMsg.timestamp);
        const previewRaw = smartPreview(c.lastMsg);
        const previewText = (isOwn && !c.lastMsg?.image && !c.lastMsg?.audio ? 'Du: ' : '') + previewRaw;
        const isOnline = onlineSet.has(String(c.otherUid));

        let avatarInner = '<span class="dm-avatar-fb">' + esc((c.otherName || '?').slice(0, 1)) + '</span>';
        if (pic) avatarInner = '<img src="/appbild/' + c.otherUid + '/profilepic" alt="" loading="lazy">';
        else if (insta) avatarInner = '<img src="https://unavatar.io/instagram/' + esc(insta) + '" alt="" loading="lazy">';

        const unreadClass = (c.unread > 0 ? ' unread' : '');
        const tickHtml = (isOwn && !c.unread) ? '<div class="dm-tick' + (isRead ? ' read' : '') + '">' + (isRead ? '✓✓' : '✓') + '</div>' : '';
        const badgeHtml = c.unread > 0 ? '<div class="dm-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</div>' : '';
        const previewHtml = (isOwn && !c.lastMsg?.image && !c.lastMsg?.audio)
            ? '<span class="dm-prev-mine">Du:</span> ' + esc(previewRaw)
            : esc(previewRaw);

        return '<a href="/nachrichten/' + c.otherUid + '" class="dm-row' + unreadClass + '" data-uid="' + c.otherUid + '" data-name="' + esc(c.otherName) + '" data-bucket="' + timeBucket(c.lastMsg && c.lastMsg.timestamp) + '" oncontextmenu="event.preventDefault(); dmCtxMenu(event,this)" ontouchstart="dmCtxStart(event,this)" ontouchend="dmCtxEnd()" ontouchmove="dmCtxEnd()">' +
            '<div class="dm-avatar' + (isOnline ? ' online' : '') + '">' + avatarInner + '</div>' +
            '<div class="dm-content">' +
                '<div class="dm-name">' + crown(c.otherUid) + esc(c.otherName) + '<span class="dm-pin-marker">📌</span></div>' +
                '<div class="dm-preview">' + previewHtml + '</div>' +
            '</div>' +
            '<div class="dm-meta">' +
                (time ? '<div class="dm-time">' + time + '</div>' : '') +
                badgeHtml +
                tickHtml +
            '</div>' +
        '</a>';
    }

    // Gruppieren nach Zeit-Buckets
    const buckets = { today: [], yesterday: [], week: [], older: [] };
    (myConvos || []).forEach(c => {
        const b = timeBucket(c.lastMsg && c.lastMsg.timestamp);
        buckets[b].push(c);
    });
    function bucketSection(label, arr) {
        if (!arr.length) return '';
        return '<div class="dm-section-h">' + label + '</div>' + arr.map(buildDmRow).join('');
    }
    const dmRows = bucketSection('Heute', buckets.today)
        + bucketSection('Gestern', buckets.yesterday)
        + bucketSection('Diese Woche', buckets.week)
        + bucketSection('Älter', buckets.older);

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
    const threadGradients = [
      'linear-gradient(135deg,#0088cc,#00c6ff)',
      'linear-gradient(135deg,#a78bfa,#7c3aed)',
      'linear-gradient(135deg,#f59e0b,#dc2743)',
      'linear-gradient(135deg,#22c55e,#0088cc)',
      'linear-gradient(135deg,#ec4899,#a78bfa)',
      'linear-gradient(135deg,#06b6d4,#22c55e)',
    ];
    function thrGradient(tid){let h=0;const s=String(tid);for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return threadGradients[h%threadGradients.length];}
    const threadsRows = (threadsList || []).map(t => {
        const tid = String(t.id);
        const lr = threadLastRead?.[tid] || 0;
        const thrMsgs = botData.threadMessages?.[tid] || [];
        const unread = thrMsgs.filter(m => (m.timestamp||0) > lr).length;
        const last = t.last_msg || thrMsgs[0];
        const lastTime = last?.timestamp ? formatTime(last.timestamp) : '';
        const lastTextRaw = last ? ((last.name?last.name+': ':'') + (last.text||'')) : 'Noch keine Nachrichten';
        const lastText = lastTextRaw.slice(0,55);
        const tName = t.name && t.name !== ('Thread '+tid) ? t.name : (tid === 'general' ? 'Allgemein' : t.name || 'Thread');
        // Member estimate aus unique authors
        const memberSet = new Set();
        thrMsgs.forEach(m => { if (m.uid || m.user_id || m.username) memberSet.add(String(m.uid||m.user_id||m.username)); });
        const memberCount = memberSet.size;
        const msgCount = thrMsgs.length || t.msg_count || 0;
        const isActive = last?.timestamp && (Date.now() - last.timestamp) < 3600000; // <1h
        const grad = tid === 'general' ? 'linear-gradient(135deg,#0088cc,#00c6ff)' : thrGradient(tid);
        const adminMenuBtn = isAdminUser ?
            '<button class="thr-menu-btn" onclick="event.preventDefault();event.stopPropagation();showThreadActions(\'' + tid + '\',\'' + esc(tName).replace(/\'/g,"\\'") + '\',\'' + pickThrEmoji(t).replace(/\'/g,"\\'") + '\')" aria-label="Thread-Optionen"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>' : '';
        return '<div class="dm-row thread-row' + (unread>0?' unread':'') + '" data-tid="' + tid + '" data-name="' + esc(tName).replace(/"/g,'&quot;') + '" data-emoji="' + pickThrEmoji(t).replace(/"/g,'&quot;') + '" data-href="/nachrichten/gruppe/' + encodeURIComponent(tid) + '" oncontextmenu="return false">' +
            '<div class="dm-avatar dm-tg" style="background:' + grad + ';font-size:26px">' + pickThrEmoji(t) +
              (isActive ? '<i class="thr-active-dot" title="Aktiv jetzt"></i>' : '') +
            '</div>' +
            '<div class="dm-content">' +
                '<div class="dm-name">' + esc(tName) + '</div>' +
                '<div class="dm-preview">' + esc(lastText) + '</div>' +
                '<div class="thr-meta-row">' +
                    (memberCount ? '<span class="thr-chip">👥 ' + memberCount + '</span>' : '') +
                    (msgCount ? '<span class="thr-chip">💬 ' + msgCount + '</span>' : '') +
                    (isActive ? '<span class="thr-chip thr-chip-live">● Aktiv</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="dm-meta">' +
                (lastTime ? '<div class="dm-time">' + lastTime + '</div>' : '') +
                (unread > 0 ? '<div class="dm-badge dm-tg-badge">' + (unread>99?'99+':unread) + '</div>' : '') +
            '</div>' +
            adminMenuBtn +
        '</div>';
    }).join('');

    return onlineFlag + appPerf + '<style>' +
        '* { -webkit-tap-highlight-color: transparent; }' +
        '.dm-tabs { display: flex; gap: 8px; padding: 8px 16px 10px; background: var(--bg); position: sticky; top: 56px; z-index: 4; border-bottom: 1px solid var(--border2); }' +
        '.dm-tab { flex: 1; background: var(--surface-tint); border: 1px solid var(--border2); color: var(--muted); font-size: 13px; font-weight: 700; padding: 9px 6px; cursor: pointer; border-radius: 999px; transition: background 0.18s, color 0.18s, transform 0.12s; display: flex; align-items: center; justify-content: center; gap: 6px; letter-spacing: 0.1px; }' +
        '.dm-tab:active { transform: scale(0.97); }' +
        '.dm-tab.active { color: var(--bg); background: var(--text); border-color: var(--text); }' +
        '.dm-tab .dm-tab-count { background: rgba(167,139,250,0.18); color: #a78bfa; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 800; min-width: 18px; text-align: center; }' +
        '.dm-tab.active .dm-tab-count { background: rgba(255,255,255,0.22); color: #fff; }' +
        '.dm-fab { position: fixed; right: 18px; bottom: 88px; width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg,#a78bfa,#7c3aed); color: #fff; border: none; box-shadow: 0 12px 30px rgba(124,58,237,0.45); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 50; transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }' +
        '.dm-fab:active { transform: scale(0.9); }' +
        '.dm-fab svg { width: 22px; height: 22px; }' +
        '.dm-search-wrap { padding: 10px 16px 12px; position: sticky; top: 0; background: var(--bg); z-index: 5; border-bottom: 1px solid var(--border2); }' +
        '.dm-search-input { width: 100%; box-sizing: border-box; background: var(--surface-tint); border: 1.5px solid var(--border2); border-radius: 22px; padding: 10px 14px 10px 38px; color: var(--text); font-size: 14px; outline: none; font-family: var(--font); font-weight: 500; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s; background-image: url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2.5\' stroke-linecap=\'round\'><circle cx=\'11\' cy=\'11\' r=\'8\'/><path d=\'M21 21l-4.35-4.35\'/></svg>"); background-repeat: no-repeat; background-position: 14px center; }' +
        '.dm-search-input:focus { border-color: rgba(167,139,250,0.5); box-shadow: 0 0 0 4px rgba(167,139,250,0.10); }' +
        '.dm-search-results { padding: 4px 0; }' +
        '.dm-search-results:empty { display: none; }' +
        '.dm-stories-section { padding: 14px 0 14px; border-bottom: 1px solid var(--border2); background: var(--bg); }' +
        '.dm-stories-section .dm-stories-wrap { display: flex !important; gap: 16px !important; overflow-x: auto !important; padding: 0 16px !important; scrollbar-width: none !important; -webkit-overflow-scrolling: touch !important; }' +
        '.dm-stories-section .dm-stories-wrap::-webkit-scrollbar { display: none !important; }' +
        '.dm-stories-section .dm-story-item { flex-shrink: 0 !important; text-align: center !important; text-decoration: none !important; color: inherit !important; min-width: 68px !important; transition: transform 0.15s !important; outline: none !important; position: relative; }' +
        '.dm-stories-section .dm-story-item:active { transform: scale(0.93) !important; }' +
        '.dm-stories-section .dm-story-item { background: none !important; border: none !important; padding: 0 !important; font-family: inherit !important; cursor: pointer !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring { width: 64px !important; height: 64px !important; padding: 2.5px !important; border-radius: 50% !important; background: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%) !important; margin: 0 auto !important; border: 0 !important; outline: 0 !important; box-shadow: none !important; position: relative; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring.pinned-glow { background: linear-gradient(135deg,#f9a825,#e91e63,#9c27b0,#3b82f6) !important; background-size: 300% 300% !important; box-shadow: 0 4px 16px rgba(233,30,99,0.4) !important; animation: dmPinnedBlink 1.8s ease-in-out infinite; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring.pinned-engaged { background: linear-gradient(135deg,#9ca3af,#6b7280) !important; box-shadow: none !important; opacity: 0.55; }' +
        '@keyframes dmPinnedBlink { 0%,100% { background-position: 0% 50%; box-shadow: 0 4px 14px rgba(233,30,99,0.4); opacity: 1; } 50% { background-position: 100% 50%; box-shadow: 0 6px 22px rgba(233,30,99,0.75); opacity: 0.7; } }' +
        '.dm-stories-section .dm-story-item .dm-story-ring.online::after { content: "" !important; position: absolute !important; bottom: 0 !important; right: 0 !important; width: 14px !important; height: 14px !important; border-radius: 50% !important; background: #22c55e !important; border: 2.5px solid var(--bg) !important; z-index: 5 !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring .dm-story-avatar { width: 100% !important; height: 100% !important; border-radius: 50% !important; background: var(--bg) !important; padding: 2.5px !important; display: block !important; position: relative !important; overflow: hidden !important; box-sizing: border-box !important; border: 0 !important; outline: 0 !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring .dm-story-avatar > img { position: absolute !important; inset: 2.5px !important; width: calc(100% - 5px) !important; height: calc(100% - 5px) !important; border-radius: 50% !important; object-fit: cover !important; border: 0 !important; outline: 0 !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-ring .dm-story-avatar .sa-fb { position: absolute !important; inset: 2.5px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; font-weight: 800 !important; color: var(--avatar-fallback-color) !important; font-size: 22px !important; background: var(--avatar-fallback-bg) !important; }' +
        '.dm-stories-section .dm-story-item .dm-story-name { font-size: 11px !important; margin-top: 7px !important; color: var(--text) !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; max-width: 70px !important; font-weight: 600 !important; }' +
        '.dm-section-h { padding: 16px 16px 4px; font-size: 10.5px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 8px; }' +
        '.dm-section-h::after { content: ""; flex: 1; height: 1px; background: var(--border2); }' +
        '.dm-prev-mine { color: var(--muted2); font-weight: 700; }' +
        '.thread-row { padding: 14px 16px; cursor: pointer; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }' +
        '.thread-row .thr-menu-btn { background: var(--bg3); border: 1px solid var(--border2); color: var(--muted); width: 36px; height: 36px; border-radius: 50%; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0; transition: all 0.15s; margin-left: 4px; }' +
        '.thread-row .thr-menu-btn:active { transform: scale(0.9); background: var(--bg4); color: var(--text); }' +
        '.thread-row .dm-avatar { width: 56px; height: 56px; border-radius: 16px; box-shadow: 0 6px 18px rgba(15,23,42,0.10); }' +
        '.thread-row .dm-avatar.dm-tg { font-size: 26px; }' +
        '.thread-row .thr-active-dot { position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%; background: #22c55e; border: 2.5px solid var(--bg); box-shadow: 0 0 0 1px rgba(34,197,94,0.3); animation: thr-pulse 1.8s ease-in-out infinite; }' +
        '@keyframes thr-pulse { 0%,100% { box-shadow: 0 0 0 1px rgba(34,197,94,0.3); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }' +
        '.thr-meta-row { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }' +
        '.thr-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; background: var(--surface-tint); border: 1px solid var(--border2); border-radius: 999px; font-size: 10.5px; font-weight: 700; color: var(--muted); letter-spacing: 0.1px; }' +
        '.thr-chip-live { color: #22c55e; background: rgba(34,197,94,0.10); border-color: rgba(34,197,94,0.25); }' +
        '.dm-list { padding: 4px 0 90px; }' +
        '.dm-row { display: flex; align-items: center; gap: 13px; padding: 12px 16px; text-decoration: none; color: inherit; transition: background 0.15s; position: relative; }' +
        '.dm-row::after { content: ""; position: absolute; left: 84px; right: 0; bottom: 0; height: 1px; background: var(--border2); }' +
        '.dm-row:last-child::after { display: none; }' +
        '.dm-row:active { background: var(--surface-tint); }' +
        '.dm-row.unread .dm-name { font-weight: 800; color: var(--text); }' +
        '.dm-row.unread .dm-preview { color: var(--text); font-weight: 600; }' +
        '.dm-row.unread::before { content:""; position:absolute; left:6px; top:50%; transform:translateY(-50%); width:7px; height:7px; border-radius:50%; background:#a78bfa; box-shadow:0 0 8px rgba(167,139,250,0.5); }' +
        '.dm-pinned { background: linear-gradient(90deg, rgba(0,136,204,0.05), transparent 60%); }' +
        '.dm-app-community { background: linear-gradient(90deg, rgba(167,139,250,0.10), rgba(124,58,237,0.04) 60%); border-bottom: 1.5px solid rgba(167,139,250,0.2); }' +
        '.dm-app-community-avatar { background: linear-gradient(135deg,#a78bfa,#7c3aed); color: #fff; font-size: 22px; box-shadow: 0 6px 16px rgba(124,58,237,0.35); }' +
        '.dm-avatar { position: relative; width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0; background: var(--bg4); overflow: visible; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(15,23,42,0.06); }' +
        '.dm-avatar > img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }' +
        '.dm-avatar-fb { font-weight: 800; font-size: 22px; color: var(--avatar-fallback-color); background: var(--avatar-fallback-bg); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%; }' +
        '.dm-avatar.online::after { content: ""; position: absolute; bottom: 1px; right: 1px; width: 14px; height: 14px; border-radius: 50%; background: #22c55e; border: 2.5px solid var(--bg); z-index: 5; box-shadow: 0 0 0 1px rgba(34,197,94,0.25); }' +
        '.dm-tg { background: linear-gradient(135deg, #0088cc, #00c6ff); color: #fff; font-size: 26px; font-weight: 600; }' +
        '.dm-content { flex: 1; min-width: 0; }' +
        '.dm-name { font-size: 14.5px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; letter-spacing: -0.1px; }' +
        '.dm-pin-icon { font-size: 11px; opacity: 0.6; }' +
        '.dm-preview { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px; line-height: 1.3; font-weight: 500; }' +
        '.dm-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; min-width: 38px; }' +
        '.dm-time { font-size: 11.5px; color: var(--muted); font-weight: 600; letter-spacing: 0.1px; }' +
        '.dm-badge { background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; min-width: 20px; height: 20px; border-radius: 999px; font-size: 11px; font-weight: 800; padding: 0 6px; display: flex; align-items: center; justify-content: center; line-height: 1; box-shadow: 0 4px 10px rgba(124,58,237,0.3); }' +
        '.dm-tg-badge { background: linear-gradient(135deg, #0088cc, #00c6ff); box-shadow: 0 4px 10px rgba(0,136,204,0.3); }' +
        '.dm-tick { font-size: 13px; color: var(--muted); font-weight: 700; }' +
        '.dm-tick.read { color: #4dabf7; }' +
        '.dm-online-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); animation: pulse-dot 1.6s infinite; }' +
        '@keyframes pulse-dot { 0%,100% { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); } 50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); } }' +
        '.dm-row .dm-pin-marker { display: none; font-size: 11px; color: #a78bfa; margin-left: 4px; }' +
        '.dm-row.is-pinned .dm-pin-marker { display: inline-flex; align-items: center; gap: 2px; }' +
        '.dm-row.is-pinned { background: linear-gradient(90deg, rgba(167,139,250,0.06), transparent 60%); }' +
        '.dm-row.is-muted .dm-time::after { content: "🔕"; margin-left: 4px; opacity: 0.7; }' +
        '.dm-ctx-menu { position: fixed; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; padding: 6px; box-shadow: 0 16px 40px rgba(15,23,42,0.18); z-index: 200; min-width: 200px; backdrop-filter: blur(20px); display: none; animation: ctx-pop 0.18s ease; }' +
        '.dm-ctx-menu.show { display: block; }' +
        '@keyframes ctx-pop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }' +
        '.dm-ctx-menu .ctx-item { display: flex; align-items: center; gap: 10px; padding: 11px 14px; cursor: pointer; color: var(--text); font-size: 14px; border-radius: 10px; transition: background 0.12s; font-weight: 600; }' +
        '.dm-ctx-menu .ctx-item:hover, .dm-ctx-menu .ctx-item:active { background: rgba(167,139,250,0.10); }' +
        '.dm-ctx-menu .ctx-icon { font-size: 16px; width: 20px; text-align: center; }' +
        '.dm-empty { padding: 80px 28px; text-align: center; }' +
        '.dm-empty-icon { font-size: 56px; margin-bottom: 16px; opacity: 0.4; animation: empty-bounce 2s ease-in-out infinite; }' +
        '@keyframes empty-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }' +
        '.dm-empty-text { font-weight: 800; color: var(--text); margin-bottom: 6px; font-size: 15px; letter-spacing: -0.2px; }' +
        '.dm-empty-sub { font-size: 13px; color: var(--muted); line-height: 1.55; max-width: 240px; margin: 0 auto; font-weight: 500; }' +
        '</style>' +

        '<div class="dm-search-wrap">' +
            '<input type="text" class="dm-search-input" placeholder="Suche User..." oninput="dmSearch(this.value)" autocomplete="off">' +
            '<div id="dm-search-results" class="dm-search-results"></div>' +
        '</div>' +

        (storiesArr.length ? '<div class="dm-stories-section"><div class="dm-stories-wrap">' + storiesHtml + '</div></div>' : '') +
        (storiesArr.length ? '<div id="pinned-story-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:9999;align-items:flex-end;justify-content:center" onclick="if(event.target===this)closePinnedStory()"><div id="pinned-story-sheet" style="background:var(--bg2);width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:18px 16px 28px;max-height:88vh;overflow-y:auto"></div></div>' : '') +

        '<div class="dm-list" id="dm-list-chats">' +
            appCommunityRow +
            dmRows +
            emptyState +
        '</div>' +

        '<button class="dm-fab" onclick="dmFocusSearch()" title="Neue Nachricht" aria-label="Neue Nachricht">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M16 8l-3 3-1.5-1.5"/></svg>' +
        '</button>' +

        '<script>' +
            // ── Pinned-Story Modal (gleiche Logik wie im Feed) ──
            'window._pinnedStoriesData = ' + pinnedStoriesJson + ';' +
            'window.openPinnedStory = function(uid){' +
              'const s=(window._pinnedStoriesData||[]).find(x=>String(x.uid)===String(uid));' +
              'if(!s)return;' +
              'const m=document.getElementById("pinned-story-modal");const sh=document.getElementById("pinned-story-sheet");' +
              'if(!m||!sh)return;' +
              'const _esc=t=>String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;");' +
              'sh.innerHTML="<div style=\\"width:36px;height:4px;background:#666;border-radius:4px;margin:0 auto 14px\\"></div>"+' +
                '"<div style=\\"display:flex;align-items:center;gap:10px;margin-bottom:14px\\">"+' +
                  '"<a href=\\"/profil/"+_esc(s.uid)+"\\" style=\\"width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#7c3aed);overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;text-decoration:none\\">"+(s.avatar?"<img src=\\""+_esc(s.avatar)+"\\" style=\\"width:100%;height:100%;object-fit:cover\\" alt=\\"\\">":_esc((s.name||"?").slice(0,1)))+"</a>"+' +
                  '"<div style=\\"flex:1;min-width:0\\">"+' +
                    '"<a href=\\"/profil/"+_esc(s.uid)+"\\" style=\\"font-size:15px;font-weight:700;color:var(--text);text-decoration:none;display:block\\">"+_esc(s.name)+"</a>"+' +
                    '"<div style=\\"font-size:11px;color:#ec4899;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-top:1px\\">📌 Pinned Reel"+(s.engaged?" · Engagiert ✓":"")+"</div>"+' +
                  '"</div>"+' +
                  '"<button onclick=\\"closePinnedStory()\\" style=\\"background:var(--bg4);border:none;width:32px;height:32px;border-radius:50%;color:var(--text);font-size:18px;cursor:pointer;flex-shrink:0\\">×</button>"+' +
                '"</div>"+' +
                '(s.thumb?' +
                  '"<a href=\\"javascript:void(0)\\" onclick=\\"onPinVisitStory(\'"+_esc(s.uid)+"\')\\" style=\\"display:block;position:relative;width:100%;padding-top:62%;overflow:hidden;background:#000;border-radius:14px;margin-bottom:12px;text-decoration:none\\">"+' +
                    '"<img src=\\""+_esc(s.thumb)+"\\" referrerpolicy=\\"no-referrer\\" style=\\"position:absolute;inset:0;width:100%;height:100%;object-fit:cover\\" loading=\\"lazy\\" onerror=\\"this.style.display=\'none\'\\" alt=\\"\\">"+' +
                    '"<div style=\\"position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.05),rgba(0,0,0,.4));pointer-events:none\\"></div>"+' +
                    '"<div style=\\"position:absolute;inset:0;display:flex;align-items:center;justify-content:center\\"><div style=\\"width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center\\"><div style=\\"width:0;height:0;border-style:solid;border-width:11px 0 11px 20px;border-color:transparent transparent transparent #000;margin-left:4px\\"></div></div></div>"+' +
                  '"</a>"' +
                ':"<div style=\\"margin-bottom:12px;padding:30px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:14px;text-align:center;font-size:14px;color:rgba(255,255,255,.6)\\">📸 Instagram Reel</div>")+' +
                '(s.isOwn?' +
                  '"<div style=\\"padding:12px 14px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.25);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.5\\">👤 Das ist dein eigener Pinned Reel.</div>"' +
                ':"<div style=\\"display:flex;gap:8px;margin-bottom:10px\\"><a href=\\"javascript:void(0)\\" onclick=\\"onPinVisitStory(\'"+_esc(s.uid)+"\')\\" id=\\"pin-visit-link-story\\" style=\\"flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 12px;background:linear-gradient(135deg,#ec4899,#a855f7);color:#fff;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none\\">📸 Auf Instagram öffnen</a>"+' +
                  '(s.engaged?"<button disabled style=\\"flex:1;padding:11px 12px;border-radius:10px;border:1px solid #22c55e;background:rgba(34,197,94,.12);color:#22c55e;font-size:13px;font-weight:700;font-family:inherit;cursor:default\\">✅ Engagiert</button>":"<button onclick=\\"pinnedEngageClick(\'"+_esc(s.uid)+"\',this)\\" id=\\"pin-engage-btn-story\\" disabled data-locked=\\"1\\" style=\\"flex:1;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,107,107,.35);background:rgba(255,107,107,.10);color:#ff6b6b;font-size:13px;font-weight:700;font-family:inherit;cursor:not-allowed;opacity:0.55\\">🔒 Erst Insta öffnen</button>")+' +
                  '"</div><div style=\\"padding:12px 14px;background:linear-gradient(135deg,rgba(34,197,94,.10),rgba(167,139,250,.06));border:1px solid rgba(34,197,94,.25);border-radius:12px;font-size:12.5px;color:var(--text);line-height:1.55\\"><div style=\\"font-weight:700;color:#22c55e;margin-bottom:4px\\">💎 +1 Diamant für Engagement</div><div style=\\"color:var(--muted)\\">Auf Instagram <b>LIKEN + KOMMENTIEREN + TEILEN + SPEICHERN</b> → komme zurück → tippe „Engagiert\\" → +1 💎 für dich.</div></div>");' +
              'm.style.display="flex";' +
            '};' +
            'window.closePinnedStory=function(){const m=document.getElementById("pinned-story-modal");if(m)m.style.display="none";};' +
            'window.onPinVisitStory=function(uid){' +
              'window["_pvisit_"+uid]=Date.now();' +
              'window.open("/pinned-redirect?uid="+encodeURIComponent(uid),"_blank","noopener,noreferrer");' +
              'setTimeout(()=>{const b=document.getElementById("pin-engage-btn-story");if(b&&!b.dataset.engaged){b.disabled=false;b.style.cursor="pointer";b.style.opacity="1";b.removeAttribute("data-locked");b.innerHTML="❤️ Engagiert · +1💎";}},1500);' +
            '};' +
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
            '}' +
            // Beim Öffnen immer mit "Chats" (privaten DMs) starten — kein localStorage-Restore.
            'try { localStorage.removeItem("dmTab"); } catch(e) {}' +
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
            // ── Thread-Row Navigation + Long-Press + Admin Menu ──
            '(function(){' +
              'let _trPress=null, _trDidLong=false, _trCard=null;' +
              'document.addEventListener("touchstart",e=>{const c=e.target.closest(".thread-row");if(!c)return;_trCard=c;_trDidLong=false;if(' + (isAdminUser ? 'true' : 'false') + '){_trPress=setTimeout(()=>{_trDidLong=true;if(navigator.vibrate)navigator.vibrate(40);showThreadActions(c.getAttribute("data-tid"),c.getAttribute("data-name")||"",c.getAttribute("data-emoji")||"");},480);}},{passive:true});' +
              'document.addEventListener("touchend",e=>{const c=e.target.closest(".thread-row");if(_trPress){clearTimeout(_trPress);_trPress=null;}if(c&&c===_trCard&&!_trDidLong&&!e.target.closest(".thr-menu-btn")){e.preventDefault();const h=c.getAttribute("data-href");if(h)location.href=h;}_trCard=null;});' +
              'document.addEventListener("touchmove",()=>{if(_trPress){clearTimeout(_trPress);_trPress=null;}});' +
              'document.addEventListener("click",e=>{const c=e.target.closest(".thread-row");if(c&&!("ontouchstart" in window)&&!e.target.closest(".thr-menu-btn")){const h=c.getAttribute("data-href");if(h)location.href=h;}});' +
              'document.addEventListener("contextmenu",e=>{if(e.target.closest(".thread-row"))e.preventDefault();},true);' +
            '})();' +
            // ── Admin: Thread anpassen / löschen (mit addEventListener — sauber escaped) ──
            `async function renameThread(tid,current){
              const name=prompt("Neuer Thread-Name:",current);
              if(!name||!name.trim())return;
              try{
                const r=await fetch("/api/rename-thread",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({thread_id:tid,name:name.trim()})});
                const data=await r.json();
                if(data.ok)location.reload();
                else alert(data.error||"Fehler beim Umbenennen");
              }catch(e){alert("Netzwerk-Fehler: "+e.message);}
            }
            async function saveThreadCustom(tid){
              const name=document.getElementById("thr-cust-name").value.trim();
              const emoji=document.getElementById("thr-cust-emoji").value.trim();
              if(!name&&!emoji){alert("Name oder Icon angeben");return;}
              try{
                const r=await fetch("/api/set-thread-meta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({thread_id:tid,name,emoji})});
                const data=await r.json();
                if(data.ok){document.getElementById("thr-cust-modal").remove();location.reload();}
                else alert(data.error||"Fehler beim Speichern");
              }catch(e){alert("Netzwerk-Fehler: "+e.message);}
            }
            async function deleteThread(tid,name){
              if(!confirm("Thread "+name+" wirklich aus der App verstecken?\\n(Auf Telegram bleibt er bestehen.)"))return;
              try{
                const r=await fetch("/api/hide-thread",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({thread_id:tid})});
                const data=await r.json();
                if(data.ok)location.reload();
                else alert(data.error||"Fehler");
              }catch(e){alert("Netzwerk-Fehler: "+e.message);}
            }
            function customizeThread(tid,currentName,currentEmoji){
              const old=document.getElementById("thr-cust-modal");if(old)old.remove();
              const m=document.createElement("div");
              m.id="thr-cust-modal";
              m.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:flex-end;justify-content:center";
              const palette=["💬","💡","❓","🗣️","📣","📈","📋","🛡️","📤","🎨","📢","🛍️","🏆","📸","🎥","🎵","🗳️","👋","🌟","🔥","⚡","🎯","🚀","📝","🎭","🧠","💎","🌈","🎮","🛠️","🎬","📱","📚","⭐","✨","👀","💼","🪄","📊","🎉"];
              const inner=document.createElement("div");
              inner.style.cssText="background:var(--bg2);border-radius:24px 24px 0 0;padding:22px 20px 30px;width:100%;max-width:480px;border-top:3px solid #0088cc";
              let html='<div style="width:36px;height:4px;background:#666;border-radius:4px;margin:0 auto 18px"></div><div style="font-size:16px;font-weight:800;text-align:center;margin-bottom:6px">Thread anpassen</div><div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:18px">Icon + Name</div><label style="font-size:12px;color:var(--muted);font-weight:600;display:block;margin-bottom:6px">Name</label><input type="text" id="thr-cust-name" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:11px 14px;font-size:14px;outline:none;margin-bottom:14px;box-sizing:border-box"><label style="font-size:12px;color:var(--muted);font-weight:600;display:block;margin-bottom:6px">Icon</label><input type="text" id="thr-cust-emoji" maxlength="6" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:11px 14px;font-size:18px;outline:none;margin-bottom:14px;text-align:center;box-sizing:border-box"><div id="thr-cust-palette" style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;max-height:180px;overflow-y:auto;background:var(--bg3);border-radius:12px;padding:10px;margin-bottom:18px"></div><div style="display:flex;gap:10px"><button id="thr-cust-cancel" style="flex:1;padding:13px;border-radius:12px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:14px;font-weight:600;cursor:pointer">Abbrechen</button><button id="thr-cust-save" style="flex:1;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#0088cc,#00c6ff);color:#fff;font-size:14px;font-weight:800;cursor:pointer">Speichern</button></div>';
              inner.innerHTML=html;
              m.appendChild(inner);
              document.body.appendChild(m);
              document.getElementById("thr-cust-name").value=currentName||"";
              document.getElementById("thr-cust-emoji").value=currentEmoji||"";
              const pal=document.getElementById("thr-cust-palette");
              palette.forEach(e=>{const b=document.createElement("button");b.type="button";b.textContent=e;b.style.cssText="background:var(--bg2);border:1px solid var(--border2);border-radius:10px;font-size:22px;padding:8px;cursor:pointer";b.onclick=()=>{document.getElementById("thr-cust-emoji").value=e;};pal.appendChild(b);});
              document.getElementById("thr-cust-cancel").onclick=()=>m.remove();
              document.getElementById("thr-cust-save").onclick=()=>saveThreadCustom(tid);
            }
            function showThreadActions(tid,currentName,currentEmoji){
              const old=document.getElementById("thr-actions-modal");if(old)old.remove();
              const m=document.createElement("div");
              m.id="thr-actions-modal";
              m.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:flex-end;justify-content:center";
              m.addEventListener("click",e=>{if(e.target===m)m.remove();});
              const inner=document.createElement("div");
              inner.style.cssText="background:var(--bg2);border-radius:24px 24px 0 0;padding:18px 16px 30px;width:100%;max-width:480px";
              const titleDiv=document.createElement("div");
              titleDiv.style.cssText="font-size:14px;font-weight:700;text-align:center;color:var(--muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px";
              titleDiv.textContent=(currentEmoji||"")+" "+(currentName||"");
              const grip=document.createElement("div");
              grip.style.cssText="width:36px;height:4px;background:#666;border-radius:4px;margin:0 auto 14px";
              inner.appendChild(grip);
              inner.appendChild(titleDiv);
              const mkBtn=(label,bg,color,fontWeight,handler)=>{
                const b=document.createElement("button");
                b.style.cssText="width:100%;padding:16px;border-radius:14px;border:none;background:"+bg+";color:"+color+";font-size:15px;font-weight:"+fontWeight+";cursor:pointer;margin-bottom:8px;text-align:left;display:flex;align-items:center;gap:14px";
                b.innerHTML=label;
                b.onclick=()=>{m.remove();handler();};
                return b;
              };
              inner.appendChild(mkBtn("✏️ Umbenennen","var(--bg3)","var(--text)","600",()=>renameThread(tid,currentName)));
              inner.appendChild(mkBtn("😀 Symbol ändern","var(--bg3)","var(--text)","600",()=>customizeThread(tid,currentName,currentEmoji)));
              inner.appendChild(mkBtn("🗑️ Löschen (verstecken)","rgba(239,68,68,0.12)","#ef4444","700",()=>deleteThread(tid,currentName)));
              const cancelBtn=document.createElement("button");
              cancelBtn.textContent="Abbrechen";
              cancelBtn.style.cssText="width:100%;padding:13px;border-radius:14px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:14px;font-weight:600;cursor:pointer;margin-top:10px";
              cancelBtn.onclick=()=>m.remove();
              inner.appendChild(cancelBtn);
              m.appendChild(inner);
              document.body.appendChild(m);
            }` +
        '<\/script>';
};
