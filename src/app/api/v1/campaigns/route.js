import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readJson, requireFields } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { randomToken } from '@/lib/tokens';
import { effectiveStatus, parseAccessCode, purgeDateFor, uniqueSlug } from '@/lib/campaigns';
import { EVENT_PRESETS, SEEDED_ROLES } from '@/lib/presets';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['draft', 'active', 'inactive', 'cancelled', 'ended']);

/** Campaigns the user owns plus the ones they were invited to co-run. */
function visibleTo(user) {
  return {
    deletedAt: null,
    OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
  };
}

// DASH-1 / DASH-2: list with status filter and the images-generated count that
// the Active/Inactive toggle is really asking about.
export const GET = handler(async (req) => {
  const user = await requireUser();
  const status = new URL(req.url).searchParams.get('status');

  const campaigns = await prisma.campaign.findMany({
    where: {
      ...visibleTo(user),
      ...(status && STATUSES.has(status) ? { status } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { images: true, templates: true, roles: true } },
      owner: { select: { wikiUsername: true } },
    },
  });

  const now = new Date();
  const rows = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    status: c.status,
    effectiveStatus: effectiveStatus(c, now),
    eventDate: c.eventDate,
    eventEndDate: c.eventEndDate,
    registrationOpenDate: c.registrationOpenDate,
    publicGallery: c.publicGallery,
    purgeAt: c.purgeAt,
    owner: c.owner.wikiUsername,
    isOwner: c.ownerId === user.id,
    imagesGenerated: c._count.images,
    templateCount: c._count.templates,
    roleCount: c._count.roles,
  }));

  const counts = rows.reduce((acc, row) => {
    acc[row.effectiveStatus] = (acc[row.effectiveStatus] || 0) + 1;
    return acc;
  }, {});

  return ok({
    campaigns: rows,
    counts,
    totals: {
      campaigns: rows.length,
      active: rows.filter((r) => r.effectiveStatus === 'active').length,
      images: rows.reduce((sum, r) => sum + r.imagesGenerated, 0),
    },
  });
});

// §9.1 step 1. Creation always produces a Draft; launching is a separate,
// deliberate action (CAMP lifecycle).
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await readJson(req);

  requireFields(body, ['name', 'eventDate', 'eventEndDate']);

  const eventDate = new Date(body.eventDate);
  const eventEndDate = new Date(body.eventEndDate);
  const registrationOpenDate = body.registrationOpenDate
    ? new Date(body.registrationOpenDate)
    : new Date();

  if (
    Number.isNaN(eventDate.getTime()) ||
    Number.isNaN(eventEndDate.getTime()) ||
    Number.isNaN(registrationOpenDate.getTime())
  ) {
    throw badRequest('Please provide valid event dates.');
  }
  if (eventEndDate < eventDate) {
    throw badRequest('The event end date must be on or after the event date.');
  }

  const name = String(body.name).trim().slice(0, 80);
  if (!name) throw badRequest('Give the campaign a name.');
  const slug = await uniqueSlug(name);

  const campaign = await prisma.campaign.create({
    data: {
      ownerId: user.id,
      name,
      slug,
      description: String(body.description || '').slice(0, 1000),
      eventDate,
      eventEndDate,
      registrationOpenDate,
      location: body.location ? String(body.location).slice(0, 200) : null,
      organizingGroup: body.organizingGroup
        ? String(body.organizingGroup).slice(0, 120)
        : user.userGroup,
      publicGallery: Boolean(body.publicGallery),
      roleRequired: Boolean(body.roleRequired),
      accessCode: parseAccessCode(body.accessCode),
      linkToken: randomToken(16),
      purgeAt: purgeDateFor(eventEndDate),
    },
  });

  // CAMP-5: applying an event preset pre-fills captions and roles so the
  // organizer starts from something real and edits down.
  const preset = EVENT_PRESETS.find((p) => p.key === body.presetKey);
  if (preset) {
    await prisma.caption.createMany({
      data: preset.defaultCaptions.map((c, i) => ({
        campaignId: campaign.id,
        text: c.text,
        hashtags: c.hashtags,
        isMandatory: c.isMandatory,
        sort: i,
      })),
    });
    await prisma.campaignRole.createMany({
      data: preset.defaultRoles.map((label, i) => ({
        campaignId: campaign.id,
        label,
        icon: SEEDED_ROLES.find((r) => r.label === label)?.icon ?? null,
        sort: i,
      })),
    });
  }

  return ok({ campaign }, { status: 201 });
});
