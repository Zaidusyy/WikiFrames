'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { toDateTimeLocal } from '@/lib/format';
import { Alert, Button, Explainer, Field } from '@/components/ui';

/**
 * §9.1 step 1 — basic event details.
 *
 * Creation deliberately stops here and hands over to the campaign editor for
 * steps 2–5. The wizard's later steps need a campaign id to attach templates,
 * roles and captions to, so the first save is what brings the draft into being.
 */
export default function CampaignCreateForm({ defaultGroup, preset, presets }) {
  const router = useRouter();
  const now = new Date();
  const inAWeek = new Date(now.getTime() + 7 * 86400000);

  const [form, setForm] = useState({
    name: preset ? `${preset.name} ` : '',
    description: preset?.blurb || '',
    eventDate: toDateTimeLocal(inAWeek),
    eventEndDate: toDateTimeLocal(new Date(inAWeek.getTime() + 8 * 3600000)),
    registrationOpenDate: toDateTimeLocal(now),
    location: '',
    organizingGroup: defaultGroup,
    publicGallery: false,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/campaigns', {
        ...form,
        eventDate: new Date(form.eventDate).toISOString(),
        eventEndDate: new Date(form.eventEndDate).toISOString(),
        registrationOpenDate: new Date(form.registrationOpenDate).toISOString(),
        presetKey: preset?.key,
      });
      router.push(`/dashboard/campaigns/${res.campaign.id}?step=templates`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/dashboard/campaigns" className="text-sm font-semibold text-wiki-blue hover:underline">
          ← Campaigns
        </Link>
        <h1 className="mt-2 font-serif text-3xl">Create a campaign</h1>
        <p className="mt-1 text-sm text-wiki-slate">
          Step 1 of 5 — the basics. Templates, roles, captions and launch come next, and everything
          is saved as a draft until you are ready.
        </p>
      </header>

      {preset ? (
        <div className="wf-note">
          Starting from the <strong>{preset.name}</strong> event template. Its suggested captions and
          roles will be filled in for you — all of it editable.
        </div>
      ) : presets?.length ? (
        <details className="wf-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Prefer to start from a ready-made event template?
          </summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {presets.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/dashboard/campaigns/new?preset=${p.key}`}
                  className="block rounded-lg border border-wiki-line p-3 text-sm hover:bg-wiki-paper"
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-wiki-slate">{p.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <form onSubmit={submit} className="wf-card space-y-5 p-6">
        <Alert onDismiss={() => setError(null)}>{error}</Alert>

        <Field
          label="Campaign name"
          required
          hint="What participants will see at the top of their screen. Up to 80 characters."
        >
          <input
            className="wf-input"
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="WikiConference India 2026"
          />
        </Field>

        <Field
          label="Description"
          required
          hint="A sentence or two shown on the participant page. Warm and plain — most people arriving have never heard of a user group."
        >
          <textarea
            className="wf-input min-h-[96px]"
            required
            maxLength={1000}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Three days of sessions, stories and new friends across the movement."
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Event date" required>
            <input
              className="wf-input"
              type="datetime-local"
              required
              value={form.eventDate}
              onChange={(e) => set({ eventDate: e.target.value })}
            />
          </Field>

          <Field
            label="Event end date"
            required
            hint="This starts the 30-day retention clock for stored images."
          >
            <input
              className="wf-input"
              type="datetime-local"
              required
              value={form.eventEndDate}
              onChange={(e) => set({ eventEndDate: e.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Registration opening date"
          required
          hint="The participant link stays closed until this moment. Leave it as now if you want it live the second you launch."
        >
          <input
            className="wf-input"
            type="datetime-local"
            required
            value={form.registrationOpenDate}
            onChange={(e) => set({ registrationOpenDate: e.target.value })}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Location or online link">
            <input
              className="wf-input"
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="Delhi, India · or a meeting link"
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

        <label className="flex cursor-pointer gap-3 rounded-lg border border-wiki-line p-4 hover:bg-wiki-paper">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.publicGallery}
            onChange={(e) => set({ publicGallery: e.target.checked })}
          />
          <span className="text-sm">
            <span className="block font-semibold">Show a public gallery after the event</span>
            <span className="text-wiki-slate">
              Anyone with the link can browse the images participants agreed to share, for 30 days
              after the event. Leave it off and the gallery stays inside your dashboard.
            </span>
          </span>
        </label>

        <Explainer>
          Nothing is public yet. This creates a <strong>draft</strong> — you will add templates,
          roles and captions next, and only the Launch button makes the participant link live.
        </Explainer>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/campaigns" className="wf-btn-secondary">
            Cancel
          </Link>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create draft & continue'}
          </Button>
        </div>
      </form>
    </div>
  );
}
