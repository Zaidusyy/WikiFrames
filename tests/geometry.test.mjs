import test from 'node:test';
import assert from 'node:assert/strict';
import {
  badgeLayout,
  clampNumber,
  computePlacement,
  containRect,
  coverZoom,
  cutoutRect,
  estimateTextWidthEm,
  normalizeBadge,
  normalizeCutout,
  safeColor,
  sanitizePlacement,
} from '../src/lib/geometry.js';

test('safeColor accepts strict hex only', () => {
  assert.equal(safeColor('#3366CC', 'x'), '#3366cc');
  assert.equal(safeColor('#fff', 'x'), '#fff');
  assert.equal(safeColor('red', 'x'), 'x');
  assert.equal(safeColor('#fff" onload="alert(1)', 'x'), 'x');
  assert.equal(safeColor(null, 'x'), 'x');
});

test('clampNumber coerces and clamps', () => {
  assert.equal(clampNumber('5', 0, 10, 1), 5);
  assert.equal(clampNumber(50, 0, 10, 1), 10);
  assert.equal(clampNumber('abc', 0, 10, 1), 1);
  assert.equal(clampNumber(Infinity, 0, 10, 1), 1);
  assert.equal(clampNumber('', 0, 10, 1), 1);
});

test('normalizeCutout neutralises injected values', () => {
  const c = normalizeCutout({ shape: '<script>', xPct: '0.5"/><image', radius: 'x', sizePct: 99 });
  assert.equal(c.shape, 'circle');
  assert.equal(c.xPct, 0.5);
  assert.equal(c.radius, 0);
  assert.equal(c.sizePct, 1.5);
});

test('normalizeBadge only keeps hex colours', () => {
  const b = normalizeBadge({ background: 'url(javascript:1)', color: '#000000', opacity: 7 });
  assert.equal(b.background, '#3366cc');
  assert.equal(b.color, '#000000');
  assert.equal(b.opacity, 1);
});

test('cutoutRect is centred where the template says', () => {
  const r = cutoutRect({ shape: 'circle', xPct: 0.5, yPct: 0.5, sizePct: 0.5 }, 1000, 1000);
  assert.deepEqual([r.x, r.y, r.w, r.h, r.cx, r.cy], [250, 250, 500, 500, 500, 500]);
  const rounded = cutoutRect({ shape: 'rounded', radius: 9999, widthPx: 400, heightPx: 200 }, 1000, 1000);
  assert.equal(rounded.radius, 100, 'radius is capped at half the shorter side');
});

test('badge chip always stays on the canvas and fits long roles', () => {
  const long = "I'm a Translation Champion of the Wikimedia movement everywhere 🌍";
  const b = badgeLayout(long, { xPct: 0.98, yPct: 0.99, fontPct: 0.06 }, 1080, 1080);
  assert.ok(b.left >= 0 && b.left + b.boxW <= 1080);
  assert.ok(b.top >= 0 && b.top + b.boxH <= 1080);
  assert.ok(b.boxW <= 1080 * 0.94 + 1);
  const short = badgeLayout("I'm a Dev", { fontPct: 0.06 }, 1080, 1080);
  assert.ok(short.fontSize > b.fontSize, 'only long text is shrunk');
});

test('text width estimate distinguishes narrow, wide and emoji glyphs', () => {
  assert.ok(estimateTextWidthEm('iiii') < estimateTextWidthEm('MMMM'));
  assert.ok(estimateTextWidthEm('🌍') > estimateTextWidthEm('a'));
  assert.equal(estimateTextWidthEm('\u{fe0f}'), 0);
});

test('placement keeps the photo shape and covers the cutout by default', () => {
  const cutout = { shape: 'circle', xPct: 0.5, yPct: 0.4, sizePct: 0.5 };
  const rect = cutoutRect(cutout, 1080, 1080);
  const zoom = coverZoom(rect, 4 / 3);
  const p = computePlacement({ aspectRatio: '1:1', cutout, fit: { zoom }, naturalRatio: 4 / 3 });
  assert.ok(Math.abs(p.width / p.height - 4 / 3) < 0.01);
  assert.ok(p.width >= rect.w && p.height >= rect.h - 1, 'covers the hole');
});

test('sanitizePlacement refuses memory-exhausting boxes', () => {
  const rect = cutoutRect({}, 1080, 1080);
  const p = sanitizePlacement({ left: 0, top: 0, width: 1e9, height: 1e9, rotate: 900 }, rect, 1080, 1080);
  assert.ok(p.width * p.height <= 24_000_000);
  assert.equal(p.rotate, 45);
  const bad = sanitizePlacement({ width: 'NaN', left: {}, top: [] }, rect, 1080, 1080);
  assert.equal(bad.width, rect.w);
  assert.equal(bad.left, Math.round(rect.x));
});

test('containRect fits without distortion', () => {
  const r = containRect(400, 400, 2);
  assert.deepEqual([r.w, r.h, r.dx, r.dy], [400, 200, 0, 100]);
});
