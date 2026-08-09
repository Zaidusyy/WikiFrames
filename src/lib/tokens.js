import crypto from 'node:crypto';

// LINK-1 / SEC-4: 128-bit URL-safe random, never derived from the campaign id.
export function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// SEC-4: constant-time comparison for anything secret-shaped.
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function slugify(input, { maxLength = 60 } = {}) {
  const base = String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  return base || 'campaign';
}

// The participant URL is `/c/<slug>-<token>`; the token is the only credential.
export function buildLinkPath(slug, token) {
  return `/c/${slug}-${token}`;
}

// Splits `slug-token` back apart. The token is the trailing segment, so we take
// everything after the final dash — slugs may legitimately contain dashes.
export function parseLinkSegment(segment) {
  const idx = String(segment).lastIndexOf('-');
  if (idx < 0) return { slug: '', token: String(segment) };
  return { slug: segment.slice(0, idx), token: segment.slice(idx + 1) };
}
