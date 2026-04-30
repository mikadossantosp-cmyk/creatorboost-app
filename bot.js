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
const APP_VERSION   = Date.now().toString();

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
<link rel="apple-touch-icon" href="/icon.jpg?v=${APP_VERSION}">
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
let _appVersion=null;
async function checkAppVersion(){
    try{
        const r=await fetch('/api/version');
        const d=await r.json();
        if(!_appVersion){_appVersion=d.version;return;}
        if(d.version!==_appVersion){
            let banner=document.getElementById('update-banner');
            if(!banner){
                banner=document.createElement('div');
                banner.id='update-banner';
                banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;text-align:center;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px';
                banner.innerHTML='🚀 Update verfügbar! <span style="text-decoration:underline">Jetzt aktualisieren →</span>';
                banner.onclick=()=>{window.location.reload(true);};
                document.body.prepend(banner);
            }
        }
    }catch(e){}
}
checkAppVersion();
setInterval(checkAppVersion,60000);
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
        return res.end(JSON.stringify({name:'CreatorX',short_name:'CreatorX',start_url:'/feed',display:'standalone',background_color:'#000000',theme_color:'#ff6b6b',icons:[{src:'/icon.jpg?v='+APP_VERSION,sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icon.jpg?v='+APP_VERSION,sizes:'512x512',type:'image/png',purpose:'maskable'}]}));
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

    if (path === '/api/version') {
        return json({version: APP_VERSION});
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
      return '<div style="display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;position:relative;overflow:hidden">'+ini(m.name)+(m.uid?'<img src="/appbild/'+m.uid+'/profilepic" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()" loading="lazy">':'')+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">'+nameEl+'<span style="font-size:10px;color:var(--muted)">'+t(m.timestamp)+'</span></div>'+body+'</div></div>';
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
