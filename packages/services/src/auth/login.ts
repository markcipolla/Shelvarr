import type { AuthClient, LoginCodeChallenge, User } from '@shelvarr/types';
import {
  consumeLoginCode,
  countRecentLoginCodes,
  createLoginCode,
  getPendingLoginCode,
  isLoginCodeExpired,
  recordLoginCodeAttempt,
  revokeLoginCode,
  revokePendingLoginCodes,
  sqlTimeToIso,
} from '@shelvarr/db';
import { createLogger } from '../utils/logger';
import { getAuthConfig } from './config';
import { buildLoginCodeMessage, sendMail } from './email';
import {
  LOGIN_CODE_LENGTH,
  generateLoginCode,
  hashToken,
  normaliseLoginCode,
  tokensMatch,
} from './tokens';
import {
  AuthError,
  createAccount,
  getUserByEmail,
  isSignupAllowed,
  requireValidEmail,
} from './users';
import { issueSession, type IssuedSession } from './sessions';

const log = createLogger('auth');

// Enough for a few honest retries, few enough that the mailbox of someone
// being targeted does not fill up.
const MAX_CODES_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/**
 * Guesses one code will tolerate before it is retired.
 *
 * This is the number that makes a six-character code safe. The alphabet has
 * 32 symbols, so there are 32^6 ≈ 1.07 billion codes; five guesses against
 * one of them is a chance of about 1 in 215 million, and burning through
 * codes to get more guesses runs into the rate limit above.
 */
const MAX_ATTEMPTS_PER_CODE = 5;

export interface RequestLoginOptions {
  email: string;
  client?: AuthClient;
  redirectTo?: string | null;
}

export interface RequestLoginResult extends LoginCodeChallenge {
  /**
   * Present only when mail is unconfigured, for the admin to read from the
   * log or pass on by hand. Never handed to an anonymous caller.
   */
  code?: string;
}

/**
 * Ask for a one-time sign-in code.
 *
 * Deliberately says the same thing whether or not the address has an account:
 * the caller is unauthenticated, so telling it which emails are registered
 * would turn this into an account-enumeration oracle. The one visible
 * difference is when signup is off and the address is unknown — nothing is
 * created and no mail goes out, but the answer looks identical.
 */
export async function requestLogin(
  options: RequestLoginOptions
): Promise<RequestLoginResult> {
  const config = getAuthConfig();
  if (!config.enabled) {
    throw new AuthError('Authentication is disabled on this server', 'auth-disabled');
  }

  const email = requireValidEmail(options.email);
  const client: AuthClient = options.client ?? 'web';

  // Every answer carries the same shape, including the ones where nothing
  // happened, so the caller cannot tell them apart.
  const challenge = (expiresAt: string, emailSent: boolean): LoginCodeChallenge => ({
    emailSent,
    expiresAt,
    codeLength: LOGIN_CODE_LENGTH,
  });
  const expiryFromNow = () =>
    new Date(Date.now() + config.loginCodeTtlSeconds * 1000).toISOString();

  let user = getUserByEmail(email);
  let isNewAccount = false;

  if (!user) {
    if (!isSignupAllowed()) {
      // Same shape of answer as the success case; nothing was created.
      log.info('Sign-in code requested for unknown address; signup is disabled');
      return challenge(expiryFromNow(), false);
    }
    user = createAccount(email, null, 'user');
    isNewAccount = true;
  }

  if (countRecentLoginCodes(user.id, RATE_LIMIT_WINDOW_SECONDS) >= MAX_CODES_PER_WINDOW) {
    throw new AuthError('Too many sign-in emails requested. Try again later.', 'rate-limited');
  }

  // Asking for a new code retires the old ones, so a code left in an inbox
  // stops working as soon as a fresher one is requested.
  revokePendingLoginCodes(user.id, client);

  const code = generateLoginCode();
  const row = createLoginCode({
    userId: user.id,
    codeHash: hashToken(code),
    client,
    redirectTo: options.redirectTo ?? null,
    ttlSeconds: config.loginCodeTtlSeconds,
  });
  const expiresAt = sqlTimeToIso(row.expires_at);

  const message = buildLoginCodeMessage({
    code,
    ttlMinutes: Math.round(config.loginCodeTtlSeconds / 60),
    isNewAccount,
  });

  const result = await sendMail({
    to: user.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (result.sent) {
    return challenge(expiresAt, true);
  }

  // No mail, so the code would otherwise be lost. Print it where the person
  // running the server can find it, and tell the caller it did not send.
  log.warn(
    'Email is not configured (or failed to send), so this sign-in code was not delivered. ' +
      `Type it in to sign in as ${user.email}: ${code}`
  );
  return { ...challenge(expiresAt, false), code };
}

export interface VerifyLoginOptions {
  email: string;
  code: string;
  client?: AuthClient;
  /** Names the session in the device list — a user agent or a device name. */
  label?: string | null;
}

export interface VerifyLoginResult {
  user: User;
  redirectTo: string | null;
  issued: IssuedSession;
}

/**
 * Redeem a code for a session.
 *
 * Every failure raises the same `invalid-code` error with the same wording.
 * Saying "no such account" would leak who is registered, and saying "wrong
 * code" versus "expired" would tell someone guessing which of their two
 * problems to fix.
 */
export function verifyLoginCode(options: VerifyLoginOptions): VerifyLoginResult {
  const config = getAuthConfig();
  if (!config.enabled) {
    throw new AuthError('Authentication is disabled on this server', 'auth-disabled');
  }

  const invalid = () =>
    new AuthError('That code is not right, or it has expired. Ask for a new one.', 'invalid-code');

  const email = requireValidEmail(options.email);
  const code = normaliseLoginCode(options.code ?? '');
  const client: AuthClient = options.client ?? 'web';

  const user = getUserByEmail(email);
  if (!user) throw invalid();

  const row = getPendingLoginCode(user.id, client);
  if (!row) throw invalid();

  if (isLoginCodeExpired(row)) {
    revokeLoginCode(row.id);
    throw invalid();
  }

  if (!tokensMatch(row.code_hash, hashToken(code))) {
    // Retire the code once it has been guessed at enough times. Without this
    // a six-character code would be brute-forceable in an afternoon.
    if (recordLoginCodeAttempt(row.id) >= MAX_ATTEMPTS_PER_CODE) {
      revokeLoginCode(row.id);
      log.warn(`Retired a sign-in code for ${user.email} after too many wrong guesses`);
    }
    throw invalid();
  }

  // Atomic, so two clients racing the same code cannot both get a session.
  if (!consumeLoginCode(row.id)) throw invalid();

  return {
    user,
    redirectTo: row.redirect_to,
    issued: issueSession(user, client, options.label),
  };
}
