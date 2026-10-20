import crypto from 'node:crypto';

// LINK-1 / SEC-4: 128-bit URL-safe random, never derived from the campaign id.
export function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Per-process key so comparing two digests never depends on the inputs' length.
const COMPARE_KEY = crypto.randomBytes(32);

/**
 * SEC-4: constant-time comparison for anything secret-shaped. Both sides are
 * HMAC'd first, so neither the content nor the *length* of the expected value
 * leaks through timing.
 */
export function safeEqual(a, b) {
  const digestA = crypto.createHmac('sha256', COMPARE_KEY).update(String(a)).digest();
  const digestB = crypto.createHmac('sha256', COMPARE_KEY).update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function slugify(input, { maxLength = 60 } = {}) {
  const base = String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return base || 'campaign';
}

// The participant URL is `/c/<slug>-<token>`; the token is the only credential.
export function buildLinkPath(slug, token) {
  return `/c/${slug}-${token}`;
}

// Splits `slug-token` back apart. The token is the trailing segment, so we take
// everything after the final dash — slugs may legitimately contain dashes.
//
// base64url tokens can themselves contain "-", so a dash inside the token
// would cut it short; resolveCampaignByLink therefore also tries the
// fixed-length suffix (see LINK_TOKEN_LENGTH).
export function parseLinkSegment(segment) {
  const value = String(segment);
  const idx = value.lastIndexOf('-');
  if (idx < 0) return { slug: '', token: value };
  return { slug: value.slice(0, idx), token: value.slice(idx + 1) };
}

/** randomToken(16) is always 22 base64url characters. */
export const LINK_TOKEN_LENGTH = 22;

/** Candidate tokens for a participant URL segment, most likely first. */
export function linkTokenCandidates(segment) {
  const value = String(segment);
  const candidates = [];
  if (value.length >= LINK_TOKEN_LENGTH) candidates.push(value.slice(-LINK_TOKEN_LENGTH));
  const { token } = parseLinkSegment(value);
  if (token && !candidates.includes(token)) candidates.push(token);
  return candidates.filter((t) => /^[A-Za-z0-9_-]{16,64}$/.test(t));
}
