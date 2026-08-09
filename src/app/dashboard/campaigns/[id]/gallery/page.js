import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import GalleryPanel from '@/components/GalleryPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gallery' };

export default async function CampaignGalleryPage({ params }) {
  const { id } = await params;
  const user = await requireUser();

  let loaded;
  try {
    loaded = await loadCampaignFor(user, id);
  } catch {
    notFound();
  }

  return (
    <GalleryPanel
      campaign={{
        id: loaded.campaign.id,
        name: loaded.campaign.name,
        publicGallery: loaded.campaign.publicGallery,
        slug: loaded.campaign.slug,
      }}
    />
  );
}
