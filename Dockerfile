# Multi-Stage Dockerfile — loest Disk-Space-Probleme beim Build
# UND behaelt apksigner + zipalign fuer die Live-/api/sign-apk Funktion.
#
# Stage 1 (Builder): Nur Node-Tools fuer npm install + patch-bot.js
# Stage 2 (Runtime): Schlankes JRE + apksigner + zipalign + fertige App
#
# Spart ~150 MB durch JRE statt JDK + Multi-Stage Pruning beim Build.

# ── STAGE 1: BUILDER ──
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Dependencies installieren (production-only)
COPY package*.json ./
RUN npm install --omit=dev

# App-Code kopieren
COPY . .

# bot.js mit Regeln-Tab patchen (build-time, kein Java noetig)
RUN node patch-bot.js


# ── STAGE 2: RUNTIME ──
FROM node:20-bookworm-slim

# JRE (statt JDK, ~150MB kleiner) + apksigner + zipalign fuer Live-Signing
# der /api/sign-apk Endpoint benoetigt diese Tools zur Laufzeit.
RUN apt-get update && apt-get install -y --no-install-recommends \
        default-jre-headless apksigner zipalign \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Fertige App vom Builder kopieren (inkl. node_modules + gepatchte bot.js)
COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "bot.js"]
