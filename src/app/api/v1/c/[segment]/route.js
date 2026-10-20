import { clientIp, handler, ok, rateKeyForIp } from '@/lib/api';
import { enforce } from '@/lib/ratelimit';
import { participantPayload, recordEvent, resolveCampaignByLink } from '@/lib/participant';

export const dynamic = 'force-dynamic';

// AUTH-4 / LINK-3: no login, no cookie — the token in the path is the whole
// credential, and the campaign's lifecycle state decides what comes back.
export const GET = handler(async (req, { params }) => {
  const { segment } = await params;
  enforce(`payload:${rateKeyForIp(clientIp(req))}`, 600);
  const campaign = await resolveCampaignByLink(segment);

  const via = new URL(req.url).searchParams.get('via');
  await recordEvent(campaign.id, 'link_open', via === 'qr' ? { meta: { source: 'qr' } } : undefined);
  if (via === 'qr') await recordEvent(campaign.id, 'qr_scan');

  return ok(participantPayload(campaign), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
