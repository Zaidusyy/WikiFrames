import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { campaignUrl, qrDataUrl } from '@/lib/qr';
import { effectiveStatus } from '@/lib/campaigns';
import LinksPanel from '@/components/LinksPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Links & QR' };

export default async function LinksPage({ params }) {
  const { id } = await params;
  const user = await requireUser();

  let loaded;
  try {
    loaded = await loadCampaignFor(user, id);
  } catch {
    notFound();
  }

  const { campaign, access } = loaded;
  const url = campaignUrl(campaign.slug, campaign.linkToken);

  return (
    <LinksPanel
      campaign={{
        id: campaign.id,
        name: campaign.name,
        status: effectiveStatus(campaign),
        accessCode: campaign.accessCode,
        registrationOpenDate: campaign.registrationOpenDate.toISOString(),
      }}
      isOwner={access !== 'co_team'}
      initialUrl={url}
      // Rendered server-side so the panel shows a QR instantly, with no
      // round-trip and no client-side QR dependency in the bundle.
      initialQr={await qrDataUrl(url)}
    />
  );
}
