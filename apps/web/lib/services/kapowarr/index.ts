export * from '@shelvarr/services/kapowarr/index';

import { kapowarrClient } from '@shelvarr/services/kapowarr/index';
import { getSetting } from '@/lib/db';

/**
 * Load Kapowarr connection settings from the database and configure the singleton client.
 * The web UI stores settings in the DB (not env vars), so this bridges DB → client.
 */
export async function configureKapowarrFromDb(): Promise<boolean> {
  const url = await getSetting<string>('kapowarr_url', null);
  const apiKey = await getSetting<string>('kapowarr_api_key', null);
  kapowarrClient.configure(url, apiKey);
  return kapowarrClient.isConfigured();
}
