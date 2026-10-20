import { badRequest, payloadTooLarge } from './errors';
import { normalizeBadge, normalizeCutout, safeColor } from './geometry';

// Template JSON is written by the canvas editor, but anyone with an organizer
// session can send anything. It is stored, rendered on the server (cutout and
// badge geometry end up inside SVG), loaded into other people's editors (the
// co-team) and summarised to participants (credits). Everything that crosses
// one of those boundaries is checked here, once, on the way in.

const ASSET_SRC = /^\/api\/v1\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_OBJECTS = 600;
const MAX_DEPTH = 6;

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Attribution entries (TASL: title, author, source, licence). */
export function sanitizeCredits(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 50)
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      title: text(c.title, 200) || 'Untitled',
      author: text(c.author, 200) || 'Unknown',
      license: text(c.license, 80) || 'See source',
      licenseUrl: httpsUrl(c.licenseUrl),
      sourceUrl: httpsUrl(c.sourceUrl),
    }));
}

/**
 * Image sources inside the layer tree may only point at our own asset route
 * (or be inline data). An external URL would leak the IP address of every
 * co-team member who opens the editor, and would taint the canvas so the
 * frame could not even be exported.
 */
function imageSource(value) {
  if (typeof value !== 'string') return null;
  if (ASSET_SRC.test(value)) return value;
  if (value.length <= 6_000_000 && DATA_IMAGE.test(value)) return value;
  // Browsers serialise <img src> as an absolute URL. Keep only the path of our
  // own asset route; whatever host was in front of it is discarded.
  try {
    const url = new URL(value);
    if (/^https?:$/.test(url.protocol) && ASSET_SRC.test(url.pathname) && !url.search) return url.pathname;
  } catch {
    // not a URL
  }
  return null;
}

function sanitizeObject(obj, depth, counter) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (depth > MAX_DEPTH) return null;
  counter.count += 1;
  if (counter.count > MAX_OBJECTS) return null;

  const copy = { ...obj };
  if ('src' in copy) {
    const src = imageSource(copy.src);
    if (!src) return null;
    copy.src = src;
  }
  // Pattern fills reference an image the same way.
  for (const key of ['fill', 'stroke']) {
    const paint = copy[key];
    if (paint && typeof paint === 'object' && 'source' in paint) {
      const source = imageSource(paint.source);
      if (!source) return null;
      copy[key] = { ...paint, source };
    }
  }

  if (Array.isArray(copy.objects)) {
    copy.objects = copy.objects
      .map((child) => sanitizeObject(child, depth + 1, counter))
      .filter(Boolean);
  }
  if (copy.clipPath) {
    copy.clipPath = sanitizeObject(copy.clipPath, depth + 1, counter) || undefined;
  }
  return copy;
}

function sanitizeFabric(fabric) {
  if (!fabric || typeof fabric !== 'object' || Array.isArray(fabric)) return undefined;
  const counter = { count: 0 };
  const objects = Array.isArray(fabric.objects)
    ? fabric.objects.map((o) => sanitizeObject(o, 0, counter)).filter(Boolean)
    : [];
  if (counter.count > MAX_OBJECTS) {
    throw badRequest(`A template can hold at most ${MAX_OBJECTS} layers.`);
  }
  const out = { ...fabric, objects };
  if (out.backgroundImage) out.backgroundImage = sanitizeObject(out.backgroundImage, 0, counter) || undefined;
  if (out.overlayImage) out.overlayImage = sanitizeObject(out.overlayImage, 0, counter) || undefined;
  return out;
}

function sanitizeHealth(health) {
  if (!health || typeof health !== 'object') return undefined;
  const count = (v) => Math.max(0, Math.min(999, Math.round(Number(v) || 0)));
  return {
    errors: count(health.errors),
    warnings: count(health.warnings),
    score: Math.max(0, Math.min(100, Math.round(Number(health.score) || 0))),
    checkedAt: typeof health.checkedAt === 'string' ? health.checkedAt.slice(0, 40) : null,
  };
}

/**
 * Validates and normalizes a template's `canvasJson` before it is stored.
 * Unknown top-level keys are dropped rather than carried along forever.
 */
export function sanitizeCanvasJson(input, { maxBytes }) {
  if (input === null || input === undefined) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('The canvas data could not be read.');
  }
  const size = Buffer.byteLength(JSON.stringify(input));
  if (size > maxBytes) throw payloadTooLarge(maxBytes);

  const out = {};
  if (input.fabric !== undefined) out.fabric = sanitizeFabric(input.fabric);
  if (input.cutout !== undefined && input.cutout !== null) out.cutout = normalizeCutout(input.cutout);
  if (input.badge !== undefined && input.badge !== null) out.badge = normalizeBadge(input.badge);
  if (input.background !== undefined) {
    out.background = input.background === 'transparent' ? 'transparent' : safeColor(input.background, '#ffffff');
  }
  if (input.credits !== undefined) out.credits = sanitizeCredits(input.credits);
  if (input.health !== undefined) out.health = sanitizeHealth(input.health);
  if (Array.isArray(input.overlays)) out.overlays = sanitizeFabric({ objects: input.overlays }).objects;

  // Starter-template hints written when a template is created from a preset.
  for (const key of ['starter', 'headline']) {
    if (typeof input[key] === 'string') out[key] = input[key].slice(0, 200);
  }
  if (input.accent !== undefined) out.accent = safeColor(input.accent, '#ffffff');
  if (Array.isArray(input.artifacts)) {
    out.artifacts = input.artifacts.filter((a) => typeof a === 'string').slice(0, 20).map((a) => a.slice(0, 40));
  }
  return out;
}

/**
 * MediaWiki's own username rules: underscores are spaces, runs of spaces
 * collapse, and the first letter is always upper case. "jane_doe" and
 * "User:Jane doe" both mean "Jane doe".
 */
export function normalizeWikiUsername(input) {
  const name = String(input || '')
    .replace(/^\s*user\s*:/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return '';
  const [first, ...rest] = Array.from(name);
  return first.toLocaleUpperCase('en') + rest.join('');
}

/** Wikimedia project domains a user page may live on. */
const WIKIMEDIA_DOMAINS = [
  'wikipedia.org',
  'wikimedia.org',
  'wiktionary.org',
  'wikibooks.org',
  'wikinews.org',
  'wikiquote.org',
  'wikisource.org',
  'wikiversity.org',
  'wikivoyage.org',
  'wikidata.org',
  'wikifunctions.org',
  'mediawiki.org',
];

/**
 * A user page link shown publicly on the community wall. The old pattern
 * `[a-z0-9.-]*wikimedia\.org` also matched `evilwikimedia.org`; this checks
 * the registrable domain properly and refuses anything that is not https.
 */
export function isWikimediaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return WIKIMEDIA_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
