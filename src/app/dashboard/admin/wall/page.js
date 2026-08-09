import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import WallModeration from '@/components/WallModeration';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Community wall moderation' };

export default async function WallModerationPage() {
  const user = await getCurrentUser();
  // WALL-3 / SEC-7: the approval queue is a super-admin surface only.
  if (!user || user.role !== 'super_admin') redirect('/dashboard');
  return <WallModeration />;
}
