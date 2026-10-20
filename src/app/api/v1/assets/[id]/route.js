import { prisma } from '@/lib/db';
import { fail, handler } from '@/lib/api';
import { getObject } from '@/lib/storage';
import { getCurrentUser } from '@/lib/session';
import { campaignAccess } from '@/lib/authz';
import { SIGNED_PURPOSE, verifySignedValue } from '@/lib/signing';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * All bytes are served through here so cache policy and access rules live in
 * one place rather than in bucket ACLs.
 *
 * Frames, logos and editor artwork are public by design (participants load
 * frames without an account). A participant's generated image is not: it is
 * served only to
 *   - someone holding a short-lived signed link (the participant themself, on
 *     the result screen or their private deletion page),
 *   - anyone, while the campaign runs a public gallery, or
 *   - the campaign's owner, co-team members and platform admins.
 * Everyone else gets the same 404 as for an id that never existed.
 */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Asset not found');

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return fail(404, 'Asset not found');

  let cacheControl = 'public, max-age=31536000, immutable';
  if (asset.kind === 'generated') {
    const decision = await generatedImageAccess(req, asset.id);
    if (!decision) return fail(404, 'Asset not found');
    cacheControl = decision.cacheControl;
  }

  let buffer;
  try {
    buffer = await getObject(asset.storageKey);
  } catch {
    // Bytes gone but metadata lingering means a purge was interrupted.
    return fail(410, 'This file is no longer available.');
  }

  return new Response(buffer, {
    headers: {
      'Content-Type': asset.mime,
      'Content-Length': String(buffer.length),
      'Cache-Control': cacheControl,
      // Belt and braces: even a file that slipped through as markup can never
      // run script or load anything when opened directly.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...(asset.kind === 'generated' ? { Vary: 'Cookie', 'Referrer-Policy': 'no-referrer' } : {}),
    },
  });
});

async function generatedImageAccess(req, assetId) {
  const image = await prisma.generatedImage.findFirst({
    where: { assetId },
    select: {
      campaign: {
        select: { id: true, ownerId: true, publicGallery: true, status: true, deletedAt: true },
      },
    },
  });
  // A generated asset with no gallery row is an orphan awaiting deletion.
  if (!image?.campaign || image.campaign.deletedAt) return null;
  const { campaign } = image;

  const token = new URL(req.url).searchParams.get('t');
  if (token && verifySignedValue(SIGNED_PURPOSE.ASSET, assetId, token)) {
    return { cacheControl: 'private, max-age=600' };
  }

  if (campaign.publicGallery && campaign.status !== 'draft' && campaign.status !== 'cancelled') {
    // Short shared cache: a participant deleting their image, or the organizer
    // switching the gallery off, takes effect within minutes everywhere.
    return { cacheControl: 'public, max-age=120, must-revalidate' };
  }

  const user = await getCurrentUser();
  if (user && (await campaignAccess(user, campaign))) {
    return { cacheControl: 'private, no-cache' };
  }
  return null;
}
