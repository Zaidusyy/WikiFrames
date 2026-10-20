'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { composeCaption } from '@/lib/caption';
import { formatDateRange } from '@/lib/format';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  computePlacement,
  coverZoom,
  cutoutRect,
  normalizeFit,
  ratioDims,
} from '@/lib/geometry';
import { decodePhoto, drawComposite, loadImage, releasePhoto, renderComposite } from '@/lib/compose-client';
import Icon from '@/components/Icon';
import { Alert, cx } from '@/components/ui';

const STEPS = ['code', 'template', 'role', 'photo', 'result'];
const STEP_LABELS = { code: 'Code', template: 'Frame', role: 'Badge', photo: 'Photo', result: 'Share' };
const FRESH_FIT = { zoom: 1, panX: 0, panY: 0, rotate: 0 };

/**
 * §14 — the participant experience.
 *
 * Zero friction, mobile-first, done in under a minute: no account, no
 * personal fields, a live preview at every moment, and a single button.
 *
 * Privacy by design. A participant who does not allow storage gets an image
 * made entirely on their own device — the photo is decoded, framed and
 * encoded in this browser tab and never uploaded. Only a participant who
 * chooses to share their image with the campaign gallery sends it to the
 * server, which renders the stored copy itself so a gallery can only ever hold
 * genuine, framed images.
 */
export default function ParticipantFlow({ segment, payload }) {
  const { campaign, roles, captions, consent } = payload;

  const [templates, setTemplates] = useState(payload.templates);
  const [unlocked, setUnlocked] = useState(!campaign.requiresAccessCode);
  const [accessCode, setAccessCode] = useState('');
  const [step, setStep] = useState(() => firstStep(!campaign.requiresAccessCode, payload.templates.length, roles.length));
  const [templateId, setTemplateId] = useState(payload.templates[0]?.id ?? null);
  const [roleId, setRoleId] = useState(null);
  const [captionId, setCaptionId] = useState(payload.mandatoryCaptionId);
  const [photo, setPhoto] = useState(null);
  const [fit, setFit] = useState(FRESH_FIT);
  const [allowStorage, setAllowStorage] = useState(false); // RET-1: unticked by default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [deviceFailed, setDeviceFailed] = useState(false);
  const [result, setResult] = useState(null);

  const template = templates.find((t) => t.id === templateId) || templates[0];
  const role = roles.find((r) => r.id === roleId) || null;
  const caption = captions.find((c) => c.id === captionId) || captions[0] || null;

  // Analytics beacon: campaign-level counters only, no cookie, no identifier.
  const beacon = useCallback(
    (kind, platform) => {
      fetch(`/api/v1/c/${segment}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, platform }),
        keepalive: true,
      }).catch(() => {});
    },
    [segment]
  );

  useEffect(() => {
    beacon('link_open');
    if (new URLSearchParams(window.location.search).get('via') === 'qr') beacon('qr_scan');
  }, [beacon]);

  // The decoded photo and any result are dropped from memory as soon as they
  // are replaced or the participant leaves.
  useEffect(() => () => releasePhoto(photo), [photo]);
  useEffect(() => () => result?.objectUrl && URL.revokeObjectURL(result.objectUrl), [result]);

  const shareText = useMemo(
    () => composeCaption({ badgeText: role?.badgeText, caption: caption?.text, hashtags: caption?.hashtags }),
    [role, caption]
  );

  async function unlock(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/c/${segment}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'That code did not work.');
      const urls = new Map(json.templates.map((t) => [t.id, t.frameUrl]));
      setTemplates((list) => list.map((t) => ({ ...t, frameUrl: urls.get(t.id) ?? t.frameUrl })));
      setUnlocked(true);
      setStep(firstStep(true, templates.length, roles.length));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto(file) {
    if (!file) {
      setPhoto(null);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('That photo is larger than 15 MB. Try a smaller one.');
      return;
    }
    setError(null);
    try {
      const decoded = await decodePhoto(file);
      decoded.file = file;
      const dims = ratioDims(template.aspectRatio);
      const rect = cutoutRect(template.cutout, dims.w, dims.h);
      setPhoto(decoded);
      // Start zoomed far enough to cover the hole; the participant can zoom
      // back out if they want the whole shot visible.
      setFit({ ...FRESH_FIT, zoom: coverZoom(rect, decoded.naturalRatio) });
      setDeviceFailed(false);
    } catch {
      setError('That photo could not be opened. Try a JPG or PNG.');
    }
  }

  function resetFit() {
    if (!photo) return;
    const dims = ratioDims(template.aspectRatio);
    setFit({ ...FRESH_FIT, zoom: coverZoom(cutoutRect(template.cutout, dims.w, dims.h), photo.naturalRatio) });
  }

  async function generate({ forceServer = false } = {}) {
    if (!photo || !template) return;
    if (campaign.roleRequired && !role) {
      setError('Please choose a role first.');
      setStep('role');
      return;
    }
    setBusy(true);
    setError(null);
    const placement = computePlacement({
      aspectRatio: template.aspectRatio,
      cutout: template.cutout,
      fit,
      naturalRatio: photo.naturalRatio,
    });

    try {
      if (!allowStorage && !forceServer) {
        // On-device: nothing about the photo leaves this tab.
        try {
          const frame = template.frameUrl ? await loadImage(template.frameUrl) : null;
          const rendered = await renderComposite({
            photo: photo.full,
            photoWidth: photo.width,
            photoHeight: photo.height,
            frame,
            aspectRatio: template.aspectRatio,
            cutout: template.cutout,
            badge: role ? { text: role.badgeText, style: template.badge } : null,
            placement,
          });
          beacon('generate');
          const objectUrl = URL.createObjectURL(rendered.blob);
          setResult({
            mode: 'device',
            stored: false,
            blob: rendered.blob,
            objectUrl,
            url: objectUrl,
            mime: rendered.mime,
          });
          setStep('result');
          return;
        } catch (err) {
          console.warn('[participant] on-device rendering failed', err);
          setDeviceFailed(true);
          throw new Error(
            'Your browser could not create the image on this device. You can try again, or let our server create it instead.'
          );
        }
      }

      const data = new FormData();
      data.append('photo', photo.file);
      data.append('templateId', template.id);
      if (role) data.append('roleId', role.id);
      if (caption) data.append('captionId', caption.id);
      data.append('consent', String(allowStorage));
      data.append('placement', JSON.stringify(placement));
      if (accessCode) data.append('accessCode', accessCode);

      const res = await fetch(`/api/v1/c/${segment}/generate`, { method: 'POST', body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
      // A one-time image comes back inline; a stored one via its signed link.
      const blob = json.image.url.startsWith('data:')
        ? dataUrlToBlob(json.image.url)
        : await (await fetch(json.image.url, { cache: 'no-store' })).blob();
      const objectUrl = URL.createObjectURL(blob);
      setResult({ ...json, mode: 'server', blob, objectUrl, url: objectUrl, mime: json.image.mime || blob.type });
      setStep('result');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setResult(null);
    setDeviceFailed(false);
    resetFit();
    setStep(templates.length > 1 ? 'template' : 'photo');
  }

  const visibleSteps = STEPS.filter(
    (s) =>
      (s !== 'code' || campaign.requiresAccessCode) &&
      (s !== 'template' || templates.length > 1) &&
      (s !== 'role' || roles.length > 0)
  );

  return (
    <div className="min-h-screen bg-wiki-paper">
      <header className="border-b border-wiki-line bg-white">
        <div className="mx-auto max-w-lg px-5 py-4">
          <h1 className="font-serif text-xl leading-tight">{campaign.name}</h1>
          <p className="mt-1 text-sm text-wiki-slate">
            {formatDateRange(campaign.eventDate, campaign.eventEndDate)}
            {campaign.organizingGroup ? ` · ${campaign.organizingGroup}` : ''}
          </p>
        </div>
        <StepBar steps={visibleSteps} step={step} />
      </header>

      <main id="main" className="mx-auto max-w-lg px-5 py-6">
        <Alert onDismiss={() => setError(null)} className="mb-4">
          {error || null}
          {error && deviceFailed ? (
            <button
              type="button"
              className="wf-btn-secondary mt-2 w-full text-xs"
              onClick={() => generate({ forceServer: true })}
              disabled={busy}
            >
              Create it on the server instead (used once, never stored)
            </button>
          ) : null}
        </Alert>

        {step === 'code' && !unlocked ? (
          <CodeStep accessCode={accessCode} onChange={setAccessCode} onSubmit={unlock} busy={busy} />
        ) : null}

        {step === 'template' ? (
          <TemplateChooser
            templates={templates}
            description={campaign.description}
            selectedId={templateId}
            onSelect={(id) => {
              setTemplateId(id);
              setStep(roles.length ? 'role' : 'photo');
            }}
          />
        ) : null}

        {step === 'role' ? (
          <RoleChooser
            roles={roles}
            required={campaign.roleRequired}
            selectedId={roleId}
            template={template}
            onSelect={setRoleId}
            onBack={templates.length > 1 ? () => setStep('template') : null}
            onNext={() => setStep('photo')}
          />
        ) : null}

        {step === 'photo' ? (
          <PhotoStep
            template={template}
            role={role}
            photo={photo}
            fit={fit}
            onFit={setFit}
            onPhoto={choosePhoto}
            onReset={resetFit}
            consent={consent}
            allowStorage={allowStorage}
            onAllowStorage={setAllowStorage}
            busy={busy}
            onGenerate={() => generate()}
            onBack={() => setStep(roles.length ? 'role' : 'template')}
            canGoBack={roles.length > 0 || templates.length > 1}
          />
        ) : null}

        {step === 'result' && result ? (
          <ResultStep
            result={result}
            captions={captions}
            captionId={captionId}
            onCaption={setCaptionId}
            badgeText={role?.badgeText}
            fallbackText={shareText}
            campaignName={campaign.name}
            template={template}
            onBeacon={beacon}
            onRestart={restart}
          />
        ) : null}
      </main>

      <footer className="mx-auto max-w-lg px-5 pb-10 text-center">
        <Link href="/" className="text-xs font-bold text-wiki-blue hover:underline">
          Made with WikiFrames
        </Link>
        <p className="mt-2 text-[11px] leading-relaxed text-wiki-slate">
          Independent tool built for the Wikimedia community. Not endorsed by the Wikimedia
          Foundation.{' '}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}

function firstStep(unlocked, templateCount, roleCount) {
  if (!unlocked) return 'code';
  if (templateCount > 1) return 'template';
  return roleCount ? 'role' : 'photo';
}

// ── steps ───────────────────────────────────────────────────────────────────

function StepBar({ steps, step }) {
  const currentIndex = steps.indexOf(step);
  return (
    <ol className="mx-auto flex max-w-lg gap-1 px-5 pb-3" aria-label="Progress">
      {steps.map((key, i) => (
        <li key={key} className="flex-1" aria-current={i === currentIndex ? 'step' : undefined}>
          <div className={cx('h-1 rounded-full', i <= currentIndex ? 'bg-wiki-blue' : 'bg-wiki-line')} />
          <span className={cx('mt-1 block text-[11px] font-bold', i <= currentIndex ? 'text-wiki-blue' : 'text-wiki-slate')}>
            {STEP_LABELS[key]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CodeStep({ accessCode, onChange, onSubmit, busy }) {
  return (
    <form onSubmit={onSubmit} className="wf-card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Icon name="cdxIconKey" size="lg" className="mt-1 text-wiki-blue" />
        <div>
          <h2 className="font-serif text-lg">Enter the venue code</h2>
          <p className="mt-1 text-sm leading-relaxed text-wiki-slate">
            The organizers have it on display at the event — on a slide, a poster or the
            registration desk.
          </p>
        </div>
      </div>
      <label className="block">
        <span className="sr-only">Venue access code</span>
        <input
          className="wf-input text-center text-2xl tracking-[0.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{4,6}"
          maxLength={6}
          value={accessCode}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          aria-label="Venue access code"
          autoFocus
        />
      </label>
      <button type="submit" className="wf-btn-primary w-full py-3 text-base" disabled={busy || accessCode.length < 4}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
    </form>
  );
}

function FrameThumb({ template }) {
  return (
    <span className="wf-checker block overflow-hidden rounded" style={{ aspectRatio: template.aspectRatio.replace(':', ' / ') }}>
      <span className="relative block h-full w-full">
        <span className="absolute inset-0 bg-gradient-to-br from-[#a7c7f9] to-[#c9b3ec]" />
        {template.frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.frameUrl} alt="" className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
        ) : null}
      </span>
    </span>
  );
}

function TemplateChooser({ templates, description, selectedId, onSelect }) {
  return (
    <div className="space-y-4">
      <div className="wf-card p-5">
        <h2 className="font-serif text-lg">Pick a frame</h2>
        {description ? <p className="mt-1 text-sm leading-relaxed text-wiki-slate">{description}</p> : null}
        <p className="mt-3 text-sm text-wiki-slate">
          Choose whichever shape suits where you will post — tall for stories, square for chats.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {templates.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={selectedId === t.id}
              className={cx(
                'w-full rounded border-2 bg-white p-2 text-left transition-colors',
                selectedId === t.id ? 'border-wiki-blue' : 'border-wiki-line hover:border-wiki-border'
              )}
            >
              <FrameThumb template={t} />
              <span className="mt-2 block px-1 pb-1">
                <span className="block truncate text-sm font-bold">{t.name}</span>
                <span className="text-xs text-wiki-slate">{t.aspectRatio}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleChooser({ roles, required, selectedId, template, onSelect, onBack, onNext }) {
  return (
    <div className="space-y-4">
      <div className="wf-card p-5">
        <h2 className="font-serif text-lg">Who are you today?</h2>
        <p className="mt-1 text-sm text-wiki-slate">
          Your choice becomes a badge on your image and the first line of your caption.
          {required ? '' : ' Skip it if you would rather not.'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={selectedId === r.id}
              onClick={() => onSelect(selectedId === r.id ? null : r.id)}
              className={cx(
                'wf-chip',
                selectedId === r.id ? 'bg-wiki-blue text-white ring-wiki-blue' : 'bg-white text-wiki-ink ring-wiki-line hover:bg-wiki-paper'
              )}
            >
              {r.icon ? <span aria-hidden="true">{r.icon}</span> : null}
              {r.label}
            </button>
          ))}
        </div>

        {/* Live badge preview (BADGE-2), in the frame's own badge colours. */}
        <div className="mt-5 rounded bg-wiki-paper p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-wiki-slate">Your badge</p>
          <p className="mt-2">
            <span
              className="inline-block rounded-full px-4 py-2 text-sm font-bold"
              style={{ background: template?.badge?.background || '#3366cc', color: template?.badge?.color || '#ffffff' }}
            >
              {roles.find((r) => r.id === selectedId)?.badgeText || 'No badge — just the frame'}
            </span>
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        {onBack ? (
          <button type="button" onClick={onBack} className="wf-btn-secondary flex-1">
            Back
          </button>
        ) : null}
        <button type="button" onClick={onNext} disabled={required && !selectedId} className="wf-btn-primary flex-1">
          {selectedId || !required ? 'Add my photo' : 'Pick a badge to continue'}
        </button>
      </div>
      <p className="text-center text-xs text-wiki-slate">
        Frame: {template?.name} · {template?.aspectRatio}
      </p>
    </div>
  );
}

function PhotoStep({
  template,
  role,
  photo,
  fit,
  onFit,
  onPhoto,
  onReset,
  consent,
  allowStorage,
  onAllowStorage,
  busy,
  onGenerate,
  onBack,
  canGoBack,
}) {
  const [camera, setCamera] = useState(null);
  const [facing, setFacing] = useState('user');
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);

  const stopCamera = useCallback(() => {
    setCamera((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => {
    if (camera && videoRef.current) videoRef.current.srcObject = camera;
  }, [camera]);

  // PART-2: camera capture degrades gracefully to upload-only if the browser
  // has no getUserMedia or the participant declines the permission prompt.
  async function startCamera(nextFacing = facing) {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot open the camera. Please upload a photo instead.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      setCamera(stream);
      setFacing(nextFacing);
    } catch {
      setCameraError('We could not open the camera. Please upload a photo instead.');
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    // The selfie preview is mirrored, so the photo is too: what you saw is
    // what you get.
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) return;
        onPhoto(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  }

  if (!photo) {
    return (
      <div className="wf-card space-y-4 p-5">
        <h2 className="font-serif text-lg">Add your photo</h2>

        {camera ? (
          <div className="space-y-3">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded bg-black"
              style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
            />
            <div className="flex gap-2">
              <button type="button" onClick={capture} className="wf-btn-primary flex-1">
                <Icon name="cdxIconCamera" size="sm" /> Take the photo
              </button>
              <button
                type="button"
                onClick={() => startCamera(facing === 'user' ? 'environment' : 'user')}
                className="wf-btn-secondary"
                aria-label="Switch camera"
                title="Switch camera"
              >
                <Icon name="cdxIconReload" size="sm" />
              </button>
              <button type="button" onClick={stopCamera} className="wf-btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded border-2 border-dashed border-wiki-line p-6 text-center hover:border-wiki-border hover:bg-wiki-paper">
              <Icon name="cdxIconUpload" size="lg" className="text-wiki-blue" />
              <span className="text-sm font-bold">Upload a photo</span>
              <span className="text-xs text-wiki-slate">JPG, PNG or WebP up to 15 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
            </label>

            <button
              type="button"
              onClick={() => startCamera()}
              className="flex flex-col items-center gap-2 rounded border-2 border-dashed border-wiki-line p-6 text-center hover:border-wiki-border hover:bg-wiki-paper"
            >
              <Icon name="cdxIconCamera" size="lg" className="text-wiki-blue" />
              <span className="text-sm font-bold">Use the camera</span>
              <span className="text-xs text-wiki-slate">Front or back, your choice</span>
            </button>
          </div>
        )}

        {cameraError ? (
          <p className="text-sm text-wiki-warning" role="status">
            {cameraError}
          </p>
        ) : null}

        <p className="flex items-start gap-2 rounded bg-wiki-paper p-3 text-xs leading-relaxed text-wiki-slate">
          <Icon name="cdxIconLock" size="sm" className="mt-0.5 text-wiki-success" />
          Your photo is framed right here on your device. It is only uploaded if you choose to share
          the finished image with the campaign gallery.
        </p>

        {canGoBack ? (
          <button type="button" onClick={onBack} className="wf-btn-secondary w-full">
            Back
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* §14.1 step 5 — fit the photo. The frame stays fixed on top. */}
      <FitPreview template={template} photo={photo} fit={fit} onFit={onFit} role={role} />

      <div className="wf-card space-y-3 p-5">
        <p className="text-sm font-bold">Fit your photo</p>
        <label className="block text-xs font-bold text-wiki-slate">
          Zoom
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="0.01"
            className="w-full accent-[#3366cc]"
            value={fit.zoom}
            onChange={(e) => onFit({ ...fit, zoom: Number(e.target.value) })}
          />
        </label>
        <label className="block text-xs font-bold text-wiki-slate">
          Rotate
          <input
            type="range"
            min="-45"
            max="45"
            step="1"
            className="w-full accent-[#3366cc]"
            value={fit.rotate}
            onChange={(e) => onFit({ ...fit, rotate: Number(e.target.value) })}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-wiki-slate">Drag to move, pinch or scroll to zoom — or use the arrows.</p>
          <PanPad fit={fit} onFit={onFit} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onReset} className="wf-btn-secondary flex-1 text-xs">
            Reset
          </button>
          <button type="button" onClick={() => onPhoto(null)} className="wf-btn-secondary flex-1 text-xs">
            Choose another photo
          </button>
        </div>
      </div>

      {/* §16 — the consent gate, before anything is generated. */}
      <div className="wf-card space-y-3 p-5">
        <label className="flex cursor-pointer gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-[#3366cc]"
            checked={allowStorage}
            onChange={(e) => onAllowStorage(e.target.checked)}
          />
          <span className="text-sm font-bold">{consent.label}</span>
        </label>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-wiki-slate">
          <Icon name={allowStorage ? 'cdxIconUpload' : 'cdxIconLock'} size="sm" className={cx('mt-0.5', allowStorage ? 'text-wiki-blue' : 'text-wiki-success')} />
          {allowStorage
            ? 'Your finished image will be sent to WikiFrames and kept for the campaign gallery until it is deleted on schedule.'
            : 'Your image will be created on this device. Your photo is not uploaded and nothing is saved anywhere.'}
        </p>
        <details className="text-xs text-wiki-slate">
          <summary className="cursor-pointer font-bold text-wiki-blue">What happens to my image?</summary>
          <p className="mt-2 leading-relaxed">{consent.policy}</p>
        </details>
      </div>

      <button type="button" onClick={onGenerate} disabled={busy} className="wf-btn-primary w-full py-4 text-base">
        {busy ? 'Creating your image…' : 'Create my image'}
      </button>
    </div>
  );
}

/** Keyboard- and switch-friendly panning, for anyone who cannot drag. */
function PanPad({ fit, onFit }) {
  const step = 0.02;
  const move = (dx, dy) => onFit(normalizeFit({ ...fit, panX: fit.panX + dx, panY: fit.panY + dy }));
  const button = (label, icon, dx, dy) => (
    <button
      type="button"
      onClick={() => move(dx, dy)}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded border border-wiki-border bg-wiki-paper hover:bg-white"
    >
      <Icon name={icon} size="sm" />
    </button>
  );
  return (
    <div className="flex gap-1" role="group" aria-label="Move photo">
      {button('Move photo left', 'cdxIconPrevious', -step, 0)}
      {button('Move photo up', 'wfIconUpTriangle', 0, -step)}
      {button('Move photo down', 'cdxIconDownTriangle', 0, step)}
      {button('Move photo right', 'cdxIconNext', step, 0)}
    </div>
  );
}

/**
 * The live preview, drawn by the same compositor that makes the final image
 * — so what a participant drags into place is exactly what they get.
 */
function FitPreview({ template, photo, fit, onFit, role }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [frameReady, setFrameReady] = useState(!template.frameUrl);
  const dims = ratioDims(template.aspectRatio);

  useEffect(() => {
    let cancelled = false;
    frameRef.current = null;
    setFrameReady(!template.frameUrl);
    if (template.frameUrl) {
      loadImage(template.frameUrl)
        .then((img) => {
          if (cancelled) return;
          frameRef.current = img;
          setFrameReady(true);
        })
        .catch(() => !cancelled && setFrameReady(true));
    }
    return () => {
      cancelled = true;
    };
  }, [template.frameUrl]);

  // Redraw on every change, once per animation frame at most.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || !frameReady) return undefined;
    const raf = requestAnimationFrame(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = box.clientWidth;
      const scale = (cssWidth * ratio) / dims.w;
      canvas.width = Math.round(dims.w * scale);
      canvas.height = Math.round(dims.h * scale);
      drawComposite(canvas.getContext('2d'), {
        photo: photo.preview,
        photoWidth: photo.width,
        photoHeight: photo.height,
        frame: frameRef.current,
        aspectRatio: template.aspectRatio,
        cutout: template.cutout,
        badge: role ? { text: role.badgeText, style: template.badge } : null,
        placement: computePlacement({ aspectRatio: template.aspectRatio, cutout: template.cutout, fit, naturalRatio: photo.naturalRatio }),
        scale,
        background: '#ffffff',
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [photo, fit, role, template, frameReady, dims.w, dims.h]);

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
  }

  function startGesture() {
    const box = boxRef.current?.getBoundingClientRect();
    const pts = [...pointers.current.values()];
    if (!box || !pts.length) return;
    gesture.current = {
      box,
      fit,
      centre: midpoint(pts),
      distance: pts.length > 1 ? distance(pts[0], pts[1]) : null,
    };
  }

  function onPointerMove(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    const centre = midpoint(pts);
    const next = {
      ...g.fit,
      // Pan is stored as a fraction of the canvas so it survives any screen size.
      panX: g.fit.panX + (centre.x - g.centre.x) / g.box.width,
      panY: g.fit.panY + (centre.y - g.centre.y) / g.box.height,
    };
    if (pts.length > 1 && g.distance) next.zoom = g.fit.zoom * (distance(pts[0], pts[1]) / g.distance);
    onFit(normalizeFit(next));
  }

  function onPointerUp(event) {
    pointers.current.delete(event.pointerId);
    // Re-base the gesture so lifting one finger of a pinch does not jump.
    if (pointers.current.size) startGesture();
    else gesture.current = null;
  }

  function onWheel(event) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    onFit(normalizeFit({ ...fit, zoom: fit.zoom * factor }));
  }

  // React attaches wheel listeners passively; this one must cancel scrolling.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  return (
    <div
      ref={boxRef}
      className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded border border-wiki-line bg-white shadow-card active:cursor-grabbing"
      style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Preview of your framed photo. Drag to move it, pinch or scroll to zoom."
      />
      {!frameReady ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-wiki-slate">Loading frame…</div>
      ) : null}
    </div>
  );
}

function midpoint(points) {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x, y };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) || 1;
}

function ResultStep({ result, captions, captionId, onCaption, badgeText, fallbackText, campaignName, template, onBeacon, onRestart }) {
  const [copied, setCopied] = useState(null);
  const [notice, setNotice] = useState(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const activeCaption = captions.find((c) => c.id === captionId) || captions[0];
  const text =
    composeCaption({ badgeText, caption: activeCaption?.text, hashtags: activeCaption?.hashtags }) || fallbackText;
  const extension = (result.mime || '').includes('png') ? 'png' : 'jpg';
  const fileName = `${slug(campaignName)}.${extension}`;
  // An accessible description to post alongside the image.
  const altText = `Photo of a participant in the ${campaignName} frame${badgeText ? `, with the badge “${badgeText}”` : ''}.`;
  const credits = template?.credits || [];

  async function copy(value, what) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setNotice('Copying is blocked in this browser — select the text and copy it by hand.');
    }
  }

  /**
   * SHARE-2 — Web Share API Level 2: the image file and the caption travel
   * together into the OS share sheet.
   */
  async function share() {
    setNotice(null);
    try {
      const file = new File([result.blob], fileName, { type: result.mime || result.blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: campaignName });
        onBeacon('share_tap', 'native');
        return;
      }
      // SHARE-3 fallback: download the image, copy the caption, explain.
      await navigator.clipboard?.writeText(text).catch(() => {});
      download();
      setNotice('Caption copied — attach the downloaded image in your app.');
      onBeacon('share_tap', 'fallback');
    } catch (err) {
      if (err?.name === 'AbortError') return; // participant dismissed the sheet
      setNotice('Sharing did not work here. Download the image and post it manually.');
    }
  }

  function download() {
    const link = document.createElement('a');
    link.href = result.objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    onBeacon('download');
  }

  return (
    <div className="space-y-4">
      <div className="wf-card overflow-hidden p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.url} alt={altText} className="w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={download} className="wf-btn-secondary py-3">
          <Icon name="cdxIconDownload" size="sm" /> Download
        </button>
        <button type="button" onClick={share} className="wf-btn-primary py-3">
          <Icon name="cdxIconShare" size="sm" /> Share
        </button>
      </div>

      <Alert tone="info" onDismiss={() => setNotice(null)}>
        {notice}
      </Alert>

      {/* SHARE-3: explicit per-platform intents for desktop and older browsers. */}
      <div className="wf-card p-5">
        <p className="text-sm font-bold">Or post it directly</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <IntentLink label="WhatsApp" href={`https://wa.me/?text=${encodeURIComponent(text)}`} onClick={() => onBeacon('share_tap', 'whatsapp')} />
          <IntentLink label="X" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`} onClick={() => onBeacon('share_tap', 'x')} />
          <IntentLink
            label="Telegram"
            href={`https://t.me/share/url?url=${encodeURIComponent(origin)}&text=${encodeURIComponent(text)}`}
            onClick={() => onBeacon('share_tap', 'telegram')}
          />
          <IntentLink label="Mastodon" href={`https://mastodonshare.com/?text=${encodeURIComponent(text)}`} onClick={() => onBeacon('share_tap', 'mastodon')} />
          <IntentLink label="Bluesky" href={`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`} onClick={() => onBeacon('share_tap', 'bluesky')} />
          <IntentLink label="LinkedIn" href="https://www.linkedin.com/feed/?shareActive=true" onClick={() => onBeacon('share_tap', 'linkedin')} />
          <IntentLink
            label="Facebook"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(origin)}&quote=${encodeURIComponent(text)}`}
            onClick={() => onBeacon('share_tap', 'facebook')}
          />
        </div>
        <p className="wf-hint">
          These open with your caption ready. Download the image first and attach it — the networks
          do not let a website attach it for you.
        </p>
      </div>

      <div className="wf-card space-y-3 p-5">
        <p className="text-sm font-bold">Your caption</p>
        {captions.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {captions.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === activeCaption?.id}
                onClick={() => onCaption(c.id)}
                className={cx(
                  'wf-chip text-xs',
                  c.id === activeCaption?.id ? 'bg-wiki-blue text-white ring-wiki-blue' : 'bg-white text-wiki-slate ring-wiki-line'
                )}
              >
                {i === 0 ? 'Suggested' : `Option ${i + 1}`}
              </button>
            ))}
          </div>
        ) : null}
        <textarea readOnly value={text} className="wf-input min-h-[110px] text-sm" aria-label="Caption" />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => copy(text, 'caption')} className="wf-btn-secondary text-sm">
            <Icon name={copied === 'caption' ? 'cdxIconCheck' : 'cdxIconCopy'} size="sm" />
            {copied === 'caption' ? 'Copied' : 'Copy caption'}
          </button>
          <button
            type="button"
            onClick={() => copy(altText, 'alt')}
            className="wf-btn-secondary text-sm"
            title="Paste this as the image description (alt text) so people using screen readers know what it shows."
          >
            <Icon name={copied === 'alt' ? 'cdxIconCheck' : 'cdxIconUniversalDesign'} size="sm" />
            {copied === 'alt' ? 'Copied' : 'Copy alt text'}
          </button>
        </div>
      </div>

      {credits.length ? (
        <details className="wf-card p-4 text-xs text-wiki-slate">
          <summary className="cursor-pointer font-bold text-wiki-ink">Artwork credits</summary>
          <ul className="mt-2 space-y-1">
            {credits.map((c, i) => (
              <li key={`${c.title}-${i}`}>
                {c.sourceUrl ? (
                  <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" className="font-bold text-wiki-blue hover:underline">
                    {c.title.replace(/^File:/, '')}
                  </a>
                ) : (
                  <span className="font-bold">{c.title}</span>
                )}{' '}
                by {c.author}, {c.license}
              </li>
            ))}
          </ul>
          <p className="mt-2">If you repost the image, please keep these credits with it.</p>
        </details>
      ) : null}

      {/* §16: tell them exactly what happened to their image. */}
      <Alert tone={result.stored ? 'info' : 'success'}>
        {result.mode === 'device'
          ? 'Made on your device. Your photo was never uploaded, and nothing was saved anywhere.'
          : result.retentionNotice}
        {/* RET-7: the deletion link, shown once, here. */}
        {result.deletionUrl ? (
          <span className="mt-2 block break-all text-xs">
            Change your mind later?{' '}
            <a href={result.deletionUrl} className="font-bold underline">
              Delete my image with this private link
            </a>{' '}
            — save it now, we only show it once.{' '}
            <button type="button" className="font-bold underline" onClick={() => copy(result.deletionUrl, 'link')}>
              {copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
          </span>
        ) : null}
      </Alert>

      <button type="button" onClick={onRestart} className="wf-btn-secondary w-full">
        <Icon name="cdxIconReload" size="sm" /> Create another
      </button>
    </div>
  );
}

function IntentLink({ label, href, onClick }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onClick}
      className="wf-chip bg-white text-wiki-ink ring-wiki-line hover:bg-wiki-paper"
    >
      {label}
    </a>
  );
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wikiframes';
}

/** Decodes a base64 data URL locally (fetching it would need a looser CSP). */
function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/^data:([^;]+)/)?.[1] || 'image/jpeg';
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: mime });
}
