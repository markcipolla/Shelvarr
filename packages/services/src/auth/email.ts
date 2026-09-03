import type { EmailConfig } from '@shelvarr/types';
import { getEmailConfig } from './config';
import { createLogger } from '../utils/logger';

const log = createLogger('auth:email');

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendMailResult =
  | { sent: true }
  | { sent: false; reason: 'not-configured' | 'failed'; error?: string };

/**
 * nodemailer is loaded on demand. Mail is an optional feature — an install
 * with no SMTP settings should not pay to load a transport it never uses, and
 * bundlers must not try to follow it into the client.
 */
async function createTransport(config: EmailConfig) {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport({
    host: config.host!,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? '' } : undefined,
  });
}

/**
 * Send a transactional email, or explain why it could not be sent.
 *
 * Never throws: a failed send must not take down the request that triggered
 * it, because the caller has to give the same answer either way (see
 * `requestLogin`, which deliberately reveals nothing about the address).
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const config = getEmailConfig();
  if (!config.host) {
    return { sent: false, reason: 'not-configured' };
  }

  try {
    const transport = await createTransport(config);
    await transport.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Failed to send email to ${input.to}: ${message}`);
    return { sent: false, reason: 'failed', error: message };
  }
}

/** Verify the SMTP settings without sending anything. */
export async function verifyEmailConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = getEmailConfig();
  if (!config.host) return { ok: false, error: 'SMTP_HOST is not set' };

  try {
    const transport = await createTransport(config);
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface MagicLinkMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * The body of a sign-in email. `userCode` is only present for a native login,
 * where the reader needs to check the code matches the one on their phone.
 */
export function buildMagicLinkMessage(options: {
  link: string;
  ttlMinutes: number;
  userCode?: string | null;
  isNewAccount?: boolean;
}): MagicLinkMessage {
  const { link, ttlMinutes, userCode, isNewAccount } = options;
  const action = isNewAccount ? 'Finish setting up your Shelvarr account' : 'Sign in to Shelvarr';

  const codeLineText = userCode
    ? `\nThis is for the Shelvarr app showing the code ${userCode}. If that code does not match, ignore this email.\n`
    : '';
  const codeLineHtml = userCode
    ? `<p style="margin:0 0 16px">This is for the Shelvarr app showing the code
         <strong style="font-family:monospace;font-size:18px">${escapeHtml(userCode)}</strong>.
         If that code does not match, ignore this email.</p>`
    : '';

  const text = [
    `${action} by opening this link:`,
    '',
    link,
    codeLineText,
    `The link works once and expires in ${ttlMinutes} minutes.`,
    '',
    'If you did not ask to sign in, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#12151a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e6e8eb">
    <div style="max-width:480px;margin:0 auto;background:#1a1e26;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#fff">${escapeHtml(action)}</h1>
      ${codeLineHtml}
      <p style="margin:0 0 24px;color:#9aa3ad">
        The link below works once and expires in ${ttlMinutes} minutes.
      </p>
      <a href="${escapeHtml(link)}"
         style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
        ${escapeHtml(action)}
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280;word-break:break-all">
        Or paste this into your browser:<br>${escapeHtml(link)}
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280">
        If you did not ask to sign in, you can ignore this email.
      </p>
    </div>
  </body>
</html>`;

  return { subject: action, text, html };
}
