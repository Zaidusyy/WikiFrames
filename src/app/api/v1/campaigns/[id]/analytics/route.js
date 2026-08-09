import { prisma } from '@/lib/db';
import { handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { loadCampaignFor } from '@/lib/authz';

export const dynamic = 'force-dynamic';

// §17.2: aggregate counters only. No cookies, no fingerprinting, no per-person
// rows — the analytics_events table holds a campaign id, a kind and a small
// JSON blob, and nothing that could identify a participant.
export const GET = handler(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { campaign } = await loadCampaignFor(user, id);

  const [byKind, images, imagesByTemplate, imagesByRole, shareEvents, templates, roles] =
    await Promise.all([
      prisma.analyticsEvent.groupBy({
        by: ['kind'],
        where: { campaignId: campaign.id },
        _count: { _all: true },
      }),
      prisma.generatedImage.count({ where: { campaignId: campaign.id } }),
      prisma.generatedImage.groupBy({
        by: ['templateId'],
        where: { campaignId: campaign.id },
        _count: { _all: true },
      }),
      prisma.generatedImage.groupBy({
        by: ['roleId'],
        where: { campaignId: campaign.id },
        _count: { _all: true },
      }),
      prisma.analyticsEvent.findMany({
        where: { campaignId: campaign.id, kind: 'share_tap' },
        select: { meta: true },
        take: 5000,
      }),
      prisma.template.findMany({
        where: { campaignId: campaign.id },
        select: { id: true, name: true },
      }),
      prisma.campaignRole.findMany({
        where: { campaignId: campaign.id },
        select: { id: true, label: true },
      }),
    ]);

  const counts = Object.fromEntries(byKind.map((row) => [row.kind, row._count._all]));
  const templateNames = new Map(templates.map((t) => [t.id, t.name]));
  const roleNames = new Map(roles.map((r) => [r.id, r.label]));

  const sharesByPlatform = {};
  for (const event of shareEvents) {
    const platform = event.meta?.platform || 'other';
    sharesByPlatform[platform] = (sharesByPlatform[platform] || 0) + 1;
  }

  const linkOpens = counts.link_open || 0;
  const qrScans = counts.qr_scan || 0;

  // Consent rate: how many people who generated an image also allowed us to
  // keep it. `generate` fires for every render, stored or not (RET-2).
  const generateEvents = counts.generate || 0;

  return ok({
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
    totals: {
      linkOpens,
      qrScans,
      directOpens: Math.max(0, linkOpens - qrScans),
      qrShare: linkOpens ? Math.round((qrScans / linkOpens) * 100) : 0,
      generated: generateEvents,
      stored: images,
      consentRate: generateEvents ? Math.round((images / generateEvents) * 100) : 0,
      downloads: counts.download || 0,
      shareTaps: counts.share_tap || 0,
    },
    byTemplate: imagesByTemplate.map((row) => ({
      template: templateNames.get(row.templateId) || 'Removed template',
      count: row._count._all,
    })),
    byRole: imagesByRole.map((row) => ({
      role: row.roleId ? roleNames.get(row.roleId) || 'Removed role' : 'No role chosen',
      count: row._count._all,
    })),
    sharesByPlatform,
  });
});
