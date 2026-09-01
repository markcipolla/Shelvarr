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

export function getEmailConfig(): EmailConfig {
  const host = envText('SMTP_HOST');
  // Port 465 is implicit TLS; everything else starts plaintext and upgrades
  // with STARTTLS. SMTP_SECURE overrides when a server disagrees.
  const port = envInt('SMTP_PORT', 587);
  return {
    host,
    port,
    secure: envFlag('SMTP_SECURE', port === 465),
    user: envText('SMTP_USER'),
    password: envText('SMTP_PASSWORD'),
    from: envText('SMTP_FROM') || 'Shelvarr <shelvarr@localhost>',
  };
}

export function getAuthConfig(): AuthConfig {
  return {
    // On by default: a fresh install should not be wide open by accident.
    // Set SHELVARR_AUTH_ENABLED=false for a trusted network or a reverse
    // proxy that already authenticates.
    enabled: envFlag('SHELVARR_AUTH_ENABLED', true),
    allowSignupDefault: envFlag('SHELVARR_ALLOW_SIGNUP', false),
    appUrl: (envText('SHELVARR_URL') || envText('APP_URL'))?.replace(/\/+$/, '') || null,
    loginTokenTtlSeconds: envInt('SHELVARR_LOGIN_LINK_TTL', 15 * 60),
    sessionTtlSeconds: envInt('SHELVARR_SESSION_TTL', 30 * 24 * 60 * 60),
    // Phones sign in rarely and are hard to sign in on; a year is kinder.
    nativeSessionTtlSeconds: envInt('SHELVARR_NATIVE_SESSION_TTL', 365 * 24 * 60 * 60),
    email: getEmailConfig(),
  };
}

/** Whether outgoing mail is configured well enough to try sending. */
export function isEmailConfigured(): boolean {
  return getEmailConfig().host !== null;
}

export function isAuthEnabled(): boolean {
  return getAuthConfig().enabled;
}
