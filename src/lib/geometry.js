/**
 * Frame geometry, shared verbatim by every renderer.
 *
 * The server compositor (composite.js), the on-device compositor
 * (compose-client.js), the participant preview and the canvas editor all
 * import from here. One implementation of "where is the hole, how big is the
 * badge, where does the photo go" is what keeps a stored gallery image, an
 * image rendered on a phone and the preview a participant dragged into place
 * identical.
 *
 * Isomorphic and dependency-free: no Node APIs, no DOM, no imports.
 *
 * Every function that reads template JSON treats it as untrusted. Organizers
 * (and anyone holding their session) control it, and its numbers end up inside
 * SVG markup and image-resize calls on the server, so everything is coerced to
 * a finite, clamped number or a strict hex colour before it is used.
 */

export const ASPECT_RATIOS = {
  '9:16': { w: 1080, h: 1920, label: 'Story / Reel' },
  '4:5': { w: 1080, h: 1350, label: 'Feed portrait' },
  '1:1': { w: 1080, h: 1080, label: 'Square' },
  '16:9': { w: 1920, h: 1080, label: 'Landscape' },
};

export function ratioDims(ratio) {
  return ASPECT_RATIOS[ratio] || ASPECT_RATIOS['1:1'];
}

export const DEFAULT_CUTOUT = Object.freeze({ shape: 'circle', xPct: 0.5, yPct: 0.42, sizePct: 0.52 });
export const DEFAULT_BADGE = Object.freeze({ xPct: 0.5, yPct: 0.86, fontPct: 0.045 });
export const DEFAULT_BADGE_BACKGROUND = '#3366cc';
export const DEFAULT_BADGE_COLOR = '#ffffff';

/** The participant's zoom slider range — also the server-side clamp. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ROTATE_LIMIT = 45;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A strict `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, or the fallback. */
export function safeColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

/** Coerces to a finite number inside [min, max], or returns the fallback. */
export function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Untrusted template JSON in; a cutout that is safe to use anywhere out. */
export function normalizeCutout(input) {
  const c = input && typeof input === 'object' ? input : {};
  const out = {
    shape: c.shape === 'rounded' ? 'rounded' : 'circle',
    // A cutout may legitimately hang off an edge, but not into the next county.
    xPct: clampNumber(c.xPct, -0.5, 1.5, DEFAULT_CUTOUT.xPct),
    yPct: clampNumber(c.yPct, -0.5, 1.5, DEFAULT_CUTOUT.yPct),
    sizePct: clampNumber(c.sizePct, 0.05, 1.5, DEFAULT_CUTOUT.sizePct),
    radius: clampNumber(c.radius, 0, 2000, 0),
  };
  const widthPx = clampNumber(c.widthPx, 16, 4000, null);
  const heightPx = clampNumber(c.heightPx, 16, 4000, null);
  if (widthPx !== null) out.widthPx = widthPx;
  if (heightPx !== null) out.heightPx = heightPx;
  return out;
}

/** Untrusted template JSON in; badge style safe for SVG and canvas out. */
export function normalizeBadge(input) {
  const b = input && typeof input === 'object' ? input : {};
  return {
    xPct: clampNumber(b.xPct, -0.5, 1.5, DEFAULT_BADGE.xPct),
    yPct: clampNumber(b.yPct, -0.5, 1.5, DEFAULT_BADGE.yPct),
    fontPct: clampNumber(b.fontPct, 0.01, 0.2, DEFAULT_BADGE.fontPct),
    background: safeColor(b.background, DEFAULT_BADGE_BACKGROUND),
    color: safeColor(b.color, DEFAULT_BADGE_COLOR),
    opacity: clampNumber(b.opacity, 0, 1, 0.95),
  };
}

/** The photo hole in canvas pixels, plus its centre. */
export function cutoutRect(cutout, width, height) {
  const c = normalizeCutout(cutout);
  const size = Math.round(Math.min(width, height) * c.sizePct);
  const w = Math.round(c.widthPx ?? size);
  const h = Math.round(c.heightPx ?? size);
  const cx = Math.round(c.xPct * width);
  const cy = Math.round(c.yPct * height);
  return {
    shape: c.shape,
    radius: Math.min(c.radius, w / 2, h / 2),
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    cx,
    cy,
  };
}

/**
 * Approximate advance width of `text` in ems, for a bold UI sans-serif.
 *
 * Shipping font metrics into the render path is not worth it for a one-line
 * chip, but a flat "0.56 em per character" made long badges overflow and short
 * ones float in empty pill. A handful of width classes gets within a few
 * percent of real system fonts — and because the server and the phone use this
 * same function, they always agree on the size of the chip.
 */
export function estimateTextWidthEm(text) {
  let em = 0;
  for (const ch of Array.from(String(text))) {
    const cp = ch.codePointAt(0);
    if (ch === ' ') em += 0.28;
    else if ('il.,:;\'|!`ıj'.includes(ch)) em += 0.3;
    else if ('ftrI()[]{}-'.includes(ch)) em += 0.38;
    else if ('mwMW@%'.includes(ch)) em += 0.88;
    else if (ch >= 'A' && ch <= 'Z') em += 0.68;
    else if (ch >= '0' && ch <= '9') em += 0.58;
    else if (cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf)) em += 1.18; // emoji
    else if (cp >= 0xfe00 && cp <= 0xfe0f) em += 0; // variation selectors
    else if (cp === 0x200d) em += 0; // zero-width joiner
    else if (cp >= 0x2e80 && cp <= 0xffef) em += 1.0; // CJK and full-width forms
    else em += 0.56;
  }
  return em;
}

/**
 * BADGE-1/2: the role chip's box. Shrinks the type, never the text, when a long
 * role would otherwise run off the canvas, and keeps the chip fully on canvas.
 */
export function badgeLayout(text, style, width, height) {
  const s = normalizeBadge(style);
  let fontSize = Math.max(8, Math.round(height * s.fontPct));
  const textEm = estimateTextWidthEm(text);
  const maxBoxW = Math.round(width * 0.94);

  const boxFor = (size) => {
    const padX = Math.round(size * 0.9);
    const padY = Math.round(size * 0.5);
    return { padX, padY, boxW: Math.round(textEm * size) + padX * 2, boxH: size + padY * 2 };
  };

  let box = boxFor(fontSize);
  if (box.boxW > maxBoxW) {
    fontSize = Math.max(8, Math.floor((fontSize * maxBoxW) / box.boxW));
    box = boxFor(fontSize);
  }
  const boxW = Math.min(box.boxW, maxBoxW);
  const left = Math.round(Math.min(Math.max(0, s.xPct * width - boxW / 2), width - boxW));
  const top = Math.round(Math.min(Math.max(0, s.yPct * height - box.boxH / 2), height - box.boxH));

  return {
    ...s,
    fontSize,
    padX: box.padX,
    padY: box.padY,
    boxW,
    boxH: box.boxH,
    left,
    top,
    radius: box.boxH / 2,
  };
}

/** The zoom at which a photo of this shape just covers the cutout. */
export function coverZoom(rect, naturalRatio) {
  const ratio = clampNumber(naturalRatio, 0.05, 20, 1);
  return Math.min(ZOOM_MAX, Math.max(1, (rect.h * ratio) / rect.w));
}

/** Normalizes the participant's fit controls. */
export function normalizeFit(fit) {
  const f = fit && typeof fit === 'object' ? fit : {};
  return {
    zoom: clampNumber(f.zoom, ZOOM_MIN, ZOOM_MAX, 1),
    panX: clampNumber(f.panX, -1.5, 1.5, 0),
    panY: clampNumber(f.panY, -1.5, 1.5, 0),
    rotate: clampNumber(f.rotate, -ROTATE_LIMIT, ROTATE_LIMIT, 0),
  };
}

/**
 * Translates the on-screen fit into canvas pixels.
 *
 * The photo is sized by *width* (the cutout width times the zoom) and its
 * height follows its own aspect ratio, so the box always has the photo's shape
 * and nothing is ever stretched.
 */
export function computePlacement({ aspectRatio, cutout, fit, naturalRatio }) {
  const { w: width, h: height } = ratioDims(aspectRatio);
  const rect = cutoutRect(cutout, width, height);
  const f = normalizeFit(fit);
  const ratio = clampNumber(naturalRatio, 0.05, 20, 1);

  const boxW = rect.w * f.zoom;
  const boxH = boxW / ratio;
  const centerX = rect.cx + f.panX * width;
  const centerY = rect.cy + f.panY * height;

  return {
    left: Math.round(centerX - boxW / 2),
    top: Math.round(centerY - boxH / 2),
    width: Math.max(1, Math.round(boxW)),
    height: Math.max(1, Math.round(boxH)),
    rotate: f.rotate,
  };
}

/**
 * Server-side guard for a placement that arrived over the network. A client
 * may send anything, and every pixel of `width × height` becomes memory inside
 * the image pipeline, so the box is held to what the zoom slider can produce.
 */
export function sanitizePlacement(placement, rect, width, height) {
  const p = placement && typeof placement === 'object' ? placement : {};
  const maxSide = Math.max(rect.w, rect.h) * ZOOM_MAX * 1.1;
  const maxArea = 24_000_000;

  let w = clampNumber(p.width, 1, maxSide, rect.w);
  let h = clampNumber(p.height, 1, maxSide * 20, rect.h);
  if (w * h > maxArea) {
    const k = Math.sqrt(maxArea / (w * h));
    w *= k;
    h *= k;
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  const left = Math.round(clampNumber(p.left, -w - width, width * 2, rect.x));
  const top = Math.round(clampNumber(p.top, -h - height, height * 2, rect.y));
  const rotate = clampNumber(p.rotate, -ROTATE_LIMIT, ROTATE_LIMIT, 0);

  return { left, top, width: w, height: h, rotate };
}

/**
 * Size of an image of `naturalRatio` fitted inside a box without distortion,
 * centred — the `contain` rule both renderers apply inside the placement box.
 */
export function containRect(boxW, boxH, naturalRatio) {
  const ratio = clampNumber(naturalRatio, 0.05, 20, boxW / boxH || 1);
  let w = boxW;
  let h = boxW / ratio;
  if (h > boxH) {
    h = boxH;
    w = boxH * ratio;
  }
  return { w, h, dx: (boxW - w) / 2, dy: (boxH - h) / 2 };
}

/** Intersection of two `{x, y, w, h}` rectangles, or null. */
export function intersectRect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}
