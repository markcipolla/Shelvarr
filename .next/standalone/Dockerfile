# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S shelvarr && \
    adduser -S shelvarr -u 1001 -G shelvarr

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR=/app/data
ENV LIBRARY_ROOT=/libraries

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy database schema
COPY --from=builder /app/lib/db/schema.sql ./lib/db/schema.sql

# Create data directory
RUN mkdir -p /app/data && chown -R shelvarr:shelvarr /app

USER shelvarr

EXPOSE 3000

CMD ["node", "server.js"]
