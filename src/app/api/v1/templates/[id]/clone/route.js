import { prisma } from '@/lib/db';
import { assertSameOrigin, handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate, loadCampaignFor } from '@/lib/authz';
import { assetUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// ED-10 "Save As / Clone". Cloning a platform default is also how an organizer
// gets an editable copy of a read-only starter.
export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;

  const source = await prisma.template.findUnique({ where: { id } });
  if (!source || (source.ownerId && source.source !== 'platform_default')) {
    // Non-platform templates still go through the full ownership check.
    await assertOwnsTemplate(user, id);
  }

  const body = await req.json().catch(() => ({}));
  let campaignId = null;
  if (body.campaignId) {
    const { campaign } = await loadCampaignFor(user, String(body.campaignId));
    campaignId = campaign.id;
  }

  const copy = await prisma.template.create({
    data: {
      ownerId: user.id,
      campaignId,
      name: `${source.name} (Copy)`.slice(0, 80),
      source: source.source === 'platform_default' ? 'canvas' : source.source,
      aspectRatio: source.aspectRatio,
      canvasJson: source.canvasJson ?? undefined,
      // Frame bytes are immutable and shared by reference — a clone must not
      // duplicate megabytes in object storage.
      frameAssetId: source.frameAssetId,
      commonsUrl: source.commonsUrl,
      commonsAttribution: source.commonsAttribution ?? undefined,
      editable: source.editable,
      sortOrder: source.sortOrder,
    },
  });

  return ok(
    { template: { ...copy, frameUrl: copy.frameAssetId ? assetUrl(copy.frameAssetId) : null } },
    { status: 201 }
  );
});
