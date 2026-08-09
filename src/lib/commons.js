// UP-2: Wikimedia Commons ingestion. Organizers are nudged to host frames on
// Commons first — it keeps assets openly licensed and reusable by the movement.
//
// We resolve the file through the Commons API rather than hot-linking, so the
// participant flow does not depend on Commons being reachable at render time,
// and we capture the attribution we are obliged to display.

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const ALLOWED_HOSTS = new Set(['commons.wikimedia.org', 'upload.wikimedia.org']);

export function parseCommonsInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (/^file:/i.test(raw)) return raw.replace(/^file:/i, 'File:');

  let url;
  try {
    url = new URL(raw);
  } catch {
    return `File:${raw}`;
  }
  // SEC: only Wikimedia hosts — this string ends up in a server-side fetch.
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;

  const wikiMatch = url.pathname.match(/\/wiki\/(.+)$/);
  if (wikiMatch) return decodeURIComponent(wikiMatch[1]).replace(/^File:/i, 'File:');

  const titleParam = url.searchParams.get('title');
  if (titleParam) return titleParam;

  // Direct upload.wikimedia.org URL — the file name is the last path segment.
  const last = url.pathname.split('/').filter(Boolean).pop();
  return last ? `File:${decodeURIComponent(last)}` : null;
}

export async function fetchCommonsFile(input) {
  const title = parseCommonsInput(input);
  if (!title) {
    const err = new Error('That does not look like a Wikimedia Commons file link.');
    err.status = 400;
    throw err;
  }

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    titles: title.startsWith('File:') ? title : `File:${title}`,
    origin: '*',
  });

  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { 'User-Agent': 'WikiFrames/0.1 (https://github.com/Zaidusyy/WikiFrames)' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = new Error('Could not reach Wikimedia Commons. Please try again.');
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) {
    const err = new Error('That Commons file could not be found.');
    err.status = 404;
    throw err;
  }
  if (!/^image\//.test(info.mime || '')) {
    const err = new Error('The Commons file must be an image.');
    err.status = 400;
    throw err;
  }

  const meta = info.extmetadata || {};
  const attribution = {
    fileName: page.title,
    filePage: info.descriptionurl,
    author: stripHtml(meta.Artist?.value) || 'Unknown',
    license: meta.LicenseShortName?.value || meta.License?.value || 'See file page',
    credit: stripHtml(meta.Credit?.value) || '',
  };

  const fileRes = await fetch(info.url, {
    headers: { 'User-Agent': 'WikiFrames/0.1 (https://github.com/Zaidusyy/WikiFrames)' },
    cache: 'no-store',
  });
  if (!fileRes.ok) {
    const err = new Error('Could not download that Commons file.');
    err.status = 502;
    throw err;
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  return { buffer, mime: info.mime, url: info.descriptionurl || info.url, attribution };
}

function stripHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
