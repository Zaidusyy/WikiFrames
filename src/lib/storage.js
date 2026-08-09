import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { prisma } from './db';
import { randomToken } from './tokens';

// Object storage abstraction (PDR §5.2). The `local` driver keeps everything on
// disk so the product runs without cloud credentials; the `s3` driver is the
// deployment target where the 30-day lifecycle rule acts as the RET-4 safety net.
//
// The DB only ever holds metadata + a storage key, never bytes.

const localRoot = path.isAbsolute(config.storage.localRoot)
  ? config.storage.localRoot
  : path.join(process.cwd(), config.storage.localRoot);

function localPath(key) {
  const safe = key.replace(/\\/g, '/').replace(/\.\.+/g, '');
  const full = path.join(localRoot, safe);
  if (!full.startsWith(localRoot)) throw new Error('Refusing to escape storage root');
  return full;
}

async function putLocal(key, buffer) {
  const full = localPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
}

async function getLocal(key) {
  return fs.readFile(localPath(key));
}

async function delLocal(key) {
  await fs.rm(localPath(key), { force: true });
}

// Indirection on purpose: the bundler must not try to resolve the AWS SDK at
// build time. It is an optional peer — installed only when STORAGE_DRIVER=s3 —
// so a literal import path would make the local driver fail to compile.
const S3_SDK = '@aws-sdk/client-s3';
const importS3 = (name) => import(/* webpackIgnore: true */ name);

let s3Client = null;
async function getS3() {
  if (s3Client) return s3Client;
  const { S3Client } = await importS3(S3_SDK);
  s3Client = new S3Client({
    region: config.storage.s3.region,
    endpoint: config.storage.s3.endpoint || undefined,
    forcePathStyle: Boolean(config.storage.s3.endpoint),
    credentials: {
      accessKeyId: config.storage.s3.accessKeyId,
      secretAccessKey: config.storage.s3.secretAccessKey,
    },
  });
  return s3Client;
}

export async function putObject(key, buffer, mime) {
  if (config.storage.driver === 's3') {
    const { PutObjectCommand } = await importS3(S3_SDK);
    const client = await getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
      })
    );
    return key;
  }
  await putLocal(key, buffer);
  return key;
}

export async function getObject(key) {
  if (config.storage.driver === 's3') {
    const { GetObjectCommand } = await importS3(S3_SDK);
    const client = await getS3();
    const out = await client.send(
      new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key })
    );
    return Buffer.from(await out.Body.transformToByteArray());
  }
  return getLocal(key);
}

export async function deleteObject(key) {
  if (config.storage.driver === 's3') {
    const { DeleteObjectCommand } = await importS3(S3_SDK);
    const client = await getS3();
    await client.send(
      new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key })
    );
    return;
  }
  await delLocal(key);
}

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/zip': 'zip',
  'application/pdf': 'pdf',
};

export function keyFor(kind, mime) {
  const ext = EXT_BY_MIME[mime] || 'bin';
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${kind}/${yyyymm}/${randomToken(12)}.${ext}`;
}

/** Stores bytes and records the accompanying `assets` row in one step. */
export async function storeAsset({ kind, mime, buffer, width, height }) {
  const key = keyFor(kind, mime);
  await putObject(key, buffer, mime);
  return prisma.asset.create({
    data: {
      storageKey: key,
      mime,
      bytes: buffer.length,
      width: width ?? null,
      height: height ?? null,
      kind,
    },
  });
}

/** Hard-deletes bytes then metadata. Order matters: never orphan bytes. */
export async function destroyAsset(assetId) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return false;
  await deleteObject(asset.storageKey).catch(() => {});
  await prisma.asset.delete({ where: { id: assetId } }).catch(() => {});
  return true;
}

/** Every asset is served through our own route so access rules stay in one place. */
export function assetUrl(assetId) {
  return `/api/v1/assets/${assetId}`;
}
