import { NextResponse } from 'next/server';
import { serializable } from './db';

export function ok(data, init) {
  return NextResponse.json(serializable(data ?? { ok: true }), init);
}

export function fail(status, message, extra) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

/**
 * Wraps a route handler so thrown errors become clean JSON instead of stack
 * traces. Handlers signal HTTP status by setting `err.status`.
 */
export function handler(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const status = err?.status || 500;
      if (status >= 500) console.error('[wikiframes]', err);
      return fail(status, status >= 500 ? 'Something went wrong on our side.' : err.message);
    }
  };
}

export function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function notFound(message = 'Not found') {
  const err = new Error(message);
  err.status = 404;
  return err;
}

export function forbidden(message = 'You do not have access to this.') {
  const err = new Error(message);
  err.status = 403;
  return err;
}

export function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

// SEC-3: same-origin check for cookie-authenticated mutations. Combined with
// SameSite=Lax cookies this closes the CSRF gap without a token round-trip.
export function assertSameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return; // same-origin navigations and server-to-server calls
  const host = req.headers.get('host');
  try {
    if (new URL(origin).host !== host) throw forbidden('Cross-origin request refused.');
  } catch (err) {
    if (err.status) throw err;
    throw forbidden('Malformed origin header.');
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter(
    (f) => body?.[f] === undefined || body?.[f] === null || body?.[f] === ''
  );
  if (missing.length) throw badRequest(`Missing required field(s): ${missing.join(', ')}`);
}
