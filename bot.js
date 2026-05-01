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
const DATA_CACHE_TTL = 30000; // 30 seconds

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

let _dataRefreshing = false;
async function refreshDataCache() {
    if (_dataRefreshing) return;
    _dataRefreshing = true;
    try {
        const parsed = await fetchBotRaw('/data');
        if (parsed) { _dataCache = parsed; _dataCacheTime = Date.now(); }
    } catch(e) {}
    _dataRefreshing = false;
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

// Pre-warm cache on startup and refresh every 20 seconds
setInterval(refreshDataCache, 20000);

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
    _dataCacheTime = 0; // invalidate cache after any write
    return result;
}

function parseBody(req) {
    return new Promise(resolve => {
        let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
            try{resolve(JSON.parse(body));}catch(e){
                const p={};body.split('&').forEach(kv=>{const[k,v]=kv.split('=');if(k)p[decodeURIComponent(k)]=decodeURIComponent((v||'').replace(/\+/g,' '));});resolve(p);
            }
        });
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

function ladeBild(uid, type) {
    try {
        const f = DATA_DIR + '/bild_' + uid + '_' + type + '.txt';
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    } catch(e) {}
    return null;
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
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--bg:#000;--bg2:#0a0a0a;--bg3:#111;--bg4:#1a1a1a;
--border:rgba(255,255,255,.1);--border2:rgba(255,255,255,.06);
--text:#fff;--muted:#999;--muted2:#666;
--accent:#ff6b6b;--accent2:#ffa500;
--green:#00c851;--blue:#4dabf7;--purple:#cc5de8;--gold:#ffd43b;
--radius:16px;--radius-sm:10px;--radius-xs:6px;
--font:'DM Sans',sans-serif;--font-display:'Syne',sans-serif;
--shadow:0 8px 32px rgba(0,0,0,.4);
--safe-bottom:env(safe-area-inset-bottom,0px);
}
[data-theme=light]{
--bg:#fafafa;--bg2:#f0f0f0;--bg3:#fff;--bg4:#e8e8e8;
--border:rgba(0,0,0,.1);--border2:rgba(0,0,0,.06);
--text:#111;--muted:#666;--muted2:#999;
}
html{scroll-behavior:smooth;-webkit-tap-highlight-color:transparent}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;margin:0 auto;padding-bottom:calc(70px + var(--safe-bottom));overflow-x:hidden}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
button{cursor:pointer;border:none;outline:none;font-family:var(--font)}
.topbar{position:sticky;top:0;z-index:100;background:var(--bg);border-bottom:1px solid var(--border2);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.topbar-logo{font-family:var(--font-display);font-size:20px;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.topbar-actions{display:flex;gap:8px;align-items:center}
.icon-btn{width:36px;height:36px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--text)}
.bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:var(--bg);border-top:1px solid var(--border2);display:flex;justify-content:space-around;padding:8px 0 calc(8px + var(--safe-bottom));z-index:100;backdrop-filter:blur(20px)}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:var(--muted);padding:4px 16px;transition:color .2s}
.nav-item.active{color:var(--text)}
.nav-item svg{width:24px;height:24px}
.nav-dot{width:4px;height:4px;border-radius:50%;background:var(--accent);margin:0 auto}
.card{background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border2);overflow:hidden}
.avatar{border-radius:50%;object-fit:cover;background:var(--bg4)}
.stories{display:flex;gap:12px;padding:12px 16px;overflow-x:auto;scrollbar-width:none}
.stories::-webkit-scrollbar{display:none}
.story-item{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;width:80px}
.story-ring{width:62px;height:62px;border-radius:50%;padding:2px;background:linear-gradient(135deg,#f9a825,#e91e63,#9c27b0);position:relative}
.story-ring.seen{background:var(--bg4)}
.story-inner{width:100%;height:100%;border-radius:50%;border:2px solid var(--bg);overflow:hidden;position:relative;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:22px}
.story-name{font-size:11px;color:var(--muted);max-width:80px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.post{margin-bottom:1px;background:var(--bg3)}
.post-header{display:flex;align-items:center;gap:10px;padding:12px 16px}
.post-user-info{flex:1;min-width:0}
.post-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.post-badge{font-size:10px;color:var(--muted)}
.post-time{font-size:11px;color:var(--muted2)}
.post-actions{display:flex;align-items:center;gap:4px;padding:8px 12px}
.post-action-btn{display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:20px;background:transparent;font-size:13px;font-weight:500;color:var(--muted);transition:all .15s}
.post-action-btn.liked{color:var(--accent)}
.post-action-btn svg{width:20px;height:20px}
.post-likers{padding:0 16px 4px;font-size:12px;color:var(--muted)}
.post-likers span{color:var(--text);font-weight:600}
.profile-banner{width:100%;aspect-ratio:3.5/1;position:relative;overflow:hidden}
.profile-banner-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,var(--bg3))}
.profile-avatar-wrap{position:absolute;bottom:-30px;left:16px}
.profile-avatar{width:88px;height:88px;border-radius:50%;border:3px solid var(--bg3);background:var(--bg4);object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:36px}
.profile-info{padding:40px 16px 16px}
.profile-name{font-family:var(--font-display);font-size:22px;font-weight:700}
.profile-username{font-size:13px;color:var(--muted);margin-top:2px}
.profile-bio{font-size:13px;color:var(--muted);margin-top:8px;line-height:1.5}
.profile-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-top:8px}
.profile-stats{display:flex;gap:0;margin-top:16px;border-top:1px solid var(--border2);border-bottom:1px solid var(--border2)}
.profile-stat{flex:1;text-align:center;padding:14px 0}
.profile-stat:not(:last-child){border-right:1px solid var(--border2)}
.profile-stat-val{font-size:18px;font-weight:700}
.profile-stat-label{font-size:11px;color:var(--muted);margin-top:2px}
.profile-xp-bar{margin:16px;background:var(--bg4);border-radius:4px;height:4px;overflow:hidden}
.profile-xp-fill{height:4px;border-radius:4px;transition:width .6s ease}
.profile-xp-info{margin:0 16px 16px;display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}
.rank-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border2)}
.rank-pos{width:32px;text-align:center;font-size:18px;flex-shrink:0}
.rank-num{font-size:14px;font-weight:700;color:var(--muted)}
.rank-info{flex:1;min-width:0}
.rank-name{font-size:13px;font-weight:600}
.rank-badge{font-size:11px;color:var(--muted)}
.rank-xp{font-size:13px;font-weight:700;color:var(--gold)}
.rank-me{background:rgba(255,107,107,.05);border-left:2px solid var(--accent)}
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
.post-category-label{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:20px;color:#fff}
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
/* ── EXPLORE ── */
.explore-tabs{display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 12px;overflow-x:hidden}

.explore-tab{flex:1 1 calc(33.333% - 6px);min-width:0;padding:7px 4px;border-radius:20px;font-size:11px;font-weight:700;background:var(--bg4);color:var(--muted);border:none;cursor:pointer;transition:all .2s;font-family:var(--font);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.explore-tab.active{background:var(--accent);color:#fff;box-shadow:0 0 14px rgba(255,107,107,.35)}
.explore-welcome{margin:0 16px 16px;border-radius:16px;overflow:hidden;position:relative;min-height:220px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)}
.highlight-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;text-decoration:none;color:var(--text);transition:background .2s}
.highlight-card:active{background:rgba(255,255,255,.08)}
.highlight-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.creator-scroll{display:flex;gap:12px;padding:0 16px 12px;overflow-x:auto;scrollbar-width:none}
.creator-scroll::-webkit-scrollbar{display:none}
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
    return `<!DOCTYPE html><html lang="${lang}" data-theme="${session?.theme||'dark'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="theme-color" content="#ff6b6b">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icon.jpg?v=4">
<title>CreatorX</title>
<style>${CSS}</style>
</head>
<body>
<div class="toast" id="toast"></div>
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
setInterval(checkNotifBadge, 30000);
async function checkMsgBadge(){
    try{
        const r=await fetch('/api/messages-count');
        const d=await r.json();
        const b=document.getElementById('msg-badge');
        if(b){if(d.count>0){b.textContent=d.count>9?'9+':d.count;b.style.display='flex';}else b.style.display='none';}
    }catch(e){}
}
checkMsgBadge();
setInterval(checkMsgBadge,15000);
function toast(msg,dur=2500){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);fetch('/api/theme',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t})});}
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
  navigator.serviceWorker.register('/sw.js').then(async reg=>{
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
})();
</script>
</body></html>`;
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
    ${!bannerIsGrad ? '<img src="'+banner+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill" alt="">' : ''}
    <div class="profile-banner-overlay"></div>
    ${isOwn?`<a href="/einstellungen" style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;backdrop-filter:blur(8px)">✏️ Bearbeiten</a>`:''}
  </div>
  <div class="profile-avatar-wrap">
    ${(picData||ladeBild(uid,'profilepic'))
      ? `<img src="${picData||ladeBild(uid,'profilepic')}" class="profile-avatar" style="${getRingBoxShadow(u)}" onerror="this.style.display='none'" alt="">`
      : u.instagram
      ? `<img src="https://unavatar.io/instagram/${u.instagram}" class="profile-avatar" style="${getRingBoxShadow(u)}" onerror="this.style.display='none'" alt="">`
      : `<div class="profile-avatar" style="display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;background:${grad};color:#fff${getRingBoxShadow(u)}">${(u.name||'?').slice(0,2).toUpperCase()}</div>`}
    ${![...sessions.values()].some(s=>String(s.uid)===String(uid))?`<div style="position:absolute;bottom:6px;right:6px;background:rgba(15,15,15,.92);border:1.5px solid #555;border-radius:20px;padding:2px 7px;font-size:10px;color:#888;z-index:2;font-weight:600;white-space:nowrap">Kein Web</div>`:''}
  </div>
</div>
<div class="profile-info">
  <div class="profile-name">${u.spitzname||u.name||'User'}</div>
  ${u.spitzname?`<div class="profile-username">${u.name||''}</div>`:''}
  ${u.username?`<div class="profile-username">@${u.username}</div>`:''}
  <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
    ${(()=>{
      const userSession = [...sessions.values()].find(s=>String(s.uid)===String(uid));
      const isOnline = userSession && (Date.now()-userSession.lastSeen)<300000;
      return isOnline ? '<span style="width:8px;height:8px;border-radius:50%;background:#00c851;display:inline-block"></span><span style="font-size:11px;color:#00c851">Online</span>' : '<span style="width:8px;height:8px;border-radius:50%;background:var(--muted2);display:inline-block"></span><span style="font-size:11px;color:var(--muted2)">Offline</span>';
    })()}
  </div>
  ${u.bio?`<div class="profile-bio">${u.bio}</div>`:''}
  ${u.nische?`<div style="font-size:12px;color:var(--accent);margin-top:4px">🎯 ${u.nische}</div>`:''}
  ${u.website?`<a href="${u.website}" target="_blank" style="font-size:13px;color:var(--blue);margin-top:6px;display:block">🔗 ${u.website.replace('https://','').replace('http://','').slice(0,40)}</a>`:''}
  <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
    <div class="profile-badge" style="background:${grad};color:#fff">${u.role||'🆕 New'}</div>
    ${rank>0?`<div style="font-size:12px;color:var(--muted)">Rang #${rank}</div>`:''}
    ${instaUrl?`<a href="${instaUrl}" target="_blank" style="font-size:12px;color:var(--blue)">📸 @${u.instagram}</a>`:''}
  </div>
  ${u.trophies&&u.trophies.length?`
  <div style="margin-top:10px">
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Trophäen</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${u.trophies.map(t=>`<span style="font-size:22px;background:var(--bg4);border-radius:8px;padding:4px 8px">${t}</span>`).join('')}
    </div>
  </div>`:''}
</div>
<div class="profile-stats">
  ${!isAdmin?'<div class="profile-stat"><div class="profile-stat-val">'+xp+'</div><div class="profile-stat-label">XP</div></div>':''}
  <div class="profile-stat"><div class="profile-stat-val">${u.links||0}</div><div class="profile-stat-label">Links</div></div>
  <div class="profile-stat"><div class="profile-stat-val">${(u.followers||[]).length}</div><div class="profile-stat-label">Follower</div></div>
  <div class="profile-stat"><div class="profile-stat-val">🔥 ${u.streak||0}</div><div class="profile-stat-label">Streak</div></div>
  <div class="profile-stat"><div class="profile-stat-val">💎 ${u.diamonds||0}</div><div class="profile-stat-label">Diamanten</div></div>
</div>
${nb?`
<div class="profile-xp-bar"><div class="profile-xp-fill" style="width:${nb.pct}%;background:${grad}"></div></div>
<div class="profile-xp-info"><span>Noch ${nb.fehlend} XP bis ${nb.ziel}</span><span>${nb.pct}%</span></div>`:'<div style="padding:12px 16px;font-size:12px;color:var(--gold)">👑 Maximales Level erreicht!</div>'}
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
        res.writeHead(200, {'Content-Type':'application/javascript','Service-Worker-Allowed':'/'});
        return res.end(`
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
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
        const bildFile = DATA_DIR + '/bild_' + buid + '_' + btype + '.txt';
        // Try local file first
        if (fs.existsSync(bildFile)) {
            try {
                const data = fs.readFileSync(bildFile, 'utf8');
                const mime = data.split(';')[0].replace('data:','');
                const base64 = data.split(',')[1];
                res.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'public, max-age=3600'});
                return res.end(Buffer.from(base64, 'base64'));
            } catch(e) {}
        }
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
    if (session) { session.lastSeen = Date.now(); }

    function redirect(to) { res.writeHead(302,{'Location':to}); res.end(); }
    function html(content, page) { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(layout(content,session,page,lang)); }
    function json(data, status=200) { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }

    // ── LANDING ──
    if (path === '/' || path === '') {
        if (session) return redirect('/feed');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end(`<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>CreatorX</title>
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
    <form method="POST" action="/auth/code-form">
      <input type="text" name="code" class="code-input" placeholder="Dein Code" autocomplete="off" autocapitalize="none" spellcheck="false" required>
      <button type="submit" class="login-btn">Einloggen →</button>
    </form>
  </div>
</div>
</body></html>`);
    }

    // ── CODE AUTH (Form POST) ──
    if (path === '/auth/code-form' && req.method === 'POST') {
        const body = await parseBody(req);
        const code = (body.code||'').toLowerCase().trim();
        if (!code) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        const botData = await fetchBot('/data');
        if (!botData) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        const found = Object.entries(botData.users||{}).find(([,u]) => u.appCode === code);
        if (!found) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        const [uid, u] = found;
        const sid = genSid();
        sessions.set(sid, { uid: String(uid), name: u.name, username: u.username||null, theme: 'dark', lang: 'de', createdAt: Date.now() });
        saveSessions();
        res.writeHead(302,{'Set-Cookie':'cbsid='+sid+'; HttpOnly; Path=/; Max-Age=2592000','Location':'/feed'});
        return res.end();
    }

    // ── CODE AUTH ──
    if (path === '/auth/code' && req.method === 'POST') {
        const body = await parseBody(req);
        const code = (body.code||'').toLowerCase().trim();
        if (!code) return json({error:'Kein Code'},400);
        const botData = await fetchBot('/data');
        if (!botData) return json({error:'Server nicht erreichbar'},503);
        const found = Object.entries(botData.users||{}).find(([, u]) => u.appCode === code);
        if (!found) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }
        const [uid, u] = found;
        const sid = genSid();
        sessions.set(sid, { uid: String(uid), name: u.name, username: u.username||null, theme: 'dark', lang: 'de', createdAt: Date.now() });
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
        const result = await fetchBot('/like-from-app?uid=' + session.uid + '&msgId=' + encodeURIComponent(msgId));
        return json({ok:true, liked: result?.liked, likes: result?.likes});
    }

    // ── PWA MANIFEST ──
    if (path === '/manifest.json') {
        res.writeHead(200,{'Content-Type':'application/json'});
        return res.end(JSON.stringify({name:'CreatorX',short_name:'CreatorX',start_url:'/feed',display:'standalone',background_color:'#000000',theme_color:'#ff6b6b',description:'Die kreative Community für Instagram Creators',orientation:'portrait',categories:['social','lifestyle'],icons:[{src:'/icon.jpg?v=5',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'/icon.jpg?v=5',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
    }

    if (path === '/api/vapid-public-key') {
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'});
        return res.end(JSON.stringify({key:VAPID_PUBLIC}));
    }

    if (path === '/icon-192.png' || path === '/icon-512.png' || path === '/apple-touch-icon.png' || path === '/icon.jpg') {
        const buf = Buffer.from('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', 'base64');
        res.writeHead(200, {'Content-Type':'image/png','Content-Length':buf.length,'Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache'});
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
            try { fs.writeFileSync(DATA_DIR + '/bild_' + session.uid + '_profilepic.txt', imageData); } catch(e) {}
            checkProfileCompletion(myUid, session);
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
            try { fs.writeFileSync(DATA_DIR + '/bild_' + session.uid + '_banner.txt', imageData); } catch(e) {}
            checkProfileCompletion(myUid, session);
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
            const userProjs = botData?.users?.[session.uid]?.projects || [];
            if (userProjs.length >= 2) return json({error:'Max 2 Projekte erlaubt'}, 400);
            const projectId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            if (imageData) {
                if (!imageData.startsWith('data:image/')) return json({error:'Kein Bild'}, 400);
                if (imageData.length > 5000000) return json({error:'Max 4MB'}, 400);
                try { fs.writeFileSync(DATA_DIR + '/bild_' + session.uid + '_proj_' + projectId + '.txt', imageData); } catch(e) {}
            }
            if (docData && docName) {
                if (docData.length > 15000000) return json({error:'Max 10MB für Dokument'}, 400);
                try { fs.writeFileSync(DATA_DIR + '/doc_' + session.uid + '_proj_' + projectId + '.txt', docData); } catch(e) {}
            }
            const result = await postBot('/add-project-api', { uid: session.uid, projectId, title: title.trim(), description: (description||'').trim(), link: (link||'').trim(), docName: docName||'' });
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
                try { fs.writeFileSync(DATA_DIR + '/bild_' + session.uid + '_proj_' + projectId + '.txt', imageData); } catch(e) {}
            }
            if (docData && docName) {
                if (docData.length > 15000000) return json({error:'Max 10MB für Dokument'}, 400);
                try { fs.writeFileSync(DATA_DIR + '/doc_' + session.uid + '_proj_' + projectId + '.txt', docData); } catch(e) {}
            }
            const result = await postBot('/update-project-api', { uid: session.uid, projectId, title: title.trim(), description: (description||'').trim(), link: (link||'').trim(), docName: docName||'' });
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
            const imgF = DATA_DIR + '/bild_' + session.uid + '_proj_' + projectId + '.txt';
            if (fs.existsSync(imgF)) fs.unlinkSync(imgF);
            const docF = DATA_DIR + '/doc_' + session.uid + '_proj_' + projectId + '.txt';
            if (fs.existsSync(docF)) fs.unlinkSync(docF);
        } catch(e) {}
        const result = await postBot('/delete-project-api', { uid: session.uid, projectId });
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
                fs.writeFileSync(DATA_DIR + '/pinnedlink_' + session.uid + '.txt', url);
            } else {
                const f = DATA_DIR + '/pinnedlink_' + session.uid + '.txt';
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
        const notifs = (botData.notifications?.[session.uid] || []).slice(-20).reverse();
        await postBot('/mark-notifications-read', { uid: session.uid });
        return json({notifications: notifs});
    }

    if (path === '/api/messages-count') {
        if (!session) return json({count:0});
        const myUid = String(session.uid);
        const botData = await fetchBot('/data');
        if (!botData) return json({count:0});
        // Count unread DMs
        const convos = botData.messages || {};
        let unreadDMs = 0;
        Object.entries(convos).forEach(([key, msgs]) => {
            if (key.includes('_'+myUid+'_') || key.includes('_'+myUid) || key.startsWith(myUid+'_'))
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
        const unread = (botData.notifications?.[session.uid] || []).filter(n => !n.read).length;
        return json({count: unread});
    }

    // ── FIX 1: NACHRICHT SENDEN — myUid definiert ──
    if (path === '/api/send-message' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const myUid = String(session.uid);
        let body;
        try { body = JSON.parse(await readBody(req, 10000000)); } catch(e) { return json({error:'Ungültig'},400); }
        const { to, text, image, audio } = body;
        if (!to || (!text?.trim() && !image && !audio)) return json({error:'Ungültig'}, 400);
        const result = await postBot('/send-message-api', {
            from: myUid,
            to,
            text: text?.trim().slice(0, 500) || '',
            image: image || null,
            audio: audio || null,
            timestamp: Date.now()
        });
        return json({ok: !!result});
    }

    // ── FIX 2: NACHRICHTEN LADEN — myUid definiert ──
    if (path.startsWith('/api/messages/')) {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const myUid = String(session.uid); // FIX: war undefined
        const otherUid = path.replace('/api/messages/', '');
        const botData = await fetchBot('/data');
        const chatKey = [myUid, otherUid].sort().join('_');
        const msgs = botData?.messages?.[chatKey] || [];
        return json({count: msgs.length, messages: msgs});
    }

    // ── FIX 3: NACHRICHTEN GELESEN — myUid definiert ──
    if (path === '/api/mark-messages-read' && req.method === 'POST') {
        if (!session) return json({error:'Nicht eingeloggt'}, 401);
        const myUid = String(session.uid); // FIX: war undefined
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

    const myUid = String(session.uid);
    const myUser = d.users[myUid];
    const today = new Date().toDateString();
    const adminIds = Object.entries(d.users).filter(([,u])=>u.role==='⚙️ Admin').map(([id])=>Number(id));

    // ── API ENDPOINTS ──
    if (path === '/api/push-subscribe' && req.method === 'POST') {
        const body = await parseBody(req);
        const { sub } = body;
        if (!sub?.endpoint) return json({ok:false});
        const hash = crypto.createHash('sha256').update(sub.endpoint).digest('hex').slice(0,16);
        pushSubs[hash] = { uid: myUid, sub };
        savePushSubs();
        return json({ok:true});
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
        if (body.bio !== undefined) updateData.bio = body.bio;
        if (body.spitzname !== undefined) updateData.spitzname = body.spitzname;
        if (body.accentColor) updateData.accentColor = body.accentColor;
        if (body.nische !== undefined) updateData.nische = body.nische;
        if (body.website !== undefined) updateData.website = body.website;
        if (body.tiktok !== undefined) updateData.tiktok = body.tiktok;
        if (body.youtube !== undefined) updateData.youtube = body.youtube;
        if (body.twitter !== undefined) updateData.twitter = body.twitter;
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
        const targetUid = body.uid;
        if (!targetUid || targetUid === myUid) return json({error:'Ungültig'},400);
        await postBot('/follow-api', { followerUid: myUid, targetUid });
        return json({ok:true});
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
            for (const [hash, {uid, sub}] of Object.entries(pushSubs)) {
                if (uid === myUid) continue;
                webpush.sendNotification(sub, payload).catch(e=>{if(e.statusCode===410||e.statusCode===404){delete pushSubs[hash];}});
            }
            savePushSubs();
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
            const hasLiked = likes.includes(Number(myUid));
            const isNewForUser = !hasLiked && link.timestamp && new Date(link.timestamp).toDateString() === new Date().toDateString();
            const insta = poster.instagram;
            const grad = badgeGradient(poster.role);
            const lid1 = String(link.counter_msg_id||msgId);

            // Online check
            const ps = [...sessions.values()].find(s=>String(s.uid)===String(link.user_id));
            const isOnline = ps && (Date.now()-ps.lastSeen)<300000;

            // Banner
            const bannerBg = (poster.banner && !poster.banner.startsWith('data:')) ? '#000' : (poster.banner || 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)');
            const bannerFile = ladeBild(String(link.user_id),'banner');
            const bannerImg = bannerFile ? '<img src="/appbild/'+String(link.user_id)+'/banner" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" alt="">' : '';

            // Profile pic (small, in header)
            const picFile = ladeBild(String(link.user_id),'profilepic');
            const avatarSmall = picFile
                ? '<img src="/appbild/'+String(link.user_id)+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">'
                : insta ? '<img src="https://unavatar.io/instagram/'+insta+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">' : '';

            // Profile pic (large, on banner)
            const profPic = picFile
                ? '<img src="/appbild/'+String(link.user_id)+'/profilepic" style="width:100%;height:100%;object-fit:cover" alt="">'
                : insta ? '<img src="https://unavatar.io/instagram/'+insta+'" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()" alt="">'
                : (poster.name||'?').slice(0,2).toUpperCase();

            // Liker avatar stack
            const likerAvatars = likes.slice(0,4).map(lid=>{
                const lu=d.users[String(lid)]; const lg=badgeGradient(lu&&lu.role);
                const lf=ladeBild(String(lid),'profilepic');
                const li=lu&&lu.instagram;
                const limg=lf?'<img src="/appbild/'+lid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':li?'<img src="https://unavatar.io/instagram/'+li+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':'';
                return '<div style="position:relative;width:24px;height:24px;border-radius:50%;background:'+lg+';border:2px solid var(--bg4);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;margin-left:-6px;flex-shrink:0"><span style="position:absolute">'+(lu&&lu.name||'?')[0]+'</span>'+limg+'</div>';
            }).join('');

            // Liker rows
            const likerRows = likes.map((lid,i)=>{
                const lu=d.users[String(lid)]; const lg=badgeGradient(lu&&lu.role);
                const lf=ladeBild(String(lid),'profilepic'); const li=lu&&lu.instagram;
                const limg=lf?'<img src="/appbild/'+lid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':li?'<img src="https://unavatar.io/instagram/'+li+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':'';
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
                    const cimg=cf?'<img src="/appbild/'+c.uid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':ci?'<img src="https://unavatar.io/instagram/'+ci+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':'';
                    const ct=new Date(c.timestamp||0).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
                    return '<div style="display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border2)"><div style="position:relative;width:28px;height:28px;border-radius:50%;background:'+cg+';flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff"><span style="position:absolute">'+(cu.name||'?')[0]+'</span>'+cimg+'</div><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:700">'+(cu.spitzname||cu.name||'User')+' <span style="font-size:10px;color:var(--muted);font-weight:400">'+ct+'</span></div><div style="font-size:12px;color:var(--text);margin-top:2px">'+c.text+'</div></div></div>';
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
                : '<button class="post-action-btn '+(hasLiked?'liked':'')+'" onclick="likePost(\''+lid1+'\',this)" data-msgid="'+lid1+'" '+(hasLiked?'disabled':'')+' style="border:1px solid '+(hasLiked?'var(--accent)':'var(--border)')+';border-radius:12px;padding:9px 20px;font-size:14px;font-weight:700;gap:6px">'+
                  '<svg width="18" height="18" viewBox="0 0 24 24" fill="'+(hasLiked?'currentColor':'none')+'" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'+
                  'Like <span id="likes-'+lid1+'">'+likes.length+'</span>'+
                  '</button>';

            // "Wer hat geliked?" button — only shown when there are likes
            const whoLikedBtn = likes.length>0
                ? '<button class="post-action-btn" onclick="showLikerModal(\''+lid1+'\')" style="border:1px solid var(--border);border-radius:12px;padding:9px 20px;font-size:14px;font-weight:700;gap:6px">'+
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

            return '<div class="post fade-up" id="post-'+msgId+'" data-url="'+link.text+'" data-ts="'+(link.timestamp||0)+'">\n'+
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
'  <div style="margin:0 16px;border-radius:14px;overflow:hidden;background:#000;border:1px solid rgba(255,255,255,.08);cursor:pointer" onclick="window.open(\''+link.text+'\',\'_blank\')">\n'+
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
            const hasLiked = likes.includes(myUid);
            const isOwnPost = String(sl.uid) === String(myUid);
            const insta = poster.instagram;
            const grad = badgeGradient(poster.role);
            const picFile = ladeBild(String(sl.uid),'profilepic');
            const avatarSmall = picFile
                ? '<img src="/appbild/'+String(sl.uid)+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">'
                : insta ? '<img src="https://unavatar.io/instagram/'+insta+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">' : '';
            const likerRows = likes.map(lid=>{
                const lu=d.users[String(lid)]; const lg=badgeGradient(lu&&lu.role);
                const lf=ladeBild(String(lid),'profilepic'); const li=lu&&lu.instagram;
                const limg=lf?'<img src="/appbild/'+lid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':li?'<img src="https://unavatar.io/instagram/'+li+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">':'';
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
                +'<a href="'+sl.url+'" target="_blank" style="display:block;padding:12px 14px;text-decoration:none">\n'
                +'<div style="font-size:13px;color:var(--blue);word-break:break-all;margin-bottom:4px">'+sl.url.replace('https://www.','').replace('https://','').slice(0,60)+'</div>\n'
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
    <button class="icon-btn" onclick="setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')">⚡</button>
  </div>
</div>
<div style="width:100%">${storiesHtml}</div>
${(()=>{
  const todayLiked = Object.values(d.links||{}).some(l=>Array.isArray(l.likes)&&l.likes.includes(Number(myUid))&&new Date(l.timestamp).toDateString()===today);
  const todayTotal = dedupLinks.filter(([,l])=>new Date(l.timestamp||0).toDateString()===today).length;
  const myTodayLikes = Object.values(d.links||{}).filter(l=>Array.isArray(l.likes)&&l.likes.includes(Number(myUid))&&new Date(l.timestamp).toDateString()===today).length;
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
<div style="display:flex;border-bottom:2px solid var(--border2);width:100%">
  <a href="/feed?tab=heute" style="flex:1;padding:9px 4px;font-size:12px;font-weight:700;text-align:center;text-decoration:none;display:block;border-bottom:3px solid ${tab==='heute'?'var(--accent)':'transparent'};margin-bottom:-2px;color:${tab==='heute'?'var(--accent)':'var(--muted)'}">📅 Heute</a>
  <a href="/feed?tab=aelter" style="flex:1;padding:9px 4px;font-size:12px;font-weight:700;text-align:center;text-decoration:none;display:block;border-bottom:3px solid ${tab==='aelter'?'var(--accent)':'transparent'};margin-bottom:-2px;color:${tab==='aelter'?'var(--accent)':'var(--muted)'}">🕐 Älter</a>
  <a href="/feed?tab=engagement" style="flex:1;padding:9px 4px;font-size:12px;font-weight:700;text-align:center;text-decoration:none;display:block;border-bottom:3px solid ${tab==='engagement'?'var(--accent)':'transparent'};margin-bottom:-2px;color:${tab==='engagement'?'var(--accent)':'var(--muted)'}">⭐ Engagement</a>
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
        }
    } catch(e) { toast('❤️ Geliked!'); }
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
setInterval(refreshLikes, 5000);
// Onboarding beim ersten Besuch
try{if(!localStorage.getItem('cb_onboarded')){window.location.href='/onboarding';}}catch(e){}
// Auto-open superlink sheet if redirected from + button
if (new URLSearchParams(window.location.search).get('opensl') === '1') { setTimeout(openSLSheet, 400); }

// Pull-to-refresh
(function(){
  let startY=0,pulling=false;
  const ind=document.createElement('div');
  ind.id='ptr-ind';
  ind.style.cssText='position:fixed;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--accent),var(--accent2));transform:scaleX(0);transform-origin:left;transition:transform .2s;z-index:200';
  document.body.prepend(ind);
  document.addEventListener('touchstart',e=>{if(window.scrollY===0)startY=e.touches[0].clientY;},{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!startY||window.scrollY>0)return;
    const dy=e.touches[0].clientY-startY;
    if(dy>0){pulling=true;ind.style.transform='scaleX('+Math.min(dy/120,1)+')';}
  },{passive:true});
  document.addEventListener('touchend',()=>{
    if(pulling&&window.scrollY===0){ind.style.transform='scaleX(1)';setTimeout(()=>location.reload(),200);}
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
    if (data.ok) { toast('💬 Kommentar gesendet!'); setTimeout(()=>location.reload(),600); }
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
    <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:20px">Superlinks können 1× pro Woche gepostet werden. Du hast dich damit verpflichtet, <strong style="color:var(--text)">alle anderen Superlinks diese Woche zu liken, kommentieren, teilen und speichern</strong>. Sonst gibt es am Sonntag um 23:59 Uhr −50 XP.</div>
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
        await postBot('/mark-messages-read', { uid: myUid, chatKey });
        const msgsHtml = msgs.map(m => {
            const isMe = m.from === myUid;
            const align = isMe ? 'flex-end' : 'flex-start';
            const bg = isMe ? 'var(--accent)' : 'var(--bg4)';
            const col = isMe ? '#fff' : 'var(--text)';
            const radius = isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px';
            const time = new Date(m.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
            let bubble = '';
            if (m.image) {
                bubble = `<div style="max-width:75%;border-radius:${radius};overflow:hidden;cursor:pointer" onclick="window.open('${m.image}','_blank')">
                    <img src="${m.image}" style="width:100%;max-width:240px;display:block;border-radius:${radius}" alt="">
                    ${m.text ? `<div style="background:${bg};color:${col};padding:8px 12px;font-size:13px">${m.text}</div>` : ''}
                </div>`;
            } else if (m.audio) {
                bubble = `<div style="max-width:75%;background:${bg};padding:10px 12px;border-radius:${radius};display:flex;align-items:center;gap:8px">
                    <button onclick="toggleAudio(this)" data-src="${m.audio}" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.2);border:none;color:${col};font-size:14px;cursor:pointer;flex-shrink:0">▶</button>
                    <div style="flex:1">
                        <div style="height:3px;background:rgba(255,255,255,.3);border-radius:2px;position:relative">
                            <div class="audio-prog" style="height:100%;width:0%;background:${col};border-radius:2px;transition:width .1s"></div>
                        </div>
                        <div style="font-size:10px;color:${isMe?'rgba(255,255,255,.7)':'var(--muted)'};margin-top:4px" class="audio-dur">🎤 Sprachnachricht</div>
                    </div>
                </div>`;
            } else {
                bubble = `<div style="max-width:75%;background:${bg};color:${col};padding:10px 14px;border-radius:${radius};font-size:14px;line-height:1.4">${m.text}</div>`;
            }
            return `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:8px;padding:0 16px">
                ${bubble}
                <div style="font-size:10px;color:var(--muted);margin-top:3px">${time}</div>
            </div>`;
        }).join('');
        return html(`
<div class="topbar">
  <a href="/nachrichten" class="icon-btn" style="font-size:22px">‹</a>
  <a href="/profil/${otherUid}" style="display:flex;align-items:center;gap:8px;text-decoration:none">
    <div style="position:relative;width:32px;height:32px;border-radius:50%;overflow:hidden;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">
      <span style="position:absolute;z-index:0">${otherName[0]}</span>
      ${ladeBild(otherUid,'profilepic')
        ? `<img src="/appbild/${otherUid}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" alt="">`
        : otherUser.instagram
        ? `<img src="https://unavatar.io/instagram/${otherUser.instagram}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.remove()" alt="">`
        : ''}
    </div>
    <span style="font-size:15px;font-weight:600;color:var(--text)">${otherName}</span>
  </a>
  <div style="width:36px"></div>
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
<div style="position:fixed;bottom:60px;left:0;right:0;background:var(--bg);border-top:1px solid var(--border2);padding:10px 12px;display:flex;gap:8px;align-items:center;z-index:100">
  <label style="width:36px;height:36px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:16px">
    🖼
    <input type="file" accept="image/*" style="display:none" onchange="selectImage(this)">
  </label>
  <button id="mic-btn" onclick="toggleRecording()" style="width:36px;height:36px;border-radius:50%;background:var(--bg4);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:16px">🎤</button>
  <input type="text" id="msg-input" class="form-input" placeholder="Nachricht..." style="flex:1;margin:0" onkeypress="if(event.key==='Enter')sendMsg()">
  <button onclick="sendMsg()" style="width:36px;height:36px;border-radius:50%;background:var(--accent);border:none;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">➤</button>
</div>
<script>
document.getElementById('msg-input').focus();
window.scrollTo(0, document.body.scrollHeight);

let selectedImage = null;
let mediaRecorder = null;
let audioChunks = [];
let recInterval = null;
let recSeconds = 0;

function selectImage(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5000000) { alert('Max 5MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
        selectedImage = e.target.result;
        document.getElementById('img-preview').src = selectedImage;
        document.getElementById('img-preview-wrap').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function clearImage() {
    selectedImage = null;
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

async function sendMsg() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text && !selectedImage) return;
    input.value = '';
    await sendMessage(selectedImage ? selectedImage : null, null, text);
    clearImage();
}

async function sendMessage(image, audio, text='') {
    const res = await fetch('/api/send-message', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({to:'${otherUid}', text, image: image||null, audio: audio||null})
    });
    if ((await res.json()).ok) location.reload();
}

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

setInterval(async () => {
    const r = await fetch('/api/messages/${otherUid}');
    const data = await r.json();
    if (data.count !== ${msgs.length}) location.reload();
}, 5000);
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
        // Mark as read
        await postBot('/mark-read', { uid: myUid, thread_id: threadId });
        const threadEmojiPaletteD = ['🎯','🚀','💡','📊','🎨','🔥','⚡','🌟','📝','🎭','🏆','🎵','🧠','💎','🌈','🎮','📣','🛠️','🌍','🎬'];
        function threadEmojiD(tid){let h=0;for(const c of String(tid))h=(h*31+c.charCodeAt(0))>>>0;return threadEmojiPaletteD[h%threadEmojiPaletteD.length];}
        const thrInfoRaw = (botData.threads||[]).find(t=>String(t.id)===threadId);
        const thrInfo = { name: thrInfoRaw?.name||(threadId==='general'?'Allgemein':'Thread '+threadId), emoji: threadId==='general'?'💬':(thrInfoRaw?.emoji&&thrInfoRaw.emoji.length>1?thrInfoRaw.emoji:threadEmojiD(threadId)) };
        // Get messages: general uses communityFeed as fallback
        let msgs = (botData.threadMessages||{})[threadId] || [];
        if (!msgs.length && threadId==='general' && botData.communityFeed?.length) {
            msgs = botData.communityFeed.map(m=>({ uid:'', tgName:m.username||null, name:m.name||m.username||'User', role:null, type:'text', text:m.text||'', mediaId:null, timestamp:m.timestamp, msg_id:m.msg_id }));
        }
        const msgsJson = JSON.stringify(msgs).replace(/<\/script>/gi, '<\\/script>');
        const isAdmin = (botData.users?.[myUid]) && String(botData.users[myUid].role||'').includes('Admin');
        const ringMap = {};
        Object.entries(botData.users||{}).forEach(([uid, u]) => { const s=getRingBoxShadow(u); if(s) ringMap[uid]=s; });
        const ringMapJson = JSON.stringify(ringMap);
        // Server-seitiges HTML-Rendering der Nachrichten (zuverlässig, kein JS nötig)
        const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const COLORS_SSR = ['#ff6b6b','#cc5de8','#4dabf7','#ffd43b','#00c851','#ff9f43','#0088cc'];
        const colSSR = n => COLORS_SSR[((n||'').charCodeAt(0)||0)%COLORS_SSR.length];
        const initialMsgsHtml = msgs.length
            ? [...msgs].reverse().map(m => {
                const c = colSSR(m.name);
                const ini = ((m.name||'?').replace(/^@/,'')||'?')[0].toUpperCase();
                const ring = m.uid && ringMap[m.uid] ? ringMap[m.uid] : '';
                const nameHtml = m.uid
                    ? `<a href="/profil/${esc(m.uid)}" style="font-size:12px;font-weight:700;color:${c};text-decoration:none">${m.role?esc(m.role)+' ':''}${esc(m.name)}</a>`
                    : `<span style="font-size:12px;font-weight:700;color:${c}">${m.role?esc(m.role)+' ':''}${esc(m.name)}</span>`;
                const ts = new Date(m.timestamp);
                const timeStr = String(ts.getHours()).padStart(2,'0')+':'+String(ts.getMinutes()).padStart(2,'0');
                const bodyHtml = m.text ? `<div style="font-size:13px;line-height:1.5;margin-top:2px;word-break:break-word">${esc(m.text)}</div>` : '';
                return `<div style="display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;position:relative;overflow:hidden${ring}">${ini}${m.uid?`<img src="/appbild/${esc(m.uid)}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" loading="lazy">`:''}` +
                    `</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">${nameHtml}<span style="font-size:10px;color:var(--muted)">${timeStr}</span></div>${bodyHtml}</div></div>`;
              }).join('')
            : '<div style="text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:12px">💬</div><div style="font-size:14px">Noch keine Nachrichten.<br>Schreib die erste!</div></div>';
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten/gruppe" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg></a>
  <div style="flex:1;text-align:center">
    <div style="font-weight:800;font-size:15px;color:#fff">${thrInfo.emoji} ${thrInfo.name}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7)">Live ●</div>
  </div>
  <div style="width:36px"></div>
</div>
<div id="msgs" style="padding:12px 12px 165px;display:flex;flex-direction:column;gap:10px;overflow-x:hidden;min-width:0;width:100%">${initialMsgsHtml}</div>
<div id="reply-bar" style="display:none;position:fixed;bottom:calc(108px + var(--safe-bottom));left:0;right:0;padding:7px 12px;background:rgba(0,136,204,.15);border-top:1px solid rgba(0,136,204,.3);align-items:center;gap:8px;z-index:6;box-sizing:border-box">
  <div style="width:3px;height:32px;background:#0088cc;border-radius:2px;flex-shrink:0"></div>
  <div style="flex:1;min-width:0"><span id="reply-name" style="font-size:11px;font-weight:700;color:#0088cc;display:block"></span><span id="reply-text" style="font-size:11px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:calc(100vw - 80px)"></span></div>
  <button onclick="cancelReply()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;flex-shrink:0;padding:4px">✕</button>
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
    el.innerHTML=[...msgs].reverse().map(m=>{
      const c=col(m.name);
      const nameEl=m.uid?'<a href="/profil/'+m.uid+'" style="font-size:12px;font-weight:700;color:'+c+';text-decoration:none">'+(m.role?m.role+' ':'')+esc(m.name)+'</a>':'<span style="font-size:12px;font-weight:700;color:'+c+'">'+(m.role?m.role+' ':'')+esc(m.name)+'</span>';
      let body='';
      if(m.replyTo){body+='<div style="background:rgba(0,136,204,.12);border-left:3px solid #0088cc;border-radius:6px;padding:4px 8px;margin-bottom:4px;font-size:11px;color:var(--muted);overflow:hidden;max-height:38px"><span style="color:#0088cc;font-weight:700">'+esc(m.replyTo.name||'?')+'</span> · '+esc((m.replyTo.text||'').slice(0,60))+'</div>';}
      if(m.type==='photo'&&m.mediaId)body+='<img src="/api/tg-file/'+m.mediaId+'" style="max-width:100%;border-radius:10px;margin-top:4px;display:block" loading="lazy">';
      else if(m.type==='sticker'&&m.mediaId)body+='<img src="/api/tg-file/'+m.mediaId+'" style="width:80px;height:80px;object-fit:contain;display:block;margin-top:4px" loading="lazy">';
      else if(m.type==='video')body+='<div style="background:rgba(0,0,0,.3);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--muted);margin-top:4px">🎬 Video — öffne Telegram zum Ansehen</div>';
      if(m.text)body+='<div style="font-size:13px;line-height:1.5;margin-top:2px;word-break:break-word">'+esc(m.text)+'</div>';
      const canDel=(m.uid&&m.uid===MY_UID)||IS_ADMIN;
      const delBtn=canDel?'<button onclick="deleteMsg('+m.timestamp+','+(m.msg_id||0)+')" style="background:none;border:none;color:var(--muted);font-size:13px;cursor:pointer;padding:2px 4px;margin-left:auto;opacity:.55;flex-shrink:0">🗑️</button>':'';
      const reactBadges=m.reactions&&Object.keys(m.reactions).length?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">'+Object.entries(m.reactions).map(([em,uids])=>'<button onclick="react('+m.timestamp+',\''+em+'\')" style="background:'+(uids.includes(MY_UID)?'rgba(0,136,204,.25)':'rgba(255,255,255,.07)')+';border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:2px 7px;font-size:12px;cursor:pointer;color:var(--text)">'+em+' '+uids.length+'</button>').join('')+'</div>':'';
      const actBar='<div style="display:flex;gap:2px;margin-top:3px"><button onclick="setReply('+m.timestamp+')" style="background:none;border:none;color:var(--muted2);font-size:11px;cursor:pointer;padding:2px 5px;border-radius:6px" title="Antworten">↩ Antworten</button><button onclick="openReact('+m.timestamp+')" style="background:none;border:none;color:var(--muted2);font-size:12px;cursor:pointer;padding:2px 5px;border-radius:6px" title="Reagieren">😊</button></div>';
      const ring=m.uid&&RING_MAP[m.uid]?RING_MAP[m.uid]:'';
      return '<div class="fade-in" style="display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;position:relative;overflow:hidden'+ring+'">'+ini(m.name)+(m.uid?'<img src="/appbild/'+m.uid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" loading="lazy">':'')+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">'+nameEl+'<span style="font-size:10px;color:var(--muted)">'+t(m.timestamp)+'</span>'+delBtn+'</div>'+body+reactBadges+actBar+'</div></div>';
    }).join('');
    if(atBottom)window.scrollTo(0,document.body.scrollHeight);
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
  window.deleteMsg=async function(ts,msgId){
    if(!confirm('Nachricht löschen?'))return;
    const r=await fetch('/api/delete-thread-msg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:TID,timestamp:ts,msgId:msgId||null})});
    const d=await r.json();
    if(d.ok){knownHash='';await load();toast('✅ Gelöscht');}else toast('❌ '+(d.error||'Fehler'));
  };
  window.setReply=function(ts){
    const m=(window._lastMsgs||[]).find(m=>m.timestamp===ts);
    if(!m)return;
    replyState={ts:m.timestamp,msgId:m.msg_id||0,name:m.name||'?',text:m.text||''};
    const bar=document.getElementById('reply-bar');
    bar.style.display='flex';
    document.getElementById('reply-name').textContent=m.name||'?';
    document.getElementById('reply-text').textContent=(m.text||'').slice(0,60);
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
        const botData = await fetchBot('/data');
        if (!botData) return html('<div style="padding:40px;text-align:center;color:var(--muted)">Bot nicht erreichbar</div>', 'messages');
        const adminUser = botData.users?.[myUid];
        const isAdmin = adminUser && String(adminUser.role||'').includes('Admin');
        const lastRead = botData.threadLastRead?.[myUid] || {};
        const threadMsgs = botData.threadMessages || {};
        const communityFeed = botData.communityFeed || [];
        // Try to get real topic names from Telegram API
        let apiTopics = {};
        try {
            const ft = await fetchBot('/forum-topics');
            if (ft?.threads) ft.threads.forEach(t => { apiTopics[String(t.id)] = t; });
        } catch(e) {}
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
        const cards = threads.map(thr => {
            const tid = String(thr.id);
            const lastReadTs = lastRead[tid]||0;
            const msgs = threadMsgs[tid]||(tid==='general'?communityFeed:[]);
            const unread = msgs.filter(m=>m.timestamp>lastReadTs).length;
            const lm = thr.last_msg;
            const preview = lm?(lm.type==='photo'?'📷 Foto':lm.type==='video'?'🎬 Video':lm.type==='sticker'?'🎭 Sticker':(lm.text||'').slice(0,40)):'Noch keine Nachrichten';
            const who = lm?.name||'';
            return `<a href="/nachrichten/gruppe/${thr.id}" style="text-decoration:none;display:block">
  <div style="background:var(--bg2);border-radius:16px;padding:16px;position:relative;border:1px solid var(--border2);" onmousedown="this.style.opacity='.7'" onmouseup="this.style.opacity='1'" onmouseleave="this.style.opacity='1'">
    ${unread>0?`<div style="position:absolute;top:10px;right:10px;background:#0088cc;color:#fff;border-radius:50%;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;padding:0 4px">${unread}</div>`:''}
    <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#0088cc22,#006699aa);border:2px solid #0088cc44;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 10px">${thr.emoji}</div>
    <div style="font-size:14px;font-weight:700;color:var(--text);text-align:center;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${thr.name}${isAdmin?` <span onclick="event.preventDefault();event.stopPropagation();renameThread('${tid}','${thr.name.replace(/'/g,'').replace(/"/g,'')}')" style="font-size:11px;opacity:.5;cursor:pointer">✏️</span>`:''}
</div>
    <div style="font-size:11px;color:var(--muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${who?who+': ':''}${preview}</div>
    <div style="text-align:center;margin-top:6px;font-size:10px;color:#0088cc88">${thr.msg_count||0} Nachrichten</div>
  </div>
</a>`;
        }).join('');
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg></a>
  <div style="flex:1;text-align:center">
    <div style="font-weight:800;font-size:15px;color:#fff">✈️ Telegram Gruppe</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7)">Live ●</div>
  </div>
  ${isAdmin?'<a href="/nachrichten/gruppe/neu" style="padding:8px 12px;color:#fff;text-decoration:none;font-size:22px;font-weight:300">+</a>':'<div style="width:44px"></div>'}
</div>
<div style="padding:12px 12px 100px;display:grid;grid-template-columns:1fr 1fr;gap:10px">${cards}</div>
<script>
setTimeout(()=>location.reload(),10000);
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



    if (path === '/nachrichten') {
        const botData = await fetchBot('/data');
        if (!botData) return redirect('/feed');
        const convos = botData.messages || {};
        const myConvos = Object.entries(convos)
            .filter(([key]) => key.includes('_'+myUid+'_') || key.includes('_'+myUid) || key.startsWith(myUid+'_'))
            .map(([key, msgs]) => {
                const otherUid = key.replace(myUid+'_','').replace('_'+myUid,'');
                const otherUser = botData.users?.[otherUid] || {};
                const lastMsg = msgs[msgs.length - 1];
                return { key, otherUid, otherName: otherUser.spitzname||otherUser.name||'User', lastMsg, unread: msgs.filter(m=>m.to===myUid&&!m.read).length };
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
        const convHtml = `
<a href="/nachrichten/gruppe" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border2);text-decoration:none;background:rgba(0,136,204,.06)">
  <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0088cc,#00c6ff);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">✈️</div>
  <div style="flex:1;min-width:0">
    <div style="font-size:14px;font-weight:700;color:var(--text)">Telegram Gruppe</div>
    <div style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${feedPreview}</div>
  </div>
  ${totalThreadUnread > 0
    ? `<div style="background:#0088cc;color:#fff;border-radius:50%;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;padding:0 4px">${totalThreadUnread > 9 ? '9+' : totalThreadUnread}</div>`
    : '<div style="width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse-dot 1.5s infinite"></div>'}
</a>` + (myConvos.length ? myConvos.map(c => `
<a href="/nachrichten/${c.otherUid}" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border2);text-decoration:none">
  <div style="position:relative;width:48px;height:48px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0;overflow:hidden">
    <span style="position:absolute">${c.otherName[0]}</span>
    ${(()=>{const ou=botData.users?.[c.otherUid]||{};const pic=ladeBild(c.otherUid,'profilepic');const insta=ou.instagram;if(pic)return`<img src="/appbild/${c.otherUid}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`;if(insta)return`<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`;return'';})()}
  </div>
  <div style="flex:1;min-width:0">
    <div style="font-size:14px;font-weight:600;color:var(--text)">${c.otherName}</div>
    <div style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.lastMsg?.text?.slice(0,40)||''}</div>
  </div>
  ${c.unread>0?`<div style="background:var(--accent);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${c.unread}</div>`:''}
</a>`).join('') : '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Keine Nachrichten</div><div class="empty-sub">Schreibe jemandem!</div></div>');
        return html(`<div class="topbar"><div class="topbar-logo">Nachrichten</div></div><div style="padding-bottom:80px">${convHtml}</div>`, 'messages');
    }

    // ── BENACHRICHTIGUNGEN ──
    if (path === '/benachrichtigungen') {
        return html(`
<div class="topbar"><div class="topbar-logo">Benachrichtigungen</div></div>
<div id="notif-list" style="padding:8px 0">
  <div class="empty"><div class="empty-icon">🔔</div><div class="empty-text">Lädt...</div></div>
</div>
<script>
fetch('/api/notifications').then(r=>r.json()).then(data=>{
    const list = document.getElementById('notif-list');
    if(!data.notifications||!data.notifications.length){
      list.innerHTML='<div class="empty"><div class="empty-icon">🔔</div><div class="empty-text">Keine Benachrichtigungen</div></div>';
      return;
    }
    list.innerHTML = data.notifications.map(n=>\`
      <div style="padding:14px 16px;border-bottom:1px solid var(--border2);display:flex;gap:12px;align-items:center;\${n.read?'':'background:rgba(255,107,107,.05)'}">
        <div style="font-size:24px;flex-shrink:0">\${n.icon||'🔔'}</div>
        <div style="flex:1"><div style="font-size:13px">\${n.text}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">\${new Date(n.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div></div>
      </div>
    \`).join('');
});
</script>`, 'notif');
    }

    // ── SUCHE ──
    if (path === '/suche') {
        return html(`
<div class="topbar"><div class="topbar-logo">Suche</div></div>
<div style="padding:12px 16px">
  <input type="text" id="search-input" class="form-input" placeholder="🔍 User oder Link suchen..." oninput="doSearch(this.value)" autocomplete="off">
</div>
<div id="search-results" style="padding:0 16px"></div>
<script>
let searchTimer;
async function doSearch(q) {
    clearTimeout(searchTimer);
    if (!q.trim()) { document.getElementById('search-results').innerHTML=''; return; }
    searchTimer = setTimeout(async () => {
        const res = await fetch('/api/search?q='+encodeURIComponent(q));
        const data = await res.json();
        let html = '';
        if (data.users.length) {
            html += '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px">👥 User</div>';
            html += data.users.map(u=>'<a href="/profil/'+u.id+'" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border2)">'
                +'<div style="position:relative;width:44px;height:44px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;overflow:hidden">'
                +'<span style="position:absolute;font-size:15px;color:var(--text)">'+(u.name||'?').slice(0,2).toUpperCase()+'</span>'
                +(u.pic ? '<img src="'+u.pic+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">' : '')
                +'</div>'
                +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">'+(u.spitzname||u.name||'?')+'</div><div style="font-size:11px;color:var(--muted)">'+(u.role||'')+' · '+(u.xp||0)+' XP</div></div>'
                +'</a>').join('');
        }
        if (!data.users.length && !data.links.length) html = '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">Nichts gefunden</div></div>';
        document.getElementById('search-results').innerHTML = html;
    }, 300);
}
document.getElementById('search-input').focus();
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
    ${bannerFile?`<img src="/appbild/${id}/banner" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`:''}
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,.5))"></div>
    ${i<3?`<div style="position:absolute;top:6px;left:8px;font-size:15px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">${medals[i]}</div>`:''}
  </div>
  <div class="creator-card-avatar" style="background:${grad}${getRingBoxShadow(u)}">
    <span style="position:absolute;z-index:0;font-size:16px;font-weight:800">${(u.name||'?').slice(0,1)}</span>
    ${picFile?`<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" alt="">`:insta?`<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display='none'" alt="">`:''}
    ${!webUserUids.has(id)?`<div style="position:absolute;bottom:1px;right:1px;width:15px;height:15px;border-radius:50%;background:rgba(15,15,15,.95);border:1.5px solid #555;display:flex;align-items:center;justify-content:center;font-size:7px;color:#888;z-index:3;font-weight:700">T</div>`:''}
  </div>
  <div class="creator-card-info">
    <div class="creator-card-name" style="margin-top:4px">${u.spitzname||u.name||'User'}</div>
    ${insta?`<span onclick="event.stopPropagation();window.open('https://instagram.com/${insta}','_blank')" style="font-size:10px;color:#4dabf7;margin-top:2px;display:block;cursor:pointer">@${insta}</span>`:''}
    <div class="creator-card-xp">⚡ ${u.xp||0} XP</div>
    ${pinnedLink?`<a href="${pinnedLink}" target="_blank" onclick="event.stopPropagation()" style="display:block;font-size:10px;color:var(--accent);margin-top:5px;padding:3px 8px;background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.2);border-radius:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none">📌 Reel ansehen</a>`:''}
  </div>
</a>`;
        }).join('');

        // Ranking rows helper
        const makeRankRows = (entries, xpFn) => entries.map(([id,u],i)=>{
            const isMe = id===myUid;
            const insta = u.instagram;
            const grad = badgeGradient(u.role);
            const xp = xpFn(id,u);
            return `<a href="/profil/${id}" class="rank-item ${isMe?'rank-me':''}">
    <div class="rank-pos">${i<3?medals[i]:`<span class="rank-num">${i+1}</span>`}</div>
    <div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:${grad};flex-shrink:0;display:flex;align-items:center;justify-content:center${getRingBoxShadow(u)}">
      <span style="color:#fff;font-weight:700;font-size:14px;position:absolute">${(u.name||'?').slice(0,2).toUpperCase()}</span>
      ${ladeBild(id,'profilepic')?`<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`:insta?`<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`:''}
      ${!webUserUids.has(id)?`<div style="position:absolute;bottom:0;right:0;width:13px;height:13px;border-radius:50%;background:rgba(15,15,15,.95);border:1.5px solid #555;display:flex;align-items:center;justify-content:center;font-size:6px;color:#888;z-index:3;font-weight:700">T</div>`:''}
    </div>
    <div class="rank-info">
      <div class="rank-name">${u.spitzname||u.name||'User'}${isMe?' (Du)':''}</div>
      <div class="rank-badge">${u.role||''}</div>
    </div>
    <div class="rank-xp">${xp} XP</div>
  </a>`;
        }).join('');
        const rankingRows = makeRankRows(sorted, (_,u)=>u.xp||0);
        const dailySorted = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&(d.dailyXP[id]||0)>0)
            .sort((a,b)=>(d.dailyXP[b[0]]||0)-(d.dailyXP[a[0]]||0));
        const weeklySorted = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&(d.weeklyXP[id]||0)>0)
            .sort((a,b)=>(d.weeklyXP[b[0]]||0)-(d.weeklyXP[a[0]]||0));
        const dailyRows = makeRankRows(dailySorted, (id)=>d.dailyXP[id]||0);
        const weeklyRows = makeRankRows(weeklySorted, (id)=>d.weeklyXP[id]||0);

        const tabContent = {
            allgemein: `
<div class="explore-welcome" style="margin:0 16px 20px">
  <div style="position:absolute;inset:0;background:linear-gradient(135deg,#1a0533,#0d1b4b,#1a2a6c)"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at top right,rgba(139,92,246,.35),transparent 60%),radial-gradient(ellipse at bottom left,rgba(255,107,107,.2),transparent 60%)"></div>
  <div style="position:absolute;inset:0;padding:22px;display:flex;flex-direction:column;justify-content:flex-end">
    <div style="font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.5);text-transform:uppercase;margin-bottom:8px">✦ Community Hub</div>
    <div style="font-size:22px;font-weight:800;color:#fff;font-family:var(--font-display);line-height:1.15">Willkommen bei<br><span style="background:linear-gradient(90deg,#C9A227,#FFD700);-webkit-background-clip:text;-webkit-text-fill-color:transparent">CreatorX</span></div>
    <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:8px;margin-bottom:16px;line-height:1.5">Deine Plattform für Wachstum,<br>Reichweite und Community</div>
    <a href="/feed" style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.2);color:#fff;padding:8px 18px;border-radius:20px;font-size:12px;font-weight:700;text-decoration:none;align-self:flex-start">Zum Feed →</a>
  </div>
</div>
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
  <div class="highlight-card">
    <div class="highlight-icon" style="background:linear-gradient(135deg,rgba(0,200,130,.25),rgba(0,150,100,.15))">🎁</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">💎 Diamant Shop</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">Tausche Diamanten gegen Vorteile</div>
    </div>
    <div style="font-size:10px;color:#a78bfa;font-weight:700;background:rgba(167,139,250,.12);padding:2px 8px;border-radius:10px;white-space:nowrap">💎 ${d.users[myUid]?.diamonds||0}</div>
  </div>
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
<div id="rlist-gesamt" style="padding-bottom:100px">${rankingRows||'<div class="empty" style="padding:48px 24px;text-align:center"><div class="empty-icon">🏆</div><div class="empty-text">Noch keine Daten</div></div>'}</div>
<div id="rlist-daily" style="display:none;padding-bottom:100px">${dailyRows||'<div class="empty" style="padding:48px 24px;text-align:center"><div class="empty-icon">📅</div><div class="empty-text">Heute noch keine XP</div></div>'}</div>
<div id="rlist-weekly" style="display:none;padding-bottom:100px">${weeklyRows||'<div class="empty" style="padding:48px 24px;text-align:center"><div class="empty-icon">📆</div><div class="empty-text">Diese Woche noch keine XP</div></div>'}</div>
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
            regeln: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">📋</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Community Regeln</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Inhalte folgen bald!</div></div>`,
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
      setTimeout(()=>location.reload(),1200);
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
      setTimeout(()=>location.reload(),800);
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
</script>`;
            })(),
            newsletter: (()=>{
                const isAdminNL = adminIds.includes(Number(myUid));
                const entries = (d.newsletter||[]).slice().reverse();
                const entriesHtml = entries.length
                    ? entries.map(e=>`
<div class="nl-entry" data-id="${e.id}" style="padding:16px;border:1px solid var(--border2);border-radius:14px;background:var(--bg3);margin:0 16px 12px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
    ${e.title?`<div style="font-size:15px;font-weight:700;font-family:var(--font-display)">${e.title}</div>`:'<div></div>'}
    ${isAdminNL?`<div style="display:flex;gap:6px;flex-shrink:0"><button onclick="nlEdit('${e.id}')" style="background:var(--bg4);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer">✏️</button><button onclick="nlDelete('${e.id}')" style="background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.3);color:#ff3b30;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer">🗑️</button></div>`:''}
  </div>
  <div style="font-size:13px;line-height:1.65;color:var(--text);white-space:pre-wrap">${e.content}</div>
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
  ${adminBtn}
  ${adminForm}
  ${entriesHtml}
</div>
<script>
${isAdminNL?`
function nlNew(){document.getElementById('nl-form').style.display='block';document.getElementById('nl-edit-id').value='';document.getElementById('nl-title').value='';document.getElementById('nl-content').value='';document.getElementById('nl-result').textContent='';}
function nlCancel(){document.getElementById('nl-form').style.display='none';}
function nlEdit(id){const el=document.querySelector('[data-id="'+id+'"]');if(!el)return;document.getElementById('nl-edit-id').value=id;document.getElementById('nl-title').value=el.querySelector('[style*="font-display"]')?.textContent||'';document.getElementById('nl-content').value=el.querySelector('[style*="pre-wrap"]')?.textContent||'';document.getElementById('nl-form').style.display='block';window.scrollTo({top:0,behavior:'smooth'});}
async function nlSave(){const id=document.getElementById('nl-edit-id').value;const title=document.getElementById('nl-title').value.trim();const content=document.getElementById('nl-content').value.trim();if(!content)return;const ep=id?'/api/newsletter-edit':'/api/newsletter-add';const body=id?{id,title,content}:{title,content};const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(d.ok){toast('✅ Gespeichert!');setTimeout(()=>location.reload(),800);}else document.getElementById('nl-result').textContent='❌ '+(d.error||'Fehler');}
async function nlDelete(id){if(!confirm('Eintrag löschen?'))return;const r=await fetch('/api/newsletter-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const d=await r.json();if(d.ok){toast('✅ Gelöscht');setTimeout(()=>location.reload(),600);}else toast('❌ Fehler');}
`:''}
</script>`;
            })()
        };

        const tabs = [
            {id:'allgemein',label:'Allgemein'},
            {id:'ranking',label:'🏆 Ranking'},
            {id:'tipps',label:'💡 Tipps'},
            {id:'regeln',label:'📋 Regeln'},
            {id:'shop',label:'💎 Shop'},
            {id:'newsletter',label:'📩 Newsletter'},
        ];

        return html(`
<div class="topbar">
  <div class="topbar-logo">CreatorX</div>
  <div class="topbar-actions">
    <button class="icon-btn" onclick="setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')">⚡</button>
  </div>
</div>
<div style="padding:16px 16px 4px">
  <div style="font-size:28px;font-weight:800;font-family:var(--font-display);letter-spacing:-.5px;background:linear-gradient(90deg,var(--text),rgba(255,255,255,.6));-webkit-background-clip:text;-webkit-text-fill-color:transparent">EXPLORE</div>
  <div style="font-size:13px;color:var(--muted);margin-top:3px">Entdecke, lerne und wachse als Creator</div>
</div>
<div class="explore-tabs">
  ${tabs.map(t=>`<button class="explore-tab${tab===t.id?' active':''}" onclick="location.href='/explore?tab=${t.id}'">${t.label}</button>`).join('')}
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
        const medals = ['🥇','🥈','🥉'];
        const isAdminUser = adminIds.includes(Number(myUid));
        const myRank = isAdminUser ? 0 : sorted.findIndex(([id])=>id===myUid)+1;
        return html(`
<div class="topbar">
  <div class="topbar-logo">Rangliste</div>
  <div style="font-size:12px;color:var(--muted)">Dein Rang: #${myRank}</div>
</div>
<div class="tabs"><div class="tab active">⭐ Gesamt</div></div>
${sorted.map(([id,u],i)=>{
    const isMe = id===myUid;
    const insta = u.instagram;
    const grad = badgeGradient(u.role);
    return `<a href="/profil/${id}" class="rank-item ${isMe?'rank-me':''}">
    <div class="rank-pos">${i<3?medals[i]:`<span class="rank-num">${i+1}</span>`}</div>
    <div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:${grad};flex-shrink:0;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-weight:700;font-size:14px;position:absolute">${(u.name||'?').slice(0,2).toUpperCase()}</span>
      ${ladeBild(id,'profilepic')
        ? `<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`
        : insta
        ? `<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`
        : ''}
    </div>
    <div class="rank-info">
      <div class="rank-name">${u.spitzname||u.name||'User'}${isMe?' (Du)':''}</div>
      <div class="rank-badge">${u.role||''}</div>
    </div>
    <div class="rank-xp">${u.xp||0} XP</div>
  </a>`;
}).join('')}`, 'ranking');
    }

    // ── EIGENES PROFIL ──
    if (path === '/profil') {
        if (!myUser) return redirect('/');
        const myBannerData = session.bannerData || ladeBild(myUid, 'banner');
        const myPicData = session.profilePicData || ladeBild(myUid, 'profilepic');
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
    if(data.ok){toast(_editMode?'✅ Aktualisiert!':'✅ Projekt gespeichert!');setTimeout(()=>location.reload(),800);}
    else{toast('❌ '+(data.error||'Fehler'));btn.disabled=false;btn.textContent=_editMode?'💾 Aktualisieren':'✅ Projekt speichern';}
  }catch(e){toast('❌ Fehler');btn.disabled=false;btn.textContent=_editMode?'💾 Aktualisieren':'✅ Projekt speichern';}
}
async function deleteProj(projectId){
  if(!confirm('Projekt löschen?')) return;
  closeProjDetail();
  const res=await fetch('/api/delete-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId})});
  const data=await res.json();
  if(data.ok){toast('✅ Gelöscht');setTimeout(()=>location.reload(),600);}
  else toast('❌ Fehler');
}
(async()=>{try{const r=await fetch('/api/notifications/count');const d=await r.json();const b=document.getElementById('notif-badge-profil');if(b&&d.count>0){b.textContent=d.count>9?'9+':d.count;b.style.display='flex';}}catch(e){}})();
async function deletePost(timestamp){
  if(!confirm('Post löschen?')) return;
  const res=await fetch('/api/delete-post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp})});
  const data=await res.json();
  if(data.ok){toast('✅ Gelöscht');setTimeout(()=>location.reload(),500);}
  else toast('❌ Fehler');
}
async function submitPost(){
  const text=document.getElementById('new-post').value.trim();
  if(!text) return toast('❌ Text erforderlich');
  const btn=document.querySelector('[onclick="submitPost()"]');
  btn.disabled=true; btn.textContent='⏳...';
  const res=await fetch('/api/post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
  const data=await res.json();
  if(data.ok){toast('✅ Post veröffentlicht!');setTimeout(()=>location.reload(),1000);}
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
    <button class="toggle ${(session?.theme||'dark')==='dark'?'on':''}" id="theme-toggle" onclick="toggleTheme(this)"></button>
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
let selectedBanner = '${(u.banner||gradients[0]).replace(/'/g,"\\'")}';
let selectedAccent = '${u.accentColor||'#ff6b6b'}';
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
        const payload = {bio, spitzname, accentColor: selectedAccent, theme, nische, website};
        if (selectedBanner) payload.banner = selectedBanner;
        const res = await fetch('/api/save-profile', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data = await res.json();
        if(data.ok) { toast('✅ Gespeichert!'); setTimeout(()=>location.reload(), 1200); }
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
    if (data.ok) { toast(url ? '📌 Reel angepeint!' : '🗑️ Pin entfernt!'); setTimeout(()=>location.reload(),1000); }
    else toast('❌ ' + (data.error||'Fehler'));
}
async function removePinnedLink() {
    document.getElementById('inp-pinned-link').value = '';
    await savePinnedLink();
}
async function setRing(ringId) {
    const res = await fetch('/api/set-active-ring', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ringId:ringId||null})});
    const data = await res.json();
    if (data.ok) { toast(ringId ? '🪄 Ring aktiviert!' : '🔘 Ring deaktiviert'); setTimeout(()=>location.reload(),800); }
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
