import { config } from '@/lib/config';
import { prisma } from '@/lib/db';
import { assertSameOrigin, badRequest, handler, ok, readJson } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { assertOwnsTemplate, loadCampaignFor } from '@/lib/authz';
import { enforce } from '@/lib/ratelimit';
import { assetUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// ED-10 "Save As / Clone". Cloning a platform default is also how an organizer
// gets an editable copy of a read-only starter.
export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await params;
  enforce(`template-create:${user.id}`, 120);

  const found = typeof id === 'string' ? await prisma.template.findUnique({ where: { id } }) : null;
  // Platform starters are cloneable by anyone signed in; everything else goes
  // through the full ownership check.
  const source =
    found && found.source === 'platform_default' && !found.ownerId ? found : await assertOwnsTemplate(user, id);

  const body = await readJson(req);
  let campaignId = null;
  if (body.campaignId) {
    const { campaign } = await loadCampaignFor(user, String(body.campaignId));
    const count = await prisma.template.count({ where: { campaignId: campaign.id } });
    if (count >= config.limits.templatesPerCampaign) {
      throw badRequest(`A campaign can hold at most ${config.limits.templatesPerCampaign} templates.`);
    }
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
