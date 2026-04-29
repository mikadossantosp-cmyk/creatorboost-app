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
