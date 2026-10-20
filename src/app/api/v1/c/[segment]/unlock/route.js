import { clientIp, handler, ok, rateKeyForIp, readJson } from '@/lib/api';
import { assertAccessCode, frameUrls, resolveCampaignByLink } from '@/lib/participant';

export const dynamic = 'force-dynamic';

/**
 * LINK-7: checks the venue access code before the participant starts, and
 * only then releases the frames.
 *
 * The code is checked up front so nobody types it after framing their photo
 * only to be told it is wrong. Wrong guesses are throttled per address and
 * per campaign (see assertAccessCode), so this is not a free oracle.
 */
export const POST = handler(async (req, { params }) => {
  const { segment } = await params;
  const campaign = await resolveCampaignByLink(segment);
  const body = await readJson(req, 1024);
  assertAccessCode(campaign, body.accessCode, rateKeyForIp(clientIp(req)));
  return ok({ unlocked: true, templates: frameUrls(campaign) }, { headers: { 'Cache-Control': 'no-store' } });
});
