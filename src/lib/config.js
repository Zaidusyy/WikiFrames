import crypto from 'node:crypto';
import { ASPECT_RATIOS, ratioDims } from './geometry';

// Central config. Everything is read from env with sane local defaults so the
// app boots on a laptop, but nothing security-sensitive silently defaults in
// production (see assertProductionConfig, run once at boot from
// src/instrumentation.js).

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const secureCookies = baseUrl.startsWith('https://');

/**
 * Key for signed, expiring links (participant image URLs). Production must set
 * APP_SECRET; in development a per-process random key is fine — links simply
 * stop verifying after a restart. Cached on globalThis so hot reloads in
 * `next dev` do not invalidate every link on each save.
 */
function appSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  globalThis.__wikiframesDevSecret ??= crypto.randomBytes(32).toString('base64url');
  return globalThis.__wikiframesDevSecret;
}

function intFromEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export const config = {
  appName: 'WikiFrames',
  baseUrl,
  isProduction,

  oauth: {
    // Wikimedia OAuth 2.0 consumer registered on Meta-Wiki (PDR §6).
    authorizeUrl:
      process.env.WIKIMEDIA_AUTHORIZE_URL ||
      'https://meta.wikimedia.org/w/rest.php/oauth2/authorize',
    tokenUrl:
      process.env.WIKIMEDIA_TOKEN_URL ||
      'https://meta.wikimedia.org/w/rest.php/oauth2/access_token',
    profileUrl:
      process.env.WIKIMEDIA_PROFILE_URL ||
      'https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile',
    clientId: process.env.WIKIMEDIA_CLIENT_ID || '',
    clientSecret: process.env.WIKIMEDIA_CLIENT_SECRET || '',
    // AUTH-1: identity only. We never request write scopes (SEC-1). This is
    // the grant of a consumer registered as "User identity verification only";
    // MediaWiki silently drops any scope the consumer was not granted.
    scope: process.env.WIKIMEDIA_SCOPE || 'mwoauth-authonly',
  },

  cookies: {
    secure: secureCookies,
    // `__Host-` cookies cannot be set by a sibling subdomain (think another
    // tool on the same shared hosting domain), only over HTTPS, only for "/".
    // Browsers refuse the prefix over plain http, so local development keeps
    // the bare names.
    session: secureCookies ? '__Host-wf_session' : 'wf_session',
    oauthState: secureCookies ? '__Host-wf_oauth_state' : 'wf_oauth_state',
    oauthVerifier: secureCookies ? '__Host-wf_oauth_verifier' : 'wf_oauth_verifier',
  },

  session: {
    // AUTH-3: 14-day sliding window, 30-day absolute ceiling.
    slidingDays: 14,
    absoluteDays: 30,
  },

  get secret() {
    return appSecret();
  },

  retention: {
    // RET-4: event end date + 30 days, hard delete.
    days: intFromEnv('RETENTION_DAYS', 30, { min: 1, max: 30 }),
    cronSecret: process.env.CRON_SECRET || '',
    // The in-process scheduler is a safety net behind the external cron job:
    // a forgotten crontab must not quietly turn "30 days" into "forever".
    schedulerEnabled: process.env.RETENTION_SCHEDULER !== 'off',
    schedulerIntervalMinutes: intFromEnv('RETENTION_INTERVAL_MINUTES', 60, { min: 5, max: 24 * 60 }),
  },

  // Number of reverse proxies in front of the app that append to
  // X-Forwarded-For. The client address is read that many entries from the
  // right, so values a client injects at the left are ignored. Never expose
  // `next start` directly to the internet: without a proxy the header is
  // entirely client-controlled.
  trustProxyHops: intFromEnv('TRUST_PROXY_HOPS', 1, { min: 0, max: 10 }),

  // Some hosts hide visitor addresses from the app on purpose — Toolforge's
  // front proxy does, for privacy, and throttles each real address itself. Then
  // every request appears to come from one address, and per-address limits
  // become shared ones (see perIpLimit in api.js).
  clientIpHidden: process.env.CLIENT_IP_HIDDEN === 'true',

  limits: {
    // LINK-5. Per IP per campaign. Event venues put hundreds of people behind
    // one NAT address, so this is deliberately generous — and photos that are
    // not stored never reach the server at all (on-device rendering).
    generatePerHourPerIp: intFromEnv('RATE_LIMIT_GENERATE_PER_HOUR', 60, { min: 1 }),
    accessCodeFailuresPerIp: 30, // per 15 minutes
    accessCodeFailuresPerCampaign: 300, // per 15 minutes, across all addresses
    frameUploadBytes: 10 * 1024 * 1024, // UP-1
    photoUploadBytes: 15 * 1024 * 1024, // PART-1 flow
    logoBytes: 2 * 1024 * 1024,
    artifactBytes: 8 * 1024 * 1024, // images placed inside the canvas editor
    artifactImportsPerHour: 120,
    jsonBodyBytes: 256 * 1024,
    canvasJsonBytes: 2 * 1024 * 1024,
    templatesPerCampaign: 10, // CAMP-3 recommended cap
    softDeleteDays: 7, // DASH-3
    commonsDownloadBytes: 25 * 1024 * 1024,
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local', // local | s3
    localRoot: process.env.STORAGE_LOCAL_ROOT || '.storage',
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || '',
      endpoint: process.env.S3_ENDPOINT || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  },

  // Wikimedia's User-Agent policy asks every client for a way to reach its
  // operator: https://meta.wikimedia.org/wiki/User-Agent_policy
  userAgent: `WikiFrames/0.2 (${process.env.WIKIMEDIA_CONTACT || 'https://github.com/Zaidusyy/WikiFrames'})`,

  // AUTH-6 forbids insecure fallbacks. This switch exists purely so contributors
  // can run the product before a Meta-Wiki consumer is registered; it is refused
  // outright in production by assertProductionConfig().
  devLoginEnabled: !isProduction && process.env.ALLOW_DEV_LOGIN === 'true',

  superAdminUsernames: (process.env.SUPER_ADMIN_USERNAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export function assertProductionConfig() {
  if (!isProduction) return;
  const missing = [];
  if (!config.oauth.clientId) missing.push('WIKIMEDIA_CLIENT_ID');
  if (!config.oauth.clientSecret) missing.push('WIKIMEDIA_CLIENT_SECRET');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!config.baseUrl.startsWith('https://')) missing.push('APP_BASE_URL (must be https)');
  if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 32) {
    missing.push('APP_SECRET (at least 32 characters)');
  }
  if (process.env.ALLOW_DEV_LOGIN === 'true') missing.push('ALLOW_DEV_LOGIN must be unset');
  if (missing.length) {
    throw new Error(`WikiFrames misconfigured for production: ${missing.join(', ')}`);
  }
}

// Re-exported for the server modules that have always imported them from here.
export { ASPECT_RATIOS, ratioDims };
