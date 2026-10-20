'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import Icon from '@/components/Icon';
import { cx } from '@/components/ui';

const SUGGESTIONS = ['Confetti', 'Monument', 'Pattern', 'Library', 'Wikimania', 'Flowers', 'Lighthouse'];

/**
 * The editor's media library: Wikimedia Commons, searchable in place, plus
 * the organizer's own images. Every Commons result shows its licence before
 * it is used, and its attribution travels with the layer from then on.
 */
export default function MediaLibrary({ onInsert, onUploadFiles, busy }) {
  const [tab, setTab] = useState('commons');
  return (
    <div className="space-y-3">
      <div className="flex border-b border-wiki-line" role="tablist" aria-label="Image source">
        {[
          ['commons', 'Wikimedia Commons'],
          ['upload', 'Upload'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx('wf-tab', tab === key && 'wf-tab-active')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'commons' ? <CommonsSearch onInsert={onInsert} busy={busy} /> : <UploadPane onUploadFiles={onUploadFiles} busy={busy} />}
    </div>
  );
}

function CommonsSearch({ onInsert, busy }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [inserting, setInserting] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setNextOffset(null);
      setState('idle');
      return undefined;
    }
    const id = ++requestRef.current;
    const timer = setTimeout(async () => {
      setState('loading');
      setError(null);
      try {
        const res = await api.get(`/commons/search?q=${encodeURIComponent(q)}`);
        if (id !== requestRef.current) return;
        setResults(res.results);
        setNextOffset(res.nextOffset);
        setState('done');
      } catch (err) {
        if (id !== requestRef.current) return;
        setError(err.message);
        setState('error');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  async function loadMore() {
    if (nextOffset === null) return;
    setState('loading');
    try {
      const res = await api.get(`/commons/search?q=${encodeURIComponent(query.trim())}&offset=${nextOffset}`);
      setResults((current) => [...current, ...res.results]);
      setNextOffset(res.nextOffset);
      setState('done');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }

  async function insert(result) {
    setInserting(result.title);
    try {
      await onInsert({ commons: result.title });
    } finally {
      setInserting(null);
    }
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search Wikimedia Commons</span>
        <Icon name="cdxIconSearch" size="sm" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-wiki-muted" />
        <input
          className="wf-input pl-8"
          type="search"
          placeholder="Search 100+ million free images"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {state === 'idle' ? (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-wiki-slate">
            Every file on Commons is free to reuse under its licence. Try:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="wf-chip bg-white py-0.5 text-xs text-wiki-ink ring-wiki-line hover:bg-wiki-paper"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-wiki-error">{error}</p> : null}

      {results.length ? (
        <ul className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto pr-1">
          {results.map((r) => (
            <li key={r.title}>
              <button
                type="button"
                onClick={() => insert(r)}
                disabled={busy || Boolean(inserting)}
                title={`${r.title.replace(/^File:/, '')} — ${r.attribution.author}, ${r.attribution.license}`}
                className="group block w-full overflow-hidden rounded border border-wiki-line bg-white text-left hover:border-wiki-blue disabled:opacity-60"
              >
                <span className="wf-checker block aspect-square overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="block truncate px-1.5 pt-1 text-[11px] font-bold text-wiki-ink">
                  {inserting === r.title ? 'Adding…' : r.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')}
                </span>
                <span className="block truncate px-1.5 pb-1 text-[10px] text-wiki-slate">{r.attribution.license}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : state === 'done' ? (
        <p className="text-xs text-wiki-slate">No images found. Try a different word.</p>
      ) : null}

      {state === 'loading' ? <p className="text-xs text-wiki-slate">Searching Commons…</p> : null}
      {nextOffset !== null && state === 'done' ? (
        <button type="button" onClick={loadMore} className="wf-btn-secondary w-full text-xs">
          Load more
        </button>
      ) : null}

      <p className="text-[11px] leading-relaxed text-wiki-slate">
        Thumbnails load from Wikimedia’s servers. Images you add are copied into WikiFrames with
        their author and licence, so the credit stays with your frame.
      </p>
    </div>
  );
}

function UploadPane({ onUploadFiles, busy }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-3">
      <label
        className={cx(
          'flex cursor-pointer flex-col items-center gap-2 rounded border-2 border-dashed p-6 text-center transition-colors',
          dragging ? 'border-wiki-blue bg-wiki-blue-light' : 'border-wiki-line hover:bg-wiki-paper'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onUploadFiles([...e.dataTransfer.files]);
        }}
      >
        <Icon name="cdxIconUpload" size="lg" className="text-wiki-slate" />
        <span className="text-sm font-bold">{busy ? 'Uploading…' : 'Drop images or choose files'}</span>
        <span className="text-xs text-wiki-slate">PNG, JPG, WebP, GIF or SVG, up to 8 MB</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            onUploadFiles([...(e.target.files || [])]);
            e.target.value = '';
          }}
        />
      </label>
      <p className="text-[11px] leading-relaxed text-wiki-slate">
        You can also paste an image (Ctrl/⌘ + V) or drop it straight onto the canvas. Use only images
        you have the right to publish.
      </p>
    </div>
  );
}
