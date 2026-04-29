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
        return res.end(JSON.stringify({name:'CreatorX',short_name:'CreatorX',start_url:'/feed',display:'standalone',background_color:'#000000',theme_color:'#ff6b6b',icons:[{src:'/icon.jpg?v=4',sizes:'192x192',type:'image/jpeg',purpose:'any maskable'},{src:'/icon.jpg?v=4',sizes:'512x512',type:'image/jpeg',purpose:'any maskable'}]}));
    }

    if (path === '/icon-192.png' || path === '/icon-512.png' || path === '/apple-touch-icon.png' || path === '/icon.jpg') {
        const buf = Buffer.from('/9j/4QFQRXhpZgAATU0AKgAAAAgABQEAAAMAAAABBDgAAAEBAAMAAAABCSQAAAExAAIAAAApAAAASodpAAQAAAABAAAAcwESAAQAAAABAAAAAAAAAABBbmRyb2lkIEJQMkEuMjUwNjA1LjAzMS5BMy5TOTIxQlhYU0RDWkIyAAAFkAMAAgAAABQAAAC1kpEAAgAAAAQ1NTMApCAAAgAAACUAAADJkBEAAgAAAAcAAADukggABAAAAAEAAAAAAAAAADIwMjY6MDQ6MDkgMDk6MjM6NDEAMDkwN2MwOGMtMTI2OC00YjJmLTgyNDQtYzM1ZmQ5ODBkNzk3ACswMjowMAAAAwEAAAMAAAABBDgAAAExAAIAAAApAAABHwEBAAMAAAABCSQAAAAAAABBbmRyb2lkIEJQMkEuMjUwNjA1LjAzMS5BMy5TOTIxQlhYU0RDWkIyAP/gABBKRklGAAEBAAABAAEAAP/iAhhJQ0NfUFJPRklMRQABAQAAAggAAAAABDAAAG1udHJSR0IgWFlaIAfgAAEAAQAAAAAAAGFjc3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAD21gABAAAAANMtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACWRlc2MAAADwAAAAZHJYWVoAAAFUAAAAFGdYWVoAAAFoAAAAFGJYWVoAAAF8AAAAFHd0cHQAAAGQAAAAFHJUUkMAAAGkAAAAKGdUUkMAAAGkAAAAKGJUUkMAAAGkAAAAKGNwcnQAAAHMAAAAPG1sdWMAAAAAAAAAAQAAAAxlblVTAAAARgAAABwARABpAHMAcABsAGEAeQAgAFAAMwAgAEcAYQBtAHUAdAAgAHcAaQB0AGgAIABzAFIARwBCACAAVAByAGEAbgBzAGYAZQByAABYWVogAAAAAAAAg90AAD2+////u1hZWiAAAAAAAABKvwAAsTcAAAq5WFlaIAAAAAAAACg7AAARCwAAyMtYWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAkkBDgDASIAAhEBAxEB/8QAHwABAAAFBQEAAAAAAAAAAAAAAAIDBAkKBQYHCAsB/8QAhRAAAQMDAgQDBQUFBAQDCgE9AQACAwQFEQYhBxIxQQgJURMiYXGBFJGhsfAKFTLB0SNC4fEWJDNSFyViGBkaNDhDU3J3tiY1RFRYY3R4gpKip6i309g2N0VKVVdoaXN1doOEh5OVl7KzyNLUJzlWWWRllJiZtdbX4ufoKGajpKW0wsPE/8QAHQEBAAAHAQEAAAAAAAAAAAAAAAIDBAUGBwgBCf/EAEYRAAIBAwIEAwYFAwMDAwIEBwABAgMRIQQxBRJBUQZhcQcTIoGR8DKhscHRFOHxI0JSCBViJDNyFkMXNIKisiVEU5LCk//aAAwDAQACEQMRAD8A8/8AREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAERZAH7PV5O9F5tHip1FS8Vay92Xws+Hu1WLV/G6s0/O+3XvWNw1FW19NobhRZLyxrn2SbWEllv1xv18pWOrrZpbTt3gtstuvl1s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iIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiKLlce34j+q9Sb2Tfom/wBAQoouR3p+I/qnI70/Ef1ULaWG0n2bBCii5Hen4j+q++zfjONh8R/VRJOX4U5emf0BAii5Hen4j+qcjvT8R/VROnNbwmvWL/gEKKLkd6fiP6r4QR1/MKA8uu6+p8REQ9CIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAp7eg+Q/JSFPb0HyH5KdSkotp9nb8v48wfVCXNG2fzX3I9R94UtzXbuwcZJz2xlS/cSnJvvu+nTy/L7YmBwOcHp1UTQXAkbgDKhjaXD3Rk75x8+6mMdyNLcdT6dO/r69tvnlTpUpKCVFPmxfleXldcYvuvqiGUnFXXf8iEtI6jGei+KZkuyAR8cgj0+JCluHL1wPqoYLUqSVRSSur82MK2M2vjtfJBzzkrb7Zz+t7K4UuTt9f5KPI9R94UEnb6/yU2o4KMl8PN2xe/09Pz+UUY2s3v+RLREVIRhERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREARfcE9AT9F95Xen5L2z7P6AhRfS0jqOqYPofuK8aa3VvUHxF9wfQ/cV8QBT29B8h+SkKoaDhux3AA2O5x0+a9WJRTw7rDx1BId1PzP5qfC9rQefLhggNHfIxnHXb1Hp8FKcx/MRyuzknHKemevRajDRTVXsGUkM1RM8AGOKKSR/MSAAGsDnE7jOB8B2zMq1XRST+FPLk7JJLrn0z5X3CTeyv6ZKeFspz7NmxHXB2+eNh+aqG80bOV8bSck8xGSc/H+WfquxvCnw48R+JlfS221aevkAqXNa2aS2VkMbubGD7SWlLCPqevcjCu98HPIP8AEJxcttNcaWR1PDUAOYJ62gp3NJ5c+7PTA5325u3yWMarxpwng9Ry1PEKFNqShytuo08dk1fZYxbzK/R6CvqpuPuanLy3UnFpPKtlrHXqn1Rj5yNIaHjl3I/hO4GM4IHb132PUKCTlPLnpy74AyfTOfvWQ9xG/Z/uPfDe3V9xuVS+dtJDJLyR1lvmyGDm2bHTZJx2HwxlWcuK/hm4gcLL1W2W56fvUslNJLyzRW6rnjcyN2N5YqX2YzsfjnqBup+l8b8J4pNQoa6lNytZfhvhZzbv1733KivwutSu3TlZK7xJ2eMX9Xb7Z1ncxrt2Y2+X16en+fqpbnZwN8Dpnr9Vq09qr6CQsrqKqo3EEhlTTzQFwAwS1ssbCRuc4WlvZjoD8R6fTqr7BRq03WhOE43v8LTVnbZpvv8A3zi1Si4ycWmn2s/3yS0X3BxnBx64OPvQAnoFDvhZe1vPsQnxF9LSNyE5TjONv19V7ZrdNfJj7+ux8REXgCImD1xt6r2zeyb+TAREXgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgJjOpP6/WymKXGdz9Dj5f5qYTkk+pyiVRv4E2sX3te/X5flfyJUnaV15X/j6WC+jYjYH4FfEXqrVoKzXW2V6Y/P6vyJsaySz029MW6epESDjAx8u/4KL38AAY2x2H57g/5qWNipntPh/L8N/z/optOdCor6i/NHEUrq6w+nR+m1/nM+CrZ3XVZW17dFb5Ye5DyuHb+f5IGuPb79l95z8vpnH3nftvt32UJJOdz8jnf6dP1solV0tN3hFva17t9LvPXzPeWEbfh+Sdumcv5+jXUiLcA77jG3zOFVMfzU7GxjD4JDKT126Drt16+mDt60ZAx1BPyP6/L6qpY4MLi1pIlYIyeo5gCTj598b79fWXVlHURVSMeV6dqTthSu1a9732l/BDyQqThFbyb6PrbbHftn5YNUoqOrvFZS01E18lTVvjpWtazmJfK4NGwaepd6Dqr/3lteVFrrjbqnTmqq2gkktFI6GpuNNUU7AyVrHxVDgTIBsYontPKDjm+7hzyq/AFevEzrCC+GjdPbrPIa2RpgkkaW0bmTHJZluOUdwR12G5GfD4duCGjuFektMWjT1ofZrrbrdFT3KoMgEdXO17uaVsUbGFgMZDMPJO3oVzp7WfalHhyq8K0db/AFeWdKtKFstpJxW9klfKynbqbG8P+E41qcdRNK1oys9lmPfF18+tyn4TeBrgDpzTdptdBwxtNHfrXTxx1dc3HtJZWgEuwWhvRp6d+++V3C0hovTulm/YrLQQ0DYGNayniYCGluxIOMbloJ9FuizWeprnROjcGNGPaOaCOcYHdpB6A9TuN9lyTS2OGH3I6OUMLRmoJDhzYHMcn3+udj3K5crVuI8WSr+9rSUqin+Oby7Prfa3+DOoU9HooKi40+a3Leyxts9sP6bHBeo9IWnUcc9Pf7NFXUzmOa4P2DmnIOzRndvX06ALptxJ8EXh61taLvLcOF1qkll9uwV8hy+OV8ZA90guIyck9Nuu2Vc8rtPthic+OtgYXD+F8bndRtvuNt/u9MEcX3+2EB7Kx7Z6eVvs2sp2+yDpXghmegLnHPUd+vXNPxLiXEOHQpclavCULN2qTi8WvtJZtsv1ZFpdFpta3G0HzXS+FbYu3bKt2/l3wi/MB8lO+1tNqTihoipNq0xYIK+Wkt1NQxvY+J0UlVExrsF+5gcwHGQT0ysTLVem6jTdUbPX0VRR3OjqamnqvbwyROkMUr2NID2tBGG9G9OmThet5xBsjL3YavS1dbHRWUubBVGqayVkjAHD3iQ4nLJHggsd1ydtlha+dL4KLdS6wGp+H1qpKOzW11bUTPoKRkbZDI0uJe+GOEO989XA+uei6T9jvtQWrWn4HxCq580eWnOck5Rtmzby028u909na6eHeJfCUdM56umlaKysrD5W9ms+n0yYsBMjcQu2BI/8uPr/AIfJfMNiPL1J3OPj6Z+Q26b/AEVdW0VRS19TSzNIkpJpI3DvmKRzDvv1c07Hvn1yqF2JC5w6tyD3wPTb44H636h07jJ88JJ3zZNWfNZ39Wn9tI1dOM6Ve1mvis+qb2vbNunyIiznGR9/fGPTr+ioi0tjIPvdMjpgD+fT1+HbEtspZt6EY+Y6A59eh2zsOqnyHniLumwx8N9+m3r9/wB3tSeonUTjBuMXhxSt0y+nbd7XRK1Em5xSWMLfvZLHm+uepRr4RkEfBfUUFSVRyXMrK62WOnX76kSpuN3b542+pJ3aQSP1/JRF4II33B9P6qPI9R94UDgzBO2d+/f71NjWnFWvdNNZ3z5j7+hLREUoBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREBPhfG0ODxknGDtt89j+vVVTY3NHM32b2nqMZOCexPr9Mnr1wqaF7WMla6PmLwA1xbnl+Wx6qZHHOC3kcHb7M5sl3cDAycnPT7j6AfWtgcf4JOYEl2DtjO+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spb5qRtzraeO30gp2z09vYHfZmysqOVjiwDkc8OJcQcjfbW/AOEcf8U8cp6SUUpU5xglUukoqUVhvFk9/IyerPQ8KoTnQv7ur8bwk27Le3z+d7blg/zkfEbPXa81Tw4dOeWludUxrOc7CnqOUbZ/5X47hY35Li45HXOD+We+Nv5Lsv4m/ENfPEnxMvfEbUMTqOa6VVVP9nc2JpY6okEmCIHOYTkdjjrvsusrzvsenz2O362X0E8AcB0/hrhlHSV4OVeUYSquDTiq1rLbdRu3h4vl3NLeI9XDiOqlOlhJu3PZPffH6PPkAxxz16DJ7fAHfp07Hf5KlIIJz6qtjfjI657H9fh6Z+lG/wDiP0/ILLKs6sq041G3bMU+ixb8rfVmMwf+3tf9c/f24URFCRhERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAU1hyMen88qUpkff6fzTl5sd/8kM/wv5fqic04OfhhRMaXuBBwWnm3P3diSRupanwBpcQ4kZaQ3Hd3YH4KfSgql44urt9+n9l9smVJ2pqKau7W65Vt/tfoVMID6hxkALeWQ8vqWjrv1xj9brkjhfwu1VxU1DBadK2iuus7qqCA09vidJNySSNa7l5S0tw05PyJ9Vsa00rqq5UlHIwtdM4U7A1u7zLIGA74zkuxgZ2z13WWr5KHgrjtF6tPFG8WRtxppRDUOir4A+ny6IMbgFo6EZyT1B7LXvjjxdp/CHCtXqqlRRqKnKVCDxGfJbnXfGEuzaaL14c4ZU1+spXg3S54qWHlXV+m1nv0tfzXeXyr/KT0rwdsOmONepIQ291wgnrbXfHyTln2URyta6lna+MZdMep7b/AMKyDrJorT1oghtdltOnaIsndVukordS08zmynOz4o2uBzg5z36eur6ftkTLa2kjpYqakEbY46OJvLBEGhozGwfwkgAHfcY+a37bLTG+cSNp42yGNkPM1uMNbjBaQCQeuOn4LgDxf414z401E50K9Rxk2vhk9r7PLultbba3nvfR8K0WiimqcFZKzslba/09MO3QkUVqkDREDEO3M8Z337kZG5+4hbwtdoNN/wCHFB7/ALrgYwXAEYONtiM5z+Pruez2FpYMsLvi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eU3jmd4KLULO3Lst5NtK0x8AhwtOu4rlti91jFlnr36vBvbzUvNI0h4etPam0XofUUFu4ginfTNno3NZLTPiYWuYzDjG8SRkNJxtnG3Ree94ivEJq7xA8Q7vr3V1fUVV1qKqRxllmdKalkb5WRAge6Mtfnp036qPxGeJDiT4htZ12seIGopLrcKmpnl5Ig+mDfaOIw5jZHseSAMZ6b7ZK63tkAlZJOwiPmG5I94ZPffPqc9/nt0H7PPAnC/DuhhW1qhV4nUp3lVtaXNJXaUnmSz5K97XSTMK43xL3t6NNqye173Stm62z2vf9E+XMM8o53PLgAdi04znYnfG2cdj9KNs5ZGWMHK4nJdnfGOn37+in1Tub32A+xOWg/3eYbH5ndUKz1qSbUnzWdk//FYiu2FjGDGqako/Fvdu3ZdiYXtLCCwc5IPP326/epaIhGEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEGxB9ERAalE3mDWn+JzC9pzsGjrn5frGy7k+DLiw7hfxGoatxeRVV1IAYyGlvK9oy7J9e/VdN6f/AK08nYRvb9+cDHx/MffqdkutTZqyKvpnlklPKyRpyQcteCMY3zsPpj4K3ce0MOP8H1WgqrmjUpSptJtO3w9nfdXflfPa48Mqxhqac5YVN+m1vPPVdO56r3gq1DLqXgvpDUclXC6lqqSFzKnJMT3Clo3OiDs+8+MPxIM7HHyVxXTV9np4vbvcYKduQyeTaN+MnLTnGCMH5eqwQ/Kq81r/AEYmsPDriXfZItKUzqaCjhkqCSyZ7msqOZkrgxoMcLMHvgDGNzmR8L+L+mOIWmqbUFrv9tlsM8DJYWOrYTJh0YePcEhH8BG2xGD06L55eKfB/GvDXHdRS0NGrSozqyd5wk7xclazafo87b9je/DOO6bWaKnpNS6cqXLGOLLFks/TuvPex3BqNVMkBcblAwlh9m173Ze3GxaOmOw69s5yuFNUahkmlnYXktPMQ8E8pByTg5z6eu/zWny6ztMtG5zJLYTGQymkdJHzeyIOC452+C4D4r8WNN6Lss96vF5tcMELDI9sdXDzAAuL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M9eoXBbZ5WdHH67/AIdFE2qma4uDtyCDtjY9en37eiy7h3hPgXC6dN6XR0Y16buqjpJu6tZ3ysZ2SffJZ9XxjiesbVTUPkfRN9136b/w7K9dPVzVLGxPy58ewcTkgNJzjYKlcDgZOeufX8evTr/NSGzPa4uBGTnO3r1/rv3XwyE/4nP3dMLIaTnRhKnTajGdr274vj9P5KSLpcqclJ1Nrvbpd/S/T5XsTgSO+wzgevr+fU/TO6hyXOI77fjnb4f4qTzu9fwC+BxBz9/xUdFqNRTq/Ftne1vXy8sEhRSlzLa90mts+pVOaAAR8vzX0sxGHd8j6g5+5U5kcR3+pyvhkcRj+Z/AdlHXlCco+7VkvxXw3nbztm5HU+JxttHLv52/SxAiIpR4EREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAR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4nv0+v8ATqtSgc5hOckkep+CtrRea54QAQf9PbV0yf8AjO3/APn3/DrjstRi81/wfs3Ou7SSR/6srefzl/HP3hSvg++Y95H2/Ty8+/6L5XJ4Z3Ajf0GM/Hr0/R6/HW4K2WNri3OTG8EHfLC08/1xnGf6q1zJ5sng/GeXXdqBzti52/8AA+16H8MrR7p5tPhNjtl1kpNd2+WpgtdwlhZHcqBznSR0kr2ANbKScuDfv6L3mgla+Mbp+SW/yPHF2yvXZrp9/eO7niQ8RGheBOh6S5akvMdnZX2q4VVOJasUpmfTtkDACGkPPtG8pBGOy87TzUvM1114ldW3/h9Hd6u36f0/VVZtNRBM6mFQKkywnEtLO10oEbWn3mgDOd9lzB5pfmp3Pj1JdNM6NvFXPa7fLNT0Msczy2KGWQvcInRuLWtdncjY/XbHLvl7rL/I2suD3TVbpJHzyvJdI7mJI53HfYnodvwCp6k4xTtK7/ffC9Gvn5EMKd2m8Lth5VnffPni132NNl9tLLIXTGUPJlmnLnOc90hJeXvJLnZdkkuJ3Od1A888bnOaTAz3WuGAC8D3dx6/Lt8VIDnAEAkAjBHYhfC53syzJ5N3cufdzjrjplUTqyTssXxfZWdr26/ngqo027PbHaye13jv81jBToiIeBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBa5b6y52mMVVBWPpfbdTDIA88uSA5pBIx9xWhqIPc3GD0OR+vovU2ndYaPGr4x537fz2N6x6u1VIDC29VsQxkgytZnO395nfrtt9Ek1rqTIbJcah7mNDOYv3IHfZo/Wd8LZ0tRLM4OkeXODQ3Jx0aMD8FC+aR5Bc7OAANh0HRec03vL9Xsku6++5DyLy8t8d83Tf7G7/wDTTUH/AInz/wDlf+C+HWeoce7cJ9uv9p+QI/XdbP53ev4D+ic7vX8B/RLztiXbv0+b8z1RSd8fn+7Zu8a21KCD+8Kjbt7X/BTBrrUoORX1H1l/wWyy4nYn8AviXn1l+r/dERvU651K7rXTj/3L+exUTdcanbzCO51MRkY6Nzo5QXFjxh7ccpyHNyCtkKJj3RuDmnDh0K8bm/8Ad+v8vY8aumjWjWVsrpIPbOc6U5e57gC4/wDKJ2+7HXfbKoHc8JewtDucYcWnmDd9jkbdT3+ipzNIXF5cS49SvjZZGh7Q4gSbP+PfqoUpq12mvm842b6WWPu3kVbf8uv1X9iYvjuh+R/JSuZw7/z/ADTmce/4D+inRcEndNtrfFun987/AKk5TSVrPC7+n9/t4hREUBLCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiI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yeGDVIhyxhZUyaL1DUNcyMGmAYHMw10QFwTx3eZP4ivH5qWiqOJ1yotM8N9O10tdovhBpF1XT6OsNU6OaljvNydVTS1uqdVmhnlpZdQXd5FNHUV8Ngt1hoLhV0ElvtEQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREBuTR2sdV8PdU2DXGhtRXjSWsNLXSkvenNS6fr6i13my3ahlE1LX26vpJIqimqIXtyHRvAc0ujeHRvc05T3DDzpfCf4qPCFxA4I+ZfpGSq1rb9LywQVemdG113oOLlzp6OaGy6h0j+5aGog4X8VqCpd9qfX1k1h0nTVjjdLLebdS1s2l7dieogCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiID/2QAAUQwUAAAAU2Ftc3VuZ19DYXB0dXJlX0luZm9TY3JlZW5zaG90AAChDREAAABDYXB0dXJlZF9BcHBfSW5mb2V5SmpiMjF3SWpvaWIzSm5MblJsYkdWbmNtRnRMbTFsYzNObGJtZGxjbHd2YjNKbkxuUmxiR1ZuY21GdExuVnBMa3hoZFc1amFFRmpkR2wyYVhSNUluMD1TRUZIawAAAAIAAAAAAFEMlwAAACYAAAAAAKENcQAAAHEAAAAkAAAAU0VGVA==', 'base64');
        res.writeHead(200, {'Content-Type':'image/jpeg','Content-Length':buf.length,'Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache'});
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
<div id="msgs" style="padding:12px 12px 160px;display:flex;flex-direction:column;gap:10px"></div>
<div style="position:fixed;bottom:calc(60px + var(--safe-bottom));left:0;right:0;padding:10px 12px;background:var(--bg2);border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;z-index:5">
  <textarea id="inp" placeholder="Schreibe etwas..." rows="1" style="flex:1;background:var(--bg4);border:1px solid #0088cc44;border-radius:20px;padding:10px 16px;color:var(--text);font-size:14px;resize:none;outline:none;line-height:1.4;max-height:120px" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}"></textarea>
  <button onclick="send()" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0088cc,#006699);border:none;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">✈️</button>
</div>
<script>
(function(){
  const TID='${threadId}';
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
      return '<div style="display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0">'+ini(m.name)+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">'+nameEl+'<span style="font-size:10px;color:var(--muted)">'+t(m.timestamp)+'</span></div>'+body+'</div></div>';
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
        if (!threads.length) {
            threads = Object.keys(threadMsgs).map(tid => ({ id:tid, name:tid==='general'?'Allgemein':'Thread '+tid, emoji:tid==='general'?'💬':'📌', last_msg:threadMsgs[tid]?.[0]||null, msg_count:threadMsgs[tid]?.length||0 }));
        }
        // Merge real names from Telegram API
        threads = threads.map(t => {
            const api = apiTopics[String(t.id)];
            if (api?.name) return {...t, name: api.name, emoji: api.emoji || t.emoji};
            return t;
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
    <div style="font-size:14px;font-weight:700;color:var(--text);text-align:center;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${thr.name}</div>
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
<script>setTimeout(()=>location.reload(),10000);</script>`, 'messages');
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
