import { prisma } from './db';

/**
 * Whether any template still needs a frame asset — as its current frame, or
 * as the original artwork a finished frame is edited on top of
 * (`canvasJson.baseFrameAssetId`). Frame bytes are shared by reference between
 * clones, so this is the one check every deletion path must make.
 */
export async function isFrameAssetInUse(assetId) {
  if (!assetId) return false;
  const [asFrame, asBase] = await Promise.all([
    prisma.template.count({ where: { frameAssetId: assetId } }),
    prisma.template.count({ where: { canvasJson: { path: ['baseFrameAssetId'], equals: assetId } } }),
  ]);
  return asFrame + asBase > 0;
}
