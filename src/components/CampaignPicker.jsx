import Link from 'next/link';
import { prisma } from '@/lib/db';
import { effectiveStatus } from '@/lib/campaigns';
import { formatDate } from '@/lib/format';

/**
 * The side-nav has one entry each for Gallery, Links & QR and Team, but all
 * three live *inside* a campaign. Rather than guessing which campaign the
 * organizer meant, those entries land here and ask.
 */
export default async function CampaignPicker({ userId, title, blurb, hrefFor, emptyHint }) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { images: true, members: true } } },
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-wiki-slate">{blurb}</p>
      </header>

      {campaigns.length === 0 ? (
        <div className="wf-card p-10 text-center">
          <p className="text-lg font-bold">No campaigns yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-wiki-slate">{emptyHint}</p>
          <Link href="/dashboard/campaigns/new" className="wf-btn-primary mt-6">
            Create a campaign
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={hrefFor(campaign)}
                className="wf-card block p-5 transition-shadow hover:shadow-lg"
              >
                <p className="font-bold">{campaign.name}</p>
                <p className="mt-1 text-sm text-wiki-slate">
                  {effectiveStatus(campaign, now)} · {formatDate(campaign.eventDate)}
                </p>
                <p className="mt-3 text-sm font-semibold text-wiki-blue">
                  {campaign._count.images} image{campaign._count.images === 1 ? '' : 's'} ·{' '}
                  {campaign._count.members} co-team →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
