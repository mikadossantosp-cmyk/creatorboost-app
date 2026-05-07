process.env.TZ = 'Europe/Berlin';
const https = require('https');
const http = require('http');
const url = require('url');
const crypto = require('crypto');

const MAINBOT_URL   = process.env.MAINBOT_URL   || '';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'geheimer-key';
const BOT_TOKEN     = process.env.BOT_TOKEN     || '';
const BOT_USERNAME  = process.env.BOT_USERNAME  || 'CreatorBoostbot';
const PORT          = process.env.PORT          || 3000;

const fs = require('fs');
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const SESSIONS_FILE = DATA_DIR + '/cb_sessions.json';

// Sessions von Disk laden
const sessions = new Map();
try {
    if (fs.existsSync(SESSIONS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
        for (const [k,v] of Object.entries(raw)) sessions.set(k, v);
        console.log('✅ Sessions geladen:', sessions.size);
    }
} catch(e) { console.log('Sessions Ladefehler:', e.message); }
const LOCAL_SESSIONS = __dirname + '/sessions.json';
if (sessions.size === 0) {
    try {
        if (fs.existsSync(LOCAL_SESSIONS)) {
            const raw = JSON.parse(fs.readFileSync(LOCAL_SESSIONS, 'utf8'));
            for (const [k,v] of Object.entries(raw)) sessions.set(k, v);
            console.log('✅ Sessions (lokal) geladen:', sessions.size);
        }
    } catch(e) {}
}

function saveSessions() {
    const obj = {};
    for (const [k,v] of sessions.entries()) obj[k] = v;
    const data = JSON.stringify(obj);
    try { fs.writeFileSync(SESSIONS_FILE, data); } catch(e) {}
    try { fs.writeFileSync(LOCAL_SESSIONS, data); } catch(e) {}
}
setInterval(saveSessions, 60000);

// Migrate all existing sessions to light theme
for (const [k, v] of sessions.entries()) { if (!v.theme || v.theme === 'dark') { v.theme = 'light'; } }
saveSessions();

// Web Push
let webpush;
try { webpush = require('web-push'); } catch(e) {}
const VAPID_PUBLIC = 'BF3FxtRYkoHBCgfG0U1o9UIeib81WmArYdKWJZQWMbCwdd2cvivmAB9TNjY3p-XdkGjQux1OZZR-m3iwjBvCyKg';
const VAPID_PRIVATE = 'ViWUilwaJSHAmfWLyIfCyvJVWnOFirq3Dn1HTGfIaoQ';
const PUSH_SUBS_FILE = DATA_DIR + '/push_subscriptions.json';
let pushSubs = {};
try { if (fs.existsSync(PUSH_SUBS_FILE)) pushSubs = JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, 'utf8')); } catch(e) {}
function savePushSubs() { try { fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(pushSubs)); } catch(e) {} }
if (webpush) webpush.setVapidDetails('mailto:admin@creatorx.app', VAPID_PUBLIC, VAPID_PRIVATE);

const RING_ITEMS = [
    { id: 'ring_flame',   name: 'Flame Ring',   emoji: '🔥', price: 8,  shadow: '0 0 0 3px #ff9a3c, 0 0 0 6px #ff3900',   gradient: 'linear-gradient(135deg,#ff3900,#ff9a3c)', desc: 'Heißes Feuer-Glühen' },
    { id: 'ring_ocean',   name: 'Ocean Ring',   emoji: '🌊', price: 8,  shadow: '0 0 0 3px #00c9ff, 0 0 0 6px #0088cc',   gradient: 'linear-gradient(135deg,#0088cc,#00c9ff)', desc: 'Tiefblaues Meeresleuchten' },
    { id: 'ring_gold',    name: 'Gold Ring',    emoji: '✨', price: 10, shadow: '0 0 0 3px #FFD700, 0 0 0 6px #B8860B',   gradient: 'linear-gradient(135deg,#B8860B,#FFD700)', desc: 'Goldener Glanz' },
    { id: 'ring_purple',  name: 'Cosmic Ring',  emoji: '🔮', price: 12, shadow: '0 0 0 3px #e040fb, 0 0 0 6px #9c27b0',   gradient: 'linear-gradient(135deg,#9c27b0,#e040fb)', desc: 'Mystisches Kosmosleuchten' },
    { id: 'ring_rainbow', name: 'Rainbow Ring', emoji: '🌈', price: 15, shadow: '0 0 0 3px #ff9900, 0 0 0 6px #cc5de8',   gradient: 'linear-gradient(135deg,#ff0000,#ff9900,#00cc00,#0000ff,#cc5de8)', desc: 'Buntes Regenbogenleuchten' },
    { id: 'ring_diamond', name: 'Diamond Ring', emoji: '💎', price: 20, shadow: '0 0 0 3px #b9f2ff, 0 0 0 6px #a78bfa',   gradient: 'linear-gradient(135deg,#a78bfa,#b9f2ff,#ffffff)', desc: 'Funkelnder Diamantglanz' },
];

const BANNER_ITEMS = [
    { id: 'banner_sunset',   name: 'Sunset',       emoji: '🌅', price: 5,  tier: 'Bronze', gradient: 'linear-gradient(135deg,#ff6b6b,#ffa500,#ffd43b)', desc: 'Warmes Sonnenuntergangs-Glühen' },
    { id: 'banner_peach',    name: 'Peach',         emoji: '🍑', price: 5,  tier: 'Bronze', gradient: 'linear-gradient(135deg,#fcb69f,#ffecd2,#ff9a9e)', desc: 'Sanftes Pfirsichrosa' },
    { id: 'banner_mint',     name: 'Mint',          emoji: '🌱', price: 5,  tier: 'Bronze', gradient: 'linear-gradient(135deg,#43e97b,#38f9d7)', desc: 'Erfrischend mintgrün' },
    { id: 'banner_forest',   name: 'Forest',        emoji: '🌿', price: 5,  tier: 'Bronze', gradient: 'linear-gradient(135deg,#56ab2f,#a8e063,#56ab2f)', desc: 'Saftiges Waldgrün' },
    { id: 'banner_ocean',    name: 'Ocean',         emoji: '🌊', price: 7,  tier: 'Silber', gradient: 'linear-gradient(135deg,#2193b0,#6dd5ed,#43b8f0)', desc: 'Frisches Meeresblau' },
    { id: 'banner_sky',      name: 'Sky Blue',      emoji: '☁️', price: 7,  tier: 'Silber', gradient: 'linear-gradient(135deg,#56ccf2,#2f80ed)', desc: 'Strahlend himmelsblau' },
    { id: 'banner_lavender', name: 'Lavender',      emoji: '💜', price: 7,  tier: 'Silber', gradient: 'linear-gradient(135deg,#c084fc,#a855f7,#e8b4f8)', desc: 'Zarter Lavendelduft' },
    { id: 'banner_rose',     name: 'Rose Gold',     emoji: '🌹', price: 7,  tier: 'Silber', gradient: 'linear-gradient(135deg,#f4a261,#e9c46a)', desc: 'Edles Roségold' },
    { id: 'banner_gold',     name: 'Golden Hour',   emoji: '✨', price: 10, tier: 'Gold',   gradient: 'linear-gradient(135deg,#f7971e,#ffd200)', desc: 'Goldene Stunde' },
    { id: 'banner_candy',    name: 'Candy',         emoji: '🍭', price: 10, tier: 'Gold',   gradient: 'linear-gradient(135deg,#f857a6,#ff5858,#ff9a9e)', desc: 'Süßes Bonbonrosa' },
    { id: 'banner_coral',    name: 'Coral',         emoji: '🪸', price: 10, tier: 'Gold',   gradient: 'linear-gradient(135deg,#f5576c,#f093fb)', desc: 'Lebendiges Korallenrot' },
    { id: 'banner_aurora',   name: 'Aurora',        emoji: '🌌', price: 10, tier: 'Gold',   gradient: 'linear-gradient(135deg,#00c6ff,#0072ff,#a18cd1)', desc: 'Nordlicht-Effekt' },
];

function getRingBoxShadow(userData) {
    const ring = userData?.activeRing;
    if (!ring) return '';
    const item = RING_ITEMS.find(r=>r.id===ring);
    return item ? `;box-shadow:${item.shadow}` : '';
}

function genSid() { return crypto.randomBytes(32).toString('hex'); }

async function checkProfileCompletion(uid, session) {
    try {
        const fresh = await fetchBot('/data');
        if (!fresh) return;
        const fu = fresh.users?.[String(uid)];
        if (!fu || fu.profileCompletionRewarded) return;
        const hasPic = !!(session?.profilePicData || ladeBild(String(uid),'profilepic'));
        const hasBanner = !!(session?.bannerData || ladeBild(String(uid),'banner'));
        const allDone = hasPic && hasBanner && !!(fu.bio?.trim()) && !!(fu.nische?.trim());
        if (allDone) await postBot('/complete-profile-api', { uid: String(uid) });
    } catch(e) {}
}
function getSession(req) { const m=(req.headers.cookie||'').match(/cbsid=([^;]+)/); return m?sessions.get(m[1]):null; }
function getSid(req) { const m=(req.headers.cookie||'').match(/cbsid=([^;]+)/); return m?m[1]:null; }
// Aktive UID (Parent ODER Sub-Account, je nach Switch-Status). session.uid = immer Parent (Telegram).
function getMyUid(session) { return session ? String(session.activeUid || session.uid) : ''; }
// HTML-Escape für User-eingegebene Strings — verhindert Stored-XSS in profileCard, posts, comments.
function htmlEsc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Sicherer URL-Check: nur http(s)-Links erlaubt, kein javascript:/data:/vbscript:.
function safeUrl(u) { const s = String(u||'').trim(); return /^https?:\/\//i.test(s) ? s : ''; }

const ONLINE_WINDOW_MS = 60000;
function isUidOnline(uid) {
    const u = String(uid), now = Date.now();
    for (const s of sessions.values()) {
        if (String(s.uid) === u && (now - (s.lastSeen||0)) < ONLINE_WINDOW_MS) return true;
    }
    return false;
}
function getOnlineUids() {
    const now = Date.now(), out = new Set();
    for (const s of sessions.values()) {
        if ((now - (s.lastSeen||0)) < ONLINE_WINDOW_MS) out.add(String(s.uid));
    }
    return out;
}

function verifyTelegramLogin(data) {
    try {
        const { hash, ...rest } = data;
        const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
        const str = Object.keys(rest).sort().map(k=>`${k}=${rest[k]}`).join('\n');
        const hmac = crypto.createHmac('sha256', secret).update(str).digest('hex');
        const age = Date.now()/1000 - Number(rest.auth_date||0);
        return hmac === hash && age < 86400;
    } catch(e) { return false; }
}

let _dataCache = null;
let _dataCacheTime = 0;
const DATA_CACHE_TTL = 60000; // 60 seconds

async function fetchBotRaw(path) {
    return new Promise(resolve => {
        const fullUrl = MAINBOT_URL + path;
        if (!fullUrl.startsWith('http')) return resolve(null);
        const lib = fullUrl.startsWith('https')?https:http;
        const req = lib.get(fullUrl, {headers:{'x-bridge-secret':BRIDGE_SECRET}}, res => {
            let data=''; res.on('data',c=>data+=c); res.on('end',()=>{
                try { resolve(JSON.parse(data)); } catch(e){ resolve(null); }
            });
        });
        req.on('error',()=>resolve(null)); req.setTimeout(3000,()=>{req.destroy();resolve(null);});
    });
}

let _refreshInFlight = null;
function refreshDataCache() {
    if (_refreshInFlight) return _refreshInFlight;
    _refreshInFlight = (async () => {
        try {
            const parsed = await fetchBotRaw('/data');
            if (parsed) { _dataCache = parsed; _dataCacheTime = Date.now(); }
        } catch(e) {}
        finally { _refreshInFlight = null; }
    })();
    return _refreshInFlight;
}

async function fetchBot(path) {
    if (path === '/data') {
        const now = Date.now();
        if (_dataCache) {
            // Return cached data immediately (stale-while-revalidate)
            if ((now - _dataCacheTime) > DATA_CACHE_TTL) refreshDataCache();
            return _dataCache;
        }
        // No cache yet - must wait
        await refreshDataCache();
        return _dataCache;
    }
    return fetchBotRaw(path);
}

// Pre-warm cache on startup and refresh every 45 seconds
setInterval(refreshDataCache, 45000);

async function postBot(path, body) {
    const result = await new Promise(resolve => {
        const fullUrl = MAINBOT_URL + path;
        const lib = fullUrl.startsWith('https')?https:http;
        const data = JSON.stringify(body);
        const u = new url.URL(fullUrl);
        const opts = {hostname:u.hostname,path:u.pathname+u.search,method:'POST',headers:{'Content-Type':'application/json','x-bridge-secret':BRIDGE_SECRET,'Content-Length':Buffer.byteLength(data)}};
        const req = lib.request(opts, res=>{
            let buf='';
            res.on('data',c=>buf+=c);
            res.on('end',()=>{ try{resolve(JSON.parse(buf));}catch(e){resolve({ok:true});} });
        });
        req.on('error',()=>resolve(null)); req.write(data); req.end();
    });
    // Stale-while-revalidate: nächster Read wartet einmal auf frische Daten, blockt aber nicht den Write
    _dataCache = null; _dataCacheTime = 0;
    refreshDataCache().catch(()=>{});
    return result;
}

const PARSE_BODY_MAX = 1024 * 1024; // 1MB cap; uploads use readBody with explicit limits
function parseBody(req) {
    return new Promise(resolve => {
        let body=''; let abort=false;
        req.on('data',c=>{
            if (abort) return;
            body += c;
            if (body.length > PARSE_BODY_MAX) { abort = true; req.destroy(); resolve({}); }
        });
        req.on('end',()=>{
            if (abort) return;
            try{resolve(JSON.parse(body));}catch(e){
                const p={};body.split('&').forEach(kv=>{const[k,v]=kv.split('=');if(k)p[decodeURIComponent(k)]=decodeURIComponent((v||'').replace(/\+/g,' '));});resolve(p);
            }
        });
        req.on('error', ()=>{ if(!abort){abort=true;resolve({});} });
    });
}

function xpNext(xp) {
    if(xp<50)return{ziel:'📘',fehlend:50-xp,pct:Math.round(xp/50*100)};
    if(xp<500)return{ziel:'⬆️',fehlend:500-xp,pct:Math.round((xp-50)/450*100)};
    if(xp<1000)return{ziel:'🏅',fehlend:1000-xp,pct:Math.round((xp-500)/500*100)};
    if(xp<5000)return{ziel:'👑',fehlend:5000-xp,pct:Math.round((xp-1000)/4000*100)};
    if(xp<10000)return{ziel:'🌟',fehlend:10000-xp,pct:Math.round((xp-5000)/5000*100)};
    return null;
}

function badgeGradient(role) {
    if(role?.includes('Elite+')) return 'linear-gradient(135deg,#00b4db,#a855f7,#f59e0b)';
    if(role?.includes('Elite')) return 'linear-gradient(135deg,#f59e0b,#ef4444)';
    if(role?.includes('Erfahrener')) return 'linear-gradient(135deg,#8b5cf6,#3b82f6)';
    if(role?.includes('Aufsteiger')) return 'linear-gradient(135deg,#3b82f6,#06b6d4)';
    if(role?.includes('Anfänger')) return 'linear-gradient(135deg,#10b981,#3b82f6)';
    return 'linear-gradient(135deg,#64748b,#94a3b8)';
}

const _bildCache = new Map();
function ladeBild(uid, type) {
    const key = uid + '_' + type;
    const hit = _bildCache.get(key);
    if (hit !== undefined && Date.now() - hit.ts < 120000) return hit.v;
    let v = null;
    try {
        const f = DATA_DIR + '/bild_' + uid + '_' + type + '.txt';
        if (fs.existsSync(f)) v = fs.readFileSync(f, 'utf8');
    } catch(e) {}
    _bildCache.set(key, {v, ts: Date.now()});
    return v;
}

function ladeProjectBild(uid, projectId) {
    try {
        const f = DATA_DIR + '/bild_' + uid + '_proj_' + projectId + '.txt';
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    } catch(e) {}
    return null;
}

function ladeProjectDoc(uid, projectId) {
    try {
        const f = DATA_DIR + '/doc_' + uid + '_proj_' + projectId + '.txt';
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    } catch(e) {}
    return null;
}

function ladePinnedLink(uid) {
    try {
        const f = DATA_DIR + '/pinnedlink_' + uid + '.txt';
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
    } catch(e) {}
    return null;
}

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--bg:#ffffff;--bg2:#ffffff;--bg3:#ffffff;--bg4:#ffffff;
--border:rgba(15,23,42,.10);--border2:rgba(15,23,42,.07);
--text:#0f172a;--muted:#64748b;--muted2:#94a3b8;
--accent:#ff6b6b;--accent2:#ffa500;
--green:#00c851;--blue:#4dabf7;--purple:#cc5de8;--gold:#ffd43b;
--radius:16px;--radius-sm:10px;--radius-xs:6px;
--font:'DM Sans',sans-serif;--font-display:'Syne',sans-serif;
--shadow:0 8px 32px rgba(15,23,42,.06);
--glass-bg:rgba(255,255,255,0.72);--surface-tint:rgba(15,23,42,0.03);--hover-tint:rgba(15,23,42,0.05);
--safe-bottom:env(safe-area-inset-bottom,0px);
}
[data-theme=light]{
--bg:#ffffff;--bg2:#ffffff;--bg3:#ffffff;--bg4:#ffffff;
--border:rgba(15,23,42,.09);--border2:rgba(15,23,42,.06);
--text:#0f172a;--muted:#64748b;--muted2:#94a3b8;
--shadow:0 8px 32px rgba(15,23,42,.05);
--glass-bg:rgba(255,255,255,0.92);--surface-tint:rgba(255,255,255,1);--hover-tint:rgba(15,23,42,0.04);
}
[data-theme=dark]{
--bg:#0a0b0f;--bg2:#13141a;--bg3:#1a1c24;--bg4:#23252e;
--border:rgba(255,255,255,.1);--border2:rgba(255,255,255,.06);
--text:#fff;--muted:#a3a8b3;--muted2:#6e7280;
--shadow:0 8px 32px rgba(0,0,0,.4);
--glass-bg:rgba(10,11,15,0.65);--surface-tint:rgba(255,255,255,0.04);--hover-tint:rgba(255,255,255,0.08);
}
html{scroll-behavior:smooth;-webkit-tap-highlight-color:transparent}
html{background:var(--bg)}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;margin:0 auto;padding-bottom:calc(70px + var(--safe-bottom));overflow-x:hidden;overscroll-behavior-y:contain;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
[data-theme=dark] body{background-image:radial-gradient(ellipse 80% 60% at 0% -10%,rgba(255,107,107,0.05),transparent 60%),radial-gradient(ellipse 70% 50% at 100% 110%,rgba(167,139,250,0.04),transparent 60%);background-attachment:fixed}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
button{cursor:pointer;border:none;outline:none;font-family:var(--font)}
.topbar{position:sticky;top:0;z-index:100;background:var(--glass-bg);border-bottom:1px solid var(--border2);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%)}
.topbar-logo{font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:-0.5px;color:var(--text)}
.topbar-actions{display:flex;gap:6px;align-items:center}
.topbar .icon-btn{width:38px;height:38px;border-radius:50%;background:var(--surface-tint);border:1px solid var(--border2);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;transition:background 0.15s,transform 0.12s}
.topbar .icon-btn:active{transform:scale(0.92)}
.topbar .icon-btn:hover{background:var(--hover-tint)}
.icon-btn{width:36px;height:36px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--text)}
.bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:var(--glass-bg);border-top:1px solid var(--border2);display:flex;justify-content:space-around;padding:10px 0 calc(10px + var(--safe-bottom));z-index:100;backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%)}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:9.5px;font-weight:600;letter-spacing:0.2px;color:var(--muted2);padding:4px 14px;transition:color .2s,transform .12s;text-decoration:none}
.nav-item:active{transform:scale(0.92)}
.nav-item.active{color:var(--text)}
.nav-item.active svg{stroke:var(--accent);fill:rgba(255,107,107,0.1)}
.nav-item svg{width:23px;height:23px;transition:stroke .2s,fill .2s}
.nav-dot{width:4px;height:4px;border-radius:50%;background:var(--accent);margin:0 auto}
.card{background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border2);overflow:hidden}
.avatar{border-radius:50%;object-fit:cover;background:var(--bg4)}
.stories{display:flex;gap:14px;padding:14px 16px 8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x}
.stories::-webkit-scrollbar{display:none}
.story-item{display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;width:74px;text-decoration:none;color:inherit;-webkit-tap-highlight-color:transparent}
.stories.is-swiping .story-item{pointer-events:none}
.story-item:active{transform:scale(0.92);transition:transform 0.15s}
.story-ring{width:68px;height:68px;border-radius:50%;padding:2.5px;background:conic-gradient(from 45deg,#f9a825,#e91e63,#9c27b0,#3b82f6,#f9a825);position:relative;box-shadow:0 4px 12px rgba(233,30,99,0.18)}
.story-ring.seen{background:rgba(255,255,255,0.12);box-shadow:none}
.story-inner{width:100%;height:100%;border-radius:50%;border:2.5px solid var(--bg);overflow:hidden;position:relative;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff}
.story-name{font-size:11.5px;color:var(--text);max-width:74px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;letter-spacing:0.1px}
.post{margin:0 12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:18px;overflow:hidden;transition:border-color 0.2s,box-shadow 0.2s;box-shadow:0 1px 3px rgba(15,23,42,0.04)}
.post:hover{border-color:var(--border);box-shadow:0 4px 14px rgba(15,23,42,0.06)}
.post-header{display:flex;align-items:center;gap:11px;padding:14px 16px 10px}
.post-user-info{flex:1;min-width:0}
.post-name{font-size:14px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.1px}
.post-time{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.post-badge{font-size:10px;color:var(--muted)}
.post-time{font-size:11px;color:var(--muted2)}
.post-actions{display:flex;align-items:center;gap:4px;padding:8px 12px}
.post-action-btn{display:flex;align-items:center;justify-content:center;gap:7px;padding:9px 16px;border-radius:14px;background:transparent;font-size:13.5px;font-weight:700;color:var(--muted);transition:all .15s;border:1px solid var(--border)!important;letter-spacing:0.1px;cursor:pointer}
.post-action-btn:active{transform:scale(0.95)}
.post-action-btn:hover{background:var(--surface-tint);color:var(--text)}
.post-action-btn.liked{color:#fff!important;background:#ff6b6b!important;border-color:#ff6b6b!important;box-shadow:0 6px 18px rgba(255,107,107,0.35)}
.post-action-btn.liked svg{fill:#fff!important;stroke:#fff!important}
.post-action-btn[onclick*="showLikerModal"]{background:rgba(77,171,247,0.06);border-color:rgba(77,171,247,0.18)!important;color:var(--text)}
.post-action-btn[onclick*="showLikerModal"]:active{background:rgba(77,171,247,0.12)}
.post-action-btn svg{width:18px;height:18px;transition:fill 0.15s,stroke 0.15s}
.post-likers{padding:0 16px 4px;font-size:12px;color:var(--muted)}
.post-likers span{color:var(--text);font-weight:600}
.profile-banner{width:100%;aspect-ratio:3/1;position:relative;overflow:hidden}
.profile-banner-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,0.18) 70%,var(--bg) 100%);pointer-events:none}
.profile-avatar-wrap{position:absolute;bottom:-44px;left:18px}
.profile-avatar{width:96px;height:96px;border-radius:50%;border:4px solid var(--bg);background:var(--bg4);object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:36px;box-shadow:0 10px 28px rgba(15,23,42,0.18)}
.profile-online-dot{position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#22c55e;border:3px solid var(--bg);box-shadow:0 0 10px rgba(34,197,94,0.6);z-index:3}
.profile-action-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--glass-bg,rgba(255,255,255,0.85));backdrop-filter:blur(14px) saturate(180%);-webkit-backdrop-filter:blur(14px) saturate(180%);border:1px solid var(--border2);color:var(--text);border-radius:999px;font-size:12.5px;font-weight:700;text-decoration:none;transition:transform 0.12s,background 0.15s;letter-spacing:0.1px;box-shadow:0 4px 14px rgba(15,23,42,0.08)}
.profile-action-pill:active{transform:scale(0.94)}
.profile-action-pill:hover{background:var(--bg)}
.profile-info{padding:54px 18px 12px}
.profile-name-row{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}
.profile-name{font-family:var(--font-display);font-size:26px;font-weight:800;letter-spacing:-0.5px;line-height:1.1;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.profile-username{font-size:13.5px;color:var(--muted);margin-top:4px;font-weight:500}
.profile-bio{font-size:14px;color:var(--text);margin-top:12px;line-height:1.55;font-weight:500}
.profile-status-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--surface-tint);border:1px solid var(--border2);color:var(--muted);letter-spacing:0.1px}
.profile-status-pill.online{color:#22c55e;background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.25)}
.profile-status-pill.offline{color:var(--muted2);background:var(--surface-tint)}
.profile-meta-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;background:var(--surface-tint);border:1px solid var(--border2);border-radius:10px;font-size:12px;font-weight:600;color:var(--text);letter-spacing:0.1px;transition:background 0.15s}
.profile-meta-chip:hover{background:var(--bg2)}
.profile-badge{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:0.5px;box-shadow:0 4px 14px rgba(255,107,107,0.2);text-transform:uppercase;flex-shrink:0;align-self:flex-start;margin-top:3px}
.profile-stats{position:relative;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:0;margin:14px 14px 0;padding:16px 6px 14px;background:#ffffff;border:1px solid var(--border2);border-radius:18px;box-shadow:0 4px 18px -8px rgba(15,23,42,0.10),0 1px 3px -1px rgba(15,23,42,0.05);z-index:5}
[data-theme="dark"] .profile-stats{background:var(--bg3);border-color:var(--border2);box-shadow:0 4px 18px -8px rgba(0,0,0,0.4)}
.profile-stat{text-align:center;padding:2px 0;border:none!important;position:relative;transition:transform .18s ease}
.profile-stat[href]:active{transform:scale(0.96)}
.profile-stat:not(:last-child)::after{content:"";position:absolute;right:0;top:25%;bottom:25%;width:1px;background:linear-gradient(to bottom,transparent,var(--border2),transparent)}
.profile-stat-val{font-size:18px;font-weight:800;color:var(--text);letter-spacing:-0.4px;font-variant-numeric:tabular-nums;line-height:1.1}
.profile-stat-label{font-size:10px;color:var(--muted);margin-top:4px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase}
.profile-stat-trend{display:inline-flex;align-items:center;gap:2px;font-size:9.5px;font-weight:800;padding:1px 5px;border-radius:8px;margin-left:3px;vertical-align:middle}
.profile-stat-trend.up{background:rgba(34,197,94,.14);color:#16a34a}
.profile-stat-trend.down{background:rgba(239,68,68,.14);color:#dc2626}
.profile-stat-trend.flat{background:var(--bg4);color:var(--muted)}
.profile-spark{display:block;width:42px;height:14px;margin:0 auto 2px;opacity:.85}
.profile-xp-bar{margin:14px 16px 6px;background:var(--bg4);border:1px solid var(--border2);border-radius:999px;height:10px;overflow:hidden;position:relative}
.profile-xp-fill{height:100%;border-radius:999px;transition:width .9s cubic-bezier(.16,1,.3,1);position:relative;overflow:hidden}
.profile-xp-fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent);transform:translateX(-100%);animation:xp-shimmer 2.5s ease-in-out infinite}
@keyframes xp-shimmer{0%{transform:translateX(-100%)}60%,100%{transform:translateX(220%)}}
.profile-xp-info{margin:0 16px 14px;display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);font-weight:600;letter-spacing:.1px}
.profile-xp-info b{color:var(--text);font-weight:700}
/* Slots-Card (Superlink + Extra-Links) */
.profile-slots{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 14px 0}
.profile-slot-card{background:#fff;border:1px solid var(--border2);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:10px;transition:transform .18s ease,box-shadow .18s ease;text-decoration:none;color:inherit;position:relative;overflow:hidden}
[data-theme="dark"] .profile-slot-card{background:var(--bg3)}
.profile-slot-card:active{transform:scale(0.98)}
.profile-slot-icon{font-size:22px;flex-shrink:0;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(167,139,250,.15),rgba(124,58,237,.06));border:1px solid rgba(167,139,250,.2)}
.profile-slot-card.lnk .profile-slot-icon{background:linear-gradient(135deg,rgba(255,107,107,.15),rgba(255,165,0,.06));border-color:rgba(255,107,107,.2)}
.profile-slot-info{flex:1;min-width:0}
.profile-slot-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;font-weight:700;line-height:1}
.profile-slot-val{font-size:15px;font-weight:800;color:var(--text);margin-top:3px;letter-spacing:-.2px;font-variant-numeric:tabular-nums;line-height:1.1}
.profile-slot-val .small{font-size:11px;font-weight:600;color:var(--muted)}
.profile-slot-val.ok{color:#16a34a}
.profile-slot-val.zero{color:var(--muted)}
.rank-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border2);text-decoration:none;color:inherit;transition:background .15s}
.rank-item:active{background:var(--surface-tint)}
.rank-pos{width:32px;text-align:center;font-size:18px;flex-shrink:0}
.rank-num{font-size:14px;font-weight:700;color:var(--muted)}
.rank-info{flex:1;min-width:0}
.rank-name{font-size:13px;font-weight:600}
.rank-badge{font-size:11px;color:var(--muted)}
.rank-xp{font-size:13px;font-weight:700;color:var(--gold)}
.rank-me{background:rgba(255,107,107,.05);border-left:2px solid var(--accent)}
/* Top-3-Podium */
.podium-wrap{position:relative;padding:18px 12px 22px;background:linear-gradient(180deg,rgba(167,139,250,0.08),rgba(255,107,107,0.04) 60%,transparent);border-bottom:1px solid var(--border2);overflow:hidden}
.podium-wrap::before{content:"";position:absolute;top:-40px;left:50%;width:240px;height:240px;transform:translateX(-50%);background:radial-gradient(circle,rgba(245,158,11,0.18),transparent 70%);pointer-events:none;filter:blur(8px)}
.podium-row{position:relative;display:grid;grid-template-columns:1fr 1.2fr 1fr;align-items:end;gap:8px;max-width:380px;margin:0 auto}
.podium-slot{display:flex;flex-direction:column;align-items:center;text-decoration:none;color:inherit;cursor:pointer;animation:podium-rise .55s cubic-bezier(.16,1,.3,1) backwards}
.podium-slot.p1{animation-delay:.18s}
.podium-slot.p2{animation-delay:.05s}
.podium-slot.p3{animation-delay:.10s}
@keyframes podium-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.podium-crown{font-size:22px;margin-bottom:-2px;filter:drop-shadow(0 2px 6px rgba(245,158,11,0.45));animation:crown-bob 2.4s ease-in-out infinite}
@keyframes crown-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-3px) rotate(3deg)}}
.podium-avatar{position:relative;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;flex-shrink:0;box-shadow:0 8px 22px -6px rgba(15,23,42,0.25)}
.podium-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.podium-slot.p1 .podium-avatar{width:84px;height:84px;font-size:24px;border:3px solid #f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,0.18),0 12px 28px -8px rgba(245,158,11,0.45)}
.podium-slot.p2 .podium-avatar{width:64px;height:64px;font-size:18px;border:3px solid #94a3b8;box-shadow:0 0 0 3px rgba(148,163,184,0.18),0 8px 22px -8px rgba(148,163,184,0.45)}
.podium-slot.p3 .podium-avatar{width:64px;height:64px;font-size:18px;border:3px solid #d97706;box-shadow:0 0 0 3px rgba(217,119,6,0.18),0 8px 22px -8px rgba(217,119,6,0.45)}
.podium-name{font-size:12.5px;font-weight:700;margin-top:8px;max-width:100%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.1px}
.podium-xp{font-size:11px;font-weight:700;color:var(--gold);margin-top:2px;font-variant-numeric:tabular-nums}
.podium-block{margin-top:10px;width:88%;border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:center;font-family:var(--font-display,inherit);font-weight:900;color:#fff;letter-spacing:1px}
.podium-slot.p1 .podium-block{height:64px;font-size:22px;background:linear-gradient(180deg,#fbbf24,#d97706);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 -4px 14px -6px rgba(245,158,11,0.5)}
.podium-slot.p2 .podium-block{height:46px;font-size:18px;background:linear-gradient(180deg,#cbd5e1,#64748b);box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.podium-slot.p3 .podium-block{height:36px;font-size:16px;background:linear-gradient(180deg,#fdba74,#9a3412);box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.form-section{padding:16px}
.form-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.form-input{width:100%;background:var(--bg4);border:1px solid var(--border);color:var(--text);border-radius:var(--radius-sm);padding:12px 14px;font-size:14px;font-family:var(--font);outline:none;transition:border-color .2s}
.form-input:focus{border-color:var(--accent)}
textarea.form-input{resize:none;min-height:80px}
.form-hint{font-size:11px;color:var(--muted2);margin-top:4px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);font-size:14px;font-weight:600;font-family:var(--font);cursor:pointer;transition:all .15s;border:none}
.btn-primary{background:var(--accent);color:#fff}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
.btn-full{width:100%}
.btn-sm{padding:8px 14px;font-size:12px}
.color-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin-top:8px}
.color-opt{width:36px;height:36px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .15s;display:flex;align-items:center;justify-content:center}
.color-opt.selected{border-color:var(--text);transform:scale(1.1)}
.gradient-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.gradient-opt{height:50px;border-radius:var(--radius-xs);cursor:pointer;border:2px solid transparent;transition:all .15s}
.gradient-opt.selected{border-color:var(--text)}
.tabs{display:flex;border-bottom:1px solid var(--border2)}
.tab{flex:1;text-align:center;padding:10px 4px;font-size:12px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tab.active{color:var(--text);border-bottom-color:var(--text)}
.empty{text-align:center;padding:48px 24px;color:var(--muted)}
.empty-icon{font-size:48px;margin-bottom:12px}
.empty-text{font-size:15px;font-weight:600;margin-bottom:6px;color:var(--text)}
.empty-sub{font-size:13px}
.toast{position:fixed;top:80px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:10px 20px;font-size:13px;font-weight:500;z-index:999;box-shadow:var(--shadow);opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
.fade-up{animation:fadeUp .4s ease forwards}
.setting-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border2)}
.setting-label{font-size:14px;font-weight:500}
.setting-sub{font-size:12px;color:var(--muted);margin-top:2px}
.toggle{width:44px;height:24px;border-radius:12px;background:var(--bg4);border:none;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.toggle.on{background:var(--accent)}
.toggle::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on::after{transform:translateX(20px)}
.proj-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:16px}
@media(min-width:480px){.proj-grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:768px){.proj-grid{grid-template-columns:repeat(4,1fr)}}
.proj-card{background:var(--bg3);border:1px solid var(--border2);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform .15s,border-color .15s}
.proj-card:hover{transform:translateY(-2px);border-color:var(--border)}
.proj-card-img{width:100%;aspect-ratio:1;object-fit:cover}
.proj-card-placeholder{width:100%;aspect-ratio:1;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:32px}
.proj-card-body{padding:10px}
.proj-card-title{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.proj-card-desc{font-size:11px;color:var(--muted);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.proj-add-card{background:var(--bg3);border:2px dashed var(--border);border-radius:14px;cursor:pointer;transition:border-color .15s,color .15s;color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px 0}
.proj-add-card:hover{border-color:var(--accent);color:var(--accent)}
.proj-modal-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s}
.proj-modal-overlay.open{opacity:1;pointer-events:all}
.proj-modal-sheet{background:var(--bg2);border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;transform:translateY(100%);transition:transform .3s cubic-bezier(.32,1.25,.68,1)}
.proj-modal-overlay.open .proj-modal-sheet{transform:translateY(0)}
.proj-add-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s;padding:16px}
.proj-add-overlay.open{opacity:1;pointer-events:all}
.proj-add-sheet{background:var(--bg2);border-radius:var(--radius);width:100%;max-width:440px;max-height:90vh;overflow-y:auto;transform:scale(.95);transition:transform .25s}
.proj-add-overlay.open .proj-add-sheet{transform:scale(1)}
/*=========================
   PC + BANNER + PROFIL FIX
=========================*/

@media (min-width: 768px) {
  body {
    max-width: 860px;
    padding-bottom: 80px;
  }

  .bottom-nav {
    max-width: 860px;
  }

  /* BANNER auf PC */
  .profile-banner {
    aspect-ratio: 3.5/1;
    height: auto;
    border-radius: 0;
  }

  /* Avatar-Wrapper auf PC */
  .profile-avatar-wrap {
    bottom: -44px;
    left: 28px;
  }

  /* Profilbild auf PC */
  .profile-avatar {
    width: 120px;
    height: 120px;
    border-width: 4px;
    font-size: 48px;
  }

  /* Mehr Platz nach oben wegen größerem Avatar */
  .profile-info {
    padding: 68px 28px 20px;
  }

  .profile-name {
    font-size: 28px;
  }

  .profile-username {
    font-size: 15px;
  }

  .profile-bio {
    font-size: 14px;
  }

  .profile-stat-val {
    font-size: 22px;
  }

  .profile-stat {
    padding: 18px 0;
  }

  .profile-xp-bar {
    margin: 20px 28px 0;
  }

  .profile-xp-info {
    margin: 4px 28px 20px;
    font-size: 12px;
  }
}
.post-category-label{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:5px 11px;border-radius:999px;color:#fff;box-shadow:0 4px 12px rgba(255,107,107,0.25),inset 0 1px 0 rgba(255,255,255,0.15)}
.post-likes-row{display:flex;align-items:center;gap:14px;padding:10px 16px 4px}
.post-like-count{font-size:22px;font-weight:800;display:flex;align-items:center;gap:4px;color:var(--text)}
.post-xp-pill{font-size:12px;font-weight:700;color:var(--gold);background:rgba(255,214,0,.12);padding:3px 10px;border-radius:20px}
.liker-modal{position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .25s}
.liker-modal.open{opacity:1;pointer-events:all}
.liker-modal-sheet{width:100%;max-width:480px;background:var(--bg3);border-radius:20px 20px 0 0;max-height:70vh;overflow-y:auto;transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1)}
.liker-modal.open .liker-modal-sheet{transform:translateY(0)}
/* ── COMMUNITY FEED ── */
.comm-feed{padding:12px 16px 80px}
.comm-msg{background:var(--bg3);border:1px solid var(--border2);border-radius:14px;padding:14px 16px;margin-bottom:10px;transition:background .2s}
.comm-msg:active{background:var(--bg4)}
.comm-msg-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.comm-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0}
.comm-username{font-size:13px;font-weight:700;color:var(--text)}
.comm-time{font-size:11px;color:var(--muted);margin-left:auto}
.comm-text{font-size:14px;color:var(--text);line-height:1.55;word-break:break-word}
.comm-empty{padding:60px 24px;text-align:center;color:var(--muted)}
.comm-empty-icon{font-size:48px;margin-bottom:12px}
.comm-header{padding:12px 16px 4px;display:flex;align-items:center;justify-content:space-between}
.comm-title{font-size:18px;font-weight:800}
.comm-live{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--green)}
.comm-live-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse-dot 1.5s ease-in-out infinite}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
/* ── EXPLORE TABS — Premium Cards ── */
.explore-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:12px 14px 18px}
.explore-tab{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px 6px 12px;border-radius:16px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),background 0.2s,border-color 0.2s;font-family:var(--font);text-align:center;overflow:hidden;min-height:84px;-webkit-tap-highlight-color:transparent}
.explore-tab::before{content:"";position:absolute;inset:0;border-radius:16px;background:linear-gradient(135deg,var(--et-c1,#a78bfa),var(--et-c2,#7c3aed));opacity:0;transition:opacity 0.25s;pointer-events:none}
.explore-tab .et-icon{position:relative;z-index:1;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;background:linear-gradient(135deg,var(--et-c1,#a78bfa)33,var(--et-c2,#7c3aed)1a);transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),background 0.2s;line-height:1}
.explore-tab .et-label{position:relative;z-index:1;font-size:11.5px;font-weight:700;color:var(--text);letter-spacing:0.2px;line-height:1;opacity:0.9}
.explore-tab:active{transform:scale(0.94)}
.explore-tab:hover:not(.active){background:rgba(255,255,255,0.045);border-color:rgba(255,255,255,0.1)}
.explore-tab:hover:not(.active) .et-icon{transform:scale(1.08)}
.explore-tab.active{border-color:transparent}
.explore-tab.active::before{opacity:1}
.explore-tab.active::after{content:"";position:absolute;inset:0;border-radius:16px;background:radial-gradient(ellipse at top,rgba(255,255,255,0.18),transparent 65%);pointer-events:none;z-index:0}
.explore-tab.active{box-shadow:0 8px 24px var(--et-shadow,rgba(167,139,250,0.45)),inset 0 1px 0 rgba(255,255,255,0.18)}
.explore-tab.active .et-icon{background:rgba(255,255,255,0.22);color:#fff;backdrop-filter:blur(6px);transform:scale(1.05)}
.explore-tab.active .et-label{color:#fff;font-weight:800;letter-spacing:0.4px;opacity:1;text-shadow:0 1px 2px rgba(0,0,0,0.15)}
.explore-welcome{margin:0 16px 16px;border-radius:16px;overflow:hidden;position:relative;min-height:220px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)}
.highlight-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;text-decoration:none;color:var(--text);transition:background .2s}
.highlight-card:active{background:rgba(255,255,255,.08)}
.highlight-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.creator-scroll{display:flex;gap:12px;padding:0 16px 12px;overflow-x:auto;scrollbar-width:none}
.creator-scroll::-webkit-scrollbar{display:none}
.sug-list{display:flex;gap:11px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:6px 16px 12px;scroll-snap-type:x proximity}
.sug-list::-webkit-scrollbar{display:none}
.sug-card{flex:0 0 auto;width:172px;background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015));border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:0 0 12px;display:flex;flex-direction:column;align-items:stretch;text-align:center;scroll-snap-align:start;transition:border-color 0.2s;overflow:hidden;position:relative}
.sug-card:hover{border-color:rgba(167,139,250,0.25)}
.sug-card-banner{height:56px;position:relative;overflow:hidden}
.sug-card-banner::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,0.55) 100%)}
.sug-avatar{width:72px;height:72px;border-radius:50%;border:3px solid var(--bg);margin:-36px auto 8px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.3);z-index:1}
.sug-avatar::after{content:"";position:absolute;inset:-3px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#4dabf7,#22c55e);z-index:-1;padding:3px;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0.7}
.sug-info{display:flex;flex-direction:column;align-items:center;gap:2px;width:100%;padding:0 10px}
.sug-name{font-size:14px;font-weight:800;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;text-decoration:none;letter-spacing:-0.2px}
.sug-role{font-size:10px;font-weight:700;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;letter-spacing:0.2px;text-transform:none}
.sug-meta{display:flex;align-items:center;justify-content:center;gap:0;margin-top:6px;min-height:18px}
.sug-mutuals{font-size:10.5px;color:var(--muted);text-align:center;line-height:1.3;margin-top:3px;font-weight:600;letter-spacing:0.1px}
.sug-mutuals.has-mutual{color:#a78bfa}
.sug-btn{width:calc(100% - 20px);background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border:none;border-radius:10px;padding:9px 0;font-size:12.5px;font-weight:800;cursor:pointer;margin:11px 10px 0;transition:transform 0.15s,box-shadow 0.2s;-webkit-tap-highlight-color:transparent;letter-spacing:0.2px;box-shadow:0 4px 12px rgba(167,139,250,0.3)}
.sug-btn:active{transform:scale(0.94)}
.sug-btn.followed{background:rgba(255,255,255,0.08);color:var(--muted);box-shadow:none}
.sug-x{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);color:#fff;border:1px solid rgba(255,255,255,0.15);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;line-height:1}
.sug-x:active{background:rgba(0,0,0,0.75)}
/* ── User-Suche Row-Style (Instagram-Liste) ── */
.sug-row{display:flex;align-items:center;width:100%;transition:background 0.15s;background:transparent}
.sug-row:hover{background:var(--surface-tint)}
.sug-row-avatar{position:relative;width:54px;height:54px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff}
.sug-row-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}
.sug-row-name{font-size:14.5px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.1px}
.sug-row-sub{font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.sug-row-btn{background:var(--accent);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;transition:transform 0.12s,opacity 0.15s;-webkit-tap-highlight-color:transparent;letter-spacing:0.1px}
.sug-row-btn:active{transform:scale(0.94)}
.sug-row-btn.followed{background:var(--bg4);color:var(--muted)}
.sug-row-x{background:transparent;border:none;color:var(--muted);font-size:20px;cursor:pointer;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;transition:background 0.15s,color 0.15s}
.sug-row-x:hover{background:var(--surface-tint);color:var(--text)}
.creator-card{flex-shrink:0;width:140px;background:var(--bg3);border:1px solid var(--border2);border-radius:16px;overflow:hidden;text-decoration:none;color:var(--text);display:block}
.creator-card-banner{height:50px;position:relative;overflow:hidden;background:var(--bg4)}
.creator-card-avatar{width:44px;height:44px;border-radius:50%;border:3px solid var(--bg3);margin:-22px auto 0;position:relative;overflow:hidden;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff}
.creator-card-info{padding:6px 10px 10px;text-align:center}
.creator-card-name{font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.creator-card-xp{font-size:11px;color:var(--gold);font-weight:700;margin-top:2px}
.action-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:0 16px;margin-bottom:100px}
.action-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px 14px;text-decoration:none;color:var(--text);display:block;transition:background .2s}
.action-card:active{background:rgba(255,255,255,.09)}
.action-card-icon{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px}
.action-card-title{font-size:13px;font-weight:700}
.action-card-sub{font-size:11px;color:var(--muted);margin-top:3px}
/* ── PLUS SHEET ── */
.plus-sheet{position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .25s}
.plus-sheet.open{opacity:1;pointer-events:all}
.plus-sheet-inner{width:100%;max-width:480px;background:var(--bg3);border-radius:20px 20px 0 0;padding:20px 20px 40px;transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1)}
.plus-sheet.open .plus-sheet-inner{transform:translateY(0)}
/* 5-item nav fit */
.nav-item{padding:4px 6px}
.nav-plus{width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;border:none;cursor:pointer;align-self:center;margin-top:-2px;flex-shrink:0}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.skeleton{background:linear-gradient(90deg,var(--bg3) 25%,var(--bg4) 50%,var(--bg3) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px}
.fade-in{animation:fadeIn .35s ease forwards}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.page-transition{animation:fadeIn .25s ease forwards}
`;

function layout(content, session, page='feed', lang='de') {
    return `<!DOCTYPE html><html lang="${lang}" data-theme="light">
<head>
<script>try{var t=localStorage.getItem('cbTheme4');var dark=(t==='dark');document.documentElement.setAttribute('data-theme',dark?'dark':'light');setTimeout(function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',dark?'#0b0b0e':'#ffffff');var sb=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(sb)sb.setAttribute('content',dark?'black-translucent':'default');},0);}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0b0e" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" href="/icon-512.png?v=23">
<link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png?v=23">
<meta name="apple-mobile-web-app-title" content="CreatorX">
<title>CreatorX</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap" media="print" onload="this.media='all'">
${session ? `<link rel="prefetch" href="/feed"><link rel="prefetch" href="/explore"><link rel="prefetch" href="/nachrichten"><link rel="prefetch" href="/profil">` : ''}
<style>${CSS}</style>
</head>
<body>
<div class="toast" id="toast"></div>
<a href="/download-app" id="apk-download-btn" style="display:none;position:fixed;bottom:calc(120px + var(--safe-bottom,0px));left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;border-radius:24px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;z-index:9997;text-decoration:none;white-space:nowrap;box-shadow:0 4px 16px rgba(34,197,94,.4)">📦 APK herunterladen</a>
<div id="pwa-install-btn" onclick="installPWA()" style="display:none;position:fixed;bottom:calc(70px + var(--safe-bottom,0px));left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#ff6b6b,#cc5de8);color:#fff;border:none;border-radius:24px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;z-index:9998;gap:8px;align-items:center;box-shadow:0 4px 16px rgba(255,107,107,.4);white-space:nowrap">📲 App installieren</div>
<div class="plus-sheet" id="plus-sheet" onclick="if(event.target===this)closePlusSheet()">
  <div class="plus-sheet-inner">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <span style="font-size:16px;font-weight:700">📸 Reel Link teilen</span>
      <button onclick="closePlusSheet()" style="background:var(--bg4);border:none;color:var(--text);border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
    </div>
    <div id="plus-link-status" style="border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)">
      <span id="plus-link-status-icon">⏳</span>
      <span id="plus-link-status-text" style="color:var(--muted)">Wird geladen...</span>
    </div>
    <input type="url" id="plus-link-input" class="form-input" placeholder="https://www.instagram.com/reel/..." style="margin-bottom:8px">
    <textarea id="plus-link-caption" class="form-input" placeholder="Beschreibung (optional)..." maxlength="200" rows="2" style="margin-bottom:8px"></textarea>
    <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;margin-bottom:12px">
      <input type="checkbox" id="plus-pin-toggle" style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer">
      <div><div style="font-size:13px;font-weight:600">📌 Als angepinnten Post setzen</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Erscheint oben im Profil · max 1 Pin</div></div>
    </label>
    <button class="btn btn-primary btn-full" id="plus-post-btn" onclick="plusPostLink()">📸 Link teilen</button>
    <div id="plus-link-result" style="margin-top:8px;font-size:12px;text-align:center;color:var(--muted)"></div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border2)">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Engagement</div>
      <button class="btn btn-full" onclick="closePlusSheet();setTimeout(()=>{if(typeof openSLSheet==='function')openSLSheet();else location.href='/feed?tab=engagement&opensl=1';},200)" style="background:linear-gradient(135deg,rgba(245,158,11,.15),rgba(245,158,11,.05));border:1px solid rgba(245,158,11,.3);color:#f59e0b;font-weight:700">⭐ Superlink posten</button>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;text-align:center">Alle Mitglieder müssen deinen Link liken, kommentieren & teilen</div>
    </div>
  </div>
</div>
<div class="liker-modal" id="liker-modal" onclick="if(event.target===this)closeLikerModal()">
  <div class="liker-modal-sheet">
    <div style="padding:14px 16px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg3);z-index:1">
      <span style="font-size:14px;font-weight:700">❤️ Wer hat geliked?</span>
      <button onclick="closeLikerModal()" style="background:var(--bg4);border:none;color:var(--text);border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
    </div>
    <div id="liker-modal-content" style="padding:4px 0"></div>
    <div style="padding:12px 16px 28px">
      <button onclick="closeLikerModal()" style="width:100%;background:var(--bg4);border:none;color:var(--text);border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font)">Schließen</button>
    </div>
  </div>
</div>
<div id="crop-overlay" style="position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s;padding:16px">
  <div style="width:100%;max-width:380px">
    <div style="text-align:center;font-size:15px;font-weight:700;color:#fff;margin-bottom:16px">Bild positionieren</div>
    <div id="crop-vp" style="position:relative;overflow:hidden;background:#111;border-radius:12px;border:2px solid rgba(255,255,255,.15);cursor:grab;touch-action:none;user-select:none;width:100%;aspect-ratio:1">
      <img id="crop-img" style="position:absolute;transform-origin:0 0;max-width:none;pointer-events:none;user-select:none" src="" alt="">
    </div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:4px">
      <div style="font-size:11px;color:rgba(255,255,255,.5);text-align:center">Zoom</div>
      <input type="range" id="crop-zoom" style="width:100%;accent-color:var(--accent)" min="0.1" max="3" step="0.001" value="1" oninput="setCropZoom(parseFloat(this.value))">
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button onclick="closeCropModal()" style="flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font)">Abbrechen</button>
      <button onclick="confirmCrop()" style="flex:2;background:var(--accent);border:none;color:#fff;border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font)">✅ Übernehmen</button>
    </div>
  </div>
</div>
${content}
${session ? `
<nav class="bottom-nav">
  <a href="/feed" class="nav-item ${page==='feed'?'active':''}">
    <svg viewBox="0 0 24 24" fill="${page==='feed'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    ${page==='feed'?'<div class="nav-dot"></div>':''}
  </a>
  <a href="/explore" class="nav-item ${page==='explore'?'active':''}">
    <svg viewBox="0 0 24 24" fill="${page==='explore'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    ${page==='explore'?'<div class="nav-dot"></div>':''}
  </a>
  <button class="nav-plus" onclick="openPlusSheet()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  </button>
  <a href="/nachrichten" class="nav-item ${page==='messages'?'active':''}" style="position:relative">
    <svg viewBox="0 0 24 24" fill="${page==='messages'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <div id="msg-badge" style="display:none;position:absolute;top:0;right:0;background:#ff6b6b;color:#fff;border-radius:50%;min-width:16px;height:16px;font-size:9px;font-weight:700;align-items:center;justify-content:center;padding:0 3px;line-height:16px;text-align:center"></div>
    ${page==='messages'?'<div class="nav-dot"></div>':''}
  </a>
  <a href="/profil" class="nav-item ${page==='profile'?'active':''}">
    <svg viewBox="0 0 24 24" fill="${page==='profile'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    ${page==='profile'?'<div class="nav-dot"></div>':''}
  </a>
</nav>` : ''}
<script>
// Instant nav visual feedback
(function(){
  document.addEventListener('click',function(e){
    var a=e.target.closest('a.nav-item');
    if(!a)return;
    document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
    a.classList.add('active');
  });
})();
async function checkNotifBadge(){
    try {
        const r = await fetch('/api/notifications/count');
        const d = await r.json();
        const badge = document.getElementById('notif-badge');
        if(badge){
            if(d.count>0){badge.textContent=d.count>9?'9+':d.count;badge.style.display='flex';}
            else badge.style.display='none';
        }
    } catch(e){}
}
checkNotifBadge();
setInterval(checkNotifBadge, 60000);

// Bfcache-Fix: wenn der User von Instagram/anderer Seite zurückkommt
window.addEventListener('pageshow', function(ev){
  if (ev.persisted) { location.reload(); return; }
  if (!document.body || document.body.children.length < 2) location.reload();
});
document.addEventListener('visibilitychange', function(){
  if (!document.hidden) {
    if (document.body && document.body.children.length < 2) location.reload();
  }
});

// "Zurück zur App" Floating-Banner: wenn User auf externen Link klickt
(function(){
  let waitingReturn = false;
  document.addEventListener('click', function(ev){
    const a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const isExternal = /^https?:\/\//i.test(href) && !href.includes(location.host);
    if (!isExternal) return;
    waitingReturn = true;
  }, true);
  function showBackBanner(){
    if (!waitingReturn) return;
    waitingReturn = false;
    if (document.getElementById('back-to-app-banner')) return;
    const b = document.createElement('div');
    b.id = 'back-to-app-banner';
    b.style.cssText = 'position:fixed;top:max(10px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#0866FF,#0653cc);color:#fff;padding:11px 18px;border-radius:999px;font-size:13.5px;font-weight:700;box-shadow:0 8px 24px rgba(8,102,255,0.4);z-index:9999;display:flex;align-items:center;gap:8px;cursor:pointer;animation:btb-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg> Zurück zur App';
    b.onclick = () => b.remove();
    document.body.appendChild(b);
    setTimeout(() => { if (document.getElementById('back-to-app-banner')) b.remove(); }, 6000);
    if (!document.getElementById('btb-style')) {
      const st = document.createElement('style'); st.id = 'btb-style';
      st.textContent = '@keyframes btb-in{from{opacity:0;transform:translate(-50%,-30px)}to{opacity:1;transform:translate(-50%,0)}}';
      document.head.appendChild(st);
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) showBackBanner(); });
  window.addEventListener('focus', showBackBanner);
  window.addEventListener('pageshow', showBackBanner);
})();
async function checkMsgBadge(){
    try{
        const r=await fetch('/api/messages-count');
        const d=await r.json();
        const b=document.getElementById('msg-badge');
        if(b){if(d.count>0){b.textContent=d.count>9?'9+':d.count;b.style.display='flex';}else b.style.display='none';}
    }catch(e){}
}
checkMsgBadge();
setInterval(checkMsgBadge,30000);
function toast(msg,dur=2500){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('cbTheme4',t);}catch(e){}document.querySelectorAll('[title="Theme"]').forEach(b=>b.textContent=t==='dark'?'☀️':'🌙');fetch('/api/theme',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t})}).catch(()=>{});}
try{const t=localStorage.getItem('cbTheme4');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}
function setLang(l){fetch('/api/lang',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:l})}).then(()=>location.reload());}
async function openPlusSheet(){
  const s=document.getElementById('plus-sheet');
  if(!s)return;
  s.classList.add('open');document.body.style.overflow='hidden';
  const i=document.getElementById('plus-link-input');if(i)setTimeout(()=>i.focus(),300);
  // Lade Link-Status
  try{
    const r=await fetch('/api/link-status');
    const st=await r.json();
    const icon=document.getElementById('plus-link-status-icon');
    const txt=document.getElementById('plus-link-status-text');
    const btn=document.getElementById('plus-post-btn');
    if(st.isAdmin){
      icon.textContent='👑';txt.textContent='Admin — unbegrenzte Links';txt.style.color='#ffd43b';
      if(btn)btn.disabled=false;
    } else if(st.canPost && st.todayCount===0){
      icon.textContent='✅';txt.textContent='1 kostenloser Link heute verfügbar';txt.style.color='#00c851';
      if(btn)btn.disabled=false;
    } else if(st.canPost && st.bonusLinks>0){
      icon.textContent='💎';txt.textContent=st.bonusLinks+' Extra-Link'+(st.bonusLinks>1?'s':'')+' verfügbar — wird nach dem Posten verbraucht';txt.style.color='#a78bfa';
      if(btn)btn.disabled=false;
    } else if(st.canPost && st.badgeBonus>0){
      icon.textContent='🏅';txt.textContent='Erfahrener Extra-Link heute verfügbar';txt.style.color='#8b5cf6';
      if(btn)btn.disabled=false;
    } else {
      icon.textContent='❌';txt.textContent='Limit erreicht — kein Extra-Link vorhanden. Im Shop kaufen: 5 💎';txt.style.color='rgba(239,68,68,.9)';
      if(btn){btn.disabled=true;btn.style.opacity='.45';}
    }
  }catch(e){
    const txt=document.getElementById('plus-link-status-text');
    if(txt){txt.textContent='Status nicht ladbar';txt.style.color='var(--muted)';}
  }
}
function closePlusSheet(){const s=document.getElementById('plus-sheet');if(s){s.classList.remove('open');document.body.style.overflow='';const btn=document.getElementById('plus-post-btn');if(btn){btn.disabled=false;btn.style.opacity='';btn.textContent='📸 Link teilen';}}}
async function plusPostLink(){
  const url=(document.getElementById('plus-link-input')?.value||'').trim();
  const result=document.getElementById('plus-link-result');
  if(!url){result.textContent='❌ Bitte Link eingeben';return;}
  if(!url.includes('instagram.com')){result.textContent='❌ Nur Instagram Links erlaubt';return;}
  const btn=document.getElementById('plus-post-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Wird gesendet...';}
  try{
    const caption=(document.getElementById('plus-link-caption')?.value||'').trim();
    const pin=document.getElementById('plus-pin-toggle')?.checked||false;
    const res=await fetch('/api/post-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,caption})});
    const data=await res.json();
    if(data.ok){
      if(pin){await fetch('/api/set-pinned-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});}
      result.textContent=pin?'✅ Geteilt & angepinnt!':'✅ Link erfolgreich geteilt!';
      document.getElementById('plus-link-input').value='';
      document.getElementById('plus-link-caption').value='';
      if(document.getElementById('plus-pin-toggle'))document.getElementById('plus-pin-toggle').checked=false;
      setTimeout(()=>closePlusSheet(),1500);
    } else result.textContent='❌ '+(data.error||'Fehler');
  }catch(e){result.textContent='❌ Netzwerkfehler';}
  if(btn){btn.disabled=false;btn.style.opacity='';btn.textContent='📸 Link teilen';}
}
function showLikerModal(msgId){const modal=document.getElementById('liker-modal');const content=document.getElementById('liker-modal-content');const rows=document.getElementById('liker-rows-'+msgId);if(!modal||!rows)return;content.innerHTML=rows.innerHTML||'<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Noch niemand geliked</div>';modal.classList.add('open');document.body.style.overflow='hidden';}
function closeLikerModal(){const modal=document.getElementById('liker-modal');if(modal){modal.classList.remove('open');document.body.style.overflow='';} }
// ── CROP MODAL ──
let _cropCb=null,_cropDrag={on:false,sx:0,sy:0,ox:0,oy:0},_cropPinch=0;
let _cs={x:0,y:0,z:1,vpW:0,vpH:0,nw:0,nh:0};
function openCropModal(dataUrl,mode,cb){
  _cropCb=cb;
  const vp=document.getElementById('crop-vp'),img=document.getElementById('crop-img'),sl=document.getElementById('crop-zoom');
  const size=Math.min(window.innerWidth-32,360);
  vp.style.width=size+'px';
  if(mode==='banner'){vp.style.height=Math.round(size/3.5)+'px';vp.style.borderRadius='12px';vp.style.aspectRatio='';}
  else{vp.style.height=size+'px';vp.style.borderRadius=mode==='circle'?'50%':'12px';vp.style.aspectRatio='';}
  img.src=dataUrl;
  img.onload=function(){
    _cs.nw=img.naturalWidth;_cs.nh=img.naturalHeight;
    _cs.vpW=size;_cs.vpH=parseInt(vp.style.height);
    const minZ=Math.max(_cs.vpW/_cs.nw,_cs.vpH/_cs.nh);
    _cs.z=minZ;sl.min=(minZ*0.9).toFixed(3);sl.max=(minZ*4).toFixed(3);sl.value=minZ;
    _cs.x=(_cs.vpW-_cs.nw*_cs.z)/2;_cs.y=(_cs.vpH-_cs.nh*_cs.z)/2;
    _updateCropImg();
  };
  const ov=document.getElementById('crop-overlay');ov.style.opacity='1';ov.style.pointerEvents='all';
}
function closeCropModal(){const ov=document.getElementById('crop-overlay');ov.style.opacity='0';ov.style.pointerEvents='none';}
function _updateCropImg(){const img=document.getElementById('crop-img');img.style.width=(_cs.nw*_cs.z)+'px';img.style.height=(_cs.nh*_cs.z)+'px';img.style.left=_cs.x+'px';img.style.top=_cs.y+'px';}
function setCropZoom(nz){const cx=_cs.vpW/2,cy=_cs.vpH/2,r=nz/_cs.z;_cs.x=cx-(cx-_cs.x)*r;_cs.y=cy-(cy-_cs.y)*r;_cs.z=nz;_updateCropImg();}
function confirmCrop(){
  const img=document.getElementById('crop-img');
  const srcX=(-_cs.x)/_cs.z,srcY=(-_cs.y)/_cs.z,srcW=_cs.vpW/_cs.z,srcH=_cs.vpH/_cs.z;
  const outW=Math.min(1200,_cs.vpW*2),outH=Math.round(outW*(_cs.vpH/_cs.vpW));
  const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
  canvas.getContext('2d').drawImage(img,srcX,srcY,srcW,srcH,0,0,outW,outH);
  closeCropModal();if(_cropCb)_cropCb(canvas.toDataURL('image/jpeg',0.92));
}
(function(){
  const vp=document.getElementById('crop-vp');if(!vp)return;
  vp.addEventListener('pointerdown',e=>{_cropDrag.on=true;_cropDrag.sx=e.clientX;_cropDrag.sy=e.clientY;_cropDrag.ox=_cs.x;_cropDrag.oy=_cs.y;vp.setPointerCapture(e.pointerId);e.preventDefault();});
  vp.addEventListener('pointermove',e=>{if(!_cropDrag.on)return;_cs.x=_cropDrag.ox+(e.clientX-_cropDrag.sx);_cs.y=_cropDrag.oy+(e.clientY-_cropDrag.sy);_updateCropImg();});
  vp.addEventListener('pointerup',()=>{_cropDrag.on=false;});vp.addEventListener('pointercancel',()=>{_cropDrag.on=false;});
  vp.addEventListener('wheel',e=>{e.preventDefault();const sl=document.getElementById('crop-zoom');const nz=Math.max(parseFloat(sl.min),Math.min(parseFloat(sl.max),_cs.z*(1-e.deltaY*0.001)));setCropZoom(nz);sl.value=nz;},{passive:false});
  vp.addEventListener('touchstart',e=>{if(e.touches.length===2)_cropPinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);},{passive:true});
  vp.addEventListener('touchmove',e=>{if(e.touches.length===2){e.preventDefault();const sl=document.getElementById('crop-zoom');const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);const nz=Math.max(parseFloat(sl.min),Math.min(parseFloat(sl.max),_cs.z*(d/_cropPinch)));setCropZoom(nz);sl.value=nz;_cropPinch=d;}},{passive:false});
})();
</script>
<script>
(function(){
  if(!('serviceWorker' in navigator))return;
  // Alte SWs entfernen die noch gecacht haben
  navigator.serviceWorker.getRegistrations().then(regs=>{
    regs.forEach(r=>{if(r.active&&r.active.scriptURL&&!r.active.scriptURL.includes('/sw.js'))r.unregister();});
  });
  navigator.serviceWorker.register('/sw.js').then(async reg=>{
    reg.update();
    // Update-Banner: wenn neuer SW im hintergrund installiert wird, kurzen prompt zeigen
    let __updPromptShown = false;
    function showUpdatePrompt(){
      if (__updPromptShown) return; __updPromptShown = true;
      let b = document.getElementById('cx-update-prompt');
      if (b) return;
      b = document.createElement('div');
      b.id = 'cx-update-prompt';
      b.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:99999;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border-radius:14px;padding:10px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 30px rgba(124,58,237,0.45);max-width:340px;font-size:13.5px;font-weight:600;cursor:pointer;animation:cx-up-in .35s cubic-bezier(.16,1,.3,1)';
      b.innerHTML = '<span style="font-size:20px">🔄</span><div style="flex:1;line-height:1.3">App aktualisiert<div style="font-size:11.5px;font-weight:500;opacity:.9;margin-top:1px">Tippe zum Neuladen</div></div><span style="font-size:14px;opacity:.85">→</span>';
      b.onclick = ()=>{ try{ caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))); }catch(e){} location.reload(); };
      document.body.appendChild(b);
    }
    if (!document.getElementById('cx-up-in-keyframes')) {
      const s = document.createElement('style'); s.id='cx-up-in-keyframes';
      s.textContent='@keyframes cx-up-in{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(s);
    }
    if (reg.waiting) showUpdatePrompt();
    reg.addEventListener('updatefound',()=>{
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange',()=>{
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdatePrompt();
      });
    });
    if(!('PushManager' in window))return;
    try{
      const kr=await fetch('/api/vapid-public-key');const {key}=await kr.json();
      const raw=key.replace(/-/g,'+').replace(/_/g,'/');
      const pad=raw+'='.repeat((4-raw.length%4)%4);
      const bytes=Uint8Array.from(atob(pad),c=>c.charCodeAt(0));
      const existing=await reg.pushManager.getSubscription();
      const sub=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      await fetch('/api/push-subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sub:sub.toJSON()})});
    }catch(e){}
  }).catch(()=>{});
  // APK-Download Button: nur auf Android anzeigen wenn APK vorhanden
  if(/Android/i.test(navigator.userAgent)){fetch('/download-app',{method:'HEAD'}).then(r=>{if(r.ok){const b=document.getElementById('apk-download-btn');if(b)b.style.display='block';}}).catch(()=>{});}
  let _installPrompt=null;
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    _installPrompt=e;
    const b=document.getElementById('pwa-install-btn');
    if(b)b.style.display='flex';
  });
  window.installPWA=async function(){
    if(_installPrompt){
      _installPrompt.prompt();
      await _installPrompt.userChoice;
      _installPrompt=null;
      const b=document.getElementById('pwa-install-btn');
      if(b)b.style.display='none';
    } else {
      window.showInstallGuide();
    }
  };
  window.showInstallGuide=function(){
    let m=document.getElementById('install-guide-modal');
    if(!m){m=document.createElement('div');m.id='install-guide-modal';m.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';m.onclick=function(e){if(e.target===m)m.remove();};document.body.appendChild(m);}
    const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
    m.innerHTML='<div style="background:#1a1a2e;border-radius:24px 24px 0 0;padding:24px 20px 40px;width:100%;max-width:480px;border-top:3px solid #ff6b6b"><div style="width:36px;height:4px;background:#444;border-radius:4px;margin:0 auto 20px"></div><div style="font-size:18px;font-weight:800;text-align:center;margin-bottom:6px">📲 App installieren</div><div style="font-size:13px;color:#aaa;text-align:center;margin-bottom:22px">So fügst du CreatorX zum Startbildschirm hinzu:</div>'
      +(isIOS
        ?'<div style="display:flex;flex-direction:column;gap:12px"><div style="background:#fff1;border-radius:14px;padding:14px 16px;display:flex;gap:14px;align-items:center"><div style="font-size:26px">1️⃣</div><div><div style="font-weight:700;font-size:14px">Teilen-Symbol tippen ⬆️</div><div style="font-size:12px;color:#aaa">Unten in der Mitte der Leiste</div></div></div><div style="background:#fff1;border-radius:14px;padding:14px 16px;display:flex;gap:14px;align-items:center"><div style="font-size:26px">2️⃣</div><div><div style="font-weight:700;font-size:14px">„Zum Home-Bildschirm"</div><div style="font-size:12px;color:#aaa">Nach unten scrollen, antippen</div></div></div><div style="background:#fff1;border-radius:14px;padding:14px 16px;display:flex;gap:14px;align-items:center"><div style="font-size:26px">3️⃣</div><div><div style="font-weight:700;font-size:14px">„Hinzufügen" drücken</div><div style="font-size:12px;color:#aaa">App erscheint auf dem Homescreen</div></div></div></div>'
        :'<div style="display:flex;flex-direction:column;gap:12px"><div style="background:#fff1;border-radius:14px;padding:14px 16px;display:flex;gap:14px;align-items:center"><div style="font-size:26px">1️⃣</div><div><div style="font-weight:700;font-size:14px">Oben rechts ⋮ tippen</div><div style="font-size:12px;color:#aaa">Die drei Punkte im Browser-Menü</div></div></div><div style="background:#fff1;border-radius:14px;padding:14px 16px;display:flex;gap:14px;align-items:center"><div style="font-size:26px">2️⃣</div><div><div style="font-weight:700;font-size:14px">„App installieren" wählen</div><div style="font-size:12px;color:#aaa">Oder „Zum Startbildschirm hinzufügen"</div></div></div><div style="background:#fff1;border-radius:14px;padding:14px 16px;display:flex;gap:14px;align-items:center"><div style="font-size:26px">3️⃣</div><div><div style="font-weight:700;font-size:14px">„Hinzufügen" bestätigen ✓</div><div style="font-size:12px;color:#aaa">App erscheint auf dem Homescreen</div></div></div></div>')
      +'<button onclick="document.getElementById(\'install-guide-modal\').remove()" style="margin-top:20px;width:100%;padding:14px;border-radius:14px;border:none;background:#ff6b6b;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Verstanden ✓</button></div>';
  };
  window.addEventListener('appinstalled',()=>{
    const b=document.getElementById('pwa-install-btn');
    if(b)b.style.display='none';
  });
})();
</script><!--cx-banner-v20--><style>
#cxInstall { position: fixed; bottom: 84px; right: 16px; z-index: 9998; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; padding: 14px 22px; border-radius: 999px; font-size: 14px; font-weight: 800; box-shadow: 0 8px 24px rgba(255,107,107,0.55); border: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; animation: cxIPop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes cxIPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#cxInstall .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: cxIPulse 1.5s infinite; }
@keyframes cxIPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
#cxHint { position: fixed; bottom: 144px; right: 16px; left: 16px; max-width: 320px; margin-left: auto; z-index: 9999; background: #1a1a1a; color: #fff; padding: 14px 16px; border-radius: 14px; font-size: 13px; line-height: 1.5; box-shadow: 0 12px 32px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); }
#cxHint b { color: #ff6b6b; }
#cxHint .x { float: right; cursor: pointer; opacity: 0.6; font-size: 16px; margin-left: 8px; }
</style>
<script>
(function(){
  if (window.__cxV20) return;
  window.__cxV20 = true;

  // Remove any leftover old banner from earlier versions
  ['cxUpd', 'cxModal'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.remove();
  });

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator && window.navigator.standalone === true);
  }

  if (isStandalone()) return; // bereits installiert -> nichts zeigen

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    var b = document.getElementById('cxInstall');
    if (b) b.remove();
    var h = document.getElementById('cxHint');
    if (h) h.remove();
  });

  function showHint(text) {
    var existing = document.getElementById('cxHint');
    if (existing) existing.remove();
    var h = document.createElement('div');
    h.id = 'cxHint';
    h.innerHTML = '<span class="x">✕</span>' + text;
    h.querySelector('.x').addEventListener('click', function(){ h.remove(); });
    document.body.appendChild(h);
    setTimeout(function(){ if (h.parentNode) h.remove(); }, 12000);
  }

  function mountButton() {
    if (document.getElementById('cxInstall')) return;
    if (!document.body) { setTimeout(mountButton, 100); return; }
    var btn = document.createElement('button');
    btn.id = 'cxInstall';
    btn.innerHTML = '<span class="dot"></span>📱 App installieren';
    btn.addEventListener('click', async function() {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          btn.remove();
        } catch(e) {}
        return;
      }
      // Fallback: Chrome hat beforeinstallprompt noch nicht gefeuert
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
      if (isIOS) {
        showHint('Auf iPhone: Tippe unten auf das <b>Teilen</b>-Symbol und wähle <b>Zum Home-Bildschirm</b>.');
      } else {
        showHint('Tippe oben rechts auf das <b>⋮ Menü</b> und wähle <b>App installieren</b> (oder <b>Zum Startbildschirm</b>).');
      }
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
})();
</script><!--cx-banner-v20--><style>
#cxInstall { position: fixed; bottom: 84px; right: 16px; z-index: 9998; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; padding: 14px 22px; border-radius: 999px; font-size: 14px; font-weight: 800; box-shadow: 0 8px 24px rgba(255,107,107,0.55); border: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; animation: cxIPop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes cxIPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#cxInstall .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: cxIPulse 1.5s infinite; }
@keyframes cxIPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
#cxHint { position: fixed; bottom: 144px; right: 16px; left: 16px; max-width: 320px; margin-left: auto; z-index: 9999; background: #1a1a1a; color: #fff; padding: 14px 16px; border-radius: 14px; font-size: 13px; line-height: 1.5; box-shadow: 0 12px 32px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); }
#cxHint b { color: #ff6b6b; }
#cxHint .x { float: right; cursor: pointer; opacity: 0.6; font-size: 16px; margin-left: 8px; }
</style>
<script>
(function(){
  if (window.__cxV20) return;
  window.__cxV20 = true;

  // Remove any leftover old banner from earlier versions
  ['cxUpd', 'cxModal'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.remove();
  });

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator && window.navigator.standalone === true);
  }

  if (isStandalone()) return; // bereits installiert -> nichts zeigen

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    var b = document.getElementById('cxInstall');
    if (b) b.remove();
    var h = document.getElementById('cxHint');
    if (h) h.remove();
  });

  function showHint(text) {
    var existing = document.getElementById('cxHint');
    if (existing) existing.remove();
    var h = document.createElement('div');
    h.id = 'cxHint';
    h.innerHTML = '<span class="x">✕</span>' + text;
    h.querySelector('.x').addEventListener('click', function(){ h.remove(); });
    document.body.appendChild(h);
    setTimeout(function(){ if (h.parentNode) h.remove(); }, 12000);
  }

  function mountButton() {
    if (document.getElementById('cxInstall')) return;
    if (!document.body) { setTimeout(mountButton, 100); return; }
    var btn = document.createElement('button');
    btn.id = 'cxInstall';
    btn.innerHTML = '<span class="dot"></span>📱 App installieren';
    btn.addEventListener('click', async function() {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          btn.remove();
        } catch(e) {}
        return;
      }
      // Fallback: Chrome hat beforeinstallprompt noch nicht gefeuert
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
      if (isIOS) {
        showHint('Auf iPhone: Tippe unten auf das <b>Teilen</b>-Symbol und wähle <b>Zum Home-Bildschirm</b>.');
      } else {
        showHint('Tippe oben rechts auf das <b>⋮ Menü</b> und wähle <b>App installieren</b> (oder <b>Zum Startbildschirm</b>).');
      }
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
})();
</script></body></html>`;
}

function profileCard(uid, u, d, isOwn=false, lang='de', adminIds=[], bannerData=null, picData=null) {
    const xp = u.xp||0;
    const nb = xpNext(xp);
    const grad = badgeGradient(u.role);
    const banner = bannerData || ladeBild(uid, 'banner') || u.banner || 'linear-gradient(135deg,#667eea,#764ba2)';
    const bannerIsGrad = !banner.startsWith('data:image') && !banner.startsWith('http');
    const instaUrl = u.instagram ? `https://instagram.com/${u.instagram}` : null;
    const sorted = Object.entries(d.users||{}).filter(([,u])=>u.role!=='⚙️ Admin').sort((a,b)=>(b[1].xp||0)-(a[1].xp||0));
    const isAdmin = adminIds.includes(Number(uid));
    const rank = isAdmin ? 0 : sorted.findIndex(([id])=>id===uid)+1;

    return `
<div style="position:relative">
  <div class="profile-banner" style="${bannerIsGrad ? 'background:'+banner : ''}">
    ${!bannerIsGrad ? '<img src="'+banner+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">' : ''}
    <div class="profile-banner-overlay"></div>
  </div>
  <div class="profile-avatar-wrap">
    ${(picData||ladeBild(uid,'profilepic'))
      ? `<img src="${picData||ladeBild(uid,'profilepic')}" class="profile-avatar" style="${getRingBoxShadow(u)}" onerror="this.style.display='none'" alt="">`
      : u.instagram
      ? `<img src="https://unavatar.io/instagram/${u.instagram}" class="profile-avatar" style="${getRingBoxShadow(u)}" onerror="this.style.display='none'" alt="">`
      : `<div class="profile-avatar" style="display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;background:${grad};color:#fff${getRingBoxShadow(u)}">${(u.name||'?').slice(0,2).toUpperCase()}</div>`}
    ${isUidOnline(uid)?'<div class="profile-online-dot" title="Online"></div>':''}
    ${![...sessions.values()].some(s=>String(s.uid)===String(uid))?`<div style="position:absolute;bottom:6px;right:6px;background:rgba(15,15,15,.92);border:1.5px solid #555;border-radius:20px;padding:2px 7px;font-size:10px;color:#888;z-index:2;font-weight:600;white-space:nowrap">Kein Web</div>`:''}
  </div>
  ${isOwn?`<div style="position:absolute;top:12px;right:12px;display:flex;gap:8px;z-index:3">
    <a href="/einstellungen" class="profile-action-pill" title="Bearbeiten"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>Bearbeiten</span></a>
  </div>`:''}
</div>
<div class="profile-info">
  <div class="profile-name-row">
    <div class="profile-name">${htmlEsc(u.spitzname||u.name||'User')}</div>
    <div class="profile-badge" style="background:${grad};color:#fff">${htmlEsc(u.role||'🆕 New')}</div>
  </div>
  ${u.username||u.spitzname?`<div class="profile-username">${u.spitzname?htmlEsc(u.name||''):''}${u.username?(u.spitzname?' · ':'')+'@'+htmlEsc(u.username):''}</div>`:''}
  <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
    ${isUidOnline(uid) ? '<span class="profile-status-pill online">● Online</span>' : '<span class="profile-status-pill offline">○ Offline</span>'}
    ${rank>0?`<span class="profile-status-pill"><span style="opacity:0.65">Rang</span> #${rank}</span>`:''}
  </div>
  ${u.bio?`<div class="profile-bio">${htmlEsc(u.bio)}</div>`:''}
  <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
    ${u.nische?`<span class="profile-meta-chip"><span style="opacity:0.7">🎯</span> ${htmlEsc(u.nische)}</span>`:''}
    ${(()=>{const sw=safeUrl(u.website);return sw?`<a href="${htmlEsc(sw)}" target="_blank" rel="noopener noreferrer" class="profile-meta-chip" style="text-decoration:none">🔗 ${htmlEsc(sw.replace(/^https?:\/\//i,'').replace(/\/$/, '').slice(0,30))}</a>`:'';})()}
    ${instaUrl?`<a href="${htmlEsc(instaUrl)}" target="_blank" rel="noopener noreferrer" class="profile-meta-chip" style="text-decoration:none">📸 @${htmlEsc(u.instagram)}</a>`:''}
  </div>
  ${u.trophies&&u.trophies.length?`
  <div style="margin-top:14px;padding:12px 14px;background:linear-gradient(135deg,rgba(245,158,11,0.06),rgba(167,139,250,0.06));border:1px solid rgba(245,158,11,0.18);border-radius:14px">
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.4px;margin-bottom:8px;font-weight:800">🏆 Trophäen</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${u.trophies.map(t=>`<span style="font-size:22px;background:var(--bg4);border-radius:8px;padding:4px 8px">${t}</span>`).join('')}
    </div>
  </div>`:''}
</div>
<div class="profile-stats">
  ${!isAdmin?`<div class="profile-stat"><div class="profile-stat-val" data-count="${xp}">0</div><div class="profile-stat-label">XP</div></div>`:''}
  <div class="profile-stat"><div class="profile-stat-val" data-count="${u.links||0}">0</div><div class="profile-stat-label">Links</div></div>
  <div class="profile-stat"><div class="profile-stat-val" data-count="${(u.followers||[]).length}">0</div><div class="profile-stat-label">Follower</div></div>
  <div class="profile-stat"><div class="profile-stat-val">🔥 <span data-count="${u.streak||0}">0</span></div><div class="profile-stat-label">Streak</div></div>
  <a href="/diamanten" class="profile-stat" style="text-decoration:none;color:inherit;cursor:pointer"><div class="profile-stat-val">💎 <span data-count="${u.diamonds||0}">0</span></div><div class="profile-stat-label" style="display:flex;align-items:center;justify-content:center;gap:3px">Diamanten <span style="font-size:9px;opacity:0.6">ⓘ</span></div></a>
</div>
<script>(function(){
  if (window.__cbStatCountUp) return; window.__cbStatCountUp = true;
  function animOne(el){
    if (el._done) return; el._done = true;
    const target = parseInt(el.getAttribute('data-count'),10) || 0;
    if (target === 0) { el.textContent = '0'; return; }
    const dur = Math.min(900, 350 + target*8);
    const t0 = performance.now();
    function tick(now){
      const p = Math.min(1, (now-t0)/dur);
      const eased = 1 - Math.pow(1-p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('de-DE');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function run(){ document.querySelectorAll('[data-count]').forEach(animOne); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();</script>
${(()=>{
  const wkKey = (()=>{const n=new Date();const dd=n.getDay();const mon=new Date(n);mon.setDate(n.getDate()-(dd===0?6:dd-1));return mon.toISOString().slice(0,10);})();
  const slMaxC = (u.role === '🌟 Elite+') ? 2 : 1;
  const slCountC = Object.values(d.superlinks||{}).filter(s=>s.uid===uid&&s.week===wkKey).length;
  const slLeftC = Math.max(0, slMaxC - slCountC);
  const bonusC = (d.bonusLinks||{})[uid] || 0;
  return `<div class="profile-slots">
    <div class="profile-slot-card">
      <div class="profile-slot-icon">⭐</div>
      <div class="profile-slot-info">
        <div class="profile-slot-label">Superlink</div>
        <div class="profile-slot-val ${slLeftC>0?'ok':'zero'}">${slLeftC} <span class="small">/ ${slMaxC} verfügbar</span></div>
      </div>
    </div>
    <div class="profile-slot-card lnk">
      <div class="profile-slot-icon">🔗</div>
      <div class="profile-slot-info">
        <div class="profile-slot-label">Extra-Links</div>
        <div class="profile-slot-val ${bonusC>0?'ok':'zero'}">${bonusC} <span class="small">verfügbar</span></div>
      </div>
    </div>
  </div>`;
})()}
${nb?`
<div class="profile-xp-bar"><div class="profile-xp-fill" style="width:${nb.pct}%;background:${grad}"></div></div>
<div class="profile-xp-info"><span>Noch <b>${nb.fehlend}</b> XP bis <b>${nb.ziel}</b></span><span>${nb.pct}%</span></div>`:'<div style="margin:14px 16px;padding:12px 16px;background:linear-gradient(135deg,rgba(255,212,59,.10),rgba(255,165,0,.04));border:1px solid rgba(255,212,59,.3);border-radius:14px;font-size:12.5px;font-weight:700;color:#a16207;display:flex;align-items:center;gap:8px"><span style="font-size:18px">👑</span>Maximales Level erreicht!</div>'}
${(()=>{
  const weekKey = (() => { const n=new Date(); const d=n.getDay(); const mon=new Date(n); mon.setDate(n.getDate()-(d===0?6:d-1)); return mon.toISOString().slice(0,10); })();
  const mySuperlink = Object.values(d.superlinks||{}).find(s=>s.uid===uid&&s.week===weekKey);
  if (!mySuperlink) return '';
  return `<div style="margin:0 16px 16px;background:var(--bg3);border:1px solid rgba(167,139,250,.3);border-radius:16px;padding:14px">
  <div style="font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">⭐ Superlink dieser Woche</div>
  <a href="${mySuperlink.url}" target="_blank" style="font-size:13px;color:#4dabf7;word-break:break-all;display:block;margin-bottom:6px;text-decoration:none">${mySuperlink.url.replace('https://www.instagram.com/','ig.com/').slice(0,50)}</a>
  ${mySuperlink.caption?`<div style="font-size:12px;color:var(--muted)">${mySuperlink.caption.slice(0,80)}</div>`:''}
  <div style="font-size:11px;color:var(--muted);margin-top:6px">❤️ ${mySuperlink.likes?.length||0} Likes</div>
</div>`;
})()}`;
}

// ================================
// ONBOARDING
// ================================
function onboardingHTML(isPreview = false) {
    const finishAction = isPreview
        ? "window.location.href='/einstellungen';"
        : "try{localStorage.setItem('cb_onboarded','1');}catch(e){} fetch('/api/onboarding-done',{method:'POST'}).catch(()=>{}).finally(()=>{window.location.href='/feed';});";

    return `<!DOCTYPE html><html lang="de" data-theme="dark"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>CreatorX — Willkommen</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:'DM Sans',sans-serif;background:#080808;color:#fff;max-width:480px;margin:0 auto}
.ob{position:fixed;inset:0;max-width:480px;margin:0 auto;display:flex;flex-direction:column;overflow:hidden;background:#080808}
.ob-top{position:absolute;top:0;left:0;right:0;z-index:100;padding:env(safe-area-inset-top,14px) 20px 0;padding-top:calc(env(safe-area-inset-top,0px) + 14px);display:flex;justify-content:space-between;align-items:center}
.ob-logo{font-family:'Syne',sans-serif;font-size:18px;font-weight:900;background:linear-gradient(135deg,#ff6b6b,#ffa500);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ob-skip{font-size:13px;color:rgba(255,255,255,.45);cursor:pointer;padding:6px 14px;border-radius:20px;background:rgba(255,255,255,.07);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08)}
.ob-slides{flex:1;position:relative;overflow:hidden}
.ob-slide{position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;transform:translateX(40px);transition:opacity .38s ease,transform .38s cubic-bezier(.4,0,.2,1);pointer-events:none}
.ob-slide.active{opacity:1;transform:translateX(0);pointer-events:auto}
.ob-slide.exit{opacity:0;transform:translateX(-40px);pointer-events:none}
.ob-hero{height:56%;position:relative;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.ob-hbg{position:absolute;inset:0}
.ob-hbg::after{content:'';position:absolute;bottom:0;left:0;right:0;height:55%;background:linear-gradient(to bottom,transparent,#080808)}
.ob-content{flex:1;padding:14px 24px 0;display:flex;flex-direction:column;overflow:hidden}
.ob-step{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8px;opacity:.45}
.ob-title{font-family:'Syne',sans-serif;font-size:26px;font-weight:900;line-height:1.12;margin-bottom:9px}
.ob-desc{font-size:13px;color:rgba(255,255,255,.5);line-height:1.55;margin-bottom:12px}
.ob-facts{display:flex;flex-direction:column;gap:7px;flex:1;min-height:0;overflow:hidden}
.ob-fact{display:flex;align-items:flex-start;gap:10px;padding:10px 13px;background:rgba(255,255,255,.04);border-radius:13px;border:1px solid rgba(255,255,255,.07)}
.ob-fact-i{font-size:16px;flex-shrink:0;line-height:1.1}
.ob-fact-t{font-size:12px;color:rgba(255,255,255,.6);line-height:1.45}
.ob-fact-t b{color:#fff;font-weight:600}
.ob-bottom{padding:12px 22px calc(20px + env(safe-area-inset-bottom,0px));flex-shrink:0}
.ob-prog{display:flex;gap:5px;justify-content:center;margin-bottom:13px;align-items:center}
.ob-pd{height:4px;border-radius:3px;background:rgba(255,255,255,.14);transition:flex .35s ease,background .35s;cursor:pointer;flex:1}
.ob-pd.cur{flex:2.5;background:var(--a,#ff6b6b)}
.ob-pd.done{background:var(--a,#ff6b6b);opacity:.55}
.ob-btn{width:100%;padding:17px;border-radius:16px;border:none;color:#fff;font-size:16px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer;letter-spacing:.2px;transition:transform .12s,opacity .15s;-webkit-tap-highlight-color:transparent}
.ob-btn:active{transform:scale(.97);opacity:.88}
.glass{background:rgba(255,255,255,.05);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.09);border-radius:16px}
${isPreview?'.ob-pb{position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(255,107,107,.92);color:#fff;padding:6px 18px;border-radius:20px;font-size:11px;font-weight:700;z-index:9999;backdrop-filter:blur(10px);white-space:nowrap;box-shadow:0 4px 20px rgba(255,107,107,.4)}':''}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes float2{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes xp-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@keyframes glow{0%,100%{box-shadow:0 0 30px rgba(255,107,107,.35),0 0 60px rgba(255,107,107,.12)}50%{box-shadow:0 0 50px rgba(255,107,107,.55),0 0 90px rgba(255,107,107,.22)}}
</style></head><body>
${isPreview?'<div class="ob-pb">👀 Admin Vorschau &nbsp;·&nbsp; <a href="/einstellungen" style="color:rgba(255,255,255,.75)">← Zurück</a></div>':''}
<div class="ob">
  <div class="ob-top">
    <div class="ob-logo">CreatorX</div>
    <span class="ob-skip" onclick="finish()">Überspringen</span>
  </div>
  <div class="ob-slides" id="slides">

    <!-- ══════════════════════════════════════ SLIDE 1: WELCOME ══ -->
    <div class="ob-slide active" id="slide-0">
      <div class="ob-hero">
        <div class="ob-hbg" style="background:radial-gradient(ellipse at 50% 25%,rgba(255,107,107,.28) 0%,transparent 68%),linear-gradient(180deg,#150505 0%,#080808 100%)"></div>
        <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;margin-top:50px">
          <div style="width:96px;height:96px;border-radius:28px;background:linear-gradient(135deg,#ff6b6b,#ffa500);display:flex;align-items:center;justify-content:center;font-size:48px;animation:float 3s ease-in-out infinite,glow 3s ease-in-out infinite">🚀</div>
          <div style="position:absolute;top:2px;right:-50px;background:rgba(255,215,0,.12);border:1px solid rgba(255,215,0,.3);border-radius:12px;padding:6px 10px;font-size:11px;font-weight:700;color:#ffd43b;animation:float2 3.6s ease-in-out infinite .4s;white-space:nowrap">+5 XP ⚡</div>
          <div style="position:absolute;top:48px;left:-58px;background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.3);border-radius:12px;padding:6px 10px;font-size:11px;font-weight:700;color:#ff6b6b;animation:float2 4.1s ease-in-out infinite 1.1s;white-space:nowrap">❤️ Liken</div>
          <div style="position:absolute;bottom:-14px;right:-44px;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.3);border-radius:12px;padding:6px 10px;font-size:11px;font-weight:700;color:#a78bfa;animation:float2 3.9s ease-in-out infinite .2s;white-space:nowrap">⭐ FE</div>
          <div style="position:absolute;width:180px;height:180px;border-radius:50%;border:1px solid rgba(255,107,107,.12);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none"></div>
          <div style="position:absolute;width:260px;height:260px;border-radius:50%;border:1px solid rgba(255,107,107,.06);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none"></div>
        </div>
      </div>
      <div class="ob-content">
        <div class="ob-step" style="color:#ff6b6b">01 / 05</div>
        <div class="ob-title">Willkommen bei<br><span style="background:linear-gradient(135deg,#ff6b6b,#ffa500);-webkit-background-clip:text;-webkit-text-fill-color:transparent">CreatorX!</span></div>
        <div class="ob-desc">Deine Community für Instagram Creators — wo echtes Engagement zählt und jeder wächst.</div>
        <div class="ob-facts">
          <div class="ob-fact"><span class="ob-fact-i">❤️</span><div class="ob-fact-t"><b>XP-System</b> — Likes geben & erhalten bringt XP und Diamanten</div></div>
          <div class="ob-fact"><span class="ob-fact-i">🔗</span><div class="ob-fact-t"><b>Links teilen</b> — dein Reel täglich in der Community sichtbar machen</div></div>
          <div class="ob-fact"><span class="ob-fact-i">⭐</span><div class="ob-fact-t"><b>Full Engagement</b> — wöchentliches Pflicht-Engagement für alle</div></div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════ SLIDE 2: FEED ══ -->
    <div class="ob-slide" id="slide-1">
      <div class="ob-hero">
        <div class="ob-hbg" style="background:radial-gradient(ellipse at 50% 20%,rgba(255,165,0,.22) 0%,transparent 65%),linear-gradient(180deg,#110900 0%,#080808 100%)"></div>
        <div style="position:relative;z-index:2;width:100%;padding:54px 22px 0">
          <div class="glass" style="border-radius:20px;overflow:hidden">
            <div style="display:flex;align-items:center;gap:11px;padding:11px 14px 9px">
              <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffa500);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;box-shadow:0 0 12px rgba(255,107,107,.35)">MK</div>
              <div style="flex:1"><div style="font-size:13px;font-weight:700">Max K.</div><div style="font-size:10px;color:rgba(255,255,255,.4)">⬆️ Aufsteiger · vor 14 Min.</div></div>
              <div style="font-size:10px;font-weight:700;color:#ff6b6b;background:rgba(255,107,107,.1);padding:4px 9px;border-radius:8px;border:1px solid rgba(255,107,107,.2)">Reel</div>
            </div>
            <div style="height:86px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);position:relative;overflow:hidden">
              <div style="position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,107,107,.08),transparent 60%)"></div>
              <div style="position:absolute;bottom:9px;left:13px;font-size:13px;font-weight:700">Neues Reel 🎬</div>
              <div style="position:absolute;bottom:9px;right:11px;background:#ff6b6b;border-radius:8px;padding:4px 10px;font-size:10px;font-weight:700">Öffnen →</div>
            </div>
            <div style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between">
              <div style="display:flex;align-items:center;gap:16px">
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,107,107,.14);border:1.5px solid rgba(255,107,107,.4);display:flex;align-items:center;justify-content:center;font-size:15px">❤️</div>
                  <span style="font-size:13px;font-weight:700">12</span>
                </div>
                <div style="font-size:11px;color:rgba(255,255,255,.3)">👁️ 48 · 💬 3</div>
              </div>
              <div style="background:linear-gradient(135deg,#ffd43b,#ffa500);border-radius:10px;padding:6px 11px;font-size:12px;font-weight:800;color:#000;animation:xp-bounce 2.2s ease infinite">+5 XP ⚡</div>
            </div>
          </div>
          <div class="glass" style="border-radius:20px;overflow:hidden;margin-top:9px;opacity:.45;transform:scale(.96);transform-origin:top center">
            <div style="display:flex;align-items:center;gap:11px;padding:11px 14px">
              <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#4dabf7,#cc5de8);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">SL</div>
              <div><div style="font-size:13px;font-weight:700">Sara L.</div><div style="font-size:10px;color:rgba(255,255,255,.4)">🏅 Erfahrene</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="ob-content">
        <div class="ob-step" style="color:#ffa500">02 / 05</div>
        <div class="ob-title">Feed &amp; <span style="background:linear-gradient(135deg,#ffa500,#ffd43b);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Liken</span></div>
        <div class="ob-desc">Im Feed siehst du die Reels deiner Community. Jeder Like hilft dem Creator — und bringt dir XP.</div>
        <div class="ob-facts">
          <div class="ob-fact"><span class="ob-fact-i">⚡</span><div class="ob-fact-t">Anderen liken → <b>+5 XP</b> für dich · je aktiver, desto höher dein Rang</div></div>
          <div class="ob-fact"><span class="ob-fact-i">📌</span><div class="ob-fact-t">Angepinnte Posts bleiben <b>dauerhaft ganz oben</b> im Profil</div></div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════ SLIDE 3: LINK TEILEN ══ -->
    <div class="ob-slide" id="slide-2">
      <div class="ob-hero">
        <div class="ob-hbg" style="background:radial-gradient(ellipse at 50% 28%,rgba(124,58,237,.28) 0%,transparent 65%),linear-gradient(180deg,#0a0818 0%,#080808 100%)"></div>
        <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;padding-top:48px;gap:18px">
          <div style="width:82px;height:82px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffa500);display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:300;color:#fff;box-shadow:0 0 0 14px rgba(255,107,107,.13),0 0 0 28px rgba(255,107,107,.06),0 10px 40px rgba(255,107,107,.45);animation:float 3s ease-in-out infinite">+</div>
          <div class="glass" style="width:calc(100% - 44px);border-radius:18px">
            <div style="padding:11px 14px 9px;font-size:12px;font-weight:700;color:rgba(255,255,255,.6);border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:7px"><span>🔗</span> Link teilen</div>
            <div style="padding:9px 13px 12px">
              <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:9px 11px;font-size:11px;color:rgba(255,255,255,.3);margin-bottom:6px;border:1px solid rgba(255,255,255,.07)">instagram.com/reel/...</div>
              <div style="background:linear-gradient(135deg,#ff6b6b,#ffa500);border-radius:10px;padding:10px;font-size:12px;font-weight:700;text-align:center">📸 Jetzt teilen</div>
            </div>
          </div>
        </div>
      </div>
      <div class="ob-content">
        <div class="ob-step" style="color:#a78bfa">03 / 05</div>
        <div class="ob-title">Dein Link in<br><span style="background:linear-gradient(135deg,#a78bfa,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent">die Community</span></div>
        <div class="ob-desc">Tippe auf den <b style="color:#ff6b6b">roten + Button</b> unten in der Mitte, füge deinen Reel Link ein — fertig.</div>
        <div class="ob-facts">
          <div class="ob-fact"><span class="ob-fact-i">🆓</span><div class="ob-fact-t"><b>1 Link pro Tag</b> kostenlos — täglich um Mitternacht erneuert</div></div>
          <div class="ob-fact"><span class="ob-fact-i">💎</span><div class="ob-fact-t">Extra-Links im <b>Shop</b> mit Diamanten kaufen</div></div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════ SLIDE 4: FULL ENGAGEMENT ══ -->
    <div class="ob-slide" id="slide-3">
      <div class="ob-hero">
        <div class="ob-hbg" style="background:radial-gradient(ellipse at 50% 20%,rgba(245,158,11,.25) 0%,transparent 65%),linear-gradient(180deg,#110800 0%,#080808 100%)"></div>
        <div style="position:relative;z-index:2;width:100%;padding:52px 22px 0">
          <div style="background:linear-gradient(135deg,rgba(245,158,11,.18),rgba(239,68,68,.1));border:1px solid rgba(245,158,11,.28);border-radius:18px;padding:12px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px">
            <div style="font-size:26px;animation:float 3s ease-in-out infinite">⭐</div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:800;color:#fbbf24">Full Engagement Thread</div>
              <div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:2px">Mo–Sa · Pflicht für alle Mitglieder</div>
            </div>
            <div style="font-size:10px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,.12);padding:5px 9px;border-radius:8px;border:1px solid rgba(251,191,36,.22);flex-shrink:0">Aktiv</div>
          </div>
          ${[['MK','Max K.','instagram.com/reel/abc...',7],['SL','Sara L.','instagram.com/reel/def...',5]].map(([i,n,u,l])=>`
          <div class="glass" style="border-radius:14px;padding:10px 13px;margin-bottom:8px;display:flex;align-items:center;gap:11px">
            <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700">${n}</div>
              <div style="font-size:10px;color:rgba(255,255,255,.35);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔗 ${u}</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#ff6b6b;flex-shrink:0">❤️ ${l}</div>
          </div>`).join('')}
        </div>
      </div>
      <div class="ob-content">
        <div class="ob-step" style="color:#fbbf24">04 / 05</div>
        <div class="ob-title">Full <span style="background:linear-gradient(135deg,#fbbf24,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Engagement</span></div>
        <div class="ob-desc">Jeden Monat postet jeder einen <b style="color:#fff">Superlink</b>. Alle liken, kommentieren, teilen &amp; speichern gegenseitig.</div>
        <div class="ob-facts">
          <div class="ob-fact"><span class="ob-fact-i">✅</span><div class="ob-fact-t">Mitmachen = <b>XP + Diamanten</b> für alle Beteiligten</div></div>
          <div class="ob-fact" style="border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.06)"><span class="ob-fact-i">⚠️</span><div class="ob-fact-t">Nicht dabei bis Sonntag = <b style="color:#ef4444">−50 XP</b> Strafe</div></div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════ SLIDE 5: RANKING & START ══ -->
    <div class="ob-slide" id="slide-4">
      <div class="ob-hero">
        <div class="ob-hbg" style="background:radial-gradient(ellipse at 50% 20%,rgba(0,200,81,.22) 0%,transparent 65%),linear-gradient(180deg,#001008 0%,#080808 100%)"></div>
        <div style="position:relative;z-index:2;width:100%;padding:52px 22px 0">
          <div style="display:flex;align-items:flex-end;justify-content:center;gap:10px;margin-bottom:14px">
            ${[[2,'🥈','SK','2.850','#9ca3af,#6b7280',58],[1,'🥇','AK','4.200','#fbbf24,#f59e0b',80],[3,'🥉','JB','1.940','#cd7f32,#a0522d',42]].map(([pos,medal,init,xp,grad,h])=>`
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">
              <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.45)">${xp} XP</div>
              <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#${grad});display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;box-shadow:0 4px 20px rgba(${pos===1?'251,191,36':'160,160,160'},.35)">${init}</div>
              <div style="width:100%;height:${h}px;background:linear-gradient(180deg,rgba(${pos===1?'251,191,36':'160,160,160'},.2),rgba(${pos===1?'251,191,36':'160,160,160'},.06));border-radius:9px 9px 0 0;border-top:2px solid rgba(${pos===1?'251,191,36':'160,160,160'},.4);display:flex;align-items:flex-start;justify-content:center;padding-top:8px;font-size:20px">${medal}</div>
            </div>`).join('')}
          </div>
          <div class="glass" style="border-radius:13px;padding:11px 15px;display:flex;align-items:center;gap:11px;border-color:rgba(255,107,107,.2)">
            <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.35);width:20px">#4</div>
            <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffa500);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 0 14px rgba(255,107,107,.4)">Du</div>
            <div style="flex:1"><div style="font-size:12px;font-weight:700">Dein Name</div><div style="font-size:10px;color:rgba(255,255,255,.35)">⬆️ Aufsteiger</div></div>
            <div style="text-align:right"><div style="font-size:12px;font-weight:700;color:#ffd43b">890 XP</div><div style="font-size:10px;color:#a78bfa">💎 18</div></div>
          </div>
        </div>
      </div>
      <div class="ob-content">
        <div class="ob-step" style="color:#00c851">05 / 05</div>
        <div class="ob-title">XP, Diamanten<br>&amp; <span style="background:linear-gradient(135deg,#00c851,#4dabf7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Badges</span></div>
        <div class="ob-desc">Sammle XP durch Aktivität. Mit Diamanten kaufst du Profilrahmen und Extra-Links im <b style="color:#fff">💎 Shop</b>.</div>
        <div class="ob-facts">
          <div class="ob-fact"><span class="ob-fact-i">🏅</span><div class="ob-fact-t">6 Stufen: 🆕 New → 📘 Anfänger → ⬆️ Aufsteiger → 🏅 Erfahrene → 👑 Elite → <b>🌟 Elite+</b></div></div>
          <div class="ob-fact"><span class="ob-fact-i">🎨</span><div class="ob-fact-t">Profilrahmen mit <b>Glow-Effekt</b> im Shop freischalten</div></div>
        </div>
      </div>
    </div>

  </div>

  <div class="ob-bottom">
    <div class="ob-prog" id="prog">
      ${[0,1,2,3,4].map(i=>`<div class="ob-pd${i===0?' cur':''}" id="pd-${i}" onclick="goTo(${i})" style="--a:#ff6b6b"></div>`).join('')}
    </div>
    <button class="ob-btn" id="ob-btn" onclick="next()" style="background:linear-gradient(135deg,#ff6b6b,#ffa500)">Weiter →</button>
  </div>
</div>
<script>
const TOTAL=5;
const GRADS=['linear-gradient(135deg,#ff6b6b,#ffa500)','linear-gradient(135deg,#ffa500,#ffd43b)','linear-gradient(135deg,#a78bfa,#7c3aed)','linear-gradient(135deg,#fbbf24,#f59e0b)','linear-gradient(135deg,#00c851,#4dabf7)'];
const ACCENTS=['#ff6b6b','#ffa500','#a78bfa','#fbbf24','#00c851'];
let cur=0,busy=false;
function goTo(i){
  if(busy||i===cur)return;busy=true;
  const prev=cur;cur=i;
  const sl=document.querySelectorAll('.ob-slide');
  sl[prev].classList.remove('active');sl[prev].classList.add('exit');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{sl[cur].classList.add('active');}));
  setTimeout(()=>{sl[prev].classList.remove('exit');},400);
  document.querySelectorAll('.ob-pd').forEach((d,j)=>{
    d.classList.toggle('cur',j===cur);d.classList.toggle('done',j<cur);
    d.style.setProperty('--a',ACCENTS[cur]);
  });
  const btn=document.getElementById('ob-btn');
  btn.style.background=GRADS[cur];
  btn.textContent=cur===TOTAL-1?"🚀 Los geht's!":'Weiter →';
  setTimeout(()=>busy=false,420);
}
function next(){cur<TOTAL-1?goTo(cur+1):finish();}
function finish(){${finishAction}}
let sx=0;
const sr=document.getElementById('slides');
sr.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});
sr.addEventListener('touchend',e=>{const dx=sx-e.changedTouches[0].clientX;if(Math.abs(dx)>44){dx>0&&cur<TOTAL-1?next():dx<0&&cur>0?goTo(cur-1):null;}},{passive:true});
</script><!--cx-banner-v20--><style>
#cxInstall { position: fixed; bottom: 84px; right: 16px; z-index: 9998; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; padding: 14px 22px; border-radius: 999px; font-size: 14px; font-weight: 800; box-shadow: 0 8px 24px rgba(255,107,107,0.55); border: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; animation: cxIPop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes cxIPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#cxInstall .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: cxIPulse 1.5s infinite; }
@keyframes cxIPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
#cxHint { position: fixed; bottom: 144px; right: 16px; left: 16px; max-width: 320px; margin-left: auto; z-index: 9999; background: #1a1a1a; color: #fff; padding: 14px 16px; border-radius: 14px; font-size: 13px; line-height: 1.5; box-shadow: 0 12px 32px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); }
#cxHint b { color: #ff6b6b; }
#cxHint .x { float: right; cursor: pointer; opacity: 0.6; font-size: 16px; margin-left: 8px; }
</style>
<script>
(function(){
  if (window.__cxV20) return;
  window.__cxV20 = true;

  // Remove any leftover old banner from earlier versions
  ['cxUpd', 'cxModal'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.remove();
  });

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator && window.navigator.standalone === true);
  }

  if (isStandalone()) return; // bereits installiert -> nichts zeigen

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    var b = document.getElementById('cxInstall');
    if (b) b.remove();
    var h = document.getElementById('cxHint');
    if (h) h.remove();
  });

  function showHint(text) {
    var existing = document.getElementById('cxHint');
    if (existing) existing.remove();
    var h = document.createElement('div');
    h.id = 'cxHint';
    h.innerHTML = '<span class="x">✕</span>' + text;
    h.querySelector('.x').addEventListener('click', function(){ h.remove(); });
    document.body.appendChild(h);
    setTimeout(function(){ if (h.parentNode) h.remove(); }, 12000);
  }

  function mountButton() {
    if (document.getElementById('cxInstall')) return;
    if (!document.body) { setTimeout(mountButton, 100); return; }
    var btn = document.createElement('button');
    btn.id = 'cxInstall';
    btn.innerHTML = '<span class="dot"></span>📱 App installieren';
    btn.addEventListener('click', async function() {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          btn.remove();
        } catch(e) {}
        return;
      }
      // Fallback: Chrome hat beforeinstallprompt noch nicht gefeuert
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
      if (isIOS) {
        showHint('Auf iPhone: Tippe unten auf das <b>Teilen</b>-Symbol und wähle <b>Zum Home-Bildschirm</b>.');
      } else {
        showHint('Tippe oben rechts auf das <b>⋮ Menü</b> und wähle <b>App installieren</b> (oder <b>Zum Startbildschirm</b>).');
      }
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
})();
</script><!--cx-banner-v20--><style>
#cxInstall { position: fixed; bottom: 84px; right: 16px; z-index: 9998; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: #fff; padding: 14px 22px; border-radius: 999px; font-size: 14px; font-weight: 800; box-shadow: 0 8px 24px rgba(255,107,107,0.55); border: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; animation: cxIPop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes cxIPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#cxInstall .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: cxIPulse 1.5s infinite; }
@keyframes cxIPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
#cxHint { position: fixed; bottom: 144px; right: 16px; left: 16px; max-width: 320px; margin-left: auto; z-index: 9999; background: #1a1a1a; color: #fff; padding: 14px 16px; border-radius: 14px; font-size: 13px; line-height: 1.5; box-shadow: 0 12px 32px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); }
#cxHint b { color: #ff6b6b; }
#cxHint .x { float: right; cursor: pointer; opacity: 0.6; font-size: 16px; margin-left: 8px; }
</style>
<script>
(function(){
  if (window.__cxV20) return;
  window.__cxV20 = true;

  // Remove any leftover old banner from earlier versions
  ['cxUpd', 'cxModal'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.remove();
  });

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator && window.navigator.standalone === true);
  }

  if (isStandalone()) return; // bereits installiert -> nichts zeigen

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    var b = document.getElementById('cxInstall');
    if (b) b.remove();
    var h = document.getElementById('cxHint');
    if (h) h.remove();
  });

  function showHint(text) {
    var existing = document.getElementById('cxHint');
    if (existing) existing.remove();
    var h = document.createElement('div');
    h.id = 'cxHint';
    h.innerHTML = '<span class="x">✕</span>' + text;
    h.querySelector('.x').addEventListener('click', function(){ h.remove(); });
    document.body.appendChild(h);
    setTimeout(function(){ if (h.parentNode) h.remove(); }, 12000);
  }

  function mountButton() {
    if (document.getElementById('cxInstall')) return;
    if (!document.body) { setTimeout(mountButton, 100); return; }
    var btn = document.createElement('button');
    btn.id = 'cxInstall';
    btn.innerHTML = '<span class="dot"></span>📱 App installieren';
    btn.addEventListener('click', async function() {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          btn.remove();
        } catch(e) {}
        return;
      }
      // Fallback: Chrome hat beforeinstallprompt noch nicht gefeuert
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
      if (isIOS) {
        showHint('Auf iPhone: Tippe unten auf das <b>Teilen</b>-Symbol und wähle <b>Zum Home-Bildschirm</b>.');
      } else {
        showHint('Tippe oben rechts auf das <b>⋮ Menü</b> und wähle <b>App installieren</b> (oder <b>Zum Startbildschirm</b>).');
      }
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
})();
</script></body></html>`;
}

// ================================
// SERVER
// ================================
async function readBody(req, maxBytes=25000000) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', chunk => {
            total += chunk.length;
            if (total > maxBytes) { reject(new Error('Too large')); return; }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
    });
}

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(e => {
        console.error('Request error:', e.message);
        if (!res.headersSent) { res.writeHead(500); res.end('Server Error'); }
    });
});

async function handleRequest(req, res) {
    const pu = url.parse(req.url, true);
    const path = pu.pathname;
    const query = pu.query;

    // ── SERVICE WORKER ──
    if (path === '/sw.js') {
        res.writeHead(200, {'Content-Type':'application/javascript','Service-Worker-Allowed':'/','Cache-Control':'no-cache'});
        return res.end(`
const SW_VERSION='v79-update-prompt';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>new Response('<html><body style="font-family:sans-serif;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">📡</div><div style="font-size:18px;font-weight:700">Offline</div><div style="font-size:13px;color:#999;margin-top:8px">Bitte Internetverbindung prüfen</div></div></body></html>',{headers:{'Content-Type':'text/html'}})));return;}
  e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503})));
});
self.addEventListener('push',e=>{
  const data=e.data?.json()||{title:'CreatorX',body:'Neue Aktivität!'};
  e.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,icon:'/icon.jpg',badge:'/icon.jpg',
    data:{url:data.url||'/feed'},vibrate:[200,100,200],
    actions:[{action:'open',title:'Öffnen'}]
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const c=cs.find(c=>'focus' in c);
    if(c){c.focus();if('navigate' in c)c.navigate(e.notification.data?.url||'/feed');}
    else clients.openWindow(e.notification.data?.url||'/feed');
  }));
});`);
    }

    // ── EXPORT IMAGES ──
    if (path === '/export-images') {
        const key = query.key || '';
        if (key !== BRIDGE_SECRET) { res.writeHead(403); res.end('Forbidden'); return; }
        try {
            const files = {};
            fs.readdirSync(DATA_DIR).filter(f => f.startsWith('bild_')).forEach(f => {
                try { files[f] = fs.readFileSync(DATA_DIR + '/' + f, 'utf8'); } catch(e) {}
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        } catch(e) { res.writeHead(500); res.end(e.message); }
        return;
    }

    // ── IMPORT IMAGES FROM NORTHFLANK (manual trigger) ──
    if (path === '/import-images') {
        const key = query.key || '';
        if (key !== BRIDGE_SECRET) { res.writeHead(403); res.end('Forbidden'); return; }
        const sourceUrl = query.from || 'https://site--creatorboost-app--899dydmn7d7v.code.run';
        try {
            const resp = await fetch(`${sourceUrl}/export-images?key=${BRIDGE_SECRET}`);
            if (!resp.ok) {
                res.writeHead(502);
                res.end(`Northflank antwortet nicht: HTTP ${resp.status}. Bitte zuerst Northflank starten!`);
                return;
            }
            const images = await resp.json();
            let count = 0;
            for (const [filename, content] of Object.entries(images)) {
                fs.writeFileSync(DATA_DIR + '/' + filename, content, 'utf8');
                count++;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h2>✅ ${count} Bilder importiert!</h2><p>Alle Profilbilder und Banner wurden von Northflank geholt.</p>`);
        } catch(e) {
            res.writeHead(500);
            res.end(`Fehler: ${e.message}<br><br>Northflank muss zuerst gestartet werden!`);
        }
        return;
    }

    // ── APP BILD ENDPOINT ──
    if (path.startsWith('/appbild/')) {
        const parts = path.split('/');
        const buid = parts[2];
        const btype = parts[3];
        if (!/^\d+$/.test(buid||'') || !/^(profilepic|banner)$/.test(btype||'')) {
            res.writeHead(400); return res.end('bad request');
        }
        const bildFile = DATA_DIR + '/bild_' + buid + '_' + btype + '.txt';
        // Try local file first
        try {
            const data = fs.readFileSync(bildFile, 'utf8');
            const mime = data.split(';')[0].replace('data:','');
            const base64 = data.split(',')[1];
            res.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'public, max-age=86400, immutable'});
            return res.end(Buffer.from(base64, 'base64'));
        } catch(e) {}
        // Proxy to telegram-bot (separate Railway volume)
        if (MAINBOT_URL) {
            const botUrl = MAINBOT_URL + '/bild/' + buid + '/' + btype;
            return new Promise(resolve => {
                const lib = botUrl.startsWith('https') ? https : http;
                lib.get(botUrl, { headers: {'x-bridge-secret': BRIDGE_SECRET} }, (bres) => {
                    if (bres.statusCode === 200) {
                        res.writeHead(200, { 'Content-Type': bres.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public, max-age=3600' });
                        bres.pipe(res);
                    } else {
                        res.writeHead(404); res.end('not found');
                    }
                    resolve();
                }).on('error', () => { res.writeHead(404); res.end('not found'); resolve(); });
            });
        }
        res.writeHead(404); return res.end('not found');
    }

    const session = getSession(req);
    const lang = session?.lang || 'de';
    // lastSeen nur bei echten Aktionen erneuern, nicht bei Hintergrund-Polling — sonst gilt User
    // ewig als online, weil eigene Polls die eigene Session ständig refreshen.
    const isPolling = /^\/api\/(notifications\/count|messages-count|likes-update|messages\/|push-broadcast|push-notify)/.test(path);
    if (session && !isPolling) { session.lastSeen = Date.now(); }

    function redirect(to) { res.writeHead(302,{'Location':to}); res.end(); }
    function html(content, page) { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'max-age=0, stale-while-revalidate=60','X-App-Version':'21'}); res.end(layout(content,session,page,lang)); }
    function json(data, status=200) { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }

    // ── LANDING ──
    if (path === '/' || path === '') {
        if (session) return redirect('/feed');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0','X-App-Version':'20'});
        return res.end(`<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>CreatorX</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" href="/icon-512.png?v=23">
<link rel="apple-touch-icon" href="/icon-512.png?v=23">
<meta name="theme-color" content="#ffffff">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#000;color:#fff;min-height:100vh}
.bg{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(212,175,55,.2) 0%,transparent 60%),#000;z-index:0}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;position:relative;padding-bottom:40px}
.logo-wrap{position:relative;z-index:1;text-align:center;padding:48px 24px 16px}
.logo-title{font-family:'Syne',sans-serif;font-size:32px;font-weight:800;background:linear-gradient(135deg,#d4af37,#fff 50%,#d4af37);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-top:12px}
.logo-sub{font-size:12px;color:rgba(255,255,255,.4);letter-spacing:3px;text-transform:uppercase;margin-top:4px}
.features{position:relative;z-index:1;padding:8px 20px;display:flex;flex-direction:column;gap:10px;width:100%;max-width:420px}
.feat{background:rgba(255,255,255,.04);border:1px solid rgba(212,175,55,.2);border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px}
.feat-icon{font-size:24px;width:44px;height:44px;background:rgba(212,175,55,.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.feat-t{font-size:13px;font-weight:600}
.feat-s{font-size:11px;color:rgba(255,255,255,.4);margin-top:2px}
.tg-wrap{position:relative;z-index:1;width:100%;max-width:420px;padding:16px 20px 0}
.tg-btn{display:flex;align-items:center;justify-content:center;gap:10px;background:#0088cc;color:#fff;padding:14px;border-radius:14px;font-size:14px;font-weight:600;text-decoration:none}
.tg-hint{font-size:11px;color:rgba(255,255,255,.35);text-align:center;margin-top:8px}
.login-wrap{position:relative;z-index:1;width:100%;max-width:420px;padding:16px 20px 0}
.divider{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.1)}
.divider span{font-size:11px;color:rgba(255,255,255,.3)}
.code-hint{font-size:12px;color:rgba(255,255,255,.4);text-align:center;margin-bottom:10px}
.code-input{width:100%;background:rgba(255,255,255,.06);border:1.5px solid rgba(212,175,55,.3);color:#fff;border-radius:14px;padding:16px;font-size:18px;font-family:monospace;text-align:center;outline:none;letter-spacing:4px;transition:border-color .2s}
.code-input:focus{border-color:#d4af37}
.login-btn{background:linear-gradient(135deg,#d4af37,#b8960c);color:#000;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:700;width:100%;cursor:pointer;margin-top:10px;font-family:'DM Sans',sans-serif}
</style></head><body>
<div class="bg"></div>
<div class="hero">
  <div class="logo-wrap">
    <div class="logo-title">CreatorX</div>
    <div class="logo-sub">Creator Community</div>
  </div>
  <div class="features">
    <div class="feat"><div class="feat-icon">🚀</div><div><div class="feat-t">Wachse mit echten Creatorn</div><div class="feat-s">Echtes Engagement von echten Menschen</div></div></div>
    <div class="feat"><div class="feat-icon">❤️</div><div><div class="feat-t">Gegenseitige Unterstützung</div><div class="feat-s">Like & werde geliked — täglich</div></div></div>
    <div class="feat"><div class="feat-icon">🏆</div><div><div class="feat-t">Rangliste & Badges</div><div class="feat-s">Steig auf und werde Elite Creator</div></div></div>
    <div class="feat"><div class="feat-icon">📊</div><div><div class="feat-t">Dein Creator Profil</div><div class="feat-s">Banner, Stats & persönlicher Feed</div></div></div>
  </div>
  <div class="tg-wrap">
    <a href="https://t.me/+w-V2QL-igJw5YjY0" target="_blank" class="tg-btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.269c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.19 14.9l-2.965-.924c-.643-.203-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.631.686z"/></svg>
      Telegram Gruppe beitreten
    </a>
    <div class="tg-hint">Tritt zuerst der Gruppe bei um einen Code zu erhalten</div>
  </div>
  <div class="login-wrap">
    <div class="divider"><span>Bereits Mitglied?</span></div>
    <div class="code-hint">Tippe <b style="color:#d4af37">/mycode</b> im Bot und gib deinen Code ein</div>
    ${query.error ? '<div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#ef4444;text-align:center">⚠️ Code falsch oder unbekannt. Hol dir mit /mycode im Bot einen frischen Code.</div>' : ''}
    <form method="POST" action="/auth/code-form">
      <input type="text" name="code" class="code-input" placeholder="Dein Code" autocomplete="off" autocapitalize="none" spellcheck="false" required value="${(query.code||'').toString().slice(0,40).replace(/[<>"]/g,'')}">
      <button type="submit" class="login-btn">Einloggen →</button>
    </form>
  </div>
</div>
</body></html>`);
    }

    // ── CODE AUTH (Form POST) ──
    // ── SUB-ACCOUNT MANAGEMENT ──
    // Erstellt Sub-Account für die aktive Telegram-UID. Auto-switcht direkt auf den Sub.
    if (path === '/api/create-subaccount' && req.method === 'POST') {
        if (!session) return json({ok:false, error:'Nicht eingeloggt'}, 401);
        if (session.activeUid && String(session.activeUid) !== String(session.uid)) return json({ok:false, error:'Sub-Account kann keinen Sub erstellen'}, 400);
        const body = await parseBody(req);
        const name = (body.name||'').toString().trim().slice(0, 30);
        if (!name) return json({ok:false, error:'Name erforderlich'}, 400);
        const result = await postBot('/create-subaccount-api', { parent_uid: String(session.uid), name });
        if (!result || !result.ok) return json({ok:false, error: (result && result.error) || 'Erstellen fehlgeschlagen'}, 500);
        session.subUid = String(result.sub_uid);
        session.activeUid = String(result.sub_uid);
        saveSessions();
        return json({ok:true, sub_uid: result.sub_uid});
    }
    // Switch zwischen Parent und Sub. Body: { uid: "<entweder parent_uid oder sub_uid>" }
    if (path === '/api/switch-account' && req.method === 'POST') {
        if (!session) return json({ok:false, error:'Nicht eingeloggt'}, 401);
        const body = await parseBody(req);
        const target = String(body.uid||'');
        if (target !== String(session.uid) && target !== String(session.subUid)) {
            return json({ok:false, error:'Account gehört nicht zur Session'}, 403);
        }
        // Verifizieren dass Ziel-User noch existiert (orphan-subUid: Sub wurde im Bot gelöscht
        // aber session weiß noch nichts davon)
        const botData = await fetchBot('/data');
        if (botData && !botData.users?.[target]) {
            if (target === String(session.subUid)) { delete session.subUid; saveSessions(); }
            return json({ok:false, error:'Account existiert nicht mehr'}, 410);
        }
        // Cache-Clear: profilePicData/bannerData waren auf den vorherigen Account gemünzt,
        // sonst sieht der Sub das Banner vom Parent.
        delete session.profilePicData;
        delete session.bannerData;
        session.activeUid = target;
        saveSessions();
        return json({ok:true, activeUid: target});
    }
    // Sub komplett löschen (nur vom Parent aus). Switcht zurück auf Parent.
    if (path === '/api/delete-subaccount' && req.method === 'POST') {
        if (!session) return json({ok:false, error:'Nicht eingeloggt'}, 401);
        if (session.activeUid && String(session.activeUid) !== String(session.uid)) return json({ok:false, error:'Vorher zurück zum Hauptaccount switchen'}, 400);
        if (!session.subUid) return json({ok:false, error:'Kein Sub vorhanden'}, 400);
        const subUidToDelete = String(session.subUid);
        const result = await postBot('/delete-subaccount-api', { parent_uid: String(session.uid), sub_uid: subUidToDelete });
        if (!result || !result.ok) return json({ok:false, error: (result && result.error) || 'Löschen fehlgeschlagen'}, 500);
        // Auch andere Sessions desselben Parents aufräumen, sonst zeigen die noch den Sub
        for (const s of sessions.values()) {
            if (String(s.uid) === String(session.uid)) {
                delete s.subUid;
                if (String(s.activeUid) === subUidToDelete) s.activeUid = String(s.uid);
                delete s.profilePicData;
                delete s.bannerData;
            }
        }
        saveSessions();
        return json({ok:true});
    }

    if (path === '/auth/code-form' && req.method === 'POST') {
        const body = await parseBody(req);
        const code = (body.code||'').toLowerCase().trim();
        if (!code) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        let botData = await fetchBot('/data');
        if (!botData) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        let found = Object.entries(botData.users||{}).find(([,u]) => u.appCode === code);
        // Cache-Miss: Code könnte gerade frisch im Bot generiert sein und unser /data-Cache ist stale.
        // Einmal Force-Refresh, dann nochmal suchen, bevor wir 'falscher Code' sagen.
        if (!found) {
            _dataCache = null; _dataCacheTime = 0;
            await refreshDataCache();
            botData = _dataCache;
            if (botData) found = Object.entries(botData.users||{}).find(([,u]) => u.appCode === code);
        }
        if (!found) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        const [uid, u] = found;
        const sid = genSid();
        // subUid nur übernehmen wenn der Sub im Bot wirklich noch existiert (sonst orphan → Switch crashed)
        const validSubUid = u.subUid && botData.users?.[u.subUid] ? String(u.subUid) : null;
        sessions.set(sid, { uid: String(uid), name: u.name, username: u.username||null, theme: 'light', lang: 'de', createdAt: Date.now(), subUid: validSubUid, activeUid: String(uid) });
        saveSessions();
        res.writeHead(302,{'Set-Cookie':'cbsid='+sid+'; HttpOnly; Path=/; Max-Age=2592000','Location':'/feed'});
        return res.end();
    }

    // ── CODE AUTH ──
    if (path === '/auth/code' && req.method === 'POST') {
        const body = await parseBody(req);
        const code = (body.code||'').toLowerCase().trim();
        if (!code) return json({error:'Kein Code'},400);
        let botData = await fetchBot('/data');
        if (!botData) return json({error:'Server nicht erreichbar'},503);
        let found = Object.entries(botData.users||{}).find(([, u]) => u.appCode === code);
        if (!found) {
            _dataCache = null; _dataCacheTime = 0;
            await refreshDataCache();
            botData = _dataCache;
            if (botData) found = Object.entries(botData.users||{}).find(([, u]) => u.appCode === code);
        }
        if (!found) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        const [uid, u] = found;
        const sid = genSid();
        // subUid nur übernehmen wenn der Sub im Bot wirklich noch existiert (sonst orphan → Switch crashed)
        const validSubUid = u.subUid && botData.users?.[u.subUid] ? String(u.subUid) : null;
        sessions.set(sid, { uid: String(uid), name: u.name, username: u.username||null, theme: 'light', lang: 'de', createdAt: Date.now(), subUid: validSubUid, activeUid: String(uid) });
        saveSessions();
        res.writeHead(302,{'Set-Cookie':`cbsid=${sid}; HttpOnly; Path=/; Max-Age=2592000`,'Location':'/feed'});
        return res.end();
    }

    // ── LOGOUT ──
    if (path === '/logout') {
        const sid = getSid(req);
        if(sid) { sessions.delete(sid); saveSessions(); }
        res.writeHead(302,{'Set-Cookie':'cbsid=; HttpOnly; Path=/; Max-Age=0','Location':'/'});
        return res.end();
    }

    // ── DEBUG ──
    if (path === '/debug/test') {
        const botData = await fetchBot('/data');
        if (!botData) return json({error:'Main Bot nicht erreichbar', mainbotUrl: MAINBOT_URL});
        const userCount = Object.keys(botData.users||{}).length;
        const withCode = Object.values(botData.users||{}).filter(u=>u.appCode).length;
        return json({ok:true, users: userCount, withCode, mainbotUrl: MAINBOT_URL});
    }

    // ── LIKE API ──
    if (path === '/api/like' && req.method === 'POST') {
        const body = await parseBody(req);
        const { msgId } = body;
        if (!msgId || !session) return json({error:'Ungültig'},400);
        const result = await fetchBot('/like-from-app?uid=' + getMyUid(session) + '&msgId=' + encodeURIComponent(msgId));
        if (!result) return json({ok:false, error:'Bot offline'}, 502);
        return json({ok: result.ok !== false, liked: result.liked, likes: result.likes, error: result.error});
    }

    // ── APK SIGN PAGE ──
    if (path === '/apk-sign') {
        if ((query.key || '') !== BRIDGE_SECRET) { res.writeHead(403); return res.end('Kein Zugriff'); }
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>APK Signieren</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#000;color:#fff;font-family:sans-serif;padding:24px;min-height:100vh}h1{font-size:20px;margin-bottom:8px}p{font-size:13px;color:#aaa;margin-bottom:24px}.box{background:#111;border-radius:16px;padding:20px;margin-bottom:16px}.btn{background:linear-gradient(135deg,#ff6b6b,#cc5de8);color:#fff;border:none;border-radius:12px;padding:14px 24px;font-size:15px;font-weight:700;cursor:pointer;width:100%}.btn:disabled{opacity:.5;cursor:default}#status{margin-top:16px;font-size:14px;color:#aaa;text-align:center}a.dl{display:block;background:#22c55e;color:#fff;text-align:center;border-radius:12px;padding:14px;font-weight:700;font-size:15px;text-decoration:none;margin-top:16px}</style></head><body><h1>✍️ APK Signieren</h1><p>Lade das unsigned APK von PWABuilder hoch — der Server signiert es automatisch.</p><div class="box"><input type="file" id="f" accept=".apk" style="width:100%;padding:10px;background:#222;color:#fff;border:none;border-radius:8px;margin-bottom:12px"><button class="btn" id="btn" onclick="sign()">APK Signieren 🔏</button><div id="status"></div><a class="dl" id="dl" style="display:none" href="#" download="CreatorX-signed.apk">⬇️ Signiertes APK herunterladen</a></div><script>async function sign(){const f=document.getElementById('f').files[0];if(!f){alert('Bitte APK auswählen');return;}const btn=document.getElementById('btn');const st=document.getElementById('status');btn.disabled=true;st.textContent='APK wird gelesen...';const b64=await new Promise(r=>{const fr=new FileReader();fr.onload=e=>r(e.target.result.split(',')[1]);fr.readAsDataURL(f);});st.textContent='APK wird signiert... (kann 10-30 Sek dauern)';try{const res=await fetch('/api/sign-apk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apk:b64,key:'${query.key || ''}'})});if(!res.ok){const t=await res.text();st.textContent='Fehler: '+t;btn.disabled=false;return;}const blob=await res.blob();const url=URL.createObjectURL(blob);const dl=document.getElementById('dl');dl.href=url;dl.style.display='block';st.textContent='✅ Fertig! APK signiert und bereit zum Download.';}catch(e){st.textContent='Fehler: '+e.message;btn.disabled=false;}}</script></body></html>`);
    }

    // ── APK SIGN API ──
    if (path === '/api/sign-apk' && req.method === 'POST') {
        const body = await new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>r(b));});
        let parsed;
        try { parsed = JSON.parse(body); } catch(e) { res.writeHead(400); return res.end('Bad JSON'); }
        if ((parsed.key || '') !== BRIDGE_SECRET) { res.writeHead(403); return res.end('Kein Zugriff'); }
        if (!parsed.apk) { res.writeHead(400); return res.end('Kein APK'); }
        try {
            const { execSync } = require('child_process');
            const tmpDir = require('os').tmpdir();
            const ksPath = tmpDir + '/creatorx.keystore';
            const apkIn = tmpDir + '/unsigned.apk';
            const apkOut = tmpDir + '/signed.apk';
            const apkAligned = tmpDir + '/aligned.apk';
            const KEYSTORE_B64 = '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';
            fs.writeFileSync(ksPath, Buffer.from(KEYSTORE_B64, 'base64'));
            fs.writeFileSync(apkIn, Buffer.from(parsed.apk, 'base64'));
            execSync(`apksigner sign --v4-signing-enabled false --min-sdk-version 21 --ks "${ksPath}" --ks-pass pass:creatorx2024 --key-pass pass:creatorx2024 --ks-key-alias creatorx --out "${apkOut}" "${apkIn}"`, {timeout:60000});
            const signedBuf = fs.readFileSync(apkOut);
            try { fs.writeFileSync(DATA_DIR + '/CreatorX-signed.apk', signedBuf); } catch(e) {}
            res.writeHead(200, {'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="CreatorX-signed.apk"','Content-Length':signedBuf.length,'Cache-Control':'no-store'});
            return res.end(signedBuf);
        } catch(e) {
            res.writeHead(500); return res.end('Signierfehler: ' + e.message);
        }
    }

    // ── APK DOWNLOAD ──
    if (path === '/download-app') {
        const apkPath = DATA_DIR + '/CreatorX-signed.apk';
        if (!fs.existsSync(apkPath)) {
            res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
            return res.end('<html><body style="font-family:sans-serif;background:#000;color:#fff;text-align:center;padding:40px"><div style="font-size:48px;margin-bottom:16px">📱</div><div style="font-size:18px;font-weight:700">App-Download nicht verfügbar</div><div style="font-size:14px;color:#aaa;margin-top:8px">Bitte später versuchen</div></body></html>');
        }
        const apkBuf = fs.readFileSync(apkPath);
        res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="CreatorX.apk"','Content-Length':apkBuf.length,'Cache-Control':'public, max-age=3600'});
        return res.end(apkBuf);
    }

    // ── ASSETLINKS (für APK/TWA) ──
    if (path === '/.well-known/assetlinks.json') {
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-cache'});
        return res.end('[]');
    }

    // ── PWA MANIFEST ──
    if (path === '/manifest.json') {
        res.writeHead(200,{'Content-Type':'application/manifest+json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
        return res.end(JSON.stringify({name:'CreatorX',short_name:'CreatorX',description:'Die kreative Community für Instagram Creators',start_url:'/',scope:'/',display:'standalone',background_color:'#ffffff',theme_color:'#ffffff',orientation:'portrait',categories:['social','lifestyle'],prefer_related_applications:false,screenshots:[],icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
    }

    if (path === '/api/vapid-public-key') {
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'});
        return res.end(JSON.stringify({key:VAPID_PUBLIC}));
    }

    if (path === '/icon-192.png') {
        const buf = Buffer.from('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', 'base64');
        res.writeHead(200, {'Content-Type':'image/png','Content-Length':buf.length,'Cache-Control':'public, max-age=86400','Access-Control-Allow-Origin':'*'});
        return res.end(buf);
    }

    if (path === '/icon-512.png' || path === '/apple-touch-icon.png' || path === '/icon.jpg' || path === '/favicon.ico' || path === '/favicon.png') {
        const buf = Buffer.from('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', 'base64');
        res.writeHead(200, {'Content-Type':'image/png','Content-Length':buf.length,'Cache-Control':'public, max-age=86400','Access-Control-Allow-Origin':'*'});
        return res.end(buf);
    }    // ── PROFILBILD UPLOAD ──
    if (path === '/api/upload-profilepic' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try {
            const { imageData } = JSON.parse(Buffer.concat(chunks).toString());
            if (!imageData?.startsWith('data:image/')) return json({error:'Kein Bild'},400);
            if (imageData.length > 3000000) return json({error:'Max 2MB'},400);
            session.profilePicData = imageData;
            saveSessions();
            try { fs.writeFileSync(DATA_DIR + '/bild_' + getMyUid(session) + '_profilepic.txt', imageData); } catch(e) {}
            checkProfileCompletion(getMyUid(session), session);
            return json({ok:true});
        } catch(e) { return json({error:e.message},500); }
    }

    // ── BILD UPLOAD (Banner) ──
    if (path === '/api/upload-banner' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try {
            const { imageData } = JSON.parse(Buffer.concat(chunks).toString());
            if (!imageData?.startsWith('data:image/')) return json({error:'Kein Bild'},400);
            if (imageData.length > 3000000) return json({error:'Max 2MB'},400);
            session.bannerData = imageData;
            saveSessions();
            try { fs.writeFileSync(DATA_DIR + '/bild_' + getMyUid(session) + '_banner.txt', imageData); } catch(e) {}
            checkProfileCompletion(getMyUid(session), session);
            return json({ok:true});
        } catch(e) { return json({error:e.message},500); }
    }

    if (path === '/api/add-project' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try {
            const { imageData, title, description, link, docData, docName } = JSON.parse(Buffer.concat(chunks).toString());
            if (!title?.trim()) return json({error:'Titel fehlt'}, 400);
            const botData = await fetchBot('/data');
            const userProjs = botData?.users?.[getMyUid(session)]?.projects || [];
            if (userProjs.length >= 2) return json({error:'Max 2 Projekte erlaubt'}, 400);
            const projectId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            if (imageData) {
                if (!imageData.startsWith('data:image/')) return json({error:'Kein Bild'}, 400);
                if (imageData.length > 5000000) return json({error:'Max 4MB'}, 400);
                try { fs.writeFileSync(DATA_DIR + '/bild_' + getMyUid(session) + '_proj_' + projectId + '.txt', imageData); } catch(e) {}
            }
            if (docData && docName) {
                if (docData.length > 15000000) return json({error:'Max 10MB für Dokument'}, 400);
                try { fs.writeFileSync(DATA_DIR + '/doc_' + getMyUid(session) + '_proj_' + projectId + '.txt', docData); } catch(e) {}
            }
            const result = await postBot('/add-project-api', { uid: getMyUid(session), projectId, title: title.trim(), description: (description||'').trim(), link: (link||'').trim(), docName: docName||'' });
            if (!result?.ok) return json({error: result?.error || 'Fehler'}, 400);
            return json({ok: true, projectId});
        } catch(e) { return json({error: e.message}, 500); }
    }

    if (path === '/api/update-project' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try {
            const { projectId, title, description, link, imageData, docData, docName } = JSON.parse(Buffer.concat(chunks).toString());
            if (!projectId || !title?.trim()) return json({error:'Titel fehlt'}, 400);
            if (imageData) {
                if (!imageData.startsWith('data:image/')) return json({error:'Kein Bild'}, 400);
                if (imageData.length > 5000000) return json({error:'Max 4MB'}, 400);
                try { fs.writeFileSync(DATA_DIR + '/bild_' + getMyUid(session) + '_proj_' + projectId + '.txt', imageData); } catch(e) {}
            }
            if (docData && docName) {
                if (docData.length > 15000000) return json({error:'Max 10MB für Dokument'}, 400);
                try { fs.writeFileSync(DATA_DIR + '/doc_' + getMyUid(session) + '_proj_' + projectId + '.txt', docData); } catch(e) {}
            }
            const result = await postBot('/update-project-api', { uid: getMyUid(session), projectId, title: title.trim(), description: (description||'').trim(), link: (link||'').trim(), docName: docName||'' });
            if (!result?.ok) return json({error: result?.error || 'Fehler'}, 400);
            return json({ok: true});
        } catch(e) { return json({error: e.message}, 500); }
    }

    if (path === '/api/delete-project' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const body = await parseBody(req);
        const { projectId } = body;
        if (!projectId) return json({error:'Fehlend'}, 400);
        try {
            const imgF = DATA_DIR + '/bild_' + getMyUid(session) + '_proj_' + projectId + '.txt';
            if (fs.existsSync(imgF)) fs.unlinkSync(imgF);
            const docF = DATA_DIR + '/doc_' + getMyUid(session) + '_proj_' + projectId + '.txt';
            if (fs.existsSync(docF)) fs.unlinkSync(docF);
        } catch(e) {}
        const result = await postBot('/delete-project-api', { uid: getMyUid(session), projectId });
        return json({ok: !!result?.ok});
    }

    if (path.startsWith('/api/download-project-doc/') && req.method === 'GET') {
        const parts = path.replace('/api/download-project-doc/','').split('/');
        const docUid = parts[0], docProjId = parts[1];
        if (!docUid || !docProjId) return text('Nicht gefunden', 404);
        const docBase64 = ladeProjectDoc(docUid, docProjId);
        if (!docBase64) return text('Nicht gefunden', 404);
        const botData = await fetchBot('/data');
        const proj = (botData?.users?.[docUid]?.projects||[]).find(p=>p.id===docProjId);
        const fileName = proj?.docName || 'dokument';
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeMap = { docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', pdf:'application/pdf' };
        const mime = mimeMap[ext] || 'application/octet-stream';
        const base64Data = docBase64.includes(',') ? docBase64.split(',')[1] : docBase64;
        const buf = Buffer.from(base64Data, 'base64');
        res.writeHead(200, {'Content-Type': mime, 'Content-Disposition': 'attachment; filename="'+fileName+'"', 'Content-Length': buf.length});
        res.end(buf);
        return;
    }

    if (path === '/api/set-pinned-link' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const body = await parseBody(req);
        const url = (body.url||'').trim();
        if (url && !url.includes('instagram.com')) return json({error:'Nur Instagram Links'},400);
        try {
            if (url) {
                fs.writeFileSync(DATA_DIR + '/pinnedlink_' + getMyUid(session) + '.txt', url);
            } else {
                const f = DATA_DIR + '/pinnedlink_' + getMyUid(session) + '.txt';
                if (fs.existsSync(f)) fs.unlinkSync(f);
            }
            return json({ok:true});
        } catch(e) { return json({error:e.message},500); }
    }

    // ── SEARCH API ──
    if (path === '/api/search') {
        const q = (query.q||'').toLowerCase().trim();
        if (!q) return json({users:[], links:[]});
        const botData = await fetchBot('/data');
        if (!botData) return json({users:[], links:[]});
        const users = Object.entries(botData.users||{})
            .filter(([,u])=>u.started && u.inGruppe!==false && (
                (u.name||'').toLowerCase().includes(q) ||
                (u.username||'').toLowerCase().includes(q) ||
                (u.instagram||'').toLowerCase().includes(q) ||
                (u.spitzname||'').toLowerCase().includes(q)
            ))
            .slice(0,10)
            .map(([id,u])=>({
                id,
                name: u.name,
                spitzname: u.spitzname,
                username: u.username,
                instagram: u.instagram,
                role: u.role,
                xp: u.xp,
                pic: ladeBild(id,'profilepic') ? `/appbild/${id}/profilepic` : u.instagram ? `https://unavatar.io/instagram/${u.instagram}` : null
            }));
        const links = Object.entries(botData.links||{})
            .filter(([,l])=>(l.text||'').toLowerCase().includes(q)||(l.user_name||'').toLowerCase().includes(q))
            .sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0))
            .slice(0,5)
            .map(([id,l])=>({id, text:l.text, user_name:l.user_name, likes:Array.isArray(l.likes)?l.likes.length:0}));
        return json({users, links});
    }

    // ── LIKES UPDATE API ──
    if (path === '/api/likes-update') {
        const botData = await fetchBot('/data');
        if (!botData) return json({links:[]});
        const today = new Date().toDateString();
        const byUrl = {};
        Object.entries(botData.links||{}).forEach(([id,l]) => {
            if (!l.text || new Date(l.timestamp).toDateString() !== today) return;
            const u = l.text.trim();
            if (!byUrl[u]) byUrl[u] = {likes:0, ids:[], likerNames:[]};
            const lkCount = Array.isArray(l.likes) ? l.likes.length : 0;
            if (lkCount > byUrl[u].likes) { byUrl[u].likes = lkCount; }
            byUrl[u].ids.push(String(l.counter_msg_id||id));
            byUrl[u].ids.push(id);
        });
        const links = Object.entries(byUrl).map(([u,data]) => ({url:u, ids:[...new Set(data.ids)], likes:data.likes}));
        return json({links});
    }

    // ── BENACHRICHTIGUNGEN API ──
    if (path === '/api/notifications') {
        if (!session) return json({notifications:[]});
        const botData = await fetchBot('/data');
        if (!botData) return json({notifications:[]});
        const notifs = (botData.notifications?.[getMyUid(session)] || []).slice(-30).reverse();
        // Actor-Info anreichern (Name + hatProfilbild) damit der Client Avatar rendern kann
        const enriched = notifs.map(n => {
            if (!n.actorUid) return n;
            const a = botData.users?.[n.actorUid];
            if (!a) return n;
            return Object.assign({}, n, {
                actorName: a.spitzname || a.name || null,
                actorRole: a.role || null,
                actorInsta: a.instagram || null,
                actorHasPic: !!ladeBild(String(n.actorUid), 'profilepic')
            });
        });
        await postBot('/mark-notifications-read', { uid: getMyUid(session) });
        return json({notifications: enriched});
    }

    if (path === '/api/messages-count') {
        if (!session) return json({count:0});
        const myUid = getMyUid(session);
        const botData = await fetchBot('/data');
        if (!botData) return json({count:0});
        // Count unread DMs
        const convos = botData.messages || {};
        let unreadDMs = 0;
        Object.entries(convos).forEach(([key, msgs]) => {
            const [a,b] = key.split('_');
            if (a === myUid || b === myUid)
                unreadDMs += msgs.filter(m=>m.to===myUid&&!m.read).length;
        });
        // Count unread thread messages
        const thrMsgs = botData.threadMessages || {};
        const lastRead = botData.threadLastRead?.[myUid] || {};
        const cf = botData.communityFeed || [];
        let unreadThreads = 0;
        const glr = lastRead['general'] || 0;
        const gm = thrMsgs['general']?.length ? thrMsgs['general'] : cf;
        unreadThreads += gm.filter(m=>(m.timestamp||0)>glr).length;
        Object.keys(thrMsgs).forEach(tid => {
            if (tid !== 'general') unreadThreads += (thrMsgs[tid]||[]).filter(m=>(m.timestamp||0)>(lastRead[tid]||0)).length;
        });
        return json({count: unreadDMs + unreadThreads, dms: unreadDMs, threads: unreadThreads});
    }

    if (path === '/api/notifications/count') {
        if (!session) return json({count:0});
        const botData = await fetchBot('/data');
        if (!botData) return json({count:0});
        const unread = (botData.notifications?.[getMyUid(session)] || []).filter(n => !n.read).length;
        return json({count: unread});
    }

    // ── FIX 1: NACHRICHT SENDEN — myUid definiert ──
    if (path === '/api/send-message' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const myUid = getMyUid(session);
        let body;
        try { body = JSON.parse(await readBody(req, 10000000)); } catch(e) { return json({error:'Ungültig'},400); }
        const { to, text, image, audio, replyTo } = body;
        if (!to || (!text?.trim() && !image && !audio)) return json({error:'Ungültig'}, 400);
        const result = await postBot('/send-message-api', {
            from: myUid,
            to,
            text: text?.trim().slice(0, 500) || '',
            image: image || null,
            audio: audio || null,
            replyTo: replyTo || null,
            timestamp: Date.now()
        });
        return json({ok: !!result});
    }

    // ── FIX 2: NACHRICHTEN LADEN — myUid definiert ──
    if (path.startsWith('/api/messages/')) {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const myUid = getMyUid(session); // FIX: war undefined
        const otherUid = path.replace('/api/messages/', '');
        const botData = await fetchBot('/data');
        const chatKey = [myUid, otherUid].sort().join('_');
        const msgs = botData?.messages?.[chatKey] || [];
        return json({count: msgs.length, messages: msgs});
    }

    // ── FIX 3: NACHRICHTEN GELESEN — myUid definiert ──
    if (path === '/api/edit-message' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const myUid = getMyUid(session);
        let body;
        try { body = JSON.parse(await readBody(req, 100000)); } catch(e) { return json({error:'Ungültig'},400); }
        const { chatKey, timestamp, newText } = body;
        if (!chatKey || !timestamp || typeof newText !== 'string') return json({error:'Ungültig'}, 400);
        const result = await postBot('/edit-message-api', { uid: myUid, chatKey, timestamp, newText });
        return json(result || {ok:false});
    }

    if (path === '/api/mark-messages-read' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const myUid = getMyUid(session); // FIX: war undefined
        const body = await parseBody(req);
        await postBot('/mark-messages-read', { uid: myUid, chatKey: body.chatKey });
        return json({ok: true});
    }

    // ── ONBOARDING ──
    if (path === '/onboarding') {
        if (!session) return redirect('/');
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
        return res.end(onboardingHTML(false));
    }

    // ── DIAMANTEN-INFO-SEITE ──
    if (path === '/diamanten') {
        if (!session) return redirect('/');
        const myUid = getMyUid(session);
        const botData = await fetchBot('/data');
        const u = (botData?.users||{})[myUid] || {};
        const stand = u.diamonds || 0;
        const appLikes = u.appLikeCount || 0;
        const threadMsgs = u.threadMsgCount || 0;
        const profileDone = u.profileCompletionRewarded ? '✅' : '⏳';
        return html(`
<div class="topbar"><a href="/newsletter" class="icon-btn" style="font-size:22px">‹</a><div style="font-size:15px;font-weight:600">Diamanten</div><div style="width:36px"></div></div>
<div style="padding:20px 16px 80px">
  <div style="background:linear-gradient(135deg,#4dabf7,#a78bfa);border-radius:18px;padding:22px;text-align:center;margin-bottom:18px;box-shadow:0 6px 22px rgba(167,139,250,0.3)">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:8px">Dein Diamant-Stand</div>
    <div style="font-size:48px;font-weight:800;color:#fff;font-family:var(--font-display)">💎 ${stand}</div>
  </div>
  <div style="font-size:13.5px;line-height:1.55;color:var(--muted);margin-bottom:16px">Diamanten sind die Währung im Shop (App + Telegram). Aktuell zu kaufen: <b style="color:var(--text)">Extralinks</b> + <b style="color:var(--text)">Superlinks</b>. Mehr folgt.</div>
  <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase;margin:8px 4px">Wie verdiene ich Diamanten?</div>
  <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:14px;overflow:hidden;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border2)">
      <div style="font-size:20px">${profileDone}</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">Profil vervollständigen</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Bild, Bio, Nische, Banner</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+1 💎</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border2)">
      <div style="font-size:20px">📅</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">Tagesmission M3</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Alle Links des Tages liken</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+1 💎</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border2)">
      <div style="font-size:20px">📈</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">Wochenmission M2</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">7 Tage je 80% liken</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+1 💎</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border2)">
      <div style="font-size:20px">🏆</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">Wochenmission M3</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">7 Tage in Folge alle liken</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+2 💎</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border2)">
      <div style="font-size:20px">⭐</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">Alle Superlinks der Woche engagieren</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Liken, Kommentieren, Teilen, Speichern</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+1 💎</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border2)">
      <div style="font-size:20px">📲</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">100 Likes via App</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Aktuell: ${appLikes}/${Math.ceil((appLikes+1)/100)*100}</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+1 💎</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border2)">
      <div style="font-size:20px">💬</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">10 Thread-Nachrichten</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Min 10 Zeichen, kein Spam · Aktuell: ${threadMsgs}/${Math.ceil((threadMsgs+1)/10)*10}</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+1 💎</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px">
      <div style="font-size:20px">📌</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:700">Pinned Post engagiert</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Owner kriegt Diamant pro neuem Engager</div></div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">+1 💎</div>
    </div>
  </div>
  <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px;font-size:12.5px;line-height:1.55;color:var(--text)">
    <b>⚠️ Wichtig:</b> Es gelten weiterhin die Standard-Regeln (1 Post = 5 Likes + Kommentar). Niemand muss alles machen — wer aber mehr engagiert, wird belohnt 🙏
  </div>
  <div style="margin-top:18px;text-align:center"><a href="/explore?tab=shop" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;padding:12px 22px;border-radius:14px;font-size:13px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(167,139,250,0.4)">💎 Zum Shop</a></div>
</div>`, 'diamanten');
    }

    if (path === '/newsletter' || path === '/newsletter/download') {
        const isDownload = path === '/newsletter/download';
        const NEWSLETTER_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CreatorX — So funktioniert die Community</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --red:#ff6b6b;--orange:#ffa500;--purple:#a78bfa;--gold:#ffd43b;
  --green:#00c851;--blue:#4dabf7;--bg:#080808;--bg2:#111;--bg3:#1a1a1a;
  --border:rgba(255,255,255,.08);--muted:rgba(255,255,255,.45);
}
html{scroll-behavior:smooth}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:#fff;max-width:680px;margin:0 auto;overflow-x:hidden}

/* ── TYPOGRAPHY ── */
h1,h2,h3{font-family:'Syne',sans-serif;font-weight:900;line-height:1.1}
p{line-height:1.65;color:var(--muted)}

/* ── UTILS ── */
.grad-text{background:linear-gradient(135deg,var(--red),var(--orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.grad-text-purple{background:linear-gradient(135deg,var(--purple),#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.grad-text-gold{background:linear-gradient(135deg,var(--gold),var(--orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.grad-text-green{background:linear-gradient(135deg,var(--green),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.chip{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.divider{height:1px;background:var(--border);margin:0}

/* ── HERO ── */
.hero{padding:72px 32px 64px;text-align:center;position:relative;overflow:hidden}
.hero-glow{position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(255,107,107,.18) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-60%);pointer-events:none}
.hero-logo{display:inline-flex;align-items:center;gap:10px;margin-bottom:32px}
.hero-logo-icon{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,var(--red),var(--orange));display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 0 30px rgba(255,107,107,.4)}
.hero-logo-text{font-family:'Syne',sans-serif;font-size:26px;font-weight:900}
.hero h1{font-size:clamp(36px,8vw,58px);margin-bottom:18px;line-height:1.05}
.hero p{font-size:16px;max-width:440px;margin:0 auto 32px;color:rgba(255,255,255,.55);line-height:1.6}
.hero-badges{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.hero-badge{padding:8px 16px;border-radius:30px;font-size:13px;font-weight:600;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:rgba(255,255,255,.7)}

/* ── SECTION ── */
.section{padding:60px 32px}
.section-label{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;opacity:.5}
.section h2{font-size:clamp(26px,5vw,38px);margin-bottom:14px}
.section p.lead{font-size:15px;color:rgba(255,255,255,.55);margin-bottom:32px;max-width:500px}

/* ── FEATURE GRID ── */
.feat-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.feat-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:20px;position:relative;overflow:hidden}
.feat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--card-grad,linear-gradient(135deg,var(--red),var(--orange)))}
.feat-icon{font-size:28px;margin-bottom:10px}
.feat-card h3{font-size:14px;font-weight:700;margin-bottom:6px}
.feat-card p{font-size:12px;color:var(--muted);line-height:1.5}

/* ── XP BAR ── */
.xp-demo{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:12px}
.xp-bar-wrap{background:rgba(255,255,255,.07);border-radius:6px;height:8px;overflow:hidden;margin:10px 0 6px}
.xp-bar-fill{height:100%;border-radius:6px;background:linear-gradient(135deg,var(--red),var(--orange))}

/* ── STEP CARDS ── */
.steps{display:flex;flex-direction:column;gap:12px}
.step{display:flex;gap:16px;background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:20px;align-items:flex-start}
.step-num{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--orange));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;box-shadow:0 0 16px rgba(255,107,107,.35)}
.step-body h3{font-size:14px;font-weight:700;margin-bottom:4px}
.step-body p{font-size:12px;color:var(--muted);line-height:1.5}

/* ── RANK TABLE ── */
.rank-table{border-radius:16px;overflow:hidden;border:1px solid var(--border)}
.rank-row{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border)}
.rank-row:last-child{border-bottom:none}
.rank-row.highlight{background:rgba(255,107,107,.07);border-left:3px solid var(--red)}
.rank-pos{font-size:18px;width:28px;flex-shrink:0;text-align:center}
.rank-av{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.rank-info{flex:1;min-width:0}
.rank-name{font-size:13px;font-weight:700}
.rank-role{font-size:11px;color:var(--muted)}
.rank-xp{text-align:right}
.rank-xp-val{font-size:13px;font-weight:700;color:var(--gold)}
.rank-dia{font-size:11px;color:var(--purple)}

/* ── BADGE ROW ── */
.badge-row{display:flex;gap:8px;margin-top:20px;flex-wrap:wrap}
.badge-item{flex:1;min-width:90px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 10px;text-align:center}
.badge-emoji{font-size:22px;display:block;margin-bottom:5px}
.badge-name{font-size:10px;font-weight:700;color:rgba(255,255,255,.7)}
.badge-xp{font-size:9px;color:var(--muted);margin-top:2px}

/* ── FE CARD ── */
.fe-header{background:linear-gradient(135deg,rgba(245,158,11,.2),rgba(167,139,250,.1));border:1px solid rgba(245,158,11,.3);border-radius:16px;padding:20px 22px;margin-bottom:12px;display:flex;align-items:center;gap:14px}
.fe-icon{font-size:36px;flex-shrink:0}
.fe-title{font-size:16px;font-weight:800;color:#fbbf24}
.fe-sub{font-size:12px;color:var(--muted);margin-top:3px}
.fe-item{background:var(--bg2);border:1px solid rgba(167,139,250,.2);border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.fe-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--purple),#7c3aed);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.fe-item-name{font-size:13px;font-weight:700}
.fe-item-url{font-size:11px;color:var(--purple)}
.fe-likes{font-size:12px;font-weight:700;color:var(--red);margin-left:auto;flex-shrink:0}
.fe-warn{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:12px 16px;font-size:12px;color:rgba(239,68,68,.9);display:flex;align-items:center;gap:8px}

/* ── DIAMOND WAYS ── */
.dia-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dia-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;align-items:flex-start;gap:12px}
.dia-icon{font-size:22px;flex-shrink:0;line-height:1}
.dia-text h4{font-size:13px;font-weight:700;margin-bottom:3px}
.dia-text p{font-size:11px;color:var(--muted)}
.dia-badge{font-size:11px;font-weight:800;color:var(--purple);margin-top:5px}

/* ── SHOP PREVIEW ── */
.shop-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.shop-item{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px 12px;text-align:center}
.shop-ring{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffa500);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;margin:0 auto 10px}
.shop-ring-name{font-size:11px;font-weight:700;margin-bottom:4px}
.shop-ring-price{font-size:11px;color:var(--purple);font-weight:700}

/* ── PROFILE PREVIEW ── */
.profile-box{background:var(--bg2);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.profile-banner{height:80px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);position:relative}
.profile-av-wrap{position:absolute;bottom:-18px;left:18px;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--orange));border:2.5px solid var(--bg2);box-shadow:0 0 0 3px #FFD700,0 0 0 6px #B8860B;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800}
.profile-info{padding:26px 18px 18px;display:flex;justify-content:space-between;align-items:flex-end}
.profile-name{font-size:15px;font-weight:800}
.profile-handle{font-size:11px;color:var(--muted);margin-top:2px}
.profile-stats{display:flex;gap:16px;padding:0 18px 18px}
.profile-stat{text-align:center}
.profile-stat-val{font-size:16px;font-weight:800}
.profile-stat-lbl{font-size:10px;color:var(--muted);margin-top:1px}

/* ── CTA ── */
.cta{padding:64px 32px;text-align:center;position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,107,107,.08),rgba(255,165,0,.05))}
.cta-glow{position:absolute;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(255,107,107,.12) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}
.cta h2{font-size:clamp(28px,6vw,42px);margin-bottom:14px}
.cta p{font-size:15px;color:var(--muted);max-width:380px;margin:0 auto 32px}
.cta-btn{display:inline-flex;align-items:center;gap:8px;padding:16px 36px;border-radius:16px;background:linear-gradient(135deg,var(--red),var(--orange));color:#fff;font-size:16px;font-weight:700;text-decoration:none;font-family:'DM Sans',sans-serif;box-shadow:0 8px 32px rgba(255,107,107,.35)}

/* ── ACCENT SECTIONS ── */
.section-red{background:linear-gradient(180deg,rgba(255,107,107,.05) 0%,transparent 100%)}
.section-purple{background:linear-gradient(180deg,rgba(167,139,250,.05) 0%,transparent 100%)}
.section-gold{background:linear-gradient(180deg,rgba(255,211,59,.05) 0%,transparent 100%)}
.section-green{background:linear-gradient(180deg,rgba(0,200,81,.05) 0%,transparent 100%)}

/* ── FOOTER ── */
.footer{padding:40px 32px;text-align:center;border-top:1px solid var(--border)}
.footer p{font-size:12px;color:rgba(255,255,255,.2)}

/* ── RESPONSIVE ── */
@media(max-width:480px){
  .feat-grid{grid-template-columns:1fr}
  .dia-grid{grid-template-columns:1fr}
  .shop-grid{grid-template-columns:1fr 1fr}
  .hero{padding:52px 20px 44px}
  .section{padding:48px 20px}
  .hero h1{font-size:32px}
}
</style>
</head>
<body>

<!-- ════════════════════════════════════════════ HERO ════ -->
<div class="hero">
  <div class="hero-glow"></div>
  <div class="hero-logo">
    <div class="hero-logo-icon">🚀</div>
    <div class="hero-logo-text" style="background:linear-gradient(135deg,#ff6b6b,#ffa500);-webkit-background-clip:text;-webkit-text-fill-color:transparent">CreatorX</div>
  </div>
  <h1>So funktioniert<br><span class="grad-text">unsere Community</span></h1>
  <p>Alles was du wissen musst — von XP über Diamanten bis zum Full Engagement. Dein kompletter Guide.</p>
  <div class="hero-badges">
    <div class="hero-badge">❤️ XP durch Likes</div>
    <div class="hero-badge">💎 Diamanten System</div>
    <div class="hero-badge">⭐ Full Engagement</div>
    <div class="hero-badge">🏆 Rangliste</div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ OVERVIEW ════ -->
<div class="section">
  <div class="section-label">Das Konzept</div>
  <h2>Was ist <span class="grad-text">CreatorX?</span></h2>
  <p class="lead">Eine geschlossene Community für Instagram Creators. Hier unterstützt ihr euch gegenseitig mit echtem Engagement — täglich, systematisch und fair.</p>
  <div class="feat-grid">
    <div class="feat-card" style="--card-grad:linear-gradient(135deg,#ff6b6b,#ffa500)">
      <div class="feat-icon">❤️</div>
      <h3>Gegenseitiges Liken</h3>
      <p>Jeder liked die Reels aller anderen. Was du gibst, kommt zurück.</p>
    </div>
    <div class="feat-card" style="--card-grad:linear-gradient(135deg,#ffd43b,#ffa500)">
      <div class="feat-icon">⚡</div>
      <h3>XP-System</h3>
      <p>Für jede Aktivität bekommst du XP. XP bestimmt deinen Rang und dein Badge.</p>
    </div>
    <div class="feat-card" style="--card-grad:linear-gradient(135deg,#a78bfa,#7c3aed)">
      <div class="feat-icon">💎</div>
      <h3>Diamanten</h3>
      <p>Diamanten verdienst du durch Aktivität. Damit kaufst du Profilrahmen & Extra-Links.</p>
    </div>
    <div class="feat-card" style="--card-grad:linear-gradient(135deg,#00c851,#4dabf7)">
      <div class="feat-icon">⭐</div>
      <h3>Full Engagement</h3>
      <p>Einmal im Monat postet jeder einen Superlink. Alle engagieren sich gegenseitig.</p>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ FEED & LIKEN ════ -->
<div class="section section-red">
  <div class="section-label">Schritt 1</div>
  <h2>Feed &amp; <span class="grad-text">Liken</span></h2>
  <p class="lead">Im Feed siehst du die aktuellen Reels aller Community-Mitglieder. Dein Job: liken, unterstützen, wachsen.</p>

  <!-- XP Demo -->
  <div class="xp-demo">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:13px;font-weight:700">⬆️ Aufsteiger</span>
      <span style="font-size:12px;color:var(--gold);font-weight:700">650 / 1.000 XP</span>
    </div>
    <div class="xp-bar-wrap"><div class="xp-bar-fill" style="width:65%"></div></div>
    <div style="display:flex;justify-content:space-between">
      <span style="font-size:10px;color:var(--muted)">Nächstes Badge: 🏅 Erfahrene</span>
      <span style="font-size:10px;color:var(--muted)">+350 XP noch</span>
    </div>
  </div>

  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        <h3>Feed öffnen</h3>
        <p>Auf dem Startscreen siehst du alle aktuellen Reel-Links der Community — sortiert nach Zeit.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        <h3>Reel öffnen & liken</h3>
        <p>Tippe auf den Link, gehe auf Instagram und like das Reel. Dann zurück und ❤️ drücken.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        <h3>+5 XP kassieren</h3>
        <p>Jedes Like das du gibst bringt dir <strong style="color:#fff">+5 XP</strong>. Je mehr du likest, desto schneller steigst du auf.</p>
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:20px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:var(--red)">+5</div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px">XP pro Like</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:var(--orange)">1×</div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px">Like pro Link</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:var(--gold)">3</div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px">Tages-Missionen</div>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ LINK TEILEN ════ -->
<div class="section">
  <div class="section-label">Schritt 2</div>
  <h2>Deinen Link <span class="grad-text">teilen</span></h2>
  <p class="lead">Einmal täglich postest du deinen Instagram Reel Link in die Community. Der <strong style="color:#ff6b6b">rote + Button</strong> unten in der Mitte ist dein Freund.</p>

  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:20px">
    <div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--orange));display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:300;box-shadow:0 0 16px rgba(255,107,107,.4)">+</div>
      <div>
        <div style="font-size:14px;font-weight:700">📸 Reel Link teilen</div>
        <div style="font-size:11px;color:var(--muted)">Täglich um Mitternacht erneuert</div>
      </div>
    </div>
    <div style="padding:16px 18px;display:flex;flex-direction:column;gap:8px">
      <div style="background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:10px;padding:10px 13px;font-size:12px;color:var(--muted)">https://www.instagram.com/reel/...</div>
      <div style="background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:10px;padding:10px 13px;font-size:12px;color:var(--muted)">Beschreibung (optional)...</div>
      <div style="background:linear-gradient(135deg,var(--red),var(--orange));border-radius:10px;padding:12px;font-size:13px;font-weight:700;text-align:center">📸 Jetzt teilen</div>
    </div>
  </div>

  <div style="display:flex;flex-direction:column;gap:8px">
    <div style="background:rgba(0,200,81,.08);border:1px solid rgba(0,200,81,.2);border-radius:12px;padding:12px 16px;font-size:13px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">🆓</span>
      <div><strong style="color:#fff">1 kostenloser Link</strong> pro Tag — täglich automatisch erneuert</div>
    </div>
    <div style="background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);border-radius:12px;padding:12px 16px;font-size:13px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">💎</span>
      <div><strong style="color:#fff">Extra-Links</strong> im Shop für 5 Diamanten kaufen</div>
    </div>
    <div style="background:rgba(255,215,0,.08);border:1px solid rgba(255,215,0,.2);border-radius:12px;padding:12px 16px;font-size:13px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">📌</span>
      <div><strong style="color:#fff">Angepinnter Post</strong> — bleibt dauerhaft oben in deinem Profil</div>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ FULL ENGAGEMENT ════ -->
<div class="section section-purple">
  <div class="section-label">Das Herzstück</div>
  <h2>Full <span class="grad-text-purple">Engagement</span></h2>
  <p class="lead">Einmal im Monat postet jedes Mitglied einen Superlink. Danach muss jeder bei jedem anderen liken, kommentieren, teilen und speichern.</p>

  <div class="fe-header">
    <div class="fe-icon">⭐</div>
    <div>
      <div class="fe-title">Full Engagement Thread</div>
      <div class="fe-sub">Monatlich · Pflicht für alle aktiven Mitglieder</div>
    </div>
  </div>

  <div class="fe-item">
    <div class="fe-av">SK</div>
    <div style="flex:1;min-width:0">
      <div class="fe-item-name">Sara K.</div>
      <div class="fe-item-url">🔗 instagram.com/reel/abc123</div>
    </div>
    <div class="fe-likes">❤️ 8</div>
  </div>
  <div class="fe-item">
    <div class="fe-av">JB</div>
    <div style="flex:1;min-width:0">
      <div class="fe-item-name">Jonas B.</div>
      <div class="fe-item-url">🔗 instagram.com/reel/def456</div>
    </div>
    <div class="fe-likes">❤️ 6</div>
  </div>
  <div class="fe-item" style="opacity:.55">
    <div class="fe-av">MR</div>
    <div style="flex:1;min-width:0">
      <div class="fe-item-name">Max R.</div>
      <div class="fe-item-url">🔗 instagram.com/reel/ghi789</div>
    </div>
    <div class="fe-likes">❤️ 3</div>
  </div>

  <div class="fe-warn" style="margin-top:12px">
    <span style="font-size:18px">⚠️</span>
    <div>Wer bis <strong style="color:#ef4444">Sonntag nicht engaged</strong>, verliert <strong style="color:#ef4444">−50 XP</strong> Strafe</div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px">
    <div style="background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.2);border-radius:12px;padding:16px;text-align:center">
      <div style="font-size:22px;margin-bottom:6px">✅</div>
      <div style="font-size:13px;font-weight:700;color:#a78bfa">Dabei sein</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">XP + Diamanten + Gemeinschaft</div>
    </div>
    <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15);border-radius:12px;padding:16px;text-align:center">
      <div style="font-size:22px;margin-bottom:6px">❌</div>
      <div style="font-size:13px;font-weight:700;color:#ef4444">Fehlen</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">−50 XP Strafe</div>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ XP & RANKING ════ -->
<div class="section section-gold">
  <div class="section-label">Fortschritt</div>
  <h2>XP, Ranking &amp; <span class="grad-text-gold">Badges</span></h2>
  <p class="lead">Deine Aktivität wird gemessen und belohnt. Je mehr XP du sammelst, desto höher steigst du in der Community auf.</p>

  <div class="rank-table" style="margin-bottom:24px">
    <div class="rank-row">
      <div class="rank-pos">🥇</div>
      <div class="rank-av" style="background:linear-gradient(135deg,#ffd43b,#f59e0b);color:#000">AK</div>
      <div class="rank-info"><div class="rank-name">Alex K.</div><div class="rank-role">👑 Elite Creator</div></div>
      <div class="rank-xp"><div class="rank-xp-val">4.200 XP</div><div class="rank-dia">💎 120</div></div>
    </div>
    <div class="rank-row">
      <div class="rank-pos">🥈</div>
      <div class="rank-av" style="background:linear-gradient(135deg,#9ca3af,#6b7280)">ML</div>
      <div class="rank-info"><div class="rank-name">Maria L.</div><div class="rank-role">🏅 Erfahrene</div></div>
      <div class="rank-xp"><div class="rank-xp-val">2.850 XP</div><div class="rank-dia">💎 85</div></div>
    </div>
    <div class="rank-row">
      <div class="rank-pos">🥉</div>
      <div class="rank-av" style="background:linear-gradient(135deg,#cd7f32,#a0522d)">JB</div>
      <div class="rank-info"><div class="rank-name">Jonas B.</div><div class="rank-role">🏅 Erfahrene</div></div>
      <div class="rank-xp"><div class="rank-xp-val">1.940 XP</div><div class="rank-dia">💎 52</div></div>
    </div>
    <div class="rank-row highlight">
      <div class="rank-pos" style="font-size:13px;font-weight:700;color:var(--muted)">#4</div>
      <div class="rank-av" style="background:linear-gradient(135deg,var(--red),var(--orange));box-shadow:0 0 12px rgba(255,107,107,.4)">Du</div>
      <div class="rank-info"><div class="rank-name" style="color:var(--red)">Dein Name</div><div class="rank-role">⬆️ Aufsteiger</div></div>
      <div class="rank-xp"><div class="rank-xp-val">890 XP</div><div class="rank-dia">💎 18</div></div>
    </div>
  </div>

  <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">Die 6 Badge-Stufen</h3>
  <p style="font-size:12px;color:var(--muted);margin-bottom:0">Von Einsteiger bis Elite+ — wo stehst du?</p>
  <div class="badge-row">
    <div class="badge-item">
      <span class="badge-emoji">🆕</span>
      <div class="badge-name">New</div>
      <div class="badge-xp">0 XP</div>
    </div>
    <div class="badge-item">
      <span class="badge-emoji">📘</span>
      <div class="badge-name">Anfänger</div>
      <div class="badge-xp">50 XP</div>
    </div>
    <div class="badge-item">
      <span class="badge-emoji">⬆️</span>
      <div class="badge-name">Aufsteiger</div>
      <div class="badge-xp">500 XP</div>
    </div>
    <div class="badge-item">
      <span class="badge-emoji">🏅</span>
      <div class="badge-name">Erfahrene</div>
      <div class="badge-xp">1.000 XP</div>
    </div>
    <div class="badge-item" style="border-color:rgba(255,215,0,.3);background:rgba(255,215,0,.05)">
      <span class="badge-emoji">👑</span>
      <div class="badge-name" style="color:var(--gold)">Elite</div>
      <div class="badge-xp">5.000 XP</div>
    </div>
    <div class="badge-item" style="border-color:rgba(168,85,247,.3);background:rgba(168,85,247,.05)">
      <span class="badge-emoji">🌟</span>
      <div class="badge-name" style="color:#a855f7">Elite+</div>
      <div class="badge-xp">10.000 XP</div>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ DIAMANTEN ════ -->
<div class="section">
  <div class="section-label">Währung</div>
  <h2>Diamanten <span class="grad-text-purple">verdienen</span></h2>
  <p class="lead">Diamanten sind die Währung der Community. Du verdienst sie durch Aktivität — und gibst sie im Shop aus.</p>

  <div class="dia-grid">
    <div class="dia-card">
      <div class="dia-icon">🔑</div>
      <div class="dia-text">
        <h4>Täglich einloggen</h4>
        <p>Einfach jeden Tag in der App erscheinen</p>
        <div class="dia-badge">+1 💎 / Tag</div>
      </div>
    </div>
    <div class="dia-card">
      <div class="dia-icon">⭐</div>
      <div class="dia-text">
        <h4>Full Engagement</h4>
        <p>Superlink posten + alle engagen</p>
        <div class="dia-badge">+2 💎</div>
      </div>
    </div>
    <div class="dia-card">
      <div class="dia-icon">🎯</div>
      <div class="dia-text">
        <h4>Alle Missionen</h4>
        <p>3 tägliche Missionen erfüllt</p>
        <div class="dia-badge">+1 💎</div>
      </div>
    </div>
    <div class="dia-card">
      <div class="dia-icon">🏆</div>
      <div class="dia-text">
        <h4>Wöchentliches Ranking</h4>
        <p>Top 3 am Ende der Woche</p>
        <div class="dia-badge">+10 / +5 / +3 💎</div>
      </div>
    </div>
    <div class="dia-card">
      <div class="dia-icon">👤</div>
      <div class="dia-text">
        <h4>Profil vervollständigen</h4>
        <p>Foto, Bio, Instagram & Banner</p>
        <div class="dia-badge">+1 💎 (einmalig)</div>
      </div>
    </div>
    <div class="dia-card">
      <div class="dia-icon">🚀</div>
      <div class="dia-text">
        <h4>Badge-Aufstieg</h4>
        <p>Wenn du eine neue Stufe erreichst</p>
        <div class="dia-badge">+5 💎</div>
      </div>
    </div>
  </div>

  <div style="background:linear-gradient(135deg,rgba(167,139,250,.12),rgba(124,58,237,.06));border:1px solid rgba(167,139,250,.25);border-radius:16px;padding:20px;margin-top:20px;display:flex;align-items:center;gap:16px">
    <div style="font-size:36px">💎</div>
    <div>
      <div style="font-size:14px;font-weight:700;color:#a78bfa;margin-bottom:4px">Diamanten ausgeben im Shop</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5">Profilrahmen mit Glow-Effekt · Extra-Links (5 💎) · zukünftige Shop-Items</div>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ PROFIL & SHOP ════ -->
<div class="section section-green">
  <div class="section-label">Dein Auftritt</div>
  <h2>Profil &amp; <span class="grad-text-green">Shop</span></h2>
  <p class="lead">Dein Profil ist deine Visitenkarte in der Community. Mach es vollständig — und schmück es mit einem Profilrahmen aus dem Shop.</p>

  <div class="profile-box" style="margin-bottom:20px">
    <div class="profile-banner">
      <div class="profile-av-wrap">Du</div>
    </div>
    <div class="profile-info">
      <div>
        <div class="profile-name">Dein Name</div>
        <div class="profile-handle">@dein.instagram · ⬆️ Aufsteiger</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--purple)">💎 18</div>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><div class="profile-stat-val">890</div><div class="profile-stat-lbl">XP</div></div>
      <div class="profile-stat"><div class="profile-stat-val">24</div><div class="profile-stat-lbl">Links</div></div>
      <div class="profile-stat"><div class="profile-stat-val">142</div><div class="profile-stat-lbl">Likes</div></div>
      <div class="profile-stat"><div class="profile-stat-val">#4</div><div class="profile-stat-lbl">Rang</div></div>
    </div>
  </div>

  <div class="shop-grid">
    <div class="shop-item">
      <div class="shop-ring" style="box-shadow:0 0 0 3px #ff6b6b,0 0 16px rgba(255,107,107,.4)">Du</div>
      <div class="shop-ring-name">🔥 Flamme</div>
      <div class="shop-ring-price">10 💎</div>
    </div>
    <div class="shop-item">
      <div class="shop-ring" style="box-shadow:0 0 0 3px #ffd43b,0 0 16px rgba(255,215,0,.4)">Du</div>
      <div class="shop-ring-name">👑 Gold</div>
      <div class="shop-ring-price">25 💎</div>
    </div>
    <div class="shop-item">
      <div class="shop-ring" style="box-shadow:0 0 0 3px #a78bfa,0 0 16px rgba(167,139,250,.4)">Du</div>
      <div class="shop-ring-name">✨ Galaxis</div>
      <div class="shop-ring-price">40 💎</div>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ NACHRICHTEN ════ -->
<div class="section">
  <div class="section-label">Community</div>
  <h2>Nachrichten &amp; <span class="grad-text">Threads</span></h2>
  <p class="lead">Die Community-Kommunikation läuft direkt in der App. DMs an einzelne Mitglieder oder Gruppen-Threads für alle.</p>

  <div style="display:flex;flex-direction:column;gap:10px">
    <div style="background:var(--bg2);border:1px solid rgba(0,136,204,.2);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:12px;background:rgba(0,136,204,.15);border:1px solid rgba(0,136,204,.3);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">💬</div>
      <div>
        <div style="font-size:14px;font-weight:700;margin-bottom:3px">Direkt-Nachrichten</div>
        <div style="font-size:12px;color:var(--muted)">Schreib direkt mit jedem Mitglied — aus dem Profil oder Feed heraus</div>
      </div>
    </div>
    <div style="background:var(--bg2);border:1px solid rgba(167,139,250,.2);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:12px;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.25);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🧵</div>
      <div>
        <div style="font-size:14px;font-weight:700;margin-bottom:3px">Community-Threads</div>
        <div style="font-size:12px;color:var(--muted)">Themen-Chats für die ganze Gruppe — General, Full Engagement und mehr</div>
      </div>
    </div>
    <div style="background:var(--bg2);border:1px solid rgba(255,215,0,.2);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,215,0,.1);border:1px solid rgba(255,215,0,.25);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🔔</div>
      <div>
        <div style="font-size:14px;font-weight:700;margin-bottom:3px">Push-Benachrichtigungen</div>
        <div style="font-size:12px;color:var(--muted)">Likes, neue Links, DMs — bleib immer auf dem Laufenden</div>
      </div>
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- ════════════════════════════════════════════ CTA ════ -->
<div class="cta">
  <div class="cta-glow"></div>
  <h2>Bereit zum <span class="grad-text">Starten?</span></h2>
  <p>Tritt der Gruppe bei, hol dir deinen Code und leg los. Die Community wartet.</p>
  <div style="display:flex;flex-direction:column;align-items:center;gap:12px;position:relative;z-index:1">
    <a href="https://t.me/+w-V2QL-igJw5YjY0" class="cta-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.269c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.19 14.9l-2.965-.924c-.643-.203-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.631.686z"/></svg>
      Telegram Gruppe beitreten
    </a>
    <div style="font-size:12px;color:rgba(255,255,255,.3)">Dann /mycode im Bot eingeben → App-Code erhalten → einloggen</div>
  </div>
</div>

<!-- ════════════════════════════════════════════ FOOTER ════ -->
<div class="footer">
  <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:900;background:linear-gradient(135deg,#ff6b6b,#ffa500);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px">CreatorX</div>
  <p style="font-size:12px;color:rgba(255,255,255,.2)">Die Community für Instagram Creators · Gemeinsam wachsen</p>
</div>

</body>
</html>
`;
        if (isDownload) { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename="creatorx-guide.html"'}); }
        else { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); }
        return res.end(NEWSLETTER_HTML);
    }

    // ── ONBOARDING PREVIEW (Admin) ──
    if (path === '/onboarding-preview') {
        if (!session) return redirect('/');
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
        return res.end(onboardingHTML(true));
    }

    // ── AUTH REQUIRED ──
    if (!session) return redirect('/');

    const d = await fetchBot('/data');
    if (!d) {
        res.writeHead(503,{'Content-Type':'text/html; charset=utf-8'});
        return res.end(layout('<div class="empty" style="margin-top:30vh"><div class="empty-icon">⚠️</div><div class="empty-text">Server nicht erreichbar</div><div class="empty-sub">Bitte versuche es später</div></div>', session, 'feed', lang));
    }

    const myUid = getMyUid(session);
    const myUser = d.users?.[myUid];
    const today = new Date().toDateString();
    const adminIds = (Array.isArray(d._adminIds) ? d._adminIds.map(Number) : Object.entries(d.users).filter(([,u])=>u.role==='⚙️ Admin').map(([id])=>Number(id)));

    // ── API ENDPOINTS ──
    if (path === '/api/push-subscribe' && req.method === 'POST') {
        const body = await parseBody(req);
        const { sub } = body;
        if (!sub?.endpoint) return json({ok:false});
        const hash = crypto.createHash('sha256').update(sub.endpoint).digest('hex').slice(0,16);
        // Push-Subscription gehört dem Gerät/Mensch — IMMER auf Parent-UID keyen, nicht auf
        // den gerade aktiven Sub. Sonst kriegt der Parent keine Pushes mehr nach Account-Switch.
        pushSubs[hash] = { uid: String(session.uid), sub };
        savePushSubs();
        return json({ok:true});
    }

    // Server-to-server push (vom main bot getriggert) — komplett zusätzlich, ändert nichts Bestehendes
    if (path === '/api/push-notify' && req.method === 'POST') {
        if (req.headers['x-bridge-secret'] !== BRIDGE_SECRET) return json({ok:false, error:'Forbidden'}, 403);
        if (!webpush) return json({ok:false, error:'web-push nicht verfügbar'});
        const body = await parseBody(req);
        const targetUid = String(body.uid||'');
        const title = String(body.title||'CreatorX').slice(0,80);
        const text = String(body.body||'').slice(0,180);
        const targetUrl = String(body.url||'/feed').slice(0,200);
        if (!targetUid || !text) return json({ok:false, error:'Fehlende Felder'});
        const payload = JSON.stringify({title, body:text, url:targetUrl});
        const targets = Object.entries(pushSubs).filter(([,v]) => String(v.uid) === targetUid);
        const results = await Promise.allSettled(targets.map(([,v]) => webpush.sendNotification(v.sub, payload)));
        let sent = 0, failed = 0, dirty = false;
        results.forEach((r,i) => {
            if (r.status === 'fulfilled') sent++;
            else { failed++; const sc = r.reason?.statusCode; if (sc===410||sc===404) { delete pushSubs[targets[i][0]]; dirty = true; } }
        });
        if (dirty || sent || failed) savePushSubs();
        return json({ok:true, sent, failed});
    }
    if (path === '/api/push-broadcast' && req.method === 'POST') {
        if (req.headers['x-bridge-secret'] !== BRIDGE_SECRET) return json({ok:false, error:'Forbidden'}, 403);
        if (!webpush) return json({ok:false, error:'web-push nicht verfügbar'});
        const body = await parseBody(req);
        const title = String(body.title||'CreatorX').slice(0,80);
        const text = String(body.body||'').slice(0,180);
        const targetUrl = String(body.url||'/feed').slice(0,200);
        const exceptUid = String(body.exceptUid||'');
        if (!text) return json({ok:false, error:'Fehlende Felder'});
        const payload = JSON.stringify({title, body:text, url:targetUrl});
        const targets = Object.entries(pushSubs).filter(([,v]) => !exceptUid || String(v.uid) !== exceptUid);
        const results = await Promise.allSettled(targets.map(([,v]) => webpush.sendNotification(v.sub, payload)));
        let sent = 0, failed = 0, dirty = false;
        results.forEach((r,i) => {
            if (r.status === 'fulfilled') sent++;
            else { failed++; const sc = r.reason?.statusCode; if (sc===410||sc===404) { delete pushSubs[targets[i][0]]; dirty = true; } }
        });
        if (dirty || sent || failed) savePushSubs();
        return json({ok:true, sent, failed});
    }

    if (path === '/api/theme' && req.method === 'POST') {
        const body = await parseBody(req);
        if(session) { session.theme = body.theme||'dark'; saveSessions(); }
        return json({ok:true});
    }
    if (path === '/api/lang' && req.method === 'POST') {
        const body = await parseBody(req);
        if(session) { session.lang = body.lang||'de'; saveSessions(); }
        return json({ok:true});
    }
    if (path === '/api/save-profile' && req.method === 'POST') {
        const body = await parseBody(req);
        const updateData = { uid: myUid };
        if (body.bio !== undefined) updateData.bio = String(body.bio).slice(0, 100);
        if (body.spitzname !== undefined) updateData.spitzname = String(body.spitzname).slice(0, 30);
        // accentColor-Whitelist gegen JS-Injection im inline-Style/JS-Literal
        const ACCENT_WHITELIST = ['#ff6b6b','#ffa500','#00c851','#4dabf7','#cc5de8','#ffd43b','#ff8cc8','#20c997','#ff6348'];
        if (body.accentColor && ACCENT_WHITELIST.includes(body.accentColor)) updateData.accentColor = body.accentColor;
        if (body.nische !== undefined) updateData.nische = String(body.nische).slice(0, 50);
        // Website nur http(s) durchlassen
        if (body.website !== undefined) {
            const w = String(body.website).trim();
            updateData.website = w === '' ? '' : (/^https?:\/\//i.test(w) ? w.slice(0, 100) : '');
        }
        if (body.tiktok !== undefined) updateData.tiktok = body.tiktok;
        if (body.youtube !== undefined) updateData.youtube = body.youtube;
        if (body.twitter !== undefined) updateData.twitter = body.twitter;
        if (body.instagram !== undefined) updateData.instagram = body.instagram;
        if (body.banner !== undefined) updateData.banner = body.banner;
        await postBot('/update-profile-api', updateData);
        if (session) {
            if (body.theme) session.theme = body.theme;
            if (body.lang) session.lang = body.lang;
            saveSessions();
        }
        await checkProfileCompletion(myUid, session);
        return json({ok:true});
    }

    if (path === '/api/follow' && req.method === 'POST') {
        const body = await parseBody(req);
        const targetUid = body && body.uid ? String(body.uid) : '';
        if (!targetUid) return json({ok:false, error:'Fehlende targetUid'},400);
        if (targetUid === myUid) return json({ok:false, error:'Kann dir nicht selbst folgen'},400);
        const result = await postBot('/follow-api', { followerUid: String(myUid), targetUid });
        console.log('[follow] me=' + myUid + ' → ' + targetUid + ' result=' + JSON.stringify(result));
        if (result && result.ok === true) return json({ok:true, action: result.action});
        return json({ok:false, error: (result && result.error) ? result.error : 'Bot-API fehlgeschlagen'}, 500);
    }
    if (path === '/follow-form' && req.method === 'POST') {
        const body = await parseBody(req);
        const targetUid = body && body.uid ? String(body.uid) : '';
        const back = body && body.back ? String(body.back) : '/explore';
        if (targetUid && targetUid !== myUid) {
            await postBot('/follow-api', { followerUid: String(myUid), targetUid });
        }
        res.writeHead(302, { 'Location': back || '/explore' });
        return res.end();
    }

    if (path === '/api/post' && req.method === 'POST') {
        let body;
        try { body = JSON.parse(await readBody(req, 25000000)); } catch(e) { return json({error:'Zu groß oder ungültig'},400); }
        const { text, attachment, attachmentType } = body;
        if (!text?.trim() && !attachment) return json({error:'Text oder Datei erforderlich'},400);
        if (text && text.length > 300) return json({error:'Max 300 Zeichen'},400);
        await postBot('/create-post-api', { uid: myUid, text: (text||'').trim(), attachment, attachmentType });
        return json({ok:true});
    }

    if (path === '/api/delete-post' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = await postBot('/delete-post-api', { uid: myUid, timestamp: body.timestamp });
        return json({ok: !!result});
    }

    if (path === '/api/delete-thread-msg' && req.method === 'POST') {
        const body = await parseBody(req);
        const { threadId, timestamp, msgId } = body;
        if (!threadId || !timestamp) return json({error:'Ungültig'}, 400);
        const result = await postBot('/delete-thread-msg-api', { threadId, timestamp: Number(timestamp), msgId, uid: myUid });
        return json({ok: result?.ok === true, error: result?.error || null});
    }

    if (path === '/api/delete-dm' && req.method === 'POST') {
        const body = await parseBody(req);
        const { chatKey, timestamp } = body;
        if (!chatKey || !timestamp) return json({error:'Ungültig'}, 400);
        const [a, b] = chatKey.split('_');
        if (a !== myUid && b !== myUid) return json({error:'Kein Zugriff'}, 403);
        const result = await postBot('/delete-dm-api', { chatKey, timestamp: Number(timestamp), uid: myUid });
        return json({ok: !!result});
    }

    if (path === '/api/delete-comment' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = await postBot('/delete-comment-api', { uid: myUid, postId: body.postId, commentIdx: body.commentIdx });
        return json({ok: !!result});
    }

    if (path === '/api/post-link' && req.method === 'POST') {
        const body = await parseBody(req);
        const { url: linkUrl, caption } = body;
        if (!linkUrl || !linkUrl.includes('instagram.com')) return json({error:'Nur Instagram Links'},400);
        const result = await postBot('/post-link-from-app', { uid: myUid, name: session.name, url: linkUrl.trim(), caption: body.caption||'' });
        if (!result) return json({error:'Fehler beim Senden'},500);
        if (result.ok !== false && webpush) {
            const posterName = session.name || 'Jemand';
            const payload = JSON.stringify({title:'🔥 Neuer Reel-Link!',body:posterName+' hat einen Link in CreatorX geteilt',url:'/feed'});
            // Vorher: savePushSubs() lief synchron VOR den .catch der Sends — abgelaufene Subs (410/404)
            // wurden nie persistiert. Jetzt: Promise.allSettled, dann erst persistieren.
            const targets = Object.entries(pushSubs).filter(([,v]) => v.uid !== myUid);
            const results = await Promise.allSettled(targets.map(([,v]) => webpush.sendNotification(v.sub, payload)));
            let dirty = false;
            results.forEach((r,i) => {
                if (r.status === 'rejected') {
                    const sc = r.reason?.statusCode;
                    if (sc === 410 || sc === 404) { delete pushSubs[targets[i][0]]; dirty = true; }
                }
            });
            if (dirty) savePushSubs();
        }
        return json({ok:true});
    }

    if (path === '/api/pin-post' && req.method === 'POST') {
        const body = await parseBody(req);
        await postBot('/pin-post-api', { uid: myUid, timestamp: body.timestamp });
        return json({ok:true});
    }

    if (path === '/api/engage-pinned-post' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const body = await parseBody(req);
        const ownerUid = String(body.ownerUid||'');
        if (!ownerUid || ownerUid === myUid) return json({error:'Ungültig'},400);
        const result = await postBot('/engage-pinned-post-api', { engagerUid: myUid, ownerUid });
        return json({ok:!!result?.ok, alreadyDone: result?.alreadyDone||false});
    }

    if (path === '/api/newsletter-add' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const chunks=[]; for await(const c of req) chunks.push(c);
        const { title, content } = JSON.parse(Buffer.concat(chunks).toString());
        if (!content?.trim()) return json({error:'Inhalt fehlt'},400);
        const result = await postBot('/add-newsletter-api', { uid: myUid, title: (title||'').trim(), content: content.trim() });
        return json({ok:!!result?.ok, error: result?.error});
    }

    if (path === '/api/newsletter-edit' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const chunks=[]; for await(const c of req) chunks.push(c);
        const { id, title, content } = JSON.parse(Buffer.concat(chunks).toString());
        if (!id || !content?.trim()) return json({error:'Fehlend'},400);
        const result = await postBot('/edit-newsletter-api', { uid: myUid, id, title: (title||'').trim(), content: content.trim() });
        return json({ok:!!result?.ok, error: result?.error});
    }

    if (path === '/api/newsletter-delete' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const body = await parseBody(req);
        const result = await postBot('/delete-newsletter-api', { uid: myUid, id: body.id });
        return json({ok:!!result?.ok});
    }

    if (path === '/api/comment' && req.method === 'POST') {
        const body = await parseBody(req);
        const { postId, text } = body;
        if (!postId || !text?.trim()) return json({error:'Ungültig'},400);
        await postBot('/comment-api', { uid: myUid, name: session.name||'User', linkId: postId, text: text.trim().slice(0,200) });
        return json({ok:true});
    }

    // ── FEED ──
    if (path === '/api/onboarding-done' && req.method === 'POST') {
        session.onboardingDone = true;
        saveSessions();
        return json({ok:true});
    }

    if (path === '/feed') {
        const tab = query.tab || 'heute';
        const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
        const todayLinks = Object.entries(d.links||{})
            .filter(([,l]) => l.timestamp && l.timestamp >= twoDaysAgo && l.text && l.text.includes('instagram.com'))
            .sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
        const seenMsgIds = new Set();
        const dedupLinks = todayLinks.filter(([id,l]) => {
            const key = String(l.counter_msg_id||id);
            if (seenMsgIds.has(key)) return false;
            seenMsgIds.add(key);
            return true;
        });

        const myFollowing = (d.users[myUid]?.following||[]).map(String);
        const topUsers = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&u.inGruppe!==false&&(myFollowing.includes(String(id))||String(id)===String(myUid)))
            .sort((a,b)=>(b[1].xp||0)-(a[1].xp||0))
            .slice(0,10);

        const storiesHtml = `<div class="stories">
  ${topUsers.map(([id,u])=>{
    const insta = u.instagram;
    const hasLink = Object.values(d.links||{}).some(l=>l.user_id===Number(id)&&new Date(l.timestamp).toDateString()===today);
    return `<a href="/profil/${id}" class="story-item">
      <div class="story-ring ${hasLink?'':'seen'}">
        <div style="width:58px;height:58px;border-radius:50%;overflow:hidden;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;border:2px solid var(--bg)">
          ${(ladeBild(id,"profilepic")||insta)?`<img src="${ladeBild(id,"profilepic")?"/appbild/"+id+"/profilepic":"https://unavatar.io/instagram/"+insta}" style="width:100%;height:100%;object-fit:cover" alt="">`:`<span>${(u.name||"?")[0]}</span>`}
        </div>
      </div>
      <div class="story-name">${u.spitzname||u.name||'?'}</div>
    </a>`;
  }).join('')}
</div>`;

        const todayStr = new Date().toDateString();
        const heuteLinks = dedupLinks.filter(([,l])=>new Date(l.timestamp||0).toDateString()===todayStr);
        const aelterLinks = dedupLinks.filter(([,l])=>new Date(l.timestamp||0).toDateString()!==todayStr);

        function renderLink([msgId, link]){
            const poster = d.users[String(link.user_id)]||{};
            const allLinksForUrl = Object.values(d.links||{}).filter(l=>l.text===link.text);
            const allLikes = new Set();
            allLinksForUrl.forEach(l=>{(Array.isArray(l.likes)?l.likes:[]).forEach(id=>allLikes.add(id));});
            const likes = [...allLikes];
            const hasLiked = likes.map(String).includes(String(myUid));
            const isNewForUser = !hasLiked && link.timestamp && new Date(link.timestamp).toDateString() === new Date().toDateString();
            const insta = poster.instagram;
            const grad = badgeGradient(poster.role);
            const lid1 = String(link.counter_msg_id||msgId);

            const isOnline = isUidOnline(link.user_id);

            // Banner
            const bannerBg = (poster.banner && !poster.banner.startsWith('data:')) ? '#000' : (poster.banner || 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)');
            const bannerFile = ladeBild(String(link.user_id),'banner');
            const bannerImg = bannerFile ? '<img src="/appbild/'+String(link.user_id)+'/banner" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.remove()" alt="">' : '';

            // Profile pic (small, in header)
            const picFile = ladeBild(String(link.user_id),'profilepic');
            const avatarSmall = picFile
                ? '<img src="/appbild/'+String(link.user_id)+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">'
                : insta ? '<img src="https://unavatar.io/instagram/'+insta+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">' : '';

            // Profile pic (large, on banner)
            const profPic = picFile
                ? '<img src="/appbild/'+String(link.user_id)+'/profilepic" style="width:100%;height:100%;object-fit:cover" loading="lazy" alt="">'
                : insta ? '<img src="https://unavatar.io/instagram/'+insta+'" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.remove()" alt="">'
                : (poster.name||'?').slice(0,2).toUpperCase();

            // Liker avatar stack
            const likerAvatars = likes.slice(0,4).map(lid=>{
                const lu=d.users[String(lid)]; const lg=badgeGradient(lu&&lu.role);
                const lf=ladeBild(String(lid),'profilepic');
                const li=lu&&lu.instagram;
                const limg=lf?'<img src="/appbild/'+lid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':li?'<img src="https://unavatar.io/instagram/'+li+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':'';
                return '<div style="position:relative;width:24px;height:24px;border-radius:50%;background:'+lg+';border:2px solid var(--bg4);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;margin-left:-6px;flex-shrink:0"><span style="position:absolute">'+(lu&&lu.name||'?')[0]+'</span>'+limg+'</div>';
            }).join('');

            // Liker rows
            const likerRows = likes.map((lid,i)=>{
                const lu=d.users[String(lid)]; const lg=badgeGradient(lu&&lu.role);
                const lf=ladeBild(String(lid),'profilepic'); const li=lu&&lu.instagram;
                const limg=lf?'<img src="/appbild/'+lid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':li?'<img src="https://unavatar.io/instagram/'+li+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':'';
                return '<a href="/profil/'+lid+'" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--border2);text-decoration:none;background:'+(i%2===0?'transparent':'rgba(255,255,255,.02)')+'"><div style="position:relative;width:34px;height:34px;border-radius:50%;background:'+lg+';flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff"><span style="position:absolute">'+(lu&&lu.name||'?')[0]+'</span>'+limg+'</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text)">'+(lu&&(lu.spitzname||lu.name)||'User')+'</div><div style="font-size:10px;color:var(--muted)">'+(lu&&lu.role||'')+'</div></div><div style="font-size:11px;color:var(--accent)">→</div></a>';
            }).join('');

            // Comments
            const allComments = (d.comments&&d.comments[lid1])||(d.comments&&d.comments[msgId])||[];
            const commentCount = allComments.length;
            const commentRows = commentCount===0
                ? '<div style="padding:12px;font-size:12px;color:var(--muted);text-align:center">Noch keine Kommentare</div>'
                : allComments.map(c=>{
                    const cu=d.users[String(c.uid)]||{}; const cg=badgeGradient(cu.role);
                    const cf=ladeBild(String(c.uid),'profilepic'); const ci=cu.instagram;
                    const cimg=cf?'<img src="/appbild/'+c.uid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':ci?'<img src="https://unavatar.io/instagram/'+ci+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':'';
                    const ct=new Date(c.timestamp||0).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
                    return '<div style="display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border2)"><div style="position:relative;width:28px;height:28px;border-radius:50%;background:'+cg+';flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff"><span style="position:absolute">'+htmlEsc((cu.name||'?')[0])+'</span>'+cimg+'</div><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:700">'+htmlEsc(cu.spitzname||cu.name||'User')+' <span style="font-size:10px;color:var(--muted);font-weight:400">'+ct+'</span></div><div style="font-size:12px;color:var(--text);margin-top:2px">'+htmlEsc(c.text)+'</div></div></div>';
                }).join('');

            // Liker names text ("Gefällt X, Y und Z weiteren")
            const likerNamesList=likes.slice(0,3).map(lid=>{const lu=d.users[String(lid)];return lu&&(lu.spitzname||lu.name)||'?';});
            let likersNameText='';
            if(likes.length===1) likersNameText='Gefällt <span>'+likerNamesList[0]+'</span>';
            else if(likes.length===2) likersNameText='Gefällt <span>'+likerNamesList[0]+'</span> und <span>'+likerNamesList[1]+'</span>';
            else if(likes.length>=3) likersNameText='Gefällt <span>'+likerNamesList[0]+'</span>, <span>'+likerNamesList[1]+'</span> und '+(likes.length-2)+' weiteren';

            // Like button
            const isOwnPost = String(link.user_id)===String(myUid);
            const likeBtn = isOwnPost
                ? '<div style="font-size:12px;color:var(--muted);padding:7px 0">👤 Dein Link</div>'
                : '<button class="post-action-btn '+(hasLiked?'liked':'')+'" onclick="likePost(\''+lid1+'\',this)" data-msgid="'+lid1+'" '+(hasLiked?'disabled':'')+'>'+
                  '<svg width="18" height="18" viewBox="0 0 24 24" fill="'+(hasLiked?'currentColor':'none')+'" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'+
                  'Like <span id="likes-'+lid1+'">'+likes.length+'</span>'+
                  '</button>';

            // "Wer hat geliked?" button — only shown when there are likes
            const whoLikedBtn = likes.length>0
                ? '<button class="post-action-btn" onclick="showLikerModal(\''+lid1+'\')">'+
                  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'+
                  'Wer hat geliked?</button>'
                : '';

            // Comments box HTML
            const commentsBox =
                '<div style="margin:0 16px 12px">'+
                '<button onclick="toggleComments(\''+lid1+'\')" style="background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;padding:0 0 6px 0">'+
                '💬 '+(commentCount>0?commentCount+' ':'')+( commentCount===1?'Kommentar':'Kommentare')+
                '</button>'+
                '<div id="comments-box-'+lid1+'" style="display:none;border:1px solid var(--border2);border-radius:12px;overflow:hidden;background:var(--bg3);margin-top:4px">'+
                '<div style="padding:8px 12px;border-bottom:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--muted);display:flex;justify-content:space-between">'+
                '<span>💬 Kommentare</span>'+
                '<button onclick="toggleComments(\''+lid1+'\')" style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer">✕</button>'+
                '</div>'+
                '<div style="max-height:200px;overflow-y:auto">'+commentRows+'</div>'+
                '<div style="display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--border2)">'+
                '<input type="text" id="comment-input-'+lid1+'" placeholder="Kommentieren..." style="flex:1;background:var(--bg4);border:1px solid var(--border);color:var(--text);border-radius:20px;padding:7px 12px;font-size:12px;outline:none" onkeypress="if(event.key===\'Enter\')submitComment(\''+lid1+'\')">'+
                '<button onclick="submitComment(\''+lid1+'\')" style="background:var(--accent);color:#fff;border:none;border-radius:20px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">→</button>'+
                '</div>'+
                '</div>'+
                '</div>';

            // Extract Instagram shortcode for reel embed
            const instaShortcode = (()=>{ const m=(link.text||'').match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/); return m?m[1]:null; })();

            return '<div class="post fade-up" id="post-'+msgId+'" data-url="'+link.text+'" data-ts="'+(link.timestamp||0)+'" style="position:relative">\n'+
'  <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:'+grad+';border-radius:18px 0 0 18px"></div>\n'+
// Category badge + timestamp row
'  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px 0">\n'+
(isNewForUser ? '    <span class="post-category-label" style="background:linear-gradient(135deg,var(--accent),var(--accent2))">📸 Neuer Link</span>\n' : '    <span></span>\n')+
'    <span class="post-time">'+new Date(link.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'</span>\n'+
'  </div>\n'+
// Post header
'  <div class="post-header" style="padding-top:8px">\n'+
'    <div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:'+grad+';flex-shrink:0;display:flex;align-items:center;justify-content:center">\n'+
'      <span style="color:#fff;font-weight:700;font-size:15px;position:absolute">'+(poster.name||'?').slice(0,1)+'</span>\n'+
'      '+avatarSmall+'\n'+
'    </div>\n'+
'    <div class="post-user-info">\n'+
'      <div class="post-name" style="display:flex;align-items:center;gap:5px">\n'+
'        '+(poster.spitzname||poster.name||'User')+'\n'+
'        '+(isOnline?'<span style="width:7px;height:7px;border-radius:50%;background:#00c851;display:inline-block;flex-shrink:0"></span>':'')+'\n'+
'      </div>\n'+
'      <div class="post-badge">'+(poster.role||'')+(insta?'<span style="color:var(--muted2)"> · @'+poster.instagram+'</span>':'')+'</div>\n'+
'    </div>\n'+
'  </div>\n'+
// Reel video preview card
'  <div style="margin:0 16px;border-radius:14px;overflow:hidden;background:#000;border:1.5px solid;border-image:linear-gradient(135deg,#f9a825,#e91e63,#9c27b0) 1;cursor:pointer;box-shadow:0 6px 20px rgba(233,30,99,0.10)" onclick="window.open(\''+link.text+'\',\'_blank\')">\n'+
'    <div style="position:relative;width:100%;padding-top:62%;background:'+bannerBg+';overflow:hidden">\n'+
'      '+bannerImg.replace('position:absolute;inset:0;','position:absolute;inset:0;')+'\n'+
'      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.1) 0%,rgba(0,0,0,.55) 100%)"></div>\n'+
'      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">\n'+
'        <div style="width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 16px rgba(0,0,0,.35)">\n'+
'          <div style="width:0;height:0;border-style:solid;border-width:11px 0 11px 20px;border-color:transparent transparent transparent #000;margin-left:4px"></div>\n'+
'        </div>\n'+
'      </div>\n'+
'      <div style="position:absolute;top:10px;left:12px;background:rgba(0,0,0,.55);border-radius:8px;padding:4px 9px;display:flex;align-items:center;gap:5px;backdrop-filter:blur(4px)">\n'+
'        <span style="font-size:13px">📸</span><span style="font-size:11px;color:#fff;font-weight:600">Instagram Reel</span>\n'+
'      </div>\n'+
'      <div style="position:absolute;bottom:0;left:0;right:0;padding:10px 12px">\n'+
'        <a href="/profil/'+link.user_id+'" onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:8px;text-decoration:none">\n'+
'          <div style="width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,.5);overflow:hidden;background:'+grad+';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff">'+profPic+'</div>\n'+
'          <div style="font-size:12px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6)">'+(poster.spitzname||poster.name||'User')+'</div>\n'+
'        </a>\n'+
'      </div>\n'+
'    </div>\n'+
(link.caption?'    <div style="padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.4;border-top:1px solid rgba(255,255,255,.06)">'+String(link.caption).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>\n':'')+
'    <div style="padding:6px 12px 8px;display:flex;align-items:center;gap:6px">\n'+
'      <div style="font-size:10px;color:var(--muted2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+link.text.replace('https://www.','').replace('https://','').slice(0,50)+'</div>\n'+
'      <div style="font-size:10px;color:var(--accent);font-weight:700">Ansehen →</div>\n'+
'    </div>\n'+
'  </div>\n'+
// Likes counter + XP badge
'  <div class="post-likes-row">\n'+
'    <span class="post-like-count">❤️ <span id="likes-'+lid1+'">'+likes.length+'</span></span>\n'+
'    <span class="post-xp-pill">⚡ '+(poster.xp||0)+' XP</span>\n'+
'  </div>\n'+
// "Gefällt X und Y" text
(likersNameText?'  <div class="post-likers">'+likersNameText+'</div>\n':'')+
// Hidden liker rows for modal
'<div id="liker-rows-'+lid1+'" style="display:none">'+likerRows+'</div>\n'+
// Action buttons: Like + Wer hat geliked?
'  <div class="post-actions" style="gap:8px;padding:8px 16px 12px">'+likeBtn+whoLikedBtn+'</div>\n'+
commentsBox+
'</div>';}

        // Superlink week key (Berlin time)
        const _bNow = new Date(new Date().toLocaleString('en-US', {timeZone:'Europe/Berlin'}));
        const _bDay = _bNow.getDay();
        const _bOff = _bDay === 0 ? -6 : 1 - _bDay;
        const _bMon = new Date(_bNow); _bMon.setDate(_bNow.getDate() + _bOff);
        const slWeekKey = _bMon.toISOString().slice(0,10);
        const mySlMax = (d.users[myUid]?.role === '🌟 Elite+') ? 2 : 1;
        const mySlCount = Object.values(d.superlinks||{}).filter(s=>s.uid===myUid&&s.week===slWeekKey).length;
        const myWeekSuperlink = mySlCount > 0;
        const slAvailable = Math.max(0, mySlMax - mySlCount);

        function renderSuperLink(sl) {
            const poster = d.users[String(sl.uid)]||{};
            const likes = Array.isArray(sl.likes) ? sl.likes : [];
            const hasLiked = likes.map(String).includes(String(myUid));
            const isOwnPost = String(sl.uid) === String(myUid);
            const insta = poster.instagram;
            const grad = badgeGradient(poster.role);
            const picFile = ladeBild(String(sl.uid),'profilepic');
            const avatarSmall = picFile
                ? '<img src="/appbild/'+String(sl.uid)+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">'
                : insta ? '<img src="https://unavatar.io/instagram/'+insta+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">' : '';
            const likerRows = likes.map(lid=>{
                const lu=d.users[String(lid)]; const lg=badgeGradient(lu&&lu.role);
                const lf=ladeBild(String(lid),'profilepic'); const li=lu&&lu.instagram;
                const limg=lf?'<img src="/appbild/'+lid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':li?'<img src="https://unavatar.io/instagram/'+li+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">':'';
                const rName = ((lu&&(lu.spitzname||lu.name))||'User').replace(/'/g,'&#39;');
                const reportBtn = isOwnPost ? '<button onclick="reportNonEngager(\''+sl.id+'\',\''+lid+'\',\''+rName+'\')" style="background:none;border:1px solid rgba(255,59,48,.5);color:rgba(255,59,48,.8);border-radius:8px;padding:3px 8px;font-size:10px;font-weight:600;cursor:pointer;flex-shrink:0">Melden</button>' : '';
                return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--border2)"><div style="position:relative;width:34px;height:34px;border-radius:50%;background:'+lg+';flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff"><span style="position:absolute">'+(lu&&lu.name||'?')[0]+'</span>'+limg+'</div><div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--text)">'+(lu&&(lu.spitzname||lu.name)||'User')+'</div>'+reportBtn+'</div>';
            }).join('');
            const likeBtn = isOwnPost
                ? '<div style="font-size:12px;color:var(--muted);padding:7px 0">👤 Dein Superlink</div>'
                : '<button class="post-action-btn '+(hasLiked?'liked':'')+'" onclick="likeSuperLink(\''+sl.id+'\',this)" '+(hasLiked?'disabled':'')+' style="border:1px solid '+(hasLiked?'var(--accent)':'var(--border)')+';border-radius:12px;padding:9px 18px;font-size:14px;font-weight:700;gap:6px"><svg width="18" height="18" viewBox="0 0 24 24" fill="'+(hasLiked?'currentColor':'none')+'" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>Like <span id="sl-likes-'+sl.id+'">'+likes.length+'</span></button>';
            const whoLikedBtn = '<button class="post-action-btn" onclick="showSLLikerModal(\''+sl.id+'\')" style="border:1px solid var(--border);border-radius:12px;padding:9px 14px;font-size:13px;font-weight:700;gap:5px">👁 Wer hat geliked?</button>';
            const time = new Date(sl.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
            const dateStr = new Date(sl.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short'});
            return '<div class="post fade-up" id="sl-post-'+sl.id+'">\n'
                +'<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px 0">\n'
                +'<span class="post-category-label" style="background:linear-gradient(135deg,#f59e0b,#a78bfa)">⭐ SUPERLINK</span>\n'
                +'<span class="post-time">'+dateStr+' '+time+'</span>\n'
                +'</div>\n'
                +'<div class="post-header" style="padding-top:8px">\n'
                +'<div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:'+grad+';flex-shrink:0;display:flex;align-items:center;justify-content:center">\n'
                +'<span style="color:#fff;font-weight:700;font-size:15px;position:absolute">'+(poster.name||'?')[0]+'</span>\n'
                +avatarSmall+'\n</div>\n'
                +'<div class="post-user-info">\n'
                +'<div class="post-name">'+(poster.spitzname||poster.name||'User')+'</div>\n'
                +'<div class="post-badge">'+(poster.role||'')+(insta?'<span style="color:var(--muted2)"> · @'+insta+'</span>':'')+'</div>\n'
                +'</div>\n</div>\n'
                +'<div style="margin:8px 16px;padding:8px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:10px;font-size:11px;color:rgba(245,158,11,.9);font-weight:600">🔄 Bitte Liken, Kommentieren, Teilen und Speichern</div>\n'
                +'<div style="margin:0 16px 8px;border-radius:14px;overflow:hidden;background:var(--bg3);border:1px solid rgba(255,255,255,.08)">\n'
                +'<a href="'+(sl.url||'').replace(/"/g,'%22')+'" target="_blank" rel="noopener" style="display:block;padding:12px 14px;text-decoration:none">\n'
                +'<div style="font-size:13px;color:var(--blue);word-break:break-all;margin-bottom:4px">'+(sl.url||'').replace('https://www.','').replace('https://','').slice(0,60)+'</div>\n'
                +(sl.caption?'<div style="font-size:12px;color:var(--muted);margin-top:4px">'+String(sl.caption).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>':'')+'\n'
                +'<div style="font-size:11px;color:var(--accent);font-weight:700;margin-top:6px">Ansehen →</div>\n'
                +'</a></div>\n'
                +'<div class="post-likes-row"><span class="post-like-count">❤️ <span id="sl-likes-'+sl.id+'">'+likes.length+'</span></span></div>\n'
                +'<div id="sl-liker-rows-'+sl.id+'" style="display:none">'+likerRows+'</div>\n'
                +'<div class="post-actions" style="gap:8px;padding:8px 16px 12px">'+likeBtn+whoLikedBtn+'</div>\n'
                +'</div>';
        }

        const allSuperLinks = Object.values(d.superlinks||{}).sort((a,b)=>b.timestamp-a.timestamp);
        const engagementHtml = allSuperLinks.length
            ? '<div style="padding:8px 0 80px">'+allSuperLinks.map(renderSuperLink).join('')+'</div>'
            : '<div style="text-align:center;padding:48px 24px;padding-bottom:80px"><div style="font-size:56px;margin-bottom:16px">⭐</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Noch keine Superlinks</div><div style="font-size:13px;color:var(--muted);margin-bottom:24px">Teile deinen Instagram-Link für maximales Engagement mit der Community.</div></div>';

        const heuteHtml = heuteLinks.length ? heuteLinks.map(renderLink).join('') : `
<div style="text-align:center;padding:48px 24px">
  <div style="font-size:56px;margin-bottom:16px">📸</div>
  <div style="font-size:17px;font-weight:700;margin-bottom:8px">Noch keine Links heute</div>
  <div style="font-size:13px;color:var(--muted);margin-bottom:24px">Sei der Erste! Teile deinen Instagram Link mit der Community.</div>
  <button onclick="openPlusSheet()" style="display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;border:none;cursor:pointer;font-family:var(--font)">📸 Jetzt Link teilen</button>
</div>`;
        const aelterHtml = aelterLinks.length ? aelterLinks.map(renderLink).join('') : '<div class="empty" style="margin-top:40px"><div class="empty-icon">🕐</div><div class="empty-text">Keine älteren Links</div></div>';
        const postsHtml = tab === 'aelter' ? '<div style="padding:8px 0 80px">'+aelterHtml+'</div>'
            : tab === 'engagement' ? engagementHtml
            : '<div style="padding:8px 0 80px">'+heuteHtml+'</div>';

        return html(`
<div class="topbar">
  <div class="topbar-logo">CreatorX</div>
  <div class="topbar-actions">
    <button class="icon-btn" onclick="setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')" title="Theme">🌙</button>
  </div>
</div>
<div style="width:100%">${storiesHtml}</div>
${(()=>{
  const todayLiked = Object.values(d.links||{}).some(l=>Array.isArray(l.likes)&&l.likes.map(String).includes(String(myUid))&&new Date(l.timestamp).toDateString()===today);
  const todayTotal = dedupLinks.filter(([,l])=>new Date(l.timestamp||0).toDateString()===today).length;
  const myTodayLikes = Object.values(d.links||{}).filter(l=>Array.isArray(l.likes)&&l.likes.map(String).includes(String(myUid))&&new Date(l.timestamp).toDateString()===today).length;
  const remaining = Math.max(0, todayTotal - myTodayLikes);
  if (remaining > 0 && !todayLiked) {
    return `<div style="margin:8px 16px;padding:10px 14px;background:linear-gradient(135deg,rgba(255,107,107,.15),rgba(255,165,0,.1));border:1px solid rgba(255,107,107,.3);border-radius:12px;display:flex;align-items:center;gap:10px">
      <div style="font-size:22px">⚡</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:700">Du hast heute noch ${remaining} Link${remaining!==1?'s':''} zum Liken!</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Jeder Like gibt dir XP 🏆</div></div>
    </div>`;
  }
  if (todayLiked && myTodayLikes >= todayTotal && todayTotal > 0) {
    return `<div style="margin:8px 16px;padding:10px 14px;background:rgba(0,200,81,.1);border:1px solid rgba(0,200,81,.25);border-radius:12px;display:flex;align-items:center;gap:10px">
      <div style="font-size:22px">✅</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:700">Alle Links für heute geliked!</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Komm morgen wieder 💪</div></div>
    </div>`;
  }
  return '';
})()}
<div style="display:flex;gap:6px;padding:6px 16px 14px;width:100%;box-sizing:border-box">
  <a href="/feed?tab=heute" class="feed-pill ${tab==='heute'?'active':''}" style="flex:1;padding:9px 8px;font-size:12.5px;font-weight:800;text-align:center;text-decoration:none;border-radius:999px;${tab==='heute'?'background:linear-gradient(135deg,var(--accent),#ff8e53);color:#fff;box-shadow:0 4px 14px rgba(255,107,107,0.3)':'background:rgba(255,255,255,0.05);color:var(--muted);border:1px solid rgba(255,255,255,0.06)'};letter-spacing:0.2px">📅 Heute</a>
  <a href="/feed?tab=aelter" class="feed-pill ${tab==='aelter'?'active':''}" style="flex:1;padding:9px 8px;font-size:12.5px;font-weight:800;text-align:center;text-decoration:none;border-radius:999px;${tab==='aelter'?'background:linear-gradient(135deg,#4dabf7,#1d6fa5);color:#fff;box-shadow:0 4px 14px rgba(77,171,247,0.3)':'background:rgba(255,255,255,0.05);color:var(--muted);border:1px solid rgba(255,255,255,0.06)'};letter-spacing:0.2px">🕐 Älter</a>
  <a href="/feed?tab=engagement" class="feed-pill ${tab==='engagement'?'active':''}" style="flex:1;padding:9px 8px;font-size:12.5px;font-weight:800;text-align:center;text-decoration:none;border-radius:999px;${tab==='engagement'?'background:linear-gradient(135deg,#f59e0b,#a78bfa);color:#fff;box-shadow:0 4px 14px rgba(245,158,11,0.3)':'background:rgba(255,255,255,0.05);color:var(--muted);border:1px solid rgba(255,255,255,0.06)'};letter-spacing:0.2px">⭐ Engagement</a>
</div>
${tab==='engagement' ? `<div style="padding:12px 16px 4px">
  ${slAvailable > 0
    ? `<button onclick="openSLSheet()" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:linear-gradient(135deg,#f59e0b,#a78bfa);color:#fff;border:none;border-radius:14px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font)">⭐ Superlink teilen (${slAvailable} verfügbar)</button>`
    : `<div style="padding:12px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px;font-size:12px;color:var(--muted);text-align:center">✅ Du hast diese Woche bereits einen Superlink gepostet</div>`
  }
</div>` : ''}
${postsHtml}
<script>
async function likePost(msgId, btn) {
    const countEl = document.getElementById('likes-'+msgId);
    if (btn.classList.contains('liked')) return;
    btn.classList.add('liked');
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
    countEl.textContent = Number(countEl.textContent) + 1;
    btn.style.animation='pulse .3s ease';
    btn.disabled = true;
    setTimeout(()=>btn.style.animation='',300);
    try {
        const res = await fetch('/api/like', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msgId})});
        const data = await res.json();
        if (data.ok) {
            if (data.likes !== undefined) countEl.textContent = data.likes;
            toast('❤️ Geliked!');
        } else {
            // Bei Fehler UI zurücksetzen, sonst hängt der Button leer/disabled
            btn.classList.remove('liked');
            btn.querySelector('svg').setAttribute('fill', 'none');
            countEl.textContent = Math.max(0, Number(countEl.textContent) - 1);
            btn.disabled = false;
            toast('❌ ' + (data.error || 'Konnte nicht liken'));
        }
    } catch(e) {
        btn.classList.remove('liked');
        btn.querySelector('svg').setAttribute('fill', 'none');
        countEl.textContent = Math.max(0, Number(countEl.textContent) - 1);
        btn.disabled = false;
        toast('❌ Netzwerkfehler');
    }
}
async function refreshLikes() {
    try {
        const res = await fetch('/api/likes-update');
        const data = await res.json();
        if (data.links) {
            data.links.forEach(l => {
                l.ids.forEach(tryId => {
                    const countEl = document.getElementById('likes-' + tryId);
                    if (countEl && countEl.textContent !== String(l.likes)) {
                        countEl.textContent = l.likes;
                    }
                });
            });
        }
    } catch(e) {}
}
setInterval(refreshLikes, 30000);
// Stories: Click-Cancel beim horizontalen Wischen — Swipe scrollt, kein Tap-zum-Profil
(function(){
  const stories=document.querySelector('.stories');
  if(!stories) return;
  let sx=0,sy=0,swiping=false;
  stories.addEventListener('touchstart',e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;swiping=false;stories.classList.remove('is-swiping');},{passive:true});
  stories.addEventListener('touchmove',e=>{const t=e.touches[0];const dx=Math.abs(t.clientX-sx),dy=Math.abs(t.clientY-sy);if(!swiping && (dx>6 || dy>6)){swiping=true;if(dx>dy){stories.classList.add('is-swiping');}}},{passive:true});
  stories.addEventListener('touchend',()=>{setTimeout(()=>stories.classList.remove('is-swiping'),50);},{passive:true});
  stories.addEventListener('click',e=>{if(stories.classList.contains('is-swiping')){e.preventDefault();e.stopPropagation();}},{capture:true});
})();
// Onboarding beim ersten Besuch
try{if(!localStorage.getItem('cb_onboarded')){window.location.href='/onboarding';}}catch(e){}
// Auto-open superlink sheet if redirected from + button
if (new URLSearchParams(window.location.search).get('opensl') === '1') { setTimeout(openSLSheet, 400); }

// Pull-to-refresh
(function(){
  // Pull-to-refresh: braucht jetzt MIN 90px Pull-Down (vorher 1px) — verhindert
  // versehentlichen Reload bei jedem winzigen Touch-Move oben (Stories-Swipe etc).
  const PULL_THRESHOLD = 90;
  let startY=0,startX=0,pulling=false,maxDy=0;
  const ind=document.createElement('div');
  ind.id='ptr-ind';
  ind.style.cssText='position:fixed;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--accent),var(--accent2));transform:scaleX(0);transform-origin:left;transition:transform .2s;z-index:200';
  document.body.prepend(ind);
  document.addEventListener('touchstart',e=>{if(window.scrollY===0){startY=e.touches[0].clientY;startX=e.touches[0].clientX;maxDy=0;pulling=false;}},{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!startY||window.scrollY>0)return;
    const dy=e.touches[0].clientY-startY;
    const dx=Math.abs(e.touches[0].clientX-startX);
    // Horizontale Geste? Pull-to-refresh abbrechen
    if(dx>Math.abs(dy)){pulling=false;ind.style.transform='scaleX(0)';startY=0;return;}
    if(dy>20){maxDy=Math.max(maxDy,dy);if(dy>=PULL_THRESHOLD){pulling=true;}ind.style.transform='scaleX('+Math.min(dy/PULL_THRESHOLD,1)+')';}
  },{passive:true});
  document.addEventListener('touchend',()=>{
    // Nur reloaden wenn wirklich >= Threshold gezogen wurde
    if(pulling && maxDy>=PULL_THRESHOLD && window.scrollY===0){ind.style.transform='scaleX(1)';setTimeout(()=>location.reload(),200);}
    else{ind.style.transform='scaleX(0)';}
    startY=0;pulling=false;
  });
})();

function toggleComments(msgId) {
    const box = document.getElementById('comments-box-' + msgId);
    if (!box) return;
    const isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) setTimeout(() => { const i = document.getElementById('comment-input-'+msgId); if(i) i.focus(); }, 100);
}
async function submitComment(linkId, fallbackId) {
    const id = linkId || fallbackId;
    const input = document.getElementById('comment-input-' + id);
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    const res = await fetch('/api/comment', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId:id,text})});
    const data = await res.json();
    if (data.ok) {
        toast('💬 Kommentar gesendet!');
        const box = document.getElementById('comments-box-' + id);
        if (box) {
            const scrollDiv = box.querySelector('div[style*="max-height:200px"]');
            if (scrollDiv) {
                const el = document.createElement('div');
                el.style.cssText = 'padding:6px 12px;border-bottom:1px solid var(--border2);font-size:12px';
                el.innerHTML = '<span style="font-weight:700;color:var(--accent)">Du</span> <span style="color:var(--muted);font-size:10px">jetzt</span><div style="margin-top:2px">' + text.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div>';
                scrollDiv.appendChild(el);
                scrollDiv.scrollTop = scrollDiv.scrollHeight;
            }
        }
    }
    else toast('❌ Fehler');
}
function toggleLikers(msgId) {
    const box = document.getElementById('likers-box-' + msgId);
    const arrow = document.getElementById('likers-arrow-' + msgId);
    if (!box) return;
    const isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}

// ── SUPERLINK ──
async function likeSuperLink(slId, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
        const res = await fetch('/api/like-superlink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slId})});
        const data = await res.json();
        if (data.ok) {
            btn.classList.add('liked');
            btn.querySelector('svg')?.setAttribute('fill','currentColor');
            btn.style.borderColor='var(--accent)';
            document.querySelectorAll('#sl-likes-'+slId).forEach(el=>el.textContent=data.likes);
            toast('❤️ Geliked!');
        } else { btn.disabled=false; toast('❌ '+(data.error||'Fehler')); }
    } catch(e) { btn.disabled=false; toast('❌ Netzwerkfehler'); }
}
function showSLLikerModal(slId) {
    const modal=document.getElementById('sl-liker-modal');
    const content=document.getElementById('sl-liker-modal-content');
    const rows=document.getElementById('sl-liker-rows-'+slId);
    if(!modal)return;
    content.innerHTML=rows?(rows.innerHTML||'<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Noch niemand geliked</div>'):'<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Noch niemand geliked</div>';
    modal.classList.add('open');document.body.style.overflow='hidden';
}
function closeSLLikerModal(){const m=document.getElementById('sl-liker-modal');if(m){m.classList.remove('open');document.body.style.overflow='';}}
async function reportNonEngager(slId,likerUid,likerName){
    if(!confirm('Möchtest du '+likerName+' wegen mangelndem Engagement melden?'))return;
    const res=await fetch('/api/report-nonengager',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slId,likerUid})});
    const data=await res.json();
    toast(data.ok?'✅ Gemeldet!':'❌ '+(data.error||'Fehler'));
}
function openSLSheet(){document.getElementById('sl-sheet').classList.add('open');document.body.style.overflow='hidden';}
function closeSLSheet(){document.getElementById('sl-sheet').classList.remove('open');document.body.style.overflow='';}
async function submitSuperLink(){
    const url=document.getElementById('sl-url-input').value.trim();
    const caption=document.getElementById('sl-caption-input').value.trim();
    const btn=document.getElementById('sl-submit-btn');
    const result=document.getElementById('sl-result');
    if(!url){result.textContent='❌ Bitte gib einen Instagram-Link ein';return;}
    if(!url.includes('instagram.com')){result.textContent='❌ Nur Instagram-Links erlaubt';return;}
    btn.disabled=true;btn.textContent='...';
    try{
        const res=await fetch('/api/post-superlink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,caption})});
        const data=await res.json();
        if(data.ok){
            closeSLSheet();
            document.getElementById('sl-popup').style.display='flex';
            let secs=10;const countEl=document.getElementById('sl-popup-count');
            if(countEl)countEl.textContent=secs;
            const iv=setInterval(()=>{secs--;if(countEl)countEl.textContent=secs;if(secs<=0)clearInterval(iv);},1000);
            setTimeout(()=>{document.getElementById('sl-popup').style.display='none';location.href='/feed?tab=engagement';},10000);
        } else { result.textContent='❌ '+(data.error||'Fehler');btn.disabled=false;btn.textContent='⭐ Superlink posten'; }
    }catch(e){result.textContent='❌ Netzwerkfehler';btn.disabled=false;btn.textContent='⭐ Superlink posten';}
}
</script>

<!-- Superlink liker modal -->
<div class="liker-modal" id="sl-liker-modal" onclick="if(event.target===this)closeSLLikerModal()">
  <div class="liker-modal-sheet">
    <div style="padding:14px 16px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg3);z-index:1">
      <span style="font-size:14px;font-weight:700">❤️ Wer hat geliked?</span>
      <button onclick="closeSLLikerModal()" style="background:var(--bg4);border:none;color:var(--text);border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
    </div>
    <div id="sl-liker-modal-content" style="padding:4px 0"></div>
    <div style="padding:12px 16px 28px">
      <button onclick="closeSLLikerModal()" style="width:100%;background:var(--bg4);border:none;color:var(--text);border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font)">Schließen</button>
    </div>
  </div>
</div>

<!-- Superlink posting sheet -->
<div class="plus-sheet" id="sl-sheet" onclick="if(event.target===this)closeSLSheet()">
  <div class="plus-sheet-inner">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700">⭐ Superlink teilen</div>
      <button onclick="closeSLSheet()" style="background:var(--bg4);border:none;color:var(--muted);width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div id="sl-sheet-note" style="font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.5;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:10px">⚠️ 1–2 Superlinks pro Woche (Mo–Sa). Du verpflichtest dich, alle anderen Superlinks dieser Woche zu liken, kommentieren, teilen und speichern.</div>
    <input type="url" id="sl-url-input" class="form-input" placeholder="Instagram-Link einfügen..." style="margin-bottom:8px">
    <textarea id="sl-caption-input" class="form-input" placeholder="Beschreibung (optional)" rows="2" maxlength="200" style="margin-bottom:12px"></textarea>
    <button id="sl-submit-btn" class="btn btn-primary btn-full" onclick="submitSuperLink()">⭐ Superlink posten</button>
    <div id="sl-result" style="font-size:12px;color:var(--accent);margin-top:8px;text-align:center"></div>
  </div>
</div>

<!-- 10-second popup after posting superlink -->
<div id="sl-popup" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.85);align-items:center;justify-content:center;padding:24px">
  <div style="background:var(--bg2);border-radius:20px;padding:28px 24px;max-width:360px;width:100%;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">⭐</div>
    <div style="font-size:18px;font-weight:700;margin-bottom:8px">Superlink gepostet!</div>
    <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:20px">Superlinks können 1–2× pro Woche gepostet werden (Elite+ = 2×). Du hast dich damit verpflichtet, <strong style="color:var(--text)">alle anderen Superlinks diese Woche zu liken, kommentieren, teilen und speichern</strong>. Sonst gibt es am Sonntag um 23:59 Uhr −50 XP.</div>
    <div style="font-size:13px;color:var(--muted)">Weiterleitung in <span id="sl-popup-count">10</span> Sekunden...</div>
  </div>
</div>
`, 'feed');
    }

    // ── CHAT ──
    if (path.startsWith('/nachrichten/') && !path.startsWith('/nachrichten/gruppe')) {
        const otherUid = path.replace('/nachrichten/', '');
        const botData = await fetchBot('/data');
        if (!botData) return redirect('/nachrichten');
        const otherUser = botData.users?.[otherUid] || {};
        const otherName = otherUser.spitzname || otherUser.name || 'User';
        const chatKey = [myUid, otherUid].sort().join('_');
        const msgs = (botData.messages?.[chatKey] || []);
        postBot('/mark-messages-read', { uid: myUid, chatKey }).catch(()=>{});
        const msgsHtml = require('./chat-detail-render')({ msgs, myUid, otherUid, otherUser, ladeBild, otherOnline: isUidOnline(otherUid) });
        return html(`
<div class="topbar" style="display:flex;align-items:center;gap:8px;padding:8px 10px">
  <a href="/nachrichten" class="icon-btn" style="font-size:26px;color:var(--accent);padding:6px 10px;text-decoration:none;display:flex;align-items:center">‹</a>
  <a href="/profil/${otherUid}" class="chat-header-link" style="display:flex;align-items:center;gap:11px;text-decoration:none;flex:1;min-width:0">
    <div style="position:relative;width:42px;height:42px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#a78bfa,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 2px 8px rgba(15,23,42,.10)">
      <span style="position:absolute;z-index:0">${htmlEsc(otherName.slice(0,1).toUpperCase())}</span>
      ${ladeBild(otherUid,'profilepic')
        ? `<img src="/appbild/${otherUid}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" alt="">`
        : otherUser.instagram
        ? `<img src="https://unavatar.io/instagram/${otherUser.instagram}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.remove()" alt="">`
        : ''}
      ${isUidOnline(otherUid)?'<i style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2.5px solid var(--bg);z-index:2"></i>':''}
    </div>
    <div style="display:flex;flex-direction:column;min-width:0;flex:1">
      <span class="chat-header-name" style="font-size:18px;font-weight:800;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.3px;line-height:1.15">${htmlEsc(otherName)}</span>
      <span class="chat-header-status" style="font-size:12px;font-weight:600;color:${isUidOnline(otherUid)?'#22c55e':'var(--muted)'};letter-spacing:0.1px;line-height:1.2;margin-top:2px">${isUidOnline(otherUid)?'● Online':'Offline'}</span>
    </div>
  </a>
  <button onclick="alert('Sprachanruf folgt bald 📞')" style="background:none;border:none;color:#0866FF;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" title="Anrufen">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.58l2.2-2.21c.28-.27.36-.66.25-1.01C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>
  </button>
  <button onclick="alert('Videoanruf folgt bald 🎥')" style="background:none;border:none;color:#0866FF;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" title="Video">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
  </button>
  <a href="/profil/${otherUid}" style="background:none;border:none;color:#0866FF;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;text-decoration:none" title="Info">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
  </a>
</div>
<div id="chat-msgs" style="padding:12px 0 140px;display:flex;flex-direction:column">
  ${msgsHtml || '<div class="empty" style="margin-top:60px"><div class="empty-icon">👋</div><div class="empty-text">Schreib eine Nachricht!</div></div>'}
</div>
<div id="img-preview-wrap" style="display:none;position:fixed;bottom:120px;left:16px;right:16px;z-index:101">
  <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:12px;padding:8px;display:flex;align-items:center;gap:8px">
    <img id="img-preview" style="height:60px;border-radius:8px;object-fit:cover" alt="">
    <div style="flex:1;font-size:12px;color:var(--muted)">Bild ausgewählt</div>
    <button onclick="clearImage()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>
  </div>
</div>
<div id="recording-bar" style="display:none;position:fixed;bottom:120px;left:16px;right:16px;z-index:101">
  <div style="background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.4);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:10px">
    <div style="width:10px;height:10px;border-radius:50%;background:#ff6b6b;animation:pulse-red 1s ease infinite;flex-shrink:0"></div>
    <div style="flex:1;font-size:13px;font-weight:600">Aufnahme läuft... <span id="rec-timer">0:00</span></div>
    <button onclick="cancelRecording()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>
    <button onclick="stopRecording()" style="background:#ff6b6b;border:none;color:#fff;border-radius:20px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer">Senden ✓</button>
  </div>
</div>
<style>@keyframes pulse-red{0%,100%{opacity:1}50%{opacity:.3}}</style>
<div style="position:fixed;bottom:60px;left:0;right:0;background:var(--bg);border-top:1px solid rgba(255,255,255,0.06);padding:8px 10px;display:flex;gap:6px;align-items:center;z-index:100">
  <label style="width:38px;height:38px;border-radius:50%;background:transparent;color:#0866FF;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" title="Kamera">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9.4 10.5l4.77-8.26C13.47 2.09 12.75 2 12 2 9.53 2 7.29 2.99 5.64 4.59l3.74 5.91zm9.83-1.5c-.86-2.3-2.55-4.18-4.74-5.27L11.32 9h7.91zm.34 2H12v9.96c4.42-.32 8-3.99 8-8.46 0-.52-.05-1.02-.13-1.5zM4.41 4.59C2.93 6.16 2 8.27 2 10.6c0 .8.13 1.59.4 2.34l4-7.04L4.41 4.59zM2.81 12.59C3.97 16.5 7.65 19.5 12 19.96V12.59H2.81z"/></svg>
    <input type="file" accept="image/*" capture="environment" style="display:none" onchange="selectImage(this)">
  </label>
  <label style="width:38px;height:38px;border-radius:50%;background:transparent;color:#0866FF;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" title="Galerie">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
    <input type="file" accept="image/*" style="display:none" onchange="selectImage(this)">
  </label>
  <button id="mic-btn" onclick="toggleRecording()" style="width:38px;height:38px;border-radius:50%;background:transparent;color:#0866FF;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" title="Aufnehmen">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
  </button>
  <div style="flex:1;background:#3a3b3c;border-radius:22px;display:flex;align-items:center;padding:4px 4px 4px 14px;gap:6px;min-width:0">
    <input type="text" id="msg-input" placeholder="Nachricht senden..." style="flex:1;background:transparent;border:none;outline:none;color:#e4e6eb;font-size:15px;padding:8px 0;margin:0;min-width:0" onkeypress="if(event.key==='Enter')sendMsg()">
    <button onclick="document.getElementById('msg-input').focus()" style="background:none;border:none;color:#e4e6eb;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:20px" title="Emoji">😊</button>
  </div>
  <button id="send-btn" onclick="sendMsg()" style="width:38px;height:38px;border-radius:50%;background:transparent;color:#0866FF;border:none;font-size:22px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center" title="Senden">❤️</button>
</div>
<script>
// Send-Button: Plane-Icon wenn Text ODER Foto/Audio bereit, sonst ❤️ (Quick-Like)
(function(){
  const inp = document.getElementById('msg-input');
  const btn = document.getElementById('send-btn');
  if (!inp || !btn) return;
  function hasContent(){ return (inp.value.trim().length > 0) || (typeof selectedImage !== 'undefined' && selectedImage); }
  function toggleSend(){
    btn.innerHTML = hasContent() ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' : '❤️';
  }
  inp.addEventListener('input', toggleSend);
  window._chatToggleSend = toggleSend;
  toggleSend();
  // Heart-Tap nur wenn WIRKLICH leer (kein Text, kein Bild) — sonst normaler sendMsg
  btn.addEventListener('click', function(e){
    if (!hasContent()) {
      e.preventDefault(); e.stopPropagation();
      const tmpVal = inp.value;
      inp.value = '❤️';
      if (typeof sendMsg === 'function') sendMsg();
      inp.value = tmpVal;
    }
  }, true);
})();
</script>
<script>
// Initial-Scroll: zum Ungelesen-Banner wenn vorhanden, sonst nach unten
function _chatInitialScroll(){
  const unread = document.getElementById('unread-divider');
  if (unread) {
    unread.scrollIntoView({ behavior: 'instant', block: 'center' });
  } else {
    window.scrollTo({ top: document.body.scrollHeight });
  }
}
function _chatScrollBottom(smooth){ const opts = smooth ? {top:document.body.scrollHeight,behavior:'smooth'} : {top:document.body.scrollHeight}; window.scrollTo(opts); }
_chatInitialScroll();
window.addEventListener('load', () => _chatInitialScroll());
// Bilder-Load: bei jedem geladenen Bild nochmal scrollen (zum Banner falls da, sonst Boden)
document.querySelectorAll('#chat-msgs img').forEach(img => {
  if (!img.complete) img.addEventListener('load', () => _chatInitialScroll(), { once: true });
});
// Sofort als gelesen markieren (chatKey wird vom SSR gesetzt)
fetch('/api/mark-messages-read', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chatKey: '${chatKey}'}) }).catch(()=>{});
// Page-Visibility: wenn der User zurückkommt, nochmal mark-as-read + scroll
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    fetch('/api/mark-messages-read', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chatKey: '${chatKey}'}) }).catch(()=>{});
    _chatScrollBottom(false);
  }
});
document.getElementById('msg-input').focus();

let selectedImage = null;
let mediaRecorder = null;
let audioChunks = [];
let recInterval = null;
let recSeconds = 0;

function selectImage(input) {
    const file = input.files[0];
    if (!file) return;
    // Hard-Cap: 25MB roh (Kamera-RAW > 25MB ist absurd, danach komprimieren wir eh)
    if (file.size > 25 * 1024 * 1024) { alert('Foto ist zu gross (max 25 MB)'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => {
        const dataUrl = e.target.result;
        // Komprimieren: max 1600px Kante, JPEG 0.85 — selbst 15MB-Fotos werden ~300KB
        const img = new Image();
        img.onload = () => {
            try {
                const MAX = 1600;
                let w = img.naturalWidth || img.width;
                let h = img.naturalHeight || img.height;
                if (w > MAX || h > MAX) {
                    if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                    else { w = Math.round(w * MAX / h); h = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                selectedImage = canvas.toDataURL('image/jpeg', 0.85);
            } catch(err) {
                // Fallback: rohe DataURL nehmen wenn Canvas fehlschlägt
                selectedImage = dataUrl;
            }
            const prev = document.getElementById('img-preview');
            const wrap = document.getElementById('img-preview-wrap');
            if (prev) prev.src = selectedImage;
            if (wrap) wrap.style.display = 'block';
            if (typeof window._chatToggleSend === 'function') window._chatToggleSend();
        };
        img.onerror = () => alert('Bild konnte nicht geladen werden');
        img.src = dataUrl;
    };
    reader.onerror = () => alert('Foto konnte nicht gelesen werden');
    reader.readAsDataURL(file);
    input.value = '';
}

function clearImage() {
    selectedImage = null;
    if (typeof window._chatToggleSend === 'function') window._chatToggleSend();
    document.getElementById('img-preview-wrap').style.display = 'none';
}

async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.start();
        document.getElementById('recording-bar').style.display = 'block';
        document.getElementById('mic-btn').style.background = '#ff6b6b';
        recSeconds = 0;
        recInterval = setInterval(() => {
            recSeconds++;
            const m = Math.floor(recSeconds/60);
            const s = recSeconds%60;
            document.getElementById('rec-timer').textContent = m+':'+(s<10?'0':'')+s;
            if (recSeconds >= 60) stopRecording();
        }, 1000);
    } catch(e) { alert('Mikrofon nicht verfügbar'); }
}

function stopRecording() {
    if (!mediaRecorder) return;
    mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, {type:'audio/webm'});
        const reader = new FileReader();
        reader.onload = async e => {
            await sendMessage(null, e.target.result);
        };
        reader.readAsDataURL(blob);
        mediaRecorder.stream.getTracks().forEach(t=>t.stop());
    };
    mediaRecorder.stop();
    clearInterval(recInterval);
    document.getElementById('recording-bar').style.display = 'none';
    document.getElementById('mic-btn').style.background = 'var(--bg4)';
}

function cancelRecording() {
    if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach(t=>t.stop());
        mediaRecorder = null;
    }
    clearInterval(recInterval);
    document.getElementById('recording-bar').style.display = 'none';
    document.getElementById('mic-btn').style.background = 'var(--bg4)';
}

async function sendMsg(){const input=document.getElementById('msg-input');const text=input.value.trim();if(!text&&!selectedImage)return;input.value='';input.focus();const img=selectedImage;clearImage();sendMessage(img||null,null,text);}

async function sendMessage(image, audio, text=''){const tmpTs=Date.now();insertOptimisticBubble(tmpTs,text,image,audio);requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}));try{const res=await fetch('/api/send-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'${otherUid}',text,image:image||null,audio:audio||null})});const data=await res.json();if(!data.ok){markBubbleFailed(tmpTs,text,image,audio);return;}markBubbleSent(tmpTs);}catch(e){markBubbleFailed(tmpTs,text,image,audio);}}function insertOptimisticBubble(ts,text,image,audio){const c=document.getElementById('chat-msgs');if(!c)return;const empty=c.querySelector('.chat-empty');if(empty)empty.remove();const div=document.createElement('div');div.className='chat-row chat-row-me chat-row-last';div.dataset.optimistic=ts;const escT=(text||'').replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));let inner='';
// Wenn aktive Reply: zeige Quote sofort im optimistischen Bubble
let rq='';
try{if(window.__replyState){const rn=(window.__replyState.name||'?').replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));const rt=(window.__replyState.text||'').slice(0,80).replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));rq='<div class="chat-reply-quote"><div class="chat-reply-name">'+rn+'</div><div class="chat-reply-text">'+rt+'</div></div>';}}catch(e){}
if(image)inner=rq+'<div class="chat-img-wrap"><img src="'+image+'"></div>'+(text?'<div class="chat-img-caption">'+escT+'</div>':'');else if(audio)inner=rq+'<div class="chat-audio"><div class="chat-audio-info"><div class="audio-dur">🎤 Sprachnachricht</div></div></div>';else inner=rq+'<div class="chat-text">'+escT+'</div>';div.innerHTML='<div class="chat-bubble-wrap"><div class="chat-bubble" style="opacity:.7">'+inner+'</div><div class="chat-status pending">Wird gesendet...</div></div>';c.appendChild(div);}function markBubbleSent(ts){const el=document.querySelector('[data-optimistic="'+ts+'"]');if(!el)return;const bubble=el.querySelector('.chat-bubble');if(bubble)bubble.style.opacity='1';const status=el.querySelector('.chat-status');if(status){status.textContent='Gesendet · '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});status.classList.remove('pending');}}function markBubbleFailed(ts,text,image,audio){const el=document.querySelector('[data-optimistic="'+ts+'"]');if(!el)return;const status=el.querySelector('.chat-status');if(status){status.textContent='❌ Fehler · Tippe um erneut zu senden';status.style.color='#ef4444';status.style.cursor='pointer';status.onclick=()=>{el.remove();sendMessage(image,audio,text);};}}

// Audio Player
function toggleAudio(btn) {
    const src = btn.getAttribute('data-src');
    let audio = btn._audio;
    if (!audio) {
        audio = new Audio(src);
        btn._audio = audio;
        const prog = btn.parentElement.querySelector('.audio-prog');
        const dur = btn.parentElement.querySelector('.audio-dur');
        audio.ontimeupdate = () => {
            if (audio.duration) prog.style.width = (audio.currentTime/audio.duration*100)+'%';
        };
        audio.onloadedmetadata = () => {
            const s = Math.round(audio.duration);
            dur.textContent = Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60;
        };
        audio.onended = () => { btn.textContent='▶'; prog.style.width='0%'; };
    }
    if (audio.paused) { audio.play(); btn.textContent='⏸'; }
    else { audio.pause(); btn.textContent='▶'; }
}

let chatKnownCount=${msgs.length};
setInterval(async()=>{
    if(document.querySelector('[data-optimistic]'))return;
    if(document.hidden)return;
    try{const r=await fetch('/api/messages/${otherUid}');const data=await r.json();if(data.count>chatKnownCount){chatKnownCount=data.count;location.reload();}}catch(e){}
},3000);
</script>`, 'messages');
    }


    // ── NEUER THREAD (ADMIN) ──
    if (path === '/nachrichten/gruppe/neu') {
        return html(`
<div class="topbar" style="background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten/gruppe" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg></a>
  <div style="flex:1;text-align:center;font-weight:800;font-size:15px;color:#fff">Neuen Thread erstellen</div>
  <div style="width:36px"></div>
</div>
<div style="padding:24px 16px 100px">
  <div style="background:var(--bg2);border-radius:16px;padding:20px">
    <div style="margin-bottom:16px">
      <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px">EMOJI</label>
      <input id="neu-emoji" maxlength="2" value="💬" style="width:60px;font-size:24px;text-align:center;background:var(--bg4);border:1px solid var(--border);border-radius:10px;padding:8px;color:var(--text);outline:none">
    </div>
    <div style="margin-bottom:24px">
      <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px">THREAD NAME</label>
      <input id="neu-name" placeholder="z.B. Ankündigungen" maxlength="128" style="width:100%;box-sizing:border-box;background:var(--bg4);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text);font-size:14px;outline:none">
    </div>
    <button onclick="createThread()" style="width:100%;padding:14px;background:linear-gradient(135deg,#0088cc,#006699);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">Thread erstellen ✈️</button>
    <div id="neu-status" style="margin-top:12px;text-align:center;font-size:13px;color:var(--muted)"></div>
  </div>
</div>
<script>
async function createThread(){
  const name=document.getElementById('neu-name').value.trim();
  const emoji=document.getElementById('neu-emoji').value.trim()||'💬';
  if(!name)return;
  document.getElementById('neu-status').textContent='Erstelle...';
  const r=await fetch('/api/create-thread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,emoji})});
  const d=await r.json();
  if(d.ok){setTimeout(()=>location.href='/nachrichten/gruppe',800);}
  else document.getElementById('neu-status').textContent='❌ '+(d.error||'Fehler');
}
</script>`, 'messages');
    }

    // ── THREAD DETAIL ──
    if (path.startsWith('/nachrichten/gruppe/') && path.length > '/nachrichten/gruppe/'.length) {
        const threadId = decodeURIComponent(path.slice('/nachrichten/gruppe/'.length).split('?')[0]);
        const botData = await fetchBot('/data');
        if (!botData) return redirect('/nachrichten/gruppe');
        // Letzten Lesestand SICHERN bevor wir mark-read aufrufen — für Ungelesen-Banner
        const myLastReadTs = (botData.threadLastRead?.[myUid]?.[threadId]) || 0;
        // Mark as read
        await postBot('/mark-read', { uid: myUid, thread_id: threadId });
        const threadEmojiPaletteD = ['🎯','🚀','💡','📊','🎨','🔥','⚡','🌟','📝','🎭','🏆','🎵','🧠','💎','🌈','🎮','📣','🛠️','🌍','🎬','📚','🍕','☕','🌙','🎁','🌊','⚽','🚴','🍀','✨','📷','🦄','🪐','🍎','🛸','🎪','🪄','🎲','🛹','🧭'];
        function _isValidEmojiD(e){ return e && e.length >= 1 && e.length <= 4 && !/^\d+$/.test(e); }
        // Greedy unique emoji assignment über alle Threads, damit Header-Emoji mit Listen-Emoji übereinstimmt
        const _allThreads = botData.threads || [];
        const _thrUsedD = new Set();
        const _thrEmojiMapD = new Map();
        _allThreads.forEach(t => {
            const id = String(t.id);
            if (id === 'general') { _thrEmojiMapD.set(id, '💬'); _thrUsedD.add('💬'); return; }
            if (_isValidEmojiD(t.emoji)) { _thrEmojiMapD.set(id, t.emoji); _thrUsedD.add(t.emoji); }
        });
        _allThreads.forEach(t => {
            const id = String(t.id);
            if (_thrEmojiMapD.has(id)) return;
            let h = 0;
            for (let i = 0; i < id.length; i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
            let emoji = null;
            for (let i = 0; i < threadEmojiPaletteD.length; i++) {
                const cand = threadEmojiPaletteD[(h + i) % threadEmojiPaletteD.length];
                if (!_thrUsedD.has(cand)) { emoji = cand; break; }
            }
            if (!emoji) emoji = threadEmojiPaletteD[h % threadEmojiPaletteD.length];
            _thrEmojiMapD.set(id, emoji);
            _thrUsedD.add(emoji);
        });
        const thrInfoRaw = _allThreads.find(t=>String(t.id)===threadId);
        const thrInfo = {
            name: thrInfoRaw?.name || (threadId==='general' ? 'Allgemein' : 'Thread '+threadId),
            emoji: _thrEmojiMapD.get(threadId) || (threadId==='general' ? '💬' : threadEmojiPaletteD[0])
        };
        // Get messages: general uses communityFeed as fallback
        let msgs = (botData.threadMessages||{})[threadId] || [];
        if (!msgs.length && threadId==='general' && botData.communityFeed?.length) {
            msgs = botData.communityFeed.map(m=>({ uid:'', tgName:m.username||null, name:m.name||m.username||'User', role:null, type:'text', text:m.text||'', mediaId:null, timestamp:m.timestamp, msg_id:m.msg_id }));
        }
        const msgsJson = JSON.stringify(msgs).replace(/<\/script>/gi, '<\\/script>');
        const _adminIdsList = Array.isArray(botData._adminIds) ? botData._adminIds.map(Number) : [];
        const isAdmin = _adminIdsList.includes(Number(myUid)) || ((botData.users?.[myUid]) && String(botData.users[myUid].role||'').includes('Admin'));
        const ringMap = {};
        Object.entries(botData.users||{}).forEach(([uid, u]) => { const s=getRingBoxShadow(u); if(s) ringMap[uid]=s; });
        const ringMapJson = JSON.stringify(ringMap);
        // Server-seitiges HTML-Rendering der Nachrichten (zuverlässig, kein JS nötig)
        const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const COLORS_SSR = ['#ff6b6b','#cc5de8','#4dabf7','#ffd43b','#00c851','#ff9f43','#0088cc'];
        const colSSR = n => COLORS_SSR[((n||'').charCodeAt(0)||0)%COLORS_SSR.length];
        let unreadInsertedSSR = false;
        const initialMsgsHtml = msgs.length
            ? [...msgs].reverse().map((m, mi, arr) => {
                const c = colSSR(m.name);
                const ini = ((m.name||'?').replace(/^@/,'')||'?')[0].toUpperCase();
                const ring = m.uid && ringMap[m.uid] ? ringMap[m.uid] : '';
                const ts = new Date(m.timestamp);
                const timeStr = String(ts.getHours()).padStart(2,'0')+':'+String(ts.getMinutes()).padStart(2,'0');
                const isMeS = m.uid && String(m.uid) === String(myUid);
                // Avatar nur bei letzter Nachricht der Sender-Serie (Telegram-Style)
                const next = arr[mi + 1];
                const isLastInSeries = !next || String(next.uid) !== String(m.uid) || ((next.timestamp||0) - (m.timestamp||0)) > 5*60*1000;
                const showAvatar = isLastInSeries;
                // Reply-Quote
                const replyBlock = m.replyTo ? `<div class="thr-reply-quote" style="border-left:3px solid ${isMeS?'rgba(255,255,255,0.7)':c};padding:5px 9px;margin:0 0 5px 0;border-radius:0 6px 6px 0;font-size:12.5px;line-height:1.4"><div style="font-weight:800;font-size:11.5px;${isMeS?'color:rgba(255,255,255,0.95)':'color:'+c}">${esc(m.replyTo.name||'?')}</div><div style="opacity:0.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((m.replyTo.text||'').slice(0,80))}</div></div>` : '';
                // Bubble theme-aware: own = lila Gradient (rechts), other = neutral
                const nameInBubble = isMeS ? '' : (m.uid
                    ? `<a href="/profil/${esc(m.uid)}" style="font-size:15.5px;font-weight:800;color:${c};text-decoration:none;display:block;margin-bottom:3px">${m.role?esc(m.role)+' ':''}${esc(m.name)}</a>`
                    : `<div style="font-size:15.5px;font-weight:800;color:${c};margin-bottom:3px">${m.role?esc(m.role)+' ':''}${esc(m.name)}</div>`);
                const textBody = m.text ? `<div class="thr-text" style="font-size:19px;line-height:1.45;word-break:break-word">${esc(m.text)}</div>` : '';
                const timeFooter = `<div class="thr-time" style="font-size:11px;text-align:right;margin-top:3px;font-variant-numeric:tabular-nums;opacity:0.65">${timeStr}</div>`;
                const canDelSSR = (m.uid && String(m.uid) === String(myUid)) || isAdmin;
                const swipeAttrs = ` data-del-ts="${m.timestamp}" data-del-mid="${m.msg_id||0}"${canDelSSR ? ' data-can-del="1"' : ''}`;
                const bubble = `<div class="thr-bubble${isMeS?' thr-bubble-me':''}">${nameInBubble}${replyBlock}${textBody}${timeFooter}</div>`;
                const avatarSlot = showAvatar
                    ? `<a href="/profil/${esc(m.uid)}" style="text-decoration:none;flex-shrink:0"><div style="width:30px;height:30px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;position:relative;overflow:hidden${ring}">${ini}${m.uid?`<img src="/appbild/${esc(m.uid)}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" loading="lazy">`:''}</div></a>`
                    : `<div style="width:30px;flex-shrink:0"></div>`;
                let bannerPrefix = '', firstUnreadId = '';
                if (!unreadInsertedSSR && myLastReadTs > 0 && (m.timestamp||0) > myLastReadTs && !isMeS) {
                    bannerPrefix = `<div id="unread-divider" class="thread-unread-divider" onclick="document.getElementById('first-unread')?.scrollIntoView({behavior:'smooth',block:'center'})"><span>Ungelesene Nachrichten</span><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg></div>`;
                    firstUnreadId = ' id="first-unread"';
                    unreadInsertedSSR = true;
                }
                const trashEl = '<div class="thr-swipe-trash" aria-hidden="true">↩️</div>';
                return bannerPrefix + `<div class="thr-row${isMeS?' thr-row-me':''}"${swipeAttrs}${firstUnreadId}>${avatarSlot}<div class="thr-row-inner">${bubble}</div>${trashEl}</div>`;
              }).join('')
            : '<div style="text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:12px">💬</div><div style="font-size:14px">Noch keine Nachrichten.<br>Schreib die erste!</div></div>';
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten/gruppe" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg></a>
  <div style="flex:1;text-align:center">
    <div style="font-weight:800;font-size:18px;color:#fff;letter-spacing:-0.2px">${thrInfo.emoji} ${thrInfo.name}</div>
    <div style="font-size:12.5px;color:rgba(255,255,255,0.75);font-weight:600;margin-top:1px">${msgs.length} Nachrichten</div>
  </div>
  <div style="width:36px"></div>
</div>
<style>
.thread-unread-divider{display:flex;align-items:center;justify-content:center;gap:6px;margin:14px 0 6px;padding:8px 12px;background:rgba(8,102,255,0.12);border:1px solid rgba(8,102,255,0.25);border-radius:12px;color:#4dabf7;font-size:12.5px;font-weight:700;letter-spacing:0.2px;cursor:pointer;transition:background 0.15s,transform 0.15s}
.thread-unread-divider:active{background:rgba(8,102,255,0.18);transform:scale(0.98)}
.thr-row{position:relative;overflow:visible;touch-action:pan-y;display:flex;gap:8px;align-items:flex-end;animation:thr-row-in 0.2s ease}
@keyframes thr-row-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.thr-row .thr-row-inner{flex:1;min-width:0;display:flex;justify-content:flex-start;transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1)}
.thr-row.swiping .thr-row-inner{transition:none}
.thr-row-me{flex-direction:row-reverse}
.thr-row-me .thr-row-inner{justify-content:flex-end}
.thr-bubble{position:relative;display:inline-block;max-width:78%;padding:9px 13px 7px 13px;border-radius:16px;background:#e5e5ea;color:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,0.06)}
[data-theme=dark] .thr-bubble{background:#2c2c2e;color:#f5f5f7;box-shadow:0 1px 2px rgba(0,0,0,0.3)}
.thr-bubble-me{background:linear-gradient(135deg,#a78bfa,#7c3aed)!important;color:#fff!important;box-shadow:0 4px 14px rgba(124,58,237,0.20)!important}
.thr-row-me .thr-bubble{border-radius:16px 16px 4px 16px}
.thr-row:not(.thr-row-me) .thr-bubble{border-radius:16px 16px 16px 4px}
.thr-bubble-me .thr-time{color:rgba(255,255,255,0.85)}
.thr-bubble-me .thr-reply-quote{background:rgba(255,255,255,0.18)}
.thr-bubble:not(.thr-bubble-me) .thr-reply-quote{background:rgba(15,23,42,0.06)}
.thr-swipe-trash{position:absolute;right:14px;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;background:var(--surface-tint);border:1px solid var(--border2);color:var(--text);font-size:20px;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.15s,transform 0.15s;z-index:1}
.thr-row-me .thr-swipe-trash{right:auto;left:14px}
.thr-row.selected .thr-bubble{box-shadow:0 0 0 2px rgba(167,139,250,0.5),0 8px 32px rgba(15,23,42,0.18);transform:scale(1.02)}
.thr-del-btn{display:none}
/* Telegram-Style Action-Menu für Threads — Unified Picker */
.thr-react-picker{position:fixed;z-index:9999;background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:8px;box-shadow:0 16px 40px rgba(15,23,42,0.20);display:none;flex-direction:column;gap:4px;min-width:220px;max-width:280px}
.thr-react-picker.show{display:flex;animation:thr-pop 0.25s cubic-bezier(0.34,1.56,0.64,1)}
.thr-react-picker .crp-emojis{display:flex;gap:2px;padding:2px 4px 6px;border-bottom:1px solid var(--border2);justify-content:space-between}
.thr-react-picker .crp-emojis button{background:none;border:none;font-size:26px;padding:4px;cursor:pointer;transition:transform 0.18s cubic-bezier(0.34,1.56,0.64,1);border-radius:50%;flex:1}
.thr-react-picker .crp-emojis button:active{transform:scale(1.4)}
.thr-react-picker .crp-actions{display:flex;flex-direction:column;padding-top:4px;gap:1px}
.thr-react-picker .crp-action{display:flex;align-items:center;gap:12px;padding:11px 14px;background:none;border:none;color:var(--text);font-size:15px;font-weight:600;cursor:pointer;border-radius:10px;transition:background 0.12s;text-align:left;width:100%}
.thr-react-picker .crp-action:active{background:var(--surface-tint)}
.thr-react-picker .crp-action.danger{color:#ef4444}
.thr-react-picker .crp-action .crp-icon{font-size:18px;width:24px;text-align:center}
@keyframes thr-pop{from{transform:scale(0.85) translateY(8px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
.thr-select-bd{position:fixed;inset:0;background:rgba(0,0,0,0.42);backdrop-filter:blur(2px);z-index:9998;display:none}
.thr-select-bd.show{display:block;animation:thr-fade .18s ease}
@keyframes thr-fade{from{opacity:0}to{opacity:1}}
</style>
<div id="thr-react-picker" class="thr-react-picker">
  <div class="crp-emojis">
    <button type="button" onclick="thrReactWith('❤️')">❤️</button>
    <button type="button" onclick="thrReactWith('😂')">😂</button>
    <button type="button" onclick="thrReactWith('😮')">😮</button>
    <button type="button" onclick="thrReactWith('😢')">😢</button>
    <button type="button" onclick="thrReactWith('👏')">👏</button>
    <button type="button" onclick="thrReactWith('🔥')">🔥</button>
  </div>
  <div class="crp-actions">
    <button type="button" class="crp-action" onclick="thrDoReply()"><span class="crp-icon">↩️</span><span>Antworten</span></button>
    <button type="button" class="crp-action" onclick="thrDoCopy()"><span class="crp-icon">📋</span><span>Kopieren</span></button>
    <button type="button" class="crp-action danger" id="thr-del-btn" onclick="thrDoDelete()" style="display:none"><span class="crp-icon">🗑️</span><span>Löschen</span></button>
  </div>
</div>
<div id="msgs" style="padding:12px 12px 165px;display:flex;flex-direction:column;gap:10px;overflow-x:hidden;min-width:0;width:100%">${initialMsgsHtml}</div>
<script>
(function(){
  const TID='${threadId}';
  function scrollInit(){
    const ud=document.getElementById('unread-divider');
    if(ud) ud.scrollIntoView({behavior:'instant',block:'center'});
    else window.scrollTo(0,document.body.scrollHeight);
  }
  scrollInit();
  window.addEventListener('load', scrollInit);
  const LONG_PRESS_MS=480, LP_ABORT_PX=8, SWIPE_START_PX=4, SWIPE_VERT_ABORT_PX=14, SWIPE_COMMIT_PX=40, SWIPE_CAP_PX=90;
  // Swipe-Trash-Element wird zur Reply-Pfeil
  document.querySelectorAll('.thr-swipe-trash').forEach(el => { el.textContent = '↩️'; });
  let _activeRow = null, _lastShow = 0;
  function thrShowMenu(row){
    if (!row) return;
    _activeRow = row;
    _lastShow = Date.now();
    const canDel = row.dataset.canDel === '1';
    document.getElementById('thr-del-btn').style.display = canDel ? 'flex' : 'none';
    // Backdrop — onclick delayed
    let bd = document.getElementById('thr-select-bd');
    if (!bd) { bd = document.createElement('div'); bd.id = 'thr-select-bd'; bd.className = 'thr-select-bd'; document.body.appendChild(bd); }
    bd.onclick = null;
    bd.classList.add('show');
    setTimeout(() => { if (bd) bd.onclick = thrHideMenu; }, 320);
    // Picker oben oder unten neben bubble
    const picker = document.getElementById('thr-react-picker');
    const bubble = row.querySelector('.thr-bubble');
    document.querySelectorAll('.thr-row.selected').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    picker.classList.add('show');
    if (bubble) {
      const r = bubble.getBoundingClientRect();
      const ph = picker.offsetHeight || 200;
      const pw = picker.offsetWidth || 240;
      const left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
      picker.style.left = left + 'px';
      const above = r.top - ph - 12;
      const below = r.bottom + 12;
      picker.style.top = (above >= 12 ? above : Math.min(below, window.innerHeight - ph - 12)) + 'px';
    }
    if (navigator.vibrate) navigator.vibrate(15);
  }
  function thrHideMenu(){
    document.getElementById('thr-react-picker')?.classList.remove('show');
    document.getElementById('thr-select-bd')?.classList.remove('show');
    document.querySelectorAll('.thr-row.selected').forEach(r => r.classList.remove('selected'));
    _activeRow = null;
  }
  window.thrDoReply = function(){
    if (!_activeRow) return;
    const ts = Number(_activeRow.dataset.delTs);
    thrHideMenu();
    if (typeof window.setReply === 'function') window.setReply(ts);
  };
  window.thrDoCopy = async function(){
    if (!_activeRow) return;
    const txt = _activeRow.querySelector('.thr-bubble div[style*="line-height:1.42"]')?.textContent?.trim()
      || _activeRow.querySelector('.thr-bubble')?.textContent?.trim() || '';
    thrHideMenu();
    if (!txt) return;
    try { await navigator.clipboard.writeText(txt);
      const t=document.getElementById('toast'); if(t){t.textContent='📋 Kopiert';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1400);}
    } catch(e){ alert('Kopieren fehlgeschlagen'); }
  };
  window.thrDoDelete = async function(){
    if (!_activeRow) return;
    if (!confirm('Nachricht wirklich löschen?')) return;
    const ts = _activeRow.dataset.delTs, mid = _activeRow.dataset.delMid || 0;
    const target = _activeRow;
    thrHideMenu();
    try {
      const r = await fetch('/api/delete-thread-msg', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({threadId: TID, timestamp: Number(ts), msgId: Number(mid)||null}) });
      const d = await r.json();
      if (d.ok) { target.style.transition='all 0.2s'; target.style.opacity='0'; target.style.transform='translateX(-100%)'; setTimeout(()=>target.remove(),200); }
      else alert('Fehler: '+(d.error||'unbekannt'));
    } catch(e2) { alert('Netzwerkfehler: '+e2.message); }
  };
  window.thrReactWith = function(emoji){
    if (!_activeRow) return;
    const ts = Number(_activeRow.dataset.delTs);
    thrHideMenu();
    if (!ts) return;
    fetch('/api/react-thread-msg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:TID,timestamp:ts,emoji})}).catch(()=>{});
  };
  document.addEventListener('click', e => {
    if (Date.now() - _lastShow < 350) return;
    const picker = document.getElementById('thr-react-picker');
    if (picker?.classList.contains('show') && !picker.contains(e.target) && !e.target.closest('.thr-bubble')) thrHideMenu();
  });
  // Pointer-State für Long-Press UND Swipe-Reply
  let row=null, x0=0, y0=0, pid=null, lpTimer=null, swiping=false, committed=false;
  function reset(commit){
    if (!row) return;
    const inner = row.querySelector('.thr-row-inner'), tr = row.querySelector('.thr-swipe-trash');
    if (inner) { inner.style.transition='transform 0.22s'; inner.style.transform = ''; }
    if (tr) tr.style.opacity = '0';
    row.classList.remove('swiping');
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    row = null; pid = null; swiping = false; committed = false;
  }
  document.addEventListener('pointerdown', e => {
    if (e.pointerType==='mouse' && e.button!==0) return;
    const r = e.target.closest && e.target.closest('.thr-row');
    if (!r) return;
    row = r; x0 = e.clientX; y0 = e.clientY; pid = e.pointerId; swiping = false; committed = false;
    const inner = r.querySelector('.thr-row-inner');
    if (inner) inner.style.transition = 'none';
    lpTimer = setTimeout(() => {
      if (!row || swiping) return;
      committed = true;
      thrShowMenu(row);
      reset(false);
    }, LONG_PRESS_MS);
  }, { passive: true, capture: true });
  document.addEventListener('pointermove', e => {
    if (!row || e.pointerId !== pid) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!swiping && (Math.abs(dx) > LP_ABORT_PX || Math.abs(dy) > LP_ABORT_PX) && lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    if (!swiping && Math.abs(dy) > SWIPE_VERT_ABORT_PX && Math.abs(dy) > Math.abs(dx)) { reset(false); return; }
    if (dx < -SWIPE_START_PX && Math.abs(dx) > Math.abs(dy)) {
      swiping = true;
      row.classList.add('swiping');
      const cap = Math.max(-SWIPE_CAP_PX, dx);
      const inner = row.querySelector('.thr-row-inner');
      if (inner) inner.style.transform = 'translateX(' + cap + 'px)';
      const tr = row.querySelector('.thr-swipe-trash');
      if (tr) tr.style.opacity = String(Math.min(1, Math.abs(cap)/55));
    }
  }, { passive: true, capture: true });
  document.addEventListener('pointerup', e => {
    if (!row || committed) return;
    if (!swiping) { reset(false); return; }
    const dx = e.clientX - x0;
    const ts = Number(row.dataset.delTs);
    if (dx <= -SWIPE_COMMIT_PX) {
      reset(false);
      if (navigator.vibrate) navigator.vibrate(15);
      if (typeof window.setReply === 'function' && ts) window.setReply(ts);
    } else reset(false);
  }, { passive: true, capture: true });
  document.addEventListener('pointercancel', () => reset(false), { passive: true });
})();
</script>
<div id="reply-bar" style="display:none;position:fixed;bottom:calc(108px + var(--safe-bottom));left:8px;right:8px;padding:10px 12px 10px 14px;background:var(--bg);border:1px solid var(--border);border-left:3px solid #a78bfa;border-radius:14px;align-items:center;gap:10px;z-index:6;box-sizing:border-box;box-shadow:0 -4px 18px rgba(15,23,42,.10)">
  <div style="font-size:18px;flex-shrink:0">↩️</div>
  <div style="flex:1;min-width:0"><span id="reply-name" style="font-size:12px;font-weight:800;color:#a78bfa;display:block;letter-spacing:0.1px">Antwort an</span><span id="reply-text" style="font-size:13px;color:var(--text);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:calc(100vw - 90px);font-weight:500;margin-top:1px"></span></div>
  <button onclick="cancelReply()" style="background:var(--surface-tint);border:1px solid var(--border2);color:var(--text);font-size:14px;cursor:pointer;flex-shrink:0;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center">✕</button>
</div>
<div id="react-picker" style="display:none;position:fixed;bottom:calc(112px + var(--safe-bottom));left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:10px 14px;z-index:10;box-shadow:0 4px 24px rgba(0,0,0,.5)">
  <div style="display:flex;gap:6px;align-items:center">
    ${['👍','❤️','😂','😮','🔥','💎'].map(e=>`<button onclick="pickReact('${e}')" style="background:none;border:none;font-size:24px;cursor:pointer;padding:4px;border-radius:10px;transition:transform .15s" onmouseenter="this.style.transform='scale(1.3)'" onmouseleave="this.style.transform=''">${e}</button>`).join('')}
    <button onclick="closeReactPicker()" style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:4px 8px;margin-left:4px">✕</button>
  </div>
</div>
<div style="position:fixed;bottom:calc(60px + var(--safe-bottom));left:0;right:0;padding:8px 12px;background:var(--bg2);border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;z-index:5;box-sizing:border-box;max-width:100vw">
  <textarea id="inp" placeholder="Schreibe etwas..." rows="1" style="flex:1;background:var(--bg4);border:1px solid #0088cc44;border-radius:20px;padding:10px 16px;color:var(--text);font-size:14px;resize:none;outline:none;line-height:1.4;max-height:120px" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}"></textarea>
  <button onclick="send()" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0088cc,#006699);border:none;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">✈️</button>
</div>
<script>
(function(){
  const TID='${threadId}';
  const MY_UID='${myUid}';
  const MY_LAST_READ=${myLastReadTs};
  const IS_ADMIN=${isAdmin};
  const RING_MAP=${ringMapJson};
  const COLORS=['#ff6b6b','#cc5de8','#4dabf7','#ffd43b','#00c851','#ff9f43','#0088cc'];
  function col(n){return COLORS[((n||'').charCodeAt(0)||0)%COLORS.length];}
  function ini(n){return((n||'?').replace(/^@/,'')||'?')[0].toUpperCase();}
  function t(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  let knownHash='';
  let replyState=null;
  window._lastMsgs=[];
  function msgHash(msgs){return msgs.reduce((a,m)=>a+'|'+m.timestamp+(m.reactions?JSON.stringify(m.reactions):''),'')}
  function render(msgs){
    const el=document.getElementById('msgs');
    if(!el)return;
    const h=msgHash(msgs);
    if(h===knownHash)return;
    const atBottom=window.innerHeight+window.scrollY>=document.body.scrollHeight-80;
    knownHash=h;
    window._lastMsgs=msgs;
    if(!msgs.length){el.innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:12px">💬</div><div style="font-size:14px">Noch keine Nachrichten.<br>Schreib die erste!</div></div>';return;}
    let unreadInsertedJS=false;
    el.innerHTML=[...msgs].reverse().map((m, mi, arr)=>{
      const c=col(m.name);
      const ts=t(m.timestamp);
      const isMe = m.uid && String(m.uid) === String(MY_UID);
      const next = arr[mi + 1];
      const isLastInSeries = !next || String(next.uid) !== String(m.uid) || ((next.timestamp||0) - (m.timestamp||0)) > 5*60*1000;
      const showAvatar = isLastInSeries;
      const nameInBubble = isMe ? '' : (m.uid
        ? '<a href="/profil/'+m.uid+'" style="font-size:15.5px;font-weight:800;color:'+c+';text-decoration:none;display:block;margin-bottom:3px">'+(m.role?esc(m.role)+' ':'')+esc(m.name)+'</a>'
        : '<div style="font-size:15.5px;font-weight:800;color:'+c+';margin-bottom:3px">'+(m.role?esc(m.role)+' ':'')+esc(m.name)+'</div>');
      const replyBlock = m.replyTo ? '<div class="thr-reply-quote" style="border-left:3px solid '+(isMe?'rgba(255,255,255,0.7)':c)+';padding:5px 9px;margin:0 0 5px 0;border-radius:0 6px 6px 0;font-size:12.5px;line-height:1.4"><div style="font-weight:800;font-size:11.5px;'+(isMe?'color:rgba(255,255,255,0.95)':'color:'+c)+'">'+esc(m.replyTo.name||'?')+'</div><div style="opacity:0.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc((m.replyTo.text||'').slice(0,80))+'</div></div>' : '';
      let media='';
      if(m.type==='photo'&&m.mediaId)media='<img src="/api/tg-file/'+m.mediaId+'" style="max-width:100%;border-radius:10px;margin:0 0 5px;display:block" loading="lazy">';
      else if(m.type==='sticker'&&m.mediaId)media='<img src="/api/tg-file/'+m.mediaId+'" style="width:80px;height:80px;object-fit:contain;display:block;margin:0 0 5px" loading="lazy">';
      else if(m.type==='video')media='<div style="background:rgba(0,0,0,.3);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--muted);margin:0 0 5px">🎬 Video — öffne Telegram zum Ansehen</div>';
      const textBody = m.text ? '<div class="thr-text" style="font-size:19px;line-height:1.45;word-break:break-word">'+esc(m.text)+'</div>' : '';
      const timeFooter = '<div class="thr-time" style="font-size:11px;text-align:right;margin-top:3px;font-variant-numeric:tabular-nums;opacity:0.65">'+ts+'</div>';
      const canDel=(m.uid&&String(m.uid)===String(MY_UID))||IS_ADMIN;
      const swipeAttrsJS = ' data-del-ts="'+m.timestamp+'" data-del-mid="'+(m.msg_id||0)+'"'+(canDel ? ' data-can-del="1"' : '');
      const reactBadges=m.reactions&&Object.keys(m.reactions).length?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">'+Object.entries(m.reactions).map(([em,uids])=>'<button onclick="react('+m.timestamp+',\''+em+'\')" style="background:'+(uids.includes(MY_UID)?'rgba(167,139,250,.25)':'var(--surface-tint)')+';border:1px solid var(--border2);border-radius:20px;padding:2px 7px;font-size:11px;cursor:pointer;color:var(--text)">'+em+' '+uids.length+'</button>').join('')+'</div>':'';
      const ring=m.uid&&RING_MAP[m.uid]?RING_MAP[m.uid]:'';
      const bubble = '<div class="thr-bubble'+(isMe?' thr-bubble-me':'')+'">'+nameInBubble+replyBlock+media+textBody+timeFooter+'</div>';
      const avatarSlot = showAvatar
        ? '<a href="/profil/'+m.uid+'" style="text-decoration:none;flex-shrink:0"><div style="width:30px;height:30px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;position:relative;overflow:hidden'+ring+'">'+ini(m.name)+(m.uid?'<img src="/appbild/'+m.uid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" loading="lazy">':'')+'</div></a>'
        : '<div style="width:30px;flex-shrink:0"></div>';
      let banner='', firstUnreadId='';
      if (!unreadInsertedJS && MY_LAST_READ > 0 && (m.timestamp||0) > MY_LAST_READ && !isMe) {
        banner = '<div id="unread-divider" class="thread-unread-divider" onclick="document.getElementById(\'first-unread\')?.scrollIntoView({behavior:\'smooth\',block:\'center\'})"><span>Ungelesene Nachrichten</span><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg></div>';
        firstUnreadId=' id="first-unread"';
        unreadInsertedJS=true;
      }
      const trashElJS = '<div class="thr-swipe-trash" aria-hidden="true">↩️</div>';
      return banner+'<div class="thr-row'+(isMe?' thr-row-me':'')+'"'+swipeAttrsJS+firstUnreadId+'>'+avatarSlot+'<div class="thr-row-inner">'+bubble+reactBadges+'</div>'+trashElJS+'</div>';
    }).join('');
    if(atBottom){
      const ud=document.getElementById('unread-divider');
      if(ud&&!window._thrUnreadScrolled){ ud.scrollIntoView({behavior:'instant',block:'center'}); window._thrUnreadScrolled=true; }
      else window.scrollTo(0,document.body.scrollHeight);
    }
  }
  // ── Event-Delegation für Mülleimer-Button (robuster als inline onclick) ──
  document.addEventListener('click', function(ev){
    const btn = ev.target.closest && ev.target.closest('[data-trash-ts]');
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    const ts = Number(btn.dataset.trashTs); const mid = Number(btn.dataset.trashMid)||0;
    if (typeof window.deleteMsg === 'function') window.deleteMsg(ts, mid);
  }, true);
  document.addEventListener('touchend', function(ev){
    const btn = ev.target.closest && ev.target.closest('[data-trash-ts]');
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    const ts = Number(btn.dataset.trashTs); const mid = Number(btn.dataset.trashMid)||0;
    if (typeof window.deleteMsg === 'function') window.deleteMsg(ts, mid);
  }, { capture: true, passive: false });

  // ── Swipe-to-Delete (für Admins, iOS-Style) ──
  if (IS_ADMIN) {
    let swRow = null, swStartX = 0, swStartY = 0, swActive = false, swMid = 0, swTs = 0;
    document.addEventListener('touchstart', function(e){
      const row = e.target.closest && e.target.closest('#msgs > div');
      if (!row) return;
      const btn = row.querySelector('[data-trash-ts]'); if (!btn) return;
      swRow = row; swActive = false;
      swStartX = e.touches[0].clientX; swStartY = e.touches[0].clientY;
      swTs = Number(btn.dataset.trashTs); swMid = Number(btn.dataset.trashMid)||0;
      row.style.transition = 'none';
    }, { passive: true });
    document.addEventListener('touchmove', function(e){
      if (!swRow) return;
      const dx = e.touches[0].clientX - swStartX;
      const dy = Math.abs(e.touches[0].clientY - swStartY);
      if (dy > 18) { swRow.style.transform = ''; swRow.style.background = ''; swRow = null; return; }
      const cap = Math.max(-150, Math.min(0, dx));
      if (cap < -8) {
        swActive = true;
        swRow.style.transform = 'translateX(' + cap + 'px)';
        const intensity = Math.min(1, Math.abs(cap)/120);
        swRow.style.background = 'linear-gradient(90deg, transparent ' + (100 - intensity*40) + '%, rgba(239,68,68,' + (intensity*0.6) + '))';
      }
    }, { passive: true });
    document.addEventListener('touchend', function(){
      if (!swRow) return;
      const t = swRow.style.transform || '';
      const m = t.match(/translateX\((-?\d+)px\)/);
      const dx = m ? Number(m[1]) : 0;
      swRow.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s';
      if (swActive && dx <= -100 && swTs) {
        swRow.style.transform = 'translateX(-100%)';
        swRow.style.background = 'rgba(239,68,68,0.4)';
        if (navigator.vibrate) navigator.vibrate(20);
        setTimeout(() => { if (typeof window.deleteMsg === 'function') window.deleteMsg(swTs, swMid); }, 100);
      } else {
        swRow.style.transform = ''; swRow.style.background = '';
      }
      swRow = null; swActive = false;
    });
  }

  // Initial render already done server-side; set knownHash to avoid blank re-render
  render(${msgsJson});
  // Scroll to bottom on load
  window.scrollTo(0,document.body.scrollHeight);
  async function load(){
    try{
      const r=await fetch('/api/thread-messages/'+encodeURIComponent(TID));
      if(r.ok){const d=await r.json();if(d.messages?.length)render(d.messages);}
    }catch(e){}
  }
  load();
  window.send=async function(){
    const el=document.getElementById('inp');const text=el.value.trim();if(!text)return;
    el.value='';el.style.height='auto';
    const body={text,thread_id:TID};
    if(replyState)body.replyTo=replyState;
    const r=await fetch('/api/send-thread-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!d.ok){el.value=text;toast('❌ '+(d.error||'Fehler'));}
    else{cancelReply();setTimeout(load,1200);}
  };
  window.deleteMsg=function(ts,msgId){
    let modal=document.getElementById('del-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='del-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding-bottom:calc(20px + var(--safe-bottom,0px))';
      document.body.appendChild(modal);
    }
    modal.innerHTML='<div style="background:var(--bg3);border-radius:20px 20px 16px 16px;padding:20px 20px 12px;width:100%;max-width:420px;text-align:center"><div style="font-size:15px;font-weight:700;margin-bottom:6px">Nachricht löschen?</div><div style="font-size:13px;color:var(--muted);margin-bottom:18px">Diese Aktion kann nicht rückgängig gemacht werden.</div><div style="display:flex;gap:10px"><button onclick="document.getElementById(\'del-modal\').style.display=\'none\'" style="flex:1;padding:12px;border-radius:12px;border:1px solid var(--border2);background:var(--bg4);color:var(--text);font-size:14px;font-weight:600;cursor:pointer">Abbrechen</button><button id="del-confirm-btn" style="flex:1;padding:12px;border-radius:12px;border:none;background:#ef4444;color:#fff;font-size:14px;font-weight:700;cursor:pointer">🗑️ Löschen</button></div></div>';
    modal.style.display='flex';
    document.getElementById('del-confirm-btn').onclick=async function(){
      modal.style.display='none';
      const r=await fetch('/api/delete-thread-msg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:TID,timestamp:ts,msgId:msgId||null})});
      const d=await r.json();
      if(d.ok){knownHash='';await load();toast('✅ Gelöscht');}else toast('❌ '+(d.error||'Fehler'));
    };
  };
  window.setReply=function(ts){
    const m=(window._lastMsgs||[]).find(m=>m.timestamp===ts);
    if(!m)return;
    replyState={ts:m.timestamp,msgId:m.msg_id||0,name:m.name||'?',text:m.text||''};
    const bar=document.getElementById('reply-bar');
    bar.style.display='flex';
    document.getElementById('reply-name').textContent='Antwort an '+(m.name||'?');
    document.getElementById('reply-text').textContent=(m.text||'').slice(0,80);
    document.getElementById('inp').focus();
  };
  window.cancelReply=function(){
    replyState=null;
    document.getElementById('reply-bar').style.display='none';
  };
  window.react=async function(ts,emoji){
    knownHash='';
    await fetch('/api/react-thread-msg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:TID,timestamp:ts,emoji})});
    await load();
  };
  window.openReact=function(ts){
    const p=document.getElementById('react-picker');
    p.dataset.ts=ts;p.style.display='flex';
  };
  window.pickReact=async function(emoji){
    const ts=Number(document.getElementById('react-picker').dataset.ts);
    closeReactPicker();
    await react(ts,emoji);
  };
  window.closeReactPicker=function(){document.getElementById('react-picker').style.display='none';};
  document.addEventListener('click',e=>{const p=document.getElementById('react-picker');if(p&&p.style.display!=='none'&&!p.contains(e.target))p.style.display='none';});
  setInterval(load,10000);
})();
</script>`, 'messages');
    }

    // ── TELEGRAM GRUPPE THREAD-LISTE ──
    if (path === '/nachrichten/gruppe') {
        const [botData, ftData] = await Promise.all([fetchBot('/data'), fetchBot('/forum-topics').catch(()=>null)]);
        if (!botData) return html('<div style="padding:40px;text-align:center;color:var(--muted)">Bot nicht erreichbar</div>', 'messages');
        const adminUser = botData.users?.[myUid];
        const _adm2 = Array.isArray(botData._adminIds) ? botData._adminIds.map(Number) : [];
        const isAdmin = _adm2.includes(Number(myUid)) || (adminUser && String(adminUser.role||'').includes('Admin'));
        const lastRead = botData.threadLastRead?.[myUid] || {};
        const threadMsgs = botData.threadMessages || {};
        const communityFeed = botData.communityFeed || [];
        let apiTopics = {};
        try { if (ftData?.threads) ftData.threads.forEach(t => { apiTopics[String(t.id)] = t; }); } catch(e) {}
        // Build thread list
        let threads = botData.threads || [];
        const threadEmojiPalette = ['🎯','🚀','💡','📊','🎨','🔥','⚡','🌟','📝','🎭','🏆','🎵','🧠','💎','🌈','🎮','📣','🛠️','🌍','🎬'];
        function threadEmoji(tid) { let h=0;for(const c of String(tid))h=(h*31+c.charCodeAt(0))>>>0;return threadEmojiPalette[h%threadEmojiPalette.length]; }
        if (!threads.length) {
            threads = Object.keys(threadMsgs).map(tid => ({ id:tid, name:tid==='general'?'Allgemein':'Thread '+tid, emoji:tid==='general'?'💬':threadEmoji(tid), last_msg:threadMsgs[tid]?.[0]||null, msg_count:threadMsgs[tid]?.length||0 }));
        }
        // Merge real names from Telegram API
        threads = threads.map(t => {
            const api = apiTopics[String(t.id)];
            const emoji = String(t.id)==='general' ? '💬' : (api?.emoji && api.emoji.length>1 ? api.emoji : threadEmoji(t.id));
            if (api?.name) return {...t, name: api.name, emoji};
            return {...t, emoji};
        });
        if (!threads.find(t=>String(t.id)==='general')) {
            const lastCF = communityFeed[0];
            threads.unshift({ id:'general', name:'Allgemein', emoji:'💬', last_msg:lastCF?{text:lastCF.text,name:lastCF.name||lastCF.username}:null, msg_count:Math.max(communityFeed.length, threadMsgs['general']?.length||0) });
        }
        const cards = require('./thread-list-render')({ threads, threadMsgs, lastRead, communityFeed, isAdmin });
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg></a>
  <div style="flex:1;text-align:center">
    <div style="font-weight:800;font-size:15px;color:#fff">✈️ Telegram Gruppe</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7)">Live ●</div>
  </div>
  ${isAdmin?'<a href="/nachrichten/gruppe/neu" style="padding:8px 12px;color:#fff;text-decoration:none;font-size:22px;font-weight:300">+</a>':'<div style="width:44px"></div>'}
</div>
${cards}
<script>
setInterval(async()=>{try{const r=await fetch(location.href,{headers:{'X-Poll':'1'}});if(r.ok&&r.redirected)location.reload();}catch(e){}},15000);
async function renameThread(tid,current){
  const name=prompt('Neuer Thread-Name:',current);
  if(!name||!name.trim())return;
  const r=await fetch('/api/rename-thread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({thread_id:tid,name:name.trim()})});
  const data=await r.json();
  if(data.ok)location.reload();
  else alert(data.error||'Fehler beim Umbenennen');
}
</script>`, 'messages');
    }



    // ── USER-SUCHE + Vorschläge ──
    if (path === '/suche') {
        const botData = await fetchBot('/data');
        if (!botData) return redirect('/feed');
        const _adminIds2 = Array.isArray(botData._adminIds) ? botData._adminIds.map(Number) : [];
        const myFollowingSet2 = new Set((botData.users[myUid]?.following||[]).map(String));
        const allUsersForSearch = Object.entries(botData.users||{})
            .filter(([uid,u]) => {
                if (String(uid) === String(myUid)) return false;
                if (_adminIds2.includes(Number(uid))) return false;
                if (!u || !u.started || u.inGruppe === false) return false;
                if (u.parent_uid) return false; // Subs nicht in Suche
                return true;
            });
        // Vorschläge wie auf Explore: Mutuals first, dann XP
        const suggestions2 = [];
        for (const [uid, u] of allUsersForSearch) {
            if (myFollowingSet2.has(String(uid))) continue;
            const theirFollowers = (u.followers||[]).map(String);
            const mutuals = theirFollowers.filter(f => myFollowingSet2.has(f));
            const score = mutuals.length * 1000 + (u.xp || 0);
            suggestions2.push({ uid, u, mutuals, score });
        }
        suggestions2.sort((a,b) => b.score - a.score);
        const topSug2 = suggestions2.slice(0, 18);
        const sugCards2 = topSug2.map(({uid, u, mutuals}) => {
            const grad = badgeGradient(u.role);
            const insta = u.instagram;
            const pic = ladeBild(uid, 'profilepic');
            const name = u.spitzname || u.name || 'User';
            const handle = u.username ? '@'+u.username : (insta ? '@'+insta : '');
            const subline = mutuals.length > 0
                ? (mutuals.length + (mutuals.length===1?' gemeinsamer Follower':' gemeinsame Follower'))
                : (handle || (u.role||'🆕 New'));
            return `<div class="sug-row" data-uid="${uid}" data-search="${htmlEsc((name+' '+(u.username||'')+' '+(u.instagram||'')+' '+(u.role||'')).toLowerCase())}">
  <a href="/profil/${uid}" style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;text-decoration:none;color:inherit;padding:10px 16px">
    <div class="sug-row-avatar" style="background:${grad}${getRingBoxShadow(u)}">
      <span style="position:absolute">${htmlEsc((name[0]||'?').toUpperCase())}</span>
      ${pic?`<img src="/appbild/${uid}/profilepic" loading="lazy">`:insta?`<img src="https://unavatar.io/instagram/${insta}" loading="lazy" onerror="this.remove()">`:''}
    </div>
    <div style="flex:1;min-width:0">
      <div class="sug-row-name">${htmlEsc(name)}</div>
      <div class="sug-row-sub">${htmlEsc(subline)}</div>
    </div>
  </a>
  <form method="POST" action="/follow-form" style="margin:0;padding:0 12px 0 0;display:flex;align-items:center;gap:8px">
    <input type="hidden" name="uid" value="${uid}">
    <input type="hidden" name="back" value="/suche">
    <button type="submit" class="sug-row-btn js-sug-follow" data-follow-uid="${uid}">Folgen</button>
    <button type="button" class="sug-row-x" data-uid="${uid}" title="Ausblenden" onclick="event.preventDefault();event.stopPropagation();var btn=this;var r=btn.closest('.sug-row');if(r){r.style.transition='opacity 0.2s,height 0.2s,padding 0.2s';r.style.opacity='0';setTimeout(function(){r.remove();},200);}return false">×</button>
  </form>
</div>`;
        }).join('');
        return html(`
<div class="topbar"><a href="/nachrichten" class="icon-btn" style="font-size:22px;text-decoration:none">‹</a><div style="font-size:15px;font-weight:700;flex:1;text-align:center">User suchen</div><div style="width:38px"></div></div>
<div style="padding:14px 16px 8px">
  <div style="position:relative">
    <svg style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="text" id="user-search-input" placeholder="Name, Instagram oder Rolle..." autocomplete="off" autocapitalize="none" spellcheck="false" style="width:100%;background:var(--bg2);border:1px solid var(--border2);border-radius:14px;padding:12px 14px 12px 42px;color:var(--text);font-size:14px;outline:none;font-family:var(--font);box-sizing:border-box;transition:border-color 0.2s">
    <button id="user-search-clear" onclick="document.getElementById('user-search-input').value='';filterSearch();" style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);background:var(--bg4);border:none;width:26px;height:26px;border-radius:50%;color:var(--muted);font-size:14px;cursor:pointer">×</button>
  </div>
</div>
<div id="search-empty" style="display:none;padding:60px 24px;text-align:center;color:var(--muted)">
  <div style="font-size:48px;margin-bottom:12px;opacity:0.5">🔍</div>
  <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Keine Treffer</div>
  <div style="font-size:12px">Versuch's mit einem anderen Suchbegriff</div>
</div>
<div style="margin:14px 0 22px">
  <div style="padding:0 16px 8px"><h3 style="font-size:17px;font-weight:800;margin:0;color:var(--text);letter-spacing:-0.3px">Weitere Vorschläge</h3></div>
  <div id="sug-search-list">${sugCards2}</div>
</div>
<script>
function filterSearch(){
  const q=(document.getElementById('user-search-input')?.value||'').toLowerCase().trim();
  const clearBtn=document.getElementById('user-search-clear');
  if(clearBtn) clearBtn.style.display=q?'flex':'none';
  let visible=0;
  document.querySelectorAll('#sug-search-list .sug-row').forEach(c=>{
    const txt=(c.dataset.search||'')+' '+(c.querySelector('.sug-row-name')?.textContent||'').toLowerCase();
    const hit=!q||txt.toLowerCase().includes(q);
    c.style.display=hit?'':'none';
    if(hit) visible++;
  });
  const list=document.getElementById('sug-search-list');
  const empty=document.getElementById('search-empty');
  if(list) list.style.display=visible?'':'none';
  if(empty) empty.style.display=visible?'none':'block';
}
document.getElementById('user-search-input')?.addEventListener('input',filterSearch);
</script>
`, 'messages');
    }

    if (path === '/nachrichten') {
        const botData = await fetchBot('/data');
        if (!botData) return redirect('/feed');
        const convos = botData.messages || {};
        const myConvos = Object.entries(convos)
            .filter(([key]) => { const [a,b] = key.split('_'); return a === myUid || b === myUid; })
            .map(([key, msgs]) => {
                const msgsArr = Array.isArray(msgs) ? msgs : [];
                const [a,b] = key.split('_');
                const otherUid = a === myUid ? b : a;
                const otherUser = botData.users?.[otherUid] || {};
                const lastMsg = msgsArr[msgsArr.length - 1];
                return { key, otherUid, otherName: otherUser.spitzname||otherUser.name||'User', lastMsg, unread: msgsArr.filter(m=>m.to===myUid&&!m.read).length };
            })
            .sort((a, b) => (b.lastMsg?.timestamp||0)-(a.lastMsg?.timestamp||0));
        const feedPreview = (await (async()=>{try{const r=await fetchBot('/telegram-feed');return r?.messages?.[0]?.text?.slice(0,40)||'Live Telegram Nachrichten';}catch(e){return 'Live Telegram Nachrichten';}})());
        // Count unread thread messages
        const thrMsgsAll = botData.threadMessages || {};
        const lastReadAll = botData.threadLastRead?.[myUid] || {};
        const cfeed = botData.communityFeed || [];
        let totalThreadUnread = 0;
        const genLastRead = lastReadAll['general'] || 0;
        const genMsgs = thrMsgsAll['general']?.length ? thrMsgsAll['general'] : cfeed;
        totalThreadUnread += genMsgs.filter(m => (m.timestamp||0) > genLastRead).length;
        Object.keys(thrMsgsAll).forEach(tid => {
            if (tid !== 'general') totalThreadUnread += (thrMsgsAll[tid]||[]).filter(m=>(m.timestamp||0)>(lastReadAll[tid]||0)).length;
        });
        // Threads-Daten für den 2. Tab
        const threadEmojiPalette = ['🎯','🚀','💡','📊','🎨','🔥','⚡','🌟','📝','🎭','🏆','🎵','🧠','💎','🌈','🎮','📣','🛠️','🌍','🎬'];
        function threadEmoji(tid){let h=0;for(const c of String(tid))h=(h*31+c.charCodeAt(0))>>>0;return threadEmojiPalette[h%threadEmojiPalette.length];}
        let threads = botData.threads || [];
        if (!threads.length) {
            threads = Object.keys(thrMsgsAll).map(tid => ({ id:tid, name:tid==='general'?'Allgemein':'Thread '+tid, emoji:tid==='general'?'💬':threadEmoji(tid), last_msg:thrMsgsAll[tid]?.[0]||null, msg_count:thrMsgsAll[tid]?.length||0 }));
        }
        if (!threads.find(t=>String(t.id)==='general')) {
            const lastCF = cfeed[0];
            threads.unshift({ id:'general', name:'Allgemein', emoji:'💬', last_msg:lastCF?{text:lastCF.text,name:lastCF.name||lastCF.username,timestamp:lastCF.timestamp}:null, msg_count:Math.max(cfeed.length, thrMsgsAll['general']?.length||0) });
        }
        const convHtml = require('./chat-list-render')({ myConvos, botData, myUid, feedPreview, totalThreadUnread, ladeBild, adminIds, onlineUids: getOnlineUids(), threadsList: threads, threadLastRead: lastReadAll });
        return html(`<div class="topbar"><div class="topbar-logo">Nachrichten</div><div class="topbar-actions"><a href="/suche" class="icon-btn" title="User suchen" style="text-decoration:none"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></a></div></div><div style="padding-bottom:80px">${convHtml}</div>`, 'messages');
    }

    // ── BENACHRICHTIGUNGEN ──
    if (path === '/benachrichtigungen') {
        return html(`
<div class="topbar"><div class="topbar-logo">Aktivität</div></div>
<style>
.notif-filters{display:flex;gap:6px;padding:10px 16px 12px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;border-bottom:1px solid var(--border2)}
.notif-filters::-webkit-scrollbar{display:none}
.notif-filter{flex-shrink:0;padding:7px 14px;border-radius:999px;font-size:12.5px;font-weight:700;color:var(--muted);background:var(--surface-tint);border:1px solid var(--border2);cursor:pointer;transition:background 0.15s,color 0.15s,transform 0.12s;-webkit-tap-highlight-color:transparent;letter-spacing:0.1px}
.notif-filter:active{transform:scale(0.94)}
.notif-filter.active{background:var(--text);color:var(--bg);border-color:var(--text)}
.notif-section{padding:14px 16px 6px;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted)}
.notif-row{display:flex;gap:12px;align-items:center;padding:13px 16px;text-decoration:none;color:inherit;transition:background 0.15s;border-bottom:1px solid var(--border2);position:relative;animation:notif-in 0.25s cubic-bezier(0.16,1,0.3,1) backwards}
.notif-row:nth-child(1){animation-delay:0.02s}
.notif-row:nth-child(2){animation-delay:0.05s}
.notif-row:nth-child(3){animation-delay:0.08s}
.notif-row:nth-child(4){animation-delay:0.11s}
.notif-row:nth-child(n+5){animation-delay:0.14s}
@keyframes notif-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.notif-row:hover{background:var(--surface-tint)}
.notif-row.unread{background:linear-gradient(90deg,rgba(255,107,107,0.05),transparent 70%)}
.notif-row.unread::before{content:"";position:absolute;left:7px;top:50%;transform:translateY(-50%);width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px rgba(255,107,107,0.5)}
.notif-icon{flex-shrink:0;width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--bg2);border:1px solid var(--border2);font-weight:700}
.notif-actor{position:relative;flex-shrink:0;width:48px;height:48px}
.notif-actor-avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;overflow:hidden;position:relative;box-shadow:0 4px 12px rgba(15,23,42,0.1)}
.notif-stack-avatar{position:absolute;top:8px;border:2px solid var(--bg);border-radius:50%;background:var(--bg);width:32px;height:32px}
.notif-stack-avatar .notif-actor-avatar{box-shadow:none;border-radius:50%}
.notif-actor-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}
.notif-actor-avatar span{position:absolute}
.notif-actor-badge{position:absolute;bottom:-3px;right:-3px;width:22px;height:22px;border-radius:50%;background:var(--bg);border:2px solid var(--bg);box-shadow:0 2px 8px rgba(15,23,42,0.15);display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1}
.notif-actor-badge.like{background:linear-gradient(135deg,#ff8e8e,#ff6b6b);color:#fff}
.notif-actor-badge.follow{background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff}
.notif-actor-badge.message{background:linear-gradient(135deg,#34d399,#22c55e);color:#fff}
.notif-actor-badge.diamond{background:linear-gradient(135deg,#fbbf24,#a78bfa);color:#fff}
.notif-actor-badge.warn{background:linear-gradient(135deg,#fbbf24,#ef4444);color:#fff}
.notif-actor-badge.news{background:linear-gradient(135deg,#60a5fa,#1d6fa5);color:#fff}
.notif-icon.like{background:linear-gradient(135deg,rgba(255,107,107,0.15),rgba(255,107,107,0.06));border-color:rgba(255,107,107,0.3);box-shadow:0 4px 12px rgba(255,107,107,0.1)}
.notif-icon.follow{background:linear-gradient(135deg,rgba(167,139,250,0.15),rgba(167,139,250,0.06));border-color:rgba(167,139,250,0.3);box-shadow:0 4px 12px rgba(167,139,250,0.1)}
.notif-icon.news{background:linear-gradient(135deg,rgba(77,171,247,0.15),rgba(77,171,247,0.06));border-color:rgba(77,171,247,0.3);box-shadow:0 4px 12px rgba(77,171,247,0.1)}
.notif-icon.diamond{background:linear-gradient(135deg,rgba(245,158,11,0.18),rgba(167,139,250,0.18));border-color:rgba(245,158,11,0.35);box-shadow:0 4px 14px rgba(245,158,11,0.15)}
.notif-icon.warn{background:linear-gradient(135deg,rgba(245,158,11,0.18),rgba(239,68,68,0.10));border-color:rgba(245,158,11,0.4);box-shadow:0 4px 12px rgba(245,158,11,0.12)}
.notif-icon.message{background:linear-gradient(135deg,rgba(34,197,94,0.15),rgba(34,197,94,0.06));border-color:rgba(34,197,94,0.3);box-shadow:0 4px 12px rgba(34,197,94,0.1)}
.notif-text{flex:1;min-width:0;font-size:13.5px;line-height:1.42;color:var(--text);font-weight:500}
.notif-text b{font-weight:800}
.notif-time{font-size:11.5px;color:var(--muted);margin-top:3px;font-weight:600;letter-spacing:0.1px}
.notif-arrow{font-size:18px;color:var(--muted2);flex-shrink:0;opacity:0.4;transition:opacity 0.15s}
.notif-row:hover .notif-arrow{opacity:1}
.notif-empty{padding:90px 24px;text-align:center;color:var(--muted)}
.notif-empty-icon{font-size:56px;margin-bottom:16px;opacity:0.5;animation:bell-wiggle 2.5s ease-in-out infinite}
@keyframes bell-wiggle{0%,80%,100%{transform:rotate(0)}85%,95%{transform:rotate(-8deg)}90%{transform:rotate(8deg)}}
.notif-empty-text{font-size:16px;font-weight:800;color:var(--text);margin-bottom:6px;letter-spacing:-0.2px}
.notif-empty-sub{font-size:13px;color:var(--muted);line-height:1.55;max-width:280px;margin:0 auto}
</style>
<div class="notif-filters">
  <button class="notif-filter active" data-f="all">Alle</button>
  <button class="notif-filter" data-f="like">❤️ Likes</button>
  <button class="notif-filter" data-f="follow">👤 Follower</button>
  <button class="notif-filter" data-f="news">📩 News</button>
  <button class="notif-filter" data-f="diamond">💎 Diamanten</button>
  <button class="notif-filter" data-f="message">💬 Nachrichten</button>
  <button class="notif-filter" data-f="warn">⚠️ System</button>
</div>
<div id="notif-list" style="padding:0 0 80px">
  <div class="notif-empty"><div class="notif-empty-icon">⏳</div><div class="notif-empty-text">Lädt...</div></div>
</div>
<script>
function relTime(ts){const m=Math.round((Date.now()-ts)/60000);if(m<1)return 'gerade eben';if(m<60)return 'vor '+m+' Min';const h=Math.round(m/60);if(h<24)return 'vor '+h+' Std';const d=Math.round(h/24);if(d<7)return 'vor '+d+'d';return new Date(ts).toLocaleDateString('de-DE',{day:'2-digit',month:'short'});}
function classify(n){const t=(n.text||'').toLowerCase();const i=n.icon||'';if(i==='❤️'||t.includes('liked')||t.includes('gelikt'))return 'like';if(i==='👤'||t.includes('folgt')||t.includes('follow'))return 'follow';if(i==='📩'||t.includes('newsletter')||t.includes('news'))return 'news';if(i==='💎'||t.includes('diamant'))return 'diamond';if(i==='⚠️'||t.includes('warn')||t.includes('verwarnung'))return 'warn';if(i==='💬'||t.includes('kommentiert')||t.includes('nachricht'))return 'message';return '';}
function targetUrl(n){const c=classify(n);if(c==='news')return '/explore?tab=newsletter';if(c==='diamond')return '/diamanten';if(c==='message')return '/nachrichten';if(c==='follow')return '/suche';return '/feed';}
// Gruppen-Key: classify + Aktions-Subtype — innerhalb 24h zusammenfassen
function groupSubtype(n){
  const t=(n.text||'').toLowerCase();
  if (t.includes('superlink')) return 'superlink';
  if (t.includes('link')) return 'link';
  if (t.includes('post')) return 'post';
  if (t.includes('foto')||t.includes('photo')) return 'foto';
  return 'misc';
}
function groupKey(n){
  const c=classify(n);
  if (c!=='like' && c!=='follow') return null; // nur Likes & Follower zusammenfassen
  return c+'|'+groupSubtype(n);
}
// Sauberer Text fuer eine Gruppe — KEIN Mixing mehr
function groupText(c, sub, actors){
  const others = actors.length - 1;
  const firstName = actors[0].actorName || 'Jemand';
  if (others === 0) {
    // Single → originalen Text nehmen, falls actorName am Anfang fett markieren
    let txt = escTxt(actors[0].text);
    if (actors[0].actorName) {
      const nameEsc = escTxt(actors[0].actorName);
      if (txt.startsWith(nameEsc)) txt = '<b>'+nameEsc+'</b>'+txt.slice(nameEsc.length);
    }
    return txt;
  }
  const head = '<b>'+escTxt(firstName)+'</b> + <b>'+others+' '+(others===1?'andere':'andere')+'</b>';
  if (c==='follow') return head+' folgen dir jetzt';
  // like
  if (sub==='superlink') return head+' haben deinen Superlink geliked';
  if (sub==='post') return head+' haben deinen Post geliked';
  if (sub==='foto') return head+' haben dein Foto geliked';
  return head+' haben deinen Link geliked';
}
let _allNotifs=[],_currentFilter='all';
function escTxt(s){return String(s||'').replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));}
function actorAvatar(n,size){
  size = size||48;
  const initial=((n.actorName||'?')[0]||'?').toUpperCase();
  const src=n.actorHasPic?'/appbild/'+n.actorUid+'/profilepic':(n.actorInsta?'https://unavatar.io/instagram/'+n.actorInsta:null);
  return '<div class="notif-actor-avatar" style="width:'+size+'px;height:'+size+'px;font-size:'+(size*0.38)+'px">'+(src?'<img src="'+src+'" loading="lazy" onerror="this.remove()">':'')+'<span>'+escTxt(initial)+'</span></div>';
}
function renderGroup(group){
  const n = group.representative;
  const c = classify(n);
  const sub = groupSubtype(n);
  const actors = group.actors;
  let avatarHtml;
  if (n.actorUid) {
    avatarHtml = '<div class="notif-actor">'+actorAvatar(n,48)+'<div class="notif-actor-badge '+c+'">'+(n.icon||'🔔')+'</div></div>';
  } else {
    avatarHtml = '<div class="notif-icon '+c+'">'+(n.icon||'🔔')+'</div>';
  }
  const txt = groupText(c, sub, actors);
  const tgt = n.actorUid && actors.length===1 ? '/profil/'+n.actorUid : targetUrl(n);
  const isUnread = !group.allRead;
  return '<a href="'+tgt+'" class="notif-row '+(isUnread?'unread':'')+'">'+avatarHtml+'<div style="flex:1;min-width:0"><div class="notif-text">'+txt+'</div><div class="notif-time">'+relTime(group.latestTs)+(actors.length>1?' · '+actors.length+'×':'')+'</div></div><div class="notif-arrow">›</div></a>';
}
function buildGroups(items){
  // Items kommen sortiert (neuste zuerst). Wir gehen durch und sammeln in 24h-Buckets pro groupKey.
  const groups=[]; const open={}; const NOW=Date.now();
  for (const n of items) {
    const k = groupKey(n);
    if (!k) { groups.push({representative:n, actors:[n], allRead:!!n.read, latestTs:n.timestamp||0}); continue; }
    const g = open[k];
    if (g && (g.latestTs - (n.timestamp||0)) < 86400000) {
      g.actors.push(n);
      if (n.read===false || !n.read) g.allRead = false;
    } else {
      const ng = {representative:n, actors:[n], allRead:!!n.read, latestTs:n.timestamp||0, _key:k};
      groups.push(ng); open[k]=ng;
    }
  }
  return groups;
}
function renderList(){
  const list=document.getElementById('notif-list');
  let items=_allNotifs;
  if(_currentFilter!=='all') items=items.filter(n=>classify(n)===_currentFilter);
  if(!items.length){
    const map={all:['🔔','Alles ruhig','Hier erscheinen Likes, Follower,<br>News und Diamant-Belohnungen'],like:['❤️','Keine Likes bisher','Wenn dich jemand liked,<br>steht es hier'],follow:['👤','Keine neuen Follower','Sobald dir jemand folgt,<br>wirst du hier benachrichtigt'],news:['📩','Keine News','Newsletter-Einträge erscheinen hier'],diamond:['💎','Keine Belohnungen','Verdiene Diamanten durch Engagement'],message:['💬','Keine Nachrichten','Kommentare und DMs erscheinen hier'],warn:['⚠️','Alles im grünen Bereich','Keine System-Hinweise']};
    const e=map[_currentFilter]||map.all;
    list.innerHTML='<div class="notif-empty"><div class="notif-empty-icon">'+e[0]+'</div><div class="notif-empty-text">'+e[1]+'</div><div class="notif-empty-sub">'+e[2]+'</div></div>';
    return;
  }
  const groups = buildGroups(items);
  const now=Date.now();const today=[],week=[],older=[];
  groups.forEach(g=>{const age=now-(g.latestTs||0);if(age<86400000)today.push(g);else if(age<604800000)week.push(g);else older.push(g);});
  let html='';
  if(today.length){html+='<div class="notif-section">Heute</div>'+today.map(renderGroup).join('');}
  if(week.length){html+='<div class="notif-section">Diese Woche</div>'+week.map(renderGroup).join('');}
  if(older.length){html+='<div class="notif-section">Älter</div>'+older.map(renderGroup).join('');}
  list.innerHTML=html;
}
document.querySelectorAll('.notif-filter').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.notif-filter').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    _currentFilter=btn.dataset.f;
    renderList();
  });
});
fetch('/api/notifications').then(r=>r.json()).then(data=>{
  _allNotifs=(data.notifications||[]).slice().sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
  renderList();
});
</script>`, 'notif');
    }

    // ── SUCHE ──
    if (path === '/suche') {
        // Vorschlaege: Top User die der User noch nicht followt
        const me = d.users[myUid] || {};
        const myFollowing = new Set((me.following||[]).map(String));
        const suggested = Object.entries(d.users||{})
            .filter(([id,u]) => !adminIds.includes(Number(id)) && id !== String(myUid) && u.started && u.inGruppe !== false && !myFollowing.has(String(id)))
            .sort((a,b)=>(b[1].xp||0)-(a[1].xp||0))
            .slice(0, 8);
        const sugCardsHtml = suggested.map(([id,u])=>{
            const grad = badgeGradient(u.role);
            const insta = u.instagram;
            const initial = (u.name||'?').slice(0,2).toUpperCase();
            const pic = ladeBild(id,'profilepic')
                ? `<img src="/appbild/${id}/profilepic" loading="lazy" alt="">`
                : insta ? `<img src="https://unavatar.io/instagram/${htmlEsc(insta)}" loading="lazy" onerror="this.remove()" alt="">` : '';
            return `<a href="/profil/${id}" class="suche-row" data-uid="${id}">
              <div class="suche-avatar" style="background:${grad}">${pic}<span>${initial}</span>${isUidOnline(id)?'<i class="suche-dot"></i>':''}</div>
              <div class="suche-info">
                <div class="suche-name">${htmlEsc(u.spitzname||u.name||'User')}</div>
                <div class="suche-meta">${htmlEsc(u.role||'')} · ${(u.xp||0).toLocaleString('de-DE')} XP${insta?' · @'+htmlEsc(insta):''}</div>
              </div>
              <button class="suche-follow js-suche-follow" data-follow-uid="${id}" onclick="event.preventDefault();event.stopPropagation();sucheFollow(this)">Folgen</button>
            </a>`;
        }).join('');
        return html(`
<style>
.suche-bar{position:sticky;top:0;z-index:90;padding:12px 16px;background:var(--glass-bg);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border-bottom:1px solid var(--border2)}
.suche-input-wrap{position:relative}
.suche-input{width:100%;background:var(--bg);border:1.5px solid var(--border2);border-radius:14px;padding:13px 44px 13px 44px;font-size:14.5px;color:var(--text);outline:none;font-family:var(--font);font-weight:500;transition:border-color .18s,box-shadow .18s}
.suche-input:focus{border-color:rgba(167,139,250,.55);box-shadow:0 0 0 4px rgba(167,139,250,.10)}
.suche-input-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
.suche-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:var(--surface-tint);border:1px solid var(--border2);width:26px;height:26px;border-radius:50%;display:none;align-items:center;justify-content:center;color:var(--muted);font-size:14px;cursor:pointer;line-height:1}
.suche-clear.show{display:flex}
.suche-tabs{display:flex;gap:6px;margin-top:10px;overflow-x:auto;scrollbar-width:none}
.suche-tabs::-webkit-scrollbar{display:none}
.suche-tab{flex-shrink:0;padding:7px 14px;border-radius:999px;font-size:12.5px;font-weight:700;color:var(--muted);background:var(--bg);border:1px solid var(--border2);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s,background .15s}
.suche-tab:active{transform:scale(.94)}
.suche-tab.active{background:var(--text);color:var(--bg);border-color:var(--text)}
.suche-section-h{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);padding:14px 16px 6px;display:flex;align-items:center;justify-content:space-between}
.suche-section-h .clear-recent{font-size:11px;font-weight:700;color:var(--accent);cursor:pointer;text-transform:none;letter-spacing:0}
.suche-recent{display:flex;gap:8px;padding:0 16px 4px;flex-wrap:wrap}
.suche-recent-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg);border:1px solid var(--border2);border-radius:999px;font-size:12.5px;font-weight:600;color:var(--text);cursor:pointer;transition:transform .12s}
.suche-recent-chip:active{transform:scale(.95)}
.suche-row{display:flex;align-items:center;gap:12px;padding:12px 16px;text-decoration:none;color:inherit;transition:background .15s;border-bottom:1px solid var(--border2);position:relative}
.suche-row:active{background:var(--surface-tint)}
.suche-avatar{position:relative;width:50px;height:50px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;box-shadow:0 4px 14px rgba(15,23,42,.10)}
.suche-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
.suche-avatar span{position:absolute;z-index:0}
.suche-dot{position:absolute;bottom:1px;right:1px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid var(--bg);z-index:2;box-shadow:0 0 6px rgba(34,197,94,.5)}
.suche-info{flex:1;min-width:0}
.suche-name{font-size:14.5px;font-weight:700;letter-spacing:-.1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.suche-meta{font-size:11.5px;color:var(--muted);margin-top:2px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.suche-follow{flex-shrink:0;padding:7px 16px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border:none;border-radius:999px;font-size:12.5px;font-weight:800;cursor:pointer;letter-spacing:.2px;box-shadow:0 4px 12px rgba(124,58,237,.25);transition:transform .12s}
.suche-follow:active{transform:scale(.94)}
.suche-follow.followed{background:var(--bg);color:var(--text);border:1px solid var(--border)}
.suche-empty{padding:60px 24px;text-align:center;color:var(--muted)}
.suche-empty-icon{font-size:54px;margin-bottom:12px;opacity:.5}
.suche-empty-text{font-size:15px;font-weight:800;color:var(--text);margin-bottom:4px;letter-spacing:-.2px}
.suche-empty-sub{font-size:12.5px;color:var(--muted);max-width:260px;margin:0 auto;line-height:1.5}
</style>
<div class="topbar"><div class="topbar-logo">Suche</div></div>
<div class="suche-bar">
  <div class="suche-input-wrap">
    <svg class="suche-input-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="text" id="search-input" class="suche-input" placeholder="User, @insta oder Link suchen…" autocomplete="off" enterkeyhint="search">
    <button class="suche-clear" id="search-clear" onclick="searchClear()">✕</button>
  </div>
  <div class="suche-tabs">
    <button class="suche-tab active" data-cat="all">Alle</button>
    <button class="suche-tab" data-cat="user">👥 User</button>
    <button class="suche-tab" data-cat="link">🔗 Links</button>
  </div>
</div>
<div id="search-results"></div>
<div id="search-default">
  <div id="recent-block" style="display:none">
    <div class="suche-section-h">Zuletzt gesucht <span class="clear-recent" onclick="recentClear()">Löschen</span></div>
    <div class="suche-recent" id="recent-chips"></div>
  </div>
  <div class="suche-section-h">✨ Vorgeschlagen für dich</div>
  ${sugCardsHtml || '<div class="suche-empty"><div class="suche-empty-icon">🌟</div><div class="suche-empty-text">Du folgst schon allen</div><div class="suche-empty-sub">Tippe oben um nach jemandem zu suchen</div></div>'}
</div>
<script>
let _searchCat='all', _searchTimer;
const RECENT_KEY='cb_search_recent';
function getRecent(){try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');}catch(e){return [];}}
function pushRecent(q){q=q.trim();if(!q||q.length<2)return;let r=getRecent().filter(x=>x.toLowerCase()!==q.toLowerCase());r.unshift(q);r=r.slice(0,6);try{localStorage.setItem(RECENT_KEY,JSON.stringify(r));}catch(e){}renderRecent();}
function recentClear(){try{localStorage.removeItem(RECENT_KEY);}catch(e){}renderRecent();}
function renderRecent(){const r=getRecent();const block=document.getElementById('recent-block');const chips=document.getElementById('recent-chips');if(!r.length){block.style.display='none';return;}block.style.display='block';chips.innerHTML=r.map(q=>'<span class="suche-recent-chip" onclick="document.getElementById(\\'search-input\\').value=\\''+q.replace(/'/g,'')+'\\';doSearch();">'+q.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</span>').join('');}
async function sucheFollow(btn){
  const uid=btn.dataset.followUid;
  if(btn._busy)return;btn._busy=true;
  const orig=btn.textContent;btn.textContent='…';btn.disabled=true;
  try{
    const r=await fetch('/api/follow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid})});
    const d=await r.json();
    if(d.ok){btn.textContent='✓ Folge';btn.classList.add('followed');}
    else{btn.textContent=orig;btn.disabled=false;alert(d.error||'Fehler');}
  }catch(e){btn.textContent=orig;btn.disabled=false;alert('Netzwerk: '+e.message);}
  finally{btn._busy=false;}
}
function searchClear(){const i=document.getElementById('search-input');i.value='';doSearch();i.focus();}
function escTxt(s){return String(s||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
async function doSearch(){
  const q=document.getElementById('search-input').value;
  const clearBtn=document.getElementById('search-clear');
  clearBtn.classList.toggle('show',!!q.trim());
  const def=document.getElementById('search-default');
  const results=document.getElementById('search-results');
  if(!q.trim()){results.innerHTML='';def.style.display='block';return;}
  def.style.display='none';
  results.innerHTML='<div class="suche-empty"><div class="suche-empty-icon">⏳</div><div class="suche-empty-text">Sucht…</div></div>';
  clearTimeout(_searchTimer);
  _searchTimer=setTimeout(async()=>{
    try{
      const res=await fetch('/api/search?q='+encodeURIComponent(q));
      const data=await res.json();
      let html='';
      const showUsers=_searchCat==='all'||_searchCat==='user';
      const showLinks=_searchCat==='all'||_searchCat==='link';
      if(showUsers && data.users.length){
        html+='<div class="suche-section-h">👥 User · '+data.users.length+'</div>';
        html+=data.users.map(u=>{
          const initial=(u.name||'?').slice(0,2).toUpperCase();
          const pic=u.pic?'<img src="'+u.pic+'" loading="lazy" alt="">':'';
          return '<a href="/profil/'+u.id+'" class="suche-row">'
            +'<div class="suche-avatar" style="background:linear-gradient(135deg,#a78bfa,#7c3aed)">'+pic+'<span>'+escTxt(initial)+'</span></div>'
            +'<div class="suche-info"><div class="suche-name">'+escTxt(u.spitzname||u.name||'?')+'</div><div class="suche-meta">'+escTxt(u.role||'')+' · '+(u.xp||0).toLocaleString('de-DE')+' XP'+(u.instagram?' · @'+escTxt(u.instagram):'')+'</div></div>'
            +'<button class="suche-follow js-suche-follow" data-follow-uid="'+u.id+'" onclick="event.preventDefault();event.stopPropagation();sucheFollow(this)">Folgen</button>'
            +'</a>';
        }).join('');
      }
      if(showLinks && data.links && data.links.length){
        html+='<div class="suche-section-h">🔗 Links · '+data.links.length+'</div>';
        html+=data.links.map(l=>{
          return '<a href="'+escTxt(l.text)+'" target="_blank" class="suche-row" style="border-bottom:1px solid var(--border2)">'
            +'<div class="suche-avatar" style="background:linear-gradient(135deg,#ff6b6b,#ffa500);font-size:18px"><span>🔗</span></div>'
            +'<div class="suche-info"><div class="suche-name" style="font-size:13px;color:#4dabf7">'+escTxt(l.text.replace('https://www.instagram.com/','ig.com/').slice(0,46))+'</div><div class="suche-meta">'+escTxt(l.user_name||'')+' · ❤️ '+(l.likes||0)+'</div></div>'
            +'</a>';
        }).join('');
      }
      if(!html) html='<div class="suche-empty"><div class="suche-empty-icon">🔍</div><div class="suche-empty-text">Nichts gefunden</div><div class="suche-empty-sub">Versuche es mit Name, @instagram oder Link-URL</div></div>';
      results.innerHTML=html;
      pushRecent(q);
    }catch(e){results.innerHTML='<div class="suche-empty"><div class="suche-empty-icon">⚠️</div><div class="suche-empty-text">Fehler beim Suchen</div></div>';}
  },280);
}
document.getElementById('search-input').addEventListener('input',doSearch);
document.querySelectorAll('.suche-tab').forEach(t=>t.addEventListener('click',e=>{document.querySelectorAll('.suche-tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');_searchCat=t.dataset.cat;doSearch();}));
renderRecent();
setTimeout(()=>document.getElementById('search-input').focus(),100);
</script>`, 'search');
    }

    // ── EXPLORE ──
    if (path === '/explore') {
        const tab = query.tab || 'allgemein';
        const sorted = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&u.inGruppe!==false)
            .sort((a,b)=>(b[1].xp||0)-(a[1].xp||0));
        const medals = ['🥇','🥈','🥉'];
        const myRank = adminIds.includes(Number(myUid)) ? 0 : sorted.findIndex(([id])=>id===myUid)+1;

        const webUserUids = new Set([...sessions.values()].map(s => String(s.uid)));

        // Top 8 creators for Allgemein tab
        const topCreators = sorted.slice(0,8).map(([id,u],i)=>{
            const grad = badgeGradient(u.role);
            const picFile = ladeBild(id,'profilepic');
            const bannerFile = ladeBild(id,'banner');
            const bannerIsGrad = !bannerFile && (!u.banner||!u.banner.startsWith('data:image')&&!u.banner.startsWith('http'));
            const bannerBg = bannerFile ? '' : (u.banner && !u.banner.startsWith('data:') ? '#000' : (u.banner || grad));
            const pinnedLink = ladePinnedLink(id);
            const insta = u.instagram;
            return `<a href="/profil/${id}" class="creator-card">
  <div class="creator-card-banner" style="background:${bannerIsGrad?grad:'#000'}">
    ${bannerFile?`<img src="/appbild/${id}/banner" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">`:''}
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,.5))"></div>
    ${i<3?`<div style="position:absolute;top:6px;left:8px;font-size:15px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">${medals[i]}</div>`:''}
  </div>
  <div class="creator-card-avatar" style="background:${grad}${getRingBoxShadow(u)}">
    <span style="position:absolute;z-index:0;font-size:16px;font-weight:800">${(u.name||'?').slice(0,1)}</span>
    ${picFile?`<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" loading="lazy" alt="">`:insta?`<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" loading="lazy" onerror="this.style.display='none'" alt="">`:''}
  </div>
  <div class="creator-card-info">
    <div class="creator-card-name" style="margin-top:4px">${u.spitzname||u.name||'User'}</div>
    ${insta?`<span onclick="event.stopPropagation();window.open('https://instagram.com/${insta}','_blank')" style="font-size:10px;color:#4dabf7;margin-top:2px;display:block;cursor:pointer">@${insta}</span>`:''}
    <div class="creator-card-xp">⚡ ${u.xp||0} XP</div>
    ${pinnedLink?`<a href="${pinnedLink}" target="_blank" onclick="event.stopPropagation()" style="display:block;font-size:10px;color:var(--accent);margin-top:5px;padding:3px 8px;background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.2);border-radius:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none">📌 Reel ansehen</a>`:''}
  </div>
</a>`;
        }).join('');

        // Podium fuer Top-3 + Listrows ab Rang 4
        const makePodium = (entries, xpFn) => {
            const top3 = entries.slice(0,3);
            if (!top3.length) return '';
            const slot = (entry, place) => {
                if (!entry) return `<div class="podium-slot p${place}"></div>`;
                const [id,u] = entry;
                const grad = badgeGradient(u.role);
                const insta = u.instagram;
                const initial = (u.name||'?').slice(0,2).toUpperCase();
                const img = ladeBild(id,'profilepic')
                    ? `<img src="/appbild/${id}/profilepic" loading="lazy" alt="">`
                    : insta ? `<img src="https://unavatar.io/instagram/${htmlEsc(insta)}" loading="lazy" onerror="this.remove()" alt="">` : '';
                const crown = place===1 ? '<div class="podium-crown">👑</div>' : '';
                return `<a href="/profil/${id}" class="podium-slot p${place}">
                  ${crown}
                  <div class="podium-avatar" style="background:${grad}"><span>${initial}</span>${img}</div>
                  <div class="podium-name">${htmlEsc(u.spitzname||u.name||'User')}${id===myUid?' (Du)':''}</div>
                  <div class="podium-xp">${(xpFn(id,u)||0).toLocaleString('de-DE')} XP</div>
                  <div class="podium-block">${place}</div>
                </a>`;
            };
            return `<div class="podium-wrap"><div class="podium-row">${slot(top3[1],2)}${slot(top3[0],1)}${slot(top3[2],3)}</div></div>`;
        };
        // Ranking rows helper (ab Rang 4 — Podium oben rendert Top-3)
        const makeRankRows = (entries, xpFn) => entries.slice(3).map(([id,u],idx)=>{
            const i = idx + 3;
            const isMe = id===myUid;
            const insta = u.instagram;
            const grad = badgeGradient(u.role);
            const xp = xpFn(id,u);
            return `<a href="/profil/${id}" class="rank-item ${isMe?'rank-me':''}">
    <div class="rank-pos"><span class="rank-num">${i+1}</span></div>
    <div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:${grad};flex-shrink:0;display:flex;align-items:center;justify-content:center${getRingBoxShadow(u)}">
      <span style="color:#fff;font-weight:700;font-size:14px;position:absolute">${(u.name||'?').slice(0,2).toUpperCase()}</span>
      ${ladeBild(id,'profilepic')?`<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">`:insta?`<img src="https://unavatar.io/instagram/${htmlEsc(insta)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.remove()" alt="">`:''}
    </div>
    <div class="rank-info">
      <div class="rank-name">${htmlEsc(u.spitzname||u.name||'User')}${isMe?' (Du)':''}</div>
      <div class="rank-badge">${htmlEsc(u.role||'')}</div>
    </div>
    <div class="rank-xp">${(xp||0).toLocaleString('de-DE')} XP</div>
  </a>`;
        }).join('');
        const makeRankSection = (entries, xpFn, emptyHint) => {
            if (!entries.length) return `<div class="empty" style="padding:48px 24px;text-align:center"><div class="empty-icon">🏆</div><div class="empty-text">${emptyHint}</div></div>`;
            return makePodium(entries, xpFn) + makeRankRows(entries, xpFn);
        };
        const rankingRows = makeRankSection(sorted, (_,u)=>u.xp||0, 'Noch keine Daten');
        const dailySorted = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&(d.dailyXP[id]||0)>0)
            .sort((a,b)=>(d.dailyXP[b[0]]||0)-(d.dailyXP[a[0]]||0));
        const weeklySorted = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&(d.weeklyXP[id]||0)>0)
            .sort((a,b)=>(d.weeklyXP[b[0]]||0)-(d.weeklyXP[a[0]]||0));
        const dailyRows = makeRankSection(dailySorted, (id)=>d.dailyXP[id]||0, 'Heute noch keine XP');
        const weeklyRows = makeRankSection(weeklySorted, (id)=>d.weeklyXP[id]||0, 'Diese Woche noch keine XP');

        // ── PERSONEN DIE DU KENNEN KÖNNTEST ──
        const myFollowingSet = new Set((d.users[myUid]?.following||[]).map(String));
        const suggestions = [];
        for (const [uid, u] of Object.entries(d.users||{})) {
            if (String(uid) === String(myUid)) continue;
            if (adminIds.includes(Number(uid))) continue;
            if (!u || !u.started || u.inGruppe === false) continue;
            if (myFollowingSet.has(String(uid))) continue;
            const theirFollowers = (u.followers||[]).map(String);
            const mutuals = theirFollowers.filter(f => myFollowingSet.has(f));
            // Score: mutuals zählen am meisten, fallback auf XP
            const score = mutuals.length * 1000 + (u.xp || 0);
            suggestions.push({ uid, u, mutuals, score });
        }
        suggestions.sort((a,b) => b.score - a.score);
        const topSuggestions = suggestions.slice(0, 12);
        const sugCards = topSuggestions.map(({uid, u, mutuals}) => {
            const grad = badgeGradient(u.role);
            const insta = u.instagram;
            const pic = ladeBild(uid, 'profilepic');
            const name = u.spitzname || u.name || 'User';
            const mutualText = mutuals.length === 0
                ? 'Vorschlag'
                : mutuals.length + ' gemeinsame' + (mutuals.length === 1 ? 'r' : '');
            const mAvatars = mutuals.slice(0, 3).map((mid, i) => {
                const mu = d.users[mid] || {};
                const mp = ladeBild(mid, 'profilepic');
                const mInsta = mu.instagram;
                const left = i === 0 ? '0' : '-8px';
                return `<div style="width:18px;height:18px;border-radius:50%;background:${badgeGradient(mu.role)};border:2px solid var(--bg3);overflow:hidden;flex-shrink:0;margin-left:${left};display:flex;align-items:center;justify-content:center">${mp?`<img src="/appbild/${mid}/profilepic" style="width:100%;height:100%;object-fit:cover" loading="lazy">`:mInsta?`<img src="https://unavatar.io/instagram/${mInsta}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.remove()">`:`<span style="color:#fff;font-size:9px;font-weight:700">${(mu.name||'?')[0]}</span>`}</div>`;
            }).join('');
            return `<div class="sug-card" data-uid="${uid}">
  <button type="button" class="sug-x" data-uid="${uid}" title="Ausblenden" onclick="event.preventDefault();event.stopPropagation();var btn=this;var u=btn.dataset.uid;var c=btn.closest('.sug-card');if(c){c.style.transition='opacity 0.25s,transform 0.25s';c.style.opacity='0';c.style.transform='scale(0.85)';setTimeout(function(){c.remove();},250);}try{var ds=JSON.parse(localStorage.getItem('sugDismissed')||'[]');if(!ds.includes(u)){ds.push(u);localStorage.setItem('sugDismissed',JSON.stringify(ds.slice(-100)));}}catch(e){}return false">×</button>
  <a href="/profil/${uid}" style="text-decoration:none;color:inherit;display:block">
    <div class="sug-card-banner" style="background:${grad}"></div>
    <div class="sug-avatar" style="background:${grad}${getRingBoxShadow(u)}">
      <span style="position:absolute">${htmlEsc((name[0]||'?').toUpperCase())}</span>
      ${pic?`<img src="/appbild/${uid}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%" loading="lazy">`:insta?`<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%" loading="lazy" onerror="this.remove()">`:''}
    </div>
    <div class="sug-info">
      <div class="sug-name">${htmlEsc(name)}</div>
      <div class="sug-role">${htmlEsc(u.role||'🆕 New')}${u.xp?'  ·  '+u.xp+' XP':''}</div>
      ${mAvatars ? `<div class="sug-meta"><div style="display:flex;align-items:center">${mAvatars}</div></div>` : ''}
      <div class="sug-mutuals${mutuals.length?' has-mutual':''}">${mutualText}</div>
    </div>
  </a>
  <form method="POST" action="/follow-form" style="margin:0">
    <input type="hidden" name="uid" value="${uid}">
    <input type="hidden" name="back" value="/explore">
    <button type="submit" class="sug-btn js-sug-follow" data-follow-uid="${uid}">+ Folgen</button>
  </form>
</div>`;
        }).join('');

        const _me = d.users[myUid]||{};
        const _greetName = _me.spitzname || _me.name || 'Creator';
        const _hr = new Date().getHours();
        const _greet = _hr < 5 ? 'Gute Nacht' : _hr < 11 ? 'Guten Morgen' : _hr < 14 ? 'Servus' : _hr < 18 ? 'Hi' : _hr < 22 ? 'Guten Abend' : 'Späten Abend';
        const _newsArr = (d.newsletter||[]).slice().sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
        const _latestNews = _newsArr[0];
        const _newsAge = _latestNews ? (Date.now() - (_latestNews.timestamp||0)) : null;
        const _newsAgeStr = _newsAge==null ? '' : (_newsAge < 86400000 ? 'heute' : _newsAge < 7*86400000 ? Math.floor(_newsAge/86400000)+'d' : new Date(_latestNews.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short'}));
        const tabContent = {
            allgemein: `
<div style="margin:4px 16px 20px;border-radius:22px;overflow:hidden;position:relative;background:linear-gradient(135deg,#7c3aed 0%,#a78bfa 50%,#4dabf7 100%)">
  <div style="position:absolute;inset:0;background:radial-gradient(circle at 80% -20%,rgba(167,139,250,0.45),transparent 55%),radial-gradient(circle at 10% 110%,rgba(77,171,247,0.35),transparent 50%);pointer-events:none"></div>
  <div style="position:absolute;top:-30px;right:-30px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.08),transparent 70%);pointer-events:none"></div>
  <div style="position:relative;padding:22px 20px 18px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px">
      <span style="width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,0.6);display:inline-block"></span>
      <span style="font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.55);text-transform:uppercase">Community live</span>
    </div>
    <div style="font-size:13px;color:rgba(255,255,255,0.55);font-weight:500;letter-spacing:0.3px">${_greet},</div>
    <div style="font-size:26px;font-weight:800;color:#fff;font-family:var(--font-display);line-height:1.1;margin-top:2px;letter-spacing:-0.5px">${htmlEsc(_greetName)} 👋</div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <div style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;background:rgba(255,255,255,0.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:999px;font-size:11.5px;color:#fff;font-weight:600">⭐ ${_me.xp||0} XP</div>
      ${myRank>0?`<div style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;background:rgba(255,255,255,0.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:999px;font-size:11.5px;color:#fff;font-weight:600">🏆 Rang #${myRank}</div>`:''}
      <div style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;background:rgba(255,255,255,0.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:999px;font-size:11.5px;color:#fff;font-weight:600">💎 ${_me.diamonds||0}</div>
    </div>
    ${_latestNews ? `<a href="/explore?tab=newsletter" style="display:flex;align-items:center;gap:12px;margin-top:18px;padding:13px 14px;background:rgba(255,255,255,0.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.12);border-radius:14px;text-decoration:none;color:#fff;transition:transform 0.18s">
      <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#4dabf7,#1d6fa5);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📩</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:1.2px;color:rgba(255,255,255,0.6);text-transform:uppercase">Neuste News${_newsAgeStr?' · '+_newsAgeStr:''}</div>
        <div style="font-size:13px;font-weight:700;color:#fff;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${htmlEsc(_latestNews.title || _latestNews.content || '').slice(0,60)}</div>
      </div>
      <div style="font-size:18px;color:rgba(255,255,255,0.5)">→</div>
    </a>` : `<a href="/explore?tab=newsletter" style="display:flex;align-items:center;gap:10px;margin-top:18px;padding:13px 14px;background:rgba(255,255,255,0.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.12);border-radius:14px;text-decoration:none;color:#fff">
      <div style="font-size:22px">📩</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:700;color:#fff">News & Updates entdecken</div><div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:1px">Bleib up-to-date</div></div>
      <div style="font-size:18px;color:rgba(255,255,255,0.5)">→</div>
    </a>`}
  </div>
</div>
${''/* Personen-die-du-kennen-koenntest-Section ist umgezogen nach /suche (siehe Nachrichten-Topbar) */}
<div style="padding:0 16px 14px">
  <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">⚡ Aktuelle Highlights</div>
  <a href="/explore?tab=ranking" class="highlight-card">
    <div class="highlight-icon" style="background:linear-gradient(135deg,rgba(255,214,0,.25),rgba(255,170,0,.15))">🏆</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">Rangliste aktualisiert</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">Schau wer gerade vorne liegt</div>
    </div>
    <div style="font-size:16px;color:rgba(255,255,255,.2)">›</div>
  </a>
  <a href="/feed" class="highlight-card">
    <div class="highlight-icon" style="background:linear-gradient(135deg,rgba(255,107,107,.25),rgba(204,93,232,.15))">📸</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">Community Feed</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">Entdecke neue Reels der Community</div>
    </div>
    <div style="font-size:16px;color:rgba(255,255,255,.2)">›</div>
  </a>
  <a href="/explore?tab=shop" class="highlight-card">
    <div class="highlight-icon" style="background:linear-gradient(135deg,rgba(0,200,130,.25),rgba(0,150,100,.15))">🎁</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">💎 Diamant Shop</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">Tausche Diamanten gegen Vorteile</div>
    </div>
    <div style="font-size:10px;color:#a78bfa;font-weight:700;background:rgba(167,139,250,.12);padding:2px 8px;border-radius:10px;white-space:nowrap">💎 ${d.users[myUid]?.diamonds||0}</div>
  </a>
</div>
<div style="padding:0 16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
  <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px">⭐ Top Creator</div>
  <a href="/explore?tab=ranking" style="font-size:12px;color:var(--accent);font-weight:600">Alle →</a>
</div>
<div class="creator-scroll" style="padding-bottom:4px">${topCreators||'<div style="color:var(--muted);font-size:13px;padding:0 16px">Noch keine Creator</div>'}</div>
<div style="padding:20px 16px 12px">
  <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">🚀 Was möchtest du tun?</div>
</div>
<div class="action-grid">
  <a href="/explore?tab=ranking" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(255,214,0,.2),rgba(255,170,0,.1))">🏆</div>
    <div class="action-card-title">Ranking ansehen</div>
    <div class="action-card-sub">Rang: ${myRank>0?'#'+myRank:'👑 Admin'}</div>
  </a>
  <a href="/explore?tab=tipps" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(100,180,255,.2),rgba(60,130,255,.1))">💡</div>
    <div class="action-card-title">Tipps entdecken</div>
    <div class="action-card-sub">Wachse als Creator</div>
  </a>
  <a href="/explore?tab=regeln" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(150,100,255,.2),rgba(100,60,200,.1))">📋</div>
    <div class="action-card-title">Regeln lesen</div>
    <div class="action-card-sub">Community Guidelines</div>
  </a>
  <a href="/explore?tab=shop" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(100,180,255,.2),rgba(60,130,255,.1))">💎</div>
    <div class="action-card-title">Diamant Shop</div>
    <div class="action-card-sub">💎 ${d.users[myUid]?.diamonds||0} Diamanten</div>
  </a>
  <a href="/explore?tab=newsletter" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(255,165,0,.2),rgba(255,130,0,.1))">📩</div>
    <div class="action-card-title">Newsletter</div>
    <div class="action-card-sub">Neuigkeiten & Updates</div>
  </a>
</div>`,
            ranking: `
<div style="padding:12px 16px 8px;display:flex;align-items:center;justify-content:space-between">
  <div style="font-size:13px;font-weight:700">⭐ Rangliste</div>
  <div style="font-size:12px;color:var(--muted)">Rang: ${myRank>0?'#'+myRank:adminIds.includes(Number(myUid))?'👑 Admin':'–'}</div>
</div>
<div style="display:flex;gap:6px;padding:0 16px 12px">
  <button onclick="switchRanking('gesamt',this)" id="rtab-gesamt" style="flex:1;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border:none;border-radius:10px;padding:7px;font-size:12px;font-weight:700;cursor:pointer">🏆 Gesamt</button>
  <button onclick="switchRanking('daily',this)" id="rtab-daily" style="flex:1;background:var(--bg3);color:var(--muted);border:1px solid var(--border2);border-radius:10px;padding:7px;font-size:12px;font-weight:700;cursor:pointer">📅 Daily</button>
  <button onclick="switchRanking('weekly',this)" id="rtab-weekly" style="flex:1;background:var(--bg3);color:var(--muted);border:1px solid var(--border2);border-radius:10px;padding:7px;font-size:12px;font-weight:700;cursor:pointer">📆 Woche</button>
</div>
<div id="rlist-gesamt" style="padding-bottom:100px">${rankingRows}</div>
<div id="rlist-daily" style="display:none;padding-bottom:100px">${dailyRows}</div>
<div id="rlist-weekly" style="display:none;padding-bottom:100px">${weeklyRows}</div>
<script>
function switchRanking(tab, btn) {
  ['gesamt','daily','weekly'].forEach(t=>{
    document.getElementById('rlist-'+t).style.display=t===tab?'block':'none';
    const b=document.getElementById('rtab-'+t);
    if(t===tab){b.style.background='linear-gradient(135deg,#a78bfa,#7c3aed)';b.style.color='#fff';b.style.border='none';}
    else{b.style.background='var(--bg3)';b.style.color='var(--muted)';b.style.border='1px solid var(--border2)';}
  });
}
</script>`,
            tipps: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">💡</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Tipps & Tricks</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Inhalte folgen bald!</div></div>`,
            regeln: require('./regeln-tab'),
            shop: (()=>{
                const myDiamonds = d.users[myUid]?.diamonds || 0;
                const myBonusLinks = d.bonusLinks?.[myUid] || 0;
                const myInventory = d.users[myUid]?.inventory || [];
                const isShopAdmin = String(d.users[myUid]?.role||'').includes('Admin');
                const ringsHtml = RING_ITEMS.map(item => {
                    const owned = myInventory.includes(item.id);
                    const canAfford = isShopAdmin || myDiamonds >= item.price;
                    const priceHtml = isShopAdmin
                        ? `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;color:var(--muted);text-decoration:line-through">💎 ${item.price}</span><span style="font-size:12px;font-weight:800;color:#22c55e">Gratis</span></div>`
                        : `<div style="font-size:13px;font-weight:800;color:#a78bfa">💎 ${item.price}</div>`;
                    return `<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:16px;padding:14px;margin-bottom:10px">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:52px;height:52px;border-radius:50%;background:#1e1e1e;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;box-shadow:${item.shadow}">A</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;margin-bottom:2px">${item.name}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">${item.desc}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          ${priceHtml}
          ${owned
            ? `<div style="font-size:12px;color:#22c55e;font-weight:700">✓ Besessen</div>`
            : `<button onclick="buyItem('${item.id}')" data-item="${item.id}" style="background:${canAfford?'linear-gradient(135deg,#a78bfa,#7c3aed)':'var(--bg4)'};color:${canAfford?'#fff':'var(--muted)'};border:none;border-radius:10px;padding:6px 16px;font-size:12px;font-weight:700;cursor:${canAfford?'pointer':'not-allowed'}" ${canAfford?'':'disabled'}>Kaufen</button>`
          }
        </div>
      </div>
    </div>
  </div>`;
                }).join('');
                const extraLinkPriceHtml = isShopAdmin
                    ? `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:14px;color:var(--muted);text-decoration:line-through">💎 5 Diamanten</span><span style="font-size:13px;font-weight:800;color:#22c55e">Gratis</span></div>`
                    : `<div style="font-size:14px;font-weight:800;color:#a78bfa">💎 5 Diamanten</div>`;
                const extraLinkCanBuy = isShopAdmin || myDiamonds >= 5;
                return `
<div style="padding:16px 16px 4px;display:flex;align-items:center;justify-content:space-between">
  <div style="font-size:13px;font-weight:700">💎 Diamant Shop</div>
  <div style="font-size:13px;font-weight:700;color:#a78bfa">💎 ${myDiamonds} Diamanten</div>
</div>
<div style="padding:4px 16px 16px;font-size:12px;color:var(--muted)">Tausche Diamanten gegen Vorteile</div>
<div style="padding:0 16px 100px">
  <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🔗 Links</div>
  <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:16px;padding:16px;margin-bottom:16px">
    <div style="display:flex;align-items:flex-start;gap:14px">
      <div style="font-size:36px;flex-shrink:0">🔗</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Extra-Link für heute</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Poste einen zusätzlichen Reel-Link heute — verfügbar im Web und in der Telegram-Gruppe. Bonus-Links: <b style="color:var(--text)">${myBonusLinks}</b></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          ${extraLinkPriceHtml}
          <button onclick="buyExtraLink()" id="buy-extralink-btn" style="background:${extraLinkCanBuy?'linear-gradient(135deg,#a78bfa,#7c3aed)':'var(--bg4)'};color:${extraLinkCanBuy?'#fff':'var(--muted)'};border:none;border-radius:12px;padding:8px 20px;font-size:13px;font-weight:700;cursor:${extraLinkCanBuy?'pointer':'not-allowed'}" ${extraLinkCanBuy?'':'disabled'}>Kaufen</button>
        </div>
        ${!extraLinkCanBuy?`<div style="font-size:11px;color:rgba(255,59,48,.8);margin-top:8px">Nicht genug Diamanten (benötigt: 5, vorhanden: ${myDiamonds})</div>`:''}
      </div>
    </div>
  </div>
  <div style="background:linear-gradient(135deg,rgba(245,158,11,0.12),rgba(167,139,250,0.12));border:1px solid rgba(245,158,11,0.3);border-radius:16px;padding:16px;margin-bottom:20px">
    <div style="display:flex;align-items:flex-start;gap:14px">
      <div style="font-size:36px;flex-shrink:0">⭐</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Extra-Superlink diese Woche</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Du hast deinen wöchentlichen Superlink schon verbraucht? Poste einen <b style="color:var(--text)">zweiten Superlink</b> für 10 💎 — direkt beim Posten in der App oder im Bot wird er automatisch abgerechnet.</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="font-size:14px;font-weight:800;color:#f59e0b">💎 10 Diamanten / Superlink</div>
          <a href="/feed?tab=engagement" style="background:linear-gradient(135deg,#f59e0b,#a78bfa);color:#fff;border:none;border-radius:12px;padding:8px 18px;font-size:13px;font-weight:700;text-decoration:none">Posten</a>
        </div>
        ${myDiamonds < 10 ? `<div style="font-size:11px;color:rgba(255,59,48,.8);margin-top:8px">Nicht genug Diamanten (benötigt: 10, vorhanden: ${myDiamonds})</div>` : ''}
      </div>
    </div>
  </div>
  <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🖼️ Profilbanner</div>
  ${['Bronze','Silber','Gold'].map(tier => {
    const tierColor = tier==='Bronze'?'#cd7f32':tier==='Silber'?'#a8a9ad':'#ffd700';
    const tierItems = BANNER_ITEMS.filter(b=>b.tier===tier);
    return `<div style="margin-bottom:14px">
  <div style="font-size:10px;font-weight:700;color:${tierColor};letter-spacing:1px;margin-bottom:8px">${tier==='Bronze'?'🥉':tier==='Silber'?'🥈':'🥇'} ${tier} — 💎 ${tierItems[0].price}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    ${tierItems.map(item => {
      const owned = myInventory.includes(item.id);
      const canAfford = isShopAdmin || myDiamonds >= item.price;
      return `<div style="background:var(--bg3);border:1px solid ${owned?'rgba(34,197,94,.4)':'var(--border2)'};border-radius:12px;overflow:hidden">
  <div style="height:46px;background:${item.gradient}"></div>
  <div style="padding:7px 10px">
    <div style="font-size:11px;font-weight:700;margin-bottom:5px">${item.emoji} ${item.name}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
      ${owned
        ? `<span style="font-size:10px;color:#22c55e;font-weight:700">✓ Besessen</span><button onclick="applyBanner('${item.gradient}')" style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:3px 10px;font-size:10px;font-weight:700;cursor:pointer">Nutzen</button>`
        : `${isShopAdmin?`<span style="font-size:10px;color:#22c55e;font-weight:800">Gratis</span>`:`<span style="font-size:10px;color:${tierColor};font-weight:800">💎 ${item.price}</span>`}<button onclick="buyItem('${item.id}')" data-item="${item.id}" style="background:${canAfford?`linear-gradient(135deg,${tierColor},${tier==='Gold'?'#b8860b':tier==='Silber'?'#6b7280':'#7c3aed'})`:'var(--bg4)'};color:${canAfford?'#fff':'var(--muted)'};border:none;border-radius:8px;padding:3px 10px;font-size:10px;font-weight:700;cursor:${canAfford?'pointer':'not-allowed'}" ${canAfford?'':'disabled'}>Kaufen</button>`
      }
    </div>
  </div>
</div>`;
    }).join('')}
  </div>
</div>`;
  }).join('')}
  <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🪄 Profilring</div>
  ${ringsHtml}
</div>
<script>
async function buyExtraLink(){
  const btn=document.getElementById('buy-extralink-btn');
  if(!btn||btn.disabled)return;
  btn.disabled=true;btn.textContent='...';
  try{
    const r=await fetch('/api/buy-extralink',{method:'POST',headers:{'Content-Type':'application/json'}});
    const data=await r.json();
    if(data.ok){
      btn.textContent='✓ Gekauft!';
      btn.style.background='linear-gradient(135deg,#22c55e,#16a34a)';
      setTimeout(()=>location.reload(),300);
    } else {
      btn.disabled=false;
      btn.textContent='Kaufen';
      alert(data.error||'Fehler beim Kauf');
    }
  }catch(e){btn.disabled=false;btn.textContent='Kaufen';}
}
async function buyItem(itemId){
  const btn=document.querySelector('[data-item="'+itemId+'"]');
  if(btn){btn.disabled=true;btn.textContent='...';}
  try{
    const r=await fetch('/api/buy-item',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId})});
    const data=await r.json();
    if(data.ok){
      setTimeout(()=>location.reload(),200);
    } else {
      if(btn){btn.disabled=false;btn.textContent='Kaufen';}
      alert(data.error||'Fehler beim Kauf');
    }
  }catch(e){if(btn){btn.disabled=false;btn.textContent='Kaufen';}}
}
async function applyBanner(gradient){
  try{
    const r=await fetch('/api/save-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({banner:gradient})});
    const data=await r.json();
    if(data.ok){location.reload();}else{alert(data.error||'Fehler');}
  }catch(e){alert('Fehler beim Setzen des Banners');}
}
// Globaler delegierter Handler für Folgen-Button (kann von keinem Parent geschluckt werden)
async function sugDoFollow(btn){
  if (!btn) { alert('🐛 Kein Button-Element'); return; }
  const uid = btn.dataset ? (btn.dataset.followUid || btn.getAttribute('data-follow-uid')) : btn.getAttribute && btn.getAttribute('data-follow-uid');
  if (!uid) { alert('🐛 Kein UID am Button. Bitte App neu laden.'); return; }
  if (btn.disabled) { btn.disabled = false; /* defensiv: stuck disabled freigeben */ }
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '...';
  try {
    const r = await fetch('/api/follow', { method: 'POST', headers: {'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify({uid: String(uid)}), credentials: 'same-origin' });
    let data = null; let raw = '';
    try { raw = await r.text(); data = JSON.parse(raw); } catch(e) {}
    console.log('[follow]', r.status, raw);
    if (r.ok && data && data.ok === true) {
      btn.textContent = '✓ Folge';
      btn.classList.add('followed');
      btn.disabled = false;
      // Direkt animieren — kein 900ms-Wait mehr (gefuehlte Verzoegerung). 350ms reichen fuer
      // visuelles Feedback. Funktioniert sowohl fuer .sug-card (alte Cards) als auch .sug-row (Liste).
      setTimeout(() => {
        const container = btn.closest('.sug-card') || btn.closest('.sug-row');
        if (!container) return;
        container.style.transition = 'opacity 0.25s,transform 0.25s,height 0.25s,padding 0.25s,margin 0.25s';
        container.style.opacity = '0';
        container.style.transform = container.matches('.sug-card') ? 'scale(0.85)' : 'translateX(40px)';
        setTimeout(() => container.remove(), 250);
      }, 350);
    } else if (r.status === 302 || r.redirected || (raw && raw.includes('<!DOCTYPE'))) {
      btn.textContent = orig; btn.disabled = false;
      alert('Du musst eingeloggt sein. Bitte App neu öffnen / einloggen.');
    } else {
      btn.textContent = orig; btn.disabled = false;
      const msg = (data && data.error) ? data.error : ('HTTP ' + r.status + (raw ? ' — ' + raw.slice(0,200) : ''));
      alert('Folgen fehlgeschlagen:\n' + msg);
    }
  } catch(e) {
    btn.textContent = orig; btn.disabled = false;
    alert('Netzwerkfehler beim Folgen:\n' + e.message);
  }
}
window.sugDoFollow = sugDoFollow;
// Form-Hijack: per fetch senden, bei Erfolg ohne Page-Reload, sonst Form normal abschicken
window.sugFormSubmit = function(form, ev){
  try {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    const uid = form.querySelector('input[name="uid"]')?.value;
    const btn = form.querySelector('.sug-btn');
    if (!uid || !btn || btn.disabled) return false;
    btn.disabled = true; const orig = btn.textContent; btn.textContent = '...';
    fetch('/api/follow', { method: 'POST', headers: {'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify({uid: String(uid)}), credentials: 'same-origin' })
      .then(r => r.text().then(txt => ({status: r.status, txt})))
      .then(({status, txt}) => {
        let data = null; try { data = JSON.parse(txt); } catch(e) {}
        if (status === 200 && data && data.ok === true) {
          btn.textContent = '✓ Folge'; btn.classList.add('followed');
          setTimeout(() => { const c = btn.closest('.sug-card'); if (c) { c.style.transition='opacity 0.3s,transform 0.3s'; c.style.opacity='0'; c.style.transform='scale(0.85)'; setTimeout(()=>c.remove(),300); } }, 800);
        } else if (status === 401 || status === 302 || (txt && txt.indexOf('<!DOCTYPE')===0)) {
          // Session weg → Form normal absenden, Server redirected zurück
          btn.textContent = orig; form.submit();
        } else {
          btn.textContent = orig; btn.disabled = false;
          alert('Folgen fehlgeschlagen:\n' + (data && data.error ? data.error : ('HTTP ' + status + (txt ? ' — ' + txt.slice(0,150) : ''))));
        }
      })
      .catch(e => { btn.disabled = false; btn.textContent = orig; alert('Netzwerk: ' + e.message + '\nForm wird normal abgeschickt...'); form.submit(); });
  } catch(e) { return true; /* normal submit als Fallback */ }
  return false;
};
// Click Capture-Listener — click reicht (touchend würde auf Mobile doppelt feuern)
document.addEventListener('click', function(ev){
  const btn = ev.target.closest && ev.target.closest('[data-follow-uid]');
  if (!btn) return;
  if (btn._followInFlight) { ev.preventDefault(); ev.stopPropagation(); return; }
  ev.preventDefault(); ev.stopPropagation();
  btn._followInFlight = true;
  Promise.resolve(sugDoFollow(btn)).finally(()=>{ setTimeout(()=>{ btn._followInFlight = false; }, 600); });
}, { capture: true, passive: false });
// Direkter Bind auf alle .js-sug-follow Buttons — nur click, kein touchend (sonst Doppel-Fire).
function _bindFollowBtns(){
  document.querySelectorAll('.js-sug-follow').forEach(btn => {
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', (e) => {
      try { e.preventDefault(); } catch(_){}
      try { e.stopPropagation(); } catch(_){}
      if (btn._followInFlight) return false;
      btn._followInFlight = true;
      Promise.resolve(sugDoFollow(btn)).finally(()=>{ setTimeout(()=>{ btn._followInFlight = false; }, 600); });
      return false;
    });
  });
}
_bindFollowBtns();
document.addEventListener('DOMContentLoaded', _bindFollowBtns);
window.addEventListener('load', _bindFollowBtns);
// Backwards-compat
window.sugFollow = sugDoFollow;
window.sugDismiss = function(btn){
  const card = btn.closest('.sug-card');
  if (!card) return;
  card.style.transition = 'opacity 0.25s,transform 0.25s';
  card.style.opacity = '0';
  card.style.transform = 'scale(0.85)';
  setTimeout(() => card.remove(), 250);
  // Optional: in localStorage merken damit es nicht wieder auftaucht
  try {
    const dismissed = JSON.parse(localStorage.getItem('sugDismissed')||'[]');
    if (!dismissed.includes(btn.dataset.uid)) { dismissed.push(btn.dataset.uid); localStorage.setItem('sugDismissed', JSON.stringify(dismissed.slice(-100))); }
  } catch(e) {}
};
// Beim Laden: localStorage-dismissed Karten ausblenden
(function(){
  try {
    const dismissed = JSON.parse(localStorage.getItem('sugDismissed')||'[]');
    document.querySelectorAll('.sug-card[data-uid]').forEach(c => { if (dismissed.includes(c.dataset.uid)) c.remove(); });
  } catch(e) {}
})();
</script>`;
            })(),
            newsletter: (()=>{
                const isAdminNL = adminIds.includes(Number(myUid));
                const entries = (d.newsletter||[]).slice().reverse();
                const entriesHtml = entries.length
                    ? entries.map(e=>`
<div class="nl-entry" data-id="${htmlEsc(String(e.id||''))}" style="padding:16px;border:1px solid var(--border2);border-radius:14px;background:var(--bg3);margin:0 16px 12px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
    ${e.title?`<div style="font-size:15px;font-weight:700;font-family:var(--font-display)">${htmlEsc(String(e.title))}</div>`:'<div></div>'}
    ${isAdminNL?`<div style="display:flex;gap:6px;flex-shrink:0"><button onclick="nlEdit('${htmlEsc(String(e.id||''))}')" style="background:var(--bg4);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer">✏️</button><button onclick="nlDelete('${htmlEsc(String(e.id||''))}')" style="background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.3);color:#ff3b30;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer">🗑️</button></div>`:''}
  </div>
  <div style="font-size:13px;line-height:1.65;color:var(--text);white-space:pre-wrap">${htmlEsc(String(e.content||''))}</div>
  <div style="font-size:11px;color:var(--muted);margin-top:10px">${new Date(e.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
</div>`).join('')
                    : '<div class="empty" style="padding:48px 24px;text-align:center"><div class="empty-icon">📩</div><div class="empty-text">Noch keine Newsletter-Einträge</div></div>';
                const adminForm = isAdminNL ? `
<div id="nl-form" style="display:none;margin:0 16px 16px;padding:16px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px">
  <input type="hidden" id="nl-edit-id">
  <div class="form-label">Titel (optional)</div>
  <input type="text" id="nl-title" class="form-input" placeholder="z.B. Update Mai 2026" style="margin-bottom:10px">
  <div class="form-label">Inhalt *</div>
  <textarea id="nl-content" class="form-input" rows="5" placeholder="Newsletter-Text..." style="margin-bottom:12px"></textarea>
  <div style="display:flex;gap:8px">
    <button onclick="nlSave()" class="btn btn-primary" style="flex:2">💾 Speichern</button>
    <button onclick="nlCancel()" class="btn btn-outline" style="flex:1">Abbrechen</button>
  </div>
  <div id="nl-result" style="margin-top:8px;font-size:12px;color:var(--muted);text-align:center"></div>
</div>` : '';
                const adminBtn = isAdminNL ? `<button onclick="nlNew()" style="display:flex;align-items:center;gap:8px;background:var(--accent);color:#fff;border:none;border-radius:12px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;margin:16px 16px 12px">+ Neuer Eintrag</button>` : '';
                return `
<div style="padding-top:8px;padding-bottom:80px">
  <div style="padding:0 16px 12px;display:flex;align-items:center;justify-content:space-between">
    <div style="font-size:18px;font-weight:800;font-family:var(--font-display)">📩 Newsletter</div>
  </div>
  <a href="/diamanten" style="display:flex;align-items:center;gap:12px;margin:0 16px 16px;padding:14px 16px;background:linear-gradient(135deg,#4dabf7,#a78bfa);border-radius:14px;text-decoration:none;color:#fff;box-shadow:0 4px 14px rgba(167,139,250,0.3)">
    <div style="font-size:28px">💎</div>
    <div style="flex:1"><div style="font-size:14px;font-weight:700">Diamanten‑System</div><div style="font-size:11.5px;opacity:0.85;margin-top:2px">Wie verdiene ich Diamanten? Was kann ich kaufen?</div></div>
    <div style="font-size:18px;opacity:0.8">→</div>
  </a>
  ${adminBtn}
  ${adminForm}
  ${entriesHtml}
</div>
<script>
${isAdminNL?`
function nlNew(){document.getElementById('nl-form').style.display='block';document.getElementById('nl-edit-id').value='';document.getElementById('nl-title').value='';document.getElementById('nl-content').value='';document.getElementById('nl-result').textContent='';}
function nlCancel(){document.getElementById('nl-form').style.display='none';}
function nlEdit(id){const el=document.querySelector('[data-id="'+id+'"]');if(!el)return;document.getElementById('nl-edit-id').value=id;document.getElementById('nl-title').value=el.querySelector('[style*="font-display"]')?.textContent||'';document.getElementById('nl-content').value=el.querySelector('[style*="pre-wrap"]')?.textContent||'';document.getElementById('nl-form').style.display='block';window.scrollTo({top:0,behavior:'smooth'});}
async function nlSave(){const id=document.getElementById('nl-edit-id').value;const title=document.getElementById('nl-title').value.trim();const content=document.getElementById('nl-content').value.trim();if(!content)return;const ep=id?'/api/newsletter-edit':'/api/newsletter-add';const body=id?{id,title,content}:{title,content};const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(d.ok){toast('✅ Gespeichert!');setTimeout(()=>location.reload(),200);}else document.getElementById('nl-result').textContent='❌ '+(d.error||'Fehler');}
async function nlDelete(id){if(!confirm('Eintrag löschen?'))return;const r=await fetch('/api/newsletter-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const d=await r.json();if(d.ok){toast('✅ Gelöscht');setTimeout(()=>location.reload(),150);}else toast('❌ Fehler');}
`:''}
</script>`;
            })()
        };

        const tabs = [
            {id:'allgemein', emoji:'✨', label:'Übersicht', c1:'#a78bfa', c2:'#7c3aed', shadow:'rgba(167,139,250,0.45)'},
            {id:'newsletter',emoji:'📩', label:'News',      c1:'#4dabf7', c2:'#1d6fa5', shadow:'rgba(77,171,247,0.45)'},
            {id:'ranking',   emoji:'🏆', label:'Ranking',   c1:'#f59e0b', c2:'#d97706', shadow:'rgba(245,158,11,0.45)'},
            {id:'tipps',     emoji:'💡', label:'Tipps',     c1:'#22c55e', c2:'#15803d', shadow:'rgba(34,197,94,0.45)'},
            {id:'regeln',    emoji:'📋', label:'Regeln',    c1:'#94a3b8', c2:'#475569', shadow:'rgba(148,163,184,0.45)'},
            {id:'shop',      emoji:'💎', label:'Shop',      c1:'#ec4899', c2:'#a21caf', shadow:'rgba(236,72,153,0.45)'},
        ];

        return html(`
<div class="topbar">
  <div class="topbar-logo">CreatorX</div>
  <div class="topbar-actions">
    <button class="icon-btn" onclick="setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')" title="Theme">🌙</button>
  </div>
</div>
<div style="padding:18px 16px 6px">
  <div style="display:flex;align-items:center;gap:8px;font-size:10px;font-weight:800;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">
    <span style="display:inline-block;width:18px;height:1.5px;background:linear-gradient(90deg,#a78bfa,transparent)"></span>
    Creator Hub
  </div>
  <h1 style="font-size:30px;font-weight:800;font-family:var(--font-display);letter-spacing:-0.8px;line-height:1.05;margin:0;color:var(--text)">Deine Community.<br><span style="background:linear-gradient(135deg,#a78bfa,#4dabf7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Dein Wachstum.</span></h1>
  <div style="font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.5;letter-spacing:0.1px">News, Rankings, Tipps & Shop — alles an einem Ort.</div>
</div>
<div class="explore-tabs">
  ${tabs.map(t=>`<button class="explore-tab${tab===t.id?' active':''}" style="--et-c1:${t.c1};--et-c2:${t.c2};--et-shadow:${t.shadow}" onclick="location.href='/explore?tab=${t.id}'"><span class="et-icon">${t.emoji}</span><span class="et-label">${t.label}</span></button>`).join('')}
</div>
<div id="explore-content" style="padding-bottom:${tab==='allgemein'?'0':'80px'}">
  ${tabContent[tab]||tabContent.allgemein}
</div>
`, 'explore');
    }

    // ── RANKING ──
    if (path === '/ranking') {
        const sorted = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&u.inGruppe!==false)
            .sort((a,b)=>(b[1].xp||0)-(a[1].xp||0));
        const isAdminUser = adminIds.includes(Number(myUid));
        const myRank = isAdminUser ? 0 : sorted.findIndex(([id])=>id===myUid)+1;
        const top3 = sorted.slice(0,3);
        const rest = sorted.slice(3);
        const podiumSlot = (entry, place) => {
            if (!entry) return `<div class="podium-slot p${place}"></div>`;
            const [id,u] = entry;
            const grad = badgeGradient(u.role);
            const insta = u.instagram;
            const initial = (u.name||'?').slice(0,2).toUpperCase();
            const img = ladeBild(id,'profilepic')
                ? `<img src="/appbild/${id}/profilepic" loading="lazy" alt="">`
                : insta ? `<img src="https://unavatar.io/instagram/${htmlEsc(insta)}" loading="lazy" onerror="this.remove()" alt="">` : '';
            const crown = place===1 ? '<div class="podium-crown">👑</div>' : '';
            return `<a href="/profil/${id}" class="podium-slot p${place}">
              ${crown}
              <div class="podium-avatar" style="background:${grad}"><span>${initial}</span>${img}</div>
              <div class="podium-name">${htmlEsc(u.spitzname||u.name||'User')}${id===myUid?' (Du)':''}</div>
              <div class="podium-xp">${(u.xp||0).toLocaleString('de-DE')} XP</div>
              <div class="podium-block">${place}</div>
            </a>`;
        };
        const podium = top3.length ? `<div class="podium-wrap">
          <div class="podium-row">
            ${podiumSlot(top3[1], 2)}
            ${podiumSlot(top3[0], 1)}
            ${podiumSlot(top3[2], 3)}
          </div>
        </div>` : '';
        return html(`
<div class="topbar">
  <div class="topbar-logo">Rangliste</div>
  <div style="font-size:12px;color:var(--muted)">Dein Rang: #${myRank}</div>
</div>
<div class="tabs"><div class="tab active">⭐ Gesamt</div></div>
${podium}
${rest.map(([id,u],idx)=>{
    const i = idx + 3;
    const isMe = id===myUid;
    const insta = u.instagram;
    const grad = badgeGradient(u.role);
    return `<a href="/profil/${id}" class="rank-item ${isMe?'rank-me':''}">
    <div class="rank-pos"><span class="rank-num">${i+1}</span></div>
    <div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:${grad};flex-shrink:0;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-weight:700;font-size:14px;position:absolute">${(u.name||'?').slice(0,2).toUpperCase()}</span>
      ${ladeBild(id,'profilepic')
        ? `<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" alt="">`
        : insta
        ? `<img src="https://unavatar.io/instagram/${htmlEsc(insta)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.remove()" alt="">`
        : ''}
    </div>
    <div class="rank-info">
      <div class="rank-name">${htmlEsc(u.spitzname||u.name||'User')}${isMe?' (Du)':''}</div>
      <div class="rank-badge">${htmlEsc(u.role||'')}</div>
    </div>
    <div class="rank-xp">${(u.xp||0).toLocaleString('de-DE')} XP</div>
  </a>`;
}).join('')}`, 'ranking');
    }

    // ── EIGENES PROFIL ──
    if (path === '/profil') {
        if (!myUser) return redirect('/');
        const myBannerData = session.bannerData || ladeBild(myUid, 'banner');
        const myPicData = session.profilePicData || ladeBild(myUid, 'profilepic');
        // Sub-Account-Switcher Daten
        const parentUid = String(session.uid);
        const subUid = session.subUid ? String(session.subUid) : null;
        const parentUser = (d.users||{})[parentUid] || {};
        const subUser = subUid ? (d.users||{})[subUid] : null;
        const parentPic = ladeBild(parentUid, 'profilepic');
        const subPic = subUid ? ladeBild(subUid, 'profilepic') : null;
        const isParentActive = String(myUid) === parentUid;
        const myPosts = (d.posts||{})[myUid] || [];
        const myProjects = myUser.projects || [];

        const myPostsHtml = myPosts.length
            ? myPosts.slice().reverse().map((p)=>{
                let attachHtml = '';
                if(p.attachment && p.attachmentType==='image') attachHtml = '<img src="'+p.attachment+'" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-top:8px" alt="">';
                if(p.attachment && p.attachmentType==='audio') attachHtml = '<audio controls src="'+p.attachment+'" style="width:100%;margin-top:8px"></audio>';
                return '<div style="padding:12px 16px;border-top:1px solid var(--border2)">'
                    +'<div style="display:flex;justify-content:space-between;align-items:start">'
                    +'<div style="font-size:13px;line-height:1.6;flex:1">'+p.text+'</div>'
                    +'<button onclick="deletePost('+p.timestamp+')" style="background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;flex-shrink:0;padding:0 0 0 8px">🗑️</button>'
                    +'</div>'
                    +attachHtml
                    +'<div style="font-size:11px;color:var(--muted);margin-top:6px">'+new Date(p.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})+'</div>'
                    +'</div>';
            }).join('')
            : '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Noch keine Posts</div></div>';

        const canAddProject = myProjects.length < 2;
        const projCardsHtml = myProjects.map((proj, i) => {
            const projImg = ladeProjectBild(myUid, proj.id);
            const docIcon = proj.docName ? (proj.docName.endsWith('.pptx')?'📊':'📄') : null;
            return '<div class="proj-card" onclick="openProjDetail('+i+')">'
                +(projImg ? '<img class="proj-card-img" src="'+projImg+'" alt="">' : '<div class="proj-card-placeholder">'+(docIcon||'🚀')+'</div>')
                +'<div class="proj-card-body">'
                +'<div class="proj-card-title">'+proj.title+'</div>'
                +(proj.description?'<div class="proj-card-desc">'+proj.description+'</div>':'')
                +'</div></div>';
        }).join('');
        const addCardHtml = canAddProject
            ? '<div class="proj-add-card" onclick="openAddProj()"><div style="font-size:28px;line-height:1">+</div><div style="font-size:12px;font-weight:600">Projekt hinzufügen</div></div>'
            : '';

        const hasPic = !!(myPicData||ladeBild(myUid,'profilepic'));
        const hasBanner = !!(session.bannerData||ladeBild(myUid,'banner'));
        const completionChecks = [
            [hasPic, 'Profilbild', '/einstellungen'],
            [hasBanner, 'Banner', '/einstellungen'],
            [!!(myUser?.bio?.trim()), 'Bio', '/einstellungen'],
            [!!(myUser?.nische?.trim()), 'Nische', '/einstellungen'],
        ];
        const completionDone = completionChecks.filter(c=>c[0]).length;
        const completionPct = Math.round(completionDone/completionChecks.length*100);
        const completionHtml = (()=>{
            if (completionPct === 100) {
                const alreadyRewarded = myUser?.profileCompletionRewarded;
                return '<div class="fade-in" style="margin:12px 16px;padding:12px 14px;background:linear-gradient(135deg,rgba(0,200,81,.12),rgba(0,200,81,.06));border:1px solid rgba(0,200,81,.35);border-radius:14px;display:flex;align-items:center;gap:12px">'
                    +'<div style="font-size:28px">🏆</div>'
                    +'<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--green)">Profil 100% vollständig!</div>'
                    +'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+(alreadyRewarded?'Belohnung bereits erhalten':'💎 +1 Diamant erhalten!')+'</div></div>'
                    +'<div style="font-size:11px;font-weight:700;color:var(--green)">100%</div>'
                    +'</div>';
            }
            const next = completionChecks.find(c=>!c[0]);
            return '<div style="margin:12px 16px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px">'
                +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
                +'<div style="font-size:13px;font-weight:700">Profil vervollständigen</div>'
                +'<div style="font-size:12px;font-weight:700;color:var(--accent)">'+completionPct+'%</div></div>'
                +'<div style="background:var(--bg4);border-radius:4px;height:6px;overflow:hidden;margin-bottom:10px">'
                +'<div style="height:100%;width:'+completionPct+'%;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:4px;transition:width .6s ease"></div></div>'
                +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-bottom:10px">'
                +completionChecks.map(([isDone,label,href])=>'<a href="'+(href||'#')+'" style="display:flex;align-items:center;gap:4px;font-size:11px;color:'+(isDone?'var(--green)':'var(--muted)')+';text-decoration:none">'+(isDone?'✅':'⬜')+' '+label+'</a>').join('')
                +'</div>'
                +(next&&next[2]?'<a href="'+next[2]+'" style="display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#fff;padding:7px 14px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none">✏️ '+next[1]+' hinzufügen</a>':'')
                +'</div>';
        })();

        const myPinnedLink = ladePinnedLink(myUid);
        const myPinnedHtml = myPinnedLink
            ? '<div style="padding:12px 16px;border-bottom:2px solid var(--accent);background:linear-gradient(135deg,rgba(255,107,107,.08),rgba(255,165,0,.04));margin-bottom:4px">'
              +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
              +'<span style="font-size:11px;font-weight:700;color:var(--accent);background:rgba(255,107,107,.15);padding:3px 10px;border-radius:20px">📌 Angepinnter Post</span>'
              +'</div>'
              +'<a href="'+myPinnedLink+'" target="_blank" style="display:block;font-size:13px;color:var(--blue);word-break:break-all;margin-bottom:8px">'+myPinnedLink.replace('https://www.instagram.com/','ig.com/').slice(0,60)+'...</a>'
              +'<div style="font-size:12px;color:var(--muted)">Dies ist mein wichtigster Beitrag. Danke für deine Unterstützung 🙏</div>'
              +'</div>'
            : '';

        const linksHtml = Object.values(d.links||{}).filter(l=>l.user_id===Number(myUid)).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))
            .map(l=>'<div style="padding:12px 16px;border-top:1px solid var(--border2)"><a href="'+l.text+'" target="_blank" style="color:var(--blue);font-size:12px;word-break:break-all">'+l.text+'</a><div style="font-size:11px;color:var(--muted);margin-top:4px">❤️ '+(Array.isArray(l.likes)?l.likes.length:0)+' Likes · '+new Date(l.timestamp).toLocaleDateString('de-DE')+'</div></div>').join('')
            || '<div class="empty"><div class="empty-icon">🔗</div><div class="empty-text">Noch keine Links</div></div>';

        const aboutHtml = '<div style="padding:16px;display:flex;flex-direction:column;gap:12px;padding-bottom:100px">'
            +(myUser?.bio?'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Bio</div><div style="font-size:14px;line-height:1.6">'+myUser.bio+'</div></div>':'')
            +(myUser?.nische?'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Nische</div><div style="font-size:14px;color:var(--accent)">🎯 '+myUser.nische+'</div></div>':'')
            +'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">'
            +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Social &amp; Links</div>'
            +(myUser?.instagram?'<a href="https://instagram.com/'+myUser.instagram+'" target="_blank" style="display:flex;align-items:center;gap:10px;text-decoration:none"><span style="font-size:20px">📸</span><span style="color:var(--blue);font-size:14px">@'+myUser.instagram+'</span></a>':'<div style="font-size:13px;color:var(--muted)">Noch kein Instagram verknüpft</div>')
            +(myUser?.website?'<a href="'+myUser.website+'" target="_blank" style="display:flex;align-items:center;gap:10px;text-decoration:none"><span style="font-size:20px">🔗</span><span style="color:var(--blue);font-size:14px">'+myUser.website.replace('https://','').replace('http://','').slice(0,40)+'</span></a>':'')
            +'</div>'
            +'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px">'
            +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Status</div>'
            +'<div style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;background:'+badgeGradient(myUser?.role)+';color:#fff;font-size:12px;font-weight:700">'+( myUser?.role||'🆕 New')+'</div>'
            +(myUser?.trophies&&myUser.trophies.length?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'+myUser.trophies.map(t=>'<span style="font-size:22px;background:var(--bg4);border-radius:8px;padding:4px 8px">'+t+'</span>').join('')+'</div>':'')
            +'</div>'
            +(()=>{
                const bNow2 = new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Berlin'}));
                const bDay2 = bNow2.getDay(); const bOff2 = bDay2===0?-6:1-bDay2;
                const bMon2 = new Date(bNow2); bMon2.setDate(bNow2.getDate()+bOff2);
                const wKey2 = bMon2.toISOString().slice(0,10);
                const slMax2 = (d.users[myUid]?.role === '🌟 Elite+') ? 2 : 1;
                const slCount2 = Object.values(d.superlinks||{}).filter(s=>s.uid===myUid&&s.week===wKey2).length;
                const slLeft2 = Math.max(0, slMax2 - slCount2);
                const myBonusLinksProf = d.bonusLinks?.[myUid]||0;
                return '<div style="background:var(--bg3);border-radius:14px;padding:14px 16px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Verfügbarkeit</div>'
                    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
                    +'<div style="background:var(--bg4);border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600">⭐ Superlink: '+(slLeft2>0?'<span style="color:#22c55e">'+slLeft2+'/'+slMax2+' verfügbar</span>':'<span style="color:var(--muted)">0/'+slMax2+' verfügbar</span>')+'</div>'
                    +'<div style="background:var(--bg4);border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600">🔗 Extra-Links: <span style="color:var(--accent)">'+myBonusLinksProf+'</span></div>'
                    +'</div></div>';
            })()
            +'<a href="/einstellungen" style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px;padding:14px;font-size:14px;font-weight:600;color:var(--text);text-decoration:none">✏️ Profil bearbeiten</a>'
            +'</div>';

        const projDataJson = JSON.stringify(myProjects.map(p => ({
            id: p.id, title: p.title, description: p.description||'', link: p.link||'',
            img: ladeProjectBild(myUid, p.id) || '', docName: p.docName||''
        })));

        return html(`
<div class="topbar">
  <div class="topbar-logo">Creator Hub</div>
  <div style="display:flex;gap:6px;align-items:center">
    <a href="/suche" class="icon-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </a>
    <a href="/benachrichtigungen" class="icon-btn" style="position:relative">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span id="notif-badge-profil" style="display:none;position:absolute;top:0;right:0;background:var(--accent);color:#fff;font-size:9px;font-weight:700;border-radius:50%;width:14px;height:14px;align-items:center;justify-content:center;line-height:14px;text-align:center"></span>
    </a>
    <a href="/einstellungen" class="icon-btn">⚙️</a>
  </div>
</div>
${profileCard(myUid, myUser, d, true, lang, adminIds, myBannerData, myPicData)}
<div class="acc-switcher" style="margin:8px 12px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px;padding:6px">
  <div class="acc-row${isParentActive?' active':''}" onclick="switchAcc('${parentUid}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;transition:background 0.15s">
    <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#a78bfa,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex-shrink:0">
      ${parentPic ? `<img src="/appbild/${parentUid}/profilepic" style="width:100%;height:100%;object-fit:cover" alt="">` : (parentUser.name||'?').slice(0,1).toUpperCase()}
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(parentUser.spitzname||parentUser.name||'Hauptaccount').replace(/[<>"]/g,'')}</div>
      <div style="font-size:11px;color:var(--muted)">Hauptaccount · ${parentUser.xp||0} XP</div>
    </div>
    ${isParentActive?'<div style="font-size:10px;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.15);border-radius:999px;padding:3px 8px">aktiv</div>':'<div style="font-size:18px;color:var(--muted)">→</div>'}
  </div>
  ${subUid && subUser ? `
  <div class="acc-row${!isParentActive?' active':''}" onclick="switchAcc('${subUid}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;transition:background 0.15s;margin-top:4px">
    <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#fb923c,#f59e0b);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex-shrink:0">
      ${subPic ? `<img src="/appbild/${subUid}/profilepic" style="width:100%;height:100%;object-fit:cover" alt="">` : (subUser.name||'?').slice(0,1).toUpperCase()}
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(subUser.spitzname||subUser.name||'Sub').replace(/[<>"]/g,'')}</div>
      <div style="font-size:11px;color:var(--muted)">Sub-Account · ${subUser.xp||0} XP</div>
    </div>
    ${!isParentActive?'<div style="font-size:10px;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.15);border-radius:999px;padding:3px 8px">aktiv</div>':'<div style="font-size:18px;color:var(--muted)">→</div>'}
  </div>
  ${isParentActive ? `<div style="display:flex;justify-content:flex-end;padding:4px 10px 2px"><button onclick="deleteSubAcc()" style="background:none;border:none;color:#ef4444;font-size:11px;cursor:pointer">Sub-Account löschen</button></div>` : ''}
  ` : `
  <div onclick="openCreateSubModal()" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;margin-top:4px;border-radius:10px;cursor:pointer;border:1.5px dashed rgba(167,139,250,0.4);color:#a78bfa;font-size:13px;font-weight:600">
    <span style="font-size:18px;line-height:1">＋</span> Neuen Account erstellen
  </div>`}
</div>
<div id="create-sub-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(8px)">
  <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:18px;padding:20px;width:100%;max-width:340px">
    <div style="font-size:16px;font-weight:700;margin-bottom:6px">Neuen Account erstellen</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5">App‑Only Persona mit eigenen XP, Followers und Profil. Du kannst zwischen Haupt‑ und Sub‑Account switchen.</div>
    <input id="sub-name-input" type="text" placeholder="Name (max 30 Zeichen)" maxlength="30" style="width:100%;background:var(--bg4);border:1.5px solid var(--border);border-radius:12px;padding:10px 12px;color:var(--text);font-size:14px;outline:none;margin-bottom:12px">
    <div style="display:flex;gap:8px">
      <button onclick="closeCreateSubModal()" style="flex:1;background:var(--bg4);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer">Abbrechen</button>
      <button id="sub-create-btn" onclick="confirmCreateSub()" style="flex:1;background:linear-gradient(135deg,#a78bfa,#7c3aed);border:none;border-radius:12px;padding:10px;font-size:13px;font-weight:700;color:#fff;cursor:pointer">Erstellen</button>
    </div>
  </div>
</div>
<script>
async function switchAcc(uid){
  try {
    const r = await fetch('/api/switch-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid})});
    const d = await r.json();
    if (d.ok) location.reload();
    else alert('Fehler: '+(d.error||'unbekannt'));
  } catch(e){ alert('Netzwerkfehler: '+e.message); }
}
function openCreateSubModal(){
  const m = document.getElementById('create-sub-modal');
  if (m) { m.style.display='flex'; setTimeout(()=>document.getElementById('sub-name-input')?.focus(),50); }
}
function closeCreateSubModal(){
  const m = document.getElementById('create-sub-modal');
  if (m) m.style.display='none';
}
async function confirmCreateSub(){
  const inp = document.getElementById('sub-name-input');
  const btn = document.getElementById('sub-create-btn');
  const name = (inp?.value||'').trim();
  if (!name) { alert('Bitte einen Namen eingeben'); return; }
  if (btn) { btn.disabled=true; btn.textContent='...'; }
  try {
    const r = await fetch('/api/create-subaccount',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    const d = await r.json();
    if (d.ok) location.reload();
    else { if (btn) { btn.disabled=false; btn.textContent='Erstellen'; } alert('Fehler: '+(d.error||'unbekannt')); }
  } catch(e){ if (btn) { btn.disabled=false; btn.textContent='Erstellen'; } alert('Netzwerkfehler: '+e.message); }
}
async function deleteSubAcc(){
  if (!confirm('Sub-Account wirklich löschen? Alle XP, Posts und Follower gehen verloren.')) return;
  try {
    const r = await fetch('/api/delete-subaccount',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
    const d = await r.json();
    if (d.ok) location.reload();
    else alert('Fehler: '+(d.error||'unbekannt'));
  } catch(e){ alert('Netzwerkfehler: '+e.message); }
}
</script>
${completionHtml}
<div id="mission-widget" style="margin:0 12px 4px">
  <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:14px;padding:14px 16px;animation:shimmer 1.5s infinite">
    <div style="height:12px;background:var(--bg4);border-radius:6px;width:60%;margin-bottom:8px"></div>
    <div style="height:10px;background:var(--bg4);border-radius:6px;width:80%"></div>
  </div>
</div>
<div class="tabs" style="position:sticky;top:57px;z-index:50;background:var(--bg)">
  <div class="tab active" onclick="showPTab('posts',this)">📝 Posts</div>
  <div class="tab" onclick="showPTab('links',this)">🔗 Links</div>
  <div class="tab" onclick="showPTab('projekte',this)">🗂️ Projekte</div>
  <div class="tab" onclick="showPTab('about',this)">👤 About</div>
</div>
<div id="ptab-posts" style="padding-bottom:100px">
  <div style="padding:12px 16px">
    <textarea id="new-post" class="form-input" placeholder="Was denkst du gerade? (max 300 Zeichen)" maxlength="300" rows="3"></textarea>
    <button class="btn btn-primary btn-full" style="margin-top:8px" onclick="submitPost()">📝 Posten</button>
  </div>
  ${myPinnedHtml}
  ${myPostsHtml}
</div>
<div id="ptab-projekte" style="display:none;padding-bottom:100px">
  <div class="proj-grid">${projCardsHtml}${addCardHtml}</div>
  ${myProjects.length===0?'<div style="padding:4px 16px 32px;text-align:center;font-size:12px;color:var(--muted)">Zeig der Community, woran du arbeitest</div>':''}
</div>
<div id="ptab-links" style="display:none;padding-bottom:100px">
  ${linksHtml}
</div>
<div id="ptab-about" style="display:none">
  ${aboutHtml}
</div>

<div id="proj-detail-modal" class="proj-modal-overlay" onclick="if(event.target===this)closeProjDetail()">
  <div class="proj-modal-sheet">
    <div style="padding:20px 20px 8px;display:flex;justify-content:space-between;align-items:center">
      <div id="proj-detail-title" style="font-family:var(--font-display);font-size:18px;font-weight:700"></div>
      <button onclick="closeProjDetail()" style="background:var(--bg4);border:none;color:var(--muted);width:32px;height:32px;border-radius:50%;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer">×</button>
    </div>
    <div id="proj-detail-img-wrap"></div>
    <div style="padding:12px 20px 8px">
      <div id="proj-detail-desc" style="font-size:14px;color:var(--muted);line-height:1.6"></div>
      <div id="proj-detail-link" style="margin-top:10px"></div>
      <div id="proj-detail-doc" style="margin-top:10px"></div>
    </div>
    <div style="padding:12px 20px 40px;display:flex;gap:10px">
      <button id="proj-detail-edit" style="flex:1;background:var(--bg4);border:1px solid var(--border);color:var(--text);border-radius:var(--radius-sm);padding:11px;font-size:13px;font-weight:600;cursor:pointer">✏️ Bearbeiten</button>
      <button id="proj-detail-delete" style="flex:1;background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.3);color:#ff3b30;border-radius:var(--radius-sm);padding:11px;font-size:13px;font-weight:600;cursor:pointer">🗑️ Löschen</button>
    </div>
  </div>
</div>

<div id="proj-add-overlay" class="proj-add-overlay" onclick="if(event.target===this)closeAddProj()">
  <div class="proj-add-sheet">
    <div style="padding:20px 20px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border2)">
      <div id="proj-add-title" style="font-family:var(--font-display);font-size:16px;font-weight:700">Projekt hinzufügen</div>
      <button onclick="closeAddProj()" style="background:var(--bg4);border:none;color:var(--muted);width:32px;height:32px;border-radius:50%;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer">×</button>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
      <div>
        <div class="form-label">Projektbild</div>
        <label style="display:flex;align-items:center;gap:12px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;cursor:pointer">
          <div id="proj-img-preview" style="width:52px;height:52px;border-radius:10px;overflow:hidden;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📷</div>
          <div><div style="font-size:13px;font-weight:600">Bild auswählen</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Alle Bildformate · max 4MB</div></div>
          <input type="file" id="proj-img-input" accept="image/*" style="display:none" onchange="previewProjImg(this)">
        </label>
      </div>
      <div>
        <div class="form-label">Dokument (optional)</div>
        <label style="display:flex;align-items:center;gap:12px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;cursor:pointer">
          <div id="proj-doc-preview" style="width:52px;height:52px;border-radius:10px;overflow:hidden;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📎</div>
          <div><div style="font-size:13px;font-weight:600">Word / PowerPoint</div><div id="proj-doc-name" style="font-size:11px;color:var(--muted);margin-top:2px">.docx oder .pptx · max 10MB</div></div>
          <input type="file" id="proj-doc-input" accept=".docx,.pptx" style="display:none" onchange="previewProjDoc(this)">
        </label>
      </div>
      <div>
        <div class="form-label">Titel *</div>
        <input type="text" id="proj-title" class="form-input" placeholder="z.B. Mein YouTube Kanal" maxlength="50">
      </div>
      <div>
        <div class="form-label">Beschreibung</div>
        <textarea id="proj-desc" class="form-input" placeholder="Kurze Beschreibung deines Projekts..." maxlength="200" rows="3"></textarea>
      </div>
      <div>
        <div class="form-label">Link (optional)</div>
        <input type="url" id="proj-link" class="form-input" placeholder="https://...">
      </div>
      <button class="btn btn-primary btn-full" onclick="submitAddProj()" id="proj-submit-btn">✅ Projekt speichern</button>
    </div>
  </div>
</div>

<script>
const PROJECTS = ${projDataJson};
const _SESSION_UID = '${myUid}';
let _curProjIdx=-1, _editMode=false, _editProjId=null;
function showPTab(tab,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['posts','projekte','links','about'].forEach(t=>{const e=document.getElementById('ptab-'+t);if(e)e.style.display=t===tab?'block':'none';});
}
function openProjDetail(idx){
  const p=PROJECTS[idx]; if(!p) return; _curProjIdx=idx;
  document.getElementById('proj-detail-title').textContent=p.title;
  document.getElementById('proj-detail-img-wrap').innerHTML=p.img?'<img src="'+p.img+'" style="width:100%;object-fit:contain;display:block;background:#0a0a0a" alt="">':'';
  document.getElementById('proj-detail-desc').textContent=p.description||'';
  document.getElementById('proj-detail-link').innerHTML=p.link?'<a href="'+p.link+'" target="_blank" style="color:var(--blue);font-size:13px;word-break:break-all">🔗 '+p.link+'</a>':'';
  const docEl=document.getElementById('proj-detail-doc');
  if(p.docName){const icon=p.docName.endsWith('.pptx')?'📊':'📄';docEl.innerHTML='<a href="/api/download-project-doc/'+_SESSION_UID+'/'+p.id+'" style="display:inline-flex;align-items:center;gap:8px;background:var(--bg4);border:1px solid var(--border);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--text);text-decoration:none">'+icon+' '+p.docName+' herunterladen</a>';}
  else docEl.innerHTML='';
  document.getElementById('proj-detail-edit').onclick=()=>{closeProjDetail();openEditProj(idx);};
  document.getElementById('proj-detail-delete').onclick=()=>deleteProj(p.id);
  document.getElementById('proj-detail-modal').classList.add('open');
}
function closeProjDetail(){document.getElementById('proj-detail-modal').classList.remove('open');}
function openAddProj(){
  _editMode=false;_editProjId=null;
  document.getElementById('proj-add-title').textContent='Projekt hinzufügen';
  document.getElementById('proj-submit-btn').textContent='✅ Projekt speichern';
  document.getElementById('proj-title').value='';
  document.getElementById('proj-desc').value='';
  document.getElementById('proj-link').value='';
  document.getElementById('proj-img-preview').innerHTML='📷';
  document.getElementById('proj-img-preview')._data=null;
  document.getElementById('proj-doc-preview').innerHTML='📎';
  document.getElementById('proj-doc-preview')._data=null;
  document.getElementById('proj-doc-preview')._name=null;
  document.getElementById('proj-doc-name').textContent='.docx oder .pptx · max 10MB';
  document.getElementById('proj-add-overlay').classList.add('open');
}
function openEditProj(idx){
  const p=PROJECTS[idx]; if(!p) return;
  _editMode=true;_editProjId=p.id;
  document.getElementById('proj-add-title').textContent='Projekt bearbeiten';
  document.getElementById('proj-submit-btn').textContent='💾 Aktualisieren';
  document.getElementById('proj-title').value=p.title||'';
  document.getElementById('proj-desc').value=p.description||'';
  document.getElementById('proj-link').value=p.link||'';
  const imgPrev=document.getElementById('proj-img-preview');
  if(p.img){imgPrev.innerHTML='<img src="'+p.img+'" style="width:100%;height:100%;object-fit:cover">';imgPrev._data=p.img;}
  else{imgPrev.innerHTML='📷';imgPrev._data=null;}
  const docPrev=document.getElementById('proj-doc-preview');
  docPrev._data=null;docPrev._name=null;
  if(p.docName){const icon=p.docName.endsWith('.pptx')?'📊':'📄';docPrev.innerHTML=icon;document.getElementById('proj-doc-name').textContent=p.docName;}
  else{docPrev.innerHTML='📎';document.getElementById('proj-doc-name').textContent='.docx oder .pptx · max 10MB';}
  document.getElementById('proj-add-overlay').classList.add('open');
}
function closeAddProj(){document.getElementById('proj-add-overlay').classList.remove('open');}
function previewProjImg(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    openCropModal(e.target.result,'square',(croppedData)=>{
      const prev=document.getElementById('proj-img-preview');
      prev.innerHTML='<img src="'+croppedData+'" style="width:100%;height:100%;object-fit:cover">';
      prev._data=croppedData;
    });
  };
  reader.readAsDataURL(file);
}
function previewProjDoc(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('proj-doc-preview');
    const icon=file.name.endsWith('.pptx')?'📊':'📄';
    prev.innerHTML=icon; prev._data=e.target.result; prev._name=file.name;
    document.getElementById('proj-doc-name').textContent=file.name;
  };
  reader.readAsDataURL(file);
}
async function submitAddProj(){
  const title=document.getElementById('proj-title').value.trim();
  if(!title) return toast('❌ Titel ist Pflicht');
  const desc=document.getElementById('proj-desc').value.trim();
  const link=document.getElementById('proj-link').value.trim();
  const imgPrev=document.getElementById('proj-img-preview');
  const docPrev=document.getElementById('proj-doc-preview');
  const imageData=imgPrev._data||null;
  const docData=docPrev._data||null;
  const docName=docPrev._name||null;
  const btn=document.getElementById('proj-submit-btn');
  btn.disabled=true; btn.textContent='⏳...';
  try{
    const endpoint=_editMode?'/api/update-project':'/api/add-project';
    const body={title,description:desc,link,imageData,docData,docName};
    if(_editMode) body.projectId=_editProjId;
    const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json();
    if(data.ok){toast(_editMode?'✅ Aktualisiert!':'✅ Projekt gespeichert!');setTimeout(()=>location.reload(),200);}
    else{toast('❌ '+(data.error||'Fehler'));btn.disabled=false;btn.textContent=_editMode?'💾 Aktualisieren':'✅ Projekt speichern';}
  }catch(e){toast('❌ Fehler');btn.disabled=false;btn.textContent=_editMode?'💾 Aktualisieren':'✅ Projekt speichern';}
}
async function deleteProj(projectId){
  if(!confirm('Projekt löschen?')) return;
  closeProjDetail();
  const res=await fetch('/api/delete-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId})});
  const data=await res.json();
  if(data.ok){toast('✅ Gelöscht');setTimeout(()=>location.reload(),150);}
  else toast('❌ Fehler');
}
(async()=>{try{const r=await fetch('/api/notifications/count');const d=await r.json();const b=document.getElementById('notif-badge-profil');if(b&&d.count>0){b.textContent=d.count>9?'9+':d.count;b.style.display='flex';}}catch(e){}})();
async function deletePost(timestamp){
  if(!confirm('Post löschen?')) return;
  const res=await fetch('/api/delete-post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp})});
  const data=await res.json();
  if(data.ok){toast('✅ Gelöscht');setTimeout(()=>location.reload(),150);}
  else toast('❌ Fehler');
}
async function submitPost(){const _spBtn=document.querySelector('[onclick="submitPost()"]');if(_spBtn){_spBtn.disabled=true;_spBtn.style.opacity='0.6';}
  const text=document.getElementById('new-post').value.trim();
  if(!text) return toast('❌ Text erforderlich');
  const btn=document.querySelector('[onclick="submitPost()"]');
  btn.disabled=true; btn.textContent='⏳...';
  const res=await fetch('/api/post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
  const data=await res.json();
  if(data.ok){toast('✅ Post veröffentlicht!');setTimeout(()=>location.reload(),250);}
  else{toast('❌ '+(data.error||'Fehler'));btn.disabled=false;btn.textContent='📝 Posten';}
}
(async function loadMissionWidget(){
  const w=document.getElementById('mission-widget');
  if(!w)return;
  try{
    const r=await fetch('/api/mission-status');
    const d=await r.json();
    if(!d.ok){w.innerHTML='';return;}
    const now=new Date();
    const nextSettle=new Date();
    nextSettle.setHours(12,0,0,0);
    if(now>=nextSettle)nextSettle.setDate(nextSettle.getDate()+1);
    const diff=nextSettle-now;
    const hh=Math.floor(diff/3600000);const mm=Math.floor((diff%3600000)/60000);
    const settleStr=hh+'h '+mm+'m';
    const {daily,weekly}=d;
    const bar=(val,max,col)=>'<div style="background:var(--bg4);border-radius:4px;height:5px;overflow:hidden;margin-top:4px"><div style="height:100%;width:'+Math.min(100,Math.round(val/max*100))+'%;background:'+col+';border-radius:4px;transition:width .5s ease"></div></div>';
    const mChip=(done,label)=>'<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:'+(done?'#22c55e':'var(--muted)')+'">'+
      '<span style="font-size:14px">'+(done?'✅':'⬜')+'</span>'+label+'</div>';
    w.innerHTML='<div style="background:linear-gradient(135deg,rgba(167,139,250,.1),rgba(124,58,237,.07));border:1px solid rgba(167,139,250,.25);border-radius:14px;padding:14px 16px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      +'<div style="font-size:13px;font-weight:700">🎯 Meine Missionen</div>'
      +'<div style="font-size:10px;color:var(--muted);background:var(--bg4);padding:3px 8px;border-radius:8px">⏱ Abrechnung in '+settleStr+'</div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">'
      +'<div style="background:var(--bg3);border-radius:10px;padding:10px 12px">'
      +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Heute</div>'
      +mChip(daily.m1,'M1: '+daily.likesGegeben+'/5 geliked')
      +bar(daily.likesGegeben,5,'#a78bfa')
      +'<div style="margin-top:6px">'+mChip(daily.m2,'M2: '+daily.prozent+'% (≥80%)')+'</div>'
      +bar(daily.prozent,100,'#818cf8')
      +'<div style="margin-top:6px">'+mChip(daily.m3,'M3: '+(daily.gesamtLinks>0?daily.gelikedLinks+'/'+daily.gesamtLinks+' alle':'–'))+'</div>'
      +(daily.m3?'<div style="font-size:10px;color:#a78bfa;margin-top:4px">+5 XP + 💎 1 Diamant bei Abrechnung</div>':'')
      +'</div>'
      +'<div style="background:var(--bg3);border-radius:10px;padding:10px 12px">'
      +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Wöchentlich</div>'
      +mChip(weekly.m1Tage>=7,'W-M1: '+weekly.m1Tage+'/7 Tage')
      +bar(weekly.m1Tage,7,'#60a5fa')
      +'<div style="margin-top:6px">'+mChip(weekly.m2Tage>=7,'W-M2: '+weekly.m2Tage+'/7 → 💎')+'</div>'
      +bar(weekly.m2Tage,7,'#34d399')
      +'<div style="margin-top:6px">'+mChip(weekly.m3Tage>=7,'W-M3: '+weekly.m3Tage+'/7 → 💎💎')+'</div>'
      +bar(weekly.m3Tage,7,'#fbbf24')
      +'</div>'
      +'</div>'
      +'</div>';
  }catch(e){const w2=document.getElementById('mission-widget');if(w2)w2.innerHTML='';}
})();
</script>`, 'profile');
    }

    // ── FREMDES PROFIL ──
    if (path.startsWith('/profil/')) {
        const uid = path.replace('/profil/','');
        const u = d.users[uid];
        if (!u) return redirect('/feed');
        const isFollowing = (d.users[myUid]?.following||[]).map(String).includes(String(uid));
        const theirProjects = u.projects || [];
        const theirPosts = (d.posts||{})[uid] || [];
        const theirPinnedLink = ladePinnedLink(uid);
        const theirPinnedHtml = theirPinnedLink
            ? '<div style="padding:12px 16px;border-bottom:2px solid var(--accent);background:linear-gradient(135deg,rgba(255,107,107,.08),rgba(255,165,0,.04));margin-bottom:4px">'
              +'<span style="font-size:11px;font-weight:700;color:var(--accent);background:rgba(255,107,107,.15);padding:3px 10px;border-radius:20px;display:inline-block;margin-bottom:8px">📌 Wichtigster Post</span>'
              +'<a href="'+theirPinnedLink+'" target="_blank" style="display:block;font-size:13px;color:var(--blue);word-break:break-all">'+theirPinnedLink.replace('https://www.instagram.com/','ig.com/')+'</a>'
              +'</div>'
            : '';

        const theirPostsHtml = theirPosts.length
            ? theirPosts.slice().reverse().map(p=>{
                let attachHtml='';
                if(p.attachment&&p.attachmentType==='image') attachHtml='<img src="'+p.attachment+'" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-top:8px" alt="">';
                if(p.attachment&&p.attachmentType==='audio') attachHtml='<audio controls src="'+p.attachment+'" style="width:100%;margin-top:8px"></audio>';
                return '<div style="padding:12px 16px;border-top:1px solid var(--border2)">'
                    +'<div style="font-size:13px;line-height:1.6">'+p.text+'</div>'
                    +attachHtml
                    +'<div style="font-size:11px;color:var(--muted);margin-top:6px">'+new Date(p.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})+'</div>'
                    +'</div>';
            }).join('')
            : '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Noch keine Posts</div></div>';

        const theirProjCardsHtml = theirProjects.map((proj, i) => {
            const projImg = ladeProjectBild(uid, proj.id);
            const docIcon = proj.docName ? (proj.docName.endsWith('.pptx')?'📊':'📄') : null;
            return '<div class="proj-card" onclick="openTProjDetail('+i+')">'
                +(projImg?'<img class="proj-card-img" src="'+projImg+'" alt="">':'<div class="proj-card-placeholder">'+(docIcon||'🚀')+'</div>')
                +'<div class="proj-card-body">'
                +'<div class="proj-card-title">'+proj.title+'</div>'
                +(proj.description?'<div class="proj-card-desc">'+proj.description+'</div>':'')
                +'</div></div>';
        }).join('');

        const theirLinksHtml = Object.values(d.links||{}).filter(l=>l.user_id===Number(uid)).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))
            .map(l=>'<div style="padding:12px 16px;border-top:1px solid var(--border2)"><a href="'+l.text+'" target="_blank" style="color:var(--blue);font-size:12px;word-break:break-all">'+l.text+'</a><div style="font-size:11px;color:var(--muted);margin-top:4px">❤️ '+(Array.isArray(l.likes)?l.likes.length:0)+' Likes · '+new Date(l.timestamp).toLocaleDateString('de-DE')+'</div></div>').join('')
            || '<div class="empty"><div class="empty-icon">🔗</div><div class="empty-text">Noch keine Links</div></div>';

        const theirAboutHtml = '<div style="padding:16px;display:flex;flex-direction:column;gap:12px;padding-bottom:100px">'
            +(u?.bio?'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Bio</div><div style="font-size:14px;line-height:1.6">'+u.bio+'</div></div>':'')
            +(u?.nische?'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Nische</div><div style="font-size:14px;color:var(--accent)">🎯 '+u.nische+'</div></div>':'')
            +'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">'
            +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Social &amp; Links</div>'
            +(u?.instagram?'<a href="https://instagram.com/'+u.instagram+'" target="_blank" style="display:flex;align-items:center;gap:10px;text-decoration:none"><span style="font-size:20px">📸</span><span style="color:var(--blue);font-size:14px">@'+u.instagram+'</span></a>':'<div style="font-size:13px;color:var(--muted)">Kein Instagram verknüpft</div>')
            +(u?.website?'<a href="'+u.website+'" target="_blank" style="display:flex;align-items:center;gap:10px;text-decoration:none"><span style="font-size:20px">🔗</span><span style="color:var(--blue);font-size:14px">'+u.website.replace('https://','').replace('http://','').slice(0,40)+'</span></a>':'')
            +'</div>'
            +'<div style="background:var(--bg3);border-radius:14px;padding:14px 16px">'
            +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Status</div>'
            +'<div style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;background:'+badgeGradient(u?.role)+';color:#fff;font-size:12px;font-weight:700">'+(u?.role||'🆕 New')+'</div>'
            +(u?.trophies&&u.trophies.length?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'+u.trophies.map(t=>'<span style="font-size:22px;background:var(--bg4);border-radius:8px;padding:4px 8px">'+t+'</span>').join('')+'</div>':'')
            +'</div></div>';

        const theirProjDataJson = JSON.stringify(theirProjects.map(p => ({
            id: p.id, title: p.title, description: p.description||'', link: p.link||'',
            img: ladeProjectBild(uid, p.id) || '', docName: p.docName||''
        })));

        return html(`
<div class="topbar">
  <a href="javascript:history.back()" class="icon-btn" style="font-size:22px">‹</a>
  <div style="font-size:15px;font-weight:600">${u.spitzname||u.name||'User'}</div>
  <div style="display:flex;gap:8px">
    <button onclick="toggleFollow('${uid}',this)" style="background:${isFollowing?'var(--bg4)':'var(--accent)'};color:${isFollowing?'var(--muted)':'#fff'};border:1px solid var(--border);border-radius:20px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer">${isFollowing?'Gefolgt':'Folgen'}</button>
    <a href="/nachrichten/${uid}" style="background:var(--bg4);border:1px solid var(--border);border-radius:20px;padding:6px 14px;font-size:13px;font-weight:600;color:var(--text);text-decoration:none">💬</a>
  </div>
</div>
${profileCard(uid, u, d, false, lang, adminIds)}
<div class="tabs" style="position:sticky;top:57px;z-index:50;background:var(--bg)">
  <div class="tab active" onclick="showTPTab('posts',this)">📝 Posts</div>
  <div class="tab" onclick="showTPTab('links',this)">🔗 Links</div>
  <div class="tab" onclick="showTPTab('projekte',this)">🗂️ Projekte</div>
  <div class="tab" onclick="showTPTab('about',this)">👤 About</div>
</div>
<div id="tptab-posts" style="padding-bottom:100px">${theirPinnedHtml}${theirPostsHtml}</div>
<div id="tptab-projekte" style="display:none;padding-bottom:100px">
  ${theirProjects.length>0?'<div class="proj-grid">'+theirProjCardsHtml+'</div>':'<div class="empty"><div class="empty-icon">🚀</div><div class="empty-text">Noch keine Projekte</div></div>'}
</div>
<div id="tptab-links" style="display:none;padding-bottom:100px">${theirLinksHtml}</div>
<div id="tptab-about" style="display:none">${theirAboutHtml}</div>

<div id="tproj-detail-modal" class="proj-modal-overlay" onclick="if(event.target===this)closeTProj()">
  <div class="proj-modal-sheet">
    <div style="padding:20px 20px 8px;display:flex;justify-content:space-between;align-items:center">
      <div id="tproj-title" style="font-family:var(--font-display);font-size:18px;font-weight:700"></div>
      <button onclick="closeTProj()" style="background:var(--bg4);border:none;color:var(--muted);width:32px;height:32px;border-radius:50%;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer">×</button>
    </div>
    <div id="tproj-img-wrap"></div>
    <div style="padding:12px 20px 32px">
      <div id="tproj-desc" style="font-size:14px;color:var(--muted);line-height:1.6"></div>
      <div id="tproj-link" style="margin-top:10px"></div>
      <div id="tproj-doc" style="margin-top:10px"></div>
    </div>
  </div>
</div>
<script>
const TPROJECTS=${theirProjDataJson};
const _TUID='${uid}';
function showTPTab(tab,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['posts','projekte','links','about'].forEach(t=>{const e=document.getElementById('tptab-'+t);if(e)e.style.display=t===tab?'block':'none';});
}
function openTProjDetail(idx){
  const p=TPROJECTS[idx]; if(!p) return;
  document.getElementById('tproj-title').textContent=p.title;
  document.getElementById('tproj-img-wrap').innerHTML=p.img?'<img src="'+p.img+'" style="width:100%;object-fit:contain;display:block;background:#0a0a0a" alt="">':'';
  document.getElementById('tproj-desc').textContent=p.description||'';
  document.getElementById('tproj-link').innerHTML=p.link?'<a href="'+p.link+'" target="_blank" style="color:var(--blue);font-size:13px;word-break:break-all">🔗 '+p.link+'</a>':'';
  const docEl=document.getElementById('tproj-doc');
  if(p.docName){const icon=p.docName.endsWith('.pptx')?'📊':'📄';docEl.innerHTML='<a href="/api/download-project-doc/'+_TUID+'/'+p.id+'" style="display:inline-flex;align-items:center;gap:8px;background:var(--bg4);border:1px solid var(--border);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--text);text-decoration:none">'+icon+' '+p.docName+' herunterladen</a>';}
  else docEl.innerHTML='';
  document.getElementById('tproj-detail-modal').classList.add('open');
}
function closeTProj(){document.getElementById('tproj-detail-modal').classList.remove('open');}
async function toggleFollow(uid,btn){
  const isFollowing=btn.textContent.trim()==='Gefolgt';
  btn.textContent=isFollowing?'Folgen':'Gefolgt';
  btn.style.background=isFollowing?'var(--accent)':'var(--bg4)';
  btn.style.color=isFollowing?'#fff':'var(--muted)';
  await fetch('/api/follow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid})});
  toast(isFollowing?'Nicht mehr gefolgt':'✅ Gefolgt!');
}
</script>`, 'feed');
    }

    // ── EINSTELLUNGEN ──
    if (path === '/einstellungen') {
        const u = myUser || {};
        const myInventory = u.inventory || [];
        const myActiveRing = u.activeRing || null;
        const currentPinnedLink = ladePinnedLink(myUid) || '';
        const myRecentLinks = Object.values(d.links||{})
            .filter(l=>String(l.user_id)===String(myUid)&&l.text&&l.text.includes('instagram.com'))
            .sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))
            .slice(0,5)
            .map(l=>l.text);
        const gradients = [
            'linear-gradient(135deg,#667eea,#764ba2)',
            'linear-gradient(135deg,#f093fb,#f5576c)',
            'linear-gradient(135deg,#4facfe,#00f2fe)',
            'linear-gradient(135deg,#43e97b,#38f9d7)',
            'linear-gradient(135deg,#fa709a,#fee140)',
            'linear-gradient(135deg,#a18cd1,#fbc2eb)',
            'linear-gradient(135deg,#ffecd2,#fcb69f)',
            'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
            'linear-gradient(135deg,#d4fc79,#96e6a1)',
        ];
        const accentColors = ['#ff6b6b','#ffa500','#00c851','#4dabf7','#cc5de8','#ffd43b','#ff8cc8','#20c997','#ff6348'];
        return html(`
<div class="topbar">
  <a href="/profil" class="icon-btn" style="font-size:22px">‹</a>
  <div style="font-size:15px;font-weight:600">Einstellungen</div>
  <div style="width:36px"></div>
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Profilbild</div>
  <div style="display:flex;align-items:center;gap:16px;margin-top:8px">
    <div style="width:72px;height:72px;border-radius:50%;overflow:hidden;background:var(--bg4);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700" id="pic-preview">
      ${myUser?.instagram ? `<img src="https://unavatar.io/instagram/${myUser.instagram}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" alt="">` : (myUser?.name||'?').slice(0,2).toUpperCase()}
    </div>
    <div style="flex:1">
      <label style="display:inline-flex;align-items:center;gap:8px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;cursor:pointer;font-size:13px">
        📷 Foto hochladen
        <input type="file" accept="image/*" style="display:none" onchange="uploadProfilePic(this)">
      </label>
    </div>
  </div>
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Bio</div>
  <textarea class="form-input" id="inp-bio" placeholder="Schreib etwas über dich..." maxlength="100">${u.bio||''}</textarea>
  <div class="form-hint">${u.bio?.length||0}/100</div>
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Spitzname</div>
  <input type="text" class="form-input" id="inp-spitzname" placeholder="Dein Spitzname" maxlength="30" value="${u.spitzname||''}">
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Instagram</div>
  <div style="position:relative">
    <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px;pointer-events:none">@</span>
    <input type="text" class="form-input" id="inp-instagram" placeholder="dein.instagram" maxlength="50" value="${(u.instagram||'').replace(/^@/,'')}" style="padding-left:30px" autocapitalize="none" spellcheck="false">
  </div>
  <div class="form-hint">Wird als Profilbild & Verlinkung genutzt</div>
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Nische</div>
  <input type="text" class="form-input" id="inp-nische" placeholder="z.B. Fitness, Food, Travel..." maxlength="50" value="${u.nische||''}">
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Persönlicher Link</div>
  <input type="url" class="form-input" id="inp-website" placeholder="https://deine-website.de" maxlength="100" value="${u.website||''}">
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">📌 Pinned Reel Link</div>
  <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Dieser Reel wird auf der Explore-Seite bei deiner Creator-Karte angezeigt.</div>
  <input type="url" class="form-input" id="inp-pinned-link" placeholder="https://www.instagram.com/reel/..." value="${currentPinnedLink}">
  ${myRecentLinks.length ? `
  <div style="margin-top:8px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Letzte Links:</div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${myRecentLinks.map(l=>`<button onclick="document.getElementById('inp-pinned-link').value='${l.replace(/'/g,"\\'")}" style="background:var(--bg4);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:5px 10px;font-size:11px;text-align:left;cursor:pointer;font-family:var(--font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.replace('https://www.instagram.com/','ig.com/')}</button>`).join('')}
    </div>
  </div>` : ''}
  <button class="btn btn-outline btn-full" style="margin-top:10px;font-size:13px" onclick="savePinnedLink()">📌 Reel anpinnen</button>
  ${currentPinnedLink ? `<button onclick="removePinnedLink()" style="background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;margin-top:6px;display:block">🗑️ Pin entfernen</button>` : ''}
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Banner</div>
  <div style="margin-bottom:12px">
    <label style="display:flex;align-items:center;gap:10px;background:var(--bg4);border:1px dashed var(--border);border-radius:var(--radius-sm);padding:12px;cursor:pointer;font-size:13px;font-weight:500">
      <span style="font-size:20px">📷</span><span>Eigenes Foto hochladen</span>
      <input type="file" accept="image/*" style="display:none" onchange="uploadBanner(this)">
    </label>
  </div>
  <div class="gradient-grid">
    ${gradients.map((g)=>`<div class="gradient-opt ${(u.banner||gradients[0])===g?'selected':''}" style="background:${g}" onclick="selectBanner('${g}',this)"></div>`).join('')}
  </div>
  ${(() => {
      const ownedBanners = BANNER_ITEMS.filter(b => myInventory.includes(b.id));
      if (!ownedBanners.length) return `<div style="font-size:11px;color:var(--muted);margin-top:10px">🛍️ Premium-Banner im Shop kaufen — je 💎 1 Diamant</div>`;
      return `<div style="margin-top:12px"><div style="font-size:11px;color:var(--muted);margin-bottom:6px">🛍️ Gekaufte Premium-Banner</div><div class="gradient-grid">${ownedBanners.map(b=>`<div class="gradient-opt ${(u.banner||'')===b.gradient?'selected':''}" style="background:${b.gradient}" title="${b.name}" onclick="selectBanner('${b.gradient}',this)"></div>`).join('')}</div></div>`;
  })()}
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Akzentfarbe</div>
  <div class="color-grid">
    ${accentColors.map(c=>`<div class="color-opt ${(u.accentColor||'#ff6b6b')===c?'selected':''}" style="background:${c}" onclick="selectAccent('${c}',this)">${(u.accentColor||'#ff6b6b')===c?'✓':''}</div>`).join('')}
  </div>
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="setting-row" style="padding:0">
    <div><div class="setting-label">Dark Mode</div></div>
    <button class="toggle ${(session?.theme||'light')==='dark'?'on':''}" id="theme-toggle" onclick="toggleTheme(this)"></button>
  </div>
</div>
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <button class="btn btn-primary btn-full" onclick="saveProfile()">💾 Speichern</button>
</div>
${myInventory.length > 0 ? `
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">🎒 Meine Items</div>
  <div style="display:flex;flex-direction:column;gap:10px">
    ${RING_ITEMS.filter(r=>myInventory.includes(r.id)).map(item=>{
        const isActive = myActiveRing === item.id;
        return `<div style="background:var(--bg3);border:1px solid ${isActive?'rgba(167,139,250,.5)':'var(--border2)'};border-radius:14px;padding:12px;display:flex;align-items:center;gap:12px">
      <div style="width:44px;height:44px;border-radius:50%;background:${item.gradient};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px">${item.emoji}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">${item.name} ${isActive?'<span style="font-size:10px;color:#a78bfa;font-weight:600">● Aktiv</span>':''}</div>
        <div style="font-size:11px;color:var(--muted)">${item.desc}</div>
      </div>
      <button onclick="setRing('${isActive?'':item.id}')" style="background:${isActive?'rgba(167,139,250,.2)':'var(--bg4)'};border:1px solid ${isActive?'rgba(167,139,250,.4)':'var(--border)'};color:${isActive?'#a78bfa':'var(--text)'};border-radius:10px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">${isActive?'Deaktivieren':'Aktivieren'}</button>
    </div>`;
    }).join('')}
  </div>
</div>` : ''}
${adminIds.includes(Number(myUid)) ? `
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">⚙️ Admin Tools</div>
  <a href="/onboarding-preview" class="btn btn-outline btn-full" style="margin-bottom:8px;display:flex">👀 Onboarding Vorschau</a>
  <button onclick="createFeThread(this)" class="btn btn-outline btn-full" style="margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px">⭐ Full Engagement Thread erstellen</button>
  <button onclick="announceFeThread(this)" class="btn btn-outline btn-full" style="margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px">📢 Ankündigung in FE-Thread senden</button>
  <div id="fethread-result" style="display:none;font-size:12px;padding:8px;border-radius:8px;margin-top:4px"></div>
</div>` : ''}
<div style="padding:16px">
  <a href="/logout" class="btn btn-outline btn-full" style="color:var(--accent)">🚪 Ausloggen</a>
</div>
<script>
async function createFeThread(btn){
  btn.disabled=true;btn.textContent='⏳ Erstelle Thread...';
  const r=document.getElementById('fethread-result');
  try{
    const res=await fetch('/api/admin/create-fethread',{method:'POST'});
    const data=await res.json();
    r.style.display='block';
    if(data.ok){r.style.background='rgba(34,197,94,.15)';r.style.color='#22c55e';r.textContent='✅ Thread erstellt! ID: '+data.threadId;}
    else{r.style.background='rgba(239,68,68,.15)';r.style.color='#ef4444';r.textContent='❌ '+data.error;}
  }catch(e){r.style.display='block';r.style.color='#ef4444';r.textContent='❌ '+e.message;}
  btn.disabled=false;btn.textContent='⭐ Full Engagement Thread erstellen';
}
async function announceFeThread(btn){
  btn.disabled=true;btn.textContent='⏳ Sende...';
  const r=document.getElementById('fethread-result');
  try{
    const res=await fetch('/api/admin/announce-fethread',{method:'POST'});
    const data=await res.json();
    r.style.display='block';
    if(data.ok){r.style.background='rgba(34,197,94,.15)';r.style.color='#22c55e';r.textContent='✅ Ankündigung gesendet!';}
    else{r.style.background='rgba(239,68,68,.15)';r.style.color='#ef4444';r.textContent='❌ '+data.error;}
  }catch(e){r.style.display='block';r.style.color='#ef4444';r.textContent='❌ '+e.message;}
  btn.disabled=false;btn.textContent='📢 Ankündigung in FE-Thread senden';
}
let selectedBanner = ${JSON.stringify(u.banner||gradients[0])};
let selectedAccent = ${JSON.stringify(accentColors.includes(u.accentColor) ? u.accentColor : '#ff6b6b')};
function selectBanner(val, el) {
    document.querySelectorAll('.gradient-opt').forEach(e=>e.classList.remove('selected'));
    el.classList.add('selected');
    selectedBanner = val;
}
function selectAccent(val, el) {
    document.querySelectorAll('.color-opt').forEach(e=>{e.classList.remove('selected');e.textContent='';});
    el.classList.add('selected');
    el.textContent='✓';
    selectedAccent = val;
    document.documentElement.style.setProperty('--accent', val);
}
function toggleTheme(btn) {
    const isDark = btn.classList.toggle('on');
    setTheme(isDark?'dark':'light');
}
async function uploadProfilePic(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        openCropModal(e.target.result, 'circle', async (croppedData) => {
            try {
                const res = await fetch('/api/upload-profilepic', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData:croppedData})});
                const data = await res.json();
                if (data.ok) { document.getElementById('pic-preview').innerHTML = '<img src="'+croppedData+'" style="width:100%;height:100%;object-fit:cover" alt="">'; toast('✅ Profilbild gesetzt!'); }
                else toast('❌ ' + (data.error||'Fehler'));
            } catch(e) { toast('❌ Upload Fehler'); }
        });
    };
    reader.readAsDataURL(file);
}
async function uploadBanner(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        openCropModal(e.target.result, 'banner', async (croppedData) => {
            try {
                const res = await fetch('/api/upload-banner', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData:croppedData})});
                const data = await res.json();
                if (data.ok) { toast('✅ Banner gespeichert!'); setTimeout(()=>location.href='/profil',1000); }
                else toast('❌ ' + (data.error||'Fehler'));
            } catch(e) { toast('❌ Upload Fehler'); }
        });
    };
    reader.readAsDataURL(file);
}
async function saveProfile() {
    const bio = document.getElementById('inp-bio')?.value || '';
    const spitzname = document.getElementById('inp-spitzname')?.value || '';
    const themeToggle = document.getElementById('theme-toggle');
    const theme = themeToggle?.classList.contains('on') ? 'dark' : 'light';
    const btn = document.querySelector('[onclick="saveProfile()"]');
    if(btn) { btn.textContent = '⏳ Speichern...'; btn.disabled = true; }
    try {
        const nische = document.getElementById('inp-nische')?.value?.trim()||'';
        const website = document.getElementById('inp-website')?.value?.trim()||'';
        const instagram = (document.getElementById('inp-instagram')?.value||'').replace(/^@/,'').trim();
        const payload = {bio, spitzname, accentColor: selectedAccent, theme, nische, website, instagram};
        if (selectedBanner) payload.banner = selectedBanner;
        const res = await fetch('/api/save-profile', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data = await res.json();
        if(data.ok) { toast('✅ Gespeichert!'); setTimeout(()=>location.reload(), 300); }
        else { toast('❌ Fehler: ' + (data.error||'Unbekannt')); }
    } catch(e) { toast('❌ Netzwerkfehler'); }
    if(btn) { btn.textContent = '💾 Speichern'; btn.disabled = false; }
}
document.getElementById('inp-bio').addEventListener('input', function() {
    this.nextElementSibling.textContent = this.value.length + '/100';
});
async function savePinnedLink() {
    const url = document.getElementById('inp-pinned-link')?.value?.trim() || '';
    if (url && !url.includes('instagram.com')) { toast('❌ Nur Instagram Links erlaubt'); return; }
    const res = await fetch('/api/set-pinned-link', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const data = await res.json();
    if (data.ok) { toast(url ? '📌 Reel angepeint!' : '🗑️ Pin entfernt!'); setTimeout(()=>location.reload(),250); }
    else toast('❌ ' + (data.error||'Fehler'));
}
async function removePinnedLink() {
    document.getElementById('inp-pinned-link').value = '';
    await savePinnedLink();
}
async function setRing(ringId) {
    const res = await fetch('/api/set-active-ring', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ringId:ringId||null})});
    const data = await res.json();
    if (data.ok) { toast(ringId ? '🪄 Ring aktiviert!' : '🔘 Ring deaktiviert'); }
    else toast('❌ ' + (data.error||'Fehler'));
}
</script>`, 'settings');
    }

    if (path === '/api/send-group-message' && req.method === 'POST') {
        const body = await parseBody(req);
        const { text } = body;
        if (!text?.trim()) return json({ ok: false });
        const ok = await postBot('/send-group-message', { uid: myUid, text });
        return json({ ok: !!ok });
    }

    if (path === '/api/telegram-feed') {
        const data = await fetchBot('/telegram-feed');
        if (!data) return json({ messages: [] });
        return json(data);
    }

    if (path === '/api/forum-topics') {
        const data = await fetchBot('/forum-topics');
        if (!data) return json({ threads: [] });
        return json(data);
    }

    if (path.startsWith('/api/thread-messages/')) {
        const threadId = path.split('/api/thread-messages/')[1];
        const data = await fetchBot('/thread-messages/' + encodeURIComponent(threadId));
        if (!data) return json({ messages: [] });
        return json(data);
    }

    if (path === '/api/send-thread-message' && req.method === 'POST') {
        const body = await parseBody(req);
        const { text, thread_id, replyTo } = body;
        if (!text?.trim()) return json({ ok: false });
        const ok = await postBot('/send-thread-message', { uid: myUid, text, thread_id, replyTo: replyTo||null });
        return json(ok || { ok: false });
    }

    if (path === '/api/react-thread-msg' && req.method === 'POST') {
        const body = await parseBody(req);
        const { threadId, timestamp, emoji } = body;
        if (!threadId || !timestamp || !emoji) return json({ok:false});
        const result = await postBot('/react-thread-msg-api', { threadId, timestamp: Number(timestamp), emoji, uid: myUid });
        return json(result || {ok:false});
    }
    // DM-Reaktionen — frontend (chat-detail-render) ruft das, vorher fehlte der Endpoint komplett.
    if (path === '/api/react-message' && req.method === 'POST') {
        if (!session) return json({ok:false}, 401);
        const body = await parseBody(req);
        const { chatKey, timestamp, emoji } = body;
        if (!chatKey || !timestamp || !emoji) return json({ok:false});
        const result = await postBot('/react-dm-msg-api', { chatKey, timestamp: Number(timestamp), emoji, uid: myUid });
        return json(result || {ok:false});
    }

    if (path === '/api/admin/create-fethread' && req.method === 'POST') {
        if (!session) return json({ok:false, error:'Nicht eingeloggt'}, 401);
        const botData = await fetchBot('/data');
        const isAdminUser = botData && String(botData.users?.[myUid]?.role||'').includes('Admin');
        if (!isAdminUser) return json({ok:false, error:'Kein Admin'}, 403);
        const result = await postBot('/fethread-setup-api', {});
        return json(result || {ok:false, error:'Bot nicht erreichbar'});
    }

    if (path === '/api/admin/announce-fethread' && req.method === 'POST') {
        if (!session) return json({ok:false, error:'Nicht eingeloggt'}, 401);
        const botData = await fetchBot('/data');
        const isAdminUser = botData && String(botData.users?.[myUid]?.role||'').includes('Admin');
        if (!isAdminUser) return json({ok:false, error:'Kein Admin'}, 403);
        const result = await postBot('/fethread-announce-api', {});
        return json(result || {ok:false, error:'Bot nicht erreichbar'});
    }

    if (path === '/api/buy-extralink' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'},401);
        const result = await postBot('/buy-extralink-api', { uid: myUid });
        return json(result || {ok:false, error:'Fehler'});
    }

    if (path === '/api/link-status' && req.method === 'GET') {
        if (!session) return json({ok:false, error:'Nicht eingeloggt'},401);
        const result = await fetchBot('/link-status-api?uid=' + myUid);
        return json(result || {ok:false, canPost:false, todayCount:0, bonusLinks:0});
    }

    if (path === '/api/mission-status' && req.method === 'GET') {
        if (!session) return json({ok:false, error:'Nicht eingeloggt'},401);
        const result = await fetchBot('/mission-status-api?uid=' + myUid);
        return json(result || {ok:false});
    }

    if (path === '/api/buy-item' && req.method === 'POST') {
        const body = await parseBody(req);
        const { itemId } = body;
        if (!itemId || !RING_ITEMS.find(r=>r.id===itemId)) return json({ok:false, error:'Unbekanntes Item'});
        const result = await postBot('/buy-item-api', { uid: myUid, itemId });
        return json(result || {ok:false, error:'Fehler'});
    }

    if (path === '/api/set-active-ring' && req.method === 'POST') {
        const body = await parseBody(req);
        const { ringId } = body;
        const result = await postBot('/set-active-ring-api', { uid: myUid, ringId: ringId || null });
        return json(result || {ok:false, error:'Fehler'});
    }

    if (path === '/api/create-thread' && req.method === 'POST') {
        const body = await parseBody(req);
        const { name, emoji } = body;
        if (!name?.trim()) return json({ ok: false, error: 'Kein Name' });
        const ok = await postBot('/create-thread', { uid: myUid, name, emoji });
        return json(ok || { ok: false });
    }

    if (path.startsWith('/api/tg-file/')) {
        const fileId = path.split('/api/tg-file/')[1];
        const botUrl = MAINBOT_URL + '/tg-file/' + encodeURIComponent(fileId);
        return new Promise((resolve) => {
            const lib = botUrl.startsWith('https') ? require('https') : require('http');
            lib.get(botUrl, { headers: { 'x-bridge-secret': BRIDGE_SECRET } }, (bres) => {
                res.writeHead(bres.statusCode, { 'Content-Type': bres.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public,max-age=86400' });
                bres.pipe(res);
                resolve();
            }).on('error', () => { res.writeHead(404); res.end(); resolve(); });
        });
    }

    if (path === '/api/rename-thread' && req.method === 'POST') {
        const body = await parseBody(req);
        const { thread_id, name } = body;
        if (!name?.trim() || !thread_id) return json({ ok: false });
        const ok = await postBot('/rename-thread', { uid: myUid, thread_id, name: name.trim() });
        return json(ok || { ok: false });
    }

    if (path === '/api/mark-read' && req.method === 'POST') {
        const body = await parseBody(req);
        const { thread_id } = body;
        if (thread_id) await postBot('/mark-read', { uid: myUid, thread_id });
        return json({ ok: true });
    }

    if (path === '/api/track-login' && req.method === 'POST') {
        if (myUid) await postBot('/track-login', { uid: myUid });
        return json({ ok: true });
    }

    if (path === '/api/forum-debug') {
        const data = await fetchBot('/forum-debug');
        return json(data || { error: 'Bot nicht erreichbar' });
    }

    if (path === '/api/superlinks') {
        const data = await fetchBot('/superlinks');
        if (!data) return json({ superlinks: [] });
        return json(data);
    }

    if (path === '/api/like-superlink' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const body = await parseBody(req);
        const { slId } = body;
        if (!slId) return json({ok:false});
        const result = await postBot('/like-superlink-api', { uid: myUid, slId });
        return json(result || {ok:false});
    }

    if (path === '/api/post-superlink' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const body = await parseBody(req);
        const { url, caption } = body;
        if (!url) return json({ok:false, error:'URL fehlt'});
        const result = await postBot('/post-superlink-api', { uid: myUid, url, caption: caption||'' });
        return json(result || {ok:false});
    }

    if (path === '/api/report-nonengager' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const body = await parseBody(req);
        const { likerUid, slId } = body;
        if (!likerUid || !slId) return json({ok:false});
        const result = await postBot('/report-nonengager-api', { reporterUid: myUid, likerUid, slId });
        return json(result || {ok:false});
    }

    redirect('/feed');
}

// Export all images as JSON (for migration)
const EXPORT_PATH = '/export-images';
// handled in request handler above via url routing - add inline:

server.listen(PORT, async () => {
    console.log('🌐 CreatorX App läuft auf Port ' + PORT);
    // Pre-warm data cache
    refreshDataCache().then(() => console.log('✅ Data cache vorgewärmt'));
    // Auto-migrate images from Northflank if none exist locally
    const NORTHFLANK_URL = 'https://site--creatorboost-app--899dydmn7d7v.code.run';
    try {
        const existing = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('bild_'));
        if (existing.length === 0) {
            console.log('📥 Importiere Bilder von Northflank...');
            const resp = await fetch(`${NORTHFLANK_URL}/export-images?key=${BRIDGE_SECRET}`);
            if (resp.ok) {
                const images = await resp.json();
                let count = 0;
                for (const [filename, content] of Object.entries(images)) {
                    fs.writeFileSync(DATA_DIR + '/' + filename, content, 'utf8');
                    count++;
                }
                console.log(`✅ ${count} Bilder importiert`);
            }
        }
    } catch(e) { console.log('Image-Migration fehlgeschlagen:', e.message); }
});
