import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, notFound, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { ACCESS, assertCanDelete, loadCampaignFor } from '@/lib/authz';
import { enforce } from '@/lib/ratelimit';
import { normalizeWikiUsername } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const MAX_MEMBERS = 50;

export const GET = handler(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);
  const members = await prisma.campaignMember.findMany({
    where: { campaignId: campaign.id },
    include: { user: { select: { id: true, wikiUsername: true, userPageUrl: true } } },
  });
  return ok({ members });
});

// §8.1 Team: invite co-team members by wiki username. The invitee must have
// signed in at least once — we never create shadow accounts from a typed name.
export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign, access } = await loadCampaignFor(user, id);
  if (access === ACCESS.CO_TEAM) throw badRequest('Only the campaign owner can invite people.');
  // The answer reveals whether a username has signed in here; keep it a lookup,
  // not an enumeration tool.
  enforce(`invite:${user.id}`, 60);

  const { wikiUsername } = await readJson(req);
  const name = normalizeWikiUsername(wikiUsername).slice(0, 255);
  if (!name) throw badRequest('Enter a wiki username.');

  const invitee = await prisma.user.findFirst({ where: { wikiUsername: name } });
  if (!invitee) {
    throw notFound(
      `${name} has not signed in to WikiFrames yet. Ask them to log in once with their Wikimedia account, then invite them.`
    );
  }
  if (invitee.id === campaign.ownerId) throw badRequest('That person already owns this campaign.');

  const count = await prisma.campaignMember.count({ where: { campaignId: campaign.id } });
  if (count >= MAX_MEMBERS) throw badRequest(`A campaign can have at most ${MAX_MEMBERS} co-team members.`);

  const member = await prisma.campaignMember.upsert({
    where: { campaignId_userId: { campaignId: campaign.id, userId: invitee.id } },
    create: { campaignId: campaign.id, userId: invitee.id, memberRole: 'co_team' },
    update: {},
    include: { user: { select: { id: true, wikiUsername: true, userPageUrl: true } } },
  });

  return ok({ member }, { status: 201 });
});

export const DELETE = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign, access } = await loadCampaignFor(user, id);
  assertCanDelete(access);

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) throw badRequest('Which member should be removed?');

  await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id, userId } });
  return ok({ removed: true });
});
