import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, notFound, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { ACCESS, assertCanDelete, loadCampaignFor } from '@/lib/authz';

export const dynamic = 'force-dynamic';

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

  const { wikiUsername } = await req.json();
  if (!wikiUsername) throw badRequest('Enter a wiki username.');

  const invitee = await prisma.user.findFirst({
    where: { wikiUsername: String(wikiUsername).trim() },
  });
  if (!invitee) {
    throw notFound(
      `${wikiUsername} has not signed in to WikiFrames yet. Ask them to log in once with their Wikimedia account, then invite them.`
    );
  }
  if (invitee.id === campaign.ownerId) throw badRequest('That person already owns this campaign.');

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
