import { prisma } from '@/lib/db';
import { assertSameOrigin, handler, notFound, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { destroyAsset } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// GAL-2 / SEC-8: moderation removal. Deletion is immediate and hard — the same
// promise made to participants applies to the organizer's own takedowns.
export const DELETE = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id, imageId } = await params;
  const { campaign } = await loadCampaignFor(user, id);

  const image = await prisma.generatedImage.findFirst({
    where: { id: imageId, campaignId: campaign.id },
  });
  if (!image) throw notFound('Image not found');

  await prisma.generatedImage.delete({ where: { id: image.id } });
  await destroyAsset(image.assetId);
  console.log(`[moderation] removed image=${image.id} campaign=${campaign.id} by=${user.id}`);

  return ok({ deleted: true });
});
