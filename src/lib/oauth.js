import { config } from './config';
import { randomToken, sha256 } from './tokens';

// Wikimedia OAuth 2.0 (PDR §6.2) with PKCE. We request identity scope only —
// SEC-1 forbids ever asking for wiki write permissions.

export function redirectUri() {
  return `${config.baseUrl}/api/v1/auth/wikimedia/callback`;
}

export function buildAuthorizeUrl({ state, codeVerifier }) {
  const challenge = base64url(sha256Bytes(codeVerifier));
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Wikimedia token exchange failed (${res.status})`);
  }
  return res.json();
}

export async function fetchProfile(accessToken) {
  const res = await fetch(config.oauth.profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Wikimedia profile fetch failed (${res.status})`);
  const data = await res.json();
  // Meta-Wiki returns { sub, username, editcount, ... }; `sub` is the central id.
  return {
    wikiUserId: BigInt(data.sub ?? data.userid ?? 0),
    wikiUsername: data.username ?? data.name ?? 'Unknown',
    userPageUrl: `https://meta.wikimedia.org/wiki/User:${encodeURIComponent(
      (data.username ?? '').replace(/ /g, '_')
    )}`,
  };
}

export function newCodeVerifier() {
  return randomToken(32);
}

export function newState() {
  return randomToken(16);
}

function sha256Bytes(value) {
  // sha256() returns hex; PKCE needs the raw digest bytes.
  return Buffer.from(sha256(value), 'hex');
}

function base64url(buf) {
  return buf.toString('base64url');
}
