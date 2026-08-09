import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { KNOWN_USER_GROUPS } from '@/lib/presets';
import { assetUrl } from '@/lib/storage';
import OnboardingWizard from '@/components/OnboardingWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome' };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/api/v1/auth/wikimedia');

  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-12">
      <OnboardingWizard
        initial={{
          wikiUsername: user.wikiUsername,
          userGroup: user.userGroup || '',
          capacity: user.capacity || 'organizer',
          userPageUrl: user.userPageUrl || '',
          wallOptIn: user.wallOptIn,
          logoUrl: user.logoAssetId ? assetUrl(user.logoAssetId) : null,
          onboarded: Boolean(user.onboardedAt),
        }}
        userGroups={KNOWN_USER_GROUPS}
      />
    </main>
  );
}
