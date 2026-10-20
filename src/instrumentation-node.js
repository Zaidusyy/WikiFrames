import { assertProductionConfig } from './lib/config';
import { startRetentionScheduler } from './lib/retention';

// `next build` evaluates instrumentation too; only a running server should
// check its configuration or start timers.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  assertProductionConfig();
  startRetentionScheduler();
}
