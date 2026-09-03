# ==============================================================================
# Multi-stage Dockerfile for Shelvarr
# Target: web (Next.js on :3000)
# ==============================================================================

# --- Base stage: install pnpm and build dependencies ---
FROM node:24-alpine AS base

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./

# Copy all package.json files for workspace resolution
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/services/package.json packages/services/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/ packages/
COPY apps/web/ apps/web/

# --- Web build stage ---
FROM base AS web-builder

# The build context has no .git, so the About screen's build id has to be
# handed in. Defaults to "dev" for ad-hoc local builds.
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

WORKDIR /app/apps/web
RUN pnpm build

# --- Web runtime ---
FROM node:24-alpine AS web

WORKDIR /app

RUN addgroup -g 1001 -S shelvarr && \
    adduser -S shelvarr -u 1001 -G shelvarr

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR=/app/data
ENV LIBRARY_ROOT=/libraries

# Copy Next.js standalone output
COPY --from=web-builder /app/apps/web/public ./public
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy database schema (needed for DB init)
COPY --from=web-builder /app/packages/db/schema.sql ./packages/db/schema.sql

RUN mkdir -p /app/data && chown -R shelvarr:shelvarr /app

USER shelvarr

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
