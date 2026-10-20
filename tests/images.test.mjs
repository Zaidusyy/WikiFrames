import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { detectCutout, normalizeImageUpload, sniffMime, stripSvgDoctype } from '../src/lib/uploads.js';
import { composeImage, renderBlankFrame } from '../src/lib/composite.js';
import { computePlacement, cutoutRect } from '../src/lib/geometry.js';

async function solid(width, height, color, format = 'png') {
  const img = sharp({ create: { width, height, channels: 3, background: color } });
  return format === 'jpeg' ? img.jpeg().toBuffer() : img.png().toBuffer();
}

async function frameWithHole({ width, height, cx, cy, r }) {
  return sharp({ create: { width, height, channels: 4, background: '#2a4b8d' } })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/></svg>`
        ),
        blend: 'dest-out',
      },
    ])
    .png()
    .toBuffer();
}

async function pixel(buffer, x, y) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

test('sniffMime trusts bytes, not names', async () => {
  assert.equal(sniffMime(await solid(4, 4, '#fff')), 'image/png');
  assert.equal(sniffMime(await solid(4, 4, '#fff', 'jpeg')), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from('<?xml version="1.0"?>\n<!-- hi -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml');
  assert.equal(sniffMime(Buffer.from('<html><svg></svg></html>')), null);
  assert.equal(sniffMime(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(sniffMime(Buffer.alloc(0)), null);
});

test('SVG uploads are rasterised, never stored as markup', async () => {
  const svg = Buffer.from(
    '<!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><script>alert(1)</script><rect width="100" height="50" fill="#36c"/></svg>'
  );
  assert.ok(!stripSvgDoctype(svg).toString().includes('ENTITY'));
  const out = await normalizeImageUpload(svg, { maxSide: 400 });
  assert.equal(out.mime, 'image/png');
  assert.equal(sniffMime(out.buffer), 'image/png');
  assert.equal(out.width, 400);
  assert.equal(out.height, 200);
});

test('frames are checked for ratio and transparency', async () => {
  const opaque = await solid(1080, 1080, '#fff');
  await assert.rejects(normalizeImageUpload(opaque, { requireTransparency: true }), /transparent cutout/);
  const wrongRatio = await frameWithHole({ width: 1080, height: 600, cx: 540, cy: 300, r: 200 });
  await assert.rejects(normalizeImageUpload(wrongRatio, { expectRatio: '1:1' }), /1:1/);
});

test('uploads are re-encoded, which strips EXIF', async () => {
  const withExif = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#f00' } })
    .withExif({ IFD0: { Copyright: 'secret-gps-would-be-here' } })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(withExif).metadata()).exif);
  const out = await normalizeImageUpload(withExif, { preferJpegWhenOpaque: true });
  assert.equal((await sharp(out.buffer).metadata()).exif, undefined);
});

test('decompression bombs are refused before decoding', async () => {
  // 9000 px exceeds the 8000 px side limit; metadata is read without decoding.
  const huge = await sharp({ create: { width: 9000, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(normalizeImageUpload(huge), /8000 px/);
});

test('detectCutout finds the hole a designer cut', async () => {
  const frame = await frameWithHole({ width: 1080, height: 1350, cx: 540, cy: 600, r: 300 });
  const cutout = await detectCutout(frame, 1080, 1350);
  assert.equal(cutout.shape, 'circle');
  assert.ok(Math.abs(cutout.xPct - 0.5) < 0.02, `xPct ${cutout.xPct}`);
  assert.ok(Math.abs(cutout.yPct - 600 / 1350) < 0.02, `yPct ${cutout.yPct}`);
  assert.ok(Math.abs(cutout.widthPx - 600) < 20, `width ${cutout.widthPx}`);

  // An opaque frame with a transparent rectangle.
  const rectFrame = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: '#202122' } })
    .composite([
      {
        input: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect x="100" y="300" width="500" height="400" fill="#fff"/></svg>'
        ),
        blend: 'dest-out',
      },
    ])
    .png()
    .toBuffer();
  const rect = await detectCutout(rectFrame, 1080, 1080);
  assert.equal(rect.shape, 'rounded');
  assert.ok(Math.abs(rect.widthPx - 500) < 15 && Math.abs(rect.heightPx - 400) < 15);

  assert.equal(await detectCutout(await solid(1080, 1080, '#fff'), 1080, 1080), null);
});

test('composeImage puts the photo exactly inside the hole', async () => {
  const cutout = { shape: 'circle', xPct: 0.5, yPct: 0.5, sizePct: 0.5 };
  const rect = cutoutRect(cutout, 1080, 1080);
  const frame = await frameWithHole({ width: 1080, height: 1080, cx: rect.cx, cy: rect.cy, r: rect.w / 2 });
  const photo = await solid(1200, 900, '#ff0000', 'jpeg');
  const placement = computePlacement({ aspectRatio: '1:1', cutout, fit: { zoom: 1.4 }, naturalRatio: 1200 / 900 });

  const out = await composeImage({ photoBuffer: photo, frameBuffer: frame, frameKey: 'test-frame', aspectRatio: '1:1', cutout, placement });
  assert.equal(out.mime, 'image/jpeg');
  const meta = await sharp(out.buffer).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1080]);

  const [r, g, b] = await pixel(out.buffer, 540, 540);
  assert.ok(r > 200 && g < 60 && b < 60, `centre is the red photo, got ${r},${g},${b}`);
  const [fr, fg, fb] = await pixel(out.buffer, 20, 20);
  assert.ok(fr < 80 && fb > 100, `corner is the blue frame, got ${fr},${fg},${fb}`);
});

test('composeImage survives a hostile placement and still returns a frame', async () => {
  const photo = await solid(800, 800, '#00ff00', 'jpeg');
  const out = await composeImage({
    photoBuffer: photo,
    frameBuffer: null,
    aspectRatio: '9:16',
    cutout: { xPct: 'x', sizePct: '"/><foo' },
    badge: { text: "I'm a <b>Wiki</b> Developer & co", style: { background: 'red"/><x', fontPct: 9 } },
    placement: { left: -1e12, top: 'nope', width: 1e12, height: 1e12, rotate: 'spin' },
    format: 'png',
  });
  const meta = await sharp(out.buffer).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1920]);
});

test('rotated placements render and keep the canvas size', async () => {
  const cutout = { shape: 'rounded', radius: 40, xPct: 0.5, yPct: 0.5, sizePct: 0.6 };
  const photo = await solid(1000, 1000, '#ff0000', 'jpeg');
  const placement = { ...computePlacement({ aspectRatio: '16:9', cutout, fit: { zoom: 1.2, rotate: 20 }, naturalRatio: 1 }) };
  const out = await composeImage({ photoBuffer: photo, aspectRatio: '16:9', cutout, placement });
  const meta = await sharp(out.buffer).metadata();
  assert.deepEqual([meta.width, meta.height], [1920, 1080]);
  const [r] = await pixel(out.buffer, 960, 540);
  assert.ok(r > 200);
});

test('the blank frame has a transparent hole where the cutout is', async () => {
  const cutout = { shape: 'circle', xPct: 0.5, yPct: 0.4, sizePct: 0.5 };
  const { buffer } = await renderBlankFrame({ aspectRatio: '4:5', cutout, label: 'Test <frame>' });
  const rect = cutoutRect(cutout, 1080, 1350);
  const [, , , alphaInside] = await pixel(buffer, rect.cx, rect.cy);
  const [, , , alphaOutside] = await pixel(buffer, 30, 30);
  assert.equal(alphaInside, 0);
  assert.equal(alphaOutside, 255);
});
