/**
 * Minimal `.env` reader for the standalone scripts.
 *
 * Next.js loads `.env` for the app, but `node prisma/seed.js` and
 * `node scripts/purge.js` run outside it and would otherwise start with no
 * DATABASE_URL. Deliberately dependency-free — this is not worth a package.
 *
 * Real environment variables always win over the file.
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = function loadEnv(file = '.env') {
  const envPath = path.isAbsolute(file) ? file : path.join(__dirname, '..', file);
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/s, '$2');
  }
};
