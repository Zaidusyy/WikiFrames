// LINK-5: per-IP throttling on the open, no-login participant endpoints.
//
// In-process fixed-window counter. Good enough for a single Node instance and
// for the pilot; swap the two functions below for Redis (INCR + EXPIRE) when the
// image pipeline is scaled horizontally, since counters must then be shared.

const buckets = new Map();

function sweep(now) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

export function consume(key, limit, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  if (buckets.size > 5000) sweep(now);

  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export function enforce(key, limit, windowMs) {
  const result = consume(key, limit, windowMs);
  if (!result.allowed) {
    const err = new Error(
      `Too many requests. Please try again in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`
    );
    err.status = 429;
    throw err;
  }
  return result;
}
