import archiver from 'archiver';
import { PassThrough, Readable } from 'node:stream';
import { ratioDims } from '@/lib/config';
import { prisma } from '@/lib/db';
import { handler, notFound } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate } from '@/lib/authz';
import { getObject } from '@/lib/storage';
import { cutoutRect, renderBlankFrame } from '@/lib/composite';
import { slugify } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

/**
 * §10.3 / ED-11 — the "download → design in Canva → re-upload" loop.
 *
 * The designer gets the frame PNG with the cutout punched all the way to
 * transparent, plus a spec sheet listing the exact canvas size, cutout box and
 * safe areas. Getting those numbers right is what makes the re-upload validate
 * on the first try.
 */
export const GET = handler(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const template = await assertOwnsTemplate(user, id).catch(async (err) => {
    // Platform starters are downloadable by any signed-in organizer.
    const platform = await prisma.template.findFirst({
      where: { id, source: 'platform_default' },
    });
    if (platform) return platform;
    throw err;
  });
  if (!template) throw notFound('Template not found');

  const dims = ratioDims(template.aspectRatio);
  const cutout = template.canvasJson?.cutout;
  const rect = cutoutRect(cutout, dims.w, dims.h);

  // A canvas template that has been flattened already has its frame in storage;
  // otherwise we render the blank frame on the fly.
  let framePng;
  if (template.frameAssetId) {
    framePng = await getObject(
      (await prisma.asset.findUnique({ where: { id: template.frameAssetId } })).storageKey
    );
  } else {
    framePng = (await renderBlankFrame({
      aspectRatio: template.aspectRatio,
      cutout,
      label: template.name,
    })).buffer;
  }

  const format = new URL(req.url).searchParams.get('format');
  const base = slugify(template.name);

  if (format === 'png') {
    return new Response(framePng, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${base}-frame.png"`,
      },
    });
  }

  const spec = buildSpecSheet({ template, dims, rect });
  const archive = archiver('zip', { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);
  archive.append(framePng, { name: `${base}-frame.png` });
  archive.append(spec, { name: 'SPEC.txt' });
  archive.finalize();

  return new Response(Readable.toWeb(passthrough), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${base}-template.zip"`,
      'Cache-Control': 'no-store',
    },
  });
});

function buildSpecSheet({ template, dims, rect }) {
  const safe = Math.round(Math.min(dims.w, dims.h) * 0.05);
  return [
    `WikiFrames template spec — ${template.name}`,
    '='.repeat(60),
    '',
    `Aspect ratio    : ${template.aspectRatio}`,
    `Canvas size     : ${dims.w} x ${dims.h} px`,
    `Safe area inset : ${safe} px on every edge`,
    '',
    'PHOTO CUTOUT (must stay fully transparent)',
    `  shape         : ${rect.shape}`,
    `  position      : x=${Math.round(rect.x)} px, y=${Math.round(rect.y)} px (top-left)`,
    `  size          : ${Math.round(rect.w)} x ${Math.round(rect.h)} px`,
    rect.shape === 'rounded' ? `  corner radius : ${rect.radius} px` : null,
    '',
    'HOW TO USE THIS',
    '  1. Open the PNG in Canva, Figma, Inkscape or any editor you like.',
    '  2. Design AROUND the transparent hole — do not paint over it.',
    '  3. Keep the canvas at exactly the size above; do not resize or crop.',
    '  4. Export as PNG with transparency (not JPG — JPG has no transparency).',
    '  5. Come back to WikiFrames and use "Upload frame" on your campaign.',
    '',
    'WikiFrames will check the size, the ratio and that the cutout is really',
    'transparent, then show you a live preview with a sample photo before it',
    'accepts the file.',
    '',
    'LICENSING',
    '  Please use only artwork you have the right to publish — ideally files',
    '  already hosted on Wikimedia Commons under a free licence.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
