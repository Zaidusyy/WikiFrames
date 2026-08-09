import { requireUser } from '@/lib/session';
import CampaignPicker from '@/components/CampaignPicker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gallery' };

export default async function GalleryIndexPage() {
  const user = await requireUser();
  return (
    <CampaignPicker
      userId={user.id}
      title="Gallery"
      blurb="Generated participant images, per campaign. Only images whose creators agreed to storage appear here, and every one of them carries a 30-day countdown."
      hrefFor={(campaign) => `/dashboard/campaigns/${campaign.id}/gallery`}
      emptyHint="Galleries fill up once a campaign is live and people start creating."
    />
  );
}
