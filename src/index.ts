import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import config from './config/index.js';
import { initDatabase, closeDatabase } from './db/index.js';
import apiRoutes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve built CSS from dist/public (for dev mode)
const distPublicPath = join(__dirname, '../dist/public');
if (existsSync(distPublicPath)) {
  app.use(express.static(distPublicPath));
}

// Serve static files from public (HTML, JS)
app.use(express.static(join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Error handling middleware
interface ErrorWithMessage {
  message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>)['message'] === 'string'
  );
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  const message = isErrorWithMessage(err) ? err.message : 'Internal server error';
  res.status(500).json({
    error: config.env === 'development' ? message : 'Internal server error',
  });
});

// Graceful shutdown
function shutdown(): void {
  console.log('\nShutting down...');
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
function start(): void {
  try {
    // Initialize database
    initDatabase();

    // Start listening
    app.listen(config.port, () => {
      console.log(`
╔═══════════════════════════════════════════╗
║             SHELVARR v0.0.1                ║
╠═══════════════════════════════════════════╣
║  Server running on port ${String(config.port).padEnd(17)}║
║  Environment: ${config.env.padEnd(25)}║
║  Library root: ${config.libraryRoot.padEnd(24)}║
╚═══════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
