import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assetUrl } from '@/lib/storage';
import { formatDateRange } from '@/lib/format';
import { daysUntil } from '@/lib/campaigns';
import { config } from '@/lib/config';
import Icon from '@/components/Icon';

// GAL-3: public galleries live for the 30-day window, then the page gracefully
// falls back to event stats only. Revalidated rather than dynamic so a viral
// gallery does not hammer the database.
export const revalidate = 120;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const campaign = await prisma.campaign.findFirst({
    where: { slug, publicGallery: true, deletedAt: null },
    select: { name: true, description: true },
  });
  if (!campaign) return { title: 'Gallery' };
  return {
    title: `${campaign.name} — gallery`,
    description: campaign.description?.slice(0, 160),
  };
}

export default async function PublicGalleryPage({ params }) {
  const { slug } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { slug, publicGallery: true, deletedAt: null },
    include: { _count: { select: { images: true } } },
  });

  // A campaign that never opted in to a public gallery must not be discoverable
  // by guessing its slug.
  if (!campaign || campaign.status === 'draft' || campaign.status === 'cancelled') notFound();

  const images = await prisma.generatedImage.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: 'desc' },
    take: 120,
    select: {
      id: true,
      assetId: true,
      createdAt: true,
      role: { select: { label: true, icon: true } },
    },
  });

  const remaining = daysUntil(campaign.purgeAt);

  return (
    <main id="main" className="mx-auto max-w-6xl px-5 py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-wiki-blue hover:underline">
        <Icon name="cdxIconArrowPrevious" size="sm" /> WikiFrames
      </Link>

      <header className="mt-6">
        <h1 className="font-serif text-4xl">{campaign.name}</h1>
        <p className="mt-2 text-wiki-slate">
          {formatDateRange(campaign.eventDate, campaign.eventEndDate)}
          {campaign.organizingGroup ? ` · ${campaign.organizingGroup}` : ''}
        </p>
        {campaign.description ? (
          <p className="mt-4 max-w-2xl leading-relaxed text-wiki-slate">{campaign.description}</p>
        ) : null}
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Images shared" value={campaign._count.images} />
        <Stat
          label="Gallery closes in"
          value={remaining !== null ? `${remaining} days` : '—'}
          sub="Then images are permanently deleted"
        />
        <Stat label="Organized by" value={campaign.organizingGroup || 'A Wikimedia community'} />
      </div>

      {images.length === 0 ? (
        <div className="wf-card mt-10 p-12 text-center">
          <h2 className="font-serif text-2xl">The images have moved on</h2>
          <p className="mx-auto mt-3 max-w-lg leading-relaxed text-wiki-slate">
            This gallery kept its images for {config.retention.days} days after the event, and that window has closed —
            everything has been permanently deleted from our servers, exactly as promised to the
            people who created them. The event and its numbers remain here.
          </p>
          <Link href="/privacy" className="mt-6 inline-block text-sm font-semibold text-wiki-blue hover:underline">
            Read our data promises →
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((image) => (
              <li key={image.id} className="overflow-hidden rounded border border-wiki-line bg-white">
                {/* GAL-4: lazy-loaded thumbnails; originals are admin-only. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(image.assetId)}
                  alt={
                    image.role
                      ? `Participant image with the badge "I'm a ${image.role.label}"`
                      : 'Participant image from this campaign'
                  }
                  loading="lazy"
                  className="aspect-square w-full bg-wiki-paper object-contain"
                />
                {image.role ? (
                  <p className="truncate px-3 py-2 text-xs text-wiki-slate">
                    {image.role.icon} {image.role.label}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="mt-8 text-xs leading-relaxed text-wiki-slate">
            Every image here was created by a participant who explicitly agreed to it being shown.
            All of them are deleted permanently {config.retention.days} days after the event closes. Spotted something
            that should not be here?{' '}
            <a
              href="https://github.com/Zaidusyy/WikiFrames/issues"
              className="font-semibold text-wiki-blue hover:underline"
              target="_blank"
              rel="noreferrer noopener"
            >
              Report it
            </a>{' '}
            and we will take it down.
          </p>
        </>
      )}

      <div className="mt-12 rounded border border-wiki-line bg-wiki-blue-light p-6 text-center">
        <p className="font-serif text-xl">Running a Wikimedia event of your own?</p>
        <p className="mt-2 text-sm text-wiki-blue-dark">
          Build a campaign like this one in a few minutes.
        </p>
        <Link href="/" className="wf-btn-primary mt-4">
          See how WikiFrames works
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="wf-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-wiki-slate">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-wiki-slate">{sub}</p> : null}
    </div>
  );
}
