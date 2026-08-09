import { handler, ok } from '@/lib/api';
import { participantPayload, recordEvent, resolveCampaignByLink } from '@/lib/participant';

export const dynamic = 'force-dynamic';

// AUTH-4 / LINK-3: no login, no cookie — the token in the path is the whole
// credential, and the campaign's lifecycle state decides what comes back.
export const GET = handler(async (req, { params }) => {
  const { segment } = await params;
  const campaign = await resolveCampaignByLink(segment);

  const via = new URL(req.url).searchParams.get('via');
  await recordEvent(campaign.id, 'link_open', via === 'qr' ? { source: 'qr' } : undefined);
  if (via === 'qr') await recordEvent(campaign.id, 'qr_scan', undefined);

  return ok(participantPayload(campaign), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
