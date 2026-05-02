// Telegram-Threads Liste v2 - vertikale Cards mit smart Icons + app-perf

let appPerf = '';
try { appPerf = require('./app-perf'); } catch(e) {}

const ICON_MAP = [
    { kw: ['allgemein', 'general'],            icon: '💬', grad: 'linear-gradient(135deg,#0088cc,#00c6ff)' },
    { kw: ['abmeld', 'abwesend', 'pause'],     icon: '📤', grad: 'linear-gradient(135deg,#fb923c,#ea580c)' },
    { kw: ['frage', 'fragen', 'help', 'hilfe'],icon: '❓', grad: 'linear-gradient(135deg,#f59e0b,#d97706)' },
    { kw: ['canva', 'design', 'edit'],         icon: '🎨', grad: 'linear-gradient(135deg,#a855f7,#7e22ce)' },
    { kw: ['feedback', 'review'],              icon: '📣', grad: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
    { kw: ['idee', 'ideas', 'inspir'],         icon: '💡', grad: 'linear-gradient(135deg,#eab308,#ca8a04)' },
    { kw: ['gespräch', 'kennenlernen', 'reden','small talk'], icon: '🗣️', grad: 'linear-gradient(135deg,#22c55e,#16a34a)' },
    { kw: ['instawerbung', 'werbung', 'community','marketing'], icon: '📢', grad: 'linear-gradient(135deg,#ec4899,#be185d)' },
    { kw: ['strategie', 'strategy', 'wachstum','growth'],       icon: '📈', grad: 'linear-gradient(135deg,#10b981,#047857)' },
    { kw: ['regel', 'rule'],                   icon: '📋', grad: 'linear-gradient(135deg,#6366f1,#4338ca)' },
    { kw: ['announce', 'news', 'update'],      icon: '📣', grad: 'linear-gradient(135deg,#ef4444,#b91c1c)' },
    { kw: ['shop', 'kauf', 'verkauf'],         icon: '🛍️', grad: 'linear-gradient(135deg,#f97316,#c2410c)' },
    { kw: ['challenge', 'wettbewerb', 'contest'], icon: '🏆', grad: 'linear-gradient(135deg,#fbbf24,#d97706)' },
    { kw: ['tipp', 'tipps', 'tips'],           icon: '💡', grad: 'linear-gradient(135deg,#fde047,#ca8a04)' },
    { kw: ['lounge', 'chill', 'offtopic'],     icon: '🛋️', grad: 'linear-gradient(135deg,#a78bfa,#7c3aed)' },
    { kw: ['mood', 'foto', 'pic', 'bild'],     icon: '📸', grad: 'linear-gradient(135deg,#f472b6,#db2777)' },
    { kw: ['video', 'reel', 'clip'],           icon: '🎥', grad: 'linear-gradient(135deg,#06b6d4,#0891b2)' },
    { kw: ['music', 'sound', 'audio'],         icon: '🎵', grad: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
    { kw: ['support', 'team', 'admin'],        icon: '🛡️', grad: 'linear-gradient(135deg,#dc2626,#991b1b)' },
    { kw: ['voting', 'umfrage', 'poll'],       icon: '🗳️', grad: 'linear-gradient(135deg,#14b8a6,#0d9488)' },
    { kw: ['willkommen', 'welcome', 'intro'],  icon: '👋', grad: 'linear-gradient(135deg,#84cc16,#65a30d)' },
];

const FALLBACK_GRADIENTS = [
    'linear-gradient(135deg,#f43f5e,#be123c)','linear-gradient(135deg,#f97316,#c2410c)',
    'linear-gradient(135deg,#eab308,#a16207)','linear-gradient(135deg,#84cc16,#4d7c0f)',
    'linear-gradient(135deg,#22c55e,#15803d)','linear-gradient(135deg,#10b981,#047857)',
    'linear-gradient(135deg,#06b6d4,#0e7490)','linear-gradient(135deg,#3b82f6,#1d4ed8)',
    'linear-gradient(135deg,#6366f1,#4338ca)','linear-gradient(135deg,#a855f7,#7e22ce)',
    'linear-gradient(135deg,#ec4899,#be185d)','linear-gradient(135deg,#f59e0b,#d97706)',
];

const FALLBACK_ICONS = ['🎯','🚀','💡','📊','🎨','🔥','⚡','🌟','📝','🎭','🏆','🎵','🧠','💎','🌈','🎮','📣','🛠️','🌍','🎬'];

function hashCode(str) {
    let h = 0;
    for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
}

function smartIcon(name, id) {
    const lower = String(name || '').toLowerCase();
    for (const m of ICON_MAP) {
        for (const k of m.kw) {
            if (lower.includes(k)) return { icon: m.icon, grad: m.grad };
        }
    }
    const h = hashCode(id || name);
    return {
        icon: FALLBACK_ICONS[h % FALLBACK_ICONS.length],
        grad: FALLBACK_GRADIENTS[h % FALLBACK_GRADIENTS.length]
    };
}

function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

module.exports = function renderThreadList(opts) {
    const { threads = [], threadMsgs = {}, lastRead = {}, communityFeed = [], isAdmin = false } = opts || {};

    const styles = '<style>' +
        '.thr-list { padding: 8px 12px 100px; display: flex; flex-direction: column; gap: 8px; }' +
        '.thr-card { display: flex; align-items: center; gap: 13px; padding: 14px; background: var(--bg2); border: 1px solid var(--border2); border-radius: 16px; text-decoration: none; color: inherit; transition: all 0.2s; position: relative; }' +
        '.thr-card:active { transform: scale(0.98); background: var(--bg3); }' +
        '.thr-card.unread { border-color: rgba(0, 136, 204, 0.4); background: linear-gradient(135deg, rgba(0,136,204,0.08), var(--bg2) 50%); }' +
        '.thr-icon { width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.25); position: relative; }' +
        '.thr-icon-pulse { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; background: #22c55e; border: 2.5px solid var(--bg); border-radius: 50%; animation: thr-pulse 1.6s infinite; }' +
        '@keyframes thr-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }' +
        '.thr-content { flex: 1; min-width: 0; }' +
        '.thr-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 3px; }' +
        '.thr-name { font-size: 15px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }' +
        '.thr-card.unread .thr-name { font-weight: 800; }' +
        '.thr-time { font-size: 11px; color: var(--muted); flex-shrink: 0; }' +
        '.thr-card.unread .thr-time { color: #00c6ff; font-weight: 600; }' +
        '.thr-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }' +
        '.thr-preview { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; line-height: 1.35; }' +
        '.thr-card.unread .thr-preview { color: var(--text); font-weight: 500; }' +
        '.thr-author { font-weight: 600; color: var(--text); }' +
        '.thr-meta-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }' +
        '.thr-count { font-size: 10.5px; color: var(--muted); padding: 2px 8px; background: var(--bg3); border-radius: 999px; }' +
        '.thr-badge { background: linear-gradient(135deg,#0088cc,#00c6ff); color: #fff; min-width: 20px; height: 20px; border-radius: 999px; font-size: 11px; font-weight: 800; padding: 0 6px; display: flex; align-items: center; justify-content: center; line-height: 1; box-shadow: 0 2px 8px rgba(0,136,204,0.4); }' +
        '.thr-rename { font-size: 11px; opacity: 0.4; cursor: pointer; padding: 2px; flex-shrink: 0; }' +
        '.thr-rename:hover { opacity: 1; }' +
        '</style>';

    const cards = (threads || []).map(thr => {
        const tid = String(thr.id);
        const lastReadTs = lastRead[tid] || 0;
        const msgs = threadMsgs[tid] || (tid === 'general' ? communityFeed : []);
        const unread = msgs.filter(m => (m.timestamp || 0) > lastReadTs).length;
        const lm = thr.last_msg;

        let preview = 'Noch keine Nachrichten';
        if (lm) {
            if (lm.type === 'photo') preview = '📷 Foto';
            else if (lm.type === 'video') preview = '🎬 Video';
            else if (lm.type === 'sticker') preview = '🎭 Sticker';
            else preview = (lm.text || '').slice(0, 80);
        }
        const author = lm && lm.name ? lm.name : '';
        const lmTime = formatTime(lm && lm.timestamp);

        const { icon, grad } = smartIcon(thr.name, tid);
        const safeName = esc(thr.name || ('Thread ' + tid));
        const isLive = (Date.now() - (lm && lm.timestamp || 0)) < 60000;

        const renameBtn = isAdmin ?
            '<span class="thr-rename" onclick="event.preventDefault();event.stopPropagation();renameThread(\'' + tid + '\',\'' + safeName.replace(/'/g, "\\'") + '\')">✏️</span>' : '';

        return '<a href="/nachrichten/gruppe/' + tid + '" class="thr-card' + (unread > 0 ? ' unread' : '') + '">' +
            '<div class="thr-icon" style="background:' + grad + '">' +
                icon +
                (isLive ? '<span class="thr-icon-pulse"></span>' : '') +
            '</div>' +
            '<div class="thr-content">' +
                '<div class="thr-head">' +
                    '<div class="thr-name">' + safeName + renameBtn + '</div>' +
                    (lmTime ? '<div class="thr-time">' + lmTime + '</div>' : '') +
                '</div>' +
                '<div class="thr-foot">' +
                    '<div class="thr-preview">' +
                        (author ? '<span class="thr-author">' + esc(author) + ':</span> ' : '') +
                        esc(preview) +
                    '</div>' +
                    '<div class="thr-meta-right">' +
                        (unread > 0 ?
                            '<div class="thr-badge">' + (unread > 99 ? '99+' : unread) + '</div>' :
                            '<div class="thr-count">' + (thr.msg_count || 0) + '</div>'
                        ) +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</a>';
    }).join('');

    return appPerf + styles + '<div class="thr-list">' + cards + '</div>';
};
