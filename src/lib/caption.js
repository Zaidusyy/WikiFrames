/**
 * BADGE-3 / CAP-4 — the exact text a participant shares.
 *
 * Kept in its own dependency-free module because both the server (when
 * returning the share text from the generate endpoint) and the browser (the
 * admin's live caption preview, and the participant's result screen) must
 * produce a byte-identical string. A second implementation would drift.
 */
export function composeCaption({ badgeText, caption, hashtags }) {
  const parts = [];
  if (badgeText) parts.push(`${badgeText} —`);
  if (caption) parts.push(caption);
  const body = parts.join(' ').trim();
  const tags = (hashtags || '').trim();
  return tags ? `${body}\n\n${tags}` : body;
}
