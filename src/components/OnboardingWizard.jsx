'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Alert, Button, Explainer, Field } from '@/components/ui';
import { WikiFramesMark } from '@/components/LandingHeader';

const CAPACITIES = [
  ['organizer', 'Organizer', 'I run events and will create campaigns.'],
  ['participant', 'Participant', 'I mostly attend events and join in.'],
  ['contributor', 'Contributor', 'I design frames, write, or help build.'],
  ['co_team', 'Co-Team Member', 'I help someone else run their campaigns.'],
];

const STEPS = ['Who you are', 'Your wiki identity', 'Your group logo'];

/**
 * §7 — a one-time, three-step wizard.
 *
 * Every field is explained inline in plain language, because this is a new tool
 * for the ecosystem and nobody has seen these concepts before.
 */
export default function OnboardingWizard({ initial, userGroups }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function saveStep(patch, next) {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/me', patch);
      if (next === 'done') {
        await api.patch('/me', { completeOnboarding: true });
        router.push('/dashboard');
        router.refresh();
        return;
      }
      setStep(next);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function linkCommonsLogo(url) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/me/logo', { commonsUrl: url });
      setLogoUrl(res.logoUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wf-card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <WikiFramesMark size={32} />
        <div>
          <h1 className="font-serif text-2xl">Welcome, {initial.wikiUsername}!</h1>
          <p className="text-sm text-wiki-slate">
            Three quick questions and you can create your first campaign.
          </p>
        </div>
      </div>

      <ol className="mt-6 flex items-center gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i <= step ? 'bg-wiki-blue text-white' : 'bg-wiki-paper text-wiki-slate'
              }`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span className="hidden text-xs font-medium text-wiki-slate sm:block">{label}</span>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-wiki-line" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-5">
        <Alert onDismiss={() => setError(null)}>{error}</Alert>

        {step === 0 ? (
          <>
            <Field
              label="Which user group or affiliate are you part of?"
              hint="Start typing — if your group is not listed, just type its name. This is how your community appears on the wall and on your campaigns."
              required
            >
              <input
                className="wf-input"
                list="wf-user-groups"
                value={form.userGroup}
                onChange={(e) => set({ userGroup: e.target.value })}
                placeholder="e.g. Wiki Club Tech, Wikimedians of Kerala…"
              />
              <datalist id="wf-user-groups">
                {userGroups.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </Field>

            <fieldset>
              <legend className="wf-label">In what capacity?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {CAPACITIES.map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      form.capacity === value
                        ? 'border-wiki-blue bg-wiki-blue-light'
                        : 'border-wiki-line hover:bg-wiki-paper'
                    }`}
                  >
                    <input
                      type="radio"
                      name="capacity"
                      className="mt-1"
                      checked={form.capacity === value}
                      onChange={() => set({ capacity: value })}
                    />
                    <span>
                      <span className="block font-semibold">{label}</span>
                      <span className="text-xs text-wiki-slate">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end">
              <Button
                disabled={busy || !form.userGroup.trim()}
                onClick={() => saveStep({ userGroup: form.userGroup, capacity: form.capacity }, 1)}
              >
                Continue
              </Button>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field
              label="Your wiki user page"
              hint="We filled this in from your Wikimedia login. Change it if you would rather link somewhere else on a Wikimedia site."
            >
              <input
                className="wf-input"
                type="url"
                value={form.userPageUrl}
                onChange={(e) => set({ userPageUrl: e.target.value })}
                placeholder="https://meta.wikimedia.org/wiki/User:YourName"
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
                <span className="block font-semibold">
                  Feature my user group on the WikiFrames community wall
                </span>
                <span className="text-wiki-slate">
                  Your group name and logo appear on the homepage as one of the communities building
                  with WikiFrames. Entries are reviewed before they go public, and you can turn this
                  off at any time.
                </span>
              </span>
            </label>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(0)} disabled={busy}>
                Back
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  saveStep({ userPageUrl: form.userPageUrl, wallOptIn: form.wallOptIn }, 2)
                }
              >
                Continue
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Explainer>
              Logos appear in the community showcase. Upload only logos you have the right to use —
              ideally files already hosted on Wikimedia Commons.
            </Explainer>

            {logoUrl ? (
              <div className="flex items-center gap-4 rounded-lg border border-wiki-line p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Your user group logo" className="h-16 w-16 object-contain" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">Logo saved</p>
                  <p className="text-wiki-slate">It will show once a reviewer approves it.</p>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    await api.del('/me/logo');
                    setLogoUrl(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Upload a file" hint="PNG or SVG, up to 2 MB.">
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    className="wf-input"
                    disabled={busy}
                    onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                  />
                </Field>
                <Field label="…or paste a Commons link" hint="A file page URL from commons.wikimedia.org.">
                  <input
                    className="wf-input"
                    placeholder="https://commons.wikimedia.org/wiki/File:…"
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value) {
                        e.preventDefault();
                        linkCommonsLogo(e.currentTarget.value);
                      }
                    }}
                    onBlur={(e) => e.target.value && linkCommonsLogo(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                Back
              </Button>
              <Button disabled={busy} onClick={() => saveStep({}, 'done')}>
                {logoUrl ? 'Finish' : 'Skip and finish'}
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <p className="mt-8 border-t border-wiki-line pt-4 text-xs text-wiki-slate">
        You can change any of this later under Dashboard → Settings → Profile.
      </p>
    </div>
  );
}
