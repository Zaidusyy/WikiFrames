import { badgeLayout, containRect, cutoutRect, ratioDims, sanitizePlacement } from './geometry';

/**
 * The on-device compositor.
 *
 * Draws photo → cutout mask → frame → badge with exactly the geometry the
 * server uses (geometry.js), so an image made on a participant's phone is the
 * same image the server would have made. When a participant does not want
 * their image stored, this is the only renderer involved: the photo is
 * decoded, framed and encoded right here, and never leaves the device.
 *
 * Browser-only (canvas, createImageBitmap). Imported by client components.
 */

export const BADGE_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

// A placed photo is at most ~3× the cutout, so nothing bigger is ever needed —
// decoding a 50 MP original at full size would only waste the phone's memory.
const MAX_DECODE_SIDE = 3200;
const PREVIEW_DECODE_SIDE = 1600;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be loaded'));
    img.src = src;
  });
}

async function bitmapAtMost(file, maxSide, naturalW, naturalH) {
  const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
  const options = { imageOrientation: 'from-image' };
  if (scale < 1) {
    options.resizeWidth = Math.round(naturalW * scale);
    options.resizeHeight = Math.round(naturalH * scale);
    options.resizeQuality = 'high';
  }
  return createImageBitmap(file, options);
}

/**
 * Decodes a photo once at two sizes: a light one for the live, draggable
 * preview and a full one for the final render. EXIF orientation is applied, so
 * phone portraits are upright; the decoded pixels carry no metadata at all.
 */
export async function decodePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error('empty image');

    let full = img;
    let preview = img;
    if (typeof createImageBitmap === 'function') {
      try {
        full = await bitmapAtMost(file, MAX_DECODE_SIDE, width, height);
        preview = await bitmapAtMost(file, PREVIEW_DECODE_SIDE, width, height);
      } catch {
        // Older engines reject the resize options — the <img> works everywhere.
        full = img;
        preview = img;
      }
    }
    return { full, preview, width, height, naturalRatio: width / height, objectUrl: url };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** Frees decoded bitmaps and the object URL as soon as they are not needed. */
export function releasePhoto(photo) {
  if (!photo) return;
  for (const bitmap of new Set([photo.full, photo.preview])) {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
  if (photo.objectUrl) URL.revokeObjectURL(photo.objectUrl);
}

function cutoutPath(ctx, rect) {
  ctx.beginPath();
  if (rect.shape === 'circle') {
    ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
  } else if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.radius);
  } else {
    const r = rect.radius;
    ctx.moveTo(rect.x + r, rect.y);
    ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, r);
    ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, r);
    ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y, r);
    ctx.arcTo(rect.x, rect.y, rect.x + rect.w, rect.y, r);
    ctx.closePath();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawBadge(ctx, text, style, width, height) {
  const b = badgeLayout(text, style, width, height);
  ctx.save();
  ctx.globalAlpha = b.opacity;
  ctx.fillStyle = b.background;
  roundRectPath(ctx, b.left, b.top, b.boxW, b.boxH, b.radius);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Same box as the server; only the type is fitted to the real font here so
  // an unusually wide face can never spill out of the chip.
  let fontSize = b.fontSize;
  ctx.font = `700 ${fontSize}px ${BADGE_FONT}`;
  const room = b.boxW - b.padX * 1.2;
  const measured = ctx.measureText(text).width;
  if (measured > room) {
    fontSize = Math.max(8, Math.floor((fontSize * room) / measured));
    ctx.font = `700 ${fontSize}px ${BADGE_FONT}`;
  }
  ctx.fillStyle = b.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, b.left + b.boxW / 2, b.top + b.boxH / 2 + fontSize * 0.04);
  ctx.restore();
}

function drawFallbackFrame(ctx, width, height) {
  const inset = Math.round(Math.min(width, height) * 0.03);
  ctx.save();
  ctx.strokeStyle = '#3366cc';
  ctx.lineWidth = Math.round(Math.min(width, height) * 0.012);
  roundRectPath(ctx, inset, inset, width - inset * 2, height - inset * 2, inset);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws one composite into `ctx`, which must already be sized to the canvas
 * dimensions times `scale` (scale < 1 for a fast preview).
 */
export function drawComposite(
  ctx,
  { photo, photoWidth, photoHeight, frame, aspectRatio, cutout, badge, placement, scale = 1, background = null }
) {
  const { w: width, h: height } = ratioDims(aspectRatio);
  const rect = cutoutRect(cutout, width, height);

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  if (photo && placement) {
    const p = sanitizePlacement(placement, rect, width, height);
    const fitted = containRect(p.width, p.height, photoWidth / photoHeight);
    ctx.save();
    cutoutPath(ctx, rect);
    ctx.clip();
    ctx.translate(p.left + p.width / 2, p.top + p.height / 2);
    ctx.rotate((p.rotate * Math.PI) / 180);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, -fitted.w / 2, -fitted.h / 2, fitted.w, fitted.h);
    ctx.restore();
  }

  if (frame) ctx.drawImage(frame, 0, 0, width, height);
  else drawFallbackFrame(ctx, width, height);

  if (badge?.text) drawBadge(ctx, badge.text, badge.style, width, height);
  ctx.restore();
}

/**
 * Renders the final image at full resolution and encodes it.
 * JPEG starts from white, exactly like the server, so see-through parts of a
 * frame come out white rather than black.
 */
export async function renderComposite(options, { type = 'image/jpeg', quality = 0.92 } = {}) {
  const { w: width, h: height } = ratioDims(options.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawComposite(ctx, { ...options, scale: 1, background: type === 'image/jpeg' ? '#ffffff' : null });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  // Release the backing store immediately; phones are memory-constrained.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('This browser could not encode the image.');
  return { blob, width, height, mime: blob.type || type };
}
