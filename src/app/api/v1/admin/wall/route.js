import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/session';
import { assetUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// WALL-3: nothing reaches the public landing page without a super admin saying
// so — the queue is the spam and image-rights safeguard.
export const GET = handler(async (req) => {
  await requireSuperAdmin();
  const status = new URL(req.url).searchParams.get('status') || 'pending';

  const users = await prisma.user.findMany({
    where: { wallOptIn: true, ...(status === 'all' ? {} : { wallStatus: status }) },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      wikiUsername: true,
      userGroup: true,
      userPageUrl: true,
      logoAssetId: true,
      wallStatus: true,
      createdAt: true,
    },
  });

  return ok({
    entries: users.map((u) => ({
      ...u,
      logoUrl: u.logoAssetId ? assetUrl(u.logoAssetId) : null,
    })),
  });
});

export const PATCH = handler(async (req) => {
  assertSameOrigin(req);
  await requireSuperAdmin();
  const { userId, wallStatus } = await req.json();

  if (!userId) throw badRequest('Which entry?');
  if (!['pending', 'approved', 'hidden'].includes(wallStatus)) {
    throw badRequest('Status must be pending, approved or hidden.');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { wallStatus },
    select: { id: true, wikiUsername: true, wallStatus: true },
  });

  return ok({ entry: updated });
});
