'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { composeCaption } from '@/lib/caption';
import { Button, Explainer, Field } from '@/components/ui';

// CAP-5: the platform whose limit bites first. Warning at X's ceiling keeps a
// caption safe everywhere else too.
const X_LIMIT = 280;

/**
 * §9.1 step 4 / §15.1 — captions and hashtags.
 *
 * CAP-3 asks for an inline explainer next to these fields so the organizer
 * understands *why* they exist; it is rendered verbatim below.
 */
export default function CampaignCaptions({ campaign, onChange, onToast, onError }) {
  const existing = campaign.captions || [];
  const [captions, setCaptions] = useState(
    existing.length ? existing.map((c) => c.text) : ['']
  );
  const [hashtags, setHashtags] = useState(existing[0]?.hashtags || '');
  const [busy, setBusy] = useState(false);

  const sampleRole = campaign.roles?.[0];
  const sampleBadge = sampleRole ? `I'm a ${sampleRole.label} ${sampleRole.icon || ''}`.trim() : '';

  async function save() {
    setBusy(true);
    onError(null);
    try {
      const res = await api.put(`/campaigns/${campaign.id}/captions`, {
        captions: captions.filter((t) => t.trim()).map((text) => ({ text })),
        hashtags,
      });
      setCaptions(res.captions.map((c) => c.text));
      setHashtags(res.captions[0]?.hashtags || '');
      onChange?.(res.captions);
      onToast('Captions saved.');
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Explainer>
        These captions travel with every shared image. The first caption is mandatory and pre-filled
        for participants; optional captions give them a choice. Keep them energetic, friendly, and
        on-message — they are your event&apos;s public voice.
      </Explainer>

      <div className="wf-card space-y-5 p-6">
        {captions.map((text, index) => {
          const preview = composeCaption({
            badgeText: sampleBadge,
            caption: text,
            hashtags,
          });
          const over = preview.length > X_LIMIT;

          return (
            <div key={index} className="space-y-2">
              <Field
                label={index === 0 ? 'Mandatory caption' : `Optional caption ${index}`}
                required={index === 0}
                hint={
                  index === 0
                    ? 'What every participant shares unless they pick an alternative.'
                    : 'An alternative participants can switch to on the result screen.'
                }
              >
                <textarea
                  className="wf-input min-h-[80px]"
                  value={text}
                  maxLength={400}
                  onChange={(e) =>
                    setCaptions((c) => c.map((v, i) => (i === index ? e.target.value : v)))
                  }
                  placeholder={
                    index === 0
                      ? 'I am attending WikiConference India — meeting the people behind free knowledge!'
                      : 'Three days of sessions, stories and new friends across the movement.'
                  }
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={over ? 'font-bold text-wiki-warning' : 'text-wiki-slate'}>
                  {preview.length} characters with badge and hashtags
                  {over ? ` — over X’s ${X_LIMIT} limit, fine elsewhere` : ''}
                </span>
                {index > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCaptions((c) => c.filter((_, i) => i !== index))}
                    className="font-bold text-wiki-error hover:underline"
                  >
                    Remove this caption
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {captions.length < 4 ? (
          <Button variant="secondary" onClick={() => setCaptions((c) => [...c, ''])}>
            + Add an optional caption
          </Button>
        ) : null}
      </div>

      <div className="wf-card space-y-4 p-6">
        <Field
          label="Hashtags"
          hint="Appended to every caption. Type them with or without the # — we will tidy them up."
        >
          <input
            className="wf-input"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#WikiConference #Wikimedia #OpenKnowledge"
          />
        </Field>

        {/* CAP-4: show exactly what will be shared, badge prefix included. */}
        <div>
          <p className="wf-label">Preview of the shared text</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-wiki-line bg-wiki-paper p-4 font-sans text-sm">
            {composeCaption({
              badgeText: sampleBadge,
              caption: captions[0] || 'Your mandatory caption appears here.',
              hashtags,
            })}
          </pre>
          <p className="wf-hint">
            {sampleBadge
              ? `The first line comes from the role each participant picks — shown here with "${sampleRole.label}".`
              : 'Add roles in step 3 and each participant’s badge will be prefixed here automatically.'}
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy || !captions[0]?.trim()}>
            {busy ? 'Saving…' : 'Save captions'}
          </Button>
        </div>
      </div>
    </div>
  );
}
