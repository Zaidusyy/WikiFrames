import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertCanDelete, loadCampaignFor } from '@/lib/authz';
import { effectiveStatus, purgeDateFor } from '@/lib/campaigns';
import { campaignUrl } from '@/lib/qr';
import { assetUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const CAMPAIGN_INCLUDE = {
  roles: { orderBy: { sort: 'asc' } },
  captions: { orderBy: { sort: 'asc' } },
  templates: { orderBy: { sortOrder: 'asc' } },
  members: { include: { user: { select: { id: true, wikiUsername: true } } } },
  _count: { select: { images: true } },
};

export const GET = handler(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign, access } = await loadCampaignFor(user, id, { include: CAMPAIGN_INCLUDE });

  return ok({
    campaign: {
      ...campaign,
      effectiveStatus: effectiveStatus(campaign),
      participantUrl: campaignUrl(campaign.slug, campaign.linkToken),
      templates: campaign.templates.map((t) => ({
        ...t,
        frameUrl: t.frameAssetId ? assetUrl(t.frameAssetId) : null,
      })),
      imagesGenerated: campaign._count.images,
    },
    access,
  });
});

// Content edits are open to co-team members; only destructive actions are not.
export const PATCH = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);
  const body = await req.json();

  const data = {};
  if (body.name !== undefined) data.name = String(body.name).slice(0, 80);
  if (body.description !== undefined) data.description = String(body.description).slice(0, 1000);
  if (body.location !== undefined) data.location = body.location ? String(body.location).slice(0, 200) : null;
  if (body.organizingGroup !== undefined) {
    data.organizingGroup = String(body.organizingGroup).slice(0, 120);
  }
  if (body.publicGallery !== undefined) data.publicGallery = Boolean(body.publicGallery);
  if (body.roleRequired !== undefined) data.roleRequired = Boolean(body.roleRequired);
  if (body.accessCode !== undefined) {
    const code = body.accessCode ? String(body.accessCode).replace(/\D/g, '').slice(0, 6) : '';
    // LINK-7: 4–6 digits, printed at the venue as a light second factor.
    if (code && code.length < 4) throw badRequest('An access code must be 4 to 6 digits.');
    data.accessCode = code || null;
  }

  if (body.eventDate !== undefined) data.eventDate = new Date(body.eventDate);
  if (body.eventEndDate !== undefined) data.eventEndDate = new Date(body.eventEndDate);
  if (body.registrationOpenDate !== undefined) {
    data.registrationOpenDate = new Date(body.registrationOpenDate);
  }

  const start = data.eventDate ?? campaign.eventDate;
  const end = data.eventEndDate ?? campaign.eventEndDate;
  if (Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) {
    throw badRequest('Please provide valid event dates.');
  }
  if (new Date(end) < new Date(start)) {
    throw badRequest('The event end date must be on or after the event date.');
  }
  if (data.eventEndDate) {
    // RET-4: moving the end date moves the retention clock with it.
    data.purgeAt = purgeDateFor(data.eventEndDate);
    await prisma.generatedImage.updateMany({
      where: { campaignId: campaign.id },
      data: { expiresAt: data.purgeAt },
    });
  }

  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data });
  return ok({ campaign: updated });
});

// DASH-3: soft delete with a 7-day recovery window; the cron job finishes the job.
export const DELETE = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign, access } = await loadCampaignFor(user, id);
  assertCanDelete(access);

  const confirm = new URL(req.url).searchParams.get('confirm');
  if (confirm !== campaign.name) {
    throw badRequest('Type the campaign name exactly to confirm deletion.');
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { deletedAt: new Date(), status: 'cancelled' },
  });

  return ok({ deleted: true, recoverableUntilDays: 7 });
});
