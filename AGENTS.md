# AGENTS.md

## Cursor Cloud specific instructions

### Quick reference

- **Runtime:** Node.js 20.x (required by `engines` in `package.json`)
- **Package manager:** npm (`package-lock.json`)
- **Only production dependency:** `web-push`
- **Entry point (dev):** `node bot-loader.js` (applies runtime patches to `bot.js`)
- **Entry point (prod/Docker):** `node bot.js` (patches baked in at build time via `node patch-bot.js`)
- **Port:** 3000 (configurable via `PORT` env var)

### Required environment variables to start the server

All three are **FATAL** — the process exits immediately if any is missing:

| Variable | Purpose |
|---|---|
| `BRIDGE_SECRET` | Auth secret for MainBot API communication |
| `VAPID_PUBLIC` | Web Push VAPID public key |
| `VAPID_PRIVATE` | Web Push VAPID private key |

For local development, generate VAPID keys with:
```
node -e "const wp = require('web-push'); const k = wp.generateVAPIDKeys(); console.log('VAPID_PUBLIC=' + k.publicKey); console.log('VAPID_PRIVATE=' + k.privateKey);"
```

### Starting the dev server

```bash
BRIDGE_SECRET=dev-secret-123 \
VAPID_PUBLIC=<generated-public-key> \
VAPID_PRIVATE=<generated-private-key> \
node bot-loader.js
```

The app will start on port 3000. Without a valid `MAINBOT_URL`, most authenticated pages will show a 503 (data unavailable), but the landing page, `/info`, `/newsletter`, and static assets all work.

### Syntax checking (no linter configured)

There is no ESLint or other linter set up. Use `node --check bot.js` to verify syntax.

### Testing (no test framework configured)

There are no automated tests. Verify changes by:
1. `node --check bot.js` — syntax validation
2. Start the server and curl endpoints
3. Browser-test specific pages

### Build-time patching

`patch-bot.js` modifies `bot.js` in-place with multiple patches (chat rendering, theming, routes, etc.). This is used in Docker builds. For development, `bot-loader.js` applies a subset of these patches at runtime instead.

### Architecture note

`bot.js` is a ~11,500-line monolithic HTTP server with server-side rendered HTML (no frontend framework). All user data is fetched from an external "MainBot" Telegram bot backend via `MAINBOT_URL`. The app uses JSON files on disk for sessions and push subscriptions — no traditional database.
