import test from 'node:test';
import assert from 'node:assert/strict';
import { bestContrastColor, contrastRatio, parseColor } from '../src/lib/editor/contrast.js';

test('parses hex and rgb colours', () => {
  assert.deepEqual(parseColor('#36c'), { r: 51, g: 102, b: 204, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.equal(parseColor('nonsense'), null);
});

test('matches the WCAG reference values', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff') * 10) / 10, 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  // Codex progressive blue on white passes AA for body text.
  assert.ok(contrastRatio('#3366cc', '#ffffff') >= 4.5);
  // Wikimedia yellow on white does not even pass for large text.
  assert.ok(contrastRatio('#ffcc33', '#ffffff') < 3);
});

test('picks the most legible palette colour', () => {
  const best = bestContrastColor('#ffcc33', ['#ffffff', '#202122', '#3366cc']);
  assert.equal(best.color, '#202122');
});
