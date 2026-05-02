// bot-loader.js
// Hookt Module._compile, patched bot.js zur Laufzeit, dann require() es.
// Das ist der robuste Standard-Pattern fur Runtime-Code-Patching in Node.js.

const path = require('path');
const Module = require('module');

const BOT_PATH = path.resolve(__dirname, 'bot.js');

const PATCH_REGEX = /regeln: `<div style="padding:48px[\s\S]*?`,/;
const REPLACEMENT = "regeln: require('./regeln-tab'),";

// _compile vor dem ersten require hooken
const origCompile = Module.prototype._compile;
Module.prototype._compile = function(content, filename) {
    if (filename === BOT_PATH) {
        if (content.includes("regeln: require('./regeln-tab')")) {
            console.log('[bot-loader] bot.js bereits gepatched');
        } else if (PATCH_REGEX.test(content)) {
            content = content.replace(PATCH_REGEX, REPLACEMENT);
            console.log('[bot-loader] bot.js Regeln-Tab gepatched');
        } else {
            console.log('[bot-loader] WARNUNG: regeln-Placeholder in bot.js nicht gefunden');
        }
    }
    return origCompile.call(this, content, filename);
};

// argv[1] auf bot.js setzen damit require.main === module-Check funktioniert
process.argv[1] = BOT_PATH;

// Jetzt bot.js normal laden - der Hook patcht es beim Compile
console.log('[bot-loader] Starte bot.js...');
require(BOT_PATH);
