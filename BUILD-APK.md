# APK-Build automatisieren (statt pwabuilder.com manuell)

Dein APK ist ein **TWA** (Trusted Web Activity) — ein Android-Wrapper um die PWA. Code/Layout-Updates ziehen automatisch durch (Service Worker). Nur **Icon, App-Name und Splash-Screen** sind im APK gebacken und brauchen einen Rebuild.

Statt jedes Mal pwabuilder.com manuell durchzuklicken: einmalig Bubblewrap CLI auf deinem Rechner einrichten, dann ist es ein npm-Befehl.

## Voraussetzungen (einmalig)

1. **Java 17 JDK** → https://adoptium.net/ (Bubblewrap braucht's)
2. **Node 20+** (hast du schon)
3. **Android SDK** (Bubblewrap lädt automatisch — kein extra Setup)

## Setup (einmalig)

```bash
# Im creatorboost-app/ Verzeichnis
export PWA_HOST="dein-host.onrender.com"

# Bubblewrap aus dem twa-manifest.json initialisieren
npm run apk:init
# -> erzeugt Android-Projekt-Dateien (gradle, java, build-config etc.)
# Bei Fragen: PackageId = app.creatorx.twa, Display = standalone, etc.
# Beim ersten Lauf wird Android SDK runtergeladen (~500 MB, einmalig)

# Signing-Keystore generieren (einmalig — speichern!)
keytool -genkey -v -keystore android.keystore \
  -alias android -keyalg RSA -keysize 2048 -validity 10000
# Passwörter merken — die brauchst du bei jedem build
```

## APK bauen (jedes Mal wenn Icon/Name/Version geändert)

```bash
# Version bumpen (z.B. 1.0.0 → 1.0.1, code 1 → 2)
export VERSION="1.0.1"
export VCODE=2

# In twa-manifest.json: appVersionName + appVersionCode anpassen
# (oder: npm run apk:update — automatisiert das via Bubblewrap)

# APK bauen
npm run apk:build
# Output: app-release-signed.apk (signiert mit deinem keystore)

# Hochladen auf deinen Server
curl -F "apk=@app-release-signed.apk" https://$PWA_HOST/api/upload-apk?key=$BRIDGE_SECRET
# (oder einfach in DATA_DIR/CreatorX-signed.apk reinkopieren)
```

## Was wird automatisch gefetcht?

Beim Build liest Bubblewrap **deinen aktuellen** `manifest.json`:
- Icon → `iconUrl` aus twa-manifest.json (zeigt auf `/icon-512.png?v=25`)
- Name → `name` Feld
- Theme-Color, Background-Color
- Start-URL

Heißt: **Wenn du das Icon im Server bot.js änderst und v=25 → v=26 bumpst**, dann muss nur noch:
1. `twa-manifest.json` iconUrl auf `?v=26` ändern
2. `npm run apk:full` (update version + build)
3. Neue APK hochladen

## Auto-Update für deine User

Die installierte APK kann sich nicht selbst updaten (Android-Security). Aber:

- **Code/Features**: Update kommt automatisch beim nächsten App-Start (PWA-Inhalt im TWA)
- **Icon-Update**: User muss neue APK installieren → ich kann dir einen In-App-Banner einbauen der erkennt „läuft im APK" und „neue Version verfügbar — hier neu installieren" zeigt

## CI/CD (optional, voll automatisch)

Wenn du das in GitHub Actions hinpackst, baut es bei jedem Push auf main automatisch. Sag Bescheid wenn du das willst — dann baue ich `.github/workflows/apk.yml` rein.
