import { requireUser } from '@/lib/session';
import { assetUrl } from '@/lib/storage';
import { KNOWN_USER_GROUPS } from '@/lib/presets';
import SettingsForm from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <SettingsForm
      userGroups={KNOWN_USER_GROUPS}
      initial={{
        wikiUsername: user.wikiUsername,
        userGroup: user.userGroup || '',
        capacity: user.capacity,
        userPageUrl: user.userPageUrl || '',
        wallOptIn: user.wallOptIn,
        wallStatus: user.wallStatus,
        role: user.role,
        logoUrl: user.logoAssetId ? assetUrl(user.logoAssetId) : null,
      }}
    />
  );
}
