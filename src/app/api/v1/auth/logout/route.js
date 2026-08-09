import { handler, ok, assertSameOrigin } from '@/lib/api';
import { destroySession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// AUTH-5
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  await destroySession();
  return ok({ loggedOut: true });
});
