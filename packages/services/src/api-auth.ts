import { getSetting } from '@shelvarr/db';

/**
 * Framework-agnostic API auth validation.
 * Checks X-API-Key header and Basic Auth against the configured api_key setting.
 * Returns true if auth is valid (or no auth is configured).
 */
export function validateApiAuth(headers: { get(name: string): string | null }): boolean {
  const configuredApiKey = getSetting<string>('api_key', null);

  // If no API key is configured, allow all requests
  if (!configuredApiKey) {
    return true;
  }

  // Check X-API-Key header
  const apiKey = headers.get('X-API-Key');
  if (apiKey === configuredApiKey) {
    return true;
  }

  // Check Basic Auth
  const authHeader = headers.get('Authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [, password] = decoded.split(':');
    if (password === configuredApiKey) {
      return true;
    }
  }

  return false;
}
