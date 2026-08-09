import { prisma } from '@/lib/db';
import { assertSameOrigin, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertCanDelete, loadCampaignFor } from '@/lib/authz';
import { randomToken } from '@/lib/tokens';
import { campaignUrl, qrDataUrl } from '@/lib/qr';

export const dynamic = 'force-dynamic';

// LINK-2: the escape hatch for a link that leaked before the event. The old
// token stops resolving the moment this returns, and LINK-4 means the QR is
// implicitly regenerated too — it is derived from the URL, never stored stale.
export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign, access } = await loadCampaignFor(user, id);
  assertCanDelete(access);

  const linkToken = randomToken(16);
  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { linkToken },
  });

  const url = campaignUrl(updated.slug, updated.linkToken);
  return ok({ participantUrl: url, qrDataUrl: await qrDataUrl(url) });
});
