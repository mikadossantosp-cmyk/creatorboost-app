// patch-bot.js - Build-time Patches fur bot.js
const fs = require('fs');
const path = require('path');

const BOT = path.resolve(__dirname, 'bot.js');
let src = fs.readFileSync(BOT, 'utf8');
let changed = false;

// Patch 1: Regeln-Tab
const REGELN_PATCH = /regeln: `<div style="padding:48px[\s\S]*?`,/;
const REGELN_REPLACE = "regeln: require('./regeln-tab'),";

if (src.includes("regeln: require('./regeln-tab')")) {
    console.log('[patch-bot] Regeln-Tab bereits gepatched');
} else if (REGELN_PATCH.test(src)) {
    src = src.replace(REGELN_PATCH, REGELN_REPLACE);
    console.log('[patch-bot] Regeln-Tab gepatched');
    changed = true;
} else {
    console.error('[patch-bot] FEHLER: regeln-Placeholder nicht gefunden');
    process.exit(1);
}

// Patch 2: Chat-Liste in /nachrichten - Instagram DM Style
const DM_PATCH = /const convHtml = `\s*\n<a href="\/nachrichten\/gruppe"[\s\S]*?<div class="empty-sub">Schreibe jemandem!<\/div><\/div>'\);/;
const DM_REPLACE = "const convHtml = require('./chat-list-render')({ myConvos, botData, myUid, feedPreview, totalThreadUnread, ladeBild, adminIds });";

if (src.includes("require('./chat-list-render')")) {
    console.log('[patch-bot] DM-Liste bereits gepatched');
} else if (DM_PATCH.test(src)) {
    src = src.replace(DM_PATCH, DM_REPLACE);
    console.log('[patch-bot] DM-Liste auf Insta-Style gepatched');
    changed = true;
} else {
    console.warn('[patch-bot] WARNUNG: DM-Listen Pattern nicht gefunden - Style bleibt alt');
}

if (changed) {
    fs.writeFileSync(BOT, src);
    console.log('[patch-bot] bot.js gespeichert');
} else {
    console.log('[patch-bot] keine Anderungen notig');
}
