import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { join } from 'path';
import { initDatabase } from '@shelvarr/db';

import { authMiddleware } from './middleware/auth.js';
import libraries from './routes/libraries.js';
import series from './routes/series.js';
import books from './routes/books.js';

// Initialize database
const dataDir = process.env['DATA_DIR'] || process.cwd() + '/data';
const dbPath = process.env['DB_PATH'] || join(dataDir, 'shelvarr.db');
initDatabase(dbPath);

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('/api/*', authMiddleware);

// Mount routes
app.route('/api/v1/libraries', libraries);
app.route('/api/v1/series', series);
app.route('/api/v1/books', books);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
});

const port = parseInt(process.env['PORT'] || '3001');

console.log(`Shelvarr API server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Shelvarr API server running at http://localhost:${info.port}`);
});

export default app;
