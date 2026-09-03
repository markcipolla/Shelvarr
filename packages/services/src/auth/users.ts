import type { User, UserRole } from '@shelvarr/types';
import {
  countAdmins,
  countUsers,
  createUser as dbCreateUser,
  deleteSessionsForUser,
  deleteUser as dbDeleteUser,
  getSetting,
  getUserByEmail,
  getUserById,
  listUsers,
  setSetting,
  updateUser,
} from '@shelvarr/db';
import { getAuthConfig } from './config';

/** Raised for anything a person could reasonably have caused. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid-email'
      | 'email-taken'
      | 'not-found'
      | 'signup-disabled'
      | 'setup-complete'
      | 'last-admin'
      | 'rate-limited'
      | 'invalid-code'
      | 'auth-disabled'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Deliberately loose: the real check is whether the person can read mail sent
// to the address. This only catches typos and obvious nonsense.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

/** Normalize and validate in one step, throwing on anything unusable. */
export function requireValidEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new AuthError('Enter a valid email address', 'invalid-email');
  }
  return normalized;
}

export function isSetupRequired(): boolean {
  return countUsers() === 0;
}

const ALLOW_SIGNUP_SETTING = 'auth_allow_signup';

/**
 * Whether an unknown address may create its own account.
 *
 * SHELVARR_ALLOW_SIGNUP sets the starting value; once an admin has touched the
 * toggle in Settings, the stored answer wins. That way the env var configures
 * a fresh deployment without silently reverting a later decision.
 */
export function isSignupAllowed(): boolean {
  const stored = getSetting<boolean>(ALLOW_SIGNUP_SETTING, null);
  if (stored === null || stored === undefined) {
    return getAuthConfig().allowSignupDefault;
  }
  return stored === true;
}

export function setSignupAllowed(allowed: boolean): void {
  setSetting(ALLOW_SIGNUP_SETTING, allowed);
}

/**
 * Create the very first account, which is always an admin.
 *
 * Only possible while no accounts exist. That window is the whole security
 * model for the setup wizard: the moment the first admin is created, this
 * closes for good.
 */
export function createFirstAdmin(email: string, name: string | null): User {
  if (!isSetupRequired()) {
    throw new AuthError('Setup has already been completed', 'setup-complete');
  }
  return dbCreateUser(requireValidEmail(email), name?.trim() || null, 'admin');
}

/** Create an account for an address an admin has invited. */
export function createAccount(email: string, name: string | null, role: UserRole = 'user'): User {
  const normalized = requireValidEmail(email);
  if (getUserByEmail(normalized)) {
    throw new AuthError('An account with that email already exists', 'email-taken');
  }
  return dbCreateUser(normalized, name?.trim() || null, role);
}

/** Delete an account and every session it holds. Refuses to remove the last admin. */
export function removeAccount(userId: number): void {
  const user = getUserById(userId);
  if (!user) throw new AuthError('No such account', 'not-found');
  if (user.role === 'admin' && countAdmins() <= 1) {
    throw new AuthError('Cannot remove the only admin account', 'last-admin');
  }
  deleteSessionsForUser(userId);
  dbDeleteUser(userId);
}

/**
 * Change someone's role. Demoting the last admin is refused, since that would
 * leave nobody able to manage the server.
 */
export function setRole(userId: number, role: UserRole): void {
  const user = getUserById(userId);
  if (!user) throw new AuthError('No such account', 'not-found');
  if (user.role === 'admin' && role !== 'admin' && countAdmins() <= 1) {
    throw new AuthError('Cannot demote the only admin account', 'last-admin');
  }
  updateUser(userId, { role });
}

export function renameAccount(userId: number, name: string | null): void {
  if (!getUserById(userId)) throw new AuthError('No such account', 'not-found');
  updateUser(userId, { name: name?.trim() || null });
}

export { listUsers, getUserById, getUserByEmail, countUsers, countAdmins };
