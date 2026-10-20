import test from 'node:test';
import assert from 'node:assert/strict';
import { planMagicResize } from '../src/lib/editor/magic-resize.js';

const square = { w: 1080, h: 1080 };
const story = { w: 1080, h: 1920 };
const landscape = { w: 1920, h: 1080 };

function item(role, kind, bbox) {
  return { role, kind, bbox, left: bbox.x, top: bbox.y, scaleX: 1, scaleY: 1 };
}

/** For top-left-origin items the result's left/top is the new box corner. */
function boxOf(result, src) {
  const k = result.scaleX / src.scaleX;
  return { x: result.left, y: result.top, w: src.bbox.w * k, h: src.bbox.h * k };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('square to story keeps a top headline at the top and the badge at the bottom', () => {
  const items = [
    item('shape', 'shape', { x: 0, y: 0, w: 1080, h: 1080 }),
    item('text', 'text', { x: 140, y: 60, w: 800, h: 100 }),
    item('cutout', 'cutout', { x: 270, y: 200, w: 540, h: 540 }),
    item('badge', 'badge', { x: 190, y: 880, w: 700, h: 90 }),
  ];
  const out = planMagicResize(items, square, story);
  const bg = boxOf(out[0], items[0]);
  assert.ok(bg.w >= 1080 - 1 && bg.h >= 1920 - 1, 'background covers the new canvas');
  assert.ok(boxOf(out[1], items[1]).y < 200, 'headline stays near the top');
  const badge = boxOf(out[3], items[3]);
  assert.ok(badge.y + badge.h > 1920 * 0.85, 'badge stays near the bottom');
});

test('square to landscape reflows into two columns without text on the photo', () => {
  const items = [
    item('text', 'text', { x: 140, y: 60, w: 800, h: 100 }),
    item('cutout', 'cutout', { x: 270, y: 200, w: 540, h: 540 }),
    item('badge', 'badge', { x: 190, y: 880, w: 700, h: 90 }),
  ];
  const out = planMagicResize(items, square, landscape);
  const hole = boxOf(out[1], items[1]);
  assert.ok(hole.x + hole.w / 2 < 1920 / 2, 'cutout moves to the left column');
  assert.ok(hole.y >= 0 && hole.y + hole.h <= 1080, 'cutout fits vertically');
  for (const i of [0, 2]) {
    const b = boxOf(out[i], items[i]);
    assert.ok(!overlaps(b, hole), `layer ${i} is off the photo`);
    assert.ok(b.x >= 0 && b.x + b.w <= 1920 && b.y >= 0 && b.y + b.h <= 1080, `layer ${i} on canvas`);
  }
});

test('layers inside the safe area stay inside it', () => {
  const items = [item('text', 'text', { x: 60, y: 900, w: 960, h: 120 })];
  const [out] = planMagicResize(items, square, landscape);
  const b = boxOf(out, items[0]);
  assert.ok(b.x >= 1920 * 0.05 - 1 && b.x + b.w <= 1920 * 0.95 + 1);
  assert.ok(b.y >= 1080 * 0.05 - 1 && b.y + b.h <= 1080 * 0.95 + 1);
});

test('centre-origin objects are moved by their centre', () => {
  // An object whose origin is its centre: left/top is the bbox centre.
  const centred = {
    role: 'text',
    kind: 'text',
    bbox: { x: 400, y: 400, w: 280, h: 280 },
    left: 540,
    top: 540,
    scaleX: 2,
    scaleY: 2,
  };
  const [out] = planMagicResize([centred], square, story);
  assert.ok(Math.abs(out.left - 540) < 1, 'horizontally centred stays centred');
  assert.ok(out.top > 540, 'moves down into the taller canvas');
  assert.ok(Math.abs(out.scaleX / 2 - 1) < 1e-9, 'short side unchanged, so size unchanged');
});

test('degenerate items are passed through untouched', () => {
  const broken = { role: 'text', kind: 'text', bbox: { x: 0, y: 0, w: 0, h: 0 }, left: 5, top: 6, scaleX: 1, scaleY: 1 };
  const [out] = planMagicResize([broken], square, story);
  assert.deepEqual(out, { left: 5, top: 6, scaleX: 1, scaleY: 1 });
});
