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

function getWochenMission(uid) {
    if (!d.wochenMissionen[uid]) d.wochenMissionen[uid] = { m1Tage: 0, m2Tage: 0, m3Tage: 0, letzterTag: null };
    return d.wochenMissionen[uid];
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

// ── Community-Post: 1:1 aus POST /create-post-api ──
function createPostApi({ uid, text, attachment, attachmentType }) {
    if (!uid || (!text && !attachment)) return { ok: false };
    if (!d.posts) d.posts = {};
    if (!d.posts[uid]) d.posts[uid] = [];
    const post = { text: (text || '').slice(0, 300), timestamp: Date.now(), likes: [] };
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
// ── Kommentar: 1:1 aus POST /comment-api ──
function commentApi({ uid, name, linkId, text }) {
    if (!uid || !text || !linkId) return { ok: false };
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
    if (!uid || !postId || !d.comments?.[postId]) return { ok: false };
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

function _reasonLabel(r) {
    if (r === 'roulette') return '🎡 Roulette';
    if (r === 'daily-bonus') return '🎁 Daily Bonus';
    if (r === 'gewinnspiel') return '🏆 Gewinnspiel';
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
        try { dmUser(uid, `✨ *+${amount} XP*\n\n${_reasonLabel(reason)}\n⭐ Aktuell: ${u.xp} XP`); } catch (e) {}
    }
    return { ok: true, newXp: u.xp };
}

// ── Diamanten / Shop / Extra-Links: 1:1 aus den Bot-Endpoints ──
function addExtraLink({ uid, reason }) {
    uid = String(uid || '');
    if (!uid || !d.users[uid]) return { ok: false, error: 'User nicht gefunden' };
    if (!d.bonusLinks) d.bonusLinks = {};
    d.bonusLinks[uid] = (d.bonusLinks[uid] || 0) + 1;
    try { dmUser(uid, `🔗 *+1 Extra-Link*\n\n${_reasonLabel(reason)}\nVerfügbar: ${d.bonusLinks[uid]} Extra-Links`); } catch (e) {}
    return { ok: true };
}
function addSuperlink({ uid, reason }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!uid || !u) return { ok: false, error: 'User nicht gefunden' };
    u.superlinkCredits = (u.superlinkCredits || 0) + 1;
    try { dmUser(uid, `⚡ *+1 Superlink-Slot*\n\n${_reasonLabel(reason)}\nVerfügbar: ${u.superlinkCredits} Extra-Superlinks`); } catch (e) {}
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
        try { dmUser(uid, `💎 *+${amount} Diamant${amount !== 1 ? 'en' : ''}*\n\n${_reasonLabel(reason)}\nAktuell: ${u.diamonds} 💎`); } catch (e) {}
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
    try { dmUser(uid, `💎 *−${amt} Diamant${amt !== 1 ? 'en' : ''}*\n\n${_reasonLabel(reason)}\nAktuell: ${u.diamonds} 💎`); } catch (e) {}
    return { ok: true, newDiamonds: u.diamonds };
}
const ITEM_PRICES = {
    ring_flame: 8, ring_ocean: 8, ring_gold: 10, ring_purple: 12, ring_rainbow: 15, ring_diamond: 20,
    banner_sunset: 5, banner_peach: 5, banner_mint: 5, banner_forest: 5,
    banner_ocean: 7, banner_sky: 7, banner_lavender: 7, banner_rose: 7,
    banner_gold: 10, banner_candy: 10, banner_coral: 10, banner_aurora: 10,
};
const ITEM_NAMES = {
    ring_flame: '🔥 Flame Ring', ring_ocean: '🌊 Ocean Ring', ring_gold: '✨ Gold Ring', ring_purple: '🔮 Cosmic Ring', ring_rainbow: '🌈 Rainbow Ring', ring_diamond: '💎 Diamond Ring',
    banner_sunset: '🌅 Sunset Banner', banner_ocean: '🌊 Ocean Banner', banner_forest: '🌿 Forest Banner', banner_candy: '🍭 Candy Banner',
    banner_sky: '☁️ Sky Blue Banner', banner_lavender: '💜 Lavender Banner', banner_mint: '🌱 Mint Banner', banner_peach: '🍑 Peach Banner',
    banner_gold: '✨ Golden Hour Banner', banner_coral: '🪸 Coral Banner', banner_aurora: '🌌 Aurora Banner', banner_rose: '🌹 Rose Gold Banner',
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
function setActiveRingApi({ uid, ringId }) {
    if (!uid) return { ok: false };
    const u = d.users[String(uid)];
    if (!u) return { ok: false };
    if (ringId && !(u.inventory || []).includes(ringId)) return { ok: false, error: 'Item nicht im Inventar' };
    u.activeRing = ringId || null;
    return { ok: true, activeRing: u.activeRing };
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
    const canPost = isAdmin || !standardUsed || bonusLinks > 0 || badgeBonus > 0;
    const maxLinks = isAdmin ? 999 : todayCount + (standardUsed ? 0 : 1) + bonusLinks + badgeBonus;
    return { ok: true, todayCount, bonusLinks, badgeBonus, maxLinks, canPost, isAdmin };
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
    if (bio !== undefined) u.bio = bio.slice(0, 100);
    if (spitzname !== undefined) u.spitzname = spitzname.slice(0, 30);
    if (accentColor !== undefined) u.accentColor = accentColor;
    if (body.nische !== undefined) u.nische = body.nische.slice(0, 50);
    if (body.website !== undefined) u.website = body.website.slice(0, 100);
    if (body.tiktok !== undefined) u.tiktok = body.tiktok.replace('@', '').slice(0, 50);
    if (body.youtube !== undefined) u.youtube = body.youtube.replace('@', '').slice(0, 50);
    if (body.twitter !== undefined) u.twitter = body.twitter.replace('@', '').slice(0, 50);
    if (body.instagram !== undefined) u.instagram = String(body.instagram || '').replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 50);
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
    sendInAppDM(engagerUid, '📌 Pinned-Post engagiert\n\nDu hast einen pinned Link engagiert und 1 💎 Diamant erhalten.\n\nDu bestätigst hiermit den Post geliked, kommentiert, geteilt und gespeichert zu haben. Dies wird kontrolliert. Bei Schein-Engagement folgen Sanktionen.\n\nMehr im Explore → Regeln.');
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
                    ? `🎲 *Gleichstand & Verlosung!*\n\nDu und ${othersStr} hattet alle *${xp} XP* und wärt auf ${rankRange} gleichauf.\n\nEine automatische Verlosung nach Aktivität hat stattgefunden — du hast gewonnen! 🎉\n\n🏆 *Dein aktueller Rang: Platz ${myRank}*\nTop ${myRank} Bonus folgt!`
                    : `🎲 *Gleichstand & Verlosung!*\n\nDu und ${othersStr} hattet alle *${xp} XP* und wärt auf ${rankRange} gleichauf.\n\nEine automatische Verlosung nach Aktivität hat stattgefunden — diesmal war ${tiedGroup[0] && tiedGroup[0].uid !== uid ? (d.users[tiedGroup[0].uid]?.spitzname || d.users[tiedGroup[0].uid]?.name || 'ein anderer User') : othersStr} vorne.\n\n📊 *Dein aktueller Rang: Platz ${myRank}*\nMehr Aktivität morgen für einen besseren Platz! 💪`;
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
        try { sendInAppDM(uid, `🎉 *${b.text} im Tagesranking!*\n\nDeine Preise:\n⭐ +${b.xp} XP\n💎 +${b.dia} Diamanten${b.links ? '\n🔗 +1 Extra-Link für morgen' : ''}`); } catch (e) {}
    }
    d.gesternDailyXP = Object.assign({}, d.dailyXP);
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
        try { dmUser(uid, '💎 *Legenden-Bonus*\n\n+30 Diamanten gutgeschrieben!\n\n━━━━━━━━━━━━━━\n💎 Guthaben: ' + u.diamonds + '\n━━━━━━━━━━━━━━\n\nDanke dass du Teil der Legenden-Elite bist! 🌟').catch(() => {}); } catch (e) {}
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
        try { sendInAppDM(uid, `🏆 *${p.medal} Wochen-Ranking gewonnen!*\n\nDu hast diese Woche *${xp} XP* erreicht.\n\n*Deine Preise:*\n💎 +${p.dia} Diamanten\n⭐ +${p.xp} XP\n${p.links ? `🔗 +${p.links} Extra-Link${p.links > 1 ? 's' : ''}\n` : ''}\nGratulation! 🎉`); } catch (e) {}
    }
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
    const reasonText = reason ? '\n\n*Grund:* ' + reason : '';
    if (n === 1 || n === 2) mainText = '⚠️ *Verwarnung ' + n + '/5*' + reasonText + '\n\nDu hast eine Verwarnung erhalten. Schau dass es nicht wieder passiert.';
    else if (n === 3) mainText = '⚠️🚨 *3. VERWARNUNG (' + n + '/5)*' + reasonText + '\n\n*Wichtige Aufklärung:*\n• Bei der **5. Verwarnung** wirst du **automatisch gebannt** — kein manuelles Review.\n• Du kannst Verwarnungen abbauen: **5 Tage in Folge M1 erfüllen** → 1 Warnung weg.\n• Aktive Verwarnungen blocken Belohnungen nicht direkt, aber gefährden deinen Account.\n\nNimm das ernst.';
    else if (n === 4) mainText = '⚠️🚨 *4. VERWARNUNG (' + n + '/5)*' + reasonText + '\n\n*LETZTE Warnung vor dem Bann!*\n• Eine weitere Verwarnung → **automatischer permanenter Bann**.\n• Du kannst 1 Warn abbauen: **5 Tage in Folge M1 erfüllen** → 1 Warnung weg.\n• Lies die Regeln gründlich.\n\nLetzte Chance — nutze sie.';
    else if (n >= 5) mainText = '🚫 *Account permanent gebannt (' + n + '/5 Verwarnungen erreicht)*' + reasonText + '\n\nDu hast die maximale Anzahl an Verwarnungen erreicht und wurdest automatisch aus der Community entfernt.';
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
    const dayInstaLinks = dayLinks.filter(l => istInstagramLink(l.text) && String(getRootUid(l.user_id)) !== String(getRootUid(uid)));
    const gesamtTag = dayInstaLinks.length;
    const gelikedTag = dayInstaLinks.filter(l => l.likes && (l.likes instanceof Set ? l.likes.has(String(uid)) : Array.isArray(l.likes) && l.likes.includes(String(uid)))).length;
    const prozentTag = gesamtTag > 0 ? gelikedTag / gesamtTag : 0;
    const minLinksVorhanden = dayInstaLinks.length >= 5;
    const storedMission = d.missionen?.[uid]?.date === dayKey ? d.missionen[uid] : null;
    const m1Done = gelikedTag >= 5 || (queue.date === dayKey && !!queue.m1Pending) || !!storedMission?.m1;
    const m2Done = gesamtTag > 0 && prozentTag >= 0.8;
    const m3Target = Math.min(M3_CAP, gesamtTag);
    const m3Done = m3Target > 0 && gelikedTag >= m3Target;
    const anyDailyMissionDone = m1Done || m2Done || m3Done;
    if (!anyDailyMissionDone && gesamtTag === 0 && !storedMission) { d.missionAuswertungProUser[idemKey] = Date.now(); return { skipped: 'no-activity' }; }
    let meldungen = [];
    let xpEarned = 0;
    let diamondsEarned = 0;
    if (m1Done) { xpAdd(uid, 5, name); xpEarned += 5; meldungen.push('✅ *Mission 1!*\n5 Links geliked → +5 XP'); }
    if (anyDailyMissionDone && addWeeklyMissionDay(wMission, 'm1Tage', dayKey)) {
        if (wMission.m1Tage >= 7) { xpAdd(uid, 10, name); xpEarned += 10; meldungen.push('🏆 *Wochen-M1!* +10 XP'); wMission.m1Tage = 0; }
    }
    if (m2Done) {
        xpAdd(uid, 5, name); xpEarned += 5;
        meldungen.push('✅ *Mission 2!*\n' + Math.round(prozentTag * 100) + '% geliked → +5 XP');
        if (addWeeklyMissionDay(wMission, 'm2Tage', dayKey)) {
            if (wMission.m2Tage >= 7) { xpAdd(uid, 15, name); xpEarned += 15; addDiamond(uid, 1); diamondsEarned += 1; meldungen.push('🏆 *Wochen-M2!* +15 XP + 💎 1 Diamant'); wMission.m2Tage = 0; }
        }
    }
    if (m3Done) {
        xpAdd(uid, 5, name); xpEarned += 5; addDiamond(uid, 1); diamondsEarned += 1;
        meldungen.push('✅ *Mission 3!*\nAlle Links geliked → +5 XP + 💎 1 Diamant');
        if (addWeeklyMissionDay(wMission, 'm3Tage', dayKey)) {
            if (wMission.m3Tage >= 7) { xpAdd(uid, 20, name); xpEarned += 20; addDiamond(uid, 2); diamondsEarned += 2; meldungen.push('🏆 *Wochen-M3!* +20 XP + 💎 2 Diamanten'); wMission.m3Tage = 0; }
        }
    }
    const hatTagLink = Object.values(d.links).some(l => istInstagramLink(l.text) && String(l.user_id) === String(uid) && new Date(l.timestamp).toDateString() === dayKey);
    if (!d.m1Streak[uid]) d.m1Streak[uid] = { count: 0, letzterTag: null };
    if (m1Done) {
        if (d.m1Streak[uid].letzterTag !== dayKey) {
            d.m1Streak[uid].count++;
            d.m1Streak[uid].letzterTag = dayKey;
            if (d.m1Streak[uid].count >= 5 && d.users[uid]?.warnings > 0) {
                d.users[uid].warnings--;
                d.m1Streak[uid].count = 0;
                if (!opts.silent) { try { await dmUser(uid, '🎉 *Warn entfernt!*\n5 Tage M1 in Folge!\n\n⚠️ Warns: ' + d.users[uid].warnings + '/5'); } catch (e) {} }
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
            try { await dmUser(uid, '🎯 *Missions Auswertung*\n━━━━━━━━━━━━━━\n\n' + meldungen.join('\n\n') + '\n\n━━━━━━━━━━━━━━\n⭐ Gesamt: ' + u2.xp + ' XP' + (nb ? '  ·  ⬆️ Noch ' + nb.fehlend + ' bis ' + nb.ziel : '')); } catch (e) {}
        } else if (hatTagLink && d.users[uid]?.started) {
            try { await dmUser(uid, '📊 *Missions Auswertung*\n\n❌ Keine Mission erfüllt\n\nHeute neue Chance! 💪'); } catch (e) {}
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
        const followText = '💬 *Follow-up* zu Ticket `' + openTicket.id + '` von *' + userName + '*' + userHandle + '\n\n❓ _' + question + '_\n\n_Antworte hier im Chat — geht an ' + userName + '._';
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
    sendInAppDM(fromUid, 'Frage erhalten — ich frag kurz nach und melde mich hier zurück. (Antwort kommt meistens in <1h)');
    const adminIds = Array.isArray(d._adminIds) ? d._adminIds : [];
    const adminAppDmText = '🎫 *NEUES TICKET* `' + qId + '`\n─────────────────────\n👤 Von: *' + userName + '*' + userHandle + ' (UID `' + fromUid + '`)\n\n❓ Frage:\n_' + question + '_\n─────────────────────\n💬 *Antworte einfach hier in diesem Chat* — geht direkt an den User.\n_Weitere Fragen vom User landen in DIESEM Ticket bis du antwortest._';
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
    sendInAppDM(q.uid, '🤖 *Antwort vom Admin auf deine Frage*\n\n_' + (q.question || '').slice(0, 100) + '_\n\n' + answer);
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

// ════════ ADMIN-AKTIONEN (clean: nur Daten + In-App-DM) ════════
function addWarn({ uid, reason }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    u.warnings = (u.warnings || 0) + 1;
    try { dmUser(uid, `⚠️ *Verwarnung!*\n\nWarn: ${u.warnings}/5${reason ? '\n\nGrund: ' + reason : ''}`); } catch (e) {}
    return { ok: true, warnings: u.warnings };
}
function removeWarn({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    u.warnings = Math.max(0, (u.warnings || 0) - 1);
    try { dmUser(uid, `✅ *Verwarnung entfernt*\n\nWarn: ${u.warnings}/5`); } catch (e) {}
    return { ok: true, warnings: u.warnings };
}
function resetUser({ uid }) {
    uid = String(uid || '');
    const u = d.users[uid];
    if (!u) return { ok: false, error: 'User nicht gefunden' };
    u.xp = 0; u.level = 1; u.role = badge(0);
    if (d.dailyXP) delete d.dailyXP[uid];
    if (d.weeklyXP) delete d.weeklyXP[uid];
    try { dmUser(uid, `♻️ *XP zurückgesetzt*\n\nEin Admin hat deinen XP-Stand auf 0 zurückgesetzt.`); } catch (e) {}
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
    try { dmUser(uid, `📉 *−${amt} XP*\n\n${_reasonLabel(reason)}\n⭐ Aktuell: ${u.xp} XP`); } catch (e) {}
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
    try { dmUser(uid, `🚫 *Du wurdest gebannt*\n\nEin Admin hat dich aus der Community entfernt.`); } catch (e) {}
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
    try { dmUser(uid, `✅ *Bann aufgehoben*\n\nDu bist wieder Teil der Community. Willkommen zurück!`); } catch (e) {}
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
        try { dmUser(uid, '✅ *Posting-Sperre aufgehoben*\n\nDu kannst wieder posten.'); } catch (e) {}
        return { ok: true, suspended: false };
    }
    if (days > 365) return { ok: false, error: 'Max 365 Tage' };
    u.postSuspendedUntil = Date.now() + days * 86400000;
    u.postSuspendReason = reason || null;
    try {
        dmUser(uid, '🚫 *Posten gesperrt für ' + days + ' Tag' + (days === 1 ? '' : 'e') + '*\n\n' + (reason ? 'Grund: ' + reason + '\n\n' : '') + 'Liken geht weiter — Likes zählen für deinen XP/Mission-Status. Sperre endet ' + new Date(u.postSuspendedUntil).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) + '.');
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
        sendCreatorBoostDM(uid, '⭐ Dein Superlink wurde gepostet!\n\nDu hast heute einen Superlink gepostet — vergiss nicht: Du musst alle Superlinks dieser Woche engagieren (Liken, Kommentieren, Teilen, Speichern) bis Sonntag 23:59 Uhr.', { link: { url: rulesUrl, label: '📖 Superlink-Regeln' } });
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
    sendInAppDM(uid, '💎 Diamantlink veröffentlicht!\n\nDein Post ist 3 Tage im Feed an erster Stelle.\n' + (wasAdmin ? '⚙️ Admin: gratis (keine Kosten)\n' : 'Kosten: −' + DIAMOND_LINK_COST + ' 💎 (Aktuell: ' + u.diamonds + ' 💎)\n') + '\nJeder Liker bekommt +' + DIAMOND_LINK_REWARD + ' 💎. Der Post muss FULL ENGAGED werden (Like + Kommentar + Teilen + Speichern). Schein-Engagement wird hart sanktioniert.');
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
    sendInAppDM(uid, '💎 Diamantlink engagiert\n\nDu hast einen Diamantlink engagiert und +' + DIAMOND_LINK_REWARD + ' 💎 erhalten.\n\nDu bestätigst hiermit den Post:\n✓ geliked\n✓ kommentiert\n✓ geteilt\n✓ gespeichert\n\nDies wird kontrolliert. Bei Schein-Engagement: XP-Abzug + Diamonds-Reset + Bann.\n\nMehr im Explore → Regeln → 💎 Diamantlinks.');
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
    sendInAppDM(uid, '💠 Prismalink veröffentlicht!\n\nDein Post ist 7 Tage im Feed an erster Stelle mit Holographic-Glow.\n' + (wasAdmin ? '⚙️ Admin: gratis (keine Kosten)\n' : 'Kosten: −' + PRISMA_LINK_COST + ' 💎 (Aktuell: ' + u.diamonds + ' 💎)\n') + '\nJeder Liker bekommt +' + PRISMA_LINK_REWARD + ' 💎. Der Post muss FULL ENGAGED werden (Like + Kommentar + Teilen + Speichern). Schein-Engagement wird hart sanktioniert.');
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
    sendInAppDM(uid, '💠 Prismalink engagiert\n\nDu hast einen Prismalink engagiert und +' + PRISMA_LINK_REWARD + ' 💎 erhalten.\n\nDu bestätigst hiermit den Post:\n✓ geliked\n✓ kommentiert\n✓ geteilt\n✓ gespeichert\n\nDies wird kontrolliert. Bei Schein-Engagement: XP-Abzug + Diamonds-Reset + Bann.\n\nMehr im Explore → Regeln → 💠 Prismalinks.');
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
    sendInAppDM(partnerUid, '🤝 Kollab-Post live!\n\n' + fromName + ' hat euren gemeinsamen Kollab-Post veröffentlicht.\nUser können ihn jetzt im Feed → 🤝 Kollabs engagieren.');
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
        sendInAppDM(uid, '🤝 Kollab-Post engagiert\n\nDu hast deinen ersten Kollab-Post engagiert! Die Regeln nochmal kurz:\n\n• Zuerst auf Instagram öffnen → LIKEN, KOMMENTIEREN, SPEICHERN und TEILEN\n• Dann hier in der App ✅ tippen\n• Pro engagiertem Kollab-Post bekommst du 1 💎 Diamant\n• Im Reel muss sichtbar sein, dass beide Parteien zusammenarbeiten (z.B. Logos beider Creator, gemeinsamer Branding-Frame oder beide @-Handles)\n• Reine Schein-Likes und Posts ohne sichtbare Zusammenarbeit werden sanktioniert\n\nMehr im Explore → Regeln → 🤝 Kollabs. Viel Erfolg!');
        u.collabRulesDMSent = Date.now();
        dmSentNow = true;
    }
    if (boost.active) {
        sendInAppDM(uid, '🤝⚡ Kollab-Boost-Slot!\n\nDu hast den Kollab-Post während eines Boost-Slots engagiert → +1 💎 Extra-Diamant (' + diamondsGiven + ' total).\n\nKollab-Posts erscheinen 7 Tage lang alle 4h für 20 Minuten im Feed mit Boost-Bonus.');
    }
    return { ok: true, liked: true, likeCount: p.likes.length, diamondsTotal: u.diamonds || 0, rulesDmSent: dmSentNow, diamondsGiven, boostActive: boost.active };
}

module.exports = {
    init, setThumbnailFetcher, setBildSaver,
    updateProfileApi, addProjectApi, updateProjectApi, deleteProjectApi, completeProfileApi, engagePinnedPostApi,
    followApi,
    addWarn, removeWarn, resetUser, removeXp, startXpEvent, startDiamondEvent, stopEvent,
    banUserApi, unbanUserApi, adminSuspendPostingApi,
    mergeUsers, deleteUser, userDeleteSelfApi,
    mindsetSetAnswerApi, runMindsetPickApi, mindsetAdminPickApi, mindsetAdminSkipApi, mindsetAdminBlastApi, mindsetAdminRestoreApi, isMindsetLocked,
    helperChatAppendApi, helperQuestionApi, adminHelperAnswerApi,
    auswertenForUserDay, missionenAuswerten, backfillMissionenSinceMonday, thisWeekBackfillDays, applyWarningEscalation, xpBisNaechstesBadge,
    dailyRankingAbschluss, aktivitaetsScore, archiveWeeklyXP, legendenBonus, wochenResetUndAuszahlung,
    zeitCheck, eventAutoTick, linkCleanup, announceEventToAllUsers,
    postLinkFromApp, createPostApi, deletePostApi, commentApi, deleteCommentApi,
    diamondLinkCreate, diamondLinkLike, diamondLinkAcceptRules, diamondLinkAdminDelete,
    prismaLinkCreate, prismaLinkLike, prismaLinkAcceptRules, prismaLinkAdminDelete,
    collabCreatePost, collabLikePost, getBerlinWeekKey,
    postSuperlinkApp, likeSuperlinkApi, isSuperLinkPostingAllowed,
    addXp, addExtraLink, addSuperlink, addDiamonds, removeDiamonds,
    buyItemApi, setActiveRingApi, buyExtralinkApi, linkStatusApi,
    // Like-Flow + Kern (verbatim portiert):
    likeFromApp, xpAdd, xpAddMitDaily, xpAddNurGesamt, badge, level, user,
    istAdminId, getRootUid, isSubAccount, weekStart,
    getMission, updateMissionProgress, checkMissionen,
    istInstagramLink, addDiamond, applyPostBonus,
    sendInAppDM, addNotification, dmUser, sendCreatorBoostDM, ensureCreatorBoostUser,
    badgeBonusLinks, generateSyntheticLinkId, tryFetchThumbnail,
    M3_CAP, CREATORBOOST_UID,
};
