import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assetUrl } from '@/lib/storage';
import { isWikimediaUrl } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const CAPACITIES = ['organizer', 'participant', 'contributor', 'co_team'];

function publicProfile(user) {
  return {
    id: user.id,
    wikiUsername: user.wikiUsername,
    userPageUrl: user.userPageUrl,
    userGroup: user.userGroup,
    capacity: user.capacity,
    wallOptIn: user.wallOptIn,
    wallStatus: user.wallStatus,
    role: user.role,
    onboarded: Boolean(user.onboardedAt),
    logoUrl: user.logoAssetId ? assetUrl(user.logoAssetId) : null,
  };
}

export const GET = handler(async () => {
  const user = await requireUser();
  return ok(publicProfile(user), { headers: { 'Cache-Control': 'private, no-store' } });
});

// §7: the onboarding wizard and Settings → Profile both write through here.
export const PATCH = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await readJson(req);

  const data = {};
  if (body.userGroup !== undefined) {
    data.userGroup = String(body.userGroup).replace(/\s+/g, ' ').trim().slice(0, 120) || null;
  }
  if (body.userPageUrl !== undefined) {
    const value = String(body.userPageUrl).trim();
    if (value && !isWikimediaUrl(value)) {
      throw badRequest('Your user page should be an https link on a Wikimedia or Wikipedia site.');
    }
    data.userPageUrl = value || null;
  }
  if (body.capacity !== undefined) {
    if (!CAPACITIES.includes(body.capacity)) throw badRequest('Unknown capacity.');
    data.capacity = body.capacity;
  }
  if (body.wallOptIn !== undefined) {
    data.wallOptIn = Boolean(body.wallOptIn);
    // WALL-3: re-entering the queue on every opt-in change keeps moderation honest.
    data.wallStatus = data.wallOptIn ? 'pending' : 'hidden';
  }

  // WALL-3: an approved wall entry that changes what the public sees — its
  // name or its link — goes back to the review queue. Otherwise approval of
  // one name would be a blank cheque for any later edit.
  const publicChange =
    (data.userGroup !== undefined && data.userGroup !== user.userGroup) ||
    (data.userPageUrl !== undefined && data.userPageUrl !== user.userPageUrl);
  if (publicChange && user.wallOptIn && user.wallStatus === 'approved' && data.wallStatus === undefined) {
    data.wallStatus = 'pending';
  }

  if (body.completeOnboarding) data.onboardedAt = user.onboardedAt ?? new Date();

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return ok(publicProfile(updated));
});
