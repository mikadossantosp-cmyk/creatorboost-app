# Schlankes Multi-Stage Dockerfile (~150 MB)
# Ohne JDK/apksigner/zipalign — APK ist bereits signiert, /api/sign-apk
# wird nicht mehr aktiv genutzt. Falls spaeter wieder noetig: einfach
# default-jre-headless + apksigner + zipalign in Stage 2 hinzufuegen.

# ── STAGE 1: BUILDER ──
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Dependencies installieren (production-only)
COPY package*.json ./
RUN npm install --omit=dev

# App-Code kopieren
COPY . .

# bot.js mit Regeln-Tab patchen (build-time)
RUN node patch-bot.js


# ── STAGE 2: RUNTIME (slim) ──
FROM node:20-bookworm-slim

WORKDIR /app

# Fertige App vom Builder (inkl. node_modules + gepatchte bot.js)
COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "bot.js"]
