// HTTP-shaped errors. Dependency-free so pure modules (rate limiting, upload
// validation, geometry) can throw them without importing the Next.js runtime.
// `handler()` in api.js turns `err.status` into the response status.

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function badRequest(message) {
  return httpError(400, message);
}

export function notFound(message = 'Not found') {
  return httpError(404, message);
}

export function forbidden(message = 'You do not have access to this.') {
  return httpError(403, message);
}

export function payloadTooLarge(maxBytes) {
  return httpError(413, `That upload is too large (max ${formatBytes(maxBytes)}).`);
}

export function tooManyRequests(message, retryAfterSeconds) {
  const err = httpError(429, message);
  err.retryAfterSeconds = retryAfterSeconds;
  return err;
}

export function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / 1024 / 1024)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
