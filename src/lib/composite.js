import sharp from 'sharp';
import { ratioDims } from './config';

// Server-side compositing (PDR §5.3, §14.1 step 7).
//
// The canvas editor keeps its layer JSON for editing, but it also exports a
// flattened frame PNG with a transparent cutout. That PNG is the single source
// of truth here, which is what makes output identical across devices: the phone
// preview and this renderer draw the same three things in the same order —
// photo → cutout mask → frame → badge.

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

export const DEFAULT_CUTOUT = { shape: 'circle', xPct: 0.5, yPct: 0.42, sizePct: 0.52 };
export const DEFAULT_BADGE = { xPct: 0.5, yPct: 0.86, fontPct: 0.045 };

function blankCanvas(width, height) {
  return sharp({
    create: { width, height, channels: 4, background: TRANSPARENT },
  });
}

/**
 * Clips a layer to the canvas so sharp never sees a negative offset — which it
 * rejects, and which happens constantly when a participant zooms their photo
 * past the cutout edges.
 */
async function placeOnCanvas(buffer, left, top, canvasWidth, canvasHeight) {
  const meta = await sharp(buffer).metadata();
  const srcLeft = Math.max(0, Math.round(-left));
  const srcTop = Math.max(0, Math.round(-top));
  const dstLeft = Math.max(0, Math.round(left));
  const dstTop = Math.max(0, Math.round(top));
  const width = Math.min(meta.width - srcLeft, canvasWidth - dstLeft);
  const height = Math.min(meta.height - srcTop, canvasHeight - dstTop);
  if (width <= 0 || height <= 0) return null;

  const cropped =
    srcLeft || srcTop || width !== meta.width || height !== meta.height
      ? await sharp(buffer)
          .extract({ left: srcLeft, top: srcTop, width, height })
          .png()
          .toBuffer()
      : buffer;

  return { input: cropped, left: dstLeft, top: dstTop };
}

function cutoutRect(cutout, width, height) {
  const c = { ...DEFAULT_CUTOUT, ...(cutout || {}) };
  const size = Math.round(Math.min(width, height) * (c.sizePct ?? DEFAULT_CUTOUT.sizePct));
  const w = Math.round(c.widthPx ?? size);
  const h = Math.round(c.heightPx ?? size);
  const cx = Math.round((c.xPct ?? 0.5) * width);
  const cy = Math.round((c.yPct ?? 0.5) * height);
  return { shape: c.shape || 'circle', radius: c.radius ?? 0, x: cx - w / 2, y: cy - h / 2, w, h };
}

function maskSvg(rect, width, height) {
  const shape =
    rect.shape === 'circle'
      ? `<ellipse cx="${rect.x + rect.w / 2}" cy="${rect.y + rect.h / 2}" rx="${rect.w / 2}" ry="${rect.h / 2}" fill="#fff"/>`
      : `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="${rect.radius}" ry="${rect.radius}" fill="#fff"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shape}</svg>`
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

/** BADGE-1/2: the role chip rendered into its designated zone. */
function badgeSvg(text, style, width, height) {
  const s = { ...DEFAULT_BADGE, ...(style || {}) };
  const fontSize = Math.round(height * (s.fontPct ?? DEFAULT_BADGE.fontPct));
  const padX = Math.round(fontSize * 0.9);
  const padY = Math.round(fontSize * 0.5);
  // Rough advance width; good enough for a single-line chip and avoids shipping
  // a font-metrics dependency into the render path.
  const textWidth = Math.round([...text].length * fontSize * 0.56);
  const boxW = Math.min(width - 2 * padX, textWidth + padX * 2);
  const boxH = fontSize + padY * 2;
  const bg = s.background || '#3366cc';
  const fg = s.color || '#ffffff';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}">
    <rect x="0" y="0" width="${boxW}" height="${boxH}" rx="${boxH / 2}" ry="${boxH / 2}" fill="${bg}" fill-opacity="${s.opacity ?? 0.95}"/>
    <text x="${boxW / 2}" y="${boxH / 2}" dominant-baseline="central" text-anchor="middle"
      font-family="system-ui, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}"
      font-weight="700" fill="${fg}">${escapeXml(text)}</text>
  </svg>`;

  const left = Math.round((s.xPct ?? 0.5) * width - boxW / 2);
  const top = Math.round((s.yPct ?? 0.86) * height - boxH / 2);
  return { buffer: Buffer.from(svg), left, top };
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
 * Composites one participant image.
 *
 * @param {Buffer} photoBuffer  Raw upload/camera capture.
 * @param {Buffer|null} frameBuffer  Flattened frame PNG with a transparent cutout.
 * @param {object} opts  { aspectRatio, cutout, badge:{text,style}, placement, format, quality }
 */
export async function composeImage({
  photoBuffer,
  frameBuffer,
  aspectRatio = '1:1',
  cutout,
  badge,
  placement,
  format = 'png',
  quality = 90,
}) {
  const { w: width, h: height } = ratioDims(aspectRatio);
  const rect = cutoutRect(cutout, width, height);

  // SEC-2: re-encoding through sharp strips EXIF/GPS and any embedded payload.
  // `.rotate()` with no argument first applies the EXIF orientation, so portrait
  // phone photos are not silently rendered sideways.
  const oriented = await sharp(photoBuffer, { failOn: 'none' }).rotate().png().toBuffer();

  const p = placement || {};
  const boxW = Math.max(1, Math.round(p.width ?? rect.w));
  const boxH = Math.max(1, Math.round(p.height ?? rect.h));
  const left = p.left ?? rect.x;
  const top = p.top ?? rect.y;

  let photoLayer = await sharp(oriented)
    .resize(boxW, boxH, { fit: p.fit === 'contain' ? 'contain' : 'cover', background: TRANSPARENT })
    .png()
    .toBuffer();

  let placedW = boxW;
  let placedH = boxH;
  if (p.rotate) {
    photoLayer = await sharp(photoLayer)
      .rotate(p.rotate, { background: TRANSPARENT })
      .png()
      .toBuffer();
    const meta = await sharp(photoLayer).metadata();
    placedW = meta.width;
    placedH = meta.height;
  }

  // Rotation grows the bitmap around its centre; re-centre so the photo does not
  // drift out of the cutout.
  const placed = await placeOnCanvas(
    photoLayer,
    left - (placedW - boxW) / 2,
    top - (placedH - boxH) / 2,
    width,
    height
  );

  const photoCanvas = await blankCanvas(width, height)
    .composite(placed ? [placed] : [])
    .png()
    .toBuffer();

  // `dest-in` keeps only the pixels covered by the cutout shape.
  const maskedPhoto = await sharp(photoCanvas)
    .composite([{ input: maskSvg(rect, width, height), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const frame = frameBuffer
    ? await sharp(frameBuffer)
        .resize(width, height, { fit: 'fill' })
        .png()
        .toBuffer()
    : await sharp(fallbackFrameSvg(width, height)).png().toBuffer();

  const layers = [
    { input: maskedPhoto },
    { input: frame },
  ];

  if (badge?.text) {
    const chip = badgeSvg(badge.text, badge.style, width, height);
    const placedBadge = await placeOnCanvas(
      await sharp(chip.buffer).png().toBuffer(),
      chip.left,
      chip.top,
      width,
      height
    );
    if (placedBadge) layers.push(placedBadge);
  }

  const pipeline = blankCanvas(width, height).composite(layers);
  const buffer =
    format === 'jpeg'
      ? await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer()
      : await pipeline.png({ compressionLevel: 9 }).toBuffer();

  return { buffer, width, height, mime: format === 'jpeg' ? 'image/jpeg' : 'image/png' };
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
               font-family="system-ui, sans-serif" font-size="${captionSize}" fill="#54595d">${escapeXml(label)}</text>`
           : ''
       }
     </svg>`
  );

  // dest-out punches the cutout back to full transparency (§10.3 step 2).
  const buffer = await sharp(base)
    .png()
    .composite([{ input: maskSvg(rect, width, height), blend: 'dest-out' }])
    .png()
    .toBuffer();

  return { buffer, width, height, cutout: rect };
}

export { cutoutRect };
