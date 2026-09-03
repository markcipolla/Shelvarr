import type { AuthClient, AuthenticatedSession, Session, User } from '@shelvarr/types';
import {
  createSessionRecord,
  deleteSession,
  deleteSessionByTokenHash,
  deleteSessionsForUser,
  getSessionByTokenHash,
  listSessionsForUser,
  pruneExpiredLoginTokens,
  pruneExpiredSessions,
  touchSession,
  touchUserLogin,
} from '@shelvarr/db';
import { getAuthConfig } from './config';
import { generateToken, hashToken } from './tokens';

export interface IssuedSession {
  /** The only time the plaintext token exists. Hand it to the client and forget it. */
  token: string;
  session: Session;
  user: User;
}

/**
 * Mint a session for someone who has just proved they own their address.
 * Native sessions get a longer life: signing in on a phone is a chore.
 */
export function issueSession(
  user: User,
  client: AuthClient,
  label?: string | null
): IssuedSession {
  const config = getAuthConfig();
  const token = generateToken();
  const session = createSessionRecord({
    userId: user.id,
    tokenHash: hashToken(token),
    client,
    label: label ?? null,
    ttlSeconds:
      client === 'native' ? config.nativeSessionTtlSeconds : config.sessionTtlSeconds,
  });
  touchUserLogin(user.id);
  return { token, session, user };
}

/**
 * Resolve a bearer token or cookie value to the account behind it, or null if
 * it is unknown, revoked or expired.
 */
export function resolveSession(token: string | null | undefined): AuthenticatedSession | null {
  if (!token) return null;
  const found = getSessionByTokenHash(hashToken(token));
  if (!found) return null;
  touchSession(found.session.id);
  return found;
}

export function revokeSessionToken(token: string): boolean {
  return deleteSessionByTokenHash(hashToken(token));
}

export function revokeSession(sessionId: number, userId?: number): boolean {
  return deleteSession(sessionId, userId);
}

export function revokeAllSessions(userId: number): number {
  return deleteSessionsForUser(userId);
}

export function getSessions(userId: number): Session[] {
  return listSessionsForUser(userId);
}

/** Housekeeping: drop everything that has timed out. */
export function pruneExpired(): { sessions: number; loginTokens: number } {
  return {
    sessions: pruneExpiredSessions(),
    loginTokens: pruneExpiredLoginTokens(),
  };
}
