# syntax=docker/dockerfile:1

# ---------- Etapa 1: compilar cliente y servidor ----------
FROM node:22-slim AS build
WORKDIR /app

# Primero solo los manifiestos, para aprovechar la caché de capas.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# --ignore-scripts: better-sqlite3 trae binding.gyp, y sin esto npm intenta compilarlo con
# node-gyp, que necesita Python y un compilador. No hace falta: el paquete trae binarios
# precompilados para Linux, y la compilación del cliente y del servidor ni siquiera lo carga.
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY client client
RUN npm run build

# ---------- Etapa 2: imagen de ejecución (sin herramientas de desarrollo) ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/pizarra.db
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# better-sqlite3 trae binarios precompilados para Linux: no hace falta compilar nada.
RUN npm ci --omit=dev --ignore-scripts --workspace @pizarra/server \
  && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY server/data server/data

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
