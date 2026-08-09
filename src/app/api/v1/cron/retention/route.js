import { config } from '@/lib/config';
import { fail, handler, ok } from '@/lib/api';
import { safeEqual } from '@/lib/tokens';
import { runRetentionCycle } from '@/lib/retention';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * RET-4: the daily purge, callable by a scheduler (Vercel Cron, systemd timer,
 * Toolforge job). `npm run purge` runs the same code path from a shell.
 *
 * Observability note (§21): a failure here is a broken privacy promise, not a
 * cosmetic bug — the non-200 response is what the uptime alert should page on.
 */
export const POST = handler(async (req) => {
  const secret = config.retention.cronSecret;
  if (!secret) return fail(503, 'CRON_SECRET is not configured.');

  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-cron-secret') ||
    '';
  if (!safeEqual(provided, secret)) return fail(401, 'Unauthorized');

  const summary = await runRetentionCycle();
  return ok(summary);
});
