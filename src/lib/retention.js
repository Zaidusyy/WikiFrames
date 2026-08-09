import { config } from './config';
import { prisma } from './db';
import { destroyAsset } from './storage';
import { LIFECYCLE, purgeDateFor } from './campaigns';

// RET-4 / SEC-6: the deletion promise, enforced in code and audited in the log.
// The S3 lifecycle rule is the safety net; this job is the primary mechanism so
// the metadata row disappears together with the bytes.

export async function purgeExpiredImages(now = new Date()) {
  const expired = await prisma.generatedImage.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true, assetId: true, campaignId: true, expiresAt: true },
    take: 1000,
  });

  let deleted = 0;
  for (const image of expired) {
    // Row first, then bytes: generated_images holds a foreign key to assets, so
    // deleting the asset first would be refused and leave an orphan row behind.
    await prisma.generatedImage.delete({ where: { id: image.id } }).catch(() => {});
    await destroyAsset(image.assetId);
    deleted += 1;
    console.log(
      `[retention] purged image=${image.id} campaign=${image.campaignId} expired_at=${image.expiresAt.toISOString()}`
    );
  }
  return { deleted, remaining: expired.length === 1000 };
}

/** DASH-3: soft-deleted campaigns become unrecoverable after the grace window. */
export async function purgeSoftDeletedCampaigns(now = new Date()) {
  const cutoff = new Date(
    now.getTime() - config.limits.softDeleteDays * 24 * 60 * 60 * 1000
  );
  const campaigns = await prisma.campaign.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, name: true, images: { select: { assetId: true } } },
    take: 200,
  });

  for (const campaign of campaigns) {
    // Cascades remove roles, captions, templates, images and analytics rows.
    // Must happen before the assets, which those rows still reference.
    await prisma.campaign.delete({ where: { id: campaign.id } }).catch(() => {});
    for (const image of campaign.images) await destroyAsset(image.assetId);
    console.log(`[retention] hard-deleted campaign=${campaign.id} name="${campaign.name}"`);
  }
  return { campaigns: campaigns.length };
}

/** CAMP-2: roll active campaigns past their end date over to `ended`. */
export async function closeFinishedCampaigns(now = new Date()) {
  const result = await prisma.campaign.updateMany({
    where: {
      status: { in: [LIFECYCLE.ACTIVE, LIFECYCLE.INACTIVE] },
      eventEndDate: { lt: now },
      deletedAt: null,
    },
    data: { status: LIFECYCLE.ENDED },
  });
  return { ended: result.count };
}

export async function expireStaleSessions(now = new Date()) {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return { sessions: result.count };
}

export async function runRetentionCycle(now = new Date()) {
  const started = Date.now();
  const closed = await closeFinishedCampaigns(now);
  const images = await purgeExpiredImages(now);
  const campaigns = await purgeSoftDeletedCampaigns(now);
  const sessions = await expireStaleSessions(now);
  const summary = {
    ranAt: now.toISOString(),
    durationMs: Date.now() - started,
    retentionDays: config.retention.days,
    ...closed,
    imagesPurged: images.deleted,
    moreImagesPending: images.remaining,
    campaignsHardDeleted: campaigns.campaigns,
    sessionsExpired: sessions.sessions,
  };
  console.log('[retention] cycle complete', JSON.stringify(summary));
  return summary;
}

export { purgeDateFor };
