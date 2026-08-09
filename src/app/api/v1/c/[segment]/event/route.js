import { clientIp, handler, ok } from '@/lib/api';
import { consume } from '@/lib/ratelimit';
import { recordEvent, resolveCampaignByLink } from '@/lib/participant';

export const dynamic = 'force-dynamic';

/**
 * SHARE-4 / §17.2 — the analytics beacon.
 *
 * Only the campaign, the kind of event and a platform string are recorded. No
 * cookie is set, no identifier is derived from the request, and the IP is used
 * solely to throttle this endpoint and is never written down (SEC-5).
 */
export const POST = handler(async (req, { params }) => {
  const { segment } = await params;
  const campaign = await resolveCampaignByLink(segment);

  // Beacons are cheap but must not become a write amplifier for a public URL.
  const { allowed } = consume(`beacon:${campaign.id}:${clientIp(req)}`, 200);
  if (!allowed) return ok({ recorded: false });

  const body = await req.json().catch(() => ({}));
  const platform = typeof body.platform === 'string' ? body.platform.slice(0, 24) : undefined;

  await recordEvent(campaign.id, String(body.kind || ''), platform ? { platform } : undefined);
  return ok({ recorded: true });
});
