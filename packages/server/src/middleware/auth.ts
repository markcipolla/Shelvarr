import { createMiddleware } from 'hono/factory';
import { getSetting } from '@shelvarr/db';

/**
 * Auth middleware supporting Basic Auth and API Key (X-API-Key header)
 * If no auth is configured in settings, all requests are allowed.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const configuredApiKey = getSetting<string>('api_key', null);

  // If no API key is configured, allow all requests
  if (!configuredApiKey) {
    await next();
    return;
  }

  // Check X-API-Key header
  const apiKey = c.req.header('X-API-Key');
  if (apiKey === configuredApiKey) {
    await next();
    return;
  }

  // Check Basic Auth
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [, password] = decoded.split(':');
    if (password === configuredApiKey) {
      await next();
      return;
    }
  }

  return c.json({ error: 'Unauthorized' }, 401);
});
