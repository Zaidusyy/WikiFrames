import { bestContrastColor, contrastRatio, WCAG_AA_LARGE, WCAG_AA_NORMAL } from './contrast';

/**
 * Frame Health Check — a design and accessibility linter for frames.
 *
 * A frame is seen by hundreds of people, mostly on phones, mostly once. These
 * rules catch what makes a frame fail there: text nobody can read (WCAG 2.1
 * contrast, the standard Wikimedia's own interfaces are held to), text so
 * small it vanishes at phone size, content under the story UI or cut off at
 * the edges, a badge sitting on someone's face, blurry upscaled images, and
 * openly licensed artwork used without the credit its licence requires.
 *
 * Pure: it inspects a plain description of the canvas (see describeScene in
 * the editor), so the rules are unit-testable without a browser.
 *
 * Scene shape:
 *   { width, height, editable, aspectRatio, background,
 *     objects: [{ index, role, name, kind, visible, bbox: {x,y,w,h},
 *                 color, behind, fontSize, bold, text,
 *                 upscale, attribution, isCredit }] }
 */

export const SAFE_MARGIN = 0.05;
// A phone shows a post roughly 360 CSS px wide; WCAG "large text" is 24px
// (or 18.66px bold), and 12px is about the smallest anyone can read.
const PHONE_WIDTH_PX = 360;

const SEVERITY_WEIGHT = { error: 25, warning: 8, info: 2 };

function area(r) {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

function overlap(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? w * h : 0;
}

function phonePx(canvasPx, width) {
  return (canvasPx * PHONE_WIDTH_PX) / width;
}

export function analyzeFrame(scene, { palette = ['#ffffff', '#202122'] } = {}) {
  const { width: W, height: H } = scene;
  const canvas = { x: 0, y: 0, w: W, h: H };
  const safe = { x: W * SAFE_MARGIN, y: H * SAFE_MARGIN, w: W * (1 - 2 * SAFE_MARGIN), h: H * (1 - 2 * SAFE_MARGIN) };
  const issues = [];
  const add = (issue) => issues.push({ id: `${issue.rule}:${issue.objectIndex ?? 'canvas'}`, ...issue });

  const visible = scene.objects.filter((o) => o.visible !== false);
  const cutout = visible.find((o) => o.role === 'cutout');
  const badge = visible.find((o) => o.role === 'badge');

  // ── the photo hole ────────────────────────────────────────────────────────
  if (scene.editable && !cutout) {
    add({
      rule: 'cutout-missing',
      severity: 'error',
      title: 'No photo cutout',
      detail: 'Participants’ photos show through the cutout. Without one, nobody’s photo appears on the frame.',
      fix: { kind: 'add-cutout' },
    });
  }
  if (cutout) {
    const shown = overlap(cutout.bbox, canvas) / Math.max(1, area(cutout.bbox));
    if (shown < 0.8) {
      add({
        rule: 'cutout-offcanvas',
        severity: 'warning',
        title: 'Cutout runs off the frame',
        detail: `Only ${Math.round(shown * 100)}% of the photo hole is on the canvas, so part of every face would be cut off.`,
        objectIndex: cutout.index,
        fix: { kind: 'fit-in-safe-area', objectIndex: cutout.index },
      });
    }
    const minSide = Math.min(W, H);
    if (Math.min(cutout.bbox.w, cutout.bbox.h) < minSide * 0.25) {
      add({
        rule: 'cutout-small',
        severity: 'warning',
        title: 'Cutout is very small',
        detail: 'The photo is the reason people share a frame. Below about a quarter of the frame, faces become hard to recognise on a phone.',
        objectIndex: cutout.index,
      });
    }
  }

  // Anything stacked above the hole hides part of every participant's photo.
  if (cutout) {
    for (const o of visible) {
      if (o.index <= cutout.index || ['badge', 'cutout', 'base', 'credit'].includes(o.role) || o.kind === 'text') continue;
      if (overlap(o.bbox, cutout.bbox) > area(cutout.bbox) * 0.15) {
        add({
          rule: 'covers-photo',
          severity: 'warning',
          title: `Covers the photo: “${o.name || 'Layer'}”`,
          detail: 'This layer sits on top of the photo cutout, so it will hide part of every participant’s face.',
          objectIndex: o.index,
          fix: { kind: 'send-behind-cutout', objectIndex: o.index },
        });
      }
    }
  }

  // ── the role badge ────────────────────────────────────────────────────────
  if (!badge) {
    add({
      rule: 'badge-missing',
      severity: 'info',
      title: 'No badge zone',
      detail: 'If participants pick a role, their badge is placed at the default spot near the bottom. Add a badge zone to choose where it goes.',
      fix: { kind: 'add-badge' },
    });
  } else if (cutout && overlap(badge.bbox, cutout.bbox) > area(badge.bbox) * 0.15) {
    add({
      rule: 'badge-over-photo',
      severity: 'warning',
      title: 'Badge covers the photo',
      detail: 'The role badge overlaps the photo cutout, so it will sit on top of people’s faces.',
      objectIndex: badge.index,
      fix: { kind: 'move-below-cutout', objectIndex: badge.index },
    });
  }

  // ── text ──────────────────────────────────────────────────────────────────
  for (const o of visible) {
    if (o.kind !== 'text') continue;
    const label = o.name || 'Text';

    if (!String(o.text || '').trim()) {
      add({
        rule: 'text-empty',
        severity: 'info',
        title: `“${label}” is empty`,
        detail: 'An empty text layer does nothing on the frame.',
        objectIndex: o.index,
        fix: { kind: 'delete', objectIndex: o.index },
      });
      continue;
    }

    const sizeOnPhone = phonePx(o.fontSize || 0, W);
    const large = sizeOnPhone >= 24 || (o.bold && sizeOnPhone >= 18.66);
    const required = large ? WCAG_AA_LARGE : WCAG_AA_NORMAL;
    const ratio = o.color && o.behind ? contrastRatio(o.color, o.behind) : null;
    if (ratio !== null && ratio < required) {
      const best = bestContrastColor(o.behind, palette);
      add({
        rule: 'text-contrast',
        severity: ratio < 2 ? 'error' : 'warning',
        title: `Low contrast: “${truncate(o.text)}”`,
        detail: `Contrast is ${ratio.toFixed(1)}:1; ${large ? 'large' : 'body'} text needs at least ${required}:1 (WCAG 2.1 AA) to be readable for everyone, including people with low vision.`,
        objectIndex: o.index,
        fix: best && best.ratio >= required ? { kind: 'set-color', objectIndex: o.index, color: best.color } : undefined,
      });
    }

    if (sizeOnPhone < 12) {
      add({
        rule: 'text-tiny',
        severity: 'warning',
        title: `Too small on a phone: “${truncate(o.text)}”`,
        detail: `On a phone this text is about ${Math.round(sizeOnPhone)}px tall — below the ~12px most people can read.`,
        objectIndex: o.index,
        fix: { kind: 'set-font-size', objectIndex: o.index, fontSize: Math.ceil((12 * W) / PHONE_WIDTH_PX) },
      });
    }

    if (overlap(o.bbox, safe) < area(o.bbox) - 1) {
      add({
        rule: 'text-edge',
        severity: 'warning',
        title: `Close to the edge: “${truncate(o.text)}”`,
        detail: 'Apps crop and round the corners of shared images. Keep text inside the safe area (5% in from every edge).',
        objectIndex: o.index,
        fix: { kind: 'fit-in-safe-area', objectIndex: o.index },
      });
    }

    if (cutout && o.role !== 'credit' && overlap(o.bbox, cutout.bbox) > area(o.bbox) * 0.2) {
      add({
        rule: 'text-over-photo',
        severity: 'warning',
        title: `Text over the photo: “${truncate(o.text)}”`,
        detail: 'Nobody knows what each participant’s photo will look like, so text over it may be unreadable for some of them.',
        objectIndex: o.index,
      });
    }
  }

  // ── platform safe zones ───────────────────────────────────────────────────
  if (scene.aspectRatio === '9:16') {
    const top = { x: 0, y: 0, w: W, h: H * 0.14 };
    const bottom = { x: 0, y: H * 0.8, w: W, h: H * 0.2 };
    for (const o of visible) {
      if (o.kind !== 'text' && o.role !== 'badge') continue;
      if (overlap(o.bbox, top) > area(o.bbox) * 0.3 || overlap(o.bbox, bottom) > area(o.bbox) * 0.3) {
        add({
          rule: 'story-ui',
          severity: 'info',
          title: `Under the story controls: “${o.name || (o.kind === 'text' ? truncate(o.text) : 'Badge zone')}”`,
          detail: 'In Instagram and WhatsApp stories the top ~14% and bottom ~20% are covered by the app’s own buttons. Turn on Safe zones to see them.',
          objectIndex: o.index,
        });
      }
    }
  }

  // ── layers ────────────────────────────────────────────────────────────────
  for (const o of visible) {
    if (o.role === 'base') continue;
    if (overlap(o.bbox, canvas) === 0) {
      add({
        rule: 'offcanvas',
        severity: 'warning',
        title: `Off the frame: “${o.name || 'Layer'}”`,
        detail: 'This layer is entirely outside the canvas, so it never appears on anyone’s image.',
        objectIndex: o.index,
        fix: { kind: 'fit-in-safe-area', objectIndex: o.index },
      });
    }
    if (o.kind === 'image' && o.upscale > 1.6) {
      add({
        rule: 'image-blurry',
        severity: 'warning',
        title: `Blurry image: “${o.name || 'Image'}”`,
        detail: `It is shown at ${o.upscale.toFixed(1)}× its real resolution, so it will look soft or pixelated. Use a larger original, or make it smaller.`,
        objectIndex: o.index,
      });
    }
  }

  // ── licences ──────────────────────────────────────────────────────────────
  const needsCredit = visible.filter((o) => o.attribution && o.attribution.attributionRequired !== false);
  const hasCreditLine = visible.some((o) => o.isCredit && String(o.text || '').trim());
  if (needsCredit.length && !hasCreditLine) {
    add({
      rule: 'credit-missing',
      severity: 'warning',
      title: needsCredit.length === 1 ? 'Credit the artwork' : `Credit ${needsCredit.length} artworks`,
      detail:
        'Openly licensed images (CC BY, CC BY-SA…) must be credited wherever they are shared — and every participant shares this frame. Add a small credit line to the frame.',
      fix: { kind: 'add-credit' },
    });
  }

  const hidden = scene.objects.filter((o) => o.visible === false && o.role !== 'badge');
  if (hidden.length) {
    add({
      rule: 'hidden-layers',
      severity: 'info',
      title: `${hidden.length} hidden layer${hidden.length === 1 ? '' : 's'}`,
      detail: 'Hidden layers are not part of the frame participants receive.',
    });
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    issues,
    errors: counts.error,
    warnings: counts.warning,
    infos: counts.info,
    score: Math.max(0, 100 - penalty),
  };
}

function truncate(text, max = 28) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
