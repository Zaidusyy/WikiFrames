import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Platform stats' };

// §4.1 Super Admin: platform-wide health, measured against the §3.2 targets so
// it is obvious whether the product is doing what it set out to do.
export default async function PlatformOverviewPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'super_admin') redirect('/dashboard');

  const [users, groups, campaigns, activeCampaigns, stored, generated, shares, pending, expiring, featured] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        where: { userGroup: { not: null } },
        distinct: ['userGroup'],
        select: { userGroup: true },
      }),
      prisma.campaign.count({ where: { deletedAt: null } }),
      prisma.campaign.count({ where: { status: 'active', deletedAt: null } }),
      prisma.generatedImage.count(),
      prisma.analyticsEvent.count({ where: { kind: 'generate' } }),
      prisma.analyticsEvent.count({ where: { kind: 'share_tap' } }),
      prisma.user.count({ where: { wallOptIn: true, wallStatus: 'pending' } }),
      prisma.generatedImage.count({ where: { expiresAt: { lte: new Date() } } }),
      prisma.user.count({ where: { wallOptIn: true, wallStatus: 'approved' } }),
    ]);

  const targets = [
    ['Campaigns created', campaigns, 50],
    ['Distinct user groups', groups.length, 20],
    ['Participant images generated', generated, 5000],
    ['Featured groups on the wall', featured, 10],
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Platform stats</h1>
        <p className="mt-1 text-sm text-wiki-slate">
          Everything across every organizer on this instance.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Organizers" value={users} />
        <Metric label="User groups" value={groups.length} />
        <Metric label="Campaigns" value={campaigns} sub={`${activeCampaigns} active`} />
        <Metric label="Images stored" value={stored} />
        <Metric label="Images generated" value={generated} sub="Including one-time, unstored" />
        <Metric
          label="Share rate"
          value={generated ? `${Math.round((shares / generated) * 100)}%` : '—'}
          sub={`${shares} share taps`}
        />
        <Metric label="Wall entries waiting" value={pending} />
        <Metric
          label="Overdue purges"
          value={expiring}
          sub={expiring ? 'Retention job is behind!' : 'Retention is on schedule'}
        />
      </div>

      {/* RET-4 / SEC-6: an overdue purge is a broken promise, not a backlog. */}
      {expiring > 0 ? (
        <div className="rounded border border-wiki-error-border bg-wiki-error-bg px-4 py-3 text-sm text-wiki-ink">
          <strong>{expiring} image(s) are past their deletion date.</strong> The retention job has
          not run, or it failed. Run <code>npm run purge</code> or check the cron alert — this is a
          privacy commitment, not a cleanup task.
        </div>
      ) : null}

      <section>
        <h2 className="font-serif text-xl">Against the launch targets</h2>
        <p className="mt-1 text-sm text-wiki-slate">
          The six-month goals from the product spec.
        </p>
        <ul className="mt-4 space-y-4">
          {targets.map(([label, value, target]) => (
            <li key={label}>
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="font-semibold tabular-nums">
                  {value} / {target}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-wiki-paper">
                <div
                  className="h-full rounded-full bg-wiki-blue"
                  style={{ width: `${Math.min(100, (value / target) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="wf-card p-5 text-sm">
        <h2 className="font-serif text-lg">Instance configuration</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <Row label="Base URL" value={config.baseUrl} />
          <Row label="Retention window" value={`${config.retention.days} days`} />
          <Row label="Storage driver" value={config.storage.driver} />
          <Row
            label="Generate rate limit"
            value={`${config.limits.generatePerHourPerIp}/hour/IP`}
          />
          <Row label="OAuth configured" value={config.oauth.clientId ? 'yes' : 'no'} />
          <Row label="Cron secret set" value={config.retention.cronSecret ? 'yes' : 'no'} />
          <Row
            label="Retention safety net"
            value={config.retention.schedulerEnabled ? `every ${config.retention.schedulerIntervalMinutes} min` : 'off'}
          />
          <Row label="Trusted proxy hops" value={String(config.trustProxyHops)} />
        </dl>
        <Link href="/dashboard/admin/wall" className="mt-4 inline-block font-semibold text-wiki-blue hover:underline">
          Review the community wall queue →
        </Link>
      </section>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="wf-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-wiki-slate">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-wiki-slate">{sub}</p> : null}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b border-wiki-line py-1.5">
      <dt className="text-wiki-slate">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
