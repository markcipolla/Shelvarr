import { getSetting, setSetting } from '@shelvarr/db';
import type { AuthConfig, EmailConfig } from '@shelvarr/types';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envText(name: string): string | null {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : null;
}

/** Settings keys backing the values an admin can change from Settings → Users. */
export const AUTH_ENABLED_SETTING = 'auth_enabled';
export const SMTP_SETTINGS = {
  host: 'smtp_host',
  port: 'smtp_port',
  secure: 'smtp_secure',
  user: 'smtp_user',
  password: 'smtp_password',
  from: 'smtp_from',
} as const;

/**
 * A stored override, or null when nobody has set one.
 *
 * Swallowing the error matters more than it looks. `isAuthEnabled()` is
 * reached from request paths and from scripts that never call
 * `initDatabase` — a throw here would surface far from its cause, as an
 * authentication failure rather than a missing database. Falling back to the
 * environment is also the correct answer in that situation: no database means
 * no stored override to honour.
 */
function stored<T>(key: string): T | null {
  try {
    const value = getSetting<T>(key, null);
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

/** Stored text, treating an empty string as "not set" the way envText does. */
function storedText(key: string): string | null {
  const value = stored<string>(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Outgoing mail settings.
 *
 * The SMTP_* variables set the starting values; once an admin has saved the
 * form in Settings → Users, the stored answer wins. Same bargain as the
 * self-signup toggle: the environment configures a fresh deployment without
 * silently reverting a later decision.
 */
export function getEmailConfig(): EmailConfig {
  const host = storedText(SMTP_SETTINGS.host) ?? envText('SMTP_HOST');

  // Port 465 is implicit TLS; everything else starts plaintext and upgrades
  // with STARTTLS. An explicit setting overrides when a server disagrees.
  const storedPort = stored<number>(SMTP_SETTINGS.port);
  const port = typeof storedPort === 'number' && storedPort > 0 ? storedPort : envInt('SMTP_PORT', 587);

  const storedSecure = stored<boolean>(SMTP_SETTINGS.secure);

  return {
    host,
    port,
    secure: typeof storedSecure === 'boolean' ? storedSecure : envFlag('SMTP_SECURE', port === 465),
    user: storedText(SMTP_SETTINGS.user) ?? envText('SMTP_USER'),
    password: storedText(SMTP_SETTINGS.password) ?? envText('SMTP_PASSWORD'),
    from: storedText(SMTP_SETTINGS.from) ?? envText('SMTP_FROM') ?? 'Shelvarr <shelvarr@localhost>',
  };
}

/** What an admin may change about outgoing mail. */
export interface EmailSettingsInput {
  host: string | null;
  port: number | null;
  secure: boolean | null;
  user: string | null;
  /**
   * Undefined leaves the saved password alone, which is what the settings form
   * sends back when the admin has not retyped it — the form is never given the
   * real one to send. Null or empty clears it.
   */
  password?: string | null;
  from: string | null;
}

/**
 * Persist mail settings.
 *
 * Null clears a field back to whatever the environment says, rather than
 * storing an empty string: an admin emptying a box means "stop overriding
 * this", and a deployment that sets SMTP_HOST should get it back.
 */
export function setEmailSettings(input: EmailSettingsInput): EmailConfig {
  setSetting(SMTP_SETTINGS.host, input.host?.trim() || null);
  setSetting(SMTP_SETTINGS.port, input.port && input.port > 0 ? input.port : null);
  setSetting(SMTP_SETTINGS.secure, typeof input.secure === 'boolean' ? input.secure : null);
  setSetting(SMTP_SETTINGS.user, input.user?.trim() || null);
  setSetting(SMTP_SETTINGS.from, input.from?.trim() || null);

  if (input.password !== undefined) {
    setSetting(SMTP_SETTINGS.password, input.password?.trim() || null);
  }

  return getEmailConfig();
}

export function getAuthConfig(): AuthConfig {
  const storedEnabled = stored<boolean>(AUTH_ENABLED_SETTING);

  return {
    // On by default: a fresh install should not be wide open by accident.
    // SHELVARR_AUTH_ENABLED=false suits a trusted network or a reverse proxy
    // that already authenticates; an admin can also switch it from Settings,
    // and that decision then outlives a restart.
    enabled: typeof storedEnabled === 'boolean' ? storedEnabled : envFlag('SHELVARR_AUTH_ENABLED', true),
    allowSignupDefault: envFlag('SHELVARR_ALLOW_SIGNUP', false),
    // Ten minutes: long enough to fetch an email on another device, short
    // enough that a six-character code is not sitting around to be guessed.
    loginCodeTtlSeconds: envInt('SHELVARR_LOGIN_CODE_TTL', 10 * 60),
    sessionTtlSeconds: envInt('SHELVARR_SESSION_TTL', 30 * 24 * 60 * 60),
    // Phones sign in rarely and are hard to sign in on; a year is kinder.
    nativeSessionTtlSeconds: envInt('SHELVARR_NATIVE_SESSION_TTL', 365 * 24 * 60 * 60),
    email: getEmailConfig(),
  };
}

/**
 * Turn accounts on or off.
 *
 * Switching this off leaves the server open to anyone who can reach it, which
 * is why only an admin may call it. Switching it back on is safe from any
 * state: with no accounts the first-run wizard opens, and with accounts the
 * existing sign-in does.
 *
 * The stored answer beats the environment, so a deployment that sets
 * SHELVARR_AUTH_ENABLED cannot quietly undo an admin's choice on restart. To
 * recover from a database that says `true` with no way in, clear the override:
 *
 *     sqlite3 data/shelvarr.db "DELETE FROM settings WHERE key = 'auth_enabled'"
 */
export function setAuthEnabled(enabled: boolean): void {
  setSetting(AUTH_ENABLED_SETTING, enabled);
}

/** Whether outgoing mail is configured well enough to try sending. */
export function isEmailConfigured(): boolean {
  return getEmailConfig().host !== null;
}

export function isAuthEnabled(): boolean {
  return getAuthConfig().enabled;
}
