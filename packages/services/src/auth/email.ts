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

export interface LoginCodeMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * The body of a sign-in email.
 *
 * The code goes in the subject line as well as the body: on a phone that
 * often means the whole sign-in happens from the notification, without
 * opening the mail at all.
 */
export function buildLoginCodeMessage(options: {
  code: string;
  ttlMinutes: number;
  isNewAccount?: boolean;
}): LoginCodeMessage {
  const { code, ttlMinutes, isNewAccount } = options;
  const action = isNewAccount ? 'Finish setting up your Shelvarr account' : 'Sign in to Shelvarr';

  const text = [
    `${action} with this code:`,
    '',
    code,
    '',
    `Type it into the screen that asked for it. It works once and expires in ${ttlMinutes} minutes.`,
    '',
    'If you did not ask to sign in, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#12151a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e6e8eb">
    <div style="max-width:480px;margin:0 auto;background:#1a1e26;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#fff">${escapeHtml(action)}</h1>
      <p style="margin:0 0 24px;color:#9aa3ad">
        Type this code into the screen that asked for it. It works once and
        expires in ${ttlMinutes} minutes.
      </p>
      <p style="margin:0 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#fff">
        ${escapeHtml(code)}
      </p>
      <p style="margin:0;font-size:12px;color:#6b7280">
        If you did not ask to sign in, you can ignore this email.
      </p>
    </div>
  </body>
</html>`;

  return { subject: `${code} is your Shelvarr sign-in code`, text, html };
}
