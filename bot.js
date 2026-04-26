const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

const MAINBOT_URL   = process.env.MAINBOT_URL   || '';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'geheimer-key-2';
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
// Fallback: lokale Datei
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

// Sessions auf Disk speichern
function saveSessions() {
    const obj = {};
    for (const [k,v] of sessions.entries()) obj[k] = v;
    const data = JSON.stringify(obj);
    try { fs.writeFileSync(SESSIONS_FILE, data); } catch(e) {}
    try { fs.writeFileSync(LOCAL_SESSIONS, data); } catch(e) {}
}
setInterval(saveSessions, 60000);

function genSid() { return crypto.randomBytes(32).toString('hex'); }
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

async function fetchBot(path) {
    return new Promise(resolve => {
        const fullUrl = MAINBOT_URL + path;
        const lib = fullUrl.startsWith('https')?https:http;
        const req = lib.get(fullUrl, {headers:{'x-bridge-secret':BRIDGE_SECRET}}, res => {
            let data=''; res.on('data',c=>data+=c); res.on('end',()=>{try{resolve(JSON.parse(data));}catch(e){resolve(null);}});
        });
        req.on('error',()=>resolve(null)); req.setTimeout(8000,()=>{req.destroy();resolve(null);});
    });
}

async function postBot(path, body) {
    return new Promise(resolve => {
        const fullUrl = MAINBOT_URL + path;
        const lib = fullUrl.startsWith('https')?https:http;
        const data = JSON.stringify(body);
        const u = new url.URL(fullUrl);
        const opts = {hostname:u.hostname,path:u.pathname+u.search,method:'POST',headers:{'Content-Type':'application/json','x-bridge-secret':BRIDGE_SECRET,'Content-Length':Buffer.byteLength(data)}};
        const req = lib.request(opts, res=>{res.on('data',()=>{});res.on('end',()=>resolve(true));});
        req.on('error',()=>resolve(false)); req.write(data); req.end();
    });
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
    return null;
}

function badgeGradient(role) {
    if(role?.includes('Elite')) return 'linear-gradient(135deg,#f59e0b,#ef4444)';
    if(role?.includes('Erfahrener')) return 'linear-gradient(135deg,#8b5cf6,#3b82f6)';
    if(role?.includes('Aufsteiger')) return 'linear-gradient(135deg,#3b82f6,#06b6d4)';
    if(role?.includes('Anfänger')) return 'linear-gradient(135deg,#10b981,#3b82f6)';
    return 'linear-gradient(135deg,#64748b,#94a3b8)';
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
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;max-width:480px;margin:0 auto;padding-bottom:calc(70px + var(--safe-bottom));overflow-x:hidden}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
button{cursor:pointer;border:none;outline:none;font-family:var(--font)}

/* NAV */
.topbar{position:sticky;top:0;z-index:100;background:var(--bg);border-bottom:1px solid var(--border2);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.topbar-logo{font-family:var(--font-display);font-size:20px;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.topbar-actions{display:flex;gap:8px;align-items:center}
.icon-btn{width:36px;height:36px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--text)}

.bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:var(--bg);border-top:1px solid var(--border2);display:flex;justify-content:space-around;padding:8px 0 calc(8px + var(--safe-bottom));z-index:100;backdrop-filter:blur(20px)}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:var(--muted);padding:4px 16px;transition:color .2s}
.nav-item.active{color:var(--text)}
.nav-item svg{width:24px;height:24px}
.nav-dot{width:4px;height:4px;border-radius:50%;background:var(--accent);margin:0 auto}

/* CARDS */
.card{background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border2);overflow:hidden}

/* AVATAR */
.avatar{border-radius:50%;object-fit:cover;background:var(--bg4)}
.avatar-ring{padding:2px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:50%}
.avatar-inner{border:2px solid var(--bg);border-radius:50%;overflow:hidden}

/* STORIES BAR */
.stories{display:flex;gap:12px;padding:12px 16px;overflow-x:auto;scrollbar-width:none}
.stories::-webkit-scrollbar{display:none}
.story-item{display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0}
.story-ring{width:60px;height:60px;border-radius:50%;padding:2px;background:linear-gradient(135deg,#f9a825,#e91e63,#9c27b0)}
.story-ring.seen{background:var(--bg4)}
.story-inner{width:100%;height:100%;border-radius:50%;border:2px solid var(--bg);overflow:hidden;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:22px}
.story-name{font-size:11px;color:var(--muted);max-width:64px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* POST CARD */
.post{margin-bottom:1px;background:var(--bg3)}
.post-header{display:flex;align-items:center;gap:10px;padding:12px 16px}
.post-user-info{flex:1;min-width:0}
.post-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.post-badge{font-size:10px;color:var(--muted)}
.post-time{font-size:11px;color:var(--muted2)}
.post-link-preview{margin:0 16px;border-radius:var(--radius-sm);overflow:hidden;background:var(--bg4);border:1px solid var(--border);display:flex;align-items:center;gap:12px;padding:12px}
.post-link-icon{font-size:28px;flex-shrink:0}
.post-link-url{font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.post-link-open{font-size:11px;color:var(--accent);font-weight:600;flex-shrink:0}
.post-actions{display:flex;align-items:center;gap:4px;padding:8px 12px}
.post-action-btn{display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:20px;background:transparent;font-size:13px;font-weight:500;color:var(--muted);transition:all .15s}
.post-action-btn.liked{color:var(--accent)}
.post-action-btn svg{width:20px;height:20px}
.post-likers{padding:0 16px 4px;font-size:12px;color:var(--muted)}
.post-likers span{color:var(--text);font-weight:600}

/* PROFILE */
.profile-banner{height:160px;position:relative;overflow:hidden}
.profile-banner-img{width:100%;height:100%;object-fit:cover}
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

/* RANKING */
.rank-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border2)}
.rank-pos{width:32px;text-align:center;font-size:18px;flex-shrink:0}
.rank-num{font-size:14px;font-weight:700;color:var(--muted)}
.rank-info{flex:1;min-width:0}
.rank-name{font-size:13px;font-weight:600}
.rank-badge{font-size:11px;color:var(--muted)}
.rank-xp{font-size:13px;font-weight:700;color:var(--gold)}
.rank-me{background:rgba(255,107,107,.05);border-left:2px solid var(--accent)}

/* FORMS */
.form-section{padding:16px}
.form-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.form-input{width:100%;background:var(--bg4);border:1px solid var(--border);color:var(--text);border-radius:var(--radius-sm);padding:12px 14px;font-size:14px;font-family:var(--font);outline:none;transition:border-color .2s}
.form-input:focus{border-color:var(--accent)}
textarea.form-input{resize:none;min-height:80px}
.form-hint{font-size:11px;color:var(--muted2);margin-top:4px}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);font-size:14px;font-weight:600;font-family:var(--font);cursor:pointer;transition:all .15s;border:none}
.btn-primary{background:var(--accent);color:#fff}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
.btn-full{width:100%}
.btn-sm{padding:8px 14px;font-size:12px}

/* COLOR PICKER */
.color-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin-top:8px}
.color-opt{width:36px;height:36px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .15s;display:flex;align-items:center;justify-content:center}
.color-opt.selected{border-color:var(--text);transform:scale(1.1)}

/* GRADIENT PICKER */
.gradient-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.gradient-opt{height:50px;border-radius:var(--radius-xs);cursor:pointer;border:2px solid transparent;transition:all .15s}
.gradient-opt.selected{border-color:var(--text)}

/* TABS */
.tabs{display:flex;border-bottom:1px solid var(--border2)}
.tab{flex:1;text-align:center;padding:12px;font-size:13px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;transition:all .2s}
.tab.active{color:var(--text);border-bottom-color:var(--text)}

/* EMPTY */
.empty{text-align:center;padding:48px 24px;color:var(--muted)}
.empty-icon{font-size:48px;margin-bottom:12px}
.empty-text{font-size:15px;font-weight:600;margin-bottom:6px;color:var(--text)}
.empty-sub{font-size:13px}

/* TOAST */
.toast{position:fixed;top:80px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:10px 20px;font-size:13px;font-weight:500;z-index:999;box-shadow:var(--shadow);opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1}

/* ANIMATIONS */
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
.fade-up{animation:fadeUp .4s ease forwards}

/* SETTINGS */
.setting-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border2)}
.setting-label{font-size:14px;font-weight:500}
.setting-sub{font-size:12px;color:var(--muted);margin-top:2px}
.toggle{width:44px;height:24px;border-radius:12px;background:var(--bg4);border:none;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.toggle.on{background:var(--accent)}
.toggle::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on::after{transform:translateX(20px)}

/* LANDING */
.landing{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;text-align:center;background:var(--bg)}
.landing-logo{font-family:var(--font-display);font-size:36px;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.landing-tag{font-size:15px;color:var(--muted);margin-bottom:48px}
.landing-features{display:flex;flex-direction:column;gap:16px;width:100%;max-width:320px;margin-bottom:48px}
.landing-feature{display:flex;align-items:center;gap:14px;text-align:left;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius);padding:16px}
.landing-feature-icon{font-size:28px;flex-shrink:0}
.landing-feature-title{font-size:14px;font-weight:600}
.landing-feature-sub{font-size:12px;color:var(--muted);margin-top:2px}
.tg-btn{display:inline-flex;align-items:center;gap:10px;background:#0088cc;color:#fff;padding:14px 28px;border-radius:var(--radius-sm);font-size:15px;font-weight:600;font-family:var(--font);cursor:pointer;border:none;width:100%;max-width:320px;justify-content:center}
`;

function layout(content, session, page='feed', lang='de') {
    const t = lang === 'de' ? {feed:'Feed',ranking:'Top',profile:'Profil',settings:'Mehr'} : {feed:'Feed',ranking:'Top',profile:'Profile',settings:'More'};
    return `<!DOCTYPE html><html lang="${lang}" data-theme="${session?.theme||'dark'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="theme-color" content="#ff6b6b">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icon-192.png">
<title>CreatorBoost</title>
<style>${CSS}</style>
</head>
<body>
<div class="toast" id="toast"></div>
${content}
${session ? `
<nav class="bottom-nav">
  <a href="/feed" class="nav-item ${page==='feed'?'active':''}">
    <svg viewBox="0 0 24 24" fill="${page==='feed'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    ${page==='feed'?'<div class="nav-dot"></div>':''}
  </a>
  <a href="/ranking" class="nav-item ${page==='ranking'?'active':''}">
    <svg viewBox="0 0 24 24" fill="${page==='ranking'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    ${page==='ranking'?'<div class="nav-dot"></div>':''}
  </a>
  <a href="/suche" class="nav-item ${page==='search'?'active':''}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    ${page==='search'?'<div class="nav-dot"></div>':''}
  </a>
  <a href="/profil" class="nav-item ${page==='profile'?'active':''}">
    <svg viewBox="0 0 24 24" fill="${page==='profile'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    ${page==='profile'?'<div class="nav-dot"></div>':''}
  </a>
  <a href="/benachrichtigungen" class="nav-item ${page==='notif'?'active':''}" id="notif-tab">
    <div style="position:relative">
      <svg viewBox="0 0 24 24" fill="${page==='notif'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span id="notif-badge" style="display:none;position:absolute;top:-4px;right:-4px;background:var(--accent);color:#fff;font-size:9px;font-weight:700;border-radius:50%;width:16px;height:16px;align-items:center;justify-content:center"></span>
    </div>
    ${page==='notif'?'<div class="nav-dot"></div>':''}
  </a>
  <a href="/einstellungen" class="nav-item ${page==='settings'?'active':''}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
    ${page==='settings'?'<div class="nav-dot"></div>':''}
  </a>
</nav>` : ''}
<script>
// Benachrichtigungen Badge
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

function toast(msg,dur=2500){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);fetch('/api/theme',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t})});}
function setLang(l){fetch('/api/lang',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:l})}).then(()=>location.reload());}
</script>
<script>
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
</script>
</body></html>`;
}

function ladeBild(uid, type) {
    try {
        const f = DATA_DIR + '/bild_' + uid + '_' + type + '.txt';
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    } catch(e) {}
    return null;
}

function profileCard(uid, u, d, isOwn=false, lang='de', adminIds=[], bannerData=null, picData=null) {
    const xp = u.xp||0;
    const nb = xpNext(xp);
    const grad = badgeGradient(u.role);
    // Banner immer als URL laden - nie als inline Base64
    const banner = bannerData || u.banner || 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)';
    const bannerIsGrad = !banner.startsWith('data:image') && !banner.startsWith('http');
    const instaUrl = u.instagram ? `https://instagram.com/${u.instagram}` : null;
    const totalLinks = Object.values(d.links||{}).filter(l=>l.user_id===Number(uid)).length;
    const sorted = Object.entries(d.users||{}).filter(([,u])=>u.role!=='⚙️ Admin').sort((a,b)=>(b[1].xp||0)-(a[1].xp||0));
    const isAdmin = adminIds.includes(Number(uid));
    const rank = isAdmin ? 0 : sorted.findIndex(([id])=>id===uid)+1;

    return `
<div class="profile-banner" style="${bannerIsGrad ? 'background:'+banner : ''}">
  ${!bannerIsGrad ? '<img src="'+banner+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">' : ''}
  <div class="profile-banner-overlay"></div>
  <div class="profile-avatar-wrap">
    ${(picData||ladeBild(uid,'profilepic'))
      ? `<img src="${picData||ladeBild(uid,'profilepic')}" class="profile-avatar" onerror="this.style.display='none'" alt="">`
      : u.instagram
      ? `<img src="https://unavatar.io/instagram/${u.instagram}" class="profile-avatar" onerror="this.style.display='none'" alt="">`
      : instaUrl
        ? `<img src="https://unavatar.io/instagram/${u.instagram}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'U')}&background=ff6b6b&color=fff" class="profile-avatar" onerror="this.outerHTML='<div class=\"profile-avatar\" style=\"display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;background:${grad};color:#fff\">${(u.name||'?').slice(0,2).toUpperCase()}</div>'" alt="">`
        : `<div class="profile-avatar" style="display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;background:${grad};color:#fff">${(u.name||'?').slice(0,2).toUpperCase()}</div>`}
  </div>
  ${isOwn?`<a href="/einstellungen" style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;backdrop-filter:blur(8px)">✏️ Bearbeiten</a>`:''}
</div>
<div class="profile-info">
  <div class="profile-name">${u.spitzname||u.name||'User'}</div>
  ${u.spitzname?`<div class="profile-username">${u.name||''}</div>`:''}
  ${u.username?`<div class="profile-username">@${u.username}</div>`:''}
  <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
    ${(()=>{
      // Prüfe ob User Session aktiv (online in letzten 5 Min)
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
  <div class="profile-stat"><div class="profile-stat-val">${u.totalLikes||0}</div><div class="profile-stat-label">Likes</div></div>
  <div class="profile-stat"><div class="profile-stat-val">${(u.followers||[]).length}</div><div class="profile-stat-label">Follower</div></div>
</div>
${nb?`
<div class="profile-xp-bar"><div class="profile-xp-fill" style="width:${nb.pct}%;background:${grad}"></div></div>
<div class="profile-xp-info"><span>Noch ${nb.fehlend} XP bis ${nb.ziel}</span><span>${nb.pct}%</span></div>`:'<div style="padding:12px 16px;font-size:12px;color:var(--gold)">👑 Maximales Level erreicht!</div>'}`;
}

// ================================
// SERVER
// ================================
// Hilfsfunktion für große Request Bodies
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

const server = http.createServer(async (req, res) => {
    const pu = url.parse(req.url, true);
    const path = pu.pathname;
    const query = pu.query;


    // ── LOGO ──
    if (path === '/logo') {
        const logoData = Buffer.from('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j86T+3tS/wCfn/xxf8KANQG6ljaH7C1pAeNsVvuYj6mlutNeTSEhso5gI5NzRy8M9ZX9val/z8/+OL/hR/b2pf8APz/44v8AhQBsairXtiltb6fKkuRgsgUJ+Na8ANvZxrPIMogDOTxXHnXdSIx9pI+ij/Cqk93cXJ/fzPJ7M3FAFnW7mG61KSSD7mAN394jvVCiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoorR0NtLW/U6ykz2+OkR7+/fH0oArWVjdahMIbO3kmkPZFzj6+lbtz4TXTbJptX1S3tJyuUt1HmMfbj/69d2slhLopGg7zCPvLYMiSf8Aj3f9a4a7PhqO5dby21xZ8/OJWTdn3zQBzFFdD5nhH/n31f8A77jqK5k8MG3kFtBqgm2nYXdNuff2oAw6KKKACiiigAooooAKKKKACiiigDpvDHhE+ILKW5F4IPLk2bfL3Z4Bz1HrSS6BokMzxSeJEWRGKsPsr8EcHvXUfDH/AJAl1/18H/0EVzWpaj4fTU7pZdCkkkEzhm+2MNx3HJxjigCSPwO99atcaRqlreqDjGChz6d8H61y00UkEzwyqUkRirKexFen+E7y01LS7m30W2fSnQgs+3zASe+T1PHeuQs9HWTxt/ZuqTiX98fMcHHmHGcfjQBzyRvIcIjMfRRmlkhli/1kTp/vKRXonjTVLvw8traaPElnA6kmSOMckdqzvCPiTVtR1mKxvW+228oO8OgO0Y65x/OgDiaVVZzhVLH0AzXY+MtF0608R2MVuVt47ojzkXonzYyPTPP5Vv8AiiU+FdDhGiW0cG99jTBASox1J7k+poA8ye3mjGXhkUerKRUddTovi3XH1S3hknN2ksgRonQHIJ5xgcVp/EfSLC0it7y2jSGeWQqyIMBxjOce39aAOEVWc4VSx9AM097eaMZeGRR6lSK9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UUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFLQAlFFLQAlFSwwSTyCOJCzHoBXS6Z4Oln2vdv5a91HWplOMdxqLZy1Fel2/hHS48Hymf/fOatnw5pZXH2GL64rL28exXIzymkr0i58H6ZJkqjof9luKwNS8Hy26l7WUSAclTxiqj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Sti3brgVnOL+JFJ9GYUsbRSNG4ww6imGu28QaHFewfbtPC4xkgck1xboyMVcEEdQaqEuZCasMopaSqEFFFFABRRRQAUUUUAKDUkU8kJyjEeo9aipaAJ3kWc5YBW9RUtvpl5ctiGBmz3A4rT8MabDd3Ba4Xco5Feg20CRqERQqjsBWE6vK7ItRueeReEdUkxuiVB7mpJfBuoouV2OfQGvS44gaV4gKz9rMrlR5HdaFqNqMy2zY9uazipBwRivZZUGCMVzHiPQ7eaBpoYwJh/d4FVGvd2YnDscCaSnyIY5CjdRTa6TMSiiigAooooAKKKKACiiigAooooAKKKKAFozSUtAC13XgyWM2JQuN+7gE1wlWLK9nspxLbvtYVnUhzqxUXY9ejwKsowFcfoHiSe/IjltWYjgun9a6CTULWFtslwit6FhXFyyg7Gzs0aTSDFV5HGKptqNpjP2qL/vsVnXHiPS4jhroFh2AND5nshKxpSNXD+LGtzIQv8Ars81Z1LxejK0dlEeert/SuVuLiS5lMkrbmPetqNKSd2Kc1siGiiiusxCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAFoHWkooA29E8QXGmygMxeE/eHU10N3pen+Ibc3Ni2y4xllzya4PNWbS8uLOQSW8rIc9jjNRKGt0UmPvtOubCUx3ETIR61Urt9L1eLXY/smoW/mOf41GKc3geCWQlLmRVJ6bRxUe1SdpD5L7HCmiu/bwJbbcCeQH1xWbf+CpIELW8+/HZhimq0WHIzkqKlngkt5CkqlWHrUZrVakCUUUUAApaSigDW0PV20u43FA6ng5PSu907XbC8ACTqrHsxxXlmaUEjvWM6KlqWptHtEc4cZRg30OaVpTivH4tQvIRiK6lQeiuRXY+Er+41APDPKzYHVjk1hOi4q9ylJM6Se7hQEvMi465YVyuveI7cwvb2rl3P8a9BWJ4njaHU3TcSB6msXJrSnRXxMUpvYfIxdyzHJNNpKK6TMKKKKACiiigAooooAKKKKACiloxQAlFSLbzMMrE5Hsppxtpx1gk/75NFwIaKeEbdt2HPpjmtrTPC19f4d1EEXXc/HFJyS3HYxEQuwVQSTXSaP4TmuAJ71hDD6McE1pKmg+HVyzfarnH1rC1jxHdallB+6h6bFrPmlPYdkja1HXbTSofsumKjOBtZxwRXIXNxLdTGSZtzHvUWe9JVxgoibuLmikoqhC0lFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFKKSloA6Twrf21vOqTbUP9816DbzoyhkYMD3BrxqrVvqV5bDENxIg9AawnR5ndM0U7Kx7E04I6VTmlHTIB9M15ide1Mrj7XJ+dVpdQvJiDJcyMR6tWf1eT3Y1NI3vFVheSXJuFtZPKx94CuaZGU/MpU+4rXs/E2p2uAJvMUdpOeK1B4n029AXUNMTOOXUZNbrmirWIdmclikrrZLDw3f4NteG2Y9n/AMKgm8ITMC1pcxTJ2JOM0/aLqHKzmaK059B1KDJe1kKj+IDiqDQyKcNGwPuKpNPYVmMxSqjOcKpJ9AK1dH0WbUZQMFUHJJ4zXdabo1nYKPKhG/8Avnk1lOtGJSg2cBb6FqVyMx2r49SK6TQfD+qWMokLRKp6jdzXYRx+nFWFirB1pS0LUUjkNc8MXGoSeZC0YfuWNYM3g7UolLZif2Vq9OMQxUTxChVJx0CyZ5JcaNqFsMy2rgeuKolSpwwwfevYnjHpmsfUtDsr4EvEFf8AvLwaqOJ1tJCdPseaUVr6xoc2msWGXi/v4rJNdUZKSujNpoSiiimIKKKcEZuik/QUAJRVq3068ueIbeR/oK0bfwtqU3LxrCP+mhxScordjs2ZdpbPdTrFGMk13mkeHLOGJWliDyHru5rKs9Ft9JnWa61GJHH8PWumsNTtLniG4VyPQ1y1qjfw7GsYo0rezjjULGiqo7AU+W3XHIBH0pEm445pHnOKwuirGe9jaxy+aLeLeP4ttct4pu9Th4NwFgboqcH8a6y5uI41LyyKijqSa4fxNq1vfYhg+bYfvdjWlG7kKVkjniSxySSaQ0UldxgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUALUkc8sTBo5GUjuDUVFAGrD4g1OIj/AEt3A7McirqeLbtsLNDA69xsxmuezRUuEX0HzM9S0idbqwjmWMRhh90Vox4rgfDviD7JtguWPlDpjtXc21xDcRh4ZFdfVTmuCpBxZupXReTFTKRVMNiniQ0oysJotMwqF2FRNJUTSGhzuCiOkIqu5pWYmopGCKWYgAdSazbuaJWKWqW0N1amO4cIh7muXfQNMDH/AInUI9sdKn8Sa5FLGbWDn/bU1yrHJJPNdtGEktzGclc6E6ZokJ/e6gZR/sCjb4XQ/euiRXO0lbcnmRzeR0n9qaHb8RaaJh6ydaD4nihH+hafFCfzrm6KPZrqHMzcn8ValKMBkj90XBrPn1O9uRia5kce7VTopqMV0FdjixbqxP1pUdkOVYg+xplFUI0I9b1KJQsd7MqjsGp51/VT/wAv03/fVZlFLlj2Hdk9xeXFy2Z5nkPuagoop7CCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAFqzZ6jdWThredkI9DVWih67gdTbeNrxNonijcD0GCa0U8dW5+9aOp9d1cLRWTowfQpSZ6CvjPT2XLBwfTFQS+NbQH5IHf8cVwtFT9XgP2jOruvGcz/wDHvbqg/wBo5rEvtZvb4/vZm2/3RwKz6K0jTjHZCcm9xc0ZzSUVZItJRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFGKACiiigAooooAKKMUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFGKKACiiigAooooAKKK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AH0p/wDwlGs/8/r/AJCseip5V2Hdmv8A8JPrB/5fX/IVDNrmpT/6y7c1nUUcsewXZM1zO/3pnP1Y1FSUVQhaSiigApQSDkdaSigCwL26GP8ASJOP9o0v2+7/AOfiT/vo1WopWQXJpbmaYASyM4Hqc1DRRTAKKKXBoAKcjsjZRip9Qa0NN0O+1FgIYWCn+IjArs9J8GWtth7s+a/p2oA4+ws9Vv3AgMxHrk4rs9H8JSoFkvbmRj127jXS28MNum2GNUA6ACpg1FkFwt7aO3QKg6evNWM8VGhp+aLAIeaYRVPUdZstOQtcTKD2XPJrhtb8bz3O6OxzGh/i70wOz1LWLLTULXEyg9lHJritX8b3E+6OxTyk6bj1rlJ7iW4cvNIzse5OajNAEs9zNcuXmkLsepJqGiikAoq9YapcWT/JIdndaoUU07CaudtZ6xb3aDLhX7g1ZM8R6SL+dcCCR0JFO8x/77fnWyrNGTopndefF/z0X86UTxf89F/OuE8x/wC+350eY/8Afb86ft32F7FdzuzLCy7WdCPQmsfUtKtJQZLZ0R/7obiuc8x/77fnSeY/95vzqJVOboXGHL1HTRtE5Vh070ygsT1JP1pKyNAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKUDJFJWlp2pQ2OGNjFM4/icmgCXS/Dt9qLDbGY4+7MMV2Ol+ErGzw848+T36CsNfHFwgwtlCB9TS/wDCd3X/AD6RfmaYHdxhI1CxqFUdgKeGrgv+E8uv+fOL8zS/8J7c/wDPnF+ZoA74NTw1eff8J7df8+cX5mq9541v7iPZHGkORglTSA72/wBastNjLXEygj+EHmuN1jx1PcZjsU8pP7x61yU9xLcSF5pC7HuTUdO4EtxczXMheaRnYnOSaizSUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKACegzQAUU7Y/wDdb8qQgjqCKAEooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKME9BQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAG/wCDER9YcOisPJbhhnuKxLkAXMoAwA5/nW34MZV1hyzBR5LdTjuKxLk5uZSORvP86AN/TI0Pg/UWKKWD8EjkdK5yuk0x1Hg/UVLKGL9M89q5ugDo/EEaLoOksqKpKckDBPArnK6TxC6toGkhWUkJyAfYVzdABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAb2j6fappNxqt5H54iOEizgE8dfzqq/iC/ziB47dOyQxqoH6Vb0a/tZNIuNJu5fI807o5SPlB46/lVOTQNQU5iiW4Ts8LhgaAG/wBvap/z/S/nTk1/URxJMsy91lRWB/Smf2Hqn/PjP/3zTk0HUmPzW5iXu0rBQPzoAv3lna3+gnVbaEW80bYljT7p5xkDt1Fc9XRXl3a6doB0qCdbiaRsyun3V5zgHv0rnaACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKu2elXl6vmRRbYh1lc7UH4mqVXLLVbyxG2GY+WesbfMp/A0AW/I0mx5uJ3vpR/yzg+VPxY9fwqO41qdoWgtYorSBhgpEvLD3bqak+1aTfcXds1nKf+Wtvyv4qf6UyXQ5jGZbGWK9iHJMR+YfVTzQBl0UUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFKCR0JH0pKKAH+bJ/z0f/vo00szdST9TSUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABSglehI+lJRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf//Z', 'base64');
        res.writeHead(200, {'Content-Type':'image/jpeg','Cache-Control':'public,max-age=86400'});
        return res.end(logoData);
    }


    // ── SERVICE WORKER ──
    if (path === '/sw.js') {
        res.writeHead(200, {'Content-Type':'application/javascript'});
        return res.end(`
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => clients.claim());
self.addEventListener('fetch', e => e.respondWith(fetch(e.request).catch(() => new Response('offline'))));
`);
    }

    // ── APP BILD ENDPOINT (kein Auth nötig) ──
    if (path.startsWith('/appbild/')) {
        const parts = path.split('/');
        const buid = parts[2];
        const btype = parts[3];
        const bildFile = DATA_DIR + '/bild_' + buid + '_' + btype + '.txt';
        try {
            if (!fs.existsSync(bildFile)) {
                res.writeHead(404);
                return res.end('not found');
            }
            const data = fs.readFileSync(bildFile, 'utf8');
            const mime = data.split(';')[0].replace('data:','');
            const base64 = data.split(',')[1];
            res.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'public, max-age=3600'});
            return res.end(Buffer.from(base64, 'base64'));
        } catch(e) {
            res.writeHead(500);
            return res.end('error: ' + e.message);
        }
    }


    const session = getSession(req);
    const lang = session?.lang || 'de';
    // Online Status tracken
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
<title>CreatorBoost</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#000;color:#fff;min-height:100vh}
.bg{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(212,175,55,.2) 0%,transparent 60%),#000;z-index:0}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;position:relative;padding-bottom:40px}
.logo-wrap{position:relative;z-index:1;text-align:center;padding:48px 24px 16px}
.logo-img{width:140px;height:140px;object-fit:contain;filter:drop-shadow(0 0 40px rgba(212,175,55,.5))}
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
.err{color:#ff6b6b;font-size:12px;text-align:center;margin-top:8px;display:none}
</style></head><body>
<div class="bg"></div>
<div class="hero">
  <div class="logo-wrap">
    <div class="logo-title">CreatorBoost</div>
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
  <div class="tg-wrap" id="install-wrap" style="display:none">
    <button onclick="installApp()" style="display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#d4af37,#b8960c);color:#000;padding:14px;border-radius:14px;font-size:14px;font-weight:700;width:100%;border:none;cursor:pointer">
      📱 App auf Homescreen speichern
    </button>
    <div style="font-size:11px;color:rgba(255,255,255,.35);text-align:center;margin-top:8px">Für schnelleren Zugriff</div>
  </div>
  <div class="login-wrap">
    <div class="divider"><span>Bereits Mitglied?</span></div>
    <div class="code-hint">Tippe <b style="color:#d4af37">/mycode</b> im Bot und gib deinen Code ein</div>
    <form method="POST" action="/auth/code-form">
      <input type="text" name="code" class="code-input" placeholder="Dein Code" autocomplete="off" autocapitalize="none" spellcheck="false" required>
      <button type="submit" class="login-btn" style="margin-top:10px">Einloggen →</button>
    </form>
  </div>
</div>
<script>
let deferredPrompt;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

function showInstallBanner(type) {
    if (isStandalone) return;
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#111;border-top:2px solid rgba(212,175,55,.4);padding:16px 20px;z-index:9999;display:flex;gap:12px;align-items:center;animation:slideUp .3s ease';
    if (type === 'ios') {
        banner.innerHTML = '<div style="font-size:28px">📱</div><div style="flex:1"><div style="font-size:13px;font-weight:700;color:#fff">App installieren</div><div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:3px">Tippe <b style="color:#d4af37">Teilen ↑</b> dann <b style="color:#d4af37">Zum Home-Bildschirm</b></div></div><button onclick="document.getElementById('install-banner').remove()" style="background:none;border:none;color:rgba(255,255,255,.4);font-size:22px;cursor:pointer;padding:4px">✕</button>';
    } else {
        banner.innerHTML = '<div style="font-size:28px">📱</div><div style="flex:1"><div style="font-size:13px;font-weight:700;color:#fff">App installieren</div><div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:3px">Speichere die App auf deinem Homescreen</div></div><button onclick="installApp()" style="background:linear-gradient(135deg,#d4af37,#b8960c);color:#000;border:none;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">Installieren</button>';
    }
    document.body.appendChild(banner);
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner('android');
});

async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    const b = document.getElementById('install-banner');
    if (b) b.remove();
}

if (isIOS && !isStandalone) {
    setTimeout(() => showInstallBanner('ios'), 2500);
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-wrap').style.display = 'block';
});
window.addEventListener('appinstalled', () => {
    document.getElementById('install-wrap').style.display = 'none';
    deferredPrompt = null;
});
async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('install-wrap').style.display = 'none';
}
function doLogin(){
    var c=document.getElementById('code-input').value.trim().toLowerCase();
    if(!c)return;
    var btn=document.querySelector('.login-btn');
    btn.textContent='⏳...';btn.disabled=true;
    var xhr=new XMLHttpRequest();
    xhr.open('POST','/auth/code',true);
    xhr.setRequestHeader('Content-Type','application/json');
    xhr.onload=function(){
        try{
            var data=JSON.parse(xhr.responseText);
            if(data.ok){window.location.href='/feed';}
            else{document.getElementById('err').style.display='block';btn.textContent='Einloggen →';btn.disabled=false;}
        }catch(e){btn.textContent='Einloggen →';btn.disabled=false;}
    };
    xhr.onerror=function(){btn.textContent='Einloggen →';btn.disabled=false;};
    xhr.send(JSON.stringify({code:c}));
}
document.getElementById('code-input').addEventListener('keypress',e=>{if(e.key==='Enter')doLogin();});
</script>
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

        // Daten vom Main Bot holen und Code prüfen
        const botData = await fetchBot('/data');
        if (!botData) return json({error:'Server nicht erreichbar'},503);

        const found = Object.entries(botData.users||{}).find(([, u]) => u.appCode === code);
        if (!found) { res.writeHead(302,{'Location':'/?error=1'}); return res.end(); }

        const [uid, u] = found;
        const sid = genSid();
        sessions.set(sid, {
            uid: String(uid),
            name: u.name,
            username: u.username||null,
            theme: 'dark',
            lang: 'de',
            createdAt: Date.now()
        });
        // Session läuft nicht ab — User bleibt eingeloggt
        res.writeHead(302,{'Set-Cookie':`cbsid=${sid}; HttpOnly; Path=/; Max-Age=2592000`,'Location':'/feed'});
        return res.end();
    }

    // ── TELEGRAM AUTH (legacy) ──
    if (path === '/auth/telegram') {
        if (!verifyTelegramLogin(query)) return redirect('/?error=auth');
        const sid = genSid();
        sessions.set(sid, {
            uid: query.id,
            name: query.first_name,
            username: query.username||null,
            theme: 'dark',
            lang: 'de',
            createdAt: Date.now()
        });
        // Session läuft nicht ab
        res.writeHead(302,{'Set-Cookie':`cbsid=${sid}; HttpOnly; Path=/; Max-Age=604800`,'Location':'/feed'});
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

    // ── DEBUG CODE ──
    if (path === '/debug/code') {
        const code = (new url.URL('http://x' + req.url)).searchParams.get('c')||'';
        const botData = await fetchBot('/data');
        if (!botData) return json({error:'Main Bot nicht erreichbar'});
        const found = Object.entries(botData.users||{}).find(([, u]) => u.appCode === code.toLowerCase().trim());
        return json({found: !!found, code, users: Object.keys(botData.users||{}).length});
    }


    // ── LIKE API ──
    if (path === '/api/like' && req.method === 'POST') {
        const body = await parseBody(req);
        const { msgId } = body;
        if (!msgId || !session) return json({error:'Ungültig'},400);

        // Like an Main Bot senden
        const result = await fetchBot('/like-from-app?uid=' + session.uid + '&msgId=' + encodeURIComponent(msgId));
        return json({ok:true, liked: result?.liked, likes: result?.likes});
    }


    // ── PWA MANIFEST ──
    if (path === '/manifest.json') {
        res.writeHead(200,{'Content-Type':'application/json'});
        return res.end(JSON.stringify({
            name: 'CreatorBoost',
            short_name: 'CreatorBoost',
            description: 'Die Community für Instagram Creator',
            start_url: '/feed',
            display: 'standalone',
            background_color: '#000000',
            theme_color: '#ff6b6b',
            orientation: 'portrait',
            icons: [
                {src: '/icon-192.png', sizes: '192x192', type: 'image/png'},
                {src: '/icon-512.png', sizes: '512x512', type: 'image/png'}
            ]
        }));
    }

    // ── PWA ICON (SVG als PNG Fallback) ──
    if (path === '/icon-192.png' || path === '/icon-512.png') {
        const size = path.includes('512') ? 512 : 192;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${size*0.2}" fill="#ff6b6b"/><text x="50%" y="55%" font-family="Arial" font-size="${size*0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">CB</text></svg>`;
        res.writeHead(200,{'Content-Type':'image/svg+xml'});
        return res.end(svg);
    }


    // ── PROFILBILD UPLOAD ──
    if (path === '/api/upload-profilepic' && req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString();
        try {
            const { imageData } = JSON.parse(body);
            if (!imageData?.startsWith('data:image/')) return json({error:'Kein Bild'},400);
            if (imageData.length > 3000000) return json({error:'Max 2MB'},400);
            session.profilePicData = imageData;
            saveSessions();
            try { fs.writeFileSync(DATA_DIR + '/bild_' + session.uid + '_profilepic.txt', imageData); } catch(e) {}
            return json({ok:true});
        } catch(e) { return json({error:e.message},500); }
    }

    // ── BILD UPLOAD (Banner) ──
    if (path === '/api/upload-banner' && req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try {
            const { imageData } = JSON.parse(Buffer.concat(chunks).toString());
            if (!imageData?.startsWith('data:image/')) return json({error:'Kein Bild'},400);
            if (imageData.length > 3000000) return json({error:'Max 2MB'},400);
            // In Session speichern
            session.bannerData = imageData;
            saveSessions();
            // Auf Disk speichern
            try { fs.writeFileSync(DATA_DIR + '/bild_' + session.uid + '_banner.txt', imageData); } catch(e) {}
            return json({ok:true});
        } catch(e) { return json({error:e.message},500); }
    }


    // ── FOLGEN ──
    if (path === '/api/follow' && req.method === 'POST') {
        const body = await parseBody(req);
        const targetUid = body.uid;
        if (!targetUid || targetUid === session.uid) return json({error:'Ungültig'},400);
        await postBot('/follow-api', { followerUid: session.uid, targetUid });
        return json({ok:true});
    }

    // ── POST ERSTELLEN ──
    if (path === '/api/post' && req.method === 'POST') {
        let body;
        try { body = JSON.parse(await readBody(req, 25000000)); } catch(e) { return json({error:'Zu groß oder ungültig'},400); }
        const { text, attachment, attachmentType } = body;
        if (!text?.trim() && !attachment) return json({error:'Text oder Datei erforderlich'},400);
        if (text && text.length > 300) return json({error:'Max 300 Zeichen'},400);
        await postBot('/create-post-api', { uid: session.uid, text: (text||'').trim(), attachment, attachmentType });
        return json({ok:true});
    }

    // ── POST LÖSCHEN ──
    if (path === '/api/delete-post' && req.method === 'POST') {
        const body = await parseBody(req);
        const { timestamp } = body;
        const result = await postBot('/delete-post-api', { uid: session.uid, timestamp });
        return json({ok: !!result});
    }

    // ── KOMMENTAR LÖSCHEN ──
    if (path === '/api/delete-comment' && req.method === 'POST') {
        const body = await parseBody(req);
        const { postId, commentIdx } = body;
        const result = await postBot('/delete-comment-api', { uid: session.uid, postId, commentIdx });
        return json({ok: !!result});
    }

    // ── LINK POSTEN ──
    if (path === '/api/post-link' && req.method === 'POST') {
        const body = await parseBody(req);
        const { url, caption } = body;
        if (!url || !url.includes('instagram.com')) return json({error:'Nur Instagram Links'},400);
        
        const result = await postBot('/post-link-from-app', {
            uid: session.uid,
            name: session.name,
            url: url.trim(),
            caption: body.caption||''
        });
        
        if (!result) return json({error:'Fehler beim Senden'},500);
        if (result.error) return json({error: result.error});
        return json({ok:true});
    }

    // ── POST PINNEN ──
    if (path === '/api/pin-post' && req.method === 'POST') {
        const body = await parseBody(req);
        await postBot('/pin-post-api', { uid: session.uid, timestamp: body.timestamp });
        return json({ok:true});
    }

    // ── KOMMENTAR ──
    if (path === '/api/comment' && req.method === 'POST') {
        const body = await parseBody(req);
        const { postId, text } = body;
        if (!postId || !text?.trim()) return json({error:'Ungültig'},400);
        const myName = session.name || 'User';
        await postBot('/comment-api', { uid: session.uid, name: myName, linkId: postId, text: text.trim().slice(0,200) });
        return json({ok:true});
    }

    // ── BENACHRICHTIGUNGEN ──
    if (path === '/benachrichtigungen') {
        return html(`
<div class="topbar">
  <div class="topbar-logo">Benachrichtigungen</div>
</div>
<div id="notif-list" style="padding:8px 0">
  <div class="empty"><div class="empty-icon">🔔</div><div class="empty-text">Lädt...</div></div>
</div>
<script>
fetch('/api/notifications')
  .then(r=>r.json())
  .then(data=>{
    const list = document.getElementById('notif-list');
    if(!data.notifications||!data.notifications.length){
      list.innerHTML='<div class="empty"><div class="empty-icon">🔔</div><div class="empty-text">Keine Benachrichtigungen</div></div>';
      return;
    }
    list.innerHTML = data.notifications.map(n=>\`
      <div style="padding:14px 16px;border-bottom:1px solid var(--border2);display:flex;gap:12px;align-items:center;\${n.read?'':'background:rgba(255,107,107,.05)'}">
        <div style="font-size:24px;flex-shrink:0">\${n.icon||'🔔'}</div>
        <div style="flex:1">
          <div style="font-size:13px">\${n.text}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">\${new Date(n.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>
    \`).join('');
  });
</script>`, 'notif');
    }

    // ── SUCHE ──
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
            .map(([id,u])=>({id, name:u.name, spitzname:u.spitzname, username:u.username, instagram:u.instagram, role:u.role, xp:u.xp}));
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

        // Alle heutigen Links - gruppiert nach URL (text) um Duplikate zusammenzuführen
        const byUrl = {};
        Object.entries(botData.links||{}).forEach(([id,l]) => {
            if (!l.text || new Date(l.timestamp).toDateString() !== today) return;
            const url = l.text.trim();
            if (!byUrl[url]) byUrl[url] = {likes:0, ids:[], likerNames:[]};
            const lkCount = Array.isArray(l.likes) ? l.likes.length : 0;
            // Behalte die höchste Likes-Anzahl
            if (lkCount > byUrl[url].likes) {
                byUrl[url].likes = lkCount;
                byUrl[url].likerNames = Array.isArray(l.likes) ? l.likes.slice(0,2).map(lid=>{
                    const u=botData.users[String(lid)];
                    return u?.spitzname||u?.name||'User';
                }) : [];
            }
            byUrl[url].ids.push(String(l.counter_msg_id||id));
            byUrl[url].ids.push(id);
        });

        const links = Object.entries(byUrl).map(([url,data]) => ({
            url,
            ids: [...new Set(data.ids)],
            likes: data.likes,
            likerNames: data.likerNames
        }));

        return json({links});
    }


    // ── BRIDGE LIKE SYNC (vom Bridge Bot) ──
    if (path === '/bridge-like-sync' && req.method === 'POST') {
        const body = await parseBody(req);
        // Wird vom Bridge Bot aufgerufen wenn jemand liked
        // Kein Auth nötig da intern
        return json({ok:true});
    }


    // ── INSTAGRAM THUMBNAIL ──
    if (path === '/api/insta-thumb') {
        const instaUrl = query.url || '';
        // Instagram URL zu Media URL konvertieren
        // https://www.instagram.com/reel/CODE/ -> thumbnail
        const match = instaUrl.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) { res.writeHead(404); return res.end(''); }
        const code = match[1];
        // Redirect zu Instagram thumbnail
        const thumbUrl = 'https://www.instagram.com/p/' + code + '/media/?size=m';
        res.writeHead(302, {'Location': thumbUrl, 'Cache-Control': 'public, max-age=3600'});
        return res.end();
    }


    // ── BENACHRICHTIGUNGEN ──
    if (path === '/api/notifications') {
        const botData = await fetchBot('/data');
        if (!botData) return json({notifications:[]});
        
        const notifs = (botData.notifications?.[session.uid] || [])
            .slice(-20)
            .reverse();
        
        // Als gelesen markieren
        await postBot('/mark-notifications-read', { uid: session.uid });
        
        return json({notifications: notifs});
    }

    // ── UNGELESENE BENACHRICHTIGUNGEN ZÄHLEN ──
    if (path === '/api/notifications/count') {
        const botData = await fetchBot('/data');
        if (!botData) return json({count:0});
        const unread = (botData.notifications?.[session.uid] || []).filter(n => !n.read).length;
        return json({count: unread});
    }

    // AUTH REQUIRED
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
        console.log('[SAVE] updateData:', JSON.stringify(updateData).slice(0,200));
        await postBot('/update-profile-api', updateData);
        if (session) {
            if (body.theme) session.theme = body.theme;
            if (body.lang) session.lang = body.lang;
            saveSessions();
        }
        return json({ok:true});
    }

    // ── FEED ──
    if (path === '/feed') {
        const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
        const todayLinks = Object.entries(d.links||{})
            .filter(([,l]) => l.timestamp && l.timestamp >= twoDaysAgo)
            .sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
        // Deduplizieren - gleiche counter_msg_id nur einmal zeigen
        const seenMsgIds = new Set();
        const dedupLinks = todayLinks.filter(([id,l]) => {
            const key = String(l.counter_msg_id||id);
            if (seenMsgIds.has(key)) return false;
            seenMsgIds.add(key);
            return true;
        });

        const topUsers = Object.entries(d.users||{})
            .filter(([id,u])=>!adminIds.includes(Number(id))&&u.started&&u.inGruppe!==false)
            .sort((a,b)=>(b[1].xp||0)-(a[1].xp||0))
            .slice(0,10);

        const storiesHtml = `
<div class="stories">
  ${topUsers.map(([id,u])=>{
    const insta = u.instagram;
    const hasLink = Object.values(d.links||{}).some(l=>l.user_id===Number(id)&&new Date(l.timestamp).toDateString()===today);
    return `<a href="/profil/${id}" class="story-item">
      <div class="story-ring ${hasLink?'':'seen'}">
        <div class="story-inner">
          ${insta?`<img src="https://unavatar.io/instagram/${insta}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'" alt="">`:''}
          <span style="${insta?'display:none':''}font-size:18px">${(u.name||'?').slice(0,1)}</span>
        </div>
      </div>
      <div class="story-name">${u.spitzname||u.name||'?'}</div>
    </a>`;
  }).join('')}
</div>`;

        const postsHtml = todayLinks.length === 0
            ? `<div class="empty" style="margin-top:60px"><div class="empty-icon">📭</div><div class="empty-text">Noch keine Links heute</div><div class="empty-sub">Sei der Erste!</div></div>`
            : (()=>{
                const todayStr = new Date().toDateString();
                const heuteLinks = dedupLinks.filter(([,l])=>new Date(l.timestamp||0).toDateString()===todayStr);
                const aelterLinks = dedupLinks.filter(([,l])=>new Date(l.timestamp||0).toDateString()!==todayStr);
                const renderLink = ([msgId, link])=>{
                const poster = d.users[String(link.user_id)]||{};
                // Alle Likes aus URL-Gruppe zusammenführen
            const allLinksForUrl = Object.values(d.links||{}).filter(l=>l.text===link.text);
            const allLikes = new Set();
            allLinksForUrl.forEach(l => { (Array.isArray(l.likes)?l.likes:[]).forEach(id=>allLikes.add(id)); });
            const likes = [...allLikes];
            const hasLiked = likes.includes(Number(myUid));
            const likerNames = likes.slice(0,2).map(lid=>{
                const likerName = link.likerNames?.[lid];
                if(likerName) return likerName.name||'User';
                const u=d.users[String(lid)];
                return u?.spitzname||u?.name||'User';
            });
                const insta = poster.instagram;
                const grad = badgeGradient(poster.role);
                return `<div class="post fade-up" id="post-${msgId}" data-url="${link.text}" data-ts="${link.timestamp||0}">
  <div class="post-header">
    <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--bg4);display:flex;align-items:center;justify-content:center;flex-shrink:0;${insta?'':`background:${grad}`}">
      ${insta?`<img src="https://unavatar.io/instagram/${insta}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.fontSize='16px';this.style.display='none'" alt="">`:''}
      <span style="font-size:16px;${insta?'display:none':''}">${(poster.name||'?').slice(0,1)}</span>
    </div>
    <div class="post-user-info">
      <div class="post-name">${poster.spitzname||poster.name||'User'}</div>
      <div class="post-badge">${poster.role||''} ${insta?`· 📸 @${poster.instagram}`:''}</div>
    </div>
    <div class="post-time">${new Date(link.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>
  <div onclick="window.open('${link.text}','_blank')" style="cursor:pointer;margin:0 16px;border-radius:12px;overflow:hidden;background:var(--bg4);border:1px solid var(--border2)">
    <div style="position:relative;width:100%;height:140px;overflow:hidden">
      <div style="position:absolute;inset:0;background:${ladeBild(String(link.user_id),'banner')?'#000':'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)'}"></div>
      ${ladeBild(String(link.user_id),'banner') ? '<img src="/appbild/'+String(link.user_id)+'/banner" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" alt="">' : ''}
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,.7))"></div>
      <div style="position:absolute;bottom:12px;left:12px;display:flex;align-items:center;gap:10px">
        <div style="width:48px;height:48px;border-radius:50%;border:2px solid rgba(255,255,255,.3);overflow:hidden;background:var(--bg4);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff">
          ${ladeBild(String(link.user_id),'profilepic') ? '<img src="/appbild/'+String(link.user_id)+'/profilepic" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()" alt="">' : poster.instagram ? '<img src="https://unavatar.io/instagram/'+poster.instagram+'" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()" alt="">' : (poster.name||'?').slice(0,2).toUpperCase()}
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#fff">${poster.spitzname||poster.name||'User'}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7)">${poster.role||''} ${poster.trophies&&poster.trophies.length?poster.trophies.slice(0,3).join(' '):''}</div>
        </div>
      </div>
    </div>
    <div style="padding:10px 12px;display:flex;align-items:center;gap:8px">
      <div style="font-size:18px">📸</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600">Instagram</div>
        <div style="font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${link.text.replace('https://www.','').slice(0,45)}</div>
      </div>
      <div style="font-size:10px;color:var(--accent);font-weight:600">Öffnen →</div>
    </div>
  </div>
  <div class="post-actions">
    ${String(link.user_id) === String(myUid) ? '<div style="font-size:12px;color:var(--muted);padding:7px 12px">👤 Dein Link</div>' : `<button class="post-action-btn ${hasLiked?'liked':''}" onclick="likePost('${link.counter_msg_id||msgId}',this)" data-msgid="${link.counter_msg_id||msgId}" ${hasLiked?'disabled':''}>` }
      <svg width="20" height="20" viewBox="0 0 24 24" fill="${hasLiked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      <span id="likes-${link.counter_msg_id||msgId}" class="like-count">${likes.length}</span>
    ${String(link.user_id) !== String(myUid) ? '</button>' : ''}
  </div>
  ${likes.length>0?`<div class="post-likers"><span>${likerNames.join(', ')}</span>${likes.length>2?` und ${likes.length-2} weitere`:''} haben geliked</div>`:''}
</div>`;
                };
                const heuteHtml = heuteLinks.map(renderLink).join('');
                const aelterHtml = aelterLinks.map(renderLink).join('');
                return (heuteHtml||'<div class="empty"><div class="empty-icon">📅</div><div class="empty-text">Noch keine Links heute</div></div>') + '</div><div id="feed-aelter" style="padding:8px 0 80px;display:none">' + (aelterHtml||'<div class="empty"><div class="empty-icon">🕐</div><div class="empty-text">Keine älteren Links</div></div>');
              })()
        return html(`
<div class="topbar">
  <div class="topbar-logo">CreatorBoost</div>
  <div class="topbar-actions">
    <button class="icon-btn" onclick="setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')">⚡</button>
  </div>
</div>
${storiesHtml}
<div style="height:1px;background:var(--border2)"></div>
${postsHtml}
<script>
// Auto-refresh Like Counter alle 10 Sekunden
async function refreshLikes() {
    try {
        const res = await fetch('/api/likes-update');
        const data = await res.json();
        if (data.links) {
            data.links.forEach(l => {
                // Versuche beide mögliche IDs
                // Suche nach counter_msg_id und mapKey
                const ids = [l.id, l.mapKey, 'B_'+l.id, 'C_'+l.id];
                // Auch alle Buttons mit data-mapkey prüfen
                document.querySelectorAll('[data-mapkey]').forEach(btn => {
                    const mapkey = btn.getAttribute('data-mapkey');
                    if (mapkey === l.mapKey || mapkey === 'B_'+l.id || mapkey === 'C_'+l.id) {
                        const msgid = btn.getAttribute('data-msgid');
                        if (msgid) {
                            const countEl = document.getElementById('likes-' + msgid);
                            if (countEl && countEl.textContent !== String(l.likes)) {
                                countEl.textContent = l.likes;
                                if (l.likes > 0) {
                                    btn.classList.add('liked');
                                    btn.querySelector('svg')?.setAttribute('fill','currentColor');
                                }
                            }
                        }
                    }
                });
                ids.forEach(tryId => {
                    const countEl = document.getElementById('likes-' + tryId);
                    if (countEl && countEl.textContent !== String(l.likes)) {
                        countEl.textContent = l.likes;
                        const btn = countEl.closest('.post-action-btn');
                        if (btn && l.likes > 0) {
                            btn.classList.add('liked');
                            btn.querySelector('svg')?.setAttribute('fill','currentColor');
                        }
                    }
                });
            });
        }
    } catch(e) {}
}
setInterval(refreshLikes, 5000);


async function switchFeedTab(tab, el) {
    ['tab-heute','tab-aelter'].forEach(id=>{
        const btn = document.getElementById(id);
        if(!btn) return;
        const isActive = btn === el;
        btn.style.color = isActive ? 'var(--accent)' : 'var(--muted)';
        btn.style.borderBottom = isActive ? '2px solid var(--accent)' : '2px solid transparent';
    });
    const todayStr = new Date().toDateString();
    document.querySelectorAll('#feed-list .post[data-ts]').forEach(post => {
        const isToday = new Date(Number(post.getAttribute('data-ts'))).toDateString() === todayStr;
        post.style.display = (tab==='heute' ? isToday : !isToday) ? 'block' : 'none';
    });
}
// Standard Tab beim Laden
setTimeout(()=>switchFeedTab('heute', document.getElementById('tab-heute')), 50);

function likePost(msgId, btn) {
    const countEl = document.getElementById('likes-'+msgId);
    const wasLiked = btn.classList.contains('liked');
    if (wasLiked) return; // Kein Unlike möglich
    btn.classList.add('liked');
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
    countEl.textContent = Number(countEl.textContent) + 1;
    btn.style.animation='pulse .3s ease';
    btn.disabled = true;
    setTimeout(()=>btn.style.animation='',300);
    try {
        const res = await fetch('/api/like', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({msgId})
        });
        const data = await res.json();
        // Server Status übernehmen
        if (data.ok) {
            const isNowLiked = data.liked !== undefined ? data.liked : !wasLiked;
            btn.classList.toggle('liked', isNowLiked);
            btn.querySelector('svg').setAttribute('fill', isNowLiked ? 'currentColor' : 'none');
            if (data.likes !== undefined) countEl.textContent = data.likes;
            toast(isNowLiked ? '❤️ Geliked!' : 'Like entfernt');
        }
    } catch(e) {
        toast(wasLiked ? 'Like entfernt' : '❤️ Geliked!');
    }
}
</script>`, 'feed');
    }

    // ── BENACHRICHTIGUNGEN ──
    if (path === '/benachrichtigungen') {
        return html(`
<div class="topbar">
  <div class="topbar-logo">Benachrichtigungen</div>
</div>
<div id="notif-list" style="padding:8px 0">
  <div class="empty"><div class="empty-icon">🔔</div><div class="empty-text">Lädt...</div></div>
</div>
<script>
fetch('/api/notifications')
  .then(r=>r.json())
  .then(data=>{
    const list = document.getElementById('notif-list');
    if(!data.notifications||!data.notifications.length){
      list.innerHTML='<div class="empty"><div class="empty-icon">🔔</div><div class="empty-text">Keine Benachrichtigungen</div></div>';
      return;
    }
    list.innerHTML = data.notifications.map(n=>\`
      <div style="padding:14px 16px;border-bottom:1px solid var(--border2);display:flex;gap:12px;align-items:center;\${n.read?'':'background:rgba(255,107,107,.05)'}">
        <div style="font-size:24px;flex-shrink:0">\${n.icon||'🔔'}</div>
        <div style="flex:1">
          <div style="font-size:13px">\${n.text}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">\${new Date(n.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>
    \`).join('');
  });
</script>`, 'notif');
    }

    // ── SUCHE ──
    if (path === '/suche') {
        return html(`
<div class="topbar">
  <div class="topbar-logo">Suche</div>
</div>
<div style="padding:12px 16px">
  <div style="position:relative">
    <input type="text" id="search-input" class="form-input" placeholder="🔍 User oder Link suchen..." oninput="doSearch(this.value)" autocomplete="off" style="padding-left:14px">
  </div>
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
            html += data.users.map(u=>\`<a href="/profil/\${u.id}" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border2)">
                <div style="width:40px;height:40px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">\${(u.name||'?').slice(0,2).toUpperCase()}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600">\${u.spitzname||u.name||'?'}</div>
                    <div style="font-size:11px;color:var(--muted)">\${u.role||''} · \${u.xp||0} XP</div>
                </div>
            </a>\`).join('');
        }
        if (data.links.length) {
            html += '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px">🔗 Links</div>';
            html += data.links.map(l=>\`<a href="\${l.text}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border2)">
                <div style="font-size:24px;flex-shrink:0">📸</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${l.text}</div>
                    <div style="font-size:11px;color:var(--muted)">👤 \${l.user_name} · ❤️ \${l.likes}</div>
                </div>
            </a>\`).join('');
        }
        if (!data.users.length && !data.links.length) html = '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">Nichts gefunden</div></div>';
        document.getElementById('search-results').innerHTML = html;
    }, 300);
}
document.getElementById('search-input').focus();
</script>`, 'search');
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
<div class="tabs">
  <div class="tab active">⭐ Gesamt</div>
</div>
${sorted.map(([id,u],i)=>{
    const isMe = id===myUid;
    const insta = u.instagram;
    const grad = badgeGradient(u.role);
    return `<a href="/profil/${id}" class="rank-item ${isMe?'rank-me':''}">
    <div class="rank-pos">${i<3?medals[i]:`<span class="rank-num">${i+1}</span>`}</div>
    <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:${grad};display:flex;align-items:center;justify-content:center;flex-shrink:0">
      ${insta?`<img src="https://unavatar.io/instagram/${insta}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" alt="">`:'' }
      <span style="color:#fff;font-weight:700;font-size:14px">${(u.name||'?').slice(0,2).toUpperCase()}</span>
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
        const myPosts = (d.posts||{})[myUid] || [];
        const myPostsHtml = myPosts.length
            ? myPosts.slice().reverse().map((p,i)=>{
                const pid = myUid+'_'+p.timestamp;
                let attachHtml = '';
                if(p.attachment && p.attachmentType==='image') attachHtml = '<img src="'+p.attachment+'" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-top:8px" alt="">';
                if(p.attachment && p.attachmentType==='audio') attachHtml = '<audio controls src="'+p.attachment+'" style="width:100%;margin-top:8px"></audio>';
                const postComments = (d.comments&&d.comments[pid])||[];
                const commentsHtml = postComments.map((c,ci)=>'<div style="display:flex;gap:8px;margin-top:6px;align-items:center">'
                    +'<span style="font-size:11px;font-weight:600">'+c.name+'</span>'
                    +'<span style="font-size:11px;color:var(--muted);flex:1">'+c.text+'</span>'
                    +(String(c.uid)===String(myUid)?'<button onclick="deleteComment(this)" data-pid="'+pid+'" data-idx="'+ci+'" style="background:none;border:none;color:var(--muted2);font-size:12px;cursor:pointer">✕</button>':'')
                    +'</div>').join('');
                return '<div style="padding:12px 16px;border-top:1px solid var(--border2)">'
                    +'<div style="display:flex;justify-content:space-between;align-items:start">'
                    +'<div style="font-size:13px;line-height:1.6;flex:1">'+p.text+'</div>'
                    +'<button onclick="deletePost('+p.timestamp+')" style="background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;flex-shrink:0;padding:0 0 0 8px">🗑️</button>'
                    +'</div>'
                    +attachHtml
                    +'<div style="font-size:11px;color:var(--muted);margin-top:6px">'+new Date(p.timestamp).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})+'</div>'
                    +'<div style="margin-top:8px">'+commentsHtml+'</div>'
                    +'<div style="display:flex;gap:8px;margin-top:8px">'
                    +'<input type="text" placeholder="Kommentar..." style="flex:1;background:var(--bg4);border:1px solid var(--border);border-radius:20px;padding:6px 12px;font-size:12px;color:var(--text);outline:none" id="comment-'+pid+'">'
                    +'<button onclick="document.getElementById(\'comment-\'+this.dataset.pid).value&&sendComment(this)" data-pid="'+pid+'" style="background:var(--accent);color:#fff;border:none;border-radius:20px;padding:6px 14px;font-size:12px;cursor:pointer">Senden</button>'
                    +'</div>'
                    +'</div>';
            }).join('')
            : '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Noch keine Posts</div><div class="empty-sub">Teile deine Gedanken!</div></div>';
        // Banner und Profilbild aus Session oder Disk laden
        const myBannerData = session.bannerData || ladeBild(myUid, 'banner');
        const myPicData = session.profilePicData || ladeBild(myUid, 'profilepic');
        return html(`
<div class="topbar">
  <div class="topbar-logo">Profil</div>
  <a href="/einstellungen" class="icon-btn">⚙️</a>
</div>
${profileCard(myUid, myUser, d, true, lang, adminIds, myBannerData, myPicData)}
<div class="tabs" style="margin-top:8px">
  <div class="tab active" onclick="showPTab('posts',this)">📝 Posts</div>
  <div class="tab" onclick="showPTab('links',this)">🔗 Links</div>
  <div class="tab" onclick="showPTab('postlink',this)">📸 Link teilen</div>
</div>
<div id="ptab-postlink" style="display:none">
  <div style="padding:16px">
    <div style="font-size:13px;color:var(--muted);margin-bottom:12px">Teile deinen Instagram Link mit der Community — wird direkt in der Gruppe gepostet.</div>
    <input type="url" id="link-input" class="form-input" placeholder="https://www.instagram.com/reel/..." style="margin-bottom:8px">
    <textarea id="link-caption" class="form-input" placeholder="Beschreibung (optional)..." maxlength="200" rows="2" style="margin-bottom:8px"></textarea>
    <button class="btn btn-primary btn-full" onclick="postLink()">📸 Link teilen</button>
    <div id="link-result" style="margin-top:8px;font-size:12px;text-align:center"></div>
  </div>
</div>
<div id="ptab-posts">
  <div style="padding:12px 16px">
    <textarea id="new-post" class="form-input" placeholder="Was denkst du gerade? (max 300 Zeichen)" maxlength="300" rows="3"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px;background:var(--bg4);border:1px solid var(--border);border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;flex:1">
        🖼️ Bild
        <input type="file" accept="image/*" style="display:none" onchange="attachFile(this,'image')">
      </label>
      <label style="display:flex;align-items:center;gap:6px;background:var(--bg4);border:1px solid var(--border);border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;flex:1">
        🎵 Musik (max 20MB)
        <input type="file" accept="audio/*,audio/mp3,audio/mpeg,audio/wav,audio/ogg" style="display:none" onchange="attachFile(this,'audio')">
      </label>
    </div>
    <div id="attachment-preview" style="margin-top:8px;display:none"></div>
    <button class="btn btn-primary btn-full" style="margin-top:8px" onclick="submitPost()">📝 Posten</button>
  </div>
  ${myPostsHtml}
</div>
<div id="ptab-links" style="display:none">
  ${Object.values(d.links||{}).filter(l=>l.user_id===Number(myUid)).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).map(l=>'<div style="padding:12px 16px;border-top:1px solid var(--border2)"><a href="'+l.text+'" target="_blank" style="color:var(--blue);font-size:12px;word-break:break-all">'+l.text+'</a><div style="font-size:11px;color:var(--muted);margin-top:4px">❤️ '+(Array.isArray(l.likes)?l.likes.length:0)+' Likes · '+new Date(l.timestamp).toLocaleDateString('de-DE')+'</div></div>').join('') || '<div class="empty"><div class="empty-icon">🔗</div><div class="empty-text">Noch keine Links</div></div>'}
</div>
<script>
async function deletePost(timestamp) {
    if (!confirm('Post löschen?')) return;
    const res = await fetch('/api/delete-post', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp})});
    const data = await res.json();
    if (data.ok) { toast('✅ Gelöscht'); setTimeout(()=>location.reload(),500); }
    else toast('❌ Fehler');
}
async function deleteComment(btn) {
    const postId = btn.getAttribute("data-pid");
    const idx = btn.getAttribute("data-idx");
    const res = await fetch('/api/delete-comment', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId, commentIdx: idx})});
    const data = await res.json();
    if (data.ok) { toast('✅ Kommentar gelöscht'); setTimeout(()=>location.reload(),500); }
}
function showPTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('ptab-posts').style.display = tab==='posts'?'block':'none';
    document.getElementById('ptab-links').style.display = tab==='links'?'block':'none';
    const pl = document.getElementById('ptab-postlink');
    if(pl) pl.style.display = tab==='postlink'?'block':'none';
}
async function postLink() {
    const url = document.getElementById('link-input')?.value?.trim();
    const result = document.getElementById('link-result');
    if (!url) return;
    if (!url.includes('instagram.com')) { result.style.color='var(--rd)'; result.textContent='❌ Nur Instagram Links erlaubt'; return; }
    const btn = document.querySelector('[onclick="postLink()"]');
    btn.disabled = true; btn.textContent = '⏳ Wird gesendet...';
    try {
        const caption = document.getElementById('link-caption')?.value?.trim() || '';
        const res = await fetch('/api/post-link', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({url, caption})
        });
        const data = await res.json();
        if (data.ok) {
            result.style.color='var(--gr)';
            result.textContent='✅ Link erfolgreich geteilt!';
            document.getElementById('link-input').value='';
        } else {
            result.style.color='var(--rd)';
            result.textContent='❌ '+(data.error||'Fehler');
        }
    } catch(e) { result.style.color='var(--rd)'; result.textContent='❌ Netzwerkfehler'; }
    btn.disabled=false; btn.textContent='📸 Link teilen';
}
async function sendComment(btn) {
    const postId = btn.getAttribute('data-pid');
    const input = document.getElementById('comment-'+postId);
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    try {
        await fetch('/api/comment', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({postId, text})
        });
        toast('✅ Kommentar gesendet');
        setTimeout(()=>location.reload(), 800);
    } catch(e) { toast('❌ Fehler'); }
}
let attachedFile = null;
let attachedType = null;

function attachFile(input, type) {
    const file = input.files[0];
    if (!file) return;
    const maxSize = type === 'audio' ? 20000000 : 5000000;
    const maxLabel = type === 'audio' ? '20MB' : '5MB';
    if (file.size > maxSize) return toast('❌ Max ' + maxLabel + ' für ' + (type==='audio'?'Musik':'Bilder'));
    const reader = new FileReader();
    reader.onload = (e) => {
        attachedFile = e.target.result;
        attachedType = type;
        const preview = document.getElementById('attachment-preview');
        preview.style.display = 'block';
        if (type === 'image') {
            preview.innerHTML = '<img src="'+attachedFile+'" style="max-height:120px;border-radius:8px;object-fit:cover" alt=""><button onclick="removeAttachment()" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer">×</button>';
            preview.style.position = 'relative';
        } else if (type === 'audio') {
            preview.innerHTML = '<audio controls src="'+attachedFile+'" style="width:100%;border-radius:8px"></audio>';
        } else {
            preview.innerHTML = '<div style="background:var(--bg4);padding:8px 12px;border-radius:8px;font-size:12px">📎 '+file.name+'</div>';
        }
    };
    reader.readAsDataURL(file);
}

function removeAttachment() {
    attachedFile = null;
    attachedType = null;
    const preview = document.getElementById('attachment-preview');
    preview.style.display = 'none';
    preview.innerHTML = '';
}

async function pinPost(timestamp) {
    await fetch('/api/pin-post', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp})});
    location.reload();
}
async function submitPost() {
    const text = document.getElementById('new-post').value.trim();
    if (!text && !attachedFile) return toast('❌ Text oder Datei erforderlich');
    const btn = document.querySelector('[onclick="submitPost()"]');
    btn.disabled = true;
    btn.textContent = '⏳...';
    const payload = JSON.stringify({text, attachment: attachedFile, attachmentType: attachedType});
    const res = await fetch('/api/post', {
        method:'POST',
        headers:{'Content-Type':'application/json','Content-Length':payload.length},
        body: payload
    });
    const data = await res.json();
    if (data.ok) { toast('✅ Post veröffentlicht!'); setTimeout(()=>location.reload(),1000); }
    else { toast('❌ ' + (data.error||'Fehler')); btn.disabled=false; btn.textContent='📝 Posten'; }
}
</script>`, 'profile');
    }

    // ── FREMDES PROFIL ──
    if (path.startsWith('/profil/')) {
        const uid = path.replace('/profil/','');
        const u = d.users[uid];
        if (!u) return redirect('/feed');
        const isFollowing = (d.users[myUid]?.following||[]).map(String).includes(String(uid));
        const followerCount = (u.followers||[]).length;
        return html(`
<div class="topbar">
  <a href="javascript:history.back()" class="icon-btn" style="font-size:22px">‹</a>
  <div style="font-size:15px;font-weight:600">${u.spitzname||u.name||'User'}</div>
  <button onclick="toggleFollow('${uid}',this)" style="background:${isFollowing?'var(--bg4)':'var(--accent)'};color:${isFollowing?'var(--muted)':'#fff'};border:1px solid var(--border);border-radius:20px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer">${isFollowing?'Gefolgt':'Folgen'}</button>
</div>
${profileCard(uid, u, d, false, lang, adminIds)}
<script>
async function toggleFollow(uid, btn) {
    const isFollowing = btn.textContent.trim() === 'Gefolgt';
    btn.textContent = isFollowing ? 'Folgen' : 'Gefolgt';
    btn.style.background = isFollowing ? 'var(--accent)' : 'var(--bg4)';
    btn.style.color = isFollowing ? '#fff' : 'var(--muted)';
    await fetch('/api/follow', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid})});
    toast(isFollowing ? 'Nicht mehr gefolgt' : '✅ Gefolgt!');
}
</script>`, 'feed');
    }

    // ── EINSTELLUNGEN ──
    if (path === '/einstellungen') {
        const u = myUser || {};
        const gradients = [
            'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)',
            'linear-gradient(135deg,#0d0d0d,#1a0a00,#3d1f00)',
            'linear-gradient(135deg,#0a0a1a,#1a0a2e,#2e0a3d)',
            'linear-gradient(135deg,#000428,#004e92)',
            'linear-gradient(135deg,#1a0000,#3d0000,#1a0000)',
            'linear-gradient(135deg,#0a2e0a,#1a3d1a,#0a1f0a)',
            'linear-gradient(135deg,#2d1b69,#11998e)',
            'linear-gradient(135deg,#fc4a1a,#f7b733)',
            'linear-gradient(135deg,#141e30,#243b55)',
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
      ${myUser?.profilePic ? `<img src="${myUser.profilePic}" style="width:100%;height:100%;object-fit:cover" alt="">` : (myUser?.instagram ? `<img src="https://unavatar.io/instagram/${myUser.instagram}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" alt="">` : (myUser?.name||'?').slice(0,2).toUpperCase())}
    </div>
    <div style="flex:1">
      <label style="display:inline-flex;align-items:center;gap:8px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;cursor:pointer;font-size:13px">
        📷 Foto hochladen
        <input type="file" accept="image/*" style="display:none" onchange="uploadProfilePic(this)">
      </label>
      <div style="font-size:10px;color:var(--muted2);margin-top:4px">Max 1.5MB · Wird als Profilbild gesetzt</div>
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
  <div class="form-label">Social Links</div>
  <input type="text" class="form-input" id="inp-tiktok" placeholder="TikTok @username" maxlength="50" value="${u.tiktok||''}" style="margin-bottom:8px">
  <input type="text" class="form-input" id="inp-youtube" placeholder="YouTube @channel" maxlength="50" value="${u.youtube||''}" style="margin-bottom:8px">
  <input type="text" class="form-input" id="inp-twitter" placeholder="Twitter/X @username" maxlength="50" value="${u.twitter||''}">
</div>

<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Banner</div>

  <!-- Foto hochladen -->
  <div style="margin-bottom:12px">
    <label style="display:flex;align-items:center;gap:10px;background:var(--bg4);border:1px dashed var(--border);border-radius:var(--radius-sm);padding:12px;cursor:pointer;text-transform:none;font-size:13px;font-weight:500;letter-spacing:0">
      <span style="font-size:20px">📷</span>
      <span>Eigenes Foto hochladen</span>
      <input type="file" accept="image/*" style="display:none" onchange="uploadBanner(this)">
    </label>
    <div style="font-size:10px;color:var(--muted2);margin-top:4px">Max 1.5MB · JPG, PNG</div>
  </div>

  <!-- Gradient wählen -->
  <div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Oder Gradient wählen</div>
  <div class="gradient-grid" id="gradient-grid">
    ${gradients.map((g,i)=>`<div class="gradient-opt ${(u.banner||gradients[0])===g?'selected':''}" style="background:${g}" onclick="selectBanner('${g}',this)" data-val="${g}"></div>`).join('')}
  </div>
</div>

<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Akzentfarbe</div>
  <div class="color-grid">
    ${accentColors.map(c=>`<div class="color-opt ${(u.accentColor||'#ff6b6b')===c?'selected':''}" style="background:${c}" onclick="selectAccent('${c}',this)">
      ${(u.accentColor||'#ff6b6b')===c?'✓':''}</div>`).join('')}
  </div>
</div>

<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="setting-row" style="padding:0">
    <div><div class="setting-label">Dark Mode</div></div>
    <button class="toggle ${(session?.theme||'dark')==='dark'?'on':''}" id="theme-toggle" onclick="toggleTheme(this)"></button>
  </div>
</div>

<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div class="form-label">Sprache</div>
  <div style="display:flex;gap:8px;margin-top:8px">
    <button class="btn btn-sm ${lang==='de'?'btn-primary':'btn-outline'}" onclick="setLang('de')">🇩🇪 Deutsch</button>
    <button class="btn btn-sm ${lang==='en'?'btn-primary':'btn-outline'}" onclick="setLang('en')">🇬🇧 English</button>
  </div>
</div>

<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <button class="btn btn-primary btn-full" onclick="saveProfile()">💾 Speichern</button>
</div>

<div style="padding:16px">
  <a href="/logout" class="btn btn-outline btn-full" style="color:var(--accent)">🚪 Ausloggen</a>
</div>

<script>
let selectedBanner = '${(u.banner||gradients[0]).replace(/'/g,"\\'")}';
let selectedAccent = '${u.accentColor||'#ff6b6b'}';
console.log('Banner init:', selectedBanner.slice(0,30));

function selectBanner(val, el) {
    document.querySelectorAll('.gradient-opt').forEach(e=>e.classList.remove('selected'));
    el.classList.add('selected');
    selectedBanner = val;
    document.querySelector('.profile-banner')&&(document.querySelector('.profile-banner').style.background=val);
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
    if (file.size > 1500000) return toast('❌ Bild zu groß (max 1.5MB)');
    const reader = new FileReader();
    reader.onload = async (e) => {
        const imageData = e.target.result;
        try {
            const res = await fetch('/api/upload-profilepic', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({imageData})
            });
            const data = await res.json();
            if (data.ok) {
                document.getElementById('pic-preview').innerHTML = '<img src="'+imageData+'" style="width:100%;height:100%;object-fit:cover" alt="">';
                toast('✅ Profilbild gesetzt!');
            } else toast('❌ ' + (data.error||'Fehler'));
        } catch(e) { toast('❌ Upload Fehler'); }
    };
    reader.readAsDataURL(file);
}

async function uploadBanner(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1500000) return toast('❌ Bild zu groß (max 1.5MB)');

    const reader = new FileReader();
    reader.onload = async (e) => {
        const imageData = e.target.result;
        try {
            const res = await fetch('/api/upload-banner', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({imageData})
            });
            const data = await res.json();
            if (data.ok) {
                toast('✅ Banner gespeichert!');
                setTimeout(() => location.href = '/profil', 1000);
            } else {
                toast('❌ ' + (data.error||'Fehler'));
            }
        } catch(e) { toast('❌ Upload Fehler'); }
    };
    reader.readAsDataURL(file);
}

async function saveProfile() {
    const bio = document.getElementById('inp-bio')?.value || '';
    const spitzname = document.getElementById('inp-spitzname')?.value || '';
    const themeToggle = document.getElementById('theme-toggle');
    const theme = themeToggle?.classList.contains('on') ? 'dark' : 'light';
    const btn = document.querySelector('.btn-primary');
    if(btn) { btn.textContent = '⏳ Speichern...'; btn.disabled = true; }
    try {
        const nische = document.getElementById('inp-nische')?.value?.trim()||'';
        const website = document.getElementById('inp-website')?.value?.trim()||'';
        const tiktok = document.getElementById('inp-tiktok')?.value?.trim().replace('@','')||'';
        const youtube = document.getElementById('inp-youtube')?.value?.trim().replace('@','')||'';
        const twitter = document.getElementById('inp-twitter')?.value?.trim().replace('@','')||'';
        const payload = {bio, spitzname, accentColor: selectedAccent, theme, nische, website, tiktok, youtube, twitter};
        if (selectedBanner) payload.banner = selectedBanner;
        const res = await fetch('/api/save-profile', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.ok) { 
            toast('✅ Gespeichert!'); 
            setTimeout(()=>location.reload(), 1200); 
        } else { 
            toast('❌ Fehler: ' + (data.error||'Unbekannt')); 
        }
    } catch(e) { 
        console.error('Save error:', e);
        toast('❌ Netzwerkfehler'); 
    }
    if(btn) { btn.textContent = '💾 Speichern'; btn.disabled = false; }
}
document.getElementById('inp-bio').addEventListener('input', function() {
    this.nextElementSibling.textContent = this.value.length + '/100';
});
</script>`, 'settings');
    }

    redirect('/feed');
});

server.listen(PORT, () => console.log('🌐 CreatorBoost App läuft auf Port ' + PORT));
