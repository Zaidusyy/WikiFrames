import { NextResponse } from 'next/server';
import { config } from './config';
import { serializable } from './db';
import { badRequest, forbidden, httpError, payloadTooLarge } from './errors';

export {
  badRequest,
  forbidden,
  httpError,
  notFound,
  payloadTooLarge,
  tooManyRequests,
} from './errors';

export function ok(data, init) {
  return NextResponse.json(serializable(data ?? { ok: true }), init);
}

export function fail(status, message, extra) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

/**
 * Wraps a route handler so thrown errors become clean JSON instead of stack
 * traces. Handlers signal HTTP status by setting `err.status`; anything else is
 * a 500 whose details go to the log, never to the client.
 */
export function handler(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const status = statusFor(err);
      if (status >= 500) console.error('[wikiframes]', err);
      const response = fail(
        status,
        status >= 500 ? 'Something went wrong on our side.' : err.message
      );
      if (status === 429 && err.retryAfterSeconds) {
        response.headers.set('Retry-After', String(err.retryAfterSeconds));
      }
      return response;
    }
  };
}

function statusFor(err) {
  if (err?.status) return err.status;
  // Prisma: "record to update/delete not found" is a 404, not a crash.
  if (err?.code === 'P2025') return 404;
  return 500;
}

/**
 * The client address, for rate limiting only — it is never stored (SEC-5).
 *
 * X-Forwarded-For is a list the client can pre-fill. Each trusted proxy
 * appends the address it saw, so the honest value sits `trustProxyHops`
 * entries from the right. Taking the leftmost entry, as this used to, let
 * anyone dodge every rate limit by sending a made-up header.
 */
export function clientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    // Next.js itself fills the header with the socket address when it is
    // absent, so even with no proxy configured the rightmost entry is the best
    // value available.
    const trusted = Math.max(1, config.trustProxyHops);
    if (hops.length) return hops[Math.max(0, hops.length - trusted)];
  }
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

// A venue's worth of people: how many visitors a per-address budget stands for
// when the host hides addresses and all of them share one bucket.
const SHARED_ADDRESS_FACTOR = 50;

/**
 * Budget for a per-address rate limit. Where visitor addresses are hidden
 * (config.clientIpHidden) one bucket holds everybody, so it is scaled up to a
 * whole event instead of locking the event out after one person's allowance.
 */
export function perIpLimit(limit) {
  return config.clientIpHidden ? limit * SHARED_ADDRESS_FACTOR : limit;
}

/**
 * Rate-limit bucket for an address. An IPv6 client usually controls a whole
 * /64, so counting each of its 2^64 addresses separately would make the limit
 * meaningless; IPv4-mapped IPv6 is folded back to plain IPv4.
 */
export function rateKeyForIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!value.includes(':')) return value || 'unknown';
  const [head] = value.split('%');
  const groups = expandIpv6(head);
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : value;
}

function expandIpv6(address) {
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  return groups.every((g) => /^[0-9a-f]{1,4}$/.test(g)) ? groups.map((g) => g.replace(/^0+(?=.)/, '')) : null;
}

/**
 * SEC-3: CSRF defence for cookie-authenticated mutations, on top of
 * SameSite=Lax cookies.
 *
 * Fetch Metadata comes first: modern browsers say outright whether a request
 * is cross-site, and "same-site" (a sibling subdomain on shared hosting) is
 * refused too — Lax cookies would still be attached to those. The Origin check
 * then covers browsers that do not send Sec-Fetch-Site.
 */
export function assertSameOrigin(req) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw forbidden('Cross-site request refused.');
  }

  const origin = req.headers.get('origin');
  if (!origin) return; // same-origin navigations and server-to-server calls

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden('Malformed origin header.');
  }

  const allowed = new Set([req.headers.get('host'), new URL(config.baseUrl).host].filter(Boolean));
  if (!allowed.has(originHost)) throw forbidden('Cross-origin request refused.');
}

/**
 * Route handlers have no built-in body limit: `req.formData()` would happily
 * buffer a multi-gigabyte upload into memory. Every handler that reads a body
 * checks the declared length first.
 */
export function assertBodySize(req, maxBytes, { requireLength = false } = {}) {
  const declared = req.headers.get('content-length');
  if (declared === null) {
    if (requireLength) throw httpError(411, 'Uploads must declare their size.');
    return;
  }
  const length = Number(declared);
  if (!Number.isFinite(length) || length < 0) throw badRequest('Invalid Content-Length.');
  if (length > maxBytes) throw payloadTooLarge(maxBytes);
}

/**
 * Reads a body into memory, refusing to go past `maxBytes` even when the
 * client did not declare a length (chunked transfer).
 */
async function readBodyLimited(req, maxBytes) {
  assertBodySize(req, maxBytes);
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw payloadTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/** Reads a JSON body under a size cap. An empty body is `{}`. */
export async function readJson(req, maxBytes = config.limits.jsonBodyBytes) {
  const text = (await readBodyLimited(req, maxBytes)).toString('utf8');
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    throw badRequest('The request body is not valid JSON.');
  }
}

/** Reads a multipart body under a size cap. */
export async function readForm(req, maxBytes) {
  assertBodySize(req, maxBytes, { requireLength: true });
  try {
    return await req.formData();
  } catch {
    throw badRequest('The upload could not be read. Please try again.');
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter(
    (f) => body?.[f] === undefined || body?.[f] === null || body?.[f] === ''
  );
  if (missing.length) throw badRequest(`Missing required field(s): ${missing.join(', ')}`);
}
