FROM node:22-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 compiles a native Node addon when a prebuilt binary is unavailable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN groupadd --system --gid 10001 sortsight \
  && useradd --system --uid 10001 --gid sortsight --home-dir /app sortsight \
  && mkdir -p /app/data \
  && chown -R sortsight:sortsight /app

COPY --from=build --chown=sortsight:sortsight /app/node_modules ./node_modules
COPY --from=build --chown=sortsight:sortsight /app/package.json ./package.json
COPY --from=build --chown=sortsight:sortsight /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=sortsight:sortsight /app/server.ts ./server.ts
COPY --from=build --chown=sortsight:sortsight /app/server ./server
COPY --from=build --chown=sortsight:sortsight /app/dist ./dist

USER sortsight
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
