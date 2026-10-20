import { parseColor, toHex } from '@/lib/editor/contrast';
import { isImage, isText, layerKind } from './fabric-setup';

// Bridges the live Fabric canvas and the pure modules in src/lib/editor:
// a plain-data description of the scene for the health check and magic
// resize, the flattened frame export, and the off-screen renderer.

/** Hidden from the exported frame: the server draws the real badge there. */
export function excludedFromFrame(obj) {
  return obj.wfRole === 'badge' || obj.wfHelper === true;
}

function sampleCanvas(canvas, dims) {
  // One low-resolution render of everything *except* text, the badge zone
  // and the cutout: what each text layer is actually sitting on.
  const scale = Math.min(1, 360 / Math.max(dims.w, dims.h));
  const multiplier = (dims.w * scale) / canvas.getWidth();
  try {
    const el = canvas.toCanvasElement(multiplier, {
      filter: (o) => o.visible !== false && !isText(o) && o.wfRole !== 'badge' && o.wfRole !== 'cutout' && !o.wfHelper,
    });
    const ctx = el.getContext('2d', { willReadFrequently: true });
    return { ctx, scale, width: el.width, height: el.height };
  } catch {
    return null;
  }
}

/** Average colour under a box, with transparency read as white (as exported). */
function averageColorUnder(sample, bbox, fallback) {
  if (!sample) return fallback;
  const x = Math.max(0, Math.floor(bbox.x * sample.scale));
  const y = Math.max(0, Math.floor(bbox.y * sample.scale));
  const w = Math.min(sample.width - x, Math.ceil(bbox.w * sample.scale));
  const h = Math.min(sample.height - y, Math.ceil(bbox.h * sample.scale));
  if (w <= 0 || h <= 0) return fallback;
  const { data } = sample.ctx.getImageData(x, y, w, h);
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    r += data[i] * a + 255 * (1 - a);
    g += data[i + 1] * a + 255 * (1 - a);
    b += data[i + 2] * a + 255 * (1 - a);
  }
  return toHex({ r: r / n, g: g / n, b: b / n });
}

function solidFill(fill) {
  if (typeof fill !== 'string') return null;
  const c = parseColor(fill);
  return c ? toHex(c) : null;
}

/** A plain-data snapshot of the canvas for analyzeFrame(). */
export function describeScene(canvas, { dims, aspectRatio, editable }) {
  const objects = canvas.getObjects();
  const needsSample = objects.some((o) => isText(o) && o.visible !== false);
  const sample = needsSample ? sampleCanvas(canvas, dims) : null;
  const background = solidFill(canvas.backgroundColor) || '#ffffff';

  return {
    width: dims.w,
    height: dims.h,
    aspectRatio,
    editable,
    background,
    objects: objects.map((obj, index) => {
      const bbox = obj.getBoundingRect();
      const kind = layerKind(obj);
      const entry = {
        index,
        role: obj.wfRole || kind,
        kind: kind === 'text' ? 'text' : kind === 'image' ? 'image' : kind,
        name: obj.wfName,
        visible: obj.visible !== false,
        bbox: { x: bbox.left, y: bbox.top, w: bbox.width, h: bbox.height },
        attribution: obj.wfAttribution || null,
        isCredit: obj.wfRole === 'credit',
      };
      if (isText(obj)) {
        entry.text = obj.text;
        entry.fontSize = (obj.fontSize || 0) * (obj.scaleY || 1);
        entry.bold = obj.fontWeight === 'bold' || Number(obj.fontWeight) >= 600;
        entry.color = solidFill(obj.fill);
        entry.behind = averageColorUnder(sample, entry.bbox, background);
      }
      if (isImage(obj)) {
        const el = obj.getElement?.();
        const natural = el?.naturalWidth || el?.width || obj.width;
        entry.upscale = natural ? obj.getScaledWidth() / natural : 1;
      }
      return entry;
    }),
  };
}

/** Bounding-box items for planMagicResize(). */
export function resizeItems(canvas) {
  return canvas.getObjects().map((obj) => {
    const r = obj.getBoundingRect();
    return {
      role: obj.wfRole || layerKind(obj),
      kind: layerKind(obj),
      bbox: { x: r.left, y: r.top, w: r.width, h: r.height },
      left: obj.left,
      top: obj.top,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
    };
  });
}

/**
 * Flattens the design to the PNG every renderer uses, at full resolution.
 *
 * The cutout switches to `destination-out` so it punches a genuine
 * transparent hole, and the badge zone is left out because the real badge is
 * drawn there per participant. Both are restored afterwards.
 */
export function exportFrameDataUrl(canvas, dims) {
  const cutouts = canvas.getObjects().filter((o) => o.wfRole === 'cutout');
  const saved = cutouts.map((o) => [o, { globalCompositeOperation: o.globalCompositeOperation, stroke: o.stroke, strokeWidth: o.strokeWidth, fill: o.fill }]);
  for (const [o] of saved) o.set({ globalCompositeOperation: 'destination-out', stroke: null, strokeWidth: 0, fill: '#000000' });
  try {
    return canvas.toDataURL({
      format: 'png',
      multiplier: dims.w / canvas.getWidth(),
      enableRetinaScaling: false,
      filter: (o) => !excludedFromFrame(o) && o.visible !== false,
    });
  } finally {
    for (const [o, props] of saved) o.set(props);
    canvas.requestRenderAll();
  }
}

/**
 * Renders layer JSON off screen and flattens it — used by Magic Resize.
 * Returns the frame and the cutout/badge geometry measured from the result.
 */
export async function renderJsonToFrame(fabric, json, dims, badgeColors) {
  const el = document.createElement('canvas');
  const canvas = new fabric.StaticCanvas(el, {
    width: dims.w,
    height: dims.h,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });
  try {
    await canvas.loadFromJSON(json);
    canvas.renderAll();
    return {
      dataUrl: exportFrameDataUrl(canvas, dims),
      cutout: cutoutGeometry(canvas, dims),
      badge: badgeGeometry(canvas, dims, badgeColors),
    };
  } finally {
    canvas.dispose();
  }
}

/** Template cutout JSON from the cutout layer. */
export function cutoutGeometry(canvas, dims) {
  const cutout = canvas.getObjects().find((o) => o.wfRole === 'cutout');
  if (!cutout) return undefined;
  const r = cutout.getBoundingRect();
  // The dashed outline is drawn outside the shape; measure the fill.
  const stroke = (cutout.strokeWidth || 0) * (cutout.scaleX || 1);
  const w = Math.max(1, r.width - stroke);
  const h = Math.max(1, r.height - stroke);
  return {
    shape: cutout.wfShape === 'rounded' ? 'rounded' : 'circle',
    radius: Math.round((cutout.rx || 0) * (cutout.scaleX || 1)),
    xPct: (r.left + r.width / 2) / dims.w,
    yPct: (r.top + r.height / 2) / dims.h,
    sizePct: Math.min(w, h) / Math.min(dims.w, dims.h),
    widthPx: Math.round(w),
    heightPx: Math.round(h),
  };
}

/** Template badge JSON from the badge zone, colours included. */
export function badgeGeometry(canvas, dims, fallbackColors = {}) {
  const badge = canvas.getObjects().find((o) => o.wfRole === 'badge');
  if (!badge) return undefined;
  const r = badge.getBoundingRect();
  return {
    xPct: (r.left + r.width / 2) / dims.w,
    yPct: (r.top + r.height / 2) / dims.h,
    fontPct: (r.height * 0.45) / dims.h,
    background: badge.wfBadgeBackground || fallbackColors.background || '#3366cc',
    color: badge.wfBadgeColor || fallbackColors.color || '#ffffff',
  };
}

/** Attribution for every openly licensed image in the design. */
export function collectCredits(canvas) {
  const seen = new Set();
  const credits = [];
  for (const obj of canvas.getObjects()) {
    const a = obj.wfAttribution;
    if (!a || seen.has(a.filePage || a.title)) continue;
    seen.add(a.filePage || a.title);
    credits.push({
      title: a.title || a.fileName || 'Untitled',
      author: a.author || 'Unknown',
      license: a.license || 'See source',
      licenseUrl: a.licenseUrl || null,
      sourceUrl: a.filePage || null,
    });
  }
  return credits;
}
