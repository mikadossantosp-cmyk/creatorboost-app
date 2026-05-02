// bot-preload.js
// Wird via NODE_OPTIONS="--require ./bot-preload.js" geladen
// Setzt einen Module._compile-Hook der bot.js beim Laden patched
// Egal welcher Start-Command laeuft - der Hook greift

const path = require('path');
const Module = require('module');

const BOT_PATH = path.resolve(__dirname, 'bot.js');

const PATCH_REGEX = /regeln: `<div style="padding:48px[\s\S]*?`,/;
const REPLACEMENT = "regeln: require('./regeln-tab'),";

const origCompile = Module.prototype._compile;
Module.prototype._compile = function(content, filename) {
    if (filename === BOT_PATH) {
        if (content.includes("regeln: require('./regeln-tab')")) {
            console.log('[bot-preload] bot.js bereits gepatched (skip)');
        } else if (PATCH_REGEX.test(content)) {
            content = content.replace(PATCH_REGEX, REPLACEMENT);
            console.log('[bot-preload] bot.js Regeln-Tab gepatched');
        } else {
            console.log('[bot-preload] WARNUNG: regeln-Placeholder in bot.js nicht gefunden');
        }
    }
    return origCompile.call(this, content, filename);
};

console.log('[bot-preload] Hook aktiv - wartet auf bot.js');
