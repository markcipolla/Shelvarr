import { join } from 'path';
import type { AppConfig } from '@shelvarr/types';
import { initDatabase } from '@shelvarr/db';
import { initServiceConfig, scheduler } from '@shelvarr/services';

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

  // Only used while adopting a library organised by something else.
  comicMigration: {
    pathMap: process.env['COMIC_PATH_MAP'] || process.env['KAPOWARR_PATH_MAP'] || null,
  },

  // GetComics sourcing for comics
  getcomics: {
    baseUrl: process.env['GETCOMICS_URL'] || 'https://getcomics.org',
    downloadDir: process.env['GETCOMICS_DOWNLOAD_DIR'] || join(dataDir, 'downloads'),
    libraryRoot: process.env['COMIC_LIBRARY_ROOT'] || null,
    hostPreference: (process.env['GETCOMICS_HOST_PREFERENCE'] || 'getcomics,pixeldrain')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
    renameDownloadedFiles: process.env['GETCOMICS_RENAME'] !== 'false',
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

// Recurring jobs (metadata refresh, and optionally the GetComics sweep).
//
// Skipped during `next build`, which imports every module to collect page
// data and must not start timers, and in tests, which drive the scheduler
// directly. Claiming is atomic in SQL, so running this in each of several
// server processes is safe.
const schedulerDisabled =
  process.env['SCHEDULER_ENABLED'] === 'false' ||
  process.env['NODE_ENV'] === 'test' ||
  process.env['NEXT_PHASE'] === 'phase-production-build';

if (!schedulerDisabled) {
  try {
    scheduler.startScheduler();
  } catch (error) {
    // A broken scheduler must not stop the app from serving.
    console.error('Failed to start the scheduler:', error);
  }
}

export default config;
