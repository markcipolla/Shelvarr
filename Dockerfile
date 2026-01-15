# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY tailwind.config.js ./
RUN npm ci

COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S shelvarr && \
    adduser -S shelvarr -u 1001 -G shelvarr

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built JS and assets
COPY --from=builder /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql
COPY src/public ./dist/public

# Create data directory
RUN mkdir -p /app/data && chown -R shelvarr:shelvarr /app/data

USER shelvarr

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV LIBRARY_ROOT=/libraries

EXPOSE 3000

CMD ["node", "dist/index.js"]
