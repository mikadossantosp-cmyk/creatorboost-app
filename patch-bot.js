// patch-bot.js - Build-time Patches fur bot.js
const fs = require('fs');
const path = require('path');

const BOT = path.resolve(__dirname, 'bot.js');
let src = fs.readFileSync(BOT, 'utf8');
let changed = false;

function tryPatch(name, regex, replacement, alreadyMarker) {
    if (alreadyMarker && src.includes(alreadyMarker)) {
        console.log('[patch-bot] ' + name + ' bereits gepatched');
        return true;
    }
    if (regex.test(src)) {
        src = src.replace(regex, replacement);
        console.log('[patch-bot] ' + name + ' gepatched');
        changed = true;
        return true;
    }
    console.warn('[patch-bot] WARNUNG: ' + name + ' Pattern nicht gefunden');
    return false;
}

// Patch 1: Regeln-Tab
if (!tryPatch(
    'Regeln-Tab',
    /regeln: `<div style="padding:48px[\s\S]*?`,/,
    "regeln: require('./regeln-tab'),",
    "regeln: require('./regeln-tab')"
)) {
    console.error('[patch-bot] FEHLER: Regeln-Patch erforderlich aber nicht gefunden');
    process.exit(1);
}

// Patch 2: DM-Liste in /nachrichten
tryPatch(
    'DM-Liste',
    /const convHtml = `\s*\n<a href="\/nachrichten\/gruppe"[\s\S]*?<div class="empty-sub">Schreibe jemandem!<\/div><\/div>'\);/,
    "const convHtml = require('./chat-list-render')({ myConvos, botData, myUid, feedPreview, totalThreadUnread, ladeBild, adminIds });",
    "require('./chat-list-render')"
);

// Patch 3: Telegram-Threads-Liste in /nachrichten/gruppe
tryPatch(
    'Threads-Liste cards',
    /const cards = threads\.map\(thr => \{[\s\S]*?\}\)\.join\(''\);/,
    "const cards = require('./thread-list-render')({ threads, threadMsgs, lastRead, communityFeed, isAdmin });",
    "require('./thread-list-render')"
);

tryPatch(
    'Threads-Liste Container',
    /<div style="padding:12px 12px 100px;display:grid;grid-template-columns:1fr 1fr;gap:10px">\$\{cards\}<\/div>/,
    '${cards}',
    null
);

// Patch 4: Chat-Detail Bubbles - Insta DM Style
tryPatch(
    'Chat-Detail Bubbles',
    /const msgsHtml = msgs\.map\(m => \{[\s\S]*?\}\)\.join\(''\);/,
    "const msgsHtml = require('./chat-detail-render')({ msgs, myUid, otherUid, otherUser, ladeBild });",
    "require('./chat-detail-render')"
);

if (changed) {
    fs.writeFileSync(BOT, src);
    console.log('[patch-bot] bot.js gespeichert');
} else {
    console.log('[patch-bot] keine Anderungen notig');
}
