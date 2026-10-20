# syntax=docker/dockerfile:1
#
# WikiFrames production image.
#
#   docker build -t wikiframes .
#   docker compose up -d        # app + PostgreSQL, see docker-compose.yml
#
# Multi-stage: dependencies and the build happen in throwaway stages; the
# final image holds only the standalone server, runs as an unprivileged user,
# and carries the fonts the server needs to draw badges in any script.

ARG NODE_VERSION=22

# ── dependencies ────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 NEXT_TELEMETRY_DISABLED=1
# Prisma picks its query engine by the OpenSSL it finds; without it here the
# generated client targets the wrong OpenSSL and cannot load at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY . .
ENV NODE_ENV=production NEXT_OUTPUT=standalone
RUN npx prisma generate && npx next build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

# Fonts for server-rendered role badges: Latin plus the scripts of the
# movement's largest communities, and colour emoji (badges end in one).
# Image layers keep whole-second timestamps, so round the font directories'
# times before building the font cache, or fontconfig finds it stale at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk fontconfig openssl ca-certificates \
 && find /usr/share/fonts -type d -exec touch -m -d "@$(date +%s)" {} + \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_ROOT=/data/storage

RUN groupadd --system --gid 1001 wikiframes \
 && useradd --system --uid 1001 --gid wikiframes --home /app wikiframes \
 && mkdir -p /data/storage \
 && chown -R wikiframes:wikiframes /data

COPY --from=build --chown=wikiframes:wikiframes /app/.next/standalone ./
COPY --from=build --chown=wikiframes:wikiframes /app/.next/static ./.next/static
COPY --from=build --chown=wikiframes:wikiframes /app/public ./public
COPY --from=build --chown=wikiframes:wikiframes /app/prisma ./prisma
COPY --from=build --chown=wikiframes:wikiframes /app/scripts ./scripts
COPY --from=build --chown=wikiframes:wikiframes /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=wikiframes:wikiframes /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=wikiframes:wikiframes /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/.cache && chown wikiframes:wikiframes /app/.cache

USER wikiframes
# sharp bundles its own fontconfig; build its font cache now so the first
# badge renders fast and the server never warns about a missing cache.
RUN node -e "require('sharp')({ text: { text: 'WikiFrames', rgba: true } }).png().toBuffer()" \
 && fc-cache
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply the schema, then start. `db push` is idempotent; switch to
# `prisma migrate deploy` once you keep migrations.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate && node server.js"]
