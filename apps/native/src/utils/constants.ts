// app.json lives outside src and is bundled by Metro, so it is required
// rather than imported.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require('../../app.json') as { expo: { version: string } };

export const APP_VERSION: string = appJson.expo.version;
export const BUILD_VERSION: string = process.env.EXPO_PUBLIC_BUILD_VERSION || 'dev';

export const DOWNLOADS_DIR = 'shelvarr-downloads';
export const EXTRACTED_DIR = 'shelvarr-extracted';

// Files cached by reading (rather than by an explicit download) are swept
// this long after they were last read. Long enough that picking a book back up
// next week doesn't re-download it, short enough that the phone isn't hoarding
// a library you've finished with.
export const DOWNLOAD_RETENTION_DAYS = 14;
export const DOWNLOAD_RETENTION_MS = DOWNLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const PROGRESS_SYNC_DEBOUNCE_MS = 3000;
export const PAGE_SIZE = 20;

// Auto-update: the app checks GitHub Releases for a newer signed APK. Override
// the repo at build time (e.g. for a fork) with EXPO_PUBLIC_UPDATE_REPO.
export const UPDATE_REPO: string =
  process.env.EXPO_PUBLIC_UPDATE_REPO || 'markcipolla/shelvarr';
export const UPDATE_LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
