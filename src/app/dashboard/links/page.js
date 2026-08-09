import { requireUser } from '@/lib/session';
import CampaignPicker from '@/components/CampaignPicker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Links & QR' };

export default async function LinksIndexPage() {
  const user = await requireUser();
  return (
    <CampaignPicker
      userId={user.id}
      title="Links & QR"
      blurb="Every campaign has one secure participant link and a matching QR code. Pick a campaign to copy the link, download the QR, or reissue both if a link has leaked."
      hrefFor={(campaign) => `/dashboard/campaigns/${campaign.id}/links`}
      emptyHint="Links are issued when you launch a campaign."
    />
  );
}
