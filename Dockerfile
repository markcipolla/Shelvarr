# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S komgarr && \
    adduser -S komgarr -u 1001 -G komgarr

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built JS and assets
COPY --from=builder /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql
COPY src/public ./dist/public

# Create data directory
RUN mkdir -p /app/data && chown -R komgarr:komgarr /app/data

USER komgarr

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV LIBRARY_ROOT=/libraries

EXPOSE 3000

CMD ["node", "dist/index.js"]
