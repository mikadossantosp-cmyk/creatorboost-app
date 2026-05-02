// patch-bot.js - Build-time Patches fur bot.js (build #2026-05-02-3)
const fs = require('fs');
const path = require('path');

const BOT = path.resolve(__dirname, 'bot.js');
let src = fs.readFileSync(BOT, 'utf8');
let changed = false;
const BT = String.fromCharCode(96);

function tryPatch(name, regex, replacement, alreadyMarker) {
    if (alreadyMarker && src.includes(alreadyMarker)) {
        console.log('[patch-bot] ' + name + ' bereits gepatched');
        return true;
    }
    if (regex.test(src)) {
        src = src.replace(regex, replacement);
        console.log('[patch-bot] ' + name + ' gepatched');
        changed = true;
        return true;
    }
    console.warn('[patch-bot] WARNUNG: ' + name + ' Pattern nicht gefunden');
    return false;
}

if (!tryPatch('Regeln-Tab', /regeln: `<div style="padding:48px[\s\S]*?`,/, "regeln: require('./regeln-tab'),", "regeln: require('./regeln-tab')")) {
    console.error('[patch-bot] FEHLER: Regeln-Patch nicht gefunden'); process.exit(1);
}

tryPatch('DM-Liste', /const convHtml = `\s*\n<a href="\/nachrichten\/gruppe"[\s\S]*?<div class="empty-sub">Schreibe jemandem!<\/div><\/div>'\);/, "const convHtml = require('./chat-list-render')({ myConvos, botData, myUid, feedPreview, totalThreadUnread, ladeBild, adminIds, onlineUids: typeof sessions !== 'undefined' ? new Set([...sessions.values()].map(s => String(s.uid))) : new Set() });", "require('./chat-list-render')");

tryPatch('Threads-Liste cards', /const cards = threads\.map\(thr => \{[\s\S]*?\}\)\.join\(''\);/, "const cards = require('./thread-list-render')({ threads, threadMsgs, lastRead, communityFeed, isAdmin });", "require('./thread-list-render')");

tryPatch('Threads-Liste Container', /<div style="padding:12px 12px 100px;display:grid;grid-template-columns:1fr 1fr;gap:10px">\$\{cards\}<\/div>/, '${cards}', null);

const CHAT_DETAIL_REPLACEMENT = "const msgsHtml = require('./chat-detail-render')({ msgs, myUid, otherUid, otherUser, ladeBild, otherOnline: typeof sessions !== 'undefined' ? [...sessions.values()].some(s => String(s.uid) === String(otherUid)) : false });";
if (src.includes("otherOnline:")) { console.log('[patch-bot] Chat-Detail bereits'); }
else if (src.includes("require('./chat-detail-render')")) { src = src.replace(/const msgsHtml = require\('\.\/chat-detail-render'\)\([^;]*\);/, CHAT_DETAIL_REPLACEMENT); console.log('[patch-bot] Chat-Detail upgraded'); changed = true; }
else if (/const msgsHtml = msgs\.map\(m => \{[\s\S]*?\}\)\.join\(''\);/.test(src)) { src = src.replace(/const msgsHtml = msgs\.map\(m => \{[\s\S]*?\}\)\.join\(''\);/, CHAT_DETAIL_REPLACEMENT); console.log('[patch-bot] Chat-Detail initial'); changed = true; }

const OPTIMISTIC_SEND = "async function sendMessage(image, audio, text=''){const tmpTs=Date.now();insertOptimisticBubble(tmpTs,text,image,audio);requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}));try{const res=await fetch('/api/send-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'${otherUid}',text,image:image||null,audio:audio||null})});const data=await res.json();if(!data.ok){markBubbleFailed(tmpTs,text,image,audio);return;}markBubbleSent(tmpTs);}catch(e){markBubbleFailed(tmpTs,text,image,audio);}}function insertOptimisticBubble(ts,text,image,audio){const c=document.getElementById('chat-msgs');if(!c)return;const empty=c.querySelector('.chat-empty');if(empty)empty.remove();const div=document.createElement('div');div.className='chat-row chat-row-me chat-row-last';div.dataset.optimistic=ts;const escT=(text||'').replace(/[<>&]/g,c=>({\"<\":\"&lt;\",\">\":\"&gt;\",\"&\":\"&amp;\"}[c]));let inner='';if(image)inner='<div class=\"chat-img-wrap\"><img src=\"'+image+'\"></div>'+(text?'<div class=\"chat-img-caption\">'+escT+'</div>':'');else if(audio)inner='<div class=\"chat-audio\"><div class=\"chat-audio-info\"><div class=\"audio-dur\">🎤 Sprachnachricht</div></div></div>';else inner='<div class=\"chat-text\">'+escT+'</div>';div.innerHTML='<div class=\"chat-bubble-wrap\"><div class=\"chat-bubble\" style=\"opacity:.7\">'+inner+'</div><div class=\"chat-status pending\">Wird gesendet...</div></div>';c.appendChild(div);}function markBubbleSent(ts){const el=document.querySelector('[data-optimistic=\"'+ts+'\"]');if(!el)return;const bubble=el.querySelector('.chat-bubble');if(bubble)bubble.style.opacity='1';const status=el.querySelector('.chat-status');if(status){status.textContent='Gesendet · '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});status.classList.remove('pending');}}function markBubbleFailed(ts,text,image,audio){const el=document.querySelector('[data-optimistic=\"'+ts+'\"]');if(!el)return;const status=el.querySelector('.chat-status');if(status){status.textContent='❌ Fehler · Tippe um erneut zu senden';status.style.color='#ef4444';status.style.cursor='pointer';status.onclick=()=>{el.remove();sendMessage(image,audio,text);};}}";

tryPatch('Optimistic Send', /async function sendMessage\(image, audio, text=''\) \{\s*const res = await fetch\('\/api\/send-message'[\s\S]*?if \(\(await res\.json\(\)\)\.ok\) location\.reload\(\);\s*\}/, OPTIMISTIC_SEND, "insertOptimisticBubble");

tryPatch('Smart Polling', /setInterval\(async \(\) => \{\s*const r = await fetch\(`\/api\/messages\/\$\{otherUid\}`\);[\s\S]*?\}, 5000\);/, "let chatKnownCount=${msgs.length};setInterval(async()=>{if(document.querySelector('[data-optimistic]'))return;if(document.hidden)return;try{const r=await fetch('/api/messages/${otherUid}');const data=await r.json();if(data.count>chatKnownCount){chatKnownCount=data.count;location.reload();}}catch(e){}},3000);", "chatKnownCount");

tryPatch('Smart Send-Click', /async function sendMsg\(\) \{\s*const input = document\.getElementById\('msg-input'\);[\s\S]*?clearImage\(\);\s*\}/, "async function sendMsg(){const input=document.getElementById('msg-input');const text=input.value.trim();if(!text&&!selectedImage)return;input.value='';input.focus();const img=selectedImage;clearImage();sendMessage(img||null,null,text);}", null);

tryPatch('Back-Button DM', /<a href="\/nachrichten" class="icon-btn" style="font-size:22px">‹<\/a>/, '<a href="/nachrichten" class="icon-btn" style="font-size:22px" onclick="if(history.length>1){event.preventDefault();history.back();}">‹</a>', 'history.back()');

tryPatch('Mark-Read non-blocking', /await postBot\('\/mark-messages-read', \{ uid: myUid, chatKey \}\);/, "postBot('/mark-messages-read', { uid: myUid, chatKey }).catch(()=>{});", "postBot('/mark-messages-read', { uid: myUid, chatKey }).catch");

// === LIGHT THEME WHITE ===
if (src.includes('LIGHT-THEME-WHITE-V2')) {
    console.log('[patch-bot] Light theme already v2');
} else if (/\[data-theme=light\]\{\s*--bg:#fafafa;--bg2:#f0f0f0;--bg3:#fff;--bg4:#e8e8e8;[\s\S]*?\}/.test(src)) {
    src = src.replace(
        /\[data-theme=light\]\{\s*--bg:#fafafa;--bg2:#f0f0f0;--bg3:#fff;--bg4:#e8e8e8;\s*--border:rgba\(0,0,0,\.1\);--border2:rgba\(0,0,0,\.06\);\s*--text:#111;--muted:#666;--muted2:#999;\s*\}/,
        '/* LIGHT-THEME-WHITE-V2 */[data-theme=light]{--bg:#ffffff;--bg2:#ffffff;--bg3:#ffffff;--bg4:#f5f5f7;--border:rgba(0,0,0,.08);--border2:rgba(0,0,0,.05);--text:#111;--muted:#666;--muted2:#999;}html[data-theme=light],html[data-theme=light] body{background:#ffffff !important;color:#111 !important}'
    );
    console.log('[patch-bot] Light Theme White v2 gepatched');
    changed = true;
} else if (/\[data-theme=light\]\{\s*--bg:#fafafa;--bg2:#f0f0f0;--bg3:#fff;--bg4:#e8e8e8;/.test(src)) {
    src = src.replace(
        /\[data-theme=light\]\{\s*--bg:#fafafa;--bg2:#f0f0f0;--bg3:#fff;--bg4:#e8e8e8;/,
        '/* LIGHT-THEME-WHITE-V2 */[data-theme=light]{--bg:#ffffff;--bg2:#ffffff;--bg3:#ffffff;--bg4:#f5f5f7;'
    );
    console.log('[patch-bot] Light Theme White v2 (fallback) gepatched');
    changed = true;
} else {
    console.warn('[patch-bot] WARNUNG: Light Theme Pattern nicht gefunden');
}

// === DIAMANT SHOP CLICKABLE ===
tryPatch('Diamant Shop Link',
    /<div class="highlight-card">\s*<div class="highlight-icon" style="background:linear-gradient\(135deg,rgba\(0,200,130,\.25\),rgba\(0,150,100,\.15\)\)">🎁<\/div>\s*<div style="flex:1;min-width:0">\s*<div style="font-size:13px;font-weight:700">💎 Diamant Shop<\/div>\s*<div style="font-size:11px;color:var\(--muted\);margin-top:3px">Tausche Diamanten gegen Vorteile<\/div>\s*<\/div>\s*<div style="font-size:10px;color:#a78bfa;font-weight:700;background:rgba\(167,139,250,\.12\);padding:2px 8px;border-radius:10px;white-space:nowrap">💎 \$\{d\.users\[myUid\]\?\.diamonds\|\|0\}<\/div>\s*<\/div>/,
    '<a href="/explore?tab=shop" class="highlight-card"><div class="highlight-icon" style="background:linear-gradient(135deg,rgba(0,200,130,.25),rgba(0,150,100,.15))">🎁</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">💎 Diamant Shop</div><div style="font-size:11px;color:var(--muted);margin-top:3px">Tausche Diamanten gegen Vorteile</div></div><div style="font-size:10px;color:#a78bfa;font-weight:700;background:rgba(167,139,250,.12);padding:2px 8px;border-radius:10px;white-space:nowrap">💎 ${d.users[myUid]?.diamonds||0}</div></a>',
    '<a href="/explore?tab=shop" class="highlight-card">'
);

// === /info ROUTE - serve praesentation.html ===
if (src.includes("path === '/info'")) {
    console.log('[patch-bot] /info Route bereits');
} else if (src.includes("if (path === '/newsletter'")) {
    const INFO_ROUTE = "if (path === '/info' || path === '/praesentation') { try { const html = require('fs').readFileSync(require('path').resolve(__dirname, 'praesentation.html'), 'utf8'); res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300'}); return res.end(html); } catch (e) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('Praesentation nicht gefunden: ' + e.message); } }\n\n    ";
    src = src.replace("if (path === '/newsletter'", INFO_ROUTE + "if (path === '/newsletter'");
    console.log('[patch-bot] /info Route eingefuegt');
    changed = true;
}

const hasNewIconRoutes = src.includes("if (path === '/icon-192.png')");
if (hasNewIconRoutes) {
    console.log('[patch-bot] Neue Icon-Routes erkannt');
} else if (src.includes("require('./app-icon')")) {
    console.log('[patch-bot] App-Icon bereits via require');
} else if (/const buf = Buffer\.from\('[A-Za-z0-9+/=]{1000,}', 'base64'\);/.test(src)) {
    src = src.replace(/const buf = Buffer\.from\('[A-Za-z0-9+/=]+', 'base64'\);/, "const buf = Buffer.from(require('./app-icon').b64, 'base64');");
    console.log('[patch-bot] App-Icon auf require'); changed = true;
    tryPatch('Icon Content-Type', /res\.writeHead\(200, \{ 'Content-Type': 'image\/png',/g, "res.writeHead(200, { 'Content-Type': 'image/jpeg',", null);
}

const NEW_MANIFEST_JSON = "res.end(JSON.stringify({name:'CreatorX',short_name:'CreatorX',description:'Die kreative Community für Instagram Creators',start_url:'/',scope:'/',display:'standalone',background_color:'#000000',theme_color:'#ff6b6b',orientation:'portrait',categories:['social','lifestyle'],prefer_related_applications:false,screenshots:[],icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));";

if (src.includes("prefer_related_applications:false")) {
    console.log('[patch-bot] Manifest bereits v23');
} else if (/res\.end\(JSON\.stringify\(\{name:'CreatorX'[^)]+\}\)\);/.test(src)) {
    src = src.replace(/res\.end\(JSON\.stringify\(\{name:'CreatorX'[^)]+\}\)\);/, NEW_MANIFEST_JSON);
    console.log('[patch-bot] Manifest v23 gepatched');
    changed = true;
} else {
    console.warn('[patch-bot] WARNUNG: Manifest pattern nicht gefunden');
}

tryPatch('HTML no-cache headers', /res\.writeHead\(200,\{'Content-Type':'text\/html; charset=utf-8'\}\);/g, "res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache, stale-while-revalidate=60','X-App-Version':'21'});", "X-App-Version");

if (!src.includes('self.skipWaiting()')) {
    if (/self\.addEventListener\(['"]install['"]/.test(src)) {
        src = src.replace(/self\.addEventListener\(['"]install['"], ?(?:function ?\(?e?\)?|e ?=>) ?\{/, "self.addEventListener('install',e=>{self.skipWaiting();");
        console.log('[patch-bot] SW skipWaiting'); changed = true;
    }
    if (/self\.addEventListener\(['"]activate['"]/.test(src)) {
        src = src.replace(/self\.addEventListener\(['"]activate['"], ?(?:function ?\(?e?\)?|e ?=>) ?\{/, "self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());");
        console.log('[patch-bot] SW clients.claim'); changed = true;
    }
}

const BANNER_MARKER = '<!--cx-update-banner-v18-->';
let INLINE_BANNER = '';
try { INLINE_BANNER = require('./banner-html'); } catch (e) { console.error('banner-html fehlt:', e.message); }
if (INLINE_BANNER) {
    if (src.includes(BANNER_MARKER)) {
        console.log('[patch-bot] Banner v18 bereits drin');
    } else {
        src = src.replace(/<!--cx-update-banner-v1[234567]-->[\s\S]*?<\/script>/g, '');
        const layoutEndRegex = new RegExp('<\\/script>\\s*<\\/body><\\/html>' + BT + ';', 'g');
        if (layoutEndRegex.test(src)) {
            src = src.replace(layoutEndRegex, '</script>' + INLINE_BANNER + '</body></html>' + BT + ';');
            console.log('[patch-bot] Banner eingefuegt'); changed = true;
        }
    }
}

if (changed) { fs.writeFileSync(BOT, src); console.log('[patch-bot] bot.js gespeichert'); } else { console.log('[patch-bot] keine Anderungen'); }
