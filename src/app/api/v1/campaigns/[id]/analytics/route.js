import { handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { campaignAnalytics } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

// §17.2: aggregate counters only. No cookies, no fingerprinting, no per-person
// rows — the analytics_events table holds a campaign id, a kind and a share
// target, and nothing that could identify a participant.
export const GET = handler(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);
  const analytics = await campaignAnalytics(campaign.id);
  return ok({
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
    ...analytics,
  });
});
