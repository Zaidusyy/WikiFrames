import { config } from './config';
import { prisma } from './db';
import { badRequest } from './errors';
import { randomToken, slugify } from './tokens';

// Campaign lifecycle rules (PDR §9.2) live here so the dashboard, the
// participant link resolver and the cron job all agree on what a campaign "is".

export const LIFECYCLE = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CANCELLED: 'cancelled',
  ENDED: 'ended',
};

/** LINK-7: a venue access code is 4–6 digits, or nothing at all. */
export function parseAccessCode(value) {
  if (value === undefined || value === null || value === '') return null;
  const code = String(value).trim();
  if (!/^\d{4,6}$/.test(code)) throw badRequest('An access code must be 4 to 6 digits.');
  return code;
}

export function purgeDateFor(eventEndDate) {
  const end = new Date(eventEndDate);
  return new Date(end.getTime() + config.retention.days * 24 * 60 * 60 * 1000);
}

/**
 * CAMP-2 / LINK-3: status is stored, but time moves on its own. A campaign whose
 * end date has passed reads as `ended` even before the nightly job rewrites the
 * row, and an active campaign whose registration window has not opened reads as
 * `scheduled`.
 */
export function effectiveStatus(campaign, now = new Date()) {
  if (campaign.status === LIFECYCLE.CANCELLED) return LIFECYCLE.CANCELLED;
  if (campaign.status === LIFECYCLE.DRAFT) return LIFECYCLE.DRAFT;
  if (campaign.status === LIFECYCLE.INACTIVE) return LIFECYCLE.INACTIVE;
  if (new Date(campaign.eventEndDate) < now) return LIFECYCLE.ENDED;
  if (campaign.status === LIFECYCLE.ACTIVE && new Date(campaign.registrationOpenDate) > now) {
    return 'scheduled';
  }
  return campaign.status;
}

/** Whether the participant flow may generate right now. */
export function acceptsGenerations(campaign, now = new Date()) {
  return effectiveStatus(campaign, now) === LIFECYCLE.ACTIVE;
}

export const PARTICIPANT_STATE_COPY = {
  draft: { title: 'Not available yet', body: 'This campaign has not been launched.' },
  scheduled: {
    title: 'Almost there!',
    body: 'This campaign opens soon. Come back when registration opens.',
  },
  inactive: {
    title: 'Campaign paused',
    body: 'The organizers have paused this campaign for a moment. Please try again later.',
  },
  cancelled: {
    title: 'Campaign cancelled',
    body: 'This campaign is no longer running. Thank you for your interest!',
  },
  ended: {
    title: 'That is a wrap — thank you!',
    body: 'This event has ended. Have a look at what everyone created.',
  },
};

/** Unique slug, retrying with a short suffix on collision. */
export async function uniqueSlug(name) {
  const base = slugify(name);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${randomToken(3).toLowerCase()}`;
    const clash = await prisma.campaign.findUnique({ where: { slug: candidate } });
    if (!clash) return candidate;
  }
  return `${base}-${randomToken(6).toLowerCase()}`;
}

// BADGE-3 / CAP-4 — re-exported from a dependency-free module so the browser can
// build the identical string without pulling Prisma in.
export { composeCaption } from './caption';

/** DASH-5: everything except generated images and the link token. */
export async function cloneCampaign(campaign, ownerId) {
  const name = `${campaign.name} (Copy)`;
  const slug = await uniqueSlug(name);

  return prisma.$transaction(async (tx) => {
    const copy = await tx.campaign.create({
      data: {
        ownerId,
        name,
        slug,
        description: campaign.description,
        eventDate: campaign.eventDate,
        eventEndDate: campaign.eventEndDate,
        registrationOpenDate: campaign.registrationOpenDate,
        location: campaign.location,
        organizingGroup: campaign.organizingGroup,
        status: LIFECYCLE.DRAFT,
        publicGallery: campaign.publicGallery,
        roleRequired: campaign.roleRequired,
        accessCode: campaign.accessCode,
        // A fresh secret: the clone must not inherit a link that may have leaked.
        linkToken: randomToken(16),
        purgeAt: purgeDateFor(campaign.eventEndDate),
      },
    });

    const [roles, captions, templates] = await Promise.all([
      tx.campaignRole.findMany({ where: { campaignId: campaign.id } }),
      tx.caption.findMany({ where: { campaignId: campaign.id } }),
      tx.template.findMany({ where: { campaignId: campaign.id } }),
    ]);

    if (roles.length) {
      await tx.campaignRole.createMany({
        data: roles.map((r) => ({
          campaignId: copy.id,
          label: r.label,
          icon: r.icon,
          sort: r.sort,
        })),
      });
    }
    if (captions.length) {
      await tx.caption.createMany({
        data: captions.map((c) => ({
          campaignId: copy.id,
          text: c.text,
          hashtags: c.hashtags,
          isMandatory: c.isMandatory,
          sort: c.sort,
        })),
      });
    }
    for (const t of templates) {
      await tx.template.create({
        data: {
          ownerId,
          campaignId: copy.id,
          name: t.name,
          source: t.source,
          aspectRatio: t.aspectRatio,
          canvasJson: t.canvasJson ?? undefined,
          // Frame bytes are immutable and shared by reference — cloning a
          // template must not duplicate megabytes in object storage.
          frameAssetId: t.frameAssetId,
          commonsUrl: t.commonsUrl,
          commonsAttribution: t.commonsAttribution ?? undefined,
          editable: t.editable,
          sortOrder: t.sortOrder,
        },
      });
    }

    return copy;
  });
}

export function daysUntil(date) {
  if (!date) return null;
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}
