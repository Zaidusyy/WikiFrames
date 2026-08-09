import { prisma } from './db';
import { notFound, forbidden } from './api';
import { parseLinkSegment, safeEqual } from './tokens';
import { assetUrl } from './storage';
import { effectiveStatus, PARTICIPANT_STATE_COPY } from './campaigns';
import { badgeTextFor } from './presets';
import { DEFAULT_BADGE, DEFAULT_CUTOUT } from './composite';

// AUTH-4: the link is the only credential. Everything the participant page
// needs is assembled here, once, from that token.

export async function resolveCampaignByLink(segment) {
  const { token } = parseLinkSegment(segment);
  if (!token || token.length < 16) throw notFound('This campaign link is not valid.');

  const campaign = await prisma.campaign.findUnique({
    where: { linkToken: token },
    include: {
      templates: { orderBy: { sortOrder: 'asc' } },
      roles: { orderBy: { sort: 'asc' } },
      captions: { orderBy: { sort: 'asc' } },
      owner: { select: { wikiUsername: true, userGroup: true, userPageUrl: true } },
    },
  });

  // LINK-3: a draft or soft-deleted campaign is indistinguishable from a wrong
  // token — we do not confirm that a secret link exists but is not ready.
  if (!campaign || campaign.deletedAt || campaign.status === 'draft') {
    throw notFound('This campaign link is not valid.');
  }
  return campaign;
}

/** LINK-7: optional 4–6 digit code printed at the venue. */
export function assertAccessCode(campaign, provided) {
  if (!campaign.accessCode) return;
  if (!provided || !safeEqual(String(provided).trim(), campaign.accessCode)) {
    throw forbidden('That access code is not right. Check the code shown at the venue.');
  }
}

/** The payload behind `GET /c/:token` — everything the flow needs, nothing more. */
export function participantPayload(campaign) {
  const state = effectiveStatus(campaign);
  const mandatory = campaign.captions.find((c) => c.isMandatory) || campaign.captions[0] || null;

  return {
    state,
    stateCopy: PARTICIPANT_STATE_COPY[state] ?? null,
    campaign: {
      name: campaign.name,
      description: campaign.description,
      eventDate: campaign.eventDate,
      eventEndDate: campaign.eventEndDate,
      location: campaign.location,
      organizingGroup: campaign.organizingGroup || campaign.owner.userGroup,
      organizer: campaign.owner.wikiUsername,
      publicGallery: campaign.publicGallery,
      slug: campaign.slug,
      roleRequired: campaign.roleRequired,
      requiresAccessCode: Boolean(campaign.accessCode),
    },
    templates: campaign.templates.map((t) => ({
      id: t.id,
      name: t.name,
      aspectRatio: t.aspectRatio,
      frameUrl: t.frameAssetId ? assetUrl(t.frameAssetId) : null,
      cutout: t.canvasJson?.cutout ?? DEFAULT_CUTOUT,
      badge: t.canvasJson?.badge ?? DEFAULT_BADGE,
      attribution: t.commonsAttribution ?? null,
    })),
    roles: campaign.roles.map((r) => ({
      id: r.id,
      label: r.label,
      icon: r.icon,
      badgeText: badgeTextFor(r),
    })),
    captions: campaign.captions.map((c) => ({
      id: c.id,
      text: c.text,
      hashtags: c.hashtags,
      isMandatory: c.isMandatory,
    })),
    mandatoryCaptionId: mandatory?.id ?? null,
    // RET-1/RET-6: the promise, verbatim, shown before anything is generated.
    consent: {
      label:
        'Allow this campaign to keep my generated image for its gallery (max 30 days after the event).',
      policy:
        'How we handle your image: If you allow it, your generated image is stored so the event organizers can showcase it in the campaign gallery. All stored images are kept for a maximum of 30 days after the event closes, then permanently deleted from our servers. If you don’t allow storage, your image is generated one-time for you to download and share — and nothing is saved on our side; it vanishes after your session.',
    },
  };
}

/** §17.2: aggregate counters, never a person. */
export async function recordEvent(campaignId, kind, meta) {
  const allowed = ['link_open', 'generate', 'download', 'share_tap', 'qr_scan'];
  if (!allowed.includes(kind)) return;
  await prisma.analyticsEvent
    .create({ data: { campaignId, kind, meta: meta ?? undefined } })
    .catch(() => {
      // Analytics must never break the participant flow.
    });
}
