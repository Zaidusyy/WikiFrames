// Runs once when a Next.js server process starts (not per request).
//
// Two jobs: refuse to boot a production instance that is misconfigured, and
// start the retention safety net so stored images are purged on schedule even
// where nobody remembered to install the cron job.
//
// The Node-only work lives in instrumentation-node.js behind a NEXT_RUNTIME
// check, the pattern Next.js documents: the condition is replaced at build
// time, so the edge bundle never sees Node built-ins.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
