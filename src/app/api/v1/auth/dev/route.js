import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/session';
import { fail, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Local development sign-in.
 *
 * AUTH-1/AUTH-6 forbid any password or fallback auth in the real product, so
 * this route refuses to exist unless BOTH NODE_ENV !== production AND
 * ALLOW_DEV_LOGIN=true. It is here only so contributors can run the whole
 * product before a Meta-Wiki OAuth consumer has been registered.
 */
export const GET = handler(async (req) => {
  if (!config.devLoginEnabled) return fail(404, 'Not found');

  const url = new URL(req.url);
  const username = (url.searchParams.get('username') || 'DevOrganizer').slice(0, 60);
  // Deterministic fake central id so repeated dev logins reuse one account.
  const wikiUserId = BigInt(
    900000000 + (Math.abs([...username].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 1000000)
  );

  const user = await prisma.user.upsert({
    where: { wikiUserId },
    create: {
      wikiUserId,
      wikiUsername: username,
      userPageUrl: `https://meta.wikimedia.org/wiki/User:${encodeURIComponent(username)}`,
      role: config.superAdminUsernames.includes(username) ? 'super_admin' : 'organizer',
    },
    update: { wikiUsername: username },
  });

  await createSession(user.id);
  return NextResponse.redirect(
    `${config.baseUrl}${user.onboardedAt ? '/dashboard' : '/onboarding'}`
  );
});
