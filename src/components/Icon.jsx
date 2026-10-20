import * as codex from '@/components/icons/codex';
import * as wikiframes from '@/components/icons/wikiframes';

const ICONS = { ...codex, ...wikiframes };

const SIZES = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 };

/**
 * An icon from the Codex set (the Wikimedia Design System) or from the small
 * WikiFrames supplement drawn on the same grid.
 *
 * Renders trusted, build-time SVG path data — the same approach Codex's own
 * CdxIcon takes. Never pass user content here.
 *
 *   <Icon name="cdxIconDownload" />
 *   <Icon name="cdxIconAlert" size="sm" label="Warning" />
 *
 * Decorative by default (aria-hidden); give it a `label` when the icon is the
 * only thing that carries the meaning.
 */
export default function Icon({ name, size = 'md', label, className = '', dir = 'ltr' }) {
  const icon = ICONS[name];
  if (!icon) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[Icon] unknown icon "${name}"`);
    return null;
  }
  const markup = typeof icon === 'string' ? icon : (dir === 'rtl' && icon.rtl) || icon.ltr;
  const flip = typeof icon === 'object' && icon.flip && dir === 'rtl';
  const px = SIZES[size] ?? size;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width={px}
      height={px}
      fill="currentColor"
      className={`inline-block shrink-0 ${flip ? '-scale-x-100' : ''} ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: label ? `<title>${escapeTitle(label)}</title>${markup}` : markup }}
    />
  );
}

function escapeTitle(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
