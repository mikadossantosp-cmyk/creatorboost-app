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
        funnel: { events: [], daily: {} },
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

let _loadFailed = false;
function load() {
    try {
        if (!fs.existsSync(DATA_FILE)) return d;
        const geladen = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        d = rehydrate(Object.assign(defaults(), geladen));
        _normalizeUsers(d);
        return d;
    } catch (e) {
        console.error('[datastore] load fehlgeschlagen:', e.message);
        // Recovery: neuestes Migrations-Backup laden statt mit leerem Store weiterzulaufen.
        try {
            const bdir = DATA_DIR + '/migration-backups';
            const files = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => f.endsWith('.json')).sort().reverse() : [];
            if (files[0]) {
                d = rehydrate(Object.assign(defaults(), JSON.parse(fs.readFileSync(bdir + '/' + files[0], 'utf8'))));
                _normalizeUsers(d);
                console.error('[datastore] aus Backup wiederhergestellt:', files[0]);
                return d;
            }
        } catch (e2) { console.error('[datastore] Backup-Recovery fehlgeschlagen:', e2.message); }
        // Kein Backup → NICHT mit leerem Store weiterlaufen + die (evtl. rettbare) Datei überschreiben.
        _loadFailed = true;
        console.error('[datastore] KEIN Backup gefunden — save() wird blockiert, um Totalverlust zu verhindern.');
    }
    return d;
}

let isSaving = false, savePending = false;
function save() {
    if (_loadFailed) { console.error('[datastore] save BLOCKIERT — Load war fehlgeschlagen, überschreibe die Datei nicht.'); return; }
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
    _normalizeUsers(d);
    save();
    return stats();
}

// User-Normalisierung 1:1 aus dem Bot-laden() — damit der In-Memory-Zustand
// exakt dem des Bots entspricht (started/instagram/inGruppe/projects/diamonds
// Defaults + Admin-Reset). Idempotent.
const _CREATORBOOST_UID = 'creatorboost';
function _normalizeUsers(data) {
    const adminIds = (Array.isArray(data._adminIds) ? data._adminIds.map(String) : []);
    for (const uid in (data.users || {})) {
        const u = data.users[uid];
        if (!u || typeof u !== 'object') continue;
        if (uid !== _CREATORBOOST_UID && !u.isSystem) {
            u.started = true;
            if (!u.instagram) u.instagram = null;
            if (adminIds.includes(String(uid))) { u.xp = 0; u.level = 1; u.role = '⚙️ Admin'; }
        }
        if (u.inGruppe === undefined) u.inGruppe = true;
        if (!u.projects) u.projects = [];
        if (u.diamonds === undefined) u.diamonds = 0;
    }
}

function getData() { return d; }

// ── Family-Helfer (1:1 aus dem Bot portiert) — für die /data-Projektion. ──
function _getRootUid(data, uid) { return data.users[uid]?.parent_uid ? String(data.users[uid].parent_uid) : String(uid); }
function _familyUids(data, uid) {
    const u = data.users[uid];
    const set = new Set([String(uid)]);
    if (!u) return [...set];
    const rootUid = u.parent_uid ? String(u.parent_uid) : String(uid);
    set.add(rootUid);
    const root = data.users[rootUid];
    if (root) {
        if (root.subUid) set.add(String(root.subUid));
        if (Array.isArray(root.subUids)) root.subUids.forEach(s => set.add(String(s)));
    }
    for (const [otherUid, otherUser] of Object.entries(data.users || {})) {
        if (otherUser && String(otherUser.parent_uid || '') === rootUid) set.add(String(otherUid));
    }
    return [...set];
}

// Erzeugt EXAKT die Projektion, die der Bot über GET /data ausliefert:
//   - sensitive Felder (password_hash/salt, Token-Maps) entfernt
//   - Likes nach URL gemerged + Poster-Family in die Like-Liste injiziert
//   - _adminIds durchgereicht
// So bekommt der Rest der App im LOCAL_STORE-Modus die gewohnte /data-Form.
function projectDataLikeBot(d) {
    const out = Object.assign({}, d);
    out._adminIds = d._adminIds;
    if (out.users && typeof out.users === 'object') {
        const safeUsers = {};
        for (const [uid, u] of Object.entries(out.users)) {
            if (!u || typeof u !== 'object') { safeUsers[uid] = u; continue; }
            const { password_hash, password_salt, _password_hash, _password_salt, pendingEmailToken, emailLoginTokens, ...safe } = u;
            safeUsers[uid] = safe;
        }
        out.users = safeUsers;
    }
    delete out.emailLoginTokens;
    delete out.emailConfirmTokens;
    delete out.pendingEmailConfirms;
    delete out.accountUnlockTokens;
    delete out.passwordResetTokens;

    const likesByUrl = {};
    for (const [, v] of Object.entries(d.links || {})) {
        const url = (v.text || '').trim();
        if (!url) continue;
        if (!likesByUrl[url]) likesByUrl[url] = { likes: new Set(), likerNames: {} };
        const vl = v.likes instanceof Set ? v.likes : new Set((Array.isArray(v.likes) ? v.likes : []).map(String));
        vl.forEach(uid => likesByUrl[url].likes.add(String(uid)));
        Object.assign(likesByUrl[url].likerNames, v.likerNames || {});
    }
    out.links = {};
    for (const [k, v] of Object.entries(d.links || {})) {
        const url = (v.text || '').trim();
        const merged = likesByUrl[url] || { likes: new Set(), likerNames: {} };
        const likesArr = Array.from(merged.likes);
        // Self-Like für die GANZE Owner-Family: Family darf eigene Posts nicht liken
        // (Self-Block), daher zählen sie automatisch als Liker → eigene/Family-Posts
        // zeigen "geliked" und verlangen kein Like. Die Mission filtert konsistent dazu
        // (familyUids), damit kein Family-Post im Nenner hängt.
        for (const fUid of _familyUids(d, String(v.user_id))) {
            if (!likesArr.includes(fUid)) likesArr.push(fUid);
        }
        out.links[k] = Object.assign({}, v, { likes: likesArr, likerNames: merged.likerNames });
    }
    return out;
}

module.exports = { DATA_DIR, DATA_FILE, defaults, getData, load, save, saveDebounced, stats, importSnapshot, serialize, rehydrate, projectDataLikeBot };
