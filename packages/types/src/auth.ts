// User accounts and passwordless (magic-link) authentication.

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
  /** False when SHELVARR_AUTH_ENABLED=false — every request is let through. */
  enabled: boolean;
  /** True until the first admin account exists. */
  setupRequired: boolean;
  /** Whether an unknown email may create its own account. */
  allowSignup: boolean;
  /** Whether magic-link emails can actually be delivered. */
  emailConfigured: boolean;
}

/** Outgoing mail settings, read from the environment. */
export interface EmailConfig {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
}

/** Auth settings, read from the environment. */
export interface AuthConfig {
  enabled: boolean;
  /** Default for the self-signup toggle; the stored setting wins once set. */
  allowSignupDefault: boolean;
  /** Absolute base URL used to build magic links. */
  appUrl: string | null;
  /** How long a magic link stays valid. */
  loginTokenTtlSeconds: number;
  /** How long a browser session lasts. */
  sessionTtlSeconds: number;
  /** How long a native session lasts — longer, since phones sign in rarely. */
  nativeSessionTtlSeconds: number;
  email: EmailConfig;
}

/** A pending device-flow login, as reported to the native app that started it. */
export interface DeviceLoginRequest {
  /** Secret the app polls with. Never leaves the device that started it. */
  deviceCode: string;
  /** Shown to the user so they can confirm the email is for this device. */
  userCode: string;
  expiresAt: string;
  intervalSeconds: number;
}

/** The answer to a device-flow poll. */
export type DeviceLoginPoll =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'approved'; token: string; expiresAt: string; user: User };
