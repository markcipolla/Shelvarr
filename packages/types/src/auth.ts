// User accounts and passwordless (one-time code) authentication.

export type UserRole = 'admin' | 'user';

/** An account, as everything outside the database sees it. */
export interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Which kind of client a session or login belongs to. */
export type AuthClient = 'web' | 'native';

/** A live session. The token itself is never stored, only its hash. */
export interface Session {
  id: number;
  userId: number;
  client: AuthClient;
  label: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

/** A session paired with the account it belongs to. */
export interface AuthenticatedSession {
  user: User;
  session: Session;
}

/**
 * What an unauthenticated caller is allowed to know about this server, so the
 * web and native clients can pick the right screen before signing in.
 */
export interface AuthStatus {
  /**
   * False when accounts are switched off — every request is let through.
   * Set by SHELVARR_AUTH_ENABLED, or by an admin in Settings → Users.
   */
  enabled: boolean;
  /** True until the first admin account exists. */
  setupRequired: boolean;
  /** Whether an unknown email may create its own account. */
  allowSignup: boolean;
  /** Whether sign-in code emails can actually be delivered. */
  emailConfigured: boolean;
}

/**
 * Outgoing mail settings.
 *
 * Read from the SMTP_* environment variables, with an admin's saved answer in
 * Settings → Users taking precedence once there is one.
 */
export interface EmailConfig {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
}

/**
 * Auth settings.
 *
 * Read from the environment, except `enabled`, which an admin can also change
 * from Settings → Users; the stored answer wins once set.
 */
export interface AuthConfig {
  enabled: boolean;
  /** Default for the self-signup toggle; the stored setting wins once set. */
  allowSignupDefault: boolean;
  /** How long an emailed sign-in code stays valid. */
  loginCodeTtlSeconds: number;
  /** How long a browser session lasts. */
  sessionTtlSeconds: number;
  /** How long a native session lasts — longer, since phones sign in rarely. */
  nativeSessionTtlSeconds: number;
  email: EmailConfig;
}

/**
 * What a client learns after asking for a sign-in code. Deliberately says
 * nothing about whether the address has an account.
 */
export interface LoginCodeChallenge {
  /** Whether the code was actually emailed. False when SMTP is unconfigured. */
  emailSent: boolean;
  /** When the code stops working, so a client can show a countdown. */
  expiresAt: string;
  /** How many characters the code has, so a client can size its input. */
  codeLength: number;
}
