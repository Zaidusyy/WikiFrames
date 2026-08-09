import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

/**
 * §17.2 — privacy-respecting analytics.
 *
 * Every number here is a COUNT over the analytics_events table, which holds a
 * campaign id, an event kind and a tiny JSON blob. There is no session, no
 * cookie and no per-person row to aggregate, by design.
 */
export default async function AnalyticsPage({ params }) {
  const { id } = await params;
  const user = await requireUser();

  let loaded;
  try {
    loaded = await loadCampaignFor(user, id);
  } catch {
    notFound();
  }
  const { campaign } = loaded;

  const [events, stored, byTemplate, byRole, templates, roles] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ['kind'],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    }),
    prisma.generatedImage.count({ where: { campaignId: campaign.id } }),
    prisma.generatedImage.groupBy({
      by: ['templateId'],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    }),
    prisma.generatedImage.groupBy({
      by: ['roleId'],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    }),
    prisma.template.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, name: true },
    }),
    prisma.campaignRole.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, label: true },
    }),
  ]);

  const shares = await prisma.analyticsEvent.findMany({
    where: { campaignId: campaign.id, kind: 'share_tap' },
    select: { meta: true },
    take: 5000,
  });

  const counts = Object.fromEntries(events.map((e) => [e.kind, e._count._all]));
  const templateNames = new Map(templates.map((t) => [t.id, t.name]));
  const roleNames = new Map(roles.map((r) => [r.id, r.label]));

  const platforms = {};
  for (const share of shares) {
    const platform = share.meta?.platform || 'other';
    platforms[platform] = (platforms[platform] || 0) + 1;
  }

  const generated = counts.generate || 0;
  const linkOpens = counts.link_open || 0;
  const qrScans = counts.qr_scan || 0;

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/dashboard/campaigns/${campaign.id}`} className="text-sm font-semibold text-wiki-blue hover:underline">
          ← {campaign.name}
        </Link>
        <h1 className="mt-2 font-serif text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-wiki-slate">
          Aggregate counters only. No cookies, no fingerprinting, nothing that identifies a
          participant.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Link opens" value={linkOpens} />
        <Metric
          label="QR vs direct"
          value={linkOpens ? `${Math.round((qrScans / linkOpens) * 100)}%` : '—'}
          sub={`${qrScans} scanned the QR`}
        />
        <Metric label="Images generated" value={generated} />
        <Metric
          label="Consent rate"
          value={generated ? `${Math.round((stored / generated) * 100)}%` : '—'}
          sub={`${stored} kept for the gallery`}
        />
        <Metric label="Downloads" value={counts.download || 0} />
        <Metric label="Share taps" value={counts.share_tap || 0} />
        <Metric
          label="Share rate"
          value={generated ? `${Math.round(((counts.share_tap || 0) / generated) * 100)}%` : '—'}
          sub="of generated images"
        />
        <Metric label="Stored right now" value={stored} sub="Auto-deletes on schedule" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Breakdown
          title="By template"
          rows={byTemplate.map((row) => ({
            label: templateNames.get(row.templateId) || 'Removed template',
            count: row._count._all,
          }))}
        />
        <Breakdown
          title="By role"
          rows={byRole.map((row) => ({
            label: row.roleId ? roleNames.get(row.roleId) || 'Removed role' : 'No badge chosen',
            count: row._count._all,
          }))}
        />
        <Breakdown
          title="Shares by platform"
          rows={Object.entries(platforms).map(([label, count]) => ({ label, count }))}
        />
      </div>
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

function Breakdown({ title, rows }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const sorted = [...rows].sort((a, b) => b.count - a.count);

  return (
    <div className="wf-card p-5">
      <h2 className="font-serif text-lg">{title}</h2>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-wiki-slate">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((row) => (
            <li key={row.label}>
              <div className="flex justify-between text-sm">
                <span className="truncate pr-2">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{row.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-wiki-paper">
                <div
                  className="h-full rounded-full bg-wiki-blue"
                  style={{ width: `${total ? (row.count / total) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
