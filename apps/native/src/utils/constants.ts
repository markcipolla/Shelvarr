// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('../../app.json') as { expo: { version: string } };

export const APP_VERSION: string = appJson.expo.version;
export const BUILD_VERSION: string = process.env.EXPO_PUBLIC_BUILD_VERSION || 'dev';

export const DOWNLOADS_DIR = 'komga-downloads';
export const EXTRACTED_DIR = 'komga-extracted';

export const PROGRESS_SYNC_DEBOUNCE_MS = 3000;
export const PAGE_SIZE = 20;

export const SECURE_STORE_KEYS = {
  SERVER_URL: 'komga_server_url',
  USERNAME: 'komga_username',
  PASSWORD: 'komga_password',
  API_KEY: 'komga_api_key',
  AUTH_TYPE: 'komga_auth_type',
  SESSION_COOKIE: 'komga_session',
} as const;
