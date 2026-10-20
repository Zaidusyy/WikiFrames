import sharp from 'sharp';
import { badRequest, payloadTooLarge } from './errors';

// SEC-2 / UP-1 / UP-4: nothing reaches storage without being sniffed, size
// capped, decoded under a pixel budget and re-encoded — which strips EXIF/GPS
// and anything appended to the file. SVG is never stored as SVG: it is
// rasterised here, so no uploaded file can ever be served back as markup.

const MAX_SIDE = 8000;
// A decompression bomb is a small file that decodes to gigapixels. sharp's
// default ceiling is ~268 MP; nothing a person legitimately uploads here needs
// more than this.
export const DECODE_PIXEL_LIMIT = 64_000_000;

const MAGIC = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

/** Trusting the client's Content-Type is how polyglot files get in. */
export function sniffMime(buffer) {
  if (!buffer?.length) return null;
  for (const sig of MAGIC) {
    if (buffer.length >= sig.bytes.length && sig.bytes.every((b, i) => buffer[i] === b)) return sig.mime;
  }
  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // SVG: an XML prologue or comment is allowed before the root element, but
  // the root element itself must be <svg>.
  const head = buffer
    .subarray(0, 2048)
    .toString('utf8')
    .replace(/^﻿/, '')
    .replace(/<\?xml[\s\S]*?\?>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/i, '')
    .trimStart();
  if (/^<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

/**
 * Prepares untrusted SVG for the rasteriser. librsvg does not run scripts and
 * refuses external resources when rendering from a buffer, but entity tricks
 * (billion laughs, external entities) live in the XML layer, so the DOCTYPE —
 * and with it every entity declaration — is removed before parsing.
 */
export function stripSvgDoctype(source) {
  const svg = source
    .toString('utf8')
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '');
  if (!/<svg[\s>]/i.test(svg)) throw badRequest('That SVG could not be read.');
  return Buffer.from(svg, 'utf8');
}

async function rasterizeSvg(buffer, { targetW, targetH, maxSide }) {
  const clean = stripSvgDoctype(buffer);
  let meta;
  try {
    meta = await sharp(clean, { limitInputPixels: DECODE_PIXEL_LIMIT }).metadata();
  } catch {
    throw badRequest('That SVG could not be read.');
  }
  const intrinsicW = meta.width || 512;
  const intrinsicH = meta.height || 512;
  const wantedLongest = targetW && targetH ? Math.max(targetW, targetH) : maxSide;
  // Render at a density that lands near the wanted size, so curves stay crisp
  // rather than being upscaled from a 72 dpi bitmap.
  const density = Math.min(2400, Math.max(18, (72 * wantedLongest) / Math.max(intrinsicW, intrinsicH)));

  let pipeline = sharp(clean, { density, limitInputPixels: DECODE_PIXEL_LIMIT });
  pipeline =
    targetW && targetH
      ? pipeline.resize(targetW, targetH, { fit: 'fill' })
      : pipeline.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: false });
  try {
    return await pipeline.ensureAlpha().png({ compressionLevel: 6 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw badRequest('That SVG could not be rendered.');
  }
}

/**
 * Validates and normalizes an uploaded image.
 *
 * @param {Buffer} buffer
 * @param {object} opts
 *   maxBytes, allow           — size and type gates
 *   requireTransparency       — frames must have an alpha channel
 *   expectRatio, ratioTolerance — "9:16" etc.; frames must match their template
 *   targetSize {w, h}         — rasterise/resize to exactly this (frames)
 *   maxSide                   — downscale anything larger (logos, artwork)
 *   preferJpegWhenOpaque      — store photos without alpha as JPEG, not PNG
 * @returns {Promise<{buffer:Buffer, mime:string, width:number, height:number}>}
 */
export async function normalizeImageUpload(buffer, opts = {}) {
  const {
    maxBytes = 10 * 1024 * 1024,
    allow = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    requireTransparency = false,
    expectRatio = null,
    ratioTolerance = 0.02,
    targetSize = null,
    maxSide = null,
    preferJpegWhenOpaque = false,
  } = opts;

  if (!buffer?.length) throw badRequest('The uploaded file is empty.');
  if (buffer.length > maxBytes) throw payloadTooLarge(maxBytes);

  const mime = sniffMime(buffer);
  if (!mime) throw badRequest('Unsupported file type. Use PNG, JPG, WebP or SVG.');
  if (!allow.includes(mime)) {
    throw badRequest(`This field accepts ${allow.map((m) => m.replace('image/', '').toUpperCase()).join(', ')}.`);
  }

  if (mime === 'image/svg+xml') {
    const rendered = await rasterizeSvg(buffer, {
      targetW: targetSize?.w,
      targetH: targetSize?.h,
      maxSide: maxSide || 2048,
    });
    if (expectRatio) assertRatio(rendered.info.width, rendered.info.height, expectRatio, ratioTolerance);
    return {
      buffer: rendered.data,
      mime: 'image/png',
      width: rendered.info.width,
      height: rendered.info.height,
    };
  }

  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'none', limitInputPixels: DECODE_PIXEL_LIMIT }).metadata();
  } catch {
    throw badRequest('That image could not be decoded.');
  }
  const width = meta.autoOrient?.width || meta.width;
  const height = meta.autoOrient?.height || meta.height;
  if (!width || !height) throw badRequest('That image could not be decoded.');
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw badRequest(`Image is larger than ${MAX_SIDE} px on a side.`);
  }

  if (requireTransparency && !meta.hasAlpha) {
    throw badRequest(
      'A frame needs a transparent cutout — export as PNG with transparency, not JPG.'
    );
  }
  if (expectRatio) assertRatio(width, height, expectRatio, ratioTolerance);

  // Re-encode: applies the EXIF orientation, then drops EXIF/GPS and any
  // appended payload (SEC-2).
  let pipeline = sharp(buffer, { failOn: 'none', limitInputPixels: DECODE_PIXEL_LIMIT }).autoOrient();
  if (targetSize) {
    pipeline = pipeline.resize(targetSize.w, targetSize.h, { fit: 'fill' });
  } else if (maxSide && Math.max(width, height) > maxSide) {
    pipeline = pipeline.resize(maxSide, maxSide, { fit: 'inside' });
  }

  const asJpeg = preferJpegWhenOpaque && !meta.hasAlpha;
  const { data, info } = asJpeg
    ? await pipeline.jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true })
    : await pipeline.png({ compressionLevel: 6 }).toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mime: asJpeg ? 'image/jpeg' : 'image/png',
    width: info.width,
    height: info.height,
  };
}

function assertRatio(width, height, expectRatio, tolerance) {
  const [rw, rh] = String(expectRatio).split(':').map(Number);
  if (!rw || !rh) return;
  const wanted = rw / rh;
  const actual = width / height;
  if (Math.abs(actual - wanted) / wanted > tolerance) {
    throw badRequest(
      `This template is ${expectRatio}, but the upload is ${width}×${height}. Re-export at the right ratio.`
    );
  }
}

/**
 * §10.3 step 5: a frame is only usable if the cutout region is actually see
 * through. We sample the alpha channel inside the declared cutout box.
 */
export async function hasTransparentRegion(buffer, rect) {
  const meta = await sharp(buffer, { limitInputPixels: DECODE_PIXEL_LIMIT }).metadata();
  if (!meta.hasAlpha) return false;
  const left = Math.max(0, Math.round(rect.x));
  const top = Math.max(0, Math.round(rect.y));
  const width = Math.min(Math.round(rect.w), (meta.width ?? 0) - left);
  const height = Math.min(Math.round(rect.h), (meta.height ?? 0) - top);
  if (width <= 0 || height <= 0) return false;

  const { data, info } = await sharp(buffer, { limitInputPixels: DECODE_PIXEL_LIMIT })
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let transparent = 0;
  const pixels = info.width * info.height;
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    if (data[i] < 16) transparent += 1;
  }
  // A generous threshold: designers often feather the cutout edge.
  return transparent / pixels > 0.25;
}

export async function readUploadFile(formData, field, maxBytes) {
  const file = formData.get(field);
  if (!file || typeof file === 'string') throw badRequest(`No file provided for "${field}".`);
  if (typeof file.size === 'number' && file.size > maxBytes) throw payloadTooLarge(maxBytes);
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Finds the photo hole in a finished frame by looking at its alpha channel.
 *
 * A frame designed in Canva or Figma arrives as a flat PNG; without this the
 * participant's photo would be placed at the default position no matter where
 * the designer actually cut the hole. The largest transparent region that does
 * not touch the image border is taken to be the cutout (a see-through margin
 * around the edge is a design choice, not a hole), and its fill ratio tells a
 * circle from a rectangle.
 *
 * Returns template cutout JSON, or null when no plausible hole exists.
 */
export async function detectCutout(buffer, canvasWidth, canvasHeight) {
  const SAMPLE = 240;
  const { data, info } = await sharp(buffer, { limitInputPixels: DECODE_PIXEL_LIMIT })
    .resize(SAMPLE, SAMPLE, { fit: 'inside' })
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = null;

  for (let start = 0; start < w * h; start += 1) {
    if (seen[start] || data[start] >= 32) continue;
    // Flood-fill one transparent region.
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let touchesEdge = false;
    while (top) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
      const neighbours = [p - 1, p + 1, p - w, p + w];
      for (let i = 0; i < 4; i += 1) {
        const q = neighbours[i];
        if (q < 0 || q >= w * h || seen[q] || data[q] >= 32) continue;
        if ((i === 0 && x === 0) || (i === 1 && x === w - 1)) continue;
        seen[q] = 1;
        stack[top++] = q;
      }
    }
    const candidate = { area, minX, minY, maxX, maxY, touchesEdge };
    const better =
      !best ||
      (best.touchesEdge && !candidate.touchesEdge) ||
      (best.touchesEdge === candidate.touchesEdge && candidate.area > best.area);
    if (better) best = candidate;
  }

  // Ignore specks: a usable hole covers at least 2% of the frame.
  if (!best || best.area < w * h * 0.02 || best.touchesEdge) return null;

  const boxW = best.maxX - best.minX + 1;
  const boxH = best.maxY - best.minY + 1;
  const fill = best.area / (boxW * boxH);
  const scaleX = canvasWidth / w;
  const scaleY = canvasHeight / h;
  const widthPx = Math.round(boxW * scaleX);
  const heightPx = Math.round(boxH * scaleY);

  // An ellipse fills π/4 ≈ 0.785 of its bounding box, a rectangle ~1.
  const shape = fill < 0.88 ? 'circle' : 'rounded';
  const radius = shape === 'rounded' && fill < 0.97 ? Math.round(Math.min(widthPx, heightPx) * 0.12) : 0;

  return {
    shape,
    radius,
    xPct: ((best.minX + boxW / 2) * scaleX) / canvasWidth,
    yPct: ((best.minY + boxH / 2) * scaleY) / canvasHeight,
    sizePct: Math.min(widthPx, heightPx) / Math.min(canvasWidth, canvasHeight),
    widthPx,
    heightPx,
  };
}
