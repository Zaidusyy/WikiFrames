import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);
  const captions = await prisma.caption.findMany({
    where: { campaignId: campaign.id },
    orderBy: { sort: 'asc' },
  });
  return ok({ captions });
});

// CAP-1/CAP-2: exactly one mandatory caption, up to three optional alternatives,
// one shared hashtag set appended to all of them.
export const PUT = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);

  const { captions, hashtags } = await readJson(req);
  if (!Array.isArray(captions) || captions.length === 0) {
    throw badRequest('Add at least one caption — it is what every shared image carries.');
  }
  if (captions.length > 4) {
    throw badRequest('Keep it to one mandatory caption plus up to three alternatives.');
  }

  const sharedTags = normalizeHashtags(hashtags);
  // Drop empty entries *before* deciding which one is mandatory — otherwise a
  // blank first caption would leave the campaign with no mandatory caption.
  const cleaned = captions
    .map((c) => String(c?.text || '').trim().slice(0, 400))
    .filter(Boolean)
    .map((text, i) => ({ text, hashtags: sharedTags, isMandatory: i === 0, sort: i }));

  if (!cleaned.length) throw badRequest('Captions cannot be empty.');

  await prisma.$transaction([
    prisma.caption.deleteMany({ where: { campaignId: campaign.id } }),
    prisma.caption.createMany({
      data: cleaned.map((c) => ({ ...c, campaignId: campaign.id })),
    }),
  ]);

  const saved = await prisma.caption.findMany({
    where: { campaignId: campaign.id },
    orderBy: { sort: 'asc' },
  });
  return ok({ captions: saved });
});

/** Accepts "wiki, #Wikimedia  OpenKnowledge" and returns "#wiki #Wikimedia #OpenKnowledge". */
function normalizeHashtags(input) {
  return String(input || '')
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean)
    .slice(0, 15)
    .map((tag) => `#${tag}`)
    .join(' ');
}
