'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { composeCaption } from '@/lib/caption';
import { formatDateRange } from '@/lib/format';
import { cx } from '@/components/ui';

const RATIO_DIMS = {
  '9:16': { w: 1080, h: 1920 },
  '4:5': { w: 1080, h: 1350 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

const STEPS = ['template', 'role', 'photo', 'result'];

/**
 * §14 — the participant experience.
 *
 * Design principle from the spec: zero friction, mobile-first, done in under a
 * minute. Everything below serves that — no account, no personal fields, live
 * preview at every moment, and a single Generate button.
 */
export default function ParticipantFlow({ segment, payload }) {
  const { campaign, templates, roles, captions, consent } = payload;

  const [step, setStep] = useState(templates.length === 1 ? 'role' : 'template');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? null);
  const [roleId, setRoleId] = useState(null);
  const [captionId, setCaptionId] = useState(payload.mandatoryCaptionId);
  const [photo, setPhoto] = useState(null); // { file, url }
  const [fit, setFit] = useState({ zoom: 1, panX: 0, panY: 0, rotate: 0 });
  const [allowStorage, setAllowStorage] = useState(false); // RET-1: unticked by default
  const [accessCode, setAccessCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const template = templates.find((t) => t.id === templateId) || templates[0];
  const role = roles.find((r) => r.id === roleId) || null;
  const caption = captions.find((c) => c.id === captionId) || captions[0] || null;

  // Analytics beacon: campaign-level counters only, no cookie, no identifier.
  useEffect(() => {
    const via = new URLSearchParams(window.location.search).get('via');
    fetch(`/api/v1/c/${segment}?via=${via === 'qr' ? 'qr' : 'link'}`, { cache: 'no-store' }).catch(
      () => {}
    );
  }, [segment]);

  // Revoke the object URL when the photo changes or the flow unmounts, so the
  // browser is not holding a copy of the participant's image any longer than
  // the session needs it.
  useEffect(() => {
    return () => {
      if (photo?.url) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  const shareText = useMemo(
    () =>
      composeCaption({
        badgeText: role?.badgeText,
        caption: caption?.text,
        hashtags: caption?.hashtags,
      }),
    [role, caption]
  );

  function beacon(kind, platform) {
    fetch(`/api/v1/c/${segment}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, platform }),
      keepalive: true,
    }).catch(() => {});
  }

  async function generate() {
    if (!photo || !template) return;
    if (campaign.roleRequired && !role) {
      setError('Please choose a role first.');
      setStep('role');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const placement = computePlacement({ template, fit, photo });
      const data = new FormData();
      data.append('photo', photo.file);
      data.append('templateId', template.id);
      if (role) data.append('roleId', role.id);
      if (caption) data.append('captionId', caption.id);
      data.append('consent', String(allowStorage));
      data.append('placement', JSON.stringify(placement));
      if (accessCode) data.append('accessCode', accessCode);

      const res = await fetch(`/api/v1/c/${segment}/generate`, { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');

      setResult(json);
      setStep('result');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * A photo is sized by width in both the preview and the server placement, so
   * a landscape photo dropped into a tall cutout would leave the frame showing
   * through at the top and bottom. Start zoomed far enough to cover the hole;
   * the participant can zoom back out if they want the whole shot visible.
   */
  function choosePhoto(next) {
    if (!next) {
      setPhoto(null);
      return;
    }
    const dims = RATIO_DIMS[template?.aspectRatio] || RATIO_DIMS['1:1'];
    const cutout = template?.cutout || { sizePct: 0.52 };
    const size = Math.min(dims.w, dims.h) * (cutout.sizePct ?? 0.52);
    const boxW = cutout.widthPx ?? size;
    const boxH = cutout.heightPx ?? size;
    const coverZoom = Math.max(1, (boxH * (next.naturalRatio || 1)) / boxW);

    setPhoto(next);
    setFit({ zoom: coverZoom, panX: 0, panY: 0, rotate: 0 });
  }

  function restart() {
    setResult(null);
    setFit({ zoom: 1, panX: 0, panY: 0, rotate: 0 });
    setStep(templates.length === 1 ? 'photo' : 'template');
  }

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
        <StepBar step={step} hasRoles={roles.length > 0} multiTemplate={templates.length > 1} />
      </header>

      <main id="main" className="mx-auto max-w-lg px-5 py-6">
        {error ? (
          <div role="alert" className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
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
            consent={consent}
            allowStorage={allowStorage}
            onAllowStorage={setAllowStorage}
            requiresAccessCode={campaign.requiresAccessCode}
            accessCode={accessCode}
            onAccessCode={setAccessCode}
            busy={busy}
            onGenerate={generate}
            onBack={() => setStep(roles.length ? 'role' : 'template')}
          />
        ) : null}

        {step === 'result' && result ? (
          <ResultStep
            result={result}
            shareText={shareText}
            captions={captions}
            captionId={captionId}
            onCaption={setCaptionId}
            badgeText={role?.badgeText}
            campaignName={campaign.name}
            onBeacon={beacon}
            onRestart={restart}
          />
        ) : null}
      </main>

      <footer className="mx-auto max-w-lg px-5 pb-10 text-center">
        <Link href="/" className="text-xs font-semibold text-wiki-blue hover:underline">
          Made with WikiFrames
        </Link>
        <p className="mt-2 text-[11px] leading-relaxed text-wiki-slate">
          Independent tool built for the Wikimedia community. Not endorsed by the Wikimedia
          Foundation.
        </p>
      </footer>
    </div>
  );
}

// ── steps ───────────────────────────────────────────────────────────────────

function StepBar({ step, hasRoles, multiTemplate }) {
  const visible = STEPS.filter(
    (s) => (s !== 'template' || multiTemplate) && (s !== 'role' || hasRoles)
  );
  const labels = { template: 'Frame', role: 'Badge', photo: 'Photo', result: 'Share' };
  const currentIndex = visible.indexOf(step);

  return (
    <ol className="mx-auto flex max-w-lg gap-1 px-5 pb-3" aria-label="Progress">
      {visible.map((key, i) => (
        <li key={key} className="flex-1">
          <div
            className={cx('h-1 rounded-full', i <= currentIndex ? 'bg-wiki-blue' : 'bg-wiki-line')}
          />
          <span
            className={cx(
              'mt-1 block text-[11px] font-medium',
              i <= currentIndex ? 'text-wiki-blue' : 'text-wiki-slate'
            )}
          >
            {labels[key]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TemplateChooser({ templates, description, selectedId, onSelect }) {
  return (
    <div className="space-y-4">
      <div className="wf-card p-5">
        <h2 className="font-serif text-lg">Pick a frame</h2>
        <p className="mt-1 text-sm leading-relaxed text-wiki-slate">{description}</p>
        <p className="mt-3 text-sm text-wiki-slate">
          Choose whichever shape suits where you want to post — tall for stories, square for chats.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onSelect(template.id)}
              aria-pressed={selectedId === template.id}
              className={cx(
                'w-full rounded-xl border-2 bg-white p-2 text-left transition-colors',
                selectedId === template.id ? 'border-wiki-blue' : 'border-wiki-line'
              )}
            >
              <span
                className="wf-checker block overflow-hidden rounded-lg"
                style={{ aspectRatio: template.aspectRatio.replace(':', ' / ') }}
              >
                <span className="relative block h-full w-full">
                  <span className="absolute inset-0 bg-gradient-to-br from-sky-200 via-indigo-200 to-violet-200" />
                  {template.frameUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={template.frameUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : null}
                </span>
              </span>
              <span className="mt-2 block px-1 pb-1">
                <span className="block truncate text-sm font-semibold">{template.name}</span>
                <span className="text-xs text-wiki-slate">{template.aspectRatio}</span>
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
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              aria-pressed={selectedId === role.id}
              onClick={() => onSelect(selectedId === role.id ? null : role.id)}
              className={cx(
                'wf-chip',
                selectedId === role.id
                  ? 'bg-wiki-blue text-white ring-wiki-blue'
                  : 'bg-white text-wiki-ink ring-wiki-line'
              )}
            >
              <span aria-hidden="true">{role.icon}</span>
              {role.label}
            </button>
          ))}
        </div>

        {/* Live badge preview (BADGE-2). */}
        <div className="mt-5 rounded-lg bg-wiki-paper p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-wiki-slate">
            Your badge
          </p>
          <p className="mt-2">
            <span className="inline-block rounded-full bg-wiki-blue px-4 py-2 text-sm font-bold text-white">
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
        <button
          type="button"
          onClick={onNext}
          disabled={required && !selectedId}
          className="wf-btn-primary flex-1"
        >
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
  consent,
  allowStorage,
  onAllowStorage,
  requiresAccessCode,
  accessCode,
  onAccessCode,
  busy,
  onGenerate,
  onBack,
}) {
  const [camera, setCamera] = useState(null); // MediaStream
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
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
        onPhoto(await describePhoto(file));
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  }

  async function pickFile(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setCameraError('That photo is larger than 15 MB. Try a smaller one.');
      return;
    }
    onPhoto(await describePhoto(file));
  }

  return (
    <div className="space-y-4">
      {!photo ? (
        <div className="wf-card space-y-4 p-5">
          <h2 className="font-serif text-lg">Add your photo</h2>

          {camera ? (
            <div className="space-y-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg bg-black"
              />
              <div className="flex gap-2">
                <button type="button" onClick={capture} className="wf-btn-primary flex-1">
                  📸 Take the photo
                </button>
                <button
                  type="button"
                  onClick={() => startCamera(facing === 'user' ? 'environment' : 'user')}
                  className="wf-btn-secondary"
                  aria-label="Switch camera"
                >
                  🔄
                </button>
                <button type="button" onClick={stopCamera} className="wf-btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-wiki-line p-6 text-center hover:bg-wiki-paper">
                <span aria-hidden="true" className="text-3xl">
                  📁
                </span>
                <span className="text-sm font-semibold">Upload a photo</span>
                <span className="text-xs text-wiki-slate">JPG, PNG or WebP up to 15 MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
              </label>

              <button
                type="button"
                onClick={() => startCamera()}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-wiki-line p-6 text-center hover:bg-wiki-paper"
              >
                <span aria-hidden="true" className="text-3xl">
                  📷
                </span>
                <span className="text-sm font-semibold">Use the camera</span>
                <span className="text-xs text-wiki-slate">Front or back, your choice</span>
              </button>
            </div>
          )}

          {cameraError ? (
            <p className="text-sm text-amber-800" role="status">
              {cameraError}
            </p>
          ) : null}

          <button type="button" onClick={onBack} className="wf-btn-secondary w-full">
            Back
          </button>
        </div>
      ) : (
        <>
          {/* §14.1 step 5 — fit the photo. The frame stays fixed on top. */}
          <FitPreview template={template} photo={photo} fit={fit} onFit={onFit} role={role} />

          <div className="wf-card space-y-3 p-5">
            <p className="text-sm font-semibold">Fit your photo</p>
            <label className="block text-xs font-medium">
              Zoom
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.01"
                className="w-full"
                value={fit.zoom}
                onChange={(e) => onFit({ ...fit, zoom: Number(e.target.value) })}
              />
            </label>
            <label className="block text-xs font-medium">
              Rotate
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                className="w-full"
                value={fit.rotate}
                onChange={(e) => onFit({ ...fit, rotate: Number(e.target.value) })}
              />
            </label>
            <p className="text-xs text-wiki-slate">
              Drag the photo inside the frame to move it. Pinch to zoom on a phone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onPhoto(photo)}
                className="wf-btn-secondary flex-1 text-xs"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => onPhoto(null)}
                className="wf-btn-secondary flex-1 text-xs"
              >
                Choose another photo
              </button>
            </div>
          </div>

          {/* §16 — the consent gate, before anything is generated. */}
          <div className="wf-card space-y-3 p-5">
            <label className="flex cursor-pointer gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={allowStorage}
                onChange={(e) => onAllowStorage(e.target.checked)}
              />
              <span className="text-sm font-medium">{consent.label}</span>
            </label>
            <details className="text-xs text-wiki-slate">
              <summary className="cursor-pointer font-semibold text-wiki-blue">
                What happens to my image?
              </summary>
              <p className="mt-2 leading-relaxed">{consent.policy}</p>
            </details>
          </div>

          {requiresAccessCode ? (
            <div className="wf-card p-5">
              <label className="block text-sm font-semibold">
                Venue access code
                <input
                  className="wf-input mt-1.5 max-w-[160px] text-center text-lg tracking-[0.3em]"
                  inputMode="numeric"
                  maxLength={6}
                  value={accessCode}
                  onChange={(e) => onAccessCode(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              <p className="wf-hint">The organizers have it on display at the event.</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="wf-btn-primary w-full py-4 text-base"
          >
            {busy ? 'Creating your image…' : '✨ Generate my image'}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The live preview. This mirrors the server's compositing order exactly —
 * photo, then cutout clip, then frame, then badge — so what a participant drags
 * into place is what the finished PNG contains.
 */
function FitPreview({ template, photo, fit, onFit, role }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const dims = RATIO_DIMS[template?.aspectRatio] || RATIO_DIMS['1:1'];
  const cutout = template?.cutout || { shape: 'circle', xPct: 0.5, yPct: 0.42, sizePct: 0.52 };

  const cutoutPct = useMemo(() => geometryPercent(cutout, dims), [cutout, dims]);

  function onPointerDown(event) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: fit.panX,
      panY: fit.panY,
      width: box.width,
      height: box.height,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    // Pan is stored as a fraction of the canvas so it survives any screen size.
    onFit({
      ...fit,
      panX: drag.panX + (event.clientX - drag.x) / drag.width,
      panY: drag.panY + (event.clientY - drag.y) / drag.height,
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  const clipPath =
    cutout.shape === 'rounded'
      ? `inset(${cutoutPct.top}% ${100 - cutoutPct.right}% ${100 - cutoutPct.bottom}% ${cutoutPct.left}% round ${Math.round((cutout.radius ?? 40) / dims.w * 100)}%)`
      : `ellipse(${cutoutPct.width / 2}% ${cutoutPct.height / 2}% at ${cutoutPct.centerX}% ${cutoutPct.centerY}%)`;

  return (
    <div
      ref={containerRef}
      className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-wiki-line bg-white shadow-card"
      style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="absolute inset-0" style={{ clipPath, WebkitClipPath: clipPath }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt="Your photo"
          draggable={false}
          className="absolute origin-center"
          style={{
            left: `${cutoutPct.centerX + fit.panX * 100}%`,
            top: `${cutoutPct.centerY + fit.panY * 100}%`,
            width: `${cutoutPct.width * fit.zoom}%`,
            transform: `translate(-50%, -50%) rotate(${fit.rotate}deg)`,
            minWidth: `${cutoutPct.width * fit.zoom}%`,
          }}
        />
      </div>

      {template?.frameUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={template.frameUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
        />
      ) : null}

      {role ? (
        <div
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 justify-center"
          style={{
            left: `${(template?.badge?.xPct ?? 0.5) * 100}%`,
            top: `${(template?.badge?.yPct ?? 0.86) * 100}%`,
          }}
        >
          <span className="whitespace-nowrap rounded-full bg-wiki-blue px-3 py-1.5 text-[11px] font-bold text-white sm:text-xs">
            {role.badgeText}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ResultStep({
  result,
  shareText,
  captions,
  captionId,
  onCaption,
  badgeText,
  campaignName,
  onBeacon,
  onRestart,
}) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(null);
  // Read after mount: this component is client-side but Next still renders it
  // on the server, where `window` does not exist.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const activeCaption = captions.find((c) => c.id === captionId) || captions[0];
  const text = composeCaption({
    badgeText,
    caption: activeCaption?.text,
    hashtags: activeCaption?.hashtags,
  }) || shareText;

  async function imageFile() {
    const res = await fetch(result.image.url);
    const blob = await res.blob();
    return new File([blob], `${slug(campaignName)}.png`, { type: blob.type || 'image/png' });
  }

  /**
   * SHARE-2 — Web Share API Level 2: the image file and the caption travel
   * together into the OS share sheet, so the participant lands in WhatsApp or
   * Instagram with both already attached.
   */
  async function share() {
    setShareError(null);
    try {
      const file = await imageFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: campaignName });
        onBeacon('share_tap', 'native');
        return;
      }
      // SHARE-3 fallback: download the image, copy the caption, explain.
      await navigator.clipboard?.writeText(text).catch(() => {});
      download();
      setShareError('Caption copied — attach the downloaded image in your app.');
      onBeacon('share_tap', 'fallback');
    } catch (err) {
      if (err?.name === 'AbortError') return; // participant dismissed the sheet
      setShareError('Sharing did not work here. Download the image and post it manually.');
    }
  }

  function download() {
    const link = document.createElement('a');
    link.href = result.image.url;
    link.download = `${slug(campaignName)}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    onBeacon('download');
  }

  async function copyCaption() {
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="wf-card overflow-hidden p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.image.url} alt="Your finished image" className="w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={download} className="wf-btn-secondary py-3">
          ⬇ Download
        </button>
        <button type="button" onClick={share} className="wf-btn-primary py-3">
          📲 Share
        </button>
      </div>

      {shareError ? (
        <p role="status" className="rounded-lg bg-wiki-blue-light px-4 py-3 text-sm text-wiki-blue-dark">
          {shareError}
        </p>
      ) : null}

      {/* SHARE-3: explicit per-platform intents for desktop and older browsers. */}
      <div className="wf-card p-5">
        <p className="text-sm font-semibold">Or post it directly</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <IntentLink
            label="WhatsApp"
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            onClick={() => onBeacon('share_tap', 'whatsapp')}
          />
          <IntentLink
            label="X"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`}
            onClick={() => onBeacon('share_tap', 'x')}
          />
          <IntentLink
            label="Telegram"
            href={`https://t.me/share/url?url=${encodeURIComponent(text)}`}
            onClick={() => onBeacon('share_tap', 'telegram')}
          />
          <IntentLink
            label="LinkedIn"
            href="https://www.linkedin.com/feed/?shareActive=true"
            onClick={() => onBeacon('share_tap', 'linkedin')}
          />
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
        <p className="text-sm font-semibold">Your caption</p>
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
                  c.id === activeCaption?.id
                    ? 'bg-wiki-blue text-white ring-wiki-blue'
                    : 'bg-white text-wiki-slate ring-wiki-line'
                )}
              >
                {i === 0 ? 'Suggested' : `Option ${i + 1}`}
              </button>
            ))}
          </div>
        ) : null}

        <textarea readOnly value={text} className="wf-input min-h-[110px] text-sm" />
        <button type="button" onClick={copyCaption} className="wf-btn-secondary w-full text-sm">
          {copied ? '✓ Copied' : 'Copy caption'}
        </button>
      </div>

      {/* §16: tell them exactly what happened to their image. */}
      <div
        className={cx(
          'rounded-lg border px-4 py-3 text-sm',
          result.stored
            ? 'border-wiki-blue/30 bg-wiki-blue-light text-wiki-blue-dark'
            : 'border-emerald-300 bg-emerald-50 text-emerald-800'
        )}
      >
        <p>{result.retentionNotice}</p>
        {/* RET-7: the deletion link, shown once, here. */}
        {result.deletionUrl ? (
          <p className="mt-2 break-all text-xs">
            Change your mind later?{' '}
            <a href={result.deletionUrl} className="font-semibold underline">
              Delete my image with this private link
            </a>{' '}
            — save it now, we only show it once.
          </p>
        ) : null}
      </div>

      <button type="button" onClick={onRestart} className="wf-btn-secondary w-full">
        ✨ Create another
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

// ── geometry ────────────────────────────────────────────────────────────────

/**
 * Measures the photo before it enters the flow. The natural aspect ratio is
 * what lets the preview (which sizes by width) and the server placement agree
 * on the resulting height.
 */
function describePhoto(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ file, url, naturalRatio: img.naturalWidth / img.naturalHeight || 1 });
    img.onerror = () => resolve({ file, url, naturalRatio: 1 });
    img.src = url;
  });
}

function geometryPercent(cutout, dims) {
  const size = Math.min(dims.w, dims.h) * (cutout.sizePct ?? 0.52);
  const w = cutout.widthPx ?? size;
  const h = cutout.heightPx ?? size;
  const centerX = (cutout.xPct ?? 0.5) * 100;
  const centerY = (cutout.yPct ?? 0.42) * 100;
  const width = (w / dims.w) * 100;
  const height = (h / dims.h) * 100;
  return {
    centerX,
    centerY,
    width,
    height,
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
  };
}

/**
 * Translates the on-screen fit into canvas pixels for the server renderer.
 *
 * The preview sizes the photo by *width* and lets height follow the photo's
 * aspect ratio; this reproduces that, so the server's `cover` resize lands on
 * the same crop the participant saw.
 */
function computePlacement({ template, fit, photo }) {
  const dims = RATIO_DIMS[template.aspectRatio] || RATIO_DIMS['1:1'];
  const cutout = template.cutout || { xPct: 0.5, yPct: 0.42, sizePct: 0.52 };
  const size = Math.min(dims.w, dims.h) * (cutout.sizePct ?? 0.52);
  const boxW = cutout.widthPx ?? size;
  const boxH = cutout.heightPx ?? size;

  const width = boxW * fit.zoom;
  const naturalRatio = photo.naturalRatio || 1;
  const height = width / naturalRatio;

  const centerX = (cutout.xPct ?? 0.5) * dims.w + fit.panX * dims.w;
  const centerY = (cutout.yPct ?? 0.42) * dims.h + fit.panY * dims.h;

  return {
    left: Math.round(centerX - width / 2),
    top: Math.round(centerY - height / 2),
    width: Math.round(width),
    height: Math.round(height),
    rotate: fit.rotate || 0,
    // `contain` keeps the whole photo visible inside the computed box, which is
    // what the preview's width-driven sizing shows.
    fit: 'contain',
    cutoutBox: { width: Math.round(boxW), height: Math.round(boxH) },
  };
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wikiframes';
}
