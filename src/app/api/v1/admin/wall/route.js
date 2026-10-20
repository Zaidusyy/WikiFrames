import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, notFound, ok, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/session';
import { assetUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'hidden'];

// WALL-3: nothing reaches the public landing page without a super admin saying
// so — the queue is the spam and image-rights safeguard.
export const GET = handler(async (req) => {
  await requireSuperAdmin();
  const requested = new URL(req.url).searchParams.get('status') || 'pending';
  const status = requested === 'all' || STATUSES.includes(requested) ? requested : 'pending';

  const users = await prisma.user.findMany({
    where: { wallOptIn: true, ...(status === 'all' ? {} : { wallStatus: status }) },
    orderBy: { updatedAt: 'desc' },
    take: 200,
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
  const { userId, wallStatus } = await readJson(req);

  if (!userId || typeof userId !== 'string') throw badRequest('Which entry?');
  if (!STATUSES.includes(wallStatus)) {
    throw badRequest('Status must be pending, approved or hidden.');
  }

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw notFound('That entry no longer exists.');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { wallStatus },
    select: { id: true, wikiUsername: true, wallStatus: true },
  });

  return ok({ entry: updated });
});
