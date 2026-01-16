# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY tailwind.config.js ./
RUN npm ci

COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S shelvarr && \
    adduser -S shelvarr -u 1001 -G shelvarr

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built JS and assets
COPY --from=builder /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql
# Copy static public files (HTML, JS, images)
COPY src/public ./dist/public
# Copy compiled CSS (overwrites the source CSS with built version)
COPY --from=builder /app/dist/public/css/styles.css ./dist/public/css/styles.css

# Create data directory
RUN mkdir -p /app/data && chown -R shelvarr:shelvarr /app/data

USER shelvarr

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV LIBRARY_ROOT=/libraries

EXPOSE 3000

CMD ["node", "dist/index.js"]
