import Link from 'next/link';
import { config } from '@/lib/config';
import Icon from '@/components/Icon';

export const metadata = {
  title: 'Data promises',
  description:
    'What WikiFrames stores, for how long, and how to have it deleted. Photos are framed on your own device; stored images are deleted at the latest 30 days after the event.',
};

// SEC-6: "a public 'data promises' page states retention rules." This page is
// the commitment; §16, the on-device compositor and the retention job are its
// implementation. Every sentence here must stay literally true.
export default function PrivacyPage() {
  const days = config.retention.days;
  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-wiki-blue hover:underline">
        <Icon name="cdxIconArrowPrevious" size="sm" /> Back to WikiFrames
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
          All stored images are kept for a maximum of {days} days after the event closes, then
          permanently deleted from our servers.
        </strong>{' '}
        If you don&apos;t allow storage, your image is created on your own device — your photo is
        not uploaded, and nothing is saved on our side.
      </blockquote>

      <Section title="If you are a participant">
        <ul className="space-y-3">
          <Item>
            <strong>No account, ever.</strong> The campaign link is all you need. We never ask for
            your name, email or phone number, and there is no field to type them into.
          </Item>
          <Item>
            <strong>Your photo stays on your device.</strong> When you do not allow storage, your
            browser frames the photo itself — it is decoded, framed and saved as an image right
            there, and never sent to us. If your browser cannot do that, you are told, and the
            image is only made on our server if you choose that option; it is then used once, in
            memory, and discarded.
          </Item>
          <Item>
            <strong>Consent is a real choice.</strong> The storage checkbox starts unticked. Only if
            you tick it is your finished image sent to us and kept for the campaign gallery. Your
            original photo is never stored — only the framed image.
          </Item>
          <Item>
            <strong>Location data is removed.</strong> Images made on your device carry no metadata
            at all. Anything sent to our server is re-encoded, which removes EXIF data including
            GPS coordinates and camera details.
          </Item>
          <Item>
            <strong>A stored image is not public by default.</strong> It can be seen by the
            campaign&apos;s organizers, by you through a private link that expires, and by everyone
            only if the organizers run a public gallery.
          </Item>
          <Item>
            <strong>You can delete it yourself.</strong> Every stored image comes with a private
            deletion link, shown once on your result screen. Open it and the image is gone
            immediately — no login, no support request.
          </Item>
          <Item>
            <strong>No tracking.</strong> The participant flow sets no cookies and does no
            fingerprinting. We count how many images were made and how many share buttons were
            tapped. Those counters have no idea who you are.
          </Item>
          <Item>
            <strong>Your IP address is not stored.</strong> It is used momentarily, in memory, to
            rate-limit the open link against abuse, and then it is gone.
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
            page, declared user group and capacity — nothing gathered behind your back. Your
            session is a random token; only a hash of it is kept.
          </Item>
          <Item>
            <strong>The gallery is yours until day {days}.</strong> Download the ZIP any time
            before then. After the deadline we delete our copies, including yours. Keeping your own
            archive — and honouring the same promise in it — is then up to you.
          </Item>
          <Item>
            <strong>Deleting a campaign is recoverable for {config.limits.softDeleteDays} days</strong>,
            then it and every image in it are permanently removed.
          </Item>
          <Item>
            <strong>Searching Wikimedia Commons</strong> from the editor shows thumbnails loaded
            from Wikimedia&apos;s own servers, under the{' '}
            <a
              href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy"
              className="font-bold text-wiki-blue hover:underline"
              target="_blank"
              rel="noreferrer noopener"
            >
              Wikimedia privacy policy
            </a>
            . Participants never load anything from a third party.
          </Item>
        </ul>
      </Section>

      <Section title="How the deletion actually happens">
        <p className="leading-relaxed text-wiki-slate">
          Each stored image carries an expiry timestamp of <em>event end date + {days} days</em>. A
          retention job deletes the file from storage, deletes the database row, and writes a line
          to the audit log. It runs inside the server itself, so it keeps running even if no
          external scheduler is configured, and it can also be triggered from cron. If a file
          cannot be deleted, its record is kept and the deletion is retried until it succeeds. The
          storage bucket can additionally carry a lifecycle rule for the same window, so even a
          failed job cannot quietly extend retention. Generated images should be excluded from
          long-term backups, because a promise to delete something is worthless if a backup keeps
          it alive.
        </p>
      </Section>

      <Section title="Questions or a takedown request">
        <p className="leading-relaxed text-wiki-slate">
          Open an issue on{' '}
          <a
            href="https://github.com/Zaidusyy/WikiFrames/issues"
            className="font-bold text-wiki-blue hover:underline"
            target="_blank"
            rel="noreferrer noopener"
          >
            the WikiFrames repository
          </a>
          , or contact the people running this instance. Security problems should be reported
          privately — see the security policy in the repository.
        </p>
      </Section>

      <p className="mt-12 border-t border-wiki-line pt-6 text-xs leading-relaxed text-wiki-slate">
        WikiFrames is free software (MIT licence), built for the Wikimedia community and not endorsed
        by or affiliated with the Wikimedia Foundation. <Link href="/licences" className="underline">Licences &amp; attribution</Link>
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
      <Icon name="cdxIconCheck" size="sm" className="mt-1 text-wiki-success" />
      <span>{children}</span>
    </li>
  );
}
