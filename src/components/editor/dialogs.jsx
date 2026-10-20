'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { Alert, Button, Dialog, cx } from '@/components/ui';
import { ASPECT_RATIOS, coverZoom, computePlacement, cutoutRect, ratioDims } from '@/lib/geometry';
import { decodePhoto, drawComposite, loadImage, releasePhoto } from '@/lib/compose-client';

const RATIO_SHAPES = {
  '9:16': 'h-12 w-[27px]',
  '4:5': 'h-12 w-[38px]',
  '1:1': 'h-12 w-12',
  '16:9': 'h-[27px] w-12',
};

/** Feature: Magic Resize — the same design, laid out again for other formats. */
export function MagicResizeDialog({ open, onClose, currentRatio, editable, inCampaign, onRun }) {
  const others = Object.keys(ASPECT_RATIOS).filter((r) => r !== currentRatio);
  const [selected, setSelected] = useState(others);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (open) {
      setSelected(Object.keys(ASPECT_RATIOS).filter((r) => r !== currentRatio));
      setResults(null);
      setRunning(false);
    }
  }, [open, currentRatio]);

  async function run() {
    setRunning(true);
    setResults(null);
    try {
      setResults(await onRun(selected));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={running ? undefined : onClose}
      title="Magic resize"
      footer={
        results ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button icon="cdxIconMagicWand" onClick={run} disabled={!editable || running || selected.length === 0}>
              {running ? 'Creating…' : `Create ${selected.length} version${selected.length === 1 ? '' : 's'}`}
            </Button>
          </>
        )
      }
    >
      {!editable ? (
        <Alert tone="info">
          This frame is a finished image, so it cannot be re-laid out. Magic resize works on designs
          made in the canvas editor.
        </Alert>
      ) : results ? (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.ratio} className="flex items-center gap-3 rounded border border-wiki-line p-2.5 text-sm">
              <Icon name={r.ok ? 'cdxIconSuccess' : 'cdxIconError'} className={r.ok ? 'text-wiki-success' : 'text-wiki-error'} />
              <span className="flex-1">
                <strong>{r.ratio}</strong> {ASPECT_RATIOS[r.ratio].label}
                {r.ok ? null : <span className="block text-xs text-wiki-error">{r.error}</span>}
              </span>
              {r.ok ? (
                <a href={`/dashboard/templates/${r.id}/editor`} className="text-xs font-bold text-wiki-blue hover:underline">
                  Open
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-wiki-slate">
            Creates a copy of this design for each format, re-laid out rather than stretched: the
            background fills the new shape, the photo cutout and text keep their place and size,
            and going landscape moves the photo to the left with everything else beside it. Each
            copy {inCampaign ? 'is added to this campaign' : 'goes into your template library'} for
            you to fine-tune.
          </p>
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="sr-only">Formats to create</legend>
            {others.map((ratio) => {
              const on = selected.includes(ratio);
              return (
                <label
                  key={ratio}
                  className={cx(
                    'flex cursor-pointer flex-col items-center gap-1.5 rounded border p-3 text-xs',
                    on ? 'border-wiki-blue bg-wiki-blue-light' : 'border-wiki-line hover:bg-wiki-paper'
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={(e) =>
                      setSelected((s) => (e.target.checked ? [...s, ratio] : s.filter((x) => x !== ratio)))
                    }
                  />
                  <span className={cx('rounded-sm border-2', on ? 'border-wiki-blue' : 'border-wiki-border', RATIO_SHAPES[ratio])} />
                  <span className="font-bold">{ratio}</span>
                  <span className="text-wiki-slate">{ASPECT_RATIOS[ratio].label}</span>
                </label>
              );
            })}
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}

const SAMPLE_ROLE = "I'm a Wikipedia Editor ✏️";

/** A stand-in "photo": a soft gradient with a head-and-shoulders silhouette. */
function samplePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 900, 900);
  g.addColorStop(0, '#a7c7f9');
  g.addColorStop(1, '#c9b3ec');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 900, 900);
  ctx.fillStyle = 'rgba(32,33,34,0.55)';
  ctx.beginPath();
  ctx.arc(450, 360, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(450, 860, 300, 260, 0, Math.PI, 0);
  ctx.fill();
  return canvas;
}

/**
 * ED-12: the frame with a photo and a badge, drawn by the very compositor
 * participants' phones use — so this is exactly what they will get.
 */
export function PreviewDialog({ open, onClose, frameUrl, aspectRatio, cutout, badge }) {
  const canvasRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [role, setRole] = useState(SAMPLE_ROLE);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !frameUrl) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const frame = await loadImage(frameUrl);
        if (cancelled) return;
        const dims = ratioDims(aspectRatio);
        const source = photo?.preview || samplePhoto();
        const sw = photo?.width || 900;
        const sh = photo?.height || 900;
        const rect = cutoutRect(cutout, dims.w, dims.h);
        const placement = computePlacement({
          aspectRatio,
          cutout,
          fit: { zoom: coverZoom(rect, sw / sh) },
          naturalRatio: sw / sh,
        });
        const el = canvasRef.current;
        if (!el) return;
        const scale = Math.min(1, 720 / Math.max(dims.w, dims.h));
        el.width = Math.round(dims.w * scale);
        el.height = Math.round(dims.h * scale);
        drawComposite(el.getContext('2d'), {
          photo: source,
          photoWidth: sw,
          photoHeight: sh,
          frame,
          aspectRatio,
          cutout,
          badge: role ? { text: role, style: badge } : null,
          placement,
          scale,
          background: '#ffffff',
        });
      } catch {
        if (!cancelled) setError('The preview could not be drawn.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, frameUrl, aspectRatio, cutout, badge, photo, role]);

  useEffect(() => () => releasePhoto(photo), [photo]);

  return (
    <Dialog open={open} onClose={onClose} title="Preview as a participant" size="lg">
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="wf-checker flex items-center justify-center rounded border border-wiki-line p-2">
          <canvas ref={canvasRef} className="h-auto max-h-[65vh] w-auto max-w-full" aria-label="Frame preview with a sample photo" />
        </div>
        <div className="space-y-3 text-sm">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
          <label className="block">
            <span className="wf-label">Try your own photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="wf-input text-xs"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setPhoto(await decodePhoto(file));
                } catch {
                  setError('That photo could not be read.');
                }
              }}
            />
            <span className="wf-hint">Stays in your browser — nothing is uploaded.</span>
          </label>
          <label className="block">
            <span className="wf-label">Badge text</span>
            <input className="wf-input" value={role} onChange={(e) => setRole(e.target.value)} maxLength={60} />
            <span className="wf-hint">Try your longest role to check it fits.</span>
          </label>
          <p className="text-xs leading-relaxed text-wiki-slate">
            Drawn by the same code participants’ phones use, from your design as it is right now.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

const SHORTCUTS = [
  ['Undo / redo', 'Ctrl Z · Ctrl Shift Z'],
  ['Duplicate', 'Ctrl D'],
  ['Copy / paste', 'Ctrl C · Ctrl V'],
  ['Select all', 'Ctrl A'],
  ['Group / ungroup', 'Ctrl G · Ctrl Shift G'],
  ['Bring forward / send backward', 'Ctrl ] · Ctrl ['],
  ['Bring to front / send to back', 'Ctrl Shift ] · Ctrl Shift ['],
  ['Nudge 1 px / 10 px', 'Arrows · Shift Arrows'],
  ['Delete', 'Delete · Backspace'],
  ['Deselect', 'Esc'],
  ['Zoom in / out / fit', 'Ctrl + · Ctrl − · Ctrl 0'],
  ['Save', 'Ctrl S'],
  ['This list', '?'],
];

export function ShortcutsDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" size="sm">
      <p className="mb-3 text-xs text-wiki-slate">On a Mac, use ⌘ instead of Ctrl.</p>
      <dl className="divide-y divide-wiki-line text-sm">
        {SHORTCUTS.map(([what, keys]) => (
          <div key={what} className="flex justify-between gap-4 py-1.5">
            <dt className="text-wiki-slate">{what}</dt>
            <dd className="text-right font-mono text-xs font-bold text-wiki-ink">{keys}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** Platform safe zones, drawn over the canvas (never part of the frame). */
export const SAFE_ZONES = {
  none: { label: 'Off' },
  margins: { label: 'Safe margins' },
  story: { label: 'Story UI (9:16)', ratios: ['9:16'] },
  grid: { label: 'Profile grid crop', ratios: ['4:5', '1:1'] },
  square: { label: 'Square thumbnail', ratios: ['16:9', '9:16', '4:5'] },
};

export function SafeZoneOverlay({ zone, dims }) {
  if (!zone || zone === 'none') return null;
  const { w, h } = dims;
  const shade = 'rgba(215,51,51,0.18)';
  const line = '#d73333';
  const label = (x, y, text, anchor = 'start') => (
    <text x={x} y={y} fill={line} fontSize={Math.max(w, h) * 0.018} fontWeight="700" textAnchor={anchor} fontFamily="system-ui, sans-serif">
      {text}
    </text>
  );

  let content = null;
  if (zone === 'margins') {
    const mx = w * 0.05;
    const my = h * 0.05;
    content = (
      <>
        <rect x={mx} y={my} width={w - 2 * mx} height={h - 2 * my} fill="none" stroke={line} strokeWidth={Math.max(w, h) * 0.002} strokeDasharray="12 10" />
        {label(mx + 8, my - 8, 'Safe area — keep text inside')}
      </>
    );
  } else if (zone === 'story') {
    content = (
      <>
        <rect x={0} y={0} width={w} height={h * 0.14} fill={shade} />
        <rect x={0} y={h * 0.8} width={w} height={h * 0.2} fill={shade} />
        {label(w / 2, h * 0.08, 'Profile, progress bar & close button', 'middle')}
        {label(w / 2, h * 0.9, 'Reply box & reactions', 'middle')}
      </>
    );
  } else if (zone === 'grid') {
    // Profile grids now show a 3:4 centre crop.
    const cw = Math.min(w, (h * 3) / 4);
    const x = (w - cw) / 2;
    content = (
      <>
        <rect x={0} y={0} width={x} height={h} fill={shade} />
        <rect x={x + cw} y={0} width={w - x - cw} height={h} fill={shade} />
        <rect x={x} y={0} width={cw} height={h} fill="none" stroke={line} strokeWidth={Math.max(w, h) * 0.002} strokeDasharray="12 10" />
        {label(x + 10, h * 0.04, 'Visible in the profile grid (3:4)')}
      </>
    );
  } else if (zone === 'square') {
    const side = Math.min(w, h);
    const x = (w - side) / 2;
    const y = (h - side) / 2;
    content = (
      <>
        <rect x={x} y={y} width={side} height={side} fill="none" stroke={line} strokeWidth={Math.max(w, h) * 0.002} strokeDasharray="12 10" />
        {label(x + 10, y + Math.max(w, h) * 0.03, 'Square thumbnail crop')}
      </>
    );
  }

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {content}
    </svg>
  );
}
