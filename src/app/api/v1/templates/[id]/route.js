import { ASPECT_RATIOS } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate, loadCampaignFor } from '@/lib/authz';
import { assetUrl, destroyAsset } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function decorate(t) {
  return { ...t, frameUrl: t.frameAssetId ? assetUrl(t.frameAssetId) : null };
}

export const GET = handler(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const template = await assertOwnsTemplate(user, id);
  return ok({ template: decorate(template), aspectRatios: ASPECT_RATIOS });
});

// ED-10/ED-13: the canvas autosaves through here. Layer JSON is stored whole and
// never flattened, so editing can resume at any time.
export const PATCH = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const template = await assertOwnsTemplate(user, id);
  const body = await req.json();

  const data = {};
  if (body.name !== undefined) data.name = String(body.name).slice(0, 80);
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;

  if (body.aspectRatio !== undefined) {
    if (!ASPECT_RATIOS[body.aspectRatio]) throw badRequest('Unsupported aspect ratio.');
    data.aspectRatio = body.aspectRatio;
  }

  if (body.canvasJson !== undefined) {
    if (!template.editable) {
      // §10.1 editing rule: a flat upload has no layers to write back to, but
      // overlay layers (text, artifacts, badge zone) are still allowed.
      const incoming = body.canvasJson || {};
      data.canvasJson = {
        ...(template.canvasJson || {}),
        overlays: incoming.overlays ?? [],
        badge: incoming.badge ?? template.canvasJson?.badge,
        cutout: incoming.cutout ?? template.canvasJson?.cutout,
      };
    } else {
      data.canvasJson = body.canvasJson;
    }
  }

  if (body.campaignId !== undefined) {
    // CAMP-4: attaching a library template to a campaign, or detaching it back.
    if (body.campaignId === null) {
      data.campaignId = null;
    } else {
      const { campaign } = await loadCampaignFor(user, String(body.campaignId));
      data.campaignId = campaign.id;
    }
  }

  const updated = await prisma.template.update({ where: { id: template.id }, data });
  return ok({ template: decorate(updated) });
});

export const DELETE = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const template = await assertOwnsTemplate(user, id);

  const used = await prisma.generatedImage.count({ where: { templateId: template.id } });
  if (used > 0) {
    throw badRequest(
      `This template was used for ${used} participant image(s). Remove it from the campaign instead — deleting it would break their gallery entries.`
    );
  }

  // Shared frame bytes: only reclaim them if nothing else points at the asset.
  const frameAssetId = template.frameAssetId;
  await prisma.template.delete({ where: { id: template.id } });
  if (frameAssetId) {
    const stillUsed = await prisma.template.count({ where: { frameAssetId } });
    if (!stillUsed) await destroyAsset(frameAssetId);
  }

  return ok({ deleted: true });
});
