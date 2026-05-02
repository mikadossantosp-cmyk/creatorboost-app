// patch-bot.js - Build-time Patches fur bot.js
const fs = require('fs');
const path = require('path');

const BOT = path.resolve(__dirname, 'bot.js');
let src = fs.readFileSync(BOT, 'utf8');
let changed = false;

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

// Patch 1: Regeln-Tab
if (!tryPatch(
    'Regeln-Tab',
    /regeln: `<div style="padding:48px[\s\S]*?`,/,
    "regeln: require('./regeln-tab'),",
    "regeln: require('./regeln-tab')"
)) {
    console.error('[patch-bot] FEHLER: Regeln-Patch erforderlich aber nicht gefunden');
    process.exit(1);
}

// Patch 2: DM-Liste
tryPatch(
    'DM-Liste',
    /const convHtml = `\s*\n<a href="\/nachrichten\/gruppe"[\s\S]*?<div class="empty-sub">Schreibe jemandem!<\/div><\/div>'\);/,
    "const convHtml = require('./chat-list-render')({ myConvos, botData, myUid, feedPreview, totalThreadUnread, ladeBild, adminIds });",
    "require('./chat-list-render')"
);

// Patch 3: Threads-Liste
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

// Patch 4: Chat-Detail Bubbles
tryPatch(
    'Chat-Detail Bubbles',
    /const msgsHtml = msgs\.map\(m => \{[\s\S]*?\}\)\.join\(''\);/,
    "const msgsHtml = require('./chat-detail-render')({ msgs, myUid, otherUid, otherUser, ladeBild });",
    "require('./chat-detail-render')"
);

// Patch 5: PERFORMANCE - Optimistic Send
const OPTIMISTIC_SEND = "async function sendMessage(image, audio, text=''){" +
    "const tmpTs=Date.now();" +
    "insertOptimisticBubble(tmpTs,text,image,audio);" +
    "requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}));" +
    "try{" +
        "const res=await fetch('/api/send-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'${otherUid}',text,image:image||null,audio:audio||null})});" +
        "const data=await res.json();" +
        "if(!data.ok){markBubbleFailed(tmpTs,text,image,audio);return;}" +
        "markBubbleSent(tmpTs);" +
    "}catch(e){markBubbleFailed(tmpTs,text,image,audio);}" +
"}" +
"function insertOptimisticBubble(ts,text,image,audio){" +
    "const c=document.getElementById('chat-msgs');" +
    "if(!c)return;" +
    "const empty=c.querySelector('.chat-empty');" +
    "if(empty)empty.remove();" +
    "const div=document.createElement('div');" +
    "div.className='chat-row chat-row-me chat-row-last';" +
    "div.dataset.optimistic=ts;" +
    "const escT=(text||'').replace(/[<>&]/g,c=>({\"<\":\"&lt;\",\">\":\"&gt;\",\"&\":\"&amp;\"}[c]));" +
    "let inner='';" +
    "if(image)inner='<div class=\"chat-img-wrap\"><img src=\"'+image+'\"></div>'+(text?'<div class=\"chat-img-caption\">'+escT+'</div>':'');" +
    "else if(audio)inner='<div class=\"chat-audio\"><div class=\"chat-audio-info\"><div class=\"audio-dur\">🎤 Sprachnachricht</div></div></div>';" +
    "else inner='<div class=\"chat-text\">'+escT+'</div>';" +
    "div.innerHTML='<div class=\"chat-bubble-wrap\"><div class=\"chat-bubble\" style=\"opacity:.7\">'+inner+'</div><div class=\"chat-status pending\">Wird gesendet...</div></div>';" +
    "c.appendChild(div);" +
"}" +
"function markBubbleSent(ts){" +
    "const el=document.querySelector('[data-optimistic=\"'+ts+'\"]');" +
    "if(!el)return;" +
    "const bubble=el.querySelector('.chat-bubble');" +
    "if(bubble)bubble.style.opacity='1';" +
    "const status=el.querySelector('.chat-status');" +
    "if(status){status.textContent='Gesendet · '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});status.classList.remove('pending');}" +
"}" +
"function markBubbleFailed(ts,text,image,audio){" +
    "const el=document.querySelector('[data-optimistic=\"'+ts+'\"]');" +
    "if(!el)return;" +
    "const status=el.querySelector('.chat-status');" +
    "if(status){status.textContent='❌ Fehler · Tippe um erneut zu senden';status.style.color='#ef4444';status.style.cursor='pointer';status.onclick=()=>{el.remove();sendMessage(image,audio,text);};}" +
"}";

tryPatch(
    'Optimistic Send',
    /async function sendMessage\(image, audio, text=''\) \{\s*const res = await fetch\('\/api\/send-message'[\s\S]*?if \(\(await res\.json\(\)\)\.ok\) location\.reload\(\);\s*\}/,
    OPTIMISTIC_SEND,
    "insertOptimisticBubble"
);

// Patch 6: PERFORMANCE - Smart Polling
const SMART_POLL = "let chatKnownCount=${msgs.length};" +
"setInterval(async()=>{" +
    "if(document.querySelector('[data-optimistic]'))return;" +
    "try{" +
        "const r=await fetch('/api/messages/${otherUid}');" +
        "const data=await r.json();" +
        "if(data.count>chatKnownCount){chatKnownCount=data.count;location.reload();}" +
    "}catch(e){}" +
"},3000);";

tryPatch(
    'Smart Polling',
    /setInterval\(async \(\) => \{\s*const r = await fetch\(`\/api\/messages\/\$\{otherUid\}`\);[\s\S]*?\}, 5000\);/,
    SMART_POLL,
    "chatKnownCount"
);

// Patch 7: Smart Send-Click
tryPatch(
    'Smart Send-Click',
    /async function sendMsg\(\) \{\s*const input = document\.getElementById\('msg-input'\);[\s\S]*?clearImage\(\);\s*\}/,
    "async function sendMsg(){" +
        "const input=document.getElementById('msg-input');" +
        "const text=input.value.trim();" +
        "if(!text&&!selectedImage)return;" +
        "input.value='';" +
        "input.focus();" +
        "const img=selectedImage;" +
        "clearImage();" +
        "sendMessage(img||null,null,text);" +
    "}",
    null
);

// Patch 8: Smooth Back-Button DM
tryPatch(
    'Back-Button DM',
    /<a href="\/nachrichten" class="icon-btn" style="font-size:22px">‹<\/a>/,
    '<a href="/nachrichten" class="icon-btn" style="font-size:22px" onclick="if(history.length>1){event.preventDefault();history.back();}">‹</a>',
    'history.back()'
);

// Patch 9: PERFORMANCE - mark-messages-read non-blocking
tryPatch(
    'Mark-Read non-blocking',
    /await postBot\('\/mark-messages-read', \{ uid: myUid, chatKey \}\);/,
    "postBot('/mark-messages-read', { uid: myUid, chatKey }).catch(()=>{});",
    "postBot('/mark-messages-read', { uid: myUid, chatKey }).catch"
);

if (changed) {
    fs.writeFileSync(BOT, src);
    console.log('[patch-bot] bot.js gespeichert');
} else {
    console.log('[patch-bot] keine Anderungen notig');
}
