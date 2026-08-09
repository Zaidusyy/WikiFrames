import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate } from '@/lib/authz';
import { assetUrl, destroyAsset, storeAsset } from '@/lib/storage';
import { normalizeImageUpload } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

/**
 * The canvas editor calls this on save with a flattened PNG export of the
 * design (cutout left transparent).
 *
 * This is the hinge of the whole rendering strategy (§5.3): the editor keeps its
 * layer JSON for continued editing, while the server composites participant
 * images from this flat PNG. Both the phone preview and the server renderer
 * therefore draw the *same* frame, which is what makes output consistent across
 * devices instead of "whatever this browser's canvas did".
 */
export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const template = await assertOwnsTemplate(user, id);

  const { dataUrl } = await req.json();
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw badRequest('Expected a PNG data URL from the editor.');
  }

  const raw = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  const normalized = await normalizeImageUpload(raw, {
    maxBytes: config.limits.frameUploadBytes,
    allow: ['image/png'],
    expectRatio: template.aspectRatio,
  });

  const asset = await storeAsset({
    kind: 'frame',
    mime: normalized.mime,
    buffer: normalized.buffer,
    width: normalized.width,
    height: normalized.height,
  });

  const previous = template.frameAssetId;
  const updated = await prisma.template.update({
    where: { id: template.id },
    data: { frameAssetId: asset.id },
  });

  // Only reclaim the old frame if no other template (e.g. a clone) still uses it.
  if (previous && previous !== asset.id) {
    const stillUsed = await prisma.template.count({ where: { frameAssetId: previous } });
    if (!stillUsed) await destroyAsset(previous);
  }

  return ok({ template: { ...updated, frameUrl: assetUrl(asset.id) } });
});
