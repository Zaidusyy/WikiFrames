import Link from 'next/link';
import { prisma } from '@/lib/db';
import { config } from '@/lib/config';
import { assetUrl } from '@/lib/storage';
import LandingHeader from '@/components/LandingHeader';
import CommunityWall from '@/components/CommunityWall';
import FrameDemo from '@/components/FrameDemo';

// §5.3 / §18: statically generated with incremental revalidation — fast, SEO
// friendly, and the community wall refreshes without a redeploy.
export const revalidate = 300;

async function loadWall() {
  try {
    const [groups, galleries] = await Promise.all([
      // WALL-1/WALL-3: opted in AND approved. Nothing else is ever shown.
      prisma.user.findMany({
        where: { wallOptIn: true, wallStatus: 'approved' },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          wikiUsername: true,
          userGroup: true,
          userPageUrl: true,
          logoAssetId: true,
          createdAt: true,
        },
      }),
      // GAL-3: only ended campaigns whose organizer chose to go public.
      prisma.campaign.findMany({
        where: { publicGallery: true, status: 'ended', deletedAt: null },
        orderBy: { eventEndDate: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          slug: true,
          organizingGroup: true,
          eventEndDate: true,
          _count: { select: { images: true } },
        },
      }),
    ]);

    return {
      groups: groups.map((g) => ({
        ...g,
        logoUrl: g.logoAssetId ? assetUrl(g.logoAssetId) : null,
      })),
      galleries: galleries.filter((g) => g._count.images > 0),
    };
  } catch {
    // The landing page is the front door — it renders even if the database is
    // unreachable at build time.
    return { groups: [], galleries: [] };
  }
}

export default async function LandingPage() {
  // Deliberately no session read here: touching cookies would opt this page out
  // of static generation, and the landing page's whole job is to be fast and
  // indexable (§5.3). The header resolves the session on the client instead.
  const { groups, galleries } = await loadWall();

  return (
    <>
      <LandingHeader />

      <main id="main">
        {/* ── Hero (§18.2 §1) ───────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-wiki-line bg-gradient-to-b from-wiki-blue-light to-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-2 md:items-center md:py-24">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-wiki-blue ring-1 ring-wiki-blue/30">
                Built for the Wikimedia community
              </p>
              <h1 className="font-serif text-4xl leading-tight text-wiki-ink md:text-5xl">
                Every event is a story.
                <br />
                Every attendee is a storyteller.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-wiki-slate">
                WikiFrames turns your community&apos;s moments into beautiful, shareable
                celebrations of free knowledge. Create a campaign, share one link or QR code, and
                every attendee walks away with a personalised image — in under a minute.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/api/v1/auth/wikimedia" className="wf-btn-primary px-6 py-3 text-base">
                  Log in with Wikimedia
                </Link>
                <a href="#how-it-works" className="wf-btn-secondary px-6 py-3 text-base">
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-xs text-wiki-slate">
                No new password. You sign in with the wiki account you already have.
              </p>
            </div>

            <FrameDemo />
          </div>
        </section>

        {/* ── How it works (§18.2 §2) ───────────────────────────────────── */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <h2 className="text-center font-serif text-3xl">How it works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-wiki-slate">
            Three steps for the organizer. One tap for everyone else.
          </p>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: '🎨',
                title: 'Create a campaign',
                body: 'Pick an event template or design your own frame in the canvas editor. Add roles, captions and hashtags. No design skills needed.',
              },
              {
                icon: '🔗',
                title: 'Share the QR',
                body: 'Every campaign gets a secure link and a print-quality QR code. Put it on the poster, in the group chat, on the registration desk.',
              },
              {
                icon: '🚀',
                title: 'Watch it spread',
                body: 'Attendees add a photo, pick their badge, and share to social media with your caption already written. You get a gallery and the numbers.',
              },
            ].map((step, i) => (
              <li key={step.title} className="wf-card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span aria-hidden="true" className="text-3xl">
                    {step.icon}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-wiki-blue text-sm font-bold text-white">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-wiki-slate">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Features (§18.2 §3) ──────────────────────────────────────── */}
        <section className="border-y border-wiki-line bg-wiki-paper py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center font-serif text-3xl">Everything an organizer needs</h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['🖌️', 'Canvas editor', 'Drag, nudge with arrow keys, add text and artwork. Movable photo cutouts in circle or square. Undo whenever you need it.'],
                ['🧩', 'Event templates', 'Wikipedia Day, Wiki Loves Monuments, edit-a-thons, WikiClub meetups — start from a themed draft and edit it down.'],
                ['📐', 'Every ratio', 'Stories at 9:16, feed posts at 4:5, squares at 1:1, landscape at 16:9. One campaign can offer all of them.'],
                ['🏅', 'Personal badges', '“I’m a Heritage Documenter.” Participants pick a role and it lands on the image and in the caption.'],
                ['📲', 'One-tap sharing', 'The image and the caption travel together into WhatsApp, Instagram, X or wherever they post.'],
                ['🔒', '30-day promise', 'Stored only with consent, deleted permanently 30 days after the event. Say no and nothing is saved at all.'],
              ].map(([icon, title, body]) => (
                <div key={title} className="wf-card p-6">
                  <span aria-hidden="true" className="text-2xl">
                    {icon}
                  </span>
                  <h3 className="mt-3 text-base font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-wiki-slate">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Community wall (§18.3) ───────────────────────────────────── */}
        <CommunityWall groups={groups} galleries={galleries} />

        {/* ── Privacy promise (§18.2 §6 / §16.1) ───────────────────────── */}
        <section id="privacy" className="border-t border-wiki-line bg-wiki-paper py-16">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="font-serif text-3xl">Our promise about your photo</h2>
            <blockquote className="mt-6 border-l-4 border-wiki-blue bg-white p-6 text-base leading-relaxed text-wiki-ink shadow-card">
              <strong>How we handle your image:</strong> If you allow it, your generated image is
              stored so the event organizers can showcase it in the campaign gallery.{' '}
              <strong>
                All stored images are kept for a maximum of 30 days after the event closes, then
                permanently deleted from our servers.
              </strong>{' '}
              If you don&apos;t allow storage, your image is generated one-time for you to download
              and share — and nothing is saved on our side; it vanishes after your session.
            </blockquote>
            <ul className="mt-6 space-y-2 text-sm text-wiki-slate">
              <li>• Participants never create an account and are never asked for personal details.</li>
              <li>• No cookies and no fingerprinting in the participant flow — only aggregate counters.</li>
              <li>• Every stored image comes with a private link that deletes it on the spot.</li>
              <li>• Generated images are excluded from long-term backups, so the deletion is real.</li>
            </ul>
            <Link href="/privacy" className="mt-6 inline-block text-sm font-semibold text-wiki-blue underline">
              Read the full data promises →
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-wiki-line bg-white py-12">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="font-serif text-xl font-bold">WikiFrames</p>
          <p className="mt-2 text-sm text-wiki-slate">
            Campaign frames and banners for the Wikimedia ecosystem.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            ['How it works', '/#how-it-works'],
            ['Privacy promise', '/privacy'],
            ['Community wall', '/#community'],
          ]}
        />
        <FooterColumn
          title="Open source"
          links={[
            ['Source repository', 'https://github.com/Zaidusyy/WikiFrames'],
            ['Report an issue', 'https://github.com/Zaidusyy/WikiFrames/issues'],
            ['Licences & attribution', '/licences'],
          ]}
        />
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-wiki-slate">Contact</h3>
          <p className="mt-3 text-sm text-wiki-slate">
            Questions, ideas or a campaign you want help with? Open an issue on the repository —
            we read every one.
          </p>
        </div>
      </div>

      {/* §23.1: the independence disclaimer, stated plainly and visibly. */}
      <div className="mx-auto mt-10 max-w-6xl border-t border-wiki-line px-5 pt-6">
        <p className="text-xs leading-relaxed text-wiki-slate">
          WikiFrames is an independent tool built for the Wikimedia community. It is not endorsed
          by or affiliated with the Wikimedia Foundation. The Wikimedia puzzle globe, wordmarks and
          sister-project logos are trademarks of the Wikimedia Foundation and are not used here —
          all default templates and artwork shipped with WikiFrames are original and openly
          licensed.
        </p>
        <p className="mt-3 text-xs text-wiki-slate">
          Served from {config.baseUrl.replace(/^https?:\/\//, '')}
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-wiki-slate">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-wiki-blue hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
