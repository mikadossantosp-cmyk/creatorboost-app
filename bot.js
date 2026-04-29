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
    height: 280px;
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
.explore-tabs{display:flex;gap:8px;padding:8px 16px 12px;overflow-x:auto;scrollbar-width:none}
.explore-tabs::-webkit-scrollbar{display:none}
.explore-tab{flex-shrink:0;padding:7px 16px;border-radius:20px;font-size:12px;font-weight:700;background:var(--bg4);color:var(--muted);border:none;cursor:pointer;transition:all .2s;font-family:var(--font)}
.explore-tab.active{background:var(--accent);color:#fff;box-shadow:0 0 14px rgba(255,107,107,.35)}
.explore-welcome{margin:0 16px 16px;border-radius:16px;overflow:hidden;position:relative;height:180px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)}
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
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>CreatorBoost</title>
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
    <textarea id="plus-link-caption" class="form-input" placeholder="Beschreibung (optional)..." maxlength="200" rows="2" style="margin-bottom:12px"></textarea>
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
    const res=await fetch('/api/post-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,caption})});
    const data=await res.json();
    if(data.ok){result.textContent='✅ Link erfolgreich geteilt!';document.getElementById('plus-link-input').value='';document.getElementById('plus-link-caption').value='';setTimeout(()=>closePlusSheet(),1500);}
    else result.textContent='❌ '+(data.error||'Fehler');
  }catch(e){result.textContent='❌ Netzwerkfehler';}
  btn.disabled=false;btn.textContent='📸 Link teilen';
}
function showLikerModal(msgId){const modal=document.getElementById('liker-modal');const content=document.getElementById('liker-modal-content');const rows=document.getElementById('liker-rows-'+msgId);if(!modal||!rows)return;content.innerHTML=rows.innerHTML||'<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Noch niemand geliked</div>';modal.classList.add('open');document.body.style.overflow='hidden';}
function closeLikerModal(){const modal=document.getElementById('liker-modal');if(modal){modal.classList.remove('open');document.body.style.overflow='';} }
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
    ${!bannerIsGrad ? '<img src="'+banner+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" alt="">' : ''}
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
        return res.end(JSON.stringify({name:'CreatorBoost',short_name:'CreatorBoost',start_url:'/feed',display:'standalone',background_color:'#000000',theme_color:'#ff6b6b',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
    }

    if (path === '/icon-192.png' || path === '/icon-512.png' || path === '/apple-touch-icon.png') {
        const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAABgAAAAQACAIAAACoEwUVAACzJmNhQlgAALMmanVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAANzhqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjAwOTFmZTBiLWZkMTAtNDBlNy1hMWQzLWI4ODIzOTM0OWVkYQAAAAHwanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAA/Gp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNoN5Otmtc8r7CvPELy+BhOZgAAALNjYm9yoWdhY3Rpb25zgqNmYWN0aW9ubGMycGEuY3JlYXRlZG1zb2Z0d2FyZUFnZW50oWRuYW1lZkdQVC00b3FkaWdpdGFsU291cmNlVHlwZXhGaHR0cDovL2N2LmlwdGMub3JnL25ld3Njb2Rlcy9kaWdpdGFsc291cmNldHlwZS90cmFpbmVkQWxnb3JpdGhtaWNNZWRpYaFmYWN0aW9ubmMycGEuY29udmVydGVkAAAAw2p1bWIAAABAanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5oYXNoLmRhdGEAAAAAGGMyc2ghyyEGCKqeqQSE0LJJIFh0AAAAe2Nib3KlamV4Y2x1c2lvbnOBomVzdGFydBghZmxlbmd0aBk3amRuYW1lbmp1bWJmIG1hbmlmZXN0Y2FsZ2ZzaGEyNTZkaGFzaFggDuPhrM7lQuLatB1+t4tblspzWOT7/OOeN7Mbxh+BmPxjcGFkSAAAAAAAAAAAAAACAmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAHTY2JvcqdqaW5zdGFuY2VJRHgseG1wOmlpZDo5YTQ0OGQ1MC0wNjhhLTQzZDItYTliMy0xOTYwMzI5MGUyZGN0Y2xhaW1fZ2VuZXJhdG9yX2luZm+iZG5hbWVnQ2hhdEdQVHdvcmcuY29udGVudGF1dGguYzJwYV9yc2YwLjc4LjVpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjAwOTFmZTBiLWZkMTAtNDBlNy1hMWQzLWI4ODIz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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9lhA43zYYay1Ll3XJnhhaLJ6s/hd48Srue/dDBsAvHFW/0aIxEitfDms1FhQFrx/MPj5vNnGNMZtvN+sVV5T4IzbmQAAe8hqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjEzZjg5ZDMzLWFmM2ItNGY3NS05ZmQ1LTUwZTc5ZDg5YmU5MwAAAEWuanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAA9Nmp1bWIAAABLanVtZEDLDDK7ikidpwsq1vR/Q2kTYzJwYS50aHVtYm5haWwuaW5ncmVkaWVudAAAAAAYYzJzaOI4On+FXSnn/YGw+BUW4zEAAAAUYmZkYgBpbWFnZS9qcGVnAAAAPM9iaWRi/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAFNAfQDAREAAhEBAxEB/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6ooAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgBGIVSWIAHJJ7UAeI/EH9o/wAJeGbiaz0hJdev4yVb7MwSBT6GU5z/AMBDD3oA8a1r9qXxlduw0zT9I0+Lt+7eVx+JbH/jtAGR/wANKfET/n80/wD8A1oAP+GlPiJ/z+af/wCAa0AH/DSnxE/5/NP/APANaAAftJ/ET/n908/9uaUAB/aU+In/AD+af/4BrQAf8NKfET/n80//AMA1oAP+GlPiJj/j70//AMA1oAP+GlPiJ/z+af8A+Aa0AA/aU+In/P5p5/7c1oAX/hpX4h/8/enf+Aa0AA/aV+If/P3p3/gGtACf8NKfET/n70//AMA1oAP+GlPiJ/z96f8A+Aa0AB/aU+In/P5p/wD4BrQAf8NKfET/AJ/NP/8AANaAD/hpT4if8/mn/wDgGtAAP2lPiJn/AI/NP/8AANaAD/hp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gAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgD/2QAABp9qdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaLyi6GCMGRpLcegqApujtKsAAAZTY2JvcqhscmVsYXRpb25zaGlwaHBhcmVudE9maGRjOnRpdGxlaWltYWdlLnBuZ2lkYzpmb3JtYXRjcG5ncXZhbGlkYXRpb25SZXN1bHRzoW5hY3RpdmVNYW5pZmVzdKNnc3VjY2Vzc4WjZGNvZGV4HWNsYWltU2lnbmF0dXJlLmluc2lkZVZhbGlkaXR5Y3VybHhNc2VsZiNqdW1iZj0vYzJwYS91cm46YzJwYTowMDkxZmUwYi1mZDEwLTQwZTctYTFkMy1iODgyMzkzNDllZGEvYzJwYS5zaWduYXR1cmVrZXhwbGFuYXRpb251Y2xhaW0gc2lnbmF0dXJlIHZhbGlko2Rjb2RleBhjbGFpbVNpZ25hdHVyZS52YWxpZGF0ZWRjdXJseE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjAwOTFmZTBiLWZkMTAtNDBlNy1hMWQzLWI4ODIzOTM0OWVkYS9jMnBhLnNpZ25hdHVyZWtleHBsYW5hdGlvbnVjbGFpbSBzaWduYXR1cmUgdmFsaWSjZGNvZGV4GWFzc2VydGlvbi5oYXNoZWRVUkkubWF0Y2hjdXJseF1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjAwOTFmZTBiLWZkMTAtNDBlNy1hMWQzLWI4ODIzOTM0OWVkYS9jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFrZXhwbGFuYXRpb254PWhhc2hlZCB1cmkgbWF0Y2hlZDogc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGGjZGNvZGV4GWFzc2VydGlvbi5oYXNoZWRVUkkubWF0Y2hjdXJseF5zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjAwOTFmZTBiLWZkMTAtNDBlNy1hMWQzLWI4ODIzOTM0OWVkYS9jMnBhLmFzc2VydGlvbnMvYzJwYS5hY3Rpb25zLnYya2V4cGxhbmF0aW9ueD5oYXNoZWQgdXJpIG1hdGNoZWQ6IHNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MqNkY29kZXgYYXNzZXJ0aW9uLmRhdGFIYXNoLm1hdGNoY3VybHhdc2VsZiNqdW1iZj0vYzJwYS91cm46YzJwYTowMDkxZmUwYi1mZDEwLTQwZTctYTFkMy1iODgyMzkzNDllZGEvYzJwYS5hc3NlcnRpb25zL2MycGEuaGFzaC5kYXRha2V4cGxhbmF0aW9ub2RhdGEgaGFzaCB2YWxpZG1pbmZvcm1hdGlvbmFsgGdmYWlsdXJlgaNkY29kZXgbc2lnbmluZ0NyZWRlbnRpYWwudW50cnVzdGVkY3VybHhNc2VsZiNqdW1iZj0vYzJwYS91cm46YzJwYTowMDkxZmUwYi1mZDEwLTQwZTctYTFkMy1iODgyMzkzNDllZGEvYzJwYS5zaWduYXR1cmVrZXhwbGFuYXRpb254HXNpZ25pbmcgY2VydGlmaWNhdGUgdW50cnVzdGVkamluc3RhbmNlSUR4LHhtcDppaWQ6ODQxZjc3NGMtZmU4MS00N2MyLWFiMmEtYzA1NjU1NGY0YmQ5bmFjdGl2ZU1hbmlmZXN0o2N1cmx4PnNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6MDA5MWZlMGItZmQxMC00MGU3LWExZDMtYjg4MjM5MzQ5ZWRhY2FsZ2ZzaGEyNTZkaGFzaFggCnUmqcVCblJxTSql1LZg/tsbXrTIiWUPpPHmoS0BCUxuY2xhaW1TaWduYXR1cmWjY3VybHhNc2VsZiNqdW1iZj0vYzJwYS91cm46YzJwYTowMDkxZmUwYi1mZDEwLTQwZTctYTFkMy1iODgyMzkzNDllZGEvYzJwYS5zaWduYXR1cmVjYWxnZnNoYTI1NmRoYXNoWCBOEGKPM1kAipm28ftf2ODMBnmJliipldMFCpjYItOu0Wl0aHVtYm5haWyiY3VybHg0c2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS50aHVtYm5haWwuaW5ncmVkaWVudGRoYXNoWCA+JOjtASsLj5cVnSihrM8OCaua9B2ywkzswk0z+VGWDQAAAONqdW1iAAAAQWp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuYWN0aW9ucy52MgAAAAAYYzJzaOQMUzqSzq/nRtP0LEWJC2QAAACaY2JvcqFnYWN0aW9uc4GiZmFjdGlvbmtjMnBhLm9wZW5lZGpwYXJhbWV0ZXJzoWtpbmdyZWRpZW50c4GiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIJhJNefZQgs53Fcet3VUXY6Rs6ZSzPoU0Sp4SDuTUXWxAAAAxWp1bWIAAABAanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5oYXNoLmRhdGEAAAAAGGMyc2jJdWMDWwwE2BTzdomUBt7PAAAAfWNib3KlamV4Y2x1c2lvbnOBomVzdGFydBghZmxlbmd0aBmzMmRuYW1lbmp1bWJmIG1hbmlmZXN0Y2FsZ2ZzaGEyNTZkaGFzaFggDuPhrM7lQuLatB1+t4tblspzWOT7/OOeN7Mbxh+BmPxjcGFkSgAAAAAAAAAAAAAAAALUanVtYgAAACdqdW1kYzJjbAARABCAAACqADibcQNjMnBhLmNsYWltLnYyAAAAAqVjYm9yqGppbnN0YW5jZUlEeCx4bXA6aWlkOmY0ZTQ4MTM1LTMwYjAtNDY0OC1iYTgxLTAxMWQ3MGEyZTYwNXRjbGFpbV9nZW5lcmF0b3JfaW5mb6JkbmFtZWdDaGF0R1BUd29yZy5jb250ZW50YXV0aC5jMnBhX3JzZjAuNzguNWlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6MTNmODlkMzMtYWYzYi00Zjc1LTlmZDUtNTBlNzlkODliZTkzL2MycGEuc2lnbmF0dXJl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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2WEB6HLWsejQqBBt2W2vxvoFzABPTWhpZOjkk1jTtwDTezzO/6iWu8qK4QaVClUpflvav6WC3os95PasC8tYFSH5eRCpBbQAB8zVJREFUeAHtwAOgJFmWxvH/d+6NyMyncktjrm3btm3btm3btm1pjJ6WSq+eMjMi7vl2t2p6poc7a9WvZiZXXXXVVVddddVVV1111VVXXXXVVVf9HyGJ50Tlqquuuuqqq6666qqrrrrqqquuuuqq/yME2AASmMuoXHXVVVddddVVV1111VVXXXXVVVdd9X+PucI4uOqqq6666qqrrrrqqquuuuqqq6666v8c8ywEV1111VVXXXXVVVddddVVV1111VVX/V8lhIKrrrrqqquuuuqqq6666qqrrrrqqqv+jzAPYMAAwVVXXXXVVVddddVVV1111VVXXXXVVf+XEVx11VVXXXXVVVddddVVV1111VVXXfV/h3luBFddddVVV1111VVXXXXVVVddddVVV/2fYu5nAFeuuuqqq6666qqrrrrqqquuuuqqq676v8YACGyoXHXVVVddddVVV1111VVXXXXVVVdd9X+TASC46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MoKrrrrqqquuuuqqq6666qqrrrrqqqv+LyO46qqrrrrqqquuuuqqq6666qqrrrrq/zKCq6666qqrrrrqqquuuuqqq6666qqr/i8juOqqq6666qqrrrrqqquuuuqqq6666v8ygquuuuqqq6666qqrrrrqqquuuuqqq/4vI7jqqquuuuqqq6666qqrrrrqqquuuur/MipXXXXVVVf9P5M2tiRjIQAMgMAABjDPJkCAeD7M8yf+Bea5iWcz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HZLtH/7BH/m4T/z4e+6+SxLCaa666qqrrrrq/w1JEWotgVd+tVf7zm//tkc/6tFpCyRx1VVXXXXVfyKCq6666qqr/tMYMjOk8xfOveVbv+27v8e73XP3XRECO81VV1111VVX/X9iO1tGKEJ//Ad/8LIv9dJf/mVfiS2pZdrmqquuuuqq/ywoM7nqqquuuuo/gHg2A7YlAT/zCz/3Ae/1fucunJME2Oaqq6666qqr/l8SGCQkOTF+9Vd5le/9ge978IMfmplIIXHVVVddddV/PIKrrrrqqqv+A4hnM2Bb0jCsP+JDPvzt3/Ltzl04H6XYts1VV1111VVX/X9lAGwyraCr9Q/+6I9f7mVf8bu/47slSdjmqquuuuqq/3goM7nqqquuuurfSwCYy2xLuvPO29/pHd/9D//o90optjOTq6666qqrrrrqAQRRSrZmeI/3eZ9v+cavn88WtiVx1VVXXXXVfySUmVx11VVXXfXvJTBgI2Hnb/3m77z7e7z7PffcHRG2bXPVVVddddVVVz0/JSJt26/8qq/6Iz/0QzfffBMGhLjqqquuuuo/CMFVV1111VX/AQwYwM78lm/69jd+kze+9957SimZaZurrrrqqquuuuoFaJmApD/+wz985Vd51Z/72Z83pNPmqquuuuqq/yAEV1111VVX/YewBXZ+7Cd8yod9+IdkNkmtNa666qqrrrrqqn+Jbdsh3X3XnW/zNm/9xV/0ZZLstM1VV1111VX/AVBmctVVV1111X+E/YNLb/lmb/U7v/e7EQHONFddddVVV1111b9GhECZ+QHv977f9M3fqhLYkrjqqquuuurfBWUmV1111VVX/TvYlnTrM57+pm/8pk944hNLKZnN5qqrrrrqqquu+jeIkIiW+UZv8IY/9dM/MV9spDMUXHXVVVdd9W9HcNVVV1111b+PpD/80z95pVd8pSc88YkRykybq6666qqrrrrq3ybT6YzQr/zar77qq7z6bc94RihaJlddddVVV/3bEVx11VVXXfVv5TTwQz/4o6/7Gq999uy5iOIEm6uuuuqqq6666t/BttOlxN/87d+85uu8zt/+zd+VCNtcddVVV131b4Qyk6uuuuqqq/71bAPf8R3f+0Ef+D5IErZtrrrqqquuuuqq/yi11mmaTpw8/Yu/8Auv9Eovj0HiqquuuuqqfzWUmVx11VVXXfWv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gzEG0sZIBv74b+/9lV//2zd7u1eZLu2dfNTJD3ubx37Od/wFCMxVV/1/Iu4nrrrqqqv+jyK46qqrrvo/zba56qr/L4SAt3mNB1//oGvbMMyOnfixX3jq3z/xvEp319nlnz/+0l/9/YUL51c5pSBCgkyb/yJS2Pnoh538ue94q17DdLg/P3PDN377H37qF//W1CzJNlf9O9h2pjOdtrGd6WzOdNo2NlfYSJqav/q7/3JargVu4we+w0tszCtXXXXVVVddddX/QQRXXXXVVf/3mauu+v/BdhS945u/GG2qtV9dmn74px7nxE6JCEXI9jhOaWfa5r+QwDs79ee/+c03T9dxddTfcMsP/MBffMqX/ME4GWSbq/4LGUv6/b+659d/5fH15ClPef3L3PQer3MLWCGuuuqqq6666qr/Uwiuuuqqq/7PM1dd9f/Hox508qVe/JZpb6/W7b/527N/9eR9SW4t05nONP9dJMnf+Tmv9aBHnlqfvzC76eYf/aG//qBP/ZX1lCAwV/0XM8DY+Nrv/4tcN2dH2fiAd3vZecXmqquuuuqqq676v4Xgqquuuur/NGNA4qqr/s+TAN7qNR+0faKfWss6+8Xfv209JpLNfy8hkZ/wni/+Vm//qNW9t/anT/3Orz/h/T/+54cpJYG56r+HJf3mnz7jr//kieX4SWd5qVd5sTd/5euwueqqq6666qqr/k8huOqqq676P00IAHHVVf/X2UTEm73uI3KYSu33z61++feeDuDkv5vxm77qTZ/3Wa+2uueesrl1x9MvvutH/PzRukmyzVX/TWwUmkb/yC8+HvVtWcrJG97hTV4CkIKrrvp/QFx11VVX/T9BcNVVV131f5646qr/J26+7vjLvPjN5FAXm497yvl/eOouwua/3elj5fu+8jVYHaChbGy/78f/yn1nDyOKba76byUAfvAXnzjce29ZbNNtveprv9R8Vu3kqquuuuqqq676v4Pgqquuuur/NiHEVVf9//A6L3Pj4syxHAdK/5t/dOs4Nkn8dxN88Ue8xM71W+vdc7Njx37oh/72d/70HikyG1f9d7Mdirvv2fv5X/17bV/jYbjuxq1Xfskzfd8tNuaSeCZx1VVXXXXVVVf9L0blqquuuur/NElcddX/G2/06jeCI8ryYPr1P3oGgPlv9wqP3nm3d3iJdv58N5svz68/65v+Nm2FMFf9t7MtyeZTvvL3Xv+1XnLr1Ga7+Izv+KQX39vN1LS3e/DUu1bf92t3/97fXUijkNNcddX/JQJz1VVXXfX/AJWrrrrqqv/TQgLAXHXV/3WzWfeKL3lDHu6r9E9/8oW/fcoFwDb/rWrR53/oy9Z5WZ8/nN9045d80V8+4/Y9Sc7kqv8RZFviQcd9cNc/9O2Yj87fcNPGjde75SBmr1L9zm9xzU//6rmP+oYnnL80KuQ0V131f4zEVVddddX/cQRXXXXVVf+nSYG46qr/24SARz301M0PO53rQ/Wzv/n7ew6PRin47/bWr3Xjq73eI9rehdnxU7c94fArv+8fuOp/FAn8rq9/yw9/+eufOj2nDTHfUl1k19H3Wcs4qUV9u7e+8a+/+7Ve7mFzpyVx1VX/ZxhAIMRVV1111f9lBFddddVV/2cJkCQE4qqr/g8TwGu/zPVlcyFPEH/0l7cZwPy3Or3dfdlHv0rkFK2Lres/+LP/8NLBiGSbq/4HEDjzxR6y9eUf+zKzudNNtUa/o8Wp2Lyubpyui+N1Y7vMFsOaa27uv+sLXmMxD4O46qqrrrrqqqv+dyG46qqrrvq/SgARkgSIq676v0zijV75emmM2uVq/RdPOMf/AB/6Ng+/5eVuLONR3vgS3/3df/Orf3g7EjZX/Q8gAcwqn/2+D9s4qVYn9YuY7WjjOu08TMceFccfHds3aX689JtlY2c56pGP2fmIt3qYbEVw1VX/pwhx1VVXXfV/GsFVV1111f9RAkAS4jJx1VX/R9ne3Ohe8sVu9NFSs8Wdd+393a0XAdv899la1A9+z1ec9kbNT97xxNs/6st+B8Dmqv8ZQgE86kE7r/pKZ7KNUbsoPf0xbdyirRdj+2W9/crsvEJsPVyzU1EW6jYSv/vbP2IxEyCuuur/Domrrrrqqv/rCK666qqr/o+TJK666v8uRQCPeuiZ62455ulIm/O/feJd66Epgv9W7/kmj7jm4dfk6iiO7XzBN/zRwf4YUbjqfwxJEm/8iie2thVqpchRHZt0p1yvcbnO3c2eP5LFwzQ7QV0oFsOYD3v41lu/8jWZGSGuuuqqq6666qr/NQiuuuqqq/5Pk3gmcdVV/ydJAl7xMdfERpfjgOof/OUdNtj89+mKPuidXzzHoSy273zy+R/+taeC7MZV/zMIhGro1V9mHlpK6ZxwkzJzcqY9OZuZZTmWsZEEeGhN1Y98yDEAxFVXXXXVVVdd9b8GwVVXXXXVVVdd9b+cxKu/7DVSUwkPw18+4SyA+G8hCXiFx5x59EvfksMydna+7vv+YnmwjhI2V/1PIRSSOHFSMOEUzTnQDpguMJ1Tu0jbZbrEtCQnnDiryGm6uLfmqqv+b0nbNlddddVV/5dRueqqq676P80GA2Cuuur/JNsReuyjTufevmpnTffsDYDT/LeQZL/96z40ahkH3XPbhe/6iScAzuSq/zmM0JR++q1HL/3Y7TatSzfRlm3YjZjJSdmWqtvo4RzjJU8jbSo5rA/9N0/ZA4y56qr//QyAM21z1VVXXfV/GZWrrrrqqv/jbMxVV/0fJYHZ2ekfdNN2a0Pd2PzzP7z11lsP+G9kb2yU132tB7fVpbLY+Omf+vtzu0tFcTau+h/DkE6bP/qbg7d6k2toU05DaKmxtlSMR6kFBB4Z9z3s5bhyW6tNZ8/lPzzjsESkzVVX/V+RmU4DGMRVV1111f9FVK666qqr/k+zueqq/9tsb89rTMO4XtXNzT/8o6ccHo2SbPNfT7L92Iccf/iDTy0vXazH6s/9xpMBbK76H2Zsk8zP/sHux93NyZMeV0cx1dKOIF2XVjWC5mnwtHau27BadPE3f3vx/N4QUZzJVVf9X9FaSydgEFddddVV/ycRXHXVVVf9X2UAY8xVV/1fFSHhl37U6cWxWcw7bQQ1ERL/LSQieONXuKHfqLJvv/3Cn//9WcCYq/6nMSjuupDf+qN39Js7bmNOh21YtWGVy32vdxl2vbrk4ZDxyONS09HeVL/rJ56UJm2uuur/kMzMNFddddVV/5dRueqqq676P8ogwJgrzFVX/Z8jCfnlX/KasrlxeN9B3/sJT72AMea/RbpWvdpLnh72Dqz6l39/14XzRwA2V/3PY6fEV//EPQ+9ZfM93ukh673DTOyRUpkC2caZ2aYcDnaOL77n+5/4q3+7Jykzueqq/0NsO5Orrrrqqv/LqFx11VVX/d9nrrrq/xZJEogItcZmXyjdfOfa5d7w+397UUIRmWnzX0rYHDu+eImXuG7yiq7/w7+8y7YUdnLV/0xmTD72a5964dzyA97xIf3m1CZlNkBR2jTRsmhabHbf8gNP+cRvfXoaxFVX/R+TdtoAGMRVV1111f9BVK666qqr/k+zjbnqqv8zJAG2bYBUltC1J+dtuech7rvz3gv7R7VqnNIGQACY/wJCxi/5kJOnrtk+f8/ds52Tv/+XdwPGXPU/lQFrOfgzv+euP/m7i+/zDg9/+C3HTp+s/WzmaRJttRyf/oxL3/Rjz/ih37+UXGZz1VX/x9i2ueqqq676v4zKVVddddX/D+aqq/53k0DhzJBuOLPxUo8+9uK3bL7UI3dOzPuXePFy6alPtKfFNPzil77a0eFw6z37v/qH9/7qX1+8+0LjMgmb/wKv9fLXdMdjdp5zFw6edvsBIGyu+p/MRs38zF8sf/3vH7fZ89Uf9qi3fYeX9jj+/T/c96Ff8Fd/c+vBkFx11f9hBnHVVVdd9X8blauuuuqq/9OMueqq/wMk20X5mi954r3f8pZXf8zGNdcvijoPU0OrcchpApdabjlDnPJLPPr4W77utefvOvyFP7j3x37v4u/+w6U0CgFO85/DAJw5HqsL+9H3f/MX9x4eTIDNVf/j2QCsRg7X7W+fdvj2iw3mcce5c3/+tAOFIsg0V131f5QQEgDiqquuuur/JipXXXXVVf9HSQAYc9VV//vZD7th+2Pe7sHv/MbH+3ldr9v+4aAcwiARgHAYxmzNJQ9slvMT/bu97S3v9pbX//5fXPy6n7j3V//6IkiSbf4z2BIv9pjThwerxebs3P5oUIQzuep/jQTqZqXvnb7xxq3FIpYrY3PVVf8XCQwRComrrrrqqv/LqFx11VVX/d9nrrrqf7MQ7/LqN3z2B9x83XWbh8vluN8osqQCCcIWCgSAKCYCIyuXg+V4zVe+7jVf6dof++X7Pv7bnnRxrynCmfwnCOmG04v9iweV8qQn3wfY5qr/PTINHOw3MrKttncWHT6yueqq/6skQSlFEVx11VVX/V9GcNVVV131f5656qr/vXYW5Uvf99Hf9BmPOn6yHBwdmJSQXYyQo1hBCaJQKqVSKrUrUWpEJWqUUut6aKtxesc3u+Y3v+LlH3vLnEyF+E+wvdWd2Ok3tmddX24/NwAhcdX/IhJw37pYafnMmY0bbtgBJK666v+wUmophauuuuqq/8sIrrrqqquuuuqq/6nObHff94kv9SHvctPR/mGbUlGhIFmFKKgShdKp9Cq9olN0ik5RrQ5Vq0IRoahRuqPD4eEPqr/8FS/7io/ZxlYE/9FCXq9iav1q1T316ZcA21z1v4dt4I6nnzu898L6cLV9fH5yp+eqq/6vK6VECJC46qqrrvo/iuCqq6666v80Y6666n+n01v1hz/5Ma//KjuHu+ejK1IYIVEKUShFtar2qj21U+2j61U71U61Rq0qVbVSChFIoOhmyyF3jvMzX/xyL/fITWci8R+q1ujn8/nGTr+xKF0BJHHV/x4C4IabTm5dc3y+uVF3NjZmBQBx1VX/d5USkrjqqquu+r+M4Kqrrrrq/yrzTMI2V131v8qs8E0f/uhXfvkTB/t76ua2wBIqQZToOtUZ3Tz6hbpFdBvRb6hbRLeIbh51rjpT7VFVVFSIYoWRun69zvn29KOf/VIPvaHHlsS/n4iQxNa8ryUysTXrO8DmKkAgISEh/qe75+zecHA4jat2uBozueqq/+skCXHVVVdd9X8ZwVVXXXXV/2lCXHXV/y5SiI940xve9HVPHx4eqO9sJAhUQrWLro9uUfqN0m9Gv1FmG2W2Ef1GmW2W+WaZbUa/Gf1GdIvSL1Rnqh1RFEURIqLrh9V4zY3xHZ/4Elubhf8QJtM2pzeFNOtyODrY1CgA8/+bpIhQyMbGxiAhAUj8j2IAbr/7aHUwlFpjVhbzylVX/d8nxFVXXXXV/2lUrrrqqqv+jzKIK8RVV/0vYj/yhv4j3vVBR4eHjhBIWKhU1Z7Sq5sTfdSe6BQFhRSWxGWZcuLmnJRT5kROTCMeZdsppOgP99av/MrHPubtHvT53/c0gXmRCJAAsM0VtdOrvPj1b/J6D73l5OIhp7PTyuHlcPHd3uRB5y495a+ffiTJNv8PCYxtiUfdsn1qu2xUdhZxNPhPnrx3/tIE2EgC2/zPsRzSLWlB62e1cNVV//eZq6666qr/46hcddVVV/0fJQAkiauu+l9DUAof/hY3bG0xTQ0qQhKlqHTUWXRzdTNiTu2lEqWaQAoJZAMpp7OREzmpjeSIRMNYGGOLUvcv7X3YO9/083989q+etM8LIAkQpA0YsLmsn9UQ152YfePnvM7rvsbD0ZphFUyesuHNnfnbvfnDnnLr+b+59SikxDb/75jax+u8+Ml3fv1r3vBVT+xsu68iYzxc/f2TL/z+3xz8/t8v/+q24Y77VkTg5H+MNmWbLKESs75y1VX/19nGXHXVVVf9n0blqquuuur/KgFI4qqr/vcwPOT07I1e+dQ4rpFCqShGUSt1Fv3cZa46p/SKTtEpihAKJBAGbDeiKatzUhS3EALAIE9GTa5tHDa38kPe6qYP/vLHp3kWSQZswDZgUOj0ycUNJzde4cWufbkXu+7VX/Wh11+3uX/haFY5dc1sONibcnIbZ12HC+Ep6Wt7yYfvzLq7xwbm/6FXeOjOJ73Xg17rFU92tU2trdasB0FTqY9+sWte4iVOf8BqOntu+MLvuu17f/eSJWz+Z5imHCec6STEVVf9X2ZsZ6YxV1111VX/l1G56qqrrvo/ykZCkiRJ2Oaqq/5HE4R421c5dep0DMMaVSKQVAq1Rt+r66POVGdEr9IrOhNSoDCAAsB2s5Oc5OoWliRZSAlpS4mMSr9cD6/78sduOd3dem4S2AZsA7VoZ6t7xEOPPfy6rTd9/Uc+6uHXPOqh182PbZbjxzwMznG8eHFra97Wy7a+oKr5bDEthY0zSnGbhly/5Etc88jrn/73dwyKcEv+3+iC93jt6z/zg2+eb/TT+jDXRC2SJERYMU1ttFrGznUbX/wJW6eP3/pVP3d3M/9DjM1pR4RECXHVVf/XZRpz1VVXXfV/GpWrrrrqqv/TJCGuuup/BcNWrzd69VOtNTsiAgcqiqrSUTqVLmpHqZQ+okedopqQJAQyxhYpT6mCJyAkY0iYyKZotiWHIyeuOT577IM2bz27C3Qlrjuz+eKPve6lH37y9V/nYS/14jcev+k0TYrMw8G5Ptq7EHvnUYTW46rNFvM634z51qU7zt711Nuvu+6a46cW48HesFq5ZdfV607vbC7kTCn4f0KS/R6vcc0XftTDcmptHErtoxSFQqEoKFAAiGgt29QYP+2DHqJavvwn7zDC5r/b1NwmY0NIwVVX/V9np22uuuqqq/4vo3LVVVdd9X+aJCEABOaqq/6nkrC55br+xR6xne1AUSURUki1RO1Uu6i9olPpKb1ipuiIzgQKCEm27QaJp8iJLJbchBOMJ7dJMdkNA1Iqqt/01U7k/Nhbvv6Lv9or3PSwh56aXzPDMOa0Gtfn7lmv1rPZhlOzrY3Na65TTO1wPY26dN/u8uz4J39316/8zjP+8K/uOnfh4OUfdfy7v/gNbnrEMZ+/GNEdXpo+/av/9M+ftJTCtoTN/3WS/YoPm3/mhz2ETAqlzkopRFFXo3REkQrIgLOUVE4NrXP5ye9zyxNvP/zZP73I/wAJU0spUBDBVVf9X2fbmKuuuuqq/8uoXHXVVVf9nyeuuup/Pkm2H3pNN59xeECpASCpFKIQVVEVlagqHdFReqJHvVSIasKAU6RzwqNUUBhjq6adRFWpzqIMIwFR1uP6rd/koe/9gS8zO7GVw3J9eHh05/mo3Wx7u2703Xx7Ngy51sX7Dp789Lv//h/uvOvc8k/+5u67zl269Rl7F3aXw9C432//1cU3+cCf/pB3fMxDb5rN+u6zv/av/+DxhwKUNv9PbM31pR/0sO3NfhjG0s2JUNep9qWfWX2UahVM4HS6TeRYiWHVoh++8IMe8btP/IvdS43/bpm0MSVBCHHVVf+HCYxtzFVXXXXV/2lUrrrqqqv+T5O46qr/LSJ4hUdvGhOFkEoQUhSVolJUqqKoVEUlOqIjemKmqFYHRQrc8IRGHGQYRELaU5Rqd24jURWjVFASJdPHdmazub06iL4ujm3F4tjq4uGTn3DPX/3V2cOxPeHJ9/35P9z7l39/z9F6yuS5SZKwDZIe/4zhI7/sbwp0hXUjQmCb/w8khD/qra59qZc4Pa1Wtc5UO9cu+kX0G1FnxFylItnGLdxok9saqQ+m5fkHP6R+4ptf96k/cCf//dwyUUGSzVVX/V9nbK666qqr/m+jctVVV131f5656qr/+WzPZrzyS5+REAEgqRQiIqpKJQpRFdUqiqrorE7RO3piJs1M4FG5lsIJRpHOSaqOihuqRCWKVVCggptFjke3PvW2c4fdpaPxKY8//+ePu+8P/+buZ9x+aT1M3E9SKZ3CgDMRtjG2bQOA7YgAmRySWtVapvn/QGDzYrdsfuhb3zROq4zSdZ1rjdlG6bfcbdJtRF0QFQgy20iOigEVmSDLbHM9Hb7t6137+T9999Fh8t9M2RJVbDu56qr/wwyAueqqq676v47KVVddddX/aTbmqqv+d6hF156eI6JEREBIoShESAEhBYRUFAUVlU6lQ73KhsuWqM4lWWgC4ySbophQhhWKkCIVKKwAAcY19AVf+bvf+yv3Rmhq5rKIKKUinAnYbm20eeEyE5CEbbsGU2IwYP4vk2S/++ue3D7ZLddjdAtKpc6im5fZhuu2ZlsqC5VewjlFW7utGYsBN6vB2KajG6/v3/Aljv30H19Ewua/iUTUkiPRM0yNq676v8wAkrjqqquu+r+N4Kqrrrrq/zybq676H8+QBoMDQEJCAhmBJAGWkGyhkAoqio6YU7Yp2yqbaGZ1ig5VCAgQBAhkIQkFEgSIdInY2l6kUe0iFBGS7Mw2tWnKzMy0bfMism2YGgr6KhvM/2EC212nV3jJnSYTXalVpZZuFt3cZa5+Q90m3bHoT6g7Ed2x6DZVFqozoovSq3RSR8yyi1d7qWOAEP8dBMDGvN507Um7qWASMFdd9X+ZQBKAueqqq676P4rKVVddddX/abbNFeaqq/4HC6mrRAiMQEgAkiUjIyMLAInLDCBD4gmwGyACAgWSASSBMADGCAlCToGC6dROD7TWMg3m300AZDKfRXNOzTb/V0nYXHNy/uCbN6SM6B1FtVftXPro5lHnqhuqW1E3iKK2zilAuLmO9hApy6p1aPnSj5ptzXQ4mP8WArO92fWzmqtp4nB3f+Kqq/6vk4QEIK666qqr/o+ictVVV131f5ptMFdd9T+e7UyNwygXEOYyARjbpMF2irRTbs6maOQEKwgIciAHaNjczza2bbCwbWyQjSRMZluuB8Bp/oMYJKaGTQ2Nk/m/TOAHX7c4dXw+TcuIqogoVaWqVEVFhehVN9QfQ73KUpqco2OFKgojKVC0LNec2NyaxcG6Ccx/j4153xqIi/dcevLTLwDYXHXV/12SJK666qqr/k+jctVVV131f5ptDGCuuup/NEmGYUICWZIEGDAWhrRTJE7coJkJj6SQ3BKKaPbkHPCEJ2fDCWkbGwwJBgwICyTBxb2J/yTS1mZdj+s0/2cJzDUnZ/OtengJBYpAUhSpSEKBAhU0U9lEovVShSIJCWEhpFDtSqpA47/Ptdcdm53cyHGKpYfGVVf9nyeJq6666qr/4wiuuuqqq/5Ps81VV/3voNXKd959GCUCgQCwndjOxOlsdnNO9ug2yIPb2rl2W9GOyKOcls6V28pt5TY4JzuxnWnb2ZzGthObK6RhFU98xgGA+Y9kJB0tp63N/thWx/9hBlivR+cESCAAjDCZ8iQP5Io8cjtyW5Gj3SCNIUXKtqmq66UPR0VURfBfSEIiQsDORpcT66P1/uF4eNQAEFdd9X+XJK666qqr/o8juOqqq676P82Yq67630BiajzhrnW30WELYQTY9oSbs+EkJ+eIR3twW5Mrckk7clu6HZFL2pJcO1eZa3t0Ts4GiZsz7YYbTmwbQ19Yr8en3bNEAvMfx1yh/cPhVV/i5hr833b3xXG5GqMWkzilhGZPMDoHcuV24PFiDvflcD7HI7e1c8KNTGdCBllLHB0Ny+U6c8pMACHxn0ciQhECbAxAX6WStWo9jM0ogquu+j/NgLnqqquu+j+N4Kqrrrrq/zZz1VX/K2Qa8ydP2JtaAyRhcOJGpnPKNrlN2Ubn6Gmgrd3WtLWnFW1JO/J05LZ0W7otaWtPa9rgNmSbyMltIidny2w4bUM6p676jrOHFw5GhWzzHypt4PzF9XXXzD7tg19XAOL/HNvAk2/bv/2edddXO006G57cRrfBbd2Goxz223o3V+dyfSHXezkcMa1pk3PEE5lOr1fra27Ql33Yo9/xNW+++dqNUgNjA1IE/6EkSQCZLlXXntl48A2bD3/wzo037Tz6+m48vFh7nv6Mu/cPB+wIcdVV/xcZAGxjrrrqqqv+L6Ny1VVXXfV/mjFXXfW/x18+8eC+c8Oxjc4tJYHtJCe1iZicIxRFGAEYnKg6KyoQgJ242RM5pSfn6BzdRnJSTuTkTGxIYWnqZvHbf3FhuXRENP6z/P3Tz33Wx77l4x53x4/99pOQsPm/JRSHR/mkpx09+uHHh+UKJzm5jSqDW4UCYDMNKHDLNpCD28pt7TYqJ3KSG/YtD77xo1/+VC7L3n3n//Tx53/lV+74vb+79NdP32uZgCTb/EewPZ+VV3z4sVd5iWMv+5iNF3vw5uYi+plabmzM2rR7Ljb6B50a3+QVTv/+E/b29gZAkm2uuur/EIEBsLnqqquu+j+NylVXXXXV/2lCXHXV/wa2ke46O/3VP+y+0avfeHTpKPqOBhiaY0KDFUI5WSVx4kaOREXVBAQGObPZKTe3yTmSU04r5eA20hqZbknaTnnKNvuR37zodLrxnyBt4K+feOFP/vJvvuKz3voP/u7r7zp/BALzf4UBbPNrf3zhrd7oQeFVa5M0qQ05lSCcCjtbU3QgnJkDObmt3QZPg6aRNqplUYnFDv2Oh/Xm8TOv+bq3vPbrvdJw6dITHn/2B3/x6d/1S0/eu7QGIsJgG5t/NYFnfbz1K5z++Pd+xEOvL7PNMo45jtlsIruYyEiPq6P1g2+e/cgXvsxtdx3+2K+f/eqfftqlvRYRtm1z1VX/h9i2zVVXXXXV/2UEV1111VX/P4irrvqfTmgyP/xbFyhFWHZgkXIqR7WBaXBbe1p7WrutPC3dlp6OPB16OmQ6dDv0eMh0xHSU09Jt5bbKaUUbaGtPg1s6E6ftbOPGYv53Txr/4ilHigDxn0NovWo/86t/d/J6fefnvEVfQpIk/i+xBT/z++fveMaeZzO3phyZVowrpiXTYY4HHvZy2PVw0cMu456HPcYDTYdqy8yVcyhuZv5t3/O4P/nDe711ppy5pabXF8/XWXnZ13rkV3zl2z7+5977Kz/xVR/9kJOAM7GRFOJfxw+/buMnvuiVv+uLXvYRD60j08H+arVcZ5uEg7DTgcFoPYxjW918Y/cpH/Hwv/zOV3+bVz7lTCRJXHXV/yG2bQOYq6666qr/oyif9VmfxVVXXXXV/0U2ks6eO/vN3/LNtrG56qr/6SzxtLuWb/qKJ667ph/HQVGklLABAxgBYJs0TmcjG9mcTTm5jeTkHN1GcvQ00ka3taeBNjonZ6Ol3WjD5rH5F3zHrX/6uD1JtvnPIuAptx+++kudeO3Xf9B1XfdLf/QMExL/lwgdrP3gE8MrvMrDpsMDlRDNGBvsbLgpR08Dbe22pg1Ma49rtxXtiGns5hs//9vnPvBL/ub7f+aJf/5HT13AQx928+a1py2vL13y0LZOb7/K6z7q/d7msW/8CteemPd3XpouXTrCAJL4lwl4s1e5+Se+7GUe+5D5wf7RODUcikKEFKGIKFJRFCmkUIRKyWRaDlubvOOb3ni89r/zN+dbIomrrvrfTyHMiRMnPuiDP3jW94irrrrqqv+jUGZy1VVXXfV/UaYj9PjHP/6lXvqlszVnmquu+p9Oku23epVjP/jFL7vaP4wwURThKESodI5OZeboVCqqimKFVEAgWwDYTmfazTkpp5xG50gOZKo1nG0aN+dx671+pQ/4k+XRCNjmP40k26/0Utf8+ve/4/x4+cov/uNP/oY/JcLZ+L/lxAa/9dWv+NBHHxuP9ko/I4pKT3SUzqpQAGy7kUmbnJPbGLmsXXfbHbzRx/3RnfetJWUm8JAbdt7zzV7sPd7jpR7y4jeirl262Jb7iq7bWSi8vvvCL/7KM37iN57x07/39KPlwL9E8D5v9tCv/bSHr3eHNq2JmlymQCiKFIqQJIEkARbGhsxppE2bJ7d+/3cP3/LT/+hoSMxVV/1vFyHbD33IQ//yr/56e3sLg7jqqquu+r+I8lmf9VlcddVVV/1fZCPp/Plz3/wt3+w05qqr/ldQ6Ml3rh50orz8y1+7PjySwhYYY4xtJ06czsSNTGdzTs7mnJxTttFtIkfnmNPgHJhG5+TWaIkTN7ltHJu/x6f95ZNuO5Jkm/9cknTHPYcLptd8/ce+ysud+cM/uO1pd+0pApv/Q1Yjf/pX977JK53eOV6nYRS205m4kY1stNFtdBuZRrfR0+hh6CtHh3r3L/i7f3jqPhI4Qigu7q1+5y/v+Obv/8s/+M0nau/g5hs2tm4+XWaztr+/vnipLMpjX+GGt327x37kWz7qMQ85ub9sd547alNyhcRzepc3etC3fM5jDu/btxpRTKAgQqVG6aJ0UbuofZQuSqeoRFEUokiSQioucbR39MhH77zsjcd+7HfuMuKqq/6XkwJ84sSJD/rgD57NeoPEVVddddX/RSgzueqqq676v8i2pCc84Qkv9dIvPY0TtjFXXfU/nxA6saFf/apXeNSj+uX+qqhQAgkFIaKgQlRUiYKKFBCWAIxtY2zcsk3ORjaczqZMZE3T8VObn/1NT/3i730qkm3+80my3Rf90Y++3Uu/9iOe8Vf3vsLb/uD5vRUKnPxfIQn7lW+p3/fFL3fdTf3y4ChqVVTU2YFCyMiZztampjZt9Lrj7PihX/rE3/q7Syhwcr8IoXCmbWBjUd7wlW96j7d41Ju8ycPm12znclpfvESqW8zK8UUerm9/wn3f99NP+dnfu+0vH3/W5pkE5rprtv/+R18j1pdaS6ggFI6qUohOUaN0iqIoSAgBNp5wOifcnI1MexxWR8ePbX/2Vz3xi3/8Vins5Kqr/teKCNsPfehD/vIv/3p7ewuDuOqqq676vwhlJlddddVV/xfZlvTEJz7xJV/qpaZxwjbmqqv+N5CE/ZibFz/x5S9/43Wx2ltGqcIUGVkBoQirKIopigIyMghsgzNT2K05Exsbp7HbeOrU1g//wr3v90V/nQnC5r+GFHa+5stc9+s/9U7q9Q9/+Iz3/8zf/fPHnUeBk/8rJMl+iZv67/icl3yxx/arw3GaDBUVKE6cZFrKWW1d8Bt/cvBx3/iUp9y9ksJOnoeEFEjZGpddf83WW77mze/6to991Ve/IWZd218Ny6Np5fmxjTI/MR2ufv3X/+GnfvUZP/+Ht913/ggQfPGHvvRHvNt1BxcvqnQQioI6116li25O9FEqURVFCAzGSU54dBvJkZxoU2bLth7HFePGq37IHzz9rhVgm6uu+t8pImw/7KEP/Yu/+uvtrU0M4qqrrrrq/yKUmVx11VVX/V9kW9KTnvTEl3jJl5rGCduYq676X0IS9iNvnP/I573Mwx4yOzocQkiyDEJCQLECAgUKkG1LTgvbGMgEywbsdJtOnNz8w7/ce4uP/+PlYAmb/zqSFGT7mo9/+Q/9hDfx/t27e8df522/5e+fcQBg83+FALj+WHzs21zz1m9+43XXFFFWy0wTLl1Y5DROf/L3hz/8S2d/7A8vHE0AtnmhJIWElJm2S+hlHnXyXd/kUW/6Bg9+6KNOR9fl6mDYHUu3KJs1+rj01Lt+4Of+4Vt/9hmrw/YL3/zq12zsj6OkQimKXnWubqZurrqg9FF6q0hFEoATN3JQDm4DuXYbmabMMVsb1vvzmX71ty69yxf8na3MxlVX/e8UEbYf/rCH/cVf/fXW5gYGcdVVV131fxHKTK666qqr/i+yLenJT37Si7/ES7ZpctqYq67630MS9kNPl+//jJd77MucWO3uS4UwNpIEVkoAkhEOwJJtIcCWnbJtwH3V1oZ+608uvtvn/93F/UnC5r+YFLbnld/5wbd9uZe9cTnWe542vPQ7fMvhMiGx+b9CYAi47mR9mYfM3vwVT77yK1yn0i6en3Z3/bdP2f/Vv7rwp0/YmwxAhDN50UhIgrCxG7Doymu+3HVv+3oPffM3fdS1txxHart7pFSJY959/F23331w45kpPJkiFUqnOlfdjPmCOlddqMyJTtFJFYENSU7k4FwzrZRrT4Pb6GnINk7TelgfbJXZG370X/7JE3aFbHPVVf8LRYTtRz7iEX/+l3+1ubGwkbjqqquu+r8IZSZXXXXVVf8X2Zb05Cc/+SVe4iWmaXLamKuu+l9FAnNmO77mI1/izV//wePq0rBeRSkIhCywbSQTtpBABivAWLadqHlzu/eUX/m9T/ziH7t9nJBkm/9qAkrUluPDb9n63Z/9kFOLsWwufvoHH/dOn/SzKTmT/0MEgAEIcWIrpvT+kYE0AEKS0/ybSJJCUmbaCZw+PXuLV7vp7d7kUa/44idP3HCMTKb9XF6a9vaODleoQKh2KrPoFvTb9JvRb6ouiLlKr+ilAgLjRk7kirYmV55WbkumlceV25DTOAyHx+b+8Z+/632+4qlNkVPjqqv+F4oI24965CP/4i//arGYc9VVV131fxbKTK666qqr/i+yLenJT37yS7zES0zT5Exz1VX/+4RkO8Q7v851n/0RL3HjmZyOlsPKltOAkG1AqICQjExkplxq0aIvtY+/etLFT/zKx//hE/dsJNnmv4lQRGk5vcMb3vyD3/ve0+7Zurn42q/444//mj+2hcDJ/y0SkgySbJeItJ22zb+bQCFJNpkJhLjpTP/6L3/yLd7wQa/5Kg+el6Pl+XOeUBRUVKq6jZht0O9otk3dVLeIslCZoV7RAyKdEzmSa3LlaUlbeTr0eORp5XGd07qNq571vfesX/3D/uLevYa56qr/jSLC9mMe9eg//8u/nM9nXHXVVVf9n0X5rM/6LK666qqr/o+SdOHChW/65m/KTGyuuup/IYMko799+sH3/NLt5+9ZP+KWk2dO9fPNWtSNrQ1TQwA2KAQloii2N+abi5mb//KpF7/425/8Cd/0pKffu5IkYfPfrpT690+5GAd7r/MmLzUtV6/62g+eL9tv/fmdtsD8n2MjBDidadv8x7GxbVsKhUCXDqe/evLBT/zanT/wM0+8Zac++qE70zBKVSGVjm6mbkP9proNdRvRLVQ3VOfRbUXdUlkoOlSkkCSELBknTtzsdDbAOZzc7v7wcZeedPtaEldd9b+QJODMmdMf9MEfVGvlqquuuur/LCpXXXXVVVddddX/bLYBhfb2xq/5qdu/+ZfvfOVH7bz1a5155cdsPfqh852dXl0v2+pXq7ZeT1YJ1d/56wvf/jO3/eVTLt1xz7IlgIRt/gewMy0pPveb/3o2m3/S577ZcPcdn/BJr9AVf/I3/EVLgfk/xzbmP5WdGKQoIcnojvumu+48KPWUM6kmQhFEJTqid/RRZsSMmEXdoGypbICcg7RyC5PQRO9sxEispRpRrAKtUcqsPvqm7udtFGCuuup/J0kgrrrqqqv+L6Ny1VVXXfV/nQ1grrrqfzenkSTWy/ydv979nb/e7asectPWsc3S9XVSzTa92Sud+Oj3fOnMtnnyxBN/6d6f/r17DBIKMDb/czgzolr6tK/54/1Df94Xv8F4790f9dEvszXrPuIr/2hKc9W/mZ3NCgnN53qJR2yOyxUIkAKFoqhUVBSVKIoSpVP0lLnqDgrakbFo0MHoLCrFWVElCipSSCFJPa/4kifix+4zYK666qqrrrrqqv+pqFx11VVXXXXVVf9b2DYAQmiY/MRb93mApzzt/Du80Yvd/KATzXrHt3jFb/jJJz/19kOQ0/yP48xJEVZ80bf/yeHhwVd+zZss77r7Pd/tMUXtQ77yT1tLrvr3MMYksxgzm1SFABQojCQh2UIBYUVEJRZEjxOtUIBMoDABksIKI0uAFW3Mh9y42Xdarc1VV/3vZXPVVVdd9X8cwVVXXXXVVVdd9b+OsQ1ISIpQKaolLh34l3/nad3m9tTatQ89/lav/VCMzf9UdqYA4mt/6B8+6kN/tj9+YvLqvd7rpb7x416zhkD8SyRFREQopJAkSeIqwApNpjkiQrIwMhgsjCyllGCTkPaEBzyBwWCEBMgICSEAgwHQ1PLYznxjVsBcddX/VjaAueqqq676v4zgqquuuur/PgPiqqv+D7KxnenWnHaaX/yDO3PV3CptevvXffEIwPzPZTvBwDf8+JM+9mN/cePMNSyX7/ier/Wdn/zGNXiBJCTAdmYSDlky2LYhIiRJ/L9lg5lG7+1NSNhgbLBtSNzIJpKclCM5Mh0x7TJdUDuQ13giGzRoUuLExhbGxulMzG13HuwvE8RVV/0vZWzbXHXVVVf9n0blqquuuuqqq676P8G24M+eePFJTzn3Yi/zoGl1+Aqv8qCXe/Fr/+xv70Vg/gczCPwNP/m0Vfz0V37FB20NF9/1g99w4+TWe3zKTyzH5LlI2MDxjXilFzv+Yg+av/JLnd6eTeO63Xf28Ol3DX/6xMO/u3199tKUkgBs8/9QCY0TZy9lX2PMARWyQeJGTnjCjRwVnZhoaxROkQVP5ECu8eAc5cmecMPNbjjJ5mzQahePf9qlcUpFOM1VV/3vZCeYq6666qr/y6hcddVVV/3fJ6666v8Bm5D2DvKnf+XxL/6yj5xWF/vj/qC3e6k/+9tfxfyPZy77jh9/2sHRN33/d300bf02H/B6P3mmf7eP+NELe6NCTiNhsK85Mfvwt7rlLV7z+ENuWvTzmZRtnEoBUqFx8JNuH7/1R572fb99/mjZooRb8v+P08BfPnn/PXwGZ6Yj7NaiTs6JNtEmx0hMboMoHqVMJEi3tXPAa9rgHN1GPLpNblO2MXOyW04jWZ562z4GzFVX/a9lY3PVVVdd9X8awVVXXXXV/2mSuOqq/zcMwPf/6tN27znXb81zWL7dGzzm9Mk5gPjf4kd+8dZ3eNevbZZqfcN3eOOf+K73O3asd5oIbMmv/xKnfuWrXvyj3/W6m67v11PbOzi6tL86WE17y3bpqF06GFfr8RG39F/5aS/2y1/+ci//qO1sSYj/f9KW+O1/ODjYG2oFN5zy5DYqB3LtXDsH5+A2OFfOVbalp6WnQ7el29JtRQ60NTmQg3PMNjgnt8ltkqdpyKfdPXHVVf/7GXPVVVdd9X8ZwVVXXXXVVVdd9X+FbUlPve3g53/1H2K+sdo73Lll8Xav82AAxP8eP/0bT3uNN/7yc/fcrTp/rTd/g5/55nfc2qqi9DU+7E0f9v1f+BI3nN44HMaGiC7qLLpF7TdKt1H7zTrbitnm0HS4v3qpx3a/8vWv9vovd5w0If6fSTsUT7xj+Qd/fm6+0TlTBje3Mac105q2oq1zXJJLj0duhx4Pcjpo44GnI9oyx6XbKqe1p3WO65zWbmObxmwtpxF8592rP/2HA8A2V131v5gxV1111VX/pxFcddVVV/0/YK666v+Xb//pJ+YwRte5De/5Vi9RSvC/i/Snf3ffS7/aF//AN//kdHD+Nd/+bX7kq97i2Fb31R/x8p/7sQ9Dmcqoc6JX7aPOo87VLVQX0W+oLtRtxGwz5lurdTStfuLLXuvVXnyHNOL/G0OaH/itPSIlOU1anpSjpxVtzbRiWnlc5XTk8cjTQY77Hg89HXpc0lY5LZlWTCtPa7d1TkOOk3PKNmzU+M0/vXDfXiqCq67638zmqquuuur/OpSZXHXVVVf9X2Rb0lOf+pTHvtiLT+OIba666v8FSQX/wje9+eu84aOH/Yt9t/nq7/BDf/oPZ/nfRYFT8GIvdt1rvsIjHn7q4OHH9RqvdubocKWCokQU1S5qjzqVIoUUtsFy4sk5BeP66LB2GvYXr/gBv3L72QbC5v8TSTtz/eyXPPJlXuLY+qCVfqESlJ5uoX6TuhF1QfRROlMUYRBOp9xwcxtpg6e1p2WOq7ZeeRyyDW06mJX6Np/8hN/7hwMkbK666n+hiLDzEQ9/xF/+1V9vbCy46qqrrvo/i+Cqq6666v84cdVV/89Imsy3//DfqNQw5Vh85Du+uJAU/C/iRGH4+3+45xu/+/d+4qcf/6qvfPpo/zBlVIguuo3ottVtR3+szI7F7Jj67TLbjn5Lsw31G+o33G3UzePDxMbx6es/8mUiiAj+39H+Kr/ku++UUSizYeSmnGhrj0uPRx4PczzweJDDAcOhx0MPhzkeeTzytMpx1cb1NKzaOHga7ZZtWMzqL/3uhT994qHEVVf9bydx1VVXXfV/HcFVV1111f8HEldd9f9GZgp+4Q/uePyf3R6LrfWFS2/9Ro940LWbtvnfxQmK0pXQW73OgwulOUKdoit1pm5D3Wb02zHbpj8Ws2MxO6Z+K/pN1U11m+o2KRsqi7rYOVyOr/saZ97oFU7aTRH8f2In6Nf+av87fuCe+eYOGTnZLTxmjpPHVQ5HHo9yfZDjgceDNhzkcODxkPGoDUc5HOVwlOOyjUMbRzvblKDz5/xF33vrMBmDzVVX/W8nrrrqqqv+TyO46qqrrvq/TYAF5qqr/h9RxNHob/7Bv6xbx8d1W1y39RFv8yiwJP63yTad3C6v9UrH1uOy1IhSou/UzdTN1M8126TfjtkxzU/E7FjMdtRvqd+i26TOo5tFqaV2Metdxo99x1u6EEYS/5+kPZpP+r7bfvU3zm6dOAYkYDS2GNeMRx4OGA89HHo49Hjo8YjxyOORhyOPR0xLhhVtTFpDciy2Tn7Bdz3j8femSjFXXfV/gIS46qqrrvq/jOCqq6666v8BY6666v+TdALf9QtPvOMf7lhsbk37e+/4Fi+1seiM+d9FgN/4Fc48+MbNNjWpRu0U8+gW6hbUBWUR/bZmx+mPMzuhfkfdlupcdaY6I3qVHvWlzpfrfPmXOv2Kj9m2k/9/JK0Hv/9X/cPv/9HZjdObKnaOdstsOQ05rnNceVzluPS49HCU41EOS09LD0uPa7fJmcIep63jOz/4U0//vt8+p5Bb46qr/m8QV1111VX/pxFcddVVV/3fZgDMVVf9/2IUsVznN33vn5TjZ6bV4Y0vdfKD3+TBGEn87yEAXuUljnedsVVCqlF7lVmUPsqsdBvRb5XZTsxPxvyUZsej24q6iDpT6VU7lS5KVe1c6mKzvM7LngqhCP6fsQ26cNDe/FP+7Du/7+mL7c35Zm+PJm3b6dbcRtpIG90mT6Pb6DY6J7uhjOZ5cOLM8Z/6tds+7luflJaNueqqq6666qqr/lcguOqqq6666qqr/i+yDXzjTz5h99Z762JjurT7sR/w6vMubPO/iCRx6sSsuaVBYYWioGKVKL3KLOqGuuPRn1F3mrpFt3DtHT3REz1RVapUULV08zUzAPP/kkGrwR/x9U94+4/608c9aVf9RhrbOU12I5tzco7OgRxpo9vkccxxqqUdP86Q+QXf8Hfv/6V/txoSsM1VV/0fYGxz1VVXXfV/HMFVV1111f9ptjFXXfX/ka2I/aPp23/gz+o1N64Ox+sefvwT3+0lAST+lxCAuk6mgW0LA2BJSEQQVWWhsq26RZlZBQUKohChKFJIkgL5mjPzEIj/rywprV/+k3t39+bb11yzmM23troTpxfzjb7JY+Yw5jC1cRynccTjzjFOXi/EN/3Yna/2gX/+Bd//9GG0JNtcddX/ATZgG3PVVVdd9X8alauuuuqq/6MMAtvGXHXV/0u2gS//wcd/yPu+YrfRry7e/YHv/orf8rNPuPfCiv8lBMaeBrcZFNLgzFawnPaEJzzgJTm3k1zjEVvCgIWUGCzcMnc2VYKpJf+PyX6fN3/ka77Fa+elp89Pn7rvzt3f+8tzL/bIjYfd3EonpkASUqf1vv7g8Uc/+cv3/MofXXjqHftGksA2V131f4bBtm2uuuqqq/4vo3LVVVdd9X+VQYAxV131/5QtxbkLRz/0o3/+fh/+hqu9iydv3PiM936lD//K31GEM/kfTxJmGqdi44Rmt6A5R3tQDuSStu9Rng7BbktyxM1uIo0hA1spJWpdbV2ndeP/LdtbW93HfuCrKfesydr6jK9//Hf9zBOvP7nxso9YXH/dIqzNDU2T91b+7T87e/t9qymRuMw2V131f09mGnPVVVdd9X8Zlauuuuqq/9Nsrrrq/zcbvuaHH/ee7/Lqc88Oz9/3jm/2kp/9PX967sKK/w1s21y8NFWFW8PpNpEjOXgqKl2OBSQ3VFE40znh0Tk5J5E47cnZnKOcT3jK3mptIfP/13u96aMf8RI3TJfOdvPtx/397o/8xtMU5Z6Lq5//40MDIDAIgIiIsG2bq676v8cA2GkD2EhcddVVV/1fRHDVVVdd9X+abS4TV131/5HtUsrjbz38iZ/5c934kMjVyRv8he/7ssKS+F/i8XessutRyi1yoK1pa9rK4yHTgcc9D5c87Hncy2nP7dBtSVuTo9vgae1pIEflUMRfPGnZTCkh/p9azONj3/dltdrVNK7K8a/57r8+2B+MTSpUSpSIKBERikBqmZm2ueqq/8MybSdXXXXVVf+XEVx11VVX/V9nrrrq/zVnSnz6t/zZ/n27i+2TR3v3vsvbPfqlH3XCNv/jtUzgF//k3OH+WEI5TXZr49rTOqd1TiuPy1wfejjI8TDXh4xHno5yWHpaMS4Zj9pwmMORp0Fu2dpfP2NpM7VEksT/LwLe761e7JZHnlxeOB/9/M9+9/Hf80tPBJwt05luLVtma5mZmWmbq676f8BOG0BcddVVV/1fRXDVVVdd9X+abTBXXfX/WNoR5Rl3rb75m3+znjgmMb9WX/ZRr1lLSMH/eBHxlDvXv/lHdy92dpyTcyLXzrXbytMyp6NsRzke5niQ02FORx6PPB16PMhxz8O+h0PnOtvQF91118GLPfTYG7/y9ceOz23b5v8Xnzm1+MwPf6Xcu6gIpI//8t+fWiqKzVVX/X9m2zZgrrrqqqv+ryK46qqrrrrqqqv+r5uySfqSH3rC3//JU+vm5sF9Z1/r9a571ze42U4U/M+WaZuv+4k79s+P0dVpWLtlDmtPa4+rHJYej9pw4OHAw6HXh14fsD7waj9X+22573HtcYw2rJftM7/xjj/5h/3v+OJX+q3veqNPeJ8Xf+QjTvL/iEJ82ye/zslr+/HwwuKma775e//mLx5/Tgpn46qr/n+zweaqq6666v8ygquuuuqqq6666v88AzpY5ud/wx9Ft6DM2nD0hR/2SteeXGD+x7Okv3jq+EXf+nel69s0jOPQxiGHpccjD0c5HDEuPSw9HOX6MNeHuT5s68NcH7Vh3aa1x3Uxn/k1T/2h3zz790/cfYP3+eXD1f7nfPLL/eq3vNZXfsorvc4r3ryxNeOZxP9Rwu/zZo9+i3d67HTxvvnJ4xefdukzv/ZPQchcddVVmKuuuuqq/+Mon/VZn8VVV1111f9FBknnzp37pm/8JttcddX/b7YV8cRnHDz6htlLvdwtR+fPn3rw9knz8394FwSY/9lC+sunL7vl0au+8rVtWE/jJOGpyelMnNnS0+hpzHHwNOQ05DhmG2nrWfgrv/sZX/XT9yBJcfbi+CO/fJtXq4c+eOMVHnniHV7zhjd9pTNnd6fb7j2aWgKSkHgA8b/eo2869tPf+jZlOnIe1hvOvPsH/9JfP+WiIpzmqqv+H5ME7OzsfOiHfth8PgMkrrrqqqv+L0KZyVVXXXXV/0W2JT3xiU988Rd/8czENldd9f+aJMH1J7s//NF3uuaM3C7VbvON3uVXfuvvLoD5n00S0Mnv/urHP/FDHn5sy8OaKFG6juhL16EQYdstybQbbTWf6Wh3+srvv/3rfuGeMY0kQMpM4BG3bL7Fa93wEe/w4NPXbN531/opt1/6pT+894d+4db7DptNRDgTYSMwSNj8bzQr+qPveOuXes2HePfOuPbMz/zwE97u43/TYIzNVVf9PybJ9s033fi3f/+4YzvbNhJXXXXVVf8Xoczkqquuuur/ItuSnvjEJ774i794ZmKbq676/y4inPleb3zLt379Wx3d94yNndkT/nr1ah/4y/tHI//ziTDAyz10/invetOrvuI13Qwoja5FITMkQYVgiGhq+Xf/sPs533Hnrz1uzwbxLFLYtg08+EHHPugtH/xeb/PIY4uyl/1T//bW3/zjO7/3l29/+tmxpUuJTAtsg4wlYSNs/rf4wvd56U/+/DfLe+/Uoi4vtUe+2ffddX6SZJurrvr/TZLtW26+6W//7h92drZtJK666qqr/i9CmclVV1111f9FtiU98UlPfPEXe/HMxDZXXfX/npAU+Ee++LXf4m0fM9x76+z0DT/yPY97zy/6IyNs/scLyXZXePNX3nyb17nxwTef3txY3HBtKXXWFR8uj+654/DwYHnP2aPf+pMLP/wnuxf3UyFsGwCBkZAkZMhM4IYbt17zpa57v3d5sZd7+LES49OeePaXfufO7/+Fpz/pvmHKrLU4bey0pLQl2eZ/OoFf6dEnfvtH3rmfdW11WK677j3e64d+8FeeFlEyG1dd9f+eJNu33HLz3/3dP2xvb9lIXHXVVVf9X4Qyk6uuuuqq/4tsS3rik5744i/24pmJba666iok2b72RPfnP/H2p0/kev9w4/j17/Hhv/wjv3s7CMz/eCGlDQgQD3rw4te/8Y2vv+mabtb9yE/9/ft/+u+QHhsJgCSwzQOJZ5IkyZCZQNd3r/Hy133Euz/qlV/imo2N/tYn3/Pbf3Tn9/z8M/721oOppaJgh8i0Mf8b7GyUP/6et33kS98wXbpYr7vpF3/ib9/6o3/eyDZXXXUVSLL94Afd8jd/9w/bW5s2ElddddVV/xcRXHXVVVf932YQgLnqqqsAbEtx78Xx4z/vN2O20c1nzoOv+5TXuuXMDMz/BmkDkhRhs1wGZVtlQ93W3btej57UEQohYdvmgQQIBMJ2ZmKXUmqp05i/+Ye3v92H/8abftCv/sDPPXXr2Nb7v/8r/tK3vdGPfsGrvs5LXC/bzpYGQuJ/vBBf9lGv9qhXujkPzpdjx/fu2PvAz/uNNFddddVzEZLEVVddddX/ZQRXXXXVVf8/iKuuuuqZ7JT0o7917w/+0F/3p06u9vaOP3T72z/1NWsIif8lbKcT6KJNaRXoGIYG2Ol0GpvnZbCxsTEYbGdrLVNyRMnkrx537kM/+/de831/5au/6+/uPWhv8S4v8Ss/8Va/9V1v8Z5v9OCdrblxGiFJ/A/2Hm/0yPd9v1dqu3uu0ub2e3/KL95zbimFba666qoHksRVV1111f9tBFddddVV/8eZq6666gX4yC//67//i7vmp68ZL559nbd8sU9+x0cLI/G/hQGwQQopYnQAts2/ggGwMzPtlIgIKe68e//TvvJP3/T9fuVzvuCPnvB3d7/6mz3iu3/s3Z/x62//2e/12BtPbxnbCEUE//O81CNOfsuXvZHGlZjKmRu+/Vv/6Od+++lS2MlVV131XMQV4qqrrrrq/yqCq6666qr/02xAXHXVVc/JtiL2l37vT/3tg4tj3VgM5+75xI945dd8sRPYSPzvkQ6nZSO11gDb/CuZZ7JtOzPtlATccfbw87/1r1/9PX7pgz7wZ//iV/5++0GnP/Mb3vVxv/quX/IBL/aYhxxHZCZIIf5HEHDyWP3xr32LujFry30d3/mT33riJ3zJ79jGyVVXXfU8BAgAcdVVV131fxTBVVddddVVV131/1JmKuJvnnL4kZ/1m1mP0dX5mfp9n/e61x/vsCXxv4RNkKJJ6Sn5j2MbkBSKvaPh23/qSa/xrj/zxm/xw9/2Bb+M9Alf9o6//+Pv+M2f8HJv+Yo3h3AakMR/K8mzTt/zeW/40Be7JvfPxbHNC7fvv8tH/+r+skkyV1111VVXXXXV/08EV1111VX/twlx1VVXPX/OlPSDv37Xt3/nH/fX3jhe2r/+xc/8wOe+1sYsAEn8zyYAnA2nDDBNCWD+A9lOp6RQrEb/+p/f/cFf9Psv/qbf/9Ef8lO33et3eKc3+frPfbvPe8+Xf4VHXlNC2Py3qsHXfNyrvclbvthwz13MSrb2lh/wM7fdeyTJNlddddXzY/NM5qqrrrrq/yiCq6666qr/04QQl4mrrrrq+RKf9A1/9fi/uqO/7sHt4PA13+JR3/upr9YVoYgQIJAUEZIiFCGF+B/DhhQOMqaW/OewnU4JSZLuuPvga3/or1/jnb77XT/mR3/78fuv/Jov/15v8Qpv8RqPPLbV1yL+W0hFfO77v8z7vu8rDPfd5b5oa/t9PvpX/+RxF6SwzVVXXfUCGXPVVVdd9X8awVVXXXXV/33iqquuegFsg46W7X0/+ZfalLGxNVw4eOv3evlPedcXdzZUIgoqtjPTdqYz7TQoQvwPkHhKQUCZGv+pbGynDUg62B9++Xef+D4f/10f+6U/92t/fuuNN55+7INPb29Uif9ykv3Bb//Yj/moV12fvzeLu5MnPvFTfvmHf+lpSHZy1VVXvWA2zySuuuqqq/6PonLVVVdd9X+aJHHVVVe9MLZR/PnfX3jfD/3x7/rGd6DztL/61E97sz/4+7O//pd3g8DXn9l66UdsnznWLXrt7q3+/rbV4592KRNAwua/ka2WsgN1U/Jfw4AtSZAt/+aJd/ztE+84fXJjo+9t9V0ZxsQ2/2EkMOYF8Tu97i1f/tmvm8tL7jS75rrP+YJf/9ofeIItY6666qp/iQHAIK666qqr/i+ictVVV131f5646qqr/gVOpB/8paeVD/3x7/iWdxx3D7qIH/jyt3/t9/qeKcuHvNlD3vcdj23sFNGoKGJcxZ/8xf63/cQzfuS3756S/26WAIOyJf+FbBsEAsPZC0dwJCg1JAyY/yg2L8SbvtL13/01b5Hrw6TNr7npa77uD77wW/4mDZirrrrqqquuuuoqqFx11VVXXXXVVVfd7/t+6an+oB//zm9+5xjz9IM3fuaLXm29Xj7yscdXq72D/bGhKBVHV8srv9qNr/qaN77fb971gV/0F0+5Z0DC5r+DIIQQQDP/5QyAAAFg2pQAkmSM+bdbbM63N7rT291Dr5/vHo1//qT91eGKZ5GwX/6RJ3/6u99Odk45u/aW7/yuP/2Ur/jDNFddddW/mrjqqquu+j+KylVXXXXV/3U2V1111b/MBoG//5eevPnRP/lVX/Sm7N115voiNg+P1nTzsugrXa0lE0cujyayvdrr3PLHj7j2lT/gF55y58h/EwMqqECkxH8TA+Y52Pw7vPKjT33Y2z/ktV96fuJk3/W1bHZerZ/yhN1/eNryT5+0/K5fv+vs+RX2Tdds/fZ3v31ZbLZL5/vrbvyxH/qzD//s35qaueqqq1504qqrrrrq/zoqV1111VX/95mrrrrqRWIA8S0/9Q8PXhx9wPu/VJvGEqXM5pQaZa7oVIqQmILJbnsXDreun/3W17/BK7zfr99zYUBg/otZIgqqUNL8H/CQG7Y/6/0e8aavd/r4tsaD1Xoajw6X3kucN9wye8jDZ2/9tic//X2u/YxveOrvPWH63s9/k42HnMpLe+W663/yB//0vT/p18fJXHXVVf8aQgCAQVx11VVX/V9E5aqrrrrq/zxz1VVX/avcdKJ7yUdvR5usGqUjuugXrhvURVOIzFxH1zyNdcHR/uG1D9/6ig95sXf/wr8CzH+1EKFAAtcQ/8s95kE7P/lFL3vdLd2wPLp0X8lIg6ISAlbp5bJxOG3O44s+9pGrw62dB80ZL2mbb/ua3/iIL/mjsZmrrrrqRSYwAOKqq6666v82KlddddVV/6fZNlddddW/wqLjGz74Qa/6CsdbW6pf0Ff6ufoNuu3odxTFbR1t5WkpwI3ZfLV/8JZveNPL//iT/uyJh5Js819IEIFkKWcVAIH53+jYpn74C1/szLXTau9AMWsSVEVEBJIkJGPk1TiGIucc3Hv3dF//KV/599/1i0+ZuOqqq/4tJCGuuuqqq/5Po3LVVVdd9X+abWwAzFVXXfUieNmHbLzyy59cjas67yOKSh/dpuvxsjjluoOqcsW0hwNQy8jWUpubev83OvlnTzzkv4EkoYKjhgDM/0Yl+NqPe6kH3TQ73DuMfi56oiiqaoWIUiAk7MTJLJXJOLn4qX9/74//+tMSQkqbq6666l9JAgQgrrrqqqv+jyK46qqrrvo/zTZXXXXVi0rA6730ibqopmFJkqrqRpkdj9npmF0f85s0v0H9NeqPURdEp6hWBT/yoTt9kc1/HQEgGmlsU0sBJP7XUeg93uDat3qdrdWlg9LNpC66WZltlPlm6bfKfCfmO2W+E7Ot6DfVb6gsqPPo5tM0vdiLH/u4d3ookDZXXXXVv4XEVVddddX/bQRXXXXVVf+n2TYA5qqrrvqXSbzUIzfsUUgkMgpTibm1RT1BPUk943rCsZFUFBBSsV2LzH+DTGWWNhmiqwCK4H8PIeDYVvmkdz8xrZYWoVK7XmVWuoW6DfVbZb4Ts+Mx245+O/rN6DbULVRmKr26+TguP+LdHvHit3SYq6666t/FXHXVVVf9H0Vw1VVXXfV/mm2uuuqqF5W3Nrtbrl9M4wps25l24sxsYJy2sWWDAwvLSDJWLWkk/isIBRGSGF3WaZVA6hRcplCEJP7nUwh41Zc8eeONm9O4VukUnWJW6iK6RfSbMd+JxYmYHy8bJ8viWJnvlH4z6kJ1HrUvdT5S+0X77Pd6kAQSV1111b+eueqqq676v43KVVddddX/eTZXXXXVv0SSzeasbM7T00jfCWNnm5RrTYcMu6gQc9qR1/dpvORcKydouIVSeYQN4j+TJMC2jeXtY/Mbzmwc7d7ndTh2t+r+bFHns+7oaBqHEQBFCWfa5n+wh1/XYbK5dFIUlT66uctC/VbMtl02S78QobbyeGgdilUi285UXRytly/92GuuP37rXRcnBOaqq676VzJXXXXVVf+XUbnqqquuuuqqq64CGykOl+3SwXTmRIw4M4ubPeW01HTg8bzbSqW4LZn2GA/xyp5Mg0mVCwdCYP5T2Y7gUTdvvsErnnnlFz/5ko88cfL41omNYbzvzlan93/LU+/1eq958eDw3F4+9dajX/qbC7/2p+fO7bW0o5TMxOZ/nhCPfcg8cwQLRXRSVelUZ+o2o9+mOx6zYxBqS8pFIowCZ05SiVKn0cd2yks9/Nhdf3ZeCju56qqr/lUMYBBXXXXVVf8nUbnqqquu+j9Pwuaqq676F1jiaDk+7smHj3noqdXQaqG1Fm1QW+awFyTlwBJtDMac1mKCdE4qOtpr3/QjdyeqtbY2ZZr/YAJ3vV7j4dvv+hYPesNXPnPqzIatqTWT0xQZOY0N1W6L67e3brxJL/8yp978rR68d275D0+49FU//ORf+9s9QCWcifkfQpCZfaeH3ty3cQwkBBGlmhplpjJz2Yr+JN1JRc+4S45ua2JQDFLBkkULFGd2gquuuupfz7a56qqrrvq/jcpVV1111f9pkgTmqquuelEY6XefuHrbNyttzImpZmVa0SKh0RRdhJyZSrI5m9wkF3nqupd6sev+4a57b7t3z0YhbJv/KMIv/eDNz/uQh7/6S52cH1ushmm9Wgkh2a1JYEmWmrOBW64Oh1I5fqx/vde98XVf56Zf+Y3bPvu7nvjXTzlKcIg0/xMIzMZ2PXW8a+Na6iQMkiwRQRSpoCoqaUhAgsC2ZMlg5AhObBcAiauuuupFJgBjc9VVV131fxnBVVddddVVV1111WWZKelX/mz3tjuH+XzepnW2Kds4rZeajnLYb6u9tt73dJjDkaelc+22DqVT82PXfM6Xvv9f/9qHfN0nvNqDbtp22kaSJP7dQrzv6938m9/8yq//6je66w4Pp5yQAklIEgJkBQpFVdQoXXTV1EY73D862jt8o9e/6Q++7/U/530fszkLAeJ/BAOMy2l1NOLAkgxOW8JuzhGPtENPF5nuY7igdkBbexrkZjdnE0mblFklAJurrrrqRSUAc9VVV131fx3BVVddddX/aZIkcdVVV71o0py9NH7rj9/ezzZlZ47ZRrd1Gw89Hrgd5nTUpiO3VbaV28q5ksb9vfXRQYtcbR3vP/Qz3uxJv/+hX/Wxr3jztQvbtsW/mYDtre5bPvolvuHzXqxUjpaDQREoTFjFURxBhEshCqW4FEdBYQIkpCgOHewerPf2PvkjHvYLX/YKN1/TY5D4H0BivfZTbhtLqZnpbGKSW+ZETm5rT4ceL+X6bK7O5ribw6HHlXJ0DrTJOZFTMAXceX7iqquu+lcRAMKYq6666qr/ywiuuuqqq/5Pk8RVV131IstMW9/xq7s/9vO3bu6ctNs0rNq4nlartl56OMrhqA1HbTjMcZWrVXFb7S8/7Sv/9n0+6pf++vf+ROXS/pOeFKV91Oe8/pN+/X0/8/1f9tTpLfNvI/DJne43vuYV3+Mdbjy8tJosVCBAEEQhiqOodJRepafMiF6lV+kpHVEd1aomFKHajdLFOy++4svPf/MrXuEhN/bYSPx3i1Ka+YU/3Q0JIhvZpszRbXBb57Rq64O2vuj1uVyd93q3rfdyPMpp6Wmd00BObRpq8bnzR7/+N+cBZ3LVVVf9a5mrrrrqqv/TCK666qqr/s8TV1111YvOsE4+9uuf/i3f9cQx+9LFuB6Ho8P18mC9PBxXh9PyqI2rXK9nRbkaP+Sz//K7fvmun/njs2/0vr/049/+h1vXLTxcWD7tqf01+uyveeNbf+09P/29X3xzs+dfzYtZ/NyXvPyLPXL7YO+ALlAYEEhEUKpqp26mbhHdRnQbpd8o/UbUhepCda4yU+mJSoQJICJi3l+6uLrulvzdr37lh17fgRH/XSQMbWqYW8/mwbLWWsnJbe1p5Wnpaelx6fEwV5dyddHrS229l8N+Gw9yPMpp7WlwG/Cw6Pi7J50/v5dEcNVVV/2rCBASV1111VX/l6HM5Kqrrrrq/yLbkp74xCe+xEu+ZJsm21x11VUvGknYEq/+8I33fdsbX+9Vj29vJC7pKKW4aRjH83t++l3TZ3/rk//0SfuSFJGtFfHxb3/z53/560RfvHfQplJPndLGzt1/dttnfOkffu+vP2NqCUJg80KF+M5PfKl3fOvrDi/uq5/hCAURKIiqKEQlaqkdKoqCBAhh24kbOTmnzIlszpFsuNktneP6YHNn6+n/sHqNj/uTvUNj/qsJDLCxEa/1Mte/7es86FVe4eSNG5eGg30HqrMy21TditnCdTPq3CqEws6cxOQ2eho1rT2uPS49HWzP+LiveOLX/+JFRTiTq6666kUTEXY+9CEP/au//putrU0biauuuuqq/4tQZnLVVVdd9X+RbUlPfOITX+IlX7JNk22uuuqqF5kkALuKV3jY5ss9fPHgGxY337QRtf7VX198wj3rv37SwW0Xx7ElCIyQAstuj71l6xs+5aVf860eSU65dzQNW9311+J6x+///Rd9219+12/ePYwTL4zA7/9GN33tZz3q8OKB+h6KFFKlFFQonUqn0ik6lU5RFQGSZMDGSTZ7ojXn4DZmG5wTOeKWbhk5rcadjfkv/swz3vWrnzalsPkvITAAN14zf9c3fPA7v+0jH/ag05t1tVoe1hiH3YsH+0dRS+0XURcx66kLyozoQNh24klunkba5HGZw8G89123rl/zY//23v2UZJurrrrqRRMRdj7soQ/7q7/+m83NDRuJq6666qr/i1BmctVVV131f5FtSU960pNe/CVeok2Tba666qp/JUkCsA0QogSt4VCmkQBs7qcIkLMJ3usNbvqsT3j5B73cQ1kvx/1lrqI7sUEtF//mtq//3sd/7S894+LuEgAk2eYBHn7d7A+//ZVrmZqsqISkKnWUqtJRe0Wv2qv0iqqoKKQAAZDOlNOe3Ca30W1wW7sNzpGcnJPD2VLjMI/6Lp/0Vz//1/sgbP5L3HR69nZv8KCPft+Xvu7BO9NqeXh+2Y3T5qlt5ht//Gt/dcPJ3NyOCNW6UFcUNbqZoyKRWGSznMrmacxxqO1gsdm/+6f93U/+8b4lbK666qoXWUTY+YiHP+Iv//qvNxYLG4mrrrrqqv+LUGZy1VVXXfV/kW1JT3rSk178JV68Tc02V1111b9JSApJsi3JONO2AcxzkRQRmbazr3ziuz74gz7o9W987A0ehnbxvmk5zk4c16w/eNq5H/ixf/iOX3jqXz7lYppnEkK2v/b9HvL+7/2Qo4MjoiqCCEVFHbVXnavOKPOoPdFF6aQqFSskAc6ExI2c8ORpdA6eVjmtsw3kSJvkkczW1hsz/cWf7r7hpz1uNWKb/wSSbAOCh9y48W5v/JD3eccXv+GWE25HBxd2u9livnFN6xYX7z3/3T/yuG/90b98vze+/qPe/xGrg0tOd92MCJWKAoQCK3FiZWrMyLZxcvGV3/r4T/+eZxiBMVddddWLLiJsP+qRj/zLv/qr+XxuI3HVVVdd9X8Rykyuuuqqq/4vsi3pSU960ou/xIu3qdnmqquu+q8SISlaa0BX9FFv95j3e9+Xf9SrPMzj0M7e1ZZT3dmMzRPt/MEf/d6Tf+LXn/Hjv3f73fcdGIDtWfnL732N0yeypRWBpAiiUmbq5tS56jzqnNJHmSmq1BEVhRR24sTNbnJzjrTROea09LTOcUUOnga1CU/OKXO9OZ+9x6f//Y//3nn+40iAbHNZDb3iS173Hm/ziHd6swdv7my25Wp5cFhrzDaPUTf/+M/u+IGf+buf+vWnnd9dWwr549/5QZ/0kY/RuGr7y+ZUKVJEFChOJbKTSYu+lr5+zfc94TO/6+ktueqqq/4NIsLOxzzq0X/+V381n8246qqrrvo/C2UmV1111VX/F9mW9MQnPvElXuIlWmu2ueqqq/5rRSgUaTJbCd7ytR7yyR/6ci//mo+A0i7dM+61brFTFlCmg6ff+0u//fTf/rOzP/lbd73da1z3xZ/0mGk4sqokhYiqUqlzdQvVhepCda7Sq8wUPdErOlQk2YkbnuyJbHiiDW5DTitPK49HbmtPK6aJHJ2Zbb250G/8wbm3++wnDUOafxdJErZtgAg95OZjb/yqN7772zzq5V75Gnlc7+0dXljOFie72dZ61X7q157wPT/15D/4q7tbGighEJCZr/uyG5/+vi/xMi++0dWhOYbV2Cbj0tWuEN28Q+WpTzv8lG96wi/88X3mqquu+jeKCDsf+5jH/vlf/OVs1nPVVVdd9X8Wykyuuuqqq/4vsi3piU98wku8xEu21mxz1VVX/XcISRGZtlPwqi955uPf52Xe9C0fVRdbebicDg5UTKEuOq0Pn/53Z9erizdcP8/WiIIUEY6q2lMX6jZUN1QXqvOoc6uPOiNmip7oQNDIkRxhcpvwSA5ug9vS4yrHI49LppWnkTY6m93EajrK1/3ov/v7W5cSNv8qEiCwzRW1xEs99prXe+Ub3+C1bn7Fl7l263TfjparixfH5Xq2uVXmx25/xsF3/PDf/fAvP/kZdy+5TCFsG0ACyelaeJ0X23jdVzz5si9x7GUfszh2qstRR3tx7lJ76l3r7/zJu3/mj+4bhgYCc9VVV/2bRISdj33MY//iL/+y73uuuuqqq/7PonLVVVdd9X+azVVXXfXfK21akxQRtv/gb8/+wcf86mO/+g/f7y0f9S5v/2LXPvi4qePBwfpSKy63PHp7dd9Ry1GqBiQUilAUoqrUKB2lU+msTmVGzFTmlJnUocDNGlDBowgMMiSujqIoKsVZiOaUEFJm7JyI137pY39/69LmRSGBhLFtA5bY3lk8+iHH3uTVbnzz133YS73UmTKXp2E4Oji6a9laLraPb5w8c+fT97/2u37ve3/uqWcvrgEJSbad5n422Ao169f/9ujX//aoxh03nplde+3G+d3xYOn9/fXR0JwGSbLNVVdd9e9mrrrqqqv+b6Ny1VVXXfV/mm1jrrrqqv9utm0DEbJ53DMOPu7r/uJLv+/v3vxVbvjA9375l3vVG6POPSyni3utrawCloSEhAoqRJE6q0ZU1Ck6olP0qEdzojeBGhQIHCDSKFFDVVGJahVFoIAwDQPF5Ms/ckNggXlekgCBwbYNNrC5NX/I9duv+OKnXutlr3mNV7jhhlu2u+2ZJ9rh3nJviTL6Oj+x2Ub9/T9c/I7ve+L3/dKT948aIAmwbZvnx2nkCCGadeu961vvXQMRYVsSsm2bq6666t/Jxjbmqquuuur/NCpXXXXVVf+n2cZcddVV/3NkGpAE3Ls7fMcv3fqDv37bq73E6dd4hRsfct3WSzy8PexaJkAAAimIUISiKgpRpYqqohKV6FR6So96qUCzAokUAImbYiKCCCKIYgUIAWBAY2sv++jZrGM1IWEDSLLNZbYBA1Bn3YOv3361lzzzGi958lVf+roH3XxsdnLuZqZxPDxYH+6nXBfz2faOSrnvjr3f/vmn/cjPPv3X/uye5ZiSJAnS5l9k0gaEQyBh22ljm6uuuuo/jm2uuuqqq/6Po3LVVVddddVVV131X842V0jLMX/9L+/79b+8D/j4t7jmCz/1xfd2V1EChIQEgYoJqUiBQlFQkapUoUOdVaUKRZJlhXGiEYUJFCiQkAQW9zP2OLaHXLv1sIdu/cMTD8wz2VYpO1vzvpTXfKXrz2z1j3jIzos95PiLPerUiZMb/XYliWHd1uN44VK2jIjoZrGYmTy4sP/Hf3nHL/z2XT/3B3fded9e2lJEFMhMm38dgw02V1111X+OTNvmqquuuur/MipXXXXVVVddddVV/41sJIGkdN548+bYKgiMZBAgJCEhgZAAEAoUikIUqaLOTgIp1ZoVKJAQzyJsIWwMBoMx0c8eciwuXrf5kg/eqeGHPOjU8fnsTd/sEQ+9Zj6udM0jTyh7POVq7eFwXO6NR9lallkffY2tHaXbON1z98Gf/P1tv/z7d/zWn99x573LTAOKkISdmVx11VX/I9lpzFVXXXXV/2VUrrrqqquuuuqqq/572QZsYMOrbIORJSEkg8C2ANtYNjYYp21hgOgUC3C2I6bBIMDGFjYGg8E4bWMbG2NQrHL4hA945C0Pe/EbbtoumwskWkGwXua4HnZ3lwerUA1arVHnG3WxcLZhfXTP7Qf/8NR7/vRvz/3x48/+yRPOXbp4BAYpIgrOdCZXXXXV/1wGMtM2V1111VX/l1G56qqrrrrqqquu+h/AAKwnRyTYNrJsMLaxSJy44WY3eXKOEaNzwL2cNmBywhM001BC4gSDwcbGYDA2Ntgoarz8KzwsZpurS7s+2Fsvc3N7I9NFpVuUMlvsbG57yrYaD/ZWj//bs0940qU/f8L5v7/twpNu2724e2QbQBElwLadzVx11VX/OxjbXHXVVVf9n0blqquuuuqqq6666n+MJ925ak0GbGxsbGdGZrYpYgpPzlGqbiHkJkS0sCEm3MgVucaDc1JOOO20005sbGw7ycSJDZAORS3EjDI7Xjb6jf0sO/367KWL59are4c//svbn3Dr0ZOesfeU23bvPn9439nD1myuUIQkge3MxlVXXfW/isAYbACDuOqqq676v4jKVVddddX/aZK46qqr/vf4+9tW66OJkDMl2cjGaTe54SnbFJrQgGQJSU2W8ORcgXFzjuRIjs4JT7jhdKacOMkkM512YttTLXnuAt/3g38x9sdWl1Z7q3zS03eHKZ92+6VL++sps6V5AIVUQgZsO9NcddVV/1sZsG0AEFddddVV/0dRueqqq676P00S4qqrrvrf4u9vXd952/5NDzvZxsEGOzMVSTayZZukyTlBkQIkCTAQIypG2HhyTmLEo3PCk9uEW7aJNjknZ3M2O3HaWbryh3+993nf8aQ0z6XUDqlUbAM4bZw25qqrrrrqqquuuup/DSpXXXXVVf+nSRLiqquu+l/iwqH/4YmXHvLoa6ZhhQzNhpxQKCc8kRM5WkFKkhNAsrOi4Ao33PCEB3J0G/FIjs7JbSKbnWAwWEykz+6vo0SN0toEYRuMnW20ueqqq/7PMoAkrrrqqqv+jyO46qqrrvo/TRJXXXXV/x5pfu3PzkUOysyWpHFzGme2yW10DtkGcnBbu62zrd2Wno5oR0yHboeeDt2OaEu3Vba125o25LTOaaAN5JitkYnttG2n2zr/5K/PtinHccrm1lpmZjqNzVVXXfV/mwCQuOqqq676P43KVVddddX/aZIQV1111f8Wgl/9m6Pbb9u9/qbtYWhYsnEjhQo5uklSTqhYMjQ82RUkBZeJtG0nOZIjbe22dlvTBtokt1SaBNtZS7nzbP7W368MAnPVVVf9PyMkSeKqq6666v8ygquuuuqq/9MkCXHVVVf973H3vn/iF+6YbxRns5vd7GY3cnIbPY2eBtpAW+e0pg2e1kxL2srTkrZkWnpaMa2YlrR1TitPa6Y10+A22pOddrONM6exn3ff92tnz54fkGxz1VVX/X9jJAlx1VVXXfV/GZWrrrrqqv/bBOKqq67638Ig+NpfuPjGr3fhEY85sT5YRsxwyokbOYHcBDaWnW6oqBSQJCTb2ADZ8EQbsg20gRycDadJ2ZDp7Pt4xr3Tt//SfYDAXHXVVf//CEmIq6666qr/0wiuuuqqq/5vM1ddddX/MtK5I3/+t93a1S4UOU1YznSms7mNbkOOa09LT8scV26rHJaelp5WOS49rTytPC09LXNcelrR1jmts43k5EynbRvhnG/Pv/gHbz9/YUCyzVVXXfX/kiSuuuqqq/6PI7jqqquu+j/OmKuuuup/EdsK/cJfHnzL9z5t+5pjmbaThEycdjon5+hpyGnlaelh6WnlcZXj0tOKccW0Ylx6XHpceVrltHYb3RpObGxDtra5M//FPzz8wV86iySuuuqqq6666qqr/g+jctVVV131f5SNRKYBSba56qqr/pewSfQ53/OMRzzs+Ou/zrV7Z3cjQmmUSDbIpFEjwgpFWJJCYHAa0tlww81OnGTaJo3JKTd3+ifetv7AL/mH1lLC5qqrrvp/zVx11VVX/Z9G5aqrrrrq/zTbxlx11VX/q9hG2lv5Az7/776/6pVf9czhxaMQUjiRQGmMRAoFAsKSMGAbGxo2ToMwCTbG03js+OzxT1+/ycf83YWLkyTbXHXVVf9f2QDmqquuuur/NoKrrrrqqv/TbGMAcdVVV/1vYhvFvXvtnT/tr3/p5+/cOX66Rm2TnXLKDRIaNDM1T83T6HHMccxxZBw9TZ7SLUkr7Qk3PBGMOycXf/rXB2/40X9579kVkm2uuuqq/99sg7nqqquu+r+M4Kqrrrrq/zTbXHXVVf872Yl0ful3+8J/+Mpv+LNDndg+ti0nOZkE44YbmbSkNXKiTbSRnNQm2mRnutlJOpLFPLpF97XfffsbfNxfnj23loTNVVdd9f+ZeCZz1VVXXfV/GpWrrrrqqv+zDLLNVVdd9b+WbUlD+tO//85f++tf/sz3e+lXfPmTUdu4GtvkzJYCSwKZNEpZAIkAIdPV6PqSXv/+X1/8gm9/xu/+/S6ShG2uuuqq/+8EBoy56qqrrvq/jMpVV1111f9ptrnqqqv+N7MtQPrtvz/4g4/7/Td46ZPv8qYPf62XO3HmZInapZlGxjaO04gxBA48r6UWqSozz58ffvMvL/34b579xT+9Z2opCWxz1VVXXfVs5qqrrrrq/zQqV1111VVXXXXVVf+zGbAljelf/MsLv/RXf3rjmY23fvXr3uCVT5883m325ZYbZsdPbaoqx0bmam/51DuXF/Z99/nVr/zRuV/5y4v3nj00ACFsm6uuuuqqBzIAYBBXXXXVVf8XUbnqqquu+j/NtgGbq6666n8524Akwx33HX39Tz7tG3/qaV3V9kb/qJu3rzk9lzw21eDC3vC3T9k/PFpP6UwDkgRgG3PVVVddddVVV131/w2Vq6666qr/4ww2mKuuuur/AtsAksAwpi7sDX/w9+d4AAGSAEkCbJurrrrqqhdIiKuuuuqq/9OoXHXVVVf9n2aDueqqq/6vsc1lzYiQAAQgbAO2wTZXXXXVVf8yIa666qqr/i+jctVVV131f5oxV1111f9dBowxgLnqqquu+reRxFVXXXXV/2VUrrrqqqv+bzNXXXXVVVddddVVL4QAASCuuuqqq/6PonLVVVdd9X+aba666qqrrrrqqqteCEmIq6666qr/y6hcddVVV/2fZsxVV1111VVXXXXVVVddddX/a1Suuuqqq/5vM1ddddVVV1111VVXXXXVVf+/Ubnqqquuuuqqq6666qqrrvp/zDZXXXXVVf/HUbnqqquu+j9NElddddVVV1111VXPl81ltrnqqquu+r+MylVXXXXV/1kCJCGuuuqqq6666qqrXhDbXHXVVVf9H0flqquuuur/tIgQ4qqrrrrqqquuuuoFsG2bq6666qr/ywiuuuqqq/6PEgARkgSIq6666qqrrrrqqudgAGybq6666qr/2wiuuuqqq/6vEoAUiKuuuuqqq6666qrnJe5nc9VVV131fxnBVVddddX/aREhCQBx1VVXXXXVVVdd9TyMzVVXXXXV/21Urrrqqqv+T5PEVVddddVVV1111QthsLnqqquu+r+MylVXXXXV/2mSuOqqq6666qqrrnohBOKqq6666v80KlddddVVV1111VVXXXXVVf8vGQAhrrrqqqv+jyO46qqrrvq/zjZXXXXVVVddddVVz0MAIEBcddVVV/1fRnDVVVdd9X+eucxcddVVV1111VVXPQ8hCQBz1VVXXfV/FJWrrrrqqv/TjI256qqrrrrqqquuekEkEIC46qqrrvo/ispVV1111f9tBgOYq6666qqrrrrqqudDksRVV1111f9pBFddddVV/6el0yCuuuqqq6666qqrnj8BiKuuuuqq/8sIrrrqqqv+j7IBnAaDuOqqq6666qqrrrrqqquu+n+KylVXXXXV/2m2McZcddVVV1111VVXXXXVVVf9P0Xlqquuuur/NNtcddVVV1111VVXvWC2wVx11VVX/V9GcNVVV131f5ptAHHVVVddddVVV131fBnbXHXVVVf9n0Zw1VVXXfX/gBBXXXXVVVddddVVz4/T2ADmqquuuur/KIKrrrrqqv/zJHPVVVddddVVV131/KXTmKuuuuqq/8uoXHXVVVf9XyfA5qqrrrrqqquuuur5MjYA4qqrrrrq/yiCq6666qr/0ySQuOqqq6666qqrrnoBjLEBzFVXXXXV/1EEV1111VX/R0lcJgEgrrrqqquuuuqqq56TBGAMgLnqqquu+r+KylVXXXXV/2kRQlx11VVXXXXVVVe9EOKqq6666v82KlddddVV/6dJAeKqq6666qqrrrrqBRFXXXXVVf/XUbnqqquu+j9NElddddVVV1111VUvgIQkJK666qqr/i+jctVVV131f1pESFx11VVXXXXVVVc9PwZCIYmrrrrqqv/LCK666qqr/k+TBEjiqquuuuqqq6666vmRFBJXXXXVVf+XUbnqqquu+j9NEldd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6qoXJCRJXHXVVVf9X0blqquuuuqqq6666qqrrrrq/zVx1VVXXfV/HMFVV1111VVXXXXVVVddddVVV1111VX/l1G56qqrrrrqqquuuuqqq676f822ueqqq676v4zgqquuuur/C3HVVVddddVVV131PGywueqqq676v4zgqquuuur/NEkgrrrqqquuuuqqq56XAOw0V1111VX/txFcddVVV/1fJwEgrrrqqquuuuqqq56TAINtrrrqqqv+L6Ny1VVXXfV/moQkrrrqqquuuuqqq14Q2zZXXXXVVf+XEVx11VVX/R8nQBJXXXXVVVddddVVL5C56qqrrvq/jOCqq6666v8sAxIgrrrqqquuuuqqq54fcZm56qqrrvo/jcpVV1111f9x4qqrrrrqqquuuuoFEQASV1111VX/lxFcddVVV1111VVXXXXVVVf9vyQAJImrrrrqqv/bCK666qqr/k+zDeaqq6666qqrrrrqBYgIRQDiCnHVVVdd9X8NwVVXXXXV/1nigcxVV1111VVXXXXVc5CAiAgJMFddddVV/1dRueqqq676P822ba666qqrrrrqqqtegIiICEACAHPVVVdd9X8NwVVXXXXV/1kGbPNM5qqrrrrqqquuuuq5mIhQiKuuuuqq/8uoXHXVVVf9n2abq6666qqrrrrqqhdMCiGuuuqqq/4vo3LVVVdd9X+aba666qqrrrrqqqteMElcddVVV/0fR3DVVVdd9X+abZurrrrqqquuuuqq58s8L3HVVVdd9X8Nlauuuuqq/9PsBAPmqquuuuqqq6666vmwbZurrrrqqv/LCK666qqr/k/LNJeJq6666qqrrrrqqufD2DaAueqqq676P4rgqquuuur/NNuAJK666qqrrrrqqqueiw04nTZgrjBXXXXVVf/XEFx11VVX/Z9mWwgAcdVVV1111VVXXfUABiCdtnk2cdVVV131fw2Vq6666qr/02zzTOaqq6666qqrrrrqedi2zVVXXXXV/2UEV1111VX/p6UTCQBx1VVXXXXVVVdd9byMba666qqr/i8juOqqq676v82AJXHVVVddddVVV131/Ni2DYC56qqrrvq/icpVV1111f9ptkFcddVVV1111VVXvQAJtgEQV1111VX/NxFcddVVV/2fZifYXHXVVVddddVVVz1/znQaAANgrrrqqqv+r6Fy1VVXXfV/lCQgMzGYq6666qqrrrrqqudmY2cmV1111VX/xxFcddVVV/2f1pozE0BcddVVV1111VVXPZDBkK1N4wSAuOqqq676v4ngqquuuur/KNvY11xzzbHjxzKTq6666qqrrrrqquckCXiVV3n1EyeO2+aqq6666v8sgquuuuqq/6MkIT384Q+94fob7BRXXXXVVVddddVVz8E28NhHP3Y27zMtcdVVV131fxSVq6666qr/o4SANrX9g33AXHXVVVddddVVVz0fewf7XHXVVVf9H0dw1VVXXfV/lDGwWg9HR0sQV1111VVXXXXVVc/P2bO7XHXVVVf9H0dw1VVXXfV/lBD2YmN+w/XXgcVVV1111VVXXXXV83HLLTdhS1x11VVX/d9FcNVVV131f5Uw9F3/Mi/7coC56qqrrrrqqquueg62FXqd13t1JJurrrrqqv+7CK666qqr/u+yDdx5xx2AJK666qqrrrrqqqueg5ye1g1km6uuuuqq/7MIrrrqqqv+70obeMVXfkUAm6uuuuqqq6666qrn4FLKyVMnwRJXXXXVVf93EVx11VVX/d8lSfCyL/My4qqrrrrqqquuuuo5SAIe9KAHPfLRD7Mtiauuuuqq/7MIrrrqqqv+7xKAFrOFAcRVV1111VVXXXXV/QTArJuV6AAQV1111VX/ZxFcddVVV/2fZnzDjTd2XcdVV1111VVXXXXV87j55odsbW3ZRIirrrrqqv+zCK666qqr/u+SBFx77bWnT59OpxBXXXXVVVddddVVlxmAl3iJl4yQba666qqr/i8juOqqq676v0tSOk+fPv3oxzwaUIirrrrqqquuuuqqB3jUox4BElddddVV/7cRXHXVVVf9n5bNEfGwhz8cwFx11VVXXXXVVVddYSzpUY96FNjiqquuuur/NIKrrrrqqv/TIiTpVV7lVQEkrrrqqquuuuqqq0AS5tjxE496zCOAkLjqqquu+r+M4Kqrrrrq/zjZfsVXfAUgM7nqqquuuuqqq64CAfCIhz3i9OlTraUkrrrqqqv+LyO46qqrrvo/LULAIx728GuuvRaQuOqqq6666qqrrkICXvWVXi0ijLnqqquu+j+O4Kqrrrrq/7ps2ff9Y1/sMWAQV1111VVXXXXV/3u2gVd6pVcAxFVXXXXV/3kEV1111VX/5wlJr/v6rweExFVXXXXVVVdd9f+e7cV8/lIv91KAJK666qqr/o8juOqqq676/+G1X+O1JdlcddVVV1111VX/z0kCbrjhplse/KBMS+Kqq6666v84gquuuuqq/+siwvYrvNzLHT9x3LbEVVddddVVV131/5kk4GVf6mU2Fws7JXHVVVdd9X8cwVVXXXXV/wOZns3nL/bYFzMGcdVVV1111VVX/b/3Jm/8plx11VVX/X9BcNVVV131/4CEpHd4h7cHJHHVVVddddVVV/1/JcjMzY2N13mD1wYUwVVXXXXV/30EV1111VX/P9h+27d9u67WzOSqq6666qqrrvr/SiHgxR794jfdfNM4tZC46qqrrvq/j+Cqq6666v8BSbZvvPHGx774iwER4qqrrrrqqquu+n9JEvB2b/s2pZQQIK666qqr/u8juOqqq676/8G2pDd8o9cDQFx11VVXXXXVVf8vZWap5a3e7m0ASWCuuuqqq/7vI7jqqquu+n9AkiTg3d/tPWotIK666qqrrrrqqv9/JNm82KNf4uGPfETLjAiuuuqqq/5fILjqqquu+n/AtiTbj37UYx/5yEdltghx1VVXXXXVVVf9PxMS8Ppv8EYlApurrrrqqv8vCK666qqr/t+w3XfdB37oBwNScNVVV1111VVX/f8T0ru86zvZlsRVV1111f8XKDO56qqrrvr/wbaku++668EPfsjUJrDNVVddddVVV131/4Qk2y/2qBf7i7/5i67rAElcddVVV/2/QHDVVVdd9f+GpMy87vrr3/hN3sS2FFx11VVXXXXVVf9vSALe5/3er+/7zJTEVVddddX/FwRXXXXVVf/PSHq393lvAImrrrrqqquuuur/DTtLxFu/3dsCkrjqqquu+n+E4Kqrrrrq/w1JEQG85Ru9wXXXXedMcdVVV1111VVX/X9h8xqv9joPefDNLVMSV1111VX/jxBcddVVV/2/YQNker7YfM/3em/biuCqq6666qqrrvp/41M//dMlYSRx1VVXXfX/CMpMrrrqqqv+3xBKW+IZz7jt4Q9/WKbt5Kqrrrrqqquu+n/ghhtuvO22ZxhCIXHVVVdd9f8JwVVXXXXV/yfGErYf9KBb3uxN38xOIa666qqrrrrqqv/bJOBDPvDDIyIzJa666qqr/p9BmclVV1111f8ztiX96Z/82au86itjjLnqqquuuuqqq/5PW8xntz7j9tOnT9mOCK666qqr/n8huOqqq676/0eSzSu84su/8iu9srEkrrrqqquuuuqq/6MkAe//Ph965szplimJq6666qr/d1BmctVVV131/49tST//C7/0lm/xZhGRmVx11VVXXXXVVf83aXNr84lPePINN1ybdkhcddVVV/2/Q3DVVVdd9f+SJJs3eZM3fPQjH5VOiauuuuqqq6666v8eSeB3ert3vOGGa6fWQuKqq6666v8jgquuuuqq/2eEQAC4lvqlX/5lIiC46qqrrrrqqqv+zxFazBcf9/GfAISCq6666qr/pwiuuuqqq/6fMeYySZn55m/+Zq/9Wq9uWxJXXXXVVVddddX/IZJsv+PbvcNjXuxR0zRJXHXVVVf9f4Uyk6uuuuqq/69sS/rrv/7rV3yFV0y3THPVVVddddVVV/2fIIF0bHPn7x73uBtvvD4zI4Krrrrqqv+nCK666qqr/p8SIMn2S7/0S7/xm75RpiVx1VVXXXXVVVf9nyAF6U/8xE+88cbrW8uI4Kqrrrrq/y+UmVx11VVX/T8nPf3Wpz3m0Y8Zh9E2V1111VVXXXXV/3ISwINvecg/PP5xs1kPSOKqq6666v8vgquuuuqq//ecfsiDHvLJn/aptiVx1VVXXXXVVVf9byeBvubrvnE+n9mWxFVXXXXV/2soM7nqqquuugqODg8f9vBH3HvvPRI2V1111VVXXXXV/1KSbL/5m73lT/30TwClFK666qqr/r8juOqqq666CjJzY3Pza77pmwApuOqqq6666qqr/teyffz48W/5tm8vpUjiqquuuuoqCK666qqrroKIAN7xrd7ytV7jtTJTElddddVVV1111f9CkoAv/Nwvvv6605mOCK666qqrrgJlJlddddVVV4FtSc+47bbHPPrR6/Ua21x11VVXXXXVVf+bSLL9Ci/7Cn/0p3+EJCRx1VVXXXUVEFx11VVXXXWZJNsPuuWWz/6Mz7Utiauuuuqqq6666n8V233ff/8P/EBECCSuuuqqq666jOCqq6666qr7STJ8/Cd97Eu9xEulHRJXXXXVVVddddX/EpKAL/jsL3rEox6eaUlcddVVV131TCgzueqqq6666n62JT31qU9/8Rd/7LBeI2yuuuqqq6666qr/4STZfo1Xfc3f+r3fEkjiqquuuuqqZyO46qqrrrrqASRl+mEPf+h3f9f3Iwlx1VVXXXXVVVf9zybJ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kpCdtdS3e/u3//Iv/7KbbrwxbZDEVVddddVV//lQZnLVVVddddV/FdsRkc6f/qmf/aRP+vinPOWpElLYts1VV1111VVX/Z+jkNOheMkXf8kv/Yovf/3Xf13AmYrgqquuuuqq/yIoM7nqqquuuuq/kG0gIg4PDj7/C7/wm7/lm3Yv7EqSZNs2V1111VVXXfV/gBCyDTz4QQ/+lE/9zPd6r3eZzeatNUmSuOqqq6666r8Oykyuuuqqq676LyQw2EhInD137su/7Cu+49u//fyF85IkAZnJVVddddVVV/3vJAmwDdx0w00f+bEf98Ef8H7bO9u2nVaIq6666qqr/quhzOSqq6666qr/JpkZEcDZs/d99md+9g/96A/vXtyNkKS0neaqq6666qqr/vdQBOBM4CEPfvAHf8iHv9d7vsc1154BMjMiuOqqq6666r8Hykyuuuqqq676b+W0QsA999zzrd/6bd/4Td9w3733AZIkZSZXXXXVVVdd9T9YREiR2WyH9GIv/hIf81Ef+w7v/PabGxsANhJXXXXVVVf9d0KZyVVXXXXVVf/tjLEk4MLFC1//9V/9fd/7w0996lMAhUqUaZq46qqrrrrqqv9RpBJhyNaAjc3Nl3+5l/+Ij/3oN3n9N9zYWAC2AUlcddVVV1313wxlJlddddVVV/33ExhwWiUEwzD8/M//7Nd90zf8wW//wTiNgCQus81VV1111VVX/TeRQJKULQFJD3vYw97mHd/ug9//gx78oAdFhG3bgCSuuuqqq676HwFlJlddddVVV/0P01orpUiy/Td/+zc/9EM/+H3f+wP33HO3bSBCUmSmba666qqrrrrqv4RAIZBt28DGYuMN3uSNPuD93v/1X/d1Z/M5kJnYiuCqq6666qr/WVBmctVVV1111f9ImSlJIaHl6uh3fvP3vvU7v/3P//RP7rj9DmNAkiIErTWuuuqqq6666j+BJATImVwWEY98xCPf7wM+6G3f5q0e8pAHS7KdmaFAXHXVVVdd9T8Sykyuuuqqq676H8y2TYQk2R6G1R//0Z/9zM/99C/+4i/feuvT16sVl0UJG0FmctVVV1111VX/VpIkAUBmcr9a6ou9xEu82qu82ru957u/wsu9bNd1QGYCkrjqqquuuup/NJSZXHXVVVdd9T+YAMm27dZarVUSuLW88647f/e3fv/XfvPXfvd3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PDfz/In/KDYPYAAE5pkkcdVVV1111f9rKDO56qqrrrrq/zvxHMz/NgLA/I8jnslc9f+awPx/IV4Yc9VVV1111VVX/dejctVVV1111VWY/+XM/1DmqqsAzP8j5qqrrrrqqquu+p+G4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v4zgqquuuuqqq6666qqrrrrqqquuuuqq/8sIrrrqqquuuuqqq6666qqrrrrqqquu+r+M4Kqrrrrqqquuuuqqq6666qqrrrrqqv/LCK666qqrrrrqqquuuuqqq6666qqrrvq/jOCqq6666qqrrrrqqquuuuqqq6666qr/ywiuuuqqq6666qqrrrrqqquuuuqqq676v0kAULnqqquuuuqqq6666qqrrrrqqquuuur/JgNAcNVVV1111VVXXXXVVVddddVVV1111f9lBFddddVVV1111VVXXXXVVVddddVVV/1fRnDVVVddddVVV1111VVXXXXVVVddddX/ZQRXXXXVVVddddVVV1111VVXXXXVVVf9X0Zw1VVXXXXVVVddddVVV1111VVXXXXV/2UEV1111VVXXXXVVVddddVVV1111VVX/V9GcNVVV1111VVXXXXVVVddddVVV1111f9ZAipXXXXVVVddddVVV1111VVXXXXVVVf93yRAULnqqquuuuqqq6666qqrrrrqqquuuur/MgVXXXXVVVddddVVV1111VVXXXXVVVf9X0Zw1VVXXXXVVVddddVVV1111VVXXXXV/2UEV1111VVXXXXVVVddddVVV1111VVX/V9G5aqrrrrqqquuuuqqq6666qqrrrrqqv+7DMFVV1111VVXXXXVVVddddVVV1111VX/lxFcddVVV1111VVXXXXVVVddddVVV131f5aByvMnMFddddVVV1111VVXXXXVVVddddVVV/1vJQEIqDx/5qqrrrrqqquuuuqqq6666qqrrrrqqv8LqFx11VVXXXXVVVddddVVV1111VVXXfV/kM0V/COyO/acC9lP4gAAAABJRU5ErkJggg==', 'base64');
        res.writeHead(200, {'Content-Type':'image/png','Content-Length':buf.length,'Cache-Control':'public,max-age=86400'});
        return res.end(buf);
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
'    <span class="post-category-label" style="background:linear-gradient(135deg,var(--accent),var(--accent2))">📸 Neuer Instagram Link</span>\n'+
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


    // ── NEUER THREAD (ADMIN) ──
    if (path === '/nachrichten/gruppe/neu') {
        const isAdmin = session?.role === '⚙️ Admin' || (session?.uid && require && false);
        const botData = await fetchBot('/data');
        const adminCheck = botData?.users?.[myUid];
        const canCreate = adminCheck && (String(adminCheck.role || '').includes('Admin') || String(adminCheck.xp) && ADMIN_IDS_CB.includes(String(myUid)));
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten/gruppe" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
  </a>
  <div style="flex:1;text-align:center;font-weight:800;font-size:15px;color:#fff">Neuen Thread erstellen</div>
  <div style="width:36px"></div>
</div>
<div style="padding:24px 16px 100px">
  <div style="background:var(--bg2);border-radius:16px;padding:20px;max-width:500px;margin:0 auto">
    <div style="font-size:14px;color:var(--muted);margin-bottom:16px">Erstelle einen neuen Thread in der Telegram Gruppe</div>
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
  if(!name){document.getElementById('neu-status').textContent='Bitte einen Namen eingeben';return;}
  document.getElementById('neu-status').textContent='Erstelle...';
  try{
    const r=await fetch('/api/create-thread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,emoji})});
    const d=await r.json();
    if(d.ok){document.getElementById('neu-status').textContent='✅ Thread erstellt!';setTimeout(()=>location.href='/nachrichten/gruppe',1200);}
    else document.getElementById('neu-status').textContent='❌ '+d.error;
  }catch(e){document.getElementById('neu-status').textContent='❌ Fehler';}
}
</script>`, 'messages');
    }

    // ── THREAD DETAIL ──
    if (path.startsWith('/nachrichten/gruppe/') && path !== '/nachrichten/gruppe/') {
        const threadId = path.split('/nachrichten/gruppe/')[1]?.split('?')[0];
        if (!threadId) return redirect('/nachrichten/gruppe');
        const topicsData = await fetchBot('/forum-topics');
        const threads = topicsData?.threads || [];
        const thr = threads.find(t => String(t.id) === threadId) || { id: threadId, name: threadId === 'general' ? 'Allgemein' : 'Thread', emoji: '💬' };
        const botData = await fetchBot('/data');
        const adminUser = botData?.users?.[myUid];
        const isAdmin = adminUser && String(adminUser.role || '').includes('Admin');
        // Mark as read
        await postBot('/mark-read', { uid: myUid, thread_id: threadId });
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten/gruppe" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
  </a>
  <div style="flex:1;text-align:center">
    <div style="font-weight:800;font-size:15px;color:#fff">${thr.emoji} ${thr.name}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;gap:4px">
      <span style="width:5px;height:5px;border-radius:50%;background:#4fff91;animation:pulse-dot 1.5s infinite;display:inline-block"></span>Live
    </div>
  </div>
  <div style="width:36px"></div>
</div>
<div id="thread-msgs" style="padding:8px 12px 160px;display:flex;flex-direction:column;gap:12px">
  <div style="text-align:center;color:rgba(255,255,255,0.5);padding:40px 0;font-size:13px">Lädt...</div>
</div>
<div style="position:fixed;bottom:calc(60px + var(--safe-bottom));left:0;right:0;padding:10px 12px;background:var(--bg2);border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;z-index:5">
  <textarea id="thread-input" placeholder="Schreibe in ${thr.name}..." rows="1"
    style="flex:1;background:var(--bg4);border:1px solid #0088cc44;border-radius:20px;padding:10px 16px;color:var(--text);font-family:var(--font);font-size:14px;resize:none;outline:none;line-height:1.4;max-height:120px;overflow-y:auto"
    oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"
    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMsg();}"></textarea>
  <button onclick="sendMsg()" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0088cc,#006699);border:none;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">✈️</button>
</div>
<script>
(function(){
  const THREAD_ID='${threadId}';
  const MY_UID='${myUid}';
  function timeStr(ts){const d=new Date(ts);const h=String(d.getHours()).padStart(2,'0');const m=String(d.getMinutes()).padStart(2,'0');return h+':'+m;}
  function initial(n){return(n||'?').replace(/^@/,'').slice(0,1).toUpperCase();}
  const COLORS=['#ff6b6b','#cc5de8','#4dabf7','#ffd43b','#00c851','#ff9f43','#0088cc','#e64980'];
  function color(n){return COLORS[(n||'?').charCodeAt(0)%COLORS.length];}
  let lastCount=0;
  function render(msgs){
    const el=document.getElementById('thread-msgs');
    if(!el)return;
    if(!msgs||!msgs.length){el.innerHTML='<div style="text-align:center;color:var(--muted);padding:40px 0;font-size:13px">Noch keine Nachrichten — schreib etwas!</div>';return;}
    if(msgs.length===lastCount)return;
    const atBottom=window.innerHeight+window.scrollY>=document.body.scrollHeight-60;
    lastCount=msgs.length;
    el.innerHTML=[...msgs].reverse().map(m=>{
      const c=color(m.name||'?');
      const nameHtml=m.uid?'<a href="/profil/'+m.uid+'" style="font-size:12px;font-weight:700;color:'+c+';text-decoration:none;margin-bottom:3px;display:inline-block">'+(m.role?m.role+' ':'')+m.name+'</a>':'<span style="font-size:12px;font-weight:700;color:'+c+';margin-bottom:3px;display:inline-block">'+(m.role?m.role+' ':'')+m.name+'</span>';
      let mediaHtml='';
      if(m.type==='photo'&&m.mediaId)mediaHtml='<img src="/api/tg-file/'+m.mediaId+'" style="max-width:100%;border-radius:10px;margin-bottom:4px;display:block" loading="lazy">';
      else if(m.type==='sticker'&&m.mediaId)mediaHtml='<img src="/api/tg-file/'+m.mediaId+'" style="width:80px;height:80px;object-fit:contain;margin-bottom:4px;display:block" loading="lazy">';
      else if(m.type==='video')mediaHtml='<div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:10px 14px;margin-bottom:4px;font-size:12px;color:var(--muted)">🎬 Ein Video wurde gesendet. Videos können hier nicht abgespielt werden — um dieses zu sehen, besuche bitte die Gruppe auf Telegram.</div>';
      const textHtml=m.text?'<div style="font-size:13px;line-height:1.5;word-break:break-word">'+m.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>':'';
      return '<div style="display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0">'+initial(m.name)+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">'+nameHtml+'<span style="font-size:10px;color:var(--muted)">'+timeStr(m.timestamp)+'</span></div>'+mediaHtml+textHtml+'</div></div>';
    }).join('');
    if(atBottom)window.scrollTo(0,document.body.scrollHeight);
  }
  async function load(){
    try{const r=await fetch('/api/thread-messages/'+THREAD_ID);if(r.ok){const d=await r.json();render(d.messages||[]);}}catch(e){}
  }
  window.sendMsg=async function(){
    const el=document.getElementById('thread-input');
    const text=el.value.trim();if(!text)return;
    el.value='';el.style.height='auto';
    try{
      const r=await fetch('/api/send-thread-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,thread_id:THREAD_ID})});
      const d=await r.json();if(!d.ok){el.value=text;alert(d.error||'Fehler');}
    }catch(e){el.value=text;}
    setTimeout(load,800);
  };
  load();setInterval(load,10000);
})();
</script>`, 'messages');
    }

    // ── TELEGRAM GRUPPE THREAD-LISTE ──
    if (path === '/nachrichten/gruppe') {
        const topicsData = await fetchBot('/forum-topics');
        const threads = topicsData?.threads || [];
        const botData = await fetchBot('/data');
        const adminUser = botData?.users?.[myUid];
        const isAdmin = adminUser && String(adminUser.role || '').includes('Admin');
        const lastRead = botData?.threadLastRead?.[myUid] || {};
        const threadCards = threads.map(thr => {
            const lastReadTs = lastRead[String(thr.id)] || 0;
            const msgs = (botData?.threadMessages?.[String(thr.id)] || []);
            const unread = msgs.filter(m => m.timestamp > lastReadTs).length;
            const lastMsg = thr.last_msg;
            const lastMsgText = lastMsg ? (lastMsg.type === 'photo' ? '📷 Foto' : lastMsg.type === 'video' ? '🎬 Video' : lastMsg.type === 'sticker' ? '🎭 Sticker' : (lastMsg.text || '').slice(0, 45)) : 'Noch keine Nachrichten';
            const lastMsgName = lastMsg ? (lastMsg.name || '') : '';
            return `<a href="/nachrichten/gruppe/${thr.id}" style="text-decoration:none;display:block">
  <div style="background:var(--bg2);border-radius:16px;padding:16px;position:relative;border:1px solid var(--border2);transition:transform 0.15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
    ${unread>0?'<div style="position:absolute;top:10px;right:10px;background:#0088cc;color:#fff;border-radius:50%;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;padding:0 4px">'+unread+'</div>':''}
    <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#0088cc22,#006699aa);border:2px solid #0088cc44;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 10px">${thr.emoji}</div>
    <div style="font-size:14px;font-weight:700;color:var(--text);text-align:center;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${thr.name}</div>
    <div style="font-size:11px;color:var(--muted);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${lastMsgName?lastMsgName+': ':''}${lastMsgText}</div>
    <div style="text-align:center;margin-top:6px;font-size:10px;color:#0088cc88">${thr.msg_count||0} Nachrichten</div>
  </div>
</a>`;
        }).join('');
        return html(`
<div class="topbar" style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0088cc,#006699)">
  <a href="/nachrichten" style="padding:8px;color:#fff;display:flex;align-items:center;text-decoration:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
  </a>
  <div style="flex:1;text-align:center">
    <div style="font-weight:800;font-size:15px;color:#fff">✈️ Telegram Gruppe</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;gap:4px">
      <span style="width:5px;height:5px;border-radius:50%;background:#4fff91;animation:pulse-dot 1.5s infinite;display:inline-block"></span>Live
    </div>
  </div>
  ${isAdmin ? `<a href="/nachrichten/gruppe/neu" style="padding:8px;color:#fff;text-decoration:none;font-size:22px;line-height:1">+</a>` : '<div style="width:36px"></div>'}
</div>
<div style="padding:12px 12px 100px">
  ${threads.length ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${threadCards}</div>` : !topicsData ? '<div style="text-align:center;padding:60px 20px"><div style="font-size:36px;margin-bottom:12px">🔌</div><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">Bot nicht erreichbar</div><div style="font-size:12px;color:var(--muted)">Stelle sicher dass der Telegram-Bot läuft.</div></div>' : '<div style="text-align:center;padding:60px 20px"><div style="font-size:36px;margin-bottom:12px">✈️</div><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">Keine Threads gefunden</div><div style="font-size:12px;color:var(--muted);line-height:1.6">1. Telegram-Bot neu starten<br>2. Gruppe → Bearbeiten → <b>Topics aktivieren</b><br>3. Seite neu laden</div><button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#0088cc;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer">🔄 Neu laden</button></div>'}
</div>
<script>
(function(){
  async function refresh(){
    try{
      const r=await fetch('/api/forum-topics');
      if(!r.ok)return;
      const d=await r.json();
      if(d.threads&&d.threads.length)location.reload();
    }catch(e){}
  }
  setInterval(refresh,10000);
})();
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
        const convHtml = `
<a href="/nachrichten/gruppe" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border2);text-decoration:none;background:rgba(0,200,130,.04)">
  <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0088cc,#00c6ff);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">✈️</div>
  <div style="flex:1;min-width:0">
    <div style="font-size:14px;font-weight:700;color:var(--text)">Telegram Gruppe</div>
    <div style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${feedPreview}</div>
  </div>
  <div style="width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse-dot 1.5s infinite"></div>
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
    <div style="font-size:22px;font-weight:800;color:#fff;font-family:var(--font-display);line-height:1.15">Willkommen bei<br><span style="background:linear-gradient(90deg,#ff6b6b,#cc5de8);-webkit-background-clip:text;-webkit-text-fill-color:transparent">CreatorBoost</span></div>
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
      <div style="font-size:13px;font-weight:700">XP Shop — Coming Soon</div>
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
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(0,200,130,.2),rgba(0,150,100,.1))">🛍️</div>
    <div class="action-card-title">XP Shop</div>
    <div class="action-card-sub">Coming Soon</div>
  </a>
  <a href="/explore?tab=newsletter" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(255,165,0,.2),rgba(255,130,0,.1))">📩</div>
    <div class="action-card-title">Newsletter</div>
    <div class="action-card-sub">Bleib informiert</div>
  </a>
  <a href="/einstellungen" class="action-card">
    <div class="action-card-icon" style="background:linear-gradient(135deg,rgba(255,107,107,.2),rgba(204,93,232,.1))">📌</div>
    <div class="action-card-title">Reel anpinnen</div>
    <div class="action-card-sub">Zeig deinen besten Reel</div>
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
            shop: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">🛍️</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">XP Shop</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Kommt bald!</div></div>`,
            newsletter: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">📩</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Newsletter</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Inhalte folgen bald!</div></div>`
        };

        const tabs = [
            {id:'allgemein',label:'Allgemein'},
            {id:'ranking',label:'🏆 Ranking'},
            {id:'tipps',label:'💡 Tipps'},
            {id:'regeln',label:'📋 Regeln'},
            {id:'shop',label:'🛍️ Shop'},
            {id:'newsletter',label:'📩 Newsletter'},
        ];

        return html(`
<div class="topbar">
  <div class="topbar-logo">CreatorBoost</div>
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

server.listen(PORT, () => console.log('🌐 CreatorBoost App läuft auf Port ' + PORT));
