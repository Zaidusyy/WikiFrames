// Central config. Everything is read from env with sane local defaults so the
// app boots on a laptop, but nothing security-sensitive silently defaults in
// production (see assertProductionConfig).

export const config = {
  appName: 'WikiFrames',
  baseUrl: (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),

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
    // AUTH-1: identity only. We never request write scopes (SEC-1).
    scope: process.env.WIKIMEDIA_SCOPE || 'basic',
  },

  session: {
    cookieName: 'wf_session',
    // AUTH-3: 14-day sliding window, 30-day absolute ceiling.
    slidingDays: 14,
    absoluteDays: 30,
  },

  retention: {
    // RET-4: event end date + 30 days, hard delete.
    days: Number(process.env.RETENTION_DAYS || 30),
    cronSecret: process.env.CRON_SECRET || '',
  },

  limits: {
    // LINK-5
    generatePerHourPerIp: Number(process.env.RATE_LIMIT_GENERATE_PER_HOUR || 20),
    frameUploadBytes: 10 * 1024 * 1024, // UP-1
    photoUploadBytes: 15 * 1024 * 1024, // PART-1 flow
    logoBytes: 2 * 1024 * 1024,
    templatesPerCampaign: 10, // CAMP-3 recommended cap
    softDeleteDays: 7, // DASH-3
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
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
    },
  },

  // AUTH-6 forbids insecure fallbacks. This switch exists purely so contributors
  // can run the product before a Meta-Wiki consumer is registered; it is refused
  // outright in production by assertProductionConfig().
  devLoginEnabled:
    process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === 'true',

  superAdminUsernames: (process.env.SUPER_ADMIN_USERNAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!config.oauth.clientId) missing.push('WIKIMEDIA_CLIENT_ID');
  if (!config.oauth.clientSecret) missing.push('WIKIMEDIA_CLIENT_SECRET');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!config.baseUrl.startsWith('https://')) missing.push('APP_BASE_URL (must be https)');
  if (process.env.ALLOW_DEV_LOGIN === 'true') missing.push('ALLOW_DEV_LOGIN must be unset');
  if (missing.length) {
    throw new Error(`WikiFrames misconfigured for production: ${missing.join(', ')}`);
  }
}

export const ASPECT_RATIOS = {
  '9:16': { w: 1080, h: 1920, label: 'Story / Reel' },
  '4:5': { w: 1080, h: 1350, label: 'Feed portrait' },
  '1:1': { w: 1080, h: 1080, label: 'Square' },
  '16:9': { w: 1920, h: 1080, label: 'Landscape' },
};

export function ratioDims(ratio) {
  return ASPECT_RATIOS[ratio] || ASPECT_RATIOS['1:1'];
}
