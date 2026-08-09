import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assetUrl, destroyAsset, storeAsset } from '@/lib/storage';
import { normalizeImageUpload, readUploadFile } from '@/lib/uploads';
import { fetchCommonsFile } from '@/lib/commons';

export const dynamic = 'force-dynamic';

// §7 step 3 / WALL-2. Commons is offered first because a logo already on
// Commons is openly licensed and reusable by the whole movement.
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();

  const contentType = req.headers.get('content-type') || '';
  let normalized;

  if (contentType.includes('application/json')) {
    const { commonsUrl } = await req.json();
    if (!commonsUrl) throw badRequest('Provide a file or a Commons link.');
    const file = await fetchCommonsFile(commonsUrl);
    normalized = await normalizeImageUpload(file.buffer, { maxBytes: config.limits.logoBytes });
  } else {
    const form = await req.formData();
    const buffer = await readUploadFile(form, 'file', config.limits.logoBytes);
    normalized = await normalizeImageUpload(buffer, {
      maxBytes: config.limits.logoBytes,
      allow: ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'],
    });
  }

  const asset = await storeAsset({
    kind: 'logo',
    mime: normalized.mime,
    buffer: normalized.buffer,
    width: normalized.width,
    height: normalized.height,
  });

  const previous = user.logoAssetId;
  await prisma.user.update({ where: { id: user.id }, data: { logoAssetId: asset.id } });
  if (previous) await destroyAsset(previous);

  return ok({ logoUrl: assetUrl(asset.id) });
});

export const DELETE = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!user.logoAssetId) return ok({ logoUrl: null });
  await prisma.user.update({ where: { id: user.id }, data: { logoAssetId: null } });
  await destroyAsset(user.logoAssetId);
  return ok({ logoUrl: null });
});
