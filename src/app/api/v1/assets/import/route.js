import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readForm, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { enforce } from '@/lib/ratelimit';
import { assetUrl, storeAsset } from '@/lib/storage';
import { normalizeImageUpload, readUploadFile } from '@/lib/uploads';
import { attributionLine, fetchCommonsFile } from '@/lib/commons';

export const dynamic = 'force-dynamic';

// Big enough for a full-bleed background on the largest canvas side.
const ARTWORK_SIDE = 2048;
const MAX_ARTWORK_PER_USER = 2000;

/**
 * Brings an image into the canvas editor as artwork: from Wikimedia Commons
 * (by file title or link) or from the organizer's own device.
 *
 * Either way the bytes are copied, sniffed, re-encoded and size-capped here,
 * so the canvas only ever references our own asset route. That keeps every
 * frame exportable (no cross-origin pixels to taint the canvas), keeps
 * co-team members' browsers from fetching third-party URLs, and means a frame
 * keeps working even if the original file later disappears.
 */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  enforce(`artwork-import:${user.id}`, config.limits.artifactImportsPerHour);

  const existing = await prisma.asset.count({ where: { ownerId: user.id, kind: 'artifact' } });
  if (existing >= MAX_ARTWORK_PER_USER) {
    throw badRequest('Your artwork library is full. Remove unused templates to make room.');
  }

  const contentType = req.headers.get('content-type') || '';
  let buffer;
  let attribution = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await readForm(req, config.limits.artifactBytes + 64 * 1024);
    buffer = await readUploadFile(form, 'file', config.limits.artifactBytes);
  } else {
    const { commons } = await readJson(req, 4096);
    if (!commons) throw badRequest('Choose a file to upload or a Commons image.');
    const file = await fetchCommonsFile(String(commons), {
      renderWidth: ARTWORK_SIDE,
      maxBytes: config.limits.commonsDownloadBytes,
    });
    buffer = file.buffer;
    attribution = { ...file.attribution, line: attributionLine(file.attribution) };
  }

  const normalized = await normalizeImageUpload(buffer, {
    maxBytes: attribution ? config.limits.commonsDownloadBytes : config.limits.artifactBytes,
    allow: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'],
    maxSide: ARTWORK_SIDE,
    preferJpegWhenOpaque: true,
  });

  const asset = await storeAsset({
    kind: 'artifact',
    mime: normalized.mime,
    buffer: normalized.buffer,
    width: normalized.width,
    height: normalized.height,
    ownerId: user.id,
  });

  return ok(
    {
      asset: {
        id: asset.id,
        url: assetUrl(asset.id),
        width: normalized.width,
        height: normalized.height,
        mime: normalized.mime,
      },
      attribution,
    },
    { status: 201 }
  );
});
