import { cookies } from 'next/headers';
import { config } from './config';
import { prisma } from './db';
import { randomToken, sha256 } from './tokens';

// AUTH-3: opaque random token in an HttpOnly cookie; only its SHA-256 lands in
// the DB, so a database leak cannot be replayed as a login.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createSession(userId) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + config.session.slidingDays * DAY_MS);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });
  const jar = await cookies();
  jar.set(config.session.cookieName, token, {
    httpOnly: true,
    secure: config.baseUrl.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: config.session.absoluteDays * 24 * 60 * 60,
  });
  return token;
}

/**
 * Resolves the current user, sliding the expiry forward but never past the
 * absolute ceiling measured from session creation.
 */
export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(config.session.cookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const absoluteDeadline =
    session.createdAt.getTime() + config.session.absoluteDays * DAY_MS;
  if (Date.now() > absoluteDeadline) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const slidTo = Math.min(Date.now() + config.session.slidingDays * DAY_MS, absoluteDeadline);
  if (slidTo - session.expiresAt.getTime() > 60 * 60 * 1000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { expiresAt: new Date(slidTo) } })
      .catch(() => {});
  }

  return session.user;
}

// AUTH-5: server-side destroy, then clear the cookie.
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(config.session.cookieName)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  jar.delete(config.session.cookieName);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== 'super_admin') {
    const err = new Error('Super admin only');
    err.status = 403;
    throw err;
  }
  return user;
}
