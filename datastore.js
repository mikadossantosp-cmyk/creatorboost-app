// ────────────────────────────────────────────────────────────────────────
// App-eigener JSON-Datastore (Schritt 1 des Bot-Service-Umzugs).
//
// Ziel: Die App soll den Datenspeicher selbst besitzen, der heute noch im
// telegram-bot (/data/daten.json) liegt. Hier liegt die App-eigene Kopie in
// EXAKT der gleichen JSON-Struktur ("JSON wie jetzt"), inkl. der einzigen
// nicht-trivialen Serialisierung: links[].likes ist im Speicher ein Set,
// auf der Platte ein Array (identisch zum Mainbot).
//
// WICHTIG (Phase 1): Dieses Modul wird vom laufenden App-Server noch NICHT
// gelesen oder geschrieben — es ist die Grundlage + das Seed/Backup-Tool.
// Erst spätere Etappen routen Lese-/Schreibpfade hierher (hinter Flag).
// Dadurch ist dieser Schritt vollständig umkehrbar.
// ────────────────────────────────────────────────────────────────────────
const fs = require('fs');

const DATA_DIR  = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = process.env.APP_DATA_FILE || (DATA_DIR + '/daten.json');

// Struktur 1:1 gespiegelt vom Mainbot (initiales `d` + load()-Defaults),
// damit ein frischer Store dieselben Keys hat wie der Bot.
function defaults() {
    return {
        users: {}, chats: {}, links: {},
        tracker: {}, counter: {},
        gepostet: [], seasonStart: Date.now(), seasonGewinner: [],
        communityFeed: [],
        threadMessages: {}, threads: [],
        dailyLogins: {}, dailyGroupMsgs: {}, threadLastRead: {},
        dailyXP: {}, weeklyXP: {}, dailyReset: null, weeklyReset: null,
        bonusLinks: {},
        wochenGewinnspiel: { aktiv: true, gewinner: [], letzteAuslosung: null },
        warteNachricht: {}, dmNachrichten: {}, instaWarte: {},
        missionen: {}, wochenMissionen: {}, missionQueue: {}, missionAuswertungErledigt: {},
        gesternDailyXP: {}, badgeTracker: {}, m1Streak: {},
        backupDatum: null, _lastEvents: {}, _seenEngagementJobs: {},
        xpEvent: { aktiv: false, multiplier: 1, start: null, end: null, announced: false },
        superlinks: {}, fullEngagementThreadId: null,
        appChat: [], appChatLastRead: {},
        newsletter: [], pinnedEngages: {}, weeklyHistory: [],
        notifications: {},
        mindsetStories: { weeklyState: { week: null, pickedUid: null, pickedAt: null, locked: false }, waitlist: {}, rejected: {}, done: {} },
    };
}

let d = defaults();

// Platten-Form -> Speicher-Form: links[].likes Array -> Set (wie Mainbot laden()).
function rehydrate(obj) {
    if (obj && obj.links) {
        for (const k of Object.keys(obj.links)) {
            const link = obj.links[k];
            if (!link || typeof link !== 'object') { delete obj.links[k]; continue; }
            link.likes = new Set((Array.isArray(link.likes) ? link.likes : (link.likes instanceof Set ? Array.from(link.likes) : [])).map(String));
            link.msgId = Number(k);
            if (!link.likerNames) link.likerNames = {};
        }
    }
    return obj;
}

// Speicher-Form -> Platten-Form: links[].likes Set -> Array (wie Mainbot speichern()).
function serialize(src) {
    const s = Object.assign({}, src);
    s.links = {};
    for (const [k, v] of Object.entries(src.links || {})) {
        const likes = v.likes instanceof Set ? Array.from(v.likes) : (Array.isArray(v.likes) ? v.likes : []);
        s.links[k] = Object.assign({}, v, { likes });
    }
    return s;
}

function load() {
    try {
        if (!fs.existsSync(DATA_FILE)) return d;
        const geladen = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        d = rehydrate(Object.assign(defaults(), geladen));
    } catch (e) { console.error('[datastore] load fehlgeschlagen:', e.message); }
    return d;
}

let isSaving = false, savePending = false;
function save() {
    if (isSaving) { savePending = true; return; }
    isSaving = true;
    try {
        const tmp = DATA_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(serialize(d), null, 2));
        fs.renameSync(tmp, DATA_FILE); // atomar (wie Mainbot)
    } catch (e) { console.error('[datastore] save fehlgeschlagen:', e.message); }
    finally { isSaving = false; if (savePending) { savePending = false; setTimeout(save, 100); } }
}

let saveTimer = null;
function saveDebounced() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; save(); }, 2000); }

function stats() {
    return {
        users: Object.keys(d.users || {}).length,
        links: Object.keys(d.links || {}).length,
        superlinks: Object.keys(d.superlinks || {}).length,
        threads: (d.threads || []).length,
        threadMessages: Object.keys(d.threadMessages || {}).length,
        notifications: Object.keys(d.notifications || {}).length,
    };
}

// Einmal-Seed aus einem Mainbot /data-Snapshot. Überschreibt den Store komplett.
function importSnapshot(obj) {
    if (!obj || typeof obj !== 'object' || !obj.users) throw new Error('ungültiger Snapshot (kein users-Key)');
    d = rehydrate(Object.assign(defaults(), obj));
    save();
    return stats();
}

function getData() { return d; }

module.exports = { DATA_DIR, DATA_FILE, defaults, getData, load, save, saveDebounced, stats, importSnapshot, serialize, rehydrate };
