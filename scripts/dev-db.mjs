#!/usr/bin/env node
/**
 * A PostgreSQL for local development with nothing to install.
 *
 * PGlite is real PostgreSQL compiled to WebAssembly; pglite-socket puts it
 * behind a TCP socket speaking the genuine Postgres wire protocol. Prisma
 * therefore talks to it exactly as it would to a production database — enums,
 * JSONB, transactions and all — rather than a SQLite stand-in that would
 * quietly diverge from `prisma/schema.prisma`.
 *
 *   npm run dev:db
 *
 * `maxConnections` matters: it defaults to 1, and a single-connection server
 * goes deaf the moment the first client disconnects, which shows up as a
 * baffling "Can't reach database server" on the second command you run. PGlite
 * is a single-threaded engine, so the extra connections are serialised through
 * its query queue rather than run in parallel — that is fine for development,
 * where the point is that `db push`, `db:seed` and `next dev` can all connect.
 *
 * A development convenience, not a deployment target. For real concurrency run
 * a normal Postgres (`docker compose up -d`) and point DATABASE_URL at it.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', '.pgdata');
const port = Number(process.env.DEV_DB_PORT || 5433);
const host = '127.0.0.1';

const db = await PGlite.create({ dataDir });
await db.waitReady;

const server = new PGLiteSocketServer({
  db,
  port,
  host,
  maxConnections: Number(process.env.DEV_DB_MAX_CONNECTIONS || 20),
});
await server.start();

// `pgbouncer=true` turns off Prisma's named prepared statements. PGlite serves
// every connection from one engine session, so the second query to reuse a
// statement name dies with `prepared statement "s4" already exists` — the same
// failure Prisma hits behind a transaction-mode connection pooler, and the same
// fix. `connection_limit=1` keeps the single-threaded engine from being asked
// to interleave work it cannot interleave.
const url = `postgresql://postgres:postgres@${host}:${port}/postgres?sslmode=disable&connection_limit=1&pgbouncer=true`;

console.log('');
console.log('  PostgreSQL is up (PGlite).');
console.log(`  DATABASE_URL="${url}"`);
console.log(`  Data directory: ${dataDir}`);
console.log('');
console.log('  Leave this running. Press Ctrl+C to stop.');

const shutdown = async () => {
  console.log('\nStopping…');
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
