import { config, ASPECT_RATIOS, ratioDims } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readForm, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { enforce } from '@/lib/ratelimit';
import { assetUrl, storeAsset } from '@/lib/storage';
import { detectCutout, normalizeImageUpload, readUploadFile } from '@/lib/uploads';
import { fetchCommonsFile } from '@/lib/commons';
import { sanitizeCanvasJson } from '@/lib/validate';
import { DEFAULT_TEMPLATES } from '@/lib/presets';

export const dynamic = 'force-dynamic';

function decorate(t) {
  return { ...t, frameUrl: t.frameAssetId ? assetUrl(t.frameAssetId) : null };
}

// CAMP-4: templates are library assets, not locked to one campaign. The library
// is "mine, plus the platform defaults".
export const GET = handler(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const campaignId = url.searchParams.get('campaignId');

  if (campaignId) {
    const { campaign } = await loadCampaignFor(user, campaignId);
    const templates = await prisma.template.findMany({
      where: { campaignId: campaign.id },
      orderBy: { sortOrder: 'asc' },
    });
    return ok({ templates: templates.map(decorate) });
  }

  const templates = await prisma.template.findMany({
    where: { OR: [{ ownerId: user.id }, { source: 'platform_default' }] },
    orderBy: [{ source: 'asc' }, { updatedAt: 'desc' }],
  });

  return ok({
    templates: templates.map(decorate),
    starters: DEFAULT_TEMPLATES,
    aspectRatios: ASPECT_RATIOS,
  });
});

/**
 * §10.1 — the four ways a template comes into being (T1–T4).
 *
 * JSON body     → canvas template (or a Commons-linked frame).
 * multipart     → a finished frame image uploaded from an external tool.
 */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  enforce(`template-create:${user.id}`, 120);
  const contentType = req.headers.get('content-type') || '';

  // The request body can only be consumed once — read it once, then view the
  // text fields as a plain object while keeping the FormData for the file part.
  const form = contentType.includes('multipart/form-data')
    ? await readForm(req, config.limits.frameUploadBytes + 64 * 1024)
    : null;
  const body = form
    ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'))
    : await readJson(req, config.limits.canvasJsonBytes);

  const aspectRatio = String(body.aspectRatio || '1:1');
  if (!Object.hasOwn(ASPECT_RATIOS, aspectRatio)) throw badRequest('Unsupported aspect ratio.');
  const dims = ratioDims(aspectRatio);

  let campaignId = null;
  if (body.campaignId) {
    const { campaign } = await loadCampaignFor(user, String(body.campaignId));
    const count = await prisma.template.count({ where: { campaignId: campaign.id } });
    // CAMP-3: a soft cap — more than ten choices paralyses participants.
    if (count >= config.limits.templatesPerCampaign) {
      throw badRequest(
        `A campaign can hold at most ${config.limits.templatesPerCampaign} templates.`
      );
    }
    campaignId = campaign.id;
  }

  let canvasJson = sanitizeCanvasJson(parseCanvasJson(body.canvasJson), {
    maxBytes: config.limits.canvasJsonBytes,
  });
  let frameAssetId = null;
  let commonsUrl = null;
  let commonsAttribution = null;
  let source = 'canvas';
  let editable = true;

  if (body.commonsUrl) {
    // T4 via Commons (UP-2).
    // Commons scales by width; ask for exactly the canvas width.
    const file = await fetchCommonsFile(String(body.commonsUrl), { renderWidth: dims.w });
    const normalized = await normalizeImageUpload(file.buffer, {
      maxBytes: config.limits.commonsDownloadBytes,
      expectRatio: aspectRatio,
      targetSize: dims,
    });
    const asset = await storeAsset({
      kind: 'frame',
      mime: normalized.mime,
      buffer: normalized.buffer,
      width: normalized.width,
      height: normalized.height,
    });
    frameAssetId = asset.id;
    commonsUrl = file.url;
    commonsAttribution = file.attribution;
    source = 'commons';
    // The canvas cannot un-flatten a PNG — §10.1 editing rule.
    editable = false;
    canvasJson = await withDetectedCutout(canvasJson, normalized.buffer, dims);
  } else if (form) {
    // T4 via direct upload.
    const buffer = await readUploadFile(form, 'frame', config.limits.frameUploadBytes);
    const normalized = await normalizeImageUpload(buffer, {
      maxBytes: config.limits.frameUploadBytes,
      allow: ['image/png', 'image/svg+xml'],
      requireTransparency: true,
      expectRatio: aspectRatio,
      targetSize: dims,
    });
    const asset = await storeAsset({
      kind: 'frame',
      mime: normalized.mime,
      buffer: normalized.buffer,
      width: normalized.width,
      height: normalized.height,
    });
    frameAssetId = asset.id;
    source = 'upload';
    editable = false;
    canvasJson = await withDetectedCutout(canvasJson, normalized.buffer, dims);
  }

  const template = await prisma.template.create({
    data: {
      ownerId: user.id,
      campaignId,
      name: String(body.name || 'Untitled template').trim().slice(0, 80) || 'Untitled template',
      source,
      aspectRatio,
      canvasJson: canvasJson ?? undefined,
      frameAssetId,
      commonsUrl,
      commonsAttribution: commonsAttribution ?? undefined,
      editable,
      sortOrder: Math.max(0, Math.min(1000, Math.round(Number(body.sortOrder) || 0))),
    },
  });

  return ok({ template: decorate(template) }, { status: 201 });
});

/** A finished frame tells us where its hole is; believe it over the default. */
async function withDetectedCutout(canvasJson, frameBuffer, dims) {
  if (canvasJson?.cutout) return canvasJson;
  const cutout = await detectCutout(frameBuffer, dims.w, dims.h).catch(() => null);
  return cutout ? { ...(canvasJson || {}), cutout } : canvasJson;
}

function parseCanvasJson(value) {
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw badRequest('The canvas data could not be read.');
  }
}
