# ─────────────────────────────────────────────────────────────
# Etapa 1 (deps): instala SOLO dependencias de producción.
# Aquí viven python3/make/g++ por si better-sqlite3 necesita compilar;
# no llegan a la imagen final.
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# --ignore-scripts evita hooks como "prepare" (husky); luego se compila
# únicamente el binario nativo de better-sqlite3.
RUN npm ci --omit=dev --ignore-scripts \
 && npm rebuild better-sqlite3 \
 && npm cache clean --force

# ─────────────────────────────────────────────────────────────
# Etapa 2 (runtime): imagen final ligera, sin compiladores.
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    SOCKET_PORT=6061 \
    DB_PATH=/app/data/webapp.db \
    BACKUP_DIR=/app/backups

# Commit y versión inyectados por GitHub Actions (--build-arg)
ARG GIT_SHA=local
ARG APP_VERSION=1.0.0
ENV GIT_SHA=$GIT_SHA \
    APP_VERSION=$APP_VERSION

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json app.js db.js socket.js server.js ./
COPY --chown=node:node public ./public

RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups

# No correr como root
USER node

EXPOSE 8080 6061

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||8080)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
