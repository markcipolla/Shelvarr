import type {
  AuthClient,
  DeviceLoginPoll,
  DeviceLoginRequest,
  User,
} from '@shelvarr/types';
import {
  consumeLoginToken,
  countRecentLoginTokens,
  createLoginToken,
  revokeLoginToken,
  revokePendingLoginTokens,
  getLoginTokenByDeviceCodeHash,
  getLoginTokenByHash,
  getUserById,
  isLoginTokenExpired,
  sqlTimeToIso,
} from '@shelvarr/db';
import { createLogger } from '../utils/logger';
import { getAuthConfig } from './config';
import { buildMagicLinkMessage, sendMail } from './email';
import { generateToken, generateUserCode, hashToken } from './tokens';
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
const MAX_LINKS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/** How often the native app should poll while waiting for approval. */
const DEVICE_POLL_INTERVAL_SECONDS = 3;

export interface RequestLoginOptions {
  email: string;
  client?: AuthClient;
  redirectTo?: string | null;
  /** Absolute base URL of this server, used when SHELVARR_URL is unset. */
  origin?: string | null;
}

export interface RequestLoginResult {
  /**
   * Whether a magic link was actually delivered. False when SMTP is not
   * configured — the link is written to the server log instead, so a
   * self-hosted install without mail is still recoverable.
   */
  emailSent: boolean;
  /** Present only when mail is unconfigured, for the admin to read from the log. */
  link?: string;
  device?: DeviceLoginRequest;
}

function resolveBaseUrl(origin?: string | null): string {
  const configured = getAuthConfig().appUrl;
  if (configured) return configured;
  if (origin) return origin.replace(/\/+$/, '');
  // Last resort. The link will be wrong for anyone not on the server itself,
  // which is why SHELVARR_URL is worth setting.
  return 'http://localhost:3000';
}

export function buildMagicLink(token: string, origin?: string | null): string {
  const url = new URL('/auth/verify', `${resolveBaseUrl(origin)}/`);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Start a passwordless login.
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

  let user = getUserByEmail(email);
  let isNewAccount = false;

  if (!user) {
    if (!isSignupAllowed()) {
      // Same shape of answer as the success case; nothing was created.
      log.info(`Login requested for unknown address; signup is disabled`);
      return { emailSent: false };
    }
    user = createAccount(email, null, 'user');
    isNewAccount = true;
  }

  if (countRecentLoginTokens(user.id, RATE_LIMIT_WINDOW_SECONDS) >= MAX_LINKS_PER_WINDOW) {
    throw new AuthError('Too many sign-in emails requested. Try again later.', 'rate-limited');
  }

  // Asking for a new link retires the old ones, so a link left in an inbox
  // stops working as soon as a fresher one is requested.
  revokePendingLoginTokens(user.id, client);

  const token = generateToken();
  const deviceCode = client === 'native' ? generateToken() : null;
  const userCode = client === 'native' ? generateUserCode() : null;

  const row = createLoginToken({
    userId: user.id,
    tokenHash: hashToken(token),
    client,
    deviceCodeHash: deviceCode ? hashToken(deviceCode) : null,
    userCode,
    redirectTo: options.redirectTo ?? null,
    ttlSeconds: config.loginTokenTtlSeconds,
  });

  const link = buildMagicLink(token, options.origin);
  const message = buildMagicLinkMessage({
    link,
    ttlMinutes: Math.round(config.loginTokenTtlSeconds / 60),
    userCode,
    isNewAccount,
  });

  const result = await sendMail({
    to: user.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  const device: DeviceLoginRequest | undefined = deviceCode
    ? {
        deviceCode,
        userCode: userCode!,
        expiresAt: sqlTimeToIso(row.expires_at),
        intervalSeconds: DEVICE_POLL_INTERVAL_SECONDS,
      }
    : undefined;

  if (result.sent) {
    return { emailSent: true, device };
  }

  // No mail, so the link would otherwise be lost. Print it where the person
  // running the server can find it, and tell the caller it did not send.
  log.warn(
    `Email is not configured (or failed to send), so this sign-in link was not delivered. ` +
      `Open it manually to sign in as ${user.email}: ${link}`
  );
  return { emailSent: false, link, device };
}

export interface VerifyResult {
  /** A web login is signed in immediately; a native one waits for the phone. */
  kind: 'web' | 'native';
  user: User;
  redirectTo: string | null;
  /** Only for a web login. */
  issued?: IssuedSession;
  /** Only for a native login, so the page can confirm which device was approved. */
  userCode?: string | null;
}

/**
 * Open a magic link.
 *
 * For a web login this mints the session there and then. For a native login it
 * only marks the request approved: the phone that started it collects the
 * session on its next poll, which is what lets the email be opened on a laptop.
 */
export function verifyLoginToken(token: string, label?: string | null): VerifyResult {
  const row = getLoginTokenByHash(hashToken(token));
  if (!row) {
    throw new AuthError('That sign-in link is not valid', 'invalid-token');
  }
  if (isLoginTokenExpired(row)) {
    revokeLoginToken(row.id);
    throw new AuthError('That sign-in link has expired. Request a new one.', 'invalid-token');
  }
  if (!consumeLoginToken(row.id)) {
    throw new AuthError('That sign-in link has already been used', 'invalid-token');
  }

  const user = getUserById(row.user_id);
  if (!user) {
    revokeLoginToken(row.id);
    throw new AuthError('That account no longer exists', 'invalid-token');
  }

  if (row.client === 'native') {
    // Leave the row usable; the poll below turns it into a session.
    return { kind: 'native', user, redirectTo: null, userCode: row.user_code };
  }

  revokeLoginToken(row.id);
  return {
    kind: 'web',
    user,
    redirectTo: row.redirect_to,
    issued: issueSession(user, 'web', label),
  };
}

/**
 * The native app asking whether its login has been approved yet.
 *
 * The session is minted here rather than at approval time so no plaintext
 * token is ever stored; the row is deleted in the same breath, so a second
 * poll with the same device code gets nothing.
 */
export function pollDeviceLogin(deviceCode: string, label?: string | null): DeviceLoginPoll {
  const row = getLoginTokenByDeviceCodeHash(hashToken(deviceCode));
  if (!row) return { status: 'expired' };

  if (isLoginTokenExpired(row)) {
    revokeLoginToken(row.id);
    return { status: 'expired' };
  }

  if (!row.consumed_at) return { status: 'pending' };

  const user = getUserById(row.user_id);
  if (!user) {
    revokeLoginToken(row.id);
    return { status: 'denied' };
  }

  const issued = issueSession(user, 'native', label);
  // Retire the request in the same breath, so one approval means exactly one
  // session even if the app polls twice.
  revokeLoginToken(row.id);

  return {
    status: 'approved',
    token: issued.token,
    expiresAt: sqlTimeToIso(issued.session.expiresAt),
    user,
  };
}

/** Give up on a pending device login, so the link in the email stops working. */
export function cancelDeviceLogin(deviceCode: string): boolean {
  const row = getLoginTokenByDeviceCodeHash(hashToken(deviceCode));
  if (!row) return false;
  return revokeLoginToken(row.id);
}
