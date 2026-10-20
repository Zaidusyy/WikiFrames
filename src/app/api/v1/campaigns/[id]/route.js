import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertCanDelete, loadCampaignFor } from '@/lib/authz';
import { effectiveStatus, parseAccessCode, purgeDateFor } from '@/lib/campaigns';
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

function parseDate(value, label) {
  const date = new Date(value);
  if (value === null || value === '' || Number.isNaN(date.getTime())) {
    throw badRequest(`Please provide a valid ${label}.`);
  }
  return date;
}

// Content edits are open to co-team members; only destructive actions are not.
export const PATCH = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);
  const body = await readJson(req);

  const data = {};
  if (body.name !== undefined) {
    data.name = String(body.name).trim().slice(0, 80);
    if (!data.name) throw badRequest('Give the campaign a name.');
  }
  if (body.description !== undefined) data.description = String(body.description).slice(0, 1000);
  if (body.location !== undefined) data.location = body.location ? String(body.location).slice(0, 200) : null;
  if (body.organizingGroup !== undefined) {
    data.organizingGroup = String(body.organizingGroup).slice(0, 120);
  }
  if (body.publicGallery !== undefined) data.publicGallery = Boolean(body.publicGallery);
  if (body.roleRequired !== undefined) data.roleRequired = Boolean(body.roleRequired);
  if (body.accessCode !== undefined) data.accessCode = parseAccessCode(body.accessCode);

  if (body.eventDate !== undefined) data.eventDate = parseDate(body.eventDate, 'event date');
  if (body.eventEndDate !== undefined) data.eventEndDate = parseDate(body.eventEndDate, 'end date');
  if (body.registrationOpenDate !== undefined) {
    data.registrationOpenDate = parseDate(body.registrationOpenDate, 'registration date');
  }

  const start = data.eventDate ?? campaign.eventDate;
  const end = data.eventEndDate ?? campaign.eventEndDate;
  if (new Date(end) < new Date(start)) {
    throw badRequest('The event end date must be on or after the event date.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.eventEndDate) {
      // RET-4: moving the end date moves the retention clock with it.
      data.purgeAt = purgeDateFor(data.eventEndDate);
      await tx.generatedImage.updateMany({
        where: { campaignId: campaign.id },
        data: { expiresAt: data.purgeAt },
      });
    }
    return tx.campaign.update({ where: { id: campaign.id }, data });
  });
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
