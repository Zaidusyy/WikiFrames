import sharp from 'sharp';
import {
  DEFAULT_BADGE,
  DEFAULT_CUTOUT,
  badgeLayout,
  containRect,
  cutoutRect,
  intersectRect,
  ratioDims,
  sanitizePlacement,
} from './geometry';
import { DECODE_PIXEL_LIMIT } from './uploads';

// Server-side compositing (PDR §5.3, §14.1 step 7).
//
// The canvas editor keeps its layer JSON for editing, but it also exports a
// flattened frame PNG with a transparent cutout. That PNG is the single source
// of truth here, which is what makes output identical across devices: this
// renderer and the on-device one (compose-client.js) draw the same four things
// in the same order, with the same geometry (geometry.js) —
// photo → cutout mask → frame → badge.
//
// Performance notes. Every intermediate stays as raw pixels; the only encode
// is the final one. The photo is cropped to the part that can actually show
// through the cutout *before* it is resized. Frames are decoded once and kept
// in a small LRU, because an event renders the same one or two frames for
// every single participant.

export { DEFAULT_BADGE, DEFAULT_CUTOUT, cutoutRect };

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const PHOTO_PIXEL_LIMIT = DECODE_PIXEL_LIMIT;

const BADGE_FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Bengali', 'Noto Sans Tamil', 'Noto Sans Arabic', 'Noto Color Emoji', sans-serif";

/** Least-recently-used cache with a byte budget. */
class ByteLru {
  constructor(budgetBytes) {
    this.budget = budgetBytes;
    this.bytes = 0;
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key, value, bytes) {
    if (bytes > this.budget) return;
    if (this.map.has(key)) {
      this.bytes -= this.map.get(key).bytes;
      this.map.delete(key);
    }
    this.map.set(key, { value, bytes });
    this.bytes += bytes;
    for (const [oldKey, entry] of this.map) {
      if (this.bytes <= this.budget) break;
      this.map.delete(oldKey);
      this.bytes -= entry.bytes;
    }
  }
}

const frameCache = (globalThis.__wikiframesFrameCache ??= new ByteLru(
  Number(process.env.FRAME_CACHE_MB || 96) * 1024 * 1024
));

function blankCanvas(width, height, background = TRANSPARENT) {
  return sharp({ create: { width, height, channels: 4, background } });
}

/**
 * A frame, decoded and sized to the canvas, as raw RGBA. Cached by asset id,
 * so on a hit the frame is not even read from storage.
 */
async function frameLayer({ frameBuffer, frameKey, loadFrameBuffer }, width, height) {
  const key = frameKey ? `${frameKey}:${width}x${height}` : frameBuffer ? null : `fallback:${width}x${height}`;
  const cached = key && frameCache.get(key);
  if (cached) return cached;

  const bytes = frameBuffer || (loadFrameBuffer ? await loadFrameBuffer() : null);
  const source = bytes || fallbackFrameSvg(width, height);
  const { data, info } = await sharp(source, { limitInputPixels: PHOTO_PIXEL_LIMIT })
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const layer = { data, raw: { width: info.width, height: info.height, channels: info.channels } };
  if (key) frameCache.set(key, layer, data.length);
  return layer;
}

/** The SVG that, composited with `dest-in`, keeps only pixels inside the hole. */
function maskSvg(rect, region) {
  const x = rect.x - region.x;
  const y = rect.y - region.y;
  const shape =
    rect.shape === 'circle'
      ? `<ellipse cx="${x + rect.w / 2}" cy="${y + rect.h / 2}" rx="${rect.w / 2}" ry="${rect.h / 2}" fill="#fff"/>`
      : `<rect x="${x}" y="${y}" width="${rect.w}" height="${rect.h}" rx="${rect.radius}" ry="${rect.radius}" fill="#fff"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${region.w}" height="${region.h}">${shape}</svg>`
  );
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** BADGE-1/2: the role chip, laid out by the same rules the phone uses. */
function badgeOverlay(text, style, width, height) {
  const b = badgeLayout(text, style, width, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${b.boxW}" height="${b.boxH}">
    <rect x="0" y="0" width="${b.boxW}" height="${b.boxH}" rx="${b.radius}" ry="${b.radius}" fill="${b.background}" fill-opacity="${b.opacity}"/>
    <text x="${b.boxW / 2}" y="${b.boxH / 2}" dominant-baseline="central" text-anchor="middle"
      font-family="${BADGE_FONT}" font-size="${b.fontSize}" font-weight="700" fill="${b.color}">${escapeXml(text)}</text>
  </svg>`;
  return { input: Buffer.from(svg), left: b.left, top: b.top };
}

/** Fallback used when a template has no flattened frame yet. */
function fallbackFrameSvg(width, height) {
  const inset = Math.round(Math.min(width, height) * 0.03);
  const stroke = Math.round(Math.min(width, height) * 0.012);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}"
         rx="${inset}" ry="${inset}" fill="none" stroke="#3366cc" stroke-width="${stroke}"/>
     </svg>`
  );
}

/**
 * The participant's photo, positioned and masked, as a raw RGBA overlay that
 * covers only the visible part of the cutout. Returns null when the photo does
 * not reach the cutout at all.
 */
async function photoLayer(photoBuffer, rect, placement, width, height) {
  const input = { failOn: 'none', limitInputPixels: PHOTO_PIXEL_LIMIT };

  let meta;
  try {
    meta = await sharp(photoBuffer, input).metadata();
  } catch {
    const err = new Error('That photo could not be read. Try a JPG or PNG.');
    err.status = 400;
    throw err;
  }
  const srcW = meta.autoOrient?.width || meta.width;
  const srcH = meta.autoOrient?.height || meta.height;
  if (!srcW || !srcH) {
    const err = new Error('That photo could not be read. Try a JPG or PNG.');
    err.status = 400;
    throw err;
  }

  // The photo keeps its own shape inside the placement box (never stretched).
  const fitted = containRect(placement.width, placement.height, srcW / srcH);
  const photo = {
    x: placement.left + fitted.dx,
    y: placement.top + fitted.dy,
    w: fitted.w,
    h: fitted.h,
  };

  // Only this region of the canvas can ever show photo pixels.
  const window = intersectRect({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }, { x: 0, y: 0, w: width, h: height });
  if (!window) return null;
  const region = {
    x: Math.floor(window.x),
    y: Math.floor(window.y),
    w: Math.ceil(window.x + window.w) - Math.floor(window.x),
    h: Math.ceil(window.y + window.h) - Math.floor(window.y),
  };

  let layer;
  if (!placement.rotate) {
    // Crop the *source* to what lands inside the window, then resize only that.
    const visible = intersectRect(photo, region);
    if (!visible) return null;
    const scaleX = srcW / photo.w;
    const scaleY = srcH / photo.h;
    const crop = {
      left: clampInt((visible.x - photo.x) * scaleX, 0, srcW - 1),
      top: clampInt((visible.y - photo.y) * scaleY, 0, srcH - 1),
    };
    crop.width = clampInt(visible.w * scaleX, 1, srcW - crop.left);
    crop.height = clampInt(visible.h * scaleY, 1, srcH - crop.top);

    const outLeft = Math.round(visible.x);
    const outTop = Math.round(visible.y);
    const outW = Math.max(1, Math.min(region.x + region.w, Math.round(visible.x + visible.w)) - outLeft);
    const outH = Math.max(1, Math.min(region.y + region.h, Math.round(visible.y + visible.h)) - outTop);

    const { data, info } = await sharp(photoBuffer, input)
      .autoOrient()
      .extract(crop)
      .resize(outW, outH, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    layer = await placeInRegion(
      { data, width: info.width, height: info.height },
      outLeft - region.x,
      outTop - region.y,
      region
    );
  } else {
    // Rotation grows the bitmap around its centre; re-centre after rotating.
    const boxW = Math.max(1, Math.round(photo.w));
    const boxH = Math.max(1, Math.round(photo.h));
    const resized = await sharp(photoBuffer, input)
      .autoOrient()
      .resize(boxW, boxH, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rotated = await sharp(resized.data, {
      raw: { width: resized.info.width, height: resized.info.height, channels: 4 },
    })
      .rotate(placement.rotate, { background: TRANSPARENT })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const left = Math.round(photo.x + boxW / 2 - rotated.info.width / 2);
    const top = Math.round(photo.y + boxH / 2 - rotated.info.height / 2);
    layer = await placeInRegion(
      { data: rotated.data, width: rotated.info.width, height: rotated.info.height },
      left - region.x,
      top - region.y,
      region
    );
  }
  if (!layer) return null;

  // `dest-in` keeps only the pixels covered by the cutout shape.
  const masked = await sharp(layer, { raw: { width: region.w, height: region.h, channels: 4 } })
    .composite([{ input: maskSvg(rect, region), blend: 'dest-in' }])
    .raw()
    .toBuffer();

  return { input: masked, raw: { width: region.w, height: region.h, channels: 4 }, left: region.x, top: region.y };
}

/**
 * Copies a raw RGBA bitmap into a transparent region-sized bitmap at (dx, dy),
 * clipping whatever falls outside. Pure buffer work — no codec involved.
 */
async function placeInRegion(src, dx, dy, region) {
  const out = Buffer.alloc(region.w * region.h * 4);
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(region.w, dx + src.width);
  const y1 = Math.min(region.h, dy + src.height);
  if (x1 <= x0 || y1 <= y0) return null;
  const rowBytes = (x1 - x0) * 4;
  for (let y = y0; y < y1; y += 1) {
    const srcStart = ((y - dy) * src.width + (x0 - dx)) * 4;
    src.data.copy(out, (y * region.w + x0) * 4, srcStart, srcStart + rowBytes);
  }
  return out;
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Composites one participant image.
 *
 * @param {object} args
 * @param {Buffer} args.photoBuffer  Raw upload or camera capture.
 * @param {Buffer|null} [args.frameBuffer]  Flattened frame PNG with a transparent cutout.
 * @param {string} [args.frameKey]  Stable id of the frame (its asset id), for caching.
 * @param {() => Promise<Buffer|null>} [args.loadFrameBuffer]  Reads the frame on a cache miss.
 * @param {string} args.aspectRatio
 * @param {object} args.cutout  Template cutout JSON (untrusted, normalized here).
 * @param {{text:string, style:object}|null} args.badge
 * @param {object} args.placement  { left, top, width, height, rotate } (untrusted).
 * @param {'jpeg'|'png'} [args.format]
 */
export async function composeImage({
  photoBuffer,
  frameBuffer,
  frameKey,
  loadFrameBuffer,
  aspectRatio = '1:1',
  cutout,
  badge,
  placement,
  format = 'jpeg',
  quality = 90,
}) {
  const { w: width, h: height } = ratioDims(aspectRatio);
  const rect = cutoutRect(cutout, width, height);
  const safePlacement = sanitizePlacement(placement, rect, width, height);

  const [photo, frame] = await Promise.all([
    photoLayer(photoBuffer, rect, safePlacement, width, height),
    frameLayer({ frameBuffer, frameKey, loadFrameBuffer }, width, height),
  ]);

  const layers = [];
  if (photo) layers.push(photo);
  layers.push({ input: frame.data, raw: frame.raw, left: 0, top: 0 });
  if (badge?.text) layers.push(badgeOverlay(badge.text, badge.style, width, height));

  // JPEG has no alpha: start from white so see-through parts of a frame read
  // as white, exactly as they do on the phone.
  const isJpeg = format === 'jpeg';
  const pipeline = blankCanvas(width, height, isJpeg ? WHITE : TRANSPARENT).composite(layers);
  const buffer = isJpeg
    ? await pipeline.jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer()
    : await pipeline.png({ compressionLevel: 6, adaptiveFiltering: false }).toBuffer();

  return { buffer, width, height, mime: isJpeg ? 'image/jpeg' : 'image/png' };
}

/**
 * ED-11 / §10.3: the downloadable blank frame — correct size, transparent
 * cutout punched out, so designers can decorate around it in any external tool.
 */
export async function renderBlankFrame({ aspectRatio = '1:1', cutout, label = '' }) {
  const { w: width, h: height } = ratioDims(aspectRatio);
  const rect = cutoutRect(cutout, width, height);
  const inset = Math.round(Math.min(width, height) * 0.03);
  const captionSize = Math.round(height * 0.03);

  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <rect width="${width}" height="${height}" fill="#ffffff"/>
       <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}"
         rx="${inset}" ry="${inset}" fill="none" stroke="#c8ccd1" stroke-width="${Math.round(width * 0.004)}" stroke-dasharray="${inset / 2} ${inset / 3}"/>
       ${
         label
           ? `<text x="${width / 2}" y="${height - inset * 2}" text-anchor="middle"
               font-family="${BADGE_FONT}" font-size="${captionSize}" fill="#54595d">${escapeXml(label)}</text>`
           : ''
       }
     </svg>`
  );

  // dest-out punches the cutout back to full transparency (§10.3 step 2).
  const full = { x: 0, y: 0, w: width, h: height };
  const buffer = await sharp(base)
    .composite([{ input: maskSvg(rect, full), blend: 'dest-out' }])
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { buffer, width, height, cutout: rect };
}
