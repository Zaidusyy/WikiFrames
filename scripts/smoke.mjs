#!/usr/bin/env node
/**
 * End-to-end smoke test against a running development server.
 *
 *   npm run dev            # with ALLOW_DEV_LOGIN=true
 *   npm run smoke          # SMOKE_URL defaults to http://localhost:3000
 *
 * Walks the real product through the API: sign-in, campaign, frame upload
 * (with hole detection), launch, the participant flow, and the privacy and
 * security guarantees (image access control, signed links, access-code
 * throttling, CSRF and body-size limits, security headers). It creates data
 * in the database it talks to — point it at a development instance only.
 */
import sharp from 'sharp';

const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
let cookie = '';
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', body, headers = {}, auth = true, raw = false } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(auth && cookie ? { cookie } : {}),
      ...(method !== 'GET' ? { origin: ORIGIN } : {}),
      ...(body && !isForm ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function framePng({ cx, cy, r }) {
  return sharp({ create: { width: 1080, height: 1080, channels: 4, background: '#2a4b8d' } })
    .composite([
      {
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/></svg>`),
        blend: 'dest-out',
      },
    ])
    .png()
    .toBuffer();
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  console.log('Sign-in and setup');
  const login = await call(`/api/v1/auth/dev?username=SmokeOrganizer${Date.now() % 100000}`, { auth: false, raw: true });
  const setCookie = login.headers.get('set-cookie') || '';
  cookie = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter((c) => c.includes('wf_session')).join('; ');
  check('development sign-in sets a session cookie', login.status >= 300 && login.status < 400 && cookie, `status ${login.status}`);
  check('session cookie is HttpOnly and SameSite=Lax', /httponly/i.test(setCookie) && /samesite=lax/i.test(setCookie));
  const me = await call('/api/v1/me', { method: 'PATCH', body: { userGroup: 'Smoke Test Wikimedians', completeOnboarding: true } });
  check('profile can be completed', me.status === 200, me.text.slice(0, 120));

  const now = Date.now();
  const created = await call('/api/v1/campaigns', {
    method: 'POST',
    body: {
      name: 'Smoke Test Conference',
      description: 'An end-to-end check.',
      eventDate: new Date(now - 3600e3).toISOString(),
      eventEndDate: new Date(now + 2 * 86400e3).toISOString(),
      registrationOpenDate: new Date(now - 7200e3).toISOString(),
      presetKey: 'wikiconference',
      accessCode: '4821',
    },
  });
  const campaign = created.json?.campaign;
  check('campaign is created from an event template', created.status === 201 && campaign?.id, created.text.slice(0, 160));

  console.log('\nFrames');
  const form = new FormData();
  form.append('frame', new Blob([await framePng({ cx: 330, cy: 430, r: 250 })], { type: 'image/png' }), 'frame.png');
  form.append('name', 'Uploaded frame');
  form.append('aspectRatio', '1:1');
  form.append('campaignId', campaign.id);
  const upload = await call('/api/v1/templates', { method: 'POST', body: form });
  const uploaded = upload.json?.template;
  const cut = uploaded?.canvasJson?.cutout;
  check('a finished frame is accepted', upload.status === 201, upload.text.slice(0, 160));
  check(
    'the photo hole is detected where the designer put it',
    cut && Math.abs(cut.xPct - 330 / 1080) < 0.03 && Math.abs(cut.yPct - 430 / 1080) < 0.03,
    JSON.stringify(cut)
  );

  const hostile = await call('/api/v1/templates', {
    method: 'POST',
    body: {
      name: 'Canvas frame',
      aspectRatio: '1:1',
      campaignId: campaign.id,
      canvasJson: {
        badge: { background: '"/><script>alert(1)</script>', xPct: 0.5, yPct: 0.85 },
        fabric: { objects: [{ type: 'Image', src: 'https://tracker.example/pixel.png' }, { type: 'Rect' }] },
        injected: true,
      },
    },
  });
  const cj = hostile.json?.template?.canvasJson;
  check('template JSON is sanitised on the way in', cj && cj.badge.background === '#3366cc' && cj.fabric.objects.length === 1 && !cj.injected, JSON.stringify(cj)?.slice(0, 160));

  const launch = await call(`/api/v1/campaigns/${campaign.id}/lifecycle`, { method: 'POST', body: { action: 'launch' } });
  check('campaign launches', launch.status === 200, launch.text.slice(0, 160));
  const participantUrl = launch.json?.participantUrl || '';
  const segment = participantUrl.split('/c/')[1];

  console.log('\nParticipant flow');
  const page = await call(`/c/${segment}`, { auth: false });
  check('participant page renders without an account', page.status === 200);
  check('participant page is not indexed', /noindex/.test(page.text));
  const payload = await call(`/api/v1/c/${segment}`, { auth: false });
  check('frames are withheld until the venue code is entered', payload.json?.templates?.every((t) => t.frameUrl === null));
  const wrong = await call(`/api/v1/c/${segment}/unlock`, { method: 'POST', body: { accessCode: '0000' }, auth: false });
  check('a wrong venue code is refused', wrong.status === 403);
  const unlocked = await call(`/api/v1/c/${segment}/unlock`, { method: 'POST', body: { accessCode: '4821' }, auth: false });
  check('the right venue code releases the frames', unlocked.status === 200 && unlocked.json?.templates?.some((t) => t.frameUrl));
  const frameUrl = unlocked.json?.templates?.find((t) => t.id === uploaded.id)?.frameUrl;
  const frame = await call(frameUrl, { auth: false, raw: true });
  check('frames are served publicly with a sandboxing CSP', frame.status === 200 && /sandbox/.test(frame.headers.get('content-security-policy') || ''));

  const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#e05050' } }).jpeg().toBuffer();
  const generate = (consent) => {
    const data = new FormData();
    data.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'photo.jpg');
    data.append('templateId', uploaded.id);
    data.append('consent', String(consent));
    data.append('accessCode', '4821');
    data.append('placement', JSON.stringify({ left: 0, top: 0, width: 1e9, height: 1e9 }));
    return call(`/api/v1/c/${segment}/generate`, { method: 'POST', body: data, auth: false });
  };
  const oneTime = await generate(false);
  check('a one-time image is returned inline and not stored', oneTime.status === 200 && oneTime.json?.stored === false && oneTime.json?.image?.url?.startsWith('data:image/jpeg'), oneTime.text.slice(0, 160));
  const stored = await generate(true);
  check('a consented image is stored, with a deletion link', stored.status === 200 && stored.json?.stored === true && stored.json?.deletionUrl, stored.text.slice(0, 160));

  console.log('\nImage privacy');
  const signedUrl = stored.json?.image?.url || '';
  const assetPath = signedUrl.split('?')[0];
  const viaSignature = await call(signedUrl, { auth: false, raw: true });
  check('the participant’s signed link works', viaSignature.status === 200);
  const anonymous = await call(assetPath, { auth: false, raw: true });
  check('the same image without the signature is not found', anonymous.status === 404, `status ${anonymous.status}`);
  const tampered = await call(`${assetPath}?t=9999999999.forged`, { auth: false, raw: true });
  check('a forged signature is rejected', tampered.status === 404);
  const organizer = await call(assetPath, { raw: true });
  check('the campaign organizer can see it', organizer.status === 200);
  const exportZip = await call(`/api/v1/campaigns/${campaign.id}/gallery/export`, { raw: true });
  const zip = Buffer.from(await exportZip.arrayBuffer());
  check('the gallery exports as a ZIP', exportZip.status === 200 && zip.subarray(0, 2).toString() === 'PK');

  const token = stored.json?.deletionUrl?.split('/i/')[1];
  const deletion = await call(`/api/v1/images/${token}`, { method: 'DELETE', auth: false });
  check('the participant can delete their own image', deletion.status === 200 && deletion.json?.deleted);
  const afterDelete = await call(assetPath, { raw: true });
  check('a deleted image is gone, even for the organizer', afterDelete.status === 404);

  console.log('\nAbuse resistance');
  let throttled = false;
  for (let i = 0; i < 35 && !throttled; i += 1) {
    const r = await call(`/api/v1/c/${segment}/unlock`, { method: 'POST', body: { accessCode: String(1000 + i) }, auth: false });
    throttled = r.status === 429;
  }
  check('guessing the venue code is throttled', throttled);
  const csrf = await call('/api/v1/campaigns', { method: 'POST', body: { name: 'x' }, headers: { origin: 'https://evil.example' } });
  check('cross-origin writes are refused (CSRF)', csrf.status === 403);
  const crossSite = await call('/api/v1/campaigns', { method: 'POST', body: { name: 'x' }, headers: { 'sec-fetch-site': 'cross-site' } });
  check('cross-site requests are refused by Fetch Metadata', crossSite.status === 403);
  const huge = await call('/api/v1/campaigns', { method: 'POST', body: JSON.stringify({ name: 'x'.repeat(400_000) }) });
  check('oversized bodies are refused before parsing', huge.status === 413);
  const badJson = await call('/api/v1/campaigns', { method: 'POST', body: '{nope' });
  check('malformed JSON is a 400, not a crash', badJson.status === 400);
  const svgLogo = new FormData();
  svgLogo.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script><rect width="64" height="64" fill="#36c"/></svg>'], { type: 'image/svg+xml' }), 'logo.svg');
  const logo = await call('/api/v1/me/logo', { method: 'POST', body: svgLogo });
  const logoFile = logo.json?.logoUrl ? await call(logo.json.logoUrl, { raw: true }) : null;
  check('SVG uploads are stored as PNG', logoFile?.headers.get('content-type') === 'image/png');

  console.log('\nPlatform');
  const home = await call('/', { auth: false, raw: true });
  const csp = home.headers.get('content-security-policy') || '';
  check('pages send a Content-Security-Policy', /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp));
  check('pages send a Permissions-Policy', /camera=\(self\)/.test(home.headers.get('permissions-policy') || ''));
  check('no X-Powered-By header', !home.headers.get('x-powered-by'));
  const health = await call('/api/v1/health', { auth: false });
  check('health endpoint reports the database', health.status === 200 && health.json?.ok);
  const licences = await call('/licences', { auth: false });
  check('the licences page exists', licences.status === 200 && /MIT License/.test(licences.text));

  if (process.env.SMOKE_COMMONS !== 'off') {
    console.log('\nWikimedia Commons (network)');
    const search = await call('/api/v1/commons/search?q=confetti');
    check('Commons search returns licensed results', search.status === 200 && search.json?.results?.length > 0 && search.json.results[0].attribution?.license, search.text.slice(0, 160));
    const first = search.json?.results?.[0];
    if (first) {
      const imported = await call('/api/v1/assets/import', { method: 'POST', body: { commons: first.title } });
      check('a Commons image imports with its attribution', imported.status === 201 && imported.json?.attribution?.author, imported.text.slice(0, 160));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
