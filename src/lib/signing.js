import crypto from 'node:crypto';
import { config } from './config';
import { safeEqual } from './tokens';

/**
 * Short-lived, tamper-proof links.
 *
 * A participant who stores their image gets a URL that works for them right
 * now, without an account, without the image becoming readable by anyone who
 * later finds that URL in a chat log, a browser history or a proxy cache. The
 * signature binds the asset id and an expiry to APP_SECRET; nothing is stored.
 *
 * Purposes are separated (domain separation) so a signature minted for one
 * use can never be replayed for another.
 */

function macFor(purpose, value, expiresAt) {
  return crypto
    .createHmac('sha256', config.secret)
    .update(`${purpose}\n${value}\n${expiresAt}`)
    .digest('base64url')
    .slice(0, 32);
}

/** Returns `<expiresAt>.<mac>`, valid for `ttlSeconds`. */
export function signValue(purpose, value, ttlSeconds) {
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(ttlSeconds));
  return `${expiresAt}.${macFor(purpose, value, expiresAt)}`;
}

export function verifySignedValue(purpose, value, token) {
  if (typeof token !== 'string' || token.length > 64) return false;
  const [expiresRaw, mac] = token.split('.');
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || !mac) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(mac, macFor(purpose, value, expiresAt));
}

export const SIGNED_PURPOSE = {
  ASSET: 'asset-read',
};
