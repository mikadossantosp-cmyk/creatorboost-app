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

function ladeBild(uid, type) {
    try {
        const f = DATA_DIR + '/bild_' + uid + '_' + type + '.txt';
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
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
.profile-banner{height:160px;position:relative;overflow:hidden}
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
.tab{flex:1;text-align:center;padding:12px;font-size:13px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;transition:all .2s}
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
/*=========================
   PC + BANNER + PROFIL FIX
=========================*/

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

img, video {
  max-width: 100%;
  height: auto;
  display: block;
}

/* BANNER */
.banner {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 0;
}

/* PROFILBILD */
.avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

/* PC VERSION */
@media (min-width: 768px) {

  .container {
    max-width: 1100px;
  }

  .banner {
    height: 260px;
    border-radius: 12px;
  }

  .avatar {
    width: 120px;
    height: 120px;
  }

  .profile {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }

  .profile-left {
    width: 250px;
  }

  .profile-right {
    flex: 1;
  }
}
`;

function layout(content, session, page='feed', lang='de') {
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
  <a href="/nachrichten" class="nav-item ${page==='messages'?'active':''}">
    <svg viewBox="0 0 24 24" fill="${page==='messages'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
function toast(msg,dur=2500){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);fetch('/api/theme',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t})});}
function setLang(l){fetch('/api/lang',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:l})}).then(()=>location.reload());}
</script>
<script>if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(()=>{}); }</script>
</body></html>`;
}

function profileCard(uid, u, d, isOwn=false, lang='de', adminIds=[], bannerData=null, picData=null) {
    const xp = u.xp||0;
    const nb = xpNext(xp);
    const grad = badgeGradient(u.role);
    const banner = bannerData || ladeBild(uid, 'banner') || u.banner || 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)';
    const bannerIsGrad = !banner.startsWith('data:image') && !banner.startsWith('http');
    const instaUrl = u.instagram ? `https://instagram.com/${u.instagram}` : null;
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
// ONBOARDING
// ================================
function onboardingHTML(isPreview = false) {
    const finishAction = isPreview
        ? "window.location.href='/einstellungen';"
        : "localStorage.setItem('cb_onboarded','1');window.location.href='/feed';";

    return `<!DOCTYPE html><html lang="de" data-theme="dark"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>CreatorBoost — Willkommen</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;max-width:480px;margin:0 auto;overflow:hidden}
.ob-wrap{position:fixed;inset:0;max-width:480px;margin:0 auto;display:flex;flex-direction:column;background:#0a0a0a}
.ob-top{padding:14px 20px 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.ob-logo{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;background:linear-gradient(135deg,#ff6b6b,#ffa500);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ob-skip-top{font-size:13px;color:rgba(255,255,255,.35);cursor:pointer;padding:4px 8px}
.ob-slides{flex:1;position:relative;overflow:hidden}
.ob-slide{position:absolute;inset:0;display:flex;flex-direction:column;padding:12px 20px 0;opacity:0;transform:translateX(100%);transition:all .45s cubic-bezier(.4,0,.2,1)}
.ob-slide.active{opacity:1;transform:translateX(0)}
.ob-slide.prev{opacity:0;transform:translateX(-100%)}
.ob-label{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;color:var(--c,#ff6b6b)}
.ob-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;line-height:1.2;margin-bottom:4px}
.ob-sub{font-size:12px;color:rgba(255,255,255,.5);margin-bottom:10px;line-height:1.5}
.ob-phone{flex:1;background:#111;border-radius:18px 18px 0 0;border:1.5px solid rgba(255,255,255,.08);border-bottom:none;overflow:hidden;position:relative}
/* callout bubble */
.tip{position:absolute;z-index:10;background:#ff6b6b;color:#fff;font-size:10px;font-weight:700;padding:5px 10px;border-radius:10px;white-space:nowrap;box-shadow:0 4px 16px rgba(255,107,107,.4)}
.tip::after{content:'';position:absolute;border:5px solid transparent}
.tip.down::after{border-top-color:#ff6b6b;top:100%;left:50%;transform:translateX(-50%)}
.tip.up::after{border-bottom-color:#ff6b6b;bottom:100%;left:50%;transform:translateX(-50%)}
.tip.left::after{border-right-color:#ff6b6b;right:100%;top:50%;transform:translateY(-50%)}
.tip.right::after{border-left-color:#ff6b6b;left:100%;top:50%;transform:translateY(-50%)}
/* highlight ring */
.hl{position:absolute;z-index:9;border:2px solid #ff6b6b;border-radius:50%;animation:pulse-ring 1.5s ease infinite}
.hl-rect{position:absolute;z-index:9;border:2px solid #ff6b6b;border-radius:8px;animation:pulse-ring 1.5s ease infinite}
@keyframes pulse-ring{0%,100%{box-shadow:0 0 0 0 rgba(255,107,107,.5)}50%{box-shadow:0 0 0 6px rgba(255,107,107,0)}}
/* mock ui */
.mock-topbar{background:#000;border-bottom:1px solid rgba(255,255,255,.06);padding:9px 12px;display:flex;align-items:center;justify-content:space-between}
.mock-logo{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;background:linear-gradient(135deg,#ff6b6b,#ffa500);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.mock-nav{display:flex;justify-content:space-around;padding:8px 0;background:#000;border-top:1px solid rgba(255,255,255,.06)}
.mock-nav-item{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:8px;color:rgba(255,255,255,.35);padding:2px 10px}
.mock-nav-item.act{color:#fff}
.mock-nav-dot{width:3px;height:3px;border-radius:50%;background:#ff6b6b}
.mock-post{background:#1a1a1a;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.06);margin:6px 10px}
.mock-post-hd{display:flex;align-items:center;gap:7px;padding:7px 9px}
.mock-av{width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff}
.mock-banner{height:60px;position:relative;overflow:hidden;background:linear-gradient(135deg,#1a1a2e,#16213e)}
.mock-xp-bar{height:3px;background:#222;border-radius:2px;margin:4px 10px;overflow:hidden}
.mock-xp-fill{height:100%;background:linear-gradient(135deg,#ff6b6b,#ffa500);border-radius:2px}
.mock-rank-item{display:flex;align-items:center;gap:7px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.05)}
.mock-tab-row{display:flex;border-bottom:1px solid rgba(255,255,255,.08)}
.mock-tab{flex:1;text-align:center;padding:8px 0;font-size:10px;font-weight:600;color:rgba(255,255,255,.35)}
.mock-tab.act{color:#fff;border-bottom:2px solid #ff6b6b}
.mock-input-area{background:#1a1a1a;border-radius:10px;padding:8px 10px;margin:8px 10px;font-size:10px;color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08)}
.mock-btn{background:linear-gradient(135deg,#ff6b6b,#ffa500);color:#fff;border-radius:10px;padding:8px;margin:0 10px;font-size:11px;font-weight:700;text-align:center}
.ob-bottom{padding:10px 20px calc(16px + env(safe-area-inset-bottom,0px));flex-shrink:0}
.ob-dots{display:flex;justify-content:center;gap:6px;margin-bottom:10px}
.ob-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.2);transition:all .3s;cursor:pointer}
.ob-dot.active{width:20px;border-radius:3px;background:#ff6b6b}
.ob-next{width:100%;padding:14px;border-radius:14px;border:none;color:#fff;font-size:15px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer;background:linear-gradient(135deg,#ff6b6b,#ffa500);transition:opacity .2s}
${isPreview ? '.ob-badge{position:fixed;top:8px;left:50%;transform:translateX(-50%);background:rgba(255,107,107,.95);color:#fff;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;z-index:999;white-space:nowrap;backdrop-filter:blur(8px)}' : ''}
</style></head><body>
${isPreview ? '<div class="ob-badge">👀 Admin Vorschau &nbsp;·&nbsp; <a href="/einstellungen" style="color:rgba(255,255,255,.8)">← Zurück</a></div>' : ''}
<div class="ob-wrap">
  <div class="ob-top">
    <div class="ob-logo">CreatorBoost</div>
    <span class="ob-skip-top" onclick="finish()">Überspringen</span>
  </div>
  <div class="ob-slides" id="slides">

    <!-- SLIDE 1: WILLKOMMEN & FEED -->
    <div class="ob-slide active" id="slide-0">
      <div class="ob-label" style="--c:#ff6b6b">Schritt 1 von 5</div>
      <div class="ob-title">Dein täglicher Feed 📱</div>
      <div class="ob-sub">Hier siehst du alle Instagram Links der Community. Scrolle durch und like die Posts deiner Mitglieder.</div>
      <div class="ob-phone" style="position:relative">
        <div class="mock-topbar">
          <div class="mock-logo">CreatorBoost</div>
          <div style="font-size:14px">⚡</div>
        </div>
        <div style="display:flex;gap:8px;padding:8px 10px;overflow:hidden">
          ${['MK','SL','JB','KR'].map((n,i)=>`<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0">
            <div style="width:40px;height:40px;border-radius:50%;padding:2px;background:linear-gradient(135deg,#f9a825,#e91e63)">
              <div style="width:100%;height:100%;border-radius:50%;background:#${['ff6b6b','4dabf7','cc5de8','ffd43b'][i]}44;border:2px solid #111;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${n}</div>
            </div>
            <div style="font-size:8px;color:rgba(255,255,255,.4)">${n}</div>
          </div>`).join('')}
        </div>
        <div class="mock-post">
          <div class="mock-post-hd">
            <div class="mock-av" style="background:linear-gradient(135deg,#ff6b6b,#ffa500)">MK</div>
            <div style="flex:1"><div style="font-size:10px;font-weight:600">Max K.</div><div style="font-size:8px;color:rgba(255,255,255,.4)">⬆️ Aufsteiger · @maxk.ig</div></div>
            <div style="font-size:8px;color:rgba(255,255,255,.3)">14:32</div>
          </div>
          <div class="mock-banner">
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent,rgba(0,0,0,.7))"></div>
            <div style="position:absolute;bottom:5px;left:8px;font-size:10px;font-weight:700;color:#fff">Max K. <span style="opacity:.6;font-size:8px">⬆️</span></div>
            <div style="position:absolute;bottom:5px;right:8px;font-size:9px;color:#ff6b6b;font-weight:700">Öffnen →</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:5px 9px">
            <div style="font-size:11px;color:#ff6b6b;display:flex;align-items:center;gap:3px">❤️ <span style="font-size:10px">12 Likes</span></div>
          </div>
        </div>
        <!-- Highlight: Like Button -->
        <div class="hl" style="width:26px;height:26px;top:152px;left:17px"></div>
        <div class="tip up" style="bottom:82px;left:8px">❤️ Hier liken!</div>
        <div style="position:absolute;bottom:0;left:0;right:0">
          <div class="mock-nav">
            <div class="mock-nav-item act">🏠<div class="mock-nav-dot"></div></div>
            <div class="mock-nav-item">📊</div>
            <div class="mock-nav-item">💬</div>
            <div class="mock-nav-item">👤</div>
          </div>
        </div>
      </div>
    </div>

    <!-- SLIDE 2: LINK POSTEN -->
    <div class="ob-slide" id="slide-1">
      <div class="ob-label" style="--c:#ffa500">Schritt 2 von 5</div>
      <div class="ob-title">So postest du deinen Link 🔗</div>
      <div class="ob-sub">Geh auf <b style="color:#fff">Profil → "📸 Link teilen"</b> Tab. Füge deinen Instagram Link ein und teile ihn mit der Community.</div>
      <div class="ob-phone" style="position:relative">
        <div class="mock-topbar">
          <div style="font-size:13px;font-weight:700">Profil</div>
          <div style="display:flex;gap:6px;font-size:13px">🔍 🔔 ⚙️</div>
        </div>
        <div style="height:50px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);position:relative">
          <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent,#111)"></div>
          <div style="position:absolute;bottom:-14px;left:10px;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffa500);border:2px solid #111;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">Du</div>
        </div>
        <div style="padding:18px 10px 6px">
          <div style="font-size:12px;font-weight:700">Dein Name</div>
          <div style="font-size:9px;color:rgba(255,255,255,.4)">⬆️ Aufsteiger · 890 XP</div>
        </div>
        <div class="mock-tab-row">
          <div class="mock-tab">📝 Posts</div>
          <div class="mock-tab">🔗 Links</div>
          <div class="mock-tab act">📸 Link teilen</div>
        </div>
        <!-- Highlight: Link teilen tab -->
        <div class="hl-rect" style="top:118px;right:2px;width:96px;height:24px;border-radius:6px"></div>
        <div class="tip down" style="top:85px;right:4px">👆 Hier tippen</div>
        <div style="padding:8px 0">
          <div class="mock-input-area">🔗 https://www.instagram.com/reel/...</div>
          <div class="mock-input-area" style="margin-top:4px">Beschreibung (optional)...</div>
          <div class="mock-btn" style="margin-top:6px">📸 Link teilen</div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0">
          <div class="mock-nav">
            <div class="mock-nav-item">🏠</div>
            <div class="mock-nav-item">📊</div>
            <div class="mock-nav-item">💬</div>
            <div class="mock-nav-item act">👤<div class="mock-nav-dot"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- SLIDE 3: RANKING & XP -->
    <div class="ob-slide" id="slide-2">
      <div class="ob-label" style="--c:#ffd43b">Schritt 3 von 5</div>
      <div class="ob-title">XP & Rangliste 🏆</div>
      <div class="ob-sub">Jeder Link den du likest gibt dir XP. Je mehr du anderen hilfst, desto höher steigst du auf. Tippe auf <b style="color:#fff">📊</b> in der Navigation.</div>
      <div class="ob-phone" style="position:relative">
        <div class="mock-topbar">
          <div style="font-size:13px;font-weight:700">Rangliste</div>
          <div style="font-size:10px;color:rgba(255,255,255,.4)">Dein Rang: #4</div>
        </div>
        <div style="padding:4px 0">
          ${[['🥇','Alex K.','👑 Elite Creator','4.200',false],['🥈','Maria L.','🏅 Erfahrene','2.850',false],['🥉','Jonas B.','🏅 Erfahrene','1.940',false],['4','Du','⬆️ Aufsteiger','890',true],['5','Kim R.','📘 Anfänger','340',false]].map(([pos,name,role,xp,isMe])=>`
          <div class="mock-rank-item" style="${isMe?'background:rgba(255,107,107,.08);border-left:2px solid #ff6b6b':''}">
            <div style="width:22px;font-size:14px;flex-shrink:0;text-align:center">${pos}</div>
            <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#${isMe?'ff6b6b,#ffa500':'4dabf7,#cc5de8'});display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${name.split(' ').map(w=>w[0]).join('')}</div>
            <div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:${isMe?'700':'600'}">${isMe?'Du ('+name+')':name}</div><div style="font-size:8px;color:rgba(255,255,255,.4)">${role}</div></div>
            <div style="font-size:11px;font-weight:700;color:#ffd43b">${xp} XP</div>
          </div>`).join('')}
        </div>
        <div style="padding:6px 10px 4px">
          <div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:3px">Noch 110 XP bis 🏅 Erfahrene</div>
          <div class="mock-xp-bar"><div class="mock-xp-fill" style="width:72%"></div></div>
        </div>
        <!-- Highlight: ranking nav -->
        <div class="hl" style="width:26px;height:26px;bottom:14px;left:calc(25% - 13px)"></div>
        <div class="tip up" style="bottom:48px;left:14px">📊 Rangliste</div>
        <div style="position:absolute;bottom:0;left:0;right:0">
          <div class="mock-nav">
            <div class="mock-nav-item">🏠</div>
            <div class="mock-nav-item act">📊<div class="mock-nav-dot"></div></div>
            <div class="mock-nav-item">💬</div>
            <div class="mock-nav-item">👤</div>
          </div>
        </div>
      </div>
    </div>

    <!-- SLIDE 4: NACHRICHTEN -->
    <div class="ob-slide" id="slide-3">
      <div class="ob-label" style="--c:#4dabf7">Schritt 4 von 5</div>
      <div class="ob-title">Nachrichten 💬</div>
      <div class="ob-sub">Schreib jedem in der Community direkt. Tippe auf <b style="color:#fff">💬</b> unten oder auf ein Profil → "💬" Button.</div>
      <div class="ob-phone" style="position:relative">
        <div class="mock-topbar"><div style="font-size:13px;font-weight:700">Nachrichten</div></div>
        ${[['MK','Max K.','Danke für den Like! 🙏','linear-gradient(135deg,#ff6b6b,#ffa500)',2],['SL','Sara L.','Cooles Reel! Hab ich geliked 👍','linear-gradient(135deg,#4dabf7,#cc5de8)',0],['JB','Jonas B.','Welche App nutzt du?','linear-gradient(135deg,#3b82f6,#06b6d4)',1]].map(([init,name,msg,grad,unread])=>`
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="width:36px;height:36px;border-radius:50%;background:${grad};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${init}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:600">${name}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${msg}</div>
          </div>
          ${unread>0?`<div style="background:#ff6b6b;color:#fff;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${unread}</div>`:''}
        </div>`).join('')}
        <div style="margin:8px 10px;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.06)">
          <div style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06);font-size:10px;font-weight:600;display:flex;align-items:center;gap:6px">
            <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffa500);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700">MK</div>
            Max K.
          </div>
          <div style="padding:6px 8px;background:#2a2a2a;border-radius:10px;margin:5px 8px;font-size:10px;color:rgba(255,255,255,.7)">Danke für den Like! 🙏</div>
          <div style="padding:6px 8px;background:#ff6b6b;border-radius:10px;margin:4px 8px;font-size:10px;color:#fff;align-self:flex-end;text-align:right">Klar, tolles Reel! 💪</div>
          <div style="display:flex;gap:5px;padding:6px 8px;background:rgba(0,0,0,.3)">
            <div style="flex:1;background:#222;border-radius:14px;padding:5px 8px;font-size:9px;color:rgba(255,255,255,.3)">Nachricht...</div>
            <div style="background:#ff6b6b;border-radius:14px;padding:5px 10px;font-size:10px;color:#fff;font-weight:700">➤</div>
          </div>
        </div>
        <!-- Highlight: messages nav -->
        <div class="hl" style="width:26px;height:26px;bottom:14px;left:calc(50% + 25% - 13px)"></div>
        <div class="tip up" style="bottom:48px;right:14px">💬 Nachrichten</div>
        <div style="position:absolute;bottom:0;left:0;right:0">
          <div class="mock-nav">
            <div class="mock-nav-item">🏠</div>
            <div class="mock-nav-item">📊</div>
            <div class="mock-nav-item act">💬<div class="mock-nav-dot"></div></div>
            <div class="mock-nav-item">👤</div>
          </div>
        </div>
      </div>
    </div>

    <!-- SLIDE 5: EINSTELLUNGEN & PROFIL -->
    <div class="ob-slide" id="slide-4">
      <div class="ob-label" style="--c:#00c851">Schritt 5 von 5</div>
      <div class="ob-title">Profil & Einstellungen ⚙️</div>
      <div class="ob-sub">Richte dein Profil ein! Geh auf <b style="color:#fff">👤 Profil</b> → tippe <b style="color:#fff">⚙️</b> oben rechts für Foto, Bio, Banner & mehr.</div>
      <div class="ob-phone" style="position:relative">
        <div class="mock-topbar">
          <div style="font-size:13px;font-weight:700">Profil</div>
          <div style="display:flex;gap:5px;align-items:center">
            <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:12px">🔍</div>
            <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:12px">🔔</div>
            <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:12px">⚙️</div>
          </div>
        </div>
        <!-- Highlight: settings icon -->
        <div class="hl" style="width:32px;height:32px;top:5px;right:4px"></div>
        <div class="tip down" style="top:40px;right:4px">⚙️ Einstellungen</div>
        <div style="height:55px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);position:relative">
          <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent,#111)"></div>
          <div style="position:absolute;bottom:-14px;left:10px;width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#ff6b6b,#ffa500);border:2px solid #111;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700">Du</div>
        </div>
        <div style="padding:20px 10px 6px">
          <div style="font-size:13px;font-weight:700">Dein Name</div>
          <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px">@dein.instagram · ⬆️ Aufsteiger</div>
          <div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:4px;line-height:1.4">✏️ Hier kannst du Bio, Spitzname,<br>Profilbild & Banner ändern</div>
        </div>
        <div style="display:flex;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)">
          ${[['890','XP'],['12','Links'],['47','Likes'],['3','Follower']].map(([v,l])=>`<div style="flex:1;text-align:center;padding:8px 0;border-right:1px solid rgba(255,255,255,.06)"><div style="font-size:13px;font-weight:700">${v}</div><div style="font-size:8px;color:rgba(255,255,255,.4)">${l}</div></div>`).join('')}
        </div>
        <div style="padding:6px 10px">
          <div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:3px">Noch 110 XP bis 🏅 Erfahrene</div>
          <div class="mock-xp-bar"><div class="mock-xp-fill" style="width:72%"></div></div>
        </div>
        <div class="mock-tab-row">
          <div class="mock-tab act">📝 Posts</div>
          <div class="mock-tab">🔗 Links</div>
          <div class="mock-tab">📸 Link teilen</div>
        </div>
        <!-- Highlight: profile nav -->
        <div class="hl" style="width:26px;height:26px;bottom:14px;right:calc(0% + 25% - 13px)"></div>
        <div style="position:absolute;bottom:0;left:0;right:0">
          <div class="mock-nav">
            <div class="mock-nav-item">🏠</div>
            <div class="mock-nav-item">📊</div>
            <div class="mock-nav-item">💬</div>
            <div class="mock-nav-item act">👤<div class="mock-nav-dot"></div></div>
          </div>
        </div>
      </div>
    </div>

  </div>
  <div class="ob-bottom">
    <div class="ob-dots" id="dots">
      ${[0,1,2,3,4].map(i=>`<div class="ob-dot ${i===0?'active':''}" onclick="goTo(${i})"></div>`).join('')}
    </div>
    <button class="ob-next" id="next-btn" onclick="next()">Weiter →</button>
  </div>
</div>
<script>
const TOTAL = 5;
const COLORS = ['linear-gradient(135deg,#ff6b6b,#ffa500)','linear-gradient(135deg,#ffa500,#ffd43b)','linear-gradient(135deg,#ffd43b,#ffa500)','linear-gradient(135deg,#4dabf7,#00c851)','linear-gradient(135deg,#00c851,#4dabf7)'];
let cur = 0;
function goTo(i) {
    const prev = cur; cur = i;
    document.querySelectorAll('.ob-slide').forEach((s,j)=>{s.classList.remove('active','prev');if(j===cur)s.classList.add('active');else if(j===prev)s.classList.add('prev');});
    document.querySelectorAll('.ob-dot').forEach((d,j)=>d.classList.toggle('active',j===cur));
    const nb=document.getElementById('next-btn');
    nb.style.background=COLORS[cur];
    nb.textContent = cur===TOTAL-1 ? '🚀 Los gehts!' : 'Weiter →';
}
function next(){cur<TOTAL-1?goTo(cur+1):finish();}
function finish(){${finishAction}}
let sx=0;
document.getElementById('slides').addEventListener('touchstart',e=>sx=e.touches[0].clientX,{passive:true});
document.getElementById('slides').addEventListener('touchend',e=>{const d=sx-e.changedTouches[0].clientX;if(Math.abs(d)>50){if(d>0&&cur<TOTAL-1)next();else if(d<0&&cur>0)goTo(cur-1);}},{passive:true});
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

const server = http.createServer(async (req, res) => {
    const pu = url.parse(req.url, true);
    const path = pu.pathname;
    const query = pu.query;

    // ── SERVICE WORKER ──
    if (path === '/sw.js') {
        res.writeHead(200, {'Content-Type':'application/javascript'});
        return res.end(`self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>clients.claim());self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>new Response('offline'))));`);
    }

    // ── APP BILD ENDPOINT ──
    if (path.startsWith('/appbild/')) {
        const parts = path.split('/');
        const buid = parts[2];
        const btype = parts[3];
        const bildFile = DATA_DIR + '/bild_' + buid + '_' + btype + '.txt';
        try {
            if (!fs.existsSync(bildFile)) { res.writeHead(404); return res.end('not found'); }
            const data = fs.readFileSync(bildFile, 'utf8');
            const mime = data.split(';')[0].replace('data:','');
            const base64 = data.split(',')[1];
            res.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'public, max-age=3600'});
            return res.end(Buffer.from(base64, 'base64'));
        } catch(e) { res.writeHead(500); return res.end('error: ' + e.message); }
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
<title>CreatorBoost</title>
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
        return res.end(JSON.stringify({name:'CreatorBoost',short_name:'CreatorBoost',start_url:'/feed',display:'standalone',background_color:'#000000',theme_color:'#ff6b6b',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'}]}));
    }

    if (path === '/icon-192.png' || path === '/icon-512.png') {
        const size = path.includes('512') ? 512 : 192;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${size*0.2}" fill="#ff6b6b"/><text x="50%" y="55%" font-family="Arial" font-size="${size*0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">CB</text></svg>`;
        res.writeHead(200,{'Content-Type':'image/svg+xml'});
        return res.end(svg);
    }

    // ── PROFILBILD UPLOAD ──
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
        await postBot('/update-profile-api', updateData);
        if (session) {
            if (body.theme) session.theme = body.theme;
            if (body.lang) session.lang = body.lang;
            saveSessions();
        }
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
        return json({ok:true});
    }

    if (path === '/api/pin-post' && req.method === 'POST') {
        const body = await parseBody(req);
        await postBot('/pin-post-api', { uid: myUid, timestamp: body.timestamp });
        return json({ok:true});
    }

    if (path === '/api/comment' && req.method === 'POST') {
        const body = await parseBody(req);
        const { postId, text } = body;
        if (!postId || !text?.trim()) return json({error:'Ungültig'},400);
        await postBot('/comment-api', { uid: myUid, name: session.name||'User', linkId: postId, text: text.trim().slice(0,200) });
        return json({ok:true});
    }

    // ── FEED ──
    if (path === '/feed') {
        const tab = query.tab || 'heute';
        const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
        const todayLinks = Object.entries(d.links||{})
            .filter(([,l]) => l.timestamp && l.timestamp >= twoDaysAgo)
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

            // Like button HTML
            const likeBtn = String(link.user_id)===String(myUid)
                ? '<div style="font-size:12px;color:var(--muted);padding:7px 12px">👤 Dein Link</div>'
                : '<button class="post-action-btn '+(hasLiked?'liked':'')+'" onclick="likePost(\''+lid1+'\',this)" data-msgid="'+lid1+'" '+(hasLiked?'disabled':'')+'>'+
                  '<svg width="20" height="20" viewBox="0 0 24 24" fill="'+(hasLiked?'currentColor':'none')+'" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'+
                  '<span id="likes-'+lid1+'">'+likes.length+'</span>'+
                  '</button>';

            // Likes box HTML
            const likesBox = likes.length===0 ? '' :
                '<div style="margin:0 16px 8px;border:1px solid var(--border2);border-radius:12px;overflow:hidden">'+
                '<button onclick="toggleLikers(\''+lid1+'\')" style="width:100%;background:var(--bg4);border:none;padding:10px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;text-align:left">'+
                '<div style="display:flex;align-items:center">'+likerAvatars+'</div>'+
                '<span style="flex:1;font-size:12px;font-weight:700;color:var(--text)">❤️ '+likes.length+' '+(likes.length===1?'Person hat':'Personen haben')+' geliked</span>'+
                '<span id="likers-arrow-'+lid1+'" style="font-size:12px;color:var(--muted);transition:transform .2s">▼</span>'+
                '</button>'+
                '<div id="likers-box-'+lid1+'" style="display:none"><div style="padding:4px 0">'+likerRows+'</div></div>'+
                '</div>';

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

            return '<div class="post fade-up" id="post-'+msgId+'" data-url="'+link.text+'" data-ts="'+(link.timestamp||0)+'">\n'+
'  <div class="post-header">\n'+
'    <div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:'+grad+';flex-shrink:0;display:flex;align-items:center;justify-content:center">\n'+
'      <span style="color:#fff;font-weight:700;font-size:15px;position:absolute">'+(poster.name||'?').slice(0,1)+'</span>\n'+
'      '+avatarSmall+'\n'+
'    </div>\n'+
'    <div class="post-user-info">\n'+
'      <div class="post-name" style="display:flex;align-items:center;gap:5px">\n'+
'        '+(poster.spitzname||poster.name||'User')+'\n'+
'        '+(isOnline?'<span style="width:7px;height:7px;border-radius:50%;background:#00c851;display:inline-block;flex-shrink:0"></span>':'')+'\n'+
'      </div>\n'+
'      <div class="post-badge">'+(poster.role||'')+' '+(insta?'· 📸 @'+poster.instagram:'')+' </div>\n'+
'    </div>\n'+
'    <div class="post-time">'+new Date(link.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'</div>\n'+
'  </div>\n'+
'  <div onclick="window.open(\''+link.text+'\',\'_blank\')" style="cursor:pointer;margin:0 16px;border-radius:12px;overflow:hidden;background:var(--bg4);border:1px solid var(--border2)">\n'+
'    <div style="position:relative;width:100%;height:130px;overflow:hidden">\n'+
'      <div style="position:absolute;inset:0;background:'+bannerBg+'"></div>\n'+
'      '+bannerImg+'\n'+
'      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 20%,rgba(0,0,0,.75))"></div>\n'+
'      <div style="position:absolute;bottom:10px;left:12px;display:flex;align-items:center;gap:10px">\n'+
'        <div style="width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,.4);overflow:hidden;background:'+grad+';display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0">'+profPic+'</div>\n'+
'        <div>\n'+
'          <div style="font-size:13px;font-weight:700;color:#fff">'+(poster.spitzname||poster.name||'User')+'</div>\n'+
'          <div style="font-size:11px;color:rgba(255,255,255,.7)">'+(poster.role||'')+'</div>\n'+
'        </div>\n'+
'      </div>\n'+
'    </div>\n'+
'    <div style="padding:8px 12px;display:flex;align-items:center;gap:8px">\n'+
'      <div style="font-size:16px">📸</div>\n'+
'      <div style="flex:1;min-width:0"><div style="font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+link.text.replace('https://www.','').slice(0,45)+'</div></div>\n'+
'      <div style="font-size:10px;color:var(--accent);font-weight:600">Öffnen →</div>\n'+
'    </div>\n'+
'  </div>\n'+
'  <div class="post-actions">'+likeBtn+'</div>\n'+
likesBox+
commentsBox+
'</div>';}

        const heuteHtml = heuteLinks.length ? heuteLinks.map(renderLink).join('') : `
<div style="text-align:center;padding:48px 24px">
  <div style="font-size:56px;margin-bottom:16px">📸</div>
  <div style="font-size:17px;font-weight:700;margin-bottom:8px">Noch keine Links heute</div>
  <div style="font-size:13px;color:var(--muted);margin-bottom:24px">Sei der Erste! Teile deinen Instagram Link mit der Community.</div>
  <a href="/profil" onclick="setTimeout(()=>{document.querySelector('[onclick*=postlink]')?.click()},300)" style="display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none">📸 Jetzt Link teilen</a>
</div>`;
        const aelterHtml = aelterLinks.length ? aelterLinks.map(renderLink).join('') : '<div class="empty" style="margin-top:40px"><div class="empty-icon">🕐</div><div class="empty-text">Keine älteren Links</div></div>';
        const postsHtml = tab === 'aelter' ? '<div style="padding:8px 0 80px">'+aelterHtml+'</div>' : '<div style="padding:8px 0 80px">'+heuteHtml+'</div>';

        return html(`
<div class="topbar">
  <div class="topbar-logo">CreatorBoost</div>
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
  <a href="/feed?tab=heute" style="flex:1;padding:10px;font-size:13px;font-weight:700;text-align:center;text-decoration:none;display:block;border-bottom:3px solid ${tab==='aelter'?'transparent':'var(--accent)'};margin-bottom:-2px;color:${tab==='aelter'?'var(--muted)':'var(--accent)'}">📅 Heute</a>
  <a href="/feed?tab=aelter" style="flex:1;padding:10px;font-size:13px;font-weight:700;text-align:center;text-decoration:none;display:block;border-bottom:3px solid ${tab==='aelter'?'var(--accent)':'transparent'};margin-bottom:-2px;color:${tab==='aelter'?'var(--accent)':'var(--muted)'}">🕐 Älter</a>
</div>
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
if (!localStorage.getItem('cb_onboarded')) { window.location.href = '/onboarding'; }

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
</script>`, 'feed');
    }

    // ── CHAT ──
    if (path.startsWith('/nachrichten/')) {
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
      <span style="position:absolute">${otherName[0]}</span>
      ${ladeBild(otherUid,'profilepic')
        ? `<img src="/appbild/${otherUid}/profilepic" style="width:100%;height:100%;object-fit:cover" alt="">`
        : otherUser.instagram
        ? `<img src="https://unavatar.io/instagram/${otherUser.instagram}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`
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

    // ── NACHRICHTEN ÜBERSICHT ──
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
        const convHtml = myConvos.length ? myConvos.map(c => `
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
</a>`).join('') : '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Keine Nachrichten</div><div class="empty-sub">Schreibe jemandem!</div></div>';
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
        const myPostsHtml = myPosts.length
            ? myPosts.slice().reverse().map((p)=>{
                const pid = myUid+'_'+p.timestamp;
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
        return html(`
<div class="topbar">
  <div class="topbar-logo">Profil</div>
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
${(()=>{
  const fields = [
    [myUser?.bio, 'Bio hinzufügen'],
    [myUser?.instagram, 'Instagram verknüpfen'],
    [myBannerData || myUser?.banner, 'Banner hochladen'],
    [myPicData || myUser?.profilePic || myUser?.instagram, 'Profilbild setzen'],
    [myUser?.nische, 'Nische eintragen'],
  ];
  const done = fields.filter(([v])=>v).length;
  const total = fields.length;
  const pct = Math.round(done/total*100);
  if (pct === 100) return '';
  const missing = fields.filter(([v])=>!v).map(([,l])=>l);
  return `<div style="margin:12px 16px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700">Profil zu ${pct}% vollständig</div>
      <div style="font-size:12px;color:var(--muted)">${done}/${total}</div>
    </div>
    <div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-bottom:10px">
      <div style="height:100%;width:${pct}%;background:linear-gradient(135deg,#ff6b6b,#ffa500);border-radius:3px;transition:width .5s"></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${missing.map(m=>`<a href="/einstellungen" style="font-size:11px;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.25);color:var(--accent);padding:4px 10px;border-radius:20px;text-decoration:none">+ ${m}</a>`).join('')}
    </div>
  </div>`;
})()}
${(()=>{
  const u = myUser || {};
  const checks = [
    [!!u.bio, 'Bio hinzufügen', '/einstellungen'],
    [!!(myPicData||ladeBild(myUid,'profilepic')), 'Profilbild hochladen', '/einstellungen'],
    [!!u.instagram, 'Instagram verknüpft', null],
    [!!u.nische, 'Nische ausfüllen', '/einstellungen'],
    [!!(session.bannerData||ladeBild(myUid,'banner')), 'Banner hochladen', '/einstellungen'],
  ];
  const done = checks.filter(c=>c[0]).length;
  const pct = Math.round(done/checks.length*100);
  if (pct === 100) return '';
  const next = checks.find(c=>!c[0]);
  return `<div style="margin:12px 16px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700">Profil vervollständigen</div>
      <div style="font-size:12px;font-weight:700;color:var(--accent)">${done}/${checks.length}</div>
    </div>
    <div style="background:var(--bg4);border-radius:4px;height:6px;overflow:hidden;margin-bottom:10px">
      <div style="height:100%;width:${pct}%;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:4px;transition:width .6s ease"></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
      ${checks.map(([done,label])=>`<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:${done?'var(--green)':'var(--muted)'}">
        ${done?'✅':'⬜'} ${label}
      </div>`).join('')}
    </div>
    ${next&&next[2]?`<a href="${next[2]}" style="display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#fff;padding:7px 14px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none">➕ ${next[1]}</a>`:''}
  </div>`;
})()}
<div class="tabs" style="margin-top:8px;position:sticky;top:57px;z-index:50;background:var(--bg)">
  <div class="tab active" onclick="showPTab('posts',this)">📝 Posts</div>
  <div class="tab" onclick="showPTab('links',this)">🔗 Links</div>
  <div class="tab" onclick="showPTab('postlink',this)">📸 Link teilen</div>
</div>
<div id="ptab-postlink" style="display:none;padding-bottom:100px">
  <div style="padding:16px">
    <input type="url" id="link-input" class="form-input" placeholder="https://www.instagram.com/reel/..." style="margin-bottom:8px">
    <textarea id="link-caption" class="form-input" placeholder="Beschreibung (optional)..." maxlength="200" rows="2" style="margin-bottom:8px"></textarea>
    <button class="btn btn-primary btn-full" onclick="postLink()">📸 Link teilen</button>
    <div id="link-result" style="margin-top:8px;font-size:12px;text-align:center"></div>
  </div>
</div>
<div id="ptab-posts" style="padding-bottom:100px">
  <div style="padding:12px 16px">
    <textarea id="new-post" class="form-input" placeholder="Was denkst du gerade? (max 300 Zeichen)" maxlength="300" rows="3"></textarea>
    <button class="btn btn-primary btn-full" style="margin-top:8px" onclick="submitPost()">📝 Posten</button>
  </div>
  ${myPostsHtml}
</div>
<div id="ptab-links" style="display:none;padding-bottom:100px">
  ${Object.values(d.links||{}).filter(l=>l.user_id===Number(myUid)).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).map(l=>'<div style="padding:12px 16px;border-top:1px solid var(--border2)"><a href="'+l.text+'" target="_blank" style="color:var(--blue);font-size:12px;word-break:break-all">'+l.text+'</a><div style="font-size:11px;color:var(--muted);margin-top:4px">❤️ '+(Array.isArray(l.likes)?l.likes.length:0)+' Likes · '+new Date(l.timestamp).toLocaleDateString('de-DE')+'</div></div>').join('')||'<div class="empty"><div class="empty-icon">🔗</div><div class="empty-text">Noch keine Links</div></div>'}
</div>
<script>
function showPTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('ptab-posts').style.display = tab==='posts'?'block':'none';
    document.getElementById('ptab-links').style.display = tab==='links'?'block':'none';
    const pl = document.getElementById('ptab-postlink');
    if(pl) pl.style.display = tab==='postlink'?'block':'none';
}
// Notification badge
(async()=>{try{const r=await fetch('/api/notifications/count');const d=await r.json();const b=document.getElementById('notif-badge-profil');if(b&&d.count>0){b.textContent=d.count>9?'9+':d.count;b.style.display='flex';}}catch(e){}})();
async function deletePost(timestamp) {
    if (!confirm('Post löschen?')) return;
    const res = await fetch('/api/delete-post', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp})});
    const data = await res.json();
    if (data.ok) { toast('✅ Gelöscht'); setTimeout(()=>location.reload(),500); }
    else toast('❌ Fehler');
}
async function postLink() {
    const url = document.getElementById('link-input')?.value?.trim();
    const result = document.getElementById('link-result');
    if (!url) return;
    if (!url.includes('instagram.com')) { result.textContent='❌ Nur Instagram Links erlaubt'; return; }
    const btn = document.querySelector('[onclick="postLink()"]');
    btn.disabled = true; btn.textContent = '⏳ Wird gesendet...';
    try {
        const caption = document.getElementById('link-caption')?.value?.trim() || '';
        const res = await fetch('/api/post-link', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url, caption})});
        const data = await res.json();
        if (data.ok) { result.textContent='✅ Link erfolgreich geteilt!'; document.getElementById('link-input').value=''; }
        else { result.textContent='❌ '+(data.error||'Fehler'); }
    } catch(e) { result.textContent='❌ Netzwerkfehler'; }
    btn.disabled=false; btn.textContent='📸 Link teilen';
}
async function submitPost() {
    const text = document.getElementById('new-post').value.trim();
    if (!text) return toast('❌ Text erforderlich');
    const btn = document.querySelector('[onclick="submitPost()"]');
    btn.disabled = true; btn.textContent = '⏳...';
    const res = await fetch('/api/post', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
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
${adminIds.includes(Number(myUid)) ? `
<div style="padding:16px;border-bottom:1px solid var(--border2)">
  <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">⚙️ Admin Tools</div>
  <a href="/onboarding-preview" class="btn btn-outline btn-full" style="margin-bottom:8px;display:flex">👀 Onboarding Vorschau</a>
</div>` : ''}
<div style="padding:16px">
  <a href="/logout" class="btn btn-outline btn-full" style="color:var(--accent)">🚪 Ausloggen</a>
</div>
<script>
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
    if (file.size > 1500000) return toast('❌ Bild zu groß (max 1.5MB)');
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const res = await fetch('/api/upload-profilepic', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData:e.target.result})});
            const data = await res.json();
            if (data.ok) { document.getElementById('pic-preview').innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover" alt="">'; toast('✅ Profilbild gesetzt!'); }
            else toast('❌ ' + (data.error||'Fehler'));
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
        try {
            const res = await fetch('/api/upload-banner', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData:e.target.result})});
            const data = await res.json();
            if (data.ok) { toast('✅ Banner gespeichert!'); setTimeout(()=>location.href='/profil',1000); }
            else toast('❌ ' + (data.error||'Fehler'));
        } catch(e) { toast('❌ Upload Fehler'); }
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
</script>`, 'settings');
    }

    redirect('/feed');
});

server.listen(PORT, () => console.log('🌐 CreatorBoost App läuft auf Port ' + PORT));
