import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assetUrl } from '@/lib/storage';

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
  return ok(publicProfile(user));
});

// §7: the onboarding wizard and Settings → Profile both write through here.
export const PATCH = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await req.json();

  const data = {};
  if (body.userGroup !== undefined) data.userGroup = String(body.userGroup).slice(0, 120);
  if (body.userPageUrl !== undefined) {
    const value = String(body.userPageUrl).trim();
    if (value && !/^https:\/\/[a-z0-9.-]*wikimedia\.org\//i.test(value) &&
        !/^https:\/\/[a-z0-9.-]*wikipedia\.org\//i.test(value)) {
      throw badRequest('Your user page should be a link on a Wikimedia or Wikipedia site.');
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
  if (body.completeOnboarding) data.onboardedAt = new Date();

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return ok(publicProfile(updated));
});
