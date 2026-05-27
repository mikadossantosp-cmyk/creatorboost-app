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

// ── Wochen-Key (Berlin) — Prozess läuft mit TZ=Europe/Berlin ──
function getBerlinWeekKey() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
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
    init, setThumbnailFetcher,
    postLinkFromApp, createPostApi, deletePostApi, commentApi, deleteCommentApi,
    diamondLinkCreate, diamondLinkLike, diamondLinkAcceptRules, diamondLinkAdminDelete,
    prismaLinkCreate, prismaLinkLike, prismaLinkAcceptRules, prismaLinkAdminDelete,
    collabCreatePost, collabLikePost, getBerlinWeekKey,
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
