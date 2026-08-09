#!/usr/bin/env node
/**
 * RET-4 — the retention job, runnable from a shell or a scheduler.
 *
 *   npm run purge
 *   0 3 * * *  cd /srv/wikiframes && npm run purge >> /var/log/wikiframes-purge.log
 *
 * This drives POST /api/v1/cron/retention rather than reimplementing the purge,
 * so there is exactly one piece of code that can delete a participant's image.
 * It needs the app to be running and CRON_SECRET to be set.
 *
 * A non-zero exit means images that should have been deleted still exist. That
 * is a broken privacy promise, not a failed cleanup task — alert on it (§21).
 */
const loadEnv = require('./load-env');

async function main() {
  loadEnv();

  const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error(
      'CRON_SECRET is not set. Generate one (openssl rand -base64 32), put it in .env, and restart the app.'
    );
    process.exit(2);
  }

  const res = await fetch(`${baseUrl}/api/v1/cron/retention`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[retention] cycle FAILED (${res.status})`, body);
    process.exit(1);
  }

  console.log(JSON.stringify(body, null, 2));
  if (body.moreImagesPending) {
    console.log('[retention] more images are queued — run again to finish the batch.');
  }
}

main().catch((err) => {
  console.error('[retention] cycle FAILED', err);
  process.exit(1);
});
