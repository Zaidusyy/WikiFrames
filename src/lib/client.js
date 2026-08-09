'use client';

// Thin fetch wrapper for the admin surfaces. Everything goes through /api/v1
// with same-origin cookies; errors arrive as `{ error }` and are re-thrown with
// the server's own wording, which is written to be shown to a human as-is.

async function request(path, { method = 'GET', body, headers, signal } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      ...(isFormData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(headers || {}),
    },
    body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const error = new Error(payload?.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return payload;
}

export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};

export function downloadUrl(path) {
  return `/api/v1${path}`;
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Safari without a user gesture, or an insecure context.
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const okay = document.execCommand('copy');
    document.body.removeChild(el);
    return okay;
  }
}
