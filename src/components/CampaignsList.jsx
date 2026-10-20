'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { formatDate } from '@/lib/format';
import Icon from '@/components/Icon';
import { Alert, Spinner, StatusBadge, cx, useConfirm, useToast } from '@/components/ui';

const FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['inactive', 'Inactive'],
  ['draft', 'Draft'],
  ['ended', 'Ended'],
  ['cancelled', 'Cancelled'],
];

// DASH-1 / DASH-2: the list, the status filter, and the "how many people
// generated images in each" number the Active/Inactive toggle exists to answer.
export default function CampaignsList() {
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/campaigns?status=${filter}`));
    } catch (err) {
      setError(err.message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id, fn, successMessage) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setToast(successMessage);
      await load();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(campaign) {
    // DASH-3: typed confirmation of the exact name, then a 7-day soft delete.
    const ok = await confirm({
      title: 'Delete this campaign?',
      body: 'This deletes the campaign, its link and every image in it. You have 7 days to change your mind, after which it cannot be recovered.',
      typeToConfirm: campaign.name,
      confirmLabel: 'Delete campaign',
      destructive: true,
    });
    if (!ok) return;
    await act(
      campaign.id,
      () => api.del(`/campaigns/${campaign.id}?confirm=${encodeURIComponent(campaign.name)}`),
      'Campaign deleted. Recoverable for 7 days.'
    );
  }

  return (
    <div className="space-y-6">
      {toast}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Campaigns</h1>
          <p className="mt-1 text-sm text-wiki-slate">
            Every event you run, its frames, its link and its gallery.
          </p>
        </div>
        <Link href="/dashboard/campaigns/new" className="wf-btn-primary">
          <Icon name="cdxIconAdd" size="sm" /> Create campaign
        </Link>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter campaigns by status">
        {FILTERS.map(([value, label]) => {
          const count = value === 'all' ? data?.campaigns.length : data?.counts?.[value];
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cx(
                'wf-chip',
                filter === value
                  ? 'bg-wiki-blue text-white ring-wiki-blue'
                  : 'bg-white text-wiki-slate ring-wiki-line hover:bg-wiki-paper'
              )}
            >
              {label}
              {count !== undefined ? (
                <span className={cx('text-xs', filter === value ? 'opacity-80' : 'text-wiki-slate')}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {!data ? (
        <Spinner label="Loading campaigns…" />
      ) : data.campaigns.length === 0 ? (
        <div className="wf-card p-10 text-center">
          <p className="text-lg font-bold">Nothing here yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-wiki-slate">
            {filter === 'all'
              ? 'Create your first campaign and you will get a link and a QR code to share.'
              : `No ${filter} campaigns right now.`}
          </p>
        </div>
      ) : (
        <div className="wf-card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-wiki-line bg-wiki-paper text-left">
              <tr>
                <Th>Campaign</Th>
                <Th>Status</Th>
                <Th>Event date</Th>
                <Th className="text-right">Images</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wiki-line">
              {data.campaigns.map((campaign) => (
                <tr key={campaign.id} className={cx(busyId === campaign.id && 'opacity-50')}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/campaigns/${campaign.id}`}
                      className="font-semibold text-wiki-blue hover:underline"
                    >
                      {campaign.name}
                    </Link>
                    <p className="text-xs text-wiki-slate">
                      {campaign.templateCount} template
                      {campaign.templateCount === 1 ? '' : 's'} · {campaign.roleCount} role
                      {campaign.roleCount === 1 ? '' : 's'}
                      {campaign.isOwner ? '' : ` · co-team of ${campaign.owner}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={campaign.effectiveStatus} />
                  </td>
                  <td className="px-4 py-3 text-wiki-slate">{formatDate(campaign.eventDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{campaign.imagesGenerated}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <SmallLink href={`/dashboard/campaigns/${campaign.id}`}>Edit</SmallLink>
                      <SmallLink href={`/dashboard/campaigns/${campaign.id}/links`}>
                        Links &amp; QR
                      </SmallLink>
                      <SmallLink href={`/dashboard/campaigns/${campaign.id}/gallery`}>
                        Gallery
                      </SmallLink>
                      <SmallButton
                        onClick={() =>
                          act(
                            campaign.id,
                            () => api.post(`/campaigns/${campaign.id}/clone`, {}),
                            'Cloned as a new draft.'
                          )
                        }
                      >
                        Clone
                      </SmallButton>
                      {campaign.effectiveStatus === 'active' ? (
                        <SmallButton
                          onClick={() =>
                            act(
                              campaign.id,
                              () => api.post(`/campaigns/${campaign.id}/lifecycle`, { action: 'pause' }),
                              'Campaign paused — the link now shows a friendly notice.'
                            )
                          }
                        >
                          Pause
                        </SmallButton>
                      ) : null}
                      {campaign.effectiveStatus === 'inactive' ? (
                        <SmallButton
                          onClick={() =>
                            act(
                              campaign.id,
                              () => api.post(`/campaigns/${campaign.id}/lifecycle`, { action: 'resume' }),
                              'Campaign is live again.'
                            )
                          }
                        >
                          Resume
                        </SmallButton>
                      ) : null}
                      {campaign.isOwner ? (
                        <SmallButton danger onClick={() => remove(campaign)}>
                          Delete
                        </SmallButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }) {
  return (
    <th className={cx('px-4 py-3 text-xs font-bold uppercase tracking-wide text-wiki-slate', className)}>
      {children}
    </th>
  );
}

function SmallLink({ href, children }) {
  return (
    <Link
      href={href}
      className="rounded border border-wiki-line px-2.5 py-1 text-xs font-medium hover:bg-wiki-paper"
    >
      {children}
    </Link>
  );
}

function SmallButton({ onClick, children, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded border px-2.5 py-1 text-xs font-medium',
        danger
          ? 'border-wiki-border text-wiki-error hover:bg-wiki-error-bg'
          : 'border-wiki-line hover:bg-wiki-paper'
      )}
    >
      {children}
    </button>
  );
}
