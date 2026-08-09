'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { Alert, Button, Spinner } from '@/components/ui';

export default function DeleteMyImage({ token }) {
  const [state, setState] = useState('loading'); // loading | found | gone | deleted
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/images/${token}`)
      .then((res) => {
        setData(res);
        setState('found');
      })
      .catch(() => setState('gone'));
  }, [token]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/images/${token}`);
      setState('deleted');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <div className="wf-card p-8">
        {state === 'loading' ? <Spinner label="Checking your link…" /> : null}

        {state === 'gone' ? (
          <div className="text-center">
            <span aria-hidden="true" className="text-5xl">
              ✅
            </span>
            <h1 className="mt-4 font-serif text-2xl">Nothing to delete</h1>
            <p className="mt-3 leading-relaxed text-wiki-slate">
              This image has already been deleted, or it reached its 30-day expiry and was removed
              automatically. Either way, we are not holding a copy.
            </p>
          </div>
        ) : null}

        {state === 'deleted' ? (
          <div className="text-center">
            <span aria-hidden="true" className="text-5xl">
              🗑️
            </span>
            <h1 className="mt-4 font-serif text-2xl">Deleted</h1>
            <p className="mt-3 leading-relaxed text-wiki-slate">
              Your image is gone from our servers and from the campaign gallery. The copy you
              downloaded is still yours — this only removes ours.
            </p>
          </div>
        ) : null}

        {state === 'found' && data ? (
          <div>
            <h1 className="font-serif text-2xl">Delete your image?</h1>
            <p className="mt-2 text-sm text-wiki-slate">
              From <strong>{data.campaign}</strong>, created {formatDate(data.image.createdAt)}.
            </p>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.image.url}
              alt="Your generated image"
              className="mt-4 w-full rounded-lg border border-wiki-line"
            />

            <p className="mt-4 text-sm leading-relaxed text-wiki-slate">
              It is currently scheduled for automatic deletion on{' '}
              <strong>{formatDate(data.image.expiresAt)}</strong>. You can remove it right now
              instead — permanently, with no way back.
            </p>

            <Alert onDismiss={() => setError(null)}>{error}</Alert>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="danger" onClick={remove} disabled={busy} className="flex-1">
                {busy ? 'Deleting…' : 'Yes, delete it now'}
              </Button>
              <Link href="/" className="wf-btn-secondary flex-1 justify-center">
                Keep it
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <Link href="/privacy" className="mt-6 text-center text-sm font-semibold text-wiki-blue hover:underline">
        Read our data promises →
      </Link>
    </main>
  );
}
