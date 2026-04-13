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

  // SQLite database path
  dbPath: process.env['DB_PATH'] || '',

  // Komga integration (optional)
  komga: {
    url: process.env['KOMGA_URL'] || null,
    username: process.env['KOMGA_USERNAME'] || null,
    password: process.env['KOMGA_PASSWORD'] || null,
  },

  // Supported file extensions
  supportedExtensions: ['.epub', '.pdf', '.cbz', '.cbr', '.mobi', '.azw', '.azw3'],

  // Rate limiting for external APIs (requests per minute)
  rateLimits: {
    googleBooks: 100,
    openLibrary: 100,
    hardcover: 60,
    bookbrainz: 30,
    audnexus: 60,
    comicvine: 200, // 200/hour = ~3/minute, but they allow bursts
    wikidata: 60,
  },

  // API keys from environment
  hardcoverToken: process.env['HARDCOVER_API_TOKEN'] || null,
  comicvineApiKey: process.env['COMICVINE_API_KEY'] || null,
};

// Derive dbPath if not explicitly set
config.dbPath = process.env['DB_PATH'] || join(config.dataDir, 'shelvarr.db');

export default config;
