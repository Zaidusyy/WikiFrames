import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { effectiveStatus, daysUntil } from '@/lib/campaigns';
import { formatDate } from '@/lib/format';
import Icon from '@/components/Icon';
import { StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

// §8.1 Overview: the stats cards and a recent-activity feed.
export default async function OverviewPage() {
  const user = await requireUser();

  const where = {
    deletedAt: null,
    OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
  };

  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { images: true } } },
  });

  const campaignIds = campaigns.map((c) => c.id);
  const [shareTaps, recentImages] = await Promise.all([
    campaignIds.length
      ? prisma.analyticsEvent.count({
          where: { campaignId: { in: campaignIds }, kind: 'share_tap' },
        })
      : 0,
    campaignIds.length
      ? prisma.generatedImage.findMany({
          where: { campaignId: { in: campaignIds } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: {
            campaign: { select: { id: true, name: true } },
            role: { select: { label: true, icon: true } },
          },
        })
      : [],
  ]);

  const now = new Date();
  const active = campaigns.filter((c) => effectiveStatus(c, now) === 'active');
  const totalImages = campaigns.reduce((sum, c) => sum + c._count.images, 0);

  // RET-5: surface the campaign whose gallery expires soonest, before it does.
  const expiringSoon = campaigns
    .filter((c) => c.purgeAt && c._count.images > 0 && new Date(c.purgeAt) > now)
    .sort((a, b) => new Date(a.purgeAt) - new Date(b.purgeAt))[0];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Hello, {user.wikiUsername}</h1>
          <p className="mt-1 text-sm text-wiki-slate">
            {campaigns.length
              ? `${active.length} campaign${active.length === 1 ? '' : 's'} live right now.`
              : 'Let’s get your first campaign out into the world.'}
          </p>
        </div>
        <Link href="/dashboard/campaigns/new" className="wf-btn-primary">
          <Icon name="cdxIconAdd" size="sm" /> Create campaign
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total campaigns" value={campaigns.length} />
        <StatCard label="Active now" value={active.length} sub="Participant links are live" />
        <StatCard label="Images generated" value={totalImages} sub="Consented and stored" />
        <StatCard label="Share taps" value={shareTaps} sub="Across every campaign" />
      </div>

      {expiringSoon ? (
        <div className="wf-note flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>{expiringSoon.name}</strong> — images auto-delete in{' '}
            <strong>{daysUntil(expiringSoon.purgeAt)} days</strong>. Download the gallery ZIP if you
            want to keep a copy.
          </span>
          <Link
            href={`/dashboard/campaigns/${expiringSoon.id}/gallery`}
            className="wf-btn-secondary shrink-0"
          >
            Open gallery
          </Link>
        </div>
      ) : null}

      <section>
        <h2 className="font-serif text-xl">Your campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="wf-card mt-4 p-10 text-center">
            <Icon name="cdxIconCalendar" size="xl" className="mx-auto text-wiki-border" />
            <h3 className="mt-3 text-lg font-bold">No campaigns yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-wiki-slate">
              A campaign is one event: its frames, its badges, its caption and its QR code. Start
              from a ready-made event template and you will be live in a few minutes.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard/campaigns/new" className="wf-btn-primary">
                Create your first campaign
              </Link>
              <Link href="/dashboard/event-templates" className="wf-btn-secondary">
                Browse event templates
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {campaigns.slice(0, 6).map((campaign) => {
              const status = effectiveStatus(campaign, now);
              return (
                <li key={campaign.id}>
                  <Link
                    href={`/dashboard/campaigns/${campaign.id}`}
                    className="wf-card block p-5 transition-shadow hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold">{campaign.name}</p>
                      <StatusBadge status={status} />
                    </div>
                    <p className="mt-2 text-sm text-wiki-slate">
                      {formatDate(campaign.eventDate)} · {campaign._count.images} image
                      {campaign._count.images === 1 ? '' : 's'}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recentImages.length > 0 ? (
        <section>
          <h2 className="font-serif text-xl">Recent activity</h2>
          <ul className="wf-card mt-4 divide-y divide-wiki-line p-0">
            {recentImages.map((image) => (
              <li key={image.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                {image.role?.icon ? (
                  <span aria-hidden="true">{image.role.icon}</span>
                ) : (
                  <Icon name="cdxIconImage" size="sm" className="text-wiki-slate" />
                )}
                <span className="flex-1">
                  Someone generated an image
                  {image.role ? ` as a ${image.role.label}` : ''} in{' '}
                  <Link
                    href={`/dashboard/campaigns/${image.campaign.id}/gallery`}
                    className="font-semibold text-wiki-blue hover:underline"
                  >
                    {image.campaign.name}
                  </Link>
                </span>
                <time className="shrink-0 text-xs text-wiki-slate" dateTime={image.createdAt.toISOString()}>
                  {formatDate(image.createdAt, { hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="wf-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-wiki-slate">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-wiki-slate">{sub}</p> : null}
    </div>
  );
}

