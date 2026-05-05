// Chat-Detail v9 - mit otherOnline Status

let appPerf = '';
try { appPerf = require('./app-perf'); } catch(e) {}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTimeOnly(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Heute';
    if (d.toDateString() === yesterday.toDateString()) return 'Gestern';
    const diff = Date.now() - ts;
    if (diff < 7 * 24 * 3600 * 1000) {
        return d.toLocaleDateString('de-DE', { weekday: 'long' });
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

module.exports = function renderChatBubbles(opts) {
    const { msgs = [], myUid = '', otherUid = '', otherUser = {}, ladeBild = () => null, otherOnline = false } = opts || {};

    // Online-Status als window-Variable einfuegen (vor allen anderen scripts)
    const onlineFlag = '<script>window.CHAT_OTHER_ONLINE = ' + (otherOnline ? 'true' : 'false') + ';<\/script>';

    if (!msgs.length) {
        return onlineFlag + appPerf + getStyles() + '<div class="chat-empty">' +
            '<div class="chat-empty-icon">👋</div>' +
            '<div class="chat-empty-text">Sag Hi!</div>' +
            '<div class="chat-empty-sub">Schreib die erste Nachricht und brich das Eis</div>' +
            '</div>' + getReactionPicker() + getScripts(myUid, otherUid);
    }

    const otherPic = ladeBild(otherUid, 'profilepic');
    const otherInsta = otherUser.instagram;
    const otherName = otherUser.spitzname || otherUser.name || 'User';
    const otherAvatarSrc = otherPic ? '/appbild/' + otherUid + '/profilepic' :
        (otherInsta ? 'https://unavatar.io/instagram/' + otherInsta : '');

    let html = '';
    let lastDate = null;
    let lastFrom = null;
    let lastTimestamp = 0;

    msgs.forEach((m, idx) => {
        const isMe = String(m.from) === String(myUid);
        const ts = m.timestamp || 0;
        const next = msgs[idx + 1];

        const thisDate = new Date(ts).toDateString();
        if (thisDate !== lastDate) {
            html += '<div class="chat-date-sep"><span>' + formatDateHeader(ts) + '</span></div>';
            lastDate = thisDate;
            lastFrom = null;
        }

        const sameSender = lastFrom === m.from && (ts - lastTimestamp) < 5 * 60 * 1000;
        const isLastFromSender = !next || String(next.from) !== String(m.from) || ((next.timestamp || 0) - ts) > 5 * 60 * 1000;

        // Reply-Quote oberhalb der Bubble (Instagram-Stil)
        let replyHtml = '';
        if (m.replyTo && (m.replyTo.text || m.replyTo.name)) {
            replyHtml = '<div class="chat-reply-quote" onclick="chatJumpToMsg(' + (m.replyTo.ts||0) + ')">' +
                '<div class="chat-reply-name">' + esc(m.replyTo.name||'?') + '</div>' +
                '<div class="chat-reply-text">' + esc((m.replyTo.text||'').slice(0,80)) + '</div>' +
                '</div>';
        }

        // Auto Link-Preview Helper
        const urlMatch = (m.text||'').match(/(https?:\/\/[^\s]+)/);
        const linkPreview = urlMatch ? (() => {
            try {
                const u = new URL(urlMatch[1]);
                let icon = '🔗';
                if (/instagram\.com/.test(u.hostname)) icon = '📸';
                else if (/youtube\.com|youtu\.be/.test(u.hostname)) icon = '▶️';
                else if (/tiktok\.com/.test(u.hostname)) icon = '🎵';
                else if (/twitter\.com|x\.com/.test(u.hostname)) icon = '🐦';
                else if (/facebook\.com/.test(u.hostname)) icon = '👥';
                return '<a href="' + esc(urlMatch[1]) + '" target="_blank" rel="noopener" class="chat-link-preview" onclick="event.stopPropagation()">' +
                    '<div class="clp-icon">' + icon + '</div>' +
                    '<div class="clp-info"><div class="clp-host">' + esc(u.hostname.replace(/^www\./,'')) + '</div><div class="clp-path">' + esc((u.pathname||'/').slice(0,40)) + '</div></div>' +
                    '</a>';
            } catch(e) { return ''; }
        })() : '';

        const editedTag = m.edited ? '<span class="chat-edited">bearbeitet</span>' : '';

        let bubbleContent = '';
        if (m.image) {
            bubbleContent = replyHtml + '<div class="chat-img-wrap" onclick="window.open(\'' + m.image + '\', \'_blank\')">' +
                '<img src="' + m.image + '" alt="" loading="lazy">' +
                (m.text ? '<div class="chat-img-caption">' + esc(m.text) + editedTag + '</div>' : '') +
                '</div>';
        } else if (m.audio) {
            bubbleContent = replyHtml + '<div class="chat-audio">' +
                '<button class="chat-audio-btn" onclick="toggleAudio(this)" data-src="' + m.audio + '">▶</button>' +
                '<div class="chat-audio-info"><div class="chat-audio-bar"><div class="audio-prog"></div></div><div class="audio-dur">🎤 Sprachnachricht</div></div>' +
                '</div>';
        } else {
            bubbleContent = replyHtml + '<div class="chat-text">' + esc(m.text || '') + editedTag + '</div>' + linkPreview;
        }

        let backendReactions = {};
        if (m.reactions && Object.keys(m.reactions).length > 0) {
            Object.values(m.reactions).forEach(emoji => { backendReactions[emoji] = (backendReactions[emoji] || 0) + 1; });
        }
        const reactionsHtml = '<div class="chat-reactions" data-ts="' + ts + '" data-backend="' + esc(JSON.stringify(backendReactions)) + '">' +
            Object.entries(backendReactions).map(([emo, n]) => '<span class="chat-reaction">' + emo + (n > 1 ? ' <b>' + n + '</b>' : '') + '</span>').join('') +
        '</div>';

        let statusHtml = '';
        if (isMe && isLastFromSender) {
            const isRead = m.read === true;
            statusHtml = '<div class="chat-status' + (isRead ? ' read' : '') + '">' +
                (isRead ? 'Gesehen' : 'Gesendet') + ' · ' + formatTimeOnly(ts) +
            '</div>';
        }

        const showAvatar = !isMe && isLastFromSender;
        const avatarHtml = showAvatar ?
            '<div class="chat-avatar-mini">' +
                (otherAvatarSrc ? '<img src="' + otherAvatarSrc + '" alt="" loading="lazy">' : '<span>' + esc(otherName.slice(0, 1)) + '</span>') +
            '</div>' : '<div class="chat-avatar-spacer"></div>';

        const groupClass = sameSender ? ' chat-row-grouped' : '';
        const lastClass = isLastFromSender ? ' chat-row-last' : '';

        html += '<div class="chat-row ' + (isMe ? 'chat-row-me' : 'chat-row-other') + groupClass + lastClass + '" data-ts="' + ts + '">' +
            (!isMe ? avatarHtml : '') +
            '<div class="chat-bubble-wrap">' +
                '<div class="chat-bubble" data-ts="' + ts + '" ' +
                    'ontouchstart="chatLongPress(event,this,' + ts + ')" ' +
                    'ontouchend="chatLongPressEnd()" ontouchmove="chatLongPressEnd()" ontouchcancel="chatLongPressEnd()" ' +
                    'onmousedown="chatLongPress(event,this,' + ts + ')" onmouseup="chatLongPressEnd()" onmouseleave="chatLongPressEnd()" ' +
                    'onclick="chatDoubleTap(event,this,' + ts + ')" oncontextmenu="event.preventDefault(); chatShowReactions(this,' + ts + ')">' +
                    bubbleContent +
                '</div>' +
                reactionsHtml +
                statusHtml +
            '</div>' +
        '</div>';

        lastFrom = m.from;
        lastTimestamp = ts;
    });

    return onlineFlag + appPerf + getStyles() + html + getReactionPicker() + getScripts(myUid, otherUid);
};

function getStyles() {
    return '<style>' +
        'html { scroll-behavior: smooth; }' +
        '#chat-msgs { padding: 16px 0 140px; display: flex; flex-direction: column; }' +
        '#msg-input.form-input { background: rgba(255,255,255,0.06) !important; border: 1.5px solid rgba(255,255,255,0.08) !important; border-radius: 22px !important; padding: 10px 16px !important; transition: border-color 0.2s, background 0.2s !important; font-size: 14.5px !important; color: var(--text) !important; }' +
        '#msg-input.form-input::placeholder { color: rgba(255,255,255,0.4) !important; }' +
        '#msg-input.form-input:focus { border-color: rgba(167,139,250,0.5) !important; outline: none !important; background: rgba(255,255,255,0.08) !important; }' +
        'button[onclick="sendMsg()"] { background: linear-gradient(135deg,#a78bfa,#7c3aed) !important; box-shadow: 0 4px 14px rgba(124,58,237,0.4) !important; transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1) !important; }' +
        'button[onclick="sendMsg()"]:active { transform: scale(0.85) !important; }' +
        '.chat-date-sep { text-align: center; margin: 24px 0 12px; }' +
        '.chat-date-sep span { display: inline-block; padding: 4px 14px; font-size: 11px; font-weight: 600; color: var(--muted); background: rgba(255,255,255,0.04); border-radius: 999px; letter-spacing: 0.3px; }' +
        '.chat-row { display: flex; align-items: flex-end; gap: 8px; padding: 0 14px; margin-top: 12px; animation: msg-in 0.3s cubic-bezier(0.16, 1, 0.3, 1); }' +
        '.chat-row-grouped { margin-top: 2px; animation: none; }' +
        '@keyframes msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }' +
        '.chat-row-me { justify-content: flex-end; }' +
        '.chat-row-other { justify-content: flex-start; }' +
        '.chat-avatar-mini { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; overflow: hidden; background: linear-gradient(135deg,#a78bfa,#7c3aed); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: #fff; }' +
        '.chat-avatar-mini img { width: 100%; height: 100%; object-fit: cover; }' +
        '.chat-avatar-spacer { width: 28px; flex-shrink: 0; }' +
        '.chat-bubble-wrap { max-width: 75%; display: flex; flex-direction: column; }' +
        '.chat-row-me .chat-bubble-wrap { align-items: flex-end; }' +
        '.chat-row-other .chat-bubble-wrap { align-items: flex-start; }' +
        '.chat-bubble { padding: 9px 13px; border-radius: 22px; font-size: 14.5px; line-height: 1.38; word-break: break-word; user-select: none; -webkit-user-select: none; cursor: pointer; transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1); max-width: 100%; position: relative; }' +
        '.chat-bubble:active { transform: scale(0.96); }' +
        '.chat-row-me .chat-bubble { background: linear-gradient(135deg,#a78bfa 0%,#8b5cf6 50%,#7c3aed 100%); color: #fff; border-radius: 22px 22px 6px 22px; box-shadow: 0 2px 8px rgba(124,58,237,0.2); }' +
        '.chat-row-me.chat-row-grouped .chat-bubble { border-radius: 22px 6px 6px 22px; }' +
        '.chat-row-me.chat-row-last .chat-bubble { border-radius: 22px 22px 6px 22px; }' +
        '.chat-row-me.chat-row-grouped.chat-row-last .chat-bubble { border-radius: 22px 6px 6px 22px; }' +
        '.chat-row-other .chat-bubble { background: rgba(255,255,255,0.07); color: var(--text); border-radius: 22px 22px 22px 6px; }' +
        '.chat-row-other.chat-row-grouped .chat-bubble { border-radius: 6px 22px 22px 6px; }' +
        '.chat-row-other.chat-row-last .chat-bubble { border-radius: 22px 22px 22px 6px; }' +
        '.chat-text { white-space: pre-wrap; }' +
        '.chat-img-wrap { max-width: 260px; border-radius: inherit; overflow: hidden; cursor: pointer; }' +
        '.chat-img-wrap img { width: 100%; display: block; border-radius: inherit; transition: transform 0.3s; }' +
        '.chat-img-wrap:active img { transform: scale(0.97); }' +
        '.chat-img-caption { padding: 9px 13px; font-size: 13.5px; line-height: 1.4; }' +
        '.chat-audio { display: flex; align-items: center; gap: 12px; min-width: 220px; padding: 4px 0; }' +
        '.chat-audio-btn { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.25); border: none; color: inherit; font-size: 14px; cursor: pointer; flex-shrink: 0; transition: transform 0.15s; }' +
        '.chat-audio-btn:active { transform: scale(0.9); }' +
        '.chat-row-other .chat-audio-btn { background: rgba(255,255,255,0.1); }' +
        '.chat-audio-info { flex: 1; min-width: 0; }' +
        '.chat-audio-bar { height: 3px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden; }' +
        '.chat-row-other .chat-audio-bar { background: rgba(255,255,255,0.1); }' +
        '.audio-prog { height: 100%; width: 0%; background: currentColor; transition: width 0.1s; }' +
        '.audio-dur { font-size: 11px; opacity: 0.7; margin-top: 5px; font-weight: 500; }' +
        '.chat-reactions { display: flex; gap: 2px; padding: 0; margin: -10px 0 0 0; z-index: 5; position: relative; pointer-events: auto; }' +
        '.chat-reactions:empty { display: none; }' +
        '.chat-row-me .chat-reactions { align-self: flex-end; margin-right: 8px; }' +
        '.chat-row-other .chat-reactions { align-self: flex-start; margin-left: 8px; }' +
        '.chat-reaction { display: inline-flex; align-items: center; background: var(--bg2); border: 2.5px solid var(--bg); padding: 3px 8px; border-radius: 999px; font-size: 13px; line-height: 1; box-shadow: 0 3px 10px rgba(0,0,0,0.5); animation: react-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }' +
        '.chat-reaction.mine { background: linear-gradient(135deg,#a78bfa,#7c3aed); color: #fff; border-color: var(--bg); }' +
        '.chat-reaction b { font-size: 11px; opacity: 0.85; margin-left: 3px; font-weight: 700; }' +
        '@keyframes react-pop { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }' +
        '.chat-status { font-size: 11px; color: var(--muted); margin-top: 4px; padding: 0 6px; font-weight: 500; }' +
        '.chat-bubble-wrap:has(.chat-reaction) .chat-status { margin-top: 12px; }' +
        '.chat-status.read { color: #4dabf7; }' +
        '.chat-status.pending { animation: pending-pulse 1.4s ease-in-out infinite; }' +
        '@keyframes pending-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }' +
        '.chat-heart-pop { position: absolute; pointer-events: none; font-size: 80px; opacity: 0; animation: heart-pop 1s ease-out forwards; z-index: 50; }' +
        '@keyframes heart-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); } 80% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -150%) scale(1.2); } }' +
        '.chat-reply-quote { background: rgba(255,255,255,0.1); border-left: 3px solid rgba(255,255,255,0.4); border-radius: 8px; padding: 5px 9px; margin: 0 0 6px 0; font-size: 12px; line-height: 1.35; cursor: pointer; }' +
        '.chat-row-me .chat-reply-quote { background: rgba(255,255,255,0.18); border-left-color: rgba(255,255,255,0.6); }' +
        '.chat-reply-quote .chat-reply-name { font-weight: 700; font-size: 11px; opacity: 0.9; margin-bottom: 1px; }' +
        '.chat-reply-quote .chat-reply-text { opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
        '.chat-row.swiping .chat-bubble-wrap { transform: translateX(var(--swipe,0)); transition: none; }' +
        '.chat-row .chat-bubble-wrap { transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; }' +
        '.chat-row.swiping .chat-bubble-wrap::before { content: "↩️"; position: absolute; left: -42px; top: 50%; transform: translateY(-50%); font-size: 22px; opacity: var(--swipe-op,0); }' +
        '.chat-row-me.swiping .chat-bubble-wrap::before { left: auto; right: -42px; }' +
        '#reply-preview { display: none; position: fixed; bottom: var(--compose-bottom, 70px); left: 8px; right: 8px; background: var(--bg2); border: 1px solid rgba(255,255,255,0.12); border-left: 3px solid #a78bfa; border-radius: 12px; padding: 8px 12px; z-index: 50; backdrop-filter: blur(20px); box-shadow: 0 -4px 16px rgba(0,0,0,0.3); animation: rp-in 0.2s ease; }' +
        '#reply-preview.show { display: flex; align-items: center; gap: 10px; }' +
        '@keyframes rp-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }' +
        '#reply-preview .rp-info { flex: 1; min-width: 0; }' +
        '#reply-preview .rp-label { font-size: 11px; color: #a78bfa; font-weight: 700; }' +
        '#reply-preview .rp-text { font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }' +
        '#reply-preview .rp-close { width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.08); border: none; color: var(--text); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }' +
        '.chat-link-preview { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 8px 10px; margin-top: 7px; text-decoration: none; color: var(--text); transition: background 0.15s; }' +
        '.chat-row-me .chat-link-preview { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.25); color: #fff; }' +
        '.chat-link-preview:active { background: rgba(255,255,255,0.12); }' +
        '.chat-link-preview .clp-icon { font-size: 22px; flex-shrink: 0; }' +
        '.chat-link-preview .clp-info { flex: 1; min-width: 0; }' +
        '.chat-link-preview .clp-host { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
        '.chat-link-preview .clp-path { font-size: 10.5px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }' +
        '.chat-edited { font-size: 9.5px; opacity: 0.65; margin-left: 6px; font-style: italic; }' +
        '.smart-reply-bar { position: fixed; bottom: var(--compose-bottom, 64px); left: 0; right: 0; padding: 6px 12px; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; z-index: 49; pointer-events: auto; }' +
        '.smart-reply-bar::-webkit-scrollbar { display: none; }' +
        '.smart-chip { flex-shrink: 0; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: var(--text); border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s; backdrop-filter: blur(8px); }' +
        '.smart-chip:active { transform: scale(0.92); background: rgba(167,139,250,0.18); }' +
        '.chat-search-bar { position: fixed; top: 56px; left: 0; right: 0; padding: 8px 12px; background: var(--bg2); border-bottom: 1px solid rgba(255,255,255,0.06); display: none; z-index: 60; }' +
        '.chat-search-bar.show { display: flex; gap: 8px; align-items: center; animation: csb-in 0.18s ease; }' +
        '@keyframes csb-in { from { transform: translateY(-30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }' +
        '.chat-search-bar input { flex: 1; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.1); color: var(--text); border-radius: 22px; padding: 9px 14px; font-size: 14px; outline: none; }' +
        '.chat-search-bar input:focus { border-color: rgba(167,139,250,0.4); }' +
        '.chat-search-bar .csb-close { background: rgba(255,255,255,0.08); border: none; color: var(--text); width: 36px; height: 36px; border-radius: 50%; font-size: 18px; cursor: pointer; }' +
        '.chat-row.csb-hide { display: none; }' +
        '.chat-row.csb-match { background: rgba(245,158,11,0.08); }' +
        '.chat-edit-input { width: 100%; background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.3); color: inherit; border-radius: 12px; padding: 6px 9px; font-size: 14px; font-family: inherit; outline: none; }' +
        '.chat-empty { padding: 100px 32px; text-align: center; }' +
        '.chat-empty-icon { font-size: 64px; margin-bottom: 18px; opacity: 0.5; animation: wave 2s ease-in-out infinite; transform-origin: 70% 70%; }' +
        '@keyframes wave { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-15deg); } 75% { transform: rotate(15deg); } }' +
        '.chat-empty-text { font-weight: 700; color: var(--text); margin-bottom: 6px; font-size: 17px; }' +
        '.chat-empty-sub { font-size: 13px; color: var(--muted); line-height: 1.5; max-width: 240px; margin: 0 auto; }' +
        '.chat-react-picker { position: fixed; z-index: 200; background: var(--bg2); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 6px 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05); display: none; gap: 2px; backdrop-filter: blur(20px); }' +
        '.chat-react-picker.show { display: flex; animation: picker-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }' +
        '@keyframes picker-pop { from { transform: scale(0.5) translateY(12px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }' +
        '.chat-react-picker button { background: none; border: none; font-size: 28px; padding: 6px 8px; cursor: pointer; transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); border-radius: 50%; }' +
        '.chat-react-picker button:hover, .chat-react-picker button:active { transform: scale(1.5); background: rgba(255,255,255,0.05); }' +
        '</style>';
}

function getReactionPicker() {
    return '<div id="chat-react-picker" class="chat-react-picker">' +
        '<button onclick="chatPickReaction(\'❤️\')">❤️</button>' +
        '<button onclick="chatPickReaction(\'😂\')">😂</button>' +
        '<button onclick="chatPickReaction(\'😮\')">😮</button>' +
        '<button onclick="chatPickReaction(\'😢\')">😢</button>' +
        '<button onclick="chatPickReaction(\'👏\')">👏</button>' +
        '<button onclick="chatPickReaction(\'🔥\')">🔥</button>' +
        '<button id="chat-del-btn" onclick="chatDeleteMsg()" style="display:none;font-size:20px;background:rgba(239,68,68,.15);border-radius:50%;border:none;width:44px;height:44px;cursor:pointer">🗑️</button>' +
        '</div>';
}

function getScripts(myUid, otherUid) {
    const chatKey = String(myUid) < String(otherUid) ? myUid + '_' + otherUid : otherUid + '_' + myUid;
    return '<script>' +
        'const CHAT_KEY = "' + esc(chatKey) + '";' +
        'const REACT_STORAGE_KEY = "reactions_" + CHAT_KEY;' +
        'function loadLocalReactions() { try { return JSON.parse(localStorage.getItem(REACT_STORAGE_KEY) || "{}"); } catch(e) { return {}; } }' +
        'function saveLocalReactions(map) { try { localStorage.setItem(REACT_STORAGE_KEY, JSON.stringify(map)); } catch(e) {} }' +
        'function renderAllReactions() {' +
            'const local = loadLocalReactions();' +
            'document.querySelectorAll(".chat-reactions").forEach(box => {' +
                'const ts = box.dataset.ts;' +
                'let counts = {};' +
                'try { counts = JSON.parse(box.dataset.backend || "{}"); } catch(e) {}' +
                'const myEmoji = local[ts];' +
                'if (myEmoji) counts[myEmoji] = (counts[myEmoji] || 0) + 1;' +
                'box.innerHTML = Object.entries(counts).map(([e, n]) => {' +
                    'const isMine = (myEmoji === e);' +
                    'return "<span class=\\"chat-reaction" + (isMine ? " mine" : "") + "\\">" + e + (n > 1 ? " <b>" + n + "</b>" : "") + "</span>";' +
                '}).join("");' +
            '});' +
        '}' +
        'let chatPressTimer = null;' +
        'let chatActiveTs = 0;' +
        'let chatLastTap = 0;' +
        'let chatLastTapBubble = null;' +
        'function chatLongPress(e, el, ts) {' +
            'chatPressTimer = setTimeout(() => { chatActiveTs = ts; chatShowReactions(el, ts); if (navigator.vibrate) navigator.vibrate(15); }, 280);' +
        '}' +
        'function chatLongPressEnd() { if (chatPressTimer) clearTimeout(chatPressTimer); chatPressTimer = null; }' +
        'function chatDoubleTap(e, el, ts) {' +
            'const now = Date.now();' +
            'if (chatLastTapBubble === el && (now - chatLastTap) < 350) {' +
                'chatLastTap = 0; chatHeartPop(el); chatActiveTs = ts; chatPickReaction("❤️");' +
            '} else { chatLastTap = now; chatLastTapBubble = el; }' +
        '}' +
        'function chatHeartPop(el) {' +
            'const heart = document.createElement("div"); heart.className = "chat-heart-pop"; heart.textContent = "❤️";' +
            'const r = el.getBoundingClientRect();' +
            'heart.style.left = (r.left + r.width / 2) + "px"; heart.style.top = (r.top + r.height / 2) + "px";' +
            'document.body.appendChild(heart);' +
            'setTimeout(() => heart.remove(), 1000);' +
            'if (navigator.vibrate) navigator.vibrate(10);' +
        '}' +
        'function chatShowReactions(el, ts) {' +
            'const picker = document.getElementById("chat-react-picker");' +
            'const isMyMsg = el.closest(".chat-row")?.classList.contains("chat-row-me");' +
            'const delBtn = document.getElementById("chat-del-btn");' +
            'if (delBtn) delBtn.style.display = isMyMsg ? "inline-flex" : "none";' +
            'picker.classList.add("show"); chatActiveTs = ts;' +
            'const r = el.getBoundingClientRect();' +
            'const pw = picker.offsetWidth || 260;' +
            'const left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));' +
            'picker.style.left = left + "px";' +
            'picker.style.top = Math.max(60, r.top - picker.offsetHeight - 8) + "px";' +
        '}' +
        'function chatHidePicker() { document.getElementById("chat-react-picker").classList.remove("show"); }' +
        'document.addEventListener("click", e => {' +
            'const picker = document.getElementById("chat-react-picker");' +
            'if (picker && !picker.contains(e.target) && !e.target.closest(".chat-bubble")) chatHidePicker();' +
        '});' +
        'async function chatPickReaction(emoji) {' +
            'if (!chatActiveTs) return;' +
            'const ts = String(chatActiveTs);' +
            'chatHidePicker();' +
            'const local = loadLocalReactions();' +
            'if (local[ts] === emoji) { delete local[ts]; } else { local[ts] = emoji; }' +
            'saveLocalReactions(local);' +
            'renderAllReactions();' +
            'try { fetch("/api/react-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatKey: CHAT_KEY, timestamp: Number(ts), emoji: emoji }) }).catch(()=>{}); } catch(e) {}' +
        '}' +
        'async function chatDeleteMsg() {' +
            'chatHidePicker();' +
            'if (!chatActiveTs) return;' +
            'const ts = chatActiveTs;' +
            'const row = document.querySelector(".chat-row[data-ts=\\"" + ts + "\\"]");' +
            'if (row) row.style.opacity = "0.3";' +
            'try {' +
                'const r = await fetch("/api/delete-dm", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ chatKey: CHAT_KEY, timestamp: ts }) });' +
                'const d = await r.json();' +
                'if (d.ok || d.ok === undefined) { if (row) row.remove(); }' +
                'else { if (row) row.style.opacity = "1"; }' +
            '} catch(e) { if (row) row.style.opacity = "1"; }' +
        '}' +
        // ── Swipe-to-Reply (Instagram-style) ──
        'const OTHER_NAME = "' + esc(otherUid) + '";' +
        'let __replyState = null;' +
        'function chatStartReply(ts, name, text){' +
            '__replyState = { ts: Number(ts)||0, name: name||"?", text: (text||"").slice(0,140) };' +
            'let prev = document.getElementById("reply-preview");' +
            'if (!prev) { prev = document.createElement("div"); prev.id = "reply-preview"; document.body.appendChild(prev); }' +
            'prev.innerHTML = "<div class=\\"rp-info\\"><div class=\\"rp-label\\">↩️ Antwort an " + (name||"User").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c])) + "</div><div class=\\"rp-text\\">" + (text||"").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c])) + "</div></div><button class=\\"rp-close\\" onclick=\\"chatCancelReply()\\">×</button>";' +
            'prev.classList.add("show");' +
            'document.getElementById("msg-input")?.focus();' +
            'if (navigator.vibrate) navigator.vibrate(20);' +
        '}' +
        'function chatCancelReply(){' +
            '__replyState = null;' +
            'document.getElementById("reply-preview")?.classList.remove("show");' +
        '}' +
        // Patch sendMessage um replyTo mitzuschicken (überschreibt fetch-Body)
        'if (typeof window.fetch === "function") {' +
            'const origFetch = window.fetch.bind(window);' +
            'window.fetch = function(u, opts){' +
                'try {' +
                    'if (typeof u === "string" && u.indexOf("/api/send-message") === 0 && opts && opts.body && __replyState) {' +
                        'const body = JSON.parse(opts.body); body.replyTo = __replyState;' +
                        'opts = Object.assign({}, opts, { body: JSON.stringify(body) });' +
                        'setTimeout(chatCancelReply, 100);' +
                    '}' +
                '} catch(e){}' +
                'return origFetch(u, opts);' +
            '};' +
        '}' +
        // Touch-Swipe Handler auf .chat-row
        'let __swipeRow = null, __swipeStartX = 0, __swipeStartY = 0, __swipeActive = false;' +
        'document.addEventListener("touchstart", e => {' +
            'const row = e.target.closest && e.target.closest(".chat-row"); if (!row) return;' +
            '__swipeRow = row; __swipeActive = false;' +
            '__swipeStartX = e.touches[0].clientX; __swipeStartY = e.touches[0].clientY;' +
        '}, { passive: true });' +
        'document.addEventListener("touchmove", e => {' +
            'if (!__swipeRow) return;' +
            'const dx = e.touches[0].clientX - __swipeStartX;' +
            'const dy = Math.abs(e.touches[0].clientY - __swipeStartY);' +
            'if (dy > 18) { __swipeRow.classList.remove("swiping"); __swipeRow = null; return; }' +
            'const isMe = __swipeRow.classList.contains("chat-row-me");' +
            'const adx = isMe ? Math.min(0, dx) : Math.max(0, dx);' +
            'if (Math.abs(adx) > 6) {' +
                '__swipeActive = true; __swipeRow.classList.add("swiping");' +
                'const cap = Math.max(-90, Math.min(90, adx));' +
                '__swipeRow.style.setProperty("--swipe", cap + "px");' +
                '__swipeRow.style.setProperty("--swipe-op", Math.min(1, Math.abs(cap)/60));' +
            '}' +
        '}, { passive: true });' +
        'document.addEventListener("touchend", e => {' +
            'if (!__swipeRow) return;' +
            'const cap = parseInt(__swipeRow.style.getPropertyValue("--swipe")||"0", 10);' +
            'if (Math.abs(cap) >= 55 && __swipeActive) {' +
                'const ts = __swipeRow.dataset.ts;' +
                'const isMe = __swipeRow.classList.contains("chat-row-me");' +
                'const name = isMe ? "Du" : (document.querySelector(".chat-header-name")?.innerText || "User").trim();' +
                'const text = (__swipeRow.querySelector(".chat-text")?.innerText || __swipeRow.querySelector(".chat-img-caption")?.innerText || (__swipeRow.querySelector(".chat-img-wrap")?"📷 Foto":"") || (__swipeRow.querySelector(".chat-audio")?"🎤 Sprachnachricht":"") || "").trim();' +
                'chatStartReply(ts, name, text);' +
            '}' +
            '__swipeRow.style.setProperty("--swipe", "0px");' +
            '__swipeRow.style.setProperty("--swipe-op", "0");' +
            '__swipeRow.classList.remove("swiping");' +
            '__swipeRow = null; __swipeActive = false;' +
        '}, { passive: true });' +
        // Long-Press Picker erweitern um Reply-Button
        'document.addEventListener("DOMContentLoaded", () => {' +
            'const pk = document.getElementById("chat-react-picker");' +
            'if (pk && !pk.querySelector(".chat-react-reply")) {' +
                'const btn = document.createElement("button");' +
                'btn.className = "chat-react-reply";' +
                'btn.style.cssText = "background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border:none;border-radius:18px;padding:6px 12px;font-size:12px;font-weight:700;margin-left:6px;cursor:pointer";' +
                'btn.textContent = "↩️ Antworten";' +
                'btn.onclick = function(){' +
                    'if (!chatActiveTs) return;' +
                    'const row = document.querySelector(".chat-row[data-ts=\\\""+chatActiveTs+"\\\"]");' +
                    'if (!row) return;' +
                    'const isMe = row.classList.contains("chat-row-me");' +
                    'const name = isMe ? "Du" : (document.querySelector(".chat-header-name")?.innerText || "User").trim();' +
                    'const text = (row.querySelector(".chat-text")?.innerText || row.querySelector(".chat-img-caption")?.innerText || (row.querySelector(".chat-img-wrap")?"📷 Foto":"") || (row.querySelector(".chat-audio")?"🎤 Sprachnachricht":"") || "").trim();' +
                    'chatHidePicker();' +
                    'chatStartReply(chatActiveTs, name, text);' +
                '};' +
                'pk.appendChild(btn);' +
            '}' +
        '});' +
        'function chatJumpToMsg(ts){' +
            'const el = document.querySelector(".chat-row[data-ts=\\\""+ts+"\\\"]");' +
            'if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.background = "rgba(167,139,250,0.18)"; setTimeout(()=>el.style.background = "", 1200); }' +
        '}' +
        // ── Compose Draft persistieren ──
        'const DRAFT_KEY = "draft_" + CHAT_KEY;' +
        'document.addEventListener("DOMContentLoaded", () => {' +
            'const inp = document.getElementById("msg-input"); if (!inp) return;' +
            'try { const saved = localStorage.getItem(DRAFT_KEY); if (saved) inp.value = saved; } catch(e) {}' +
            'inp.addEventListener("input", () => { try { if (inp.value) localStorage.setItem(DRAFT_KEY, inp.value); else localStorage.removeItem(DRAFT_KEY); } catch(e) {} });' +
            'const origForm = inp.form; const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch(e) {} };' +
            'document.querySelector("button[onclick=\\"sendMsg()\\"]")?.addEventListener("click", () => setTimeout(clearDraft, 50));' +
            'inp.addEventListener("keypress", (e) => { if (e.key === "Enter") setTimeout(clearDraft, 50); });' +
        '});' +
        // ── Smart-Reply Chips über Compose ──
        'document.addEventListener("DOMContentLoaded", () => {' +
            'if (document.getElementById("smart-reply-bar")) return;' +
            'const bar = document.createElement("div"); bar.id = "smart-reply-bar"; bar.className = "smart-reply-bar";' +
            'const lastMsg = [...document.querySelectorAll(".chat-row-other .chat-text")].pop();' +
            'const lastText = (lastMsg?.innerText || "").toLowerCase();' +
            'let chips;' +
            'if (/\\?$/.test(lastText.trim()) || /(was|wie|wann|warum|wo)/.test(lastText)) chips = ["👍 Ja klar!", "Hmm, lass mich überlegen", "Schreib ich später", "🤔"];' +
            'else if (/(cool|gut|nice|toll|wow|stark)/i.test(lastText)) chips = ["🔥", "❤️", "Danke!", "Du auch!"];' +
            'else if (/(danke|thanks|bitte|sorry)/i.test(lastText)) chips = ["Gern!", "❤️", "Kein Stress", "👍"];' +
            'else chips = ["❤️", "🔥", "Danke!", "Mach ich", "👍"];' +
            'bar.innerHTML = chips.map(c => "<button class=\\"smart-chip\\" onclick=\\"chatChip(this)\\">" + c.replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c])) + "</button>").join("");' +
            'document.body.appendChild(bar);' +
            'const compose = document.querySelector("[onclick=\\"sendMsg()\\"]")?.closest("div"); if (compose) bar.style.bottom = (compose.offsetHeight + 8) + "px";' +
        '});' +
        'function chatChip(btn){' +
            'const inp = document.getElementById("msg-input"); if (!inp) return;' +
            'inp.value = btn.innerText.trim(); inp.focus();' +
            'if (typeof sendMsg === "function") sendMsg();' +
        '}' +
        // ── Search im Chat ──
        'function chatToggleSearch(){' +
            'let bar = document.getElementById("chat-search-bar");' +
            'if (!bar) {' +
                'bar = document.createElement("div"); bar.id = "chat-search-bar"; bar.className = "chat-search-bar";' +
                'bar.innerHTML = "<input type=\\"text\\" placeholder=\\"In Chat suchen...\\" oninput=\\"chatDoSearch(this.value)\\" autofocus><button class=\\"csb-close\\" onclick=\\"chatToggleSearch()\\">×</button>";' +
                'document.body.appendChild(bar);' +
            '}' +
            'const isShown = bar.classList.toggle("show");' +
            'if (isShown) { setTimeout(()=>bar.querySelector("input")?.focus(), 50); }' +
            'else { chatDoSearch(""); }' +
        '}' +
        'function chatDoSearch(q){' +
            'const query = (q||"").toLowerCase().trim();' +
            'document.querySelectorAll(".chat-row").forEach(r => {' +
                'r.classList.remove("csb-hide", "csb-match");' +
                'if (!query) return;' +
                'const text = (r.innerText||"").toLowerCase();' +
                'if (text.includes(query)) r.classList.add("csb-match"); else r.classList.add("csb-hide");' +
            '});' +
            'document.querySelectorAll(".chat-date-sep").forEach(s => { s.style.display = query ? "none" : ""; });' +
        '}' +
        // ── Edit + Copy in Long-Press Picker ──
        'document.addEventListener("DOMContentLoaded", () => {' +
            'const pk = document.getElementById("chat-react-picker"); if (!pk) return;' +
            'if (!pk.querySelector(".chat-react-edit")) {' +
                'const eb = document.createElement("button"); eb.className = "chat-react-edit chat-react-mineonly";' +
                'eb.style.cssText = "background:rgba(255,255,255,0.1);color:var(--text);border:none;border-radius:18px;padding:6px 12px;font-size:12px;font-weight:600;margin-left:4px;cursor:pointer;display:none";' +
                'eb.textContent = "✏️ Bearbeiten";' +
                'eb.onclick = function(){ chatHidePicker(); chatEditMsg(chatActiveTs); };' +
                'pk.appendChild(eb);' +
            '}' +
            'if (!pk.querySelector(".chat-react-copy")) {' +
                'const cb = document.createElement("button"); cb.className = "chat-react-copy";' +
                'cb.style.cssText = "background:rgba(255,255,255,0.08);color:var(--text);border:none;border-radius:18px;padding:6px 12px;font-size:12px;font-weight:600;margin-left:4px;cursor:pointer";' +
                'cb.textContent = "📋 Kopieren";' +
                'cb.onclick = function(){' +
                    'const row = document.querySelector(".chat-row[data-ts=\\\""+chatActiveTs+"\\\"]");' +
                    'const text = row?.querySelector(".chat-text")?.innerText || row?.querySelector(".chat-img-caption")?.innerText || "";' +
                    'if (text) navigator.clipboard?.writeText(text);' +
                    'chatHidePicker();' +
                '};' +
                'pk.appendChild(cb);' +
            '}' +
        '});' +
        // Edit-Buttons sichtbar wenn eigene Nachricht (Hook in chatShowReactions)
        'const _origShow = window.chatShowReactions; window.chatShowReactions = function(el, ts){' +
            '_origShow.call(window, el, ts);' +
            'const isMine = el.closest(".chat-row")?.classList.contains("chat-row-me");' +
            'const within5min = (Date.now() - Number(ts)) < 5*60*1000;' +
            'document.querySelectorAll(".chat-react-mineonly").forEach(b => { b.style.display = (isMine && within5min) ? "inline-flex" : "none"; });' +
        '};' +
        'async function chatEditMsg(ts){' +
            'if (!ts) return;' +
            'const row = document.querySelector(".chat-row[data-ts=\\\""+ts+"\\\"]");' +
            'if (!row) return;' +
            'const txtEl = row.querySelector(".chat-text"); if (!txtEl) return;' +
            'const oldText = txtEl.innerText;' +
            'const inp = document.createElement("textarea"); inp.className = "chat-edit-input"; inp.value = oldText; inp.rows = 1;' +
            'inp.style.resize = "none";' +
            'txtEl.replaceWith(inp); inp.focus();' +
            'const finish = async (save) => {' +
                'const newText = inp.value.trim();' +
                'const newEl = document.createElement("div"); newEl.className = "chat-text";' +
                'if (save && newText && newText !== oldText) {' +
                    'newEl.innerText = newText;' +
                    'newEl.appendChild(Object.assign(document.createElement("span"), { className:"chat-edited", innerText:"bearbeitet" }));' +
                    'inp.replaceWith(newEl);' +
                    'try {' +
                        'await fetch("/api/edit-message", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ chatKey: CHAT_KEY, timestamp: Number(ts), newText }) });' +
                    '} catch(e) {}' +
                '} else { newEl.innerText = oldText; inp.replaceWith(newEl); }' +
            '};' +
            'inp.addEventListener("blur", () => finish(true));' +
            'inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); inp.blur(); } if (e.key === "Escape") { e.preventDefault(); finish(false); } });' +
        '}' +
        'renderAllReactions();' +
        'requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));' +
        '<\/script>';
}
