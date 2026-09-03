import { SHARED_USER_ID } from '@shelvarr/db';
import { authenticateRequest, type HeaderReader } from './auth/request';

/**
 * Whose shelf a request is reading from and writing to.
 *
 * Read progress hangs off a user id so that two people sharing a server each
 * get their own "Currently Reading" and "Next Up". There are two ways a
 * request legitimately arrives with nobody attached, and both fall back to
 * {@link SHARED_USER_ID} — one shelf everyone sees, which is exactly how the
 * app behaved before accounts existed:
 *
 * - accounts are switched off entirely (`SHELVARR_AUTH_ENABLED=false`);
 * - the caller used the legacy shared API key, which carries access but names
 *   nobody, so there is no personal shelf to pick.
 *
 * An unauthenticated request never reaches here: {@link validateApiAuth}
 * turns it away first.
 */
export function getReadingUserId(headers: HeaderReader): number {
  const auth = authenticateRequest(headers);
  return auth?.kind === 'session' ? auth.user.id : SHARED_USER_ID;
}

export { SHARED_USER_ID };
