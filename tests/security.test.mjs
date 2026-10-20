import test from 'node:test';
import assert from 'node:assert/strict';
import { linkTokenCandidates, parseLinkSegment, randomToken, safeEqual, slugify } from '../src/lib/tokens.js';
import { isWikimediaUrl, normalizeWikiUsername, sanitizeCanvasJson, sanitizeCredits } from '../src/lib/validate.js';
import { signValue, verifySignedValue } from '../src/lib/signing.js';
import { consume, enforce, peek, resetRateLimits } from '../src/lib/ratelimit.js';
import { parseCommonsInput, attributionLine } from '../src/lib/commons.js';
import { parseProfile } from '../src/lib/oauth.js';

test('participant links resolve even when the token contains dashes', () => {
  // ~28% of base64url tokens contain "-"; splitting on the last dash broke them.
  for (let i = 0; i < 500; i += 1) {
    const token = randomToken(16);
    const segment = `wiki-conference-india-2026-${token}`;
    assert.equal(linkTokenCandidates(segment)[0], token);
  }
  const dashed = 'abc-DEF_ghi-jkl-mnopqr'; // 22 chars with dashes
  assert.equal(dashed.length, 22);
  assert.equal(linkTokenCandidates(`my-event-${dashed}`)[0], dashed);
  // The old parser gets this wrong, which is the bug being fixed.
  assert.notEqual(parseLinkSegment(`my-event-${dashed}`).token, dashed);
});

test('link token candidates reject junk', () => {
  assert.deepEqual(linkTokenCandidates('short'), []);
  assert.deepEqual(linkTokenCandidates('x'.repeat(10) + '<script>' + 'y'.repeat(10)), []);
});

test('safeEqual compares secrets of any length', () => {
  assert.equal(safeEqual('1234', '1234'), true);
  assert.equal(safeEqual('1234', '12345'), false);
  assert.equal(safeEqual('', ''), true);
});

test('slugify produces URL-safe slugs', () => {
  assert.equal(slugify('WikiConférence India 2026!'), 'wikiconference-india-2026');
  assert.equal(slugify('!!!'), 'campaign');
  assert.ok(!slugify('a'.repeat(59) + '-b').endsWith('-'));
});

test('signed links verify, expire and cannot be replayed for another asset', () => {
  const token = signValue('asset-read', 'asset-1', 60);
  assert.equal(verifySignedValue('asset-read', 'asset-1', token), true);
  assert.equal(verifySignedValue('asset-read', 'asset-2', token), false);
  assert.equal(verifySignedValue('other-purpose', 'asset-1', token), false);
  const [exp, mac] = token.split('.');
  assert.equal(verifySignedValue('asset-read', 'asset-1', `${Number(exp) + 100}.${mac}`), false);
  assert.equal(verifySignedValue('asset-read', 'asset-1', `${Math.floor(Date.now() / 1000) - 5}.${mac}`), false);
  assert.equal(verifySignedValue('asset-read', 'asset-1', 'garbage'), false);
  assert.equal(verifySignedValue('asset-read', 'asset-1', undefined), false);
});

test('rate limiter counts per key and window', () => {
  resetRateLimits();
  for (let i = 0; i < 3; i += 1) assert.equal(consume('k', 3).allowed, true);
  assert.equal(consume('k', 3).allowed, false);
  assert.equal(peek('k', 3).allowed, false);
  assert.equal(peek('other', 3).allowed, true);
  assert.throws(() => enforce('k', 3), (err) => err.status === 429 && err.retryAfterSeconds > 0);
  resetRateLimits();
});

test('user page links must really be on a Wikimedia domain', () => {
  assert.equal(isWikimediaUrl('https://meta.wikimedia.org/wiki/User:Jane'), true);
  assert.equal(isWikimediaUrl('https://en.wikipedia.org/wiki/User:Jane'), true);
  assert.equal(isWikimediaUrl('https://www.wikidata.org/wiki/User:Jane'), true);
  assert.equal(isWikimediaUrl('https://evilwikimedia.org/wiki/User:Jane'), false);
  assert.equal(isWikimediaUrl('https://wikimedia.org.evil.com/'), false);
  assert.equal(isWikimediaUrl('http://meta.wikimedia.org/wiki/User:Jane'), false);
  assert.equal(isWikimediaUrl('https://user:pass@meta.wikimedia.org/'), false);
  assert.equal(isWikimediaUrl('javascript:alert(1)'), false);
});

test('wiki usernames are normalised the way MediaWiki does', () => {
  assert.equal(normalizeWikiUsername('jane_doe'), 'Jane doe');
  assert.equal(normalizeWikiUsername('  User:jane   doe '), 'Jane doe');
  assert.equal(normalizeWikiUsername('édith'), 'Édith');
  assert.equal(normalizeWikiUsername(''), '');
});

test('template JSON is sanitised on the way in', () => {
  const out = sanitizeCanvasJson(
    {
      cutout: { shape: 'rounded', xPct: '"><svg onload=1>', radius: 40 },
      badge: { background: 'javascript:1', color: '#000' },
      background: 'url(https://evil.example/track.png)',
      evil: { nested: true },
      fabric: {
        version: '7.4.0',
        objects: [
          { type: 'Rect', left: 1 },
          { type: 'Image', src: 'https://evil.example/pixel.png' },
          { type: 'Image', src: 'http://localhost:3000/api/v1/assets/123e4567-e89b-12d3-a456-426614174000' },
          { type: 'Group', objects: [{ type: 'Image', src: '/api/v1/assets/../../etc/passwd' }, { type: 'Rect' }] },
        ],
      },
      credits: [{ title: 'x'.repeat(500), sourceUrl: 'javascript:alert(1)', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' }],
    },
    { maxBytes: 1_000_000 }
  );
  assert.equal(out.cutout.xPct, 0.5, 'injected value replaced by the default');
  assert.equal(out.cutout.shape, 'rounded');
  assert.equal(out.badge.background, '#3366cc');
  assert.equal(out.background, '#ffffff');
  assert.equal(out.evil, undefined);
  assert.equal(out.fabric.objects.length, 3, 'the external image is dropped');
  assert.equal(out.fabric.objects[1].src, '/api/v1/assets/123e4567-e89b-12d3-a456-426614174000', 'own host stripped to a path');
  assert.equal(out.fabric.objects[2].objects.length, 1, 'traversal path dropped inside groups');
  assert.equal(out.credits[0].title.length, 200);
  assert.equal(out.credits[0].sourceUrl, null);
  assert.ok(out.credits[0].licenseUrl.startsWith('https://creativecommons.org/'));
});

test('template JSON over the size cap is refused', () => {
  assert.throws(
    () => sanitizeCanvasJson({ headline: 'x'.repeat(5000) }, { maxBytes: 1000 }),
    (err) => err.status === 413
  );
  assert.throws(() => sanitizeCanvasJson('nope', { maxBytes: 1000 }), (err) => err.status === 400);
});

test('credits are capped and typed', () => {
  assert.deepEqual(sanitizeCredits('nope'), []);
  assert.equal(sanitizeCredits(Array.from({ length: 80 }, () => ({ title: 't' }))).length, 50);
});

test('Commons input parsing only ever yields File: titles from Wikimedia hosts', () => {
  assert.equal(parseCommonsInput('https://commons.wikimedia.org/wiki/File:Example_frame.png'), 'File:Example frame.png');
  assert.equal(parseCommonsInput('File:Example.png'), 'File:Example.png');
  assert.equal(parseCommonsInput('Example.png'), 'File:Example.png');
  assert.equal(
    parseCommonsInput('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/330px-Example.jpg'),
    'File:Example.jpg'
  );
  assert.equal(
    parseCommonsInput('https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Casa_Confetti.jpg/330px-Casa_Confetti.jpg?utm_source=x'),
    'File:Casa Confetti.jpg'
  );
  assert.equal(parseCommonsInput('https://evil.example/wiki/File:Example.png'), null);
  assert.equal(parseCommonsInput('http://commons.wikimedia.org/wiki/File:X.png'), null);
  assert.equal(parseCommonsInput('https://commons.wikimedia.org/wiki/Main_Page'), null);
  assert.doesNotThrow(() => parseCommonsInput('https://commons.wikimedia.org/wiki/File:%E0%A4%A'));
  assert.equal(parseCommonsInput('File:<script>.png'), null);
});

test('attribution lines follow TASL', () => {
  assert.equal(
    attributionLine({ title: 'Taj Mahal.jpg', author: 'Jane', license: 'CC BY-SA 4.0' }),
    '“Taj Mahal” by Jane, CC BY-SA 4.0, via Wikimedia Commons'
  );
});

test('OAuth profiles without a central id are refused', () => {
  assert.throws(() => parseProfile({ username: 'Jane' }));
  assert.throws(() => parseProfile({ sub: '0', username: 'Jane' }));
  assert.throws(() => parseProfile({ sub: 'abc', username: 'Jane' }));
  assert.throws(() => parseProfile({ sub: '42' }));
  const ok = parseProfile({ sub: '42', username: 'Jane Doe' });
  assert.equal(ok.wikiUserId, 42n);
  assert.equal(ok.userPageUrl, 'https://meta.wikimedia.org/wiki/User:Jane_Doe');
});
