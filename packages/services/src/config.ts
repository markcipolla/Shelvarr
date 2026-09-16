import type { AppConfig } from '@shelvarr/types';
import { join } from 'path';

let _config: AppConfig | null = null;

/**
 * Read the server's configuration from the environment.
 *
 * The one place an env var becomes config: the web app hands the result to
 * `initServiceConfig`, and `getServiceConfig` falls back to it when nothing has.
 */
export function loadConfigFromEnv(): AppConfig {
  const dataDir = process.env['DATA_DIR'] || process.cwd() + '/data';
  return {
    dataDir,
    dbPath: process.env['DB_PATH'] || join(dataDir, 'shelvarr.db'),
    libraryRoot: process.env['LIBRARY_ROOT'] || '/libraries',
    supportedExtensions: ['.epub', '.pdf', '.mobi', '.azw', '.azw3', '.cbz', '.cbr'],
    // Only for reading paths that were recorded under a different mount.
    comicPaths: {
      pathMap: process.env['COMIC_PATH_MAP'] || null,
    },
    getcomics: {
      baseUrl: process.env['GETCOMICS_URL'] || 'https://getcomics.org',
      downloadDir: process.env['GETCOMICS_DOWNLOAD_DIR'] || join(dataDir, 'downloads'),
      hostPreference: (process.env['GETCOMICS_HOST_PREFERENCE'] || 'getcomics,pixeldrain')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
      renameDownloadedFiles: process.env['GETCOMICS_RENAME'] !== 'false',
    },
  };
}

/**
 * Initialize the service config. Must be called before using any service.
 */
export function initServiceConfig(config: AppConfig): void {
  _config = config;
}

/**
 * Get the current service config, reading the environment if nothing has been
 * initialized.
 */
export function getServiceConfig(): AppConfig {
  if (!_config) _config = loadConfigFromEnv();
  return _config;
}
