# ─── Stage 1: Build ────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Install web dependencies
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci

# Copy source code
COPY server/ ./server/
COPY web/ ./web/

# Build server (TypeScript → JavaScript)
RUN cd server && npx tsc

# Build frontend (Vite → static files)
RUN cd web && npx vite build

# ─── Stage 2: Production ──────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy server build + production dependencies
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/package-lock.json ./server/

# Copy built frontend
COPY --from=builder /app/web/dist ./web/dist

# Install production-only server dependencies
RUN cd server && npm ci --omit=dev

# Cloud Run sets PORT automatically
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

WORKDIR /app/server

CMD ["node", "dist/index.js"]
