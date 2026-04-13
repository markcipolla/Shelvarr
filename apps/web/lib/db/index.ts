// Re-export everything from @shelvarr/db
// This maintains backward compatibility with @/lib/db imports
export {
  initDatabase,
  getDb,
  getPool,
  closeDatabase,
  query,
  queryOne,
  execute,
  insertReturning,
  getSetting,
  setSetting,
  getAllSettings,
  getWantedBooks,
  getWantedBookById,
  addWantedBook,
  updateWantedBook,
  deleteWantedBook,
  isBookWanted,
  markWantedBookAsAcquired,
  getDownloadSourceConfigs,
  getDownloadSourceConfig,
  upsertDownloadSourceConfig,
  isSourceEnabled,
  getSourceStatusCache,
  getSourceStatus,
  updateSourceStatus,
  isStatusCacheStale,
  getReadProgress,
  upsertReadProgress,
  deleteReadProgress,
  getEpubProgression,
  upsertEpubProgression,
  initDatabaseAsync,
} from '@shelvarr/db';

export type {
  ReadProgressRow,
  EpubProgressionRow,
} from '@shelvarr/db';

// Re-export types from @shelvarr/types that were previously defined here
export type {
  WantedBook,
  DownloadSourceConfig,
  SourceStatusCache,
} from '@shelvarr/types';
