// WCAG 2.x colour contrast — the maths behind the Frame Health Check's
// legibility rules. Pure and dependency-free so it can be unit tested.
// https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  let m = value.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: clamp255(+m[1]), g: clamp255(+m[2]), b: clamp255(+m[3]), a: Math.min(1, Math.max(0, alpha)) };
  }
  if (value === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (value === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

function clamp255(v) {
  return Math.min(255, Math.max(0, Math.round(v)));
}

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Composites a translucent colour over an opaque one. */
export function blendOver(fg, bg) {
  const a = fg.a ?? 1;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function channel(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours (1–21). Translucent text is blended first. */
export function contrastRatio(foreground, background) {
  const bg = typeof background === 'string' ? parseColor(background) : background;
  let fg = typeof foreground === 'string' ? parseColor(foreground) : foreground;
  if (!fg || !bg) return null;
  const opaqueBg = bg.a < 1 ? blendOver(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  if ((fg.a ?? 1) < 1) fg = blendOver(fg, opaqueBg);
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(opaqueBg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** The palette colour with the most contrast against `background`. */
export function bestContrastColor(background, palette) {
  let best = null;
  for (const color of palette) {
    const ratio = contrastRatio(color, background);
    if (ratio !== null && (!best || ratio > best.ratio)) best = { color, ratio };
  }
  return best;
}
