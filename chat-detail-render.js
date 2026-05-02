// Chat-Detail Bubbles im Insta DM Style
// Wird via require() in bot.js eingebunden (durch patch-bot.js)

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
    const { msgs = [], myUid = '', otherUid = '', otherUser = {}, ladeBild = () => null } = opts || {};

    if (!msgs.length) {
        return '<div class="chat-empty">' +
            '<div class="chat-empty-icon">👋</div>' +
            '<div class="chat-empty-text">Noch keine Nachrichten</div>' +
            '<div class="chat-empty-sub">Schreib die erste Nachricht!</div>' +
            '</div>';
    }

    const otherPic = ladeBild(otherUid, 'profilepic');
    const otherInsta = otherUser.instagram;
    const otherName = otherUser.spitzname || otherUser.name || 'User';
    const otherAvatarSrc = otherPic ?
        '/appbild/' + otherUid + '/profilepic' :
        (otherInsta ? 'https://unavatar.io/instagram/' + otherInsta : '');

    let html = '';
    let lastDate = null;
    let lastFrom = null;
    let lastTimestamp = 0;

    msgs.forEach((m, idx) => {
        const isMe = String(m.from) === String(myUid);
        const ts = m.timestamp || 0;
        const next = msgs[idx + 1];

        // Date-Header alle 24h oder bei neuem Tag
        const thisDate = new Date(ts).toDateString();
        if (thisDate !== lastDate) {
            html += '<div class="chat-date-sep"><span>' + formatDateHeader(ts) + '</span></div>';
            lastDate = thisDate;
            lastFrom = null;
        }

        // Group: wenn von gleichem User UND innerhalb 5 Min
        const sameSender = lastFrom === m.from && (ts - lastTimestamp) < 5 * 60 * 1000;
        const isLastFromSender = !next || String(next.from) !== String(m.from) || ((next.timestamp || 0) - ts) > 5 * 60 * 1000;

        // Bubble-Inhalt
        let bubbleContent = '';
        if (m.image) {
            bubbleContent = '<div class="chat-img-wrap" onclick="window.open(\'' + m.image + '\', \'_blank\')">' +
                '<img src="' + m.image + '" alt="">' +
                (m.text ? '<div class="chat-img-caption">' + esc(m.text) + '</div>' : '') +
                '</div>';
        } else if (m.audio) {
            bubbleContent = '<div class="chat-audio">' +
                '<button class="chat-audio-btn" onclick="toggleAudio(this)" data-src="' + m.audio + '">▶</button>' +
                '<div class="chat-audio-info">' +
                    '<div class="chat-audio-bar"><div class="audio-prog"></div></div>' +
                    '<div class="audio-dur">🎤 Sprachnachricht</div>' +
                '</div>' +
                '</div>';
        } else {
            bubbleContent = '<div class="chat-text">' + esc(m.text || '') + '</div>';
        }

        // Reactions wenn vorhanden
        let reactionsHtml = '';
        if (m.reactions && Object.keys(m.reactions).length > 0) {
            const counts = {};
            Object.values(m.reactions).forEach(emoji => {
                counts[emoji] = (counts[emoji] || 0) + 1;
            });
            reactionsHtml = '<div class="chat-reactions">' +
                Object.entries(counts).map(([emo, n]) =>
                    '<span class="chat-reaction">' + emo + (n > 1 ? ' ' + n : '') + '</span>'
                ).join('') +
                '</div>';
        }

        // Read-Status nur bei eigenen Messages und last group
        let statusHtml = '';
        if (isMe && isLastFromSender) {
            const isRead = m.read === true;
            statusHtml = '<div class="chat-status' + (isRead ? ' read' : '') + '">' +
                (isRead ? 'Gesehen ' + formatTimeOnly(ts) : 'Gesendet ' + formatTimeOnly(ts)) +
                '</div>';
        }

        // Avatar (nur fuer den anderen User, beim letzten Message in Gruppe)
        const showAvatar = !isMe && isLastFromSender;
        const avatarHtml = showAvatar ?
            '<div class="chat-avatar-mini">' +
                (otherAvatarSrc ?
                    '<img src="' + otherAvatarSrc + '" alt="">' :
                    '<span>' + esc(otherName.slice(0, 1)) + '</span>') +
            '</div>' :
            '<div class="chat-avatar-spacer"></div>';

        const groupClass = sameSender ? ' chat-row-grouped' : '';
        const lastClass = isLastFromSender ? ' chat-row-last' : '';

        html += '<div class="chat-row ' + (isMe ? 'chat-row-me' : 'chat-row-other') + groupClass + lastClass + '" data-ts="' + ts + '" data-mid="' + ts + '">' +
            (!isMe ? avatarHtml : '') +
            '<div class="chat-bubble-wrap">' +
                '<div class="chat-bubble" onpointerdown="chatLongPress(event, this, ' + ts + ')" onpointerup="chatLongPressEnd()" onpointerleave="chatLongPressEnd()" oncontextmenu="event.preventDefault(); chatShowReactions(this, ' + ts + ')">' +
                    bubbleContent +
                '</div>' +
                reactionsHtml +
                statusHtml +
            '</div>' +
        '</div>';

        lastFrom = m.from;
        lastTimestamp = ts;
    });

    // CSS + Reaction-Picker
    return '<style>' +
        '#chat-msgs { padding: 12px 0 140px; display: flex; flex-direction: column; }' +
        '.chat-date-sep { text-align: center; margin: 16px 0 12px; position: relative; }' +
        '.chat-date-sep span { display: inline-block; padding: 4px 12px; font-size: 11px; font-weight: 700; color: var(--muted); background: var(--bg2); border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; }' +

        '.chat-row { display: flex; align-items: flex-end; gap: 6px; padding: 0 12px; margin-top: 8px; }' +
        '.chat-row-grouped { margin-top: 2px; }' +
        '.chat-row-me { justify-content: flex-end; }' +
        '.chat-row-other { justify-content: flex-start; }' +

        '.chat-avatar-mini { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; overflow: hidden; background: var(--bg4); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: #fff; }' +
        '.chat-avatar-mini img { width: 100%; height: 100%; object-fit: cover; }' +
        '.chat-avatar-spacer { width: 28px; flex-shrink: 0; }' +

        '.chat-bubble-wrap { max-width: 75%; display: flex; flex-direction: column; }' +
        '.chat-row-me .chat-bubble-wrap { align-items: flex-end; }' +
        '.chat-row-other .chat-bubble-wrap { align-items: flex-start; }' +

        '.chat-bubble { padding: 9px 14px; border-radius: 18px; font-size: 14.5px; line-height: 1.4; word-break: break-word; user-select: none; -webkit-user-select: none; touch-action: manipulation; cursor: pointer; transition: transform 0.1s; max-width: 100%; }' +
        '.chat-bubble:active { transform: scale(0.98); }' +
        '.chat-row-me .chat-bubble { background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; border-radius: 18px 18px 4px 18px; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25); }' +
        '.chat-row-me.chat-row-grouped .chat-bubble { border-radius: 18px 4px 4px 18px; }' +
        '.chat-row-me.chat-row-last .chat-bubble { border-radius: 18px 18px 4px 18px; }' +
        '.chat-row-other .chat-bubble { background: var(--bg3); color: var(--text); border-radius: 18px 18px 18px 4px; }' +
        '.chat-row-other.chat-row-grouped .chat-bubble { border-radius: 4px 18px 18px 4px; }' +
        '.chat-row-other.chat-row-last .chat-bubble { border-radius: 18px 18px 18px 4px; }' +

        '.chat-text { white-space: pre-wrap; }' +
        '.chat-img-wrap { max-width: 240px; border-radius: inherit; overflow: hidden; cursor: pointer; }' +
        '.chat-img-wrap img { width: 100%; display: block; border-radius: inherit; }' +
        '.chat-img-caption { padding: 8px 12px; font-size: 13px; }' +

        '.chat-audio { display: flex; align-items: center; gap: 10px; min-width: 200px; padding: 4px 0; }' +
        '.chat-audio-btn { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.25); border: none; color: inherit; font-size: 14px; cursor: pointer; flex-shrink: 0; }' +
        '.chat-row-other .chat-audio-btn { background: var(--bg4); }' +
        '.chat-audio-info { flex: 1; min-width: 0; }' +
        '.chat-audio-bar { height: 3px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden; }' +
        '.chat-row-other .chat-audio-bar { background: var(--bg4); }' +
        '.audio-prog { height: 100%; width: 0%; background: currentColor; transition: width 0.1s; }' +
        '.audio-dur { font-size: 10px; opacity: 0.8; margin-top: 4px; }' +

        '.chat-reactions { display: flex; gap: 4px; margin-top: -6px; padding: 0 8px; }' +
        '.chat-reaction { background: var(--bg2); border: 1px solid var(--border2); padding: 2px 7px; border-radius: 999px; font-size: 12px; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.2); animation: react-pop 0.3s; }' +
        '@keyframes react-pop { from { transform: scale(0); } to { transform: scale(1); } }' +

        '.chat-status { font-size: 10.5px; color: var(--muted); margin-top: 3px; padding: 0 4px; }' +
        '.chat-status.read { color: #4dabf7; font-weight: 600; }' +

        '.chat-empty { padding: 80px 24px; text-align: center; }' +
        '.chat-empty-icon { font-size: 56px; margin-bottom: 16px; opacity: 0.4; }' +
        '.chat-empty-text { font-weight: 700; color: var(--text); margin-bottom: 4px; font-size: 15px; }' +
        '.chat-empty-sub { font-size: 13px; color: var(--muted); }' +

        '.chat-react-picker { position: fixed; z-index: 200; background: var(--bg2); border: 1px solid var(--border2); border-radius: 999px; padding: 6px 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: none; gap: 4px; }' +
        '.chat-react-picker.show { display: flex; animation: picker-pop 0.2s; }' +
        '@keyframes picker-pop { from { transform: scale(0.7) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }' +
        '.chat-react-picker button { background: none; border: none; font-size: 26px; padding: 4px 6px; cursor: pointer; transition: transform 0.15s; }' +
        '.chat-react-picker button:hover, .chat-react-picker button:active { transform: scale(1.4); }' +

        '.chat-typing-indicator { display: flex; align-items: center; gap: 4px; padding: 12px 18px; background: var(--bg3); border-radius: 18px 18px 18px 4px; width: fit-content; margin: 0 12px 8px 46px; }' +
        '.chat-typing-indicator span { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: typing-bounce 1.3s infinite; }' +
        '.chat-typing-indicator span:nth-child(2) { animation-delay: 0.15s; }' +
        '.chat-typing-indicator span:nth-child(3) { animation-delay: 0.3s; }' +
        '@keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-5px); opacity: 1; } }' +
        '</style>' +
        html +
        '<div id="chat-react-picker" class="chat-react-picker">' +
            '<button onclick="chatPickReaction(\'❤️\')">❤️</button>' +
            '<button onclick="chatPickReaction(\'😂\')">😂</button>' +
            '<button onclick="chatPickReaction(\'😮\')">😮</button>' +
            '<button onclick="chatPickReaction(\'😢\')">😢</button>' +
            '<button onclick="chatPickReaction(\'👏\')">👏</button>' +
            '<button onclick="chatPickReaction(\'🔥\')">🔥</button>' +
        '</div>' +
        '<script>' +
            'let chatPressTimer = null;' +
            'let chatActiveBubble = null;' +
            'let chatActiveTs = 0;' +
            'function chatLongPress(e, el, ts) {' +
                'chatPressTimer = setTimeout(() => {' +
                    'chatActiveBubble = el;' +
                    'chatActiveTs = ts;' +
                    'chatShowReactions(el, ts);' +
                    'if (navigator.vibrate) navigator.vibrate(20);' +
                '}, 350);' +
            '}' +
            'function chatLongPressEnd() {' +
                'if (chatPressTimer) clearTimeout(chatPressTimer);' +
                'chatPressTimer = null;' +
            '}' +
            'function chatShowReactions(el, ts) {' +
                'const picker = document.getElementById("chat-react-picker");' +
                'const r = el.getBoundingClientRect();' +
                'picker.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.left + r.width/2 - 140)) + "px";' +
                'picker.style.top = Math.max(60, r.top - 56) + "px";' +
                'picker.classList.add("show");' +
                'chatActiveBubble = el;' +
                'chatActiveTs = ts;' +
            '}' +
            'function chatHidePicker() {' +
                'document.getElementById("chat-react-picker").classList.remove("show");' +
                'chatActiveBubble = null;' +
            '}' +
            'document.addEventListener("click", e => {' +
                'const picker = document.getElementById("chat-react-picker");' +
                'if (picker && !picker.contains(e.target) && !e.target.closest(".chat-bubble")) chatHidePicker();' +
            '});' +
            'async function chatPickReaction(emoji) {' +
                'if (!chatActiveTs) return;' +
                'const ts = chatActiveTs;' +
                'chatHidePicker();' +
                'try {' +
                    'await fetch("/api/react-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatKey: ["' + esc(myUid) + '", "' + esc(otherUid) + '"].sort().join("_"), timestamp: ts, emoji: emoji }) });' +
                    'setTimeout(() => location.reload(), 300);' +
                '} catch(e) { console.error("react fail", e); }' +
            '}' +
        '<\/script>';
};
