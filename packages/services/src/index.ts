// Config initialization
export { initServiceConfig, getServiceConfig } from './config';

// Comics
export { openComicArchive, remapComicPath } from './comics/archive';
export type { ComicArchiveResult, OpenComicArchiveOptions } from './comics/archive';
export * as getcomics from './comics/getcomics/index';
export * as comicvine from './comics/comicvine/index';
export * as comicLibrary from './comics/library';
export * as comicNaming from './comics/naming';
export * as comicScan from './comics/scan';
export * as comicRename from './comics/rename';
export * as comicLibraryImport from './comics/import-library';
export * as comicAdopt from './comics/adopt';
export { importComicDownload, resolveImportTarget } from './comics/import';

// Services
export * as scanner from './scanner/index';
export * as library from './library/index';
export * as metadata from './metadata/index';
export * as hardcover from './metadata/hardcover';
export * as organizer from './organizer/index';
export * as queue from './queue/index';
export * as queueHandlers from './queue/handlers';
export * as scheduler from './queue/scheduler';
export * as downloads from './downloads/index';
export * as sourceStatus from './downloads/source-status';

// API response adapters
export * as apiResponse from './api-response';

// API auth
export { validateApiAuth } from './api-auth';

// User accounts and passwordless authentication
export * as auth from './auth/index';
export {
  SESSION_COOKIE_NAME,
  AuthError,
  authenticateRequest,
  getAuthStatus,
  getRequestUser,
  isAuthEnabled,
} from './auth/index';
export type { RequestAuth, HeaderReader } from './auth/request';

// Utils
export * as authors from './utils/authors';
export * as logger from './utils/logger';
export * as sanitize from './utils/sanitize';
export * from './constants';
