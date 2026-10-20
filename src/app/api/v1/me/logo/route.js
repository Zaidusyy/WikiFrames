import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readForm, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { enforce } from '@/lib/ratelimit';
import { assetUrl, destroyAsset, storeAsset } from '@/lib/storage';
import { normalizeImageUpload, readUploadFile } from '@/lib/uploads';
import { fetchCommonsFile } from '@/lib/commons';

export const dynamic = 'force-dynamic';

const LOGO_SIDE = 1024;

// §7 step 3 / WALL-2. Commons is offered first because a logo already on
// Commons is openly licensed and reusable by the whole movement.
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  enforce(`logo:${user.id}`, 30);

  const contentType = req.headers.get('content-type') || '';
  let normalized;

  if (contentType.includes('application/json')) {
    const { commonsUrl } = await readJson(req);
    if (!commonsUrl) throw badRequest('Provide a file or a Commons link.');
    const file = await fetchCommonsFile(commonsUrl, { renderWidth: LOGO_SIDE, maxBytes: 8 * 1024 * 1024 });
    normalized = await normalizeImageUpload(file.buffer, {
      maxBytes: 8 * 1024 * 1024,
      maxSide: LOGO_SIDE,
    });
  } else {
    const form = await readForm(req, config.limits.logoBytes + 64 * 1024);
    const buffer = await readUploadFile(form, 'file', config.limits.logoBytes);
    normalized = await normalizeImageUpload(buffer, {
      maxBytes: config.limits.logoBytes,
      allow: ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'],
      maxSide: LOGO_SIDE,
    });
  }

  const asset = await storeAsset({
    kind: 'logo',
    mime: normalized.mime,
    buffer: normalized.buffer,
    width: normalized.width,
    height: normalized.height,
    ownerId: user.id,
  });

  const previous = user.logoAssetId;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      logoAssetId: asset.id,
      // WALL-3: a new logo is new public content — it is reviewed again before
      // it can appear on the homepage.
      ...(user.wallOptIn ? { wallStatus: 'pending' } : {}),
    },
  });
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
