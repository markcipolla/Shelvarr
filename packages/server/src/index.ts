import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { join } from 'path';
import { initDatabase } from '@shelvarr/db';
import { initServiceConfig } from '@shelvarr/services/config';

import { authMiddleware } from './middleware/auth';
import libraries from './routes/libraries';
import series from './routes/series';
import books from './routes/books';
import readingStatus from './routes/reading-status';

// Initialize database and services
const dataDir = process.env['DATA_DIR'] || process.cwd() + '/data';
const dbPath = process.env['DB_PATH'] || join(dataDir, 'shelvarr.db');
const libraryRoot = process.env['LIBRARY_ROOT'] || process.cwd();
initDatabase(dbPath);
initServiceConfig({
  env: process.env['NODE_ENV'] || 'production',
  dbPath,
  dataDir,
  libraryRoot,
  port: parseInt(process.env['PORT'] || '3001'),
  supportedExtensions: ['.epub', '.pdf', '.cbz', '.cbr', '.mobi', '.azw3'],
  hardcoverToken: process.env['HARDCOVER_API_TOKEN'] || null,
  komga: {
    url: process.env['KOMGA_URL'] || null,
    apiKey: process.env['KOMGA_API_KEY'] || null,
  },
  rateLimits: {
    hardcover: 30,
  },
});

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('/api/*', authMiddleware);

// Mount routes
app.route('/api/v1/libraries', libraries);
app.route('/api/v1/series', series);
app.route('/api/v1/books', books);
app.route('/api/reading-status', readingStatus);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
});

const port = parseInt(process.env['PORT'] || '3001');
const hostname = process.env['HOST'] || '0.0.0.0';

console.log(`Shelvarr API server starting on ${hostname}:${port}...`);

serve({
  fetch: app.fetch,
  port,
  hostname,
}, (info) => {
  console.log(`Shelvarr API server running at http://${hostname}:${info.port}`);
});

export default app;
