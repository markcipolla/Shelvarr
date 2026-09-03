import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/**
 * A URL-safe secret with 256 bits of entropy. Used for session tokens, which
 * are held by software and never read by a person.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What gets written to the database. Tokens are high-entropy random strings,
 * not passwords, so a single SHA-256 is enough: there is no dictionary to
 * attack, and a slow hash would only slow down every request.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compare two hex digests without leaking where they first differ. */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// I, O, 0 and 1 are left out: this code is read off a screen and typed back
// in, and those four are the pairs people get wrong.
const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** How many characters a sign-in code has. Clients size their input from this. */
export const LOGIN_CODE_LENGTH = 6;

/**
 * A one-time sign-in code.
 *
 * Six characters of a 32-symbol alphabet is a little over 30 bits — nowhere
 * near a session token, which is why `verifyLoginCode` bounds both how many
 * codes an account may be sent and how many guesses each one tolerates.
 *
 * The alphabet is exactly 32 symbols, so `byte % 32` uses all 256 byte values
 * evenly and needs no rejection sampling.
 */
export function generateLoginCode(): string {
  const bytes = randomBytes(LOGIN_CODE_LENGTH);
  return Array.from(bytes, (byte) => LOGIN_CODE_ALPHABET[byte % LOGIN_CODE_ALPHABET.length]).join(
    ''
  );
}

/**
 * Tidy up a code as typed. Upper-cases it and drops the spaces and dashes
 * people add when copying six characters out of an email; everything else is
 * left alone so a genuine typo fails rather than silently shifting the code.
 */
export function normaliseLoginCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}
