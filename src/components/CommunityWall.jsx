import Link from 'next/link';
import Icon from '@/components/Icon';

/**
 * §18.3 — "They build with us".
 *
 * Only opted-in (§7) and super-admin-approved (WALL-3) entries reach this
 * component; the page-level query is what enforces that, so nothing here needs
 * to re-check. The logo strip duplicates its items once so the marquee can loop
 * seamlessly at -50%.
 */
export default function CommunityWall({ groups = [], galleries = [] }) {
  const withLogos = groups.filter((g) => g.logoUrl);
  const strip = withLogos.length ? [...withLogos, ...withLogos] : [];

  return (
    <section id="community" className="py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="text-center font-serif text-3xl">They build with us</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-wiki-slate">
          User groups, affiliates and clubs already running campaigns on WikiFrames. The wall grows
          with every community that joins.
        </p>

        {strip.length > 0 ? (
          <div
            className="mt-10 overflow-hidden py-4"
            style={{
              maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
              WebkitMaskImage:
                'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
            }}
          >
            <ul className="flex w-max animate-marquee items-center gap-10">
              {strip.map((group, i) => (
                <li key={`${group.id}-${i}`}>
                  <a
                    href={group.userPageUrl || '#'}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex h-16 items-center opacity-70 transition-opacity hover:opacity-100"
                    // The duplicated half is decorative — do not announce it twice.
                    aria-hidden={i >= withLogos.length ? 'true' : undefined}
                    tabIndex={i >= withLogos.length ? -1 : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={group.logoUrl}
                      alt={group.userGroup || group.wikiUsername}
                      className="max-h-16 max-w-[160px] object-contain"
                      loading="lazy"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {groups.length > 0 ? (
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.slice(0, 12).map((group) => (
              <li key={group.id} className="wf-card flex items-center gap-3 p-4">
                <Icon name="cdxIconUserGroup" className="text-wiki-blue" />
                <p className="text-sm">
                  <a
                    href={group.userPageUrl || '#'}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-semibold text-wiki-blue hover:underline"
                  >
                    {group.userGroup || group.wikiUsername}
                  </a>{' '}
                  <span className="text-wiki-slate">has joined WikiFrames</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 rounded border border-dashed border-wiki-line px-6 py-10 text-center text-sm text-wiki-slate">
            The wall is waiting for its first entry. Log in, tell us your user group, and you could
            be the one that starts it.
          </p>
        )}

        {/* §18.2 §5 — rotating showcase of ended, public galleries (GAL-3). */}
        {galleries.length > 0 ? (
          <div className="mt-16">
            <h3 className="font-serif text-2xl">Recent public galleries</h3>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {galleries.map((gallery) => (
                <li key={gallery.id}>
                  <Link
                    href={`/gallery/${gallery.slug}`}
                    className="wf-card block p-5 transition-colors hover:border-wiki-blue"
                  >
                    <p className="font-bold">{gallery.name}</p>
                    <p className="mt-1 text-sm text-wiki-slate">
                      {gallery.organizingGroup || 'A Wikimedia community'}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-wiki-blue">
                      {gallery._count.images} images →
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
