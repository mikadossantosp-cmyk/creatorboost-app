process.env.TZ = 'Europe/Berlin';
const https = require('https');
const http = require('http');
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
        const req = lib.request(opts, res=>{
            let buf='';
            res.on('data',c=>buf+=c);
            res.on('end',()=>{ try{resolve(JSON.parse(buf));}catch(e){resolve({ok:true});} });
        });
        req.on('error',()=>resolve(null)); req.write(data); req.end();
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
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <span style="font-size:16px;font-weight:700">📸 Reel Link teilen</span>
      <button onclick="closePlusSheet()" style="background:var(--bg4);border:none;color:var(--text);border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Teile deinen Instagram Reel Link mit der Community und sammle XP durch Likes.</div>
    <input type="url" id="plus-link-input" class="form-input" placeholder="https://www.instagram.com/reel/..." style="margin-bottom:8px">
    <textarea id="plus-link-caption" class="form-input" placeholder="Beschreibung (optional)..." maxlength="200" rows="2" style="margin-bottom:8px"></textarea>
    <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;margin-bottom:12px">
      <input type="checkbox" id="plus-pin-toggle" style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer">
      <div><div style="font-size:13px;font-weight:600">📌 Als angepinnten Post setzen</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Erscheint oben im Profil · max 1 Pin</div></div>
    </label>
    <button class="btn btn-primary btn-full" onclick="plusPostLink()">📸 Link teilen</button>
    <div id="plus-link-result" style="margin-top:8px;font-size:12px;text-align:center;color:var(--muted)"></div>
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
function openPlusSheet(){const s=document.getElementById('plus-sheet');if(s){s.classList.add('open');document.body.style.overflow='hidden';const i=document.getElementById('plus-link-input');if(i)setTimeout(()=>i.focus(),300);}}
function closePlusSheet(){const s=document.getElementById('plus-sheet');if(s){s.classList.remove('open');document.body.style.overflow='';}}
async function plusPostLink(){
  const url=(document.getElementById('plus-link-input')?.value||'').trim();
  const result=document.getElementById('plus-link-result');
  if(!url){result.textContent='❌ Bitte Link eingeben';return;}
  if(!url.includes('instagram.com')){result.textContent='❌ Nur Instagram Links erlaubt';return;}
  const btn=document.querySelector('[onclick="plusPostLink()"]');
  btn.disabled=true;btn.textContent='⏳ Wird gesendet...';
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
  btn.disabled=false;btn.textContent='📸 Link teilen';
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
<div style="position:relative">
  <div class="profile-banner" style="${bannerIsGrad ? 'background:'+banner : ''}">
    ${!bannerIsGrad ? '<img src="'+banner+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill" alt="">' : ''}
    <div class="profile-banner-overlay"></div>
    ${isOwn?`<a href="/einstellungen" style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;backdrop-filter:blur(8px)">✏️ Bearbeiten</a>`:''}
  </div>
  <div class="profile-avatar-wrap">
    ${(picData||ladeBild(uid,'profilepic'))
      ? `<img src="${picData||ladeBild(uid,'profilepic')}" class="profile-avatar" onerror="this.style.display='none'" alt="">`
      : u.instagram
      ? `<img src="https://unavatar.io/instagram/${u.instagram}" class="profile-avatar" onerror="this.style.display='none'" alt="">`
      : `<div class="profile-avatar" style="display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;background:${grad};color:#fff">${(u.name||'?').slice(0,2).toUpperCase()}</div>`}
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
  <div class="profile-stat"><div class="profile-stat-val">${(u.projects||[]).length}</div><div class="profile-stat-label">Projekte</div></div>
  <div class="profile-stat"><div class="profile-stat-val">${u.links||0}</div><div class="profile-stat-label">Links</div></div>
  <div class="profile-stat"><div class="profile-stat-val">${(u.followers||[]).length}</div><div class="profile-stat-label">Follower</div></div>
  <div class="profile-stat"><div class="profile-stat-val">💎 ${u.diamonds||0}</div><div class="profile-stat-label">Diamanten</div></div>
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
<title>CreatorX — Willkommen</title>
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
    <div class="ob-logo">CreatorX</div>
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
          <div class="mock-logo">CreatorX</div>
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
          <div style="width:36px;height:36px;border-radius:50%;background:${grad};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;position:relative;overflow:hidden">
  <span style="position:relative;z-index:0">${init}</span>
  ${ladeBild(c.otherUid,'profilepic')?`<img src="/appbild/${c.otherUid}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.remove()" alt="">`:botData.users?.[c.otherUid]?.instagram?`<img src="https://unavatar.io/instagram/${botData.users[c.otherUid].instagram}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.remove()" alt="">`:''}
</div>
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
        return res.end(JSON.stringify({name:'CreatorX',short_name:'CreatorX',start_url:'/feed',display:'standalone',background_color:'#000000',theme_color:'#ff6b6b',icons:[{src:'/icon.jpg?v=5',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'/icon.jpg?v=5',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
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

    if (path === '/api/delete-thread-msg' && req.method === 'POST') {
        const body = await parseBody(req);
        const { threadId, timestamp, msgId } = body;
        if (!threadId || !timestamp) return json({error:'Ungültig'}, 400);
        const result = await postBot('/delete-thread-msg-api', { threadId, timestamp: Number(timestamp), msgId, uid: myUid });
        return json({ok: !!result});
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
// Link preview card
'  <div onclick="window.open(\''+link.text+'\',\'_blank\')" style="cursor:pointer;margin:0 16px;border-radius:12px;overflow:hidden;background:var(--bg4);border:1px solid var(--border2)">\n'+
'    <div style="position:relative;width:100%;height:130px;overflow:hidden">\n'+
'      <div style="position:absolute;inset:0;background:'+bannerBg+'"></div>\n'+
'      '+bannerImg+'\n'+
'      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 20%,rgba(0,0,0,.75))"></div>\n'+
'      <a href="/profil/'+link.user_id+'" onclick="event.stopPropagation()" style="position:absolute;bottom:10px;left:12px;display:flex;align-items:center;gap:10px;text-decoration:none;z-index:1">\n'+
'        <div style="width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,.4);overflow:hidden;background:'+grad+';display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0">'+profPic+'</div>\n'+
'        <div>\n'+
'          <div style="font-size:13px;font-weight:700;color:#fff">'+(poster.spitzname||poster.name||'User')+'</div>\n'+
'          <div style="font-size:11px;color:rgba(255,255,255,.7)">'+(poster.role||'')+'</div>\n'+
'        </div>\n'+
'      </a>\n'+
'    </div>\n'+
'    <div style="padding:8px 12px;display:flex;align-items:center;gap:8px">\n'+
'      <div style="font-size:16px">📸</div>\n'+
'      <div style="flex:1;min-width:0"><div style="font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+link.text.replace('https://www.','').slice(0,45)+'</div></div>\n'+
'      <div style="font-size:10px;color:var(--accent);font-weight:600">Öffnen →</div>\n'+
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

        const heuteHtml = heuteLinks.length ? heuteLinks.map(renderLink).join('') : `
<div style="text-align:center;padding:48px 24px">
  <div style="font-size:56px;margin-bottom:16px">📸</div>
  <div style="font-size:17px;font-weight:700;margin-bottom:8px">Noch keine Links heute</div>
  <div style="font-size:13px;color:var(--muted);margin-bottom:24px">Sei der Erste! Teile deinen Instagram Link mit der Community.</div>
  <button onclick="openPlusSheet()" style="display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;border:none;cursor:pointer;font-family:var(--font)">📸 Jetzt Link teilen</button>
</div>`;
        const aelterHtml = aelterLinks.length ? aelterLinks.map(renderLink).join('') : '<div class="empty" style="margin-top:40px"><div class="empty-icon">🕐</div><div class="empty-text">Keine älteren Links</div></div>';
        const postsHtml = tab === 'aelter' ? '<div style="padding:8px 0 80px">'+aelterHtml+'</div>' : '<div style="padding:8px 0 80px">'+heuteHtml+'</div>';

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
        const thrInfo = (botData.threads||[]).find(t=>String(t.id)===threadId) || { name: threadId==='general'?'Allgemein':'Thread '+threadId, emoji: threadId==='general'?'💬':'📌' };
        // Get messages: general uses communityFeed as fallback
        let msgs = (botData.threadMessages||{})[threadId] || [];
        if (!msgs.length && threadId==='general' && botData.communityFeed?.length) {
            msgs = botData.communityFeed.map(m=>({ uid:'', tgName:m.username||null, name:m.name||m.username||'User', role:null, type:'text', text:m.text||'', mediaId:null, timestamp:m.timestamp, msg_id:m.msg_id }));
        }
        const msgsJson = JSON.stringify(msgs);
        const isAdmin = (botData.users?.[myUid]) && String(botData.users[myUid].role||'').includes('Admin');
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten/gruppe" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg></a>
  <div style="flex:1;text-align:center">
    <div style="font-weight:800;font-size:15px;color:#fff">${thrInfo.emoji} ${thrInfo.name}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7)">Live ●</div>
  </div>
  <div style="width:36px"></div>
</div>
<div id="msgs" style="padding:12px 12px 160px;display:flex;flex-direction:column;gap:10px;overflow-x:hidden;min-width:0;width:100%"></div>
<div style="position:fixed;bottom:calc(60px + var(--safe-bottom));left:0;right:0;padding:10px 12px;background:var(--bg2);border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;z-index:5;box-sizing:border-box;max-width:100vw">
  <textarea id="inp" placeholder="Schreibe etwas..." rows="1" style="flex:1;background:var(--bg4);border:1px solid #0088cc44;border-radius:20px;padding:10px 16px;color:var(--text);font-size:14px;resize:none;outline:none;line-height:1.4;max-height:120px" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}"></textarea>
  <button onclick="send()" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0088cc,#006699);border:none;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">✈️</button>
</div>
<script>
(function(){
  const TID='${threadId}';
  const MY_UID='${myUid}';
  const IS_ADMIN=${isAdmin};
  const COLORS=['#ff6b6b','#cc5de8','#4dabf7','#ffd43b','#00c851','#ff9f43','#0088cc'];
  function col(n){return COLORS[((n||'').charCodeAt(0)||0)%COLORS.length];}
  function ini(n){return((n||'?').replace(/^@/,'')||'?')[0].toUpperCase();}
  function t(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  let known=0;
  function render(msgs){
    const el=document.getElementById('msgs');
    if(!el||msgs.length===known)return;
    const atBottom=window.innerHeight+window.scrollY>=document.body.scrollHeight-80;
    known=msgs.length;
    el.innerHTML=[...msgs].reverse().map(m=>{
      const c=col(m.name);
      const nameEl=m.uid?'<a href="/profil/'+m.uid+'" style="font-size:12px;font-weight:700;color:'+c+';text-decoration:none">'+(m.role?m.role+' ':'')+m.name+'</a>':'<span style="font-size:12px;font-weight:700;color:'+c+'">'+(m.role?m.role+' ':'')+m.name+'</span>';
      let body='';
      if(m.type==='photo'&&m.mediaId)body='<img src="/api/tg-file/'+m.mediaId+'" style="max-width:100%;border-radius:10px;margin-top:4px;display:block" loading="lazy">';
      else if(m.type==='sticker'&&m.mediaId)body='<img src="/api/tg-file/'+m.mediaId+'" style="width:80px;height:80px;object-fit:contain;display:block;margin-top:4px" loading="lazy">';
      else if(m.type==='video')body='<div style="background:rgba(0,0,0,.3);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--muted);margin-top:4px">🎬 Video — öffne Telegram zum Ansehen</div>';
      if(m.text)body+='<div style="font-size:13px;line-height:1.5;margin-top:2px;word-break:break-word">'+m.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';
      const canDel=(m.uid&&m.uid===MY_UID)||IS_ADMIN;
      const delBtn=canDel?'<button onclick="deleteMsg('+m.timestamp+','+(m.msg_id||0)+')" style="background:none;border:none;color:var(--muted);font-size:13px;cursor:pointer;padding:2px 4px;margin-left:auto;opacity:.55;flex-shrink:0">🗑️</button>':'';
      return '<div style="display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;position:relative;overflow:hidden">'+ini(m.name)+(m.uid?'<img src="/appbild/'+m.uid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" loading="lazy">':'')+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">'+nameEl+'<span style="font-size:10px;color:var(--muted)">'+t(m.timestamp)+'</span>'+delBtn+'</div>'+body+'</div></div>';
    }).join('');
    if(atBottom)window.scrollTo(0,document.body.scrollHeight);
  }
  // Initial render with server data
  render(${msgsJson});
  async function load(){
    try{
      const r=await fetch('/api/thread-messages/'+encodeURIComponent(TID));
      if(r.ok){const d=await r.json();if(d.messages?.length)render(d.messages);}
    }catch(e){}
  }
  window.send=async function(){
    const el=document.getElementById('inp');const text=el.value.trim();if(!text)return;
    el.value='';el.style.height='auto';
    const r=await fetch('/api/send-thread-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,thread_id:TID})});
    const d=await r.json();
    if(!d.ok){el.value=text;alert(d.error||'Fehler');}
    else setTimeout(load,1500);
  };
  window.deleteMsg=async function(ts,msgId){
    if(!confirm('Nachricht löschen?'))return;
    const r=await fetch('/api/delete-thread-msg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:TID,timestamp:ts,msgId:msgId||null})});
    const d=await r.json();
    if(d.ok){known=0;await load();toast('✅ Gelöscht');}else toast('❌ '+(d.error||'Fehler'));
  };
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
            const fallbackEmoji = String(t.id)==='general' ? '💬' : (t.emoji && t.emoji!=='📌' ? t.emoji : threadEmoji(t.id));
            if (api?.name) return {...t, name: api.name, emoji: api.emoji || fallbackEmoji};
            return {...t, emoji: fallbackEmoji};
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
  <div class="creator-card-avatar" style="background:${grad}">
    <span style="position:absolute;z-index:0;font-size:16px;font-weight:800">${(u.name||'?').slice(0,1)}</span>
    ${picFile?`<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" alt="">`:insta?`<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display='none'" alt="">`:''}
  </div>
  <div class="creator-card-info">
    <div class="creator-card-name" style="margin-top:4px">${u.spitzname||u.name||'User'}</div>
    ${insta?`<span onclick="event.stopPropagation();window.open('https://instagram.com/${insta}','_blank')" style="font-size:10px;color:#4dabf7;margin-top:2px;display:block;cursor:pointer">@${insta}</span>`:''}
    <div class="creator-card-xp">⚡ ${u.xp||0} XP</div>
    ${pinnedLink?`<a href="${pinnedLink}" target="_blank" onclick="event.stopPropagation()" style="display:block;font-size:10px;color:var(--accent);margin-top:5px;padding:3px 8px;background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.2);border-radius:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none">📌 Reel ansehen</a>`:''}
  </div>
</a>`;
        }).join('');

        // Ranking rows (reused in Ranking tab)
        const rankingRows = sorted.map(([id,u],i)=>{
            const isMe = id===myUid;
            const insta = u.instagram;
            const grad = badgeGradient(u.role);
            return `<a href="/profil/${id}" class="rank-item ${isMe?'rank-me':''}">
    <div class="rank-pos">${i<3?medals[i]:`<span class="rank-num">${i+1}</span>`}</div>
    <div style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;background:${grad};flex-shrink:0;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-weight:700;font-size:14px;position:absolute">${(u.name||'?').slice(0,2).toUpperCase()}</span>
      ${ladeBild(id,'profilepic')?`<img src="/appbild/${id}/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`:insta?`<img src="https://unavatar.io/instagram/${insta}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">`:''}
    </div>
    <div class="rank-info">
      <div class="rank-name">${u.spitzname||u.name||'User'}${isMe?' (Du)':''}</div>
      <div class="rank-badge">${u.role||''}</div>
    </div>
    <div class="rank-xp">${u.xp||0} XP</div>
  </a>`;
        }).join('');

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
      <div style="font-size:13px;font-weight:700">💎 Diamant Shop — Coming Soon</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">Tausche XP gegen Vorteile</div>
    </div>
    <div style="font-size:10px;color:var(--accent);font-weight:700;background:rgba(255,107,107,.12);padding:2px 8px;border-radius:10px;white-space:nowrap">Bald</div>
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
    <div class="action-card-sub">Coming Soon</div>
  </a>
  <a href="/explore?tab=newsletter" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(255,165,0,.2),rgba(255,130,0,.1))">📩</div>
    <div class="action-card-title">Newsletter</div>
    <div class="action-card-sub">Neuigkeiten & Updates</div>
  </a>
</div>`,
            ranking: `
<div style="padding:12px 16px 4px;display:flex;align-items:center;justify-content:space-between">
  <div style="font-size:13px;font-weight:700">⭐ Rangliste</div>
  <div style="font-size:12px;color:var(--muted)">Dein Rang: ${myRank>0?'#'+myRank:adminIds.includes(Number(myUid))?'👑 Admin':'–'}</div>
</div>
<div style="padding-bottom:100px">${rankingRows}</div>`,
            tipps: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">💡</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Tipps & Tricks</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Inhalte folgen bald!</div></div>`,
            regeln: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">📋</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Community Regeln</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Inhalte folgen bald!</div></div>`,
            shop: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">💎</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Diamant Shop</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Kommt bald!</div></div>`,
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

        const completionHtml = (()=>{
            const checks = [
                [!!myUser?.bio, 'Bio hinzufügen', '/einstellungen'],
                [!!(myPicData||ladeBild(myUid,'profilepic')), 'Profilbild hochladen', '/einstellungen'],
                [!!myUser?.instagram, 'Instagram verknüpft', null],
                [!!myUser?.nische, 'Nische ausfüllen', '/einstellungen'],
                [!!(session.bannerData||ladeBild(myUid,'banner')), 'Banner hochladen', '/einstellungen'],
            ];
            const done = checks.filter(c=>c[0]).length;
            const pct = Math.round(done/checks.length*100);
            if (pct === 100) return '';
            const next = checks.find(c=>!c[0]);
            return '<div style="margin:12px 16px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:14px">'
                +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
                +'<div style="font-size:13px;font-weight:700">Profil vervollständigen</div>'
                +'<div style="font-size:12px;font-weight:700;color:var(--accent)">'+done+'/'+checks.length+'</div></div>'
                +'<div style="background:var(--bg4);border-radius:4px;height:6px;overflow:hidden;margin-bottom:10px">'
                +'<div style="height:100%;width:'+pct+'%;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:4px;transition:width .6s ease"></div></div>'
                +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'
                +checks.map(([isDone,label])=>'<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:'+(isDone?'var(--green)':'var(--muted)')+'">'+( isDone?'✅':'⬜')+' '+label+'</div>').join('')
                +'</div>'
                +(next&&next[2]?'<a href="'+next[2]+'" style="display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#fff;padding:7px 14px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none">➕ '+next[1]+'</a>':'')
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
        const currentPinnedLink = ladePinnedLink(myUid) || '';
        const myRecentLinks = Object.values(d.links||{})
            .filter(l=>String(l.user_id)===String(myUid)&&l.text&&l.text.includes('instagram.com'))
            .sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))
            .slice(0,5)
            .map(l=>l.text);
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
        const { text, thread_id } = body;
        if (!text?.trim()) return json({ ok: false });
        const ok = await postBot('/send-thread-message', { uid: myUid, text, thread_id });
        return json(ok || { ok: false });
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

    redirect('/feed');
});

server.listen(PORT, () => console.log('🌐 CreatorX App läuft auf Port ' + PORT));
