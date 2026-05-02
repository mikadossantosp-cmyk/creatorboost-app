// bot-loader.js
// Startet bot.js mit Runtime-Patch fur den Regeln-Tab
// Damit muss bot.js nicht geandert werden

const fs = require('fs');
const path = require('path');
const Module = require('module');

const BOT_PATH = path.join(__dirname, 'bot.js');

let src;
try {
    src = fs.readFileSync(BOT_PATH, 'utf8');
} catch (e) {
    console.error('[bot-loader] bot.js nicht lesbar:', e.message);
    process.exit(1);
}

// Patch: regeln-Tab Placeholder durch require('./regeln-tab') ersetzen
const PATCH_REGEX = /regeln: `<div style="padding:48px[^`]*`,/;
const REPLACEMENT = "regeln: require('./regeln-tab'),";

if (PATCH_REGEX.test(src)) {
    src = src.replace(PATCH_REGEX, REPLACEMENT);
    console.log('[bot-loader] Regeln-Tab Patch angewendet');
} else if (src.includes("regeln: require('./regeln-tab')")) {
    console.log('[bot-loader] Regeln-Tab bereits gepatched (skip)');
} else {
    console.log('[bot-loader] Regeln-Tab Placeholder nicht gefunden - fahre ohne Patch fort');
}

// Modifiziertes bot.js zur Laufzeit kompilieren und ausfuhren
const m = new Module(BOT_PATH, module);
m.filename = BOT_PATH;
m.paths = Module._nodeModulePaths(path.dirname(BOT_PATH));

try {
    m._compile(src, BOT_PATH);
    console.log('[bot-loader] bot.js gestartet');
} catch (e) {
    console.error('[bot-loader] Fehler beim Starten von bot.js:', e);
    throw e;
}
