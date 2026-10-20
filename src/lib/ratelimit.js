import { tooManyRequests } from './errors';

// LINK-5: per-IP throttling on the open, no-login participant endpoints.
//
// In-process fixed-window counters. Good enough for a single Node instance and
// for a pilot; swap the functions below for Redis (INCR + EXPIRE) when the app
// is scaled horizontally, since counters must then be shared.

const buckets = (globalThis.__wikiframesRateBuckets ??= new Map());
const MAX_BUCKETS = 20000;

function sweep(now) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  // Still over budget (a flood of distinct keys): drop the oldest windows. A
  // dropped bucket only ever errs towards letting a request through.
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= excess) break;
      buckets.delete(key);
    }
  }
}

function bucketFor(key, windowMs, now) {
  if (buckets.size > MAX_BUCKETS) sweep(now);
  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  return entry;
}

export function consume(key, limit, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const entry = bucketFor(key, windowMs, now);
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/** Reads a counter without incrementing it. */
export function peek(key, limit) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  return {
    allowed: entry.count < limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export function enforce(key, limit, windowMs) {
  const result = consume(key, limit, windowMs);
  if (!result.allowed) {
    throw tooManyRequests(
      `Too many requests. Please try again in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`,
      result.retryAfterSeconds
    );
  }
  return result;
}

/** Test hook: forget every counter. */
export function resetRateLimits() {
  buckets.clear();
}
