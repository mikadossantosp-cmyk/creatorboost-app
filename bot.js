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
  <a href="/einstellungen" class="nav-item ${page==='settings'?'active':''}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
    ${page==='settings'?'<div class="nav-dot"></div>':''}
  </a>
</nav>` : ''}
<script>
function toast(msg,dur=2500){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);fetch('/api/theme',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t})});}
function setLang(l){fetch('/api/lang',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:l})}).then(()=>location.reload());}
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
  ${u.bio?`<div class="profile-bio">${u.bio}</div>`:''}
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
  <div class="profile-stat"><div class="profile-stat-val">${xp}</div><div class="profile-stat-label">XP</div></div>
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

    function redirect(to) { res.writeHead(302,{'Location':to}); res.end(); }
    function html(content, page) { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(layout(content,session,page,lang)); }
    function json(data, status=200) { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }

    // ── LANDING ──
    if (path === '/' || path === '') {
        if (session) return redirect('/feed');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        const logoSrc = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAkkBDgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxmiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKK7P4Z+B18Z644u2ZNOswHuCpwXJ+6gPbODz6A0AcZRX0HfeIfhd4bv20CbTrLdGdk22xEiofRmIJJ9etcp8Vfh3punaYnifw6ix2bFfPhjOYwG+66egJIGOnIxQB5PRXofwo+H9v4tu59R1QM2nWbBPKU486Trgn0Axn6iu3m8a/CuzvW0b+yLVoVby2mTT0aEHoeep+oBoA8For1X4rfDmw0ewTxHoCBLJ2UTwq2UTd911PoSQMe4xXHeDfAuq+Nri5j06S3iS1VTLJOxAG7O0DAJJOD+VAHN0Vq3XhrU7TxOfDjxBtQE4gCIchmOMEH0OQfpXtMPhjwJ8MtFguPEKQXl7JwZJ4vNaRu+xDwAPX8zQB4DRX0NYW/w5+Jlrc21jp8MVxEuWKW4gmQHowI6jP1Hr1rx//hC51+IJ8JS3cUTi48s3DkKNmNwbB7lcYHqcUAczRX0Fex/DX4ZxQ2d5Yw3F4ybvngE87D+8SeFz+HsKkg0L4f8AxN0W4l0qyhtpkO0ywwCGWFyOCwHDD8weaAPnmirGoWUum6ldWE2PNtZnhfHTcpIP8qr0AFFdn8J9GsNc8dW9vqNutxBHE8vlOMqxA4yO456V69q2o/DLQr1rLVNN020nHOyTSCMjpkHy8EcdRxQB83UV9Cf8JV8IP+eWj/8AgqP/AMbq1purfC/Wb1LLTdP0y6uH6RxaQxOPU/u+B7nigD5xor6Fufgt4fu/FE+pylorB8MunwDYobHzcjkKTzgY+vavEfFqWUfi3VE03yfsa3TiDySCmzPGMcYoAyKnsrG71G6S1sbaW5nkOFji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UUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRXefDb4bXHi+6F/fq8Ojwt8z9GnI/hX29T+A56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iWS4Qugjk3cA45rDoAK6z4ceD28X+J44JVP2C2xLdt/s54X6sePpn0rloYZLiZIYUaSSRgqIoyWJOABX1F4A8JReDvDEVmwU3cv727kHdyOmfQDj9e9AE/i/xTY+CfD/ANvmiDAMsUFuhALn0HoAAT+FS6pp+meOPCT25cSWl/CHilA5UkZVh7g/4V4F8UvGB8V+J3S2k3afY5it8Hhz/E/4kcewFdj8DvGODJ4VvZfWWyLH8XT/ANmH/AqAPJtY0q60PVrnTL1NlxbSFHHY+hHsRgj2NU692+Nfgz+0dNXxLZR5ubNdt0FH34v731X+R9q8JoAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAr0X4c/FQ+ELJtK1K1kurDeXiaEjzIieowcAg9eowc9c151Xovw5+FZ8X2TarqV1Ja2G8pEsIHmSkdTk5AA6dDk56YoAPiN8VD4vsl0rTbWS1sN4eVpiPMlI6DAyAB16nJx0xXnVei/Eb4VnwhZLqum3Ul1YbwkqzAeZET0ORgEHp0GDjrmvOqACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK2/CfizUvB+sLqGnvlThZ4GPyTL6H+h7ViUUAev8AxG+JPhjxV4JWzs45ZL+WRHVJIiDbEHLHd0ORkcE9a8goooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACuj8H+OdT8EzXUumwWkxulVX+0ozAbc4xtYetc5RQB6Z/wAL68Vf9A/SP+/Mv/xykb48+KmGBY6SvuIZP/jleaUUAdJ4i+IPiXxRGYNR1BhbHrbwqI4z9QOv4k1zdFFAFvTNVv8ARr+O+026ktrmP7skZ5+h9R7GvR9P+PWuQQhL7S7O7cf8tFLRk/Ucj8sV5bRQB6Nrfxu8S6nbtb2MVvpiOMF4gWk/BjwPwGa86d3lkaSR2d3JZmY5JJ6kmkooAVHaN1dGKspyGBwQa9E0P42eJdKt1t71INTjQYDzArJ+LDr+Iz7151RQB6nffHvW5oCllpVnauf+Wjs0hH0HA/PNecarq2oa3fyX+p3Ul1cyfedz29AOgHsKp0UACsVYMpIIOQR1FehaF8avE2kW6W12sGpxIMBrgESY7fMDz+IJ9689ooA9Wuvj7rEkJW00ayhkP8cjtIB+HFeea94j1bxNfm91a8e4lxhQeFQeigcAVmUUACsVYMpIIOQR2r0zRfjlr+nWSW1/Z2+omMYWZ2KOf94jIP1xXmdFAHS+NvG9543v4Lq6tYLYW8ZSNIiTwTnknr+lc1RRQBp+Htdm8N6zDqtva21zPBkxrcqzIrdN2ARyO1ddqvxq8Uatpdzp7wafbJcxmNpbeORXUHrglyBxx0rz6igAqexvbjTb+C+tJDFPbyCSNx2IORUFFAHpUnx28TyxNFJpujujqVZWglIYHqD+8rzeVxJK7rGsYZiQiZwvsMknH1NNooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAr2z4RfELRrLw8nh/VruOxltnYwyzHbHIrMWI3dAQSevbFeJ0UAe2fF34haNe+Hn8P6Tdx30ty6maWE7o41VgwG7oSSB07ZrxOiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiijFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFMAooopWAKKBS07AFJS0lGoBQaKDQAUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACgUU4KTjAJNFwEGaXp2q9Z6Xc3bhUjcZ9q6ax+HGo3qBgcA+pqHVjHdlJNnFGg12118Nr+1RmY5x7iuXvNJuLOQo0bce1CqxfUHEoUU4oyn5lI+optWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQACigUUAFLSUUXC4tFJS5pgFFFFF0AUuePpTaWluA5VLsAvU8V2fhXwbPqE6Ssvyjkgiqvg7w2+rXAk25VeeleyaXp8NnbxpGmxlHJ9a4sRXtojeFMSy8PafFCqraqHUcmtOCCOH5UULjtUkaFulWBGB/D+Nec25G2iKcsCSgiRMisu68P6dcRsWtVz610DRYH3hVeRP73I9qJSaBJM8m8S+ApGEl1AdsaZwAK84miMTbGUhgec19JXMfmRGJlwnfNeV+PNAUXHm26AIuegruw1e/usynTtqeee1HSlZSHIPak616COfqFHajNKelGoMbRRRQAUUUU7gFFFFIAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAAUuKQdOlKAaADij6VKsE0n3YmP0FONncr0hk/75NLmSHYgNJUskEkY/eIyn3FRVV0FhR15pSBnikAJPFSrbTvyInP0Wk2hWIvwo6nArZ0zw7dag4UIy5PcYrqYPhZdypv8AMA/4FWTqwjuUoNnn4Qk4AJq1a2c0lxGuwkE+legW3w5ks33TOrD6101l4bsIFXcsO4e4rGeJjbQ0VMj8FaWbCHcRjctdjCnSqtvDHFGoTAA9KvxAZBFeVKXPI6lGyLUSVZWPioYsCrKkYrohaxjK5EyCqky1cdqqykYNRNJjhe5nzc5FYOv2scumykpuOOOK3ZutVJEVxh8bT1zWEZcstDZq58+3dlMsz4ib757e9VjbTLy0bAfSvoA6JpL9Uts9eSM1j6h4Ps7vIgCc+mK9aGIutTllCzPEypHUUda9Pk+E9zcSFkkAB/2qztR+F95YIX35x6Gt414shxOAxS4GO9aF9o9zaSlPKkbHotUngmjHzoy/UVopJksiopSKSnckKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAFLgUlLTuAuK2tB8PS61PtQlcVkQKXlVfU17H4I0MW0azEY3KK5q1TkRpCNy/4c8HWlnGPtECyHb/EK3G8O6WFyLGPP0rWt4wFAA5qw8OwAgZBrzHOcndG9kjzrxb4NgvrbdaQrEQOdteWTeH7mO9+zlGznGcV9EXEYO4EZHpWK9jp0O+eW3XcvOa0hiZR0YnC+p55pnwvvJxHOX+TqckV32keG9K02IR3UETNjGWrFuviLZ6ezQqAu3gDNchrnjua9J+zSFeexro/eVNTPmSPUL3+xtMUyQxxLgZ4Nc5cfEuxtMxiMH868tn13UJ8+ZOxBqhJM8p3M2TVRwrb94XtD0i/+JMNwhWNdp9s1gr4ruZr2J0mZVL8j1rksnrTkcrIGHGK2+rQSBVHc+gtC1Fbu0QqQTjmt2InvXmHw31PeGWaTp0Br0tGJAb1rxq0XTkdUZXRejbFTeYMVTR+Kf5nFOM9LktEzPVWWQZoeTiq0rk5xUzdxwiRytyaytYlaLTZnBwQK0WJ2gk1yHjHX47GB7bPLjFKknKVi5vlR5xceI9QF22Lp8Bz3roNH8fPaAee5YD1rhZW3yuw7kmm4IFe77KPKkcTqansUPxdskQAwjI781r6f470/W2VWRfm9a8FzjirFvf3Fr/qpCtRLDaaBzn0imnaDcoZHggZm6ZNc14g8C2usOfsUUcYx/DXklv4o1SKVCbpto7V2ehfEoWMZFw+4+5rF0px2HdMp6j8LLyzieTzCQvOOK4y80m4s3IaNiB7V7PY+OrTWiI2wA3Byav3Ol6NdWxQRIzt05pKvKL1K9mmfPjIVPKkfWjGelenat8O5bmVpLddqewridW8PXGnTmPYTj2rohWjIhwZjGlGPSnPG8Rw64pBxW9+xnsN70lKetFFwEpa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RRQAUUUUAFFFFABRRRQAUUUUAFFFFAC0ZpKKAFo49aSinfQBSPelBHpTaKQCk56UZHSkopgOAz0FKp2uDTQaWla41oeq+A/EW62WxLDAGKz/AB94fK3El8eh5rmvCV89lqcbqpf2Fetara/8JDowRk2EiuCXuTNk+ZHgrcEj0ptejT/DYrHuD5OTwCc1yGqaJPp8hHkuFBxk11RqxloZuDMiinkc88U3tWpD0EopRSUwCiiikAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRS0bgFGM0GnRjMqj1IosB3/wALYXi1kOV4NdH8TtQik0swq3zrnir/AIB0NIbGK629VznFedeOb531meAuSBXGveqGy0RyPelHek6UV2sxEooPWikAUUUUAFFFFABRRRQACnHnGaQDPSnKpcgDkk4pp2BGjo2nTX12oiUnntXqiOfDGnJJJIc4+7msn4caY1sTPcQjb1BNVviNq0c7iOF/u9hXn1P3k7GyfKhW+JrxTOoU4PHSud8QeLrjWQCHZMcYFc0xJbJpua6o0YrUlzbHO5diWz70ylyTxmitU7GbdxKKKKbYBRRRSAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAFXrSgbmAHekFSQDdKv1ovbUaWp33gvw15+y7PQV6xZWIjjCegrmvAcaLoicdQK7a2VRyea8WrVcp2OyNkis1qpGNgyKwtd0C31SzMBiRHz97FdXNtCnArNuiMVF3CQl7x88eItMOmak9uOQpIzWRXonjvTEWSS4B5JrzuvYo1OaJz1FZiUUtJWtjMKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKBQAUUuKMUAJRS44pQM4oQDaKsW1pNdv5cETO3oK6zw/4KbUZh9pjaJenNZzqRhuVGLZyEUEkrYRcmtK20LUHljYQMRuHavUrH4d2dlKHDqcfWuttNPtoIwgjQ4/2a5JYtdDVU2HhpWtPDEUbrh1SvE/Gen3ja7PMYjtbvXvAG1doHy+lZGq6FbampDbQT7VhTrpSuW6bex87OjKcMKTtXrl/8M7XDujgnGcDNeeap4dvbC6dfs7mME4NehCvCbMZQaMWinshQ4bg9xTcDNbMzEopeKSnYAooopAAopRilOKAEU4NXdMtnnvIgi5G8Z/OqYGTXoHw20eO9uHacBFXJBb2FZVZcsblRWp3gkttM8OpvIRileKazdNPfytv3Lniu9+It/Elutvb3AcrwdprzFjk5JrKhG/vFzEznrSUpOaSuoyCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKdgCiiikAUUuKTFABRRilpgJRQaKQBRRRQAUUUUAFFFFABUkLbZAajFL0oa0Gj3HwFe250aOMsN+BxXZxSbRnPFfPnh/xFNpk8eGJUcYr1/RfFOn3lmrXF0kbY6E15Fag1LmR0wktmdM0xxz0qnOwYGnR3VvON0ciyJ2xXHeJ/F39kRsEIeTJ4HpWEIynKxppFHHeOdULXUltnoa4Wr+ram+q3r3MgwWPSqFe1RgoKxyTd2FJSikrQgKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKBQAtFJSimAo61PaWct5MEiQsc9BUSDLgHvxXpHgHQQki3TpuHuKwq1FTVy4RuzX8H+C4rGKO9lHznqrV2kdvGgCoiDnPAp8SDZgDA9KmRBnOK8apVlUZ2KKQip2qVEx3FSJHUqoP7tKEWtxNohK7enNRle5U1b2e1Ruh9TRKCQXsVHAI5x9KyNX0mC/hKmMZPcCtt19qgYYBqI3iyk09zxzxZ4Q+wKZ4QSCa4qSMxsykYIr6F1LT4722dHXPHFeKeJNJns7+V2j2x544r1cLW5tGc9SFtUYWKSncUh613X1OcKKKMU7AFFOVSxwK0IdBv5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UlOpDXpM5hKKKKQwooooABRQKKAClNJSmjoB13w6419PqK7n4hyZ0UiuG+HYxrye5Fdt8QGX+xiM881w1f4qOiPwnjZ60lL0NJXd0MOoUUUUCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACgUUCgAoopRTQG/4T1BbHUVZjjmvb9Lu/ttsso5GK+doG2TIwOOa9i8D63FPaLbB8sAARXm4unfVHRSl0O4XirCNUC8HaetPBxXlp2Olq5ZVqcHquGpS9aXZnYmZ6id6YXqN2NLmuOyGyvVdjmpGqJhxWbZokRtwwA7iuf8U3/2CzLMcZFdAc5z3AJrzXx/rMVzC1usn7xOorow8OaaJnLQ4LUJRNevIDnJqvTSeaTNe6o2R57V2OxRmk4pM1TQWL1jqUljIJEY5Fdpp3xDuQiRu2AOOtee5oDc9axnRjLcuMmj1S9+IBjjBjfLfWsO48f3l4TExwCcHntXE7snJPSjdg7s8moWHikU6jZ1GpaYt9ALi1O+Rhlq5iVGjcqwwR1rW0TWZLCTyx8yPwc9q09Y0eK5i8+yG9mGWxVx93Qnc5TGFz602pHjeMlW7VGQRWq1ICijFFABRRiigAooooAKKKKACiiigAooooAKKKKACiigdaALFlN5F2kn9017T4IvXv7DdngCvEO+a9E+H+vrZQras2C7YrjxUOaNzWnKzPWoTg4NXUOKoxndEhPVhmp1bK+4ryE2tGdT95Fzf71G71DvNRtJitOclRFlk4qnI+akd91Vyd2axk7mqjYzdcjlk0yRYRuY9q8c1vStQEplmhKgexr2ObXLGxvRDcS7SRkilurbS/EMeyOUMG9q7MNJw1ZlUsz5+KkdetNxXr2q/Dayit2eDl/TbXB6h4Q1O3dtluSg716ca0Wc0odjnDRU09pNbuUlXawqLacZrZO5mJRS7TSYNAAKKXFJQAopRzSY70oXLAUPYOp2Xw5T/ieofcVueP7hxA0ZPGai+HunbbxbjbxxiqXj67JvHiJ6dq4XrUN18JweOc0lL2pMV3dDASilxSUAFFFFABRR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igAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKADNGaKKAF3cYo3e1JRQBq6Hrt1o10sls2CTzXuGiazaa/pEUbvuuCvIr58H3c+ldV4N1/wDsm+R3c4z0rnrQuro0g+he8ceGZbG4e6VMKxriRE28LjJNfQk0dl4j09DcDIPtms6HwFovm7hF/wCOVhTxPKrMt02zxZtLuAm8oQKqNCyHBr6DfwhYGPYYVK/SsfVfAGmGEmCFQ5HpVRxSbsHsWeJYFBArd8QeHrnSZ2MiAIfu4NYRrrjK+pjKLTDHFJStSVQgooooAKM0UUALmgNikooAUMRVyy1O4sWDwvgiqVLSaT3GnY7C0+IWsiSOMyDaMDrXpmh6xNqllvdstt5xXgisQwPpXrfwyla4jZWOR/8AWrixFOKV0jaEmznPHM86XDBuBmuHZyT1r0X4oQiG6wB1rzitsOlyGc3qKWJOelBbNJRXQQGaKKKACiiigAooooAKKKKACiiigAooooAKMUUtNoBMUUtFIBMUuKKKNguOVBt3E0m2hSAeat2NjNf3KwwqSWPFGm7BK7DTdOm1K5WCBcuxr23wf4Wh0qyhnuVxMOTVbwV4Mg062We4XbcqM9Kd418XQadYyW9vKRcKOAK4KlVzlyo2SsYXxA8UA+ZYoxAAry13L/Meuas6jqEupXRnnYkmqZGTgdK6qdPkRnJ3YrHgU3NB9KK2TsSGaKKKQBmiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAHD7h5qzYxtJdJgd6q9q3vC1us97hvUVE3aLKjuezeGLYLpUOeTiukt4eMVj6KnlWcaegrftsV4b1kdjuog8Py1UnjDHp0rUcgjFZ8/BNOaUVdEwk2cJ4y0b+0Lc7UwQDzXjN3AYJnjIwVYivojUfmtpfpXgWuADU5R/tH+dd2Em5bkVUZppMU5qbXos5gooopAFFFFABRRRQAUoOKSigBa9W+FMyIGBPf+leU13fgC++zS7c4yawrq8DSnuanxYAe4V1968vI5r1fx3bm6txKRnivK5RtkI9DU4d+7YJjMUUUV0mYUUUUAFFFFABRRRQAUUUUAFFFFACmiiimwDvRR2qe1tXuZhGgyTSbshpEaRM7AAHmt3TvBupakm+GMkV2XhbwYhhWS6hJPWvQtO0yCygCxR7a4amLtojZUzxofDnWO8RqnfeCtSsYzJJGcCvoPYNuNgx9Kz76wiuoSkkeRWKxkuo/Zo+d7XS7i6ulto0JcnGK9e8G+DItOgWe5jAnXHJrStfDOmWt4JxBhhznNVPFfi+10u2kt4XCz9uacq0qvuxHycpL4w8Xw6ZDJDBIFmxjI7V4tqmpzaldtcTMSxP50apqtzqdwZriTcxNUc88120aSitdzGUgPTJpueKU/pSVsQFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAorV0K9+yXgPqayhTo3MbBh2qZrmjYqO59FaDKZdOikyMEda3IpCBnoPWvH/B3jHySltcyfux05r1C0vormESJIpQ+9eLUpyhLQ64zTVmaZmz/EKqzSkk00zoV6r7VTvL2KCMu7qAPesZKT0KTSKeqzrHbSZOMjrXhGsEPqEx/wBo/wA69ystT03WZHtdykjg5rA8XeA4LuESadH82cnAruwz5NzOq0zx3k9qTFa+q+H7vSj++RhzWUQynkfnXpKSa0OTYaRSYp2c0lVZgJijFLRT0ATFLtJ6Ud6dnGcUgY3bzRip4bZ5pVjQbi3pXeeH/AcrBHvIvlbnpWdStGC1LjFs4iy0u4v5AkS8/Su28O+DNYtrmOUphOvSvQ7Lwnp1iiPFGN3Hat6JPKAVeg7V59XFN6I2jTscrruhXV7pwjRfnx6V5xcfDjWjKWCcE/3TXupAPJyKZK5IAFZwxDjsU6dz521HwpqOmjMyfpWM0bKSCORX0XqOkwX5xMmR9K5TXfBFm0ZNrF8xGOldUMWvtEOlY8dxSEYrZ1nw/d6RMVmTg9Kxznoa7IyUtUYNWExRilFB4qhCYoxRS9qAEooooAMUUUtAAOaCMUGgU7agxetdP4P02SfUo5cAoCMgiuY716r4As0azEm3mubEz5ImtNJs9As4VjjXYMcdK0YosnpVS2XgVqwAACvJi7s6HoNMOV5zVaWPCkD9a0yRiqM/fFXOOglIypwenYeleX+OtHmluHvNp2DNeoXAznB5rl/GIzoUvqCKmjJxnoXJXR4mww2O9IeetK/3z9aQnivd6HDLcQ9OKSlPSkoBhRRRQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAHdqTvSUooQD4pTE4Ydq6Cz8YajaxCNJSFHbNc5Rk1MqakUpNHZnx5f+WAJmBx61m3fi/UrkFXmYqfeueyTRiojQjcfOzV0/X7vT7szwyEEnnBr07wz8QITiG6fJcAD61472p8UrxOHViCvIonRT2BSPpC90TS9cthLKsbblyM15x4h+HcpeR7NMKMnisPRvHN7bOiTSMY14616fpPjXT9VtkhULvxhua5XGVN3LSTPC7zTZ7OUo6Nx7VUII6ivoLUPCul38TSGNGZxkCvO9X+H16GkkhTbGOgFbQxN9GJw7HA4wKSrl3p8tlKY3U5B9KqsDnmuhNMz5WNqaCFp5BGO/pUQ611vg3Q31O4LouNhFKpNQiVCN2dP4K8Gog+0XifMACuRXoiIFUJk4UYAqC0h8qGOM8YGDVtFBNeFVqOctTqjGxJGM8EVYRMdKSJKsolEbA5WIhGe5zUbR57Y+lXdgxUbpxRJXJ52Z7x853GoHXuRxmr0iCqsq8YqJw0NIyuc94g0GDVoXL8vg7eK8b17Q7jSp9siHk9q9+lGMEVzfifR7e+spJHQbgOK6MNiHB2ZM6d1c8NwQaQ1avrZre4YEYG4gVVJzXsp3VzjasxKWkopoQUUUCmAtGKOTS4PpRcYmPWjvxT9rN0BP4Vr6X4bvNTwUQ81Dko6sFFsx1Vj0BP0r1nwDP5dkEIIP0qvoXgDyADdx7h712Fvp1jpaDylVT9a8/E1edWR00opbmzbv04rRiftWRbz71znIq6rkEELxXnRbizaSTLpmFVppOtMMnYDBqvLKejVcqlyVEhmb5jwDXM+LUH9gzkkZz0ronG4ja+K898da8kTSWI5Jz3ooRk5hN2R5jIfmPHem0rHJpK+gOJ6iGig0U2IKKKKQBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUoxSUUAFFFFAC5pKKKAF7daXim0UAPBx3q1aajcWTboJNpzVKik0mB2+h+O7qCQC7myq16BYeNtI1FVt1G5m4J3V4RVi2u5rVw8TEEVhOgnsaxme9T+GNLv4nlMIYsMgiuG1f4eXM8xNlEQPpmubsvGWqQugM7bQeRmu80n4hWKQqtyW3n3rncKlN6Gl1JHETeB9Ss51WZep4+WvRvCOhSaTDvcYLdRirVtren6vJuQZ2nAzW7GBtwvSuavWnLSRpTgkSIBjGDz3qxElRRDKkdxVqJa5olvQnjWrCLUcYqwmK6YRRi2BXionFWDjFQyYrSVrCTKkgqrJ1xirclVZK5Jo0RUdevNVJo1kQo4yDVuSq7jg8gVi3Zmy2PJviLZQ2V+oiUAHnP4VxOOPevU/HmnNdkS4B2/4V5jJBIsjDaeDivdw004HFVjroQkYoq9baZPP91f0rZtPAup3i70Ax6Yrb2kVuzNQZzGDnpQBXb2/w51NJVZ8YHXiuu0fwbYQoBeIpaspYiC2KUGeS2enS3kgWMcnpXS2fw81S4Ak2kL/ALtemtoGkWK+ZGgyvPFUpvGWm6afKbIx71g68nsjRQiVdA8E28UQS7iDMOvFbUkOk+Hk8zy8Ae9cNr3jtZnY2UjLn0Ncfc+JNQu1ZZJiwPqaSpTnuVzqOx6Zq3xG042rJbEK4yOtef33i/ULiYlZjtzXOs7Mcmkrohh4x3MnUueoeFPG9tFAsd2xL+7V6Lp97HqUKyxcDHrXzYjtGwZTgiti18VapaRhIpyAPc1jUwl9io1T6FcYHAqvcZiiMjcgV4YvjXVgvNw35mopPGWryqVM7bT7msFgpF+1seh+JvGdraQPbxNtnxwc15Tf6hPqE5lmfLGorq8lu5fMlOWqvXdSoqmjGc3IU4opKK6G7mYUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAAUUUUALRSUtO4Cjg9acGAOcnNNpDSuuoXZtaHql1bX0apIQGYZAPvXu2nsWsYXPJYV89aWcX8R/2x/OvoPS2U6fAynkrXlY6HY6qMi/Hwx96uRmqURAGGGcVZjauCGhtIuoamRqqo+KlDV1RkYtE7PxUDtQ0lRO9EpgkMc1WlNSSPVZ2yDWEpGkUQyGq7cnpmpXNRHI5ArFmqRXlsobs7JlXB9ahPhTQR96OMk+wrn/Fur3Gn58mUo3sa8/k8YatuI+1P19a9DD05SV0YTaTPWJtK0TTwWVU/ACqp8V6bpoITAA9K8ol8T6lMMPOx/GqE15NPy7E11fV23qZOqj16X4j6b5TjLbvYVyuseOZJSTbOQK4MsTSVosNFCdS5vy+MNUkBXzmweOtZN1eTXb7pWyfrVait4wijNybFJpO/FFJV3RI4mkpKKHqFh1JRmii7CwfWlGexptLRqAHrSUGikAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAAKKKKAFopKKYxaD2pKWjQRLbyeVOj+hBr2TwRq/9pW4QN/qxivFq67wZrq6bOIicFyO9cuIhzRNqcrHt6HAwe9Soaq2kglgD7gy4B4qwM9SeK8NpqR1XuWFeniSq6sDT91aRZNiZnqF3prPUTvUtjSB34qBmpWbNR9fqOahstIa1RE4Oc8VJzgux+grK1q8+y6fI4bDAcUQi5Ow27I4L4lzFdQQIcg46fSuBPzE/LzWjq+pTX90TMxOGPWs019DQhywscFR3YEe1J260UnatUZhRRRQAtFJRRoAtJRRQAUUUUAFLikooAXFFJRQAGiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACpYpDE4YHDDpUVLRa6GnY9L8D+MWibyLyTcGwACa9SgljmiDxtnIz1r5mhneFwyHBHQiu+8JePW06LZeuZOwzzXBWw99UbQqWPYF+YY6Uo4GKwNG8V2mrH5WC59eK3TLCoH71D/AMCFebKEos2UkxWqJhSmRD0cH6GmmRM/eH51m7miSGGomOBx1pzSxYJMqDH+1XOa34rttMOzKsfaqjSlIpySRsXd1DbQmV34Uc815T4x8VNfXGy3fCDg4qPxJ4vlvjshcqp6gVyEjl2JPevUw+GtqzknVvoDMXbJPWkYY4pKDXfsc4UlLR2oQCUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUuKSimgF4peAcim0ZoAv2urXdn/qZCn0Na1r4x1JP9ZcOQPeuazRWTpxfQpSaPRdN+IPkpidix96L34giVSIiQTXnWTS5NZ/V4Fe0Z0V34t1GQny7hgD71kXWoXN4cyyFj71TyaMmtY04x2JcmxxJIxSUmaM1ZItJRRQgFo7UmaKGAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFGKMUAFFGKMGgAooxRigAooxQATQAUUYoxQAUUYoxQAUUYoxQAUUYoxQAUUYNFABRRRQAUUUUAFFGKCMUAFFFFABRRRigAoooAzQAUUYJowaACijFGKACiiigAooooAKKKKACiiigAooxRigAooxS4oASiiigAooooAKKKMUAFFLg4zSUAFFGKMUAFFGKMUAFFGKMGgAooxRigAooxRigAooooAKKKMUAFFFFABRRRigAooxRQAUUYNGKACiiigAooxRigAooxRg0AFFGKMUAFFFGKACiiigAoooxQAUUYoxQAUUYooAKKXacZ4pMGgAoowaKACiiigAoooxQAUUYoxQAUUYowaACijFGKACijBowaACiiigAooooAKKUqQM0mD6UAFFGKKACijFGKACijFGKACijFGKACigjFFABRRijFABRRg0uKAEopQuaKB2YlFLijBFFhCUUtOSJ3+6pNF7ANoA9q1LDQrq7mCGFgD3rsbH4XXF3EH3bc+1ZzqxjuNRbPO/pxRhvevTx8J542yZQfwp5+GzrxkH8Ky+sxLVNnlpUj1pMV6k/w3crgMAfpVf8A4VdO2SJR/wB80LExH7NnmuSaOtdpqXgC5skLb92OwFZVh4Xubu58oqRz1xWirRZPIzB5H0o/Gu/X4aylQfM5PbFOHw2lzguPyp+0iLlZ59SdDzXov/CtmC7mlAX1xXK67oo0qXyw4Y1SlcVjFB9qQDJ4qRUZjgda6bSPBs2pWwmBxn2pykktQSbOWwSeaPxruk+Hdwe+fwp4+G9x/f8A0rFYiBfIzgsn1pMV6APhtcf3/wBKafhtP/e/Sn7aIuRnA49qPxrvv+FbXH979KD8OLgfxfpS9vEORnA596O1d4fhzcf3/wBKgufAE8EW7dn8KarwDkZxXA7UGt278NXMC52k/hWZJp10p5ib8qtVIsXKypRT3ieP7ykU2tNGISilwaMGkISi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6e61GmW/7SuR/wAtW/OrFvfXs0iqjscnHBqjBC87BEXJNejeCPBzXLpJLH75IqPZoHJml4M0G7kcTSs/zYIr1vTrQW8KhuTjvUGmaZFYQKiqAQK0V3ZznijkS2BSJB06008jBpw6U000JkbVGwqU0w1QiJuoFQ3EixIxYjCjJqSaRIg0rfKAK858c+Nk0+NoLWTe0nynmmBB458cLYxGG1ZXLDB56V49d3b3UzyO5O45AovruW8uHkkcksc4NViD3pBYCeeaTPPNFFIY5TtORXSeGfEEmnThCxYMcYNc0KfFIY5Aw7Gri7MmUbo9qguFuIVkB+8M49KCM5rlfCutJMojmfkcDNdTuDZYdK9OlJWPNqxaZG1NwaXflce9JuFdPMmjDVCil6kFu1ICKXipQ0hJoUu4njlAAYYBrgPFHh46dc/uRkNycV6Fmq2p2kdzaPuXc+3iuatSi9TrpVGtDyAgglfSm1f1SyktZn3rjLcVQrzWrHcncKKSipKCiiigQUUUUAFFFFABRRRTAKKKKQBRRRQAUtJRQwCiiigAooooAKKKKACiiigAooooAKKKKACiiigApRSUUABooooAKKKKACiiigAooooAKKKKACiiigAozRRQAtJRRTuAUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigApaSigBc0CkooAUmkzRRQAUUUUAFGaKKACiiigBaKSigAooooAKKKKACiiincAooopAFFFFABRmiigAooooAXIo4pKKACiiigAooooAKKKKAFopKKdwFpDRRQwCiiikAUCigUALUkMLzSBUXNJFE0zhVGSa9F8F+DGupUlnQ7etNIBfBXgx7qVZp1wvuK9k0vS4dPhVUA4pum6fHYxrFEgAA9KvZAPuKYE2RkcU4YJ4qEHNSpSAl7U3BzS5ozUgNIzn2qKRgib2OB61KzBVJZgO9cF438XrpVo8cMgLdOKpCK3jfxolhC8MLhywxgGvENQ1CS9uGd2OSxPJqTVtUm1C6Z5HJBOetZ3GaYASM0dec0lFSMCcmiiigBRjFHakooAtWV09tKro2CO1dna+KMwKrNz3rghTg7DoxH41pGo4mcoKR6EfEkeMbhTD4jT+8K4He398/nSb3/vn86r20heyiegDxGh43injxJGP4xXnm9/75/Oje/98/nT9vIXsYnof/CToP4hTT4rAGevtmvPt7f3z+dG9v7x/Ok60mrAqMUzo9avIdTHmEhSO1c4wG7ik3N3Y/nQTWVzYOKKSii4BRRRSAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopRjvQAmKfGhdgooRd5wuSSeK7zwV4Nl1S6SS6iAjPIPrQA/wT4NkvZklmQhSeCRXs2nWEVhbLHGo+XviotLsIdPtEjjXBTpV4HAx+NUIkDZPGQacMqMHnPeog1PBpASg1KjVADUsfPApgTZ7UjHAJ9KTPLMxAwK5zxL4lt9LtWJk2tjApWAh8W+KLfSrQjzBu246968D8Qa3Nqd7KxdipPAJqfxN4kn1e5mRmyu/I5rniS2STzTYB3yaQd6SipGFFFFABRRRQAUUUUAAozRRQAZpc0lFABmiiigBaTNFFABmiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopy52kDp3oAbTkVnIUDJJpeGAAGK7fwZ4Pk1K4WS4QiMDIJFADvBngx9QuVe7j2x4yCRXsem2EWnWkcMPRBgcU2xsYrGzSKNQAmB0q3k5ye9OwiTdkfL2pQxPJqMGnA0wJQ1PBqEGpFJ7UrASA1MjAck4FQKcg7Dhazda1yHTLXfK4X0oEO8Qa9baTaM0kg3EcZrwPxX4oudYunRifLDfLzUni3xdca7cPHuPloxxg1yrMTyaYwJ3Hnr3pDzzSUVIwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigApQTjAPWkrb8MW1lc3pF621ARQBq+E/Ccup3Y+0IViwCDXs+k2MWnWqwogAUYziuf0zW9AsLVYkkAKjrkVojxjo+ABOPxNUI3jnP8As0Zz9O1YX/CZaRjH2hfzoHjLR/8An4X8xQBvCnCsEeMtH/5+F/MU4eMtH/57r+YoA3QaeGIrnj4z0f8A57r+Ypr+NNJCMROMgHuKANbVdTg062DSvtyCRzXiPjDxZPqs72+8qiH5SKteL/GDaiWihclRwK4aSRpDubk0gGnJPXNHb2opO1IYUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFOVmQZVsZptFAEonlPG80G4l7saiJJ60ZoAl8+T+8aPPk/vGoqKAJPtEv8AeNL9ol/vGoqKAJftEv8AeNH2iX+8aio6UAO3MeM0nSkyaM0AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFF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1xNbtPHNFsIRsEHOQayNSvDqOp3V6U2G4maXbnO3cScZ/Gq1FABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABTo5HhlWWJ2R0IZWU4II6EGm0UAegaL8UJI4Rb63am4UDBniA3Ef7Sng/hj6VoDxF8PLqTdNp8ERPJLWX/AMSDXl9FAHqTav8ADdVyILRvYWT/ANVpp8f+FdHicaRphLntFCsSt9T1/Q15fRQBteIvFWo+JJgbphHAhzHBH91fc+p9/wCVYtFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAPgnltp0ngkaKWM7kdTgqa9DtPHmk6xoE1j4mhzKE6pHkSnsRj7rfkP5V5zRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/9k=';
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
    <img src="${logoSrc}" class="logo-img" alt="">
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
  <div class="login-wrap">
    <div class="divider"><span>Bereits Mitglied?</span></div>
    <div class="code-hint">Tippe <b style="color:#d4af37">/mycode</b> im Bot und gib deinen Code ein</div>
    <input type="text" class="code-input" id="code-input" placeholder="Dein Code" autocomplete="off" autocapitalize="none" spellcheck="false">
    <div class="err" id="err">❌ Ungültiger Code. Versuche es erneut.</div>
    <form id="login-form" method="POST" action="/auth/code" style="display:none">
      <input type="hidden" name="code" id="hidden-code">
    </form>
    <button class="login-btn" onclick="doLogin()">Einloggen →</button>
  </div>
</div>
<script>
function doLogin(){const c=document.getElementById('code-input').value.trim().toLowerCase();if(!c)return;document.getElementById('hidden-code').value=c;document.getElementById('login-form').submit();}
document.getElementById('code-input').addEventListener('keypress',e=>{if(e.key==='Enter')doLogin();});
</script>
</body></html>`);
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

    // ── KOMMENTAR ──
    if (path === '/api/comment' && req.method === 'POST') {
        const body = await parseBody(req);
        const { postId, text } = body;
        if (!postId || !text?.trim()) return json({error:'Ungültig'},400);
        const myName = session.name || 'User';
        await postBot('/comment-api', { uid: session.uid, name: myName, linkId: postId, text: text.trim().slice(0,200) });
        return json({ok:true});
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
        const todayLinks = Object.entries(d.links||{})
            .filter(([,l]) => new Date(l.timestamp).toDateString()===today)
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
            : dedupLinks.map(([msgId, link])=>{
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
                return `<div class="post fade-up" id="post-${msgId}" data-url="${link.text}">
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
            }).join('');

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


async function likePost(msgId, btn) {
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
        return html(`
<div class="topbar">
  <a href="/feed" class="icon-btn" style="font-size:22px">‹</a>
  <div style="font-size:15px;font-weight:600">${u.spitzname||u.name||'User'}</div>
  <div style="width:36px"></div>
</div>
${profileCard(uid, u, d, false, lang, adminIds)}`, 'feed');
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
        const payload = {bio, spitzname, accentColor: selectedAccent, theme};
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
