import { config } from './config';
import { prisma } from './db';
import { forbidden, notFound, tooManyRequests } from './errors';
import { linkTokenCandidates, safeEqual } from './tokens';
import { assetUrl } from './storage';
import { effectiveStatus, PARTICIPANT_STATE_COPY } from './campaigns';
import { badgeTextFor } from './presets';
import { normalizeBadge, normalizeCutout } from './geometry';
import { consume, peek } from './ratelimit';
import { sanitizeCredits } from './validate';

// AUTH-4: the link is the only credential. Everything the participant page
// needs is assembled here, once, from that token.

export async function resolveCampaignByLink(segment) {
  const candidates = linkTokenCandidates(segment);
  if (!candidates.length) throw notFound('This campaign link is not valid.');

  const campaign = await prisma.campaign.findFirst({
    where: { linkToken: { in: candidates } },
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

const CODE_WINDOW_MS = 15 * 60 * 1000;

/**
 * LINK-7: optional 4–6 digit code printed at the venue.
 *
 * Ten thousand possible codes is nothing to a script, so wrong guesses are
 * counted per address *and* per campaign. Once either budget is spent, even a
 * correct code is refused until the window resets — otherwise the limit would
 * only slow an attacker down, not stop them.
 */
export function assertAccessCode(campaign, provided, ipKey) {
  if (!campaign.accessCode) return;

  const ipBucket = `code-fail:${campaign.id}:${ipKey}`;
  const campaignBucket = `code-fail:${campaign.id}`;
  const ipState = peek(ipBucket, config.limits.accessCodeFailuresPerIp);
  const campaignState = peek(campaignBucket, config.limits.accessCodeFailuresPerCampaign);
  if (!ipState.allowed || !campaignState.allowed) {
    const wait = Math.max(ipState.retryAfterSeconds, campaignState.retryAfterSeconds);
    throw tooManyRequests(
      `Too many wrong codes. Please wait ${Math.ceil(wait / 60)} minute(s) and check the code at the venue.`,
      wait
    );
  }

  const code = String(provided ?? '').trim();
  if (!code || !safeEqual(code, campaign.accessCode)) {
    consume(ipBucket, config.limits.accessCodeFailuresPerIp, CODE_WINDOW_MS);
    consume(campaignBucket, config.limits.accessCodeFailuresPerCampaign, CODE_WINDOW_MS);
    throw forbidden('That access code is not right. Check the code shown at the venue.');
  }
}

/** Credits for every openly licensed work inside a template's artwork. */
export function templateCredits(template) {
  const credits = sanitizeCredits(template.canvasJson?.credits);
  if (template.commonsAttribution) {
    const a = template.commonsAttribution;
    credits.unshift({
      title: a.fileName || 'Frame artwork',
      author: a.author || 'Unknown',
      license: a.license || 'See file page',
      sourceUrl: a.filePage || template.commonsUrl || null,
    });
  }
  return credits;
}

/**
 * Frame URLs for the templates. A campaign with a venue access code only hands
 * these out once the code has been verified (POST /c/:token/unlock): images
 * are composed on the participant's device, so withholding the frame — whose
 * asset id cannot be guessed — is what actually makes the code a gate.
 */
export function frameUrls(campaign) {
  return campaign.templates.map((t) => ({
    id: t.id,
    frameUrl: t.frameAssetId ? assetUrl(t.frameAssetId) : null,
  }));
}

/** The payload behind `GET /c/:token` — everything the flow needs, nothing more. */
export function participantPayload(campaign) {
  const state = effectiveStatus(campaign);
  const mandatory = campaign.captions.find((c) => c.isMandatory) || campaign.captions[0] || null;
  const locked = Boolean(campaign.accessCode);

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
      frameUrl: !locked && t.frameAssetId ? assetUrl(t.frameAssetId) : null,
      hasFrame: Boolean(t.frameAssetId),
      cutout: normalizeCutout(t.canvasJson?.cutout),
      badge: normalizeBadge(t.canvasJson?.badge),
      credits: templateCredits(t),
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
    retentionDays: config.retention.days,
    // RET-1/RET-6: the promise, verbatim, shown before anything is generated.
    consent: {
      label: `Allow this campaign to keep my generated image for its gallery (max ${config.retention.days} days after the event).`,
      policy: `How we handle your image: If you allow it, your generated image is stored so the event organizers can showcase it in the campaign gallery. All stored images are kept for a maximum of ${config.retention.days} days after the event closes, then permanently deleted from our servers. If you don’t allow storage, your image is created right here on your device — your photo is not uploaded and nothing is saved on our side.`,
    },
  };
}

const EVENT_KINDS = new Set(['link_open', 'generate', 'download', 'share_tap', 'qr_scan']);
const PLATFORMS = new Set([
  'native',
  'fallback',
  'whatsapp',
  'x',
  'telegram',
  'linkedin',
  'facebook',
  'mastodon',
  'bluesky',
  'copy',
]);

/** §17.2: aggregate counters, never a person. */
export async function recordEvent(campaignId, kind, { platform, meta } = {}) {
  if (!EVENT_KINDS.has(kind)) return;
  const data = { campaignId, kind };
  if (kind === 'share_tap') data.platform = PLATFORMS.has(platform) ? platform : 'other';
  if (meta && typeof meta === 'object') data.meta = meta;
  await prisma.analyticsEvent.create({ data }).catch(() => {
    // Analytics must never break the participant flow.
  });
}
