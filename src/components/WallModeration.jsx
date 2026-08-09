'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Button, Spinner, cx, useToast } from '@/components/ui';

const TABS = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['hidden', 'Hidden'],
  ['all', 'All'],
];

// WALL-3 — nothing reaches the public homepage without passing through here.
// The queue is what keeps spam and rights-violating logos off the front door.
export default function WallModeration() {
  const [status, setStatus] = useState('pending');
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    setEntries(null);
    try {
      const res = await api.get(`/admin/wall?status=${status}`);
      setEntries(res.entries);
    } catch (err) {
      setError(err.message);
      setEntries([]);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(entry, wallStatus) {
    try {
      await api.patch('/admin/wall', { userId: entry.id, wallStatus });
      setEntries((current) => current.filter((e) => e.id !== entry.id));
      setToast(
        wallStatus === 'approved'
          ? `${entry.userGroup || entry.wikiUsername} is now on the wall.`
          : 'Entry hidden.'
      );
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {toast}

      <header>
        <h1 className="font-serif text-3xl">Community wall</h1>
        <p className="mt-1 max-w-2xl text-sm text-wiki-slate">
          Groups that opted in to being featured on the homepage. Approve the ones that are genuine
          and whose logo they have the right to publish; hide anything else.
        </p>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      <div className="flex flex-wrap gap-2">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={cx(
              'wf-chip',
              status === value
                ? 'bg-wiki-blue text-white ring-wiki-blue'
                : 'bg-white text-wiki-slate ring-wiki-line hover:bg-wiki-paper'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!entries ? (
        <Spinner label="Loading queue…" />
      ) : entries.length === 0 ? (
        <div className="wf-card p-10 text-center text-sm text-wiki-slate">
          Nothing {status === 'all' ? 'here' : `in ${status}`} right now.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.id} className="wf-card flex flex-col gap-3 p-5">
              <div className="flex h-24 items-center justify-center rounded-lg bg-wiki-paper">
                {entry.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.logoUrl} alt="" className="max-h-20 object-contain" />
                ) : (
                  <span className="text-xs text-wiki-slate">No logo uploaded</span>
                )}
              </div>

              <div>
                <p className="font-bold">{entry.userGroup || 'No group name given'}</p>
                <p className="text-sm text-wiki-slate">{entry.wikiUsername}</p>
                {entry.userPageUrl ? (
                  <a
                    href={entry.userPageUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 block truncate text-xs text-wiki-blue hover:underline"
                  >
                    {entry.userPageUrl}
                  </a>
                ) : null}
                <p className="mt-1 text-[11px] uppercase tracking-wide text-wiki-slate">
                  {entry.wallStatus}
                </p>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-2">
                <Button
                  className="justify-center px-2 py-2 text-xs"
                  onClick={() => decide(entry, 'approved')}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  className="justify-center px-2 py-2 text-xs"
                  onClick={() => decide(entry, 'hidden')}
                >
                  Hide
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
