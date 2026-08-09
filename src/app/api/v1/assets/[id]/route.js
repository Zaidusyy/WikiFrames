import { prisma } from '@/lib/db';
import { fail, handler } from '@/lib/api';
import { getObject } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// All bytes are served through here so cache policy and access rules live in
// one place rather than in bucket ACLs.
export const GET = handler(async (_req, { params }) => {
  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return fail(404, 'Asset not found');

  let buffer;
  try {
    buffer = await getObject(asset.storageKey);
  } catch {
    // Bytes gone but metadata lingering means a purge was interrupted.
    return fail(410, 'This file is no longer available.');
  }

  // Generated participant images expire; frames and logos are immutable and
  // content-addressed by a random key, so they cache forever.
  const cacheControl =
    asset.kind === 'generated'
      ? 'private, max-age=300'
      : 'public, max-age=31536000, immutable';

  return new Response(buffer, {
    headers: {
      'Content-Type': asset.mime,
      'Content-Length': String(buffer.length),
      'Cache-Control': cacheControl,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
