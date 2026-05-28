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
- **Branch:** `claude/creatorboostx-system-prompt-b3F27`. Nur hierhin pushen. **Keine PRs ohne explizite Aufforderung.**
- Commit-Messages: kurz, beschreibend, deutsch.
- `bot.js` ist riesig → Änderungen gezielt, additiv, kollisionssicher (es gibt bereits `.btn`, `.card`, `.post*` etc. — Klassennamen prüfen, nicht überschreiben).

## 7. Entscheidungs-Log (chronologisch)

- **Prompt 1 „CreatorBoostX Core Operating System":** als **Session-Modus** übernommen (kein File), Stil prägt die Arbeit.
- **Prompt 2 „Ultimate UI/UX Transformation":** Audit ergab → Foundation existiert schon; echte Arbeit = **Adoption/Migration**, nicht Redesign. Stack ist SSR-HTML, **nicht** React/Tailwind (kein Framework-Rewrite ohne separate Entscheidung).
- **Feed-Migration gestartet:** Post-Karte (`bot.js:1883–1901`) — doppelte `.post-time`-Regel entfernt, Abstände auf `--space`-Skala, `font-size` auf `--fs`-Tokens. Verhalten visuell ~identisch (≤2px).

## 8. Nächste sinnvolle Schritte

1. Feed-Migration fortführen (Stories-Modal, Tabs, Empty-States auf `ui-*`).
2. Dann nach Traffic: `/explore` (Shop/Roulette/Ranking), `/profil`+`/einstellungen`, `/dashboard` (eigene `--dgold/--dink`-Tokens auf kanonische Tokens vereinheitlichen = größter Konsistenz-Sprung).
3. Microcopy der High-Traffic-Strings (Onboarding, Empty-States, primäre CTAs) schärfen.
