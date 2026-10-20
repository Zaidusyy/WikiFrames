import { config } from './config';
import { prisma } from './db';
import { destroyAsset } from './storage';
import { isFrameAssetInUse } from './templates';
import { LIFECYCLE, purgeDateFor } from './campaigns';

// RET-4 / SEC-6: the deletion promise, enforced in code and audited in the log.
// The S3 lifecycle rule is the safety net; this job is the primary mechanism so
// the metadata row disappears together with the bytes.

const BATCH = 500;
const MAX_BATCHES_PER_CYCLE = 40; // 20 000 images per run; the next run continues

export async function purgeExpiredImages(now = new Date()) {
  let deleted = 0;
  let failed = 0;
  let remaining = false;

  for (let batch = 0; batch < MAX_BATCHES_PER_CYCLE; batch += 1) {
    const expired = await prisma.generatedImage.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, assetId: true, campaignId: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
      take: BATCH,
    });
    if (!expired.length) break;

    for (const image of expired) {
      // Row first, then bytes: generated_images holds a foreign key to assets,
      // so deleting the asset first would be refused. If the bytes then fail
      // to delete, the asset row survives as an orphan and the sweep below
      // retries it — the image is already gone from every gallery either way.
      await prisma.generatedImage.delete({ where: { id: image.id } }).catch(() => {});
      const gone = await destroyAsset(image.assetId);
      if (gone) deleted += 1;
      else failed += 1;
      console.log(
        `[retention] purged image=${image.id} campaign=${image.campaignId} expired_at=${image.expiresAt.toISOString()}${gone ? '' : ' bytes_pending=true'}`
      );
    }
    remaining = expired.length === BATCH;
    if (!remaining) break;
  }
  return { deleted, failed, remaining };
}

/**
 * Participant-image assets that no gallery row points at any more: left behind
 * by a storage outage during a purge, or by a crash between storing the bytes
 * and recording the image. They are invisible everywhere, so they go.
 */
export async function sweepOrphanedImageAssets(now = new Date()) {
  // A grace period so an image being generated right now is never caught
  // between its asset row and its gallery row.
  const before = new Date(now.getTime() - 60 * 60 * 1000);
  const orphans = await prisma.asset.findMany({
    where: {
      createdAt: { lt: before },
      OR: [
        { kind: 'generated', generatedImages: { none: {} } },
        // Frames of templates that were deleted along with their campaign.
        { kind: 'frame', templateFrames: { none: {} } },
      ],
    },
    select: { id: true, kind: true },
    take: 1000,
  });
  let swept = 0;
  let kept = 0;
  for (const orphan of orphans) {
    // A finished frame's original artwork is referenced from template JSON,
    // not by foreign key — it is not an orphan while a template edits on it.
    if (orphan.kind === 'frame' && (await isFrameAssetInUse(orphan.id))) {
      kept += 1;
      continue;
    }
    if (await destroyAsset(orphan.id)) swept += 1;
  }
  if (orphans.length) console.log(`[retention] swept ${swept}/${orphans.length - kept} orphaned assets`);
  return { swept, pending: orphans.length - kept - swept };
}

/** DASH-3: soft-deleted campaigns become unrecoverable after the grace window. */
export async function purgeSoftDeletedCampaigns(now = new Date()) {
  const cutoff = new Date(now.getTime() - config.limits.softDeleteDays * 24 * 60 * 60 * 1000);
  const campaigns = await prisma.campaign.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, images: { select: { assetId: true } } },
    take: 200,
  });

  for (const campaign of campaigns) {
    // Cascades remove roles, captions, templates, images and analytics rows.
    // Must happen before the assets, which those rows still reference.
    await prisma.campaign.delete({ where: { id: campaign.id } }).catch(() => {});
    for (const image of campaign.images) await destroyAsset(image.assetId);
    console.log(`[retention] hard-deleted campaign=${campaign.id}`);
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
  const orphans = await sweepOrphanedImageAssets(now);
  const campaigns = await purgeSoftDeletedCampaigns(now);
  const sessions = await expireStaleSessions(now);
  const summary = {
    ranAt: now.toISOString(),
    durationMs: Date.now() - started,
    retentionDays: config.retention.days,
    ...closed,
    imagesPurged: images.deleted,
    imageBytesPendingDeletion: images.failed + orphans.pending,
    moreImagesPending: images.remaining,
    orphanedAssetsSwept: orphans.swept,
    campaignsHardDeleted: campaigns.campaigns,
    sessionsExpired: sessions.sessions,
  };
  console.log('[retention] cycle complete', JSON.stringify(summary));
  return summary;
}

/**
 * The in-process safety net. Started once per server process from
 * src/instrumentation.js; harmless next to an external cron, because every
 * step above is idempotent.
 */
export function startRetentionScheduler() {
  if (!config.retention.schedulerEnabled || globalThis.__wikiframesRetentionTimer) return;
  const intervalMs = config.retention.schedulerIntervalMinutes * 60 * 1000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runRetentionCycle();
    } catch (err) {
      // A failed purge is a broken privacy promise — make it loud.
      console.error('[retention] scheduled cycle FAILED', err);
    } finally {
      running = false;
    }
  };

  // First run shortly after boot, so a server that restarts daily still purges.
  const first = setTimeout(tick, 60 * 1000);
  const timer = setInterval(tick, intervalMs);
  first.unref?.();
  timer.unref?.();
  globalThis.__wikiframesRetentionTimer = timer;
  console.log(`[retention] scheduler on: every ${config.retention.schedulerIntervalMinutes} min`);
}

export { purgeDateFor };
