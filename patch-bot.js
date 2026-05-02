// patch-bot.js - Build-time Patches fur bot.js (mit INLINE Banner)
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

if (!tryPatch(
    'Regeln-Tab',
    /regeln: `<div style="padding:48px[\s\S]*?`,/,
    "regeln: require('./regeln-tab'),",
    "regeln: require('./regeln-tab')"
)) {
    console.error('[patch-bot] FEHLER: Regeln-Patch erforderlich aber nicht gefunden');
    process.exit(1);
}

tryPatch(
    'DM-Liste',
    /const convHtml = `\s*\n<a href="\/nachrichten\/gruppe"[\s\S]*?<div class="empty-sub">Schreibe jemandem!<\/div><\/div>'\);/,
    "const convHtml = require('./chat-list-render')({ myConvos, botData, myUid, feedPreview, totalThreadUnread, ladeBild, adminIds, onlineUids: typeof sessions !== 'undefined' ? new Set([...sessions.values()].map(s => String(s.uid))) : new Set() });",
    "require('./chat-list-render')"
);

tryPatch(
    'Threads-Liste cards',
    /const cards = threads\.map\(thr => \{[\s\S]*?\}\)\.join\(''\);/,
    "const cards = require('./thread-list-render')({ threads, threadMsgs, lastRead, communityFeed, isAdmin });",
    "require('./thread-list-render')"
);

tryPatch(
    'Threads-Liste Container',
    /<div style="padding:12px 12px 100px;display:grid;grid-template-columns:1fr 1fr;gap:10px">\$\{cards\}<\/div>/,
    '${cards}',
    null
);

const CHAT_DETAIL_REPLACEMENT = "const msgsHtml = require('./chat-detail-render')({ msgs, myUid, otherUid, otherUser, ladeBild, otherOnline: typeof sessions !== 'undefined' ? [...sessions.values()].some(s => String(s.uid) === String(otherUid)) : false });";
if (src.includes("otherOnline:")) {
    console.log('[patch-bot] Chat-Detail mit otherOnline bereits gepatched');
} else if (src.includes("require('./chat-detail-render')")) {
    src = src.replace(/const msgsHtml = require\('\.\/chat-detail-render'\)\([^;]*\);/, CHAT_DETAIL_REPLACEMENT);
    console.log('[patch-bot] Chat-Detail upgraded mit otherOnline');
    changed = true;
} else if (/const msgsHtml = msgs\.map\(m => \{[\s\S]*?\}\)\.join\(''\);/.test(src)) {
    src = src.replace(/const msgsHtml = msgs\.map\(m => \{[\s\S]*?\}\)\.join\(''\);/, CHAT_DETAIL_REPLACEMENT);
    console.log('[patch-bot] Chat-Detail initial gepatched mit otherOnline');
    changed = true;
}

const OPTIMISTIC_SEND = "async function sendMessage(image, audio, text=''){const tmpTs=Date.now();insertOptimisticBubble(tmpTs,text,image,audio);requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}));try{const res=await fetch('/api/send-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'${otherUid}',text,image:image||null,audio:audio||null})});const data=await res.json();if(!data.ok){markBubbleFailed(tmpTs,text,image,audio);return;}markBubbleSent(tmpTs);}catch(e){markBubbleFailed(tmpTs,text,image,audio);}}function insertOptimisticBubble(ts,text,image,audio){const c=document.getElementById('chat-msgs');if(!c)return;const empty=c.querySelector('.chat-empty');if(empty)empty.remove();const div=document.createElement('div');div.className='chat-row chat-row-me chat-row-last';div.dataset.optimistic=ts;const escT=(text||'').replace(/[<>&]/g,c=>({\"<\":\"&lt;\",\">\":\"&gt;\",\"&\":\"&amp;\"}[c]));let inner='';if(image)inner='<div class=\"chat-img-wrap\"><img src=\"'+image+'\"></div>'+(text?'<div class=\"chat-img-caption\">'+escT+'</div>':'');else if(audio)inner='<div class=\"chat-audio\"><div class=\"chat-audio-info\"><div class=\"audio-dur\">🎤 Sprachnachricht</div></div></div>';else inner='<div class=\"chat-text\">'+escT+'</div>';div.innerHTML='<div class=\"chat-bubble-wrap\"><div class=\"chat-bubble\" style=\"opacity:.7\">'+inner+'</div><div class=\"chat-status pending\">Wird gesendet...</div></div>';c.appendChild(div);}function markBubbleSent(ts){const el=document.querySelector('[data-optimistic=\"'+ts+'\"]');if(!el)return;const bubble=el.querySelector('.chat-bubble');if(bubble)bubble.style.opacity='1';const status=el.querySelector('.chat-status');if(status){status.textContent='Gesendet · '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});status.classList.remove('pending');}}function markBubbleFailed(ts,text,image,audio){const el=document.querySelector('[data-optimistic=\"'+ts+'\"]');if(!el)return;const status=el.querySelector('.chat-status');if(status){status.textContent='❌ Fehler · Tippe um erneut zu senden';status.style.color='#ef4444';status.style.cursor='pointer';status.onclick=()=>{el.remove();sendMessage(image,audio,text);};}}";

tryPatch(
    'Optimistic Send',
    /async function sendMessage\(image, audio, text=''\) \{\s*const res = await fetch\('\/api\/send-message'[\s\S]*?if \(\(await res\.json\(\)\)\.ok\) location\.reload\(\);\s*\}/,
    OPTIMISTIC_SEND,
    "insertOptimisticBubble"
);

const SMART_POLL = "let chatKnownCount=${msgs.length};setInterval(async()=>{if(document.querySelector('[data-optimistic]'))return;if(document.hidden)return;try{const r=await fetch('/api/messages/${otherUid}');const data=await r.json();if(data.count>chatKnownCount){chatKnownCount=data.count;location.reload();}}catch(e){}},3000);";

tryPatch(
    'Smart Polling',
    /setInterval\(async \(\) => \{\s*const r = await fetch\(`\/api\/messages\/\$\{otherUid\}`\);[\s\S]*?\}, 5000\);/,
    SMART_POLL,
    "chatKnownCount"
);

tryPatch(
    'Smart Send-Click',
    /async function sendMsg\(\) \{\s*const input = document\.getElementById\('msg-input'\);[\s\S]*?clearImage\(\);\s*\}/,
    "async function sendMsg(){const input=document.getElementById('msg-input');const text=input.value.trim();if(!text&&!selectedImage)return;input.value='';input.focus();const img=selectedImage;clearImage();sendMessage(img||null,null,text);}",
    null
);

tryPatch(
    'Back-Button DM',
    /<a href="\/nachrichten" class="icon-btn" style="font-size:22px">‹<\/a>/,
    '<a href="/nachrichten" class="icon-btn" style="font-size:22px" onclick="if(history.length>1){event.preventDefault();history.back();}">‹</a>',
    'history.back()'
);

tryPatch(
    'Mark-Read non-blocking',
    /await postBot\('\/mark-messages-read', \{ uid: myUid, chatKey \}\);/,
    "postBot('/mark-messages-read', { uid: myUid, chatKey }).catch(()=>{});",
    "postBot('/mark-messages-read', { uid: myUid, chatKey }).catch"
);

if (src.includes("require('./app-icon')")) {
    console.log('[patch-bot] App-Icon bereits via require');
} else if (/const buf = Buffer\.from\('[A-Za-z0-9+/=]{1000,}', 'base64'\);/.test(src)) {
    src = src.replace(
        /const buf = Buffer\.from\('[A-Za-z0-9+/=]+', 'base64'\);/,
        "const buf = Buffer.from(require('./app-icon').b64, 'base64');"
    );
    console.log('[patch-bot] App-Icon auf require umgestellt');
    changed = true;
}

tryPatch(
    'Icon Content-Type',
    /res\.writeHead\(200, \{ 'Content-Type': 'image\/png',/g,
    "res.writeHead(200, { 'Content-Type': 'image/jpeg',",
    null
);

let versionBumps = 0;
src = src.replace(/icon\.jpg\?v=\d+/g, () => { versionBumps++; return 'icon.jpg?v=13'; });
src = src.replace(/icon-192\.png\?v=\d+/g, 'icon-192.png?v=13');
src = src.replace(/icon-512\.png\?v=\d+/g, 'icon-512.png?v=13');
if (versionBumps > 0) {
    console.log('[patch-bot] Icon-Version v=13: ' + versionBumps + ' Stellen');
    changed = true;
}

// ── INLINE UPDATE-BANNER (kein require, direkt in HTML) ──
const BANNER_MARKER = '<!--cx-update-banner-v13-->';
const INLINE_BANNER = BANNER_MARKER + '<style>#cxUpd{position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;font-size:13.5px;font-weight:600;box-shadow:0 4px 16px rgba(124,58,237,0.4);animation:cxUpdSlide 0.4s cubic-bezier(0.34,1.56,0.64,1)}@keyframes cxUpdSlide{from{transform:translateY(-100%)}to{transform:translateY(0)}}#cxUpd .ico{width:36px;height:36px;border-radius:8px;flex-shrink:0;background:rgba(255,255,255,0.15);overflow:hidden}#cxUpd .ico img{width:100%;height:100%;object-fit:cover}#cxUpd .txt{flex:1;line-height:1.3}#cxUpd .ttl{font-weight:800;font-size:14px}#cxUpd .sub{font-size:11.5px;opacity:0.9;margin-top:2px}#cxUpd .x{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}#cxUpd .x:active{transform:scale(0.85);background:rgba(255,255,255,0.3)}#cxModal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px}#cxModal .card{background:var(--bg2,#1a1a1a);border-radius:24px;padding:28px 24px;max-width:380px;width:100%;text-align:center;border:1px solid rgba(255,255,255,0.1);box-shadow:0 24px 48px rgba(0,0,0,0.6)}#cxModal .big{width:96px;height:96px;border-radius:22px;margin:0 auto 16px;background:#000;overflow:hidden;box-shadow:0 12px 32px rgba(124,58,237,0.4)}#cxModal .big img{width:100%;height:100%;object-fit:cover}#cxModal h2{font-size:18px;margin:0 0 8px;color:var(--text,#fff);font-weight:800}#cxModal p{font-size:13.5px;color:var(--muted,#999);line-height:1.5;margin:0 0 18px}#cxModal ol{text-align:left;padding-left:24px;color:var(--text,#fff);font-size:13px;line-height:1.7;margin:0 0 18px}#cxModal .acts{display:flex;gap:10px}#cxModal button{flex:1;padding:12px;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer}#cxModal .p1{background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff}#cxModal .p2{background:rgba(255,255,255,0.08);color:var(--text,#fff)}</style><script>(function(){if(window.__cxUpdShown)return;window.__cxUpdShown=true;var V="v13";var KEY="cx_upd_seen_"+V;function show(){if(localStorage.getItem(KEY)==="1")return;if(sessionStorage.getItem("cx_upd_dismissed"))return;if(location.pathname==="/"||location.pathname==="/login"||location.pathname==="/register")return;var b=document.createElement("div");b.id="cxUpd";b.innerHTML='<div class="ico"><img src="/icon.jpg?v="+V+"" alt=""></div><div class="txt"><div class="ttl">✨ Neues App-Icon!</div><div class="sub">Tippe um zu sehen wie du es bekommst</div></div><button class="x" onclick="event.stopPropagation();sessionStorage.setItem(\\'cx_upd_dismissed\\',\\'1\\');this.parentElement.remove();">×</button>';b.onclick=function(e){if(e.target.classList.contains("x"))return;showModal();};document.body.appendChild(b);}function showModal(){if(document.getElementById("cxModal"))return;var m=document.createElement("div");m.id="cxModal";m.innerHTML='<div class="card"><div class="big"><img src="/icon.jpg?v="+V+"" alt=""></div><h2>Neues CX-Icon 👑</h2><p>Damit du das neue gold-silberne Icon auf deinem Home-Screen siehst:</p><ol><li>Browser/App-Tab schliessen</li><li>Browser-Cache leeren</li><li>App neu öffnen → "Zum Home-Screen hinzufügen"</li><li>Altes Icon vom Home-Screen löschen</li></ol><div class="acts"><button class="p2" onclick="document.getElementById(\\'cxModal\\').remove();sessionStorage.setItem(\\'cx_upd_dismissed\\',\\'1\\');var b=document.getElementById(\\'cxUpd\\');if(b)b.remove();">Später</button><button class="p1" onclick="localStorage.setItem(\\'"+KEY+"\\',\\'1\\');document.getElementById(\\'cxModal\\').remove();var b=document.getElementById(\\'cxUpd\\');if(b)b.remove();">Verstanden</button></div></div>';m.onclick=function(e){if(e.target.id==="cxModal")m.remove();};document.body.appendChild(m);}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",function(){setTimeout(show,500);});}else{setTimeout(show,500);}})();<\/script>';

if (src.includes(BANNER_MARKER)) {
    console.log('[patch-bot] Inline-Banner v13 bereits drin');
} else {
    // Find layout end with regex
    const layoutEndRegex = new RegExp('<\\/script>\\s*<\\/body><\\/html>' + BT + ';');
    if (layoutEndRegex.test(src)) {
        // Replace ALL occurrences (mehrere layout templates)
        const layoutEndRegexGlobal = new RegExp('<\\/script>\\s*<\\/body><\\/html>' + BT + ';', 'g');
        src = src.replace(layoutEndRegexGlobal, '</script>' + INLINE_BANNER + '</body></html>' + BT + ';');
        console.log('[patch-bot] Inline-Banner v13 in alle layouts eingefuegt');
        changed = true;
    } else {
        console.warn('[patch-bot] WARNUNG: layout-end nicht gefunden fuer Banner');
    }
}

if (changed) {
    fs.writeFileSync(BOT, src);
    console.log('[patch-bot] bot.js gespeichert');
} else {
    console.log('[patch-bot] keine Anderungen notig');
}
