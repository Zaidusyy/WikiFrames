'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, downloadUrl } from '@/lib/client';
import { Button, Explainer, Field, cx } from '@/components/ui';

const RATIOS = [
  ['9:16', 'Story / Reel', 'h-24 w-[54px]'],
  ['4:5', 'Feed portrait', 'h-24 w-[77px]'],
  ['1:1', 'Square', 'h-24 w-24'],
  ['16:9', 'Landscape', 'h-[54px] w-24'],
];

/**
 * §9.1 step 2 / §10.1 — the four routes a template can take into a campaign.
 *
 * ED-11 requires the two export buttons (Download, Write/Edit) to be visually
 * prominent on every template card, which is why they are full-width buttons
 * rather than icons in a menu.
 */
export default function CampaignTemplates({ campaign, onChange, onToast, onError }) {
  const [templates, setTemplates] = useState(campaign.templates || []);
  const [starters, setStarters] = useState([]);
  const [library, setLibrary] = useState([]);
  const [adding, setAdding] = useState(null); // 'canvas' | 'upload' | 'commons' | 'library'
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/templates')
      .then((res) => {
        setStarters(res.starters || []);
        setLibrary((res.templates || []).filter((t) => !t.campaignId));
      })
      .catch(() => {
        // The picker degrades to "create from blank" if the library cannot load.
      });
  }, []);

  function publish(next) {
    setTemplates(next);
    onChange?.(next);
  }

  async function createCanvasTemplate({ name, aspectRatio, starter }) {
    setBusy(true);
    onError(null);
    try {
      const res = await api.post('/templates', {
        name,
        aspectRatio,
        campaignId: campaign.id,
        canvasJson: starter
          ? {
              starter: starter.key,
              background: starter.background,
              accent: starter.accent,
              headline: starter.headline,
              cutout: starter.cutout,
              badge: starter.badge,
              artifacts: starter.artifacts,
              layers: [],
            }
          : { cutout: undefined, badge: undefined, layers: [] },
      });
      publish([...templates, res.template]);
      onToast('Template created — opening the editor.');
      window.location.href = `/dashboard/templates/${res.template.id}/editor`;
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  async function uploadFrame(file, aspectRatio, name) {
    setBusy(true);
    onError(null);
    try {
      const data = new FormData();
      data.append('frame', file);
      data.append('name', name || file.name.replace(/\.[^.]+$/, ''));
      data.append('aspectRatio', aspectRatio);
      data.append('campaignId', campaign.id);
      const res = await api.post('/templates', data);
      publish([...templates, res.template]);
      onToast('Frame uploaded and validated.');
      setAdding(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function linkCommons(commonsUrl, aspectRatio, name) {
    setBusy(true);
    onError(null);
    try {
      const res = await api.post('/templates', {
        commonsUrl,
        aspectRatio,
        name: name || 'Commons frame',
        campaignId: campaign.id,
      });
      publish([...templates, res.template]);
      onToast('Frame fetched from Commons, with its attribution.');
      setAdding(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reuse(templateId) {
    setBusy(true);
    onError(null);
    try {
      const res = await api.post(`/templates/${templateId}/clone`, { campaignId: campaign.id });
      publish([...templates, res.template]);
      onToast('Template added from your library.');
      setAdding(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function detach(template) {
    if (!window.confirm(`Remove "${template.name}" from this campaign?`)) return;
    onError(null);
    try {
      // Detaching, not deleting — CAMP-4 means the template stays in the library
      // and can be reused by any of this organizer's other campaigns.
      await api.patch(`/templates/${template.id}`, { campaignId: null });
      publish(templates.filter((t) => t.id !== template.id));
      onToast('Removed from this campaign. It is still in your library.');
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <Explainer>
        A campaign can offer several templates and participants pick the one that suits them — a
        story for Instagram, a square for WhatsApp, a landscape for a blog. Ten is the sensible
        maximum.
      </Explainer>

      {templates.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <li key={template.id} className="wf-card flex flex-col gap-3 p-4">
              <div className="wf-checker flex items-center justify-center rounded-lg border border-wiki-line p-3">
                {template.frameUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={template.frameUrl}
                    alt=""
                    className="max-h-40 w-auto object-contain"
                    loading="lazy"
                  />
                ) : (
                  <span className="py-12 text-xs text-wiki-slate">Not designed yet</span>
                )}
              </div>

              <div>
                <p className="font-semibold">{template.name}</p>
                <p className="text-xs text-wiki-slate">
                  {template.aspectRatio} ·{' '}
                  {template.editable ? 'editable in canvas' : 'flat image — overlays only'}
                </p>
                {template.commonsAttribution ? (
                  <p className="mt-1 text-[11px] leading-snug text-wiki-slate">
                    {/* UP-2: attribution travels with the frame and is always displayed. */}
                    {template.commonsAttribution.fileName} · {template.commonsAttribution.author} ·{' '}
                    {template.commonsAttribution.license}
                  </p>
                ) : null}
              </div>

              {/* ED-11: the two prominent export buttons. */}
              <div className="mt-auto grid grid-cols-2 gap-2">
                <a
                  href={downloadUrl(`/templates/${template.id}/download`)}
                  className="wf-btn-secondary justify-center px-2 py-2 text-xs"
                >
                  ⬇ Download
                </a>
                <Link
                  href={`/dashboard/templates/${template.id}/editor`}
                  className="wf-btn-primary justify-center px-2 py-2 text-xs"
                >
                  ✍ Write / Edit
                </Link>
              </div>

              <button
                type="button"
                onClick={() => detach(template)}
                className="text-xs font-medium text-rose-700 hover:underline"
              >
                Remove from campaign
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="wf-card p-8 text-center">
          <p className="font-bold">No templates yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-wiki-slate">
            Design one in the canvas, or bring a finished frame you made elsewhere.
          </p>
        </div>
      )}

      <div className="wf-card p-6">
        <h3 className="font-serif text-xl">Add a template</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AddCard
            icon="🖌️"
            title="Design in canvas"
            body="Start blank or from one of six wiki-themed designs. Fully editable, forever."
            active={adding === 'canvas'}
            onClick={() => setAdding(adding === 'canvas' ? null : 'canvas')}
          />
          <AddCard
            icon="⬆️"
            title="Upload a frame"
            body="Made it in Canva or Figma? Upload the PNG with a transparent cutout."
            active={adding === 'upload'}
            onClick={() => setAdding(adding === 'upload' ? null : 'upload')}
          />
          <AddCard
            icon="🌍"
            title="Link from Commons"
            body="Best option: host the frame on Commons and we fetch it with its licence."
            active={adding === 'commons'}
            onClick={() => setAdding(adding === 'commons' ? null : 'commons')}
          />
          <AddCard
            icon="📚"
            title="Reuse from library"
            body="A template you built for an earlier event, ready to go again."
            active={adding === 'library'}
            onClick={() => setAdding(adding === 'library' ? null : 'library')}
          />
        </div>

        {adding === 'canvas' ? (
          <CanvasPicker starters={starters} busy={busy} onCreate={createCanvasTemplate} />
        ) : null}

        {adding === 'upload' ? <UploadPanel busy={busy} onUpload={uploadFrame} /> : null}

        {adding === 'commons' ? <CommonsPanel busy={busy} onLink={linkCommons} /> : null}

        {adding === 'library' ? (
          <LibraryPanel library={library} busy={busy} onReuse={reuse} />
        ) : null}
      </div>
    </div>
  );
}

function AddCard({ icon, title, body, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cx(
        'rounded-lg border p-4 text-left transition-colors',
        active ? 'border-wiki-blue bg-wiki-blue-light' : 'border-wiki-line hover:bg-wiki-paper'
      )}
    >
      <span aria-hidden="true" className="text-2xl">
        {icon}
      </span>
      <p className="mt-2 text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-wiki-slate">{body}</p>
    </button>
  );
}

function CanvasPicker({ starters, busy, onCreate }) {
  const [ratio, setRatio] = useState('1:1');
  const [name, setName] = useState('');
  const matching = starters.filter((s) => s.aspectRatio === ratio);

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-wiki-line p-4">
      <Field label="Template name">
        <input
          className="wf-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Square selfie frame"
        />
      </Field>

      <fieldset>
        <legend className="wf-label">Aspect ratio</legend>
        <div className="flex flex-wrap gap-3">
          {RATIOS.map(([value, label, shape]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRatio(value)}
              className={cx(
                'flex flex-col items-center gap-2 rounded-lg border p-3 text-xs',
                ratio === value
                  ? 'border-wiki-blue bg-wiki-blue-light'
                  : 'border-wiki-line hover:bg-wiki-paper'
              )}
            >
              <span className={cx('rounded border-2 border-current text-wiki-slate', shape)} />
              <span className="font-semibold">{value}</span>
              <span className="text-wiki-slate">{label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="wf-label">Start from</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StarterCard
            title="Blank canvas"
            body="An empty frame at the right size, with a transparent photo cutout."
            onClick={() => onCreate({ name: name || 'Blank template', aspectRatio: ratio })}
            disabled={busy}
          />
          {matching.map((starter) => (
            <StarterCard
              key={starter.key}
              title={starter.name}
              body={starter.headline.replace(/\n/g, ' ')}
              swatch={starter.background}
              accent={starter.accent}
              onClick={() => onCreate({ name: name || starter.name, aspectRatio: ratio, starter })}
              disabled={busy}
            />
          ))}
        </div>
        {matching.length === 0 ? (
          <p className="wf-hint">
            No ready-made design for {ratio} yet — start blank, or clone one from another ratio in
            your library.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StarterCard({ title, body, swatch, accent, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-wiki-line p-3 text-left hover:bg-wiki-paper disabled:opacity-50"
    >
      <span
        className="mb-2 flex h-12 items-center justify-center rounded"
        style={{ background: swatch || '#f8f9fa', color: accent || '#54595d' }}
      >
        <span className="h-6 w-6 rounded-full border-2 border-current" />
      </span>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-wiki-slate">{body}</span>
    </button>
  );
}

function UploadPanel({ busy, onUpload }) {
  const [ratio, setRatio] = useState('1:1');
  const [name, setName] = useState('');

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-wiki-line p-4">
      <Explainer>
        Design around a transparent hole and export as PNG — not JPG, which has no transparency. We
        check the size, the ratio and that the cutout is really see-through before accepting it.
        Download a blank template first if you want the exact measurements.
      </Explainer>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template name">
          <input className="wf-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Aspect ratio" hint="Must match the file you are uploading.">
          <select className="wf-input" value={ratio} onChange={(e) => setRatio(e.target.value)}>
            {RATIOS.map(([value, label]) => (
              <option key={value} value={value}>
                {value} — {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Frame file" hint="PNG or SVG, up to 10 MB.">
        <input
          type="file"
          accept="image/png,image/svg+xml"
          className="wf-input"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0], ratio, name)}
        />
      </Field>
    </div>
  );
}

function CommonsPanel({ busy, onLink }) {
  const [url, setUrl] = useState('');
  const [ratio, setRatio] = useState('1:1');
  const [name, setName] = useState('');

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-wiki-line p-4">
      <Explainer>
        Hosting your frame on Wikimedia Commons first keeps it openly licensed and reusable by
        anyone else in the movement. We fetch a copy, cache it, and show the author and licence
        alongside the template.
      </Explainer>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template name">
          <input className="wf-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Aspect ratio">
          <select className="wf-input" value={ratio} onChange={(e) => setRatio(e.target.value)}>
            {RATIOS.map(([value, label]) => (
              <option key={value} value={value}>
                {value} — {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Commons file link">
        <input
          className="wf-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://commons.wikimedia.org/wiki/File:Example_frame.png"
        />
      </Field>

      <Button disabled={busy || !url} onClick={() => onLink(url, ratio, name)}>
        {busy ? 'Fetching…' : 'Fetch from Commons'}
      </Button>
    </div>
  );
}

function LibraryPanel({ library, busy, onReuse }) {
  if (!library.length) {
    return (
      <p className="mt-5 rounded-lg border border-dashed border-wiki-line p-6 text-center text-sm text-wiki-slate">
        Your library is empty. Templates you build here will show up for reuse in future campaigns.
      </p>
    );
  }

  return (
    <ul className="mt-5 grid gap-3 sm:grid-cols-3">
      {library.map((template) => (
        <li key={template.id}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReuse(template.id)}
            className="w-full rounded-lg border border-wiki-line p-3 text-left hover:bg-wiki-paper disabled:opacity-50"
          >
            <span className="wf-checker mb-2 flex h-24 items-center justify-center rounded">
              {template.frameUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={template.frameUrl} alt="" className="max-h-24 object-contain" />
              ) : (
                <span className="text-xs text-wiki-slate">No preview</span>
              )}
            </span>
            <span className="block text-sm font-semibold">{template.name}</span>
            <span className="text-xs text-wiki-slate">{template.aspectRatio}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
