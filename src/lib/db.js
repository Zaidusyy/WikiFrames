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

// BigInt (wiki_user_id) is not JSON-serializable by default.
export function serializable(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}
