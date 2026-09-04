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
  setSessionCookie,
} from '@/lib/auth';

export interface ActionResult {
  ok: boolean;
  message?: string;
  /**
   * Set when mail is not configured and the code had to be shown instead of
   * sent. Only ever returned to someone who has just proved they can act —
   * an admin inviting somebody — never to an anonymous sign-in attempt.
   */
  code?: string;
}

function describe(error: unknown): string {
  if (error instanceof auth.AuthError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong';
}

/**
 * Create the first admin and sign them straight in.
 *
 * Signing in without a code is safe exactly once: this only works while
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
 * Ask for a one-time sign-in code.
 *
 * The answer is the same whether or not the address has an account, so this
 * cannot be used to find out who is registered.
 */
export async function requestLoginCode(formData: FormData): Promise<ActionResult> {
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
    });

    if (!result.emailSent && !auth.isEmailConfigured()) {
      return {
        ok: true,
        message:
          'Email is not configured on this server, so the code could not be sent. ' +
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

  return { ok: true, message: 'Check your email for a sign-in code.' };
}

/**
 * Redeem a code and sign the browser in.
 *
 * Returns rather than redirects on success: the form clears its own state and
 * navigates, which keeps the redirect out of a server action's error path.
 */
export async function submitLoginCode(
  formData: FormData
): Promise<ActionResult & { redirectTo?: string }> {
  if (!auth.isAuthEnabled()) {
    return { ok: false, message: 'Authentication is disabled on this server' };
  }

  const email = String(formData.get('email') ?? '');
  const code = String(formData.get('code') ?? '');
  const next = String(formData.get('next') ?? '');

  let result;
  try {
    result = auth.verifyLoginCode({ email, code, client: 'web' });
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  await setSessionCookie(result.issued.token, await isSecureRequest());
  revalidatePath('/', 'layout');

  const destination = auth.isSafeRedirect(result.redirectTo)
    ? result.redirectTo
    : auth.isSafeRedirect(next)
      ? next
      : '/';
  return { ok: true, redirectTo: destination };
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

/** Add an account and email its owner a code to sign in with. */
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

  const result = await auth.requestLogin({ email, client: 'web' });

  revalidatePath('/settings/users');

  if (result.emailSent) {
    return { ok: true, message: `Invited ${email}. A sign-in code is on its way.` };
  }
  // The admin asked for this, so they get the code rather than a dead end.
  return {
    ok: true,
    message: `Created the account for ${email}, but email is not configured. Pass them this code yourself — it expires shortly.`,
    code: result.code,
  };
}

/** Email an existing account a fresh sign-in code. */
export async function resendInvite(userId: number): Promise<ActionResult> {
  try {
    await requireAdminUser();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  const target = auth.getUserById(userId);
  if (!target) return { ok: false, message: 'No such account' };

  try {
    const result = await auth.requestLogin({ email: target.email, client: 'web' });
    if (result.emailSent) {
      return { ok: true, message: `Sent a fresh sign-in code to ${target.email}.` };
    }
    return {
      ok: true,
      message: `Email is not configured. Pass ${target.email} this code yourself — it expires shortly.`,
      code: result.code,
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

/**
 * Gate for the server-wide access settings below.
 *
 * Deliberately not `requireAdminUser`, which refuses outright when
 * authentication is off. That policy would make turning accounts back *on*
 * impossible from the only screen that offers to — the setting would be a
 * one-way door out of authentication. With accounts off there is no user to
 * check against, and running that way is already a declaration that the
 * network is trusted, which is the same reasoning the Advanced tab's gate
 * uses.
 */
async function requireAdminOrOpenServer(): Promise<void> {
  if (!auth.isAuthEnabled()) return;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only an admin can do that');
  }
}

/** Mail settings as the form may see them — never the saved password. */
export interface EmailSettingsView {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  from: string;
  /**
   * Whether a password is saved, instead of the password. The form needs to
   * show *that* one exists so it can offer to replace it, and sending the
   * value to the browser to render would be handing it out for no reason.
   */
  passwordSet: boolean;
}

export interface AccessSettings {
  authEnabled: boolean;
  email: EmailSettingsView;
}

function viewOf(config: ReturnType<typeof auth.getEmailConfig>): EmailSettingsView {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    from: config.from,
    passwordSet: config.password !== null,
  };
}

export async function getAccessSettings(): Promise<AccessSettings> {
  await requireAdminOrOpenServer();
  return { authEnabled: auth.isAuthEnabled(), email: viewOf(auth.getEmailConfig()) };
}

/**
 * Turn accounts on or off for the whole server.
 *
 * Switching off leaves it open to anyone who can reach it, so the message says
 * so plainly rather than reporting a bland success.
 */
export async function setAuthEnabledAction(enabled: boolean): Promise<ActionResult> {
  try {
    await requireAdminOrOpenServer();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  auth.setAuthEnabled(enabled);
  // 'layout' rather than the page: the sidebar and the account menu both
  // change shape when accounts come and go.
  revalidatePath('/', 'layout');

  return {
    ok: true,
    message: enabled
      ? 'Accounts are on. Anyone without a session will be asked to sign in.'
      : 'Accounts are off. Anyone who can reach this server now has full access.',
  };
}

export interface EmailSettingsForm {
  host: string | null;
  port: number | null;
  secure: boolean | null;
  user: string | null;
  /** Omitted when the admin did not retype it; null or empty clears it. */
  password?: string | null;
  from: string | null;
}

export async function saveEmailSettings(input: EmailSettingsForm): Promise<ActionResult> {
  try {
    await requireAdminOrOpenServer();
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  try {
    auth.setEmailSettings(input);
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  revalidatePath('/settings/users');

  return {
    ok: true,
    message: auth.isEmailConfigured()
      ? 'Mail settings saved. Use "Send a test" to check them.'
      : 'Mail settings cleared. Sign-in codes will be written to the server log instead.',
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
