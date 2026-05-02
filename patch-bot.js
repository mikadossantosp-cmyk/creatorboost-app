// patch-bot.js - Build-time Patch fur bot.js Regeln-Tab
const fs = require('fs');
const path = require('path');

const BOT = path.resolve(__dirname, 'bot.js');
let src = fs.readFileSync(BOT, 'utf8');

const PATCH = /regeln: `<div style="padding:48px[\s\S]*?`,/;
const REPLACE = "regeln: require('./regeln-tab'),";

if (src.includes("regeln: require('./regeln-tab')")) {
    console.log('[patch-bot] bot.js bereits gepatched');
} else if (PATCH.test(src)) {
    src = src.replace(PATCH, REPLACE);
    fs.writeFileSync(BOT, src);
    console.log('[patch-bot] bot.js Regeln-Tab erfolgreich gepatched');
} else {
    console.error('[patch-bot] FEHLER: regeln-Placeholder nicht gefunden');
    process.exit(1);
}
