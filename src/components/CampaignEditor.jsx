'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { toDateTimeLocal, formatDate } from '@/lib/format';
import Icon from '@/components/Icon';
import { Alert, Button, Explainer, Field, StatusBadge, cx, useConfirm, useToast } from '@/components/ui';
import CampaignTemplates from '@/components/CampaignTemplates';
import CampaignRoles from '@/components/CampaignRoles';
import CampaignCaptions from '@/components/CampaignCaptions';

// §9.1 steps 2–5, as tabs rather than a forced sequence: a draft is editable in
// any order, and a launched campaign still needs the same screens.
const STEPS = [
  ['details', '1 · Details'],
  ['templates', '2 · Templates & frames'],
  ['roles', '3 · Roles & badges'],
  ['captions', '4 · Captions & hashtags'],
  ['review', '5 · Review & launch'],
];

export default function CampaignEditor({ campaign: initial, access, initialStep, seededRoles }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState(initial);
  const [step, setStep] = useState(
    STEPS.some(([key]) => key === initialStep) ? initialStep : 'details'
  );
  const [error, setError] = useState(null);
  const [toast, setToast] = useToast();

  const isOwner = access === 'owner' || access === 'super_admin';

  async function lifecycle(action, message) {
    setError(null);
    try {
      const res = await api.post(`/campaigns/${campaign.id}/lifecycle`, { action });
      setCampaign((c) => ({
        ...c,
        ...res.campaign,
        effectiveStatus: res.effectiveStatus,
        participantUrl: res.participantUrl,
      }));
      setToast(message);
      router.refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {toast}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/dashboard/campaigns" className="inline-flex items-center gap-1 text-sm font-bold text-wiki-blue hover:underline">
            <Icon name="cdxIconArrowPrevious" size="sm" /> Campaigns
          </Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 font-serif text-3xl">
            {campaign.name}
            <StatusBadge status={campaign.effectiveStatus} />
          </h1>
          <p className="mt-1 text-sm text-wiki-slate">
            {formatDate(campaign.eventDate)} → {formatDate(campaign.eventEndDate)} ·{' '}
            {campaign.imagesGenerated} image{campaign.imagesGenerated === 1 ? '' : 's'} generated
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/campaigns/${campaign.id}/links`} className="wf-btn-secondary">
            <Icon name="cdxIconQrCode" size="sm" /> Links &amp; QR
          </Link>
          <Link href={`/dashboard/campaigns/${campaign.id}/gallery`} className="wf-btn-secondary">
            <Icon name="cdxIconImageGallery" size="sm" /> Gallery
          </Link>
          <Link href={`/dashboard/campaigns/${campaign.id}/analytics`} className="wf-btn-secondary">
            <Icon name="cdxIconChart" size="sm" /> Analytics
          </Link>
        </div>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      {access === 'co_team' ? (
        <div className="wf-note">
          You are a <strong>co-team member</strong> on this campaign. You can edit everything here;
          only the owner can cancel or delete it.
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label="Campaign setup steps">
        {STEPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStep(key)}
            aria-current={step === key ? 'step' : undefined}
            className={cx(
              'wf-chip text-sm',
              step === key
                ? 'bg-wiki-blue text-white ring-wiki-blue'
                : 'bg-white text-wiki-slate ring-wiki-line hover:bg-wiki-paper'
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {step === 'details' ? (
        <DetailsForm campaign={campaign} onSaved={setCampaign} onToast={setToast} onError={setError} />
      ) : null}

      {step === 'templates' ? (
        <CampaignTemplates
          campaign={campaign}
          onChange={(templates) => setCampaign((c) => ({ ...c, templates }))}
          onToast={setToast}
          onError={setError}
        />
      ) : null}

      {step === 'roles' ? (
        <CampaignRoles
          campaign={campaign}
          seededRoles={seededRoles}
          onChange={(roles, roleRequired) =>
            setCampaign((c) => ({ ...c, roles, roleRequired: roleRequired ?? c.roleRequired }))
          }
          onToast={setToast}
          onError={setError}
        />
      ) : null}

      {step === 'captions' ? (
        <CampaignCaptions
          campaign={campaign}
          onChange={(captions) => setCampaign((c) => ({ ...c, captions }))}
          onToast={setToast}
          onError={setError}
        />
      ) : null}

      {step === 'review' ? (
        <ReviewPanel
          campaign={campaign}
          isOwner={isOwner}
          onLifecycle={lifecycle}
          onGoTo={setStep}
        />
      ) : null}
    </div>
  );
}

function DetailsForm({ campaign, onSaved, onToast, onError }) {
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description,
    eventDate: toDateTimeLocal(campaign.eventDate),
    eventEndDate: toDateTimeLocal(campaign.eventEndDate),
    registrationOpenDate: toDateTimeLocal(campaign.registrationOpenDate),
    location: campaign.location || '',
    organizingGroup: campaign.organizingGroup || '',
    publicGallery: campaign.publicGallery,
    accessCode: campaign.accessCode || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const res = await api.patch(`/campaigns/${campaign.id}`, {
        ...form,
        eventDate: new Date(form.eventDate).toISOString(),
        eventEndDate: new Date(form.eventEndDate).toISOString(),
        registrationOpenDate: new Date(form.registrationOpenDate).toISOString(),
      });
      onSaved((c) => ({ ...c, ...res.campaign }));
      onToast('Details saved.');
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="wf-card space-y-5 p-6">
      <Field label="Campaign name" required>
        <input
          className="wf-input"
          required
          maxLength={80}
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>

      <Field label="Description" required>
        <textarea
          className="wf-input min-h-[96px]"
          required
          maxLength={1000}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Event date" required>
          <input
            className="wf-input"
            type="datetime-local"
            required
            value={form.eventDate}
            onChange={(e) => set({ eventDate: e.target.value })}
          />
        </Field>
        <Field label="Event end date" required hint="Starts the 30-day clock.">
          <input
            className="wf-input"
            type="datetime-local"
            required
            value={form.eventEndDate}
            onChange={(e) => set({ eventEndDate: e.target.value })}
          />
        </Field>
        <Field label="Registration opens" required>
          <input
            className="wf-input"
            type="datetime-local"
            required
            value={form.registrationOpenDate}
            onChange={(e) => set({ registrationOpenDate: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Location or online link">
          <input
            className="wf-input"
            value={form.location}
            onChange={(e) => set({ location: e.target.value })}
          />
        </Field>
        <Field label="Organizing user group" required>
          <input
            className="wf-input"
            required
            value={form.organizingGroup}
            onChange={(e) => set({ organizingGroup: e.target.value })}
          />
        </Field>
      </div>

      <label className="flex cursor-pointer gap-3 rounded border border-wiki-line p-4 hover:bg-wiki-paper">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.publicGallery}
          onChange={(e) => set({ publicGallery: e.target.checked })}
        />
        <span className="text-sm">
          <span className="block font-semibold">Public gallery after the event</span>
          <span className="text-wiki-slate">
            Lives at <code>/gallery/{campaign.slug}</code> for 30 days, then shows event stats only.
          </span>
        </span>
      </label>

      <Field
        label="Venue access code (optional)"
        hint="4–6 digits printed at the registration desk. Participants type it once before they can generate. Useful when a link might spread beyond the room."
      >
        <input
          className="wf-input max-w-[160px]"
          inputMode="numeric"
          maxLength={6}
          value={form.accessCode}
          onChange={(e) => set({ accessCode: e.target.value.replace(/\D/g, '') })}
          placeholder="e.g. 4821"
        />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </form>
  );
}

function ReviewPanel({ campaign, isOwner, onLifecycle, onGoTo }) {
  const confirm = useConfirm();
  const mandatory = campaign.captions?.find((c) => c.isMandatory);
  // The Frame Health Check result each template was last saved with.
  const unhealthy = (campaign.templates || []).filter((t) => t.canvasJson?.health?.errors > 0);
  const warned = (campaign.templates || []).filter((t) => !t.canvasJson?.health?.errors && t.canvasJson?.health?.warnings > 0);
  const checks = [
    {
      ok: Boolean(campaign.name && campaign.description),
      label: 'Name and description',
      fix: 'details',
    },
    {
      ok: (campaign.templates?.length ?? 0) > 0,
      label: `${campaign.templates?.length ?? 0} template(s) attached`,
      fix: 'templates',
    },
    {
      ok: true,
      label: `${campaign.roles?.length ?? 0} role(s) offered${campaign.roleRequired ? ' (required)' : ' (optional)'}`,
      fix: 'roles',
      optional: true,
    },
    {
      ok: Boolean(mandatory),
      label: 'Mandatory caption set',
      fix: 'captions',
    },
    {
      ok: unhealthy.length === 0,
      // Advice, not a gate: the organizer decides.
      optional: true,
      label: unhealthy.length
        ? `Frame Health Check found problems in ${unhealthy.map((t) => `“${t.name}”`).join(', ')}`
        : warned.length
          ? `Frames pass the Health Check, with tips for ${warned.length} template${warned.length === 1 ? '' : 's'}`
          : 'Frames pass the Health Check',
      fix: 'templates',
    },
  ];

  const ready = checks.every((c) => c.ok || c.optional);

  return (
    <div className="space-y-5">
      <div className="wf-card p-6">
        <h2 className="font-serif text-xl">Ready to launch?</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-3">
              <Icon
                name={check.ok ? 'cdxIconSuccess' : 'cdxIconError'}
                size="sm"
                className={check.ok ? 'text-wiki-success' : 'text-wiki-error'}
                label={check.ok ? 'Done' : 'Needs attention'}
              />
              <span className={cx('flex-1', !check.ok && 'text-wiki-error')}>{check.label}</span>
              <button
                type="button"
                onClick={() => onGoTo(check.fix)}
                className="text-xs font-bold text-wiki-blue hover:underline"
              >
                {check.ok ? 'Review' : 'Fix'}
              </button>
            </li>
          ))}
        </ul>

        <Explainer>
          Launching issues the participant link and QR code. The link only starts working at your
          registration opening date ({formatDate(campaign.registrationOpenDate, {
            hour: '2-digit',
            minute: '2-digit',
          })}), so it is safe to launch early.
        </Explainer>

        <div className="mt-5 flex flex-wrap gap-3">
          {campaign.status === 'draft' ? (
            <Button disabled={!ready} onClick={() => onLifecycle('launch', 'Campaign launched!')} icon="cdxIconPlay">
              Launch campaign
            </Button>
          ) : null}

          {campaign.status === 'active' ? (
            <Button
              variant="secondary"
              icon="cdxIconPause"
              onClick={() => onLifecycle('pause', 'Campaign paused.')}
            >
              Pause campaign
            </Button>
          ) : null}

          {campaign.status === 'inactive' ? (
            <Button icon="cdxIconPlay" onClick={() => onLifecycle('resume', 'Campaign is live again.')}>
              Resume campaign
            </Button>
          ) : null}

          {isOwner && ['draft', 'active', 'inactive'].includes(campaign.status) ? (
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Cancel this campaign?',
                  body: 'The participant link stops working immediately and cannot be revived. Stored images stay until their normal deletion date.',
                  confirmLabel: 'Cancel campaign',
                  cancelLabel: 'Keep it running',
                  destructive: true,
                });
                if (ok) onLifecycle('cancel', 'Campaign cancelled — the link is dead.');
              }}
            >
              Cancel campaign
            </Button>
          ) : null}
        </div>
      </div>

      {campaign.status !== 'draft' ? (
        <div className="wf-card p-6">
          <h3 className="font-bold">Participant link</h3>
          <p className="mt-1 break-all rounded bg-wiki-paper px-3 py-2 font-mono text-sm">
            {campaign.participantUrl}
          </p>
          <Link
            href={`/dashboard/campaigns/${campaign.id}/links`}
            className="mt-3 inline-block text-sm font-semibold text-wiki-blue hover:underline"
          >
            Open Links &amp; QR →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
