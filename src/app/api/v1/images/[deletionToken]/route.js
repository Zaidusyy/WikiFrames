import { prisma } from '@/lib/db';
import { handler, notFound, ok } from '@/lib/api';
import { assetUrl, destroyAsset } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// RET-7: the participant's own removal path. The deletion token is shown once,
// on the result screen, and is the only thing needed — there is no account to
// log into and nothing linking the image back to a person.

export const GET = handler(async (_req, { params }) => {
  const { deletionToken } = await params;
  const image = await prisma.generatedImage.findUnique({
    where: { deletionToken },
    include: { campaign: { select: { name: true } } },
  });
  if (!image) throw notFound('This image has already been deleted, or the link is not valid.');

  return ok({
    image: { url: assetUrl(image.assetId), createdAt: image.createdAt, expiresAt: image.expiresAt },
    campaign: image.campaign.name,
  });
});

export const DELETE = handler(async (_req, { params }) => {
  const { deletionToken } = await params;
  const image = await prisma.generatedImage.findUnique({ where: { deletionToken } });
  // Already gone is a success from the participant's point of view.
  if (!image) return ok({ deleted: true });

  await prisma.generatedImage.delete({ where: { id: image.id } });
  await destroyAsset(image.assetId);
  console.log(`[retention] participant-deleted image=${image.id}`);

  return ok({ deleted: true });
});
