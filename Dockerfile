FROM node:20-bookworm-slim

# Java + apksigner für APK-Signierung (v2/v3 scheme)
RUN apt-get update && apt-get install -y --no-install-recommends default-jdk-headless apksigner zipalign && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies installieren
COPY package*.json ./
RUN npm install --omit=dev

# App-Code kopieren
COPY . .

# bot.js mit Regeln-Tab patchen (build-time)
RUN node patch-bot.js

EXPOSE 3000

# Direkt bot.js starten - kein Loader notig weil Patch schon im Build geschah
CMD ["node", "bot.js"]
