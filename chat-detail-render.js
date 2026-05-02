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

        let bubbleContent = '';
        if (m.image) {
            bubbleContent = '<div class="chat-img-wrap" onclick="window.open(\'' + m.image + '\', \'_blank\')">' +
                '<img src="' + m.image + '" alt="" loading="lazy">' +
                (m.text ? '<div class="chat-img-caption">' + esc(m.text) + '</div>' : '') +
                '</div>';
        } else if (m.audio) {
            bubbleContent = '<div class="chat-audio">' +
                '<button class="chat-audio-btn" onclick="toggleAudio(this)" data-src="' + m.audio + '">▶</button>' +
                '<div class="chat-audio-info"><div class="chat-audio-bar"><div class="audio-prog"></div></div><div class="audio-dur">🎤 Sprachnachricht</div></div>' +
                '</div>';
        } else {
            bubbleContent = '<div class="chat-text">' + esc(m.text || '') + '</div>';
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
        'renderAllReactions();' +
        'requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));' +
        '<\/script>';
}
