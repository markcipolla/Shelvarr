import { join } from 'path';
import type { AppConfig } from '@shelvarr/types';
import { initDatabase } from '@shelvarr/db';
import { initServiceConfig } from '@shelvarr/services';

// Data directory - use environment variable or default
const dataDir = process.env['DATA_DIR'] || process.cwd() + '/data';

const config: AppConfig = {
  env: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORT'] || '3000', 10),

  // Data directory for config files
  dataDir,

  // Root path for library mounts
  libraryRoot: process.env['LIBRARY_ROOT'] || '/libraries',

  // SQLite database path
  dbPath: process.env['DB_PATH'] || '',

  // Komga integration (optional)
  komga: {
    url: process.env['KOMGA_URL'] || null,
    apiKey: process.env['KOMGA_API_KEY'] || null,
  },

  // Supported file extensions
  supportedExtensions: ['.epub', '.pdf', '.mobi', '.azw', '.azw3'],

  // Rate limiting for external APIs (requests per minute)
  rateLimits: {
    hardcover: 60,
  },

  // API keys from environment
  hardcoverToken: process.env['HARDCOVER_API_TOKEN'] || null,
};

// Derive dbPath if not explicitly set
config.dbPath = process.env['DB_PATH'] || join(config.dataDir, 'shelvarr.db');

// Initialize shared packages
initDatabase(config.dbPath);
initServiceConfig(config);

export default config;
