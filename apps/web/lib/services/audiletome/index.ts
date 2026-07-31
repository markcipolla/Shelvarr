export * from '@shelvarr/services/audiletome/index';

import { audiletomeClient } from '@shelvarr/services/audiletome/index';
import { getSetting } from '@/lib/db';

/**
 * Load Audiletome connection settings from the database and configure the singleton client.
 * The web UI stores settings in the DB (not env vars), so this bridges DB → client.
 */
export async function configureAudiletomeFromDb(): Promise<boolean> {
  const url = await getSetting<string>('audiletome_url', null);
  const apiKey = await getSetting<string>('audiletome_api_key', null);
  audiletomeClient.configure(url, apiKey);
  return audiletomeClient.isConfigured();
}
