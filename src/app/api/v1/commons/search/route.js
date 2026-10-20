import { handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { enforce } from '@/lib/ratelimit';
import { searchCommons } from '@/lib/commons';

export const dynamic = 'force-dynamic';

/**
 * The canvas editor's media library: free-licensed images and drawings from
 * Wikimedia Commons, searchable without leaving the editor. Results carry
 * their licence and author so attribution can follow the image wherever the
 * organizer puts it.
 */
export const GET = handler(async (req) => {
  const user = await requireUser();
  // Results are cached for ten minutes, so this mostly protects Commons.
  enforce(`commons-search:${user.id}`, 300);

  const url = new URL(req.url);
  const result = await searchCommons(url.searchParams.get('q'), {
    offset: url.searchParams.get('offset'),
    limit: url.searchParams.get('limit'),
  });
  return ok(result, { headers: { 'Cache-Control': 'private, max-age=300' } });
});
