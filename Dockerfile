# === Build stage: patch bot.js (no JDK needed) ===
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# bot.js mit Regeln-Tab patchen (build-time)
RUN node patch-bot.js

# === Runtime stage: slim image without JDK ===
FROM node:20-bookworm-slim

WORKDIR /app

# Copy only the built app (node_modules + patched source)
COPY --from=builder /app .

EXPOSE 3000

CMD ["node", "bot.js"]
