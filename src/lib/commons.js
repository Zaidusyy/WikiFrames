import { config } from './config';
import { badRequest, httpError, notFound, payloadTooLarge } from './errors';

// UP-2: Wikimedia Commons ingestion — and, for the canvas editor, search.
//
// Organizers are nudged to use Commons first: it keeps assets openly licensed
// and reusable by the movement, and every file arrives with the attribution we
// are obliged to display. Files are resolved through the Commons API and
// copied, so the participant flow never depends on Commons at render time.

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const PAGE_HOSTS = new Set(['commons.wikimedia.org', 'commons.m.wikimedia.org']);
// Originals live on upload.wikimedia.org; since 2026 thumbnails are served
// from thumb.wikimedia.org.
const MEDIA_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);
const TIMEOUT_MS = 15000;
const EXTMETADATA_FIELDS =
  'Artist|LicenseShortName|LicenseUrl|License|AttributionRequired|Credit|UsageTerms|ObjectName|ImageDescription';

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Accepts a file page URL, an upload URL, "File:Name.png" or a bare name. */
export function parseCommonsInput(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 1000) return null;

  if (/^file:/i.test(raw)) return normalizeTitle(raw.replace(/^file:/i, ''));

  let url;
  try {
    url = new URL(raw);
  } catch {
    return /^[^\n\r/\\<>[\]{}|#]+\.[a-z0-9]{2,5}$/i.test(raw) ? normalizeTitle(raw) : null;
  }
  // SEC: only Wikimedia hosts — this string ends up in a server-side fetch.
  if (url.protocol !== 'https:' || !(PAGE_HOSTS.has(url.hostname) || MEDIA_HOSTS.has(url.hostname))) {
    return null;
  }

  const wikiMatch = url.pathname.match(/\/wiki\/(.+)$/);
  if (wikiMatch) {
    const name = safeDecode(wikiMatch[1]);
    return /^file:/i.test(name) ? normalizeTitle(name.replace(/^file:/i, '')) : null;
  }

  const titleParam = url.searchParams.get('title');
  if (titleParam) {
    return /^file:/i.test(titleParam) ? normalizeTitle(titleParam.replace(/^file:/i, '')) : null;
  }

  // Direct upload.wikimedia.org URL. Thumbnails end in "/<width>px-<name>",
  // originals in "/<hash>/<hash2>/<name>".
  const parts = url.pathname.split('/').filter(Boolean);
  if (MEDIA_HOSTS.has(url.hostname) && parts.includes('thumb')) {
    const name = parts[parts.indexOf('thumb') + 3];
    return name ? normalizeTitle(safeDecode(name)) : null;
  }
  const last = parts.pop();
  return last ? normalizeTitle(safeDecode(last)) : null;
}

function normalizeTitle(name) {
  const clean = name.replace(/_/g, ' ').trim();
  if (!clean || clean.length > 240 || /[<>[\]{}|#\n\r]/.test(clean)) return null;
  return `File:${clean}`;
}

function stripHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A Wikimedia media URL, minus the analytics parameters Commons appends. */
function httpsUpload(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !MEDIA_HOSTS.has(url.hostname)) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Attribution in TASL form: title, author, source, licence. */
function attributionFrom(page, info) {
  const meta = info.extmetadata || {};
  const title = page.title?.replace(/^File:/, '') || 'Untitled';
  const licenseUrl = meta.LicenseUrl?.value || null;
  return {
    fileName: page.title,
    title,
    filePage: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
    author: stripHtml(meta.Artist?.value).slice(0, 200) || 'Unknown',
    license: stripHtml(meta.LicenseShortName?.value || meta.License?.value || meta.UsageTerms?.value).slice(0, 80) || 'See file page',
    licenseUrl: licenseUrl && /^https?:\/\//.test(licenseUrl) ? licenseUrl : null,
    attributionRequired: meta.AttributionRequired?.value !== 'false',
    credit: stripHtml(meta.Credit?.value).slice(0, 300),
  };
}

/** "“Title” by Author, CC BY-SA 4.0, via Wikimedia Commons". */
export function attributionLine(a) {
  const parts = [`“${(a.title || '').replace(/\.[a-z0-9]{2,5}$/i, '')}”`];
  if (a.author && a.author !== 'Unknown') parts.push(`by ${a.author}`);
  return `${parts.join(' ')}, ${a.license || 'see file page'}, via Wikimedia Commons`;
}

async function commonsApi(params) {
  const url = `${COMMONS_API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': config.userAgent, 'Api-User-Agent': config.userAgent },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw httpError(502, 'Could not reach Wikimedia Commons. Please try again.');
  }
  if (!res.ok) throw httpError(502, 'Wikimedia Commons did not answer. Please try again.');
  const data = await res.json().catch(() => null);
  if (!data || data.error) {
    console.warn('[commons] unexpected API answer', data?.error?.code || `HTTP ${res.status}, not JSON`);
    throw httpError(502, 'Wikimedia Commons returned an unexpected answer.');
  }
  return data;
}

/**
 * Streams a file from upload.wikimedia.org with a hard byte cap — a Commons
 * original can be hundreds of megabytes, and buffering it whole would let one
 * request exhaust the server's memory.
 */
async function downloadCapped(url, maxBytes) {
  const safe = httpsUpload(url);
  if (!safe) throw badRequest('That file is not hosted on Wikimedia Commons.');
  let res;
  try {
    res = await fetch(safe, {
      headers: { 'User-Agent': config.userAgent },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
  } catch {
    throw httpError(502, 'Could not download that Commons file.');
  }
  if (!res.ok || !res.body) throw httpError(502, 'Could not download that Commons file.');
  // Thumbnail requests may be redirected to a standard size; wherever they
  // land must still be Wikimedia's media host.
  if (!httpsUpload(res.url || safe)) throw httpError(502, 'Could not download that Commons file.');
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge(maxBytes);

  const reader = res.body.getReader();
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

/**
 * Resolves one Commons file and downloads a rendition of it.
 *
 * `renderWidth` asks Commons for a scaled PNG/JPEG instead of the original:
 * an SVG arrives rasterised by Commons itself, and a 60-megapixel original
 * arrives at a sane size. Files smaller than the requested width come back
 * unchanged.
 */
export async function fetchCommonsFile(input, { renderWidth = 1920, maxBytes = config.limits.commonsDownloadBytes } = {}) {
  const title = parseCommonsInput(input);
  if (!title) throw badRequest('That does not look like a Wikimedia Commons file link.');

  const data = await commonsApi({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(renderWidth),
    iiextmetadatafilter: EXTMETADATA_FIELDS,
    titles: title,
  });

  const page = data?.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info) throw notFound('That Commons file could not be found.');
  if (!/^image\//.test(info.mime || '')) throw badRequest('The Commons file must be an image.');

  const source = info.thumburl || info.url;
  const buffer = await downloadCapped(source, maxBytes);

  return {
    buffer,
    mime: info.mime,
    url: info.descriptionurl || info.url,
    attribution: attributionFrom(page, info),
  };
}

const searchCache = (globalThis.__wikiframesCommonsSearch ??= new Map());
const SEARCH_TTL_MS = 10 * 60 * 1000;

/**
 * Full-text search over Commons media, for the editor's media library.
 * Thumbnails are returned as upload.wikimedia.org URLs; inserting a result
 * goes through fetchCommonsFile so the canvas only ever holds our own copy.
 */
export async function searchCommons(query, { offset = 0, limit = 24 } = {}) {
  const q = String(query || '').trim().slice(0, 120);
  if (q.length < 2) return { results: [], nextOffset: null };
  const from = Math.max(0, Math.min(500, Math.floor(Number(offset) || 0)));
  const size = Math.max(1, Math.min(40, Math.floor(Number(limit) || 24)));

  const key = `${q.toLowerCase()}|${from}|${size}`;
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const data = await commonsApi({
    action: 'query',
    generator: 'search',
    // CirrusSearch keywords: raster images and SVG drawings only.
    gsrsearch: `${q} filetype:bitmap|drawing`,
    gsrnamespace: '6',
    gsrlimit: String(size),
    gsroffset: String(from),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '330',
    iiextmetadatafilter: EXTMETADATA_FIELDS,
  });

  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : [];
  const results = pages
    .filter((page) => page?.imageinfo?.[0])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => {
      const info = page.imageinfo[0];
      return {
        title: page.title,
        thumbUrl: httpsUpload(info.thumburl || info.url),
        thumbWidth: info.thumbwidth || null,
        thumbHeight: info.thumbheight || null,
        width: info.width,
        height: info.height,
        mime: info.mime,
        attribution: attributionFrom(page, info),
      };
    })
    .filter((r) => r.thumbUrl && /^image\/(png|jpeg|gif|webp|svg\+xml|tiff)$/.test(r.mime));

  const nextOffset = data?.continue?.gsroffset ?? null;
  const value = { results, nextOffset: typeof nextOffset === 'number' ? nextOffset : null };

  if (searchCache.size > 500) searchCache.clear();
  searchCache.set(key, { value, expires: Date.now() + SEARCH_TTL_MS });
  return value;
}
