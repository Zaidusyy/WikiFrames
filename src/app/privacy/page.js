import Link from 'next/link';
import { config } from '@/lib/config';

export const metadata = {
  title: 'Data promises',
  description:
    'What WikiFrames stores, for how long, and how to have it deleted. Consent-first, 30-day maximum retention, permanent deletion.',
};

// SEC-6: "a public 'data promises' page states retention rules." This page is
// the commitment; §16 and the retention cron are its implementation.
export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/" className="text-sm font-semibold text-wiki-blue hover:underline">
        ← Back to WikiFrames
      </Link>

      <h1 className="mt-6 font-serif text-4xl">Our data promises</h1>
      <p className="mt-4 text-lg leading-relaxed text-wiki-slate">
        WikiFrames exists to help communities celebrate their events. It does not exist to collect
        data about you. This page says exactly what happens to everything the product touches.
      </p>

      <blockquote className="mt-8 border-l-4 border-wiki-blue bg-wiki-blue-light p-6 leading-relaxed">
        <strong>How we handle your image:</strong> If you allow it, your generated image is stored
        so the event organizers can showcase it in the campaign gallery.{' '}
        <strong>
          All stored images are kept for a maximum of 30 days after the event closes, then
          permanently deleted from our servers.
        </strong>{' '}
        If you don&apos;t allow storage, your image is generated one-time for you to download and
        share — and nothing is saved on our side; it vanishes after your session.
      </blockquote>

      <Section title="If you are a participant">
        <ul className="space-y-3">
          <Item>
            <strong>No account, ever.</strong> The campaign link is all you need. We never ask for
            your name, email or phone number, and there is no field to type them into.
          </Item>
          <Item>
            <strong>Consent is a real choice.</strong> The storage checkbox starts unticked. If you
            leave it that way, your image is composed and handed straight to you — it is never
            written to disk.
          </Item>
          <Item>
            <strong>Your photo is not kept.</strong> The photo you upload or capture is used to
            render one image and then discarded. Only the finished, framed image can be stored, and
            only if you said yes.
          </Item>
          <Item>
            <strong>Location data is stripped.</strong> Photos are re-encoded on our side, which
            removes EXIF metadata including GPS coordinates and camera details.
          </Item>
          <Item>
            <strong>You can delete it yourself.</strong> Every stored image comes with a private
            deletion link, shown once on your result screen. Open it and the image is gone
            immediately — no login, no support request.
          </Item>
          <Item>
            <strong>No tracking.</strong> The participant flow sets no cookies and does no
            fingerprinting. We count how many images were generated and how many share buttons were
            tapped. Those counters have no idea who you are.
          </Item>
          <Item>
            <strong>Your IP address is not stored with your image.</strong> It is used momentarily
            to rate-limit the open link against abuse, and then it is gone.
          </Item>
        </ul>
      </Section>

      <Section title="If you are an organizer">
        <ul className="space-y-3">
          <Item>
            <strong>You sign in with Wikimedia OAuth.</strong> We never see or store a password. We
            request identity scope only, and we never ask for permission to edit any wiki.
          </Item>
          <Item>
            <strong>We store what you typed.</strong> Your wiki username, central user ID, user
            page, declared user group and capacity — nothing gathered behind your back.
          </Item>
          <Item>
            <strong>The gallery is yours until day {config.retention.days}.</strong> Download the
            ZIP any time before then. After the deadline we delete our copies, including yours.
            Keeping your own archive — and honouring the same promise in it — is then up to you.
          </Item>
          <Item>
            <strong>Deleting a campaign is recoverable for 7 days</strong>, then it and every image
            in it are permanently removed.
          </Item>
        </ul>
      </Section>

      <Section title="How the deletion actually happens">
        <p className="leading-relaxed text-wiki-slate">
          Each stored image carries an expiry timestamp of <em>event end date + {config.retention.days} days</em>.
          A job runs daily, deletes the file from object storage, deletes the database row, and
          writes a line to the audit log. The storage bucket additionally carries a lifecycle rule
          for the same window, so even a failed job cannot quietly extend retention. Generated
          images are excluded from long-term backups, because a promise to delete something is
          worthless if a backup keeps it alive.
        </p>
      </Section>

      <Section title="Questions or a takedown request">
        <p className="leading-relaxed text-wiki-slate">
          Open an issue on{' '}
          <a
            href="https://github.com/Zaidusyy/WikiFrames/issues"
            className="font-semibold text-wiki-blue hover:underline"
            target="_blank"
            rel="noreferrer noopener"
          >
            the WikiFrames repository
          </a>
          . Public galleries and the community wall also carry a report button that reaches the
          platform team directly.
        </p>
      </Section>

      <p className="mt-12 border-t border-wiki-line pt-6 text-xs leading-relaxed text-wiki-slate">
        WikiFrames is an independent tool built for the Wikimedia community and is not endorsed by
        or affiliated with the Wikimedia Foundation.
      </p>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-12">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Item({ children }) {
  return (
    <li className="flex gap-3 leading-relaxed text-wiki-slate">
      <span aria-hidden="true" className="mt-0.5 text-wiki-green">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}
