#!/usr/bin/env node
/**
 * Contract-Check: stellt sicher, dass JEDER Mainbot-(Bridge-)Endpoint, den die
 * creatorboost-app aufruft, im telegram-bot auch wirklich existiert.
 *
 * Verhindert die Bug-Klasse "Endpoint im Mainbot als 'orphan' entfernt → App-Funktion
 * geht nicht mehr" (z.B. /like-from-app, /add-xp, /remove-xp …).
 *
 * Nutzung:
 *   node scripts/check-endpoints.js [pfad/zu/telegram-bot/bot.js]
 *   MAINBOT_FILE=/pfad/bot.js node scripts/check-endpoints.js
 * Default: ../telegram-bot/bot.js (Sibling-Ordner).
 *
 * Exit-Code 0 = ok, 1 = fehlende Endpoints, 2 = Datei nicht lesbar.
 * Erfasst: literale fetchBot/fetchBotRaw/postBot-Pfade, das allowedActions-Array
 * (dynamischer Admin-Dispatch) und action:'/…'-Properties (Prize/Roulette).
 * Nicht erfasst: rein per Variable gebaute Pfade (lib.get(botUrl) für Bild-/File-Proxy).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP_FILE = path.join(__dirname, '..', 'bot.js');
const BOT_FILE = process.argv[2] || process.env.MAINBOT_FILE
  || path.join(__dirname, '..', '..', 'telegram-bot', 'bot.js');

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { console.error('❌ Kann Datei nicht lesen: ' + p + '  (' + e.message + ')'); process.exit(2); }
}
const appSrc = read(APP_FILE);
const botSrc = read(BOT_FILE);

// ── Mainbot: definierte Routes sammeln ───────────────────────────────────────
const routes = new Set();
let m;
const routeRe = /app\.(?:get|post|put|delete|all)\(\s*['"`]([^'"`]+)['"`]/g;
while ((m = routeRe.exec(botSrc))) {
  // Auskommentierte "… entfernt"-Notizen NICHT als echte Route zählen:
  // wenn vor dem Match in derselben Zeile ein "//" steht, ist es ein Kommentar.
  const lineStart = botSrc.lastIndexOf('\n', m.index) + 1;
  if (botSrc.slice(lineStart, m.index).includes('//')) continue;
  routes.add(m[1].split('?')[0]);
}

function routeExists(called) {
  if (routes.has(called)) return true;
  for (const r of routes) {
    if (r.includes(':')) {                       // /thread-messages/:id ↔ /thread-messages/123
      const prefix = r.slice(0, r.indexOf(':'));
      if (called === prefix || called.startsWith(prefix)) return true;
    }
    if (called.endsWith('/') && r.startsWith(called)) return true;
  }
  return false;
}

// ── App: aufgerufene Mainbot-Pfade sammeln ───────────────────────────────────
const called = new Map();                        // pfad → [zeilennummern]
function add(p, idx) {
  if (!p) return;
  p = p.split('?')[0].split('${')[0].trim();     // query + template-platzhalter abschneiden
  if (!p || p === '/') return;
  if (!p.startsWith('/')) p = '/' + p;
  if (!called.has(p)) called.set(p, []);
  called.get(p).push(appSrc.slice(0, idx).split('\n').length);
}

// 1) Literale erste Argumente von fetchBot / fetchBotRaw / postBot
const callRe = /\b(?:fetchBotRaw|fetchBot|postBot)\(\s*['"`]([^'"`+]*)/g;
while ((m = callRe.exec(appSrc))) if (m[1] && m[1].indexOf('/') === 0) add(m[1], m.index);

// 2) allowedActions = [ '…', … ]  → dynamischer Admin-Dispatch postBot('/' + action)
const allowedRe = /allowedActions\s*=\s*\[([^\]]+)\]/g;
while ((m = allowedRe.exec(appSrc))) {
  (m[1].match(/['"]([^'"]+)['"]/g) || []).forEach(s => add(s.replace(/['"]/g, ''), m.index));
}

// 3) action: '/…'  (Prize/Roulette-Dispatch postBot(prize.action))
const actionRe = /\baction\s*:\s*['"](\/[a-z][a-z0-9-]*)['"]/g;
while ((m = actionRe.exec(appSrc))) add(m[1], m.index);

// ── Diff ─────────────────────────────────────────────────────────────────────
const missing = [];
for (const [p, lines] of called) if (!routeExists(p)) missing.push({ p, lines: [...new Set(lines)] });

if (missing.length === 0) {
  console.log('✅ Contract-Check OK — alle ' + called.size + ' von der App aufgerufenen Mainbot-Endpoints existieren im telegram-bot.');
  process.exit(0);
}
console.error('❌ FEHLENDE Mainbot-Endpoints — die App ruft sie auf, der telegram-bot hat sie NICHT:\n');
missing.forEach(x => console.error('   ' + x.p + '   (bot.js:' + x.lines.join(',') + ')'));
console.error('\n→ Diese Endpoints im telegram-bot wiederherstellen, sonst gehen App-Funktionen nicht.');
console.error('  (Mainbot-Datei geprüft: ' + BOT_FILE + ')');
process.exit(1);
