import { PrismaClient } from '@prisma/client';

// Next.js dev mode re-evaluates modules on every hot reload; without the global
// cache each reload would open a fresh pool and exhaust Postgres connections.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__wikiframesPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__wikiframesPrisma = prisma;
}

// PostgreSQL by default; MariaDB/MySQL on Toolforge (see scripts/prisma.mjs).
// Only the few queries whose syntax differs between the two need to know.
export const isMysql = /^(mysql|mariadb):/i.test(process.env.DATABASE_URL || '');

/** A Prisma JSON filter path to a top-level key, in the active dialect. */
export function jsonPath(key) {
  return isMysql ? `$.${key}` : [key];
}

// BigInt (wiki_user_id) is not JSON-serializable by default.
export function serializable(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}
