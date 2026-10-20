import { config, ASPECT_RATIOS } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, forbidden, handler, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate, loadCampaignFor } from '@/lib/authz';
import { assetUrl, destroyAsset } from '@/lib/storage';
import { isFrameAssetInUse } from '@/lib/templates';
import { sanitizeCanvasJson } from '@/lib/validate';

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
  const body = await readJson(req, config.limits.canvasJsonBytes + 64 * 1024);

  const data = {};
  if (body.name !== undefined) {
    data.name = String(body.name).trim().slice(0, 80) || 'Untitled template';
  }
  if (body.sortOrder !== undefined) {
    data.sortOrder = Math.max(0, Math.min(1000, Math.round(Number(body.sortOrder) || 0)));
  }

  if (body.aspectRatio !== undefined && body.aspectRatio !== template.aspectRatio) {
    if (!Object.hasOwn(ASPECT_RATIOS, body.aspectRatio)) throw badRequest('Unsupported aspect ratio.');
    // A flat frame is a fixed bitmap; it cannot change shape.
    if (!template.editable) {
      throw badRequest('This frame is a finished image, so its ratio cannot change. Upload a new one instead.');
    }
    data.aspectRatio = body.aspectRatio;
  }

  if (body.canvasJson !== undefined) {
    const incoming = sanitizeCanvasJson(body.canvasJson || {}, {
      maxBytes: config.limits.canvasJsonBytes,
    });
    if (!template.editable) {
      // §10.1 editing rule: a flat upload has no layers to write back to, but
      // overlay layers (text, artifacts, badge zone) are still allowed.
      data.canvasJson = {
        ...(template.canvasJson || {}),
        ...(incoming.fabric ? { fabric: incoming.fabric } : {}),
        overlays: incoming.overlays ?? template.canvasJson?.overlays ?? [],
        badge: incoming.badge ?? template.canvasJson?.badge,
        cutout: incoming.cutout ?? template.canvasJson?.cutout,
        credits: incoming.credits ?? template.canvasJson?.credits,
        health: incoming.health ?? template.canvasJson?.health,
      };
    } else {
      data.canvasJson = incoming;
    }
  }

  if (body.campaignId !== undefined) {
    // CAMP-4: attaching a library template to a campaign, or detaching it back.
    if (body.campaignId === null) {
      data.campaignId = null;
    } else {
      const { campaign } = await loadCampaignFor(user, String(body.campaignId));
      if (campaign.id !== template.campaignId) {
        // Moving a template into another campaign is the owner's call: a
        // co-team member must not be able to carry someone else's design off
        // into a campaign of their own.
        if (template.ownerId !== user.id && user.role !== 'super_admin') {
          throw forbidden('Only the template’s owner can move it to another campaign.');
        }
        const count = await prisma.template.count({ where: { campaignId: campaign.id } });
        if (count >= config.limits.templatesPerCampaign) {
          throw badRequest(`A campaign can hold at most ${config.limits.templatesPerCampaign} templates.`);
        }
      }
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
  const candidates = [template.frameAssetId, template.canvasJson?.baseFrameAssetId].filter(Boolean);
  await prisma.template.delete({ where: { id: template.id } });
  for (const assetId of new Set(candidates)) {
    if (!(await isFrameAssetInUse(assetId))) await destroyAsset(assetId);
  }

  return ok({ deleted: true });
});
