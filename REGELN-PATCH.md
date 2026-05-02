# Regeln-Tab Patch — Anleitung

## Was wird geändert?

Der Placeholder "🔧 In Bearbeitung — Inhalte folgen bald!" im **Explore-Tab → Regeln lesen** wird durch eine vollständige Doku-Tab-Seite ersetzt.

## Schritt-für-Schritt

1. Öffne `bot.js` lokal in deinem Editor
2. Drücke `Strg+F` (oder `Cmd+F`) und suche:
   ```
   regeln: `<div style="padding:48px
   ```
3. Du landest in **Zeile 3711** mit dieser Zeile:
   ```javascript
   regeln: `<div style="padding:48px 24px;text-align:center"><div style="font-size:48px;margin-bottom:16px">📋</div><div style="font-size:17px;font-weight:700;margin-bottom:8px">Community Regeln</div><div style="font-size:13px;color:var(--muted)">🔧 In Bearbeitung — Inhalte folgen bald!</div></div>`,
   ```
4. **Markiere die ganze Zeile** und ersetze sie komplett durch den Inhalt aus `regeln-tab-content.js` (siehe Datei daneben in diesem Branch)
5. Speichern, deployen, fertig!

## Was bekommst du dann?

- 📜 Header mit Stand & Versionsnummer
- Sticky Tab-Navigation oben (9 Tabs: Mission, Start, Links, Respekt, Missionen, Superlinks, Warns, XP, Shop)
- Tabs scrollen horizontal auf Mobile
- IntersectionObserver markiert aktiven Tab automatisch beim Scrollen
- Smooth-Scroll zur jeweiligen Sektion bei Tab-Klick
- Cards mit Doku-Style (Trennlinien, Konsequenz-Badges, Warum-Boxen)
- Konsistent mit dem bestehenden Design (CSS-Variablen, Lila-Akzent wie der Rest)

## Achtung

- Datei bot.js ist 376KB groß — daher dieser Patch-Workflow statt direkter Push
- JS-Syntax wurde mit `node --check` geprüft → kein Fehler
- Nach Replacement nochmal `node --check bot.js` ausführen zur Sicherheit

## Live-Vorschau

Nach Deploy: in der App auf **Explore → "Regeln lesen"** tippen → siehst du den neuen Doku-Style.
