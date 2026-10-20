import { prisma } from '@/lib/db';
import { clientIp, handler, notFound, ok, rateKeyForIp } from '@/lib/api';
import { enforce } from '@/lib/ratelimit';
import { assetUrl, destroyAsset } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// RET-7: the participant's own removal path. The deletion token is shown once,
// on the result screen, and is the only thing needed — there is no account to
// log into and nothing linking the image back to a person.

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

function throttle(req) {
  // 192-bit tokens cannot be guessed, but there is no reason to let anyone try.
  enforce(`deletion:${rateKeyForIp(clientIp(req))}`, 120);
}

export const GET = handler(async (req, { params }) => {
  throttle(req);
  const { deletionToken } = await params;
  const missing = notFound('This image has already been deleted, or the link is not valid.');
  if (!TOKEN.test(deletionToken)) throw missing;

  const image = await prisma.generatedImage.findUnique({
    where: { deletionToken },
    include: { campaign: { select: { name: true } } },
  });
  if (!image) throw missing;

  return ok(
    {
      image: {
        // A short-lived link: the deletion page needs to show the image, but
        // the page URL must not become a permanent way to view it.
        url: assetUrl(image.assetId, { signedForSeconds: 15 * 60 }),
        createdAt: image.createdAt,
        expiresAt: image.expiresAt,
      },
      campaign: image.campaign.name,
    },
    { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
  );
});

export const DELETE = handler(async (req, { params }) => {
  throttle(req);
  const { deletionToken } = await params;
  if (!TOKEN.test(deletionToken)) return ok({ deleted: true });

  const image = await prisma.generatedImage.findUnique({ where: { deletionToken } });
  // Already gone is a success from the participant's point of view.
  if (!image) return ok({ deleted: true });

  await prisma.generatedImage.delete({ where: { id: image.id } });
  await destroyAsset(image.assetId);
  console.log(`[retention] participant-deleted image=${image.id}`);

  return ok({ deleted: true });
});
