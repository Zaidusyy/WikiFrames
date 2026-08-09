import { handler } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';
import { campaignUrl, qrPng, qrSvg } from '@/lib/qr';
import { slugify } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

// LINK-4: PNG for slides and chat apps, SVG for print-quality venue posters.
export const GET = handler(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);

  const format = new URL(req.url).searchParams.get('format') === 'svg' ? 'svg' : 'png';
  const url = campaignUrl(campaign.slug, campaign.linkToken);
  const body = format === 'svg' ? await qrSvg(url) : await qrPng(url, 1024);
  const filename = `${slugify(campaign.name)}-qr.${format}`;

  return new Response(body, {
    headers: {
      'Content-Type': format === 'svg' ? 'image/svg+xml' : 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
