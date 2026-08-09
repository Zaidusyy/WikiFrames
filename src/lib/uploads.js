import sharp from 'sharp';
import { badRequest } from './api';

// SEC-2 / UP-1 / UP-4: nothing reaches storage without being sniffed, size
// capped, re-encoded (which strips EXIF/GPS) or — for SVG — sanitized.

const MAGIC = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

/** Trusting the client's Content-Type is how polyglot files get in. */
export function sniffMime(buffer) {
  for (const sig of MAGIC) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) return sig.mime;
  }
  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  const head = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'image/svg+xml';
  return null;
}

/**
 * Strips scripts, event handlers, external references and embedded objects from
 * an SVG. Anything that can execute or phone home is removed rather than
 * escaped, because an SVG we serve is same-origin.
 */
export function sanitizeSvg(source) {
  let svg = source.toString('utf8');
  svg = svg.replace(/<\s*(script|foreignObject|iframe|object|embed|animate|set)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  svg = svg.replace(/<\s*(script|foreignObject|iframe|object|embed)[^>]*\/?>/gi, '');
  svg = svg.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  svg = svg.replace(/(href|xlink:href)\s*=\s*("|')\s*(javascript|data):[^"']*\2/gi, '');
  svg = svg.replace(/<!DOCTYPE[^>]*>/gi, '');
  svg = svg.replace(/<!ENTITY[^>]*>/gi, '');
  if (!/<svg[\s>]/i.test(svg)) throw badRequest('That SVG could not be read.');
  return Buffer.from(svg, 'utf8');
}

/**
 * Validates and normalizes an uploaded image.
 *
 * @param {Buffer} buffer
 * @param {object} opts { maxBytes, allow, requireTransparency, expectRatio }
 * @returns {Promise<{buffer:Buffer, mime:string, width:number, height:number}>}
 */
export async function normalizeImageUpload(buffer, opts = {}) {
  const {
    maxBytes = 10 * 1024 * 1024,
    allow = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    requireTransparency = false,
    expectRatio = null,
    ratioTolerance = 0.02,
  } = opts;

  if (!buffer?.length) throw badRequest('The uploaded file is empty.');
  if (buffer.length > maxBytes) {
    throw badRequest(`File is too large (max ${(maxBytes / 1024 / 1024).toFixed(0)} MB).`);
  }

  const mime = sniffMime(buffer);
  if (!mime) throw badRequest('Unsupported file type. Use PNG, JPG, WebP or SVG.');
  if (!allow.includes(mime)) {
    throw badRequest(`This field accepts ${allow.join(', ')}.`);
  }

  if (mime === 'image/svg+xml') {
    const clean = sanitizeSvg(buffer);
    const meta = await sharp(clean).metadata().catch(() => ({}));
    return { buffer: clean, mime, width: meta.width ?? null, height: meta.height ?? null };
  }

  const image = sharp(buffer, { failOn: 'none' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw badRequest('That image could not be decoded.');
  if (meta.width > 8000 || meta.height > 8000) {
    throw badRequest('Image is larger than 8000 px on a side.');
  }

  if (requireTransparency && !meta.hasAlpha) {
    throw badRequest(
      'A frame needs a transparent cutout — export as PNG with transparency, not JPG.'
    );
  }

  if (expectRatio) {
    const [rw, rh] = expectRatio.split(':').map(Number);
    const wanted = rw / rh;
    const actual = meta.width / meta.height;
    if (Math.abs(actual - wanted) / wanted > ratioTolerance) {
      throw badRequest(
        `This template is ${expectRatio}, but the upload is ${meta.width}×${meta.height}. Re-export at the right ratio.`
      );
    }
  }

  // Re-encode: drops EXIF/GPS and any appended payload (SEC-2).
  const out = await image.png({ compressionLevel: 9 }).toBuffer();
  return { buffer: out, mime: 'image/png', width: meta.width, height: meta.height };
}

/**
 * §10.3 step 5: a frame is only usable if the cutout region is actually see
 * through. We sample the alpha channel inside the declared cutout box.
 */
export async function hasTransparentRegion(buffer, rect) {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return false;
  const left = Math.max(0, Math.round(rect.x));
  const top = Math.max(0, Math.round(rect.y));
  const width = Math.min(Math.round(rect.w), (meta.width ?? 0) - left);
  const height = Math.min(Math.round(rect.h), (meta.height ?? 0) - top);
  if (width <= 0 || height <= 0) return false;

  const { data, info } = await sharp(buffer)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let transparent = 0;
  const pixels = info.width * info.height;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] < 16) transparent += 1;
  }
  // A generous threshold: designers often feather the cutout edge.
  return transparent / pixels > 0.25;
}

export async function readUploadFile(formData, field, maxBytes) {
  const file = formData.get(field);
  if (!file || typeof file === 'string') throw badRequest(`No file provided for "${field}".`);
  if (typeof file.size === 'number' && file.size > maxBytes) {
    throw badRequest(`File is too large (max ${(maxBytes / 1024 / 1024).toFixed(0)} MB).`);
  }
  return Buffer.from(await file.arrayBuffer());
}
