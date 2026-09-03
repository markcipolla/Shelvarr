import { authenticateRequest, type HeaderReader } from './auth/request';

/**
 * Framework-agnostic API auth gate, used by every route handler.
 *
 * Accepts a session (cookie for the web app, bearer token for the native app)
 * or the legacy shared API key. Returns true when authentication is switched
 * off entirely, which is the escape hatch for a trusted network.
 *
 * Note this is now a real gate: before user accounts existed it let every
 * request through unless an API key happened to be configured.
 */
export function validateApiAuth(headers: HeaderReader): boolean {
  return authenticateRequest(headers) !== null;
}
