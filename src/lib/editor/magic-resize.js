/**
 * Magic Resize — re-lays a frame out for a different aspect ratio.
 *
 * Organizers usually want the same design as a story, a feed post and a
 * square. Stretching would distort it and plain scaling leaves it marooned in
 * empty space, so each layer is placed by intent instead:
 *
 *   - backgrounds (anything covering most of the canvas) are scaled to cover
 *     the new canvas;
 *   - other layers keep their size relative to the canvas's *short* side and
 *     are anchored the way a designer would anchor them — near the top edge
 *     stays near the top edge, centred stays centred;
 *   - going from portrait or square to landscape, the layout reflows into two
 *     columns: the photo cutout on the left, everything else on the right;
 *   - afterwards text is pushed off the photo cutout, and anything that was
 *     inside the safe area is kept inside it.
 *
 * Pure and origin-agnostic: it works on bounding boxes and moves each object
 * by its centre, so rotated objects and any originX/originY are handled.
 *
 * items: [{ role, kind, bbox: {x, y, w, h}, left, top, scaleX, scaleY }]
 * returns: [{ left, top, scaleX, scaleY }] in the same order
 */

const SAFE = 0.05;

function isLandscape({ w, h }) {
  return w > h * 1.15;
}

function covers(bbox, canvas) {
  return bbox.w * bbox.h >= canvas.w * canvas.h * 0.8;
}

/** Places a span [start, end] of `fromLen` into `toLen`, by anchoring. */
function anchorAxis(start, end, fromLen, toLen, k) {
  const size = (end - start) * k;
  const centre = (start + end) / 2;
  const t = centre / fromLen;
  if (t < 0.34) return start * k + size / 2; // keep distance from the start edge
  if (t > 0.66) return toLen - (fromLen - end) * k - size / 2; // …from the end edge
  return t * toLen; // keep relative position
}

function boxAround(cx, cy, w, h) {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inside(box, area) {
  return (
    box.x >= area.x - 0.5 &&
    box.y >= area.y - 0.5 &&
    box.x + box.w <= area.x + area.w + 0.5 &&
    box.y + box.h <= area.y + area.h + 0.5
  );
}

function fitInto(box, area) {
  let { x, y, w, h } = box;
  let scale = 1;
  if (w > area.w || h > area.h) {
    scale = Math.min(area.w / w, area.h / h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    w *= scale;
    h *= scale;
    x = cx - w / 2;
    y = cy - h / 2;
  }
  x = Math.min(Math.max(x, area.x), area.x + area.w - w);
  y = Math.min(Math.max(y, area.y), area.y + area.h - h);
  return { box: { x, y, w, h }, scale };
}

export function planMagicResize(items, from, to) {
  const unit = Math.min(to.w, to.h) / Math.min(from.w, from.h);
  const toColumns = isLandscape(to) && !isLandscape(from);
  const fromSafe = { x: from.w * SAFE, y: from.h * SAFE, w: from.w * (1 - 2 * SAFE), h: from.h * (1 - 2 * SAFE) };
  const toSafe = { x: to.w * SAFE, y: to.h * SAFE, w: to.w * (1 - 2 * SAFE), h: to.h * (1 - 2 * SAFE) };
  const rightColumn = { x: to.w * 0.54, y: to.h * 0.1, w: to.w * 0.41, h: to.h * 0.8 };

  // Pass 1: target box for every item.
  const placed = items.map((item) => {
    const b = item.bbox;
    if (!b || !(b.w > 0) || !(b.h > 0)) return { box: b, k: 1, item };

    if (item.role === 'base' || (covers(b, from) && item.kind !== 'text')) {
      const k = Math.max(to.w / b.w, to.h / b.h);
      return { box: boxAround(to.w / 2, to.h / 2, b.w * k, b.h * k), k, item, background: true };
    }

    if (toColumns && item.role === 'cutout') {
      const k = Math.min((to.h * 0.84) / b.h, (to.w * 0.46) / b.w);
      return { box: boxAround(to.w * 0.27, to.h / 2, b.w * k, b.h * k), k, item };
    }

    if (toColumns) {
      // Keep the vertical order and horizontal alignment of the source,
      // inside the right-hand column.
      const k = Math.min(unit, rightColumn.w / b.w);
      const cx = rightColumn.x + ((b.x + b.w / 2) / from.w) * rightColumn.w;
      const cy = rightColumn.y + ((b.y + b.h / 2) / from.h) * rightColumn.h;
      return { box: boxAround(cx, cy, b.w * k, b.h * k), k, item };
    }

    const k = unit;
    const cx = anchorAxis(b.x, b.x + b.w, from.w, to.w, k);
    const cy = anchorAxis(b.y, b.y + b.h, from.h, to.h, k);
    return { box: boxAround(cx, cy, b.w * k, b.h * k), k, item };
  });

  // Pass 2: keep text and the badge off the photo cutout.
  const cutout = placed.find((p) => p.item.role === 'cutout');
  if (cutout?.box) {
    const hole = cutout.box;
    for (const p of placed) {
      if (p === cutout || p.background || !p.box) continue;
      if (!(p.item.kind === 'text' || p.item.role === 'badge')) continue;
      if (!overlaps(p.box, hole)) continue;

      const gap = Math.min(to.w, to.h) * 0.02;
      const above = { x: toSafe.x, y: toSafe.y, w: toSafe.w, h: Math.max(0, hole.y - gap - toSafe.y) };
      const below = {
        x: toSafe.x,
        y: hole.y + hole.h + gap,
        w: toSafe.w,
        h: Math.max(0, toSafe.y + toSafe.h - (hole.y + hole.h + gap)),
      };
      const beside = toColumns ? rightColumn : null;
      const preferAbove = p.box.y + p.box.h / 2 < hole.y + hole.h / 2;
      const bands = [beside, preferAbove ? above : below, preferAbove ? below : above].filter(
        (band) => band && band.h > p.box.h * 0.35 && band.w > p.box.w * 0.35
      );
      const band = bands[0];
      if (!band) continue;
      const centred = boxAround(p.box.x + p.box.w / 2, band.y + band.h / 2, p.box.w, p.box.h);
      const { box, scale } = fitInto(centred, band);
      p.box = box;
      p.k *= scale;
    }
  }

  // Pass 3: whatever started inside the safe area stays inside it.
  for (const p of placed) {
    if (p.background || !p.box || !p.item.bbox) continue;
    if (inside(p.item.bbox, fromSafe) && !inside(p.box, toSafe)) {
      const { box, scale } = fitInto(p.box, toSafe);
      p.box = box;
      p.k *= scale;
    }
  }

  // Move each object by its centre: a point P relative to the bbox centre C
  // scales by k around C, so P' = C' + k (P − C). Works for any origin/angle.
  return placed.map(({ box, k, item }) => {
    if (!box || !item.bbox || !(item.bbox.w > 0)) {
      return { left: item.left, top: item.top, scaleX: item.scaleX, scaleY: item.scaleY };
    }
    const cx = item.bbox.x + item.bbox.w / 2;
    const cy = item.bbox.y + item.bbox.h / 2;
    const ncx = box.x + box.w / 2;
    const ncy = box.y + box.h / 2;
    return {
      left: ncx + k * (item.left - cx),
      top: ncy + k * (item.top - cy),
      scaleX: (item.scaleX ?? 1) * k,
      scaleY: (item.scaleY ?? 1) * k,
    };
  });
}

/** Cutout geometry for a template, from the cutout layer's new bounding box. */
export function cutoutFromBox(box, shape, radius, dims) {
  return {
    shape: shape === 'rounded' ? 'rounded' : 'circle',
    radius: radius || 0,
    xPct: (box.x + box.w / 2) / dims.w,
    yPct: (box.y + box.h / 2) / dims.h,
    sizePct: Math.min(box.w, box.h) / Math.min(dims.w, dims.h),
    widthPx: box.w,
    heightPx: box.h,
  };
}
