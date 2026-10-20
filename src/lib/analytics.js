import { prisma } from './db';

/**
 * Every aggregate the analytics screens show, computed inside the database.
 * Shared by this route and the dashboard page so the two cannot disagree.
 */
export async function campaignAnalytics(campaignId) {
  const [byKind, images, imagesByTemplate, imagesByRole, sharesByPlatform, templates, roles] =
    await Promise.all([
      prisma.analyticsEvent.groupBy({
        by: ['kind'],
        where: { campaignId },
        _count: { _all: true },
      }),
      prisma.generatedImage.count({ where: { campaignId } }),
      prisma.generatedImage.groupBy({
        by: ['templateId'],
        where: { campaignId },
        _count: { _all: true },
      }),
      prisma.generatedImage.groupBy({
        by: ['roleId'],
        where: { campaignId },
        _count: { _all: true },
      }),
      // Grouped in SQL — the old approach read at most 5 000 rows into memory
      // and silently under-counted anything beyond that.
      prisma.analyticsEvent.groupBy({
        by: ['platform'],
        where: { campaignId, kind: 'share_tap' },
        _count: { _all: true },
      }),
      prisma.template.findMany({ where: { campaignId }, select: { id: true, name: true } }),
      prisma.campaignRole.findMany({ where: { campaignId }, select: { id: true, label: true } }),
    ]);

  const counts = Object.fromEntries(byKind.map((row) => [row.kind, row._count._all]));
  const templateNames = new Map(templates.map((t) => [t.id, t.name]));
  const roleNames = new Map(roles.map((r) => [r.id, r.label]));

  const linkOpens = counts.link_open || 0;
  const qrScans = counts.qr_scan || 0;
  // `generate` fires for every image — rendered on the device or on the
  // server, stored or not — so it is the denominator of the consent rate.
  const generated = counts.generate || 0;
  const shareTaps = counts.share_tap || 0;

  return {
    totals: {
      linkOpens,
      qrScans,
      directOpens: Math.max(0, linkOpens - qrScans),
      qrShare: linkOpens ? Math.round((qrScans / linkOpens) * 100) : 0,
      generated,
      stored: images,
      consentRate: generated ? Math.round((images / generated) * 100) : 0,
      downloads: counts.download || 0,
      shareTaps,
      shareRate: generated ? Math.round((shareTaps / generated) * 100) : 0,
    },
    byTemplate: imagesByTemplate.map((row) => ({
      label: templateNames.get(row.templateId) || 'Removed template',
      count: row._count._all,
    })),
    byRole: imagesByRole.map((row) => ({
      label: row.roleId ? roleNames.get(row.roleId) || 'Removed role' : 'No badge chosen',
      count: row._count._all,
    })),
    sharesByPlatform: sharesByPlatform.map((row) => ({
      label: row.platform || 'other',
      count: row._count._all,
    })),
  };
}
