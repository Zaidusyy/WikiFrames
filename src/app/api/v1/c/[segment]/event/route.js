import { clientIp, handler, ok, perIpLimit, rateKeyForIp, readJson } from '@/lib/api';
import { consume } from '@/lib/ratelimit';
import { recordEvent, resolveCampaignByLink } from '@/lib/participant';

export const dynamic = 'force-dynamic';

/**
 * SHARE-4 / §17.2 — the analytics beacon.
 *
 * Only the campaign, the kind of event and a share-target name are recorded.
 * No cookie is set, no identifier is derived from the request, and the IP is
 * used solely to throttle this endpoint and is never written down (SEC-5).
 *
 * Images created on the participant's own device report themselves here as a
 * bare "generate" — that is the only trace an unstored image leaves.
 */
export const POST = handler(async (req, { params }) => {
  const { segment } = await params;

  // Beacons are cheap but must not become a write amplifier for a public URL.
  const { allowed } = consume(`beacon:${segment.slice(-22)}:${rateKeyForIp(clientIp(req))}`, perIpLimit(200));
  if (!allowed) return ok({ recorded: false });

  const campaign = await resolveCampaignByLink(segment);
  const body = await readJson(req, 2048).catch(() => ({}));
  const kind = String(body.kind || '');
  const platform = typeof body.platform === 'string' ? body.platform.slice(0, 24) : undefined;

  await recordEvent(campaign.id, kind, {
    platform,
    meta: kind === 'generate' ? { consent: false, mode: 'device' } : undefined,
  });
  return ok({ recorded: true });
});
