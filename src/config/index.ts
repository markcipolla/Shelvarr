import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { AppConfig } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: AppConfig = {
  env: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORT'] || '3000', 10),

  // Data directory for config files
  dataDir: process.env['DATA_DIR'] || join(__dirname, '../../data'),

  // Root path for library mounts
  libraryRoot: process.env['LIBRARY_ROOT'] || '/libraries',

  // PostgreSQL connection URL
  databaseUrl: process.env['DATABASE_URL'] || 'postgresql://shelvarr:shelvarr@localhost:5432/shelvarr',

  // Legacy SQLite path (deprecated)
  dbPath: '',

  // Komga integration (optional)
  komga: {
    url: process.env['KOMGA_URL'] || null,
    username: process.env['KOMGA_USERNAME'] || null,
    password: process.env['KOMGA_PASSWORD'] || null,
  },

  // Supported file extensions
  supportedExtensions: ['.epub', '.pdf', '.cbz', '.cbr', '.mobi', '.azw', '.azw3'],

  // Rate limiting for external APIs
  rateLimits: {
    googleBooks: 100, // requests per minute
    openLibrary: 100,
  },
};

// Derive dbPath if not explicitly set
config.dbPath = process.env['DB_PATH'] || join(config.dataDir, 'shelvarr.db');

export default config;
