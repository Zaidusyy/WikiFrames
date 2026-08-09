import { assertSameOrigin, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { cloneCampaign } from '@/lib/campaigns';

export const dynamic = 'force-dynamic';

// DASH-5: settings, templates, captions and roles carry over; images and the
// link token deliberately do not.
export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);
  const copy = await cloneCampaign(campaign, user.id);
  return ok({ campaign: copy }, { status: 201 });
});
