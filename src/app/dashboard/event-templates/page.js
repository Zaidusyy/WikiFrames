import Link from 'next/link';
import { EVENT_PRESETS, DEFAULT_TEMPLATES } from '@/lib/presets';

export const metadata = { title: 'Event templates' };

// §8.1 Event Templates / CAMP-5 — one click turns a preset into a pre-filled
// campaign draft with themed frames, suggested captions and suggested roles.
export default function EventTemplatesPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Event templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-wiki-slate">
          Ready-made starting points for the events the movement runs again and again. Pick one and
          your campaign draft arrives with captions, hashtags and roles already suggested — every
          bit of it editable.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EVENT_PRESETS.map((preset) => (
          <li key={preset.key} className="wf-card flex flex-col p-5">
            <div
              className="mb-4 flex h-24 items-center justify-center rounded-lg"
              style={{ background: preset.theme.background, color: preset.theme.accent }}
            >
              <span className="h-10 w-10 rounded-full border-4 border-current" aria-hidden="true" />
            </div>

            <h2 className="font-serif text-lg">{preset.name}</h2>
            <p className="mt-1 text-sm text-wiki-slate">{preset.blurb}</p>

            <dl className="mt-4 space-y-2 text-xs">
              <div>
                <dt className="font-semibold text-wiki-slate">Suggested caption</dt>
                <dd className="mt-0.5 leading-relaxed">
                  &ldquo;{preset.defaultCaptions[0].text}&rdquo;
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-wiki-slate">Hashtags</dt>
                <dd className="mt-0.5 text-wiki-blue">{preset.defaultCaptions[0].hashtags}</dd>
              </div>
              <div>
                <dt className="font-semibold text-wiki-slate">Roles</dt>
                <dd className="mt-0.5">{preset.defaultRoles.join(' · ')}</dd>
              </div>
            </dl>

            <Link
              href={`/dashboard/campaigns/new?preset=${preset.key}`}
              className="wf-btn-primary mt-5 justify-center"
            >
              Use this template
            </Link>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="font-serif text-xl">Frame designs that ship with WikiFrames</h2>
        <p className="mt-1 text-sm text-wiki-slate">
          Six editable canvas designs, all original artwork under a free licence. You will find them
          when you add a template to a campaign.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {DEFAULT_TEMPLATES.map((template) => (
            <li key={template.key} className="wf-card p-3 text-center">
              <div
                className="mb-2 flex items-center justify-center rounded"
                style={{
                  background: template.background,
                  color: template.accent,
                  aspectRatio: template.aspectRatio.replace(':', ' / '),
                }}
              >
                <span className="h-8 w-8 rounded-full border-2 border-current" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold leading-tight">{template.name}</p>
              <p className="text-[11px] text-wiki-slate">{template.aspectRatio}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-wiki-slate">
        All shipped artwork is original and openly licensed. WikiFrames deliberately does not use
        the Wikimedia puzzle globe, wordmarks or sister-project logos — those are trademarks, and
        this is an independent tool.
      </p>
    </div>
  );
}
