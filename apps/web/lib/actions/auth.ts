'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { User, UserRole } from '@shelvarr/types';
import { auth } from '@shelvarr/services';
import '@/lib/config';
import {
  clearSessionCookie,
  getCurrentUser,
  getSessionToken,
  isSecureRequest,
  requestOrigin,
  setSessionCookie,
} from '@/lib/auth';

export interface ActionResult {
  ok: boolean;
  message?: string;
  /**
   * Set when mail is not configured and the link had to be shown instead of
   * sent. Only ever returned to someone who has just proved they can act —
   * the first-run wizard — never to an anonymous sign-in attempt.
   */
  link?: string;
}

function describe(error: unknown): string {
  if (error instanceof auth.AuthError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong';
}

/**
 * Create the first admin and sign them straight in.
 *
 * Signing in without a magic link is safe exactly once: this only works while
 * the server has no accounts at all, so there is nobody to impersonate. It
 * also means the wizard works before SMTP is configured, which matters — an
 * admin who cannot receive mail could otherwise never get in.
 */
export async function completeSetup(formData: FormData): Promise<ActionResult> {
  if (!auth.isAuthEnabled()) {
    return { ok: false, message: 'Authentication is disabled on this server' };
  }

  const email = String(formData.get('email') ?? '');
  const name = String(formData.get('name') ?? '');
  const allowSignup = formData.get('allowSignup') === 'on';

  let user: User;
  try {
    user = auth.createFirstAdmin(email, name);
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  auth.setSignupAllowed(allowSignup);

  const issued = auth.issueSession(user, 'web', 'Setup wizard');
  await setSessionCookie(issued.token, await isSecureRequest());

  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Ask for a magic link.
 *
 * The answer is the same whether or not the address has an account, so this
 * cannot be used to find out who is registered.
 */
export async function requestMagicLink(formData: FormData): Promise<ActionResult> {
  if (!auth.isAuthEnabled()) {
    return { ok: false, message: 'Authentication is disabled on this server' };
  }

  const email = String(formData.get('email') ?? '');
  if (!auth.isValidEmail(email)) {
    return { ok: false, message: 'Enter a valid email address' };
  }

  const next = String(formData.get('next') ?? '');
  try {
    const result = await auth.requestLogin({
      email,
      client: 'web',
      redirectTo: auth.isSafeRedirect(next) ? next : null,
      origin: await requestOrigin(),
    });

    if (!result.emailSent && !auth.isEmailConfigured()) {
      return {
        ok: true,
        message:
          'Email is not configured on this server, so the link could not be sent. ' +
          'The administrator can find it in the server log.',
      };
    }
  } catch (error) {
    // Rate limiting is worth surfacing; anything else is reported the same
    // way as success so nothing leaks about the address.
    if (error instanceof auth.AuthError && error.code === 'rate-limited') {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: describe(error) };
  }

  return {
    ok: true,
    message: 'Check your email for a sign-in link. It expires shortly.',
  };
}

export async function signOut(): Promise<void> {
  const token = await getSessionToken();
  if (token) auth.revokeSessionToken(token);
  await clearSessionCookie();
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * End every session this account holds, on every device. The way back in
 * after losing a phone, and the reason sessions are recorded per device.
 */
export async function signOutEverywhere(): Promise<void> {
  const user = await getCurrentUser();
  if (user) auth.revokeAllSessions(user.id);
  await clearSessionCookie();
  revalidatePath('/', 'layout');
  redirect('/login');
}

async function requireAdminUser(): Promise<User> {
  if (!auth.isAuthEnabled()) {
    throw new Error('Authentication is disabled on this server');
  }
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only an admin can do that');
  }
  return user;
}

/** Add an account and email its owner a link to sign in with. */
export async function inviteUser(formData: FormData): Promise<ActionResult> {
  try {
    await requireAdminUser();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  const email = String(formData.get('email') ?? '');
  const name = String(formData.get('name') ?? '');
  const role: UserRole = formData.get('role') === 'admin' ? 'admin' : 'user';

  try {
    auth.createAccount(email, name, role);
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  const result = await auth.requestLogin({
    email,
    client: 'web',
    origin: await requestOrigin(),
  });

  revalidatePath('/settings/users');

  if (result.emailSent) {
    return { ok: true, message: `Invited ${email}. A sign-in link is on its way.` };
  }
  // The admin asked for this, so they get the link rather than a dead end.
  return {
    ok: true,
    message: `Created the account for ${email}, but email is not configured. Send them this link yourself — it expires shortly.`,
    link: result.link,
  };
}

/** Email an existing account a fresh sign-in link. */
export async function resendInvite(userId: number): Promise<ActionResult> {
  try {
    await requireAdminUser();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  const target = auth.getUserById(userId);
  if (!target) return { ok: false, message: 'No such account' };

  try {
    const result = await auth.requestLogin({
      email: target.email,
      client: 'web',
      origin: await requestOrigin(),
    });
    if (result.emailSent) {
      return { ok: true, message: `Sent a fresh sign-in link to ${target.email}.` };
    }
    return {
      ok: true,
      message: `Email is not configured. Send ${target.email} this link yourself — it expires shortly.`,
      link: result.link,
    };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function removeUser(userId: number): Promise<ActionResult> {
  let admin: User;
  try {
    admin = await requireAdminUser();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  if (admin.id === userId) {
    return { ok: false, message: 'You cannot remove your own account' };
  }

  try {
    auth.removeAccount(userId);
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  revalidatePath('/settings/users');
  return { ok: true, message: 'Account removed' };
}

export async function changeUserRole(userId: number, role: UserRole): Promise<ActionResult> {
  let admin: User;
  try {
    admin = await requireAdminUser();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  if (admin.id === userId && role !== 'admin') {
    return { ok: false, message: 'You cannot remove your own admin access' };
  }

  try {
    auth.setRole(userId, role);
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  revalidatePath('/settings/users');
  return { ok: true, message: 'Role updated' };
}

export async function setSelfSignup(allowed: boolean): Promise<ActionResult> {
  try {
    await requireAdminUser();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  auth.setSignupAllowed(allowed);
  revalidatePath('/settings/users');
  return {
    ok: true,
    message: allowed ? 'Anyone can now sign up' : 'Sign-ups are now invite-only',
  };
}

export async function testEmailSettings(): Promise<ActionResult> {
  try {
    await requireAdminUser();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  const result = await auth.verifyEmailConnection();
  return result.ok
    ? { ok: true, message: 'Connected to the mail server successfully' }
    : { ok: false, message: result.error ?? 'Could not connect to the mail server' };
}
