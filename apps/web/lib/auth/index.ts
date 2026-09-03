import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthStatus, User } from '@shelvarr/types';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const SESSION_COOKIE = auth.SESSION_COOKIE_NAME;

/** How long the browser is told to keep the session cookie. */
function sessionCookieMaxAge(): number {
  return auth.getAuthConfig().sessionTtlSeconds;
}

/**
 * Store a freshly issued session in the browser.
 *
 * `secure` is decided from the request rather than NODE_ENV: plenty of people
 * run this over plain HTTP on a home network, and a Secure cookie there would
 * simply never come back.
 */
export async function setSessionCookie(token: string, isSecureRequest: boolean): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest,
    path: '/',
    maxAge: sessionCookieMaxAge(),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** The signed-in person, or null. Returns null when auth is switched off. */
export async function getCurrentUser(): Promise<User | null> {
  if (!auth.isAuthEnabled()) return null;
  const found = auth.resolveSession(await getSessionToken());
  return found?.user ?? null;
}

export function getAuthStatus(): AuthStatus {
  return auth.getAuthStatus();
}

/**
 * Gate a page. Sends first-run installs to the wizard, signed-out visitors to
 * the sign-in page (remembering where they were headed), and returns null
 * when authentication is disabled so pages can render for everyone.
 */
export async function requirePageUser(): Promise<User | null> {
  if (!auth.isAuthEnabled()) return null;

  if (auth.isSetupRequired()) redirect('/setup');

  const user = await getCurrentUser();
  if (user) return user;

  // Only worth remembering somewhere that is not the page they would land on
  // anyway, so a plain visit to the root gives a clean /login.
  const target = await currentPath();
  redirect(target && target !== '/' ? `/login?next=${encodeURIComponent(target)}` : '/login');
}

/** Pages an admin may see. Anyone else gets sent home rather than a 403 page. */
export async function requireAdmin(): Promise<User | null> {
  const user = await requirePageUser();
  // Null means auth is off, in which case there is nobody to check.
  if (user && user.role !== 'admin') redirect('/');
  return user;
}

/**
 * The path being requested, read from the headers Next.js adds. Used to send
 * someone back where they were going once they have signed in.
 */
async function currentPath(): Promise<string | null> {
  const list = await headers();
  const path = list.get('x-shelvarr-path') || list.get('x-invoke-path');
  return auth.isSafeRedirect(path) ? path : null;
}

/** Whether the current request arrived over HTTPS, proxies included. */
export async function isSecureRequest(): Promise<boolean> {
  const list = await headers();
  const forwardedProto = list.get('x-forwarded-proto');
  if (forwardedProto) return forwardedProto.split(',')[0]?.trim() === 'https';
  return (list.get('origin') || list.get('referer') || '').startsWith('https://');
}

/** The absolute base URL this server is being reached on, for magic links. */
export async function requestOrigin(): Promise<string | null> {
  const list = await headers();
  const host = list.get('x-forwarded-host') || list.get('host');
  if (!host) return null;
  const proto = list.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
  return `${proto}://${host}`;
}
