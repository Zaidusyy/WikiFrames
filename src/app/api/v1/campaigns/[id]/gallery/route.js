import { prisma } from '@/lib/db';
import { handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { assetUrl } from '@/lib/storage';
import { daysUntil } from '@/lib/campaigns';

export const dynamic = 'force-dynamic';

// GAL-2: the admin sees the gallery from day one, with RET-5's countdown on
// every image so "download before it goes" is impossible to miss.
export const GET = handler(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);

  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get('limit') || 60), 200);
  const cursor = url.searchParams.get('cursor');

  const images = await prisma.generatedImage.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      role: { select: { label: true, icon: true } },
      template: { select: { name: true, aspectRatio: true } },
      asset: { select: { width: true, height: true, bytes: true } },
    },
  });

  const hasMore = images.length > take;
  const page = hasMore ? images.slice(0, take) : images;

  return ok({
    campaign: { id: campaign.id, name: campaign.name, purgeAt: campaign.purgeAt },
    retention: {
      purgeAt: campaign.purgeAt,
      daysRemaining: daysUntil(campaign.purgeAt),
      // RET-5 phrasing, kept in one place so the UI cannot drift from the promise.
      notice: campaign.purgeAt
        ? `Images auto-delete in ${daysUntil(campaign.purgeAt)} days`
        : 'Retention starts when the event ends.',
    },
    images: page.map((img) => ({
      id: img.id,
      url: assetUrl(img.assetId),
      createdAt: img.createdAt,
      expiresAt: img.expiresAt,
      daysRemaining: daysUntil(img.expiresAt),
      role: img.role?.label ?? null,
      roleIcon: img.role?.icon ?? null,
      template: img.template?.name ?? null,
      aspectRatio: img.template?.aspectRatio ?? null,
      width: img.asset.width,
      height: img.asset.height,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});
