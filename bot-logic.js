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
// Web-Push entfällt im Logik-Modul (kein Zustand) — Verdrahtung übernimmt der Server.
function sendCreatorBoostDM(toUid, text, options = {}) {
    ensureCreatorBoostUser();
    if (!d.messages) d.messages = {};
    const chatKey = [CREATORBOOST_UID, String(toUid)].sort().join('_');
    if (!d.messages[chatKey]) d.messages[chatKey] = [];
    const msg = { from: CREATORBOOST_UID, to: String(toUid), text: String(text || '').slice(0, 1000), timestamp: Date.now(), read: false };
    if (options.link?.url) {
        msg.link = { url: String(options.link.url).slice(0, 500), label: String(options.link.label || 'Öffnen').slice(0, 60) };
    }
    d.messages[chatKey].push(msg);
    if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    addNotification(String(toUid), '💬', 'CreatorBoost: ' + String(text || '').slice(0, 40), CREATORBOOST_UID);
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
    d.messages[chatKey].push({
        from: CREATORBOOST_UID, to: String(toUid),
        text: String(text || '').slice(0, 2000),
        image: null, audio: null,
        timestamp: Date.now(), read: false, system: true,
    });
    if (d.messages[chatKey].length > 200) d.messages[chatKey].shift();
    addNotification(String(toUid), '💬', 'CreatorX: ' + String(text || '').slice(0, 40), CREATORBOOST_UID);
    return true;
}
async function dmUser(uid, text) {
    if (isSubAccount(uid)) return;
    const plain = String(text || '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1');
    sendInAppDM(uid, plain);
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
    if (role === '💎 Legende') return '\n\n💎 *Legenden-Bonus:* Du bekommst alles von Elite+ *PLUS* +30 Diamanten jeden Monat, einen Legenden-Glow ums Profilbild und den LEGENDE-Title!';
    if (role === '🌟 Elite+') return '\n\n🌟 *Elite+ Bonus:* Du erhältst jetzt 2 Superlinks pro Woche + 1 Bonus-Link/Woche!';
    if (role === '👑 Elite') return '\n\n👑 *Elite Bonus:* Du erhältst jetzt 1 Bonus-Link pro Woche extra!';
    return '';
}
function _badgeUpDM(uid, u, alteBadge) {
    if (alteBadge !== u.role && u.role) {
        if (!u.trophies) u.trophies = [];
        const trophy = _trophyMap[u.role];
        if (trophy && !u.trophies.includes(trophy)) u.trophies.push(trophy);
        dmUser(uid, '🎉 *Badge Aufstieg!*\n\n' + alteBadge + ' → ' + u.role + '\n\n━━━━━━━━━━━━━━\n⭐ ' + u.xp + ' XP\n━━━━━━━━━━━━━━\n\nWeiter so! 💪' + _levelUpExtra(u.role)).catch(() => {});
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
    const heuteLinks = Object.values(d.links).filter(l =>
        istInstagramLink(l.text) && new Date(l.timestamp).toDateString() === heute && String(getRootUid(l.user_id)) !== String(getRootUid(uid))
    );
    heuteLinks.forEach(l => { if (!l.likes) l.likes = new Set(); });
    const gesamt = heuteLinks.length;
    const geliked = heuteLinks.filter(l => l.likes.has(String(uid))).length;
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
        try { await dmUser(uid, '🎯 *Mission 1 erreicht!*\n\n✅ 5 Links geliked!\n\n━━━━━━━━━━━━━━\n⏳ XP gibt es um 12:00 Uhr'); } catch (e) {}
    }
    speichernDebounced();
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
        try { sendInAppDM(uid, '🌟 +20 XP First-Post-Bonus!\n\nDu hast den allerersten Post eines neuen Members geliked — vielen Dank fürs Support! +20 XP extra.'); } catch (e) {}
    }
    if (!istAdminId(uid) && u) {
        u.totalLikes = (u.totalLikes || 0) + 1;
        u.appLikeCount = (u.appLikeCount || 0) + 1;
        if (u.appLikeCount % 100 === 0) {
            addDiamond(uid, 1);
            dmUser(uid, `💎 *${u.appLikeCount} Likes via App!*\n\nDu hast +1 Diamant verdient. Aktuell: ${u.diamonds || 0} 💎`).catch(() => {});
        }
    }
    if (!istAdminId(uid) && u) {
        const _evtBonusL = applyPostBonus(uid, u.name || 'User');
        if (_evtBonusL.events.length) {
            const parts = _evtBonusL.events.map(e => e.type === 'diamond' ? ('+' + e.amount + ' 💎') : e.type === 'xp' ? ('+' + e.amount + ' XP') : '').filter(Boolean);
            if (parts.length) { try { sendInAppDM(uid, '🎉 Event-Bonus für deinen Like!\n\n' + parts.join(' · ') + '\n\nLäuft noch — like weiter!'); } catch (e) {} }
        }
    }
    const mission = getMission(uid);
    updateMissionProgress(uid);
    if (istHeutigerLinkApp && istInstagramLink(lnk.text)) mission.likesGegeben++;
    await checkMissionen(uid, u?.name || 'User');

    return { ok: true, liked: true, likes: lnk.likes.size };
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
        chat_id: Number(process.env.GROUP_A_ID),
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
        const linkRules = '✅ Dein Link ist gepostet!\n\n' +
            '📋 *Link-Regeln (kurz):*\n' +
            '• 1 Link pro Tag (Bonus-Links optional)\n' +
            '• Andere Links musst du liken (Mission M1: 5 Likes/Tag)\n' +
            '• Erst Insta-Reel öffnen, dann liken (Visit-before-Like)\n' +
            '• 2-Wort-Kommentar = Pflicht (M2/M3 Missionen)\n' +
            '• Mission-Auswertung 12:00 — sonst Verwarnung';
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
        try { sendInAppDM(uid, '🌟 Willkommen — dein erster Post ist live!\n\n+20 XP Welcome-Bonus erhalten.\nDein Post wird 8h lang ganz oben im Heute-Feed gepinned. Liker bekommen +20 XP extra.'); } catch (e) {}
    }

    const _evtBonus = applyPostBonus(uid, u.name || name);
    if (_evtBonus.events.length) {
        const parts = _evtBonus.events.map(e => e.type === 'diamond' ? ('+' + e.amount + ' 💎') : e.type === 'xp' ? ('+' + e.amount + ' XP') : '').filter(Boolean);
        if (parts.length) { try { sendInAppDM(uid, '🎉 Event-Bonus für deinen Post!\n\n' + parts.join(' · ') + '\n\nLäuft noch — postet weiter!'); } catch (e) {} }
    }

    const mission = getMission(uid);
    if (istInstagramLink(url)) mission.linksGepostet++;
    await checkMissionen(uid, u.name || name);

    return { ok: true, msgId: linkId };
}

module.exports = {
    init, setThumbnailFetcher,
    postLinkFromApp,
    // Like-Flow + Kern (verbatim portiert):
    likeFromApp, xpAdd, xpAddMitDaily, xpAddNurGesamt, badge, level, user,
    istAdminId, getRootUid, isSubAccount, weekStart,
    getMission, updateMissionProgress, checkMissionen,
    istInstagramLink, addDiamond, applyPostBonus,
    sendInAppDM, addNotification, dmUser, sendCreatorBoostDM, ensureCreatorBoostUser,
    badgeBonusLinks, generateSyntheticLinkId, tryFetchThumbnail,
    M3_CAP, CREATORBOOST_UID,
};
