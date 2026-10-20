import Link from 'next/link';
import { notFound } from 'next/navigation';
import { participantPayload, resolveCampaignByLink } from '@/lib/participant';
import { serializable } from '@/lib/db';
import { formatDateRange } from '@/lib/format';
import ParticipantFlow from '@/components/ParticipantFlow';
import Icon from '@/components/Icon';

// AUTH-4: no login, no cookie. The token in the URL is the whole credential, so
// this page must never be cached or statically rendered.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { segment } = await params;
  try {
    const campaign = await resolveCampaignByLink(segment);
    return {
      title: campaign.name,
      description: campaign.description?.slice(0, 160),
      // A campaign link is a semi-secret; keep it out of search results.
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: 'Campaign', robots: { index: false, follow: false } };
  }
}

export default async function ParticipantPage({ params }) {
  const { segment } = await params;

  let campaign;
  try {
    campaign = await resolveCampaignByLink(segment);
  } catch {
    notFound();
  }

  const payload = participantPayload(campaign);

  // LINK-3: anything other than a live campaign gets a friendly explanation
  // rather than the photo flow.
  if (payload.state !== 'active') {
    return (
      <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
        <div className="wf-card p-8 text-center">
          <Icon
            name={payload.state === 'ended' ? 'cdxIconStar' : payload.state === 'inactive' ? 'cdxIconPause' : 'cdxIconCalendar'}
            size="xl"
            className="mx-auto text-wiki-blue"
          />
          <h1 className="mt-4 font-serif text-2xl">{payload.stateCopy?.title}</h1>
          <p className="mt-3 leading-relaxed text-wiki-slate">{payload.stateCopy?.body}</p>

          <div className="mt-6 rounded-lg bg-wiki-paper p-4 text-left text-sm">
            <p className="font-bold">{payload.campaign.name}</p>
            <p className="mt-1 text-wiki-slate">
              {formatDateRange(payload.campaign.eventDate, payload.campaign.eventEndDate)}
            </p>
            {payload.campaign.organizingGroup ? (
              <p className="text-wiki-slate">by {payload.campaign.organizingGroup}</p>
            ) : null}
          </div>

          {payload.state === 'ended' && payload.campaign.publicGallery ? (
            <Link href={`/gallery/${payload.campaign.slug}`} className="wf-btn-primary mt-6">
              See the campaign gallery
            </Link>
          ) : null}

          <Link href="/" className="mt-4 block text-sm font-semibold text-wiki-blue hover:underline">
            What is WikiFrames?
          </Link>
        </div>
      </main>
    );
  }

  return <ParticipantFlow segment={segment} payload={serializable(payload)} />;
}
