# MIGRATION — Datastore-Umzug: App eigenständig ohne telegram-bot

> Ziel: Die CreatorBoost-App (`bot.js` dieses Repos) soll vollständig **ohne den
> telegram-bot ("MainBot")** laufen. Heute holt die App ihre Daten über `MAINBOT_URL`
> vom Bot. Nach dem Umzug liest/schreibt sie alles im **eigenen Datastore**
> (`datastore.js`) über die portierte Logik in `bot-logic.js`.
>
> Diese Datei ist die dauerhafte Roadmap. Sie ersetzt die bisher nur im Chat
> existierende Planung. **Stand: 2026-05-27** (aus dem Code-Audit rekonstruiert).

---

## 1. Architektur

```
  [ CreatorBoost-App (dieses Repo) ]            [ telegram-bot ("MainBot") ]
   bot.js  (HTTP/SSR, ~21k Zeilen)               bot.js  (Express-API + Telegraf)
   ├─ datastore.js   ← eigener JSON-Store         ├─ daten.json  ← Quell-Datenbestand
   ├─ bot-logic.js   ← portierte Bot-Logik        └─ /admin/raw-export  (Migrations-Export)
   └─ LOCAL_STORE=1  ← schaltet lokal um
```

- **Heute (ohne `LOCAL_STORE`)**: jede Lese-/Schreib-Route ruft `fetchBot()` / `postBot()`
  → HTTP an `MAINBOT_URL` (mit `x-bridge-secret: BRIDGE_SECRET`).
- **Nach Umzug (`LOCAL_STORE=1`)**: die Route nutzt `bot-logic.js` + `datastore.js` lokal.
- Umschaltung erfolgt **Route für Route** über `if (LOCAL_STORE) { …lokal… } else { …postBot… }`.

---

## 2. Stand jetzt (erledigt)

**telegram-bot:**
- ✅ `/admin/raw-export` — byte-treuer Export inkl. `password_hash` (doppelt gated:
  `BRIDGE_SECRET` **und** env `MIGRATION_EXPORT=1`). Quelle für den Daten-Umzug.
- ✅ Läuft **ohne Telegram** (App-Backend-Modus): ohne `BOT_TOKEN` startet nur die
  Express-API, kein `process.exit` mehr (Telegram-Stub). Backward-kompatibel.

**App:**
- ✅ `datastore.js` — eigener Store (`importSnapshot`, `projectDataLikeBot`, save/load).
- ✅ `bot-logic.js` (2233 Z.) — viele Mutationen portiert (createPostApi, deletePostApi,
  commentApi, addXp, addSuperlink, buyItemApi, Missionen, Rankings, Cron `zeitCheck` …).
- ✅ `LOCAL_STORE`-Flag + Boot-Pfad (`load`/`init`, lokaler Cron).
- ✅ `/data`-Lesepfad lokal: `fetchBot('/data')` → `datastore.projectDataLikeBot(...)`.
- ✅ Etappen 3a–3q + Phase B: Feed-, Like-, Explore-, Nachrichten-Routen verdrahtet
  (jeweils E2E-getestet laut Commit-Historie).
- ✅ Migrations-Skript `scripts/snapshot-from-bot.js` (`npm run migrate:snapshot`).

---

## 3. Was noch fehlt (Audit-Ergebnis)

Messpunkte im aktuellen `bot.js`:
- **132** `postBot(...)`-Aufrufe (Schreibrouten) vs. nur **42** `LOCAL_STORE`-Zweige.
- **76** `fetchBot(...)` + **26** `fetchBotRaw(...)` (Leserouten) — bisher nur `/data` lokal.
- **18** direkte `MAINBOT_URL`-Stellen (siehe Tabelle).

### A. Daten kopieren (operativ — nur mit Live-Zugang)
1. Am **Live-Bot** temporär `MIGRATION_EXPORT=1` setzen (Railway → telegram-bot → Variables).
2. In der **App**: `MAINBOT_URL=https://<bot> BRIDGE_SECRET=<secret> npm run migrate:snapshot`
   → zieht `/admin/raw-export`, legt Backup unter `DATA_DIR/migration-backups/` ab und
   importiert via `datastore.importSnapshot()` in `APP_DATA_FILE`.
3. `MIGRATION_EXPORT` am Bot danach wieder **entfernen**.

> ⚠️ Diese Schritte kann nur jemand mit Railway-Zugang + echtem `BRIDGE_SECRET`
> ausführen. Aus einer Sandbox ohne Live-Netz/Secrets geht das nicht.

### B. Schreib-Routen cutover (Code — Route für Route)
Für jede Route, die noch nur `postBot(path, body)` ruft, einen `LOCAL_STORE`-Zweig
ergänzen, der die passende `bot-logic`-Mutation aufruft + `datastore.saveDebounced()`.
Vorlage siehe bereits migrierte Routen (z. B. `/api/like`, Feed-Posts).
- **Konkret offen u. a.: `/delete-link`** (`bot.js` ~Z. 9595) — ruft immer den Bot.
  Lokal: `bot-logic` Link-Delete + Save. (TG-Cleanup entfällt im App-Backend-Modus.)
- Vollständige Liste: `grep -nE '\bpostBot\(' bot.js` und prüfen, welche **nicht** in
  einem `if (LOCAL_STORE)`-Block stehen.

### C. Lese-Routen cutover
`grep -nE '\bfetchBot(Raw)?\(' bot.js` — alle Pfade außer `/data` gehen noch an den Bot.
Pro Pfad entscheiden: lokal aus `datastore.getData()` projizieren oder Route entfernen.

### D. Binärdaten (Bilder/Dateien)
- **`/bild/<uid>/<type>`** (~Z. 4928): App nutzt eigenes Volume, fällt aber auf Bot-Volume
  zurück. Für echten Standalone die Bild-Dateien vom Bot-Volume ins App-Volume kopieren
  (separates Railway-Volume!) — sonst bleiben Altbilder nur per Proxy erreichbar.
- **`/api/tg-file/<fileId>`** (~Z. 20999): Telegram-CDN-Dateien. Ohne Telegram nicht mehr
  nachladbar → einmalig herunterladen/kopieren oder Feature deaktivieren. **Entscheidung nötig.**

### E. Diagnose/Status (kann bis zuletzt bleiben)
`MAINBOT_URL` in Status-/Health-/Hilfetexten: `bot.js` Z. 9, 30, 4451, 4574–4575, 4602,
7321, 7324, 15861. Nach vollständigem Cutover anpassen/entfernen.

### F. Abschluss
Wenn A–D erledigt und LOCAL_STORE dauerhaft an ist:
- `MAINBOT_URL`-Plumbing entfernen: `fetchBot`/`fetchBotRaw`/`postBot`/`_postBotRaw` +
  Write-Queue + Refresh-Cache.
- telegram-bot als Datenquelle abschalten (kann dann ganz weg, oder rein als
  Telegram-Frontend mit eigenem Datenpfad weiterlaufen).

### Offene `MAINBOT_URL`-Stellen (Audit)

| Zeile (ca.) | Stelle | Kategorie |
|---|---|---|
| 9, 30 | Deklaration + Boot-Log | E (bleibt) |
| 1168 | `fetchBotRawOnce` (GET-Proxy) | F (Plumbing) |
| 1204–1205 | `fetchRawExport` (Migrations-Abzug) | A (Tool) |
| 1368 | `_postBotRaw` (Queue-Worker) | F (Plumbing) |
| 1417 | `postBot` (Schreib-Proxy) | F (Plumbing) |
| 4451, 4574–4575, 4602 | Status/Config-Anzeige | E (bleibt) |
| 4928 | `/bild/`-Proxy | D (Binärdaten) |
| 7321, 7324 | Mainbot-Health-Endpoint | E (bleibt) |
| 9595 | `/delete-link`-Proxy | B (Schreibroute) |
| 15861 | Hilfetext | E (bleibt) |
| 20999 | `/api/tg-file/`-Proxy | D (Binärdaten) |

---

## 4. Environment-Variablen

**telegram-bot** (App-Backend-Modus / Migration):
| Variable | Zweck |
|---|---|
| `BRIDGE_SECRET` | Pflicht. Auth zwischen App und Bot / für raw-export. |
| `MIGRATION_EXPORT` | `1` nur während des Daten-Abzugs, danach entfernen. |
| `BOT_TOKEN` | **Weglassen** → App-Backend-Modus (kein Telegram). |
| `DATA_FILE`, `PORT`, `APP_URL` | wie gehabt. |

**App** (Standalone-Zielzustand):
| Variable | Zweck |
|---|---|
| `BRIDGE_SECRET` | Pflicht (FATAL ohne). |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | Pflicht (Web-Push, FATAL ohne). |
| `LOCAL_STORE` | `1` → liest/schreibt eigenen Datastore. |
| `APP_DATA_FILE` | Pfad des App-Stores (Default `/data/daten.json`). |
| `MAINBOT_URL` | Nur noch für Migration/Proxy-Reste; nach Abschluss entfernbar. |

VAPID-Keys erzeugen:
```
node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log('VAPID_PUBLIC='+k.publicKey);console.log('VAPID_PRIVATE='+k.privateKey)"
```

---

## 5. Empfohlene Reihenfolge (Cutover-Runbook)

1. **B + C im Code fertig** (alle Schreib-/Lese-Routen mit `LOCAL_STORE`-Zweig),
   lokal mit Snapshot-Daten testen (`LOCAL_STORE=1` + Test-`APP_DATA_FILE`).
2. **Daten-Abzug (A)** gegen Live-Bot ziehen.
3. **Binärdaten (D)** kopieren / Entscheidung treffen.
4. App mit `LOCAL_STORE=1` deployen; in Schreib-/Lese-Pfaden gegen die Snapshot-Daten
   verifizieren.
5. Erst wenn stabil: telegram-bot als Datenquelle abschalten, Plumbing entfernen (F).

**Rollback** jederzeit: `LOCAL_STORE` entfernen → App liest wieder vom Bot (sofern
`MAINBOT_URL` + Plumbing noch vorhanden).

---

## 6. Nützliche Audit-Befehle
```
# Schreibrouten ohne LOCAL_STORE-Zweig finden:
grep -nE '\bpostBot\(' bot.js
# Leserouten (alles außer /data noch am Bot):
grep -nE '\bfetchBot(Raw)?\(' bot.js
# Alle direkten Bot-URL-Stellen:
grep -nE 'MAINBOT_URL' bot.js
# Syntax-Check:
node --check bot.js
```
