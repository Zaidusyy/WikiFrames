import { config, ratioDims } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate } from '@/lib/authz';
import { enforce } from '@/lib/ratelimit';
import { assetUrl, destroyAsset, storeAsset } from '@/lib/storage';
import { isFrameAssetInUse } from '@/lib/templates';
import { normalizeImageUpload } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const PREFIX = 'data:image/png;base64,';

/**
 * The canvas editor calls this on save with a flattened PNG export of the
 * design (cutout left transparent).
 *
 * This is the hinge of the whole rendering strategy (§5.3): the editor keeps its
 * layer JSON for continued editing, while every renderer composites from this
 * flat PNG — which is what makes output consistent across devices instead of
 * "whatever this browser's canvas did".
 *
 * For a finished frame (an upload or a Commons file) the editor draws overlays
 * on top of the original image. That original is kept as the template's
 * *base* and is never deleted while the template exists, so every save
 * flattens onto the pristine artwork instead of onto the previous save.
 */
export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const template = await assertOwnsTemplate(user, id);
  enforce(`frame-save:${user.id}`, 240);

  // Base64 inflates by a third.
  const { dataUrl } = await readJson(req, Math.ceil(config.limits.frameUploadBytes * 1.4));
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) {
    throw badRequest('Expected a PNG data URL from the editor.');
  }

  const raw = Buffer.from(dataUrl.slice(PREFIX.length), 'base64');
  const normalized = await normalizeImageUpload(raw, {
    maxBytes: config.limits.frameUploadBytes,
    allow: ['image/png'],
    expectRatio: template.aspectRatio,
    targetSize: ratioDims(template.aspectRatio),
  });

  const asset = await storeAsset({
    kind: 'frame',
    mime: normalized.mime,
    buffer: normalized.buffer,
    width: normalized.width,
    height: normalized.height,
  });

  const previous = template.frameAssetId;
  const base = template.editable
    ? null
    : template.canvasJson?.baseFrameAssetId || previous || null;

  const updated = await prisma.template.update({
    where: { id: template.id },
    data: {
      frameAssetId: asset.id,
      ...(base && !template.canvasJson?.baseFrameAssetId
        ? { canvasJson: { ...(template.canvasJson || {}), baseFrameAssetId: base } }
        : {}),
    },
  });

  // Reclaim the old frame only if it is not the protected base and no other
  // template (e.g. a clone) still uses it.
  if (previous && previous !== asset.id && previous !== base && !(await isFrameAssetInUse(previous))) {
    await destroyAsset(previous);
  }

  return ok({ template: { ...updated, frameUrl: assetUrl(asset.id) } });
});
