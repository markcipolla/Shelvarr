/**
 * The Hardcover key lives in the settings table, so a test that needs one
 * needs a database: a throwaway one, never the developer's data/shelvarr.db,
 * which is where an unconfigured test process would otherwise open it.
 */

import { createTestEnvironment, setupTestDatabase } from './setup';

let ready: Promise<void> | null = null;

/** Store `key` as the Hardcover API key; `null` leaves Hardcover unconfigured. */
export async function setHardcoverKey(key: string | null): Promise<void> {
  if (!process.env['DB_PATH']) {
    ready ??= (async () => {
      createTestEnvironment();
      await setupTestDatabase();
    })();
  }
  await ready;

  const { setSetting } = await import('../lib/db/index.js');
  setSetting('hardcover_api_key', key ?? '');
}
