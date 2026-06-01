// ────────────────────────────────────────────────────────────────────────
// Bot-Logik, 1:1 aus telegram-bot/bot.js portiert (Etappe 3 des Umzugs).
//
// WICHTIG: Diese Funktionen sind VERBATIM-Kopien aus dem Bot — nur angepasst:
//   - operieren auf dem injizierten Datastore `d` (init(store))
//   - Telegram-Aufrufe entfernt; DMs gehen in-app (sendInAppDM/addNotification)
//   - istAdminId ist datengetrieben (d._adminIds) statt env ADMIN_IDS
// Ziel: identisches Verhalten wie der Bot, per Differenz-Test bewiesen.
//
// Wird vom Server nur im LOCAL_STORE-Modus genutzt; ungenutzt = inert.
// ────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
let detectGender;
try { ({ detectGender } = require('./gender-helper')); } catch (e) { detectGender = () => null; }

const CREATORBOOST_UID = 'creatorboost';
const M3_CAP = 30;

let d = null;
function init(store) { d = store; }
// Persistenz übernimmt der Aufrufer (datastore.saveDebounced) — hier No-op,
// damit die verbatim-Kopien unverändert laufen.
function speichernDebounced() {}

// ── datengetrieben statt env: _adminIds kommt aus dem Snapshot (= [...ADMIN_IDS]) ──
function istAdminId(uid) { return Array.isArray(d._adminIds) && d._adminIds.map(String).includes(String(uid)); }

function badgeBonusLinks(xp) { return xp >= 1000 ? 1 : 0; }
function generateSyntheticLinkId() {
    return 'app_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}
function ensureCreatorBoostUser() {
    if (!d.users) d.users = {};
    if (!d.users[CREATORBOOST_UID]) {
        d.users[CREATORBOOST_UID] = {
            id: CREATORBOOST_UID, name: 'CreatorBoost', spitzname: 'CreatorBoost',
            role: '🤖 System', xp: 0, joined: Date.now(), isSystem: true
        };
    }
}
// Einmalige Aufräum-Migration: modernisiert BEREITS gespeicherte CreatorBoost-DMs im
// Chat-Verlauf (Sternchen-Emphase + ━-Balken raus, markante alte Titel → neuer Wortlaut),
// damit auch der bestehende Verlauf zum neuen, dezent-premiumen Stil passt. Läuft genau 1×
// (Flag d._dmTidyV1) und fasst nur Nachrichten an, die VON CreatorBoost stammen.
function _tidyStoredCreatorBoostDMs() {
    if (!d || d._dmTidyV1) return { ok: true, skipped: true };
    if (!d.messages) { d._dmTidyV1 = true; return { ok: true, changed: 0 }; }
    const phraseMap = [
        ['🎉 Badge Aufstieg!', '🎉 Neuer Rang erreicht'],
        ['Badge Aufstieg!', 'Neuer Rang erreicht'],
        ['🎯 Mission 1 erreicht!', '🎯 Mission 1 geschafft'],
        ['Mission 1 erreicht!', 'Mission 1 geschafft'],
        ['✅ 5 Links geliked!', '✅ 5 Links geliked & kommentiert'],
        ['⏳ XP gibt es um 12:00 Uhr', '⏳ Deine XP kommen um 12:00 Uhr'],
    ];
    const tidyOne = (raw) => {
        let t = String(raw || '');
        t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
        t = t.replace(/\*/g, '');
        t = t.split('\n').filter(line => !/^[\s━]*━[\s━]*$/.test(line)).join('\n');
        for (const [from, to] of phraseMap) { if (t.includes(from)) t = t.split(from).join(to); }
        t = t.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
        return t;
    };
    let changed = 0;
    for (const chatKey of Object.keys(d.messages)) {
        if (!String(chatKey).split('_').includes(CREATORBOOST_UID)) continue; // nur CreatorBoost-Chats
        const arr = d.messages[chatKey];
        if (!Array.isArray(arr)) continue;
        for (const m of arr) {
            if (!m || String(m.from) !== CREATORBOOST_UID || !m.text) continue;
            const cleaned = tidyOne(m.text);
            if (cleaned !== m.text) { m.text = cleaned; changed++; }
        }
    }
    d._dmTidyV1 = true;
    return { ok: true, changed };
}
// V2: hebt bereits gespeicherte Ranking-/Link-Regeln-DMs auf den neuen, übersichtlichen
// Wortlaut (z.B. fehlende Platz-Nummer im Tages-/Wochen-Ranking ergänzen). Eigener Flag
// (_dmTidyV2), damit es auch auf Daten läuft, auf denen V1 schon durchlief.
function _tidyStoredCreatorBoostDMsV2() {
    if (!d || d._dmTidyV2) return { ok: true, skipped: true };
    if (!d.messages) { d._dmTidyV2 = true; return { ok: true, changed: 0 }; }
    const medalPlace = { '🥇': 1, '🥈': 2, '🥉': 3 };
    // Kanonischer Link-Regeln-Text (identisch zu postLinkFromApp) — ersetzt alte Versionen
    // im Verlauf, u.a. die sachlich falsche Zeile "2-Wort-Kommentar = Pflicht (M2/M3)".
    const LINK_RULES_CANON = '✅ Dein Link ist gepostet\n\n' +
        'Damit dein Reel zählt, denk an diese 3 Dinge:\n\n' +
        '1. Like heute 5 andere Reels (Mission 1)\n' +
        '2. Öffne jedes Reel erst auf Instagram, like & kommentiere dort — dann hier bestätigen\n' +
        '3. Auswertung ist täglich um 12:00 Uhr\n\n' +
        'Schaffst du die 5 Likes nicht, gibt es eine Verwarnung. Alle Details findest du in den Regeln.';
    const upgradeOne = (raw) => {
        let t = String(raw || '');
        // Alte Link-Regeln-DM (egal welche Variante): beginnt mit "✅ Dein Link ist gepostet".
        // Ältere Fassungen hatten eine falsche M2/M3-Kommentarpflicht → komplett ersetzen.
        if (/^✅\s*Dein Link ist gepostet/.test(t)) {
            return t === LINK_RULES_CANON ? t : LINK_RULES_CANON;
        }
        // Alte Tagesranking-DM: "🎉 🥈 im Tagesranking!\n\nDeine Preise:\n..." → mit Platz-Nummer.
        let m = t.match(/^🎉\s*(🥇|🥈|🥉)\s*im Tagesranking!?/);
        if (m) {
            const place = medalPlace[m[1]];
            const rest = t.replace(/^🎉\s*(🥇|🥈|🥉)\s*im Tagesranking!?\s*\n*/, '').replace(/^Deine Preise:\s*\n*/i, '');
            t = `${m[1]} ${place}. Platz im Tagesranking\n\nStark — du bist heute unter den Top 3! 🎉\n\nDeine Belohnung:\n${rest}`.trim();
            return t;
        }
        // Alte Wochenranking-DM: "🏆 🥇 Wochen-Ranking gewonnen!\n\n..." → mit Platz-Nummer.
        m = t.match(/^🏆\s*(🥇|🥈|🥉)\s*Wochen-Ranking gewonnen!?/);
        if (m) {
            const place = medalPlace[m[1]];
            let rest = t.replace(/^🏆\s*(🥇|🥈|🥉)\s*Wochen-Ranking gewonnen!?\s*\n*/, '').replace(/^Deine Preise:\s*\n*/i, '');
            rest = rest.replace(/\n*\s*Glückwunsch! 🎉\s*$/, '').trim(); // altes Schluss-Glückwunsch raus (Dublette)
            t = `${m[1]} ${place}. Platz im Wochen-Ranking\n\nGlückwunsch! 🎉\n\n${rest}`.trim();
            return t;
        }
        return t;
    };
    let changed = 0;
    for (const chatKey of Object.keys(d.messages)) {
        if (!String(chatKey).split('_').includes(CREATORBOOST_UID)) continue;
        const arr = d.messages[chatKey];
        if (!Array.isArray(arr)) continue;
        for (const msg of arr) {
            if (!msg || String(msg.from) !== CREATORBOOST_UID || !msg.text) continue;
            const up = upgradeOne(msg.text);
            if (up !== msg.text) { msg.text = up; changed++; }
        }
    }
    d._dmTidyV2 = true;
    return { ok: true, changed };
}
// Sammel-Hook für idempotente Daten-Migrationen beim Server-Start. Gibt die Gesamtzahl
// geänderter Einträge zurück, damit der Aufrufer bei Bedarf persistieren kann.
function migrateDataOnBoot() {
    let changed = 0;
    try { const r2 = _tidyStoredCreatorBoostDMsV2(); if (r2 && r2.changed) changed += r2.changed; } catch (e) {}
    try { const r = _tidyStoredCreatorBoostDMs(); if (r && r.changed) changed += r.changed; } catch (e) {}
    return { ok: true, changed };
}

// ── Community-Activity-Ticker (Social-Proof im Feed) ─────────────────────────
function logActivity(type, name, detail) {
    try {
        if (!d) return;
        name = String(name == null ? '' : name).trim();
        if (!name) return;
        if (!Array.isArray(d.communityActivity)) d.communityActivity = [];
        const at = Date.now();
        const last = d.communityActivity[d.communityActivity.length - 1];
        if (last && last.type === type && last.name === name && last.detail === String(detail || '') && (at - last.at) < 60000) return;
        d.communityActivity.push({ type, name: name.slice(0, 40), detail: String(detail || '').slice(0, 60), at });
        while (d.communityActivity.length > 50) d.communityActivity.shift();
    } catch (e) {}
}
function getCommunityActivity(limit) {
    limit = Math.max(1, Math.min(20, Number(limit) || 12));
    const now = Date.now();
    const items = [];
    const adminIds = Array.isArray(d._adminIds) ? d._adminIds.map(Number) : [];
    const isAdm = (uid) => adminIds.includes(Number(uid)) || istAdminId(uid);
    const nameOf = (uid, fallback) => (d.users[uid] && (d.users[uid].spitzname || d.users[uid].name)) || fallback || '';
    if (Array.isArray(d.communityActivity)) {
        for (const a of d.communityActivity) {
            if (!a || !a.name) continue;
            if (a.type === 'rank') items.push({ at: a.at, emoji: '🚀', name: a.name, txt: 'ist jetzt ' + (a.detail || 'aufgestiegen') });
            else if (a.type === 'newmember') items.push({ at: a.at, emoji: '🌟', name: a.name, txt: 'ist neu dabei' });
            else if (a.type === 'milestone') items.push({ at: a.at, emoji: '💎', name: a.name, txt: a.detail || 'hat einen Meilenstein erreicht' });
        }
    }
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
    if (Array.isArray(d.dailyAwardsLog)) {
        for (const a of d.dailyAwardsLog) {
            if (!a || !a.at || (now - a.at) > 36 * 3600 * 1000 || isAdm(a.uid)) continue;
            const nm = nameOf(a.uid, a.name);
            if (nm) items.push({ at: a.at, emoji: medal[a.place] || '🏅', name: nm, txt: 'holte Platz ' + a.place + ' im Tagesranking' });
        }
    }
    if (Array.isArray(d.weeklyAwardsLog)) {
        for (const a of d.weeklyAwardsLog) {
            if (!a || !a.at || (now - a.at) > 4 * 24 * 3600 * 1000 || isAdm(a.uid)) continue;
            const nm = nameOf(a.uid, a.name);
            if (nm) items.push({ at: a.at, emoji: medal[a.place] || '🏅', name: nm, txt: 'holte Platz ' + a.place + ' im Wochen-Ranking' });
        }
    }
    let newToday = 0;
    for (const u of Object.values(d.users || {})) {
        if (u && u.joinDate && (now - u.joinDate) <= 24 * 3600 * 1000 && !u.parent_uid && !u.banned) newToday++;
    }
    if (newToday >= 2) items.push({ at: now - 1, emoji: '👥', name: '', txt: newToday + ' neue Creator heute' });
    items.sort((a, b) => b.at - a.at);
    const seen = new Set();
    const out = [];
    for (const it of items) {
        const key = it.emoji + '|' + it.name + '|' + it.txt;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ emoji: it.emoji, name: it.name, txt: it.txt });
        if (out.length >= limit) break;
    }
    return out;
}
// Backfill: falls noch keine frische Kürung existiert (z.B. nach Feature-Deploy, bevor der
// nächtliche dailyRankingAbschluss erstmals lief), den „Creator des Tages von gestern" aus
// den vorhandenen Aktivitätsdaten küren — gleiche Mindesthürde wie die reguläre Kürung.
// dayKey=gestern → Karte erscheint sofort und wird heute Nacht regulär überschrieben.
function _backfillCreatorSpotlightIfNeeded() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const s = d.creatorSpotlight;
        if (s && s.uid && (s.dayKey === today || s.dayKey === yest)) return; // schon frisch
        // Quelle: Gestern-XP bevorzugt, sonst heutige Tages-XP.
        const src = (d.gesternDailyXP && Object.keys(d.gesternDailyXP).length) ? d.gesternDailyXP : (d.dailyXP || {});
        const ranked = Object.entries(src)
            .filter(([uid, xp]) => Number(xp) > 0 && d.users[uid] && !istAdminId(uid))
            .sort((a, b) => Number(b[1]) - Number(a[1]));
        for (const [uid] of ranked) {
            const u = d.users[uid];
            if (!u || u.banned || u.parent_uid) continue;
            if (!((u.links || 0) >= 1 || (u.appLikeCount || 0) >= 5)) continue;
            const _stk = getStreakApi(uid);
            d.creatorSpotlight = {
                uid: String(uid),
                name: u.spitzname || u.name || 'Creator',
                instagram: u.instagram || null,
                days: Math.max(Number(_stk.streak || 0), Number(u.streakBest || 0)),
                posts: Number(u.links || 0),
                likes: Number(u.appLikeCount || 0),
                dayKey: yest, at: Date.now(), backfilled: true,
            };
            return;
        }
    } catch (e) {}
}
// Creator des Tages (täglich in dailyRankingAbschluss gekürt). Liefert nur, wenn frisch
// (heute oder gestern) — verhindert eine veraltete Karte nach inaktiven Tagen.
function getCreatorSpotlight() {
    try {
        _backfillCreatorSpotlightIfNeeded();
        const s = d.creatorSpotlight;
        if (!s || !s.uid) return null;
        const u = d.users[s.uid];
        if (!u || u.banned) return null;
        const today = new Date().toISOString().slice(0, 10);
        const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (s.dayKey !== today && s.dayKey !== yest) return null;
        return {
            uid: s.uid,
            name: u.spitzname || u.name || s.name || 'Creator',
            instagram: u.instagram || s.instagram || null,
            days: Number(s.days || 0),
            posts: Number(s.posts || 0),
            likes: Number(s.likes || 0),
        };
    } catch (e) { return null; }
}
// Web-Push entfällt im Logik-Modul (kein Zustand) — Verdrahtung übernimmt der Server.
// Zentraler DM-Normalizer: jede ausgehende CreatorBoost-DM läuft hier durch, damit der
// Stil app-weit konsistent ist (reiner Plaintext, keine Markdown-Reste, keine Trennbalken,
// saubere Leerzeilen). Bewusst KEIN Strippen von Unterstrichen — die kommen in Insta-Handles
// und Codes literal vor.
function _polishDM(text) {
    let t = String(text == null ? '' : text);
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1').replace(/\*/g, '');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.split('\n').filter(line => { const s = line.trim(); return !(s.length >= 2 && /^[─-╿‐-―=~_-]+$/.test(s)); }).join('\n');
    t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return t;
}
function sendCreatorBoostDM(toUid, text, options = {}) {
    ensureCreatorBoostUser();
    if (!d.messages) d.messages = {};
    const chatKey = [CREATORBOOST_UID, String(toUid)].sort().join('_');
    if (!d.messages[chatKey]) d.messages[chatKey] = [];
    const clean = _polishDM(text);
    const msg = { from: CREATORBOOST_UID, to: String(toUid), text: clean.slice(0, 1000), timestamp: Date.now(), read: false };
    if (options.link?.url) {
        msg.link = { url: String(options.link.url).slice(0, 500), label: String(options.link.label || 'Öffnen').slice(0, 60) };
    }
    d.messages[chatKey].push(msg);
    if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    addNotification(String(toUid), '💬', 'CreatorBoost: ' + clean.slice(0, 40), CREATORBOOST_UID);
    speichernDebounced();
}
// Thumbnail-Fetch ist async/netzabhängig → optionaler Hook, default No-op.
// Server kann via setThumbnailFetcher() einen echten Fetcher injizieren.
let _fetchThumbnail = null;
function setThumbnailFetcher(fn) { _fetchThumbnail = fn; }
function tryFetchThumbnail(entry, urlField = 'text') {
    if (!entry || !_fetchThumbnail) return;
    const url = entry[urlField];
    if (!url) return;
    Promise.resolve(_fetchThumbnail(url)).then(thumb => {
        if (!thumb) return;
        entry.thumbnail = thumb;
        entry.thumbnailFetchedAt = Date.now();
        speichernDebounced();
    }).catch(() => {});
}

function badge(xp) {
    if (xp >= 25000) return '💎 Legende';
    if (xp >= 10000) return '🌟 Elite+';
    if (xp >= 5000)  return '👑 Elite';
    if (xp >= 1000)  return '🏅 Erfahrener';
    if (xp >= 500)   return '⬆️ Aufsteiger';
    if (xp >= 50)    return '📘 Anfänger';
    return '🆕 New';
}
function level(xp) { return Math.floor(xp / 100) + 1; }

function user(uid, name) {
    if (!d.users[uid]) {
        d.users[uid] = { name: name || '', username: null, instagram: null, bio: null, nische: null, spitzname: null, trophies: [], xp: 0, level: 1, warnings: 0, started: false, links: 0, likes: 0, role: '🆕 New', lastDaily: null, totalLikes: 0, chats: [], joinDate: Date.now(), inGruppe: true, diamonds: 0, projects: [], profileCompletionRewarded: false, inventory: [], activeRing: null, gender: null };
    }
    if (name) d.users[uid].name = name;
    if (istAdminId(uid)) { d.users[uid].xp = 0; d.users[uid].level = 1; d.users[uid].role = '⚙️ Admin'; }
    if (d.users[uid].gender == null) {
        const detected = detectGender(d.users[uid].spitzname || d.users[uid].name);
        if (detected) d.users[uid].gender = detected;
    }
    return d.users[uid];
}

function isSubAccount(uid) { return !!(d.users[uid] && d.users[uid].parent_uid); }
function getRootUid(uid) { return d.users[uid]?.parent_uid ? String(d.users[uid].parent_uid) : String(uid); }

function addNotification(targetUid, icon, text, actorUid = null) {
    if (!d.notifications) d.notifications = {};
    if (!d.notifications[targetUid]) d.notifications[targetUid] = [];
    const entry = { icon, text, timestamp: Date.now(), read: false };
    if (actorUid) entry.actorUid = String(actorUid);
    d.notifications[targetUid].push(entry);
    if (d.notifications[targetUid].length > 50) d.notifications[targetUid].shift();
}
function sendInAppDM(toUid, text) {
    if (!d.users[String(toUid)]) return false;
    if (!d.messages) d.messages = {};
    const chatKey = [CREATORBOOST_UID, String(toUid)].sort().join('_');
    if (!d.messages[chatKey]) d.messages[chatKey] = [];
    const clean = _polishDM(text);
    d.messages[chatKey].push({
        from: CREATORBOOST_UID, to: String(toUid),
        text: clean.slice(0, 2000),
        image: null, audio: null,
        timestamp: Date.now(), read: false, system: true,
    });
    if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    addNotification(String(toUid), '💬', 'CreatorX: ' + clean.slice(0, 40), CREATORBOOST_UID);
    return true;
}
async function dmUser(uid, text) {
    if (isSubAccount(uid)) return;
    // Normalisierung passiert zentral in sendInAppDM/_polishDM.
    sendInAppDM(uid, text);
}

function weekStart(now = Date.now()) {
    const d = new Date(now);
    const day = d.getDay();
    const diff = (day === 0 ? 6 : day - 1);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diff);
    return d.getTime();
}

const _trophyMap = { '📘 Anfänger': '📘', '⬆️ Aufsteiger': '⬆️', '🏅 Erfahrener': '🏅', '👑 Elite': '👑', '🌟 Elite+': '🌟', '💎 Legende': '💎' };
function _levelUpExtra(role) {
    if (role === '💎 Legende') return '\n\n💎 Legenden-Bonus\n\nDu bekommst alles von Elite+ und zusätzlich +30 Diamanten jeden Monat, einen Legenden-Glow ums Profilbild und den Legende-Title.';
    if (role === '🌟 Elite+') return '\n\n🌟 Elite+ Bonus\n\nAb jetzt: 2 Superlinks pro Woche und 1 Bonus-Link pro Woche.';
    if (role === '👑 Elite') return '\n\n👑 Elite Bonus\n\nAb jetzt bekommst du 1 Bonus-Link pro Woche extra.';
    return '';
}
function _badgeUpDM(uid, u, alteBadge) {
    if (alteBadge !== u.role && u.role) {
        if (!u.trophies) u.trophies = [];
        const trophy = _trophyMap[u.role];
        if (trophy && !u.trophies.includes(trophy)) u.trophies.push(trophy);
        if (!istAdminId(uid)) { try { logActivity('rank', (u.spitzname || u.name), u.role); } catch (e) {} }
        dmUser(uid, '🎉 Neuer Rang erreicht\n\n' + alteBadge + '  →  ' + u.role + '\n\n⭐ Gesamt: ' + u.xp + ' XP\n\nWeiter so, du wächst! 💪' + _levelUpExtra(u.role)).catch(() => {});
    }
}

function xpAdd(uid, menge, name) {
    if (istAdminId(uid)) return 0;
    const u = user(uid, name);
    let finalXP = menge;
    if (d.xpEvent?.aktiv && d.xpEvent.multiplier > 1) finalXP = Math.round(menge * d.xpEvent.multiplier);
    const alteBadge = u.role;
    u.xp += finalXP; u.level = level(u.xp); u.role = badge(u.xp);
    if (!d.weeklyXP[uid]) d.weeklyXP[uid] = 0;
    d.weeklyXP[uid] += finalXP;
    _badgeUpDM(uid, u, alteBadge);
    return finalXP;
}
function xpAddNurGesamt(uid, menge, name) {
    if (istAdminId(uid)) return 0;
    const u = user(uid, name);
    let finalXP = menge;
    if (d.xpEvent?.aktiv && d.xpEvent.multiplier > 1) finalXP = Math.round(menge * d.xpEvent.multiplier);
    const alteBadge = u.role;
    u.xp += finalXP; u.level = level(u.xp); u.role = badge(u.xp);
    if (alteBadge !== u.role && u.role) {
        if (!u.trophies) u.trophies = [];
        const trophy = _trophyMap[u.role];
        if (trophy && !u.trophies.includes(trophy)) u.trophies.push(trophy);
    }
    return finalXP;
}
function xpAddMitDaily(uid, menge, name) {
    if (istAdminId(uid)) return 0;
    const u = user(uid, name);
    let finalXP = menge;
    if (d.xpEvent?.aktiv && d.xpEvent.multiplier > 1) finalXP = Math.round(menge * d.xpEvent.multiplier);
    const alteBadge = u.role;
    u.xp += finalXP; u.level = level(u.xp); u.role = badge(u.xp);
    if (!d.dailyXP[uid]) d.dailyXP[uid] = 0;
    d.dailyXP[uid] += finalXP;
    if (!d.weeklyXP[uid]) d.weeklyXP[uid] = 0;
    d.weeklyXP[uid] += finalXP;
    _badgeUpDM(uid, u, alteBadge);
    return finalXP;
}

function addDiamond(uid, amount) {
    const u = d.users[String(uid)];
    if (!u) return;
    if (u.diamonds === undefined) u.diamonds = 0;
    u.diamonds += amount;
}

function applyPostBonus(uid, userName) {
    const out = { xp: 0, diamonds: 0, events: [] };
    if (istAdminId(uid)) return out;
    const now = Date.now();
    if (d.xpEvent?.bonusPerPost && d.xpEvent.bonusPerPost > 0 && d.xpEvent.end && now < d.xpEvent.end) {
        xpAdd(uid, d.xpEvent.bonusPerPost, userName);
        out.xp = d.xpEvent.bonusPerPost;
        out.events.push({ type: 'xp', amount: d.xpEvent.bonusPerPost, label: d.xpEvent.label || '' });
    } else if (d.xpEvent?.bonusPerPost && d.xpEvent.end && now >= d.xpEvent.end) {
        d.xpEvent.bonusPerPost = 0; d.xpEvent.end = null;
    }
    if (d.diamondEvent?.bonusPerPost && d.diamondEvent.bonusPerPost > 0 && d.diamondEvent.end && now < d.diamondEvent.end) {
        addDiamond(uid, d.diamondEvent.bonusPerPost);
        out.diamonds = d.diamondEvent.bonusPerPost;
        out.events.push({ type: 'diamond', amount: d.diamondEvent.bonusPerPost, label: d.diamondEvent.label || '' });
    } else if (d.diamondEvent?.bonusPerPost && d.diamondEvent.end && now >= d.diamondEvent.end) {
        d.diamondEvent.bonusPerPost = 0; d.diamondEvent.end = null;
    }
    return out;
}

function istInstagramLink(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    return t.includes('instagram.com') || t.includes('instagr.am');
}

function getWochenMission(uid) {
    if (!d.wochenMissionen[uid]) d.wochenMissionen[uid] = { m1Tage: 0, m2Tage: 0, m3Tage: 0, letzterTag: null };
    const wm = d.wochenMissionen[uid];
    // Invariante: M1 (5 Likes, einfachste Mission) ist an einem Tag erfüllt, sobald M2 (≥80%
    // geliked) oder M3 (alle geliked) erfüllt ist → m1Tage darf nie unter m2Tage/m3Tage liegen.
    // Korrigiert zugleich Alt-Daten, die der frühere „Reset auf 0"-Bug verfälscht hat.
    const _floor = Math.max(Number(wm.m2Tage) || 0, Number(wm.m3Tage) || 0);
    if ((Number(wm.m1Tage) || 0) < _floor) wm.m1Tage = _floor;
    return wm;
}
function addWeeklyMissionDay(wMission, counterKey, dayKey) {
    const lastKey = counterKey + 'LetzterTag';
    if (wMission[lastKey] === dayKey) return false;
    wMission[counterKey] = (wMission[counterKey] || 0) + 1;
    wMission[lastKey] = dayKey;
    wMission.letzterTag = dayKey;
    return true;
}
function getMission(uid) {
    const heute = new Date().toDateString();
    if (!d.missionen[uid] || d.missionen[uid].date !== heute) {
        d.missionen[uid] = { date: heute, likesGegeben: 0, m1: false, m2: false, m3: false };
    }
    return d.missionen[uid];
}
function updateMissionProgress(uid) {
    if (istAdminId(uid)) return;
    const heute = new Date().toDateString();
    const mission = getMission(uid);
    const _likedUrls = _likedByUrl(uid);
    const heuteLinks = Object.values(d.links).filter(l =>
        istInstagramLink(l.text) && new Date(l.timestamp).toDateString() === heute
    );
    heuteLinks.forEach(l => { if (!l.likes) l.likes = new Set(); });
    // "done" deckungsgleich mit dem Feed-Button (rotes Herz == erledigt).
    const _liked = (l) => _likedUrls.has((l.text || '').trim());
    const gesamt = heuteLinks.length;
    const geliked = heuteLinks.filter(_liked).length;
    const m3Target = Math.min(M3_CAP, gesamt);
    if (gesamt > 0) { mission.m2 = geliked / gesamt >= 0.8; mission.m3 = m3Target > 0 && geliked >= m3Target; }
    else { mission.m2 = false; mission.m3 = false; }
}
async function checkMissionen(uid, name) {
    if (istAdminId(uid)) return;
    const heute = new Date().toDateString();
    const mission = getMission(uid);
    if (!d.missionQueue[uid]) d.missionQueue[uid] = { date: heute, m1Pending: false };
    if (d.missionQueue[uid].date !== heute) d.missionQueue[uid] = { date: heute, m1Pending: false };
    if (!mission.m1 && mission.likesGegeben >= 5) {
        mission.m1 = true;
        d.missionQueue[uid].m1Pending = true;
        try { await dmUser(uid, '🎯 Mission 1 geschafft\n\n✅ 5 Links geliked & kommentiert\n\n⏳ Deine XP kommen um 12:00 Uhr'); } catch (e) {}
        // Referral: Eingeladener hat erstmals Mission 1 geschafft → Einlader bekommt +1 beim
        // Community-Builder (einmalig, idempotent; nur nach Admin-Freigabe der Einladung).
        try { grantReferralMilestone(String(uid), 'm1'); } catch (e) {}
    }
    speichernDebounced();
}
// Family = Hauptaccount + alle Sub-Accounts (parent_uid/subUid/subUids + Reverse-Lookup).
function familyUids(uid) {
    const u = d.users[uid];
    const set = new Set([String(uid)]);
    if (!u) return [...set];
    const rootUid = u.parent_uid ? String(u.parent_uid) : String(uid);
    set.add(rootUid);
    const root = d.users[rootUid];
    if (root) {
        if (root.subUid) set.add(String(root.subUid));
        if (Array.isArray(root.subUids)) root.subUids.forEach(s => set.add(String(s)));
    }
    for (const [otherUid, otherUser] of Object.entries(d.users || {})) {
        if (otherUser && String(otherUser.parent_uid || '') === rootUid) set.add(String(otherUid));
    }
    return [...set];
}
// ── Missions-Status: 1:1 aus telegram-bot GET /mission-status-api ──
// Family-Post aus Sicht des Viewers: Viewer ist in familyUids(owner) — exakt die Posts,
// die projectDataLikeBot als "geliked" padded (Family darf eigene Posts nicht liken).
// Solche Posts gehoeren NICHT in den Missions-Nenner (sonst haengt 20/24 obwohl rot).
// Konsistent mit getRootUid (deckt parent->sub) UND einseitigen subUids-Verknuepfungen.
function _isFamilyPost(viewerUid, ownerUid, cache) {
    ownerUid = String(ownerUid);
    if (cache.has(ownerUid)) return cache.get(ownerUid);
    const r = familyUids(ownerUid).map(String).includes(String(viewerUid));
    cache.set(ownerUid, r);
    return r;
}
// Liefert die Menge der URLs, die fuer den Viewer als "geliked" gelten — EXAKT
// deckungsgleich mit dem Feed-Button (rotes Herz). Der Feed liest projectDataLikeBot:
// Likes werden pro URL (l.text) gemerged UND familyUids(owner) jedes Eintrags gepadded.
// Die Migration kann dieselbe URL auf mehrere Link-Eintraege verteilt haben; der Feed
// zeigt das Herz rot, sobald der Like auf IRGENDEINEM Eintrag dieser URL liegt — oder
// der Viewer zur Family eines Owners dieser URL gehoert. Die Mission muss exakt so
// zaehlen, sonst steht der Button rot, aber die Mission haengt (Like auf anderem Eintrag).
function _likedByUrl(viewerUid) {
    viewerUid = String(viewerUid);
    const realLikers = new Map(); // url -> Set echte Liker
    const owners = new Map();     // url -> Set owner-uids (fuer Family-Padding)
    for (const v of Object.values(d.links || {})) {
        const url = (v.text || '').trim();
        if (!url) continue;
        if (!realLikers.has(url)) { realLikers.set(url, new Set()); owners.set(url, new Set()); }
        const ls = v.likes instanceof Set ? v.likes : new Set((Array.isArray(v.likes) ? v.likes : []).map(String));
        const acc = realLikers.get(url);
        ls.forEach(x => acc.add(String(x)));
        owners.get(url).add(String(v.user_id));
    }
    const _famCache = new Map();
    const set = new Set();
    for (const url of realLikers.keys()) {
        if (realLikers.get(url).has(viewerUid)) { set.add(url); continue; }
        for (const o of owners.get(url)) {
            if (_isFamilyPost(viewerUid, o, _famCache)) { set.add(url); break; }
        }
    }
    return set;
}
function missionStatusApi(uid) {
    uid = String(uid || '');
    if (!uid) return { ok: false };
    const heute = new Date().toDateString();
    const mission = getMission(uid);
    const wMission = getWochenMission(uid);
    const _likedUrls = _likedByUrl(uid);
    const heuteLinks = Object.values(d.links).filter(l =>
        istInstagramLink(l.text) && new Date(l.timestamp).toDateString() === heute
    );
    // "done" = Like auf irgendeinem Eintrag dieser URL ODER Family-Post — beides ist in
    // _likedByUrl gefaltet, exakt deckungsgleich mit dem Feed-Button (rotes Herz == done):
    // was rot ist, zaehlt — auch wenn der echte Like in der Migration auf einem anderen
    // Eintrag derselben URL landete oder der Viewer zur Owner-Family gehoert.
    const _liked = (l) => _likedUrls.has((l.text || '').trim());
    const gesamt = heuteLinks.length;
    const geliked = heuteLinks.filter(_liked).length;
    const prozent = gesamt > 0 ? Math.round((geliked / gesamt) * 100) : 0;
    const m1Live = (mission.likesGegeben || 0) >= 5;
    const m2Live = gesamt > 0 && (geliked / gesamt) >= 0.8;
    const m3Target = Math.min(M3_CAP, gesamt);
    const m3Live = m3Target > 0 && geliked >= m3Target;
    if (mission.m1 !== m1Live) mission.m1 = m1Live;
    if (mission.m2 !== m2Live) mission.m2 = m2Live;
    if (mission.m3 !== m3Live) mission.m3 = m3Live;
    const eigenePosts = Object.values(d.links).filter(l =>
        istInstagramLink(l.text) && new Date(l.timestamp).toDateString() === heute && String(getRootUid(l.user_id)) === String(getRootUid(uid))
    ).length;
    return {
        ok: true,
        daily: {
            likesGegeben: mission.likesGegeben || 0,
            m1: m1Live, m2: m2Live, m3: m3Live,
            gesamtLinks: gesamt, gelikedLinks: geliked,
            m3Target, m3Cap: M3_CAP, prozent, eigenePosts,
            totalInklEigene: gesamt + eigenePosts,
            alleGeliked: gesamt > 0 && geliked === gesamt
        },
        weekly: {
            m1Tage: wMission.m1Tage || 0,
            m2Tage: wMission.m2Tage || 0,
            m3Tage: wMission.m3Tage || 0,
            superlinks: (() => {
                const weekKey = getBerlinWeekKey();
                const weekSL = Object.values(d.superlinks || {}).filter(s => s.week === weekKey);
                if (!weekSL.length) return { total: 0, geliked: 0, alleGeliked: false, granted: false };
                const fam = new Set(familyUids(uid));
                const otherLinks = weekSL.filter(s => !fam.has(String(s.uid)));
                // PRO ACCOUNT: dieser Account muss selbst geliked haben (nicht die Familie) → Subs zählen eigenständig.
                const gelikedSL = otherLinks.filter(s => Array.isArray(s.likes) && s.likes.includes(String(uid))).length;
                const granted = !!(d.wochenSuperlinkMissionGranted && d.wochenSuperlinkMissionGranted[weekKey + ':' + uid]);
                return { total: otherLinks.length, geliked: gelikedSL, alleGeliked: otherLinks.length > 0 && gelikedSL === otherLinks.length, granted };
            })()
        }
    };
}

// ── Wochen-Superlink-Mission: +500 XP für wer ALLE Superlinks der Woche engagiert hat. ──
// Eligibility 1:1 wie die Missions-Karte (getWochenMissionen.weekly.superlinks): es muss ≥1 fremder
// Superlink der Woche existieren und die Familie muss jeden davon geliked haben. Idempotent über
// d.wochenSuperlinkMissionGranted[weekKey+':'+uid]. Vergabe bei der Sonntags-Auswertung + einmaligem Backfill.
function _superlinkAlleGeliked(uid, weekKey) {
    const weekSL = Object.values(d.superlinks || {}).filter(s => s && s.week === weekKey);
    if (!weekSL.length) return false;
    const fam = new Set(familyUids(uid).map(String));
    const otherLinks = weekSL.filter(s => !fam.has(String(s.uid)));   // nicht eigene/Familien-Superlinks
    if (!otherLinks.length) return false;
    for (const s of otherLinks) {
        const likes = (Array.isArray(s.likes) ? s.likes : Array.from(s.likes || [])).map(String);
        if (!likes.includes(String(uid))) return false;              // DIESER Account muss selbst geliked haben
    }
    return true;
}
function grantWeeklySuperlinkMission(weekKey) {
    weekKey = weekKey || getBerlinWeekKey();
    if (!d.wochenSuperlinkMissionGranted) d.wochenSuperlinkMissionGranted = {};
    let granted = 0; const uids = [];
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || istAdminId(uid)) continue;                          // kein Admin; Subs verdienen EIGENSTÄNDIG
        const key = weekKey + ':' + uid;
        if (d.wochenSuperlinkMissionGranted[key]) continue;            // schon vergeben (idempotent)
        if (!_superlinkAlleGeliked(uid, weekKey)) continue;
        d.wochenSuperlinkMissionGranted[key] = Date.now();
        addXp({ uid, amount: 500, reason: 'superlink-mission' });      // DMt automatisch "✨ +500 XP"
        granted++; uids.push(uid);
    }
    return { ok: true, granted, weekKey, uids };
}

// ── Like-Operation: 1:1 aus GET /like-from-app (ohne Telegram-Teile). ──
async function likeFromApp(uid, msgId) {
    let lnk = d.links[msgId] || d.links['B_' + msgId] || d.links['C_' + msgId]
        || Object.values(d.links).find(l => String(l.counter_msg_id) === String(msgId));
    if (!lnk) return { ok: false, error: 'Link nicht gefunden' };
    if (!lnk.likes) lnk.likes = new Set();
    if (!(lnk.likes instanceof Set)) lnk.likes = new Set((Array.isArray(lnk.likes) ? lnk.likes : []).map(String));
    const wasLiked = lnk.likes.has(String(uid));
    if (wasLiked) return { ok: true, liked: true, likes: lnk.likes.size };

    if (String(uid) === String(lnk.user_id)) return { ok: false, error: 'Kein Self-Like' };
    if (String(getRootUid(uid)) === String(getRootUid(lnk.user_id))) return { ok: false, error: 'Kein Self-Like (eigener Account)' };
    lnk.likes.add(String(uid));
    const u = d.users[uid];
    if (!lnk.likerNames) lnk.likerNames = {};
    lnk.likerNames[String(uid)] = { name: u?.name || 'User', insta: u?.instagram || null };
    if (!lnk.likeSource) lnk.likeSource = { app: 0, telegram: 0 };
    lnk.likeSource.app = (lnk.likeSource.app || 0) + 1;

    const istHeutigerLinkApp = new Date(lnk.timestamp).toDateString() === new Date().toDateString();
    const istDieseWocheLinkApp = lnk.timestamp >= weekStart();
    if (!istAdminId(uid)) {
        if (istHeutigerLinkApp)        xpAddMitDaily(uid, 5, u?.name || 'User');
        else if (istDieseWocheLinkApp) xpAdd(uid, 5, u?.name || 'User');
        else                           xpAddNurGesamt(uid, 5, u?.name || 'User');
    }
    if (!istAdminId(uid) && u && lnk.firstPostBonus && lnk.firstPostBonusUntil && Date.now() < lnk.firstPostBonusUntil) {
        xpAdd(uid, 20, u.name || 'User');
        try { sendInAppDM(uid, '🌟 First-Post-Bonus\n\nDu hast den allerersten Post eines neuen Members geliked.\n\n⭐ +20 XP\n\nDanke für deinen Support!'); } catch (e) {}
    }
    if (!istAdminId(uid) && u) {
        u.totalLikes = (u.totalLikes || 0) + 1;
        u.appLikeCount = (u.appLikeCount || 0) + 1;
        if (u.appLikeCount % 100 === 0) {
            addDiamond(uid, 1);
            dmUser(uid, `💎 ${u.appLikeCount} Likes erreicht\n\nDanke fürs fleißige Engagement.\n\n💎 +1 Diamant\n\n💎 Guthaben: ${u.diamonds || 0}`).catch(() => {});
        }
        // Referral: Likes-Meilensteine des Einladers prüfen (50/200 vergebene Likes).
        try { checkReferralProgress(uid); } catch (e) {}
    }
    if (!istAdminId(uid) && u) {
        const _evtBonusL = applyPostBonus(uid, u.name || 'User');
        if (_evtBonusL.events.length) {
            const parts = _evtBonusL.events.map(e => e.type === 'diamond' ? ('💎 +' + e.amount + ' Diamant' + (e.amount !== 1 ? 'en' : '')) : e.type === 'xp' ? ('⭐ +' + e.amount + ' XP') : '').filter(Boolean);
            if (parts.length) { try { sendInAppDM(uid, '🎉 Event-Bonus für deinen Like\n\n' + parts.join('\n') + '\n\nDas Event läuft noch — like weiter!'); } catch (e) {} }
        }
    }
    const mission = getMission(uid);
    updateMissionProgress(uid);
    if (istHeutigerLinkApp && istInstagramLink(lnk.text)) mission.likesGegeben++;
    await checkMissionen(uid, u?.name || 'User');

    // ownerUid + likerName zurück → Route kann Reziprozitäts-Push senden (Push lebt in bot.js).
    return { ok: true, liked: true, likes: lnk.likes.size, ownerUid: String(lnk.user_id || ''), likerName: (u?.spitzname || u?.name || 'Jemand') };
}

// ── Link-Posten: 1:1 aus POST /post-link-from-app (ohne Telegram-Teile). ──
async function postLinkFromApp({ uid, name, url, caption }) {
    if (!uid || !url) return { ok: false, error: 'Ungültig' };
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };

    if (u.postSuspendedUntil && Number(u.postSuspendedUntil) > Date.now()) {
        const daysLeft = Math.ceil((Number(u.postSuspendedUntil) - Date.now()) / 86400000);
        const reason = u.postSuspendReason ? ' — Grund: ' + u.postSuspendReason : '';
        return { ok: false, error: '🚫 Posten gesperrt für noch ' + daysLeft + ' Tag' + (daysLeft === 1 ? '' : 'e') + reason };
    }

    // Verwarnungs-Gate: bei 5/5 Verwarnungen ist Posten gesperrt, bis der User an 2 Tagen
    // in Folge M1 (5 Likes/Tag) erfüllt hat. m1Streak.count zählt die M1-Tage in Folge
    // (wird in checkMissionen hochgezählt, bei verpasstem Tag auf 0 zurückgesetzt).
    if (!istAdminId(uid) && Number(u.warnings || 0) >= 5) {
        const _m1Count = (d.m1Streak && d.m1Streak[uid] && d.m1Streak[uid].count) || 0;
        if (_m1Count < 2) {
            return { ok: false, error: '🚫 5/5 Verwarnungen — Posten gesperrt.\n\nErfülle 2 Tage in Folge Mission M1 (5 Links liken/Tag), um wieder posten zu können.\n\nAktuell: ' + _m1Count + '/2 Tagen.', warningsLocked: true, m1Days: _m1Count };
        }
    }

    const heute = new Date().toDateString();
    const norm = (t) => t.toLowerCase().replace(/\?.*$/, '').replace(/\/$/, '').trim();
    const isDuplicate = Object.values(d.links).some(l => norm(l.text) === norm(url));
    if (isDuplicate) return { ok: false, error: 'Dieser Link wurde bereits gepostet!' };

    let usedBonusLink = false;
    let usedBadgeBonus = false;
    if (!istAdminId(uid)) {
        const todayLinks = Object.values(d.links).filter(l =>
            String(l.user_id) === String(uid) && new Date(l.timestamp).toDateString() === heute
        ).length;
        const bonusAvail = d.bonusLinks?.[uid] || 0;
        const badgeAvailable = badgeBonusLinks(u.xp || 0) > 0 && (!d.badgeTracker?.[uid] || d.badgeTracker[uid] !== heute);
        const standardUsed = todayLinks > 0;
        const canPost = !standardUsed || bonusAvail > 0 || badgeAvailable;
        if (!canPost) {
            return { ok: false, error: 'Limit erreicht! Du hast heute schon gepostet. Kaufe einen Extra-Link im Shop (5 💎).' };
        }
        if (standardUsed) {
            if (bonusAvail > 0) usedBonusLink = true;
            else if (badgeAvailable) usedBadgeBonus = true;
        }
    }

    const linkId = generateSyntheticLinkId();
    const mapKey = linkId;
    const linkData = {
        chat_id: null, // Telegram entfällt — app-only Links haben keine Gruppen-Message
        user_id: /^\d+$/.test(String(uid)) ? Number(uid) : String(uid),
        user_name: u.spitzname || u.name || name,
        text: url,
        caption: caption || '',
        likes: new Set(),
        likerNames: {},
        counter_msg_id: linkId,
        timestamp: Date.now(),
        origin: 'app',
        appOnly: true,
        likeSource: { app: 0, telegram: 0 }
    };
    d.links[mapKey] = linkData;
    tryFetchThumbnail(linkData, 'text');

    try {
        const rulesUrl = ((process.env.APP_URL || 'https://web-production-7981d.up.railway.app').replace(/\/$/, '')) + '/explore?tab=regeln#r-links';
        const linkRules = '✅ Dein Link ist gepostet\n\n' +
            'Damit dein Reel zählt, denk an diese 3 Dinge:\n\n' +
            '1. Like heute 5 andere Reels (Mission 1)\n' +
            '2. Öffne jedes Reel erst auf Instagram, like & kommentiere dort — dann hier bestätigen\n' +
            '3. Auswertung ist täglich um 12:00 Uhr\n\n' +
            'Schaffst du die 5 Likes nicht, gibt es eine Verwarnung. Alle Details findest du in den Regeln.';
        sendCreatorBoostDM(uid, linkRules, { link: { url: rulesUrl, label: '📖 Alle Link-Regeln' } });
    } catch (e) {}

    if (usedBonusLink && d.bonusLinks?.[uid] > 0) {
        d.bonusLinks[uid]--;
        if (d.bonusLinks[uid] <= 0) delete d.bonusLinks[uid];
    }
    if (usedBadgeBonus) {
        if (!d.badgeTracker) d.badgeTracker = {};
        d.badgeTracker[uid] = heute;
    }

    xpAddMitDaily(uid, 1, u.name || name);
    u.links = (u.links || 0) + 1;

    const NEW_MEMBER_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
    const isFirstPostEver = Number(u.links) === 1
        && u.joinDate && (Date.now() - u.joinDate) <= NEW_MEMBER_MAX_AGE_MS
        && !u.parent_uid;
    if (isFirstPostEver) {
        linkData.firstPostBonus = true;
        linkData.firstPostBonusUntil = Date.now() + 8 * 3600 * 1000;
        xpAdd(uid, 20, u.name || name);
        try { sendInAppDM(uid, '🌟 Willkommen — dein erster Post ist live\n\n⭐ +20 XP Willkommens-Bonus\n\nDein Post steht 8 Stunden ganz oben im Heute-Feed. Wer ihn liked, bekommt +20 XP extra.'); } catch (e) {}
        try { logActivity('newmember', (u.spitzname || u.name || name), ''); } catch (e) {}
        // Referral: erster Beitrag des eingeladenen Creators → +30 💎 für den Einlader.
        try { grantReferralMilestone(String(uid), 'firstPost'); } catch (e) {}
    }

    const _evtBonus = applyPostBonus(uid, u.name || name);
    if (_evtBonus.events.length) {
        const parts = _evtBonus.events.map(e => e.type === 'diamond' ? ('💎 +' + e.amount + ' Diamant' + (e.amount !== 1 ? 'en' : '')) : e.type === 'xp' ? ('⭐ +' + e.amount + ' XP') : '').filter(Boolean);
        if (parts.length) { try { sendInAppDM(uid, '🎉 Event-Bonus für deinen Post\n\n' + parts.join('\n') + '\n\nDas Event läuft noch — bleib dran!'); } catch (e) {} }
    }

    const mission = getMission(uid);
    if (istInstagramLink(url)) mission.linksGepostet++;
    await checkMissionen(uid, u.name || name);

    // isFirstPostEver an die Route zurückgeben → dort First-Win-Begrüßungs-Push (Push lebt in bot.js).
    return { ok: true, msgId: linkId, firstPost: !!isFirstPostEver, posterName: (u.spitzname || u.name || 'Ein neuer Creator') };
}

// ── Community-Post: 1:1 aus POST /create-post-api ──
function createPostApi({ uid, text, attachment, attachmentType }) {
    if (!uid || (!text && !attachment)) return { ok: false };
    if (!d.posts) d.posts = {};
    if (!d.posts[uid]) d.posts[uid] = [];
    const _text = (text || '').slice(0, 300);
    // Doppel-Submit-Schutz: gleicher Text-only-Post < 5s → kein Duplikat.
    if (!attachment) {
        const last = d.posts[uid][d.posts[uid].length - 1];
        if (last && !last.attachment && last.text === _text && (Date.now() - (last.timestamp || 0)) < 5000) return { ok: true, deduped: true };
    }
    const post = { text: _text, timestamp: Date.now(), likes: [] };
    if (attachment) { post.attachment = attachment; post.attachmentType = attachmentType; }
    d.posts[uid].push(post);
    if (d.posts[uid].length > 50) d.posts[uid].shift();
    return { ok: true };
}
// ── Community-Post löschen: 1:1 aus POST /delete-post-api ──
function deletePostApi({ uid, timestamp }) {
    if (!uid || !timestamp || !d.posts?.[uid]) return { ok: false };
    d.posts[uid] = d.posts[uid].filter(p => p.timestamp !== Number(timestamp));
    return { ok: true };
}
// Prototype-Pollution-Schutz: User-gelieferte IDs werden als Objekt-Keys benutzt.
function _unsafeKey(k) { k = String(k); return k === '__proto__' || k === 'constructor' || k === 'prototype'; }
// ── Kommentar: 1:1 aus POST /comment-api ──
function commentApi({ uid, name, linkId, text }) {
    if (!uid || !text || !linkId || _unsafeKey(linkId)) return { ok: false };
    if (!d.comments) d.comments = {};
    if (!d.comments[linkId]) d.comments[linkId] = [];
    d.comments[linkId].push({ uid, name, text: text.slice(0, 200), timestamp: Date.now() });
    if (d.comments[linkId].length > 100) d.comments[linkId].shift();
    let postOwnerUid = null;
    const lnk = d.links?.[linkId] || Object.values(d.links || {}).find(l => String(l.counter_msg_id) === String(linkId));
    if (lnk?.user_id) postOwnerUid = String(lnk.user_id);
    else if (typeof linkId === 'string' && linkId.includes('_')) postOwnerUid = linkId.split('_')[0];
    if (postOwnerUid && String(postOwnerUid) !== String(uid) && d.users[postOwnerUid]) {
        addNotification(postOwnerUid, '💬', (name || 'Jemand') + ' hat kommentiert: ' + text.slice(0, 40), String(uid));
    }
    return { ok: true };
}
// ── Kommentar löschen: 1:1 aus POST /delete-comment-api ──
function deleteCommentApi({ uid, postId, commentIdx, commentTs }) {
    if (!uid || !postId || _unsafeKey(postId) || !d.comments?.[postId]) return { ok: false };
    const comments = d.comments[postId];
    let target = -1;
    if (commentTs) {
        target = comments.findIndex(c => Number(c.timestamp) === Number(commentTs) && String(c.uid) === String(uid));
        if (target < 0 && istAdminId(Number(uid))) {
            target = comments.findIndex(c => Number(c.timestamp) === Number(commentTs));
        }
    } else if (Number.isInteger(commentIdx) && comments[commentIdx]) {
        const c = comments[commentIdx];
        if (String(c.uid) === String(uid) || istAdminId(Number(uid))) target = commentIdx;
    }
    if (target < 0) return { ok: false, error: 'Kommentar nicht gefunden oder keine Berechtigung' };
    comments.splice(target, 1);
    return { ok: true };
}
// ── Link löschen: portiert aus telegram-bot GET /delete-link.
// Standalone: kein Telegram-Message-Delete mehr; XP/Daily/Weekly-Rollback +
// Comments/DMs/pinnedEngages-Cleanup bleiben 1:1 erhalten.
function deleteLinkApi({ linkId }) {
    const msgId = String(linkId || '');
    if (_unsafeKey(msgId)) return { ok: false, error: 'Ungültige ID' };
    const link = d.links?.[msgId];
    if (!link) return { ok: false, error: 'Link nicht gefunden' };
    const heuteStr = new Date().toDateString();
    const isToday = link.timestamp && new Date(link.timestamp).toDateString() === heuteStr;
    try {
        const likers = Array.from(link.likes instanceof Set ? link.likes : (Array.isArray(link.likes) ? link.likes : []));
        for (const lUid of likers) {
            if (!lUid || lUid === CREATORBOOST_UID || istAdminId(lUid)) continue;
            const lu = d.users[lUid];
            if (!lu) continue;
            lu.xp = Math.max(0, (lu.xp || 0) - 5);
            lu.level = level(lu.xp); lu.role = badge(lu.xp);
            lu.totalLikes = Math.max(0, (lu.totalLikes || 0) - 1);
            if (isToday) {
                if (d.dailyXP) d.dailyXP[lUid] = Math.max(0, (d.dailyXP[lUid] || 0) - 5);
                if (d.missionen?.[lUid]?.date === heuteStr) {
                    d.missionen[lUid].likesGegeben = Math.max(0, (d.missionen[lUid].likesGegeben || 0) - 1);
                }
            }
            if (d.weeklyXP) d.weeklyXP[lUid] = Math.max(0, (d.weeklyXP[lUid] || 0) - 5);
        }
        const posterUid = String(link.user_id || '');
        if (posterUid && d.users[posterUid] && !istAdminId(posterUid)) {
            const pu = d.users[posterUid];
            pu.xp = Math.max(0, (pu.xp || 0) - 1);
            pu.level = level(pu.xp); pu.role = badge(pu.xp);
            pu.links = Math.max(0, (pu.links || 0) - 1);
            if (isToday && d.dailyXP) d.dailyXP[posterUid] = Math.max(0, (d.dailyXP[posterUid] || 0) - 1);
            if (d.weeklyXP) d.weeklyXP[posterUid] = Math.max(0, (d.weeklyXP[posterUid] || 0) - 1);
        }
    } catch (e) {}
    if (d.dmNachrichten) delete d.dmNachrichten[String(link.counter_msg_id)];
    if (d.comments) {
        delete d.comments[msgId];
        if (link.counter_msg_id) delete d.comments[String(link.counter_msg_id)];
    }
    if (d.likerNames) delete d.likerNames[msgId];
    if (d.pinnedEngages) {
        for (const k of Object.keys(d.pinnedEngages)) {
            if (String(d.pinnedEngages[k]?.linkId || '') === String(msgId)) delete d.pinnedEngages[k];
        }
    }
    delete d.links[msgId];
    return { ok: true };
}

function _reasonLabel(r) {
    if (r === 'roulette') return '🎡 Roulette';
    if (r === 'daily-bonus') return '🎁 Daily Bonus';
    if (r === 'gewinnspiel') return '🏆 Gewinnspiel';
    if (r === 'superlink-mission') return '🌟 Wochen-Mission: Alle Superlinks engagiert';
    if (r === 'admin') return '⚙️ Admin';
    return '🎁';
}

// ── Roher XP-Credit (Daily-Bonus/Roulette/Admin): 1:1 aus POST /add-xp ──
// Unterscheidet sich bewusst von xpAdd: kein xpEvent-Multiplikator, kein
// dailyXP, kein Trophy/Badge-Up-DM; setzt level+role direkt; weeklyXP nur wenn
// !noRanking. (Daily-XP/Roulette nutzen noRanking:true.)
function addXp({ uid, amount, noRanking, reason }) {
    uid = String(uid || '');
    amount = Number(amount);
    noRanking = noRanking === true;
    const u = d.users[uid];
    if (!uid || !u) return { ok: false, error: 'User nicht gefunden' };
    if (!Number.isFinite(amount)) return { ok: false, error: 'amount erforderlich' };
    u.xp = (u.xp || 0) + amount;
    if (u.xp < 0) u.xp = 0;
    u.level = level(u.xp);
    u.role = badge(u.xp);
    if (!noRanking) {
        if (!d.weeklyXP) d.weeklyXP = {};
        d.weeklyXP[uid] = Math.max(0, (d.weeklyXP[uid] || 0) + amount);
    }
    if (amount > 0) {
        try { dmUser(uid, `✨ +${amount} XP\n\n${_reasonLabel(reason)}\n\n⭐ Gesamt: ${u.xp} XP`); } catch (e) {}
    }
    return { ok: true, newXp: u.xp };
}

// ── Diamanten / Shop / Extra-Links: 1:1 aus den Bot-Endpoints ──
function addExtraLink({ uid, reason }) {
    uid = String(uid || '');
    if (!uid || !d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    if (!d.bonusLinks) d.bonusLinks = {};
    d.bonusLinks[uid] = (d.bonusLinks[uid] || 0) + 1;
    try { dmUser(uid, `🔗 +1 Extra-Link\n\n${_reasonLabel(reason)}\n\nVerfügbar: ${d.bonusLinks[uid]} Extra-Links`); } catch (e) {}
    return { ok: true };
}
function addSuperlink({ uid, reason }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!uid || !u) return { ok: false, error: 'User nicht gefunden' };
    u.superlinkCredits = (u.superlinkCredits || 0) + 1;
    try { dmUser(uid, `⚡ +1 Superlink-Slot\n\n${_reasonLabel(reason)}\n\nVerfügbar: ${u.superlinkCredits} Extra-Superlinks`); } catch (e) {}
    return { ok: true, superlinkCredits: u.superlinkCredits };
}
function addDiamonds({ uid, amount, reason }) {
    uid = String(uid || '');
    amount = Number(amount);
    const u = d.users[uid];
    if (!uid || !u) return { ok: false, error: 'User nicht gefunden' };
    if (!Number.isFinite(amount)) return { ok: false, error: 'amount erforderlich' };
    u.diamonds = (u.diamonds || 0) + amount;
    if (u.diamonds < 0) u.diamonds = 0;
    if (amount > 0) {
        try { dmUser(uid, `💎 +${amount} Diamant${amount !== 1 ? 'en' : ''}\n\n${_reasonLabel(reason)}\n\n💎 Guthaben: ${u.diamonds}`); } catch (e) {}
    }
    return { ok: true, newDiamonds: u.diamonds };
}
function removeDiamonds({ uid, amount, reason }) {
    uid = String(uid || '');
    const raw = Number(amount);
    const u = d.users[uid];
    if (!uid || !u) return { ok: false, error: 'User nicht gefunden' };
    if (!Number.isFinite(raw)) return { ok: false, error: 'amount erforderlich' };
    const amt = Math.abs(raw);
    u.diamonds = Math.max(0, (u.diamonds || 0) - amt);
    try { dmUser(uid, `💎 −${amt} Diamant${amt !== 1 ? 'en' : ''}\n\n${_reasonLabel(reason)}\n\n💎 Guthaben: ${u.diamonds}`); } catch (e) {}
    return { ok: true, newDiamonds: u.diamonds };
}
const ITEM_PRICES = {
    ring_flame: 8, ring_ocean: 8, ring_gold: 10, ring_purple: 12, ring_rainbow: 15, ring_diamond: 20,
    banner_sunset: 5, banner_peach: 5, banner_mint: 5, banner_forest: 5,
    banner_ocean: 7, banner_sky: 7, banner_lavender: 7, banner_rose: 7,
    banner_gold: 10, banner_candy: 10, banner_coral: 10, banner_aurora: 10,
    // Premium-„50 Diamanten Rahmen" (PNG)
    pframe_fire: 50, pframe_gold: 50, pframe_ice: 50, pframe_crystal: 50, pframe_bubble: 50,
    // Titelschilder (Banner unter dem Profil) — eigener Titel-Text + Design
    title_pro: 50, title_star: 100, title_vip: 150, title_feuer: 200, title_eis: 200, title_legende: 300, title_elite: 400, title_royal: 500,
};
const ITEM_NAMES = {
    ring_flame: '🔥 Flame Ring', ring_ocean: '🌊 Ocean Ring', ring_gold: '✨ Gold Ring', ring_purple: '🔮 Cosmic Ring', ring_rainbow: '🌈 Rainbow Ring', ring_diamond: '💎 Diamond Ring',
    banner_sunset: '🌅 Sunset Banner', banner_ocean: '🌊 Ocean Banner', banner_forest: '🌿 Forest Banner', banner_candy: '🍭 Candy Banner',
    banner_sky: '☁️ Sky Blue Banner', banner_lavender: '💜 Lavender Banner', banner_mint: '🌱 Mint Banner', banner_peach: '🍑 Peach Banner',
    banner_gold: '✨ Golden Hour Banner', banner_coral: '🪸 Coral Banner', banner_aurora: '🌌 Aurora Banner', banner_rose: '🌹 Rose Gold Banner',
    pframe_fire: '🌋 Lava-Ring', pframe_gold: '👑 Gold-Ring', pframe_ice: '🧊 Eis-Ring', pframe_crystal: '🔷 Kristall-Ring', pframe_bubble: '🫧 Perlen-Ring',
    title_legende: '🏆 Legende', title_vip: '💎 VIP', title_pro: '⭐ Pro', title_star: '🌟 Superstar', title_elite: '👑 Elite', title_feuer: '🔥 Feuer-Titel', title_eis: '❄️ Eis-Titel', title_royal: '👑 Royal',
};
function buyItemApi({ uid, itemId }) {
    if (!uid || !itemId) return { ok: false, error: 'Fehlende Parameter' };
    const u = d.users[String(uid)];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!u.inventory) u.inventory = [];
    if (u.inventory.includes(itemId)) return { ok: false, error: 'Item bereits besessen' };
    const price = ITEM_PRICES[itemId];
    if (!price) return { ok: false, error: 'Unbekanntes Item' };
    const isAdmin = istAdminId(Number(uid));
    if (!isAdmin && (u.diamonds || 0) < price) return { ok: false, error: `Nicht genug Diamanten (benötigt: ${price})` };
    if (!isAdmin) u.diamonds = (u.diamonds || 0) - price;
    u.inventory.push(itemId);
    addNotification(String(uid), '🎁', `${ITEM_NAMES[itemId] || itemId} gekauft! Wähle es in deinem Profil unter "Items" aus.${isAdmin ? ' (Admin – kostenlos)' : ` 💎 -${price} Diamanten.`}`);
    return { ok: true, diamonds: u.diamonds, inventory: u.inventory };
}
// Spezial-Rahmen (nicht kaufbar — verdient/rollenbasiert): Builder-Rang-Rahmen + Admin-Rahmen.
// Werden NICHT im Shop verkauft, sondern in der Profil-„Tasche" anzeigt/aktivierbar, wenn berechtigt.
function _frameEntitled(uid, ringId) {
    if (!ringId) return true; // Deaktivieren immer erlaubt
    if (ringId === 'frame_admin') return istAdminId(uid);
    const m = String(ringId).match(/^frame_builder_([1-4])$/);
    if (m) {
        const need = Number(m[1]);
        const b = builderBadgeFor(uid);
        return !!(b && b.tier >= need); // höherer Rang darf auch niedrigere Rahmen tragen
    }
    return false; // unbekannter Spezial-Rahmen
}
function setActiveRingApi({ uid, ringId }) {
    if (!uid) return { ok: false };
    const u = d.users[String(uid)];
    if (!u) return { ok: false };
    const isSpecial = ringId && (ringId === 'frame_admin' || /^frame_builder_[1-4]$/.test(String(ringId)));
    if (isSpecial) {
        if (!_frameEntitled(String(uid), ringId)) return { ok: false, error: 'Dieser Rahmen ist für dich nicht freigeschaltet' };
    } else if (ringId && !(u.inventory || []).includes(ringId)) {
        return { ok: false, error: 'Item nicht im Inventar' };
    }
    u.activeRing = ringId || null;
    return { ok: true, activeRing: u.activeRing };
}
// Titelschild aktivieren (Banner unter dem Profil). null = keins. Muss im Inventar sein (gekauft).
function setActiveTitleApi({ uid, titleId }) {
    if (!uid) return { ok: false };
    const u = d.users[String(uid)];
    if (!u) return { ok: false };
    if (titleId) {
        if (titleId === 'title_admin') {
            // Spezial-Titel: nur Admins, kein Inventar-Eintrag nötig.
            if (!istAdminId(uid)) return { ok: false, error: 'Nur für Admins' };
        } else if (!(u.inventory || []).includes(titleId)) {
            return { ok: false, error: 'Titel nicht im Inventar' };
        }
    }
    u.activeTitle = titleId || null;
    return { ok: true, activeTitle: u.activeTitle };
}
function buyExtralinkApi({ uid }) {
    if (!uid) return { ok: false, error: 'Fehlende UID' };
    const u = d.users[String(uid)];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    const isAdminEl = istAdminId(Number(uid));
    if (!isAdminEl && (u.diamonds || 0) < 5) return { ok: false, error: 'Nicht genug Diamanten (benötigt: 5)' };
    if (!isAdminEl) u.diamonds = (u.diamonds || 0) - 5;
    if (!d.bonusLinks) d.bonusLinks = {};
    d.bonusLinks[String(uid)] = (d.bonusLinks[String(uid)] || 0) + 1;
    addNotification(String(uid), '🔗', `Extra-Link gekauft! Du kannst heute einen zusätzlichen Link posten.${isAdminEl ? ' (Admin – kostenlos)' : ' 💎 -5 Diamanten.'}`);
    return { ok: true, diamonds: u.diamonds, bonusLinks: d.bonusLinks[String(uid)] };
}
// ── Read-only Slot-Status (für UI): 1:1 aus GET /link-status-api ──
function linkStatusApi(uid) {
    uid = String(uid || '');
    if (!uid) return { ok: false };
    const heute = new Date().toDateString();
    const todayCount = Object.values(d.links).filter(l =>
        String(l.user_id) === String(uid) && new Date(l.timestamp).toDateString() === heute
    ).length;
    const bonusLinks = d.bonusLinks?.[uid] || 0;
    const isAdmin = istAdminId(Number(uid));
    const u = d.users[uid];
    const badgeBonus = !isAdmin && badgeBonusLinks(u?.xp || 0) > 0 && (!d.badgeTracker?.[uid] || d.badgeTracker[uid] !== heute) ? 1 : 0;
    const standardUsed = todayCount > 0;
    // Verwarnungs-Lock: 5/5 Verwarnungen → Posten gesperrt bis 2 Tage M1 in Folge.
    const _warns = Number(u?.warnings || 0);
    const _m1Count = (d.m1Streak && d.m1Streak[uid] && d.m1Streak[uid].count) || 0;
    const warningsLocked = !isAdmin && _warns >= 5 && _m1Count < 2;
    const canPost = !warningsLocked && (isAdmin || !standardUsed || bonusLinks > 0 || badgeBonus > 0);
    const maxLinks = isAdmin ? 999 : todayCount + (standardUsed ? 0 : 1) + bonusLinks + badgeBonus;
    return { ok: true, todayCount, bonusLinks, badgeBonus, maxLinks, canPost, isAdmin, warnings: _warns, warningsLocked, m1Days: _m1Count };
}

// Bild-Speicher: in der App schreiben die dedizierten Upload-Routen lokal.
// Hier injizierbar; default setzt nur den Pfad (kein Datei-Write).
let _saveBild = (uid, type /*, data */) => '/appbild/' + uid + '/' + type;
function setBildSaver(fn) { _saveBild = fn; }

// ── Profil-Feld-Updater: 1:1 aus POST /update-profile-api ──
function updateProfileApi(body) {
    body = body || {};
    const { uid, bio, spitzname, banner, accentColor, profilePic } = body;
    if (!uid || !d.users[uid]) return { ok: false, error: 'User nicht gefunden: ' + String(uid || '(leer)') };
    const u = d.users[uid];
    if (bio !== undefined) u.bio = String(bio).slice(0, 100);
    if (spitzname !== undefined) u.spitzname = String(spitzname).slice(0, 30);
    if (accentColor !== undefined) u.accentColor = String(accentColor).slice(0, 32);
    if (body.nische !== undefined) u.nische = String(body.nische).slice(0, 50);
    if (body.website !== undefined) u.website = String(body.website).slice(0, 100);
    if (body.tiktok !== undefined) u.tiktok = String(body.tiktok).replace('@', '').slice(0, 50);
    if (body.youtube !== undefined) u.youtube = String(body.youtube).replace('@', '').slice(0, 50);
    if (body.twitter !== undefined) u.twitter = String(body.twitter).replace('@', '').slice(0, 50);
    if (body.instagram !== undefined) {
        const _wasEmpty = !u.instagram;
        u.instagram = String(body.instagram || '').replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 50);
        // Anti-Trick Referral: bei Insta-Set eines eingeladenen Users eine VERIFIZIERUNGS-Anfrage
        // anlegen (Admin bestätigt → erst dann signup-Belohnung). Nicht erneut, wenn schon offen/bestätigt.
        if (u.instagram && u.referredBy) { try { requestReferralVerification(String(uid)); } catch (e) {} }
    }
    if (body.email !== undefined) {
        const newEmail = String(body.email || '').toLowerCase().trim();
        if (newEmail === '') {
            delete u.email; delete u.pendingEmail;
        } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) && newEmail.length <= 200) {
            if (String(u.email || '').toLowerCase() === newEmail) {
                delete u.pendingEmail;
            } else {
                const taken = Object.entries(d.users || {}).find(([oid, x]) =>
                    String(oid) !== String(uid) &&
                    (String(x.email || '').toLowerCase() === newEmail || String(x.pendingEmail || '').toLowerCase() === newEmail));
                if (!taken) u.pendingEmail = newEmail;
            }
        }
    }
    if (body.confirmEmail !== undefined && body.confirmEmail) {
        const conf = String(body.confirmEmail).toLowerCase().trim();
        u.email = conf; u.emailConfirmedAt = Date.now(); delete u.pendingEmail;
    }
    if (body.appBriefingSeenV2 !== undefined) u.appBriefingSeenV2 = !!body.appBriefingSeenV2;
    if (body.rulesAcceptedAt !== undefined) { const ts = Number(body.rulesAcceptedAt) || 0; if (ts > 0) u.rulesAcceptedAt = ts; }
    if (banner !== undefined) {
        if (banner.startsWith('data:image')) { _saveBild(uid, 'banner', banner); u.banner = '/bild/' + uid + '/banner'; }
        else u.banner = banner;
    }
    if (profilePic !== undefined) {
        if (profilePic.startsWith('data:image')) { _saveBild(uid, 'profilepic', profilePic); u.profilePic = '/bild/' + uid + '/profilepic'; }
        else u.profilePic = profilePic;
    }
    return { ok: true };
}
// ── Projekte: 1:1 aus add/update/delete-project-api ──
function addProjectApi({ uid, projectId, title, description, link, docName }) {
    if (!uid || !projectId || !title?.trim()) return { ok: false, error: 'Fehlende Felder' };
    const u = d.users[String(uid)];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!u.projects) u.projects = [];
    if (u.projects.length >= 2) return { ok: false, error: 'Max 2 Projekte erlaubt' };
    u.projects.push({ id: projectId, title: title.trim(), description: (description || '').trim(), link: (link || '').trim(), docName: (docName || '').trim(), timestamp: Date.now() });
    return { ok: true };
}
function updateProjectApi({ uid, projectId, title, description, link, docName }) {
    if (!uid || !projectId || !title?.trim()) return { ok: false, error: 'Fehlende Felder' };
    const u = d.users[String(uid)];
    if (!u || !u.projects) return { ok: false, error: 'Projekt nicht gefunden' };
    const proj = u.projects.find(p => p.id === String(projectId));
    if (!proj) return { ok: false, error: 'Projekt nicht gefunden' };
    proj.title = title.trim();
    proj.description = (description || '').trim();
    proj.link = (link || '').trim();
    proj.docName = (docName || '').trim();
    return { ok: true };
}
function deleteProjectApi({ uid, projectId }) {
    if (!uid || !projectId) return { ok: false };
    const u = d.users[String(uid)];
    if (!u || !u.projects) return { ok: false };
    u.projects = u.projects.filter(p => p.id !== String(projectId));
    return { ok: true };
}
// ── Profil-100%-Belohnung: 1:1 aus complete-profile-api ──
function completeProfileApi({ uid }) {
    const u = d.users[String(uid)];
    if (!u || u.profileCompletionRewarded) return { ok: false, alreadyRewarded: true };
    u.profileCompletionRewarded = true;
    u.diamonds = (u.diamonds || 0) + 1;
    addNotification(String(uid), '🏆', 'Profil 100% vollständig! Du erhältst 💎 1 Diamant als Belohnung!');
    return { ok: true, diamonds: u.diamonds };
}
// ── Pinned-Post engagen: 1:1 aus engage-pinned-post-api ──
function engagePinnedPostApi({ engagerUid, ownerUid }) {
    if (!engagerUid || !ownerUid || engagerUid === ownerUid) return { ok: false };
    if (getRootUid(engagerUid) === getRootUid(ownerUid)) return { ok: false, error: 'Eigener Account-Familie' };
    if (!d.pinnedEngages) d.pinnedEngages = {};
    if (!d.pinnedEngages[engagerUid]) d.pinnedEngages[engagerUid] = [];
    if (d.pinnedEngages[engagerUid].includes(String(ownerUid))) return { ok: false, alreadyDone: true };
    d.pinnedEngages[engagerUid].push(String(ownerUid));
    addDiamond(engagerUid, 1);
    addNotification(engagerUid, '💎', 'Du hast einen Pinned-Post engagiert! +1 Diamant');
    sendInAppDM(engagerUid, '📌 Pinned-Post engagiert\n\nDu hast einen gepinnten Link engagiert.\n\n💎 +1 Diamant\n\nMit dem Engagement bestätigst du, den Post geliked, kommentiert, geteilt und gespeichert zu haben. Das wird stichprobenartig geprüft — bei Schein-Engagement folgen Sanktionen.\n\nMehr dazu im Explore unter Regeln.');
    if (!d.pinnedEngageLog) d.pinnedEngageLog = [];
    d.pinnedEngageLog.push({ engagerUid: String(engagerUid), ownerUid: String(ownerUid), ts: Date.now() });
    if (d.pinnedEngageLog.length > 2000) d.pinnedEngageLog = d.pinnedEngageLog.slice(-2000);
    return { ok: true };
}

// ════════ CRON-DISPATCHER (App-eigener Scheduler, Telegram-Jobs raus) ════════
function linkUrl(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.trim();
    if (t.includes('http://') || t.includes('https://') || t.includes('www.') || t.includes('t.me/')) return t;
    return null;
}
// Event-Announcement an alle aktiven User (In-App-DM). Web-Push entfällt (zustandslos).
function announceEventToAllUsers(title, body) {
    let count = 0;
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || u.parent_uid || u.banned || !u.started) continue;
        if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) continue;
        try { sendInAppDM(uid, body); count++; } catch (e) {}
    }
    return count;
}
// XP-/Diamond-Event Auto-Start/Stop + Vorab-Erinnerungen (nutzt Echtzeit wie der Bot).
function eventAutoTick() {
    const now = Date.now();
    if (d.xpEvent?.start && d.xpEvent?.end) {
        const xe = d.xpEvent;
        if (xe.start - now > 0 && xe.start - now <= 60 * 60 * 1000 && !xe.announcedAt1hPre) { xe.announcedAt1hPre = Date.now(); const pct = Math.round((xe.multiplier - 1) * 100); announceEventToAllUsers('⏰ XP-Event in 1 Stunde!', '+' + pct + '% XP startet in 1h — sei dabei!'); }
        if (xe.start - now > 0 && xe.start - now <= 30 * 60 * 1000 && !xe.announcedAt30mPre) { xe.announcedAt30mPre = Date.now(); const pct = Math.round((xe.multiplier - 1) * 100); announceEventToAllUsers('⏰ XP-Event in 30 Minuten!', '+' + pct + '% XP startet gleich — bereit sein!'); }
        if (!xe.aktiv && now >= xe.start && now <= xe.end) { xe.aktiv = true; if (!xe.activatedAndAnnouncedAt) { xe.activatedAndAnnouncedAt = Date.now(); const pct = Math.round((xe.multiplier - 1) * 100); announceEventToAllUsers('🚀 XP-Event läuft JETZT!', '+' + pct + '% XP auf alle Aktionen — jetzt aktiv sein!'); } }
        if (xe.aktiv && now > xe.end) { xe.aktiv = false; }
    }
    if (d.diamondEvent?.start && d.diamondEvent?.end) {
        const de = d.diamondEvent;
        if (de.start - now > 0 && de.start - now <= 60 * 60 * 1000 && !de.announcedAt1hPre) { de.announcedAt1hPre = Date.now(); announceEventToAllUsers('⏰ Diamond-Event in 1 Stunde!', '+' + (de.pendingBonusPerPost || de.bonusPerPost) + ' 💎 pro Post startet in 1h!'); }
        if (de.start - now > 0 && de.start - now <= 30 * 60 * 1000 && !de.announcedAt30mPre) { de.announcedAt30mPre = Date.now(); announceEventToAllUsers('⏰ Diamond-Event in 30 Minuten!', '+' + (de.pendingBonusPerPost || de.bonusPerPost) + ' 💎 pro Post startet gleich!'); }
        if (now >= de.start && now <= de.end && de.bonusPerPost === 0 && de.pendingBonusPerPost > 0) { de.bonusPerPost = de.pendingBonusPerPost; if (!de.activatedAndAnnouncedAt) { de.activatedAndAnnouncedAt = Date.now(); announceEventToAllUsers('💎 Diamond-Event läuft JETZT!', '+' + de.bonusPerPost + ' 💎 pro Post — jetzt posten lohnt!'); } }
        if (now > de.end && de.bonusPerPost > 0) { de.bonusPerPost = 0; }
    }
}
// Alte Links (>2 Tage) aufräumen. Telegram-Message-Deletes entfallen (app-only).
function linkCleanup() {
    const zweiTage = 2 * 24 * 60 * 60 * 1000;
    for (const [k, l] of Object.entries(d.links)) {
        if (Date.now() - l.timestamp > zweiTage) {
            const mk = String(l.counter_msg_id);
            if (d.dmNachrichten?.[mk]) delete d.dmNachrichten[mk];
            const lu = linkUrl(l.text);
            if (lu && Array.isArray(d.gepostet)) { const idx = d.gepostet.indexOf(lu); if (idx !== -1) d.gepostet.splice(idx, 1); }
            delete d.links[k];
        }
    }
}
// App-Scheduler: 1:1-Dispatch aus dem Bot-zeitCheck — NUR Daten-Jobs.
// Telegram-only Jobs (backup/memberCheck/topLinks/smartReminder/thread-sync) entfallen.
// Aufruf alle 60s vom App-Server (setInterval) im LOCAL_STORE-Modus.
async function zeitCheck(nowArg) {
    try {
        const jetzt = nowArg || new Date();
        const h = jetzt.getHours();
        const m = jetzt.getMinutes();
        const tagStr = jetzt.toDateString();
        if (!d._lastEvents) d._lastEvents = {};
        const taeglich = (key) => {
            const fullKey = `${key}_${h}_${tagStr}`;
            if (d._lastEvents[fullKey]) return false;
            d._lastEvents[fullKey] = true;
            return true;
        };
        if (jetzt.getDay() === 1 && h === 0 && m < 10 && taeglich('wochenReset')) wochenResetUndAuszahlung(jetzt);
        if (jetzt.getDate() === 1 && h === 0 && m < 10 && taeglich('legendenBonus')) legendenBonus();
        if (h === 12 && m < 5 && taeglich('missionen')) await missionenAuswerten();
        if (h === 23 && m >= 55 && taeglich('dailyRanking')) await dailyRankingAbschluss();
        // Einmaliger Backfill (Bug-Nachzahlung — die +500-XP-Belohnung war nie verdrahtet): zahlt die
        // Wochen-Superlink-Mission rückwirkend für die VORWOCHE (gestern Sonntag ausgewertet) UND diese Woche
        // an bereits Berechtigte. Superlinks werden beim Montag-Reset nicht gelöscht → Vorwoche noch auszahlbar.
        // Läuft genau einmal (idempotent über das granted-Flag), danach übernimmt die Sonntags-Auswertung.
        if (!d._slMissionBackfillV3) { d._slMissionBackfillV3 = true; try { const prev = grantWeeklySuperlinkMission(getPrevBerlinWeekKey()); const cur = grantWeeklySuperlinkMission(); console.log('Superlink-Mission Backfill V3 (pro Account, inkl. Subs): Vorwoche +500 XP an', prev.granted, '· diese Woche an', cur.granted, 'User'); } catch (e) { console.log('Superlink-Mission Backfill Fehler:', e.message); } }
        eventAutoTick();
        linkCleanup();
        for (const key of Object.keys(d._lastEvents)) { if (!key.endsWith(tagStr)) delete d._lastEvents[key]; }
    } catch (e) { /* fehler im einzelnen Job darf Scheduler nicht killen */ }
}

// ════════ RANKING-AUSZAHLUNGEN (Tages-/Wochen-Cron) ════════
async function aktivitaetsScore(uid) {
    const logins = d.dailyLogins[uid] || 0;
    const groupMsgs = d.dailyGroupMsgs[uid] || 0;
    const m = d.missionen[uid];
    const heute = new Date().toDateString();
    const likesGegeben = (m?.date === heute ? m.likesGegeben || 0 : 0);
    const missionen = (m?.date === heute ? (m.m1 ? 1 : 0) + (m.m2 ? 1 : 0) + (m.m3 ? 1 : 0) : 0);
    return logins * 3 + groupMsgs * 2 + likesGegeben + missionen;
}
function archiveWeeklyXP(reason = 'auto') {
    const snapshot = Object.assign({}, d.weeklyXP || {});
    if (!Object.keys(snapshot).length) return false;
    const total = Object.values(snapshot).reduce((s, x) => s + x, 0);
    if (!d.weeklyHistory) d.weeklyHistory = [];
    const sortedTop = Object.entries(snapshot).filter(([uid]) => d.users[uid] && !istAdminId(uid)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([uid, xp]) => ({ uid, name: d.users[uid]?.name || '?', xp }));
    d.weeklyHistory.push({ weekKey: getBerlinWeekKey(), endedAt: Date.now(), reason, total, top: sortedTop, snapshot });
    while (d.weeklyHistory.length > 26) d.weeklyHistory.shift();
    return true;
}
// Tages-Ranking-Abschluss (23:55). Telegram-Gruppen-/DM-Posts entfernt; In-App-DM +
// Auszahlung + Resets bleiben. Bei Gleichstand: Verlosung nach Aktivität (Math.random
// nur bei exakt gleichem XP — daher in Tests distinkte XP nutzen).
async function dailyRankingAbschluss() {
    const sorted = Object.entries(d.dailyXP).filter(([uid]) => d.users[uid] && d.dailyXP[uid] > 0 && !istAdminId(uid)).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return;
    const withScore = await Promise.all(sorted.map(async ([uid, xp]) => ({ uid, xp, score: await aktivitaetsScore(uid) })));
    withScore.sort((a, b) => b.xp !== a.xp ? b.xp - a.xp : b.score !== a.score ? b.score - a.score : Math.random() - 0.5);
    let i = 0;
    while (i < withScore.length) {
        const xp = withScore[i].xp;
        let j = i + 1;
        while (j < withScore.length && withScore[j].xp === xp) j++;
        if (j > i + 1) {
            const tiedGroup = withScore.slice(i, j);
            for (let k = 0; k < tiedGroup.length; k++) {
                const { uid } = tiedGroup[k];
                const myRank = i + k + 1;
                const otherNames = tiedGroup.filter((_, idx) => idx !== k).map(e => d.users[e.uid]?.spitzname || d.users[e.uid]?.name || 'User');
                const othersStr = otherNames.length === 1 ? otherNames[0] : otherNames.slice(0, -1).join(', ') + ' und ' + otherNames[otherNames.length - 1];
                const rankRange = `Platz ${i + 1}–${j}`;
                const msg = myRank <= 3
                    ? `🎲 Gleichstand entschieden\n\nDu und ${othersStr} hattet alle ${xp} XP und lagt auf ${rankRange} gleichauf.\n\nEine automatische Verlosung nach Aktivität hat entschieden — und du hast gewonnen!\n\n🏆 Dein Rang: Platz ${myRank}\n\nDein Top-${myRank}-Bonus folgt gleich.`
                    : `🎲 Gleichstand entschieden\n\nDu und ${othersStr} hattet alle ${xp} XP und lagt auf ${rankRange} gleichauf.\n\nEine automatische Verlosung nach Aktivität hat entschieden — diesmal lag ${tiedGroup[0] && tiedGroup[0].uid !== uid ? (d.users[tiedGroup[0].uid]?.spitzname || d.users[tiedGroup[0].uid]?.name || 'ein anderer User') : othersStr} vorne.\n\n📊 Dein Rang: Platz ${myRank}\n\nMit etwas mehr Aktivität bist du morgen weiter vorne. 💪`;
                try { await dmUser(uid, msg); } catch (e) {}
            }
        }
        i = j;
    }
    const bel = [
        { xp: 10, links: 1, dia: 2, text: '🥇' },
        { xp: 5, links: 0, dia: 2, text: '🥈' },
        { xp: 2, links: 0, dia: 1, text: '🥉' },
    ];
    if (!d.dailyAwardsLog) d.dailyAwardsLog = [];
    const dayKey = new Date().toISOString().slice(0, 10);
    const alreadyPaidDaily = d.dailyAwardsLog.some(a => a.dayKey === dayKey);
    if (!alreadyPaidDaily) for (let ii = 0; ii < Math.min(3, withScore.length); ii++) {
        const { uid } = withScore[ii];
        const u = d.users[uid];
        const b = bel[ii];
        try {
            xpAdd(uid, b.xp, u.name);
            if (b.dia > 0) addDiamond(uid, b.dia);
            if (b.links > 0) { if (!d.bonusLinks[uid]) d.bonusLinks[uid] = 0; d.bonusLinks[uid] += b.links; }
            d.dailyAwardsLog.push({ dayKey, place: ii + 1, uid, name: u.name, xp: b.xp, dia: b.dia, links: b.links || 0, at: Date.now() });
            while (d.dailyAwardsLog.length > 500) d.dailyAwardsLog.shift();
        } catch (e) { continue; }
        try { sendInAppDM(uid, `${b.text} ${ii + 1}. Platz im Tagesranking\n\nStark — du bist heute unter den Top 3! 🎉\n\nDeine Belohnung:\n⭐ +${b.xp} XP\n💎 +${b.dia} Diamanten${b.links ? '\n🔗 +1 Extra-Link für morgen' : ''}`); } catch (e) {}
    }
    d.gesternDailyXP = Object.assign({}, d.dailyXP);
    // Creator des Tages küren: aktivster Creator (withScore[0]) mit echter Mindesthürde
    // (≥1 Beitrag ODER ≥5 vergebene Likes insgesamt). Stats sind real, kein neues Tracking.
    try {
        const top = withScore[0] && d.users[withScore[0].uid];
        if (top && !top.banned && !top.parent_uid && ((top.links || 0) >= 1 || (top.appLikeCount || 0) >= 5)) {
            const _stk = getStreakApi(withScore[0].uid);
            d.creatorSpotlight = {
                uid: String(withScore[0].uid),
                name: top.spitzname || top.name || 'Creator',
                instagram: top.instagram || null,
                days: Math.max(Number(_stk.streak || 0), Number(top.streakBest || 0)),
                posts: Number(top.links || 0),
                likes: Number(top.appLikeCount || 0),
                dayKey, at: Date.now(),
            };
        }
    } catch (e) {}
    d.dailyXP = {}; d.tracker = {}; d.counter = {}; d.badgeTracker = {};
    d.dailyLogins = {}; d.dailyGroupMsgs = {};
    d.dailyReset = Date.now();
}
// Legenden-Bonus (1. des Monats): +30💎 für User mit xp>=25000.
function legendenBonus() {
    let granted = 0;
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || u.parent_uid || u.banned || !u.started) continue;
        if (istAdminId(uid)) continue;
        if ((u.xp || 0) < 25000) continue;
        u.diamonds = (Number(u.diamonds) || 0) + 30;
        granted++;
        try { dmUser(uid, '💎 Legenden-Bonus\n\nDeine monatlichen +30 Diamanten sind da.\n\n💎 Guthaben: ' + u.diamonds + '\n\nSchön, dass du Teil der Legenden-Elite bist. 🌟').catch(() => {}); } catch (e) {}
    }
    return granted;
}
// Wochen-Reset + Sieger-Auszahlung (Mo 00:00). Telegram-Gruppen-/DM-Posts entfernt.
function wochenResetUndAuszahlung(jetzt) {
    jetzt = jetzt || new Date();
    d.wochenMissionen = {};
    if (d.wochenSuperlinkMissionGranted) {
        const cutoff = Date.now() - 28 * 24 * 60 * 60 * 1000;
        for (const [k, ts] of Object.entries(d.wochenSuperlinkMissionGranted)) { if (ts < cutoff) delete d.wochenSuperlinkMissionGranted[k]; }
    }
    const wTop = Object.entries(d.weeklyXP || {})
        .filter(([uid]) => d.users[uid] && !istAdminId(uid) && !d.users[uid].banned)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    const wPrize = [
        { medal: '🥇', xp: 50, dia: 3, links: 2 },
        { medal: '🥈', xp: 30, dia: 2, links: 1 },
        { medal: '🥉', xp: 15, dia: 1, links: 1 },
    ];
    if (!d.weeklyAwardsLog) d.weeklyAwardsLog = [];
    const weekKey = getBerlinWeekKey();
    const alreadyPaid = d.weeklyAwardsLog.some(a => a.weekKey === weekKey);
    if (!alreadyPaid) for (let i = 0; i < wTop.length; i++) {
        const [uid, xp] = wTop[i];
        const p = wPrize[i];
        const u = d.users[uid] || {};
        const name = u.spitzname || u.name || 'User';
        let paidXP = 0, paidDia = 0;
        try {
            paidXP = xpAdd(uid, p.xp, name);
            addDiamond(uid, p.dia); paidDia = p.dia;
            if (p.links > 0) { if (!d.bonusLinks[uid]) d.bonusLinks[uid] = 0; d.bonusLinks[uid] += p.links; }
            d.weeklyAwardsLog.push({ weekKey, place: i + 1, uid, name, xp: paidXP, dia: paidDia, links: p.links || 0, at: Date.now() });
            while (d.weeklyAwardsLog.length > 200) d.weeklyAwardsLog.shift();
        } catch (e) { continue; }
        try { sendInAppDM(uid, `${p.medal} ${i + 1}. Platz im Wochen-Ranking\n\nDu hast diese Woche ${xp} XP erreicht — Glückwunsch! 🎉\n\nDeine Belohnung:\n⭐ +${p.xp} XP\n💎 +${p.dia} Diamanten${p.links ? `\n🔗 +${p.links} Extra-Link${p.links > 1 ? 's' : ''}` : ''}`); } catch (e) {}
    }
    // #7 Wochen-Recap: VOR dem Reset eine persönliche Zusammenfassung an aktive User (DM).
    // Gibt Sinn + Stolz und bringt am Wochenstart zurück. Nur an in den letzten 7 Tagen Aktive,
    // nicht an die Top-3 (die kriegen schon die Gewinner-DM oben), nicht an Admins/Gebannte.
    try {
        const _recapWinners = new Set(wTop.map(([uid]) => String(uid)));
        const _recapCut = Date.now() - 7 * 86400000;
        const _wxAll = d.weeklyXP || {};
        const _ranked = Object.entries(_wxAll).filter(([uid]) => d.users[uid] && !istAdminId(uid) && !d.users[uid].banned).sort((a,b)=>b[1]-a[1]);
        const _rankPos = new Map(_ranked.map(([uid], i) => [String(uid), i + 1]));
        for (const [uid, u] of Object.entries(d.users || {})) {
            if (!u || istAdminId(uid) || u.banned || u.parent_uid) continue;
            if (_recapWinners.has(String(uid))) continue;
            const lastActive = Math.max(u.appLastSeen || 0, 0);
            if (lastActive < _recapCut) continue;          // nur kürzlich Aktive
            const wxp = Number(_wxAll[uid] || 0);
            if (wxp <= 0) continue;                         // nichts Nennenswertes → nicht spammen
            const pos = _rankPos.get(String(uid));
            const posLine = pos ? `\n🏅 Wochen-Rang: #${pos}` : '';
            try { sendInAppDM(uid, `📊 Deine Woche bei CreatorX\n\n⭐ +${wxp} XP diese Woche${posLine}\n💎 Guthaben: ${u.diamonds || 0}\n\nNeue Woche, neue Chance — leg gleich los und sammle XP. 🚀`); } catch (e) {}
        }
    } catch (e) {}
    archiveWeeklyXP('monday-reset');
    d.weeklyXP = {};
    d.weeklyReset = Date.now();
    const lastWeekMonday = new Date(jetzt);
    lastWeekMonday.setDate(jetzt.getDate() - 7);
    const lastWeekKey = lastWeekMonday.getFullYear() + '-' + String(lastWeekMonday.getMonth() + 1).padStart(2, '0') + '-' + String(lastWeekMonday.getDate()).padStart(2, '0');
    const postedLastWeekUids = new Set(Object.values(d.superlinks || {}).filter(s => s && s.week === lastWeekKey).map(s => String(s.uid)));
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || u.parent_uid || u.banned || !u.started) continue;
        if (istAdminId(uid)) continue;
        if ((u.xp || 0) >= 5000) { if (!d.bonusLinks[uid]) d.bonusLinks[uid] = 0; d.bonusLinks[uid] += 1; }
        if (postedLastWeekUids.has(String(uid))) continue;
        u.superlinkCredits = (Number(u.superlinkCredits) || 0) + 1;
    }
}

// ════════ MISSIONS-AUSWERTUNG (12:00-Cron + Admin-Backfill) ════════
function xpBisNaechstesBadge(xp) {
    if (xp < 50) return { ziel: '📘 Anfänger', fehlend: 50 - xp };
    if (xp < 500) return { ziel: '⬆️ Aufsteiger', fehlend: 500 - xp };
    if (xp < 1000) return { ziel: '🏅 Erfahrener', fehlend: 1000 - xp };
    if (xp < 5000) return { ziel: '👑 Elite', fehlend: 5000 - xp };
    if (xp < 10000) return { ziel: '🌟 Elite+', fehlend: 10000 - xp };
    if (xp < 25000) return { ziel: '💎 Legende', fehlend: 25000 - xp };
    return null;
}
async function applyWarningEscalation(uid, reason, opts = {}) {
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) return { ok: false, error: 'Admin-Accounts können nicht verwarnt werden' };
    u.warnings = (Number(u.warnings || 0)) + 1;
    const n = u.warnings;
    let mainText;
    const reasonText = reason ? '\n\nGrund: ' + reason : '';
    if (n === 1 || n === 2) mainText = '⚠️ Verwarnung ' + n + '/5' + reasonText + '\n\nDu hast eine Verwarnung erhalten. Bitte achte darauf, dass es nicht wieder passiert.';
    else if (n === 3) mainText = '⚠️ Verwarnung 3/5' + reasonText + '\n\nKurz zur Einordnung:\n\n• Bei der 5. Verwarnung wirst du automatisch gebannt — ohne weiteres Review.\n• Du kannst Verwarnungen wieder abbauen: 5 Tage in Folge Mission M1 erfüllen entfernt 1 Warnung.\n• Verwarnungen blockieren deine Belohnungen nicht direkt, gefährden aber deinen Account.\n\nBitte nimm das ernst.';
    else if (n === 4) mainText = '⚠️ Verwarnung 4/5' + reasonText + '\n\nLetzte Warnung vor dem Bann.\n\n• Eine weitere Verwarnung führt zum automatischen, dauerhaften Bann.\n• Du kannst 1 Warnung abbauen: 5 Tage in Folge Mission M1 erfüllen.\n• Bitte lies die Regeln in Ruhe durch.\n\nDas ist deine letzte Chance — nutze sie.';
    else if (n >= 5) mainText = '🚫 Account dauerhaft gebannt\n\n' + n + '/5 Verwarnungen erreicht' + reasonText + '\n\nDu hast die maximale Anzahl an Verwarnungen erreicht und wurdest automatisch aus der Community entfernt.';
    try { await dmUser(uid, mainText); } catch (e) {}
    const notifIcon = n >= 5 ? '🚫' : (n >= 3 ? '🚨' : '⚠️');
    addNotification(uid, notifIcon, (n >= 5 ? 'Account gebannt' : 'Verwarnung ' + n + '/5') + (reason ? ' (' + reason.slice(0, 40) + ')' : ''));
    let autoBanned = false;
    if (n >= 5 && !u.banned) {
        u.banned = true; u.bannedAt = Date.now();
        u.bannedReason = 'Auto-Ban: 5 Verwarnungen erreicht' + (reason ? ' (letzter Grund: ' + reason + ')' : '');
        u.inGruppe = false; u.started = false;
        if (d.dailyXP) delete d.dailyXP[uid];
        if (d.weeklyXP) delete d.weeklyXP[uid];
        if (d.bonusLinks) delete d.bonusLinks[uid];
        if (d.missionen) delete d.missionen[uid];
        if (d.wochenMissionen) delete d.wochenMissionen[uid];
        if (d.userSessions) delete d.userSessions[uid];
        for (const [, other] of Object.entries(d.users || {})) {
            if (other && other.parent_uid && String(other.parent_uid) === uid) { other.banned = true; other.bannedAt = Date.now(); other.inGruppe = false; other.started = false; }
        }
        autoBanned = true;
    }
    return { ok: true, warnings: n, autoBanned };
}
async function auswertenForUserDay(uid, dayKey, opts) {
    opts = opts || {};
    if (!d.missionAuswertungProUser) d.missionAuswertungProUser = {};
    const idemKey = uid + '_' + dayKey;
    if (d.missionAuswertungProUser[idemKey]) return { skipped: 'already-processed' };
    if (istAdminId(uid)) { d.missionAuswertungProUser[idemKey] = Date.now(); return { skipped: 'admin' }; }
    const u = d.users[uid];
    if (!u || !u.started) return { skipped: 'inactive' };
    const name = u.name || '';
    const wMission = getWochenMission(uid);
    const queue = d.missionQueue[uid] || {};
    const dayLinks = Object.values(d.links).filter(l => new Date(l.timestamp).toDateString() === dayKey);
    // M1 + Warnings: weiter auf Basis der FREMD-Posts (echte gegebene Likes) — unveraendert.
    const dayInstaLinks = dayLinks.filter(l => istInstagramLink(l.text) && String(getRootUid(l.user_id)) !== String(getRootUid(uid)));
    const gelikedTag = dayInstaLinks.filter(l => l.likes && (l.likes instanceof Set ? l.likes.has(String(uid)) : Array.isArray(l.likes) && l.likes.includes(String(uid)))).length;
    const minLinksVorhanden = dayInstaLinks.length >= 5;
    // M2/M3: EXAKT deckungsgleich mit missionStatusApi/Feed — Nenner = alle heutigen
    // Insta-Links, "done" via URL-Merge + Family-Padding (was im Feed rot ist, zaehlt).
    // Sonst weicht die Auszahlung vom angezeigten Status ab (Status sagt done, Reward bleibt aus).
    const dayInstaLinksAll = dayLinks.filter(l => istInstagramLink(l.text));
    const _likedUrls = _likedByUrl(uid);
    const gesamtTag = dayInstaLinksAll.length;
    const gelikedFeed = dayInstaLinksAll.filter(l => _likedUrls.has((l.text || '').trim())).length;
    const prozentTag = gesamtTag > 0 ? gelikedFeed / gesamtTag : 0;
    const storedMission = d.missionen?.[uid]?.date === dayKey ? d.missionen[uid] : null;
    const m1Done = gelikedTag >= 5 || (queue.date === dayKey && !!queue.m1Pending) || !!storedMission?.m1;
    const m2Done = gesamtTag > 0 && prozentTag >= 0.8;
    const m3Target = Math.min(M3_CAP, gesamtTag);
    const m3Done = m3Target > 0 && gelikedFeed >= m3Target;
    const anyDailyMissionDone = m1Done || m2Done || m3Done;
    if (!anyDailyMissionDone && gesamtTag === 0 && !storedMission) { d.missionAuswertungProUser[idemKey] = Date.now(); return { skipped: 'no-activity' }; }
    let meldungen = [];
    let xpEarned = 0;
    let diamondsEarned = 0;
    if (m1Done) { xpAdd(uid, 5, name); xpEarned += 5; meldungen.push('✅ Mission 1 geschafft\n5 Links geliked → +5 XP'); }
    if (m1Done && addWeeklyMissionDay(wMission, 'm1Tage', dayKey)) {
        if (wMission.m1Tage > 7) wMission.m1Tage = 7;
        if (wMission.m1Tage >= 7 && !wMission.m1granted) { xpAdd(uid, 10, name); xpEarned += 10; meldungen.push('🏆 Wochen-M1 geschafft → +10 XP'); wMission.m1granted = true; }
    }
    if (m2Done) {
        xpAdd(uid, 5, name); xpEarned += 5;
        meldungen.push('✅ Mission 2 geschafft\n' + Math.round(prozentTag * 100) + '% geliked → +5 XP');
        if (addWeeklyMissionDay(wMission, 'm2Tage', dayKey)) {
            if (wMission.m2Tage > 7) wMission.m2Tage = 7;
            if (wMission.m2Tage >= 7 && !wMission.m2granted) { xpAdd(uid, 15, name); xpEarned += 15; addDiamond(uid, 1); diamondsEarned += 1; meldungen.push('🏆 Wochen-M2 geschafft → +15 XP + 💎 1 Diamant'); wMission.m2granted = true; }
        }
    }
    if (m3Done) {
        xpAdd(uid, 5, name); xpEarned += 5; addDiamond(uid, 1); diamondsEarned += 1;
        meldungen.push('✅ Mission 3 geschafft\nAlle Links geliked → +5 XP + 💎 1 Diamant');
        if (addWeeklyMissionDay(wMission, 'm3Tage', dayKey)) {
            if (wMission.m3Tage > 7) wMission.m3Tage = 7;
            if (wMission.m3Tage >= 7 && !wMission.m3granted) { xpAdd(uid, 20, name); xpEarned += 20; addDiamond(uid, 2); diamondsEarned += 2; meldungen.push('🏆 Wochen-M3 geschafft → +20 XP + 💎 2 Diamanten'); wMission.m3granted = true; }
        }
    }
    const hatTagLink = Object.values(d.links).some(l => istInstagramLink(l.text) && String(l.user_id) === String(uid) && new Date(l.timestamp).toDateString() === dayKey);
    if (!d.m1Streak[uid]) d.m1Streak[uid] = { count: 0, letzterTag: null };
    if (m1Done) {
        if (d.m1Streak[uid].letzterTag !== dayKey) {
            d.m1Streak[uid].count++;
            d.m1Streak[uid].letzterTag = dayKey;
            // Posting-Sperre-Entsperrung: bei 5/5 Verwarnungen reicht 2 Tage M1 in Folge,
            // um EINE Verwarnung loszuwerden (5/5 → 4/5) → Posten wieder frei. count reset.
            if (Number(d.users[uid]?.warnings || 0) >= 5 && d.m1Streak[uid].count >= 2) {
                d.users[uid].warnings = 4;
                d.m1Streak[uid].count = 0;
                if (!opts.silent) { try { await dmUser(uid, '🎉 Posten wieder freigeschaltet\n\nDu hast 2 Tage Mission M1 in Folge geschafft.\n\n⚠️ Verwarnungen: 4/5\n\nDu kannst wieder posten — schön, dass du dranbleibst!'); } catch (e) {} }
            }
            else if (d.m1Streak[uid].count >= 5 && d.users[uid]?.warnings > 0) {
                d.users[uid].warnings--;
                d.m1Streak[uid].count = 0;
                if (!opts.silent) { try { await dmUser(uid, '🎉 Verwarnung entfernt\n\nDu hast 5 Tage Mission M1 in Folge geschafft.\n\n⚠️ Verwarnungen: ' + d.users[uid].warnings + '/5\n\nWeiter so!'); } catch (e) {} }
            }
        }
    } else if (!opts.skipStreakReset) { d.m1Streak[uid].count = 0; }
    if (hatTagLink && !m1Done && minLinksVorhanden && d.users[uid] && !opts.silent) {
        await applyWarningEscalation(String(uid), 'Link gepostet, aber M1 nicht erfüllt').catch(() => {});
    }
    if (!opts.silent) {
        if (meldungen.length > 0 && d.users[uid]) {
            const u2 = d.users[uid];
            const nb = xpBisNaechstesBadge(u2.xp);
            try { await dmUser(uid, '🎯 Missions-Auswertung\n\n' + meldungen.join('\n\n') + '\n\n⭐ Gesamt: ' + u2.xp + ' XP' + (nb ? '\n⬆️ Noch ' + nb.fehlend + ' bis ' + nb.ziel : '')); } catch (e) {}
        } else if (hatTagLink && d.users[uid]?.started) {
            try { await dmUser(uid, '📊 Missions-Auswertung\n\nHeute war keine Mission erfüllt.\n\nMacht nichts — heute hast du eine neue Chance! 💪'); } catch (e) {}
        }
    }
    if (d.missionQueue[uid] && d.missionQueue[uid].date === dayKey) delete d.missionQueue[uid];
    d.missionAuswertungProUser[idemKey] = Date.now();
    return { ok: true, m1Done, m2Done, m3Done, xpEarned, diamondsEarned, wMission: { ...wMission } };
}
async function missionenAuswerten() {
    const heute = new Date().toDateString();
    const gesternStr = new Date(Date.now() - 86400000).toDateString();
    const jetzt12 = heute + '_12';
    if (d.missionAuswertungErledigt?.[jetzt12]) return;
    if (!d.missionAuswertungErledigt) d.missionAuswertungErledigt = {};
    d.missionAuswertungErledigt[jetzt12] = true;
    const candidates = new Set([...Object.keys(d.missionQueue || {}), ...Object.keys(d.users || {})]);
    for (const uid of candidates) await auswertenForUserDay(uid, gesternStr, {});
    d.missionAuswertungErledigt = { [jetzt12]: true };
}
function thisWeekBackfillDays() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    monday.setHours(0, 0, 0, 0);
    const out = [];
    const yesterdayCutoff = new Date(now); yesterdayCutoff.setDate(now.getDate() - 1); yesterdayCutoff.setHours(23, 59, 59, 999);
    for (let d2 = new Date(monday); d2 <= yesterdayCutoff; d2.setDate(d2.getDate() + 1)) out.push(new Date(d2).toDateString());
    return out;
}
async function backfillMissionenSinceMonday(opts) {
    opts = Object.assign({ silent: true, skipStreakReset: true }, opts || {});
    const days = thisWeekBackfillDays();
    const stats = { days: days.length, users: 0, bumped: 0, xp: 0, diamonds: 0, skipped: 0 };
    if (!days.length) return { ok: true, stats };
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || !u.started || istAdminId(uid)) continue;
        stats.users++;
        for (const dayKey of days) {
            const r = await auswertenForUserDay(uid, dayKey, opts);
            if (r && r.ok) { stats.bumped++; stats.xp += r.xpEarned || 0; stats.diamonds += r.diamondsEarned || 0; }
            else if (r && r.skipped) stats.skipped++;
        }
    }
    return { ok: true, days, stats };
}

// ════════ NACHRICHTEN (User-DMs + App-Chat) ════════
function sendDmSingleApi({ uid, text }) {
    uid = String(uid || '');
    text = String(text || '').trim();
    if (!text) return { ok: false, error: 'Text fehlt' };
    if (text.length > 1500) return { ok: false, error: 'Max 1500 Zeichen' };
    if (!d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    try { dmUser(uid, text); } catch (e) {}
    return { ok: true };
}
// Admin-Postfach-Antwort: schreibt eine vom Admin manuell verfasste Antwort in den
// creatorboost↔user-Chat — getaggt mit adminReply:true, damit das Postfach sie von den
// automatischen Bot-DMs (Belohnungen, System) unterscheiden kann.
function adminPostfachReply({ uid, text }) {
    uid = String(uid || '');
    text = String(text || '').trim().slice(0, 1500);
    if (!uid || !text) return { ok: false, error: 'Leer' };
    if (!d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    if (!d.messages) d.messages = {};
    const chatKey = [CREATORBOOST_UID, uid].sort().join('_');
    if (!d.messages[chatKey]) d.messages[chatKey] = [];
    d.messages[chatKey].push({
        from: CREATORBOOST_UID, to: String(uid), text,
        image: null, audio: null, timestamp: Date.now(),
        read: false, system: true, adminReply: true,
    });
    if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    try { addNotification(uid, '💬', 'CreatorBoost: ' + text.slice(0, 40), CREATORBOOST_UID); } catch (e) {}
    return { ok: true };
}
// User→User DM (1:1 aus /send-message-api). Telegram-Weiterleitung entfernt;
// Helper-Ticket-Auto-Forward (Admin→creatorboost) + Notifications bleiben.
function sendMessageApi({ from, to, text, image, audio, replyTo }) {
    if (!from || !to || (!text?.trim() && !image && !audio)) return { ok: false };
    if (!d.messages) d.messages = {};
    const fromIsAdmin = Array.isArray(d._adminIds) && d._adminIds.map(String).includes(String(from));
    const toIsCreatorboost = String(to) === CREATORBOOST_UID;
    let ticketForwarded = null;
    if (fromIsAdmin && toIsCreatorboost && text && text.trim() && !image && !audio) {
        const txt = text.trim();
        if (!Array.isArray(d.helperQuestions)) d.helperQuestions = [];
        let targetTicket = null;
        let answerText = txt;
        const mTagged = txt.match(/^\/t\s+(hq_[a-z0-9_]+)\s+([\s\S]+)$/i);
        if (mTagged) { targetTicket = d.helperQuestions.find(q => q.id === mTagged[1]); answerText = mTagged[2].trim(); }
        else { targetTicket = d.helperQuestions.filter(q => !q.answeredAt).sort((a, b) => (a.ts || 0) - (b.ts || 0))[0] || null; }
        if (targetTicket && answerText) {
            targetTicket.answeredAt = Date.now();
            targetTicket.answer = answerText.slice(0, 1500);
            targetTicket.answeredBy = String(from);
            const userObj = d.users[targetTicket.uid];
            const userName = userObj?.spitzname || userObj?.name || ('User ' + targetTicket.uid);
            try { sendInAppDM(targetTicket.uid, '📨 Antwort auf deine Frage\n\nDeine Frage: ' + (targetTicket.question || '').slice(0, 140) + '\n\n' + answerText); } catch (e) {}
            if (!d.helperChats) d.helperChats = {};
            if (!Array.isArray(d.helperChats[targetTicket.uid])) d.helperChats[targetTicket.uid] = [];
            const _esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            d.helperChats[targetTicket.uid].push({ role: 'bot', text: '📨 <b>Admin-Antwort</b> auf <i>"' + _esc((targetTicket.question || '').slice(0, 80)) + '"</i>:<br><br>' + _esc(String(answerText)).replace(/\n/g, '<br>'), ts: Date.now(), fromAdmin: true, ticketId: targetTicket.id });
            if (d.helperChats[targetTicket.uid].length > 200) d.helperChats[targetTicket.uid] = d.helperChats[targetTicket.uid].slice(-200);
            ticketForwarded = { id: targetTicket.id, userName, uid: targetTicket.uid, followUps: targetTicket.followUps || [] };
        }
    }
    const chatKey = [String(from), String(to)].sort().join('_');
    if (!d.messages[chatKey]) d.messages[chatKey] = [];
    const msgEntry = { from: String(from), to: String(to), text: (text || '').slice(0, 500), image: image || null, audio: audio || null, timestamp: Date.now(), read: false };
    if (replyTo && (replyTo.text || replyTo.name)) {
        msgEntry.replyTo = { ts: Number(replyTo.ts) || 0, name: String(replyTo.name || '').slice(0, 40), text: String(replyTo.text || '').slice(0, 140) };
    }
    d.messages[chatKey].push(msgEntry);
    if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    if (ticketForwarded) {
        const stillOpen = d.helperQuestions.filter(q => !q.answeredAt).length;
        const followUpsCount = Array.isArray(ticketForwarded.followUps) ? ticketForwarded.followUps.length : 0;
        const followUpsTxt = followUpsCount > 0 ? ' (inkl. ' + followUpsCount + ' Follow-up' + (followUpsCount === 1 ? '' : 's') + ')' : '';
        const confirm = '✅ Antwort an ' + ticketForwarded.userName + ' gesendet — Ticket ' + ticketForwarded.id + ' geschlossen' + followUpsTxt + '.' + (stillOpen > 0 ? '\n\n🎫 Noch ' + stillOpen + ' offene Ticket' + (stillOpen === 1 ? '' : 's') + ' — die nächste Nachricht hier geht an den nächsten User.' : '\n\n📭 Keine weiteren offenen Tickets.');
        d.messages[chatKey].push({ from: CREATORBOOST_UID, to: String(from), text: confirm, image: null, audio: null, timestamp: Date.now() + 1, read: true, system: true });
        if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    }
    const fromUser = d.users[from];
    const senderName = fromUser?.spitzname || fromUser?.name || 'Jemand';
    if (fromUser) addNotification(String(to), '💬', senderName + (text ? ': ' + text.slice(0, 40) : ' hat dir etwas gesendet'), String(from));
    if (String(to) === CREATORBOOST_UID && String(from) !== CREATORBOOST_UID) {
        const preview = text ? ': ' + text.slice(0, 40) : (image ? ' 📷 Foto' : audio ? ' 🎤 Sprachnachricht' : '');
        for (const adminId of (Array.isArray(d._adminIds) ? d._adminIds : [])) {
            try { addNotification(String(adminId), '💬', '→ CreatorX: ' + senderName + preview, String(from)); } catch (e) {}
        }
    }
    return { ok: true, ticketForwarded: ticketForwarded || null };
}
function markMessagesRead({ uid, chatKey }) {
    if (!uid || !chatKey || !d.messages?.[chatKey]) return { ok: false };
    d.messages[chatKey].forEach(m => { if (String(m.to) === String(uid)) m.read = true; });
    return { ok: true };
}
function editMessageApi({ uid, chatKey, timestamp, newText }) {
    if (!uid || !chatKey || !timestamp || typeof newText !== 'string') return { ok: false, error: 'Fehlende Felder' };
    const arr = d.messages?.[chatKey];
    if (!arr) return { ok: false, error: 'Chat nicht gefunden' };
    const msg = arr.find(m => Number(m.timestamp) === Number(timestamp) && String(m.from) === String(uid));
    if (!msg) return { ok: false, error: 'Nachricht nicht gefunden oder nicht von dir' };
    if (Date.now() - msg.timestamp > 5 * 60 * 1000) return { ok: false, error: 'Bearbeitungs-Limit (5 Min) überschritten' };
    if (msg.image || msg.audio) return { ok: false, error: 'Nur Text-Nachrichten editierbar' };
    const trimmed = String(newText || '').trim().slice(0, 500);
    if (!trimmed) return { ok: false, error: 'Text darf nicht leer sein' };
    msg.text = trimmed; msg.edited = true; msg.editedAt = Date.now();
    return { ok: true };
}
function deleteDmApi({ chatKey, timestamp, uid }) {
    if (!chatKey || !timestamp || !d.messages?.[chatKey]) return { ok: false };
    const msg = d.messages[chatKey].find(m => m.timestamp === Number(timestamp));
    if (!msg) return { ok: false };
    const _admins = Array.isArray(d._adminIds) ? d._adminIds.map(String) : [];
    const isAdmin = _admins.includes(String(uid)) || !!d.users?.[String(uid)]?.role?.includes('Admin');
    if (msg.from !== String(uid) && !isAdmin) return { ok: false, error: 'Kein Zugriff' };
    d.messages[chatKey] = d.messages[chatKey].filter(m => m.timestamp !== Number(timestamp));
    return { ok: true };
}
function reactDmMsgApi({ chatKey, timestamp, emoji, uid }) {
    if (!chatKey || !timestamp || !emoji || !uid) return { ok: false };
    const msgs = d.messages?.[String(chatKey)] || [];
    const msg = msgs.find(m => Number(m.timestamp) === Number(timestamp));
    if (!msg) return { ok: false, error: 'Nachricht nicht gefunden' };
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const uidStr = String(uid);
    const idx = msg.reactions[emoji].indexOf(uidStr);
    if (idx >= 0) { msg.reactions[emoji].splice(idx, 1); if (!msg.reactions[emoji].length) delete msg.reactions[emoji]; }
    else msg.reactions[emoji].push(uidStr);
    return { ok: true };
}
function getAppChat({ uid, since, limit }) {
    uid = String(uid || '');
    since = Number(since || 0);
    if (!d.appChat) d.appChat = [];
    if (!d.appChatLastRead) d.appChatLastRead = {};
    if (uid && d.users[uid]) d.users[uid].appLastSeen = Date.now();
    const lim = Math.min(Number(limit) || 200, 500);
    const msgs = since > 0 ? d.appChat.filter(m => (m.ts || 0) > since) : d.appChat.slice(-lim);
    const lastRead = uid ? (d.appChatLastRead[uid] || 0) : 0;
    const unread = uid ? d.appChat.filter(m => (m.ts || 0) > lastRead && String(m.uid) !== uid && !m.deleted).length : 0;
    const memberCount = Object.entries(d.users || {}).filter(([u2, u]) => {
        if (!u) return false;
        if (u.parent_uid) return false;
        if (u.appUser) return true;
        if (u.appLastSeen) return true;
        if (u.password_hash) return true;
        if (d.appActivity && d.appActivity[u2]) return true;
        return false;
    }).length;
    return { ok: true, messages: msgs, lastRead, unread, memberCount };
}
function appChatSend({ uid, text, image, replyToTs }) {
    uid = String(uid || '');
    text = String(text || '').trim().slice(0, 2000);
    image = image ? String(image).slice(0, 500000) : null;
    replyToTs = Number(replyToTs || 0);
    if (!uid || !d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    if (!text && !image) return { ok: false, error: 'Leer' };
    if (!d.appChat) d.appChat = [];
    const u = d.users[uid];
    u.appLastSeen = Date.now();
    const msg = { uid, name: u.spitzname || u.name || 'User', text, image: image || null, ts: Date.now() };
    if (replyToTs) {
        const parent = d.appChat.find(x => Number(x.ts) === replyToTs);
        if (parent) msg.replyTo = { ts: Number(parent.ts), uid: String(parent.uid), name: parent.name || 'User', text: (parent.text || '').slice(0, 200), hasImage: !!parent.image };
    }
    d.appChat.push(msg);
    if (d.appChat.length > 1000) d.appChat = d.appChat.slice(-1000);
    return { ok: true, message: msg };
}
function appChatMarkRead({ uid }) {
    uid = String(uid || '');
    if (!uid) return { ok: false };
    if (!d.appChatLastRead) d.appChatLastRead = {};
    d.appChatLastRead[uid] = Date.now();
    return { ok: true };
}
function appChatDelete({ uid, ts }) {
    uid = String(uid || '');
    ts = Number(ts || 0);
    if (!uid || !ts) return { ok: false };
    if (!d.appChat) d.appChat = [];
    const idx = d.appChat.findIndex(m => Number(m.ts) === ts);
    if (idx < 0) return { ok: false, error: 'Nicht gefunden' };
    const m = d.appChat[idx];
    const isOwner = String(m.uid) === uid;
    const isAdmin = istAdminId(Number(uid));
    if (!isOwner && !isAdmin) return { ok: false, error: 'Kein Zugriff' };
    m.deleted = true; m.deletedAt = Date.now(); m.deletedBy = uid;
    return { ok: true };
}
function appChatReact({ uid, ts, emoji }) {
    uid = String(uid || '');
    ts = Number(ts || 0);
    emoji = String(emoji || '').slice(0, 8);
    if (!uid || !ts || !emoji) return { ok: false };
    if (!/[\p{Emoji}‍]+/u.test(emoji)) return { ok: false, error: 'Kein Emoji' };
    if (!d.appChat) d.appChat = [];
    const m = d.appChat.find(x => Number(x.ts) === ts);
    if (!m) return { ok: false, error: 'Nicht gefunden' };
    if (!m.reactions) m.reactions = {};
    let hadSameEmoji = false;
    for (const e of Object.keys(m.reactions)) {
        const i = m.reactions[e].indexOf(uid);
        if (i >= 0) { m.reactions[e].splice(i, 1); if (e === emoji) hadSameEmoji = true; if (m.reactions[e].length === 0) delete m.reactions[e]; }
    }
    if (!hadSameEmoji) { if (!m.reactions[emoji]) m.reactions[emoji] = []; m.reactions[emoji].push(uid); }
    if (d.users[uid]) d.users[uid].appLastSeen = Date.now();
    return { ok: true, reactions: m.reactions };
}

// ════════ MINDSET-STORIES ════════
function _mindsetEnsure() {
    if (!d.mindsetStories) d.mindsetStories = { weeklyState: { week: null, pickedUid: null, pickedAt: null, locked: false }, waitlist: {}, rejected: {}, done: {} };
    const ms = d.mindsetStories;
    if (!ms.weeklyState) ms.weeklyState = { week: null, pickedUid: null, pickedAt: null, locked: false };
    if (!ms.waitlist) ms.waitlist = {};
    if (!ms.rejected) ms.rejected = {};
    if (!ms.done) ms.done = {};
}
function isMindsetLocked() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0) return true;
    if (day === 6 && now.getHours() >= 23 && now.getMinutes() >= 59) return true;
    return false;
}
function _isAdminCaller(callerUid) {
    return !!callerUid && (istAdminId(callerUid) || String(d.users[callerUid]?.role || '').includes('Admin'));
}
function sendMindsetWinnerDM(uid) {
    const name = d.users[uid]?.spitzname || d.users[uid]?.name || '';
    const greeting = name ? 'Hallo ' + name + ',' : 'Hallo,';
    const text = greeting + '\n\n' +
        'du wurdest diese Woche für die Mindset Stories auf @mindset.stories_ ausgewählt — herzlichen Glückwunsch. Du erscheinst am kommenden Sonntag bzw. Montag in den Stories.\n\n' +
        'Damit ich dich gut vorstellen kann, benötige ich folgende Infos von dir:\n\n' +
        '1. 1–2 Deckblätter (Bilder oder Grafiken, die zu dir passen)\n' +
        '2. 1–2 Interessen oder Themen, die du abdeckst\n' +
        '3. Eine kurze Beschreibung deines Kanals bzw. deiner Nische\n' +
        '4. Was sollen meine Follower aus deinem Post mitnehmen?\n' +
        '5. Bietest du etwas an (Kurse, Beratung, Coaching o.ä.)?\n' +
        '6. Bist du auch auf YouTube oder TikTok aktiv? Falls ja, gerne mit Handles.\n\n' +
        'Schick mir die Infos einfach hier in der DM zurück — ich erstelle daraus eine ansprechende Vorstellung.\n\n' +
        'Bitte spätestens bis Samstag 23:59 zurückmelden, damit genug Zeit für die Vorbereitung bleibt.\n\n' +
        'Viele Grüße';
    sendInAppDM(uid, text);
}
function sendMindsetInviteDM(uid) {
    const name = d.users[uid]?.spitzname || d.users[uid]?.name || '';
    const greeting = name ? 'Hallo ' + name + ',' : 'Hallo,';
    const text = greeting + '\n\n' +
        'ich starte einen wöchentlichen Mindset-Stories-Slot auf meinem Instagram-Profil @mindset.stories_, in dem ich Creator aus unserer Community vorstelle.\n\n' +
        'Ziel ist es, die Community zu pushen und gemeinsam mehr Reichweite zu generieren.\n\n' +
        'Wenn du Interesse hast, kannst du dich gerne über die App eintragen. Ich wähle anschließend jede Woche einen User aus der Warteliste aus und stelle ihn am Sonntag/Montag auf @mindset.stories_ vor.\n\n' +
        'So funktioniert\'s:\n' +
        '1. App öffnen → Explore → News\n' +
        '2. Bei "Mindset Stories" auf Ja oder Nein klicken\n' +
        '3. Bei Ja: du bist auf der Warteliste, ich melde mich sobald du dran bist\n\n' +
        'Ohne Druck — du kannst deine Antwort bis Samstag 23:59 jederzeit ändern.\n\n' +
        'Viele Grüße';
    sendInAppDM(uid, text);
}
function mindsetSetAnswerApi({ uid, answer }) {
    _mindsetEnsure();
    uid = String(uid || '');
    answer = String(answer || '');
    if (!uid || !d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    if (!['yes', 'no'].includes(answer)) return { ok: false, error: 'Ungültige Antwort' };
    if (!d.users[uid].instagram) return { ok: false, error: 'Erst Instagram-Username in den Einstellungen setzen' };
    if (isMindsetLocked()) return { ok: false, error: 'Antworten für diese Woche bereits gefroren' };
    if (d.mindsetStories.done[uid]) return { ok: false, error: 'Du wurdest bereits vorgestellt' };
    const now = Date.now();
    if (answer === 'yes') {
        delete d.mindsetStories.rejected[uid];
        const prev = d.mindsetStories.waitlist[uid];
        d.mindsetStories.waitlist[uid] = { joinedAt: prev?.joinedAt || now, lastChangedAt: now };
    } else {
        delete d.mindsetStories.waitlist[uid];
        d.mindsetStories.rejected[uid] = { rejectedAt: now };
    }
    return { ok: true };
}
function runMindsetPickApi() {
    _mindsetEnsure();
    const ms = d.mindsetStories;
    const week = getBerlinWeekKey();
    if (ms.weeklyState.week === week && ms.weeklyState.pickedUid) return { ok: true, already: true, pickedUid: ms.weeklyState.pickedUid };
    const eligible = Object.keys(ms.waitlist).filter(uid => { const u = d.users[uid]; return u && u.instagram && !ms.done[uid]; });
    if (!eligible.length) {
        ms.weeklyState = { week, pickedUid: null, pickedAt: Date.now(), locked: true };
        return { ok: true, pickedUid: null, reason: 'Niemand auf Warteliste' };
    }
    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    ms.weeklyState = { week, pickedUid: winner, pickedAt: Date.now(), locked: true };
    delete ms.waitlist[winner];
    ms.done[winner] = { week, featuredAt: Date.now(), name: d.users[winner]?.spitzname || d.users[winner]?.name || '?' };
    try { sendMindsetWinnerDM(winner); } catch (e) {}
    return { ok: true, pickedUid: winner, pickedName: d.users[winner]?.name };
}
function mindsetAdminPickApi({ callerUid, targetUid }) {
    _mindsetEnsure();
    callerUid = String(callerUid || '');
    if (!_isAdminCaller(callerUid)) return { ok: false, error: 'Kein Admin' };
    targetUid = String(targetUid || '');
    if (!targetUid || !d.users[targetUid]) return { ok: false, error: 'User nicht gefunden' };
    const ms = d.mindsetStories;
    const week = getBerlinWeekKey();
    if (ms.weeklyState.pickedUid && ms.weeklyState.pickedUid !== targetUid) {
        const prev = ms.weeklyState.pickedUid;
        if (ms.done[prev] && ms.done[prev].week === week) { delete ms.done[prev]; ms.waitlist[prev] = { joinedAt: Date.now(), lastChangedAt: Date.now() }; }
    }
    delete ms.waitlist[targetUid];
    ms.weeklyState = { week, pickedUid: targetUid, pickedAt: Date.now(), locked: true };
    ms.done[targetUid] = { week, featuredAt: Date.now(), name: d.users[targetUid]?.spitzname || d.users[targetUid]?.name || '?' };
    try { sendMindsetWinnerDM(targetUid); } catch (e) {}
    return { ok: true, pickedUid: targetUid };
}
function mindsetAdminSkipApi({ callerUid }) {
    _mindsetEnsure();
    if (!_isAdminCaller(String(callerUid || ''))) return { ok: false, error: 'Kein Admin' };
    d.mindsetStories.weeklyState = { week: getBerlinWeekKey(), pickedUid: null, pickedAt: Date.now(), locked: true, skipped: true };
    return { ok: true };
}
function mindsetAdminBlastApi({ callerUid }) {
    _mindsetEnsure();
    if (!_isAdminCaller(String(callerUid || ''))) return { ok: false, error: 'Kein Admin' };
    const ms = d.mindsetStories;
    const targets = Object.keys(d.users).filter(uid => {
        const u = d.users[uid];
        if (!u || !u.instagram || u.isSystem) return false;
        if (istAdminId(uid)) return false;
        if (ms.waitlist[uid] || ms.rejected[uid] || ms.done[uid]) return false;
        return true;
    });
    let sent = 0;
    for (const uid of targets) { try { sendMindsetInviteDM(uid); sent++; } catch (e) {} }
    return { ok: true, queued: targets.length, sent };
}
function mindsetAdminRestoreApi({ callerUid, targetUid }) {
    _mindsetEnsure();
    if (!_isAdminCaller(String(callerUid || ''))) return { ok: false, error: 'Kein Admin' };
    targetUid = String(targetUid || '');
    if (!d.mindsetStories.done[targetUid]) return { ok: false, error: 'User nicht in Erledigt-Liste' };
    if (d.mindsetStories.weeklyState?.pickedUid === targetUid) {
        d.mindsetStories.weeklyState = { week: d.mindsetStories.weeklyState.week, pickedUid: null, pickedAt: null, locked: false };
    }
    delete d.mindsetStories.done[targetUid];
    d.mindsetStories.waitlist[targetUid] = { joinedAt: Date.now(), lastChangedAt: Date.now() };
    return { ok: true };
}

// ════════ HELPER-FRAGEN (Q&A-Tickets) ════════
function helperChatAppendApi({ uid, role, text }) {
    uid = String(uid || '');
    role = String(role || '');
    text = String(text || '').slice(0, 2000);
    if (!uid || !text || (role !== 'user' && role !== 'bot')) return { ok: false, error: 'uid+role(user|bot)+text erforderlich' };
    if (!d.helperChats) d.helperChats = {};
    if (!Array.isArray(d.helperChats[uid])) d.helperChats[uid] = [];
    d.helperChats[uid].push({ role, text, ts: Date.now() });
    if (d.helperChats[uid].length > 200) d.helperChats[uid] = d.helperChats[uid].slice(-200);
    return { ok: true };
}
function helperQuestionApi({ fromUid, question }) {
    fromUid = String(fromUid || '');
    question = String(question || '').trim().slice(0, 800);
    if (!fromUid || !question) return { ok: false, error: 'fromUid + question erforderlich' };
    const u = d.users[fromUid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!d.helperQuestions) d.helperQuestions = [];
    const userName = u.spitzname || u.name || ('User ' + fromUid);
    const userHandle = u.instagram ? ' (@' + u.instagram + ')' : '';
    const openTicket = d.helperQuestions.filter(q => String(q.uid) === fromUid && !q.answeredAt).sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
    if (openTicket) {
        if (!Array.isArray(openTicket.followUps)) openTicket.followUps = [];
        if (openTicket.followUps.length >= 10) return { ok: false, error: 'Schon 10 Follow-up-Fragen in diesem Ticket — bitte auf Admin-Antwort warten.' };
        openTicket.followUps.push({ text: question, ts: Date.now() });
        const adminIds = Array.isArray(d._adminIds) ? d._adminIds : [];
        const followText = '💬 Follow-up zu Ticket ' + openTicket.id + ' von ' + userName + userHandle + '\n\nFrage: ' + question + '\n\nAntworte einfach hier im Chat — geht an ' + userName + '.';
        for (const aId of adminIds) { addNotification(String(aId), '💬', userName + ' (Follow-up): ' + question.slice(0, 40), fromUid); try { sendInAppDM(String(aId), followText); } catch (e) {} }
        if (!d.messages) d.messages = {};
        const chatKey = [CREATORBOOST_UID, fromUid].sort().join('_');
        if (!d.messages[chatKey]) d.messages[chatKey] = [];
        d.messages[chatKey].push({ from: fromUid, to: CREATORBOOST_UID, text: '💬 Follow-up: ' + question, image: null, audio: null, timestamp: Date.now(), read: false, system: false });
        if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
        return { ok: true, qId: openTicket.id, followUp: true };
    }
    const qId = 'hq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    d.helperQuestions.push({ id: qId, uid: fromUid, name: userName, question, ts: Date.now(), answeredAt: null, answer: null, followUps: [] });
    if (d.helperQuestions.length > 500) d.helperQuestions = d.helperQuestions.slice(-500);
    if (!d.messages) d.messages = {};
    const chatKey = [CREATORBOOST_UID, fromUid].sort().join('_');
    if (!d.messages[chatKey]) d.messages[chatKey] = [];
    d.messages[chatKey].push({ from: fromUid, to: CREATORBOOST_UID, text: '🤖 Helper-Frage: ' + question, image: null, audio: null, timestamp: Date.now(), read: false, system: false });
    if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    sendInAppDM(fromUid, '✅ Frage erhalten\n\nIch kümmere mich darum und melde mich hier zurück. Eine Antwort kommt meistens innerhalb von 1 Stunde.');
    const adminIds = Array.isArray(d._adminIds) ? d._adminIds : [];
    const adminAppDmText = '🎫 Neues Ticket ' + qId + '\n\n👤 Von: ' + userName + userHandle + ' (UID ' + fromUid + ')\n\nFrage:\n' + question + '\n\nAntworte einfach hier in diesem Chat — geht direkt an den User. Weitere Fragen landen in diesem Ticket, bis du antwortest.';
    for (const aId of adminIds) { addNotification(String(aId), '🎫', 'Ticket ' + userName + ': ' + question.slice(0, 40), fromUid); try { sendInAppDM(String(aId), adminAppDmText); } catch (e) {} }
    return { ok: true, qId };
}
function adminHelperAnswerApi({ qId, answer }) {
    qId = String(qId || '');
    answer = String(answer || '').trim().slice(0, 1500);
    if (!qId || !answer) return { ok: false, error: 'qId + answer erforderlich' };
    if (!Array.isArray(d.helperQuestions)) d.helperQuestions = [];
    const q = d.helperQuestions.find(x => x.id === qId);
    if (!q) return { ok: false, error: 'Frage nicht gefunden' };
    q.answeredAt = Date.now();
    q.answer = answer;
    sendInAppDM(q.uid, '📨 Antwort auf deine Frage\n\nDeine Frage: ' + (q.question || '').slice(0, 100) + '\n\n' + answer);
    if (!d.helperChats) d.helperChats = {};
    if (!Array.isArray(d.helperChats[q.uid])) d.helperChats[q.uid] = [];
    d.helperChats[q.uid].push({ role: 'bot', text: '📨 Admin-Antwort:\n\n' + answer, ts: Date.now(), fromAdmin: true });
    if (d.helperChats[q.uid].length > 200) d.helperChats[q.uid] = d.helperChats[q.uid].slice(-200);
    return { ok: true };
}

// ════════ USER MERGE / DELETE (Helfer 1:1 aus dem Bot) ════════
function _findUser(query) {
    const q = String(query).trim().toLowerCase().replace(/^@/, '');
    if (!q) return null;
    if (d.users[q]) return q;
    if (d.users[query]) return query;
    for (const [uid, u] of Object.entries(d.users)) {
        if (String(u.username || '').toLowerCase() === q) return uid;
        if (String(u.instagram || '').toLowerCase() === q) return uid;
        if (String(u.name || '').toLowerCase() === q) return uid;
        if (String(u.spitzname || '').toLowerCase() === q) return uid;
        if (String(u.email || '').toLowerCase() === q) return uid;
    }
    return null;
}
function _purgeUidFromCollections(uid) {
    const id = String(uid);
    for (const key of [
        'dailyXP', 'weeklyXP', 'gesternDailyXP', 'tracker', 'counter', 'badgeTracker',
        'bonusLinks', 'missionen', 'wochenMissionen', 'missionQueue', 'm1Streak',
        'dailyLogins', 'dailyGroupMsgs', 'threadLastRead', 'warteNachricht',
        'instaWarte', 'dmNachrichten', 'appActivity', '_smartReminderSent'
    ]) {
        if (d[key] && d[key][id] !== undefined) delete d[key][id];
    }
    if (d.notifications) delete d.notifications[id];
    if (d.appChatLastRead) delete d.appChatLastRead[id];
    if (d.posts) delete d.posts[id];
    if (d.pinnedEngages) delete d.pinnedEngages[id];
    for (const u of Object.values(d.users || {})) {
        if (Array.isArray(u.followers)) u.followers = u.followers.filter(x => String(x) !== id);
        if (Array.isArray(u.following)) u.following = u.following.filter(x => String(x) !== id);
    }
    for (const [k, l] of Object.entries(d.links || {})) {
        if (String(l.user_id) === id) { delete d.links[k]; continue; }
        if (l.likes) {
            if (typeof l.likes.delete === 'function') l.likes.delete(id);
            else if (Array.isArray(l.likes)) l.likes = l.likes.filter(x => String(x) !== id);
        }
        if (l.likerNames && l.likerNames[id]) delete l.likerNames[id];
    }
    for (const [k, sl] of Object.entries(d.superlinks || {})) {
        if (String(sl.uid) === id) { delete d.superlinks[k]; continue; }
        if (Array.isArray(sl.likes)) sl.likes = sl.likes.filter(x => String(x) !== id);
        if (sl.likerNames && sl.likerNames[id]) delete sl.likerNames[id];
    }
    if (d.comments && typeof d.comments === 'object') {
        for (const cKey of Object.keys(d.comments)) {
            if (Array.isArray(d.comments[cKey])) d.comments[cKey] = d.comments[cKey].filter(c => String(c.uid) !== id);
        }
    }
    if (Array.isArray(d.appChat)) {
        for (const m of d.appChat) {
            if (String(m.uid) === id) { m.deleted = true; m.deletedAt = Date.now(); }
            if (m.reactions) {
                for (const emoji of Object.keys(m.reactions)) {
                    if (Array.isArray(m.reactions[emoji])) {
                        m.reactions[emoji] = m.reactions[emoji].filter(x => String(x) !== id);
                        if (m.reactions[emoji].length === 0) delete m.reactions[emoji];
                    }
                }
            }
        }
    }
    if (d.threadMessages && typeof d.threadMessages === 'object') {
        for (const tk of Object.keys(d.threadMessages)) {
            if (Array.isArray(d.threadMessages[tk])) d.threadMessages[tk] = d.threadMessages[tk].filter(m => String(m.uid) !== id);
        }
    }
    if (d.messages && typeof d.messages === 'object') {
        for (const chatKey of Object.keys(d.messages)) {
            if (chatKey.split('_').includes(id)) delete d.messages[chatKey];
        }
    }
    if (d.notifications && typeof d.notifications === 'object') {
        for (const nk of Object.keys(d.notifications)) {
            if (Array.isArray(d.notifications[nk])) d.notifications[nk] = d.notifications[nk].filter(n => String(n.actorUid || '') !== id);
        }
    }
    if (d.pinnedEngages && typeof d.pinnedEngages === 'object') {
        for (const pk of Object.keys(d.pinnedEngages)) {
            if (Array.isArray(d.pinnedEngages[pk])) d.pinnedEngages[pk] = d.pinnedEngages[pk].filter(x => String(x) !== id);
        }
    }
    if (Array.isArray(d.emailLoginLog)) d.emailLoginLog = d.emailLoginLog.filter(e => String(e.uid || '') !== id);
    if (d.mindsetStories) {
        if (d.mindsetStories.waitlist) delete d.mindsetStories.waitlist[id];
        if (d.mindsetStories.rejected) delete d.mindsetStories.rejected[id];
        if (d.mindsetStories.done) delete d.mindsetStories.done[id];
        if (d.mindsetStories.weeklyState && String(d.mindsetStories.weeklyState.pickedUid) === id) d.mindsetStories.weeklyState.pickedUid = null;
    }
    const u = d.users[id];
    if (u && u.parent_uid && d.users[u.parent_uid]) delete d.users[u.parent_uid].subUid;
    if (u && u.subUid && d.users[u.subUid]) delete d.users[u.subUid].parent_uid;
}
function _deleteUser(uid) {
    const id = String(uid);
    const u = d.users[id];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!d._deleteLog) d._deleteLog = [];
    d._deleteLog.push({ timestamp: Date.now(), uid: id, backup: JSON.parse(JSON.stringify(u)) });
    while (d._deleteLog.length > 50) d._deleteLog.shift();
    _purgeUidFromCollections(id);
    delete d.users[id];
    return { ok: true, name: u.name || u.email || id };
}
function _mergeUserData(sourceUid, targetUid) {
    const src = d.users[String(sourceUid)];
    const tgt = d.users[String(targetUid)];
    if (!src || !tgt) return { ok: false, error: 'User nicht gefunden' };
    const sId = String(sourceUid);
    const tId = String(targetUid);
    const log = [];
    const profileFields = ['email', 'emailConfirmedAt', 'pendingEmail', 'password_hash',
        'instagram', 'bio', 'nische', 'spitzname', 'website', 'tiktok', 'youtube', 'twitter',
        'banner', 'profilePic', 'accentColor', 'appCode', 'appCodeChosenAt', 'signupSource'];
    for (const f of profileFields) { if (src[f] && !tgt[f]) { tgt[f] = src[f]; log.push('Profil: ' + f + ' übertragen'); } }
    if (src.xp > 0) { const oldXp = tgt.xp || 0; tgt.xp = (tgt.xp || 0) + src.xp; tgt.level = level(tgt.xp); tgt.role = badge(tgt.xp); log.push('XP: ' + oldXp + ' + ' + src.xp + ' = ' + tgt.xp); }
    if (src.diamonds > 0) { tgt.diamonds = (tgt.diamonds || 0) + src.diamonds; log.push('Diamonds: +' + src.diamonds + ' = ' + tgt.diamonds); }
    if (src.links > 0) { tgt.links = (tgt.links || 0) + src.links; log.push('Links: +' + src.links); }
    if (src.totalLikes > 0) { tgt.totalLikes = (tgt.totalLikes || 0) + src.totalLikes; log.push('TotalLikes: +' + src.totalLikes); }
    if (Array.isArray(src.followers)) {
        if (!Array.isArray(tgt.followers)) tgt.followers = [];
        const existing = new Set(tgt.followers.map(String));
        for (const f of src.followers) { if (String(f) !== tId && !existing.has(String(f))) { tgt.followers.push(String(f)); existing.add(String(f)); } }
        for (const fUid of src.followers) {
            const fUser = d.users[String(fUid)];
            if (fUser && Array.isArray(fUser.following)) { fUser.following = fUser.following.filter(x => String(x) !== sId); if (!fUser.following.map(String).includes(tId)) fUser.following.push(tId); }
        }
        log.push('Followers: ' + src.followers.length + ' zusammengeführt');
    }
    if (Array.isArray(src.following)) {
        if (!Array.isArray(tgt.following)) tgt.following = [];
        const existing = new Set(tgt.following.map(String));
        for (const f of src.following) { if (String(f) !== tId && !existing.has(String(f))) { tgt.following.push(String(f)); existing.add(String(f)); } }
        for (const fUid of src.following) {
            const fUser = d.users[String(fUid)];
            if (fUser && Array.isArray(fUser.followers)) { fUser.followers = fUser.followers.filter(x => String(x) !== sId); if (!fUser.followers.map(String).includes(tId)) fUser.followers.push(tId); }
        }
        log.push('Following: ' + src.following.length + ' zusammengeführt');
    }
    if (Array.isArray(tgt.followers)) tgt.followers = tgt.followers.filter(x => String(x) !== tId);
    if (Array.isArray(tgt.following)) tgt.following = tgt.following.filter(x => String(x) !== tId);
    if (Array.isArray(src.trophies) && src.trophies.length > 0) {
        if (!Array.isArray(tgt.trophies)) tgt.trophies = [];
        const existingT = new Set(tgt.trophies.map(JSON.stringify));
        for (const t of src.trophies) { if (!existingT.has(JSON.stringify(t))) tgt.trophies.push(t); }
        log.push('Trophies: zusammengeführt');
    }
    if (Array.isArray(src.inventory) && src.inventory.length > 0) { if (!Array.isArray(tgt.inventory)) tgt.inventory = []; tgt.inventory = tgt.inventory.concat(src.inventory); log.push('Inventar: +' + src.inventory.length + ' Items'); }
    if (Array.isArray(src.projects) && src.projects.length > 0) { if (!Array.isArray(tgt.projects)) tgt.projects = []; tgt.projects = tgt.projects.concat(src.projects); log.push('Projekte: +' + src.projects.length); }
    for (const key of ['dailyXP', 'weeklyXP', 'gesternDailyXP']) {
        if (d[key] && d[key][sId]) { d[key][tId] = (d[key][tId] || 0) + d[key][sId]; delete d[key][sId]; log.push(key + ': zusammengeführt'); }
    }
    for (const key of ['tracker', 'counter', 'badgeTracker', 'bonusLinks', 'dailyLogins', 'dailyGroupMsgs', 'm1Streak']) {
        if (d[key] && d[key][sId] !== undefined && d[key][tId] === undefined) { d[key][tId] = d[key][sId]; delete d[key][sId]; log.push(key + ': übertragen'); }
        else if (d[key] && d[key][sId] !== undefined) delete d[key][sId];
    }
    for (const key of ['missionen', 'wochenMissionen', 'missionQueue']) {
        if (d[key] && d[key][sId] && !d[key][tId]) { d[key][tId] = d[key][sId]; delete d[key][sId]; log.push(key + ': übertragen'); }
        else if (d[key] && d[key][sId]) delete d[key][sId];
    }
    if (d.threadLastRead && d.threadLastRead[sId]) { if (!d.threadLastRead[tId]) d.threadLastRead[tId] = {}; Object.assign(d.threadLastRead[tId], d.threadLastRead[sId]); delete d.threadLastRead[sId]; log.push('ThreadLastRead: übertragen'); }
    if (d.notifications && Array.isArray(d.notifications[sId])) { if (!d.notifications[tId]) d.notifications[tId] = []; d.notifications[tId] = d.notifications[tId].concat(d.notifications[sId]); if (d.notifications[tId].length > 50) d.notifications[tId] = d.notifications[tId].slice(-50); delete d.notifications[sId]; log.push('Benachrichtigungen: zusammengeführt'); }
    if (d.appActivity && d.appActivity[sId]) {
        if (!d.appActivity[tId]) d.appActivity[tId] = d.appActivity[sId];
        else { const t = d.appActivity[tId], s = d.appActivity[sId]; t.firstSeen = Math.min(t.firstSeen || Infinity, s.firstSeen || Infinity); t.lastSeen = Math.max(t.lastSeen || 0, s.lastSeen || 0); t.sessions = (t.sessions || 0) + (s.sessions || 0); t.totalCalls = (t.totalCalls || 0) + (s.totalCalls || 0); }
        delete d.appActivity[sId]; log.push('AppActivity: zusammengeführt');
    }
    if (d.appChatLastRead && d.appChatLastRead[sId]) { if (!d.appChatLastRead[tId] || d.appChatLastRead[sId] > d.appChatLastRead[tId]) d.appChatLastRead[tId] = d.appChatLastRead[sId]; delete d.appChatLastRead[sId]; }
    let linksReassigned = 0;
    for (const l of Object.values(d.links || {})) {
        if (String(l.user_id) === sId) { l.user_id = /^\d+$/.test(tId) ? Number(tId) : tId; l.user_name = tgt.name; linksReassigned++; }
        if (l.likes) {
            if (typeof l.likes.delete === 'function' && l.likes.has(sId)) { l.likes.delete(sId); l.likes.add(tId); }
            else if (Array.isArray(l.likes)) l.likes = l.likes.map(x => String(x) === sId ? tId : String(x));
        }
        if (l.likerNames && l.likerNames[sId]) { l.likerNames[tId] = l.likerNames[sId]; delete l.likerNames[sId]; }
    }
    if (linksReassigned > 0) log.push('Links: ' + linksReassigned + ' umgeschrieben');
    let slReassigned = 0;
    for (const sl of Object.values(d.superlinks || {})) {
        if (String(sl.uid) === sId) { sl.uid = tId; slReassigned++; }
        if (Array.isArray(sl.likes)) sl.likes = sl.likes.map(x => String(x) === sId ? tId : String(x));
        if (sl.likerNames && sl.likerNames[sId]) { sl.likerNames[tId] = sl.likerNames[sId]; delete sl.likerNames[sId]; }
    }
    if (slReassigned > 0) log.push('Superlinks: ' + slReassigned + ' umgeschrieben');
    if (d.comments) {
        let cReassigned = 0;
        for (const arr of Object.values(d.comments)) { if (Array.isArray(arr)) { for (const c of arr) { if (String(c.uid) === sId) { c.uid = tId; c.name = tgt.name; cReassigned++; } } } }
        if (cReassigned > 0) log.push('Kommentare: ' + cReassigned + ' umgeschrieben');
    }
    if (d.posts && d.posts[sId]) { if (!d.posts[tId]) d.posts[tId] = []; d.posts[tId] = d.posts[tId].concat(d.posts[sId]); delete d.posts[sId]; log.push('Posts: zusammengeführt'); }
    if (Array.isArray(d.appChat)) {
        let chatReassigned = 0;
        for (const m of d.appChat) {
            if (String(m.uid) === sId) { m.uid = tId; m.name = tgt.name; chatReassigned++; }
            if (m.reactions) { for (const emoji of Object.keys(m.reactions)) { if (Array.isArray(m.reactions[emoji])) { m.reactions[emoji] = m.reactions[emoji].map(x => String(x) === sId ? tId : String(x)); m.reactions[emoji] = [...new Set(m.reactions[emoji])]; } } }
        }
        if (chatReassigned > 0) log.push('AppChat: ' + chatReassigned + ' Nachrichten umgeschrieben');
    }
    if (d.threadMessages) {
        let tmReassigned = 0;
        for (const arr of Object.values(d.threadMessages)) { if (Array.isArray(arr)) { for (const m of arr) { if (String(m.uid) === sId) { m.uid = tId; m.name = tgt.name; tmReassigned++; } } } }
        if (tmReassigned > 0) log.push('ThreadMessages: ' + tmReassigned + ' umgeschrieben');
    }
    if (d.messages) {
        const keysToMigrate = Object.keys(d.messages).filter(k => k.split('_').includes(sId));
        for (const oldKey of keysToMigrate) {
            const newKey = [String(oldKey.split('_')[0]) === sId ? tId : oldKey.split('_')[0], String(oldKey.split('_')[1]) === sId ? tId : oldKey.split('_')[1]].sort().join('_');
            for (const m of d.messages[oldKey]) { if (String(m.from) === sId) m.from = tId; if (String(m.to) === sId) m.to = tId; }
            if (d.messages[newKey] && newKey !== oldKey) { d.messages[newKey] = d.messages[newKey].concat(d.messages[oldKey]); d.messages[newKey].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); if (d.messages[newKey].length > 200) d.messages[newKey] = d.messages[newKey].slice(-200); }
            else if (newKey !== oldKey) d.messages[newKey] = d.messages[oldKey];
            if (newKey !== oldKey) delete d.messages[oldKey];
        }
        if (keysToMigrate.length > 0) log.push('DMs: ' + keysToMigrate.length + ' Chats migriert');
    }
    if (d.notifications) { for (const arr of Object.values(d.notifications)) { if (Array.isArray(arr)) { for (const n of arr) { if (String(n.actorUid || '') === sId) n.actorUid = tId; } } } }
    if (d.pinnedEngages) {
        if (d.pinnedEngages[sId]) { if (!d.pinnedEngages[tId]) d.pinnedEngages[tId] = []; d.pinnedEngages[tId] = [...new Set([...d.pinnedEngages[tId], ...d.pinnedEngages[sId]])]; delete d.pinnedEngages[sId]; }
        for (const pk of Object.keys(d.pinnedEngages)) { if (Array.isArray(d.pinnedEngages[pk])) { d.pinnedEngages[pk] = d.pinnedEngages[pk].map(x => String(x) === sId ? tId : String(x)); d.pinnedEngages[pk] = [...new Set(d.pinnedEngages[pk])]; } }
    }
    if (d.mindsetStories) {
        for (const cat of ['waitlist', 'rejected', 'done']) { if (d.mindsetStories[cat] && d.mindsetStories[cat][sId]) { if (!d.mindsetStories[cat][tId]) d.mindsetStories[cat][tId] = d.mindsetStories[cat][sId]; delete d.mindsetStories[cat][sId]; } }
        if (d.mindsetStories.weeklyState && String(d.mindsetStories.weeklyState.pickedUid) === sId) d.mindsetStories.weeklyState.pickedUid = tId;
    }
    if (Array.isArray(d.emailLoginLog)) { for (const e of d.emailLoginLog) { if (String(e.uid || '') === sId) e.uid = tId; } log.push('EmailLoginLog: UIDs umgeschrieben'); }
    for (const key of ['warteNachricht', 'instaWarte', 'dmNachrichten', '_smartReminderSent']) { if (d[key] && d[key][sId] !== undefined) delete d[key][sId]; }
    if (src.subUid && d.users[src.subUid]) { if (!tgt.subUid) { tgt.subUid = src.subUid; d.users[src.subUid].parent_uid = tId; log.push('Sub-Account übertragen: ' + src.subUid); } }
    if (src.parent_uid && d.users[src.parent_uid]) { d.users[src.parent_uid].subUid = tId; tgt.parent_uid = src.parent_uid; log.push('Parent-Beziehung übertragen'); }
    if (src.appUser) tgt.appUser = true;
    if (src.started) tgt.started = true;
    if (src.inGruppe) tgt.inGruppe = true;
    if (src.rulesAcceptedAt && !tgt.rulesAcceptedAt) tgt.rulesAcceptedAt = src.rulesAcceptedAt;
    if (src.joinDate && (!tgt.joinDate || src.joinDate < tgt.joinDate)) tgt.joinDate = src.joinDate;
    if (!d._mergeLog) d._mergeLog = [];
    d._mergeLog.push({ timestamp: Date.now(), sourceUid: sId, targetUid: tId, sourceBackup: JSON.parse(JSON.stringify(src)), changes: log });
    while (d._mergeLog.length > 50) d._mergeLog.shift();
    delete d.users[sId];
    return { ok: true, log };
}
function mergeUsers({ source_uid, target_uid }) {
    const srcInput = source_uid ? String(source_uid) : '';
    const tgtInput = target_uid ? String(target_uid) : '';
    if (!srcInput || !tgtInput) return { ok: false, error: 'source_uid und target_uid erforderlich' };
    const sourceUid = _findUser(srcInput);
    const targetUid = _findUser(tgtInput);
    if (!sourceUid) return { ok: false, error: 'Quell-User nicht gefunden: ' + srcInput };
    if (!targetUid) return { ok: false, error: 'Ziel-User nicht gefunden: ' + tgtInput };
    if (sourceUid === targetUid) return { ok: false, error: 'Quell und Ziel sind der gleiche User (' + sourceUid + ')' };
    const srcName = d.users[sourceUid].spitzname || d.users[sourceUid].name || sourceUid;
    const tgtName = d.users[targetUid].spitzname || d.users[targetUid].name || targetUid;
    const result = _mergeUserData(sourceUid, targetUid);
    if (!result.ok) return result;
    return { ok: true, source: { uid: sourceUid, name: srcName }, target: { uid: targetUid, name: tgtName }, log: result.log };
}
function deleteUser({ uid }) {
    const input = uid ? String(uid) : '';
    if (!input) return { ok: false, error: 'uid erforderlich' };
    const found = _findUser(input);
    if (!found) return { ok: false, error: 'User nicht gefunden: ' + input };
    if (istAdminId(Number(found))) return { ok: false, error: 'Admin-Accounts können nicht gelöscht werden' };
    const userName = d.users[found].spitzname || d.users[found].name || found;
    const result = _deleteUser(found);
    if (!result.ok) return result;
    return { ok: true, uid: found, name: userName };
}
function userDeleteSelfApi({ uid }) {
    uid = String(uid || '');
    if (!uid) return { ok: false, error: 'uid fehlt' };
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) return { ok: false, error: 'Admin-Account kann nicht über App gelöscht werden' };
    let deletedSubs = 0;
    for (const [oUid, oU] of Object.entries(d.users || {})) {
        if (oU && String(oU.parent_uid || '') === uid) { const r = _deleteUser(oUid); if (r && r.ok) deletedSubs++; }
    }
    const result = _deleteUser(uid);
    if (!result || !result.ok) return { ok: false, error: (result && result.error) || 'Löschung fehlgeschlagen' };
    return { ok: true, name: result.name, deletedSubs };
}
// ── Papierkorb: gelöschte Accounts auflisten + wiederherstellen ──
// _deleteUser legt vor jeder Löschung ein vollständiges Backup des User-Objekts in
// d._deleteLog ab (letzte 50). Profil/XP/Diamanten/Badges/Items/Email+Login sind damit
// wiederherstellbar. NICHT im Backup (aus geteilten Collections gepurgt): Posts/Links,
// vergebene Likes, Kommentare, Follow-Beziehungen, Chatverläufe → bleiben verloren.
function deletedUsersListApi() {
    const log = Array.isArray(d._deleteLog) ? d._deleteLog : [];
    const out = [];
    // neueste zuerst; nur Einträge, deren uid aktuell NICHT (wieder) existiert
    for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (!e || !e.backup) continue;
        const uid = String(e.uid);
        if (d.users[uid]) continue; // schon (wieder) aktiv
        const b = e.backup;
        out.push({
            uid,
            name: b.spitzname || b.name || ('User ' + uid),
            instagram: b.instagram || '',
            email: b.email || '',
            xp: Number(b.xp || 0),
            diamonds: Number(b.diamonds || 0),
            isSub: !!b.parent_uid,
            parentUid: b.parent_uid ? String(b.parent_uid) : '',
            deletedAt: e.timestamp || 0,
        });
    }
    return { ok: true, deleted: out, total: out.length };
}
function restoreDeletedUserApi({ uid }) {
    uid = String(uid || '');
    if (!uid) return { ok: false, error: 'uid fehlt' };
    if (d.users[uid]) return { ok: false, error: 'Account existiert bereits — nichts wiederherzustellen' };
    const log = Array.isArray(d._deleteLog) ? d._deleteLog : [];
    let idx = -1;
    for (let i = log.length - 1; i >= 0; i--) { if (log[i] && String(log[i].uid) === uid && log[i].backup) { idx = i; break; } }
    if (idx < 0) return { ok: false, error: 'Kein Backup für diese ID gefunden (evtl. älter als die letzten 50 Löschungen)' };
    const entry = log[idx];
    const restored = JSON.parse(JSON.stringify(entry.backup));
    if (!d.users) d.users = {};
    d.users[uid] = restored;
    // Eltern-/Sub-Verknüpfung soweit möglich heilen, damit der Account-Switcher den Sub wieder zeigt
    if (restored.parent_uid && d.users[String(restored.parent_uid)]) {
        const par = d.users[String(restored.parent_uid)];
        if (Array.isArray(par.subUids)) { if (!par.subUids.map(String).includes(uid)) par.subUids.push(uid); }
        else if (!par.subUid) par.subUid = uid;
    }
    // Backup-Eintrag entfernen, damit nicht doppelt wiederhergestellt wird
    d._deleteLog.splice(idx, 1);
    return {
        ok: true, uid,
        name: restored.spitzname || restored.name || ('User ' + uid),
        hasEmail: !!restored.email,
        note: 'Profil, XP, Diamanten, Badges & Items wiederhergestellt. Posts/Links, vergebene Likes, Kommentare & Follows waren NICHT im Backup und bleiben verloren.',
    };
}

// ════════ ADMIN-AKTIONEN (clean: nur Daten + In-App-DM) ════════
function addWarn({ uid, reason }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    u.warnings = (u.warnings || 0) + 1;
    try { dmUser(uid, `⚠️ Verwarnung\n\nVerwarnungen: ${u.warnings}/5${reason ? '\n\nGrund: ' + reason : ''}`); } catch (e) {}
    return { ok: true, warnings: u.warnings };
}
function removeWarn({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    u.warnings = Math.max(0, (u.warnings || 0) - 1);
    try { dmUser(uid, `✅ Verwarnung entfernt\n\nVerwarnungen: ${u.warnings}/5`); } catch (e) {}
    return { ok: true, warnings: u.warnings };
}
function resetUser({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    u.xp = 0; u.level = 1; u.role = badge(0);
    if (d.dailyXP) delete d.dailyXP[uid];
    if (d.weeklyXP) delete d.weeklyXP[uid];
    try { dmUser(uid, `♻️ XP zurückgesetzt\n\nEin Admin hat deinen XP-Stand auf 0 gesetzt.`); } catch (e) {}
    return { ok: true, xp: 0 };
}
function removeXp({ uid, amount, reason }) {
    uid = String(uid || '');
    const raw = Number(amount);
    const u = d.users[uid];
    if (!uid || !u) return { ok: false, error: 'User nicht gefunden' };
    if (!Number.isFinite(raw)) return { ok: false, error: 'amount erforderlich' };
    const amt = Math.abs(raw);
    u.xp = Math.max(0, (u.xp || 0) - amt);
    u.level = level(u.xp);
    u.role = badge(u.xp);
    if (!d.weeklyXP) d.weeklyXP = {};
    d.weeklyXP[uid] = Math.max(0, (d.weeklyXP[uid] || 0) - amt);
    try { dmUser(uid, `📉 −${amt} XP\n\n${_reasonLabel(reason)}\n\n⭐ Gesamt: ${u.xp} XP`); } catch (e) {}
    return { ok: true, newXp: u.xp };
}
function startXpEvent({ amount, durationMs, label }) {
    amount = parseInt(amount, 10);
    durationMs = parseInt(durationMs, 10);
    label = String(label || '').slice(0, 60);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount muss > 0 sein' };
    if (!Number.isFinite(durationMs) || durationMs <= 0) return { ok: false, error: 'durationMs muss > 0 sein' };
    if (durationMs > 7 * 24 * 3600 * 1000) return { ok: false, error: 'Max 7 Tage' };
    const multiplier = 1 + (amount / 100);
    d.xpEvent = { aktiv: true, multiplier, bonusPercent: amount, bonusPerPost: 0, end: Date.now() + durationMs, label: label || ('+' + amount + '% XP pro Like'), startedAt: Date.now() };
    return { ok: true, event: d.xpEvent };
}
function startDiamondEvent({ amount, durationMs, label }) {
    amount = parseInt(amount, 10);
    durationMs = parseInt(durationMs, 10);
    label = String(label || '').slice(0, 60);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount muss > 0 sein' };
    if (!Number.isFinite(durationMs) || durationMs <= 0) return { ok: false, error: 'durationMs muss > 0 sein' };
    if (durationMs > 7 * 24 * 3600 * 1000) return { ok: false, error: 'Max 7 Tage' };
    d.diamondEvent = { bonusPerPost: amount, end: Date.now() + durationMs, label: label || ('+' + amount + ' 💎 pro Post'), startedAt: Date.now() };
    return { ok: true, event: d.diamondEvent };
}
function stopEvent({ type }) {
    type = String(type || '');
    if (type === 'xp') {
        if (d.xpEvent) { d.xpEvent.bonusPerPost = 0; d.xpEvent.end = null; d.xpEvent.aktiv = false; d.xpEvent.multiplier = 1; }
    } else if (type === 'diamond') {
        d.diamondEvent = { bonusPerPost: 0, end: null };
    } else {
        return { ok: false, error: 'type muss xp oder diamond sein' };
    }
    return { ok: true };
}

function banUserApi({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden (UID: ' + uid + ')' };
    if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) return { ok: false, error: 'Admins können nicht gebannt werden' };
    u.banned = true; u.bannedAt = Date.now(); u.inGruppe = false; u.started = false;
    if (d.dailyXP) delete d.dailyXP[uid];
    if (d.weeklyXP) delete d.weeklyXP[uid];
    if (d.bonusLinks) delete d.bonusLinks[uid];
    if (d.missionen) delete d.missionen[uid];
    if (d.wochenMissionen) delete d.wochenMissionen[uid];
    if (d.userSessions) delete d.userSessions[uid];
    for (const [, other] of Object.entries(d.users || {})) {
        if (other && other.parent_uid && String(other.parent_uid) === uid) {
            other.banned = true; other.bannedAt = Date.now(); other.inGruppe = false; other.started = false;
        }
    }
    // Anti-Trick: Referral-Diamanten für diesen (und seine Sub-)Accounts zurückziehen.
    try { clawbackReferral(uid); for (const [oid, other] of Object.entries(d.users || {})) { if (other && String(other.parent_uid||'') === uid) clawbackReferral(oid); } } catch (e) {}
    try { dmUser(uid, `🚫 Du wurdest gebannt\n\nEin Admin hat dich aus der Community entfernt.`); } catch (e) {}
    return { ok: true };
}
function unbanUserApi({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden (UID: ' + uid + ')' };
    u.banned = false; delete u.bannedAt; u.started = true; u.inGruppe = true;
    for (const [, other] of Object.entries(d.users || {})) {
        if (other && other.parent_uid && String(other.parent_uid) === uid) {
            other.banned = false; delete other.bannedAt; other.inGruppe = true; other.started = true;
        }
    }
    try { dmUser(uid, `✅ Bann aufgehoben\n\nDu bist wieder Teil der Community. Willkommen zurück!`); } catch (e) {}
    return { ok: true };
}
// Pause (soft): blendet den Account aus Ranking/Explore/Suche/Stories aus, bis er sich
// wieder einloggt (Auto-Unpause beim nächsten echten App-Request). KEIN Datenverlust.
function pauseUserApi({ uid, reason, auto }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden (UID: ' + uid + ')' };
    if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) return { ok: false, error: 'Admins können nicht pausiert werden' };
    u.paused = true; u.pausedAt = Date.now();
    if (reason) u.pauseReason = String(reason).slice(0, 60); else delete u.pauseReason;
    if (auto) u.autoPaused = true; else delete u.autoPaused;
    return { ok: true };
}
function unpauseUserApi({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden (UID: ' + uid + ')' };
    u.paused = false; delete u.pausedAt; delete u.pauseReason; delete u.autoPaused;
    return { ok: true };
}
function adminSuspendPostingApi({ uid, days, reason }) {
    uid = String(uid || '');
    days = Number(days || 0);
    reason = String(reason || '').slice(0, 200);
    if (!uid) return { ok: false, error: 'uid fehlt' };
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) return { ok: false, error: 'Admins können nicht gesperrt werden' };
    if (days <= 0) {
        delete u.postSuspendedUntil; delete u.postSuspendReason;
        try { dmUser(uid, '✅ Posting-Sperre aufgehoben\n\nDu kannst wieder posten.'); } catch (e) {}
        return { ok: true, suspended: false };
    }
    if (days > 365) return { ok: false, error: 'Max 365 Tage' };
    u.postSuspendedUntil = Date.now() + days * 86400000;
    u.postSuspendReason = reason || null;
    try {
        dmUser(uid, '🚫 Posten gesperrt für ' + days + ' Tag' + (days === 1 ? '' : 'e') + '\n\n' + (reason ? 'Grund: ' + reason + '\n\n' : '') + 'Liken geht weiterhin — deine Likes zählen für XP und Missionen. Die Sperre endet am ' + new Date(u.postSuspendedUntil).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) + '.');
    } catch (e) {}
    return { ok: true, suspended: true, until: u.postSuspendedUntil };
}

// ── Follow/Unfollow: 1:1 aus POST /follow-api ──
function followApi({ followerUid, targetUid }) {
    followerUid = followerUid ? String(followerUid) : '';
    targetUid = targetUid ? String(targetUid) : '';
    if (!followerUid || !targetUid) return { ok: false, error: 'Fehlende UIDs' };
    if (!d.users[followerUid]) {
        if (followerUid.length <= 12 && /^\d+$/.test(followerUid)) user(followerUid, '');
        else return { ok: false, error: 'Follower-Account nicht gefunden (' + followerUid + ')' };
    }
    if (!d.users[targetUid]) return { ok: false, error: 'Ziel-User nicht gefunden (' + targetUid + ')' };
    if (!Array.isArray(d.users[followerUid].following)) d.users[followerUid].following = [];
    if (!Array.isArray(d.users[targetUid].followers)) d.users[targetUid].followers = [];
    d.users[followerUid].following = d.users[followerUid].following.map(String);
    d.users[targetUid].followers = d.users[targetUid].followers.map(String);
    const idx = d.users[followerUid].following.indexOf(targetUid);
    let action = '';
    if (idx === -1) {
        d.users[followerUid].following.push(targetUid);
        if (!d.users[targetUid].followers.includes(followerUid)) d.users[targetUid].followers.push(followerUid);
        const followerName = d.users[followerUid]?.spitzname || d.users[followerUid]?.name || 'Jemand';
        try { addNotification(targetUid, '👤', followerName + ' folgt dir jetzt', String(followerUid)); } catch (e) {}
        action = 'follow';
    } else {
        d.users[followerUid].following.splice(idx, 1);
        d.users[targetUid].followers = d.users[targetUid].followers.filter(id => id !== followerUid);
        action = 'unfollow';
    }
    return { ok: true, action };
}

// ── Wochen-Key (Berlin) — Prozess läuft mit TZ=Europe/Berlin ──
function getBerlinWeekKey() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
}
// Wochen-Key der Vorwoche (Montag dieser Woche minus 7 Tage) — für die Backfill-Nachzahlung.
function getPrevBerlinWeekKey() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1) - 7);
    return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
}

// ════════ SUPERLINKS (App-only — Telegram-Karte bewusst entfernt) ════════
// Nutzer-Entscheidung: Superlinks leben nur im App-Feed. Logik (Wochenlimit
// nach Rolle, Credits, 10💎-Extra-Slot, Mo–Sa-Fenster) bleibt 1:1; der
// Telegram-Teil (Gruppen-Karte, Card-Updates, DMs an andere Poster) entfällt.
function isSuperLinkPostingAllowed() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0) return false;
    if (day === 6 && (now.getHours() === 23 && now.getMinutes() >= 59)) return false;
    return day >= 1 && day <= 6;
}
function postSuperlinkApp({ uid, url, caption }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!uid || !url) return { ok: false, error: 'Fehlende Felder' };
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!u.instagram) return { ok: false, error: 'Bitte zuerst /setinsta im Bot setzen' };
    if (!isSuperLinkPostingAllowed()) return { ok: false, error: 'Superlinks können nur Mo–Sa (bis 23:58) gepostet werden — Sonntag ist Auswertung' };
    const week = getBerlinWeekKey();
    const isElitePlusSL = u.role === '🌟 Elite+' || u.role === '💎 Legende';
    const maxSL = isElitePlusSL ? 2 : 1;
    const slThisWeekCount = Object.values(d.superlinks || {}).filter(s => s.uid === uid && s.week === week).length;
    const hasSlCredit = Number(u.superlinkCredits || 0) > 0;
    if (slThisWeekCount >= maxSL && !hasSlCredit) return { ok: false, error: 'Du hast diese Woche bereits ' + maxSL + ' Superlink(s) gepostet' };
    const usesSlCredit = slThisWeekCount >= maxSL && hasSlCredit;
    const isAdminSL = istAdminId(Number(uid));
    const isExtraSlot = !usesSlCredit && slThisWeekCount > 0;
    if (!isAdminSL && isExtraSlot && (u.diamonds || 0) < 10) return { ok: false, error: 'Nicht genug Diamanten (benötigt: 💎 10 für Extra-Superlink)' };
    if (!url.includes('instagram.com')) return { ok: false, error: 'Nur Instagram-Links erlaubt' };
    const slId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    d.superlinks = d.superlinks || {};
    const newSL = { id: slId, uid, url, caption: caption || '', msg_id: null, appOnly: true, timestamp: Date.now(), week, likes: [], likerNames: {} };
    d.superlinks[slId] = newSL;
    tryFetchThumbnail(newSL, 'url');
    if (!isAdminSL && isExtraSlot) u.diamonds = (u.diamonds || 0) - 10;
    if (usesSlCredit) u.superlinkCredits = Math.max(0, Number(u.superlinkCredits || 0) - 1);
    try {
        const rulesUrl = ((process.env.APP_URL || 'https://web-production-7981d.up.railway.app').replace(/\/$/, '')) + '/explore?tab=regeln#r-superlinks';
        sendCreatorBoostDM(uid, '⭐ Dein Superlink ist live\n\nNicht vergessen: Du engagierst bis Sonntag 23:59 Uhr alle Superlinks dieser Woche — liken, kommentieren, teilen und speichern.', { link: { url: rulesUrl, label: '📖 Superlink-Regeln' } });
    } catch (e) {}
    return { ok: true, slId };
}
function likeSuperlinkApi({ slId, uid }) {
    if (!slId || !uid) return { ok: false, error: 'Fehlende Felder' };
    const sl = d.superlinks?.[slId];
    if (!sl) return { ok: false, error: 'Superlink nicht gefunden' };
    if (String(sl.uid) === String(uid)) return { ok: false, error: 'Eigener Post' };
    if (String(getRootUid(uid)) === String(getRootUid(sl.uid))) return { ok: false, error: 'Eigener Account — kein Self-Like' };
    if (!Array.isArray(sl.likes)) sl.likes = [];
    if (!sl.likerNames) sl.likerNames = {};
    const idx = sl.likes.indexOf(String(uid));
    if (idx >= 0) return { ok: true, liked: true, likes: sl.likes.length };
    sl.likes.push(String(uid));
    const u = d.users[String(uid)];
    sl.likerNames[String(uid)] = u?.spitzname || u?.name || 'User';
    addNotification(String(sl.uid), '❤️', (u?.spitzname || u?.name || 'User') + ' hat deinen Superlink geliked!');
    return { ok: true, liked: idx < 0, likes: sl.likes.length };
}

// ════════ DIAMANTLINKS (30💎 · 3 Tage · 3💎 Reward) ════════
const DIAMOND_LINK_COST = 30;
const DIAMOND_LINK_REWARD = 3;
const DIAMOND_LINK_LIFETIME_MS = 3 * 24 * 3600 * 1000;
function _diamondEnsure() { if (!d.diamondLinks) d.diamondLinks = {}; }
function _diamondActive(p) { return p && !p.deletedAt && p.expiresAt > Date.now(); }
function diamondLinkCreate({ uid, url, caption }) {
    _diamondEnsure();
    uid = String(uid || '');
    url = String(url || '').trim();
    caption = String(caption || '').slice(0, 500);
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!/https?:\/\/(www\.)?instagram\.com\//i.test(url) || url.length > 500) return { ok: false, error: 'Ungültige Instagram-URL' };
    if ((u.diamonds || 0) < DIAMOND_LINK_COST && !istAdminId(uid)) return { ok: false, error: 'Du hast nur ' + (u.diamonds || 0) + ' 💎 — du brauchst ' + DIAMOND_LINK_COST + ' 💎' };
    const wasAdmin = istAdminId(uid);
    if (!wasAdmin) u.diamonds = (u.diamonds || 0) - DIAMOND_LINK_COST;
    const id = 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    d.diamondLinks[id] = { id, uid, url, caption, createdAt: now, expiresAt: now + DIAMOND_LINK_LIFETIME_MS, likes: [], adminFree: wasAdmin || undefined };
    u.diamondLinksPosted = (u.diamondLinksPosted || 0) + 1;
    sendInAppDM(uid, '💎 Diamantlink veröffentlicht\n\nDein Post steht 3 Tage lang ganz oben im Feed.\n' + (wasAdmin ? '⚙️ Admin: kostenlos\n' : 'Kosten: −' + DIAMOND_LINK_COST + ' 💎 (Guthaben: ' + u.diamonds + ' 💎)\n') + '\nJeder Liker bekommt +' + DIAMOND_LINK_REWARD + ' 💎. Der Post muss voll engagiert werden: liken, kommentieren, teilen und speichern. Schein-Engagement wird streng sanktioniert.');
    return { ok: true, id, adminFree: wasAdmin };
}
function diamondLinkLike({ uid, postId }) {
    _diamondEnsure();
    uid = String(uid || '');
    postId = String(postId || '');
    const u = d.users[uid];
    const p = d.diamondLinks[postId];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!p) return { ok: false, error: 'Post nicht gefunden' };
    if (!_diamondActive(p)) return { ok: false, error: 'Post abgelaufen oder gelöscht' };
    if (String(p.uid) === uid) return { ok: false, error: 'collaborator-self-like', message: 'Kein Self-Like für eigene Diamantlinks' };
    if (getRootUid(uid) === getRootUid(p.uid)) return { ok: false, error: 'family-self-like', message: 'Kein Like auf Diamantlinks aus eigener Account-Familie' };
    if (!Array.isArray(p.likes)) p.likes = [];
    if (p.likes.includes(uid)) return { ok: true, liked: true, likeCount: p.likes.length, already: true };
    p.likes.push(uid);
    if (!p.engagedAt) p.engagedAt = {};
    p.engagedAt[uid] = Date.now();
    addDiamond(uid, DIAMOND_LINK_REWARD);
    addNotification(p.uid, '💎', (u.spitzname || u.name || 'User') + ' hat deinen Diamantlink engagiert', uid);
    sendInAppDM(uid, '💎 Diamantlink engagiert\n\nDu hast einen Diamantlink engagiert.\n\n💎 +' + DIAMOND_LINK_REWARD + ' Diamanten\n\nMit dem Engagement bestätigst du, den Post geliked, kommentiert, geteilt und gespeichert zu haben. Das wird geprüft — bei Schein-Engagement folgen XP-Abzug, Diamanten-Reset und Bann.\n\nMehr dazu im Explore unter Regeln, Diamantlinks.');
    return { ok: true, liked: true, likeCount: p.likes.length, diamondsTotal: u.diamonds || 0 };
}
function diamondLinkAcceptRules({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!u.diamondRulesAcceptedAt) u.diamondRulesAcceptedAt = Date.now();
    return { ok: true };
}
function diamondLinkAdminDelete({ postId }) {
    _diamondEnsure();
    const p = d.diamondLinks[String(postId || '')];
    if (!p) return { ok: false, error: 'Post nicht gefunden' };
    p.deletedAt = Date.now();
    return { ok: true };
}

// ════════ PRISMALINKS (100💎 · 7 Tage · 7💎 Reward · 1×/Woche) ════════
const PRISMA_LINK_COST = 100;
const PRISMA_LINK_REWARD = 7;
const PRISMA_LINK_LIFETIME_MS = 7 * 24 * 3600 * 1000;
function _prismaEnsure() { if (!d.prismaLinks) d.prismaLinks = {}; }
function _prismaActive(p) { return p && !p.deletedAt && p.expiresAt > Date.now(); }
function prismaLinkCreate({ uid, url, caption }) {
    _prismaEnsure();
    uid = String(uid || '');
    url = String(url || '').trim();
    caption = String(caption || '').slice(0, 500);
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!/https?:\/\/(www\.)?instagram\.com\//i.test(url) || url.length > 500) return { ok: false, error: 'Ungültige Instagram-URL' };
    const week = getBerlinWeekKey();
    if (u.prismaPostThisWeek === week && !istAdminId(uid)) return { ok: false, error: 'Du hast diese Woche schon einen Prismalink veröffentlicht. Nur 1×/Woche erlaubt.' };
    if ((u.diamonds || 0) < PRISMA_LINK_COST && !istAdminId(uid)) return { ok: false, error: 'Du hast nur ' + (u.diamonds || 0) + ' 💎 — du brauchst ' + PRISMA_LINK_COST + ' 💎' };
    const wasAdmin = istAdminId(uid);
    if (!wasAdmin) u.diamonds = (u.diamonds || 0) - PRISMA_LINK_COST;
    u.prismaPostThisWeek = week;
    const id = 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    d.prismaLinks[id] = { id, uid, url, caption, createdAt: now, expiresAt: now + PRISMA_LINK_LIFETIME_MS, likes: [], adminFree: wasAdmin || undefined };
    sendInAppDM(uid, '💠 Prismalink veröffentlicht\n\nDein Post steht 7 Tage lang ganz oben im Feed mit Holographic-Glow.\n' + (wasAdmin ? '⚙️ Admin: kostenlos\n' : 'Kosten: −' + PRISMA_LINK_COST + ' 💎 (Guthaben: ' + u.diamonds + ' 💎)\n') + '\nJeder Liker bekommt +' + PRISMA_LINK_REWARD + ' 💎. Der Post muss voll engagiert werden: liken, kommentieren, teilen und speichern. Schein-Engagement wird streng sanktioniert.');
    return { ok: true, id, adminFree: wasAdmin };
}
function prismaLinkLike({ uid, postId }) {
    _prismaEnsure();
    uid = String(uid || '');
    postId = String(postId || '');
    const u = d.users[uid];
    const p = d.prismaLinks[postId];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!p) return { ok: false, error: 'Post nicht gefunden' };
    if (!_prismaActive(p)) return { ok: false, error: 'Post abgelaufen oder gelöscht' };
    if (String(p.uid) === uid) return { ok: false, error: 'self-like', message: 'Kein Self-Like für eigene Prismalinks' };
    if (getRootUid(uid) === getRootUid(p.uid)) return { ok: false, error: 'family-self-like', message: 'Kein Like auf Prismalinks aus eigener Account-Familie' };
    if (!Array.isArray(p.likes)) p.likes = [];
    if (p.likes.includes(uid)) return { ok: true, liked: true, likeCount: p.likes.length, already: true };
    p.likes.push(uid);
    if (!p.engagedAt) p.engagedAt = {};
    p.engagedAt[uid] = Date.now();
    addDiamond(uid, PRISMA_LINK_REWARD);
    addNotification(p.uid, '💠', (u.spitzname || u.name || 'User') + ' hat deinen Prismalink engagiert', uid);
    sendInAppDM(uid, '💠 Prismalink engagiert\n\nDu hast einen Prismalink engagiert.\n\n💎 +' + PRISMA_LINK_REWARD + ' Diamanten\n\nMit dem Engagement bestätigst du, den Post geliked, kommentiert, geteilt und gespeichert zu haben. Das wird geprüft — bei Schein-Engagement folgen XP-Abzug, Diamanten-Reset und Bann.\n\nMehr dazu im Explore unter Regeln, Prismalinks.');
    return { ok: true, liked: true, likeCount: p.likes.length, diamondsTotal: u.diamonds || 0 };
}
function prismaLinkAcceptRules({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!u.prismaRulesAcceptedAt) u.prismaRulesAcceptedAt = Date.now();
    return { ok: true };
}
function prismaLinkAdminDelete({ postId }) {
    _prismaEnsure();
    const p = d.prismaLinks[String(postId || '')];
    if (!p) return { ok: false, error: 'Post nicht gefunden' };
    p.deletedAt = Date.now();
    return { ok: true };
}

// ════════ ADMIN LINKS (Admin-only · 14 Tage · 5💎 Reward · Community-Push) ════════
// Spezial-Karte, die NUR Admins erstellen (Feed-Tab „Admin Link"). Erscheint bei jedem
// User ganz oben im Feed, bis er voll engagiert hat (Bestätigungs-Button wie Prisma) —
// danach verschwindet sie aus seinem Feed. +5💎 pro Engagement (einmalig je User).
const ADMIN_LINK_REWARD = 5;
const ADMIN_LINK_LIFETIME_MS = 14 * 24 * 3600 * 1000;
function _adminLinkEnsure() { if (!d.adminLinks) d.adminLinks = {}; }
function _adminLinkActive(p) { return p && !p.deletedAt && p.expiresAt > Date.now(); }
function adminLinkCreate({ uid, url, message }) {
    _adminLinkEnsure();
    uid = String(uid || '');
    url = String(url || '').trim();
    message = String(message || '').slice(0, 280);
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!istAdminId(uid)) return { ok: false, error: 'Nur Admins können Admin-Links erstellen' };
    if (!/https?:\/\/(www\.)?instagram\.com\//i.test(url) || url.length > 500) return { ok: false, error: 'Ungültige Instagram-URL' };
    const id = 'al_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    d.adminLinks[id] = { id, uid, url, message, createdAt: now, expiresAt: now + ADMIN_LINK_LIFETIME_MS, engagedBy: [], engagedAt: {} };
    return { ok: true, id };
}
function adminLinkEngage({ uid, postId }) {
    _adminLinkEnsure();
    uid = String(uid || '');
    postId = String(postId || '');
    const u = d.users[uid];
    const p = d.adminLinks[postId];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!p) return { ok: false, error: 'Admin-Link nicht gefunden' };
    if (!_adminLinkActive(p)) return { ok: false, error: 'Admin-Link abgelaufen oder gelöscht' };
    if (String(p.uid) === uid) return { ok: false, error: 'self', message: 'Das ist dein eigener Admin-Link' };
    if (!Array.isArray(p.engagedBy)) p.engagedBy = [];
    if (p.engagedBy.map(String).includes(uid)) return { ok: true, already: true, reward: ADMIN_LINK_REWARD };
    p.engagedBy.push(uid);
    if (!p.engagedAt) p.engagedAt = {};
    p.engagedAt[uid] = Date.now();
    addDiamond(uid, ADMIN_LINK_REWARD);
    sendInAppDM(uid, '🛡️ Admin-Link engagiert\n\nDanke, dass du die Community pushst!\n\n💎 +' + ADMIN_LINK_REWARD + ' Diamanten\n\nMit dem Engagement bestätigst du, den Beitrag geliked, kommentiert, geteilt und gespeichert zu haben. Schein-Engagement wird sanktioniert.');
    return { ok: true, engaged: true, reward: ADMIN_LINK_REWARD, diamondsTotal: u.diamonds || 0 };
}
function adminLinkAdminDelete({ postId }) {
    _adminLinkEnsure();
    const p = d.adminLinks[String(postId || '')];
    if (!p) return { ok: false, error: 'Admin-Link nicht gefunden' };
    p.deletedAt = Date.now();
    return { ok: true };
}
// Feed-Karte: ältester aktiver Admin-Link, den der Caller noch NICHT engagiert und NICHT
// selbst erstellt hat. Genau einer (nicht spammen). null = keine Karte zeigen.
function adminLinkFeedCard(callerUid) {
    _adminLinkEnsure();
    callerUid = String(callerUid || '');
    if (!callerUid) return null;
    const p = Object.values(d.adminLinks)
        .filter(_adminLinkActive)
        .filter(x => String(x.uid) !== callerUid)
        .filter(x => !(Array.isArray(x.engagedBy) && x.engagedBy.map(String).includes(callerUid)))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
    if (!p) return null;
    const author = d.users[p.uid] || {};
    const eng = Array.isArray(p.engagedBy) ? p.engagedBy.map(String) : [];
    // Neueste zuerst (Social Proof). Avatare/Namen für „Wer hat engagiert?".
    const engagers = eng.slice().reverse().slice(0, 60).map(eid => { const eu = d.users[eid] || {}; return { uid: eid, name: eu.spitzname || eu.name || 'User', instagram: eu.instagram || '', builderEmoji: _bldEmoji(eid) }; });
    return { id: p.id, url: p.url, message: p.message || '', reward: ADMIN_LINK_REWARD, remainingMs: Math.max(0, p.expiresAt - Date.now()), engagedCount: eng.length, engagers, author: { uid: p.uid, name: author.spitzname || author.name || 'Admin', instagram: author.instagram || '', builderEmoji: _bldEmoji(p.uid) } };
}
// Admin-Tab: alle aktiven Admin-Links (laufen 2 Wochen) mit Engagement-Statistik.
function adminLinkListApi(callerUid) {
    _adminLinkEnsure();
    callerUid = String(callerUid || '');
    if (!istAdminId(callerUid)) return { ok: false, error: 'Nur Admins' };
    const now = Date.now();
    const links = Object.values(d.adminLinks)
        .filter(_adminLinkActive)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map(p => {
            const eng = Array.isArray(p.engagedBy) ? p.engagedBy.map(String) : [];
            const engagers = eng.slice(0, 50).map(eid => { const eu = d.users[eid] || {}; return { uid: eid, name: eu.spitzname || eu.name || 'User', instagram: eu.instagram || '', builderEmoji: _bldEmoji(eid) }; });
            const author = d.users[p.uid] || {};
            return { id: p.id, url: p.url, message: p.message || '', reward: ADMIN_LINK_REWARD, createdAt: p.createdAt, expiresAt: p.expiresAt, remainingMs: Math.max(0, p.expiresAt - now), engagedCount: eng.length, engagers, author: { uid: p.uid, name: author.spitzname || author.name || 'Admin', instagram: author.instagram || '', builderEmoji: _bldEmoji(p.uid) } };
        });
    return { ok: true, links, reward: ADMIN_LINK_REWARD, lifetimeDays: 14 };
}

// ════════ KOLLAB-POSTS (Partner-basiert · Boost-Slots) ════════
const COLLAB_BOOST_TOTAL_MS = 7 * 24 * 3600 * 1000;
const COLLAB_BOOST_CYCLE_MS = 4 * 3600 * 1000;
const COLLAB_BOOST_WINDOW_MS = 20 * 60 * 1000;
function _collabEnsure() { if (!d.collabRequests) d.collabRequests = {}; if (!d.collabPosts) d.collabPosts = {}; }
function _collabPartnerLink(uid) { const u = d.users[uid]; if (!u) return []; return Array.isArray(u.collaborations) ? u.collaborations.slice() : []; }
function _collabHasPair(uidA, uidB) { return _collabPartnerLink(uidA).some(c => String(c.partnerUid) === String(uidB)); }
function _collabValidUrl(url) { if (!url || typeof url !== 'string') return false; return /https?:\/\/(www\.)?instagram\.com\//i.test(url) && url.length <= 500; }
function collabBoostState(post, now) {
    now = now || Date.now();
    const age = now - (post?.createdAt || 0);
    if (age < 0 || age > COLLAB_BOOST_TOTAL_MS) return { active: false, endsAt: null, nextStartAt: null, expired: age > COLLAB_BOOST_TOTAL_MS };
    const cyclePos = age % COLLAB_BOOST_CYCLE_MS;
    if (cyclePos < COLLAB_BOOST_WINDOW_MS) return { active: true, endsAt: now + (COLLAB_BOOST_WINDOW_MS - cyclePos), nextStartAt: null, expired: false };
    const nextStartAt = now + (COLLAB_BOOST_CYCLE_MS - cyclePos);
    const nextSlotAge = age + (COLLAB_BOOST_CYCLE_MS - cyclePos);
    return { active: false, endsAt: null, nextStartAt: nextSlotAge <= COLLAB_BOOST_TOTAL_MS ? nextStartAt : null, expired: false };
}
function collabCreatePost({ uid, partnerUid, url, caption }) {
    _collabEnsure();
    uid = String(uid || '');
    partnerUid = String(partnerUid || '');
    url = String(url || '').trim();
    caption = String(caption || '').slice(0, 500);
    if (!d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    if (!d.users[partnerUid]) return { ok: false, error: 'Partner nicht gefunden' };
    if (!_collabHasPair(uid, partnerUid)) return { ok: false, error: 'Keine Kollaboration mit diesem User' };
    if (!_collabValidUrl(url)) return { ok: false, error: 'Ungültige Instagram-URL' };
    const week = getBerlinWeekKey();
    const u = d.users[uid], p = d.users[partnerUid];
    if (u.collabPostThisWeek === week) return { ok: false, error: 'Du hast diese Woche schon einen Kollab-Post veröffentlicht' };
    if (p.collabPostThisWeek === week) return { ok: false, error: 'Dein Partner hat diese Woche schon einen Kollab-Post veröffentlicht' };
    const postId = 'cp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    d.collabPosts[postId] = { id: postId, uid, partnerUid, url, caption, likes: [], likeCount: 0, createdAt: Date.now(), week };
    u.collabPostThisWeek = week;
    p.collabPostThisWeek = week;
    const fromName = u.spitzname || u.name || 'Dein Partner';
    addNotification(partnerUid, '🤝', fromName + ' hat euren Kollab-Post veröffentlicht', uid);
    sendInAppDM(partnerUid, '🤝 Kollab-Post ist live\n\n' + fromName + ' hat euren gemeinsamen Kollab-Post veröffentlicht.\n\nAlle können ihn jetzt im Feed unter Kollabs engagieren.');
    return { ok: true, postId };
}
function collabLikePost({ uid, postId }) {
    _collabEnsure();
    uid = String(uid || '');
    postId = String(postId || '');
    const p = d.collabPosts[postId];
    if (!p) return { ok: false, error: 'Post nicht gefunden' };
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (uid === String(p.uid) || uid === String(p.partnerUid)) return { ok: false, error: 'collaborator-self-like', message: 'Kein Self-Like für Kollaboratoren' };
    if (getRootUid(uid) === getRootUid(p.uid) || getRootUid(uid) === getRootUid(p.partnerUid)) return { ok: false, error: 'family-self-like', message: 'Kein Like auf Collab-Posts aus eigener Account-Familie' };
    if (!Array.isArray(p.likes)) p.likes = [];
    if (p.likes.includes(uid)) return { ok: true, liked: true, likeCount: p.likes.length, already: true };
    p.likes.push(uid);
    p.likeCount = p.likes.length;
    const boost = collabBoostState(p, Date.now());
    let diamondsGiven = 1;
    addDiamond(uid, 1);
    if (boost.active) { addDiamond(uid, 1); diamondsGiven = 2; }
    addNotification(p.uid, '🤝❤️', (u.spitzname || u.name || 'User') + ' hat euren Kollab-Post geliked' + (boost.active ? ' (Boost-Slot!)' : ''), uid);
    addNotification(p.partnerUid, '🤝❤️', (u.spitzname || u.name || 'User') + ' hat euren Kollab-Post geliked' + (boost.active ? ' (Boost-Slot!)' : ''), uid);
    let dmSentNow = false;
    if (!u.collabRulesDMSent) {
        sendInAppDM(uid, '🤝 Kollab-Post engagiert\n\nDu hast deinen ersten Kollab-Post engagiert. Kurz die wichtigsten Regeln:\n\n• Erst auf Instagram öffnen — liken, kommentieren, speichern und teilen\n• Dann hier in der App auf ✅ tippen\n• Pro engagiertem Kollab-Post bekommst du 1 💎 Diamant\n• Im Reel muss sichtbar sein, dass beide zusammenarbeiten (z. B. Logos beider Creator, gemeinsamer Branding-Frame oder beide @-Handles)\n• Schein-Likes und Posts ohne sichtbare Zusammenarbeit werden sanktioniert\n\nMehr dazu im Explore unter Regeln, Kollabs. Viel Erfolg!');
        u.collabRulesDMSent = Date.now();
        dmSentNow = true;
    }
    if (boost.active) {
        sendInAppDM(uid, '🤝 Kollab-Boost erwischt\n\nDu hast den Kollab-Post während eines Boost-Slots engagiert.\n\n💎 +1 Extra-Diamant (gesamt: ' + diamondsGiven + ')\n\nKollab-Posts erscheinen 7 Tage lang alle 4 Stunden für 20 Minuten mit Boost-Bonus im Feed.');
    }
    return { ok: true, liked: true, likeCount: p.likes.length, diamondsTotal: u.diamonds || 0, rulesDmSent: dmSentNow, diamondsGiven, boostActive: boost.active };
}

// ── Reads: superlinks / helper-history / events-status / data-export (reine Reads) ──
function superlinksApi() {
    const sls = Object.values(d.superlinks || {}).sort((a, b) => b.timestamp - a.timestamp);
    return { superlinks: sls, fullEngagementThreadId: d.fullEngagementThreadId };
}
function helperChatHistoryApi(uid) {
    uid = String(uid || '');
    if (!uid) return { ok: false, error: 'uid fehlt' };
    if (!d.helperChats) d.helperChats = {};
    const messages = Array.isArray(d.helperChats[uid]) ? d.helperChats[uid].slice(-100) : [];
    return { ok: true, messages };
}
function eventsStatusApi() {
    const now = Date.now();
    const out = { events: [], upcoming: [] };
    if (d.xpEvent?.aktiv && d.xpEvent.multiplier > 1 && d.xpEvent.end && now < d.xpEvent.end) {
        const pct = d.xpEvent.bonusPercent || Math.round((d.xpEvent.multiplier - 1) * 100);
        out.events.push({ type: 'xp', mode: 'percent', bonusPercent: pct, multiplier: d.xpEvent.multiplier, amount: pct, label: d.xpEvent.label || ('+' + pct + '% XP pro Like'), end: d.xpEvent.end, remainingMs: d.xpEvent.end - now });
    } else if (d.xpEvent?.bonusPerPost > 0 && d.xpEvent.end && now < d.xpEvent.end) {
        out.events.push({ type: 'xp', mode: 'flat', amount: d.xpEvent.bonusPerPost, label: d.xpEvent.label || ('+' + d.xpEvent.bonusPerPost + ' XP pro Post'), end: d.xpEvent.end, remainingMs: d.xpEvent.end - now });
    }
    if (d.diamondEvent?.bonusPerPost > 0 && d.diamondEvent.end && now < d.diamondEvent.end) {
        out.events.push({ type: 'diamond', amount: d.diamondEvent.bonusPerPost, label: d.diamondEvent.label || ('+' + d.diamondEvent.bonusPerPost + ' 💎 pro Post'), end: d.diamondEvent.end, remainingMs: d.diamondEvent.end - now });
    }
    if (d.xpEvent?.scheduled && d.xpEvent.start && d.xpEvent.start > now) {
        const pct = d.xpEvent.bonusPercent || Math.round(((d.xpEvent.multiplier || 1) - 1) * 100);
        out.upcoming.push({ type: 'xp', mode: 'percent', bonusPercent: pct, amount: pct, label: d.xpEvent.label || ('+' + pct + '% XP pro Like'), start: d.xpEvent.start, end: d.xpEvent.end, startInMs: d.xpEvent.start - now });
    }
    if (d.diamondEvent?.scheduled && d.diamondEvent.start && d.diamondEvent.start > now) {
        const amt = d.diamondEvent.pendingBonusPerPost || d.diamondEvent.bonusPerPost;
        out.upcoming.push({ type: 'diamond', amount: amt, label: d.diamondEvent.label || ('+' + amt + ' 💎 pro Post'), start: d.diamondEvent.start, end: d.diamondEvent.end, startInMs: d.diamondEvent.start - now });
    }
    return { ok: true, ...out };
}
function userDataExportApi(uid) {
    uid = String(uid || '');
    if (!uid) return { ok: false, error: 'uid fehlt' };
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    const out = {
        ok: true, exportedAt: new Date().toISOString(), dsgvo: 'Art. 20 DSGVO — Recht auf Datenübertragbarkeit',
        user: u, subAccounts: [], links: [], posts: (d.posts && d.posts[uid]) || [], notifications: (d.notifications && d.notifications[uid]) || [],
        dailyXP: (d.dailyXP && d.dailyXP[uid]) || null, weeklyXP: (d.weeklyXP && d.weeklyXP[uid]) || null,
        missionen: (d.missionen && d.missionen[uid]) || null, wochenMissionen: (d.wochenMissionen && d.wochenMissionen[uid]) || null,
        appActivity: (d.appActivity && d.appActivity[uid]) || null,
        reportsAgainst: Array.isArray(d.reports) ? d.reports.filter(r => String(r.targetUid) === uid) : [],
        reportsMade: Array.isArray(d.reports) ? d.reports.filter(r => String(r.reporterUid) === uid) : [],
    };
    for (const [oUid, oU] of Object.entries(d.users || {})) if (oU && String(oU.parent_uid || '') === uid) out.subAccounts.push({ uid: oUid, user: oU });
    for (const [lId, l] of Object.entries(d.links || {})) if (l && String(l.user_id || '') === uid) out.links.push({ id: lId, ...l, likes: Array.isArray(l.likes) ? l.likes : Array.from(l.likes || []) });
    return out;
}

// ── Pin / Notifications / Block (1:1 aus telegram-bot portiert) ──
function pinPostApi({ uid, timestamp }) {
    uid = String(uid || '');
    if (!uid || !d.posts?.[uid]) return { ok: false };
    const post = d.posts[uid].find(p => p.timestamp === Number(timestamp));
    if (!post) return { ok: false };
    d.posts[uid].forEach(p => p.pinned = false);
    post.pinned = true;
    return { ok: true };
}
function markNotificationsReadApi({ uid }) {
    uid = String(uid || '');
    if (!uid || !d.notifications?.[uid]) return { ok: false };
    d.notifications[uid].forEach(n => n.read = true);
    return { ok: true };
}
function blockUserApi({ blockerUid, targetUid }) {
    if (process.env.FEATURE_BLOCK_USER !== '1') return { ok: false, error: 'Block-Feature ist noch nicht aktiviert (FEATURE_BLOCK_USER fehlt)', flagged: true };
    if (!blockerUid || !targetUid) return { ok: false, error: 'blockerUid+targetUid erforderlich' };
    if (String(blockerUid) === String(targetUid)) return { ok: false, error: 'Self-Block nicht erlaubt' };
    if (!d.users[blockerUid] || !d.users[targetUid]) return { ok: false, error: 'User nicht gefunden' };
    if (!Array.isArray(d.users[blockerUid].blockedUsers)) d.users[blockerUid].blockedUsers = [];
    const tStr = String(targetUid);
    if (!d.users[blockerUid].blockedUsers.map(String).includes(tStr)) {
        d.users[blockerUid].blockedUsers.push(tStr);
        if (Array.isArray(d.users[blockerUid].following)) d.users[blockerUid].following = d.users[blockerUid].following.filter(u => String(u) !== tStr);
        if (Array.isArray(d.users[targetUid].followers)) d.users[targetUid].followers = d.users[targetUid].followers.filter(u => String(u) !== String(blockerUid));
    }
    return { ok: true };
}
function unblockUserApi({ blockerUid, targetUid }) {
    if (process.env.FEATURE_BLOCK_USER !== '1') return { ok: false, error: 'Block-Feature ist noch nicht aktiviert (FEATURE_BLOCK_USER fehlt)', flagged: true };
    if (!blockerUid || !targetUid) return { ok: false, error: 'blockerUid+targetUid erforderlich' };
    if (!d.users[blockerUid]) return { ok: false, error: 'User nicht gefunden' };
    if (!Array.isArray(d.users[blockerUid].blockedUsers)) d.users[blockerUid].blockedUsers = [];
    d.users[blockerUid].blockedUsers = d.users[blockerUid].blockedUsers.filter(u => String(u) !== String(targetUid));
    return { ok: true };
}

// ── READ-Getter: 1:1 aus telegram-bot Feed-Endpoints portiert (reine Reads) ──
function diamondLinkFeedApi(callerUid) {
    _diamondEnsure();
    callerUid = String(callerUid || '');
    const caller = d.users[callerUid] || {};
    const now = Date.now();
    const callerRoot = callerUid ? getRootUid(callerUid) : null;
    const posts = Object.values(d.diamondLinks)
        .filter(_diamondActive)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map(p => {
            const author = d.users[p.uid] || {};
            const likes = Array.isArray(p.likes) ? p.likes.map(String) : [];
            const likers = likes.map(lid => { const u = d.users[lid] || {}; return { uid: lid, name: u.spitzname || u.name || 'User', instagram: u.instagram || '', role: u.role || '', builderEmoji: _bldEmoji(lid) }; });
            const isSelf = !!(callerUid && String(p.uid) === callerUid);
            const isFamily = !!(callerRoot && !isSelf && getRootUid(p.uid) === callerRoot);
            return { id: p.id, uid: p.uid, url: p.url, caption: p.caption, createdAt: p.createdAt, expiresAt: p.expiresAt, remainingMs: Math.max(0, p.expiresAt - now), likeCount: likes.length, likers, liked: callerUid ? likes.includes(callerUid) : false, isSelf, isFamily, author: { uid: p.uid, name: author.spitzname || author.name || 'User', instagram: author.instagram || '', role: author.role || '', builderEmoji: _bldEmoji(p.uid) }, reward: DIAMOND_LINK_REWARD };
        });
    return { ok: true, posts, rulesAccepted: !!caller.diamondRulesAcceptedAt, cost: DIAMOND_LINK_COST, reward: DIAMOND_LINK_REWARD };
}
function prismaLinkFeedApi(callerUid, hideEngaged) {
    _prismaEnsure();
    callerUid = String(callerUid || '');
    hideEngaged = !!hideEngaged;
    const caller = d.users[callerUid] || {};
    const now = Date.now();
    const week = getBerlinWeekKey();
    const callerRoot = callerUid ? getRootUid(callerUid) : null;
    const callerFam = callerUid ? new Set(familyUids(callerUid)) : null;
    const posts = Object.values(d.prismaLinks)
        .filter(_prismaActive)
        .filter(p => {
            if (!callerUid || !hideEngaged) return true;
            const likes = Array.isArray(p.likes) ? p.likes.map(String) : [];
            for (const f of (callerFam || [])) if (likes.includes(f)) return false;
            return true;
        })
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map(p => {
            const author = d.users[p.uid] || {};
            const likes = Array.isArray(p.likes) ? p.likes.map(String) : [];
            const likers = likes.map(lid => { const u = d.users[lid] || {}; return { uid: lid, name: u.spitzname || u.name || 'User', instagram: u.instagram || '', role: u.role || '', builderEmoji: _bldEmoji(lid) }; });
            const isSelf = !!(callerUid && String(p.uid) === callerUid);
            const isFamily = !!(callerRoot && !isSelf && getRootUid(p.uid) === callerRoot);
            return { id: p.id, uid: p.uid, url: p.url, caption: p.caption, createdAt: p.createdAt, expiresAt: p.expiresAt, remainingMs: Math.max(0, p.expiresAt - now), likeCount: likes.length, likers, liked: callerUid ? likes.includes(callerUid) : false, isSelf, isFamily, author: { uid: p.uid, name: author.spitzname || author.name || 'User', instagram: author.instagram || '', builderEmoji: _bldEmoji(p.uid) }, reward: PRISMA_LINK_REWARD };
        });
    return { ok: true, posts, rulesAccepted: !!caller.prismaRulesAcceptedAt, cost: PRISMA_LINK_COST, reward: PRISMA_LINK_REWARD, postedThisWeek: caller.prismaPostThisWeek === week };
}
function collabFeedApi(callerUid) {
    _collabEnsure();
    callerUid = String(callerUid || '');
    const week = getBerlinWeekKey();
    const _nowB = Date.now();
    const out = Object.values(d.collabPosts || {})
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 100)
        .map(p => {
            const likes = Array.isArray(p.likes) ? p.likes.map(String) : [];
            const a = d.users[p.uid] || {}, b = d.users[p.partnerUid] || {};
            const likers = likes.map(lid => { const lu = d.users[lid] || {}; return { uid: lid, name: lu.spitzname || lu.name || 'User', instagram: lu.instagram || '', role: lu.role || '', builderEmoji: _bldEmoji(lid) }; });
            const boost = collabBoostState(p, _nowB);
            return { id: p.id, uid: p.uid, partnerUid: p.partnerUid, url: p.url, caption: p.caption, likeCount: likes.length, likers, liked: callerUid ? likes.includes(callerUid) : false, isSelf: callerUid && (callerUid === String(p.uid) || callerUid === String(p.partnerUid)), createdAt: p.createdAt, week: p.week, authorA: { uid: p.uid, name: a.spitzname || a.name || 'User', instagram: a.instagram || '', builderEmoji: _bldEmoji(p.uid) }, authorB: { uid: p.partnerUid, name: b.spitzname || b.name || 'User', instagram: b.instagram || '', builderEmoji: _bldEmoji(p.partnerUid) }, boostActive: boost.active, boostEndsAt: boost.endsAt, boostNextStartAt: boost.nextStartAt, boostExpired: boost.expired };
        });
    return { ok: true, posts: out, currentWeek: week, boostWindowMs: COLLAB_BOOST_WINDOW_MS, boostCycleMs: COLLAB_BOOST_CYCLE_MS };
}
function collabListApi(callerUid) {
    _collabEnsure();
    const uid = String(callerUid || '');
    if (!uid) return { ok: false, error: 'uid fehlt' };
    const u = d.users[uid] || {};
    const partners = (u.collaborations || []).map(c => { const p = d.users[c.partnerUid] || {}; return { uid: c.partnerUid, name: p.spitzname || p.name || 'User', since: c.since, instagram: p.instagram || '' }; });
    const pendingIn = Object.values(d.collabRequests).filter(r => r.status === 'pending' && String(r.toUid) === uid).map(r => { const f = d.users[r.fromUid] || {}; return { reqId: r.id, fromUid: r.fromUid, name: f.spitzname || f.name || 'User', instagram: f.instagram || '', ts: r.ts }; });
    const pendingOut = Object.values(d.collabRequests).filter(r => r.status === 'pending' && String(r.fromUid) === uid).map(r => { const t = d.users[r.toUid] || {}; return { reqId: r.id, toUid: r.toUid, name: t.spitzname || t.name || 'User', instagram: t.instagram || '', ts: r.ts }; });
    const week = getBerlinWeekKey();
    return { ok: true, partners, pendingIn, pendingOut, postedThisWeek: u.collabPostThisWeek === week, currentWeek: week, rulesAccepted: !!u.collabFeedRulesAcceptedAt };
}
function mindsetStateApi(uid) {
    uid = String(uid || '');
    const ms = d.mindsetStories;
    const isAdmin = uid && (istAdminId(uid) || String(d.users[uid]?.role || '').includes('Admin'));
    const currentWeek = getBerlinWeekKey();
    const stateIsCurrent = ms.weeklyState?.week === currentWeek;
    const currentPickedUid = stateIsCurrent ? ms.weeklyState.pickedUid : null;
    const myStatus = uid ? (currentPickedUid === uid ? 'picked' : ms.done[uid] ? 'done' : ms.waitlist[uid] ? 'yes' : ms.rejected[uid] ? 'no' : 'none') : 'none';
    const out = {
        ok: true, week: currentWeek, pickedUid: currentPickedUid,
        pickedName: currentPickedUid ? (d.users[currentPickedUid]?.spitzname || d.users[currentPickedUid]?.name || '?') : null,
        skipped: stateIsCurrent ? !!ms.weeklyState?.skipped : false,
        locked: isMindsetLocked(), myStatus, myDoneWeek: ms.done[uid]?.week || null,
        counts: { waitlist: Object.keys(ms.waitlist).length, rejected: Object.keys(ms.rejected).length, done: Object.keys(ms.done).length },
    };
    if (isAdmin) {
        out.waitlist = Object.entries(ms.waitlist).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)).map(([u, v]) => ({ uid: u, name: d.users[u]?.spitzname || d.users[u]?.name || '?', insta: d.users[u]?.instagram || '', joinedAt: v.joinedAt }));
        out.done = Object.entries(ms.done).sort((a, b) => (b[1].featuredAt || 0) - (a[1].featuredAt || 0)).map(([u, v]) => ({ uid: u, name: v.name || d.users[u]?.spitzname || d.users[u]?.name || '?', week: v.week, featuredAt: v.featuredAt }));
    }
    return out;
}

// ── AUTH: 1:1 aus telegram-bot portiert (PBKDF2). Security-kritisch — Schema
//    pbkdf2$100000$salt$hash bleibt identisch, damit migrierte Hashes weiter gelten.
function hashPasswordPBKDF2(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha256').toString('hex');
    return 'pbkdf2$100000$' + salt + '$' + hash;
}
function verifyPasswordPBKDF2(password, stored) {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iter = parseInt(parts[1], 10) || 100000;
    const salt = parts[2], hash = parts[3];
    if (!salt || !hash) return false;
    try {
        const compare = crypto.pbkdf2Sync(String(password), salt, iter, 64, 'sha256').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(compare, 'hex'));
    } catch { return false; }
}
function authEmailPassword({ email, password }) {
    email = String(email || '').toLowerCase().trim();
    password = String(password || '');
    if (!email || !password) return { ok: false, error: 'Email und Passwort erforderlich' };
    // Robust gegen DUPLIKAT-Emails (z.B. nach Wiederherstellung + Neu-Registrierung mit gleicher
    // Email): unter allen Accounts mit dieser Email in den einloggen, dessen Passwort passt —
    // statt blind den ersten Treffer zu nehmen (sonst „Passwort falsch" obwohl es einen Account gibt).
    const matches = Object.entries(d.users || {}).filter(([, u]) => String(u.email || '').toLowerCase() === email);
    if (!matches.length) return { ok: false, error: 'Email oder Passwort falsch', notRegistered: true };
    let anyWithPw = false;
    for (const [uid, u] of matches) {
        if (!u.password_hash) continue;
        anyWithPw = true;
        if (verifyPasswordPBKDF2(password, u.password_hash)) {
            u.appLastSeen = Date.now();
            u.appUser = true;
            return { ok: true, uid: String(uid), hasPassword: true };
        }
    }
    if (!anyWithPw) return { ok: false, error: 'noch kein Passwort gesetzt', noPassword: true };
    return { ok: false, error: 'Email oder Passwort falsch' };
}
function setUserPasswordApi({ uid, password }) {
    uid = String(uid || '');
    if (!uid || !d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    const pw = String(password || '');
    if (pw === '') { delete d.users[uid].password_hash; return { ok: true, cleared: true }; }
    if (pw.length < 6) return { ok: false, error: 'Passwort muss mindestens 6 Zeichen haben' };
    if (pw.length > 200) return { ok: false, error: 'Passwort zu lang' };
    d.users[uid].password_hash = hashPasswordPBKDF2(pw);
    return { ok: true };
}
function setAppCodeApi({ uid, code }) {
    uid = String(uid || '').trim();
    const raw = String(code || '').toLowerCase().trim();
    if (!uid || !d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    if (!/^[a-z0-9_-]{4,30}$/.test(raw)) return { ok: false, error: 'Code: 4–30 Zeichen, nur a–z, 0–9, _ oder -' };
    const reserved = new Set(['admin', 'root', 'system', 'api', 'login', 'logout', 'feed', 'auth', 'signup', 'register', 'help', 'test']);
    if (reserved.has(raw)) return { ok: false, error: 'Code reserviert — bitte anderen wählen' };
    const taken = Object.entries(d.users || {}).find(([oid, x]) => String(oid) !== uid && String(x.appCode || '').toLowerCase() === raw);
    if (taken) return { ok: false, error: 'Code schon vergeben — bitte anderen wählen' };
    d.users[uid].appCode = raw;
    d.users[uid].appCodeChosenAt = Date.now();
    return { ok: true, code: raw };
}
function createEmailUserApi({ email, password, ageConfirmedAt, termsAcceptedAt, termsVersion }) {
    email = String(email || '').toLowerCase().trim();
    password = String(password || '');
    ageConfirmedAt = Number(ageConfirmedAt || 0);
    termsAcceptedAt = Number(termsAcceptedAt || 0);
    termsVersion = String(termsVersion || '').slice(0, 30);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: 'Ungültige Email' };
    const existing = Object.entries(d.users || {}).find(([, u]) =>
        String(u.email || '').toLowerCase() === email || String(u.pendingEmail || '').toLowerCase() === email);
    if (existing) return { ok: true, uid: String(existing[0]), existed: true };
    if (password && (password.length < 6 || password.length > 200)) return { ok: false, error: 'Passwort muss 6–200 Zeichen lang sein' };
    let uid = String(Date.now());
    let attempts = 0;
    while (d.users[uid] && attempts++ < 50) uid = String(Date.now()) + Math.floor(Math.random() * 1000);
    if (d.users[uid]) return { ok: false, error: 'UID-Kollision' };
    d.users[uid] = {
        name: email.split('@')[0].slice(0, 30),
        username: null, instagram: null, bio: null, nische: null, spitzname: null,
        email, emailConfirmedAt: Date.now(),
        trophies: [], xp: 0, level: 1, warnings: 0, started: true, links: 0, likes: 0,
        role: '🆕 New', lastDaily: null, totalLikes: 0, chats: [], joinDate: Date.now(),
        inGruppe: true, diamonds: 0, projects: [], profileCompletionRewarded: false,
        inventory: [], activeRing: null, followers: [], following: [],
        appUser: true, appLastSeen: Date.now(), signupSource: 'email',
        ageConfirmedAt: ageConfirmedAt || null, termsAcceptedAt: termsAcceptedAt || null, termsVersion: termsVersion || null,
        blockedUsers: [],
    };
    if (password) d.users[uid].password_hash = hashPasswordPBKDF2(password);
    return { ok: true, uid, existed: false };
}

// ── Report-Action (Moderation: dismiss/resolve/warn/ban — 1:1 portiert, ohne Telegram) ──
async function adminReportActionApi({ reportId, action, adminUid }) {
    reportId = String(reportId || ''); action = String(action || ''); adminUid = String(adminUid || '');
    if (!reportId || !action) return { ok: false, error: 'reportId+action erforderlich' };
    if (!Array.isArray(d.reports)) d.reports = [];
    const idx = d.reports.findIndex(r => r && r.id === reportId);
    if (idx < 0) return { ok: false, error: 'Report nicht gefunden' };
    const rep = d.reports[idx];
    if (action === 'delete') { d.reports.splice(idx, 1); return { ok: true }; }
    if (action === 'dismiss') { rep.status = 'dismissed'; rep.resolvedAt = Date.now(); rep.resolvedBy = adminUid; return { ok: true }; }
    if (action === 'resolve') { rep.status = 'resolved'; rep.resolvedAt = Date.now(); rep.resolvedBy = adminUid; return { ok: true }; }
    if (action === 'warn') {
        const u = d.users[rep.targetUid];
        if (!u) return { ok: false, error: 'Target-User nicht gefunden' };
        u.warnings = (u.warnings || 0) + 1;
        rep.status = 'resolved'; rep.resolvedAt = Date.now(); rep.resolvedBy = adminUid; rep.action = 'warn';
        try { dmUser(rep.targetUid, `⚠️ Verwarnung

Ein Admin hat dich nach einer Meldung verwarnt.

⚠️ Verwarnungen: ${u.warnings}/5`); } catch (e) {}
        addNotification(rep.targetUid, '⚠️', 'Du wurdest verwarnt nach einer Meldung. Warns: ' + u.warnings + '/5');
        return { ok: true, warnings: u.warnings };
    }
    if (action === 'ban') {
        const u = d.users[rep.targetUid];
        if (!u) return { ok: false, error: 'Target-User nicht gefunden' };
        if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(rep.targetUid))) return { ok: false, error: 'Admins können nicht gebannt werden' };
        u.banned = true; u.bannedAt = Date.now(); u.inGruppe = false; u.started = false;
        ['dailyXP', 'weeklyXP', 'bonusLinks', 'missionen', 'wochenMissionen', 'userSessions'].forEach(k => { if (d[k]) delete d[k][rep.targetUid]; });
        for (const other of Object.values(d.users || {})) {
            if (other && other.parent_uid && String(other.parent_uid) === rep.targetUid) { other.banned = true; other.bannedAt = Date.now(); other.inGruppe = false; other.started = false; }
        }
        rep.status = 'resolved'; rep.resolvedAt = Date.now(); rep.resolvedBy = adminUid; rep.action = 'ban';
        try { dmUser(rep.targetUid, `🚫 Du wurdest gebannt

Ein Admin hat dich nach einer Meldung aus der Community entfernt.`); } catch (e) {}
        return { ok: true };
    }
    return { ok: false, error: 'Unbekannte Action: ' + action };
}

// ── Event planen (1:1 portiert, app-tauglich) ──
async function adminScheduleEventApi({ type, amount, durationMs, startAt, label }) {
    type = String(type || '');
    amount = parseInt(amount, 10);
    durationMs = parseInt(durationMs, 10);
    startAt = parseInt(startAt, 10);
    label = String(label || '').slice(0, 60);
    if (type !== 'xp' && type !== 'diamond') return { ok: false, error: 'type muss xp oder diamond sein' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount > 0' };
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 7 * 24 * 3600 * 1000) return { ok: false, error: 'durationMs 1ms-7 Tage' };
    if (!Number.isFinite(startAt) || startAt < Date.now() + 5 * 60 * 1000) return { ok: false, error: 'startAt muss min. 5 Min in der Zukunft sein' };
    if (startAt > Date.now() + 90 * 24 * 3600 * 1000) return { ok: false, error: 'Max 90 Tage Vorlauf' };
    const endAt = startAt + durationMs;
    const eventLabel = label || (type === 'xp' ? ('+' + amount + '% XP pro Like') : ('+' + amount + ' 💎 pro Post'));
    if (type === 'xp') {
        d.xpEvent = { aktiv: false, multiplier: 1 + (amount / 100), bonusPercent: amount, bonusPerPost: 0, start: startAt, end: endAt, label: eventLabel, scheduled: true, announcedScheduledAt: Date.now(), announcedAt1hPre: null, announcedAt30mPre: null, activatedAndAnnouncedAt: null };
    } else {
        d.diamondEvent = { bonusPerPost: 0, pendingBonusPerPost: amount, start: startAt, end: endAt, label: eventLabel, scheduled: true, announcedScheduledAt: Date.now(), announcedAt1hPre: null, announcedAt30mPre: null, activatedAndAnnouncedAt: null };
    }
    const startStr = new Date(startAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const icon = type === 'xp' ? '🚀' : '💎';
    const evtTitle = type === 'xp' ? 'XP-Event geplant!' : 'Diamond-Event geplant!';
    const msg = `${icon} ${evtTitle}

${eventLabel}

📅 Start: ${startStr} (Berlin-Zeit)
⏱ Dauer: ${Math.round(durationMs / 60000)} Minuten

Du bekommst 1 Stunde vorher eine Erinnerung und einen Push, sobald das Event startet.`;
    try { await announceEventToAllUsers(icon + ' ' + evtTitle, eventLabel + ' · Start ' + startStr, '/feed'); } catch (e) {}
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || u.parent_uid || u.banned || !u.started) continue;
        if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) continue;
        try { sendInAppDM(uid, msg); } catch (e) {}
    }
    return { ok: true, event: type === 'xp' ? d.xpEvent : d.diamondEvent };
}

// ── Report-User (1:1 portiert) ──
function reportUserApi({ reporterUid, targetUid, reason, context }) {
    reporterUid = String(reporterUid || ''); targetUid = String(targetUid || '');
    if (!reporterUid || !targetUid) return { ok: false, error: 'reporterUid+targetUid erforderlich' };
    if (reporterUid === targetUid) return { ok: false, error: 'Self-Report nicht erlaubt' };
    if (!d.users[reporterUid] || !d.users[targetUid]) return { ok: false, error: 'User nicht gefunden' };
    if (!d.reports) d.reports = [];
    d.reports.push({ id: 'rep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), reporterUid, targetUid, reason: String(reason || '').slice(0, 200), context: String(context || '').slice(0, 200), ts: Date.now(), status: 'open' });
    if (d.reports.length > 1000) d.reports = d.reports.slice(-1000);
    const adminIds = Array.isArray(d._adminIds) ? d._adminIds : [];
    const reporterName = d.users[reporterUid].spitzname || d.users[reporterUid].name || reporterUid;
    const targetName = d.users[targetUid].spitzname || d.users[targetUid].name || targetUid;
    for (const aId of adminIds) addNotification(String(aId), '🚩', reporterName + ' meldet ' + targetName + (reason ? ' (' + String(reason).slice(0, 40) + ')' : ''), reporterUid);
    return { ok: true };
}

// ── Broadcast-DM + Sub-Accounts (1:1 portiert, app-tauglich) ──
function sendDmAllApi({ text }) {
    text = String(text || '').trim();
    if (!text) return { ok: false, error: 'Text fehlt' };
    if (text.length > 1500) return { ok: false, error: 'Max 1500 Zeichen' };
    let sent = 0;
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || !u.started || u.banned || u.parent_uid) continue;
        if (Array.isArray(d._adminIds) && d._adminIds.map(Number).includes(Number(uid))) continue;
        try { dmUser(uid, text); sent++; } catch (e) {}
    }
    return { ok: true, sent };
}
function createSubaccountApi({ parent_uid, name }) {
    parent_uid = String(parent_uid || '');
    name = String(name || '').trim().slice(0, 30);
    if (!parent_uid || !name) return { ok: false, error: 'parent_uid + name erforderlich' };
    if (!d.users[parent_uid]) return { ok: false, error: 'Parent-User nicht gefunden' };
    if (d.users[parent_uid].parent_uid) return { ok: false, error: 'Sub-Account kann keinen Sub-Account erstellen' };
    const isAdm = istAdminId(parent_uid);
    // Limit: normale User dürfen bis zu 3 Sub-Accounts haben (Admins unbegrenzt).
    // Zählt nur existierende Subs (subUids + Legacy-subUid), Verwaiste werden ignoriert.
    const MAX_SUBS = 3;
    if (!isAdm) {
        const _existing = new Set();
        if (Array.isArray(d.users[parent_uid].subUids)) d.users[parent_uid].subUids.forEach(s => { if (d.users[String(s)]) _existing.add(String(s)); });
        if (d.users[parent_uid].subUid && d.users[String(d.users[parent_uid].subUid)]) _existing.add(String(d.users[parent_uid].subUid));
        if (_existing.size >= MAX_SUBS) {
            return { ok: false, error: 'Maximal ' + MAX_SUBS + ' Sub-Accounts erreicht.' };
        }
    }
    let sub_uid = String(Date.now());
    let attempts = 0;
    while (d.users[sub_uid] && attempts++ < 50) sub_uid = String(Date.now()) + Math.floor(Math.random() * 1000);
    if (d.users[sub_uid]) return { ok: false, error: 'Sub-UID-Kollision — bitte gleich nochmal versuchen' };
    d.users[sub_uid] = {
        name, username: null, instagram: null, bio: null, nische: null, spitzname: null,
        trophies: [], xp: 0, level: 1, warnings: 0, started: true, links: 0, likes: 0,
        role: '🆕 New', lastDaily: null, totalLikes: 0, chats: [], joinDate: Date.now(),
        inGruppe: true, diamonds: 0, projects: [], profileCompletionRewarded: false,
        inventory: [], activeRing: null, followers: [], following: [], parent_uid,
    };
    if (!Array.isArray(d.users[parent_uid].subUids)) d.users[parent_uid].subUids = [];
    if (d.users[parent_uid].subUid && !d.users[parent_uid].subUids.includes(String(d.users[parent_uid].subUid))) d.users[parent_uid].subUids.push(String(d.users[parent_uid].subUid));
    d.users[parent_uid].subUids.push(sub_uid);
    if (!d.users[parent_uid].subUid) d.users[parent_uid].subUid = sub_uid;
    return { ok: true, sub_uid, allSubs: d.users[parent_uid].subUids.slice() };
}
function adminLinkAsSubApi({ parent_uid, target_uid }) {
    parent_uid = String(parent_uid || '');
    target_uid = String(target_uid || '');
    if (!parent_uid || !target_uid) return { ok: false, error: 'parent_uid + target_uid erforderlich' };
    if (!istAdminId(parent_uid)) return { ok: false, error: 'Nur Admins können andere User als Sub linken' };
    const parent = d.users[parent_uid], target = d.users[target_uid];
    if (!parent) return { ok: false, error: 'Parent-User nicht gefunden' };
    if (!target) return { ok: false, error: 'Target-User nicht gefunden' };
    if (target_uid === parent_uid) return { ok: false, error: 'Kann sich nicht selbst als Sub linken' };
    if (target.parent_uid && String(target.parent_uid) !== parent_uid) return { ok: false, error: 'User ist bereits Sub eines anderen Accounts (' + target.parent_uid + ')' };
    target.parent_uid = parent_uid;
    if (!Array.isArray(parent.subUids)) parent.subUids = [];
    if (parent.subUid && !parent.subUids.includes(String(parent.subUid))) parent.subUids.push(String(parent.subUid));
    if (!parent.subUids.includes(target_uid)) parent.subUids.push(target_uid);
    if (!parent.subUid) parent.subUid = target_uid;
    return { ok: true, parent_uid, target_uid, allSubs: parent.subUids.slice() };
}
function deleteSubaccountApi({ parent_uid, sub_uid }) {
    parent_uid = String(parent_uid || '');
    sub_uid = String(sub_uid || '');
    if (!parent_uid || !sub_uid) return { ok: false, error: 'parent_uid + sub_uid erforderlich' };
    const sub = d.users[sub_uid];
    if (!sub || String(sub.parent_uid) !== parent_uid) return { ok: false, error: 'Sub gehört nicht zu diesem Parent' };
    delete d.users[sub_uid];
    if (d.users[parent_uid]) delete d.users[parent_uid].subUid;
    for (const u of Object.values(d.users || {})) {
        if (Array.isArray(u.followers)) u.followers = u.followers.filter(x => String(x) !== sub_uid);
        if (Array.isArray(u.following)) u.following = u.following.filter(x => String(x) !== sub_uid);
    }
    if (d.dailyXP) delete d.dailyXP[sub_uid];
    if (d.weeklyXP) delete d.weeklyXP[sub_uid];
    if (d.links && typeof d.links === 'object') {
        for (const [k, l] of Object.entries(d.links)) {
            if (!l) continue;
            if (String(l.user_id) === sub_uid) { delete d.links[k]; continue; }
            if (l.likes && typeof l.likes.delete === 'function') l.likes.delete(sub_uid);
            else if (Array.isArray(l.likes)) l.likes = l.likes.filter(x => String(x) !== sub_uid);
            else if (l.likes && typeof l.likes === 'object') delete l.likes[sub_uid];
            if (Array.isArray(l.comments)) l.comments = l.comments.filter(c => String(c.uid) !== sub_uid);
        }
    }
    if (d.superlinks && typeof d.superlinks === 'object') for (const [k, s] of Object.entries(d.superlinks)) if (s && String(s.uid) === sub_uid) delete d.superlinks[k];
    if (d.diamondLinks && typeof d.diamondLinks === 'object') for (const [k, p] of Object.entries(d.diamondLinks)) if (p && String(p.uid) === sub_uid) delete d.diamondLinks[k];
    if (d.notifications && typeof d.notifications === 'object') {
        delete d.notifications[sub_uid];
        for (const k of Object.keys(d.notifications)) if (Array.isArray(d.notifications[k])) d.notifications[k] = d.notifications[k].filter(n => String(n.actorUid || '') !== sub_uid);
    }
    return { ok: true };
}

// ── Newsletter (portiert, app-tauglich: ohne Telegram-DM; Web-Push macht die App) ──
function addNewsletterApi({ uid, title, content }) {
    uid = String(uid || '');
    if (!uid || !content || !content.trim()) return { ok: false, error: 'Inhalt fehlt' };
    if (!istAdminId(Number(uid))) return { ok: false, error: 'Kein Admin' };
    if (!d.newsletter) d.newsletter = [];
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const trimmedTitle = (title || '').trim();
    const trimmedContent = content.trim();
    d.newsletter.push({ id, title: trimmedTitle, content: trimmedContent, timestamp: Date.now() });
    for (const [tUid, tU] of Object.entries(d.users || {})) {
        if (istAdminId(Number(tUid)) || tU.parent_uid) continue;
        addNotification(tUid, '📩', (trimmedTitle || 'Neuer Newsletter-Eintrag').slice(0, 60));
    }
    return { ok: true, id, title: trimmedTitle, content: trimmedContent };
}
function editNewsletterApi({ uid, id, title, content }) {
    uid = String(uid || '');
    if (!uid || !id || !content || !content.trim()) return { ok: false };
    if (!istAdminId(Number(uid))) return { ok: false, error: 'Kein Admin' };
    const entry = (d.newsletter || []).find(e => e.id === id);
    if (!entry) return { ok: false, error: 'Nicht gefunden' };
    entry.title = (title || '').trim();
    entry.content = content.trim();
    entry.editedAt = Date.now();
    return { ok: true };
}
function deleteNewsletterApi({ uid, id }) {
    uid = String(uid || '');
    if (!uid || !id) return { ok: false };
    if (!istAdminId(Number(uid))) return { ok: false, error: 'Kein Admin' };
    d.newsletter = (d.newsletter || []).filter(e => e.id !== id);
    return { ok: true };
}

// ── COLLAB-Requests (1:1 aus telegram-bot portiert) ──
function collabRequestApi({ fromUid, toUid }) {
    _collabEnsure();
    fromUid = String(fromUid || '');
    toUid = String(toUid || '');
    if (!fromUid || !toUid) return { ok: false, error: 'fromUid + toUid erforderlich' };
    if (fromUid === toUid) return { ok: false, error: 'Self-Collab nicht erlaubt' };
    if (!d.users[fromUid] || !d.users[toUid]) return { ok: false, error: 'User nicht gefunden' };
    if (_collabHasPair(fromUid, toUid)) return { ok: false, error: 'Ihr seid bereits Kollab-Partner' };
    const existing = Object.entries(d.collabRequests).find(([, r]) =>
        r.status === 'pending' && ((String(r.fromUid) === fromUid && String(r.toUid) === toUid) || (String(r.fromUid) === toUid && String(r.toUid) === fromUid)));
    if (existing) return { ok: false, error: 'Anfrage existiert bereits', reqId: existing[0] };
    const reqId = 'cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    d.collabRequests[reqId] = { id: reqId, fromUid, toUid, ts: Date.now(), status: 'pending' };
    const fromName = d.users[fromUid]?.spitzname || d.users[fromUid]?.name || 'Ein User';
    addNotification(toUid, '🤝', fromName + ' möchte mit dir eine Kollaboration eingehen', fromUid);
    sendInAppDM(toUid, `🤝 Kollab-Anfrage

${fromName} möchte mit dir zusammenarbeiten.

Wenn du annimmst, dürft ihr gemeinsam 1× pro Woche einen Kollab-Post veröffentlichen.

Öffne deine Benachrichtigungen, um zu antworten.`);
    return { ok: true, reqId };
}
function collabRespondApi({ reqId, accept, callerUid }) {
    _collabEnsure();
    reqId = String(reqId || '');
    accept = !!accept;
    callerUid = String(callerUid || '');
    const r = d.collabRequests[reqId];
    if (!r) return { ok: false, error: 'Anfrage nicht gefunden' };
    if (r.status !== 'pending') return { ok: false, error: 'Anfrage schon beantwortet' };
    if (String(r.toUid) !== callerUid) return { ok: false, error: 'Nur der Empfänger kann antworten' };
    r.status = accept ? 'accepted' : 'declined';
    r.respondedAt = Date.now();
    const fromU = d.users[r.fromUid];
    const toU = d.users[r.toUid];
    if (accept && fromU && toU) {
        if (!Array.isArray(fromU.collaborations)) fromU.collaborations = [];
        if (!Array.isArray(toU.collaborations)) toU.collaborations = [];
        if (!_collabHasPair(r.fromUid, r.toUid)) fromU.collaborations.push({ partnerUid: r.toUid, since: Date.now() });
        if (!_collabHasPair(r.toUid, r.fromUid)) toU.collaborations.push({ partnerUid: r.fromUid, since: Date.now() });
        const fromName = fromU.spitzname || fromU.name || 'Partner';
        const toName = toU.spitzname || toU.name || 'Partner';
        addNotification(r.fromUid, '🎉', toName + ' hat deine Kollab-Anfrage angenommen', r.toUid);
        sendInAppDM(r.fromUid, `🎉 Kollaboration aktiv

Du bist jetzt Kollab-Partner mit ${toName}.

Im Plus-Menü könnt ihr "Kollab-Link" wählen — 1× pro Woche.`);
        sendInAppDM(r.toUid, `🎉 Kollaboration aktiv

Du bist jetzt Kollab-Partner mit ${fromName}.

Im Plus-Menü könnt ihr "Kollab-Link" wählen — 1× pro Woche.`);
    } else if (!accept && fromU) {
        const toName = toU?.spitzname || toU?.name || 'Der User';
        addNotification(r.fromUid, '❌', toName + ' hat deine Kollab-Anfrage abgelehnt', r.toUid);
    }
    return { ok: true, status: r.status };
}
function collabAcceptFeedRulesApi({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    if (!u.collabFeedRulesAcceptedAt) u.collabFeedRulesAcceptedAt = Date.now();
    return { ok: true, acceptedAt: u.collabFeedRulesAcceptedAt };
}

// ════════ ADMIN-DASHBOARD READ-APIs (1:1 portiert aus telegram-bot) ════════
// Reine Lese-Getter — KEINE Mutation, kein Telegram. Auth-Check macht die App-Route.

// Dashboard-Stats: online (App-Presence ≤ 5min), today/week landing visits, signup-source breakdown, top stats.
function adminStatsApi() {
    const now = Date.now();
    const ONLINE_THRESHOLD = 5 * 60 * 1000;
    let online = 0, activeToday = 0, app24h = 0, app7d = 0, app30d = 0;
    const sources = { telegram: 0, email: 0 };
    let banned = 0;
    const todayStartBerlin = (() => {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
        const get = (t) => parts.find(p => p.type === t).value;
        return new Date(get('year') + '-' + get('month') + '-' + get('day') + 'T00:00:00').getTime();
    })();
    for (const u of Object.values(d.users || {})) {
        if (!u) continue;
        if (u.appLastSeen) {
            const age = now - u.appLastSeen;
            if (age <= ONLINE_THRESHOLD) online++;
            if (u.appLastSeen >= todayStartBerlin) activeToday++;
            if (age <= 24 * 60 * 60 * 1000) app24h++;
            if (age <= 7 * 24 * 60 * 60 * 1000) app7d++;
            if (age <= 30 * 24 * 60 * 60 * 1000) app30d++;
        }
        if (!u.parent_uid) {
            const src = u.signupSource || 'telegram';
            sources[src] = (sources[src] || 0) + 1;
            if (u.banned) banned++;
        }
    }
    const todayStrLocal = new Date().toDateString();
    const yesterdayStrLocal = new Date(Date.now() - 86400000).toDateString();
    const xpTodaySum = Object.values(d.dailyXP || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    const xpYesterdaySum = Object.values(d.gesternDailyXP || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    let linksToday = 0, linksYesterday = 0, likesToday = 0, likesYesterday = 0;
    for (const l of Object.values(d.links || {})) {
        if (!l || !l.timestamp) continue;
        const lDay = new Date(l.timestamp).toDateString();
        const likeArr = Array.isArray(l.likes) ? l.likes : Array.from(l.likes || []);
        const likeCount = likeArr.length;
        if (lDay === todayStrLocal) linksToday++;
        else if (lDay === yesterdayStrLocal) linksYesterday++;
        if (lDay === yesterdayStrLocal) likesYesterday += likeCount;
    }
    const heuteToString = new Date().toDateString();
    for (const m of Object.values(d.missionen || {})) {
        if (m && m.date === heuteToString) likesToday += (Number(m.likesGegeben) || 0);
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const daily = (d.funnel && d.funnel.daily) || {};
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        last7Days.push({ day, events: daily[day] || {} });
    }
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        last30Days.push({ day, events: daily[day] || {} });
    }
    const last7DaysAggregated = {};
    for (const d2 of last7Days) {
        for (const [evt, count] of Object.entries(d2.events)) {
            last7DaysAggregated[evt] = (last7DaysAggregated[evt] || 0) + count;
        }
    }
    const today = daily[todayStr] || {};
    const yesterday = daily[yesterdayStr] || {};
    const f7 = last7DaysAggregated;
    const conversion = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const last30dCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const last7dCutoff = now - 7 * 24 * 60 * 60 * 1000;
    let newUsers30d = 0, newUsers7d = 0, newUsersToday = 0;
    const recentSignups = [];
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || u.parent_uid) continue;
        const j = u.joinDate || 0;
        if (j >= last30dCutoff) {
            newUsers30d++;
            if (j >= last7dCutoff) newUsers7d++;
            if (new Date(j).toISOString().slice(0, 10) === todayStr) newUsersToday++;
            recentSignups.push({
                uid: String(uid),
                name: u.spitzname || u.name || ('User ' + uid),
                email: u.email || '',
                instagram: u.instagram || '',
                signupSource: u.signupSource || 'telegram',
                joinDate: j,
                emailConfirmed: !!u.emailConfirmedAt && !u.pendingEmail,
                hasInstagram: !!u.instagram,
            });
        }
    }
    recentSignups.sort((a, b) => b.joinDate - a.joinDate);

    const topXpToday = Object.entries(d.dailyXP || {})
        .filter(([uid, xp]) => xp > 0 && d.users && d.users[uid] && !d.users[uid].banned)
        .map(([uid, xp]) => {
            const u = d.users[uid] || {};
            return {
                uid: String(uid),
                name: u.spitzname || u.name || ('User ' + uid),
                instagram: u.instagram || '',
                role: u.role || '',
                xpGained: Number(xp) || 0,
                xpTotal: u.xp || 0,
                isSub: !!u.parent_uid,
            };
        })
        .sort((a, b) => b.xpGained - a.xpGained)
        .slice(0, 10);

    let tgSignups7d = 0, emSignups7d = 0;
    for (const u of Object.values(d.users || {})) {
        if (!u || u.parent_uid) continue;
        if ((u.joinDate || 0) < last7dCutoff) continue;
        if (u.signupSource === 'email') emSignups7d++;
        else tgSignups7d++;
    }
    let tgActive7d = 0, emActive7d = 0;
    for (const u of Object.values(d.users || {})) {
        if (!u) continue;
        if (!u.appLastSeen || (now - u.appLastSeen) > 7 * 86400000) continue;
        if (u.signupSource === 'email') emActive7d++;
        else tgActive7d++;
    }
    const sourceFunnel = {
        telegram: { signups: tgSignups7d, active7d: tgActive7d, retentionPct: conversion(tgActive7d, tgSignups7d) },
        email: { signups: emSignups7d, active7d: emActive7d, retentionPct: conversion(emActive7d, emSignups7d) },
    };

    const recentActivity = ((d.funnel && d.funnel.events) || [])
        .slice(-30)
        .reverse()
        .slice(0, 20)
        .map(e => ({
            event: e.event,
            ts: e.ts,
            uid: (e.meta && e.meta.uid) || '',
            name: e.meta && e.meta.uid && d.users && d.users[e.meta.uid]
                ? (d.users[e.meta.uid].spitzname || d.users[e.meta.uid].name || 'User')
                : ((e.meta && e.meta.email) || 'anonym'),
        }));

    return {
        ok: true,
        online,
        activeToday,
        app24h,
        app7d,
        app30d,
        sources,
        banned,
        landingToday: today['landing-view'] || 0,
        landingYesterday: yesterday['landing-view'] || 0,
        signupViewToday: today['signup-view'] || 0,
        signupCompleteToday: today['signup-complete'] || 0,
        signupToday: (today['signup-complete'] || 0) + (today['signup'] || 0) + (today['email-signup'] || 0),
        loginSuccessToday: today['login-success'] || 0,
        emailSubmitToday: today['email-submit'] || 0,
        telegramClickToday: today['telegram-click'] || 0,
        ctaClickToday: today['landing-cta-click'] || 0,
        funnel7d: {
            landing: f7['landing-view'] || 0,
            ctaClick: f7['landing-cta-click'] || 0,
            signupView: f7['signup-view'] || 0,
            signupComplete: f7['signup-complete'] || 0,
            loginSuccess: f7['login-success'] || 0,
            telegramClick: f7['telegram-click'] || 0,
            emailSubmit: f7['email-submit'] || 0,
            ctaPct: conversion(f7['landing-cta-click'] || 0, f7['landing-view'] || 0),
            signupViewPct: conversion(f7['signup-view'] || 0, f7['landing-view'] || 0),
            signupCompletePct: conversion(f7['signup-complete'] || 0, f7['signup-view'] || 0),
            loginRetentionPct: conversion(f7['login-success'] || 0, f7['signup-complete'] || 0),
        },
        newUsersToday, newUsers7d, newUsers30d,
        recentSignups: recentSignups.slice(0, 50),
        last7Days,
        last30Days,
        last7DaysAggregated,
        xpToday: xpTodaySum,
        xpYesterday: xpYesterdaySum,
        likesToday,
        likesYesterday,
        linksToday,
        linksYesterday,
        topXpToday,
        sourceFunnel,
        recentActivity,
        totalUsers: Object.values(d.users || {}).filter(u => u && !u.parent_uid).length,
    };
}

// User-Liste für App-Dashboard (Admin-only via App-side Check).
function adminUserlistApi() {
    const out = [];
    const adminIds = Array.isArray(d._adminIds) ? d._adminIds.map(Number) : [];
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u) continue;
        out.push({
            uid: String(uid),
            name: u.name || '',
            spitzname: u.spitzname || '',
            instagram: u.instagram || '',
            email: u.email || '',
            pendingEmail: u.pendingEmail || '',
            emailConfirmedAt: u.emailConfirmedAt || null,
            xp: u.xp || 0,
            diamonds: u.diamonds || 0,
            role: u.role || '',
            level: u.level || 1,
            joinDate: u.joinDate || 0,
            started: !!u.started,
            inGruppe: u.inGruppe !== false,
            likes: u.likes || 0,
            totalLikes: u.totalLikes || 0,
            links: u.links || 0,
            bio: u.bio || '',
            nische: u.nische || '',
            signupSource: u.signupSource || 'telegram',
            superlinkCredits: u.superlinkCredits || 0,
            bonusLinks: (d.bonusLinks && d.bonusLinks[uid]) || 0,
            warnings: u.warnings || 0,
            appLastSeen: u.appLastSeen || null,
            isAdmin: adminIds.includes(Number(uid)) || String(u.role || '').includes('Admin'),
            isSub: !!u.parent_uid,
            parentUid: u.parent_uid ? String(u.parent_uid) : null,
            banned: !!u.banned,
        });
    }
    return { ok: true, users: out };
}

// Detail-View eines einzelnen Users fürs Admin-Dashboard.
function adminUserDetailApi(uid) {
    uid = String(uid || '');
    if (!uid) return { ok: false, error: 'uid erforderlich' };
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    const adminIds = Array.isArray(d._adminIds) ? d._adminIds.map(Number) : [];
    const act = (d.appActivity && d.appActivity[uid]) || null;

    const reports = Array.isArray(d.reports) ? d.reports : [];
    const reportsAgainst = reports.filter(r => String(r.targetUid) === uid).map(r => ({
        id: r.id, reporterUid: r.reporterUid,
        reporterName: ((d.users[r.reporterUid] && (d.users[r.reporterUid].spitzname || d.users[r.reporterUid].name)) || ('User ' + r.reporterUid)),
        reason: r.reason || '', context: r.context || '',
        ts: r.ts, status: r.status || 'open', action: r.action || null,
    }));
    const reportsMade = reports.filter(r => String(r.reporterUid) === uid).map(r => ({
        id: r.id, targetUid: r.targetUid,
        targetName: ((d.users[r.targetUid] && (d.users[r.targetUid].spitzname || d.users[r.targetUid].name)) || ('User ' + r.targetUid)),
        reason: r.reason || '', context: r.context || '',
        ts: r.ts, status: r.status || 'open',
    }));

    let pinnedEngaged = 0, pinnedReceived = 0;
    for (const e of (d.pinnedEngageLog || [])) {
        if (String(e.engagerUid) === uid) pinnedEngaged++;
        if (String(e.ownerUid) === uid) pinnedReceived++;
    }
    let collabEngaged = 0, collabReceived = 0;
    for (const p of Object.values(d.collabPosts || {})) {
        const likes = Array.isArray(p.likes) ? p.likes : [];
        if (likes.includes(uid) || likes.includes(Number(uid))) collabEngaged++;
        if (String(p.uid) === uid || String(p.partnerUid) === uid) collabReceived += likes.length;
    }

    const subAccounts = [];
    for (const [oUid, oU] of Object.entries(d.users || {})) {
        if (oU && String(oU.parent_uid) === uid) {
            subAccounts.push({
                uid: oUid, name: oU.spitzname || oU.name || ('Sub ' + oUid),
                joinDate: oU.joinDate || null, xp: oU.xp || 0, banned: !!oU.banned,
            });
        }
    }
    const parent = u.parent_uid && d.users[u.parent_uid]
        ? { uid: String(u.parent_uid), name: d.users[u.parent_uid].spitzname || d.users[u.parent_uid].name || ('User ' + u.parent_uid) }
        : null;

    const notifications = Array.isArray(d.notifications && d.notifications[uid])
        ? d.notifications[uid].slice(-20).reverse().map(n => ({ icon: n.icon || '', text: n.text || '', ts: n.ts || n.timestamp || null }))
        : [];

    return {
        ok: true,
        user: {
            uid, name: u.name || '', spitzname: u.spitzname || '', email: u.email || '',
            instagram: u.instagram || '', bio: u.bio || '', nische: u.nische || '', gender: u.gender || '',
            role: u.role || '', xp: u.xp || 0, level: u.level || 1, diamonds: u.diamonds || 0,
            links: u.links || 0, totalLikes: u.totalLikes || 0, warnings: u.warnings || 0,
            joinDate: u.joinDate || null, started: !!u.started, inGruppe: !!u.inGruppe,
            banned: !!u.banned, bannedAt: u.bannedAt || null,
            emailConfirmedAt: u.emailConfirmedAt || null,
            signupSource: u.signup_source || u.signupSource || null,
            profileCompletionRewarded: !!u.profileCompletionRewarded,
            isAdmin: adminIds.includes(Number(uid)),
            appUser: !!u.appUser,
            pinnedReel: u.pinnedReel || null,
            superlinkCredits: u.superlinkCredits || 0,
            extraLinks: u.extraLinks || 0,
        },
        activity: act ? {
            firstSeen: act.firstSeen, lastSeen: act.lastSeen, sessions: act.sessions || 0,
            totalCalls: act.totalCalls || 0, lastEndpoint: act.lastEndpoint || '',
            topEndpoints: Object.entries(act.endpoints || {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
        } : null,
        engagement: {
            pinnedEngaged, pinnedReceived,
            collabEngaged, collabReceived,
        },
        reportsAgainst, reportsMade,
        subAccounts, parent,
        notifications,
    };
}

// Debug: rohe Funnel-Daten (welche Events wann gespeichert wurden)
// Funnel-Event lokal aufzeichnen (ersetzt den frueheren Mainbot-/track-funnel-Pfad).
// Struktur identisch zu dem, was die Funnel-Reads erwarten:
//   d.funnel = { events: [{ event, ts, meta:{uid,...} }], daily: { 'YYYY-MM-DD': { event: count } } }
function trackFunnelApi({ event, meta, uid }) {
    event = String(event || '').slice(0, 40);
    if (!event) return { ok: false, error: 'event erforderlich' };
    if (!d.funnel || typeof d.funnel !== 'object') d.funnel = { events: [], daily: {} };
    if (!Array.isArray(d.funnel.events)) d.funnel.events = [];
    if (!d.funnel.daily || typeof d.funnel.daily !== 'object') d.funnel.daily = {};
    const m = (meta && typeof meta === 'object') ? Object.assign({}, meta) : {};
    if (uid) m.uid = String(uid);
    d.funnel.events.push({ event, ts: Date.now(), meta: m });
    if (d.funnel.events.length > 5000) d.funnel.events = d.funnel.events.slice(-5000);
    const dayKey = new Date().toISOString().slice(0, 10);
    if (!d.funnel.daily[dayKey]) d.funnel.daily[dayKey] = {};
    d.funnel.daily[dayKey][event] = (d.funnel.daily[dayKey][event] || 0) + 1;
    const keys = Object.keys(d.funnel.daily);
    if (keys.length > 60) { keys.sort(); for (const k of keys.slice(0, keys.length - 60)) delete d.funnel.daily[k]; }
    return { ok: true };
}
function adminFunnelDebugApi() {
    const funnel = d.funnel || { events: [], daily: {} };
    const allEvents = funnel.events || [];
    const last20 = allEvents.slice(-20).reverse().map(e => ({
        event: e.event,
        ts: e.ts,
        date: new Date(e.ts).toISOString(),
        meta: e.meta || {},
    }));
    const eventCounts = {};
    for (const e of allEvents) eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
    return {
        ok: true,
        totalEvents: allEvents.length,
        funnelExists: !!d.funnel,
        eventCounts,
        last20Events: last20,
        dailyKeys: Object.keys(funnel.daily || {}).sort(),
        dailyToday: (funnel.daily && funnel.daily[new Date().toISOString().slice(0, 10)]) || {},
        dailyBerlinToday: (funnel.daily && funnel.daily[(() => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return p.find(x => x.type === 'year').value + '-' + p.find(x => x.type === 'month').value + '-' + p.find(x => x.type === 'day').value; })()]) || {},
        nowUtc: new Date().toISOString(),
        nowBerlin: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
    };
}

// Dashboard-Datenquelle: alle Pinned-Engagements + Kollab-Likes + Reports mit Timestamps.
function adminEngagementLogApi() {
    const pinned = [];
    for (const e of (d.pinnedEngageLog || []).slice(-500).reverse()) {
        const eu = d.users[e.engagerUid] || {};
        const ou = d.users[e.ownerUid] || {};
        const pinnedUrl = ou.pinnedReel || null;
        pinned.push({
            engagerUid: e.engagerUid,
            engagerName: eu.spitzname || eu.name || 'User ' + e.engagerUid,
            engagerInstagram: eu.instagram || '',
            ownerUid: e.ownerUid,
            ownerName: ou.spitzname || ou.name || 'User ' + e.ownerUid,
            ownerInstagram: ou.instagram || '',
            ts: e.ts,
            pinnedUrl,
        });
    }
    const collabs = [];
    for (const p of Object.values(d.collabPosts || {})) {
        const a = d.users[p.uid] || {}, b = d.users[p.partnerUid] || {};
        for (const lUid of (Array.isArray(p.likes) ? p.likes : [])) {
            const lu = d.users[lUid] || {};
            collabs.push({
                postId: p.id, url: p.url, caption: (p.caption || '').slice(0, 100),
                authorA: { uid: p.uid, name: a.spitzname || a.name || 'User', instagram: a.instagram || '', builderEmoji: _bldEmoji(p.uid) },
                authorB: { uid: p.partnerUid, name: b.spitzname || b.name || 'User', instagram: b.instagram || '', builderEmoji: _bldEmoji(p.partnerUid) },
                engagerUid: String(lUid),
                engagerName: lu.spitzname || lu.name || 'User ' + lUid,
                engagerInstagram: lu.instagram || '',
                createdAt: p.createdAt,
                week: p.week,
            });
        }
    }
    collabs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const reports = [];
    for (const r of (d.reports || []).slice().reverse()) {
        const rep = d.users[r.reporterUid] || {};
        const tgt = d.users[r.targetUid] || {};
        reports.push({
            id: r.id,
            reporterUid: r.reporterUid,
            reporterName: rep.spitzname || rep.name || ('User ' + r.reporterUid),
            reporterInstagram: rep.instagram || '',
            targetUid: r.targetUid,
            targetName: tgt.spitzname || tgt.name || ('User ' + r.targetUid),
            targetInstagram: tgt.instagram || '',
            targetWarnings: Number(tgt.warnings || 0),
            targetBanned: !!tgt.banned,
            reason: r.reason || '',
            context: r.context || '',
            ts: r.ts,
            status: r.status || 'open',
            resolvedAt: r.resolvedAt || null,
            resolvedBy: r.resolvedBy || null,
            action: r.action || null,
        });
    }
    return { ok: true, pinned: pinned.slice(0, 500), collabs: collabs.slice(0, 500), reports };
}

// Mission-Report: Compliance-Auswertung (M1/M2/M3 per Tag + Aktionen)
function adminMissionReportApi(dateStr) {
    dateStr = String(dateStr || '').trim();
    if (!dateStr || dateStr === 'yesterday') {
        const y = new Date(Date.now() - 86400000);
        dateStr = y.toDateString();
    } else if (dateStr === 'today') {
        dateStr = new Date().toDateString();
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        dateStr = new Date(dateStr + 'T12:00:00').toDateString();
    }
    const adminIds = Array.isArray(d._adminIds) ? d._adminIds.map(Number) : [];
    const dayLinks = Object.values(d.links || {}).filter(l =>
        l && l.text && istInstagramLink(l.text) &&
        new Date(l.timestamp).toDateString() === dateStr
    );
    const totalDayLinks = dayLinks.length;
    const users = [];
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || u.parent_uid) continue;
        if (adminIds.includes(Number(uid))) continue;
        if (!u.started || u.banned) continue;
        const userPostsToday = dayLinks.filter(l => String(l.user_id) === String(uid)).length;
        const userLikesToday = dayLinks.filter(l => {
            if (String(l.user_id) === String(uid)) return false;
            const likes = l.likes instanceof Set ? Array.from(l.likes) : (Array.isArray(l.likes) ? l.likes : []);
            return likes.includes(String(uid)) || likes.includes(Number(uid));
        }).length;
        const othersDayLinks = totalDayLinks - userPostsToday;
        const m1Done = userLikesToday >= 5;
        const m2Done = othersDayLinks > 0 && (userLikesToday / othersDayLinks) >= 0.8;
        const m3Done = othersDayLinks > 0 && userLikesToday >= Math.min(M3_CAP, othersDayLinks);
        const wMission = (d.wochenMissionen && d.wochenMissionen[uid]) || { m1Tage: 0, m2Tage: 0, m3Tage: 0 };
        const act = (d.appActivity && d.appActivity[uid]) || null;
        users.push({
            uid,
            name: u.spitzname || u.name || ('User ' + uid),
            instagram: u.instagram || '',
            warnings: Number(u.warnings || 0),
            xp: Number(u.xp || 0),
            diamonds: Number(u.diamonds || 0),
            totalLikes: Number(u.totalLikes || 0),
            links: Number(u.links || 0),
            level: Number(u.level || 1),
            role: u.role || '',
            joinDate: u.joinDate || null,
            postedToday: userPostsToday,
            likedToday: userLikesToday,
            othersAvailable: othersDayLinks,
            dailyXP: Number((d.dailyXP && d.dailyXP[uid]) || 0),
            weeklyXP: Number((d.weeklyXP && d.weeklyXP[uid]) || 0),
            m1: m1Done,
            m2: m2Done,
            m3: m3Done,
            weekM1: wMission.m1Tage || 0,
            weekM2: wMission.m2Tage || 0,
            weekM3: wMission.m3Tage || 0,
            postSuspendedUntil: u.postSuspendedUntil || null,
            postSuspendReason: u.postSuspendReason || null,
            lastSeen: (act && act.lastSeen) || u.appLastSeen || null,
            email: u.email || '',
            postedButFailedM1: userPostsToday > 0 && !m1Done,
            onlyPoster: userPostsToday > 0 && userLikesToday === 0,
            onlyLiker: userPostsToday === 0 && userLikesToday > 0,
            inactive: userPostsToday === 0 && userLikesToday === 0,
            warningsCritical: Number(u.warnings || 0) >= 3,
            warningsLast: Number(u.warnings || 0) >= 4,
            banned: !!u.banned,
        });
    }
    const summary = {
        date: dateStr,
        totalLinks: totalDayLinks,
        totalUsers: users.length,
        m1Done: users.filter(x => x.m1).length,
        m2Done: users.filter(x => x.m2).length,
        m3Done: users.filter(x => x.m3).length,
        postedButFailedM1: users.filter(x => x.postedButFailedM1).length,
        onlyPosters: users.filter(x => x.onlyPoster).length,
        onlyLikers: users.filter(x => x.onlyLiker).length,
        inactive: users.filter(x => x.inactive).length,
        currentlyPostSuspended: users.filter(x => x.postSuspendedUntil && Number(x.postSuspendedUntil) > Date.now()).length,
    };
    return { ok: true, summary, users };
}

// Helper-Fragen-Queue (Filter: open/answered/all)
function adminHelperQuestionsApi(status) {
    status = String(status || 'open');
    const all = Array.isArray(d.helperQuestions) ? d.helperQuestions : [];
    const filtered = status === 'all' ? all
        : status === 'answered' ? all.filter(q => !!q.answeredAt)
        : all.filter(q => !q.answeredAt);
    return { ok: true, total: all.length, open: all.filter(q => !q.answeredAt).length, questions: filtered.slice().reverse() };
}

// Admin-Liste aller Diamantlinks (inkl. Engager).
function diamondLinkAdminListApi() {
    _diamondEnsure();
    const now = Date.now();
    const out = Object.values(d.diamondLinks)
        .filter(p => p && !p.deletedAt)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map(p => {
            const author = d.users[p.uid] || {};
            const likes = Array.isArray(p.likes) ? p.likes : Array.from(p.likes || []);
            const engagers = likes.map(lUid => {
                const lu = d.users[lUid] || {};
                return {
                    uid: String(lUid),
                    name: lu.spitzname || lu.name || ('User ' + lUid),
                    instagram: lu.instagram || '',
                    engagedAt: (p.engagedAt && p.engagedAt[lUid]) || null,
                };
            });
            return {
                id: p.id, uid: p.uid, url: p.url, caption: p.caption,
                createdAt: p.createdAt, expiresAt: p.expiresAt, deletedAt: p.deletedAt || null,
                active: !p.deletedAt && p.expiresAt > now,
                likeCount: likes.length,
                author: { uid: p.uid, name: author.spitzname || author.name || 'User', instagram: author.instagram || '', builderEmoji: _bldEmoji(p.uid) },
                engagers,
            };
        });
    return { ok: true, posts: out, cost: DIAMOND_LINK_COST, reward: DIAMOND_LINK_REWARD };
}

// Admin-Liste aller Prismalinks (inkl. Engager).
function prismaLinkAdminListApi() {
    _prismaEnsure();
    const now = Date.now();
    const out = Object.values(d.prismaLinks)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map(p => {
            const author = d.users[p.uid] || {};
            const likes = Array.isArray(p.likes) ? p.likes : Array.from(p.likes || []);
            const engagers = likes.map(lUid => {
                const lu = d.users[lUid] || {};
                return {
                    uid: String(lUid),
                    name: lu.spitzname || lu.name || ('User ' + lUid),
                    instagram: lu.instagram || '',
                    engagedAt: (p.engagedAt && p.engagedAt[lUid]) || null,
                };
            });
            return {
                id: p.id, uid: p.uid, url: p.url, caption: p.caption,
                createdAt: p.createdAt, expiresAt: p.expiresAt, deletedAt: p.deletedAt || null,
                active: !p.deletedAt && p.expiresAt > now,
                likeCount: likes.length,
                author: { uid: p.uid, name: author.spitzname || author.name || 'User', instagram: author.instagram || '', builderEmoji: _bldEmoji(p.uid) },
                engagers,
            };
        });
    return { ok: true, posts: out, cost: PRISMA_LINK_COST, reward: PRISMA_LINK_REWARD };
}

// ════════ WOCHEN-GEWINNSPIEL (Sonntag 20:00) — Write-Cron, 1:1 portiert ════════
// Random-Winner aus weeklyXP (+1 Bonus-Link) + Wochen-Superlink-Engagement-Diamanten.
// Hinweis: weeklyRankingDM (Top-3-Übersicht an alle gestarteten User) inline via dmUser.
async function runWochenGewinnspielApi() {
    try {
        const adminIds = Array.isArray(d._adminIds) ? d._adminIds.map(Number) : [];
        const isBot = (u) => !!(u && (u.is_bot === true || (u.username && /bot$/i.test(u.username))));
        const teilnehmer = Object.entries(d.weeklyXP || {})
            .filter(([uid]) => {
                const u = d.users[uid];
                if (!u || !u.started || u.inGruppe === false) return false;
                if (adminIds.includes(Number(uid)) || istAdminId(uid)) return false;
                if (isBot(u)) return false;
                return d.weeklyXP[uid] > 0;
            })
            .map(([uid]) => uid);
        let winnerId = null, winnerName = null;
        if (teilnehmer.length) {
            winnerId = teilnehmer[Math.floor(Math.random() * teilnehmer.length)];
            const winner = d.users[winnerId];
            winnerName = winner ? winner.name : '?';
            if (!d.bonusLinks[winnerId]) d.bonusLinks[winnerId] = 0;
            d.bonusLinks[winnerId] += 1;
            if (!d.wochenGewinnspiel) d.wochenGewinnspiel = { gewinner: [] };
            if (!Array.isArray(d.wochenGewinnspiel.gewinner)) d.wochenGewinnspiel.gewinner = [];
            d.wochenGewinnspiel.gewinner.push({ name: winnerName, uid: winnerId, datum: new Date().toLocaleDateString() });
            d.wochenGewinnspiel.letzteAuslosung = Date.now();
            try { await dmUser(winnerId, '🎉 Du hast das Wochen-Gewinnspiel gewonnen\n\n🔗 +1 Extra-Link für nächste Woche\n\nGlückwunsch!'); } catch (e) {}
        } else {
            console.log('❌ Wochen-Gewinnspiel: keine Teilnehmer');
        }

        // Wochen-Superlink-Engagement-Diamanten (wer alle Superlinks der Woche engagiert hat → +1 💎)
        try {
            const woche = Object.values(d.superlinks || {}).filter(sl => sl && sl.likes !== undefined);
            if (woche.length >= 2) {
                const slLikersPerSl = woche.map(sl => new Set((Array.isArray(sl.likes) ? sl.likes : Array.from(sl.likes || [])).map(String)));
                const slPosters = new Set(woche.map(sl => String(sl.uid || sl.user_id || '')));
                for (const [uid, u] of Object.entries(d.users || {})) {
                    if (!u || istAdminId(uid) || u.parent_uid || u.inGruppe === false || !u.started) continue;
                    if (slPosters.has(String(uid))) continue;
                    const allEngaged = slLikersPerSl.every(set => set.has(String(uid)));
                    if (allEngaged) {
                        addDiamond(uid, 1);
                        try { await dmUser(uid, '💎 Wochen-Engagement-Bonus\n\nDu hast diese Woche alle Superlinks engagiert. Danke dafür!\n\n💎 +1 Diamant\n\n💎 Guthaben: ' + (d.users[uid].diamonds || 0)); } catch (e) {}
                    }
                }
            }
        } catch (e) { console.log('Wochen-Engagement-Diamant Fehler:', e.message); }

        // Wochen-Mission "Alle Superlinks engagiert" → +500 XP (separat vom +1💎-Bonus oben).
        try { const r = grantWeeklySuperlinkMission(); console.log('Superlink-Mission XP vergeben an', r.granted, 'User'); } catch (e) { console.log('Superlink-Mission XP Fehler:', e.message); }

        // weeklyXP wird hier NICHT resettet — Reset läuft Montag 00:05 (wochenReset).
        try { await runWochenGewinnspielRankingDM(); } catch (e) {}
        return { ok: true, winnerId, winnerName, teilnehmer: teilnehmer.length };
    } catch (e) {
        console.log('Wochen-Gewinnspiel Fehler:', e.message);
        return { ok: false, error: e.message };
    }
}

// Weekly-Ranking-Übersicht an alle gestarteten Nicht-Admins (in-app DM, kein Telegram).
async function runWochenGewinnspielRankingDM() {
    const sorted = Object.entries(d.weeklyXP || {}).filter(([uid]) => d.users[uid] && !istAdminId(uid)).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return;
    const badges = ['🥇', '🥈', '🥉'];
    for (const [uid] of Object.entries(d.users || {})) {
        if (!d.users[uid].started || istAdminId(uid)) continue;
        const rank = sorted.findIndex(([id]) => id === uid);
        if (rank === -1) continue;
        const xp = d.weeklyXP[uid] || 0;
        const u = d.users[uid];
        let text = '📆 Wochen-Ranking\n\n';
        text += (rank < 3 ? badges[rank] : '#' + (rank + 1)) + ' Platz ' + (rank + 1) + ' von ' + sorted.length + '\n';
        text += '⭐ ' + xp + ' XP diese Woche\n\n🏆 Top 3:\n';
        sorted.slice(0, 3).forEach(([tid, txp], i) => { text += badges[i] + ' ' + d.users[tid].name + '  ·  ' + txp + ' XP\n'; });
        text += '\n🔥 Weiter so, ' + u.name + '!';
        try { await dmUser(uid, text); } catch (e) {}
    }
}

// ── Daily-Streak: zählt aufeinanderfolgende aktive Tage (Retention-Anker). ──
// Wird beim ersten echten App-Request pro Tag aufgerufen. Liefert Streak-Stand zurück.
// dayKey = lokaler Tag (Server-TZ, wie restliche toDateString-Logik der App).
function touchStreakApi({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, streak: 0 };
    const today = new Date().toDateString();
    if (u.streakLastDay === today) {
        return { ok: true, streak: u.streakDays || 1, alreadyToday: true };
    }
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (u.streakLastDay === yesterday) {
        u.streakDays = (u.streakDays || 0) + 1;       // Tag in Folge → +1
    } else {
        u.streakDays = 1;                              // Lücke (oder erster Tag) → Neustart
    }
    u.streakLastDay = today;
    if ((u.streakDays || 0) > (u.streakBest || 0)) u.streakBest = u.streakDays;
    return { ok: true, streak: u.streakDays, best: u.streakBest || u.streakDays, isNew: true };
}
// Reines Lesen des aktuellen Streak-Stands (für Feed-Anzeige), ohne zu mutieren.
// Berücksichtigt: wenn letzter aktiver Tag älter als gestern → Streak ist faktisch 0.
function getStreakApi(uid) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u || !u.streakLastDay) return { streak: 0, best: u?.streakBest || 0 };
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (u.streakLastDay === today || u.streakLastDay === yesterday) {
        return { streak: u.streakDays || 0, best: u.streakBest || 0, activeToday: u.streakLastDay === today };
    }
    return { streak: 0, best: u.streakBest || 0 };
}

// ════════════════════════════════════════════════════════════════════════════
// REFERRAL-SYSTEM — belohnt langfristige Aktivität eingeladener Creator, nicht
// nur Registrierungen. Jeder Meilenstein zahlt EINMALIG an den Einlader.
// ════════════════════════════════════════════════════════════════════════════
const REFERRAL_MILESTONES = {
    signup:    { dia: 100, label: 'Registrierung' },
    m1:        { dia: 15,  label: 'Mission 1 (5 Reels engagiert)' },
    firstPost: { dia: 30,  label: 'Erster Beitrag' },
    likes50:   { dia: 30,  label: '50 Likes vergeben' },
    likes200:  { dia: 50,  label: '200 Likes vergeben' },
    active7:   { dia: 50,  label: '7 Tage aktiv' },
    active15:  { dia: 100, label: '15 Tage aktiv' },
    active30:  { dia: 250, label: '30 Tage aktiv' },
};
// Eingeladener gilt als "aktiv" (Ranking/Badges), sobald er Engagement zeigte:
// Mission 1 (5 Reels engagiert) ODER 1 Post ODER 7-Tage-Meilenstein → +1 beim Builder.
function _referralInviteeIsActive(inv) {
    if (!inv) return false;
    if (inv.banned || inv.parent_uid) return false;
    return !!(inv.refMilestones && (inv.refMilestones.m1 || inv.refMilestones.firstPost || inv.refMilestones.active7));
}
// Einen eindeutigen Referral-Code für einen User sicherstellen (kurz, URL-tauglich).
function ensureReferralCode(uid) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return null;
    if (u.refCode) return u.refCode;
    if (!d.refCodeIndex) d.refCodeIndex = {}; // code → uid
    let code;
    let attempts = 0;
    do {
        code = 'cb' + Math.random().toString(36).slice(2, 8); // z.B. cb7f3k9a
        attempts++;
    } while (d.refCodeIndex[code] && attempts < 50);
    u.refCode = code;
    d.refCodeIndex[code] = uid;
    return code;
}
// Beim Signup: Verknüpfung Einlader↔Eingeladener dauerhaft speichern + Signup-Meilenstein.
// refCode = Code des Einladers. inviteeUid = neuer User. Robust gegen Selbst-/Doppel-Referral.
function linkReferral(refCode, inviteeUid) {
    refCode = String(refCode || '').trim().toLowerCase();
    inviteeUid = String(inviteeUid || '');
    if (!refCode || !inviteeUid) return { ok: false };
    if (!d.refCodeIndex) d.refCodeIndex = {};
    const inviterUid = d.refCodeIndex[refCode];
    const invitee = d.users[inviteeUid];
    if (!inviterUid || !invitee) return { ok: false };
    if (String(inviterUid) === inviteeUid) return { ok: false }; // kein Selbst-Referral
    if (invitee.referredBy) return { ok: false };                // schon verknüpft (dauerhaft)
    if (getRootUid(inviterUid) === getRootUid(inviteeUid)) return { ok: false }; // keine eigene Familie
    invitee.referredBy = String(inviterUid);
    invitee.refMilestones = {};                                  // pro-Invitee Meilenstein-Tracking
    const inviter = d.users[inviterUid];
    if (inviter) { if (!Array.isArray(inviter.referrals)) inviter.referrals = []; if (!inviter.referrals.includes(inviteeUid)) inviter.referrals.push(inviteeUid); }
    // Anti-Trick: signup-Belohnung NICHT sofort — erst wenn der Eingeladene einen
    // Instagram-Username setzt (= echter Creator, kein leerer Fake-Account). Trigger in
    // updateProfileApi via checkReferralSignup. Falls der Insta-Handle schon gesetzt ist
    // (Race/Reviewer), gleich vergeben.
    if (invitee.instagram) grantReferralMilestone(inviteeUid, 'signup');
    return { ok: true, inviterUid };
}
// Zentraler Meilenstein-Trigger: zahlt EINMALIG an den Einlader des inviteeUid.
// Idempotent über invitee.refMilestones[key]. Gesperrte Einlader bekommen nichts.
function grantReferralMilestone(inviteeUid, key) {
    inviteeUid = String(inviteeUid || '');
    const invitee = d.users[inviteeUid];
    const ms = REFERRAL_MILESTONES[key];
    if (!invitee || !ms || !invitee.referredBy) return false;
    if (invitee.refRejected) return false;                        // Admin hat abgelehnt → nie belohnen
    // Verifizierungs-Pflicht: keine Belohnung bevor der Admin die Einladung bestätigt hat.
    // (referralPending[uid].status === 'approved'). Vor Bestätigung kein einziger Meilenstein.
    const _pend = d.referralPending && d.referralPending[inviteeUid];
    if (!_pend || _pend.status !== 'approved') return false;
    if (!invitee.refMilestones) invitee.refMilestones = {};
    if (invitee.refMilestones[key]) return false;                // schon vergeben
    const inviter = d.users[String(invitee.referredBy)];
    if (!inviter || inviter.banned) return false;                // Einlader gesperrt → kein Reward
    invitee.refMilestones[key] = Date.now();
    inviter.refDiamondsEarned = (inviter.refDiamondsEarned || 0) + ms.dia;
    addDiamond(String(invitee.referredBy), ms.dia);
    const invName = invitee.spitzname || invitee.name || 'Dein eingeladener Creator';
    try { sendInAppDM(String(invitee.referredBy), '💎 Referral-Belohnung\n\n' + invName + ' hat einen Meilenstein erreicht: ' + ms.label + '\n\n💎 +' + ms.dia + ' Diamanten für dich\n\nDanke fürs Einladen!'); } catch (e) {}
    try { _checkBuilderRankUp(String(invitee.referredBy)); } catch (e) {}
    return true;
}
// Prüft die aktivitätsbasierten Meilensteine eines eingeladenen Users (Likes + aktive Tage).
// Wird nach Like / Post / Login-Tag aufgerufen. Günstig: nur wenn referredBy gesetzt.
function checkReferralProgress(inviteeUid) {
    inviteeUid = String(inviteeUid || '');
    const invitee = d.users[inviteeUid];
    if (!invitee || !invitee.referredBy) return;
    const likes = Number(invitee.appLikeCount || 0);
    // Retroaktiv: firstPost/m1 nachholen, falls der Eingeladene schon gepostet/engagiert hat
    // BEVOR der Admin die Einladung freigab (sonst geht der Kredit verloren — grantReferralMilestone
    // greift vor Freigabe nicht, und früher wurde hier nur likes/active7 nachgezogen). Idempotent.
    if ((invitee.links || 0) >= 1) grantReferralMilestone(inviteeUid, 'firstPost');
    if (likes >= 5) grantReferralMilestone(inviteeUid, 'm1');
    if (likes >= 50)  grantReferralMilestone(inviteeUid, 'likes50');
    if (likes >= 200) grantReferralMilestone(inviteeUid, 'likes200');
    const days = Number(invitee.refActiveDays || 0);
    if (days >= 7)  grantReferralMilestone(inviteeUid, 'active7');
    if (days >= 15) grantReferralMilestone(inviteeUid, 'active15');
    if (days >= 30) grantReferralMilestone(inviteeUid, 'active30');
}
// Aktiven Tag für einen eingeladenen User zählen (gesammelt, mit Lücken). 1×/Tag.
function touchReferralActiveDay(inviteeUid) {
    inviteeUid = String(inviteeUid || '');
    const invitee = d.users[inviteeUid];
    if (!invitee || !invitee.referredBy) return;
    const today = new Date().toDateString();
    if (invitee.refActiveLastDay === today) return;
    invitee.refActiveLastDay = today;
    invitee.refActiveDays = (Number(invitee.refActiveDays || 0)) + 1;
    checkReferralProgress(inviteeUid);
}
// Anti-Trick Clawback: wird ein eingeladener User gebannt, werden die für ihn an den
// Einlader gezahlten Referral-Diamanten zurückgezogen (so weit vorhanden, nie negativ).
// Idempotent über invitee.refClawedBack. Schreckt Fake-Account-Betrug ab.
function clawbackReferral(inviteeUid) {
    inviteeUid = String(inviteeUid || '');
    const invitee = d.users[inviteeUid];
    if (!invitee || !invitee.referredBy || invitee.refClawedBack) return;
    const inviter = d.users[String(invitee.referredBy)];
    if (!inviter) { invitee.refClawedBack = true; return; }
    let total = 0;
    const ms = invitee.refMilestones || {};
    for (const key of Object.keys(ms)) { if (ms[key] && REFERRAL_MILESTONES[key]) total += REFERRAL_MILESTONES[key].dia; }
    if (total > 0) {
        inviter.diamonds = Math.max(0, Number(inviter.diamonds || 0) - total);
        inviter.refDiamondsEarned = Math.max(0, Number(inviter.refDiamondsEarned || 0) - total);
        try { sendInAppDM(String(invitee.referredBy), '⚠️ Referral-Korrektur\n\nEin von dir eingeladener Account wurde gesperrt.\n\n💎 −' + total + ' Diamanten (Belohnungen zurückgezogen)'); } catch (e) {}
    }
    invitee.refClawedBack = true;
}
// ── Referral-Verifizierung: Admin bestätigt eine eingeladene Registrierung, bevor die
// signup-Belohnung fließt. Anfrage entsteht, sobald der Eingeladene seinen Insta-Handle setzt.
// d.referralPending[inviteeUid] = { inviterUid, instagram, createdAt, status }
function requestReferralVerification(inviteeUid) {
    inviteeUid = String(inviteeUid || '');
    const invitee = d.users[inviteeUid];
    if (!invitee || !invitee.referredBy || !invitee.instagram) return;
    if (invitee.refMilestones && invitee.refMilestones.signup) return; // schon belohnt
    if (!d.referralPending) d.referralPending = {};
    const ex = d.referralPending[inviteeUid];
    if (ex && (ex.status === 'pending' || ex.status === 'approved')) {
        // nur Insta aktualisieren, falls geändert
        if (ex.status === 'pending') ex.instagram = invitee.instagram;
        return;
    }
    const _inviter = d.users[String(invitee.referredBy)] || {};
    const _inviterName = _inviter.spitzname || _inviter.name || '(kein Name)';
    const _inviterInsta = _inviter.instagram || '';
    d.referralPending[inviteeUid] = {
        inviterUid: String(invitee.referredBy),
        inviterName: _inviterName,
        inviterInstagram: _inviterInsta,
        instagram: invitee.instagram,
        inviteeName: invitee.spitzname || invitee.name || 'User',
        createdAt: Date.now(),
        status: 'pending',
    };
    // Admin-DM an alle Admins — Einlader UND Eingeladenen klar benennen (Name + Handle + ID),
    // damit der Admin sofort sieht, WER eingeladen hat (nicht nur das Wort „Einlader").
    const admins = Array.isArray(d._adminIds) ? d._adminIds.map(String) : [];
    const _dm = '🔎 Referral-Prüfung nötig\n\n'
        + '👤 Einlader: ' + _inviterName + (_inviterInsta ? ' · @' + _inviterInsta : '') + '\n   ID: ' + String(invitee.referredBy) + '\n\n'
        + '🎯 Eingeladen: ' + (invitee.spitzname || invitee.name || 'User') + (invitee.instagram ? ' · @' + invitee.instagram : '') + '\n\n'
        + 'Prüfen + bestätigen im Dashboard → Referral-Prüfungen.';
    for (const aid of admins) {
        try { sendInAppDM(aid, _dm); } catch (e) {}
    }
}
// Admin bestätigt → signup-Belohnung wird vergeben. Setzt Status auf approved.
function approveReferral(inviteeUid) {
    inviteeUid = String(inviteeUid || '');
    if (!d.referralPending || !d.referralPending[inviteeUid]) return { ok: false, error: 'Keine offene Prüfung' };
    const p = d.referralPending[inviteeUid];
    if (p.status === 'approved') return { ok: false, error: 'Bereits bestätigt' };
    p.status = 'approved'; p.decidedAt = Date.now();
    const granted = grantReferralMilestone(inviteeUid, 'signup');
    // Auch nachgelagerte Meilensteine prüfen, falls der User schon Likes/Tage gesammelt hat.
    try { checkReferralProgress(inviteeUid); } catch (e) {}
    return { ok: true, granted };
}
// Admin lehnt ab → keine Belohnung, Verknüpfung wird gelöst (kein weiterer Reward).
function rejectReferral(inviteeUid) {
    inviteeUid = String(inviteeUid || '');
    if (!d.referralPending || !d.referralPending[inviteeUid]) return { ok: false, error: 'Keine offene Prüfung' };
    d.referralPending[inviteeUid].status = 'rejected';
    d.referralPending[inviteeUid].decidedAt = Date.now();
    const invitee = d.users[inviteeUid];
    if (invitee) { invitee.refRejected = true; } // blockt künftige Belohnungen (grant prüft das)
    return { ok: true };
}
// Liste offener Prüfungen fürs Admin-Dashboard.
function referralPendingListApi() {
    const out = [];
    const all = d.referralPending || {};
    for (const [iid, p] of Object.entries(all)) {
        if (!p || p.status !== 'pending') continue;
        const inv = d.users[iid] || {};
        const inviter = d.users[String(p.inviterUid)] || {};
        out.push({
            inviteeUid: String(iid), inviteeName: p.inviteeName || inv.spitzname || inv.name || 'User',
            instagram: p.instagram || inv.instagram || '',
            inviterUid: String(p.inviterUid),
            inviterName: inviter.spitzname || inviter.name || p.inviterName || ('User ' + p.inviterUid),
            inviterInstagram: inviter.instagram || p.inviterInstagram || '',
            createdAt: p.createdAt || 0,
        });
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { ok: true, pending: out };
}
// Komplette „Wer hat wen eingeladen"-Übersicht fürs Dashboard.
// Listet JEDEN Einlader (auch Sub-Accounts — eigenständige Builder) mit allen
// von ihm Eingeladenen + Status (bestätigt/offen/abgelehnt/verknüpft) + aktiv?.
function referralOverviewApi() {
    const _status = (inv, iid) => {
        if (!inv) return 'unbekannt';
        if (inv.refRejected) return 'rejected';
        const p = d.referralPending && d.referralPending[String(iid)];
        if (p && p.status === 'approved') return 'approved';
        if (p && p.status === 'pending') return 'pending';
        if (p && p.status === 'rejected') return 'rejected';
        return 'linked'; // verknüpft, aber (noch) keine Insta-Prüfung angefordert
    };
    const inviters = [];
    let totalInvites = 0, totalActive = 0;
    for (const [uid, u] of Object.entries(d.users || {})) {
        const ids = Array.isArray(u.referrals) ? u.referrals : [];
        if (!ids.length) continue;
        const invitees = [];
        let activeCount = 0;
        for (const iid of ids) {
            const inv = d.users[String(iid)];
            const active = _referralInviteeIsActive(inv);
            if (active) activeCount++;
            const ms = (inv && inv.refMilestones) ? Object.keys(inv.refMilestones).length : 0;
            invitees.push({
                uid: String(iid),
                name: (inv && (inv.spitzname || inv.name)) || ('User ' + iid),
                instagram: (inv && inv.instagram) || '',
                status: _status(inv, iid),
                active,
                milestones: ms,
                banned: !!(inv && inv.banned),
                joinedAt: (inv && (inv.joinDate || inv.joined)) || 0,
            });
        }
        invitees.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
        const badge = communityBuilderBadge(activeCount);
        totalInvites += ids.length; totalActive += activeCount;
        inviters.push({
            uid: String(uid),
            name: u.spitzname || u.name || ('User ' + uid),
            instagram: u.instagram || '',
            isSub: !!u.parent_uid,
            invited: ids.length,
            active: activeCount,
            diamonds: Number(u.refDiamondsEarned || 0),
            builderEmoji: badge ? badge.emoji : '',
            builderLabel: badge ? badge.label : '',
            invitees,
        });
    }
    inviters.sort((a, b) => (b.active - a.active) || (b.invited - a.invited));
    return { ok: true, inviters, totalInviters: inviters.length, totalInvites, totalActive };
}
// Alle Einladungen der gesamten Account-Familie (Haupt + alle Subs) sammeln + dedupen.
// Referral-Statistik für den Profilbereich des Einladers — PRO ACCOUNT (jeder Sub ist ein
// eigenständiger Builder; Sub-Einladungen rollen NICHT auf den Hauptaccount hoch).
function referralStatsApi(uid) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false };
    const ids = Array.isArray(u.referrals) ? u.referrals : [];
    let active = 0;
    for (const iid of ids) { if (_referralInviteeIsActive(d.users[String(iid)])) active++; }
    return { ok: true, code: u.refCode || ensureReferralCode(uid), invited: ids.length, active, diamonds: Number(u.refDiamondsEarned || 0) };
}
// Community-Builder-Badge nach Anzahl AKTIVER Einladungen.
function communityBuilderBadge(activeCount) {
    if (activeCount >= 25) return { tier: 4, label: 'Community Builder Elite', emoji: '🏛️', dailyDiamonds: 100 };
    if (activeCount >= 10) return { tier: 3, label: 'Community Builder III', emoji: '🏗️', dailyDiamonds: 50 };
    if (activeCount >= 5)  return { tier: 2, label: 'Community Builder II', emoji: '🤝', dailyDiamonds: 15 };
    if (activeCount >= 1)  return { tier: 1, label: 'Community Builder I', emoji: '🌱', dailyDiamonds: 5 };
    return null;
}
// Aktive Einladungszahl eines EINZELNEN Accounts (pro Account, Subs eigenständig).
function _builderActiveCount(uid) {
    const u = d.users[String(uid || '')];
    if (!u || !Array.isArray(u.referrals)) return 0;
    let n = 0;
    for (const iid of u.referrals) { if (_referralInviteeIsActive(d.users[String(iid)])) n++; }
    return n;
}
// Builder-Badge eines Accounts (für Anzeige überall: Profil, Karten, Liker-Listen). null = keiner.
function builderBadgeFor(uid) {
    return communityBuilderBadge(_builderActiveCount(uid));
}
// Kompaktes Emoji für Inline-Anzeige (oder '' wenn kein Rang).
function _bldEmoji(uid) {
    const b = builderBadgeFor(uid);
    return b ? b.emoji : '';
}
// Rang-Aufstieg erkennen → Notification (Glocke) + DM, einmalig pro erreichter Stufe.
function _checkBuilderRankUp(uid) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return;
    const badge = builderBadgeFor(uid);
    const newTier = badge ? badge.tier : 0;
    const oldTier = Number(u.cbTier || 0);
    if (newTier > oldTier) {
        u.cbTier = newTier;
        try { addNotification(uid, '🏆', 'Neuer Rang: ' + badge.emoji + ' ' + badge.label + ' — du bekommst jetzt +' + badge.dailyDiamonds + ' 💎 pro Tag!'); } catch (e) {}
        try { sendInAppDM(uid, '🏆 Rang aufgestiegen!\n\nDu bist jetzt ' + badge.emoji + ' ' + badge.label + '.\n\n💎 +' + badge.dailyDiamonds + ' Diamanten pro Tag (solange du diesen Rang hältst)\n\nWeiter so — lade aktive Creator ein und steig noch höher!'); } catch (e) {}
    } else if (newTier !== oldTier) {
        u.cbTier = newTier; // Abstieg still mitführen (kein Spam)
    }
}
// Community-Builder-Ranking: User sortiert nach Anzahl aktiver Einladungen.
function communityBuilderRanking(limit) {
    const rows = [];
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || istAdminId(uid)) continue; // Subs ZÄHLEN als eigene Builder (kein parent_uid-Skip)
        const ids = Array.isArray(u.referrals) ? u.referrals : [];
        if (!ids.length) continue;
        let active = 0;
        for (const iid of ids) { if (_referralInviteeIsActive(d.users[String(iid)])) active++; }
        if (active <= 0) continue;
        rows.push({ uid: String(uid), name: u.spitzname || u.name || 'Creator', instagram: u.instagram || '', active, invited: ids.length });
    }
    rows.sort((a, b) => b.active - a.active);
    return rows.slice(0, Number(limit) || 50);
}
// Tägliche Community-Builder-Belohnung: zahlt jedem User mit Builder-Rang die
// rangabhängige Diamanten-Belohnung (5/15/50/100 💎) genau 1× pro Tag aus.
// dayKey = z.B. '2026-05-30'. cbDailyLastDay verhindert Doppelzahlung; Admins,
// gebannte, pausierte und Sub-Accounts werden übersprungen.
function payCommunityBuilderDaily(dayKey) {
    const day = String(dayKey || new Date().toISOString().slice(0, 10));
    let paidUsers = 0, paidDiamonds = 0;
    for (const [uid, u] of Object.entries(d.users || {})) {
        if (!u || u.banned || u.paused || istAdminId(uid)) continue; // Subs ZÄHLEN als eigene Builder
        if (u.cbDailyLastDay === day) continue; // heute schon ausgezahlt
        const ids = Array.isArray(u.referrals) ? u.referrals : [];
        if (!ids.length) continue;
        let active = 0;
        for (const iid of ids) { if (_referralInviteeIsActive(d.users[String(iid)])) active++; }
        const badge = communityBuilderBadge(active);
        if (!badge || !badge.dailyDiamonds) continue;
        addDiamond(uid, badge.dailyDiamonds);
        u.cbDailyLastDay = day;
        u.cbDailyTotal = Number(u.cbDailyTotal || 0) + badge.dailyDiamonds;
        paidUsers++; paidDiamonds += badge.dailyDiamonds;
    }
    return { ok: true, paidUsers, paidDiamonds, day };
}

module.exports = {
    init, setThumbnailFetcher, setBildSaver,
    REFERRAL_MILESTONES,
    ensureReferralCode, linkReferral, grantReferralMilestone, checkReferralProgress,
    touchReferralActiveDay, referralStatsApi, communityBuilderBadge, communityBuilderRanking, payCommunityBuilderDaily, clawbackReferral, builderBadgeFor,
    requestReferralVerification, approveReferral, rejectReferral, referralPendingListApi, referralOverviewApi,
    touchStreakApi, getStreakApi,
    updateProfileApi, addProjectApi, updateProjectApi, deleteProjectApi, completeProfileApi, engagePinnedPostApi,
    followApi,
    addWarn, removeWarn, resetUser, removeXp, startXpEvent, startDiamondEvent, stopEvent,
    banUserApi, unbanUserApi, pauseUserApi, unpauseUserApi, adminSuspendPostingApi,
    mergeUsers, deleteUser, userDeleteSelfApi, deletedUsersListApi, restoreDeletedUserApi,
    sendMessageApi, sendDmSingleApi, adminPostfachReply, markMessagesRead, editMessageApi, deleteDmApi, reactDmMsgApi,
    appChatSend, appChatMarkRead, appChatDelete, appChatReact, getAppChat,
    mindsetSetAnswerApi, runMindsetPickApi, mindsetAdminPickApi, mindsetAdminSkipApi, mindsetAdminBlastApi, mindsetAdminRestoreApi, isMindsetLocked,
    helperChatAppendApi, helperQuestionApi, adminHelperAnswerApi,
    auswertenForUserDay, missionenAuswerten, backfillMissionenSinceMonday, thisWeekBackfillDays, applyWarningEscalation, xpBisNaechstesBadge,
    dailyRankingAbschluss, aktivitaetsScore, archiveWeeklyXP, legendenBonus, wochenResetUndAuszahlung,
    zeitCheck, eventAutoTick, linkCleanup, announceEventToAllUsers,
    postLinkFromApp, createPostApi, deletePostApi, deleteLinkApi, commentApi, deleteCommentApi,
    diamondLinkCreate, diamondLinkLike, diamondLinkAcceptRules, diamondLinkAdminDelete,
    prismaLinkCreate, prismaLinkLike, prismaLinkAcceptRules, prismaLinkAdminDelete,
    adminLinkCreate, adminLinkEngage, adminLinkAdminDelete, adminLinkFeedCard, adminLinkListApi,
    collabCreatePost, collabLikePost, getBerlinWeekKey,
    postSuperlinkApp, likeSuperlinkApi, isSuperLinkPostingAllowed,
    grantWeeklySuperlinkMission,
    addXp, addExtraLink, addSuperlink, addDiamonds, removeDiamonds,
    buyItemApi, setActiveRingApi, setActiveTitleApi, buyExtralinkApi, linkStatusApi,
    // Like-Flow + Kern (verbatim portiert):
    likeFromApp, xpAdd, xpAddMitDaily, xpAddNurGesamt, badge, level, user,
    istAdminId, getRootUid, isSubAccount, weekStart,
    getMission, updateMissionProgress, checkMissionen, missionStatusApi, familyUids,
    istInstagramLink, addDiamond, applyPostBonus,
    sendInAppDM, addNotification, dmUser, sendCreatorBoostDM, ensureCreatorBoostUser, _tidyStoredCreatorBoostDMs, migrateDataOnBoot,
    logActivity, getCommunityActivity, getCreatorSpotlight,
    badgeBonusLinks, generateSyntheticLinkId, tryFetchThumbnail,
    M3_CAP, CREATORBOOST_UID,
    authEmailPassword, setUserPasswordApi, setAppCodeApi, createEmailUserApi,
    hashPasswordPBKDF2, verifyPasswordPBKDF2,
    diamondLinkFeedApi, prismaLinkFeedApi, collabFeedApi, collabListApi, mindsetStateApi,
    pinPostApi, markNotificationsReadApi, blockUserApi, unblockUserApi,
    collabRequestApi, collabRespondApi, collabAcceptFeedRulesApi,
    addNewsletterApi, editNewsletterApi, deleteNewsletterApi,
    sendDmAllApi, createSubaccountApi, adminLinkAsSubApi, deleteSubaccountApi,
    reportUserApi, adminReportActionApi, adminScheduleEventApi,
    superlinksApi, helperChatHistoryApi, eventsStatusApi, userDataExportApi,
    adminStatsApi, adminUserlistApi, adminUserDetailApi, adminFunnelDebugApi, trackFunnelApi, adminEngagementLogApi,
    adminMissionReportApi, adminHelperQuestionsApi, diamondLinkAdminListApi, prismaLinkAdminListApi,
    runWochenGewinnspielApi,
};
