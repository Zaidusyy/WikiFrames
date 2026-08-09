import { requireUser } from '@/lib/session';
import CampaignPicker from '@/components/CampaignPicker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team' };

export default async function TeamIndexPage() {
  const user = await requireUser();
  return (
    <CampaignPicker
      userId={user.id}
      title="Team"
      blurb="Invite co-team members to help run a campaign. They can edit everything — templates, roles, captions — but only you can cancel or delete it."
      hrefFor={(campaign) => `/dashboard/campaigns/${campaign.id}/team`}
      emptyHint="Create a campaign first, then invite the people helping you run it."
    />
  );
}
