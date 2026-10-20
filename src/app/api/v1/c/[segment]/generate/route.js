import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import {
  badRequest,
  clientIp,
  forbidden,
  handler,
  notFound,
  ok,
  rateKeyForIp,
  readForm,
} from '@/lib/api';
import { enforce } from '@/lib/ratelimit';
import { readUploadFile } from '@/lib/uploads';
import { composeImage } from '@/lib/composite';
import { getObject, assetUrl, storeAsset } from '@/lib/storage';
import { randomToken } from '@/lib/tokens';
import { acceptsGenerations, composeCaption, purgeDateFor } from '@/lib/campaigns';
import { badgeTextFor } from '@/lib/presets';
import { assertAccessCode, recordEvent, resolveCampaignByLink } from '@/lib/participant';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// How long the participant's own link to their stored image keeps working.
const RESULT_LINK_SECONDS = 24 * 60 * 60;

/**
 * §14.1 step 7 — the server path that turns a photo into a shareable image.
 *
 * Participants who do NOT allow storage never reach this endpoint at all: the
 * participant page composes their image on their own device and their photo
 * is never uploaded. This route exists for people who chose to share their
 * image with the campaign gallery — the server has to render it so the
 * gallery only ever holds genuine, framed images — and, only if a participant
 * explicitly asks for it, for devices that cannot render locally.
 *
 * The consent flag is still the branch that matters: `false` means the bytes
 * are composed in memory, handed back inline and never written anywhere
 * (RET-2). There is deliberately no "store it just in case" path.
 */
export const POST = handler(async (req, { params }) => {
  const { segment } = await params;
  const campaign = await resolveCampaignByLink(segment);

  if (!acceptsGenerations(campaign)) {
    throw forbidden('This campaign is not accepting new images right now.');
  }

  // LINK-5: the flow is open by design, so the throttle is what stands between
  // a public link and someone scripting it.
  const ipKey = rateKeyForIp(clientIp(req));
  enforce(`gen:${campaign.id}:${ipKey}`, config.limits.generatePerHourPerIp);

  const form = await readForm(req, config.limits.photoUploadBytes + 64 * 1024);
  assertAccessCode(campaign, form.get('accessCode'), ipKey);

  const templateId = String(form.get('templateId') || '');
  const template = campaign.templates.find((t) => t.id === templateId);
  if (!template) throw notFound('Pick one of this campaign’s templates.');

  const roleId = form.get('roleId') ? String(form.get('roleId')) : null;
  const role = roleId ? campaign.roles.find((r) => r.id === roleId) : null;
  if (roleId && !role) throw badRequest('That role is not part of this campaign.');
  // BADGE-4
  if (campaign.roleRequired && !role) throw badRequest('Please choose a role first.');

  const captionId = form.get('captionId') ? String(form.get('captionId')) : null;
  const caption =
    campaign.captions.find((c) => c.id === captionId) ||
    campaign.captions.find((c) => c.isMandatory) ||
    campaign.captions[0] ||
    null;

  const consent = String(form.get('consent') || 'false') === 'true';
  const placement = parseJson(form.get('placement'));

  const photo = await readUploadFile(form, 'photo', config.limits.photoUploadBytes);

  const badgeText = role ? badgeTextFor(role) : '';
  const rendered = await composeImage({
    photoBuffer: photo,
    frameKey: template.frameAssetId,
    loadFrameBuffer: template.frameAssetId ? () => loadFrame(template.frameAssetId) : null,
    aspectRatio: template.aspectRatio,
    cutout: template.canvasJson?.cutout,
    badge: badgeText ? { text: badgeText, style: template.canvasJson?.badge } : null,
    placement,
    format: 'jpeg',
  });

  // Fires for every render, stored or not — it is the denominator of the
  // consent rate in §17.2.
  await recordEvent(campaign.id, 'generate', {
    meta: { template: template.id, role: role?.id ?? null, consent, mode: 'server' },
  });

  const shareText = composeCaption({
    badgeText,
    caption: caption?.text,
    hashtags: caption?.hashtags,
  });

  if (!consent) {
    // RET-2: nothing is written. The bytes go straight back to the participant.
    return ok({
      stored: false,
      shareText,
      image: {
        url: `data:${rendered.mime};base64,${rendered.buffer.toString('base64')}`,
        mime: rendered.mime,
        width: rendered.width,
        height: rendered.height,
      },
      retentionNotice:
        'Nothing was saved on our side — this image exists only on your device now.',
    });
  }

  // RET-3: stored with campaign/template/role/timestamp and nothing else. No
  // name, no contact details, no IP (SEC-5).
  const asset = await storeAsset({
    kind: 'generated',
    mime: rendered.mime,
    buffer: rendered.buffer,
    width: rendered.width,
    height: rendered.height,
  });

  const expiresAt = campaign.purgeAt ?? purgeDateFor(campaign.eventEndDate);
  const deletionToken = randomToken(24);

  const image = await prisma.generatedImage.create({
    data: {
      campaignId: campaign.id,
      templateId: template.id,
      roleId: role?.id ?? null,
      assetId: asset.id,
      consented: true,
      deletionToken,
      expiresAt,
    },
  });

  return ok({
    stored: true,
    shareText,
    image: {
      id: image.id,
      url: assetUrl(asset.id, { signedForSeconds: RESULT_LINK_SECONDS }),
      mime: rendered.mime,
      width: rendered.width,
      height: rendered.height,
    },
    expiresAt,
    // RET-7: shown once, on the result screen.
    deletionUrl: `${config.baseUrl}/i/${deletionToken}`,
    retentionNotice: `Kept for the campaign gallery until ${expiresAt.toISOString().slice(0, 10)}, then permanently deleted.`,
  });
});

async function loadFrame(frameAssetId) {
  const asset = await prisma.asset.findUnique({ where: { id: frameAssetId } });
  if (!asset) return null;
  return getObject(asset.storageKey).catch(() => null);
}

function parseJson(value) {
  if (!value || typeof value !== 'string' || value.length > 2000) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
