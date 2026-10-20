import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import { exchangeCode, fetchProfile } from '@/lib/oauth';
import { clearCookie, createSession } from '@/lib/session';
import { handler } from '@/lib/api';
import { safeEqual } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

// PDR §6.2 steps 3–4: exchange the code, upsert the local user record (AUTH-2),
// then route first-timers into onboarding and everyone else to the dashboard.
export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const jar = await cookies();
  const expectedState = jar.get(config.cookies.oauthState)?.value;
  const codeVerifier = jar.get(config.cookies.oauthVerifier)?.value;
  clearCookie(jar, config.cookies.oauthState);
  clearCookie(jar, config.cookies.oauthVerifier);

  if (oauthError) return NextResponse.redirect(`${config.baseUrl}/auth/unavailable`);
  if (!code || !state || !expectedState || !codeVerifier || !safeEqual(state, expectedState)) {
    return NextResponse.redirect(`${config.baseUrl}/auth/unavailable?reason=state`);
  }

  let profile;
  try {
    const tokens = await exchangeCode({ code, codeVerifier });
    profile = await fetchProfile(tokens.access_token);
  } catch (err) {
    console.error('[auth] wikimedia oauth failed:', err.message);
    return NextResponse.redirect(`${config.baseUrl}/auth/unavailable?reason=upstream`);
  }

  // SUPER_ADMIN_USERNAMES is the single source of truth for platform admins:
  // promote on every sign-in, and demote anyone who has been taken off the
  // list instead of letting the privilege outlive the configuration.
  const isSuperAdmin = config.superAdminUsernames.includes(profile.wikiUsername);

  const user = await prisma.user.upsert({
    where: { wikiUserId: profile.wikiUserId },
    create: {
      wikiUserId: profile.wikiUserId,
      wikiUsername: profile.wikiUsername,
      userPageUrl: profile.userPageUrl,
      role: isSuperAdmin ? 'super_admin' : 'organizer',
    },
    update: {
      wikiUsername: profile.wikiUsername,
      role: isSuperAdmin ? 'super_admin' : 'organizer',
    },
  });

  await createSession(user.id);

  const destination = user.onboardedAt ? '/dashboard' : '/onboarding';
  return NextResponse.redirect(`${config.baseUrl}${destination}`);
});
