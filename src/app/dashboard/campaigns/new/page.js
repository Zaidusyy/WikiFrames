import { requireUser } from '@/lib/session';
import { EVENT_PRESETS } from '@/lib/presets';
import CampaignCreateForm from '@/components/CampaignCreateForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create campaign' };

export default async function NewCampaignPage({ searchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const preset = EVENT_PRESETS.find((p) => p.key === params?.preset) ?? null;

  return (
    <CampaignCreateForm
      defaultGroup={user.userGroup || ''}
      preset={preset}
      presets={EVENT_PRESETS.map(({ key, name, blurb }) => ({ key, name, blurb }))}
    />
  );
}
