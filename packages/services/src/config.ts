import type { AppConfig } from '@shelvarr/types';
import { join } from 'path';

let _config: AppConfig | null = null;

/**
 * Initialize the service config. Must be called before using any service.
 */
export function initServiceConfig(config: AppConfig): void {
  _config = config;
}

/**
 * Get the current service config.
 * Falls back to env-based defaults if not explicitly initialized.
 */
export function getServiceConfig(): AppConfig {
  if (!_config) {
    // Auto-initialize from environment variables
    const dataDir = process.env['DATA_DIR'] || process.cwd() + '/data';
    _config = {
      env: process.env['NODE_ENV'] || 'development',
      dbPath: process.env['DB_PATH'] || join(dataDir, 'shelvarr.db'),
      dataDir,
      libraryRoot: process.env['LIBRARY_ROOT'] || '/libraries',
      port: parseInt(process.env['PORT'] || '3000', 10),
      supportedExtensions: ['.epub', '.pdf', '.cbz', '.cbr', '.mobi', '.azw3'],
      hardcoverToken: process.env['HARDCOVER_API_TOKEN'] || null,
      komga: {
        url: process.env['KOMGA_URL'] || null,
        apiKey: process.env['KOMGA_API_KEY'] || null,
      },
      rateLimits: { hardcover: 60 },
    };
  }
  return _config;
}
