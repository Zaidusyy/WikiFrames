'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, downloadUrl } from '@/lib/client';
import { formatDate } from '@/lib/format';
import Icon from '@/components/Icon';
import { Alert, Button, Spinner, cx, useConfirm, useToast } from '@/components/ui';

// §17.1 — the admin gallery: images as they arrive, per-image and bulk export,
// moderation removal, and RET-5's countdown on everything.
export default function GalleryPanel({ campaign }) {
  const [data, setData] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [images, setImages] = useState([]);
  const [error, setError] = useState(null);
  const [toast, setToast] = useToast();
  const confirm = useConfirm();

  const load = useCallback(
    async (nextCursor) => {
      try {
        const res = await api.get(
          `/campaigns/${campaign.id}/gallery${nextCursor ? `?cursor=${nextCursor}` : ''}`
        );
        setData(res);
        setImages((current) => (nextCursor ? [...current, ...res.images] : res.images));
        setCursor(res.nextCursor);
      } catch (err) {
        setError(err.message);
      }
    },
    [campaign.id]
  );

  useEffect(() => {
    load(null);
  }, [load]);

  async function remove(image) {
    const ok = await confirm({
      title: 'Remove this image?',
      body: 'It is deleted permanently, from the gallery and from storage. The participant’s own copy is not affected.',
      confirmLabel: 'Delete image',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.del(`/campaigns/${campaign.id}/gallery/${image.id}`);
      setImages((current) => current.filter((i) => i.id !== image.id));
      setToast('Image removed.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {toast}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/dashboard/campaigns/${campaign.id}`}
            className="text-sm font-semibold text-wiki-blue hover:underline"
          >
            ← {campaign.name}
          </Link>
          <h1 className="mt-2 font-serif text-3xl">Gallery</h1>
          {data ? (
            <p className="mt-1 text-sm text-wiki-slate">
              {images.length} image{images.length === 1 ? '' : 's'} · consented only
              {campaign.publicGallery ? (
                <>
                  {' · '}
                  <Link href={`/gallery/${campaign.slug}`} className="text-wiki-blue hover:underline">
                    public page
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {images.length > 0 ? (
          <a
            href={downloadUrl(`/campaigns/${campaign.id}/gallery/export`)}
            className="wf-btn-primary"
          >
            <Icon name="cdxIconDownload" size="sm" /> Download all (ZIP)
          </a>
        ) : null}
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      {/* RET-5: the countdown, stated in the same words as the promise. */}
      {data?.retention ? (
        <div
          className={cx(
            'rounded border px-4 py-3 text-sm text-wiki-ink',
            (data.retention.daysRemaining ?? 99) <= 7
              ? 'border-wiki-warning-border bg-wiki-warning-bg'
              : 'border-wiki-blue/40 bg-wiki-blue-light'
          )}
        >
          <strong>{data.retention.notice}.</strong> After that they are permanently deleted from our
          servers — download the ZIP if you want to keep them.
          {data.retention.purgeAt ? (
            <span className="block text-xs opacity-80">
              Deletion date: {formatDate(data.retention.purgeAt)}
            </span>
          ) : null}
        </div>
      ) : null}

      {!data ? (
        <Spinner label="Loading gallery…" />
      ) : images.length === 0 ? (
        <div className="wf-card p-12 text-center">
          <Icon name="cdxIconImageGallery" size="xl" className="mx-auto text-wiki-border" />
          <h2 className="mt-3 text-lg font-bold">No images yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-wiki-slate">
            Images appear here as participants create them — but only the ones whose creators ticked
            the storage box. People who decline are never stored, which is exactly as intended.
          </p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((image) => (
              <li key={image.id} className="wf-card overflow-hidden p-0">
                {/* GAL-4: lazy-loaded thumbnails; the original is one click away. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={`Participant image${image.role ? ` — ${image.role}` : ''}`}
                  loading="lazy"
                  className="aspect-square w-full bg-wiki-paper object-contain"
                />
                <div className="space-y-1.5 p-3">
                  <p className="truncate text-xs font-semibold">
                    {image.roleIcon ? `${image.roleIcon} ` : ''}
                    {image.role || 'No badge'}
                  </p>
                  <p className="text-[11px] text-wiki-slate">
                    {formatDate(image.createdAt)} · {image.aspectRatio}
                  </p>
                  <p
                    className={cx(
                      'text-[11px] font-medium',
                      image.daysRemaining <= 7 ? 'text-wiki-warning' : 'text-wiki-slate'
                    )}
                  >
                    Deletes in {image.daysRemaining} days
                  </p>
                  <div className="flex gap-1.5 pt-1">
                    <a
                      href={image.url}
                      download
                      className="flex-1 rounded border border-wiki-line px-2 py-1 text-center text-[11px] font-medium hover:bg-wiki-paper"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(image)}
                      className="rounded border border-wiki-border px-2 py-1 text-[11px] font-bold text-wiki-error hover:bg-wiki-error-bg"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {cursor ? (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => load(cursor)}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
