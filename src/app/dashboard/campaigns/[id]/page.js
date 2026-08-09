import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { serializable } from '@/lib/db';
import { effectiveStatus } from '@/lib/campaigns';
import { campaignUrl } from '@/lib/qr';
import { assetUrl } from '@/lib/storage';
import { SEEDED_ROLES } from '@/lib/presets';
import CampaignEditor from '@/components/CampaignEditor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const user = await requireUser();
    const { campaign } = await loadCampaignFor(user, id);
    return { title: campaign.name };
  } catch {
    return { title: 'Campaign' };
  }
}

export default async function CampaignPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;

  const user = await requireUser();
  let loaded;
  try {
    loaded = await loadCampaignFor(user, id, {
      include: {
        roles: { orderBy: { sort: 'asc' } },
        captions: { orderBy: { sort: 'asc' } },
        templates: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { images: true } },
      },
    });
  } catch {
    notFound();
  }

  const { campaign, access } = loaded;

  return (
    <CampaignEditor
      access={access}
      initialStep={query?.step || 'details'}
      seededRoles={SEEDED_ROLES}
      campaign={serializable({
        ...campaign,
        effectiveStatus: effectiveStatus(campaign),
        participantUrl: campaignUrl(campaign.slug, campaign.linkToken),
        imagesGenerated: campaign._count.images,
        templates: campaign.templates.map((t) => ({
          ...t,
          frameUrl: t.frameAssetId ? assetUrl(t.frameAssetId) : null,
        })),
      })}
    />
  );
}
