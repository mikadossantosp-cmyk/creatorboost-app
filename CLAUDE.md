# CLAUDE.md — CreatorBoostX

> Persistenter Kontext für Claude-Sessions. **Sprache: immer Deutsch** (du-Form, konkret, kein Fluff).
> Diese Datei ist die Single Source of Truth für „wie wir hier arbeiten". Bei Widerspruch zur Realität → Code gewinnt, Datei korrigieren.

---

## 1. Produkt

**CreatorBoostX** (auch „CreatorX" / „CreatorBoost") — Web-/PWA-App für **Instagram-Creator-Wachstum** über gegenseitiges Engagement (Likes/Kommentare auf echte Insta-Reels) mit XP-, Diamanten-, Missionen- und Community-System.

Zielgruppe: deutschsprachige Instagram-Creator. UI komplett auf Deutsch, mobile-first.

## 2. Architektur (verifiziert)

- **Stack:** Node.js **20.x**, **kein** Frontend-Framework. `bot.js` ist ein **monolithischer HTTP-Server (~11.500 Zeilen)** mit **serverseitig gerendertem HTML** (Template-Strings) + handgeschriebenem CSS.
- **Einzige Prod-Dependency:** `web-push`.
- **Entry (Dev):** `node bot-loader.js` (wendet Laufzeit-Patches an) · **Entry (Prod/Docker):** `node bot.js` (Patches via `node patch-bot.js` eingebacken).
- **Port:** 3000 (`PORT` überschreibbar).
- **Standalone:** Der frühere „MainBot" ist **raus** — `MAINBOT_URL` entfernt (Phase 3b2). Die App läuft eigenständig.
- **Datenhaltung:** **keine echte DB**, JSON-Dateien auf Disk via `datastore.js` (`daten.json` wird zur Laufzeit erzeugt, ist gitignored). Sessions/Push-Subs ebenfalls als JSON.
- **Helper-AI:** Google **Gemini** (`gemini-2.5-flash-lite`, Fallback `gemini-2.0-flash-lite`). In-App-Assistent „CreatorBoost". System-Prompt: `HELPER_SYSTEM_PROMPT` ab `bot.js:529`. Aktiv nur mit `GEMINI_API_KEY`, sonst Keyword/Admin-Fallback.

### Pflicht-Env-Variablen (sonst FATAL beim Start)
| Variable | Zweck |
|---|---|
| `BRIDGE_SECRET` | Auth-Secret |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | Web-Push VAPID-Keys |

VAPID lokal erzeugen: `node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log('VAPID_PUBLIC='+k.publicKey);console.log('VAPID_PRIVATE='+k.privateKey)"`

## 3. Design-System (existiert bereits)

- **Design-Tokens** in `:root` ab `bot.js:1739`: Farben, `--radius*`, `--font`/`--font-display`, **Type-Scale `--fs-xs…--fs-3xl`**, **Spacing-Skala `--space-0…--space-16` (4px-Basis)**, `--lh-*`, `--fw-*`, `--shadow*`, `--ring`. Themes `[data-theme=light|dark]`.
- **Komponenten-Kit `ui-*`** (~`bot.js:1803–1823`): `.ui-btn` (+`--secondary/--ghost/--sm`), `.ui-card`, `.ui-input`/`.ui-field`/`.ui-label`/`.ui-hint`, `.ui-modal*`, `.ui-empty*`.
- **Live-Styleguide:** Route **`/styleguide`** (`bot.js:7415`).
- Reduced-Motion ist gehandhabt (`bot.js:1791` no-preference, `1799` reduce).
- Eingeführt in Commit `7d762e6` „UI-Fundament v1".

> **Regel:** Neue UI **immer** auf Tokens + `ui-*`-Kit bauen. **Keine** neuen Inline-Styles, **keine** hardcoded `font-size`/Abstände.

## 4. Bekannte Technische Schulden (Adoption-Lücke)

Foundation existiert, ist aber nicht flächendeckend genutzt:
- **~2.661 Inline-`style=`** Attribute in `bot.js`.
- **~1.400 hardcoded `font-size:NNpx`** (umgehen die Type-Scale).
- **5 fragmentierte Farb-Paletten:** Gold-Seiten (`bot.js:5739, 5862, 6216, 6302`), Dashboard mit eigenem Namespace `--dgold/--dink` (`15278`), Landing (`8921`). → Konsistenz-Risiko.
- Nur **12 `@media`**-Queries (mobile-first, aber dünne Breakpoint-Abdeckung).

**Strategie:** Screen-für-Screen-Migration auf das Kit (Reihenfolge nach Traffic). Pro Screen: migrieren → `node --check` → committen → pushen.

## 5. Arbeitsmodus (Session-Prinzipien)

Prioritäten **immer in dieser Reihenfolge**:
1. **Stabilität** 2. UX 3. Geschwindigkeit 4. Retention 5. Engagement 6. Skalierbarkeit 7. Monetarisierung 8. Code-Eleganz

- **Anti-Halluzination:** keine erfundenen APIs/Framework-Features; Unsicherheit benennen; erst Code/History lesen, dann behaupten.
- **Production-ready only**, modular, mobile-first, secure by default, geringe Komplexität.
- UI-Qualitätslatte: Stripe / Linear / Notion / Vercel / Apple — minimalistisch-premium, subtile Animationen, kein Template-Look.
- **Ehrliche Grenzen von Claude (kein Floskel-Theater):** kann das eigene Modell **nicht** selbst umschalten (= `/model`-Einstellung des Users); unterdrückt **keine** echten Risiko-Hinweise.

## 6. Konventionen & Verifikation

- **Keine Tests, kein Runtime-Linter-Gate.** Verifikation: **`node --check bot.js`** (Syntax). Optional Server starten + Endpoints curlen + Seite im Browser prüfen.
- **Branch/Push (User-Wunsch, dauerhaft):** **Immer auf `main` pushen** — committen, dann als **Fast-Forward** auf `main` (`git push origin <feature>:main`). **Keine PRs.** Aktueller Arbeits-Branch: `claude/chat-performance-issue-ZtaCk`.
- Commit-Messages: kurz, beschreibend, deutsch.
- `bot.js` ist riesig → Änderungen gezielt, additiv, kollisionssicher (es gibt bereits `.btn`, `.card`, `.post*` etc. — Klassennamen prüfen, nicht überschreiben).

## 7. Entscheidungs-Log (chronologisch)

- **Prompt 1 „CreatorBoostX Core Operating System":** als **Session-Modus** übernommen (kein File), Stil prägt die Arbeit.
- **Prompt 2 „Ultimate UI/UX Transformation":** Audit ergab → Foundation existiert schon; echte Arbeit = **Adoption/Migration**, nicht Redesign. Stack ist SSR-HTML, **nicht** React/Tailwind (kein Framework-Rewrite ohne separate Entscheidung).
- **Feed-Migration:** Post-Karte (`bot.js:1883–1901`) — doppelte `.post-time`-Regel entfernt, Abstände auf `--space`-Skala, `font-size` auf `--fs`-Tokens. Tab-Trigger auf `--fs-base`. Feed war bereits ~90 % klassenbasiert; Rest-Inline-Styles sind legitim dynamisch → abgeschlossen.
- **Dashboard an App-Stil angeglichen** (`/dashboard`, `bot.js:15271–17532`): Gold **komplett** auf Lila-Akzent (`#d4af37→#7c3aed`, `#f5d76e→#cc5de8`, `#8b6914→#6d28d9`, dazu `rgba(212,175,55,*)`/`rgba(245,215,110,*)` und die `--dgold*`-Tokens), Font auf `var(--font)`. **Bewusst dunkle Fläche beibehalten** — Dashboard ist dark-only designt; `background:var(--bg)` würde Light-Mode brechen. Alle Ersetzungen **scoped** auf den Block (andere Gold-Seiten unberührt).
- **Explore (`/explore`, `bot.js:17533–18942`):** Nur **Token-Hygiene** — 75 exakte `font-size`-Werte (12/13/15/16/20/28px) auf `--fs-*`-Tokens. **Gold bewusst behalten** (Shop/Glücksrad/Gewinnspiel/Tiers Bronze-Silber-Gold = gewollter Belohnungs-/Premium-Look — *nicht* entgolden). Geprüft: Duplikat-Selektoren `.foot/.rl-*/.tb` sind **keine Defekte** — legitime Varianten (Dark-Override via `@media(prefers-color-scheme:dark)`, `.rl-btn:disabled .rl-btn-icon`, Gewinn-Tier-Varianten). Nicht mergen. **Neuer Nebenbefund:** der `tipps`/`newsletter`-Tab nutzt `@media(prefers-color-scheme:dark)` + hardcoded Farben statt des App-`[data-theme]`-Token-Systems → größere, risikobehaftete Konsistenz-Baustelle für später.
- **Profil + Einstellungen (`bot.js:19348–21246`):** Token-Hygiene — 74 exakte `font-size`-Werte auf `--fs-*`. `.pf-input`-„Duplikat" war False Positive (`.pf-input-with-icon .pf-input`). Kein Defekt.
- **Microcopy (Leerzustände):** Profil-Leerzustände mit Hinweis ergänzt (eigenes Profil motivierend, fremde Profile neutral „Hat noch nichts geteilt."/„…Projekte erstellt."), Newsletter-Leerzustand, konkreterer Notif-Fehlertext („Versuch es gleich nochmal." statt „Bitte später erneut versuchen."). **Begriffe bewusst unverändert** (Links/Posts/Projekte). Feed-Leerzustand war schon gut → nicht angefasst. Lade-/Filter-/CTA-/dynamische Leerzustände sind korrekt so → fertig.
- **Rest-Screens (`bot.js:13075–14460`) + Chat-Dateien:** `font-size`-Token-Hygiene für Nachrichten/Suche/Benachrichtigungen (30 Werte) sowie `chat-list-render.js`/`chat-detail-render.js` (15 Werte; gleicher Token-Scope, nutzen schon `var(--…)`). JS-berechnete `font-size:'+(size*0.38)+'` bewusst nicht angefasst. → `font-size`-Token-Hygiene damit **app-weit durch** (Rest sind Nicht-Skala-Größen 11/14/18px oder JS-berechnet).
- **CTA-Konsistenz:** Login-Link `→ Login` (`bot.js:5662`) auf `→ Zum Login` vereinheitlicht (an bestehende Variante). Sonst waren CTAs bereits konsistent; vermeintliche Treffer waren `<h1>`/`<title>`/Sub-Account (keine echten CTAs).
- **Spacing-Hygiene (app-weit):** ~785 **Einzelwert**-Deklarationen `padding/margin/gap` (+ Richtungs-Varianten) auf `--space-*`-Tokens (bot.js ~776, Chat-Dateien 9). Nur Einzelwerte (Trennzeichen-Constraint `[;}"']`), **keine Shorthands** → kein Token/Literal-Mix, wertgleich. Methode: temporäres `sed -E -f`-Skript (single-value-Regex), danach gelöscht. Negative Werte/`!important`/JS-berechnete bewusst ausgelassen.
- **Dashboard Light-Mode (vom User per Screenshot bestätigt ✅):** Dashboard ist jetzt **voll theme-aware** (vorher dark-only). Pass 1: `.dash-app`-Tokens auf kanonische (`--dink*→--bg*`, `--dline→--border`, `--dsub→--muted`, `background→var(--bg)`, `color→var(--text)`), plus scoped `color:#fff/#e7e7ea→var(--text)` und dunkle BG-Hex→`--bg*`. Pass 2 (nach Screenshots): „Geistertext" auf farbigen Flächen korrigiert — `.dash-topbar`-BG `rgba(8,8,10,.78)→var(--glass-bg)`, übersehenes Gold-Gradient `#f8e7a0/#a07a1c` in `.dash-btn-primary`+`.active`→`var(--accent)→var(--accent2)` mit `color:#fff`, sowie `.dash-row-avatar`/`.kbp-btn` zurück auf `#fff` (Text auf Gradient). **Regel gelernt:** `color:#fff` pauschal→`var(--text)` ist falsch für Text auf farbigen/Gradient-Flächen (Buttons/Tabs/Avatare) → dort Weiß behalten. **Offen (minimal):** 22× `rgba(255,255,255,…)` feine Trennlinien im Dashboard ggf. im Light-Mode unsichtbar — nur bei Bedarf theme-aware machen.
- **Dashboard-Modals theme-aware:** `.dash-modal-bg` hängt per `position:fixed` außerhalb `.dash-app` → die `--d*`-Tokens lösten dort nicht auf (Modals dunkel-auf-dunkel im Light-Mode). Fix: `--d*`-Token-Block **direkt auf `.dash-modal-bg`** definiert. Gilt für ALLE Dashboard-Modals (User-Detail, Event-Modals).
- **Dashboard aufgeräumt:** Buttons entfernt — Funnel Debug, Stats Debug, Kollab-Boost Preview, Neuen Sub erstellen, Play Store Listing. Handler-Funktionen/Seiten (`openFunnelDebug`, `/admin/play-listing` etc.) sind jetzt **toter Code** (Buttons weg = nicht erreichbar) — bei Bedarf komplett entfernen.
- **Feature: Account pausieren (soft)** — `bot-logic.js`: `pauseUserApi`/`unpauseUserApi` (setzen `u.paused`/`pausedAt`, kein Datenverlust). `bot.js`: `/api/admin/pause`-Route (Muster wie `/ban`), `isAppVisible` (`if(u.paused) return false`) + Feed-Stories-Filter blenden Pausierte aus Ranking/Explore/Suche/Stories aus; **Auto-Unpause** im Per-Request-Hook (`bot.js:5074`, try/catch-gesichert) sobald der User wieder aktiv ist. UI: „⏸️ Pausieren/▶️ Fortsetzen"-Button im User-Sheet bei Gefährliche Aktionen (`pauseUser()` Client-Handler). Admins können nicht pausiert werden.
- **Sheet-Aktionsbuttons (`.dash-act`) premiumiger:** flex-zentriert, `min-height:46px`, `radius:12px`, Press-Scale, Hover-Shadow, Danger-Hover-State.
- **MainBot-Sync-Statuskarte entfernt:** `#sync-health-banner` + `loadSyncHealth()`-Aufruf raus (Anzeige weg, Sync-Logik unberührt).
- **Toter Code entfernt (−328 Zeilen):** Client-Funktionen `openFunnelDebug/openStatsDebug/openKollabBoostPreview/testFunnelFire/loadSyncHealth/openSyncHealthDetail` + `.kbp-*`-CSS + Routen `/api/admin/funnel-debug|funnel-test|sync-health`. **`/api/admin/stats` BEHALTEN** (Haupt-Dashboard nutzt es, 2. Referenz in `loadStatsOverview`). `/admin/play-listing`-Seite bewusst gelassen (Routengrenze mehrdeutig, harmlos). **Lektion:** diese Funktionen liegen im Dashboard-Template-String → `node --check` prüft das innere JS NICHT; nur vollständige Funktionen (von `function X(){` bis schließendem `}`) entfernen.
- **Source-Vergleich entfernt** (`📱 Source-Vergleich`-Section + `renderSourceFunnel`-Aufruf). Funktion `renderSourceFunnel` bleibt als harmloser toter Code.
- **Dashboard-Sektionen ein-/ausklappbar:** idempotentes `makeSectionsCollapsible()` (nach `setInterval(refreshUsers…)`) hängt Chevron an jeden `.dash-section-hdr` + Klick toggelt `.collapsed` (CSS: `.dash-section.collapsed .dash-section-body{display:none}`). Idempotent gegen Re-Render (kein Doppel-Chevron).
- **Fix: gelöschte Diamant-Links** verschwinden jetzt auch aus der Dashboard-Liste — `diamondLinkAdminListApi` (bot-logic.js) filtert `deletedAt`. User-Feed (`diamondLinkFeedApi` → `_diamondActive`) filterte schon. Delete bleibt Soft-Delete (Daten erhalten), nur aus allen Ansichten ausgeblendet.
- **a11y: Dashboard-Modals tastaturbedienbar** (erster Hebel des app-weiten a11y-Passes): idempotentes `dashModalA11y()` (nach `makeSectionsCollapsible`) als **reiner Verhaltens-Layer** über alle `.dash-modal-bg` (User-Detail `~15784`, Event-Modal `~16040`) — **Escape** schließt das oberste Modal, **Backdrop-Klick** schließt, `role="dialog"`+`aria-modal="true"`+`tabindex="-1"` aufs `.dash-modal`, **Fokus** rein beim Öffnen (erstes fokussierbares Element) + zurück zum Auslöser beim Schließen (`_a11yTrigger`). MutationObserver erfasst dynamisch erzeugte/entfernte Modals (childList) → greift für alle Schließ-Pfade inkl. der `this.closest('.dash-modal-bg').remove()`-Buttons. **Modal-Erzeugung bleibt unangetastet.** (Hinweis: die abgestürzte Vor-Session hatte hier nur „11 Befehle/Datei gelöscht" — der Abbruch war ein Plattform-API-Fehler „thinking blocks cannot be modified", kein Code-Defekt; Arbeitsbaum war sauber, nichts ging verloren.)

## 8. Nächste sinnvolle Schritte

0. **a11y-Pass app-weit fortsetzen** (Dashboard-Modals sind erledigt): weitere `<div onclick>` → echte `<button>`/`role`, fehlende `aria-label` an Icon-Buttons, restliche Modals (App-Chat/DM/Helper) mit `role="dialog"` + Escape/Backdrop nach dem `dashModalA11y()`-Muster. Gezielt pro Screen statt blind app-weit (viele Dateien).
1. **Optional/riskant (visuelles QA nötig):** `tipps`/`newsletter`-Tab von `@media(prefers-color-scheme:dark)`+Hardcoded-Farben auf `[data-theme]`-Tokens (gleiches Vorgehen wie Dashboard: Pass 1 mechanisch, Pass 2 per Screenshot).
2. Restliche Spacing-Shorthands (`padding:12px 16px` etc.) tokenisieren — nur sinnvoll mit per-Wert-Tokenisierung, mehr Aufwand/Risiko.
3. Onboarding-Flow-Texte / weitere Microcopy auf Wunsch.

## 9. Hinweise / Fallen

- **Gold-Premium-Seiten** (`bot.js:5862, 6216, 6302` u. a.) sind **weiterhin gold** — das ist gewollt, nicht anfassen ohne Auftrag.
- Scoped-Ersetzungen in `bot.js` per `sed -i 'START,END s/…/…/g'` (Zeilenbereich!), nie global — sonst werden andere Seiten getroffen.
- Vor Hex→`var()`: Kontext prüfen (CSS vs. SVG-`fill=`/JS-String). In JS-Strings nur Hex→Hex ersetzen.
- **Git-Workflow (User-Wunsch, dauerhaft): IMMER auf `main` pushen.** Nach jedem Commit auf dem Arbeits-Branch direkt als **Fast-Forward** auf `main` (`git push origin <feature>:main`) — ohne Rückfrage, keine PRs. `main` = Produktion (Deploy via Procfile/Dockerfile). **Nur FF, nie `--force`;** echtes Remote-`main` per `git ls-remote origin main` prüfen, lokaler `main`-Ref kann stale sein. Wenn nicht FF-bar: erst rebasen, nicht forcen.
