import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { buildAuthorizeUrl, newCodeVerifier, newState } from '@/lib/oauth';
import { handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

// PDR §6.2 step 1–2. State and PKCE verifier ride in short-lived HttpOnly
// cookies rather than server state, so the callback works across instances.
export const GET = handler(async () => {
  if (!config.oauth.clientId) {
    // AUTH-6: never fall back to something weaker — say so plainly instead.
    return NextResponse.redirect(`${config.baseUrl}/auth/unavailable`);
  }

  const state = newState();
  const codeVerifier = newCodeVerifier();
  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  };

  jar.set(config.cookies.oauthState, state, options);
  jar.set(config.cookies.oauthVerifier, codeVerifier, options);

  return NextResponse.redirect(buildAuthorizeUrl({ state, codeVerifier }));
});
