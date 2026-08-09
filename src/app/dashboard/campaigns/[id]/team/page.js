import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import TeamPanel from '@/components/TeamPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team' };

export default async function CampaignTeamPage({ params }) {
  const { id } = await params;
  const user = await requireUser();

  let loaded;
  try {
    loaded = await loadCampaignFor(user, id, {
      include: {
        members: { include: { user: { select: { id: true, wikiUsername: true, userPageUrl: true } } } },
        owner: { select: { wikiUsername: true, userPageUrl: true } },
      },
    });
  } catch {
    notFound();
  }

  const { campaign, access } = loaded;

  return (
    <TeamPanel
      campaign={{ id: campaign.id, name: campaign.name }}
      owner={campaign.owner}
      initialMembers={campaign.members.map((m) => ({
        userId: m.user.id,
        wikiUsername: m.user.wikiUsername,
        userPageUrl: m.user.userPageUrl,
      }))}
      canInvite={access !== 'co_team'}
    />
  );
}
