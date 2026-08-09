import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { assetUrl } from '@/lib/storage';
import DashboardShell from '@/components/DashboardShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Dashboard', template: '%s · WikiFrames' } };

export default async function DashboardLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect('/api/v1/auth/wikimedia');
  // A half-finished profile means campaigns would launch without an organizing
  // group, so finish onboarding first (§7).
  if (!user.onboardedAt) redirect('/onboarding');

  return (
    <DashboardShell
      user={{
        wikiUsername: user.wikiUsername,
        userGroup: user.userGroup,
        role: user.role,
        logoUrl: user.logoAssetId ? assetUrl(user.logoAssetId) : null,
      }}
    >
      {children}
    </DashboardShell>
  );
}
