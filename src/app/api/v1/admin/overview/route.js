import { prisma } from '@/lib/db';
import { handler, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

// §4.1 Super Admin: platform-wide health, plus the two numbers the success
// metrics in §3.2 are actually measured against.
export const GET = handler(async () => {
  await requireSuperAdmin();

  const [users, groups, campaigns, activeCampaigns, images, pendingWall, shares] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        where: { userGroup: { not: null } },
        distinct: ['userGroup'],
        select: { userGroup: true },
      }),
      prisma.campaign.count({ where: { deletedAt: null } }),
      prisma.campaign.count({ where: { status: 'active', deletedAt: null } }),
      prisma.generatedImage.count(),
      prisma.user.count({ where: { wallOptIn: true, wallStatus: 'pending' } }),
      prisma.analyticsEvent.count({ where: { kind: 'share_tap' } }),
    ]);

  const generated = await prisma.analyticsEvent.count({ where: { kind: 'generate' } });

  return ok({
    users,
    userGroups: groups.length,
    campaigns,
    activeCampaigns,
    imagesStored: images,
    imagesGenerated: generated,
    shareTaps: shares,
    shareRate: generated ? Math.round((shares / generated) * 100) : 0,
    pendingWallEntries: pendingWall,
  });
});
