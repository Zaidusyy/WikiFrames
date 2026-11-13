#!/usr/bin/env node
// Starts WikiFrames as a Toolforge web service (see Procfile and README).
//
// Toolforge hands a tool its database credentials, its NFS data directory
// and a port; this fills in the matching WikiFrames settings, prepares the
// ToolsDB database, then runs `next start`. Anything already set with
// `toolforge envvars create …` wins over the defaults chosen here.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaFor } from './prisma.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };

function fail(message) {
  console.error(`[toolforge] ${message}`);
  process.exit(1);
}

function setDefault(name, value) {
  if (!env[name] && value !== undefined) env[name] = value;
}

setDefault('NODE_ENV', 'production');
setDefault('NEXT_TELEMETRY_DISABLED', '1');
setDefault('CHECKPOINT_DISABLE', '1');
setDefault('PORT', '8000');
// The front proxy hides visitor addresses and throttles each one itself.
setDefault('CLIENT_IP_HIDDEN', 'true');

// ── database: ToolsDB ───────────────────────────────────────────────────────
// Database names on ToolsDB must start with the tool's credential user.
let databaseName = null;
if (!env.DATABASE_URL) {
  const user = env.TOOL_TOOLSDB_USER;
  const password = env.TOOL_TOOLSDB_PASSWORD;
  if (!user || !password) fail('No DATABASE_URL, and no ToolsDB credentials (TOOL_TOOLSDB_USER) to build one from.');
  databaseName = env.TOOLSDB_DATABASE || `${user}__wikiframes`;
  if (!/^[A-Za-z0-9_$]+$/.test(databaseName)) fail(`Unusable database name "${databaseName}".`);
  const host = env.TOOLSDB_HOST || 'tools.db.svc.wikimedia.cloud';
  const port = env.TOOLSDB_PORT || '3306';
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  // ToolsDB allows each tool a handful of connections; leave room for jobs.
  env.DATABASE_URL = `mysql://${auth}@${host}:${port}/${databaseName}?connection_limit=5`;
}

// ── storage: the tool's NFS directory ───────────────────────────────────────
// Frames and gallery images must outlive a restart, so the container's own
// filesystem will not do. Start the web service with --mount=all.
if ((env.STORAGE_DRIVER || 'local') === 'local' && !env.STORAGE_LOCAL_ROOT) {
  if (!env.TOOL_DATA_DIR) fail('No TOOL_DATA_DIR: start the web service with --mount=all, or set STORAGE_LOCAL_ROOT.');
  env.STORAGE_LOCAL_ROOT = path.join(env.TOOL_DATA_DIR, 'wikiframes-storage');
}
if (env.STORAGE_LOCAL_ROOT) {
  fs.mkdirSync(env.STORAGE_LOCAL_ROOT, { recursive: true, mode: 0o700 });
  // NFS files are world-readable by default on Toolforge; gallery images are not.
  fs.chmodSync(env.STORAGE_LOCAL_ROOT, 0o700);
}

// ── fonts for server-rendered badges ────────────────────────────────────────
// The fonts listed in project.toml are installed under /layers, which no
// fontconfig looks at by default (sharp bundles its own). Point it there.
const debFonts = '/layers/heroku_deb-packages/packages/usr/share/fonts';
if (!env.FONTCONFIG_FILE && fs.existsSync(debFonts)) {
  const conf = path.join(os.tmpdir(), 'wikiframes-fonts.conf');
  fs.writeFileSync(
    conf,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n` +
      `  <dir>${debFonts}</dir>\n  <dir>/usr/share/fonts</dir>\n` +
      `  <cachedir>${path.join(os.tmpdir(), 'fontconfig')}</cachedir>\n</fontconfig>\n`
  );
  env.FONTCONFIG_FILE = conf;
}

function run(label, command, args, options = {}) {
  console.log(`[toolforge] ${label}`);
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${label} failed.`);
}

const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');

// A tool can reach only its own databases, so it cannot create one: that is a
// one-time `sql tools` step (README, "Deploying on Toolforge"). Binary
// collation keeps text comparisons case-sensitive, as on PostgreSQL — link
// tokens and usernames must not match a differently-cased value — and it
// applies to every table created from here on.
if (databaseName) {
  console.log('[toolforge] preparing the database');
  const result = spawnSync(process.execPath, [prismaCli, 'db', 'execute', '--stdin', '--url', env.DATABASE_URL], {
    cwd: root,
    env,
    input: `ALTER DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;\n`,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`.trim();
    if (/Unknown database|does not exist|P1003/i.test(output)) {
      fail(
        `The database ${databaseName} does not exist yet. Create it once, as the tool:\n` +
          `  sql tools\n  CREATE DATABASE ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
      );
    }
    fail(`preparing the database failed:\n${output}`);
  }
  await createTablesCaseSensitive();
}

// Never --accept-data-loss: a schema change that would drop data stops here.
run('applying the schema', process.execPath, [path.join(root, 'scripts', 'prisma.mjs'), 'db', 'push', '--skip-generate']);
run('loading the starter templates', process.execPath, [path.join(root, 'prisma', 'seed.js')]);

/**
 * Prisma creates MySQL tables as utf8mb4_unicode_ci whatever the database
 * default, and MariaDB cannot change the collation of a column a foreign key
 * points at afterwards. So on an empty database the tables are created here,
 * from Prisma's own DDL with the collation made binary; `db push` then finds
 * them in sync and only ever adds to them.
 */
async function createTablesCaseSensitive() {
  const { PrismaClient } = createRequire(import.meta.url)('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  let count;
  try {
    const [row] = await db.$queryRaw`
      SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
    count = Number(row.n);
  } finally {
    await db.$disconnect();
  }
  if (count > 0) return;

  console.log('[toolforge] creating the tables');
  const diff = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaFor('mysql'), '--script'],
    { cwd: root, env, encoding: 'utf8' }
  );
  if (diff.status !== 0) fail(`could not produce the table definitions:\n${diff.stderr}`);
  const ddl = diff.stdout.replace(/utf8mb4_unicode_ci/g, 'utf8mb4_bin');
  const created = spawnSync(process.execPath, [prismaCli, 'db', 'execute', '--stdin', '--url', env.DATABASE_URL], {
    cwd: root,
    env,
    input: ddl,
    encoding: 'utf8',
  });
  if (created.status !== 0) fail(`creating the tables failed:\n${created.stdout}${created.stderr}`);
}

console.log(`[toolforge] starting on port ${env.PORT}`);
const server = spawn(
  process.execPath,
  [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', env.PORT, '-H', '0.0.0.0'],
  { cwd: root, env, stdio: 'inherit' }
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
