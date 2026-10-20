import crypto from 'node:crypto';
import { config } from './config';
import { randomToken } from './tokens';

// Wikimedia OAuth 2.0 (PDR §6.2) with PKCE. We request identity scope only —
// SEC-1 forbids ever asking for wiki write permissions.

const UPSTREAM_TIMEOUT_MS = 15000;

export function redirectUri() {
  return `${config.baseUrl}/api/v1/auth/wikimedia/callback`;
}

export function buildAuthorizeUrl({ state, codeVerifier }) {
  const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const url = new URL(config.oauth.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.oauth.clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (config.oauth.scope) url.searchParams.set('scope', config.oauth.scope);
  return url.toString();
}

export async function exchangeCode({ code, codeVerifier }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: config.oauth.clientId,
    client_secret: config.oauth.clientSecret,
    code_verifier: codeVerifier,
  });

  const res = await fetch(config.oauth.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.userAgent,
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Wikimedia token exchange failed (${res.status})`);
  }
  const data = await res.json();
  if (!data?.access_token || typeof data.access_token !== 'string') {
    throw new Error('Wikimedia token exchange returned no access token');
  }
  return data;
}

/**
 * The identity we key accounts on is the *central user id* (`sub`), never the
 * username: usernames can be renamed and later re-registered by someone else.
 * A profile without a usable id is refused outright — falling back to a
 * default id would let unrelated people land in the same account.
 */
export async function fetchProfile(accessToken) {
  const res = await fetch(config.oauth.profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': config.userAgent },
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Wikimedia profile fetch failed (${res.status})`);
  const data = await res.json();
  return parseProfile(data);
}

export function parseProfile(data) {
  const rawId = data?.sub ?? data?.centralid;
  const idText = typeof rawId === 'number' ? String(rawId) : String(rawId ?? '');
  if (!/^[1-9]\d{0,18}$/.test(idText)) {
    throw new Error('Wikimedia profile did not include a central user id');
  }

  const username = typeof data?.username === 'string' ? data.username.trim() : '';
  if (!username || username.length > 255) {
    throw new Error('Wikimedia profile did not include a username');
  }

  return {
    wikiUserId: BigInt(idText),
    wikiUsername: username,
    userPageUrl: `https://meta.wikimedia.org/wiki/User:${encodeURIComponent(
      username.replace(/ /g, '_')
    )}`,
  };
}

export function newCodeVerifier() {
  // 43+ characters of [A-Za-z0-9-_], as RFC 7636 requires.
  return randomToken(32);
}

export function newState() {
  return randomToken(16);
}
