import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/**
 * A URL-safe secret with 256 bits of entropy. Used for magic links, session
 * tokens and device codes alike — all of them are bearer secrets, so all of
 * them get the same strength.
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

// I, O, 0 and 1 are left out: this code is read off a screen and typed back in.
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A short code shown both in the app and in the email, so someone approving a
 * device login can see the two refer to the same request. It is a confirmation
 * aid, not a secret — the device code is what actually authorises the login.
 */
export function generateUserCode(): string {
  const bytes = randomBytes(6);
  const chars = Array.from(bytes, (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]);
  return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`;
}
