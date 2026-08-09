import { ASPECT_RATIOS } from '@/lib/config';
import { handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import {
  ARTIFACTS,
  DEFAULT_TEMPLATES,
  EVENT_PRESETS,
  KNOWN_USER_GROUPS,
  SEEDED_ROLES,
  WIKI_PALETTE,
} from '@/lib/presets';

export const dynamic = 'force-dynamic';

// Everything the campaign wizard and the canvas editor need to populate their
// pickers: seeded roles (§12.1), event presets (§8.1), the artifact library
// (ED-5), the wiki palette (ED-4) and the ratio list (ED-9).
export const GET = handler(async () => {
  await requireUser();
  return ok({
    roles: SEEDED_ROLES,
    eventPresets: EVENT_PRESETS,
    starterTemplates: DEFAULT_TEMPLATES,
    artifacts: ARTIFACTS,
    palette: WIKI_PALETTE,
    aspectRatios: ASPECT_RATIOS,
    userGroups: KNOWN_USER_GROUPS,
  });
});
