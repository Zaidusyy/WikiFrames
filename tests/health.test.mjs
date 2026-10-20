import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFrame } from '../src/lib/editor/health.js';

const base = { width: 1080, height: 1080, editable: true, aspectRatio: '1:1' };
const cutout = { index: 0, role: 'cutout', kind: 'cutout', bbox: { x: 270, y: 200, w: 540, h: 540 } };
const badge = { index: 1, role: 'badge', kind: 'badge', bbox: { x: 190, y: 880, w: 700, h: 90 } };

function rules(result) {
  return result.issues.map((i) => i.rule).sort();
}

test('a clean frame scores 100', () => {
  const r = analyzeFrame({
    ...base,
    objects: [
      cutout,
      badge,
      {
        index: 2,
        role: 'text',
        kind: 'text',
        name: 'Headline',
        text: 'I am attending',
        bbox: { x: 140, y: 70, w: 800, h: 90 },
        fontSize: 80,
        color: '#ffffff',
        behind: '#2a4b8d',
      },
    ],
  });
  assert.deepEqual(r.issues, []);
  assert.equal(r.score, 100);
});

test('flags a missing cutout as an error with a fix', () => {
  const r = analyzeFrame({ ...base, objects: [badge] });
  const issue = r.issues.find((i) => i.rule === 'cutout-missing');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.fix.kind, 'add-cutout');
  assert.equal(r.errors, 1);
});

test('a finished (flat) frame is not asked for a cutout layer', () => {
  const r = analyzeFrame({ ...base, editable: false, objects: [badge] });
  assert.ok(!r.issues.some((i) => i.rule === 'cutout-missing'));
});

test('flags low contrast and offers a palette colour that passes', () => {
  const r = analyzeFrame(
    {
      ...base,
      objects: [
        cutout,
        badge,
        { index: 2, kind: 'text', text: 'Hello', bbox: { x: 140, y: 70, w: 400, h: 60 }, fontSize: 60, color: '#ffcc33', behind: '#ffffff' },
      ],
    },
    { palette: ['#ffffff', '#202122'] }
  );
  const issue = r.issues.find((i) => i.rule === 'text-contrast');
  assert.ok(issue);
  assert.equal(issue.fix.color, '#202122');
});

test('flags tiny text, edge text, text over the photo and a badge over the photo', () => {
  const r = analyzeFrame({
    ...base,
    objects: [
      cutout,
      { ...badge, bbox: { x: 300, y: 600, w: 480, h: 90 } },
      { index: 2, kind: 'text', text: 'tiny', bbox: { x: 2, y: 2, w: 100, h: 20 }, fontSize: 20, color: '#000000', behind: '#ffffff' },
      { index: 3, kind: 'text', text: 'over', bbox: { x: 400, y: 400, w: 200, h: 80 }, fontSize: 80, color: '#000000', behind: '#ffffff' },
    ],
  });
  assert.deepEqual(rules(r), ['badge-over-photo', 'text-edge', 'text-over-photo', 'text-tiny']);
});

test('requires a credit line for openly licensed artwork', () => {
  const art = {
    index: 2,
    kind: 'image',
    name: 'Monument',
    bbox: { x: 100, y: 100, w: 100, h: 100 },
    attribution: { license: 'CC BY-SA 4.0' },
  };
  const missing = analyzeFrame({ ...base, objects: [cutout, badge, art] });
  assert.ok(missing.issues.some((i) => i.rule === 'credit-missing' && i.fix.kind === 'add-credit'));

  const credit = {
    index: 3,
    kind: 'text',
    role: 'credit',
    isCredit: true,
    text: '“Monument” by X, CC BY-SA 4.0',
    bbox: { x: 100, y: 990, w: 600, h: 30 },
    fontSize: 40,
    color: '#000000',
    behind: '#ffffff',
  };
  const credited = analyzeFrame({ ...base, objects: [cutout, badge, art, credit] });
  assert.ok(!credited.issues.some((i) => i.rule === 'credit-missing'));
});

test('warns about the story UI on 9:16 frames and about blurry images', () => {
  const r = analyzeFrame({
    width: 1080,
    height: 1920,
    editable: true,
    aspectRatio: '9:16',
    objects: [
      { ...cutout, bbox: { x: 270, y: 500, w: 540, h: 540 } },
      { index: 1, role: 'badge', kind: 'badge', bbox: { x: 190, y: 1750, w: 700, h: 100 } },
      { index: 2, kind: 'image', name: 'Logo', upscale: 2.4, bbox: { x: 100, y: 1200, w: 300, h: 300 } },
    ],
  });
  assert.ok(r.issues.some((i) => i.rule === 'story-ui'));
  assert.ok(r.issues.some((i) => i.rule === 'image-blurry'));
});

test('artwork stacked over the photo cutout is flagged, artwork beneath it is not', () => {
  const art = (index) => ({ index, kind: 'image', name: 'Photo', bbox: { x: 300, y: 250, w: 400, h: 400 } });
  const over = analyzeFrame({ ...base, objects: [cutout, badge, art(2)] });
  const issue = over.issues.find((i) => i.rule === 'covers-photo');
  assert.equal(issue?.fix.kind, 'send-behind-cutout');
  const under = analyzeFrame({ ...base, objects: [art(0), { ...cutout, index: 1 }, { ...badge, index: 2 }] });
  assert.ok(!under.issues.some((i) => i.rule === 'covers-photo'));
});

test('issues are ordered by severity and the score reflects them', () => {
  const r = analyzeFrame({ ...base, objects: [] });
  assert.equal(r.issues[0].severity, 'error');
  assert.ok(r.score < 100);
});
