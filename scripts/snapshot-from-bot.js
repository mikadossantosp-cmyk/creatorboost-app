#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────
// Schritt 1 des Bot-Service-Umzugs: Live-Daten vom telegram-bot ziehen,
// als timestamped Backup ablegen UND in den App-eigenen Datastore importieren.
//
// Lesend gegen den Bot (GET /admin/raw-export) — verändert am Bot NICHTS.
// Schreibt nur in das DATA_DIR der App. Damit ist das die sichere Backup-
// Grundlage, die jeder weiteren Migrations-Etappe vorausgeht.
//
// Der Bot muss dafür MIGRATION_EXPORT=1 gesetzt haben (sonst 404). Wir nutzen
// bewusst NICHT GET /data — das strippt password_hash/Tokens und merged Likes,
// wäre also kein vollständiger Abzug (Email-Login würde nach Cutover brechen).
//
//   MAINBOT_URL=https://<bot> BRIDGE_SECRET=<secret> npm run migrate:snapshot
// ────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const https = require('https');
const http = require('http');
const datastore = require('../datastore');

const MAINBOT_URL   = (process.env.MAINBOT_URL || '').replace(/\/$/, '');
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';
if (!MAINBOT_URL || !BRIDGE_SECRET) {
    console.error('FEHLER: MAINBOT_URL und BRIDGE_SECRET müssen gesetzt sein.');
    process.exit(1);
}

function fetchData() {
    return new Promise((resolve, reject) => {
        const u = new URL(MAINBOT_URL + '/admin/raw-export');
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request(u, { method: 'GET', headers: { 'x-bridge-secret': BRIDGE_SECRET }, timeout: 30000 }, (res) => {
            if (res.statusCode !== 200) { res.resume(); reject(new Error('Bot antwortete HTTP ' + res.statusCode)); return; }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Antwort kein gültiges JSON: ' + e.message)); } });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Timeout nach 30s')));
        req.end();
    });
}

(async () => {
    console.log('[snapshot] Hole Live-Daten:', MAINBOT_URL + '/admin/raw-export');
    const data = await fetchData();
    if (!data || !data.users) throw new Error('Snapshot ohne users-Key — abgebrochen.');

    const backupDir = datastore.DATA_DIR + '/migration-backups';
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = backupDir + '/daten-' + ts + '.json';
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    console.log('[snapshot] Backup geschrieben:', backupFile);

    const st = datastore.importSnapshot(data);
    console.log('[snapshot] In App-Datastore importiert:', datastore.DATA_FILE);
    console.log('[snapshot] Stats:', JSON.stringify(st));
    console.log('[snapshot] Fertig.');
})().catch(e => { console.error('[snapshot] FEHLER:', e.message); process.exit(1); });
