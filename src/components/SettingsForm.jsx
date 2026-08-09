'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Button, Explainer, Field, useToast } from '@/components/ui';

const CAPACITIES = [
  ['organizer', 'Organizer'],
  ['participant', 'Participant'],
  ['contributor', 'Contributor'],
  ['co_team', 'Co-Team Member'],
];

const WALL_STATUS_COPY = {
  pending: 'Waiting for a reviewer — it will appear on the homepage once approved.',
  approved: 'Live on the homepage community wall.',
  hidden: 'Not shown on the homepage.',
};

// §7 "Profile is editable anytime from Dashboard → Settings → Profile."
export default function SettingsForm({ initial, userGroups }) {
  const [form, setForm] = useState(initial);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useToast();

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch('/me', {
        userGroup: form.userGroup,
        capacity: form.capacity,
        userPageUrl: form.userPageUrl,
        wallOptIn: form.wallOptIn,
      });
      set({ wallStatus: res.wallStatus });
      setToast('Profile saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file) {
    setBusy(true);
    setError(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/me/logo', data);
      setLogoUrl(res.logoUrl);
      setToast('Logo saved — it goes back into the review queue.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {toast}

      <header>
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-wiki-slate">
          Signed in as <strong>{initial.wikiUsername}</strong> with your Wikimedia account.
          {initial.role === 'super_admin' ? ' You are a platform super admin.' : ''}
        </p>
      </header>

      <Alert onDismiss={() => setError(null)}>{error}</Alert>

      <form onSubmit={save} className="wf-card space-y-5 p-6">
        <h2 className="font-serif text-xl">Profile</h2>

        <Field label="User group or affiliate">
          <input
            className="wf-input"
            list="wf-groups"
            value={form.userGroup}
            onChange={(e) => set({ userGroup: e.target.value })}
          />
          <datalist id="wf-groups">
            {userGroups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </Field>

        <Field label="Your capacity">
          <select
            className="wf-input"
            value={form.capacity}
            onChange={(e) => set({ capacity: e.target.value })}
          >
            {CAPACITIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Wiki user page">
          <input
            className="wf-input"
            type="url"
            value={form.userPageUrl}
            onChange={(e) => set({ userPageUrl: e.target.value })}
          />
        </Field>

        <label className="flex cursor-pointer gap-3 rounded-lg border border-wiki-line p-4 hover:bg-wiki-paper">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.wallOptIn}
            onChange={(e) => set({ wallOptIn: e.target.checked })}
          />
          <span className="text-sm">
            <span className="block font-semibold">Feature my user group on the community wall</span>
            <span className="text-wiki-slate">
              {form.wallOptIn
                ? WALL_STATUS_COPY[form.wallStatus] || WALL_STATUS_COPY.pending
                : 'Your group is not shown publicly.'}
            </span>
          </span>
        </label>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>

      <div className="wf-card space-y-4 p-6">
        <h2 className="font-serif text-xl">User group logo</h2>
        <Explainer>
          Logos appear in the community showcase. Upload only logos you have the right to use —
          ideally files already hosted on Wikimedia Commons.
        </Explainer>

        {logoUrl ? (
          <div className="flex items-center gap-4 rounded-lg border border-wiki-line p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Your user group logo" className="h-16 w-16 object-contain" />
            <p className="flex-1 text-sm text-wiki-slate">
              {WALL_STATUS_COPY[form.wallStatus] || WALL_STATUS_COPY.pending}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                await api.del('/me/logo');
                setLogoUrl(null);
                setToast('Logo removed.');
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <Field label="Upload a logo" hint="PNG or SVG, up to 2 MB.">
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="wf-input"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
          </Field>
        )}
      </div>

      <div className="wf-card space-y-3 p-6">
        <h2 className="font-serif text-xl">Your data</h2>
        <p className="text-sm leading-relaxed text-wiki-slate">
          WikiFrames stores your wiki username, central user ID, user page, declared group and
          capacity. No password ever exists, and we never request permission to edit any wiki. The
          images your participants generate follow the 30-day promise, which applies to your
          campaigns exactly as it does to everyone else&apos;s.
        </p>
        <Link href="/privacy" className="text-sm font-semibold text-wiki-blue hover:underline">
          Read our data promises →
        </Link>
      </div>
    </div>
  );
}
