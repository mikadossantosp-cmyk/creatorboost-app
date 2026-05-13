// Regeln-Tab HTML-Content fur Explore-Tab
// Wird via require() in bot.js geladen

module.exports = `
<style>
  .regeln-wrap { padding:0 0 100px; }
  .regeln-header { padding:16px 16px 8px; }
  .regeln-title { font-size:18px; font-weight:800; margin-bottom:2px; }
  .regeln-meta { font-size:11px; color:var(--muted); }
  .regeln-tabnav { position:sticky; top:0; z-index:5; background:var(--bg); display:grid; grid-template-columns:repeat(3,1fr); gap:6px; padding:10px 12px; border-bottom:1px solid var(--border2); }
  .regeln-tabnav button { padding:9px 6px; border-radius:12px; background:var(--bg3); color:var(--muted); font-size:11.5px; font-weight:700; border:1px solid var(--border2); white-space:nowrap; cursor:pointer; transition:all .2s; font-family:inherit; text-align:center; line-height:1.2; }
  .regeln-tabnav button:hover { background:var(--bg4); color:var(--text); }
  .regeln-tabnav button.active { background:linear-gradient(135deg,#a78bfa,#7c3aed); color:#fff; border-color:transparent; }
  .regeln-section { display:none; padding:18px 16px; animation:fadeIn .25s ease; }
  .regeln-section.active { display:block; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
  .regeln-card { background:var(--bg3); border:1px solid var(--border2); border-radius:16px; padding:18px; margin-bottom:14px; }
  .regeln-card h2 { font-size:15px; font-weight:800; margin:0 0 12px; display:flex; align-items:center; gap:8px; }
  .regeln-card h3 { font-size:13px; font-weight:700; color:#a78bfa; margin:14px 0 8px; text-transform:uppercase; letter-spacing:.5px; }
  .regeln-card p { font-size:13px; color:var(--text); line-height:1.6; margin:0 0 10px; }
  .regeln-card ul { padding-left:0; margin:6px 0 10px; list-style:none; }
  .regeln-card li { font-size:13px; line-height:1.7; padding-left:6px; }
  .regeln-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px dashed var(--border2); font-size:13px; gap:10px; }
  .regeln-row:last-child { border-bottom:0; }
  .regeln-row .konsequenz { font-size:11px; padding:3px 9px; border-radius:999px; font-weight:700; flex-shrink:0; }
  .k-block { background:rgba(239,68,68,.15); color:#ef4444; }
  .k-warn { background:rgba(245,158,11,.15); color:#f59e0b; }
  .k-trash { background:rgba(148,163,184,.15); color:#94a3b8; }
  .k-xp { background:rgba(168,85,247,.15); color:#a78bfa; }
  .badge-row { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px dashed var(--border2); }
  .badge-row:last-child { border-bottom:0; }
  .badge-row .b-name { flex:1; font-size:13px; font-weight:700; }
  .badge-row .b-xp { font-size:11px; color:var(--muted); }
  .badge-row .b-perk { font-size:11px; color:#a78bfa; font-weight:700; margin-left:8px; }
  .why-box { background:rgba(168,85,247,.08); border-left:3px solid #a78bfa; border-radius:8px; padding:10px 12px; margin-top:10px; font-size:12px; color:var(--muted); line-height:1.6; }
  .ok-card, .bad-card { padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.7; }
  .ok-card { background:rgba(34,197,94,.1); border:1px solid rgba(34,197,94,.25); }
  .bad-card { background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.25); }
  .warn-bar { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:10px; font-size:12px; margin-bottom:6px; }
</style>

<div class="regeln-wrap">

  <div class="regeln-header">
    <div class="regeln-title">📜 Regeln</div>
    <div class="regeln-meta">Stand 02.05.2026 · v1.1</div>
  </div>

  <nav class="regeln-tabnav" id="regeln-tabs">
    <button data-target="r-mission" class="active">🎯 Mission</button>
    <button data-target="r-start">🚀 Start</button>
    <button data-target="r-links">🔗 Links</button>
    <button data-target="r-respekt">🤝 Respekt</button>
    <button data-target="r-missionen">🎯 Missionen</button>
    <button data-target="r-superlinks">🌟 Superlinks</button>
    <button data-target="r-kollabs">🤝 Kollabs</button>
    <button data-target="r-diamond">💎 Diamantlinks</button>
    <button data-target="r-warns">⚠️ Warns</button>
    <button data-target="r-xp">📈 XP</button>
    <button data-target="r-shop">💎 Shop</button>
  </nav>

  <section id="r-mission" class="regeln-section active">
    <div class="regeln-card">
      <h2>🎯 Unsere Mission</h2>
      <p>Wir sind eine Community, die sich gegenseitig auf Instagram pusht. Echte Likes, echte Kommentare, echtes Wachstum.</p>
      <ul>
        <li>✅ Wir helfen uns gegenseitig</li>
        <li>✅ Wir handeln natürlich — kein Bot-Verhalten</li>
        <li>✅ Wir wachsen nachhaltig — nicht künstlich</li>
      </ul>
      <p style="font-size:12px;color:var(--muted)">Das ist der Grund warum es Regeln gibt.</p>
    </div>
  </section>

  <section id="r-start" class="regeln-section">
    <div class="regeln-card">
      <h2>🚀 Neu? Deine ersten 24h</h2>
      <ul>
        <li><b>1️⃣ Profilbild &amp; Spitzname</b> setzen → <a href="/einstellungen" style="color:#a78bfa">Einstellungen</a></li>
        <li><b>2️⃣ Instagram-Handle</b> setzen → <a href="/einstellungen" style="color:#a78bfa">Einstellungen</a></li>
        <li><b>3️⃣ Ersten Reel-Link posten</b> → <a href="/post" style="color:#a78bfa">+ Posten</a></li>
        <li><b>4️⃣ 5 andere Links liken UND kommentieren</b> (Mission 1)<br><span style="font-size:12px;color:var(--muted);padding-left:22px;display:inline-block;margin-top:4px">Insta-Reel öffnen → dort liken &amp; kommentieren → dann hier in der App liken</span></li>
      </ul>
      <div class="why-box">🎉 Damit hast du am ersten Tag schon ~25 XP + Daily Bonus.</div>
    </div>
  </section>

  <section id="r-links" class="regeln-section">
    <div class="regeln-card">
      <h2>🔗 Link-Regeln</h2>
      <div class="regeln-row"><span>1. Nur 1 Link pro Tag</span><span class="konsequenz k-block">❌ blockiert</span></div>
      <div class="regeln-row"><span>2. Nur Instagram-Links</span><span class="konsequenz k-block">❌ blockiert</span></div>
      <div class="regeln-row"><span>3. Keine Duplikate</span><span class="konsequenz k-warn">⚠️ Warnung</span></div>
      <div class="regeln-row"><span>4. Kein Self-Like</span><span class="konsequenz k-warn">⚠️ Warnung</span></div>
      <div class="regeln-row"><span>5. Sperrzeit So 20 — Mo 06</span><span class="konsequenz k-block">❌ blockiert</span></div>
      <div class="regeln-row"><span>6. Links älter als 48h</span><span class="konsequenz k-trash">🗑️ Auto-Löschung</span></div>

      <h3>✅ Erlaubt</h3>
      <div class="ok-card">
        • Posts: <code>instagram.com/p/...</code><br>
        • Reels: <code>instagram.com/reel/...</code><br>
        • Profile: <code>instagram.com/dein.profil</code>
      </div>

      <h3>❌ Nicht erlaubt</h3>
      <div class="bad-card">
        • Story-Links (laufen nach 24h ab)<br>
        • TikTok · YouTube · Threads<br>
        • Verkürzte Links (bit.ly, t.co, ...)
      </div>

      <div class="why-box">💡 <b>Warum?</b> Self-Likes erkennt Instagram als Manipulation. Die Sperrzeit gibt allen Pause vor dem Ranking-Reset.</div>
    </div>
  </section>

  <section id="r-respekt" class="regeln-section">
    <div class="regeln-card">
      <h2>🤝 Respekt & Umgang</h2>
      <ul>
        <li>1. Sei respektvoll zu jedem</li>
        <li>2. Kein Hate, keine Beleidigungen</li>
        <li>3. Keine Diskriminierung (Herkunft · Geschlecht · Religion · uvm.)</li>
        <li>4. Kein Spam in Chats</li>
        <li>5. Keine Werbung für andere Plattformen oder Bots</li>
        <li>6. Keine privaten Streitereien öffentlich austragen</li>
        <li>7. Hilf neuen Mitgliedern weiter</li>
        <li>8. Konstruktives Feedback statt Kritik</li>
        <li>9. Bei Konflikten: Admin per DM kontaktieren</li>
        <li>10. Was im Chat passiert, bleibt im Chat</li>
      </ul>
      <div class="warn-bar k-warn"><span>⚠️</span><span>Verstoß = Verwarnung</span></div>
      <div class="warn-bar k-block"><span>🔨</span><span>Schwerer Verstoß = direkter Ban</span></div>
    </div>
  </section>

  <section id="r-missionen" class="regeln-section">
    <div class="regeln-card">
      <h2>🎯 Missionen</h2>

      <h3>📅 Daily — Auswertung 12:00 Uhr</h3>
      <div class="regeln-row"><span>M1 — 5 Links liken &amp; kommentieren</span><span class="konsequenz k-xp">+5 XP</span></div>
      <div class="regeln-row"><span>M2 — 80% aller Links liken &amp; kommentieren</span><span class="konsequenz k-xp">+5 XP</span></div>
      <div class="regeln-row"><span>M3 — 100% aller Links liken &amp; kommentieren</span><span class="konsequenz k-xp">+5 XP + 💎</span></div>
      <div class="why-box" style="margin-top:8px">📌 <b>Visit-before-Like:</b> Erst auf Instagram liken &amp; kommentieren — dann zählt der Like in der App.</div>
      <div class="warn-bar k-warn" style="margin-top:8px"><span>⚠️</span><span>Link gepostet ohne M1 → Verwarnung</span></div>

      <h3>📆 Weekly — Reset Montag 00:05 Uhr</h3>
      <div class="regeln-row"><span>M2 Streak — 7 Tage 80%</span><span class="konsequenz k-xp">+15 XP + 1 💎</span></div>
      <div class="regeln-row"><span>M3 Streak — 7 Tage 100%</span><span class="konsequenz k-xp">+20 XP + 2 💎</span></div>

      <div class="why-box">💡 <b>Warum?</b> Engagement-Streaks = echtes Wachstum. Wer dranbleibt wird belohnt.</div>
    </div>
  </section>

  <section id="r-superlinks" class="regeln-section">
    <div class="regeln-card">
      <h2>🌟 Superlinks / Full Engagement</h2>
      <ul>
        <li>• 1 Superlink pro Woche <b style="color:#a78bfa">(Elite+: 2!)</b></li>
        <li>• Nur Mo–Sa möglich</li>
        <li>• Instagram-Handle in <a href="/einstellungen" style="color:#a78bfa">Einstellungen</a> Pflicht</li>
        <li>• Wer postet MUSS alle anderen Superlinks der Woche liken</li>
      </ul>
      <p style="font-size:12px;color:var(--muted)">⏰ Erinnerung Sonntag 21:00 · ✅ Auswertung Sonntag 23:59</p>

      <h3>Verstöße</h3>
      <div class="regeln-row"><span>Engagement-Pflicht verletzt</span><span class="konsequenz k-warn">💀 −50 XP + ⚠️</span></div>
      <div class="regeln-row"><span>Ohne Insta-Handle</span><span class="konsequenz k-block">❌ blockiert</span></div>
      <div class="regeln-row"><span>Mehrfach pro Woche</span><span class="konsequenz k-block">❌ blockiert</span></div>
    </div>
  </section>

  <section id="r-kollabs" class="regeln-section">
    <div class="regeln-card">
      <h2>🤝 Kollaborations-Posts</h2>
      <p style="background:rgba(236,72,153,0.08);border-left:3px solid #ec4899;padding:10px 12px;border-radius:6px;margin-bottom:14px">Tretet einer Kollaboration bei. 1× wöchentlich erlaubt. 1 💎 wird an den User vergeben, der den Post engagiert. Kollaborations-Posts werden gründlich kontrolliert.</p>

      <h3>📋 Regeln</h3>
      <ul>
        <li>• <b>1× pro Woche</b> pro User darf ein Kollab-Post veröffentlicht werden</li>
        <li>• Vorher müsst ihr eine Kollaboration eingehen (Profil → Anfrage → Annahme)</li>
        <li>• <b>Sichtbare Zusammenarbeit Pflicht:</b> Im Reel/Post muss erkennbar sein, dass <b>beide Parteien</b> zusammenarbeiten — z.B. Logos beider Creator irgendwo im Reel, gemeinsamer Branding-Frame oder beide @-Handles eingeblendet. Ohne sichtbare Zusammenarbeit wird der Post nicht freigegeben.</li>
        <li>• Engagement-Pflicht beim Liker: erst auf Instagram öffnen + <b>LIKEN + KOMMENTIEREN + SPEICHERN + TEILEN</b> — dann hier ✅</li>
        <li>• Pro engagiertem Kollab-Post bekommt der <b>Liker 1 💎</b> (Poster bekommt nichts)</li>
        <li>• Beide Kollab-Partner dürfen ihren eigenen Post <b>nicht liken</b> (Self-Like blockiert)</li>
        <li>• Kollab-Posts werden gründlich kontrolliert — Schein-Likes und Posts ohne sichtbare Zusammenarbeit werden sanktioniert</li>
      </ul>

      <h3>🚀 So gehst du eine Kollaboration ein</h3>
      <ul>
        <li>1. Gehe auf das Profil deines Wunsch-Partners</li>
        <li>2. Klicke auf <b>🤝 Kollaboration anfragen</b></li>
        <li>3. Dein Partner muss in seinen Benachrichtigungen <b>akzeptieren</b></li>
        <li>4. Fertig — ihr seid offiziell Kollab-Partner und könnt im +Menü "🤝 Kollab-Link" auswählen</li>
      </ul>

      <h3>🎯 Ziel</h3>
      <p>Gemeinsame Zusammenarbeit. Mehr Reichweite, Mehrwert und Sichtbarkeit für beide Partner und die Community.</p>
    </div>
  </section>

  <section id="r-diamond" class="regeln-section">
    <div class="regeln-card">
      <h2>💎 Diamantlinks</h2>
      <p style="background:rgba(6,182,212,0.08);border-left:3px solid #06b6d4;padding:10px 12px;border-radius:6px;margin-bottom:14px">Premium-Posts mit Vollengagement. <b>30 💎 Kosten</b> · <b>3 Tage</b> im Feed an erster Stelle · jeder Liker bekommt <b>+3 💎</b>.</p>

      <h3>📋 Regeln</h3>
      <ul>
        <li>• Posten kostet <b>30 💎</b> (Admins gratis)</li>
        <li>• Diamantlinks stehen <b>3 Tage</b> oben im Feed (älteste zuerst, dann zweitältester usw.)</li>
        <li>• Jeder Liker bekommt <b>+3 💎</b> Belohnung</li>
        <li>• <b>Engagement-Pflicht beim Liker:</b> LIKEN + KOMMENTIEREN + TEILEN + SPEICHERN</li>
        <li>• Self-Like auf eigenen Diamantlink ist <b>blockiert</b></li>
        <li>• <b>Sehr hohe Strafen bei Betrug:</b> XP-Abzug + Diamonds-Reset + Bann</li>
        <li>• Diamantlinks werden gründlich kontrolliert — gespeichert bleiben sie für immer im Admin-Log</li>
      </ul>

      <h3>🚀 So postest du einen Diamantlink</h3>
      <ul>
        <li>1. Tippe auf <b>+</b> unten in der Navi</li>
        <li>2. Wähle <b>💎 Diamantlink posten</b></li>
        <li>3. Insta-URL + optionale Beschreibung eingeben</li>
        <li>4. 30 💎 werden abgezogen, Post geht live</li>
      </ul>

      <h3>❤️ So engagierst du einen Diamantlink</h3>
      <ul>
        <li>1. Im Feed → 💎 Diamond Tab oder oben im normalen Heute-Tab</li>
        <li>2. Tippe auf <b>🔗 Auf Instagram öffnen</b></li>
        <li>3. Auf Instagram <b>liken + kommentieren + teilen + speichern</b></li>
        <li>4. Zurück in die App, tippe auf <b>💎 Engagiert · +3 💎</b></li>
        <li>5. Bestätige im Popup, dass du alle 4 Aktionen ausgeführt hast → +3 💎</li>
      </ul>

      <h3>🎯 Ziel</h3>
      <p>Premium-Reichweite für wichtige Posts. Wer 30 💎 investiert bekommt 3 Tage echte Sichtbarkeit + Full-Engagement von der Community.</p>
    </div>
  </section>

  <section id="r-warns" class="regeln-section">
    <div class="regeln-card">
      <h2>⚠️ Verwarnungs-Limit</h2>
      <div class="regeln-row"><span><b>1 / 5</b></span><span style="color:var(--muted);font-size:12px">Hinweis</span></div>
      <div class="regeln-row"><span><b>2 / 5</b></span><span style="color:var(--muted);font-size:12px">Hinweis</span></div>
      <div class="regeln-row"><span><b>3 / 5</b></span><span style="color:#f59e0b;font-size:12px;font-weight:700">Letzte Chance</span></div>
      <div class="regeln-row"><span><b>4 / 5</b></span><span style="color:#ef4444;font-size:12px;font-weight:700">⚠️ kritisch</span></div>
      <div class="regeln-row"><span><b>5 / 5</b></span><span class="konsequenz k-block">🔨 AUTO-BAN</span></div>
      <div class="why-box">🎁 <b>Warn-Abbau:</b> 5 Tage M1 in Folge → 1 Verwarnung gelöscht</div>
    </div>
  </section>

  <section id="r-xp" class="regeln-section">
    <div class="regeln-card">
      <h2>📈 XP & Badges</h2>

      <h3>XP sammeln</h3>
      <div class="regeln-row"><span>Link posten</span><span class="konsequenz k-xp">+1 XP</span></div>
      <div class="regeln-row"><span>Like geben</span><span class="konsequenz k-xp">+5 XP</span></div>
      <div class="regeln-row"><span>Daily Bonus</span><span class="konsequenz k-xp">+10 bis +30 XP</span></div>
      <div class="regeln-row"><span>Mission 1 / 2 / 3</span><span class="konsequenz k-xp">je +5 XP</span></div>
      <div class="regeln-row"><span>Weekly Streaks</span><span class="konsequenz k-xp">+15 / +20 XP</span></div>
      <p style="font-size:12px;color:var(--muted);margin-top:10px">Level = XP / 100 + 1</p>

      <h3>Badges</h3>
      <div class="badge-row"><span>🆕</span><span class="b-name">New</span><span class="b-xp">0 — 49</span></div>
      <div class="badge-row"><span>📘</span><span class="b-name">Anfänger</span><span class="b-xp">50 — 499</span></div>
      <div class="badge-row"><span>⬆️</span><span class="b-name">Aufsteiger</span><span class="b-xp">500 — 999</span></div>
      <div class="badge-row"><span>🏅</span><span class="b-name">Erfahrener</span><span class="b-xp">1.000 — 4.999</span><span class="b-perk">🎁 +1 Link/Tag</span></div>
      <div class="badge-row"><span>👑</span><span class="b-name">Elite</span><span class="b-xp">5.000 — 9.999</span><span class="b-perk">🎁 +1 + Mo Bonus</span></div>
      <div class="badge-row"><span>🌟</span><span class="b-name">Elite+</span><span class="b-xp">ab 10.000</span><span class="b-perk">🌟 2 SL/Woche</span></div>
    </div>
  </section>

  <section id="r-shop" class="regeln-section">
    <div class="regeln-card">
      <h2>💎 Shop</h2>
      <ul>
        <li>• Extra-Links mit 💎 kaufbar</li>
        <li>• 💎 verdienen über Mission-Streaks (M2 / M3)</li>
        <li>• Bonus-Links umgehen das Tageslimit einmalig</li>
      </ul>
      <p style="font-size:12px;color:var(--muted);margin-top:10px">Alle Banner & Ringe findest du im 💎 Diamant Shop.</p>
    </div>
  </section>

</div>

<script>
(function(){
  const nav = document.getElementById('regeln-tabs');
  if (!nav) return;
  const buttons = nav.querySelectorAll('button[data-target]');
  function activate(target) {
    buttons.forEach(b => b.classList.toggle('active', b.getAttribute('data-target') === target));
    document.querySelectorAll('.regeln-section').forEach(s => {
      s.classList.toggle('active', s.id === target);
    });
    window.scrollTo({ top:0, behavior:'smooth' });
  }
  buttons.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.getAttribute('data-target')));
  });
  // Beim Laden URL-Hash respektieren — z.B. /explore?tab=regeln#r-superlinks
  // soll direkt auf den Superlinks-Subtab springen statt auf dem Default zu bleiben.
  const hash = (location.hash || '').replace(/^#/, '');
  if (hash && nav.querySelector('button[data-target="' + hash + '"]')) {
    activate(hash);
  }
})();
<\/script>
`;
