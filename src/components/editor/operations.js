import { bestContrastColor } from '@/lib/editor/contrast';
import { SAFE_MARGIN } from '@/lib/editor/health';
import { isActiveSelection, isText } from './fabric-setup';

// Canvas operations, kept out of the React component so they read as plain
// functions of (fabric, canvas, dims). Every new object is created with an
// explicit top-left origin (Fabric 7 defaults to the centre).

export const WIKI_PALETTE = [
  '#3366cc', '#2a4b8d', '#00af89', '#ffcc33', '#d73333',
  '#6b4ba1', '#202122', '#54595d', '#c8ccd1', '#ffffff',
];

const ORIGIN = { originX: 'left', originY: 'top' };

export function centreOf(dims) {
  return { x: dims.w / 2, y: dims.h / 2 };
}

/** Moves an object so its bounding box's top-left lands at (x, y). */
export function moveBoxTo(obj, x, y) {
  const r = obj.getBoundingRect();
  obj.set({ left: obj.left + (x - r.left), top: obj.top + (y - r.top) });
  obj.setCoords();
}

export function createText(fabric, dims, overrides = {}) {
  return new fabric.Textbox(overrides.text ?? 'Double-click to edit', {
    ...ORIGIN,
    left: dims.w * 0.15,
    top: dims.h * 0.12,
    width: dims.w * 0.7,
    fontSize: Math.round(Math.min(dims.w, dims.h) * 0.06),
    fill: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.15,
    wfRole: 'text',
    wfName: 'Text',
    ...overrides,
  });
}

export function createShape(fabric, dims, kind) {
  const size = Math.min(dims.w, dims.h) * 0.2;
  const common = {
    ...ORIGIN,
    left: dims.w / 2 - size / 2,
    top: dims.h / 2 - size / 2,
    fill: '#ffcc33',
    strokeUniform: true,
    wfRole: 'shape',
  };
  if (kind === 'circle') return new fabric.Circle({ ...common, radius: size / 2, wfName: 'Circle' });
  if (kind === 'line') {
    return new fabric.Line([0, 0, size * 2, 0], {
      ...common,
      left: dims.w / 2 - size,
      stroke: '#ffcc33',
      strokeWidth: Math.max(4, Math.round(size * 0.05)),
      wfName: 'Line',
    });
  }
  return new fabric.Rect({ ...common, width: size * 1.6, height: size * 0.5, rx: 12, ry: 12, wfName: 'Rectangle' });
}

/** ED-2 — the photo cutout. Exactly one per template. */
export function createCutout(fabric, dims, shape = 'circle', geometry) {
  const size = Math.min(dims.w, dims.h) * (geometry?.sizePct ?? 0.52);
  const w = geometry?.widthPx ?? size;
  const h = geometry?.heightPx ?? size;
  const cx = (geometry?.xPct ?? 0.5) * dims.w;
  const cy = (geometry?.yPct ?? 0.42) * dims.h;
  const stroke = Math.max(4, Math.round(Math.min(dims.w, dims.h) * 0.005));
  const base = {
    ...ORIGIN,
    left: cx - w / 2,
    top: cy - h / 2,
    fill: 'rgba(32,33,34,0.92)',
    stroke: '#3366cc',
    strokeWidth: stroke,
    strokeDashArray: [stroke * 3, stroke * 2],
    strokeUniform: true,
    wfRole: 'cutout',
    wfShape: shape,
    wfName: 'Photo cutout',
  };
  return shape === 'rounded'
    ? new fabric.Rect({ ...base, width: w, height: h, rx: geometry?.radius ?? 40, ry: geometry?.radius ?? 40 })
    : new fabric.Ellipse({ ...base, rx: w / 2, ry: h / 2 });
}

/** BADGE-1 — where the participant's role badge will be drawn. */
export function createBadgeZone(fabric, dims, geometry) {
  const height = dims.h * (geometry?.fontPct ? geometry.fontPct / 0.45 : 0.09);
  const width = dims.w * 0.7;
  const stroke = Math.max(3, Math.round(Math.min(dims.w, dims.h) * 0.004));
  return new fabric.Rect({
    ...ORIGIN,
    left: (geometry?.xPct ?? 0.5) * dims.w - width / 2,
    top: (geometry?.yPct ?? 0.86) * dims.h - height / 2,
    width,
    height,
    rx: height / 2,
    ry: height / 2,
    // Drawn in the badge's own colours, so the designer sees roughly what
    // participants will get (and the zone never vanishes into a same-coloured
    // background).
    fill: geometry?.background || '#3366cc',
    stroke: geometry?.color || '#ffffff',
    opacity: 0.85,
    strokeWidth: stroke,
    strokeDashArray: [stroke * 3, stroke * 2],
    strokeUniform: true,
    wfRole: 'badge',
    wfName: 'Badge zone',
    wfBadgeBackground: geometry?.background || '#3366cc',
    wfBadgeColor: geometry?.color || '#ffffff',
  });
}

/** Keeps a badge zone's look in step with its badge colours. */
export function paintBadgeZone(zone) {
  zone.set({
    fill: zone.wfBadgeBackground || '#3366cc',
    stroke: zone.wfBadgeColor || '#ffffff',
    opacity: 0.85,
  });
}

export async function createArtifact(fabric, dims, artifact, color) {
  const svg = artifact.svg.replaceAll('CURRENT', color || '#3366cc');
  const { objects, options } = await fabric.loadSVGFromString(svg);
  const group = fabric.util.groupSVGElements(objects.filter(Boolean), options);
  const target = Math.min(dims.w, dims.h) * 0.18;
  group.set({ ...ORIGIN, wfRole: 'artwork', wfName: artifact.name });
  group.scaleToWidth(target);
  group.set({ left: dims.w / 2 - target / 2, top: dims.h * 0.6 });
  group.setCoords();
  return group;
}

/** An image already imported into our asset store, scaled to a sensible size. */
export async function createImage(fabric, dims, { url, assetId, name, attribution }) {
  const img = await fabric.FabricImage.fromURL(url, { crossOrigin: null });
  const target = Math.min(dims.w, dims.h) * 0.45;
  const scale = Math.min(1, target / Math.max(img.width, img.height));
  img.set({
    ...ORIGIN,
    scaleX: scale,
    scaleY: scale,
    left: dims.w / 2 - (img.width * scale) / 2,
    top: dims.h / 2 - (img.height * scale) / 2,
    // Serialised as the attribute, i.e. our relative asset path, not an
    // absolute URL tied to whichever host the editor ran on.
    srcFromAttribute: true,
    wfRole: 'image',
    wfName: name || 'Image',
    wfAssetId: assetId || null,
    wfAttribution: attribution || null,
  });
  return img;
}

/** The finished artwork of an uploaded/Commons frame, locked at the bottom. */
export async function createBaseLayer(fabric, dims, url) {
  const img = await fabric.FabricImage.fromURL(url, { crossOrigin: null });
  img.set({
    ...ORIGIN,
    left: 0,
    top: 0,
    scaleX: dims.w / img.width,
    scaleY: dims.h / img.height,
    selectable: false,
    evented: false,
    excludeFromExport: true,
    wfRole: 'base',
    wfName: 'Frame artwork',
    wfLocked: true,
  });
  return img;
}

/** A small TASL credit line for every licensed image in the design. */
export function createCreditLine(fabric, canvas, dims, credits) {
  const text = credits
    .map((c) => {
      const title = (c.title || '').replace(/\.[a-z0-9]{2,5}$/i, '');
      return `“${title}”${c.author && c.author !== 'Unknown' ? ` by ${c.author}` : ''}, ${c.license}`;
    })
    .join(' · ');
  const fontSize = Math.max(18, Math.round(Math.min(dims.w, dims.h) * 0.018));
  const margin = Math.round(Math.min(dims.w, dims.h) * (SAFE_MARGIN + 0.005));
  const background = typeof canvas.backgroundColor === 'string' && canvas.backgroundColor ? canvas.backgroundColor : '#ffffff';
  const color = bestContrastColor(background, ['#ffffff', '#202122'])?.color || '#202122';
  const line = new fabric.Textbox(`${text} — via Wikimedia Commons`, {
    ...ORIGIN,
    left: margin,
    width: dims.w - margin * 2,
    fontSize,
    fill: color,
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'left',
    opacity: 0.85,
    wfRole: 'credit',
    wfName: 'Credits',
  });
  line.set({ top: dims.h - margin - line.height });
  line.setCoords();
  return line;
}

// ── alignment ───────────────────────────────────────────────────────────────

/**
 * Aligns the selection. One object aligns to the canvas; several align to
 * their combined bounding box, like Figma and Inkscape.
 */
export function alignSelection(canvas, dims, how) {
  const active = canvas.getActiveObject();
  if (!active) return false;
  const targets = isActiveSelection(active) ? active.getObjects() : [active];
  if (isActiveSelection(active)) canvas.discardActiveObject();

  const boxes = targets.map((o) => o.getBoundingRect());
  const area =
    targets.length > 1
      ? boxes.reduce(
          (acc, r) => ({
            left: Math.min(acc.left, r.left),
            top: Math.min(acc.top, r.top),
            right: Math.max(acc.right, r.left + r.width),
            bottom: Math.max(acc.bottom, r.top + r.height),
          }),
          { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
        )
      : { left: 0, top: 0, right: dims.w, bottom: dims.h };

  targets.forEach((obj, i) => {
    if (obj.wfLocked) return;
    const r = boxes[i];
    let { left: x, top: y } = r;
    if (how === 'left') x = area.left;
    if (how === 'center') x = (area.left + area.right) / 2 - r.width / 2;
    if (how === 'right') x = area.right - r.width;
    if (how === 'top') y = area.top;
    if (how === 'middle') y = (area.top + area.bottom) / 2 - r.height / 2;
    if (how === 'bottom') y = area.bottom - r.height;
    moveBoxTo(obj, x, y);
  });

  reselect(canvas, targets, active);
  return true;
}

/** Spreads three or more objects so the gaps between them are equal. */
export function distributeSelection(canvas, axis) {
  const active = canvas.getActiveObject();
  if (!isActiveSelection(active)) return false;
  const targets = active.getObjects().filter((o) => !o.wfLocked);
  if (targets.length < 3) return false;
  canvas.discardActiveObject();

  const key = axis === 'horizontal' ? 'left' : 'top';
  const size = axis === 'horizontal' ? 'width' : 'height';
  const items = targets
    .map((obj) => ({ obj, r: obj.getBoundingRect() }))
    .sort((a, b) => a.r[key] - b.r[key]);
  const start = items[0].r[key];
  const end = items[items.length - 1].r[key] + items[items.length - 1].r[size];
  const total = items.reduce((sum, i) => sum + i.r[size], 0);
  const gap = (end - start - total) / (items.length - 1);

  let cursor = start;
  for (const { obj, r } of items) {
    if (axis === 'horizontal') moveBoxTo(obj, cursor, r.top);
    else moveBoxTo(obj, r.left, cursor);
    cursor += r[size] + gap;
  }
  reselect(canvas, targets, active);
  return true;
}

function reselect(canvas, targets, previous) {
  if (targets.length > 1 && isActiveSelection(previous)) {
    const Selection = previous.constructor;
    canvas.setActiveObject(new Selection(targets, { canvas }));
  } else if (targets[0]) {
    canvas.setActiveObject(targets[0]);
  }
}

/** Keeps a layer's bounding box inside the safe area, shrinking it if needed. */
export function fitInSafeArea(obj, dims) {
  const safe = {
    x: dims.w * SAFE_MARGIN,
    y: dims.h * SAFE_MARGIN,
    w: dims.w * (1 - 2 * SAFE_MARGIN),
    h: dims.h * (1 - 2 * SAFE_MARGIN),
  };
  let r = obj.getBoundingRect();
  if (r.width > safe.w || r.height > safe.h) {
    const k = Math.min(safe.w / r.width, safe.h / r.height);
    obj.set({ scaleX: obj.scaleX * k, scaleY: obj.scaleY * k });
    obj.setCoords();
    r = obj.getBoundingRect();
  }
  const x = Math.min(Math.max(r.left, safe.x), safe.x + safe.w - r.width);
  const y = Math.min(Math.max(r.top, safe.y), safe.y + safe.h - r.height);
  moveBoxTo(obj, x, y);
}

/** Puts the badge zone just below the cutout (or above, if there is no room). */
export function moveBelowCutout(canvas, obj, dims) {
  const cutout = canvas.getObjects().find((o) => o.wfRole === 'cutout');
  if (!cutout) return;
  const hole = cutout.getBoundingRect();
  const r = obj.getBoundingRect();
  const gap = Math.min(dims.w, dims.h) * 0.025;
  let y = hole.top + hole.height + gap;
  if (y + r.height > dims.h * (1 - SAFE_MARGIN)) y = hole.top - gap - r.height;
  moveBoxTo(obj, dims.w / 2 - r.width / 2, Math.max(dims.h * SAFE_MARGIN, y));
}

/** Applies one Health Check fix. Returns true when the canvas changed. */
export function applyHealthFix(fix, { fabric, canvas, dims, credits }) {
  const obj = fix.objectIndex !== undefined ? canvas.getObjects()[fix.objectIndex] : null;
  switch (fix.kind) {
    case 'add-cutout':
      canvas.add(createCutout(fabric, dims, 'circle'));
      return true;
    case 'add-badge':
      canvas.add(createBadgeZone(fabric, dims));
      return true;
    case 'add-credit':
      if (!credits.length) return false;
      canvas.getObjects().filter((o) => o.wfRole === 'credit').forEach((o) => canvas.remove(o));
      canvas.add(createCreditLine(fabric, canvas, dims, credits));
      return true;
    case 'set-color':
      if (!obj) return false;
      obj.set({ fill: fix.color });
      return true;
    case 'set-font-size':
      if (!obj || !isText(obj)) return false;
      obj.set({ fontSize: fix.fontSize / (obj.scaleY || 1) });
      obj.setCoords();
      return true;
    case 'fit-in-safe-area':
      if (!obj) return false;
      fitInSafeArea(obj, dims);
      return true;
    case 'send-behind-cutout': {
      // Below the cutout, the hole punches through it on export.
      const cutout = canvas.getObjects().find((o) => o.wfRole === 'cutout');
      if (!obj || !cutout) return false;
      canvas.moveObjectTo(obj, canvas.getObjects().indexOf(cutout));
      return true;
    }
    case 'move-below-cutout':
      if (!obj) return false;
      moveBelowCutout(canvas, obj, dims);
      return true;
    case 'delete':
      if (!obj) return false;
      canvas.remove(obj);
      return true;
    default:
      return false;
  }
}

/** ED-7 ordering, in Fabric 7's vocabulary. */
export function reorder(canvas, obj, direction) {
  if (!obj) return;
  if (direction === 'forward') canvas.bringObjectForward(obj);
  if (direction === 'backward') canvas.sendObjectBackwards(obj);
  if (direction === 'front') canvas.bringObjectToFront(obj);
  if (direction === 'back') canvas.sendObjectToBack(obj);
  // The finished-frame artwork always stays at the very bottom.
  const base = canvas.getObjects().find((o) => o.wfRole === 'base');
  if (base) canvas.sendObjectToBack(base);
}
